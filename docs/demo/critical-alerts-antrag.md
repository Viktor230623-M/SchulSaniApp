# iOS Critical Alerts — Antrag & Umsetzung

Ziel: Schulsanitäter:innen bekommen den Einsatz-Alarm auch bei **stumm**
geschaltetem iPhone (Ringer-Aus, Fokus/„Bitte nicht stören"). Dafür braucht die
App das Apple-Entitlement `com.apple.developer.usernotifications.critical-alerts`.
Ohne Antrag geht das nicht — Apple prüft jeden Antrag manuell.

**Stand der Daten:**
- Bundle-ID: `com.schulsani.app`
- App-Name: SchulSani (Store-Name siehe STORE_LISTING)
- APNs-Code: existiert bereits (`api-server/src/lib/push/apns.ts`, inhaltsleere Payloads)
- Expo: `expo-notifications` mit Sounds (`alarm.wav`)

---

## 1. Der Antrag (musst du stellen, ~10 Min)

1. Als **Account Holder** (nicht als Admin/Member) auf
   https://developer.apple.com anmelden — das Konto, dem die App gehört.
2. Formular öffnen:
   **https://developer.apple.com/contact/request/notifications-critical-alerts**
3. App identifizieren: App-Name **SchulSani**, Bundle-ID **com.schulsani.app**.
4. Begründung aus Abschnitt 2 unten einfügen (englisch, das Formular ist englisch).
5. Absenden. **Bearbeitungszeit: Tage bis wenige Wochen**, Rückfragen von Apple sind normal.

Wichtig: Der Antrag wird nur genehmigt, wenn die Begründung einen klaren
Gesundheits-/Sicherheitskontext zeigt. Unsere App ist ein Schul-Sanitätsdienst
— das passt in die Kategorie „Health & safety". Kein Marketing-Gelaber in der
Begründung, nur der konkrete Notfall.

---

## 2. Fertige Begründung (englisch, einfügen)

> **Purpose of the app**
> SchulSani is a school paramedic (Schulsanitätsdienst) app used by German
> secondary schools. Trained student paramedics respond to medical incidents
> at school: injuries, collapses, allergic reactions, seizures, circulatory
> problems. The app alerts the on-duty team, documents the incident at the
> scene, and exports the legally required documentation as PDF.
>
> **Why the alert is critical**
> When a student collapses or has a seizure, every second counts. The
> on-duty paramedics are often in class, with their phones silenced or in
> school-mandated Focus modes. A standard or time-sensitive notification
> would be missed. The critical alert is the only way to guarantee the
> paramedic team is actually reached — including when the ringer is off.
> Missing the alert can delay first aid for a student in a medical emergency.
>
> **Why a normal notification is not sufficient**
> German schools require phones to be muted during class. Without critical
> alerts, the alarm is silently swallowed by the mute switch or Focus mode,
> and nobody arrives at the incident. This is a genuine health consequence,
> not an engagement prompt.
>
> **Who is affected**
> Student paramedics (trained first responders) and the students they treat,
> typically aged 10–18, at schools using the app.
>
> **User consent**
> Critical alerts are an opt-in: each paramedic grants the permission
> separately on their own device and can revoke it in Settings at any time.
> The app never uses critical alerts for marketing or routine messages —
> only for a new emergency incident.

---

## 3. Nach der Genehmigung: Code-Änderungen

Drei Stellen, in dieser Reihenfolge. Erst umsetzen, wenn Apple das
Entitlement freigegeben hat — vorher würde ein Build mit dem Entitlement von
Apple abgelehnt.

### 3a. Entitlement in `app.json` (ios.entitlements)

```json
"ios": {
  "entitlements": {
    "aps-environment": "production",
    "com.apple.developer.usernotifications.critical-alerts": true
  }
}
```

(`aps-environment` ist aktuell `development` — für den Store-Build auf
`production` stellen, das macht ohnehin der Store-Upload.)

### 3b. Client: Critical-Alert-Berechtigung anfragen

In `services/PushNotificationService.ts`, Funktion
`requestNotificationPermissions`, den iOS-Zweig erweitern:

```ts
if (Platform.OS === "ios") {
  await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: true, // UNAuthorizationOptions.criticalAlert
    },
  });
}
```

(Genau ein `requestPermissionsAsync` — nicht doppelt anfragen, sonst fragt
iOS zweimal. Vorhandene Logik prüfen und zusammenführen.)

### 3c. Server: Critical-Sound im APNs-Payload

In `api-server/src/lib/push/apns.ts` bei **hoher Priorität** (`priority ===
"high"`) den Sound als Critical-Objekt senden:

```ts
aps: {
  alert: { title: payload.title },
  ...(payload.priority === "high"
    ? {
        "interruption-level": "critical",
        sound: { critical: 1, name: "alarm.wav", volume: 1.0 },
      }
    : { sound: "default" }),
  ...(payload.priority === "high" ? { "content-available": 1 } : {}),
}
```

Nur Einsatz-Alarme mit hoher Priorität werden kritisch — Benachrichtigungen
und Erinnerungen bleiben normal. Die Kopplung „hohe Priorität → Critical"
muss im Aufrufer (dort, wo die Mission erzeugt wird) schon so sein.

---

## 4. Test nach der Umsetzung

1. Gerät: iPhone mit stumm geschaltetem Ringer + aktivem Fokus-Modus.
2. In der App: Benachrichtigungen erlauben, „Kritische Warnungen" im
   iOS-Settings-Bereich der App aktiviert (der Nutzer muss sie separat
   bestätigen).
3. Von einem zweiten Gerät einen Test-Einsatz mit hoher Priorität auslösen.
4. Erwartung: Alarm-Ton + Banner erscheinen trotz Stummschaltung.
5. Gegenprobe: normale Benachrichtigung (niedrige Priorität) erscheint bei
   stumm NICHT — nur der Einsatz-Alarm.

## 5. Alternativ, falls Apple ablehnt

**Time-Sensitive Notifications** (kein Entitlement nötig): durchbrechen den
Fokus-Modus, respektieren aber die Stummschaltung. Besser als nichts, aber
nicht vollständig. Zweiter Anlauf mit schärferer Begründung ist üblich —
Apple fragt oft nach.
