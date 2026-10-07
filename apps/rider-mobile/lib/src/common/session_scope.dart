import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// The signed-in user's id. Repositories watch it, so everything cached for
/// one rider is rebuilt when someone else signs in on the same device.
final riderUserIdProvider = Provider<String?>((ref) => ref.watch(sessionProvider.select((s) => s.value?.claims.sub)));
