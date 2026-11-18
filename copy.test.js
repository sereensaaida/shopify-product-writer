import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCopy, validateCopy, sanitizeHtml, finalizeCopy } from "../src/copy.js";
import { generateCopy } from "../src/claude.js";
import { buildProductUpdate, toProductGid, pushToShopify } from "../src/shopify.js";
import { buildSection } from "../src/section.js";

const good = {
  title: "Canvas Tote Bag",
  descriptionHtml: "<p>Sturdy everyday tote.</p><p>Fits a laptop.</p><ul><li>Cotton canvas</li><li>Inner pocket</li><li>Reinforced straps</li></ul>",
  seoTitle: "Canvas Tote Bag | Everyday Carry",
  seoDescription: "A sturdy cotton canvas tote with an inner pocket and reinforced straps for daily use.",
  tags: ["Tote", "bag", "canvas"],
  benefits: ["Fits a 15-inch laptop", "Reinforced straps", "Machine washable"],
};

test("parseCopy handles fenced and noisy output", () => {
  const reply = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```";
  assert.equal(parseCopy(reply).title, "Canvas Tote Bag");
  assert.throws(() => parseCopy("no json here"));
});

test("validateCopy flags length and count problems", () => {
  assert.deepEqual(validateCopy(good), []);
  const bad = { ...good, seoTitle: "x".repeat(80), tags: ["one"] };
  const problems = validateCopy(bad);
  assert.equal(problems.length, 2);
});

test("sanitizeHtml strips scripts, attributes and unknown tags", () => {
  const dirty = '<p onclick="x()">Hi <script>alert(1)</script><a href="http://evil">link</a></p><ul><li>ok</li></ul>';
  assert.equal(sanitizeHtml(dirty), "<p>Hi link</p><ul><li>ok</li></ul>");
});

test("finalizeCopy lowercases tags", () => {
  assert.deepEqual(finalizeCopy(good).tags, ["tote", "bag", "canvas"]);
});

test("generateCopy retries once with feedback when the first reply is invalid", async () => {
  const replies = [JSON.stringify({ ...good, seoTitle: "x".repeat(90) }), JSON.stringify(good)];
  const calls = [];
  const client = {
    messages: {
      create: async (args) => {
        calls.push(args);
        return { content: [{ type: "text", text: replies.shift() }] };
      },
    },
  };
  const copy = await generateCopy({ title: "Tote", details: "canvas" }, { client, model: "test-model" });
  assert.equal(copy.seoTitle, good.seoTitle);
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /seoTitle is 90 characters/);
});

test("generateCopy gives up after one failed retry", async () => {
  const client = { messages: { create: async () => ({ content: [{ type: "text", text: "nope" }] }) } };
  await assert.rejects(generateCopy({ title: "T", details: "d" }, { client }), /still invalid/);
});

test("product ids are normalized to GIDs", () => {
  assert.equal(toProductGid("123"), "gid://shopify/Product/123");
  assert.equal(toProductGid("gid://shopify/Product/9"), "gid://shopify/Product/9");
  assert.throws(() => toProductGid("abc"));
});

test("buildProductUpdate maps copy to the productUpdate input", () => {
  const { product } = buildProductUpdate("55", finalizeCopy(good));
  assert.equal(product.id, "gid://shopify/Product/55");
  assert.deepEqual(product.seo, { title: good.seoTitle, description: good.seoDescription });
});

test("pushToShopify calls the Admin GraphQL endpoint and surfaces userErrors", async () => {
  const env = { SHOPIFY_STORE_DOMAIN: "demo.myshopify.com", SHOPIFY_ADMIN_TOKEN: "tok", SHOPIFY_API_VERSION: "2026-04" };
  let seen;
  const ok = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ data: { productUpdate: { product: { id: "gid://shopify/Product/55", title: "Canvas Tote Bag" }, userErrors: [] } } }) };
  };
  const product = await pushToShopify("55", finalizeCopy(good), env, ok);
  assert.equal(seen.url, "https://demo.myshopify.com/admin/api/2026-04/graphql.json");
  assert.equal(seen.init.headers["X-Shopify-Access-Token"], "tok");
  assert.equal(product.title, "Canvas Tote Bag");

  const rejected = async () => ({ ok: true, json: async () => ({ data: { productUpdate: { product: null, userErrors: [{ message: "Bad tag" }] } } }) });
  await assert.rejects(pushToShopify("55", finalizeCopy(good), env, rejected), /Bad tag/);
});

test("buildSection produces a Liquid section with a valid JSON schema", () => {
  const out = buildSection({ heading: 'Why "you" will love it', benefits: good.benefits });
  assert.match(out, /\{% schema %\}/);
  const schema = JSON.parse(out.split("{% schema %}")[1].split("{% endschema %}")[0]);
  assert.equal(schema.presets[0].blocks.length, 3);
  assert.equal(schema.settings[0].default, 'Why "you" will love it');
});
