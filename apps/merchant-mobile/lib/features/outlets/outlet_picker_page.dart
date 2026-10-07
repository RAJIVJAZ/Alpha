import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import 'outlet.dart';
import 'outlet_providers.dart';

/// Choose which outlet this phone works on (shown when the business has
/// more than one; also reachable from More).
class OutletPickerPage extends ConsumerWidget {
  const OutletPickerPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(outletControllerProvider);
    final business = ref.watch(sessionProvider.select((s) {
      final claims = s.value?.claims;
      for (final m in s.value?.user.memberships ?? const <Membership>[]) {
        if (m.tenantId == claims?.tenantId) return m.tenantName;
      }
      return null;
    }));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose outlet'),
        actions: [
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () => signOut(ref)),
        ],
      ),
      body: AsyncView<OutletState>(
        value: state,
        onRetry: () => ref.invalidate(outletControllerProvider),
        data: (s) {
          if (s.outlets.isEmpty) {
            return EmptyView(
              icon: Icons.storefront_outlined,
              title: 'No outlets yet',
              message: 'Add an outlet from the FoodGrid web dashboard, then pull to refresh.',
              action: OutlinedButton(onPressed: () => ref.invalidate(outletControllerProvider), child: const Text('Refresh')),
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              try {
                await ref.read(outletControllerProvider.notifier).refreshOutlets();
              } catch (e) {
                if (context.mounted) showApiError(context, e);
              }
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (business != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text('Which $business outlet are you working at?', style: Theme.of(context).textTheme.titleMedium),
                  ),
                for (final o in s.outlets) ...[
                  _OutletTile(
                    outlet: o,
                    selected: o.id == s.selectedId,
                    onTap: () async {
                      try {
                        await ref.read(outletControllerProvider.notifier).select(o.id);
                        if (context.mounted) context.go('/orders');
                      } catch (e) {
                        if (context.mounted) showApiError(context, e);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _OutletTile extends StatelessWidget {
  const _OutletTile({required this.outlet, required this.selected, required this.onTap});
  final Outlet outlet;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            CircleAvatar(child: Icon(outlet.isFoodCart ? Icons.delivery_dining : Icons.storefront)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(outlet.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text([outlet.addressLine1, outlet.city].where((e) => e.isNotEmpty).join(', '), style: text.bodyMedium),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  StatusChip(outlet.isOpen ? 'OPEN' : 'CLOSED', label: outlet.isOpen ? 'Open for orders' : 'Closed', tone: outlet.isOpen ? Tone.good : Tone.neutral),
                  if (outlet.status != 'ACTIVE') StatusChip(outlet.status),
                ]),
              ]),
            ),
            if (selected) const Icon(Icons.check_circle, semanticLabel: 'Current outlet') else const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
  }
}

/// Open / closed switch for the current outlet (needs orders:manage).
class OutletOpenSwitch extends ConsumerStatefulWidget {
  const OutletOpenSwitch({super.key, required this.outlet, required this.enabled});
  final Outlet outlet;
  final bool enabled;

  @override
  ConsumerState<OutletOpenSwitch> createState() => _OutletOpenSwitchState();
}

class _OutletOpenSwitchState extends ConsumerState<OutletOpenSwitch> {
  bool _busy = false;

  Future<void> _toggle(bool open) async {
    setState(() => _busy = true);
    try {
      await ref.read(outletControllerProvider.notifier).setOpen(widget.outlet.id, open);
      if (mounted) showMessage(context, open ? '${widget.outlet.name} is open for orders' : '${widget.outlet.name} stopped taking orders');
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final open = widget.outlet.isOpen;
    return SwitchListTile(
      secondary: Icon(open ? Icons.storefront : Icons.store_mall_directory_outlined),
      title: Text(open ? 'Open for orders' : 'Closed for orders'),
      subtitle: Text(widget.enabled ? (open ? 'Customers can order now' : 'Turn on to accept new orders') : "Your role can't open or close the outlet"),
      value: open,
      onChanged: widget.enabled && !_busy ? _toggle : null,
    );
  }
}
