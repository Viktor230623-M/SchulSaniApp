# Kampagne Deutschland — Schulen mit Schulsanitätsdienst (SSD)

Erweiterung der Hamburger Kampagne auf ganz Deutschland. Zielgruppe: **Schulen, die bereits einen Schulsanitätsdienst haben** (kein Aufbau-Angebot nötig, Produkt passt sofort).

## Status: 100 verifizierte Schulen, Entwürfe erzeugt, noch NICHT gesendet

## Dateien

| Datei | Inhalt |
|---|---|
| `leads_ssd_deutschland.csv` | 100 verifizierte Schulen: Name, Stadt, Bundesland, Schulleitung, E-Mail, Quelle, Status |
| `entwuerfe/` | 100 personalisierte E-Mail-Entwürfe (Standard-Demo-Mail, Anrede nach Schulleitung) |
| `generiere_entwuerfe.mjs` | Generator: CSV → Entwürfe. Neu ausführen mit `node generiere_entwuerfe.mjs` |

## Herkunft der Schulen (alle mit SSD bestätigt)

- **DRK Kreisverband Rhein-Neckar/Heidelberg** (~36 Schulen) — drk-heidelberg.de
- **DRK Kreisverband Göttingen-Northeim** (Göttingen/Einbeck/Dassel/Northeim) — drk-goe-nom.de
- **DRK Kreisverband Göppingen** (17 Schulen) — drk-goeppingen.de
- **DRK Kreisverband Neuss** (7 Schulen) — drk-neuss.de
- **DRK Kreisverband Pirna** (Sachsen) — drkpirna.de
- **DRK Kreisverband Baden-Baden** (9 Schulen) — drk-baden-baden.de
- **DRK Kreisverband Weißenfels** (Sachsen-Anhalt) — drkweissenfels.de
- Einzelnachweise: FEG Stuttgart, GVB Berlin, JKG Bruchsal, AvH Konstanz, MCG Gehrden, GBG Winnenden, Gymnasium Essen-Werden u.a.

## Verteilung nach Bundesland

- Baden-Württemberg: 69
- Niedersachsen: 14
- Nordrhein-Westfalen: 8
- Sachsen: 5
- Sachsen-Anhalt: 3
- Berlin: 1

## Qualitätssicherung

- **Jede E-Mail-Adresse einzeln verifiziert** (Schul-Website, Impressum, Behördenverzeichnis, FragDenStaat).
- **Keine Duplikate:** 0 Überschneidungen mit den 138 bereits kontaktierten Hamburger Schulen.
- Keine E-Mail-Adressen aus DRK-Listen übernommen — nur Adressen direkt von den Schulen selbst.
- Adressen mit `poststelle@<nr>.schule.bwl.de`-Muster stammen aus den offiziellen Baden-Württemberg-Schulverzeichnissen.
- `status=verified` = Adresse aus Primärquelle bestätigt.

## Nächste Schritte

1. Entwürfe in `entwuerfe/` prüfen (Anrede-Spotcheck).
2. Versand über Resend (wie Hamburger Kampagne), von `SchulSaniApp <viktor@schulsaniapp.com>`.
3. Tracking in `kampagne_tracking.md` fortführen.

## Hinweis

Einige Schulen haben nur die Sekretariats-Allgemeinadresse veröffentlicht (z.B. `sekretariat@…`) statt einer persönlichen Schulleiter-Adresse. Die wurden trotzdem aufgenommen (Adresse verifiziert, Schulleitung im Feld vermerkt, wo bekannt).
