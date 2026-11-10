// Editable content-cycle UI, with zero private plan data embedded in public JS.
export const PEOPLE = ['محمود','بلال','عبدالله'];
export const PLATFORMS = {instagram:'إنستجرام',facebook:'فيسبوك',tiktok:'تيك توك',snapchat:'سناب شات'};
export const PLAN_SCHEMA = 'mzj-content-plan/v1';
export const PLAN_CODE = 'mzj-2026-launch-cycle-01';
export const TASK_STATUSES = ['لم يبدأ','قيد التنفيذ','قيد المراجعة','مطلوب تعديل','قيد التعديل','معتمد','مرفوض'];
export const POST_STATUSES = ['مخطط','قيد التجهيز','قيد المراجعة','جاهز للنشر','منشور','مؤجل'];

export const escapeText = input => String(input ?? '').replace(/[&<>"']/g, x=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[x]);
const e = escapeText;
const dl=(iso)=>iso ? new Intl.DateTimeFormat('ar-EG-u-nu-latn',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Riyadh'}).format(new Date(iso+'T12:00:00Z')) : 'غير محدد';
const weekday=(iso)=>iso ? new Intl.DateTimeFormat('ar-EG',{weekday:'long',timeZone:'Asia/Riyadh'}).format(new Date(iso+'T12:00:00Z')) : '';
const shorten=(txt,count=95)=>String(txt||'').length>count?String(txt).slice(0,count)+'…':String(txt||'');
const pill=(text,type='')=>`<span class="plan-pill ${type}">${e(text)}</span>`;
const pTags=(platforms)=> (platforms||[]).map(p=>pill(PLATFORMS[p]||p,'p-platform')).join(' ');
const statusTag=(name)=>pill(name, name==='معتمد'||name==='جاهز للنشر'?'p-ready':name==='مطلوب تعديل'||name==='مرفوض'||name==='مؤجل'?'p-error':'p-neutral');
const option=(value,label,selected)=>`<option value="${e(value)}" ${String(value)===String(selected)?'selected':''}>${e(label)}</option>`;
const kindLabel={video:'فيديو',image:'صورة منشور',story_design:'تصميم قصة',carousel_slide:'شريحة كاروسيل',carousel:'كاروسيل'};

export const taskCodes = (plan,code)=>code?.startsWith('C') ? (plan.carousels.find(x=>x.code===code)?.slideCodes||[]) : [code];
export const getIdea=(plan,code)=>plan?.assets?.find(a=>a.code===code)||plan?.carousels?.find(c=>c.code===code)||null;
export const executorFor=(plan,code)=> {
  if(!code)return '—';
  const a=plan.assets.find(a=>a.code===code);
  if(a)return a.executor;
  const c=plan.carousels.find(a=>a.code===code);
  return c ? plan.assets.find(a=>a.code===c.slideCodes[0])?.executor || '—' : '—';
};
const ideaKind=(idea)=>kindLabel[idea?.kind]||'غير معروف';
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
  const approved=p.assets.filter(x=>x.status==='معتمد').length;
  const video=p.assets.filter(x=>x.kind==='video').length;
  const visual=p.assets.filter(x=>x.kind!=='video').length;
  const shown=[['أيام خطة النشر',p.posts.length],['فيديو أصلي',video],['صور أصلية',visual],['أصول معتمدة',approved]];
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
export function planPage(state){
  const p=state.plan;
  if(!p)return pageHeader('خطة المحتوى','تقويم النشر والتكليفات','ملف الاستيراد يحوّل الاستراتيجية إلى برنامج تنفيذ قابل للتعديل.')+importPanel(state);
  const search=(state.planFilter||'').trim().toLocaleLowerCase();
  const filtered=p.posts.filter(post=>{
    const a=getIdea(p,post.ideaCode);
    return !search||[post.ideaCode,a?.title,executorFor(p,post.ideaCode),post.publicationDate,post.story?.code,...(post.platforms||[])].join(' ').toLowerCase().includes(search);
  });
  const actions=`<button class="btn" data-action="export-plan">تصدير نسخة JSON</button><button class="btn btn-tonal" data-nav="tasks">تسليمات الفريق</button>`;
  const weeks=[1,2,3,4].map(week=>{
    const rows=p.posts.filter(x=>x.week===week);
    return `<section class="plan-week"><header><strong>الأسبوع ${week}</strong><span>${dl(rows[0]?.publicationDate)} - ${dl(rows.at(-1)?.publicationDate)}</span></header><div class="plan-week-days">${rows.map(post=>{
      const idea=getIdea(p,post.ideaCode);
      return `<button type="button" class="plan-day" data-action="open-post" data-id="${e(post.id)}">
        <span class="plan-day-date">${e(weekday(post.publicationDate))} <bdi dir="ltr">${e(post.publicationDate.slice(8))}</bdi></span>
        <strong>${e(idea?.title||post.ideaCode)}</strong><span class="plan-day-meta">${e(post.ideaCode)} · ${e(ideaKind(idea))}</span><span class="plan-day-foot">${e(executorFor(p,post.ideaCode))}</span>
      </button>`;
    }).join('')}</div></section>`;
  }).join('');
  const rows=filtered.map(post=>{
    const idea=getIdea(p,post.ideaCode);const primary=post.platforms?.[0]||'instagram';
    const cap=post.captionsByPlatform?.[primary]||'';
    const hash=hashtags(post.hashtagsByPlatform,primary);
    return `<tr><td><strong>${e(weekday(post.publicationDate))}</strong><small dir="ltr">${e(post.publicationDate)}</small></td>
      <td><button class="p-link" data-action="open-post" data-id="${e(post.id)}">${e(post.ideaCode)} · ${e(idea?.title||'')}</button><small>${e(ideaKind(idea))}</small></td>
      <td>${pTags(post.platforms)}</td><td><div class="p-truncate">${e(shorten(idea?.script||idea?.hook||''))}</div></td>
      <td><div class="p-truncate">${e(shorten(cap))}</div></td><td><div class="p-truncate">${e(shorten(hash,75))}</div></td>
      <td>${e(executorFor(p,post.ideaCode))}</td><td>${statusTag(post.status)}</td><td><button class="btn p-small" data-action="open-post" data-id="${e(post.id)}">فتح</button></td></tr>`;
  }).join('');
  return pageHeader('خطة التشغيل • 28 يومًا','تقويم النشر والتنشيط','تبدأ التكليفات من 20 نوفمبر. مواعيد النشر مقترحة ولا تُفعَّل قبل مراجعة واعتماد الملفات.',actions)
    +`<div class="notice">${e(p.productionStartDate)} بدء تجهيز المطلوبات · أول تسليم مقترح ${dl(p.firstDeliveryDate)} · بداية نشر مقترحة ${dl(p.proposedPublishStartDate)}. يمكن تغيير كل موعد نشر داخل الجدول. المحتوى لا يُنشر آليًا.</div>`
    +countTiles(p)+`<div class="section-heading"><div><h2>تقويم الأيام</h2><p>اضغط على أي يوم لفتح الفكرة والسكريبت والكابشن والتحرير.</p></div></div><div class="plan-weeks">${weeks}</div>`
    +`<div class="section-heading"><div><h2>جدول النشر التفصيلي</h2><p>السكريبت والكابشن والهاشتاج معروضة باختصار؛ افتح أي صف للنص الكامل لكل منصة.</p></div></div>`
    +`<div class="p-filter"><label for="plan-filter">بحث في الفكرة أو المنفذ أو التاريخ</label><input id="plan-filter" placeholder="مثال: محمود أو V01 أو 2026-12" value="${e(state.planFilter||'')}"/><button class="btn" data-action="apply-plan-filter">بحث</button><button class="btn" data-action="clear-plan-filter">مسح</button></div>`
    +`<div class="card p-table-wrap"><table class="p-table"><thead><tr><th>التاريخ</th><th>الفكرة</th><th>المنصات</th><th>السكريبت / النص</th><th>الكابشن</th><th>الهاشتاج</th><th>المنفذ</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>${rows||'<tr><td colspan="9">لا توجد نتائج لهذا البحث.</td></tr>'}</tbody></table></div>`
    +`<div class="notice">الـ4 كاروسيلات تتكون من 16 صورة؛ وتصميمات القصص الثمانية ضمن أصل الصور الـ32. أيام النشر الـ28 لا تعني 28 ملف فيديو جديدًا.</div>`;
}

export function tasksPage(state){
  const p=state.plan;
  if(!p)return pageHeader('الإنتاج والتسليم','تكليفات الفريق','ارفع ملف الاستيراد أولًا لعرض المطلوبات.')+importPanel(state);
  const person=state.taskPerson||'الكل';
  const week=Number(state.taskWeek||0);
  const assets=p.assets.filter(a=>(person==='الكل'||a.executor===person)&&(!week||a.week===week)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.code.localeCompare(b.code));
  const days=[...new Set(assets.map(a=>a.dueDate))].sort();
  const actions=`<button class="btn" data-action="download-handoff" data-person="${e(person)}">تنزيل تكليفات ${e(person)} (TXT)</button><button class="btn" data-nav="plan">الرجوع للتقويم</button>`;
  return pageHeader('الإنتاج • التسليم الأحد والأربعاء','تكليفات فريق المحتوى','بداية توزيع الأعمال 20 نوفمبر. كل فرد له حصته الأسبوعية المؤكدة، والاعتماد قبل النشر.',actions)
    +`<div class="plan-kpis">${PEOPLE.map(n=>{
      const aa=p.assets.filter(a=>a.executor===n&&(!week||a.week===week));
      return `<div class="card plan-kpi"><small>${e(n)}</small><strong>${aa.length}</strong><small>${aa.filter(x=>x.kind==='video').length} فيديو · ${aa.filter(x=>x.kind!=='video').length} صورة/شريحة</small></div>`;
    }).join('')}</div>`
    +`<div class="p-filter"><label for="task-person">فلتر المنفذ</label><select id="task-person">${['الكل',...PEOPLE].map(n=>option(n,n,person)).join('')}</select><label for="task-week">الأسبوع</label><select id="task-week">${[0,1,2,3,4].map(n=>option(n,n?'الأسبوع '+n:'الكل',week)).join('')}</select></div>`
    +days.map(date=>`<section class="card plan-delivery"><h2>${e(weekday(date))} · ${dl(date)} <small>(${assets.filter(x=>x.dueDate===date).length} ملفات)</small></h2><div class="p-task-grid">${assets.filter(x=>x.dueDate===date).map(a=>`<div class="p-task"><div><span class="p-code">${e(a.code)}</span>${pill(ideaKind(a))}<h3>${e(a.title)}</h3><p>${e(a.executor)} · ${statusTag(a.status)}</p></div><div class="p-task-bottom"><button class="btn p-small" data-action="open-asset" data-id="${e(a.code)}">فتح البريف وتعديل التكليف</button><button class="btn p-small" data-action="download-brief" data-id="${e(a.code)}">تحميل البريف</button></div></div>`).join('')}</div></section>`).join('')
    +`<div class="notice">تم فصل يوم التسليم عن يوم النشر. الاعتماد النهائي قبل النشر بفاصل لا يقل عن 24 ساعة، حسب خطة الإدارة.</div>`;
}

export function ideasPage(state){
  const p=state.plan;
  if(!p)return pageHeader('الأفكار','بنك الأفكار','الملف المصدر يحتوي كل الأفكار والأصول.')+importPanel(state);
  const type=state.ideaKind||'all';const search=(state.ideaSearch||'').toLowerCase();
  const ideas=[...p.assets,...p.carousels].filter(x=>(type==='all'||x.kind===type)&&(!search||`${x.code} ${x.title} ${x.executor}`.toLowerCase().includes(search)));
  return pageHeader('المكتبة الإبداعية','الأفكار والبريفات','16 فيديو، 8 صور منشورات، 8 تصميمات قصص، 16 شريحة كاروسيل، وأربع مجموعات كاروسيل.')
    +`<div class="p-filter"><label for="idea-kind">النوع</label><select id="idea-kind">${[['all','كل الأنواع'],['video','فيديو'],['image','صورة منشور'],['carousel','كاروسيل كامل'],['carousel_slide','شريحة كاروسيل'],['story_design','تصميم قصة']].map(([k,v])=>option(k,v,type)).join('')}</select><label for="idea-search">بحث</label><input id="idea-search" placeholder="الكود أو عنوان الفكرة" value="${e(state.ideaSearch||'')}"/><button class="btn" data-action="apply-idea-search">بحث</button></div>`
    +`<div class="p-ideas-grid">${ideas.map(a=>`<section class="card p-idea"><div class="p-idea-head">${pill(a.code,'p-code')}${pill(ideaKind(a))}</div><h2>${e(a.title)}</h2><p>${e(shorten(a.message||a.audienceAndGoal||a.hook||'',125))}</p><div class="p-idea-footer"><small>${e(executorFor(p,a.code))}</small><button class="btn p-small" data-action="open-asset" data-id="${e(a.code)}">فتح البريف</button></div></section>`).join('')}</div>`;
}

export function postDetailPage(state){
  const p=state.plan;const post=p?.posts.find(x=>x.id===state.selectedPostId);
  if(!post)return pageHeader('النشر','تعذر فتح اليوم','ارجع إلى تقويم النشر.');
  const asset=getIdea(p,post.ideaCode);
  const opts=[...p.assets.filter(a=>a.kind==='video'||a.kind==='image'),...p.carousels].sort((a,b)=>a.code.localeCompare(b.code)).map(a=>option(a.code,`${a.code} | ${a.title}`,post.ideaCode)).join('');
  const tabs=Object.entries(PLATFORMS).map(([k,n])=>`<div class="p-platform-edit"><label class="p-check"><input type="checkbox" name="platform_${k}" ${post.platforms.includes(k)?'checked':''}/> ${e(n)}</label><label>الكابشن - ${e(n)}<textarea name="caption_${k}" rows="3">${e(post.captionsByPlatform?.[k]||'')}</textarea></label><label>الهاشتاج - ${e(n)}<textarea name="hashtags_${k}" rows="2">${e(post.hashtagsByPlatform?.[k]||'')}</textarea></label></div>`).join('');
  const actions=`<button class="btn" data-nav="plan">الرجوع للتقويم</button><button class="btn" data-action="download-brief" data-id="${e(post.ideaCode)}">تحميل بريف الفكرة</button>`;
  return pageHeader('تفاصيل يوم النشر',`${post.id} · ${asset?.title||post.ideaCode}`,'تعديل الفكرة والمنفذ والمنصات والنصوص والمواعيد محفوظ في Firestore فقط عند الضغط على حفظ.',actions)
    +`<div class="p-two-columns"><form id="post-editor" class="card panel p-edit-form">
      <h2>إعدادات النشر</h2>
      <div class="p-form-grid"><label>تاريخ النشر المقترح<input name="publicationDate" type="date" required value="${e(post.publicationDate)}"/></label><label>الوقت المقترح<input name="time" type="time" required value="${e(post.time)}"/></label></div>
      <label>اختيار الفكرة<select name="ideaCode" id="post-idea-select">${opts}</select></label>
      <p class="p-help">عند تغيير الفكرة سيتم تحميل كابشناتها وهاشتاجاتها الأصلية تلقائيًا إلى الحقول؛ راجعها قبل الحفظ.</p>
      <div class="p-form-grid"><label>المنفذ<select name="executor">${PEOPLE.map(n=>option(n,n,executorFor(p,post.ideaCode))).join('')}</select></label><label>حالة النشر<select name="status">${POST_STATUSES.map(n=>option(n,n,post.status)).join('')}</select></label></div>
      <label>رابط المنشور بعد النشر (اختياري حتى التنفيذ)<input name="publishedUrl" type="url" dir="ltr" placeholder="https://..." value="${e(post.publishedUrl||'')}"/></label>
      <label>ملاحظات العمل<textarea name="notes" rows="2">${e(post.notes||'')}</textarea></label>
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
  if(a.kind==='carousel')return `<section class="card panel p-brief-card"><div class="p-head-inline">${pill(a.code,'p-code')} ${pill('كاروسيل')}</div><h2>${e(a.title)}</h2><p>${e(a.audienceAndGoal)}</p><h3>الشرائح بالتسلسل</h3>${a.slideCodes.map((id,n)=>{const s=getIdea(plan,id);return `<div class="p-scene"><strong>الشريحة ${n+1} · ${e(id)}</strong><p class="p-quote">${e(s.screenText)}</p><p>${e(s.visualDescription)}</p></div>`;}).join('')}<h3>الكابشن</h3><p class="p-quote">${e(a.captionsByPlatform?.instagram||'')}</p><h3>الهاشتاج</h3><p>${e(a.hashtagsByPlatform?.instagram||'')}</p>${embedded?`<button class="btn" data-action="open-asset" data-id="${e(code)}">تفاصيل كل شريحة</button>`:''}</section>`;
  let chapters='';
  if(a.kind==='video')chapters=`<h3>الهوك</h3><p class="p-quote">${e(a.hook)}</p><h3>الفويس أوفر كاملًا</h3><p class="p-voice">${e(a.script)}</p><h3>السيناريو مشهدًا بمشهد</h3>${(a.scenes||[]).map(sc=>`<div class="p-scene"><strong>المشهد ${e(sc.number)} | ${e(sc.startSecond)}–${e(sc.endSecond)} ثانية · ${e(sc.title)}</strong><p><b>المشهد:</b> ${e(sc.visual)}</p><p><b>الفويس أوفر:</b> ${e(sc.voiceOver)}</p><p><b>نص الشاشة:</b> ${e(sc.screenText)}</p><p><b>الكاميرا:</b> ${e(sc.camera)}</p><p><b>الصوت:</b> ${e(sc.sound)}</p><p><b>الانتقال:</b> ${e(sc.transition)}</p></div>`).join('')}<h3>مطلوبات التصوير</h3><p>${e(a.shootingAssets)}</p><h3>شروط التنفيذ</h3><p>${e(a.qualityNotes)}</p>`;
  else chapters=`<h3>النص النهائي للتصميم</h3><p class="p-quote">${e(a.screenText||a.script)}</p><h3>التصور البصري</h3><p>${e(a.visualDescription||a.creativeTreatment)}</p><h3>متابعة القصة / النص المساند</h3><p>${e(a.script||'')}</p><h3>تنبيهات التنفيذ</h3><p>${e(a.productionNotes||'')}</p>`;
  const caps=Object.entries(a.captionsByPlatform||{}).filter(([,v])=>v).map(([k,v])=>`<p><b>${e(PLATFORMS[k]||k)}:</b> ${e(v)}</p>`).join('');
  return `<section class="card panel p-brief-card"><div class="p-head-inline">${pill(a.code,'p-code')} ${pill(ideaKind(a))}</div><h2>${e(a.title)}</h2><p>${e(a.audienceAndGoal||'')}</p><p><b>الرسالة:</b> ${e(a.message||'')}</p>${chapters}<h3>الكابشن حسب المنصة</h3>${caps||'<p>تصميم تابع لمنشور الكاروسيل أو قصة مستقلة.</p>'}<h3>الهاشتاج</h3><p>${e(a.hashtagsByPlatform?.instagram||'لا توجد هاشتاجات مطلوبة لهذا الأصل')}</p>${embedded?`<button class="btn" data-action="open-asset" data-id="${e(code)}">فتح البريف كاملًا</button>`:''}</section>`;
}

export function assetDetailPage(state){
  const plan=state.plan;const idea=getIdea(plan,state.selectedAssetCode);
  if(!idea)return pageHeader('البريف','الفكرة غير موجودة','ارجع إلى بنك الأفكار.');
  const codes=taskCodes(plan,idea.code);
  const main=plan.assets.find(a=>a.code===codes[0]);
  const carousel=idea.kind==='carousel';
  const actions=`<button class="btn" data-nav="ideas">بنك الأفكار</button><button class="btn" data-action="copy-brief" data-id="${e(idea.code)}">نسخ البريف</button><button class="btn btn-primary" data-action="download-brief" data-id="${e(idea.code)}">تنزيل البريف TXT</button>`;
  return pageHeader('بريف إنتاج كامل',`${idea.code} · ${idea.title}`,'يمكن تسليم النص لفريق المونتاج كما هو، وتعديل التكليف والتسليم والحالة من النموذج المجاور.',actions)
   +`<div class="p-two-columns"><div>${briefCard(plan,idea.code)}<div class="notice">راجع السيارة والفئة والهوية والموافقات قبل الإنتاج والنشر؛ البريف لا يثبت سعرًا أو عرضًا غير معتمد.</div></div><div class="p-detail-side"><form class="card panel p-edit-form" id="asset-editor"><h2>إسناد الفكرة</h2><input type="hidden" name="assetCode" value="${e(idea.code)}"/>
   <label>المنفذ<select name="executor">${PEOPLE.map(n=>option(n,n,main?.executor||'عبدالله')).join('')}</select></label>
   ${!carousel?`<label>تاريخ التسليم<input type="date" name="dueDate" required value="${e(main?.dueDate||'')}"/></label>`:`<p class="p-help">الكاروسيل عبارة عن أربع شرائح لها تسليمات أصلية يوم الأحد والأربعاء؛ تغيير المنفذ ينطبق على الشرائح الأربع ولا يدمج تاريخ تسليمها.</p>`}
   <label>حالة التنفيذ<select name="status">${TASK_STATUSES.map(n=>option(n,n,main?.status||'لم يبدأ')).join('')}</select></label>
   <label>ملاحظات التنفيذ<textarea name="comments" rows="4">${e(main?.comments||'')}</textarea></label>
   <button class="btn btn-primary" type="submit" ${state.planSaving?'disabled':''}>حفظ التكليف</button>
   ${codes.map(id=>{const a=plan.assets.find(x=>x.code===id);return `<div class="p-mini-item">${pill(id)} ${dl(a?.dueDate)} · ${statusTag(a?.status||'')}</div>`;}).join('')}
   </form></div></div>`;
}

export function toBriefText(plan,code){
  const a=getIdea(plan,code);
  if(!a)return '';
  const related=taskCodes(plan,code).map(id=>plan.assets.find(x=>x.code===id)).filter(Boolean);
  let lines=[`محمد ذعار العجمي للسيارات - MZJ`,`بريف إبداعي: ${a.code} | ${a.title}`,
    `المنفذ: ${executorFor(plan,code)}`,
    `التسليم: ${related.map(r=>`${r.code} ${r.dueDate} (${r.deliveryDay})`).join(' | ')}`,
    `النوع: ${ideaKind(a)}`,''];
  if(a.kind==='carousel'){
    lines.push('الهدف:',a.audienceAndGoal,'','الشرائح:');
    a.slideCodes.forEach((id,n)=>{const s=getIdea(plan,id);lines.push(`الشريحة ${n+1} / ${id}`,`النص: ${s.screenText}`,`التصوير/التصميم: ${s.visualDescription}`,'');});
    lines.push('الكابشن:',a.captionsByPlatform?.instagram||'','الهاشتاج:',a.hashtagsByPlatform?.instagram||'');
  } else {
    lines.push('الجمهور والهدف:',a.audienceAndGoal||'','الرسالة:',a.message||'','المعالجة الإبداعية:',a.creativeTreatment||'',
      'الهوك:',a.hook||'','النص / الفويس أوفر كاملًا:',a.script||'','');
    if(a.kind==='video'){
      lines.push('السيناريو التفصيلي:');
      for(const s of a.scenes||[])lines.push(`المشهد ${s.number}: ${s.title} (${s.startSecond}-${s.endSecond} ثانية)`,
        `الحدث: ${s.visual}`,`الكاميرا: ${s.camera}`,`الصوت: ${s.voiceOver}`,`النص الظاهر: ${s.screenText}`,
        `المؤثر: ${s.sound}`,`الانتقال: ${s.transition}`,'');
      lines.push('الأصول المطلوبة:',a.shootingAssets||'','ملاحظات المراجعة:',a.qualityNotes||'');
    } else lines.push('التصميم البصري:',a.visualDescription||'','النص على التصميم:',a.screenText||'','ملاحظات:',a.productionNotes||'');
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
