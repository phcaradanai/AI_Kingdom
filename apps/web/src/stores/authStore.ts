import { create } from "zustand";
import { api } from "@/lib/api";
import type { PublicUser } from "@/types/api";

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: PublicUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
};

const storedToken = localStorage.getItem("ai-kingdom-token");
const storedRefreshToken = localStorage.getItem("ai-kingdom-refresh-token");
const storedUser = localStorage.getItem("ai-kingdom-user");

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  refreshToken: storedRefreshToken,
  user: storedUser ? (JSON.parse(storedUser) as PublicUser) : null,
  isLoading: false,
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await api.login(email, password);
      localStorage.setItem("ai-kingdom-token", response.token);
      if (response.refreshToken) localStorage.setItem("ai-kingdom-refresh-token", response.refreshToken);
      localStorage.setItem("ai-kingdom-user", JSON.stringify(response.user));
      set({ token: response.token, refreshToken: response.refreshToken ?? null, user: response.user, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  logout: async () => {
    await api.logout();
    clearStoredSession();
    set({ token: null, refreshToken: null, user: null });
  },
  clearSession: () => {
    clearStoredSession();
    set({ token: null, refreshToken: null, user: null });
  }
}));

function clearStoredSession() {
    localStorage.removeItem("ai-kingdom-token");
    localStorage.removeItem("ai-kingdom-refresh-token");
    localStorage.removeItem("ai-kingdom-user");
}
