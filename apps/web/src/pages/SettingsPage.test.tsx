import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDto } from "@/types/api";

const apiMocks = vi.hoisted(() => ({
  updateSetting: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

import { SettingsPage } from "./SettingsPage";
import { useKingdomStore } from "@/stores/kingdomStore";

function setting(overrides: Partial<SettingDto> & Pick<SettingDto, "key" | "value">): SettingDto {
  return {
    id: overrides.key,
    key: overrides.key,
    value: overrides.value,
    defaultValue: overrides.defaultValue ?? overrides.value,
    category: overrides.category ?? "SYSTEM",
    description: overrides.description ?? `${overrides.key} description`,
    updatedAt: overrides.updatedAt ?? "2026-06-17T00:00:00.000Z"
  };
}

function setSettings(settings: SettingDto[]) {
  useKingdomStore.setState({
    settings,
    providers: [],
    agents: [],
    tasks: [],
    councilSessions: [],
    reports: [],
    memories: [],
    error: null,
    isLoading: false,
    isProcessing: false
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.updateSetting.mockImplementation(async (key: string, value: string) => ({
    setting: { ...useKingdomStore.getState().settings.find((s) => s.key === key)!, value, updatedAt: "2026-06-17T00:00:01.000Z" }
  }));
  setSettings([]);
});

describe("SettingsPage", () => {
  it("renders boolean settings as a segmented toggle", () => {
    setSettings([setting({ key: "AUTO_SAVE_MEMORY", value: "true" })]);

    render(<SettingsPage />);

    const toggle = screen.getByRole("group", { name: "AUTO_SAVE_MEMORY" });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enabled" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disabled" })).toBeEnabled();
    expect(screen.queryByDisplayValue("true")).not.toBeInTheDocument();
  });

  it("renders COUNCIL_AUTO_WORK_ORDER_MODE as a constrained select", () => {
    setSettings([setting({ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF" })]);

    render(<SettingsPage />);

    const select = screen.getByLabelText("COUNCIL_AUTO_WORK_ORDER_MODE");
    expect(select).toHaveValue("OFF");
    expect(screen.getByRole("option", { name: "Disabled" })).toHaveValue("OFF");
    expect(screen.getByRole("option", { name: "Draft for King review" })).toHaveValue("DRAFT");
    expect(screen.getByRole("option", { name: "Ready for assignment" })).toHaveValue("READY");
    expect(screen.queryByDisplayValue("OFF")).not.toBeInTheDocument();
    expect(screen.getByTestId("setting-explanation-COUNCIL_AUTO_WORK_ORDER_MODE")).toHaveTextContent("manual");
  });

  it("sends raw enum value DRAFT when selected", async () => {
    const user = userEvent.setup();
    setSettings([setting({ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF" })]);

    render(<SettingsPage />);

    await user.selectOptions(screen.getByLabelText("COUNCIL_AUTO_WORK_ORDER_MODE"), "DRAFT");

    await waitFor(() => expect(apiMocks.updateSetting).toHaveBeenCalledWith("COUNCIL_AUTO_WORK_ORDER_MODE", "DRAFT"));
  });

  it("renders UI_LANGUAGE as a constrained Thai language selector", async () => {
    const user = userEvent.setup();
    setSettings([setting({ key: "UI_LANGUAGE", value: "en", category: "UI" })]);

    render(<SettingsPage />);

    const select = screen.getByLabelText("UI_LANGUAGE");
    expect(select).toHaveValue("en");
    expect(screen.getByRole("option", { name: "English" })).toHaveValue("en");
    expect(screen.getByRole("option", { name: "ภาษาไทย" })).toHaveValue("th");

    await user.selectOptions(select, "th");

    await waitFor(() => expect(apiMocks.updateSetting).toHaveBeenCalledWith("UI_LANGUAGE", "th"));
  });

  it("does not send invalid enum values", async () => {
    setSettings([setting({ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF" })]);

    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("COUNCIL_AUTO_WORK_ORDER_MODE"), { target: { value: "INVALID" } });

    expect(apiMocks.updateSetting).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("COUNCIL_AUTO_WORK_ORDER_MODE must be one of: OFF, DRAFT, READY.");
  });

  it("shows API 400 errors inline and keeps the previous value", async () => {
    const user = userEvent.setup();
    apiMocks.updateSetting.mockRejectedValueOnce(new Error("COUNCIL_AUTO_WORK_ORDER_MODE must be OFF, DRAFT, or READY"));
    setSettings([setting({ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF" })]);

    render(<SettingsPage />);

    const select = screen.getByLabelText("COUNCIL_AUTO_WORK_ORDER_MODE");
    await user.selectOptions(select, "DRAFT");

    expect(await screen.findByRole("alert")).toHaveTextContent("COUNCIL_AUTO_WORK_ORDER_MODE must be OFF, DRAFT, or READY");
    expect(select).toHaveValue("OFF");
  });

  it("keeps setting descriptions and controls available in the responsive row", () => {
    const description = "A long setting description that must wrap instead of disappearing when the Settings card is narrow.";
    setSettings([setting({ key: "DAILY_BUDGET_LIMIT_USD", value: "12.50", description })]);

    render(<SettingsPage />);

    const row = screen.getByTestId("setting-row-DAILY_BUDGET_LIMIT_USD");
    expect(row).toHaveClass("min-w-0");
    expect(row.querySelector(".grid")).toHaveClass("grid-cols-[minmax(0,1fr)]");
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByLabelText("DAILY_BUDGET_LIMIT_USD")).toBeInTheDocument();
  });
});
