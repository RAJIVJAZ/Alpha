import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../common/widgets.dart';
import 'profile.dart';

/// Account hub: profile summary and links to everything the customer owns.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    if (!await confirm(context, title: 'Sign out of FoodGrid?', confirmLabel: 'Sign out')) return;
    if (!context.mounted) return;
    // leave the private tab first so the sign-in guard doesn't take over
    context.go('/');
    await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    final profile = ref.watch(profileProvider).value;
    final text = Theme.of(context).textTheme;
    final name = profile?.name ?? session?.user.name;
    final phone = profile?.phone ?? session?.user.phone;
    Widget link(IconData icon, String label, String route, {String? subtitle}) => ListTile(
          leading: Icon(icon),
          title: Text(label),
          subtitle: subtitle == null ? null : Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(route),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(children: [
        ListTile(
          contentPadding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          leading: CircleAvatar(radius: 26, child: Text((name ?? 'FG').trim().isEmpty ? 'FG' : (name ?? 'FG').trim()[0].toUpperCase(), style: text.titleLarge)),
          title: Text(name ?? 'FoodGrid customer', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          subtitle: Text([?phone, ?profile?.email].join(' · ')),
          trailing: IconButton(tooltip: 'Edit profile', icon: const Icon(Icons.edit_outlined), onPressed: () => context.push('/account/profile')),
        ),
        const Divider(),
        link(Icons.receipt_long_outlined, 'Your orders', '/orders'),
        link(Icons.account_balance_wallet_outlined, 'Wallet', '/wallet'),
        link(Icons.workspace_premium_outlined, 'FoodGrid One membership', '/membership'),
        link(Icons.calendar_month_outlined, 'Meal plans', '/meal-plans'),
        link(Icons.notifications_outlined, 'Notifications', '/notifications'),
        const Divider(),
        link(Icons.person_outline, 'Profile', '/account/profile'),
        link(Icons.place_outlined, 'Saved addresses', '/account/addresses'),
        link(Icons.tune, 'Notification preferences', '/account/preferences'),
        link(Icons.qr_code_scanner, 'Order at a table', '/scan', subtitle: 'Scan the QR code on your table'),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: FoodGridTheme.critical),
          title: const Text('Sign out', style: TextStyle(color: FoodGridTheme.critical)),
          onTap: () => _signOut(context, ref),
        ),
        const SizedBox(height: 24),
      ]),
    );
  }
}
