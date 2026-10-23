export function matchScore(need, offer) {
  if (
    need.kind !== "need" ||
    offer.kind !== "offer" ||
    need.status !== "Open" ||
    offer.status !== "Available"
  )
    return null;
  if (need.category !== offer.category || Number(offer.quantity) <= 0)
    return null;
  const needLocation = String(need.location || "").trim().toLowerCase();
  const offerLocation = String(offer.location || "").trim().toLowerCase();
  const sameLocation = Boolean(needLocation && offerLocation && needLocation === offerLocation);
  if (!sameLocation) return null;
  const sufficientQuantity = Number(offer.quantity) >= Number(need.quantity);
  const factors = {
    category: 60,
    location: 25,
    quantity: sufficientQuantity ? 10 : 3,
    urgency: ["High", "Critical"].includes(need.urgency) ? 5 : 0,
  };
  return {
    score: Object.values(factors).reduce((a, b) => a + b, 0),
    factors,
    sufficientQuantity,
    explanation: `Same category and location; ${sufficientQuantity ? "listed quantity covers" : "listed quantity is below"} the request${factors.urgency ? "; urgency is prioritized" : ""}.`,
  };
}
export function canTransitionStatus(kind, current, next) {
  const active = kind === "need" ? "Open" : kind === "offer" ? "Available" : null;
  if (!active || current === next) return false;
  if (current === active) {
    if (next === "Cancelled") return true;
    return kind === "need" && next === "Fulfilled";
  }
  return ["Fulfilled", "Cancelled"].includes(current) && next === active;
}
export function findMatches(needs, offers) {
  const matches = [];
  for (const need of needs)
    for (const offer of offers) {
      const fit = matchScore(need, offer);
      if (fit) matches.push({ need, offer, ...fit });
    }
  return matches.sort((a, b) => b.score - a.score);
}
