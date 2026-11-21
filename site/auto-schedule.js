import { connectFirebase, listenToAuth } from './firebase.js';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const app = $('app');
let agendas = [], detail = null;

async function api(path, body) {
  const { auth } = await connectFirebase();
  const user = auth.currentUser;
  if (!user) throw Error('سجل الدخول في الاستراتيجية أولًا ثم أعد فتح هذه الصفحة');
  const token = await user.getIdToken();
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw Error(data?.error || 'فشل الطلب');
  return data;
}
const supported = e => {
  if (e.fileStatus !== 'ready') return false;
  const p = `${e.platform?.code} ${e.platform?.name}`, t = e.postType?.name || '';
  if (/tiktok|تيك/i.test(p)) return true;
  if (/snap|سناب/i.test(p)) return /spotlight|story|ستوري/i.test(t);
  return /instagram|انستجرام|إنستجرام|facebook|فيس/i.test(p) && /ريل|reel|ستوري|story/i.test(t);
};

function render(msg = '') {
  const prevIg = $('ig')?.value, prevTt = $('tt')?.value;
  const today = new Date().toISOString().slice(0, 10);
  const rows = detail ? detail.entries.filter(e => supported(e) && e.scheduledOn >= today) : [];
  app.innerHTML = `
  <label>الأجندة: <select id="agenda">${agendas.map(a => `<option value="${esc(a.id)}" ${detail?.id === a.id ? 'selected' : ''}>${esc(a.agenda?.name)} (${esc(a.agenda?.publishFrom)} → ${esc(a.agenda?.publishTo)})</option>`).join('')}</select></label>
  <button class="alt" id="load">تحميل</button>
  <p><label>حساب انستجرام (username): <input id="ig" placeholder="mzjcars" dir="ltr"></label>
  <label>حساب تيك توك (ID): <input id="tt" dir="ltr"></label> <button class="alt" id="accounts">عرض حساباتي في Storrito</button></p>
  ${detail ? `<table><tr><th></th><th>التاريخ</th><th>المنصة / النوع</th><th>الفكرة</th><th>الكابشن</th><th>موعد النشر (توقيت الرياض)</th></tr>
  ${rows.map(e => `<tr><td><input type="checkbox" data-e="${esc(e.id)}"></td><td>${esc(e.scheduledOn)}</td><td>${esc(e.platform?.name)} / ${esc(e.postType?.name)}</td><td>${esc(e.strategyIdeaTitle || e.ideaName)}</td><td>${e.caption ? '✓' : '<span class="bad">فارغ</span>'}</td><td><input type="datetime-local" data-t="${esc(e.id)}" value="${esc(e.scheduledOn)}T14:00"></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا منشورات مدعومة وجاهزة بتاريخ قادم</td></tr>'}</table>
  <p><button id="preview">معاينة (بدون إرسال)</button> <button id="go" class="alt">جدولة فعلية</button></p>` : ''}
  <pre id="out">${esc(msg)}</pre>`;
  try {
    $('ig').value = prevIg || localStorage.getItem('mzj-auto-ig') || '';
    $('tt').value = prevTt || localStorage.getItem('mzj-auto-tt') || '';
  } catch { /* optional */ }
  $('ig').oninput = $('tt').oninput = () => { try { localStorage.setItem('mzj-auto-ig', $('ig').value.trim()); localStorage.setItem('mzj-auto-tt', $('tt').value.trim()); } catch { /* optional */ } };
  $('load').onclick = loadAgenda; $('accounts').onclick = accounts;
  if (detail) { $('preview').onclick = () => run(false); $('go').onclick = () => { if (confirm('سيتم إرسال المنشورات المحددة إلى Storrito للنشر في مواعيدها. متأكد؟')) run(true); }; }
}
function selected() {
  return [...document.querySelectorAll('input[data-e]:checked')].map(c => {
    const id = c.dataset.e, t = document.querySelector(`input[data-t="${CSS.escape(id)}"]`).value;
    return { entryId: id, publishAt: t ? `${t}:00+03:00` : '' };
  });
}
async function run(confirmed) {
  const items = selected();
  const ig = $('ig').value.trim(), tt = $('tt').value.trim();
  try { localStorage.setItem('mzj-auto-ig', ig); localStorage.setItem('mzj-auto-tt', tt); } catch { /* optional */ }
  if (!items.length) return render('اختر منشورًا واحدًا على الأقل (حتى 10).');
  const kept = items.map(i => i.entryId), keptTimes = Object.fromEntries(items.map(i => [i.entryId, i.publishAt]));
  render('جارٍ التنفيذ... قد يستغرق دقائق للفيديو.');
  restore(ig, tt, kept, keptTimes);
  try {
    const r = await api('/api/publication-schedule', { action: 'schedule', agendaId: detail.id, items, confirm: confirmed, instagramUsername: ig, tiktokAccountId: tt });
    const list = r.plans || r.results;
    const keep = () => restore(ig, tt, kept, keptTimes);
    render((r.dryRun ? 'معاينة فقط، لم يُرسل شيء\n\n' : 'تم التنفيذ\n\n') + list.map(p => `${p.state.toUpperCase()}  ${p.platform || ''} ${p.postType || ''}  ${p.publishAt || ''}\n  ${p.reason || ''}${p.target ? `الحساب: ${p.target.label} ` : ''}${p.file ? `الملف: ${p.file.name}${p.file.matchesSize ? '' : ' (تنبيه: المقاس لا يطابق)'}` : ''}`).join('\n'));
    keep();
  } catch (e) { render('خطأ: ' + e.message); }
}
function restore(ig, tt, kept = [], times = {}) {
  if ($('ig')) $('ig').value = ig; if ($('tt')) $('tt').value = tt;
  for (const id of kept) {
    const c = document.querySelector(`input[data-e="${CSS.escape(id)}"]`); if (c) c.checked = true;
    const t = document.querySelector(`input[data-t="${CSS.escape(id)}"]`); if (t && times[id]) t.value = times[id].replace(/:00\+03:00$/, '');
  }
}
async function loadAgenda() {
  try { detail = await api(`/api/publication-agendas?agendaId=${encodeURIComponent($('agenda').value)}`); render(); } catch (e) { render('خطأ: ' + e.message); }
}
async function accounts() {
  try { const r = await api('/api/publication-schedule', { action: 'accounts' }); render(JSON.stringify({ instagram: r.instagram, tiktok: r.tiktok, social: r.social }, null, 2)); } catch (e) { render('خطأ: ' + e.message); }
}
await connectFirebase();
listenToAuth(async user => {
  if (!user) return render('سجل الدخول في الاستراتيجية أولًا (الصفحة الرئيسية) ثم أعد فتح هذه الصفحة.');
  try { agendas = (await api('/api/publication-agendas')).agendas; render(); } catch (e) { render('خطأ: ' + e.message); }
});
