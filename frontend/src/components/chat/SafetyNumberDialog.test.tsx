import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SafetyNumberDialog from "./SafetyNumberDialog";

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("@/crypto/safetyNumbers", () => ({
  generateSafetyNumber: vi.fn().mockResolvedValue(
    "12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890"
  ),
}));

import { api } from "@/api/client";

describe("SafetyNumberDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it("renders loading state initially", () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {})); // never resolves
    render(<SafetyNumberDialog channelId="ch1" onClose={onClose} />);
    expect(screen.getByText("Generating safety number...")).toBeInTheDocument();
  });

  it("renders security verification title", () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    render(<SafetyNumberDialog channelId="ch1" onClose={onClose} />);
    expect(screen.getByText("Security Verification")).toBeInTheDocument();
  });

  it("renders safety number when loaded", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([
        { user_id: "u1", username: "a" },
        { user_id: "u2", username: "b" },
      ])
      .mockResolvedValueOnce([{ identity_key: "key-a" }])
      .mockResolvedValueOnce([{ identity_key: "key-b" }]);

    render(<SafetyNumberDialog channelId="ch1" onClose={onClose} />);

    await vi.waitFor(() => {
      expect(screen.getByText(/Compare this number/)).toBeInTheDocument();
    });
  });

  it("shows error for non-DM channels", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { user_id: "u1" },
      { user_id: "u2" },
      { user_id: "u3" },
    ]);

    render(<SafetyNumberDialog channelId="ch1" onClose={onClose} />);

    await vi.waitFor(() => {
      expect(screen.getByText("Safety numbers are only available for DMs")).toBeInTheDocument();
    });
  });
});
