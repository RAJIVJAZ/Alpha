import type { Delivery } from '@foodgrid/database';

/**
 * What a rider may see of a delivery: everything except the customer's
 * hand-over code. The code proves the order reached the customer, so the
 * rider must get it from the customer at the door.
 */
export function riderView<T extends Pick<Delivery, 'deliveryOtp'>>(
  delivery: T,
): Omit<T, 'deliveryOtp'> {
  const { deliveryOtp: _code, ...rest } = delivery;
  return rest;
}
