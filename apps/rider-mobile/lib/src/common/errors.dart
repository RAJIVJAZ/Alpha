import 'package:foodgrid_core/foodgrid_core.dart';

/// Rider-facing wording for the delivery flow's business errors; anything
/// else keeps the server's own message.
String riderMessage(Object error) {
  if (error is ApiException) {
    return switch (error.code) {
      'TOO_FAR_FROM_DROP' =>
        "You're too far from the drop location to complete this order. Move within 500 m of the customer's address and try again.",
      'LOCATION_REQUIRED' =>
        "We can't confirm you're at the drop point. Turn on location for FoodGrid Rider, wait a few seconds for a fix, then try again.",
      'OTP_MISMATCH' => "That code doesn't match. Ask the customer to read out the 4-digit code shown in their app.",
      'PROOF_REQUIRED' => "Enter the customer's 4-digit code or take a photo of the order at the door.",
      'COD_NOT_COLLECTED' => 'Collect the cash and tick the box before completing this cash-on-delivery order.',
      'PAYOUT_PENDING' => 'You already have a cash-out in progress. You can request another once it is paid.',
      _ => error.message,
    };
  }
  return error.toString();
}
