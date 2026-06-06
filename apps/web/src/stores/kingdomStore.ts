import { create } from "zustand";
import { api } from "@/lib/api";
import type {
  AgentDto,
  AgentPayload,
  CouncilSessionDto,
  MemoryDto,
  MemoryPayload,
  ReportPayload,
  SettingDto,
  ReportDto,
  TaskDto,
  TaskMode,
  TaskStatus
} from "@/types/api";

type KingdomState = {
  agents: AgentDto[];
  tasks: TaskDto[];
  councilSessions: CouncilSessionDto[];
  reports: ReportDto[];
  memories: MemoryDto[];
  settings: SettingDto[];
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitCommand: (command: string, mode: TaskMode) => Promise<TaskDto>;
  processTask: (id: string) => Promise<CouncilSessionDto>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<TaskDto>;
  searchMemories: (q: string) => Promise<void>;
  createMemory: (payload: MemoryPayload) => Promise<MemoryDto>;
  updateMemory: (id: string, payload: Partial<MemoryPayload>) => Promise<MemoryDto>;
  deleteMemory: (id: string) => Promise<void>;
  searchReports: (q: string) => Promise<void>;
  updateReport: (id: string, payload: Partial<ReportPayload>) => Promise<ReportDto>;
  deleteReport: (id: string) => Promise<void>;
  createAgent: (payload: AgentPayload) => Promise<AgentDto>;
  updateAgent: (id: string, payload: Partial<AgentPayload>) => Promise<AgentDto>;
  deleteAgent: (id: string) => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<SettingDto>;
};

export const useKingdomStore = create<KingdomState>((set, get) => ({
  agents: [],
  tasks: [],
  councilSessions: [],
  reports: [],
  memories: [],
  settings: [],
  isLoading: false,
  isProcessing: false,
  error: null,
  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      const role = getStoredRole();
      const [agents, tasks, councilSessions, reports, memories, settings] = await Promise.all([
        role === "KING" ? api.agents() : Promise.resolve({ agents: get().agents }),
        canRead(role, "tasks") ? api.tasks() : Promise.resolve({ tasks: [] }),
        canRead(role, "council") ? api.councilSessions() : Promise.resolve({ sessions: [] }),
        canRead(role, "reports") ? api.reports() : Promise.resolve({ reports: [] }),
        canRead(role, "memory") ? api.memories() : Promise.resolve({ memories: [] }),
        role === "KING" ? api.settings() : Promise.resolve({ settings: get().settings })
      ]);
      set({
        agents: agents.agents,
        tasks: tasks.tasks,
        councilSessions: councilSessions.sessions,
        reports: reports.reports,
        memories: memories.memories,
        settings: settings.settings,
        isLoading: false
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load kingdom data", isLoading: false });
    }
  },
  submitCommand: async (command, mode) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.createTask({ command, mode });
      set({
        tasks: [response.task, ...get().tasks.filter((task) => task.id !== response.task.id)],
        isLoading: false
      });
      await get().refresh();
      return response.task;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to submit command", isLoading: false });
      throw error;
    }
  },
  processTask: async (id) => {
    set({ isProcessing: true, error: null });
    try {
      const response = await api.processTask(id);
      set({
        tasks: get().tasks.map((task) => (task.id === id ? response.task : task)),
        councilSessions: [response.session, ...get().councilSessions.filter((session) => session.id !== response.session.id)],
        isProcessing: false
      });
      await get().refresh();
      return response.session;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Grand Vizier could not convene the council", isProcessing: false });
      throw error;
    }
  },
  updateTaskStatus: async (id, status) => {
    const response = await api.updateTaskStatus(id, status);
    set({
      tasks: get().tasks.map((task) => (task.id === id ? response.task : task))
    });
    return response.task;
  },
  searchMemories: async (q) => {
    set({ isLoading: true, error: null });
    try {
      const response = q.trim() ? await api.searchMemories(q) : await api.memories();
      set({ memories: response.memories, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to search memories", isLoading: false });
    }
  },
  createMemory: async (payload) => {
    const response = await api.createMemory(payload);
    set({ memories: [response.memory, ...get().memories] });
    return response.memory;
  },
  updateMemory: async (id, payload) => {
    const response = await api.updateMemory(id, payload);
    set({ memories: get().memories.map((memory) => (memory.id === id ? response.memory : memory)) });
    return response.memory;
  },
  deleteMemory: async (id) => {
    await api.deleteMemory(id);
    set({ memories: get().memories.filter((memory) => memory.id !== id) });
  },
  searchReports: async (q) => {
    set({ isLoading: true, error: null });
    try {
      const response = q.trim() ? await api.searchReports(q) : await api.reports();
      set({ reports: response.reports, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to search reports", isLoading: false });
    }
  },
  updateReport: async (id, payload) => {
    const response = await api.updateReport(id, payload);
    set({ reports: get().reports.map((report) => (report.id === id ? response.report : report)) });
    return response.report;
  },
  deleteReport: async (id) => {
    await api.deleteReport(id);
    set({ reports: get().reports.filter((report) => report.id !== id) });
  },
  createAgent: async (payload) => {
    const response = await api.createAgent(payload);
    set({ agents: [response.agent, ...get().agents] });
    return response.agent;
  },
  updateAgent: async (id, payload) => {
    const response = await api.updateAgent(id, payload);
    set({ agents: get().agents.map((agent) => (agent.id === id ? response.agent : agent)) });
    return response.agent;
  },
  deleteAgent: async (id) => {
    await api.deleteAgent(id);
    set({ agents: get().agents.map((agent) => (agent.id === id ? { ...agent, isActive: false } : agent)) });
  },
  updateSetting: async (key, value) => {
    const response = await api.updateSetting(key, value);
    set({ settings: get().settings.map((setting) => (setting.key === key ? response.setting : setting)) });
    return response.setting;
  }
}));

function getStoredRole() {
  const rawUser = localStorage.getItem("ai-kingdom-user");
  if (!rawUser) return null;
  try {
    return (JSON.parse(rawUser) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function canRead(role: string | null, resource: "tasks" | "council" | "reports" | "memory") {
  if (role === "KING") return true;
  if (role === "CROWN_PRINCE") return ["tasks", "council", "reports", "memory"].includes(resource);
  if (role === "MINISTER") return ["tasks", "reports"].includes(resource);
  if (role === "SCRIBE") return ["tasks", "council", "reports", "memory"].includes(resource);
  return false;
}
