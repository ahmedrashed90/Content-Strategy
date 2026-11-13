// Offline integration simulation: reused approved ideas, independent executors,
// Drive photography handoff, stable retry, and preserved prior task links.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {getIdea,taskCodes,ideaIsApproved,nowInRiyadh,toCreativeTreatmentText} from '../site/planner.js';
import {validISODate} from '../site/idea-import.js';

const raw=fs.readFileSync(new URL('../site/marketing-bridge.js',import.meta.url),'utf8');
let attempts=[],created=new Map(), firestoreFails=true, linked=[];
const context={crypto:webcrypto,TextEncoder,console,getIdea,taskCodes,ideaIsApproved,nowInRiyadh,toCreativeTreatmentText,validISODate,
 PLAN_ID:'mzj-2026-launch-cycle-01',
 updateManyAssets:async()=>{},
 linkMarketingTask:async links=>{
   if(firestoreFails){firestoreFails=false;throw Error('simulated temporary Firestore failure');}
   linked.push(...links);
 },
 __qaFetch:async(resource,{body})=>{
   assert.equal(resource,'assignments');
   attempts.push(structuredClone(body));
   if(!created.has(body.requestKey))created.set(body.requestKey,{
     id:'new-task-'+created.size,taskNo:'TSK-0100'+created.size,
     items:body.items.map((item,index)=>({client_key:item.clientKey,id:'work-item-'+index}))
   });
   return created.get(body.requestKey);
 }
};
const modified=raw.replace(/^import\s.+;\s*$/gm,'').replace(/\bexport (async function|function|const)\b/g,'$1')
 .replace(/async function fetchBridge\(resource, options=\{\}\) \{[\s\S]*?\n\}/,
  'async function fetchBridge(resource, options={}) { return globalThis.__qaFetch(resource,options); }');
vm.createContext(context);
vm.runInContext(`${modified}\nglobalThis.__qa={newBridgeState,bridgePage,assignBridgeIdea};`,context);
const {newBridgeState,bridgePage,assignBridgeIdea}=context.__qa;
const oldTask='old-task-0100';
const idea={code:'V01',kind:'video',title:'مواصفات سيارة',marketingCategory:'تعريفي - مواصفات السيارات',
 reviewStatus:'معتمد',status:'لم يبدأ',creativeApprovedAt:'2026-11-10T12:00:00Z',
 approvedCarMode:'single',approvedVehicles:[{car_name:'هيونداي توسان',statement:'سمارت',model_year:'2026'}],
 audienceAndGoal:'العملاء اللي يقارنون المواصفات',message:'مميزات السيارة بوضوح',briefNotes:'لقطات حقيقية من المعرض',
 hook:'تعرف كل تفاصيل سيارتك؟',script:'ابدأ رحلتك مع توسان',scenes:[{number:1,title:'المقدمة',visual:'لقطة أمامية',voiceOver:'شوف التفاصيل',camera:'متوسطة'}],
 marketingTaskId:oldTask,marketingTaskNo:'TSK-000089',marketingItemId:'old-item',marketingExecutorName:'مونتير سابق',
 marketingLinkedAt:'2026-11-01T10:00:00Z',dueDate:'2026-11-05'};
const plan={assets:[idea],carousels:[],posts:[]};
const bridge=newBridgeState();
bridge.category=idea.marketingCategory;bridge.selectedCodes=['V01'];bridge.ideaCode='V01';
bridge.assignments=[{assignee:'photographer|photo-dept',dueOn:'2027-05-01'},
 {assignee:'editor|edit-dept',dueOn:'2027-05-03'}];
bridge.taskTypes=[{id:'task-type',name:'تعريف'}];
bridge.formats=[{id:'format-1',mediaKinds:['video'],platform_name:'Instagram',name:'Reels'}];
bridge.formatIdsByKind.video=['format-1'];bridge.formatIdsByIdea.V01=['format-1'];
bridge.executors=[{user_id:'photographer',department_id:'photo-dept',full_name:'أحمد ناجي',department_name:'قسم التصوير'},
 {user_id:'editor',department_id:'edit-dept',full_name:'محمد فؤاد',department_name:'قسم المونتاج'}];
const state={plan,bridge};
const html=bridgePage(state);
assert(html.includes('تم التكليف سابقًا'),'Previously used approved idea should remain selectable');
assert(!/value="V01"[^>]*disabled/.test(html),'Previously used idea checkbox must not be disabled');
assert(html.includes('أحمد ناجي</option>')&&!html.includes('أحمد ناجي — قسم التصوير'),'Assignee options show only names');
assert(html.includes('name="dueOn_V01_0"')&&html.includes('name="dueOn_V01_1"'),'Each assignee has independent date input');
const form={elements:{namedItem:name=>({taskTypeId:{value:'task-type'},
 assignee_V01_0:{value:'photographer|photo-dept'},dueOn_V01_0:{value:'2027-05-01'},
 assignee_V01_1:{value:'editor|edit-dept'},dueOn_V01_1:{value:'2027-05-03'}}[name])},
 querySelectorAll:selector=>selector==='input[name="format_V01"]:checked'?[{value:'format-1'}]:[]};
await assert.rejects(()=>assignBridgeIdea(state,form),/simulated temporary Firestore failure/);
assert.equal(created.size,1,'One Marketing task despite Firestore link failure');
assert.equal(idea.dueDate,'2026-11-05','Old due date is preserved until task successfully linked');
assert.equal(attempts[0].items.length,2);
const [photo,edit]=attempts[0].items;
assert.equal(photo.deliveryMode,'drive_link');assert.equal(photo.dueOn,'2027-05-01');
assert.equal(edit.deliveryMode,'files');assert.equal(edit.dueOn,'2027-05-03');
for(const row of [photo,edit]){
 assert(row.idea.includes('هيونداي توسان'));assert(row.idea.includes('بريف إبداعي:'));
 assert(row.explanation.includes('الجمهور والهدف:')&&row.explanation.includes('الرسالة:'));
 assert(row.creativeTreatment.includes('الهوك:')&&row.creativeTreatment.includes('النص / الفويس أوفر:')&&row.creativeTreatment.includes('السيناريو التفصيلي:'));
}
await assignBridgeIdea(state,form);
assert.equal(created.size,1,'Retry must never duplicate a previously created task');
assert.equal(attempts[0].requestKey,attempts[1].requestKey);
assert.equal(photo.clientKey,attempts[1].items[0].clientKey,'Client item keys must remain deterministic');
assert.equal(idea.marketingTaskId,'new-task-0');
assert.equal(idea.previousMarketingTasks[0].taskId,oldTask);
assert.equal(idea.previousMarketingTasks[0].dueDate,'2026-11-05');
assert.equal(idea.dueDate,'2027-05-03');
assert.equal(idea.integrationDraft,null);
// Repeat another campaign/task using the same approved idea.
bridge.assignments=[{assignee:'editor|edit-dept',dueOn:'2027-06-01'}];
const one={...form,elements:{namedItem:name=>({taskTypeId:{value:'task-type'},
 assignee_V01_0:{value:'editor|edit-dept'},dueOn_V01_0:{value:'2027-06-01'}}[name])}};
await assignBridgeIdea(state,one);
assert.equal(created.size,2,'Reusing an already linked idea must create a new legitimate task');
assert.equal(idea.previousMarketingTasks.length,2,'Old and previous links must remain in history');
assert.equal(idea.previousMarketingTasks[1].taskId,'new-task-0');
// Single photo executor is valid as a capture-only task.
bridge.assignments=[{assignee:'photographer|photo-dept',dueOn:'2027-07-01'}];
const captureOnly={...form,elements:{namedItem:name=>({taskTypeId:{value:'task-type'},
 assignee_V01_0:{value:'photographer|photo-dept'},dueOn_V01_0:{value:'2027-07-01'}}[name])}};
await assignBridgeIdea(state,captureOnly);
assert.equal(created.size,3);
assert.equal(attempts.at(-1).items[0].deliveryMode,'drive_link');
console.log('PASS: reused approved ideas, per-executor dates, photographer/editor payload, RTL brief fields, deterministic retry, history preservation, capture-only tasks.');
