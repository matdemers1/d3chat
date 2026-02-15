import { create } from "zustand";
import { api } from "@/api/client";
import { wsClient } from "@/api/ws";
import { bootstrapDeviceKeys } from "@/crypto/bootstrap";
import type { TokenResponse, User } from "@/types";

interface AuthState {
  user: User | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  register: (
    username: string,
    password: string,
    deviceName?: string
  ) => Promise<void>;
  login: (
    username: string,
    password: string,
    deviceName?: string
  ) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  restoreSession: () => void;
  updateProfile: (updates: Partial<Pick<User, "display_name" | "bio" | "status_message" | "email" | "email_visible" | "preferences">>) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  deleteAvatar: () => Promise<void>;
}

// Restore tokens synchronously so the first render knows auth state
function getInitialAuthState() {
  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  const deviceId = localStorage.getItem("device_id");
  if (accessToken && refreshToken) {
    api.setTokens(accessToken, refreshToken);
    return { isAuthenticated: true, deviceId };
  }
  return { isAuthenticated: false, deviceId: null };
}

const initial = getInitialAuthState();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  deviceId: initial.deviceId,
  isAuthenticated: initial.isAuthenticated,
  isLoading: false,
  error: null,

  register: async (username, password, deviceName = "web") => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<TokenResponse>("/auth/register", {
        username,
        password,
        device_name: deviceName,
      });
      api.setTokens(data.access_token, data.refresh_token);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("device_id", data.device_id);
      localStorage.setItem("user_id", data.user_id);
      set({ deviceId: data.device_id, isAuthenticated: true });
      await get().loadUser();
      await bootstrapDeviceKeys(data.device_id).catch(console.error);
      await wsClient.connect();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Registration failed" });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (username, password, deviceName = "web") => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<TokenResponse>("/auth/login", {
        username,
        password,
        device_name: deviceName,
      });
      api.setTokens(data.access_token, data.refresh_token);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("device_id", data.device_id);
      localStorage.setItem("user_id", data.user_id);
      set({ deviceId: data.device_id, isAuthenticated: true });
      await get().loadUser();
      await bootstrapDeviceKeys(data.device_id).catch(console.error);
      await wsClient.connect();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Login failed" });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      api
        .post("/auth/logout", { refresh_token: refreshToken })
        .catch(() => {});
    }
    api.clearTokens();
    wsClient.disconnect();
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("device_id");
    localStorage.removeItem("user_id");
    set({
      user: null,
      deviceId: null,
      isAuthenticated: false,
      error: null,
    });
  },

  loadUser: async () => {
    try {
      const user = await api.get<User>("/users/me");
      set({ user });
    } catch {
      // ignore
    }
  },

  restoreSession: () => {
    const accessToken = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    const deviceId = localStorage.getItem("device_id");
    if (accessToken && refreshToken) {
      api.setTokens(accessToken, refreshToken);
      set({ isAuthenticated: true, deviceId });
      get().loadUser();
      if (deviceId) {
        bootstrapDeviceKeys(deviceId).catch(console.error);
      }
      wsClient.connect();
    }
  },

  updateProfile: async (updates) => {
    const user = await api.patch<User>("/users/me", updates);
    set({ user });
  },

  changePassword: async (oldPassword, newPassword) => {
    await api.post("/users/me/password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  },

  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const user = await api.upload<User>("/users/me/avatar", formData);
    set({ user });
  },

  deleteAvatar: async () => {
    const user = await api.delete<User>("/users/me/avatar");
    set({ user });
  },
}));
