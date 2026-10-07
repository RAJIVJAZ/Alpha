import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import '../profile/profile.dart';
import 'earnings_providers.dart';
import 'models.dart';
import 'widgets/cash_out_dialog.dart';
import 'widgets/daily_chart.dart';

/// What was earned, what is in the wallet, and cash-outs.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preset = ref.watch(earningsPresetProvider);
    final range = preset.range();
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(earningsProvider);
          refreshWallet(ref.invalidate);
          await ref.read(earningsProvider(range).future).catchError((_) => const Earnings(total: 0, deliveries: 0, averagePerDelivery: 0, today: 0, byType: {}, daily: []));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const _WalletCard(),
            const SizedBox(height: 16),
            _PresetPicker(selected: preset),
            const SizedBox(height: 12),
            _EarningsSection(range: range),
            const SizedBox(height: 16),
            const _Statement(),
            const SizedBox(height: 16),
            const _Payouts(),
          ],
        ),
      ),
    );
  }
}

class _PresetPicker extends ConsumerWidget {
  const _PresetPicker({required this.selected});
  final EarningsPreset selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in EarningsPreset.values)
          ChoiceChip(
            label: Text(p.label),
            selected: p == selected,
            onSelected: (_) => ref.read(earningsPresetProvider.notifier).select(p),
          ),
      ]);
}

class _WalletCard extends ConsumerWidget {
  const _WalletCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // the balance is on every statement page; page 1 keeps it steady while paging
    final wallet = ref.watch(walletProvider(1));
    final payouts = ref.watch(payoutsProvider).value ?? const <Payout>[];
    final pending = payouts.where((p) => p.inFlight).firstOrNull;
    final text = Theme.of(context).textTheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SectionAsync<WalletView>(
          value: wallet,
          onRetry: () => ref.invalidate(walletProvider(1)),
          data: (w) {
            final balance = w.balance;
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const ExcludeSemantics(child: Icon(Icons.account_balance_wallet_outlined, size: 18)),
                const SizedBox(width: 6),
                Text('Wallet balance', style: text.labelLarge),
              ]),
              const SizedBox(height: 4),
              Text(money(balance), style: text.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
              if (w.cashDue) ...[
                const SizedBox(height: 10),
                Notice(
                  icon: Icons.payments_outlined,
                  color: FoodGridTheme.serious,
                  leading: const StatusChip('CASH_DUE', label: 'Cash due', tone: Tone.serious),
                  message: 'You hold ${money(-balance)} of COD cash beyond your earnings — hand it in at the hub. '
                      'Cash-outs open again once your balance is positive.',
                ),
              ],
              if (pending != null) ...[
                const SizedBox(height: 10),
                Row(children: [
                  StatusChip(pending.status),
                  const SizedBox(width: 8),
                  Expanded(child: Caption('A cash-out of ${money(pending.amount)} is being processed')),
                ]),
              ],
              const SizedBox(height: 14),
              SizedBox(
                height: 52,
                child: FilledButton.icon(
                  onPressed: balance < minCashOut || pending != null
                      ? null
                      : () async {
                          final messenger = ScaffoldMessenger.of(context);
                          // UPI ID and bank account on file prefill the dialog
                          final profile = await ref.read(profileProvider.future).then<RiderProfile?>((p) => p, onError: (Object _) => null);
                          if (!context.mounted) return;
                          final ok = await showDialog<bool>(context: context, builder: (_) => CashOutDialog(balance: balance, profile: profile));
                          if (ok != true) return;
                          toast(messenger, 'Cash-out requested — usually paid within a working day');
                          refreshWallet(ref.invalidate);
                        },
                  icon: const Icon(Icons.currency_rupee),
                  label: const Text('Cash out'),
                ),
              ),
              if (balance >= 0 && balance < minCashOut && pending == null)
                Padding(padding: const EdgeInsets.only(top: 6), child: Caption('You can cash out once your balance reaches ${money(minCashOut, whole: true)}.')),
            ]);
          },
        ),
      ),
    );
  }
}

class _EarningsSection extends ConsumerWidget {
  const _EarningsSection({required this.range});
  final DateRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final earnings = ref.watch(earningsProvider(range));
    return SectionAsync<Earnings>(
      value: earnings,
      minHeight: 200,
      onRetry: () => ref.invalidate(earningsProvider(range)),
      data: (k) {
        final days = k.filledDays(range.from, range.to);
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.3,
            children: [
              KpiTile(label: 'Earned', value: money(k.total, whole: true)),
              KpiTile(label: 'Deliveries', value: number(k.deliveries)),
              KpiTile(label: 'Per delivery', value: money(k.averagePerDelivery)),
              KpiTile(label: 'Today', value: money(k.today, whole: true)),
            ],
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Earnings per day',
            icon: Icons.bar_chart,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              DailyEarningsChart(days: days),
              const SizedBox(height: 4),
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: EdgeInsets.zero,
                  title: const Text('Daily breakdown'),
                  subtitle: const Text('Every day as a list'),
                  children: [DailyEarningsList(days: days)],
                ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Where it came from',
            icon: Icons.pie_chart_outline,
            child: k.byType.isEmpty
                ? const Caption('No earnings in this period.')
                : Column(children: [
                    for (final e in k.breakdown)
                      MergeSemantics(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(children: [
                            Expanded(child: Text(humanize(e.key))),
                            Text(money(e.value), style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontWeight: FontWeight.w500)),
                          ]),
                        ),
                      ),
                  ]),
          ),
        ]);
      },
    );
  }
}

class _Statement extends ConsumerWidget {
  const _Statement();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = ref.watch(walletPageProvider);
    final wallet = ref.watch(walletProvider(page));
    return SectionCard(
      title: 'Wallet activity',
      icon: Icons.receipt_long_outlined,
      child: SectionAsync<WalletView>(
        value: wallet,
        onRetry: () => ref.invalidate(walletProvider(page)),
        data: (w) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (w.transactions.isEmpty) const Caption('No wallet activity yet.'),
          for (final t in w.transactions) _TxnRow(txn: t),
          const SizedBox(height: 8),
          Pager(page: w.page, totalPages: w.totalPages, onPage: ref.read(walletPageProvider.notifier).go),
        ]),
      ),
    );
  }
}

class _TxnRow extends StatelessWidget {
  const _TxnRow({required this.txn});
  final WalletTxn txn;

  @override
  Widget build(BuildContext context) {
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          ExcludeSemantics(
            child: Icon(txn.isCredit ? Icons.south_west : Icons.north_east, size: 18, color: txn.isCredit ? FoodGridTheme.goodText : Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(txn.description ?? humanize(txn.reason)),
              Caption('${dateTime(txn.createdAt)} · balance ${money(txn.balanceAfter)}'),
            ]),
          ),
          Text(
            money(txn.isCredit ? txn.amount : -txn.amount, signed: true),
            semanticsLabel: '${txn.isCredit ? 'Credit' : 'Debit'} ${money(txn.amount)}',
            style: TextStyle(fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()], color: txn.isCredit ? FoodGridTheme.goodText : null),
          ),
        ]),
      ),
    );
  }
}

class _Payouts extends ConsumerWidget {
  const _Payouts();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payouts = ref.watch(payoutsProvider);
    return SectionCard(
      title: 'Cash-outs',
      icon: Icons.currency_rupee,
      child: SectionAsync<List<Payout>>(
        value: payouts,
        onRetry: () => ref.invalidate(payoutsProvider),
        data: (list) => list.isEmpty
            ? const Caption('No cash-outs yet.')
            : Column(children: [
                for (final p in list)
                  MergeSemantics(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${money(p.amount)} to ${p.destinationLabel}'),
                            Caption([date(p.requestedAt), ?p.utr, ?p.failureReason].join(' · ')),
                          ]),
                        ),
                        StatusChip(p.status),
                      ]),
                    ),
                  ),
              ]),
      ),
    );
  }
}
