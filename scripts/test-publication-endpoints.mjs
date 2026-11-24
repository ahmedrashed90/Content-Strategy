/** Offline Marketing -> Strategy API integration test using in-memory Firebase Admin. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Writable } from 'node:stream';

// Stub ONLY firebase-admin dependency resolution in this test process.
const adminMocks={
 'firebase-admin/app':`export const getApps=()=>[{}];export const cert=()=>({});export const initializeApp=()=>({});`,
 'firebase-admin/firestore':`export const getFirestore=()=>globalThis.__testPublicationDb;export const FieldValue={serverTimestamp:()=>({toDate:()=>new Date('2026-11-21T00:00:00Z')})};`,
 'firebase-admin/auth':`export const getAuth=()=>({verifyIdToken:async(token)=>{if(token==='${'T'.repeat(120)}')return {uid:'test-owner'};throw Error('bad session')}});`,
};
registerHooks({resolve(spec,ctx,next){
 if(Object.hasOwn(adminMocks,spec))return {url:`data:text/javascript,${encodeURIComponent(adminMocks[spec])}`,shortCircuit:true};
 return next(spec,ctx);
}});

const database=new Map();
function ref(path){return {path,id:path.split('/').at(-1),collection(name){return collection(`${path}/${name}`);},async get(){const value=database.get(path);return {id:this.id,exists:!!value,data:()=>value};}};}
function collection(path){return {
 doc(id){return ref(`${path}/${id}`);},
 orderBy(){return this;},limit(){return this;},
 async get(){return {docs:[...database].filter(([name])=>name.startsWith(path+'/')&&name.split('/').length===path.split('/').length+1).map(([name,value])=>({id:name.split('/').at(-1),data:()=>value}))};}
};}
const db={collection, async recursiveDelete(doc){for(const name of [...database.keys()])if(name===doc.path||name.startsWith(doc.path+'/'))database.delete(name);}, batch(){const operations=[];return {set(doc,value){operations.push([doc.path,value]);},async commit(){for(const [name,data] of operations)database.set(name,data);}};},
 async getAll(...docs){return Promise.all(docs.map(d=>d.get()));}};
globalThis.__testPublicationDb=db;
process.env.MZJ_STRATEGY_OWNER_UID='test-owner';
process.env.MZJ_STRATEGY_PUBLISH_SYNC_KEY='S'.repeat(48);
process.env.MZJ_STRATEGY_READ_KEY='R'.repeat(48);
process.env.MZJ_STRATEGY_ASSIGN_KEY='A'.repeat(48);
process.env.MZJ_MARKETING_API_BASE_URL='https://marketing.example.com';
const {default:receive}=await import('../api/marketing-agenda-sync.js');
const {default:agendas}=await import('../api/publication-agendas.js');
const {default:media}=await import('../api/publication-media.js');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const planId=uuid(1),postId=uuid(2),typeId=uuid(3),platformId=uuid(4),taskId=uuid(5),fileId=uuid(6);
const entry=(i,ready)=>({id:`${uuid(i+10)}:${typeId}`,lineId:uuid(i+10),productId:uuid(i+20),taskId,taskNo:'TSK-000222',taskName:'محتوى الشهر',requestNo:`TSK-000222-0${i+1}`,requirementNumber:i+1,ideaName:'فكرة',productIdea:'عملية التمويل: حاسبة التقسيط',ideaCode:'I-3',mediaKind:'video',scheduledOn:'2026-12-05',
 platform:{id:platformId,code:'insta',name:'Instagram'},postType:{id:typeId,name:'ريل',width:1080,height:1920},
 caption:'إعلان الشهر',hashtags:'#MZJ',publishStatus:null,fileStatus:ready?'ready':'waiting_file',
 files:ready?[{id:fileId,name:'final-video.mp4',mimeType:'video/mp4',fileSize:3,formatId:typeId,width:1080,height:1920,downloadPath:'do-not-trust'}]:[]});
const payload={ok:true,schema:'mzj-agenda-publishing/v1',sourceSystem:'mzj-marketing',
 agenda:{id:planId,planNo:'AG-12',name:'أجندة شهر 12',publishFrom:'2026-12-01',publishTo:'2026-12-31',reviewStatus:'approved',updatedAt:'2026-11-21T00:00:00Z'},
 entries:[entry(0,true),entry(1,false)],totals:{posts:2,ready:1,waiting:1,incomplete:0}};
class FakeRes extends Writable{
 constructor(){super();this.httpCode=200;this.headers={};this.content=null;this.chunks=[];}
 setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;}
 status(code){this.httpCode=code;return this;}
 json(obj){this.content=obj;return this;}
 _write(chunk,enc,cb){this.chunks.push(Buffer.from(chunk));cb();}
}
const owner=`Bearer ${'T'.repeat(120)}`,key=`Bearer ${'S'.repeat(48)}`;
async function request(fn,{method='GET',query={},body,authorization='',length}={}){
 const req={method,query,body,headers:{authorization,...(length?{'content-length':String(length)}:{})}};
 const res=new FakeRes();await fn(req,res);return res;
}
let result=await request(receive,{method:'POST',body:payload,authorization:'Bearer bad'});
assert.equal(result.httpCode,401);assert.equal(database.size,0);
result=await request(receive,{method:'POST',body:payload,authorization:key});
assert.equal(result.httpCode,200);assert.deepEqual({id:result.content.agendaId,received:result.content.received},{id:planId,received:2});
const firstDocs=database.size;
result=await request(receive,{method:'POST',body:payload,authorization:key});assert.equal(result.content.unchanged,true);assert.equal(database.size,firstDocs);
result=await request(agendas,{authorization:'Bearer invalid'});assert.equal(result.httpCode,401);
result=await request(agendas,{authorization:owner});assert.equal(result.httpCode,200);assert.equal(result.content.agendas.length,1);
result=await request(agendas,{query:{agendaId:planId},authorization:owner});
assert.equal(result.content.entries.length,2);assert.equal(result.content.totals.waiting,1);
assert.equal(result.content.entries[0].productIdea,'عملية التمويل: حاسبة التقسيط','exact idea is stored for the publishing page');
// Copy is editable only by the owner, in Strategy storage, and belongs to one
// existing posting slot. It survives a later Marketing snapshot refresh.
const copy={action:'save-copy',agendaId:planId,entryId:payload.entries[0].id,
  caption:'كابشن معدل في الاستراتيجية فقط',hashtags:'#MZJ #نشر'};
result=await request(agendas,{method:'POST',authorization:key,body:copy});
assert.equal(result.httpCode,401,'the Marketing integration key cannot edit publication copy');
result=await request(agendas,{method:'POST',authorization:owner,body:{...copy,entryId:`${uuid(777)}:${typeId}`}});
assert.equal(result.httpCode,404,'unknown posts cannot be edited');
result=await request(agendas,{method:'POST',authorization:owner,body:{...copy,caption:'A'.repeat(60001)}});
assert.equal(result.httpCode,400,'copy limits are enforced');
result=await request(agendas,{method:'POST',authorization:owner,body:copy});
assert.equal(result.httpCode,200);assert.equal(result.content.caption,copy.caption);
result=await request(agendas,{query:{agendaId:planId},authorization:owner});
assert.equal(result.content.entries[0].caption,copy.caption);
assert.equal(result.content.entries[0].hashtags,copy.hashtags);
assert.equal(result.content.entries[0].strategyCopyEdited,true);
assert.equal(result.content.entries[1].caption,'إعلان الشهر','other posts stay untouched');
// True Marketing work_items.idea text is not present in v1 snapshots.
// Owner can correct it once per product in Strategy; never writes to Marketing.
const correctIdea={action:'save-idea',agendaId:planId,productId:payload.entries[0].productId,
  title:'عملية التمويل: حاسبة التقسيط'};
result=await request(agendas,{method:'POST',authorization:key,body:correctIdea});
assert.equal(result.httpCode,401,'Marketing secret cannot change Strategy idea names');
result=await request(agendas,{method:'POST',authorization:owner,body:{...correctIdea,productId:uuid(999)}});
assert.equal(result.httpCode,404,'unlinked product cannot be renamed');
result=await request(agendas,{method:'POST',authorization:owner,body:{...correctIdea,title:'  '}});
assert.equal(result.httpCode,400,'empty idea name rejected');
result=await request(agendas,{method:'POST',authorization:owner,body:correctIdea});
assert.equal(result.httpCode,200);
result=await request(agendas,{query:{agendaId:planId},authorization:owner});
assert.equal(result.content.entries[0].strategyIdeaTitle,correctIdea.title);
assert.equal(result.content.entries[1].strategyIdeaTitle,undefined,'other products retain their own idea title');
const originalFetch=globalThis.fetch;
const callLog=[];
globalThis.fetch=async(url,opts)=>{
 callLog.push({url:String(url),opts});
 if(String(url).includes('publication-agenda'))return new Response(JSON.stringify({...payload,entries:[entry(0,true),entry(1,true)]}),{status:200,headers:{'Content-Type':'application/json'}});
 if(String(url).includes('publication-file'))return new Response(new Uint8Array([7,8,9]),{status:200,headers:{'Content-Type':'video/mp4','Content-Length':'3'}});
 throw Error('Unexpected endpoint');
};
try{
  result=await request(agendas,{method:'POST',authorization:owner,body:{action:'refresh',agendaId:planId}});
  assert.equal(result.httpCode,200);assert.equal(result.content.received,2);
  result=await request(agendas,{query:{agendaId:planId},authorization:owner});
  assert.equal(result.content.totals.ready,2);assert.equal(result.content.totals.waiting,0);
  assert.equal(result.content.entries[0].caption,copy.caption,'Strategy copy remains after fresh Marketing revision');
  assert.equal(result.content.entries[0].hashtags,copy.hashtags);
  assert.equal(result.content.entries[0].strategyIdeaTitle,correctIdea.title,'strategy idea corrections persist after Marketing refresh');
  result=await request(media,{query:{agendaId:planId,fileId},authorization:'Bearer invalid'});assert.equal(result.httpCode,401);
  result=await request(media,{query:{agendaId:planId,fileId:uuid(99)},authorization:owner});assert.equal(result.httpCode,404);
  result=await request(media,{query:{agendaId:planId,fileId},authorization:owner});
  assert.equal(result.httpCode,200);assert.deepEqual(Buffer.concat(result.chunks),Buffer.from([7,8,9]));
  assert.equal(result.headers['content-type'],'video/mp4');
  assert.equal(callLog.length,2);assert(callLog.every(c=>c.opts.headers.Authorization===key));
  assert(callLog[1].url.includes('publication-file?planId='));
  // Deleting the synced agenda requires the Strategy owner and leaves all
  // unrelated Strategy data + Marketing data untouched.
  database.set('contentPlans/another-plan/ideas/keep-me',{value:'untouched'});
  result=await request(agendas,{method:'DELETE',query:{agendaId:planId},authorization:key});
  assert.equal(result.httpCode,401,'Marketing API key cannot delete agendas');
  result=await request(agendas,{method:'DELETE',query:{agendaId:'invalid'},authorization:owner});
  assert.equal(result.httpCode,400,'invalid agenda ID is rejected');
  result=await request(agendas,{method:'DELETE',query:{agendaId:uuid(999)},authorization:owner});
  assert.equal(result.httpCode,404,'unknown agenda cannot be deleted');
  result=await request(agendas,{method:'DELETE',query:{agendaId:planId},authorization:owner});
  assert.equal(result.httpCode,200);
  assert.equal(result.content.deleted,true);
  assert.equal(database.has('contentPlans/another-plan/ideas/keep-me'),true,'unrelated Strategy documents untouched');
  const agendaPath=`contentPlans/mzj-2026-launch-cycle-01/marketingPublishingAgendas/${planId}`;
  assert.equal([...database.keys()].filter(p=>p===agendaPath||p.startsWith(agendaPath+'/')).length,0,'all revisions and copy/idea overrides deleted');
  result=await request(agendas,{authorization:owner});assert.equal(result.content.agendas.length,0);
  result=await request(agendas,{authorization:owner,query:{agendaId:planId}});assert.equal(result.httpCode,404);
  // Marketing may explicitly re-sync later, but historical owner edits must
  // not reappear after that re-sync.
  result=await request(receive,{method:'POST',body:payload,authorization:key});assert.equal(result.httpCode,200);
  result=await request(agendas,{authorization:owner,query:{agendaId:planId}});
  assert.equal(result.content.entries[0].productIdea,'عملية التمويل: حاسبة التقسيط');
  assert.equal(result.content.entries[0].strategyIdeaTitle,undefined);
  assert.equal(result.content.entries[0].strategyCopyEdited,undefined);
  console.log('PASS: owner-only delete scoped to synced publishing agenda, nested revisions/overrides removed, unrelated data preserved, clean explicit re-sync');
}finally{globalThis.fetch=originalFetch;delete globalThis.__testPublicationDb;}
