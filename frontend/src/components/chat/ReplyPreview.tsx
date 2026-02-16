import { useChatStore } from "@/store/chatStore";
import type { ChannelMember } from "@/types";

function getSenderName(
  senderId: string | null,
  members: ChannelMember[] | undefined
): string {
  if (!senderId || !members) return "Unknown";
  const member = members.find((m) => m.user_id === senderId);
  if (!member) return senderId.slice(0, 8);
  return member.display_name || member.username;
}

export default function ReplyPreview() {
  const replyingTo = useChatStore((s) => s.replyingTo);
  const clearReplyingTo = useChatStore((s) => s.clearReplyingTo);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const members = useChatStore((s) =>
    activeChannelId ? s.members[activeChannelId] : undefined
  );

  if (!replyingTo) return null;

  const senderName = getSenderName(replyingTo.sender_id, members);
  const preview =
    replyingTo.content.length > 100
      ? replyingTo.content.slice(0, 100) + "..."
      : replyingTo.content;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700 text-sm text-gray-300">
      <div className="flex-1 min-w-0 truncate">
        <span className="text-gray-400">Replying to </span>
        <span className="text-white font-medium">@{senderName}</span>
        <span className="text-gray-500">: {preview}</span>
      </div>
      <button
        onClick={clearReplyingTo}
        className="shrink-0 p-1 text-gray-500 hover:text-white transition-colors"
        aria-label="Cancel reply"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
