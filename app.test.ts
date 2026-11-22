import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNum,
  formatIsoDate,
  formatHours,
  sanitizeMediaUrl,
  sanitizeRelativeRedirect,
  computeSummaryStats,
  filterTrips,
  computeElevationMetrics,
  isSuperAdminProfile,
  canDeleteTrip,
  canDeleteComment,
  validateTripInput,
  validateCommentInput,
  validateImageFile,
  validateGpxFile,
  parseGpxXml,
  buildDefaultTrailData,
  buildGpxXml,
  translateAuthError,
} from './app.js';

const EASTERN_ARABIC_DIGITS = /[٠-٩]/;

describe('Darb Western Numerals & Formatting', () => {
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
});

describe('Darb Stats, Filtering & Permissions', () => {
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

  it('filters by tab (all, this-year, mine) and search query', () => {
    const trips = [
      { id: '1', title: 'مسار عسير', location: 'أبها', year: 2026, authorUid: 'u1', difficulty: 'متوسط' },
      { id: '2', title: 'مسار العلا', location: 'العلا', year: 2025, authorUid: 'u2', difficulty: 'سهل' },
    ];
    assert.equal(filterTrips(trips, { tab: 'all' }).length, 2);
    assert.equal(filterTrips(trips, { tab: 'this-year', currentYear: 2026 }).length, 1);
    assert.equal(filterTrips(trips, { tab: 'mine', currentUid: 'u1' }).length, 1);
    assert.equal(filterTrips(trips, { query: 'العلا' })[0].id, '2');
  });

  it('enforces owner, superadmin, and banned user permissions', () => {
    const trip = { id: 't1', authorUid: 'owner1' };
    const comment = { id: 'c1', authorUid: 'commenter1' };
    const owner = { uid: 'owner1', role: 'user', isBanned: false };
    const other = { uid: 'other1', role: 'user', isBanned: false };
    const bannedOwner = { uid: 'owner1', role: 'user', isBanned: true };
    const superAdmin = { uid: 'admin1', role: 'superadmin', isBanned: false };
    const bannedAdmin = { uid: 'admin2', role: 'superadmin', isBanned: true };

    assert.equal(isSuperAdminProfile(superAdmin), true);
    assert.equal(isSuperAdminProfile(bannedAdmin), false);
    assert.equal(isSuperAdminProfile(owner), false);

    assert.equal(canDeleteTrip(trip, owner), true);
    assert.equal(canDeleteTrip(trip, superAdmin), true);
    assert.equal(canDeleteTrip(trip, other), false);
    assert.equal(canDeleteTrip(trip, bannedOwner), false);

    assert.equal(canDeleteComment(comment, trip, { uid: 'commenter1', role: 'user', isBanned: false }), true);
    assert.equal(canDeleteComment(comment, trip, owner), true);
    assert.equal(canDeleteComment(comment, trip, superAdmin), true);
    assert.equal(canDeleteComment(comment, trip, other), false);
  });
});

describe('Darb Validation, Security & GPX Parsing', () => {
  it('blocks unsafe media URLs and open redirects', () => {
    assert.equal(sanitizeMediaUrl('javascript:alert(1)', '/fallback.jpg'), '/fallback.jpg');
    assert.equal(sanitizeMediaUrl('https://firebasestorage.googleapis.com/a.jpg', '/fallback.jpg'), 'https://firebasestorage.googleapis.com/a.jpg');
    assert.equal(sanitizeRelativeRedirect('https://evil.com', './index.html'), './index.html');
    assert.equal(sanitizeRelativeRedirect('./add-trip.html', './index.html'), './add-trip.html');
  });

  it('validates trip and comment payloads against Firestore rules limits', () => {
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

    assert.equal(validateCommentInput({ text: 'مسار ممتاز' }).valid, true);
    assert.equal(validateCommentInput({ text: 'أ' }).valid, false);
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

  it('generates valid default trail arrays and translates Firebase auth errors', () => {
    const fallback = buildDefaultTrailData(6, 300);
    assert.ok(fallback.routePoints.length >= 2 && fallback.routePoints.length <= 150);
    assert.ok(fallback.elevationProfile.length >= 2 && fallback.elevationProfile.length <= 30);
    assert.ok(translateAuthError('auth/operation-not-allowed').includes('Firebase'));
  });
});
