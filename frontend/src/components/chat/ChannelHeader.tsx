import { useState } from "react";
import type { Channel } from "@/types";
import { useUiStore } from "@/store/uiStore";
import SafetyNumberDialog from "./SafetyNumberDialog";
import AddMemberDialog from "./AddMemberDialog";

interface Props {
  channel: Channel;
}

export default function ChannelHeader({ channel }: Props) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [showSafety, setShowSafety] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  return (
    <div className="h-14 flex items-center px-4 border-b border-gray-800 bg-gray-900 shrink-0">
      <button
        onClick={toggleSidebar}
        className="mr-3 text-gray-400 hover:text-white md:hidden"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="text-gray-500 mr-2 text-lg">
        {channel.is_dm ? "@" : "#"}
      </span>
      <h2 className="font-semibold text-white">
        {channel.name || "Direct Message"}
      </h2>

      <div className="ml-2 flex items-center gap-1 text-xs text-green-400">
        <svg
          className="w-3.5 h-3.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
        <span>
          {channel.encryption_type === "x3dh"
            ? "End-to-end encrypted"
            : "Encrypted"}
        </span>
      </div>

      {channel.is_federated && (
        <div className="ml-2 flex items-center gap-1 text-xs text-purple-400">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
          </svg>
          <span>Federated</span>
        </div>
      )}

      <div className="flex-1" />

      {!channel.is_dm && (
        <button
          onClick={() => setShowAddMember(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
          title="Add member"
        >
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Member
        </button>
      )}

      {channel.is_dm && (
        <button
          onClick={() => setShowSafety(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          Security
        </button>
      )}

      {showSafety && (
        <SafetyNumberDialog
          channelId={channel.id}
          onClose={() => setShowSafety(false)}
        />
      )}

      {showAddMember && (
        <AddMemberDialog
          channelId={channel.id}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  );
}
