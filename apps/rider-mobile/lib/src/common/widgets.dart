import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// A titled card section.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.icon, this.trailing, this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 16)});

  final String title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: padding,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            if (icon != null) ...[ExcludeSemantics(child: Icon(icon, size: 20)), const SizedBox(width: 8)],
            Expanded(child: Semantics(header: true, child: Text(title, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)))),
            ?trailing,
          ]),
          const SizedBox(height: 12),
          child,
        ]),
      ),
    );
  }
}

/// Loading / error / data for a section inside a scrolling page (unlike
/// [AsyncView], it never expands to fill the screen).
class SectionAsync<T> extends StatelessWidget {
  const SectionAsync({super.key, required this.value, required this.data, this.onRetry, this.minHeight = 96});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    if (value.hasValue) return data(value.requireValue);
    if (value.hasError) return InlineError(error: value.error!, onRetry: onRetry);
    return SizedBox(height: minHeight, child: const Center(child: CircularProgressIndicator()));
  }
}

/// A compact error with a retry button, for use inside cards and lists.
class InlineError extends StatelessWidget {
  const InlineError({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      liveRegion: true,
      child: Row(children: [
        Icon(error is ApiException && (error as ApiException).isNetwork ? Icons.wifi_off : Icons.error_outline, color: scheme.error),
        const SizedBox(width: 10),
        Expanded(child: Text(error.toString(), style: TextStyle(color: scheme.onSurfaceVariant))),
        if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
      ]),
    );
  }
}

/// A highlighted notice (cash due, paused incentive, account state).
class Notice extends StatelessWidget {
  const Notice({super.key, required this.message, this.icon = Icons.info_outline, this.color, this.leading});
  final String message;
  final IconData icon;
  final Color? color;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? scheme.primary;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.08), border: Border.all(color: c.withValues(alpha: 0.4)), borderRadius: BorderRadius.circular(10)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ExcludeSemantics(child: Icon(icon, color: c, size: 20)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (leading != null) ...[leading!, const SizedBox(height: 6)],
            Text(message, style: Theme.of(context).textTheme.bodyMedium),
          ]),
        ),
      ]),
    );
  }
}

/// "Newer · 2 / 24 · Older" pager for statements.
class Pager extends StatelessWidget {
  const Pager({super.key, required this.page, required this.totalPages, required this.onPage});
  final int page;
  final int totalPages;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) return const SizedBox.shrink();
    return Row(children: [
      Expanded(
        child: OutlinedButton.icon(onPressed: page > 1 ? () => onPage(page - 1) : null, icon: const Icon(Icons.chevron_left), label: const Text('Newer')),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text('$page / $totalPages', semanticsLabel: 'Page $page of $totalPages'),
      ),
      Expanded(
        child: OutlinedButton.icon(
          onPressed: page < totalPages ? () => onPage(page + 1) : null,
          icon: const Icon(Icons.chevron_right),
          iconAlignment: IconAlignment.end,
          label: const Text('Older'),
        ),
      ),
    ]);
  }
}

/// Shows [message] at once, replacing any snackbar still on screen (a queued
/// "Picked up" must not delay "Delivered!").
void toast(ScaffoldMessengerState messenger, String message, {SnackBarAction? action}) => messenger
  ..removeCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(message), action: action));

/// Small grey caption.
class Caption extends StatelessWidget {
  const Caption(this.text, {super.key, this.maxLines});
  final String text;
  final int? maxLines;

  @override
  Widget build(BuildContext context) => Text(
        text,
        maxLines: maxLines,
        overflow: maxLines == null ? null : TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      );
}

/// Inline spinner for busy buttons.
class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) => SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: color));
}

/// Sign-out with a confirmation; [beforeSignOut] runs first (e.g. go offline).
class SignOutButton extends ConsumerWidget {
  const SignOutButton({super.key, this.beforeSignOut});
  final Future<void> Function()? beforeSignOut;

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
        tooltip: 'Sign out',
        icon: const Icon(Icons.logout),
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (c) => AlertDialog(
              title: const Text('Sign out?'),
              content: const Text('You will go offline and stop receiving orders on this phone.'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
                FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sign out')),
              ],
            ),
          );
          if (ok != true || !context.mounted) return;
          final container = ProviderScope.containerOf(context, listen: false);
          try {
            await beforeSignOut?.call();
          } catch (_) {
            // signing out never depends on the network
          }
          await container.read(sessionProvider.notifier).signOut();
        },
      );
}
