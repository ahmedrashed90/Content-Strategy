// Offline UI smoke test: renders the real ES module in local preview mode,
// then exercises navigation via the same delegated click handler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listeners = {};
globalThis.__MZJ_PREVIEW_DATA__ = JSON.parse(fs.readFileSync(path.join(root,'data/MZJ-baseline-2026-v1.json'), 'utf8'));
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
  [baseline.includes('عرض تجريبي محلي فقط'), 'Local preview flagged'],
];
for (const view of ['baseline','platforms','comparison','settings']) {
  const node = { dataset:{nav:view} };
  listeners.click({target:{closest: key => key === '[data-nav]' ? node : null}});
  checks.push([target.innerHTML.includes('class="page-title"'), `${view} rendered`]);
  if (view === 'baseline') checks.push([target.innerHTML.includes('جميعها من نفس الفترة')===false, 'No false consistent period claim']);
}
const good = checks.every(([ok])=>ok);
checks.forEach(([ok,name]) => console.log(`${ok ? 'PASS':'FAIL'} ${name}`));
// Generate static HTML used for visual/print QA; not included in the deployed site.
const template = fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const rendered = template.replace('<div id="app"></div>',`<div id="app">${baseline}</div>`).replace('<script type="module" src="./app.js"></script>','');
fs.mkdirSync(path.join(root,'qa'), {recursive:true});
fs.writeFileSync(path.join(root,'qa/overview.html'),rendered);
if (!good) process.exit(1);
