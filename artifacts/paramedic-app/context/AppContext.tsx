import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type {
  DutyStatus,
  Mission,
  NewsItem,
  NotificationItem,
} from "@/models";
import ApiService from "@/services/ApiService";

interface AppContextValue {
  dutyStatus: DutyStatus["status"];
  setDutyStatus: (status: DutyStatus["status"]) => Promise<void>;
  dutyLoading: boolean;

  missions: Mission[];
  missionsLoading: boolean;
  refreshMissions: () => Promise<void>;
  handleAcceptMission: (id: string) => Promise<void>;
  handleRejectMission: (id: string) => Promise<void>;

  news: NewsItem[];
  newsLoading: boolean;
  refreshNews: () => Promise<void>;

  notifications: NotificationItem[];
  notificationsLoading: boolean;
  unreadCount: number;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const DUTY_STORAGE_KEY = "@paramedic/duty_status";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dutyStatus, setDutyStatusState] = useState<DutyStatus["status"]>("off_duty");
  const [dutyLoading, setDutyLoading] = useState(false);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DUTY_STORAGE_KEY).then((stored) => {
      if (stored === "on_duty" || stored === "off_duty") {
        setDutyStatusState(stored);
      }
    });
    refreshMissions();
    refreshNews();
    refreshNotifications();
  }, []);

  const setDutyStatus = useCallback(async (status: DutyStatus["status"]) => {
    setDutyLoading(true);
    try {
      await ApiService.updateDutyStatus(status);
      setDutyStatusState(status);
      await AsyncStorage.setItem(DUTY_STORAGE_KEY, status);
    } finally {
      setDutyLoading(false);
    }
  }, []);

  const refreshMissions = useCallback(async () => {
    setMissionsLoading(true);
    try {
      const data = await ApiService.getMissions();
      setMissions(data);
    } finally {
      setMissionsLoading(false);
    }
  }, []);

  const handleAcceptMission = useCallback(async (id: string) => {
    const updated = await ApiService.acceptMission(id);
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? updated : m))
    );
  }, []);

  const handleRejectMission = useCallback(async (id: string) => {
    const updated = await ApiService.rejectMission(id);
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? updated : m))
    );
  }, []);

  const refreshNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const data = await ApiService.getNews();
      setNews(data);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const data = await ApiService.getNotifications();
      setNotifications(data);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    await ApiService.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        dutyStatus,
        setDutyStatus,
        dutyLoading,
        missions,
        missionsLoading,
        refreshMissions,
        handleAcceptMission,
        handleRejectMission,
        news,
        newsLoading,
        refreshNews,
        notifications,
        notificationsLoading,
        unreadCount,
        markAllRead,
        refreshNotifications,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
