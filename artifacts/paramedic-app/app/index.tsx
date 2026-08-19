import { Redirect } from "expo-router";
import { useAppStore } from "@/store/useAppStore";

export default function Index() {
  const authStatus = useAppStore((s) => s.authStatus);
  const user = useAppStore((s) => s.user);
  const cryptoLocked = useAppStore((s) => s.cryptoLocked);
  const selectedSchool = useAppStore((s) => s.selectedSchool);
  // Waehrend der Pruefung nichts entscheiden — sonst landet ein angemeldeter
  // Nutzer kurz auf dem Login-Screen.
  if (authStatus === "loading") return null;
  // Ohne gewaehlte Schule gibt es nichts anzumelden: Erstnutzer landen auf dem
  // Start-Screen (Schul-ID / Lizenz), alle anderen direkt auf dem Login.
  if (authStatus === "anon") return selectedSchool ? <Redirect href="/login" /> : <Redirect href="/start" />;
  // Dieselben Bedingungen wie die Stack.Protected-Guards in _layout.tsx: Die
  // Tabs sind gesperrt, bis Passwort, Entschluesselung und Name geklaert
  // sind. Ein Redirect auf eine Route, die der Guard nicht matcht, wuerde
  // sonst auf dem Not-Found-Screen landen.
  if (user?.mustChangePassword) return <Redirect href="/passwort-wechseln" />;
  if (cryptoLocked) return <Redirect href="/entsperren" />;
  if (user?.profileConfirmedAt === null) return <Redirect href="/name-bestaetigen" />;
  return <Redirect href="/(tabs)/news" />;
}
