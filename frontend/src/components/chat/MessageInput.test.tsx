import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageInput from "./MessageInput";
import { useChatStore } from "@/store/chatStore";

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn(),
}));

vi.mock("@/api/ws", () => ({
  wsClient: {
    send: vi.fn(),
  },
}));

import { wsClient } from "@/api/ws";

describe("MessageInput", () => {
  const mockSendMessage = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({ sendMessage: mockSendMessage })
    );
    mockSendMessage.mockClear();
  });

  it("renders input and send button", () => {
    render(<MessageInput channelId="ch1" />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<MessageInput channelId="ch1" />);
    expect(screen.getByText("Send")).toBeDisabled();
  });

  it("typing in input enables send button", async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch1" />);
    await user.type(screen.getByPlaceholderText("Type a message..."), "hello");
    expect(screen.getByText("Send")).toBeEnabled();
  });

  it("sends typing indicator on input", async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch1" />);
    await user.type(screen.getByPlaceholderText("Type a message..."), "h");
    expect(wsClient.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "typing.start", channel_id: "ch1" })
    );
  });

  it("submits message on enter key", async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch1" />);
    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "hello{Enter}");
    expect(mockSendMessage).toHaveBeenCalledWith("ch1", "hello");
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<MessageInput channelId="ch1" />);
    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "hello{Enter}");
    expect(input).toHaveValue("");
  });
});
