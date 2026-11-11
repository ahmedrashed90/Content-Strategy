// Inspirations (مصادر الإلهام) — owner writes inspiration sources,
// Claude reads them via API and pushes back generated ideas.
import { connectFirebase } from './firebase.js';
import { PLAN_ID } from './plan-firebase.js';
import { escapeText, nowInRiyadh } from './planner.js';

const e = escapeText;

export const INSPIRATION_TYPES = [
  { id: 'customer_question',  label: 'سؤال عميل' },
  { id: 'new_model',          label: 'موديل جديد / تحديث' },
  { id: 'seasonal_offer',     label: 'عرض موسمي' },
  { id: 'sales_note',         label: 'ملاحظة من المبيعات' },
  { id: 'market_trend',       label: 'ترند / اتجاه سوق' },
  { id: 'competitor',         label: 'حركة منافس' },
  { id: 'internal_idea',      label: 'فكرة داخلية' },
  { id: 'other',              label: 'أخرى' },
];
const typeLabel = id => INSPIRATION_TYPES.find(t => t.id === id)?.label || id;

export const INSPIRATION_STATUSES = ['جديد', 'تم التوليد', 'مؤرشف'];

// ─── SDK helper (same pattern as plan-firebase.js) ───────────────

const base = ['contentPlans', PLAN_ID];

async function sdk() {
  const connection = await connectFirebase();
  return { db: connection.firestore, api: connection.api.dbSdk };
}

// ─── Firestore operations ────────────────────────────────────────

export async function loadInspirations() {
  const { db, api } = await sdk();
  const ref = api.collection(db, ...base, 'inspirations');
  const q = api.query(ref, api.orderBy('createdAt', 'desc'));
  const snap = await api.getDocs(q);
  return snap.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
}

export async function createInspiration({ type, text, tags }) {
  const { db, api } = await sdk();
  const id = `INS-${Date.now().toString(36).toUpperCase()}`;
  const ref = api.doc(api.collection(db, ...base, 'inspirations'), id);
  const data = {
    id,
    type: type || 'other',
    text: String(text || '').trim().slice(0, 2000),
    tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).trim().slice(0, 50)) : [],
    status: 'جديد',
    generatedIdeas: [],
    notes: '',
    createdAt: api.serverTimestamp(),
    updatedAt: api.serverTimestamp(),
  };
  await api.setDoc(ref, data);
  return { ...data, _id: id };
}

export async function updateInspiration(id, changes) {
  const { db, api } = await sdk();
  const allowed = ['text', 'type', 'tags', 'status', 'generatedIdeas', 'notes'];
  const filtered = {};
  for (const key of allowed) {
    if (key in changes) filtered[key] = changes[key];
  }
  filtered.updatedAt = api.serverTimestamp();
  const ref = api.doc(db, ...base, 'inspirations', id);
  await api.updateDoc(ref, filtered);
}

// ─── State ───────────────────────────────────────────────────────

export function newInspirationState() {
  return {
    items: [],
    loading: false,
    error: '',
    filter: 'all',      // all | جديد | تم التوليد | مؤرشف
    typeFilter: 'all',
    formOpen: false,
    formType: 'customer_question',
    formText: '',
    formTags: '',
    saving: false,
  };
}

export async function refreshInspirations(insState) {
  if (insState.loading) return;
  insState.loading = true;
  insState.error = '';
  try {
    insState.items = await loadInspirations();
  } catch (err) {
    insState.error = err?.message || 'تعذر تحميل مصادر الإلهام';
  } finally {
    insState.loading = false;
  }
}

// ─── UI page ─────────────────────────────────────────────────────

const opt = (value, label, current) =>
  `<option value="${e(value)}" ${String(value) === String(current) ? 'selected' : ''}>${e(label)}</option>`;

const statusPill = status => {
  const cls = status === 'تم التوليد' ? 'p-ready' : status === 'مؤرشف' ? 'p-error' : 'p-neutral';
  return `<span class="plan-pill ${cls}">${e(status)}</span>`;
};

const typePill = id =>
  `<span class="plan-pill p-platform">${e(typeLabel(id))}</span>`;

export function inspirationsPage(state) {
  const ins = state.inspirations;
  const statusFilter = ins.filter || 'all';
  const typeFilter = ins.typeFilter || 'all';

  const visible = ins.items.filter(item =>
    (statusFilter === 'all' || item.status === statusFilter) &&
    (typeFilter === 'all' || item.type === typeFilter)
  );

  const countNew = ins.items.filter(i => i.status === 'جديد').length;
  const countGenerated = ins.items.filter(i => i.status === 'تم التوليد').length;
  const countArchived = ins.items.filter(i => i.status === 'مؤرشف').length;

  const form = ins.formOpen ? `
    <section class="card panel ins-form-panel">
      <h2>بحث عن فكرة جديدة</h2>

      <form id="inspiration-form" class="p-edit-form ins-form">
        <label>نوع المصدر
          <select name="type">
            ${INSPIRATION_TYPES.map(t => opt(t.id, t.label, ins.formType)).join('')}
          </select>
        </label>
        <label>النص / الوصف
          <textarea name="text" rows="4" maxlength="2000" required placeholder="مثال: كثير عملاء يسألون عن الفرق بين فئات كامري 2026...">${e(ins.formText)}</textarea>
          <small class="ins-char-count">${(ins.formText || '').length} / 2000</small>
        </label>
        <label>تاجات (اختياري، افصل بفاصلة)
          <input name="tags" type="text" placeholder="كامري, مقارنة, تقسيط" value="${e(ins.formTags)}" />
        </label>
        <div class="p-actions">
          <button type="submit" class="btn btn-primary" ${ins.saving ? 'disabled' : ''}>${ins.saving ? 'جارٍ الحفظ…' : 'حفظ مصدر الإلهام'}</button>
          <button type="button" class="btn" data-action="ins-cancel-form">إلغاء</button>
        </div>
      </form>
    </section>` : '';

  const cards = visible.map(item => {
    const date = item.createdAt?.toDate
      ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(item.createdAt.toDate())
      : item.createdAt?.seconds
        ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date(item.createdAt.seconds * 1000))
        : '—';
    const genCount = Array.isArray(item.generatedIdeas) ? item.generatedIdeas.length : 0;
    const tags = Array.isArray(item.tags) && item.tags.length
      ? `<div class="ins-tags">${item.tags.map(t => `<span class="ins-tag">${e(t)}</span>`).join('')}</div>`
      : '';

    return `<article class="card ins-card">
      <div class="ins-card-head">
        ${typePill(item.type)}
        ${statusPill(item.status)}
        <span class="ins-date">${e(date)}</span>
      </div>
      <p class="ins-text">${e(item.text)}</p>
      ${tags}
      <div class="ins-card-foot">
        <span class="ins-gen-count">${genCount ? `${genCount} فكرة مولّدة` : 'لم تُولّد أفكار بعد'}</span>
        <div class="p-actions">
          ${item.status === 'جديد' ? `<button class="btn p-small" data-action="ins-archive" data-id="${e(item.id)}">أرشفة</button>` : ''}
          ${item.status === 'مؤرشف' ? `<button class="btn p-small" data-action="ins-reactivate" data-id="${e(item.id)}">استرجاع</button>` : ''}
          ${item.notes ? `<div class="ins-notes"><small>ملاحظات:</small> ${e(item.notes)}</div>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');

  const actions = `<button class="btn btn-primary" data-action="ins-open-form">${ins.formOpen ? 'إغلاق النموذج' : 'بحث عن الأفكار'}</button>
    <button class="btn" data-action="ins-refresh" ${ins.loading ? 'disabled' : ''}>تحديث</button>`;

  return `
    <div class="ui-page-actions">${actions}</div>

    <div class="ins-kpis">
      <button class="card ins-kpi ${statusFilter === 'all' ? 'ins-kpi-active' : ''}" data-action="ins-filter-status" data-status="all">
        <strong>${ins.items.length}</strong><span>الكل</span>
      </button>
      <button class="card ins-kpi ${statusFilter === 'جديد' ? 'ins-kpi-active' : ''}" data-action="ins-filter-status" data-status="جديد">
        <strong>${countNew}</strong><span>جديد</span>
      </button>
      <button class="card ins-kpi ${statusFilter === 'تم التوليد' ? 'ins-kpi-active' : ''}" data-action="ins-filter-status" data-status="تم التوليد">
        <strong>${countGenerated}</strong><span>تم التوليد</span>
      </button>
      <button class="card ins-kpi ${statusFilter === 'مؤرشف' ? 'ins-kpi-active' : ''}" data-action="ins-filter-status" data-status="مؤرشف">
        <strong>${countArchived}</strong><span>مؤرشف</span>
      </button>
    </div>

    <div class="ins-filters">
      <label>نوع المصدر
        <select id="ins-type-filter">
          <option value="all" ${typeFilter === 'all' ? 'selected' : ''}>كل الأنواع</option>
          ${INSPIRATION_TYPES.map(t => opt(t.id, t.label, typeFilter)).join('')}
        </select>
      </label>
    </div>

    ${ins.error ? `<div class="notice warning">${e(ins.error)}</div>` : ''}
    ${form}

    <div class="ins-grid">
      ${cards}
    </div>

    `;
}
