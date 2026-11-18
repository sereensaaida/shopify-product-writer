#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { generateCopy } from "./claude.js";
import { pushToShopify } from "./shopify.js";
import { buildSection } from "./section.js";

const HELP = `Usage:
  generate --title "Name" --details "What it is, materials, features" [--tone "warm"] [--audience "..."] [--out output/copy.json]
  push     --product-id 1234567890 --file output/copy.json [--yes]      (without --yes it only previews)
  section  --file output/copy.json [--out output/product-benefits.liquid]
`;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    title: { type: "string" },
    details: { type: "string" },
    tone: { type: "string" },
    audience: { type: "string" },
    out: { type: "string" },
    file: { type: "string" },
    "product-id": { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

const readCopy = () => {
  if (!values.file) throw new Error("--file is required");
  return JSON.parse(fs.readFileSync(values.file, "utf8"));
};
const writeOut = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

try {
  if (command === "generate") {
    if (!values.title || !values.details) throw new Error("--title and --details are required");
    const copy = await generateCopy(values);
    const out = values.out || "output/copy.json";
    writeOut(out, JSON.stringify(copy, null, 2));
    console.log(JSON.stringify(copy, null, 2));
    console.log(`\nSaved to ${out}. Review it before pushing to a store.`);
  } else if (command === "push") {
    const copy = readCopy();
    if (!values["product-id"]) throw new Error("--product-id is required");
    if (!values.yes) {
      console.log("Preview only. This would overwrite the product's title, description, tags and SEO fields:\n");
      console.log(JSON.stringify(copy, null, 2));
      console.log("\nRe-run with --yes to push.");
    } else {
      const product = await pushToShopify(values["product-id"], copy);
      console.log(`Updated "${product.title}" (${product.id})`);
    }
  } else if (command === "section") {
    const copy = readCopy();
    const out = values.out || "output/product-benefits.liquid";
    writeOut(out, buildSection({ heading: "Why you'll love it", benefits: copy.benefits }));
    console.log(`Wrote ${out}. Copy it into your theme's /sections folder.`);
  } else {
    console.log(HELP);
    process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
