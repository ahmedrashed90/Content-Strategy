import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareIdeaBatch} from '../site/idea-import.js';
import {newBridgeState,selectBridgeCategory,toggleBridgeIdea,selectBridgeIdea,
  approveBridgeIdea,bridgePage} from '../site/marketing-bridge.js';
const raw=JSON.parse(await readFile(new URL('../data/MZJ-72-IDEAS-FULL-CORRECTED-IMPORT-20261111.json',import.meta.url),'utf8'));
const ideas=prepareIdeaBatch(raw,{assets:[],carousels:[]},{replace:true}).items;
const videos=ideas.filter(i=>i.kind==='video'&&!i.requiresVerification&&i.marketingCategory==='تعريفي - مواصفات السيارات').slice(0,2);
assert.equal(videos.length,2);
for(const idea of videos)idea.reviewStatus='معتمد';
videos[0].marketingTaskId='previous-task';videos[0].marketingTaskNo='TSK-000001';
const state={plan:{assets:ideas,carousels:[],posts:[],taskRuns:[
 {id:'old-run',status:'linked',draft:{ideaCodes:[videos[0].code]},taskNo:'TSK-000001'}]},
 bridge:newBridgeState()};
state.bridge.executors=[{user_id:'user-1',department_id:'dep-1',full_name:'مصور تجريبي',department_name:'قسم التصوير'},
 {user_id:'user-2',department_id:'dep-2',full_name:'مونتير تجريبي',department_name:'قسم المونتاج'}];
state.bridge.taskTypes=[{id:'type-1',name:'حملة تعريفية'}];
state.bridge.formats=[{id:'fmt-1',name:'Reels',platform_name:'إنستغرام',mediaKinds:['video'],width:1080,height:1920}];
state.bridge.stock=[{car_name:'MG5',statement:'Standard',model_year:'2026',exterior_color:'أسود',interior_color:'بيج'}];
selectBridgeCategory(state,'تعريفي - مواصفات السيارات');
toggleBridgeIdea(state,videos[0].code,true);
toggleBridgeIdea(state,videos[1].code,true);
assert.equal(state.bridge.selectedCodes.length,2,'Old task must not lock approved original idea');
const first=videos[0].code,second=videos[1].code;
const car=JSON.stringify(['MG5','Standard','2026','أسود','بيج']);
selectBridgeIdea(state,first,false);
await approveBridgeIdea(state,'single',[car]);
selectBridgeIdea(state,second,false);
await approveBridgeIdea(state,'none',[]);
state.bridge.assignments=[
 {role:'production',assignee:'user-2|dep-2',dueOn:'2026-11-25'},
 {role:'shooting',assignee:'user-1|dep-1',dueOn:'2026-11-19'}];
const html=bridgePage(state);
assert(html.includes('bridge-ideas-table'));
assert(html.includes('المنفذون ومواعيد التسليم'));
assert(html.includes('name="executor-due-1"'));
assert(html.includes('مصور تجريبي</option>'),'Executor dropdown must show names without departments');
assert(!html.includes('مصور تجريبي - قسم التصوير'));
assert(html.includes('التصوير وتسليم رابط Google Drive'));
assert(html.includes('كل الأفكار مؤكدة وجاهزة'));
assert(html.includes('تم استخدامها'));
const master=state.plan.assets.find(row=>row.code===first);
assert.equal(master.marketingTaskId,'previous-task');
assert.equal(master.approvedVehicles,undefined,'Master idea must not receive new-task vehicle selection');
console.log('PASS: reusable approved idea, separate cars, two names-only executors, individual delivery dates, original task preserved');
