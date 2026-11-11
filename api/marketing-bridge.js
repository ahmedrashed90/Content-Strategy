import { createVerify } from 'node:crypto';

// This function runs on the strategy project's server, not in the browser.
// It verifies the Firebase owner and forwards one of four allowlisted calls.
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const READ_RESOURCES = new Set(['stock','executors','catalog','assignments','agenda-products']);
let cachedCerts = null;
let cachedUntil = 0;

function responseJson(response, status, object) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(object);
}
function env(name) { return String(process.env[name] || '').trim(); }
function string(value, max = 100) { return typeof value === 'string' && value.length <= max ? value.trim() : ''; }
function base64UrlJson(text) {
  if (text.length > 7000 || !/^[A-Za-z0-9_-]+$/.test(text)) throw Error('Invalid token');
  return JSON.parse(Buffer.from(text,'base64url').toString('utf8'));
}
async function signingCertificates() {
  if (cachedCerts && Date.now() < cachedUntil) return cachedCerts;
  const response = await fetch(CERTS_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw Error('Unable to validate Firebase session');
  const next = await response.json();
  if (!next || typeof next !== 'object') throw Error('Invalid signing certificates');
  const cache = response.headers.get('cache-control') || '';
  const match = /max-age=(\d+)/.exec(cache);
  cachedUntil = Date.now() + Math.min(Number(match?.[1] || 300), 3600) * 1000;
  cachedCerts = next;
  return next;
}
async function requireOwner(request) {
  const projectId = env('MZJ_STRATEGY_FIREBASE_PROJECT_ID');
  const ownerUid = env('MZJ_STRATEGY_OWNER_UID');
  if (!projectId || !ownerUid) throw Error('Strategy Firebase owner is not configured');
  const headerValue = request.headers.authorization;
  const authHeader = typeof headerValue === 'string' ? headerValue : '';
  const match = /^Bearer ([A-Za-z0-9._-]{100,6500})$/.exec(authHeader);
  if (!match) throw Error('Firebase login is required');
  const parts = match[1].split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw Error('Invalid Firebase token');
  const protectedHeader = base64UrlJson(parts[0]);
  const payload = base64UrlJson(parts[1]);
  const now = Math.floor(Date.now()/1000);
  if (protectedHeader.alg !== 'RS256' || !string(protectedHeader.kid) ||
      payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` ||
      payload.sub !== ownerUid || !payload.sub || typeof payload.exp !== 'number' || payload.exp <= now ||
      typeof payload.iat !== 'number' || payload.iat > now ||
      typeof payload.auth_time !== 'number' || payload.auth_time > now) throw Error('Firebase owner verification failed');
  const certs = await signingCertificates();
  const certificate = certs[protectedHeader.kid];
  if (typeof certificate !== 'string') throw Error('Firebase signing key not found');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${parts[0]}.${parts[1]}`);
  verify.end();
  if (!verify.verify(certificate,Buffer.from(parts[2],'base64url'))) throw Error('Firebase signature invalid');
  return payload.sub;
}
function upstreamOrigin() {
  const raw = env('MZJ_MARKETING_API_BASE_URL') || 'https://mzj-platform.vercel.app';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^[A-Za-z0-9.-]+$/.test(url.hostname)) throw Error('Invalid Marketing API origin');
  return url.origin;
}

export default async function handler(request,response) {
  const method = String(request.method || 'GET').toUpperCase();
  const resource = string(request.query?.resource,30);
  const read = method === 'GET' && READ_RESOURCES.has(resource);
  let payload = request.body;
  if (method === 'POST' && typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const assign = method === 'POST' && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.action === 'assign';
  const agenda = method === 'POST' && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.action === 'agenda';
  if (!read && !assign && !agenda) return responseJson(response,405,{ok:false,error:'Unsupported integration action'});
  if ((assign || agenda) && Number(request.headers['content-length'] || 0) > 90000) return responseJson(response,413,{ok:false,error:'Assignment is too large'});
  try {
    await requireOwner(request);
  } catch (error) {
    return responseJson(response,401,{ok:false,error:'Unauthorized strategy session'});
  }
  const apiKey = env(read ? 'MZJ_STRATEGY_READ_KEY' : 'MZJ_STRATEGY_ASSIGN_KEY');
  if (apiKey.length < 32) return responseJson(response,503,{ok:false,error:'Server-to-server integration key is not configured'});
  try {
    const upstream = new URL(`/api/strategy-integration/${read ? resource : agenda ? 'agenda' : 'assignments'}`,upstreamOrigin());
    if (read && resource === 'assignments') {
      const taskId = string(request.query.taskId,36);
      if (!/^[0-9a-f-]{36}$/i.test(taskId)) return responseJson(response,400,{ok:false,error:'taskId is required'});
      upstream.searchParams.set('taskId',taskId);
    }
    const upstreamResponse = await fetch(upstream,{
      method:read?'GET':'POST',
      headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json',...((assign||agenda)?{'Content-Type':'application/json'}:{})},
      ...((assign||agenda)?{body:JSON.stringify((({action,...fields})=>fields)(payload))}:{}),
      signal:AbortSignal.timeout(20000),
      redirect:'error',
    });
    const body = await upstreamResponse.json().catch(()=>({ok:false,error:'Invalid Marketing API response'}));
    return responseJson(response,upstreamResponse.status,body);
  } catch(error) {
    console.error('Strategy Marketing bridge unavailable', {type:error?.name || 'Error'});
    return responseJson(response,502,{ok:false,error:'Unable to contact the Marketing integration API'});
  }
}
