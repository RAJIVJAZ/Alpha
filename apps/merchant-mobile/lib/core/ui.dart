import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'errors.dart';

enum ActionKind { filled, tonal, outlined, text }

/// A button that runs an async action: disables itself and shows a spinner
/// while it runs, and reports failures (403s explained) in a snackbar.
class ActionButton extends StatefulWidget {
  const ActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.confirm,
    this.icon,
    this.kind = ActionKind.filled,
    this.tooltip,
    this.large = false,
    this.destructive = false,
  });

  final String label;
  final IconData? icon;
  final Future<void> Function()? onPressed;

  /// Asked first (e.g. a sheet for a reason or prep time), before the
  /// button turns busy; returning false cancels.
  final Future<bool> Function()? confirm;
  final ActionKind kind;
  final String? tooltip;
  final bool large;
  final bool destructive;

  @override
  State<ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<ActionButton> {
  bool _busy = false;

  Future<void> _run() async {
    // both callbacks from the same build, even if the parent rebuilds meanwhile
    final fn = widget.onPressed;
    final confirm = widget.confirm;
    if (fn == null || _busy) return;
    if (confirm != null && !await confirm()) return;
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onPressed = widget.onPressed == null || _busy ? null : _run;
    final icon = _busy
        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : widget.icon == null
            ? null
            : Icon(widget.icon);
    final label = Text(widget.label);
    final minSize = widget.large ? const Size(64, 56) : null;
    final textStyle = widget.large ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600) : null;
    final ButtonStyle style = switch (widget.kind) {
      ActionKind.filled => FilledButton.styleFrom(
          minimumSize: minSize,
          textStyle: textStyle,
          backgroundColor: widget.destructive ? scheme.error : null,
          foregroundColor: widget.destructive ? scheme.onError : null,
        ),
      ActionKind.tonal => FilledButton.styleFrom(minimumSize: minSize, textStyle: textStyle),
      ActionKind.outlined => OutlinedButton.styleFrom(
          minimumSize: minSize,
          textStyle: textStyle,
          foregroundColor: widget.destructive ? scheme.error : null,
        ),
      ActionKind.text => TextButton.styleFrom(minimumSize: minSize, textStyle: textStyle, foregroundColor: widget.destructive ? scheme.error : null),
    };
    final Widget button = switch (widget.kind) {
      ActionKind.filled => icon == null ? FilledButton(onPressed: onPressed, style: style, child: label) : FilledButton.icon(onPressed: onPressed, style: style, icon: icon, label: label),
      ActionKind.tonal => icon == null ? FilledButton.tonal(onPressed: onPressed, style: style, child: label) : FilledButton.tonalIcon(onPressed: onPressed, style: style, icon: icon, label: label),
      ActionKind.outlined => icon == null ? OutlinedButton(onPressed: onPressed, style: style, child: label) : OutlinedButton.icon(onPressed: onPressed, style: style, icon: icon, label: label),
      ActionKind.text => icon == null ? TextButton(onPressed: onPressed, style: style, child: label) : TextButton.icon(onPressed: onPressed, style: style, icon: icon, label: label),
    };
    return widget.tooltip == null ? button : Tooltip(message: widget.tooltip!, child: button);
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.count, this.trailing, this.padding = const EdgeInsets.fromLTRB(16, 20, 16, 8)});
  final String title;
  final int? count;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: padding,
      child: Semantics(
        header: true,
        child: Row(children: [
          Expanded(child: Text(count == null ? title : '$title ($count)', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
          ?trailing,
        ]),
      ),
    );
  }
}

/// A label / value line for bills and summaries.
class AmountRow extends StatelessWidget {
  const AmountRow(this.label, this.value, {super.key, this.bold = false, this.muted = false});
  final String label;
  final String value;
  final bool bold;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.bodyLarge;
    final style = base?.copyWith(
      fontWeight: bold ? FontWeight.w700 : null,
      color: muted ? Theme.of(context).colorScheme.onSurfaceVariant : null,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: MergeSemantics(
        child: Row(children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ]),
      ),
    );
  }
}

/// Shown where a role can see something but not change it.
class PermissionNote extends StatelessWidget {
  const PermissionNote(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Icon(Icons.lock_outline, size: 18, color: scheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(child: Text(message, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant))),
      ]),
    );
  }
}

/// Inline banner for a failed background refresh (data on screen may be stale).
class StaleBanner extends StatelessWidget {
  const StaleBanner({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final offline = error is ApiException && (error as ApiException).isNetwork;
    return Semantics(
      liveRegion: true,
      child: Material(
        color: scheme.errorContainer,
        child: ListTile(
          dense: true,
          leading: Icon(offline ? Icons.wifi_off : Icons.sync_problem, color: scheme.onErrorContainer),
          title: Text(offline ? 'Offline: showing the last update' : "Couldn't refresh: ${describeError(error)}", style: TextStyle(color: scheme.onErrorContainer)),
          trailing: onRetry == null ? null : TextButton(onPressed: onRetry, child: const Text('Retry')),
        ),
      ),
    );
  }
}

/// Large count badge used on lane tabs and the navigation bar.
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key, this.highlight = false});
  final int count;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: highlight ? scheme.primary : scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(99)),
      child: Text(
        '$count',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(color: highlight ? scheme.onPrimary : scheme.onSurface, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Asks for confirmation in a bottom sheet; [body] can hold extra inputs.
Future<bool> confirmSheet(
  BuildContext context, {
  required String title,
  String? message,
  required String confirmLabel,
  bool destructive = false,
  Widget Function(BuildContext context, StateSetter setState)? body,
}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (message != null) ...[const SizedBox(height: 6), Text(message, style: Theme.of(context).textTheme.bodyMedium)],
          if (body != null) ...[const SizedBox(height: 16), body(context, setState)],
          const SizedBox(height: 20),
          FilledButton(
            style: destructive ? FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error, foregroundColor: Theme.of(context).colorScheme.onError) : null,
            onPressed: () => Navigator.pop(context, true),
            child: Text(confirmLabel),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Go back')),
        ]),
      ),
    ),
  );
  return ok ?? false;
}

/// Choice chips for picking one value from a short list.
class ChoiceWrap<T> extends StatelessWidget {
  const ChoiceWrap({super.key, required this.values, required this.selected, required this.label, required this.onSelected, this.semanticsLabel});
  final List<T> values;
  final T selected;
  final String Function(T value) label;
  final ValueChanged<T> onSelected;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) => Semantics(
        label: semanticsLabel,
        container: semanticsLabel != null,
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          for (final v in values)
            ChoiceChip(
              label: Text(label(v)),
              selected: v == selected,
              onSelected: (_) => onSelected(v),
              labelStyle: Theme.of(context).textTheme.titleSmall,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            ),
        ]),
      );
}
