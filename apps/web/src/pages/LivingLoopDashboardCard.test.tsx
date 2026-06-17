import { render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LivingLoopStatusDto } from "@/types/api";
import { LivingLoopDashboardCard, RunLivingLoopButton } from "./DashboardPage";

const mockStatus: LivingLoopStatusDto = {
  enabled: true,
  lastRun: null,
  lastResult: "COMPLETED",
  todayCandidates: 3,
  pendingCandidates: 2,
  highCriticalCandidates: 1,
  runnerIssues: 0,
  providerIssues: 0,
  patchesPendingReview: 1,
  autoValidation: {
    enabled: true,
    dailyCount: 4,
    dailyLimit: 10,
    cooldownMinutes: 60,
    jobsCreatedLastRun: 1,
    validationFailuresNeedingReview: 3
  },
  autoSandboxPatch: {
    enabled: true,
    dailyCount: 0,
    dailyLimit: 5,
    cooldownMinutes: 15,
    minConfidence: 85,
    jobsCreatedLastRun: 0
  }
};

const apiMocks = vi.hoisted(() => ({
  livingLoopStatus: vi.fn(),
  runLivingLoopOnce: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null })
}));

afterEach(() => {
  vi.clearAllMocks();
});

function getStatCardValue(title: string): string {
  const heading = screen.getByText(title);
  const card = heading.closest(".rounded-xl") as HTMLElement;
  return card.querySelector(".font-display")?.textContent ?? "";
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("LivingLoopDashboardCard", () => {
  it("renders pending and high/critical counts from the loop status", async () => {
    apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });

    renderWithRouter(<LivingLoopDashboardCard />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(getStatCardValue("Pending")).toBe("2");
    expect(screen.getByText("High/Critical")).toBeInTheDocument();
    expect(getStatCardValue("High/Critical")).toBe("1");
    expect(screen.getByText(/Last run: COMPLETED/)).toBeInTheDocument();
  });

  it("shows auto validation jobs today and validation failures needing review", async () => {
    apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });

    renderWithRouter(<LivingLoopDashboardCard />);

    expect(await screen.findByText("Auto Validation Today")).toBeInTheDocument();
    expect(getStatCardValue("Auto Validation Today")).toBe("4");
    expect(screen.getByText("Validation Failures")).toBeInTheDocument();
    expect(getStatCardValue("Validation Failures")).toBe("3");
  });
  it("shows auto patch jobs today and patches needing review", async () => {
    apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });

    renderWithRouter(<LivingLoopDashboardCard />);

    expect(await screen.findByText("Auto Patch Jobs Today")).toBeInTheDocument();
    expect(getStatCardValue("Auto Patch Jobs Today")).toBe("0");
    expect(screen.getByText("Patches Needing Review")).toBeInTheDocument();
    expect(getStatCardValue("Patches Needing Review")).toBe("1");
  });

});

describe("RunLivingLoopButton", () => {
  it("calls the living loop run API when clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    apiMocks.runLivingLoopOnce.mockResolvedValue({ run: {}, candidates: [] });

    render(<RunLivingLoopButton />);

    const button = screen.getByRole("button", { name: /Run Once/ });
    await userEvent.click(button);

    expect(apiMocks.runLivingLoopOnce).toHaveBeenCalledTimes(1);
  });
});
