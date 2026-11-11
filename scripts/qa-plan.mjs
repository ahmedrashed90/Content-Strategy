import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validatePlanSeed,teamHandoffText,toBriefText,PEOPLE} from '../site/planner.js';
const root=new URL('../',import.meta.url);
const plan=JSON.parse(fs.readFileSync(new URL('../data/MZJ-Publishing-Plan-2026-11-20-IMPORT.json',import.meta.url),'utf8'));
assert.ok(validatePlanSeed(plan));
assert.equal(plan.productionStartDate,'2026-11-20');
assert.equal(plan.proposedPublishStartDate,'2026-12-07');
assert.equal(plan.posts.length,28);assert.equal(plan.assets.length,48);
assert.equal(plan.carousels.length,4);
assert.equal(plan.assets.filter(a=>a.kind==='video').length,16);
assert.equal(plan.assets.filter(a=>a.kind!=='video').length,32);
assert.equal(new Set(plan.posts.map(p=>p.ideaCode)).size,28);
for(let w=1;w<=4;w++){
 const assets=plan.assets.filter(a=>a.week===w);
 assert.equal(assets.length,12);
 for(const name of PEOPLE)assert.equal(assets.filter(a=>a.executor===name).length,4);
 assert.equal(assets.filter(a=>a.deliveryDay==='الأحد').length,6);
 assert.equal(assets.filter(a=>a.deliveryDay==='الأربعاء').length,6);
}
for(const v of plan.assets.filter(a=>a.kind==='video')){
 assert.equal(v.scenes.length,4);
 assert.equal(v.scenes[0].startSecond,0);
 assert.equal(v.scenes.at(-1).endSecond,v.durationSeconds);
 assert.equal(v.scenes.map(s=>s.voiceOver).join(' '),v.script);
 for(const s of v.scenes) assert.ok(s.visual && s.camera && s.screenText && s.endSecond>s.startSecond);
 for(const platform of ['instagram','facebook','tiktok','snapchat'])assert.ok(v.captionsByPlatform[platform]);
 assert.ok(toBriefText(plan,v.code).includes(v.script));
}
for(const person of PEOPLE){
 const briefing=teamHandoffText(plan,person);
 assert.ok(briefing.length>3000);
 const count=plan.assets.filter(a=>a.executor===person).length;
 assert.ok(briefing.includes('التسليم'));
 console.log(`${person} - ${count} original assets, handoff characters ${briefing.length}`);
}
const site=fs.readdirSync(new URL('../site/',import.meta.url));
const siteContent=site.filter(f=>f.endsWith('.js')||f.endsWith('.html')).map(f=>fs.readFileSync(new URL('../site/'+f,import.meta.url),'utf8')).join('\n');
assert.ok(!siteContent.includes('الصورة مو كفاية'));
assert.ok(!siteContent.includes('4,878'));
assert.ok(!siteContent.includes('48,861'));
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
assert.ok(rules.includes('allow update, delete: if false;'));
assert.ok(rules.includes('match /contentPlans/mzj-2026-launch-cycle-01'));
assert.ok(rules.includes('match /baselines/baseline-2026-v1'));
assert.ok(rules.includes('match /baselines/baseline-2026-v2'));
assert.ok(!rules.includes('allow read, write: if true'));
console.log('QA PASS: exact scripts, 28 posts, 48 original assets, deadlines, privacy, baseline permissions.');
