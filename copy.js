/** Prompt building, parsing, validating, and sanitizing of the AI-written product copy. */

export const SYSTEM_PROMPT = `You are an e-commerce copywriter for Shopify stores.
Write accurate, specific, benefit-led product copy. Never invent facts, materials, certifications,
dimensions, or guarantees that are not in the details you were given.
Respond with ONLY a JSON object, no prose and no markdown fences, with exactly these keys:
{
  "title": string,            // product title, max 70 characters
  "descriptionHtml": string,  // 2 short paragraphs, then a <ul> of 3-5 <li> features. Only <p>, <ul>, <li>, <strong>, <em>
  "seoTitle": string,         // max 60 characters
  "seoDescription": string,   // max 155 characters
  "tags": string[],           // 3-8 lowercase tags
  "benefits": string[]        // 3-4 short benefit headlines, max 40 characters each
}`;

export function buildUserPrompt({ title, details, tone = "friendly and clear", audience = "" }) {
  return [
    `Product name: ${title}`,
    `Details: ${details}`,
    `Tone: ${tone}`,
    audience ? `Target audience: ${audience}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pulls a JSON object out of the model reply, tolerating ```json fences or stray text around it. */
export function parseCopy(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const ALLOWED_TAGS = new Set(["p", "ul", "li", "strong", "em"]);

/**
 * Minimal allow-list sanitizer. Model output is untrusted text going into a storefront,
 * so strip scripts/styles and any tag or attribute that is not on the list.
 */
export function sanitizeHtml(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      return match.startsWith("</") ? `</${name}>` : `<${name}>`;
    })
    .trim();
}

/** Returns a list of problems (empty means valid). */
export function validateCopy(copy) {
  const problems = [];
  const str = (k, max) => {
    if (typeof copy[k] !== "string" || !copy[k].trim()) problems.push(`${k} is missing`);
    else if (copy[k].length > max) problems.push(`${k} is ${copy[k].length} characters (max ${max})`);
  };
  str("title", 70);
  str("descriptionHtml", 4000);
  str("seoTitle", 60);
  str("seoDescription", 155);
  if (!Array.isArray(copy.tags) || copy.tags.length < 3 || copy.tags.length > 8) problems.push("tags must have 3-8 items");
  if (!Array.isArray(copy.benefits) || copy.benefits.length < 3 || copy.benefits.length > 4) {
    problems.push("benefits must have 3-4 items");
  } else if (copy.benefits.some((b) => typeof b !== "string" || b.length > 40)) {
    problems.push("each benefit must be a string of max 40 characters");
  }
  return problems;
}

export function finalizeCopy(copy) {
  return {
    ...copy,
    descriptionHtml: sanitizeHtml(copy.descriptionHtml),
    tags: copy.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean),
  };
}
