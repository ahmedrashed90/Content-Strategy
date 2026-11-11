import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validISODate} from '../site/idea-import.js';
const seed=JSON.parse(fs.readFileSync(new URL('../data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json',import.meta.url),'utf8'));
const entries=new Map();
const key=r=>r.path;
const {structuredClone}=globalThis;
const api={
  doc:(_db,...parts)=>({path:parts.join('/')}),
  collection:(_db,...parts)=>({path:parts.join('/')}),
  getDoc:async ref=>({exists:()=>entries.has(key(ref)),data:()=>structuredClone(entries.get(key(ref)))}),
  getDocs:async col=>({docs:[...entries].filter(([k])=>k.startsWith(col.path+'/')&&!k.slice(col.path.length+1).includes('/')).map(([k,v])=>({id:k.split('/').at(-1),data:()=>structuredClone(v)}))}),
  serverTimestamp:()=>({mockTimestamp:Date.now()}),
  updateDoc:async(ref,changes)=>{const cur=entries.get(key(ref));if(!cur)throw Error('missing');entries.set(key(ref),{...cur,...structuredClone(changes)});},
  writeBatch:()=>{
    const writes=[];
    return {
      set(ref,data){writes.push(['set',ref,data]);},
      update(ref,data){writes.push(['update',ref,data]);},
      async commit(){
        assert.ok(writes.length<500);
        for(const [op,r,d] of writes){
          if(op==='update'&&!entries.has(key(r)))throw Error('missing update');
          entries.set(key(r),op==='update'?{...entries.get(key(r)),...structuredClone(d)}:structuredClone(d));
        }
      }
    };
  }
};
globalThis.__MZJ_FAKE__={connectFirebase:async()=>({firestore:{},api:{dbSdk:api}}),validISODate};
const src=fs.readFileSync(new URL('../site/plan-firebase.js',import.meta.url),'utf8')
  .replace("import { connectFirebase } from './firebase.js';",'const {connectFirebase}=globalThis.__MZJ_FAKE__;')
  .replace("import { validISODate } from './idea-import.js';",'const {validISODate}=globalThis.__MZJ_FAKE__;');
const store=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
assert.equal(await store.loadPublishingPlan(),null);
const plan=await store.createPublishingPlan(seed,'Wu4KHDIXQedFUMsSDt9yYLKSfhx1');
assert.equal(entries.size,77);
assert.equal(plan.posts.length,28);assert.equal(plan.assets.length,48);
assert.equal(plan.posts[0].ideaCode,'V01');
try{await store.createPublishingPlan(seed,'xx');throw Error('expected duplicate error');}
catch(err){assert.equal(err.message,'plan-already-exists');}
await store.updatePublishingAsset('V01',{executor:'بلال',status:'قيد التنفيذ',dueDate:'2026-12-01'});
assert.equal(entries.get('contentPlans/mzj-2026-launch-cycle-01/assets/V01').executor,'بلال');
await store.updatePostWithAssignment('P04',{status:'قيد التجهيز'},['I03','I04','I07','I08'],'محمود');
assert.equal(entries.get('contentPlans/mzj-2026-launch-cycle-01/posts/P04').status,'قيد التجهيز');
for(const id of ['I03','I04','I07','I08'])assert.equal(entries.get('contentPlans/mzj-2026-launch-cycle-01/assets/'+id).executor,'محمود');
const baseKeys=[...entries.keys()].filter(x=>x.includes('baselines'));
assert.equal(baseKeys.length,0);
console.log('QA PASS: first import 77 writes; non-destructive import; user editing asset and batch assignment; no baseline writes.');
