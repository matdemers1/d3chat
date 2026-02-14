import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChannelHeader from "./ChannelHeader";
import type { Channel } from "@/types";

vi.mock("@/store/uiStore", () => ({
  useUiStore: vi.fn().mockImplementation((selector: any) =>
    selector({ toggleSidebar: vi.fn() })
  ),
}));

vi.mock("./SafetyNumberDialog", () => ({
  default: () => <div data-testid="safety-dialog" />,
}));

vi.mock("./AddMemberDialog", () => ({
  default: () => <div data-testid="add-member-dialog" />,
}));

describe("ChannelHeader", () => {
  const groupChannel: Channel = {
    id: "ch1",
    name: "general",
    is_dm: false,
    is_federated: false,
    encryption_type: "sender_keys",
    created_by: "u1",
    created_at: "2024-01-01",
  };

  const dmChannel: Channel = {
    id: "ch2",
    name: null,
    is_dm: true,
    is_federated: false,
    encryption_type: "x3dh",
    created_by: "u1",
    created_at: "2024-01-01",
  };

  const federatedChannel: Channel = {
    id: "ch3",
    name: "fed-channel",
    is_dm: false,
    is_federated: true,
    encryption_type: "sender_keys",
    created_by: "u1",
    created_at: "2024-01-01",
  };

  it("shows channel name with # prefix", () => {
    render(<ChannelHeader channel={groupChannel} />);
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.getByText("#")).toBeInTheDocument();
  });

  it("shows 'Direct Message' for DM with no name", () => {
    render(<ChannelHeader channel={dmChannel} />);
    expect(screen.getByText("Direct Message")).toBeInTheDocument();
    expect(screen.getByText("@")).toBeInTheDocument();
  });

  it("shows encryption badge", () => {
    render(<ChannelHeader channel={groupChannel} />);
    expect(screen.getByText("Encrypted")).toBeInTheDocument();
  });

  it("shows 'End-to-end encrypted' for x3dh", () => {
    render(<ChannelHeader channel={dmChannel} />);
    expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();
  });

  it("shows Federated badge for federated channels", () => {
    render(<ChannelHeader channel={federatedChannel} />);
    expect(screen.getByText("Federated")).toBeInTheDocument();
  });

  it("shows Add Member button for group channels", () => {
    render(<ChannelHeader channel={groupChannel} />);
    expect(screen.getByText("Add Member")).toBeInTheDocument();
  });

  it("shows Security button for DMs", () => {
    render(<ChannelHeader channel={dmChannel} />);
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("does not show Add Member for DMs", () => {
    render(<ChannelHeader channel={dmChannel} />);
    expect(screen.queryByText("Add Member")).not.toBeInTheDocument();
  });
});
