import { Redirect } from "expo-router";
import { useAppStore } from "@/store/useAppStore";

export default function Index() {
  const authStatus = useAppStore((s) => s.authStatus);
  // Waehrend der Pruefung nichts entscheiden — sonst landet ein angemeldeter
  // Nutzer kurz auf dem Login-Screen.
  if (authStatus === "loading") return null;
  if (authStatus === "anon") return <Redirect href="/login" />;
  return <Redirect href="/(tabs)/news" />;
}
