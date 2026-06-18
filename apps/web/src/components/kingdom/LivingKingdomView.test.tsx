import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPresenceDto, KingdomActivityStreamDto, KingdomPresenceDto } from "@/types/api";
import { LivingKingdomView } from "./LivingKingdomView";
import { resolveLocation, STATE_LABEL } from "./agentPresence";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  getKingdomPresence: vi.fn(),
  getKingdomActivity: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

function agent(overrides: Partial<AgentPresenceDto>): AgentPresenceDto {
  return {
    id: "a1",
    name: "Agent",
    role: "",
    displayName: null,
    state: "IDLE",
    currentTask: null,
    currentWorkOrder: null,
    progress: null,
    blockingReason: null,
    lastActivityAt: null,
    ...overrides
  };
}

const emptyActivity: KingdomActivityStreamDto = { computedAt: nowIso, activities: [] };

function setPresence(agents: AgentPresenceDto[]) {
  const presence: KingdomPresenceDto = { computedAt: nowIso, agents };
  apiMocks.getKingdomPresence.mockResolvedValue(presence);
  apiMocks.getKingdomActivity.mockResolvedValue(emptyActivity);
}

function renderView() {
  return render(
    <MemoryRouter>
      <LivingKingdomView />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveLocation", () => {
  it("maps seeded roles to their hall", () => {
    expect(resolveLocation({ role: "Orchestrator", name: "Aurelian", displayName: null })).toBe("throne");
    expect(resolveLocation({ role: "Analyst", name: "Elowen", displayName: null })).toBe("library");
    expect(resolveLocation({ role: "Systems Designer", name: "Seraphine", displayName: null })).toBe("warRoom");
    expect(resolveLocation({ role: "Execution Strategist", name: "Cassian", displayName: null })).toBe("workshop");
    expect(resolveLocation({ role: "Financial Advisor", name: "Marcellus", displayName: null })).toBe("treasury");
  });

  it("falls back to a name keyword, then to the throne", () => {
    expect(resolveLocation({ role: "", name: "Royal Archivist", displayName: null })).toBe("archive");
    expect(resolveLocation({ role: "", name: "Prompt Agent", displayName: null })).toBe("throne");
  });
});

describe("LivingKingdomView", () => {
  it("renders all six kingdom locations", async () => {
    setPresence([]);
    renderView();

    for (const label of ["Throne", "Library", "War Room", "Workshop", "Archive", "Treasury"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it("labels real states and never invents HANDOFF/RETURNING", async () => {
    setPresence([
      agent({ id: "r1", name: "Elowen", role: "Analyst", state: "WAITING_REVIEW" }),
      agent({ id: "r2", name: "Cassian", role: "Execution Strategist", state: "RUNNING", progress: "step 2/5" })
    ]);
    renderView();

    expect((await screen.findAllByText(STATE_LABEL.WAITING_REVIEW)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/HANDOFF/i)).toBeNull();
    expect(screen.queryByText(/RETURNING/i)).toBeNull();
  });

  it("shows a calm ambience when every agent is idle", async () => {
    setPresence([agent({ id: "i1", name: "Elowen", role: "Analyst", state: "IDLE" })]);
    renderView();

    expect(await screen.findByText(/The kingdom rests/i)).toBeInTheDocument();
  });

  it("opens agent detail with a work-order source link on click", async () => {
    setPresence([
      agent({
        id: "w1",
        name: "Cassian",
        role: "Execution Strategist",
        state: "RUNNING",
        currentTask: "Patch provider routing",
        currentWorkOrder: { id: "wo-9", title: "Provider routing fix" },
        progress: "step 3/7",
        lastActivityAt: nowIso
      })
    ]);
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: /Cassian/i }));

    const sourceLink = await screen.findByRole("link", { name: /Provider routing fix/i });
    expect(sourceLink).toHaveAttribute("href", "/work-orders");
  });
});
