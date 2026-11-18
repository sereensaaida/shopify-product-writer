# Shopify AI Product Writer

A command-line tool that turns a few bullet points about a product into store-ready Shopify copy using the Claude API, then optionally pushes it to your store with the Admin GraphQL API.

1. **`generate`** writes a product title, HTML description, SEO title and meta description, tags, and short benefit headlines
2. **`section`** turns the benefits into a Liquid theme section you can drop into a theme
3. **`push`** updates a product through the Admin GraphQL API (preview by default, `--yes` to apply)

## Tech

Node.js (ESM) · Anthropic SDK · Shopify Admin GraphQL API · Liquid · Node's built-in test runner

## Setup

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY (and Shopify settings if you want to push)
```

## Usage

```bash
# 1. Generate copy (saved to output/copy.json)
npm run generate -- --title "Canvas Tote Bag" \
  --details "Heavy cotton canvas, inner zip pocket, reinforced straps, fits a 15-inch laptop" \
  --tone "warm and practical" --audience "students and commuters"

# 2. Build a Liquid section from the generated benefits
npm run section -- --file output/copy.json

# 3. Preview what would be sent to the store, then apply it
npm run push -- --product-id 1234567890 --file output/copy.json
npm run push -- --product-id 1234567890 --file output/copy.json --yes
```

To push, create a custom app on a **development store**, grant it the `write_products` scope, and put the shop domain and Admin API access token in `.env`. Check Shopify's docs for the current API version and setup steps.

## How it works

- **Structured output.** The system prompt asks for one JSON object with fixed keys and length limits (SEO title 60 characters, meta description 155).
- **Validate, then retry once.** If the reply is invalid or breaks a limit, the exact problems are sent back to the model for one correction.
- **Sanitized HTML.** Model output is untrusted, so descriptions are filtered to `p`, `ul`, `li`, `strong`, and `em` before they can reach a storefront.
- **Safe by default.** `push` only previews unless you pass `--yes`, because it overwrites live product fields.
- **No made-up facts.** The prompt tells the model not to invent materials, sizes, or guarantees. You should still review every result before publishing.
- **Predictable Liquid.** The theme section comes from a fixed template (not AI-generated code), so the schema is always valid.

## Project layout

```
src/copy.js      Prompt, JSON parsing, validation, HTML sanitizer
src/claude.js    Claude API call with one retry (client is injectable for tests)
src/shopify.js   productUpdate mutation and request handling
src/section.js   Liquid section template
src/cli.js       generate / push / section commands
test/            Parsing, validation, sanitizing, retry, GraphQL, and Liquid tests
```

Run the tests with `npm test` (no API keys needed; the API calls are faked).

## Ideas to extend

- Generate copy for every product in a collection
- Add image alt-text generation from product photos
- Translate copy into French for Quebec storefronts
