'use strict';
const byId = (id) => document.getElementById(id);
const state = {
  user: null,
  reportType: 'lost',
  activeFilter: 'all',
  items: [],
  photo: null,
  previewUrl: null,
  cameraStream: null,
  contactMode: 'staff',
  contactItemId: null,
  replyMessageId: null,
};
const ADMIN_NAME = 'AdminRK';
const ADMIN_STUDENT_ID = 'T36699';
async function api(path, options = {}) {
  // This Vercel project exposes Node functions with their .js filenames.
  // Keep callers readable while targeting the deployed function URLs directly.
  const endpoint = path.startsWith('/api/') && !path.endsWith('.js') ? `${path}.js` : path;
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
  inbox.textContent = canManageSupport() ? 'กล่องข้อความเจ้าหน้าที่' : 'ข้อความ';
  inbox.addEventListener('click', openInbox);
  nav.append(board, inbox);
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
function makeItemCard(item) {
  const article = document.createElement('article');
  article.className = 'item-card';
  article.dataset.type = item.type;
  article.dataset.category = item.category;
  article.dataset.location = item.location;
  const art = document.createElement('div');
  art.className = 'item-art';
  art.textContent = categoryIcon(item.category);
  if (item.photo) {
    art.textContent = '';
    const image = document.createElement('img');
    image.src = item.photo;
    image.alt = item.itemName;
    image.loading = 'lazy';
    art.append(image);
  }
  const badge = document.createElement('span');
  badge.className = `badge ${item.type}`;
  badge.textContent = item.type === 'lost' ? 'Lost' : 'Found';
  art.append(badge);
  const body = document.createElement('div');
  body.className = 'item-content';
  const title = document.createElement('h3');
  title.textContent = item.itemName;
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.textContent = `${item.category} · ${item.location}`;
  const desc = document.createElement('p');
  desc.className = 'item-description';
  desc.textContent =
    item.description || `${item.color || 'ไม่ระบุสี'}`;
  const reporter = document.createElement('p');
  reporter.className = 'item-reporter';
  reporter.textContent = `👤 ผู้แจ้ง: ${item.reporterName || item.ownerName || 'ไม่ระบุชื่อ'}`;
  const contactMethod = document.createElement('p');
  contactMethod.className = 'item-contact-method';
  contactMethod.textContent = item.contact ? 'Contact: ' + item.contact : '';
  const bottom = document.createElement('div');
  bottom.className = 'item-bottom';
  const date = document.createElement('span');
  date.className = 'item-date';
  const eventDate = document.createElement('span');
  eventDate.textContent = `${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  const postedDate = document.createElement('small');
  postedDate.textContent = `ลงประกาศ ${formatPostedDate(item.createdAt)}`;
  date.append(eventDate, postedDate);
  const contact = document.createElement('button');
  contact.className = 'item-contact';
  contact.type = 'button';
  if (item.ownerId === state.user.id) {
    contact.textContent = 'Your report';
    contact.disabled = true;
  } else {
    contact.textContent = 'Contact poster →';
    contact.addEventListener('click', () => openItemContact(item));
  }
  bottom.append(date, contact);
  body.append(title, meta, desc, reporter);
  if (item.contact) body.append(contactMethod);
  if (item.possibleMatches?.length) {
    const match = document.createElement('span');
    match.className = 'match-pill';
    match.textContent = `${item.possibleMatches[0].score}% possible match`;
    body.append(match);
  }
  body.append(bottom);
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
  if (photo) payload.photo = await fileAsDataUrl(photo);
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


