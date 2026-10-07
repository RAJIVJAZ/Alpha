import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';

/// A push from the rider's private Socket.IO room.
class RiderEvent {
  RiderEvent(this.name, this.data);

  /// `offer:new`, `order:ready` or `delivery:cancelled`.
  final String name;
  final Json data;

  String? get orderNumber => strOrNull(data['orderNumber']);
}

const riderEventNames = ['offer:new', 'order:ready', 'delivery:cancelled'];

/// Connects the tracking socket and merges the rider-room events while the
/// signed-in shell listens.
final riderEventsProvider = StreamProvider.autoDispose<RiderEvent>((ref) {
  final socket = ref.watch(trackingSocketProvider);
  final out = StreamController<RiderEvent>();
  final subs = [for (final name in riderEventNames) socket.on(name).listen((data) => out.add(RiderEvent(name, data)))];
  unawaited(socket.connect().catchError((Object _) {}));
  ref.onDispose(() {
    for (final s in subs) {
      s.cancel();
    }
    out.close();
  });
  return out.stream;
});
