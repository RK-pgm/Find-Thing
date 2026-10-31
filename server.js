'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { buildWorkOrderImpact } = require('./lib/work-order-impact');
const { buildRestaurantList, saveRestaurantRating, normalizeRestaurantMenuInputs } = require('./lib/restaurant-service');
const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join('/tmp', 'found-it', 'data') : path.join(ROOT, 'data'));
const PHOTO_DIR = process.env.UPLOAD_DIR || (process.env.VERCEL ? path.join('/tmp', 'found-it', 'uploads') : path.join(ROOT, 'uploads'));
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || '';
const KV_KEY = 'found-it:store:v1';
const KV_LOCK_KEY = 'found-it:store-lock:v1';
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.VERCEL ? '' : crypto.randomBytes(32).toString('hex'));
const PORT = Number(process.env.PORT) || 3000;
const BODY_LIMIT = 5 * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;
const ADMIN_NAME = 'AdminRK';
const ADMIN_STUDENT_ID = 'T36699';
const ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || 'A1010';
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || '';
const loginAttempts = new Map();
const WORK_ORDER_TYPES = {
  facility: { label: 'อาคารหรืออุปกรณ์ชำรุด', department: 'ฝ่ายอาคารสถานที่', workflowDetails: {
    received: 'รับข้อมูลอาคารและอุปกรณ์ที่ได้รับผลกระทบ', inspection: 'ตรวจจุดชำรุดและประเมินความเร่งด่วน',
    assigned: 'ระบุช่างหรือเจ้าหน้าที่อาคารผู้รับผิดชอบ', in_progress: 'ซ่อมแซมหรือเปลี่ยนอุปกรณ์ พร้อมบันทึกผล', resolved: 'ทดลองใช้งานและตรวจรับก่อนปิดงาน',
  } },
  cleanliness: { label: 'ความสะอาด', department: 'งานอนามัยและสิ่งแวดล้อม', workflowDetails: {
    received: 'รับข้อมูลพื้นที่และลักษณะปัญหาความสะอาด', inspection: 'ตรวจพื้นที่ ขอบเขต และความเสี่ยงด้านสุขอนามัย',
    assigned: 'ระบุทีมทำความสะอาดหรือผู้ดูแลพื้นที่', in_progress: 'ทำความสะอาดและจัดการจุดเสี่ยง', resolved: 'ตรวจพื้นที่ซ้ำและยืนยันความเรียบร้อย',
  } },
  safety: { label: 'ปัญหาความปลอดภัย', department: 'งานปกครองและความปลอดภัย', workflowDetails: {
    received: 'รับข้อมูลเหตุและตำแหน่งเพื่อประเมินเบื้องต้น', inspection: 'ประเมินความเสี่ยงและความเร่งด่วนของเหตุ',
    assigned: 'ประสานผู้ดูแลหรือเจ้าหน้าที่รักษาความปลอดภัย', in_progress: 'ดูแลพื้นที่และดำเนินมาตรการแก้ไข', resolved: 'ตรวจยืนยันว่าพื้นที่ปลอดภัยและบันทึกผล',
  } },
};
const WORK_ORDER_STAGES = [
  { id: 'received', label: 'รับเรื่อง' },
  { id: 'inspection', label: 'ตรวจสอบ' },
  { id: 'assigned', label: 'มอบหมาย' },
  { id: 'in_progress', label: 'กำลังแก้ไข' },
  { id: 'resolved', label: 'แก้ไขแล้ว' },
];
const NEXT_WORK_ORDER_STAGE = { received: 'inspection', inspection: 'assigned', assigned: 'in_progress', in_progress: 'resolved' };
const REWARD_CATALOG = [
  { id: 'water', name: 'น้ำดื่ม', detail: 'น้ำดื่ม 1 ขวด', points: 10, icon: '💧' },
  { id: 'snack', name: 'ขนม', detail: 'ขนม 1 ชิ้น', points: 15, icon: '🍪' },
  { id: 'pencil', name: 'ดินสอ', detail: 'ดินสอ 1 แท่ง', points: 10, icon: '✏️' },
  { id: 'eraser', name: 'ยางลบ', detail: 'ยางลบ 1 ก้อน', points: 10, icon: '🧼' },
  { id: 'pen', name: 'ปากกา', detail: 'ปากกาน้ำเงิน 1 ด้าม', points: 15, icon: '🖊️' },
  { id: 'notebook', name: 'สมุด', detail: 'สมุดนักเรียน 1 เล่ม', points: 30, icon: '📓' },
];
// Add future school communities here using a permanent ID.
const SCHOOLS = [
  {
    id: 'thung-song', name: 'โรงเรียนทุ่งสง', province: 'นครศรีธรรมราช', latitude: 8.1638565, longitude: 99.7190381,
    mapDescription: 'ตำบลถ้ำใหญ่ อำเภอทุ่งสง จังหวัดนครศรีธรรมราช', mapSource: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน',
    mapImage: '/thung-song-campus-map.png',
    mapPlaces: [
      { id: 'building-7', name: 'อาคาร 7', legacyLocation: 'Classroom', x: 22, y: 42, points: '106,114 178,118 180,225 108,231' },
      { id: 'building-6', name: 'อาคาร 6', legacyLocation: 'Classroom', x: 12, y: 55, points: '40,187 110,187 110,303 39,312' },
      { id: 'building-5', name: 'อาคาร 5', legacyLocation: 'Classroom', x: 31, y: 55, points: '171,188 232,188 232,288 170,291' },
      { id: 'building-4', name: 'อาคาร 4', legacyLocation: 'Classroom', x: 33, y: 40, points: '183,116 244,116 245,226 183,226' },
      { id: 'building-2', name: 'อาคาร 2', legacyLocation: 'Classroom', x: 42, y: 40, points: '246,116 296,116 297,227 246,227' },
      { id: 'running-track', name: 'ลู่วิ่งรอบสนาม', legacyLocation: 'Sports area', x: 72, y: 49, points: '351,140 605,140 615,266 350,266' },
      { id: 'football-field', name: 'สนามฟุตบอล', legacyLocation: 'Sports area', x: 72, y: 43, points: '387,154 549,154 573,184 561,220 536,240 396,238 369,215 363,184' },
      { id: 'assembly-hall', name: 'หอประชุม', legacyLocation: 'Other', x: 61, y: 73, points: '350,294 410,294 410,378 350,378' },
      { id: 'cafeteria', name: 'ศูนย์อาหาร', legacyLocation: 'Cafeteria', x: 56, y: 91, points: '342,379 405,379 405,419 342,419' },
      { id: 'sports-court', name: 'สนามบาสเกตบอล', legacyLocation: 'Sports area', x: 80, y: 92, points: '495,390 562,390 562,420 495,420' },
      { id: 'main-gate', name: 'ประตูทางเข้า', legacyLocation: 'Other', x: 94, y: 54, points: '601,213 657,213 657,260 601,260' },
    ],
  },
  {
    id: 'hamster-hub', name: 'โรงเรียน Hamster Hub', province: 'นครศรีธรรมราช', latitude: 8.1745, longitude: 99.6955,
    mapDescription: 'ตำแหน่งจำลองในอำเภอทุ่งสง', fictional: true, mapImage: '/hamster-hub-campus-map.svg',
    mapPlaces: [
      { id: 'classroom-a', name: 'อาคารเรียน A', legacyLocation: 'Classroom', x: 20, y: 28, points: '62,62 193,62 193,170 62,170' },
      { id: 'classroom-b', name: 'อาคารเรียน B', legacyLocation: 'Classroom', x: 42, y: 28, points: '208,62 339,62 339,170 208,170' },
      { id: 'library', name: 'ห้องสมุด', legacyLocation: 'Library', x: 19, y: 62, points: '62,207 193,207 193,293 62,293' },
      { id: 'cafeteria', name: 'โรงอาหาร', legacyLocation: 'Cafeteria', x: 43, y: 62, points: '208,207 350,207 350,293 208,293' },
      { id: 'football-field', name: 'สนามฟุตบอล', legacyLocation: 'Sports area', x: 74, y: 30, points: '390,62 586,62 586,188 390,188' },
      { id: 'sports-court', name: 'สนามกีฬาในร่ม', legacyLocation: 'Sports area', x: 76, y: 65, points: '402,207 586,207 586,355 402,355' },
      { id: 'main-gate', name: 'ประตูทางเข้า', legacyLocation: 'Other', x: 94, y: 51, points: '610,197 658,197 658,286 610,286' },
    ],
  },
];
let localStoreWriteQueue = Promise.resolve();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
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
  if (!KV_URL || !KV_TOKEN) missing.push('ข้อมูลเชื่อมต่อฐานข้อมูล Redis (Upstash)');
  if (!SESSION_SECRET) missing.push('SESSION_SECRET (รหัสความปลอดภัยของเซสชัน)');
  if (missing.length) {
    const error = new Error(`การตั้งค่าระบบยังไม่ครบ กรุณาตั้งค่า ${missing.join(' และ ')} ก่อนใช้งาน`);
    error.status = 503;
    throw error;
  }
}
function emptyStore() {
  return { users: [], items: [], messages: [], staffMessages: [], comments: [], notifications: [], claims: [], itemReports: [], savedSearches: [], pointLedger: [], workOrders: [], restaurants: [], restaurantRatings: [] };
}
function normalizeStore(value) {
  const store = { ...emptyStore(), ...(value && typeof value === 'object' ? value : {}) };
  for (const key of ['users', 'items', 'messages', 'staffMessages', 'comments', 'notifications', 'claims', 'itemReports', 'savedSearches', 'pointLedger', 'workOrders', 'restaurants', 'restaurantRatings']) {
    if (!Array.isArray(store[key])) store[key] = [];
  }
  const schoolForUser = (user) => SCHOOLS.find((school) => school.id === user?.schoolId) || SCHOOLS.find((school) => school.name === user?.school);
  for (const user of store.users) {
    if (!user.schoolId) user.schoolId = schoolForUser(user)?.id || '';
  }
  const usersById = new Map(store.users.map((user) => [user.id, user]));
  for (const item of store.items) {
    const school = schoolForUser(usersById.get(item.ownerId));
    if (!item.visibility) {
      item.schoolId = item.schoolId || school?.id || '';
      item.schoolName = item.schoolName || school?.name || '';
      item.visibility = item.schoolId ? 'school' : 'public';
    } else if (item.visibility === 'school' && !item.schoolId && school) {
      item.schoolId = school.id;
      item.schoolName = item.schoolName || school.name;
    }
    if (!Array.isArray(item.timeline)) {
      item.timeline = [{ type: 'reported', at: item.createdAt || new Date().toISOString() }];
      if (item.status === 'resolved') item.timeline.push({ type: item.returnedAt ? 'returned' : 'closed', at: item.returnedAt || item.updatedAt || item.createdAt || new Date().toISOString() });
      else if (item.status === 'expired') item.timeline.push({ type: 'expired', at: item.updatedAt || item.createdAt || new Date().toISOString() });
    }
  }
  // Claims created before the two-party return flow did not store an active claim pointer.
  // Restore the latest approved claim so those open reports can continue through scheduling.
  for (const item of store.items) {
    if (item.activeClaimId || item.status !== 'open' || item.type !== 'found') continue;
    const approved = store.claims
      .filter((claim) => claim.itemId === item.id && claim.status === 'approved')
      .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))[0];
    if (approved) {
      item.activeClaimId = approved.id;
      const timelineTypes = new Set(item.timeline.map((event) => event.type));
      if (!timelineTypes.has('claim_approved')) addItemTimeline(item, 'claim_approved', approved.updatedAt || approved.createdAt);
      if (approved.scheduledAt && !timelineTypes.has('pickup_scheduled')) addItemTimeline(item, 'pickup_scheduled', approved.scheduledAt);
      if (item.handoffSentAt && !timelineTypes.has('handoff_sent')) addItemTimeline(item, 'handoff_sent', item.handoffSentAt);
      item.timeline.sort((left, right) => Date.parse(left.at || '') - Date.parse(right.at || ''));
    }
  }
  return store;
}
function addItemTimeline(item, type, at = new Date().toISOString()) {
  if (!Array.isArray(item.timeline)) item.timeline = [];
  const last = item.timeline[item.timeline.length - 1];
  if (last?.type === type && last?.at === at) return;
  item.timeline.push({ type, at });
}
function isExpiredItem(item) {
  return item.status === 'expired';
}
function parseOptionalReward(body, type) {
  if (type !== 'lost' || body.rewardOffered !== true) return { offered: false, amount: null };
  const rawAmount = String(body.rewardAmount ?? '').trim();
  if (!rawAmount) return { offered: true, amount: null };
  if (!/^\d{1,7}$/.test(rawAmount)) return null;
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return null;
  return { offered: true, amount };
}
function hashReturnToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
function tokenMatchesHash(token, expectedHash) {
  if (!/^[a-f\d]{64}$/i.test(expectedHash || '')) return false;
  const received = Buffer.from(hashReturnToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
async function redisCommand(...command) {
  if (!KV_URL || !KV_TOKEN) {
    const error = new Error('ยังไม่ได้ตั้งค่าฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ');
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
    const error = new Error('ฐานข้อมูลขัดข้องชั่วคราว กรุณาลองอีกครั้ง');
    error.status = 503;
    throw error;
  }
  return result.result;
}
async function readStore() {
  if (process.env.VERCEL || KV_URL || KV_TOKEN) {
    const value = await redisCommand('GET', KV_KEY);
    return value ? normalizeStore(JSON.parse(value)) : emptyStore();
  }
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (cause) {
    if (cause.code === 'ENOENT') return emptyStore();
    const error = new Error('ไม่สามารถอ่านข้อมูลในเครื่องได้ กรุณาติดต่อผู้ดูแลระบบ');
    error.status = 503;
    throw error;
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
  if (!(process.env.VERCEL || KV_URL || KV_TOKEN)) {
    let unlock;
    const lock = new Promise((resolve) => { unlock = resolve; });
    const previous = localStoreWriteQueue;
    localStoreWriteQueue = lock;
    await previous;
    return { local: true, unlock };
  }
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 25; attempt++) {
    const acquired = await redisCommand('SET', KV_LOCK_KEY, token, 'NX', 'PX', 12000);
    if (acquired === 'OK') return token;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const error = new Error('ระบบกำลังบันทึกข้อมูล กรุณาลองอีกครั้ง');
  error.status = 503;
  throw error;
}
async function releaseStoreLock(token) {
  if (!token) return;
  if (token.local) {
    token.unlock();
    return;
  }
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  try {
    await redisCommand('EVAL', script, 1, KV_LOCK_KEY, token);
  } catch (error) {
    console.error('Could not release the data-store lock:', error.message);
  }
}
function sessionCookie(userId, sessionVersion = 0) {
  if (!SESSION_SECRET) {
    const error = new Error('ระบบยังตั้งค่าความปลอดภัยไม่ครบ กรุณาติดต่อผู้ดูแลระบบ');
    error.status = 503;
    throw error;
  }
  const payload = Buffer.from(JSON.stringify({ userId, sessionVersion, exp: Date.now() + SESSION_MS })).toString('base64url');
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
        reject(Object.assign(new Error('ข้อมูลที่ส่งมีขนาดใหญ่เกินไป'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('รูปแบบข้อมูลไม่ถูกต้อง'), { status: 400 }));
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
  const account = (await readStore()).users.find((user) => user.id === session.userId);
  if (!account || (session.sessionVersion || 0) !== (account.sessionVersion || 0)) return null;
  const legacySchool = SCHOOLS.find((school) => school.name === account.school);
  return account.schoolId || !legacySchool ? account : { ...account, schoolId: legacySchool.id };
}
async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    json(res, 401, { error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
    return null;
  }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    json(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้งานส่วนนี้ได้' });
    return null;
  }
  return user;
}
function canManageSupport(user) {
  return user?.role === 'staff' || user?.role === 'admin';
}
function cleanUser(user) {
  return {
    id: user.id,
    name: user.name,
    studentId: user.studentId || '',
    grade: user.grade || '',
    school: user.school || '',
    schoolId: user.schoolId || SCHOOLS.find((school) => school.name === user.school)?.id || '',
    role: user.role || 'student',
  };
}
function canViewItem(user, item) {
  if (!item.visibility) return true;
  if (item.visibility === 'public') return true;
  if (item.visibility === 'school')
    return user?.role === 'admin' || (!!user?.schoolId && item.schoolId === user.schoolId);
  return false;
}
function visibleItemsFor(user, items) {
  return user?.role === 'admin' ? items : items.filter((item) => canViewItem(user, item));
}
function canViewNotification(user, notification, items) {
  const relatedIds = [notification.targetItemId, notification.sourceItemId, notification.matchItemId].filter(Boolean);
  return relatedIds.every((id) => {
    const item = items.find((entry) => entry.id === id);
    return !!item && canViewItem(user, item);
  });
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
function normalizedMatchText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().trim();
}
function tokens(value) {
  return normalizedMatchText(value).match(/[\p{L}\p{N}]+/gu) || [];
}
function characterNgrams(value) {
  const characters = [...normalizedMatchText(value).replace(/[^\p{L}\p{N}]/gu, '')];
  if (!characters.length) return new Set();
  const size = Math.min(3, characters.length);
  const grams = new Set();
  for (let index = 0; index <= characters.length - size; index++)
    grams.add(characters.slice(index, index + size).join(''));
  return grams;
}
function setSimilarity(left, right) {
  if (!left.size && !right.size) return null;
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const value of left) if (right.has(value)) common++;
  return common / (left.size + right.size - common);
}
function textSimilarity(left, right) {
  const a = normalizedMatchText(left);
  const b = normalizedMatchText(right);
  if (!a && !b) return null;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wordScore = setSimilarity(new Set(tokens(a)), new Set(tokens(b))) ?? 0;
  const gramScore = setSimilarity(characterNgrams(a), characterNgrams(b)) ?? 0;
  return wordScore * 0.35 + gramScore * 0.65;
}
function normalizeImageFeatures(features) {
  if (!features || typeof features !== 'object') return null;
  if (features.version !== 1 || !/^[01]{64}$/.test(features.dhash || '')) return null;
  if (!Array.isArray(features.histogram) || features.histogram.length !== 24) return null;
  const histogram = features.histogram.map(Number);
  if (histogram.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return null;
  return { version: 1, dhash: features.dhash, histogram };
}
function itemPhotoList(item) {
  return Array.isArray(item?.photos) && item.photos.length ? item.photos : item?.photo ? [item.photo] : [];
}
function itemPhotoFeatureList(item) {
  if (Array.isArray(item?.photoFeatures)) return item.photoFeatures.map(normalizeImageFeatures);
  return item?.imageFeatures ? [normalizeImageFeatures(item.imageFeatures)] : [];
}
async function storeItemPhoto(data) {
  const photo = mimeFromData(data);
  if (!photo) throw Object.assign(new Error('รูปภาพต้องเป็นไฟล์ JPG, PNG หรือ WebP และมีขนาดไม่เกิน 3 MB'), { status: 400 });
  const ext = photo.type === 'image/jpeg' ? '.jpg' : photo.type === 'image/png' ? '.png' : '.webp';
  const filename = crypto.randomUUID() + ext;
  if (process.env.VERCEL) {
    const { put } = require('@vercel/blob');
    const blob = await put(`found-it/${filename}`, photo.bytes, { access: 'public', contentType: photo.type, addRandomSuffix: false, cacheControlMaxAge: 31536000 });
    return blob.url;
  }
  fs.writeFileSync(path.join(PHOTO_DIR, filename), photo.bytes, { flag: 'wx' });
  return '/uploads/' + filename;
}
async function deleteItemPhotos(urls) {
  const unique = [...new Set((urls || []).filter((url) => typeof url === 'string'))];
  for (const url of unique) {
    try {
      if (url.startsWith('https://') && process.env.VERCEL) {
        const { del } = require('@vercel/blob');
        await del(url);
      } else if (url.startsWith('/uploads/')) {
        fs.unlinkSync(path.join(PHOTO_DIR, path.basename(url)));
      }
    } catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove item photo:', error); }
  }
}
function imageSimilarity(left, right) {
  const a = normalizeImageFeatures(left);
  const b = normalizeImageFeatures(right);
  if (!a || !b) return null;
  let equalBits = 0;
  for (let index = 0; index < 64; index++) if (a.dhash[index] === b.dhash[index]) equalBits++;
  const hashScore = equalBits / 64;
  let histogramDistance = 0;
  for (let index = 0; index < 24; index++)
    histogramDistance += Math.abs(a.histogram[index] - b.histogram[index]);
  const colorScore = 1 - Math.min(1, histogramDistance / 6);
  return hashScore * 0.55 + colorScore * 0.45;
}
function itemImageSimilarity(left, right) {
  const leftFeatures = itemPhotoFeatureList(left).filter(Boolean);
  const rightFeatures = itemPhotoFeatureList(right).filter(Boolean);
  if (!leftFeatures.length && left?.imageFeatures) leftFeatures.push(normalizeImageFeatures(left.imageFeatures));
  if (!rightFeatures.length && right?.imageFeatures) rightFeatures.push(normalizeImageFeatures(right.imageFeatures));
  let best = null;
  for (const a of leftFeatures) for (const b of rightFeatures) {
    const score = imageSimilarity(a, b);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}
function matchAnalysis(a, b, allowSameType = false) {
  const evidenceTotal = 7;
  if (a.type === b.type && !allowSameType)
    return { score: 0, imageScore: null, reasons: [], evidenceCount: 0, evidenceTotal, factorScores: [] };
  const sameCategory = normalizedMatchText(a.category) && normalizedMatchText(b.category)
    ? Number(normalizedMatchText(a.category) === normalizedMatchText(b.category))
    : null;
  let siteScore = textSimilarity(a.location, b.location);
  const schoolA = normalizedMatchText(a.schoolId || a.school);
  const schoolB = normalizedMatchText(b.schoolId || b.school);
  const placeA = normalizedMatchText(a.placeId);
  const placeB = normalizedMatchText(b.placeId);
  if (schoolA && schoolB) {
    if (schoolA !== schoolB) siteScore = 0;
    else if (placeA && placeB) siteScore = placeA === placeB ? 1 : Math.min(siteScore ?? 0, 0.25);
    else if (siteScore === null) siteScore = 0.65;
  } else if (placeA && placeB) {
    siteScore = placeA === placeB ? 1 : 0;
  }
  const leftDate = Date.parse(`${a.date || ''}T00:00:00Z`);
  const rightDate = Date.parse(`${b.date || ''}T00:00:00Z`);
  const dateScore = Number.isFinite(leftDate) && Number.isFinite(rightDate)
    ? Math.max(0, 1 - Math.abs(leftDate - rightDate) / (45 * 86400000))
    : null;
  const imageScore = itemImageSimilarity(a, b);
  const factors = [
    { label: 'ชื่อสิ่งของคล้ายกัน', value: textSimilarity(a.itemName, b.itemName), weight: 0.25, threshold: 0.52 },
    { label: 'หมวดหมู่ตรงกัน', value: sameCategory, weight: 0.16, threshold: 1 },
    { label: 'โรงเรียน/บริเวณใกล้กัน', value: siteScore, weight: 0.11, threshold: 0.72 },
    { label: 'สี/ลักษณะคล้ายกัน', value: textSimilarity(a.color, b.color), weight: 0.10, threshold: 0.52 },
    { label: 'รายละเอียดคล้ายกัน', value: textSimilarity(a.description, b.description), weight: 0.14, threshold: 0.48 },
    { label: 'รูปภาพมีลักษณะใกล้กัน', value: imageScore, weight: 0.20, threshold: 0.58 },
    { label: 'วันที่ใกล้กัน', value: dateScore, weight: 0.04, threshold: 0.72 },
  ].filter((factor) => factor.value !== null);
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = totalWeight
    ? Math.round((factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / totalWeight) * 100)
    : 0;
  const reasons = factors
    .filter((factor) => factor.value >= factor.threshold)
    .sort((left, right) => right.value * right.weight - left.value * left.weight)
    .map((factor) => factor.label);
  const coreLabels = new Set(['ชื่อสิ่งของคล้ายกัน', 'สี/ลักษณะคล้ายกัน', 'รายละเอียดคล้ายกัน', 'รูปภาพมีลักษณะใกล้กัน']);
  const hasCoreSignal = factors.some((factor) => coreLabels.has(factor.label) && factor.value >= 0.3);
  return {
    score: hasCoreSignal ? score : 0,
    imageScore: imageScore === null ? null : Math.round(imageScore * 100),
    reasons,
    evidenceCount: factors.length,
    evidenceTotal,
    factorScores: factors.map((factor) => ({ label: factor.label, score: Math.round(factor.value * 100) })),
  };
}
function withMatches(items, viewerId = null) {
  return items.map((item) => {
    const possibleMatches = ['resolved', 'expired'].includes(item.status) ? [] : items
      .filter((other) => other.id !== item.id && other.type !== item.type && !['resolved', 'expired'].includes(other.status))
      .map((other) => ({ itemId: other.id, ...matchAnalysis(item, other) }))
      .filter((match) => match.score >= 28)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    const { imageFeatures, photoFeatures, ...publicItem } = item;
    if (item.ownerId !== viewerId && item.contactPublic === false) delete publicItem.contact;
    return { ...publicItem, possibleMatches };
  });
}
function savedSearchMatchesItem(search, item) {
  if (search.type && search.type !== 'all' && search.type !== item.type) return false;
  if (search.category && search.category !== item.category) return false;
  if (search.placeId) {
    const place = SCHOOLS.find((school) => school.id === search.schoolId)?.mapPlaces?.find((entry) => entry.id === search.placeId);
    const exactMatch = item.schoolId === search.schoolId && item.placeId === search.placeId;
    const legacyMatch = place && place.legacyLocation !== 'Other' && item.schoolId === search.schoolId && !item.placeId && item.location === place.legacyLocation;
    if (!exactMatch && !legacyMatch) return false;
  } else if (search.location && search.location !== item.location) return false;
  if (search.date && search.date !== item.date) return false;
  const query = normalizedMatchText(search.query);
  if (!query) return true;
  const haystack = normalizedMatchText(`${item.itemName} ${item.category} ${item.color} ${item.location} ${item.depositLocation || ''} ${item.description}`);
  return haystack.includes(query);
}
function removeNotificationsForItems(store, itemIds) {
  const ids = itemIds instanceof Set ? itemIds : new Set([itemIds]);
  store.notifications = store.notifications.filter(
    (notification) =>
      !ids.has(notification.sourceItemId) &&
      !ids.has(notification.matchItemId) &&
      !ids.has(notification.targetItemId),
  );
}
function rejectPendingClaims(store, item, exceptClaimId = null, updatedAt = item.updatedAt || new Date().toISOString()) {
  for (const claim of store.claims.filter((entry) => entry.itemId === item.id && entry.id !== exceptClaimId && entry.status === 'pending')) {
    claim.status = 'rejected';
    claim.updatedAt = updatedAt;
    store.notifications.push({ id: crypto.randomUUID(), userId: claim.fromId, type: 'claim_status', itemName: claim.itemName, status: 'rejected', targetItemId: item.id, createdAt: updatedAt, readAt: null });
  }
}
function completeClaimReturn(store, item, claim, receiver) {
  const returnedAt = new Date().toISOString();
  item.status = 'resolved';
  item.returnedAt = returnedAt;
  item.updatedAt = returnedAt;
  item.returnConfirmedBy = receiver.id;
  item.returnTokenHash = null;
  item.returnTokenExpiresAt = null;
  claim.status = 'fulfilled';
  claim.updatedAt = returnedAt;
  claim.receivedAt = returnedAt;
  addItemTimeline(item, 'returned', returnedAt);
  if (item.type === 'found' && !store.pointLedger.some((entry) => entry.itemId === item.id)) {
    store.pointLedger.push({ id: crypto.randomUUID(), userId: item.ownerId, itemId: item.id, itemName: item.itemName, points: 10, reason: 'ช่วยเก็บและส่งคืนของจนยืนยันสำเร็จ', createdAt: returnedAt });
  }
  removeNotificationsForItems(store, item.id);
  rejectPendingClaims(store, item);
  store.notifications.push({ id: crypto.randomUUID(), type: 'return_confirmed', userId: item.ownerId, itemName: item.itemName, targetItemId: item.id, createdAt: returnedAt, readAt: null });
  return returnedAt;
}
function activeApprovedClaim(store, item) {
  return store.claims.find((claim) => claim.id === item.activeClaimId && claim.itemId === item.id && claim.status === 'approved') || null;
}
function sendFile(res, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!MIME[ext]) return json(res, 404, { error: 'ไม่พบข้อมูลที่ต้องการ' });
  fs.readFile(filename, (error, content) => {
    if (error) return json(res, 404, { error: 'ไม่พบข้อมูลที่ต้องการ' });
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ['.html', '.js', '.css'].includes(ext)
        ? 'no-cache'
        : 'public, max-age=3600',
    });
    res.end(content);
  });
}
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const delegatedRoute = url.searchParams.get('__vercel_route');
  const requestedPath = delegatedRoute === null
    ? url.pathname
    : '/api/' + delegatedRoute.replace(/^\/+/, '');
  const route = requestedPath.startsWith('/api/') && requestedPath.endsWith('.js')
    ? requestedPath.slice(0, -3)
    : requestedPath;
  if (route.startsWith('/api/') && req.method !== 'GET' && !validOrigin(req))
    return json(res, 403, { error: 'คำขอนี้มาจากแหล่งที่ไม่อนุญาต' });
  let lockToken = null;
  try {
    if (route.startsWith('/api/')) assertDeploymentConfig();
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && route.startsWith('/api/'))
      lockToken = await acquireStoreLock();
    if (req.method === 'GET' && route === '/api/schools')
      return json(res, 200, { schools: SCHOOLS });
    if (req.method === 'GET' && route === '/api/session') {
      const user = await getUser(req);
      return user
        ? json(res, 200, { user: cleanUser(user) })
        : json(res, 401, { error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
    }
    if (req.method === 'GET' && route === '/api/community-points') {
      const user = await requireUser(req, res);
      if (!user) return;
      const entries = (await readStore()).pointLedger.filter((entry) => entry.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { total: entries.reduce((sum, entry) => sum + entry.points, 0), returnedCount: entries.filter((entry) => entry.points > 0).length, entries: entries.slice(0, 10), rewards: REWARD_CATALOG });
    }
    if (req.method === 'POST' && route === '/api/rewards/redeem') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const reward = REWARD_CATALOG.find((entry) => entry.id === String(body.rewardId || ''));
      if (!reward) return json(res, 400, { error: 'ไม่พบของรางวัลที่เลือก' });
      const store = await readStore();
      const balance = store.pointLedger.filter((entry) => entry.userId === user.id).reduce((sum, entry) => sum + entry.points, 0);
      if (balance < reward.points) return json(res, 400, { error: `แต้มไม่พอ ต้องมี ${reward.points} แต้ม (ขณะนี้มี ${balance} แต้ม)` });
      const createdAt = new Date().toISOString();
      const pickupCode = `KH-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const redemption = {
        id: crypto.randomUUID(), userId: user.id, points: -reward.points,
        reason: `แลก${reward.name}`, itemName: reward.detail, rewardId: reward.id,
        pickupCode, status: 'pending', createdAt,
      };
      store.pointLedger.push(redemption);
      await writeStore(store);
      return json(res, 201, { ok: true, total: balance - reward.points, redemption });
    }
    if (req.method === 'POST' && route === '/api/profile') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const grade = String(body.grade || '').trim();
      const legacySchool = String(body.school || '').trim();
      const requestedSchoolId = Object.hasOwn(body, 'schoolId')
        ? String(body.schoolId || '').trim()
        : (SCHOOLS.find((entry) => entry.name === legacySchool)?.id || '');
      if (name.length < 2 || name.length > 80)
        return json(res, 400, { error: 'ชื่อต้องมีความยาว 2–80 ตัวอักษร' });
      if (grade.length > 40) return json(res, 400, { error: 'ชั้นเรียนต้องมีความยาวไม่เกิน 40 ตัวอักษร' });
      const selectedSchool = SCHOOLS.find((entry) => entry.id === requestedSchoolId);
      if (requestedSchoolId && !selectedSchool)
        return json(res, 400, { error: 'กรุณาเลือกโรงเรียนจากรายการที่มี' });
      const store = await readStore();
      const account = store.users.find((entry) => entry.id === user.id);
      if (!account) return json(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
      account.name = name;
      account.grade = grade;
      account.schoolId = selectedSchool?.id || '';
      account.school = selectedSchool?.name || '';
      store.items.forEach((item) => {
        if (item.ownerId === user.id) item.ownerName = name;
      });
      await writeStore(store);
      return json(res, 200, { user: cleanUser(account) });
    }
    if (req.method === 'POST' && route === '/api/profile/password') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (user.studentId.toLowerCase() === ADMIN_LOGIN_ID.toLowerCase())
        return json(res, 403, { error: 'บัญชีผู้ดูแล A1010 ต้องเปลี่ยนรหัสผ่านผ่านการตั้งค่าเซิร์ฟเวอร์' });
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 8 || newPassword.length > 128)
        return json(res, 400, { error: 'รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร' });
      const currentHash = Buffer.from(user.passwordHash || '', 'hex');
      const suppliedHash = user.salt ? await scrypt(currentPassword, user.salt, 64) : Buffer.alloc(64);
      if (currentHash.length !== 64 || !crypto.timingSafeEqual(suppliedHash, currentHash))
        return json(res, 401, { error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
      if (currentPassword === newPassword)
        return json(res, 400, { error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
      const store = await readStore();
      const account = store.users.find((entry) => entry.id === user.id);
      if (!account) return json(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
      account.salt = crypto.randomBytes(16).toString('hex');
      account.passwordHash = (await scrypt(newPassword, account.salt, 64)).toString('hex');
      account.sessionVersion = (account.sessionVersion || 0) + 1;
      account.passwordChangedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(account.id, account.sessionVersion) });
    }
    if (req.method === 'POST' && route === '/api/register') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const studentId = String(body.studentId || '').trim();
      const password = String(body.password || '');
      if (name.length < 2 || name.length > 80)
        return json(res, 400, { error: 'กรุณากรอกชื่อความยาว 2–80 ตัวอักษร' });
      if (!/^[A-Za-z0-9-]{2,40}$/.test(studentId))
        return json(res, 400, {
          error: 'รหัสนักเรียนต้องมีความยาว 2–40 ตัว และใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข หรือเครื่องหมายขีดกลาง',
        });
      if (studentId.toLowerCase() === ADMIN_LOGIN_ID.toLowerCase())
        return json(res, 403, { error: 'รหัสนี้สงวนไว้สำหรับบัญชีผู้ดูแลระบบ' });
      if (password.length < 8 || password.length > 128)
        return json(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      const requestedSchoolId = String(body.schoolId || '').trim();
      const selectedSchool = requestedSchoolId === 'public'
        ? null
        : SCHOOLS.find((school) => school.id === requestedSchoolId);
      if (!requestedSchoolId || (requestedSchoolId !== 'public' && !selectedSchool))
        return json(res, 400, { error: 'กรุณาเลือกโรงเรียนหรือสาธารณะก่อนสมัครสมาชิก' });
      const adminCandidate = isAdminIdentity(name, studentId);
      if (studentId.toLocaleUpperCase() === ADMIN_STUDENT_ID && !adminCandidate)
        return json(res, 403, { error: 'รหัสนักเรียนนี้สงวนไว้สำหรับบัญชีผู้ดูแลระบบ' });
      if (adminCandidate && !matchesAdminSetupCode(body.adminSetupCode))
        return json(res, 403, {
          error: 'กรุณากรอกรหัสตั้งค่าบัญชีผู้ดูแลที่กำหนดไว้ในระบบ',
        });
      const store = await readStore();
      if (store.users.some((u) => u.studentId.toLowerCase() === studentId.toLowerCase()))
        return json(res, 409, { error: 'รหัสนักเรียนนี้มีบัญชีอยู่แล้ว' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(password, salt, 64);
      const latestStore = await readStore();
      if (latestStore.users.some((u) => u.studentId.toLowerCase() === studentId.toLowerCase()))
        return json(res, 409, { error: 'รหัสนักเรียนนี้มีบัญชีอยู่แล้ว' });
      if (adminCandidate) {
        if (!matchesAdminSetupCode(body.adminSetupCode))
          return json(res, 403, { error: 'รหัสตั้งค่าผู้ดูแลหมดอายุหรือไม่ถูกต้อง' });
        if (latestStore.users.some((user) => user.role === 'admin'))
          return json(res, 409, { error: 'มีบัญชีผู้ดูแลระบบอยู่แล้ว' });
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
        schoolId: selectedSchool?.id || '',
        school: selectedSchool?.name || '',
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
        return json(res, 429, { error: 'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่แล้วลองใหม่' });
      const body = await readBody(req);
      const studentId = String(body.studentId || '').trim();
      const password = String(body.password || '');
      if (studentId.toLowerCase() === ADMIN_LOGIN_ID.toLowerCase()) {
        if (!ADMIN_LOGIN_PASSWORD)
          return json(res, 503, { error: 'ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบผู้ดูแลช่องทางนี้ กรุณาติดต่อผู้ดูแลระบบ' });
        const provided = Buffer.from(password);
        const expected = Buffer.from(ADMIN_LOGIN_PASSWORD);
        if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
          attempts.push(now);
          loginAttempts.set(ip, attempts);
          return json(res, 401, { error: 'รหัสผู้ดูแลหรือรหัสผ่านไม่ถูกต้อง' });
        }
        const requestedSchoolId = String(body.schoolId || '').trim();
        const selectedSchool = requestedSchoolId === 'public'
          ? null
          : SCHOOLS.find((school) => school.id === requestedSchoolId);
        if (!requestedSchoolId || (requestedSchoolId !== 'public' && !selectedSchool))
          return json(res, 400, { error: 'กรุณาเลือกโรงเรียนหรือสาธารณะก่อนเข้าสู่ระบบ' });
        const store = await readStore();
        let admin = store.users.find((user) => user.studentId.toLowerCase() === ADMIN_LOGIN_ID.toLowerCase());
        if (admin && admin.role !== 'admin')
          return json(res, 409, { error: 'รหัสเข้าสู่ระบบนี้ถูกใช้กับบัญชีที่ไม่ใช่ผู้ดูแลแล้ว' });
        if (!admin) {
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = await scrypt(ADMIN_LOGIN_PASSWORD, salt, 64);
          admin = {
            id: crypto.randomUUID(),
            name: 'ผู้ดูแลระบบ',
            studentId: ADMIN_LOGIN_ID,
            role: 'admin',
            salt,
            passwordHash: hash.toString('hex'),
            createdAt: new Date().toISOString(),
          };
          store.users.push(admin);
        }
        admin.schoolId = selectedSchool?.id || '';
        admin.school = selectedSchool?.name || '';
        await writeStore(store);
        loginAttempts.delete(ip);
        return json(res, 200, { user: cleanUser(admin) }, { 'Set-Cookie': sessionCookie(admin.id, admin.sessionVersion || 0) });
      }
      const store = await readStore();
      const user = store.users.find(
        (u) => u.studentId.toLowerCase() === studentId.toLowerCase(),
      );
      const hash = user ? await scrypt(password, user.salt, 64) : Buffer.alloc(64);
      const valid = !!user && crypto.timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'));
      if (!valid) {
        attempts.push(now);
        loginAttempts.set(ip, attempts);
        return json(res, 401, { error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง' });
      }
      const requestedSchoolId = String(body.schoolId || '').trim();
      const selectedSchool = requestedSchoolId === 'public'
        ? null
        : SCHOOLS.find((school) => school.id === requestedSchoolId);
      if (!requestedSchoolId || (requestedSchoolId !== 'public' && !selectedSchool))
        return json(res, 400, { error: 'กรุณาเลือกโรงเรียนหรือสาธารณะก่อนเข้าสู่ระบบ' });
      user.schoolId = selectedSchool?.id || '';
      user.school = selectedSchool?.name || '';
      await writeStore(store);
      loginAttempts.delete(ip);
      const cookie = sessionCookie(user.id, user.sessionVersion || 0);
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
    if (req.method === 'GET' && route === '/api/admin/work-orders') {
      if (!(await requireAdmin(req, res))) return;
      const workOrders = (await readStore()).workOrders
        .slice().sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      return json(res, 200, { workOrders });
    }
    if (req.method === 'POST' && route === '/api/admin/work-orders/update') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const body = await readBody(req);
      const orderId = String(body.orderId || '');
      const status = String(body.status || '');
      const assignedTo = String(body.assignedTo || '').trim();
      if (!/^[\da-f-]{36}$/i.test(orderId)) return json(res, 400, { error: 'รหัสงานไม่ถูกต้อง' });
      if (!WORK_ORDER_STAGES.some((stage) => stage.id === status)) return json(res, 400, { error: 'กรุณาเลือกสถานะงานที่ถูกต้อง' });
      if (assignedTo.length > 80) return json(res, 400, { error: 'ชื่อผู้รับผิดชอบต้องไม่เกิน 80 ตัวอักษร' });
      const store = await readStore();
      const order = store.workOrders.find((entry) => entry.id === orderId);
      if (!order) return json(res, 404, { error: 'ไม่พบเรื่องที่แจ้ง' });
      const nextStatus = NEXT_WORK_ORDER_STAGE[order.status];
      if (status !== order.status && status !== nextStatus)
        return json(res, 409, { error: 'กรุณาดำเนินงานตามลำดับ รับเรื่อง → ตรวจสอบ → มอบหมาย → กำลังแก้ไข → แก้ไขแล้ว' });
      if (status === 'assigned' && !assignedTo)
        return json(res, 400, { error: 'กรุณาระบุชื่อผู้รับผิดชอบก่อนมอบหมายงาน' });
      if (status === order.status && status !== 'assigned')
        return json(res, 409, { error: 'เปลี่ยนผู้รับผิดชอบได้ในขั้นมอบหมาย เพื่อคงลำดับการติดตามงาน' });
      if (status === order.status && assignedTo === (order.assignedTo || ''))
        return json(res, 400, { error: 'ยังไม่มีข้อมูลที่เปลี่ยนแปลง' });
      const updatedAt = new Date().toISOString();
      const changedStage = status !== order.status;
      const previousAssignee = order.assignedTo || '';
      order.status = status;
      order.assignedTo = assignedTo;
      order.updatedAt = updatedAt;
      const stageLabel = WORK_ORDER_STAGES.find((stage) => stage.id === status).label;
      const historyEntry = {
        status, label: changedStage ? stageLabel : 'เปลี่ยนผู้รับผิดชอบ',
        actorId: admin.id, actorName: admin.name, at: updatedAt,
      };
      if (!changedStage) historyEntry.note = previousAssignee ? `เปลี่ยนจาก ${previousAssignee} เป็น ${assignedTo || 'ยังไม่ระบุ'}` : `มอบหมายให้ ${assignedTo}`;
      order.history.push(historyEntry);
      store.notifications.push({
        id: crypto.randomUUID(), type: 'work_order_update', userId: order.reporterId,
        workOrderId: order.id, itemName: order.title, workOrderStatus: status,
        workOrderStatusLabel: stageLabel, assignedTo: order.assignedTo,
        createdAt: updatedAt, readAt: null,
      });
      await writeStore(store);
      return json(res, 200, { ok: true, workOrder: order });
    }
    if (req.method === 'GET' && route === '/api/admin/restaurants') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      if (!admin.schoolId) return json(res, 200, { restaurants: [], requiresSchool: true });
      const store = await readStore();
      const restaurants = buildRestaurantList(store, { schoolId: admin.schoolId, includeInactive: true });
      return json(res, 200, { restaurants, schoolId: admin.schoolId });
    }
    if (req.method === 'POST' && route === '/api/admin/restaurants') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      if (!admin.schoolId || !SCHOOLS.some((school) => school.id === admin.schoolId))
        return json(res, 400, { error: 'กรุณาเลือกโรงเรียนในโปรไฟล์แอดมินก่อนจัดการร้านอาหาร' });
      const body = await readBody(req);
      const restaurantId = String(body.restaurantId || '');
      const name = String(body.name || '').trim();
      const category = String(body.category || '');
      const location = String(body.location || '').trim();
      const description = String(body.description || '').trim();
      const initialMenus = normalizeRestaurantMenuInputs(body.menus);
      if (!['food', 'drink', 'snack'].includes(category)) return json(res, 400, { error: 'กรุณาเลือกหมวดหมู่ร้านให้ถูกต้อง' });
      if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'ชื่อร้านต้องมีความยาว 2–80 ตัวอักษร' });
      if (location.length > 120 || description.length > 240) return json(res, 400, { error: 'สถานที่หรือคำอธิบายยาวเกินกำหนด' });
      const store = await readStore();
      let restaurant = restaurantId ? store.restaurants.find((entry) => entry.id === restaurantId && entry.schoolId === admin.schoolId) : null;
      if (restaurantId && !restaurant) return json(res, 404, { error: 'ไม่พบร้านอาหารในโรงเรียนของคุณ' });
      if (!restaurantId && store.restaurants.some((entry) => entry.schoolId === admin.schoolId && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        return json(res, 409, { error: 'มีร้านชื่อนี้อยู่แล้วในโรงเรียน' });
      if (!restaurant) {
        const createdAt = new Date().toISOString();
        restaurant = {
          id: crypto.randomUUID(), schoolId: admin.schoolId,
          schoolName: SCHOOLS.find((school) => school.id === admin.schoolId).name,
          menus: initialMenus.map((menu) => ({ id: crypto.randomUUID(), ...menu, createdAt, updatedAt: createdAt })),
          createdAt,
        };
        store.restaurants.push(restaurant);
      }
      restaurant.name = name;
      restaurant.category = category;
      restaurant.location = location;
      restaurant.description = description;
      restaurant.isActive = body.isActive !== false;
      restaurant.updatedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, { ok: true, restaurant });
    }
    if (req.method === 'POST' && route === '/api/admin/restaurants/menu') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const body = await readBody(req);
      const restaurantId = String(body.restaurantId || '');
      const menuId = String(body.menuId || '');
      const action = String(body.action || 'save');
      const store = await readStore();
      const restaurant = store.restaurants.find((entry) => entry.id === restaurantId && entry.schoolId === admin.schoolId);
      if (!restaurant) return json(res, 404, { error: 'ไม่พบร้านอาหารในโรงเรียนของคุณ' });
      if (!Array.isArray(restaurant.menus)) restaurant.menus = [];
      const index = restaurant.menus.findIndex((entry) => entry.id === menuId);
      if (action === 'delete') {
        if (index < 0) return json(res, 404, { error: 'ไม่พบเมนูนี้' });
        restaurant.menus.splice(index, 1);
      } else {
        const name = String(body.name || '').trim();
        const rawPrice = String(body.price ?? '').trim();
        const price = Number(rawPrice);
        if (!menuId && restaurant.menus.length >= 100) return json(res, 400, { error: 'ร้านหนึ่งเพิ่มเมนูได้ไม่เกิน 100 รายการ' });
        if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'ชื่อเมนูต้องมีความยาว 2–80 ตัวอักษร' });
        if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(rawPrice) || !Number.isFinite(price) || price > 99999)
          return json(res, 400, { error: 'กรุณาระบุราคาเป็นตัวเลขตั้งแต่ 0 ถึง 99,999 บาท' });
        if (menuId && index < 0) return json(res, 404, { error: 'ไม่พบเมนูนี้' });
        const menu = index >= 0 ? restaurant.menus[index] : { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
        menu.name = name;
        menu.price = price;
        menu.updatedAt = new Date().toISOString();
        if (index >= 0) restaurant.menus[index] = menu;
        else restaurant.menus.push(menu);
      }
      restaurant.updatedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, { ok: true, restaurant });
    }
    if (req.method === 'GET' && route === '/api/admin/overview') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const store = await readStore();
      const impact = buildWorkOrderImpact(
        store.workOrders,
        admin.schoolId,
        Object.entries(WORK_ORDER_TYPES).map(([type, definition]) => ({ type, label: definition.label })),
      );
      return json(res, 200, {
        lostCount: store.items.filter((item) => item.type === 'lost').length,
        foundCount: store.items.filter((item) => item.type === 'found').length,
        returnedCount: store.items.filter((item) => item.status === 'resolved' && item.returnedAt).length,
        userCount: store.users.length,
        supportCount: store.staffMessages.length,
        impact,
      });
    }
    if (req.method === 'POST' && route === '/api/admin/items/update') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const body = await readBody(req);
      const itemId = String(body.itemId || '');
      const status = String(body.status || '');
      const assignedTo = String(body.assignedTo || '').trim();
      if (!/^[\da-f-]{36}$/i.test(itemId))
        return json(res, 400, { error: 'รหัสประกาศไม่ถูกต้อง' });
      if (!['open', 'reviewing', 'resolved', 'expired'].includes(status))
        return json(res, 400, { error: 'กรุณาเลือกสถานะงานที่ถูกต้อง' });
      if (assignedTo.length > 80)
        return json(res, 400, { error: 'ชื่อผู้รับผิดชอบต้องมีความยาวไม่เกิน 80 ตัวอักษร' });
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.type === 'found' && status === 'resolved')
        return json(res, 409, { error: 'ประกาศของที่พบต้องให้ผู้พบยืนยันส่งมอบ และให้ผู้รับยืนยันรับก่อนปิดประกาศ' });
      if (item.status !== status) {
        item.returnTokenHash = null;
        item.returnTokenExpiresAt = null;
      }
      item.status = status;
      item.assignedTo = assignedTo;
      item.updatedAt = new Date().toISOString();
      addItemTimeline(item, status === 'expired' ? 'expired' : status === 'resolved' ? 'closed' : 'reopened', item.updatedAt);
      if (status === 'resolved' || status === 'expired') {
        removeNotificationsForItems(store, itemId);
        rejectPendingClaims(store, item);
        item.returnTokenHash = null;
        item.returnTokenExpiresAt = null;
      }
      if (status === 'open') {
        item.activeClaimId = null;
        item.handoffSentAt = null;
        item.handoffSentBy = null;
        item.returnedAt = null;
        item.returnConfirmedBy = null;
      }
      await writeStore(store);
      return json(res, 200, { ok: true, itemId, status, assignedTo });
    }
    if (req.method === 'POST' && route === '/api/items/status') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemId = String(body.itemId || '');
      const status = String(body.status || '');
      if (!/^[\da-f-]{36}$/i.test(itemId))
        return json(res, 400, { error: 'รหัสประกาศไม่ถูกต้อง' });
      if (!['open', 'resolved'].includes(status))
        return json(res, 400, { error: 'กรุณาเลือกสถานะประกาศที่ถูกต้อง' });
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (!canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.ownerId !== user.id && user.role !== 'admin')
        return json(res, 403, { error: 'เฉพาะเจ้าของประกาศเท่านั้นที่เปลี่ยนสถานะได้' });
      if (item.type === 'found' && status === 'resolved')
        return json(res, 409, { error: 'ประกาศของที่พบต้องผ่านขั้นตรวจสอบ นัดรับ ส่งมอบ และให้ผู้รับยืนยันก่อนปิดประกาศ' });
      item.status = status;
      item.updatedAt = new Date().toISOString();
      addItemTimeline(item, status === 'resolved' ? 'closed' : 'reopened', item.updatedAt);
      if (status === 'resolved') {
        removeNotificationsForItems(store, itemId);
        rejectPendingClaims(store, item);
        item.returnTokenHash = null;
        item.returnTokenExpiresAt = null;
      }
      if (status === 'open') {
        item.returnTokenHash = null;
        item.returnTokenExpiresAt = null;
        item.activeClaimId = null;
        item.handoffSentAt = null;
        item.handoffSentBy = null;
        item.returnedAt = null;
        item.returnConfirmedBy = null;
      }
      await writeStore(store);
      return json(res, 200, { ok: true, itemId, status });
    }
    if (req.method === 'GET' && route === '/api/admin/users') {
      if (!(await requireAdmin(req, res))) return;
      const users = (await readStore()).users
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name, studentId, grade, school, role, createdAt }) => ({
          id,
          name,
          studentId,
          grade: grade || '',
          school: school || '',
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
        return json(res, 400, { error: 'รหัสบัญชีไม่ถูกต้อง' });
      if (targetId === admin.id)
        return json(res, 403, { error: 'ไม่สามารถลบบัญชีผู้ดูแลของตนเองได้' });
      const store = await readStore();
      const target = store.users.find((user) => user.id === targetId);
      if (!target) return json(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
      if (target.role === 'admin')
        return json(res, 403, { error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบได้' });
      const removedItems = store.items.filter((item) => item.ownerId === targetId);
      store.users = store.users.filter((user) => user.id !== targetId);
      store.items = store.items.filter((item) => item.ownerId !== targetId);
      for (const order of store.workOrders) {
        if (order.reporterId === targetId) { order.reporterId = ''; order.reporterName = 'บัญชีที่ลบแล้ว'; }
      }
      const removedItemIds = new Set(removedItems.map((item) => item.id));
      store.notifications = store.notifications.filter((notification) => notification.userId !== targetId);
      removeNotificationsForItems(store, removedItemIds);
      store.claims = store.claims.filter((claim) => claim.fromId !== targetId && claim.ownerId !== targetId && !removedItemIds.has(claim.itemId));
      store.itemReports = store.itemReports.filter((report) => report.fromId !== targetId && !removedItemIds.has(report.itemId));
      store.restaurantRatings = store.restaurantRatings.filter((rating) => rating.userId !== targetId);
      store.savedSearches = store.savedSearches.filter((search) => search.userId !== targetId);
      store.messages = store.messages.filter(
        (message) => message.fromId !== targetId && message.toId !== targetId,
      );
      store.comments = store.comments.filter(
        (comment) => comment.fromId !== targetId && comment.toId !== targetId,
      );
      store.staffMessages = store.staffMessages
        .filter((message) => message.fromId !== targetId)
        .map((message) => ({
          ...message,
          replies: (message.replies || []).filter((reply) => reply.fromId !== targetId),
        }));
      await writeStore(store);
      for (const item of removedItems) {
        await deleteItemPhotos(itemPhotoList(item));
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && route.startsWith('/api/items/')) {
      const user = await requireUser(req, res);
      if (!user) return;
      const itemId = route.slice('/api/items/'.length);
      const body = await readBody(req);
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (!canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.ownerId !== user.id && user.role !== 'admin')
        return json(res, 403, { error: 'แก้ไขได้เฉพาะประกาศของตนเอง' });
      const itemName = String(body.itemName || '').trim();
      const category = String(body.category || '');
      const location = String(body.location || '');
      const date = String(body.date || '');
      const parsedDate = Date.parse(`${date}T00:00:00Z`);
      if (itemName.length < 2 || itemName.length > 90 || !['lost', 'found'].includes(body.type))
        return json(res, 400, { error: 'กรุณาตรวจสอบชื่อและประเภทประกาศ' });
      if (!['School supplies', 'Stationery', 'Clothing', 'Personal items', 'Bags', 'Phones', 'Electronics', 'Other'].includes(category))
        return json(res, 400, { error: 'กรุณาเลือกหมวดหมู่ที่ถูกต้อง' });
      if (!['Classroom', 'Library', 'Cafeteria', 'Sports area', 'Other'].includes(location))
        return json(res, 400, { error: 'กรุณาเลือกสถานที่ที่ถูกต้อง' });
      const requestedPlaceId = String(body.placeId || '').trim();
      const mapPlace = requestedPlaceId ? SCHOOLS.find((school) => school.id === item.schoolId)?.mapPlaces?.find((place) => place.id === requestedPlaceId) : null;
      if (requestedPlaceId && !mapPlace) return json(res, 400, { error: 'จุดบนแผนที่ไม่ตรงกับโรงเรียนของโพสต์นี้' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date)
        return json(res, 400, { error: 'กรุณาระบุวันที่ให้ถูกต้อง' });
      const reward = parseOptionalReward(body, body.type);
      if (!reward) return json(res, 400, { error: 'จำนวนสินน้ำใจต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 1,000,000 บาท' });
      item.type = body.type;
      item.itemName = itemName;
      item.reporterName = String(body.reporterName || user.name).trim().slice(0, 80);
      item.category = category;
      item.color = String(body.color || '').trim().slice(0, 40);
      item.description = String(body.description || '').trim().slice(0, 500);
      item.contact = String(body.contact || '').trim().slice(0, 100);
      item.contactPublic = body.contactPublic === true;
      item.rewardOffered = reward.offered;
      item.rewardAmount = reward.amount;
      item.depositLocation = body.type === 'found' ? String(body.depositLocation || '').trim().slice(0, 120) : '';
      item.location = mapPlace?.legacyLocation || location;
      item.placeId = mapPlace?.id || '';
      item.placeName = mapPlace?.name || '';
      item.date = date;
      item.eventTime = /^\d{2}:\d{2}$/.test(String(body.eventTime || '')) ? body.eventTime : '';
      delete item.expiryDays;
      delete item.expiresAt;
      item.returnTokenHash = null;
      item.returnTokenExpiresAt = null;
      item.updatedAt = new Date().toISOString();
      const oldPhotos = itemPhotoList(item);
      if (Array.isArray(body.photos)) {
        if (body.photos.length > 6) return json(res, 400, { error: 'เพิ่มรูปได้ไม่เกิน 6 รูป' });
        for (const entry of body.photos) {
          if (!entry || typeof entry !== 'object' || (entry.url && !oldPhotos.includes(entry.url)) || (!entry.url && !mimeFromData(entry.data)))
            return json(res, 400, { error: 'ข้อมูลรูปภาพไม่ถูกต้อง กรุณาเลือกรูปใหม่' });
        }
        const previousFeatures = itemPhotoFeatureList(item);
        const nextPhotos = [];
        const nextFeatures = [];
        for (const entry of body.photos) {
          if (entry.url) {
            const oldIndex = oldPhotos.indexOf(entry.url);
            nextPhotos.push(entry.url);
            nextFeatures.push(previousFeatures[oldIndex] || (entry.url === item.photo ? normalizeImageFeatures(item.imageFeatures) : null));
          } else {
            nextPhotos.push(await storeItemPhoto(entry.data));
            nextFeatures.push(normalizeImageFeatures(entry.imageFeatures));
          }
        }
        item.photos = nextPhotos;
        item.photo = nextPhotos[0] || null;
        item.photoFeatures = nextFeatures;
        item.imageFeatures = nextFeatures[0] || null;
        await writeStore(store);
        await deleteItemPhotos(oldPhotos.filter((url) => !nextPhotos.includes(url)));
        return json(res, 200, { ok: true, item });
      }
      if (body.photo) {
        const oldPhoto = item.photo;
        item.photo = await storeItemPhoto(body.photo);
        item.photos = [item.photo];
        item.imageFeatures = normalizeImageFeatures(body.imageFeatures);
        item.photoFeatures = [item.imageFeatures];
        await writeStore(store);
        await deleteItemPhotos(oldPhoto ? [oldPhoto] : []);
        return json(res, 200, { ok: true, item });
      }
      await writeStore(store);
      return json(res, 200, { ok: true, item });
    }
    if (req.method === 'DELETE' && route.startsWith('/api/items/')) {
      const user = await requireUser(req, res);
      if (!user) return;
      const itemId = route.slice('/api/items/'.length);
      if (!/^[\da-f-]{36}$/i.test(itemId))
        return json(res, 400, { error: 'รหัสประกาศไม่ถูกต้อง' });
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.ownerId !== user.id && user.role !== 'admin')
        return json(res, 403, { error: 'เฉพาะเจ้าของประกาศหรือผู้ดูแลระบบเท่านั้นที่ลบประกาศนี้ได้' });
      store.items = store.items.filter((entry) => entry.id !== itemId);
      store.comments = store.comments.filter((comment) => comment.itemId !== itemId);
      store.messages = store.messages.filter((message) => message.itemId !== itemId);
      store.claims = store.claims.filter((claim) => claim.itemId !== itemId);
      store.itemReports = store.itemReports.filter((report) => report.itemId !== itemId);
      removeNotificationsForItems(store, itemId);
      await writeStore(store);
      await deleteItemPhotos(itemPhotoList(item));
      return json(res, 200, { ok: true, itemId });
    }
    if (req.method === 'POST' && route.startsWith('/api/items/') && route.endsWith('/return-qr')) {
      const user = await requireUser(req, res);
      if (!user) return;
      const itemId = route.slice('/api/items/'.length, -'/return-qr'.length);
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (!canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.ownerId !== user.id && user.role !== 'admin') return json(res, 403, { error: 'เฉพาะเจ้าของประกาศเท่านั้นที่สร้าง QR ได้' });
      if (item.status !== 'open' || isExpiredItem(item)) return json(res, 409, { error: 'ประกาศนี้ไม่ได้เปิดรับการยืนยันรับคืนแล้ว' });
      const activeClaim = activeApprovedClaim(store, item);
      if (!item.handoffSentAt || !activeClaim) return json(res, 409, { error: 'ให้ผู้พบกำหนดนัดและกดยืนยันส่งมอบก่อนสร้าง QR' });
      const token = crypto.randomBytes(32).toString('base64url');
      item.returnTokenHash = hashReturnToken(token);
      item.returnTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await writeStore(store);
      const appBase = process.env.PUBLIC_APP_URL || req.headers.origin || `${req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')}://${req.headers['x-forwarded-host'] || req.headers.host}`;
      const returnUrl = new URL('/', appBase);
      returnUrl.hash = new URLSearchParams({ returnToken: token }).toString();
      const qrCode = await QRCode.toDataURL(returnUrl.toString(), { errorCorrectionLevel: 'M', margin: 2, width: 300 });
      return json(res, 200, { qrCode, itemName: item.itemName, expiresAt: item.returnTokenExpiresAt });
    }
    if (req.method === 'POST' && route === '/api/return-preview') {
      const viewer = await requireUser(req, res);
      if (!viewer) return;
      const body = await readBody(req);
      const token = String(body.token || '');
      const store = await readStore();
      const item = store.items.find((entry) => tokenMatchesHash(token, entry.returnTokenHash));
      const activeClaim = item && activeApprovedClaim(store, item);
      if (!item || !activeClaim || activeClaim.fromId !== viewer.id || !item.handoffSentAt || !canViewItem(viewer, item) || item.status !== 'open' || isExpiredItem(item) || Date.parse(item.returnTokenExpiresAt || '') <= Date.now())
        return json(res, 404, { error: 'QR หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอ QR ใหม่จากผู้แจ้ง' });
      return json(res, 200, { itemId: item.id, itemName: item.itemName, type: item.type });
    }
    if (req.method === 'POST' && route === '/api/return-confirm') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const item = store.items.find((entry) => tokenMatchesHash(String(body.token || ''), entry.returnTokenHash));
      const activeClaim = item && activeApprovedClaim(store, item);
      if (!item || !activeClaim || activeClaim.fromId !== user.id || !item.handoffSentAt || !canViewItem(user, item) || item.status !== 'open' || isExpiredItem(item) || Date.parse(item.returnTokenExpiresAt || '') <= Date.now())
        return json(res, 404, { error: 'QR หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอ QR ใหม่จากผู้แจ้ง' });
      completeClaimReturn(store, item, activeClaim, user);
      await writeStore(store);
      return json(res, 200, { ok: true, itemId: item.id, itemName: item.itemName });
    }
    if (req.method === 'POST' && route === '/api/items/check') {
      const viewer = await requireUser(req, res);
      if (!viewer) return;
      const body = await readBody(req);
      const draft = {
        type: body.type,
        itemName: String(body.itemName || '').slice(0, 90),
        category: String(body.category || ''),
        color: String(body.color || '').slice(0, 40),
        description: String(body.description || '').slice(0, 500),
        location: String(body.location || ''),
        date: String(body.date || ''),
        imageFeatures: normalizeImageFeatures(body.imageFeatures),
      };
      if (!['lost', 'found'].includes(draft.type)) return json(res, 400, { error: 'กรุณาเลือกประเภทประกาศ' });
      const duplicates = visibleItemsFor(viewer, (await readStore()).items)
        .filter((item) => item.type === draft.type && !['resolved', 'expired'].includes(item.status) && !isExpiredItem(item))
        .map((item) => ({ itemId: item.id, itemName: item.itemName, ...matchAnalysis(draft, item, true) }))
        .filter((match) => match.score >= 52)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);
      return json(res, 200, { duplicates });
    }
    if (req.method === 'POST' && route === '/api/image-search') {
      const viewer = await requireUser(req, res);
      if (!viewer) return;
      const body = await readBody(req);
      const imageFeatures = normalizeImageFeatures(body.imageFeatures);
      if (!imageFeatures) return json(res, 400, { error: 'อ่านข้อมูลจากรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่' });
      const matches = visibleItemsFor(viewer, (await readStore()).items)
        .filter((item) => item.status !== 'resolved' && item.imageFeatures)
        .map((item) => ({ itemId: item.id, score: imageSimilarity(imageFeatures, item.imageFeatures) }))
        .filter((match) => match.score !== null && match.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .slice(0, 20)
        .map((match) => ({ ...match, score: Math.round(match.score * 100) }));
      return json(res, 200, { matches });
    }
    if (req.method === 'GET' && route === '/api/saved-searches') {
      const user = await requireUser(req, res);
      if (!user) return;
      const savedSearches = (await readStore()).savedSearches.filter((search) => search.userId === user.id);
      return json(res, 200, { savedSearches });
    }
    if (req.method === 'POST' && route === '/api/saved-searches') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const requestedPlaceId = String(body.placeId || '').trim();
      const selectedPlace = requestedPlaceId ? SCHOOLS.find((school) => school.id === user.schoolId)?.mapPlaces?.find((place) => place.id === requestedPlaceId) : null;
      if (requestedPlaceId && !selectedPlace) return json(res, 400, { error: 'จุดที่บันทึกค้นหาไม่ตรงกับโรงเรียนในโปรไฟล์' });
      const search = {
        userId: user.id,
        query: String(body.query || '').trim().slice(0, 100),
        category: String(body.category || ''),
        location: String(body.location || ''),
        placeId: selectedPlace?.id || '',
        placeName: selectedPlace?.name || '',
        schoolId: selectedPlace ? user.schoolId : '',
        date: String(body.date || ''),
        type: ['all', 'lost', 'found'].includes(body.type) ? body.type : 'all',
      };
      if (!search.query && !search.category && !search.location && !search.placeId && !search.date && search.type === 'all')
        return json(res, 400, { error: 'กรุณาระบุคำค้นหาหรือเลือกตัวกรองอย่างน้อยหนึ่งรายการ' });
      const store = await readStore();
      if (store.savedSearches.some((entry) => entry.userId === user.id && entry.query === search.query && entry.category === search.category && entry.location === search.location && entry.placeId === search.placeId && entry.schoolId === search.schoolId && entry.date === search.date && entry.type === search.type))
        return json(res, 409, { error: 'บันทึกการค้นหานี้ไว้แล้ว' });
      const savedSearch = { id: crypto.randomUUID(), ...search, createdAt: new Date().toISOString() };
      store.savedSearches.push(savedSearch);
      await writeStore(store);
      return json(res, 201, { savedSearch });
    }
    if (req.method === 'DELETE' && route.startsWith('/api/saved-searches/')) {
      const user = await requireUser(req, res);
      if (!user) return;
      const id = route.slice('/api/saved-searches/'.length);
      const store = await readStore();
      const search = store.savedSearches.find((entry) => entry.id === id && entry.userId === user.id);
      if (!search) return json(res, 404, { error: 'ไม่พบรายการค้นหาที่บันทึกไว้' });
      store.savedSearches = store.savedSearches.filter((entry) => entry.id !== id);
      await writeStore(store);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && route === '/api/restaurants') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (!user.schoolId) return json(res, 200, { restaurants: [], requiresSchool: true, schoolName: '' });
      const store = await readStore();
      const restaurants = buildRestaurantList(store, { schoolId: user.schoolId, userId: user.id });
      return json(res, 200, { restaurants, requiresSchool: false, schoolName: user.school || '' });
    }
    if (req.method === 'POST' && route === '/api/restaurants/rating') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const restaurantId = String(body.restaurantId || '');
      const value = Number(body.value);
      const store = await readStore();
      const result = saveRestaurantRating(store, user, restaurantId, value);
      await writeStore(store);
      return json(res, 200, result);
    }
    if (req.method === 'GET' && route === '/api/work-orders') {
      const user = await requireUser(req, res);
      if (!user) return;
      const orders = (await readStore()).workOrders
        .filter((order) => order.reporterId === user.id)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      return json(res, 200, { workOrders: orders });
    }
    if (req.method === 'POST' && route === '/api/work-orders') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const type = String(body.type || '');
      const definition = WORK_ORDER_TYPES[type];
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const location = String(body.location || '').trim();
      if (!definition) return json(res, 400, { error: 'กรุณาเลือกประเภทปัญหาที่ถูกต้อง' });
      if (title.length < 3 || title.length > 100) return json(res, 400, { error: 'หัวข้อต้องมีความยาว 3–100 ตัวอักษร' });
      if (description.length < 10 || description.length > 1200) return json(res, 400, { error: 'รายละเอียดต้องมีความยาว 10–1,200 ตัวอักษร' });
      if (location.length < 2 || location.length > 160) return json(res, 400, { error: 'กรุณาระบุบริเวณที่พบปัญหา 2–160 ตัวอักษร' });
      const store = await readStore();
      const createdAt = new Date().toISOString();
      const order = {
        id: crypto.randomUUID(), type, typeLabel: definition.label, department: definition.department,
        title, description, location, reporterId: user.id, reporterName: user.name, workflowDetails: definition.workflowDetails,
        schoolId: user.schoolId || '', schoolName: user.school || '', status: 'received', assignedTo: '',
        createdAt, updatedAt: createdAt,
        history: [{ status: 'received', label: 'รับเรื่อง', actorId: user.id, actorName: user.name, at: createdAt }],
      };
      store.workOrders.push(order);
      await writeStore(store);
      return json(res, 201, { workOrder: order });
    }
    if (req.method === 'GET' && route === '/api/items') {
      const viewer = await requireUser(req, res);
      if (!viewer) return;
      const store = await readStore();
      const visibleItems = visibleItemsFor(viewer, store.items);
      const visibleIds = new Set(visibleItems.map((item) => item.id));
      const commentCounts = new Map();
      for (const comment of store.comments)
        if (visibleIds.has(comment.itemId)) commentCounts.set(comment.itemId, (commentCounts.get(comment.itemId) || 0) + 1);
      const items = visibleItems
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => {
        const { expiryDays, expiresAt, ...visibleItem } = item;
        return {
            ...visibleItem,
            status: isExpiredItem(item) ? 'expired' : item.status,
            commentCount: commentCounts.get(item.id) || 0,
          };
        });
      return json(res, 200, { items: withMatches(items, viewer.id) });
    }
    if (req.method === 'GET' && route === '/api/notifications') {
      const user = await requireUser(req, res);
      if (!user) return;
      const store = await readStore();
      const userNotifications = store.notifications
        .filter((notification) => notification.userId === user.id && canViewNotification(user, notification, store.items))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
      const page = userNotifications.slice(offset, offset + 50);
      return json(res, 200, {
        notifications: page,
        unreadCount: userNotifications.filter((notification) => !notification.readAt).length,
        hasMore: offset + page.length < userNotifications.length,
      });
    }
    if (req.method === 'POST' && route === '/api/notifications/read') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const notificationIds = Array.isArray(body.notificationIds) ? new Set(body.notificationIds.slice(0, 50).map(String)) : null;
      const store = await readStore();
      const readAt = new Date().toISOString();
      store.notifications.forEach((notification) => {
        if (notification.userId === user.id && canViewNotification(user, notification, store.items) && !notification.readAt && (!notificationIds || notificationIds.has(notification.id))) notification.readAt = readAt;
      });
      await writeStore(store);
      const unreadCount = store.notifications.filter((notification) => notification.userId === user.id && canViewNotification(user, notification, store.items) && !notification.readAt).length;
      return json(res, 200, { ok: true, unreadCount });
    }
    if (req.method === 'GET' && route === '/api/comments') {
      const user = await requireUser(req, res);
      if (!user) return;
      const itemId = String(url.searchParams.get('itemId') || '');
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item || !canViewItem(user, item))
        return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      const comments = store.comments
        .filter((comment) => comment.itemId === itemId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return json(res, 200, { comments });
    }
    if (req.method === 'POST' && route === '/api/comments') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemId = String(body.itemId || '');
      const text = String(body.text || '').trim();
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status === 'resolved' || isExpiredItem(item))
        return json(res, 409, { error: 'ประกาศนี้ปิดแล้วและไม่รับความคิดเห็นใหม่' });
      if (text.length < 1 || text.length > 1000)
        return json(res, 400, { error: 'ความคิดเห็นต้องมีความยาว 1–1,000 ตัวอักษร' });
      const parentId = String(body.parentId || '');
      const parent = parentId ? store.comments.find((entry) => entry.id === parentId && entry.itemId === itemId) : null;
      if (parentId && !parent) return json(res, 404, { error: 'ไม่พบความคิดเห็นที่ต้องการตอบกลับ' });
      const comment = {
        id: crypto.randomUUID(),
        itemId,
        itemName: item.itemName,
        fromId: user.id,
        fromName: user.name,
        toId: parent ? parent.fromId : item.ownerId,
        parentId: parent ? parent.id : null,
        text,
        createdAt: new Date().toISOString(),
      };
      store.comments.push(comment);
      await writeStore(store);
      return json(res, 201, { comment });
    }
    if (req.method === 'POST' && route === '/api/items') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemName = String(body.itemName || '').trim();
      const reporterName = String(body.reporterName || '').trim();
      const type = body.type;
      const visibility = body.visibility == null ? 'public' : String(body.visibility);
      const reward = parseOptionalReward(body, type);
      const category = String(body.category || '');
      const location = String(body.location || '');
      const date = String(body.date || '');
      if (itemName.length < 2 || itemName.length > 90)
        return json(res, 400, { error: 'กรุณากรอกชื่อสิ่งของความยาว 2–90 ตัวอักษร' });
      if (reporterName.length < 2 || reporterName.length > 80)
        return json(res, 400, { error: 'กรุณากรอกชื่อผู้แจ้งความยาว 2–80 ตัวอักษร' });
      if (!['lost', 'found'].includes(type))
        return json(res, 400, { error: 'กรุณาเลือกประเภทประกาศของหายหรือของที่พบ' });
      if (!['public', 'school'].includes(visibility))
        return json(res, 400, { error: 'กรุณาเลือกว่าจะเผยแพร่สาธารณะหรือเฉพาะโรงเรียน' });
      if (visibility === 'school' && !user.schoolId)
        return json(res, 400, { error: 'กรุณาเลือกโรงเรียนในโปรไฟล์ก่อนลงประกาศในชุมชนโรงเรียน' });
      if (!reward) return json(res, 400, { error: 'จำนวนสินน้ำใจต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 1,000,000 บาท' });
      if (
        !['School supplies', 'Stationery', 'Clothing', 'Personal items', 'Bags', 'Phones', 'Electronics', 'Other'].includes(
          category,
        )
      )
        return json(res, 400, { error: 'กรุณาเลือกหมวดหมู่ที่ถูกต้อง' });
      if (!['Classroom', 'Library', 'Cafeteria', 'Sports area', 'Other'].includes(location))
        return json(res, 400, { error: 'กรุณาเลือกสถานที่ที่ถูกต้อง' });
      const requestedPlaceId = String(body.placeId || '').trim();
      const mapPlace = requestedPlaceId ? SCHOOLS.find((school) => school.id === user.schoolId)?.mapPlaces?.find((place) => place.id === requestedPlaceId) : null;
      if (requestedPlaceId && !mapPlace) return json(res, 400, { error: 'กรุณาเลือกจุดบนแผนที่ของโรงเรียนในโปรไฟล์' });
      const parsedDate = Date.parse(`${date}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(parsedDate) ||
        new Date(parsedDate).toISOString().slice(0, 10) !== date
      )
        return json(res, 400, { error: 'กรุณาระบุวันที่ให้ถูกต้อง' });
      const item = {
        id: crypto.randomUUID(),
        type,
        itemName,
        reporterName,
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
        contactPublic: body.contactPublic === true,
        rewardOffered: reward.offered,
        rewardAmount: reward.amount,
        depositLocation: type === 'found' ? String(body.depositLocation || '').trim().slice(0, 120) : '',
        location: mapPlace?.legacyLocation || location,
        placeId: mapPlace?.id || '',
        placeName: mapPlace?.name || '',
        date,
        eventTime: /^\d{2}:\d{2}$/.test(String(body.eventTime || '')) ? body.eventTime : '',
        photo: null,
        photos: [],
        photoFeatures: [],
        ownerId: user.id,
        ownerName: user.name,
        schoolId: user.schoolId || '',
        schoolName: SCHOOLS.find((entry) => entry.id === user.schoolId)?.name || '',
        visibility,
        status: 'open',
        assignedTo: '',
        createdAt: new Date().toISOString(),
        timeline: [{ type: 'reported', at: new Date().toISOString() }],
      };
      if (Array.isArray(body.photos)) {
        if (body.photos.length > 6) return json(res, 400, { error: 'เพิ่มรูปได้ไม่เกิน 6 รูป' });
        for (const entry of body.photos) {
          if (!entry || typeof entry !== 'object' || entry.url || !mimeFromData(entry.data))
            return json(res, 400, { error: 'ข้อมูลรูปภาพไม่ถูกต้อง กรุณาเลือกรูปใหม่' });
        }
        for (const entry of body.photos) {
          item.photos.push(await storeItemPhoto(entry.data));
          item.photoFeatures.push(normalizeImageFeatures(entry.imageFeatures));
        }
        item.photo = item.photos[0] || null;
        item.imageFeatures = item.photoFeatures[0] || null;
      } else if (body.photo) {
        item.photo = await storeItemPhoto(body.photo);
        item.photos = [item.photo];
        item.imageFeatures = normalizeImageFeatures(body.imageFeatures);
        item.photoFeatures = [item.imageFeatures];
      }
      const store = await readStore();
      const matches = visibleItemsFor(user, store.items)
        .filter((existing) => existing.type !== type && !['resolved', 'expired'].includes(existing.status) && !isExpiredItem(existing))
        .map((existing) => ({ existing, score: matchAnalysis(item, existing).score }))
        .filter((match) => match.score >= 40);
      const notificationMatches = matches.filter(({ existing }) => {
        if (existing.ownerId === user.id) return false;
        const recipient = store.users.find((entry) => entry.id === existing.ownerId);
        return !!recipient && canViewItem(recipient, item) && canViewItem(recipient, existing);
      });
      const createdAt = item.createdAt;
      for (const { existing, score } of notificationMatches) {
        const base = {
          id: crypto.randomUUID(),
          type: 'possible_match',
          sourceItemId: item.id,
          matchItemId: existing.id,
          itemName: item.itemName,
          matchItemName: existing.itemName,
          score,
          createdAt,
          readAt: null,
        };
        store.notifications.push({ ...base, userId: user.id, targetItemId: existing.id });
        store.notifications.push({ ...base, id: crypto.randomUUID(), userId: existing.ownerId, targetItemId: item.id });
      }
      const matchedSearchesByUser = new Map();
      for (const search of store.savedSearches) {
        const searchUser = store.users.find((entry) => entry.id === search.userId);
        if (search.userId === user.id || !searchUser || (search.placeId && search.schoolId !== searchUser.schoolId) || !canViewItem(searchUser, item) || !savedSearchMatchesItem(search, item)) continue;
        if (!matchedSearchesByUser.has(search.userId)) matchedSearchesByUser.set(search.userId, new Set());
        matchedSearchesByUser.get(search.userId).add(search.query || [search.category, search.placeName || search.location, search.date].filter(Boolean).join(' · ') || 'ตัวกรองที่บันทึกไว้');
      }
      for (const [userId, queries] of matchedSearchesByUser) {
        store.notifications.push({
          id: crypto.randomUUID(),
          type: 'saved_search',
          userId,
          itemName: item.itemName,
          query: [...queries].join(' · '),
          targetItemId: item.id,
          createdAt,
          readAt: null,
        });
      }
      store.items.push(item);
      await writeStore(store);
      const results = withMatches(visibleItemsFor(user, store.items), user.id);
      const saved = results.find((x) => x.id === item.id);
      return json(res, 201, { item: saved, possibleMatchCount: notificationMatches.length });
    }
    if (req.method === 'POST' && route === '/api/claims') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemId = String(body.itemId || '');
      const proof = String(body.proof || '').trim();
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item || !canViewItem(user, item) || item.type !== 'found') return json(res, 404, { error: 'ไม่พบประกาศสิ่งของที่เก็บได้' });
      if (item.ownerId === user.id) return json(res, 400, { error: 'ไม่สามารถขอรับของจากประกาศของตนเองได้' });
      if (item.status === 'resolved' || isExpiredItem(item)) return json(res, 409, { error: 'ประกาศนี้ปิดแล้วหรือหมดอายุ' });
      if (proof.length < 10 || proof.length > 1000) return json(res, 400, { error: 'กรุณาระบุรายละเอียดเพื่อยืนยันความเป็นเจ้าของอย่างน้อย 10 ตัวอักษร' });
      if (store.claims.some((claim) => claim.itemId === itemId && claim.fromId === user.id && claim.status === 'pending'))
        return json(res, 409, { error: 'คุณมีคำขอที่กำลังรอพิจารณาอยู่แล้ว' });
      const claim = { id: crypto.randomUUID(), itemId, itemName: item.itemName, fromId: user.id, fromName: user.name, ownerId: item.ownerId, proof, status: 'pending', createdAt: new Date().toISOString() };
      store.claims.push(claim);
      addItemTimeline(item, 'claim_requested', claim.createdAt);
      store.notifications.push({ id: crypto.randomUUID(), userId: item.ownerId, type: 'claim_request', claimId: claim.id, fromId: user.id, itemName: item.itemName, fromName: user.name, targetItemId: item.id, createdAt: claim.createdAt, readAt: null });
      await writeStore(store);
      return json(res, 201, { claim });
    }
    if (req.method === 'POST' && route === '/api/claims/cancel') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const claim = store.claims.find((entry) => entry.id === body.claimId);
      if (!claim) return json(res, 404, { error: 'ไม่พบคำขอนี้' });
      if (claim.fromId !== user.id) return json(res, 403, { error: 'ยกเลิกได้เฉพาะคำขอของตนเอง' });
      if (claim.status !== 'pending') return json(res, 409, { error: 'ยกเลิกได้เฉพาะคำขอที่ยังรอพิจารณา' });
      const item = store.items.find((entry) => entry.id === claim.itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้แล้ว' });
      claim.status = 'cancelled';
      claim.updatedAt = new Date().toISOString();
      addItemTimeline(item, 'claim_cancelled', claim.updatedAt);
      store.notifications = store.notifications.filter((notification) =>
        !(notification.type === 'claim_request' && notification.userId === claim.ownerId && notification.targetItemId === claim.itemId &&
          (notification.claimId === claim.id || (!notification.claimId && (notification.fromId === user.id || (!notification.fromId && notification.fromName === claim.fromName))))),
      );
      store.notifications.push({
        id: crypto.randomUUID(),
        userId: item.ownerId,
        type: 'claim_cancelled',
        claimId: claim.id,
        itemName: item.itemName,
        fromName: user.name,
        targetItemId: item.id,
        createdAt: claim.updatedAt,
        readAt: null,
      });
      await writeStore(store);
      return json(res, 200, { claim });
    }
    if (req.method === 'GET' && route === '/api/claims') {
      const user = await requireUser(req, res);
      if (!user) return;
      const itemId = String(url.searchParams.get('itemId') || '');
      const store = await readStore();
      const claims = store.claims.filter((claim) => {
        if (!(claim.fromId === user.id || claim.ownerId === user.id || user.role === 'admin') || (itemId && claim.itemId !== itemId)) return false;
        const item = store.items.find((entry) => entry.id === claim.itemId);
        return !!item && canViewItem(user, item);
      }).map((claim) => ({ ...claim, proof: claim.ownerId === user.id || claim.fromId === user.id ? claim.proof : undefined }));
      return json(res, 200, { claims });
    }
    if (req.method === 'POST' && route === '/api/claims/status') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const claim = store.claims.find((entry) => entry.id === body.claimId);
      if (!claim) return json(res, 404, { error: 'ไม่พบคำขอนี้' });
      if (claim.ownerId !== user.id && user.role !== 'admin') return json(res, 403, { error: 'เฉพาะเจ้าของประกาศเท่านั้นที่พิจารณาคำขอได้' });
      if (!['approved', 'rejected'].includes(body.status)) return json(res, 400, { error: 'สถานะคำขอไม่ถูกต้อง' });
      if (claim.status !== 'pending') return json(res, 409, { error: 'คำขอนี้ได้รับการพิจารณาแล้ว' });
      const item = store.items.find((entry) => entry.id === claim.itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status === 'resolved' || isExpiredItem(item)) return json(res, 409, { error: 'ประกาศนี้ปิดแล้วหรือหมดอายุ' });
      claim.status = body.status;
      claim.updatedAt = new Date().toISOString();
      addItemTimeline(item, body.status === 'approved' ? 'claim_approved' : 'claim_rejected', claim.updatedAt);
      if (body.status === 'approved') item.activeClaimId = claim.id;
      store.notifications.push({ id: crypto.randomUUID(), userId: claim.fromId, type: 'claim_status', itemName: claim.itemName, status: claim.status, targetItemId: claim.itemId, createdAt: claim.updatedAt, readAt: null });
      if (body.status === 'approved') rejectPendingClaims(store, item, claim.id, claim.updatedAt);
      await writeStore(store);
      return json(res, 200, { claim });
    }
    if (req.method === 'POST' && route === '/api/claims/schedule') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const claim = store.claims.find((entry) => entry.id === body.claimId);
      if (!claim) return json(res, 404, { error: 'ไม่พบคำขอนี้' });
      if (claim.ownerId !== user.id) return json(res, 403, { error: 'นัดรับได้เฉพาะผู้พบที่ลงประกาศนี้' });
      const item = store.items.find((entry) => entry.id === claim.itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status !== 'open' || claim.status !== 'approved' || item.activeClaimId !== claim.id)
        return json(res, 409, { error: 'ต้องตรวจสอบเจ้าของและอนุมัติคำขอก่อนนัดรับ' });
      if (item.handoffSentAt) return json(res, 409, { error: 'ยืนยันส่งมอบแล้ว จึงแก้ไขนัดไม่ได้' });
      const meetingDate = String(body.meetingDate || '').trim();
      const meetingTime = String(body.meetingTime || '').trim();
      const meetingPlace = String(body.meetingPlace || '').trim();
      const meetingTimestamp = Date.parse(`${meetingDate}T${meetingTime}:00+07:00`);
      const [year, month, day] = meetingDate.split('-').map(Number);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(meetingDate)
        && new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === meetingDate;
      if (!validDate || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(meetingTime) || !Number.isFinite(meetingTimestamp) || meetingTimestamp <= Date.now())
        return json(res, 400, { error: 'เลือกวันและเวลานัดรับที่ยังมาไม่ถึง' });
      if (meetingPlace.length < 2 || meetingPlace.length > 120) return json(res, 400, { error: 'ระบุสถานที่นัดรับ 2–120 ตัวอักษร' });
      const wasScheduled = !!claim.scheduledAt;
      claim.meetingDate = meetingDate;
      claim.meetingTime = meetingTime;
      claim.meetingPlace = meetingPlace;
      claim.scheduledAt = new Date().toISOString();
      claim.updatedAt = claim.scheduledAt;
      addItemTimeline(item, wasScheduled ? 'pickup_rescheduled' : 'pickup_scheduled', claim.scheduledAt);
      store.notifications.push({ id: crypto.randomUUID(), type: 'claim_schedule', userId: claim.fromId, itemName: item.itemName, targetItemId: item.id, meetingDate, meetingTime, meetingPlace, createdAt: claim.scheduledAt, readAt: null });
      await writeStore(store);
      return json(res, 200, { claim, item });
    }
    if (req.method === 'POST' && route === '/api/claims/handoff') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const claim = store.claims.find((entry) => entry.id === body.claimId);
      if (!claim) return json(res, 404, { error: 'ไม่พบคำขอนี้' });
      if (claim.ownerId !== user.id) return json(res, 403, { error: 'ยืนยันส่งมอบได้เฉพาะผู้พบที่ลงประกาศนี้' });
      const item = store.items.find((entry) => entry.id === claim.itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status !== 'open' || claim.status !== 'approved' || item.activeClaimId !== claim.id || !claim.scheduledAt)
        return json(res, 409, { error: 'ต้องอนุมัติเจ้าของและบันทึกนัดรับก่อนยืนยันส่งมอบ' });
      if (item.handoffSentAt) return json(res, 409, { error: 'ยืนยันส่งมอบไปแล้ว รอผู้รับกดยืนยันรับ' });
      item.handoffSentAt = new Date().toISOString();
      item.handoffSentBy = user.id;
      item.returnTokenHash = null;
      item.returnTokenExpiresAt = null;
      claim.handoffSentAt = item.handoffSentAt;
      claim.updatedAt = item.handoffSentAt;
      addItemTimeline(item, 'handoff_sent', item.handoffSentAt);
      store.notifications.push({ id: crypto.randomUUID(), type: 'handoff_sent', userId: claim.fromId, itemName: item.itemName, targetItemId: item.id, createdAt: item.handoffSentAt, readAt: null });
      await writeStore(store);
      return json(res, 200, { ok: true, claim, item });
    }
    if (req.method === 'POST' && route === '/api/claims/receive') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const store = await readStore();
      const claim = store.claims.find((entry) => entry.id === body.claimId);
      if (!claim) return json(res, 404, { error: 'ไม่พบคำขอนี้' });
      if (claim.fromId !== user.id) return json(res, 403, { error: 'ยืนยันรับได้เฉพาะผู้ที่ส่งคำขอรับคืน' });
      const item = store.items.find((entry) => entry.id === claim.itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status !== 'open' || claim.status !== 'approved' || item.activeClaimId !== claim.id || !item.handoffSentAt)
        return json(res, 409, { error: 'ผู้พบยังไม่ได้ยืนยันส่งมอบของ' });
      completeClaimReturn(store, item, claim, user);
      await writeStore(store);
      return json(res, 200, { ok: true, item, claim });
    }
    if (req.method === 'POST' && route === '/api/item-reports') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const itemId = String(body.itemId || '');
      const reason = String(body.reason || '');
      const details = String(body.details || '').trim().slice(0, 500);
      const store = await readStore();
      const item = store.items.find((entry) => entry.id === itemId);
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.ownerId === user.id) return json(res, 400, { error: 'ไม่สามารถรายงานประกาศของตนเองได้' });
      if (!['inaccurate', 'inappropriate', 'privacy', 'other'].includes(reason)) return json(res, 400, { error: 'กรุณาเลือกเหตุผลในการรายงาน' });
      if (store.itemReports.some((report) => report.itemId === itemId && report.fromId === user.id && report.status === 'open'))
        return json(res, 409, { error: 'คุณได้รายงานประกาศนี้แล้วและอยู่ระหว่างตรวจสอบ' });
      store.itemReports.push({ id: crypto.randomUUID(), itemId, itemName: item.itemName, fromId: user.id, fromName: user.name, reason, details, status: 'open', createdAt: new Date().toISOString() });
      await writeStore(store);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'GET' && route === '/api/admin/item-reports') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return json(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      const reports = (await readStore()).itemReports.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { reports });
    }
    if (req.method === 'POST' && route === '/api/admin/item-reports/status') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return json(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      const body = await readBody(req);
      const store = await readStore();
      const report = store.itemReports.find((entry) => entry.id === body.reportId);
      if (!report) return json(res, 404, { error: 'ไม่พบรายงานนี้' });
      report.status = 'reviewed';
      report.reviewedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && route === '/api/messages') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const item = (await readStore()).items.find((x) => x.id === body.itemId);
      const message = String(body.message || '').trim();
      if (!item || !canViewItem(user, item)) return json(res, 404, { error: 'ไม่พบประกาศนี้' });
      if (item.status === 'resolved' || isExpiredItem(item))
        return json(res, 409, { error: 'ประกาศนี้ปิดแล้วและไม่รับข้อความใหม่' });
      if (item.ownerId === user.id)
        return json(res, 400, { error: 'ไม่สามารถส่งข้อความถึงประกาศของตนเองได้' });
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'ข้อความต้องมีความยาว 5–1,000 ตัวอักษร' });
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
        return json(res, 404, { error: 'ไม่พบข้อความนี้' });
      const item = store.items.find((entry) => entry.id === original.itemId);
      if (original.itemId && (!item || !canViewItem(user, item))) return json(res, 404, { error: 'ไม่พบข้อความนี้' });
      if (item && (item.status === 'resolved' || isExpiredItem(item)))
        return json(res, 409, { error: 'ประกาศนี้ปิดแล้วและไม่รับข้อความใหม่' });
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'ข้อความต้องมีความยาว 5–1,000 ตัวอักษร' });
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
        .filter((m) => {
          if (m.toId !== user.id && m.fromId !== user.id) return false;
          if (!m.itemId) return true;
          const item = store.items.find((entry) => entry.id === m.itemId);
          return !!item && canViewItem(user, item);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const commentNotifications = store.comments
        .filter((comment) => {
          if (comment.toId !== user.id || comment.fromId === user.id) return false;
          const item = store.items.find((entry) => entry.id === comment.itemId);
          return !!item && canViewItem(user, item);
        })
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
      return json(res, 200, { messages, staffMessages, staffRequests, commentNotifications });
    }
    if (req.method === 'POST' && route === '/api/contact/reply') {
      const user = await requireUser(req, res);
      if (!user) return;
      if (!canManageSupport(user))
        return json(res, 403, { error: 'เฉพาะเจ้าหน้าที่เท่านั้นที่ตอบกลับคำขอนี้ได้' });
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (message.length < 5 || message.length > 1000)
        return json(res, 400, { error: 'ข้อความต้องมีความยาว 5–1,000 ตัวอักษร' });
      const store = await readStore();
      const request = store.staffMessages.find((m) => m.id === body.requestId);
      if (!request) return json(res, 404, { error: 'ไม่พบคำขอความช่วยเหลือนี้' });
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
        return json(res, 400, { error: 'ข้อความต้องมีความยาว 5–1,000 ตัวอักษร' });
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
        return json(res, 404, { error: 'ไม่พบข้อมูลที่ต้องการ' });
      return sendFile(res, path.join(PHOTO_DIR, filename));
    }
    if (req.method === 'GET' && route === '/') return sendFile(res, path.join(ROOT, 'index.html'));
    if (req.method === 'GET' && ['/index.html', '/style.css', '/script.js', '/thung-song-campus-map.png', '/hamster-hub-campus-map.svg'].includes(route))
      return sendFile(res, path.join(ROOT, route.slice(1)));
    return json(res, 404, { error: 'ไม่พบข้อมูลที่ต้องการ' });
  } catch (error) {
    if (!res.headersSent)
      json(res, error.status || 500, {
        error: error.status ? error.message : 'ระบบขัดข้อง กรุณาลองอีกครั้ง',
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
