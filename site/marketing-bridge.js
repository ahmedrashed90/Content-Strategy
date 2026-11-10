import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, toBriefText } from './planner.js';
import { PLAN_ID, updateManyAssets, linkMarketingTask } from './plan-firebase.js';

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
  const approved=assets.length>0 && assets.every(row=>Boolean(row.creativeApprovedAt));
  const allSelections=assets.length>0 && assets.every(row=>JSON.stringify(row.approvedVehicles||[])===JSON.stringify(assets[0]?.approvedVehicles||[]));
  const confirmedCars=allSelections?assets[0]?.approvedVehicles||[]:[];
  const confirmedMode=allSelections?assets[0]?.approvedCarMode||'single':'single';
  const approvedCarsIds=confirmedCars.map(stockId).sort();
  const activeCarsIds=[...bridge.chosenStocks].sort();
  const selectionCurrent=approved && bridge.mode===confirmedMode && JSON.stringify(approvedCarsIds)===JSON.stringify(activeCarsIds);
  const requestPending=assets.some(row=>Boolean(row.integrationRequestKey) && !row.marketingTaskId);
  const fmtType=imageOrVideo(idea);
  const candidates=bridge.formats.filter(f=>f.mediaKinds?.includes(fmtType));
  const filteredStock=bridge.stock.filter(car=>!bridge.stockSearch || formatStock(car).toLowerCase().includes(bridge.stockSearch.toLowerCase()));
  const stockOptions=filteredStock.slice(0,80).map(car=>{const key=stockId(car);return `<label class="bridge-car-option"><input type="checkbox" name="cars" value="${escape(key)}" ${bridge.chosenStocks.includes(key)?'checked':''}/><span class="bridge-car-copy"><strong>${escape(car.car_name || '-')} | ${escape(car.statement || '-')} | ${escape(car.model_year || '-')}</strong><small>اللون الخارجي: ${escape(car.exterior_color || '-')} | اللون الداخلي: ${escape(car.interior_color || '-')}</small></span></label>`;}).join('');
  const remoteTask=assets[0]?.marketingTaskId ? bridge.remoteTasks[assets[0].marketingTaskId] : null;
  const pickerStatus=approved?`<p class="p-help">السيارات المعتمدة: ${escape(confirmedCars.map(formatStock).join(' ; ')||'بدون سيارة')}.</p>`:'';
  return `<div class="page-header"><div><div class="page-eyebrow">MZJ / API</div><h1 class="page-title">ربط سيستم التسويق</h1><p class="page-description">قراءة الاستوك والمنفذين، وإنشاء تاسك فقط بعد اعتماد الفكرة.</p></div><div class="p-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>${bridge.loading?'جارٍ التحميل...':'تحديث الاستوك والمنفذين'}</button></div></div>
    ${bridge.error?`<div class="notice">${escape(bridge.error)}</div>`:''}
    <div class="mini-grid"><div class="card mini-card"><div class="label">السيارات بدون تكرار</div><div class="value">${bridge.stock.length}</div></div><div class="card mini-card"><div class="label">المنفذون المتاحون</div><div class="value">${bridge.executors.length}</div></div><div class="card mini-card"><div class="label">مقاسات المطلوب</div><div class="value">${bridge.formats.length}</div></div></div>
    ${!plan?'<div class="notice">استورد خطة المحتوى أولاً قبل ربط التكليفات.</div>':`<div class="p-two-columns"><section class="card panel"><h2>١. مراجعة الفكرة واختيار السيارات</h2>
      <label class="bridge-idea-label">الفكرة<select id="bridge-idea"><option value="">اختر الفكرة</option>${allIdeas.map(row=>opt(row.code,`${row.code} | ${row.title}`,bridge.ideaCode)).join('')}</select></label>
      ${idea?`<p class="p-help">نوع المطلوب: <b>${fmtType==='video'?'فيديو':'صورة'}</b> | ${codes.length} أصل إنتاجي | ${escape(assets[0]?.executor||'')}</p>
        ${linked?`<div class="notice">تم ربطها بتاسك: ${escape(assets[0]?.marketingTaskNo || assets[0]?.marketingTaskId || '')}. لن يتم إرسال تكليف مكرر. لتغيير المنفذ أو الموعد بعد الربط استخدم سيستم التسويق نفسه.</div><button class="btn" data-action="bridge-check-task" type="button">تحديث حالة التكليف من التسويق</button>${remoteTask?`<div class="bridge-status"><strong>الحالة: ${escape(remoteTask.task?.status || '')}</strong>${(remoteTask.items||[]).map(row=>`<div>${escape(row.idea_name)} — ${escape(row.status)} — ${escape(row.due_on)}</div>`).join('')}</div>`:''}`:''}
        <form id="bridge-approval" class="p-edit-form bridge-form"><label>نوع اختيار السيارات<select name="carMode" id="bridge-mode">${opt('none','لا تحتاج سيارة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
        ${bridge.mode!=='none'?`<label>بحث في الاستوك<input id="bridge-stock-search" placeholder="السيارة أو البيان أو الموديل أو اللون" value="${escape(bridge.stockSearch)}"/></label><button class="btn" type="button" data-action="bridge-stock-filter">بحث</button>
          <div class="bridge-stock-summary">السيارات المحددة: <strong>${bridge.chosenStocks.length}</strong> | نتائج البحث: <strong>${filteredStock.length}</strong>${filteredStock.length>80?' | تعرض أول 80 نتيجة، استخدم البحث للتحديد.':''}</div><div class="bridge-car-list" id="bridge-cars">${stockOptions||'<p class="p-help">لا توجد نتائج مطابقة.</p>'}</div>`:'<p class="p-help">لا يلزم اختيار سيارة لهذه الفكرة.</p>'}
        ${requestPending?'<div class="notice">يوجد طلب تكليف سابق لم يكتمل ربطه. أعد محاولة إنشاء التاسك بنفس المعرف لتجنب تكراره.</div>':''}${pickerStatus}<button class="btn btn-primary" type="submit" ${bridge.busy||linked||requestPending?'disabled':''}>${approved?'حفظ وإعادة اعتماد':'اعتماد الفكرة والسيارات'}</button></form>`:''}
      </section><section class="card panel"><h2>٢. إنشاء التكليف في سيستم التسويق</h2>
       ${idea?`<form id="bridge-assign" class="p-edit-form bridge-form"><p class="p-help">لن ينشأ التكليف إلا عند الضغط على زر الإنشاء بعد اعتماد الفكرة.</p>
       <label>نوع التاسك<select name="taskTypeId" required>${bridge.taskTypes.map(t=>opt(t.id,t.name,bridge.taskTypeId)).join('')}</select></label>
       <label>المنفذ<select name="assignee" required><option value="">اختر المنفذ</option>${bridge.executors.map(user=>opt(`${user.user_id}|${user.department_id}`,`${user.full_name} - ${user.department_name}`,bridge.assignee)).join('')}</select></label>
       <fieldset class="bridge-formats"><legend>مقاسات المطلوب</legend>${candidates.map(format=>`<label class="p-check"><input type="checkbox" name="formatIds" value="${escape(format.id)}" ${bridge.formatIds.includes(format.id)?'checked':''}/>${escape(format.platform_name)} - ${escape(format.name)} (${escape(format.width||'?')}x${escape(format.height||'?')})</label>`).join('')||'لا توجد مقاسات مناسبة'}</fieldset>
       <div class="notice">${approved?'تم اعتماد اختيار السيارات لهذه الفكرة.':'اعتمد الفكرة والسيارات قبل إنشاء التكليف.'}</div>
       <button class="btn btn-primary" type="submit" ${!selectionCurrent||linked||bridge.busy?'disabled':''}>إنشاء تاسك في سيستم التسويق</button>
       </form>`:'<p class="p-help">اختر الفكرة لتحديد تكليفها في سيستم التسويق.</p>'}</section></div>`}
    <section class="card panel" style="margin-top:15px"><h3>ضوابط الربط</h3><p>القراءة محدودة بالاستوك والمنفذين وإعدادات التاسك. لا يسمح الربط إلا بإنشاء تكليف جديد، وتبقى المفاتيح على سيرفر Vercel.</p></section>`;
}

export function currentApproval(state) {
  const idea=getIdea(state.plan,state.bridge.ideaCode);
  const assets=(idea?taskCodes(state.plan,idea.code):[]).map(code=>state.plan.assets.find(a=>a.code===code)).filter(Boolean);
  return { idea,assets,carMode:assets[0]?.approvedCarMode||'',cars:assets[0]?.approvedVehicles||[],approved:assets.length>0 && assets.every(a=>Boolean(a.creativeApprovedAt)) };
}
export async function approveBridgeIdea(state, mode, selectedCars) {
  const {idea,assets}=currentApproval(state);
  if(!idea || !assets.length || assets.some(a=>a.marketingTaskId || a.integrationRequestKey))throw Error('This idea is already linked or a pending assignment must be retried');
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
  if(!idea || !approved || assets.some(asset=>asset.marketingTaskId) || state.bridge.mode!==carMode ||
    JSON.stringify([...state.bridge.chosenStocks].sort())!==JSON.stringify(cars.map(stockId).sort()))throw Error('Approve the current car selection before creating the task');
  const taskTypeId=form.elements.namedItem('taskTypeId').value;
  const assigned=form.elements.namedItem('assignee').value.split('|');
  const selectedFormats=[...form.querySelectorAll('input[name="formatIds"]:checked')].map(input=>input.value);
  if(!state.bridge.taskTypes.some(type=>type.id===taskTypeId) || !state.bridge.executors.some(row=>row.user_id===assigned[0]&&row.department_id===assigned[1]) || !selectedFormats.length)throw Error('Select a task type, an eligible executor and at least one output format');
  const people=state.bridge.executors.find(row=>row.user_id===assigned[0]&&row.department_id===assigned[1]);
  let requestKey=assets[0].integrationRequestKey;
  if(!requestKey){
    requestKey=crypto.randomUUID();
    await updateManyAssets(assets.map(a=>a.code),{integrationRequestKey:requestKey});
    for(const asset of assets)asset.integrationRequestKey=requestKey;
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
      dueOn:asset.dueDate,formatIds:selectedFormats};
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
