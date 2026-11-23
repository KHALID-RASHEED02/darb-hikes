import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNum,
  formatIsoDate,
  formatHours,
  generateShortUserId,
  validateCustomUserId,
  toHandleDocId,
  isUserIdTakenByAnother,
  buildPublicMemberSummary,
  getDifficultyMarkerColor,
  getAlertStatusClass,
  sanitizeMediaUrl,
  sanitizeRelativeRedirect,
  computeSummaryStats,
  computePersonalAnalytics,
  computeUserBadges,
  getEarnedBadges,
  buildLeaderboard,
  filterTrips,
  computeElevationMetrics,
  computeAverageRating,
  buildShareText,
  isSuperAdminProfile,
  canDeleteTrip,
  canEditTrip,
  canDeleteComment,
  canDeleteAlert,
  validateTripInput,
  validateCommentInput,
  validateAlertInput,
  validateProfileUpdateInput,
  validateImageFile,
  validateGpxFile,
  parseGpxXml,
  buildDefaultTrailData,
  buildGpxXml,
  translateAuthError,
} from './app.js';

const EASTERN_ARABIC_DIGITS = /[٠-٩]/;

describe('Darb Western Numerals, IDs & Formatting', () => {
  it('formats integers and decimals strictly in Western 0-9 digits', () => {
    assert.equal(formatNum(0), '0');
    assert.equal(formatNum(128.6, 1), '128.6');
    assert.equal(formatNum(8450), '8,450');
    assert.equal(EASTERN_ARABIC_DIGITS.test(formatNum(123456.7, 1)), false);
  });

  it('formats ISO dates with Arabic month names and Western digits without commas in year', () => {
    const formatted = formatIsoDate('2026-11-14');
    assert.equal(formatted, '14 نوفمبر 2026');
    assert.equal(EASTERN_ARABIC_DIGITS.test(formatted), false);
    assert.equal(formatted.includes(','), false);
  });

  it('formats durations in Western digits', () => {
    assert.equal(formatHours(1), '1 ساعة');
    assert.equal(formatHours(5), '5 ساعات');
    assert.equal(formatHours(3.5), '3.5 ساعات');
    assert.equal(EASTERN_ARABIC_DIGITS.test(formatHours(12)), false);
  });

  it('generates deterministic unique short user IDs in DRB-XXXXXX format', () => {
    const id1 = generateShortUserId('uid-alpha-001');
    const id1Again = generateShortUserId('uid-alpha-001');
    const id2 = generateShortUserId('uid-beta-002');
    assert.match(id1, /^DRB-[2-9A-HJ-NP-Z]{6}$/);
    assert.equal(id1, id1Again);
    assert.notEqual(id1, id2);
  });

  it('validates customizable alphanumeric and Arabic-friendly User IDs and derives case-insensitive handle keys', () => {
    assert.equal(validateCustomUserId('KHALID_02').valid, true);
    assert.equal(validateCustomUserId('خالد_02').valid, true);
    assert.equal(validateCustomUserId('DRB-7MVVDV').valid, true);
    assert.equal(validateCustomUserId('ab').valid, false);
    assert.equal(validateCustomUserId('has space').valid, false);
    assert.equal(validateCustomUserId('bad@handle!').valid, false);

    assert.equal(toHandleDocId('KHALID_02'), toHandleDocId('khalid_02'));
    assert.match(toHandleDocId('KHALID_02'), /^[a-zA-Z0-9_\-]+$/);
    assert.match(toHandleDocId('خالد_02'), /^[a-zA-Z0-9_\-]+$/);
    assert.equal(toHandleDocId('خالد_02'), toHandleDocId('خالد_02'));
  });

  it('detects case-insensitive User ID conflicts across username claims and legacy trips', () => {
    const trips = [
      { id: 't1', authorId: 'uid-1', authorName: 'خالد', authorUserId: 'KHALID_02', distanceKm: 12, elevationGainM: 400 },
    ];
    // Another user trying same handle in different case -> taken
    assert.equal(
      isUserIdTakenByAnother({
        candidateUserId: 'khalid_02',
        currentUid: 'uid-2',
        claimDoc: { uid: 'uid-1', userId: 'KHALID_02' },
        allTrips: trips,
      }),
      true
    );
    // Legacy trip without username claim -> still caught as taken
    assert.equal(
      isUserIdTakenByAnother({
        candidateUserId: 'khalid_02',
        currentUid: 'uid-2',
        claimDoc: null,
        allTrips: trips,
      }),
      true
    );
    // Same user updating casing -> allowed
    assert.equal(
      isUserIdTakenByAnother({
        candidateUserId: 'khalid_02',
        currentUid: 'uid-1',
        claimDoc: { uid: 'uid-1', userId: 'KHALID_02' },
        allTrips: trips,
      }),
      false
    );
    // Unused handle -> allowed
    assert.equal(
      isUserIdTakenByAnother({
        candidateUserId: 'SARAH_99',
        currentUid: 'uid-2',
        claimDoc: null,
        allTrips: trips,
      }),
      false
    );
  });

  it('builds Public Member Profile summary with display name, custom User ID, earned badges, stats, and member trips', () => {
    const allTrips = [
      { id: 't1', title: 'جبل شدا', authorId: 'uid-1', authorName: 'خالد', authorUserId: 'KHALID_02', distanceKm: 14.5, durationHours: 5, elevationGainM: 1200 },
      { id: 't2', title: 'وادي لجب', authorId: 'uid-1', authorName: 'خالد', authorUserId: 'KHALID_02', distanceKm: 6.5, durationHours: 2.5, elevationGainM: 300 },
      { id: 't3', title: 'رحلة أخرى', authorId: 'uid-2', authorName: 'سارة', authorUserId: 'SARAH_01', distanceKm: 20, durationHours: 6, elevationGainM: 500 },
    ];
    const member = buildPublicMemberSummary('uid-1', allTrips, {
      uid: 'uid-1',
      name: 'خالد العسيري',
      userId: 'KHALID_02',
    });
    assert.equal(member.name, 'خالد العسيري');
    assert.equal(member.userId, 'KHALID_02');
    assert.equal(member.userTrips.length, 2);
    assert.equal(member.summary.totalTrips, 2);
    assert.equal(member.summary.totalKm, 21);
    assert.equal(member.maxElevationGainM, 1200);
    assert.deepEqual(
      member.badges.map((b: { id: string }) => b.id),
      ['beginner_explorer', 'summit_conqueror']
    );
  });

  it('maps trail difficulty levels to green/yellow/red marker colors and alert statuses to CSS classes', () => {
    assert.equal(getDifficultyMarkerColor('سهل').fill, '#22c55e');
    assert.equal(getDifficultyMarkerColor('متوسط').fill, '#eab308');
    assert.equal(getDifficultyMarkerColor('صعب').fill, '#ef4444');
    assert.equal(getAlertStatusClass('الطريق سالك'), 'status-clear');
    assert.equal(getAlertStatusClass('يوجد سيول/وحل'), 'status-mud');
    assert.equal(getAlertStatusClass('يتطلب دفع رباعي'), 'status-4x4');
    assert.equal(getAlertStatusClass('مغلق للصيانة'), 'status-closed');
  });
});

describe('Darb Stats, Filtering, Badges, Leaderboard & Permissions', () => {
  it('returns exact zeros when trips collection is empty', () => {
    assert.deepEqual(computeSummaryStats([]), {
      totalTrips: 0,
      totalKm: 0,
      totalHours: 0,
      totalElevation: 0,
    });
  });

  it('computes accurate live summary stats from real trips', () => {
    const stats = computeSummaryStats([
      { distanceKm: 12.4, durationHours: 5, elevationGainM: 640 },
      { distanceKm: 8.5, durationHours: 3.5, elevationGainM: 320 },
    ]);
    assert.deepEqual(stats, {
      totalTrips: 2,
      totalKm: 20.9,
      totalHours: 8.5,
      totalElevation: 960,
    });
  });

  it('scopes personal analytics strictly to currentUser.uid (logged out, zero personal trips, and authored trips only)', () => {
    const sampleTrips = [
      { id: 't1', title: 'مسار السودة', authorId: 'user-a', distanceKm: 12.4, durationHours: 5, elevationGainM: 640, maxElevationM: 2950, difficulty: 'متوسط' },
      { id: 't2', title: 'وادي لجب', authorId: 'user-a', distanceKm: 6.2, durationHours: 3, elevationGainM: 210, maxElevationM: 1200, difficulty: 'سهل' },
      { id: 't3', title: 'قمة أخرى', authorId: 'user-b', distanceKm: 45.0, durationHours: 14, elevationGainM: 1800, maxElevationM: 3100, difficulty: 'صعب' },
    ];

    const loggedOut = computePersonalAnalytics(sampleTrips, null);
    assert.equal(loggedOut.isAuthenticated, false);
    assert.equal(loggedOut.hasTrips, false);
    assert.equal(loggedOut.summary.totalTrips, 0);
    assert.equal(loggedOut.longestTrip, null);

    const noPersonalTrips = computePersonalAnalytics(sampleTrips, 'user-c');
    assert.equal(noPersonalTrips.isAuthenticated, true);
    assert.equal(noPersonalTrips.hasTrips, false);
    assert.equal(noPersonalTrips.summary.totalTrips, 0);
    assert.equal(noPersonalTrips.summary.totalKm, 0);
    assert.equal(noPersonalTrips.averageDistanceKm, 0);
    assert.equal(noPersonalTrips.longestTrip, null);
    assert.equal(noPersonalTrips.highestPeakTrip, null);
    assert.deepEqual(
      noPersonalTrips.difficultyDistribution.map((d) => d.count),
      [0, 0, 0]
    );

    const userAStats = computePersonalAnalytics(sampleTrips, 'user-a');
    assert.equal(userAStats.isAuthenticated, true);
    assert.equal(userAStats.hasTrips, true);
    assert.equal(userAStats.summary.totalTrips, 2);
    assert.equal(userAStats.summary.totalKm, 18.6);
    assert.equal(userAStats.averageDistanceKm, 9.3);
    assert.equal(userAStats.longestTrip?.id, 't1');
    assert.equal(userAStats.highestPeakTrip?.id, 't1');
    assert.deepEqual(
      userAStats.difficultyDistribution.map((d) => ({ level: d.level, count: d.count, pct: d.pct })),
      [
        { level: 'سهل', count: 1, pct: 50 },
        { level: 'متوسط', count: 1, pct: 50 },
        { level: 'صعب', count: 0, pct: 0 },
      ]
    );
  });

  it('filters by 3 main tabs (all, mine, favorites) and search query including publisher ID/name', () => {
    const trips = [
      {
        id: 't1',
        title: 'مسار عسير',
        location: 'أبها',
        region: 'عسير',
        authorId: 'u1',
        authorUid: 'u1',
        authorName: 'خالد السالم',
        authorUserId: 'DRB-A1B2C3',
        difficulty: 'متوسط',
      },
      {
        id: 't2',
        title: 'مسار العلا',
        location: 'العلا',
        region: 'المدينة المنورة',
        authorUid: 'u2',
        authorName: 'سارة الحربي',
        authorUserId: 'DRB-X9Y8Z7',
        difficulty: 'سهل',
      },
    ];
    assert.equal(filterTrips(trips, { tab: 'all' }).length, 2);
    assert.equal(filterTrips(trips, { tab: 'mine', currentUid: 'u1' }).length, 1);
    assert.equal(filterTrips(trips, { tab: 'mine', currentUid: 'u2' }).length, 1);
    assert.equal(filterTrips(trips, { tab: 'mine', currentUid: null }).length, 0);
    assert.equal(filterTrips(trips, { tab: 'favorites', favorites: ['t2'] }).length, 1);
    assert.equal(filterTrips(trips, { tab: 'favorites', favorites: ['t2'] })[0].id, 't2');
    assert.equal(filterTrips(trips, { query: 'العلا' })[0].id, 't2');
    assert.equal(filterTrips(trips, { query: 'DRB-A1B2C3' })[0].id, 't1');
  });

  it('awards achievement badges accurately (Beginner Explorer, Summit Conqueror > 1000m, Darb Voyager >= 10)', () => {
    assert.equal(getEarnedBadges([]).length, 0);

    const oneTripBadges = getEarnedBadges([{ elevationGainM: 450 }]);
    assert.deepEqual(
      oneTripBadges.map((b) => b.title),
      ['مستكشف مبتدئ']
    );

    const highPeakBadges = getEarnedBadges([{ elevationGainM: 1250 }]);
    assert.deepEqual(
      highPeakBadges.map((b) => b.title),
      ['مستكشف مبتدئ', 'قاهر القمم']
    );

    const tenTrips = Array.from({ length: 10 }, (_, idx) => ({
      elevationGainM: idx === 0 ? 1100 : 200,
    }));
    const allBadges = computeUserBadges(tenTrips);
    assert.equal(allBadges.every((b) => b.earned), true);
    assert.deepEqual(
      allBadges.map((b) => b.title),
      ['مستكشف مبتدئ', 'قاهر القمم', 'رحّال درب']
    );
  });

  it('builds leaderboard ranked by trip count, total distance, and filtered by region', () => {
    const sampleTrips = [
      { authorId: 'u1', authorName: 'أحمد', authorUserId: 'DRB-111111', distanceKm: 10, elevationGainM: 300, region: 'عسير' },
      { authorId: 'u1', authorName: 'أحمد', authorUserId: 'DRB-111111', distanceKm: 8, elevationGainM: 400, region: 'عسير' },
      { authorId: 'u2', authorName: 'نورة', authorUserId: 'DRB-222222', distanceKm: 32.5, elevationGainM: 1200, region: 'العلا' },
    ];

    const byTrips = buildLeaderboard(sampleTrips, { sortBy: 'trips' });
    assert.equal(byTrips[0].uid, 'u1');
    assert.equal(byTrips[0].tripCount, 2);
    assert.equal(byTrips[0].totalKm, 18);
    assert.equal(byTrips[1].uid, 'u2');
    assert.equal(byTrips[1].badges.some((b: { id: string }) => b.id === 'summit_conqueror'), true);

    const byDistance = buildLeaderboard(sampleTrips, { sortBy: 'distance' });
    assert.equal(byDistance[0].uid, 'u2');
    assert.equal(byDistance[0].totalKm, 32.5);

    const byRegion = buildLeaderboard(sampleTrips, { sortBy: 'trips', region: 'العلا' });
    assert.equal(byRegion.length, 1);
    assert.equal(byRegion[0].uid, 'u2');
  });

  it('computes average star ratings and builds formatted share card text', () => {
    const rating = computeAverageRating([{ rating: 5 }, { rating: 4 }, { text: 'no rating' }]);
    assert.deepEqual(rating, { average: 4.5, count: 2 });
    assert.deepEqual(computeAverageRating([]), { average: 0, count: 0 });

    const share = buildShareText(
      {
        title: 'مسار شدا الأعلى',
        location: 'الباحة',
        distanceKm: 11.4,
        elevationGainM: 820,
        difficulty: 'صعب',
        authorName: 'فيصل',
        authorUserId: 'DRB-K8M2P9',
      },
      'https://darb.example/trip-details.html?id=abc'
    );
    assert.ok(share.includes('مسار شدا الأعلى'));
    assert.ok(share.includes('11.4 km'));
    assert.ok(share.includes('+820 m'));
    assert.ok(share.includes('DRB-K8M2P9'));
    assert.equal(EASTERN_ARABIC_DIGITS.test(share), false);
  });

  it('enforces owner, superadmin, and banned user permissions across trips, edits, comments, and alerts', () => {
    const trip = { id: 't1', authorId: 'owner1', authorUid: 'owner1' };
    const comment = { id: 'c1', authorUid: 'commenter1' };
    const alertItem = { id: 'a1', authorUid: 'reporter1' };
    const owner = { uid: 'owner1', role: 'user', isBanned: false };
    const other = { uid: 'other1', role: 'user', isBanned: false };
    const bannedOwner = { uid: 'owner1', role: 'user', isBanned: true };
    const superAdmin = { uid: 'admin1', role: 'superadmin', isBanned: false };
    const bannedAdmin = { uid: 'admin2', role: 'superadmin', isBanned: true };

    assert.equal(isSuperAdminProfile(superAdmin), true);
    assert.equal(isSuperAdminProfile(bannedAdmin), false);
    assert.equal(isSuperAdminProfile(owner), false);

    assert.equal(canDeleteTrip(trip, owner), true);
    assert.equal(canEditTrip(trip, owner), true);
    assert.equal(canDeleteTrip(trip, superAdmin), true);
    assert.equal(canEditTrip(trip, superAdmin), true);
    assert.equal(canDeleteTrip(trip, other), false);
    assert.equal(canEditTrip(trip, other), false);
    assert.equal(canDeleteTrip(trip, bannedOwner), false);

    assert.equal(canDeleteComment(comment, trip, { uid: 'commenter1', role: 'user', isBanned: false }), true);
    assert.equal(canDeleteComment(comment, trip, owner), true);
    assert.equal(canDeleteComment(comment, trip, superAdmin), true);
    assert.equal(canDeleteComment(comment, trip, other), false);

    assert.equal(canDeleteAlert(alertItem, trip, { uid: 'reporter1', role: 'user', isBanned: false }), true);
    assert.equal(canDeleteAlert(alertItem, trip, owner), true);
    assert.equal(canDeleteAlert(alertItem, trip, superAdmin), true);
    assert.equal(canDeleteAlert(alertItem, trip, other), false);
  });
});

describe('Darb Validation, Security & GPX Parsing', () => {
  it('blocks unsafe media URLs and open redirects', () => {
    assert.equal(sanitizeMediaUrl('javascript:alert(1)', '/fallback.jpg'), '/fallback.jpg');
    assert.equal(
      sanitizeMediaUrl('https://firebasestorage.googleapis.com/a.jpg', '/fallback.jpg'),
      'https://firebasestorage.googleapis.com/a.jpg'
    );
    assert.equal(sanitizeRelativeRedirect('https://evil.com', './index.html'), './index.html');
    assert.equal(sanitizeRelativeRedirect('./add-trip.html', './index.html'), './add-trip.html');
    assert.equal(sanitizeRelativeRedirect('./add-trip.html?edit=abc123', './index.html'), './add-trip.html?edit=abc123');
    assert.equal(sanitizeRelativeRedirect('./index.html#stats', './index.html'), './index.html#stats');
  });

  it('validates trip, review/rating, field alert, and profile update payloads against Firestore rules limits', () => {
    const validTrip = validateTripInput({
      title: 'قمة جبل شدا',
      location: 'الباحة، السعودية',
      dateIso: '2026-04-12',
      distanceKm: 9.2,
      durationHours: 4,
      elevationGainM: 480,
      difficulty: 'متوسط',
      notes: 'مسار جبلي جميل في الصباح الباكر.',
    });
    assert.equal(validTrip.valid, true);

    const invalidTrip = validateTripInput({
      title: 'أ',
      location: '',
      dateIso: 'invalid',
      distanceKm: 0,
      durationHours: -2,
      difficulty: 'خارق',
    });
    assert.equal(invalidTrip.valid, false);
    assert.ok(invalidTrip.errors.length >= 4);

    assert.equal(validateCommentInput({ text: 'مسار ممتاز', rating: 5 }).valid, true);
    assert.equal(validateCommentInput({ text: 'مسار ممتاز', rating: 6 }).valid, false);
    assert.equal(validateCommentInput({ text: 'أ', rating: 4 }).valid, false);

    assert.equal(validateAlertInput({ status: 'الطريق سالك', note: 'الطريق نظيف اليوم' }).valid, true);
    assert.equal(validateAlertInput({ status: 'حالة غير معروفة', note: '' }).valid, false);

    assert.equal(validateProfileUpdateInput({ name: 'عمر العتيبي', dateOfBirth: '1995-05-18' }).valid, true);
    assert.equal(validateProfileUpdateInput({ name: 'ع', dateOfBirth: '1995-05-18' }).valid, false);
    assert.equal(validateProfileUpdateInput({ name: 'عمر العتيبي', dateOfBirth: '18/05/1995' }).valid, false);
  });

  it('validates cover image and GPX files', () => {
    assert.equal(validateImageFile({ type: 'image/jpeg', size: 1024 }).valid, true);
    assert.equal(validateImageFile({ type: 'image/svg+xml', size: 1024 }).valid, false);
    assert.equal(validateImageFile({ type: 'image/png', size: 6 * 1024 * 1024 }).valid, false);

    assert.equal(validateGpxFile({ name: 'route.gpx', size: 2048 }).valid, true);
    assert.equal(validateGpxFile({ name: 'route.txt', size: 2048 }).valid, false);
  });

  it('parses GPX XML into Firestore-compatible {lat, lng} points and builds valid GPX XML', () => {
    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><name>Test Trail</name><trkseg>
          <trkpt lat="18.2730" lon="42.3700"><ele>2600</ele></trkpt>
          <trkpt lat="18.2780" lon="42.3740"><ele>2780</ele></trkpt>
          <trkpt lat="18.2840" lon="42.3790"><ele>2950</ele></trkpt>
        </trkseg></trk>
      </gpx>`;

    const parsed = parseGpxXml(sampleGpx);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.pointCount, 3);
    assert.equal(parsed.elevationGainM, 350);
    assert.equal(parsed.minElevationM, 2600);
    assert.equal(parsed.maxElevationM, 2950);
    assert.ok(parsed.routePoints.length >= 2 && parsed.routePoints.length <= 150);
    assert.equal(typeof parsed.routePoints[0].lat, 'number');
    assert.equal(typeof parsed.routePoints[0].lng, 'number');

    const elevMetrics = computeElevationMetrics(parsed.elevationProfile, parsed.distanceKm);
    assert.equal(elevMetrics.min, 2600);
    assert.equal(elevMetrics.max, 2950);

    const exported = buildGpxXml({
      title: 'مسار <تجريبي>',
      location: 'عسير',
      routePoints: parsed.routePoints,
      elevationProfile: parsed.elevationProfile,
    });
    assert.ok(exported.includes('&lt;تجريبي&gt;'));
    assert.ok(exported.includes('<trkpt lat="18.273" lon="42.37"><ele>2600</ele></trkpt>'));
  });

  it('generates valid default trail arrays with optional custom start coords and translates auth errors', () => {
    const fallback = buildDefaultTrailData(6, 300, 18.25, 42.36);
    assert.ok(fallback.routePoints.length >= 2 && fallback.routePoints.length <= 150);
    assert.equal(fallback.routePoints[0].lat, 18.25);
    assert.equal(fallback.routePoints[0].lng, 42.36);
    assert.ok(fallback.elevationProfile.length >= 2 && fallback.elevationProfile.length <= 30);
    assert.ok(translateAuthError('auth/operation-not-allowed').includes('Firebase'));
  });
});
