'use strict';
const byId = (id) => document.getElementById(id);
const state = {
  user: null,
  reportType: 'lost',
  editingItemId: null,
  showingMyItems: false,
  reportingItemId: null,
  imageSearchIds: null,
  imageSearchScores: new Map(),
  pendingReturnToken: new URLSearchParams(window.location.hash.slice(1)).get('returnToken') || new URLSearchParams(window.location.search).get('returnToken'),
  returnToken: null,
  activeFilter: 'all',
  items: [],
  favoriteIds: [],
  photo: null,
  previewUrl: null,
  cameraStream: null,
  notificationTimer: null,
  unreadNotifications: 0,
  notificationOffset: 0,
  contactMode: 'staff',
  contactItemId: null,
  replyMessageId: null,
  activeItemId: null,
  replyToCommentId: null,
};
if (state.pendingReturnToken) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('returnToken');
  cleanUrl.hash = '';
  window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
}
const ADMIN_NAME = 'AdminRK';
const ADMIN_STUDENT_ID = 'T36699';
async function api(path, options = {}) {
  // This Vercel project exposes Node functions with their .js filenames.
  // Keep callers readable while targeting the deployed function URLs directly.
  const splitAt = path.indexOf('?');
  const pathname = splitAt < 0 ? path : path.slice(0, splitAt);
  const query = splitAt < 0 ? '' : path.slice(splitAt);
  const endpoint = pathname.startsWith('/api/') && !pathname.endsWith('.js')
    ? `${pathname}.js${query}`
    : path;
  let response;
  try {
    response = await fetch(endpoint, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (window.location.protocol === 'file:') {
      throw new Error('กรุณาเปิดเว็บผ่านเซิร์ฟเวอร์ก่อน: รัน start-server.ps1 ในโฟลเดอร์ Find-Thing แล้วเข้า http://127.0.0.1:3000');
    }
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่าเว็บยังทำงานอยู่ แล้วลองใหม่อีกครั้ง');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || '';
    const hasThai = /[\u0E00-\u0E7F]/u.test(message);
    const localized = {
      400: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง',
      401: 'เข้าสู่ระบบไม่สำเร็จหรือเซสชันหมดอายุ กรุณาตรวจสอบข้อมูลและเข้าสู่ระบบใหม่',
      403: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
      404: 'ไม่พบข้อมูลที่ต้องการ อาจถูกลบไปแล้ว',
      409: 'ทำรายการไม่ได้ เนื่องจากข้อมูลหรือสถานะเปลี่ยนแปลง กรุณารีเฟรชแล้วลองอีกครั้ง',
      413: 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป',
      429: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
      503: 'ระบบขัดข้องหรือยังตั้งค่าไม่ครบ กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ',
    }[response.status];
    throw new Error(hasThai ? message : localized || 'ระบบขัดข้อง กรุณาลองอีกครั้ง');
  }
  return data;
}
function setMessage(id, text, kind = 'error') {
  const node = byId(id);
  node.textContent = text;
  node.classList.toggle('success-message', kind === 'success');
}
function setAuthView(id) {
  if (id === 'login-form') {
    byId('login-title').textContent = 'ยินดีต้อนรับกลับ';
    byId('login-intro').textContent = 'เข้าสู่ระบบเพื่อดูและติดตามประกาศของโรงเรียน';
    if (byId('login-id').value === 'A1010') byId('login-id').value = '';
  }
  document.querySelectorAll('.auth-view').forEach((view) => view.classList.remove('active'));
  byId(id).classList.add('active');
}
function openAdminLogin() {
  byId('login-title').textContent = 'เข้าสู่ระบบผู้ดูแล';
  byId('login-intro').textContent = 'สำหรับเจ้าหน้าที่แผงควบคุมงานประชาสัมพันธ์';
  byId('login-id').value = 'A1010';
  byId('login-password').value = '';
  document.querySelectorAll('.auth-view').forEach((view) => view.classList.remove('active'));
  byId('login-form').classList.add('active');
  byId('login-password').focus();
}
function showToast(text) {
  const toast = byId('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function renderNav() {
  const nav = byId('nav');
  nav.replaceChildren();
  if (!state.user) {
    const signup = document.createElement('button');
    signup.className = 'button';
    signup.textContent = 'สมัครสมาชิก';
    signup.addEventListener('click', () => setAuthView('signup-form'));
    const login = document.createElement('button');
    login.className = 'button primary';
    login.textContent = 'เข้าสู่ระบบ';
    login.addEventListener('click', () => setAuthView('login-form'));
    const help = document.createElement('button');
    help.className = 'button';
    help.type = 'button';
    help.textContent = 'วิธีใช้งาน';
    help.addEventListener('click', openHelp);
    nav.append(signup, login, help);
    return;
  }
  const board = document.createElement('button');
  board.className = 'button';
  board.type = 'button';
    board.textContent = 'หน้าประกาศ';
  board.addEventListener('click', showBoard);
  const help = document.createElement('button');
  help.className = 'button';
  help.type = 'button';
  help.textContent = 'วิธีใช้งาน';
  help.addEventListener('click', openHelp);
  const inbox = document.createElement('button');
  inbox.className = 'button';
  inbox.textContent = canManageSupport() ? 'กล่องข้อความเจ้าหน้าที่' : 'กล่องข้อความ';
  inbox.addEventListener('click', openInbox);
  const notifications = document.createElement('button');
  notifications.className = 'button';
  notifications.id = 'notifications-button';
  notifications.type = 'button';
  notifications.addEventListener('click', openNotifications);
  updateNotificationButton(notifications);
  const profile = document.createElement('button');
  profile.className = 'button';
  profile.type = 'button';
  profile.textContent = 'โปรไฟล์';
  profile.addEventListener('click', openProfile);
  nav.append(board, help, inbox, notifications, profile);
  if (state.user.role === 'admin') {
    const adminPanel = document.createElement('button');
    adminPanel.className = 'button';
    adminPanel.textContent = 'แผงควบคุมงาน';
    adminPanel.addEventListener('click', openAdminPanel);
    nav.append(adminPanel);
  }
  const logout = document.createElement('button');
  logout.className = 'button';
  logout.textContent = 'ออกจากระบบ';
  logout.addEventListener('click', logoutUser);
  nav.append(logout);
}
function canManageSupport() {
  return ['staff', 'admin'].includes(state.user?.role);
}
function openHelp() {
  byId('help-dialog').showModal();
}
function showBoard() {
  byId('app').classList.remove('admin-mode');
  byId('admin-panel').classList.add('hidden');
}
async function openAdminPanel() {
  if (state.user?.role !== 'admin') return;
  byId('app').classList.add('admin-mode');
  byId('admin-panel').classList.remove('hidden');
  await loadAdminData();
}
function enterApp(user) {
  state.user = user;
  try {
    state.favoriteIds = JSON.parse(localStorage.getItem(`found-it:favorites:${user.id}`) || '[]');
  } catch {
    state.favoriteIds = [];
  }
  byId('auth-screen').classList.add('hidden');
  byId('app').classList.remove('hidden');
  showBoard();
  renderNav();
  refreshNotificationCount();
  clearInterval(state.notificationTimer);
  state.notificationTimer = setInterval(refreshNotificationCount, 60000);
  if (user.role === 'admin') openAdminPanel();
  else loadItems();
  if (state.pendingReturnToken) prepareReturnConfirmation();
}
function exitApp() {
  clearInterval(state.notificationTimer);
  state.notificationTimer = null;
  state.user = null;
  byId('app').classList.add('hidden');
  byId('auth-screen').classList.remove('hidden');
  showBoard();
  byId('auth-choice').classList.add('active');
  document.querySelectorAll('.auth-view').forEach((view) => {
    if (view.id !== 'auth-choice') view.classList.remove('active');
  });
  renderNav();
}
async function start() {
  renderNav();
  try {
    const result = await api('/api/session');
    enterApp(result.user);
  } catch {
    byId('auth-screen').classList.remove('hidden');
  }
}
async function submitAuth(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const messageId = kind === 'register' ? 'signup-message' : 'login-message';
  setMessage(messageId, '');
  const payload =
    kind === 'register'
      ? {
          name: byId('signup-name').value.trim(),
          studentId: byId('signup-id').value.trim(),
          password: byId('signup-password').value,
          adminSetupCode: byId('admin-setup-code').value,
        }
      : { studentId: byId('login-id').value.trim(), password: byId('login-password').value };
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api(`/api/${kind}`, { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    enterApp(result.user);
  } catch (error) {
    setMessage(messageId, error.message);
  } finally {
    button.disabled = false;
  }
}
async function logoutUser() {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
  } catch (error) {
    showToast(error.message);
  }
  exitApp();
}
function categoryIcon(category) {
  return (
    {
      'School supplies': '📘',
      Stationery: '✏️',
      Clothing: '🧥',
      'Personal items': '🎒',
      Bags: '🎒',
      Phones: '📱',
      Electronics: '🎧',
      Other: '🔎',
    }[category] || '🔎'
  );
}
function categoryDisplayName(category) {
  return ({
    'School supplies': 'อุปกรณ์การเรียน',
    Stationery: 'เครื่องเขียน',
    Clothing: 'เสื้อผ้า',
    'Personal items': 'ของใช้ส่วนตัว',
    Bags: 'กระเป๋า',
    Phones: 'โทรศัพท์',
    Electronics: 'อุปกรณ์อิเล็กทรอนิกส์',
    Other: 'อื่น ๆ',
  })[category] || category || 'ไม่ระบุหมวดหมู่';
}
function locationLabel(location) {
  return ({
    Classroom: 'ห้องเรียน',
    Library: 'ห้องสมุด',
    Cafeteria: 'โรงอาหาร',
    'Sports area': 'สนามกีฬา',
    Other: 'อื่น ๆ',
  })[location] || location || 'ไม่ระบุสถานที่';
}
function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(date);
}
function formatPostedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'เวลาไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
function reportCode(item) {
  const created = new Date(item.createdAt || Date.now());
  const year = Number.isNaN(created.getTime()) ? new Date().getFullYear() : created.getFullYear();
  const compactId = String(item.id || '').replace(/[^a-f0-9]/gi, '').slice(-6);
  const sequence = (compactId || '000000').toUpperCase();
  return `${item.type === 'lost' ? 'หาย' : 'พบ'}-${year}-${sequence}`;
}
function setFavoriteButton(button, itemId) {
  const active = state.favoriteIds.includes(itemId);
  button.classList.toggle('is-saved', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'นำออกจากรายการบันทึก' : 'บันทึกประกาศนี้');
  button.title = active ? 'บันทึกแล้ว' : 'บันทึกประกาศ';
}
function toggleFavorite(itemId, button) {
  state.favoriteIds = state.favoriteIds.includes(itemId)
    ? state.favoriteIds.filter((id) => id !== itemId)
    : [...state.favoriteIds, itemId];
  try {
    localStorage.setItem(`found-it:favorites:${state.user.id}`, JSON.stringify(state.favoriteIds));
  } catch {}
  setFavoriteButton(button, itemId);
  showToast(state.favoriteIds.includes(itemId) ? 'บันทึกประกาศแล้ว' : 'นำออกจากรายการบันทึกแล้ว');
}
async function analyzePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    canvas.width = 9;
    canvas.height = 8;
    context.drawImage(bitmap, 0, 0, 9, 8);
    const gray = context.getImageData(0, 0, 9, 8).data;
    let dhash = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const left = (y * 9 + x) * 4;
      const right = left + 4;
      const a = gray[left] * 0.299 + gray[left + 1] * 0.587 + gray[left + 2] * 0.114;
      const b = gray[right] * 0.299 + gray[right + 1] * 0.587 + gray[right + 2] * 0.114;
      dhash += a > b ? '1' : '0';
    }
    canvas.width = 32;
    canvas.height = 32;
    context.drawImage(bitmap, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const histogram = new Array(24).fill(0);
    for (let i = 0; i < pixels.length; i += 4) {
      histogram[Math.min(7, pixels[i] >> 5)]++;
      histogram[8 + Math.min(7, pixels[i + 1] >> 5)]++;
      histogram[16 + Math.min(7, pixels[i + 2] >> 5)]++;
    }
    const count = pixels.length / 4;
    bitmap.close();
    return { version: 1, dhash, histogram: histogram.map((value) => value / count) };
  } catch {
    return null;
  }
}
function makeMatchPreview(match, compact = false) {
  const candidate = state.items.find((entry) => entry.id === match.itemId);
  if (!candidate) return null;
  const card = document.createElement('article');
  card.className = `match-preview${compact ? ' compact' : ''}`;
  const content = document.createElement('div');
  content.className = 'match-preview-content';
  const heading = document.createElement('strong');
  heading.textContent = `${match.score}% ตรงกัน · ${candidate.itemName}`;
  const caption = document.createElement('span');
  caption.textContent = `${candidate.type === 'lost' ? 'ของหาย' : 'เก็บได้'} · ${categoryDisplayName(candidate.category)} · ${locationLabel(candidate.location)}`;
  const meter = document.createElement('span');
  meter.className = 'match-meter';
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', `คะแนนความคล้าย ${match.score} เปอร์เซ็นต์`);
  const fill = document.createElement('span');
  fill.style.width = `${Math.max(0, Math.min(100, match.score))}%`;
  meter.append(fill);
  const reasons = document.createElement('span');
  reasons.className = 'match-reasons';
  const labels = [...(match.reasons || [])];
  if (match.imageScore !== null && match.imageScore !== undefined) labels.unshift(`ภาพ ${match.imageScore}%`);
  reasons.textContent = labels.length ? `ตรงกัน: ${labels.slice(0, 4).join(' · ')}` : 'คะแนนจากข้อมูลที่มีของทั้งสองประกาศ';
  content.append(heading, caption, meter, reasons);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'button match-open';
  action.textContent = 'ดูประกาศที่อาจตรง';
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    openItemDetails(candidate.id);
  });
  card.append(content, action);
  return card;
}
function makeMatchEmpty(compact = false) {
  const empty = document.createElement('div');
  empty.className = `match-empty${compact ? ' compact' : ''}`;
  const icon = document.createElement('span');
  icon.textContent = '🤖';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'ยังไม่พบประกาศที่มีข้อมูลใกล้เคียง';
  empty.append(icon, text);
  if (compact) {
    const hint = document.createElement('span');
    hint.className = 'match-empty-note';
    hint.textContent = 'เพิ่มรายละเอียดและสถานที่ให้ชัด เพื่อช่วยให้จับคู่ได้แม่นขึ้น';
    empty.append(hint);
  }
  return empty;
}
function renderItemMatches(item, container) {
  container.replaceChildren();
  const matches = item.possibleMatches || [];
  matches.forEach((match) => {
    const preview = makeMatchPreview(match);
    if (preview) container.append(preview);
  });
  if (!container.childElementCount) container.append(makeMatchEmpty());
  container.classList.remove('hidden');
}
function makeItemCard(item) {
  const article = document.createElement('article');
  article.className = 'item-card';
  article.dataset.type = item.type;
  article.dataset.category = item.category;
  article.dataset.location = item.location;
  article.tabIndex = 0;
  article.setAttribute('aria-label', `ดูรายละเอียด ${item.itemName}`);
  article.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) return;
    openItemDetails(item.id);
  });
  article.addEventListener('keydown', (event) => {
    if (event.target === article && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openItemDetails(item.id);
    }
  });

  const art = document.createElement('div');
  art.className = `item-art ${item.type}${item.photo ? ' has-photo' : ''}`;
  if (item.photo) {
    const image = document.createElement('img');
    image.src = item.photo;
    image.alt = item.itemName;
    image.loading = 'lazy';
    art.append(image);
  } else {
    const illustration = document.createElement('span');
    illustration.className = 'item-art-icon';
    illustration.setAttribute('aria-hidden', 'true');
    illustration.textContent = categoryIcon(item.category);
    art.append(illustration);
  }
  const badge = document.createElement('span');
  badge.className = `badge ${item.type}`;
  badge.textContent = item.type === 'lost' ? '🔴 ของหาย' : '🟢 เก็บได้';
  if (item.status === 'resolved') {
    const resolvedBadge = document.createElement('span');
    resolvedBadge.className = 'badge resolved';
    resolvedBadge.textContent = 'ปิดประกาศแล้ว';
    art.append(resolvedBadge);
  } else if (item.status === 'expired') {
    const expiredBadge = document.createElement('span');
    expiredBadge.className = 'badge resolved';
    expiredBadge.textContent = 'หมดอายุ';
    art.append(expiredBadge);
  } else if (item.type === 'found' && item.status === 'open') {
    const unclaimedBadge = document.createElement('span');
    unclaimedBadge.className = 'badge resolved';
    unclaimedBadge.textContent = 'ยังไม่มีผู้รับ';
    art.append(unclaimedBadge);
  }
  const code = document.createElement('span');
  code.className = 'item-code';
  code.textContent = reportCode(item);
  const imageScore = state.imageSearchScores.get(item.id);
  const favorite = document.createElement('button');
  favorite.className = 'item-favorite';
  favorite.type = 'button';
  favorite.textContent = '★';
  favorite.addEventListener('click', () => toggleFavorite(item.id, favorite));
  setFavoriteButton(favorite, item.id);
  art.append(badge, code, favorite);

  const body = document.createElement('div');
  body.className = 'item-content';
  const meta = document.createElement('div');
  meta.className = 'item-meta item-category';
  const categoryIconNode = document.createElement('span');
  categoryIconNode.setAttribute('aria-hidden', 'true');
  categoryIconNode.textContent = categoryIcon(item.category);
  const categoryLabel = document.createElement('span');
  categoryLabel.textContent = categoryDisplayName(item.category);
  meta.append(categoryIconNode, categoryLabel);
  const title = document.createElement('h3');
  title.textContent = item.itemName;
  const desc = document.createElement('p');
  desc.className = 'item-description';
  desc.textContent = item.description || `สี / ลักษณะ ${item.color || 'ไม่ได้ระบุ'}`;
  const info = document.createElement('div');
  info.className = 'item-card-info';
  const location = document.createElement('span');
  location.textContent = `📍 ${locationLabel(item.location)}`;
  const eventDate = document.createElement('span');
  eventDate.textContent = `📅 ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  if (item.eventTime) eventDate.textContent += ` · ${item.eventTime} น.`;
  const posted = document.createElement('span');
  posted.textContent = `◷ ลงประกาศ ${formatPostedDate(item.createdAt)}`;
  info.append(location, eventDate, posted);
  if (item.type === 'lost' && item.rewardOffered) {
    const reward = document.createElement('span');
    reward.className = 'reward-note';
    reward.textContent = item.rewardAmount ? `💛 สินน้ำใจ ฿${Number(item.rewardAmount).toLocaleString('th-TH')}` : '💛 มีสินน้ำใจ (สอบถามรายละเอียด)';
    info.append(reward);
  }
  if (item.expiresAt) {
    const expiry = document.createElement('span');
    expiry.textContent = `⌛ หมดเขต ${formatDate(item.expiresAt.slice(0, 10))}`;
    info.append(expiry);
  }
  const footer = document.createElement('div');
  footer.className = 'item-card-footer';
  const reporter = document.createElement('span');
  reporter.className = 'item-reporter-chip';
  reporter.textContent = `👤 ${item.reporterName || item.ownerName || 'ไม่ระบุชื่อ'}`;
  const actions = document.createElement('div');
  actions.className = 'item-card-actions';
  if (item.ownerId !== state.user.id && item.status === 'open') {
    const contact = document.createElement('button');
    contact.className = 'item-contact-icon';
    contact.type = 'button';
    contact.textContent = '🔗';
    contact.setAttribute('aria-label', 'ส่งข้อความถึงผู้แจ้ง');
    contact.title = 'ส่งข้อความถึงผู้แจ้ง';
    contact.addEventListener('click', () => openItemContact(item));
    actions.append(contact);
  }
  const details = document.createElement('button');
  details.className = 'button item-details-button';
  details.type = 'button';
  details.innerHTML = 'ดูข้อมูล <span aria-hidden="true">→</span>';
  details.addEventListener('click', () => openItemDetails(item.id));
  actions.append(details);
  footer.append(reporter, actions);
  body.append(meta, title, desc);
  if (imageScore !== undefined) {
    const imageMatch = document.createElement('span');
    imageMatch.className = 'form-hint';
    imageMatch.textContent = `ภาพคล้ายกัน ${imageScore}%`;
    body.append(imageMatch);
  }
  const topMatch = (item.possibleMatches || []).find((match) => state.items.some((entry) => entry.id === match.itemId));
  const matchPreview = topMatch ? makeMatchPreview(topMatch, true) : makeMatchEmpty(true);
  body.append(matchPreview || makeMatchEmpty(true));
  body.append(info, footer);
  article.append(art, body);
  return article;
}
async function loadItems() {
  try {
    const result = await api('/api/items');
    state.items = result.items;
    renderItems();
    updateStats();
  } catch (error) {
    showToast(error.message);
  }
}
function updateNotificationButton(button = byId('notifications-button')) {
  if (!button) return;
  const count = state.unreadNotifications;
  button.textContent = count ? `แจ้งเตือน (${count})` : 'แจ้งเตือน';
  button.setAttribute('aria-label', count ? `แจ้งเตือน มีรายการใหม่ ${count} รายการ` : 'แจ้งเตือน');
}
async function refreshNotificationCount() {
  if (!state.user) return;
  try {
    const result = await api('/api/notifications');
    state.unreadNotifications = result.unreadCount || 0;
    updateNotificationButton();
  } catch {
    // Keep the board usable when notifications are temporarily unavailable.
  }
}
async function openNotifications() {
  const list = byId('notification-list');
  list.replaceChildren();
  byId('notifications-empty').classList.add('hidden');
  byId('load-more-notifications').classList.add('hidden');
  try {
    byId('notifications-dialog').showModal();
    await loadNotificationPage(0, false);
  } catch (error) {
    showToast(error.message);
  }
}
async function loadNotificationPage(offset, append) {
  const list = byId('notification-list');
  const result = await api(`/api/notifications?offset=${offset}`);
  if (!append) list.replaceChildren();
  for (const notification of result.notifications) {
    const card = document.createElement('article');
    card.className = 'message-card';
    const title = document.createElement('strong');
    title.textContent = notification.type === 'claim_request'
      ? 'มีคำขอรับของคืน'
      : notification.type === 'claim_cancelled'
        ? 'ยกเลิกคำขอรับของคืน'
      : notification.type === 'claim_status'
        ? 'อัปเดตคำขอรับของคืน'
        : notification.type === 'return_confirmed'
          ? 'ยืนยันการรับคืนแล้ว'
        : notification.type === 'saved_search'
          ? 'พบประกาศใหม่ตามคำค้นหา'
          : 'พบประกาศที่อาจตรงกัน';
    const body = document.createElement('p');
    body.textContent = notification.type === 'claim_request'
      ? `${notification.fromName} ขอรับ “${notification.itemName}”`
      : notification.type === 'claim_cancelled'
        ? `${notification.fromName} ยกเลิกคำขอรับ “${notification.itemName}”`
      : notification.type === 'claim_status'
        ? `คำขอรับ “${notification.itemName}” ${notification.status === 'approved' ? 'ได้รับการอนุมัติ โปรดนัดรับคืนและสแกน QR เมื่อได้รับของแล้ว' : 'ยังไม่ได้รับการอนุมัติ'}`
        : notification.type === 'return_confirmed'
          ? `ผู้รับยืนยันรับ “${notification.itemName}” คืนแล้ว`
        : notification.type === 'saved_search'
          ? `พบ “${notification.itemName}” ที่ตรงกับ “${notification.query || 'ตัวกรองที่บันทึกไว้'}”`
          : `“${notification.itemName}” อาจตรงกับ “${notification.matchItemName}” (${notification.score}%)`;
    const date = document.createElement('small');
    date.textContent = formatPostedDate(notification.createdAt);
    const open = document.createElement('button');
    open.className = 'button small';
    open.type = 'button';
    open.textContent = 'ดูประกาศ';
    open.addEventListener('click', () => {
      byId('notifications-dialog').close();
      openItemDetails(notification.targetItemId);
    });
    card.append(title, body, date, open);
    list.append(card);
  }
  byId('notifications-empty').classList.toggle('hidden', list.childElementCount > 0);
  state.notificationOffset = offset + result.notifications.length;
  byId('load-more-notifications').classList.toggle('hidden', !result.hasMore);
  try {
    const readResult = await api('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationIds: result.notifications.map((notification) => notification.id) }),
    });
    state.unreadNotifications = readResult.unreadCount;
  } catch {
    state.unreadNotifications = result.unreadCount || 0;
  }
  updateNotificationButton();
}
async function openItemDetails(itemId, replyToId = null) {
  let item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    const result = await api('/api/items');
    state.items = result.items;
    item = state.items.find((entry) => entry.id === itemId);
  }
  if (!item) return showToast('ไม่พบประกาศนี้');
  state.activeItemId = item.id;
  state.replyToCommentId = null;
  byId('comment-replying').classList.add('hidden');
  byId('cancel-comment-reply').hidden = true;
  byId('detail-kind').textContent = item.type === 'lost' ? 'ประกาศของหาย' : 'ประกาศของที่พบ';
  byId('detail-title').textContent = item.itemName;
  byId('detail-meta').textContent = `${categoryDisplayName(item.category)} · ${locationLabel(item.location)} · ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  if (item.eventTime) byId('detail-meta').textContent += ` · เวลาประมาณ ${item.eventTime} น.`;
  byId('detail-description').textContent = item.description || `สี / ลักษณะ: ${item.color || 'ไม่ได้ระบุ'}`;
  const deleteButton = byId('delete-item');
  const canDelete = state.user && (state.user.role === 'admin' || item.ownerId === state.user.id);
  deleteButton.classList.toggle('hidden', !canDelete);
  deleteButton.onclick = () => deleteItem(item);
  const statusButton = byId('resolve-item');
  statusButton.classList.toggle('hidden', !canDelete);
  statusButton.textContent = ['resolved', 'expired'].includes(item.status) ? 'เปิดประกาศอีกครั้ง' : 'ปิดประกาศแล้ว (ได้ของคืน)';
  statusButton.onclick = () => updateItemStatus(item, ['resolved', 'expired'].includes(item.status) ? 'open' : 'resolved');
  const returnQrButton = byId('return-qr-button');
  returnQrButton.classList.toggle('hidden', !canDelete || item.status !== 'open');
  returnQrButton.onclick = () => createReturnQr(item);
  const editButton = byId('edit-item');
  editButton.classList.toggle('hidden', !canDelete || item.status === 'resolved');
  const claimButton = byId('claim-item');
  claimButton.classList.toggle('hidden', item.type !== 'found' || item.ownerId === state.user.id || item.status !== 'open');
  const claimSection = byId('claim-section');
  claimSection.classList.toggle('hidden', item.type !== 'found');
  byId('claim-form').classList.toggle('hidden', item.ownerId === state.user.id || item.status !== 'open');
  byId('claim-status').textContent = '';
  byId('claim-proof').value = '';
  byId('report-item').classList.toggle('hidden', item.ownerId === state.user.id);
  loadClaimsForItem(item);
  const photo = byId('detail-photo');
  photo.classList.toggle('hidden', !item.photo);
  if (item.photo) photo.src = item.photo;
  const facts = byId('detail-facts');
  facts.replaceChildren();
  const rows = [
    ['ผู้แจ้ง', item.reporterName || item.ownerName || 'ไม่ระบุ'],
    ['ลงประกาศ', formatPostedDate(item.createdAt)],
    ['สถานะ', item.status === 'resolved' ? 'ปิดประกาศแล้ว' : item.status === 'expired' ? 'หมดอายุ' : item.type === 'found' && item.status === 'open' ? 'ยังไม่มีผู้รับ' : 'ยังเปิดรับข้อมูล'],
    ...(item.expiresAt ? [['หมดเขต', formatDate(item.expiresAt.slice(0, 10))]] : []),
  ];
  if (item.type === 'lost' && item.rewardOffered) {
    rows.push(['สินน้ำใจ', item.rewardAmount ? `฿${Number(item.rewardAmount).toLocaleString('th-TH')}` : 'เจ้าของยินดีให้ (สอบถามรายละเอียด)']);
  }
  if (item.contact) rows.push(['ช่องทางติดต่อ', item.contact]);
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'detail-fact';
    const name = document.createElement('span');
    name.textContent = label;
    const content = document.createElement('strong');
    content.textContent = value;
    row.append(name, content);
    facts.append(row);
  });
  renderItemMatches(item, byId('detail-match-list'));
  byId('detail-match-section').classList.remove('hidden');
  byId('detail-match-note').classList.remove('hidden');
  byId('comment-status').textContent = '';
  byId('comment-text').value = '';
  const commentClosed = ['resolved', 'expired'].includes(item.status);
  byId('comment-text').disabled = commentClosed;
  byId('comment-form').querySelector('button[type="submit"]').disabled = commentClosed;
  if (commentClosed) byId('comment-status').textContent = item.status === 'expired' ? 'ประกาศนี้หมดอายุแล้ว' : 'ประกาศนี้ปิดแล้ว ไม่รับความคิดเห็นใหม่';
  byId('detail-dialog').showModal();
  await loadItemComments(item.id);
  if (replyToId) setCommentReply(replyToId);
}
async function loadClaimsForItem(item) {
  const list = byId('claim-list');
  list.replaceChildren();
  if (item.type !== 'found') return;
  try {
    const result = await api(`/api/claims?itemId=${encodeURIComponent(item.id)}`);
    const canReview = item.ownerId === state.user.id || state.user.role === 'admin';
    const claims = canReview ? result.claims : result.claims.filter((claim) => claim.fromId === state.user.id);
    for (const claim of claims) {
      const card = document.createElement('article');
      card.className = 'message-card';
      const title = document.createElement('strong');
      title.textContent = `${claim.fromName} · ${claim.status === 'pending' ? 'รอพิจารณา' : claim.status === 'approved' ? 'อนุมัติคำขอ · รอรับคืน' : claim.status === 'fulfilled' ? 'ยืนยันรับคืนแล้ว' : claim.status === 'cancelled' ? 'ผู้ขอยกเลิกคำขอ' : 'ไม่อนุมัติ'}`;
      const proof = document.createElement('p');
      proof.textContent = claim.proof;
      card.append(title, proof);
      if (canReview && claim.status === 'pending') {
        for (const [status, label] of [['approved', 'ยืนยันเจ้าของ'], ['rejected', 'ไม่อนุมัติ']]) {
          const button = document.createElement('button');
          button.className = 'button small';
          button.type = 'button';
          button.textContent = label;
          button.addEventListener('click', async () => {
            try {
              await api('/api/claims/status', { method: 'POST', body: JSON.stringify({ claimId: claim.id, status }) });
              await loadClaimsForItem(item);
              await loadItems();
              showToast(status === 'approved' ? 'อนุมัติคำขอแล้ว ให้นัดรับคืนและสร้าง QR ยืนยัน' : 'ปฏิเสธคำขอแล้ว');
            } catch (error) { byId('claim-status').textContent = error.message; }
          });
          card.append(button);
        }
      } else if (claim.fromId === state.user.id && claim.status === 'pending') {
        const cancel = document.createElement('button');
        cancel.className = 'button small';
        cancel.type = 'button';
        cancel.textContent = 'ยกเลิกคำขอ';
        cancel.addEventListener('click', async () => {
          cancel.disabled = true;
          try {
            await api('/api/claims/cancel', { method: 'POST', body: JSON.stringify({ claimId: claim.id }) });
            await loadClaimsForItem(item);
            await loadItems();
            refreshNotificationCount();
            showToast('ยกเลิกคำขอแล้ว');
          } catch (error) {
            byId('claim-status').textContent = error.message;
            cancel.disabled = false;
          }
        });
        card.append(cancel);
      }
      list.append(card);
    }
  } catch (error) { byId('claim-status').textContent = error.message; }
}
async function submitClaim(event) {
  event.preventDefault();
  const item = state.items.find((entry) => entry.id === state.activeItemId);
  if (!item) return;
  try {
    await api('/api/claims', { method: 'POST', body: JSON.stringify({ itemId: item.id, proof: byId('claim-proof').value.trim() }) });
    byId('claim-proof').value = '';
    byId('claim-status').textContent = 'ส่งคำขอแล้ว ติดตามผลได้ในประกาศนี้';
    await loadClaimsForItem(item);
  } catch (error) { byId('claim-status').textContent = error.message; }
}
function openItemReport() {
  state.reportingItemId = state.activeItemId;
  byId('item-report-form').reset();
  byId('item-report-status').textContent = '';
  byId('detail-dialog').close();
  byId('item-report-dialog').showModal();
}
async function createReturnQr(item) {
  const button = byId('return-qr-button');
  button.disabled = true;
  try {
    const result = await api(`/api/items/${encodeURIComponent(item.id)}/return-qr`, { method: 'POST', body: '{}' });
    byId('return-qr-item-name').textContent = item.itemName;
    byId('return-qr-image').src = result.qrCode;
    byId('detail-dialog').close();
    byId('return-qr-dialog').showModal();
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}
async function prepareReturnConfirmation() {
  const token = state.pendingReturnToken;
  if (!token || !state.user) return;
  try {
    const result = await api('/api/return-preview', { method: 'POST', body: JSON.stringify({ token }) });
    state.returnToken = token;
    byId('return-confirm-item').textContent = `รายการ: ${result.itemName}`;
    byId('return-confirm-status').textContent = '';
    byId('return-confirm-dialog').showModal();
  } catch (error) {
    state.pendingReturnToken = null;
    showToast(error.message);
  }
}
async function confirmReturnedItem() {
  const button = byId('confirm-return');
  button.disabled = true;
  try {
    const result = await api('/api/return-confirm', { method: 'POST', body: JSON.stringify({ token: state.returnToken }) });
    state.returnToken = null;
    state.pendingReturnToken = null;
    byId('return-confirm-dialog').close();
    showToast(`ยืนยันรับ “${result.itemName}” แล้ว`);
    await loadItems();
    refreshNotificationCount();
  } catch (error) { byId('return-confirm-status').textContent = error.message; }
  finally { button.disabled = false; }
}
async function submitItemReport(event) {
  event.preventDefault();
  try {
    await api('/api/item-reports', { method: 'POST', body: JSON.stringify({ itemId: state.reportingItemId, reason: byId('item-report-reason').value, details: byId('item-report-details').value.trim() }) });
    byId('item-report-dialog').close();
    showToast('ส่งรายงานให้ผู้ดูแลแล้ว');
  } catch (error) { byId('item-report-status').textContent = error.message; }
}
async function deleteItem(item) {
  const confirmed = window.confirm(`ต้องการลบประกาศ “${item.itemName}” ใช่ไหม? การลบนี้ไม่สามารถย้อนกลับได้`);
  if (!confirmed) return;
  const button = byId('delete-item');
  button.disabled = true;
  try {
    await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    byId('detail-dialog').close();
    showToast('ลบประกาศแล้ว');
    await loadItems();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}
async function updateItemStatus(item, status) {
  const button = byId('resolve-item');
  button.disabled = true;
  try {
    await api('/api/items/status', {
      method: 'POST',
      body: JSON.stringify({ itemId: item.id, status }),
    });
    byId('detail-dialog').close();
    showToast(status === 'resolved' ? 'ปิดประกาศแล้ว' : 'เปิดประกาศอีกครั้งแล้ว');
    await loadItems();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}
function renderCommentThreads(comments, parentId = null, depth = 0) {
  const container = byId('comment-list');
  comments.filter((comment) => (comment.parentId || null) === parentId).forEach((comment) => {
    const card = document.createElement('article');
    card.className = `comment-card${depth ? ' comment-reply' : ''}`;
    card.style.marginInlineStart = `${Math.min(depth, 3) * 16}px`;
    const head = document.createElement('div');
    head.className = 'comment-head';
    const name = document.createElement('strong');
    name.textContent = comment.fromName;
    const date = document.createElement('time');
    date.dateTime = comment.createdAt;
    date.textContent = formatPostedDate(comment.createdAt);
    head.append(name, date);
    const text = document.createElement('p');
    text.textContent = comment.text;
    card.append(head, text);
    const activeItem = state.items.find((item) => item.id === state.activeItemId);
    if (activeItem?.status !== 'resolved') {
      const reply = document.createElement('button');
      reply.className = 'text-button comment-reply-button';
      reply.type = 'button';
      reply.textContent = 'ตอบกลับ';
      reply.addEventListener('click', () => setCommentReply(comment.id));
      card.append(reply);
    }
    container.append(card);
    renderCommentThreads(comments, comment.id, depth + 1);
  });
}
async function loadItemComments(itemId) {
  try {
    const result = await api(`/api/comments?itemId=${encodeURIComponent(itemId)}`);
    state.activeComments = result.comments;
    const list = byId('comment-list');
    list.replaceChildren();
    renderCommentThreads(result.comments);
    byId('comment-count').textContent = result.comments.length;
    byId('comments-empty').classList.toggle('hidden', result.comments.length > 0);
  } catch (error) {
    byId('comment-status').textContent = error.message;
  }
}
function setCommentReply(commentId) {
  const comment = state.activeComments?.find((entry) => entry.id === commentId);
  state.replyToCommentId = commentId;
  byId('comment-replying').textContent = `กำลังตอบกลับ ${comment?.fromName || 'ความคิดเห็น'}`;
  byId('comment-replying').classList.remove('hidden');
  byId('cancel-comment-reply').hidden = false;
  byId('comment-text').focus();
}
async function submitComment(event) {
  event.preventDefault();
  const text = byId('comment-text').value.trim();
  if (!text) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ itemId: state.activeItemId, parentId: state.replyToCommentId, text }),
    });
    state.replyToCommentId = null;
    byId('comment-text').value = '';
    byId('comment-replying').classList.add('hidden');
    byId('cancel-comment-reply').hidden = true;
    byId('comment-status').textContent = '';
    await loadItemComments(state.activeItemId);
    await loadItems();
    showToast('ส่งความคิดเห็นแล้ว');
  } catch (error) {
    byId('comment-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function openProfile() {
  byId('profile-name').value = state.user?.name || '';
  byId('profile-student-id').value = state.user?.studentId || '';
  byId('profile-grade').value = state.user?.grade || '';
  byId('profile-school').value = state.user?.school || '';
  byId('open-change-password').classList.toggle('hidden', state.user?.studentId?.toLowerCase() === 'a1010');
  byId('profile-status').textContent = '';
  byId('profile-dialog').showModal();
}
function openChangePassword() {
  byId('profile-dialog').close();
  byId('change-password-form').reset();
  byId('change-password-status').textContent = '';
  byId('change-password-dialog').showModal();
}
async function submitPasswordChange(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  if (byId('new-password').value !== byId('confirm-new-password').value) {
    byId('change-password-status').textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  byId('change-password-status').textContent = '';
  try {
    await api('/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: byId('current-password').value, newPassword: byId('new-password').value }),
    });
    form.reset();
    byId('change-password-dialog').close();
    showToast('เปลี่ยนรหัสผ่านแล้ว เซสชันอื่นถูกออกจากระบบ');
  } catch (error) {
    byId('change-password-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
async function openMyClaims() {
  const list = byId('my-claims-list');
  list.replaceChildren();
  byId('my-claims-empty').classList.add('hidden');
  byId('my-claims-error').textContent = '';
  try {
    const result = await api('/api/claims');
    const claims = result.claims
      .filter((claim) => claim.fromId === state.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const claim of claims) {
      const item = state.items.find((entry) => entry.id === claim.itemId);
      const card = document.createElement('article');
      card.className = 'message-card claim-history-card';
      const heading = document.createElement('strong');
      heading.textContent = claim.itemName;
      const status = document.createElement('span');
      status.className = `claim-history-status ${claim.status}`;
      status.textContent = claim.status === 'pending'
        ? 'รอเจ้าของประกาศพิจารณา'
        : claim.status === 'approved'
          ? 'ยืนยันเจ้าของแล้ว · รอนัดรับคืน'
          : claim.status === 'fulfilled'
            ? 'ยืนยันรับคืนแล้ว'
            : claim.status === 'cancelled'
              ? 'คุณยกเลิกคำขอนี้แล้ว'
              : 'ไม่อนุมัติคำขอ';
      const meta = document.createElement('small');
      const itemState = item?.status === 'expired' ? ' · ประกาศหมดอายุ' : item?.status === 'resolved' ? ' · ประกาศปิดแล้ว' : '';
      meta.textContent = `ส่งคำขอ ${formatPostedDate(claim.createdAt)}${itemState}`;
      const proof = document.createElement('p');
      proof.textContent = claim.proof;
      card.append(heading, status, meta, proof);
      if (claim.status === 'pending') {
        const cancel = document.createElement('button');
        cancel.className = 'button small';
        cancel.type = 'button';
        cancel.textContent = 'ยกเลิกคำขอ';
        cancel.addEventListener('click', async () => {
          cancel.disabled = true;
          try {
            await api('/api/claims/cancel', { method: 'POST', body: JSON.stringify({ claimId: claim.id }) });
            await loadItems();
            await openMyClaims();
            refreshNotificationCount();
            showToast('ยกเลิกคำขอแล้ว');
          } catch (error) {
            byId('my-claims-error').textContent = error.message;
            cancel.disabled = false;
          }
        });
        card.append(cancel);
      }
      if (item) {
        const open = document.createElement('button');
        open.className = 'button small';
        open.type = 'button';
        open.textContent = 'เปิดประกาศ';
        open.addEventListener('click', () => {
          byId('my-claims-dialog').close();
          byId('profile-dialog').close();
          openItemDetails(item.id);
        });
        card.append(open);
      }
      list.append(card);
    }
    byId('my-claims-empty').classList.toggle('hidden', claims.length > 0);
    if (!byId('my-claims-dialog').open) byId('my-claims-dialog').showModal();
  } catch (error) {
    byId('my-claims-error').textContent = error.message;
    if (!byId('my-claims-dialog').open) byId('my-claims-dialog').showModal();
  }
}
async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/profile', {
      method: 'POST',
      body: JSON.stringify({
        name: byId('profile-name').value.trim(),
        grade: byId('profile-grade').value.trim(),
        school: byId('profile-school').value.trim(),
      }),
    });
    state.user = result.user;
    byId('profile-dialog').close();
    renderNav();
    showToast('บันทึกโปรไฟล์แล้ว');
  } catch (error) {
    byId('profile-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function renderItems() {
  const list = byId('item-list');
  list.replaceChildren();
  const query = byId('search-input').value.trim().toLocaleLowerCase();
  const category = byId('category-filter').value;
  const location = byId('location-filter').value;
  const date = byId('date-filter').value;
  const items = state.items.filter(
    (item) =>
      (state.activeFilter === 'all' || item.type === state.activeFilter || (state.activeFilter === 'unclaimed' && item.type === 'found' && item.status === 'open')) &&
      (!state.showingMyItems || item.ownerId === state.user.id) &&
      (!state.imageSearchIds || state.imageSearchIds.includes(item.id)) &&
      (!category || item.category === category) &&
      (!location || item.location === location) &&
      (!date || item.date === date) &&
      (!query ||
        `${item.itemName} ${item.category} ${categoryDisplayName(item.category)} ${item.color} ${item.location} ${item.description}`
          .toLocaleLowerCase()
          .includes(query)),
  );
  items.forEach((item) => list.append(makeItemCard(item)));
  byId('empty-state').classList.toggle('hidden', items.length > 0);
}
async function searchByImage(file) {
  const status = byId('image-search-status');
  status.classList.remove('hidden');
  status.textContent = 'กำลังเปรียบเทียบภาพกับประกาศที่มีรูป...';
  try {
    const imageFeatures = await analyzePhoto(file);
    if (!imageFeatures) throw new Error('อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่');
    const result = await api('/api/image-search', { method: 'POST', body: JSON.stringify({ imageFeatures }) });
    state.imageSearchIds = result.matches.map((match) => match.itemId);
    state.imageSearchScores = new Map(result.matches.map((match) => [match.itemId, match.score]));
    byId('clear-image-search').classList.remove('hidden');
    status.textContent = result.matches.length
      ? `พบประกาศที่ภาพใกล้เคียง ${result.matches.length} รายการ (คะแนนภาพเป็นเพียงตัวช่วย)`
      : 'ยังไม่พบประกาศที่มีภาพใกล้เคียง';
    renderItems();
  } catch (error) { status.textContent = error.message; }
}
function clearImageSearch() {
  state.imageSearchIds = null;
  state.imageSearchScores.clear();
  byId('image-search-file').value = '';
  byId('image-search-status').classList.add('hidden');
  byId('clear-image-search').classList.add('hidden');
  renderItems();
}
async function saveCurrentSearch() {
  try {
    await api('/api/saved-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: byId('search-input').value.trim(),
        category: byId('category-filter').value,
        location: byId('location-filter').value,
        date: byId('date-filter').value,
        type: state.activeFilter,
      }),
    });
    showToast('บันทึกการค้นหาแล้ว จะแจ้งเตือนเมื่อมีประกาศใหม่ที่ตรงกัน');
  } catch (error) { showToast(error.message); }
}
async function openSavedSearches() {
  const list = byId('saved-searches-list');
  list.replaceChildren();
  try {
    const result = await api('/api/saved-searches');
    for (const search of result.savedSearches) {
      const row = document.createElement('article');
      row.className = 'message-card';
      const description = document.createElement('p');
      description.textContent = [search.query, search.category && categoryDisplayName(search.category), search.location && locationLabel(search.location), search.date, search.type !== 'all' && (search.type === 'lost' ? 'ของหาย' : 'เก็บได้')].filter(Boolean).join(' · ');
      const remove = document.createElement('button');
      remove.className = 'button small danger';
      remove.type = 'button';
      remove.textContent = 'ลบการแจ้งเตือนนี้';
      remove.addEventListener('click', async () => {
        try {
          await api(`/api/saved-searches/${encodeURIComponent(search.id)}`, { method: 'DELETE' });
          await openSavedSearches();
        } catch (error) { showToast(error.message); }
      });
      row.append(description, remove);
      list.append(row);
    }
    byId('saved-searches-empty').classList.toggle('hidden', result.savedSearches.length > 0);
    if (!byId('saved-searches-dialog').open) byId('saved-searches-dialog').showModal();
  } catch (error) { showToast(error.message); }
}
function updateStats() {
  byId('lost-count').textContent = state.items.filter((x) => x.type === 'lost').length;
  byId('found-count').textContent = state.items.filter((x) => x.type === 'found').length;
  byId('match-count').textContent = state.items.filter((x) => x.possibleMatches?.length).length;
  const tabCounts = {
    all: state.items.length,
    lost: state.items.filter((x) => x.type === 'lost').length,
    found: state.items.filter((x) => x.type === 'found').length,
    unclaimed: state.items.filter((x) => x.type === 'found' && x.status === 'open').length,
  };
  for (const [filter, count] of Object.entries(tabCounts)) {
    const node = document.querySelector(`[data-filter="${filter}"] .tab-count`);
    if (node) node.textContent = count;
  }
}
function openReport(type) {
  state.reportType = type;
  state.editingItemId = null;
  state.photo = null;
  byId('item-form').reset();
  byId('reward-options').hidden = type !== 'lost';
  byId('reward-amount-field').hidden = true;
  byId('item-reward-amount').disabled = true;
  byId('item-message').textContent = '';
  byId('item-reporter').value = state.user?.name || '';
  byId('dialog-kind').textContent = type === 'lost' ? 'แจ้งของหาย' : 'แจ้งเก็บของได้';
  byId('dialog-title').textContent = type === 'lost' ? 'แจ้งของหาย' : 'แจ้งสิ่งของที่พบ';
  byId('item-date-label').textContent = type === 'lost' ? 'วันที่หาย' : 'วันที่พบ';
  const today = new Date();
  byId('item-date').value = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  byId('item-date').max = byId('item-date').value;
  byId('item-time').value = '';
  byId('item-expiry-days').value = '30';
  clearPhoto();
  byId('item-dialog').showModal();
}
function editItem(item) {
  state.editingItemId = item.id;
  state.reportType = item.type;
  state.photo = null;
  byId('item-form').reset();
  byId('reward-options').hidden = item.type !== 'lost';
  byId('item-reward-offered').checked = item.rewardOffered === true;
  byId('item-reward-amount').value = item.rewardAmount || '';
  byId('reward-amount-field').hidden = item.type !== 'lost' || !item.rewardOffered;
  byId('item-reward-amount').disabled = item.type !== 'lost' || !item.rewardOffered;
  byId('dialog-kind').textContent = 'แก้ไขประกาศ';
  byId('dialog-title').textContent = `แก้ไข “${item.itemName}”`;
  byId('item-reporter').value = item.reporterName || state.user.name;
  byId('item-name').value = item.itemName;
  byId('item-category').value = item.category;
  byId('item-color').value = item.color || '';
  byId('item-description').value = item.description || '';
  byId('item-location').value = item.location;
  byId('item-date').value = item.date;
  byId('item-time').value = item.eventTime || '';
  byId('item-expiry-days').value = String(item.expiryDays || 30);
  byId('item-contact').value = item.contact || '';
  byId('item-contact-public').checked = item.contactPublic !== false;
  byId('item-message').textContent = 'รูปภาพเดิมจะคงอยู่';
  byId('item-date-label').textContent = item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ';
  byId('item-dialog').showModal();
}
function clearPhoto() {
  stopCamera();
  state.photo = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  byId('photo-preview').removeAttribute('src');
  byId('photo-preview').hidden = true;
  byId('photo-file').value = '';
  byId('camera-status').textContent = 'หลีกเลี่ยงการติดใบหน้าหรือข้อมูลส่วนตัวของนักเรียนในภาพ';
}
function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  const video = byId('camera-preview');
  video.srcObject = null;
  video.hidden = true;
  byId('camera-capture').hidden = true;
  byId('camera-stop').hidden = true;
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    byId('camera-status').textContent = 'ไม่สามารถเปิดกล้องได้ในขณะนี้ กรุณาเลือกรูปภาพแทน';
    byId('photo-file').click();
    return;
  }
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    const video = byId('camera-preview');
    video.srcObject = state.cameraStream;
    video.hidden = false;
    byId('camera-capture').hidden = false;
    byId('camera-stop').hidden = false;
    byId('camera-status').textContent = 'วางสิ่งของให้อยู่ในกรอบ แล้วกดถ่ายภาพ';
  } catch {
    byId('camera-status').textContent =
      'ไม่ได้รับอนุญาตให้ใช้กล้อง หรือกล้องไม่พร้อมใช้งาน กรุณาเลือกรูปภาพแทน';
  }
}
function setPhoto(blob) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.photo = blob;
  state.previewUrl = URL.createObjectURL(blob);
  byId('photo-preview').src = state.previewUrl;
  byId('photo-preview').hidden = false;
}
function capturePhoto() {
  const video = byId('camera-preview');
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        byId('camera-status').textContent = 'ถ่ายภาพไม่สำเร็จ กรุณาลองอีกครั้ง';
        return;
      }
      setPhoto(blob);
      byId('camera-status').textContent = 'เลือกรูปภาพเรียบร้อยแล้ว';
      stopCamera();
    },
    'image/jpeg',
    0.86,
  );
}
function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่'));
    reader.readAsDataURL(file);
  });
}
async function submitItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const photo = state.photo;
  if (photo && photo.size > 3 * 1024 * 1024) {
    byId('item-message').textContent = 'รูปภาพต้องมีขนาดไม่เกิน 3 MB';
    return;
  }
  if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
    byId('item-message').textContent = 'กรุณาเลือกรูปแบบ JPG, PNG หรือ WebP';
    return;
  }
  const payload = {
    type: state.reportType,
    reporterName: byId('item-reporter').value.trim(),
    itemName: byId('item-name').value.trim(),
    category: byId('item-category').value,
    color: byId('item-color').value.trim(),
    description: byId('item-description').value.trim(),
    contact: byId('item-contact').value.trim(),
    contactPublic: byId('item-contact-public').checked,
    rewardOffered: state.reportType === 'lost' && byId('item-reward-offered').checked,
    rewardAmount: byId('item-reward-offered').checked ? byId('item-reward-amount').value : '',
    location: byId('item-location').value,
    date: byId('item-date').value,
    eventTime: byId('item-time').value,
    expiryDays: Number(byId('item-expiry-days').value),
  };
  if (photo) {
    payload.imageFeatures = await analyzePhoto(photo);
    payload.photo = await fileAsDataUrl(photo);
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (!state.editingItemId) {
      const check = await api('/api/items/check', {
        method: 'POST',
        body: JSON.stringify({
          type: payload.type,
          itemName: payload.itemName,
          category: payload.category,
          color: payload.color,
          description: payload.description,
          location: payload.location,
          date: payload.date,
          imageFeatures: payload.imageFeatures,
        }),
      });
      if (check.duplicates.length) {
        const candidates = check.duplicates.map((item) => `• ${item.itemName} (${item.score}% คล้าย)`).join('\n');
        if (!window.confirm(`พบประกาศประเภทเดียวกันที่อาจซ้ำ:\n${candidates}\n\nต้องการลงประกาศต่อหรือไม่?`)) return;
      }
    }
    const result = state.editingItemId
      ? await api(`/api/items/${encodeURIComponent(state.editingItemId)}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
    byId('item-dialog').close();
    showToast(state.editingItemId ? 'แก้ไขประกาศแล้ว' : result.possibleMatchCount
      ? `ลงประกาศแล้ว พบรายการที่อาจตรงกัน ${result.possibleMatchCount} รายการ`
      : 'ลงประกาศแล้ว กำลังตรวจหารายการที่อาจตรงกัน');
    state.editingItemId = null;
    await loadItems();
    refreshNotificationCount();
  } catch (error) {
    byId('item-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function openItemContact(item) {
  state.contactMode = 'item';
  state.contactItemId = item.id;
  state.replyMessageId = null;
  byId('contact-title').textContent = 'ส่งข้อความถึงผู้แจ้ง';
  byId('contact-intro').textContent = `ส่งข้อความส่วนตัวเกี่ยวกับ “${item.itemName}”`;
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('contact-dialog').showModal();
}
function openStaffContact() {
  state.contactMode = 'staff';
  state.contactItemId = null;
  state.replyMessageId = null;
  byId('contact-title').textContent = 'ติดต่อเจ้าหน้าที่';
  byId('contact-intro').textContent = 'ส่งข้อความถึงเจ้าหน้าที่เพื่อขอความช่วยเหลือ';
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('contact-dialog').showModal();
}
function openReply(message) {
  state.contactMode = 'reply';
  state.replyMessageId = message.id;
  byId('contact-title').textContent = 'ตอบกลับข้อความเกี่ยวกับสิ่งของ';
  byId('contact-intro').textContent = `ตอบกลับ ${message.fromName} เกี่ยวกับ “${message.itemName}”`;
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('messages-dialog').close();
  byId('contact-dialog').showModal();
}
function openStaffReply(request) {
  state.contactMode = 'staffReply';
  state.staffRequestId = request.id;
  byId('contact-title').textContent = 'ตอบกลับคำขอความช่วยเหลือ';
  byId('contact-intro').textContent = `ตอบกลับ ${request.fromName}`;
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('messages-dialog').close();
  byId('contact-dialog').showModal();
}
async function submitContact(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const message = byId('contact-message').value.trim();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (state.contactMode === 'staff')
      await api('/api/contact', { method: 'POST', body: JSON.stringify({ message }) });
    else if (state.contactMode === 'staffReply')
      await api('/api/contact/reply', {
        method: 'POST',
        body: JSON.stringify({ requestId: state.staffRequestId, message }),
      });
    else if (state.contactMode === 'reply')
      await api('/api/messages/reply', {
        method: 'POST',
        body: JSON.stringify({ messageId: state.replyMessageId, message }),
      });
    else
      await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ itemId: state.contactItemId, message }),
      });
    byId('contact-dialog').close();
    showToast(
      state.contactMode === 'staff'
        ? 'ส่งข้อความถึงเจ้าหน้าที่แล้ว'
        : state.contactMode === 'staffReply'
          ? 'ส่งข้อความตอบกลับนักเรียนแล้ว'
          : 'ส่งข้อความแล้ว คุณจะเห็นข้อความตอบกลับในกล่องข้อความ',
    );
  } catch (error) {
    byId('contact-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function addMessageCard(container, message, own) {
  const card = document.createElement('article');
  card.className = 'message-card';
  const title = document.createElement('strong');
  title.textContent = own
    ? `คุณส่งข้อความถึง ${message.toName || 'ผู้แจ้ง'}`
    : `ข้อความจาก ${message.fromName}`;
  const item = document.createElement('span');
  item.textContent = message.itemName;
  const body = document.createElement('p');
  body.textContent = message.message;
  const date = document.createElement('small');
    date.textContent = formatPostedDate(message.createdAt);
  card.append(title, item, body, date);
  if (!own) {
    const reply = document.createElement('button');
    reply.className = 'button small';
    reply.type = 'button';
    reply.textContent = 'ตอบกลับ';
    reply.addEventListener('click', () => openReply(message));
    card.append(reply);
  }
  container.append(card);
}
async function openInbox() {
  const list = byId('message-list');
  list.replaceChildren();
  byId('messages-empty').classList.add('hidden');
  try {
    const result = await api('/api/messages');
    let count = 0;
    (result.commentNotifications || []).forEach((comment) => {
      const card = document.createElement('article');
      card.className = 'message-card comment-notice';
      const title = document.createElement('strong');
      title.textContent = `ความคิดเห็นในประกาศ “${comment.itemName}”`;
      const body = document.createElement('p');
      body.textContent = `${comment.fromName}: ${comment.text}`;
      const date = document.createElement('small');
      date.textContent = formatPostedDate(comment.createdAt);
      const open = document.createElement('button');
      open.className = 'button small';
      open.type = 'button';
      open.textContent = 'เปิดประกาศ / ตอบกลับ';
      open.addEventListener('click', () => {
        byId('messages-dialog').close();
        openItemDetails(comment.itemId, comment.id);
      });
      card.append(title, body, date, open);
      list.append(card);
      count++;
    });
    result.messages.forEach((message) => {
      addMessageCard(list, message, message.fromId === state.user.id);
      count++;
    });
    if (canManageSupport())
      result.staffMessages.forEach((request) => {
        const card = document.createElement('article');
        card.className = 'message-card staff-message';
        const title = document.createElement('strong');
        title.textContent = `คำขอความช่วยเหลือจาก ${request.fromName}`;
        const body = document.createElement('p');
        body.textContent = request.message;
        const date = document.createElement('small');
        date.textContent = formatPostedDate(request.createdAt);
        const reply = document.createElement('button');
        reply.className = 'button small';
        reply.type = 'button';
        reply.textContent = 'ตอบกลับ';
        reply.addEventListener('click', () => openStaffReply(request));
        card.append(title, body, date, reply);
        list.append(card);
        count++;
      });
    if (!canManageSupport())
      result.staffRequests.forEach((request) => {
        const card = document.createElement('article');
        card.className = 'message-card';
        const title = document.createElement('strong');
        title.textContent = 'ข้อความที่คุณส่งถึงเจ้าหน้าที่';
        const body = document.createElement('p');
        body.textContent = request.message;
        const date = document.createElement('small');
        date.textContent = formatPostedDate(request.createdAt);
        card.append(title, body, date);
        (request.replies || []).forEach((reply) => {
          const response = document.createElement('p');
          response.className = 'support-reply';
          response.textContent = `เจ้าหน้าที่ ${reply.fromName} ตอบกลับ: ${reply.message}`;
          card.append(response);
        });
        list.append(card);
        count++;
      });
    byId('messages-empty').classList.toggle('hidden', count > 0);
    byId('messages-dialog').showModal();
  } catch (error) {
    showToast(error.message);
  }
}
function updateAdminSetupVisibility() {
  const isAdminIdentity =
    byId('signup-name').value.trim().toLocaleLowerCase() === ADMIN_NAME.toLocaleLowerCase() &&
    byId('signup-id').value.trim().toLocaleUpperCase() === ADMIN_STUDENT_ID;
  const field = byId('admin-setup-field');
  const code = byId('admin-setup-code');
  field.classList.toggle('hidden', !isAdminIdentity);
  code.required = isAdminIdentity;
  if (!isAdminIdentity) code.value = '';
}
function renderAdminUsers(users) {
  const list = byId('admin-user-list');
  list.replaceChildren();
  if (!users.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'ยังไม่มีบัญชีสมาชิก';
    list.append(empty);
    return;
  }
  for (const user of users) {
    const row = document.createElement('article');
    row.className = 'admin-user-row';
    const details = document.createElement('div');
    details.className = 'admin-user-details';
    const name = document.createElement('strong');
    name.textContent = user.name;
    const meta = document.createElement('span');
    const roleName = ({ student: 'นักเรียน', staff: 'เจ้าหน้าที่', admin: 'ผู้ดูแลระบบ' })[user.role] || 'สมาชิก';
    meta.textContent = `${user.studentId} · ${roleName}`;
    details.append(name, meta);
    const protectedAccount = user.id === state.user.id || user.role === 'admin';
    const action = document.createElement('button');
    action.className = protectedAccount ? 'button small' : 'button small danger';
    action.type = 'button';
    action.textContent = protectedAccount ? 'บัญชีที่ป้องกันไว้' : 'ลบบัญชี';
    action.disabled = protectedAccount;
    if (!protectedAccount) action.addEventListener('click', () => deleteAdminUser(user));
    row.append(details, action);
    list.append(row);
  }
}
function renderAdminItemReports(reports) {
  const list = byId('admin-item-report-list');
  list.replaceChildren();
  if (!reports.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'ยังไม่มีรายงานประกาศ';
    list.append(empty);
    return;
  }
  for (const report of reports) {
    const row = document.createElement('article');
    row.className = 'admin-user-row';
    const details = document.createElement('div');
    details.className = 'admin-user-details';
    const title = document.createElement('strong');
    title.textContent = `${report.itemName} · ${({ inaccurate: 'ข้อมูลไม่ถูกต้อง', inappropriate: 'เนื้อหาไม่เหมาะสม', privacy: 'ข้อมูลส่วนตัว', other: 'อื่น ๆ' })[report.reason] || 'รายงาน'}`;
    const meta = document.createElement('span');
    meta.textContent = `${report.fromName} · ${report.details || 'ไม่มีรายละเอียดเพิ่ม'} · ${report.status === 'reviewed' ? 'ตรวจแล้ว' : 'รอตรวจ'}`;
    details.append(title, meta);
    row.append(details);
    if (report.status !== 'reviewed') {
      const done = document.createElement('button');
      done.className = 'button small';
      done.type = 'button';
      done.textContent = 'ทำเครื่องหมายว่าตรวจแล้ว';
      done.addEventListener('click', async () => {
        try {
          await api('/api/admin/item-reports/status', { method: 'POST', body: JSON.stringify({ reportId: report.id }) });
          await loadAdminData();
        } catch (error) { setMessage('admin-message', error.message); }
      });
      row.append(done);
    }
    list.append(row);
  }
}
function renderAdminReports(items) {
  const body = byId('admin-report-list');
  body.replaceChildren();
  byId('admin-report-count').textContent = `${items.length} รายการ`;
  if (!items.length) {
    const row = document.createElement('tr');
    const empty = document.createElement('td');
    empty.className = 'admin-table-empty';
    empty.colSpan = 7;
    empty.textContent = 'ยังไม่มีประกาศให้ติดตาม';
    row.append(empty);
    body.append(row);
    return;
  }
  const statuses = [
    ['open', 'เปิดรับแจ้ง'],
    ['reviewing', 'กำลังติดตาม'],
    ['resolved', 'ปิดงาน / คืนแล้ว'],
    ['expired', 'หมดอายุ'],
  ];
  for (const item of items) {
    const row = document.createElement('tr');
    const code = document.createElement('td');
    const codeText = document.createElement('strong');
    codeText.className = 'admin-table-id';
    codeText.textContent = `${item.type === 'lost' ? 'หาย' : 'พบ'}-${item.id.slice(0, 8).toUpperCase()}`;
    const type = document.createElement('small');
    type.textContent = item.type === 'lost' ? 'ของหาย' : 'เก็บได้';
    code.append(codeText, document.createElement('br'), type);
    const nameCell = document.createElement('td');
    const name = document.createElement('div');
    name.className = 'admin-table-item';
    const title = document.createElement('strong');
    title.textContent = item.itemName;
    const date = document.createElement('small');
    date.textContent = `ลงประกาศ ${formatPostedDate(item.createdAt)}`;
    name.append(title, date);
    nameCell.append(name);
    const location = document.createElement('td');
    location.textContent = locationLabel(item.location);
    const reporter = document.createElement('td');
    reporter.textContent = item.reporterName || item.ownerName || 'ไม่ระบุ';
    const statusCell = document.createElement('td');
    const status = document.createElement('select');
    status.setAttribute('aria-label', `สถานะงาน ${item.itemName}`);
    for (const [value, label] of statuses) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      status.append(option);
    }
    status.value = statuses.some(([value]) => value === item.status) ? item.status : 'open';
    statusCell.append(status);
    const assigneeCell = document.createElement('td');
    const assignee = document.createElement('input');
    assignee.value = item.assignedTo || '';
    assignee.maxLength = 80;
    assignee.placeholder = 'ชื่อผู้ดูแล';
    assignee.setAttribute('aria-label', `ผู้รับผิดชอบ ${item.itemName}`);
    assigneeCell.append(assignee);
    const actionCell = document.createElement('td');
    const save = document.createElement('button');
    save.className = 'button primary';
    save.type = 'button';
    save.textContent = 'บันทึก';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api('/api/admin/items/update', {
          method: 'POST',
          body: JSON.stringify({ itemId: item.id, status: status.value, assignedTo: assignee.value.trim() }),
        });
        showToast('บันทึกสถานะงานแล้ว');
        await loadAdminData();
      } catch (error) {
        setMessage('admin-report-message', error.message);
      } finally {
        save.disabled = false;
      }
    });
    actionCell.append(save);
    row.append(code, nameCell, location, reporter, statusCell, assigneeCell, actionCell);
    body.append(row);
  }
}
async function loadAdminData() {
  setMessage('admin-message', '');
  setMessage('admin-report-message', '');
  try {
    const [overview, accounts, reports, itemReports] = await Promise.all([
      api('/api/admin/overview'),
      api('/api/admin/users'),
      api('/api/items'),
      api('/api/admin/item-reports'),
    ]);
    byId('admin-lost-count').textContent = overview.lostCount;
    byId('admin-found-count').textContent = overview.foundCount;
    byId('admin-user-count').textContent = overview.userCount;
    byId('admin-support-count').textContent = overview.supportCount;
    renderAdminUsers(accounts.users);
    renderAdminReports(reports.items);
    renderAdminItemReports(itemReports.reports);
  } catch (error) {
    setMessage('admin-message', error.message);
  }
}
async function deleteAdminUser(user) {
  const confirmed = window.confirm(
    `ต้องการลบบัญชี ${user.name} ใช่หรือไม่? ระบบจะลบประกาศ รูปภาพ และข้อความที่เกี่ยวข้องด้วย`,
  );
  if (!confirmed) return;
  try {
    await api('/api/admin/users/delete', { method: 'POST', body: JSON.stringify({ userId: user.id }) });
    showToast('ลบบัญชีเรียบร้อยแล้ว');
    await loadAdminData();
    await loadItems();
  } catch (error) {
    setMessage('admin-message', error.message);
  }
}
function bindEvents() {
  byId('open-signup').addEventListener('click', () => setAuthView('signup-form'));
  byId('open-login').addEventListener('click', () => setAuthView('login-form'));
  byId('open-admin-login').addEventListener('click', openAdminLogin);
  byId('to-login').addEventListener('click', () => setAuthView('login-form'));
  byId('to-signup').addEventListener('click', () => setAuthView('signup-form'));
  byId('signup-form').addEventListener('submit', (event) => submitAuth(event, 'register'));
  byId('login-form').addEventListener('submit', (event) => submitAuth(event, 'login'));
  byId('signup-name').addEventListener('input', updateAdminSetupVisibility);
  byId('signup-id').addEventListener('input', updateAdminSetupVisibility);
  byId('admin-refresh').addEventListener('click', loadAdminData);
  byId('profile-form').addEventListener('submit', saveProfile);
  byId('close-profile').addEventListener('click', () => byId('profile-dialog').close());
  byId('cancel-profile').addEventListener('click', () => byId('profile-dialog').close());
  byId('open-my-claims').addEventListener('click', openMyClaims);
  byId('close-my-claims').addEventListener('click', () => byId('my-claims-dialog').close());
  byId('open-change-password').addEventListener('click', openChangePassword);
  byId('close-change-password').addEventListener('click', () => byId('change-password-dialog').close());
  byId('cancel-change-password').addEventListener('click', () => byId('change-password-dialog').close());
  byId('change-password-form').addEventListener('submit', submitPasswordChange);
  byId('close-detail').addEventListener('click', () => byId('detail-dialog').close());
  byId('close-return-qr').addEventListener('click', () => byId('return-qr-dialog').close());
  byId('cancel-return-confirm').addEventListener('click', () => {
    state.pendingReturnToken = null;
    state.returnToken = null;
    byId('return-confirm-dialog').close();
  });
  byId('confirm-return').addEventListener('click', confirmReturnedItem);
  byId('edit-item').addEventListener('click', () => {
    const item = state.items.find((entry) => entry.id === state.activeItemId);
    if (!item) return;
    byId('detail-dialog').close();
    editItem(item);
  });
  byId('claim-item').addEventListener('click', () => {
    byId('claim-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    byId('claim-proof').focus();
  });
  byId('claim-form').addEventListener('submit', submitClaim);
  byId('report-item').addEventListener('click', openItemReport);
  byId('item-report-form').addEventListener('submit', submitItemReport);
  byId('close-item-report').addEventListener('click', () => byId('item-report-dialog').close());
  byId('cancel-item-report').addEventListener('click', () => byId('item-report-dialog').close());
  byId('comment-form').addEventListener('submit', submitComment);
  byId('cancel-comment-reply').addEventListener('click', () => {
    state.replyToCommentId = null;
    byId('comment-replying').classList.add('hidden');
    byId('cancel-comment-reply').hidden = true;
  });
  byId('admin-open-inbox').addEventListener('click', openInbox);
  updateAdminSetupVisibility();
  byId('report-lost').addEventListener('click', () => openReport('lost'));
  byId('report-found').addEventListener('click', () => openReport('found'));
  byId('item-form').addEventListener('submit', submitItem);
  byId('item-reward-offered').addEventListener('change', (event) => {
    byId('reward-amount-field').hidden = !event.currentTarget.checked || state.reportType !== 'lost';
    byId('item-reward-amount').disabled = !event.currentTarget.checked || state.reportType !== 'lost';
  });
  byId('close-dialog').addEventListener('click', () => byId('item-dialog').close());
  byId('cancel-report').addEventListener('click', () => byId('item-dialog').close());
  byId('item-dialog').addEventListener('close', clearPhoto);
  byId('camera-open').addEventListener('click', startCamera);
  byId('camera-capture').addEventListener('click', capturePhoto);
  byId('camera-stop').addEventListener('click', stopCamera);
  byId('photo-pick').addEventListener('click', () => byId('photo-file').click());
  byId('photo-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setPhoto(file);
    byId('camera-status').textContent = 'เลือกรูปภาพเรียบร้อยแล้ว';
  });
  byId('search-input').addEventListener('input', renderItems);
  byId('image-search-button').addEventListener('click', () => byId('image-search-file').click());
  byId('image-search-file').addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) searchByImage(file);
  });
  byId('clear-image-search').addEventListener('click', clearImageSearch);
  byId('save-search-button').addEventListener('click', saveCurrentSearch);
  byId('manage-saved-searches').addEventListener('click', openSavedSearches);
  byId('category-filter').addEventListener('change', renderItems);
  byId('location-filter').addEventListener('change', renderItems);
  byId('date-filter').addEventListener('change', renderItems);
  byId('my-items-filter').addEventListener('click', (event) => {
    state.showingMyItems = !state.showingMyItems;
    event.currentTarget.setAttribute('aria-pressed', String(state.showingMyItems));
    event.currentTarget.classList.toggle('primary', state.showingMyItems);
    renderItems();
  });
  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((other) => {
        other.classList.remove('active');
        other.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      state.activeFilter = tab.dataset.filter;
      renderItems();
    }),
  );
  byId('contact-staff').addEventListener('click', openStaffContact);
  byId('contact-form').addEventListener('submit', submitContact);
  byId('close-contact').addEventListener('click', () => byId('contact-dialog').close());
  byId('cancel-contact').addEventListener('click', () => byId('contact-dialog').close());
  byId('close-messages').addEventListener('click', () => byId('messages-dialog').close());
  byId('close-notifications').addEventListener('click', () => byId('notifications-dialog').close());
  byId('load-more-notifications').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadNotificationPage(state.notificationOffset, true);
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  byId('close-saved-searches').addEventListener('click', () => byId('saved-searches-dialog').close());
  byId('close-help').addEventListener('click', () => byId('help-dialog').close());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshNotificationCount();
  });
  window.addEventListener('pagehide', stopCamera);
}
bindEvents();
start();


