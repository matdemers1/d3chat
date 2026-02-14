import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import type { Channel } from "@/types";

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/components/chat/NewDMDialog", () => ({
  default: () => <div data-testid="dm-dialog" />,
}));

const mockChannels: Channel[] = [
  { id: "ch1", name: "general", is_dm: false, is_federated: false, encryption_type: "sender_keys", created_by: "u1", created_at: "" },
  { id: "ch2", name: null, is_dm: true, is_federated: false, encryption_type: "x3dh", created_by: "u1", created_at: "" },
  { id: "ch3", name: "federated", is_dm: false, is_federated: true, encryption_type: "sender_keys", created_by: "u1", created_at: "" },
];

describe("Sidebar", () => {
  const mockSetActiveChannel = vi.fn();
  const mockCreateChannel = vi.fn().mockResolvedValue({ id: "new-ch" });
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({
        channels: mockChannels,
        activeChannelId: "ch1",
        setActiveChannel: mockSetActiveChannel,
        createChannel: mockCreateChannel,
      })
    );
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        user: { id: "u1", username: "testuser" },
        logout: mockLogout,
      })
    );
  });

  it("renders channel list", () => {
    render(<Sidebar />);
    expect(screen.getByText("general")).toBeInTheDocument();
  });

  it("renders DM with default name", () => {
    render(<Sidebar />);
    expect(screen.getByText("Direct Message")).toBeInTheDocument();
  });

  it("shows # prefix for channels and @ for DMs", () => {
    render(<Sidebar />);
    const hashes = screen.getAllByText("#");
    const ats = screen.getAllByText("@");
    expect(hashes.length).toBeGreaterThanOrEqual(2);
    expect(ats.length).toBeGreaterThanOrEqual(1);
  });

  it("renders New Channel button", () => {
    render(<Sidebar />);
    expect(screen.getByText("+ New Channel")).toBeInTheDocument();
  });

  it("renders New DM button", () => {
    render(<Sidebar />);
    expect(screen.getByText("+ New DM")).toBeInTheDocument();
  });

  it("renders Sign Out button", () => {
    render(<Sidebar />);
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("calls logout on sign out", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("shows username", () => {
    render(<Sidebar />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("shows new channel input on button click", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("+ New Channel"));
    expect(screen.getByPlaceholderText("Channel name")).toBeInTheDocument();
  });

  it("renders federated icon for federated channels", () => {
    render(<Sidebar />);
    // The federated channel has an SVG with title="Federated"
    const icons = document.querySelectorAll('svg[title="Federated"]');
    expect(icons.length).toBe(1);
  });
});
