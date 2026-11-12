import { prepareIdeaBatch } from './idea-import.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = ['تعريفي - بالبراند','تعريفي - بالويب سايت','تعريفي - مواصفات السيارات','بيعي - قسط','بيعي - كاش'];
const platforms = [['facebook','فيسبوك'],['instagram','إنستجرام'],['tiktok','تيك توك'],['snapchat','سناب شات']];
const emptyScene = () => ({title:'',startSecond:'',endSecond:'',goal:'',location:'',visual:'',voiceOver:'',screenText:'',camera:'',sound:'',transition:''});
const emptySlide = () => ({title:'',screenText:'',visualDescription:'',supportingText:'',notes:''});

export function newManualIdeaDraft() {
  return {kind:'video',title:'',marketingCategory:'',message:'',audienceAndGoal:'',hook:'',script:'',platforms:platforms.map(([key])=>key),
    visualDescription:'',productionNotes:'',caption:'',hashtags:'',
    captionsByPlatform:Object.fromEntries(platforms.map(([key])=>[key,''])),
    hashtagsByPlatform:Object.fromEntries(platforms.map(([key])=>[key,''])),
    scenes:[emptyScene()],imageSlides:[emptySlide()]};
}

function input(name,label,value,options={}) {
  const common=`name="${name}" ${options.required?'required':''} ${options.maxLength?`maxlength="${options.maxLength}"`:''}`;
  return `<label class="manual-idea-field"><span>${escape(label)}</span>${options.multiline!==false
    ? `<textarea ${common} rows="${options.rows||3}" placeholder="${escape(options.placeholder||'')}" >${escape(value)}</textarea>`
    : `<input type="text" ${common} value="${escape(value)}" placeholder="${escape(options.placeholder||'')}"/>`}</label>`;
}
function groupedRows(draft) {
  if(draft.kind==='video')return `<div class="manual-idea-groups"><div class="manual-idea-section-head"><h3>السيناريو مشهدًا بمشهد</h3><button type="button" class="btn" data-action="manual-add-scene" ${draft.scenes.length>=30?'disabled':''}>+ إضافة مشهد</button></div>
    ${draft.scenes.map((scene,i)=>`<fieldset class="manual-idea-group" data-manual-group="scene"><legend>المشهد ${i+1}</legend>
      <div class="manual-idea-group-head"><strong>تفاصيل المشهد ${i+1}</strong>${draft.scenes.length>1?`<button class="btn p-small" type="button" data-action="manual-remove-scene" data-index="${i}">حذف المشهد</button>`:''}</div>
      <div class="manual-idea-grid">${input(`scene-${i}-title`,'عنوان المشهد',scene.title,{required:true,multiline:false,maxLength:160})}
      ${input(`scene-${i}-startSecond`,'من الثانية',scene.startSecond,{multiline:false})}${input(`scene-${i}-endSecond`,'إلى الثانية',scene.endSecond,{multiline:false})}</div>
      <div class="manual-idea-grid">${input(`scene-${i}-goal`,'هدف المشهد',scene.goal)}${input(`scene-${i}-location`,'الموقع',scene.location)}</div>
      ${input(`scene-${i}-visual`,'المشهد / وصف الأحداث',scene.visual,{required:true})}
      ${input(`scene-${i}-voiceOver`,'الفويس أوفر الخاص بالمشهد',scene.voiceOver)}
      ${input(`scene-${i}-screenText`,'نص الشاشة',scene.screenText)}
      <div class="manual-idea-grid">${input(`scene-${i}-camera`,'الكاميرا',scene.camera)}${input(`scene-${i}-sound`,'الصوت',scene.sound)}${input(`scene-${i}-transition`,'الانتقال',scene.transition)}</div></fieldset>`).join('')}</div>`;
  return `<div class="manual-idea-groups"><div class="manual-idea-section-head"><h3>التصميم صورة بصورة</h3><button type="button" class="btn" data-action="manual-add-image" ${draft.imageSlides.length>=24?'disabled':''}>+ إضافة صورة</button></div>
    ${draft.imageSlides.map((slide,i)=>`<fieldset class="manual-idea-group" data-manual-group="image"><legend>الصورة ${i+1} من ${draft.imageSlides.length}</legend>
      <div class="manual-idea-group-head"><strong>تفاصيل الصورة ${i+1}</strong>${draft.imageSlides.length>1?`<button class="btn p-small" type="button" data-action="manual-remove-image" data-index="${i}">حذف الصورة</button>`:''}</div>
      ${input(`image-${i}-title`,'اسم / دور الصورة',slide.title,{multiline:false,maxLength:160})}
      ${input(`image-${i}-screenText`,'النص النهائي للتصميم',slide.screenText,{required:true})}
      ${input(`image-${i}-visualDescription`,'التصور البصري',slide.visualDescription,{required:true})}
      ${input(`image-${i}-supportingText`,'متابعة القصة / النص المساند',slide.supportingText)}
      ${input(`image-${i}-notes`,'تنبيهات التنفيذ',slide.notes)}</fieldset>`).join('')}</div>`;
}

export function manualIdeaModal(draft,busy=false,error='') {
  if(!draft)return '';
  return `<div class="manual-idea-overlay" role="presentation"><section class="manual-idea-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-idea-title" dir="rtl">
      <header class="manual-idea-dialog-header"><div><small>بنك أفكار MZJ</small><h2 id="manual-idea-title">إضافة فكرة جديدة</h2></div>
      <button type="button" class="btn" data-action="manual-close" ${busy?'disabled':''}>إغلاق</button></header>
      <form id="manual-idea-form" class="manual-idea-body">
        ${error?`<div class="notice warning" role="alert">${escape(error)}</div>`:''}
        <div class="manual-idea-grid"><label class="manual-idea-field"><span>نوع المحتوى</span><select name="kind" required>
          <option value="video" ${draft.kind==='video'?'selected':''}>فيديو</option><option value="image" ${draft.kind==='image'?'selected':''}>صورة</option></select></label>
          <label class="manual-idea-field"><span>تصنيف الفكرة</span><select name="marketingCategory" required><option value="">اختر التصنيف</option>
          ${categories.map(cat=>`<option value="${escape(cat)}" ${cat===draft.marketingCategory?'selected':''}>${escape(cat)}</option>`).join('')}</select></label></div>
        ${input('title','اسم الفكرة',draft.title,{required:true,multiline:false,maxLength:200})}
        ${input('message','الرسالة',draft.message,{required:true})}
        ${input('audienceAndGoal','الجمهور والهدف',draft.audienceAndGoal)}
        ${draft.kind==='video'?`${input('hook','الهوك',draft.hook,{required:true})}${input('script','الفويس أوفر كاملًا',draft.script,{required:true,rows:5})}`:
          input('visualDescription','التصور البصري العام',draft.visualDescription)}
        ${groupedRows(draft)}
        ${draft.kind==='image'?input('productionNotes','تنبيهات التنفيذ العامة',draft.productionNotes):''}
        <fieldset class="manual-idea-platform-selection"><legend>المنصات المستهدفة</legend><div class="manual-idea-target-platforms">
          ${platforms.map(([key,label])=>`<label><input type="checkbox" name="manual-platform" value="${key}" ${draft.platforms.includes(key)?'checked':''}/>${label}</label>`).join('')}
        </div></fieldset>
        <div class="manual-idea-section-head"><h3>الكابشن والهاشتاج</h3></div>
        <div class="manual-idea-grid">${input('caption','الكابشن العام',draft.caption)}${input('hashtags','الهاشتاج العام',draft.hashtags)}</div>
        <details class="manual-platform-captions"><summary>تخصيص الكابشن والهاشتاج حسب المنصة (اختياري)</summary>
          <div class="manual-idea-platform-grid">${platforms.map(([key,label])=>`<div class="manual-idea-platform"><strong>${label}</strong>${input(`caption-${key}`,'الكابشن',draft.captionsByPlatform[key])}${input(`hashtag-${key}`,'الهاشتاج',draft.hashtagsByPlatform[key])}</div>`).join('')}</div></details>
        <div class="manual-idea-footer"><p>تُحفظ الفكرة للمراجعة أولًا، ثم تظهر في إنشاء التكليفات بعد اعتمادها.</p>
          <button type="submit" class="btn btn-primary" ${busy?'disabled':''}>${busy?'جارٍ حفظ الفكرة…':'حفظ الفكرة الجديدة'}</button></div>
      </form></section></div>`;
}

export function readManualIdeaForm(form,previous) {
  const value=(name,fallback='')=>String(form.elements.namedItem(name)?.value??fallback).trim();
  const kind=value('kind');
  return {kind,platforms:[...form.querySelectorAll('input[name="manual-platform"]:checked')].map(row=>row.value),title:value('title'),marketingCategory:value('marketingCategory'),message:value('message'),
    audienceAndGoal:value('audienceAndGoal'),hook:value('hook',previous.hook),script:value('script',previous.script),
    visualDescription:value('visualDescription',previous.visualDescription),productionNotes:value('productionNotes',previous.productionNotes),
    caption:value('caption'),hashtags:value('hashtags'),
    captionsByPlatform:Object.fromEntries(platforms.map(([key])=>[key,value(`caption-${key}`)])),
    hashtagsByPlatform:Object.fromEntries(platforms.map(([key])=>[key,value(`hashtag-${key}`)])),
    scenes:previous.scenes.map((_,i)=>Object.fromEntries(Object.keys(emptyScene()).map(key=>[key,value(`scene-${i}-${key}`,previous.scenes[i][key])]))),
    imageSlides:previous.imageSlides.map((_,i)=>Object.fromEntries(Object.keys(emptySlide()).map(key=>[key,value(`image-${i}-${key}`,previous.imageSlides[i][key])])))};
}

/** Shares the same validated idea schema and Firestore collection as JSON imports. */
export function prepareManualIdea(draft,plan,batchId) {
  if(!['video','image'].includes(draft.kind))throw Error('اختر صورة أو فيديو.');
  if(!draft.title?.trim()||draft.title.trim().length<4)throw Error('اكتب اسمًا واضحًا للفكرة (4 أحرف على الأقل).');
  if(!draft.marketingCategory)throw Error('اختر تصنيف الفكرة.');
  if(!Array.isArray(draft.platforms)||!draft.platforms.length)throw Error('اختر منصة واحدة على الأقل للفكرة.');
  if(!draft.message?.trim())throw Error('اكتب رسالة الفكرة.');
  if(draft.kind==='video' && (!draft.hook?.trim()||!draft.script?.trim()))throw Error('اكتب الهوك والفويس أوفر كاملًا.');
  if(draft.kind==='video' && (!draft.scenes.length||draft.scenes.some(scene=>!scene.title?.trim()||!scene.visual?.trim())))
    throw Error('أكمل عنوان ووصف كل مشهد من مشاهد الفيديو.');
  if(draft.kind==='image' && (!draft.imageSlides.length||draft.imageSlides.some(slide=>!slide.screenText?.trim()||!slide.visualDescription?.trim())))
    throw Error('أكمل النص النهائي والتصور البصري لكل صورة.');
  const scenes=draft.kind==='video'?draft.scenes.map((scene,i)=>{
    const start=scene.startSecond===''?null:Number(scene.startSecond);
    const end=scene.endSecond===''?null:Number(scene.endSecond);
    if((start!==null&&(!Number.isFinite(start)||start<0))||(end!==null&&(!Number.isFinite(end)||end<0))||(start!==null&&end!==null&&end<start))
      throw Error(`المدى الزمني غير صحيح في المشهد ${i+1}.`);
    return {...scene,number:i+1,startSecond:start??'',endSecond:end??''};
  }):[];
  const captionsByPlatform=Object.fromEntries(platforms.map(([key])=>[key,draft.captionsByPlatform[key]||draft.caption||'']));
  const hashtagsByPlatform=Object.fromEntries(platforms.map(([key])=>[key,draft.hashtagsByPlatform[key]||draft.hashtags||'']));
  const raw={type:draft.kind,kind:draft.kind,title:draft.title,marketingCategory:draft.marketingCategory,
    message:draft.message,audienceAndGoal:draft.audienceAndGoal,hook:draft.kind==='video'?draft.hook:'',
    script:draft.kind==='video'?draft.script:'',scenes,
    imageSlides:draft.kind==='image'?draft.imageSlides:[],imageCount:draft.kind==='image'?draft.imageSlides.length:1,
    visualDescription:draft.kind==='image'?draft.visualDescription:'',productionNotes:draft.kind==='image'?draft.productionNotes:'',
    captionsByPlatform,hashtagsByPlatform,executor:'',platforms:draft.platforms};
  const prepared=prepareIdeaBatch({batchId,ideas:[raw]},plan);
  if(prepared.duplicates.length||prepared.items.length!==1)throw Error('يوجد بالفعل فكرة بنفس الاسم في بنك الأفكار.');
  return {...prepared.items[0],source:'manual'};
}

export { emptyScene, emptySlide };
