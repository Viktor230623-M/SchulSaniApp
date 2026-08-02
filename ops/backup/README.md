# Datensicherung SchulSani

Taegliche verschluesselte Sicherung der Produktivdatenbank, Aufbewahrung 30 Tage
gemaess Loeschkonzept.

## Einrichtung (einmalig, als root auf dem Server)

```sh
# Passphrase erzeugen und sichern — DIESE ZEICHENKETTE SEPARAT AUFBEWAHREN,
# ohne sie ist keine Sicherung lesbar.
openssl rand -base64 48 > /root/.schulsani-backup.key
chmod 600 /root/.schulsani-backup.key

install -m 700 ops/backup/schulsani-backup.sh /usr/local/bin/schulsani-backup.sh
install -m 700 ops/backup/schulsani-restore-test.sh /usr/local/bin/schulsani-restore-test.sh
install -m 644 ops/backup/schulsani-backup.service /etc/systemd/system/
install -m 644 ops/backup/schulsani-backup.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now schulsani-backup.timer
```

## Wiederherstellung im Ernstfall

```sh
gpg --batch --decrypt --passphrase-file /root/.schulsani-backup.key \
    --output /tmp/wiederherstellung.dump \
    /var/backups/schulsani/schulsani-JJJJ-MM-TT-HHMM.dump.gpg

sudo -u postgres pg_restore --no-owner --clean --dbname schulSani /tmp/wiederherstellung.dump
rm /tmp/wiederherstellung.dump
```

## Abweichender Datenbankname

Beide Skripte gehen von der Datenbank `schulSani` aus, lesen den Namen aber
aus `SCHULSANI_DB_NAME`, falls gesetzt. Bei einer Instanz mit anderem
Datenbanknamen die Variable vor dem Aufruf setzen bzw. im systemd-Unit
eintragen (siehe `schulsani-backup.service`).

## Regelmaessige Pruefung

`schulsani-restore-test.sh` vierteljaehrlich ausfuehren und das Ergebnis notieren.

## Offener Punkt

Die Sicherungen liegen auf derselben Platte wie die Produktivdatenbank. Sie
schuetzen gegen versehentliches Loeschen, fehlerhafte Migrationen und
Datenbankdefekte, **nicht** gegen einen Ausfall des Speichermediums. Eine
raeumlich getrennte Ablage steht noch aus.
