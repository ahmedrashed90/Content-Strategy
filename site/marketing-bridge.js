import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, toBriefText, ideaIsApproved, reviewStatusFor, nowInRiyadh } from './planner.js';
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
const historicalLinkedTask = (plan,idea) => {
 const key=String(idea?.title||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 if(!key)return null;
 return (plan?.assets||[]).find(x=>x.retiredFromIdeaBank&&x.marketingTaskId&&
   String(x.title||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()===key)||null;
};
const groupedName = (category,ideas) => {
 const name=category+' ('+ideas.map(idea=>idea.title).join(' + ')+')';
 if(name.length>250)throw Error('عنوان التاسك أطول من 250 حرفًا؛ اختر أفكارًا أقل أو أسماء أقصر، بدون قص العناوين.');
 return name;
};
export function newBridgeState() {
 return {stock:[],executors:[],taskTypes:[],formats:[],loading:false,error:'',
  category:'',selectedCodes:[],ideaCode:'',ideaSearch:'',mode:'single',chosenStocks:[],stockSearch:'',
  formatIdsByKind:{image:[],video:[]},taskTypeId:'',assignee:'',dueOn:nowInRiyadh(),
  remoteTasks:{},busy:false,lastCreatedTask:null,focusAfterSave:''};
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
 const previous=historicalLinkedTask(state.plan,idea);
 if(previous)throw Error('سبق إنشاء تكليف لهذه الفكرة في نسخة سابقة: '+(previous.marketingTaskNo||previous.marketingTaskId)+'. راجع التكليف القديم قبل إعادة التكليف.');
 if(checked && selectionCodes(bridge).length>=30)throw Error('الحد الأقصى 30 فكرة في التاسك الواحد');
 const stored=state.plan?.assets?.find(a=>a.code===code)?.integrationDraft;
 if(checked&&Array.isArray(stored?.ideaCodes)){
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
   if(Array.isArray(stored)&&stored.length&&first?.integrationRequestKey&&!first?.marketingTaskId)
     state.bridge.selectedCodes=stored.filter(c=>getIdea(state.plan,c)?.marketingCategory===idea.marketingCategory);
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
  const reply = await fetch(url,{method:options.body?'POST':'GET',headers:{Authorization:`Bearer ${idToken}`, ...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify({action:'assign',...options.body})}:{})});
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
  const ideas=ideaRows(plan),categorized=ideas.filter(idea=>eligible(idea)&&idea.marketingCategory===bridge.category);
  const chosen=selectedIdeas(state).filter(idea=>eligible(idea)&&idea.marketingCategory===bridge.category);
  const badSelections=selectionCodes(bridge).length!==chosen.length;
  const idea=getIdea(plan,bridge.ideaCode);
  const codes=idea?taskCodes(plan,idea.code):[],assets=codes.map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
  const linked=assets.some(a=>a.marketingTaskId),reviewed=Boolean(idea&&ideaIsApproved(plan,idea.code));
  const carsConfirmed=assets.length>0&&assets.every(a=>Boolean(a.creativeApprovedAt));
  const firstCarSet=assets[0]?.approvedVehicles||[];
  const activeCarSet=[...bridge.chosenStocks].sort(),savedCarSet=firstCarSet.map(stockId).sort();
  const selectionCurrent=reviewed&&carsConfirmed&&bridge.mode===(assets[0]?.approvedCarMode||'single')&&JSON.stringify(activeCarSet)===JSON.stringify(savedCarSet);
  const pending=assets.some(a=>a.integrationRequestKey&&!a.marketingTaskId);
  const available=chosen.filter(item=>ideaIsApproved(plan,item.code)&&!item.requiresVerification&&!item.retiredFromIdeaBank&&!ideaRows(plan).find(v=>v.code===item.code)?.sourceStatus?.includes('موقوف'));
  const selectionReady=chosen.length>0&&!badSelections&&available.length===chosen.length&&chosen.every(item=>{
    const rows=taskCodes(plan,item.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
    return rows.length&&rows.every(row=>row.creativeApprovedAt&&!row.marketingTaskId)
      && !rows.some(row=>row.integrationRequestKey&&!row.integrationDraft);
  });
  const incomplete=chosen.filter(item=>taskCodes(plan,item.code).some(code=>!plan.assets.find(a=>a.code===code)?.creativeApprovedAt));
  const carOptions=bridge.stock.filter(car=>!bridge.stockSearch||formatStock(car).toLowerCase().includes(bridge.stockSearch.toLowerCase())).slice(0,80).map(car=>{
    const key=stockId(car);
    return `<label class="bridge-car-option"><input type="checkbox" name="cars" value="${escape(key)}" ${bridge.chosenStocks.includes(key)?'checked':''}/><span class="bridge-car-copy"><strong>${escape(car.car_name||'-')} | ${escape(car.statement||'-')} | ${escape(car.model_year||'-')}</strong><small>الخارجي: ${escape(car.exterior_color||'-')} | الداخلي: ${escape(car.interior_color||'-')}</small></span></label>`;
  }).join('');
  const pendingDraft=assets[0]?.integrationDraft||null,lockDraft=Boolean(pending&&pendingDraft);
  const renderFormat=kind=>{
    const formats=bridge.formats.filter(f=>f.mediaKinds?.includes(kind));
    return `<fieldset class="bridge-formats"><legend>مقاسات ${kind==='video'?'الفيديو':'الصور'}</legend>${formats.map(f=>`<label class="p-check"><input type="checkbox" name="format_${kind}" value="${escape(f.id)}" ${(pendingDraft?.formatIdsByKind?.[kind]||[]).includes(f.id)?'checked':''} ${lockDraft?'disabled':''}/>${escape(f.platform_name)} - ${escape(f.name)} (${escape(f.width||'?')}x${escape(f.height||'?')})</label>`).join('')||'<p>لا توجد مقاسات لهذا النوع في التسويق</p>'}</fieldset>`;
  };
  let taskName='',nameError='';
  try{if(chosen.length)taskName=groupedName(bridge.category,chosen)}catch(error){nameError=error.message}
  const linkedTask=assets[0]?.marketingTaskId?bridge.remoteTasks[assets[0].marketingTaskId]:null;
  return `<div class="page-header"><div><div class="page-eyebrow">التكليفات الإبداعية</div><h1 class="page-title">إنشاء تاسك من فكرة أو عدة أفكار</h1><p class="page-description">اختَر تصنيفًا واحدًا ثم أفكارًا معتمدة من التصنيف نفسه. كل فكرة تصبح مطلوبًا مستقلًا داخل تاسك واحد.</p></div><div class="p-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>تحديث المنفذين والمقاسات والاستوك</button></div></div>
    ${bridge.error?`<div class="notice warning">${escape(bridge.error)}</div>`:''}
    ${!plan?'<div class="notice">حمّل خطة المحتوى أولاً.</div>':`
      <section class="card panel"><h2>01 — التصنيف واختيار الأفكار</h2>
        <label>تصنيف التاسك<select id="bridge-category"><option value="">اختر التصنيف</option>${CAMPAIGN_CATEGORIES.map(cat=>opt(cat,cat,bridge.category)).join('')}</select></label>
        ${bridge.category?`<div class="bridge-multi-list">${categorized.map(row=>{
          const rowAssets=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
          const historical=historicalLinkedTask(plan,row);
          const locked=rowAssets.some(a=>a.marketingTaskId)||Boolean(historical),confirmed=rowAssets.every(a=>a.creativeApprovedAt);
          return `<label class="bridge-multi-option"><input type="checkbox" name="bridge-select-idea" value="${escape(row.code)}" ${selectionCodes(bridge).includes(row.code)?'checked':''} ${!ideaIsApproved(plan,row.code)||locked?'disabled':''}/><span><strong>${escape(row.title)}</strong><small>${row.kind==='video'?'فيديو':(Number(row.imageCount)||1)+' صور'} · ${locked?'له تكليف سابق'+(historical?' '+(historical.marketingTaskNo||''):''):!ideaIsApproved(plan,row.code)?'بانتظار الاعتماد':confirmed?'السيارات مؤكدة':'يحتاج تأكيد السيارات'}</small></span></label>`;
        }).join('')||'<p>لا توجد أفكار لهذا التصنيف.</p>'}</div>`:'<p class="p-help">اختر تصنيفًا لعرض الأفكار التابعة له.</p>'}
        <div class="notice">${chosen.length?'عدد الأفكار المختارة: '+chosen.length:'اختر فكرة واحدة على الأقل'}${taskName?'<br/>اسم التاسك: <strong>'+escape(taskName)+'</strong>':''}${nameError?'<br/>'+escape(nameError):''}</div>
      </section>
      ${chosen.length?`<div class="p-two-columns bridge-v15-columns bridge-redesign">
      <section class="card panel"><h2>02 — تأكيد السيارات لكل فكرة</h2><p class="p-help">يمكن تحديد السيارات لكل فكرة على حدة قبل إنشاء التاسك، ولا تتغير اختيارات الأفكار الأخرى.</p>
        <label>الفكرة الجاري تأكيدها<select id="bridge-idea">${chosen.map(row=>opt(row.code,row.title,bridge.ideaCode)).join('')}</select></label>
        ${idea?`<div class="bridge-idea-snapshot"><span>${escape(idea.title)}</span><span>${reviewed?'معتمدة':'بانتظار المراجعة'}</span></div>
          ${linked?`<div class="notice">الفكرة مرتبطة مسبقًا بتاسك ${escape(assets[0]?.marketingTaskNo||'')}</div>`:''}
          ${reviewed&&!linked?`<form id="bridge-approval" class="p-edit-form bridge-form">
            <label>نوع اختيار السيارات<select id="bridge-mode" name="carMode" ${pending?'disabled':''}>${opt('none','لا تحتاج سيارة محددة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
            ${bridge.mode!=='none'?`<label>بحث الاستوك<input id="bridge-stock-search" value="${escape(bridge.stockSearch)}" placeholder="اسم السيارة أو الموديل"/></label><button type="button" class="btn" data-action="bridge-stock-filter">بحث</button><div class="bridge-stock-summary">السيارات المحددة: <strong>${bridge.chosenStocks.length}</strong></div><div class="bridge-car-list" id="bridge-cars">${carOptions}</div>`:''}
            <button type="submit" class="btn btn-primary" ${pending||bridge.busy?'disabled':''}>${selectionCurrent?'تحديث تأكيد السيارات':'تأكيد السيارات لهذه الفكرة'}</button></form>`:''}
          ${linkedTask?`<div class="bridge-status">${escape(linkedTask.task?.status||'')}</div>`:''}`:''}
        ${incomplete.length?`<div class="notice warning">تحتاج تأكيد السيارات: ${incomplete.map(x=>escape(x.title)).join('، ')}</div>`:''}
      </section>
      <section class="card panel"><h2>03 — المنفذ والمطلوبات وإنشاء التاسك</h2>
        <div class="bridge-selected-items">${chosen.map(row=>`<div class="p-scene"><strong>${escape(row.title)}</strong><p>${row.kind==='video'?'فيديو بمشاهده وفويس أوفر منفصل':'صور: '+(row.imageSlides?.length||row.imageCount||1)+' — لكل صورة نص وتصميم مستقل'}</p></div>`).join('')}</div>
        <form id="bridge-assign" class="p-edit-form bridge-form">
          <label>نوع التاسك في التسويق<select name="taskTypeId" required><option value="">اختر النوع المعتمد</option>${bridge.taskTypes.map(t=>opt(t.id,t.name,pendingDraft?.typeId||bridge.taskTypeId)).join('')}</select></label>
          <label>المنفذ<select name="assignee" required><option value="">اختر المنفذ</option>${bridge.executors.map(row=>opt(row.user_id+'|'+row.department_id,row.full_name+' - '+row.department_name,pendingDraft?pendingDraft.assigneeId+'|'+pendingDraft.departmentId:bridge.assignee)).join('')}</select></label>
          <label>تاريخ التسليم<input name="dueOn" type="date" min="${nowInRiyadh()}" value="${pendingDraft?.dueOn||nowInRiyadh()}" required/></label>
          ${chosen.some(row=>row.kind==='image')?renderFormat('image'):''}
          ${chosen.some(row=>row.kind==='video')?renderFormat('video'):''}
          <div class="notice ${selectionReady?'good':'warning'}">${selectionReady?'كل الأفكار جاهزة للتكليف':incomplete.length?'أكد السيارات لكل فكرة قبل إنشاء التاسك':'لا يمكن إنشاء تاسك لفكرة غير معتمدة أو مرتبطة مسبقًا'}.</div>
          <button type="submit" class="btn btn-primary bridge-submit" ${!selectionReady||!!nameError||bridge.busy?'disabled':''}>${chosen.some(x=>taskCodes(plan,x.code).some(c=>plan.assets.find(a=>a.code===c)?.integrationDraft))?'استكمال التكليف المحفوظ':'إنشاء تاسك واحد ('+chosen.length+' فكرة)'}</button>
        </form>
      </section></div>`:''}
    `}
    <p class="bridge-footnote">يُنشأ التاسك في سيستم التسويق مرة واحدة فقط بعد ضغط إنشاء، مع حفظ الربط لكل فكرة دون تغيير التاسكات السابقة.</p>`;
}
export function currentApproval(state) {
  const idea=getIdea(state.plan,state.bridge.ideaCode);
  const assets=(idea?taskCodes(state.plan,idea.code):[]).map(code=>state.plan.assets.find(a=>a.code===code)).filter(Boolean);
  return { idea,assets,carMode:assets[0]?.approvedCarMode||'',cars:assets[0]?.approvedVehicles||[],approved:assets.length>0 && assets.every(a=>Boolean(a.creativeApprovedAt)) };
}
export async function approveBridgeIdea(state, mode, selectedCars) {
  const {idea,assets}=currentApproval(state);
  if(!idea || !assets.length || !ideaIsApproved(state.plan,idea.code))throw Error('يجب مراجعة الفكرة واعتمادها قبل اختيار السيارات');
  if(assets.some(a=>a.marketingTaskId || a.integrationRequestKey))throw Error('هذه الفكرة مرتبطة بتاسك أو بطلب محفوظ ولا يمكن تعديل السيارات');
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
 if(!ideas.length||ideas.length>30||ideas.some(idea=>!eligible(idea)||idea.marketingCategory!==bridge.category||!ideaIsApproved(plan,idea.code)||historicalLinkedTask(plan,idea)))
   throw Error('لازم تختار من 1 إلى 30 فكرة معتمدة من نفس التصنيف');
 const name=groupedName(bridge.category,ideas);
 const groups=ideas.map(idea=>({idea,assets:taskCodes(plan,idea.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean)}));
 if(groups.some(group=>!group.assets.length||group.assets.some(a=>!a.creativeApprovedAt||a.marketingTaskId)))throw Error('يجب تأكيد السيارات لكل فكرة والتأكد أنها غير مرتبطة بتاسك');
 const taskTypeId=String(form.elements.namedItem('taskTypeId')?.value||'');
 const assigned=String(form.elements.namedItem('assignee')?.value||'').split('|');
 const dueOn=String(form.elements.namedItem('dueOn')?.value||'');
 const formatsByKind=Object.fromEntries(['image','video'].map(kind=>[kind,[...form.querySelectorAll('input[name="format_'+kind+'"]:checked')].map(x=>x.value)]));
 if(!validISODate(dueOn)||(dueOn<nowInRiyadh()&&!groups.some(g=>g.assets.some(a=>a.integrationDraft?.dueOn===dueOn))))throw Error('حدد تاريخ تسليم صحيحًا');
 if(!bridge.taskTypes.some(t=>t.id===taskTypeId))throw Error('اختر نوع التاسك المعتمد');
 const person=bridge.executors.find(row=>row.user_id===assigned[0]&&row.department_id===assigned[1]);
 if(!person)throw Error('اختر منفذًا مؤهلًا في سيستم التسويق');
 for(const kind of new Set(ideas.map(imageOrVideo))){
  const formats=formatsByKind[kind];
  if(!formats.length||formats.some(id=>!bridge.formats.some(f=>f.id===id&&f.mediaKinds?.includes(kind))))throw Error('اختر مقاسات '+(kind==='image'?'الصور':'الفيديو')+' المناسبة');
 }
 const pending=groups.flatMap(g=>g.assets).filter(a=>a.integrationRequestKey&&!a.marketingTaskId);
 let requestKey='';
 if(pending.length){
  const keys=[...new Set(pending.map(x=>x.integrationRequestKey))];
  const draft=pending[0].integrationDraft;
  if(keys.length!==1||pending.length!==groups.flatMap(g=>g.assets).length||!draft?.ideaCodes||
    JSON.stringify(draft.ideaCodes)!==JSON.stringify(ideas.map(x=>x.code))||
    draft.typeId!==taskTypeId||draft.assigneeId!==assigned[0]||draft.departmentId!==assigned[1]||
    draft.dueOn!==dueOn||draft.name!==name||JSON.stringify(draft.formatIdsByKind)!==JSON.stringify(formatsByKind))
    throw Error('يوجد تكليف سابق غير مكتمل. لا تغيّر المجموعة أو البيانات؛ استكمل الطلب نفسه أولًا.');
  requestKey=keys[0];
 } else {
  requestKey=crypto.randomUUID();
  const draft={ideaCodes:ideas.map(x=>x.code),typeId:taskTypeId,assigneeId:assigned[0],departmentId:assigned[1],formatIdsByKind:formatsByKind,dueOn,name};
  const assets=groups.flatMap(g=>g.assets);
  await updateManyAssets(assets.map(a=>a.code),{integrationRequestKey:requestKey,integrationDraft:draft,dueDate:dueOn});
  for(const asset of assets)Object.assign(asset,{integrationRequestKey:requestKey,integrationDraft:draft,dueDate:dueOn});
 }
 const items=await Promise.all(groups.map(async({idea,assets})=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(requestKey+':'+idea.code));
  const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
  const h=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
  const clientKey=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
  const first=assets[0],cars=first.approvedVehicles||[];
  const full=toBriefText(plan,idea.code).replace(/^المنفذ:.*$/m,'المنفذ: '+person.full_name);
  const stockText=cars.length?'\n\nالسيارات المعتمدة:\n'+cars.map(formatStock).join('\n'):'';
  if((full+stockText).length>20000)throw Error('البريف يتجاوز 20,000 حرف. يجب مراجعته دون اختصاره قبل إرساله للتسويق: '+idea.title);
  return {clientKey,departmentId:assigned[1],assigneeId:assigned[0],mediaKind:imageOrVideo(idea),
   ideaName:idea.title,idea:full+stockText,explanation:'',dueOn,formatIds:formatsByKind[imageOrVideo(idea)]};
 }));
 const result=await fetchBridge('assignments',{body:{requestKey,typeId:taskTypeId,name,source:{planId:PLAN_ID,ideaCodes:ideas.map(x=>x.code)},items}});
 const links=groups.flatMap((group,index)=>{
  const itemId=result.items?.find(x=>x.client_key===items[index].clientKey)?.id;
  return group.assets.map(asset=>({code:asset.code,taskId:result.id,taskNo:result.taskNo,itemId:itemId||'',executorName:person.full_name}));
 });
 if(links.some(l=>!l.itemId))throw Error('تم إنشاء التاسك لكن نتيجة ربط المطلوبات غير مكتملة؛ أعد المحاولة بنفس الطلب');
 await linkMarketingTask(links);
 for(const {code,taskId,taskNo,itemId,executorName} of links){const asset=plan.assets.find(a=>a.code===code);Object.assign(asset,{marketingTaskId:taskId,marketingTaskNo:taskNo,marketingItemId:itemId,marketingExecutorName:executorName});}
 return result;
}
export async function checkBridgeTask(state){
  const item=currentApproval(state).assets.find(row=>row.marketingTaskId);
  if(!item)throw Error('No linked Marketing task for this idea');
  const data=await fetchBridge('assignments',{taskId:item.marketingTaskId});
  state.bridge.remoteTasks[item.marketingTaskId]=data;
  return data;
}
