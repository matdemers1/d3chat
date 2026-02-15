import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useChatStore } from "@/store/chatStore";
import { wsClient } from "@/api/ws";

interface Props {
  channelId: string;
}

export default function MessageInput({ channelId }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sending) return;
    const text = content.trim();
    setContent("");
    setSending(true);
    try {
      await sendMessage(channelId, text);
    } catch {
      // Error is surfaced via chatStore.error / toast
      setContent(text); // Restore content so user can retry
    } finally {
      setSending(false);
    }
    wsClient.send({ type: "typing.stop", channel_id: channelId });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (value: string) => {
    setContent(value);
    if (value) {
      wsClient.send({ type: "typing.start", channel_id: channelId });
    } else {
      wsClient.send({ type: "typing.stop", channel_id: channelId });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 border-t border-gray-800 bg-gray-900 shrink-0"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          className="px-4 py-2 bg-brand hover:brightness-90 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </form>
  );
}
