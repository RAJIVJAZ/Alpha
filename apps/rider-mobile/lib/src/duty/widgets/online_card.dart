import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/widgets.dart';
import '../../profile/profile.dart';
import '../duty_providers.dart';
import '../location_tracker.dart';

/// On/off duty switch with today's earnings and the location-sharing state.
class OnlineCard extends ConsumerStatefulWidget {
  const OnlineCard({super.key, required this.profile});
  final RiderProfile profile;

  @override
  ConsumerState<OnlineCard> createState() => _OnlineCardState();
}

class _OnlineCardState extends ConsumerState<OnlineCard> {
  bool _busy = false;

  Future<void> _toggle() async {
    final goingOnline = !widget.profile.isOnline;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final controller = container.read(profileProvider.notifier);
      if (goingOnline) {
        await controller.goOnline(await container.read(locationTrackerProvider.notifier).locate());
      } else {
        await controller.goOffline();
      }
      refreshDuty(container.invalidate);
      toast(messenger, goingOnline ? 'You are online — offers will appear here' : 'You are offline');
    } catch (e) {
      toast(messenger, e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final online = p.isOnline;
    final today = ref.watch(todayEarningsProvider).value;
    final tracker = ref.watch(locationTrackerProvider);
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final activity = p.isOnDelivery
        ? 'on a delivery'
        : online
            ? 'waiting for offers'
            : 'go online to receive orders';

    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: online ? FoodGridTheme.good : scheme.outlineVariant, width: online ? 2 : 1),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            ExcludeSemantics(child: Icon(online ? Icons.radio_button_checked : Icons.radio_button_off, color: online ? FoodGridTheme.good : scheme.outline)),
            const SizedBox(width: 8),
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text(online ? 'You are online' : 'You are offline', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
          const SizedBox(height: 4),
          Text('Today ${today == null ? '—' : money(today, whole: true)} · $activity', style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          if (online) ...[
            const SizedBox(height: 6),
            _LocationLine(tracker: tracker),
          ],
          if (!p.isActive) ...[
            const SizedBox(height: 10),
            Notice(
              icon: Icons.block,
              color: FoodGridTheme.serious,
              message: 'Your account is ${humanize(p.status).toLowerCase()}. Contact rider support to start taking orders.',
            ),
          ],
          const SizedBox(height: 14),
          SizedBox(
            height: 56,
            child: online
                ? OutlinedButton.icon(
                    onPressed: _busy ? null : _toggle,
                    icon: _busy ? const ButtonSpinner() : const Icon(Icons.power_settings_new),
                    label: const Text('Go offline'),
                  )
                : FilledButton.icon(
                    onPressed: _busy || !p.isActive ? null : _toggle,
                    icon: _busy ? const ButtonSpinner() : const Icon(Icons.power_settings_new),
                    label: const Text('Go online'),
                  ),
          ),
        ]),
      ),
    );
  }
}

class _LocationLine extends StatelessWidget {
  const _LocationLine({required this.tracker});
  final TrackerState tracker;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final error = tracker.error;
    final (IconData icon, Color color, String label) = error != null
        ? (Icons.location_disabled, scheme.error, error)
        : tracker.sentAt != null
            ? (Icons.my_location, FoodGridTheme.goodText, 'Location shared ${relative(tracker.sentAt)}')
            : (Icons.location_searching, scheme.onSurfaceVariant, 'Finding your location…');
    return Row(children: [
      ExcludeSemantics(child: Icon(icon, size: 16, color: color)),
      const SizedBox(width: 6),
      Expanded(child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: error != null ? scheme.error : null))),
    ]);
  }
}
