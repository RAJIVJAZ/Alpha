import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

/// Bottom-tab destinations; navigating to these switches tabs instead of
/// stacking a page.
const tabRoots = {'/', '/search', '/orders', '/account'};

/// Maps app deep links (`foodgrid://…`, from banners and pushes) to routes.
///
///   foodgrid://offers/WELCOME50    → /cart?coupon=WELCOME50
///   foodgrid://collections/biryani → /search?q=biryani
///   foodgrid://outlets/some-slug   → /outlets/some-slug
String? appRoute(String? url) {
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('/')) return url;
  final m = RegExp(r'^foodgrid://([^/?#]+)/?([^?#]*)').firstMatch(url);
  if (m == null) return null;
  final kind = m.group(1)!;
  final rest = Uri.decodeComponent(m.group(2) ?? '').replaceAll(RegExp(r'/+$'), '');
  switch (kind) {
    case 'offers':
      return rest.isEmpty ? '/cart' : Uri(path: '/cart', queryParameters: {'coupon': rest}).toString();
    case 'outlets' || 'restaurants':
      return rest.isEmpty ? '/' : '/outlets/${Uri.encodeComponent(rest)}';
    case 'collections' || 'search':
      return Uri(path: '/search', queryParameters: {'q': rest.replaceAll('-', ' ')}).toString();
    case 'orders':
      return rest.isEmpty ? '/orders' : '/orders/${Uri.encodeComponent(rest)}';
    case 'membership':
      return '/membership';
    case 'wallet':
      return '/wallet';
    case 'notifications':
      return '/notifications';
    case 'table' || 't':
      return rest.isEmpty ? '/scan' : '/t/${Uri.encodeComponent(rest)}';
    default:
      return '/';
  }
}

/// Opens an app route: tab roots switch tabs, everything else is stacked so
/// back returns here.
void openRoute(BuildContext context, String location) {
  final path = Uri.parse(location).path;
  if (tabRoots.contains(path)) {
    context.go(location);
  } else {
    context.push(location);
  }
}

/// Follows a banner or notification link: app routes in-app, https outside.
Future<void> openLink(BuildContext context, String? url) async {
  final route = appRoute(url);
  if (route != null) return openRoute(context, route);
  if (url != null && url.startsWith('https://')) {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }
}

/// Starts a phone call in the dialler.
Future<void> callPhone(String phone) => launchUrl(Uri(scheme: 'tel', path: phone.replaceAll(' ', '')));
