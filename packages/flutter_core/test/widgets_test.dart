import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

Widget app(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('ErrorView words failures for people, and copy can be replaced', (tester) async {
    Future<void> show(Object error, {String? title}) => tester.pumpWidget(app(ErrorView(error: error, title: title, onRetry: () {})));

    await show(const ApiException(0, 'NETWORK', 'Check your internet connection and try again.'));
    expect(find.text("You're offline"), findsOneWidget);
    expect(find.byIcon(Icons.wifi_off), findsOneWidget);

    await show(const ApiException(401, 'UNAUTHORIZED', 'jwt expired'));
    expect(find.text('Please sign in again'), findsOneWidget);
    expect(find.text('jwt expired'), findsNothing);

    await show(const ApiException(403, 'PERMISSION_DENIED', "Your role can't manage orders. Ask the business owner for access.", details: ['orders:manage']));
    expect(find.text("You can't open this"), findsOneWidget);
    expect(find.text("Your role can't manage orders. Ask the business owner for access."), findsOneWidget);

    await show(const ApiException(404, 'NOT_FOUND', 'Cannot GET /api/v1/x'));
    expect(find.text('Not found'), findsOneWidget);
    expect(find.text('Cannot GET /api/v1/x'), findsNothing);

    await show(const ApiException(502, null, 'Bad gateway'));
    expect(find.text('Something went wrong on our side'), findsOneWidget);

    await show(const ApiException(409, 'OUTLET_CLOSED', 'The kitchen is closed right now'), title: 'Order not placed');
    expect(find.text('Order not placed'), findsOneWidget);
    expect(find.text('The kitchen is closed right now'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('AsyncView takes an error builder and has a sliver form', (tester) async {
    await tester.pumpWidget(app(AsyncView<int>(value: AsyncError(StateError('x'), StackTrace.empty), data: (n) => Text('$n'), errorBuilder: (e) => const Text('custom'))));
    expect(find.text('custom'), findsOneWidget);

    Future<void> sliver(AsyncValue<int> value) => tester.pumpWidget(app(CustomScrollView(slivers: [
          const SliverToBoxAdapter(child: Text('header')),
          AsyncView<int>.sliver(value: value, data: (n) => SliverList.list(children: [Text('row $n')])),
        ])));
    await sliver(const AsyncData(3));
    expect(find.text('row 3'), findsOneWidget);
    await sliver(const AsyncLoading());
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await sliver(const AsyncError(ApiException(0, 'NETWORK', 'offline'), StackTrace.empty));
    expect(find.text("You're offline"), findsOneWidget);
    expect(find.text('header'), findsOneWidget);
  });

  testWidgets("go_router's builder: falls back to NoTransitionPage under Flutter's MaterialApp; materialRoute does not", (tester) async {
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const Text('home')),
      materialRoute('/next', (_, s) => Text('next ${s.uri.queryParameters['q']}')),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));

    List<Page<Object?>> pages() => tester.widget<Navigator>(find.byType(Navigator).first).pages;
    // if this starts failing, go_router recognises the app again and materialRoute can go
    expect(pages().single, isA<NoTransitionPage<void>>());

    router.go('/next?q=1');
    await tester.pumpAndSettle();
    expect(find.text('next 1'), findsOneWidget);
    expect(pages().single, isA<MaterialPage<void>>());
  });
}
