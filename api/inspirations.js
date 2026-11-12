import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

// ─── Auth: API key check ─────────────────────────────────────────
function requireApiKey(req) {
  const key = env('MZJ_INSPIRATIONS_API_KEY');
  if (key.length < 32) throw Error('Inspirations API key not configured');
  const header = String(req.headers.authorization || '');
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || match[1] !== key) throw Error('Unauthorized');
}

// ─── Handler ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();

  // CORS for Claude integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (method === 'OPTIONS') return res.status(204).end();

  try {
    requireApiKey(req);
  } catch (err) {
    return responseJson(res, 401, { ok: false, error: err.message });
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
      const ideas = Array.isArray(body?.ideas) ? body.ideas.slice(0, 20) : [];
      const notes = String(body?.notes || '').trim().slice(0, 500);

      if (!inspirationId) return responseJson(res, 400, { ok: false, error: 'inspirationId required' });
      if (!ideas.length) return responseJson(res, 400, { ok: false, error: 'ideas array required' });

      const docRef = inspirationsRef.doc(inspirationId);
      const snap = await docRef.get();
      if (!snap.exists) return responseJson(res, 404, { ok: false, error: 'Inspiration not found' });

      // Save each idea as a full asset with source:'claude' + reviewStatus:'بانتظار المراجعة'
      const assetsRef = db.collection('contentPlans').doc(PLAN_ID).collection('assets');
      const savedCodes = [];
      for (const idea of ideas) {
        const code = String(idea.code || '').trim();
        if (!code) continue;
        // Check if code already exists
        const existing = await assetsRef.doc(code).get();
        if (existing.exists) continue;

        await assetsRef.doc(code).set({
          code,
          title: String(idea.title || '').trim().slice(0, 200),
          kind: idea.contentType === 'video' ? 'video' : 'image',
          imageCount: idea.imageCount || (idea.contentType === 'video' ? 0 : 1),
          marketingCategory: String(idea.category || '').trim(),
          message: String(idea.description || '').trim().slice(0, 2000),
          hook: String(idea.hook || '').trim().slice(0, 500),
          audienceAndGoal: String(idea.audienceAndGoal || '').trim().slice(0, 1000),
          brief: String(idea.brief || '').trim().slice(0, 3000),
          platform: String(idea.platform || '').trim(),
          executor: '',
          dueDate: '',
          status: 'لم يبدأ',
          reviewStatus: 'بانتظار المراجعة',
          source: 'claude',
          inspirationId,
          retiredFromIdeaBank: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        savedCodes.push(code);
      }

      // Update inspiration status
      await docRef.update({
        status: 'تم التوليد',
        generatedIdeas: FieldValue.arrayUnion(...savedCodes),
        notes: notes || snap.data().notes || '',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return responseJson(res, 200, { ok: true, updated: inspirationId, savedIdeas: savedCodes.length, codes: savedCodes });
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

    return responseJson(res, 400, { ok: false, error: 'Unknown action. Use: list, ideas, push-ideas, create' });

  } catch (err) {
    console.error('Inspirations API error:', err?.message || err);
    return responseJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}
