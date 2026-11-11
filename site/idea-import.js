// Safe, additive JSON idea batches. The original publishing plan is immutable at root.
export const IDEA_BATCH_SCHEMA = 'mzj-ideas-batch/v1';
const PEOPLE = ['محمود', 'بلال', 'عبدالله'];
const PLATFORM_KEYS = ['facebook', 'instagram', 'tiktok', 'snapchat'];
const text = (value, max=20000) => String(value ?? '').trim().slice(0,max);
export const validISODate = value => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const day=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10)===value;
};
const comparable = value => text(value,220).normalize('NFKC').toLocaleLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ');
const kindFor = value => {
  const input=text(value,40).toLocaleLowerCase();
  if(['video','فيديو'].includes(input))return 'video';
  if(['image','photo','picture','صورة'].includes(input))return 'image';
  throw Error('الأنواع المدعومة للأفكار الجديدة هي «صورة» و«فيديو» فقط.');
};
const platformList = values => {
  if(values==null)return [];
  if(!Array.isArray(values) || values.some(v=>!PLATFORM_KEYS.includes(v)))throw Error('قائمة المنصات يجب أن تحتوي على أسماء منصات معتمدة فقط.');
  return [...new Set(values)];
};
const safeMap = (raw, max=2500) => {
  if(raw==null)return {};
  if(typeof raw!=='object'||Array.isArray(raw))throw Error('نصوص الكابشن والهاشتاج يجب أن تكون عناصر JSON صحيحة.');
  return Object.fromEntries(PLATFORM_KEYS.map(key=>[key,text(raw[key],max)]));
};
const codeAllowed = code => /^[A-Za-z0-9_-]{3,44}$/.test(code);
const createAutoCode = (batchId,index)=>{
  const tag=(text(batchId,22).normalize('NFKD').replace(/[^A-Za-z0-9]/g,'').toUpperCase()||'IDEAS').slice(0,14);
  return `N${tag}-${String(index+1).padStart(3,'0')}`;
};
export function prepareIdeaBatch(data, existingPlan, options={}) {
  if(!existingPlan?.assets||!Array.isArray(existingPlan.assets))throw Error('يجب تحميل الخطة الحالية قبل إضافة أفكار جديدة.');
  if(data?.schema && data.schema!==IDEA_BATCH_SCHEMA)throw Error('صيغة ملف الأفكار غير معتمدة. استخدم نموذج استيراد الأفكار.');
  const source=Array.isArray(data)?data:(data?.ideas);
  if(!Array.isArray(source)||source.length===0||source.length>80)throw Error('ملف الأفكار يجب أن يحتوي على 1 إلى 80 فكرة في ideas.');
  const ids=new Set([...existingPlan.assets.map(a=>a.code),...(existingPlan.carousels||[]).map(a=>a.code)]);
  // Replacement uses new immutable codes, but may legitimately reuse existing titles.
  const titles=options.replace ? new Set() : new Set([...existingPlan.assets,...(existingPlan.carousels||[])].map(a=>comparable(a.title)));
  const incomingCodes=new Set(), incomingTitles=new Set();
  const batchId=String(data?.batchId||Date.now().toString(36)).trim();
  const items=[],duplicates=[];
  for(let index=0;index<source.length;index++){
    const raw=source[index];
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error(`الفكرة رقم ${index+1} ليست عنصر JSON صالحًا.`);
    const title=text(raw.title,200), code=text(raw.code,44)||createAutoCode(batchId,index);
    if(!title || title.length<4)throw Error(`عنوان الفكرة رقم ${index+1} ناقص.`);
    if(!codeAllowed(code))throw Error(`كود الفكرة «${code}» غير صالح؛ استخدم الحروف والأرقام والشرطة فقط.`);
    const titleKey=comparable(title);
    if(ids.has(code)||titles.has(titleKey)||incomingCodes.has(code)||incomingTitles.has(titleKey)){
      duplicates.push({code,title});continue;
    }
    const kind=kindFor(raw.type??raw.kind);
    const executor=text(raw.executor,30);
    if(executor&&!PEOPLE.includes(executor))throw Error(`منفذ «${executor}» غير موجود ضمن الفريق في الفكرة ${code}.`);
    const imageCount=kind==='image'?(Number(raw.imageCount??1)):1;
    if(!Number.isInteger(imageCount)||imageCount<1||imageCount>24)throw Error(`عدد الصور في الفكرة ${code} لازم يكون من 1 إلى 24.`);
    const dueDate=raw.dueDate?text(raw.dueDate,10):'';
    if(dueDate&&!validISODate(dueDate))throw Error(`تاريخ التسليم غير صالح في الفكرة ${code}.`);
    const platforms=platformList(raw.platforms);
    if(raw.scenes!=null && (!Array.isArray(raw.scenes)||raw.scenes.length>30))throw Error(`مشاهد الفكرة ${code} غير صالحة.`);
    const scenes=(raw.scenes||[]).map((scene,i)=>{
      if(!scene||typeof scene!=='object'||Array.isArray(scene))throw Error(`المشهد ${i+1} في ${code} غير صالح.`);
      return Object.fromEntries(Object.entries(scene).filter(([key])=>['number','startSecond','endSecond','title','goal','location','visual','voiceOver','screenText','camera','sound','transition'].includes(key)).map(([key,value])=>[key,typeof value==='number'?value:text(value,4000)]));
    });
    const idea={
      code,kind,title,executor,dueDate,imageCount,week:0,deliveryDay:'',status:'لم يبدأ',
      sourceIdeaCode:text(raw.sourceIdeaCode,50),executionMethod:text(raw.executionMethod,200),
      durationSeconds:kind==='video'&&Number.isFinite(Number(raw.durationSeconds))?Math.max(0,Number(raw.durationSeconds)):0,
      reviewStatus:'بانتظار المراجعة',reviewNotes:'',reviewedAt:null,reviewedByUid:'',reviewHistory:[],
      importedBatchId:text(batchId,60),category:text(raw.category,120),
      audienceAndGoal:text(raw.audienceAndGoal,3000),message:text(raw.message,3000),
      creativeTreatment:text(raw.creativeTreatment,5000),hook:text(raw.hook,3000),
      script:text(raw.script,18000),scenes,screenText:text(raw.screenText,5000),
      visualDescription:text(raw.visualDescription,7000),
      captionsByPlatform:safeMap(raw.captionsByPlatform),hashtagsByPlatform:safeMap(raw.hashtagsByPlatform,1000),
      platforms,productionNotes:text(raw.productionNotes,5000),shootingAssets:text(raw.shootingAssets,5000),
      qualityNotes:text(raw.qualityNotes,5000),comments:''
    };
    items.push(idea);incomingCodes.add(code);incomingTitles.add(titleKey);
  }
  return {items,duplicates,total:source.length,batchId};
}
export function ideaBatchTemplate(){
  return {schema:IDEA_BATCH_SCHEMA,batchId:'NOV-2026-02',ideas:[
    {code:'N2611-001',title:'عنوان فكرة صورة جديدة',type:'image',imageCount:3,executor:'محمود',dueDate:'',platforms:['instagram','facebook'],audienceAndGoal:'الجمهور والهدف',message:'الرسالة البيعية',visualDescription:'وصف كل صورة وتوجيه التنفيذ',screenText:'النص على الصور',productionNotes:'شروط التصميم',captionsByPlatform:{instagram:'الكابشن باللهجة السعودية'},hashtagsByPlatform:{instagram:'#اسم_الحملة'}},
    {code:'N2611-002',title:'عنوان فكرة فيديو جديدة',type:'video',executor:'بلال',dueDate:'',platforms:['tiktok','snapchat'],audienceAndGoal:'الجمهور والهدف',hook:'هوك سعودي قوي',script:'نص الفويس أوفر باللهجة السعودية',scenes:[],shootingAssets:'المطلوبات',qualityNotes:'شروط التنفيذ',captionsByPlatform:{tiktok:'الكابشن باللهجة السعودية'}}
  ]};
}
