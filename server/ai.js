import { z } from "zod";
import { extractListingWithGemini, GeminiServiceError } from "./gemini.js";
import { structuredSchema, structureRequestSchema, systemPrompt } from "./ai-contract.js";

const explanationSchema = z.string().trim().min(1).max(240);
const categories = [
  ["food", "Food"], ["meal", "Food"], ["grocer", "Food"],
  ["cloth", "Clothing"], ["jacket", "Clothing"], ["shelter", "Shelter"],
  ["housing", "Shelter"], ["school", "Education"], ["education", "Education"],
  ["book", "Education"], ["health", "Healthcare"], ["medicine", "Healthcare"],
  ["medical", "Healthcare"],
];

function normalizedDraft(parsed, kind, mode) {
  const missingFields = [];
  if (parsed.quantity === null) missingFields.push("quantity");
  if (parsed.location === null) missingFields.push("location");
  return { ...parsed, kind, missingFields, mode };
}

export function fallbackStructure(text, kind = "need") {
  const content = String(text).trim().slice(0, 1000);
  const lower = content.toLowerCase();
  const category = categories.find(([word]) => lower.includes(word))?.[1] || "Other";
  const quantityMatch = content.match(/\b(\d{1,6})\b/);
  const quantityValue = quantityMatch ? Number(quantityMatch[1]) : null;
  const quantity = quantityValue !== null && quantityValue >= 1 && quantityValue <= 100000 ? quantityValue : null;
  const urgency = /urgent|immediately|critical|emergency|today/.test(lower)
    ? "Critical" : /soon|high priority/.test(lower) ? "High" : "Normal";
  const locationMatch = content.match(/\b(?:in|at|near)\s+([A-Z][A-Za-z .'-]{1,35})/);
  const location = locationMatch?.[1]?.trim() || null;
  const parsed = structuredSchema.parse({
    title: content.split(/[.!?]/)[0].trim().slice(0, 90) || "Community request",
    description: content.slice(0, 500), category, location, quantity, urgency,
    uncertainty: ["Rule-based extraction is approximate; review all fields."],
  });
  return normalizedDraft(parsed, kind, "rule-based fallback");
}

export async function structureText(text, kind = "need", { geminiExtract = extractListingWithGemini, signal } = {}) {
  ({ text, kind } = structureRequestSchema.parse({ text, kind }));
  const provider = (process.env.AI_PROVIDER || "rules").trim().toLowerCase();
  if (provider === "rules") return fallbackStructure(text, kind);
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) throw new GeminiServiceError("configuration", "Gemini is selected but GEMINI_API_KEY is not configured.");
    if (!process.env.GEMINI_MODEL) throw new GeminiServiceError("configuration", "Gemini is selected but GEMINI_MODEL is not configured.");
    const parsed = await geminiExtract({ text, kind, signal });
    return normalizedDraft(parsed, kind, "Gemini (structurally validated; review facts)");
  }
  if (provider === "openrouter") {
    if (!process.env.AI_API_KEY || !process.env.AI_MODEL)
      throw new GeminiServiceError("configuration", "OpenRouter is selected but AI_API_KEY or AI_MODEL is not configured.");
    const base = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
    let response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]), method: "POST",
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.AI_MODEL, temperature: 0.1, max_tokens: 700,
          messages: [
            { role: "system", content: systemPrompt(kind) },
            { role: "user", content: String(text).slice(0, 1000) },
          ],
        }),
      });
    } catch (error) {
      throw new GeminiServiceError(error?.name === "TimeoutError" ? "timeout" : "provider", "AI provider request failed.");
    }
    if (!response.ok) throw new GeminiServiceError(response.status === 429 ? "rate_limit" : "provider", "AI provider request failed.");
    try {
      const body = await response.json();
      let raw = body?.choices?.[0]?.message?.content;
      if (Array.isArray(raw)) raw = raw.map((part) => part.text || "").join("");
      const parsed = structuredSchema.parse(JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "")));
      return normalizedDraft(parsed, kind, "OpenAI-compatible AI (structurally validated; review facts)");
    } catch {
      throw new GeminiServiceError("malformed", "AI provider returned an invalid draft. Please retry or enter the details manually.");
    }
  }
  throw new GeminiServiceError("configuration", "AI_PROVIDER must be gemini, openrouter, or rules.");
}

export async function explainMatch(need, offer) {
  const fallback = `Both listings share ${need.category} support in ${need.location}. ${Number(offer.quantity) >= Number(need.quantity) ? "The listed quantity may cover the need." : "The offer quantity is below the request."} Confirm details together before coordinating.`;
  if ((process.env.AI_PROVIDER || "rules").toLowerCase() !== "openrouter" || !process.env.AI_API_KEY || !process.env.AI_MODEL)
    return { explanation: fallback, mode: "rule-based explanation" };
  const base = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/chat/completions`, {
      signal: AbortSignal.timeout(10000), method: "POST",
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.AI_MODEL, temperature: 0.2, max_tokens: 100,
        messages: [
          { role: "system", content: "Explain this suggested match in one neutral sentence. Do not claim a confirmed connection or add facts." },
          { role: "user", content: JSON.stringify({ need: { category: need.category, location: need.location, quantity: need.quantity, urgency: need.urgency }, offer: { category: offer.category, location: offer.location, quantity: offer.quantity } }) },
        ],
      }),
    });
    if (!response.ok) return { explanation: fallback, mode: "rule-based explanation" };
    const body = await response.json();
    let raw = body?.choices?.[0]?.message?.content;
    if (Array.isArray(raw)) raw = raw.map((part) => part.text || "").join("");
    return { explanation: explanationSchema.parse(String(raw).trim()), mode: "OpenAI-compatible explanation" };
  } catch { return { explanation: fallback, mode: "rule-based explanation" }; }
}

export { systemPrompt, structuredSchema, structureRequestSchema };
