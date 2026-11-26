// Offline fault-injection for the integration's exact-once task creation behavior.
// Simulates Firestore link failure after Marketing accepted the request.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {getIdea,taskCodes,toBriefText,ideaIsApproved,nowInRiyadh} from '../site/planner.js';
import {validISODate} from '../site/idea-import.js';
const source=fs.readFileSync(new URL('../site/marketing-bridge.js',import.meta.url),'utf8');
let changed=[];let apiCalls=[];let serverCreateCount=0;let failedOnce=false;
const tasks=new Map();
const context={crypto:webcrypto,TextEncoder,console,PLAN_ID:'mzj-2026-launch-cycle-01',getIdea,taskCodes,toBriefText,ideaIsApproved,nowInRiyadh,validISODate,
  updateManyAssets:async(codes,update)=>{changed.push({codes,update});},
  linkMarketingTask:async links=>{if(!failedOnce){failedOnce=true;throw Error('simulated Firestore unavailable');}assert.equal(links.length,1);},
  __qaFetch:async(resource,options)=>{
    assert.equal(resource,'assignments');const body=options.body;apiCalls.push(body);
    if(!tasks.has(body.requestKey)){
      tasks.set(body.requestKey,{id:'remote-task-01',taskNo:'TASK-9001',items:body.items.map((i,n)=>({client_key:i.clientKey,id:'item-'+n}))});
      serverCreateCount++;
    }
    return tasks.get(body.requestKey);
  }
};
const modified=source.replace(/^import\s.+;\s*$/gm,'')
  .replace(/\bexport (async function|function|const)\b/g,'$1')
  .replace(/async function fetchBridge\(resource, options=\{\}\) \{[\s\S]*?\n\}/,
  'async function fetchBridge(resource, options={}) { return globalThis.__qaFetch(resource,options); }');
vm.createContext(context);
vm.runInContext(`${modified}\nglobalThis.__assignBridgeIdea=assignBridgeIdea;`,context);
const plan={assets:[{code:'V01',kind:'video',title:'مراجعة تجربة القيادة',dueDate:'2026-11-25',executor:'بلال',reviewStatus:'معتمد',creativeApprovedAt:'2026-11-11T00:00:00Z',approvedCarMode:'none',approvedVehicles:[],status:'لم يبدأ'}],posts:[],carousels:[]};
const bridge={ideaCode:'V01',mode:'none',chosenStocks:[],stock:[],taskTypes:[{id:'type1',name:'فيديو'}],executors:[{user_id:'u1',department_id:'d1',full_name:'بلال',department_name:'التسويق'}],formats:[{id:'fmt1',mediaKinds:['video']}],assignee:'',taskTypeId:'',formatIds:[]};
const state={plan,bridge};
const form={elements:{namedItem:name=>({taskTypeId:{value:'type1'},assignee:{value:'u1|d1'},dueOn:{value:'2027-01-10'}}[name])},
  querySelectorAll:()=>[{value:'fmt1'}]};
const call=()=>vm.runInContext('__assignBridgeIdea',context)(state,form);
await assert.rejects(call(),/simulated Firestore unavailable/);
assert.equal(serverCreateCount,1);
assert.equal(apiCalls[0].items[0].dueOn,'2027-01-10');
assert(changed[0].update.integrationRequestKey);
assert.equal(changed[0].update.integrationDraft.dueOn,'2027-01-10');
assert.equal(plan.assets[0].dueDate,'2027-01-10');
const firstKey=apiCalls[0].requestKey;
form.elements.namedItem=name=>({taskTypeId:{value:'type1'},assignee:{value:'u1|d1'},dueOn:{value:'2027-02-05'}}[name]);
const result=await call();
assert.equal(result.taskNo,'TASK-9001');
assert.equal(serverCreateCount,1,'Retry must not create a second task');
assert.equal(apiCalls[1].requestKey,firstKey);
assert.equal(apiCalls[1].items[0].dueOn,'2027-01-10','Pending delivery date is immutable');
assert.equal(plan.assets[0].marketingTaskId,'remote-task-01');
const other={...plan.assets[0],reviewStatus:'مطلوب تعديل',marketingTaskId:'',integrationRequestKey:''};
state.plan.assets=[other];
await assert.rejects(call(),/Approve the current car selection/);
console.log('PASS: Real-form due date, atomic pending draft, deterministic request key, retry after Firestore failure and review gate.');
