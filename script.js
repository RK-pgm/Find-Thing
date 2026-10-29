'use strict';
const byId = (id) => document.getElementById(id);
const state = {
  user: null,
  reportType: 'lost',
  activeFilter: 'all',
  items: [],
  favoriteIds: [],
  photo: null,
  previewUrl: null,
  cameraStream: null,
  contactMode: 'staff',
  contactItemId: null,
  replyMessageId: null,
  activeItemId: null,
  replyToCommentId: null,
};
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
  const response = await fetch(endpoint, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
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
    signup.textContent = 'Create account';
    signup.addEventListener('click', () => setAuthView('signup-form'));
    const login = document.createElement('button');
    login.className = 'button primary';
    login.textContent = 'Log in';
    login.addEventListener('click', () => setAuthView('login-form'));
    nav.append(signup, login);
    return;
  }
  const board = document.createElement('button');
  board.className = 'button';
  board.type = 'button';
    board.textContent = 'หน้าประกาศ';
  board.addEventListener('click', showBoard);
  const inbox = document.createElement('button');
  inbox.className = 'button';
  inbox.textContent = canManageSupport() ? 'กล่องข้อความเจ้าหน้าที่' : 'กล่องข้อความ';
  inbox.addEventListener('click', openInbox);
  const profile = document.createElement('button');
  profile.className = 'button';
  profile.type = 'button';
  profile.textContent = 'โปรไฟล์';
  profile.addEventListener('click', openProfile);
  nav.append(board, inbox, profile);
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
  if (user.role === 'admin') openAdminPanel();
  else loadItems();
}
function exitApp() {
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
      Clothing: '🧥',
      'Personal items': '🎒',
      Electronics: '🎧',
      Other: '🔎',
    }[category] || '🔎'
  );
}
function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
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
  return `${item.type === 'lost' ? 'LF' : 'FD'}-${year}-${sequence}`;
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
  caption.textContent = `${candidate.type === 'lost' ? 'ของหาย' : 'เก็บได้'} · ${candidate.category} · ${candidate.location || 'ไม่ระบุสถานที่'}`;
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
  text.textContent = 'AI ยังไม่มีข้อมูลที่ใกล้เคียง';
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
  const code = document.createElement('span');
  code.className = 'item-code';
  code.textContent = reportCode(item);
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
  categoryLabel.textContent = item.category;
  meta.append(categoryIconNode, categoryLabel);
  const title = document.createElement('h3');
  title.textContent = item.itemName;
  const desc = document.createElement('p');
  desc.className = 'item-description';
  desc.textContent = item.description || `สี / ลักษณะ ${item.color || 'ไม่ได้ระบุ'}`;
  const info = document.createElement('div');
  info.className = 'item-card-info';
  const location = document.createElement('span');
  location.textContent = `📍 ${item.location || 'ไม่ระบุสถานที่'}`;
  const eventDate = document.createElement('span');
  eventDate.textContent = `📅 ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  const posted = document.createElement('span');
  posted.textContent = `◷ ลงประกาศ ${formatPostedDate(item.createdAt)}`;
  info.append(location, eventDate, posted);
  const footer = document.createElement('div');
  footer.className = 'item-card-footer';
  const reporter = document.createElement('span');
  reporter.className = 'item-reporter-chip';
  reporter.textContent = `👤 ${item.reporterName || item.ownerName || 'ไม่ระบุชื่อ'}`;
  const actions = document.createElement('div');
  actions.className = 'item-card-actions';
  if (item.ownerId !== state.user.id) {
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
  byId('detail-meta').textContent = `${item.category} · ${item.location} · ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  byId('detail-description').textContent = item.description || `สี / ลักษณะ: ${item.color || 'ไม่ได้ระบุ'}`;
  const deleteButton = byId('delete-item');
  const canDelete = state.user && (state.user.role === 'admin' || item.ownerId === state.user.id);
  deleteButton.classList.toggle('hidden', !canDelete);
  deleteButton.onclick = () => deleteItem(item);
  const photo = byId('detail-photo');
  photo.classList.toggle('hidden', !item.photo);
  if (item.photo) photo.src = item.photo;
  const facts = byId('detail-facts');
  facts.replaceChildren();
  const rows = [
    ['ผู้แจ้ง', item.reporterName || item.ownerName || 'ไม่ระบุ'],
    ['ลงประกาศ', formatPostedDate(item.createdAt)],
  ];
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
  byId('detail-dialog').showModal();
  await loadItemComments(item.id);
  if (replyToId) setCommentReply(replyToId);
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
    const reply = document.createElement('button');
    reply.className = 'text-button comment-reply-button';
    reply.type = 'button';
    reply.textContent = 'ตอบกลับ';
    reply.addEventListener('click', () => setCommentReply(comment.id));
    card.append(head, text, reply);
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
  byId('profile-status').textContent = '';
  byId('profile-dialog').showModal();
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
  const items = state.items.filter(
    (item) =>
      (state.activeFilter === 'all' || item.type === state.activeFilter) &&
      (!category || item.category === category) &&
      (!location || item.location === location) &&
      (!query ||
        `${item.itemName} ${item.category} ${item.color} ${item.location} ${item.description}`
          .toLocaleLowerCase()
          .includes(query)),
  );
  items.forEach((item) => list.append(makeItemCard(item)));
  byId('empty-state').classList.toggle('hidden', items.length > 0);
}
function updateStats() {
  byId('lost-count').textContent = state.items.filter((x) => x.type === 'lost').length;
  byId('found-count').textContent = state.items.filter((x) => x.type === 'found').length;
  byId('match-count').textContent = state.items.filter((x) => x.possibleMatches?.length).length;
  const tabCounts = {
    all: state.items.length,
    lost: state.items.filter((x) => x.type === 'lost').length,
    found: state.items.filter((x) => x.type === 'found').length,
  };
  for (const [filter, count] of Object.entries(tabCounts)) {
    const node = document.querySelector(`[data-filter="${filter}"] .tab-count`);
    if (node) node.textContent = count;
  }
}
function openReport(type) {
  state.reportType = type;
  state.photo = null;
  byId('item-form').reset();
  byId('item-message').textContent = '';
  byId('dialog-kind').textContent = type === 'lost' ? 'LOST ITEM' : 'FOUND ITEM';
  byId('dialog-title').textContent = type === 'lost' ? 'Report a lost item' : 'Report a found item';
  byId('item-date-label').textContent = type === 'lost' ? 'วันที่หาย' : 'วันที่พบ';
  const today = new Date();
  byId('item-date').value = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  byId('item-date').max = byId('item-date').value;
  clearPhoto();
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
  byId('camera-status').textContent = 'Avoid including faces or personal information in the photo.';
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
    byId('camera-status').textContent = 'Live camera is unavailable here. Choose a photo instead.';
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
    byId('camera-status').textContent = 'Place the item in view, then take a photo.';
  } catch {
    byId('camera-status').textContent =
      'Camera access was denied or unavailable. Choose a photo instead.';
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
        byId('camera-status').textContent = 'Could not capture this photo. Please try again.';
        return;
      }
      setPhoto(blob);
      byId('camera-status').textContent = 'Photo ready to attach.';
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
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}
async function submitItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const photo = state.photo;
  if (photo && photo.size > 3 * 1024 * 1024) {
    byId('item-message').textContent = 'Photo must be 3 MB or smaller.';
    return;
  }
  if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
    byId('item-message').textContent = 'Choose a JPG, PNG, or WebP photo.';
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
    location: byId('item-location').value,
    date: byId('item-date').value,
  };
  if (photo) {
    payload.imageFeatures = await analyzePhoto(photo);
    payload.photo = await fileAsDataUrl(photo);
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
    byId('item-dialog').close();
    showToast('Item posted. Checking for possible matches…');
    await loadItems();
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
  byId('contact-title').textContent = 'Contact the item poster';
  byId('contact-intro').textContent = `Send a private message about “${item.itemName}”.`;
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('contact-dialog').showModal();
}
function openStaffContact() {
  state.contactMode = 'staff';
  state.contactItemId = null;
  state.replyMessageId = null;
  byId('contact-title').textContent = 'Contact school staff';
  byId('contact-intro').textContent = 'Send a message to the school lost and found team.';
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('contact-dialog').showModal();
}
function openReply(message) {
  state.contactMode = 'reply';
  state.replyMessageId = message.id;
  byId('contact-title').textContent = 'Reply about this item';
  byId('contact-intro').textContent = `Reply to ${message.fromName} about “${message.itemName}”.`;
  byId('contact-message').value = '';
  byId('contact-status').textContent = '';
  byId('messages-dialog').close();
  byId('contact-dialog').showModal();
}
function openStaffReply(request) {
  state.contactMode = 'staffReply';
  state.staffRequestId = request.id;
  byId('contact-title').textContent = 'Reply to school support request';
  byId('contact-intro').textContent = 'Reply to ' + request.fromName + '.';
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
        ? 'Message sent to the school support queue.'
        : state.contactMode === 'staffReply'
          ? 'Reply sent to the student.'
          : 'Message sent. Replies will appear in Messages.',
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
    ? `You sent a message to ${message.toName || 'the item poster'}`
    : `From ${message.fromName}`;
  const item = document.createElement('span');
  item.textContent = message.itemName;
  const body = document.createElement('p');
  body.textContent = message.message;
  const date = document.createElement('small');
  date.textContent = new Date(message.createdAt).toLocaleString();
  card.append(title, item, body, date);
  if (!own) {
    const reply = document.createElement('button');
    reply.className = 'button small';
    reply.type = 'button';
    reply.textContent = 'Reply';
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
        title.textContent = `School support request · ${request.fromName}`;
        const body = document.createElement('p');
        body.textContent = request.message;
        const date = document.createElement('small');
        date.textContent = new Date(request.createdAt).toLocaleString();
        const reply = document.createElement('button');
        reply.className = 'button small';
        reply.type = 'button';
        reply.textContent = 'Reply';
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
        title.textContent = 'Your message to school support';
        const body = document.createElement('p');
        body.textContent = request.message;
        const date = document.createElement('small');
        date.textContent = new Date(request.createdAt).toLocaleString();
        card.append(title, body, date);
        (request.replies || []).forEach((reply) => {
          const response = document.createElement('p');
          response.className = 'support-reply';
          response.textContent = `Reply from ${reply.fromName}: ${reply.message}`;
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
    empty.textContent = 'No accounts yet.';
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
    meta.textContent = `${user.studentId} · ${user.role}`;
    details.append(name, meta);
    const protectedAccount = user.id === state.user.id || user.role === 'admin';
    const action = document.createElement('button');
    action.className = protectedAccount ? 'button small' : 'button small danger';
    action.type = 'button';
    action.textContent = protectedAccount ? 'Protected' : 'Delete account';
    action.disabled = protectedAccount;
    if (!protectedAccount) action.addEventListener('click', () => deleteAdminUser(user));
    row.append(details, action);
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
  ];
  for (const item of items) {
    const row = document.createElement('tr');
    const code = document.createElement('td');
    const codeText = document.createElement('strong');
    codeText.className = 'admin-table-id';
    codeText.textContent = `${item.type === 'lost' ? 'LF' : 'FF'}-${item.id.slice(0, 8).toUpperCase()}`;
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
    location.textContent = item.location || '—';
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
    const [overview, accounts, reports] = await Promise.all([
      api('/api/admin/overview'),
      api('/api/admin/users'),
      api('/api/items'),
    ]);
    byId('admin-lost-count').textContent = overview.lostCount;
    byId('admin-found-count').textContent = overview.foundCount;
    byId('admin-user-count').textContent = overview.userCount;
    byId('admin-support-count').textContent = overview.supportCount;
    renderAdminUsers(accounts.users);
    renderAdminReports(reports.items);
  } catch (error) {
    setMessage('admin-message', error.message);
  }
}
async function deleteAdminUser(user) {
  const confirmed = window.confirm(
    `Delete ${user.name}'s account? This also removes their reports, photos, and messages.`,
  );
  if (!confirmed) return;
  try {
    await api('/api/admin/users/delete', { method: 'POST', body: JSON.stringify({ userId: user.id }) });
    showToast('Account deleted.');
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
  byId('close-detail').addEventListener('click', () => byId('detail-dialog').close());
  byId('delete-item').addEventListener('click', () => {
    const item = state.items.find((entry) => entry.id === state.activeItemId);
    if (item) deleteItem(item);
  });
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
    byId('camera-status').textContent = 'Photo selected and ready to attach.';
  });
  byId('search-input').addEventListener('input', renderItems);
  byId('category-filter').addEventListener('change', renderItems);
  byId('location-filter').addEventListener('change', renderItems);
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
  window.addEventListener('pagehide', stopCamera);
}
bindEvents();
start();


