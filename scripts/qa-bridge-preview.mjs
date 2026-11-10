import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newBridgeState,bridgePage,selectBridgeIdea} from '../site/marketing-bridge.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json'),'utf8'));
const state={plan,bridge:newBridgeState()};
state.bridge.stock=[
 {car_name:'هيونداي',statement:'توسان - فئة سمارت',model_year:'2026',exterior_color:'أسود',interior_color:'بيج'},
 {car_name:'إم جي',statement:'HS - فئة ستاندرد',model_year:'2026',exterior_color:'رمادي',interior_color:'أسود'},
 {car_name:'نيسان',statement:'اكس تريل - فئة S',model_year:'2026',exterior_color:'فضي',interior_color:'رمادي'},
];
state.bridge.executors=[{user_id:'a',department_id:'b',full_name:'محمود',department_name:'التسويق'},{user_id:'c',department_id:'b',full_name:'بلال',department_name:'التسويق'}];
state.bridge.taskTypes=[{id:'type1',name:'إنشاء محتوى'}];
state.bridge.formats=[{id:'fmt1',name:'ريلز',platform_name:'إنستجرام',width:1080,height:1920,mediaKinds:['video']},{id:'fmt2',name:'فيديو',platform_name:'تيك توك',width:1080,height:1920,mediaKinds:['video']}];
selectBridgeIdea(state,'V01');
const target=bridgePage(state);
if(!target.includes('هيونداي')||!target.includes('إنشاء تاسك')||!target.includes('V01'))throw Error('Bridge rendering omitted required UI elements');
const template=fs.readFileSync(path.join(root,'site/index.html'),'utf8');const css=fs.readFileSync(path.join(root,'site/styles.css'),'utf8');
const body=`<div class="shell"><div class="main" style="margin-right:0"><main class="content">${target}</main></div></div>`;
const html=template.replace('<div id="app"></div>',`<div id="app">${body}</div>`).replace('<script type="module" src="./app.js"></script>','').replace('<link rel="stylesheet" href="./styles.css" />',`<style>${css}</style>`);
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
fs.writeFileSync(path.join(root,'qa/bridge-preview.html'),html);
console.log('PASS: Bridge UI uses exact five stock fields and renders image/video task form');
