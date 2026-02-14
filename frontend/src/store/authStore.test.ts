import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

// Mock dependencies
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock("@/api/ws", () => ({
  wsClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  },
}));

vi.mock("@/crypto/bootstrap", () => ({
  bootstrapDeviceKeys: vi.fn().mockResolvedValue(undefined),
}));

import { api } from "@/api/client";
import { wsClient } from "@/api/ws";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      deviceId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it("register sets auth state on success", async () => {
    const mockResponse = {
      access_token: "at",
      refresh_token: "rt",
      device_id: "dev-1",
      user_id: "user-1",
    };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);
    vi.mocked(api.get).mockResolvedValueOnce({ id: "user-1", username: "testuser" });

    await useAuthStore.getState().register("testuser", "password");

    expect(api.setTokens).toHaveBeenCalledWith("at", "rt");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().deviceId).toBe("dev-1");
  });

  it("register sets error on failure", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Username taken"));

    await expect(useAuthStore.getState().register("dup", "pass")).rejects.toThrow();
    expect(useAuthStore.getState().error).toBe("Username taken");
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("login sets auth state on success", async () => {
    const mockResponse = {
      access_token: "at2",
      refresh_token: "rt2",
      device_id: "dev-2",
      user_id: "user-2",
    };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);
    vi.mocked(api.get).mockResolvedValueOnce({ id: "user-2", username: "loginuser" });

    await useAuthStore.getState().login("loginuser", "password");

    expect(api.setTokens).toHaveBeenCalledWith("at2", "rt2");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(wsClient.connect).toHaveBeenCalled();
  });

  it("login sets error on failure", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Invalid credentials"));

    await expect(useAuthStore.getState().login("bad", "pass")).rejects.toThrow();
    expect(useAuthStore.getState().error).toBe("Invalid credentials");
  });

  it("logout clears state", () => {
    useAuthStore.setState({ isAuthenticated: true, deviceId: "d1", user: { id: "u1" } as any });
    vi.mocked(api.post).mockResolvedValueOnce(undefined);

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().deviceId).toBeNull();
    expect(api.clearTokens).toHaveBeenCalled();
    expect(wsClient.disconnect).toHaveBeenCalled();
  });

  it("loadUser fetches and sets user", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ id: "u1", username: "loaded" });

    await useAuthStore.getState().loadUser();

    expect(useAuthStore.getState().user).toEqual({ id: "u1", username: "loaded" });
  });

  it("restoreSession sets auth from localStorage", () => {
    localStorage.setItem("access_token", "stored-at");
    localStorage.setItem("refresh_token", "stored-rt");
    localStorage.setItem("device_id", "stored-dev");
    vi.mocked(api.get).mockResolvedValue({ id: "u1", username: "restored" });

    useAuthStore.getState().restoreSession();

    expect(api.setTokens).toHaveBeenCalledWith("stored-at", "stored-rt");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().deviceId).toBe("stored-dev");
  });
});
