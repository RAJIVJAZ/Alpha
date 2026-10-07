import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/address_form.dart';
import '../cart/models.dart';
import '../common/widgets.dart';
import 'addresses.dart';

/// Saved addresses: add, edit, delete and make default.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  Future<void> _run(BuildContext context, Future<void> Function() fn, {String? done}) async {
    try {
      await fn();
      if (done != null && context.mounted) showMessage(context, done);
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(addressesProvider);
    final repo = ref.read(addressesRepositoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Saved addresses')),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => showAddressForm(context), icon: const Icon(Icons.add), label: const Text('Add address')),
      body: AsyncView<List<Address>>(
        value: list,
        onRetry: () => ref.invalidate(addressesProvider),
        data: (addresses) => addresses.isEmpty
            ? const EmptyView(icon: Icons.place_outlined, title: 'No saved addresses', message: 'Add one to check out faster.')
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                itemCount: addresses.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final a = addresses[i];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        ListTile(
                          leading: Icon(a.label == 'Work' ? Icons.work_outline : a.label == 'Home' ? Icons.home_outlined : Icons.place_outlined),
                          title: Row(children: [Text(a.label), if (a.isDefault) ...[const SizedBox(width: 8), const StatusChip('DEFAULT', label: 'Default', tone: Tone.good)]]),
                          subtitle: Text([a.oneLine, if (a.landmark != null) 'Near ${a.landmark}'].join('\n')),
                        ),
                        Row(children: [
                          const SizedBox(width: 8),
                          if (!a.isDefault) TextButton(onPressed: () => _run(context, () => repo.makeDefault(a.id)), child: const Text('Make default')),
                          const Spacer(),
                          IconButton(tooltip: 'Edit ${a.label} address', onPressed: () => showAddressForm(context, address: a), icon: const Icon(Icons.edit_outlined)),
                          IconButton(
                            tooltip: 'Delete ${a.label} address',
                            onPressed: () async {
                              if (!await confirm(context, title: 'Delete ${a.label} address?', confirmLabel: 'Delete', destructive: true)) return;
                              if (context.mounted) await _run(context, () => repo.delete(a.id), done: 'Address removed');
                            },
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ]),
                      ]),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
