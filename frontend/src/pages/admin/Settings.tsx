import { useEffect } from "react";
import { useAdminStore } from "@/store/adminStore";

const PHASE2_CATEGORIES = [
  { name: "General", description: "App name, default language, timezone" },
  { name: "Security", description: "Password policies, session timeouts, 2FA requirements" },
  { name: "Federation", description: "Federation enable/disable, allowed/blocked domains" },
  { name: "Branding", description: "Logo, colors, custom CSS, app title" },
  { name: "Registration", description: "Open/closed/invite-only, domain restrictions" },
  { name: "Retention", description: "Message TTL, auto-delete policies" },
];

export default function Settings() {
  const { settings, loadingSettings, fetchSettings } = useAdminStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Settings</h2>

      {loadingSettings ? (
        <p className="text-gray-400">Loading...</p>
      ) : settings.length > 0 ? (
        <div className="space-y-3">
          {settings.map((s) => (
            <div key={s.key} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{s.key}</p>
                  <p className="text-sm text-gray-400">{s.description || "No description"}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">{s.category}</span>
              </div>
              <pre className="mt-2 text-xs text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto">
                {JSON.stringify(s.value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-gray-400 mb-6">
            No settings configured yet. Settings management is coming in Phase 2.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PHASE2_CATEGORIES.map((cat) => (
              <div key={cat.name} className="bg-gray-900 border border-gray-800 rounded-lg p-4 opacity-60">
                <p className="font-medium">{cat.name}</p>
                <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
                <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-500">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
