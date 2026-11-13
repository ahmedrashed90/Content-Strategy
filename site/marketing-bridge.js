import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, ideaIsApproved, nowInRiyadh, toCreativeTreatmentText } from './planner.js';
import { PLAN_ID, updateManyAssets, linkMarketingTask } from './plan-firebase.js';
import { validISODate } from './idea-import.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stockFields = ['car_name','statement','model_year','exterior_color','interior_color'];
const formatStock = car => stockFields.map(key => String(car?.[key] || '').trim()).filter(Boolean).join(' | ');
const stockId = car => JSON.stringify(stockFields.map(key => String(car?.[key] || '').trim()));
// Search adapts to written car/model variants without changing the stock source or chosen cars.
export const normalizeStockSearch = value => String(value ?? '')
  .normalize('NFKC').toLocaleLowerCase().replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/[^\p{L}\p{N}]/gu, '');
export const filterStockCars = (cars,query) => {
  const term=normalizeStockSearch(query);
  const tokens=String(query||'').trim().split(/[\s,،|/+-]+/).map(normalizeStockSearch).filter(Boolean);
  return !term ? cars : cars.filter(car => {
    const haystack=normalizeStockSearch(formatStock(car));
    return haystack.includes(term) || tokens.every(token=>haystack.includes(token));
  });
};
export const renderStockOptions = bridge => filterStockCars(bridge.stock,bridge.stockSearch).slice(0,80).map(car=>{
  const key=stockId(car);
  return `<label class="bridge-car-option"><input type="checkbox" name="cars" value="${escape(key)}" ${bridge.chosenStocks.includes(key)?'checked':''}/>
    <span class="bridge-car-copy"><strong>${escape(car.car_name||'-')} | ${escape(car.statement||'-')} | ${escape(car.model_year||'-')}</strong>
    <small>الخارجي: ${escape(car.exterior_color||'-')} | الداخلي: ${escape(car.interior_color||'-')}</small></span></label>`;
}).join('');

const imageOrVideo = idea => idea?.kind === 'video' ? 'video' : 'image';
const opt = (value,label,current) => `<option value="${escape(value)}" ${String(value)===String(current)?'selected':''}>${escape(label)}</option>`;

export const CAMPAIGN_CATEGORIES = ['تعريفي - بالبراند','تعريفي - بالويب سايت','تعريفي - مواصفات السيارات','بيعي - قسط','بيعي - كاش'];
const eligible = idea => idea && !idea.retiredFromIdeaBank && !idea.requiresVerification && idea.sourceStatus!=='موقوف' && CAMPAIGN_CATEGORIES.includes(idea.marketingCategory);
const selectionCodes = bridge => [...new Set(bridge.selectedCodes||[])];
const ideaRows = plan => plan ? [...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))] : [];
const selectedIdeas = state => selectionCodes(state.bridge).map(code=>getIdea(state.plan,code)).filter(Boolean);
const defaultAssignment = () => ({assignee:'',dueOn:nowInRiyadh()});
/** Compare old shared-assignee drafts and new per-idea drafts by their data, not
 * JSON object insertion order. This preserves safe retries across schema versions. */
export function sameAssignmentDraft(saved,draft) {
  if(saved?.pending!==true || saved.typeId!==draft.typeId || saved.name!==draft.name ||
     JSON.stringify(saved.ideaCodes)!==JSON.stringify(draft.ideaCodes) ||
     (!saved.formatIdsByIdea && JSON.stringify(saved.formatIdsByKind)!==JSON.stringify(draft.formatIdsByKind)))return false;
  if(saved.formatIdsByIdea && draft.ideaCodes.some(code=>JSON.stringify(saved.formatIdsByIdea[code])!==JSON.stringify(draft.formatIdsByIdea[code])))return false;
  return draft.ideaCodes.every(code=>{
    const historical=saved.assignmentsByIdea?.[code] ?? saved.assignments;
    return Array.isArray(historical) && JSON.stringify(historical)===JSON.stringify(draft.assignmentsByIdea[code]);
  });
}
// Each approved idea owns its own executor/date rows, even in one grouped Marketing task.
export const assignmentsForIdea = (bridge,ideaCode,pendingDraft=null) =>
  pendingDraft?.assignmentsByIdea?.[ideaCode] ||
  (pendingDraft?.assignments ? pendingDraft.assignments : null) ||
  bridge.assignmentsByIdea?.[ideaCode] ||
  (bridge.selectedCodes?.length===1 ? bridge.assignments : null) || [defaultAssignment()];

const groupedName = (category,ideas) => {
 const name=category+' '+ideas.map(idea=>idea.title).join(' + ');
 if(name.length>250)throw Error('عنوان التاسك أطول من 250 حرفًا؛ اختر أفكارًا أقل أو أسماء أقصر، بدون قص العناوين.');
 return name;
};
export function newBridgeState() {
 return {stock:[],executors:[],taskTypes:[],formats:[],loading:false,error:'',
  category:'',selectedCodes:[],ideaCode:'',ideaSearch:'',mode:'single',chosenStocks:[],stockSearch:'',
  formatIdsByKind:{image:[],video:[]},formatIdsByIdea:{},taskTypeId:'',assignments:[defaultAssignment()],assignmentsByIdea:{},activeAssignmentIdeaCode:'',carSelectionsByIdea:{},carModesByIdea:{},
  remoteTasks:{},busy:false,lastCreatedTask:null,focusAfterSave:'',carsExpanded:true};
}
export function selectBridgeCategory(state, category) {
 if(category&&!CAMPAIGN_CATEGORIES.includes(category))throw Error('تصنيف غير معتمد');
 Object.assign(state.bridge,{category,selectedCodes:[],ideaCode:'',mode:'single',chosenStocks:[],stockSearch:'',assignmentsByIdea:{},activeAssignmentIdeaCode:'',formatIdsByIdea:{},carSelectionsByIdea:{},carModesByIdea:{},error:''});
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
   bridge.assignmentsByIdea=Object.fromEntries(bridge.selectedCodes.map(ideaCode=>[ideaCode,
     (stored.assignmentsByIdea?.[ideaCode] || stored.assignments || [defaultAssignment()]).map(row=>({...row}))]));
   bridge.formatIdsByIdea=stored.formatIdsByIdea||{};
 }else bridge.selectedCodes=checked?[...selectionCodes(bridge).filter(x=>x!==code),code]:selectionCodes(bridge).filter(x=>x!==code);
 if(!bridge.selectedCodes.includes(bridge.ideaCode)) selectBridgeIdea(state,bridge.selectedCodes[0]||'',false);
 else bridge.activeAssignmentIdeaCode=bridge.ideaCode;
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
     state.bridge.assignmentsByIdea=Object.fromEntries(state.bridge.selectedCodes.map(ideaCode=>[ideaCode,
       (first.integrationDraft.assignmentsByIdea?.[ideaCode] || first.integrationDraft.assignments || [defaultAssignment()]).map(row=>({...row}))]));
     state.bridge.formatIdsByIdea=first.integrationDraft.formatIdsByIdea||{};
   }
   else if(!state.bridge.selectedCodes.includes(code))state.bridge.selectedCodes.push(code);
 }
 if(state.bridge.ideaCode){
   state.bridge.carModesByIdea[state.bridge.ideaCode]=state.bridge.mode;
   state.bridge.carSelectionsByIdea[state.bridge.ideaCode]=[...state.bridge.chosenStocks];
 }
 state.bridge.ideaCode=code||'';
 state.bridge.activeAssignmentIdeaCode=code||'';
 state.bridge.mode=state.bridge.carModesByIdea[code]||first?.approvedCarMode||'single';
 state.bridge.chosenStocks=state.bridge.carSelectionsByIdea[code]||((first?.approvedVehicles||[]).map(stockId));
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
  const selected=selectedIdeas(state).filter(row=>eligible(row)&&row.marketingCategory===bridge.category);
  const q=String(bridge.ideaSearch||'').trim().toLocaleLowerCase();
  const visible=all.filter(row=>(!bridge.category||row.marketingCategory===bridge.category)&&
    (!q||[row.code,row.title,row.marketingCategory,row.executor,row.marketingExecutorName].join(' ').toLocaleLowerCase().includes(q)));
  const current=selected.find(row=>row.code===bridge.ideaCode)||null;
  const activeAssets=current?taskCodes(plan,current.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean):[];
  const pendingDraft=activeAssets.find(asset=>asset.integrationDraft?.pending)?.integrationDraft||null;
  const locked=Boolean(pendingDraft);
  const confirmed=activeAssets.length>0&&activeAssets.every(asset=>Boolean(asset.creativeApprovedAt));
  const pending=activeAssets.some(asset=>asset.integrationDraft?.pending===true);
  const savedMode=activeAssets[0]?.approvedCarMode||'single';
  const savedCars=(activeAssets[0]?.approvedVehicles||[]).map(stockId).sort();
  const selectionCurrent=confirmed&&savedMode===bridge.mode&&JSON.stringify(savedCars)===JSON.stringify([...bridge.chosenStocks].sort());
  const selectedCategories=new Set(selected.map(row=>row.marketingCategory));
  const ready=selected.length>0&&selected.length===selectionCodes(bridge).length&&selectedCategories.size===1&&selected.every(row=>{
    const assets=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
    return assets.length>0&&assets.every(asset=>asset.creativeApprovedAt&&(!asset.integrationDraft?.pending||asset.integrationRequestKey));
  });
  const typePref=bridge.category.startsWith('تعريفي')?'تعريف':bridge.category.startsWith('بيعي')?'بيع':'';
  const matching=bridge.taskTypes.filter(type=>String(type.name||'').includes(typePref));
  const taskTypeDefault=pendingDraft?.typeId||bridge.taskTypeId||(matching.length===1?matching[0].id:'');
  const taskName=selected.length?bridge.category+' '+selected.map(idea=>idea.title).join(' + '):'';
  const taskNameValid=taskName.length<=250;
  const rows=current?assignmentsForIdea(bridge,current.code,pendingDraft):[];
  const kind=current?imageOrVideo(current):'video';
  const currentFormats=current ? (pendingDraft?.formatIdsByIdea?.[current.code]||bridge.formatIdsByIdea?.[current.code]||
    pendingDraft?.formatIdsByKind?.[kind]||bridge.formatIdsByKind?.[kind]||[]) : [];
  const sizes=bridge.formats.filter(format=>format.mediaKinds?.includes(kind));
  const categories=`<button type="button" class="bridge-category-tab ${!bridge.category?'active':''}" data-action="bridge-pick-category" data-category="">كل التصنيفات <span>${all.length}</span></button>`+
    CAMPAIGN_CATEGORIES.map(category=>`<button type="button" class="bridge-category-tab ${category===bridge.category?'active':''}" data-action="bridge-pick-category" data-category="${escape(category)}">${escape(category)} <span>${all.filter(row=>row.marketingCategory===category).length}</span></button>`).join('');
  const ideaCards=visible.map(idea=>{
    const checked=selectionCodes(bridge).includes(idea.code);
    const focused=idea.code===bridge.ideaCode;
    const assets=taskCodes(plan,idea.code).map(code=>plan.assets.find(item=>item.code===code)).filter(Boolean);
    const linked=assets.some(asset=>asset.marketingTaskId||(asset.previousMarketingTasks||[]).length);
    return `<article class="bridge-idea-option ${focused?'bridge-idea-selected':''}">
      <button type="button" class="bridge-idea-open" data-action="bridge-focus-idea" data-idea="${escape(idea.code)}" aria-current="${focused}">
        <span class="bridge-idea-code">${escape(idea.code)}</span><strong>${escape(idea.title)}</strong>
        <small>${escape(idea.marketingCategory)} · ${idea.kind==='video'?'فيديو':'صورة'}${linked?' · تم التكليف سابقًا':''}</small>
      </button>
      <label class="bridge-idea-select-label" title="إضافة هذه الفكرة إلى التكليف"><input type="checkbox" name="bridge-select-idea" value="${escape(idea.code)}" ${checked?'checked':''} ${bridge.category&&idea.marketingCategory!==bridge.category?'disabled':''}/></label>
    </article>`;
  }).join('');
  return `<div class="ui-page-actions"><button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>تحديث المنفذين والمقاسات والاستوك</button></div>
    ${bridge.error?`<div id="bridge-error" role="alert" class="notice warning">${escape(bridge.error)}</div>`:''}
    ${!plan?'<div class="notice warning">حمّل خطة المحتوى أولًا.</div>':`
    <div class="bridge-studio">
      <nav class="bridge-category-tabs bridge-top-categories" aria-label="التصنيفات">${categories}</nav>
      <div class="bridge-studio-layout">
        <aside class="bridge-studio-sidebar" id="bridge-approved-ideas">
          <div class="bridge-table-heading"><h2>الأفكار المعتمدة</h2><span class="bridge-summary-count">${visible.length} فكرة</span></div>
          <div class="bridge-table-controls"><label>بحث باسم الفكرة أو كود الفكرة<input id="bridge-idea-search" type="search" value="${escape(bridge.ideaSearch)}" placeholder="بحث في الأفكار المعتمدة"/></label><button type="button" class="btn" data-action="bridge-filter-ideas">بحث</button></div>
          <div class="bridge-approved-list">${ideaCards||'<p>لا توجد أفكار معتمدة مطابقة.</p>'}</div>
          <div class="bridge-selected-summary">تم تحديد <strong>${selected.length}</strong> فكرة للتكليف</div>
        </aside>
        <main class="bridge-studio-workspace">
          ${current?`<header class="bridge-studio-header"><div><small>كود الفكرة: <b dir="ltr">${escape(current.code)}</b></small><h2>${escape(current.title)}</h2><p>${escape(current.marketingCategory)} · ${kind==='video'?'فيديو':'صورة'}</p></div>
          <span class="bridge-status-chip ${confirmed?'is-done':''}">${confirmed?'تم تأكيد السيارات':'بانتظار تأكيد السيارات'}</span></header>
          <div class="bridge-editor-grid">
            <form id="bridge-assign" class="bridge-assignment-form" novalidate>
              <section class="bridge-config-pane bridge-config-type"><h3>نوع التاسك في التسويق</h3>
                <label>نوع التاسك في التسويق<select name="taskTypeId" required ${locked?'disabled':''}><option value="">اختر النوع</option>${bridge.taskTypes.map(type=>opt(type.id,type.name,taskTypeDefault)).join('')}</select></label>
                <small>كود الفكرة: ${escape(current.code)}</small></section>
              <section class="bridge-config-pane bridge-config-assignees" data-idea-code="${escape(current.code)}"><h3>المنفذون ومواعيد التسليم لكل فكرة</h3>
                <div class="bridge-assignees">${rows.map((entry,index)=>{
                  const person=bridge.executors.find(row=>row.user_id+'|'+row.department_id===entry.assignee);
                  const photography=Boolean(person&&/تصوير|photograph|shoot/i.test(person.department_name));
                  return `<div class="bridge-assignee-row" data-idea="${escape(current.code)}" data-index="${index}">
                    <label>المنفذ ${index+1}<select name="assignee_${escape(current.code)}_${index}" required ${locked?'disabled':''}>
                      <option value="">اختر المنفذ</option>${bridge.executors.map(user=>opt(user.user_id+'|'+user.department_id,user.full_name,entry.assignee)).join('')}</select></label>
                    <label>موعد التسليم<input name="dueOn_${escape(current.code)}_${index}" type="date" min="${nowInRiyadh()}" value="${escape(entry.dueOn||nowInRiyadh())}" required ${locked?'disabled':''}/></label>
                    <small>${photography?'رابط ملفات Google Drive':'رفع الملفات النهائية'}</small>
                    ${index>0&&!locked?`<button type="button" class="btn p-small" data-action="bridge-remove-assignee" data-idea="${escape(current.code)}" data-index="${index}">إزالة</button>`:''}</div>`;
                }).join('')}</div>
                <button type="button" class="btn bridge-add-executor" data-action="bridge-add-assignee" data-idea="${escape(current.code)}" ${locked||rows.length>=10?'disabled':''}>+ إضافة منفذ لهذه الفكرة</button></section>
              <section class="bridge-config-pane bridge-config-formats"><h3>مقاسات ${kind==='video'?'الفيديو':'الصور'}</h3>
                <div class="bridge-format-grid">${sizes.map(format=>`<label class="bridge-format-option"><input type="checkbox" name="format_${escape(current.code)}" value="${escape(format.id)}" ${currentFormats.includes(format.id)?'checked':''} ${locked?'disabled':''}/><span>${escape(format.platform_name)} — ${escape(format.name)}<small>${escape(format.width||'?')} × ${escape(format.height||'?')}</small></span></label>`).join('')||'<small>لا توجد مقاسات. حدّث المنفذين والمقاسات.</small>'}</div></section>
              <div class="bridge-editor-footer"><span>${taskNameValid?'':'عنوان التاسك أطول من 250 حرفًا؛ اختر أفكارًا أقل.'} ${selected.length} فكرة مختارة · ${selected.filter(idea=>taskCodes(plan,idea.code).every(code=>plan.assets.find(asset=>asset.code===code)?.creativeApprovedAt)).length} مؤكدة السيارات</span>
                <button type="submit" class="btn btn-primary bridge-submit" ${!ready||!taskNameValid||bridge.busy?'disabled':''}>${selected.some(idea=>taskCodes(plan,idea.code).some(code=>plan.assets.find(a=>a.code===code)?.integrationDraft))?'استكمال إنشاء التاسك المحفوظ':'إنشاء تاسك واحد يحتوي '+selected.length+' فكرة'}</button></div>
            </form>
            <form id="bridge-approval" class="bridge-config-pane bridge-config-cars"><h3>تأكيد السيارات لكل فكرة</h3>
              <label>نوع اختيار السيارات<select id="bridge-mode" name="carMode" ${pending?'disabled':''}>
                ${opt('none','لا تحتاج سيارة محددة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
              ${bridge.mode!=='none'?`<label>بحث في الاستوك<input id="bridge-stock-search" type="search" value="${escape(bridge.stockSearch)}" placeholder="اسم السيارة أو الموديل"/></label>
                <div class="bridge-stock-summary">السيارات المحددة لهذه الفكرة: <strong>${bridge.chosenStocks.length}</strong></div>
                <div class="bridge-car-list" id="bridge-cars">${renderStockOptions(bridge)||'<p>لا توجد سيارات مطابقة.</p>'}</div>`:''}
              <button type="submit" class="btn btn-primary bridge-confirm" ${pending||bridge.busy?'disabled':''}>${selectionCurrent?'حفظ تأكيد السيارات':'تأكيد سيارات هذه الفكرة والمتابعة'}</button>
            </form>
          </div>`:`<div class="bridge-studio-empty"><h2>اختر فكرة معتمدة من القائمة</h2><p>حدد الفكرة من اليمين لتظهر إعدادات التكليف والسيارات والمقاسات بعرض الصفحة.</p></div>`}
        </main>
      </div>
    </div>`}`;
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
 const assignmentsByIdea={};
 for(const {idea} of groups){
   const configured=assignmentsForIdea(bridge,idea.code);
   const rows=configured.map((entry,index)=>({
     assignee:String(form.elements.namedItem('assignee_'+idea.code+'_'+index)?.value||entry.assignee||''),
     dueOn:String(form.elements.namedItem('dueOn_'+idea.code+'_'+index)?.value||entry.dueOn||'')
   }));
   const assignments=rows.map(entry=>{
     const [userId,departmentId]=entry.assignee.split('|');
     const person=bridge.executors.find(row=>row.user_id===userId&&row.department_id===departmentId);
     if(!person)throw Error('اختر منفذًا مؤهلًا للفكرة: '+idea.title);
     if(!validISODate(entry.dueOn)||entry.dueOn<nowInRiyadh())throw Error('حدد تاريخ تسليم صحيحًا لكل منفذ في الفكرة: '+idea.title);
     return {assignee:entry.assignee,assigneeId:userId,departmentId,dueOn:entry.dueOn,
       name:person.full_name,deliveryMode:/تصوير|photograph|shoot/i.test(person.department_name)?'drive_link':'files'};
   });
   if(!assignments.length||assignments.length>10||new Set(assignments.map(row=>row.assigneeId)).size!==assignments.length)
     throw Error('اختر منفذين مختلفين داخل كل فكرة، بحد أقصى 10 منفذين: '+idea.title);
   assignmentsByIdea[idea.code]=assignments;
 }
 const itemCount=Object.values(assignmentsByIdea).reduce((sum,assignments)=>sum+assignments.length,0);
 if(itemCount>100)throw Error('التاسك الواحد يدعم 100 مطلوب كحد أقصى. قلل عدد الأفكار أو المنفذين.');
 // Older in-flight requests saved formats by media kind. Preserve that exact
 // source data for retries while new assignments remain independent by idea.
 const originalDraft=groups.flatMap(group=>group.assets).find(asset=>asset.integrationDraft?.pending)?.integrationDraft||null;
 const formatsByIdea=Object.fromEntries(ideas.map(idea=>{
   const kind=imageOrVideo(idea);
   const stored=bridge.formatIdsByIdea?.[idea.code]||originalDraft?.formatIdsByIdea?.[idea.code]||
     originalDraft?.formatIdsByKind?.[kind]||bridge.formatIdsByKind?.[kind]||[];
   return [idea.code,idea.code===bridge.ideaCode?[...form.querySelectorAll('input[name="format_'+idea.code+'"]:checked')].map(x=>x.value):stored];
 }));
 for(const idea of ideas){
   const kind=imageOrVideo(idea),formatIds=formatsByIdea[idea.code];
   if(!formatIds.length||formatIds.some(id=>!bridge.formats.some(f=>f.id===id&&f.mediaKinds?.includes(kind))))
     throw Error('اختر مقاسات '+(kind==='image'?'الصور':'الفيديو')+' للفكرة: '+idea.title);
 }
 const formatsByKind=originalDraft?.formatIdsByKind||bridge.formatIdsByKind;
 const assets=groups.flatMap(group=>group.assets);
 const pending=assets.filter(a=>a.integrationDraft?.pending===true&&a.integrationRequestKey);
 const draft={pending:true,ideaCodes:ideas.map(x=>x.code),typeId,assignmentsByIdea,formatIdsByKind:formatsByKind,formatIdsByIdea:formatsByIdea,
   name:pending.length ? (pending[0].integrationDraft?.name||name) : name};
 let requestKey;
 if(pending.length){
   const keys=[...new Set(pending.map(a=>a.integrationRequestKey))];
   const saved=pending[0].integrationDraft;
   if(keys.length!==1||pending.length!==assets.length||!sameAssignmentDraft(saved,draft))
     throw Error('يوجد تكليف محفوظ غير مكتمل. استكمل نفس المجموعة والمنفذين والمواعيد أولًا.');
   requestKey=keys[0];
 }else{
   requestKey=crypto.randomUUID();
   await updateManyAssets(assets.map(a=>a.code),{integrationRequestKey:requestKey,integrationDraft:draft});
   for(const asset of assets)Object.assign(asset,{integrationRequestKey:requestKey,integrationDraft:draft});
 }
 const items=await Promise.all(groups.flatMap(({idea,assets})=>assignmentsByIdea[idea.code].map(async assignment=>{
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
     explanation,creativeTreatment,dueOn:assignment.dueOn,formatIds:formatsByIdea[idea.code]};
 })));
 const result=await fetchBridge('assignments',{body:{requestKey,typeId,name:draft.name,source:{planId:PLAN_ID,ideaCodes:ideas.map(x=>x.code)},items}});
 const links=groups.flatMap(({idea,assets})=>{
   const primary=items.find(item=>item.ideaCode===idea.code&&item.deliveryMode==='files') || items.find(item=>item.ideaCode===idea.code);
   const itemId=result.items?.find(row=>row.client_key===primary?.clientKey)?.id;
   const ideaAssignees=assignmentsByIdea[idea.code];
   const names=ideaAssignees.map(row=>row.name).join('، ');
   const dueDate=ideaAssignees.find(row=>row.deliveryMode==='files')?.dueOn||ideaAssignees[0].dueOn;
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
