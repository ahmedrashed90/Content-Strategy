import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {newManualIdeaDraft,manualIdeaModal,prepareManualIdea,emptyScene,emptySlide} from '../site/manual-idea.js';
import {getIdea,taskCodes,ideaIsApproved,nowInRiyadh,toCreativeTreatmentText} from '../site/planner.js';
import {validISODate} from '../site/idea-import.js';

const plan={assets:[],carousels:[],posts:[]};
const video=newManualIdeaDraft();
video.title='كيف تختار محرك سيارتك؟';video.marketingCategory='تعريفي - مواصفات السيارات';
video.message='شرح الفروق بوضوح';video.hook='وش الفرق؟';video.script='اختار اللي يناسبك';
video.scenes=[{...emptyScene(),title:'المقدمة',visual:'لقطة للمحركات',voiceOver:'تعرف الفرق؟',startSecond:'0',endSecond:'8'}];
video.caption='كابشن عام';video.hashtags='#سيارات';
const output=prepareManualIdea(video,plan,'MANUALTEST20261112');
assert.equal(output.kind,'video');assert.equal(output.scenes.length,1);
assert.equal(output.scenes[0].voiceOver,'تعرف الفرق؟');
assert.equal(output.captionsByPlatform.instagram,'كابشن عام');
assert.equal(output.hashtagsByPlatform.tiktok,'#سيارات');
assert.equal(output.reviewStatus,'بانتظار المراجعة');
assert.equal(output.source,'manual');
assert(manualIdeaModal(video).includes('السيناريو مشهدًا بمشهد'));
assert(manualIdeaModal(video).includes('data-action="manual-jump"'));
assert(manualIdeaModal(video).includes('id="manual-idea-basic"'));
assert(manualIdeaModal(video).includes('id="manual-idea-details"'));
assert(manualIdeaModal(video).includes('id="manual-idea-publishing"'));
assert(manualIdeaModal(video).includes('form="manual-idea-form"'), 'The save action remains visible outside the scrolling body');
assert(manualIdeaModal(video).indexOf('</form>') < manualIdeaModal(video).indexOf('<footer class="manual-idea-footer">'));
const modalCss=fs.readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
assert(modalCss.includes('.manual-idea-dialog{width:100%;height:100dvh'));
assert(modalCss.includes('body:has(.manual-idea-overlay){overflow:hidden}'));
const modalApp=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
assert(modalApp.includes('${modalView()}</div>${manualIdeaModal('), 'Full-screen overlay must be rendered OUTSIDE the animated .content container');
assert(modalApp.includes("if(action==='manual-jump')"), 'Composer sections must be reachable without long scrolling');

assert(!manualIdeaModal(video).includes('التصميم صورة بصورة'));
assert.throws(()=>prepareManualIdea({...video,scenes:[{...emptyScene()}]},plan,'another'),/عنوان ووصف/);
plan.assets.push(output);
assert.throws(()=>prepareManualIdea(video,plan,'MANUALTEST20261113'),/يوجد بالفعل/);
const image=newManualIdeaDraft();image.kind='image';image.title='كيف تختار بنزين سيارتك؟';
image.marketingCategory='تعريفي - مواصفات السيارات';image.message='اعرف البنزين المناسب';
image.imageSlides=[{...emptySlide(),title:'الغلاف',screenText:'91 ولا 95',visualDescription:'صورة طبلون السيارة'},
 {...emptySlide(),title:'التوضيح',screenText:'راجع الكتيب',visualDescription:'صورة الكتيب'}];
const photo=prepareManualIdea(image,plan,'MANUALPHOTO20261112');
assert.equal(photo.imageCount,2);assert.equal(photo.imageSlides[1].screenText,'راجع الكتيب');
assert(manualIdeaModal(image).includes('الصورة 2 من 2'));
assert(!manualIdeaModal(image).includes('الفويس أوفر كاملًا'));
assert.throws(()=>prepareManualIdea({...image,imageSlides:[{...emptySlide()}]},plan,'another'),/التصور البصري/);

// Exercise the live assignment engine without external requests or mutable production data.
const raw=fs.readFileSync(new URL('../site/marketing-bridge.js',import.meta.url),'utf8');
const requests=[],linked=[];
const context={crypto:webcrypto,TextEncoder,console,getIdea,taskCodes,ideaIsApproved,nowInRiyadh,toCreativeTreatmentText,validISODate,
  PLAN_ID:'mzj-2026-launch-cycle-01',updateManyAssets:async()=>{},linkMarketingTask:async rows=>linked.push(...rows),
  __qaFetch:async(resource,{body})=>{assert.equal(resource,'assignments');requests.push(body);return {id:'new-task',taskNo:'TSK-9000',items:body.items.map((item,i)=>({client_key:item.clientKey,id:'item-'+i}))};}};
const modified=raw.replace(/^import\s.+;\s*$/gm,'').replace(/\bexport (async function|function|const)\b/g,'$1')
  .replace(/async function fetchBridge\(resource, options=\{\}\) \{[\s\S]*?\n\}/,
   'async function fetchBridge(resource, options={}) { return globalThis.__qaFetch(resource,options); }');
vm.createContext(context);vm.runInContext(`${modified}\nglobalThis.__qa={newBridgeState,bridgePage,assignBridgeIdea,sameAssignmentDraft};`,context);
const idea1={...output,code:'MAN-V01',reviewStatus:'معتمد',creativeApprovedAt:'2026-11-12T00:00:00Z',approvedVehicles:[{car_name:'MG 5',model_year:'2026'}],approvedCarMode:'single'};
const idea2={...photo,code:'MAN-I02',reviewStatus:'معتمد',creativeApprovedAt:'2026-11-12T00:00:00Z',approvedVehicles:[{car_name:'سوناتا',model_year:'2026'}],approvedCarMode:'single'};
const normalizedDraft={pending:true,typeId:'x',name:'test',ideaCodes:['MAN-V01','MAN-I02'],
  formatIdsByKind:{video:['v'],image:['i']},assignmentsByIdea:{'MAN-V01':[{assigneeId:'editor'}],'MAN-I02':[{assigneeId:'editor'}]}};
const oldShared={pending:true,typeId:'x',name:'test',ideaCodes:['MAN-V01','MAN-I02'],
  assignments:[{assigneeId:'editor'}],formatIdsByKind:{video:['v'],image:['i']}};
assert(context.__qa.sameAssignmentDraft(oldShared,normalizedDraft),'Old shared-executor draft can be retried safely');
assert(!context.__qa.sameAssignmentDraft({...oldShared,name:'changed'},normalizedDraft),'Changed older draft must reject');
assert(context.__qa.sameAssignmentDraft({...normalizedDraft},normalizedDraft),'Current draft retries remain stable');
const state={plan:{assets:[idea1,idea2],carousels:[],posts:[]},bridge:context.__qa.newBridgeState()};
const bridge=state.bridge;bridge.category='تعريفي - مواصفات السيارات';bridge.selectedCodes=['MAN-V01','MAN-I02'];bridge.ideaCode='MAN-V01';
bridge.taskTypes=[{id:'task-type',name:'تعريف'}];bridge.formats=[{id:'v',mediaKinds:['video'],name:'ريل',platform_name:'إنستجرام'},
 {id:'i',mediaKinds:['image'],name:'صورة',platform_name:'إنستجرام'}];
bridge.executors=[{user_id:'photo',department_id:'photodept',department_name:'قسم التصوير',full_name:'أحمد ناجي'},
 {user_id:'editor',department_id:'editdept',department_name:'قسم المونتاج',full_name:'محمود فؤاد'}];
bridge.assignmentsByIdea={
 'MAN-V01':[{assignee:'photo|photodept',dueOn:'2027-05-01'},{assignee:'editor|editdept',dueOn:'2027-05-03'}],
 'MAN-I02':[{assignee:'editor|editdept',dueOn:'2027-06-15'}]};
const html=context.__qa.bridgePage(state);
assert.equal((html.match(/class="bridge-idea-assignees"/g)||[]).length,2);
assert(html.includes('role="tablist"'), 'Ideas must be navigable horizontally in step 03');
assert.equal((html.match(/data-action="bridge-pick-assignment-idea"/g)||[]).length,2);
assert.equal((html.match(/role="tabpanel"/g)||[]).length,2);
assert(/id="bridge-assign-panel-MAN-I02"[^>]*hidden/.test(html), 'Only the current idea assignment pane must remain visible');
assert(html.includes('id="bridge-assign-panel-MAN-V01" role="tabpanel" aria-labelledby="bridge-assign-tab-MAN-V01"'), 'The first idea is active by default');
assert(html.includes('novalidate'), 'Hidden required fields must use the central multi-idea validator, not native validation');
assert(modalApp.includes("if(action==='bridge-pick-assignment-idea')"), 'Tab navigation must preserve unsubmitted dates without replacing the form');
const bridgeCss=fs.readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
assert(bridgeCss.includes('.bridge-assignment-tabs{display:flex'));
assert(bridgeCss.includes('.bridge-idea-assignees[hidden]{display:none!important}'));

assert(html.includes('name="assignee_MAN-V01_0"'));
assert(html.includes('name="assignee_MAN-I02_0"'));
assert(html.includes('name="dueOn_MAN-I02_0"'));
const entries={taskTypeId:'task-type',assignee_MAN_V01_0:''};
const form={elements:{namedItem:key=>({value:{
  taskTypeId:'task-type',
  'assignee_MAN-V01_0':'photo|photodept','dueOn_MAN-V01_0':'2027-05-01',
  'assignee_MAN-V01_1':'editor|editdept','dueOn_MAN-V01_1':'2027-05-03',
  'assignee_MAN-I02_0':'editor|editdept','dueOn_MAN-I02_0':'2027-06-15'}[key]||''})},
 querySelectorAll:key=>key==='input[name="format_video"]:checked'?[{value:'v'}]:key==='input[name="format_image"]:checked'?[{value:'i'}]:[]};
await context.__qa.assignBridgeIdea(state,form);
assert.equal(requests.length,1);assert.equal(requests[0].items.length,3);
assert.equal(requests[0].items.filter(item=>item.ideaCode==='MAN-V01').length,2);
assert.equal(requests[0].items.filter(item=>item.ideaCode==='MAN-I02').length,1);
assert.equal(requests[0].items.find(item=>item.ideaCode==='MAN-I02').dueOn,'2027-06-15');
assert.equal(requests[0].items.find(item=>item.assigneeId==='photo').deliveryMode,'drive_link');
assert.equal(linked.length,2);assert(linked.some(row=>row.code==='MAN-I02'&&row.newDueDate==='2027-06-15'));
console.log('PASS: manual video/image ideas, scene/slide content, safe duplicates, per-idea executors and dates, correct 3-item task and links.');
