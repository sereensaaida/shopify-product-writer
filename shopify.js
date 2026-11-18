const UPDATE_PRODUCT = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title handle }
      userErrors { field message }
    }
  }`;

/** Shopify product ids look like gid://shopify/Product/123. Accepts a bare number too. */
export function toProductGid(id) {
  const s = String(id).trim();
  if (s.startsWith("gid://shopify/Product/")) return s;
  if (/^\d+$/.test(s)) return `gid://shopify/Product/${s}`;
  throw new Error(`Not a valid product id: ${id}`);
}

export function buildProductUpdate(productId, copy) {
  return {
    product: {
      id: toProductGid(productId),
      title: copy.title,
      descriptionHtml: copy.descriptionHtml,
      tags: copy.tags,
      seo: { title: copy.seoTitle, description: copy.seoDescription },
    },
  };
}

export async function pushToShopify(productId, copy, env = process.env, fetchImpl = fetch) {
  const { SHOPIFY_STORE_DOMAIN: shop, SHOPIFY_ADMIN_TOKEN: token } = env;
  const version = env.SHOPIFY_API_VERSION || "2026-04";
  if (!shop || !token) throw new Error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN to push to a store.");

  const res = await fetchImpl(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: UPDATE_PRODUCT, variables: buildProductUpdate(productId, copy) }),
  });
  if (!res.ok) throw new Error(`Shopify responded ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  const { userErrors, product } = json.data.productUpdate;
  if (userErrors.length) throw new Error(`Shopify rejected the update: ${userErrors.map((e) => e.message).join("; ")}`);
  return product;
}
