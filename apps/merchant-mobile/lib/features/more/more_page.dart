import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/permissions.dart';
import '../auth/authorize.dart';
import '../outlets/outlet_picker_page.dart';
import '../outlets/outlet_providers.dart';

/// Back-office screens, outlet open / close, switching outlet or business, sign out.
class MorePage extends ConsumerWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    final perms = ref.watch(permissionsProvider);
    final outlet = ref.watch(currentOutletProvider);
    final outlets = ref.watch(outletControllerProvider).value?.outlets ?? const [];
    final businesses = eligibleMemberships(session?.user.memberships ?? const []);
    final business = businesses.where((m) => m.tenantId == session?.claims.tenantId).map((m) => m.tenantName).firstOrNull;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(children: [
        ListTile(
          leading: CircleAvatar(child: Text(_initials(session?.user.name ?? session?.claims.name))),
          title: Text(session?.user.name ?? session?.claims.name ?? 'Signed in', style: text.titleMedium),
          subtitle: Text([perms.roleLabel, ?business].join(' · ')),
        ),
        if (outlet != null) ...[
          ListTile(
            leading: Icon(outlet.isFoodCart ? Icons.delivery_dining : Icons.storefront),
            title: Text(outlet.name),
            subtitle: Text([outlet.addressLine1, outlet.city].where((e) => e.isNotEmpty).join(', ')),
          ),
          OutletOpenSwitch(outlet: outlet, enabled: perms.can(Perm.ordersManage)),
        ],
        const Divider(),
        if (perms.canSeeSales) _Link(icon: Icons.insights_outlined, title: "Today's sales", subtitle: 'Totals, payment split, hourly, top dishes', to: '/more/sales'),
        if (perms.can(Perm.inventoryRead)) _Link(icon: Icons.inventory_2_outlined, title: 'Inventory', subtitle: 'Stock levels and low-stock alerts', to: '/more/inventory'),
        if (perms.can(Perm.procurementRead)) _Link(icon: Icons.local_shipping_outlined, title: 'Purchasing', subtitle: 'Approvals, purchase orders and reorder alerts', to: '/more/purchasing'),
        _Link(icon: Icons.reviews_outlined, title: 'Reviews', subtitle: 'Customer ratings and replies', to: '/more/reviews'),
        const Divider(),
        if (outlets.length > 1) _Link(icon: Icons.swap_horiz, title: 'Switch outlet', subtitle: '${outlets.length} outlets', to: '/outlet'),
        if (businesses.length > 1) _Link(icon: Icons.business_outlined, title: 'Switch business', subtitle: '${businesses.length} businesses', to: '/business'),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Sign out?'),
                content: const Text('New-order alerts stop on this phone until someone signs in again.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay signed in')),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                ],
              ),
            );
            if (ok == true) await signOut(ref);
          },
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text('FoodGrid Business · ${ref.watch(appConfigProvider).apiUrl}', style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline)),
        ),
      ]),
    );
  }

  static String _initials(String? name) {
    final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }
}

class _Link extends StatelessWidget {
  const _Link({required this.icon, required this.title, required this.subtitle, required this.to});
  final IconData icon;
  final String title;
  final String subtitle;
  final String to;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(to),
      );
}
