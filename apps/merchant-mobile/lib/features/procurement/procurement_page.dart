import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/json.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import '../outlets/outlet_providers.dart';
import 'procurement_models.dart';
import 'procurement_providers.dart';

/// Purchase orders awaiting approval, those in progress, and reorder alerts.
class ProcurementPage extends ConsumerWidget {
  const ProcurementPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(procurementDashboardProvider).value;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Purchasing'),
          actions: [
            IconButton(
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh),
              onPressed: () {
                ref.invalidate(procurementDashboardProvider);
                ref.invalidate(purchaseOrdersProvider);
                ref.invalidate(reorderAlertsProvider);
              },
            ),
          ],
          bottom: TabBar(tabs: [
            Tab(child: _TabLabel('Approvals', dash?.pendingApproval)),
            const Tab(text: 'In progress'),
            Tab(child: _TabLabel('Alerts', dash?.totalAlerts)),
          ]),
        ),
        body: Column(children: [
          if (dash != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Row(children: [
                Expanded(child: KpiTile(label: 'Awaiting approval', value: '${dash.pendingApproval}')),
                const SizedBox(width: 8),
                Expanded(child: KpiTile(label: 'Urgent alerts', value: '${dash.urgentAlerts}', hint: '${dash.totalAlerts} open')),
                const SizedBox(width: 8),
                Expanded(child: KpiTile(label: 'Spend this month', value: moneyCompact(dash.monthToDateSpend))),
              ]),
            ),
          const Expanded(child: TabBarView(children: [_PoList(group: PoGroup.approval), _PoList(group: PoGroup.open), _AlertsTab()])),
        ]),
      ),
    );
  }
}

class _TabLabel extends StatelessWidget {
  const _TabLabel(this.label, this.count);
  final String label;
  final int? count;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
        if ((count ?? 0) > 0) ...[const SizedBox(width: 6), CountBadge(count!, highlight: true)],
      ]);
}

class _PoList extends ConsumerWidget {
  const _PoList({required this.group});
  final PoGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(purchaseOrdersProvider(group));
    final outlets = ref.watch(outletControllerProvider).value?.outlets ?? const [];
    String? outletName(String id) => outlets.length > 1 ? outlets.where((o) => o.id == id).map((o) => o.name).firstOrNull : null;
    return AsyncView<List<PurchaseOrder>>(
      value: list,
      onRetry: () => ref.invalidate(purchaseOrdersProvider(group)),
      data: (rows) => RefreshIndicator(
        onRefresh: () => ref.refresh(purchaseOrdersProvider(group).future),
        child: rows.isEmpty
            ? ListView(children: [
                const SizedBox(height: 40),
                EmptyView(
                  icon: Icons.local_shipping_outlined,
                  title: group == PoGroup.approval ? 'Nothing to approve' : 'No open purchase orders',
                  message: group == PoGroup.approval ? 'Purchase orders above your auto-approval limit wait here.' : 'Approved orders appear here until goods are received.',
                ),
              ])
            : ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: rows.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) => PoTile(po: rows[i], outletName: outletName(rows[i].outletId)),
              ),
      ),
    );
  }
}

class PoTile extends StatelessWidget {
  const PoTile({super.key, required this.po, this.outletName});
  final PurchaseOrder po;
  final String? outletName;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/more/purchasing/po/${po.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(po.poNumber, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
              Text(money(po.total), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 2),
            Text([po.supplierName, ?outletName].join(' → '), style: text.bodyMedium),
            Text('${po.items.length} item${po.items.length == 1 ? '' : 's'} · ${po.raisedBy} · ${relative(po.createdAt)}', style: text.bodySmall?.copyWith(color: muted)),
            const SizedBox(height: 8),
            StatusChip(po.status),
          ]),
        ),
      ),
    );
  }
}

class _AlertsTab extends ConsumerStatefulWidget {
  const _AlertsTab();

  @override
  ConsumerState<_AlertsTab> createState() => _AlertsTabState();
}

class _AlertsTabState extends ConsumerState<_AlertsTab> {
  bool _allOutlets = false;

  @override
  Widget build(BuildContext context) {
    final outletId = ref.watch(currentOutletIdProvider);
    final outlets = ref.watch(outletControllerProvider).value?.outlets ?? const [];
    final key = _allOutlets ? null : outletId;
    final alerts = ref.watch(reorderAlertsProvider(key));
    final canManage = ref.watch(permissionsProvider).can(Perm.procurementManage);
    return Column(children: [
      if (outlets.length > 1)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: SegmentedButton<bool>(
            segments: const [ButtonSegment(value: false, label: Text('This outlet')), ButtonSegment(value: true, label: Text('All outlets'))],
            selected: {_allOutlets},
            onSelectionChanged: (s) => setState(() => _allOutlets = s.first),
          ),
        ),
      Expanded(
        child: AsyncView<List<ReorderAlert>>(
          value: alerts,
          onRetry: () => ref.invalidate(reorderAlertsProvider(key)),
          data: (rows) => RefreshIndicator(
            onRefresh: () => ref.refresh(reorderAlertsProvider(key).future),
            child: rows.isEmpty
                ? ListView(children: const [
                    SizedBox(height: 40),
                    EmptyView(icon: Icons.inventory_outlined, title: 'No open reorder alerts', message: 'Stock covers forecast demand.'),
                  ])
                : ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _AlertCard(
                      alert: rows[i],
                      canManage: canManage,
                      outletName: _allOutlets ? outlets.where((o) => o.id == rows[i].outletId).map((o) => o.name).firstOrNull : null,
                      onChanged: () {
                        ref.invalidate(reorderAlertsProvider);
                        ref.invalidate(procurementDashboardProvider);
                        ref.invalidate(purchaseOrdersProvider);
                      },
                    ),
                  ),
          ),
        ),
      ),
    ]);
  }
}

class _AlertCard extends ConsumerWidget {
  const _AlertCard({required this.alert, required this.canManage, required this.onChanged, this.outletName});
  final ReorderAlert alert;
  final bool canManage;
  final String? outletName;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = alert;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(a.ingredientName, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
            StatusChip(a.severity, label: humanize(a.severity)),
          ]),
          Text([humanize(a.category), ?outletName].join(' · '), style: text.bodySmall?.copyWith(color: muted)),
          const SizedBox(height: 8),
          AmountRow('In stock', qty(a.currentStock, a.unit)),
          AmountRow('Daily use', qty(a.avgDailyUsage, a.unit)),
          AmountRow('Days of cover', a.daysOfCover.toStringAsFixed(1)),
          if (a.predictedDepletionDate != null) AmountRow('Runs out', dateTime(a.predictedDepletionDate)),
          AmountRow('Suggested order', qty(a.suggestedQty, a.unit), bold: true),
          if (canManage) ...[
            const SizedBox(height: 8),
            Wrap(alignment: WrapAlignment.end, spacing: 8, children: [
              ActionButton(
                label: 'Dismiss',
                kind: ActionKind.text,
                tooltip: 'Dismiss the alert for ${a.ingredientName}',
                onPressed: () async {
                  await ref.read(procurementRepositoryProvider).dismissAlert(a.id);
                  if (context.mounted) showMessage(context, 'Alert dismissed');
                  onChanged();
                },
              ),
              if (a.purchaseOrderId == null)
                ActionButton(
                  label: 'Raise PO',
                  icon: Icons.add_shopping_cart,
                  tooltip: 'Order ${a.ingredientName} from the best supplier',
                  onPressed: () async {
                    final r = await ref.read(procurementRepositoryProvider).autoPo([a.id]);
                    if (context.mounted) {
                      // not awaited: the button stops spinning while the result shows
                      showDialog<void>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: Text(r.created.isEmpty ? 'No purchase order created' : 'Purchase order created'),
                          content: Text([
                            ...r.created,
                            ...r.skipped.map((s) => 'Skipped $s'),
                            if (r.created.isNotEmpty) 'Orders above your auto-approval limit wait for the owner.',
                          ].join('\n')),
                          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
                        ),
                      );
                    }
                    onChanged();
                  },
                )
              else
                const StatusChip('PO_RAISED', label: 'PO raised', tone: Tone.info),
            ]),
          ],
        ]),
      ),
    );
  }
}

