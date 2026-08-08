# Zentraler Callback-Relay

Leitet OIDC-Rueckspruenge (Apple, Google, Microsoft) an die richtige Schul-Instanz weiter.

## Warum

Die Anbieter akzeptieren nur exakt registrierte Redirect-URIs. Statt fuer jede
Instanz eine eigene Registrierung zu pflegen, zeigen Instanzen im Relay-Modus
auf EINE gemeinsame Domain (z. B. `auth.schulsani.app`). Der `state`-Parameter
traegt die Herkunft der Instanz als Praefix:

```
state = https://sani.schule.de|<opaque-token>
```

Der Relay liest den Praefix, prueft ihn gegen die Freigabeliste und reicht den
Ruecksprung unveraendert an die Instanz weiter. Dort macht die Instanz die
eigentliche Pruefung (state gegen pendingRequests, Nonce, ID-Token-Signatur).

## Betrieb

```sh
pm2 start ops/relay/server.js --name sani-relay
```

Umgebung:

| Variable | Bedeutung |
|---|---|
| `RELAY_PORT` | Port, Default 3004 |
| `RELAY_ALLOWED_ORIGINS` | Kommagetrennte Liste erlaubter Instanz-Origins (https) |
| `RELAY_ALLOWED_ORIGINS_FILE` | Alternativ: Pfad zu einer JSON-Liste |

nginx auf der zentralen Domain:

```nginx
location /api/auth/ {
    proxy_pass http://127.0.0.1:3004;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    # Ohne diesen Header sieht der Relay hinter nginx nur die Loopback-Adresse
    # und reicht die als Client-IP an die Instanz weiter.
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

`/healthz` antwortet mit 200.

## Freigabeliste

Jede Instanz, die den Relay nutzt, muss hier eingetragen werden. Der Eintrag
ist exakt der Origin, den die Instanz als `AUTH_RELAY_BASE_URL`-Praefix in
ihren state schreibt — derselbe Wert, der in ihrer `ALLOWED_ORIGINS` steht.
Ohne Freigabe antwortet der Relay mit 404, ohne zu verraten, was fehlt.

## Instanzseite

Eine Instanz nutzt den Relay, indem sie `AUTH_RELAY_BASE_URL` setzt (z. B.
`https://auth.schulsani.app`). Dann:

- Alle OIDC-Redirect-URIs zeigen auf `AUTH_RELAY_BASE_URL/api/auth/<key>/callback`
- Der state traegt den Praefix der eigenen Herkunft
- Die Session-Cookies bekommen das `Domain`-Attribut der Instanz (abgeleitet
  aus `ALLOWED_ORIGINS`), weil der Browser waehrend des Ruecksprungs auf der
  zentralen Domain steht

Beim Anbieter muss genau EINE Redirect-URI registriert werden, die zentrale.
Die Apple-`sub`-Werte der Instanzen bleiben davon unberuehrt.

## Bewusst nicht hier

Kein Speichern von Tokens, keine Sessions, keine Datenbank. Der Relay ist ein
dummer, durch die Freigabeliste begrenzter Proxy — ein Ausfall kostet nur den
Login-Vorgang, nie Daten.
