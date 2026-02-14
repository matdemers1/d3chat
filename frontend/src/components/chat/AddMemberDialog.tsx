import { useState } from "react";
import UserSearch from "@/components/users/UserSearch";
import { useChatStore } from "@/store/chatStore";
import type { User } from "@/types";

interface Props {
  channelId: string;
  onClose: () => void;
}

export default function AddMemberDialog({ channelId, onClose }: Props) {
  const addMember = useChatStore((s) => s.addMember);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSelect = async (user: User) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await addMember(channelId, user.id);
      setSuccess(`Added ${user.username}`);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to add member";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Add Member</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <UserSearch onSelect={handleSelect} />

        {loading && (
          <p className="text-xs text-gray-500 mt-2">Adding member...</p>
        )}
        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}
        {success && (
          <p className="text-xs text-green-400 mt-2">{success}</p>
        )}
      </div>
    </div>
  );
}
