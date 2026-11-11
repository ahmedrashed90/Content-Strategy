import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareIdeaBatch } from '../site/idea-import.js';
import { newAgendaState, buildStrategicAgenda, validateStrategyAgenda, strategyProducts, strategyAgendaPage } from '../site/strategy-agenda.js';
import { PLAN_ID } from '../site/plan-firebase.js';
const json=JSON.parse(await readFile(new URL('../data/MZJ-72-IDEAS-FULL-CORRECTED-IMPORT-20261111.json',import.meta.url),'utf8'));
const imported=prepareIdeaBatch(json,{assets:[],carousels:[]},{replace:true}).items;
const selected=[
  imported.find(x=>x.marketingCategory==='بيعي - قسط'),
  imported.find(x=>x.marketingCategory==='بيعي - كاش'),
  imported.find(x=>x.marketingCategory==='تعريفي - بالبراند'),
  imported.find(x=>x.marketingCategory==='تعريفي - مواصفات السيارات')
];
assert(selected.every(Boolean));
const state={plan:{assets:imported,carousels:[],posts:[]},agenda:newAgendaState()};
const start='2099-11-15';state.agenda.start=start;state.agenda.days=15;state.agenda.platformIds=['platform-1'];
state.agenda.products=selected.map((idea,index)=>({
  productId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  sourcePlanId:PLAN_ID,ideaCode:idea.code,
  ideaName:idea.title,assigneeName:'منفذ الاختبار',approvedAt:'2099-11-14T12:00:00Z',
  dueOn:'2099-11-14',taskNo:'TST-001',mediaKind:idea.kind,
  formats:[{id:`fmt-${index}`,platformId:'platform-1',platformName:'إنستغرام',name:'Post',width:1080,height:1080}],
  scheduled:[]
}));
assert.equal(strategyProducts(state).length,4);
const built=buildStrategicAgenda(state);
assert.equal(built.entries.length,4);
assert.equal(new Set(built.entries.map(row=>row.productId)).size,4);
assert.equal(new Set(built.entries.map(row=>row.date)).size,4);
assert(built.warnings.some(warning=>warning.includes('11 يومًا')));
const checked=validateStrategyAgenda(state);
assert.equal(checked.agendaFrom,start);
assert.equal(checked.entries.length,4);
const markup=strategyAgendaPage(state);
for(const column of ['اسم الفكرة','التصنيف','النوع','المقاسات المعتمدة','التسليم','اعتماد المنتج','المنفذ'])
  assert(markup.includes(column),'Missing product-table column: '+column);
assert(markup.includes('اعتماد الجدول وإنشاء أجندة فعلية في التسويق'));
assert(!markup.includes('حفظ مسودة'));
state.agenda.entries[0].date='2099-11-14';
assert.throws(()=>validateStrategyAgenda(state),/موعد النشر/);
state.agenda.entries[0].date=built.entries[1].date;
assert.throws(()=>validateStrategyAgenda(state),/منشورًا واحدًا/);
state.agenda.entries=[];
assert.throws(()=>validateStrategyAgenda(state),/أضف منتجات/);
console.log('PASS: approved products, strategy sequencing, 7 audit columns, no drafts, schedule edits and conflicts');
