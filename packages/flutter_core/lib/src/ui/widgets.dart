import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import 'format.dart';
import 'theme.dart';

/// FSSAI veg / non-veg mark: green square with a dot, brown square with a triangle.
class VegMark extends StatelessWidget {
  const VegMark({super.key, required this.veg, this.size = 16});
  final bool veg;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = veg ? const Color(0xFF0F8A0F) : const Color(0xFF963A1E);
    return Semantics(
      label: veg ? 'Veg' : 'Non-veg',
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(border: Border.all(color: color, width: 1.5), borderRadius: BorderRadius.circular(3)),
        alignment: Alignment.center,
        child: veg
            ? Container(width: size / 2, height: size / 2, decoration: BoxDecoration(color: color, shape: BoxShape.circle))
            : CustomPaint(size: Size(size / 2, size / 2.2), painter: _Triangle(color)),
      ),
    );
  }
}

class _Triangle extends CustomPainter {
  _Triangle(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size s) => canvas.drawPath(Path()..moveTo(s.width / 2, 0)..lineTo(s.width, s.height)..lineTo(0, s.height)..close(), Paint()..color = color);
  @override
  bool shouldRepaint(_Triangle old) => old.color != color;
}

enum Tone { good, warning, serious, critical, info, neutral }

const _tones = <String, Tone>{
  'DELIVERED': Tone.good, 'COMPLETED': Tone.good, 'PAID': Tone.good, 'CAPTURED': Tone.good, 'APPROVED': Tone.good, 'ACTIVE': Tone.good,
  'ACHIEVED': Tone.good, 'RECEIVED': Tone.good, 'CONFIRMED': Tone.good, 'IN_STOCK': Tone.good, 'PRESENT': Tone.good,
  'PLACED': Tone.info, 'ACCEPTED': Tone.info, 'PREPARING': Tone.info, 'READY': Tone.info, 'PICKED_UP': Tone.info, 'OUT_FOR_DELIVERY': Tone.info,
  'ASSIGNED': Tone.info, 'AT_PICKUP': Tone.info, 'AT_DROP': Tone.info, 'IN_PROGRESS': Tone.info, 'SENT': Tone.info, 'QUEUED': Tone.info,
  'PENDING': Tone.warning, 'PENDING_PAYMENT': Tone.warning, 'PENDING_APPROVAL': Tone.warning, 'REQUESTED': Tone.warning, 'COD_PENDING': Tone.warning,
  'LOW_STOCK': Tone.warning, 'PAUSED': Tone.neutral, 'PROCESSING': Tone.warning, 'DRAFT': Tone.neutral,
  'OVERDUE': Tone.serious, 'HIGH': Tone.serious, 'CRITICAL': Tone.critical,
  'CANCELLED': Tone.critical, 'REJECTED': Tone.critical, 'FAILED': Tone.critical, 'OUT_OF_STOCK': Tone.critical, 'SUSPENDED': Tone.critical,
  'EXPIRED': Tone.neutral, 'CLOSED': Tone.neutral,
};

/// Status chip: colour always paired with an icon and the label (never colour alone).
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key, this.label, this.tone});
  final String status;
  final String? label;
  final Tone? tone;

  @override
  Widget build(BuildContext context) {
    final t = tone ?? _tones[status] ?? Tone.neutral;
    final scheme = Theme.of(context).colorScheme;
    final (Color c, IconData icon) = switch (t) {
      Tone.good => (FoodGridTheme.good, Icons.check_circle_outline),
      Tone.warning => (FoodGridTheme.warning, Icons.schedule),
      Tone.serious => (FoodGridTheme.serious, Icons.warning_amber_rounded),
      Tone.critical => (FoodGridTheme.critical, Icons.cancel_outlined),
      Tone.info => (const Color(0xFF2A78D6), Icons.radio_button_unchecked),
      Tone.neutral => (scheme.outline, Icons.radio_button_unchecked),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), border: Border.all(color: c.withValues(alpha: 0.4)), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: t == Tone.good ? FoodGridTheme.goodText : scheme.onSurface),
        const SizedBox(width: 4),
        Text(label ?? humanize(status), style: Theme.of(context).textTheme.labelMedium),
      ]),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.title, this.message, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(title, style: text.titleMedium, textAlign: TextAlign.center),
          if (message != null) ...[const SizedBox(height: 4), Text(message!, style: text.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant), textAlign: TextAlign.center)],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      ),
    );
  }
}

/// A failure in words people understand: offline, signed out, not allowed
/// (with the server's own message, e.g. "Your role can't manage orders."),
/// not found, trouble on our side; [title] / [message] replace that copy.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry, this.title, this.message});
  final Object error;
  final VoidCallback? onRetry;
  final String? title;
  final String? message;

  static (String, String) _copy(Object e) => switch (e) {
        ApiException(isNetwork: true) => ("You're offline", 'Check your internet connection and try again.'),
        ApiException(status: 401) => ('Please sign in again', 'Your session has ended.'),
        ApiException(status: 403) => ("You can't open this", e.toString()),
        ApiException(status: 404) => ('Not found', 'It may have been removed, or the link is out of date.'),
        ApiException(:final status) when status >= 500 => ('Something went wrong on our side', 'Please try again in a moment.'),
        _ => ('Something went wrong', e.toString()),
      };

  @override
  Widget build(BuildContext context) {
    final (t, m) = _copy(error);
    return EmptyView(
      icon: error is ApiException && (error as ApiException).isNetwork ? Icons.wifi_off : Icons.error_outline,
      title: title ?? t,
      message: message ?? m,
      action: onRetry == null ? null : OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
    );
  }
}

/// Loading / error / data for a Riverpod [AsyncValue]. A refresh keeps the
/// data on screen. [errorBuilder] replaces the default [ErrorView]; with
/// [AsyncView.sliver], [data] returns a sliver and the other states fill the
/// rest of the scroll view.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.data, this.onRetry, this.errorBuilder}) : sliver = false;
  const AsyncView.sliver({super.key, required this.value, required this.data, this.onRetry, this.errorBuilder}) : sliver = true;
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final Widget Function(Object error)? errorBuilder;
  final bool sliver;

  @override
  Widget build(BuildContext context) {
    final Widget other = switch (value) {
      AsyncData(:final value) => data(value),
      AsyncError(:final error) when !value.hasValue => errorBuilder?.call(error) ?? ErrorView(error: error, onRetry: onRetry),
      _ when value.hasValue => data(value.requireValue),
      _ => const Center(child: CircularProgressIndicator()),
    };
    return !sliver || value.hasValue ? other : SliverFillRemaining(hasScrollBody: false, child: other);
  }
}

/// KPI tile for dashboards (earnings, sales).
class KpiTile extends StatelessWidget {
  const KpiTile({super.key, required this.label, required this.value, this.hint});
  final String label;
  final String value;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: text.labelMedium?.copyWith(color: muted)),
          const SizedBox(height: 4),
          Text(value, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()])),
          if (hint != null) Text(hint!, style: text.bodySmall?.copyWith(color: muted)),
        ]),
      ),
    );
  }
}

/// Shows an API error (or any error) as a snackbar.
void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
