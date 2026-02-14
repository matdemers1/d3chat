import { useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Sidebar from "@/components/layout/Sidebar";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import ChannelHeader from "@/components/chat/ChannelHeader";
import { useUiStore } from "@/store/uiStore";

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
    </div>
  );
}
