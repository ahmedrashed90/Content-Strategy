/** Storrito API client + pure helpers for automatic scheduling. No secrets are logged. */
import { createHash } from 'node:crypto';

export class StorritoError extends Error { constructor(status, message) { super(message); this.status = status; } }

/** Deterministic UUID so retries of the same slot/file/time never create duplicates. */
export function deterministicUuid(...parts) {
  const h = createHash('sha256').update(parts.join('|')).digest('hex');
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v.toLowerCase();
}

const has = (value, ...needles) => { const t = String(value || '').toLowerCase(); return needles.some(n => t.includes(n)); };

/** Maps one synced publication entry to a Storrito procedure, or explains why it is unsupported. */
export function classifyEntry(entry) {
  const platformText = `${entry.platform?.code || ''} ${entry.platform?.name || ''}`;
  const typeText = `${entry.postType?.name || ''}`;
  const isReel = has(typeText, 'ريل', 'reel', 'فيديو', 'video');
  const isStory = has(typeText, 'ستوري', 'story');
  if (has(platformText, 'instagram', 'انستجرام', 'إنستجرام')) {
    if (isReel) return { ok: true, kind: 'instagram-reel' };
    if (isStory) return { ok: true, kind: 'instagram-story' };
    return { ok: false, reason: 'نوع نشر انستجرام غير مدعوم في الجدولة الآلية (بوست صور غير مغطى حاليًا)' };
  }
  if (has(platformText, 'tiktok', 'تيك')) return { ok: true, kind: 'tiktok-post' };
  if (has(platformText, 'snap', 'سناب')) {
    if (has(typeText, 'spotlight')) return { ok: true, kind: 'social-post', network: 'snapchat', typeWord: 'spotlight' };
    if (isStory) return { ok: true, kind: 'social-post', network: 'snapchat', typeWord: 'story' };
    return { ok: false, reason: 'نوع نشر سناب غير مدعوم' };
  }
  if (has(platformText, 'facebook', 'فيس')) {
    if (isReel) return { ok: true, kind: 'social-post', network: 'facebook', typeWord: 'reel' };
    if (isStory) return { ok: true, kind: 'social-post', network: 'facebook', typeWord: 'story' };
    return { ok: false, reason: 'بوست صور فيسبوك غير مغطى في الجدولة الآلية' };
  }
  return { ok: false, reason: 'منصة غير معروفة' };
}

/** Picks the final file for the entry. Prefers an exact width/height match with the required size. */
export function pickFile(entry) {
  const files = Array.isArray(entry.files) ? entry.files : [];
  if (!files.length) return null;
  const w = entry.postType?.width, h = entry.postType?.height;
  const exact = files.filter(f => w && h && f.width === w && f.height === h);
  return (exact[0] || files[0]) || null;
}

/** Caption = copy + hashtags (hashtags appended only if they are not already inside the caption). */
export function buildCaption(entry) {
  const caption = String(entry.caption || '').replace(/\*\*/g, '').trim();
  const tags = String(entry.hashtags || '').trim();
  if (!tags || caption.includes(tags)) return caption;
  return caption ? `${caption}\n\n${tags}` : tags;
}

/** Refuses past or near-immediate times: omitting a date in Storrito/Meta publishes at once. */
export function validatePublishAt(value, now = Date.now(), minLeadMs = 10 * 60 * 1000) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new StorritoError(400, 'موعد النشر يجب أن يكون بصيغة ISO مع المنطقة الزمنية، مثل 2026-11-22T14:00:00+03:00');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new StorritoError(400, 'موعد النشر غير صالح');
  if (ms < now + minLeadMs) throw new StorritoError(400, 'موعد النشر في الماضي أو قريب جدًا (الحد الأدنى 10 دقائق من الآن) حتى لا ينشر فورًا');
  if (ms > now + 60 * 24 * 3600 * 1000) throw new StorritoError(400, 'موعد النشر بعيد جدًا (أكثر من 60 يومًا)');
  return new Date(ms).toISOString();
}

export function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The <insta-story> page Storrito renders: just the media, full bleed, no stickers. */
export function buildStoryHtml(mediaUrl, mimeType) {
  const safe = escapeHtml(mediaUrl);
  if (String(mimeType).startsWith('video/')) return `<insta-story src="${safe}"></insta-story>`;
  return `<insta-story><img src="${safe}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover"></insta-story>`;
}

export function storritoConfig(env = process.env) {
  const key = String(env.STORRITO_API_KEY || '').trim();
  const raw = String(env.STORRITO_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!key || !raw) throw new StorritoError(503, 'إعدادات Storrito غير مكتملة على السيرفر (STORRITO_API_KEY وSTORRITO_API_BASE_URL)');
  let url;
  try { url = new URL(raw); } catch { throw new StorritoError(503, 'STORRITO_API_BASE_URL غير صالح'); }
  if (url.protocol !== 'https:' || !/\.storrito\.com$/i.test(url.hostname)) throw new StorritoError(503, 'STORRITO_API_BASE_URL يجب أن يكون HTTPS على نطاق storrito.com');
  const base = url.pathname.replace(/\/+$/, '').endsWith('/api/v1') ? `${url.origin}${url.pathname.replace(/\/+$/, '')}` : `${url.origin}/api/v1`;
  return { key, base };
}

export async function storritoCall(procedure, body, { fetchImpl = fetch, config = storritoConfig(), timeoutMs = 120000 } = {}) {
  let res;
  try {
    res = await fetchImpl(`${config.base}/${procedure}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { throw new StorritoError(502, `تعذر الوصول إلى Storrito (${procedure})`); }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = typeof data?.message === 'string' ? data.message : (typeof data?.error === 'string' ? data.error : '');
    throw new StorritoError(res.status === 400 ? 400 : 502, `رفض Storrito الطلب (${procedure}، ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return data;
}

/** Uploads bytes through a presigned URL and returns the stable media URL Storrito expects in src. */
export async function uploadTempBlob(bytes, contentType, { fetchImpl = fetch, config, tempBlobUuid } = {}) {
  if (bytes.byteLength > 100 * 1024 * 1024) throw new StorritoError(413, 'حجم الملف أكبر من حد Storrito (100MB)');
  const created = await storritoCall('create-temp-blob-upload-url', { tempBlobUuid, contentType, contentLengthBytes: bytes.byteLength }, { fetchImpl, config });
  const uploadUrl = created?.uploadUrl || created?.upload_url;
  const stableUrl = created?.url || created?.blobUrl || created?.publicUrl;
  if (!uploadUrl || !stableUrl) throw new StorritoError(502, 'استجابة Storrito لم تتضمن uploadUrl وurl كما في التوثيق، راجع الاستجابة الفعلية');
  let put;
  try { put = await fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(120000) }); }
  catch { throw new StorritoError(502, 'تعذر رفع الملف إلى Storrito'); }
  if (!put.ok) throw new StorritoError(502, `فشل رفع الملف إلى Storrito (${put.status})`);
  return stableUrl;
}

/** Finds socialAccountId + postType from list-social-accounts. The response shape is only loosely documented,
 * so matching is tolerant and the chosen values are shown in the dry-run plan for verification. */
export function resolveSocialTarget(response, network, typeWord) {
  const list = Array.isArray(response) ? response : (response?.socialAccounts || response?.accounts || []);
  for (const account of Array.isArray(list) ? list : []) {
    const { postTypes, ...rest } = account || {};
    if (!JSON.stringify(rest).toLowerCase().includes(network)) continue;
    for (const pt of Array.isArray(postTypes) ? postTypes : []) {
      if (!JSON.stringify(pt).toLowerCase().includes(typeWord)) continue;
      const postType = typeof pt === 'string' ? pt : (pt.postType ?? pt.key ?? pt.id ?? pt.value);
      const socialAccountId = account.socialAccountId ?? account.id;
      if (postType && socialAccountId) return { socialAccountId, postType, label: JSON.stringify(pt).slice(0, 160) };
    }
  }
  return null;
}
