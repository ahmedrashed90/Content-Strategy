/**
 * Presentation-only regression and offline screenshots of the eight MZJ workspace pages.
 * No Firebase or Marketing API calls are made. Fixture changes are in memory only.
 * Run: node scripts/qa-ui-refresh.mjs [optional /absolute/snapshot/path]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ideasPage, archivePage, planPage, tasksPage } from '../site/planner.js';
import { bridgePage, newBridgeState } from '../site/marketing-bridge.js';
import { inspirationsPage, newInspirationState } from '../site/inspirations.js';
import { strategyAgendaPage, newAgendaState } from '../site/strategy-agenda.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json'),'utf8'));
const sample=[...plan.assets.filter(a=>a.kind!=='carousel_slide')];
for(const item of sample.slice(0,8)){item.reviewStatus='معتمد';item.marketingCategory='تعريفي - مواصفات السيارات';}
for(const asset of plan.assets.filter(a=>a.kind==='carousel_slide').slice(0,4)) asset.reviewStatus='معتمد';
const inspiration=newInspirationState();
const agenda=newAgendaState();
const bridge=newBridgeState();
const selected=sample.find(a=>a.reviewStatus==='معتمد' && a.marketingCategory);
if(selected){bridge.selectedCodes=[selected.code];bridge.ideaCode=selected.code;bridge.category=selected.marketingCategory;}
bridge.executors=[{user_id:'1',department_id:'2',full_name:'محمود',department_name:'قسم المونتاج'}];
bridge.taskTypes=[{id:'type',name:'تعريف'}];
bridge.formats=[{id:'reel',name:'ريلز',width:1080,height:1920,platform_name:'إنستجرام',mediaKinds:['video']}];
bridge.stock=[{car_name:'هيونداي توسان',statement:'كومفورت',model_year:'2026',exterior_color:'أبيض',interior_color:'أسود'},{car_name:'إم جي 5',statement:'ستاندرد',model_year:'2026',exterior_color:'أسود',interior_color:'أسود'}];
const state={plan,bridge,inspirations:inspiration,agenda,taskPerson:'الكل',taskWeek:0,
  ideaKind:'all',ideaCategoryFilter:'all',ideaReviewFilter:'all',ideaSearch:'',archiveSearch:'',
  planFilter:'',calendarMonth:'2026-12',calendarSelectedDate:'2026-12-07',calendarExecutor:'all',calendarPlatform:'all',calendarMedia:'all',calendarStatus:'all'};
const views={ideas:ideasPage(state),bridge:bridgePage(state),inspirations:inspirationsPage(state),archive:archivePage(state),
 plan:planPage(state),proposals:strategyAgendaPage(state),tasks:tasksPage(state)};
assert(!views.ideas.includes('بنك الأفكار ومراجعتها'));
assert(!views.ideas.includes('مسار العمل المعتمد'));
assert(views.ideas.includes('استيراد أو استبدال JSON'));
assert(!views.ideas.includes('>نموذج JSON<'));
assert(!views.ideas.includes('data-nav="archive"'));
assert(!views.archive.includes('رجوع لبنك الأفكار'));
assert(!views.archive.includes('الأفكار المرفوضة محفوظة'));
assert(views.plan.includes('data-action="calendar-new-post"'));
assert(!views.plan.includes('>استيراد أفكار JSON<'));
assert(!views.plan.includes('>تصدير نسخة JSON<'));
assert(!views.plan.includes('>تقويم النشر والتنشيط</h1>'));
assert(views.proposals.includes('تحديث المنتجات من التسويق'));
assert(!views.proposals.includes('منتجات نهائية معتمدة فقط، توزيع يراعي'));
assert(views.tasks.includes('delivery-list')&&!views.tasks.includes('delivery-timeline'));
assert(views.tasks.includes('data-action="download-handoff"'));
assert(views.bridge.includes('bridge-studio-layout'));
assert(views.bridge.includes('id="bridge-mode"') && views.bridge.includes('bridge-editor-grid'));
assert(views.bridge.includes('id="bridge-approval"'));
assert(views.bridge.includes('id="bridge-assign"'));
assert(selected && views.bridge.includes(`name="dueOn_${selected.code}_0"`));
assert(views.ideas.includes('data-action="manual-open"'));
assert(!views.bridge.includes('إرسال للمراجعة'));
assert(!views.bridge.includes('حفظ كمسودة'));
assert(!views.bridge.includes('إنشاء تاسك من الأفكار المعتمدة'));
assert(views.inspirations.includes('بحث عن الأفكار'));
assert(!views.inspirations.includes('>لا توجد مصادر إلهام بعد<'));
assert(!views.inspirations.includes('آلية العمل'));
// The single inline preview uses the app's original navigation renderer, no fabricated UI actions.
const listeners={};
const target={innerHTML:'',addEventListener:(ev,fn)=>{listeners[ev]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
const toast={textContent:'',classList:{add(){},remove(){}}};
globalThis.__MZJ_PREVIEW_DATA__=JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-baseline-2026-v2.json'),'utf8'));
globalThis.__MZJ_PREVIEW_PLAN__=plan;
globalThis.document={title:'',getElementById:id=>id==='app'?target:toast,createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
globalThis.window={location:{hostname:'localhost',search:'?preview=1'},addEventListener(){},scrollTo(){},clearTimeout(){},setTimeout(){}};
await import('../site/app.js');
const overview=target.innerHTML;
assert(!overview.includes('من فكرة قوية إلى تاسك جاهز للتنفيذ'));
assert(!overview.includes('مرجع أداء المنصات قبل الاستراتيجية'));
assert(!overview.includes('منظومة استراتيجية المحتوى المستقلة · الإنتاج والنشر 1.6'));
const navOrder=[...overview.matchAll(/<button class="nav-btn[^>]*data-nav="([^"]+)"/g)].map(x=>x[1]).slice(0,8);
assert.deepEqual(navOrder,['overview','ideas','bridge','inspirations','archive','plan','proposals','tasks']);
assert(overview.includes('>الداش بورد</span>'));
assert(overview.includes('>الأفكار</span>'));
assert(overview.includes('>الأفكار الجديدة</span>'));
console.log('PASS: eight page UI expectations, menu order and naming, only existing business actions.');
if(process.argv[2]){
 const dir=path.resolve(process.argv[2]);fs.mkdirSync(dir,{recursive:true});
 const template=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'site/theme.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'site/styles.css'),'utf8');
 const sidebar=overview.match(/<aside class="sidebar[\s\S]*?<\/aside>/)?.[0];
 const topbar=overview.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0];
 assert(sidebar&&topbar);
 const pages=[['01_dashboard','overview',overview.match(/<div class="content">([\s\S]*?)<\/div><\/div><\/div>$/)?.[1]],
  ['02_ideas','ideas',views.ideas],['03_tasks','bridge',views.bridge],['04_new','inspirations',views.inspirations],
  ['05_archive','archive',views.archive],['06_calendar','plan',views.plan],['07_strategic','proposals',views.proposals],['08_deliveries','tasks',views.tasks]];
 for(const [filename,id,body] of pages){
  assert(body!==undefined,filename);
  const menu=sidebar.replace(/class="nav-btn active"/g,'class="nav-btn"').replace(/aria-current="page"/g,'').replace(new RegExp(`class="nav-btn\\s*" data-nav="${id}"`),`class="nav-btn active" data-nav="${id}" aria-current="page"`);
  const pageNames={overview:'الداش بورد',ideas:'الأفكار',bridge:'إنشاء التكليفات',inspirations:'الأفكار الجديدة',archive:'أرشيف الأفكار',plan:'تقويم النشر والتنشيط',proposals:'جدول النشر الاستراتيجي',tasks:'التسليمات والإنتاج'};
  const currentTopbar=topbar.replace('<b>الداش بورد</b>',`<b>${pageNames[id]}</b>`);
  const doc=template.replace('<link rel="stylesheet" href="./styles.css" />',`<style>${css}</style>` )
   .replace('<div id="app"></div>',`<div id="app"><div class="shell">${menu}<div class="main">${currentTopbar}<div class="content">${body}</div></div></div></div>`)
   .replace('<script type="module" src="./app.js"></script>','');
  fs.writeFileSync(path.join(dir,filename+'.html'),doc);
 }
 console.log('Generated actual-template offline previews in',dir);
}
