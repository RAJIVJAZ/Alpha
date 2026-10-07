import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/models.dart';
import '../cart/checkout_providers.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../payments/payments.dart';

final walletStatementProvider = FutureProvider.autoDispose.family<WalletStatement, int>((ref, page) async {
  return WalletStatement.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('wallets/me', query: {'page': page, 'pageSize': 15})));
});

const _topups = [200, 500, 1000, 2000];

/// FoodGrid wallet: balance, top-up and statement.
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  int _page = 1;
  final _amount = TextEditingController(text: '500');
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int get _value => int.tryParse(_amount.text) ?? 0;
  bool get _valid => _value >= 10 && _value <= 10000;

  Future<void> _topUp() async {
    final value = _value;
    setState(() => _busy = true);
    try {
      final r = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.walletTopup, method: PaymentMethod.upi, amount: value.toDouble()));
      if (!mounted) return;
      if (r == PayOutcome.paid) {
        showMessage(context, '${money(value)} added to your wallet');
        setState(() => _page = 1);
        ref.invalidate(walletStatementProvider);
        ref.invalidate(walletBalanceProvider);
      } else {
        showMessage(context, payFailureMessage(r));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = ref.watch(walletStatementProvider(_page));
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: AsyncView<WalletStatement>(
        value: w,
        onRetry: () => ref.invalidate(walletStatementProvider(_page)),
        data: (s) => ListView(padding: const EdgeInsets.all(16), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [Icon(Icons.account_balance_wallet_outlined, color: muted), const SizedBox(width: 8), Text('FoodGrid wallet', style: text.labelLarge?.copyWith(color: muted))]),
                const SizedBox(height: 6),
                Text(money(s.balance), style: text.displaySmall?.copyWith(fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()])),
                if (s.status != 'ACTIVE') Padding(padding: const EdgeInsets.only(top: 6), child: StatusChip(s.status)),
                const SizedBox(height: 8),
                Text('Pay in one tap at checkout. Refunds and cashback land here instantly.', style: text.bodyMedium?.copyWith(color: muted)),
                const SizedBox(height: 12),
                Wrap(spacing: 8, children: [
                  for (final t in _topups)
                    ChoiceChip(label: Text('+${money(t, whole: true)}'), selected: _value == t, onSelected: (_) => setState(() => _amount.text = '$t')),
                ]),
                const SizedBox(height: 12),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: TextField(
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        labelText: 'Amount to add',
                        prefixText: '₹ ',
                        errorText: _amount.text.isNotEmpty && !_valid ? 'Add between ₹10 and ₹10,000 at a time' : null,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(onPressed: !_valid || _busy ? null : _topUp, child: _busy ? const ButtonSpinner() : const Text('Add money')),
                ]),
              ]),
            ),
          ),
          const SectionTitle('Activity', padding: EdgeInsets.fromLTRB(4, 20, 4, 8)),
          if (s.transactions.isEmpty)
            const EmptyView(icon: Icons.receipt_outlined, title: 'No activity yet')
          else
            Card(
              child: Column(children: [
                for (final (i, t) in s.transactions.indexed) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    leading: Icon(t.isCredit ? Icons.south_west : Icons.north_east, color: t.isCredit ? FoodGridTheme.goodText : muted, semanticLabel: t.isCredit ? 'Credit' : 'Debit'),
                    title: Text(t.description ?? humanize(t.reason)),
                    subtitle: Text(dateTime(t.createdAt)),
                    trailing: Text(
                      '${t.isCredit ? '+' : '−'}${money(t.amount)}',
                      style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600, color: t.isCredit ? FoodGridTheme.goodText : null, fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                  ),
                ],
              ]),
            ),
          Pager(page: s.page, totalPages: s.totalPages, onPage: (p) => setState(() => _page = p)),
        ]),
      ),
    );
  }
}
