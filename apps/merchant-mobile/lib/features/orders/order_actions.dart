import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/permissions.dart';
import '../../core/ui.dart';
import 'order.dart';
import 'orders_board.dart';
import 'orders_repository.dart';

const prepTimes = [10, 15, 20, 30, 45];
const rejectReasons = ['Item out of stock', 'Kitchen too busy', 'Outlet closing soon', 'Unable to deliver to this address'];
const cancelReasons = ['Item ran out after accepting', 'Kitchen equipment issue', 'Customer asked to cancel', 'Outlet closing early'];

/// Default preparation time offered when accepting (web: 15 min dine-in, 20 otherwise).
int defaultPrepTime(MerchantOrder o) => o.type == 'DINE_IN' ? 15 : 20;

/// Runs an order transition, then refreshes the board and tells the user.
///
/// Uses the container and messenger captured up front: the card that
/// started the action usually leaves the lane once the board refreshes.
Future<void> runOrderAction(BuildContext context, MerchantOrder order, Future<String> Function(OrdersRepository repo) action, String done) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final messenger = ScaffoldMessenger.maybeOf(context);
  final status = await action(container.read(ordersRepositoryProvider));
  container.invalidate(orderDetailProvider(order.id));
  await container.read(ordersBoardProvider.notifier).refresh();
  messenger?.showSnackBar(SnackBar(content: Text('${order.orderNumber}: ${status.isEmpty ? done : humanize(status).toLowerCase()}')));
}

/// Asks for a preparation time; returns null when dismissed.
Future<int?> pickPrepTime(BuildContext context, MerchantOrder order) async {
  var prep = defaultPrepTime(order);
  final ok = await confirmSheet(
    context,
    title: 'Accept ${order.orderNumber}',
    message: 'How long will it take to prepare?',
    confirmLabel: 'Accept order',
    body: (context, setState) => ChoiceWrap<int>(
      semanticsLabel: 'Preparation time',
      values: prepTimes,
      selected: prep,
      label: (m) => '$m min',
      onSelected: (m) => setState(() => prep = m),
    ),
  );
  return ok ? prep : null;
}

Future<String?> pickReason(BuildContext context, {required String title, required String message, required String confirmLabel, required List<String> reasons}) async {
  var reason = reasons.first;
  final ok = await confirmSheet(
    context,
    title: title,
    message: message,
    confirmLabel: confirmLabel,
    destructive: true,
    body: (context, setState) => RadioGroup<String>(
      groupValue: reason,
      onChanged: (v) => setState(() => reason = v ?? reason),
      child: Column(children: [for (final r in reasons) RadioListTile<String>(value: r, title: Text(r), contentPadding: EdgeInsets.zero)]),
    ),
  );
  return ok ? reason : null;
}

/// Next-step buttons for an order in its current state (as the web
/// OrderActions), limited to what the signed-in role may do.
class OrderActions extends ConsumerWidget {
  const OrderActions({super.key, required this.order, this.large = false});
  final MerchantOrder order;
  final bool large;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perms = ref.watch(permissionsProvider);
    final manage = perms.can(Perm.ordersManage);
    final kitchen = perms.can(Perm.kdsOperate);
    final o = order;
    final buttons = <Widget>[];
    int? prep; // chosen in the accept sheet
    String? reason; // chosen in the reject sheet

    switch (o.status) {
      case 'PLACED' when manage:
        buttons.addAll([
          ActionButton(
            label: 'Accept',
            icon: Icons.check,
            large: large,
            tooltip: 'Accept ${o.orderNumber} and set a preparation time',
            confirm: () async => (prep = await pickPrepTime(context, o)) != null,
            onPressed: () => runOrderAction(context, o, (r) => r.accept(o.id, prep!), 'accepted'),
          ),
          ActionButton(
            label: 'Reject',
            icon: Icons.close,
            kind: ActionKind.outlined,
            destructive: true,
            large: large,
            tooltip: 'Reject ${o.orderNumber}',
            confirm: () async => (reason = await pickReason(context,
                    title: 'Reject ${o.orderNumber}?', message: 'The customer is refunded automatically and notified.', confirmLabel: 'Reject order', reasons: rejectReasons)) !=
                null,
            onPressed: () => runOrderAction(context, o, (r) => r.reject(o.id, reason!), 'rejected'),
          ),
        ]);
      case 'PLACED':
        buttons.add(const _Note('Waiting for a manager or cashier to accept'));
      case 'ACCEPTED' when kitchen:
        buttons.add(ActionButton(
          label: 'Start preparing',
          icon: Icons.soup_kitchen_outlined,
          kind: ActionKind.tonal,
          large: large,
          onPressed: () => runOrderAction(context, o, (r) => r.preparing(o.id), 'preparing'),
        ));
      case 'PREPARING' when kitchen:
        buttons.add(ActionButton(
          label: 'Mark ready',
          icon: Icons.inventory_2_outlined,
          large: large,
          onPressed: () => runOrderAction(context, o, (r) => r.ready(o.id), 'ready'),
        ));
      case 'READY' when o.isDelivery:
        buttons.add(const _Note('Waiting for rider'));
      case 'READY' when manage:
        buttons.add(ActionButton(
          label: o.type == 'DINE_IN' ? 'Served' : 'Handed over',
          icon: Icons.done_all,
          large: large,
          tooltip: 'Complete ${o.orderNumber}',
          onPressed: () => runOrderAction(context, o, (r) => r.complete(o.id), 'completed'),
        ));
    }
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.end, children: buttons);
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.hourglass_top, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant))),
      ]);
}
