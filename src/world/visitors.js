// Besucher als Figuren (Ablauf und Bewertung in core/visitors.js): Über den Tag kommen kleine Grüppchen (1–7 Leute)
// und gehen allein, ohne Führer, herum: über Gehweg und Gartenweg zum Empfang, wo sie kurz neben dem Tresen stehen
// bleiben (die Plätze der Kunden bleiben frei), durch die Druckhalle zum Lager, die Treppe hinauf in den Serverraum
// (wenn gebaut), wieder hinunter und hinaus. Mehrere Grüppchen sind gleichzeitig unterwegs, an verschiedenen Stationen.
//
// Wege: ein kleines Wegenetz (NODES/EDGES) durch freie Flächen, an jedem Punkt mit der Breite, die ein Grüppchen dort
// einnehmen darf (0 = einzeln). Jedes Grüppchen hat einen unsichtbaren Führer-Punkt, der auf dem Weg vorangeht. Die
// Mitglieder haben eine Position s dahinter und halten Abstand zum Vordermann (wie Autos in einer Kolonne) – in engen
// Stellen einzeln, in breiten nebeneinander. Alle gehen rechts der Wegmitte: So kommen Grüppchen in Gegenrichtung auch
// in Türen und auf der Treppe versetzt aneinander vorbei. Auf die Treppe geht ein Grüppchen trotzdem erst, wenn keines
// entgegenkommt (höchstens STAIR_WAIT lang). An einer Station verteilen sich alle auf freie Plätze einer Fläche (AREAS),
// die sich die Grüppchen teilen. Die Kollision der Spielfigur hält sie zusätzlich aus Tischen, Schränken und Wänden;
// der Spieler selbst wird nie blockiert, die Besucher weichen ihm aus (und Azubis bzw. Kunden, siehe others).
// Kommt eine Figur länger als STUCK_SECONDS nicht voran, wird sie zum nächsten Wegpunkt gesetzt (Notlösung, zählt
// mit) – kein Grüppchen bleibt hängen.
//
// Besucher sind nicht anklickbar: Sie fangen keine Klickstrahlen ab, Drucker, Tresen und Schränke bleiben bedienbar.
//
// Leistung: zusammengefasste Figuren mit geteiltem Material und ohne Schatten (models/people.js, crowdPerson),
// Animation nur für sichtbare Figuren und mit der Entfernung seltener, ausgeblendet über world/room-culling.js und
// je Stockwerk. Die Aussehen werden im Leerlauf vorbereitet. Figuren entstehen ebenfalls im Leerlauf (requestIdleCallback,
// höchstens eine je Leerlauf): kurz vor der nächsten Ankunft (PREWARM_MINUTES) so viele, wie das Grüppchen braucht,
// sonst für Mitglieder ohne Figur. Nur wenn lange kein Leerlauf kommt, wird im Bild angelegt (LATE_CREATE, eine je
// Bild). Nach dem Gehen kommen sie in einen Vorrat (höchstens POOL_MAX) für die nächsten Grüppchen.
// Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { crowdPerson, loadCrowd, peopleFor } from '../models/people.js';
import { ENTRANCE, ENTRANCE_PATH } from './entrance.js';
import { SIDEWALK_LANES } from './outdoor.js';
import { FLOOR_Y, STAIRS, STEPS } from './upper-floor.js';
import { PRINTER_SLOTS_X, TABLE_ROWS_Z } from './hall-layout.js';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { RECEPTION_SPOTS } from './reception.js';

const SPEED = 1.15;              // m/s Tempo des Führer-Punkts
const CATCH_UP = 1.7;            // m/s so schnell holen Besucher auf
const SPOT_SPEED = 1.2;          // m/s zum Platz an einer Station
const WALK_CLIP_SPEED = 1.45;    // bei diesem Tempo passt die Laufanimation
const SPACING = 0.62;            // m Abstand hintereinander, wenn sie einzeln gehen (Treppe, Türen)
const SIDE = 0.5;                // m Abstand nebeneinander
const OPEN_ABREAST = 3;          // so viele nebeneinander, wo es breit genug ist
const KEEP_RIGHT = 0.25;         // m so weit rechts der Wegmitte gehen alle (Gegenverkehr geht links vorbei)
const RADIUS = 0.22;             // m Körper (gegen Hindernisse)
const PERSONAL = 0.46;           // m näher kommen sich zwei Besucher nicht
const SPOT_GAP = 0.55;           // m Raster der Plätze an einer Station
const TURN_SPEED = 6;
const PLAYER_SPACE = 0.75;       // m so weit weichen sie dem Spieler aus
const OTHERS_SPACE = 0.55;       // m … und Azubis, Kunden bzw. Passanten
const STEER_AHEAD = 1.2;         // m so weit voraus sehen sie jemanden im Weg und gehen seitlich vorbei
const STEER_SLOW = 0.3;          // so langsam (Anteil) werden sie höchstens, wenn jemand dicht vor ihnen steht
const MIN_OTHERS = 0.45;         // m näher kommen sie Spieler, Azubis, Kunden und Passanten nie (Körper an Körper)
const QUORUM = 0.85;             // Anteil, der an einer Station stehen muss, damit sie als erreicht gilt
const ARRIVE_TIMEOUT = 30;       // s höchstens auf Nachzügler warten, dann gilt die Station trotzdem als erreicht
const STAIR_WAIT = 15;           // s höchstens vor der Treppe warten, solange ein Grüppchen entgegenkommt
const BLOCK_WAIT = 3;            // s höchstens hinter einem anderen Grüppchen warten, dann versetzt vorbei
const ROOM_WAIT = 40;           // s höchstens vor dem Empfang warten, bis dort genug Plätze frei sind
const ROOM_SPARE = 2;           // so viele Plätze bleiben dort frei (Platz zum Hinein- und Hinausgehen)
const PASS_WAIT = 10;           // s höchstens warten, bis ein anderes Grüppchen aus einer engen Station heraus bzw. hinein ist
const STUCK_SECONDS = 20;        // s ohne Fortschritt: Figur zum nächsten Wegpunkt setzen (Notlösung)
const SPREAD_GIVE_UP = 3;        // s kommt eine Figur nicht an ihren Platz in der Station, bleibt sie, wo sie ist
const KID_SCALE = [0.72, 0.86];
const ADULT_SCALE = [0.94, 1.05];
const CREATE_PER_FRAME = 1;      // neue Figuren je Bild, wenn kein Leerlauf kam (aus dem Vorrat geht es ohne Grenze)
const LATE_CREATE = 1.5;         // s so lange wartet ein Besucher ohne Figur auf den Leerlauf, dann wird im Bild angelegt
const PREWARM_MINUTES = 10;      // Spielminuten (= 30 s) vor der nächsten Ankunft werden ihre Figuren im Leerlauf vorbereitet
const IDLE_SLICE = 4;            // ms so viel Leerlauf muss übrig sein, um eine Figur anzulegen
const IDLE_TIMEOUT = 600;        // ms spätestens dann wird der Leerlauf-Rückruf trotzdem ausgeführt
const POOL_MAX = 15;             // so viele freie Figuren bleiben höchstens im Vorrat
const BOX_REFRESH = 0.5;         // s so oft werden die Hindernisse neu geholt
const SKIP_DOORS = ['front-door', 'office-door']; // Türen öffnen sich für die Besucher (positions → Bewegungsmelder)

const LANE_X = SIDEWALK_LANES[0];
const STAIR_X = (STAIRS.x0 + STAIRS.x1) / 2;
const RISE = FLOOR_Y / STEPS;
const ADULT_LOOKS = peopleFor('visitor').map((p) => p.id);
const KID_LOOKS = peopleFor('pupil').map((p) => p.id); // als Kinder kleiner skaliert
const ALL_LOOKS = [...new Set([...ADULT_LOOKS, ...KID_LOOKS])];

// Wegpunkte (Welt-x/z, level: Stockwerk) · w: wie weit ein Grüppchen hier zur Seite ausschweifen darf (m, halbe Breite)
const NODES = {
  sidewalkN: { x: LANE_X, z: -30, w: 0.7 },
  sidewalkS: { x: LANE_X, z: 30, w: 0.7 },
  gate: { x: LANE_X, z: 0, w: 0.45 },                       // Gehweg vor dem Gartenweg
  hedge: { x: -29.4, z: 0, w: 0.4 },                        // Lücke in der Hecke
  path: { x: -23, z: 0, w: 0.5 },                           // Gartenweg
  frontOut: { ...ENTRANCE_PATH.frontOutside, w: 0.35 },
  frontIn: { ...ENTRANCE_PATH.frontInside, w: 0 },
  lobby: { x: -13, z: 0.2, w: 0.45 },                       // zwischen Tresen und Abholregal
  reception: { x: -11.8, z: 0.1, w: 0.3 },                  // Station Empfang: neben dem Tresen, vor der Hallentür
  entIn: { ...ENTRANCE_PATH.inside, w: 0 },
  hallDoor: { ...ENTRANCE_PATH.hall, w: 0 },
  hallWest: { x: -6, z: 1.4, w: 0.8 },
  hall: { x: -3.55, z: 1.7, w: 0.5 },                       // Station Druckhalle (links vor den Tischen)
  storage: { x: -2.75, z: 6.6, w: 0.5 },                    // Station Lager (vor der Lagertür)
  tablesW: { x: -3.6, z: -1.3, w: 0.25 },                   // Gang zwischen erstem und zweitem Drucktisch
  tablesE: { x: 3.4, z: -1.3, w: 0.25 },
  stairs: { x: STAIR_X, z: STAIRS.zLow + 0.5, w: 0 },        // Fuß der Treppe
  stairTop: { x: STAIR_X, z: STAIRS.zHigh - 0.55, w: 0, level: 1 },
  landing: { x: 8.1, z: -7.7, w: 0.35, level: 1 },          // oben neben der Treppe
  servers: { x: -0.25, z: -1.0, w: 0.5, level: 1 },         // Station Serverraum (Gang zwischen Reihe A und B)
};
for (const [name, n] of Object.entries(NODES)) Object.assign(n, { name, level: n.level ?? 0 });

const EDGES = [
  ['sidewalkN', 'gate'], ['sidewalkS', 'gate'], ['gate', 'hedge'], ['hedge', 'path'], ['path', 'frontOut'],
  ['frontOut', 'frontIn'], ['frontIn', 'lobby'], ['lobby', 'reception'], ['reception', 'entIn'], ['entIn', 'hallDoor'],
  ['hallDoor', 'hallWest'], ['hallWest', 'hall'], ['hall', 'storage'], ['hall', 'tablesW'], ['tablesW', 'tablesE'],
  ['tablesE', 'stairs'],
];
const UPPER_EDGES = [['stairs', 'stairTop'], ['stairTop', 'landing'], ['landing', 'servers']]; // nur mit zweiter Etage
const STAIR_EDGE = ['stairs', 'stairTop']; // nur in einer Richtung zugleich (sonst versetzt aneinander vorbei)

const nearest = (values, v) => values.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
// Freie Flächen zum Verteilen (Rechtecke ohne Hindernisse) · look(p): wohin man von Platz p aus schaut
// (null: zum Wegpunkt der Station) · avoid: Pflanzen u. Ä. in der Fläche · gap: Raster der Plätze
const AREAS = {
  // Empfang: zwei Streifen zwischen Tresen bzw. Abholregal und Hallenwand – weg von den Plätzen der Kunden
  // (RECEPTION_SPOTS) und den Wegen zu Tresen, Kasse, Regal und Stühlen
  reception: {
    rects: [{ x0: -11.95, x1: -10.85, z0: -2.15, z1: -0.55 }, { x0: -12.2, x1: -10.85, z0: 0.55, z1: 2.1 }],
    level: 0, gap: 0.5, enter: 0, // erst am Wegpunkt abbiegen: nicht an der Kasse vorbei
    gate: 'frontOut', // ist der Empfang voll, wartet ein Grüppchen draußen vor der Haustür
    avoid: [{ x: ENTRANCE.x1 - 0.35, z: ENTRANCE.z0 + 0.35 }, { x: ENTRANCE.x1 - 0.35, z: ENTRANCE.z1 - 0.35 }],
    look: () => ({ x: RECEPTION_SPOTS.counter.x, z: RECEPTION_SPOTS.counter.z - 0.7 }),
  },
  hall: { rects: [{ x0: -2.9, x1: 2.9, z0: 1.6, z1: 5.6 }], level: 0, look: (p) => ({ x: nearest(PRINTER_SLOTS_X, p.x), z: TABLE_ROWS_Z[0] }) },
  storage: { rects: [{ x0: -9.3, x1: -3.3, z0: 5.9, z1: 9.2 }], level: 0, look: () => ({ x: STORAGE_DOOR.x, z: ROOM_SIZE / 2 + 1 }) },
  // Serverschränke stehen in Reihe A (z = −4, Glastüren zum Gang) und B (z = 2), x von −8 bis −1 (core/server-zones.js)
  servers: {
    rects: [{ x0: -8.0, x1: -0.8, z0: -3.0, z1: 1.0 }], level: 1,
    look: (p) => ({ x: THREE.MathUtils.clamp(Math.round(p.x), -8, -1), z: p.z < -1 ? -4 : 2 }),
  },
};

// Kleiner Zufallsgenerator mit Startwert – jedes Grüppchen sieht bei jedem Laden gleich aus
function seeded(seed) {
  let a = seed * 2654435761 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Plätze einer Fläche: Raster mit etwas Zufall, nicht zu nah an Pflanzen. owner: Figur, die dort steht
function areaSpots(area, random) {
  const spots = [];
  const gap = area.gap ?? SPOT_GAP;
  const m = 0.28;
  for (const r of area.rects) {
    for (let x = r.x0 + m; x <= r.x1 - m + 1e-6; x += gap) {
      for (let z = r.z0 + m; z <= r.z1 - m + 1e-6; z += gap) {
        const p = {
          x: THREE.MathUtils.clamp(x + (random() - 0.5) * 0.12, r.x0 + m, r.x1 - m),
          z: THREE.MathUtils.clamp(z + (random() - 0.5) * 0.12, r.z0 + m, r.z1 - m),
          owner: null,
        };
        if ((area.avoid ?? []).some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.8)) continue;
        spots.push(p);
      }
    }
  }
  return spots;
}

const inArea = (area, p) => area.rects.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
const turnTowards = (object, b, dt) => {
  const a = object.rotation.y;
  object.rotation.y = a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, TURN_SPEED * dt);
};
// Laufrichtung → Drehwinkel (Figuren schauen nach +z)
const headingTo = (dx, dz) => Math.atan2(dx, dz);
// Platz für die Figur nebeneinander: goldener Schnitt verteilt aufeinanderfolgende Ränge gut über die Breite
const lateralOf = (rank) => ((rank * 0.618034 + 0.31) % 1) * 2 - 1;
// Seitlicher Versatz (m, + = rechts in Gehrichtung) bei halber Breite w: alle rechts der Mitte, bei w = 0 einzeln
const laneOffset = (w, lat) => KEEP_RIGHT + lat * Math.max(0, w - KEEP_RIGHT);
// Abstand zum Vordermann bei halber Breite w: nebeneinander dürfen sie dichter aufrücken
const gapFor = (w) => SPACING / Math.min(OPEN_ABREAST, 1 + Math.floor((2 * Math.max(0, w - KEEP_RIGHT)) / SIDE));

// Punkt bei s auf dem Weg (vor dem Anfang: rückwärts verlängert, nach dem Ende: Endpunkt) mit Richtung und Breite
function pointAt(leg, s, out) {
  const { points, cum, L } = leg;
  if (points.length < 2) {
    Object.assign(out, { x: points[0].x, z: points[0].z, dx: 0, dz: 1, w: points[0].w });
    return out;
  }
  let i = 0;
  while (i < points.length - 2 && s > cum[i + 1]) i++;
  const a = points[i];
  const b = points[i + 1];
  const len = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, (Math.min(s, L) - cum[i]) / len); // s < 0: t < 0 → rückwärts verlängert
  out.dx = (b.x - a.x) / len;
  out.dz = (b.z - a.z) / len;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.w = s < 0 ? a.w : a.w + (b.w - a.w) * t;
  return out;
}

// Platz einer Figur auf dem Weg bei s: rechts versetzt je nach Rang (lat)
function lanePoint(leg, s, lat, out) {
  pointAt(leg, s, out);
  const off = laneOffset(out.w, lat);
  out.x += -out.dz * off;
  out.z += out.dx * off;
  return out;
}

// Weg zu einer Station: Punkte (Knoten), Längen, Fläche am Ende, Treppenabschnitte
function makeLeg(names, areaName) {
  const points = names.map((n) => NODES[n]);
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const leg = { names, points, cum, L: cum[cum.length - 1], area: areaName ? AREAS[areaName] : null, areaName, sEnter: Infinity, stairs: [], gateS: null };
  const gate = leg.area?.gate ? names.indexOf(leg.area.gate) : -1;
  if (gate >= 0) leg.gateS = Math.max(0, cum[gate] - 0.6);
  if (leg.area) {
    // Ab hier geht es direkt zum Platz in der Fläche (spätestens kurz vor dem Ende)
    const p = {};
    leg.sEnter = Math.max(0, leg.L - (leg.area.enter ?? 0.5));
    for (let s = leg.L; s >= 0; s -= 0.1) {
      pointAt(leg, s, p);
      if (!inArea(leg.area, p)) break;
      leg.sEnter = s;
    }
  }
  for (let i = 0; i + 1 < names.length; i++) {
    const up = names[i] === STAIR_EDGE[0] && names[i + 1] === STAIR_EDGE[1];
    const down = names[i] === STAIR_EDGE[1] && names[i + 1] === STAIR_EDGE[0];
    if (up || down) leg.stairs.push({ s0: cum[i], s1: cum[i + 1], dir: up ? 'up' : 'down' });
  }
  return leg;
}

// Auf der Treppe (zwischen den Geländern)? Stufenhöhe und Stockwerk
function stairHeight(built, x, z, level) {
  if (!built) return { y: 0, level: 0 };
  const { x0, x1, zLow, zHigh } = STAIRS;
  if (x > x0 && x < x1 && z < zLow && z > zHigh) {
    // Stufe für Stufe: Füße stehen auf der Stufe, über der die Figur gerade ist
    const step = Math.min(STEPS, Math.floor(((zLow - z) / (zLow - zHigh)) * STEPS) + 1);
    const y = step * RISE;
    return { y, level: y > FLOOR_Y / 2 ? 1 : 0 };
  }
  return { y: level * FLOOR_Y, level };
}

const nearStairs = (p) => p.x > STAIRS.x0 - 2.5 && p.z < STAIRS.zLow + 2.5 && p.z > STAIRS.zHigh - 1.5;

// Rückruf, sobald der Browser Luft hat (sonst kurz danach)
const whenIdle = (fn, timeout) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 50);
};

// visitors: core/visitors.js (parties, arrived, reachedStation, finished) · collision: Kollision der Spielfigur
// upperFloor: world/upper-floor.js (built) · others(): Positionen von Azubis und Kunden, denen sie ausweichen (optional)
// onReady(): erste Figur ist vorbereitet und hängt (unsichtbar) in der Szene – Shader vorab übersetzen
export function createVisitorGroup({ visitors, collision = null, upperFloor = null, others = null, onReady = () => {} }) {
  const group = new THREE.Group();
  group.name = 'visitors';
  const parties = new Map();       // Grüppchen-ID → Grüppchen mit Figuren
  const pool = new Map();          // Aussehen → freie Figuren (werden von Grüppchen zu Grüppchen wiederverwendet)
  let poolCount = 0;
  const ready = new Set();         // fertig vorbereitete Aussehen
  const spotTables = new Map();    // Fläche → Plätze (geteilt von allen Grüppchen)
  let looksRequested = false;
  let warm = null;                 // unsichtbare Figur, damit der Shader vorab übersetzt werden kann
  let frame = 0;
  let boxes = [[], []];
  let boxAge = Infinity;
  const stats = { rescues: 0, created: 0, disposed: 0, stayed: 0, stairWaits: 0, idleCreated: 0, lateCreated: 0, arrived: 0, reached: 0, finished: 0, log: [] }; // für Tests
  const positionsOut = [];
  const tmp = {};
  const tmpB = {};
  const built = () => !!upperFloor?.built;

  // ---------- Aussehen und Figuren ----------

  // Alle Besucher-Aussehen vorbereiten (zusammenfassen, je eins pro Leerlauf, siehe models/people.js) – keine Figuren
  function requestLooks() {
    if (looksRequested) return;
    looksRequested = true;
    for (const id of ALL_LOOKS) {
      loadCrowd([id]).then(() => {
        ready.add(id);
        if (!warm) {
          warm = crowdPerson(id);
          warm.object.visible = false; // zählt beim Vorübersetzen der Shader mit, wird aber nie gezeichnet
          warm.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
          group.add(warm.object);
          onReady();
        }
      }).catch((err) => console.warn(`Besucher-Figur ${id} konnte nicht geladen werden`, err));
    }
  }
  whenIdle(requestLooks, 4000);

  function newPerson(look) {
    const person = crowdPerson(look);
    if (!person) return null;
    stats.created++;
    person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; }); // fängt keine Klicks ab
    // Laufanimation einmal anbinden (das Anbinden kostet beim ersten Abspielen – so geschieht es schon hier)
    const walk = person.actions.Walk;
    if (walk) {
      walk.play();
      person.mixer.update(0);
      walk.stop();
    }
    person.mixer.update(Math.random() * 2); // nicht alle im Gleichschritt
    return person;
  }

  function addToPool(look, person) {
    if (!pool.has(look)) pool.set(look, []);
    pool.get(look).push(person);
    poolCount++;
  }

  // Familie mit Kindern: ein bzw. zwei Erwachsene, der Rest Kinder
  const adultsOf = (size, kids) => (kids && size >= 2 ? (size >= 5 ? 2 : 1) : size);
  const freeOf = (looks) => looks.reduce((n, id) => n + (pool.get(id)?.length ?? 0), 0);

  // Nächste Figur, die im Leerlauf angelegt werden soll (Aussehen) oder null: erst für Mitglieder unterwegs, die noch
  // keine haben, dann für die nächste Ankunft (kurz vorher, nur so viele, wie das Grüppchen braucht)
  function nextLook() {
    const want = new Map();
    for (const P of parties.values()) {
      for (const f of P.members) {
        if (f.person || f.mode === 'gone' || !ready.has(f.look)) continue;
        want.set(f.look, (want.get(f.look) ?? 0) + 1);
        if (want.get(f.look) > (pool.get(f.look)?.length ?? 0)) return f.look;
      }
    }
    const next = visitors.nextArrival;
    if (!next || poolCount >= POOL_MAX) return null;
    const now = visitors.clock?.minutes;
    if (now !== undefined && next.time - now > PREWARM_MINUTES) return null;
    const kids = next.size - adultsOf(next.size, next.kids);
    const pick = (looks) => {
      const ok = looks.filter((id) => ready.has(id));
      return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
    };
    if (freeOf(KID_LOOKS) < kids) return pick(KID_LOOKS);
    if (poolCount < next.size) return pick(ADULT_LOOKS);
    return null;
  }

  // Im Leerlauf höchstens eine Figur anlegen (in den Vorrat), dann den nächsten Leerlauf abwarten
  let idleQueued = false;
  let idleSince = 0; // seit wann (performance.now) auf genug Leerlauf gewartet wird
  function queueIdle() {
    if (idleQueued) return;
    idleQueued = true;
    whenIdle(idleWork, IDLE_TIMEOUT);
  }
  function idleWork(deadline) {
    idleQueued = false;
    const look = nextLook();
    if (!look) {
      idleSince = 0;
      return;
    }
    const now = performance.now();
    idleSince ||= now;
    // Zu wenig Luft: im nächsten Leerlauf – aber nicht ewig (ausgelastetes Spiel), dann eben jetzt, zwischen zwei Bildern
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < IDLE_SLICE && now - idleSince < IDLE_TIMEOUT) {
      queueIdle();
      return;
    }
    idleSince = 0;
    const person = newPerson(look);
    if (person) {
      stats.idleCreated++;
      addToPool(look, person);
    }
    queueIdle();
  }

  function toPool(f) {
    if (!f.person) return;
    f.holder.remove(f.person.object);
    addToPool(f.look, f.person);
    f.person = null;
    // Vorrat begrenzen: vom häufigsten Aussehen freigeben (Knochen und Animation – Geometrie und Material bleiben)
    while (poolCount > POOL_MAX) {
      let most = null;
      for (const list of pool.values()) if (!most || list.length > most.length) most = list;
      most.shift().dispose();
      poolCount--;
      stats.disposed++;
    }
  }

  // Aussehen für ein Mitglied: lieber eines, das frei im Vorrat liegt (dann muss nichts angelegt werden)
  function chooseLook(kid, random, claimed) {
    const choices = kid ? KID_LOOKS : ADULT_LOOKS;
    const free = choices.filter((id) => (pool.get(id)?.length ?? 0) > (claimed.get(id) ?? 0));
    const list = free.length ? free : choices;
    const look = list[Math.floor(random() * list.length)];
    claimed.set(look, (claimed.get(look) ?? 0) + 1);
    return look;
  }

  // ---------- Grüppchen anlegen und abbauen ----------

  function newParty(g) {
    const random = seeded(g.id * 7919 + g.size);
    const claimed = new Map();
    const adults = adultsOf(g.size, g.kids);
    // Aussehen: Kinder zuerst, damit die kleinen Figuren aus dem Vorrat nicht an Erwachsene gehen
    const looks = [];
    for (let i = g.size - 1; i >= 0; i--) looks[i] = chooseLook(i >= adults, random, claimed);
    const members = [];
    for (let i = 0; i < g.size; i++) {
      const adult = i < adults;
      const [s0, s1] = adult ? ADULT_SCALE : KID_SCALE;
      members.push({
        index: i, look: looks[i], scale: s0 + random() * (s1 - s0),
        idle: random() < 0.5 ? 'Idle' : 'Idle_Neutral',
        holder: new THREE.Group(), person: null, attached: false, mode: 'off', s: 0, rank: i, lag: 0, lat: 0,
        jitter: random() * 0.25, spot: null, settled: false, level: 0, y: 0, heading: 0, speed: 0, animDt: 0,
        goal: new THREE.Vector3(), last: new THREE.Vector3(), stuck: 0, checkT: 0, via: [], lookAt: undefined,
      });
    }
    const exitSide = random() < 0.5 ? 'sidewalkN' : 'sidewalkS';
    const party = {
      id: g.id, members, order: members, random, exitSide, spawnSide: random() < 0.5 ? 'sidewalkN' : 'sidewalkS',
      started: false, leg: null, s: 0, level: 0, phase: 'idle', wait: 0, at: null, anchor: null,
      stationIndex: -1, reported: -1, arrivedSent: false, leaving: false, finishedSent: false,
      stairDir: null, stairGranted: new Set(), stairWait: 0, blockWait: 0, noProgress: 0, lastS: 0, gateWait: 0, passWait: 0, enterWait: 0,
    };
    for (const f of members) f.party = party;
    return party;
  }

  function detach(f) {
    if (f.attached) group.remove(f.holder);
    f.attached = false;
  }

  function releaseSpot(f) {
    if (f.spot?.owner === f) f.spot.owner = null;
    f.spot = null;
  }

  function teardown(P) {
    for (const f of P.members) {
      detach(f);
      releaseSpot(f);
      toPool(f);
      f.mode = 'gone';
    }
    parties.delete(P.id);
  }

  // ---------- Wege ----------

  function graph() {
    const edges = built() ? [...EDGES, ...UPPER_EDGES] : EDGES;
    const adj = new Map(Object.keys(NODES).map((n) => [n, []]));
    for (const [a, b] of edges) {
      const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);
      adj.get(a).push([b, d]);
      adj.get(b).push([a, d]);
    }
    return adj;
  }

  // Kürzester Weg zwischen zwei Knoten (Dijkstra, das Netz ist klein) – Liste der Namen oder null
  function findPath(from, to) {
    if (!NODES[from] || !NODES[to]) return null;
    const adj = graph();
    const dist = new Map([[from, 0]]);
    const prev = new Map();
    const open = new Set([from]);
    while (open.size) {
      let u = null;
      for (const n of open) if (u === null || dist.get(n) < dist.get(u)) u = n;
      open.delete(u);
      if (u === to) break;
      for (const [v, d] of adj.get(u)) {
        const alt = dist.get(u) + d;
        if (alt < (dist.get(v) ?? Infinity)) {
          dist.set(v, alt);
          prev.set(v, u);
          open.add(v);
        }
      }
    }
    if (!dist.has(to)) return null;
    const names = [to];
    while (names[0] !== from) names.unshift(prev.get(names[0]));
    return names;
  }

  // So weit hat eine Figur noch bis zum Punkt start – über ihre Zwischenpunkte (via)
  function joinDistance(f, start) {
    let p = f.holder.position;
    let d = 0;
    for (const q of f.via) {
      d += Math.hypot(q.x - p.x, q.z - p.z);
      p = q;
    }
    return d + Math.hypot(start.x - p.x, start.z - p.z);
  }

  function startLeg(P, leg) {
    const prev = P.leg;
    P.leg = leg;
    P.s = 0;
    P.lastS = 0;
    P.noProgress = 0;
    P.phase = 'walk';
    P.wait = 0;
    P.anchor = null;
    P.stairGranted.clear();
    P.gateWait = 0;
    P.enterWait = 0;
    P.stairWait = 0;
    const start = leg.points[0];
    const active = P.members.filter((f) => f.mode !== 'gone' && f.mode !== 'off');
    for (const f of active) {
      releaseSpot(f);
      // Wer noch auf dem vorigen Weg unterwegs ist, läuft ihn erst zu Ende – geradeaus zum neuen Anfang ginge es
      // sonst womöglich durch eine Wand. Der vorige Weg endet dort, wo der neue beginnt.
      if (prev && prev !== leg && f.mode === 'path') f.via = prev.points.filter((p, i) => prev.cum[i] > f.s + 0.05);
      else if (prev && prev !== leg && f.mode === 'join') f.via = [...f.via, ...prev.points];
      else f.via = [];
    }
    // Wer am nächsten am Anfang steht, geht vorn
    active.sort((a, b) => joinDistance(a, start) - joinDistance(b, start));
    active.forEach((f, rank) => {
      f.rank = rank;
      f.lag = 1.0 + (rank * SPACING) / OPEN_ABREAST + f.jitter;
      f.lat = lateralOf(rank);
      f.mode = 'join';
      f.settled = false;
    });
    P.order = active;
  }

  function goTo(P, target) {
    const names = findPath(P.at, target);
    if (!names) return false;
    if (names.length < 2) {
      P.phase = 'done';
      return true;
    }
    startLeg(P, makeLeg(names, AREAS[target] ? target : null));
    return true;
  }

  // Ankunft: auf dem Gehweg hinter der Ecke auftauchen und gleich zum Empfang laufen
  function startArrival(P) {
    P.started = true;
    for (const f of P.members) {
      f.mode = 'join';
      f.holder.position.set(NODES[P.spawnSide].x, 0, NODES[P.spawnSide].z);
    }
    startLeg(P, makeLeg(findPath(P.spawnSide, 'reception'), 'reception'));
    P.at = null;
    // Kommt gerade ein anderes Grüppchen auf derselben Seite an: mit Abstand dahinter auftauchen
    let back = 0;
    for (const Q of parties.values()) {
      if (Q === P || !Q.started || Q.at || Q.spawnSide !== P.spawnSide || Q.leg?.names[0] !== P.spawnSide) continue;
      for (const f of Q.members) if (f.mode === 'path') back = Math.max(back, 1.2 + P.order[0].lag - f.s);
    }
    P.s = P.lastS = -back;
    for (const f of P.order) {
      // Gleich in Kolonne auf dem Gehweg hinter dem Anfang aufstellen
      f.mode = 'path';
      f.s = -back - f.lag;
      lanePoint(P.leg, f.s, f.lat, tmp);
      f.holder.position.set(tmp.x, 0, tmp.z);
      f.heading = headingTo(tmp.dx, tmp.dz);
      f.holder.rotation.y = f.heading;
      f.last.copy(f.holder.position);
      f.goal.copy(f.holder.position);
    }
  }

  // Ohne Ankunft (Grüppchen ist schon weiter): gleich neben dem Tresen stehen
  function spawnAtReception(P) {
    P.started = true;
    P.at = 'reception';
    P.leg = makeLeg(['reception'], 'reception');
    P.order = P.members;
    for (const f of P.members) {
      f.mode = 'spread';
      takeSpot(P, f);
      f.settled = true;
      f.holder.position.set(f.spot.x, 0, f.spot.z);
      f.last.copy(f.holder.position);
      f.goal.copy(f.holder.position);
      f.heading = lookHeading(AREAS.reception, f.spot, NODES.reception);
      f.holder.rotation.y = f.heading;
    }
    P.phase = 'done';
  }

  function startLeaving(P) {
    P.leaving = true;
    if (!goTo(P, P.exitSide)) for (const f of P.members) f.mode = 'gone';
  }

  function lookHeading(area, p, anchor) {
    const target = area.look ? area.look(p) : anchor;
    return headingTo(target.x - p.x, target.z - p.z);
  }

  // ---------- Plätze an den Stationen (von allen Grüppchen geteilt) ----------

  function spotsOf(name) {
    if (!spotTables.has(name)) spotTables.set(name, areaSpots(AREAS[name], seeded(name.length * 131 + 7)));
    return spotTables.get(name);
  }

  // Freien Platz nehmen: der erste eines Grüppchens möglichst weit hinten in der Fläche, die anderen nah bei ihm
  // (so bleibt ein Grüppchen beisammen und die Plätze vorn frei für die nächsten). Ist alles voll, teilen sie sich
  // einen Platz (sie rücken dann auseinander und bleiben stehen, wo Platz ist).
  function takeSpot(P, f) {
    const spots = spotsOf(P.leg.areaName);
    const end = P.leg.points[P.leg.points.length - 1];
    let best = null;
    let bestD = Infinity;
    for (const s of spots) {
      if (s.owner && s.owner.mode === 'spread') continue;
      const d = P.anchor ? Math.hypot(s.x - P.anchor.x, s.z - P.anchor.z) : -Math.hypot(s.x - end.x, s.z - end.z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) best.owner = f;
    else best = spots[Math.floor(P.random() * spots.length)];
    P.anchor ??= best;
    f.spot = best;
  }

  // ---------- Bewegung ----------

  function moveToward(f, speed, dt) {
    const pos = f.holder.position;
    const dx = f.goal.x - pos.x;
    const dz = f.goal.z - pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      pos.x = f.goal.x;
      pos.z = f.goal.z;
    } else {
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
    }
    return d;
  }

  // Ziel aus dem Weg schieben, wenn dort jemand steht
  function dodge(f, p, space) {
    const dx = f.goal.x - p.x;
    const dz = f.goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d >= space) return;
    const k = d > 1e-3 ? (space - d) / d : 1;
    f.goal.x += d > 1e-3 ? dx * k : space;
    f.goal.z += d > 1e-3 ? dz * k : 0;
  }

  // Steht jemand (Spieler, Azubi, Kunde, Passant) vor der Figur auf dem Weg zu ihrem Ziel: seitlich an ihm vorbei
  // (Ziel quer zur Laufrichtung verschieben, zur freien Seite) und langsamer werden, je näher er ist. Danach wie
  // bisher das Ziel selbst aus dem Weg schieben. Ergebnis: Faktor fürs Tempo (1 = frei)
  function steer(f, p, space) {
    const pos = f.holder.position;
    const px = p.x - pos.x;
    const pz = p.z - pos.z;
    const dist = Math.hypot(px, pz);
    let factor = 1;
    if (dist < space + STEER_AHEAD) {
      const gx = f.goal.x - pos.x;
      const gz = f.goal.z - pos.z;
      const len = Math.hypot(gx, gz);
      if (len > 0.02) {
        const ux = gx / len;
        const uz = gz / len;
        const ahead = px * ux + pz * uz;   // wie weit vorn (in Laufrichtung)
        const side = px * uz - pz * ux;    // wie weit seitlich (> 0: rechts der Laufrichtung)
        if (ahead > -0.1 && ahead < STEER_AHEAD + space && Math.abs(side) < space) {
          const shift = space - Math.abs(side);
          const away = side >= 0 ? -1 : 1; // zur anderen Seite
          f.goal.x += away * uz * shift;
          f.goal.z -= away * ux * shift;
          factor = THREE.MathUtils.clamp((dist - MIN_OTHERS) / STEER_AHEAD, STEER_SLOW, 1);
        }
      }
    }
    dodge(f, p, space);
    return factor;
  }

  // Treppe: Wer gerade darauf ist, in welcher Richtung (für Grüppchen, die entgegenkommen wollen)
  function stairUse(P) {
    P.stairDir = null;
    if (!P.leg || P.phase !== 'walk') return;
    for (const st of P.leg.stairs) {
      const leaderOn = P.s > st.s0 - 0.25 && P.s < st.s1 + 0.3;
      const memberOn = P.order.some((f) => f.mode === 'path' && f.s > st.s0 - 0.4 && f.s < st.s1 + 0.4);
      if (leaderOn || memberOn) P.stairDir = st.dir;
    }
  }

  // Haben alle Mitglieder von P an der Station ihres Weges Platz – auch neben den Grüppchen, die schon dorthin
  // unterwegs sind (vorbei an ihrem Wartepunkt)?
  function roomFor(P) {
    const name = P.leg.areaName;
    let free = 0;
    for (const s of spotsOf(name)) if (!s.owner || s.owner.mode !== 'spread') free++;
    for (const Q of parties.values()) {
      if (Q === P || Q.phase !== 'walk' || Q.leg?.areaName !== name || Q.s <= (Q.leg.gateS ?? -1) + 1e-3) continue;
      for (const f of Q.members) if (f.mode === 'path' || f.mode === 'join') free--;
    }
    return free >= P.members.filter((f) => f.mode !== 'gone').length + ROOM_SPARE;
  }

  // Gehen gerade Besucher eines anderen Grüppchens aus der (engen) Station am Ende von P.leg heraus?
  function busyLeaving(P) {
    const node = P.leg.names[P.leg.names.length - 1];
    for (const Q of parties.values()) {
      if (Q === P || Q.phase !== 'walk' || Q.leg?.names[0] !== node) continue;
      if (Q.members.some((f) => f.mode === 'join')) return true;
    }
    return false;
  }

  // Kommen gerade Besucher eines anderen Grüppchens in die (enge) Station, in der P steht?
  function busyArriving(P) {
    const area = AREAS[P.at];
    if (!area?.gate) return false;
    for (const Q of parties.values()) {
      if (Q === P || Q.phase !== 'walk' || Q.leg?.areaName !== P.at) continue;
      if (Q.members.some((f) => (f.mode === 'spread' && !f.settled) || (f.mode === 'path' && f.s > Q.leg.L - 2))) return true;
    }
    return false;
  }

  // Steht vor dem Führer-Punkt ein Besucher eines anderen Grüppchens, der gerade läuft? 0: frei, 1: steht im Weg,
  // 2: geht in dieselbe Richtung voraus (dann ohne Zeitgrenze hinterher – z. B. einzeln auf der Treppe)
  function blockedAhead(P) {
    lanePoint(P.leg, Math.min(P.leg.L, P.s + 0.6), 0, tmpB);
    const dir = headingTo(tmpB.dx, tmpB.dz);
    let found = 0;
    for (const Q of parties.values()) {
      if (Q === P) continue;
      for (const o of Q.members) {
        if ((o.mode !== 'path' && o.mode !== 'join') || o.level !== P.level) continue;
        if (Math.hypot(o.holder.position.x - tmpB.x, o.holder.position.z - tmpB.z) >= 0.5) continue;
        // Gleiche Richtung: nach dem Weg des anderen (steht er gerade, z. B. auf der Treppe hinter seinem Vordermann)
        const way = o.mode === 'path' ? pointAt(Q.leg, o.s, tmp) : null;
        const heading = way ? headingTo(way.dx, way.dz) : o.heading;
        if ((way || o.speed > 0.15) && Math.cos(heading - dir) > 0.5) return 2;
        found = 1;
      }
    }
    return found;
  }

  // Führer-Punkt voran – er wartet auf Nachzügler, vor der Treppe auf Gegenverkehr und kurz hinter anderen Grüppchen
  function advanceLeader(P, dt) {
    const leg = P.leg;
    if (!leg || P.phase !== 'walk' || P.s >= leg.L) return;
    const list = P.order;
    const front = list.find((f) => f.mode === 'path' || f.mode === 'join');
    const frontS = front ? (front.mode === 'path' ? front.s : -joinDistance(front, leg.points[0])) : P.s;
    let rear = Infinity;
    for (const f of list) if (f.mode === 'path') rear = Math.min(rear, f.s);
    // Warten, wenn vorn jemand nicht mitkommt oder die Kolonne zu lang wird
    if (front && frontS < P.s - front.lag - 2.5) return;
    if (rear !== Infinity && rear < P.s - (list.length * SPACING + 6)) return;
    let next = Math.min(leg.L, P.s + SPEED * dt);
    // Vor dem Empfang: erst hinein, wenn dort Platz für alle ist (sonst stauen sich die Grüppchen vor dem Tresen)
    if (leg.gateS !== null && P.s <= leg.gateS + 1e-3 && next >= leg.gateS && P.gateWait < ROOM_WAIT && !roomFor(P)) {
      P.gateWait += dt;
      next = Math.max(P.s, leg.gateS);
    }
    for (const st of leg.stairs) {
      const hold = st.s0 - 0.2;
      if (P.s > hold + 1e-3 || next < hold || P.stairGranted.has(st)) continue;
      const oncoming = [...parties.values()].some((Q) => Q !== P && Q.stairDir && Q.stairDir !== st.dir);
      if (oncoming && P.stairWait < STAIR_WAIT) {
        if (P.stairWait === 0) stats.stairWaits++;
        P.stairWait += dt;
        next = Math.max(P.s, hold);
      } else {
        P.stairGranted.add(st);
        P.stairDir = st.dir; // gleich belegen, damit ein Grüppchen von oben im selben Bild wartet
      }
    }
    // … und kurz vor einer engen Station warten, solange ein anderes Grüppchen gerade aus ihr herausgeht
    const hold = leg.L - 1.5;
    if (leg.area?.gate && P.s <= hold + 1e-3 && next >= hold && P.enterWait < PASS_WAIT && busyLeaving(P)) {
      P.enterWait += dt;
      next = Math.max(P.s, hold);
    }
    const blocked = next > P.s ? blockedAhead(P) : 0;
    if (blocked) {
      P.blockWait += dt;
      if (blocked === 2 || P.blockWait < BLOCK_WAIT) return;
    } else {
      P.blockWait = 0;
    }
    P.s = next;
  }

  function stepMembers(P, dt, player, people) {
    const leg = P.leg;
    if (!leg) return;
    let limit = Infinity; // so weit darf der Nächste höchstens (s), wegen des Vordermanns
    // Ist der Führer-Punkt am Ziel, zählt nur noch der Vordermann – alle rücken nach
    const head = P.s >= leg.L ? Infinity : P.s;
    for (const f of P.order) {
      if (f.mode === 'gone' || f.mode === 'off') continue;
      const want = Math.min(head - f.lag, limit, leg.L);
      let speed = CATCH_UP;
      let blocks = Infinity;
      const pos = f.holder.position;
      while (f.mode === 'join' && f.via.length && Math.hypot(f.via[0].x - pos.x, f.via[0].z - pos.z) < 0.15) f.via.shift();
      if (f.mode === 'join' && f.via.length) {
        // Erst den vorigen Weg zu Ende gehen, dann wie alle anderen zum Anfang
        f.goal.set(f.via[0].x, 0, f.via[0].z);
        blocks = -joinDistance(f, leg.points[0]);
      } else if (f.mode === 'join') {
        // Zum Anfang des Weges – höchstens so nah, wie Vordermann und Führer-Punkt es erlauben
        lanePoint(leg, 0, f.lat, tmp);
        const d = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
        const allowed = Math.max(0, -want); // so weit muss er noch vom Anfang weg bleiben
        if (d <= Math.max(0.3, allowed + 1e-3) && want >= 0) {
          f.mode = 'path';
          f.s = 0;
        } else if (d > allowed) {
          const k = (d - allowed) / d;
          f.goal.set(pos.x + (tmp.x - pos.x) * k, 0, pos.z + (tmp.z - pos.z) * k);
        } else {
          f.goal.copy(pos);
        }
        blocks = -d;
      }
      if (f.mode === 'path') {
        lanePoint(leg, f.s, f.lat, tmp);
        const near = Math.hypot(tmp.x - pos.x, tmp.z - pos.z) < 0.9;
        if (near && want > f.s) f.s += Math.min(want - f.s, CATCH_UP * dt);
        lanePoint(leg, f.s, f.lat, tmp);
        f.goal.set(tmp.x, 0, tmp.z);
        blocks = f.s;
        if (leg.area && f.s >= leg.sEnter) {
          f.mode = 'spread';
          takeSpot(P, f);
          f.settled = false;
        } else if (!leg.area && P.leaving && f.s >= leg.L - 0.05) {
          f.mode = 'gone'; // am Ende des Gehwegs im Dunst verschwunden – Figur zurück in den Vorrat
          detach(f);
          toPool(f);
          continue;
        }
      }
      if (f.mode === 'spread') {
        f.goal.set(f.spot.x, 0, f.spot.z);
        speed = SPOT_SPEED;
        blocks = Infinity;
      }
      if (player && player.level === f.level) speed *= steer(f, player, PLAYER_SPACE);
      if (f.level === 0 && people) for (const p of people) speed *= steer(f, p, OTHERS_SPACE);
      const d = moveToward(f, speed, dt);
      if (f.mode === 'spread') {
        f.settled = d < 0.06;
        if (f.settled) f.lookAt = lookHeading(leg.area, f.spot, leg.points[leg.points.length - 1]);
      }
      limit = blocks - gapFor(blocks === Infinity ? 1 : pointAt(leg, Math.max(0, blocks), tmpB).w);
    }
  }

  // Notlösung: Figur, die lange nicht vorankommt, zum nächsten Wegpunkt (bzw. an ihren Platz) setzen
  function rescue(f) {
    const P = f.party;
    const pos = f.holder.position;
    if (stats.log.length < 12) stats.log.push(`${P.id}/${f.index} ${f.mode} ${P.leg?.names.join('>')} pos ${pos.x.toFixed(2)},${pos.z.toFixed(2)} L${f.level} goal ${f.goal.x.toFixed(2)},${f.goal.z.toFixed(2)}`);
    if (f.mode === 'join') {
      f.via = [];
      f.mode = 'path';
      f.s = 0;
    }
    if (f.mode === 'path') {
      const leg = P.leg;
      const i = leg.cum.findIndex((c) => c > f.s + 0.05);
      f.s = Math.max(f.s, Math.min(i < 0 ? leg.L : leg.cum[i], P.s - 0.3));
      lanePoint(leg, f.s, f.lat, tmp);
      pos.x = tmp.x;
      pos.z = tmp.z;
      const foot = stairHeight(built(), pos.x, pos.z, NODES[leg.names[Math.max(0, i - 1)]]?.level ?? f.level);
      f.level = foot.level;
      f.y = foot.y;
    } else if (f.spot) {
      pos.x = f.spot.x;
      pos.z = f.spot.z;
    }
    f.goal.copy(pos);
    f.last.copy(pos);
    f.stuck = 0;
    stats.rescues++;
  }

  // Figur bei pos auf MIN_OTHERS Abstand zu p schieben
  function keepOff(pos, p) {
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= MIN_OTHERS * MIN_OTHERS) return;
    const d = Math.sqrt(d2);
    if (d < 1e-4) {
      pos.x += MIN_OTHERS;
      return;
    }
    pos.x += (dx / d) * (MIN_OTHERS - d);
    pos.z += (dz / d) * (MIN_OTHERS - d);
  }

  // Untereinander Abstand halten (auch zwischen Grüppchen), Hindernisse, Höhe (Treppe), Hängenbleiben
  function settle(dt, player, people) {
    for (const P of parties.values()) {
      for (const f of P.order) {
        if (f.mode === 'gone' || f.mode === 'off') continue;
        const pos = f.holder.position;
        // Spieler, Azubis, Kunden und Passanten: nie hineinlaufen (falls das Ausweichen nicht gereicht hat)
        if (player && player.level === f.level) keepOff(pos, player);
        if (f.level === 0 && people) for (const p of people) keepOff(pos, p);
        // Wer an seinem Platz steht, wird nicht geschoben – tritt aber kurz zur Seite, wenn jemand vorbei will (sonst
        // verkeilen sich in einer vollen Station Gehende und Stehende)
        {
          for (const Q of parties.values()) {
            for (const o of Q.members) {
              if (o === f || o.mode === 'gone' || o.mode === 'off' || o.level !== f.level) continue;
              if (f.settled && o.settled) continue;
              const p = o.holder.position;
              const dx = pos.x - p.x;
              const dz = pos.z - p.z;
              const d2 = dx * dx + dz * dz;
              if (d2 >= PERSONAL * PERSONAL || d2 < 1e-8) continue;
              const d = Math.sqrt(d2);
              const push = (PERSONAL - d) * (f.settled ? 0.2 : o.settled ? 0.5 : 0.25);
              pos.x += (dx / d) * push;
              pos.z += (dz / d) * push;
            }
          }
        }
        collision?.pushOut(pos, RADIUS, boxes[f.level] ?? []);
        const foot = stairHeight(built(), pos.x, pos.z, f.level);
        f.level = foot.level;
        f.y += (foot.y - f.y) * Math.min(1, dt * 14);
        if (Math.abs(foot.y - f.y) > 0.6) f.y = foot.y;
        pos.y = f.y;

        // Kommt eine Figur trotz Ziel lange nicht voran, wird sie versetzt (sollte nie passieren – zählt mit)
        const far = Math.hypot(f.goal.x - pos.x, f.goal.z - pos.z) > 0.4;
        f.checkT += dt;
        if (f.checkT >= 1) {
          const moved = pos.distanceTo(f.last);
          f.stuck = far && moved < 0.15 ? f.stuck + f.checkT : 0;
          f.last.copy(pos);
          f.checkT = 0;
          // In einer Station zwischen schon Stehenden eingekeilt: dann eben hier stehen bleiben (die Fläche ist frei)
          if (f.mode === 'spread' && f.stuck >= SPREAD_GIVE_UP && inArea(P.leg.area, pos)) {
            releaseSpot(f);
            f.spot = { x: pos.x, z: pos.z, owner: f };
            f.stuck = 0;
            stats.stayed++;
          }
          if (f.stuck > STUCK_SECONDS) rescue(f);
        }
      }
    }
  }

  function settledShare(P) {
    let active = 0;
    let settled = 0;
    for (const f of P.members) {
      if (f.mode === 'gone' || f.mode === 'off') continue;
      active++;
      if (f.mode === 'spread' && f.settled) settled++;
    }
    return active ? settled / active : 1;
  }

  // ---------- Ablauf je Grüppchen ----------

  // Ziel aus core/: Ankunft, nächste Station, Abschied
  function control(P, g, dt) {
    if (!P.started && g.state === 'arriving') startArrival(P);
    if (!P.started && (g.state === 'touring' || g.state === 'leaving')) spawnAtReception(P);
    if (!P.started) return;
    // Enge Station (Empfang): erst los, wenn gerade niemand hineingeht – sonst verkeilen sich Kommende und Gehende
    const ready = P.phase === 'done' && (!busyArriving(P) || (P.passWait += dt) > PASS_WAIT);
    if (P.phase !== 'done') P.passWait = 0;
    if (g.state === 'touring' && ready && !g.dwelling && P.stationIndex !== g.station) {
      P.stationIndex = g.station;
      const target = g.stations[g.station];
      if (target !== P.at && !goTo(P, target)) {
        // z. B. Serverraum ohne zweite Etage: Grüppchen bleibt, wo es ist
        P.reported = g.station;
        stats.reached++;
        visitors.reachedStation(P.id, g.station);
      }
    }
    // Erst den laufenden Weg zu Ende gehen, dann zum Ausgang
    if (g.state === 'leaving' && !P.leaving && (ready || P.phase === 'idle')) startLeaving(P);
  }

  function finishLeg(P, g, dt) {
    if (P.phase !== 'walk' || !P.leg || P.s < P.leg.L) return;
    P.wait += dt;
    if (P.leaving) {
      if (!P.finishedSent && P.members.every((f) => f.mode === 'gone' || f.mode === 'off')) {
        P.finishedSent = true;
        P.phase = 'finished';
        stats.finished++;
        visitors.finished(P.id);
      }
    } else if (settledShare(P) >= QUORUM || P.wait > ARRIVE_TIMEOUT) {
      P.at = P.leg.names[P.leg.names.length - 1];
      P.phase = 'done';
    }
    if (P.phase !== 'done') return;
    // Melden: am Empfang angekommen bzw. an der Station
    if (P.at === 'reception' && g.state === 'arriving' && !P.arrivedSent) {
      P.arrivedSent = true;
      stats.arrived++;
      visitors.arrived(P.id);
    }
  }

  function report(P, g) {
    if (P.phase === 'done' && g.state === 'touring' && P.reported !== g.station && g.stations[g.station] === P.at) {
      P.reported = g.station;
      P.stationIndex = g.station;
      stats.reached++;
      visitors.reachedStation(P.id, g.station);
    }
  }

  // Kommt der Führer-Punkt lange nicht voran (ohne zu Recht vor der Treppe zu warten): Nachzügler aufschließen lassen
  function guardProgress(P, dt) {
    if (P.phase !== 'walk' || P.s >= P.leg.L) {
      P.noProgress = 0;
      return;
    }
    if (P.s > P.lastS + 1e-4) {
      P.lastS = P.s;
      P.noProgress = 0;
      return;
    }
    if ((P.stairWait > 0 && P.stairWait < STAIR_WAIT) || (P.gateWait > 0 && P.gateWait < ROOM_WAIT) || (P.enterWait > 0 && P.enterWait < PASS_WAIT)) return;
    P.noProgress += dt;
    if (P.noProgress < STUCK_SECONDS + 5) return;
    P.noProgress = 0;
    for (const f of P.order) if ((f.mode === 'path' && f.s < P.s - f.lag - 1) || f.mode === 'join') rescue(f);
  }

  // ---------- Sichtbarkeit und Animation ----------

  // Figuren aus dem Vorrat holen. Neue entstehen im Leerlauf (idleWork); nur wer schon LATE_CREATE lang wartet,
  // bekommt seine Figur gleich im Bild (höchstens CREATE_PER_FRAME je Bild, damit nichts ruckelt)
  function prepare(dt) {
    let budget = CREATE_PER_FRAME;
    for (const P of parties.values()) {
      for (const f of P.members) {
        if (f.person || f.mode === 'gone' || !ready.has(f.look)) continue;
        const free = pool.get(f.look);
        if (free?.length) {
          f.person = free.pop();
          poolCount--;
        } else {
          f.waitPerson = (f.waitPerson ?? 0) + dt;
          if (budget <= 0 || f.waitPerson < LATE_CREATE) continue;
          f.person = newPerson(f.look);
          budget--;
          stats.lateCreated++;
        }
        if (!f.person) continue;
        f.person.setScale(f.scale);
        f.holder.add(f.person.object);
      }
    }
  }

  function present(dt, camera, culling) {
    const camLevel = camera && built() && camera.position.y > FLOOR_Y + 0.6 ? 1 : 0;
    for (const P of parties.values()) {
      for (const f of P.members) {
        if (f.mode === 'gone' || f.mode === 'off') {
          detach(f);
          continue;
        }
        const pos = f.holder.position;
        if (f.prevX === undefined) {
          f.prevX = pos.x;
          f.prevZ = pos.z;
        }
        // Laufrichtung bzw. Blick zum Ziel der Station
        const dx = pos.x - f.prevX;
        const dz = pos.z - f.prevZ;
        const moved = Math.hypot(dx, dz);
        f.speed += (moved / Math.max(dt, 1e-4) - f.speed) * Math.min(1, dt * 8);
        if (moved > 0.004) f.heading = headingTo(dx, dz);
        else if (f.settled && f.lookAt !== undefined) f.heading = f.lookAt;
        f.prevX = pos.x;
        f.prevZ = pos.z;
        turnTowards(f.holder, f.heading, dt);

        let visible = !culling || culling.visibleAt(pos);
        if (visible && f.level !== camLevel && !nearStairs(pos)) visible = false; // anderes Stockwerk
        if (!visible || !f.person) {
          detach(f);
          f.animDt = 0;
          continue;
        }
        const p = f.person;
        if (f.speed > 0.15) p.play('Walk', THREE.MathUtils.clamp(f.speed / WALK_CLIP_SPEED, 0.5, 1.3));
        else p.play(f.idle);
        if (!f.attached) {
          group.add(f.holder);
          f.attached = true;
          p.update(0.3); // wieder im Bild: Überblendung von der Haltung beim Ausblenden gleich abschließen
        }
        // Animation: nah jedes Bild, weiter weg jedes zweite bzw. dritte (mit der aufgesparten Zeit)
        f.animDt += dt;
        const d = camera ? camera.position.distanceTo(pos) : 0;
        const every = d < 12 ? 1 : d < 25 ? 2 : 3;
        if ((frame + f.index + P.id) % every === 0) {
          p.update(f.animDt);
          f.animDt = 0;
        }
      }
    }
  }

  // dt: Sekunden · camera: für Stockwerk, Entfernung und Ausweichen · culling: world/room-culling.js (optional)
  function update(dt, camera = null, culling = null) {
    frame++;
    const list = visitors.parties ?? [];
    // Grüppchen, die core/ nicht mehr führt (fertig, Höchstdauer, neu geladen): Figuren zurück in den Vorrat
    for (const P of parties.values()) if (!list.some((g) => g.id === P.id)) teardown(P);
    for (const g of list) if (!parties.has(g.id)) parties.set(g.id, newParty(g));
    // Figuren im Leerlauf anlegen: für Mitglieder ohne Figur und kurz vor der nächsten Ankunft
    if (!idleQueued && ready.size && nextLook()) queueIdle();
    if (!list.length) return;
    requestLooks();

    boxAge += dt;
    if (collision && boxAge >= BOX_REFRESH) {
      boxes = [collision.boxesOn(0, SKIP_DOORS), collision.boxesOn(1, SKIP_DOORS)];
      boxAge = 0;
    }
    const player = camera ? {
      x: camera.position.x, z: camera.position.z,
      level: built() && camera.position.y > FLOOR_Y + 0.6 ? 1 : 0,
    } : null;
    const people = others?.() ?? null;

    for (const g of list) {
      const P = parties.get(g.id);
      control(P, g, dt);
      stairUse(P);
    }
    for (const g of list) {
      const P = parties.get(g.id);
      if (!P.started || !P.leg) continue;
      if (P.leg) P.level = stairHeight(built(), pointAt(P.leg, P.s, tmp).x, tmp.z, P.level).level;
      advanceLeader(P, dt);
      stepMembers(P, dt, player, people);
      guardProgress(P, dt);
      finishLeg(P, g, dt);
      report(P, g);
    }
    settle(dt, player, people);
    prepare(dt);
    present(dt, camera, culling);
  }

  // Positionen für die Bewegungsmelder der Türen (Haustür öffnet sich für Besucher)
  function positions() {
    positionsOut.length = 0;
    for (const P of parties.values()) {
      for (const f of P.members) if (f.mode !== 'gone' && f.mode !== 'off' && f.level === 0) positionsOut.push(f.holder.position);
    }
    return positionsOut;
  }

  // Für Tests: Zustand der Grüppchen
  const debug = () => ({ parties, stats, nodes: NODES, areas: AREAS, pool, spotTables, ready });

  return { group, update, positions, debug };
}
