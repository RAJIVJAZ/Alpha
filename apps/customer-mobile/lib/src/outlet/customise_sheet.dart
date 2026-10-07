import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/cart_controller.dart';
import '../common/widgets.dart';
import 'models.dart';

/// Opens the customisation sheet; [onAdd] adds the chosen line and returns
/// true to close the sheet.
Future<void> showCustomiseSheet(BuildContext context, MenuItem item, Future<bool> Function(AddLine line) onAdd) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => CustomiseSheet(item: item, onAdd: onAdd),
    );

/// Size and add-ons for a dish, honouring each group's min/max, with a live price.
class CustomiseSheet extends StatefulWidget {
  const CustomiseSheet({super.key, required this.item, required this.onAdd});

  final MenuItem item;
  final Future<bool> Function(AddLine line) onAdd;

  @override
  State<CustomiseSheet> createState() => _CustomiseSheetState();
}

class _CustomiseSheetState extends State<CustomiseSheet> {
  late String? _variantId = widget.item.defaultVariant?.id;
  final List<String> _addonIds = [];
  final _notes = TextEditingController();
  int _qty = 1;
  bool _busy = false;

  MenuItem get item => widget.item;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  int _picked(AddonGroup g) => g.addons.where((a) => _addonIds.contains(a.id)).length;

  List<AddonGroup> get _missing => item.addonGroups.where((g) => _picked(g) < g.minSelect).toList();

  void _toggle(AddonGroup g, Addon a) {
    setState(() {
      if (_addonIds.contains(a.id)) {
        _addonIds.remove(a.id);
      } else if (g.maxSelect == 1) {
        // single choice: picking one replaces the other
        _addonIds.removeWhere((id) => g.addons.any((x) => x.id == id));
        _addonIds.add(a.id);
      } else if (_picked(g) < g.maxSelect) {
        _addonIds.add(a.id);
      }
    });
  }

  Future<void> _submit() async {
    if (_missing.isNotEmpty) return;
    setState(() => _busy = true);
    final notes = _notes.text.trim();
    final ok = await widget.onAdd(AddLine(menuItemId: item.id, quantity: _qty, variantId: _variantId, addonIds: List.of(_addonIds), notes: notes.isEmpty ? null : notes));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final variants = item.variants.where((v) => v.isAvailable).toList();
    final total = item.unitPrice(variantId: _variantId, addonIds: _addonIds) * _qty;
    final missing = _missing;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Flexible(
              child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), children: [
                Row(children: [
                  VegMark(veg: item.isVeg),
                  const SizedBox(width: 8),
                  Expanded(child: Text(item.name, style: text.titleLarge)),
                ]),
                Padding(padding: const EdgeInsets.only(top: 4, bottom: 8), child: Text(item.description ?? 'Make it yours', style: text.bodyMedium?.copyWith(color: muted))),
                if (variants.length > 1) ...[
                  _GroupTitle('Size', hint: 'pick 1'),
                  RadioGroup<String>(
                    groupValue: _variantId,
                    onChanged: (v) => setState(() => _variantId = v),
                    child: Column(children: [
                      for (final v in variants)
                        RadioListTile<String>(
                          key: Key('variant-${v.id}'),
                          value: v.id,
                          contentPadding: EdgeInsets.zero,
                          title: Text(v.name),
                          secondary: Text(money(item.price + v.priceDelta, whole: true), style: text.bodyMedium?.copyWith(color: muted)),
                        ),
                    ]),
                  ),
                ],
                for (final g in item.addonGroups)
                  if (g.addons.isNotEmpty) ...[
                    _GroupTitle(g.name, hint: g.rule),
                    for (final a in g.addons)
                      CheckboxListTile(
                        key: Key('addon-${a.id}'),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _addonIds.contains(a.id),
                        onChanged: !a.isAvailable || (!_addonIds.contains(a.id) && g.maxSelect > 1 && _picked(g) >= g.maxSelect) ? null : (_) => _toggle(g, a),
                        title: Row(children: [VegMark(veg: a.isVeg, size: 13), const SizedBox(width: 6), Expanded(child: Text(a.name))]),
                        subtitle: a.isAvailable ? null : const Text('Unavailable'),
                        secondary: Text('+${money(a.price, whole: true)}', style: text.bodyMedium?.copyWith(color: muted)),
                      ),
                  ],
                const SizedBox(height: 8),
                TextField(
                  controller: _notes,
                  maxLength: 200,
                  maxLines: 2,
                  minLines: 1,
                  decoration: const InputDecoration(labelText: 'Note for the kitchen (optional)', hintText: 'Less spicy, no onion…'),
                ),
              ]),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Row(children: [
                QtyStepper(value: _qty, label: item.name, max: 20, onChanged: (n) => setState(() => _qty = n.clamp(1, 20))),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    key: const Key('customise-add'),
                    onPressed: _busy || missing.isNotEmpty ? null : _submit,
                    child: _busy ? const ButtonSpinner() : Text(missing.isNotEmpty ? 'Choose ${missing.first.name.toLowerCase()}' : 'Add · ${money(total, whole: true)}'),
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

class _GroupTitle extends StatelessWidget {
  const _GroupTitle(this.title, {this.hint});
  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 2),
      child: Semantics(
        header: true,
        child: Text.rich(TextSpan(children: [
          TextSpan(text: title, style: text.titleSmall),
          if (hint != null) TextSpan(text: '  $hint', style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ])),
      ),
    );
  }
}
