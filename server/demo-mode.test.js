import { describe, expect, it } from "vitest";
import { isLocalDemoEnabled } from "./demo-mode.js";

describe("local single-user demo guard", () => {
  it("requires explicit opt-in and refuses demo mode in production", () => {
    expect(isLocalDemoEnabled({ NODE_ENV: "development", LOCAL_DEMO_MODE: "true" })).toBe(true);
    expect(isLocalDemoEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isLocalDemoEnabled({ NODE_ENV: "production", LOCAL_DEMO_MODE: "true" })).toBe(false);
  });
});
