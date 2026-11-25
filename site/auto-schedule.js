import { connectFirebase, listenToAuth } from './firebase.js';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const app = $('app');
let agendas = [], detail = null, ideaFilter = '';

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
  if (/youtube|يوتيوب/i.test(p)) return /short|شورت|ريل|reel|فيديو|video/i.test(t);
  if (/linkedin|لينكد/i.test(p)) return /بوست|post|صور|image|فيديو|video|ريل|reel/i.test(t);
  if (/google|جوجل/i.test(p)) return !/كلمات|keyword|search/i.test(t);
  if (/instagram|انستجرام|إنستجرام|facebook|فيس/i.test(p)) return /ريل|reel|ستوري|story|بوست|post|صور|image/i.test(t);
  return false;
};
/** Default publish time (Riyadh) per platform + post type, from the agreed schedule. Editable per row before sending. */
const defaultTime = e => {
  const p = `${e.platform?.code} ${e.platform?.name}`, t = e.postType?.name || '';
  const story = /ستوري|story/i.test(t), spot = /spotlight/i.test(t), reel = /ريل|reel|فيديو|video|short|شورت/i.test(t);
  const photo = /بوست|post|صور|image/i.test(t) && !story && !reel;
  if (/instagram|انستجرام|إنستجرام/i.test(p)) return photo ? '12:00' : (story ? '11:00' : '19:00');
  if (/tiktok|تيك/i.test(p)) return story ? '11:30' : '20:00';
  if (/facebook|فيس/i.test(p)) return photo ? '12:30' : (story ? '17:45' : '17:00');
  if (/snap|سناب/i.test(p)) return spot ? '19:30' : '17:45';
  if (/youtube|يوتيوب/i.test(p)) return '18:00';
  if (/google|جوجل/i.test(p)) return '10:00';
  if (/linkedin|لينكد/i.test(p)) return '10:00';
  return reel ? '19:00' : '14:00';
};

function render(msg = '') {
  const prevIg = $('ig')?.value, prevTt = $('tt')?.value;
  const today = new Date().toISOString().slice(0, 10);
  const allRows = detail ? detail.entries.filter(e => supported(e) && e.scheduledOn >= today) : [];
  const ideaOf = e => e.strategyIdeaTitle || e.ideaName || '';
  const ideas = [...new Set(allRows.map(ideaOf))];
  const rows = ideaFilter ? allRows.filter(e => ideaOf(e) === ideaFilter) : allRows;
  const manual = detail ? detail.entries.filter(e => !supported(e) && e.scheduledOn >= today && e.fileStatus === 'ready').length : 0;
  app.innerHTML = `
  <label>الأجندة: <select id="agenda">${agendas.map(a => `<option value="${esc(a.id)}" ${detail?.id === a.id ? 'selected' : ''}>${esc(a.agenda?.name)} (${esc(a.agenda?.publishFrom)} → ${esc(a.agenda?.publishTo)})</option>`).join('')}</select></label>
  <button class="alt" id="load">تحميل</button>
  <p><label>حساب انستجرام (اختياري، username): <input id="ig" placeholder="mzjcars" dir="ltr"></label>
  <label>حساب تيك توك (اختياري، ID): <input id="tt" dir="ltr"></label> <button class="alt" id="accounts">عرض حساباتي في Storrito</button></p>
  ${detail ? `<p><label>الفكرة: <select id="idea"><option value="">كل الأفكار</option>${ideas.map(i => `<option value="${esc(i)}" ${i === ideaFilter ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
  <button class="alt" id="selidea">حدد منشورات المعروض (حتى 10)</button> <button class="alt" id="clrsel">إلغاء التحديد</button>${manual ? ` <span class="muted">${manual} منشور جاهز غير مدعوم آليًا: يُنشر يدويًا</span>` : ''}</p>
  <table><tr><th></th><th>التاريخ</th><th>المنصة / النوع</th><th>الفكرة</th><th>الكابشن</th><th>موعد النشر (توقيت الرياض)</th></tr>
  ${rows.map(e => `<tr><td><input type="checkbox" data-e="${esc(e.id)}"></td><td>${esc(e.scheduledOn)}</td><td>${esc(e.platform?.name)} / ${esc(e.postType?.name)}</td><td>${esc(e.strategyIdeaTitle || e.ideaName)}</td><td>${e.caption ? '✓' : '<span class="bad">فارغ</span>'}</td><td><input type="datetime-local" data-t="${esc(e.id)}" value="${esc(e.scheduledOn)}T${defaultTime(e)}"></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا منشورات مدعومة وجاهزة بتاريخ قادم</td></tr>'}</table>
  <p><button id="preview">معاينة (بدون إرسال)</button> <button id="go" class="alt">جدولة فعلية</button></p>` : ''}
  <pre id="out">${esc(msg)}</pre>`;
  try {
    $('ig').value = prevIg || localStorage.getItem('mzj-auto-ig') || '';
    $('tt').value = prevTt || localStorage.getItem('mzj-auto-tt') || '';
  } catch { /* optional */ }
  $('ig').oninput = $('tt').oninput = () => { try { localStorage.setItem('mzj-auto-ig', $('ig').value.trim()); localStorage.setItem('mzj-auto-tt', $('tt').value.trim()); } catch { /* optional */ } };
  $('load').onclick = loadAgenda; $('accounts').onclick = accounts;
  if (detail) {
    $('idea').onchange = () => { ideaFilter = $('idea').value; render(); };
    $('selidea').onclick = () => { const boxes = [...document.querySelectorAll('input[data-e]')]; boxes.forEach((b, i) => { b.checked = i < 10; }); };
    $('clrsel').onclick = () => document.querySelectorAll('input[data-e]').forEach(b => { b.checked = false; });
  }
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
    render((r.dryRun ? 'معاينة فقط، لم يُرسل شيء\n\n' : 'تم التنفيذ\n\n') + list.map(p => `${p.state.toUpperCase()}  ${p.platform || ''} ${p.postType || ''}  ${p.publishAt || ''}\n  ${p.reason || ''}${p.note ? `ملاحظة: ${p.note}\n  ` : ''}${p.target ? `الحساب: ${p.target.label} ` : ''}${p.file ? `الملف: ${p.file.name}${p.file.matchesSize ? '' : ' (تنبيه: المقاس لا يطابق)'}` : ''}`).join('\n'));
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
  try { detail = await api(`/api/publication-agendas?agendaId=${encodeURIComponent($('agenda').value)}`); ideaFilter = ''; render(); } catch (e) { render('خطأ: ' + e.message); }
}
async function accounts() {
  try { const r = await api('/api/publication-schedule', { action: 'accounts' }); render(JSON.stringify({ instagram: r.instagram, tiktok: r.tiktok, social: r.social, zernio: r.zernio }, null, 2)); } catch (e) { render('خطأ: ' + e.message); }
}
await connectFirebase();
listenToAuth(async user => {
  if (!user) return render('سجل الدخول في الاستراتيجية أولًا (الصفحة الرئيسية) ثم أعد فتح هذه الصفحة.');
  try { agendas = (await api('/api/publication-agendas')).agendas; render(); } catch (e) { render('خطأ: ' + e.message); }
});
