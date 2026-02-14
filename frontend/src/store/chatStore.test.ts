import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "./chatStore";

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/api/ws", () => ({
  wsClient: {
    send: vi.fn(),
  },
}));

vi.mock("@/crypto/encrypt", () => ({
  encryptForChannel: vi.fn().mockResolvedValue("encrypted"),
  decryptFromChannel: vi.fn().mockResolvedValue("decrypted"),
  fetchAndStoreSenderKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/crypto/keyStore", () => ({
  cacheMessagePlaintext: vi.fn().mockResolvedValue(undefined),
  getCachedPlaintext: vi.fn().mockResolvedValue(undefined),
}));

import { api } from "@/api/client";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      channels: [],
      activeChannelId: null,
      messages: {},
      members: {},
      hasMore: {},
      typingUsers: {},
    });
  });

  it("loadChannels fetches and sets channels", async () => {
    const channels = [{ id: "ch1", name: "general" }];
    vi.mocked(api.get).mockResolvedValueOnce(channels);

    await useChatStore.getState().loadChannels();

    expect(useChatStore.getState().channels).toEqual(channels);
  });

  it("setActiveChannel sets the active id", () => {
    useChatStore.setState({ messages: { ch1: [] } });
    useChatStore.getState().setActiveChannel("ch1");
    expect(useChatStore.getState().activeChannelId).toBe("ch1");
  });

  it("setActiveChannel triggers loadMessages if none cached", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ messages: [], has_more: false });

    useChatStore.getState().setActiveChannel("ch2");

    expect(useChatStore.getState().activeChannelId).toBe("ch2");
  });

  it("loadMessages fetches and sets messages", async () => {
    const msgs = [
      { id: "m1", channel_id: "ch1", content: "hello", protocol_version: 1 },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ messages: msgs, has_more: false });

    await useChatStore.getState().loadMessages("ch1");

    expect(useChatStore.getState().messages["ch1"]).toHaveLength(1);
    expect(useChatStore.getState().hasMore["ch1"]).toBe(false);
  });

  it("sendMessage posts to api", async () => {
    useChatStore.setState({
      channels: [{ id: "ch1", name: "test", encryption_type: "sender_keys" } as any],
    });
    localStorage.setItem("device_id", "dev1");

    vi.mocked(api.post).mockResolvedValueOnce({
      id: "m1",
      channel_id: "ch1",
      content: "encrypted",
    });

    await useChatStore.getState().sendMessage("ch1", "hello");

    expect(api.post).toHaveBeenCalled();
  });

  it("createChannel posts and adds to store", async () => {
    const newChannel = { id: "ch-new", name: "new-channel" };
    vi.mocked(api.post).mockResolvedValueOnce(newChannel);

    const result = await useChatStore.getState().createChannel("new-channel");

    expect(result).toEqual(newChannel);
    expect(useChatStore.getState().channels).toHaveLength(1);
  });

  it("createDM posts and adds to store", async () => {
    const dm = { id: "dm1", name: null, is_dm: true };
    vi.mocked(api.post).mockResolvedValueOnce(dm);

    const result = await useChatStore.getState().createDM("user2");

    expect(result).toEqual(dm);
    expect(useChatStore.getState().channels).toContainEqual(dm);
  });

  it("addMember calls api and reloads members", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(undefined);
    vi.mocked(api.get).mockResolvedValueOnce([{ user_id: "u1" }, { user_id: "u2" }]);

    await useChatStore.getState().addMember("ch1", "u2");

    expect(api.post).toHaveBeenCalledWith("/channels/ch1/members", { user_id: "u2" });
  });

  it("addMessage adds to correct channel", () => {
    const msg = { id: "m1", channel_id: "ch1", content: "hi" } as any;
    useChatStore.getState().addMessage(msg);
    expect(useChatStore.getState().messages["ch1"]).toHaveLength(1);
  });

  it("addMessage deduplicates by id", () => {
    const msg = { id: "m1", channel_id: "ch1", content: "hi" } as any;
    useChatStore.getState().addMessage(msg);
    useChatStore.getState().addMessage(msg);
    expect(useChatStore.getState().messages["ch1"]).toHaveLength(1);
  });

  it("updateMessage updates content and edited_at", () => {
    const msg = { id: "m1", channel_id: "ch1", content: "old", edited_at: null } as any;
    useChatStore.setState({ messages: { ch1: [msg] } });

    useChatStore.getState().updateMessage("m1", "ch1", "new", "2024-01-01");

    const updated = useChatStore.getState().messages["ch1"]![0];
    expect(updated?.content).toBe("new");
    expect(updated?.edited_at).toBe("2024-01-01");
  });

  it("removeMessage filters out the message", () => {
    useChatStore.setState({
      messages: {
        ch1: [
          { id: "m1", channel_id: "ch1", content: "a" } as any,
          { id: "m2", channel_id: "ch1", content: "b" } as any,
        ],
      },
    });

    useChatStore.getState().removeMessage("m1", "ch1");

    expect(useChatStore.getState().messages["ch1"]).toHaveLength(1);
    expect(useChatStore.getState().messages["ch1"]![0]?.id).toBe("m2");
  });

  it("setTyping adds and removes typing users", () => {
    useChatStore.getState().setTyping("ch1", "u1", true);
    expect(useChatStore.getState().typingUsers["ch1"]?.has("u1")).toBe(true);

    useChatStore.getState().setTyping("ch1", "u1", false);
    expect(useChatStore.getState().typingUsers["ch1"]?.has("u1")).toBe(false);
  });
});
