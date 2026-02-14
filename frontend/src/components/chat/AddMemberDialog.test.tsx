import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AddMemberDialog from "./AddMemberDialog";
import { useChatStore } from "@/store/chatStore";

vi.mock("@/store/chatStore", () => ({
  useChatStore: vi.fn(),
}));

vi.mock("@/components/users/UserSearch", () => ({
  default: ({ onSelect }: { onSelect: (user: any) => void }) => (
    <button data-testid="mock-search" onClick={() => onSelect({ id: "u2", username: "bob" })}>
      Select User
    </button>
  ),
}));

describe("AddMemberDialog", () => {
  const mockAddMember = vi.fn().mockResolvedValue(undefined);
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({ addMember: mockAddMember })
    );
    mockAddMember.mockClear();
    mockOnClose.mockClear();
  });

  it("renders dialog with title", () => {
    render(<AddMemberDialog channelId="ch1" onClose={mockOnClose} />);
    expect(screen.getByText("Add Member")).toBeInTheDocument();
  });

  it("closes when X is clicked", () => {
    render(<AddMemberDialog channelId="ch1" onClose={mockOnClose} />);
    fireEvent.click(screen.getByText("×"));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("adds member when user is selected", async () => {
    render(<AddMemberDialog channelId="ch1" onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    // Wait for async
    await vi.waitFor(() => {
      expect(mockAddMember).toHaveBeenCalledWith("ch1", "u2");
    });
  });

  it("shows success message after adding", async () => {
    render(<AddMemberDialog channelId="ch1" onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    await vi.waitFor(() => {
      expect(screen.getByText("Added bob")).toBeInTheDocument();
    });
  });

  it("shows error on failure", async () => {
    mockAddMember.mockRejectedValueOnce(new Error("Already a member"));
    render(<AddMemberDialog channelId="ch1" onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    await vi.waitFor(() => {
      expect(screen.getByText("Already a member")).toBeInTheDocument();
    });
  });
});
