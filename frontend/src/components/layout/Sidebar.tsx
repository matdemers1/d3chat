import { useState, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/api/client";
import NewDMDialog from "@/components/chat/NewDMDialog";
import type { ChannelMember } from "@/types";

const FE_VERSION = "0.3.0";

export default function Sidebar() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const createChannel = useChatStore((s) => s.createChannel);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [newChannelName, setNewChannelName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDMDialog, setShowDMDialog] = useState(false);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});

  // Fetch display names for DM channels
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const dmChannels = channels.filter((c) => c.is_dm);
    dmChannels.forEach(async (ch) => {
      // Skip if already resolved
      if (dmNames[ch.id]) return;
      try {
        const members = await api.get<ChannelMember[]>(
          `/channels/${ch.id}/members`
        );
        if (cancelled) return;
        const other = members.find((m) => m.user_id !== user.id);
        if (other) {
          const displayName = other.is_local
            ? String(other.username)
            : `${other.username}@${other.server_domain}`;
          setDmNames((prev) => ({ ...prev, [ch.id]: displayName }));
        }
      } catch {
        // ignore
      }
    });

    return () => { cancelled = true; };
  }, [channels, user]);

  const handleCreate = async () => {
    if (!newChannelName.trim()) return;
    const channel = await createChannel(newChannelName.trim());
    setNewChannelName("");
    setShowCreate(false);
    setActiveChannel(channel.id);
  };

  return (
    <div className="w-64 bg-gray-900 flex flex-col border-r border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">d3chat</h1>
        {user && (
          <p className="text-sm text-gray-400 truncate">{user.username}</p>
        )}
      </div>

      <div className="p-3 border-b border-gray-800 space-y-2">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-full py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          + New Channel
        </button>
        <button
          onClick={() => setShowDMDialog(true)}
          className="w-full py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          + New DM
        </button>
        {showCreate && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Channel name"
              className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => setActiveChannel(channel.id)}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 transition-colors ${
              activeChannelId === channel.id
                ? "bg-gray-800 text-white"
                : "text-gray-400"
            }`}
          >
            <span className="text-gray-500 mr-1">
              {channel.is_dm ? "@" : "#"}
            </span>
            {channel.is_dm
              ? dmNames[channel.id] || "Direct Message"
              : channel.name || "Unnamed"}
            {channel.is_federated && (
              <svg className="w-3 h-3 inline-block ml-1 text-purple-400 shrink-0" fill="currentColor" viewBox="0 0 20 20" title="Federated">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={logout}
          className="w-full py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          Sign Out
        </button>
        <p className="text-[10px] text-gray-600 text-center mt-2">v{FE_VERSION}</p>
      </div>

      {showDMDialog && (
        <NewDMDialog onClose={() => setShowDMDialog(false)} />
      )}
    </div>
  );
}
