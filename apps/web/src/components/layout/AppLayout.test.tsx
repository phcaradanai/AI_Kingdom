import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

const { clearSessionMock, getNextActionsMock, logoutMock, refreshMock } = vi.hoisted(() => ({
  clearSessionMock: vi.fn(),
  getNextActionsMock: vi.fn(),
  logoutMock: vi.fn(),
  refreshMock: vi.fn()
}));

vi.mock("@/lib/api", () => ({
  api: {
    getNextActions: getNextActionsMock
  }
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { id: "king-1", email: "king@example.test", displayName: "The King", role: "KING" },
    logout: logoutMock,
    clearSession: clearSessionMock
  })
}));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: unknown) => unknown) => selector({
    refresh: refreshMock,
    settings: []
  })
}));

function renderLayout(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
          <Route path="/inbox" element={<div>Inbox content</div>} />
          <Route path="/throne-room" element={<div>Throne Room content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  refreshMock.mockResolvedValue(undefined);
  getNextActionsMock.mockResolvedValue({ summary: { criticalCount: 1, highCount: 2 } });
  logoutMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.body.style.overflow = "";
});

describe("AppLayout navigation", () => {
  it("keeps the current domain open and lets other domains expand", async () => {
    renderLayout();

    expect(screen.getByRole("button", { name: "Mission Control navigation" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Command navigation" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Command navigation" }));
    expect(screen.getByRole("button", { name: "Command navigation" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Throne Room" })).toHaveAttribute("href", "/throne-room");

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  });

  it("opens and closes the mobile navigation drawer without a horizontal route strip", () => {
    renderLayout("/inbox");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Application navigation" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    const closeButtons = screen.getAllByRole("button", { name: "Close navigation" });
    fireEvent.click(closeButtons.at(-1)!);
    expect(screen.queryByRole("dialog", { name: "Application navigation" })).not.toBeInTheDocument();
  });
});
