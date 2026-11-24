/** Zernio API client + pure helpers. Used for post types Storrito cannot publish (IG/FB photo posts, Google). No secrets are logged. */
import { StorritoError, deterministicUuid } from './storrito.js';

const has = (value, ...needles) => { const t = String(value || '').toLowerCase(); return needles.some(n => t.includes(n)); };
export const ZERNIO_BASE = 'https://zernio.com/api/v1';

export function zernioConfig(env = process.env) {
  const key = String(env.ZERNIO_API_KEY || '').trim();
  if (!key) throw new StorritoError(503, 'مفتاح Zernio غير مضبوط على السيرفر (ZERNIO_API_KEY)');
  return { key, base: ZERNIO_BASE };
}

export async function zernioCall(method, path, body, { fetchImpl = fetch, config = zernioConfig(), headers = {}, timeoutMs = 120000 } = {}) {
  let res;
  try {
    res = await fetchImpl(`${config.base}${path}`, {
      method, headers: { Authorization: `Bearer ${config.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { throw new StorritoError(502, `تعذر الوصول إلى Zernio (${path})`); }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = typeof data?.error === 'string' ? data.error : (typeof data?.message === 'string' ? data.message : '');
    throw new StorritoError(res.status === 400 ? 400 : 502, `رفض Zernio الطلب (${path}، ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return data;
}

/** Entries Storrito can't do but Zernio can: Instagram/Facebook photo posts and Google Business posts. */
export function classifyZernio(entry) {
  const platformText = `${entry.platform?.code || ''} ${entry.platform?.name || ''}`;
  const typeText = `${entry.postType?.name || ''}`;
  if (has(typeText, 'كلمات', 'keyword', 'search')) return { ok: false, reason: 'كلمات البحث لا تُنشر كمنشور' };
  if (has(platformText, 'instagram', 'انستجرام', 'إنستجرام')) return { ok: true, kind: 'zernio-post', network: 'instagram', slugs: ['instagram'] };
  if (has(platformText, 'facebook', 'فيس')) return { ok: true, kind: 'zernio-post', network: 'facebook', slugs: ['facebook'] };
  if (has(platformText, 'google', 'جوجل')) return { ok: true, kind: 'zernio-post', network: 'google', slugs: ['googlebusiness', 'google_business', 'googlemybusiness', 'google'] };
  return { ok: false, reason: 'منصة غير مدعومة في Zernio' };
}

export function resolveZernioAccount(response, slugs) {
  const list = Array.isArray(response) ? response : (response?.accounts || response?.data || []);
  const wanted = slugs.map(s => s.toLowerCase());
  for (const a of Array.isArray(list) ? list : []) {
    if (a?.isActive === false || a?.disconnected) continue;
    if (!wanted.includes(String(a.platform || '').toLowerCase())) continue;
    const id = a._id ?? a.id;
    if (id) return { accountId: id, platform: String(a.platform).toLowerCase(), label: `${a.platform} · ${a.username || a.displayName || a.name || id}`.slice(0, 160) };
  }
  return null;
}

/** Presign + PUT upload; returns the publicUrl to use in mediaItems. */
export async function uploadZernioMedia(bytes, contentType, filename, { fetchImpl = fetch, config = zernioConfig() } = {}) {
  const presigned = await zernioCall('POST', '/media/presign', { filename: filename || 'file', contentType, size: bytes.byteLength }, { fetchImpl, config });
  if (!presigned?.uploadUrl || !presigned?.publicUrl) throw new StorritoError(502, 'استجابة Zernio لم تتضمن uploadUrl وpublicUrl');
  let put;
  try { put = await fetchImpl(presigned.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(120000) }); }
  catch { throw new StorritoError(502, 'تعذر رفع الملف إلى Zernio'); }
  if (!put.ok) throw new StorritoError(502, `فشل رفع الملف إلى Zernio (${put.status})`);
  return presigned.publicUrl;
}

/** Scheduled post with an Idempotency-Key so retries never duplicate. publishAt is an ISO instant from validatePublishAt. */
export async function createZernioPost({ accountId, platform, caption, mediaUrl, mimeType, publishAt, idempotencyKey }, { fetchImpl = fetch, config = zernioConfig() } = {}) {
  const body = {
    content: caption, mediaItems: [{ type: String(mimeType).startsWith('video/') ? 'video' : 'image', url: mediaUrl }],
    platforms: [{ platform, accountId }], scheduledFor: publishAt, timezone: 'Asia/Riyadh',
  };
  const data = await zernioCall('POST', '/posts', body, { fetchImpl, config, headers: { 'Idempotency-Key': idempotencyKey || deterministicUuid(accountId, mediaUrl, publishAt) } });
  return { postId: data?.post?._id || null, status: data?.post?.status || null, warnings: Array.isArray(data?.warnings) ? data.warnings.slice(0, 10) : [] };
}
