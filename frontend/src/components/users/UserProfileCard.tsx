import { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useChatStore } from "@/store/chatStore";
import Avatar from "@/components/common/Avatar";
import type { PublicUser } from "@/types";

interface Props {
  userId: string;
  onClose: () => void;
}

export default function UserProfileCard({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const createDM = useChatStore((s) => s.createDM);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<PublicUser>(`/users/${userId}`)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSendMessage = async () => {
    if (!profile) return;
    try {
      const channel = await createDM(profile.id);
      setActiveChannel(channel.id);
      onClose();
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">User Profile</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">
            &times;
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading...</p>}

        {!loading && profile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name || profile.username}
                size="lg"
              />
              <div className="min-w-0">
                <p className="text-white font-medium text-sm truncate">
                  {profile.display_name || profile.username}
                </p>
                <p className="text-gray-500 text-xs truncate">
                  @{profile.username}
                  {!profile.is_local && `@${profile.server_domain}`}
                </p>
              </div>
            </div>

            {profile.status_message && (
              <p className="text-xs text-gray-400 italic">{profile.status_message}</p>
            )}

            {profile.bio && (
              <p className="text-xs text-gray-300">{profile.bio}</p>
            )}

            {profile.email && (
              <p className="text-xs text-gray-500">{profile.email}</p>
            )}

            <p className="text-[10px] text-gray-600">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </p>

            <button
              onClick={handleSendMessage}
              className="w-full py-1.5 text-sm bg-brand hover:brightness-90 text-white rounded"
            >
              Send Message
            </button>
          </div>
        )}

        {!loading && !profile && (
          <p className="text-sm text-gray-500">User not found</p>
        )}
      </div>
    </div>
  );
}
