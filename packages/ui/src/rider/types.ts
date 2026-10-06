/** Response shapes for the rider app (decimals arrive as strings). */
export type Dec = string;

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  city: string;
  status: string;
  vehicleType: string;
  vehicleNumber: string | null;
  rating: number;
  ratingCount: number;
  isOnline: boolean;
  isOnDelivery: boolean;
  acceptanceRate: number;
  totalDeliveries: number;
  upiId: string | null;
  bankAccount: { holder?: string; ifsc?: string; last4?: string } | null;
}

export interface Offer {
  id: string;
  deliveryId: string;
  distanceToPickupKm: number;
  estimatedEarning: Dec;
  expiresAt: string;
  delivery: {
    id: string;
    orderNumber: string;
    pickupName: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropAddress: string;
    dropLat: number;
    dropLng: number;
    distanceKm: number;
    isCod: boolean;
    codAmount: Dec;
  };
}

export interface Delivery {
  id: string;
  orderId: string;
  orderNumber: string;
  status:
    | 'ASSIGNED'
    | 'AT_PICKUP'
    | 'PICKED_UP'
    | 'AT_DROP'
    | 'DELIVERED'
    | 'FAILED'
    | 'CANCELLED'
    | string;
  pickupName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupPhone: string | null;
  dropName: string | null;
  dropAddress: string;
  dropLat: number;
  dropLng: number;
  dropPhone: string | null;
  distanceKm: number;
  estimatedMins: number | null;
  orderValue: Dec;
  isCod: boolean;
  codAmount: Dec;
  tipAmount: Dec;
  riderEarning: Dec;
  assignedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface RoutePlan {
  stops: {
    id: string;
    type: 'PICKUP' | 'DROP';
    orderId: string;
    lat: number;
    lng: number;
    label: string;
    sequence: number;
    legKm: number;
    cumulativeKm: number;
    etaMins: number;
  }[];
  totalKm: number;
  totalMins: number;
  improvedByKm: number;
  navigationUrl: string;
}

export interface Earnings {
  from: string;
  to: string;
  total: number;
  deliveries: number;
  averagePerDelivery: number;
  today: number;
  byType: Record<string, number>;
  daily: { date: string; amount: number; deliveries: number }[];
  recent: { id: string; type: string; amount: Dec; description: string | null; earnedAt: string }[];
}

export interface RiderIncentive {
  id: string;
  name: string;
  description: string | null;
  type: string;
  target: number;
  progress: number;
  rewardAmount: Dec;
  status: string;
  minRating: number | null;
  startsAt: string;
  endsAt: string;
  percent: number;
}

export interface Heatmap {
  generatedAt: string;
  cells: {
    geohash: string;
    lat: number;
    lng: number;
    demand: number;
    riders: number;
    pressure: number;
  }[];
  hotspots: {
    geohash: string;
    lat: number;
    lng: number;
    demand: number;
    riders: number;
    pressure: number;
  }[];
  zones: { id: string; name: string; surge: number; polygon: number[][][] }[];
}
