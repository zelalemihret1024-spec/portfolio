// Zelalem.M — Cloudflare Worker
// Serves the static site from ./public and provides a small admin API.
// Storage: one KV namespace bound as CONTENT. Admin password: secret ADMIN_PASSWORD.

const MAX_UPLOAD = 24 * 1024 * 1024; // KV value limit is 25 MiB
const MAX_JSON = 900 * 1024;
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ALLOWED_MEDIA = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime))$/;

const enc = new TextEncoder();

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) {
    // still do a pass so timing doesn't leak length
    let x = 1;
    for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
    return false;
  }
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const adminKey = (env) => env.ADMIN_PASSWORD + '|' + String(env.ADMIN_EMAIL || '').trim().toLowerCase();

async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(exp);
  return `${payload}.${await hmac(adminKey(env), 'session:' + payload)}`;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)adm=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = decodeURIComponent(m[1]).split('.');
  if (!payload || !sig || Number(payload) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(adminKey(env), 'session:' + payload));
}

// Writes must come from our own admin page (custom header) — blocks cross-site form posts.
const looksSameSite = (request) => request.headers.get('x-admin') === '1';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function publicView(c) {
  if (!c) return null;
  const vis = (list) => (Array.isArray(list) ? list.filter((x) => x && x.visible !== false) : list);
  return { ...c, projects: vis(c.projects), videos: vis(c.videos), services: vis(c.services) };
}

async function readContent(env) {
  const raw = await env.CONTENT.get('content');
  return raw ? JSON.parse(raw) : null;
}

async function handleLogin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'ADMIN_PASSWORD is not set yet. Add it in Cloudflare → your Worker → Settings → Variables and Secrets.' }, 503);
  }
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const failKey = 'fail:' + ip;
  const fails = Number((await env.CONTENT.get(failKey)) || 0);
  if (fails >= 10) return json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, 429);

  let body = {};
  try { body = await request.json(); } catch {}
  const norm = (v) => String(v || '').trim().toLowerCase();
  const emailOk = !env.ADMIN_EMAIL || (typeof body.email === 'string' && safeEqual(norm(body.email), norm(env.ADMIN_EMAIL)));
  const passOk = typeof body.password === 'string' && safeEqual(body.password, env.ADMIN_PASSWORD);
  const ok = emailOk && passOk;
  if (!ok) {
    await env.CONTENT.put(failKey, String(fails + 1), { expirationTtl: 900 });
    await new Promise((r) => setTimeout(r, 700));
    return json({ error: 'Wrong email or password.' }, 401);
  }
  if (fails) await env.CONTENT.delete(failKey);
  const token = await makeToken(env);
  return json({ ok: true }, 200, {
    'set-cookie': `adm=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`,
  });
}

async function handleUpload(request, env) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MEDIA.test(type)) return json({ error: 'Only JPG, PNG, WebP, GIF, AVIF images and MP4, WebM, MOV videos are allowed.' }, 415);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_UPLOAD) return json({ error: 'File is too large (max 24 MB). For bigger videos, paste a YouTube or Vimeo link instead.' }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD) return json({ error: 'File is too large (max 24 MB). For bigger videos, paste a YouTube or Vimeo link instead.' }, 413);
  if (!buf.byteLength) return json({ error: 'Empty file.' }, 400);
  const id = uid();
  const name = (request.headers.get('x-filename') || '').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  await env.CONTENT.put('media:' + id, buf, { metadata: { type, size: buf.byteLength, name } });
  return json({ ok: true, url: '/media/' + id, id, type, size: buf.byteLength });
}

async function handleMedia(request, env, id) {
  const { value, metadata } = await env.CONTENT.getWithMetadata('media:' + id, 'arrayBuffer');
  if (!value) return new Response('Not found', { status: 404 });
  const type = (metadata && metadata.type) || 'application/octet-stream';
  const total = value.byteLength;
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  const range = request.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] === '' ? Math.max(0, total - Number(m[2])) : Number(m[1]);
      let end = m[1] === '' || m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
      if (start > end || start >= total) {
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
      }
      return new Response(value.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': String(end - start + 1) },
      });
    }
  }
  return new Response(request.method === 'HEAD' ? null : value, { headers: { ...headers, 'content-length': String(total) } });
}

async function handleContact(request, env) {
  let b = {};
  try { b = await request.json(); } catch {}
  if (b.website) return json({ ok: true }); // honeypot
  const clip = (v, n) => String(v || '').trim().slice(0, n);
  const msg = { name: clip(b.name, 120), email: clip(b.email, 160), subject: clip(b.subject, 200), message: clip(b.message, 4000), at: new Date().toISOString() };
  if (!msg.name || !msg.message || !/^\S+@\S+\.\S+$/.test(msg.email)) return json({ error: 'Please fill in your name, a valid email and a message.' }, 400);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const rk = 'rate:' + ip;
  const n = Number((await env.CONTENT.get(rk)) || 0);
  if (n >= 5) return json({ error: 'Too many messages. Please try again later.' }, 429);
  await env.CONTENT.put(rk, String(n + 1), { expirationTtl: 3600 });
  await env.CONTENT.put('msg:' + uid(), JSON.stringify(msg));
  return json({ ok: true });
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/content' && method === 'GET') return json({ content: publicView(await readContent(env)) });
  if (path === '/api/contact' && method === 'POST') return handleContact(request, env);
  if (path === '/api/login' && method === 'POST') return handleLogin(request, env);
  if (path === '/api/logout') {
    return json({ ok: true }, 200, { 'set-cookie': 'adm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (path === '/api/session') {
    return json({ admin: await isAdmin(request, env), configured: Boolean(env.ADMIN_PASSWORD), needsEmail: Boolean(env.ADMIN_EMAIL) });
  }

  // ---- everything below needs the admin cookie ----
  if (!(await isAdmin(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (method !== 'GET' && !looksSameSite(request)) return json({ error: 'Bad request.' }, 403);

  if (path === '/api/admin/content' && method === 'GET') return json({ content: await readContent(env) });

  if (path === '/api/admin/content' && method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_JSON) return json({ error: 'Content is too large.' }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.projects) || !Array.isArray(data.videos) || !Array.isArray(data.services) || typeof data.site !== 'object') {
      return json({ error: 'Content is missing required sections.' }, 400);
    }
    await env.CONTENT.put('content', JSON.stringify(data));
    return json({ ok: true });
  }

  if (path === '/api/admin/upload' && method === 'POST') return handleUpload(request, env);

  if (path === '/api/admin/media' && method === 'GET') {
    const list = await env.CONTENT.list({ prefix: 'media:' });
    return json({ media: list.keys.map((k) => ({ id: k.name.slice(6), url: '/media/' + k.name.slice(6), ...(k.metadata || {}) })) });
  }
  const mdel = path.match(/^\/api\/admin\/media\/([\w-]+)$/);
  if (mdel && method === 'DELETE') {
    await env.CONTENT.delete('media:' + mdel[1]);
    return json({ ok: true });
  }

  if (path === '/api/admin/messages' && method === 'GET') {
    const list = await env.CONTENT.list({ prefix: 'msg:' });
    const items = await Promise.all(list.keys.map(async (k) => ({ id: k.name.slice(4), ...JSON.parse((await env.CONTENT.get(k.name)) || '{}') })));
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json({ messages: items });
  }
  const dmsg = path.match(/^\/api\/admin\/messages\/([\w-]+)$/);
  if (dmsg && method === 'DELETE') {
    await env.CONTENT.delete('msg:' + dmsg[1]);
    return json({ ok: true });
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      const m = url.pathname.match(/^\/media\/([\w-]+)$/);
      if (m && (request.method === 'GET' || request.method === 'HEAD')) return await handleMedia(request, env, m[1]);
    } catch (e) {
      return json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
