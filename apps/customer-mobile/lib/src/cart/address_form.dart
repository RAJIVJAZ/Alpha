import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/addresses.dart';
import '../common/widgets.dart';
import '../location/location_sheet.dart';
import '../location/place.dart';
import 'models.dart';

/// Add or edit a delivery address; resolves to the saved address.
Future<Address?> showAddressForm(BuildContext context, {Address? address}) => Navigator.of(context, rootNavigator: true).push<Address>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => AddressFormScreen(address: address)),
    );

/// The pin comes from the device or the chosen area; riders navigate to it.
class AddressFormScreen extends ConsumerStatefulWidget {
  const AddressFormScreen({super.key, this.address});
  final Address? address;

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

enum _PinSource { saved, area, device }

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _form = GlobalKey<FormState>();
  late final Address? a = widget.address;
  late final _line1 = TextEditingController(text: a?.line1);
  late final _line2 = TextEditingController(text: a?.line2);
  late final _landmark = TextEditingController(text: a?.landmark);
  late final _city = TextEditingController(text: a?.city ?? 'Bengaluru');
  late final _state = TextEditingController(text: a?.state ?? 'Karnataka');
  late final _pincode = TextEditingController(text: a?.pincode);
  late final _contactName = TextEditingController(text: a?.contactName);
  late final _contactPhone = TextEditingController(text: a?.contactPhone);
  late String _label = a?.label ?? 'Home';
  late double _lat;
  late double _lng;
  late _PinSource _source;
  bool _locating = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final place = ref.read(placeProvider);
    _lat = a?.lat ?? place.lat;
    _lng = a?.lng ?? place.lng;
    _source = a != null ? _PinSource.saved : _PinSource.area;
  }

  @override
  void dispose() {
    for (final c in [_line1, _line2, _landmark, _city, _state, _pincode, _contactName, _contactPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() => _locating = true);
    try {
      final fix = await ref.read(locationServiceProvider).current();
      if (mounted) setState(() => (_lat = fix.lat, _lng = fix.lng, _source = _PinSource.device));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  String? _opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final input = AddressInput(
      label: _label,
      contactName: _opt(_contactName),
      contactPhone: _opt(_contactPhone),
      line1: _line1.text.trim(),
      line2: _opt(_line2),
      landmark: _opt(_landmark),
      city: _city.text.trim(),
      state: _state.text.trim(),
      pincode: _pincode.text.trim(),
      lat: _lat,
      lng: _lng,
    );
    try {
      final repo = ref.read(addressesRepositoryProvider);
      final saved = a == null ? await repo.create(input) : await repo.update(a!.id, input);
      if (!mounted) return;
      showMessage(context, 'Address saved');
      Navigator.of(context).pop(saved);
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final place = ref.watch(placeProvider);
    final text = Theme.of(context).textTheme;
    String? required(String? v) => (v ?? '').trim().isEmpty ? 'Required' : null;
    return Scaffold(
      appBar: AppBar(title: Text(a == null ? 'Add a delivery address' : 'Edit address')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Riders navigate to the pin, so set it from where the order should arrive.', style: text.bodyMedium),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                const Icon(Icons.push_pin_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Pin: ${_lat.toStringAsFixed(5)}, ${_lng.toStringAsFixed(5)}', style: text.bodyMedium),
                    Text(
                      switch (_source) {
                        _PinSource.device => 'From this device',
                        _PinSource.saved => 'Saved pin',
                        _PinSource.area => 'Centre of ${place.label}',
                      },
                      style: text.bodySmall,
                    ),
                  ]),
                ),
                OutlinedButton.icon(onPressed: _locating ? null : _locate, icon: _locating ? const ButtonSpinner() : const Icon(Icons.my_location), label: const Text('Use my location')),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(controller: _line1, maxLength: 200, decoration: const InputDecoration(labelText: 'Flat, house no., building'), validator: required),
          TextFormField(controller: _line2, maxLength: 200, decoration: const InputDecoration(labelText: 'Area, street (optional)')),
          TextFormField(controller: _landmark, maxLength: 120, decoration: const InputDecoration(labelText: 'Landmark (optional)')),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: TextFormField(controller: _city, decoration: const InputDecoration(labelText: 'City'), validator: required)),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _pincode,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Pincode'),
                validator: (v) => RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? null : 'Enter the 6-digit pincode',
              ),
            ),
          ]),
          TextFormField(controller: _state, decoration: const InputDecoration(labelText: 'State'), validator: required),
          const SizedBox(height: 16),
          Text('Save as', style: text.titleSmall),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'Home', label: Text('Home'), icon: Icon(Icons.home_outlined)),
              ButtonSegment(value: 'Work', label: Text('Work'), icon: Icon(Icons.work_outline)),
              ButtonSegment(value: 'Other', label: Text('Other'), icon: Icon(Icons.place_outlined)),
            ],
            selected: {_label},
            onSelectionChanged: (s) => setState(() => _label = s.first),
          ),
          const SizedBox(height: 16),
          TextFormField(controller: _contactName, decoration: const InputDecoration(labelText: "Receiver's name (optional)")),
          const SizedBox(height: 12),
          TextFormField(controller: _contactPhone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: "Receiver's phone (optional)")),
          const SizedBox(height: 24),
          FilledButton(onPressed: _saving ? null : _save, child: _saving ? const ButtonSpinner() : const Text('Save address')),
        ]),
      ),
    );
  }
}
