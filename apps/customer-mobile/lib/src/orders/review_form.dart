import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import 'models.dart';

const _tags = ['tasty', 'hot-and-fresh', 'good-packaging', 'value-for-money', 'on-time', 'polite-rider'];

/// "How was your order?" once it's delivered or completed.
class ReviewForm extends ConsumerStatefulWidget {
  const ReviewForm({super.key, required this.order, required this.onDone});
  final OrderDetail order;
  final VoidCallback onDone;

  @override
  ConsumerState<ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<ReviewForm> {
  int _rating = 0;
  int _food = 0;
  int _delivery = 0;
  final _tagsPicked = <String>{};
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final delivery = widget.order.isDelivery;
    final comment = _comment.text.trim();
    try {
      await ref.read(apiClientProvider).post<dynamic>('orders/${widget.order.id}/review', body: {
        'rating': _rating,
        if (_food > 0) 'foodRating': _food,
        if (delivery && _delivery > 0) 'deliveryRating': _delivery,
        if (comment.isNotEmpty) 'comment': comment,
        if (_tagsPicked.isNotEmpty) 'tags': _tagsPicked.toList(),
      });
      if (!mounted) return;
      showMessage(context, 'Thanks for the feedback!');
      widget.onDone();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = widget.order.isDelivery;
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Semantics(header: true, child: Text('How was your order?', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
          const SizedBox(height: 8),
          Text('Overall', style: text.labelLarge),
          StarInput(value: _rating, label: 'Overall rating', onChanged: (n) => setState(() => _rating = n)),
          Text('Food', style: text.labelLarge),
          StarInput(value: _food, label: 'Food rating', onChanged: (n) => setState(() => _food = n)),
          if (delivery) ...[
            Text('Delivery', style: text.labelLarge),
            StarInput(value: _delivery, label: 'Delivery rating', onChanged: (n) => setState(() => _delivery = n)),
          ],
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in _tags)
              if (delivery || (t != 'on-time' && t != 'polite-rider'))
                FilterChip(
                  label: Text(humanize(t.replaceAll('-', '_'))),
                  selected: _tagsPicked.contains(t),
                  onSelected: (on) => setState(() => on ? _tagsPicked.add(t) : _tagsPicked.remove(t)),
                ),
          ]),
          const SizedBox(height: 12),
          TextField(controller: _comment, maxLength: 1000, maxLines: 3, minLines: 2, decoration: const InputDecoration(labelText: 'Anything else? (optional)')),
          const SizedBox(height: 8),
          FilledButton(
            key: const Key('submit-review'),
            onPressed: _rating == 0 || _busy ? null : _submit,
            child: _busy ? const ButtonSpinner() : const Text('Submit review'),
          ),
        ]),
      ),
    );
  }
}
