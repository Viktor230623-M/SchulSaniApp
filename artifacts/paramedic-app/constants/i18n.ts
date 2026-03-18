import { NativeModules, Platform } from "react-native";

type Language = "de" | "en";

function getDeviceLanguage(): Language {
  let lang = "en";
  if (Platform.OS === "ios") {
    lang =
      NativeModules.SettingsManager?.settings?.AppleLocale ||
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
      "en";
  } else if (Platform.OS === "android") {
    lang = NativeModules.I18nManager?.localeIdentifier || "en";
  }
  return lang.startsWith("de") ? "de" : "en";
}

const translations = {
  de: {
    tabs: {
      news: "Neuigkeiten",
      holidays: "Urlaub",
      duty: "Dienststatus",
      missions: "Einsätze",
      notifications: "Benachrichtigungen",
    },
    duty: {
      title: "Dienststatus",
      onDuty: "Im Dienst",
      offDuty: "Außer Dienst",
      statusUpdated: "Status aktualisiert",
      availableFor: "Verfügbar für Einsätze",
      notAvailable: "Nicht verfügbar",
    },
    missions: {
      title: "Einsätze",
      accept: "Annehmen",
      reject: "Ablehnen",
      accepted: "Angenommen",
      rejected: "Abgelehnt",
      pending: "Ausstehend",
      high: "Hoch",
      medium: "Mittel",
      low: "Niedrig",
      noMissions: "Keine Einsätze",
      noMissionsDesc: "Aktuell sind keine Einsätze vorhanden.",
    },
    news: {
      title: "Neuigkeiten",
      readMore: "Weiterlesen",
      noNews: "Keine Neuigkeiten",
    },
    holidays: {
      title: "Urlaub",
      schoolHolidays: "Schulferien",
      publicHolidays: "Feiertage",
      noHolidays: "Keine Ferientermine",
    },
    notifications: {
      title: "Benachrichtigungen",
      markAllRead: "Alle gelesen",
      noNotifications: "Keine Benachrichtigungen",
      noNotificationsDesc: "Du bist auf dem neuesten Stand.",
    },
    common: {
      loading: "Laden...",
      error: "Fehler",
      retry: "Erneut versuchen",
      cancel: "Abbrechen",
      confirm: "Bestätigen",
      ok: "OK",
      priority: "Priorität",
      location: "Ort",
      time: "Zeit",
      date: "Datum",
      type: "Typ",
    },
  },
  en: {
    tabs: {
      news: "News",
      holidays: "Holidays",
      duty: "Duty Status",
      missions: "Missions",
      notifications: "Notifications",
    },
    duty: {
      title: "Duty Status",
      onDuty: "On Duty",
      offDuty: "Off Duty",
      statusUpdated: "Status updated",
      availableFor: "Available for missions",
      notAvailable: "Not available",
    },
    missions: {
      title: "Missions",
      accept: "Accept",
      reject: "Reject",
      accepted: "Accepted",
      rejected: "Rejected",
      pending: "Pending",
      high: "High",
      medium: "Medium",
      low: "Low",
      noMissions: "No Missions",
      noMissionsDesc: "There are currently no missions.",
    },
    news: {
      title: "News",
      readMore: "Read more",
      noNews: "No News",
    },
    holidays: {
      title: "Holidays",
      schoolHolidays: "School Holidays",
      publicHolidays: "Public Holidays",
      noHolidays: "No holiday dates",
    },
    notifications: {
      title: "Notifications",
      markAllRead: "Mark all read",
      noNotifications: "No Notifications",
      noNotificationsDesc: "You're all caught up.",
    },
    common: {
      loading: "Loading...",
      error: "Error",
      retry: "Retry",
      cancel: "Cancel",
      confirm: "Confirm",
      ok: "OK",
      priority: "Priority",
      location: "Location",
      time: "Time",
      date: "Date",
      type: "Type",
    },
  },
};

let currentLanguage: Language = getDeviceLanguage();

export function t(
  path: string,
  lang: Language = currentLanguage
): string {
  const keys = path.split(".");
  let result: any = translations[lang];
  for (const key of keys) {
    result = result?.[key];
  }
  return result ?? path;
}

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export type Translations = typeof translations.en;
