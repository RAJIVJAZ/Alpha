import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/errors.dart';
import '../../core/json.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import '../inventory/inventory_providers.dart';
import '../outlets/outlet_providers.dart';
import 'procurement_models.dart';
import 'procurement_providers.dart';

/// One purchase order: owner approval, cancellation, goods receipt.
class PoDetailPage extends ConsumerWidget {
  const PoDetailPage({super.key, required this.poId});
  final String poId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final po = ref.watch(purchaseOrderProvider(poId));
    return Scaffold(
      appBar: AppBar(title: Text(po.value?.poNumber ?? 'Purchase order')),
      body: AsyncView<PurchaseOrder>(
        value: po,
        onRetry: () => ref.invalidate(purchaseOrderProvider(poId)),
        data: (p) => RefreshIndicator(onRefresh: () => ref.refresh(purchaseOrderProvider(poId).future), child: _PoBody(po: p)),
      ),
    );
  }
}

class _PoBody extends ConsumerWidget {
  const _PoBody({required this.po});
  final PurchaseOrder po;

  void _changed(WidgetRef ref) {
    ref.invalidate(purchaseOrderProvider(po.id));
    ref.invalidate(purchaseOrdersProvider);
    ref.invalidate(procurementDashboardProvider);
  }

  /// Confirmation sheet with an optional comment; null when dismissed.
  Future<String?> _ask(BuildContext context, String decision) async {
    // no controller to dispose: the sheet's field lives on through its closing animation
    var comment = '';
    final (title, message, label) = switch (decision) {
      'approve' => ('Approve ${po.poNumber}?', '${money(po.total)} will be sent to ${po.supplierName} for confirmation.', 'Approve & send'),
      'reject' => ('Reject ${po.poNumber}?', 'The order goes back to draft for changes.', 'Reject'),
      _ => ('Cancel ${po.poNumber}?', 'The supplier is notified if they already have it.', 'Cancel PO'),
    };
    final ok = await confirmSheet(
      context,
      title: title,
      message: message,
      confirmLabel: label,
      destructive: decision != 'approve',
      body: (_, _) => TextField(maxLines: 2, decoration: const InputDecoration(labelText: 'Comment (optional)'), onChanged: (v) => comment = v),
    );
    return ok ? comment.trim() : null;
  }

  /// POST procurement/purchase-orders/{id}/{approve|reject|cancel} {comment?}.
  Future<void> _decide(BuildContext context, WidgetRef ref, String decision, String comment) async {
    final repo = ref.read(procurementRepositoryProvider);
    final messenger = ScaffoldMessenger.maybeOf(context);
    final c = comment.isEmpty ? null : comment;
    final updated = await switch (decision) {
      'approve' => repo.approve(po.id, comment: c),
      'reject' => repo.reject(po.id, comment: c),
      _ => repo.cancel(po.id, comment: c),
    };
    final status = updated.status.isEmpty ? decision : updated.status;
    messenger?.showSnackBar(SnackBar(content: Text('${po.poNumber}: ${humanize(status).toLowerCase()}')));
    _changed(ref);
  }

  /// A decision button: the sheet first, then the call with its comment.
  Widget _decisionButton(BuildContext context, WidgetRef ref, String decision, String label, {IconData? icon, ActionKind kind = ActionKind.filled, bool destructive = false, bool large = false}) {
    String? comment;
    return ActionButton(
      label: label,
      icon: icon,
      kind: kind,
      destructive: destructive,
      large: large,
      confirm: () async => (comment = await _ask(context, decision)) != null,
      onPressed: () => _decide(context, ref, decision, comment ?? ''),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = po;
    final perms = ref.watch(permissionsProvider);
    final outlets = ref.watch(outletControllerProvider).value?.outlets ?? const [];
    final outlet = outlets.where((o) => o.id == p.outletId).map((o) => o.name).firstOrNull;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final t = p.tracking;

    final actions = <Widget>[
      if (p.status == 'DRAFT' && perms.can(Perm.procurementManage))
        ActionButton(
          label: 'Submit',
          icon: Icons.send,
          onPressed: () async {
            await ref.read(procurementRepositoryProvider).submit(p.id);
            _changed(ref);
          },
        ),
      if (p.status == 'PENDING_APPROVAL' && perms.can(Perm.procurementApprove)) ...[
        _decisionButton(context, ref, 'approve', 'Approve & send', icon: Icons.check_circle_outline, large: true),
        _decisionButton(context, ref, 'reject', 'Reject', icon: Icons.cancel_outlined, kind: ActionKind.outlined, destructive: true, large: true),
      ],
      if (receivableStatuses.contains(p.status) && perms.can(Perm.inventoryManage))
        ActionButton(
          label: 'Receive goods',
          icon: Icons.move_to_inbox_outlined,
          onPressed: () async {
            final done = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _ReceiveSheet(po: p));
            if (done == true) {
              _changed(ref);
              ref.invalidate(inventorySummaryProvider);
              ref.invalidate(ingredientsProvider);
            }
          },
        ),
      if (cancellableStatuses.contains(p.status) && perms.can(Perm.procurementManage))
        _decisionButton(context, ref, 'cancel', 'Cancel PO', kind: ActionKind.text, destructive: true),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          StatusChip(p.status),
          Text(p.raisedBy, style: text.bodyMedium?.copyWith(color: muted)),
        ]),
        const SizedBox(height: 8),
        Text([p.supplierName, ?outlet].join(' → '), style: text.titleMedium),
        Text(
          [if (p.paymentTerms.isNotEmpty) humanize(p.paymentTerms), 'raised ${dateTime(p.createdAt)}', if (p.expectedDeliveryAt != null) 'expected ${dateTime(p.expectedDeliveryAt)}'].join(' · '),
          style: text.bodyMedium?.copyWith(color: muted),
        ),
        const SizedBox(height: 12),
        if (actions.isNotEmpty) Wrap(spacing: 8, runSpacing: 8, children: actions),
        if (p.status == 'PENDING_APPROVAL' && !perms.can(Perm.procurementApprove))
          const Padding(padding: EdgeInsets.only(top: 8), child: PermissionNote('Only the owner can approve purchase orders.')),
        if (t['vehicleNumber'] != null || t['driverName'] != null || t['eta'] != null)
          Card(
            margin: const EdgeInsets.only(top: 12),
            child: ListTile(
              leading: const Icon(Icons.local_shipping_outlined),
              title: const Text('Delivery tracking'),
              subtitle: Text([
                if (t['vehicleNumber'] != null) 'Vehicle ${t['vehicleNumber']}',
                if (t['driverName'] != null) 'Driver ${t['driverName']}${t['driverPhone'] != null ? ' (${t['driverPhone']})' : ''}',
                if (t['eta'] != null) 'ETA ${dateTime(t['eta'])}',
              ].join('\n')),
            ),
          ),
        SectionHeader('Items', count: p.items.length, padding: const EdgeInsets.fromLTRB(0, 20, 0, 6)),
        Card(
          child: Column(children: [
            for (final (index, i) in p.items.indexed) ...[
              if (index > 0) const Divider(height: 1),
              ListTile(
                title: Text(i.name),
                subtitle: Text(
                  '${_n(i.quantity)} × ${i.unit.toLowerCase()} at ${money(i.unitPrice)} · GST ${_n(i.gstRate)}%'
                  '${i.confirmedQty != null ? '\nConfirmed ${_n(i.confirmedQty!)}' : ''}'
                  '${i.receivedQty > 0 ? ' · received ${_n(i.receivedQty)}' : ''}',
                ),
                trailing: Text(money(i.lineTotal)),
              ),
            ],
          ]),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              AmountRow('Subtotal', money(p.subtotal)),
              AmountRow('GST', money(p.taxTotal)),
              AmountRow('Delivery', money(p.deliveryCharge)),
              const Divider(),
              AmountRow('Total', money(p.total), bold: true),
            ]),
          ),
        ),
        if (p.notes != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text('Note: ${p.notes}')),
        if (p.supplierNotes != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Supplier: ${p.supplierNotes}')),
        if (p.events.isNotEmpty) ...[
          const SectionHeader('Timeline', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
          for (final e in p.events)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.circle, size: 10),
              title: Text(humanize(e.status)),
              subtitle: Text([dateTime(e.at), ?e.note].join(' · ')),
            ),
        ],
        if (p.approvals.isNotEmpty) ...[
          const SectionHeader('Approvals', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
          for (final a in p.approvals)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: StatusChip(a.decision),
              title: Text(dateTime(a.at)),
              subtitle: a.comment == null ? null : Text(a.comment!),
            ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

String _n(double v) => qty(v, null);

/// Packs received in good condition per line; anything short stays open.
class _ReceiveSheet extends ConsumerStatefulWidget {
  const _ReceiveSheet({required this.po});
  final PurchaseOrder po;

  @override
  ConsumerState<_ReceiveSheet> createState() => _ReceiveSheetState();
}

class _ReceiveSheetState extends ConsumerState<_ReceiveSheet> {
  late final Map<String, TextEditingController> _qty = {for (final i in widget.po.items) i.id: TextEditingController(text: _n(i.outstanding))};
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    for (final c in _qty.values) {
      c.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final updated = await ref.read(procurementRepositoryProvider).receive(
            widget.po.id,
            {for (final e in _qty.entries) e.key: double.tryParse(e.value.text.trim()) ?? 0},
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
      if (!mounted) return;
      showMessage(context, '${widget.po.poNumber}: ${humanize(updated.status).toLowerCase()} · stock updated');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Receive ${widget.po.poNumber}', style: Theme.of(context).textTheme.titleLarge),
            const Text('Enter packs received in good condition. Anything short stays open on the PO.'),
            const SizedBox(height: 12),
            for (final i in widget.po.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TextField(
                  controller: _qty[i.id],
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  decoration: InputDecoration(labelText: '${i.name} (${_n(i.outstanding)} ${i.unit.toLowerCase()} outstanding)'),
                ),
              ),
            TextField(controller: _note, decoration: const InputDecoration(labelText: 'Note', hintText: 'e.g. 1 bag torn, returned')),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.move_to_inbox_outlined),
              label: const Text('Record receipt'),
            ),
          ]),
        ),
      );
}
