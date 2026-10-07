import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/addresses.dart';
import '../common/widgets.dart';
import 'place.dart';

final locationServiceProvider = Provider<LocationService>((ref) => const LocationService());

/// Header button showing where we deliver; opens the location sheet.
class LocationButton extends ConsumerWidget {
  const LocationButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final place = ref.watch(placeProvider);
    final text = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: 'Delivering to ${place.label}. Change location',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => showLocationSheet(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.location_on, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 4),
            Flexible(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Flexible(child: Text(place.shortLabel, overflow: TextOverflow.ellipsis, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                  const Icon(Icons.keyboard_arrow_down, size: 20),
                ]),
                Text(place.label, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

Future<void> showLocationSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _LocationSheet(),
    );

class _LocationSheet extends ConsumerStatefulWidget {
  const _LocationSheet();

  @override
  ConsumerState<_LocationSheet> createState() => _LocationSheetState();
}

class _LocationSheetState extends ConsumerState<_LocationSheet> {
  bool _locating = false;
  String? _error;

  void _choose(Place p) {
    ref.read(placeProvider.notifier).choose(p);
    Navigator.of(context).pop();
  }

  Future<void> _useDevice() async {
    setState(() => (_locating = true, _error = null));
    try {
      final fix = await ref.read(locationServiceProvider).current();
      if (mounted) _choose(Place(lat: fix.lat, lng: fix.lng, label: 'Current location'));
    } catch (e) {
      if (mounted) setState(() => _error = e is LocationUnavailable ? e.message : 'Allow location access, or pick an area');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final place = ref.watch(placeProvider);
    final signedIn = ref.watch(sessionProvider).value != null;
    final addresses = signedIn ? ref.watch(addressesProvider).value ?? const [] : const [];
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          Text('Deliver to', style: text.titleLarge),
          Text('Restaurants and delivery times depend on where you are.', style: text.bodyMedium?.copyWith(color: muted)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _locating ? null : _useDevice,
            icon: _locating ? const ButtonSpinner() : const Icon(Icons.my_location),
            label: const Text('Use my current location'),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Notice(_error!, tone: NoticeTone.critical)),
          if (addresses.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('SAVED ADDRESSES', style: text.labelMedium?.copyWith(color: muted, letterSpacing: 0.6)),
            for (final a in addresses)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(a.label == 'Work' ? Icons.work_outline : a.label == 'Home' ? Icons.home_outlined : Icons.place_outlined),
                title: Text(a.label),
                subtitle: Text(a.oneLine),
                selected: place.addressId == a.id,
                trailing: place.addressId == a.id ? const Icon(Icons.check, semanticLabel: 'Selected') : null,
                onTap: () => _choose(Place.fromAddress(a)),
              ),
          ],
          const SizedBox(height: 20),
          Text('POPULAR AREAS', style: text.labelMedium?.copyWith(color: muted, letterSpacing: 0.6)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final a in areas)
              ChoiceChip(
                label: Text(a.shortLabel),
                selected: place.label == a.label && place.addressId == null,
                onSelected: (_) => _choose(a),
              ),
          ]),
        ]),
      ),
    );
  }
}
