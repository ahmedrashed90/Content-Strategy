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
function entryStatus(row){
  const title=row.fileNote||statusText[row.fileStatus]||'';
  const label=row.fileStatus==='waiting_file' && /مرفوع/.test(title) ? 'بانتظار الاعتماد'
    : row.fileStatus==='waiting_file' && /لا يوجد ملف معتمد يطابق/.test(title) ? 'مقاس غير مطابق'
    : statusText[row.fileStatus]||row.fileStatus;
  return `<div class="pub-status-wrap"><span class="pub-status pub-${statusKind[row.fileStatus]||'incomplete'}" title="${esc(title)}">${icon(row.fileStatus==='ready'?'check':row.fileStatus==='waiting_file'?'clock':'alert')} ${esc(label)}</span>${row.fileNote?`<small class="pub-status-note" title="${esc(row.fileNote)}">${esc(row.fileNote)}</small>`:''}</div>`;
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
  if(!state.agendas.length)return `<div class="card pub-empty">${icon('calendar','ic-lg')}<h2>لا توجد أجندات تمت مزامنتها حتى الآن</h2><p>من سيستم التسويق ← النشر ← تجهيز النشر، اضغط «مزامنة الأجندة مع الاستراتيجية». الأجندة ستظهر هنا حتى لو بعض الملفات لم تجهز بعد.</p></div>`;
  return `<div class="pub-agendas-heading"><div><h2>الأجندات الشهرية</h2><p>افتح أي أجندة لعرض المنشورات والمقاسات والملفات النهائية الخاصة بها فقط.</p></div><span class="pub-agendas-count">${state.agendas.length} أجندة</span></div>
    <div class="pub-agendas-grid">${state.agendas.map(row=>{
      const a=row.agenda||{},t=row.totals||{},posts=Number(t.posts||row.entryCount||0),ready=Number(t.ready||0),waiting=Number(t.waiting||0),incomplete=Number(t.incomplete||0);
      const readyPct=posts?Math.max(0,Math.min(100,Math.round(ready/posts*100))):0;
      return `<article class="pub-agenda-card card"><div class="pub-agenda-card-title"><span class="pub-agenda-card-icon">${icon('calendar')}</span><div><strong>${esc(a.name||'أجندة بدون اسم')}</strong><small>${esc(a.planNo||'أجندة تسويق')}</small></div></div>
        <div class="pub-agenda-range"><bdi dir="ltr">${esc(a.publishFrom||'—')}</bdi><span>حتى</span><bdi dir="ltr">${esc(a.publishTo||'—')}</bdi></div>
        <div class="pub-agenda-stats"><span><b>${posts}</b> منشور</span><span class="pub-okay"><b>${ready}</b> جاهز</span><span class="pub-pending"><b>${waiting}</b> منتظر</span>${incomplete?`<span><b>${incomplete}</b> استكمال</span>`:''}</div>
        <div class="pub-agenda-progress" role="img" aria-label="${readyPct} بالمئة ملفات جاهزة"><span style="width:${readyPct}%"></span></div>
        <div class="pub-agenda-foot"><small>آخر مزامنة: ${esc(datetime(row.syncedAt))}</small><button class="btn btn-primary pub-open-btn" data-action="pub-open-agenda" data-agenda="${esc(row.id)}">عرض منشورات الأجندة ${icon('arrow')}</button></div>
      </article>`;
    }).join('')}</div>`;
}
function detailedAgenda(state){
  const rows=allEntries(state),totals=state.detail?.totals||{posts:0,ready:0,waiting:0,incomplete:0},agenda=agendaData(state);
  const platforms=[...new Set(rows.map(e=>e.platform?.name).filter(Boolean))];
  const q=state.search.trim().toLocaleLowerCase('ar');
  const filtered=rows.filter(row=>{
    if(state.status!=='all'&&row.fileStatus!==state.status)return false;
    if(state.platform!=='all'&&row.platform?.name!==state.platform)return false;
    if(!q)return true;
    return [row.requestNo,row.ideaName,row.taskName,row.ideaCode,row.platform?.name,row.postType?.name,row.caption,row.hashtags].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q));
  });
  return `<div class="pub-crumb"><button class="pub-back" data-action="pub-back">${icon('arrow')} كل الأجندات</button><span>/</span><strong>${esc(agenda?.name||'الأجندة')}</strong></div>
    <div class="card pub-agenda-panel"><div class="pub-agenda-title"><div><span class="pub-subtle">تفاصيل الأجندة</span><strong>${esc(agenda?.name||'أجندة')}</strong><small>${esc(agenda?.publishFrom||'')} — ${esc(agenda?.publishTo||'')}</small></div>
      <div class="pub-agenda-detail-actions"><button class="btn" data-action="pub-reload" ${state.loading?'disabled':''}>${icon('refresh')} تحديث البيانات</button>
      <button class="btn btn-primary" data-action="pub-refresh" ${state.refreshing||state.loading?'disabled':''}>${icon('refresh')} ${state.refreshing?'جارٍ فحص الملفات':'تحديث جاهزية الملفات'}</button></div></div>
    <div class="pub-kpis"><div class="pub-kpi"><span>إجمالي سجلات النشر</span><strong>${totals.posts||0}</strong></div><div class="pub-kpi pub-kpi-ready"><span>ملفات جاهزة</span><strong>${totals.ready||0}</strong></div><div class="pub-kpi pub-kpi-waiting"><span>بانتظار الملف / الاعتماد</span><strong>${totals.waiting||0}</strong></div><div class="pub-kpi"><span>تحتاج استكمال بيانات</span><strong>${totals.incomplete||0}</strong></div></div>
    <div class="pub-synced-at">${icon('refresh')} آخر مزامنة: ${esc(datetime(state.detail?.syncedAt))} · حالة كل مقاس مستقلة عن باقي المقاسات</div></div>
    <div class="card pub-table-panel"><div class="pub-filters"><div><label for="pub-search">بحث داخل الأجندة</label><input id="pub-search" type="search" placeholder="رقم الطلب، الفكرة، المنصة، الكابشن..." value="${esc(state.search)}" /></div><div><label for="pub-platform">المنصة</label><select id="pub-platform"><option value="all">كل المنصات</option>${platforms.map(p=>`<option value="${esc(p)}" ${state.platform===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div><div><label for="pub-status">حالة الملف</label><select id="pub-status"><option value="all">كل الحالات</option>${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="pub-results">${filtered.length} من ${rows.length} منشور</div></div>
      <div class="pub-table-scroll"><table class="pub-table"><thead><tr><th>رقم الطلب / المطلوب</th><th>تاريخ النشر</th><th>المنصة / نوع النشر</th><th>المقاس</th><th>الكابشن والهاشتاج</th><th>الملف النهائي</th><th>الحالة</th></tr></thead><tbody>${filtered.length?filtered.map(row=>`<tr><td><bdi class="pub-request" dir="ltr">${esc(row.requestNo||row.taskNo||'—')}</bdi><strong class="pub-requirement">${esc(row.ideaName||row.taskName||'مطلوب')}</strong><small>${esc(row.mediaKind==='video'?'فيديو':row.mediaKind==='image'?'صورة':row.mediaKind||'')} ${row.ideaCode?`· ${esc(row.ideaCode)}`:''}</small></td>
        <td><bdi dir="ltr">${esc(row.scheduledOn)}</bdi></td><td><strong>${esc(row.platform?.name||'غير محدد')}</strong><small>${esc(row.postType?.name||'نوع النشر غير محدد')}</small></td>
        <td><bdi class="pub-dim" dir="ltr">${row.postType?.width&&row.postType?.height?`${row.postType.width} × ${row.postType.height}`:'—'}</bdi></td>
        <td>${captionText(row)}</td><td class="pub-file-cell">${fileControls(row)}</td><td>${entryStatus(row)}</td></tr>`).join(''):`<tr><td colspan="7" class="pub-no-results">لا توجد منشورات مطابقة للبحث أو الفلاتر</td></tr>`}</tbody></table></div></div>`;
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
  return `<section class="pub-page"><div class="page-header pub-header"><div><div class="page-eyebrow">${icon('file')} محتوى النشر المستلم من سيستم التسويق</div><h1 class="page-title">النشر</h1></div>
    ${!detail?`<button class="btn" data-action="pub-reload" ${state.loading?'disabled':''}>${icon('refresh')} ${state.loading?'جارٍ التحميل':'تحديث الأجندات'}</button>`:''}</div>
    ${state.error?`<div class="pub-error" role="alert">${icon('alert')} ${esc(state.error)}</div>`:''}
    ${detail?detailedAgenda(state):agendaCards(state)}
    ${state.loading?`<div class="pub-loading">${icon('refresh')} جارٍ تحميل بيانات الأجندة...</div>`:''}
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
