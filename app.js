/**
 * درب (Darb) — Complete Pure Vanilla JS Application Module
 * Firebase v10+ Modular CDN SDK (Auth, Firestore, Storage) + Leaflet.js
 * Strictly Western numerals (0-9), zero mock data, XSS-safe DOM rendering.
 */

const DEFAULT_HERO_IMAGE = '/src/assets/images/hero_alsoudah_mountains_1795369263890.jpg';
const DEFAULT_KSA_LAT = 23.8859;
const DEFAULT_KSA_LNG = 45.0792;
const THEME_STORAGE_KEY = 'darb_theme';

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
  سهل: { label: 'سهل', className: 'trip-badge--easy', markerFill: '#22c55e', markerStroke: '#15803d' },
  متوسط: { label: 'متوسط', className: 'trip-badge--moderate', markerFill: '#eab308', markerStroke: '#a16207' },
  صعب: { label: 'صعب', className: 'trip-badge--hard', markerFill: '#ef4444', markerStroke: '#b91c1c' },
};

const VALID_DIFFICULTIES = new Set(['سهل', 'متوسط', 'صعب']);
const VALID_ALERT_STATUSES = new Set([
  'الطريق سالك',
  'يوجد سيول/وحل',
  'يتطلب دفع رباعي',
  'مغلق للصيانة',
]);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GPX_BYTES = 10 * 1024 * 1024;
const MAX_FAVORITES = 200;

/* ============================================================================
   1. Pure Formatting, Badges, Leaderboard, Validation & GPX Logic
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

export function generateShortUserId(uid = '') {
  const src = String(uid || 'darb').trim();
  let hash = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  let val = hash >>> 0;
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[val % alphabet.length];
    val = Math.floor(val / alphabet.length) ^ ((src.charCodeAt(i % Math.max(1, src.length)) || 7) * 31);
    val = val >>> 0;
  }
  return `DRB-${code}`;
}

const CUSTOM_USER_ID_REGEX = /^[a-zA-Z0-9_\-\u0621-\u064A\u0660-\u0669]+$/;

/**
 * Validates a customizable User ID handle (alphanumeric, Arabic letters, _, -, 3..24 chars).
 * @param {string} raw
 */
export function validateCustomUserId(raw) {
  const value = String(raw || '').trim();
  if (value.length < 3 || value.length > 24) {
    return {
      valid: false,
      value,
      normalized: value.toLowerCase(),
      error: 'معرّف المستخدم يجب أن يكون بين 3 و 24 حرفاً.',
    };
  }
  if (!CUSTOM_USER_ID_REGEX.test(value)) {
    return {
      valid: false,
      value,
      normalized: value.toLowerCase(),
      error: 'يُسمح فقط بالأحرف الإنجليزية أو العربية والأرقام والرمزين (_) و (-) دون مسافات.',
    };
  }
  return {
    valid: true,
    value,
    normalized: value.toLowerCase(),
    error: '',
  };
}

/**
 * Produces a deterministic, case-insensitive, Firestore-path-safe document ID for /usernames/{handleKey}.
 * @param {string} rawUserId
 */
export function toHandleDocId(rawUserId) {
  const normalized = String(rawUserId || '').trim().toLowerCase();
  if (!normalized) return '';
  if (/^[a-z0-9_\-]+$/.test(normalized)) {
    return normalized;
  }
  const bytes = new TextEncoder().encode(normalized);
  let hex = 'u_';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.slice(0, 128);
}

/**
 * Checks case-insensitively whether a candidate User ID is already held by a different user.
 * @param {{ candidateUserId: string, currentUid: string, claimDoc?: { uid?: string, userId?: string } | null, allTrips?: Array<Record<string, any>> }} params
 */
export function isUserIdTakenByAnother({ candidateUserId, currentUid, claimDoc = null, allTrips = [] }) {
  const targetLower = String(candidateUserId || '').trim().toLowerCase();
  if (!targetLower) return false;

  if (claimDoc && claimDoc.uid && claimDoc.uid !== currentUid) {
    return true;
  }

  const trips = Array.isArray(allTrips) ? allTrips : [];
  for (const trip of trips) {
    const ownerUid = getTripOwnerUid(trip);
    if (!ownerUid || ownerUid === currentUid) continue;
    const ownerHandle = String(trip.authorUserId || generateShortUserId(ownerUid))
      .trim()
      .toLowerCase();
    if (ownerHandle === targetLower) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the Public Member Profile payload (display name, custom User ID, badges, summary stats, and member trips).
 * @param {string} uid
 * @param {Array<Record<string, any>>} allTrips
 * @param {{ uid?: string, name?: string, userId?: string } | null} [publicProfileDoc]
 * @param {{ name?: string, userId?: string }} [fallbackInfo]
 */
export function buildPublicMemberSummary(uid, allTrips, publicProfileDoc = null, fallbackInfo = {}) {
  const list = Array.isArray(allTrips) ? allTrips : [];
  const userTrips = list.filter((trip) => getTripOwnerUid(trip) === uid);
  const summary = computeSummaryStats(userTrips);
  const badges = getEarnedBadges(userTrips);
  const maxElevationGainM = userTrips.reduce(
    (max, t) => Math.max(max, Number(t.elevationGainM) || 0),
    0
  );

  const name =
    (publicProfileDoc && publicProfileDoc.name) ||
    userTrips[0]?.authorName ||
    fallbackInfo.name ||
    'رحّالة درب';
  const userId =
    (publicProfileDoc && publicProfileDoc.userId) ||
    userTrips[0]?.authorUserId ||
    fallbackInfo.userId ||
    generateShortUserId(uid);

  return {
    uid,
    name,
    userId,
    badges,
    summary,
    maxElevationGainM: Math.round(maxElevationGainM),
    userTrips,
  };
}

export function getDifficultyMeta(difficulty) {
  return DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP['متوسط'];
}

export function getDifficultyMarkerColor(difficulty) {
  const meta = getDifficultyMeta(difficulty);
  return { fill: meta.markerFill, stroke: meta.markerStroke };
}

export function getAlertStatusClass(status) {
  switch (status) {
    case 'الطريق سالك':
      return 'status-clear';
    case 'يوجد سيول/وحل':
      return 'status-mud';
    case 'يتطلب دفع رباعي':
      return 'status-4x4';
    case 'مغلق للصيانة':
      return 'status-closed';
    default:
      return 'status-neutral';
  }
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
  if (
    trimmed.startsWith('./') ||
    /^[a-z0-9\-]+\.html(\?[a-zA-Z0-9_=&\-]+)?(#[a-zA-Z0-9_\-]+)?$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return fallback;
}

export function getTripOwnerUid(trip) {
  if (!trip) return '';
  return String(trip.authorId || trip.authorUid || '');
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

/**
 * Computes personal statistics strictly scoped to the currently logged-in user's trips.
 * @param {Array<Record<string, any>>} allTrips
 * @param {string | null | undefined} currentUid
 */
export function computePersonalAnalytics(allTrips, currentUid) {
  const uid = typeof currentUid === 'string' ? currentUid.trim() : '';
  const emptyDistribution = ['سهل', 'متوسط', 'صعب'].map((level) => ({
    level,
    count: 0,
    pct: 0,
  }));

  if (!uid) {
    return {
      isAuthenticated: false,
      hasTrips: false,
      userTrips: [],
      summary: computeSummaryStats([]),
      difficultyDistribution: emptyDistribution,
      longestTrip: null,
      highestPeakTrip: null,
      averageDistanceKm: 0,
    };
  }

  const list = Array.isArray(allTrips) ? allTrips : [];
  const userTrips = list.filter((trip) => getTripOwnerUid(trip) === uid);
  const summary = computeSummaryStats(userTrips);

  if (userTrips.length === 0) {
    return {
      isAuthenticated: true,
      hasTrips: false,
      userTrips: [],
      summary,
      difficultyDistribution: emptyDistribution,
      longestTrip: null,
      highestPeakTrip: null,
      averageDistanceKm: 0,
    };
  }

  const difficultyDistribution = ['سهل', 'متوسط', 'صعب'].map((level) => {
    const count = userTrips.filter((t) => t.difficulty === level).length;
    const pct = Math.round((count / userTrips.length) * 100);
    return { level, count, pct };
  });

  const longestTrip = [...userTrips].sort(
    (a, b) => (Number(b.distanceKm) || 0) - (Number(a.distanceKm) || 0)
  )[0];
  const highestPeakTrip = [...userTrips].sort(
    (a, b) => (Number(b.maxElevationM) || 0) - (Number(a.maxElevationM) || 0)
  )[0];
  const averageDistanceKm = Math.round((summary.totalKm / userTrips.length) * 10) / 10;

  return {
    isAuthenticated: true,
    hasTrips: true,
    userTrips,
    summary,
    difficultyDistribution,
    longestTrip,
    highestPeakTrip,
    averageDistanceKm,
  };
}

export function computeUserBadges(userTrips) {
  const list = Array.isArray(userTrips) ? userTrips : [];
  const tripCount = list.length;
  const hasHighPeak = list.some((t) => Number(t.elevationGainM) > 1000);

  return [
    {
      id: 'beginner_explorer',
      title: 'مستكشف مبتدئ',
      description: 'توثيق أول رحلة جبلية على منصة درب',
      icon: '🧭',
      earned: tripCount >= 1,
      progressLabel: tripCount >= 1 ? 'مكتسبة' : 'انشر رحلتك الأولى',
    },
    {
      id: 'summit_conqueror',
      title: 'قاهر القمم',
      description: 'إتمام وتوثيق مسار بارتفاع مكتسب يتجاوز 1,000 متر',
      icon: '⛰️',
      earned: hasHighPeak,
      progressLabel: hasHighPeak ? 'مكتسبة' : 'تحتاج مساراً بارتفاع > 1,000 m',
    },
    {
      id: 'darb_voyager',
      title: 'رحّال درب',
      description: 'نشر 10 رحلات جبلية موثّقة أو أكثر',
      icon: '🏅',
      earned: tripCount >= 10,
      progressLabel: tripCount >= 10 ? 'مكتسبة' : `${formatNum(tripCount)} / 10 رحلات`,
    },
  ];
}

export function getEarnedBadges(userTrips) {
  return computeUserBadges(userTrips).filter((b) => b.earned);
}

export function groupTripsByAuthor(allTrips) {
  const map = new Map();
  const list = Array.isArray(allTrips) ? allTrips : [];
  for (const trip of list) {
    const uid = getTripOwnerUid(trip);
    if (!uid) continue;
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid).push(trip);
  }
  return map;
}

export function buildLeaderboard(allTrips, options = {}) {
  const list = Array.isArray(allTrips) ? allTrips : [];
  const { sortBy = 'trips', region = 'all' } = options;

  const globalByAuthor = groupTripsByAuthor(list);
  const filteredTrips =
    region && region !== 'all'
      ? list.filter((t) => String(t.region || '').trim() === String(region).trim())
      : list;

  const entriesMap = new Map();
  for (const trip of filteredTrips) {
    const uid = getTripOwnerUid(trip);
    if (!uid) continue;
    if (!entriesMap.has(uid)) {
      entriesMap.set(uid, {
        uid,
        name: trip.authorName || 'رحّالة درب',
        userId: trip.authorUserId || generateShortUserId(uid),
        tripCount: 0,
        totalKm: 0,
        maxElevationGainM: 0,
        badges: getEarnedBadges(globalByAuthor.get(uid) || []),
      });
    }
    const entry = entriesMap.get(uid);
    entry.tripCount += 1;
    entry.totalKm += Number(trip.distanceKm) || 0;
    const gain = Number(trip.elevationGainM) || 0;
    if (gain > entry.maxElevationGainM) entry.maxElevationGainM = gain;
    if (trip.authorName) entry.name = trip.authorName;
    if (trip.authorUserId) entry.userId = trip.authorUserId;
  }

  const entries = Array.from(entriesMap.values()).map((e) => ({
    ...e,
    totalKm: Math.round(e.totalKm * 10) / 10,
    maxElevationGainM: Math.round(e.maxElevationGainM),
  }));

  entries.sort((a, b) => {
    if (sortBy === 'distance') {
      if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
      return b.tripCount - a.tripCount;
    }
    if (b.tripCount !== a.tripCount) return b.tripCount - a.tripCount;
    return b.totalKm - a.totalKm;
  });

  return entries;
}

export function filterTrips(trips, options = {}) {
  const list = Array.isArray(trips) ? trips : [];
  const {
    tab = 'all',
    query = '',
    currentUid = null,
    favorites = [],
  } = options;

  const favSet = new Set(Array.isArray(favorites) ? favorites : []);
  const q = String(query || '').trim().toLowerCase();

  return list.filter((trip) => {
    if (tab === 'mine') {
      if (!currentUid || getTripOwnerUid(trip) !== currentUid) return false;
    } else if (tab === 'favorites') {
      if (!favSet.has(trip.id)) return false;
    }

    if (!q) return true;

    const haystack = [
      trip.title,
      trip.location,
      trip.region,
      trip.difficulty,
      trip.authorName,
      trip.authorUserId,
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

export function computeAverageRating(comments) {
  const list = Array.isArray(comments) ? comments : [];
  let sum = 0;
  let count = 0;
  for (const item of list) {
    const r = Number(item.rating);
    if (Number.isFinite(r) && r >= 1 && r <= 5) {
      sum += r;
      count += 1;
    }
  }
  return {
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    count,
  };
}

export function buildShareText(trip, pageUrl) {
  const title = trip?.title || 'مسار جبلي في درب';
  const region = trip?.location || trip?.region || 'المملكة العربية السعودية';
  const distance = formatNum(trip?.distanceKm || 0, 1);
  const gain = formatNum(trip?.elevationGainM || 0, 0);
  const difficulty = getDifficultyMeta(trip?.difficulty).label;
  const author = trip?.authorName || 'رحّالة درب';
  const authorCode = trip?.authorUserId || generateShortUserId(getTripOwnerUid(trip));

  return [
    `🏔️ رحلة في منصة درب: ${title}`,
    `📍 الموقع: ${region}`,
    `📏 المسافة: ${distance} km | ⛰️ الارتفاع المكتسب: +${gain} m`,
    `⚡ الصعوبة: ${difficulty}`,
    `🥾 الناشر: ${author} (${authorCode})`,
    `🔗 رابط المسار: ${pageUrl}`,
  ].join('\n');
}

export function isSuperAdminProfile(userProfile) {
  return Boolean(userProfile && userProfile.role === 'superadmin' && !userProfile.isBanned);
}

export function canDeleteTrip(trip, userProfile) {
  if (!trip || !userProfile || userProfile.isBanned) return false;
  return userProfile.role === 'superadmin' || getTripOwnerUid(trip) === userProfile.uid;
}

export function canEditTrip(trip, userProfile) {
  return canDeleteTrip(trip, userProfile);
}

export function canEditNotes(trip, userProfile) {
  return canDeleteTrip(trip, userProfile);
}

export function canDeleteComment(comment, trip, userProfile) {
  if (!comment || !userProfile || userProfile.isBanned) return false;
  return (
    userProfile.role === 'superadmin' ||
    comment.authorUid === userProfile.uid ||
    (trip && getTripOwnerUid(trip) === userProfile.uid)
  );
}

export function canDeleteAlert(alertItem, trip, userProfile) {
  return canDeleteComment(alertItem, trip, userProfile);
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
  if (input.rating !== undefined && input.rating !== null) {
    const rating = Number(input.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      errors.push('يرجى اختيار تقييم صحيح بين 1 و 5 نجوم.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateAlertInput(input = {}) {
  const errors = [];
  const status = String(input.status || '').trim();
  const note = String(input.note || '').trim();
  if (!VALID_ALERT_STATUSES.has(status)) {
    errors.push('يرجى اختيار حالة مسار صالحة.');
  }
  if (note.length > 500) {
    errors.push('الملاحظة الميدانية يجب ألا تتجاوز 500 حرف.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateProfileUpdateInput(input = {}) {
  const errors = [];
  const name = String(input.name || '').trim();
  const dateOfBirth = String(input.dateOfBirth || '').trim();
  if (name.length < 2 || name.length > 80) {
    errors.push('يرجى إدخال اسم ظاهر صحيح (من 2 إلى 80 حرفاً).');
  }
  if (input.userId !== undefined) {
    const idCheck = validateCustomUserId(input.userId);
    if (!idCheck.valid) {
      errors.push(idCheck.error);
    }
  }
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    errors.push('صيغة تاريخ الميلاد غير صحيحة (YYYY-MM-DD).');
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
    m:
      p.m !== null
        ? p.m
        : safeMinEle +
          Math.round((idx / Math.max(1, arr.length - 1)) * Math.max(0, safeMaxEle - safeMinEle)),
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

/**
 * @param {number} distanceKm
 * @param {number} elevationGainM
 * @param {number | null} [customLat]
 * @param {number | null} [customLng]
 */
export function buildDefaultTrailData(distanceKm, elevationGainM, customLat = null, customLng = null) {
  const safeDist = Math.max(0.5, Number(distanceKm) || 5);
  const safeGain = Math.max(0, Math.round(Number(elevationGainM) || 0));
  const baseLat = Number.isFinite(Number(customLat)) && customLat !== null ? Number(customLat) : DEFAULT_KSA_LAT;
  const baseLng = Number.isFinite(Number(customLng)) && customLng !== null ? Number(customLng) : DEFAULT_KSA_LNG;
  const baseEle = 900;

  const steps = 8;
  const routePoints = [];
  const elevationProfile = [];

  for (let i = 0; i < steps; i += 1) {
    const ratio = i / (steps - 1);
    const lat = Math.round((baseLat + ratio * 0.018 + Math.sin(ratio * Math.PI) * 0.004) * 1e6) / 1e6;
    const lng = Math.round((baseLng + ratio * 0.015 + (Math.cos(ratio * Math.PI) - 1) * 0.003) * 1e6) / 1e6;
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
      const ele =
        profIdx >= 0 && Number.isFinite(Number(profile[profIdx]?.m)) ? Number(profile[profIdx].m) : null;
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
    case 'auth/requires-recent-login':
      return 'لأسباب أمنية، يرجى إدخال كلمة المرور الحالية لإعادة التحقق قبل إتمام هذا التغيير.';
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
   2. Dark Mode Controller (Instant, Zero-Flash, Persisted in localStorage)
   ============================================================================ */

function initDarkModeToggle() {
  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(isDark));
      toggleBtn.setAttribute('aria-label', isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي');
      toggleBtn.setAttribute('title', isDark ? 'الوضع النهاري' : 'الوضع الليلي');
    }
  };

  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    savedTheme = 'light';
  }
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('themeToggleBtn');
  toggleBtn?.addEventListener('click', () => {
    const nextTheme =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage quota restrictions
    }
    applyTheme(nextTheme);
  });
}

/* ============================================================================
   3. Browser Runtime & Firebase v10+ Modular Controllers
   ============================================================================ */

async function bootstrapBrowserApp() {
  initDarkModeToggle();

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
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
  } = authMod;

  const {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    onSnapshot,
    query,
    where,
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
    const userAvatarEl = document.getElementById('navUserAvatar');
    const adminLink = document.getElementById('navAdminLink');
    const bannedBanner = document.getElementById('globalBannedBanner');

    const profile = state.userProfile;
    const signedIn = Boolean(state.firebaseUser && profile);

    if (loginBtn) loginBtn.hidden = signedIn;
    if (userGroup) userGroup.hidden = !signedIn;
    if (userNameEl) userNameEl.textContent = signedIn ? profile.name : '';
    if (userAvatarEl) {
      userAvatarEl.textContent = signedIn ? (profile.name || 'ر').trim().charAt(0) : 'ر';
    }

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
      if (page === 'admin' || page === 'add-trip' || page === 'profile') {
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
    const fallbackShortId = generateShortUserId(fbUser.uid);

    async function syncPublicIdentityRecords(uid, name, shortId, isBanned) {
      if (isBanned) return;
      const handleKey = toHandleDocId(shortId);
      if (handleKey) {
        try {
          const claimRef = doc(db, 'usernames', handleKey);
          const existingClaim = await getDoc(claimRef);
          if (!existingClaim.exists() || existingClaim.data()?.uid === uid) {
            await setDoc(claimRef, {
              uid,
              userId: shortId,
              normalizedId: shortId.toLowerCase(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-fatal background handle claim sync
        }
      }
      try {
        await setDoc(doc(db, 'publicProfiles', uid), {
          uid,
          name,
          userId: shortId,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal background public profile sync
      }
    }

    if (snap.exists()) {
      const data = snap.data();
      let shortId = data.userId || fallbackShortId;
      const resolvedName = data.name || fbUser.displayName || 'مستخدم درب';
      // Backfill unique short userId / userIdLower for legacy user profiles if missing
      if ((!data.userId || !data.userIdLower) && !data.isBanned) {
        try {
          await updateDoc(userRef, {
            userId: shortId,
            userIdLower: shortId.toLowerCase(),
          });
        } catch {
          // Non-fatal backfill skip
        }
      }
      syncPublicIdentityRecords(fbUser.uid, resolvedName, shortId, Boolean(data.isBanned));
      return {
        uid: fbUser.uid,
        userId: shortId,
        userIdLower: shortId.toLowerCase(),
        name: resolvedName,
        email: data.email || fbUser.email || '',
        dateOfBirth: data.dateOfBirth || '',
        favorites: Array.isArray(data.favorites) ? data.favorites : [],
        role: isBootstrappedVerified ? 'superadmin' : data.role || 'user',
        isBanned: Boolean(data.isBanned),
        createdAt: data.createdAt || null,
      };
    }

    const rawName = (
      preferredName ||
      fbUser.displayName ||
      (fbUser.email || '').split('@')[0] ||
      'رحّالة درب'
    ).trim();
    const safeName = rawName.length >= 2 ? rawName.slice(0, 80) : `${rawName} درب`;
    const newProfile = {
      uid: fbUser.uid,
      userId: fallbackShortId,
      userIdLower: fallbackShortId.toLowerCase(),
      name: safeName,
      email: (fbUser.email || 'user@darb.com').trim(),
      dateOfBirth: '',
      favorites: [],
      role: isBootstrappedVerified ? 'superadmin' : 'user',
      isBanned: false,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newProfile);
      syncPublicIdentityRecords(fbUser.uid, safeName, fallbackShortId, false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    return {
      ...newProfile,
      role: isBootstrappedVerified ? 'superadmin' : 'user',
    };
  }

  async function toggleFavoriteTrip(tripId) {
    if (!state.firebaseUser || !state.userProfile) {
      showToast('يرجى تسجيل الدخول لحفظ المسارات في المفضلة.');
      window.location.href = `./auth.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }
    if (state.userProfile.isBanned) {
      showToast('تم تعليق حسابك ولا يمكنك تعديل المفضلة.');
      return false;
    }

    const currentFavs = Array.isArray(state.userProfile.favorites) ? [...state.userProfile.favorites] : [];
    const exists = currentFavs.includes(tripId);
    let nextFavs;
    if (exists) {
      nextFavs = currentFavs.filter((id) => id !== tripId);
    } else {
      if (currentFavs.length >= MAX_FAVORITES) {
        showToast(`الحد الأقصى للمسارات المحفوظة هو ${MAX_FAVORITES} مسار.`);
        return false;
      }
      nextFavs = [...currentFavs, tripId];
    }

    const path = `users/${state.userProfile.uid}`;
    try {
      await updateDoc(doc(db, 'users', state.userProfile.uid), { favorites: nextFavs });
      state.userProfile = { ...state.userProfile, favorites: nextFavs };
      showToast(exists ? 'تمت إزالة المسار من المفضلة.' : 'تم حفظ المسار في المفضلة.');
      notifyAuthListeners();
      return !exists;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      return exists;
    }
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
        userId: generateShortUserId(fbUser.uid),
        name: fbUser.displayName || 'مستخدم درب',
        email: fbUser.email || '',
        dateOfBirth: '',
        favorites: [],
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

  /* ---- Shared DOM Helpers ---- */

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

  function renderBadgesInline(container, badges, maxCount = 3) {
    if (!container) return;
    container.replaceChildren();
    const earned = Array.isArray(badges) ? badges.slice(0, maxCount) : [];
    for (const badge of earned) {
      const chip = document.createElement('span');
      chip.className = 'badge-chip';
      chip.title = badge.description || badge.title;
      chip.textContent = `${badge.icon} ${badge.title}`;
      container.appendChild(chip);
    }
  }

  /* ---- Reusable Public Member Profile Modal (ملف العضو العام) ---- */

  function ensurePublicProfileModal() {
    let dialog = document.getElementById('publicProfileModal');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'publicProfileModal';
    dialog.className = 'public-profile-modal';
    dialog.setAttribute('aria-labelledby', 'publicProfileName');
    dialog.setAttribute('data-testid', 'public-profile-modal');

    const shell = document.createElement('div');
    shell.className = 'public-profile-shell';

    const header = document.createElement('div');
    header.className = 'public-profile-header';

    const identity = document.createElement('div');
    identity.className = 'public-profile-identity';

    const avatar = document.createElement('div');
    avatar.id = 'publicProfileAvatar';
    avatar.className = 'profile-avatar-lg';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'ر';

    const copy = document.createElement('div');
    const nameH2 = document.createElement('h2');
    nameH2.id = 'publicProfileName';
    nameH2.className = 'profile-display-name';
    nameH2.textContent = 'ملف العضو';

    const idRow = document.createElement('div');
    idRow.className = 'public-profile-id-row';
    const idTag = document.createElement('span');
    idTag.id = 'publicProfileUserId';
    idTag.className = 'publisher-id-tag';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.id = 'publicProfileCopyIdBtn';
    copyBtn.className = 'btn btn-subtle';
    copyBtn.textContent = 'نسخ المعرّف';
    copyBtn.addEventListener('click', async () => {
      const code = idTag.textContent || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        showToast(`تم نسخ معرّف العضو: ${code}`);
      } catch {
        showToast(`معرّف العضو: ${code}`);
      }
    });
    idRow.append(idTag, copyBtn);

    const badgesRow = document.createElement('div');
    badgesRow.id = 'publicProfileBadges';
    badgesRow.className = 'badges-inline-row';
    badgesRow.setAttribute('aria-label', 'شارات الإنجاز');

    copy.append(nameH2, idRow, badgesRow);
    identity.append(avatar, copy);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'publicProfileCloseBtn';
    closeBtn.className = 'icon-close-btn';
    closeBtn.setAttribute('aria-label', 'إغلاق ملف العضو');
    closeBtn.appendChild(makeSvgIcon('M18 6L6 18M6 6l12 12', 'icon-sm'));
    closeBtn.addEventListener('click', () => {
      if (dialog.open) dialog.close();
    });

    header.append(identity, closeBtn);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'public-profile-stats';
    statsGrid.innerHTML = '';
    const statDefs = [
      ['publicProfileStatTrips', 'إجمالي الرحلات', '0'],
      ['publicProfileStatKm', 'إجمالي المسافة', '0.0 km'],
      ['publicProfileStatGain', 'أعلى ارتفاع مكتسب', '0 m'],
    ];
    for (const [id, label, initial] of statDefs) {
      const box = document.createElement('div');
      box.className = 'public-profile-stat-box';
      const l = document.createElement('span');
      l.className = 'elev-mini-label';
      l.textContent = label;
      const v = document.createElement('strong');
      v.id = id;
      v.className = 'elev-mini-value';
      v.textContent = initial;
      box.append(l, v);
      statsGrid.appendChild(box);
    }

    const sectionHead = document.createElement('div');
    sectionHead.className = 'public-profile-section-head';
    const tripsTitle = document.createElement('h3');
    tripsTitle.className = 'card-section-title';
    tripsTitle.textContent = 'الرحلات المنشورة';
    const tripsCountBadge = document.createElement('span');
    tripsCountBadge.id = 'publicProfileTripsBadge';
    tripsCountBadge.className = 'season-label';
    tripsCountBadge.textContent = '0 رحلات';
    sectionHead.append(tripsTitle, tripsCountBadge);

    const tripsGrid = document.createElement('div');
    tripsGrid.id = 'publicProfileTripsGrid';
    tripsGrid.className = 'public-profile-trips-grid';
    tripsGrid.setAttribute('data-testid', 'public-profile-trips-grid');

    const emptyMsg = document.createElement('div');
    emptyMsg.id = 'publicProfileEmpty';
    emptyMsg.className = 'empty-state';
    emptyMsg.hidden = true;
    const emptyP = document.createElement('p');
    emptyP.className = 'empty-desc';
    emptyP.textContent = 'لم يقم هذا العضو بنشر رحلات بعد.';
    emptyMsg.appendChild(emptyP);

    shell.append(header, statsGrid, sectionHead, tripsGrid, emptyMsg);
    dialog.appendChild(shell);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && dialog.open) {
        dialog.close();
      }
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  async function openPublicMemberProfile({ uid, name = '', userId = '', preloadedTrips = null }) {
    if (!uid) return;
    const dialog = ensurePublicProfileModal();

    const avatarEl = document.getElementById('publicProfileAvatar');
    const nameEl = document.getElementById('publicProfileName');
    const idEl = document.getElementById('publicProfileUserId');
    const badgesEl = document.getElementById('publicProfileBadges');
    const tripsStatEl = document.getElementById('publicProfileStatTrips');
    const kmStatEl = document.getElementById('publicProfileStatKm');
    const gainStatEl = document.getElementById('publicProfileStatGain');
    const tripsBadgeEl = document.getElementById('publicProfileTripsBadge');
    const tripsGridEl = document.getElementById('publicProfileTripsGrid');
    const emptyEl = document.getElementById('publicProfileEmpty');

    const initialName = name || 'رحّالة درب';
    const initialId = userId || generateShortUserId(uid);
    if (avatarEl) avatarEl.textContent = initialName.trim().charAt(0) || 'ر';
    if (nameEl) nameEl.textContent = initialName;
    if (idEl) idEl.textContent = initialId;
    if (tripsGridEl) {
      tripsGridEl.replaceChildren();
      const skel = document.createElement('div');
      skel.className = 'skeleton-card skeleton-sm';
      tripsGridEl.appendChild(skel);
    }
    if (emptyEl) emptyEl.hidden = true;

    if (!dialog.open) dialog.showModal();

    let publicProfileDoc = null;
    try {
      const pubSnap = await getDoc(doc(db, 'publicProfiles', uid));
      if (pubSnap.exists()) {
        publicProfileDoc = pubSnap.data();
      }
    } catch {
      // Fallback gracefully to trip attribution if public profile doc doesn't exist yet
    }

    let sourceTrips = Array.isArray(preloadedTrips) ? preloadedTrips : null;
    if (!sourceTrips) {
      try {
        const snap = await getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc')));
        sourceTrips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (error) {
        sourceTrips = [];
        handleFirestoreError(error, OperationType.LIST, 'trips');
      }
    }

    const member = buildPublicMemberSummary(uid, sourceTrips, publicProfileDoc, {
      name: initialName,
      userId: initialId,
    });

    if (avatarEl) avatarEl.textContent = member.name.trim().charAt(0) || 'ر';
    if (nameEl) nameEl.textContent = member.name;
    if (idEl) idEl.textContent = member.userId;
    renderBadgesInline(badgesEl, member.badges, 3);

    if (tripsStatEl) tripsStatEl.textContent = formatNum(member.summary.totalTrips, 0);
    if (kmStatEl) kmStatEl.textContent = `${formatNum(member.summary.totalKm, 1)} كم`;
    if (gainStatEl) {
      gainStatEl.replaceChildren();
      const gainNum = document.createElement('span');
      gainNum.dir = 'ltr';
      gainNum.textContent = `+${formatNum(member.maxElevationGainM, 0)}`;
      gainStatEl.append(gainNum, document.createTextNode(' م'));
    }
    if (tripsBadgeEl) tripsBadgeEl.textContent = `${formatNum(member.userTrips.length, 0)} رحلة`;

    if (!tripsGridEl) return;
    tripsGridEl.replaceChildren();

    if (member.userTrips.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    for (const trip of member.userTrips) {
      const link = document.createElement('a');
      link.className = 'public-trip-mini-card';
      link.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;

      const media = document.createElement('div');
      media.className = 'public-trip-mini-media';
      const img = document.createElement('img');
      img.src = sanitizeMediaUrl(trip.coverImageUrl, DEFAULT_HERO_IMAGE);
      img.alt = trip.title;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';

      const diffMeta = getDifficultyMeta(trip.difficulty);
      const badge = document.createElement('span');
      badge.className = `trip-badge ${diffMeta.className}`;
      badge.textContent = diffMeta.label;
      media.append(img, badge);

      const body = document.createElement('div');
      body.className = 'public-trip-mini-body';
      const h4 = document.createElement('h4');
      h4.className = 'public-trip-mini-title';
      h4.textContent = trip.title;

      const meta = document.createElement('div');
      meta.className = 'public-trip-mini-meta';
      const locSpan = document.createElement('span');
      locSpan.textContent = trip.location || trip.region || '';
      const distSpan = document.createElement('span');
      distSpan.textContent = `${formatNum(trip.distanceKm, 1)} كم · ${formatHours(trip.durationHours)}`;
      meta.append(locSpan, distSpan);

      const dateSpan = document.createElement('span');
      dateSpan.className = 'trip-card-date';
      dateSpan.textContent = formatIsoDate(trip.dateIso);

      body.append(h4, meta, dateSpan);
      link.append(media, body);
      tripsGridEl.appendChild(link);
    }
  }

  /* ==========================================================================
     PAGE 1: Dashboard (index.html)
     ========================================================================== */

  function initDashboardPage() {
    let allTrips = [];
    let authorTripsMap = new Map();
    let activeTab = 'all';
    let searchQuery = '';
    let activeNavView = 'trips';
    let kingdomMapInstance = null;
    let kingdomMapLayer = null;
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
    const countMineEl = document.getElementById('countMine');
    const countFavEl = document.getElementById('countFavorites');

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
      if (targetView === 'trips') renderKingdomExploreMap();
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

    function getFilteredTrips() {
      return filterTrips(allTrips, {
        tab: activeTab,
        query: searchQuery,
        currentUid: state.userProfile?.uid || null,
        favorites: state.userProfile?.favorites || [],
      });
    }

    function updateTabCounts() {
      const uid = state.userProfile?.uid || null;
      const favs = state.userProfile?.favorites || [];
      const mineCount = uid ? allTrips.filter((t) => getTripOwnerUid(t) === uid).length : 0;
      const favCount = allTrips.filter((t) => favs.includes(t.id)).length;
      if (countAllEl) countAllEl.textContent = formatNum(allTrips.length, 0);
      if (countMineEl) countMineEl.textContent = formatNum(mineCount, 0);
      if (countFavEl) countFavEl.textContent = formatNum(favCount, 0);
    }

    function updateSummaryAndHero() {
      const stats = computeSummaryStats(allTrips);
      if (statTrips) statTrips.textContent = formatNum(stats.totalTrips, 0);
      if (statKm) statKm.textContent = formatNum(stats.totalKm, 1);
      if (statHours) {
        statHours.textContent = formatNum(stats.totalHours, Number.isInteger(stats.totalHours) ? 0 : 1);
      }
      if (statElevation) statElevation.textContent = formatNum(stats.totalElevation, 0);
      updateTabCounts();

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

      // Card Action Overlay (Favorite + Edit/Delete for owner or Super Admin)
      const overlay = document.createElement('div');
      overlay.className = 'card-actions-overlay';

      const isFav = Boolean(state.userProfile?.favorites?.includes(trip.id));
      const favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = `card-fav-btn${isFav ? ' is-favorite' : ''}`;
      favBtn.setAttribute('aria-pressed', String(isFav));
      favBtn.setAttribute('aria-label', isFav ? `إزالة ${trip.title} من المفضلة` : `حفظ ${trip.title} في المفضلة`);
      favBtn.title = isFav ? 'إزالة من المفضلة' : 'حفظ في المفضلة';
      favBtn.appendChild(makeSvgIcon('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', 'icon-xs'));
      favBtn.addEventListener('click', () => {
        toggleFavoriteTrip(trip.id);
      });
      overlay.appendChild(favBtn);

      if (canEditTrip(trip, state.userProfile)) {
        const editLink = document.createElement('a');
        editLink.className = 'card-edit-btn';
        editLink.href = `./add-trip.html?edit=${encodeURIComponent(trip.id)}`;
        editLink.textContent = 'تعديل';
        editLink.setAttribute('aria-label', `تعديل رحلة ${trip.title}`);
        overlay.appendChild(editLink);
      }

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
        overlay.appendChild(delBtn);
      }
      media.appendChild(overlay);

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

      // Clickable Publisher Attribution + Unique User ID + Top Badge
      const ownerUid = getTripOwnerUid(trip);
      const authorShortId = trip.authorUserId || generateShortUserId(ownerUid);
      const pubRow = document.createElement('div');
      pubRow.className = 'trip-card-publisher';

      const pubTrigger = document.createElement('button');
      pubTrigger.type = 'button';
      pubTrigger.className = 'publisher-trigger';
      pubTrigger.setAttribute('aria-label', `عرض الملف العام للعضو ${trip.authorName || 'رحّالة درب'}`);

      const pubName = document.createElement('span');
      pubName.className = 'publisher-name';
      pubName.textContent = trip.authorName || 'رحّالة درب';

      const pubId = document.createElement('span');
      pubId.className = 'publisher-id-tag';
      pubId.textContent = authorShortId;

      pubTrigger.append(pubName, pubId);
      pubTrigger.addEventListener('click', () => {
        openPublicMemberProfile({
          uid: ownerUid,
          name: trip.authorName || 'رحّالة درب',
          userId: authorShortId,
          preloadedTrips: allTrips,
        });
      });

      pubRow.appendChild(pubTrigger);

      const earnedBadges = getEarnedBadges(authorTripsMap.get(ownerUid) || []);
      if (earnedBadges.length > 0) {
        const badgeChip = document.createElement('span');
        badgeChip.className = 'badge-chip';
        badgeChip.textContent = `${earnedBadges[0].icon} ${earnedBadges[0].title}`;
        pubRow.appendChild(badgeChip);
      }

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
      body.append(head, locP, pubRow, footer);
      card.append(media, body);
      return card;
    }

    function renderTripsFeed() {
      if (!tripsGrid || !emptyState) return;
      updateTabCounts();
      const filtered = getFilteredTrips();
      tripsGrid.replaceChildren();

      if (filtered.length === 0) {
        emptyState.hidden = false;
        if (footerRow) footerRow.hidden = true;

        if (activeTab === 'mine' && !searchQuery.trim()) {
          if (emptyTitle) {
            emptyTitle.textContent = state.userProfile
              ? 'لم تقم بنشر أي رحلة بعد'
              : 'سجّل دخولك لاستعراض رحلاتك الخاصة';
          }
          if (emptyDesc) {
            emptyDesc.textContent = state.userProfile
              ? 'ابدأ الآن بتوثيق أول مسار لك في الطبيعة ليظهر في قائمة رحلاتك.'
              : 'قم بتسجيل الدخول للوصول إلى رحلاتك وإدارتها وتعديلها.';
          }
          if (emptyAddBtn) {
            emptyAddBtn.hidden = false;
            emptyAddBtn.href = state.userProfile ? './add-trip.html' : './auth.html';
            emptyAddBtn.textContent = state.userProfile ? 'إضافة رحلة جديدة' : 'تسجيل الدخول';
          }
          if (resetFiltersBtn) resetFiltersBtn.hidden = true;
        } else if (activeTab === 'favorites' && !searchQuery.trim()) {
          if (emptyTitle) {
            emptyTitle.textContent = state.userProfile
              ? 'لا توجد مسارات محفوظة في المفضلة بعد'
              : 'سجّل دخولك لعرض مساراتك المحفوظة';
          }
          if (emptyDesc) {
            emptyDesc.textContent = state.userProfile
              ? 'انقر على أيقونة الحفظ في أي رحلة لإضافتها إلى قائمة مساراتك المفضلة.'
              : 'قم بتسجيل الدخول لحفظ المسارات التي تود تجربتها لاحقاً.';
          }
          if (emptyAddBtn) emptyAddBtn.hidden = true;
          if (resetFiltersBtn) resetFiltersBtn.hidden = false;
        } else if (allTrips.length === 0) {
          if (emptyTitle) emptyTitle.textContent = 'لا توجد رحلات مضافة بعد، كن أول من يوثق مساره!';
          if (emptyDesc) {
            emptyDesc.textContent = 'سجّل دخولك وأضف أول رحلة جبلية مع صورة الغلاف وملف GPX لتظهر هنا مباشرة.';
          }
          if (emptyAddBtn) {
            emptyAddBtn.hidden = false;
            emptyAddBtn.href = './add-trip.html';
            emptyAddBtn.textContent = 'إضافة أول رحلة';
          }
          if (resetFiltersBtn) resetFiltersBtn.hidden = true;
        } else {
          if (emptyTitle) emptyTitle.textContent = 'لا توجد رحلات مطابقة لبحثك الحالي.';
          if (emptyDesc) emptyDesc.textContent = 'جرّب تعديل كلمة البحث أو الانتقال إلى تبويب «استكشف / رحلات الجميع».';
          if (emptyAddBtn) emptyAddBtn.hidden = true;
          if (resetFiltersBtn) resetFiltersBtn.hidden = false;
        }
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

      if (activeNavView === 'trips') renderKingdomExploreMap();
      if (activeNavView === 'map') renderFullMapView();
      if (activeNavView === 'stats') renderAnalyticsView();
    }

    function populateDifficultyMap(containerId, existingMap, existingLayer, trips) {
      if (typeof window.L === 'undefined') return { map: existingMap, layer: existingLayer };
      const el = document.getElementById(containerId);
      if (!el) return { map: existingMap, layer: existingLayer };

      let map = existingMap;
      let layer = existingLayer;
      if (!map) {
        map = window.L.map(el, { scrollWheelZoom: false }).setView([DEFAULT_KSA_LAT, DEFAULT_KSA_LNG], 5);
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

        const markerColor = getDifficultyMarkerColor(trip.difficulty);
        const popupWrap = document.createElement('div');
        popupWrap.className = 'darb-map-popup';
        const strong = document.createElement('strong');
        strong.textContent = trip.title;
        const meta = document.createElement('span');
        meta.textContent = `${trip.location} · ${getDifficultyMeta(trip.difficulty).label} · ${formatNum(trip.distanceKm, 1)} كم`;
        const link = document.createElement('a');
        link.href = `./trip-details.html?id=${encodeURIComponent(trip.id)}`;
        link.textContent = 'عرض تفاصيل الرحلة ←';
        popupWrap.append(strong, meta, link);

        window.L.circleMarker([lat, lng], {
          radius: 9,
          color: markerColor.stroke,
          weight: 2.5,
          fillColor: markerColor.fill,
          fillOpacity: 0.92,
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
          map.setView([DEFAULT_KSA_LAT, DEFAULT_KSA_LNG], 5);
        }
      }, 80);

      return { map, layer };
    }

    function renderKingdomExploreMap() {
      const res = populateDifficultyMap('kingdomExploreMap', kingdomMapInstance, kingdomMapLayer, allTrips);
      kingdomMapInstance = res.map;
      kingdomMapLayer = res.layer;
    }

    function renderFullMapView() {
      const res = populateDifficultyMap('fullTripsMap', fullMapInstance, fullMapLayer, allTrips);
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
        m.textContent = `${trip.location} · ${getDifficultyMeta(trip.difficulty).label} · ${formatNum(trip.distanceKm, 1)} كم`;
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
      const authGuard = document.getElementById('statsAuthGuard');
      const contentWrap = document.getElementById('statsContentWrap');
      const emptyNotice = document.getElementById('statsEmptyNotice');
      const grid = document.getElementById('analyticsGrid');
      const pTrips = document.getElementById('personalStatTrips');
      const pKm = document.getElementById('personalStatKm');
      const pHours = document.getElementById('personalStatHours');
      const pElevation = document.getElementById('personalStatElevation');
      if (!grid) return;

      const currentUid = state.firebaseUser?.uid || state.userProfile?.uid || null;
      const analytics = computePersonalAnalytics(allTrips, currentUid);

      if (!analytics.isAuthenticated) {
        if (authGuard) authGuard.hidden = false;
        if (contentWrap) contentWrap.hidden = true;
        grid.replaceChildren();
        return;
      }

      if (authGuard) authGuard.hidden = true;
      if (contentWrap) contentWrap.hidden = false;
      if (emptyNotice) emptyNotice.hidden = analytics.hasTrips;

      if (pTrips) pTrips.textContent = formatNum(analytics.summary.totalTrips, 0);
      if (pKm) pKm.textContent = formatNum(analytics.summary.totalKm, 1);
      if (pHours) pHours.textContent = formatNum(analytics.summary.totalHours, 0);
      if (pElevation) pElevation.textContent = formatNum(analytics.summary.totalElevation, 0);

      grid.replaceChildren();

      const diffCard = document.createElement('article');
      diffCard.className = 'surface-card';
      const diffH2 = document.createElement('h2');
      diffH2.className = 'card-section-title';
      diffH2.textContent = 'توزيع رحلاتي حسب الصعوبة';
      const barsWrap = document.createElement('div');
      barsWrap.className = 'analytics-bars';

      for (const item of analytics.difficultyDistribution) {
        const row = document.createElement('div');
        const head = document.createElement('div');
        head.className = 'bar-row-head';
        const lSpan = document.createElement('span');
        lSpan.textContent = item.level;
        const vSpan = document.createElement('strong');
        vSpan.textContent = `${formatNum(item.count)} (${formatNum(item.pct)}%)`;
        head.append(lSpan, vSpan);

        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = `${item.pct}%`;
        track.appendChild(fill);

        row.append(head, track);
        barsWrap.appendChild(row);
      }
      diffCard.append(diffH2, barsWrap);

      const highCard = document.createElement('article');
      highCard.className = 'surface-card';
      const highH2 = document.createElement('h2');
      highH2.className = 'card-section-title';
      highH2.textContent = 'أرقامي القياسية';
      const ul = document.createElement('ul');
      ul.className = 'highlights-list';

      const items = [
        ['إجمالي رحلاتي', `${formatNum(analytics.summary.totalTrips, 0)} رحلة`],
        ['إجمالي المسافة المقطوعة', `${formatNum(analytics.summary.totalKm, 1)} كم`],
        [
          'أطول مسار',
          analytics.longestTrip
            ? `${analytics.longestTrip.title} (${formatNum(analytics.longestTrip.distanceKm, 1)} كم)`
            : '0 كم',
        ],
        [
          'أعلى قمة مسجّلة',
          analytics.highestPeakTrip
            ? `${analytics.highestPeakTrip.title} (${formatNum(analytics.highestPeakTrip.maxElevationM)} m)`
            : '0 m',
        ],
        ['متوسط مسافة الرحلة', `${formatNum(analytics.averageDistanceKm, 1)} كم`],
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

    onAuthReady(() => {
      renderTripsFeed();
      if (activeNavView === 'stats') renderAnalyticsView();
    });

    // Initialize Kingdom Map immediately even before Firestore finishes
    renderKingdomExploreMap();

    const tripsQuery = query(collection(db, 'trips'), orderBy('createdAt', 'desc'));
    onSnapshot(
      tripsQuery,
      (snapshot) => {
        if (loadingState) loadingState.hidden = true;
        allTrips = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        authorTripsMap = groupTripsByAuthor(allTrips);
        updateSummaryAndHero();
        renderTripsFeed();
        if (activeNavView === 'stats') renderAnalyticsView();
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
    let alertsUnsub = null;
    let latestComments = [];
    let latestAlerts = [];
    let authorBadges = [];

    function renderElevationSvg(profile, distanceKm) {
      const svg = document.getElementById('elevationSvg');
      const readout = document.getElementById('elevationHoverReadout');
      if (!svg) return;
      const pts =
        Array.isArray(profile) && profile.length >= 2
          ? profile
          : [
              { km: 0, m: 0 },
              { km: distanceKm || 1, m: 0 },
            ];

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
      s1.setAttribute('stop-color', '#2f6b4f');
      s1.setAttribute('stop-opacity', '0.34');
      const s2 = document.createElementNS(ns, 'stop');
      s2.setAttribute('offset', '100%');
      s2.setAttribute('stop-color', '#2f6b4f');
      s2.setAttribute('stop-opacity', '0.02');
      grad.append(s1, s2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      for (let i = 0; i <= 3; i += 1) {
        const y = padTop + (i / 3) * plotH;
        const val = Math.round(maxElev - (i / 3) * span);
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(padLeft));
        line.setAttribute('x2', String(W - padRight));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', 'currentColor');
        line.setAttribute('stroke-opacity', '0.16');
        line.setAttribute('stroke-dasharray', '4 4');
        svg.appendChild(line);

        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', String(W - padRight + 10));
        label.setAttribute('y', String(y + 4));
        label.setAttribute('fill', 'currentColor');
        label.setAttribute('fill-opacity', '0.7');
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
      strokePath.setAttribute('stroke', '#2f6b4f');
      strokePath.setAttribute('stroke-width', '2.5');
      strokePath.setAttribute('stroke-linecap', 'round');
      strokePath.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(strokePath);

      for (const frac of [0, 0.5, 1]) {
        const x = padLeft + frac * plotW;
        const kmVal = Math.round(frac * maxKm * 10) / 10;
        const xText = document.createElementNS(ns, 'text');
        xText.setAttribute('x', String(x));
        xText.setAttribute('y', String(H - 10));
        xText.setAttribute('fill', 'currentColor');
        xText.setAttribute('fill-opacity', '0.7');
        xText.setAttribute('font-size', '11');
        xText.setAttribute('text-anchor', frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle');
        xText.textContent = `${formatNum(kmVal, 1)} km`;
        svg.appendChild(xText);
      }

      const hoverDot = document.createElementNS(ns, 'circle');
      hoverDot.setAttribute('r', '5');
      hoverDot.setAttribute('fill', '#2f6b4f');
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
        fillColor: '#22c55e',
        fillOpacity: 1,
      })
        .bindTooltip('نقطة البداية')
        .addTo(trailLayer);

      window.L.circleMarker(coords[coords.length - 1], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ea580c',
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
      const editBtn = document.getElementById('detailEditBtn');
      const favBtn = document.getElementById('detailFavBtn');
      const favLabel = document.getElementById('detailFavLabel');
      const editNotesBtn = document.getElementById('editNotesBtn');
      const commentForm = document.getElementById('commentForm');
      const commentAuthPrompt = document.getElementById('commentAuthPrompt');
      const alertForm = document.getElementById('trailAlertForm');
      const alertAuthPrompt = document.getElementById('alertAuthPrompt');

      if (deleteBtn) deleteBtn.hidden = !canDeleteTrip(currentTrip, state.userProfile);
      if (editBtn) {
        editBtn.hidden = !canEditTrip(currentTrip, state.userProfile);
        editBtn.href = `./add-trip.html?edit=${encodeURIComponent(currentTrip.id)}`;
      }
      if (editNotesBtn) editNotesBtn.hidden = !canEditNotes(currentTrip, state.userProfile);

      if (favBtn && favLabel) {
        const isFav = Boolean(state.userProfile?.favorites?.includes(currentTrip.id));
        favBtn.classList.toggle('is-favorite', isFav);
        favBtn.setAttribute('aria-pressed', String(isFav));
        favLabel.textContent = isFav ? 'محفوظة في المفضلة' : 'حفظ في المفضلة';
      }

      const canPost = Boolean(state.userProfile && !state.userProfile.isBanned);
      if (commentForm) commentForm.hidden = !canPost;
      if (commentAuthPrompt) {
        commentAuthPrompt.hidden = canPost;
        if (state.userProfile?.isBanned && commentAuthPrompt.firstElementChild) {
          commentAuthPrompt.firstElementChild.textContent = 'تم تعليق حسابك ولا يمكنك إضافة تقييمات جديدة.';
        }
      }
      if (alertForm) alertForm.hidden = !canPost;
      if (alertAuthPrompt) {
        alertAuthPrompt.hidden = canPost;
        if (state.userProfile?.isBanned && alertAuthPrompt.firstElementChild) {
          alertAuthPrompt.firstElementChild.textContent = 'تم تعليق حسابك ولا يمكنك نشر تنبيهات ميدانية.';
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

      const ownerUid = getTripOwnerUid(trip);
      const authorShortId = trip.authorUserId || generateShortUserId(ownerUid);
      const authorDisplayName = trip.authorName || 'رحّالة درب';
      const openTripAuthorProfile = () => {
        openPublicMemberProfile({
          uid: ownerUid,
          name: authorDisplayName,
          userId: authorShortId,
        });
      };

      setText('breadcrumbRegion', trip.region || trip.location);
      setText('breadcrumbTitle', trip.title);
      setText('detailDifficultyBadge', getDifficultyMeta(trip.difficulty).label);

      const authorLineEl = document.getElementById('detailAuthorLine');
      if (authorLineEl) {
        authorLineEl.replaceChildren();
        const prefix = document.createElement('span');
        prefix.textContent = 'موثّقة بواسطة ';
        const authorBtn = document.createElement('button');
        authorBtn.type = 'button';
        authorBtn.className = 'publisher-trigger publisher-trigger--hero';
        authorBtn.setAttribute('aria-label', `عرض الملف العام للعضو ${authorDisplayName}`);
        authorBtn.textContent = `${authorDisplayName} · ${authorShortId}`;
        authorBtn.addEventListener('click', openTripAuthorProfile);
        authorLineEl.append(prefix, authorBtn);
      }

      setText('detailTitle', trip.title);
      setText('detailLocation', trip.location);
      setText('detailDate', formatIsoDate(trip.dateIso));
      renderBadgesInline(document.getElementById('detailAuthorBadges'), authorBadges);

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

      const factsList = document.getElementById('trailFactsList');
      if (factsList) {
        factsList.replaceChildren();
        const facts = [
          ['المنطقة', trip.region || trip.location, false],
          ['التاريخ', formatIsoDate(trip.dateIso), false],
          ['الناشر', authorDisplayName, true],
          ['معرّف الناشر', authorShortId, true],
          ['الارتفاع المكتسب', `+${formatNum(trip.elevationGainM)} m`, false],
          ['نقاط المسار', `${formatNum((trip.routePoints || []).length)} نقطة`, false],
          ['ملف GPX', trip.gpxFileName || 'متاح للتحميل الفوري', false],
        ];
        for (const [k, v, isAuthorLink] of facts) {
          const row = document.createElement('div');
          row.className = 'fact-row';
          const dt = document.createElement('dt');
          dt.textContent = String(k);
          const dd = document.createElement('dd');
          if (isAuthorLink && ownerUid) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'publisher-trigger';
            btn.textContent = String(v);
            btn.setAttribute('aria-label', `عرض الملف العام للعضو ${authorDisplayName}`);
            btn.addEventListener('click', openTripAuthorProfile);
            dd.appendChild(btn);
          } else {
            dd.textContent = String(v);
          }
          row.append(dt, dd);
          factsList.appendChild(row);
        }
      }

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

    // Favorite, Share, GPX, Coords, Lightbox & Delete handlers
    document.getElementById('detailFavBtn')?.addEventListener('click', () => {
      if (currentTrip) toggleFavoriteTrip(currentTrip.id);
    });

    document.getElementById('shareTripBtn')?.addEventListener('click', async () => {
      if (!currentTrip) return;
      const summary = buildShareText(currentTrip, window.location.href);
      try {
        await navigator.clipboard.writeText(summary);
        showToast('تم نسخ بطاقة مشاركة الرحلة (جاهزة لواتساب ومواقع التواصل).');
      } catch {
        showToast('تعذّر النسخ التلقائي؛ يمكنك مشاركة رابط الصفحة مباشرة.');
      }
    });

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
        await updateDoc(doc(db, 'trips', currentTrip.id), {
          notes: nextNotes,
          updatedAt: serverTimestamp(),
        });
        if (fieldNotesForm) fieldNotesForm.hidden = true;
        if (fieldNotesDisplay) fieldNotesDisplay.hidden = false;
        showToast('تم حفظ تعديلات المذكرة بنجاح.');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `trips/${currentTrip.id}`);
      }
    });

    // Trail Condition Alerts Subcollection
    const alertsListEl = document.getElementById('trailAlertsList');
    const alertsEmptyEl = document.getElementById('trailAlertsEmpty');
    const latestBadgeEl = document.getElementById('latestTrailStatusBadge');
    const alertForm = document.getElementById('trailAlertForm');
    const alertNoteInput = document.getElementById('alertNoteInput');
    const alertErrorBanner = document.getElementById('alertErrorBanner');

    function renderAlerts() {
      if (!alertsListEl) return;
      alertsListEl.replaceChildren();
      if (alertsEmptyEl) alertsEmptyEl.hidden = latestAlerts.length > 0;

      if (latestBadgeEl) {
        if (latestAlerts.length > 0) {
          const latest = latestAlerts[0];
          latestBadgeEl.textContent = latest.status;
          latestBadgeEl.className = `trail-status-badge ${getAlertStatusClass(latest.status)}`;
        } else {
          latestBadgeEl.textContent = 'لا توجد تقارير بعد';
          latestBadgeEl.className = 'trail-status-badge status-neutral';
        }
      }

      for (const alertItem of latestAlerts) {
        const li = document.createElement('li');
        li.className = 'alert-item';

        const head = document.createElement('div');
        head.className = 'alert-item-head';

        const meta = document.createElement('div');
        meta.className = 'alert-item-meta';

        const statusBadge = document.createElement('span');
        statusBadge.className = `trail-status-badge ${getAlertStatusClass(alertItem.status)}`;
        statusBadge.textContent = alertItem.status;

        const authorSpan = document.createElement('strong');
        authorSpan.textContent = alertItem.authorName || 'رحّالة درب';

        const idTag = document.createElement('span');
        idTag.className = 'publisher-id-tag';
        idTag.textContent = alertItem.authorUserId || generateShortUserId(alertItem.authorUid);

        const dateSpan = document.createElement('span');
        dateSpan.className = 'comment-date';
        dateSpan.textContent = formatTimestampDate(alertItem.createdAt) || 'الآن';

        meta.append(statusBadge, authorSpan, idTag, dateSpan);
        head.appendChild(meta);

        if (canDeleteAlert(alertItem, currentTrip, state.userProfile)) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'comment-delete-btn';
          delBtn.textContent = 'حذف';
          delBtn.addEventListener('click', async () => {
            try {
              await deleteDoc(doc(db, 'trips', tripId, 'alerts', alertItem.id));
              showToast('تم حذف التنبيه الميداني.');
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `trips/${tripId}/alerts/${alertItem.id}`);
            }
          });
          head.appendChild(delBtn);
        }

        li.appendChild(head);
        if (alertItem.note && alertItem.note.trim()) {
          const noteP = document.createElement('p');
          noteP.className = 'alert-item-note';
          noteP.textContent = alertItem.note;
          li.appendChild(noteP);
        }
        alertsListEl.appendChild(li);
      }
    }

    alertForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertErrorBanner) alertErrorBanner.hidden = true;
      if (!state.userProfile || state.userProfile.isBanned) {
        showToast('لا تملك صلاحية نشر تنبيه ميداني.');
        return;
      }
      const fd = new FormData(alertForm);
      const status = String(fd.get('alertStatus') || '').trim();
      const note = String(fd.get('note') || '').trim();

      const check = validateAlertInput({ status, note });
      if (!check.valid) {
        if (alertErrorBanner) {
          alertErrorBanner.textContent = check.errors[0];
          alertErrorBanner.hidden = false;
        }
        return;
      }

      const submitBtn = document.getElementById('submitAlertBtn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await addDoc(collection(db, 'trips', tripId, 'alerts'), {
          tripId,
          status,
          note,
          authorUid: state.userProfile.uid,
          authorName: state.userProfile.name.slice(0, 80),
          authorUserId: state.userProfile.userId || generateShortUserId(state.userProfile.uid),
          createdAt: serverTimestamp(),
        });
        if (alertNoteInput) alertNoteInput.value = '';
        showToast('تم نشر تحديث حالة المسار بنجاح.');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `trips/${tripId}/alerts`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // Star Rating Picker & Comments Subcollection
    const starButtons = Array.from(document.querySelectorAll('#starPicker .star-btn'));
    const ratingInput = document.getElementById('commentRatingInput');
    const starReadout = document.getElementById('starPickerReadout');

    function setSelectedRating(val) {
      const safe = Math.min(5, Math.max(1, Number(val) || 5));
      if (ratingInput) ratingInput.value = String(safe);
      if (starReadout) starReadout.textContent = `${safe} / 5`;
      for (const btn of starButtons) {
        btn.classList.toggle('is-selected', Number(btn.dataset.star) <= safe);
      }
    }

    for (const btn of starButtons) {
      btn.addEventListener('click', () => setSelectedRating(btn.dataset.star));
    }

    const commentsListEl = document.getElementById('commentsList');
    const commentsCountEl = document.getElementById('commentsCount');
    const commentsEmptyEl = document.getElementById('commentsEmptyNote');
    const reviewsSummaryEl = document.getElementById('reviewsAverageSummary');
    const heroRatingEl = document.getElementById('detailAvgRatingHero');
    const commentForm = document.getElementById('commentForm');
    const commentTextInput = document.getElementById('commentTextInput');
    const commentErrorBanner = document.getElementById('commentErrorBanner');

    function renderComments() {
      if (!commentsListEl) return;
      commentsListEl.replaceChildren();
      if (commentsCountEl) {
        commentsCountEl.textContent = `${formatNum(latestComments.length)} تقييمات`;
      }
      if (commentsEmptyEl) commentsEmptyEl.hidden = latestComments.length > 0;

      const avg = computeAverageRating(latestComments);
      if (reviewsSummaryEl) {
        reviewsSummaryEl.textContent =
          avg.count > 0
            ? `متوسط التقييم: ★ ${formatNum(avg.average, 1)} من 5 (${formatNum(avg.count)} تقييمات)`
            : 'شارك تقييمك بالنجوم وتجربتك حول هذا المسار';
      }
      if (heroRatingEl) {
        heroRatingEl.textContent = avg.count > 0 ? `★ ${formatNum(avg.average, 1)} (${formatNum(avg.count)})` : 'جديد';
      }

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
        nameEl.textContent = `${comment.authorName || 'رحّالة درب'} · ${comment.authorUserId || generateShortUserId(comment.authorUid)}`;
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
              showToast('تم حذف التقييم.');
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `trips/${tripId}/comments/${comment.id}`);
            }
          });
          head.appendChild(delBtn);
        }

        li.appendChild(head);

        const rNum = Number(comment.rating);
        if (Number.isFinite(rNum) && rNum >= 1 && rNum <= 5) {
          const stars = document.createElement('div');
          stars.className = 'review-stars';
          stars.setAttribute('aria-label', `تقييم ${rNum} من 5 نجوم`);
          stars.textContent = `${'★'.repeat(Math.round(rNum))}${'☆'.repeat(5 - Math.round(rNum))}`;
          li.appendChild(stars);
        }

        const textP = document.createElement('p');
        textP.className = 'comment-text';
        textP.textContent = comment.text;
        li.appendChild(textP);

        commentsListEl.appendChild(li);
      }
    }

    commentForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (commentErrorBanner) commentErrorBanner.hidden = true;
      if (!state.userProfile || state.userProfile.isBanned) {
        showToast('لا تملك صلاحية إضافة تقييم.');
        return;
      }
      const text = String(commentTextInput?.value || '').trim();
      const rating = Number(ratingInput?.value || 5);
      const validation = validateCommentInput({ text, rating });
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
          authorUserId: state.userProfile.userId || generateShortUserId(state.userProfile.uid),
          rating,
          text,
          createdAt: serverTimestamp(),
        });
        if (commentTextInput) commentTextInput.value = '';
        setSelectedRating(5);
        showToast('تم إضافة تقييمك وتعليقك بنجاح.');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `trips/${tripId}/comments`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    onAuthReady(() => {
      updateDetailsPermissionUI();
      renderComments();
      renderAlerts();
    });

    // Live Trips Snapshot for author badge computation
    onSnapshot(collection(db, 'trips'), (allSnap) => {
      if (!currentTrip) return;
      const ownerUid = getTripOwnerUid(currentTrip);
      const ownerTrips = allSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => getTripOwnerUid(t) === ownerUid);
      authorBadges = getEarnedBadges(ownerTrips);
      renderBadgesInline(document.getElementById('detailAuthorBadges'), authorBadges);
    });

    // Live Trip Subscription
    onSnapshot(
      doc(db, 'trips', tripId),
      (snap) => {
        if (!snap.exists()) {
          showNotFound('هذه الرحلة غير موجودة أو تم حذفها.');
          if (commentsUnsub) commentsUnsub();
          if (alertsUnsub) alertsUnsub();
          return;
        }
        renderTripDetails({ id: snap.id, ...snap.data() });

        if (!commentsUnsub) {
          commentsUnsub = onSnapshot(
            query(collection(db, 'trips', tripId, 'comments'), orderBy('createdAt', 'desc')),
            (cSnap) => {
              latestComments = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              renderComments();
            },
            (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/comments`)
          );
        }

        if (!alertsUnsub) {
          alertsUnsub = onSnapshot(
            query(collection(db, 'trips', tripId, 'alerts'), orderBy('createdAt', 'desc')),
            (aSnap) => {
              latestAlerts = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              renderAlerts();
            },
            (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/alerts`)
          );
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `trips/${tripId}`)
    );
  }

  /* ==========================================================================
     PAGE 3: Add / Edit Trip (add-trip.html)
     ========================================================================== */

  function initAddTripPage() {
    const params = new URLSearchParams(window.location.search);
    const editTripId = params.get('edit')?.trim() || '';

    const guardBox = document.getElementById('addTripGuardBox');
    const guardTitle = document.getElementById('addTripGuardTitle');
    const guardDesc = document.getElementById('addTripGuardDesc');
    const guardLoginLink = document.getElementById('addTripGuardLoginLink');
    const workspace = document.getElementById('addTripWorkspace');

    const pageTitleEl = document.getElementById('addTripPageTitle');
    const pageSubtitleEl = document.getElementById('addTripPageSubtitle');
    const modeBadgeEl = document.getElementById('addTripModeBadge');
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
    const coordsHintEl = document.getElementById('addTripMapCoordsHint');

    let editingTrip = null;
    let editLoaded = false;
    let selectedCoverFile = null;
    let existingCoverUrl = '';
    let coverPreviewObjectUrl = '';
    let selectedGpxFile = null;
    let parsedGpxData = null;
    let pickedLat = DEFAULT_KSA_LAT;
    let pickedLng = DEFAULT_KSA_LNG;
    let previewMap = null;
    let previewLayer = null;

    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    function updateCoordsHint(lat, lng) {
      if (coordsHintEl) {
        coordsHintEl.textContent = `الإحداثيات المحددة لنقطة البداية: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} (يمكنك النقر على الخريطة لتعديلها)`;
      }
    }

    function initOrUpdatePreviewMap(routePoints = null) {
      if (typeof window.L === 'undefined') return;
      const mapEl = document.getElementById('addTripPreviewMap');
      if (!mapEl) return;

      if (!previewMap) {
        previewMap = window.L.map(mapEl, { scrollWheelZoom: false }).setView([pickedLat, pickedLng], 6);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(previewMap);
        previewLayer = window.L.layerGroup().addTo(previewMap);

        previewMap.on('click', (ev) => {
          if (parsedGpxData) return;
          pickedLat = Math.round(ev.latlng.lat * 1e6) / 1e6;
          pickedLng = Math.round(ev.latlng.lng * 1e6) / 1e6;
          updateCoordsHint(pickedLat, pickedLng);
          initOrUpdatePreviewMap(null);
        });
      }

      previewLayer.clearLayers();

      if (Array.isArray(routePoints) && routePoints.length >= 2) {
        const coords = routePoints.map((p) => [Number(p.lat), Number(p.lng)]);
        const poly = window.L.polyline(coords, { color: '#234736', weight: 4 }).addTo(previewLayer);
        window.L.circleMarker(coords[0], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#22c55e',
          fillOpacity: 1,
        })
          .bindTooltip('نقطة البداية')
          .addTo(previewLayer);
        window.L.circleMarker(coords[coords.length - 1], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#ea580c',
          fillOpacity: 1,
        })
          .bindTooltip('نقطة الوصول')
          .addTo(previewLayer);

        window.setTimeout(() => {
          previewMap.invalidateSize();
          previewMap.fitBounds(poly.getBounds(), { padding: [26, 26] });
        }, 70);
      } else {
        window.L.circleMarker([pickedLat, pickedLng], {
          radius: 8,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#234736',
          fillOpacity: 1,
        })
          .bindTooltip('نقطة البداية المحددة')
          .addTo(previewLayer);
        window.setTimeout(() => {
          previewMap.invalidateSize();
        }, 70);
      }
    }

    async function loadTripForEdit(userProfile) {
      if (!editTripId || editLoaded) return;
      editLoaded = true;
      try {
        const snap = await getDoc(doc(db, 'trips', editTripId));
        if (!snap.exists()) {
          if (workspace) workspace.hidden = true;
          if (guardBox) guardBox.hidden = false;
          if (guardTitle) guardTitle.textContent = 'الرحلة غير موجودة';
          if (guardDesc) guardDesc.textContent = 'تعذّر العثور على الرحلة المطلوب تعديلها.';
          return;
        }
        const trip = { id: snap.id, ...snap.data() };
        if (!canEditTrip(trip, userProfile)) {
          if (workspace) workspace.hidden = true;
          if (guardBox) guardBox.hidden = false;
          if (guardTitle) guardTitle.textContent = 'لا تملك صلاحية تعديل هذه الرحلة';
          if (guardDesc) guardDesc.textContent = 'يمكن فقط لصاحب الرحلة أو المشرف العام تعديل بياناتها.';
          return;
        }

        editingTrip = trip;
        document.title = `تعديل: ${trip.title} — درب`;
        if (pageTitleEl) pageTitleEl.textContent = 'تعديل بيانات الرحلة';
        if (pageSubtitleEl) pageSubtitleEl.textContent = `تقوم الآن بتحديث تفاصيل «${trip.title}».`;
        if (modeBadgeEl) modeBadgeEl.textContent = 'وضع التعديل';
        if (submitBtn) submitBtn.textContent = 'حفظ التعديلات';

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val ?? '';
        };
        setVal('tripTitleInput', trip.title);
        setVal('tripLocationInput', trip.location);
        setVal('tripDateInput', trip.dateIso);
        setVal('tripDistanceInput', trip.distanceKm);
        setVal('tripDurationInput', trip.durationHours);
        setVal('tripElevationInput', trip.elevationGainM);
        setVal('tripNotesInput', trip.notes);

        const diffRadio = form?.querySelector(`input[name="difficulty"][value="${trip.difficulty}"]`);
        if (diffRadio) diffRadio.checked = true;

        existingCoverUrl = trip.coverImageUrl || '';
        if (existingCoverUrl && coverPreviewImg && coverPreviewBox && coverPlaceholder) {
          coverPreviewImg.src = sanitizeMediaUrl(existingCoverUrl, DEFAULT_HERO_IMAGE);
          if (coverFileNameEl) coverFileNameEl.textContent = 'صورة الغلاف الحالية';
          coverPlaceholder.hidden = true;
          coverPreviewBox.hidden = false;
        }

        if (Number.isFinite(Number(trip.startLat)) && Number.isFinite(Number(trip.startLng))) {
          pickedLat = Number(trip.startLat);
          pickedLng = Number(trip.startLng);
          updateCoordsHint(pickedLat, pickedLng);
        }

        if (Array.isArray(trip.routePoints) && trip.routePoints.length >= 2) {
          initOrUpdatePreviewMap(trip.routePoints);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `trips/${editTripId}`);
      }
    }

    onAuthReady(({ firebaseUser, userProfile }) => {
      if (!firebaseUser || !userProfile) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'تسجيل الدخول مطلوب لتوثيق رحلة جديدة';
        if (guardDesc) guardDesc.textContent = 'سيتم توجيهك الآن إلى صفحة تسجيل الدخول...';
        const target = `./auth.html?next=${encodeURIComponent(`./add-trip.html${window.location.search}`)}`;
        if (guardLoginLink) {
          guardLoginLink.hidden = false;
          guardLoginLink.href = target;
        }
        window.setTimeout(() => {
          if (!state.firebaseUser) {
            window.location.replace(target);
          }
        }, 900);
        return;
      }

      if (userProfile.isBanned) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'تم تعليق هذا الحساب';
        if (guardDesc) guardDesc.textContent = 'تم حظر حسابك من قِبل الإدارة ولا يمكنك إضافة أو تعديل الرحلات.';
        if (guardLoginLink) guardLoginLink.hidden = true;
        return;
      }

      if (guardBox) guardBox.hidden = true;
      if (workspace) workspace.hidden = false;
      initOrUpdatePreviewMap(parsedGpxData?.routePoints || editingTrip?.routePoints || null);
      if (editTripId) loadTripForEdit(userProfile);
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
      existingCoverUrl = '';
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
        pickedLat = parsed.startLat;
        pickedLng = parsed.startLng;
        updateCoordsHint(pickedLat, pickedLng);
        initOrUpdatePreviewMap(parsed.routePoints);

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
        showToast('تم تحليل ملف GPX ورسم المسار على الخريطة.');
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
      if (gpxHint) gpxHint.textContent = 'ارفع ملف .gpx لرسم المسار تلقائياً، أو انقر على الخريطة لتحديد نقطة البداية';
      if (removeGpxBtn) removeGpxBtn.hidden = true;
      initOrUpdatePreviewMap(editingTrip?.routePoints || null);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      if (!state.userProfile || state.userProfile.isBanned) {
        showFormError('لا تملك صلاحية حفظ الرحلة بحسابك الحالي.');
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
        submitBtn.textContent = editingTrip ? 'جاري حفظ التعديلات...' : 'جاري حفظ الرحلة...';
      }

      try {
        let coverImageUrl = existingCoverUrl || DEFAULT_HERO_IMAGE;
        if (selectedCoverFile) {
          const safeFileName = selectedCoverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          try {
            coverImageUrl = await uploadFileToStorage(
              `trips/${state.userProfile.uid}/covers/${Date.now()}-${safeFileName}`,
              selectedCoverFile
            );
          } catch {
            coverImageUrl = await compressImageToDataUrl(selectedCoverFile);
          }
        }

        let gpxUrl = editingTrip?.gpxUrl || '';
        let gpxFileName = editingTrip?.gpxFileName || '';
        if (selectedGpxFile) {
          gpxFileName = selectedGpxFile.name.slice(0, 160);
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

        const trail =
          parsedGpxData ||
          (editingTrip &&
          Number(editingTrip.startLat) === pickedLat &&
          Number(editingTrip.startLng) === pickedLng
            ? {
                startLat: editingTrip.startLat,
                startLng: editingTrip.startLng,
                minElevationM: editingTrip.minElevationM,
                maxElevationM: editingTrip.maxElevationM,
                routePoints: editingTrip.routePoints,
                elevationProfile: editingTrip.elevationProfile,
              }
            : buildDefaultTrailData(distanceKm, elevationGainM, pickedLat, pickedLng));

        const region = location.split(/[،,]/)[0].trim().slice(0, 60) || location.slice(0, 60);
        const year = Number(dateIso.slice(0, 4));
        const userShortId = state.userProfile.userId || generateShortUserId(state.userProfile.uid);

        const basePayload = {
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
        };

        if (gpxUrl && gpxUrl.length <= 2000) basePayload.gpxUrl = gpxUrl;
        if (gpxFileName) basePayload.gpxFileName = gpxFileName;

        if (editingTrip) {
          await updateDoc(doc(db, 'trips', editingTrip.id), {
            ...basePayload,
            updatedAt: serverTimestamp(),
          });
          showToast('تم حفظ تعديلات الرحلة بنجاح!');
          window.location.href = `./trip-details.html?id=${encodeURIComponent(editingTrip.id)}`;
        } else {
          const createdRef = await addDoc(collection(db, 'trips'), {
            ...basePayload,
            authorUid: state.userProfile.uid,
            authorId: state.userProfile.uid,
            authorName: state.userProfile.name.slice(0, 80),
            authorUserId: userShortId,
            createdAt: serverTimestamp(),
          });
          showToast('تم حفظ ونشر رحلتك بنجاح!');
          window.location.href = `./trip-details.html?id=${encodeURIComponent(createdRef.id)}`;
        }
      } catch (error) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = editingTrip ? 'حفظ التعديلات' : 'حفظ الرحلة ونشرها';
        }
        showFormError('حدث خطأ أثناء حفظ الرحلة. تأكد من صلاحية حسابك وحاول مجدداً.');
        handleFirestoreError(
          error,
          editingTrip ? OperationType.UPDATE : OperationType.CREATE,
          editingTrip ? `trips/${editingTrip.id}` : 'trips'
        );
      }
    });
  }

  /* ==========================================================================
     PAGE 4: User Profile & Account Settings (profile.html)
     ========================================================================== */

  function initProfilePage() {
    const guardBox = document.getElementById('profileGuardBox');
    const guardTitle = document.getElementById('profileGuardTitle');
    const guardDesc = document.getElementById('profileGuardDesc');
    const guardLoginLink = document.getElementById('profileGuardLoginLink');
    const workspace = document.getElementById('profileWorkspace');

    const shortIdEl = document.getElementById('profileShortIdDisplay');
    const copyIdBtn = document.getElementById('copyUserIdBtn');
    const focusIdBtn = document.getElementById('focusUserIdBtn');
    const avatarLg = document.getElementById('profileAvatarLg');
    const displayNameTitle = document.getElementById('profileDisplayNameTitle');
    const roleBadge = document.getElementById('profileRoleBadge');
    const emailLine = document.getElementById('profileEmailLine');
    const badgesInline = document.getElementById('profileEarnedBadgesInline');
    const badgesGrid = document.getElementById('profileBadgesGrid');

    const tripsCountEl = document.getElementById('profileTripsCount');
    const totalKmEl = document.getElementById('profileTotalKm');
    const maxGainEl = document.getElementById('profileMaxGain');
    const favCountEl = document.getElementById('profileFavCount');

    const infoForm = document.getElementById('profileInfoForm');
    const infoError = document.getElementById('profileInfoError');
    const nameInput = document.getElementById('profileNameInput');
    const userIdInput = document.getElementById('profileUserIdInput');
    const dobInput = document.getElementById('profileDobInput');

    const securityNotice = document.getElementById('profileSecurityNotice');
    const securityError = document.getElementById('profileSecurityError');
    const emailForm = document.getElementById('updateEmailForm');
    const passwordForm = document.getElementById('updatePasswordForm');

    let userTripsSub = null;
    let allTripsSnapshot = [];
    let myTrips = [];

    function renderProfileBadges() {
      const allBadges = computeUserBadges(myTrips);
      const earned = allBadges.filter((b) => b.earned);
      renderBadgesInline(badgesInline, earned);

      if (!badgesGrid) return;
      badgesGrid.replaceChildren();
      for (const badge of allBadges) {
        const card = document.createElement('article');
        card.className = `badge-card${badge.earned ? '' : ' is-locked'}`;
        const iconBox = document.createElement('span');
        iconBox.className = 'badge-icon-circle';
        iconBox.textContent = badge.icon;
        const body = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.className = 'badge-card-title';
        h3.textContent = badge.title;
        const p = document.createElement('p');
        p.className = 'badge-card-desc';
        p.textContent = badge.description;
        const st = document.createElement('span');
        st.className = 'badge-card-status';
        st.textContent = badge.progressLabel;
        body.append(h3, p, st);
        card.append(iconBox, body);
        badgesGrid.appendChild(card);
      }

      const stats = computeSummaryStats(myTrips);
      const maxGain = myTrips.reduce((m, t) => Math.max(m, Number(t.elevationGainM) || 0), 0);
      if (tripsCountEl) tripsCountEl.textContent = formatNum(stats.totalTrips);
      if (totalKmEl) totalKmEl.textContent = `${formatNum(stats.totalKm, 1)} km`;
      if (maxGainEl) maxGainEl.textContent = `${formatNum(maxGain)} m`;
    }

    function populateProfileUI(fbUser, profile) {
      const shortId = profile.userId || generateShortUserId(profile.uid);
      if (shortIdEl) shortIdEl.textContent = shortId;
      if (avatarLg) avatarLg.textContent = (profile.name || 'ر').trim().charAt(0);
      if (displayNameTitle) displayNameTitle.textContent = profile.name;
      if (emailLine) emailLine.textContent = profile.email;
      if (roleBadge) {
        roleBadge.textContent = profile.role === 'superadmin' ? 'مشرف عام' : 'رحّالة درب';
        roleBadge.className = profile.role === 'superadmin' ? 'role-tag role-tag-admin' : 'role-tag';
      }
      if (favCountEl) favCountEl.textContent = formatNum((profile.favorites || []).length);
      if (nameInput && document.activeElement !== nameInput) nameInput.value = profile.name || '';
      if (userIdInput && document.activeElement !== userIdInput) userIdInput.value = shortId;
      if (dobInput && document.activeElement !== dobInput) dobInput.value = profile.dateOfBirth || '';

      const usesPasswordProvider = fbUser.providerData?.some((p) => p.providerId === 'password');
      if (securityNotice) {
        if (!usesPasswordProvider) {
          securityNotice.textContent =
            'أنت مسجّل الدخول عبر حساب Google. يمكنك تحديث البريد وكلمة المرور مباشرة من إعدادات حساب Google أو بعد ربط كلمة مرور.';
          securityNotice.hidden = false;
        } else {
          securityNotice.hidden = true;
        }
      }
    }

    copyIdBtn?.addEventListener('click', async () => {
      const code = shortIdEl?.textContent || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        showToast(`تم نسخ المعرّف الفريد: ${code}`);
      } catch {
        showToast(`المعرّف الفريد: ${code}`);
      }
    });

    focusIdBtn?.addEventListener('click', () => {
      userIdInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      userIdInput?.focus();
      userIdInput?.select();
    });

    infoForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (infoError) infoError.hidden = true;
      if (!state.firebaseUser || !state.userProfile) return;

      const uid = state.userProfile.uid;
      const oldUserId = state.userProfile.userId || generateShortUserId(uid);
      const name = String(nameInput?.value || '').trim();
      const rawNextUserId = String(userIdInput?.value || oldUserId).trim();
      const dateOfBirth = String(dobInput?.value || '').trim();

      const check = validateProfileUpdateInput({ name, userId: rawNextUserId, dateOfBirth });
      if (!check.valid) {
        if (infoError) {
          infoError.textContent = check.errors[0];
          infoError.hidden = false;
        }
        return;
      }

      const idResult = validateCustomUserId(rawNextUserId);
      const nextUserId = idResult.value;
      const nextLower = idResult.normalized;
      const oldHandleKey = toHandleDocId(oldUserId);
      const newHandleKey = toHandleDocId(nextUserId);

      const btn = document.getElementById('saveProfileInfoBtn');
      if (btn) btn.disabled = true;

      try {
        // Case-insensitive uniqueness verification against /usernames and existing trips
        const claimRef = doc(db, 'usernames', newHandleKey);
        const claimSnap = await getDoc(claimRef);
        const claimDoc = claimSnap.exists() ? claimSnap.data() : null;

        let tripsForCheck = allTripsSnapshot;
        if (tripsForCheck.length === 0) {
          const allSnap = await getDocs(collection(db, 'trips'));
          tripsForCheck = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        if (
          isUserIdTakenByAnother({
            candidateUserId: nextUserId,
            currentUid: uid,
            claimDoc,
            allTrips: tripsForCheck,
          })
        ) {
          if (infoError) {
            infoError.textContent = 'هذا الـ ID مستخدم بالفعل، يرجى اختيار معرّف آخر';
            infoError.hidden = false;
          }
          return;
        }

        // 1. Reserve new handle in /usernames/{newHandleKey} (and release old handle if changed)
        await setDoc(claimRef, {
          uid,
          userId: nextUserId,
          normalizedId: nextLower,
          updatedAt: serverTimestamp(),
        });

        if (oldHandleKey && oldHandleKey !== newHandleKey) {
          try {
            const oldRef = doc(db, 'usernames', oldHandleKey);
            const oldSnap = await getDoc(oldRef);
            if (oldSnap.exists() && oldSnap.data()?.uid === uid) {
              await deleteDoc(oldRef);
            }
          } catch {
            // Non-fatal cleanup of previous handle
          }
        }

        // 2. Update Firebase Auth, private user profile, and zero-PII public profile
        await updateProfile(state.firebaseUser, { displayName: name });
        await updateDoc(doc(db, 'users', uid), {
          name,
          userId: nextUserId,
          userIdLower: nextLower,
          dateOfBirth,
        });
        await setDoc(doc(db, 'publicProfiles', uid), {
          uid,
          name,
          userId: nextUserId,
          updatedAt: serverTimestamp(),
        });

        // 3. Sync new Display Name & User ID across all published trips by this user
        const authoredTripsSnap = await getDocs(
          query(collection(db, 'trips'), where('authorUid', '==', uid))
        );
        if (!authoredTripsSnap.empty) {
          const docs = authoredTripsSnap.docs;
          for (let i = 0; i < docs.length; i += 400) {
            const chunk = docs.slice(i, i + 400);
            const batch = writeBatch(db);
            for (const tripDoc of chunk) {
              batch.update(tripDoc.ref, {
                authorName: name,
                authorUserId: nextUserId,
                updatedAt: serverTimestamp(),
              });
            }
            await batch.commit();
          }
        }

        state.userProfile = {
          ...state.userProfile,
          name,
          userId: nextUserId,
          userIdLower: nextLower,
          dateOfBirth,
        };
        notifyAuthListeners();
        showToast('تم حفظ بيانات الملف الشخصي ومزامنة المعرّف مع جميع رحلاتك بنجاح.');
      } catch (error) {
        if (error?.code === 'permission-denied') {
          if (infoError) {
            infoError.textContent = 'هذا الـ ID مستخدم بالفعل، يرجى اختيار معرّف آخر';
            infoError.hidden = false;
          }
        } else {
          if (infoError) {
            infoError.textContent = 'تعذّر حفظ التغييرات. يرجى المحاولة مجدداً.';
            infoError.hidden = false;
          }
          handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    async function reauthenticateIfProvided(password) {
      if (!password || !state.firebaseUser?.email) return;
      const cred = EmailAuthProvider.credential(state.firebaseUser.email, password);
      await reauthenticateWithCredential(state.firebaseUser, cred);
    }

    emailForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (securityError) securityError.hidden = true;
      if (!state.firebaseUser || !state.userProfile) return;

      const newEmail = String(document.getElementById('newEmailInput')?.value || '').trim();
      const currentPwd = String(document.getElementById('emailCurrentPasswordInput')?.value || '');

      if (!newEmail || !newEmail.includes('@')) {
        if (securityError) {
          securityError.textContent = 'يرجى إدخال بريد إلكتروني جديد صحيح.';
          securityError.hidden = false;
        }
        return;
      }

      const btn = document.getElementById('updateEmailBtn');
      if (btn) btn.disabled = true;

      try {
        await reauthenticateIfProvided(currentPwd);
        await updateEmail(state.firebaseUser, newEmail);
        await updateDoc(doc(db, 'users', state.userProfile.uid), { email: newEmail });
        state.userProfile = { ...state.userProfile, email: newEmail };
        notifyAuthListeners();
        emailForm.reset();
        showToast('تم تحديث البريد الإلكتروني بنجاح.');
      } catch (error) {
        if (securityError) {
          securityError.textContent = translateAuthError(error?.code);
          securityError.hidden = false;
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    passwordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (securityError) securityError.hidden = true;
      if (!state.firebaseUser) return;

      const currentPwd = String(document.getElementById('passwordCurrentInput')?.value || '');
      const newPwd = String(document.getElementById('newPasswordInput')?.value || '');

      if (newPwd.length < 6) {
        if (securityError) {
          securityError.textContent = 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.';
          securityError.hidden = false;
        }
        return;
      }

      const btn = document.getElementById('updatePasswordBtn');
      if (btn) btn.disabled = true;

      try {
        await reauthenticateIfProvided(currentPwd);
        await updatePassword(state.firebaseUser, newPwd);
        passwordForm.reset();
        showToast('تم تحديث كلمة المرور بنجاح.');
      } catch (error) {
        if (securityError) {
          securityError.textContent = translateAuthError(error?.code);
          securityError.hidden = false;
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    onAuthReady(({ firebaseUser, userProfile }) => {
      if (!firebaseUser || !userProfile) {
        if (workspace) workspace.hidden = true;
        if (guardBox) guardBox.hidden = false;
        if (guardTitle) guardTitle.textContent = 'يرجى تسجيل الدخول لإدارة حسابك';
        if (guardDesc) guardDesc.textContent = 'سجّل دخولك للوصول إلى المعرّف الفريد وإعدادات الملف الشخصي وشارات الإنجاز.';
        if (guardLoginLink) guardLoginLink.hidden = false;
        return;
      }

      if (guardBox) guardBox.hidden = true;
      if (workspace) workspace.hidden = false;
      populateProfileUI(firebaseUser, userProfile);

      if (!userTripsSub) {
        userTripsSub = onSnapshot(
          collection(db, 'trips'),
          (snap) => {
            allTripsSnapshot = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            myTrips = allTripsSnapshot.filter((t) => getTripOwnerUid(t) === userProfile.uid);
            renderProfileBadges();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'trips')
        );
      } else {
        renderProfileBadges();
      }
    });
  }

  /* ==========================================================================
     PAGE 5: Leaderboard (leaderboard.html)
     ========================================================================== */

  function initLeaderboardPage() {
    let allTrips = [];
    let activeSort = 'trips';
    let selectedRegion = 'all';

    const sortButtons = Array.from(document.querySelectorAll('[data-lb-sort]'));
    const regionWrap = document.getElementById('lbRegionWrap');
    const regionSelect = document.getElementById('lbRegionSelect');
    const podiumEl = document.getElementById('leaderboardPodium');
    const loadingEl = document.getElementById('leaderboardLoading');
    const tableWrap = document.getElementById('leaderboardTableWrap');
    const tableBody = document.getElementById('leaderboardTableBody');
    const emptyEl = document.getElementById('leaderboardEmpty');
    const summarySub = document.getElementById('lbSummarySubtitle');

    function populateRegionDropdown() {
      if (!regionSelect) return;
      const regions = Array.from(
        new Set(allTrips.map((t) => String(t.region || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, 'ar'));

      const prevVal = regionSelect.value || 'all';
      regionSelect.replaceChildren();
      const allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.textContent = 'جميع المناطق';
      regionSelect.appendChild(allOpt);

      for (const reg of regions) {
        const opt = document.createElement('option');
        opt.value = reg;
        opt.textContent = reg;
        regionSelect.appendChild(opt);
      }
      regionSelect.value = regions.includes(prevVal) ? prevVal : 'all';
      selectedRegion = regionSelect.value;
    }

    function renderLeaderboard() {
      const entries = buildLeaderboard(allTrips, {
        sortBy: activeSort === 'region' ? 'trips' : activeSort,
        region: activeSort === 'region' ? selectedRegion : 'all',
      });

      if (loadingEl) loadingEl.hidden = true;

      if (entries.length === 0) {
        if (podiumEl) podiumEl.hidden = true;
        if (tableWrap) tableWrap.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        if (summarySub) summarySub.textContent = 'لا توجد مساهمات منشورة بعد في هذا التصنيف.';
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      if (tableWrap) tableWrap.hidden = false;
      if (summarySub) {
        summarySub.textContent = `إجمالي المساهمين النشطين: ${formatNum(entries.length)} رحّالة`;
      }

      // Top 3 Podium
      if (podiumEl) {
        podiumEl.replaceChildren();
        podiumEl.hidden = false;
        const top3 = entries.slice(0, 3);
        top3.forEach((entry, index) => {
          const rank = index + 1;
          const card = document.createElement('article');
          card.className = `podium-card podium-card--${rank}`;

          const openMember = () => {
            openPublicMemberProfile({
              uid: entry.uid,
              name: entry.name,
              userId: entry.userId,
              preloadedTrips: allTrips,
            });
          };

          const head = document.createElement('div');
          head.className = 'podium-head';
          const rBadge = document.createElement('span');
          rBadge.className = `rank-badge rank-badge--${rank}`;
          rBadge.textContent = `#${rank}`;
          const idBtn = document.createElement('button');
          idBtn.type = 'button';
          idBtn.className = 'publisher-trigger';
          idBtn.setAttribute('aria-label', `عرض الملف العام للعضو ${entry.name}`);
          const idTag = document.createElement('span');
          idTag.className = 'publisher-id-tag';
          idTag.textContent = entry.userId;
          idBtn.appendChild(idTag);
          idBtn.addEventListener('click', openMember);
          head.append(rBadge, idBtn);

          const nameH3 = document.createElement('h3');
          nameH3.className = 'card-section-title';
          const nameBtn = document.createElement('button');
          nameBtn.type = 'button';
          nameBtn.className = 'publisher-trigger publisher-trigger--podium';
          nameBtn.textContent = entry.name;
          nameBtn.setAttribute('aria-label', `عرض الملف العام للعضو ${entry.name}`);
          nameBtn.addEventListener('click', openMember);
          nameH3.appendChild(nameBtn);

          const statsDiv = document.createElement('div');
          statsDiv.className = 'podium-stats';
          statsDiv.textContent = `${formatNum(entry.tripCount)} رحلات · ${formatNum(entry.totalKm, 1)} km`;

          const badgesRow = document.createElement('div');
          badgesRow.className = 'badges-inline-row';
          renderBadgesInline(badgesRow, entry.badges);

          card.append(head, nameH3, statsDiv, badgesRow);
          podiumEl.appendChild(card);
        });
      }

      // Full Table
      if (tableBody) {
        tableBody.replaceChildren();
        entries.forEach((entry, index) => {
          const rank = index + 1;
          const tr = document.createElement('tr');

          const tdRank = document.createElement('td');
          const rBadge = document.createElement('span');
          rBadge.className = `rank-badge${rank <= 3 ? ` rank-badge--${rank}` : ''}`;
          rBadge.textContent = String(rank);
          tdRank.appendChild(rBadge);

          const tdUser = document.createElement('td');
          const userTrigger = document.createElement('button');
          userTrigger.type = 'button';
          userTrigger.className = 'publisher-trigger publisher-trigger--table';
          userTrigger.setAttribute('aria-label', `عرض الملف العام للعضو ${entry.name}`);
          const uName = document.createElement('strong');
          uName.textContent = entry.name;
          const uId = document.createElement('span');
          uId.className = 'publisher-id-tag';
          uId.textContent = entry.userId;
          userTrigger.append(uName, uId);
          userTrigger.addEventListener('click', () => {
            openPublicMemberProfile({
              uid: entry.uid,
              name: entry.name,
              userId: entry.userId,
              preloadedTrips: allTrips,
            });
          });
          tdUser.appendChild(userTrigger);

          const tdBadges = document.createElement('td');
          const bRow = document.createElement('div');
          bRow.className = 'badges-inline-row';
          renderBadgesInline(bRow, entry.badges);
          tdBadges.appendChild(bRow);

          const tdTrips = document.createElement('td');
          tdTrips.textContent = `${formatNum(entry.tripCount)} رحلة`;

          const tdKm = document.createElement('td');
          tdKm.textContent = `${formatNum(entry.totalKm, 1)} km`;

          const tdElev = document.createElement('td');
          tdElev.textContent = `+${formatNum(entry.maxElevationGainM)} m`;

          tr.append(tdRank, tdUser, tdBadges, tdTrips, tdKm, tdElev);
          tableBody.appendChild(tr);
        });
      }
    }

    for (const btn of sortButtons) {
      btn.addEventListener('click', () => {
        activeSort = btn.dataset.lbSort || 'trips';
        for (const b of sortButtons) {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        }
        if (regionWrap) regionWrap.hidden = activeSort !== 'region';
        renderLeaderboard();
      });
    }

    regionSelect?.addEventListener('change', (e) => {
      selectedRegion = e.target.value || 'all';
      renderLeaderboard();
    });

    onSnapshot(
      collection(db, 'trips'),
      (snap) => {
        allTrips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        populateRegionDropdown();
        renderLeaderboard();
      },
      (error) => {
        if (loadingEl) loadingEl.hidden = true;
        handleFirestoreError(error, OperationType.LIST, 'trips');
      }
    );
  }

  /* ==========================================================================
     PAGE 6: Authentication (auth.html)
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
     PAGE 7: Super Admin Dashboard (admin.html)
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
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = u.name || '—';
        const br = document.createElement('br');
        const idTag = document.createElement('span');
        idTag.className = 'publisher-id-tag';
        idTag.textContent = u.userId || generateShortUserId(u.uid);
        tdName.append(nameStrong, br, idTag);

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
        tdAuthor.textContent = `${trip.authorName || '—'} (${trip.authorUserId || generateShortUserId(getTripOwnerUid(trip))})`;

        const tdLoc = document.createElement('td');
        tdLoc.textContent = trip.location || '—';

        const tdDate = document.createElement('td');
        tdDate.textContent = formatIsoDate(trip.dateIso);

        const tdDist = document.createElement('td');
        tdDist.textContent = `${formatNum(trip.distanceKm, 1)} km`;

        const tdAction = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'table-actions';

        const editBtn = document.createElement('a');
        editBtn.className = 'btn btn-subtle';
        editBtn.href = `./add-trip.html?edit=${encodeURIComponent(trip.id)}`;
        editBtn.textContent = 'تعديل';

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

        actions.append(editBtn, delBtn);
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
        (error) => handleFirestoreError(error, OperationType.LIST, 'users')
      );

      onSnapshot(
        query(collection(db, 'trips'), orderBy('createdAt', 'desc')),
        (snap) => {
          const trips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          renderTripsTable(trips);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'trips')
      );
    });
  }

  /* ---- Route Page Initialization ---- */

  if (page === 'dashboard') initDashboardPage();
  else if (page === 'details') initDetailsPage();
  else if (page === 'add-trip') initAddTripPage();
  else if (page === 'profile') initProfilePage();
  else if (page === 'leaderboard') initLeaderboardPage();
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
