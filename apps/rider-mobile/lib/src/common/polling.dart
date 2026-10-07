import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Re-runs the calling provider after [every]. Call it at the top of a
/// provider's build: each run schedules the next, and the timer is cancelled
/// when the provider rebuilds or is disposed. Riverpod pauses providers whose
/// screens are off-stage, so hidden tabs stop polling on their own.
void pollEvery(Ref ref, Duration every) {
  final timer = Timer(every, ref.invalidateSelf);
  ref.onDispose(timer.cancel);
}
