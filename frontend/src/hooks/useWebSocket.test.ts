import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";

const mockAddMessage = vi.fn();
const mockUpdateMessage = vi.fn();
const mockRemoveMessage = vi.fn();
const mockSetTyping = vi.fn();

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn().mockImplementation((selector: any) => {
    const state = {
      addMessage: mockAddMessage,
      updateMessage: mockUpdateMessage,
      removeMessage: mockRemoveMessage,
      setTyping: mockSetTyping,
      channels: [],
    };
    return selector(state);
  }),
}));

let subscribedHandler: ((msg: any) => void) | null = null;

vi.mock("@/api/ws", () => ({
  wsClient: {
    subscribe: vi.fn((handler: any) => {
      subscribedHandler = handler;
      return () => {
        subscribedHandler = null;
      };
    }),
    send: vi.fn(),
  },
}));

vi.mock("@/crypto/encrypt", () => ({
  decryptFromChannel: vi.fn().mockResolvedValue("decrypted"),
  fetchAndStoreSenderKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/crypto/keyStore", () => ({
  cacheMessagePlaintext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/crypto/bootstrap", () => ({
  replenishOneTimeKeys: vi.fn().mockResolvedValue(undefined),
}));

import { useChatStore } from "@/store/chatStore";

describe("useWebSocket", () => {
  beforeEach(() => {
    subscribedHandler = null;
    mockAddMessage.mockClear();
    mockUpdateMessage.mockClear();
    mockRemoveMessage.mockClear();
    mockSetTyping.mockClear();
  });

  it("subscribes to wsClient on mount", () => {
    renderHook(() => useWebSocket());
    expect(subscribedHandler).toBeTruthy();
  });

  it("handles message.new (protocol_version 1)", () => {
    renderHook(() => useWebSocket());
    const msg = {
      type: "message.new",
      message: {
        id: "m1",
        channel_id: "ch1",
        content: "hello",
        protocol_version: 1,
        sender_device_id: null,
      },
    };
    subscribedHandler?.(msg);
    expect(mockAddMessage).toHaveBeenCalledWith(msg.message);
  });

  it("handles message.edit", () => {
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "message.edit",
      message: { id: "m1", channel_id: "ch1", content: "edited", edited_at: "2024-01-01" },
    });
    expect(mockUpdateMessage).toHaveBeenCalledWith("m1", "ch1", "edited", "2024-01-01");
  });

  it("handles message.delete", () => {
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "message.delete",
      message_id: "m1",
      channel_id: "ch1",
    });
    expect(mockRemoveMessage).toHaveBeenCalledWith("m1", "ch1");
  });

  it("handles typing.start", () => {
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "typing.start",
      channel_id: "ch1",
      user_id: "u1",
    });
    expect(mockSetTyping).toHaveBeenCalledWith("ch1", "u1", true);
  });

  it("handles typing.stop", () => {
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "typing.stop",
      channel_id: "ch1",
      user_id: "u1",
    });
    expect(mockSetTyping).toHaveBeenCalledWith("ch1", "u1", false);
  });

  it("handles channel.new by adding to store", () => {
    // Need to mock useChatStore.getState
    vi.mocked(useChatStore as any).getState = vi.fn().mockReturnValue({
      channels: [],
    });
    (useChatStore as any).setState = vi.fn();

    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "channel.new",
      channel: { id: "ch-new", name: "new" },
    });
    // The handler should try to add the channel
  });

  it("handles sender_key.new", async () => {
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "sender_key.new",
      channel_id: "ch1",
    });
    // Should call fetchAndStoreSenderKeys
    const { fetchAndStoreSenderKeys } = await import("@/crypto/encrypt");
    expect(fetchAndStoreSenderKeys).toHaveBeenCalledWith("ch1");
  });

  it("handles keys.low_otp for matching device", async () => {
    localStorage.setItem("device_id", "dev1");
    renderHook(() => useWebSocket());
    subscribedHandler?.({
      type: "keys.low_otp",
      device_id: "dev1",
    });
    const { replenishOneTimeKeys } = await import("@/crypto/bootstrap");
    expect(replenishOneTimeKeys).toHaveBeenCalledWith("dev1");
  });
});
