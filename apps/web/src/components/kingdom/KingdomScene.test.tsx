import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import type { AgentPresenceDto } from "@/types/api";
import { KingdomScene } from "./KingdomScene";
import { KINGDOM_MOTION_INTERVAL_MS, KINGDOM_TRAVEL_WINDOW_MS } from "./useKingdomMotion";

const resident: AgentPresenceDto = {
  id: "agent-1",
  slug: "elowen",
  name: "Elowen",
  title: "Royal Analyst",
  role: "Analyst",
  displayName: null,
  displayTitle: null,
  avatarUrl: null,
  avatarVersion: 1,
  state: "IDLE",
  currentTask: null,
  currentWorkOrder: null,
  progress: null,
  blockingReason: null,
  lastActivityAt: null
};

function renderScene() {
  return render(
    <I18nProvider>
      <KingdomScene agents={[resident]} selectedId={null} onSelect={() => undefined} />
    </I18nProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("KingdomScene motion", () => {
  it("travels to a new waypoint on the ambient game loop", () => {
    vi.useFakeTimers();
    renderScene();
    const character = screen.getByRole("button", { name: "Elowen — Resting" });
    const initialLeft = character.style.left;

    act(() => vi.advanceTimersByTime(KINGDOM_MOTION_INTERVAL_MS + 1));
    expect(character.style.left).not.toBe(initialLeft);
    expect(character).toHaveAttribute("data-motion", "walking");

    act(() => vi.advanceTimersByTime(KINGDOM_TRAVEL_WINDOW_MS + 1));
    expect(character).toHaveAttribute("data-motion", "stationed");
  });

  it("freezes ambient movement when reduced motion is requested", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    renderScene();
    const character = screen.getByRole("button", { name: "Elowen — Resting" });
    const initialLeft = character.style.left;

    act(() => vi.advanceTimersByTime(KINGDOM_MOTION_INTERVAL_MS * 2));
    expect(character.style.left).toBe(initialLeft);
    expect(character).toHaveAttribute("data-motion", "stationed");
  });
});
