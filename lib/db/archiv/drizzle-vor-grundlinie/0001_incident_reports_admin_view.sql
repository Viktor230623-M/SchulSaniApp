-- Redigierte Sicht auf die Einsatzprotokolle fuer den administrativen Zugang.
--
-- Anlage 1 zum AV-Vertrag (Ziffer 1.3) sagt zu, dass die Patientenfelder aus dem
-- administrativen Datenbankzugang ausgeschlossen sind. Die SQL-Konsole verweigert
-- deshalb den lesenden Zugriff auf `incident_reports` und verweist hierher.
--
-- Enthalten sind ausschliesslich Felder ohne Patienten- und Gesundheitsbezug:
-- Verwaltungsdaten, Zeitstempel und Zuordnungen. Damit bleiben Betriebsfragen
-- beantwortbar ("wie viele Entwuerfe haengen seit Wochen?", "welches Protokoll
-- gehoert zu welchem Einsatz?"), ohne dass sichtbar wird, wem was gefehlt hat.
--
-- Bewusst NICHT enthalten und auch nicht nachtraeglich zu ergaenzen:
--   patient_first_name, patient_last_name, patient_class, patient_age,
--   emergency_contact_name, emergency_contact_phone, category, description,
--   injury_sites, measures, treatment_notes, pulse_bpm, spo2, resp_rate,
--   blood_pressure, consciousness_avpu, pain_score, outcome, outcome_notes,
--   witnesses, addenda_json
--
-- `patient_type` ist enthalten: Es unterscheidet nur Schueler/Lehrkraft/Gast und
-- ist fuer die Einsatzstatistik noetig, ohne eine Person zu bezeichnen.
--
-- Wird das Schema um ein Feld mit Gesundheitsbezug erweitert, darf es hier nicht
-- auftauchen und gehoert in PATIENT_COLUMNS (src/lib/patientColumns.ts).

CREATE OR REPLACE VIEW incident_reports_admin AS
SELECT
  id,
  school_id,
  mission_id,
  author_id,
  status,
  patient_type,
  incident_at,
  location,
  care_started_at,
  care_ended_at,
  responder_ids_json,
  created_at,
  updated_at,
  submitted_at
FROM incident_reports;

COMMENT ON VIEW incident_reports_admin IS
  'Einsatzprotokolle ohne Patienten- und Gesundheitsfelder. Zugang fuer die administrative Konsole; der Rohzugriff auf incident_reports ist dort gesperrt (Anlage 1 zum AV-Vertrag, Ziffer 1.3).';
