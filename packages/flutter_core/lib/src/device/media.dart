import '../api/api_client.dart';

/// Upload folders accepted by POST /media/presign.
enum MediaFolder { avatars, menu, outlets, products, kyc, deliveryProof, reviews, banners }

extension on MediaFolder {
  String get wire => this == MediaFolder.deliveryProof ? 'delivery-proof' : name;
}

/// Uploads bytes straight to object storage through a presigned URL and
/// returns the public URL to send back to the API.
Future<String> uploadMedia(ApiClient api, {required MediaFolder folder, required List<int> bytes, required String fileName, required String contentType}) async {
  final p = await api.post<Map<String, dynamic>>('media/presign', body: {'folder': folder.wire, 'contentType': contentType, 'fileName': fileName});
  final headers = {for (final e in ((p['headers'] as Map?) ?? const {}).entries) e.key.toString(): e.value.toString()};
  // the presign response names the exact headers the signature covers
  await api.putBytes(p['uploadUrl'] as String, bytes, headers: headers.isEmpty ? {'content-type': contentType} : headers);
  return p['publicUrl'] as String;
}
