import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

void main() {
  test('money uses Indian grouping and accepts decimal strings', () {
    expect(money('123456.5'), '₹1,23,456.50');
    expect(money(950, whole: true), '₹950');
    expect(money(null), '—');
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
}
