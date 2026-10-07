import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/device.dart';
import '../profile/profile.dart';
import 'duty_repository.dart';

class TrackerState {
  const TrackerState({this.lastFix, this.fixAt, this.sentAt, this.error});

  /// The latest position from the stream or a one-off lookup.
  final Fix? lastFix;
  final DateTime? fixAt;

  /// When the server last received this rider's position.
  final DateTime? sentAt;

  /// Why location is unavailable (permission, services off), if it is.
  final String? error;

  TrackerState copyWith({Fix? lastFix, DateTime? fixAt, DateTime? sentAt, String? error, bool clearError = false}) => TrackerState(
        lastFix: lastFix ?? this.lastFix,
        fixAt: fixAt ?? this.fixAt,
        sentAt: sentAt ?? this.sentAt,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Shares the rider's position while online: streams fixes, posts at most one
/// every [minInterval], and re-sends the last fix as a heartbeat when the rider
/// is standing still so dispatch keeps seeing them. Before geofenced steps
/// [pingNow] sends a fresh fix. Auto-disposed: when the signed-in shell goes
/// away (sign-out), the stream and heartbeat stop with it.
final locationTrackerProvider = NotifierProvider.autoDispose<LocationTracker, TrackerState>(LocationTracker.new);

class LocationTracker extends Notifier<TrackerState> {
  static const minInterval = Duration(seconds: 20);
  static const heartbeat = Duration(seconds: 60);

  /// How long a streamed fix still counts as "where the rider is".
  static const fallbackMaxAge = Duration(seconds: 60);

  /// How long to wait for a one-off fix before a geofenced step.
  static const freshFixTimeout = Duration(seconds: 6);

  StreamSubscription<Fix>? _sub;
  Timer? _heartbeat;
  bool _sending = false;

  @override
  TrackerState build() {
    ref.onDispose(_stop);
    ref.listen<bool>(isOnlineProvider, (_, online) => online ? _start() : _stop(), fireImmediately: true);
    return const TrackerState();
  }

  LocationService get _location => ref.read(locationServiceProvider);

  void _start() {
    if (_sub != null) return;
    _sub = _location.watch().listen(
      (fix) {
        _remember(fix);
        final sent = state.sentAt;
        if (sent == null || DateTime.now().difference(sent) >= minInterval) unawaited(_send(fix));
      },
      onError: (Object e) => state = state.copyWith(error: e.toString()),
    );
    _heartbeat = Timer.periodic(minInterval, (_) {
      final fix = state.lastFix;
      final sent = state.sentAt;
      if (fix != null && (sent == null || DateTime.now().difference(sent) >= heartbeat)) unawaited(_send(fix));
    });
  }

  void _stop() {
    _sub?.cancel();
    _sub = null;
    _heartbeat?.cancel();
    _heartbeat = null;
  }

  void _remember(Fix fix) => state = state.copyWith(lastFix: fix, fixAt: DateTime.now(), clearError: true);

  Future<void> _send(Fix fix) async {
    if (_sending || !ref.mounted) return;
    _sending = true;
    try {
      await ref.read(dutyRepositoryProvider).ping(fix);
      if (ref.mounted) state = state.copyWith(sentAt: DateTime.now());
    } catch (_) {
      // a missed ping is harmless; the next fix or heartbeat retries
    } finally {
      _sending = false;
    }
  }

  /// A one-off position (going online). Throws [LocationUnavailable] with a
  /// message the rider can act on.
  Future<Fix> locate() async {
    try {
      final fix = await _location.current();
      if (ref.mounted) _remember(fix);
      return fix;
    } on LocationUnavailable catch (e) {
      if (ref.mounted) state = state.copyWith(error: e.message);
      rethrow;
    } on TimeoutException {
      throw const LocationUnavailable("Couldn't get a GPS fix. Move to an open area and try again.");
    }
  }

  /// Best-effort fresh position before a geofenced step: a new fix with a short
  /// timeout, else the last streamed fix if it is under a minute old. Never
  /// throws; the server decides with whatever position it has.
  Future<void> pingNow() async {
    final repo = ref.read(dutyRepositoryProvider);
    Fix? fix;
    try {
      fix = await _location.current().timeout(freshFixTimeout);
      if (ref.mounted) _remember(fix);
    } catch (_) {
      if (!ref.mounted) return;
      final at = state.fixAt;
      if (state.lastFix != null && at != null && DateTime.now().difference(at) < fallbackMaxAge) fix = state.lastFix;
    }
    if (fix == null) return;
    try {
      await repo.ping(fix);
      if (ref.mounted) state = state.copyWith(sentAt: DateTime.now());
    } catch (_) {
      // the step itself reports any problem
    }
  }
}
