import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import type { ChannelMember } from "@/types";

interface Props {
  channelId: string;
}

const EMPTY_MESSAGES: import("@/types").Message[] = [];

function getSenderDisplay(
  senderId: string | null,
  members: ChannelMember[] | undefined
): string {
  if (!senderId) return "Unknown";
  if (!members) return senderId.slice(0, 8);
  const member = members.find((m) => m.user_id === senderId);
  if (!member) return senderId.slice(0, 8);
  if (!member.is_local) {
    return `${member.username}@${member.server_domain}`;
  }
  return member.username;
}

export default function MessageList({ channelId }: Props) {
  const messages = useChatStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const hasMore = useChatStore((s) => s.hasMore[channelId] ?? true);
  const members = useChatStore((s) => s.members[channelId]);
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);
  const loadMembers = useChatStore((s) => s.loadMembers);
  const user = useAuthStore((s) => s.user);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Ensure members are loaded for sender name resolution
  useEffect(() => {
    if (!members) {
      loadMembers(channelId);
    }
  }, [channelId, members, loadMembers]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      {hasMore && messages.length > 0 && (
        <button
          onClick={() => loadMoreMessages(channelId)}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Load older messages
        </button>
      )}
      {messages.length === 0 && (
        <div className="text-center text-gray-600 mt-8">
          No messages yet. Start the conversation!
        </div>
      )}
      {messages.map((msg) => {
        const isOwn = msg.sender_id === user?.id;
        const isEncrypted = msg.protocol_version === 2;
        const isDecryptionFailure = msg.content === "[Unable to decrypt]";
        return (
          <div key={msg.id} className={`flex mb-3 ${isOwn ? "justify-end" : ""}`}>
            <div
              className={`max-w-[70%] px-3 py-2 rounded-lg ${
                isDecryptionFailure
                  ? "bg-red-900/30 text-red-300 border border-red-800"
                  : isOwn
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-100"
              }`}
            >
              {!isOwn && (
                <div className="text-xs text-gray-400 mb-1">
                  {getSenderDisplay(msg.sender_id, members)}
                </div>
              )}
              <p className="text-sm break-words">
                {isDecryptionFailure ? (
                  <span className="italic">{msg.content}</span>
                ) : (
                  msg.content
                )}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {isEncrypted && !isDecryptionFailure && (
                  <svg
                    className="w-3 h-3 opacity-50"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span className="text-[10px] opacity-50">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {msg.edited_at && (
                  <span className="text-[10px] opacity-50">(edited)</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
