// Offline regression for v1.6 review changes (never contacts Firebase or Marketing).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ideaAssets,ideaIsApproved,REVIEW_STATUSES,reviewStatusFor,assetDetailPage,archivePage,ideasPage,tasksPage} from '../site/planner.js';
const source=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function saveIdeaReview(form,decision){');
const stop=source.indexOf('\nasync function savePostEditor(',start);
assert(start>0&&stop>start);
const history=[{status:'معتمد',at:'2026-11-10T01:00:00.000Z',reviewedByUid:'owner'}];
const asset=(code,more={})=>({code,kind:'video',title:'فكرة '+code,executor:'محمود',week:1,status:'لم يبدأ',dueDate:'2026-12-01',reviewStatus:'معتمد',reviewHistory:history,approvedVehicles:[{car_name:'توسان'}],creativeApprovedAt:'2026-11-10T01:00:00.000Z',approvedCarMode:'single',...more});
const plan={assets:[asset('V01'),asset('V02',{reviewStatus:'بانتظار المراجعة',creativeApprovedAt:null}),asset('V03',{reviewStatus:'مرفوض',creativeApprovedAt:null})],posts:[],carousels:[]};
const state={plan,planSaving:false,user:{uid:'owner'},view:'asset',selectedAssetCode:'V01',ideaReviewFilter:'all',ideaKind:'all',ideaSearch:'',archiveSearch:'',taskPerson:'الكل',taskWeek:0,briefReturnView:'ideas',planStatus:'preview',bridge:{ideaCode:''}};
let confirmed=true,failed=false;const toasts=[],updates=[];
const ctx={state,isLocalPreview:false,REVIEW_STATUSES,ideaAssets,ideaIsApproved,toast:msg=>toasts.push(msg),render:()=>{},console,
  readBriefDraft:()=>'',window:{confirm:()=>confirmed},
  updateReviewAssetRows:async rows=>{if(failed)throw Error('simulated Firestore failure');updates.push(rows);}};
vm.createContext(ctx);
vm.runInContext(`${source.slice(start,stop)}\nglobalThis.review=saveIdeaReview;`,ctx);
const run=(code,decision)=>ctx.review({elements:{namedItem:k=>k==='ideaCode'?{value:code}:null}},decision);
assert(assetDetailPage(state).includes('data-action="brief-back"'));
assert(assetDetailPage(state).includes('رجوع إلى بنك الأفكار'));
assert(!assetDetailPage(state).match(/<form id="idea-review-form"[\s\S]*?<\/form>/)?.[0].includes('value="مطلوب تعديل"'));
assert(!ideasPage(state).includes('V03 ·')); // archived ideas are not in active bank
assert(archivePage(state).includes('V03'));
// Linked tasks may be moved to the historical register without deleting Marketing.
plan.assets[0].marketingTaskId='task-101';plan.assets[0].marketingTaskNo='TSK-000151';plan.assets[0].marketingItemId='item-1';plan.assets[0].integrationRequestKey='old-request';plan.assets[0].marketingExecutorName='محمود';
assert(assetDetailPage(state).includes('إلغاء الاعتماد وإعادة للمراجعة'));
await run('V01','بانتظار المراجعة');
assert.equal(updates.length,1);assert.equal(updates[0][0].code,'V01');
assert.equal(reviewStatusFor(plan,'V01'),'بانتظار المراجعة');
assert.equal(plan.assets[0].marketingTaskId,'');
assert.equal(plan.assets[0].integrationRequestKey,'');
assert.equal(plan.assets[0].previousMarketingTasks.length,1);
assert.equal(plan.assets[0].previousMarketingTasks[0].taskNo,'TSK-000151');
assert(assetDetailPage(state).includes('التكليفات السابقة'));
assert(assetDetailPage(state).includes('TSK-000151'));
assert.equal(plan.assets[0].reviewHistory.length,2);
await run('V01','معتمد');assert(ideaIsApproved(plan,'V01'));
confirmed=false;await run('V01','بانتظار المراجعة');assert.equal(updates.length,2);
confirmed=true;plan.assets[0].integrationRequestKey='pending-an-unknown-outcome';
await run('V01','بانتظار المراجعة');assert.equal(updates.length,2,'ambiguous in-flight request must stay locked');
plan.assets[0].integrationRequestKey='';
failed=true;await run('V01','بانتظار المراجعة');assert.equal(reviewStatusFor(plan,'V01'),'معتمد','failed persistence must not change local status');
failed=false;
state.selectedAssetCode='V02';await run('V02','مرفوض');assert.equal(plan.assets[1].reviewStatus,'مرفوض');assert.equal(state.view,'archive');
assert(archivePage(state).includes('V02'));
state.view='asset';state.selectedAssetCode='V03';
assert(assetDetailPage(state).includes('استرجاع الفكرة للمراجعة'));
await run('V03','بانتظار المراجعة');assert.equal(reviewStatusFor(plan,'V03'),'بانتظار المراجعة');
assert(ideasPage(state).includes('V03'));
assert(!archivePage(state).includes('value="مطلوب تعديل"'));
assert(tasksPage(state).includes('delivery-overview'));
const rule=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
assert(rule.includes("'previousMarketingTasks'"));
assert(toasts.some(t=>t.includes('تمت إعادة الفكرة')));
console.log('PASS: back button, linked-task history, archive/restore, no request-modification decision, safety gating, Firestore rules, delivery UI.');
