import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import { offerProductInfo } from "@/server/db.ts";
import { type CatalogProduct, searchCatalog } from "@/server/ikea-client.ts";
import { addListItem, ownsList } from "@/server/lists.ts";
import { nonEmpty } from "@/server/strings.ts";

const bodySchema = z.object({
  articleNumber: z.string().regex(/^\d{8}$/),
  quantity: z.number().optional(),
  mode: z.string().optional(),
  product: z
    .object({
      name: z.string().default(""),
      typeName: z.string().default(""),
      measure: z.string().default(""),
      image: z.string().optional(),
      url: z.string().optional(),
      price: z.number().optional(),
    })
    .optional(),
});

export const POST = authed(async ({ db, user, params, body }) => {
  const listId = Number(params["id"]);
  if (!ownsList(db, user.id, listId)) {
    throw new HttpError(404, "Lijst niet gevonden");
  }
  let input;
  try {
    input = await body(bodySchema);
  } catch {
    throw new HttpError(400, "invalid articleNumber");
  }
  const { articleNumber } = input;
  const quantity =
    input.quantity !== undefined && input.quantity > 0 ? input.quantity : 1;
  const mode = input.mode === "add" ? "add" : "max";
  let product: CatalogProduct | undefined;
  if (input.product?.name) {
    product = {
      articleNumber,
      name: input.product.name,
      typeName: input.product.typeName,
      measure: input.product.measure,
      image: nonEmpty(input.product.image),
      url: nonEmpty(input.product.url),
      price: input.product.price,
    };
  } else {
    try {
      product = (await searchCatalog(articleNumber)).find(
        (p) => p.articleNumber === articleNumber,
      );
    } catch {
      product = undefined;
    }
  }
  const fallback = offerProductInfo(db, articleNumber);
  const result = addListItem(
    db,
    listId,
    {
      articleNumber,
      name: product?.name ?? fallback?.title ?? articleNumber,
      typeName: product?.typeName ?? fallback?.description ?? "",
      measure: product?.measure ?? "",
      image: product?.image ?? fallback?.image,
      url: product?.url,
      normalPrice: product?.price,
    },
    quantity,
    mode,
    Date.now(),
  );
  return {
    status: !product && !fallback && result === "added" ? "unknown" : result,
    name: product
      ? `${product.name} ${product.typeName}`.trim()
      : (fallback?.title ?? articleNumber),
  };
});
