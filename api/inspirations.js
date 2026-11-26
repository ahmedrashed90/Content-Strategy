import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { prepareIdeaBatch, IDEA_BATCH_SCHEMA } from '../site/idea-import.js';

// ─── Config ──────────────────────────────────────────────────────
function env(name) { return String(process.env[name] || '').trim(); }
function responseJson(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(obj);
}

const PLAN_ID = 'mzj-2026-launch-cycle-01';

// ─── Firebase Admin ──────────────────────────────────────────────
function getDb() {
  if (!getApps().length) {
    const projectId = env('MZJ_STRATEGY_FIREBASE_PROJECT_ID');
    const clientEmail = env('MZJ_FIREBASE_CLIENT_EMAIL');
    const privateKey = env('MZJ_FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) throw Error('Firebase Admin not configured');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

// ─── Auth: API key (Claude) OR owner Firebase ID token (dashboard) ─
function requireApiKey(req) {
  const key = env('MZJ_INSPIRATIONS_API_KEY');
  if (key.length < 32) throw Error('Inspirations API key not configured');
  const header = String(req.headers.authorization || '');
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || match[1] !== key) throw Error('Unauthorized');
}

async function requireOwnerToken(req) {
  const owner = env('MZJ_STRATEGY_OWNER_UID');
  if (!owner) throw Error('Unauthorized');
  const token = /^Bearer ([A-Za-z0-9._-]{100,6500})$/.exec(String(req.headers.authorization || ''))?.[1];
  if (!token) throw Error('Unauthorized');
  getDb();
  const decoded = await getAuth().verifyIdToken(token).catch(() => null);
  if (!decoded || decoded.uid !== owner) throw Error('Unauthorized');
}

async function authorize(req) {
  try { requireApiKey(req); return 'api-key'; }
  catch { await requireOwnerToken(req); return 'owner'; }
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') body = body ? JSON.parse(body) : {};
  return body && typeof body === 'object' ? body : {};
}


// ─── Wording rules applied to every idea brief ──────────────────
// 1) The brand is written «محمد ذعار العجمي» in briefs, not «MZJ».
//    URLs such as mzj.sa (lowercase) are untouched; #MZJ is dropped because
//    #محمد_ذعار_العجمي is always present.
// 2) The word «منقحة / منقح / المنقحة» is replaced by plain wording because
//    the team does not understand it.
const BRAND_AR = 'محمد ذعار العجمي';
const SKIP_KEYS = new Set(['code', 'kind', 'status', 'reviewStatus', 'executor', 'source', 'inspirationId',
  'marketingCategory', 'platforms', 'importedBatchId', 'sourceIdeaCode', 'sourceLegacyCode', 'sourceSet',
  'reviewedByUid', 'sourceVerifiedByUid', 'marketingTaskId', 'marketingTaskNo', 'marketingItemId',
  'integrationRequestKey', 'dueDate', 'week', 'deliveryDay', 'reviewHistory', 'previousMarketingTasks',
  'integrationDraft', 'comments', 'reviewNotes']);

function rewriteString(value, key = '') {
  let out = value;
  if (key === 'hashtags' || /hashtag/i.test(key)) {
    out = out.replace(/#MZJ(?![A-Za-z0-9_؀-ۿ])/g, '');
    if (!out.includes('#محمد_ذعار_العجمي')) out = `#محمد_ذعار_العجمي ${out}`;
    return out.replace(/[ \t]{2,}/g, ' ').trim();
  }
  out = out
    // «MZJ (محمد ذعار العجمي...)» / «محمد ذعار العجمي (MZJ)» → one name only
    .replace(/MZJ\s*[\(（]\s*محمد\s*(?:بن\s*)?ذعار\s*العجمي(\s*للسيارات)?\s*[\)）]/g, (_, s) => BRAND_AR + (s || ''))
    .replace(/(محمد\s*(?:بن\s*)?ذعار\s*العجمي(?:\s*للسيارات)?)\s*[\(（]\s*MZJ\s*[\)）]/g, '$1')
    .replace(/(محمد\s*(?:بن\s*)?ذعار\s*العجمي(?:\s*للسيارات)?)\s*[—\-–|/]\s*MZJ(?![A-Za-z0-9])/g, '$1')
    .replace(/MZJ\s*[—\-–|/]\s*(محمد\s*(?:بن\s*)?ذعار\s*العجمي)/g, '$1')
    .replace(/#MZJ(?![A-Za-z0-9_؀-ۿ])/g, '#محمد_ذعار_العجمي')
    .replace(/(?<![A-Za-z0-9_\-.\/])MZJ(?![A-Za-z0-9_\-])/g, BRAND_AR)
    .replace(/#محمد_ذعار_العجمي(\s+#محمد_ذعار_العجمي)+/g, '#محمد_ذعار_العجمي')
    // «منقحة» wording
    .replace(/(?:و?ب?ال)منقح(?:ة|ه|ات)?(?![؀-ۿ])/g, 'بعد إخفاء البيانات الحساسة')
    .replace(/منقح(?:ة|ه|ات)?(?![؀-ۿ])/g, 'مع إخفاء البيانات الحساسة')
    .replace(/[ \t]{2,}/g, ' ');
  return out;
}

function rewriteValue(value, key = '') {
  if (typeof value === 'string') return rewriteString(value, key);
  if (Array.isArray(value)) return value.map(v => rewriteValue(v, key));
  if (value && typeof value === 'object' && !(typeof value.toDate === 'function')) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SKIP_KEYS.has(k) ? v : rewriteValue(v, key === 'hashtagsByPlatform' ? 'hashtags' : k);
    }
    return out;
  }
  return value;
}

// Returns only the top-level fields that actually change.
function rewriteIdea(data) {
  const changes = {};
  for (const [k, v] of Object.entries(data)) {
    if (SKIP_KEYS.has(k) || v == null || typeof v === 'number' || typeof v === 'boolean') continue;
    if (typeof v === 'object' && typeof v.toDate === 'function') continue;
    const next = rewriteValue(v, k);
    if (JSON.stringify(next) !== JSON.stringify(v)) changes[k] = next;
  }
  return changes;
}

const MAX_DELETE = 300;
const CODE_RE = /^[A-Za-z0-9._-]{1,80}$/;

// Delete generated ideas (assets) safely: only ideas created by Claude through
// this API (source === 'claude'). Ideas already linked to a Marketing task are
// kept unless force === true. Codes are also removed from every inspiration's
// generatedIdeas; an inspiration left with no ideas returns to «جديد».
async function deleteIdeas(db, codes, { force = false } = {}) {
  const planRef = db.collection('contentPlans').doc(PLAN_ID);
  const assetsRef = planRef.collection('assets');
  const inspirationsRef = planRef.collection('inspirations');
  const unique = [...new Set(codes.map(c => String(c || '').trim()).filter(c => CODE_RE.test(c)))].slice(0, MAX_DELETE);
  const deleted = [], notFound = [], protectedCodes = [], linked = [];
  if (!unique.length) return { deleted, notFound, protected: protectedCodes, linked };

  const snaps = await db.getAll(...unique.map(c => assetsRef.doc(c)));
  const toDelete = [];
  snaps.forEach((snap, i) => {
    const code = unique[i];
    if (!snap.exists) { notFound.push(code); return; }
    const d = snap.data();
    if (d.source !== 'claude') { protectedCodes.push(code); return; }
    if (d.marketingTaskId && !force) { linked.push(code); return; }
    toDelete.push(snap.ref);
    deleted.push(code);
  });

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    toDelete.slice(i, i + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  if (deleted.length) {
    const insSnap = await inspirationsRef.get();
    const set = new Set(deleted);
    const batch = db.batch();
    let writes = 0;
    insSnap.docs.forEach(doc => {
      const list = Array.isArray(doc.data().generatedIdeas) ? doc.data().generatedIdeas : [];
      if (!list.some(c => set.has(c))) return;
      const remaining = list.filter(c => !set.has(c));
      const update = { generatedIdeas: remaining, updatedAt: FieldValue.serverTimestamp() };
      if (!remaining.length && doc.data().status === 'تم التوليد') update.status = 'جديد';
      batch.update(doc.ref, update);
      writes++;
    });
    if (writes) await batch.commit();
  }
  return { deleted, notFound, protected: protectedCodes, linked };
}

// ─── Handler ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();

  // CORS for Claude integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (method === 'OPTIONS') return res.status(204).end();

  try {
    await authorize(req);
  } catch (err) {
    return responseJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const action = String(req.query?.action || '').trim();

  try {
    const db = getDb();
    const inspirationsRef = db.collection('contentPlans').doc(PLAN_ID).collection('inspirations');

    // ── GET /api/inspirations?action=list ─────────────────────────
    // Returns all inspirations (optionally filtered by status)
    if (method === 'GET' && action === 'list') {
      const statusFilter = String(req.query?.status || '').trim();
      let query = inspirationsRef.orderBy('createdAt', 'desc');
      if (['جديد', 'تم التوليد', 'مؤرشف'].includes(statusFilter)) {
        query = inspirationsRef.where('status', '==', statusFilter).orderBy('createdAt', 'desc');
      }
      const snap = await query.limit(200).get();
      const items = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: d.id,
          type: d.type,
          text: d.text,
          tags: d.tags || [],
          status: d.status,
          generatedIdeas: d.generatedIdeas || [],
          notes: d.notes || '',
          createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        };
      });
      return responseJson(res, 200, { ok: true, items, total: items.length });
    }

    // ── GET /api/inspirations?action=ideas ────────────────────────
    // Returns existing ideas (for Claude to avoid duplicates)
    if (method === 'GET' && action === 'ideas') {
      const assetsRef = db.collection('contentPlans').doc(PLAN_ID).collection('assets');
      const snap = await assetsRef.get();
      const ideas = snap.docs.map(doc => {
        const d = doc.data();
        return {
          code: d.code,
          title: d.title,
          kind: d.kind,
          marketingCategory: d.marketingCategory || '',
          status: d.status || '',
          retiredFromIdeaBank: d.retiredFromIdeaBank || false,
          source: d.source || '',
          inspirationId: d.inspirationId || '',
        };
      });
      return responseJson(res, 200, { ok: true, ideas, total: ideas.length });
    }

    // ── POST /api/inspirations?action=push-ideas ─────────────────
    // Claude pushes full ideas into assets collection + updates inspiration
    if (method === 'POST' && action === 'push-ideas') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      const inspirationId = String(body?.inspirationId || '').trim();
      const ideas = Array.isArray(body?.ideas) ? body.ideas : [];
      const notes = String(body?.notes || '').trim().slice(0, 500);

      if (!inspirationId) return responseJson(res, 400, { ok: false, error: 'inspirationId required' });
      if (!ideas.length) return responseJson(res, 400, { ok: false, error: 'ideas array required' });

      const docRef = inspirationsRef.doc(inspirationId);
      const snap = await docRef.get();
      if (!snap.exists) return responseJson(res, 404, { ok: false, error: 'Inspiration not found' });

      // Validate + normalize with the same importer the planner uses (site/idea-import.js),
      // so every field the brief page shows is stored with the exact names it expects.
      // Ideas whose code or title already exists are skipped as duplicates.
      const assetsRef = db.collection('contentPlans').doc(PLAN_ID).collection('assets');
      const existingSnap = await assetsRef.get();
      const existingPlan = { assets: existingSnap.docs.map(doc => doc.data()), carousels: [] };

      let prepared;
      try {
        prepared = prepareIdeaBatch(
          { schema: IDEA_BATCH_SCHEMA, batchId: inspirationId, ideas: body.ideas },
          existingPlan
        );
      } catch (err) {
        return responseJson(res, 400, { ok: false, error: err.message });
      }

      const batch = db.batch();
      const savedCodes = [];
      for (const item of prepared.items) {
        const doc = {
          ...item,
          ...rewriteIdea(item),
          source: 'claude',
          status: 'لم يبدأ',
          reviewStatus: 'بانتظار المراجعة',
          executor: '',
          inspirationId,
          retiredFromIdeaBank: false,
          createdAt: FieldValue.serverTimestamp(),
        };
        batch.create(assetsRef.doc(item.code), doc);
        savedCodes.push(item.code);
      }
      if (savedCodes.length) await batch.commit();

      // Inspiration status becomes «تم التوليد» once the batch has been processed
      await docRef.update({
        status: 'تم التوليد',
        generatedIdeas: FieldValue.arrayUnion(...savedCodes),
        notes: notes || snap.data().notes || '',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return responseJson(res, 200, {
        ok: true,
        updated: inspirationId,
        savedIdeas: savedCodes.length,
        codes: savedCodes,
        skippedDuplicates: prepared.duplicates,
      });
    }

    // ── POST /api/inspirations?action=create ─────────────────────
    // Create a new inspiration (for testing / external tools)
    if (method === 'POST' && action === 'create') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      const type = String(body?.type || 'other').trim();
      const text = String(body?.text || '').trim().slice(0, 2000);
      const tags = Array.isArray(body?.tags) ? body.tags.slice(0, 10).map(t => String(t).trim().slice(0, 50)) : [];

      if (!text) return responseJson(res, 400, { ok: false, error: 'text is required' });

      const id = `INS-${Date.now().toString(36).toUpperCase()}`;
      await inspirationsRef.doc(id).set({
        id,
        type,
        text,
        tags,
        status: 'جديد',
        generatedIdeas: [],
        notes: '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return responseJson(res, 201, { ok: true, id });
    }


    // ── POST /api/inspirations?action=rewrite-wording ────────────
    // Body: { dryRun?: boolean (default true), codes?: string[] }
    // Applies the wording rules (MZJ → محمد ذعار العجمي, remove «منقحة») to
    // every stored idea (or only the given codes). dryRun reports without writing.
    if (method === 'POST' && action === 'rewrite-wording') {
      const body = parseBody(req);
      const dryRun = body.dryRun !== false;
      const only = Array.isArray(body.codes) ? new Set(body.codes.map(String)) : null;
      const assetsRef = db.collection('contentPlans').doc(PLAN_ID).collection('assets');
      const snap = await assetsRef.get();
      const changed = [];
      const samples = [];
      let batch = db.batch(), pending = 0;
      for (const doc of snap.docs) {
        const data = doc.data();
        if (only && !only.has(data.code || doc.id)) continue;
        const changes = rewriteIdea(data);
        const keys = Object.keys(changes);
        if (!keys.length) continue;
        changed.push({ code: data.code || doc.id, fields: keys });
        if (samples.length < 6) samples.push({ code: data.code || doc.id, before: String(data.title || ''), after: String(changes.title ?? data.title ?? '') });
        if (!dryRun) {
          batch.update(doc.ref, { ...changes, updatedAt: FieldValue.serverTimestamp() });
          if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
        }
      }
      if (!dryRun && pending) await batch.commit();
      return responseJson(res, 200, { ok: true, dryRun, scanned: snap.size, changedIdeas: changed.length, changed, samples });
    }

    // ── POST /api/inspirations?action=delete-ideas ───────────────
    // Body: { codes?: string[], inspirationId?: string, force?: boolean }
    // Deletes Claude-generated ideas by code and/or all ideas of one inspiration.
    if ((method === 'POST' || method === 'DELETE') && action === 'delete-ideas') {
      const body = parseBody(req);
      let codes = Array.isArray(body.codes) ? body.codes : [];
      const inspirationId = String(body.inspirationId || '').trim();
      if (inspirationId) {
        const snap = await inspirationsRef.doc(inspirationId).get();
        if (!snap.exists) return responseJson(res, 404, { ok: false, error: 'Inspiration not found' });
        codes = codes.concat(snap.data().generatedIdeas || []);
      }
      if (!codes.length) return responseJson(res, 400, { ok: false, error: 'codes array or inspirationId required' });
      if (codes.length > MAX_DELETE) return responseJson(res, 400, { ok: false, error: `Max ${MAX_DELETE} codes per request` });
      const result = await deleteIdeas(db, codes, { force: body.force === true });
      return responseJson(res, 200, { ok: true, ...result });
    }

    // ── POST /api/inspirations?action=delete ─────────────────────
    // Body: { id: string, deleteIdeas?: boolean, force?: boolean }
    // Deletes an inspiration source; optionally its generated ideas too.
    if ((method === 'POST' || method === 'DELETE') && action === 'delete') {
      const body = parseBody(req);
      const id = String(body.id || req.query?.id || '').trim();
      if (!/^INS-[A-Z0-9]{4,30}$/.test(id)) return responseJson(res, 400, { ok: false, error: 'valid inspiration id required' });
      const docRef = inspirationsRef.doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return responseJson(res, 404, { ok: false, error: 'Inspiration not found' });
      let ideasResult = null;
      if (body.deleteIdeas === true) {
        ideasResult = await deleteIdeas(db, snap.data().generatedIdeas || [], { force: body.force === true });
      }
      await docRef.delete();
      return responseJson(res, 200, { ok: true, deleted: id, ideas: ideasResult });
    }

    return responseJson(res, 400, { ok: false, error: 'Unknown action. Use: list, ideas, push-ideas, create, delete, delete-ideas, rewrite-wording' });

  } catch (err) {
    console.error('Inspirations API error:', err?.message || err);
    return responseJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}
