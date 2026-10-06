export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
  path: string;
}

/** Monetary amounts are serialised as fixed-point strings (e.g. "249.00"). */
export type Money = string;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface AddressSnapshot extends GeoPoint {
  label?: string;
  contactName?: string;
  contactPhone?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface DateRange {
  from: string;
  to: string;
}
