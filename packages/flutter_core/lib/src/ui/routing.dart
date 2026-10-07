import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

// go_router 18 picks the page type by looking for an ancestor MaterialApp of
// package:material_ui (go_router/lib/src/pages/material.dart), a different
// class from the MaterialApp in package:flutter/material.dart that the apps
// use. The check fails, so `GoRoute(builder: …)` falls back to a
// NoTransitionPage (go_router/lib/src/builder.dart, _cacheAppType): no
// transitions and no iOS back-swipe. Every route is therefore declared with
// [materialRoute], or `pageBuilder:` + [materialPage] for shell routes.

/// A [MaterialPage] for a go_router route.
Page<void> materialPage(GoRouterState state, Widget child) => MaterialPage<void>(
      key: state.pageKey,
      name: state.name ?? state.path,
      arguments: {...state.pathParameters, ...state.uri.queryParameters},
      restorationId: state.pageKey.value,
      child: child,
    );

/// `GoRoute(path:, builder:)` with a [MaterialPage].
GoRoute materialRoute(
  String path,
  Widget Function(BuildContext context, GoRouterState state) builder, {
  GlobalKey<NavigatorState>? parentNavigatorKey,
  List<RouteBase> routes = const [],
}) =>
    GoRoute(path: path, parentNavigatorKey: parentNavigatorKey, routes: routes, pageBuilder: (context, state) => materialPage(state, builder(context, state)));
