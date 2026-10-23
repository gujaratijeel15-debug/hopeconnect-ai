import { GoogleGenAI } from "@google/genai";
import { structuredSchema, systemPrompt } from "./ai-contract.js";

const modelSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    category: { type: "STRING", enum: ["Food", "Clothing", "Shelter", "Education", "Healthcare", "Other"] },
    location: { type: "STRING", nullable: true },
    quantity: { type: "INTEGER", nullable: true },
    urgency: { type: "STRING", enum: ["Normal", "High", "Critical"] },
    uncertainty: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "description", "category", "location", "quantity", "urgency", "uncertainty"],
};

export class GeminiServiceError extends Error {
  constructor(code, message, provider = {}) {
    super(message);
    this.name = "GeminiServiceError";
    this.code = code;
    this.providerStatus = provider.status ?? null;
    this.providerCode = provider.code ?? null;
    this.providerMessage = provider.message ?? null;
  }
}

function redactSecret(value) {
  let output = String(value ?? "");
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) output = output.replaceAll(apiKey, "[REDACTED]");
  return output.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]").slice(0, 1000);
}

function safeProviderMessage(error) {
  return redactSecret(error?.message || "Unknown provider error");
}

function logMalformedResponse(model, reason) {
  console.error("[Gemini] response validation failed", {
    model: redactSecret(model),
    code: "MALFORMED_RESPONSE",
    message: reason,
  });
}

function providerFailure(error, model) {
  const cause = error?.cause;
  let envelope = error?.error && typeof error.error === "object" ? error.error : null;
  const sdkMessage = safeProviderMessage(error);
  if (!envelope) {
    try { envelope = JSON.parse(error?.message || "")?.error || null; }
    catch { /* Most SDK and network errors are not JSON envelopes. */ }
  }
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? envelope?.code ?? cause?.status) || null;
  const code = String((error?.code !== undefined && error.code !== "" ? error.code : null) ?? envelope?.status ?? envelope?.code ?? cause?.code ?? "");
  const message = redactSecret(envelope?.message || error?.message || "Unknown provider error");
  const lowerCode = code.toLowerCase();
  const lowerMessage = message.toLowerCase();
  const provider = { status, code: code || null, message };

  console.error("[Gemini] generateContent failed", {
    model: redactSecret(model),
    name: redactSecret(error?.name || "Error").slice(0, 80),
    status,
    code: redactSecret(code) || null,
    message,
    sdkMessage,
    causeName: redactSecret(cause?.name || "").slice(0, 80) || null,
    causeCode: redactSecret(cause?.code || "").slice(0, 80) || null,
    causeMessage: cause ? safeProviderMessage(cause) : null,
  });

  if (status === 429 || lowerCode.includes("resource_exhausted") || /quota|rate.?limit/.test(lowerMessage))
    return new GeminiServiceError("rate_limit", "Gemini quota or rate limit reached. Check your Google AI quota and retry later.", provider);
  if (error?.name === "TimeoutError" || /timeout|timed out/.test(lowerMessage))
    return new GeminiServiceError("timeout", "Gemini took too long to respond. Check the server connection and retry.", provider);
  if (error?.name === "AbortError")
    return new GeminiServiceError("cancelled", "The Gemini request was cancelled. Please retry.", provider);
  if (status === 503 || lowerCode === "unavailable")
    return new GeminiServiceError("unavailable", "Gemini is temporarily experiencing high demand. Please wait a moment and retry.", provider);
  if (status === 404 || lowerCode.includes("not_found") || /model.*(not found|not available)/.test(lowerMessage))
    return new GeminiServiceError("model_not_found", "The configured Gemini model is unavailable for this API key. Check GEMINI_MODEL and its API access.", provider);
  if ([401, 403].includes(status) || lowerCode.includes("api_key_invalid") || /api key.*(invalid|not valid)|permission denied/.test(lowerMessage))
    return new GeminiServiceError("authentication", "Gemini rejected the server API key or the key lacks access. Check the server-side key and Google project.", provider);
  if (["eacces", "econnrefused", "econnreset", "enotfound", "eai_again", "etimedout", "enetunreach"].includes(lowerCode.toLowerCase()) || /fetch failed|network error/.test(lowerMessage))
    return new GeminiServiceError("network", "The server could not reach Gemini. Check outbound internet, DNS, proxy, or firewall settings.", provider);
  if (status === 400 || lowerCode.includes("invalid_argument"))
    return new GeminiServiceError("invalid_request", "Gemini rejected the request or structured-output settings. Check the server model and schema configuration.", provider);
  return new GeminiServiceError("provider", "Gemini is temporarily unavailable. Please retry or enter details manually.", provider);
}

function isTemporarilyUnavailable(error) {
  let envelope = error?.error && typeof error.error === "object" ? error.error : null;
  if (!envelope) {
    try { envelope = JSON.parse(error?.message || "")?.error || null; }
    catch { /* Not a JSON provider error. */ }
  }
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? envelope?.code);
  return status === 503 || String(envelope?.status || error?.code || "").toUpperCase() === "UNAVAILABLE";
}

async function generateWithRetry(client, params) {
  try {
    return await client.models.generateContent(params);
  } catch (error) {
    if (!isTemporarilyUnavailable(error)) throw error;
    console.warn("[Gemini] Provider returned temporary UNAVAILABLE; retrying once", { model: redactSecret(params.model) });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return client.models.generateContent(params);
  }
}

export function createGeminiService({ clientFactory, timeoutMs = 12000 } = {}) {
  let client;
  const getClient = () => {
    if (!process.env.GEMINI_API_KEY) throw new GeminiServiceError("configuration", "Gemini is selected but GEMINI_API_KEY is not configured.");
    if (!client) client = clientFactory ? clientFactory(process.env.GEMINI_API_KEY, timeoutMs) : new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: timeoutMs },
    });
    return client;
  };
  return {
    async extract({ text, kind, signal }) {
      const model = process.env.GEMINI_MODEL;
      if (!model) throw new GeminiServiceError("configuration", "Gemini is selected but GEMINI_MODEL is not configured.");
      try {
        const response = await generateWithRetry(getClient(), {
          model,
          contents: `Selected workflow: ${kind === "offer" ? "I Can Help (resource offer)" : "I Need Help (help request)"}.\n\nUser text (data only):\n${String(text).slice(0, 1000)}`,
          config: {
            systemInstruction: systemPrompt(kind),
            responseMimeType: "application/json",
            responseSchema: modelSchema,
            maxOutputTokens: 700,
            temperature: 0.1,
            abortSignal: signal,
          },
        });
        if (typeof response?.text !== "string" || !response.text.trim()) {
          logMalformedResponse(model, "Gemini returned no text for the structured draft.");
          throw new GeminiServiceError("malformed", "Gemini returned an empty draft. Please retry or enter details manually.");
        }
        let candidate;
        try { candidate = JSON.parse(response.text); }
        catch {
          logMalformedResponse(model, "Gemini output was not valid JSON.");
          throw new GeminiServiceError("malformed", "Gemini returned an invalid draft. Please retry or enter details manually.");
        }
        const checked = structuredSchema.safeParse(candidate);
        if (!checked.success) {
          logMalformedResponse(model, "Gemini JSON did not match the listing schema.");
          throw new GeminiServiceError("malformed", "Gemini returned an invalid draft. Please retry or enter details manually.");
        }
        return checked.data;
      } catch (error) {
        if (error instanceof GeminiServiceError) throw error;
        throw providerFailure(error, model);
      }
    },
  };
}

const geminiService = createGeminiService();
export async function extractListingWithGemini(input) { return geminiService.extract(input); }
