import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/addresses.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/local_store.dart';

/// Where the customer is ordering to: a saved address, the device location or
/// a popular area.
class Place {
  const Place({required this.lat, required this.lng, required this.label, this.addressId});

  final double lat;
  final double lng;
  final String label;
  final String? addressId;

  factory Place.fromAddress(Address a) => Place(lat: a.lat, lng: a.lng, label: '${a.label} · ${a.line1}', addressId: a.id);

  factory Place.fromJson(Json j) => Place(lat: toNum(j['lat']), lng: toNum(j['lng']), label: str(j['label'], 'Selected location'), addressId: optStr(j['addressId']));

  Json toJson() => {'lat': lat, 'lng': lng, 'label': label, 'addressId': ?addressId};

  /// Short name for headers ("Koramangala", "Home").
  String get shortLabel => label.split(RegExp(r'[,·]')).first.trim();

  @override
  bool operator ==(Object other) => other is Place && other.lat == lat && other.lng == lng && other.label == label && other.addressId == addressId;

  @override
  int get hashCode => Object.hash(lat, lng, label, addressId);
}

/// Popular Bengaluru delivery areas (area centres) for choosing without GPS or a saved address.
const areas = [
  Place(label: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245),
  Place(label: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408),
  Place(label: 'HSR Layout, Bengaluru', lat: 12.9116, lng: 77.6474),
  Place(label: 'BTM Layout, Bengaluru', lat: 12.9166, lng: 77.6101),
  Place(label: 'Jayanagar, Bengaluru', lat: 12.925, lng: 77.5938),
  Place(label: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.605),
  Place(label: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.75),
];

const defaultPlace = Place(label: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245);

const _placeKey = 'fg.place';

/// The chosen place, persisted on the device. Until the customer picks one,
/// signed-in customers start from their default address.
class PlaceController extends Notifier<Place> {
  bool _chosen = false;

  @override
  Place build() {
    _restore();
    return defaultPlace;
  }

  Future<void> _restore() async {
    final saved = await ref.read(localStoreProvider).read(_placeKey);
    if (!ref.mounted || _chosen) return;
    if (saved != null) {
      try {
        state = Place.fromJson(asJson(jsonDecode(saved)));
        _chosen = true;
        return;
      } catch (_) {
        // corrupt entry: fall through to the default
      }
    }
    try {
      final session = await ref.read(sessionProvider.future);
      if (session == null || !ref.mounted || _chosen) return;
      final list = await ref.read(addressesProvider.future);
      if (!ref.mounted || _chosen || list.isEmpty) return;
      state = Place.fromAddress(list.firstWhere((a) => a.isDefault, orElse: () => list.first));
    } catch (_) {
      // offline or signed out: keep the default area
    }
  }

  void choose(Place place) {
    _chosen = true;
    state = place;
    ref.read(localStoreProvider).write(_placeKey, jsonEncode(place.toJson()));
  }
}

final placeProvider = NotifierProvider<PlaceController, Place>(PlaceController.new);
