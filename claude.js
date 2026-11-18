import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt, parseCopy, validateCopy, finalizeCopy } from "./copy.js";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export function createClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY. Copy .env.example to .env and fill it in.");
  return new Anthropic({ apiKey });
}

async function ask(client, model, messages) {
  const res = await client.messages.create({ model, max_tokens: 1500, system: SYSTEM_PROMPT, messages });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

/**
 * Generates product copy. If the reply is invalid (bad JSON or breaks the length limits),
 * it feeds the problems back to the model once and asks for a corrected version.
 * `client` is injectable so tests can use a fake.
 */
export async function generateCopy(input, { client = createClient(), model = DEFAULT_MODEL } = {}) {
  const messages = [{ role: "user", content: buildUserPrompt(input) }];
  let reply = await ask(client, model, messages);

  for (let attempt = 0; attempt < 2; attempt++) {
    let problems;
    let copy;
    try {
      copy = parseCopy(reply);
      problems = validateCopy(copy);
    } catch (err) {
      problems = [err.message];
    }
    if (problems.length === 0) return finalizeCopy(copy);
    if (attempt === 1) throw new Error(`Model output still invalid after retry: ${problems.join("; ")}`);

    messages.push({ role: "assistant", content: reply });
    messages.push({
      role: "user",
      content: `That output had problems: ${problems.join("; ")}. Return the corrected JSON object only.`,
    });
    reply = await ask(client, model, messages);
  }
}
