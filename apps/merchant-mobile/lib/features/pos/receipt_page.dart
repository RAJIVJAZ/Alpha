import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/ui.dart';
import 'bill.dart';

/// Paid receipt with the GST split (CGST / SGST) and packaging, as pos.tsx.
class ReceiptPage extends StatelessWidget {
  const ReceiptPage({super.key, required this.receipt});
  final Receipt receipt;

  @override
  Widget build(BuildContext context) {
    final r = receipt;
    final text = Theme.of(context).textTheme;
    final mono = text.bodyLarge?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    String amt(double v) => v.toStringAsFixed(2);
    return Scaffold(
      appBar: AppBar(title: Text('Paid · ${r.orderNumber}'), automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(
            liveRegion: true,
            child: Row(children: [
              const Icon(Icons.check_circle, color: FoodGridTheme.good, size: 28),
              const SizedBox(width: 8),
              Expanded(child: Text('${money(r.total)} paid by ${humanize(r.paymentMethod)}. Ticket sent to the kitchen.', style: text.titleMedium)),
            ]),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(r.outletName, textAlign: TextAlign.center, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                if (r.address.isNotEmpty) Text(r.address, textAlign: TextAlign.center),
                if (r.gstin != null) Text('GSTIN ${r.gstin}', textAlign: TextAlign.center),
                if (r.fssai != null) Text('FSSAI ${r.fssai}', textAlign: TextAlign.center),
                Text('${r.orderNumber} · ${dateTime(r.issuedAt)}', textAlign: TextAlign.center, style: text.bodySmall),
                const Divider(height: 24),
                for (final i in r.items) AmountRow('${i.qty} × ${i.name}', amt(i.amount)),
                const Divider(height: 20),
                AmountRow('Subtotal', amt(r.subtotal)),
                if (r.discount > 0) AmountRow('Discount', '-${amt(r.discount)}'),
                if (r.packaging > 0) AmountRow('Packaging', amt(r.packaging)),
                AmountRow('CGST', amt(r.cgst)),
                AmountRow('SGST', amt(r.sgst)),
                if (r.roundOff != 0) AmountRow('Round off', amt(r.roundOff)),
                const Divider(height: 20),
                DefaultTextStyle.merge(
                  style: mono,
                  child: AmountRow('Total (${humanize(r.paymentMethod)})', '₹${amt(r.total)}', bold: true),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('Next bill'),
          ),
        ],
      ),
    );
  }
}
