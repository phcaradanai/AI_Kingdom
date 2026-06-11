import { render, screen } from "@testing-library/react";
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
  autoValidation: {
    enabled: true,
    dailyCount: 4,
    dailyLimit: 10,
    cooldownMinutes: 60,
    jobsCreatedLastRun: 1,
    validationFailuresNeedingReview: 3
  }
};

const apiMocks = vi.hoisted(() => ({
  livingLoopStatus: vi.fn(),
  runLivingLoopOnce: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("LivingLoopDashboardCard", () => {
  it("renders pending and high/critical counts from the loop status", async () => {
    apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });

    render(<LivingLoopDashboardCard />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("High/Critical")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/Last run: COMPLETED/)).toBeInTheDocument();
  });

  it("shows auto validation jobs today and validation failures needing review", async () => {
    apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });

    render(<LivingLoopDashboardCard />);

    expect(await screen.findByText("Auto Validation Today")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Validation Failures")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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
