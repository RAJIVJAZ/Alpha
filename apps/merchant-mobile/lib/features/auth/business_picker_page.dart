import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import 'authorize.dart';

/// Picks the active business when the token has none (several memberships)
/// or when switching from More. Exactly one eligible business is opened
/// automatically; none signs out with an explanation.
class BusinessPickerPage extends ConsumerStatefulWidget {
  const BusinessPickerPage({super.key});

  @override
  ConsumerState<BusinessPickerPage> createState() => _BusinessPickerPageState();
}

class _BusinessPickerPageState extends ConsumerState<BusinessPickerPage> {
  String? _opening;
  bool _autoTried = false;

  Future<void> _open(Membership m) async {
    final current = ref.read(sessionProvider).value?.claims.tenantId;
    if (m.tenantId == current) {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/orders');
      }
      return;
    }
    setState(() => _opening = m.tenantName);
    try {
      await ref.read(authRepositoryProvider).switchTenant(m.tenantId);
      await ref.read(sessionProvider.notifier).reload();
      // the router sends this on to the outlet picker or the board once outlets load
      if (mounted) context.go('/splash');
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  Future<void> _accept(PendingInvite invite) async {
    setState(() => _opening = invite.tenantName);
    try {
      await ref.read(apiClientProvider).post<dynamic>('tenants/invites/${invite.id}/accept');
      await ref.read(sessionProvider.notifier).reload();
      _autoTried = false; // the new membership opens like any single business
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  /// The business was removed since the last sign-in (sign-in itself refuses
  /// accounts without one; offline, the session keeps the last memberships).
  Future<void> _noBusiness() async {
    ref.read(loginNoticeProvider.notifier).show(notMerchantMessage);
    await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final eligible = eligibleMemberships(session?.user.memberships ?? const []);
    final currentId = session?.claims.tenantId;

    // with no business yet, pending invitations are the way in
    final invites = eligible.isEmpty ? ref.watch(pendingInvitesProvider) : null;

    if (session != null && !_autoTried) {
      if (eligible.length == 1 && eligible.first.tenantId != currentId) {
        _autoTried = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _open(eligible.first));
      } else if (eligible.isEmpty && invites != null && !invites.isLoading && (invites.value?.isEmpty ?? true)) {
        _autoTried = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _noBusiness());
      } else if (eligible.isNotEmpty) {
        _autoTried = true;
      }
    }

    final Widget body;
    if (_opening != null) {
      body = _Progress('Opening $_opening…');
    } else if (eligible.isEmpty && (invites?.value?.isNotEmpty ?? false)) {
      body = ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('You have been invited to join', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          for (final i in invites!.value!) ...[
            Card(
              child: ListTile(
                title: Text(i.tenantName),
                subtitle: Text('${humanize(i.tenantType)} · as ${humanize(i.role)}'),
                trailing: FilledButton(onPressed: () => _accept(i), child: const Text('Accept')),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      );
    } else if (eligible.isEmpty) {
      body = const _Progress('Checking your businesses…');
    } else {
      body = ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Which business are you working for?', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          for (final m in eligible) ...[
            _BusinessTile(membership: m, current: m.tenantId == currentId, onTap: () => _open(m)),
            const SizedBox(height: 10),
          ],
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose business'),
        actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () => signOut(ref))],
      ),
      body: body,
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Center(
        child: Semantics(
          liveRegion: true,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(label, style: Theme.of(context).textTheme.titleMedium),
          ]),
        ),
      );
}

class _BusinessTile extends StatelessWidget {
  const _BusinessTile({required this.membership, required this.current, required this.onTap});
  final Membership membership;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cart = membership.tenantType == 'FOOD_CART';
    final text = Theme.of(context).textTheme;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            CircleAvatar(child: Icon(cart ? Icons.delivery_dining : Icons.restaurant)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(membership.tenantName, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text('${cart ? 'Food cart' : 'Restaurant'} · ${humanize(membership.role)}', style: text.bodyMedium),
              ]),
            ),
            if (current) const Icon(Icons.check_circle, semanticLabel: 'Current business') else const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
  }
}
