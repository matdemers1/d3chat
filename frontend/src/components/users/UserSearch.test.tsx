import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSearch from "./UserSearch";

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/api/client";

describe("UserSearch", () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
    localStorage.setItem("user_id", "current-user");
  });

  it("renders search input", () => {
    render(<UserSearch onSelect={mockOnSelect} />);
    expect(screen.getByPlaceholderText("Search users or enter user@server...")).toBeInTheDocument();
  });

  it("searches locally for non-federated query", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "u1", username: "alice", server_domain: "local.test", is_local: true },
    ]);

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(screen.getByPlaceholderText("Search users or enter user@server..."), "ali");

    await vi.waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/users/search?q=ali"));
    });
  });

  it("does federated lookup for user@server format", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce({
      id: "u2",
      username: "bob",
      server_domain: "remote.test",
      is_local: false,
    });

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(
      screen.getByPlaceholderText("Search users or enter user@server..."),
      "bob@remote.test"
    );

    await vi.waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/users/lookup?identity=bob%40remote.test")
      );
    });
  });

  it("shows 'remote' badge for non-local users", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "u2", username: "bob", server_domain: "remote.test", is_local: false },
    ]);

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(screen.getByPlaceholderText("Search users or enter user@server..."), "bo");

    await vi.waitFor(() => {
      expect(screen.getByText("remote")).toBeInTheDocument();
    });
  });

  it("shows 'No users found' for empty results", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([]);

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(screen.getByPlaceholderText("Search users or enter user@server..."), "xyz");

    await vi.waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });
  });

  it("filters out current user from results", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "current-user", username: "me", server_domain: "local.test", is_local: true },
      { id: "other", username: "other", server_domain: "local.test", is_local: true },
    ]);

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(screen.getByPlaceholderText("Search users or enter user@server..."), "me");

    await vi.waitFor(() => {
      expect(screen.queryByText("me")).not.toBeInTheDocument();
      expect(screen.getByText("other")).toBeInTheDocument();
    });
  });

  it("calls onSelect when user is clicked", async () => {
    const user = userEvent.setup();
    const mockUser = { id: "u1", username: "alice", server_domain: "local.test", is_local: true };
    vi.mocked(api.get).mockResolvedValue([mockUser]);

    render(<UserSearch onSelect={mockOnSelect} />);
    await user.type(screen.getByPlaceholderText("Search users or enter user@server..."), "ali");

    await vi.waitFor(() => screen.getByText("alice"));
    await user.click(screen.getByText("alice"));
    expect(mockOnSelect).toHaveBeenCalledWith(mockUser);
  });
});
