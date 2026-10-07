import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

void main() {
  test('money uses Indian grouping and accepts decimal strings', () {
    expect(money('123456.5'), '₹1,23,456.50');
    expect(money(950, whole: true), '₹950');
    expect(money(null), '—');
  });

  test('negative money takes a true minus; signed amounts mark credits too', () {
    expect(money(-1234.5), '−₹1,234.50'); // U+2212, not a hyphen
    expect(money('-1390.8'), '−₹1,390.80');
    expect(money(-950, whole: true), '−₹950');
    expect(money(-0.001), '₹0.00');
    expect(money(50, signed: true), '+₹50.00');
    expect(money(-50, signed: true), '−₹50.00');
    expect(money(0, signed: true), '₹0.00');
    expect(moneyCompact(-650000), '−₹6.5L');
  });

  test('compact money switches to lakh and crore', () {
    expect(moneyCompact(950), '₹950');
    expect(moneyCompact(38400), '₹38.4K');
    expect(moneyCompact(650000), '₹6.5L');
    expect(moneyCompact(34000000), '₹3.4Cr');
    // no "100K": rounds over to the next unit
    expect(moneyCompact(99990), '₹1L');
  });

  test('dates render in IST whatever the device zone', () {
    final utc = DateTime.utc(2026, 10, 6, 20, 52);
    expect(dateTime(utc), '7 Oct, 2:22 am');
    expect(time('2026-10-07T08:30:00.000Z'), '2:00 pm');
    expect(istToday(now: DateTime.utc(2026, 10, 6, 19, 0)), '2026-10-07');
  });

  test('relative times', () {
    final now = DateTime.utc(2026, 10, 7, 12);
    expect(relative(now.subtract(const Duration(seconds: 10)), now: now), 'just now');
    expect(relative(now.subtract(const Duration(minutes: 4)), now: now), '4 min ago');
    expect(relative(now.subtract(const Duration(days: 1)), now: now), '1 day ago');
  });

  test('humanize keeps acronyms', () {
    expect(humanize('PENDING_PAYMENT'), 'Pending payment');
    expect(humanize('COD_PENDING'), 'COD pending');
    expect(humanize('GST_REPORT'), 'GST report');
  });

  test('phones normalise to E.164 for India', () {
    expect(normalizePhone('98450 00001'), '+919845000001');
    expect(normalizePhone('+91 98450-00001'), '+919845000001');
    expect(normalizePhone('919845000001'), '+919845000001');
  });

  test('distanceKm is the great-circle distance without a plugin', () {
    // Koramangala → Indiranagar as the crow flies
    expect(distanceKm(12.9352, 77.6245, 12.9784, 77.6408), closeTo(5.11, 0.01));
    expect(distanceKm(12.9, 77.6, 12.9, 77.6), 0);
    // a degree of latitude is ~111 km
    expect(distanceKm(0, 0, 1, 0), closeTo(111.19, 0.01));
  });

  test('retries only offline and 5xx failures, at most three times with backoff', () {
    const offline = ApiException(0, 'NETWORK', 'offline');
    const down = ApiException(503, null, 'Service unavailable');
    expect(retryTransientErrors(0, offline), const Duration(seconds: 1));
    expect(retryTransientErrors(1, down), const Duration(seconds: 2));
    expect(retryTransientErrors(2, down), const Duration(seconds: 4));
    expect(retryTransientErrors(3, down), isNull);
    for (final status in [400, 401, 403, 404, 409, 422]) {
      expect(retryTransientErrors(0, ApiException(status, null, 'no')), isNull, reason: '$status');
    }
    expect(retryTransientErrors(0, StateError('bug')), isNull);
  });
}
