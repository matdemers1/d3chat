import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import Avatar from "@/components/common/Avatar";
import UserProfileCard from "@/components/users/UserProfileCard";
import AttachmentPreview from "./AttachmentPreview";
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
  if (member.display_name) return member.display_name;
  if (!member.is_local) {
    return `${member.username}@${member.server_domain}`;
  }
  return member.username;
}

function getSenderAvatar(
  senderId: string | null,
  members: ChannelMember[] | undefined
): { src: string | null; name: string } {
  if (!senderId || !members) return { src: null, name: "?" };
  const member = members.find((m) => m.user_id === senderId);
  if (!member) return { src: null, name: senderId.slice(0, 2) };
  return {
    src: member.avatar_url ?? null,
    name: member.display_name || member.username,
  };
}

export default function MessageList({ channelId }: Props) {
  const messages = useChatStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const hasMore = useChatStore((s) => s.hasMore[channelId] ?? true);
  const members = useChatStore((s) => s.members[channelId]);
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);
  const loadMembers = useChatStore((s) => s.loadMembers);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const user = useAuthStore((s) => s.user);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Ensure members are loaded for sender name resolution
  useEffect(() => {
    if (!members) {
      loadMembers(channelId);
    }
  }, [channelId, members, loadMembers]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    setTimeout(() => setHighlightedId(null), 1500);
  }, []);

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
        const senderName = getSenderDisplay(msg.sender_id, members);
        const avatar = getSenderAvatar(msg.sender_id, members);
        return (
          <div
            key={msg.id}
            ref={(el) => { messageRefs.current[msg.id] = el; }}
            className={`group flex mb-3 ${isOwn ? "justify-end" : ""} ${
              highlightedId === msg.id ? "animate-pulse bg-blue-900/20 rounded-lg" : ""
            }`}
          >
            {!isOwn && (
              <div className="mr-2 mt-1 shrink-0">
                <Avatar
                  src={avatar.src}
                  name={avatar.name}
                  size="sm"
                  onClick={msg.sender_id ? () => setProfileUserId(msg.sender_id) : undefined}
                />
              </div>
            )}
            <div className="flex flex-col max-w-[70%]">
              {/* Reply snippet */}
              {msg.reply_to_id && (
                <button
                  onClick={() => msg.reply_to ? scrollToMessage(msg.reply_to.id) : undefined}
                  className={`text-left text-xs px-2 py-1 mb-1 rounded border-l-2 border-gray-600 bg-gray-800/50 text-gray-400 truncate ${
                    msg.reply_to ? "hover:bg-gray-700/50 cursor-pointer" : "cursor-default"
                  }`}
                >
                  {msg.reply_to ? (
                    <>
                      <span className="font-medium text-gray-300">
                        {getSenderDisplay(msg.reply_to.sender_id, members)}
                      </span>
                      <span className="ml-1">
                        {msg.reply_to.content.length > 60
                          ? msg.reply_to.content.slice(0, 60) + "..."
                          : msg.reply_to.content}
                      </span>
                    </>
                  ) : (
                    <span className="italic">Original message was deleted</span>
                  )}
                </button>
              )}
              <div
                className={`px-3 py-2 rounded-lg ${
                  isDecryptionFailure
                    ? "bg-red-900/30 text-red-300 border border-red-800"
                    : isOwn
                      ? "bg-brand text-white"
                      : "bg-gray-800 text-gray-100"
                }`}
              >
                {!isOwn && (
                  <button
                    className="text-xs text-gray-400 mb-1 hover:text-white transition-colors text-left"
                    onClick={() => msg.sender_id && setProfileUserId(msg.sender_id)}
                  >
                    {senderName}
                  </button>
                )}
                <p className="text-sm break-words">
                  {isDecryptionFailure ? (
                    <span className="italic">{msg.content}</span>
                  ) : (
                    msg.content
                  )}
                </p>
                {msg.attachments?.length > 0 && (
                  <AttachmentPreview attachments={msg.attachments} />
                )}
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
            {/* Reply hover action */}
            <button
              onClick={() => setReplyingTo(msg)}
              className="self-center ml-1 p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity"
              title="Reply"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v3M3 10l6-6M3 10l6 6" />
              </svg>
            </button>
          </div>
        );
      })}
      <div ref={bottomRef} />
      {profileUserId && (
        <UserProfileCard
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}
