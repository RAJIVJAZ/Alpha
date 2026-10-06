import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../api/api_client.dart';
import '../auth/token_store.dart';
import '../config.dart';

/// Live updates from delivery-service (Socket.IO namespace `/tracking` at
/// path `/ws`): `rider:location` and `delivery:status` for an order a
/// customer subscribes to; `offer:new`, `order:ready` and
/// `delivery:cancelled` in a rider's private room.
class TrackingSocket {
  TrackingSocket(this._config, this._tokens, this._api);

  final AppConfig _config;
  final TokenStore _tokens;
  final ApiClient _api;
  io.Socket? _socket;
  final _events = StreamController<(String, Map<String, dynamic>)>.broadcast();
  final Set<String> _orders = {};

  bool get connected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return;
    // make sure the handshake carries a live access token
    await _api.get<dynamic>('auth/me').catchError((_) => null);
    final t = await _tokens.read();
    if (t == null) return;
    final s = io.io(
      '${_config.origin}/tracking',
      io.OptionBuilder().setPath('/ws').setTransports(['websocket']).setAuth({'token': t.accessToken}).enableReconnection().disableAutoConnect().build(),
    );
    for (final name in const ['rider:location', 'delivery:status', 'offer:new', 'order:ready', 'delivery:cancelled']) {
      s.on(name, (data) {
        if (data is Map) _events.add((name, Map<String, dynamic>.from(data)));
      });
    }
    // rejoin order rooms after a reconnect, with a fresh token
    s.onReconnectAttempt((_) async {
      final fresh = await _tokens.read();
      if (fresh != null) s.auth = {'token': fresh.accessToken};
    });
    s.onConnect((_) {
      for (final id in _orders) {
        s.emitWithAck('order:subscribe', {'orderId': id}, ack: (_) {});
      }
    });
    _socket = s..connect();
  }

  /// Stream of one event type, e.g. `on('rider:location')`.
  Stream<Map<String, dynamic>> on(String event) => _events.stream.where((e) => e.$1 == event).map((e) => e.$2);

  Future<void> subscribeOrder(String orderId) async {
    _orders.add(orderId);
    await connect();
    final s = _socket;
    if (s != null && s.connected) s.emitWithAck('order:subscribe', {'orderId': orderId}, ack: (_) {});
  }

  void unsubscribeOrder(String orderId) {
    _orders.remove(orderId);
    _socket?.emit('order:unsubscribe', {'orderId': orderId});
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _events.close();
  }
}
