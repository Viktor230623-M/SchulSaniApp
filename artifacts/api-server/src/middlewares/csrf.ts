import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

/**
 * CSRF-Schutz fuer cookie-authentifizierte Schreibanfragen.
 *
 * Der Browser schickt bei Cross-Origin-Anfragen einen Origin-Header (und bei
 * Navigationen einen Referer). Liegt einer davon vor und gehoert er nicht zu
 * den erlaubten Herkuenften, blockt diese Middleware -- ein fremder
 * Browser-Kontext kann die Session-Cookies nicht fuer eigene Schreibanfragen
 * missbrauchen.
 *
 * Requests OHNE Origin/Referer (native App, curl, Same-Origin-Aufrufe ohne
 * Header) laufen weiter: dort gibt es keinen fremden Kontext, der die Cookies
 * mitschicken koennte. Das ist die uebliche Origin-Check-Semantik, kein
 * Ersatz fuer einen Token -- fuer reinen Browser-Betrieb reicht sie als
 * Verteidigungslinie gegen klassisches CSRF.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PATCH" && method !== "PUT" && method !== "DELETE") {
    next();
    return;
  }

  const origin = req.get("origin");
  const referer = req.get("referer");
  if (!origin && !referer) {
    next();
    return;
  }

  const allowed = config.allowedOrigins.some((o) => {
    // Origin ist exakt schema://host[:port]; Referer eine volle URL mit Pfad.
    if (origin) return origin === o;
    return referer === o || referer!.startsWith(`${o}/`);
  });

  if (!allowed) {
    res.status(403).json({ error: "CSRF check failed: invalid origin" });
    return;
  }
  next();
}
