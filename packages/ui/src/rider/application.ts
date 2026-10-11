/**
 * Form state → POST /riders/onboarding body (delivery-service
 * RiderOnboardingDto) for the rider application. The service validates
 * everything again.
 */

export const VEHICLES: Record<string, string> = {
  BICYCLE: 'Bicycle',
  SCOOTER: 'Scooter',
  MOTORCYCLE: 'Motorcycle',
  EV_SCOOTER: 'Electric scooter',
};

export const DOCUMENTS: Record<string, string> = {
  ID_PROOF: 'ID proof (Aadhaar, PAN or voter ID)',
  DRIVING_LICENSE: 'Driving licence',
};

export interface ApplicationForm {
  name: string;
  city: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
  upiId: string;
}

/** Every vehicle but a bicycle needs a number plate and a driving licence. */
export const motorised = (vehicleType: string) => vehicleType !== 'BICYCLE';

/** Documents to upload: a driving licence only for motorised vehicles. */
export const documentsFor = (vehicleType: string) =>
  motorised(vehicleType) ? ['ID_PROOF', 'DRIVING_LICENSE'] : ['ID_PROOF'];

/** "ka-01 ab 1234" → "KA01AB1234", the form the server checks. */
export const vehicleNumber = (input: string) => input.toUpperCase().replace(/[\s-]/g, '');

/** The server lets a rejected applicant, or one asked for changes, apply again. */
export const canReapply = (p: { status: string; rejectionReason: string | null }) =>
  p.status === 'REJECTED' || (p.status === 'PENDING_APPROVAL' && p.rejectionReason !== null);

/** `documents` maps each kind from {@link documentsFor} to its uploaded URL. */
export function applicationBody(f: ApplicationForm, documents: Record<string, string>) {
  const upiId = f.upiId.trim();
  return {
    name: f.name.trim(),
    city: f.city.trim(),
    vehicleType: f.vehicleType,
    ...(motorised(f.vehicleType)
      ? { vehicleNumber: vehicleNumber(f.vehicleNumber), licenseNumber: f.licenseNumber.trim() }
      : {}),
    ...(upiId ? { upiId } : {}),
    documents: documentsFor(f.vehicleType).map((kind) => ({ kind, url: documents[kind] })),
  };
}
