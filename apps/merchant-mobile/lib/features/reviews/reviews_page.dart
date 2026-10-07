import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import '../outlets/outlet_providers.dart';

class Review {
  const Review({
    required this.id,
    required this.rating,
    this.foodRating,
    this.deliveryRating,
    this.comment,
    this.tags = const [],
    this.reply,
    this.repliedAt,
    this.createdAt,
    this.orderNumber,
  });

  final String id;
  final int rating;
  final int? foodRating;
  final int? deliveryRating;
  final String? comment;
  final List<String> tags;
  final String? reply;
  final DateTime? repliedAt;
  final DateTime? createdAt;
  final String? orderNumber;

  factory Review.fromJson(Json j) => Review(
        id: str(j['id']),
        rating: intOf(j['rating']),
        foodRating: j['foodRating'] == null ? null : intOf(j['foodRating']),
        deliveryRating: j['deliveryRating'] == null ? null : intOf(j['deliveryRating']),
        comment: strOrNull(j['comment']),
        tags: listOfStrings(j['tags']),
        reply: strOrNull(j['reply']),
        repliedAt: dateOrNull(j['repliedAt']),
        createdAt: dateOrNull(j['createdAt']),
        orderNumber: strOrNull(mapOf(j['order'])['orderNumber']),
      );
}

enum ReviewFilter {
  all('All'),
  unreplied('Not replied'),
  low('3★ or less');

  const ReviewFilter(this.label);
  final String label;

  bool matches(Review r) => switch (this) {
        ReviewFilter.all => true,
        ReviewFilter.unreplied => r.reply == null,
        ReviewFilter.low => r.rating <= 3,
      };
}

/// GET merchant/reviews?outletId=&page= (30 per page, newest first).
final reviewsProvider = FutureProvider.autoDispose.family<Page<Review>, int>((ref, page) async {
  final outletId = ref.watch(currentOutletIdProvider);
  if (outletId == null) return const Page([], page: 1, totalPages: 1, total: 0);
  return Page.fromJson(await ref.watch(apiClientProvider).get<Map<String, dynamic>>('merchant/reviews', query: {'outletId': outletId, 'page': page}), Review.fromJson);
});

class ReviewsPage extends ConsumerStatefulWidget {
  const ReviewsPage({super.key});

  @override
  ConsumerState<ReviewsPage> createState() => _ReviewsPageState();
}

class _ReviewsPageState extends ConsumerState<ReviewsPage> {
  int _page = 1;
  ReviewFilter _filter = ReviewFilter.all;

  @override
  Widget build(BuildContext context) {
    final outlet = ref.watch(currentOutletProvider);
    final list = ref.watch(reviewsProvider(_page));
    final canReply = ref.watch(permissionsProvider).can(Perm.ordersManage);
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Reviews'),
          if (outlet != null && outlet.ratingCount > 0)
            Text('${outlet.ratingAvg.toStringAsFixed(1)} ★ from ${number(outlet.ratingCount)} ratings', style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: ChoiceWrap<ReviewFilter>(values: ReviewFilter.values, selected: _filter, label: (f) => f.label, onSelected: (f) => setState(() => _filter = f), semanticsLabel: 'Show'),
        ),
        Expanded(
          child: AsyncView<Page<Review>>(
            value: list,
            onRetry: () => ref.invalidate(reviewsProvider(_page)),
            data: (p) {
              final rows = p.data.where(_filter.matches).toList();
              return RefreshIndicator(
                onRefresh: () => ref.refresh(reviewsProvider(_page).future),
                child: ListView(padding: const EdgeInsets.all(12), children: [
                  if (_filter != ReviewFilter.all) Text('Filter applies to this page of ${p.data.length}.', style: Theme.of(context).textTheme.bodySmall),
                  if (rows.isEmpty) const EmptyView(icon: Icons.star_outline, title: 'No reviews match'),
                  for (final r in rows) Padding(padding: const EdgeInsets.only(top: 8), child: ReviewCard(review: r, canReply: canReply, page: _page)),
                  if (p.totalPages > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        OutlinedButton(onPressed: _page > 1 ? () => setState(() => _page--) : null, child: const Text('Newer')),
                        Text('Page $_page of ${p.totalPages}'),
                        OutlinedButton(onPressed: _page < p.totalPages ? () => setState(() => _page++) : null, child: const Text('Older')),
                      ]),
                    ),
                ]),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars(this.value);
  final int value;

  @override
  Widget build(BuildContext context) => Semantics(
        label: '$value of 5 stars',
        excludeSemantics: true,
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (var i = 1; i <= 5; i++) Icon(i <= value ? Icons.star_rounded : Icons.star_outline_rounded, size: 20, color: i <= value ? const Color(0xFFF59E0B) : Theme.of(context).colorScheme.outline),
        ]),
      );
}

class ReviewCard extends ConsumerStatefulWidget {
  const ReviewCard({super.key, required this.review, required this.canReply, required this.page});
  final Review review;
  final bool canReply;
  final int page;

  @override
  ConsumerState<ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends ConsumerState<ReviewCard> {
  bool _open = false;
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    final reply = _text.text.trim();
    if (reply.isEmpty) {
      showError(context, 'Write a reply first');
      return;
    }
    await ref.read(apiClientProvider).post<dynamic>('merchant/reviews/${widget.review.id}/reply', body: {'reply': reply});
    if (!mounted) return;
    showMessage(context, 'Reply posted');
    setState(() => _open = false);
    ref.invalidate(reviewsProvider(widget.page));
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.review;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            _Stars(r.rating),
            const Spacer(),
            Text([?r.orderNumber, dateTime(r.createdAt)].join(' · '), style: text.bodySmall?.copyWith(color: muted)),
          ]),
          if (r.foodRating != null || r.deliveryRating != null)
            Text([if (r.foodRating != null) 'Food ${r.foodRating}/5', if (r.deliveryRating != null) 'Delivery ${r.deliveryRating}/5'].join(' · '), style: text.bodySmall?.copyWith(color: muted)),
          const SizedBox(height: 6),
          Text(r.comment ?? 'No comment', style: r.comment == null ? text.bodyMedium?.copyWith(fontStyle: FontStyle.italic, color: muted) : text.bodyLarge),
          if (r.tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(spacing: 6, runSpacing: 4, children: [for (final t in r.tags) Chip(label: Text(humanize(t.replaceAll('-', '_'))), visualDensity: VisualDensity.compact)]),
            ),
          const SizedBox(height: 8),
          if (r.reply != null)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                border: Border(left: BorderSide(color: Theme.of(context).colorScheme.primary, width: 3)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Your reply · ${dateTime(r.repliedAt)}', style: text.labelMedium?.copyWith(color: muted)),
                Text(r.reply!),
              ]),
            )
          else if (_open) ...[
            TextField(
              controller: _text,
              autofocus: true,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(labelText: 'Reply', hintText: "Thank the customer or explain what you'll fix"),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(onPressed: () => setState(() => _open = false), child: const Text('Cancel')),
              const SizedBox(width: 8),
              ActionButton(label: 'Post reply', icon: Icons.send, onPressed: _post),
            ]),
          ] else if (widget.canReply)
            Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(onPressed: () => setState(() => _open = true), icon: const Icon(Icons.reply), label: const Text('Reply'))),
        ]),
      ),
    );
  }
}
