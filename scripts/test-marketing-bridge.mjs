import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import handler from '../api/marketing-bridge.js';

// All data here is synthetic. This test never contacts Firebase or Marketing.
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const now=Math.floor(Date.now()/1000);
process.env.MZJ_STRATEGY_FIREBASE_PROJECT_ID='test-firebase-project';
process.env.MZJ_STRATEGY_OWNER_UID='test-single-owner';
process.env.MZJ_STRATEGY_READ_KEY='R'.repeat(48);
process.env.MZJ_STRATEGY_ASSIGN_KEY='A'.repeat(48);
process.env.MZJ_MARKETING_API_BASE_URL='https://mzj-platform.vercel.app';
const basePayload={aud:'test-firebase-project',iss:'https://securetoken.google.com/test-firebase-project',sub:'test-single-owner',iat:now-100,exp:now+1000,auth_time:now-100};
function token(overrides={}) {
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const b=`${enc({alg:'RS256',kid:'test-key',typ:'JWT'})}.${enc({...basePayload,...overrides})}`;
 const signer=createSign('RSA-SHA256');signer.update(b);signer.end();
 return `${b}.${signer.sign(privateKey).toString('base64url')}`;
}
const originalFetch=globalThis.fetch;
let certCalls=0,remoteCalls=[];
globalThis.fetch=async (url,opts={})=>{
 const target=String(url);
 if(target.includes('robot/v1/metadata/x509')){
   certCalls++;
   return {ok:true,status:200,headers:new Headers({'cache-control':'public, max-age=3600'}),json:async()=>({'test-key':publicKey.export({format:'pem',type:'spki'})})};
 }
 remoteCalls.push({target,opts});
 const assign=opts.method==='POST';
 return {ok:true,status:assign?201:200,json:async()=>assign?{ok:true,id:'id-123',taskNo:'TSK-000001',items:[]}:{ok:true,cars:[{car_name:'demo',statement:'test',model_year:'2026',exterior_color:'cream',interior_color:'brown'}]}};
};
function send(req){let code=0,headers={};let result;const res={setHeader:(k,v)=>{headers[k]=v;return res;},status:n=>{code=n;return res;},json:x=>{result=x;return res;}};return handler(req,res).then(()=>({code,result,headers}));}
function request(method,resource,body=undefined,bearer=token()){
 return {method,query:{resource},headers:{authorization:`Bearer ${bearer}`,'content-length':body?String(JSON.stringify(body).length):'0'},body};
}
try {
 let r=await send(request('GET','stock'));
 assert.equal(r.code,200);
 assert.equal(remoteCalls.at(-1).opts.headers.Authorization,`Bearer ${process.env.MZJ_STRATEGY_READ_KEY}`);
 assert.equal(remoteCalls.at(-1).target,'https://mzj-platform.vercel.app/api/strategy-integration/stock');
 assert.equal(certCalls,1);
 r=await send(request('GET','executors'));assert.equal(r.code,200);
 r=await send(request('GET','catalog'));assert.equal(r.code,200);
 assert.equal(certCalls,1);
 r=await send(request('GET','assignments'));
 assert.equal(r.code,400);
 const before=remoteCalls.length;
 r=await send(request('DELETE','stock'));assert.equal(r.code,405);assert.equal(remoteCalls.length,before);
 r=await send(request('GET','stock',undefined,token({sub:'another-user'})));assert.equal(r.code,401);
 r=await send(request('GET','stock',undefined,token({exp:now-1})));assert.equal(r.code,401);
 r=await send(request('GET','stock',undefined,'garbage'));assert.equal(r.code,401);
 const raw={action:'assign',requestKey:'some-key',name:'Task'};
 r=await send(request('POST','assignments',raw));assert.equal(r.code,201);
 assert.equal(remoteCalls.at(-1).opts.headers.Authorization,`Bearer ${process.env.MZJ_STRATEGY_ASSIGN_KEY}`);
 assert.deepEqual(JSON.parse(remoteCalls.at(-1).opts.body),{requestKey:'some-key',name:'Task'});
 r=await send(request('POST','assignments',JSON.stringify(raw)));assert.equal(r.code,201);
 assert.deepEqual(JSON.parse(remoteCalls.at(-1).opts.body),{requestKey:'some-key',name:'Task'});
 r=await send(request('POST','assignments',{action:'delete',requestKey:'x'}));assert.equal(r.code,405);
 assert.equal(remoteCalls.length,5);
 const oldKey=process.env.MZJ_STRATEGY_READ_KEY;delete process.env.MZJ_STRATEGY_READ_KEY;
 r=await send(request('GET','stock'));assert.equal(r.code,503);
 process.env.MZJ_STRATEGY_READ_KEY=oldKey;
 console.log('PASS: Firebase owner JWT, denied requests, read/assign keys, exact URLs, JSON-string body, no live calls');
} finally {globalThis.fetch=originalFetch;}
