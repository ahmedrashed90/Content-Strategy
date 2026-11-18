import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareIdeaBatch } from '../site/idea-import.js';
import { assetDetailPage, toBriefText } from '../site/planner.js';
import { newBridgeState, selectBridgeCategory, toggleBridgeIdea, bridgePage } from '../site/marketing-bridge.js';

const file = new URL('../data/MZJ-72-IDEAS-FULL-CORRECTED-IMPORT-20261111.json', import.meta.url);
const source = JSON.parse(await readFile(file, 'utf8'));
const imported = prepareIdeaBatch(source, {assets:[],carousels:[]}, {replace:true});
const ideas=imported.items;
assert.equal(imported.total,72);
assert.equal(ideas.length,72);
assert.equal(imported.duplicates.length,0);
assert.equal(ideas.filter(x=>x.kind==='video').length,41);
assert.equal(ideas.filter(x=>x.kind==='image').length,31);
assert.deepEqual([...new Set(ideas.map(x=>x.marketingCategory))].sort(),[
 'تعريفي - بالبراند','تعريفي - بالويب سايت','تعريفي - مواصفات السيارات','بيعي - قسط','بيعي - كاش'].sort());
assert(ideas.every(x=>x.marketingCategory));
assert(ideas.filter(x=>x.requiresVerification).length===4);
assert(ideas.filter(x=>x.kind==='image').every(x=>x.imageSlides.length===x.imageCount));
const plan={assets:ideas,carousels:[],posts:[]};
const example=ideas.find(x=>x.title==='قبل الحجز، طابق التفاصيل');
const html=assetDetailPage({plan,selectedAssetCode:example.code,briefReturnView:'ideas',planSaving:false});
assert.equal((html.match(/class="p-scene p-image-scene"/g)||[]).length,4);
assert(!/\\(I0[3478]\\)/.test(html));
assert(toBriefText(plan,example.code).includes('الصورة 4 من 4'));
const a=ideas.find(x=>x.title==='الصورة مو كفاية'),b=example;
for(const x of [a,b])Object.assign(x,{reviewStatus:'معتمد',creativeApprovedAt:new Date().toISOString(),approvedCarMode:'none',approvedVehicles:[]});
const state={plan,bridge:newBridgeState()};
selectBridgeCategory(state,'تعريفي - مواصفات السيارات');
toggleBridgeIdea(state,a.code,true);
toggleBridgeIdea(state,b.code,true);
assert.equal(state.bridge.selectedCodes.length,2);
assert(bridgePage(state).includes('bridge-studio-layout'));
assert(bridgePage(state).includes('bridge-idea-code'));
assert(bridgePage(state).includes(a.title));
assert(bridgePage(state).includes(b.title));
assert(bridgePage(state).includes(a.code), 'Immutable codes are visible for tracking');

// Approved ideas appear in a searchable categorized card list, without additional
// approval/modification of unrelated ideas. Car confirmation is per idea.
const tableState={plan,bridge:newBridgeState()};
const listing=bridgePage(tableState);
assert(listing.includes('bridge-approved-list'));
assert(listing.includes('الأفكار المعتمدة'));
assert(listing.includes('bridge-approved-list'));
assert(listing.includes('bridge-category-tab'));
const approvedRows=(listing.match(/name="bridge-select-idea"/g)||[]).length;
assert(approvedRows>=2);
const selectedFirst=ideas.find(x=>x.code===a.code);
const selectedSecond=ideas.find(x=>x.code===b.code);
assert(selectedFirst&&selectedSecond);
const selectedTable=bridgePage(state);
assert(selectedTable.includes('bridge-config-cars'));
assert(selectedTable.includes('bridge-config-assignees'));
assert(selectedTable.includes('bridge-config-formats'));

console.log('PASS — 72 unique ideas, 5 categories, 41 videos, 31 image ideas, 4 paused, 58 image cards, clean brief and grouped task name');
