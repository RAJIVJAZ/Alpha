/**
 * The cities FoodGrid serves. The customer site opens in the deployment's city: its
 * default location, the area shortcuts, the city's banners and new addresses' city and
 * state. Each city needs an active delivery zone too (`pnpm --filter @foodgrid/database
 * db:setup`), or restaurants there cannot take delivery orders.
 */

export interface CityArea {
  label: string;
  lat: number;
  lng: number;
}

export interface ServiceCity {
  /** Matches NEXT_PUBLIC_CITY. */
  key: string;
  /** As stored on banners, addresses and delivery zones. */
  name: string;
  state: string;
  /** Neighbourhood centres; the first is where the site opens before the customer chooses. */
  areas: CityArea[];
}

export const CITIES: Record<string, ServiceCity> = {
  prayagraj: {
    key: 'prayagraj',
    name: 'Prayagraj',
    state: 'Uttar Pradesh',
    areas: [
      { label: 'Civil Lines, Prayagraj', lat: 25.4553, lng: 81.8353 },
      { label: 'George Town, Prayagraj', lat: 25.4519, lng: 81.8552 },
      { label: 'Katra, Prayagraj', lat: 25.4646, lng: 81.8521 },
      { label: 'Teliyarganj, Prayagraj', lat: 25.4889, lng: 81.8657 },
      { label: 'Naini, Prayagraj', lat: 25.3905, lng: 81.8632 },
      { label: 'Jhunsi, Prayagraj', lat: 25.429, lng: 81.914 },
      { label: 'Phaphamau, Prayagraj', lat: 25.5339, lng: 81.8539 },
    ],
  },
  // the demo data (pnpm db:seed) is in Bengaluru
  bengaluru: {
    key: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    areas: [
      { label: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
      { label: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408 },
      { label: 'HSR Layout, Bengaluru', lat: 12.9116, lng: 77.6474 },
      { label: 'BTM Layout, Bengaluru', lat: 12.9166, lng: 77.6101 },
      { label: 'Jayanagar, Bengaluru', lat: 12.925, lng: 77.5938 },
      { label: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.605 },
      { label: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.75 },
    ],
  },
};

/** The launch city unless `key` names another one. */
export function cityFor(key: string | undefined): ServiceCity {
  return CITIES[(key ?? '').trim().toLowerCase()] ?? CITIES.prayagraj!;
}

/** This deployment's city: NEXT_PUBLIC_CITY at build time (prayagraj, bengaluru). */
export const CITY = cityFor(process.env.NEXT_PUBLIC_CITY);
