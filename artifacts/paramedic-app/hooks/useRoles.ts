import { useEffect, useState } from "react";

import type { RoleInfo } from "@/models";
import ApiService from "@/services/ApiService";

const FALLBACK_COLOR = { bg: "#F3F4F6", text: "#6B7280" };

/**
 * Anzeigename und Farbe je Rolle kommen aus GET /roles, nicht mehr aus fest
 * kodierten Tabellen im Client. Jeder Bildschirm, der Rollen anzeigt, nutzt
 * diesen Hook, damit ein Anzeigename fuer alle Bildschirme gilt.
 */
export function useRoles() {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ApiService.getRoles()
      .then((data) => { if (!cancelled) setRoles(Array.isArray(data) ? data : []); })
      .catch((err) => console.error("Failed to load roles:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function byKey(key: string): RoleInfo | undefined {
    return roles.find((r) => r.key === key);
  }

  function displayName(key: string, lang: "de" | "en"): string {
    const role = byKey(key);
    if (!role) return key;
    return (lang === "en" && role.displayNameEn) ? role.displayNameEn : role.displayName;
  }

  function colors(key: string): { bg: string; text: string } {
    const color = byKey(key)?.color;
    return color ? { bg: `${color}1A`, text: color } : FALLBACK_COLOR;
  }

  return { roles, loading, byKey, displayName, colors };
}
