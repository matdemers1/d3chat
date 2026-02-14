import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "./Register";

const mockRegister = vi.fn().mockResolvedValue(undefined);
const mockNavigate = vi.fn();

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn().mockImplementation((selector: any) =>
    selector({
      register: mockRegister,
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
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  return {
    usernameInput,
    passwordInput: passwordInputs[0] as HTMLInputElement,
    confirmPasswordInput: passwordInputs[1] as HTMLInputElement,
  };
}

describe("RegisterPage", () => {
  beforeEach(() => {
    mockRegister.mockClear();
    mockNavigate.mockClear();
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        register: mockRegister,
        error: null,
        isLoading: false,
      })
    );
  });

  it("renders registration form", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Create a d3chat account")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByText("Create Account")).toBeInTheDocument();
  });

  it("shows encryption warning", () => {
    render(<RegisterPage />);
    expect(screen.getByText(/encryption keys are stored only on this device/i)).toBeInTheDocument();
  });

  it("shows sign in link", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("submits form with matching passwords", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    const { usernameInput, passwordInput, confirmPasswordInput } = getInputs();
    await user.type(usernameInput, "newuser");
    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "password123");
    await user.click(screen.getByText("Create Account"));
    expect(mockRegister).toHaveBeenCalledWith("newuser", "password123");
  });

  it("shows error when passwords don't match", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    const { usernameInput, passwordInput, confirmPasswordInput } = getInputs();
    await user.type(usernameInput, "newuser");
    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "different");
    await user.click(screen.getByText("Create Account"));
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("navigates to / on success", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    const { usernameInput, passwordInput, confirmPasswordInput } = getInputs();
    await user.type(usernameInput, "newuser");
    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "password123");
    await user.click(screen.getByText("Create Account"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows loading state", () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        register: mockRegister,
        error: null,
        isLoading: true,
      })
    );
    render(<RegisterPage />);
    expect(screen.getByText("Creating account...")).toBeInTheDocument();
  });
});
