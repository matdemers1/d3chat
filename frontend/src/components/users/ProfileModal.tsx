import { useState, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import Avatar from "@/components/common/Avatar";

interface Props {
  onClose: () => void;
}

type Tab = "profile" | "security";

export default function ProfileModal({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const deleteAvatar = useAuthStore((s) => s.deleteAvatar);

  const [tab, setTab] = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [statusMessage, setStatusMessage] = useState(user?.status_message ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailVisible, setEmailVisible] = useState(user?.email_visible ?? false);
  const [desktopNotifications, setDesktopNotifications] = useState(
    user?.preferences?.desktop_notifications ?? false
  );
  const [notificationSound, setNotificationSound] = useState(
    user?.preferences?.notification_sound ?? true
  );

  // Security fields
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({
        display_name: displayName || null,
        bio: bio || null,
        status_message: statusMessage || null,
        email: email || null,
        email_visible: emailVisible,
        preferences: {
          desktop_notifications: desktopNotifications,
          notification_sound: notificationSound,
        },
      });
      setMessage("Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      setMessage("Password changed successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password change failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAvatarRemove = async () => {
    setError(null);
    try {
      await deleteAvatar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const inputClass =
    "w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500";
  const labelClass = "block text-xs text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-[480px] max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4 border-b border-gray-800 pb-2">
          {(["profile", "security"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setMessage(null); }}
              className={`text-sm pb-1 ${
                tab === t
                  ? "text-white border-b-2 border-blue-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "profile" ? "Profile" : "Security"}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {message && <p className="text-green-400 text-xs mb-3">{message}</p>}

        {tab === "profile" && (
          <div className="space-y-4">
            {/* Avatar section */}
            <div className="flex items-center gap-3">
              <Avatar
                src={user.avatar_url}
                name={user.display_name || user.username}
                size="lg"
              />
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
                >
                  Upload
                </button>
                {user.avatar_url && (
                  <button
                    onClick={handleAvatarRemove}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-red-400 rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                placeholder={user.username}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={256}
                rows={3}
                placeholder="Tell others about yourself"
                className={`${inputClass} resize-none`}
              />
              <p className="text-[10px] text-gray-600 mt-0.5 text-right">{bio.length}/256</p>
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                maxLength={128}
                placeholder="What are you up to?"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
              <label className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  checked={emailVisible}
                  onChange={(e) => setEmailVisible(e.target.checked)}
                  className="rounded border-gray-600"
                />
                <span className="text-xs text-gray-400">Show email to others</span>
              </label>
            </div>

            {/* Notifications */}
            <div className="border-t border-gray-800 pt-3">
              <h4 className="text-xs font-semibold text-gray-300 mb-2">Notifications</h4>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={desktopNotifications}
                  onChange={(e) => setDesktopNotifications(e.target.checked)}
                  className="rounded border-gray-600"
                />
                <span className="text-xs text-gray-400">Desktop notifications</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificationSound}
                  onChange={(e) => setNotificationSound(e.target.checked)}
                  className="rounded border-gray-600"
                />
                <span className="text-xs text-gray-400">Notification sound</span>
              </label>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full py-2 text-sm bg-brand hover:brightness-90 text-white rounded disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Current Password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={saving || !oldPassword || !newPassword || !confirmPassword}
              className="w-full py-2 text-sm bg-brand hover:brightness-90 text-white rounded disabled:opacity-50"
            >
              {saving ? "Changing..." : "Change Password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
