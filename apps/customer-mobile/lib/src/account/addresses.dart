import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/models.dart';
import '../common/json.dart';

/// Saved delivery addresses of the signed-in customer (empty when signed out).
final addressesProvider = FutureProvider<List<Address>>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  if (session == null) return const [];
  final list = await ref.watch(apiClientProvider).get<List<dynamic>>('users/me/addresses');
  return listOf(list, Address.fromJson);
});

/// The editable fields of an address.
class AddressInput {
  const AddressInput({
    required this.label,
    required this.line1,
    required this.city,
    required this.state,
    required this.pincode,
    required this.lat,
    required this.lng,
    this.contactName,
    this.contactPhone,
    this.line2,
    this.landmark,
  });

  final String label;
  final String? contactName;
  final String? contactPhone;
  final String line1;
  final String? line2;
  final String? landmark;
  final String city;
  final String state;
  final String pincode;
  final double lat;
  final double lng;

  Json toJson() => {
        'label': label,
        'contactName': ?contactName,
        'contactPhone': ?contactPhone,
        'line1': line1,
        'line2': ?line2,
        'landmark': ?landmark,
        'city': city,
        'state': state,
        'pincode': pincode,
        'lat': lat,
        'lng': lng,
      };
}

class AddressesRepository {
  AddressesRepository(this._ref);
  final Ref _ref;

  ApiClient get _api => _ref.read(apiClientProvider);

  Future<Address> create(AddressInput input) async {
    final a = Address.fromJson(asJson(await _api.post<dynamic>('users/me/addresses', body: input.toJson())));
    _ref.invalidate(addressesProvider);
    return a;
  }

  Future<Address> update(String id, AddressInput input) async {
    final a = Address.fromJson(asJson(await _api.patch<dynamic>('users/me/addresses/$id', body: input.toJson())));
    _ref.invalidate(addressesProvider);
    return a;
  }

  Future<void> makeDefault(String id) async {
    await _api.patch<dynamic>('users/me/addresses/$id', body: {'isDefault': true});
    _ref.invalidate(addressesProvider);
  }

  Future<void> delete(String id) async {
    await _api.delete<dynamic>('users/me/addresses/$id');
    _ref.invalidate(addressesProvider);
  }
}

final addressesRepositoryProvider = Provider<AddressesRepository>(AddressesRepository.new);
