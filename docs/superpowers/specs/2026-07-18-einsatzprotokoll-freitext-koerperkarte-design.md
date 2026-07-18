# Einsatzprotokoll: Freitextfelder, Körperkarte, erweiterte Patientendaten

Datum: 2026-07-18
Status: freigegeben

## Problem

Kategorie und Maßnahmen sind starre Enums mit reiner Chip-Auswahl. Das wirkt unstrukturiert
und zwingt in Schubladen, die im Schulalltag nicht immer passen — alles Ungewöhnliche landet
in „Sonstige" und geht damit verloren. Außerdem fehlen: eine anschauliche Erfassung der
Verletzungsstelle, das Alter des Patienten und eine Notfallnummer.

## Entscheidungen

1. **Freitext ist die einzige Wahrheit.** Kategorie, Maßnahmen und Verletzungsstellen sind
   je ein Textfeld. Vorschlags-Chips schreiben nur hinein bzw. entfernen wieder. Die
   Markierung eines Chips wird aus dem Textinhalt abgeleitet, nie separat gespeichert —
   damit können Chips und Text nicht auseinanderlaufen.
2. **Trennzeichen ist `, `** (Komma + Leerzeichen).
3. **Körperkarte als SVG-Silhouette**, vorne und hinten, mit antippbaren Regionen. Kein
   Bild-Asset (Lizenz, Skalierung), Regionen sind als Text auswertbar.
4. **„Sonstige" entfällt** bei Kategorie und Maßnahmen (geht im Freitext auf), bleibt beim
   Patienten-Typ.
5. **Prod-DB ist leer** (0 Zeilen in `incident_reports`) — Schemaänderung ohne Datenmigration.

## Datenmodell (`lib/db/src/schema/index.ts`)

| Spalte | Änderung |
|---|---|
| `category` | Enum → Freitext, max 300 |
| `measures_json` | entfällt → neue Spalte `measures` (Freitext, max 500) |
| `injury_sites` | neu, Freitext, max 500 |
| `patient_age` | neu, `integer`, 0–120 |
| `emergency_contact_name` | neu, `text`, max 100 |
| `emergency_contact_phone` | neu, `text`, max 40 |
| `patient_type` | Wert `staff` → `teacher` (Label „Lehrkraft") |

`IncidentCategory` und `TreatmentMeasure` entfallen als Typen. An ihre Stelle treten reine
Vorschlagslisten: `CATEGORY_SUGGESTIONS`, `MEASURE_SUGGESTIONS`, `BODY_REGIONS_FRONT`,
`BODY_REGIONS_BACK`. `reassurance` wird zu „Psychische Betreuung".

## Komponenten

**`components/ChipTextField.tsx`** (neu) — Textfeld + Vorschlags-Chips. Props: `value`,
`onChange`, `suggestions`, `label`, `placeholder`, `multiline`. Regeln:
- Chip antippen: Begriff anhängen (mit `, `) bzw. entfernen, wenn schon vorhanden
- Aktiv-Zustand = Begriff kommt als eigenes Listenelement im Text vor (exakter Vergleich
  nach Trimmen, Groß-/Kleinschreibung egal)
- Beim Entfernen bleiben die übrigen Trennzeichen korrekt (kein `, , `)

**`components/BodyMap.tsx`** (neu) — zwei SVG-Silhouetten (vorne/hinten), je ~14 Regionen
als antippbare Pfade. Angetippte Region färbt sich in der Warnfarbe. Nutzt darunter dasselbe
`ChipTextField`-Verhalten; Auswahl wird aus dem Text abgeleitet.

**`app/report/[id].tsx`** — dreimal `chipRow` durch `ChipTextField` ersetzt, neuer Abschnitt
„Verletzungsstellen" zwischen Einsatzdetails und Behandlung, Patientenabschnitt um Alter und
Notfallkontakt erweitert (Label wechselt je Patienten-Typ: bei Schüler/in „Eltern /
Erziehungsberechtigte", sonst „Notfallkontakt"). Telefonnummer ist per `tel:` wählbar.

## Backend (`artifacts/api-server/src/routes/incidentReports.ts`)

- `VALID_CATEGORIES` / `VALID_MEASURES` entfallen; stattdessen Längenbegrenzung wie bei den
  übrigen Textfeldern (POST und PATCH).
- **Sicherheitskritisch:** `redactPatient()` muss `patientAge`, `emergencyContactName` und
  `emergencyContactPhone` mit entfernen — sonst wären es die ersten ungeschützten
  Patientendaten.
- `VALID_PATIENT_TYPES`: `staff` → `teacher`.
- PDF: Kategorie/Maßnahmen direkt als Text statt Label-Lookup; neue Zeilen für Alter,
  Notfallkontakt und Verletzungsstellen.

## i18n

Neue Keys (de/en): `patientAge`, `emergencyContact`, `emergencyContactParents`,
`emergencyContactName`, `emergencyContactPhone`, `sectionInjury`, `injurySites`,
`injurySitesPlaceholder`, `bodyFront`, `bodyBack`, `categoryPlaceholder`,
`measuresPlaceholder`. Die Label-Blöcke `categories`/`measures` schrumpfen auf die
Vorschlagslisten, `patientTypes.staff` → `patientTypes.teacher`.

## Deploy

Schema-Push auf die DB, Backend-Build + `pm2 restart sani-backend`, Web-Export.
`react-native-svg@15.12.1` ist bereits Dependency — **kein iOS-Rebuild nötig**.

## Bewusst nicht enthalten

- Statistik-Auswertung der Freitexte (widerspricht Entscheidung 1)
- Freie Pin-Positionen auf der Körperkarte (Koordinaten wären nicht auswertbar)
- Migration von Altdaten (keine vorhanden)
