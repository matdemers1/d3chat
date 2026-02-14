import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./Login";

const mockLogin = vi.fn().mockResolvedValue(undefined);
const mockNavigate = vi.fn();

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn().mockImplementation((selector: any) =>
    selector({
      login: mockLogin,
      error: null,
      isLoading: false,
    })
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { useAuthStore } from "@/store/authStore";

function getInputs() {
  const usernameInput = screen.getByRole("textbox");
  const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  return { usernameInput, passwordInput };
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockLogin.mockClear();
    mockNavigate.mockClear();
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        login: mockLogin,
        error: null,
        isLoading: false,
      })
    );
  });

  it("renders login form", () => {
    render(<LoginPage />);
    expect(screen.getByText("Sign in to d3chat")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("renders register link", () => {
    render(<LoginPage />);
    expect(screen.getByText("Register")).toBeInTheDocument();
  });

  it("submits with username and password", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const { usernameInput, passwordInput } = getInputs();
    await user.type(usernameInput, "testuser");
    await user.type(passwordInput, "password123");
    await user.click(screen.getByText("Sign In"));
    expect(mockLogin).toHaveBeenCalledWith("testuser", "password123");
  });

  it("navigates to / on successful login", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const { usernameInput, passwordInput } = getInputs();
    await user.type(usernameInput, "testuser");
    await user.type(passwordInput, "password123");
    await user.click(screen.getByText("Sign In"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows error when present", () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        login: mockLogin,
        error: "Invalid credentials",
        isLoading: false,
      })
    );
    render(<LoginPage />);
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        login: mockLogin,
        error: null,
        isLoading: true,
      })
    );
    render(<LoginPage />);
    expect(screen.getByText("Signing in...")).toBeInTheDocument();
  });
});
