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

export function newBridgeState() { return { stock:[],executors:[],taskTypes:[],formats:[],loading:false,error:'',ideaCode:'',mode:'single',chosenStocks:[],stockSearch:'',formatIds:[],taskTypeId:'',assignee:'',remoteTasks:{},busy:false }; }

export function selectBridgeIdea(state, code) {
  const idea=getIdea(state.plan,code);
  const first=idea ? state.plan?.assets.find(asset=>asset.code===taskCodes(state.plan,code)[0]) : null;
  state.bridge.ideaCode=code;
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
  const bridge=state.bridge;
  const plan=state.plan;
  const allIdeas=plan?[...plan.assets.filter(asset=>asset.kind!=='carousel_slide'),...plan.carousels]:[];
  const idea=getIdea(plan,bridge.ideaCode);
  const codes=idea?taskCodes(plan,idea.code):[];
  const assets=codes.map(code=>plan?.assets.find(row=>row.code===code)).filter(Boolean);
  const linked=assets.some(row=>row.marketingTaskId);
  const reviewed=Boolean(idea && ideaIsApproved(plan,idea.code));
  const carsConfirmed=assets.length>0 && assets.every(row=>Boolean(row.creativeApprovedAt));
  const allSelections=assets.length>0 && assets.every(row=>JSON.stringify(row.approvedVehicles||[])===JSON.stringify(assets[0]?.approvedVehicles||[]));
  const confirmedCars=allSelections?assets[0]?.approvedVehicles||[]:[];
  const confirmedMode=allSelections?assets[0]?.approvedCarMode||'single':'single';
  const approvedCarsIds=confirmedCars.map(stockId).sort();
  const activeCarsIds=[...bridge.chosenStocks].sort();
  const selectionCurrent=reviewed && carsConfirmed && bridge.mode===confirmedMode && JSON.stringify(approvedCarsIds)===JSON.stringify(activeCarsIds);
  const requestPending=assets.some(row=>Boolean(row.integrationRequestKey) && !row.marketingTaskId);
  const fmtType=imageOrVideo(idea);
  const candidates=bridge.formats.filter(f=>f.mediaKinds?.includes(fmtType));
  const filteredStock=bridge.stock.filter(car=>!bridge.stockSearch || formatStock(car).toLowerCase().includes(bridge.stockSearch.toLowerCase()));
  const stockOptions=filteredStock.slice(0,80).map(car=>{const key=stockId(car);return `<label class="bridge-car-option"><input type="checkbox" name="cars" value="${escape(key)}" ${bridge.chosenStocks.includes(key)?'checked':''}/><span class="bridge-car-copy"><strong>${escape(car.car_name || '-')} | ${escape(car.statement || '-')} | ${escape(car.model_year || '-')}</strong><small>اللون الخارجي: ${escape(car.exterior_color || '-')} | اللون الداخلي: ${escape(car.interior_color || '-')}</small></span></label>`;}).join('');
  const remoteTask=assets[0]?.marketingTaskId ? bridge.remoteTasks[assets[0].marketingTaskId] : null;
  const pickerStatus=carsConfirmed?`<p class="p-help">السيارات المحددة للتكليف: ${escape(confirmedCars.map(formatStock).join(' ; ')||'لا تحتاج سيارة')}.</p>`:'';
  const pendingDraft=assets[0]?.integrationDraft||null;
  const lockDraft=Boolean(requestPending&&pendingDraft);
  const defaultDue=pendingDraft?.dueOn||assets[0]?.dueDate||nowInRiyadh();
  const assigneeValue=pendingDraft?`${pendingDraft.assigneeId}|${pendingDraft.departmentId}`:bridge.assignee;
  const typeValue=pendingDraft?.typeId||bridge.taskTypeId;
  const selectedFormats=pendingDraft?.formatIds||bridge.formatIds;
  return `<div class="page-header"><div><div class="page-eyebrow">الربط التنفيذي الآمن</div><h1 class="page-title">تحويل الفكرة إلى تاسك</h1><p class="page-description">بعد مراجعة الفكرة واعتمادها، اختر السيارات والمنفذ وتاريخ التسليم، ثم أنشئ التاسك في سيستم التسويق.</p></div><div class="p-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>${bridge.loading?'جارٍ التحميل...':'تحديث الاستوك والمنفذين'}</button></div></div>
    ${bridge.error?`<div class="notice">${escape(bridge.error)}</div>`:''}
    <div class="mini-grid"><div class="card mini-card"><div class="label">السيارات بدون تكرار</div><div class="value">${bridge.stock.length}</div></div><div class="card mini-card"><div class="label">المنفذون المتاحون</div><div class="value">${bridge.executors.length}</div></div><div class="card mini-card"><div class="label">مقاسات المطلوب</div><div class="value">${bridge.formats.length}</div></div></div>
    <div class="bridge-workflow"><span class="${reviewed?'is-done':''}">01 <b>اعتماد الفكرة</b></span><span class="${selectionCurrent?'is-done':''}">02 <b>تأكيد السيارات</b></span><span class="${linked?'is-done':''}">03 <b>المنفذ والتسليم والتكليف</b></span></div>
    ${!plan?'<div class="notice">استورد خطة المحتوى أولاً قبل ربط التكليفات.</div>':`<div class="p-two-columns bridge-v15-columns"><section class="card panel"><div class="page-eyebrow">المرحلة 01 + 02</div><h2>الفكرة والسيارات المرتبطة</h2>
      <label class="bridge-idea-label">الفكرة<select id="bridge-idea"><option value="">اختر الفكرة</option>${allIdeas.map(row=>opt(row.code,`${row.code} | ${row.title}`,bridge.ideaCode)).join('')}</select></label>
      ${idea?`<div class="bridge-idea-snapshot"><span>نوع المطلوب: <b>${fmtType==='video'?'فيديو':'صورة'}</b></span><span>حالة الفكرة: <strong>${escape(reviewStatusFor(plan,idea.code))}</strong></span><span>عدد مكونات الفكرة: <b>${codes.length}</b></span></div>
        ${!reviewed?`<div class="notice warning">هذه الفكرة غير معتمدة بعد، لذلك التكليف مقفل. افتح البريف وراجعها أولًا.</div><button class="btn btn-primary" type="button" data-action="open-asset" data-id="${escape(idea.code)}">فتح مراجعة الفكرة</button>`:''}
        ${linked?`<div class="notice">تم ربطها بتاسك: ${escape(assets[0]?.marketingTaskNo || assets[0]?.marketingTaskId || '')}. لن يتم إرسال تكليف مكرر. لتغيير المنفذ أو الموعد بعد الربط استخدم سيستم التسويق نفسه.</div><button class="btn" data-action="bridge-check-task" type="button">تحديث حالة التكليف من التسويق</button>${remoteTask?`<div class="bridge-status"><strong>الحالة: ${escape(remoteTask.task?.status || '')}</strong>${(remoteTask.items||[]).map(row=>`<div>${escape(row.idea_name)} — ${escape(row.status)} — ${escape(row.due_on)}</div>`).join('')}</div>`:''}`:''}
        ${reviewed&&!linked?`<form id="bridge-approval" class="p-edit-form bridge-form"><label>نوع اختيار السيارات<select name="carMode" id="bridge-mode" ${requestPending?'disabled':''}>${opt('none','الفكرة لا تحتاج سيارة محددة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
        ${bridge.mode!=='none'?`<label>بحث في الاستوك<input id="bridge-stock-search" placeholder="السيارة أو البيان أو الموديل أو اللون" value="${escape(bridge.stockSearch)}"/></label><button class="btn" type="button" data-action="bridge-stock-filter">بحث</button>
          <div class="bridge-stock-summary">السيارات المحددة: <strong>${bridge.chosenStocks.length}</strong> | نتائج البحث: <strong>${filteredStock.length}</strong>${filteredStock.length>80?' | تعرض أول 80 نتيجة، استخدم البحث للتحديد.':''}</div><div class="bridge-car-list" id="bridge-cars">${stockOptions||'<p class="p-help">لا توجد نتائج مطابقة.</p>'}</div>`:'<p class="p-help">لا يلزم اختيار سيارة لهذه الفكرة.</p>'}
        ${requestPending?'<div class="notice">اختيار السيارات مقفل مؤقتًا لحماية طلب تاسك سابق من التكرار.</div>':''}${pickerStatus}<button class="btn btn-primary" type="submit" ${bridge.busy||requestPending?'disabled':''}>${carsConfirmed?'حفظ اختيار السيارات':'تأكيد السيارات المرتبطة بالفكرة'}</button></form>`:''}`:''}
      </section><section class="card panel"><div class="page-eyebrow">المرحلة 03</div><h2>المنفذ والتسليم وإنشاء التاسك</h2>
       ${idea&&reviewed&&!linked?`<form id="bridge-assign" class="p-edit-form bridge-form"><p class="p-help">التكليف لن يُنشأ إلا عند الضغط على زر الإنشاء. اختيار السيارات واعتماد الفكرة شرطان أساسيان.</p>
       <label>نوع التاسك<select name="taskTypeId" required ${lockDraft?'disabled':''}><option value="">اختر نوع التاسك</option>${bridge.taskTypes.map(t=>opt(t.id,t.name,typeValue)).join('')}</select></label>
       <label>المنفذ في سيستم التسويق<select name="assignee" required ${lockDraft?'disabled':''}><option value="">اختر المنفذ</option>${bridge.executors.map(user=>opt(`${user.user_id}|${user.department_id}`,`${user.full_name} - ${user.department_name}`,assigneeValue)).join('')}</select></label>
       <label>تاريخ التسليم<input type="date" name="dueOn" required value="${escape(defaultDue)}" ${lockDraft?'readonly':`min="${nowInRiyadh()}"`}/></label>
       <fieldset class="bridge-formats"><legend>مقاسات المطلوب</legend>${candidates.map(format=>`<label class="p-check"><input type="checkbox" name="formatIds" value="${escape(format.id)}" ${selectedFormats.includes(format.id)?'checked':''} ${lockDraft?'disabled':''}/>${escape(format.platform_name)} - ${escape(format.name)} (${escape(format.width||'?')}x${escape(format.height||'?')})</label>`).join('')||'لا توجد مقاسات مناسبة'}</fieldset>
       <div class="notice ${selectionCurrent?'good':''}">${requestPending?'يوجد طلب محفوظ. اضغط استكمال التكليف لاسترجاع نفس التاسك دون إنشاء مكرر.':selectionCurrent?'الفكرة والسيارات معتمدتان. راجع المنفذ والتسليم ثم أنشئ التاسك.':'اعتمد الفكرة وثبّت اختيار السيارات أولًا.'}</div>
       <button class="btn btn-primary bridge-submit" type="submit" ${!selectionCurrent||bridge.busy?'disabled':''}>${requestPending?'استكمال طلب التكليف السابق':'إنشاء تاسك في سيستم التسويق'}</button>
       </form>`:linked?`<div class="notice good">التكليف أُنشئ وارتبط بالفكرة. لا يمكن إنشاؤه مرة ثانية.</div>`:idea?'<div class="notice warning">اعتمد الفكرة أولًا من مراجعة البريف لفتح اختيار المنفذ وتاريخ التسليم.</div>':'<p class="p-help">اختر فكرة معتمدة لتجهيز تكليفها في سيستم التسويق.</p>'}</section></div>`}
    <section class="card panel" style="margin-top:15px"><h3>ضوابط الربط</h3><p>القراءة محدودة بالاستوك والمنفذين وإعدادات التاسك. لا يسمح الربط إلا بإنشاء تكليف جديد، وتبقى المفاتيح على سيرفر Vercel.</p></section>`;
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
  const {idea,assets,cars,approved,carMode}=currentApproval(state);
  if(!idea || !ideaIsApproved(state.plan,idea.code) || !approved || assets.some(asset=>asset.marketingTaskId) || state.bridge.mode!==carMode ||
    JSON.stringify([...state.bridge.chosenStocks].sort())!==JSON.stringify(cars.map(stockId).sort()))throw Error('Approve the current car selection before creating the task');
  const existingDraft=assets[0].integrationDraft;
  const taskTypeId=existingDraft?.typeId||form.elements.namedItem('taskTypeId')?.value||'';
  const assigned=existingDraft?[existingDraft.assigneeId,existingDraft.departmentId]:String(form.elements.namedItem('assignee')?.value||'').split('|');
  const selectedFormats=existingDraft?.formatIds||[...form.querySelectorAll('input[name="formatIds"]:checked')].map(input=>input.value);
  const dueOn=existingDraft?.dueOn||String(form.elements.namedItem('dueOn')?.value||'');
  if(!validISODate(dueOn)||(!existingDraft&&dueOn<nowInRiyadh()))throw Error('حدد تاريخ تسليم صحيحًا لا يسبق اليوم');
  if(!state.bridge.taskTypes.some(type=>type.id===taskTypeId) || !state.bridge.executors.some(row=>row.user_id===assigned[0]&&row.department_id===assigned[1]) || !selectedFormats.length || selectedFormats.some(id=>!state.bridge.formats.some(f=>f.id===id && f.mediaKinds?.includes(imageOrVideo(idea)))))throw Error('اختر نوع التاسك ومنفذًا مؤهلًا ومقاسًا مناسبًا للمطلوب');
  const people=state.bridge.executors.find(row=>row.user_id===assigned[0]&&row.department_id===assigned[1]);
  let requestKey=assets[0].integrationRequestKey;
  if(!requestKey || !existingDraft){
    if(!requestKey)requestKey=crypto.randomUUID();
    const draft={typeId:taskTypeId,assigneeId:assigned[0],departmentId:assigned[1],formatIds:selectedFormats,dueOn};
    await updateManyAssets(assets.map(a=>a.code),{integrationRequestKey:requestKey,integrationDraft:draft,dueDate:dueOn});
    for(const asset of assets)Object.assign(asset,{integrationRequestKey:requestKey,integrationDraft:draft,dueDate:dueOn});
  }
  const items=await Promise.all(assets.map(async asset=>{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${requestKey}:${asset.code}`));
    const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
    const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
    const clientKey=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
    const brief=toBriefText(state.plan,asset.code).replace(/^\u0627\u0644\u0645\u0646\u0641\u0630:.*$/m,`\u0627\u0644\u0645\u0646\u0641\u0630: ${people.full_name}`);
    const stockText=cars.length?'\n\nSelected cars:\n'+cars.map(formatStock).join('\n'):'';
    return {clientKey,departmentId:assigned[1],assigneeId:assigned[0],mediaKind:imageOrVideo(asset),ideaName:asset.title,
      idea:(brief+stockText).slice(0,20000),explanation:`Strategy idea ${asset.code}; vehicles approved: ${cars.map(formatStock).join(' ; ')}`,
      dueOn,formatIds:selectedFormats};
  }));
  const data=await fetchBridge('assignments',{body:{requestKey,typeId:taskTypeId,name:`MZJ / ${idea.code} / ${idea.title}`.slice(0,250),source:{planId:PLAN_ID,ideaCodes:assets.map(a=>a.code)},items}});
  // If Firestore fails after creation, the request key is preserved, so retry
  // returns the same task instead of generating a duplicate.
  const links=assets.map((asset,index)=>({code:asset.code,taskId:data.id,taskNo:data.taskNo,
    itemId:data.items.find(item=>item.client_key===items[index].clientKey)?.id||'',executorName:people.full_name}));
  if(links.some(link=>!link.itemId))throw Error('Marketing task returned incomplete item links; retry the same assignment');
  await linkMarketingTask(links);
  for(const [index,asset] of assets.entries())Object.assign(asset,{marketingTaskId:data.id,marketingTaskNo:data.taskNo,
    marketingItemId:links[index].itemId,marketingExecutorName:people.full_name});
  return data;
}

export async function checkBridgeTask(state){
  const item=currentApproval(state).assets.find(row=>row.marketingTaskId);
  if(!item)throw Error('No linked Marketing task for this idea');
  const data=await fetchBridge('assignments',{taskId:item.marketingTaskId});
  state.bridge.remoteTasks[item.marketingTaskId]=data;
  return data;
}
