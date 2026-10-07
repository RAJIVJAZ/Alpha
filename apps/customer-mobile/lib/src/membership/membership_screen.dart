import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/models.dart';
import '../app/sign_in_screen.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../payments/payments.dart';

final membershipPlansProvider = FutureProvider.autoDispose<List<MembershipPlan>>((ref) async {
  return listOf(await ref.watch(apiClientProvider).get<dynamic>('memberships/plans', auth: false), MembershipPlan.fromJson);
});

final myMembershipProvider = FutureProvider.autoDispose<ActiveMembership?>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  if (session == null) return null;
  final j = asJson(await ref.watch(apiClientProvider).get<dynamic>('memberships/me'));
  return j['active'] is Map ? ActiveMembership.fromJson(asJson(j['active'])) : null;
});

/// FoodGrid One: plans, the current membership, and buying one.
class MembershipScreen extends ConsumerStatefulWidget {
  const MembershipScreen({super.key});

  @override
  ConsumerState<MembershipScreen> createState() => _MembershipScreenState();
}

class _MembershipScreenState extends ConsumerState<MembershipScreen> {
  String? _busy;

  Future<void> _buy(MembershipPlan plan) async {
    if (ref.read(sessionProvider).value == null) return signInFirst(context);
    setState(() => _busy = plan.id);
    try {
      final m = asJson(await ref.read(apiClientProvider).post<dynamic>('memberships', body: {'planId': plan.id}));
      if (!mounted) return;
      final r = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.membership, referenceId: str(m['id']), method: PaymentMethod.upi));
      if (!mounted) return;
      if (r == PayOutcome.paid) {
        showMessage(context, 'Welcome to ${plan.name}!');
        // activation happens when payment-service reports the capture
        await Future<void>.delayed(const Duration(milliseconds: 1500));
        if (mounted) ref.invalidate(myMembershipProvider);
      } else {
        showMessage(context, payFailureMessage(r));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(membershipPlansProvider);
    final active = ref.watch(myMembershipProvider).value;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('FoodGrid One')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(colors: [Color(0xFFEA580C), Color(0xFF9F1239)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.workspace_premium, color: Colors.white, size: 18),
              const SizedBox(width: 6),
              Text('FOODGRID ONE', style: text.labelMedium?.copyWith(color: Colors.white, letterSpacing: 1)),
            ]),
            const SizedBox(height: 8),
            Text('Free delivery and extra savings on every order', style: text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(
              active != null
                  ? "You're a member until ${date(active.endsAt)} · saved ${money(active.savings, whole: true)} so far"
                  : 'Pays for itself in a couple of orders.',
              style: text.bodyMedium?.copyWith(color: Colors.white),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        AsyncView<List<MembershipPlan>>(
          value: plans,
          onRetry: () => ref.invalidate(membershipPlansProvider),
          data: (list) => list.isEmpty
              ? const EmptyView(icon: Icons.workspace_premium_outlined, title: 'No plans right now')
              : Column(children: [
                  for (final p in list)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Card(
                        shape: active?.plan.id == p.id
                            ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2))
                            : null,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(p.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                              if (active?.plan.id == p.id) const StatusChip('ACTIVE', label: 'Your plan'),
                            ]),
                            if (p.description != null) Text(p.description!, style: text.bodyMedium?.copyWith(color: muted)),
                            const SizedBox(height: 8),
                            Text.rich(TextSpan(children: [
                              TextSpan(text: money(p.price, whole: true), style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                              TextSpan(text: ' / ${p.durationDays} days', style: text.bodyMedium?.copyWith(color: muted)),
                            ])),
                            const SizedBox(height: 6),
                            if (p.freeDeliveryAbove != null) _Benefit('Free delivery above ${money(p.freeDeliveryAbove, whole: true)}'),
                            if ((p.extraDiscountPct ?? 0) > 0)
                              _Benefit('${p.extraDiscountPct!.toStringAsFixed(0)}% extra off${p.maxDiscountPerOrder != null ? ', up to ${money(p.maxDiscountPerOrder, whole: true)} an order' : ''}'),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: active?.plan.id == p.id
                                  ? OutlinedButton(onPressed: _busy != null ? null : () => _buy(p), child: _busy == p.id ? const ButtonSpinner() : const Text('Extend'))
                                  : FilledButton(onPressed: _busy != null ? null : () => _buy(p), child: _busy == p.id ? const ButtonSpinner() : Text(active != null ? 'Switch' : 'Join')),
                            ),
                          ]),
                        ),
                      ),
                    ),
                ]),
        ),
      ]),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [const Icon(Icons.check, size: 18, color: FoodGridTheme.goodText), const SizedBox(width: 6), Expanded(child: Text(label))]),
      );
}
