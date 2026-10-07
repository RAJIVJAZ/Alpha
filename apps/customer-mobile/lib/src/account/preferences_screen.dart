import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'models.dart';
import 'profile.dart';

const _prefs = [
  ('pushEnabled', 'Push notifications', 'Order updates on this phone'),
  ('smsEnabled', 'SMS', 'Delivery codes and order updates by text'),
  ('emailEnabled', 'Email receipts', 'Invoices for every order'),
  ('marketingEnabled', 'Offers and recommendations', 'Deals from places you like'),
];

/// GET/PUT notifications/preferences.
class PreferencesScreen extends ConsumerStatefulWidget {
  const PreferencesScreen({super.key});

  @override
  ConsumerState<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends ConsumerState<PreferencesScreen> {
  NotificationPrefs? _optimistic;

  Future<void> _set(NotificationPrefs current, String key, bool value) async {
    setState(() => _optimistic = current.withFlag(key, value));
    try {
      await ref.read(apiClientProvider).put<dynamic>('notifications/preferences', body: {key: value});
      ref.invalidate(notificationPrefsProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => _optimistic = current);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(notificationPrefsProvider);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Notification preferences')),
      body: AsyncView<NotificationPrefs>(
        value: prefs,
        onRetry: () => ref.invalidate(notificationPrefsProvider),
        data: (server) {
          final p = _optimistic ?? server;
          return ListView(children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text('Order updates always reach you in the app.', style: text.bodyMedium)),
            for (final (key, label, hint) in _prefs) SwitchListTile(title: Text(label), subtitle: Text(hint), value: p.flag(key), onChanged: (v) => _set(p, key, v)),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Quiet hours ${p.quietHoursStart ?? '—'}–${p.quietHoursEnd ?? '—'} (IST): no promotional messages.', style: text.bodySmall),
            ),
          ]);
        },
      ),
    );
  }
}
