'use strict';
const byId = (id) => document.getElementById(id);
const FALLBACK_SCHOOLS = [
  { id: 'thung-song', name: 'โรงเรียนทุ่งสง', province: 'นครศรีธรรมราช', latitude: 8.1638565, longitude: 99.7190381, mapDescription: 'ตำบลถ้ำใหญ่ อำเภอทุ่งสง จังหวัดนครศรีธรรมราช', mapImage: '/thung-song-campus-map.png', mapPlaces: [
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
  ] },
  { id: 'hamster-hub', name: 'โรงเรียน Hamster Hub', province: 'นครศรีธรรมราช', latitude: 8.1745, longitude: 99.6955, mapDescription: 'ตำแหน่งจำลองในอำเภอทุ่งสง', fictional: true, mapImage: '/hamster-hub-campus-map.svg', mapPlaces: [
    { id: 'classroom-a', name: 'อาคารเรียน A', legacyLocation: 'Classroom', x: 20, y: 28, points: '62,62 193,62 193,170 62,170' },
    { id: 'classroom-b', name: 'อาคารเรียน B', legacyLocation: 'Classroom', x: 42, y: 28, points: '208,62 339,62 339,170 208,170' },
    { id: 'library', name: 'ห้องสมุด', legacyLocation: 'Library', x: 19, y: 62, points: '62,207 193,207 193,293 62,293' },
    { id: 'cafeteria', name: 'โรงอาหาร', legacyLocation: 'Cafeteria', x: 43, y: 62, points: '208,207 350,207 350,293 208,293' },
    { id: 'football-field', name: 'สนามฟุตบอล', legacyLocation: 'Sports area', x: 74, y: 30, points: '390,62 586,62 586,188 390,188' },
    { id: 'sports-court', name: 'สนามกีฬาในร่ม', legacyLocation: 'Sports area', x: 76, y: 65, points: '402,207 586,207 586,355 402,355' },
    { id: 'main-gate', name: 'ประตูทางเข้า', legacyLocation: 'Other', x: 94, y: 51, points: '610,197 658,197 658,286 610,286' },
  ] },
];
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
  schools: FALLBACK_SCHOOLS,
  favoriteIds: [],
  photoEntries: [],
  cameraStream: null,
  notificationTimer: null,
  unreadNotifications: 0,
  notificationOffset: 0,
  contactMode: 'staff',
  contactItemId: null,
  replyMessageId: null,
  activeItemId: null,
  replyToCommentId: null,
  mapPlaceFilterId: '',
  mapDialogMode: 'search',
  mapSchoolId: '',
  selectedMapPlaceId: '',
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
function setNavButton(button, role, label, iconName) {
  const paths = {
    board: ['M5 4.5h14v15H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
    help: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z', 'M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1.2 1.2-1.8 1.3-1.8 2.8', 'M12 16.5h.01'],
    inbox: ['M4 5.5h16v13H4z', 'm4.5 7 7.5 6 7.5-6', 'M4.5 14h4l1.5 2h4l1.5-2h4'],
    notifications: ['M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 16 18 16 18 9Z', 'M10 21h4'],
    profile: ['M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M5 20a7 7 0 0 1 14 0'],
    logout: ['M10 4.5H5.5v15H10', 'm14 8 4 4-4 4', 'M18 12H9'],
    admin: ['M12 3 20 6v5.5c0 5.1-3.4 8.2-8 9.5-4.6-1.3-8-4.4-8-9.5V6l8-3Z', 'm8.7 12 2.2 2.2 4.6-4.7'],
    signup: ['M12 5v14', 'M5 12h14'],
    login: ['M13 5h5.5v14H13', 'm10 8-4 4 4 4', 'M6 12h11'],
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'nav-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const pathData of paths[iconName] || []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  }
  const text = document.createElement('span');
  text.className = 'nav-label';
  text.textContent = label;
  button.className = `button nav-action nav-${role}`;
  button.type = 'button';
  button.replaceChildren(svg, text);
  return button;
}
function renderNav() {
  const nav = byId('nav');
  nav.replaceChildren();
  if (!state.user) {
    const signup = document.createElement('button');
    setNavButton(signup, 'signup', 'สมัครสมาชิก', 'signup');
    signup.addEventListener('click', () => setAuthView('signup-form'));
    const login = document.createElement('button');
    setNavButton(login, 'login', 'เข้าสู่ระบบ', 'login');
    login.addEventListener('click', () => setAuthView('login-form'));
    const help = document.createElement('button');
    setNavButton(help, 'help', 'วิธีใช้งาน', 'help');
    help.addEventListener('click', openHelp);
    nav.append(signup, login, help);
    return;
  }
  const board = document.createElement('button');
  setNavButton(board, 'board', 'หน้าประกาศ', 'board');
  board.setAttribute('aria-current', 'page');
  board.addEventListener('click', showBoard);
  const help = document.createElement('button');
  setNavButton(help, 'help', 'วิธีใช้งาน', 'help');
  help.addEventListener('click', openHelp);
  const inbox = document.createElement('button');
  setNavButton(inbox, 'inbox', canManageSupport() ? 'ข้อความเจ้าหน้าที่' : 'ข้อความ', 'inbox');
  inbox.addEventListener('click', openInbox);
  const notifications = document.createElement('button');
  notifications.id = 'notifications-button';
  setNavButton(notifications, 'notifications', 'แจ้งเตือน', 'notifications');
  notifications.addEventListener('click', openNotifications);
  updateNotificationButton(notifications);
  const profile = document.createElement('button');
  setNavButton(profile, 'profile', 'โปรไฟล์', 'profile');
  profile.addEventListener('click', openProfile);
  const messageTools = document.createElement('div');
  messageTools.className = 'nav-tool-group';
  messageTools.setAttribute('role', 'group');
  messageTools.setAttribute('aria-label', 'ข้อความและการแจ้งเตือน');
  messageTools.append(inbox, notifications);
  nav.append(board, messageTools, help);
  if (state.user.role === 'admin') {
    const adminPanel = document.createElement('button');
    setNavButton(adminPanel, 'admin', 'แผงควบคุม', 'admin');
    adminPanel.addEventListener('click', openAdminPanel);
    nav.append(adminPanel);
  }
  nav.append(profile);
  const logout = document.createElement('button');
  setNavButton(logout, 'logout', 'ออกจากระบบ', 'logout');
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
  byId('nav')?.querySelector('.nav-admin')?.removeAttribute('aria-current');
  byId('nav')?.querySelector('.nav-board')?.setAttribute('aria-current', 'page');
}
async function openAdminPanel() {
  if (state.user?.role !== 'admin') return;
  byId('app').classList.add('admin-mode');
  byId('admin-panel').classList.remove('hidden');
  byId('nav')?.querySelector('.nav-board')?.removeAttribute('aria-current');
  byId('nav')?.querySelector('.nav-admin')?.setAttribute('aria-current', 'page');
  await loadAdminData();
}
function enterApp(user) {
  state.user = user;
  loadSchools();
  try {
    state.favoriteIds = JSON.parse(localStorage.getItem(`found-it:favorites:${user.id}`) || '[]');
  } catch {
    state.favoriteIds = [];
  }
  byId('auth-screen').classList.add('hidden');
  byId('app').classList.remove('hidden');
  showBoard();
  renderNav();
  renderCommunityLabel();
  refreshNotificationCount();
  clearInterval(state.notificationTimer);
  state.notificationTimer = setInterval(refreshNotificationCount, 60000);
  if (user.role === 'admin') openAdminPanel();
  else loadItems();
  if (state.pendingReturnToken) prepareReturnConfirmation();
}
function renderCommunityLabel() {
  const label = byId('community-label');
  if (!label) return;
  label.replaceChildren();
  const dot = document.createElement('i');
  const selectedSchool = state.schools.find((school) => school.id === state.user?.schoolId);
  label.append(dot, document.createTextNode(selectedSchool
    ? ` ชุมชน ${selectedSchool.name} · ${selectedSchool.province}`
    : ' กระดานสาธารณะ · เลือกโรงเรียนในโปรไฟล์ได้ทุกเมื่อ'));
}
function renderProfileSchoolMap() {
  const schoolId = byId('profile-school')?.value || '';
  const school = state.schools.find((entry) => entry.id === schoolId);
  const empty = byId('profile-school-map-empty');
  const content = byId('profile-school-map-content');
  if (!empty || !content) return;
  empty.classList.toggle('hidden', Boolean(school));
  content.classList.toggle('hidden', !school);
  if (!school) return;
  const latitude = Number(school.latitude);
  const longitude = Number(school.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  byId('profile-school-map-name').textContent = school.name;
  byId('profile-school-map-description').textContent = `${school.mapDescription || school.province}${school.fictional ? ' · โรงเรียนสมมุติ' : ''}`;
  const pad = 0.008;
  const bbox = [longitude - pad, latitude - pad, longitude + pad, latitude + pad].join(',');
  byId('profile-school-map-frame').src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  const mapLink = byId('profile-school-map-link');
  mapLink.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  mapLink.textContent = school.fictional ? 'เปิดแผนที่ตำแหน่งจำลอง ↗' : 'เปิดแผนที่ขนาดใหญ่ ↗';
}
async function loadSchools() {
  try {
    const result = await api('/api/schools');
    state.schools = result.schools || [];
    const profileSchool = byId('profile-school');
    const selectedId = state.user?.schoolId || state.schools.find((school) => school.name === state.user?.school)?.id || '';
    profileSchool.replaceChildren(new Option('ยังไม่เลือก · เลือกภายหลังได้', ''));
    state.schools.forEach((school) => profileSchool.add(new Option(`${school.name} · ${school.province}${school.fictional ? ' · สมมุติ' : ''}`, school.id)));
    profileSchool.value = selectedId;
    renderCommunityLabel();
    renderProfileSchoolMap();
    renderLocationFilterOptions();
  } catch {
    // Keep the local school list and map previews usable if the directory request is temporarily unavailable.
    const profileSchool = byId('profile-school');
    const selectedId = state.user?.schoolId || state.schools.find((school) => school.name === state.user?.school)?.id || '';
    profileSchool.replaceChildren(new Option('ยังไม่เลือก · เลือกภายหลังได้', ''));
    state.schools.forEach((school) => profileSchool.add(new Option(`${school.name} · ${school.province}${school.fictional ? ' · สมมุติ' : ''}`, school.id)));
    profileSchool.value = selectedId;
    renderCommunityLabel();
    renderProfileSchoolMap();
    renderLocationFilterOptions();
  }
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
function itemLocationLabel(item) { return item.placeName || locationLabel(item.location); }
function placesForSchool(schoolId) { return state.schools.find((school) => school.id === schoolId)?.mapPlaces || []; }
function findMapPlace(placeId, schoolId = state.user?.schoolId) { return placesForSchool(schoolId).find((place) => place.id === placeId); }
function renderLocationFilterOptions() {
  const filter = byId('location-filter');
  const previous = filter.value;
  const places = placesForSchool(state.user?.schoolId);
  filter.replaceChildren(new Option('ทุกสถานที่', ''));
  if (places.length) {
    const group = document.createElement('optgroup');
    group.label = 'ตามบริเวณในผังโรงเรียน';
    places.forEach((place) => group.append(new Option(place.name, `place:${place.id}`)));
    filter.append(group);
  }
  const legacyGroup = document.createElement('optgroup');
  legacyGroup.label = places.length ? 'หมวดสถานที่เดิม' : 'สถานที่';
  [
    ['Classroom', 'ห้องเรียน'],
    ['Library', 'ห้องสมุด'],
    ['Cafeteria', 'โรงอาหาร'],
    ['Sports area', 'สนามกีฬา'],
    ['Other', 'อื่น ๆ'],
  ].forEach(([value, label]) => legacyGroup.append(new Option(label, value)));
  filter.append(legacyGroup);
  if ([...filter.options].some((option) => option.value === previous)) filter.value = previous;
  else filter.value = '';
}
function handleLocationFilterChange() {
  const value = byId('location-filter').value;
  state.mapPlaceFilterId = value.startsWith('place:') ? value.slice(6) : '';
  if (state.mapPlaceFilterId) {
    const place = findMapPlace(state.mapPlaceFilterId);
    byId('map-location-status-text').textContent = `กำลังค้นหา: ${place?.name || 'บริเวณที่เลือก'} · ประกาศเดิมที่ระบุเพียงหมวดสถานที่อาจแสดงร่วมด้วย`;
    byId('map-location-status').classList.remove('hidden');
  } else {
    byId('map-location-status').classList.add('hidden');
  }
  renderItems();
}
function renderCampusMap() {
  const school = state.schools.find((entry) => entry.id === state.mapSchoolId);
  const places = school?.mapPlaces || [];
  const available = Boolean(school?.mapImage && places.length);
  const empty = byId('campus-map-empty');
  empty.classList.toggle('hidden', available);
  byId('campus-map-content').classList.toggle('hidden', !available);
  byId('map-no-school-actions').classList.toggle('hidden', Boolean(school));
  byId('map-school-caption').textContent = school ? `${school.name} · ${school.fictional ? 'แผนผังจำลอง' : 'เลือกจุดจากผังโรงเรียน'}` : '';
  if (!available) {
    empty.textContent = school ? 'ยังไม่มีแผนผังสำหรับโรงเรียนนี้ ใช้ตัวกรองสถานที่เดิมได้' : 'เลือกโรงเรียนในโปรไฟล์ก่อน เพื่อค้นหาจุดในโรงเรียน';
    byId('apply-map-search').disabled = true;
    return;
  }
  byId('apply-map-search').disabled = false;
  byId('campus-map-image').src = school.mapImage;
  byId('campus-map-image').alt = `แผนผังสถานที่ ${school.name}`;
  const overlay = byId('campus-map-overlay');
  overlay.replaceChildren();
  const options = byId('map-place-options');
  options.replaceChildren();
  for (const place of places) {
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    area.setAttribute('points', place.points);
    area.dataset.placeId = place.id;
    area.setAttribute('tabindex', '0');
    area.setAttribute('role', 'button');
    area.setAttribute('aria-label', `เลือก${place.name}`);
    area.setAttribute('aria-pressed', String(state.selectedMapPlaceId === place.id));
    area.classList.toggle('selected', state.selectedMapPlaceId === place.id);
    overlay.append(area);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button map-place-option';
    button.dataset.placeId = place.id;
    button.setAttribute('aria-pressed', String(state.selectedMapPlaceId === place.id));
    button.textContent = place.name;
    button.addEventListener('click', () => chooseCampusPlace(place.id));
    options.append(button);
  }
  const selected = places.find((place) => place.id === state.selectedMapPlaceId);
  byId('campus-map-selected').textContent = selected ? `เลือกแล้ว: ${selected.name}` : 'แตะบริเวณบนแผนที่หรือเลือกชื่อด้านล่าง';
  byId('map-search-type').classList.toggle('hidden', state.mapDialogMode !== 'search');
  document.querySelector('.map-search-type-label').classList.toggle('hidden', state.mapDialogMode !== 'search');
  byId('map-search-title').textContent = state.mapDialogMode === 'post' ? 'เลือกจุดที่พบหรือหาย' : 'เลือกบริเวณบนแผนผัง';
  byId('map-search-eyebrow').textContent = state.mapDialogMode === 'post' ? 'ตำแหน่งในประกาศ' : 'ค้นหาตามจุดในโรงเรียน';
  byId('map-search-instructions').textContent = state.mapDialogMode === 'post'
    ? 'แตะอาคารหรือบริเวณที่พบ/ทำของหาย ตำแหน่งนี้จะติดไปกับประกาศ'
    : 'แตะอาคารหรือบริเวณบนผัง แล้วค้นหาประกาศของหายหรือของที่พบตรงจุดนั้น';
  byId('apply-map-search').textContent = state.mapDialogMode === 'post' ? 'ใช้จุดนี้กับประกาศ' : 'ค้นหาจุดนี้';
  byId('map-search-error').textContent = '';
}
function chooseCampusPlace(placeId) {
  if (!placesForSchool(state.mapSchoolId).some((place) => place.id === placeId)) return;
  state.selectedMapPlaceId = placeId;
  renderCampusMap();
}
function openCampusMap(mode = 'search') {
  state.mapDialogMode = mode;
  const editedItem = mode === 'post' && state.editingItemId ? state.items.find((item) => item.id === state.editingItemId) : null;
  state.mapSchoolId = editedItem?.schoolId || state.user?.schoolId || '';
  state.selectedMapPlaceId = mode === 'post' ? byId('item-map-place-id').value : state.mapPlaceFilterId;
  if (mode === 'search') byId('map-search-type').value = ['lost', 'found'].includes(state.activeFilter) ? state.activeFilter : 'all';
  renderCampusMap();
  byId('map-search-dialog').showModal();
}
function applyCampusMapSelection() {
  const place = findMapPlace(state.selectedMapPlaceId, state.mapSchoolId);
  if (!place) {
    byId('map-search-error').textContent = 'เลือกอาคารหรือบริเวณบนแผนที่ก่อน';
    return;
  }
  if (state.mapDialogMode === 'post') {
    byId('item-map-place-id').value = place.id;
    byId('item-map-place-display').textContent = place.name;
    byId('item-location').value = place.legacyLocation;
    byId('item-map-place-hint').textContent = `สถานที่หลัก: ${locationLabel(place.legacyLocation)} · ค้นหาโพสต์นี้ได้จากแผนที่`;
  } else {
    state.mapPlaceFilterId = place.id;
    byId('location-filter').value = `place:${place.id}`;
    state.activeFilter = byId('map-search-type').value;
    document.querySelectorAll('.tabs [data-filter]').forEach((tab) => {
      const active = tab.dataset.filter === state.activeFilter;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    byId('map-location-status-text').textContent = `กำลังค้นหา: ${place.name} · ประกาศเดิมที่ระบุเพียงหมวดสถานที่อาจแสดงร่วมด้วย`;
    byId('map-location-status').classList.remove('hidden');
    renderItems();
  }
  byId('map-search-dialog').close();
}
function clearCampusMapFilter() {
  state.mapPlaceFilterId = '';
  if (byId('location-filter').value.startsWith('place:')) byId('location-filter').value = '';
  byId('map-location-status').classList.add('hidden');
  renderItems();
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
  heading.textContent = `${match.score}% คะแนนความคล้ายโดยประมาณ · ${candidate.itemName}`;
  const caption = document.createElement('span');
  caption.textContent = `${candidate.type === 'lost' ? 'ของหาย' : 'เก็บได้'} · ${categoryDisplayName(candidate.category)} · ${locationLabel(candidate.location)}`;
  const meter = document.createElement('span');
  meter.className = 'match-meter';
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', `คะแนนความคล้าย ${match.score} เปอร์เซ็นต์`);
  const fill = document.createElement('span');
  fill.style.width = `${Math.max(0, Math.min(100, match.score))}%`;
  meter.append(fill);
  const coverage = document.createElement('span');
  coverage.className = 'match-coverage';
  coverage.textContent = 'เปรียบเทียบได้ ' + (match.evidenceCount || 0) + '/' + (match.evidenceTotal || 7) + ' ด้าน · คะแนนเป็นค่าประมาณ';
  const reasons = document.createElement('span');
  reasons.className = 'match-reasons';
  const labels = [...(match.reasons || [])];
  reasons.textContent = labels.length ? `ปัจจัยที่สนับสนุนคะแนน: ${labels.slice(0, 4).join(' · ')}` : 'ยังไม่พบปัจจัยเด่นจากข้อมูลที่มี';
  const evidence = document.createElement('div');
  evidence.className = 'match-evidence';
  const evidenceTitle = document.createElement('strong');
  evidenceTitle.textContent = 'เหตุผลประกอบคะแนนความคล้าย';
  const factorList = document.createElement('div');
  factorList.className = 'match-factor-list';
  const factors = (match.factorScores || []).slice().sort((left, right) => right.score - left.score);
  factors.forEach((factor) => {
    const row = document.createElement('div');
    row.className = 'match-factor-row';
    const label = document.createElement('div');
    label.className = 'match-factor-heading';
    const name = document.createElement('span');
    name.textContent = factor.label;
    const score = document.createElement('strong');
    score.textContent = factor.score + '%';
    label.append(name, score);
    const meter = document.createElement('span');
    meter.className = 'match-factor-meter';
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', factor.label + ' ' + factor.score + '%');
    const fill = document.createElement('span');
    fill.style.width = Math.max(0, Math.min(100, factor.score)) + '%';
    meter.append(fill);
    row.append(label, meter);
    factorList.append(row);
  });
  content.append(heading, caption, meter, coverage);
  if (!compact) {
    content.append(reasons);
    if (factors.length) {
      const explanation = document.createElement('p');
      explanation.className = 'match-method-note';
      explanation.textContent = 'คะแนนคำนวณจากข้อมูลที่มีของทั้งสองประกาศ โดยให้น้ำหนักกับชื่อสิ่งของ (25%) หมวดหมู่ (16%) สถานที่ (11%) สี/ลักษณะ (10%) รายละเอียด (14%) ภาพ (20%) และวันที่ (4%) ข้อมูลที่ไม่มีจะไม่นำมาคิดคะแนน';
      const caution = document.createElement('p');
      caution.className = 'match-caution-note';
      caution.textContent = 'คะแนนนี้เป็นเพียงการประเมินความคล้ายจากข้อความ สี วันที่ และคุณลักษณะภาพ ไม่ได้ยืนยันว่าเป็นสิ่งของชิ้นเดียวกัน โปรดตรวจสอบรายละเอียดและยืนยันกับผู้แจ้งก่อนรับคืน';
      evidence.append(evidenceTitle, factorList, explanation, caution);
      content.append(evidence);
    }
  }
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
  const itemPhotos = Array.isArray(item.photos) && item.photos.length ? item.photos : item.photo ? [item.photo] : [];
  art.className = `item-art ${item.type}${itemPhotos.length ? ' has-photo' : ''}`;
  if (itemPhotos.length) {
    const image = document.createElement('img');
    image.src = itemPhotos[0];
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
  location.textContent = `📍 ${itemLocationLabel(item)}`;
  const eventDate = document.createElement('span');
  eventDate.textContent = `📅 ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
  if (item.eventTime) eventDate.textContent += ` · ${item.eventTime} น.`;
  const posted = document.createElement('span');
  posted.textContent = `◷ ลงประกาศ ${formatPostedDate(item.createdAt)}`;
  info.append(location, eventDate, posted);
  if (item.schoolName) {
    const school = document.createElement('span');
    school.textContent = `🏫 ${item.schoolName}${item.visibility === 'public' ? ' · สาธารณะ' : ''}`;
    info.append(school);
  } else if (item.visibility === 'public') {
    const publicLabel = document.createElement('span');
    publicLabel.textContent = '🌐 สาธารณะ';
    info.append(publicLabel);
  }
  if (item.type === 'lost' && item.rewardOffered) {
    const reward = document.createElement('span');
    reward.className = 'reward-note';
    reward.textContent = item.rewardAmount ? `💛 สินน้ำใจ ฿${Number(item.rewardAmount).toLocaleString('th-TH')}` : '💛 มีสินน้ำใจ (สอบถามรายละเอียด)';
    info.append(reward);
  }
  if (item.type === 'found' && item.depositLocation) {
    const deposit = document.createElement('span');
    deposit.textContent = `📦 ฝากของไว้ที่ ${item.depositLocation}`;
    info.append(deposit);
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
  const label = button.querySelector('.nav-label');
  if (label) label.textContent = 'แจ้งเตือน';
  else button.textContent = 'แจ้งเตือน';
  let badge = button.querySelector('.nav-badge');
  if (count) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      button.append(badge);
    }
    badge.textContent = String(count);
  } else {
    badge?.remove();
  }
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
  byId('detail-meta').textContent = `${categoryDisplayName(item.category)} · ${itemLocationLabel(item)} · ${item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ'} ${formatDate(item.date)}`;
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
  const photoGallery = byId('detail-photo-gallery');
  const itemPhotos = Array.isArray(item.photos) && item.photos.length ? item.photos : item.photo ? [item.photo] : [];
  photoGallery.replaceChildren();
  photoGallery.classList.toggle('hidden', itemPhotos.length === 0);
  if (itemPhotos.length) {
    const viewer = document.createElement('div');
    viewer.className = 'detail-photo-viewer';
    const main = document.createElement('img');
    main.className = 'detail-photo';
    main.src = itemPhotos[0];
    main.alt = `รูปสิ่งของภาพที่ 1 จาก ${itemPhotos.length}`;
    viewer.append(main);
    if (itemPhotos.length > 1) {
      const thumbnails = document.createElement('div');
      thumbnails.className = 'detail-photo-thumbnails';
      thumbnails.setAttribute('aria-label', 'เลือกรูปที่ต้องการดู');
      itemPhotos.forEach((url, index) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'detail-photo-choice';
        choice.setAttribute('aria-label', `ดูรูปที่ ${index + 1} จาก ${itemPhotos.length}`);
        choice.setAttribute('aria-pressed', String(index === 0));
        const thumbnail = document.createElement('img');
        thumbnail.src = url;
        thumbnail.alt = '';
        thumbnail.loading = 'lazy';
        choice.append(thumbnail);
        choice.addEventListener('click', () => {
          main.src = url;
          main.alt = `รูปสิ่งของภาพที่ ${index + 1} จาก ${itemPhotos.length}`;
          thumbnails.querySelectorAll('.detail-photo-choice').forEach((button) => button.setAttribute('aria-pressed', String(button === choice)));
        });
        thumbnails.append(choice);
      });
      viewer.append(thumbnails);
    }
    photoGallery.append(viewer);
  }
  renderItemTimeline(item);
  const facts = byId('detail-facts');
  facts.replaceChildren();
  const rows = [
    ['ผู้แจ้ง', item.reporterName || item.ownerName || 'ไม่ระบุ'],
    ['ลงประกาศ', formatPostedDate(item.createdAt)],
    ['สถานะ', item.status === 'resolved' ? 'ปิดประกาศแล้ว' : item.status === 'expired' ? 'หมดอายุ' : item.type === 'found' && item.status === 'open' ? 'ยังไม่มีผู้รับ' : 'ยังเปิดรับข้อมูล'],
  ];
  if (item.placeName) rows.push(['จุดบนแผนที่', item.placeName]);
  if (item.schoolName) rows.push(['โรงเรียนของโพสต์', item.schoolName]);
  rows.push(['การมองเห็น', item.visibility === 'school' ? 'สมาชิกโรงเรียนนี้' : 'สาธารณะ']);
  if (item.type === 'found' && item.depositLocation) rows.push(['ฝากของไว้ที่', item.depositLocation]);
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
  byId('profile-school').value = state.user?.schoolId || state.schools.find((school) => school.name === state.user?.school)?.id || '';
  renderProfileSchoolMap();
  byId('open-change-password').classList.toggle('hidden', state.user?.studentId?.toLowerCase() === 'a1010');
  byId('profile-status').textContent = '';
  byId('profile-dialog').showModal();
  loadCommunityPoints();
}
function renderItemTimeline(item) {
  const list = byId('item-timeline-list');
  list.replaceChildren();
  const labels = {
    reported: 'ลงประกาศ', claim_requested: 'มีผู้ส่งคำขอรับคืน', claim_approved: 'ผู้แจ้งอนุมัติคำขอ',
    claim_rejected: 'คำขอรับคืนไม่ได้รับอนุมัติ', claim_cancelled: 'ยกเลิกคำขอรับคืน',
    returned: 'ยืนยันการรับคืนผ่าน QR แล้ว', closed: 'ผู้แจ้งปิดประกาศ', reopened: 'เปิดประกาศอีกครั้ง', expired: 'ประกาศหมดอายุ',
  };
  const timeline = Array.isArray(item.timeline) && item.timeline.length
    ? item.timeline
    : [{ type: 'reported', at: item.createdAt }];
  timeline.forEach((event) => {
    const text = labels[event.type];
    if (!text) return;
    const row = document.createElement('li');
    row.className = `item-timeline-event${event.type === 'returned' ? ' is-complete' : ''}`;
    const marker = document.createElement('span');
    marker.className = 'item-timeline-marker';
    marker.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = text;
    const time = document.createElement('time');
    time.dateTime = event.at || item.createdAt;
    time.textContent = formatPostedDate(event.at || item.createdAt);
    content.append(title, time);
    row.append(marker, content);
    list.append(row);
  });
}
async function loadCommunityPoints() {
  const total = byId('community-points-total');
  const history = byId('community-points-history');
  total.textContent = '…';
  history.replaceChildren();
  try {
    const result = await api('/api/community-points');
    total.textContent = `${result.total} แต้ม`;
    if (!result.entries.length) {
      const empty = document.createElement('li');
      empty.textContent = 'ยังไม่มีรายการแต้ม เมื่อช่วยส่งคืนและผู้รับยืนยันผ่าน QR แต้มจะบันทึกที่นี่';
      history.append(empty);
      return;
    }
    result.entries.forEach((entry) => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${entry.reason} · ${entry.itemName}`;
      const value = document.createElement('strong');
      value.textContent = `+${entry.points}`;
      row.append(label, value);
      history.append(row);
    });
  } catch {
    total.textContent = '—';
    const error = document.createElement('li');
    error.textContent = 'โหลดข้อมูลแต้มไม่สำเร็จ ลองเปิดโปรไฟล์อีกครั้ง';
    history.append(error);
  }
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
        schoolId: byId('profile-school').value,
      }),
    });
    state.user = result.user;
    state.mapPlaceFilterId = '';
    if (byId('location-filter').value.startsWith('place:')) byId('location-filter').value = '';
    byId('map-location-status').classList.add('hidden');
    renderLocationFilterOptions();
    state.items = [];
    renderCommunityLabel();
    byId('profile-dialog').close();
    renderNav();
    renderItems();
    updateStats();
    showToast('บันทึกโปรไฟล์แล้ว');
    await loadItems();
    refreshNotificationCount();
  } catch (error) {
    byId('profile-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function parseNaturalSearch(rawQuery) {
  let remaining = rawQuery.normalize('NFKC').toLocaleLowerCase().trim();
  const parsed = { type: '', category: '', location: '', date: '', colors: [] };
  const remove = (patterns) => {
    for (const pattern of patterns) if (pattern.test(remaining)) {
      remaining = remaining.replace(pattern, ' ');
      return true;
    }
    return false;
  };
  if (remove([/ของหาย/g, /หาย/g, /lost\b/g])) parsed.type = 'lost';
  else if (remove([/เก็บได้/g, /พบ/g, /เจอ/g, /found\b/g, /picked\s*up\b/g])) parsed.type = 'found';
  const categories = [
    [['กระเป๋า', 'เป๋า', 'bag', 'bags', 'backpack'], 'Bags'],
    [['โทรศัพท์', 'มือถือ', 'phone', 'mobile'], 'Phones'],
    [['อิเล็กทรอนิกส์', 'หูฟัง', 'electronics', 'headphones', 'earbuds'], 'Electronics'],
    [['เครื่องเขียน', 'ปากกา', 'ดินสอ', 'stationery', 'pen', 'pencil'], 'Stationery'],
    [['อุปกรณ์การเรียน', 'หนังสือ', 'สมุด', 'school supplies', 'book', 'notebook'], 'School supplies'],
    [['เสื้อผ้า', 'เสื้อ', 'เสื้อกันหนาว', 'clothing', 'jacket', 'shirt'], 'Clothing'],
    [['ของใช้ส่วนตัว', 'กระบอกน้ำ', 'ขวดน้ำ', 'personal items', 'bottle', 'water bottle'], 'Personal items'],
  ];
  for (const [terms, value] of categories) {
    const found = terms.some((term) => {
      const pattern = new RegExp(term.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!pattern.test(remaining)) return false;
      remaining = remaining.replace(pattern, ' ');
      return true;
    });
    if (found) { parsed.category = value; break; }
  }
  const locations = [
    [['โรงอาหาร', 'cafeteria', 'canteen'], 'Cafeteria'],
    [['ห้องสมุด', 'library'], 'Library'],
    [['สนามกีฬา', 'สนามฟุตบอล', 'สนามบาส', 'sports area', 'football field', 'court'], 'Sports area'],
    [['ห้องเรียน', 'ห้อง', 'classroom'], 'Classroom'],
  ];
  for (const [terms, value] of locations) {
    const found = terms.some((term) => {
      const pattern = new RegExp(term.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!pattern.test(remaining)) return false;
      remaining = remaining.replace(pattern, ' ');
      return true;
    });
    if (found) { parsed.location = value; break; }
  }
  const colors = [
    [['สีดำ', 'ดำ', 'black'], ['ดำ', 'black']],
    [['สีขาว', 'ขาว', 'white'], ['ขาว', 'white']],
    [['สีแดง', 'แดง', 'red'], ['แดง', 'red']],
    [['สีน้ำเงิน', 'สีน้ำเงิน', 'น้ำเงิน', 'ฟ้า', 'blue', 'navy'], ['น้ำเงิน', 'ฟ้า', 'blue', 'navy']],
    [['สีเขียว', 'เขียว', 'green'], ['เขียว', 'green']],
    [['สีเหลือง', 'เหลือง', 'yellow'], ['เหลือง', 'yellow']],
    [['สีชมพู', 'ชมพู', 'pink'], ['ชมพู', 'pink']],
  ];
  for (const [terms, alternatives] of colors) {
    const found = terms.some((term) => {
      const pattern = new RegExp(term.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!pattern.test(remaining)) return false;
      remaining = remaining.replace(pattern, ' ');
      return true;
    });
    if (found) { parsed.colors.push(...alternatives); break; }
  }
  if (remove([/เมื่อวาน/g, /yesterday\b/g])) parsed.date = shiftDate(-1);
  else if (remove([/วันนี้/g, /today\b/g])) parsed.date = shiftDate(0);
  parsed.terms = remaining.split(/[\s,，]+/).filter((term) => term.length >= 2 && !['ที่', 'แถว', 'บริเวณ', 'ใกล้', 'near', 'at', 'in', 'on', 'the', 'a', 'an', 'item', 'was', 'my', 'ของ'].includes(term));
  return parsed;
}
function shiftDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function renderItems() {
  const list = byId('item-list');
  list.replaceChildren();
  const rawQuery = byId('search-input').value.trim();
  const parsedQuery = parseNaturalSearch(rawQuery);
  const query = parsedQuery.terms.join(' ').toLocaleLowerCase();
  const category = byId('category-filter').value;
  const locationValue = byId('location-filter').value;
  const selectedPlaceId = locationValue.startsWith('place:') ? locationValue.slice(6) : '';
  const location = selectedPlaceId ? '' : locationValue;
  const date = byId('date-filter').value;
  const mapPlace = findMapPlace(selectedPlaceId || state.mapPlaceFilterId);
  const items = state.items.filter(
    (item) =>
      (state.activeFilter === 'all' || item.type === state.activeFilter || (state.activeFilter === 'unclaimed' && item.type === 'found' && item.status === 'open')) &&
      (!state.showingMyItems || item.ownerId === state.user.id) &&
      (!state.imageSearchIds || state.imageSearchIds.includes(item.id)) &&
      (!category || item.category === category) &&
      (!location || item.location === location) &&
      (!mapPlace || (item.schoolId === state.user?.schoolId && (item.placeId === mapPlace.id || (!item.placeId && mapPlace.legacyLocation !== 'Other' && item.location === mapPlace.legacyLocation)))) &&
      (!date || item.date === date) &&
      (!parsedQuery.type || item.type === parsedQuery.type) &&
      (!parsedQuery.category || item.category === parsedQuery.category) &&
      (!parsedQuery.location || item.location === parsedQuery.location) &&
      (!parsedQuery.date || item.date === parsedQuery.date) &&
      (!parsedQuery.colors.length || parsedQuery.colors.some((color) => `${item.color || ''} ${item.itemName} ${item.description || ''}`.normalize('NFKC').toLocaleLowerCase().includes(color.normalize('NFKC')))) &&
      (!query || query.split(/\s+/).every((term) => {
        const text = `${item.itemName} ${item.category} ${categoryDisplayName(item.category)} ${item.color} ${item.location} ${locationLabel(item.location)} ${item.placeName || ''} ${item.depositLocation || ''} ${item.description}`.normalize('NFKC').toLocaleLowerCase();
        const aliases = { bag: ['กระเป๋า', 'backpack'], กระเป๋า: ['bag', 'backpack'], bottle: ['กระบอกน้ำ', 'ขวดน้ำ'], กระบอกน้ำ: ['bottle', 'water bottle'], black: ['ดำ'], ดำ: ['black'], book: ['หนังสือ', 'สมุด'], หนังสือ: ['book', 'notebook'], phone: ['โทรศัพท์', 'มือถือ'], โทรศัพท์: ['phone', 'mobile'], 'น้ำเงิน': ['blue', 'ฟ้า'], blue: ['น้ำเงิน', 'ฟ้า'] };
        return text.includes(term) || (aliases[term] || []).some((alias) => text.includes(alias));
      })),
  );
  const hint = byId('natural-search-hint');
  const detected = [parsedQuery.type && (parsedQuery.type === 'lost' ? 'ของหาย' : 'เก็บได้'), parsedQuery.category && categoryDisplayName(parsedQuery.category), parsedQuery.location && locationLabel(parsedQuery.location), parsedQuery.date && `วันที่ ${formatDate(parsedQuery.date)}`, parsedQuery.colors.length && `สี ${parsedQuery.colors[0]}`].filter(Boolean);
  hint.classList.toggle('hidden', !rawQuery || !detected.length);
  hint.textContent = detected.length ? `ตัวกรองจากข้อความ: ${detected.join(' · ')}${query ? ` · คำสำคัญ: ${query}` : ''}` : '';
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
        location: byId('location-filter').value.startsWith('place:') ? '' : byId('location-filter').value,
        placeId: byId('location-filter').value.startsWith('place:') ? byId('location-filter').value.slice(6) : '',
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
      description.textContent = [search.query, search.category && categoryDisplayName(search.category), search.placeName || (search.location && locationLabel(search.location)), search.date, search.type !== 'all' && (search.type === 'lost' ? 'ของหาย' : 'เก็บได้')].filter(Boolean).join(' · ');
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
  byId('item-form').reset();
  const schoolAudience = byId('item-audience').querySelector('option[value="school"]');
  schoolAudience.disabled = !state.user?.schoolId;
  byId('item-audience').disabled = false;
  byId('item-audience').value = state.user?.schoolId ? 'school' : 'public';
  byId('item-audience-hint').textContent = state.user?.schoolId
    ? 'โพสต์ชุมชนจะผูกกับโรงเรียนในโปรไฟล์ ณ เวลาที่ลงประกาศ'
    : 'ยังไม่ได้เลือกโรงเรียน โพสต์นี้จะเป็นสาธารณะ; เลือกโรงเรียนได้จากโปรไฟล์';
  byId('found-deposit-field').hidden = type !== 'found';
  byId('reward-options').hidden = type !== 'lost';
  byId('reward-amount-field').hidden = true;
  byId('item-reward-amount').disabled = true;
  byId('item-message').textContent = '';
  byId('item-reporter').value = state.user?.name || '';
  byId('item-map-place-id').value = '';
  byId('item-map-place-display').textContent = 'ยังไม่ได้เลือกจุด';
  byId('item-map-place-hint').textContent = state.user?.schoolId ? 'เลือกอาคารหรือบริเวณ เพื่อให้ค้นหาประกาศจากจุดนี้ได้' : 'เลือกโรงเรียนในโปรไฟล์ก่อน จึงจะปักจุดบนผังได้';
  byId('item-map-place-open').disabled = !placesForSchool(state.user?.schoolId).length;
  byId('dialog-kind').textContent = type === 'lost' ? 'แจ้งของหาย' : 'แจ้งเก็บของได้';
  byId('dialog-title').textContent = type === 'lost' ? 'แจ้งของหาย' : 'แจ้งสิ่งของที่พบ';
  byId('item-date-label').textContent = type === 'lost' ? 'วันที่หาย' : 'วันที่พบ';
  const today = new Date();
  byId('item-date').value = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  byId('item-date').max = byId('item-date').value;
  byId('item-time').value = '';
  clearPhoto();
  byId('item-dialog').showModal();
}
function editItem(item) {
  state.editingItemId = item.id;
  state.reportType = item.type;
  byId('item-form').reset();
  byId('item-audience').value = item.visibility || 'public';
  byId('item-audience').disabled = true;
  byId('item-audience-hint').textContent = `โพสต์นี้ผูกกับ ${item.schoolName || 'กระดานสาธารณะ'} ตั้งแต่วันที่ลงประกาศ`;
  byId('found-deposit-field').hidden = item.type !== 'found';
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
  byId('item-map-place-id').value = item.placeId || '';
  byId('item-map-place-display').textContent = item.placeName || 'ยังไม่ได้เลือกจุด';
  byId('item-map-place-hint').textContent = item.placeName ? `จุดที่บันทึกไว้: ${item.placeName}` : (item.schoolId ? 'เลือกอาคารหรือบริเวณ เพื่อให้ค้นหาประกาศจากจุดนี้ได้' : 'โพสต์นี้ไม่มีโรงเรียนที่ผูกไว้ จึงปักจุดบนผังไม่ได้');
  byId('item-map-place-open').disabled = !placesForSchool(item.schoolId).length;
  byId('item-deposit-location').value = item.depositLocation || '';
  byId('item-date').value = item.date;
  byId('item-time').value = item.eventTime || '';
  byId('item-contact').value = item.contact || '';
  byId('item-contact-public').checked = item.contactPublic !== false;
  const photos = Array.isArray(item.photos) && item.photos.length ? item.photos : item.photo ? [item.photo] : [];
  state.photoEntries = photos.map((url) => ({ url, existing: true }));
  renderPhotoPreviews();
  byId('item-message').textContent = 'เพิ่ม เปลี่ยน หรือลบรูปได้ (สูงสุด 6 รูป)';
  byId('item-date-label').textContent = item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ';
  byId('item-dialog').showModal();
}
function clearPhoto() {
  stopCamera();
  state.photoEntries.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); });
  state.photoEntries = [];
  renderPhotoPreviews();
  byId('photo-file').value = '';
  byId('camera-status').textContent = 'เพิ่มรูปได้สูงสุด 6 รูป · หลีกเลี่ยงใบหน้าและข้อมูลส่วนตัวในภาพ';
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
function renderPhotoPreviews() {
  const container = byId('photo-preview');
  container.replaceChildren();
  container.hidden = state.photoEntries.length === 0;
  state.photoEntries.forEach((entry, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo-preview-tile';
    const image = document.createElement('img');
    image.src = entry.previewUrl || entry.url;
    image.alt = `ภาพที่ ${index + 1}`;
    const actions = document.createElement('div');
    actions.className = 'photo-preview-actions';
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'button small';
    replace.textContent = 'เปลี่ยนรูป';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/jpeg,image/png,image/webp';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showToast('รองรับไฟล์ JPG, PNG หรือ WebP');
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      entry.file = file;
      entry.previewUrl = URL.createObjectURL(file);
      entry.existing = false;
      renderPhotoPreviews();
    });
    replace.addEventListener('click', () => picker.click());
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button small danger-button';
    remove.textContent = 'ลบ';
    remove.addEventListener('click', () => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      state.photoEntries.splice(index, 1);
      renderPhotoPreviews();
    });
    actions.append(replace, remove, picker);
    tile.append(image, actions);
    container.append(tile);
  });
  byId('photo-pick').textContent = state.photoEntries.length ? `เพิ่มรูป (${state.photoEntries.length}/6)` : 'เลือกรูปภาพ';
  byId('photo-pick').disabled = state.photoEntries.length >= 6;
}
function addPhoto(blob) {
  if (state.photoEntries.length >= 6) {
    byId('camera-status').textContent = 'เพิ่มได้สูงสุด 6 รูป';
    return false;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
    byId('camera-status').textContent = 'รองรับไฟล์ JPG, PNG หรือ WebP';
    return false;
  }
  state.photoEntries.push({ file: blob, previewUrl: URL.createObjectURL(blob), existing: false });
  renderPhotoPreviews();
  return true;
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
      addPhoto(blob);
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
async function optimizePhoto(file) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  let blob = null;
  while (scale >= 0.35) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 400 * 1024) {
        bitmap.close();
        return blob;
      }
    }
    scale *= 0.82;
  }
  bitmap.close();
  if (!blob) throw new Error('ลดขนาดรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่');
  if (blob.size > 500 * 1024) throw new Error('รูปภาพมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง');
  return blob;
}
async function submitItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (state.photoEntries.length > 6) {
    byId('item-message').textContent = 'เพิ่มรูปได้ไม่เกิน 6 รูป';
    return;
  }
  button.disabled = true;
  byId('item-message').textContent = '';
  const payload = {
    type: state.reportType,
    visibility: byId('item-audience').value,
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
    placeId: byId('item-map-place-id').value,
    depositLocation: state.reportType === 'found' ? byId('item-deposit-location').value.trim() : '',
    date: byId('item-date').value,
    eventTime: byId('item-time').value,
  };
  try {
    payload.photos = [];
    for (const entry of state.photoEntries) {
      if (entry.existing) {
        payload.photos.push({ url: entry.url });
      } else {
        const optimized = await optimizePhoto(entry.file);
        const imageFeatures = await analyzePhoto(optimized);
        payload.photos.push({ data: await fileAsDataUrl(optimized), imageFeatures });
      }
    }
    const firstEntry = state.photoEntries[0];
    if (firstEntry && !firstEntry.existing) payload.imageFeatures = payload.photos[0].imageFeatures;
    else if (state.editingItemId) payload.imageFeatures = state.items.find((item) => item.id === state.editingItemId)?.imageFeatures || null;
    else payload.imageFeatures = null;
  } catch (error) {
    byId('item-message').textContent = error.message || 'เตรียมรูปภาพไม่สำเร็จ';
    button.disabled = false;
    return;
  }
  try {
    if (!state.editingItemId) {
      const check = await api('/api/items/check', {
        method: 'POST',
        body: JSON.stringify({
          type: payload.type,
          visibility: payload.visibility,
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
    location.textContent = itemLocationLabel(item);
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
    byId('admin-return-count').textContent = overview.returnedCount ?? 0;
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
  byId('profile-school').addEventListener('change', renderProfileSchoolMap);
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
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = '';
    if (!files.length) return;
    const invalid = files.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (invalid) return showToast('รองรับไฟล์ JPG, PNG หรือ WebP');
    if (state.photoEntries.length + files.length > 6) return showToast(`เลือกเพิ่มได้อีกไม่เกิน ${6 - state.photoEntries.length} รูป`);
    files.forEach(addPhoto);
    byId('camera-status').textContent = `เลือกรูปแล้ว ${state.photoEntries.length}/6 รูป`;
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
  byId('location-filter').addEventListener('change', handleLocationFilterChange);
  byId('map-search-open').addEventListener('click', () => openCampusMap('search'));
  byId('item-map-place-open').addEventListener('click', () => openCampusMap('post'));
  byId('campus-map-overlay').addEventListener('click', (event) => { const area = event.target.closest('[data-place-id]'); if (area) chooseCampusPlace(area.dataset.placeId); });
  byId('campus-map-overlay').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { const area = event.target.closest('[data-place-id]'); if (area) { event.preventDefault(); chooseCampusPlace(area.dataset.placeId); } } });
  byId('apply-map-search').addEventListener('click', applyCampusMapSelection);
  byId('map-location-clear').addEventListener('click', clearCampusMapFilter);
  byId('close-map-search').addEventListener('click', () => byId('map-search-dialog').close());
  byId('cancel-map-search').addEventListener('click', () => byId('map-search-dialog').close());
  byId('map-set-school').addEventListener('click', () => { byId('map-search-dialog').close(); openProfile(); });
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
renderLocationFilterOptions();
start();


