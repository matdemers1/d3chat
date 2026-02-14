import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageList from "./MessageList";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import type { Message, ChannelMember } from "@/types";

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const mockMessages: Message[] = [
  {
    id: "m1",
    channel_id: "ch1",
    sender_id: "u1",
    sender_device_id: null,
    content: "Hello world",
    content_type: "text",
    protocol_version: 1,
    edited_at: null,
    created_at: "2024-01-01T12:00:00Z",
  },
  {
    id: "m2",
    channel_id: "ch1",
    sender_id: "u2",
    sender_device_id: "d2",
    content: "Encrypted msg",
    content_type: "text",
    protocol_version: 2,
    edited_at: null,
    created_at: "2024-01-01T12:01:00Z",
  },
];

const mockMembers: ChannelMember[] = [
  { user_id: "u1", username: "alice", server_domain: "local.test", is_local: true, role: "owner", joined_at: "" },
  { user_id: "u2", username: "bob", server_domain: "remote.test", is_local: false, role: "member", joined_at: "" },
];

function setupMockStore(
  messages: Message[] = mockMessages,
  members: ChannelMember[] | undefined = mockMembers,
  hasMore = false
) {
  vi.mocked(useChatStore).mockImplementation((selector: any) =>
    selector({
      messages: { ch1: messages },
      hasMore: { ch1: hasMore },
      members: { ch1: members },
      loadMoreMessages: vi.fn(),
      loadMembers: vi.fn(),
    })
  );
  vi.mocked(useAuthStore).mockImplementation((selector: any) =>
    selector({ user: { id: "u1", username: "alice" } })
  );
}

describe("MessageList", () => {
  it("renders messages", () => {
    setupMockStore();
    render(<MessageList channelId="ch1" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Encrypted msg")).toBeInTheDocument();
  });

  it("shows sender name for local user", () => {
    setupMockStore();
    render(<MessageList channelId="ch1" />);
    // bob is remote, so should show "bob@remote.test"
    expect(screen.getByText("bob@remote.test")).toBeInTheDocument();
  });

  it("shows Load older messages when hasMore is true", () => {
    setupMockStore(mockMessages, mockMembers, true);
    render(<MessageList channelId="ch1" />);
    expect(screen.getByText("Load older messages")).toBeInTheDocument();
  });

  it("shows empty state when no messages", () => {
    setupMockStore([], mockMembers);
    render(<MessageList channelId="ch1" />);
    expect(screen.getByText("No messages yet. Start the conversation!")).toBeInTheDocument();
  });
});
