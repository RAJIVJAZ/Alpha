import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Gets attention in a noisy kitchen when an order arrives.
abstract class OrderAlerter {
  Future<void> newOrders(int count);
}

/// Chime (bundled asset, notification channel) plus a haptic buzz; falls
/// back to the platform alert sound if audio can't play.
class SoundOrderAlerter implements OrderAlerter {
  AudioPlayer? _player;

  @override
  Future<void> newOrders(int count) async {
    await HapticFeedback.heavyImpact();
    try {
      final player = _player ??= AudioPlayer()
        ..setReleaseMode(ReleaseMode.stop)
        ..setAudioContext(AudioContext(
          android: const AudioContextAndroid(
            usageType: AndroidUsageType.notification,
            contentType: AndroidContentType.sonification,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
          iOS: AudioContextIOS(category: AVAudioSessionCategory.playback, options: const {AVAudioSessionOptions.duckOthers}),
        ));
      await player.play(AssetSource('sounds/new_order.wav'), volume: 1);
    } catch (_) {
      await SystemSound.play(SystemSoundType.alert);
    }
    await Future<void>.delayed(const Duration(milliseconds: 350));
    await HapticFeedback.heavyImpact();
  }
}

final orderAlerterProvider = Provider<OrderAlerter>((ref) => SoundOrderAlerter());
