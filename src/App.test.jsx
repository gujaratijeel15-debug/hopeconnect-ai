import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { scoreMatch } from "./App.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});
describe("community experience", () => {
  it("shows the demo board and deterministic suggested matches", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /when we show up/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Food for families")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /matches/i }));
    expect(screen.getByText(/suggested connections/i)).toBeInTheDocument();
    expect(screen.getByText(/food for families/i)).toBeInTheDocument();
  });
  it("requires the same category, location and active listing statuses", () => {
    const n = {
      kind: "need",
      status: "Open",
      category: "Food",
      location: "Pune",
      quantity: 10,
      urgency: "High",
    };
    const o = {
      kind: "offer",
      status: "Available",
      category: "Food",
      location: " pune ",
      quantity: 10,
    };
    expect(scoreMatch(n, o).score).toBe(100);
    expect(scoreMatch(n, { ...o, location: "Mumbai" })).toBeNull();
    expect(scoreMatch(n, { ...o, status: "Fulfilled" })).toBeNull();
  });
  it("opens a labeled request form and validates required fields", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /i need support/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/give it a short title/i)).toBeRequired();
    expect(
      screen.getByRole("button", { name: /post this request/i }),
    ).toBeInTheDocument();
  });
  it.each([
    ["need", "I need support", "Post this request"],
    ["offer", "I can offer help", "Share this resource"],
  ])("publishes a %s directly from the dashboard without an auth call", async (kind, openLabel, submitLabel) => {
    const item = { _id: "saved-1", kind, title: "Local listing", description: "A useful community listing.", category: "Food", location: "Pune", urgency: "Normal", quantity: 2, status: kind === "need" ? "Open" : "Available" };
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (url === "/api/health") return Promise.resolve({ json: async () => ({ database: "not-configured", aiConfigured: false }) });
      if (url === `/api/entries/${kind}`) return Promise.resolve({ ok: true, json: async () => ({ item }) });
      return Promise.reject(new Error("unexpected request"));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App/>);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(openLabel, "i") }));
    fireEvent.change(screen.getByLabelText("Give it a short title"), { target: { value: item.title } });
    fireEvent.change(screen.getByLabelText("Tell us a little more"), { target: { value: item.description } });
    fireEvent.change(screen.getByLabelText("Area or city"), { target: { value: item.location } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(submitLabel, "i") }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/entries/${kind}`, expect.objectContaining({ method: "POST" })));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/auth/"))).toBe(false);
    expect(await screen.findByText(item.title)).toBeInTheDocument();
  });
  it("opens the main dashboard for an old login URL and normalizes the route", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App/>);
    expect(screen.getByRole("heading", { name: /when we show up/i })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.queryByRole("link", { name: /^login$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^register$/i })).not.toBeInTheDocument();
  });
});
