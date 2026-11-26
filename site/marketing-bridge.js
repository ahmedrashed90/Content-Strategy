import { connectFirebase } from './firebase.js';
import { getIdea, taskCodes, ideaIsApproved, nowInRiyadh, toCreativeTreatmentText } from './planner.js';
import { PLAN_ID, updateManyAssets, linkMarketingTask, listAssignmentDrafts, saveAssignmentDraft, deleteAssignmentDraft } from './plan-firebase.js';
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
/** Deduplicate formats by width×height so each unique dimension appears once.
 * Returns [{dimKey,width,height,ids:[...],representativeId,mediaKinds}]. */
const deduplicateFormats = formats => {
  const groups=new Map();
  for(const f of formats){
    const key=`${f.width||0}x${f.height||0}`;
    if(!groups.has(key))groups.set(key,{dimKey:key,width:f.width,height:f.height,ids:[],representativeId:f.id,mediaKinds:new Set()});
    const g=groups.get(key);
    g.ids.push(f.id);
    for(const k of (f.mediaKinds||[]))g.mediaKinds.add(k);
  }
  return [...groups.values()].map(g=>({...g,mediaKinds:[...g.mediaKinds]}));
};

export const CAMPAIGN_CATEGORIES = ['تعريفي - بالبراند','تعريفي - بالويب سايت','تعريفي - مواصفات السيارات','بيعي - قسط','بيعي - كاش'];
// بيعي - قسط وبيعي - كاش يُعاملان كمجموعة واحدة ويمكن جمعهما في تكليف واحد
const SALES_CATEGORIES = new Set(['بيعي - قسط','بيعي - كاش','بيعي']);
const sameCategoryGroup = (a,b) => (SALES_CATEGORIES.has(a)&&SALES_CATEGORIES.has(b)) || a===b;
const eligible = idea => idea && !idea.retiredFromIdeaBank && !idea.requiresVerification && idea.sourceStatus!=='موقوف' && CAMPAIGN_CATEGORIES.includes(idea.marketingCategory);
const selectionCodes = bridge => [...new Set(bridge.selectedCodes||[])];
const ideaRows = plan => plan ? [...plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(plan.carousels||[]).filter(a=>taskCodes(plan,a.code).some(code=>!plan.assets.find(x=>x.code===code)?.retiredFromIdeaBank))] : [];
const selectedIdeas = state => selectionCodes(state.bridge).map(code=>getIdea(state.plan,code)).filter(Boolean);
const defaultAssignment = () => ({assignee:'',dueOn:nowInRiyadh()});
const assignmentPerson = (bridge,assignee) => bridge.executors.find(row=>row.user_id+'|'+row.department_id===assignee);
// Only Ahmed Nagi may have an undated assignment, not every photographer.
export const optionalAssignmentDate = person => planNameKey(person?.full_name)==='احمد ناجي';
export const validAssignmentDate = (person,dueOn) => Boolean(person) &&
  (dueOn==='' ? optionalAssignmentDate(person) : validISODate(dueOn)&&dueOn>=nowInRiyadh());
export const validAssignmentRow = (bridge,row) => validAssignmentDate(assignmentPerson(bridge,row.assignee),row.dueOn);
// Missing controls belong to inactive ideas. An existing empty control is an
// intentional clear and must never fall back to a previously saved date.
export function readAssignmentRow(form,code,index,entry={}) {
  const field=name=>form?.elements?.namedItem(name+'_'+code+'_'+index);
  return {assignee:String(field('assignee')?.value??entry.assignee??''),
    dueOn:String(field('dueOn')?.value??entry.dueOn??'')};
}
/** Strategy flow destination per idea: none | agenda (تاريخ النشر) | campaign (تاريخ التمويل).
 * draftId '__new__' means a new draft name typed in `name`. */
export const NEW_PLAN_DRAFT='__new__';
export function placementForIdea(bridge,code){
  const saved=bridge.placementsByIdea?.[code];
  if(saved)return saved;
  const last=bridge.lastPlacement;
  return last?{...last}:{kind:'',draftId:'',name:'',date:''};
}
export function readPlacementForm(form,code,fallback){
  const field=name=>form?.elements?.namedItem(name+'_'+code);
  if(!field('placementKind'))return fallback;
  const kind=String(field('placementKind')?.value||'');
  if(kind==='shared'){
    const readSub=prefix=>{
      const el=name=>form?.elements?.namedItem(prefix+name+'_'+code);
      const draftValue=String(el('Draft')?.value||'');
      const typedName=draftValue.startsWith(NEW_PLAN_DRAFT+':')?draftValue.slice(NEW_PLAN_DRAFT.length+1):'';
      return {draftId:typedName?NEW_PLAN_DRAFT:draftValue,
        name:typedName||String(el('Name')?.value||'').trim().replace(/\s+/g,' '),
        date:String(el('Date')?.value||'')};
    };
    const agenda=readSub('agenda');
    const campaign=readSub('campaign');
    return {kind:'shared',draftId:'',name:'',date:'',
      agendaDraftId:agenda.draftId,agendaName:agenda.name,agendaDate:agenda.date,
      campaignDraftId:campaign.draftId,campaignName:campaign.name,campaignDate:campaign.date};
  }
  const draftValue=String(field('placementDraft')?.value||'');
  // «__new__:اسم» = a new name already typed for another idea in this assignment.
  const typedName=draftValue.startsWith(NEW_PLAN_DRAFT+':')?draftValue.slice(NEW_PLAN_DRAFT.length+1):'';
  return {kind,draftId:typedName?NEW_PLAN_DRAFT:draftValue,
    name:typedName||String(field('placementName')?.value||'').trim().replace(/\s+/g,' '),date:String(field('placementDate')?.value||'')};
}
/** Same normalization as Marketing, so «أجندة ديسمبر» and «اجندة  ديسمبر» match. */
export const planNameKey=value=>String(value||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').trim().replace(/\s+/g,' ').toLowerCase();
/** New names typed for other ideas of the SAME assignment (not saved yet). */
export function typedPlanNames(bridge,kind,exceptCode=''){
  const saved=new Set((bridge.planDrafts||[]).filter(row=>row.kind===kind).map(row=>planNameKey(row.name)));
  const names=new Map();
  for(const [code,p] of Object.entries(bridge.placementsByIdea||{})){
    if(code===exceptCode||!p)continue;
    // Direct placement (agenda or campaign)
    if(p.kind===kind&&p.draftId===NEW_PLAN_DRAFT&&p.name){
      const key=planNameKey(p.name);
      if(key&&!saved.has(key)&&!names.has(key))names.set(key,p.name);
    }
    // Shared placement: check sub-fields for the requested kind
    if(p.kind==='shared'){
      const subDraftId=p[kind+'DraftId']||'';
      const subName=p[kind+'Name']||'';
      if(subDraftId===NEW_PLAN_DRAFT&&subName){
        const key=planNameKey(subName);
        if(key&&!saved.has(key)&&!names.has(key))names.set(key,subName);
      }
    }
  }
  return [...names.values()];
}
/** «حذف الاسم»: removes an agenda/campaign name that was not sent for review. */
export async function deleteBridgePlanName(state,draftId){
  const bridge=state.bridge||state;
  const draft=(bridge.planDrafts||[]).find(row=>row.id===draftId);
  if(!draft)throw Error('الاسم غير موجود؛ حدّث القائمة');
  await fetchBridge('delete-draft',{body:{draftId}});
  bridge.planDrafts=(bridge.planDrafts||[]).filter(row=>row.id!==draftId);
  for(const placement of Object.values(bridge.placementsByIdea||{})){
    if(placement?.draftId===draftId){placement.draftId='';placement.name='';}
    for(const kind of ['agenda','campaign'])if(placement?.[kind+'DraftId']===draftId){placement[kind+'DraftId']='';placement[kind+'Name']='';}
  }
  if(bridge.lastPlacement?.draftId===draftId)bridge.lastPlacement=null;
  return draft;
}
/** After a successful assignment the page starts clean for new ideas. Car
 * confirmation stays on the idea itself (it is part of the idea approval). */
export function resetBridgeAssignment(state){
  Object.assign(state.bridge,{selectedCodes:[],ideaCode:'',activeAssignmentIdeaCode:'',mode:'single',chosenStocks:[],stockSearch:'',
    taskTypeId:'',assignments:[defaultAssignment()],assignmentsByIdea:{},formatIdsByIdea:{},formatIdsByKind:{image:[],video:[]},
    carSelectionsByIdea:{},carModesByIdea:{},placementsByIdea:{},lastPlacement:null,pdfReportMeta:{},currentDraftId:'',draftsOpen:false,error:''});
}
export async function clearPendingDraft(state){
  const plan=state.plan,bridge=state.bridge,ideas=selectedIdeas(state);
  const assets=ideas.flatMap(idea=>taskCodes(plan,idea.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean));
  const stuck=assets.filter(a=>a.integrationDraft?.pending===true&&a.integrationRequestKey);
  if(!stuck.length)throw Error('لا يوجد تكليف محفوظ لهذه الأفكار');
  await updateManyAssets(stuck.map(a=>a.code),{integrationDraft:null,integrationRequestKey:''});
  for(const a of stuck)Object.assign(a,{integrationDraft:null,integrationRequestKey:''});
  resetBridgeAssignment(state);
}
/** Validated single payload row for agenda or campaign. Throws an Arabic reason. */
function singlePlacementPayload(bridge,idea,placement){
  const label=idea.title||idea.code;
  const dateLabel=placement.kind==='agenda'?'تاريخ النشر':'تاريخ التمويل';
  if(!validISODate(placement.date)||placement.date<nowInRiyadh())throw Error('حدد '+dateLabel+' (اليوم أو بعده) للفكرة: '+label);
  const base={ideaCode:idea.code,kind:placement.kind,date:placement.date,category:String(idea.marketingCategory||'').slice(0,120)};
  if(placement.draftId&&placement.draftId!==NEW_PLAN_DRAFT){
    const draft=(bridge.planDrafts||[]).find(row=>row.id===placement.draftId);
    if(!draft||draft.kind!==placement.kind)throw Error('اختر اسم '+(placement.kind==='agenda'?'الأجندة':'الحملة')+' من القائمة أو اكتب اسمًا جديدًا: '+label);
    return {...base,draftId:draft.id};
  }
  if(!placement.name||placement.name.length>250)throw Error('اكتب اسم '+(placement.kind==='agenda'?'الأجندة':'الحملة')+' الجديدة للفكرة: '+label);
  return {...base,name:placement.name};
}
/** Validated payload row(s), null for «تاسك فقط», or array of two for «مشتركة». Throws an Arabic reason. */
export function placementPayload(bridge,idea,placement){
  const label=idea.title||idea.code;
  if(!placement||!placement.kind)throw Error('حدد في «نوع التاسك في التسويق» هل الفكرة لأجندة أو حملة أو تاسك فقط: '+label);
  if(placement.kind==='none')return null;
  if(placement.kind==='shared'){
    const a=singlePlacementPayload(bridge,idea,{kind:'agenda',draftId:placement.agendaDraftId||'',name:placement.agendaName||'',date:placement.agendaDate||''});
    const c=singlePlacementPayload(bridge,idea,{kind:'campaign',draftId:placement.campaignDraftId||'',name:placement.campaignName||'',date:placement.campaignDate||''});
    return [a,c];
  }
  if(placement.kind!=='agenda'&&placement.kind!=='campaign')throw Error('اختيار الوجهة غير صحيح: '+label);
  return singlePlacementPayload(bridge,idea,placement);
}
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
 const full=category+' '+ideas.map(idea=>idea.title).join(' + ');
 if(full.length<=250)return full;
 // Auto-truncate: include as many titles as fit, then add count suffix
 let name=category;
 let included=0;
 for(const idea of ideas){
   const next=name+(included?' + ':' ')+idea.title;
   if(next.length>220)break;
   name=next;included++;
 }
 const remaining=ideas.length-included;
 if(remaining>0)name+=(included?' + ':' ')+remaining+' فكرة أخرى';
 return name.slice(0,250);
};
export function newBridgeState() {
 return {stock:[],executors:[],taskTypes:[],formats:[],loading:false,error:'',
  category:'',selectedCodes:[],ideaCode:'',ideaSearch:'',ideaUsageFilter:'all',mode:'single',chosenStocks:[],stockSearch:'',
  formatIdsByKind:{image:[],video:[]},formatIdsByIdea:{},taskTypeId:'',assignments:[defaultAssignment()],assignmentsByIdea:{},activeAssignmentIdeaCode:'',carSelectionsByIdea:{},carModesByIdea:{},
  remoteTasks:{},busy:false,lastCreatedTask:null,focusAfterSave:'',carsExpanded:true,
  planDrafts:[],placementsByIdea:{},lastPlacement:null,pdfReportMeta:{},
  savedDrafts:[],currentDraftId:'',draftsOpen:false,draftLoadError:'',draftSaving:false,
  historyByIdea:{},historyLoading:{},historyError:{},expandedTaskId:''};
}
/** An assignment is ready to confirm only when ALL fields for that idea
 * are complete; the owner may fill them in any order. This validator also
 * protects the Firestore approval write, not only the disabled UI button. */
export function bridgeIdeaMissing(state, ideaCode) {
  const bridge=state.bridge,plan=state.plan,idea=getIdea(plan,ideaCode);
  if(!idea || !selectionCodes(bridge).includes(ideaCode))return ['حدد الفكرة المعتمدة أولًا'];
  const missing=[];
  const typePref=String(bridge.category||'').startsWith('تعريفي')?'تعريف':String(bridge.category||'').startsWith('بيعي')?'بيع':'';
  const matching=bridge.taskTypes.filter(type=>typePref && String(type.name||'').includes(typePref));
  const typeId=bridge.taskTypeId||(matching.length===1?matching[0].id:'');
  if(!bridge.taskTypes.some(type=>type.id===typeId))missing.push('نوع التاسك في التسويق');
  const placement=bridge.placementsByIdea?.[ideaCode]||null;
  try { placementPayload(bridge,idea,placement); }
  catch(error) { missing.push(String(error?.message||'الوجهة في قسم النشر')); }
  const assignments=assignmentsForIdea(bridge,ideaCode);
  if(!assignments.length || assignments.length>10 || assignments.some(row=>!validAssignmentRow(bridge,row)) || new Set(assignments.map(row=>String(row.assignee||'').split('|')[0])).size!==assignments.length)
    missing.push('المنفذون ومواعيد التسليم لكل فكرة');
  const kind=imageOrVideo(idea);
  const formats=bridge.formatIdsByIdea?.[ideaCode]||[];
  if(!formats.length||formats.some(id=>!bridge.formats.some(row=>row.id===id&&row.mediaKinds?.includes(kind))))
    missing.push('مقاسات '+(kind==='video'?'الفيديو':'الصور'));
  const active=bridge.ideaCode===ideaCode;
  const assets=taskCodes(plan,ideaCode).map(code=>plan.assets.find(row=>row.code===code)).filter(Boolean);
  const mode=active?bridge.mode:(bridge.carModesByIdea?.[ideaCode]||assets[0]?.approvedCarMode||'single');
  const cars=active?bridge.chosenStocks:(bridge.carSelectionsByIdea?.[ideaCode]||((assets[0]?.approvedVehicles||[]).map(stockId)));
  if(!['none','single','compare'].includes(mode)||
     (mode==='none'&&cars.length>0)||(mode==='single'&&cars.length<1)||(mode==='compare'&&cars.length<2) ||
     cars.some(value=>!bridge.stock.some(car=>stockId(car)===value)))missing.push('تأكيد السيارات لكل فكرة');
  return missing;
}

const draftSnapshot = bridge => {
  const carSelectionsByIdea={...bridge.carSelectionsByIdea};
  const carModesByIdea={...bridge.carModesByIdea};
  if(bridge.ideaCode){carSelectionsByIdea[bridge.ideaCode]=[...bridge.chosenStocks];carModesByIdea[bridge.ideaCode]=bridge.mode;}
  return {id:bridge.currentDraftId||crypto.randomUUID(), selectedCodes:selectionCodes(bridge),
    category:bridge.category,ideaCode:bridge.ideaCode,taskTypeId:bridge.taskTypeId,
    assignmentsByIdea:bridge.assignmentsByIdea,formatIdsByIdea:bridge.formatIdsByIdea,
    placementsByIdea:bridge.placementsByIdea,carModesByIdea,carSelectionsByIdea};
};
export async function refreshBridgeSavedDrafts(bridge) {
  try {bridge.savedDrafts=await listAssignmentDrafts();bridge.draftLoadError='';}
  catch(error){bridge.draftLoadError='تعذر قراءة مسودات التكليفات من Firestore. انشر قواعد firestore.rules المرفقة. '+String(error?.message||'');}
}
export async function persistBridgeAssignmentDraft(state) {
  const bridge=state.bridge;
  if(!selectionCodes(bridge).length)throw Error('حدد فكرة واحدة على الأقل قبل حفظ المسودة');
  const snapshot=draftSnapshot(bridge);
  const saved=await saveAssignmentDraft(snapshot);
  bridge.currentDraftId=saved.id;
  await refreshBridgeSavedDrafts(bridge);
  return saved;
}
export function resumeBridgeAssignmentDraft(state,draftId) {
  const bridge=state.bridge, draft=bridge.savedDrafts.find(row=>row.id===draftId);
  if(!draft)throw Error('المسودة غير موجودة أو تم حذفها');
  const selectedCodes=(draft.selectedCodes||[]).filter(code=>{
    const idea=getIdea(state.plan,code);
    return eligible(idea)&&ideaIsApproved(state.plan,code);
  });
  if(!selectedCodes.length)throw Error('الأفكار المحفوظة في المسودة لم تعد متاحة أو معتمدة');
  Object.assign(bridge,{
    currentDraftId:draft.id,selectedCodes,category:draft.category||'',ideaCode:'',
    taskTypeId:draft.taskTypeId||'',assignmentsByIdea:structuredClone(draft.assignmentsByIdea||{}),
    formatIdsByIdea:structuredClone(draft.formatIdsByIdea||{}),
    placementsByIdea:structuredClone(draft.placementsByIdea||{}),
    carModesByIdea:structuredClone(draft.carModesByIdea||{}),
    carSelectionsByIdea:structuredClone(draft.carSelectionsByIdea||{}),
    activeAssignmentIdeaCode:'',lastPlacement:null,error:'',draftsOpen:false,
  });
  selectBridgeIdea(state,selectedCodes.includes(draft.ideaCode)?draft.ideaCode:selectedCodes[0],false);
  if(selectedCodes.length !== (draft.selectedCodes||[]).length)
    bridge.error='بعض الأفكار في المسودة لم تعد معتمدة. راجع الاختيارات قبل إنشاء التكليف.';
  bridge.pdfReportMeta={};
  return draft;
}
export async function discardBridgeAssignmentDraft(state,draftId){
  const bridge=state.bridge;
  await deleteAssignmentDraft(draftId);
  if(bridge.currentDraftId===draftId){resetBridgeAssignment(state);bridge.currentDraftId='';}
  await refreshBridgeSavedDrafts(bridge);
}

export function selectBridgeCategory(state, category) {
 if(category&&!CAMPAIGN_CATEGORIES.includes(category)&&!SALES_CATEGORIES.has(category))throw Error('تصنيف غير معتمد');
 Object.assign(state.bridge,{category,selectedCodes:[],ideaCode:'',mode:'single',chosenStocks:[],stockSearch:'',assignmentsByIdea:{},activeAssignmentIdeaCode:'',formatIdsByIdea:{},carSelectionsByIdea:{},carModesByIdea:{},pdfReportMeta:{},error:''});
}
export function toggleBridgeIdea(state,code,checked) {
 const idea=getIdea(state.plan,code),bridge=state.bridge;
 if(!eligible(idea)||!ideaIsApproved(state.plan,code))throw Error('الفكرة غير معتمدة أو غير متاحة');
 if(checked&&bridge.category&&!sameCategoryGroup(idea.marketingCategory,bridge.category))
   throw Error('لا يمكن جمع فكرتين من تصنيفين مختلفين في تاسك واحد');
 if(checked&&!bridge.category)bridge.category=idea.marketingCategory;
 // لو المجموعة بيعي خليها تظهر كـ "بيعي" مش بالتصنيف الأول فقط
 if(checked&&bridge.category&&idea.marketingCategory!==bridge.category&&SALES_CATEGORIES.has(idea.marketingCategory))
   bridge.category='بيعي';
 if(checked && selectionCodes(bridge).length>=100)throw Error('الحد الأقصى 100 فكرة في التاسك الواحد');
 const stored=state.plan?.assets?.find(a=>a.code===code)?.integrationDraft;
 if(checked&&stored?.pending===true&&Array.isArray(stored.ideaCodes)){
   const ready=stored.ideaCodes.map(c=>getIdea(state.plan,c));
   if(ready.some(row=>!eligible(row)||!sameCategoryGroup(row.marketingCategory,bridge.category)))throw Error('تعذر استعادة مجموعة التكليف المحفوظة');
   bridge.selectedCodes=[...stored.ideaCodes];
   bridge.assignmentsByIdea=Object.fromEntries(bridge.selectedCodes.map(ideaCode=>[ideaCode,
     (stored.assignmentsByIdea?.[ideaCode] || stored.assignments || [defaultAssignment()]).map(row=>({...row}))]));
   bridge.formatIdsByIdea=stored.formatIdsByIdea||{};
   bridge.placementsByIdea={...(stored.placementsByIdea||{}),...bridge.placementsByIdea};
 }else bridge.selectedCodes=checked?[...selectionCodes(bridge).filter(x=>x!==code),code]:selectionCodes(bridge).filter(x=>x!==code);
 if(!bridge.selectedCodes.includes(bridge.ideaCode)) selectBridgeIdea(state,bridge.selectedCodes[0]||'',false);
 else bridge.activeAssignmentIdeaCode=bridge.ideaCode;
}
export function selectBridgeIdea(state, code, add=true) {
 const idea=getIdea(state.plan,code);
 if(idea && !eligible(idea))throw Error('هذه الفكرة موقوفة أو ليست ضمن البنك النشط');
 const first=idea ? state.plan?.assets.find(asset=>asset.code===taskCodes(state.plan,code)[0]) : null;
 if(idea && !sameCategoryGroup(idea.marketingCategory,state.bridge.category||''))Object.assign(state.bridge,{category:idea.marketingCategory,selectedCodes:[]});
 if(idea && state.bridge.category && idea.marketingCategory!==state.bridge.category && SALES_CATEGORIES.has(idea.marketingCategory) && SALES_CATEGORIES.has(state.bridge.category))state.bridge.category='بيعي';
 if(idea && add){
   const stored=first?.integrationDraft?.ideaCodes;
   if(first?.integrationDraft?.pending===true && Array.isArray(stored) && stored.length && first.integrationRequestKey) {
     state.bridge.selectedCodes=stored.filter(c=>{const i=getIdea(state.plan,c);return i&&sameCategoryGroup(i.marketingCategory,idea.marketingCategory);});
     state.bridge.assignmentsByIdea=Object.fromEntries(state.bridge.selectedCodes.map(ideaCode=>[ideaCode,
       (first.integrationDraft.assignmentsByIdea?.[ideaCode] || first.integrationDraft.assignments || [defaultAssignment()]).map(row=>({...row}))]));
     state.bridge.formatIdsByIdea=first.integrationDraft.formatIdsByIdea||{};
     state.bridge.placementsByIdea={...(first.integrationDraft.placementsByIdea||{}),...state.bridge.placementsByIdea};
   }
   else if(!state.bridge.selectedCodes.includes(code))state.bridge.selectedCodes.push(code);
 }
 if(state.bridge.ideaCode){
   state.bridge.carModesByIdea[state.bridge.ideaCode]=state.bridge.mode;
   state.bridge.carSelectionsByIdea[state.bridge.ideaCode]=[...state.bridge.chosenStocks];
 }
 if(state.bridge.ideaCode!==code)state.bridge.stockSearch='';
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
  if (!options.body) { url.searchParams.set('resource',resource); if(options.taskId)url.searchParams.set('taskId',options.taskId); if(options.ideaCode){url.searchParams.set('ideaCode',options.ideaCode);url.searchParams.set('planId',PLAN_ID);} }
  const reply = await fetch(url,{method:options.body?'POST':'GET',headers:{Authorization:`Bearer ${idToken}`, ...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify({action:resource==='agenda'?'agenda':resource==='delete-draft'?'delete-draft':'assign',...options.body})}:{})});
  const payload = await reply.json().catch(()=>({ok:false,error:'Invalid API response'}));
  if(!reply.ok || !payload.ok)throw Error(payload.error || `Bridge request failed (${reply.status})`);
  return payload;
}
export async function reloadBridge(state) {
  if(state.loading)return;
  state.loading=true;state.error='';
  try {
    const [stock,people,types,drafts]=await Promise.all([fetchBridge('stock'),fetchBridge('executors'),fetchBridge('catalog'),
      fetchBridge('plan-drafts').catch(()=>({drafts:[]}))]);
    state.stock=stock.cars||[];state.executors=people.executors||[];
    state.taskTypes=types.taskTypes||[];state.formats=types.formats||[];
    state.planDrafts=drafts.drafts||[];
    await refreshBridgeSavedDrafts(state);
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;}
}
function subPlacementFields(bridge,code,subKind,p){
  const drafts=(bridge.planDrafts||[]).filter(row=>row.kind===subKind);
  const typed=typedPlanNames(bridge,subKind,code);
  const kindLabel=subKind==='campaign'?'الحملة':'الأجندة';
  const prefix=subKind;
  const savedDraftId=p[prefix+'DraftId']||'';
  const savedName=p[prefix+'Name']||'';
  const savedDate=p[prefix+'Date']||'';
  const typedMatch=savedDraftId===NEW_PLAN_DRAFT&&savedName?typed.find(name=>planNameKey(name)===planNameKey(savedName)):'';
  const isNew=!typedMatch&&(savedDraftId===NEW_PLAN_DRAFT||(!savedDraftId&&Boolean(savedName)));
  const current=typedMatch?NEW_PLAN_DRAFT+':'+typedMatch:isNew?NEW_PLAN_DRAFT:savedDraftId;
  const selectedDraft=drafts.find(row=>row.id===savedDraftId);
  const staleDraft=Boolean(savedDraftId&&savedDraftId!==NEW_PLAN_DRAFT&&!selectedDraft);
  return `<fieldset class="bridge-shared-sub"><legend>${escape(kindLabel)}</legend>
    <label>اسم ${kindLabel}<span class="bridge-placement-name"><select name="${prefix}Draft_${escape(code)}" data-placement="draft">
      ${opt('','اختر '+kindLabel,current)}
      ${staleDraft?`<option value=\"${escape(savedDraftId)}\" selected disabled>المسودة السابقة غير متاحة — اختر مسودة أخرى</option>`:''}
      ${drafts.map(row=>opt(row.id,row.name+' · '+(row.ideaCount||0)+' فكرة',current)).join('')}
      ${typed.map(name=>opt(NEW_PLAN_DRAFT+':'+name,name+' · جديدة في هذا التكليف',current)).join('')}
      ${opt(NEW_PLAN_DRAFT,'+ '+(subKind==='campaign'?'حملة':'أجندة')+' جديدة',current)}</select>
      ${selectedDraft?`<button type="button" class="btn p-small bridge-placement-delete" data-action="bridge-delete-plan-name" data-draft="${escape(selectedDraft.id)}" title="حذف هذا الاسم من القائمة">حذف الاسم</button>`:''}</span></label>
    ${isNew?`<label>اسم ${kindLabel} الجديدة<input name="${prefix}Name_${escape(code)}" maxlength="250" value="${escape(savedName)}" placeholder="مثال: ${subKind==='campaign'?'حملة ديسمبر':'أجندة ديسمبر'}" required/></label>`:''}
    <label>${subKind==='agenda'?'تاريخ النشر':'تاريخ التمويل'}<input type="date" name="${prefix}Date_${escape(code)}" min="${nowInRiyadh()}" value="${escape(savedDate)}" required/></label>
  </fieldset>`;
}
function placementFields(bridge,idea){
  const code=idea.code,p=placementForIdea(bridge,code);
  const drafts=(bridge.planDrafts||[]).filter(row=>row.kind===p.kind);
  const typed=typedPlanNames(bridge,p.kind,code);
  const kindLabel=p.kind==='campaign'?'الحملة':'الأجندة';
  const typedMatch=p.draftId===NEW_PLAN_DRAFT&&p.name?typed.find(name=>planNameKey(name)===planNameKey(p.name)):'';
  const isNew=!typedMatch&&(p.draftId===NEW_PLAN_DRAFT||(!p.draftId&&Boolean(p.name)));
  const current=typedMatch?NEW_PLAN_DRAFT+':'+typedMatch:isNew?NEW_PLAN_DRAFT:p.draftId;
  const selectedDraft=drafts.find(row=>row.id===p.draftId);
  const staleDraft=Boolean(p.draftId&&p.draftId!==NEW_PLAN_DRAFT&&!selectedDraft);
  return `<div class="bridge-placement" data-placement-code="${escape(code)}">
    <label>الوجهة في قسم النشر<select name="placementKind_${escape(code)}" data-placement="kind" required>
      ${opt('','اختر: أجندة أو حملة',p.kind)}${opt('agenda','أجندة',p.kind)}${opt('campaign','حملة',p.kind)}${opt('shared','مشتركة (حملة + أجندة)',p.kind)}${opt('none','بدون — تاسك فقط',p.kind)}</select></label>
    ${p.kind==='agenda'||p.kind==='campaign'?`
    <label>اسم ${kindLabel}<span class="bridge-placement-name"><select name="placementDraft_${escape(code)}" data-placement="draft">
      ${opt('','اختر '+kindLabel,current)}
      ${staleDraft?`<option value=\"${escape(p.draftId)}\" selected disabled>المسودة السابقة غير متاحة — اختر مسودة أخرى</option>`:''}
      ${drafts.map(row=>opt(row.id,row.name+' · '+(row.ideaCount||0)+' فكرة',current)).join('')}
      ${typed.map(name=>opt(NEW_PLAN_DRAFT+':'+name,name+' · جديدة في هذا التكليف',current)).join('')}
      ${opt(NEW_PLAN_DRAFT,'+ '+(p.kind==='campaign'?'حملة':'أجندة')+' جديدة',current)}</select>
      ${selectedDraft?`<button type="button" class="btn p-small bridge-placement-delete" data-action="bridge-delete-plan-name" data-draft="${escape(selectedDraft.id)}" title="حذف هذا الاسم من القائمة">حذف الاسم</button>`:''}</span></label>
    ${isNew?`<label>اسم ${kindLabel} الجديدة<input name="placementName_${escape(code)}" maxlength="250" value="${escape(p.name)}" placeholder="مثال: ${p.kind==='campaign'?'حملة ديسمبر':'أجندة ديسمبر'}" required/></label>`:''}
    <label>${p.kind==='agenda'?'تاريخ النشر':'تاريخ التمويل'}<input type="date" name="placementDate_${escape(code)}" min="${nowInRiyadh()}" value="${escape(p.date)}" required/></label>
    <small>تظهر في قسم النشر بالتسويق حتى لو الفكرة لم تُنفذ بعد.</small>`:''}
    ${p.kind==='shared'?subPlacementFields(bridge,code,'agenda',p)+subPlacementFields(bridge,code,'campaign',p)+`<small>تظهر مسودة أجندة ومسودة حملة في قسم النشر بالتسويق.</small>`:''}
  </div>`;
}
export function bridgeAssignmentReady(state) {
  const {bridge,plan}=state;
  const selected=selectedIdeas(state).filter(row=>eligible(row)&&sameCategoryGroup(row.marketingCategory,bridge.category));
  const categories=new Set(selected.map(row=>row.marketingCategory));
  return selected.length>0&&selected.length===selectionCodes(bridge).length&&
    (categories.size===1||[...categories].every(c=>SALES_CATEGORIES.has(c)))&&selected.every(row=>{
      const assets=taskCodes(plan,row.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean);
      return assets.length>0&&assets.every(asset=>asset.creativeApprovedAt&&(!asset.integrationDraft?.pending||asset.integrationRequestKey))&&
        !bridgeIdeaMissing(state,row.code).length;
    });
}
/** Report-only metadata is not part of the Marketing assignment or Firestore. */
export function validateAssignmentPdfMeta(input={}) {
  const meta={title:String(input.title||'').trim(),season:String(input.season||'').trim(),
    seasonFrom:String(input.seasonFrom||''),seasonTo:String(input.seasonTo||''),campaignEnd:String(input.campaignEnd||'')};
  if(meta.title.length>160||meta.season.length>120)throw Error('اختصر عنوان التقرير أو اسم الموسم.');
  for(const key of ['seasonFrom','seasonTo','campaignEnd'])if(meta[key]&&!validISODate(meta[key]))throw Error('اختر تاريخًا صحيحًا في بيانات التقرير.');
  if(meta.seasonFrom&&meta.seasonTo&&meta.seasonFrom>meta.seasonTo)throw Error('تاريخ بداية الموسم يجب أن يسبق تاريخ نهايته.');
  return meta;
}
/** Use the same approved ideas, assignee identities and placement validation as
 * creation, but do not write any data, allocate a request key or send an API call. */
export function collectAssignmentPdfReport(state,form,metadata=state.bridge.pdfReportMeta||{}) {
  const {bridge}=state;
  const ideas=selectedIdeas(state);
  if(!bridgeAssignmentReady(state)||!ideas.length)throw Error('أكمل الاختيارات وتأكيد السيارات لكل فكرة قبل تصدير PDF.');
  const meta=validateAssignmentPdfMeta(metadata);
  const groups=new Map(),names={agenda:new Set(),campaign:new Set()};
  let count=0;
  for(const idea of ideas){
    const code=idea.code;
    const placement=readPlacementForm(form,code,null)||bridge.placementsByIdea?.[code];
    const payload=placementPayload(bridge,idea,placement);
    const destinations=payload==null?[]:Array.isArray(payload)?payload:[payload];
    const agenda=destinations.find(row=>row.kind==='agenda');
    const campaign=destinations.find(row=>row.kind==='campaign');
    for(const row of destinations){const name=row.name||(bridge.planDrafts||[]).find(d=>d.id===row.draftId)?.name;if(name)names[row.kind].add(name);}
    const configured=assignmentsForIdea(bridge,code);
    const rows=configured.map((entry,index)=>{
      const current=readAssignmentRow(form,code,index,entry);
      const person=assignmentPerson(bridge,current.assignee);
      if(!validAssignmentDate(person,current.dueOn))throw Error('حدد تاريخ التسليم المطلوب لكل منفذ في الفكرة: '+idea.title);
      const photography=/تصوير|photograph|shoot/i.test(person.department_name);
      return {executor:person.full_name,requirement:photography?'تصوير':imageOrVideo(idea)==='video'?'فيديو':'صورة',dueOn:current.dueOn,photography};
    });
    count+=rows.length;
    const hasProduction=rows.some(row=>!row.photography);
    const finalRows=rows.map((row,index)=>({executor:row.executor,requirement:row.requirement,dueOn:row.dueOn,
      publishOn:(!row.photography||!hasProduction&&index===rows.length-1)?agenda?.date||'لا يوجد':'',
      fundOn:(!row.photography||!hasProduction&&index===rows.length-1)?campaign?.date||'لا يوجد':''}));
    // Sales ideas (قسط/كاش) stay together in one PDF table; other categories keep their own table.
    const category=SALES_CATEGORIES.has(idea.marketingCategory)?'بيعي - الموسم':idea.marketingCategory;
    if(!groups.has(category))groups.set(category,{number:groups.size+1,category,ideas:[]});
    groups.get(category).ideas.push({code,title:idea.title,rows:finalRows});
  }
  if(count>100)throw Error('التاسك الواحد يدعم 100 مطلوب كحد أقصى. قلل عدد الأفكار أو المنفذين.');
  const allNames=[...names.agenda,...names.campaign];
  const joined=[...new Set(allNames)].join(' + ');
  return {title:meta.title||(joined&&joined.length<=160?joined:'خطة التنفيذ والنشر والتمويل'),
    season:meta.season,seasonFrom:meta.seasonFrom,seasonTo:meta.seasonTo,campaignEnd:meta.campaignEnd,
    groups:[...groups.values()]};
}

const PDF_GROUP_ORDER=['بيعي - الموسم','تعريفي - بالبراند','تعريفي - مواصفات السيارات','تعريفي - بالويب سايت'];
/** One PDF for every saved draft: each draft is evaluated exactly like a single assignment
 * (same validation, nothing is written), then all their tables are merged in a fixed order. */
export function collectDraftsPdfReport(state,drafts,metadata=state.bridge.pdfReportMeta||{}) {
  if(!drafts?.length)throw Error('لا توجد مسودات محفوظة لتصديرها.');
  const meta=validateAssignmentPdfMeta(metadata);
  const groups=[];const titles=[];
  for(const draft of drafts){
    const codes=(draft.selectedCodes||[]).filter(code=>eligible(getIdea(state.plan,code))&&ideaIsApproved(state.plan,code));
    if(!codes.length)throw Error('إحدى المسودات لا تحتوي أفكارًا معتمدة متاحة.');
    const draftState={...state,bridge:{...state.bridge,selectedCodes:codes,category:draft.category||'',ideaCode:'',
      taskTypeId:draft.taskTypeId||'',assignmentsByIdea:structuredClone(draft.assignmentsByIdea||{}),
      formatIdsByIdea:structuredClone(draft.formatIdsByIdea||{}),placementsByIdea:structuredClone(draft.placementsByIdea||{}),
      carModesByIdea:structuredClone(draft.carModesByIdea||{}),carSelectionsByIdea:structuredClone(draft.carSelectionsByIdea||{}),
      chosenStocks:[],activeAssignmentIdeaCode:''}};
    let report;
    try{report=collectAssignmentPdfReport(draftState,null,meta);}
    catch(error){throw Error('مسودة ('+codes.length+' أفكار): '+(error?.message||error));}
    titles.push(report.title);groups.push(...report.groups);
  }
  groups.sort((a,b)=>{const ia=PDF_GROUP_ORDER.indexOf(a.category),ib=PDF_GROUP_ORDER.indexOf(b.category);return (ia<0?99:ia)-(ib<0?99:ib);});
  groups.forEach((group,index)=>{group.number=index+1;});
  const joined=[...new Set(titles.filter(Boolean))].join(' + ');
  return {title:meta.title||(joined&&joined.length<=160?joined:'خطة التنفيذ والنشر والتمويل'),
    season:meta.season,seasonFrom:meta.seasonFrom,seasonTo:meta.seasonTo,campaignEnd:meta.campaignEnd,groups};
}
function assignmentPdfOptions(bridge){
  const meta=bridge.pdfReportMeta||{};
  return `<dialog id="bridge-pdf-options" class="bridge-pdf-dialog" aria-labelledby="bridge-pdf-options-title">
    <div class="bridge-pdf-dialog-inner"><h2 id="bridge-pdf-options-title">بيانات تقرير PDF</h2>
      <p>اختيارية، تظهر في الملف فقط ولا تُرسل إلى التسويق. اترك العنوان فارغًا لاستخدام أسماء الأجندة والحملة الحالية.</p>
      <label>عنوان التقرير<input id="bridge-pdf-title" maxlength="160" value="${escape(meta.title||'')}" placeholder="أجندة وحملة شهر 2027/2"/></label>
      <label>الموسم<input id="bridge-pdf-season" maxlength="120" value="${escape(meta.season||'')}" placeholder="اسم الموسم"/></label>
      <div class="bridge-pdf-date-fields"><label>بداية الموسم<input id="bridge-pdf-seasonFrom" type="date" value="${escape(meta.seasonFrom||'')}"/></label>
      <label>نهاية الموسم<input id="bridge-pdf-seasonTo" type="date" value="${escape(meta.seasonTo||'')}"/></label></div>
      <label>انتهاء الحملة<input id="bridge-pdf-campaignEnd" type="date" value="${escape(meta.campaignEnd||'')}"/></label>
      <div class="bridge-pdf-dialog-actions"><button type="button" class="btn" data-action="bridge-pdf-options-close">إلغاء</button><button type="button" class="btn btn-primary" data-action="bridge-pdf-options-save">حفظ بيانات التقرير</button></div>
    </div></dialog>`;
}
export function bridgePage(state) {
  const bridge=state.bridge,plan=state.plan;
  const all=ideaRows(plan).filter(row=>eligible(row)&&ideaIsApproved(plan,row.code));
  const selected=selectedIdeas(state).filter(row=>eligible(row)&&sameCategoryGroup(row.marketingCategory,bridge.category));
  const q=String(bridge.ideaSearch||'').trim().toLocaleLowerCase();
  const usageFilter=bridge.ideaUsageFilter||'all';
  const isLinked=row=>{const a=taskCodes(plan,row.code).map(c=>plan.assets.find(x=>x.code===c)).filter(Boolean);return a.some(x=>x.marketingTaskId||(x.previousMarketingTasks||[]).length);};
  const visible=all.filter(row=>(!bridge.category||sameCategoryGroup(row.marketingCategory,bridge.category))&&
    (usageFilter==='all'||(usageFilter==='used'?isLinked(row):!isLinked(row)))&&
    (!q||[row.code,row.title,row.marketingCategory,row.executor,row.marketingExecutorName].join(' ').toLocaleLowerCase().includes(q)));
  const current=selected.find(row=>row.code===bridge.ideaCode)||null;
  const activeAssets=current?taskCodes(plan,current.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean):[];
  const pendingDraft=activeAssets.find(asset=>asset.integrationDraft?.pending)?.integrationDraft||null;
  // المسودة المحفوظة تُستخدم لاسترجاع ما أدخلته فقط، ولا تقفل الحقول.
  const locked=false;
  const confirmed=activeAssets.length>0&&activeAssets.every(asset=>Boolean(asset.creativeApprovedAt));
  const pending=activeAssets.some(asset=>asset.integrationDraft?.pending===true);
  const savedMode=activeAssets[0]?.approvedCarMode||'single';
  const savedCars=(activeAssets[0]?.approvedVehicles||[]).map(stockId).sort();
  const selectionCurrent=confirmed&&savedMode===bridge.mode&&JSON.stringify(savedCars)===JSON.stringify([...bridge.chosenStocks].sort());
  const ideaMissing=current?bridgeIdeaMissing(state,current.code):[];
  const ready=bridgeAssignmentReady(state);
  const typePref=bridge.category.startsWith('تعريفي')?'تعريف':bridge.category.startsWith('بيعي')?'بيع':'';
  const matching=bridge.taskTypes.filter(type=>String(type.name||'').includes(typePref));
  const taskTypeDefault=pendingDraft?.typeId||bridge.taskTypeId||(matching.length===1?matching[0].id:'');
  const taskNameValid=true; // auto-truncated in groupedName()
  const rows=current?assignmentsForIdea(bridge,current.code):[];
  const kind=current?imageOrVideo(current):'video';
  const currentFormats=current ? (pendingDraft?.formatIdsByIdea?.[current.code]||bridge.formatIdsByIdea?.[current.code]||
    pendingDraft?.formatIdsByKind?.[kind]||bridge.formatIdsByKind?.[kind]||[]) : [];
  const sizes=deduplicateFormats(bridge.formats.filter(format=>format.mediaKinds?.includes(kind)));
  // نعرض تاب "بيعي (قسط وكاش)" اللي يجمع الاثنين معًا
  const DISPLAY_CATEGORIES=[
    ...CAMPAIGN_CATEGORIES.filter(c=>!SALES_CATEGORIES.has(c)),
    'بيعي', // تاب الجمع
    'بيعي - قسط','بيعي - كاش',
  ];
  const categoryLabel=(c)=>c==='بيعي'?'بيعي (قسط وكاش)':c;
  const categoryCount=(c)=>c==='بيعي'?all.filter(row=>SALES_CATEGORIES.has(row.marketingCategory)).length:all.filter(row=>row.marketingCategory===c).length;
  const isCategoryActive=(c)=>c?((c==='بيعي'&&bridge.category==='بيعي')||c===bridge.category):!bridge.category;
  const categories=`<button type="button" class="bridge-category-tab ${isCategoryActive('')?'active':''}" data-action="bridge-pick-category" data-category="">كل التصنيفات <span>${all.length}</span></button>`+
    DISPLAY_CATEGORIES.map(c=>`<button type="button" class="bridge-category-tab ${isCategoryActive(c)?'active':''}" data-action="bridge-pick-category" data-category="${escape(c)}">${escape(categoryLabel(c))} <span>${categoryCount(c)}</span></button>`).join('');
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
      <label class="bridge-idea-select-label" title="إضافة هذه الفكرة إلى التكليف"><input type="checkbox" name="bridge-select-idea" value="${escape(idea.code)}" ${checked?'checked':''} ${bridge.category&&!sameCategoryGroup(idea.marketingCategory,bridge.category)?'disabled':''}/></label>
    </article>`;
  }).join('');
  return `<div class="bridge-studio-toolbar" role="group" aria-label="فلاتر التصنيفات وتحديث البيانات">
      ${plan?`<nav class="bridge-category-tabs bridge-top-categories" aria-label="التصنيفات">${categories}</nav>`:''}
      <div class="ui-page-actions bridge-toolbar-actions">
        <button type="button" class="btn" data-action="bridge-open-drafts">مسودات التكليفات (${bridge.savedDrafts.length})</button>
        <button type="button" class="btn" data-action="bridge-save-draft" ${bridge.draftSaving||!selected.length?'disabled':''}>${bridge.currentDraftId?'تحديث مسودة التكليف':'حفظ مسودة التكليف'}</button>
        <button class="btn" data-action="bridge-reload" ${bridge.loading?'disabled':''}>تحديث المنفذين والمقاسات والاستوك</button></div>
    </div>
    ${bridge.draftLoadError?`<div class="notice warning">${escape(bridge.draftLoadError)}</div>`:''}
    ${bridge.draftsOpen?`<section class="bridge-drafts-panel" aria-label="مسودات التكليفات"><header><strong>مسودات التكليفات المحفوظة في Firestore</strong><span><button type="button" class="btn p-small" data-action="bridge-pdf-options-open">بيانات التقرير</button> <button type="button" class="btn p-small" data-action="bridge-export-drafts-pdf" ${bridge.pdfExporting||!bridge.savedDrafts.length?'disabled':''}>تصدير PDF لكل المسودات (ملف واحد)</button> <button type="button" class="btn p-small" data-action="bridge-open-drafts">إغلاق</button></span></header><div class="bridge-drafts-items">${bridge.savedDrafts.map(d=>`<article class="bridge-saved-draft"><div><strong>${escape(d.selectedCodes?.length||0)} فكرة</strong><small>آخر تعديل: ${escape(d.updatedAt?.toDate?.()?.toLocaleString?.('ar-SA')||'محفوظة في قاعدة البيانات')}</small></div><button type="button" class="btn p-small" data-action="bridge-resume-draft" data-draft="${escape(d.id)}">استكمال المسودة</button><button type="button" class="btn p-small" data-action="bridge-delete-saved-draft" data-draft="${escape(d.id)}">حذف</button></article>`).join('')||'<p>لا توجد مسودات محفوظة. اختر أفكارًا ثم اضغط «حفظ مسودة التكليف».</p>'}</div></section>`:''}
    ${bridge.error?`<div id="bridge-error" role="alert" class="notice warning">${escape(bridge.error)}${bridge.error.includes('تكليف محفوظ')?` <button type="button" class="btn p-small" data-action="bridge-clear-draft">مسح التكليف المحفوظ</button>`:''}</div>`:''}
    ${!plan?'<div class="notice warning">حمّل خطة المحتوى أولًا.</div>':`
    <div class="bridge-studio">
      <div class="bridge-studio-layout">
        <aside class="bridge-studio-sidebar" id="bridge-approved-ideas">
          <div class="bridge-table-heading"><h2>الأفكار المعتمدة</h2><span class="bridge-summary-count">${visible.length} فكرة</span></div>
          <div class="bridge-table-controls"><label>بحث باسم الفكرة أو كود الفكرة<input id="bridge-idea-search" type="search" value="${escape(bridge.ideaSearch)}" placeholder="بحث في الأفكار المعتمدة"/></label><button type="button" class="btn" data-action="bridge-filter-ideas">بحث</button></div>
          <div class="bridge-usage-filter"><button type="button" class="bridge-category-tab ${usageFilter==='all'?'active':''}" data-action="bridge-usage-filter" data-filter="all">الكل</button><button type="button" class="bridge-category-tab ${usageFilter==='unused'?'active':''}" data-action="bridge-usage-filter" data-filter="unused">لم تُستخدم</button><button type="button" class="bridge-category-tab ${usageFilter==='used'?'active':''}" data-action="bridge-usage-filter" data-filter="used">مستخدمة</button></div>
          <div class="bridge-approved-list">${ideaCards||'<p>لا توجد أفكار معتمدة مطابقة.</p>'}</div>
          <div class="bridge-selected-summary">تم تحديد <strong>${selected.length}</strong> فكرة للتكليف</div>
        </aside>
        <main class="bridge-studio-workspace">
          ${current?`<header class="bridge-studio-header"><div><small>كود الفكرة: <b dir="ltr">${escape(current.code)}</b></small><h2>${escape(current.title)}</h2><p>${escape(current.marketingCategory)} · ${kind==='video'?'فيديو':'صورة'}</p></div>
          <span class="bridge-status-chip ${confirmed&&selectionCurrent?'is-done':''}">${confirmed&&selectionCurrent?'تم تأكيد السيارات':'بانتظار تأكيد السيارات'}</span></header>
          <div class="bridge-editor-grid">
            <form id="bridge-assign" class="bridge-assignment-form" novalidate>
              <section class="bridge-config-pane bridge-config-type"><h3>نوع التاسك في التسويق</h3>
                <label>نوع التاسك في التسويق<select name="taskTypeId" required ${locked?'disabled':''}><option value="">اختر النوع</option>${bridge.taskTypes.map(type=>opt(type.id,type.name,taskTypeDefault)).join('')}</select></label>
                ${placementFields(bridge,current)}
                <small>كود الفكرة: ${escape(current.code)}</small></section>
              <section class="bridge-config-pane bridge-config-assignees" data-idea-code="${escape(current.code)}"><h3>المنفذون ومواعيد التسليم لكل فكرة</h3>
                <div class="bridge-assignees">${rows.map((entry,index)=>{
                  const person=assignmentPerson(bridge,entry.assignee);
                  const dateOptional=optionalAssignmentDate(person);
                  const photography=Boolean(person&&/تصوير|photograph|shoot/i.test(person.department_name));
                  return `<div class="bridge-assignee-row" data-idea="${escape(current.code)}" data-index="${index}">
                    <label>المنفذ ${index+1}<select name="assignee_${escape(current.code)}_${index}" required ${locked?'disabled':''}>
                      <option value="">اختر المنفذ</option>${bridge.executors.map(user=>opt(user.user_id+'|'+user.department_id,user.full_name,entry.assignee)).join('')}</select></label>
                    <label>موعد التسليم${dateOptional?' (اختياري)':''}<input name="dueOn_${escape(current.code)}_${index}" type="date" min="${nowInRiyadh()}" value="${escape(entry.dueOn??(dateOptional?'':nowInRiyadh()))}" ${dateOptional?'':'required'} ${locked?'disabled':''}/></label>
                    <small>${photography?'رابط ملفات Google Drive':'رفع الملفات النهائية'}</small>
                    ${index>0&&!locked?`<button type="button" class="btn p-small" data-action="bridge-remove-assignee" data-idea="${escape(current.code)}" data-index="${index}">إزالة</button>`:''}</div>`;
                }).join('')}</div>
                <button type="button" class="btn bridge-add-executor" data-action="bridge-add-assignee" data-idea="${escape(current.code)}" ${locked||rows.length>=10?'disabled':''}>+ إضافة منفذ لهذه الفكرة</button></section>
              <section class="bridge-config-pane bridge-config-formats"><h3>مقاسات ${kind==='video'?'الفيديو':'الصور'}</h3>
                <div class="bridge-format-grid">${sizes.map(dim=>`<label class="bridge-format-option"><input type="checkbox" name="format_${escape(current.code)}" value="${escape(dim.representativeId)}" ${dim.ids.some(id=>currentFormats.includes(id))?'checked':''} ${locked?'disabled':''}/><span dir="ltr">${escape(dim.width||'?')} × ${escape(dim.height||'?')} px</span></label>`).join('')||'<small>لا توجد مقاسات. حدّث المنفذين والمقاسات.</small>'}</div></section>
              <div class="bridge-editor-footer"><span>${selected.length} فكرة مختارة · ${selected.filter(idea=>taskCodes(plan,idea.code).every(code=>plan.assets.find(asset=>asset.code===code)?.creativeApprovedAt)).length} مؤكدة السيارات</span>
                <div class="bridge-footer-actions"><button type="button" class="btn bridge-pdf-options-button" data-action="bridge-pdf-options-open" ${bridge.busy?'disabled':''}>بيانات التقرير</button>
                <button type="button" class="btn bridge-pdf-export" data-action="bridge-export-pdf" ${!ready||bridge.busy||bridge.pdfExporting?'disabled':''}><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg>تصدير PDF</button>
                <button type="submit" class="btn btn-primary bridge-submit" ${!ready||!taskNameValid||bridge.busy?'disabled':''}>${'إنشاء تاسك واحد يحتوي '+selected.length+' فكرة'}</button></div></div>
            </form>
            <form id="bridge-approval" class="bridge-config-pane bridge-config-cars"><h3>تأكيد السيارات لكل فكرة</h3>
              <label>نوع اختيار السيارات<select id="bridge-mode" name="carMode" ${pending?'disabled':''}>
                ${opt('none','لا تحتاج سيارة محددة',bridge.mode)}${opt('single','سيارة واحدة أو أكثر',bridge.mode)}${opt('compare','مقارنة بين سيارتين أو أكثر',bridge.mode)}</select></label>
              ${bridge.mode!=='none'?`<label>بحث في الاستوك<input id="bridge-stock-search" type="search" value="${escape(bridge.stockSearch)}" placeholder="اسم السيارة أو الموديل"/></label>
                <div class="bridge-stock-summary">السيارات المحددة لهذه الفكرة: <strong>${bridge.chosenStocks.length}</strong></div>
                <div class="bridge-car-list" id="bridge-cars">${renderStockOptions(bridge)||'<p>لا توجد سيارات مطابقة.</p>'}</div>`:''}
              <div id="bridge-completion-hint" class="bridge-completion-hint ${ideaMissing.length?'is-missing':'is-ready'}" role="status">${ideaMissing.length?'أكمل المطلوب لتفعيل الحفظ: '+ideaMissing.map(escape).join(' · '):'اكتملت بيانات هذه الفكرة. يمكنك تأكيد السيارات الآن.'}</div>
              <button type="submit" class="btn btn-primary bridge-confirm" ${pending||bridge.busy||ideaMissing.length?'disabled':''}>${selectionCurrent?'حفظ تأكيد السيارات':'تأكيد سيارات هذه الفكرة والمتابعة'}</button>
            </form>
          </div>${assignmentPdfOptions(bridge)}`:`<div class="bridge-studio-empty"><h2>اختر فكرة معتمدة من القائمة</h2><p>حدد الفكرة من اليمين لتظهر إعدادات التكليف والسيارات والمقاسات بعرض الصفحة.</p></div>`}
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
  const missing=bridgeIdeaMissing(state,idea.code);
  if(missing.length)throw Error('أكمل البيانات المطلوبة قبل حفظ تأكيد السيارات: '+missing.join(' · '));
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
 if(!ideas.length||ideas.length>100||ideas.some(idea=>!eligible(idea)||!sameCategoryGroup(idea.marketingCategory,bridge.category)||!ideaIsApproved(plan,idea.code)))
   throw Error('اختر من 1 إلى 100 فكرة معتمدة من نفس التصنيف');
 const name=groupedName(bridge.category,ideas);
 const groups=ideas.map(idea=>({idea,assets:taskCodes(plan,idea.code).map(code=>plan.assets.find(a=>a.code===code)).filter(Boolean)}));
 if(groups.some(group=>!group.assets.length||group.assets.some(a=>!a.creativeApprovedAt)))
   throw Error('يجب تأكيد سيارات كل فكرة قبل التكليف');
 const typeId=String(form.elements.namedItem('taskTypeId')?.value||'');
 if(!bridge.taskTypes.some(t=>t.id===typeId))throw Error('اختر نوع التاسك المعتمد');
 const assignmentsByIdea={};
 for(const {idea} of groups){
   const configured=assignmentsForIdea(bridge,idea.code);
   const rows=configured.map((entry,index)=>readAssignmentRow(form,idea.code,index,entry));
   const assignments=rows.map(entry=>{
     const [userId,departmentId]=entry.assignee.split('|');
     const person=bridge.executors.find(row=>row.user_id===userId&&row.department_id===departmentId);
     if(!person)throw Error('اختر منفذًا مؤهلًا للفكرة: '+idea.title);
     if(!validAssignmentDate(person,entry.dueOn))throw Error('حدد تاريخ تسليم صحيحًا للمنفذ '+person.full_name+' في الفكرة: '+idea.title);
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
 // Strategy flow destination (agenda / campaign draft) per idea.
 const currentPlacement=readPlacementForm(form,bridge.ideaCode,null);
 if(currentPlacement)bridge.placementsByIdea[bridge.ideaCode]=currentPlacement;
 const placementsByIdea=Object.fromEntries(ideas.map(idea=>[idea.code,bridge.placementsByIdea?.[idea.code]||originalDraft?.placementsByIdea?.[idea.code]||null]));
 const placements=ideas.flatMap(idea=>{const p=placementPayload(bridge,idea,placementsByIdea[idea.code]);return p==null?[]:Array.isArray(p)?p:[p];});
 const assets=groups.flatMap(group=>group.assets);
 const pending=assets.filter(a=>a.integrationDraft?.pending===true&&a.integrationRequestKey);
 const draft={pending:true,ideaCodes:ideas.map(x=>x.code),typeId,assignmentsByIdea,formatIdsByKind:formatsByKind,formatIdsByIdea:formatsByIdea,placementsByIdea,
   name:pending.length ? (pending[0].integrationDraft?.name||name) : name};
 // إعادة المحاولة بنفس البيانات تُعيد استخدام نفس المفتاح حتى لا يتكرر التاسك على السيرفر.
 // أي تعديل على المجموعة أو المنفذين أو المواعيد = محاولة جديدة بمفتاح جديد، بدل قفل الشاشة.
 const keys=[...new Set(pending.map(a=>a.integrationRequestKey))];
 const sameRetry=pending.length>0&&keys.length===1&&pending.length===assets.length&&
   sameAssignmentDraft(pending[0].integrationDraft,draft);
 let requestKey;
 if(sameRetry){
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
 const result=await fetchBridge('assignments',{body:{requestKey,typeId,name:draft.name,source:{planId:PLAN_ID,ideaCodes:ideas.map(x=>x.code)},items,
   ...(placements.length?{placements}:{})}});
 const links=groups.flatMap(({idea,assets})=>{
   const primary=items.find(item=>item.ideaCode===idea.code&&item.deliveryMode==='files') || items.find(item=>item.ideaCode===idea.code);
   const itemId=result.items?.find(row=>row.client_key===primary?.clientKey)?.id;
   const ideaAssignees=assignmentsByIdea[idea.code];
   const names=ideaAssignees.map(row=>row.name).join('، ');
   const dueDate=ideaAssignees.find(row=>row.deliveryMode==='files'&&row.dueOn)?.dueOn||ideaAssignees.find(row=>row.dueOn)?.dueOn||'';
   return assets.map(asset=>({code:asset.code,taskId:result.id,taskNo:result.taskNo,itemId:itemId||'',executorName:names,newDueDate:dueDate,
     assignees:ideaAssignees.map(a=>({name:a.name,dueOn:a.dueOn})),
     previousMarketingTasks:asset.previousMarketingTasks||[],previousTask:asset.marketingTaskId?{
       taskId:asset.marketingTaskId,taskNo:asset.marketingTaskNo||'',itemId:asset.marketingItemId||'',
       executorName:asset.marketingExecutorName||'',linkedAt:asset.marketingLinkedAt||'',dueDate:asset.dueDate||''}:null}));
 });
 if(links.some(link=>!link.itemId))throw Error('تم إنشاء التاسك لكن ربط المطلوبات لم يكتمل؛ أعد نفس الطلب');
 await linkMarketingTask(links);
 bridge.placementsByIdea={};
 try{ bridge.planDrafts=(await fetchBridge('plan-drafts')).drafts||bridge.planDrafts; }catch{ /* list refresh is optional */ }
 for(const link of links){
   const asset=plan.assets.find(a=>a.code===link.code);
   const old=link.previousTask&&link.previousTask.taskId!==link.taskId?[link.previousTask]:[];
   const history=[...link.previousMarketingTasks,...old].slice(-30);
   Object.assign(asset,{marketingTaskId:link.taskId,marketingTaskNo:link.taskNo,marketingItemId:link.itemId,
     marketingExecutorName:link.executorName,dueDate:link.newDueDate,previousMarketingTasks:history,integrationDraft:null,integrationRequestKey:''});
 }
 return result;
}
/** Every previous task for this idea, read from Marketing's durable audit history.
 * Avoid relying only on the first slide's Firestore previousMarketingTasks. */
export async function fetchBridgeIdeaAssignments(state,code) {
  const bridge=state.bridge;
  if(bridge.historyLoading[code])return;
  bridge.historyLoading[code]=true;bridge.historyError[code]='';
  try {const answer=await fetchBridge('idea-assignments',{ideaCode:code});
    bridge.historyByIdea[code]=answer.tasks||[];
  } catch(error) {bridge.historyError[code]=String(error?.message||error);}
  finally {bridge.historyLoading[code]=false;}
}

export async function checkBridgeTask(state){
  const item=currentApproval(state).assets.find(row=>row.marketingTaskId);
  if(!item)throw Error('No linked Marketing task for this idea');
  const data=await fetchBridge('assignments',{taskId:item.marketingTaskId});
  state.bridge.remoteTasks[item.marketingTaskId]=data;
  return data;
}
