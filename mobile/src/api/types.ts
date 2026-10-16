// Response shapes of the Tweedekanshoek JSON API (kept in sync with the server by hand).

export type PriceTag = {
  kind: "lowest" | "equal" | "pricier";
  diff: number;
  low: number;
};

export type Offer = {
  offerNumber: string;
  storeId: string;
  storeName: string;
  country: string;
  title: string;
  description: string;
  price: number;
  originalPrice: number | undefined;
  currency: string;
  condition: string;
  image: string | undefined;
  articleNumber: string | undefined;
  firstSeen: number;
  followed: boolean;
  tag: PriceTag | undefined;
};

export type Insight = { offers: Offer[]; lowestEver: number | undefined };

export type CatalogItem = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  url: string | undefined;
  price: number | undefined;
  watched: boolean;
  insight: Insight | undefined;
};

export type WatchItem = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  quantity: number;
  needed: number;
  lists: { listId: number; listName: string; remaining: number }[];
  insight: Insight | undefined;
};

export type ListItem = {
  id: number;
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  quantity: number;
  bought: number;
  remaining: number;
  estimateUnit: number | undefined;
  bestOffer: { price: number; storeName: string; country: string } | undefined;
  paid: number;
  lineTotal: number;
  watched: boolean;
};

export type ShoppingList = {
  id: number;
  name: string;
  items: ListItem[];
  totals: {
    pieces: number;
    bought: number;
    total: number;
    toBuy: number;
    saving: number;
  };
};

export type Alert = {
  storeId: string;
  offerNumber: string;
  articleNumber: string;
  title: string;
  description: string;
  price: number;
  storeName: string;
  country: string;
  createdAt: number;
  seen: boolean;
  note: string;
};

export type AlertPage = { total: number; unseen: number; items: Alert[] };

export type OfferPage = { total: number; items: Offer[] };

export type Product = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  url: string | undefined;
  watched: boolean;
  insight: Insight | undefined;
};

export type TripStop = {
  storeId: string;
  storeName: string;
  country: string;
  lat: number | undefined;
  lon: number | undefined;
  units: { name: string; count: number }[];
};

export type Route = {
  stops: TripStop[];
  totalKm: number;
  totalMinutes: number;
  tripCost: number;
  saving: number;
  net: number;
  moneyNet: number;
  status: "good" | "time" | "bad";
};

export type TripsResponse =
  | { configured: false; reason: string }
  | {
      configured: true;
      postcode: string;
      wantedUnits: number;
      bestRoute: Route | undefined;
      alternatives: Route[];
    };
