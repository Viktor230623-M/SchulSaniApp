# Instanzspezifische Icons (PWA/Web)

`apple-touch-icon.png`, `icon-192.png` und `icon-512.png` zeigen das Logo des
Sanitaetsdienstes der aktuellen Instanz und werden von `manifest.json`
(generiert aus `manifest.template.json`, siehe
`scripts/generate-web-assets.js`) sowie von `app/+html.tsx` referenziert. Bei
einer neuen Installation diese drei Dateien unter denselben Namen und Massen
durch das Logo der neuen Schule ersetzen — die Referenzen selbst muessen
nicht geaendert werden.
