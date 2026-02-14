import { create } from "zustand";
import { api } from "@/api/client";
import { wsClient } from "@/api/ws";
import {
  encryptForChannel,
  decryptFromChannel,
  fetchAndStoreSenderKeys,
} from "@/crypto/encrypt";
import { cacheMessagePlaintext, getCachedPlaintext } from "@/crypto/keyStore";
import type { Channel, Message, MessagePage, ChannelMember, WsMessage } from "@/types";

interface ChatState {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  members: Record<string, ChannelMember[]>;
  hasMore: Record<string, boolean>;
  typingUsers: Record<string, Set<string>>;
  loadChannels: () => Promise<void>;
  setActiveChannel: (id: string) => void;
  loadMessages: (channelId: string) => Promise<void>;
  loadMoreMessages: (channelId: string) => Promise<void>;
  loadMembers: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string) => Promise<void>;
  createChannel: (name: string) => Promise<Channel>;
  createDM: (userId: string) => Promise<Channel>;
  joinChannel: (channelId: string) => Promise<void>;
  addMember: (channelId: string, userId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (
    messageId: string,
    channelId: string,
    content: string,
    editedAt: string
  ) => void;
  removeMessage: (messageId: string, channelId: string) => void;
  setTyping: (
    channelId: string,
    userId: string,
    isTyping: boolean
  ) => void;
}

function getDeviceId(): string | null {
  return localStorage.getItem("device_id");
}

function getChannel(channels: Channel[], channelId: string): Channel | undefined {
  return channels.find((c) => c.id === channelId);
}

async function decryptMessage(
  msg: Message,
  channel: Channel | undefined
): Promise<Message> {
  if (msg.protocol_version !== 2 || !channel) return msg;

  // Check plaintext cache first (handles re-decryption after page reload)
  const cached = await getCachedPlaintext(msg.id);
  if (cached !== undefined) {
    return { ...msg, content: cached };
  }

  try {
    const plaintext = await decryptFromChannel(
      msg.channel_id,
      channel.encryption_type,
      msg.content,
      msg.sender_device_id
    );
    // Cache for future loads
    await cacheMessagePlaintext(msg.id, plaintext);
    return { ...msg, content: plaintext };
  } catch {
    return { ...msg, content: "[Unable to decrypt]" };
  }
}

async function decryptMessages(
  messages: Message[],
  channel: Channel | undefined
): Promise<Message[]> {
  // Must be sequential — each sender key decryption ratchets the chain key
  const results: Message[] = [];
  for (const m of messages) {
    results.push(await decryptMessage(m, channel));
  }
  return results;
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  members: {},
  hasMore: {},
  typingUsers: {},

  loadChannels: async () => {
    const channels = await api.get<Channel[]>("/channels");
    set({ channels });
  },

  setActiveChannel: (id) => {
    set({ activeChannelId: id });
    const { messages } = get();
    if (!messages[id]) {
      get().loadMessages(id);
    }
  },

  loadMessages: async (channelId) => {
    const data = await api.get<MessagePage>(
      `/channels/${channelId}/messages`
    );

    const channel = getChannel(get().channels, channelId);

    // Fetch sender keys for group channels before decrypting
    if (channel && channel.encryption_type === "sender_keys") {
      await fetchAndStoreSenderKeys(channelId).catch(console.error);
    }

    const decrypted = await decryptMessages(data.messages, channel);

    set((state) => ({
      messages: { ...state.messages, [channelId]: decrypted },
      hasMore: { ...state.hasMore, [channelId]: data.has_more },
    }));
  },

  loadMoreMessages: async (channelId) => {
    const existing = get().messages[channelId];
    if (!existing?.length) return;
    const oldest = existing[0]!;
    const data = await api.get<MessagePage>(
      `/channels/${channelId}/messages?before=${oldest.created_at}`
    );

    const channel = getChannel(get().channels, channelId);
    const decrypted = await decryptMessages(data.messages, channel);

    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [
          ...decrypted,
          ...(state.messages[channelId] || []),
        ],
      },
      hasMore: { ...state.hasMore, [channelId]: data.has_more },
    }));
  },

  loadMembers: async (channelId) => {
    const members = await api.get<ChannelMember[]>(
      `/channels/${channelId}/members`
    );
    set((state) => ({
      members: { ...state.members, [channelId]: members },
    }));
  },

  sendMessage: async (channelId, content) => {
    const deviceId = getDeviceId();
    const channel = getChannel(get().channels, channelId);

    if (channel && deviceId) {
      try {
        const encrypted = await encryptForChannel(
          channelId,
          channel.encryption_type,
          content,
          deviceId
        );
        const msg = await api.post<Message>(`/channels/${channelId}/messages`, {
          content: encrypted,
          protocol_version: 2,
          sender_device_id: deviceId,
        });
        // Add locally with plaintext (the WS echo has ciphertext we can't re-decrypt)
        // Cache so we can show plaintext on page reload
        cacheMessagePlaintext(msg.id, content).catch(console.error);
        get().addMessage({ ...msg, content });
        return;
      } catch (err) {
        console.error("Encryption failed, sending plaintext:", err);
      }
    }

    // Fallback: send plaintext
    const msg = await api.post<Message>(`/channels/${channelId}/messages`, {
      content,
    });
    get().addMessage(msg);
  },

  createChannel: async (name) => {
    const channel = await api.post<Channel>("/channels", { name });
    set((state) => ({ channels: [...state.channels, channel] }));
    return channel;
  },

  createDM: async (userId: string) => {
    const channel = await api.post<Channel>("/channels/dm", {
      user_id: userId,
    });
    // Add to channels list if not already there
    set((state) => {
      if (state.channels.some((c) => c.id === channel.id)) return state;
      return { channels: [...state.channels, channel] };
    });
    // Subscribe our WS connection to the new channel
    wsClient.send({
      type: "subscribe",
      channel_id: channel.id,
    } as WsMessage);
    return channel;
  },

  joinChannel: async (channelId) => {
    await api.post(`/channels/${channelId}/join`);
    await get().loadChannels();
  },

  addMember: async (channelId, userId) => {
    await api.post(`/channels/${channelId}/members`, { user_id: userId });
    await get().loadMembers(channelId);
  },

  addMessage: (message) => {
    set((state) => {
      const existing = state.messages[message.channel_id] || [];
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [message.channel_id]: [...existing, message],
        },
      };
    });
  },

  updateMessage: (messageId, channelId, content, editedAt) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId
              ? { ...m, content, edited_at: editedAt }
              : m
          ),
        },
      };
    });
  },

  removeMessage: (messageId, channelId) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.filter((m) => m.id !== messageId),
        },
      };
    });
  },

  setTyping: (channelId, userId, isTyping) => {
    set((state) => {
      const current = new Set(state.typingUsers[channelId] || []);
      if (isTyping) current.add(userId);
      else current.delete(userId);
      return {
        typingUsers: { ...state.typingUsers, [channelId]: current },
      };
    });
  },
}));
