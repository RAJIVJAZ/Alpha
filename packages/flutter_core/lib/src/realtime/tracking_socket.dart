import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

/// The wire under [TrackingSocket]: Socket.IO in the apps
/// ([IoSocketTransport]), [FakeSocketTransport] in tests.
abstract class SocketTransport {
  bool get connected;

  /// Connects with the token from [token] (asked again before each reconnect
  /// attempt), passes the named [events] to [onEvent] and calls [onConnect]
  /// after every (re)connect. Returns false when there is no token.
  Future<bool> open({
    required Future<String?> Function() token,
    required List<String> events,
    required void Function(String event, Map<String, dynamic> data) onEvent,
    required void Function() onConnect,
  });

  void emit(String event, Map<String, dynamic> data);

  /// Disconnects; [open] may be called again.
  void close();
}

/// delivery-service's Socket.IO namespace `/tracking` at path `/ws`.
class IoSocketTransport implements SocketTransport {
  IoSocketTransport(this._origin);

  final String _origin;
  io.Socket? _socket;

  @override
  bool get connected => _socket?.connected ?? false;

  @override
  Future<bool> open({
    required Future<String?> Function() token,
    required List<String> events,
    required void Function(String event, Map<String, dynamic> data) onEvent,
    required void Function() onConnect,
  }) async {
    final t = await token();
    if (t == null) return false;
    close();
    // forceNew: a socket opened after close() must not reuse the closed manager
    final s = io.io(
      '$_origin/tracking',
      io.OptionBuilder().setPath('/ws').setTransports(['websocket']).setAuth({'token': t}).enableReconnection().enableForceNew().disableAutoConnect().build(),
    );
    for (final name in events) {
      s.on(name, (data) {
        if (data is Map) onEvent(name, Map<String, dynamic>.from(data));
      });
    }
    s.onReconnectAttempt((_) async {
      final fresh = await token();
      if (fresh != null) s.auth = {'token': fresh};
    });
    s.onConnect((_) => onConnect());
    _socket = s..connect();
    return true;
  }

  @override
  void emit(String event, Map<String, dynamic> data) => _socket?.emit(event, data);

  @override
  void close() {
    _socket?.dispose();
    _socket = null;
  }
}

/// Live updates from delivery-service: `rider:location` and `delivery:status`
/// for orders a customer watches ([subscribeOrder]); `order:new` and
/// `order:status` for outlets a merchant watches ([subscribeOutlet]);
/// `offer:new`, `order:ready` and `delivery:cancelled` in a rider's room;
/// `error` (e.g. `{code: FORBIDDEN}`) when a subscription is refused.
///
/// Subscriptions are sent again after every reconnect. [disconnect] (on
/// sign-out) forgets them, and the next use connects with the new token.
class TrackingSocket {
  TrackingSocket(this._transport, this._token);

  static const events = ['rider:location', 'delivery:status', 'order:new', 'order:status', 'offer:new', 'order:ready', 'delivery:cancelled', 'error'];

  final SocketTransport _transport;
  final Future<String?> Function() _token;
  // sync: the per-order filter must see the rooms as they were when the event arrived
  final _events = StreamController<(String, Map<String, dynamic>)>.broadcast(sync: true);
  final Set<String> _orders = {};
  final Set<String> _outlets = {};
  bool _open = false;

  bool get connected => _transport.connected;

  /// Connects once; a no-op while signed out (the next call tries again).
  Future<void> connect() async {
    if (_open) return;
    _open = true;
    try {
      _open = await _transport.open(token: _token, events: events, onEvent: _receive, onConnect: _resubscribe);
    } catch (_) {
      _open = false;
      rethrow;
    }
  }

  void _receive(String event, Map<String, dynamic> data) {
    if (!_events.isClosed) _events.add((event, data));
  }

  void _resubscribe() {
    for (final id in _orders) {
      _transport.emit('order:subscribe', {'orderId': id});
    }
    for (final id in _outlets) {
      _transport.emit('outlet:subscribe', {'outletId': id});
    }
  }

  /// Stream of one event type, e.g. `on('offer:new')`.
  Stream<Map<String, dynamic>> on(String event) => _events.stream.where((e) => e.$1 == event).map((e) => e.$2);

  /// [event] for one watched order. Events without an `orderId` (older
  /// servers) count only while that order is the only one watched.
  Stream<Map<String, dynamic>> onOrder(String event, String orderId) => on(event).where((e) {
        final id = e['orderId'];
        return id == null ? _orders.length == 1 && _orders.contains(orderId) : id == orderId;
      });

  /// [event] (`order:new`, `order:status`) for one watched outlet.
  Stream<Map<String, dynamic>> onOutlet(String event, String outletId) => on(event).where((e) => e['outletId'] == outletId);

  Future<void> subscribeOrder(String orderId) => _subscribe(_orders, orderId, 'order:subscribe', {'orderId': orderId});

  void unsubscribeOrder(String orderId) => _unsubscribe(_orders, orderId, 'order:unsubscribe', {'orderId': orderId});

  /// Live orders of an outlet (staff with orders:read).
  Future<void> subscribeOutlet(String outletId) => _subscribe(_outlets, outletId, 'outlet:subscribe', {'outletId': outletId});

  void unsubscribeOutlet(String outletId) => _unsubscribe(_outlets, outletId, 'outlet:unsubscribe', {'outletId': outletId});

  Future<void> _subscribe(Set<String> rooms, String id, String event, Map<String, dynamic> data) async {
    if (!rooms.add(id)) return;
    if (_transport.connected) return _transport.emit(event, data);
    await connect(); // the connect handler sends every room

  }

  void _unsubscribe(Set<String> rooms, String id, String event, Map<String, dynamic> data) {
    if (rooms.remove(id) && _transport.connected) _transport.emit(event, data);
  }

  /// Closes the connection and forgets every subscription (sign-out).
  void disconnect() {
    _orders.clear();
    _outlets.clear();
    _open = false;
    _transport.close();
  }

  void dispose() {
    disconnect();
    _events.close();
  }
}

/// A [SocketTransport] for tests: records what the app sends and lets the
/// test play the server.
class FakeSocketTransport implements SocketTransport {
  /// Messages the app sent, in order: `('order:subscribe', {orderId: …})`.
  final sent = <(String, Map<String, dynamic>)>[];

  /// The token of the last [open].
  String? token;
  bool _connected = false;
  void Function(String, Map<String, dynamic>)? _onEvent;
  void Function()? _onConnect;

  @override
  bool get connected => _connected;

  @override
  Future<bool> open({
    required Future<String?> Function() token,
    required List<String> events,
    required void Function(String event, Map<String, dynamic> data) onEvent,
    required void Function() onConnect,
  }) async {
    this.token = await token();
    if (this.token == null) return false;
    _onEvent = onEvent;
    _onConnect = onConnect;
    _connected = true;
    onConnect();
    return true;
  }

  @override
  void emit(String event, Map<String, dynamic> data) => sent.add((event, data));

  @override
  void close() {
    _onEvent = null;
    _onConnect = null;
    _connected = false;
  }

  /// The server sends [event] (ignored while closed).
  void receive(String event, Map<String, dynamic> data) => _onEvent?.call(event, data);

  /// The connection drops and comes back.
  void reconnect() => _onConnect?.call();

  /// What the app sent as [event].
  List<Map<String, dynamic>> sentAs(String event) => [for (final (e, d) in sent) if (e == event) d];
}
