import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import '../outlet/providers.dart';
import 'cart_controller.dart';
import 'models.dart';

Future<void> showCouponsSheet(BuildContext context, String outletId) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => CouponsSheet(outletId: outletId),
    );

/// Offers for this order, or a typed code.
class CouponsSheet extends ConsumerStatefulWidget {
  const CouponsSheet({super.key, required this.outletId});
  final String outletId;

  @override
  ConsumerState<CouponsSheet> createState() => _CouponsSheetState();
}

class _CouponsSheetState extends ConsumerState<CouponsSheet> {
  final _code = TextEditingController();
  String? _busy;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply(String code) async {
    final c = code.trim().toUpperCase();
    if (c.isEmpty) return;
    setState(() => (_busy = c, _error = null));
    try {
      await ref.read(cartProvider.notifier).applyCoupon(c);
      if (!mounted) return;
      showMessage(context, '$c applied');
      Navigator.of(context).pop();
    } catch (e) {
      // an unknown, expired or inapplicable code is a 4xx whose message says why
      if (mounted) setState(() => (_busy = null, _error = e.toString()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final coupons = ref.watch(outletCouponsProvider(widget.outletId));
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
            Text('Coupons', style: text.titleLarge),
            Text('Offers you can use on this order.', style: text.bodyMedium?.copyWith(color: muted)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(labelText: 'Coupon code', hintText: 'Enter a code', errorText: _error, errorMaxLines: 3),
                  onSubmitted: _apply,
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(onPressed: _busy != null ? null : () => _apply(_code.text), child: const Text('Apply')),
            ]),
            const SizedBox(height: 12),
            AsyncView<List<Coupon>>(
              value: coupons,
              onRetry: () => ref.invalidate(outletCouponsProvider(widget.outletId)),
              data: (list) => list.isEmpty
                  ? const EmptyView(icon: Icons.local_offer_outlined, title: 'No offers right now')
                  : Column(children: [
                      for (final c in list)
                        Opacity(
                          opacity: c.eligible ? 1 : 0.6,
                          child: Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: const Icon(Icons.local_offer_outlined),
                              title: Row(children: [
                                Text(c.code, style: const TextStyle(fontWeight: FontWeight.w700)),
                                if (!c.eligible) ...[const SizedBox(width: 8), const StatusChip('NOT_ELIGIBLE', label: 'Not eligible', tone: Tone.neutral)],
                              ]),
                              subtitle: Text(
                                '${c.title}\n${c.eligible ? (c.minOrderValue > 0 ? 'On orders above ${money(c.minOrderValue, whole: true)}' : 'No minimum order') : c.reason ?? ''}',
                              ),
                              isThreeLine: true,
                              trailing: OutlinedButton(
                                onPressed: !c.eligible || _busy != null ? null : () => _apply(c.code),
                                child: _busy == c.code ? const ButtonSpinner() : const Text('Apply'),
                              ),
                            ),
                          ),
                        ),
                    ]),
            ),
          ]),
        ),
      ),
    );
  }
}
