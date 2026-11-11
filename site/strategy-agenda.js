// A strategic publishing plan is an in-memory review, never a Firestore draft.
// Original Marketing products and post formats remain the sole publishing source.
import { fetchBridge, CAMPAIGN_CATEGORIES } from './marketing-bridge.js';
import { getIdea, nowInRiyadh } from './planner.js';
import { PLAN_ID } from './plan-firebase.js';

const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':"&#39;"}[c]));
const iso=x=>/^20\d\d-\d\d-\d\d$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const today=()=>nowInRiyadh();
const mediaLabel=p=>p.mediaKind==='video'?'فيديو':'صور';
const rankedCategory=(category,used,pending)=>{
 const same=used.filter(x=>x.category===category).length;
 const last=used.at(-1)?.category;
 const recent=used.slice(-3).filter(x=>x.category===category).length;
 const sales=category.startsWith('بيعي')?2:0;
 const scarcity=Math.min(2,(pending.filter(x=>x.category===category).length||0)/4);
 return sales + scarcity - same*2.5 - recent*3.5 - (last===category?5:0);
};
const dayFor=p=>[p.dueOn,p.approvedAt?new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(p.approvedAt)):''].filter(Boolean).sort().at(-1)||'';
export const strategyProducts=(state)=>{
 const plan=state.plan;
 return (state.agenda?.products||[]).filter(p=>p.sourcePlanId===PLAN_ID&&
   getIdea(plan,p.ideaCode)&&getIdea(plan,p.ideaCode)?.marketingCategory&&
   !getIdea(plan,p.ideaCode)?.retiredFromIdeaBank).map(p=>({
   ...p,category:getIdea(plan,p.ideaCode)?.marketingCategory||'',title:getIdea(plan,p.ideaCode)?.title||p.ideaName,
   availableDate:dayFor(p),alreadyPlanned:Boolean(p.scheduled?.length)
 }));
};
export function newAgendaState(){return {
 products:[],loading:false,busy:false,error:'',saved:null,entries:[],
 start:today(),days:15,mode:'strategy',search:'',platformIds:[],requestKey:'',
 name:'أجندة MZJ الاستراتيجية',reasons:[],warnings:[],generated:false
};}
export async function loadAgendaProducts(state){
 const a=state.agenda;if(a.loading)return;
 a.loading=true;a.error='';
 try{const result=await fetchBridge('agenda-products');a.products=result.products||[];}
 catch(error){a.error=error?.message||'تعذر قراءة المنتجات المعتمدة';}
 finally{a.loading=false;}
}
export function availableFormats(product){
 return (product?.formats||[]).filter(f=>f.id&&f.platformId&&
   // A selected final format is the only one guaranteed to have approved files.
   /./.test(String(f.name||'')));
}
export function defaultPlatforms(product,selectedIds=[]){
 const formats=availableFormats(product).filter(f=>!selectedIds.length||selectedIds.includes(f.platformId));
 // One post type per platform, avoiding accidental double posting.
 const unique=new Map();
 for(const format of formats)if(!unique.has(format.platformId))
   unique.set(format.platformId,{platformId:format.platformId,postTypes:[{postTypeId:format.id,budget:0}]});
 return [...unique.values()];
}
export function buildStrategicAgenda(state){
 const a=state.agenda;
 if(!iso(a.start)||a.start<today())throw Error('حدد تاريخ بداية صحيحًا من اليوم أو بعده');
 const days=Number(a.days);
 if(!Number.isInteger(days)||days<1||days>90)throw Error('مدة الجدول من يوم إلى 90 يوم');
 const products=strategyProducts(state);
 const eligible=products.filter(p=>!p.alreadyPlanned&&availableFormats(p).length>0);
 const excluded=products.length-eligible.length;
 const end=addDays(a.start,days-1),entries=[],used=[],pending=[...eligible];
 const categories=CAMPAIGN_CATEGORIES;
 for(let offset=0;offset<days&&pending.length;offset++){
   const date=addDays(a.start,offset);
   const ready=pending.filter(p=>p.availableDate<=date&&
      defaultPlatforms(p,a.platformIds).length>0);
   if(!ready.length)continue;
   ready.sort((x,y)=>{
     const cx=rankedCategory(x.category,used,pending),cy=rankedCategory(y.category,used,pending);
     if(cy!==cx)return cy-cx;
     return (x.approvedAt||'').localeCompare(y.approvedAt||'') ||
       x.availableDate.localeCompare(y.availableDate) || x.ideaCode.localeCompare(y.ideaCode);
   });
   const pick=ready[0],index=pending.indexOf(pick);pending.splice(index,1);
   const cause=pick.category.startsWith('بيعي')?'دعم هدف الاستفسارات المؤهلة والمبيعات':'تنويع رحلة العميل وبناء الثقة';
   const reason=cause+'؛ المنتج معتمد ومقاساته متوافقة، وتم تجنّب تكرار التصنيف قريبًا.';
   entries.push({ideaCode:pick.ideaCode,productId:pick.productId,date,
     category:pick.category,reason,platforms:defaultPlatforms(pick,a.platformIds)});
   used.push({category:pick.category});
 }
 const warnings=[];
 if(excluded)warnings.push(excluded+' منتج مستبعد لأنه مجدول مسبقًا أو بدون مقاس نهائي متاح.');
 if(entries.length<days)warnings.push('يوجد '+(days-entries.length)+' يومًا بلا منتج جاهز؛ لن تُملأ بأفكار غير معتمدة.');
 if(!entries.some(x=>x.category==='بيعي - قسط'))
   warnings.push('لا يوجد منتج تمويلي جاهز في هذه الفترة؛ يلزم إنتاج محتوى «بيعي - قسط» بدل تكرار منتج.');
 if(!entries.some(x=>x.category==='بيعي - كاش'))
   warnings.push('لا يوجد منتج كاش جاهز في هذه الفترة.');
 if(pending.length)warnings.push(pending.length+' منتج معتمد خارج الفترة أو لم تسمح جاهزيته وتوازن الجدول بإدراجه.');
 a.entries=entries;a.warnings=warnings;a.generated=true;a.saved=null;a.requestKey='';
 return {entries,warnings,start:a.start,end};
}
export function validateStrategyAgenda(state){
 const a=state.agenda,products=strategyProducts(state);
 if(!a.generated||!a.entries.length)throw Error('ابنِ الجدول أو أضف منتجات جاهزة أولًا');
 const end=addDays(a.start,Number(a.days)-1),seen=new Set();
 for(const line of a.entries){
   const p=products.find(x=>x.productId===line.productId);
   if(!p||p.alreadyPlanned)throw Error('هذا المنتج لم يعد متاحًا: '+(p?.title||line.productId));
   if(p.ideaCode!==line.ideaCode)throw Error('رابط الفكرة والمنتج غير مطابق');
   if(seen.has(line.productId))throw Error('لا يمكن جدولة المنتج مرتين في نفس الأجندة');
   seen.add(line.productId);
   if(!iso(line.date)||line.date<a.start||line.date>end||line.date<p.availableDate)
     throw Error('موعد النشر خارج المدة أو يسبق جاهزية '+p.title);
   if(!line.platforms?.length)throw Error('اختر منصة للمنتج '+p.title);
   const seenPlatforms=new Set();
   for(const platform of line.platforms){
     if(seenPlatforms.has(platform.platformId))throw Error('منصة مكررة: '+p.title);
     seenPlatforms.add(platform.platformId);
     if(!platform.postTypes?.length)throw Error('نوع النشر غير محدد للمنتج '+p.title);
     for(const post of platform.postTypes)if(!availableFormats(p).some(f=>f.platformId===platform.platformId&&f.id===post.postTypeId))
       throw Error('نوع نشر لا يطابق ملفات المنتج '+p.title);
   }
 }
 if(new Set(a.entries.map(row=>row.date)).size!==a.entries.length)
   throw Error('هذه النسخة تخصص منشورًا واحدًا لكل يوم؛ انقل المنتج المتكرر إلى يوم آخر.');
 return {agendaFrom:a.start,agendaTo:end,entries:a.entries};
}
export async function saveStrategyAgenda(state){
 const a=state.agenda,validated=validateStrategyAgenda(state);
 if(a.busy)throw Error('جاري إنشاء الأجندة');
 a.busy=true;a.error='';
 try{
   if(!a.requestKey)a.requestKey=crypto.randomUUID();
   const result=await fetchBridge('agenda',{body:{
     requestKey:a.requestKey,sourcePlanId:PLAN_ID,
     name:a.name.trim().slice(0,250)||'أجندة MZJ الاستراتيجية',
     agendaFrom:validated.agendaFrom,agendaTo:validated.agendaTo,
     entries:validated.entries.map(x=>({
       ideaCode:x.ideaCode,productId:x.productId,date:x.date,
       platforms:x.platforms
     }))
   }});
   a.saved={id:result.id,planNo:result.planNo,reviewStatus:result.reviewStatus};
   a.generated=false;await loadAgendaProducts(state);
   return result;
 }catch(error){a.error=error?.message||'تعذر إنشاء الأجندة';throw error;}
 finally{a.busy=false;}
}
export function strategyAgendaPage(state){
 const a=state.agenda,products=strategyProducts(state),selectable=products.filter(p=>!p.alreadyPlanned);
 const end=iso(a.start)?addDays(a.start,Number(a.days)-1):'';
 const days=[15,28,30].map(n=>`<option value="${n}" ${Number(a.days)===n?'selected':''}>${n} يومًا</option>`).join('');
 const options=[...new Map(products.flatMap(p=>availableFormats(p)).map(f=>[f.platformId,{id:f.platformId,name:f.platformName}])).values()];
 const selected=new Set(a.platformIds);
 const dateLabel=s=>s?new Intl.DateTimeFormat('ar-SA-u-nu-latn',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(s+'T12:00:00Z')):'—';
 const productTable=products.filter(p=>[p.title,p.category,p.assigneeName].join(' ').toLowerCase().includes(a.search.toLowerCase()))
 .map(p=>`<tr><td><strong>${e(p.title)}</strong><small>${e(p.taskNo)}</small></td>
 <td>${e(p.category)}</td><td>${e(mediaLabel(p))}</td>
 <td>${availableFormats(p).map(f=>`<div>${e(f.platformName)} · ${e(f.name)} (${e(f.width||'?')}×${e(f.height||'?')})</div>`).join('')}</td>
 <td>${e(p.dueOn)}</td><td>${e(p.approvedAt?dateLabel(String(p.approvedAt).slice(0,10)):'—')}</td>
 <td>${e(p.assigneeName||'—')}</td><td>${p.alreadyPlanned?'مجدول سابقًا':'جاهز للجدولة'}</td></tr>`).join('');
 const rows=a.entries.map((line,index)=>{
   const p=products.find(product=>product.productId===line.productId);
   if(!p)return '';
   const validFormats=availableFormats(p);
   const selectedType=line.platforms.flatMap(platform=>platform.postTypes.map(type=>type.postTypeId));
   const formats=validFormats.map(f=>`<label class="agenda-format-chip"><input type="checkbox" name="agenda-format-${index}" value="${e(f.id)}" ${selectedType.includes(f.id)?'checked':''}/>${e(f.platformName)} · ${e(f.name)}</label>`).join('');
   return `<tr><td><strong>${e(p.title)}</strong><small>${e(line.category)}</small></td>
   <td><input type="date" name="agenda-date-${index}" min="${e(a.start)}" max="${e(end)}" value="${e(line.date)}"/></td>
   <td><div class="agenda-format-options">${formats}</div></td>
   <td><small>${e(line.reason)}</small></td>
   <td><button class="btn p-small" data-action="agenda-remove-entry" data-index="${index}">استبعاد</button></td></tr>`;
 }).join('');
 return `<div class="page-header"><div><div class="page-eyebrow">MZJ · استراتيجية المحتوى</div>
 <h1 class="page-title">جدول النشر الاستراتيجي</h1>
 <p class="page-description">منتجات نهائية معتمدة فقط، توزيع يراعي المبيعات ورحلة العميل والجاهزية. لا توجد مسودات نشر.</p></div>
 <button class="btn" data-action="agenda-reload" ${a.loading?'disabled':''}>تحديث المنتجات من التسويق</button></div>
 ${a.error?`<div class="notice warning" role="alert">${e(a.error)}</div>`:''}
 ${a.saved?`<div class="notice good"><strong>تم إنشاء الأجندة ${e(a.saved.planNo||a.saved.id)}</strong> وإرسالها لمراجعة التسويق. الحالة: ${e(a.saved.reviewStatus)}.
 <a href="https://mzj-platform.vercel.app/marketing?plan=${encodeURIComponent(a.saved.id)}" target="_blank" rel="noopener noreferrer">فتح الأجندة في التسويق</a></div>`:''}
 <section class="card panel agenda-strategy-panel"><h2>1 — المنتجات النهائية المعتمدة</h2>
 <p class="p-help">تظهر الملفات النهائية بعد اعتماد التسويق فقط. التصنيف من استراتيجية المحتوى، واسم المنفذ وتاريخ الاعتماد والتسليم من سجل المنتج.</p>
 <div class="agenda-kpis"><div><strong>${products.length}</strong><span>منتجات معتمدة</span></div><div><strong>${selectable.length}</strong><span>متاحة للجدولة</span></div><div><strong>${products.length-selectable.length}</strong><span>مجدولة مسبقًا</span></div></div>
 <label class="agenda-search">البحث في المنتجات<input type="search" id="agenda-product-search" value="${e(a.search)}" placeholder="اسم الفكرة أو التصنيف أو المنفذ"/></label>
 <div class="agenda-table-scroll"><table class="agenda-table"><thead><tr><th>اسم الفكرة</th><th>التصنيف</th><th>النوع</th><th>المقاسات المعتمدة</th><th>التسليم</th><th>اعتماد المنتج</th><th>المنفذ</th><th>الجدولة</th></tr></thead><tbody>
 ${productTable||'<tr><td colspan="8">لا توجد منتجات نهائية معتمدة مرتبطة بالاستراتيجية بعد.</td></tr>'}</tbody></table></div></section>
 <section class="card panel agenda-strategy-panel"><h2>2 — بناء الجدول حسب الاستراتيجية</h2>
 <div class="agenda-settings"><label>اسم الأجندة<input id="agenda-name" maxlength="250" value="${e(a.name)}"/></label>
 <label>بداية النشر<input id="agenda-start" type="date" min="${today()}" value="${e(a.start)}"/></label>
 <label>الفترة<select id="agenda-days">${days}</select></label></div>
 <p class="p-help">التوزيع: أولوية المبيعات، التنوع بين التصنيفات، جاهزية كل منتج، تفادي تكرار المنتج والتصنيف، وتوافق المقاسات. لا توجد نسب غير معتمدة.</p>
 <div class="agenda-platforms">${options.map(p=>`<label><input type="checkbox" name="agenda-platform" value="${e(p.id)}" ${!selected.size||selected.has(p.id)?'checked':''}/> ${e(p.name)}</label>`).join('')||'تظهر المنصات بعد توفر المنتجات المعتمدة.'}</div>
 <button class="btn btn-primary" data-action="agenda-build" ${a.loading?'disabled':''}>بناء جدول حسب الاستراتيجية</button>
 ${a.warnings.length?`<div class="notice warning">${a.warnings.map(x=>`<p>${e(x)}</p>`).join('')}</div>`:''}
 </section>
 ${a.generated?`<section class="card panel agenda-strategy-panel"><h2>3 — مراجعة الجدول قبل إنشاء الأجندة</h2>
 <p class="p-help">غيّر التاريخ والمقاسات والمنصة أو استبعد منتجًا. لن تُكتب بيانات في التسويق إلا عند الضغط على إنشاء الأجندة.</p>
 <div class="agenda-table-scroll"><table class="agenda-table agenda-review-table"><thead><tr><th>المنتج والتصنيف</th><th>تاريخ النشر</th><th>المنصات وأنواع النشر</th><th>سبب الاختيار</th><th>إجراء</th></tr></thead><tbody>
 ${rows||'<tr><td colspan="5">لا توجد منتجات جاهزة في هذه الفترة.</td></tr>'}</tbody></table></div>
 <div class="agenda-review-actions"><button class="btn" data-action="agenda-check">فحص الجدول والتعارضات</button>
 <button class="btn btn-primary" data-action="agenda-create" ${a.busy||!a.entries.length?'disabled':''}>اعتماد الجدول وإنشاء أجندة فعلية في التسويق</button></div>
 </section>`:''}`;
}
