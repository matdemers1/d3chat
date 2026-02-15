import { create } from "zustand";
import type { PublicConfig } from "@/types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function applyColors(primary: string, accent: string) {
  document.documentElement.style.setProperty("--color-brand", primary);
  document.documentElement.style.setProperty("--color-brand-accent", accent);
}

interface BrandingState {
  appName: string;
  appDescription: string;
  registrationMode: string;
  primaryColor: string;
  accentColor: string;
  loaded: boolean;
  loadConfig: () => Promise<void>;
}

export const useBrandingStore = create<BrandingState>((set) => ({
  appName: "d3chat",
  appDescription: "Federated end-to-end encrypted chat",
  registrationMode: "open",
  primaryColor: "#3b82f6",
  accentColor: "#10b981",
  loaded: false,

  loadConfig: async () => {
    try {
      const response = await fetch(`${API_URL}/config`);
      if (!response.ok) return;
      const config: PublicConfig = await response.json();
      set({
        appName: config.app_name,
        appDescription: config.app_description,
        registrationMode: config.registration_mode,
        primaryColor: config.brand_primary_color,
        accentColor: config.brand_accent_color,
        loaded: true,
      });
      applyColors(config.brand_primary_color, config.brand_accent_color);
    } catch {
      set({ loaded: true });
    }
  },
}));
