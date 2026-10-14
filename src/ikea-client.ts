import { config } from "./config.ts";

export type Store = { storeId: string; name: string };

export type IkeaOffer = {
  offerNumber: string;
  storeId: string;
  title: string;
  description: string;
  price: number;
  originalPrice: number | undefined;
  currency: string;
  condition: string;
  reason: string;
  image: string | undefined;
  articleNumber: string | undefined;
};

type StoreDto = { store_id: string; name: string; active: boolean };

type OfferDto = {
  offerNumber: string;
  price: number;
  productConditionTitle?: string;
  reasonDiscount?: string;
  description?: string;
};

type GroupDto = {
  articleNumbers?: string[];
  storeId: string;
  title: string;
  description: string;
  currency?: string;
  heroImage?: string;
  originalPrice?: number;
  offers: OfferDto[];
};

type PageDto = { content: GroupDto[]; totalPages: number };

const PAGE_SIZE = 64;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "x-client-id": config.clientId },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`IKEA API ${String(res.status)} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchStores(country: string): Promise<Store[]> {
  const stores = await getJson<StoreDto[]>(
    `${config.apiRoot}/api/public/stores/${country}`,
  );
  return stores
    .filter((s) => s.active)
    .map((s) => ({
      storeId: s.store_id,
      name: s.name
        .replace(/^IKEA\s+/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    }));
}

export async function fetchStoreOffers(
  storeId: string,
  language: string,
): Promise<IkeaOffer[]> {
  const offers: IkeaOffer[] = [];
  for (let page = 0, totalPages = 1; page < totalPages; page++) {
    const params = new URLSearchParams({
      languageCode: language,
      storeIds: storeId,
      size: String(PAGE_SIZE),
      page: String(page),
    });
    const data = await getJson<PageDto>(
      `${config.apiRoot}/offers/grouped/search?${params.toString()}`,
    );
    totalPages = data.totalPages;
    for (const group of data.content) {
      for (const offer of group.offers) {
        offers.push({
          offerNumber: offer.offerNumber,
          storeId: group.storeId,
          title: group.title,
          description: offer.description ?? group.description,
          price: offer.price,
          originalPrice: group.originalPrice,
          currency: group.currency ?? "EUR",
          condition: offer.productConditionTitle ?? "",
          reason: offer.reasonDiscount ?? "",
          image: group.heroImage,
          articleNumber: group.articleNumbers?.[0],
        });
      }
    }
  }
  return offers;
}

export type CatalogProduct = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  url: string | undefined;
};

type CatalogProductDto = {
  id: string;
  name: string;
  typeName: string;
  itemMeasureReferenceText?: string;
  mainImageUrl?: string;
  pipUrl?: string;
  gprDescription?: { variants?: CatalogProductDto[] };
};

type CatalogDto = {
  searchResultPage: {
    products: { main: { items: { product?: CatalogProductDto }[] } };
  };
};

const toCatalogProduct = (p: CatalogProductDto): CatalogProduct => ({
  articleNumber: p.id,
  name: p.name,
  typeName: p.typeName,
  measure: p.itemMeasureReferenceText ?? "",
  image: p.mainImageUrl,
  url: p.pipUrl,
});

/** Searches the full IKEA catalog; each hit is flattened with its variants (colours etc.). */
export async function searchCatalog(q: string): Promise<CatalogProduct[]> {
  const params = new URLSearchParams({ q, size: "24", types: "PRODUCT" });
  const url = `https://sik.search.blue.cdtapps.com/${config.country}/${config.language}/search-result-page?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`IKEA search ${String(res.status)}`);
  const data = (await res.json()) as CatalogDto;
  const out = new Map<string, CatalogProduct>();
  for (const { product } of data.searchResultPage.products.main.items) {
    if (!product) continue;
    for (const p of [product, ...(product.gprDescription?.variants ?? [])]) {
      if (!out.has(p.id)) out.set(p.id, toCatalogProduct(p));
    }
  }
  return [...out.values()];
}
