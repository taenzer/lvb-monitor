# LVB-Abfahrtsmonitor

Zeigt die nächsten Abfahrten an beliebig vielen Haltestellen in Leipzig und Umgebung, mit
**Echtzeitdaten**: Verspätung, Ausfälle und Hinweise.

## Starten

```bash
npm start            # oder: PORT=8080 node server.js
```

Dann <http://localhost:3000> öffnen. Benötigt Node ≥ 18 und hat keine Abhängigkeiten.

**Version:** Im Docker-Image ist es der Release-Tag (`APP_VERSION`, von der Pipeline gesetzt),
lokal die Version aus `package.json`. Versioniert wird ohne „v“: Tag `1.2.0` → „Version 1.2.0“.
Der Server setzt sie in die Fußzeile (Platzhalter `__APP_VERSION__` in `public/index.html`),
in `/healthz` und in den User-Agent der Anfragen an die LVB ein.

Schneller Test ohne Anfragen an die LVB: `sh test/smoke.sh` (oder `APP_VERSION=1.2.0 sh test/smoke.sh`).

| Umgebungsvariable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port |
| `APP_VERSION` | Version aus `package.json` | angezeigte Version (im Image der Release-Tag) |
| `UPSTREAM_RATE` | `5` | Anfragen pro Sekunde an die LVB, im Mittel |
| `UPSTREAM_BURST` | `10` | so viele Anfragen kurzzeitig auf einmal |
| `UPSTREAM_QUEUE` | `100` | wartende Anfragen; darüber antwortet der Server mit 503 |
| `DEBUG` | – | jede Anfrage an die LVB loggen |

## Bedienung

- **+ Haltestelle**: Haltestelle suchen und hinzufügen. Die Anzahl ist nicht begrenzt.
  Jede Haltestelle bekommt einen Tab, angezeigt wird immer nur eine. Die Tabs lassen sich
  auch mit Pfeiltasten, Pos1 und Ende wechseln.
- **Favorit (Stern neben dem Namen)**: Der Favorit wird beim Öffnen der Seite oder eines Links
  immer zuerst angezeigt, unabhängig davon, welcher Tab zuletzt offen war. Zu Beginn ist die
  erste Haltestelle der Favorit; wird er entfernt, rückt die erste Haltestelle nach.
- **Bearbeiten**: Die Einstellungen gelten für den offenen Tab. „Fertig“ neben dem Papierkorb
  beendet das Bearbeiten (auf dem Handy stehen diese Knöpfe in einer Zeile unter dem Namen):
  - **Name**, **Zeilenzahl**, **Tab-Reihenfolge** (← →), **Entfernen**
  - **Fußweg**: Minuten bis zur Haltestelle (leer oder 0 = aus), siehe unten
  - **Verkehrsmittel**: Tram, Bus, S-Bahn, Zug, Rufbus
  - **Linien**:
    - *Alle*: kein Linienfilter.
    - *Nur …*: nur die markierten Linien. Neue Linien bleiben ausgeblendet.
    - *Alle außer …*: markierte Linien ausblenden, alle anderen zeigen.

    Zur Auswahl stehen alle Linien der nächsten Stunde. Weitere Linien (z. B. Nachtbusse)
    lassen sich über das Feld „+ Linie“ ergänzen.
  - **Richtungen**: eigener Name je Steig, z. B. „In die Stadt“ (siehe unten)
- **Teilen**: Kopiert die aktuelle URL in die Zwischenablage. Auf dem Handy öffnet sich
  stattdessen das Teilen-Menü.
- **Lokale Daten löschen** (Fußzeile, unter Impressum/Datenschutz): Entfernt nach einer Rückfrage alles, was die
  Seite auf dem Gerät gespeichert hat (alle `localStorage`-Einträge mit `lvb-monitor.`),
  und leert die Adresszeile. Geteilte Links und Lesezeichen
  funktionieren weiter, weil sie ihr Setup selbst enthalten.
- **Kopfzeile**: Unter „Abfahrten“ steht der Live-Status („Live · gerade eben“, bei
  Verbindungsproblemen „Stand 17:05“). Der Knopf ↻ daneben lädt sofort neu, statt auf den
  30-Sekunden-Takt zu warten; der Server liefert dabei höchstens 20 s alte Daten.
  Auf schmalen Bildschirmen stecken „Haltestelle“, „Teilen“ und „Bearbeiten“ in einem Menü
  hinter dem Burger-Knopf.

### Abfahrtszeile

- **Rechts, in einer Zeile:** die tatsächliche Abfahrtszeit klein (grau, rot bei Verspätung),
  dann groß die Minuten bis zur Abfahrt. Die geplante Zeit bzw. „keine Echtzeitdaten“ steht
  im Tooltip der Uhrzeit. Bei ausgefallenen Fahrten steht die geplante Uhrzeit
  durchgestrichen vor „Fällt aus“. Alle Uhrzeiten stehen bündig untereinander.
- **Links:** Linie und Ziel. Hinter dem Ziel stehen bei Verspätung ein rotes Badge („+3“) und
  bei einem Hinweis der LVB (z. B. Bauarbeiten) ein ⚠; ein Klick darauf zeigt den Text.
  Darunter steht nur der Fußweg-Hinweis, ohne Fußweg ist die Zeile einzeilig.

### Richtungen

Die Abfahrtsliste ist nach Richtung gruppiert, jede Richtung steht in einer eigenen Karte.
Ein Ziel muss man dafür nicht angeben.

- **Richtung = Haltepunkt.** Die LVB-Daten nennen zu jeder Abfahrt den konkreten Bahn- oder
  Bussteig (`stop_id`, z. B. `1016801` an der Hohen Str.). Jeder Haltepunkt bedient eine
  Fahrtrichtung, und genau dorthin läuft man auch. Die Gruppen sind fest nach Haltepunkt
  sortiert, damit nichts springt.
- **Beschriftung:** automatisch mit den zwei häufigsten Zielen der nächsten Stunde
  („Richtung Schkeuditz, Hauptbahnhof“), rechts der Steig, falls bekannt.
- **Umbenennen:** Unter „Bearbeiten“ → „Richtungen“ steht je Haltepunkt ein Feld mit der
  automatischen Beschriftung. Man überschreibt sie einfach (bis 60 Zeichen), z. B. mit
  „In die Stadt“. Ist eine Richtung umbenannt, steht darunter „Standard: …“, und der Knopf
  ↺ daneben stellt die Automatik wieder her. Ein geleertes Feld oder genau der Standardtext
  gilt als nicht umbenannt. Im Gruppenkopf bleibt der Standard als Tooltip erhalten.
  Namen für Haltepunkte, die gerade nicht in den Daten sind (z. B. Nachtbus-Steige am Tag),
  bleiben gespeichert und bearbeitbar.
- **Ausblenden:** Das Auge neben ↺ blendet eine Richtung aus oder wieder ein. Ausgeblendete
  Richtungen fehlen in der Liste; unten steht dann „1 Richtung ausgeblendet“, ein Klick darauf
  öffnet die Einstellung. In den Einstellungen sind sie blasser und mit „Ausgeblendet“
  markiert. Die Zeilenzahl verteilt sich nur auf die sichtbaren Richtungen.
- **Zeilenzahl:** wird auf die Richtungen verteilt, mindestens zwei Abfahrten je Richtung.

### Wann losgehen?

Ist ein Fußweg eingetragen, bekommt jede Abfahrt einen Hinweis, ob sie zu Fuß noch zu
schaffen ist. Rechts steht weiterhin, in wie vielen Minuten die Bahn fährt. Direkt hinter
dem Haltestellennamen steht „5 min Fußweg“ (bei langen Namen in der Zeile darunter); ein Klick
darauf öffnet die Einstellung.

- **Rechnung:** Puffer = Minuten bis zur Abfahrt (mit Echtzeit-Verspätung) − Fußweg.

  | Puffer | Hinweis in der Zeile |
  |---|---|
  | ≥ 2 min | grün „los in X min“ (Tooltip: „Los um 22:08“) |
  | 0 bis 2 min | violett „jetzt los“ |
  | bis −30 % des Fußwegs | orange „beeilen“ (Tooltip: „zügig gehen“ bis 15 % schneller, sonst „Laufschritt“) |
  | darunter | grau „nicht zu schaffen“, Zeile ausgegraut |

- **Was angezeigt wird:** Je Richtung steht vor der ersten erreichbaren Abfahrt nur die
  zuletzt verpasste (zur Orientierung), ältere fallen weg. Ist in einer Richtung nichts
  mehr zu schaffen, steht das unter der Gruppe.
- Ausgefallene Fahrten bekommen keinen Hinweis. Ohne Echtzeitdaten steht „laut Fahrplan“ im
  Tooltip des Hinweises. Linien- und Verkehrsmittelfilter gelten auch hier.
- Ohne Fußweg (leer oder 0) bleibt die Liste nach Richtung gruppiert, nur ohne Hinweise.

Die Seite folgt dem Hell- oder Dunkelmodus des Geräts. Sie lädt keine externen Schriften oder
Skripte, es gibt also auch keine Anfragen an Dritte.

## Setup, Link und Speicherung

Das komplette Setup steht als kompakter Code im Fragment der URL (der Teil hinter `#`):

```
/#AQEAMsgAABdIYXVwdGJhaG5ob2YgKFRyYW0vQnVzKQAsUQBFCUhvaGUgU3RyLgEPg-EMSW4gZGllIFN0YWR0ADLKAAANQXVndXN0dXNwbGF0eg
```

(Hauptbahnhof; Hohe Str. als Favorit mit 5 min Fußweg und der Richtung „In die Stadt“;
Augustusplatz.)

Zum Setup gehören die Haltestellen mit ihren Einstellungen (inklusive Fußweg, eigener
Richtungsnamen und ausgeblendeter Richtungen), ihre Reihenfolge und der Favorit.
Welcher Tab gerade offen ist, gehört nicht dazu.

Gleiches Setup ergibt immer denselben Link. Damit taugt er als Lesezeichen und zum Teilen.

**Kein Hash im kryptografischen Sinn.** Ohne Speicher auf dem Server muss der Link das Setup
selbst enthalten. Er ist kodiert, nicht verschlüsselt: Wer sich auskennt, kann ihn dekodieren.

Das Format ist Base64url eines kleinen Binärformats (Details in `encodeSetup()` in
`public/index.html`):

```
Byte 0: Formatversion (1; andere Versionen werden abgelehnt)
Byte 1: Index des Favoriten
je Haltestelle:
  3 Byte  ID (uint24, 7-stellig mit führenden Nullen)
  1 Byte  Flags: Bit 0–4 Verkehrsmittel (t,b,s,z,r; 0 = alle)
                 Bit 5–6 Linienmodus (0 alle, 1 nur, 2 alle außer)
                 Bit 7   Zeilenzahl weicht vom Standard (8) ab
  1 Byte  Extra: Bit 0–5 Fußweg in Minuten, 0–60 (0 = aus)
                 Bit 6   eigene Richtungsnamen folgen
                 Bit 7   ausgeblendete Richtungen folgen
  [1 Byte Zeilenzahl]
  1 Byte Länge + Name (UTF-8)
  [1 Byte Anzahl Linien + je Linie: 1 Byte Länge + Text]
  [1 Byte Anzahl Richtungen + je Richtung: 3 Byte Haltepunkt-ID + 1 Byte Länge + Name]
  [1 Byte Anzahl ausgeblendeter Richtungen + je Richtung: 3 Byte Haltepunkt-ID]
```

Kaputte, abgeschnittene oder unbekannte Codes führen zur leeren Startseite bzw. zum lokal
gespeicherten Setup, nie zu einem Absturz.

**Keine Daten auf dem Server.** Browser schicken das URL-Fragment nie an den Server.
Das Setup liegt nur im Link und im `localStorage` des Geräts (Schlüssel `lvb-monitor.setup`).
Linienfilter wirken nur im Browser; der Server erfährt nur Haltestellen-ID und Verkehrsmittel.

Wie die Seite URL und lokalen Speicher zusammenbringt:

| Aufruf | Verhalten |
|---|---|
| `/` ohne `#` | Lädt das lokal gespeicherte Setup und schreibt es in die URL |
| Link mit Setup, lokal noch nichts gespeichert | Zeigt das Setup und speichert es als eigenes |
| Link mit fremdem Setup, lokal schon eines vorhanden | Zeigt das fremde Setup mit einem Banner „Übernehmen“ / „Meine Haltestellen“. Das eigene Setup bleibt erhalten, bis man übernimmt oder etwas ändert. |
| Jede Änderung | Wird sofort lokal gespeichert, und die URL wird aktualisiert |

## Datenquelle

Die Daten stammen aus dem öffentlichen Haltestellenmonitor der LVB, <https://stationboard.l.de>.

- **Abfahrten:** `GET /monitor/<id>` mit Header `RSC: 1`. Die Antwort ist der Next.js-RSC-Payload.
  Eine Zeile darin enthält `{"trips":[…]}` mit allen Abfahrten der nächsten ~60 Minuten.
  Sie hat GTFS-Felder und Echtzeitdaten: `departure_date`, `departure_time`,
  `departure_delay` (Sekunden, `null` = keine Echtzeit), `trip_cancelled`, `route_color`,
  `track` und `alerts`. `?transporttypes=` filtert auf dem Server.
  Bei einer unbekannten ID enthält die Antwort statt `trips` eine Fehlerzeile `E{…}`.
- **Haltestellensuche:** `GET /api/stops?searchTerm=…` liefert JSON. Die ID steht in `tags.stop_id`.
  Die Suche nach einer ID liefert nichts, und der Monitor-Payload enthält keinen Namen.
  Deshalb steht der Name mit im Link.
- Keiner der beiden Endpunkte sendet CORS-Header, deshalb leitet `server.js` die Anfragen weiter.

Der Server bietet zwei Endpunkte an:

- `/api/departures?stop=…&types=tram_bus`: Abfahrten als bereinigte Liste.
  Die Zeiten sind Epoch-ms, wobei `when` die geplante Zeit plus Verspätung ist.
- `/api/stops?q=…`: die Haltestellensuche.

Die Seite lädt nur die Haltestelle im offenen Tab, alle 30 s und nur solange sie sichtbar ist.
Beim Tabwechsel erscheinen sofort die zuletzt bekannten Abfahrten, dann wird aktualisiert.

## Schutz der LVB-Schnittstelle

- **Tempolimit:** Alle Anfragen an die LVB teilen sich einen Token-Bucket. Standard sind
  im Mittel 5 pro Sekunde, kurzzeitig 10. Weitere Anfragen warten in einer Schlange.
  Ist die Schlange voll, antwortet der Server mit 503, und die Seite versucht es beim
  nächsten Takt erneut.
- **Cache:** Abfahrten werden 20 s pro Haltestelle und Verkehrsmittel-Filter gespeichert,
  Suchergebnisse 10 min. Fehler, etwa bei ungültigen IDs, werden 15 s gemerkt.
  Gleichzeitige Anfragen werden zusammengelegt. Viele Nutzer derselben Haltestelle erzeugen
  so höchstens 3 Anfragen pro Minute. Der Cache hat eine feste Obergrenze.

## Deployment (Docker, Drone CI, Portainer)

Ein **GitHub-Release** löst das Deployment aus:

1. Beim Veröffentlichen des Releases legt GitHub den Tag an, ohne „v“ (z. B. `1.2.0`).
   Tag-Name, angezeigte Version und Image-Tag sind identisch.
2. Drone startet die Pipeline aus `.drone.yml` mit dem Ereignis `tag`:
   - **Smoke-Test**: `test/smoke.sh` startet den Server und prüft Seite, `/healthz` und Version.
   - **Image**: baut `Dockerfile` mit `APP_VERSION=<Tag>` und lädt es als
     `registry.der-taenzer.net/tnz/lvb-monitor:<Tag>` und `:latest` hoch.
   - **Deploy**: ruft den Webhook des Portainer-Stacks auf (`?APP_VERSION=<Tag>`), Portainer
     rollt neu aus.
3. Die Fußzeile zeigt danach die neue Version.

Wichtig: Den Tag **beim Erstellen des Releases neu anlegen**. Ein Release zu einem schon
vorhandenen Tag löst nichts aus, weil Drone auf das Anlegen des Tags reagiert. Entwürfe lösen
erst beim Veröffentlichen aus; Pre-Releases lösen ebenfalls aus.

**Einmalig einrichten:**

- **GitHub/Drone**: Repository anlegen und in Drone aktivieren.
- **Drone-Secrets** im Repository: `REGISTRY_USER`, `REGISTRY_PASS` (Registry) und
  `PORTAINER_WEBHOOK` (Webhook-URL des Stacks, ohne Parameter).
- **Portainer**: Stack aus `docker-compose.prod.yml` anlegen, Webhook für den Stack aktivieren
  und die URL als `PORTAINER_WEBHOOK` hinterlegen. Den Reverse Proxy mit HTTPS dort einrichten
  (ohne HTTPS funktionieren „Link kopieren“ und das Teilen-Menü nicht). Der Container lauscht
  auf Port 3000. **Nur eine Instanz** betreiben: Tempolimit und Cache für die LVB-Anfragen liegen
  im Arbeitsspeicher.

**Rollback:** In Portainer die Stack-Variable `APP_VERSION` auf einen älteren Tag setzen und
neu ausrollen. Jedes Release bleibt als eigenes Image in der Registry.

**Lokal bauen:**

```bash
docker build --build-arg APP_VERSION=1.2.0 -t lvb-monitor .
docker run --rm -p 3000:3000 lvb-monitor
```

Das Image enthält nur Node (`node:24-alpine`), `server.js`, `package.json` und `public/`, läuft
nicht als root und hat einen Healthcheck auf `/healthz`. Bei `docker stop` beendet sich der
Server sauber.

## Einschränkungen

- Die Schnittstelle ist **inoffiziell**. Ändert die LVB ihre Next.js-App, kann das Parsen
  in `parseRsc()` brechen; der Server meldet dann HTTP 502 mit einer Fehlermeldung.
- Die LVB bieten den Monitor ausdrücklich als kostenlosen Webservice zum Einbetten
  (iframe) an. Das direkte Auslesen der Daten ist davon nicht ausdrücklich gedeckt.
  Für eine öffentliche oder kommerzielle Nutzung sollte man bei der LVB nachfragen.

## Drittanbieter-Lizenzen

Das Projekt hat keine Abhängigkeiten und lädt nichts von externen Servern. Eingebettet sind nur
Icon-Pfade aus **[Lucide](https://lucide.dev)** (teils leicht vereinfacht): plus, share,
sliders-horizontal, check, chevron-left, chevron-right, trash-2, search, map-pin,
triangle-alert, link, x, rotate-ccw, refresh-cw, menu, info, eye, eye-off, footprints.

- Lucide steht unter der **ISC-Lizenz** (Copyright (c) 2026 Lucide Icons and Contributors).
- check, chevron-left, chevron-right, info, link, plus, search, share, trash-2,
  triangle-alert und x stammen ursprünglich aus **Feather** und stehen zusätzlich unter der
  **MIT-Lizenz** (Copyright (c) 2013-present Cole Bemis).

Beide Lizenztexte stehen vollständig in `public/index.html` direkt über den Icons (`ICONS`),
so dass sie in jeder ausgelieferten Kopie enthalten sind. Logo, Favicon und das Stern-Icon
sind eigene Zeichnungen.
