import { useEffect, useState } from "react";
import { useAdminStore } from "@/store/adminStore";
import { useAuthStore } from "@/store/authStore";
import type { ServerSetting } from "@/types";

const CATEGORIES = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "registration", label: "Registration" },
  { key: "branding", label: "Branding" },
  { key: "retention", label: "Retention" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "color" | "list";
  options?: { value: string; label: string }[];
  help?: string;
}

const FIELD_CONFIG: Record<CategoryKey, FieldConfig[]> = {
  general: [
    { key: "app_name", label: "App Name", type: "text", help: "Display name shown in the UI" },
    { key: "app_description", label: "App Description", type: "text", help: "Shown on login/register pages" },
  ],
  security: [
    { key: "session_timeout_days", label: "Session Timeout (days)", type: "number", help: "Refresh token expiry" },
    { key: "max_devices_per_user", label: "Max Devices Per User", type: "number" },
  ],
  registration: [
    {
      key: "registration_mode",
      label: "Registration Mode",
      type: "select",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "invite_only", label: "Invite Only" },
      ],
    },
    {
      key: "registration_domain_allowlist",
      label: "Domain Allowlist",
      type: "list",
      help: "Comma-separated email domains (empty = all allowed)",
    },
  ],
  branding: [
    { key: "brand_primary_color", label: "Primary Color", type: "color" },
    { key: "brand_accent_color", label: "Accent Color", type: "color" },
  ],
  retention: [
    {
      key: "message_retention_days",
      label: "Message Retention (days)",
      type: "number",
      help: "0 = keep forever. Purge job not yet implemented.",
    },
  ],
};

function getSettingValue(setting: ServerSetting | undefined): unknown {
  if (!setting?.value || typeof setting.value !== "object") return "";
  return (setting.value as Record<string, unknown>).value ?? "";
}

function SettingField({
  config,
  setting,
  isSuperadmin,
}: {
  config: FieldConfig;
  setting: ServerSetting | undefined;
  isSuperadmin: boolean;
}) {
  const updateSetting = useAdminStore((s) => s.updateSetting);
  const rawValue = getSettingValue(setting);

  const [localValue, setLocalValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (config.type === "list" && Array.isArray(rawValue)) {
      setLocalValue((rawValue as string[]).join(", "));
    } else {
      setLocalValue(String(rawValue ?? ""));
    }
  }, [rawValue, config.type]);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      let valueToSave: unknown = localValue;
      if (config.type === "number") {
        valueToSave = Number(localValue);
      } else if (config.type === "list") {
        valueToSave = localValue
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      await updateSetting(config.key, valueToSave);
      setFeedback({ type: "success", msg: "Saved" });
      setTimeout(() => setFeedback(null), 2000);
    } catch (e) {
      setFeedback({ type: "error", msg: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const hasChanged = (() => {
    if (config.type === "list" && Array.isArray(rawValue)) {
      return localValue !== (rawValue as string[]).join(", ");
    }
    return localValue !== String(rawValue ?? "");
  })();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label className="block font-medium text-sm text-gray-200 mb-1">{config.label}</label>
          {config.help && <p className="text-xs text-gray-500 mb-2">{config.help}</p>}

          <div className="flex items-center gap-2">
            {config.type === "select" ? (
              <select
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                disabled={!isSuperadmin}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                {config.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : config.type === "color" ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localValue}
                  onChange={(e) => setLocalValue(e.target.value)}
                  disabled={!isSuperadmin}
                  className="w-32 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <div
                  className="w-8 h-8 rounded border border-gray-600"
                  style={{ backgroundColor: localValue }}
                />
              </div>
            ) : (
              <input
                type={config.type === "number" ? "number" : "text"}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                disabled={!isSuperadmin}
                className="flex-1 max-w-md px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
            )}
          </div>
        </div>

        {isSuperadmin && (
          <div className="flex items-center gap-2 pt-5">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanged}
              className="px-3 py-1.5 bg-brand hover:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {feedback && (
              <span
                className={`text-xs ${feedback.type === "success" ? "text-green-400" : "text-red-400"}`}
              >
                {feedback.msg}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, loadingSettings, fetchSettings } = useAdminStore();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.role === "superadmin";
  const [activeTab, setActiveTab] = useState<CategoryKey>("general");

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const settingsMap = new Map<string, ServerSetting>();
  for (const s of settings) {
    settingsMap.set(s.key, s);
  }

  const currentFields = FIELD_CONFIG[activeTab] || [];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Settings</h2>

      {loadingSettings ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="flex gap-1 mb-6 border-b border-gray-800">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === cat.key
                    ? "border-brand text-brand"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Settings Fields */}
          <div className="space-y-3">
            {currentFields.map((field) => (
              <SettingField
                key={field.key}
                config={field}
                setting={settingsMap.get(field.key)}
                isSuperadmin={isSuperadmin}
              />
            ))}
          </div>

          {!isSuperadmin && (
            <p className="mt-4 text-sm text-gray-500">
              Only superadmins can modify settings.
            </p>
          )}
        </>
      )}
    </div>
  );
}
