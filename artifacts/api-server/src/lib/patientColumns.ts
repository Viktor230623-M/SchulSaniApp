/**
 * Which parts of an incident report are patient data, and therefore off limits
 * to the administrative SQL console.
 *
 * Anlage 1 zum AV-Vertrag (Ziffer 1.3) sagt zu, dass die Patientenfelder aus dem
 * administrativen Datenbankzugang ausgeschlossen sind. Diese Datei ist die
 * technische Entsprechung dieser Zusage — sie ist bewusst eine eigene Datei, damit
 * die Liste bei einer Schemaerweiterung nicht in einer Guard-Funktion untergeht.
 *
 * Wird dem Schema ein neues Feld mit Patienten- oder Gesundheitsbezug hinzugefügt,
 * gehoert es HIER hinein und in die View `incident_reports_admin`. Ein vergessenes
 * Feld waere nicht nur ein Bug, sondern eine unzutreffende Aussage in einer
 * Vertragsanlage.
 */

/** Die Tabelle, deren Rohzugriff der Konsole verwehrt ist. */
export const PROTECTED_TABLE = "incident_reports";

/** Redigierte Sicht ohne Patienten- und Gesundheitsfelder. */
export const ADMIN_VIEW = "incident_reports_admin";

/**
 * Spalten mit Personenbezug zur versorgten Person oder mit Gesundheitsbezug.
 *
 * Bewusst weit gefasst: `category`, `description` und `outcome` klingen harmlos,
 * beschreiben aber Art der Verletzung und Ausgang der Versorgung — das sind
 * Gesundheitsdaten nach Art. 9 DSGVO, sobald sie an einer Protokoll-ID haengen.
 */
export const PATIENT_COLUMNS = [
  // Identitaet der versorgten Person
  "patient_first_name",
  "patient_last_name",
  "patient_class",
  "patient_age",
  "emergency_contact_name",
  "emergency_contact_phone",
  // Was vorgefallen ist
  "category",
  "description",
  "injury_sites",
  // Was getan wurde
  "measures",
  "treatment_notes",
  // Vitalwerte
  "pulse_bpm",
  "spo2",
  "resp_rate",
  "blood_pressure",
  "consciousness_avpu",
  "pain_score",
  // Ausgang
  "outcome",
  "outcome_notes",
  // Dritte und Freitext
  "witnesses",
  "addenda_json",
] as const;
