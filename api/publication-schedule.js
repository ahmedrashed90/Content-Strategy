/** Owner-only automatic scheduling through Storrito. Default is a dry run: nothing is sent unless confirm===true. */
import { FieldValue } from 'firebase-admin/firestore';
import { requireOwner, json, PublicationError, uuid, agendaDetails, agendaRef, marketingOrigin, marketingKey } from './_publication-store.js';
import { StorritoError, storritoConfig, storritoCall, uploadTempBlob, deterministicUuid, classifyEntry, pickFile, buildCaption, validatePublishAt, buildStoryHtml, resolveSocialTarget, resolveTikTok } from '../lib/storrito.js';

const MAX_ITEMS = 10;
const ENTRY_ID = /^[0-9a-f-]{36}:(?:[0-9a-f-]{36}|unassigned)$/i;
const jobId = entryId => entryId.replace(':', '_');

async function fetchMarketingFile(agendaId, fileId) {
  const url = new URL('/api/strategy-integration/publication-file', marketingOrigin());
  url.searchParams.set('planId', agendaId); url.searchParams.set('fileId', fileId);
  let res;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${marketingKey()}`, Accept: 'application/octet-stream,*/*' }, redirect: 'error', signal: AbortSignal.timeout(85000) }); }
  catch { throw new PublicationError(502, 'تعذر الحصول على الملف الفعلي من التسويق'); }
  if (!res.ok) throw new PublicationError(res.status === 404 ? 404 : 502, 'الملف النهائي غير متاح أو تم إلغاء اعتماده');
  const type = String(res.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (type.includes('json') || type.includes('html')) throw new PublicationError(502, 'المصدر لم يُرجع ملف الصورة أو الفيديو الفعلي');
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 100 * 1024 * 1024) throw new PublicationError(413, 'حجم الملف أكبر من 100MB');
  return Buffer.from(await res.arrayBuffer());
}

/** Builds the per-item plan without any external side effect. */
function planItem(entry, item, targets, now, social) {
  const base = { entryId: entry.id, requestNo: entry.requestNo, idea: entry.strategyIdeaTitle || entry.ideaName, platform: entry.platform?.name || '', postType: entry.postType?.name || '' };
  const kind = classifyEntry(entry);
  if (!kind.ok) return { ...base, state: 'unsupported', reason: kind.reason };
  if (entry.fileStatus !== 'ready') return { ...base, state: 'blocked', reason: 'الملف النهائي غير جاهز' };
  const file = pickFile(entry);
  if (!file) return { ...base, state: 'blocked', reason: 'لا يوجد ملف نهائي' };
  const caption = buildCaption(entry);
  if (!caption) return { ...base, state: 'blocked', reason: 'الكابشن فارغ، اكتبه واعتمده قبل الجدولة' };
  let publishAt;
  try { publishAt = validatePublishAt(item.publishAt, now); } catch (e) { return { ...base, state: 'blocked', reason: e.message }; }
  const tiktokId = targets.tiktokAccountId || (social ? resolveTikTok(social) : null);
  if (kind.kind === 'tiktok-post' && !tiktokId) return { ...base, state: 'blocked', reason: 'لم يُعثر على حساب تيك توك متصل في Storrito' };
  let target = null;
  if (kind.kind === 'social-post') {
    target = social ? resolveSocialTarget(social, kind.network, kind.typeWord) : null;
    if (!target) return { ...base, state: 'blocked', reason: `لم يُعثر على حساب ${kind.network} أو نوع النشر ${[].concat(kind.typeWord).join('/')} في Storrito (تحقق من ربط الحساب)` };
    const mediaKind = String(file.mimeType).startsWith('video/') ? 'video' : 'image';
    if (target.media.length && !target.media.includes(mediaKind)) return { ...base, state: 'blocked', reason: `هذا النوع (${target.label}) لا يقبل ${mediaKind === 'video' ? 'فيديو' : 'صورة'}، يقبل: ${target.media.join('/')}` };
    if (!target.captionPublished && caption) base.note = 'هذا النوع لا ينشر كابشن';
    if (target.maxCaptionLength && caption.length > target.maxCaptionLength) base.note = `الكابشن ${caption.length} حرف وسيُقصّ إلى ${target.maxCaptionLength}`;
  }
  return { ...base, state: 'ready', kind: kind.kind, publishAt, caption, file: { id: file.id, name: file.name, mimeType: file.mimeType, fileSize: file.fileSize, matchesSize: !!(entry.postType?.width && file.width === entry.postType.width && file.height === entry.postType.height) },
    storritoUuid: deterministicUuid(entry.id, file.id, publishAt, kind.kind), target, tiktokAccountId: tiktokId, note: base.note };
}

async function execute(agendaId, entry, plan, targets, config) {
  const bytes = await fetchMarketingFile(agendaId, plan.file.id);
  const mediaUrl = await uploadTempBlob(bytes, plan.file.mimeType, { config, tempBlobUuid: deterministicUuid('blob', plan.storritoUuid) });
  const html = buildStoryHtml(mediaUrl, plan.file.mimeType);
  let procedure, body;
  if (plan.kind === 'social-post') { procedure = 'schedule-social-post'; body = { html, socialAccountId: plan.target.socialAccountId, postType: plan.target.postType, socialPostUuid: plan.storritoUuid, text: plan.caption, date: plan.publishAt }; }
  else { procedure = 'schedule-tiktok-post'; body = { html, tiktokAccountId: plan.tiktokAccountId, tiktokPostUuid: plan.storritoUuid, date: plan.publishAt, title: plan.caption.slice(0, 90), description: plan.caption }; }
  const result = await storritoCall(procedure, body, { config, timeoutMs: 150000 });
  return { procedure, warnings: Array.isArray(result?.warnings) ? result.warnings.slice(0, 10) : [] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { ok: false, error: 'Method not allowed' }); }
  try {
    await requireOwner(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.action === 'accounts') {
      const config = storritoConfig();
      const [ig, tt] = await Promise.all([storritoCall('list-instagram-users', {}, { config }), storritoCall('list-tiktok-accounts', {}, { config })]);
      let social = null; try { social = await storritoCall('list-social-accounts', {}, { config }); } catch { social = { error: 'تعذر قراءة list-social-accounts' }; }
      return json(res, 200, { ok: true, instagram: ig, tiktok: tt, social });
    }
    if (!uuid(body.agendaId)) throw new PublicationError(400, 'معرّف الأجندة غير صالح');
    if (body.action === 'status') {
      const snap = await agendaRef(body.agendaId).collection('scheduleJobs').get();
      return json(res, 200, { ok: true, jobs: snap.docs.map(d => d.data()).map(j => ({ ...j, updatedAt: j.updatedAt?.toDate?.()?.toISOString?.() || null })) });
    }
    if (body.action !== 'schedule') throw new PublicationError(400, 'إجراء غير معروف');
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > MAX_ITEMS) throw new PublicationError(400, `أرسل من 1 إلى ${MAX_ITEMS} منشورات في الطلب الواحد`);
    if (items.some(i => typeof i?.entryId !== 'string' || !ENTRY_ID.test(i.entryId))) throw new PublicationError(400, 'معرّف منشور غير صالح');
    if (new Set(items.map(i => i.entryId)).size !== items.length) throw new PublicationError(400, 'منشور مكرر داخل الطلب');
    const targets = { instagramUsername: String(body.instagramUsername || '').replace(/^@/, '').slice(0, 60), tiktokAccountId: String(body.tiktokAccountId || '').slice(0, 120) };
    const detail = await agendaDetails(body.agendaId);
    const byId = new Map(detail.entries.map(e => [e.id, e]));
    const now = Date.now();
    let social = null;
    try { social = await storritoCall('list-social-accounts', {}, { config: storritoConfig() }); } catch { social = null; }
    const plans = items.map(item => { const entry = byId.get(item.entryId); return entry ? planItem(entry, item, targets, now, social) : { entryId: item.entryId, state: 'blocked', reason: 'المنشور غير موجود في الأجندة' }; });
    if (body.confirm !== true) return json(res, 200, { ok: true, dryRun: true, plans, note: 'معاينة فقط. لم يُرسل أي شيء. أعد الطلب مع confirm:true للجدولة الفعلية.' });
    const config = storritoConfig();
    const col = agendaRef(body.agendaId).collection('scheduleJobs');
    const results = [];
    for (const plan of plans) {
      if (plan.state !== 'ready') { results.push(plan); continue; }
      const ref = col.doc(jobId(plan.entryId));
      const existing = await ref.get();
      if (existing.exists && existing.data().state === 'scheduled' && existing.data().storritoUuid === plan.storritoUuid) { results.push({ ...plan, state: 'already-scheduled' }); continue; }
      try {
        const done = await execute(body.agendaId, byId.get(plan.entryId), plan, targets, config);
        await ref.set({ entryId: plan.entryId, state: 'scheduled', kind: plan.kind, storritoUuid: plan.storritoUuid, publishAt: plan.publishAt, fileId: plan.file.id, procedure: done.procedure, warnings: done.warnings, updatedAt: FieldValue.serverTimestamp() });
        results.push({ ...plan, state: 'scheduled', warnings: done.warnings });
      } catch (e) {
        const msg = e instanceof PublicationError || e instanceof StorritoError ? e.message : 'فشل غير متوقع أثناء الجدولة';
        await ref.set({ entryId: plan.entryId, state: 'failed', error: msg, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        results.push({ ...plan, state: 'failed', reason: msg });
      }
    }
    return json(res, 200, { ok: true, dryRun: false, results });
  } catch (err) {
    if (err instanceof PublicationError || err instanceof StorritoError) return json(res, err.status, { ok: false, error: err.message });
    if (err instanceof SyntaxError) return json(res, 400, { ok: false, error: 'طلب غير صالح' });
    console.error('Publication schedule error', { kind: err?.name || 'error' });
    return json(res, 500, { ok: false, error: 'تعذر تنفيذ الجدولة' });
  }
}
