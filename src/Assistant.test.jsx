import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Assistant from "./Assistant.jsx";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("assistant Gemini draft workflow", () => {
  it("requests an editable offer draft and does not publish before confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: {
        kind: "offer", title: "Winter jackets", description: "I can offer 5 winter jackets.",
        category: "Clothing", location: "Pune", quantity: 5, urgency: "Normal",
        uncertainty: [], missingFields: [], mode: "Gemini (structurally validated; review facts)",
      } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Assistant onClose={() => {}} onCreated={() => {}}/>);
    fireEvent.click(screen.getByRole("button", { name: "I Can Help" }));
    fireEvent.change(screen.getByLabelText("Describe what you need or can offer"), { target: { value: "I can offer five winter jackets in Pune." } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare a draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/structure");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: "I can offer five winter jackets in Pune.", kind: "offer" });
    expect(await screen.findByText(/Nothing is published yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and publish offer" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and publish offer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/entries/offer");
    expect(fetchMock.mock.calls[0][1].credentials).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers["x-csrf-token"]).toBeUndefined();
  });

  it("keeps quantity blank and blocks submission when Gemini requests clarification", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: {
        kind: "need", title: "Winter jackets", description: "Need winter jackets.", category: "Clothing",
        location: null, quantity: null, urgency: "Normal", uncertainty: [],
        missingFields: ["quantity", "location"], mode: "Gemini (structurally validated; review facts)",
      } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Assistant onClose={() => {}} onCreated={() => {}}/>);
    fireEvent.change(screen.getByLabelText("Describe what you need or can offer"), { target: { value: "We need winter jackets." } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare a draft" }));
    const quantity = await screen.findByLabelText("Quantity");
    expect(quantity.value).toBe("");
    expect(screen.getByLabelText("Area or city").value).toBe("");
    expect(await screen.findByText(/Please add: quantity and location/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and publish request" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a useful API error if the response is empty or not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
    }));
    render(<Assistant onClose={() => {}} onCreated={() => {}}/>);
    fireEvent.change(screen.getByLabelText("Describe what you need or can offer"), { target: { value: "I need food for my family." } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare a draft" }));
    expect(await screen.findByText(/Request failed \(HTTP 502\).*check the API server and its logs/i)).toBeInTheDocument();
  });
});
