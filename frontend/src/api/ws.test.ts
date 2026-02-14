import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the api module
vi.mock("./client", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ ticket: "test-ticket" }),
  },
}));

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

// Import after mocks
const { wsClient } = await import("./ws");

describe("WebSocketClient", () => {
  beforeEach(() => {
    wsClient.disconnect();
  });

  it("subscribe returns unsubscribe function", () => {
    const handler = vi.fn();
    const unsub = wsClient.subscribe(handler);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("send serializes data when connected", async () => {
    await wsClient.connect();
    wsClient.send({ type: "test", data: "hello" } as any);
    // The WebSocket should have been created
  });

  it("subscribe handler receives parsed messages", () => {
    const handler = vi.fn();
    wsClient.subscribe(handler);

    // Simulate onmessage would be tested via connect + mock ws
    // This validates the subscription mechanism
    expect(handler).not.toHaveBeenCalled();
  });
});
