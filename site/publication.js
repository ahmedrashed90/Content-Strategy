/** Marketing-synced publication agendas: isolated UI and private binary media. */
import { connectFirebase } from './firebase.js';

const esc = raw => String(raw??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]);
const icon = (name,cls='ic-sm') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const statusText = {ready:'ملف جاهز',waiting_file:'بانتظار الملف النهائي',needs_publish_type:'نوع النشر ناقص',unsupported_storage:'الملف غير متاح من Drive'};
const statusKind = {ready:'ready',waiting_file:'waiting',needs_publish_type:'incomplete',unsupported_storage:'incomplete'};

export function newPublicationState(){return {
  agendas:[], agendaId:'', agendaView:'list', detail:null, loadState:'idle', loading:false, refreshing:false,
  error:'', mediaError:'', search:'', platform:'all', status:'all',
  media:null, mediaUrl:'', mediaBlob:null, mediaBusy:false, downloadingFileId:'',
  lastRefreshAt:null, fileListEntryId:'',
};}

async function publicationRequest(path,options={}) {
  const {auth}=await connectFirebase();
  const user=auth.currentUser;
  if(!user)throw Error('سجل الدخول إلى الاستراتيجية أولًا');
  const token=await user.getIdToken();
  const result=await fetch(path,{method:options.method||'GET',
    headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},
    ...(options.body?{body:JSON.stringify(options.body)}:{}),cache:'no-store',signal:options.signal});
  if(options.binary){
    if(!result.ok){const response=await result.json().catch(()=>null);throw Error(response?.error||'تعذر تحميل الملف النهائي الفعلي');}
    return result.blob();
  }
  const data=await result.json().catch(()=>null);
  if(!result.ok||!data?.ok)throw Error(data?.error||'تعذر قراءة بيانات النشر');
  return data;
}

export async function loadPublicationAgendas(state,selectId=''){
  if(state.loading)return;
  state.loading=true;state.error='';state.loadState='loading';
  try{
    const res=await publicationRequest('/api/publication-agendas');
    state.agendas=Array.isArray(res.agendas)?res.agendas:[];
    const id=selectId||(state.agendaView==='detail'?state.agendaId:'');
    if(id && state.agendas.some(a=>a.id===id))await loadPublicationAgenda(state,id);
    else {state.detail=null;state.agendaId='';state.agendaView='list';}
    state.loadState='ready';
  }catch(e){state.error=e?.message||'تعذر تحميل الأجندات';state.loadState='error';}
  finally{state.loading=false;}
}

export async function loadPublicationAgenda(state,id){
  if(!id)return;
  state.agendaId=id;state.agendaView='detail';state.fileListEntryId='';state.error='';
  try{
    const detail=await publicationRequest(`/api/publication-agendas?agendaId=${encodeURIComponent(id)}`);
    if(state.agendaId===id)state.detail=detail;
  }catch(e){state.error=e?.message||'تعذر فتح الأجندة';state.detail=null;}
}

export function closePublicationAgenda(state){
  resetPublicationMedia(state);
  state.agendaId='';state.agendaView='list';state.detail=null;state.fileListEntryId='';
  state.search='';state.platform='all';state.status='all';state.error='';
}

export async function refreshPublicationAgenda(state){
  if(!state.agendaId||state.refreshing||state.loading)return false;
  const id=state.agendaId;
  state.refreshing=true;state.error='';
  try{
    await publicationRequest('/api/publication-agendas',{method:'POST',body:{action:'refresh',agendaId:id}});
    if(state.agendaId===id){
      await loadPublicationAgenda(state,id);
      const data=await publicationRequest('/api/publication-agendas');
      state.agendas=Array.isArray(data.agendas)?data.agendas:state.agendas;
    }
    state.lastRefreshAt=new Date().toISOString();
    return true;
  }catch(e){state.error=e?.message||'تعذر تحديث الملفات النهائية';return false;}
  finally{state.refreshing=false;}
}

export function resetPublicationMedia(state){
  if(state.mediaUrl)URL.revokeObjectURL(state.mediaUrl);
  state.mediaUrl='';state.mediaBlob=null;state.media=null;state.mediaError='';state.mediaBusy=false;
}
function allEntries(state){return Array.isArray(state.detail?.entries)?state.detail.entries:[];}
export function publicationEntry(state,id){return allEntries(state).find(e=>e.id===id);}
export function publicationFile(state,entryId,fileId){return publicationEntry(state,entryId)?.files?.find(f=>f.id===fileId);}
export async function actualPublicationBlob(state,entryId,fileId){
  if(!state.agendaId||!publicationFile(state,entryId,fileId))throw Error('الملف غير موجود ضمن هذه الأجندة');
  return publicationRequest(`/api/publication-media?agendaId=${encodeURIComponent(state.agendaId)}&fileId=${encodeURIComponent(fileId)}`,{binary:true});
}
export async function previewPublicationMedia(state,entryId,fileId){
  if(state.mediaBusy)return;
  const file=publicationFile(state,entryId,fileId);
  if(!file)return;
  resetPublicationMedia(state);
  state.media={entryId,fileId,name:file.name,mimeType:file.mimeType};state.mediaBusy=true;
  try{
    const blob=await actualPublicationBlob(state,entryId,fileId);
    if(state.media?.fileId!==fileId)return;
    state.mediaBlob=blob;state.mediaUrl=URL.createObjectURL(blob);
  }catch(e){state.mediaError=e?.message||'تعذر معاينة الملف الفعلي';}
  finally{state.mediaBusy=false;}
}
function saveBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name||'MZJ-final-media';document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function downloadPublicationMedia(state,entryId,fileId,withCopy=false){
  const file=publicationFile(state,entryId,fileId);
  if(!file)throw Error('لا يوجد ملف جاهز للمطلوب');
  if(state.downloadingFileId)return;
  state.downloadingFileId=fileId;
  try{
    const blob=state.media?.fileId===fileId&&state.mediaBlob?state.mediaBlob:await actualPublicationBlob(state,entryId,fileId);
    saveBlob(blob,file.name);
    if(withCopy){
      const entry=publicationEntry(state,entryId);
      const text=[entry?.caption,entry?.hashtags].filter(Boolean).join('\n\n');
      if(text&&navigator.clipboard?.writeText){
        try{await navigator.clipboard.writeText(text);return 'تم تحميل الملف الفعلي ونسخ الكابشن والهاشتاج';}
        catch{ /* Clipboard permissions are optional. File download still succeeds. */ }
      }
      return 'تم تحميل الملف الفعلي للنشر، ويمكن نسخ النص من تفاصيل المنشور';
    }
    return 'تم تحميل الملف النهائي الفعلي';
  }finally{state.downloadingFileId='';}
}

function datetime(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value).slice(0,10):new Intl.DateTimeFormat('ar-EG-u-nu-latn',{timeZone:'Asia/Riyadh',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function entryStatus(row,entries=[]){
  const sourceNote=String(row.fileNote||'');
  let label=statusText[row.fileStatus]||row.fileStatus||'غير محدد';
  let note=sourceNote;
  if(row.fileStatus==='waiting_file'){
    if(/مرفوع.*اعتماد|لم يحصل على اعتماد/.test(sourceNote)) label='بانتظار اعتماد المقاس';
    else if(/لا يوجد ملف معتمد يطابق|مقاسات معتمدة متاحة/.test(sourceNote)) label='مقاس غير مطابق';
    else {
      const available=entries.filter(e=>e.productId===row.productId&&e.fileStatus==='ready')
        .flatMap(e=>e.files||[]).map(f=>f.width&&f.height?`${f.width}×${f.height}`:'').filter(Boolean);
      const sizes=[...new Set(available)];
      const requested=row.postType?.width&&row.postType?.height?`${row.postType.width}×${row.postType.height}`:'';
      if(requested&&sizes.length&&!sizes.includes(requested)){
        label='المقاس المطلوب غير متاح';
        note=[sourceNote,`مقاسات جاهزة لنفس المطلوب: ${sizes.join('، ')}`].filter(Boolean).join(' — ');
      }else if(/لم يتم العثور على ملف نهائي مرفوع/.test(sourceNote)) label='لا يوجد ملف مرفوع';
    }
  }
  return `<span class="pub-status pub-${statusKind[row.fileStatus]||'incomplete'}" title="${esc(note||label)}" aria-label="${esc(label)}">${icon(row.fileStatus==='ready'?'check':row.fileStatus==='waiting_file'?'clock':'alert')} ${esc(label)}</span>`;
}
function fileActionButtons(row,f){
  return `<button class="pub-icon-btn" data-action="pub-preview" data-entry="${esc(row.id)}" data-file="${esc(f.id)}" title="معاينة الملف" aria-label="معاينة ${esc(f.name)}">${icon('eye')}</button>
    <button class="pub-icon-btn" data-action="pub-download" data-entry="${esc(row.id)}" data-file="${esc(f.id)}" title="تنزيل الملف" aria-label="تنزيل ${esc(f.name)}">${icon('download')}</button>
    <button class="pub-use-btn" data-action="pub-use" data-entry="${esc(row.id)}" data-file="${esc(f.id)}" title="تنزيل الملف ونسخ النص">للنشر</button>`;
}
function fileControls(row){
  if(!row.files?.length)return `<span class="pub-missing" title="${esc(row.fileNote||'لم يتوفر ملف للنشر')}">${icon('clock')} غير متوفر</span>`;
  if(row.files.length>1)return `<button class="pub-files-trigger" data-action="pub-files-open" data-entry="${esc(row.id)}" title="فتح كل ملفات المنشور">${icon('file')} ${row.files.length} ملفات ${icon('arrow')}</button>`;
  const f=row.files[0];
  return `<div class="pub-file-compact"><span class="pub-file-name" title="${esc(f.name)}">${icon('file')} <bdi dir="ltr">${esc(f.name)}</bdi></span>
    <div class="pub-file-buttons">${fileActionButtons(row,f)}</div></div>`;
}
function captionText(row){return `<div class="pub-caption">${row.caption?`<span title="${esc(row.caption)}">${esc(row.caption)}</span>`:''}${row.hashtags?`<small title="${esc(row.hashtags)}">${esc(row.hashtags)}</small>`:''}${(!row.caption&&!row.hashtags)?'<small>لا يوجد نص</small>':''}
    ${(row.caption||row.hashtags)?`<button class="pub-copy" data-action="pub-copy" data-entry="${esc(row.id)}" title="نسخ الكابشن والهاشتاج">نسخ النص</button>`:''}</div>`;}
function agendaData(state){return state.detail?.agenda||state.agendas.find(a=>a.id===state.agendaId)?.agenda;}
function agendaCards(state){
  if(!state.agendas.length)return `<div class="pub-empty">لا توجد أجندات تمت مزامنتها بعد.</div>`;
  return `<div class="pub-table-scroll"><table class="pub-agendas-table"><thead><tr><th>الأجندة</th><th>بداية النشر</th><th>نهاية النشر</th><th>المنشورات</th><th>ملفات جاهزة</th><th>بانتظار ملف</th><th>آخر مزامنة</th><th></th></tr></thead><tbody>${state.agendas.map(row=>{
    const a=row.agenda||{},t=row.totals||{};
    return `<tr><td><strong>${esc(a.name||'أجندة بدون اسم')}</strong>${a.planNo?`<small dir="ltr">${esc(a.planNo)}</small>`:''}</td><td dir="ltr">${esc(a.publishFrom||'—')}</td><td dir="ltr">${esc(a.publishTo||'—')}</td>
      <td><b>${Number(t.posts??row.entryCount??0)}</b></td><td class="pub-ready-count">${Number(t.ready||0)}</td><td class="pub-wait-count">${Number(t.waiting||0)}</td><td>${esc(datetime(row.syncedAt))}</td>
      <td><button class="pub-open-agenda" data-action="pub-open-agenda" data-agenda="${esc(row.id)}">عرض المنشورات ${icon('arrow')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function dayHeading(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return String(value||'غير محدد');
  const date=new Date(`${value}T12:00:00Z`);
  if(Number.isNaN(date.valueOf()))return value;
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}
function dayGroups(rows){
  const groups=new Map();
  for(const row of rows){
    const date=String(row.scheduledOn||'');
    if(!groups.has(date))groups.set(date,[]);
    groups.get(date).push(row);
  }
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([date,posts])=>({date,posts}));
}
function postRow(row,all){
  const kind=row.mediaKind==='video'?'فيديو':row.mediaKind==='image'?'صورة':row.mediaKind||'—';
  const ideaName=row.ideaName||'—';
  const requirement=row.requirementNumber?`المطلوب ${row.requirementNumber}`:'المطلوب';
  const size=row.postType?.width&&row.postType?.height?`${row.postType.width} × ${row.postType.height}`:'—';
  return `<div class="pub-day-post" role="row" data-entry="${esc(row.id)}">
    <div role="cell" class="pub-post-request"><bdi dir="ltr">${esc(row.requestNo||row.taskNo||'—')}</bdi></div>
    <div role="cell" class="pub-post-idea" title="${esc(ideaName)}"><strong>${esc(ideaName)}</strong>${row.ideaCode?`<small dir="ltr">${esc(row.ideaCode)}</small>`:''}</div>
    <div role="cell" class="pub-post-task" title="${esc(row.taskName||'')}"><strong>${esc(requirement)}</strong><small>${esc(kind)}${row.taskName?` · ${esc(row.taskName)}`:''}</small></div>
    <div role="cell" class="pub-post-platform"><strong>${esc(row.platform?.name||'غير محدد')}</strong><small>${esc(row.postType?.name||'غير محدد')}</small></div>
    <div role="cell"><bdi class="pub-dim" dir="ltr">${esc(size)}</bdi></div>
    <div role="cell">${captionText(row)}</div>
    <div role="cell" class="pub-file-cell">${fileControls(row)}</div>
    <div role="cell" class="pub-post-status">${entryStatus(row,all)}</div>
  </div>`;
}
function detailedAgenda(state){
  const rows=allEntries(state),agenda=agendaData(state);
  const platforms=[...new Set(rows.map(e=>e.platform?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
  const q=state.search.trim().toLocaleLowerCase('ar');
  const filtered=rows.filter(row=>{
    if(state.status!=='all'&&row.fileStatus!==state.status)return false;
    if(state.platform!=='all'&&row.platform?.name!==state.platform)return false;
    if(!q)return true;
    return [row.requestNo,row.ideaName,row.taskName,row.ideaCode,row.mediaKind,row.scheduledOn,row.platform?.name,row.postType?.name,row.caption,row.hashtags].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q));
  });
  const dates=dayGroups(filtered);
  return `<div class="pub-toolbar"><div class="pub-toolbar-identity"><button class="pub-back" data-action="pub-back">${icon('arrow')} كل الأجندات</button><strong title="${esc(agenda?.name||'')}">${esc(agenda?.name||'أجندة')}</strong><span class="pub-toolbar-range" dir="ltr">${esc(agenda?.publishFrom||'')} — ${esc(agenda?.publishTo||'')}</span><span class="pub-toolbar-count">${rows.length} منشور</span></div>
      <div class="pub-toolbar-actions"><button class="btn" data-action="pub-reload" ${state.loading?'disabled':''}>${icon('refresh')} تحديث البيانات</button>
      <button class="btn btn-primary" data-action="pub-refresh" ${state.refreshing||state.loading?'disabled':''}>${icon('refresh')} ${state.refreshing?'جارٍ التحديث':'تحديث جاهزية الملفات'}</button></div></div>
    <div class="pub-filters"><input id="pub-search" type="search" aria-label="بحث في المنشورات" placeholder="بحث برقم الطلب أو اسم الفكرة أو المنصة أو المحتوى" value="${esc(state.search)}" />
      <select id="pub-platform" aria-label="فلتر المنصة"><option value="all">كل المنصات</option>${platforms.map(p=>`<option value="${esc(p)}" ${state.platform===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
      <select id="pub-status" aria-label="فلتر حالة الملف"><option value="all">كل الحالات</option>${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${esc(v)}</option>`).join('')}</select>
      <span class="pub-results">${filtered.length} من ${rows.length} منشور · ${dates.length} يوم</span></div>
    <div class="pub-table-scroll"><table class="pub-day-table"><thead><tr><th class="pub-date-heading">اليوم</th><th><div class="pub-post-head" role="row"><span>رقم الطلب</span><span>اسم الفكرة</span><span>المطلوب</span><span>المنصة / النوع</span><span>المقاس</span><span>الكابشن والهاشتاج</span><span>الملف النهائي</span><span>الحالة</span></div></th></tr></thead>
    <tbody>${dates.length?dates.map(({date,posts})=>`<tr class="pub-day-row"><td class="pub-day-date"><strong>${esc(dayHeading(date))}</strong><small dir="ltr">${esc(date)}</small><span>${posts.length} منشور</span></td><td class="pub-day-cell"><div class="pub-day-posts" role="rowgroup">${posts.map(row=>postRow(row,rows)).join('')}</div></td></tr>`).join(''):
      '<tr><td colspan="2" class="pub-no-results">لا توجد منشورات مطابقة للبحث أو الفلاتر</td></tr>'}</tbody></table></div>`;
}
function publicationFilesModal(state){
  if(!state.fileListEntryId)return '';
  const row=publicationEntry(state,state.fileListEntryId);
  if(!row?.files?.length)return '';
  return `<div class="pub-modal-overlay" data-action="pub-files-close"><div class="pub-modal pub-files-modal" role="dialog" aria-modal="true" aria-label="ملفات المنشور النهائية">
    <div class="pub-modal-top"><div><strong>ملفات المنشور النهائية</strong><small>${esc(row.requestNo||row.ideaName||'')} · ${row.files.length} ملفات</small></div><button class="pub-icon-btn" data-action="pub-files-close" aria-label="إغلاق">✕</button></div>
    <div class="pub-files-list">${row.files.map(f=>`<div class="pub-files-list-row"><span class="pub-file-name" title="${esc(f.name)}">${icon('file')} <bdi dir="ltr">${esc(f.name)}</bdi></span><div class="pub-file-buttons">${fileActionButtons(row,f)}</div></div>`).join('')}</div>
    <div class="pub-modal-actions"><button class="btn" data-action="pub-files-close">إغلاق</button></div></div></div>`;
}
export function publicationPage(state){
  const detail=state.agendaView==='detail' && state.agendaId;
  return `<section class="pub-page">
    ${!detail?`<div class="pub-toolbar"><div class="pub-toolbar-identity"><strong>الأجندات</strong><span class="pub-toolbar-count">${state.agendas.length} أجندة</span></div><button class="btn" data-action="pub-reload" ${state.loading?'disabled':''}>${icon('refresh')} تحديث الأجندات</button></div>`:''}
    ${state.error?`<div class="pub-error" role="alert">${icon('alert')} ${esc(state.error)}</div>`:''}
    ${detail?detailedAgenda(state):agendaCards(state)}
    ${state.loading?`<div class="pub-loading">${icon('refresh')} جارٍ التحميل...</div>`:''}
    ${publicationFilesModal(state)}${publicationMediaModal(state)}
  </section>`;
}
export function publicationMediaModal(state){
  const f=state.media;
  if(!f)return '';
  const body=state.mediaError?`<div class="pub-error">${esc(state.mediaError)}</div>`:state.mediaBusy?'<div class="pub-modal-placeholder">جارٍ استلام بايتات الملف من Google Drive عبر سيرفر التسويق...</div>':
    state.mediaUrl?(f.mimeType.startsWith('video/')?`<video controls playsinline preload="metadata" src="${esc(state.mediaUrl)}"></video>`:f.mimeType.startsWith('image/')?`<img src="${esc(state.mediaUrl)}" alt="معاينة ${esc(f.name)}" />`:'<p>الملف متاح للتحميل.</p>'):'<p>الملف غير متاح للمعاينة.</p>';
  return `<div class="pub-modal-overlay" data-action="pub-close-media"><div class="pub-modal" role="dialog" aria-modal="true" aria-label="معاينة الملف النهائي">
    <div class="pub-modal-top"><div><strong>الملف النهائي الفعلي</strong><small dir="ltr">${esc(f.name)}</small></div><button class="pub-icon-btn" data-action="pub-close-media" aria-label="إغلاق">✕</button></div>
    <div class="pub-modal-body">${body}</div><div class="pub-modal-actions"><button class="btn" data-action="pub-close-media">إغلاق</button><button class="btn btn-primary" data-action="pub-download" data-entry="${esc(f.entryId)}" data-file="${esc(f.fileId)}" ${state.mediaBusy?'disabled':''}>${icon('download')} تحميل الملف</button></div></div></div>`;
}
