// Offline migration test: simulate an already-created v1 record, legacy rules,
// import of the reviewed v2 file, then secure creation of the v2 record.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const old = JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-baseline-2026-v1.json'),'utf8'));
const next = JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-baseline-2026-v2.json'),'utf8'));
const before = JSON.stringify(old);
const db = { 'baseline-2026-v1':old };
let rulesUpdated = false;
const callbacks = {};
const user = { uid:'Wu4KHDIXQedFUMsSDt9yYLKSfhx1', email:'owner@example.test' };
const target = { innerHTML:'', addEventListener(name, cb) { callbacks[name]=cb; }, querySelector(){return null;} };
const toast = {textContent:'',classList:{add(){},remove(){}}};
const document = { title:'', body:{appendChild(){}}, getElementById(id){return id==='app'?target:toast;}, createElement(){return {click(){},remove(){}};} };
const window = {
  location:{hostname:'example.test',search:''},
  addEventListener(){},clearTimeout(){},setTimeout(){},scrollTo(){},print(){}
};
const code = fs.readFileSync(path.join(root,'site/app.js'),'utf8').replace(/^import\s.+;\s*$/gm,'');
const context = vm.createContext({
  document,window,console,Intl,TextEncoder,URLSearchParams,crypto:webcrypto,
  INITIAL_BASELINE: {id:'baseline-2026-v2',schemaVersion:2,registrationDate:'2026-11-07',platforms:{}},
  PLATFORM_ORDER:['facebook','instagram','tiktok','snapchat'],
  FIREBASE_CONFIG:{projectId:'new-marketing-eaf85'},OWNER_UID:user.uid,
  connectFirebase:async()=>{}, listenToAuth: cb=>Promise.resolve().then(()=>cb(user)),
  loginWithEmail:async()=>{}, logout:async()=>{},
  getStoredBaseline: async id=> { if (id==='baseline-2026-v2'&&!rulesUpdated) throw Object.assign(Error('denied'),{code:'permission-denied'}); return db[id]||null; },
  createStoredBaseline: async (seed,uid)=> {
    if (!rulesUpdated||uid!==user.uid||db['baseline-2026-v2']) throw Object.assign(Error('denied'),{code:'permission-denied'});
    db['baseline-2026-v2']={...seed,ownerUid:uid,createdAt:'test-server-timestamp'};
  }
});
vm.runInContext(code,context,{filename:'app.js'});
const idle = async()=> {for(let i=0;i<5;i++) await new Promise(resolve=>setImmediate(resolve));};
await idle();
const test = (bool,desc) => { console.log(`${bool?'PASS':'FAIL'} ${desc}`); if(!bool) process.exitCode=1; };
test(vm.runInContext('state.baselineStatus',context)==='saved-v1','Legacy record recognized');
test(target.innerHTML.includes('استكمال Snapchat'), 'Upgrade panel visible');
test(target.innerHTML.includes('قواعد Firestore القديمة'), 'Old rules warning visible');
// The owner publishes the new rules before trying to save.
rulesUpdated=true;
const file={size:Buffer.byteLength(JSON.stringify(next)),text:async()=>JSON.stringify(next)};
await callbacks.change({target:{id:'baseline-file',files:[file]}});
test(vm.runInContext('state.baselineStatus',context)==='ready-to-save','Reviewed v2 seed accepted');
test(target.innerHTML.includes('4,878'), 'New Snapchat follower data shown');
await callbacks.click({target:{closest:sel=>sel==='[data-action]'?{dataset:{action:'save-baseline'},closest(){return null;}}:null}});
await idle();
test(vm.runInContext('state.baselineStatus',context)==='saved', 'v2 saved successfully');
test(JSON.stringify(db['baseline-2026-v1'])===before,'Original v1 record not modified');
test(db['baseline-2026-v2']?.platforms?.snapchat?.profileStories?.paidViews===48772,'Snapchat saved in v2');
test(!db['baseline-2026-v2']?.platforms?.snapchat?.views,'No fabricated Snapchat total views');
if(process.exitCode) process.exit(process.exitCode);
