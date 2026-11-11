import fs from 'node:fs';
import {readFileSync,writeFileSync} from 'node:fs';
import {archivePage,assetDetailPage,tasksPage,planPage} from '../site/planner.js';
const root=new URL('../',import.meta.url);
const plan=JSON.parse(readFileSync(new URL('data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json',root),'utf8'));
const asset=plan.assets.find(a=>a.code==='I01');
asset.reviewStatus='معتمد';asset.marketingTaskId='demo-only-task';asset.marketingTaskNo='TSK-DEMO';asset.integrationRequestKey='demo-request';
asset.marketingExecutorName='محمود';asset.reviewHistory=[{status:'معتمد',at:'2026-11-10T01:00:00Z'}];
const refused=plan.assets.find(a=>a.code==='I02');refused.reviewStatus='مرفوض';
const state={plan,planStatus:'preview',selectedAssetCode:'I01',briefReturnView:'ideas',taskPerson:'الكل',taskWeek:0,archiveSearch:'',planFilter:'',calendarMonth:'2026-12',calendarSelectedDate:'2026-12-07',calendarPlatform:'all',calendarExecutor:'all',calendarMedia:'all',calendarStatus:'all',planSaving:false};
const template=readFileSync(new URL('site/index.html',root),'utf8');
const css=readFileSync(new URL('site/styles.css',root),'utf8');
const layout=html=>template.replace('<div id="app"></div>',`<div id="app"><div class="shell"><div class="main" style="margin-right:0"><main class="content">${html}</main></div></div></div>`)
.replace('<script type="module" src="./app.js"></script>','').replace('<link rel="stylesheet" href="./styles.css" />',`<style>${css}</style>`);
const output={
 'qa/v16-brief-with-back.html':assetDetailPage(state),
 'qa/v16-deliveries.html':tasksPage(state),
 'qa/v16-archive.html':archivePage(state),
 'qa/v16-calendar.html':planPage(state)
};
for(const [path,html] of Object.entries(output))writeFileSync(new URL(path,root),layout(html));
console.log('PASS: v1.6 preview pages generated without live data.');
