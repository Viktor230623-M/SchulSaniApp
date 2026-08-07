import { Redirect } from "expo-router";
import { useAppStore } from "@/store/useAppStore";

export default function Index() {
  const authStatus = useAppStore((s) => s.authStatus);
  const user = useAppStore((s) => s.user);
  // Waehrend der Pruefung nichts entscheiden — sonst landet ein angemeldeter
  // Nutzer kurz auf dem Login-Screen.
  if (authStatus === "loading") return null;
  if (authStatus === "anon") return <Redirect href="/login" />;
  // Dieselben Bedingungen wie die Stack.Protected-Guards in _layout.tsx: Die
  // Tabs sind gesperrt, bis Passwort und Name geklaert sind. Ein Redirect auf
  // (tabs) wuerde sonst auf eine Route treffen, die der Guard nicht matcht.
  if (user?.mustChangePassword) return <Redirect href="/passwort-wechseln" />;
  if (user?.profileConfirmedAt === null) return <Redirect href="/name-bestaetigen" />;
  return <Redirect href="/(tabs)/news" />;
}
