import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../common/errors.dart';
import '../../common/widgets.dart';
import '../duty_repository.dart';
import '../models.dart';

const failReasons = ['Customer not reachable', 'Customer refused the order', 'Wrong address', 'Unsafe location', 'Vehicle breakdown'];

/// Reports a delivery that cannot be completed. Pops `true` once reported.
class FailSheet extends ConsumerStatefulWidget {
  const FailSheet({super.key, required this.delivery});
  final Delivery delivery;

  @override
  ConsumerState<FailSheet> createState() => _FailSheetState();
}

class _FailSheetState extends ConsumerState<FailSheet> {
  String _reason = failReasons.first;
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final repo = ref.read(dutyRepositoryProvider);
    setState(() => (_busy = true, _error = null));
    final note = _note.text.trim();
    try {
      await repo.fail(widget.delivery.id, note.isEmpty ? _reason : '$_reason: $note');
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = riderMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Report a failed delivery?', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Caption('Call the customer twice and wait 10 minutes at the door before reporting.'),
          const SizedBox(height: 8),
          RadioGroup<String>(
            groupValue: _reason,
            onChanged: (v) => _busy ? null : setState(() => _reason = v ?? _reason),
            child: Column(children: [for (final r in failReasons) RadioListTile<String>(value: r, title: Text(r), contentPadding: EdgeInsets.zero)]),
          ),
          TextField(controller: _note, enabled: !_busy, maxLines: 2, decoration: const InputDecoration(labelText: 'Details (optional)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: InlineError(error: _error!)),
          const SizedBox(height: 16),
          SizedBox(
            height: 56,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
              onPressed: _busy ? null : _submit,
              child: _busy ? ButtonSpinner(color: scheme.onError) : const Text('Report failed delivery'),
            ),
          ),
        ]),
      ),
    );
  }
}
