/**
 * درب (Darb) — Complete Pure Vanilla JS Application Module
 * Firebase v10+ Modular CDN SDK (Auth, Firestore, Storage) + Leaflet.js
 * Strictly Western numerals (0-9), zero mock data, XSS-safe DOM rendering.
 */

const DEFAULT_HERO_IMAGE = '/src/assets/images/hero_alsoudah_mountains_1795369263890.jpg';
const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const DIFFICULTY_MAP = {
  سهل: { label: 'سهل', className: 'trip-badge--easy' },
  متوسط: { label: 'متوسط', className: 'trip-badge--moderate' },
  صعب: { label: 'صعب', className: 'trip-badge--hard' },
};

const VALID_DIFFICULTIES = new Set(['سهل', 'متوسط', 'صعب']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GPX_BYTES = 10 * 1024 * 1024;

/* ============================================================================
   1. Pure Formatting, Calculation, Validation & GPX Logic (Unit-Testable)
   ============================================================================ */

export function formatNum(value, decimals = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return decimals > 0 ? (0).toFixed(decimals) : '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatIsoDate(isoDate) {
  if (typeof isoDate !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthName = ARABIC_MONTHS[monthIdx];
  if (!monthName || day < 1 || day > 31) return isoDate;
  return `${day} ${monthName} ${year}`;
}

export function formatTimestampDate(value) {
  if (!value) return '';
  let dateObj = null;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    dateObj = value.toDate();
  } else if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatIsoDate(value);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
  }
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
  const day = dateObj.getDate();
  const monthName = ARABIC_MONTHS[dateObj.getMonth()] || '';
  const year = dateObj.getFullYear();
  return `${day} ${monthName} ${year}`;
}

export function formatHours(hours) {
  const num = Number(hours);
  if (!Number.isFinite(num) || num <= 0) return '0 ساعات';
  const isWhole = Math.abs(num - Math.round(num)) < 0.01;
  const formatted = isWhole ? formatNum(Math.round(num), 0) : formatNum(num, 1);
  if (num === 1) return '1 ساعة';
  if (num === 2) return '2 ساعتان';
  return `${formatted} ساعات`;
}

export function getDifficultyMeta(difficulty) {
  return DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP['متوسط'];
}

export function sanitizeMediaUrl(url, fallback = DEFAULT_HERO_IMAGE) {
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('./')
  ) {
    return trimmed;
  }
  return fallback;
}

export function sanitizeRelativeRedirect(target, fallback = './index.html') {
  if (typeof target !== 'string') return fallback;
  const trimmed = target.trim();
  if (!trimmed || trimmed.includes('://') || trimmed.startsWith('//') || trimmed.startsWith('javascript:')) {
    return fallback;
  }
  if (trimmed.startsWith('./') || /^[a-z0-9\-]+\.html(\?[a-zA-Z0-9_=&\-]+)?$/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function computeSummaryStats(trips) {
  const list = Array.isArray(trips) ? trips : [];
  if (list.length === 0) {
    return {
      totalTrips: 0,
      totalKm: 0,
      totalHours: 0,
      totalElevation: 0,
    };
  }
  let totalKm = 0;
  let totalHours = 0;
  let totalElevation = 0;
  for (const trip of list) {
    totalKm += Number(trip.distanceKm) || 0;
    totalHours += Number(trip.durationHours) || 0;
    totalElevation += Number(trip.elevationGainM) || 0;
  }
  return {
    totalTrips: list.length,
    totalKm: Math.round(totalKm * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    totalElevation: Math.round(totalElevation),
  };
}

export function filterTrips(trips, options = {}) {
  const list = Array.isArray(trips) ? trips : [];
  const {
    tab = 'all',
    query = '',
    currentYear = new Date().getFullYear(),
    currentUid = null,
  } = options;

  const q = String(query || '').trim().toLowerCase();

  return list.filter((trip) => {
    if (tab === 'this-year') {
      const tripYear = Number(trip.year) || Number(String(trip.dateIso || '').slice(0, 4));
      if (tripYear !== Number(currentYear)) return false;
    } else if (tab === 'mine') {
      if (!currentUid || trip.authorUid !== currentUid) return false;
    }

    if (!q) return true;

    const haystack = [
      trip.title,
      trip.location,
      trip.region,
      trip.difficulty,
      trip.authorName,
      trip.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function computeElevationMetrics(profile, totalDistanceKm = 0) {
  const pts = Array.isArray(profile) ? profile : [];
  if (pts.length === 0) {
    return { min: 0, max: 0, gain: 0, avgGradePct: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  let gain = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const elev = Number(pts[i].m);
    if (!Number.isFinite(elev)) continue;
    if (elev < min) min = elev;
    if (elev > max) max = elev;
    if (i > 0) {
      const prev = Number(pts[i - 1].m);
      if (Number.isFinite(prev) && elev > prev) {
        gain += elev - prev;
      }
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  const distKm =
    Number(totalDistanceKm) > 0
      ? Number(totalDistanceKm)
      : Number(pts[pts.length - 1]?.km) || 0;

  const avgGradePct =
    distKm > 0 ? Math.round(((gain / (distKm * 1000)) * 100) * 10) / 10 : 0;

  return {
    min: Math.round(min),
    max: Math.round(max),
    gain: Math.round(gain),
    avgGradePct,
  };
}

export function isSuperAdminProfile(userProfile) {
  return Boolean(userProfile && userProfile.role === 'superadmin' && !userProfile.isBanned);
}

export function canDeleteTrip(trip, userProfile) {
  if (!trip || !userProfile || userProfile.isBanned) return false;
  return userProfile.role === 'superadmin' || trip.authorUid === userProfile.uid;
}

export function canEditNotes(trip, userProfile) {
  return canDeleteTrip(trip, userProfile);
}

export function canDeleteComment(comment, trip, userProfile) {
  if (!comment || !userProfile || userProfile.isBanned) return false;
  return (
    userProfile.role === 'superadmin' ||
    comment.authorUid === userProfile.uid ||
    (trip && trip.authorUid === userProfile.uid)
  );
}

export function validateTripInput(input = {}) {
  const errors = [];
  const title = String(input.title || '').trim();
  const location = String(input.location || '').trim();
  const dateIso = String(input.dateIso || '').trim();
  const difficulty = String(input.difficulty || 'متوسط').trim();
  const distanceKm = Number(input.distanceKm);
  const durationHours = Number(input.durationHours);
  const elevationGainM =
    input.elevationGainM === '' || input.elevationGainM === undefined || input.elevationGainM === null
      ? 0
      : Number(input.elevationGainM);
  const notes = String(input.notes || '').trim();

  if (title.length < 2 || title.length > 120) {
    errors.push('يرجى إدخال اسم رحلة صحيح (من 2 إلى 120 حرفاً).');
  }
  if (location.length < 2 || location.length > 120) {
    errors.push('يرجى إدخال موقع الرحلة (من 2 إلى 120 حرفاً).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    errors.push('يرجى اختيار تاريخ صحيح للرحلة.');
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500) {
    errors.push('يرجى إدخال مسافة صالحة أكبر من 0 وحتى 500 كم.');
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 240) {
    errors.push('يرجى إدخال مدة صالحة أكبر من 0 وحتى 240 ساعة.');
  }
  if (!Number.isFinite(elevationGainM) || elevationGainM < 0 || elevationGainM > 20000) {
    errors.push('قيمة الارتفاع المكتسب يجب أن تكون بين 0 و 20000 متر.');
  }
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    errors.push('يرجى اختيار مستوى صعوبة صالح (سهل، متوسط، أو صعب).');
  }
  if (notes.length > 4000) {
    errors.push('مذكرات الرحلة طويلة جداً (الحد الأقصى 4000 حرف).');
  }

  return { valid: errors.length === 0, errors };
}

export function validateCommentInput(input = {}) {
  const errors = [];
  const text = String(input.text || '').trim();
  if (text.length < 2) {
    errors.push('يرجى كتابة تعليق لا يقل عن حرفين.');
  } else if (text.length > 1000) {
    errors.push('التعليق يجب ألا يتجاوز 1000 حرف.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateImageFile(file) {
  if (!file) return { valid: true, error: '' };
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return { valid: false, error: 'صيغة الصورة غير مدعومة. يرجى اختيار JPG أو PNG أو WEBP.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, error: 'حجم صورة الغلاف يجب ألا يتجاوز 5 MB.' };
  }
  return { valid: true, error: '' };
}

export function validateGpxFile(file) {
  if (!file) return { valid: true, error: '' };
  const name = String(file.name || '').toLowerCase();
  if (!name.endsWith('.gpx')) {
    return { valid: false, error: 'يرجى اختيار ملف مسار بصيغة .gpx فقط.' };
  }
  if (file.size > MAX_GPX_BYTES) {
    return { valid: false, error: 'حجم ملف GPX يجب ألا يتجاوز 10 MB.' };
  }
  return { valid: true, error: '' };
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downsampleArray(items, maxCount) {
  if (items.length <= maxCount) return items;
  const result = [];
  const step = (items.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i += 1) {
    result.push(items[Math.round(i * step)]);
  }
  return result;
}

export function parseGpxXml(xmlString) {
  if (typeof xmlString !== 'string' || !xmlString.trim()) {
    return { valid: false, error: 'ملف GPX فارغ.' };
  }

  const rawPoints = [];
  const pointTagRegex = /<(?:trkpt|rtept|wpt)\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>)/gi;
  let match;

  while ((match = pointTagRegex.exec(xmlString)) !== null) {
    const attrs = match[1] || '';
    const inner = match[2] || '';
    const latMatch = /\blat=["']([+-]?\d+(?:\.\d+)?)["']/i.exec(attrs);
    const lonMatch = /\blon=["']([+-]?\d+(?:\.\d+)?)["']/i.exec(attrs);
    if (!latMatch || !lonMatch) continue;

    const lat = Number(latMatch[1]);
    const lng = Number(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const eleMatch = /<ele>\s*([+-]?\d+(?:\.\d+)?)\s*<\/ele>/i.exec(inner);
    const ele = eleMatch ? Number(eleMatch[1]) : null;
    rawPoints.push({
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      ele: Number.isFinite(ele) ? ele : null,
    });
  }

  if (rawPoints.length < 2) {
    return {
      valid: false,
      error: 'ملف GPX لا يحتوي على نقطتين جغرافيتين على الأقل (trkpt / rtept).',
    };
  }

  let totalDistanceKm = 0;
  let elevationGainM = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  const cumulative = [];

  for (let i = 0; i < rawPoints.length; i += 1) {
    const p = rawPoints[i];
    if (i > 0) {
      totalDistanceKm += haversineKm(rawPoints[i - 1].lat, rawPoints[i - 1].lng, p.lat, p.lng);
      if (p.ele !== null && rawPoints[i - 1].ele !== null && p.ele > rawPoints[i - 1].ele) {
        elevationGainM += p.ele - rawPoints[i - 1].ele;
      }
    }
    if (p.ele !== null) {
      if (p.ele < minEle) minEle = p.ele;
      if (p.ele > maxEle) maxEle = p.ele;
    }
    cumulative.push({
      km: Math.round(totalDistanceKm * 100) / 100,
      m: p.ele !== null ? Math.round(p.ele) : null,
    });
  }

  const hasElevation = Number.isFinite(minEle) && Number.isFinite(maxEle);
  const safeMinEle = hasElevation ? Math.round(minEle) : 0;
  const safeMaxEle = hasElevation ? Math.round(maxEle) : 0;

  const sampledCoords = downsampleArray(rawPoints, 120).map((p) => ({
    lat: p.lat,
    lng: p.lng,
  }));

  const sampledProfile = downsampleArray(cumulative, 24).map((p, idx, arr) => ({
    km: Number.isFinite(p.km) ? p.km : idx,
    m: p.m !== null ? p.m : safeMinEle + Math.round((idx / Math.max(1, arr.length - 1)) * Math.max(0, safeMaxEle - safeMinEle)),
  }));

  return {
    valid: true,
    pointCount: rawPoints.length,
    startLat: rawPoints[0].lat,
    startLng: rawPoints[0].lng,
    distanceKm: Math.max(0.1, Math.round(totalDistanceKm * 10) / 10),
    elevationGainM: Math.round(elevationGainM),
    minElevationM: safeMinEle,
    maxElevationM: safeMaxEle,
    routePoints: sampledCoords,
    elevationProfile: sampledProfile,
  };
}

export function buildDefaultTrailData(distanceKm, elevationGainM) {
  const safeDist = Math.max(0.5, Number(distanceKm) || 5);
  const safeGain = Math.max(0, Math.round(Number(elevationGainM) || 0));
  const baseLat = 18.2735;
  const baseLng = 42.3702;
  const baseEle = 1200;

  const steps = 8;
  const routePoints = [];
  const elevationProfile = [];

  for (let i = 0; i < steps; i += 1) {
    const ratio = i / (steps - 1);
    const lat = Math.round((baseLat + ratio * 0.022 + Math.sin(ratio * Math.PI) * 0.004) * 1e6) / 1e6;
    const lng = Math.round((baseLng + ratio * 0.018 + Math.cos(ratio * Math.PI) * 0.003) * 1e6) / 1e6;
    routePoints.push({ lat, lng });

    const km = Math.round(ratio * safeDist * 10) / 10;
    const peakCurve = Math.sin(ratio * Math.PI * 0.85);
    const m = Math.round(baseEle + peakCurve * safeGain);
    elevationProfile.push({ km, m });
  }

  return {
    startLat: routePoints[0].lat,
    startLng: routePoints[0].lng,
    minElevationM: baseEle,
    maxElevationM: Math.max(...elevationProfile.map((p) => p.m)),
    routePoints,
    elevationProfile,
  };
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildGpxXml(trip) {
  const points = Array.isArray(trip?.routePoints) ? trip.routePoints : [];
  const profile = Array.isArray(trip?.elevationProfile) ? trip.elevationProfile : [];
  const title = escapeXml(trip?.title || 'Darb Trail');
  const location = escapeXml(trip?.location || '');

  const trkpts = points
    .map((pt, idx) => {
      const lat = Number(pt.lat ?? pt[0]);
      const lng = Number(pt.lng ?? pt[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
      const profIdx =
        profile.length > 0
          ? Math.min(profile.length - 1, Math.round((idx / Math.max(1, points.length - 1)) * (profile.length - 1)))
          : -1;
      const ele = profIdx >= 0 && Number.isFinite(Number(profile[profIdx]?.m)) ? Number(profile[profIdx].m) : null;
      return ele !== null
        ? `      <trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele></trkpt>`
        : `      <trkpt lat="${lat}" lon="${lng}" />`;
    })
    .filter(Boolean)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Darb Trail Platform" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${title}</name>`,
    `    <desc>${location}</desc>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${title}</name>`,
    '    <trkseg>',
    trkpts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ].join('\n');
}

export function translateAuthError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني مسجّل مسبقاً. جرّب تسجيل الدخول.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة؛ يرجى اختيار 6 أحرف على الأقل.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/operation-not-allowed':
      return 'تسجيل الدخول بالبريد الإلكتروني غير مفعّل بعد في Firebase Console. يمكنك المتابعة عبر حساب Google أو تفعيل Email/Password من لوحة Firebase.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
    case 'auth/too-many-requests':
      return 'محاولات متكررة كثيرة؛ يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالشبكة؛ تحقق من اتصالك بالإنترنت.';
    default:
      return 'حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.';
  }
}

/* ============================================================================
   2. Browser Runtime & Firebase v10+ Modular Controllers
   ============================================================================ */

async function bootstrapBrowserApp() {
  const [fbConfigMod, authMod, firestoreMod, storageMod] = await Promise.all([
    import('./firebase-config.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js'),
  ]);

  const { auth, db, storage, isConfiguredSuperAdminEmail, OperationType, handleFirestoreError } =
    fbConfigMod;

  const {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
  } = authMod;

  const {
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
  } = firestoreMod;

  const { ref, uploadBytes, getDownloadURL } = storageMod;

  /* ---- Shared UI Utilities ---- */

  const page = document.body.dataset.page || 'dashboard';
  const state = {
    authReady: false,
    firebaseUser: null,
    userProfile: null,
    authListeners: [],
  };

  function showToast(message) {
    const region = document.getElementById('toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => {
      item.remove();
    }, 3400);
  }

  function openConfirmDialog({ title, message, confirmLabel = 'تأكيد الحذف' }) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('confirmDialog');
      if (!dialog) {
        resolve(false);
        return;
      }
      const titleEl = document.getElementById('confirmTitle');
      const msgEl = document.getElementById('confirmMessage');
      const acceptBtn = document.getElementById('confirmAcceptBtn');
      const cancelBtn = document.getElementById('confirmCancelBtn');

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (acceptBtn) acceptBtn.textContent = confirmLabel;

      const cleanup = (result) => {
        acceptBtn?.removeEventListener('click', onAccept);
        cancelBtn?.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) dialog.close();
        resolve(result);
      };

      const onAccept = () => cleanup(true);
      const onCancel = () => cleanup(false);

      acceptBtn?.addEventListener('click', onAccept);
      cancelBtn?.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onCancel);

      dialog.showModal();
    });
  }

  function updateNavbarAuthUI() {
    const loginBtn = document.getElementById('navLoginBtn');
    const userGroup = document.getElementById('navUserGroup');
    const userNameEl = document.getElementById('navUserName');
    const adminLink = document.getElementById('navAdminLink');
    const bannedBanner = document.getElementById('globalBannedBanner');

    const profile = state.userProfile;
    const signedIn = Boolean(state.firebaseUser && profile);

    if (loginBtn) loginBtn.hidden = signedIn;
    if (userGroup) userGroup.hidden = !signedIn;
    if (userNameEl) userNameEl.textContent = signedIn ? profile.name : '';

    if (adminLink) {
      adminLink.hidden = !isSuperAdminProfile(profile);
    }

    if (bannedBanner) {
      bannedBanner.hidden = !(signedIn && profile.isBanned);
    }
  }

  const logoutBtn = document.getElementById('navLogoutBtn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      showToast('تم تسجيل الخروج بنجاح.');
      if (page === 'admin' || page === 'add-trip') {
        window.location.href = './index.html';
      }
    } catch {
      showToast('تعذّر تسجيل الخروج حالياً.');
    }
  });

  async function syncUserProfile(fbUser, preferredName = '') {
    const userRef = doc(db, 'users', fbUser.uid);
    const path = `users/${fbUser.uid}`;
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    const isBootstrappedVerified =
      Boolean(fbUser.emailVerified) && isConfiguredSuperAdminEmail(fbUser.email);

    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: fbUser.uid,
        name: data.name || fbUser.displayName || 'مستخدم درب',
        email: data.email || fbUser.email || '',
        role: isBootstrappedVerified ? 'superadmin' : data.role || 'user',
        isBanned: Boolean(data.isBanned),
        createdAt: data.createdAt || null,
      };
    }

    const rawName = (preferredName || fbUser.displayName || (fbUser.email || '').split('@')[0] || 'رحّالة درب').trim();
    const safeName = rawName.length >= 2 ? rawName.slice(0, 80) : `${rawName} درب`;
    const newProfile = {
      uid: fbUser.uid,
      name: safeName,
      email: (fbUser.email || 'user@darb.com').trim(),
      role: isBootstrappedVerified ? 'superadmin' : 'user',
      isBanned: false,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    return {
      ...newProfile,
      role: isBootstrappedVerified ? 'superadmin' : 'user',
    };
  }

  function onAuthReady(cb) {
    state.authListeners.push(cb);
    if (state.authReady) {
      cb({ firebaseUser: state.firebaseUser, userProfile: state.userProfile });
    }
  }

  function notifyAuthListeners() {
    updateNavbarAuthUI();
    for (const cb of state.authListeners) {
      cb({ firebaseUser: state.firebaseUser, userProfile: state.userProfile });
    }
  }

  onAuthStateChanged(auth, async (fbUser) => {
    state.firebaseUser = fbUser;
    if (!fbUser) {
      state.userProfile = null;
      state.authReady = true;
      notifyAuthListeners();
      return;
    }

    try {
      const profile = await syncUserProfile(fbUser);
      state.userProfile = profile;
    } catch {
      state.userProfile = {
        uid: fbUser.uid,
        name: fbUser.displayName || 'مستخدم درب',
        email: fbUser.email || '',
        role:
          fbUser.emailVerified && isConfiguredSuperAdminEmail(fbUser.email)
            ? 'superadmin'
            : 'user',
        isBanned: false,
      };
    }

    state.authReady = true;
    notifyAuthListeners();
  });

  /* ---- Helper: Compress Cover Image to DataURL fallback ---- */

  function compressImageToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذّر قراءة ملف الصورة.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('تعذّر معالجة ملف الصورة.'));
        img.onload = () => {
          const maxWidth = 1120;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('تعذّر ضغط الصورة.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let dataUrl = canvas.toDataURL('image/jpeg', 0.76);
          if (dataUrl.length > 320000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.56);
          }
          resolve(dataUrl);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadFileToStorage(storagePath, file) {
    const fileRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(fileRef, file);
    return getDownloadURL(snapshot.ref);
  }

  function makeSvgIcon(pathD, className = 'icon-xs') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  /* ==========================================================================
     PAGE 1: Dashboard (index.html)
     ========================================================================== */

  function initDashboardPage() {
    let allTrips = [];
    let activeTab = 'all';
    let searchQuery = '';
    let activeNavView = 'trips';
    let inlineMapMode = false;
    let inlineMapInstance = null;
    let inlineMapLayer = null;
    let fullMapInstance = null;
    let fullMapLayer = null;

    const tripsGrid = document.getElementById('tripsGrid');
    const loadingState = document.getElementById('tripsLoadingState');
    const emptyState = document.getElementById('emptyState');
    const emptyTitle = document.getElementById('emptyStateTitle');
    const emptyDesc = document.getElementById('emptyStateDesc');
    const emptyAddBtn = document.getElementById('emptyAddTripBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const footerRow = document.getElementById('tripsFooterRow');
    const counterNote = document.getElementById('tripsCounterNote');
    const searchInput = document.getElementById('tripSearchInput');
    const countAllEl = document.getElementById('countAll');

    const statTrips = document.getElementById('statTotalTrips');
    const statKm = document.getElementById('statTotalKm');
    const statHours = document.getElementById('statTotalHours');
    const statElevation = document.getElementById('statTotalElevation');

    const heroImage = document.getElementById('heroImage');
    const heroKicker = document.getElementById('heroKicker');
    const heroTitle = document.getElementById('hero-title');
    const heroMeta = document.getElementById('heroMeta');
    const heroCta = document.getElementById('heroCta');
    const heroCtaText = document.getElementById('heroCtaText');

    const gridToggle = document.getElementById('gridViewToggle');
    const mapToggle = document.getElementById('mapViewToggle');
    const inlineMapPanel = document.getElementById('inlineMapPanel');

    const navButtons = Array.from(document.querySelectorAll('[data-nav-view]'));
    const filterTabs = Array.from(document.querySelectorAll('.filter-tab'));

    function switchNavView(targetView) {
      activeNavView = targetView;
      const views = ['trips', 'map', 'stats'];
      for (const v of views) {
        const section = document.getElementById(`view-${v}`);
        if (section) section.hidden = v !== targetView;
      }
      for (const btn of navButtons) {
        const isCurrent = btn.dataset.navView === targetView;
        if (btn.classList.contains('nav-link')) {
          btn.classList.toggle('is-active', isCurrent);
          if (isCurrent) btn.setAttribute('aria-current', 'page');
          else btn.removeAttribute('aria-current');
        }
      }
      if (targetView === 'map') renderFullMapView();
      if (targetView === 'stats') renderAnalyticsView();
    }

    for (const btn of navButtons) {
      btn.addEventListener('click', () => {
        switchNavView(btn.dataset.navView || 'trips');
      });
    }

    if (window.location.hash === '#map') switchNavView('map');
    else if (window.location.hash === '#stats') switchNavView('stats');

    for (const tabBtn of filterTabs) {
      tabBtn.addEventListener('click', () => {
        activeTab = tabBtn.dataset.filter || 'all';
        for (const t of filterTabs) {
          const selected = t === tabBtn;
          t.classList.toggle('is-active', selected);
          t.setAttribute('aria-selected', String(selected));
        }
        renderTripsFeed();
      });
    }

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value || '';
      renderTripsFeed();
    });

    resetFiltersBtn?.addEventListener('click', () => {
      activeTab = 'all';
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      for (const t of filterTabs) {
        const isAll = t.dataset.filter === 'all';
        t.classList.toggle('is-active', isAll);
        t.setAttribute('aria-selected', String(isAll));
      }
      renderTripsFeed();
    });

    gridToggle?.addEventListener('click', () => {
      inlineMapMode = false;
      gridToggle.classList.add('is-active');
      gridToggle.setAttribute('aria-pressed', 'true');
      mapToggle?.classList.remove('is-active');
      mapToggle?.setAttribute('aria-pressed', 'false');
      if (inlineMapPanel) inlineMapPanel.hidden = true;
    });

    mapToggle?.addEventListener('click', () => {
      inlineMapMode = true;
      mapToggle.classList.add('is-active');
      mapToggle.setAttribute('aria-pressed', 'true');
      gridToggle?.classList.remove('is-active');
      gridToggle?.setAttribute('aria-pressed', 'false');
      if (inlineMapPanel) inlineMapPanel.hidden = false;
      renderInlineMap(getFilteredTrips());
    });

    function getFilteredTrips() {
      return filterTrips(allTrips, {
        tab: activeTab,
        query: searchQuery,
        currentYear: new Date().getFullYear(),
        currentUid: state.userProfile?.uid || null,
      });
    }

    function updateSummaryAndHero() {
      const stats = computeSummaryStats(allTrips);
      if (statTrips) statTrips.textContent = formatNum(stats.totalTrips, 0);
      if (statKm) statKm.textContent = formatNum(stats.totalKm, 1);
      if (statHours) statHours.textContent = formatNum(stats.totalHours, Number.isInteger(stats.totalHours) ? 0 : 1);
      if (statElevation) statElevation.textContent = formatNum(stats.totalElevation, 0);
      if (countAllEl) countAllEl.textContent = formatNum(allTrips.length, 0);

      if (allTrips.length > 0) {
        const latest = allTrips[0];
        if (heroImage) {
          heroImage.src = sanitizeMediaUrl(latest.coverImageUrl, DEFAULT_HERO_IMAGE);
          heroImage.alt = latest.title;
        }
        if (heroKicker) heroKicker.textContent = `أحدث رحلة موثّقة · ${latest.location}`;
        if (heroTitle) heroTitle.textContent = latest.title;
        if (heroMeta) {
          heroMeta.textContent = `${formatIsoDate(latest.dateIso)} · ${formatNum(latest.distanceKm, 1)} كم · ${formatHours(latest.durationHours)}`;
        }
        if (heroCta) heroCta.href = `./trip-details.html?id=${encodeURIComponent(latest.id)}`;
        if (heroCtaText) heroCtaText.textContent = 'استعد ذكريات الرحلة';
      } else {
        if (heroImage) {
          heroImage.src = DEFAULT_HERO_IMAGE;
          heroImage.alt = 'سلسلة جبال خضراء محاطة بالضباب الصباحي';
        }
        if (heroKicker) heroKicker.textContent = 'منصة درب لتوثيق المسارات الجبلية';
        if (heroTitle) heroTitle.textContent = 'ابدأ بتوثيق أول مسار لك في الطبيعة';
        if (heroMeta) heroMeta.textContent = 'ارفع ملف GPX وصور رحلتك لتبني سجل مغامراتك الحي';
        if (heroCta) heroCta.href = './add-trip.html';
        if (heroCtaText) heroCtaText.textContent = 'وثّق أول رحلة';
      }
    }

    function buildTripCard(trip) {
      const card = document.createElement('article');
      card.className = 'trip-card';
      card.dataset.tripId = trip.id;

      const media = document.createElement('div');
      media.className = 'trip-card-media';

      const imgLink = document.createElement('a');
      imgLink.className = 'trip-card-img-link';
      imgLink.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
      imgLink.setAttribute('aria-label', `عرض تفاصيل رحلة ${trip.title}`);

      const img = document.createElement('img');
      img.className = 'trip-card-img';
      img.src = sanitizeMediaUrl(trip.coverImageUrl, DEFAULT_HERO_IMAGE);
      img.alt = trip.title;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      imgLink.appendChild(img);
      media.appendChild(imgLink);

      const diff = getDifficultyMeta(trip.difficulty);
      const badge = document.createElement('span');
      badge.className = `trip-badge ${diff.className}`;
      badge.textContent = diff.label;
      media.appendChild(badge);

      if (canDeleteTrip(trip, state.userProfile)) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'card-delete-btn';
        delBtn.textContent = 'حذف';
        delBtn.setAttribute('aria-label', `حذف رحلة ${trip.title}`);
        delBtn.addEventListener('click', async () => {
          const ok = await openConfirmDialog({
            title: 'تأكيد حذف الرحلة',
            message: `هل أنت متأكد من حذف رحلة «${trip.title}» نهائياً من قاعدة البيانات؟`,
          });
          if (!ok) return;
          try {
            await deleteDoc(doc(db, 'trips', trip.id));
            showToast('تم حذف الرحلة بنجاح.');
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `trips/${trip.id}`);
          }
        });
        media.appendChild(delBtn);
      }

      const body = document.createElement('div');
      body.className = 'trip-card-body';

      const head = document.createElement('div');
      head.className = 'trip-card-head';

      const h3 = document.createElement('h3');
      h3.className = 'trip-card-title';
      const titleLink = document.createElement('a');
      titleLink.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
      titleLink.textContent = trip.title;
      h3.appendChild(titleLink);

      const dateEl = document.createElement('span');
      dateEl.className = 'trip-card-date';
      dateEl.textContent = formatIsoDate(trip.dateIso);

      head.append(h3, dateEl);

      const locP = document.createElement('p');
      locP.className = 'trip-card-location';
      locP.appendChild(makeSvgIcon('M12 21s-6-5.6-6-10a6 6 0 1 1 12 0c0 4.4-6 10-6 10z', 'icon-xs'));
      const locSpan = document.createElement('span');
      locSpan.textContent = trip.location;
      locP.appendChild(locSpan);

      const footer = document.createElement('div');
      footer.className = 'trip-card-footer';

      const metrics = document.createElement('div');
      metrics.className = 'trip-metrics';

      const durSpan = document.createElement('span');
      durSpan.textContent = formatHours(trip.durationHours);
      const sep = document.createElement('span');
      sep.className = 'metric-sep';
      sep.textContent = '·';
      const distSpan = document.createElement('span');
      distSpan.textContent = `${formatNum(trip.distanceKm, 1)} كم`;
      metrics.append(durSpan, sep, distSpan);

      const arrowLink = document.createElement('a');
      arrowLink.className = 'trip-arrow-link';
      arrowLink.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
      arrowLink.setAttribute('aria-label', `الانتقال إلى تفاصيل ${trip.title}`);
      arrowLink.appendChild(makeSvgIcon('M19 12H5M11 18l-6-6 6-6', 'icon-sm'));

      footer.append(metrics, arrowLink);
      body.append(head, locP, footer);
      card.append(media, body);
      return card;
    }

    function renderTripsFeed() {
      if (!tripsGrid || !emptyState) return;
      const filtered = getFilteredTrips();
      tripsGrid.replaceChildren();

      if (allTrips.length === 0) {
        emptyState.hidden = false;
        if (emptyTitle) emptyTitle.textContent = 'لا توجد رحلات مضافة بعد، كن أول من يوثق مساره!';
        if (emptyDesc) {
          emptyDesc.textContent = 'سجّل دخولك وأضف أول رحلة جبلية مع صورة الغلاف وملف GPX لتظهر هنا مباشرة.';
        }
        if (emptyAddBtn) emptyAddBtn.hidden = false;
        if (resetFiltersBtn) resetFiltersBtn.hidden = true;
        if (footerRow) footerRow.hidden = true;
      } else if (filtered.length === 0) {
        emptyState.hidden = false;
        if (emptyTitle) emptyTitle.textContent = 'لا توجد رحلات مطابقة لخيارات التصفية الحالية.';
        if (emptyDesc) emptyDesc.textContent = 'جرّب تعديل كلمة البحث أو اختيار تبويب «كل الرحلات».';
        if (emptyAddBtn) emptyAddBtn.hidden = true;
        if (resetFiltersBtn) resetFiltersBtn.hidden = false;
        if (footerRow) footerRow.hidden = true;
      } else {
        emptyState.hidden = true;
        const frag = document.createDocumentFragment();
        for (const trip of filtered) {
          frag.appendChild(buildTripCard(trip));
        }
        tripsGrid.appendChild(frag);
        if (footerRow) footerRow.hidden = false;
        if (counterNote) {
          counterNote.textContent = `عرض ${formatNum(filtered.length)} من أصل ${formatNum(allTrips.length)} رحلة موثّقة`;
        }
      }

      if (inlineMapMode) {
        renderInlineMap(filtered);
      }
      if (activeNavView === 'map') {
        renderFullMapView();
      }
      if (activeNavView === 'stats') {
        renderAnalyticsView();
      }
    }

    function populateLeafletMap(containerId, existingMap, existingLayer, trips) {
      if (typeof window.L === 'undefined') return { map: existingMap, layer: existingLayer };
      const el = document.getElementById(containerId);
      if (!el) return { map: existingMap, layer: existingLayer };

      let map = existingMap;
      let layer = existingLayer;
      if (!map) {
        map = window.L.map(el, { scrollWheelZoom: false }).setView([23.8859, 45.0792], 5);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(map);
        layer = window.L.layerGroup().addTo(map);
      }

      layer.clearLayers();
      const bounds = [];

      for (const trip of trips) {
        const lat = Number(trip.startLat);
        const lng = Number(trip.startLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        bounds.push([lat, lng]);

        const popupWrap = document.createElement('div');
        popupWrap.className = 'darb-map-popup';
        const strong = document.createElement('strong');
        strong.textContent = trip.title;
        const meta = document.createElement('span');
        meta.textContent = `${trip.location} · ${formatNum(trip.distanceKm, 1)} كم`;
        const link = document.createElement('a');
        link.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
        link.textContent = 'عرض تفاصيل الرحلة ←';
        popupWrap.append(strong, meta, link);

        window.L.circleMarker([lat, lng], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#234736',
          fillOpacity: 1,
        })
          .bindPopup(popupWrap)
          .addTo(layer);
      }

      window.setTimeout(() => {
        map.invalidateSize();
        if (bounds.length === 1) {
          map.setView(bounds[0], 11);
        } else if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [36, 36] });
        } else {
          map.setView([23.8859, 45.0792], 5);
        }
      }, 60);

      return { map, layer };
    }

    function renderInlineMap(trips) {
      const res = populateLeafletMap('inlineTripsMap', inlineMapInstance, inlineMapLayer, trips);
      inlineMapInstance = res.map;
      inlineMapLayer = res.layer;
    }

    function renderFullMapView() {
      const res = populateLeafletMap('fullTripsMap', fullMapInstance, fullMapLayer, allTrips);
      fullMapInstance = res.map;
      fullMapLayer = res.layer;

      const listEl = document.getElementById('mapTripsList');
      if (!listEl) return;
      listEl.replaceChildren();

      if (allTrips.length === 0) {
        const li = document.createElement('li');
        li.className = 'comments-empty';
        li.textContent = 'لا توجد رحلات مضافة بعد، كن أول من يوثق مساره!';
        listEl.appendChild(li);
        return;
      }

      for (const trip of allTrips) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-trip-item';

        const copy = document.createElement('div');
        const t = document.createElement('span');
        t.className = 'map-trip-item-title';
        t.textContent = trip.title;
        const m = document.createElement('span');
        m.className = 'map-trip-item-meta';
        m.textContent = `${trip.location} · ${formatNum(trip.distanceKm, 1)} كم`;
        copy.append(t, m);

        const linkSpan = document.createElement('span');
        linkSpan.className = 'map-trip-link';
        linkSpan.textContent = 'عرض';
        btn.append(copy, linkSpan);

        btn.addEventListener('click', () => {
          if (fullMapInstance && Number.isFinite(Number(trip.startLat))) {
            fullMapInstance.setView([Number(trip.startLat), Number(trip.startLng)], 12, {
              animate: true,
            });
          }
        });
        li.appendChild(btn);
        listEl.appendChild(li);
      }
    }

    function renderAnalyticsView() {
      const grid = document.getElementById('analyticsGrid');
      if (!grid) return;
      grid.replaceChildren();

      if (allTrips.length === 0) {
        const card = document.createElement('article');
        card.className = 'surface-card';
        const title = document.createElement('h2');
        title.className = 'card-section-title';
        title.textContent = 'لا توجد بيانات إحصائية بعد';
        const sub = document.createElement('p');
        sub.className = 'card-section-subtitle';
        sub.textContent = 'لا توجد رحلات مضافة بعد، كن أول من يوثق مساره!';
        card.append(title, sub);
        grid.appendChild(card);
        return;
      }

      // Card 1: Difficulty Breakdown
      const diffCard = document.createElement('article');
      diffCard.className = 'surface-card';
      const diffH2 = document.createElement('h2');
      diffH2.className = 'card-section-title';
      diffH2.textContent = 'توزيع الرحلات حسب الصعوبة';
      const barsWrap = document.createElement('div');
      barsWrap.className = 'analytics-bars';

      for (const level of ['سهل', 'متوسط', 'صعب']) {
        const count = allTrips.filter((t) => t.difficulty === level).length;
        const pct = Math.round((count / allTrips.length) * 100);
        const row = document.createElement('div');
        const head = document.createElement('div');
        head.className = 'bar-row-head';
        const lSpan = document.createElement('span');
        lSpan.textContent = level;
        const vSpan = document.createElement('strong');
        vSpan.textContent = `${formatNum(count)} (${formatNum(pct)}%)`;
        head.append(lSpan, vSpan);

        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = `${pct}%`;
        track.appendChild(fill);

        row.append(head, track);
        barsWrap.appendChild(row);
      }
      diffCard.append(diffH2, barsWrap);

      // Card 2: Records & Highlights
      const highCard = document.createElement('article');
      highCard.className = 'surface-card';
      const highH2 = document.createElement('h2');
      highH2.className = 'card-section-title';
      highH2.textContent = 'أبرز الأرقام القياسية';
      const ul = document.createElement('ul');
      ul.className = 'highlights-list';

      const longest = [...allTrips].sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0];
      const highest = [...allTrips].sort((a, b) => (b.maxElevationM || 0) - (a.maxElevationM || 0))[0];
      const avgDist = computeSummaryStats(allTrips).totalKm / allTrips.length;

      const items = [
        ['أطول مسار', `${longest.title} (${formatNum(longest.distanceKm, 1)} كم)`],
        ['أعلى قمة مسجّلة', `${highest.title} (${formatNum(highest.maxElevationM)} m)`],
        ['متوسط مسافة الرحلة', `${formatNum(avgDist, 1)} كم`],
      ];

      for (const [label, val] of items) {
        const li = document.createElement('li');
        li.className = 'highlights-item';
        const l = document.createElement('span');
        l.className = 'highlights-label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'highlights-val';
        v.textContent = val;
        li.append(l, v);
        ul.appendChild(li);
      }
      highCard.append(highH2, ul);
      grid.append(diffCard, highCard);
    }

    // Re-render card moderation buttons when auth state changes
    onAuthReady(() => {
      renderTripsFeed();
    });

    const tripsQuery = query(collection(db, 'trips'), orderBy('createdAt', 'desc'));
    onSnapshot(
      tripsQuery,
      (snapshot) => {
        if (loadingState) loadingState.hidden = true;
        allTrips = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        updateSummaryAndHero();
        renderTripsFeed();
      },
      (error) => {
        if (loadingState) loadingState.hidden = true;
        handleFirestoreError(error, OperationType.LIST, 'trips');
      }
    );
  }

  /* ==========================================================================
     PAGE 2: Trip Details (trip-details.html)
     ========================================================================== */

  function initDetailsPage() {
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get('id')?.trim();

    const statusBox = document.getElementById('detailStatusBox');
    const statusTitle = document.getElementById('detailStatusTitle');
    const statusDesc = document.getElementById('detailStatusDesc');
    const backHomeBtn = document.getElementById('detailBackHomeBtn');
    const contentWrap = document.getElementById('detailContentWrap');

    function showNotFound(message = 'لم نتمكن من العثور على هذه الرحلة.') {
      if (contentWrap) contentWrap.hidden = true;
      if (statusBox) statusBox.hidden = false;
      if (statusTitle) statusTitle.textContent = 'الرحلة غير موجودة';
      if (statusDesc) statusDesc.textContent = message;
      if (backHomeBtn) backHomeBtn.hidden = false;
    }

    if (!tripId || !/^[a-zA-Z0-9_-]{1,128}$/.test(tripId)) {
      showNotFound('معرّف الرحلة غير صالح أو مفقود في الرابط.');
      return;
    }

    let currentTrip = null;
    let trailMap = null;
    let trailLayer = null;
    let routeBounds = null;
    let commentsUnsub = null;

    function renderElevationSvg(profile, distanceKm) {
      const svg = document.getElementById('elevationSvg');
      const readout = document.getElementById('elevationHoverReadout');
      if (!svg) return;
      const pts = Array.isArray(profile) && profile.length >= 2 ? profile : [{ km: 0, m: 0 }, { km: distanceKm || 1, m: 0 }];

      const W = 560;
      const H = 220;
      const padLeft = 24;
      const padRight = 72;
      const padTop = 20;
      const padBottom = 34;
      const plotW = W - padLeft - padRight;
      const plotH = H - padTop - padBottom;

      const maxKm = Math.max(0.1, Number(pts[pts.length - 1].km) || Number(distanceKm) || 1);
      const elevations = pts.map((p) => Number(p.m) || 0);
      const minElev = Math.min(...elevations);
      const maxElev = Math.max(...elevations);
      const span = Math.max(20, maxElev - minElev);

      const coords = pts.map((p) => {
        const km = Number(p.km) || 0;
        const m = Number(p.m) || 0;
        const x = padLeft + (km / maxKm) * plotW;
        const y = padTop + (1 - (m - minElev) / span) * plotH;
        return { x, y, km, m };
      });

      const ns = 'http://www.w3.org/2000/svg';
      svg.replaceChildren();

      const defs = document.createElementNS(ns, 'defs');
      const grad = document.createElementNS(ns, 'linearGradient');
      grad.setAttribute('id', 'darbElevGrad');
      grad.setAttribute('x1', '0');
      grad.setAttribute('y1', '0');
      grad.setAttribute('x2', '0');
      grad.setAttribute('y2', '1');
      const s1 = document.createElementNS(ns, 'stop');
      s1.setAttribute('offset', '0%');
      s1.setAttribute('stop-color', '#234736');
      s1.setAttribute('stop-opacity', '0.32');
      const s2 = document.createElementNS(ns, 'stop');
      s2.setAttribute('offset', '100%');
      s2.setAttribute('stop-color', '#234736');
      s2.setAttribute('stop-opacity', '0.02');
      grad.append(s1, s2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      // Horizontal grid lines + right Y-axis ticks (Western numerals)
      for (let i = 0; i <= 3; i += 1) {
        const y = padTop + (i / 3) * plotH;
        const val = Math.round(maxElev - (i / 3) * span);
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(padLeft));
        line.setAttribute('x2', String(W - padRight));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', '#e2e8e2');
        line.setAttribute('stroke-dasharray', '4 4');
        svg.appendChild(line);

        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', String(W - padRight + 10));
        label.setAttribute('y', String(y + 4));
        label.setAttribute('fill', '#66756b');
        label.setAttribute('font-size', '11');
        label.setAttribute('text-anchor', 'start');
        label.textContent = `${formatNum(val)} m`;
        svg.appendChild(label);
      }

      const linePathD = coords
        .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(' ');
      const areaPathD = `${linePathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

      const areaPath = document.createElementNS(ns, 'path');
      areaPath.setAttribute('d', areaPathD);
      areaPath.setAttribute('fill', 'url(#darbElevGrad)');
      svg.appendChild(areaPath);

      const strokePath = document.createElementNS(ns, 'path');
      strokePath.setAttribute('d', linePathD);
      strokePath.setAttribute('fill', 'none');
      strokePath.setAttribute('stroke', '#234736');
      strokePath.setAttribute('stroke-width', '2.5');
      strokePath.setAttribute('stroke-linecap', 'round');
      strokePath.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(strokePath);

      // X-axis distance labels (start, mid, end)
      for (const frac of [0, 0.5, 1]) {
        const x = padLeft + frac * plotW;
        const kmVal = Math.round(frac * maxKm * 10) / 10;
        const xText = document.createElementNS(ns, 'text');
        xText.setAttribute('x', String(x));
        xText.setAttribute('y', String(H - 10));
        xText.setAttribute('fill', '#66756b');
        xText.setAttribute('font-size', '11');
        xText.setAttribute('text-anchor', frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle');
        xText.textContent = `${formatNum(kmVal, 1)} km`;
        svg.appendChild(xText);
      }

      const hoverDot = document.createElementNS(ns, 'circle');
      hoverDot.setAttribute('r', '5');
      hoverDot.setAttribute('fill', '#234736');
      hoverDot.setAttribute('stroke', '#ffffff');
      hoverDot.setAttribute('stroke-width', '2');
      hoverDot.setAttribute('visibility', 'hidden');
      svg.appendChild(hoverDot);

      svg.onmousemove = (event) => {
        const rect = svg.getBoundingClientRect();
        const relX = ((event.clientX - rect.left) / rect.width) * W;
        let closest = coords[0];
        let bestDist = Infinity;
        for (const c of coords) {
          const d = Math.abs(c.x - relX);
          if (d < bestDist) {
            bestDist = d;
            closest = c;
          }
        }
        hoverDot.setAttribute('cx', String(closest.x));
        hoverDot.setAttribute('cy', String(closest.y));
        hoverDot.setAttribute('visibility', 'visible');
        if (readout) {
          readout.textContent = `المسافة: ${formatNum(closest.km, 1)} km · الارتفاع: ${formatNum(closest.m)} m`;
        }
      };

      svg.onmouseleave = () => {
        hoverDot.setAttribute('visibility', 'hidden');
        if (readout) {
          readout.textContent = 'حرّك المؤشر فوق المنحنى لاستعراض الارتفاع عند كل مسافة';
        }
      };
    }

    function renderTrailMap(trip) {
      if (typeof window.L === 'undefined') return;
      const mapEl = document.getElementById('trailMap');
      if (!mapEl) return;

      const coords = (Array.isArray(trip.routePoints) ? trip.routePoints : [])
        .map((p) => [Number(p.lat ?? p[0]), Number(p.lng ?? p[1])])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      if (coords.length === 0) return;

      if (!trailMap) {
        trailMap = window.L.map(mapEl, { scrollWheelZoom: false }).setView(coords[0], 13);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(trailMap);
        trailLayer = window.L.layerGroup().addTo(trailMap);
      }

      trailLayer.clearLayers();
      const poly = window.L.polyline(coords, {
        color: '#234736',
        weight: 4,
        opacity: 0.92,
      }).addTo(trailLayer);

      window.L.circleMarker(coords[0], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#234736',
        fillOpacity: 1,
      })
        .bindTooltip('نقطة البداية')
        .addTo(trailLayer);

      window.L.circleMarker(coords[coords.length - 1], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#b85d28',
        fillOpacity: 1,
      })
        .bindTooltip('نقطة الوصول')
        .addTo(trailLayer);

      routeBounds = poly.getBounds();
      window.setTimeout(() => {
        trailMap.invalidateSize();
        trailMap.fitBounds(routeBounds, { padding: [32, 32] });
      }, 80);
    }

    function updateDetailsPermissionUI() {
      if (!currentTrip) return;
      const deleteBtn = document.getElementById('detailDeleteBtn');
      const editNotesBtn = document.getElementById('editNotesBtn');
      const commentForm = document.getElementById('commentForm');
      const commentAuthPrompt = document.getElementById('commentAuthPrompt');

      if (deleteBtn) deleteBtn.hidden = !canDeleteTrip(currentTrip, state.userProfile);
      if (editNotesBtn) editNotesBtn.hidden = !canEditNotes(currentTrip, state.userProfile);

      const canComment = Boolean(state.userProfile && !state.userProfile.isBanned);
      if (commentForm) commentForm.hidden = !canComment;
      if (commentAuthPrompt) {
        commentAuthPrompt.hidden = canComment;
        if (state.userProfile?.isBanned) {
          commentAuthPrompt.firstElementChild.textContent =
            'تم تعليق حسابك ولا يمكنك إضافة تعليقات جديدة.';
        }
      }
    }

    function renderTripDetails(trip) {
      currentTrip = trip;
      document.title = `${trip.title} — درب`;

      if (statusBox) statusBox.hidden = true;
      if (contentWrap) contentWrap.hidden = false;

      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('breadcrumbRegion', trip.region || trip.location);
      setText('breadcrumbTitle', trip.title);
      setText('detailDifficultyBadge', getDifficultyMeta(trip.difficulty).label);
      setText('detailAuthorLine', `موثّقة بواسطة ${trip.authorName || 'رحّالة درب'}`);
      setText('detailTitle', trip.title);
      setText('detailLocation', trip.location);
      setText('detailDate', formatIsoDate(trip.dateIso));

      const coverUrl = sanitizeMediaUrl(trip.coverImageUrl, DEFAULT_HERO_IMAGE);
      const heroImg = document.getElementById('detailHeroImage');
      if (heroImg) {
        heroImg.src = coverUrl;
        heroImg.alt = trip.title;
      }

      setText('detailDistance', `${formatNum(trip.distanceKm, 1)} km`);
      setText('detailDuration', formatHours(trip.durationHours));
      setText('detailMaxElevation', `${formatNum(trip.maxElevationM)} m`);
      setText('detailDifficultyStat', getDifficultyMeta(trip.difficulty).label);

      const latStr = Number(trip.startLat).toFixed(5);
      const lngStr = Number(trip.startLng).toFixed(5);
      setText('detailCoordsText', `نقطة البداية: ${latStr}, ${lngStr}`);

      const gmapsBtn = document.getElementById('googleMapsBtn');
      if (gmapsBtn) {
        gmapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latStr},${lngStr}`)}`;
      }

      const elevMetrics = computeElevationMetrics(trip.elevationProfile, trip.distanceKm);
      setText('elevationGainBadge', `+${formatNum(trip.elevationGainM ?? elevMetrics.gain)} m`);
      setText('elevMinVal', `${formatNum(trip.minElevationM ?? elevMetrics.min)} m`);
      setText('elevMaxVal', `${formatNum(trip.maxElevationM ?? elevMetrics.max)} m`);
      setText('elevGradeVal', `${formatNum(elevMetrics.avgGradePct, 1)}%`);

      renderElevationSvg(trip.elevationProfile, trip.distanceKm);
      renderTrailMap(trip);

      const notesDisplay = document.getElementById('fieldNotesDisplay');
      if (notesDisplay) {
        notesDisplay.textContent =
          trip.notes && trip.notes.trim()
            ? trip.notes
            : 'لم يُضف صاحب الرحلة مذكرات ميدانية مفصّلة بعد.';
      }

      // Quick Facts List
      const factsList = document.getElementById('trailFactsList');
      if (factsList) {
        factsList.replaceChildren();
        const facts = [
          ['المنطقة', trip.region || trip.location],
          ['التاريخ', formatIsoDate(trip.dateIso)],
          ['الكاتب', trip.authorName || 'رحّالة درب'],
          ['الارتفاع المكتسب', `+${formatNum(trip.elevationGainM)} m`],
          ['نقاط المسار', `${formatNum((trip.routePoints || []).length)} نقطة`],
          ['ملف GPX', trip.gpxFileName || 'متاح للتحميل الفوري'],
        ];
        for (const [k, v] of facts) {
          const row = document.createElement('div');
          row.className = 'fact-row';
          const dt = document.createElement('dt');
          dt.textContent = k;
          const dd = document.createElement('dd');
          dd.textContent = v;
          row.append(dt, dd);
          factsList.appendChild(row);
        }
      }

      // Gallery (Cover Image + Lightbox)
      const galleryGrid = document.getElementById('tripGalleryGrid');
      const galleryCount = document.getElementById('galleryCount');
      if (galleryGrid) {
        galleryGrid.replaceChildren();
        const galleryItems = [{ url: coverUrl, caption: `${trip.title} — ${trip.location}` }];
        if (galleryCount) galleryCount.textContent = `${formatNum(galleryItems.length)} صورة`;

        for (const item of galleryItems) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'gallery-item-btn';
          const gImg = document.createElement('img');
          gImg.className = 'gallery-item-img';
          gImg.src = item.url;
          gImg.alt = item.caption;
          gImg.referrerPolicy = 'no-referrer';
          const cap = document.createElement('span');
          cap.className = 'gallery-item-caption';
          cap.textContent = item.caption;
          btn.append(gImg, cap);
          btn.addEventListener('click', () => {
            const lb = document.getElementById('photoLightbox');
            const lbImg = document.getElementById('lightboxImage');
            const lbCap = document.getElementById('lightboxCaption');
            if (lbImg) {
              lbImg.src = item.url;
              lbImg.alt = item.caption;
            }
            if (lbCap) lbCap.textContent = item.caption;
            lb?.showModal();
          });
          galleryGrid.appendChild(btn);
        }
      }

      updateDetailsPermissionUI();
    }

    // Action Handlers
    document.getElementById('closeLightboxBtn')?.addEventListener('click', () => {
      document.getElementById('photoLightbox')?.close();
    });

    document.getElementById('recenterMapBtn')?.addEventListener('click', () => {
      if (trailMap && routeBounds) {
        trailMap.fitBounds(routeBounds, { padding: [32, 32] });
      }
    });

    document.getElementById('copyCoordsBtn')?.addEventListener('click', async () => {
      if (!currentTrip) return;
      const coordsText = `${Number(currentTrip.startLat).toFixed(5)}, ${Number(currentTrip.startLng).toFixed(5)}`;
      try {
        await navigator.clipboard.writeText(coordsText);
        showToast('تم نسخ إحداثيات نقطة البداية.');
      } catch {
        showToast(`الإحداثيات: ${coordsText}`);
      }
    });

    document.getElementById('downloadGpxBtn')?.addEventListener('click', () => {
      if (!currentTrip) return;
      if (currentTrip.gpxUrl && sanitizeMediaUrl(currentTrip.gpxUrl, '') !== '') {
        const link = document.createElement('a');
        link.href = currentTrip.gpxUrl;
        link.download = currentTrip.gpxFileName || `${currentTrip.id}.gpx`;
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('بدأ تنزيل ملف GPX.');
        return;
      }
      const gpxXml = buildGpxXml(currentTrip);
      const blob = new Blob([gpxXml], { type: 'application/gpx+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = currentTrip.gpxFileName || `darb-${currentTrip.id}.gpx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      showToast('تم تصدير وتنزيل ملف GPX بنجاح.');
    });

    document.getElementById('detailDeleteBtn')?.addEventListener('click', async () => {
      if (!currentTrip || !canDeleteTrip(currentTrip, state.userProfile)) return;
      const ok = await openConfirmDialog({
        title: 'تأكيد حذف الرحلة',
        message: `هل أنت متأكد من حذف رحلة «${currentTrip.title}» نهائياً؟`,
      });
      if (!ok) return;
      try {
        await deleteDoc(doc(db, 'trips', currentTrip.id));
        showToast('تم حذف الرحلة بنجاح.');
        window.location.href = './index.html';
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `trips/${currentTrip.id}`);
      }
    });

    // Editable Field Notes
    const editNotesBtn = document.getElementById('editNotesBtn');
    const fieldNotesDisplay = document.getElementById('fieldNotesDisplay');
    const fieldNotesForm = document.getElementById('fieldNotesForm');
    const fieldNotesTextarea = document.getElementById('fieldNotesTextarea');
    const cancelEditNotesBtn = document.getElementById('cancelEditNotesBtn');

    editNotesBtn?.addEventListener('click', () => {
      if (!currentTrip) return;
      if (fieldNotesTextarea) fieldNotesTextarea.value = currentTrip.notes || '';
      if (fieldNotesDisplay) fieldNotesDisplay.hidden = true;
      if (fieldNotesForm) fieldNotesForm.hidden = false;
    });

    cancelEditNotesBtn?.addEventListener('click', () => {
      if (fieldNotesForm) fieldNotesForm.hidden = true;
      if (fieldNotesDisplay) fieldNotesDisplay.hidden = false;
    });

    fieldNotesForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTrip || !canEditNotes(currentTrip, state.userProfile)) return;
      const nextNotes = String(fieldNotesTextarea?.value || '').trim();
      if (nextNotes.length > 4000) {
        showToast('المذكرة طويلة جداً (الحد الأقصى 4000 حرف).');
        return;
      }
      try {
        await updateDoc(doc(db, 'trips', currentTrip.id), { notes: nextNotes });
        if (fieldNotesForm) fieldNotesForm.hidden = true;
        if (fieldNotesDisplay) fieldNotesDisplay.hidden = false;
        showToast('تم حفظ تعديلات المذكرة بنجاح.');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `trips/${currentTrip.id}`);
      }
    });

    // Comments Subcollection
    const commentsListEl = document.getElementById('commentsList');
    const commentsCountEl = document.getElementById('commentsCount');
    const commentsEmptyEl = document.getElementById('commentsEmptyNote');
    const commentForm = document.getElementById('commentForm');
    const commentTextInput = document.getElementById('commentTextInput');
    const commentErrorBanner = document.getElementById('commentErrorBanner');
    let latestComments = [];

    function renderComments() {
      if (!commentsListEl) return;
      commentsListEl.replaceChildren();
      if (commentsCountEl) {
        commentsCountEl.textContent = `${formatNum(latestComments.length)} تعليقات`;
      }
      if (commentsEmptyEl) commentsEmptyEl.hidden = latestComments.length > 0;

      for (const comment of latestComments) {
        const li = document.createElement('li');
        li.className = 'comment-item';

        const head = document.createElement('div');
        head.className = 'comment-item-head';

        const authorWrap = document.createElement('div');
        authorWrap.className = 'comment-author-wrap';
        const avatar = document.createElement('span');
        avatar.className = 'comment-avatar';
        avatar.textContent = (comment.authorName || 'ر').trim().charAt(0);
        const info = document.createElement('div');
        const nameEl = document.createElement('p');
        nameEl.className = 'comment-author';
        nameEl.textContent = comment.authorName || 'رحّالة درب';
        const dateEl = document.createElement('span');
        dateEl.className = 'comment-date';
        dateEl.textContent = formatTimestampDate(comment.createdAt) || 'الآن';
        info.append(nameEl, dateEl);
        authorWrap.append(avatar, info);

        head.appendChild(authorWrap);

        if (canDeleteComment(comment, currentTrip, state.userProfile)) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'comment-delete-btn';
          delBtn.textContent = 'حذف';
          delBtn.addEventListener('click', async () => {
            try {
              await deleteDoc(doc(db, 'trips', tripId, 'comments', comment.id));
              showToast('تم حذف التعليق.');
            } catch (error) {
              handleFirestoreError(
                error,
                OperationType.DELETE,
                `trips/${tripId}/comments/${comment.id}`
              );
            }
          });
          head.appendChild(delBtn);
        }

        const textP = document.createElement('p');
        textP.className = 'comment-text';
        textP.textContent = comment.text;

        li.append(head, textP);
        commentsListEl.appendChild(li);
      }
    }

    commentForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (commentErrorBanner) commentErrorBanner.hidden = true;
      if (!state.userProfile || state.userProfile.isBanned) {
        showToast('لا تملك صلاحية إضافة تعليق.');
        return;
      }
      const text = String(commentTextInput?.value || '').trim();
      const validation = validateCommentInput({ text });
      if (!validation.valid) {
        if (commentErrorBanner) {
          commentErrorBanner.textContent = validation.errors[0];
          commentErrorBanner.hidden = false;
        }
        return;
      }

      const submitBtn = document.getElementById('submitCommentBtn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await addDoc(collection(db, 'trips', tripId, 'comments'), {
          tripId,
          authorUid: state.userProfile.uid,
          authorName: state.userProfile.name.slice(0, 80),
          text,
          createdAt: serverTimestamp(),
        });
        if (commentTextInput) commentTextInput.value = '';
        showToast('تم إضافة تعليقك بنجاح.');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `trips/${tripId}/comments`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    onAuthReady(() => {
      updateDetailsPermissionUI();
      renderComments();
    });

    // Live Trip Subscription
    onSnapshot(
      doc(db, 'trips', tripId),
      (snap) => {
        if (!snap.exists()) {
          showNotFound('هذه الرحلة غير موجودة أو تم حذفها.');
          if (commentsUnsub) commentsUnsub();
          return;
        }
        renderTripDetails({ id: snap.id, ...snap.data() });
        if (!commentsUnsub) {
          const cQuery = query(
            collection(db, 'trips', tripId, 'comments'),
            orderBy('createdAt', 'desc')
          );
          commentsUnsub = onSnapshot(
            cQuery,
            (cSnap) => {
              latestComments = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              renderComments();
            },
            (error) => {
              handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/comments`);
            }
          );
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `trips/${tripId}`);
      }
    );
  }

  /* ==========================================================================
     PAGE 3: Add New Trip (add-trip.html)
     ========================================================================== */

  function initAddTripPage() {
    const guardBox = document.getElementById('addTripGuardBox');
    const guardTitle = document.getElementById('addTripGuardTitle');
    const guardDesc = document.getElementById('addTripGuardDesc');
    const guardLoginLink = document.getElementById('addTripGuardLoginLink');
    const workspace = document.getElementById('addTripWorkspace');

    const form = document.getElementById('addTripForm');
    const errorBanner = document.getElementById('formErrorBanner');
    const submitBtn = document.getElementById('submitTripBtn');
    const dateInput = document.getElementById('tripDateInput');

    const coverInput = document.getElementById('tripCoverInput');
    const coverDropzone = document.getElementById('coverDropzone');
    const coverPlaceholder = document.getElementById('coverUploadPlaceholder');
    const coverPreviewBox = document.getElementById('coverPreviewBox');
    const coverPreviewImg = document.getElementById('coverPreviewImg');
    const coverFileNameEl = document.getElementById('coverFileName');
    const removeCoverBtn = document.getElementById('removeCoverBtn');

    const gpxInput = document.getElementById('tripGpxInput');
    const gpxUploadBar = document.getElementById('gpxUploadBar');
    const gpxTitle = document.getElementById('gpxUploadTitle');
    const gpxHint = document.getElementById('gpxUploadHint');
    const removeGpxBtn = document.getElementById('removeGpxBtn');

    let selectedCoverFile = null;
    let coverPreviewObjectUrl = '';
    let selectedGpxFile = null;
    let parsedGpxData = null;

    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    onAuthReady(({ firebaseUser, userProfile }) => {
      if (!firebaseUser || !userProfile) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'تسجيل الدخول مطلوب لتوثيق رحلة جديدة';
        if (guardDesc) guardDesc.textContent = 'سيتم توجيهك الآن إلى صفحة تسجيل الدخول...';
        if (guardLoginLink) {
          guardLoginLink.hidden = false;
          guardLoginLink.href = './auth.html?next=./add-trip.html';
        }
        window.setTimeout(() => {
          if (!state.firebaseUser) {
            window.location.replace('./auth.html?next=./add-trip.html');
          }
        }, 900);
        return;
      }

      if (userProfile.isBanned) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'تم تعليق هذا الحساب';
        if (guardDesc) {
          guardDesc.textContent = 'تم حظر حسابك من قِبل الإدارة ولا يمكنك إضافة رحلات جديدة.';
        }
        if (guardLoginLink) guardLoginLink.hidden = true;
        return;
      }

      if (guardBox) guardBox.hidden = true;
      if (workspace) workspace.hidden = false;
    });

    function showFormError(msg) {
      if (!errorBanner) return;
      errorBanner.textContent = msg;
      errorBanner.hidden = false;
      errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearFormError() {
      if (errorBanner) {
        errorBanner.textContent = '';
        errorBanner.hidden = true;
      }
    }

    function handleCoverSelection(file) {
      clearFormError();
      const check = validateImageFile(file);
      if (!check.valid) {
        showFormError(check.error);
        return;
      }
      selectedCoverFile = file;
      if (coverPreviewObjectUrl) URL.revokeObjectURL(coverPreviewObjectUrl);
      coverPreviewObjectUrl = URL.createObjectURL(file);
      if (coverPreviewImg) coverPreviewImg.src = coverPreviewObjectUrl;
      if (coverFileNameEl) coverFileNameEl.textContent = file.name;
      if (coverPlaceholder) coverPlaceholder.hidden = true;
      if (coverPreviewBox) coverPreviewBox.hidden = false;
    }

    coverInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleCoverSelection(file);
    });

    coverDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      coverDropzone.classList.add('is-dragover');
    });

    coverDropzone?.addEventListener('dragleave', () => {
      coverDropzone.classList.remove('is-dragover');
    });

    coverDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      coverDropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleCoverSelection(file);
    });

    removeCoverBtn?.addEventListener('click', () => {
      selectedCoverFile = null;
      if (coverPreviewObjectUrl) URL.revokeObjectURL(coverPreviewObjectUrl);
      coverPreviewObjectUrl = '';
      if (coverInput) coverInput.value = '';
      if (coverPreviewBox) coverPreviewBox.hidden = true;
      if (coverPlaceholder) coverPlaceholder.hidden = false;
    });

    gpxInput?.addEventListener('change', async (e) => {
      clearFormError();
      const file = e.target.files?.[0];
      if (!file) return;
      const check = validateGpxFile(file);
      if (!check.valid) {
        showFormError(check.error);
        gpxInput.value = '';
        return;
      }
      try {
        const xmlText = await file.text();
        const parsed = parseGpxXml(xmlText);
        if (!parsed.valid) {
          showFormError(parsed.error);
          gpxInput.value = '';
          return;
        }
        selectedGpxFile = file;
        parsedGpxData = parsed;
        gpxUploadBar?.classList.add('has-file');
        if (gpxTitle) gpxTitle.textContent = file.name;
        if (gpxHint) {
          gpxHint.textContent = `تمت قراءة ${formatNum(parsed.pointCount)} نقطة · ${formatNum(parsed.distanceKm, 1)} km · +${formatNum(parsed.elevationGainM)} m`;
        }
        if (removeGpxBtn) removeGpxBtn.hidden = false;

        const distField = document.getElementById('tripDistanceInput');
        const elevField = document.getElementById('tripElevationInput');
        if (distField && !distField.value) distField.value = String(parsed.distanceKm);
        if (elevField && !elevField.value) elevField.value = String(parsed.elevationGainM);
        showToast('تم تحليل ملف GPX وتعبئة بيانات المسار.');
      } catch {
        showFormError('تعذّرت قراءة ملف GPX. تأكد من سلامة الملف.');
      }
    });

    removeGpxBtn?.addEventListener('click', () => {
      selectedGpxFile = null;
      parsedGpxData = null;
      if (gpxInput) gpxInput.value = '';
      gpxUploadBar?.classList.remove('has-file');
      if (gpxTitle) gpxTitle.textContent = 'أضف مسار الرحلة GPX';
      if (gpxHint) gpxHint.textContent = 'اختياري · ارفع ملف .gpx لعرض المسار وملف الارتفاعات تلقائياً';
      if (removeGpxBtn) removeGpxBtn.hidden = true;
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      if (!state.userProfile || state.userProfile.isBanned) {
        showFormError('لا تملك صلاحية إضافة رحلة بحسابك الحالي.');
        return;
      }

      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      const location = String(fd.get('location') || '').trim();
      const dateIso = String(fd.get('date') || '').trim();
      const distanceKm = Number(fd.get('distanceKm'));
      const durationHours = Number(fd.get('durationHours'));
      const elevationGainRaw = fd.get('elevationGainM');
      const elevationGainM =
        elevationGainRaw === '' || elevationGainRaw === null ? 0 : Number(elevationGainRaw);
      const difficulty = String(fd.get('difficulty') || 'متوسط').trim();
      const notes = String(fd.get('notes') || '').trim();

      const validation = validateTripInput({
        title,
        location,
        dateIso,
        distanceKm,
        durationHours,
        elevationGainM,
        difficulty,
        notes,
      });

      if (!validation.valid) {
        showFormError(validation.errors[0]);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري حفظ الرحلة...';
      }

      try {
        let coverImageUrl = DEFAULT_HERO_IMAGE;
        if (selectedCoverFile) {
          const safeFileName = selectedCoverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          try {
            coverImageUrl = await uploadFileToStorage(
              `trips/${state.userProfile.uid}/covers/${Date.now()}-${safeFileName}`,
              selectedCoverFile
            );
          } catch {
            // Fallback to compressed data URL when Firebase Storage bucket is not yet active
            coverImageUrl = await compressImageToDataUrl(selectedCoverFile);
          }
        }

        let gpxUrl = '';
        if (selectedGpxFile) {
          const safeGpxName = selectedGpxFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          try {
            gpxUrl = await uploadFileToStorage(
              `trips/${state.userProfile.uid}/gpx/${Date.now()}-${safeGpxName}`,
              selectedGpxFile
            );
          } catch {
            gpxUrl = '';
          }
        }

        const trail = parsedGpxData || buildDefaultTrailData(distanceKm, elevationGainM);
        const region = location.split(/[،,]/)[0].trim().slice(0, 60) || location.slice(0, 60);
        const year = Number(dateIso.slice(0, 4));

        const payload = {
          title,
          location,
          region,
          dateIso,
          year,
          difficulty,
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationHours: Math.round(durationHours * 10) / 10,
          elevationGainM: Math.round(elevationGainM),
          maxElevationM: Math.round(trail.maxElevationM),
          minElevationM: Math.round(trail.minElevationM),
          notes,
          coverImageUrl,
          startLat: Number(trail.startLat),
          startLng: Number(trail.startLng),
          routePoints: trail.routePoints,
          elevationProfile: trail.elevationProfile,
          authorUid: state.userProfile.uid,
          authorName: state.userProfile.name.slice(0, 80),
          createdAt: serverTimestamp(),
        };

        if (gpxUrl && gpxUrl.length <= 2000) {
          payload.gpxUrl = gpxUrl;
        }
        if (selectedGpxFile?.name) {
          payload.gpxFileName = selectedGpxFile.name.slice(0, 160);
        }

        const createdRef = await addDoc(collection(db, 'trips'), payload);
        showToast('تم حفظ ونشر رحلتك بنجاح!');
        window.location.href = `./trip-details.html?id=${encodeURIComponent(createdRef.id)}`;
      } catch (error) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'حفظ الرحلة ونشرها';
        }
        showFormError('حدث خطأ أثناء حفظ الرحلة. تأكد من صلاحية حسابك وحاول مجدداً.');
        handleFirestoreError(error, OperationType.CREATE, 'trips');
      }
    });
  }

  /* ==========================================================================
     PAGE 4: Authentication (auth.html)
     ========================================================================== */

  function initAuthPage() {
    const params = new URLSearchParams(window.location.search);
    const nextUrl = sanitizeRelativeRedirect(params.get('next'), './index.html');

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authHeading = document.getElementById('authHeading');
    const authSubtitle = document.getElementById('authSubtitle');
    const errorBanner = document.getElementById('authErrorBanner');
    const googleBtn = document.getElementById('googleSignInBtn');

    let submitting = false;

    function showAuthError(msg) {
      if (!errorBanner) return;
      errorBanner.textContent = msg;
      errorBanner.hidden = false;
    }

    function clearAuthError() {
      if (!errorBanner) return;
      errorBanner.textContent = '';
      errorBanner.hidden = true;
    }

    function switchMode(mode) {
      clearAuthError();
      const isLogin = mode === 'login';
      tabLogin?.classList.toggle('is-active', isLogin);
      tabLogin?.setAttribute('aria-selected', String(isLogin));
      tabRegister?.classList.toggle('is-active', !isLogin);
      tabRegister?.setAttribute('aria-selected', String(!isLogin));
      if (loginForm) loginForm.hidden = !isLogin;
      if (registerForm) registerForm.hidden = isLogin;
      if (authHeading) {
        authHeading.textContent = isLogin ? 'أهلاً بعودتك إلى درب' : 'انضم إلى مجتمع درب';
      }
      if (authSubtitle) {
        authSubtitle.textContent = isLogin
          ? 'سجّل دخولك لتوثيق مساراتك الجبلية وحفظ ملفات GPX الخاصة بك.'
          : 'أنشئ حساباً جديداً لتبدأ بحفظ رحلاتك ومساراتك في الطبيعة.';
      }
    }

    tabLogin?.addEventListener('click', () => switchMode('login'));
    tabRegister?.addEventListener('click', () => switchMode('register'));

    onAuthReady(({ firebaseUser, userProfile }) => {
      if (submitting || !firebaseUser || !userProfile) return;
      if (userProfile.isBanned) {
        signOut(auth).catch(() => {});
        showAuthError('تم حظر هذا الحساب من قِبل الإدارة ولا يمكنك تسجيل الدخول.');
        return;
      }
      window.location.replace(nextUrl);
    });

    async function completeAuthCheck(fbUser, preferredName = '') {
      const profile = await syncUserProfile(fbUser, preferredName);
      if (profile.isBanned) {
        await signOut(auth);
        showAuthError('تم حظر هذا الحساب من قِبل الإدارة ولا يمكنك تسجيل الدخول أو نشر رحلات.');
        return;
      }
      showToast(`مرحباً بك، ${profile.name}!`);
      window.location.replace(nextUrl);
    }

    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      const email = String(document.getElementById('loginEmail')?.value || '').trim();
      const password = String(document.getElementById('loginPassword')?.value || '');
      if (!email || !password) {
        showAuthError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
        return;
      }

      const btn = document.getElementById('loginSubmitBtn');
      submitting = true;
      if (btn) btn.disabled = true;

      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await completeAuthCheck(cred.user);
      } catch (error) {
        showAuthError(translateAuthError(error?.code));
      } finally {
        submitting = false;
        if (btn) btn.disabled = false;
      }
    });

    registerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      const name = String(document.getElementById('registerName')?.value || '').trim();
      const email = String(document.getElementById('registerEmail')?.value || '').trim();
      const password = String(document.getElementById('registerPassword')?.value || '');

      if (name.length < 2 || name.length > 80) {
        showAuthError('يرجى إدخال اسم كامل لا يقل عن حرفين.');
        return;
      }
      if (!email || !email.includes('@')) {
        showAuthError('يرجى إدخال بريد إلكتروني صحيح.');
        return;
      }
      if (password.length < 6) {
        showAuthError('كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.');
        return;
      }

      const btn = document.getElementById('registerSubmitBtn');
      submitting = true;
      if (btn) btn.disabled = true;

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await completeAuthCheck(cred.user, name);
      } catch (error) {
        showAuthError(translateAuthError(error?.code));
      } finally {
        submitting = false;
        if (btn) btn.disabled = false;
      }
    });

    googleBtn?.addEventListener('click', async () => {
      clearAuthError();
      submitting = true;
      googleBtn.disabled = true;
      try {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        await completeAuthCheck(cred.user);
      } catch (error) {
        showAuthError(translateAuthError(error?.code));
      } finally {
        submitting = false;
        googleBtn.disabled = false;
      }
    });
  }

  /* ==========================================================================
     PAGE 5: Super Admin Dashboard (admin.html)
     ========================================================================== */

  function initAdminPage() {
    const guardBox = document.getElementById('adminGuardBox');
    const guardTitle = document.getElementById('adminGuardTitle');
    const guardDesc = document.getElementById('adminGuardDesc');
    const guardHomeBtn = document.getElementById('adminGuardHomeBtn');
    const workspace = document.getElementById('adminWorkspace');

    const usersCountEl = document.getElementById('adminUsersCount');
    const bannedCountEl = document.getElementById('adminBannedCount');
    const tripsCountEl = document.getElementById('adminTripsCount');
    const totalKmEl = document.getElementById('adminTotalKm');

    const usersBody = document.getElementById('adminUsersTableBody');
    const usersEmpty = document.getElementById('adminUsersEmpty');
    const tripsBody = document.getElementById('adminTripsTableBody');
    const tripsEmpty = document.getElementById('adminTripsEmpty');

    let subscribed = false;

    function renderUsersTable(users) {
      if (!usersBody) return;
      usersBody.replaceChildren();
      if (usersCountEl) usersCountEl.textContent = formatNum(users.length);
      const bannedTotal = users.filter((u) => u.isBanned).length;
      if (bannedCountEl) bannedCountEl.textContent = formatNum(bannedTotal);
      if (usersEmpty) usersEmpty.hidden = users.length > 0;

      for (const u of users) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = u.name || '—';

        const tdEmail = document.createElement('td');
        tdEmail.textContent = u.email || '—';

        const tdRole = document.createElement('td');
        const roleBadge = document.createElement('span');
        roleBadge.className = u.role === 'superadmin' ? 'role-tag role-tag-admin' : 'role-tag';
        roleBadge.textContent = u.role === 'superadmin' ? 'مشرف عام' : 'مستخدم';
        tdRole.appendChild(roleBadge);

        const tdStatus = document.createElement('td');
        const statusPill = document.createElement('span');
        statusPill.className = u.isBanned ? 'status-pill status-pill-banned' : 'status-pill status-pill-active';
        statusPill.textContent = u.isBanned ? 'محظور' : 'نشط';
        tdStatus.appendChild(statusPill);

        const tdAction = document.createElement('td');
        if (u.uid === state.userProfile?.uid) {
          const selfTag = document.createElement('span');
          selfTag.className = 'role-tag';
          selfTag.textContent = 'حسابك الحالي';
          tdAction.appendChild(selfTag);
        } else {
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = u.isBanned ? 'btn btn-subtle' : 'btn btn-danger';
          toggleBtn.textContent = u.isBanned ? 'فك الحظر' : 'حظر الحساب';
          toggleBtn.addEventListener('click', async () => {
            const nextBanned = !u.isBanned;
            const ok = await openConfirmDialog({
              title: nextBanned ? 'تأكيد حظر الحساب' : 'تأكيد فك الحظر',
              message: nextBanned
                ? `هل تريد حظر المستخدم «${u.name}» ومنعه من تسجيل الدخول أو النشر؟`
                : `هل تريد إعادة تفعيل حساب «${u.name}»؟`,
              confirmLabel: nextBanned ? 'حظر الحساب' : 'فك الحظر',
            });
            if (!ok) return;
            try {
              await updateDoc(doc(db, 'users', u.uid), { isBanned: nextBanned });
              showToast(nextBanned ? 'تم حظر الحساب بنجاح.' : 'تم فك الحظر عن الحساب.');
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `users/${u.uid}`);
            }
          });
          tdAction.appendChild(toggleBtn);
        }

        tr.append(tdName, tdEmail, tdRole, tdStatus, tdAction);
        usersBody.appendChild(tr);
      }
    }

    function renderTripsTable(trips) {
      if (!tripsBody) return;
      tripsBody.replaceChildren();
      const stats = computeSummaryStats(trips);
      if (tripsCountEl) tripsCountEl.textContent = formatNum(stats.totalTrips);
      if (totalKmEl) totalKmEl.textContent = formatNum(stats.totalKm, 1);
      if (tripsEmpty) tripsEmpty.hidden = trips.length > 0;

      for (const trip of trips) {
        const tr = document.createElement('tr');

        const tdTitle = document.createElement('td');
        const link = document.createElement('a');
        link.className = 'text-link';
        link.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
        link.textContent = trip.title;
        tdTitle.appendChild(link);

        const tdAuthor = document.createElement('td');
        tdAuthor.textContent = trip.authorName || '—';

        const tdLoc = document.createElement('td');
        tdLoc.textContent = trip.location || '—';

        const tdDate = document.createElement('td');
        tdDate.textContent = formatIsoDate(trip.dateIso);

        const tdDist = document.createElement('td');
        tdDist.textContent = `${formatNum(trip.distanceKm, 1)} km`;

        const tdAction = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'table-actions';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.textContent = 'حذف';
        delBtn.addEventListener('click', async () => {
          const ok = await openConfirmDialog({
            title: 'حذف الرحلة نهائياً',
            message: `هل أنت متأكد من حذف رحلة «${trip.title}»؟`,
          });
          if (!ok) return;
          try {
            await deleteDoc(doc(db, 'trips', trip.id));
            showToast('تم حذف الرحلة من المنصة.');
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `trips/${trip.id}`);
          }
        });

        actions.appendChild(delBtn);
        tdAction.appendChild(actions);
        tr.append(tdTitle, tdAuthor, tdLoc, tdDate, tdDist, tdAction);
        tripsBody.appendChild(tr);
      }
    }

    onAuthReady(({ userProfile }) => {
      if (!isSuperAdminProfile(userProfile)) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'صلاحية الوصول محصورة بالمشرف العام';
        if (guardDesc) {
          guardDesc.textContent = 'يجب تسجيل الدخول بحساب المشرف العام (Super Admin) للوصول إلى هذه اللوحة.';
        }
        if (guardHomeBtn) guardHomeBtn.hidden = false;
        return;
      }

      if (guardBox) guardBox.hidden = true;
      if (workspace) workspace.hidden = false;

      if (subscribed) return;
      subscribed = true;

      onSnapshot(
        query(collection(db, 'users'), orderBy('createdAt', 'desc')),
        (snap) => {
          const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
          renderUsersTable(users);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
        }
      );

      onSnapshot(
        query(collection(db, 'trips'), orderBy('createdAt', 'desc')),
        (snap) => {
          const trips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          renderTripsTable(trips);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'trips');
        }
      );
    });
  }

  /* ---- Route Page Initialization ---- */

  if (page === 'dashboard') initDashboardPage();
  else if (page === 'details') initDetailsPage();
  else if (page === 'add-trip') initAddTripPage();
  else if (page === 'auth') initAuthPage();
  else if (page === 'admin') initAdminPage();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootstrapBrowserApp();
    });
  } else {
    bootstrapBrowserApp();
  }
}
