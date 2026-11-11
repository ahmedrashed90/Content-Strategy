import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, ideaIsApproved, nowInRiyadh, toCreativeTreatmentText } from './planner.js';
import { PLAN_ID, updateManyAssets, linkMarketingTask } from './plan-firebase.js';
import { validISODate } from './idea-import.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stockFields = ['car_name','statement','model_year','exterior_color','interior_color'];
const formatStock = car => stockFields.map(key => String(car?.[key] || '').trim()).filter(Boolean).join(' | ');
const stockId = car => JSON.stringify(stockFields.map(key => String(car?.[key] || '').trim()));
const imageOrVideo = idea => idea?.kind === 'video' ? 'video' : 'image';
const opt = (value,label,current) => `<option value="${escape(value)}" ${String(value)===String(current)?'selected':''}>${escape(label)}</option>`;

export const CAMPAIGN_CATEGORIES = ['تعريفي - بالبراند','تعريفي - بالويب سايت','تعريفي - مواصفات السيارات','بيعي - قسط','بيعي - كاش'];
const eligible = idea => idea && !idea.retiredFromIdeaBank && !idea.requiresVerification && idea.sourceStatus!=='موقوف' && CAMPAIGN_CATEGORIES.includes(idea.marketingCategory);
const selectionCodes = bridge => [...new Set(bridge.selectedCodes||[])];
const ideaRows = plan => plan ? [...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))] : [];
const selectedIdeas = state => selectionCodes(state.bridge).map(code=>getIdea(state.plan,code)).filter(Boolean);
const groupedName = (category,ideas) => {
 const name=category+' ('+ideas.map(idea=>idea.title).join(' + ')+')';
 if(name.length>250)throw Error('عنوان التاسك أطول من 250 حرفًا؛ اختر أفكارًا أقل أو أسماء أقصر، بدون قص العناوين.');
 return name;
};
export function newBridgeState() {
 return {stock:[],executors:[],taskTypes:[],formats:[],loading:false,error:'',
  category:'',selectedCodes:[],ideaCode:'',ideaSearch:'',mode:'single',chosenStocks:[],stockSearch:'',
  formatIdsByKind:{image:[],video:[]},taskTypeId:'',assignments:[{assignee:'',dueOn:nowInRiyadh()}],
  remoteTasks:{},busy:false,lastCreatedTask:null,focusAfterSave:'',carsExpanded:true};
}
export function selectBridgeCategory(state, category) {
 if(category&&!CAMPAIGN_CATEGORIES.includes(category))throw Error('تصنيف غير معتمد');
 Object.assign(state.bridge,{category,selectedCodes:[],ideaCode:'',mode:'single',chosenStocks:[],stockSearch:'',error:''});
}
export function toggleBridgeIdea(state,code,checked) {
 const idea=getIdea(state.plan,code),bridge=state.bridge;
 if(!eligible(idea)||!ideaIsApproved(state.plan,code))throw Error('الفكرة غير معتمدة أو غير متاحة');
 if(checked&&bridge.category&&idea.marketingCategory!==bridge.category)
   throw Error('لا يمكن جمع فكرتين من تصنيفين مختلفين في تاسك واحد');
 if(checked&&!bridge.category)bridge.category=idea.marketingCategory;
 if(checked && selectionCodes(bridge).length>=30)throw Error('الحد الأقصى 30 فكرة في التاسك الواحد');
 const stored=state.plan?.assets?.find(a=>a.code===code)?.integrationDraft;
 if(checked&&stored?.pending===true&&Array.isArray(stored.ideaCodes)){
   const ready=stored.ideaCodes.map(c=>getIdea(state.plan,c));
   if(ready.some(row=>!eligible(row)||row.marketingCategory!==bridge.category))throw Error('تعذر استعادة مجموعة التكليف المحفوظة');
   bridge.selectedCodes=[...stored.ideaCodes];
 }else bridge.selectedCodes=checked?[...selectionCodes(bridge).filter(x=>x!==code),code]:selectionCodes(bridge).filter(x=>x!==code);
 if(!bridge.selectedCodes.includes(bridge.ideaCode)) selectBridgeIdea(state,bridge.selectedCodes[0]||'',false);
}
export function selectBridgeIdea(state, code, add=true) {
 const idea=getIdea(state.plan,code);
 if(idea && !eligible(idea))throw Error('هذه الفكرة موقوفة أو ليست ضمن البنك النشط');
 const first=idea ? state.plan?.assets.find(asset=>asset.code===taskCodes(state.plan,code)[0]) : null;
 if(idea && (state.bridge.category!==idea.marketingCategory))Object.assign(state.bridge,{category:idea.marketingCategory,selectedCodes:[]});
 if(idea && add){
   const stored=first?.integrationDraft?.ideaCodes;
   if(first?.integrationDraft?.pending===true && Array.isArray(stored) && stored.length && first.integrationRequestKey) {
     state.bridge.selectedCodes=stored.filter(c=>getIdea(state.plan,c)?.marketingCategory===idea.marketingCategory);
     state.bridge.assignments=first.integrationDraft.assignments || [{assignee:[first.integrationDraft.assigneeId,first.integrationDraft.departmentId].join('|'),dueOn:first.integrationDraft.dueOn}];
   }
   else if(!state.bridge.selectedCodes.includes(code))state.bridge.selectedCodes.push(code);
 }
 state.bridge.ideaCode=code||'';
 state.bridge.mode=first?.approvedCarMode || 'single';
 state.bridge.chosenStocks=(first?.approvedVehicles || []).map(stockId);
}
export async function fetchBridge(resource, options={}) {
  const {auth} = await connectFirebase();
  if (!auth.currentUser) throw Error('Please sign in to Firebase');
  const idToken = await auth.currentUser.getIdToken();
  const url = new URL('/api/marketing-bridge',window.location.origin);
  if (!options.body) { url.searchParams.set('resource',resource); if(options.taskId)url.searchParams.set('taskId',options.taskId); }
  const reply = await fetch(url,{method:options.body?'POST':'GET',headers:{Authorization:`Bearer ${idToken}`, ...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify({action:resource==='agenda'?'agenda':'assign',...options.body})}:{})});
  const payload = await reply.json().catch(()=>({ok:false,error:'Invalid API response'}));
  if(!reply.ok || !payload.ok)throw Error(payload.error || `Bridge request failed (${reply.status})`);
  return payload;
}
export async function reloadBridge(state) {
  if(state.loading)return;
  state.loading=true;state.error='';
  try {
    const [stock,people,types]=await Promise.all([fetchBridge('stock'),fetchBridge('executors'),fetchBridge('catalog')]);
    state.stock=stock.cars||[];state.executors=people.executors||[];
    state.taskTypes=types.taskTypes||[];state.formats=types.formats||[];
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;}
}
export function bridgePage(state) {
  const bridge=state.bridge,plan=state.plan;
  const all=ideaRows(plan).filter(row=>eligible(row)&&ideaIsApproved(plan,row.code));
  const chosen=selectedIdeas(state).filter(idea=>eligible(idea)&&idea.marketingCategory===bridge.category);
  const search=String(bridge.ideaSearch||'').trim().toLocaleLowerCase();
  const visible=all.filter(row=>(!bridge.category||row.marketingCategory===bridge.category)
    &&(!search||[row.title,row.marketingCategory,row.executor,row.marketingExecutorName].join(' ').toLocaleLowerCase().includes(search)));
  const current=chosen.find(row=>row.code===bridge.ideaCode)||chosen[0]||null;
  const codes=current?taskCodes(plan,current.code):[];
  const assets=codes.map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
  const confirmed=assets.length>0&&assets.every(a=>Boolean(a.creativeApprovedAt));
  const pending=assets.some(a=>a.integrationDraft?.pending===true && a.integrationRequestKey);
  const savedMode=assets[0]?.approvedCarMode||'single';
  const savedCars=(assets[0]?.approvedVehicles||[]).map(stockId).sort();
  const selectedCars=[...bridge.chosenStocks].sort();
  const selectionCurrent=confirmed&&savedMode===bridge.mode&&JSON.stringify(savedCars)===JSON.stringify(selectedCars);
  const ready=chosen.length>0&&chosen.length===selectionCodes(bridge).length&&chosen.every(row=>{
    const rows=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
    return rows.length>0&&rows.every(item=>item.creativeApprovedAt && (!item.integrationDraft?.pending || item.integrationRequestKey));
  });
  const remaining=chosen.filter(row=>taskCodes(plan,row.code).some(code=>!plan.assets.find(a=>a.code===code)?.creativeApprovedAt));
  const pendingDraft=pending?assets.find(a=>a.integrationDraft?.pending)?.integrationDraft||null:null;
  const lockDraft=Boolean(pendingDraft);
  const typePref=bridge.category.startsWith('تعريفي')?'تعريف':bridge.category.startsWith('بيعي')?'بيع':'';
  const matchingTypes=bridge.taskTypes.filter(t=>String(t.name||'').includes(typePref));
  const taskTypeDefault=pendingDraft?.typeId||bridge.taskTypeId||(matchingTypes.length===1?matchingTypes[0].id:'');
  const assignments=pendingDraft?.assignments || bridge.assignments || [{assignee:'',dueOn:nowInRiyadh()}];
  const table=visible.map((row,index)=>{
    const rowAssets=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
    const linked=rowAssets.some(a=>a.marketingTaskId || (a.previousMarketingTasks||[]).length);
    const checked=selectionCodes(bridge).includes(row.code);
    const lockedByCategory=Boolean(bridge.category&&row.marketingCategory!==bridge.category);
    const isConfirmed=rowAssets.length&&rowAssets.every(a=>a.creativeApprovedAt);
    const media=row.kind==='video'?'فيديو':'صور · '+Math.max(1,Number(row.imageCount)||row.imageSlides?.length||1);
    const executor=row.marketingExecutorName||row.executor||'لم يُحدد';
    const disabled=lockedByCategory;
    const stateText=linked?'تم التكليف سابقًا · متاح لإعادة الاستخدام':isConfirmed?'السيارات مؤكدة':'بانتظار تحديد السيارات';
    return `<article class="bridge-idea-option ${checked?'bridge-idea-selected':''}">
      <div class="bridge-idea-option-main"><label class="bridge-idea-checkbox" aria-label="اختيار ${escape(row.title)}"><input type="checkbox" name="bridge-select-idea" value="${escape(row.code)}" ${checked?'checked':''} ${disabled?'disabled':''}/><strong>${escape(row.title)}</strong></label><span class="bridge-status-chip ${linked?'is-linked':isConfirmed?'is-done':''}">حالة السيارات: ${escape(stateText)}</span></div>
      <div class="bridge-idea-option-details"><span class="bridge-category-chip">${escape(row.marketingCategory)}</span><span>${escape(media)}</span><span>المنفذ المقترح: ${escape(executor)}</span></div>
      <button type="button" class="btn p-small" data-action="bridge-edit-cars" data-id="${escape(row.code)}" ${!checked?'disabled':''}>${isConfirmed?'تعديل السيارات':'اختيار السيارات'}</button>
    </article>`;
  }).join('');
  const stockOptions=bridge.stock.filter(car=>!bridge.stockSearch||formatStock(car).toLowerCase().includes(bridge.stockSearch.toLowerCase()))
    .slice(0,80).map(car=>{
      const key=stockId(car);
      return `<label class="bridge-car-option"><input type="checkbox" name="cars" value="${escape(key)}" ${bridge.chosenStocks.includes(key)?'checked':''}/>
      <span class="bridge-car-copy"><strong>${escape(car.car_name||'-')} | ${escape(car.statement||'-')} | ${escape(car.model_year||'-')}</strong>
      <small>الخارجي: ${escape(car.exterior_color||'-')} | الداخلي: ${escape(car.interior_color||'-')}</small></span></label>`;
    }).join('');
  const imageKinds=[...new Set(chosen.map(imageOrVideo))];
  const formats=kind=>{
    const kinds=bridge.formats.filter(f=>f.mediaKinds?.includes(kind));
    const saved=pendingDraft?.formatIdsByKind?.[kind]||bridge.formatIdsByKind?.[kind]||[];
    return `<fieldset class="bridge-formats"><legend>مقاسات ${kind==='video'?'الفيديو':'الصور'}</legend><div class="bridge-format-grid">${kinds.map(f=>
      `<label class="bridge-format-option"><input type="checkbox" name="format_${kind}" value="${escape(f.id)}"
      ${saved.includes(f.id)?'checked':''} ${lockDraft?'disabled':''}/><span>${escape(f.platform_name)} — ${escape(f.name)}
      <small>${escape(f.width||'?')} × ${escape(f.height||'?')}</small></span></label>`).join('')||'<p>لا توجد مقاسات متاحة. اضغط تحديث المنفذين والمقاسات.</p>'}</div></fieldset>`;
  };
  let taskName='',nameError='';
  try{if(chosen.length)taskName=groupedName(bridge.category,chosen);}catch(error){nameError=error.message;}
  const pendingConfirms=remaining.length;
  const choices=CAMPAIGN_CATEGORIES.map(cat=>{
    const count=all.filter(row=>row.marketingCategory===cat).length;
    const active=bridge.category===cat;
    return `<button type="button" class="bridge-category-tab ${active?'active':''}" data-action="bridge-pick-category" data-category="${escape(cat)}" aria-pressed="${active?'true':'false'}">
       ${escape(cat)}<span>${count}</span></button>`;
  }).join('');
  return `<div class="ui-page-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>تحديث المنفذين والمقاسات والاستوك</button></div>
   ${bridge.error?`<div class="notice warning" id="bridge-error" role="alert">${escape(bridge.error)}</div>`:''}
   ${!plan?'<div class="notice warning">حمّل خطة المحتوى أولًا.</div>':`
   <div class="bridge-steps-layout">
   <section class="card panel bridge-table-panel" id="bridge-approved-ideas">
     <div class="bridge-table-heading"><h2>01 — الأفكار المعتمدة</h2><span class="bridge-summary-count">${all.length} فكرة معتمدة</span></div>
     <div class="bridge-category-tabs"><button type="button" class="bridge-category-tab ${!bridge.category?'active':''}" data-action="bridge-pick-category" data-category="" aria-pressed="${!bridge.category?'true':'false'}">كل التصنيفات <span>${all.length}</span></button>${choices}</div>
     <div class="bridge-table-controls"><label>بحث باسم الفكرة أو المنفذ<input id="bridge-idea-search" type="search" value="${escape(bridge.ideaSearch||'')}" placeholder="ابحث عن فكرة أو منفذ"/></label>
       <button type="button" class="btn" data-action="bridge-filter-ideas">بحث</button></div>
     <div class="bridge-approved-list">${table||'<div class="bridge-table-empty">لا توجد أفكار معتمدة مطابقة للبحث والتصنيف.</div>'}</div>
     ${chosen.length?`<div class="bridge-selected-summary"><strong>تم تحديد ${chosen.length} فكرة</strong>
       <span>التصنيف: ${escape(bridge.category)}</span><span>المتبقي لتأكيد السيارات: ${pendingConfirms}</span></div>`:''}
   </section>
   <section class="card panel bridge-car-workspace" id="bridge-cars-area">
     <div class="bridge-table-heading"><h2>02 — تأكيد السيارات لكل فكرة</h2><div class="bridge-heading-actions"><span class="bridge-summary-count">${chosen.length-pendingConfirms} / ${chosen.length} مؤكد</span><button type="button" class="btn p-small bridge-collapse-toggle" data-action="bridge-toggle-cars" aria-expanded="${bridge.carsExpanded!==false}" aria-controls="bridge-cars-body">${bridge.carsExpanded===false?'فتح':'إغلاق'}</button></div></div>
     ${bridge.carsExpanded!==false?`<div id="bridge-cars-body" class="bridge-step-body">${chosen.length?`
     <div class="bridge-chosen-strip">${chosen.map(row=>{
       const done=taskCodes(plan,row.code).every(code=>plan.assets.find(a=>a.code===code)?.creativeApprovedAt);
       return `<button type="button" data-action="bridge-edit-cars" data-id="${escape(row.code)}" class="bridge-chosen-chip ${current?.code===row.code?'active':''}">
         ${escape(row.title)}<small>${done?'تم تأكيد السيارات':'يحتاج تأكيد'}</small></button>`;
     }).join('')}</div>
     ${current?`<div class="bridge-car-active"><h3>${escape(current.title)}</h3>

       <form id="bridge-approval" class="p-edit-form bridge-form">
         <label>نوع اختيار السيارات<select id="bridge-mode" name="carMode" ${pending?'disabled':''}>
           ${opt('none','لا تحتاج سيارة محددة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}
           ${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
         ${bridge.mode!=='none'?`<label>ابحث في السيارات المتاحة<input type="search" id="bridge-stock-search" value="${escape(bridge.stockSearch)}" placeholder="اسم السيارة أو الموديل"/></label>
           <button type="button" class="btn" data-action="bridge-stock-filter">بحث في الاستوك</button>
           <div class="bridge-stock-summary">السيارات المحددة لهذه الفكرة: <strong>${bridge.chosenStocks.length}</strong></div>
           <div class="bridge-car-list" id="bridge-cars">${stockOptions||'<p class="p-help">لا توجد سيارات مطابقة للبحث.</p>'}</div>`:''}
         <button type="submit" class="btn btn-primary bridge-confirm" ${pending||bridge.busy?'disabled':''}>
           ${selectionCurrent?'حفظ تأكيد السيارات':'تأكيد سيارات هذه الفكرة والمتابعة'}</button>
       </form></div>`:''}
     `:''}</div>`:''}
   </section>
   <section class="card panel bridge-assignment-panel" id="bridge-assignment-area"><h2>03 — تفاصيل التاسك وإنشاؤه</h2>
     ${chosen.length?`<div class="bridge-step-body">
     ${nameError?`<div class="notice warning">${escape(nameError)}</div>`:''}
     ${taskName?`<div class="bridge-task-title-preview"><small>الاسم النهائي للتاسك</small><strong>${escape(taskName)}</strong></div>`:''}
     <form id="bridge-assign" class="p-edit-form bridge-form">
       <div class="bridge-assign-fields">
         <label>نوع التاسك في التسويق<select name="taskTypeId" required>
           <option value="">اختر النوع</option>${bridge.taskTypes.map(t=>opt(t.id,t.name,taskTypeDefault)).join('')}</select></label>
       </div>
       <div class="bridge-assignees"><h3>المنفذون ومواعيد التسليم</h3>
         ${assignments.map((entry,index)=>{
           const user=bridge.executors.find(row=>row.user_id+'|'+row.department_id===entry.assignee);
           const photography=Boolean(user && /تصوير|photograph|shoot/i.test(user.department_name));
           return `<div class="bridge-assignee-row" key="${index}">
             <label>المنفذ ${index+1}<select name="assignee_${index}" required ${lockDraft?'disabled':''}>
               <option value="">اختر المنفذ</option>${bridge.executors.map(row=>opt(row.user_id+'|'+row.department_id,row.full_name,entry.assignee)).join('')}</select></label>
             <label>تاريخ تسليم ${photography?'التصوير':'المنفذ'}<input name="dueOn_${index}" type="date" min="${nowInRiyadh()}"
               value="${escape(entry.dueOn||nowInRiyadh())}" required ${lockDraft?'disabled':''}/></label>
             <span class="bridge-assignee-role">${photography?'تسليم رابط Google Drive':'رفع الملفات النهائية'}</span>
             ${index>0&&!lockDraft?`<button type="button" class="btn" data-action="bridge-remove-assignee" data-index="${index}">إزالة</button>`:''}
           </div>`;
         }).join('')}
         <button type="button" class="btn" data-action="bridge-add-assignee" ${lockDraft||assignments.length>=10?'disabled':''}>+ إضافة منفذ آخر</button>
       </div>
       ${imageKinds.includes('image')?formats('image'):''}${imageKinds.includes('video')?formats('video'):''}
       <button type="submit" class="btn btn-primary bridge-submit" ${!ready||!!nameError||bridge.busy?'disabled':''}>
         ${chosen.some(row=>taskCodes(plan,row.code).some(code=>plan.assets.find(a=>a.code===code)?.integrationDraft))?
           'استكمال إنشاء التاسك المحفوظ':'إنشاء تاسك واحد يحتوي '+chosen.length+' فكرة'}</button>
     </form></div>`:''}
   </section></div>
   `}`;
}
export function currentApproval(state) {
  const idea=getIdea(state.plan,state.bridge.ideaCode);
  const assets=(idea?taskCodes(state.plan,idea.code):[]).map(code=>state.plan.assets.find(a=>a.code===code)).filter(Boolean);
  return { idea,assets,carMode:assets[0]?.approvedCarMode||'',cars:assets[0]?.approvedVehicles||[],approved:assets.length>0 && assets.every(a=>Boolean(a.creativeApprovedAt)) };
}
export async function approveBridgeIdea(state, mode, selectedCars) {
  const {idea,assets}=currentApproval(state);
  if(!idea || !assets.length || !ideaIsApproved(state.plan,idea.code))throw Error('يجب مراجعة الفكرة واعتمادها قبل اختيار السيارات');
  if(assets.some(a=>a.integrationDraft?.pending===true))throw Error('يوجد طلب تكليف غير مكتمل؛ استكمله أولًا قبل تغيير السيارات');
  if(!['none','single','compare'].includes(mode))throw Error('نوع اختيار السيارات غير صحيح');
  if(mode==='single' && selectedCars.length<1 || mode==='compare' && selectedCars.length<2 || mode==='none' && selectedCars.length)throw Error('Car selection does not match the comparison requirement');
  const chosen=selectedCars.map(value=>{const obj=JSON.parse(value);return state.bridge.stock.find(car=>stockId(car)===JSON.stringify(obj));});
  if(chosen.some(v=>!v)||new Set(selectedCars).size!==selectedCars.length)throw Error('One or more selected cars are no longer available');
  const approval={approvedVehicles:chosen,approvedCarMode:mode,creativeApprovedAt:new Date().toISOString(),integrationRequestKey:''};
  await updateManyAssets(assets.map(a=>a.code),approval);
  for(const asset of assets)Object.assign(asset,approval);
  return chosen;
}
export async function assignBridgeIdea(state,form) {
 const plan=state.plan,bridge=state.bridge,ideas=selectedIdeas(state);
 if(!ideas.length||ideas.length>30||ideas.some(idea=>!eligible(idea)||idea.marketingCategory!==bridge.category||!ideaIsApproved(plan,idea.code)))
   throw Error('اختر من 1 إلى 30 فكرة معتمدة من نفس التصنيف');
 const name=groupedName(bridge.category,ideas);
 const groups=ideas.map(idea=>({idea,assets:taskCodes(plan,idea.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean)}));
 if(groups.some(group=>!group.assets.length||group.assets.some(a=>!a.creativeApprovedAt)))
   throw Error('يجب تأكيد سيارات كل فكرة قبل التكليف');
 const typeId=String(form.elements.namedItem('taskTypeId')?.value||'');
 if(!bridge.taskTypes.some(t=>t.id===typeId))throw Error('اختر نوع التاسك المعتمد');
 const rows=bridge.assignments.map((entry,index)=>({
   assignee:String(form.elements.namedItem('assignee_'+index)?.value||entry.assignee||''),
   dueOn:String(form.elements.namedItem('dueOn_'+index)?.value||entry.dueOn||''),
 }));
 const assignments=rows.map(entry=>{
   const [userId,departmentId]=entry.assignee.split('|');
   const person=bridge.executors.find(row=>row.user_id===userId&&row.department_id===departmentId);
   if(!person)throw Error('اختر منفذًا مؤهلًا من سيستم التسويق لكل مطلوب');
   if(!validISODate(entry.dueOn)||entry.dueOn<nowInRiyadh())throw Error('حدد تاريخ تسليم صحيحًا لكل منفذ');
   return {assignee:entry.assignee,assigneeId:userId,departmentId,dueOn:entry.dueOn,
     name:person.full_name,deliveryMode:/تصوير|photograph|shoot/i.test(person.department_name)?'drive_link':'files'};
 });
 if(!assignments.length||assignments.length>10||new Set(assignments.map(row=>row.assigneeId)).size!==assignments.length)
   throw Error('اختر منفذين مختلفين، بحد أقصى 10 منفذين لكل تاسك');
 if(ideas.length*assignments.length>100)throw Error('التاسك الواحد يدعم 100 مطلوب كحد أقصى. قلل عدد الأفكار أو المنفذين.');
 const formatsByKind=Object.fromEntries(['image','video'].map(kind=>[kind,[...form.querySelectorAll('input[name="format_'+kind+'"]:checked')].map(x=>x.value)]));
 for(const kind of new Set(ideas.map(imageOrVideo))){
   const formatIds=formatsByKind[kind];
   if(!formatIds.length||formatIds.some(id=>!bridge.formats.some(f=>f.id===id&&f.mediaKinds?.includes(kind))))
     throw Error('اختر مقاسات '+(kind==='image'?'الصور':'الفيديو')+' المناسبة');
 }
 const assets=groups.flatMap(group=>group.assets);
 const pending=assets.filter(a=>a.integrationDraft?.pending===true&&a.integrationRequestKey);
 const draft={pending:true,ideaCodes:ideas.map(x=>x.code),typeId,assignments,formatIdsByKind:formatsByKind,name};
 let requestKey;
 if(pending.length){
   const keys=[...new Set(pending.map(a=>a.integrationRequestKey))];
   const saved=pending[0].integrationDraft;
   if(keys.length!==1||pending.length!==assets.length||JSON.stringify(saved)!==JSON.stringify(draft))
     throw Error('يوجد تكليف محفوظ غير مكتمل. استكمل نفس المجموعة والمنفذين والمواعيد أولًا.');
   requestKey=keys[0];
 }else{
   requestKey=crypto.randomUUID();
   await updateManyAssets(assets.map(a=>a.code),{integrationRequestKey:requestKey,integrationDraft:draft});
   for(const asset of assets)Object.assign(asset,{integrationRequestKey:requestKey,integrationDraft:draft});
 }
 const items=await Promise.all(groups.flatMap(({idea,assets})=>assignments.map(async assignment=>{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(requestKey+':'+idea.code+':'+assignment.assignee));
   const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
   const h=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
   const clientKey=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
   const cars=assets[0].approvedVehicles||[];
   const carText=cars.length?cars.map(formatStock).join('\n'):'لا توجد سيارات محددة للفكرة';
   const ideaText=[`بريف إبداعي: ${idea.title}`,idea.briefNotes?`ملخص الفكرة: ${idea.briefNotes}`:'',idea.executionMethod?`أسلوب التنفيذ: ${idea.executionMethod}`:'',`السيارات المعتمدة:\n${carText}`].filter(Boolean).join('\n');
   const explanation=`الجمهور والهدف:\n${idea.audienceAndGoal||''}\n\nالرسالة:\n${idea.message||''}`;
   const creativeTreatment=toCreativeTreatmentText(plan,idea.code);
   if([ideaText,explanation,creativeTreatment].some(value=>value.length>20000))throw Error('البريف أو المعالجة الإبداعية يتجاوز الحد المسموح: '+idea.title);
   return {clientKey,ideaCode:idea.code,departmentId:assignment.departmentId,assigneeId:assignment.assigneeId,
     deliveryMode:assignment.deliveryMode,mediaKind:imageOrVideo(idea),ideaName:idea.title,idea:ideaText,
     explanation,creativeTreatment,dueOn:assignment.dueOn,formatIds:formatsByKind[imageOrVideo(idea)]};
 })));
 const result=await fetchBridge('assignments',{body:{requestKey,typeId,name,source:{planId:PLAN_ID,ideaCodes:ideas.map(x=>x.code)},items}});
 const links=groups.flatMap(({idea,assets})=>{
   const primary=items.find(item=>item.ideaCode===idea.code&&item.deliveryMode==='files') || items.find(item=>item.ideaCode===idea.code);
   const itemId=result.items?.find(row=>row.client_key===primary?.clientKey)?.id;
   const names=assignments.map(row=>row.name).join('، ');
   const dueDate=assignments.find(row=>row.deliveryMode==='files')?.dueOn||assignments[0].dueOn;
   return assets.map(asset=>({code:asset.code,taskId:result.id,taskNo:result.taskNo,itemId:itemId||'',executorName:names,newDueDate:dueDate,
     previousMarketingTasks:asset.previousMarketingTasks||[],previousTask:asset.marketingTaskId?{
       taskId:asset.marketingTaskId,taskNo:asset.marketingTaskNo||'',itemId:asset.marketingItemId||'',
       executorName:asset.marketingExecutorName||'',linkedAt:asset.marketingLinkedAt||'',dueDate:asset.dueDate||''}:null}));
 });
 if(links.some(link=>!link.itemId))throw Error('تم إنشاء التاسك لكن ربط المطلوبات لم يكتمل؛ أعد نفس الطلب');
 await linkMarketingTask(links);
 for(const link of links){
   const asset=plan.assets.find(a=>a.code===link.code);
   const old=link.previousTask&&link.previousTask.taskId!==link.taskId?[link.previousTask]:[];
   const history=[...link.previousMarketingTasks,...old].slice(-30);
   Object.assign(asset,{marketingTaskId:link.taskId,marketingTaskNo:link.taskNo,marketingItemId:link.itemId,
     marketingExecutorName:link.executorName,dueDate:link.newDueDate,previousMarketingTasks:history,integrationDraft:null,integrationRequestKey:''});
 }
 return result;
}
export async function checkBridgeTask(state){
  const item=currentApproval(state).assets.find(row=>row.marketingTaskId);
  if(!item)throw Error('No linked Marketing task for this idea');
  const data=await fetchBridge('assignments',{taskId:item.marketingTaskId});
  state.bridge.remoteTasks[item.marketingTaskId]=data;
  return data;
}
