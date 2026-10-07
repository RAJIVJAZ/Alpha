import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// Food photo with a neutral placeholder while loading and when the image is
/// missing or fails (demo image hosts do not resolve).
class FoodImage extends StatelessWidget {
  const FoodImage({super.key, required this.url, this.width, this.height, this.radius = 12, this.icon = Icons.restaurant});

  final String? url;
  final double? width;
  final double? height;
  final double radius;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = Container(
      width: width,
      height: height,
      color: scheme.surfaceContainerHighest,
      alignment: Alignment.center,
      child: Icon(icon, color: scheme.outline, size: 28),
    );
    final u = url;
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: u == null || u.isEmpty
            ? placeholder
            : Image.network(
                u,
                width: width,
                height: height,
                fit: BoxFit.cover,
                frameBuilder: (context, child, frame, sync) => frame == null && !sync ? placeholder : child,
                errorBuilder: (context, error, stack) => placeholder,
              ),
      ),
    );
  }
}

/// "4.3 ★ (485)" or "New" when there are no ratings yet.
class RatingPill extends StatelessWidget {
  const RatingPill({super.key, required this.value, this.count});
  final double value;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final c = count;
    if (c != null && c == 0) {
      return Semantics(label: 'New, no ratings yet', child: ExcludeSemantics(child: Text('New', style: text.labelMedium)));
    }
    final shown = c == null ? '' : ' (${c >= 1000 ? '${(c / 1000).toStringAsFixed(1)}K' : c})';
    return Semantics(
      label: 'Rated ${value.toStringAsFixed(1)} out of 5${c == null ? '' : ' from $c ratings'}',
      child: ExcludeSemantics(
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xFF0F7A3A), borderRadius: BorderRadius.circular(6)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(value.toStringAsFixed(1), style: text.labelMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
              const SizedBox(width: 2),
              const Icon(Icons.star_rounded, size: 13, color: Colors.white),
            ]),
          ),
          if (shown.isNotEmpty) Text(shown, style: text.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
      ),
    );
  }
}

/// − qty + control for menu items and cart lines.
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.value, required this.onChanged, required this.label, this.busy = false, this.max = 50});

  final int value;
  final ValueChanged<int> onChanged;
  final String label;
  final bool busy;
  final int max;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 36,
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border.all(color: scheme.primary.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          color: scheme.primary,
          tooltip: 'Remove one $label',
          onPressed: busy ? null : () => onChanged(value - 1),
          icon: const Icon(Icons.remove),
        ),
        Semantics(
          container: true,
          liveRegion: true,
          label: '$value in cart',
          child: ExcludeSemantics(
            child: SizedBox(
              width: 22,
              child: Text('$value', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, color: scheme.primary)),
            ),
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          color: scheme.primary,
          tooltip: 'Add one more $label',
          onPressed: busy || value >= max ? null : () => onChanged(value + 1),
          icon: const Icon(Icons.add),
        ),
      ]),
    );
  }
}

enum NoticeTone { info, warning, good, critical }

/// Inline notice with an icon (status is never shown by colour alone).
class Notice extends StatelessWidget {
  const Notice(this.message, {super.key, this.tone = NoticeTone.warning, this.title, this.action});

  final String message;
  final String? title;
  final NoticeTone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (Color c, IconData icon) = switch (tone) {
      NoticeTone.info => (const Color(0xFF2A78D6), Icons.info_outline),
      NoticeTone.warning => (FoodGridTheme.warning, Icons.schedule),
      NoticeTone.good => (FoodGridTheme.good, Icons.check_circle_outline),
      NoticeTone.critical => (FoodGridTheme.critical, Icons.error_outline),
    };
    final text = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.withValues(alpha: 0.12),
          border: Border.all(color: c.withValues(alpha: 0.45)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurface),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (title != null) Text(title!, style: text.titleSmall),
              Text(message, style: text.bodyMedium),
            ]),
          ),
          ?action,
        ]),
      ),
    );
  }
}

/// Section title with an optional hint and trailing action.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.hint, this.trailing, this.padding = const EdgeInsets.fromLTRB(16, 20, 16, 8)});

  final String title;
  final String? hint;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: padding,
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(header: true, child: Text(title, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
            if (hint != null) Text(hint!, style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
        ?trailing,
      ]),
    );
  }
}

/// 1–5 star input.
class StarInput extends StatelessWidget {
  const StarInput({super.key, required this.value, required this.onChanged, required this.label});

  final int value;
  final ValueChanged<int> onChanged;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (var n = 1; n <= 5; n++)
          IconButton(
            tooltip: '$label: $n star${n == 1 ? '' : 's'}',
            isSelected: value == n,
            onPressed: () => onChanged(n),
            icon: Icon(n <= value ? Icons.star_rounded : Icons.star_outline_rounded, size: 30, color: n <= value ? const Color(0xFFE8A317) : Theme.of(context).colorScheme.outline),
          ),
      ]),
    );
  }
}

/// Newer / page / Older controls for paged lists.
class Pager extends StatelessWidget {
  const Pager({super.key, required this.page, required this.totalPages, required this.onPage});
  final int page;
  final int totalPages;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        OutlinedButton(onPressed: page > 1 ? () => onPage(page - 1) : null, child: const Text('Newer')),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text('$page / $totalPages')),
        OutlinedButton(onPressed: page < totalPages ? () => onPage(page + 1) : null, child: const Text('Older')),
      ]),
    );
  }
}

/// A yes/no confirmation; resolves true when confirmed.
Future<bool> confirm(BuildContext context, {required String title, String? message, String confirmLabel = 'Confirm', bool destructive = false, Widget? content}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: content ?? (message == null ? null : Text(message)),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Not now')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: FoodGridTheme.critical, foregroundColor: Colors.white) : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Spinner sized for buttons.
class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2));
}

/// Label/value row used in bills and summaries.
class KeyValueRow extends StatelessWidget {
  const KeyValueRow(this.label, this.value, {super.key, this.strong = false, this.valueStyle});
  final String label;
  final String value;
  final bool strong;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Expanded(child: Text(label, style: strong ? text.titleSmall : text.bodyMedium?.copyWith(color: muted))),
        Text(value, style: (strong ? text.titleSmall : text.bodyMedium)?.merge(valueStyle).copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
      ]),
    );
  }
}
