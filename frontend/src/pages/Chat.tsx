import { useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Sidebar from "@/components/layout/Sidebar";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import ChannelHeader from "@/components/chat/ChannelHeader";
import { useUiStore } from "@/store/uiStore";

function ErrorToast() {
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-900 border border-red-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-2">
      <span className="flex-1 text-sm">{error}</span>
      <button
        onClick={clearError}
        className="text-red-300 hover:text-white shrink-0"
      >
        &times;
      </button>
    </div>
  );
}

export default function ChatPage() {
  const loadChannels = useChatStore((s) => s.loadChannels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  useWebSocket();

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="h-screen flex bg-gray-950 text-white">
      {sidebarOpen && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            <ChannelHeader channel={activeChannel} />
            <MessageList channelId={activeChannel.id} />
            <MessageInput channelId={activeChannel.id} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a channel to start chatting
          </div>
        )}
      </div>
      <ErrorToast />
    </div>
  );
}
