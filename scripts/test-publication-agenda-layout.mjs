/** Isolated UI smoke test; synthetic publishing entries only, no browser or production API. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../site/publication.js',import.meta.url),'utf8')
  .replace("import { connectFirebase } from './firebase.js';",'const connectFirebase=async()=>({auth:{currentUser:null}});');
const {newPublicationState,publicationPage,closePublicationAgenda}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const agendaId='00000000-0000-4000-8000-000000000001';
const state=newPublicationState();
state.loadState='ready';
state.agendas=[
 {id:agendaId,agenda:{name:'أجندة شهر 12',publishFrom:'2026-12-01',publishTo:'2026-12-31'},totals:{posts:30,ready:18,waiting:12,incomplete:0},syncedAt:'2026-11-20T19:00:00Z'},
 {id:'00000000-0000-4000-8000-000000000002',agenda:{name:'أجندة شهر 11',publishFrom:'2026-11-01',publishTo:'2026-11-30'},totals:{posts:107,ready:94,waiting:13,incomplete:0}}
];
const landing=publicationPage(state);
assert.match(landing,/الأجندات الشهرية/);
assert.match(landing,/أجندة شهر 12/);
assert.match(landing,/أجندة شهر 11/);
assert.match(landing,/data-action="pub-open-agenda"/);
assert.doesNotMatch(landing,/class="pub-table"/,'landing page must not dump every agenda row');
const file1={id:'00000000-0000-4000-8000-000000000070',name:'مربع-نهائي.png',mimeType:'image/png'};
const file2={id:'00000000-0000-4000-8000-000000000071',name:'مربع-نهائي-2.png',mimeType:'image/png'};
const rows=[
 {id:'ready',requestNo:'TSK-000084-01',ideaName:'صورة تعريفية',mediaKind:'image',scheduledOn:'2026-12-01',platform:{name:'Instagram'},postType:{name:'Post',width:1080,height:1350},caption:'كابشن كامل',hashtags:'#MZJ',fileStatus:'ready',files:[file1]},
 {id:'multi',requestNo:'TSK-000084-02',ideaName:'كاروسيل صور',mediaKind:'image',scheduledOn:'2026-12-02',platform:{name:'Instagram'},postType:{name:'Carousel',width:1080,height:1080},fileStatus:'ready',files:[file1,file2]},
 {id:'pending',requestNo:'TSK-000084-03',ideaName:'مقاس ناقص اعتماد',mediaKind:'image',scheduledOn:'2026-12-03',platform:{name:'Snapchat'},postType:{name:'Story',width:1080,height:1920},fileStatus:'waiting_file',fileNote:'الملف النهائي مرفوع لهذا المقاس، لكنه لم يحصل على اعتماد المقاس بعد.',files:[]},
];
state.agendaView='detail';state.agendaId=agendaId;state.detail={agenda:state.agendas[0].agenda,entries:rows,totals:{posts:3,ready:2,waiting:1,incomplete:0}};
const detail=publicationPage(state);
assert.match(detail,/data-action="pub-back"/);
assert.match(detail,/class="pub-table"/);
assert.match(detail,/الملف النهائي مرفوع لهذا المقاس/);
assert.match(detail,/بانتظار الاعتماد/);
assert.match(detail,/class="pub-file-compact"/);
assert.match(detail,/data-action="pub-files-open"/);
assert.doesNotMatch(detail,/الملف النهائي الفعلي<\/th>/,'large old column title removed');
state.fileListEntryId='multi';const withModal=publicationPage(state);
assert.match(withModal,/class="pub-files-list"/);
assert.match(withModal,/مربع-نهائي-2.png/);
closePublicationAgenda(state);
assert.equal(state.agendaView,'list');assert.equal(state.agendaId,'');assert.equal(state.detail,null);
assert.match(publicationPage(state),/الأجندات الشهرية/);
console.log('PASS: agenda landing, individual detail, compact files, separate review issue, multi-file modal, return to agenda list');
