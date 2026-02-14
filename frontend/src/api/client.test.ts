import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the ApiClient class directly, so we import and construct it
// The module exports a singleton, but we can test behavior through it
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: "test" }),
  })
);

// Reset module to get fresh api instance
const { api } = await import("./client");

describe("ApiClient", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    api.clearTokens();
  });

  it("get sends GET request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: "ok" }),
    } as Response);

    const result = await api.get("/test");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/test"),
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual({ result: "ok" });
  });

  it("post sends POST request with body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ created: true }),
    } as Response);

    const result = await api.post("/items", { name: "test" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/items"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      })
    );
    expect(result).toEqual({ created: true });
  });

  it("patch sends PATCH request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ updated: true }),
    } as Response);

    await api.patch("/items/1", { name: "updated" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/items/1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("delete sends DELETE request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.delete("/items/1");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/items/1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("includes auth header when token is set", async () => {
    api.setTokens("my-token", "my-refresh");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await api.get("/authed");

    const call = vi.mocked(fetch).mock.calls[0]!;
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("attempts token refresh on 401", async () => {
    api.setTokens("expired", "refresh-tok");

    // First call returns 401
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "expired" }),
    } as Response);

    // Refresh call succeeds
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-at",
        refresh_token: "new-rt",
      }),
    } as Response);

    // Retry call succeeds
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: "retry-ok" }),
    } as Response);

    const result = await api.get("/protected");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: "retry-ok" });
  });

  it("clearTokens removes auth", async () => {
    api.setTokens("tok", "ref");
    api.clearTokens();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await api.get("/test");

    const call = vi.mocked(fetch).mock.calls[0]!;
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    } as Response);

    await expect(api.get("/fail")).rejects.toThrow("Server error");
  });
});
