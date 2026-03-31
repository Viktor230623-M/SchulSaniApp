import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  AppLanguage,
  AppTheme,
  DutyStatus,
  LOARequest,
  Mission,
  NewsItem,
  NotificationItem,
  User,
} from "@/models";

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;

  // Settings
  theme: AppTheme;
  language: AppLanguage;
  setTheme: (theme: AppTheme) => void;
  setLanguage: (lang: AppLanguage) => void;

  // Duty
  dutyStatus: DutyStatus["status"];
  dutyLoading: boolean;
  setDutyStatus: (status: DutyStatus["status"]) => void;
  setDutyLoading: (loading: boolean) => void;

  // Missions
  missions: Mission[];
  missionsLoading: boolean;
  setMissions: (missions: Mission[]) => void;
  setMissionsLoading: (loading: boolean) => void;
  updateMission: (id: string, patch: Partial<Mission>) => void;

  // News
  news: NewsItem[];
  newsLoading: boolean;
  setNews: (news: NewsItem[]) => void;
  setNewsLoading: (loading: boolean) => void;
  updateNewsItem: (id: string, patch: Partial<NewsItem>) => void;
  addNewsItem: (item: NewsItem) => void;
  removeNewsItem: (id: string) => void;

  // LOA
  loaRequests: LOARequest[];
  loaLoading: boolean;
  setLOARequests: (reqs: LOARequest[]) => void;
  setLOALoading: (loading: boolean) => void;
  updateLOA: (id: string, patch: Partial<LOARequest>) => void;
  addLOA: (req: LOARequest) => void;

  // Notifications
  notifications: NotificationItem[];
  notificationsLoading: boolean;
  setNotifications: (notifs: NotificationItem[]) => void;
  setNotificationsLoading: (loading: boolean) => void;
  markAllNotificationsRead: () => void;

  // Profile — per-user avatar map so changing photo for one account doesn't affect others
  avatarUriMap: Record<string, string>;
  setAvatarUri: (userId: string, uri: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () =>
        set((s) => ({
          user: null,
          isAuthenticated: false,
          // Reset teal theme on logout since teal is CTO-exclusive
          theme: s.theme === "teal" ? "light" : s.theme,
          dutyStatus: "off_duty",
          missions: [],
          news: [],
          loaRequests: [],
          notifications: [],
        })),

      // Settings
      theme: "light",
      language: "de",
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),

      // Duty
      dutyStatus: "off_duty",
      dutyLoading: false,
      setDutyStatus: (dutyStatus) => set({ dutyStatus }),
      setDutyLoading: (dutyLoading) => set({ dutyLoading }),

      // Missions
      missions: [],
      missionsLoading: false,
      setMissions: (missions) => set({ missions }),
      setMissionsLoading: (missionsLoading) => set({ missionsLoading }),
      updateMission: (id, patch) =>
        set((s) => ({
          missions: s.missions.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      // News
      news: [],
      newsLoading: false,
      setNews: (news) => set({ news }),
      setNewsLoading: (newsLoading) => set({ newsLoading }),
      updateNewsItem: (id, patch) =>
        set((s) => ({
          news: s.news.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      addNewsItem: (item) => set((s) => ({ news: [item, ...s.news] })),
      removeNewsItem: (id) =>
        set((s) => ({ news: s.news.filter((n) => n.id !== id) })),

      // LOA
      loaRequests: [],
      loaLoading: false,
      setLOARequests: (loaRequests) => set({ loaRequests }),
      setLOALoading: (loaLoading) => set({ loaLoading }),
      updateLOA: (id, patch) =>
        set((s) => ({
          loaRequests: s.loaRequests.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),
      addLOA: (req) => set((s) => ({ loaRequests: [req, ...s.loaRequests] })),

      // Notifications
      notifications: [],
      notificationsLoading: false,
      setNotifications: (notifications) => set({ notifications }),
      setNotificationsLoading: (notificationsLoading) =>
        set({ notificationsLoading }),
      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
        })),

      // Per-user avatar map
      avatarUriMap: {},
      setAvatarUri: (userId, uri) =>
        set((s) => ({
          avatarUriMap: uri
            ? { ...s.avatarUriMap, [userId]: uri }
            : Object.fromEntries(
                Object.entries(s.avatarUriMap).filter(([k]) => k !== userId)
              ),
        })),
    }),
    {
      name: "paramedic-store-v3",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        language: state.language,
        dutyStatus: state.dutyStatus,
        avatarUriMap: state.avatarUriMap,
      }),
    }
  )
);
