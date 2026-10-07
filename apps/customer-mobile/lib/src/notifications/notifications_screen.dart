import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/models.dart';
import '../common/links.dart';
import 'notifications_provider.dart';

/// Inbox: tap to open (and mark read), or mark everything read.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, AppNotification n) async {
    if (n.unread) {
      ref.read(apiClientProvider).post<dynamic>('notifications/${n.id}/read').then((_) => ref.invalidate(inboxProvider), onError: (Object _) {});
    }
    if (n.link != null && context.mounted) await openLink(context, n.link);
  }

  Future<void> _readAll(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).post<dynamic>('notifications/read-all');
      ref.invalidate(inboxProvider);
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxProvider);
    final unread = inbox.value?.unread ?? 0;
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [if (unread > 0) TextButton(onPressed: () => _readAll(context, ref), child: const Text('Mark all read'))],
      ),
      body: AsyncView<Inbox>(
        value: inbox,
        onRetry: () => ref.invalidate(inboxProvider),
        data: (box) => box.items.isEmpty
            ? const EmptyView(icon: Icons.notifications_none, title: "You're all caught up")
            : RefreshIndicator(
                onRefresh: () => ref.refresh(inboxProvider.future),
                child: ListView.separated(
                  itemCount: box.items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final n = box.items[i];
                    return ListTile(
                      tileColor: n.unread ? scheme.primaryContainer.withValues(alpha: 0.25) : null,
                      leading: Icon(n.unread ? Icons.mark_email_unread_outlined : Icons.drafts_outlined, semanticLabel: n.unread ? 'Unread' : 'Read'),
                      title: Text(n.title, style: text.titleSmall?.copyWith(fontWeight: n.unread ? FontWeight.w700 : FontWeight.w500)),
                      subtitle: Text('${n.body}\n${relative(n.createdAt)}'),
                      isThreeLine: true,
                      onTap: () => _open(context, ref, n),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
