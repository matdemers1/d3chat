import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewDMDialog from "./NewDMDialog";
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

describe("NewDMDialog", () => {
  const mockCreateDM = vi.fn().mockResolvedValue({ id: "dm1" });
  const mockSetActiveChannel = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.mocked(useChatStore).mockImplementation((selector: any) =>
      selector({ createDM: mockCreateDM, setActiveChannel: mockSetActiveChannel })
    );
    mockCreateDM.mockClear();
    mockSetActiveChannel.mockClear();
    mockOnClose.mockClear();
  });

  it("renders dialog with title", () => {
    render(<NewDMDialog onClose={mockOnClose} />);
    expect(screen.getByText("New Direct Message")).toBeInTheDocument();
  });

  it("closes when X is clicked", () => {
    render(<NewDMDialog onClose={mockOnClose} />);
    fireEvent.click(screen.getByText("×"));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("creates DM when user is selected", async () => {
    render(<NewDMDialog onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    await vi.waitFor(() => {
      expect(mockCreateDM).toHaveBeenCalledWith("u2");
    });
  });

  it("sets active channel and closes on success", async () => {
    render(<NewDMDialog onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    await vi.waitFor(() => {
      expect(mockSetActiveChannel).toHaveBeenCalledWith("dm1");
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("shows error on failure", async () => {
    mockCreateDM.mockRejectedValueOnce(new Error("Failed to create DM"));
    render(<NewDMDialog onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId("mock-search"));
    await vi.waitFor(() => {
      expect(screen.getByText("Failed to create DM")).toBeInTheDocument();
    });
  });
});
