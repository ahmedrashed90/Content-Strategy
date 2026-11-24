/** Admin-only isolated publishing agendas. Never writes existing plan posts/assets/CRM. */
import { timingSafeEqual } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { UUID, normalizePublicationSnapshot, publicationRevision, splitPublicationEntries } from '../lib/publication-contract.js';

const PLAN_ID = 'mzj-2026-launch-cycle-01';
export const env = name => String(process.env[name]||'').trim();
export function json(res,status,body){res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body);}
export class PublicationError extends Error { constructor(status,message){super(message);this.status=status;} }
export function uuid(value){return typeof value==='string' && UUID.test(value);}

export function requireSyncKey(req){
  const configured=env('MZJ_STRATEGY_PUBLISH_SYNC_KEY');
  if(configured.length<32||configured.length>512||configured===env('MZJ_STRATEGY_READ_KEY')||configured===env('MZJ_STRATEGY_ASSIGN_KEY'))
    throw new PublicationError(503,'مفتاح مزامنة النشر غير مهيأ على سيرفر الاستراتيجية');
  const candidate=/^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(String(req.headers?.authorization||''))?.[1]||'';
  const left=Buffer.from(configured),right=Buffer.from(candidate);
  if(left.length!==right.length||!timingSafeEqual(left,right)) throw new PublicationError(401,'مفتاح مزامنة غير مصرح به');
}
function services(){
  if(!getApps().length){
    const projectId=env('MZJ_STRATEGY_FIREBASE_PROJECT_ID'),clientEmail=env('MZJ_FIREBASE_CLIENT_EMAIL');
    const privateKey=env('MZJ_FIREBASE_PRIVATE_KEY').replace(/\\n/g,'\n');
    if(!projectId||!clientEmail||!privateKey)throw new PublicationError(503,'Firebase Admin غير مهيأ');
    initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId});
  }
  return {db:getFirestore(),auth:getAuth()};
}
export async function requireOwner(req){
  const owner=env('MZJ_STRATEGY_OWNER_UID');
  if(!owner)throw new PublicationError(503,'مالك الاستراتيجية غير مهيأ');
  const token=/^Bearer ([A-Za-z0-9._-]{100,6500})$/.exec(String(req.headers?.authorization||''))?.[1];
  if(!token)throw new PublicationError(401,'يلزم تسجيل الدخول لصاحب الاستراتيجية');
  try{const decoded=await services().auth.verifyIdToken(token);if(decoded.uid!==owner)throw Error('Wrong owner');}
  catch{throw new PublicationError(401,'جلسة مستخدم غير مصرح بها');}
}
export function agendaRef(id){
  if(!uuid(id))throw new PublicationError(400,'معرّف الأجندة غير صالح');
  return services().db.collection('contentPlans').doc(PLAN_ID).collection('marketingPublishingAgendas').doc(id.toLowerCase());
}
export async function storeSnapshot(raw){
  const normalized=normalizePublicationSnapshot(raw);
  const parent=agendaRef(normalized.agenda.id);
  const version=publicationRevision(normalized);
  const previous=await parent.get();
  if(previous.exists&&previous.data().version===version)return {ok:true,agendaId:normalized.agenda.id,received:normalized.entries.length,unchanged:true};
  const chunks=splitPublicationEntries(normalized.entries);
  const batch=services().db.batch();
  chunks.forEach((rows,index)=>batch.set(parent.collection('revisions').doc(version).collection('blocks').doc(String(index).padStart(4,'0')),
    {index,entries:rows}));
  batch.set(parent,{id:normalized.agenda.id,schema:normalized.schema,sourceSystem:normalized.sourceSystem,
    agenda:normalized.agenda,totals:normalized.totals,entryCount:normalized.entries.length,
    version,blocks:chunks.length,syncedAt:FieldValue.serverTimestamp()});
  // Atomic manifest + immutable blocks means failed/partial syncs never appear on the page.
  await batch.commit();
  return {ok:true,agendaId:normalized.agenda.id,received:normalized.entries.length,unchanged:false};
}
/** Remove only the synced publishing copy and all nested revisions/owner overrides.
 * This intentionally never deletes an agenda, task, media or plan in Marketing
 * (or any other Strategy collection). A new explicit sync can restore it.
 */
export async function deletePublicationAgenda(id){
  const ref=agendaRef(id);
  if(!(await ref.get()).exists)throw new PublicationError(404,'الأجندة غير موجودة في صفحة النشر');
  await services().db.recursiveDelete(ref);
  return {ok:true,agendaId:ref.id,deleted:true};
}
export async function listAgendas(){
  const rows=await services().db.collection('contentPlans').doc(PLAN_ID).collection('marketingPublishingAgendas')
    .orderBy('syncedAt','desc').limit(150).get();
  return rows.docs.map(d=>{const v=d.data();return {id:d.id,agenda:v.agenda,totals:v.totals,
    entryCount:v.entryCount,syncedAt:v.syncedAt?.toDate?.()?.toISOString?.()||null};});
}
export async function agendaDetails(id){
  const ref=agendaRef(id),snap=await ref.get();
  if(!snap.exists)throw new PublicationError(404,'الأجندة لم تتم مزامنتها بعد');
  const data=snap.data();
  if(!/^[a-f0-9]{64}$/.test(data.version)||!Number.isSafeInteger(data.blocks)||data.blocks<1||data.blocks>100)
    throw new PublicationError(500,'بيانات المزامنة المحفوظة غير مكتملة');
  const col=ref.collection('revisions').doc(data.version).collection('blocks');
  const blockRefs=Array.from({length:data.blocks},(_,i)=>col.doc(String(i).padStart(4,'0')));
  const docs=await services().db.getAll(...blockRefs);
  if(docs.some(row=>!row.exists||!Array.isArray(row.data()?.entries)))throw new PublicationError(500,'أحد أجزاء الأجندة غير متاح');
  const entries=docs.flatMap(d=>d.data().entries);
  if(entries.length!==data.entryCount)throw new PublicationError(500,'عدد سجلات الأجندة غير متطابق');
  // Owner-edited publication copy belongs exclusively to Strategy. Keep it in
  // separate documents so every Marketing sync stays immutable and cannot erase
  // the owner's caption/hashtag edits.
  const edits=await ref.collection('postCopyOverrides').get();
  const copyById=new Map(edits.docs.map(d=>[d.id,d.data()]));
  const ideaEdits=await ref.collection('productIdeaOverrides').get();
  const ideaByProduct=new Map(ideaEdits.docs.map(d=>[d.id,d.data()]));
  const displayEntries=entries.map(entry=>{
    const copy=copyById.get(entry.id), idea=ideaByProduct.get(entry.productId);
    const copyFields=copy&&typeof copy.caption==='string'&&typeof copy.hashtags==='string'
      ?{caption:copy.caption,hashtags:copy.hashtags,strategyCopyEdited:true}:{};
    const ideaFields=idea&&typeof idea.title==='string'&&idea.title.trim()
      ?{strategyIdeaTitle:idea.title,strategyIdeaEdited:true}:{};
    return {...entry,...copyFields,...ideaFields};
  });
  return {id:ref.id,agenda:data.agenda,totals:data.totals,entries:displayEntries,
    syncedAt:data.syncedAt?.toDate?.()?.toISOString?.()||null,version:data.version};
}

/** Owner-only, per-product idea title correction for the publishing page.
 * The existing Marketing sync does not send work_items.idea (product_idea).
 * This independent override corrects the display without touching Marketing. */
export async function savePublicationIdeaTitle(agendaId,productId,title){
  if(!uuid(agendaId)||!uuid(productId))throw new PublicationError(400,'معرّف الأجندة أو الفكرة غير صالح');
  if(typeof title!=='string'||!title.trim()||title.trim().length>400)
    throw new PublicationError(400,'اكتب اسم فكرة المطلوب الصحيح (حتى 400 حرف)');
  const detail=await agendaDetails(agendaId);
  if(!detail.entries.some(row=>row.productId===productId))
    throw new PublicationError(404,'الفكرة غير موجودة داخل هذه الأجندة');
  const normalizedTitle=title.trim();
  const target=agendaRef(agendaId).collection('productIdeaOverrides').doc(productId.toLowerCase());
  const batch=services().db.batch();
  batch.set(target,{title:normalizedTitle,updatedAt:FieldValue.serverTimestamp()});
  await batch.commit();
  return {ok:true,productId:productId.toLowerCase(),title:normalizedTitle};
}

/** Save caption/hashtags for one verified posting slot, never into Marketing. */
export async function savePublicationCopy(agendaId,entryId,caption,hashtags){
  if(!uuid(agendaId)||typeof entryId!=='string'||
      !new RegExp(`^${UUID.source.slice(1,-1)}:(?:${UUID.source.slice(1,-1)}|unassigned)$`,'i').test(entryId))
    throw new PublicationError(400,'معرّف المنشور غير صالح');
  if(typeof caption!=='string'||caption.length>60000||typeof hashtags!=='string'||hashtags.length>30000)
    throw new PublicationError(400,'الكابشن أو الهاشتاج أكبر من الحد المسموح');
  const detail=await agendaDetails(agendaId);
  if(!detail.entries.some(entry=>entry.id===entryId))
    throw new PublicationError(404,'المنشور غير موجود في الأجندة المحددة');
  const ref=agendaRef(agendaId).collection('postCopyOverrides').doc(entryId);
  const batch=services().db.batch();
  batch.set(ref,{caption,hashtags,updatedAt:FieldValue.serverTimestamp()});
  await batch.commit();
  return {ok:true,entryId,caption,hashtags,strategyCopyEdited:true};
}
export function marketingOrigin(){
  const raw=env('MZJ_MARKETING_API_BASE_URL');
  if(!raw)throw new PublicationError(503,'عنوان سيرفر التسويق غير مهيأ');
  let url;try{url=new URL(raw);}catch{throw new PublicationError(503,'عنوان سيرفر التسويق غير صالح');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||
    (url.port&&url.port!=='443')||!/^[A-Za-z0-9.-]+$/.test(url.hostname)||!url.hostname.includes('.')||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname))
    throw new PublicationError(503,'عنوان سيرفر التسويق يجب أن يكون HTTPS صالحًا');
  return url.origin;
}
export function marketingKey(){
  const key=env('MZJ_STRATEGY_PUBLISH_SYNC_KEY');
  if(key.length<32||key.length>512)throw new PublicationError(503,'مفتاح النشر غير مهيأ');
  return key;
}
export async function fetchMarketingSnapshot(id){
  if(!uuid(id))throw new PublicationError(400,'معرّف الأجندة غير صالح');
  const url=new URL('/api/strategy-integration/publication-agenda',marketingOrigin());
  url.searchParams.set('planId',id);
  let res;
  try{res=await fetch(url,{headers:{Authorization:`Bearer ${marketingKey()}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new PublicationError(502,'تعذر الوصول لملفات أجندة التسويق');}
  if(!res.ok)throw new PublicationError(502,'لم يتمكن التسويق من تحديث الأجندة');
  const size=Number(res.headers.get('content-length')||0);
  if(size>2500000)throw new PublicationError(413,'حجم الأجندة أكبر من الحد المسموح');
  let raw;try{const body=await res.text();if(Buffer.byteLength(body,'utf8')>2500000)throw Error('too large');raw=JSON.parse(body);}
  catch{throw new PublicationError(502,'استجابة التسويق غير صالحة أو كبيرة جدًا');}
  if(String(raw?.agenda?.id||'').toLowerCase()!==id.toLowerCase())throw new PublicationError(502,'هوية الأجندة لا تطابق طلب التحديث');
  return raw;
}
