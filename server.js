// LVB-Abfahrtsmonitor – kleiner Proxy-Server ohne Abhängigkeiten (Node >= 18).
//
// Datenquelle: der öffentliche Haltestellenmonitor der LVB (stationboard.l.de).
// Dessen Seite /monitor/<id> ist eine Next.js-App; mit dem Header "RSC: 1"
// liefert sie nur den React-Server-Components-Payload, in dem die Abfahrten
// der nächsten ~60 Minuten (inkl. Echtzeit-Verspätung) als JSON stecken.
// Die Schnittstelle ist inoffiziell und kann sich ohne Vorwarnung ändern.
//
// Der Server speichert keine Nutzerdaten. Er hält nur öffentliche Abfahrts-
// und Suchergebnisse kurz im Speicher, um die LVB nicht unnötig zu belasten.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const env = (name, fallback) => Number(process.env[name]) || fallback;

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
// Version: im Docker-Image der Release-Tag (APP_VERSION, von der Pipeline gesetzt, z. B. 1.2.0),
// lokal die aus package.json. Sie landet in der Fußzeile, in /healthz und im User-Agent.
const PKG = JSON.parse(await readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = process.env.APP_VERSION || PKG.version;

const PORT = env('PORT', 3000);
const UPSTREAM = 'https://stationboard.l.de';
const USER_AGENT = `lvb-monitor/${VERSION} (private Abfahrtsanzeige)`;
const TIMEOUT_MS = 8_000;
const STOP_RE = /^\d{7}$/;        // z. B. 0011345 (LVB) oder 8010205 (DB)
const TRANSPORT_TYPES = new Set(['bahn', 'bus', 'sbahn', 'tram', 'rufbus']);
const DEBUG = Boolean(process.env.DEBUG);

// Schutz für die LVB: alle Anfragen dorthin teilen sich ein Tempolimit.
const UPSTREAM_RATE = env('UPSTREAM_RATE', 5);    // Anfragen pro Sekunde im Mittel
const UPSTREAM_BURST = env('UPSTREAM_BURST', 10); // kurzzeitig mehr erlaubt
const UPSTREAM_QUEUE = env('UPSTREAM_QUEUE', 100); // danach: 503

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Tempolimit (Token-Bucket mit Warteschlange)

let tokens = UPSTREAM_BURST;
let lastRefill = Date.now();
let drainTimer = null;
const waiting = [];

function drain() {
  const now = Date.now();
  tokens = Math.min(UPSTREAM_BURST, tokens + ((now - lastRefill) / 1000) * UPSTREAM_RATE);
  lastRefill = now;
  while (waiting.length && tokens >= 1) {
    tokens -= 1;
    waiting.shift()();
  }
  if (waiting.length && !drainTimer) {
    drainTimer = setTimeout(() => { drainTimer = null; drain(); }, Math.ceil(((1 - tokens) / UPSTREAM_RATE) * 1000));
  }
}

function upstreamSlot() {
  if (waiting.length >= UPSTREAM_QUEUE) {
    return Promise.reject(new HttpError(503, 'Server gerade ausgelastet, bitte gleich noch einmal versuchen'));
  }
  return new Promise((resolve) => { waiting.push(resolve); drain(); });
}

async function upstreamFetch(url, headers = {}) {
  await upstreamSlot();
  if (DEBUG) console.log(new Date().toISOString(), 'upstream', url);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(502, `LVB antwortet mit HTTP ${res.status}`);
  return res;
}

// ---------------------------------------------------------------------------
// Cache: speichert Promises, damit gleichzeitige Anfragen zusammengelegt werden.
// Fehler werden kürzer gemerkt (z. B. ungültige Haltestellen-IDs).

function makeCache({ ttl, errorTtl, max }) {
  const map = new Map();
  return (key, load) => {
    const hit = map.get(key);
    if (hit && Date.now() < hit.expires) return hit.promise;
    const entry = { promise: load(), expires: Date.now() + ttl };
    entry.promise.catch(() => { entry.expires = Date.now() + errorTtl; });
    map.delete(key);
    map.set(key, entry);
    while (map.size > max) map.delete(map.keys().next().value); // älteste zuerst
    return entry.promise;
  };
}

const departuresCache = makeCache({ ttl: 20_000, errorTtl: 15_000, max: 1000 });
const searchCache = makeCache({ ttl: 10 * 60_000, errorTtl: 15_000, max: 500 });

// ---------------------------------------------------------------------------
// Zeit: Fahrplanzeiten sind Ortszeit Europe/Berlin, der Server läuft evtl. in UTC.

const berlinFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function berlinOffsetMs(epochMs) {
  const p = Object.fromEntries(berlinFmt.formatToParts(epochMs).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

// '20261119' + '19:06:00' (Berlin) -> Epoch-ms. Stunden >= 24 (GTFS-Stil) laufen über.
function berlinToEpoch(date, time) {
  const [h, m, s] = time.split(':').map(Number);
  const wall = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), h, m, s || 0);
  const first = wall - berlinOffsetMs(wall);
  return wall - berlinOffsetMs(first); // zweiter Durchlauf für Sommer-/Winterzeitwechsel
}

// ---------------------------------------------------------------------------
// RSC-Payload parsen: Zeilen der Form "<hex-id>:<json>". Gesucht ist das
// Props-Objekt mit dem Schlüssel "trips".

function findTrips(node) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findTrips(v);
      if (r) return r;
    }
  } else if (node && typeof node === 'object') {
    if (Array.isArray(node.trips)) return node.trips;
    for (const v of Object.values(node)) {
      const r = findTrips(v);
      if (r) return r;
    }
  }
  return null;
}

function parseRsc(text) {
  for (const line of text.split('\n')) {
    if (!line.includes('"trips"')) continue;
    const json = line.slice(line.indexOf(':') + 1);
    try {
      const trips = findTrips(JSON.parse(json));
      if (trips) return trips;
    } catch { /* keine JSON-Zeile */ }
  }
  // Fehlerzeile "<id>:E{…}" = die LVB-Seite selbst ist gescheitert, meist bei unbekannter ID
  if (/^[0-9a-f]+:E\{/m.test(text)) throw new HttpError(404, 'Haltestelle unbekannt oder vom LVB-Monitor nicht unterstützt');
  throw new HttpError(502, 'Keine Abfahrten in der LVB-Antwort gefunden (Format geändert?)');
}

function normalizeTrip(t, now) {
  let planned = berlinToEpoch(t.departure_date, t.departure_time);
  // Gleiche Heuristik wie der LVB-Monitor: liegt die Zeit > 1 h in der
  // Vergangenheit, ist die Fahrt am Folgetag gemeint.
  if (planned < now - 3_600_000) planned += 86_400_000;
  const delay = typeof t.departure_delay === 'number' ? t.departure_delay : null;
  return {
    line: String(t.line ?? '').trim(),
    destination: t.trip_headsign,
    type: t.transport_type,
    color: /^[0-9a-f]{6}$/i.test(t.route_color ?? '') ? `#${t.route_color}` : null,
    planned,
    delay,                                  // Sekunden; null = keine Echtzeit
    when: planned + (delay ?? 0) * 1000,    // voraussichtliche Abfahrt
    cancelled: Boolean(t.trip_cancelled || t.stop_cancelled),
    platform: t.track ?? t.track_scheduled ?? null,
    stopId: t.stop_id,
    accessible: t.trip_accessible ?? t.trip_accessible_scheduled ?? null,
    alerts: (t.alerts ?? []).map((a) => ({
      title: a.alertHeaderText ?? '',
      text: a.alertDescriptionText ?? '',
    })),
  };
}

// ---------------------------------------------------------------------------
// Upstream-Abfragen

async function fetchDepartures(stop, types) {
  const qs = types ? `?transporttypes=${types}` : '';
  const res = await upstreamFetch(`${UPSTREAM}/monitor/${stop}${qs}`, { RSC: '1' });
  const now = Date.now();
  const departures = parseRsc(await res.text())
    .map((t) => normalizeTrip(t, now))
    .sort((a, b) => a.when - b.when);
  return { stop, fetchedAt: now, departures };
}

async function searchStops(q) {
  const res = await upstreamFetch(`${UPSTREAM}/api/stops?searchTerm=${encodeURIComponent(q)}`);
  const list = await res.json();
  return (Array.isArray(list) ? list : [])
    .filter((s) => s.ptype === 'S' && STOP_RE.test(s.tags?.stop_id ?? ''))
    .map((s) => ({ id: s.tags.stop_id, name: s.name, district: s.stadtteil ?? s.stadt ?? null }));
}

// ---------------------------------------------------------------------------
// HTTP

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Für den Healthcheck des Containers: billig, fragt die LVB nicht an
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, version: VERSION });

    if (url.pathname === '/api/departures') {
      const stop = url.searchParams.get('stop') ?? '';
      if (!STOP_RE.test(stop)) return sendJson(res, 400, { error: 'Parameter stop muss eine 7-stellige ID sein' });
      const types = [...new Set((url.searchParams.get('types') ?? '').split(/[_,]/))]
        .filter((t) => TRANSPORT_TYPES.has(t)).sort().join('_');
      return sendJson(res, 200, await departuresCache(`${stop}|${types}`, () => fetchDepartures(stop, types)));
    }

    if (url.pathname === '/api/stops') {
      const q = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
      if (q.length < 2 || q.length > 80) return sendJson(res, 200, []);
      return sendJson(res, 200, await searchCache(q.toLowerCase(), () => searchStops(q)));
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = (await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8')).replaceAll('__APP_VERSION__', VERSION);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(html);
    }

    sendJson(res, 404, { error: 'Nicht gefunden' });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    if (status >= 500) console.error(new Date().toISOString(), req.url, err.message);
    sendJson(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`LVB-Monitor ${VERSION} läuft auf http://localhost:${PORT}`);
});

// Sauber beenden (docker stop schickt SIGTERM): keine neuen Verbindungen, laufende
// Anfragen abschließen, spätestens nach 5 s hart beenden.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
