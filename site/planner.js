// Editable content-cycle UI, with zero private plan data embedded in public JS.
export const PEOPLE = ['محمود','بلال','عبدالله'];
export const PLATFORMS = {instagram:'إنستجرام',facebook:'فيسبوك',tiktok:'تيك توك',snapchat:'سناب شات'};
export const PLAN_SCHEMA = 'mzj-content-plan/v1';
export const PLAN_CODE = 'mzj-2026-launch-cycle-01';
export const TASK_STATUSES = ['لم يبدأ','قيد التنفيذ','قيد المراجعة','مطلوب تعديل','قيد التعديل','معتمد','مرفوض'];
export const POST_STATUSES = ['مخطط','قيد التجهيز','قيد المراجعة','جاهز للنشر','منشور','مؤجل'];
// Creative approval is deliberately separate from production and publishing status.
export const REVIEW_STATUSES = ['بانتظار المراجعة','معتمد','مرفوض'];

export const escapeText = input => String(input ?? '').replace(/[&<>"']/g, x=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[x]);
const e = escapeText;
const dl=(iso)=>iso ? new Intl.DateTimeFormat('ar-EG-u-nu-latn',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Riyadh'}).format(new Date(iso+'T12:00:00Z')) : 'غير محدد';
const weekday=(iso)=>iso ? new Intl.DateTimeFormat('ar-EG',{weekday:'long',timeZone:'Asia/Riyadh'}).format(new Date(iso+'T12:00:00Z')) : '';
const shorten=(txt,count=95)=>String(txt||'').length>count?String(txt).slice(0,count)+'…':String(txt||'');
const pill=(text,type='')=>`<span class="plan-pill ${type}">${e(text)}</span>`;
const pTags=(platforms)=> (platforms||[]).map(p=>pill(PLATFORMS[p]||p,'p-platform')).join(' ');
const statusTag=(name)=>pill(name, name==='معتمد'||name==='جاهز للنشر'?'p-ready':name==='مطلوب تعديل'||name==='مرفوض'||name==='مؤجل'?'p-error':'p-neutral');
const option=(value,label,selected)=>`<option value="${e(value)}" ${String(value)===String(selected)?'selected':''}>${e(label)}</option>`;
const kindLabel={video:'فيديو',image:'صورة',story_design:'صورة',carousel_slide:'صورة',carousel:'صورة'};
export const mediaType=idea=>idea?.kind==='video'?'video':'image';
const mediaTotal=(plan,idea)=>idea?.kind==='carousel'?idea.slideCodes?.length||1:Math.max(1,Number(idea?.imageCount)||1);

export const taskCodes = (plan,code)=>{const group=plan?.carousels?.find(x=>x.code===code);return group?(group.slideCodes||[]):code?[code]:[];};
export const getIdea=(plan,code)=>plan?.assets?.find(a=>a.code===code)||plan?.carousels?.find(c=>c.code===code)||null;
export const executorFor=(plan,code)=> {
  if(!code)return 'غير محدد';
  const a=plan?.assets?.find(a=>a.code===code);
  if(a)return a.marketingExecutorName||a.executor||'غير محدد';
  const c=(plan.carousels||[]).find(a=>a.code===code);
  const first=c?plan.assets.find(a=>a.code===c.slideCodes[0]):null;
  return first?.marketingExecutorName||first?.executor||'غير محدد';
};
export const ideaAssets=(plan,code)=>taskCodes(plan,code).map(id=>plan?.assets?.find(asset=>asset.code===id)).filter(Boolean);
export function reviewStatusFor(plan,code){
  const assets=ideaAssets(plan,code);
  if(!assets.length)return 'بانتظار المراجعة';
  const statuses=assets.map(asset=>asset.reviewStatus==='مطلوب تعديل'?'بانتظار المراجعة':REVIEW_STATUSES.includes(asset.reviewStatus)?asset.reviewStatus:(asset.creativeApprovedAt?'معتمد':'بانتظار المراجعة'));
  return statuses.every(item=>item===statuses[0])?statuses[0]:'بانتظار المراجعة';
}
export const ideaIsApproved=(plan,code)=>reviewStatusFor(plan,code)==='معتمد';
export const ideaIsLinked=(plan,code)=>ideaAssets(plan,code).some(asset=>Boolean(asset.marketingTaskId));
const reviewTag=(status)=>pill(status==='مرفوض'?'مؤرشف':status==='مطلوب تعديل'?'بانتظار المراجعة':status,status==='معتمد'?'p-ready':status==='مرفوض'?'p-error':'p-neutral');
const ideaKind=(idea)=>kindLabel[idea?.kind]||'غير معروف';
const cleanVisualText = value => String(value||'').replace(/الشريحة\\s+\\d+\\s+\\(I\\d+\\)\\s*[:—-]?\\s*/g,'').trim();
const imageCards = idea => {
 if(Array.isArray(idea.imageSlides) && idea.imageSlides.length) return idea.imageSlides;
 return [{number:1,title:'التصميم',screenText:idea.screenText||idea.script||'',visualDescription:idea.visualDescription||idea.creativeTreatment||'',supportingText:'',notes:''}];
};
const imageCardMarkup = idea => imageCards(idea).map((slide,i)=>`<div class="p-scene p-image-scene">
 <strong>الصورة ${i+1} من ${Math.max(1,Number(idea.imageCount)||1)} ${slide.title?'— '+e(slide.title):''}</strong>
 <p><b>النص النهائي للتصميم:</b></p><p class="p-quote">${e(cleanVisualText(slide.screenText))}</p>
 <p><b>التصور البصري:</b> ${e(cleanVisualText(slide.visualDescription))}</p>
 ${slide.supportingText?`<p><b>النص المساند:</b> ${e(slide.supportingText)}</p>`:''}
 ${slide.notes?`<p><b>ملاحظات الصورة:</b> ${e(slide.notes)}</p>`:''}</div>`).join('');
const hashtags=(obj,platform)=>obj?.[platform]||'';

export function validatePlanSeed(d) {
  if(!d || typeof d!=='object'||d.schema!==PLAN_SCHEMA ||d.id!==PLAN_CODE||d.version!==1)return false;
  if(!Array.isArray(d.assets)||d.assets.length!==48||!Array.isArray(d.posts)||d.posts.length!==28||!Array.isArray(d.carousels)||d.carousels.length!==4)return false;
  const codes=new Set(d.assets.map(a=>a.code));
  if(codes.size!==48||d.assets.some(a=>!/^(V|I)\d{2}$/.test(a.code)||!PEOPLE.includes(a.executor)||!/^2026-\d{2}-\d{2}$/.test(a.dueDate)))return false;
  if(d.assets.filter(a=>a.kind==='video').length!==16||d.assets.filter(a=>a.kind==='image').length!==8||d.assets.filter(a=>a.kind==='story_design').length!==8||d.assets.filter(a=>a.kind==='carousel_slide').length!==16)return false;
  if(d.assets.filter(a=>a.kind==='video').some(a=>!a.script||a.scenes?.length!==4||!a.captionsByPlatform?.tiktok))return false;
  const ideas=new Set([...codes,...d.carousels.map(c=>c.code)]);
  if(new Set(d.posts.map(p=>p.id)).size!==28||d.posts.some((p,i)=>p.id!==`P${String(i+1).padStart(2,'0')}`||!ideas.has(p.ideaCode)||!Array.isArray(p.platforms)||!/^20\d\d-\d\d-\d\d$/.test(p.publicationDate)))return false;
  if(d.carousels.some(c=>c.slideCodes.length!==4||c.slideCodes.some(id=>!codes.has(id))))return false;
  return true;
}

function pageHeader(label,title,desc,actions=''){
  return `<div class="page-header"><div><div class="page-eyebrow">${e(label)}</div><h1 class="page-title">${e(title)}</h1><p class="page-description">${e(desc)}</p></div><div class="p-actions">${actions}</div></div>`;
}
function countTiles(p){
  const ideas=[...p.assets.filter(a=>a.kind!=='carousel_slide'),...(p.carousels||[])];
  const approved=ideas.filter(a=>ideaIsApproved(p,a.code)).length;
  const video=ideas.filter(a=>mediaType(a)==='video').length;
  const visual=ideas.filter(a=>mediaType(a)==='image').length;
  const shown=[['مواعيد النشر',p.posts.length],['فيديو',video],['صورة',visual],['أفكار معتمدة',approved]];
  return `<div class="plan-kpis">${shown.map(([t,v])=>`<div class="card plan-kpi"><small>${e(t)}</small><strong>${e(v)}</strong></div>`).join('')}</div>`;
}
function importPanel(state){
  const err=state.planStatus==='denied';
  const pending=state.pendingPlan;
  return `<div class="plan-empty">
    <div class="card panel">
      <h2 class="panel-title">${err?'تحتاج تحديث قواعد Firestore أولًا':'استيراد خطة الشهر من ملف JSON'}</h2>
      <p class="page-description">استورد الملف من جهازك مرة واحدة. الأفكار والسكريبتات والكابشنات والهاشتاجات وتوزيع المنفذين داخل الملف؛ وبعد الاستيراد تستطيع تعديل التكليف والمواعيد من السيستم.</p>
      ${err?`<div class="notice warning">المرجع الأساسي لم يتأثر. لعرض وحفظ خطة النشر انشر قواعد <bdi dir="ltr">firestore.rules</bdi> الجديدة ثم حدّث الصفحة. ${e(state.planError||'')}</div>`:''}
      <div class="plan-setup-grid"><div class="p-info"><strong>20 نوفمبر 2026</strong><small>بدء إعداد التكليفات</small></div><div class="p-info"><strong>الأحد / الأربعاء</strong><small>أيام التسليم للفريق</small></div><div class="p-info"><strong>7 ديسمبر 2026</strong><small>بداية نشر مقترحة قابلة للتغيير</small></div></div>
      <div class="plan-drop"><label for="publishing-plan-file">اختر ملف الاستيراد</label><input type="file" id="publishing-plan-file" accept=".json,application/json"/><small dir="ltr">MZJ-Publishing-Plan-2026-11-20-IMPORT.json</small></div>
      ${pending?`<div class="p-preview"><strong>ملف صالح للاستيراد</strong><p>عدد الأصول: ${pending.assets.length} | أيام النشر: ${pending.posts.length} | فيديوهات: 16 | صور: 32</p><p>لن يتم استبدال المرجع التاريخي، والخطة تُحفظ مرة واحدة ثم تُحدَّث من داخل السيستم.</p><button class="btn btn-primary" data-action="confirm-plan-import" ${state.planSaving?'disabled':''}>${state.planSaving?'جارٍ الاستيراد…':'تأكيد وحفظ خطة النشر في Firestore'}</button></div>`:''}
      ${state.planError?`<p class="p-error" role="alert">${e(state.planError)}</p>`:''}
    </div>
    <div class="notice">يظل المحتوى التفصيلي في ملف الاستيراد خارج مجلد الموقع العام <bdi dir="ltr">site/</bdi>. لا يوجد نشر تلقائي على منصات التواصل.</div>
  </div>`;
}
export const nowInRiyadh=()=>{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const pad=n=>String(n).padStart(2,'0');
const calendarDate=(year,month,day)=>`${year}-${pad(month)}-${pad(day)}`;
const monthTitle=ym=>new Intl.DateTimeFormat('ar-SA-u-nu-latn',{month:'long',year:'numeric',timeZone:'Asia/Riyadh'}).format(new Date(`${ym}-01T12:00:00Z`));
const taskDue=(plan,code)=>taskCodes(plan,code).map(id=>plan.assets.find(a=>a.code===id)?.dueDate).filter(Boolean).sort()[0]||'';
export const isLatePost=(post,today=nowInRiyadh())=>post.publicationDate<today && post.status!=='منشور';
const calendarStatus=post=>isLatePost(post)?'متأخر':post.status;
const calendarTone=post=>post.status==='منشور'?'published':isLatePost(post)?'late':post.status==='جاهز للنشر'?'ready':post.status==='قيد التجهيز'||post.status==='قيد المراجعة'?'working':'planned';
const filteredCalendarPosts=(state,plan)=>{
  const search=(state.planFilter||'').trim().toLocaleLowerCase();
  return plan.posts.filter(post=>{
    const idea=getIdea(plan,post.ideaCode);
    const fields=[post.ideaCode,post.ideaTitle,idea?.title,executorFor(plan,post.ideaCode),post.publicationDate,...(post.platforms||[])].join(' ').toLocaleLowerCase();
    return (!search||fields.includes(search))
      && (!state.calendarExecutor||state.calendarExecutor==='all'||executorFor(plan,post.ideaCode)===state.calendarExecutor)
      && (!state.calendarPlatform||state.calendarPlatform==='all'||(post.platforms||[]).includes(state.calendarPlatform))
      && (!state.calendarMedia||state.calendarMedia==='all'||mediaType(idea)===state.calendarMedia)
      && (!state.calendarStatus||state.calendarStatus==='all'||calendarStatus(post)===state.calendarStatus);
  }).sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate)||(a.time||'').localeCompare(b.time||'')||a.id.localeCompare(b.id));
};
const postMini=(plan,post)=>{
  const idea=getIdea(plan,post.ideaCode);
  const due=taskDue(plan,post.ideaCode);
  return `<article class="calendar-entry calendar-entry-${calendarTone(post)}"><div class="calendar-entry-head"><span class="calendar-type">${e(ideaKind(idea))}${mediaType(idea)==='image'&&mediaTotal(plan,idea)>1?` · ${mediaTotal(plan,idea)} صور`:''}</span>${statusTag(calendarStatus(post))}</div>
    <h3>${e(idea?.title||post.ideaTitle||post.ideaCode)}</h3>
    <div class="calendar-entry-meta"><span>${e(executorFor(plan,post.ideaCode))}</span><span>${e(post.time||'—')}</span>${due?`<span>التسليم: ${dl(due)}</span>`:''}</div>
    <div class="calendar-platforms">${pTags(post.platforms)}</div>
    <div class="calendar-entry-actions"><button class="btn p-small" data-action="open-post" data-id="${e(post.id)}">تفاصيل النشر</button><button class="btn p-small" data-action="open-asset" data-id="${e(post.ideaCode)}">البريف</button></div>
  </article>`;
};
export function planPage(state){
  const plan=state.plan;
  if(!plan)return pageHeader('خطة المحتوى','تقويم النشر والتنشيط','استورد الخطة الأساسية أولاً لإدارة التقويم.')+importPanel(state);
  const ordered=[...plan.posts].sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate));
  const fallbackMonth=ordered[0]?.publicationDate.slice(0,7)||nowInRiyadh().slice(0,7);
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(state.calendarMonth||'')?state.calendarMonth:fallbackMonth;
  const [year,mon]=month.split('-').map(Number);
  const firstDay=new Date(Date.UTC(year,mon-1,1,12));
  const dayOffset=firstDay.getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,mon,0,12)).getUTCDate();
  const calendarLength=Math.ceil((dayOffset+daysInMonth)/7)*7;
  const filtered=filteredCalendarPosts(state,plan);
  const monthPosts=filtered.filter(post=>post.publicationDate.startsWith(month));
  const byDate=new Map();
  for(const post of monthPosts){if(!byDate.has(post.publicationDate))byDate.set(post.publicationDate,[]);byDate.get(post.publicationDate).push(post);}
  const dates=[...byDate.keys()].sort();
  const today=nowInRiyadh();
  const selection=(state.calendarSelectedDate||'').startsWith(month)?state.calendarSelectedDate:(today.startsWith(month)?today:(dates[0]||`${month}-01`));
  const selectedPosts=byDate.get(selection)||[];
  const actions=`<button class="btn btn-primary" data-action="open-idea-import">استيراد أفكار JSON</button><button class="btn" data-action="calendar-new-post">إضافة موعد نشر</button><button class="btn" data-action="export-plan">تصدير نسخة JSON</button>`;
  const weekdayNames=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const cells=Array.from({length:calendarLength},(_,index)=>{
    const num=index-dayOffset+1;
    if(num<1||num>daysInMonth)return `<div class="calendar-cell calendar-cell-outside" aria-hidden="true"></div>`;
    const date=calendarDate(year,mon,num);
    const posts=byDate.get(date)||[];
    const active=selection===date;
    const count=posts.length;
    return `<button type="button" class="calendar-cell ${active?'calendar-cell-active':''} ${date===today?'calendar-cell-today':''} ${count?'calendar-cell-filled':''}" data-action="calendar-select-day" data-date="${date}" aria-label="${e(weekdayNames[index%7])} ${e(dl(date))}، ${count} منشورات" aria-pressed="${active?'true':'false'}">
      <span class="calendar-date-number">${num}${date===today?'<i>اليوم</i>':''}</span>
      <span class="calendar-cell-posts">${posts.slice(0,2).map(post=>{const idea=getIdea(plan,post.ideaCode);return `<span class="calendar-cell-chip calendar-chip-${calendarTone(post)}"><b>${e(ideaKind(idea))}</b> ${e(shorten(idea?.title||post.ideaTitle||post.ideaCode,30))}</span>`;}).join('')}${count>2?`<span class="calendar-more">+${count-2} محتوى آخر</span>`:''}</span>
      ${count?`<span class="calendar-cell-footer">${count} محتوى مجدول</span>`:''}
    </button>`;
  }).join('');
  const statusOptions=['all',...POST_STATUSES,'متأخر'].map(value=>option(value,value==='all'?'كل الحالات':value,state.calendarStatus||'all')).join('');
  return pageHeader('إدارة النشر','تقويم النشر والتنشيط','تقويم شهري مرن حسب تاريخ النشر الفعلي للخطة، مع فصل واضح بين موعد التسليم وموعد النشر.',actions)
    +`<div class="calendar-context"><span>شهر ${e(monthTitle(month))}</span><strong>${monthPosts.length} موعد نشر</strong><span>اضغط على أي يوم لعرض المحتوى وتفاصيله</span></div>`
    +`<section class="calendar-workspace"><div class="calendar-toolbar"><div><span class="calendar-eyebrow">خطة النشر الشهرية</span><h2>${e(monthTitle(month))}</h2></div><div class="calendar-month-controls"><button class="btn" data-action="calendar-prev" aria-label="الشهر السابق">‹</button><input id="calendar-month" type="month" value="${month}" aria-label="اختر شهر التقويم"/><button class="btn" data-action="calendar-next" aria-label="الشهر التالي">›</button><button class="btn" data-action="calendar-today">الشهر الحالي</button></div></div>
      <div class="calendar-filters"><label>المنصة<select id="calendar-platform">${option('all','كل المنصات',state.calendarPlatform||'all')}${Object.entries(PLATFORMS).map(([key,value])=>option(key,value,state.calendarPlatform||'all')).join('')}</select></label><label>المنفذ<select id="calendar-executor">${['الكل',...PEOPLE].map(name=>option(name==='الكل'?'all':name,name,state.calendarExecutor||'all')).join('')}</select></label><label>المحتوى<select id="calendar-media">${option('all','صورة وفيديو',state.calendarMedia||'all')}${option('image','صورة',state.calendarMedia||'all')}${option('video','فيديو',state.calendarMedia||'all')}</select></label><label>الحالة<select id="calendar-status">${statusOptions}</select></label><label class="calendar-search">بحث<input id="plan-filter" type="search" placeholder="اسم الفكرة أو كودها" value="${e(state.planFilter||'')}"/></label><button class="btn" data-action="apply-plan-filter">بحث</button><button class="btn" data-action="clear-plan-filter">مسح</button></div>
      <div class="calendar-body"><section class="calendar-main" aria-label="التقويم الشهري"><div class="calendar-weekdays">${weekdayNames.map(name=>`<span>${name}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></section>
      <aside class="calendar-side"><div class="calendar-side-heading"><span class="calendar-eyebrow">تفاصيل اليوم المحدد</span><h2>${e(weekday(selection))} · ${e(dl(selection))}</h2><p>${selectedPosts.length} محتوى في هذا اليوم</p></div>
        <div class="calendar-side-scroll">${selectedPosts.length?selectedPosts.map(post=>postMini(plan,post)).join(''):'<div class="calendar-empty-day"><strong>لا يوجد محتوى مجدول</strong><p>اختر فكرة وحدد تاريخ نشرها من زر الإضافة.</p></div>'}</div><button class="btn btn-primary calendar-add-day" data-action="calendar-new-post" data-date="${e(selection)}">جدولة فكرة في هذا اليوم</button></aside></div></section>`
    +`<div class="section-heading"><div><h2>قائمة نشر الشهر</h2><p>الترتيب حسب تاريخ النشر. افتح الفكرة لعرض البريف والكابشن والهاشتاج بالكامل.</p></div></div>`
    +`<div class="calendar-agenda">${monthPosts.map(post=>{const idea=getIdea(plan,post.ideaCode);const due=taskDue(plan,post.ideaCode);return `<article class="calendar-agenda-row"><div class="calendar-agenda-date"><strong>${e(post.publicationDate.slice(8))}</strong><span>${e(weekday(post.publicationDate))}</span></div><div class="calendar-agenda-content"><div class="calendar-agenda-title">${e(idea?.title||post.ideaTitle||post.ideaCode)}</div><div class="calendar-agenda-meta"><span>${e(ideaKind(idea))}${mediaType(idea)==='image'&&mediaTotal(plan,idea)>1?` · ${mediaTotal(plan,idea)} صور`:''}</span><span>${e(executorFor(plan,post.ideaCode))}</span>${due?`<span>تسليم ${dl(due)}</span>`:''}<span>${e(post.time||'')}</span></div></div><div class="calendar-agenda-platforms">${pTags(post.platforms)}</div><div>${statusTag(calendarStatus(post))}</div><button class="btn p-small" data-action="open-post" data-id="${e(post.id)}">فتح التفاصيل</button></article>`;}).join('')||'<div class="calendar-agenda-empty">مافيش محتوى مطابق للفلاتر في الشهر ده. جرّب تغيير الفلاتر أو إضافة موعد نشر جديد.</div>'}</div>`
    +`<div class="notice">يُعرض لكل فكرة نوع «صورة» أو «فيديو» فقط. عدد الصور والتفاصيل التنفيذية تظهر داخل البريف؛ النشر لا يتم تلقائيًا من النظام.</div>`;
}

export function tasksPage(state){
  const plan=state.plan;
  if(!plan)return pageHeader('التسليمات والإنتاج','متابعة تسليمات الفريق','')+importPanel(state);
  const person=state.taskPerson||'الكل';
  const week=Number(state.taskWeek||0);
  const today=nowInRiyadh();
  const source=plan.assets.filter(asset=>!asset.retiredFromIdeaBank && !(['مرفوض'].includes(reviewStatusFor(plan,asset.code))));
  const filtered=source.filter(asset=>(person==='الكل'||executorFor(plan,asset.code)===person||asset.executor===person)&&(!week||asset.week===week))
    .sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.code.localeCompare(b.code));
  const days=[...new Set(filtered.map(a=>a.dueDate||''))].sort((a,b)=>(a||'9999').localeCompare(b||'9999'));
  const done=filtered.filter(a=>a.status==='معتمد').length;
  const late=filtered.filter(a=>a.dueDate&&a.dueDate<today&&a.status!=='معتمد').length;
  const dueThisWeek=filtered.filter(a=>a.dueDate&&a.dueDate>=today&&a.dueDate<=new Date(Date.parse(`${today}T12:00:00Z`)+6*86400000).toISOString().slice(0,10)).length;
  const linked=filtered.filter(a=>Boolean(a.marketingTaskId)).length;
  const metrics=[['إجمالي المطلوبات',filtered.length,'كل صور وفيديوهات الإنتاج'],['تسليمات الأسبوع',dueThisWeek,'خلال 7 أيام'],['متأخر',late,'لم تعتمد بعد'],['تم الربط',linked,'تكليفات سيستم التسويق'],['مكتمل',done,'تم اعتماد التنفيذ']];
  const actions=`<button class="btn" data-action="download-handoff" data-person="${e(person)}">تحميل قائمة التسليمات</button>`;
  return pageHeader('مركز الإنتاج','التسليمات والإنتاج','متابعة المطلوبات بحسب تاريخ التسليم والمنفذ وحالة التنفيذ.',actions)
    +`<section class="delivery-overview" aria-label="ملخص الإنتاج">${metrics.map(([label,n,detail],i)=>`<div class="delivery-metric ${i===2&&n?'delivery-metric-alert':''}"><span>${e(label)}</span><strong>${n}</strong><small>${e(detail)}</small></div>`).join('')}</section>`
    +`<div class="delivery-toolbar card"><div class="delivery-toolbar-title"><strong>جدول التسليمات</strong><span>مرتّب من الأقرب إلى الأبعد</span></div><div class="delivery-controls"><label>المنفذ<select id="task-person">${['الكل',...PEOPLE].map(n=>option(n,n,person)).join('')}</select></label><label>الأسبوع<select id="task-week">${[0,1,2,3,4].map(n=>option(n,n?'الأسبوع '+n:'كل الأسابيع',week)).join('')}</select></label></div></div>`
    +`<div class="delivery-timeline">${days.map(date=>{const items=filtered.filter(a=>(a.dueDate||'')===date);
      const isPast=date&&date<today, allComplete=items.every(a=>a.status==='معتمد');
      return `<section class="delivery-day"><div class="delivery-date-rail"><span class="delivery-node ${allComplete?'completed':isPast?'overdue':''}"></span><div class="delivery-date-label"><b>${date?e(weekday(date)):'بدون تاريخ'}</b><strong>${date?dl(date):'لم يُحدد تسليم'}</strong><small>${items.length} مطلوب</small></div></div><div class="delivery-day-body"><header><h2>${date?`تسليم ${dl(date)}`:'تحديد موعد التسليم'}</h2><span class="delivery-day-count">${items.length} مطلوب</span></header><div class="delivery-item-grid">${items.map(asset=>{
        const reviewed=reviewStatusFor(plan,asset.code);
        const due=asset.dueDate&&asset.dueDate<today&&asset.status!=='معتمد';
        return `<article class="delivery-item ${due?'is-overdue':''}"><div class="delivery-item-head">${pill(ideaKind(asset))}<span class="delivery-status">${statusTag(asset.status||'لم يبدأ')}</span></div><h3>${e(asset.title)}</h3><div class="delivery-item-facts"><div><small>المنفذ</small><strong>${e(executorFor(plan,asset.code))}</strong></div><div><small>مراجعة الفكرة</small>${reviewTag(reviewed)}</div><div><small>التكليف</small><strong>${asset.marketingTaskNo?e(asset.marketingTaskNo):'لم يُنشأ'}</strong></div></div><div class="delivery-item-actions"><button class="btn p-small" data-action="open-asset" data-id="${e(asset.code)}">فتح البريف</button><button class="btn p-small" data-action="download-brief" data-id="${e(asset.code)}">تنزيل البريف</button></div></article>`;
      }).join('')}</div></div></section>`;}).join('')||'<div class="delivery-empty card">لا توجد تسليمات مطابقة لهذه الفلاتر.</div>'}</div>`;
}
export function ideasPage(state){
  const plan=state.plan;
  if(!plan)return pageHeader('الأفكار','بنك الأفكار','الملف المصدر يحتوي كل الأفكار والأصول.')+importPanel(state);
  const kind=state.ideaKind||'all',review=state.ideaReviewFilter||'all',search=(state.ideaSearch||'').toLocaleLowerCase();
  const allIdeas=[...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))].filter(a=>reviewStatusFor(plan,a.code)!=='مرفوض');
  const ideas=allIdeas.filter(a=>(kind==='all'||mediaType(a)===kind)
    && (review==='all'||reviewStatusFor(plan,a.code)===review)
    &&(!search||`${a.code} ${a.title} ${executorFor(plan,a.code)}`.toLocaleLowerCase().includes(search)));
  const imported=plan.assets.filter(a=>Boolean(a.importedBatchId)).length;
  const actions=`<button class="btn btn-primary" data-action="toggle-idea-import">${state.ideaImportOpen?'إغلاق الاستيراد':'استيراد أو استبدال JSON'}</button><button class="btn" data-action="download-idea-template">نموذج JSON</button><button class="btn" data-nav="archive">الأرشيف</button>`;
  const panel=state.ideaImportOpen?ideaBatchPanel(state):'';
  const tiles=[['كل الأفكار','all',allIdeas.length],['بانتظار المراجعة','بانتظار المراجعة',allIdeas.filter(a=>reviewStatusFor(plan,a.code)==='بانتظار المراجعة').length],['معتمد','معتمد',allIdeas.filter(a=>ideaIsApproved(plan,a.code)).length]];
  return pageHeader('مركز الإبداع والموافقات','بنك الأفكار ومراجعتها',`كل فكرة تمر على المراجعة والاعتماد قبل إنشاء تكليف. نوع المطلوب «صورة» أو «فيديو» فقط. ${imported?`${imported} فكرة أُضيفت من ملفات JSON.`:''}`,actions)
    +`<div class="ideas-workflow-banner"><div><span>مسار العمل المعتمد</span><strong>فكرة جديدة <i>←</i> مراجعة واعتماد <i>←</i> اختيار السيارات <i>←</i> تكليف المنفذ والتسليم</strong></div><button class="btn" data-nav="bridge">فتح ربط التكليف</button></div>`
    +`<div class="ideas-review-strip" aria-label="فلاتر مراحل المراجعة">${tiles.map(([label,value,count])=>`<button class="ideas-review-pill ${review===value?'is-selected':''}" type="button" data-action="ideas-filter-review" data-status="${e(value)}">${e(label)} <small>${count}</small></button>`).join('')}</div>`
    +panel+`<div class="p-filter ideas-filters"><label for="idea-kind">نوع المحتوى</label><select id="idea-kind">${[['all','صورة وفيديو'],['video','فيديو'],['image','صورة']].map(([k,v])=>option(k,v,kind)).join('')}</select><label for="idea-review-filter">حالة مراجعة الفكرة</label><select id="idea-review-filter">${[['all','كل حالات المراجعة'],['بانتظار المراجعة','بانتظار المراجعة'],['معتمد','معتمد']].map(([k,v])=>option(k,v,review)).join('')}</select><label for="idea-search">البحث عن فكرة</label><input id="idea-search" placeholder="ابحث باسم الفكرة" value="${e(state.ideaSearch||'')}"/><button class="btn" data-action="apply-idea-search">بحث</button></div>`
    +`<div class="p-ideas-grid ideas-v15-grid">${ideas.map(a=>{const status=reviewStatusFor(plan,a.code),linked=ideaIsLinked(plan,a.code),assets=ideaAssets(plan,a.code),first=assets[0];return `<article class="card p-idea idea-review-card"><div class="p-idea-head">${pill(ideaKind(a))}${mediaType(a)==='image'&&mediaTotal(plan,a)>1?pill(`${mediaTotal(plan,a)} صور`):''}</div><h2>${e(a.title)}</h2><p>${e(shorten(a.message||a.audienceAndGoal||a.hook||'',150))}</p><div class="idea-review-meta"><span>المراجعة: ${reviewTag(status)}</span><span>المنفذ: <strong>${e(executorFor(plan,a.code))}</strong></span><span>التسليم: <strong>${first?.dueDate?dl(first.dueDate):'لم يُحدد'}</strong></span></div><div class="p-idea-footer"><span class="idea-linked-indicator">${linked?`مرتبط بتاسك ${e(first?.marketingTaskNo||'')}`:status==='معتمد'?'جاهز للتكليف بعد اختيار السيارات':'بانتظار قرار المراجعة'}</span><div class="p-actions"><button class="btn p-small" data-action="open-asset" data-id="${e(a.code)}">${status==='معتمد'?'عرض البريف':'مراجعة الفكرة'}</button>${status==='معتمد'?`<button class="btn btn-primary p-small" data-action="bridge-open-asset" data-id="${e(a.code)}">${linked?'متابعة التكليف':'إنشاء تكليف'}</button>`:''}</div></div></article>`;}).join('')||'<div class="card panel ideas-no-results">لا توجد أفكار مطابقة للبحث والفلاتر الحالية.</div>'}</div>`;
}
export function archivePage(state){
  const plan=state.plan;
  if(!plan)return pageHeader('الأرشيف','أرشيف الأفكار','');
  const archived=[...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))].filter(a=>reviewStatusFor(plan,a.code)==='مرفوض');
  const query=(state.archiveSearch||'').trim().toLocaleLowerCase();
  const visible=archived.filter(a=>!query||`${a.title}`.toLocaleLowerCase().includes(query));
  return pageHeader('إدارة الأفكار','أرشيف الأفكار','الأفكار المرفوضة محفوظة ويمكن استرجاعها للمراجعة والاعتماد مستقبلًا.',`<button class="btn" data-nav="ideas">رجوع لبنك الأفكار</button>`)
    +`<div class="archive-summary card"><div><span class="archive-summary-eyebrow">الأفكار المحفوظة</span><strong>${archived.length}</strong></div><label>البحث في الأرشيف<input type="search" id="archive-search" value="${e(state.archiveSearch||'')}" placeholder="اسم الفكرة أو الكود"></label><button class="btn" data-action="archive-search">بحث</button></div>`
    +`<div class="archive-grid">${visible.map(a=>{const old=ideaAssets(plan,a.code)[0];return `<article class="card archive-card"><div class="archive-card-head">${pill(ideaKind(a))}<span class="archive-tag">في الأرشيف</span></div><h2>${e(a.title)}</h2><div class="archive-card-foot"><span>آخر مراجعة: ${old?.reviewedAt?dl(old.reviewedAt.slice(0,10)):'—'}</span><button class="btn btn-primary" data-action="open-asset" data-id="${e(a.code)}">فتح واسترجاع</button></div></article>`;}).join('')||'<div class="card archive-empty">لا توجد أفكار مطابقة في الأرشيف.</div>'}</div>`;
}

function ideaBatchPanel(state){
  const batch=state.pendingIdeaBatch;
  return `<section class="card panel idea-import-panel"><h2>إدارة بنك الأفكار</h2><p class="page-description">أضف دفعة جديدة أو استبدل الأفكار الظاهرة. يحتفظ الاستبدال بأرشيف السجلات والتكليفات والمنشورات التاريخية.</p><div class="idea-import-modes"><button type="button" class="btn ${!state.ideaReplaceMode?'btn-primary':''}" data-action="idea-import-mode" data-mode="add">إضافة أفكار</button><button type="button" class="btn ${state.ideaReplaceMode?'btn-primary':''}" data-action="idea-import-mode" data-mode="replace">استبدال بنك الأفكار</button></div>${state.ideaReplaceMode?'<div class="notice warning">سيتم إخفاء الأفكار الحالية من البنك النشط مع الاحتفاظ بتاريخها وروابطها. يلزم تأكيد كتابي ونسخة احتياطية قبل الاستبدال.</div>':''}
    <div class="idea-import-main"><label class="plan-drop" for="idea-import-file"><strong>اختر ملف JSON للأفكار</strong><input type="file" id="idea-import-file" accept=".json,application/json"/><small>الملف يمكن أن يحتوي على أفكار صورة وفيديو بعدد صور مخصص لكل فكرة.</small></label></div>
    ${batch?`<div class="idea-import-preview"><div><strong>الأفكار الجاهزة للإضافة</strong><b>${batch.items.length}</b></div><div><strong>أفكار مكررة تم تخطيها</strong><b>${batch.duplicates.length}</b></div><div><strong>إجمالي الملف</strong><b>${batch.total}</b></div></div><div class="idea-import-list">${batch.items.slice(0,12).map(a=>`<div><span>${e(a.marketingCategory||'فكرة جديدة')}</span><strong>${e(a.title)}</strong>${pill(a.kind==='video'?'فيديو':'صورة')}${a.kind==='image'&&a.imageCount>1?`<small>${a.imageCount} صور</small>`:''}</div>`).join('')}${batch.items.length>12?`<p>و${batch.items.length-12} أفكار أخرى في الملف.</p>`:''}</div>
      ${batch.items.some(a=>!a.executor)?`<div class="notice">الأفكار بدون منفذ ستُحفظ للمراجعة أولًا. تختار المنفذ وتاريخ التسليم بعد الاعتماد، قبل إنشاء التاسك.</div>`:''}
      ${state.ideaReplaceMode?`<div class="idea-replace-confirm"><label>اكتب كلمة <b>استبدال</b> للتأكيد<input id="idea-replace-verify" autocomplete="off" placeholder="استبدال" /></label><p>سيتم تنزيل نسخة احتياطية قبل إجراء الاستبدال.</p></div>`:''}<div class="p-actions"><button class="btn btn-primary" data-action="${state.ideaReplaceMode?'replace-idea-batch':'confirm-idea-batch'}" ${batch.items.length===0||state.planSaving?'disabled':''}>${state.planSaving?'جارٍ الحفظ…':state.ideaReplaceMode?`استبدال البنك بـ ${batch.items.length} فكرة`:`حفظ ${batch.items.length} فكرة جديدة`}</button><button class="btn" data-action="cancel-idea-batch">إلغاء المعاينة</button></div>`:''}
    ${state.ideaImportError?`<p class="p-error" role="alert">${e(state.ideaImportError)}</p>`:''}
    <p class="p-help">بعد الاستيراد: افتح البريف وراجع الفكرة، اعتمدها، ثم انتقل إلى ربط سيستم التسويق لتحديد السيارات والمنفذ والتسليم وإنشاء التاسك.</p>
  </section>`;
}
export function schedulePage(state){
  const plan=state.plan;
  if(!plan)return pageHeader('النشر','الخطة غير موجودة','استورد خطة النشر أولاً.');
  const code=state.scheduleIdeaCode||'';
  const ideas=[...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))].filter(a=>ideaIsApproved(plan,a.code));
  const selected=getIdea(plan,code);
  const date=/^\d{4}-\d{2}-\d{2}$/.test(state.scheduleDate||'')?state.scheduleDate:(state.calendarSelectedDate||nowInRiyadh());
  return pageHeader('إضافة محتوى للتقويم','جدولة فكرة للنشر','الجدولة تضع موعد نشر جديدًا في التقويم، ولا تنشر المحتوى تلقائيًا.',`<button class="btn" data-nav="plan">الرجوع للتقويم</button>`)
    +`${ideas.length? '':`<div class="notice warning">لا توجد أفكار معتمدة بعد. افتح مركز مراجعة الأفكار واعتمد فكرة قبل جدولة موعد جديد.</div>`}
    <form id="schedule-editor" class="card panel p-edit-form calendar-schedule-form"><label>الفكرة المعتمدة<select name="ideaCode" required><option value="">اختر الفكرة</option>${ideas.map(a=>option(a.code,`${a.title} | ${ideaKind(a)}`,code)).join('')}</select></label>
      ${selected?`<div class="notice">${pill(ideaKind(selected))} ${e(selected.title)} · المنفذ: ${e(executorFor(plan,selected.code))}. ${ideaIsApproved(plan,selected.code)?'الفكرة معتمدة.':'تحتاج مراجعة واعتماد قبل الجدولة.'}</div>`:''}
      <div class="p-form-grid"><label>تاريخ النشر<input type="date" name="publicationDate" value="${e(date)}" required/></label><label>وقت النشر<input type="time" name="time" value="19:00" required/></label></div>
      <fieldset class="calendar-schedule-platforms"><legend>المنصات</legend>${Object.entries(PLATFORMS).map(([key,name],index)=>`<label><input type="checkbox" name="platform_${key}" ${index===0?'checked':''}/> ${e(name)}</label>`).join('')}</fieldset>
      <button class="btn btn-primary" type="submit" ${state.planSaving?'disabled':''}>إضافة الموعد للتقويم</button><p class="p-help">موعد التسليم مستقل عن موعد النشر، وتعديله يتم من بريف الفكرة.</p></form>`;
}

export function postDetailPage(state){
  const p=state.plan;const post=p?.posts.find(x=>x.id===state.selectedPostId);
  if(!post)return pageHeader('النشر','تعذر فتح اليوم','ارجع إلى تقويم النشر.');
  const asset=getIdea(p,post.ideaCode);
  const opts=[...p.assets.filter(a=>a.kind==='video'||a.kind==='image'),...p.carousels].filter(a=>a.code===post.ideaCode||ideaIsApproved(p,a.code)).sort((a,b)=>a.code.localeCompare(b.code)).map(a=>option(a.code,`${a.title}`,post.ideaCode)).join('');
  const tabs=Object.entries(PLATFORMS).map(([k,n])=>`<div class="p-platform-edit"><label class="p-check"><input type="checkbox" name="platform_${k}" ${post.platforms.includes(k)?'checked':''}/> ${e(n)}</label><label>الكابشن - ${e(n)}<textarea name="caption_${k}" rows="3">${e(post.captionsByPlatform?.[k]||'')}</textarea></label><label>الهاشتاج - ${e(n)}<textarea name="hashtags_${k}" rows="2">${e(post.hashtagsByPlatform?.[k]||'')}</textarea></label></div>`).join('');
  const actions=`<button class="btn" data-nav="plan">الرجوع للتقويم</button><button class="btn" data-action="download-brief" data-id="${e(post.ideaCode)}">تحميل بريف الفكرة</button>`;
  return pageHeader('تفاصيل يوم النشر',`${asset?.title||'تفاصيل النشر'}`,'تعديل الفكرة والمنفذ والمنصات والنصوص والمواعيد محفوظ في Firestore فقط عند الضغط على حفظ.',actions)
    +`<div class="p-two-columns"><form id="post-editor" class="card panel p-edit-form">
      <h2>إعدادات النشر</h2>
      <div class="p-form-grid"><label>تاريخ النشر المقترح<input name="publicationDate" type="date" required value="${e(post.publicationDate)}"/></label><label>الوقت المقترح<input name="time" type="time" required value="${e(post.time)}"/></label></div>
      <label>اختيار الفكرة<select name="ideaCode" id="post-idea-select">${opts}</select></label>
      <p class="p-help">عند تغيير الفكرة سيتم تحميل كابشناتها وهاشتاجاتها الأصلية تلقائيًا إلى الحقول؛ راجعها قبل الحفظ.</p>
      <div class="p-form-grid"><label>المنفذ داخل الخطة<select name="executor" ${ideaIsLinked(p,post.ideaCode)?'disabled':''}>${option('','لم أحدد بعد',ideaAssets(p,post.ideaCode)[0]?.executor||'')}${PEOPLE.map(n=>option(n,n,ideaAssets(p,post.ideaCode)[0]?.executor||'')).join('')}</select></label><label>حالة النشر<select name="status">${POST_STATUSES.map(n=>option(n,n,post.status)).join('')}</select></label></div>
      ${ideaIsLinked(p,post.ideaCode)?`<div class="p-help">المنفذ والتسليم الفعليان مرتبطان بسيستم التسويق، ولا يتغيران من تعديل النشر.</div>`:''}
      <label>رابط المنشور بعد النشر (اختياري حتى التنفيذ)<input name="publishedUrl" type="url" dir="ltr" placeholder="https://..." value="${e(post.publishedUrl||'')}"/></label>
      
      <h3>المنصات والكابشن والهاشتاج</h3>${tabs}
      <h3>القصة المساندة ${e(post.story?.code||'')}</h3>
      <label>النص الأول للقصة<textarea name="storyFrame1" rows="2">${e(post.story?.frame1||'')}</textarea></label>
      <label>النص الثاني للقصة<textarea name="storyFrame2" rows="2">${e(post.story?.frame2||'')}</textarea></label>
      <button class="btn btn-primary" type="submit" ${state.planSaving?'disabled':''}>${state.planSaving?'جارٍ الحفظ…':'حفظ تعديلات النشر والتكليف'}</button>
      <p class="p-help">لا يوجد نشر آلي. تغيير الفكرة هنا لا يلغي أصول الإنتاج أو يضيف كميات جديدة للفريق.</p>
    </form><div class="p-detail-side">${briefCard(p,post.ideaCode,true)}<section class="card panel"><h3>تسليم الملف</h3>${taskCodes(p,post.ideaCode).map(id=>{const a=p.assets.find(x=>x.code===id);return a?`<p>${pill(a.code)} ${e(a.executor)} · ${dl(a.dueDate)} · ${statusTag(a.status)}</p>`:'';}).join('')}</section></div></div>`;
}

function briefCard(plan,code,embedded=false){
  const a=getIdea(plan,code);
  if(!a)return '';
  if(a.kind==='carousel')return `<section class="card panel p-brief-card"><div class="p-head-inline">${pill('صورة')} ${pill(`${mediaTotal(plan,a)} صور`)}</div><h2>${e(a.title)}</h2><p>${e(a.audienceAndGoal)}</p><h3>الصور بالتسلسل</h3>${a.slideCodes.map((id,n)=>{const s=getIdea(plan,id);return `<div class="p-scene"><strong>الصورة ${n+1}</strong><p class="p-quote">${e(s.screenText)}</p><p>${e(s.visualDescription)}</p></div>`;}).join('')}<h3>الكابشن</h3><p class="p-quote">${e(a.captionsByPlatform?.instagram||'')}</p><h3>الهاشتاج</h3><p>${e(a.hashtagsByPlatform?.instagram||'')}</p>${embedded?`<button class="btn" data-action="open-asset" data-id="${e(code)}">تفاصيل كل صورة</button>`:''}</section>`;
  let chapters='';
  if(a.kind==='video')chapters=`<h3>الهوك</h3><p class="p-quote">${e(a.hook)}</p><h3>الفويس أوفر كاملًا</h3><p class="p-voice">${e(a.script)}</p><h3>السيناريو مشهدًا بمشهد</h3>${(a.scenes||[]).map(sc=>`<div class="p-scene"><strong>المشهد ${e(sc.number)} | ${e(sc.startSecond)}–${e(sc.endSecond)} ثانية · ${e(sc.title)}</strong><p><b>المشهد:</b> ${e(sc.visual)}</p><p><b>الفويس أوفر:</b> ${e(sc.voiceOver)}</p><p><b>نص الشاشة:</b> ${e(sc.screenText)}</p><p><b>الكاميرا:</b> ${e(sc.camera)}</p><p><b>الصوت:</b> ${e(sc.sound)}</p><p><b>الانتقال:</b> ${e(sc.transition)}</p></div>`).join('')}<h3>مطلوبات التصوير</h3><p>${e(a.shootingAssets)}</p><h3>شروط التنفيذ</h3><p>${e(a.qualityNotes)}</p>`;
  else chapters=`<h3>التصميم صورة بصورة</h3>${imageCardMarkup(a)}<h3>متابعة القصة / النص المساند</h3><p>${e(a.script||'')}</p><h3>تنبيهات التنفيذ</h3><p>${e(a.productionNotes||'')}</p>`;
  const caps=Object.entries(a.captionsByPlatform||{}).filter(([,v])=>v).map(([k,v])=>`<p><b>${e(PLATFORMS[k]||k)}:</b> ${e(v)}</p>`).join('');
  return `<section class="card panel p-brief-card"><div class="p-head-inline">${pill(ideaKind(a))}</div><h2>${e(a.title)}</h2><p>${e(a.audienceAndGoal||'')}</p><p><b>الرسالة:</b> ${e(a.message||'')}</p>${chapters}<h3>الكابشن حسب المنصة</h3>${caps||'<p>صورة ضمن نفس الفكرة أو قصة مساندة.</p>'}<h3>الهاشتاج</h3><p>${e(a.hashtagsByPlatform?.instagram||'لا توجد هاشتاجات مطلوبة لهذا الأصل')}</p>${embedded?`<button class="btn" data-action="open-asset" data-id="${e(code)}">فتح البريف كاملًا</button>`:''}</section>`;
}

export function assetDetailPage(state){
  const plan=state.plan,idea=getIdea(plan,state.selectedAssetCode);
  if(!idea)return pageHeader('مراجعة البريف','الفكرة غير موجودة','');
  const codes=taskCodes(plan,idea.code);
  const main=plan.assets.find(a=>a.code===codes[0]);
  const status=reviewStatusFor(plan,idea.code),linked=ideaIsLinked(plan,idea.code);
  const pendingRequest=ideaAssets(plan,idea.code).some(asset=>asset.integrationRequestKey&&!asset.marketingTaskId);
  const prior=Array.isArray(main?.previousMarketingTasks)?main.previousMarketingTasks:[];
  const reviewHistory=Array.isArray(main?.reviewHistory)?main.reviewHistory:[];
  const returnLabel=state.briefReturnView==='archive'?'الأرشيف':state.briefReturnView==='tasks'?'التسليمات والإنتاج':state.briefReturnView==='post'?'تفاصيل النشر':'بنك الأفكار';
  const back=`<button class="btn brief-back-button" data-action="brief-back" type="button" aria-label="رجوع إلى ${e(returnLabel)}">↩ رجوع إلى ${e(returnLabel)}</button>`;
  const actions=`${back}<button class="btn" data-action="copy-brief" data-id="${e(idea.code)}">نسخ البريف</button><button class="btn" data-action="download-brief" data-id="${e(idea.code)}">تنزيل البريف</button>`;
  const decisionButtons=status==='مرفوض'
    ?`<button class="btn btn-primary" name="reviewDecision" value="بانتظار المراجعة" type="submit">استرجاع الفكرة للمراجعة</button>`
    :status==='معتمد'
    ?`<button class="btn" name="reviewDecision" value="بانتظار المراجعة" type="submit">إلغاء الاعتماد وإعادة للمراجعة</button>`
    :`<button class="btn btn-primary" name="reviewDecision" value="معتمد" type="submit">اعتماد الفكرة</button><button class="btn btn-danger" name="reviewDecision" value="مرفوض" type="submit">رفض ونقل للأرشيف</button>`;
  const reviewPanel=`<section class="card panel idea-approval-panel"><div class="review-panel-heading"><div><div class="page-eyebrow">مراجعة البريف</div><h2>قرار الفكرة</h2></div>${reviewTag(status)}</div>
    ${main?.reviewedAt?`<div class="review-stamp">آخر قرار: ${e(new Date(main.reviewedAt).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}))}</div>`:''}
    ${pendingRequest?'<p class="review-pending-text">يوجد طلب تكليف لم تكتمل نتيجته. يلزم التحقق منه قبل تغيير حالة الفكرة.</p>':
      `<form id="idea-review-form" class="p-edit-form"><input type="hidden" name="ideaCode" value="${e(idea.code)}"/><div class="review-decision-actions">${decisionButtons}</div></form>`}
    ${status==='معتمد'?`<div class="review-next-step"><div><strong>جاهزة لمرحلة التكليف</strong><small>حدد السيارات والمنفذ وتاريخ التسليم</small></div><button class="btn btn-primary" data-action="bridge-open-asset" data-id="${e(idea.code)}">${linked?'متابعة التكليف الحالي':'تجهيز تكليف جديد'}</button></div>`:''}
    <div class="brief-review-bottom">${back}</div>
    ${reviewHistory.length?`<div class="review-history"><h3>سجل المراجعات</h3>${[...reviewHistory].reverse().slice(0,10).map(record=>`<div class="review-history-item"><span>${reviewTag(record.status)}</span><small>${record.at?e(new Date(record.at).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'})):''}</small></div>`).join('')}</div>`:''}
  </section>`;
  const priorPanel=prior.length?`<section class="card panel prior-task-panel"><h2>التكليفات السابقة</h2><div class="prior-task-list">${[...prior].reverse().map(old=>`<div class="prior-task-row"><span><strong>${e(old.taskNo||old.taskId||'—')}</strong><small>مرتبط سابقًا ولا يتغير عند إعادة مراجعة الفكرة</small></span><span>${old.dueDate?dl(old.dueDate):'—'}</span></div>`).join('')}</div></section>`:'';
  const executionPanel=linked?`<section class="card panel production-side-panel"><div class="page-eyebrow">التكليف الحالي</div><h2>سيستم التسويق</h2><div class="production-summary-list"><div><span>رقم التاسك</span><strong>${e(main?.marketingTaskNo||main?.marketingTaskId||'')}</strong></div><div><span>المنفذ</span><strong>${e(main?.marketingExecutorName||main?.executor||'غير محدد')}</strong></div><div><span>التسليم</span><strong>${e(main?.dueDate?dl(main.dueDate):'غير محدد')}</strong></div></div><button class="btn" data-action="bridge-open-asset" data-id="${e(idea.code)}">متابعة التكليف</button></section>`:
    `<form class="card panel p-edit-form production-side-panel" id="asset-editor"><div class="page-eyebrow">تخطيط الإنتاج</div><h2>تجهيز التنفيذ</h2><input type="hidden" name="assetCode" value="${e(idea.code)}"/>
      <label>المنفذ المقترح<select name="executor">${option('','لم أحدد بعد',main?.executor||'')}${PEOPLE.map(n=>option(n,n,main?.executor||'')).join('')}</select></label>
      <label>تاريخ التسليم المقترح<input type="date" name="dueDate" value="${e(main?.dueDate||'')}"/></label>
      <label>حالة الإنتاج<select name="status">${TASK_STATUSES.map(n=>option(n,n,main?.status||'لم يبدأ')).join('')}</select></label>
      <button class="btn" type="submit" ${state.planSaving?'disabled':''}>حفظ التخطيط</button>
      ${codes.map(id=>{const a=plan.assets.find(x=>x.code===id);return `<div class="p-mini-item">${e(a?.title||'المطلوب')} ${a?.dueDate?dl(a.dueDate):'بدون تاريخ تسليم'} · ${statusTag(a?.status||'')}</div>`;}).join('')}
    </form>`;
  return pageHeader('مراجعة البريف',idea.title,'',actions)
    +`<div class="review-workflow-steps"><span class="${status==='معتمد'?'done':'active'}">01 · مراجعة الفكرة</span><span class="${status==='معتمد'?'active':''}">02 · اختيار السيارات والتسليم</span><span class="${linked?'done':''}">03 · إنشاء التاسك</span></div>`
    +`<div class="p-two-columns idea-detail-v15"><div>${briefCard(plan,idea.code)}</div><div class="p-detail-side">${reviewPanel}${executionPanel}${priorPanel}</div></div>`;
}
export function toBriefText(plan,code){
  const a=getIdea(plan,code);
  if(!a)return '';
  const related=taskCodes(plan,code).map(id=>plan.assets.find(x=>x.code===id)).filter(Boolean);
  let lines=[`محمد ذعار العجمي للسيارات - MZJ`,`بريف إبداعي: ${a.title}`,
    `المنفذ: ${executorFor(plan,code)}`,
    `التسليم: ${related.map(r=>`${r.title||a.title} ${r.dueDate} (${r.deliveryDay})`).join(' | ')}`,
    `النوع: ${ideaKind(a)}`,''];
  if(a.kind==='carousel'){
    lines.push('الهدف:',a.audienceAndGoal,'',`عدد الصور المطلوبة: ${a.slideCodes.length}`,'','الصور بالتسلسل:');
    a.slideCodes.forEach((id,n)=>{const s=getIdea(plan,id);lines.push(`الصورة ${n+1}`,`النص: ${s.screenText}`,`التصوير/التصميم: ${s.visualDescription}`,'');});
    lines.push('الكابشن:',a.captionsByPlatform?.instagram||'','الهاشتاج:',a.hashtagsByPlatform?.instagram||'');
  } else {
    lines.push('الجمهور والهدف:',a.audienceAndGoal||'','الرسالة:',a.message||'','المعالجة الإبداعية:',a.creativeTreatment||'',
      'الهوك:',a.hook||'',...((a.kind==='image' && a.imageCount>1)?[`عدد الصور المطلوبة: ${a.imageCount}`]:[]),'النص / الفويس أوفر كاملًا:',a.script||'','');
    if(a.kind==='video'){
      lines.push('السيناريو التفصيلي:');
      for(const s of a.scenes||[])lines.push(`المشهد ${s.number}: ${s.title} (${s.startSecond}-${s.endSecond} ثانية)`,
        `الحدث: ${s.visual}`,`الكاميرا: ${s.camera}`,`الصوت: ${s.voiceOver}`,`النص الظاهر: ${s.screenText}`,
        `المؤثر: ${s.sound}`,`الانتقال: ${s.transition}`,'');
      lines.push('الأصول المطلوبة:',a.shootingAssets||'','معايير الجودة:',a.qualityNotes||'');
    } else {
      lines.push('الصور المطلوبة بالتفصيل:');
      for(const [i,slide] of imageCards(a).entries())lines.push(`الصورة ${i+1} من ${Math.max(1,Number(a.imageCount)||1)} — ${slide.title||'التصميم'}`,
        'النص النهائي للتصميم:',cleanVisualText(slide.screenText),'التصور البصري:',cleanVisualText(slide.visualDescription),
        ...(slide.supportingText?['النص المساند:',slide.supportingText]:[]),
        ...(slide.notes?['ملاحظات الصورة:',slide.notes]:[]),'');
      lines.push('شروط التصميم:',a.productionNotes||'');
    }
    lines.push('الكابشنات والهاشتاجات:');
    for(const [platform,name] of Object.entries(PLATFORMS)){
      if(a.platforms?.includes(platform))lines.push(name,`الكابشن: ${a.captionsByPlatform?.[platform]||''}`,`الهاشتاج: ${a.hashtagsByPlatform?.[platform]||''}`,'');
    }
  }
  lines.push('قواعد التنفيذ: لا تفاصيل سيارات أو أسعار أو موافقات تمويل غير مؤكدة. يجب اعتماد المحتوى قبل النشر.');
  return lines.join('\n');
}

export function teamHandoffText(plan,person,week=0){
 const assets=plan.assets.filter(a=>(person==='الكل'||a.executor===person)&&(!week||a.week===week)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.code.localeCompare(b.code));
 return `MZJ - تكليفات الإنتاج\nتبدأ التكليفات 20 نوفمبر 2026\nالمنفذ: ${person}\n\n`+assets.map(a=>toBriefText(plan,a.code)).join('\n\n'+('=').repeat(45)+'\n\n');
}
