/** Dedicated publishing-page UI regression tests; offline synthetic rows only. */
import assert from 'node:assert/strict';
import {newPublicationState,publicationPage,closePublicationAgenda} from '../site/publication.js';
const agendaId='00000000-0000-4000-8000-000000000001';
const state=newPublicationState();
state.loadState='ready';
state.agendas=[
 {id:agendaId,agenda:{name:'أجندة شهر 12',publishFrom:'2026-12-01',publishTo:'2026-12-31'},totals:{posts:30,ready:18,waiting:12,incomplete:0},syncedAt:'2026-11-20T19:00:00Z'},
 {id:'00000000-0000-4000-8000-000000000002',agenda:{name:'أجندة شهر 11',publishFrom:'2026-11-01',publishTo:'2026-11-30'},totals:{posts:107,ready:94,waiting:13,incomplete:0}},
];
const landing=publicationPage(state);
assert.match(landing,/class="pub-agendas-table"/);
assert.match(landing,/أجندة شهر 12/);
assert.match(landing,/أجندة شهر 11/);
assert.match(landing,/data-action="pub-open-agenda"/);
assert.doesNotMatch(landing,/pub-agenda-card|page-title|محتوى النشر المستلم من سيستم التسويق/);
const file1={id:'00000000-0000-4000-8000-000000000070',name:'مربع-نهائي.png',mimeType:'image/png',width:1080,height:1350};
const file2={id:'00000000-0000-4000-8000-000000000071',name:'مربع-نهائي-2.png',mimeType:'image/png',width:1080,height:1350};
const productId='00000000-0000-4000-8000-000000000020';
const rows=[
 {id:'ready',productId,requestNo:'TSK-000084-01',ideaName:'فكرة سيارة جديدة',taskName:'تعريفي',requirementNumber:1,mediaKind:'image',scheduledOn:'2026-12-01',platform:{name:'Instagram'},postType:{name:'Post',width:1080,height:1350},caption:'كابشن كامل',hashtags:'#MZJ',fileStatus:'ready',files:[file1]},
 {id:'multi',productId,requestNo:'TSK-000084-01',ideaName:'فكرة سيارة جديدة',mediaKind:'image',scheduledOn:'2026-12-01',platform:{name:'Facebook'},postType:{name:'Post',width:1080,height:1350},fileStatus:'ready',files:[file1,file2]},
 {id:'mismatch',productId,requestNo:'TSK-000084-01',ideaName:'فكرة سيارة جديدة',mediaKind:'image',scheduledOn:'2026-12-01',platform:{name:'Snapchat'},postType:{name:'Story',width:1920,height:1080},fileStatus:'waiting_file',fileNote:'لم يتم العثور على ملف نهائي مرفوع لهذا المطلوب.',files:[]},
 {id:'pending',productId:'00000000-0000-4000-8000-000000000021',requestNo:'TSK-000084-02',ideaName:'فكرة ثانية',mediaKind:'image',scheduledOn:'2026-12-02',platform:{name:'Snapchat'},postType:{name:'Story',width:1080,height:1920},fileStatus:'waiting_file',fileNote:'الملف النهائي مرفوع لهذا المقاس، لكنه لم يحصل على اعتماد المقاس بعد.',files:[]},
];
state.agendaView='detail';state.agendaId=agendaId;
state.detail={agenda:state.agendas[0].agenda,entries:rows,totals:{posts:4,ready:2,waiting:2,incomplete:0}};
const detail=publicationPage(state);
assert.match(detail,/data-action="pub-back"/);
assert.match(detail,/>اسم الفكرة</);
assert.match(detail,/فكرة سيارة جديدة/);
assert.match(detail,/فكرة ثانية/);
assert.equal((detail.match(/class="pub-day-row"/g)||[]).length,2,'one outer table row per calendar day');
assert.equal((detail.match(/class="pub-day-post"/g)||[]).length,4,'all platform posts remain present');
assert.match(detail,/مقاس غير مطابق|المقاس المطلوب غير متاح/);
assert.match(detail,/بانتظار اعتماد المقاس/);
assert.match(detail,/class="pub-file-compact"/);
assert.match(detail,/data-action="pub-files-open"/);
assert.match(detail,/data-action="pub-refresh"/);
assert.match(detail,/data-action="pub-reload"/);
assert.doesNotMatch(detail,/pub-agenda-panel|pub-kpi|page-title|محتوى النشر المستلم من سيستم التسويق/);
state.platform='Snapchat';
const snapFiltered=publicationPage(state);
assert.equal((snapFiltered.match(/class="pub-day-post"/g)||[]).length,2);
assert.equal((snapFiltered.match(/class="pub-day-row"/g)||[]).length,2);
state.platform='all';state.search='فكرة ثانية';
const searchFiltered=publicationPage(state);
assert.equal((searchFiltered.match(/class="pub-day-row"/g)||[]).length,1);
assert.match(searchFiltered,/فكرة ثانية/);
state.search='';state.fileListEntryId='multi';
const withModal=publicationPage(state);
assert.match(withModal,/class="pub-files-list"/);
assert.match(withModal,/مربع-نهائي-2.png/);
closePublicationAgenda(state);
assert.equal(state.agendaView,'list');assert.equal(state.agendaId,'');assert.equal(state.detail,null);
assert.match(publicationPage(state),/class="pub-agendas-table"/);
console.log('PASS: agenda list, one outer row/day, visible idea names, status diagnostics, compact files, filters, modal and return');
