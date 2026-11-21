import assert from 'node:assert/strict';
import { deterministicUuid, classifyEntry, pickFile, buildCaption, validatePublishAt, buildStoryHtml, storritoConfig, storritoCall, uploadTempBlob, StorritoError } from '../lib/storrito.js';

const e = (platform, type, extra = {}) => ({ platform: { code: '', name: platform }, postType: { name: type, width: 1080, height: 1920 }, files: [], ...extra });
assert.equal(classifyEntry(e('انستجرام', 'ريل')).kind, 'instagram-reel');
assert.equal(classifyEntry(e('انستجرام', 'ستوري')).kind, 'instagram-story');
assert.equal(classifyEntry(e('تيك توك', 'ستوري')).kind, 'tiktok-post');
assert.equal(classifyEntry(e('انستجرام', 'بوست صور')).ok, false);
assert.equal(classifyEntry(e('فيس بوك', 'ريل')).ok, false);
assert.equal(classifyEntry(e('سناب شات', 'Story')).ok, false);

const a = deterministicUuid('x', 'y'), b = deterministicUuid('x', 'y');
assert.equal(a, b); assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
assert.notEqual(a, deterministicUuid('x', 'z'));

assert.equal(buildCaption({ caption: '**مرحبا**', hashtags: '#MZJ' }), 'مرحبا\n\n#MZJ');
assert.equal(buildCaption({ caption: 'نص #MZJ', hashtags: '#MZJ' }), 'نص #MZJ');
assert.equal(buildCaption({ caption: '', hashtags: '' }), '');

const now = Date.parse('2026-11-21T12:00:00Z');
assert.equal(validatePublishAt('2026-11-22T14:00:00+03:00', now), '2026-11-22T11:00:00.000Z');
assert.throws(() => validatePublishAt('2026-11-21T12:05:00Z', now), /الماضي أو قريب/);
assert.throws(() => validatePublishAt('2026-11-20T12:00:00Z', now), /الماضي أو قريب/);
assert.throws(() => validatePublishAt('2026-11-22', now), /ISO/);
assert.throws(() => validatePublishAt('2027-06-01T12:00:00Z', now), /بعيد/);

assert.equal(pickFile({ postType: { width: 1080, height: 1920 }, files: [{ id: 1, width: 1, height: 1 }, { id: 2, width: 1080, height: 1920 }] }).id, 2);
assert.equal(pickFile({ files: [] }), null);
assert.match(buildStoryHtml('https://x/a"b.mp4', 'video/mp4'), /^<insta-story src="https:\/\/x\/a&quot;b\.mp4"><\/insta-story>$/);
assert.match(buildStoryHtml('https://x/a.png', 'image/png'), /<img src="https:\/\/x\/a\.png"/);

assert.throws(() => storritoConfig({}), StorritoError);
assert.throws(() => storritoConfig({ STORRITO_API_KEY: 'k', STORRITO_API_BASE_URL: 'https://evil.com/api/v1/' }), /storrito\.com/);
const cfg = storritoConfig({ STORRITO_API_KEY: 'k', STORRITO_API_BASE_URL: 'https://org-1.storrito.com/api/v1/' });
assert.equal(cfg.base, 'https://org-1.storrito.com/api/v1');

const calls = [];
const fakeFetch = async (url, opts) => {
  calls.push({ url: String(url), method: opts.method });
  if (String(url).endsWith('/create-temp-blob-upload-url')) return new Response(JSON.stringify({ uploadUrl: 'https://blob.example/put', url: 'https://blob.example/get' }), { status: 200 });
  if (String(url) === 'https://blob.example/put') return new Response('', { status: 200 });
  return new Response(JSON.stringify({ message: 'bad' }), { status: 400 });
};
assert.equal(await uploadTempBlob(Buffer.from('abc'), 'video/mp4', { fetchImpl: fakeFetch, config: cfg, tempBlobUuid: a }), 'https://blob.example/get');
assert.deepEqual(calls.map(c => c.method), ['POST', 'PUT']);
await assert.rejects(storritoCall('schedule-instagram-reel', {}, { fetchImpl: fakeFetch, config: cfg }), /400/);
await assert.rejects(uploadTempBlob(Buffer.alloc(0), 'video/mp4', { fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }), config: cfg }), /uploadUrl/);
console.log('storrito tests passed');
