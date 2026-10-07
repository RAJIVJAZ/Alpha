import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/errors.dart';
import '../../common/widgets.dart';
import '../../profile/profile.dart';
import '../earnings_repository.dart';

const minCashOut = 100.0;
final _upiPattern = RegExp(r'^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$');

/// Requests a payout of up to the wallet balance to UPI or the bank account on
/// file. Pops `true` once requested.
class CashOutDialog extends ConsumerStatefulWidget {
  const CashOutDialog({super.key, required this.balance, this.profile});
  final double balance;
  final RiderProfile? profile;

  @override
  ConsumerState<CashOutDialog> createState() => _CashOutDialogState();
}

class _CashOutDialogState extends ConsumerState<CashOutDialog> {
  late final _amount = TextEditingController(text: widget.balance.floor().toString());
  late final _upi = TextEditingController(text: widget.profile?.upiId ?? '');
  late String _method = widget.profile?.upiId != null || widget.profile?.bankAccount == null ? 'UPI' : 'BANK_TRANSFER';
  // one key per dialog: a retry after a dropped connection can't pay twice
  final _idempotencyKey = newIdempotencyKey();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _upi.dispose();
    super.dispose();
  }

  double? get _value => double.tryParse(_amount.text.trim());

  String? get _amountProblem {
    final v = _value;
    if (v == null) return 'Enter an amount';
    if (v < minCashOut) return 'The minimum cash-out is ${money(minCashOut, whole: true)}';
    if (v > widget.balance) return 'You can cash out up to ${money(widget.balance)}';
    return null;
  }

  bool get _upiValid => _method != 'UPI' || _upiPattern.hasMatch(_upi.text.trim());

  Future<void> _submit() async {
    if (_amountProblem != null || !_upiValid) return;
    final bank = widget.profile?.bankAccount;
    setState(() => (_busy = true, _error = null));
    try {
      await ref.read(earningsRepositoryProvider).requestPayout(
            amount: _value!,
            method: _method,
            destination: _method == 'UPI' ? {'upiId': _upi.text.trim()} : {'ifsc': ?bank?.ifsc, 'last4': ?bank?.last4, 'holder': ?bank?.holder},
            idempotencyKey: _idempotencyKey,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = riderMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bank = widget.profile?.bankAccount;
    final problem = _amount.text.isEmpty ? null : _amountProblem;
    final canSubmit = !_busy && _amountProblem == null && _upiValid;
    return AlertDialog(
      title: const Text('Cash out'),
      scrollable: true,
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Caption('The amount is held from your wallet straight away; if the transfer fails it comes back.'),
        const SizedBox(height: 16),
        TextField(
          controller: _amount,
          enabled: !_busy,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
          decoration: InputDecoration(
            labelText: 'Amount',
            prefixText: '₹ ',
            helperText: '${money(minCashOut, whole: true)} to ${money(widget.balance)}',
            errorText: problem,
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        Text('Send to', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: [
            const ButtonSegment(value: 'UPI', label: Text('UPI'), icon: Icon(Icons.qr_code_2)),
            ButtonSegment(
              value: 'BANK_TRANSFER',
              enabled: bank != null,
              label: Text(bank?.last4 != null ? 'Bank ••${bank!.last4}' : 'Bank (not added)'),
              icon: const Icon(Icons.account_balance_outlined),
            ),
          ],
          selected: {_method},
          onSelectionChanged: _busy ? null : (s) => setState(() => _method = s.first),
        ),
        if (_method == 'UPI') ...[
          const SizedBox(height: 16),
          TextField(
            controller: _upi,
            enabled: !_busy,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'UPI ID',
              hintText: 'name@bank',
              errorText: _upi.text.isEmpty || _upiValid ? null : 'Enter a UPI ID like name@okaxis',
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: InlineError(error: _error!)),
      ]),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(
          onPressed: canSubmit ? _submit : null,
          child: _busy ? const ButtonSpinner(color: Colors.white) : Text('Request ${(_value ?? 0) > 0 ? money(_value) : ''}'.trim()),
        ),
      ],
    );
  }
}
