import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatPage from "./Chat";

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn().mockImplementation((selector: any) =>
    selector({
      loadChannels: vi.fn(),
      activeChannelId: null,
      channels: [],
    })
  ),
}));

vi.mock("@/store/uiStore", () => ({
  useUiStore: vi.fn().mockImplementation((selector: any) =>
    selector({ sidebarOpen: true })
  ),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(),
}));

vi.mock("@/components/layout/Sidebar", () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("@/components/chat/MessageList", () => ({
  default: () => <div data-testid="message-list">Messages</div>,
}));

vi.mock("@/components/chat/MessageInput", () => ({
  default: () => <div data-testid="message-input">Input</div>,
}));

vi.mock("@/components/chat/ChannelHeader", () => ({
  default: () => <div data-testid="channel-header">Header</div>,
}));

import { useChatStore } from "@/store/chatStore";

describe("ChatPage", () => {
  beforeEach(() => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({
        loadChannels: vi.fn(),
        activeChannelId: null,
        channels: [],
      })
    );
  });

  it("renders sidebar", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("shows select channel message when no channel active", () => {
    render(<ChatPage />);
    expect(screen.getByText("Select a channel to start chatting")).toBeInTheDocument();
  });

  it("renders message area when channel is active", () => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({
        loadChannels: vi.fn(),
        activeChannelId: "ch1",
        channels: [{ id: "ch1", name: "general" }],
      })
    );
    render(<ChatPage />);
    expect(screen.getByTestId("channel-header")).toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByTestId("message-input")).toBeInTheDocument();
  });
});
