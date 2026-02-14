import { useState } from "react";
import UserSearch from "@/components/users/UserSearch";
import { useChatStore } from "@/store/chatStore";
import type { User } from "@/types";

interface Props {
  onClose: () => void;
}

export default function NewDMDialog({ onClose }: Props) {
  const createDM = useChatStore((s) => s.createDM);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (user: User) => {
    setLoading(true);
    setError(null);
    try {
      const channel = await createDM(user.id);
      setActiveChannel(channel.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create DM");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">New Direct Message</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <UserSearch onSelect={handleSelect} />

        {loading && (
          <p className="text-xs text-gray-500 mt-2">Creating conversation...</p>
        )}
        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}
      </div>
    </div>
  );
}
