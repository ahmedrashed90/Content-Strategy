// Offline read-only UI regression: source, usage, review and category filters.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeIdeaRows,ideasPage,selectGlobalIdeaReview} from '../site/planner.js';
import {bridgePage,newBridgeState,selectBridgeCategory,toggleBridgeIdea,CAMPAIGN_CATEGORIES} from '../site/marketing-bridge.js';

const pending='بانتظار المراجعة',approved='معتمد';
const make=(code,patch={})=>({code,kind:'video',title:'فكرة '+code,source:'manual',reviewStatus:pending,marketingCategory:CAMPAIGN_CATEGORIES[0],...patch});
const plan={assets:[],carousels:[],posts:[]};
// The original screenshot showed 73 used ideas (68 approved + 5 pending),
// plus another 108 unused ideas. These are synthetic counts, never live data.
for(let i=0;i<73;i++)plan.assets.push(make('USED-'+i,{marketingTaskId:'TASK-'+i,source:i%2?'claude':'manual',reviewStatus:i<68?approved:pending,marketingCategory:CAMPAIGN_CATEGORIES[i%5]}));
for(let i=0;i<57;i++)plan.assets.push(make('CLAUDE-'+i,{source:'claude',reviewStatus:i<7?approved:pending,marketingCategory:CAMPAIGN_CATEGORIES[i%5]}));
for(let i=0;i<51;i++)plan.assets.push(make('MANUAL-'+i,{reviewStatus:i<5?approved:pending,kind:i%2?'image':'video',marketingCategory:CAMPAIGN_CATEGORIES[i%5]}));
const state={plan,ideaSourceTab:'used',ideaKind:'all',ideaCategoryFilter:'all',ideaReviewFilter:pending,ideaSearch:'',bridge:newBridgeState()};
const ideaCodes=html=>[...html.matchAll(/data-action="open-asset" data-id="([^"]+)"/g)].map(m=>m[1]);
const bridgeCodes=html=>[...html.matchAll(/name="bridge-select-idea" value="([^"]+)"/g)].map(m=>m[1]);
const reviewCount=(html,status)=>Number(html.match(new RegExp('data-status="'+status+'">[^<]+ <small>(\\d+)</small>'))?.[1]);
const sourceCount=(html,source)=>Number(html.match(new RegExp('data-source="'+source+'">[^<]+ <small>(\\d+)</small>'))?.[1]);
const categoryCount=(html,category)=>Number(html.match(new RegExp('data-category="'+category+'">[^<]+ <span>(\\d+)</span>'))?.[1]);
const snapshot=JSON.stringify(plan);
let html=ideasPage(state);
assert.equal(ideaCodes(html).length,5,'used + contextual pending is still a valid filter');
assert.equal(reviewCount(html,pending),101,'global review counter includes all sources');
assert.equal(reviewCount(html,approved),80);
assert.equal(reviewCount(html,'all'),181);
assert.equal(sourceCount(html,'all'),181);
assert.equal(sourceCount(html,'used'),73);
assert.equal(sourceCount(html,'claude'),93,'used Claude ideas still belong to Claude');
assert.equal(sourceCount(html,'manual'),88);
Object.assign(state,{ideaKind:'image',ideaCategoryFilter:CAMPAIGN_CATEGORIES[2],ideaSearch:'stale search'});
selectGlobalIdeaReview(state,pending);
assert.equal(state.ideaSourceTab,'all');assert.equal(state.ideaSearch,'');assert.equal(state.ideaKind,'all');assert.equal(state.ideaCategoryFilter,'all');
assert.equal(ideaCodes(ideasPage(state)).length,101);
assert(ideaCodes(ideasPage(state)).includes('CLAUDE-56'));
selectGlobalIdeaReview(state,approved);
assert.equal(ideaCodes(ideasPage(state)).length,80);
selectGlobalIdeaReview(state,'all');
assert.equal(ideaCodes(ideasPage(state)).length,181);
state.ideaSourceTab='claude';
assert.equal(ideaCodes(ideasPage(state)).length,93);
state.ideaReviewFilter=pending;
assert(ideaCodes(ideasPage(state)).includes('CLAUDE-56'));
assert(ideaCodes(ideasPage(state)).includes('USED-69'));
assert(!ideaCodes(ideasPage(state)).includes('MANUAL-50'));
assert.equal(JSON.stringify(plan),snapshot,'filtering never edits the plan');

// Approved listing has the same active bank, and doesn't require prior task links.
html=bridgePage(state);assert.equal(bridgeCodes(html).length,80);assert.equal(categoryCount(html,''),80);
assert(bridgeCodes(html).includes('CLAUDE-0'));assert(bridgeCodes(html).includes('MANUAL-0'));assert(bridgeCodes(html).includes('USED-0'));
for(const category of CAMPAIGN_CATEGORIES){
  selectBridgeCategory(state,category);html=bridgePage(state);
  const expected=plan.assets.filter(a=>a.marketingCategory===category&&a.reviewStatus===approved).map(a=>a.code);
  assert.deepEqual(bridgeCodes(html),expected);assert.equal(categoryCount(html,category),expected.length);
}
selectBridgeCategory(state,'بيعي');
assert.deepEqual(bridgeCodes(bridgePage(state)),plan.assets.filter(a=>CAMPAIGN_CATEGORIES.slice(-2).includes(a.marketingCategory)&&a.reviewStatus===approved).map(a=>a.code));
const salePair=CAMPAIGN_CATEGORIES.slice(-2).map(cat=>plan.assets.find(a=>a.marketingCategory===cat&&a.reviewStatus===approved));
for(const item of salePair)toggleBridgeIdea(state,item.code,true);
assert.equal(state.bridge.selectedCodes.length,2,'combined sales category still accepts cash and finance in one task');
selectBridgeCategory(state,'');state.bridge.ideaUsageFilter='used';assert.equal(bridgeCodes(bridgePage(state)).length,68);
state.bridge.ideaUsageFilter='unused';assert.equal(bridgeCodes(bridgePage(state)).length,12);
state.bridge.ideaUsageFilter='all';state.bridge.ideaSearch='CLAUDE-0';assert.deepEqual(bridgeCodes(bridgePage(state)),['CLAUDE-0']);state.bridge.ideaSearch='';

// Approval changes affect both lists immediately, without touching task records.
const claude=plan.assets.find(a=>a.code==='CLAUDE-56');
claude.reviewStatus=approved;assert(bridgeCodes(bridgePage(state)).includes(claude.code));
claude.reviewStatus=pending;assert(!bridgeCodes(bridgePage(state)).includes(claude.code));
assert.equal(JSON.stringify(plan),snapshot);

// Legacy/missing categories, previous assignments, archived and stopped records,
// grouped slides and duplicate display records.
const extras=[make('HISTORY',{reviewStatus:approved,previousMarketingTasks:[{taskId:'old'}]}),make('NO-CATEGORY',{reviewStatus:approved,marketingCategory:''}),make('PAUSED',{reviewStatus:approved,requiresVerification:true}),make('STOPPED',{reviewStatus:approved,sourceStatus:'موقوف'}),make('RETIRED',{reviewStatus:approved,retiredFromIdeaBank:true}),make('REJECTED',{reviewStatus:'مرفوض'}),make('SLIDE-1',{reviewStatus:approved,kind:'carousel_slide'}),make('SLIDE-2',{reviewStatus:approved,kind:'carousel_slide'})];
plan.assets.push(...extras,extras[0]);
plan.carousels.push({code:'CAROUSEL',kind:'carousel',title:'مجموعة صور',marketingCategory:CAMPAIGN_CATEGORIES[0],slideCodes:['SLIDE-1','SLIDE-2']});
assert.equal(activeIdeaRows(plan).filter(a=>a.code==='HISTORY').length,1);
assert(activeIdeaRows(plan).some(a=>a.code==='CAROUSEL'));assert(!activeIdeaRows(plan).some(a=>a.code==='SLIDE-1'));
html=bridgePage(state);
assert(bridgeCodes(html).includes('CAROUSEL'));assert(bridgeCodes(html).includes('NO-CATEGORY'));
assert.match(html,/name="bridge-select-idea" value="NO-CATEGORY"[^>]*disabled/);
assert.throws(()=>toggleBridgeIdea(state,'NO-CATEGORY',true),/غير معتمدة أو غير متاحة/);
for(const code of ['PAUSED','STOPPED','RETIRED','REJECTED','SLIDE-1','SLIDE-2'])assert(!bridgeCodes(html).includes(code),code+' remains excluded');
state.bridge.ideaUsageFilter='used';assert(bridgeCodes(bridgePage(state)).includes('HISTORY'));
selectGlobalIdeaReview(state,'all');assert(!ideaCodes(ideasPage(state)).includes('REJECTED'));assert(!ideaCodes(ideasPage(state)).includes('RETIRED'));
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');assert(app.includes("if(action==='ideas-filter-review'){selectGlobalIdeaReview(state,control.dataset.status);render();return;}"));
console.log('PASS: 181-idea fixture, global review shortcuts, independent source and usage, accurate category counts and lists, immediate approvals, history, missing-category gate, retired/rejected/paused exclusion, no duplicates and read-only rendering.');
