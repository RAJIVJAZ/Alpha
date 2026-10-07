import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import 'models.dart';

/// Bill lines. When delivery is free but the quote names a fee, the waived
/// fee is shown struck through with "FREE".
class Bill extends StatelessWidget {
  const Bill({super.key, required this.pricing, required this.delivery, this.member = false, this.waivedDeliveryFee});

  final Pricing pricing;
  final bool delivery;
  final bool member;
  final double? waivedDeliveryFee;

  @override
  Widget build(BuildContext context) {
    final p = pricing;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    const saving = TextStyle(color: FoodGridTheme.goodText, fontWeight: FontWeight.w600);
    final waived = waivedDeliveryFee ?? 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      KeyValueRow('Item total', money(p.subtotal)),
      if (p.couponDiscount > 0) KeyValueRow('Coupon discount', money(-p.couponDiscount), valueStyle: saving),
      if (p.membershipDiscount > 0) KeyValueRow(member ? 'FoodGrid One discount' : 'Membership discount', money(-p.membershipDiscount), valueStyle: saving),
      if (delivery)
        if (p.deliveryFee == 0 && waived > 0)
          Semantics(
            label: 'Delivery fee ${money(waived)} waived, free',
            excludeSemantics: true,
            child: Padding(
              key: const Key('delivery-fee-waived'),
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Expanded(child: Text('Delivery fee', style: text.bodyMedium?.copyWith(color: muted))),
                Text(money(waived), style: text.bodyMedium?.copyWith(color: muted, decoration: TextDecoration.lineThrough)),
                const SizedBox(width: 6),
                Text('FREE', style: text.bodyMedium?.merge(saving)),
              ]),
            ),
          )
        else
          KeyValueRow(p.deliveryFee > 0 ? 'Delivery fee' : 'Delivery fee (free)', money(p.deliveryFee)),
      if (p.packagingCharge > 0) KeyValueRow('Packaging', money(p.packagingCharge)),
      if (p.platformFee > 0) KeyValueRow('Platform fee', money(p.platformFee)),
      if (p.igst > 0) KeyValueRow('IGST', money(p.igst)) else if (p.taxTotal > 0) KeyValueRow('GST (CGST + SGST)', money(p.cgst + p.sgst)),
      if (p.tip > 0) KeyValueRow('Rider tip', money(p.tip)),
      if (p.roundOff != 0) KeyValueRow('Round off', money(p.roundOff)),
      const Divider(),
      KeyValueRow('To pay', money(p.total), strong: true),
      if (p.savings > 0)
        Padding(padding: const EdgeInsets.only(top: 8), child: Notice('You save ${money(p.savings)} on this order', tone: NoticeTone.good)),
      for (final m in p.messages) Padding(padding: const EdgeInsets.only(top: 6), child: Text(m, style: text.bodySmall?.copyWith(color: muted))),
    ]);
  }
}
