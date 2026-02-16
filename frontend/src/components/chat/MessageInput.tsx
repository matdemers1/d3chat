import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { useChatStore } from "@/store/chatStore";
import { wsClient } from "@/api/ws";
import ReplyPreview from "./ReplyPreview";
import FileUploadButton from "./FileUploadButton";
import type { Attachment } from "@/types";

const TYPING_THROTTLE_MS = 2000;

interface Props {
  channelId: string;
}

export default function MessageInput({ channelId }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const lastTypingSentRef = useRef(0);

  const sendTypingStart = useCallback((chId: string) => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    wsClient.send({ type: "typing.start", channel_id: chId });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const hasContent = content.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasContent && !hasAttachments) || sending) return;

    const text = hasContent ? content.trim() : " ";
    const attachmentIds = pendingAttachments.map((a) => a.id);
    setContent("");
    setPendingAttachments([]);
    setSending(true);
    try {
      await sendMessage(channelId, text, attachmentIds);
    } catch {
      setContent(text === " " ? "" : text);
      setPendingAttachments(pendingAttachments);
    } finally {
      setSending(false);
    }
    lastTypingSentRef.current = 0;
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
      sendTypingStart(channelId);
    } else {
      lastTypingSentRef.current = 0;
      wsClient.send({ type: "typing.stop", channel_id: channelId });
    }
  };

  const handleFileUploaded = (attachment: Attachment) => {
    setPendingAttachments((prev) => [...prev, attachment]);
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="shrink-0">
      <ReplyPreview />
      {pendingAttachments.length > 0 && (
        <div className="flex gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm text-gray-300"
            >
              <span className="truncate max-w-[120px]">{att.filename}</span>
              <button
                onClick={() => removePendingAttachment(att.id)}
                className="text-gray-500 hover:text-white ml-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-800 bg-gray-900"
      >
        <div className="relative flex items-center gap-2">
          <FileUploadButton channelId={channelId} onUploaded={handleFileUploaded} />
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
            disabled={(!content.trim() && pendingAttachments.length === 0) || sending}
            className="px-4 py-2 bg-brand hover:brightness-90 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
