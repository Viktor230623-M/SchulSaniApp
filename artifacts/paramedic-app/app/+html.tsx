import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { APP_NAME, THEME_COLOR } from "@/constants/appConfig";

/**
 * Kompatibilitaets-Script fuer aeltere Browser (typisch: aeltere iPads in
 * Schulen). Das ausgelieferte Bundle setzt Syntax aus Safari 14.1+ und
 * Laufzeit-APIs aus Safari 15.4+ voraus; ein aelterer Browser zeigt sonst
 * eine dauerhaft weisse Seite:
 *  - Vor Safari 14.1 (private Klassenfelder im Bundle): SyntaxError beim
 *    Parsen — dafuer gibt es keinen Polyfill, der Browser bekommt deshalb
 *    eine verstaendliche Meldung statt des Whitescreens.
 *  - Safari 14.1–15.3: Das Bundle parst, aber fehlende Laufzeit-APIs
 *    (structuredClone, Array.prototype.at, findLast/findLastIndex,
 *    crypto.randomUUID) crashen den Start bzw. die erste Navigation. Die
 *    Shims unten schliessen genau diese Luecken.
 * Bewusst reines ES5: Das Script muss gerade auf den alten Browsern parsen,
 * die es reparieren soll. Kein <script src>-Datei, damit kein zusaetzliches
 * Asset gebaut und ausgeliefert werden muss.
 */
const COMPAT_SCRIPT = `
(function () {
  // Absturz-Erfassung: Bleibt die App weiss (z. B. Absturz beim Start in
  // Safari), soll der ausloesende Fehler sichtbar und fuer die Fehlersuche
  // gespeichert sein. Laeuft vor dem Bundle, damit auch Fehler beim Parsen
  // oder Starten des Bundles ankommen.
  var __lastErr = "";
  function __recordErr(message, stack) {
    var text = String(message) + (stack ? "\\n" + stack : "");
    __lastErr = text;
    try {
      window.localStorage.setItem("schulsani.lastError", text.slice(0, 4000));
    } catch (e) {}
  }
  window.addEventListener("error", function (e) {
    // Ressourcen-/Cross-Origin-Fehler (Fonts, Bilder) sind keine Abstuerze.
    if (!e.error && (!e.message || e.message === "Script error.")) return;
    __recordErr(e.error ? e.error.message || String(e.error) : e.message || "Unbekannter Fehler", e.error && e.error.stack ? e.error.stack : "");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    __recordErr(r && r.message ? r.message : String(r), r && r.stack ? r.stack : "");
  });
  window.__schulsaniMounted = false;
  setTimeout(function () {
    if (window.__schulsaniMounted) return;
    if (!__lastErr) return;
    var root = document.getElementById("root");
    if (root && root.childElementCount > 1) return; // App hat gerendert, nur langsam
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#ffffff;z-index:2147483647;overflow:auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    overlay.innerHTML = "<div style='max-width:640px;margin:0 auto'><h2 style='font-size:20px;color:#111111;margin:0 0 8px'>Die App konnte nicht gestartet werden</h2><p style='font-size:14px;color:#444444;margin:0 0 12px'>Dieser Fehler ist beim Start aufgetreten. Bitte melde ihn, damit er behoben werden kann:</p><pre style='font-size:12px;line-height:1.5;background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;color:#222222;margin:0 0 16px'>" + String(__lastErr).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre><button onclick='location.reload()' style='padding:10px 20px;border:0;border-radius:8px;background:#0a7dff;color:#ffffff;font-size:15px;cursor:pointer'>Neu laden</button></div>";
    document.body.appendChild(overlay);
  }, 8000);

  var canParse = true;
  try {
    new Function("class A { #p = 1; } var x = a?.b ?? 0; x ??= 1;");
  } catch (e) {
    canParse = false;
  }
  if (!canParse) {
    var styles = "position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:#ffffff;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px;";
    var box = document.createElement("div");
    box.style.cssText = styles;
    box.innerHTML = "<div style='max-width:460px'><h1 style='font-size:22px;line-height:1.3;margin:0 0 12px;color:#111111'>Dein Browser ist zu alt</h1><p style='font-size:15px;line-height:1.5;margin:0;color:#444444'>Diese App braucht einen aktuellen Browser. Bitte aktualisiere Safari (14.1 oder neuer) oder nutze die neueste Version von Chrome, Firefox oder Edge.</p></div>";
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(box);
    });
    return;
  }
  if (typeof window.structuredClone !== "function") {
    window.structuredClone = function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  }
  if (typeof Array.prototype.at !== "function") {
    Array.prototype.at = function (index) {
      var i = Math.trunc(index) || 0;
      if (i < 0) i += this.length;
      return i >= 0 && i < this.length ? this[i] : undefined;
    };
  }
  if (typeof Array.prototype.findLast !== "function") {
    Array.prototype.findLast = function (fn, thisArg) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }
  if (typeof Array.prototype.findLastIndex !== "function") {
    Array.prototype.findLastIndex = function (fn, thisArg) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    };
  }
  if (window.crypto && typeof window.crypto.randomUUID !== "function" && typeof window.crypto.getRandomValues === "function") {
    window.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = "";
      for (var i = 0; i < 16; i++) {
        hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
      }
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    };
  }
})();
`;

/**
 * Huelle des ausgelieferten HTML-Dokuments.
 *
 * expo-router rendert ohne diese Datei eine Standardvorlage ohne Manifest und
 * ohne Apple-Metadaten; der Export laesst sich dann nicht als App auf den
 * Startbildschirm legen. Die Datei laeuft nur beim Build, nicht im Browser.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Vor den Bundle-Scripts im <body> ausfuehren — der einzige Ort, der
            auf Browsern ohne moderne JS-Syntax ueberhaupt noch laeuft. */}
        <script dangerouslySetInnerHTML={{ __html: COMPAT_SCRIPT }} />
        {/* viewport-fit=cover ist Voraussetzung dafuer, dass env(safe-area-inset-*)
            im Standalone-Modus ueberhaupt Werte liefert. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover"
        />

        <title>{APP_NAME}</title>
        <meta name="description" content="Einsatzverwaltung für Schulsanitätsdienste — Einsätze, Protokolle und Dienstplan, Ende-zu-Ende verschlüsselt." />
        {/* Die App-Routen liegen hinter der Anmeldung und sind leere Huelle fuer
            Crawler. Die oeffentliche Landing-Page liegt unter demo.schulsaniapp.com
            und ist dort indexierbar; die App-Shell bleibt noindex. */}
        <meta name="robots" content="noindex, nofollow" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={APP_NAME} />
        <meta property="og:title" content={APP_NAME} />
        <meta property="og:description" content="Einsatzverwaltung für Schulsanitätsdienste — Einsätze, Protokolle und Dienstplan, Ende-zu-Ende verschlüsselt." />
        <meta property="og:image" content="/icons/icon-512.png" />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={THEME_COLOR} />

        {/* iOS wertet das Manifest nur teilweise aus und braucht diese Angaben. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
