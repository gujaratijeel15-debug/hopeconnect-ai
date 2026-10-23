import { describe, expect, it } from "vitest";
import { canTransitionStatus, findMatches, matchScore } from "./matching.js";
import { fallbackStructure } from "./ai.js";

const need = {
  kind: "need",
  status: "Open",
  category: "Food",
  location: "Pune",
  quantity: 10,
  urgency: "Critical",
};
const offer = {
  kind: "offer",
  status: "Available",
  category: "Food",
  location: " pune ",
  quantity: 12,
};
describe("deterministic matching", () => {
  it("scores same-category, same-location offers and explains quantity fit", () => {
    const result = matchScore(need, offer);
    expect(result.score).toBe(100);
    expect(result.sufficientQuantity).toBe(true);
    expect(result.factors).toEqual({
      category: 60,
      location: 25,
      quantity: 10,
      urgency: 5,
    });
  });
  it("does not suggest mismatched location, category, fulfilled needs or unavailable offers", () => {
    expect(matchScore(need, { ...offer, location: "Mumbai" })).toBeNull();
    expect(matchScore(need, { ...offer, category: "Shelter" })).toBeNull();
    expect(matchScore({ ...need, status: "Fulfilled" }, offer)).toBeNull();
    expect(matchScore(need, { ...offer, status: "Fulfilled" })).toBeNull();
    expect(matchScore({ ...need, location: " " }, { ...offer, location: " " })).toBeNull();
  });
  it("only permits safe status transitions; offers cannot be fulfilled without allocation", () => {
    expect(canTransitionStatus("need", "Open", "Fulfilled")).toBe(true);
    expect(canTransitionStatus("offer", "Available", "Fulfilled")).toBe(false);
    expect(canTransitionStatus("offer", "Available", "Cancelled")).toBe(true);
    expect(canTransitionStatus("need", "Cancelled", "Open")).toBe(true);
    expect(canTransitionStatus("need", "Open", "Available")).toBe(false);
  });
  it("orders suggestions by score", () => {
    const partial = { ...offer, quantity: 2 };
    expect(findMatches([need], [partial, offer]).map((x) => x.score)).toEqual([
      100, 93,
    ]);
  });
});
describe("AI fallback", () => {
  it("extracts conservative structured fields without claiming AI analysis", () => {
    const r = fallbackStructure(
      "Urgent need for 12 food packets in Pune today.",
    );
    expect(r.category).toBe("Food");
    expect(r.quantity).toBe(12);
    expect(r.urgency).toBe("Critical");
    expect(r.location).toMatch(/Pune/);
    expect(r.mode).toBe("rule-based fallback");
  });
});
