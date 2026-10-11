import 'package:foodgrid_core/foodgrid_core.dart';

/// Applying needs a phone number: customers and restaurants call riders on it.
const phoneRequiredMessage = 'Sign out and sign in with your mobile number to apply. Customers and restaurants call riders on it.';

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
      'OTP_REQUIRED' => "Enter the 4-digit code from the customer's app. A photo alone can't complete an order.",
      'OTP_LOCKED' => 'Too many wrong codes for this order. Wait 15 minutes, or call support if the customer cannot see their code.',
      'OTP_UNAVAILABLE' => 'This order has no delivery code. Call support to close it.',
      'INVALID_PROOF_PHOTO' => 'The photo did not upload to FoodGrid. Retake it in the app, or remove it and complete with the code.',
      'COD_NOT_COLLECTED' => 'Collect the cash and tick the box before completing this cash-on-delivery order.',
      'PHONE_REQUIRED' => phoneRequiredMessage,
      'INVALID_DOCUMENT' => 'A document photo did not upload to FoodGrid. Retake it and submit again.',
      'PAYOUT_PENDING' => 'You already have a cash-out in progress. You can request another once it is paid.',
      _ => error.message,
    };
  }
  return error.toString();
}
