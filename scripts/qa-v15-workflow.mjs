// Offline regression test: review -> approval -> vehicle confirmation -> eligible task form.
// No network requests or changes to real Marketing/Firestore data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareIdeaBatch,ideaBatchTemplate,validISODate} from '../site/idea-import.js';
import {ideasPage,assetDetailPage,planPage,schedulePage,reviewStatusFor,ideaIsApproved,ideaAssets,mediaType,nowInRiyadh} from '../site/planner.js';
import {bridgePage,selectBridgeIdea,newBridgeState} from '../site/marketing-bridge.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json'),'utf8'));
const state={plan,planStatus:'preview',ideaKind:'all',ideaReviewFilter:'all',ideaSearch:'',ideaImportOpen:false,
  pendingIdeaBatch:null,ideaImportError:'',planSaving:false,selectedAssetCode:'V01',calendarMonth:'2026-12',calendarSelectedDate:'2026-12-07',
  calendarPlatform:'all',calendarExecutor:'all',calendarMedia:'all',calendarStatus:'all',planFilter:'',bridge:newBridgeState()};
assert.equal(reviewStatusFor(plan,'V01'),'بانتظار المراجعة');
assert.equal(mediaType(plan.carousels[0]),'image');
const bankBefore=ideasPage(state);
assert(bankBefore.includes('مراجعة الفكرة'));
assert(bankBefore.includes('بانتظار المراجعة'));
assert(bankBefore.includes('استيراد أفكار JSON'));
assert(!bankBefore.includes('كاروسيل')&&!bankBefore.includes('صورة منشور'));
const briefBefore=assetDetailPage(state);
assert(briefBefore.includes('id="idea-review-form"') && briefBefore.includes('value="معتمد"'));
assert(!briefBefore.match(/<form id="idea-review-form"[\s\S]*?<\/form>/)?.[0].includes('value="مطلوب تعديل"') && briefBefore.includes('value="مرفوض"'));
assert(!briefBefore.includes('id="bridge-assign"'));
selectBridgeIdea(state,'V01');
let bridgeBefore=bridgePage(state);
assert(bridgeBefore.includes('هذه الفكرة غير معتمدة بعد'));
assert(!bridgeBefore.includes('id="bridge-assign"'));
const source=plan.assets.find(a=>a.code==='V01');
source.reviewStatus='معتمد';source.reviewNotes='مراجعة كاملة دون ملاحظات';source.reviewedAt='2026-11-11T01:00:00.000Z';
source.reviewHistory=[{status:'معتمد',at:source.reviewedAt,notes:source.reviewNotes}];
assert(ideaIsApproved(plan,'V01'));
const approvedBrief=assetDetailPage(state);
assert(approvedBrief.includes('تجهيز تكليف جديد')&&approvedBrief.includes('سجل المراجعات'));
assert(approvedBrief.includes('إلغاء الاعتماد وإعادة للمراجعة'));
assert(!briefBefore.includes('إلغاء الاعتماد وإعادة للمراجعة'));
assert(approvedBrief.includes('تاريخ التسليم المقترح'));
state.bridge.stock=[{car_name:'هيونداي',statement:'توسان - سمارت',model_year:'2026',exterior_color:'أسود',interior_color:'بيج'}];
state.bridge.executors=[{user_id:'uid1',department_id:'dep1',full_name:'محمود',department_name:'التسويق'}];
state.bridge.taskTypes=[{id:'id1',name:'تصميم ومونتاج'}];
state.bridge.formats=[{id:'fmt1',name:'مقاس رأسي',platform_name:'إنستجرام',width:1080,height:1920,mediaKinds:['video']}];
bridgeBefore=bridgePage(state);
assert(bridgeBefore.includes('id="bridge-approval"')&&bridgeBefore.includes('هيونداي'));
assert(bridgeBefore.includes('name="dueOn" required'));
assert(bridgeBefore.includes('اختيار السيارات')); // workflow step and gating notice
const car=state.bridge.stock[0];
source.approvedVehicles=[car];source.approvedCarMode='single';source.creativeApprovedAt='2026-11-11T02:00:00.000Z';
selectBridgeIdea(state,'V01');
const bridgeAfter=bridgePage(state);
assert(bridgeAfter.includes('إنشاء تاسك في سيستم التسويق'));
assert(bridgeAfter.includes('الفكرة والسيارات معتمدتان'));
assert(bridgeAfter.includes('name="dueOn" required'));
source.marketingTaskId='task-123';source.marketingTaskNo='TASK-123';source.marketingExecutorName='محمود';
assert(bridgePage(state).includes('TASK-123'));
assert(!bridgePage(state).includes('id="bridge-assign"'));
assert(assetDetailPage(state).includes('id="idea-review-form"'));
assert(assetDetailPage(state).includes('إلغاء الاعتماد وإعادة للمراجعة'));
assert(assetDetailPage(state).includes('سيستم التسويق'));
// New monthly JSON batches never overwrite legacy assets; no executor required before approval.
const batch=prepareIdeaBatch({schema:'mzj-ideas-batch/v1',batchId:'FUTURE-2027',ideas:[
  {title:'مقارنة بين سيارتين بصورة واحدة',type:'صورة',imageCount:1,platforms:['instagram']},
  {title:'مقطع تفاعلي بسؤال سعودي',type:'فيديو',platforms:['tiktok']},
  {title:'مقطع تفاعلي بسؤال سعودي',type:'فيديو',platforms:['tiktok']}
]},plan);
assert.equal(batch.items.length,2);assert.equal(batch.duplicates.length,1);
assert(batch.items.every(x=>x.reviewStatus==='بانتظار المراجعة' && x.executor===''));
assert.equal(batch.items[0].kind,'image');assert.equal(batch.items[1].kind,'video');
assert.equal(plan.assets.length,48);
assert.equal(plan.posts.length,28);
assert(validISODate('2026-02-28') && validISODate('2028-02-29'));
assert(!validISODate('2026-02-31') && !validISODate('2026-13-11'));
assert.throws(()=>prepareIdeaBatch({ideas:[{title:'فكرة تاريخ خاطئ لا يقبل',type:'image',dueDate:'2026-02-31'}]},plan),/تاريخ التسليم/);
const sample=JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-New-Ideas-IMPORT-TEMPLATE.json'),'utf8'));
assert.equal(prepareIdeaBatch(sample,plan).items.length,sample.ideas.length);
assert(ideaBatchTemplate().ideas.every(x=>['video','image'].includes(x.type)));
const schedule=schedulePage({...state,scheduleIdeaCode:'V01',scheduleDate:nowInRiyadh()});
assert(schedule.includes('الفكرة المعتمدة'));
assert(schedule.includes('V01'));
assert(!schedule.includes('I01 |'));
const calendar=planPage(state);
assert(calendar.includes('calendar-grid') && calendar.includes('calendar-side') && calendar.includes('calendar-agenda'));
assert(calendar.includes('تقويم النشر والتنشيط'));
assert(!calendar.includes('كاروسيل') && !calendar.includes('صورة منشور'));
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
for(const key of ['reviewStatus','reviewNotes','reviewHistory','reviewedAt','integrationDraft','marketingTaskId'])assert(rules.includes(`'${key}'`));
// Render static QA pages, never copied into the public /site directory.
const template=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'site/styles.css'),'utf8');
const snapshot=content=>template.replace('<div id="app"></div>',`<div id="app"><div class="shell"><div class="main" style="margin-right:0"><main class="content">${content}</main></div></div></div>`)
  .replace('<script type="module" src="./app.js"></script>','').replace('<link rel="stylesheet" href="./styles.css" />',`<style>${css}</style>`);
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
fs.writeFileSync(path.join(root,'qa/ideas-workspace.html'),snapshot(bankBefore));
fs.writeFileSync(path.join(root,'qa/review-workflow.html'),snapshot(approvedBrief));
fs.writeFileSync(path.join(root,'qa/monthly-calendar.html'),snapshot(calendar));
fs.writeFileSync(path.join(root,'qa/task-creation.html'),snapshot(bridgeAfter));
console.log('PASS: Review gating, decisions, timeline, approved car selection, mandatory due date, historical task link, future JSON imports and monthly calendar.');
