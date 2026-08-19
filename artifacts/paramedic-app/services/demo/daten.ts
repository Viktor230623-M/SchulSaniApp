import type {
  IncidentReport,
  Mission,
  NewsItem,
  NotificationItem,
  RoleInfo,
  Shift,
  User,
} from "@/models";

/**
 * Erfundener Sanitätsdienst fuer die oeffentliche Vorschau. Die Zeiten haengen
 * am aktuellen Tag, damit die Vorschau nicht mit jedem Monat aelter aussieht;
 * die Uhrzeiten stehen fest, damit Bildschirmfotos vergleichbar bleiben.
 */
const SCHULE = "demo-schule";

function heute(stunde: number, minute: number, tageVersatz = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + tageVersatz);
  d.setHours(stunde, minute, 0, 0);
  return d.toISOString();
}

function montagDieserWoche(): Date {
  const d = new Date();
  const versatz = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - versatz);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inDerWoche(wochentag: number, stunde: number, minute: number): string {
  const d = montagDieserWoche();
  d.setDate(d.getDate() + wochentag);
  d.setHours(stunde, minute, 0, 0);
  return d.toISOString();
}

export const ICH: User = {
  id: "u-lena",
  firstName: "Lena",
  lastName: "Sommer",
  email: "lena.sommer@demo-schule.de",
  phone: "",
  role: "sanitaeter",
  schoolId: SCHULE,
  isApproved: true,
  permissions: [
    "missions.view",
    "missions.create",
    "missions.accept",
    "reports.view",
    "reports.create",
    "reports.submit",
    "roster.view",
    "roster.join",
    "roster.manage",
    "news.view",
    "status.set",
  ],
  profileConfirmedAt: heute(7, 40, -30),
  createdAt: heute(8, 0, -120),
  updatedAt: heute(7, 40, -30),
};

export const TEAM: User[] = [
  ICH,
  {
    ...ICH,
    id: "u-jonas",
    firstName: "Jonas",
    lastName: "Weber",
    email: "jonas.weber@demo-schule.de",
    role: "sanitaeter",
  },
  {
    ...ICH,
    id: "u-mia",
    firstName: "Mia",
    lastName: "Kraus",
    email: "mia.kraus@demo-schule.de",
    role: "sanitaeter",
  },
  {
    ...ICH,
    id: "u-herr-bauer",
    firstName: "Thomas",
    lastName: "Bauer",
    email: "t.bauer@demo-schule.de",
    role: "teacher",
    permissions: [...(ICH.permissions ?? []), "users.view", "reports.viewAll", "roster.manage"],
  },
];

export const EINSAETZE: Mission[] = [
  {
    id: "m-1",
    title: "Kreislaufprobleme",
    description: "Schülerin fühlt sich schwindelig, Blutdruck niedrig",
    location: "Flur, 2. Obergeschoss",
    priority: "medium",
    status: "pending",
    requestedAt: heute(9, 12),
    scheduledFor: heute(9, 12),
    patientInfo: "11. Klasse, hatte heute nichts gegessen",
  },
  {
    id: "m-2",
    title: "Kopfverletzung beim Sport",
    description: "Sturz beim Völkerball, Verdacht auf leichte Gehirnerschütterung",
    location: "Sporthalle",
    priority: "high",
    status: "accepted",
    requestedAt: heute(8, 41),
    scheduledFor: heute(8, 41),
    assignedParamedicId: ICH.id,
    patientInfo: "9. Klasse, kurze Bewusstlosigkeit unklar",
  },
  {
    id: "m-3",
    title: "Bauchschmerzen im Unterricht",
    description: "Schüler klagt über starke Bauchschmerzen seit der zweiten Stunde",
    location: "Klassenraum 2B",
    priority: "medium",
    status: "accepted",
    requestedAt: heute(8, 5),
    scheduledFor: heute(8, 5),
    assignedParamedicId: "u-jonas",
  },
  {
    id: "m-4",
    title: "Nasenbluten",
    description: "Nach Zusammenstoß in der Pause, Blutung steht bereits",
    location: "Schulhof",
    priority: "low",
    status: "completed",
    requestedAt: heute(11, 20, -1),
    scheduledFor: heute(11, 20, -1),
    assignedParamedicId: ICH.id,
  },
  {
    id: "m-5",
    title: "Insektenstich mit Schwellung",
    description: "Wespenstich am Unterarm, keine bekannte Allergie",
    location: "Pausenhof, Bank an der Turnhalle",
    priority: "medium",
    status: "completed",
    requestedAt: heute(13, 5, -2),
    scheduledFor: heute(13, 5, -2),
    assignedParamedicId: "u-mia",
  },
];

export const SCHICHTEN: Shift[] = [
  {
    id: "s-mo",
    schoolId: SCHULE,
    title: "Sanitätsdienst",
    location: "Sanitätsraum",
    startsAt: inDerWoche(0, 7, 30),
    endsAt: inDerWoche(0, 13, 0),
    createdAt: heute(8, 0, -14),
    updatedAt: heute(8, 0, -14),
    members: [
      { userId: "u-lena", userName: "Lena Sommer" },
      { userId: "u-jonas", userName: "Jonas Weber" },
    ],
  },
  {
    id: "s-di",
    schoolId: SCHULE,
    title: "Sanitätsdienst",
    location: "Sanitätsraum",
    startsAt: inDerWoche(1, 7, 30),
    endsAt: inDerWoche(1, 13, 0),
    createdAt: heute(8, 0, -14),
    updatedAt: heute(8, 0, -14),
    members: [{ userId: "u-mia", userName: "Mia Kraus" }],
  },
  {
    id: "s-mi",
    schoolId: SCHULE,
    title: "Sanitätsdienst",
    location: "Sanitätsraum",
    startsAt: inDerWoche(2, 7, 30),
    endsAt: inDerWoche(2, 13, 0),
    createdAt: heute(8, 0, -14),
    updatedAt: heute(8, 0, -14),
    members: [
      { userId: "u-jonas", userName: "Jonas Weber" },
      { userId: "u-mia", userName: "Mia Kraus" },
    ],
  },
  {
    id: "s-do",
    schoolId: SCHULE,
    title: "Sanitätsdienst",
    location: "Sanitätsraum",
    startsAt: inDerWoche(3, 7, 30),
    endsAt: inDerWoche(3, 13, 0),
    createdAt: heute(8, 0, -14),
    updatedAt: heute(8, 0, -14),
    members: [{ userId: "u-lena", userName: "Lena Sommer" }],
  },
  {
    id: "s-fr",
    schoolId: SCHULE,
    title: "Sanitätsdienst",
    location: "Sanitätsraum",
    startsAt: inDerWoche(4, 7, 30),
    endsAt: inDerWoche(4, 12, 0),
    createdAt: heute(8, 0, -14),
    updatedAt: heute(8, 0, -14),
    members: [],
  },
  {
    id: "s-sporttag",
    schoolId: SCHULE,
    title: "Sporttag, Aufsicht Laufbahn",
    location: "Sportplatz",
    startsAt: inDerWoche(4, 9, 0),
    endsAt: inDerWoche(4, 15, 0),
    createdAt: heute(8, 0, -7),
    updatedAt: heute(8, 0, -7),
    members: [{ userId: "u-herr-bauer", userName: "Thomas Bauer" }],
  },
];

/**
 * Ohne `contentEncrypted` laesst der Client den Inhalt unangetastet stehen --
 * in der Vorschau gibt es deshalb weder Schluessel noch Entsperrung.
 */
export const PROTOKOLLE: IncidentReport[] = [
  {
    id: "r-1",
    schoolId: SCHULE,
    missionId: "m-2",
    missionTitle: "Kopfverletzung beim Sport",
    authorId: ICH.id,
    status: "draft",
    patientType: "student",
    patientFirstName: "Marie",
    patientLastName: "Fischer",
    patientClass: "9b",
    patientAge: 15,
    incidentAt: heute(8, 45),
    location: "Sporthalle",
    careStartedAt: heute(8, 48),
    category: "head_injury",
    description:
      "Sturz beim Völkerball auf den Hinterkopf. Kurz benommen, ansprechbar, keine Erinnerungslücke.",
    injurySites: "Hinterkopf",
    measures: "Kühlung, Ruhelagerung, Beobachtung",
    pulseBpm: 78,
    spo2: 98,
    consciousnessAvpu: "A",
    painScore: 3,
    outcome: "picked_up_by_parents",
    responderIds: [ICH.id],
    createdAt: heute(8, 48),
    updatedAt: heute(9, 2),
  },
  {
    id: "r-2",
    schoolId: SCHULE,
    missionId: "m-4",
    missionTitle: "Nasenbluten",
    authorId: ICH.id,
    status: "submitted",
    patientType: "student",
    patientFirstName: "Elias",
    patientLastName: "Hoffmann",
    patientClass: "7a",
    patientAge: 13,
    incidentAt: heute(11, 22, -1),
    location: "Schulhof",
    careStartedAt: heute(11, 24, -1),
    careEndedAt: heute(11, 38, -1),
    category: "nosebleed",
    description: "Zusammenstoß beim Fangenspielen, Blutung nach wenigen Minuten gestillt.",
    measures: "Kopf nach vorn, Nasenflügel komprimiert, Kühlung im Nacken",
    pulseBpm: 88,
    consciousnessAvpu: "A",
    painScore: 2,
    outcome: "back_to_class",
    responderIds: [ICH.id],
    createdAt: heute(11, 24, -1),
    updatedAt: heute(11, 40, -1),
    submittedAt: heute(11, 40, -1),
  },
];

export const NEUIGKEITEN: NewsItem[] = [
  {
    id: "n-1",
    title: "Auffrischung Herz-Lungen-Wiederbelebung",
    summary: "Nächsten Donnerstag, 14 Uhr, Sanitätsraum",
    content:
      "Wir gehen die Reanimation und den Umgang mit dem AED noch einmal durch. Dauer etwa 90 Minuten, Teilnahme zählt als Dienststunde.",
    category: "training",
    status: "approved",
    publishedAt: heute(15, 10, -2),
    author: "Thomas Bauer",
    authorId: "u-herr-bauer",
    isRead: false,
  },
  {
    id: "n-2",
    title: "Neue Sanitätstaschen sind da",
    summary: "Zwei Taschen komplett neu bestückt",
    content:
      "Die alten Taschen sind ausgemustert. Wer eine Tasche mitnimmt, trägt sie bitte wie gewohnt in die Liste ein.",
    category: "announcement",
    status: "approved",
    publishedAt: heute(9, 30, -5),
    author: "Thomas Bauer",
    authorId: "u-herr-bauer",
    isRead: false,
  },
];

export const BENACHRICHTIGUNGEN: NotificationItem[] = [
  {
    id: "b-1",
    userId: ICH.id,
    type: "mission_created",
    title: "Neuer Einsatz",
    body: "Kreislaufprobleme, Flur 2. Obergeschoss",
    isRead: false,
    priority: "high",
    createdAt: heute(9, 12),
    relatedId: "m-1",
  },
  {
    id: "b-2",
    userId: ICH.id,
    type: "news",
    title: "Auffrischung Herz-Lungen-Wiederbelebung",
    body: "Nächsten Donnerstag, 14 Uhr, Sanitätsraum",
    isRead: false,
    priority: "normal",
    createdAt: heute(15, 10, -2),
    relatedId: "n-1",
  },
];

export const ROLLEN: RoleInfo[] = [
  {
    id: "rl-1",
    key: "sanitaeter",
    displayName: "Sanitäter:in",
    displayNameEn: "Paramedic",
    color: "#22C55E",
    sortOrder: 10,
    isSystem: true,
    userCount: 3,
  },
  {
    id: "rl-2",
    key: "teacher",
    displayName: "Betreuende Lehrkraft",
    displayNameEn: "Supervisor",
    color: "#0EA5E9",
    sortOrder: 20,
    isSystem: true,
    userCount: 1,
  },
];
