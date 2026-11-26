import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

const app = new Hono().basePath('/api');

const PAGE_SIZE = 20;
const JWT_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days
const PBKDF2_ITERATIONS = 100000;
const R2_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const D1_MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (chunked in D1 when > 200 KB)
const D1_CHUNK_BYTES = 200 * 1024;
const SESSION_COOKIE = 'arkive_session';
const RATE_LIMIT_WINDOW_SEC = 15 * 60; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,30}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// ── Base64 & Crypto Helpers ──

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return fromBase64(padded);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `${toBase64(salt)}:${toBase64(new Uint8Array(derivedBits))}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || storedHash.startsWith('MIGRATION_LOCKED:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const salt = fromBase64(parts[0]);
  const expected = fromBase64(parts[1]);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return constantTimeEqual(new Uint8Array(derivedBits), expected);
}

async function getHmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

async function signJwt(userId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ sub: userId, iat: now, exp: now + JWT_EXPIRY_SECONDS }))
  );
  const data = `${header}.${payload}`;
  const key = await getHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payloadB64, sigB64] = parts;
  const data = `${header}.${payloadB64}`;

  const key = await getHmacKey(secret, 'verify');
  const sigBytes = fromBase64Url(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }
  return payload.sub;
}

// ── Query & Formatting Helpers ──

function nowIso() {
  return new Date().toISOString();
}

function formatSpace(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    icon: row.icon,
    tag_id: row.tag_id || null,
    show_in_menu: Boolean(row.show_in_menu),
    share_link: row.share_link,
    created_at: row.created_at,
    ...(row.tag_name ? { tags: { name: row.tag_name } } : {}),
  };
}

function normalizePostRow(row, spaceMap, tagsByPost) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    subtitle: row.subtitle || '',
    body: row.body || '',
    is_markdown: Boolean(row.is_markdown),
    is_draft: Boolean(row.is_draft),
    is_pinned: Boolean(row.is_pinned),
    passphrase_hash: row.passphrase_hash || null,
    encrypted_body: row.encrypted_body || null,
    date_tag: row.date_tag || null,
    space_id: row.space_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    spaces: row.space_id ? spaceMap.get(row.space_id) || null : null,
    post_tags: tagsByPost.get(row.id) || [],
  };
}

async function enrichPosts(db, rawPosts) {
  if (!rawPosts || rawPosts.length === 0) return [];

  const spaceIds = [...new Set(rawPosts.map((p) => p.space_id).filter(Boolean))];
  const postIds = rawPosts.map((p) => p.id);

  const spaceMap = new Map();
  for (let i = 0; i < spaceIds.length; i += 50) {
    const chunk = spaceIds.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, name, icon, share_link FROM spaces WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    for (const s of results || []) {
      spaceMap.set(s.id, s);
    }
  }

  const tagsByPost = new Map();
  for (let i = 0; i < postIds.length; i += 50) {
    const chunk = postIds.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT pt.post_id, pt.tag_id, t.id AS tag_obj_id, t.name, t.pill_color, t.text_color
         FROM post_tags pt
         JOIN tags t ON t.id = pt.tag_id
         WHERE pt.post_id IN (${placeholders})
         ORDER BY t.name ASC`
      )
      .bind(...chunk)
      .all();
    for (const row of results || []) {
      if (!tagsByPost.has(row.post_id)) tagsByPost.set(row.post_id, []);
      tagsByPost.get(row.post_id).push({
        tag_id: row.tag_id,
        tags: {
          id: row.tag_obj_id,
          name: row.name,
          pill_color: row.pill_color,
          text_color: row.text_color,
        },
      });
    }
  }

  return rawPosts.map((post) => normalizePostRow(post, spaceMap, tagsByPost));
}

async function getMyUsername(db, userId) {
  const row = await db.prepare('SELECT username FROM profiles WHERE id = ?').bind(userId).first();
  return row?.username || null;
}

async function canAccessSpace(db, space, userId) {
  if (!space) return false;
  if (space.user_id === userId) return true;
  const username = await getMyUsername(db, userId);
  if (!username) return false;
  const membership = await db
    .prepare('SELECT id FROM space_members WHERE space_id = ? AND LOWER(member_username) = LOWER(?)')
    .bind(space.id, username)
    .first();
  return Boolean(membership);
}

function isSafeAvatarUrl(url) {
  if (url === null || url === undefined || url === '') return true;
  if (typeof url !== 'string') return false;
  return url.startsWith('/api/images/serve/') || /^https?:\/\//i.test(url);
}

async function cleanupUnusedOwnedImage(env, db, userId, imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  const prefix = `/api/images/serve/${userId}/`;
  if (!imageUrl.startsWith(prefix)) return;
  const key = imageUrl.slice('/api/images/serve/'.length);
  if (!key) return;

  const [usedInPost, usedInProfile] = await Promise.all([
    db.prepare('SELECT id FROM posts WHERE user_id = ? AND instr(body, ?) > 0 LIMIT 1').bind(userId, imageUrl).first(),
    db.prepare('SELECT id FROM profiles WHERE id = ? AND avatar_url = ? LIMIT 1').bind(userId, imageUrl).first(),
  ]);

  if (usedInPost || usedInProfile) return;

  if (env.IMAGES) {
    try {
      await env.IMAGES.delete(key);
    } catch {
      // ignore R2 delete error
    }
  }
  await db.prepare('DELETE FROM media WHERE key = ? AND user_id = ?').bind(key, userId).run();
}

// ── Env & Auth Middleware ──

app.use('*', async (c, next) => {
  if (!c.env?.DB) {
    return c.json({ error: 'Database binding (DB) is not configured.' }, 500);
  }
  await next();
});

function buildSessionCookie(token, isHttps, maxAge = JWT_EXPIRY_SECONDS) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

function getClientIp(c) {
  return (
    c.req.header('CF-Connecting-IP') ||
    (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
    'local'
  );
}

async function checkAuthRateLimit(db, action, ip) {
  const key = `${action}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.prepare('SELECT * FROM auth_rate_limits WHERE key = ?').bind(key).first();
    if (!row) {
      await db
        .prepare('INSERT INTO auth_rate_limits (key, attempts, window_start, blocked_until) VALUES (?, 1, ?, 0)')
        .bind(key, now)
        .run();
      return { allowed: true };
    }
    if (row.blocked_until > now) {
      return { allowed: false, retryAfter: row.blocked_until - now };
    }
    if (now - row.window_start > RATE_LIMIT_WINDOW_SEC) {
      await db
        .prepare('UPDATE auth_rate_limits SET attempts = 1, window_start = ?, blocked_until = 0 WHERE key = ?')
        .bind(now, key)
        .run();
      return { allowed: true };
    }
    const nextAttempts = row.attempts + 1;
    const blockedUntil = nextAttempts > RATE_LIMIT_MAX_ATTEMPTS ? now + RATE_LIMIT_WINDOW_SEC : 0;
    await db
      .prepare('UPDATE auth_rate_limits SET attempts = ?, blocked_until = ? WHERE key = ?')
      .bind(nextAttempts, blockedUntil, key)
      .run();
    return blockedUntil > now ? { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SEC } : { allowed: true };
  } catch {
    return { allowed: true };
  }
}

async function clearAuthRateLimit(db, action, ip) {
  try {
    await db.prepare('DELETE FROM auth_rate_limits WHERE key = ?').bind(`${action}:${ip}`).run();
  } catch {
    // non-fatal
  }
}

async function requireAuth(c, next) {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Server misconfigured: JWT_SECRET secret is not set.' }, 500);
  }

  const cookies = parseCookies(c.req.header('Cookie') || '');
  let token = cookies[SESSION_COOKIE] || '';
  if (!token) {
    const authHeader = c.req.header('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  const userId = await verifyJwt(token, secret).catch(() => null);
  if (!userId) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }
  c.set('userId', userId);
  await next();
}

// ── Public Image Serving Route (unguessable UUID keys) ──

app.get('/images/serve/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/images\/serve\//, ''));
  if (!key || key.includes('..')) {
    return c.json({ error: 'Invalid image path' }, 400);
  }

  if (c.env.IMAGES) {
    const obj = await c.env.IMAGES.get(key);
    if (obj) {
      const headers = new Headers();
      headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { headers });
    }
  }

  const row = await c.env.DB.prepare('SELECT content_type, data FROM media WHERE key = ?')
    .bind(key)
    .first();

  if (!row) {
    return c.json({ error: 'Image not found' }, 404);
  }

  let bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data || []);

  if (bytes.byteLength === 0) {
    const { results: chunks } = await c.env.DB.prepare(
      'SELECT data FROM media_chunks WHERE key = ? ORDER BY idx ASC'
    )
      .bind(key)
      .all();
    if (!chunks || chunks.length === 0) {
      return c.json({ error: 'Image not found' }, 404);
    }
    const parts = chunks.map((ch) =>
      ch.data instanceof ArrayBuffer ? new Uint8Array(ch.data) : new Uint8Array(ch.data)
    );
    const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.byteLength;
    }
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': row.content_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// ── Auth Routes ──

app.post('/auth/register', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Server misconfigured: JWT_SECRET secret is not set.' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';

  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'Enter a valid email address' }, 400);
  }
  if (!USERNAME_RE.test(username)) {
    return c.json(
      { error: 'Username must be 2-30 characters using letters, numbers, dots, underscores, or hyphens' },
      400
    );
  }
  if (password.length < 6 || password.length > 128) {
    return c.json({ error: 'Password must be between 6 and 128 characters' }, 400);
  }

  const db = c.env.DB;
  const ip = getClientIp(c);
  const rate = await checkAuthRateLimit(db, 'register', ip);
  if (!rate.allowed) {
    return c.json({ error: 'Too many signup attempts. Try again in a few minutes.' }, 429);
  }

  const existingEmail = await db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
  if (existingEmail) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const existingUsername = await db
    .prepare('SELECT id FROM profiles WHERE LOWER(username) = LOWER(?)')
    .bind(username)
    .first();
  if (existingUsername) {
    return c.json({ error: 'Username is already taken' }, 409);
  }

  const userId = crypto.randomUUID();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(password);

  await db.batch([
    db
      .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, email, passwordHash, createdAt),
    db
      .prepare('INSERT INTO profiles (id, username, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, username, username, null, createdAt),
  ]);

  const token = await signJwt(userId, secret);
  const isHttps = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', buildSessionCookie(token, isHttps));
  return c.json(
    {
      user: { id: userId, email },
      profile: { id: userId, username, display_name: username, avatar_url: null, created_at: createdAt },
    },
    201
  );
});

app.post('/auth/login', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Server misconfigured: JWT_SECRET secret is not set.' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const db = c.env.DB;
  const ip = getClientIp(c);
  const rate = await checkAuthRateLimit(db, 'login', ip);
  if (!rate.allowed) {
    return c.json({ error: 'Too many sign-in attempts. Try again in a few minutes.' }, 429);
  }

  const userRow = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
  if (!userRow) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  if (userRow.password_hash?.startsWith('MIGRATION_LOCKED:')) {
    return c.json(
      { error: 'This migrated account needs a password set via scripts/reset-password.mjs (or sign in with Google).' },
      403
    );
  }
  if (userRow.password_hash?.startsWith('GOOGLE_OAUTH:')) {
    return c.json(
      { error: 'This account uses Google Sign-In. Continue with Google, or set a password in Profile settings.' },
      401
    );
  }

  const valid = await verifyPassword(password, userRow.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  await clearAuthRateLimit(db, 'login', ip);
  const profile = await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userRow.id).first();
  const token = await signJwt(userRow.id, secret);
  const isHttps = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', buildSessionCookie(token, isHttps));

  return c.json({
    user: { id: userRow.id, email: userRow.email },
    profile: profile || null,
  });
});

app.post('/auth/logout', async (c) => {
  const isHttps = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', buildSessionCookie('', isHttps, 0));
  return c.json({ ok: true });
});

function sanitizeRedirect(raw) {
  if (typeof raw !== 'string') return '/';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (name) cookies[name] = decodeURIComponent(val);
  }
  return cookies;
}

async function signOAuthState(payloadObj, secret) {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await getHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyOAuthState(cookieValue, secret) {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await getHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  if (!payload.state || !payload.codeVerifier || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

function buildOAuthCookie(value, isHttps, maxAge = 600) {
  const parts = [
    `arkive_oauth=${encodeURIComponent(value)}`,
    'Path=/api/auth/google',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

function redirectWithOAuthError(origin, message, clearCookieHeader = null) {
  const headers = new Headers({
    Location: `${origin}/login?error=${encodeURIComponent(message)}`,
  });
  if (clearCookieHeader) headers.append('Set-Cookie', clearCookieHeader);
  return new Response(null, { status: 302, headers });
}

app.get('/auth/google', async (c) => {
  const reqUrl = new URL(c.req.url);
  const origin = reqUrl.origin;
  const isHttps = reqUrl.protocol === 'https:';
  const clientId = c.env?.GOOGLE_CLIENT_ID;
  const clientSecret = c.env?.GOOGLE_CLIENT_SECRET;
  const jwtSecret = c.env?.JWT_SECRET;

  if (!clientId || !clientSecret || !jwtSecret) {
    return redirectWithOAuthError(
      origin,
      'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare Pages secrets.'
    );
  }

  const redirectPath = sanitizeRedirect(c.req.query('redirect') || '/');
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challengeBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = toBase64Url(new Uint8Array(challengeBuf));

  const signedState = await signOAuthState(
    {
      state,
      codeVerifier,
      redirect: redirectPath,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    jwtSecret
  );

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': buildOAuthCookie(signedState, isHttps, 600),
    },
  });
});

app.get('/auth/google/callback', async (c) => {
  const reqUrl = new URL(c.req.url);
  const origin = reqUrl.origin;
  const isHttps = reqUrl.protocol === 'https:';
  const clearCookie = buildOAuthCookie('', isHttps, 0);

  const oauthError = c.req.query('error');
  if (oauthError) {
    return redirectWithOAuthError(origin, 'Google sign-in was cancelled.', clearCookie);
  }

  const clientId = c.env?.GOOGLE_CLIENT_ID;
  const clientSecret = c.env?.GOOGLE_CLIENT_SECRET;
  const jwtSecret = c.env?.JWT_SECRET;
  if (!clientId || !clientSecret || !jwtSecret) {
    return redirectWithOAuthError(origin, 'Google sign-in is not configured on the server.', clearCookie);
  }

  const cookies = parseCookies(c.req.header('Cookie') || '');
  const stateData = await verifyOAuthState(cookies.arkive_oauth, jwtSecret).catch(() => null);
  const returnedState = c.req.query('state') || '';
  const code = c.req.query('code') || '';

  if (
    !stateData ||
    !code ||
    !constantTimeEqual(new TextEncoder().encode(stateData.state), new TextEncoder().encode(returnedState))
  ) {
    return redirectWithOAuthError(origin, 'Google sign-in session expired. Please try again.', clearCookie);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: stateData.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return redirectWithOAuthError(origin, 'Could not complete Google sign-in.', clearCookie);
  }

  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenData?.access_token) {
    return redirectWithOAuthError(origin, 'Could not complete Google sign-in.', clearCookie);
  }

  const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userInfoRes.ok) {
    return redirectWithOAuthError(origin, 'Could not verify your Google profile.', clearCookie);
  }

  const userInfo = await userInfoRes.json().catch(() => null);
  const email = typeof userInfo?.email === 'string' ? userInfo.email.trim().toLowerCase() : '';
  if (!email || !userInfo?.email_verified) {
    return redirectWithOAuthError(origin, 'A verified Google email address is required.', clearCookie);
  }

  const db = c.env.DB;
  let userRow = await db.prepare('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
  let userId = userRow?.id;

  if (!userId) {
    userId = crypto.randomUUID();
    const createdAt = nowIso();
    const baseName = email
      .split('@')[0]
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 22);
    let username = baseName.length >= 2 ? baseName : `user_${userId.slice(0, 6)}`;

    const existingUsername = await db
      .prepare('SELECT id FROM profiles WHERE LOWER(username) = LOWER(?)')
      .bind(username)
      .first();
    if (existingUsername) {
      username = `${username.slice(0, 22)}_${userId.slice(0, 6)}`;
    }

    const displayName =
      typeof userInfo.name === 'string' && userInfo.name.trim() ? userInfo.name.trim().slice(0, 50) : username;
    const avatarUrl = isSafeAvatarUrl(userInfo.picture) ? userInfo.picture : null;
    const oauthPlaceholder = `GOOGLE_OAUTH:${toBase64Url(crypto.getRandomValues(new Uint8Array(16)))}`;

    await db.batch([
      db
        .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, email, oauthPlaceholder, createdAt),
      db
        .prepare('INSERT INTO profiles (id, username, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, username, displayName, avatarUrl, createdAt),
    ]);
  } else {
    const profile = await db.prepare('SELECT id FROM profiles WHERE id = ?').bind(userId).first();
    if (!profile) {
      const username = `user_${userId.slice(0, 6)}`;
      await db
        .prepare('INSERT INTO profiles (id, username, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, username, username, null, nowIso())
        .run();
    }
  }

  const jwt = await signJwt(userId, jwtSecret);
  const headers = new Headers({
    Location: `${origin}${sanitizeRedirect(stateData.redirect)}`,
  });
  headers.append('Set-Cookie', clearCookie);
  headers.append('Set-Cookie', buildSessionCookie(jwt, isHttps));
  return new Response(null, { status: 302, headers });
});

app.put('/auth/password', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';

  if (password.length < 6 || password.length > 128) {
    return c.json({ error: 'Password must be between 6 and 128 characters' }, 400);
  }

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, userId).run();
  return c.json({ ok: true });
});

app.delete('/auth/account', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const username = await getMyUsername(db, userId);

  if (c.env.IMAGES) {
    try {
      let cursor;
      do {
        const listed = await c.env.IMAGES.list({ prefix: `${userId}/`, cursor });
        if (listed.objects.length > 0) {
          await c.env.IMAGES.delete(listed.objects.map((o) => o.key));
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    } catch {
      // Best-effort R2 cleanup; proceed with account deletion
    }
  }

  const stmts = [];
  if (username) {
    stmts.push(
      db.prepare('DELETE FROM space_members WHERE LOWER(member_username) = LOWER(?)').bind(username)
    );
  }
  stmts.push(db.prepare('DELETE FROM users WHERE id = ?').bind(userId));
  await db.batch(stmts);

  const isHttps = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', buildSessionCookie('', isHttps, 0));
  return c.json({ ok: true });
});

// ── Profile Routes ──

app.get('/profile', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const userRow = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first();
  if (!userRow) {
    return c.json({ error: 'Account not found' }, 404);
  }
  const profile = await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first();
  return c.json({ user: userRow, profile });
});

app.put('/profile', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  const currentProfile = await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first();
  if (!currentProfile) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  let nextUsername = currentProfile.username;
  if (body.username !== undefined) {
    const candidate = typeof body.username === 'string' ? body.username.trim() : '';
    if (!USERNAME_RE.test(candidate)) {
      return c.json(
        { error: 'Username must be 2-30 characters using letters, numbers, dots, underscores, or hyphens' },
        400
      );
    }
    const existing = await db
      .prepare('SELECT id FROM profiles WHERE LOWER(username) = LOWER(?) AND id != ?')
      .bind(candidate, userId)
      .first();
    if (existing) {
      return c.json({ error: 'Username is already taken' }, 409);
    }
    nextUsername = candidate;
  }

  const nextDisplayName =
    body.display_name !== undefined
      ? typeof body.display_name === 'string'
        ? body.display_name.trim()
        : currentProfile.display_name
      : body.username !== undefined
        ? nextUsername
        : currentProfile.display_name;

  if (body.avatar_url !== undefined && !isSafeAvatarUrl(body.avatar_url)) {
    return c.json({ error: 'Invalid avatar URL' }, 400);
  }
  const nextAvatarUrl =
    body.avatar_url !== undefined
      ? body.avatar_url || null
      : currentProfile.avatar_url;

  const stmts = [
    db
      .prepare('UPDATE profiles SET username = ?, display_name = ?, avatar_url = ? WHERE id = ?')
      .bind(nextUsername, nextDisplayName, nextAvatarUrl, userId),
  ];

  if (nextUsername !== currentProfile.username) {
    stmts.push(
      db
        .prepare('UPDATE space_members SET member_username = ? WHERE LOWER(member_username) = LOWER(?)')
        .bind(nextUsername, currentProfile.username)
    );
  }

  await db.batch(stmts);
  if (currentProfile.avatar_url && currentProfile.avatar_url !== nextAvatarUrl) {
    await cleanupUnusedOwnedImage(c.env, db, userId, currentProfile.avatar_url);
  }
  const updated = await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first();
  return c.json({ profile: updated });
});

// ── Posts Routes ──

app.get('/posts', requireAuth, async (c) => {
  const userId = c.get('userId');
  const page = Math.max(0, parseInt(c.req.query('page') || '0', 10) || 0);
  const search = (c.req.query('search') || '').trim();
  const tagId = (c.req.query('tag') || '').trim();
  const draftsOnly = c.req.query('drafts') === '1';

  let sql = 'SELECT * FROM posts WHERE user_id = ?';
  const params = [userId];

  if (draftsOnly) {
    sql += ' AND is_draft = 1';
  }
  if (tagId) {
    sql += ' AND id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
    params.push(tagId);
  }
  if (search) {
    sql +=
      ' AND (instr(LOWER(title), LOWER(?)) > 0 OR instr(LOWER(subtitle), LOWER(?)) > 0 OR (passphrase_hash IS NULL AND instr(LOWER(body), LOWER(?)) > 0))';
    params.push(search, search, search);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(PAGE_SIZE + 1, page * PAGE_SIZE);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const rows = results || [];
  const hasMore = rows.length > PAGE_SIZE;
  const posts = await enrichPosts(c.env.DB, rows.slice(0, PAGE_SIZE));

  return c.json({ posts, hasMore });
});

app.get('/posts/pinned', requireAuth, async (c) => {
  const userId = c.get('userId');
  const search = (c.req.query('search') || '').trim();
  const tagId = (c.req.query('tag') || '').trim();
  const draftsOnly = c.req.query('drafts') === '1';

  let sql = 'SELECT * FROM posts WHERE user_id = ? AND is_pinned = 1';
  const params = [userId];

  if (draftsOnly) {
    sql += ' AND is_draft = 1';
  }
  if (tagId) {
    sql += ' AND id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
    params.push(tagId);
  }
  if (search) {
    sql +=
      ' AND (instr(LOWER(title), LOWER(?)) > 0 OR instr(LOWER(subtitle), LOWER(?)) > 0 OR (passphrase_hash IS NULL AND instr(LOWER(body), LOWER(?)) > 0))';
    params.push(search, search, search);
  }

  sql += ' ORDER BY created_at DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const posts = await enrichPosts(c.env.DB, results || []);
  return c.json({ posts });
});

app.get('/posts/ids', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT id FROM posts WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all();

  return c.json({ ids: (results || []).map((r) => r.id) });
});

app.get('/posts/calendar', requireAuth, async (c) => {
  const userId = c.get('userId');
  const year = (c.req.query('year') || '').trim();
  if (!/^\d{4}$/.test(year)) {
    return c.json({ error: 'Valid 4-digit year is required' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, subtitle, date_tag
     FROM posts
     WHERE user_id = ? AND date_tag IS NOT NULL AND date_tag >= ? AND date_tag <= ?
     ORDER BY date_tag ASC`
  )
    .bind(userId, `${year}-01-01`, `${year}-12-31`)
    .all();

  return c.json({ posts: results || [] });
});

app.get('/posts/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('id');
  const db = c.env.DB;

  const post = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  if (post.user_id !== userId) {
    if (!post.space_id || post.is_draft) {
      return c.json({ error: 'Post not found' }, 404);
    }
    const space = await db.prepare('SELECT id, user_id FROM spaces WHERE id = ?').bind(post.space_id).first();
    const allowed = await canAccessSpace(db, space, userId);
    if (!allowed) {
      return c.json({ error: 'Post not found' }, 404);
    }
  }

  const [enriched] = await enrichPosts(db, [post]);
  return c.json({ post: enriched });
});

app.post('/posts', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const spaceId = body.space_id || null;
  if (spaceId) {
    const ownedSpace = await db
      .prepare('SELECT id FROM spaces WHERE id = ? AND user_id = ?')
      .bind(spaceId, userId)
      .first();
    if (!ownedSpace) {
      return c.json({ error: 'Selected space does not belong to your account' }, 403);
    }
  }

  const tagIds = Array.isArray(body.tag_ids) ? [...new Set(body.tag_ids.filter(Boolean))] : [];
  if (tagIds.length > 0) {
    const placeholders = tagIds.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(userId, ...tagIds)
      .all();
    if ((results || []).length !== tagIds.length) {
      return c.json({ error: 'One or more tags do not belong to your account' }, 403);
    }
  }

  const postId = crypto.randomUUID();
  const timestamp = nowIso();
  const passphraseHash = body.passphrase_hash || null;
  const encryptedBody = body.encrypted_body || null;
  const postBody = passphraseHash ? '' : typeof body.body === 'string' ? body.body : '';

  const stmts = [
    db
      .prepare(
        `INSERT INTO posts (
          id, user_id, title, subtitle, body, is_markdown, is_draft, is_pinned,
          passphrase_hash, encrypted_body, date_tag, space_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        postId,
        userId,
        title,
        typeof body.subtitle === 'string' ? body.subtitle.trim() : '',
        postBody,
        body.is_markdown ? 1 : 0,
        body.is_draft ? 1 : 0,
        body.is_pinned ? 1 : 0,
        passphraseHash,
        encryptedBody,
        body.date_tag || null,
        spaceId,
        timestamp,
        timestamp
      ),
  ];

  for (const tagId of tagIds) {
    stmts.push(db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagId));
  }

  await db.batch(stmts);
  const created = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
  const [enriched] = await enrichPosts(db, [created]);
  return c.json({ post: enriched }, 201);
});

app.put('/posts/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  const existing = await db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').bind(postId, userId).first();
  if (!existing) {
    return c.json({ error: 'Post not found' }, 404);
  }

  let nextSpaceId = existing.space_id;
  if (body.space_id !== undefined) {
    nextSpaceId = body.space_id || null;
    if (nextSpaceId) {
      const ownedSpace = await db
        .prepare('SELECT id FROM spaces WHERE id = ? AND user_id = ?')
        .bind(nextSpaceId, userId)
        .first();
      if (!ownedSpace) {
        return c.json({ error: 'Selected space does not belong to your account' }, 403);
      }
    }
  }

  let nextTagIds = null;
  if (Array.isArray(body.tag_ids)) {
    nextTagIds = [...new Set(body.tag_ids.filter(Boolean))];
    if (nextTagIds.length > 0) {
      const placeholders = nextTagIds.map(() => '?').join(',');
      const { results } = await db
        .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`)
        .bind(userId, ...nextTagIds)
        .all();
      if ((results || []).length !== nextTagIds.length) {
        return c.json({ error: 'One or more tags do not belong to your account' }, 403);
      }
    }
  }

  const nextTitle = body.title !== undefined ? String(body.title).trim() : existing.title;
  if (!nextTitle) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const nextSubtitle = body.subtitle !== undefined ? String(body.subtitle).trim() : existing.subtitle;
  const nextIsMarkdown = body.is_markdown !== undefined ? (body.is_markdown ? 1 : 0) : existing.is_markdown;
  const nextIsDraft = body.is_draft !== undefined ? (body.is_draft ? 1 : 0) : existing.is_draft;
  const nextIsPinned = body.is_pinned !== undefined ? (body.is_pinned ? 1 : 0) : existing.is_pinned;
  const nextDateTag = body.date_tag !== undefined ? body.date_tag || null : existing.date_tag;
  const nextPassphraseHash =
    body.passphrase_hash !== undefined ? body.passphrase_hash || null : existing.passphrase_hash;
  const nextEncryptedBody =
    body.encrypted_body !== undefined ? body.encrypted_body || null : existing.encrypted_body;
  const nextBody = nextPassphraseHash
    ? ''
    : body.body !== undefined
      ? String(body.body)
      : existing.body;

  const stmts = [
    db
      .prepare(
        `UPDATE posts SET
          title = ?, subtitle = ?, body = ?, is_markdown = ?, is_draft = ?, is_pinned = ?,
          passphrase_hash = ?, encrypted_body = ?, date_tag = ?, space_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        nextTitle,
        nextSubtitle,
        nextBody,
        nextIsMarkdown,
        nextIsDraft,
        nextIsPinned,
        nextPassphraseHash,
        nextEncryptedBody,
        nextDateTag,
        nextSpaceId,
        nowIso(),
        postId,
        userId
      ),
  ];

  if (nextTagIds !== null) {
    stmts.push(db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(postId));
    for (const tagId of nextTagIds) {
      stmts.push(db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagId));
    }
  }

  await db.batch(stmts);
  const updated = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
  const [enriched] = await enrichPosts(db, [updated]);
  return c.json({ post: enriched });
});

function extractOwnedImageKeys(bodyText, userId) {
  if (!bodyText || typeof bodyText !== 'string') return [];
  const keys = new Set();
  const prefix = `/api/images/serve/${userId}/`;
  const re = /\/api\/images\/serve\/([^"'\s)<>]+)/g;
  let match;
  while ((match = re.exec(bodyText)) !== null) {
    const full = match[1];
    if (full && `${'/api/images/serve/'}${full}`.startsWith(prefix)) {
      keys.add(full);
    }
  }
  return [...keys];
}

app.delete('/posts/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id, body FROM posts WHERE id = ? AND user_id = ?')
    .bind(postId, userId)
    .first();
  if (!existing) {
    return c.json({ error: 'Post not found' }, 404);
  }

  await db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').bind(postId, userId).run();

  const imageKeys = extractOwnedImageKeys(existing.body, userId);
  for (const key of imageKeys) {
    await cleanupUnusedOwnedImage(c.env, db, userId, `/api/images/serve/${key}`);
  }

  return c.json({ ok: true });
});

// ── Tags Routes ──

app.get('/tags', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM tags WHERE user_id = ? ORDER BY created_at ASC'
  )
    .bind(userId)
    .all();
  return c.json({ tags: results || [] });
});

app.post('/tags', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pillColor = typeof body.pill_color === 'string' ? body.pill_color.trim() : '#3b82f6';
  const textColor = typeof body.text_color === 'string' ? body.text_color.trim() : '#ffffff';

  if (!name || name.length > 20) {
    return c.json({ error: 'Tag name must be 1 to 20 characters' }, 400);
  }
  if (!HEX_COLOR_RE.test(pillColor) || !HEX_COLOR_RE.test(textColor)) {
    return c.json({ error: 'Invalid color format' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?')
    .bind(userId, name)
    .first();
  if (existing) {
    return c.json({ error: 'A tag with this name already exists' }, 409);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await c.env.DB.prepare(
    'INSERT INTO tags (id, user_id, name, pill_color, text_color, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, userId, name, pillColor, textColor, createdAt)
    .run();

  const tag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?').bind(id).first();
  return c.json({ tag }, 201);
});

app.put('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const tagId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?')
    .bind(tagId, userId)
    .first();
  if (!existing) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const pillColor = body.pill_color !== undefined ? String(body.pill_color).trim() : existing.pill_color;
  const textColor = body.text_color !== undefined ? String(body.text_color).trim() : existing.text_color;

  if (!name || name.length > 20) {
    return c.json({ error: 'Tag name must be 1 to 20 characters' }, 400);
  }
  if (!HEX_COLOR_RE.test(pillColor) || !HEX_COLOR_RE.test(textColor)) {
    return c.json({ error: 'Invalid color format' }, 400);
  }

  const conflict = await c.env.DB.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? AND id != ?')
    .bind(userId, name, tagId)
    .first();
  if (conflict) {
    return c.json({ error: 'A tag with this name already exists' }, 409);
  }

  await c.env.DB.prepare('UPDATE tags SET name = ?, pill_color = ?, text_color = ? WHERE id = ? AND user_id = ?')
    .bind(name, pillColor, textColor, tagId, userId)
    .run();

  const tag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?').bind(tagId).first();
  return c.json({ tag });
});

app.delete('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const tagId = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?')
    .bind(tagId, userId)
    .run();
  if (!res.meta?.changes) {
    return c.json({ error: 'Tag not found' }, 404);
  }
  return c.json({ ok: true });
});

// ── Spaces Routes ──

app.get('/spaces', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results: ownedRows } = await db
    .prepare(
      `SELECT s.*, t.name AS tag_name
       FROM spaces s
       LEFT JOIN tags t ON t.id = s.tag_id
       WHERE s.user_id = ?
       ORDER BY s.created_at ASC`
    )
    .bind(userId)
    .all();

  const username = await getMyUsername(db, userId);
  let sharedRows = [];
  if (username) {
    const { results } = await db
      .prepare(
        `SELECT s.*, t.name AS tag_name
         FROM spaces s
         LEFT JOIN tags t ON t.id = s.tag_id
         JOIN space_members sm ON sm.space_id = s.id
         WHERE LOWER(sm.member_username) = LOWER(?) AND s.user_id != ?
         ORDER BY s.created_at ASC`
      )
      .bind(username, userId)
      .all();
    sharedRows = results || [];
  }

  return c.json({
    owned: (ownedRows || []).map(formatSpace),
    shared: sharedRows.map(formatSpace),
  });
});

app.post('/spaces', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) {
    return c.json({ error: 'Space name is required' }, 400);
  }

  const tagId = body.tag_id || null;
  if (tagId) {
    const ownedTag = await db.prepare('SELECT id FROM tags WHERE id = ? AND user_id = ?').bind(tagId, userId).first();
    if (!ownedTag) {
      return c.json({ error: 'Selected tag does not belong to your account' }, 403);
    }
  }

  const id = crypto.randomUUID();
  const shareLink = crypto.randomUUID();
  const icon = typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : '📁';
  const showInMenu = body.show_in_menu === undefined ? 1 : body.show_in_menu ? 1 : 0;
  const createdAt = nowIso();

  await db
    .prepare(
      'INSERT INTO spaces (id, user_id, name, icon, tag_id, show_in_menu, share_link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, userId, name, icon, tagId, showInMenu, shareLink, createdAt)
    .run();

  const row = await db
    .prepare(
      'SELECT s.*, t.name AS tag_name FROM spaces s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.id = ?'
    )
    .bind(id)
    .first();

  return c.json({ space: formatSpace(row) }, 201);
});

app.get('/spaces/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const db = c.env.DB;

  const row = await db
    .prepare(
      'SELECT s.*, t.name AS tag_name FROM spaces s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.id = ?'
    )
    .bind(spaceId)
    .first();

  if (!(await canAccessSpace(db, row, userId))) {
    return c.json({ error: 'Space not available' }, 404);
  }

  return c.json({ space: formatSpace(row) });
});

app.put('/spaces/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  const existing = await db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').bind(spaceId, userId).first();
  if (!existing) {
    return c.json({ error: 'Space not found' }, 404);
  }

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) {
    return c.json({ error: 'Space name is required' }, 400);
  }

  const icon =
    body.icon !== undefined
      ? typeof body.icon === 'string' && body.icon.trim()
        ? body.icon.trim()
        : '📁'
      : existing.icon;
  const tagId = body.tag_id !== undefined ? body.tag_id || null : existing.tag_id;
  if (tagId) {
    const ownedTag = await db.prepare('SELECT id FROM tags WHERE id = ? AND user_id = ?').bind(tagId, userId).first();
    if (!ownedTag) {
      return c.json({ error: 'Selected tag does not belong to your account' }, 403);
    }
  }
  const showInMenu = body.show_in_menu !== undefined ? (body.show_in_menu ? 1 : 0) : existing.show_in_menu;

  await db
    .prepare('UPDATE spaces SET name = ?, icon = ?, tag_id = ?, show_in_menu = ? WHERE id = ? AND user_id = ?')
    .bind(name, icon, tagId, showInMenu, spaceId, userId)
    .run();

  const row = await db
    .prepare(
      'SELECT s.*, t.name AS tag_name FROM spaces s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.id = ?'
    )
    .bind(spaceId)
    .first();

  return c.json({ space: formatSpace(row) });
});

app.delete('/spaces/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM spaces WHERE id = ? AND user_id = ?')
    .bind(spaceId, userId)
    .run();
  if (!res.meta?.changes) {
    return c.json({ error: 'Space not found' }, 404);
  }
  return c.json({ ok: true });
});

app.get('/spaces/:id/posts', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const page = Math.max(0, parseInt(c.req.query('page') || '0', 10) || 0);
  const tagId = (c.req.query('tag') || '').trim();
  const db = c.env.DB;

  const space = await db.prepare('SELECT id, user_id FROM spaces WHERE id = ?').bind(spaceId).first();
  if (!(await canAccessSpace(db, space, userId))) {
    return c.json({ error: 'Space not available' }, 404);
  }

  let postSql = 'SELECT * FROM posts WHERE space_id = ? AND (is_draft = 0 OR user_id = ?)';
  const postParams = [spaceId, userId];
  if (tagId) {
    postSql += ' AND id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
    postParams.push(tagId);
  }
  postSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  postParams.push(PAGE_SIZE + 1, page * PAGE_SIZE);

  const { results: rows } = await db.prepare(postSql).bind(...postParams).all();

  const postRows = rows || [];
  const hasMore = postRows.length > PAGE_SIZE;
  const posts = await enrichPosts(db, postRows.slice(0, PAGE_SIZE));

  let pinnedPosts = [];
  if (page === 0) {
    let pinnedSql = 'SELECT * FROM posts WHERE space_id = ? AND is_pinned = 1 AND (is_draft = 0 OR user_id = ?)';
    const pinnedParams = [spaceId, userId];
    if (tagId) {
      pinnedSql += ' AND id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
      pinnedParams.push(tagId);
    }
    pinnedSql += ' ORDER BY created_at DESC';

    const { results: pinnedRows } = await db.prepare(pinnedSql).bind(...pinnedParams).all();
    pinnedPosts = await enrichPosts(db, pinnedRows || []);
  }

  return c.json({ posts, pinnedPosts, hasMore });
});

app.get('/spaces/:id/members', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const db = c.env.DB;

  const space = await db.prepare('SELECT id FROM spaces WHERE id = ? AND user_id = ?').bind(spaceId, userId).first();
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  const { results } = await db
    .prepare(
      `SELECT sm.*, p.id AS profile_id, p.display_name, p.avatar_url
       FROM space_members sm
       LEFT JOIN profiles p ON LOWER(p.username) = LOWER(sm.member_username)
       WHERE sm.space_id = ?
       ORDER BY sm.created_at ASC`
    )
    .bind(spaceId)
    .all();

  return c.json({ members: results || [] });
});

app.post('/spaces/:id/members', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const usernameInput = typeof body.username === 'string' ? body.username.trim() : '';

  if (!usernameInput) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const space = await db.prepare('SELECT id FROM spaces WHERE id = ? AND user_id = ?').bind(spaceId, userId).first();
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  const targetProfile = await db
    .prepare('SELECT id, username, display_name, avatar_url FROM profiles WHERE LOWER(username) = LOWER(?)')
    .bind(usernameInput)
    .first();
  if (!targetProfile) {
    return c.json({ error: 'Username not found' }, 404);
  }
  if (targetProfile.id === userId) {
    return c.json({ error: 'You already own this space' }, 400);
  }

  const existing = await db
    .prepare('SELECT id FROM space_members WHERE space_id = ? AND LOWER(member_username) = LOWER(?)')
    .bind(spaceId, targetProfile.username)
    .first();
  if (existing) {
    return c.json({ error: 'This person is already added to the space' }, 409);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await db
    .prepare('INSERT INTO space_members (id, space_id, member_username, added_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, spaceId, targetProfile.username, userId, createdAt)
    .run();

  const member = await db.prepare('SELECT * FROM space_members WHERE id = ?').bind(id).first();
  return c.json(
    {
      member: member
        ? {
            ...member,
            profile_id: targetProfile.id,
            display_name: targetProfile.display_name,
            avatar_url: targetProfile.avatar_url,
          }
        : member,
    },
    201
  );
});

app.delete('/spaces/:id/members/:username', requireAuth, async (c) => {
  const userId = c.get('userId');
  const spaceId = c.req.param('id');
  const username = decodeURIComponent(c.req.param('username'));
  const db = c.env.DB;

  const space = await db.prepare('SELECT id FROM spaces WHERE id = ? AND user_id = ?').bind(spaceId, userId).first();
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  await db
    .prepare('DELETE FROM space_members WHERE space_id = ? AND LOWER(member_username) = LOWER(?)')
    .bind(spaceId, username)
    .run();

  return c.json({ ok: true });
});

// ── Shared Space Link Routes ──

app.get('/shared/:shareLink', requireAuth, async (c) => {
  const userId = c.get('userId');
  const shareLink = c.req.param('shareLink');
  const db = c.env.DB;

  const space = await db.prepare('SELECT id, user_id FROM spaces WHERE share_link = ?').bind(shareLink).first();
  if (!(await canAccessSpace(db, space, userId))) {
    return c.json({ error: 'Space unavailable' }, 404);
  }

  return c.json({ space: { id: space.id } });
});

app.get('/shared/:shareLink/post/:postId', requireAuth, async (c) => {
  const userId = c.get('userId');
  const shareLink = c.req.param('shareLink');
  const postId = c.req.param('postId');
  const db = c.env.DB;

  const space = await db.prepare('SELECT id, user_id FROM spaces WHERE share_link = ?').bind(shareLink).first();
  if (!(await canAccessSpace(db, space, userId))) {
    return c.json({ exists: false });
  }

  const post = await db
    .prepare('SELECT id FROM posts WHERE id = ? AND space_id = ? AND (is_draft = 0 OR user_id = ?)')
    .bind(postId, space.id, userId)
    .first();

  return c.json({ exists: Boolean(post) });
});

// ── People Routes ──

async function buildPeopleList(db, userId, targetUsername = null) {
  const { results: ownedSpaces } = await db
    .prepare('SELECT id, name, icon FROM spaces WHERE user_id = ? ORDER BY name ASC')
    .bind(userId)
    .all();

  const spaces = ownedSpaces || [];
  if (spaces.length === 0) return [];

  const spaceIds = spaces.map((s) => s.id);
  const spacesById = new Map(spaces.map((s) => [s.id, s]));

  const members = [];
  for (let i = 0; i < spaceIds.length; i += 50) {
    const chunk = spaceIds.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(',');
    let sql = `SELECT space_id, member_username FROM space_members WHERE space_id IN (${placeholders})`;
    const params = [...chunk];
    if (targetUsername) {
      sql += ' AND LOWER(member_username) = LOWER(?)';
      params.push(targetUsername);
    }
    sql += ' ORDER BY member_username ASC';
    const { results } = await db.prepare(sql).bind(...params).all();
    members.push(...(results || []));
  }

  if (members.length === 0) return [];

  const usernames = [...new Set(members.map((m) => m.member_username).filter(Boolean))];
  const profilesByUsername = new Map();
  for (let i = 0; i < usernames.length; i += 50) {
    const chunk = usernames.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, username, display_name, avatar_url FROM profiles WHERE username IN (${placeholders})`)
      .bind(...chunk)
      .all();
    for (const p of results || []) {
      profilesByUsername.set(p.username.toLowerCase(), p);
    }
  }

  const peopleMap = new Map();
  for (const m of members) {
    const key = m.member_username.toLowerCase();
    const space = spacesById.get(m.space_id);
    if (!space) continue;
    if (!peopleMap.has(key)) {
      peopleMap.set(key, { canonicalUsername: m.member_username, spaces: new Map() });
    }
    peopleMap.get(key).spaces.set(space.id, space);
  }

  return [...peopleMap.entries()]
    .map(([lowerKey, entry]) => {
      const profile = profilesByUsername.get(lowerKey);
      const username = profile?.username || entry.canonicalUsername;
      const personSpaces = [...entry.spaces.values()];
      return {
        id: profile?.id || '',
        username,
        displayName: profile?.display_name || username,
        avatarUrl: profile?.avatar_url || '',
        spaceCount: personSpaces.length,
        spaces: personSpaces,
      };
    })
    .sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
}

app.get('/people', requireAuth, async (c) => {
  const userId = c.get('userId');
  const people = await buildPeopleList(c.env.DB, userId);
  return c.json({ people });
});

app.get('/people/:username', requireAuth, async (c) => {
  const userId = c.get('userId');
  const targetUsername = decodeURIComponent(c.req.param('username'));
  const people = await buildPeopleList(c.env.DB, userId, targetUsername);
  if (people.length === 0) {
    return c.json({ error: 'Person not found in your spaces' }, 404);
  }
  return c.json({ person: people[0] });
});

// ── Image Upload & Delete Routes ──

app.post('/images', requireAuth, async (c) => {
  const userId = c.get('userId');
  const formData = await c.req.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || typeof file === 'string') {
    return c.json({ error: 'Image file is required' }, 400);
  }

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return c.json({ error: 'Only PNG, JPEG, WebP, GIF, and AVIF images are allowed' }, 400);
  }

  const buffer = await file.arrayBuffer();
  const key = `${userId}/${crypto.randomUUID()}.${ext}`;

  if (c.env.IMAGES) {
    if (buffer.byteLength > R2_MAX_IMAGE_BYTES) {
      return c.json({ error: 'Image must be 5 MB or smaller' }, 400);
    }
    await c.env.IMAGES.put(key, buffer, {
      httpMetadata: { contentType: file.type },
    });
  } else {
    if (buffer.byteLength > D1_MAX_IMAGE_BYTES) {
      return c.json(
        { error: 'Image must be 2 MB or smaller (or enable R2 storage for up to 5 MB)' },
        400
      );
    }
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength <= D1_CHUNK_BYTES) {
      await c.env.DB.prepare('INSERT INTO media (key, user_id, content_type, data) VALUES (?, ?, ?, ?)')
        .bind(key, userId, file.type, bytes)
        .run();
    } else {
      const stmts = [
        c.env.DB.prepare('INSERT INTO media (key, user_id, content_type, data) VALUES (?, ?, ?, ?)')
          .bind(key, userId, file.type, new Uint8Array(0)),
      ];
      let idx = 0;
      for (let offset = 0; offset < bytes.byteLength; offset += D1_CHUNK_BYTES) {
        stmts.push(
          c.env.DB.prepare('INSERT INTO media_chunks (key, idx, data) VALUES (?, ?, ?)')
            .bind(key, idx, bytes.subarray(offset, offset + D1_CHUNK_BYTES))
        );
        idx++;
      }
      await c.env.DB.batch(stmts);
    }
  }

  return c.json({ url: `/api/images/serve/${key}` }, 201);
});

app.delete('/images/*', requireAuth, async (c) => {
  const userId = c.get('userId');
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/images\//, ''));
  if (!key || !key.startsWith(`${userId}/`)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (c.env.IMAGES) {
    await c.env.IMAGES.delete(key);
  }
  await c.env.DB.prepare('DELETE FROM media WHERE key = ? AND user_id = ?').bind(key, userId).run();
  return c.json({ ok: true });
});

// ── Data Export & Import Routes ──

app.get('/data/export', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const [profile, tagsRes, spacesRes, postsRes] = await Promise.all([
    db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first(),
    db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all(),
    db.prepare('SELECT * FROM spaces WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all(),
    db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all(),
  ]);

  const rawPosts = postsRes.results || [];
  const postTags = [];
  for (let i = 0; i < rawPosts.length; i += 50) {
    const chunk = rawPosts.slice(i, i + 50).map((p) => p.id);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT post_id, tag_id FROM post_tags WHERE post_id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    postTags.push(...(results || []));
  }

  const spaces = (spacesRes.results || []).map((s) => ({
    ...s,
    show_in_menu: Boolean(s.show_in_menu),
  }));

  const posts = rawPosts.map((p) => ({
    ...p,
    is_markdown: Boolean(p.is_markdown),
    is_draft: Boolean(p.is_draft),
    is_pinned: Boolean(p.is_pinned),
  }));

  return c.json({
    version: 2,
    exported_at: nowIso(),
    profile: profile || null,
    tags: tagsRes.results || [],
    spaces,
    posts,
    post_tags: postTags,
  });
});

app.post('/data/import', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const data = await c.req.json().catch(() => null);

  if (!data || !data.version) {
    return c.json({ error: 'Invalid export file' }, 400);
  }

  const existingTagsRes = await db.prepare('SELECT id, name FROM tags WHERE user_id = ?').bind(userId).all();
  const tagNameMap = new Map((existingTagsRes.results || []).map((t) => [t.name, t.id]));
  const tagIdMap = new Map();

  const tagInserts = [];
  for (const tag of data.tags || []) {
    const name = typeof tag.name === 'string' ? tag.name.trim().slice(0, 20) : '';
    if (!name) continue;
    if (tagNameMap.has(name)) {
      if (tag.id) tagIdMap.set(tag.id, tagNameMap.get(name));
      continue;
    }
    const newId = crypto.randomUUID();
    const pillColor = HEX_COLOR_RE.test(tag.pill_color || '') ? tag.pill_color : '#3b82f6';
    const textColor = HEX_COLOR_RE.test(tag.text_color || '') ? tag.text_color : '#ffffff';
    tagNameMap.set(name, newId);
    if (tag.id) tagIdMap.set(tag.id, newId);
    tagInserts.push(
      db
        .prepare('INSERT INTO tags (id, user_id, name, pill_color, text_color, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId, userId, name, pillColor, textColor, tag.created_at || nowIso())
    );
  }

  const spaceIdMap = new Map();
  const spaceInserts = [];
  for (const space of data.spaces || []) {
    const name = typeof space.name === 'string' ? space.name.trim() : '';
    if (!name) continue;
    const newId = crypto.randomUUID();
    if (space.id) spaceIdMap.set(space.id, newId);
    const mappedTagId = space.tag_id ? tagIdMap.get(space.tag_id) || null : null;
    spaceInserts.push(
      db
        .prepare(
          'INSERT INTO spaces (id, user_id, name, icon, tag_id, show_in_menu, share_link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          newId,
          userId,
          name,
          space.icon || '📁',
          mappedTagId,
          space.show_in_menu === false || space.show_in_menu === 0 ? 0 : 1,
          crypto.randomUUID(),
          space.created_at || nowIso()
        )
    );
  }

  const postIdMap = new Map();
  const postInserts = [];
  for (const post of data.posts || []) {
    const newId = crypto.randomUUID();
    if (post.id) postIdMap.set(post.id, newId);
    const mappedSpaceId = post.space_id ? spaceIdMap.get(post.space_id) || null : null;
    postInserts.push(
      db
        .prepare(
          `INSERT INTO posts (
            id, user_id, title, subtitle, body, is_markdown, is_draft, is_pinned,
            passphrase_hash, encrypted_body, date_tag, space_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newId,
          userId,
          typeof post.title === 'string' ? post.title : '',
          typeof post.subtitle === 'string' ? post.subtitle : '',
          post.passphrase_hash ? '' : typeof post.body === 'string' ? post.body : '',
          post.is_markdown ? 1 : 0,
          post.is_draft ? 1 : 0,
          post.is_pinned ? 1 : 0,
          post.passphrase_hash || null,
          post.encrypted_body || null,
          post.date_tag || null,
          mappedSpaceId,
          post.created_at || nowIso(),
          post.updated_at || post.created_at || nowIso()
        )
    );
  }

  const postTagInserts = [];
  const seenPairs = new Set();
  for (const pt of data.post_tags || []) {
    const newPostId = postIdMap.get(pt.post_id);
    const newTagId = tagIdMap.get(pt.tag_id);
    if (!newPostId || !newTagId) continue;
    const pairKey = `${newPostId}:${newTagId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    postTagInserts.push(
      db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(newPostId, newTagId)
    );
  }

  const allStmts = [...tagInserts, ...spaceInserts, ...postInserts, ...postTagInserts];
  for (let i = 0; i < allStmts.length; i += 50) {
    await db.batch(allStmts.slice(i, i + 50));
  }

  return c.json({
    ok: true,
    imported: {
      tags: tagInserts.length,
      spaces: spaceInserts.length,
      posts: postInserts.length,
    },
  });
});

app.notFound((c) => c.json({ error: 'API endpoint not found' }, 404));

app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export const onRequest = handle(app);
