import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, toBriefText, ideaIsApproved, reviewStatusFor, nowInRiyadh } from './planner.js';
import { PLAN_ID, saveStrategyTaskRun, finishStrategyTaskRun } from './plan-firebase.js';
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
  carSelections:{},assignments:[{role:'production',assignee:'',dueOn:nowInRiyadh()}],
  remoteTasks:{},busy:false,lastCreatedTask:null,focusAfterSave:''};
}
export function selectBridgeCategory(state, category) {
 if(category&&!CAMPAIGN_CATEGORIES.includes(category))throw Error('تصنيف غير معتمد');
 Object.assign(state.bridge,{category,selectedCodes:[],ideaCode:'',mode:'single',chosenStocks:[],stockSearch:'',error:''});
}
export function toggleBridgeIdea(state,code,checked) {
 const bridge=state.bridge,idea=getIdea(state.plan,code);
 if(!eligible(idea)||!ideaIsApproved(state.plan,code))throw Error('الفكرة غير معتمدة أو غير متاحة');
 if(checked&&bridge.category&&bridge.category!==idea.marketingCategory)
   throw Error('لا يمكن اختيار أكثر من تصنيف داخل تاسك واحد');
 if(checked&&!bridge.category)bridge.category=idea.marketingCategory;
 if(checked&&selectionCodes(bridge).length>=30)throw Error('الحد الأقصى 30 فكرة');
 bridge.selectedCodes=checked?[...selectionCodes(bridge).filter(x=>x!==code),code]:selectionCodes(bridge).filter(x=>x!==code);
 if(!bridge.selectedCodes.includes(bridge.ideaCode))selectBridgeIdea(state,bridge.selectedCodes[0]||'',false);
}
export function selectBridgeIdea(state,code,add=true){
 const idea=getIdea(state.plan,code),bridge=state.bridge;
 if(idea&&!eligible(idea))throw Error('الفكرة غير متاحة');
 if(idea&&bridge.category!==idea.marketingCategory)Object.assign(bridge,{category:idea.marketingCategory,selectedCodes:[]});
 if(idea&&add&&!bridge.selectedCodes.includes(code))bridge.selectedCodes.push(code);
 bridge.ideaCode=code||'';
 const selection=bridge.carSelections[code]||{mode:'single',cars:[],confirmed:false};
 bridge.mode=selection.mode;bridge.chosenStocks=[...selection.cars];
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
  const confirmed=Boolean(bridge.carSelections[current?.code]?.confirmed);
  const pending=false;
  const savedMode=bridge.carSelections[current?.code]?.mode||'single';
  const savedCars=[...(bridge.carSelections[current?.code]?.cars||[])].sort();
  const selectedCars=[...bridge.chosenStocks].sort();
  const selectionCurrent=confirmed&&savedMode===bridge.mode&&JSON.stringify(savedCars)===JSON.stringify(selectedCars);
  const ready=chosen.length>0&&chosen.every(row=>bridge.carSelections[row.code]?.confirmed);
  const remaining=chosen.filter(row=>!bridge.carSelections[row.code]?.confirmed);
  const pendingDraft=null,lockDraft=false;
  const typePref=bridge.category.startsWith('تعريفي')?'تعريف':bridge.category.startsWith('بيعي')?'بيع':'';
  const matchingTypes=bridge.taskTypes.filter(t=>String(t.name||'').includes(typePref));
  const taskTypeDefault=pendingDraft?.typeId||bridge.taskTypeId||(matchingTypes.length===1?matchingTypes[0].id:'');
  const proposedExecutor=bridge.assignee;
  const table=visible.map((row,index)=>{
    const rowAssets=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
    const linkedCount=(plan.taskRuns||[]).filter(run=>run.status==='linked'&&run.draft?.ideaCodes?.includes(row.code)).length+
      (rowAssets.some(a=>a.marketingTaskId)||historicalLinkedTask(plan,row)?1:0);
    const linked=false;
    const checked=selectionCodes(bridge).includes(row.code);
    const lockedByCategory=Boolean(bridge.category&&row.marketingCategory!==bridge.category);
    const isConfirmed=Boolean(bridge.carSelections[row.code]?.confirmed);
    const media=row.kind==='video'?'فيديو':'صور · '+Math.max(1,Number(row.imageCount)||row.imageSlides?.length||1);
    const executor=row.marketingExecutorName||row.executor||'لم يُحدد';
    const disabled=linked||lockedByCategory;
    const stateText=(isConfirmed?'السيارات مؤكدة':'بانتظار تحديد السيارات')+(linkedCount?' · تم استخدامها '+linkedCount+' مرة':'');
    return `<tr class="${checked?'bridge-idea-selected':''}">
     <td class="bridge-idea-check"><label aria-label="اختيار ${escape(row.title)}"><input type="checkbox" name="bridge-select-idea" value="${escape(row.code)}" ${checked?'checked':''} ${disabled?'disabled':''}/></label></td>
     <td class="bridge-idea-name"><strong>${escape(row.title)}</strong><small>فكرة ${index+1}</small></td>
     <td><span class="bridge-category-chip">${escape(row.marketingCategory)}</span></td>
     <td>${escape(executor)}</td>
     <td>${escape(media)}</td>
     <td><span class="bridge-status-chip ${linked?'is-linked':isConfirmed?'is-done':''}">${escape(stateText)}</span></td>
     <td><button type="button" class="btn p-small" data-action="bridge-edit-cars" data-id="${escape(row.code)}"
       ${!checked||linked?'disabled':''}>${isConfirmed?'تعديل السيارات':'اختيار السيارات'}</button></td>
    </tr>`;
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
  return `<div class="page-header"><div><div class="page-eyebrow">التكليفات الإبداعية</div>
   <h1 class="page-title">إنشاء تاسك من الأفكار المعتمدة</h1>
   <p class="page-description">حدد الأفكار من الجدول، ثم اختر سيارات كل فكرة، وأكمل تفاصيل التاسك.</p></div>
   <div class="p-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>تحديث المنفذين والمقاسات والاستوك</button></div></div>
   ${bridge.error?`<div class="notice warning" id="bridge-error" role="alert">${escape(bridge.error)}</div>`:''}
   ${!plan?'<div class="notice warning">حمّل خطة المحتوى أولًا.</div>':`
   <section class="card panel bridge-table-panel" id="bridge-approved-ideas">
     <div class="bridge-table-heading"><div><h2>01 — الأفكار المعتمدة</h2><p class="p-help">كل الأفكار المعتمدة ظاهرة. التصفية اختيارية، ولا يمكن جمع تصنيفين في نفس التاسك.</p></div><span class="bridge-summary-count">${all.length} فكرة معتمدة</span></div>
     <div class="bridge-category-tabs"><button type="button" class="bridge-category-tab ${!bridge.category?'active':''}" data-action="bridge-pick-category" data-category="" aria-pressed="${!bridge.category?'true':'false'}">كل التصنيفات <span>${all.length}</span></button>${choices}</div>
     <div class="bridge-table-controls"><label>بحث باسم الفكرة أو المنفذ<input id="bridge-idea-search" type="search" value="${escape(bridge.ideaSearch||'')}" placeholder="ابحث عن فكرة أو منفذ"/></label>
       <button type="button" class="btn" data-action="bridge-filter-ideas">بحث</button></div>
     <div class="bridge-table-scroll"><table class="bridge-ideas-table"><thead><tr><th>تحديد</th><th>الفكرة المعتمدة</th><th>التصنيف</th><th>المنفذ المقترح</th><th>المحتوى</th><th>حالة السيارات</th><th>إجراء</th></tr></thead><tbody>${table||'<tr><td colspan="7" class="bridge-table-empty">لا توجد أفكار معتمدة مطابقة للبحث والتصنيف.</td></tr>'}</tbody></table></div>
     ${chosen.length?`<div class="bridge-selected-summary"><strong>تم تحديد ${chosen.length} فكرة</strong>
       <span>التصنيف: ${escape(bridge.category)}</span><span>المتبقي لتأكيد السيارات: ${pendingConfirms}</span></div>`:''}
   </section>
   ${chosen.length?`
   <section class="card panel bridge-car-workspace" id="bridge-cars-area">
     <div class="bridge-table-heading"><div><h2>02 — تأكيد السيارات لكل فكرة</h2>
       <p class="p-help">افتح «اختيار السيارات» أمام أي فكرة من الجدول، أو اخترها من القائمة أدناه، ثم احفظ اختياراتها.</p></div>
       <span class="bridge-summary-count">${chosen.length-pendingConfirms} / ${chosen.length} مؤكد</span></div>
     <div class="bridge-chosen-strip">${chosen.map(row=>{
       const done=Boolean(bridge.carSelections[row.code]?.confirmed);
       return `<button type="button" data-action="bridge-edit-cars" data-id="${escape(row.code)}" class="bridge-chosen-chip ${current?.code===row.code?'active':''}">
         ${escape(row.title)}<small>${done?'تم تأكيد السيارات':'يحتاج تأكيد'}</small></button>`;
     }).join('')}</div>
     ${current?`<div class="bridge-car-active"><h3>${escape(current.title)}</h3>
       <p class="p-help">لكل فكرة سياراتها الخاصة. لن تتغير اختيارات الأفكار الأخرى.</p>
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
     ${remaining.length?`<div class="notice warning">الأفكار التي تحتاج تأكيد السيارات: ${remaining.map(row=>escape(row.title)).join('، ')}</div>`:
       '<div class="notice good">تم تأكيد اختيارات كل الأفكار. يمكنك إكمال إنشاء التاسك.</div>'}
   </section>
   <section class="card panel bridge-assignment-panel" id="bridge-assignment-area"><h2>03 — تفاصيل التاسك وإنشاؤه</h2>
     <p class="p-help">يمكنك اختيار منفذ أو أكثر، ولكل منفذ موعد تسليم مستقل. التصوير يسلّم رابط Google Drive.</p>
     ${nameError?`<div class="notice warning">${escape(nameError)}</div>`:''}
     ${taskName?`<div class="bridge-task-title-preview"><small>الاسم النهائي للتاسك</small><strong>${escape(taskName)}</strong></div>`:''}
     <form id="bridge-assign" class="p-edit-form bridge-form">
       <div class="bridge-assign-fields">
         <label>نوع التاسك في التسويق<select name="taskTypeId" required>
           <option value="">اختر النوع</option>${bridge.taskTypes.map(t=>opt(t.id,t.name,taskTypeDefault)).join('')}</select></label>
</div>
       <div class="bridge-assignee-list"><div class="bridge-assignee-list-head"><strong>المنفذون ومواعيد التسليم</strong><button class="btn" type="button" data-action="bridge-add-executor">إضافة منفذ</button></div>
       ${bridge.assignments.map((assignment,index)=>`<div class="bridge-executor-row">
         <label>طبيعة المطلوب<select name="executor-role-${index}" ${assignment.role==='shooting'&&!imageKinds.includes('video')?'disabled':''}>
           ${opt('production','المونتاج / التصميم والملفات النهائية',assignment.role)}
           ${imageKinds.includes('video')?opt('shooting','التصوير وتسليم رابط Google Drive',assignment.role):''}
         </select></label>
         <label>المنفذ<select name="executor-person-${index}" required><option value="">اختر الاسم</option>
           ${bridge.executors.map(row=>opt(row.user_id+'|'+row.department_id,row.full_name,assignment.assignee)).join('')}</select></label>
         <label>تاريخ تسليم المنفذ<input type="date" name="executor-due-${index}" min="${nowInRiyadh()}" value="${escape(assignment.dueOn)}" required/></label>
         ${index>0?'<button class="btn" type="button" data-action="bridge-remove-executor" data-index="'+index+'">حذف</button>':''}
       </div>`).join('')}
       </div><div class="bridge-assign-fields"></div>
       ${imageKinds.includes('image')?formats('image'):''}${imageKinds.includes('video')?formats('video'):''}
       <div class="notice ${ready?'good':'warning'}">${ready?'كل الأفكار مؤكدة وجاهزة. اختر المنفذ والمقاسات لإنشاء التاسك.':
         'لا يمكن إنشاء التاسك حتى يتم تأكيد سيارات كل فكرة.'}</div>
       <button type="submit" class="btn btn-primary bridge-submit" ${!ready||!!nameError||bridge.busy?'disabled':''}>
         ${false?
           'استكمال إنشاء التاسك المحفوظ':'إنشاء تاسك واحد يحتوي '+chosen.length+' فكرة'}</button>
     </form>
   </section>`:''}
   `}
   <p class="bridge-footnote">يتم إنشاء تاسك واحد فقط في التسويق عند الضغط على زر الإنشاء. لن يتم تعديل التاسكات السابقة.</p>`;
}
export function currentApproval(state){
 const idea=getIdea(state.plan,state.bridge.ideaCode);
 const choice=state.bridge.carSelections[idea?.code]||{mode:'single',cars:[],confirmed:false};
 return {idea,assets:idea?taskCodes(state.plan,idea.code).map(code=>state.plan.assets.find(a=>a.code===code)).filter(Boolean):[],
   carMode:choice.mode,cars:choice.cars.map(id=>state.bridge.stock.find(car=>stockId(car)===id)).filter(Boolean),approved:choice.confirmed};
}
export async function approveBridgeIdea(state,mode,selectedCars){
 const {idea}=currentApproval(state);
 if(!idea||!ideaIsApproved(state.plan,idea.code))throw Error('اعتمد الفكرة أولًا');
 if(!['none','single','compare'].includes(mode)||mode==='single'&&!selectedCars.length||
   mode==='compare'&&selectedCars.length<2||mode==='none'&&selectedCars.length)
   throw Error('راجع السيارات المختارة ونوع المحتوى');
 if(new Set(selectedCars).size!==selectedCars.length||
   selectedCars.some(id=>!state.bridge.stock.some(car=>stockId(car)===id)))
   throw Error('يوجد اختيار سيارة غير صالح');
 // Car selection belongs to this NEW task run, never to the master idea.
 state.bridge.carSelections[idea.code]={mode,cars:[...selectedCars],confirmed:true};
 return selectedCars;
}
const briefLead=(idea,cars)=>'بريف إبداعي: '+idea.title+
 (cars.length?'\nالسيارات المعتمدة:\n'+cars.map(formatStock).join('\n'):'\nلا توجد سيارة محددة لهذه الفكرة');
const briefExplanation=idea=>['الجمهور والهدف:',idea.audienceAndGoal||'','الرسالة:',idea.message||''].join('\n');
export async function assignBridgeIdea(state,form){
 const plan=state.plan,bridge=state.bridge,ideas=selectedIdeas(state);
 if(!ideas.length||ideas.length>30||ideas.some(x=>!eligible(x)||!ideaIsApproved(plan,x.code)||x.marketingCategory!==bridge.category))
   throw Error('حدد أفكارًا معتمدة من نفس التصنيف');
 if(ideas.some(x=>!bridge.carSelections[x.code]?.confirmed))throw Error('أكد السيارات لكل فكرة');
 const name=groupedName(bridge.category,ideas),typeId=String(form.elements.namedItem('taskTypeId')?.value||'');
 if(!bridge.taskTypes.some(x=>x.id===typeId))throw Error('اختر نوع التاسك');
 const executors=bridge.assignments.map((_,index)=>{
   const role=String(form.elements.namedItem('executor-role-'+index)?.value||'');
   const identity=String(form.elements.namedItem('executor-person-'+index)?.value||'').split('|');
   const dueOn=String(form.elements.namedItem('executor-due-'+index)?.value||'');
   const person=bridge.executors.find(x=>x.user_id===identity[0]&&x.department_id===identity[1]);
   if(!person||!['production','shooting'].includes(role)||!validISODate(dueOn)||dueOn<nowInRiyadh())
     throw Error('اختر اسم المنفذ ونوع المطلوب وتاريخ تسليمه الصحيح');
   if(role==='shooting'&&!ideas.some(x=>imageOrVideo(x)==='video'))throw Error('التصوير خاص بأفكار الفيديو');
   return {role,person,dueOn};
 });
 if(!executors.some(x=>x.role==='production'))throw Error('أضف منفذًا للملفات النهائية');
 if(executors.filter(x=>x.role==='shooting').length>1)throw Error('حدد مصورًا واحدًا لكل تاسك');
 const unique=new Set(executors.map(x=>x.person.user_id+'|'+x.role));
 if(unique.size!==executors.length)throw Error('لا تكرر نفس المنفذ لنفس نوع المطلوب');
 const formatsByKind=Object.fromEntries(['image','video'].map(kind=>[kind,[...form.querySelectorAll('input[name="format_'+kind+'"]:checked')].map(input=>input.value)]));
 for(const kind of new Set(ideas.map(imageOrVideo)))if(!formatsByKind[kind].length||
   formatsByKind[kind].some(id=>!bridge.formats.some(f=>f.id===id&&f.mediaKinds?.includes(kind))))
   throw Error('حدد مقاسات '+(kind==='image'?'الصور':'الفيديو'));
 const draft={ideaCodes:ideas.map(x=>x.code),typeId,name,executors:executors.map(x=>({
   role:x.role,assigneeId:x.person.user_id,departmentId:x.person.department_id,dueOn:x.dueOn})),
   formatIdsByKind,carSelections:Object.fromEntries(ideas.map(x=>[x.code,bridge.carSelections[x.code]]))};
 let pending=(plan.taskRuns||[]).find(x=>x.status==='pending'&&JSON.stringify(x.draft)===JSON.stringify(draft));
 const requestKey=pending?.id||crypto.randomUUID();
 await saveStrategyTaskRun(requestKey,{draft});
 if(!pending){pending={id:requestKey,status:'pending',draft};plan.taskRuns=[...(plan.taskRuns||[]),pending];}
 const items=[],sourceCodes=[];
 for(const idea of ideas){
   const cars=bridge.carSelections[idea.code].cars.map(id=>bridge.stock.find(car=>stockId(car)===id)).filter(Boolean);
   for(const assignment of executors){
     if(assignment.role==='shooting'&&imageOrVideo(idea)!=='video')continue;
     const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(requestKey+':'+idea.code+':'+assignment.role+':'+assignment.person.user_id));
     const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
     const h=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
     const clientKey=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
     const shooting=assignment.role==='shooting';
     const creativeBrief=toBriefText(plan,idea.code)+'\n\nالسيارات المعتمدة:\n'+(cars.map(formatStock).join('\n')||'لا توجد سيارة محددة');
     const brief=briefLead(idea,cars);
     if(creativeBrief.length>50000)throw Error('البريف الإبداعي أطول من الحد المسموح: '+idea.title);
     items.push({clientKey,departmentId:assignment.person.department_id,assigneeId:assignment.person.user_id,
       mediaKind:imageOrVideo(idea),deliveryKind:shooting?'shooting_link':'final_files',
       ideaName:shooting?'تصوير مشاهد: '+idea.title:(imageOrVideo(idea)==='video'?'فيديو: ':'صورة: ')+idea.title,
       idea:brief,explanation:briefExplanation(idea),creativeBrief,
       dueOn:assignment.dueOn,formatIds:shooting?[]:formatsByKind[imageOrVideo(idea)]});
     sourceCodes.push(idea.code);
   }
 }
 const result=await fetchBridge('assignments',{body:{requestKey,typeId,name,
   source:{planId:PLAN_ID,ideaCodes:sourceCodes},items}});
 await finishStrategyTaskRun(requestKey,result);
 Object.assign(pending,{status:'linked',taskId:result.id,taskNo:result.taskNo});
 return result;
}
export async function checkBridgeTask(state){
  const item=currentApproval(state).assets.find(row=>row.marketingTaskId);
  if(!item)throw Error('No linked Marketing task for this idea');
  const data=await fetchBridge('assignments',{taskId:item.marketingTaskId});
  state.bridge.remoteTasks[item.marketingTaskId]=data;
  return data;
}
