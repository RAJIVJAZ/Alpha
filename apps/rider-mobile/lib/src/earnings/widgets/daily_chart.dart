import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../models.dart';

String shortDay(String ymd) => DateFormat('d MMM', 'en_US').format(DateTime.parse(ymd));
String weekdayDay(String ymd) => DateFormat('EEE d MMM', 'en_US').format(DateTime.parse(ymd));

/// Earnings per day as columns, with tap-to-inspect and a list alternative
/// for screen readers (the chart itself is summarised in one label).
class DailyEarningsChart extends StatefulWidget {
  const DailyEarningsChart({super.key, required this.days});
  final List<DailyEarning> days;

  @override
  State<DailyEarningsChart> createState() => _DailyEarningsChartState();
}

class _DailyEarningsChartState extends State<DailyEarningsChart> {
  int? _selected;

  @override
  void didUpdateWidget(DailyEarningsChart old) {
    super.didUpdateWidget(old);
    if (old.days.length != widget.days.length) _selected = null;
  }

  int get _peak {
    var best = 0;
    for (var i = 1; i < widget.days.length; i++) {
      if (widget.days[i].amount > widget.days[best].amount) best = i;
    }
    return best;
  }

  @override
  Widget build(BuildContext context) {
    final days = widget.days;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    if (days.isEmpty) return const SizedBox.shrink();
    final focus = _selected ?? _peak;
    final f = days[focus];
    final total = days.fold<double>(0, (s, d) => s + d.amount);
    final summary = days.length == 1
        ? 'Earnings on ${shortDay(days.first.date)}: ${money(days.first.amount, whole: true)}'
        : 'Bar chart of earnings per day from ${shortDay(days.first.date)} to ${shortDay(days.last.date)}, '
            '${money(total, whole: true)} in total. Highest ${money(days[_peak].amount, whole: true)} on ${shortDay(days[_peak].date)}. '
            'The daily breakdown list below has every value.';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ExcludeSemantics(
        child: Text.rich(
          TextSpan(children: [
            TextSpan(text: weekdayDay(f.date), style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
            const TextSpan(text: '   '),
            TextSpan(text: money(f.amount, whole: true), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            TextSpan(text: ' · ${f.deliveries} deliveries', style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
            if (_selected == null && days.length > 1) TextSpan(text: '  (best day)', style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
          ]),
        ),
      ),
      const SizedBox(height: 8),
      Semantics(
        label: summary,
        image: true,
        excludeSemantics: true,
        child: SizedBox(
          height: 180,
          child: LayoutBuilder(
            builder: (context, box) {
              final painter = _BarsPainter(
                days: days,
                selected: focus,
                bar: scheme.primary,
                barMuted: scheme.primary.withValues(alpha: 0.45),
                grid: scheme.outlineVariant,
                label: text.labelSmall!.copyWith(color: scheme.onSurfaceVariant, fontFeatures: const [FontFeature.tabularFigures()]),
              );
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) => setState(() => _selected = painter.indexAt(d.localPosition, box.biggest)),
                onHorizontalDragUpdate: (d) => setState(() => _selected = painter.indexAt(d.localPosition, box.biggest)),
                child: CustomPaint(size: box.biggest, painter: painter),
              );
            },
          ),
        ),
      ),
    ]);
  }
}

/// Clean axis maximum: 1, 2, 2.5 or 5 × 10^n at or above [v].
double niceCeil(double v) {
  if (v <= 0) return 100;
  final mag = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  for (final m in const [1.0, 2.0, 2.5, 5.0, 10.0]) {
    if (m * mag >= v) return m * mag;
  }
  return 10 * mag;
}

class _BarsPainter extends CustomPainter {
  _BarsPainter({required this.days, required this.selected, required this.bar, required this.barMuted, required this.grid, required this.label});

  final List<DailyEarning> days;
  final int selected;
  final Color bar;
  final Color barMuted;
  final Color grid;
  final TextStyle label;

  static const _left = 44.0;
  static const _bottom = 20.0;
  static const _top = 6.0;

  double get _max => niceCeil(days.fold<double>(0, (m, d) => math.max(m, d.amount)));

  Rect _plot(Size s) => Rect.fromLTRB(_left, _top, s.width, s.height - _bottom);

  int indexAt(Offset p, Size s) {
    final plot = _plot(s);
    final slot = plot.width / days.length;
    return ((p.dx - plot.left) / slot).floor().clamp(0, days.length - 1);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final plot = _plot(size);
    final max = _max;
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;

    // recessive hairline grid with clean ticks: 0, half, max
    for (final t in [0.0, max / 2, max]) {
      final y = plot.bottom - plot.height * (t / max);
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), gridPaint);
      _text(canvas, moneyCompact(t), Offset(_left - 6, y), align: TextAlign.right, anchorY: 0.5);
    }

    final slot = plot.width / days.length;
    // columns are capped at 24px and never touch: at least a 2px gap
    final width = math.max(2.0, math.min(24.0, slot - 2));
    for (var i = 0; i < days.length; i++) {
      final d = days[i];
      final h = plot.height * (d.amount / max);
      final cx = plot.left + slot * (i + 0.5);
      if (h > 0) {
        final r = math.min(4.0, math.min(width / 2, h));
        final rect = RRect.fromRectAndCorners(
          Rect.fromLTWH(cx - width / 2, plot.bottom - h, width, h),
          topLeft: Radius.circular(r),
          topRight: Radius.circular(r),
        );
        canvas.drawRRect(rect, Paint()..color = i == selected ? bar : barMuted);
      }
    }

    // x labels: first, last and the focused day, without collisions
    final labelled = <int>{0, days.length - 1, selected};
    final placed = <Rect>[];
    for (final i in (labelled.toList()..sort((a, b) => (a == selected ? -1 : 0) - (b == selected ? -1 : 0)))) {
      final cx = plot.left + slot * (i + 0.5);
      final painter = _layout(shortDay(days[i].date));
      var x = cx - painter.width / 2;
      x = x.clamp(plot.left - 4, size.width - painter.width);
      final r = Rect.fromLTWH(x - 4, plot.bottom + 4, painter.width + 8, painter.height);
      if (placed.any((p) => p.overlaps(r))) continue;
      placed.add(r);
      painter.paint(canvas, Offset(x, plot.bottom + 4));
    }
  }

  TextPainter _layout(String s) => TextPainter(text: TextSpan(text: s, style: label), textDirection: TextDirection.ltr)..layout();

  void _text(Canvas canvas, String s, Offset at, {TextAlign align = TextAlign.left, double anchorY = 0}) {
    final p = _layout(s);
    final dx = align == TextAlign.right ? at.dx - p.width : at.dx;
    p.paint(canvas, Offset(dx, at.dy - p.height * anchorY));
  }

  @override
  bool shouldRepaint(_BarsPainter old) => old.days != days || old.selected != selected || old.bar != bar || old.grid != grid;
}

/// The table alternative to the chart: every day with its deliveries and amount.
class DailyEarningsList extends StatelessWidget {
  const DailyEarningsList({super.key, required this.days});
  final List<DailyEarning> days;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    const tabular = TextStyle(fontFeatures: [FontFeature.tabularFigures()]);
    return Column(children: [
      for (final d in days.reversed)
        MergeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Expanded(child: Text(weekdayDay(d.date))),
              SizedBox(width: 96, child: Text('${d.deliveries} ${d.deliveries == 1 ? 'trip' : 'trips'}', textAlign: TextAlign.right, style: tabular.copyWith(color: muted))),
              SizedBox(width: 96, child: Text(money(d.amount), textAlign: TextAlign.right, style: tabular)),
            ]),
          ),
        ),
    ]);
  }
}
