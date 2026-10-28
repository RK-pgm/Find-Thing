'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join('/tmp', 'found-it', 'data') : path.join(ROOT, 'data'));
const PHOTO_DIR = process.env.UPLOAD_DIR || (process.env.VERCEL ? path.join('/tmp', 'found-it', 'uploads') : path.join(ROOT, 'uploads'));
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_KEY = 'found-it:store:v1';
const KV_LOCK_KEY = 'found-it:store-lock:v1';
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.VERCEL ? '' : crypto.randomBytes(32).toString('hex'));
const PORT = Number(process.env.PORT) || 3000;
const BODY_LIMIT = 5 * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;
const ADMIN_NAME = 'AdminRK';
const ADMIN_STUDENT_ID = 'T36699';
const loginAttempts = new Map();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
if (!process.env.VERCEL) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], items: [], messages: [], staffMessages: [] }, null, 2));
}
function assertDeploymentConfig() {
  if (!process.env.VERCEL) return;
  const missing = [];
  if (!KV_URL || !KV_TOKEN) missing.push('Upstash Redis REST credentials');
  if (!SESSION_SECRET) missing.push('SESSION_SECRET');
  if (missing.length) {
    const error = new Error(`Deployment setup is incomplete: configure ${missing.join(' and ')}.`);
    error.status = 503;
    throw error;
  }
}
function emptyStore() {
  return { users: [], items: [], messages: [], staffMessages: [] };
}
async function redisCommand(...command) {
  if (!KV_URL || !KV_TOKEN) {
    const error = new Error('Persistent storage is not configured. Connect Upstash Redis and set its REST URL and token.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    console.error('Upstash Redis request failed:', result.error || response.status);
    const error = new Error('The persistent data store is temporarily unavailable.');
    error.status = 503;
    throw error;
  }
  return result.result;
}
async function readStore() {
  if (process.env.VERCEL || KV_URL || KV_TOKEN) {
    const value = await redisCommand('GET', KV_KEY);
    return value ? JSON.parse(value) : emptyStore();
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return emptyStore();
  }
}
async function writeStore(store) {
  if (process.env.VERCEL || KV_URL || KV_TOKEN) {
    await redisCommand('SET', KV_KEY, JSON.stringify(store));
    return;
  }
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}
async function acquireStoreLock() {
  if (!(process.env.VERCEL || KV_URL || KV_TOKEN)) return null;
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 25; attempt++) {
    const acquired = await redisCommand('SET', KV_LOCK_KEY, token, 'NX', 'PX', 12000);
    if (acquired === 'OK') return token;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const error = new Error('The data store is busy. Please try again.');
  error.status = 503;
  throw error;
}
async function releaseStoreLock(token) {
  if (!token) return;
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  try {
    await redisCommand('EVAL', script, 1, KV_LOCK_KEY, token);
  } catch (error) {
    console.error('Could not release the data-store lock:', error.message);
  }
}
function sessionCookie(userId) {
  if (!SESSION_SECRET) {
    const error = new Error('SESSION_SECRET must be configured for Vercel.');
    error.status = 503;
    throw error;
  }
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + SESSION_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `school_session=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function clearSessionCookie() {
  return `school_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function isAdminIdentity(name, studentId) {
  return (
    String(name || '').trim().toLocaleLowerCase() === ADMIN_NAME.toLocaleLowerCase() &&
    String(studentId || '').trim().toLocaleUpperCase() === ADMIN_STUDENT_ID
  );
}
let adminSetupCode = process.env.ADMIN_SETUP_CODE || null;
if (!process.env.VERCEL) {
  const localStore = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!localStore.users.some((user) => user.role === 'admin' && isAdminIdentity(user.name, user.studentId))) {
    adminSetupCode ||= crypto.randomBytes(12).toString('hex');
    console.log(`One-time administrator setup code: ${adminSetupCode}`);
  }
}
function matchesAdminSetupCode(value) {
  if (!adminSetupCode) return false;
  const provided = Buffer.from(String(value || ''));
  const expected = Buffer.from(adminSetupCode);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
function cookieValue(req, key) {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(key + '='));
  return pair ? pair.slice(key.length + 1) : '';
}
async function getUser(req) {
  const value = cookieValue(req, 'school_session');
  const separator = value.lastIndexOf('.');
  if (!SESSION_SECRET || separator <= 0) return null;
  const payload = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url'));
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  let session;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!session.userId || !Number.isFinite(session.exp) || session.exp < Date.now()) return null;
  return (await readStore()).users.find((user) => user.id === session.userId) || null;
}
async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    json(res, 401, { error: 'Please log in to continue.' });
    return null;
  }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    json(res, 403, { error: 'Administrator access is required.' });
    return null;
  }
  return user;
}
function canManageSupport(user) {
  return user?.role === 'staff' || user?.role === 'admin';
}
function cleanUser(user) {
  return { id: user.id, name: user.name, role: user.role || 'student' };
}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
function mimeFromData(data) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data || '');
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const type = match[1];
  const valid =
    type === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return valid && bytes.length <= 3 * 1024 * 1024 ? { type, bytes } : null;
}
function tokens(value) {
  return (
    String(value || '')
      .toLocaleLowerCase()
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
function matchScore(a, b) {
  if (a.type === b.type) return 0;
  const at = new Set(tokens(a.itemName + ' ' + a.description)),
    bt = new Set(tokens(b.itemName + ' ' + b.description));
  const union = new Set([...at, ...bt]);
  let common = 0;
  for (const t of at) if (bt.has(t)) common++;
  let score = union.size ? common / union.size : 0;
  if (a.category === b.category) score += 0.25;
  if (a.color && b.color && a.color.toLowerCase() === b.color.toLowerCase()) score += 0.2;
  if (a.location === b.location) score += 0.05;
  return Math.min(score, 1);
}
function withMatches(items) {
  return items.map((item) => ({
    ...item,
    possibleMatches: items
      .filter((other) => other.id !== item.id && other.type !== item.type)
      .map((other) => ({ itemId: other.id, score: Math.round(matchScore(item, other) * 100) }))
      .filter((m) => m.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
  }));
}
function sendFile(res, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!MIME[ext]) return json(res, 404, { error: 'Not found.' });
  fs.readFile(filename, (error, content) => {
    if (error) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  });
}
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;
  if (route.startsWith('/api/') && req.method !== 'GET' && !validOrigin(req))
    return json(res, 403, { error: 'Request origin was not accepted.' });
  let lockToken = null;
  try {
    if (route.startsWith('/api/')) assertDeploymentConfig();
    if (['POST', 'DELETE'].includes(req.method) && route.startsWith('/api/'))
      lockToken = await acquireStoreLock();
    if (req.method === 'GET' && route === '/api/session') {
      const user = await getUser(req);
      return user
        ? json(res, 200, { user: cleanUser(user) })
        : json(res, 401, { error: 'Not logged in.' });
    }
    if (req.method === 'POST' && route === '/api/register') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const studentId = String(body.studentId || '').trim();
      const password = String(body.password || '');
      if (name.length < 2 || name.length > 80)
        return json(res, 400, { error: 'Enter a name between 2 and 80 characters.' });
      if (!/^[A-Za-z0-9-]{2,40}$/.test(studentId))
        return json(res, 400, {
          error: 'Student ID must contain 2–40 letters, numbers, or hyphens.',
        });
      if (password.length < 8 || password.length > 128)
        return json(res, 400, { error: 'Password must contain at least 8 characters.' });
      const adminCandidate = isAdminIdentity(name, studentId);
      if (studentId.toLocaleUpperCase() === ADMIN_STUDENT_ID && !adminCandidate)
        return json(res, 403, { error: 'This student ID is reserved for the administrator.' });
      if (adminCandidate && !matchesAdminSetupCode(body.adminSetupCode))
        return json(res, 403, {
          error: 'Enter the administrator setup code configured for this deployment.',
        });
      const store = await readStore();
      if (store.users.some((u) => u.studentId.toLowerCase() === studentId.toLowerCase()))
        return json(res, 409, { error: 'That student ID already has an account.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(password, salt, 64);
      const latestStore = await readStore();
      if (latestStore.users.some((u) => u.studentId.toLowerCase() === studentId.toLowerCase()))
        return json(res, 409, { error: 'That student ID already has an account.' });
      if (adminCandidate) {
        if (!matchesAdminSetupCode(body.adminSetupCode))
          return json(res, 403, { error: 'The administrator setup code is no longer valid.' });
        if (latestStore.users.some((user) => user.role === 'admin'))
          return json(res, 409, { error: 'An administrator account already exists.' });
      }
      const staffId = String(process.env.STAFF_STUDENT_ID || '')
        .trim()
        .toLowerCase();
      const user = {
        id: crypto.randomUUID(),
        name,
        studentId,
        role: adminCandidate
          ? 'admin'
          : staffId && studentId.toLowerCase() === staffId
            ? 'staff'
            : 'student',
        salt,
        passwordHash: hash.toString('hex'),
        createdAt: new Date().toISOString(),
      };
      latestStore.users.push(user);
      await writeStore(latestStore);
      if (adminCandidate) adminSetupCode = null;
      const cookie = sessionCookie(user.id);
      return json(
        res,
        201,
        { user: cleanUser(user) },
        {
          'Set-Cookie': cookie,
        },
      );
    }
    if (req.method === 'POST' && route === '/api/login') {
      const ip = req.socket.remoteAddress || 'local';
      const now = Date.now();
      const attempts = (loginAttempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
      if (attempts.length >= 20)
        return json(res, 429, { error: 'Too many attempts. Please wait and try again.' });
      const body = await readBody(req);
      const studentId = String(body.studentId || '').trim();
      const password = String(body.password || '');
      const user = (await readStore()).users.find(
        (u) => u.studentId.toLowerCase() === studentId.toLowerCase(),
      );
      const hash = user ? await scrypt(password, user.salt, 64) : Buffer.alloc(64);
      const valid = !!user && crypto.timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'));
      if (!valid) {
        attempts.push(now);
        loginAttempts.set(ip, attempts);
        return json(res, 401, { error: 'Student ID or password is incorrect.' });
      }
      loginAttempts.delete(ip);
      const cookie = sessionCookie(user.id);
      return json(
        res,
        200,
        { user: cleanUser(user) },
        {
          'Set-Cookie': cookie,
        },
      );
    }
    if (req.method === 'POST' && route === '/api/logout') {
      return json(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': clearSessionCookie() },
      );
    }
    if (req.method === 'GET' && route === '/api/admin/overview') {
      if (!(await requireAdmin(req, res))) return;
      const store = await readStore();
      return json(res, 200, {
        lostCount: store.items.filter((item) => item.type === 'lost').length,
        foundCount: store.items.filter((item) => item.type === 'found').length,
        userCount: store.users.length,
        supportCount: store.staffMessages.length,
      });
    }
    if (req.method === 'GET' && route === '/api/admin/users') {
      if (!(await requireAdmin(req, res))) return;
      const users = (await readStore()).users
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name, studentId, role, createdAt }) => ({
          id,
          name,
          studentId,
          role: role || 'student',
          createdAt,
        }));
      return json(res, 200, { users });
    }
    if ((req.method === 'DELETE' && route.startsWith('/api/admin/users/')) || (req.method === 'POST' && route === '/api/admin/users/delete')) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const targetId = req.method === 'DELETE' ? route.slice('/api/admin/users/'.length) : String((await readBody(req)).userId || '');
      if (!/^[\da-f-]{36}$/i.test(targetId))
        return json(res, 400, { error: 'Invalid account ID.' });
      if (targetId === admin.id)
        return json(res, 403, { error: 'You cannot delete your own administrator account.' });
      const store = await readStore();
      const target = store.users.find((user) => user.id === targetId);
      if (!target) return json(res, 404, { error: 'Account not found.' });
      if (target.role === 'admin')
        return json(res, 403, { error: 'Administrator accounts are protected.' });
      const removedItems = store.items.filter((item) => item.ownerId === targetId);
      store.users = store.users.filter((user) => user.id !== targetId);
      store.items = store.items.filter((item) => item.ownerId !== targetId);
      store.messages = store.messages.filter(
        (message) => message.fromId !== targetId && message.toId !== targetId,
      );
      store.staffMessages = store.staffMessages
        .filter((message) => message.fromId !== targetId)
        .map((message) => ({
          ...message,
          replies: (message.replies || []).filter((reply) => reply.fromId !== targetId),
        }));
      await writeStore(store);
      for (const item of removedItems) {
        if (typeof item.photo !== 'string') continue;
        try {
          if (item.photo.startsWith('https://')) {
            const { del } = require('@vercel/blob');
            await del(item.photo);
          } else if (item.photo.startsWith('/uploads/')) {
            const filename = path.basename(item.photo);
            if (/^[\da-f-]{36}\.(?:jpg|png|webp)$/i.test(filename))
              fs.unlinkSync(path.join(PHOTO_DIR, filename));
          }
        } catch (error) {
          if (error.code !== 'ENOENT') console.error('Could not remove deleted account photo:', error);
        }
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && route === '/api/items') {
      if (!(await requireUser(req, res))) return;
      const items = (await readStore()).items
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { items: withMatches(items) });
    }
    if (req.method === 'POST' && route === '/api/items') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemName = String(body.itemName || '').trim();
      const type = body.type;
      const category = String(body.category || '');
      const location = String(body.location || '');
      const date = String(body.date || '');
      if (itemName.length < 2 || itemName.length > 90)
        return json(res, 400, { error: 'Enter an item name between 2 and 90 characters.' });
      if (!['lost', 'found'].includes(type))
        return json(res, 400, { error: 'Choose whether the item is lost or found.' });
      if (
        !['School supplies', 'Clothing', 'Personal items', 'Electronics', 'Other'].includes(
          category,
        )
      )
        return json(res, 400, { error: 'Choose a valid category.' });
      if (!['Classroom', 'Library', 'Cafeteria', 'Sports area', 'Other'].includes(location))
        return json(res, 400, { error: 'Choose a valid location.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
        return json(res, 400, { error: 'Choose a valid date.' });
      const item = {
        id: crypto.randomUUID(),
        type,
        itemName,
        category,
        color: String(body.color || '')
          .trim()
          .slice(0, 40),
        description: String(body.description || '')
          .trim()
          .slice(0, 500),
        contact: String(body.contact || '')
          .trim()
          .slice(0, 100),
        location,
        date,
        photo: null,
        ownerId: user.id,
        ownerName: user.name,
        createdAt: new Date().toISOString(),
      };
      if (body.photo) {
        const photo = mimeFromData(body.photo);
        if (!photo)
          return json(res, 400, { error: 'Photo must be a valid JPG, PNG, or WebP under 3 MB.' });
        const ext =
          photo.type === 'image/jpeg' ? '.jpg' : photo.type === 'image/png' ? '.png' : '.webp';
        const filename = crypto.randomUUID() + ext;
        if (process.env.VERCEL) {
          const { put } = require('@vercel/blob');
          const blob = await put(`found-it/${filename}`, photo.bytes, {
            access: 'public',
            contentType: photo.type,
            addRandomSuffix: false,
            cacheControlMaxAge: 31536000,
          });
          item.photo = blob.url;
        } else {
          fs.writeFileSync(path.join(PHOTO_DIR, filename), photo.bytes, { flag: 'wx' });
          item.photo = '/uploads/' + filename;
        }
      }
      const store = await readStore();
      store.items.push(item);
      await writeStore(store);
      const results = withMatches(store.items);
      const saved = results.find((x) => x.id === item.id);
      return json(res, 201, { item: saved });
    }
    if (req.method === 'POST' && route === '/api/messages') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const item = (await readStore()).items.find((x) => x.id === body.itemId);
      const message = String(body.message || '').trim();
      if (!item) return json(res, 404, { error: 'Item not found.' });
      if (item.ownerId === user.id)
        return json(res, 400, { error: 'You cannot contact yourself about your own item.' });
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'Message must be 5–1,000 characters.' });
      const store = await readStore();
      const entry = {
        id: crypto.randomUUID(),
        itemId: item.id,
        itemName: item.itemName,
        fromId: user.id,
        fromName: user.name,
        toId: item.ownerId,
        message,
        createdAt: new Date().toISOString(),
      };
      store.messages.push(entry);
      await writeStore(store);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'POST' && route === '/api/messages/reply') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      const store = await readStore();
      const original = store.messages.find((m) => m.id === body.messageId);
      if (!original || (original.fromId !== user.id && original.toId !== user.id))
        return json(res, 404, { error: 'Message not found.' });
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'Message must be 5–1,000 characters.' });
      const recipientId = original.fromId === user.id ? original.toId : original.fromId;
      const reply = {
        id: crypto.randomUUID(),
        itemId: original.itemId,
        itemName: original.itemName,
        fromId: user.id,
        fromName: user.name,
        toId: recipientId,
        message,
        replyTo: original.id,
        createdAt: new Date().toISOString(),
      };
      store.messages.push(reply);
      await writeStore(store);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'GET' && route === '/api/messages') {
      const user = await requireUser(req, res);
      if (!user) return;
      const store = await readStore();
      const messages = store.messages
        .filter((m) => m.toId === user.id || m.fromId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const staffMessages =
        canManageSupport(user)
          ? store.staffMessages.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : [];
      const staffRequests =
        canManageSupport(user)
          ? []
          : store.staffMessages
              .filter((m) => m.fromId === user.id)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { messages, staffMessages, staffRequests });
    }
    if (req.method === 'POST' && route === '/api/contact/reply') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (!canManageSupport(user))
        return json(res, 403, { error: 'Only school staff can reply to support requests.' });
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'Message must be 5–1,000 characters.' });
      const store = await readStore();
      const request = store.staffMessages.find((m) => m.id === body.requestId);
      if (!request) return json(res, 404, { error: 'Support request not found.' });
      if (!Array.isArray(request.replies)) request.replies = [];
      request.replies.push({
        id: crypto.randomUUID(),
        fromId: user.id,
        fromName: user.name,
        message,
        createdAt: new Date().toISOString(),
      });
      await writeStore(store);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'POST' && route === '/api/contact') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'Message must be 5–1,000 characters.' });
      const store = await readStore();
      store.staffMessages.push({
        id: crypto.randomUUID(),
        fromId: user.id,
        fromName: user.name,
        message,
        createdAt: new Date().toISOString(),
      });
      await writeStore(store);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'GET' && route.startsWith('/uploads/')) {
      const filename = path.basename(route.slice('/uploads/'.length));
      if (!/^[\da-f-]{36}\.(?:jpg|png|webp)$/.test(filename))
        return json(res, 404, { error: 'Not found.' });
      return sendFile(res, path.join(PHOTO_DIR, filename));
    }
    if (req.method === 'GET' && route === '/') return sendFile(res, path.join(ROOT, 'index.html'));
    if (req.method === 'GET' && ['/index.html', '/style.css', '/script.js'].includes(route))
      return sendFile(res, path.join(ROOT, route.slice(1)));
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    if (!res.headersSent)
      json(res, error.status || 500, {
        error: error.status ? error.message : 'Something went wrong. Please try again.',
      });
    else res.destroy();
    if (!error.status) console.error(error);
  } finally {
    await releaseStoreLock(lockToken);
  }
}
if (process.env.VERCEL) {
  module.exports = handler;
} else {
  const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  http.createServer(handler).listen(PORT, HOST, () =>
    console.log(`Found It is running at http://${HOST}:${PORT}`),
  );
}
