import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiService } from "./gemini.js";
import { fallbackStructure, structureText } from "./ai.js";

const original = { ...process.env };
const goodDraft = {
  title: "Winter jackets needed", description: "Need winter jackets for families.",
  category: "Clothing", location: "Pune", quantity: 12, urgency: "High", uncertainty: [],
};
const validResponse = (value = goodDraft) => ({ text: JSON.stringify(value) });

afterEach(() => {
  for (const key of ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "GEMINI_API_KEY", "GEMINI_MODEL"])
    delete process.env[key];
  Object.assign(process.env, original);
  vi.restoreAllMocks();
});

describe("Gemini extraction service", () => {
  it.each(["need", "offer"]) ("extracts a valid %s listing through the SDK boundary", async (kind) => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const generateContent = vi.fn().mockResolvedValue(validResponse());
    const service = createGeminiService({ clientFactory: () => ({ models: { generateContent } }) });
    const result = await service.extract({ text: "Need 12 jackets in Pune", kind });
    expect(result).toEqual(goodDraft);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent.mock.calls[0][0].model).toBe("test-model");
    expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBeLessThanOrEqual(700);
    expect(generateContent.mock.calls[0][0].contents).toContain(kind === "offer" ? "I Can Help" : "I Need Help");
  });

  it("retains missing quantity and location instead of inventing them", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const service = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => validResponse({ ...goodDraft, quantity: null, location: null }) } }) });
    const result = await service.extract({ text: "We need some winter jackets", kind: "need" });
    expect(result.quantity).toBeNull();
    expect(result.location).toBeNull();
    process.env.AI_PROVIDER = "gemini";
    const injected = await structureText("We need some winter jackets", "need", { geminiExtract: async () => result });
    expect(injected.missingFields).toEqual(["quantity", "location"]);
  });

  it("rejects malformed, unsupported, and unexpected output", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    for (const value of ["not json", { ...goodDraft, category: "Money" }, { ...goodDraft, owner: "another-user" }]) {
      const service = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => ({ text: typeof value === "string" ? value : JSON.stringify(value) }) } }) });
      await expect(service.extract({ text: "Need winter jackets", kind: "need" })).rejects.toMatchObject({ code: "malformed" });
    }
  });

  it("requires a configured key and model", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "test-model";
    const service = createGeminiService({ clientFactory: vi.fn() });
    await expect(service.extract({ text: "Need jackets", kind: "need" })).rejects.toMatchObject({ code: "configuration" });
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    await expect(service.extract({ text: "Need jackets", kind: "need" })).rejects.toMatchObject({ code: "configuration" });
  });

  it("maps timeout, provider rate limit, and generic provider errors without falling back", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.AI_PROVIDER = "gemini";
    for (const [error, code] of [[Object.assign(new Error("request timed out"), { name: "TimeoutError" }), "timeout"], [Object.assign(new Error("limited"), { status: 429 }), "rate_limit"], [new Error("offline"), "provider"]]) {
      const service = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => { throw error; } } }) });
      await expect(service.extract({ text: "Need jackets", kind: "need" })).rejects.toMatchObject({ code });
    }
    const failed = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => { throw new Error("offline"); } } }) });
    await expect(failed.extract({ text: "Need 12 jackets in Pune", kind: "need" })).rejects.toMatchObject({ code: "provider" });
  });

  it("classifies auth, model, and network failures while logging sanitized provider diagnostics", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const networkError = new TypeError("fetch failed for test-key");
    networkError.cause = Object.assign(new AggregateError([]), { code: "EACCES" });
    const cases = [
      [Object.assign(new Error("API key not valid"), { status: 400, code: "API_KEY_INVALID" }), "authentication"],
      [Object.assign(new Error("Model not found"), { status: 404, code: "NOT_FOUND" }), "model_not_found"],
      [networkError, "network"],
    ];
    for (const [error, code] of cases) {
      const service = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => { throw error; } } }) });
      await expect(service.extract({ text: "Need 12 jackets in Pune", kind: "need" })).rejects.toMatchObject({ code });
    }
    const service = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => { throw networkError; } } }) });
    await expect(service.extract({ text: "Need 12 jackets in Pune", kind: "need" })).rejects.toMatchObject({
      code: "network", providerStatus: null, providerCode: "EACCES", providerMessage: "fetch failed for [REDACTED]",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-key");
    expect(JSON.stringify(log.mock.calls)).toContain("EACCES");
  });

  it("retries one temporary Gemini UNAVAILABLE response and preserves the final provider details", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const overloaded = Object.assign(new Error(JSON.stringify({ error: {
      code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE",
    } })), { status: 503 });
    const generateContent = vi.fn().mockRejectedValueOnce(overloaded).mockResolvedValue(validResponse());
    const service = createGeminiService({ clientFactory: () => ({ models: { generateContent } }) });
    await expect(service.extract({ text: "Need 12 jackets in Pune", kind: "need" })).resolves.toEqual(goodDraft);
    expect(generateContent).toHaveBeenCalledTimes(2);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = createGeminiService({ clientFactory: () => ({ models: { generateContent: async () => { throw overloaded; } } }) });
    await expect(failed.extract({ text: "Need 12 jackets in Pune", kind: "need" })).rejects.toMatchObject({
      code: "unavailable", providerStatus: 503, providerCode: "UNAVAILABLE",
      providerMessage: "This model is currently experiencing high demand.",
    });
    expect(JSON.stringify(log.mock.calls)).toContain("UNAVAILABLE");
    expect(JSON.stringify(log.mock.calls)).toContain("503");
  });
});

describe("provider selection and rules fallback", () => {
  it("selects Gemini explicitly and keeps the help/offer intent from the chosen workflow", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const geminiExtract = vi.fn().mockResolvedValue(goodDraft);
    const result = await structureText("I can donate 5 jackets in Pune", "offer", { geminiExtract });
    expect(result.kind).toBe("offer");
    expect(result.mode).toMatch(/^Gemini/);
    expect(geminiExtract).toHaveBeenCalledWith({ text: "I can donate 5 jackets in Pune", kind: "offer" });
  });

  it("does not assume a quantity in the rules fallback", () => {
    const result = fallbackStructure("We need winter jackets in Pune", "need");
    expect(result.quantity).toBeNull();
    expect(result.location).toMatch(/Pune/);
    expect(result.missingFields).toContain("quantity");
  });

  it("fails accurately when Gemini is selected but credentials are absent", async () => {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    await expect(structureText("Need 2 jackets in Pune", "need")).rejects.toMatchObject({ code: "configuration" });
  });

  it("rejects overlong input before invoking the provider", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const geminiExtract = vi.fn();
    await expect(structureText("x".repeat(1001), "need", { geminiExtract })).rejects.toMatchObject({ name: "ZodError" });
    expect(geminiExtract).not.toHaveBeenCalled();
  });

  it("does not turn a Gemini error into a fallback draft", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const geminiExtract = vi.fn().mockRejectedValue(Object.assign(new Error("unavailable"), { code: "provider" }));
    await expect(structureText("Need 2 jackets in Pune", "need", { geminiExtract })).rejects.toMatchObject({ code: "provider" });
    expect(geminiExtract).toHaveBeenCalledOnce();
  });
});
