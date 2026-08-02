import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { APP_NAME, THEME_COLOR } from "@/constants/appConfig";

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
        {/* viewport-fit=cover ist Voraussetzung dafuer, dass env(safe-area-inset-*)
            im Standalone-Modus ueberhaupt Werte liefert. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover"
        />

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
