// Offline UI smoke test: renders the real ES module in local preview mode,
// then exercises navigation via the same delegated click handler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listeners = {};
globalThis.__MZJ_PREVIEW_DATA__ = JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-baseline-2026-v2.json'), 'utf8'));
const target = {
  innerHTML: '',
  addEventListener(event, fn) { listeners[event] = fn; },
  querySelector() { return null; }
};
const toast = { textContent:'', classList:{add(){},remove(){}} };
globalThis.document = {
  title: '', body: { appendChild() {} },
  getElementById: id => id === 'app' ? target : toast,
  createElement: () => ({ click(){}, remove(){}})
};
globalThis.window = {
  location: { hostname:'localhost', search:'?preview=1' },
  addEventListener() {}, clearTimeout(){}, setTimeout() {}, scrollTo(){}, print(){},
};
await import('../site/app.js');
const baseline = target.innerHTML;
const checks = [
  [baseline.includes('بداية واضحة. قرارات أدق.'), 'Hero loaded'],
  [baseline.includes('151,928'), 'Facebook views correct'],
  [baseline.includes('22,884'), 'Instagram followers correct'],
  [baseline.includes('≈ 14,000'), 'Approx TikTok followers marked'],
  [baseline.includes('Snapchat'), 'Snapchat present'],
  [baseline.includes('4</strong><small> / 4 منصات'), 'Four platforms ready'],
  [baseline.includes('4,878'), 'Snapchat followers correct'],
  [baseline.includes('48,861'), 'Snapchat story views correct'],
  [baseline.includes('48,772'), 'Snapchat paid story views correct'],
  [baseline.includes('عرض تجريبي محلي فقط'), 'Local preview flagged'],
];
for (const view of ['baseline','platforms','comparison','settings']) {
  const node = { dataset:{nav:view} };
  listeners.click({target:{closest: key => key === '[data-nav]' ? node : null}});
  checks.push([target.innerHTML.includes('class="page-title"'), `${view} rendered`]);
  if (view === 'baseline') checks.push([target.innerHTML.includes('جميعها من نفس الفترة')===false, 'No false consistent period claim']);
}
// Check snapshot-specific detail page through the same delegated UI handler.
listeners.click({target:{closest: key => key === '[data-action]' ? {dataset:{action:'platform-tab',platform:'snapchat'}} : null}});
checks.push([target.innerHTML.includes('10 أكتوبر – 6 نوفمبر 2026'), 'Snapchat reporting period preserved']);
checks.push([target.innerHTML.includes('725'), 'Public Stories views']);
checks.push([target.innerHTML.includes('747'), 'Spotlight views']);
checks.push([target.innerHTML.includes('21.1'), 'Public Stories total watch']);
checks.push([target.innerHTML.includes('4.3'), 'Inconsistent watch time marked for review']);
checks.push([target.innerHTML.includes('5 ثوانٍ'), 'Spotlight watch time']);
const snapchatMarkup = target.innerHTML;
const good = checks.every(([ok])=>ok);
checks.forEach(([ok,name]) => console.log(`${ok ? 'PASS':'FAIL'} ${name}`));
// Generate static HTML used for visual/print QA; not included in the deployed site.
const template = fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'site/styles.css'),'utf8');
const staticPage = markup => template
  .replace('<div id="app"></div>',`<div id="app">${markup}</div>`)
  .replace('<script type="module" src="./app.js"></script>','')
  .replace('<link rel="stylesheet" href="./styles.css" />', `<style>${css}</style>`);
fs.mkdirSync(path.join(root,'qa'), {recursive:true});
fs.writeFileSync(path.join(root,'qa/overview.html'),staticPage(baseline));
fs.writeFileSync(path.join(root,'qa/snapchat.html'),staticPage(snapchatMarkup));
fs.writeFileSync(path.join(root,'MZJ-visual-preview.html'),staticPage(baseline));
fs.writeFileSync(path.join(root,'MZJ-Snapchat-preview.html'),staticPage(snapchatMarkup));
if (!good) process.exit(1);
