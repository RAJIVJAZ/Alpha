import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;
import 'package:foodgrid_core/foodgrid_core.dart';

import 'earnings_repository.dart';
import 'models.dart';

typedef DateRange = ({String from, String to});

enum EarningsPreset {
  today('Today'),
  week('7 days'),
  month('30 days'),
  thisMonth('This month');

  const EarningsPreset(this.label);
  final String label;

  /// IST calendar dates (yyyy-MM-dd), inclusive.
  DateRange range({DateTime? now}) {
    final today = istToday(now: now);
    return switch (this) {
      EarningsPreset.today => (from: today, to: today),
      EarningsPreset.week => (from: istToday(offsetDays: -6, now: now), to: today),
      EarningsPreset.month => (from: istToday(offsetDays: -29, now: now), to: today),
      EarningsPreset.thisMonth => (from: '${today.substring(0, 7)}-01', to: today),
    };
  }
}

final earningsPresetProvider = NotifierProvider<EarningsPresetController, EarningsPreset>(EarningsPresetController.new);

class EarningsPresetController extends Notifier<EarningsPreset> {
  @override
  EarningsPreset build() => EarningsPreset.week;
  void select(EarningsPreset p) => state = p;
}

final earningsProvider = FutureProvider.autoDispose.family<Earnings, DateRange>(
  (ref, range) => ref.watch(earningsRepositoryProvider).earnings(from: range.from, to: range.to),
);

final walletPageProvider = NotifierProvider<WalletPageController, int>(WalletPageController.new);

class WalletPageController extends Notifier<int> {
  @override
  int build() => 1;
  void go(int page) => state = page < 1 ? 1 : page;
}

final walletProvider = FutureProvider.autoDispose.family<WalletView, int>((ref, page) => ref.watch(earningsRepositoryProvider).wallet(page: page));

final payoutsProvider = FutureProvider<List<Payout>>((ref) => ref.watch(earningsRepositoryProvider).payouts());

/// After a cash-out: the balance, statement and payout list all change.
void refreshWallet(void Function(ProviderOrFamily) invalidate) {
  invalidate(walletProvider);
  invalidate(payoutsProvider);
}
