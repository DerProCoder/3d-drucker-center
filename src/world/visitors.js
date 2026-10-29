// Besuchergruppe als Figuren (Ablauf und Bewertung in core/visitors.js): 40–50 Leute kommen über den Gehweg und den
// Gartenweg, sammeln sich auf der Wiese vor dem Eingang (nicht im Empfang – dort sollen Kunden weiter bedient werden),
// folgen dem Azubi als lockere Traube durch die Halle, zum Lager, zwischen den Drucktischen hindurch, die Treppe hinauf
// in den Serverraum und wieder hinunter und gehen. Auf der Treppe und in Türen gehen sie einzeln hintereinander, oben
// und unten an der Treppe wartet der Azubi, bis alle da sind. An den Stationen verteilen sie sich und schauen sich um.
//
// Wege: ein kleines Wegenetz (NODES/EDGES) durch freie Flächen, an jedem Punkt mit der Breite, die die Gruppe dort
// einnehmen darf (0 = einzeln). Jede Figur hat eine Position s entlang des Weges hinter dem Führer und hält Abstand
// zum Vordermann (wie Autos in einer Kolonne) – in engen Stellen mehr, in breiten weniger, dafür nebeneinander.
// Am Ende eines Abschnitts verteilen sie sich auf Plätze in einer freien Fläche (AREAS). Die Kollision der
// Spielfigur hält sie zusätzlich aus Tischen, Schränken und Wänden; der Spieler selbst wird nie blockiert, die
// Besucher weichen ihm aus (wie die Passanten in world/pedestrians.js).
//
// Besucher sind nicht anklickbar: Sie fangen keine Klickstrahlen ab, Drucker, Tresen und Schränke bleiben bedienbar.
//
// Leistung: zusammengefasste Figuren mit geteiltem Material und ohne Schatten (models/people.js, crowdPerson),
// Animation nur für sichtbare Figuren und mit der Entfernung seltener, ausgeblendet über world/room-culling.js und
// je Stockwerk. Figuren werden schon bei der Ankündigung geladen und nach und nach angelegt. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { crowdPerson, loadCrowd, peopleFor } from '../models/people.js';
import { ENTRANCE_PATH } from './entrance.js';
import { SIDEWALK_LANES } from './outdoor.js';
import { FLOOR_Y, STAIRS, STEPS } from './upper-floor.js';
import { PRINTER_SLOTS_X, TABLE_ROWS_Z } from './hall-layout.js';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';

const SPEED = 1.15;              // m/s Tempo des Führers
const CATCH_UP = 1.7;            // m/s so schnell holen Besucher auf
const SPOT_SPEED = 1.2;          // m/s zum Platz an einer Station
const WALK_CLIP_SPEED = 1.45;    // bei diesem Tempo passt die Laufanimation
const SPACING = 0.62;            // m Abstand hintereinander, wenn sie einzeln gehen (Treppe, Türen)
const SIDE = 0.5;                // m Abstand nebeneinander
const OPEN_ABREAST = 3;          // so viele nebeneinander in der Traube
const RADIUS = 0.22;             // m Körper (gegen Hindernisse und untereinander)
const PERSONAL = 0.46;           // m näher kommen sich zwei Besucher nicht
const SPOT_GAP = 0.62;           // m Raster der Plätze an einer Station
const TURN_SPEED = 6;
const PLAYER_SPACE = 0.75;       // m so weit weichen sie dem Spieler aus
const QUORUM = 0.85;             // Anteil, der an einer Station stehen muss, damit sie als erreicht gilt
const GATHER_TIMEOUT = 30;       // s so lange wartet der Führer höchstens auf Nachzügler
const GATHER_LIMIT = 120;        // s an der Treppe höchstens, auch wenn noch jemand auf der Treppe steht
const GATHER_PAUSE = 1.2;        // s kurz durchzählen, bevor es weitergeht
const STUCK_SECONDS = 10;        // ohne Fortschritt: Figur an ihr Ziel setzen (Notlösung, sollte nie nötig sein)
const SPREAD_GIVE_UP = 3;        // s kommt eine Figur nicht an ihren Platz in der Station, bleibt sie, wo sie ist
const WAVE_SECONDS = 3;          // Azubi winkt zum Abschied an der Haustür
const KID_SCALE = [0.72, 0.86];
const ADULT_SCALE = [0.94, 1.05];
const CREATE_PER_FRAME = 2;      // Figuren, die pro Bild angelegt werden (vor der Ankunft)
const SKIP_DOORS = ['front-door', 'office-door']; // Türen öffnen sich für die Besucher (positions → Bewegungsmelder)

const LANE_X = SIDEWALK_LANES[0];
const STAIR_X = (STAIRS.x0 + STAIRS.x1) / 2;
const RISE = FLOOR_Y / STEPS;

// Wegpunkte (Welt-x/z, level: Stockwerk) · w: wie weit die Gruppe hier zur Seite ausschweifen darf (m, halbe Breite)
const NODES = {
  sidewalkN: { x: LANE_X, z: -30, w: 0.7 },
  sidewalkS: { x: LANE_X, z: 30, w: 0.7 },
  gate: { x: LANE_X, z: 0, w: 0.45 },                       // Gehweg vor dem Gartenweg
  hedge: { x: -29.4, z: 0, w: 0.4 },                        // Lücke in der Hecke
  lawn: { x: -29.0, z: 2.6, w: 0.25 },                      // auf die Wiese, westlich der Blumenbeete
  path: { x: -23, z: 0, w: 0.5 },                           // Gartenweg
  reception: { x: -20.2, z: 2.2, w: 0.3 },                  // Treffpunkt mit dem Azubi am Rand der Terrasse
  frontOut: { ...ENTRANCE_PATH.frontOutside, w: 0.35 },
  frontIn: { ...ENTRANCE_PATH.frontInside, w: 0 },
  lobby: { x: -13, z: 0.2, w: 0.45 },                       // zwischen Tresen und Abholregal
  entIn: { ...ENTRANCE_PATH.inside, w: 0 },
  hallDoor: { ...ENTRANCE_PATH.hall, w: 0 },
  hallWest: { x: -6, z: 1.4, w: 0.8 },
  hall: { x: -3.55, z: 1.7, w: 0.5 },                       // Station Druckhalle (Führer links vor den Tischen)
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
  ['reception', 'frontOut'], ['frontOut', 'frontIn'], ['frontIn', 'lobby'], ['lobby', 'entIn'], ['entIn', 'hallDoor'],
  ['hallDoor', 'hallWest'], ['hallWest', 'hall'], ['hall', 'storage'], ['hall', 'tablesW'], ['tablesW', 'tablesE'],
  ['tablesE', 'stairs'],
];
const UPPER_EDGES = [['stairs', 'stairTop'], ['stairTop', 'landing'], ['landing', 'servers']]; // nur mit zweiter Etage

const nearest = (values, v) => values.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
// Freie Flächen zum Verteilen (Rechtecke ohne Hindernisse) · look(p): wohin man von Platz p aus schaut
// (null: zum Führer) · avoid: Bäume u. Ä. in der Fläche
const AREAS = {
  reception: { x0: -29.3, x1: -21.0, z0: 2.3, z1: 7.6, level: 0, look: null, avoid: [{ x: -26.5, z: 6 }, { x: -21, z: 8.2 }] },
  hall: { x0: -2.9, x1: 2.9, z0: 1.6, z1: 5.6, level: 0, look: (p) => ({ x: nearest(PRINTER_SLOTS_X, p.x), z: TABLE_ROWS_Z[0] }) },
  storage: { x0: -9.3, x1: -3.3, z0: 5.9, z1: 9.2, level: 0, look: () => ({ x: STORAGE_DOOR.x, z: ROOM_SIZE / 2 + 1 }) },
  stairs: { x0: 5.4, x1: 9.6, z0: -1.6, z1: 3.2, level: 0, look: null },
  landing: { x0: 1.5, x1: 8.3, z0: -8.25, z1: -4.6, level: 1, look: null },
  // Serverschränke stehen in Reihe A (z = −4, Glastüren zum Gang) und B (z = 2), x von −8 bis −1 (core/server-zones.js)
  servers: { x0: -8.0, x1: -0.8, z0: -3.0, z1: 1.0, level: 1, look: (p) => ({ x: THREE.MathUtils.clamp(Math.round(p.x), -8, -1), z: p.z < -1 ? -4 : 2 }) },
};
const GATHER = new Set(['stairs', 'landing']); // hier wartet der Führer unterwegs, bis alle da sind

// Kleiner Zufallsgenerator mit Startwert – jede Gruppe sieht bei jedem Laden gleich aus
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

// Plätze in einer Fläche: Raster mit etwas Zufall, nicht zu nah an Bäumen. Reicht der Platz nicht für count Leute,
// rücken sie enger zusammen.
function areaSpots(area, random, count = 0, gap = SPOT_GAP) {
  const spots = [];
  const m = 0.28;
  for (let x = area.x0 + m; x <= area.x1 - m + 1e-6; x += gap) {
    for (let z = area.z0 + m; z <= area.z1 - m + 1e-6; z += gap) {
      const p = {
        x: THREE.MathUtils.clamp(x + (random() - 0.5) * 0.16, area.x0 + m, area.x1 - m),
        z: THREE.MathUtils.clamp(z + (random() - 0.5) * 0.16, area.z0 + m, area.z1 - m),
      };
      if ((area.avoid ?? []).some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.8)) continue;
      spots.push(p);
    }
  }
  return spots.length < count && gap > 0.4 ? areaSpots(area, random, count, gap * 0.94) : spots;
}

const inArea = (area, p) => p.x >= area.x0 && p.x <= area.x1 && p.z >= area.z0 && p.z <= area.z1;
const turnTowards = (object, b, dt) => {
  const a = object.rotation.y;
  object.rotation.y = a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, TURN_SPEED * dt);
};
// Laufrichtung → Drehwinkel (Figuren schauen nach +z)
const headingTo = (dx, dz) => Math.atan2(dx, dz);
// Platz für die Figur nebeneinander: goldener Schnitt verteilt aufeinanderfolgende Ränge gut über die Breite
const lateralOf = (rank) => ((rank * 0.618034 + 0.31) % 1) * 2 - 1;

// Abschnitt eines Weges: Punkte (Knoten), Längen, Breiten, Fläche am Ende
function makeLeg(points, areaName = null, names = []) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const leg = { points, cum, L: cum[cum.length - 1], area: areaName ? AREAS[areaName] : null, areaName, names, sEnter: Infinity, guideStop: Infinity };
  if (leg.area) {
    // Ab hier liegt der Rest des Weges in der Fläche: dann direkt zum Platz
    const p = {};
    leg.sEnter = Math.max(0, leg.L - 0.5);
    for (let s = leg.L; s >= 0; s -= 0.1) {
      pointAt(leg, s, p);
      if (!inArea(leg.area, p)) break;
      leg.sEnter = s;
    }
  }
  const stop = names.indexOf('frontOut');
  if (stop >= 0) leg.guideStop = cum[stop];
  return leg;
}

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

// Abstand zum Vordermann bei halber Breite w: nebeneinander dürfen sie dichter aufrücken
const gapFor = (w) => SPACING / Math.min(OPEN_ABREAST, 1 + Math.floor((2 * w) / SIDE));

// visitors: core/visitors.js · workers: world/workers.js (guide) · collision: Kollision der Spielfigur
// upperFloor: world/upper-floor.js (built) · onReady(): Figuren sind geladen und hängen in der Szene (Shader vorab
// übersetzen)
export function createVisitorGroup({ visitors, workers = null, collision = null, upperFloor = null, onReady = () => {} }) {
  const group = new THREE.Group();
  group.name = 'visitors';
  const pool = new Map();          // Aussehen → freie Figuren (werden von Gruppe zu Gruppe wiederverwendet)
  const loading = new Map();       // Aussehen-Liste → Promise
  const ready = new Set();         // fertig geladene Aussehen
  let warm = null;                 // unsichtbare Figur, damit der Shader vorab übersetzt werden kann
  let run = null;                  // laufende Gruppe
  let frame = 0;
  const stats = { rescues: 0, created: 0, disposed: 0, stayed: 0, log: [] }; // für Tests
  const positionsOut = [];
  const tmp = {};
  const tmpB = {};

  // ---------- Laden ----------

  function looksFor(g) {
    const adults = peopleFor('visitor').map((p) => p.id);
    const pupils = peopleFor('pupil').map((p) => p.id);
    const grownUps = adults.filter((id) => !pupils.includes(id));
    // Schulklasse: Kinder plus zwei Begleiter, die erwachsen aussehen
    return g?.kids ? [...pupils, grownUps[0], grownUps[2]] : adults;
  }

  // Figuren der (angekündigten) Gruppe laden – ohne Gruppe alle Besucher-Figuren
  function preload(g = visitors.group) {
    const looks = looksFor(g);
    const key = looks.join(',');
    if (!loading.has(key)) {
      loading.set(key, loadCrowd(looks).then(() => {
        for (const id of looks) ready.add(id);
        if (!warm) {
          warm = crowdPerson(looks[0]);
          warm.object.visible = false; // zählt beim Vorübersetzen der Shader mit, wird aber nie gezeichnet
          warm.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
          group.add(warm.object);
          onReady();
        }
      }).catch((err) => console.warn('Besucher-Figuren konnten nicht geladen werden', err)));
    }
    return loading.get(key);
  }

  function takePerson(look) {
    const free = pool.get(look);
    if (free?.length) return free.pop();
    if (!ready.has(look)) return null;
    const person = crowdPerson(look);
    if (!person) return null;
    stats.created++;
    person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; }); // fängt keine Klicks ab (siehe newRun)
    person.mixer.update(Math.random() * 2); // nicht alle im Gleichschritt
    return person;
  }

  // ---------- Gruppe anlegen und abbauen ----------

  function newRun(g) {
    const random = seeded(g.id * 7919 + g.size);
    const looks = looksFor(g);
    const kidLooks = peopleFor('pupil').map((p) => p.id);
    const followers = [];
    for (let i = 0; i < g.size; i++) {
      const adult = !g.kids || i < 2; // Schulklasse: zwei Erwachsene als Begleitung
      const choice = adult && g.kids ? looks.filter((id) => !kidLooks.includes(id)) : adult ? looks : kidLooks;
      const look = choice[Math.floor(random() * choice.length)];
      const [s0, s1] = adult ? ADULT_SCALE : KID_SCALE;
      // Besucher sind nicht anklickbar und fangen den Klickstrahl nicht ab (keine Hitbox): Drucker, Tresen und
      // Schränke bleiben auch durch die Gruppe hindurch bedienbar
      const holder = new THREE.Group();
      followers.push({
        index: i, look, scale: s0 + random() * (s1 - s0), idle: random() < 0.5 ? 'Idle' : 'Idle_Neutral',
        holder, person: null, attached: false, mode: 'off', s: 0, rank: i, lag: 0, lat: 0, jitter: random() * 0.25,
        spot: null, settled: false, level: 0, y: 0, heading: 0, speed: 0, animDt: 0,
        goal: new THREE.Vector3(), last: new THREE.Vector3(), stuck: 0, checkT: 0,
        via: [], // Zwischenpunkte des vorigen Weges, die vor dem Anfang des neuen Abschnitts noch abzulaufen sind
      });
    }
    const exitSide = random() < 0.5 ? 'sidewalkN' : 'sidewalkS';
    return {
      id: g.id, followers, random, exitSide, spawnSide: exitSide === 'sidewalkN' ? 'sidewalkS' : 'sidewalkN',
      started: false, legs: [], leg: null, headS: 0, headLevel: 0, headY: 0, phase: 'idle', wait: 0, at: null,
      stationIndex: -1, reported: -1, arrivedSent: false, leaving: false, finishedSent: false,
      guide: null, guideWave: 0, guideReleased: false, spots: null, spotNext: 0,
    };
  }

  function detach(f) {
    if (f.attached) group.remove(f.holder);
    f.attached = false;
  }

  function teardown() {
    if (!run) return;
    for (const f of run.followers) {
      detach(f);
      if (f.person) {
        f.holder.remove(f.person.object);
        if (!pool.has(f.look)) pool.set(f.look, []);
        pool.get(f.look).push(f.person);
        f.person = null;
      }
    }
    releaseGuide();
    run = null;
  }

  // Vorrat begrenzen: je Aussehen nur so viele freie Figuren behalten, wie die neue Gruppe braucht, den Rest freigeben.
  // Sonst wüchse der Vorrat mit jeder Gruppe, deren Mischung anders ausfällt. So liegen höchstens so viele Figuren
  // bereit, wie eine Gruppe Personen hat.
  function trimPool(r) {
    const need = new Map();
    for (const f of r.followers) need.set(f.look, (need.get(f.look) ?? 0) + 1);
    for (const [look, free] of pool) {
      while (free.length > (need.get(look) ?? 0)) {
        free.pop().dispose(); // Knochen und Animation – Geometrie und Material sind geteilt und bleiben
        stats.disposed++;
      }
    }
  }

  // ---------- Führer (Azubi aus world/workers.js) ----------

  function ensureGuide(g) {
    if (run.guideReleased || g.workerId == null || !workers?.guide) return;
    if (run.guide?.alive) return;
    run.guide = workers.guide(g.workerId);
    if (!run.guide) return;
    // Neu übernommen: zum Treffpunkt bzw. dorthin, wo die Gruppe gerade ist
    if (!run.leg || run.at === 'reception') run.guide.walkTo([NODES.frontIn, NODES.frontOut, NODES.reception]);
    else placeGuide(0);
  }

  function releaseGuide() {
    if (run?.guide?.alive) run.guide.release();
    // Abschied an der Haustür: core/ gibt den Azubi gleich frei, nicht erst, wenn die Gruppe den Gehweg verlassen hat
    if (run?.leaving && !run.guideReleased) visitors.guideReleased();
    if (run) {
      run.guide = null;
      run.guideReleased = true;
    }
  }

  const guideFree = () => !run.guide?.alive || !run.guide.walking;

  function placeGuide(speed) {
    const guide = run.guide;
    if (!guide?.alive || guide.walking || !run.leg) return;
    const s = run.leaving ? Math.min(run.headS, run.leg.guideStop) : run.headS; // beim Abschied bleibt er an der Haustür
    pointAt(run.leg, s, tmp);
    guide.place(tmp.x, run.headY, tmp.z, headingTo(tmp.dx, tmp.dz), s < run.headS ? 0 : speed);
  }

  // ---------- Wege ----------

  function graph() {
    const edges = upperFloor?.built ? [...EDGES, ...UPPER_EDGES] : EDGES;
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

  // Weg in Abschnitte teilen: an den Treppenenden warten, bis alle da sind
  function legsFor(names, finalArea) {
    const legs = [];
    let start = 0;
    for (let i = 1; i < names.length; i++) {
      const last = i === names.length - 1;
      if (!last && !GATHER.has(names[i])) continue;
      const part = names.slice(start, i + 1);
      legs.push(makeLeg(part.map((n) => NODES[n]), last ? finalArea : names[i], part));
      start = i;
    }
    return legs;
  }

  // ---------- Abschnitte starten ----------

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

  function startLeg(leg) {
    const prev = run.leg;
    run.leg = leg;
    run.headS = 0;
    run.phase = 'walk';
    run.wait = 0;
    run.spots = null;
    const start = leg.points[0];
    const active = run.followers.filter((f) => f.mode !== 'gone' && f.mode !== 'off');
    // Wer noch auf dem vorigen Weg unterwegs ist (z. B. noch auf der Treppe steht), läuft ihn erst zu Ende – geradeaus
    // zum neuen Anfang ginge es sonst gegen das Treppengeländer. Der vorige Weg endet dort, wo der neue beginnt.
    for (const f of active) {
      if (!prev || prev === leg) f.via = [];
      else if (f.mode === 'path') f.via = prev.points.filter((p, i) => prev.cum[i] > f.s + 0.05);
      else if (f.mode === 'join') f.via = [...f.via, ...prev.points];
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
      f.spot = null;
    });
    run.order = active;
  }

  // Ankunft: auf dem Gehweg hinter der Ecke auftauchen und zum Garten laufen
  function startArrival() {
    run.started = true;
    const names = [run.spawnSide, 'gate', 'hedge', 'lawn'];
    const leg = makeLeg(names.map((n) => NODES[n]), 'reception', names);
    for (const f of run.followers) {
      f.mode = 'join';
      f.holder.position.set(NODES[run.spawnSide].x, 0, NODES[run.spawnSide].z);
    }
    startLeg(leg);
    run.at = null;
    for (const f of run.order) {
      // Gleich in Kolonne auf dem Gehweg hinter dem Anfang aufstellen
      f.mode = 'path';
      f.s = -f.lag;
      pointAt(leg, f.s, tmp);
      f.holder.position.set(tmp.x + -tmp.dz * f.lat * tmp.w, 0, tmp.z + tmp.dx * f.lat * tmp.w);
      f.heading = headingTo(tmp.dx, tmp.dz);
      f.holder.rotation.y = f.heading;
      f.last.copy(f.holder.position);
    }
    run.arrival = true;
  }

  // Ohne Ankunft (z. B. Zustand übersprungen): gleich auf der Wiese vor dem Eingang stehen
  function spawnAtReception() {
    run.started = true;
    run.at = 'reception';
    const spots = areaSpots(AREAS.reception, run.random, run.followers.length);
    run.followers.forEach((f, i) => {
      const p = spots[i % spots.length];
      f.mode = 'spread';
      f.settled = true;
      f.spot = p;
      f.holder.position.set(p.x, 0, p.z);
      f.last.copy(f.holder.position);
      f.heading = lookHeading(AREAS.reception, p, NODES.reception);
      f.holder.rotation.y = f.heading;
    });
    run.leg = makeLeg([NODES.reception], 'reception', ['reception']);
    run.order = run.followers;
    run.headS = 0;
    run.phase = 'done';
  }

  function goTo(target, finalArea) {
    const names = findPath(run.at, target);
    if (!names) return false;
    if (names.length < 2) {
      run.phase = 'done';
      return true;
    }
    run.legs = legsFor(names, finalArea);
    startLeg(run.legs.shift());
    return true;
  }

  function startLeaving() {
    run.leaving = true;
    run.legs = [];
    let from = run.at;
    if (!from && run.leg) from = run.leg.names[run.leg.names.length - 1]; // mitten im Weg: erst zu dessen Ende
    run.at = from ?? 'reception';
    if (!goTo(run.exitSide, null)) {
      for (const f of run.followers) f.mode = 'gone';
    }
  }

  function lookHeading(area, p, anchor) {
    const target = area.look ? area.look(p) : anchor;
    return headingTo(target.x - p.x, target.z - p.z);
  }

  // ---------- Bewegung ----------

  // Steht p auf der Treppe (zwischen den Geländern)?
  const onStairs = (p) => !!upperFloor?.built && p.x > STAIRS.x0 && p.x < STAIRS.x1 && p.z < STAIRS.zLow && p.z > STAIRS.zHigh;

  function stairHeight(x, z, level) {
    if (!upperFloor?.built) return { y: 0, level: 0 };
    const { x0, x1, zLow, zHigh } = STAIRS;
    if (x > x0 && x < x1 && z < zLow && z > zHigh) {
      // Stufe für Stufe: Füße stehen auf der Stufe, über der die Figur gerade ist
      const step = Math.min(STEPS, Math.floor(((zLow - z) / (zLow - zHigh)) * STEPS) + 1);
      const y = step * RISE;
      return { y, level: y > FLOOR_Y / 2 ? 1 : 0 };
    }
    return { y: level * FLOOR_Y, level };
  }

  function spotFor(f) {
    if (!run.spots) {
      const area = run.leg.area;
      const entry = {};
      pointAt(run.leg, run.leg.sEnter, entry);
      run.spots = areaSpots(area, run.random, run.followers.length).sort((a, b) => Math.hypot(b.x - entry.x, b.z - entry.z) - Math.hypot(a.x - entry.x, a.z - entry.z));
      run.spotNext = 0;
    }
    const p = run.spots[run.spotNext % run.spots.length];
    run.spotNext++;
    return p;
  }

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

  function dodge(f, player) {
    if (!player || player.level !== f.level) return;
    const dx = f.goal.x - player.x;
    const dz = f.goal.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d >= PLAYER_SPACE) return;
    const k = d > 1e-3 ? (PLAYER_SPACE - d) / d : 1;
    f.goal.x += d > 1e-3 ? dx * k : PLAYER_SPACE;
    f.goal.z += d > 1e-3 ? dz * k : 0;
  }

  function stepFollowers(dt, player) {
    const leg = run.leg;
    if (!leg) return;
    const end = pointAt(leg, leg.L, tmpB);
    const endX = end.x;
    const endZ = end.z;
    let limit = Infinity; // so weit darf der Nächste höchstens (s), wegen des Vordermanns
    // Ist der Führer am Ziel, zählt nur noch der Vordermann – alle rücken nach
    const head = run.headS >= leg.L ? Infinity : run.headS;
    for (const f of run.order) {
      if (f.mode === 'gone' || f.mode === 'off') continue;
      const want = Math.min(head - f.lag, limit, leg.L);
      let speed = CATCH_UP;
      let blocks = Infinity;
      const pos = f.holder.position;
      while (f.mode === 'join' && f.via.length && Math.hypot(f.via[0].x - pos.x, f.via[0].z - pos.z) < 0.15) f.via.shift();
      if (f.mode === 'join' && f.via.length) {
        // Erst den vorigen Weg zu Ende gehen (Treppe), dann wie alle anderen zum Anfang
        f.goal.set(f.via[0].x, 0, f.via[0].z);
        blocks = -joinDistance(f, leg.points[0]);
      } else if (f.mode === 'join') {
        // Zum Anfang des Abschnitts – höchstens so nah, wie Vordermann und Führer es erlauben
        pointAt(leg, 0, tmp);
        const tx = tmp.x + -tmp.dz * f.lat * tmp.w;
        const tz = tmp.z + tmp.dx * f.lat * tmp.w;
        const d = Math.hypot(tx - pos.x, tz - pos.z);
        const allowed = Math.max(0, -want); // so weit muss er noch vom Anfang weg bleiben
        if (d <= Math.max(0.3, allowed + 1e-3) && want >= 0) {
          f.mode = 'path';
          f.s = 0;
        } else if (d > allowed) {
          const k = (d - allowed) / d;
          f.goal.set(pos.x + (tx - pos.x) * k, 0, pos.z + (tz - pos.z) * k);
        } else {
          f.goal.copy(pos);
        }
        blocks = -d;
      }
      if (f.mode === 'path') {
        pointAt(leg, f.s, tmp);
        const near = Math.hypot(tmp.x + -tmp.dz * f.lat * tmp.w - f.holder.position.x, tmp.z + tmp.dx * f.lat * tmp.w - f.holder.position.z) < 0.9;
        if (near && want > f.s) f.s += Math.min(want - f.s, CATCH_UP * dt);
        pointAt(leg, f.s, tmp);
        f.goal.set(tmp.x + -tmp.dz * f.lat * tmp.w, 0, tmp.z + tmp.dx * f.lat * tmp.w);
        blocks = f.s;
        if (leg.area && f.s >= leg.sEnter) {
          f.mode = 'spread';
          f.spot = spotFor(f);
          f.settled = false;
        } else if (!leg.area && f.s >= leg.L - 0.05 && run.leaving && !run.legs.length) {
          f.mode = 'gone'; // am Ende des Gehwegs im Dunst verschwunden
          detach(f);
          continue;
        }
      }
      if (f.mode === 'spread') {
        f.goal.set(f.spot.x, 0, f.spot.z);
        speed = SPOT_SPEED;
        blocks = Infinity;
      }
      dodge(f, player);
      const d = moveToward(f, speed, dt);
      if (f.mode === 'spread') {
        f.settled = d < 0.06;
        if (f.settled) f.lookAt = lookHeading(leg.area, f.spot, { x: endX, z: endZ });
      }
      limit = blocks - gapFor(blocks === Infinity ? 1 : pointAt(leg, Math.max(0, blocks), tmp).w);
    }
  }

  // Untereinander Abstand halten, Hindernisse, Höhe (Treppe), Hängenbleiben
  function settle(dt, boxes) {
    const list = run.order ?? run.followers;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.mode === 'gone' || f.mode === 'off') continue;
      const pos = f.holder.position;
      if (!f.settled) {
        for (const o of list) {
          if (o === f || o.mode === 'gone' || o.mode === 'off' || o.level !== f.level) continue;
          const p = o.holder.position;
          const dx = pos.x - p.x;
          const dz = pos.z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= PERSONAL * PERSONAL || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const push = (PERSONAL - d) * (o.settled ? 0.5 : 0.25);
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        }
      }
      collision?.pushOut(pos, RADIUS, boxes[f.level] ?? []);
      const foot = stairHeight(pos.x, pos.z, f.level);
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
        if (f.mode === 'spread' && f.stuck >= SPREAD_GIVE_UP) {
          f.spot = { x: pos.x, z: pos.z };
          f.stuck = 0;
          stats.stayed++;
        }
        if (f.stuck > STUCK_SECONDS) {
          if (stats.log.length < 12) stats.log.push(`${f.mode} ${run.leg?.names.join('>')} pos ${pos.x.toFixed(2)},${pos.z.toFixed(2)} L${f.level} goal ${f.goal.x.toFixed(2)},${f.goal.z.toFixed(2)}`);
          pos.x = f.goal.x;
          pos.z = f.goal.z;
          f.stuck = 0;
          stats.rescues++;
        }
      }
    }
  }

  function advanceHead(dt) {
    const leg = run.leg;
    if (!leg || run.headS >= leg.L) return false;
    if (!run.arrival && !guideFree()) return false;
    const list = run.order;
    const front = list.find((f) => f.mode === 'path' || f.mode === 'join');
    const frontS = front ? (front.mode === 'path' ? front.s : -joinDistance(front, leg.points[0])) : run.headS;
    let rear = Infinity;
    for (const f of list) if (f.mode === 'path') rear = Math.min(rear, f.s);
    // Warten, wenn vorn jemand nicht mitkommt oder die Kolonne zu lang wird
    if (front && frontS < run.headS - front.lag - 2.5) return false;
    if (rear !== Infinity && rear < run.headS - (list.length * SPACING + 6)) return false;
    run.headS = Math.min(leg.L, run.headS + SPEED * dt);
    return true;
  }

  function settledShare() {
    const active = run.followers.filter((f) => f.mode !== 'gone' && f.mode !== 'off');
    if (!active.length) return 1;
    return active.filter((f) => f.mode === 'spread' && f.settled).length / active.length;
  }

  // ---------- Ablauf ----------

  function step(dt, g, player) {
    // Ziel des Rundgangs aus core/: Station gewechselt bzw. Abschied
    if (g.state === 'arriving' && !run.started) startArrival();
    if ((g.state === 'touring' || g.state === 'leaving') && !run.started) spawnAtReception();
    if (g.state === 'touring' && run.phase === 'done' && run.stationIndex !== g.station && !visitors.dwelling) {
      run.stationIndex = g.station;
      const target = g.stations[g.station];
      if (target !== run.at && !goTo(target, AREAS[target] ? target : null)) {
        visitors.reachedStation(g.station); // z. B. Serverraum ohne zweite Etage: Gruppe bleibt unten
        run.reported = g.station;
      }
    }
    if (g.state === 'leaving' && !run.leaving) startLeaving();

    const moving = advanceHead(dt);
    if (run.leg) {
      const foot = stairHeight(pointAt(run.leg, run.headS, tmp).x, tmp.z, run.headLevel);
      run.headLevel = foot.level;
      run.headY = foot.y;
    }
    stepFollowers(dt, player);

    // Führer: auf dem Weg vorneweg, an der Haustür verabschieden
    if (run.guide?.alive && run.leg) {
      if (run.leaving && run.headS >= run.leg.guideStop && !run.guide.walking) {
        if (!run.guideWave) {
          run.guideWave = WAVE_SECONDS;
          run.guide.place(NODES.frontOut.x, 0, NODES.frontOut.z, -Math.PI / 2, 0);
          run.guide.wave(WAVE_SECONDS);
        } else {
          run.guideWave -= dt;
          if (run.guideWave <= 0) releaseGuide();
        }
      } else if (run.phase === 'walk' && !run.arrival) {
        placeGuide(moving ? SPEED : 0);
      }
    }

    // Abschnitt zu Ende: weiter, Station melden oder fertig
    if (run.phase === 'walk' && run.leg && run.headS >= run.leg.L) {
      const share = settledShare();
      run.wait += dt;
      const last = run.leg.names[run.leg.names.length - 1];
      if (run.leaving && !run.legs.length) {
        if (run.followers.every((f) => f.mode === 'gone' || f.mode === 'off')) {
          run.phase = 'finished';
          releaseGuide();
          visitors.finished();
          return;
        }
      } else if (run.legs.length) {
        // Treppenende: alle abwarten (kurze Pause zum Durchzählen). Nachzügler höchstens GATHER_TIMEOUT lang – aber
        // nie, solange noch jemand auf der Treppe steht (Notlösung nach GATHER_LIMIT)
        const stairsFree = !run.followers.some((f) => f.mode !== 'gone' && f.mode !== 'off' && onStairs(f.holder.position));
        if ((share >= 1 && run.wait > GATHER_PAUSE) || (run.wait > GATHER_TIMEOUT && stairsFree) || run.wait > GATHER_LIMIT) {
          run.at = last;
          startLeg(run.legs.shift());
        }
      } else if (share >= QUORUM || run.wait > GATHER_TIMEOUT) {
        run.at = run.arrival ? 'reception' : last; // Ankunft endet auf der Wiese, Treffpunkt ist der Empfang
        run.phase = 'done';
        run.arrival = false;
      }
      // Führer schaut am Ziel zur Gruppe
      if (run.guide?.alive && !run.guide.walking && run.leg.area && !run.leaving) {
        const a = run.leg.area;
        run.guide.face(headingTo((a.x0 + a.x1) / 2 - tmp.x, (a.z0 + a.z1) / 2 - tmp.z));
      }
    }
    // Melden: Gruppe versammelt bzw. an der Station (mit Führer)
    if (run.phase === 'done' && run.at === 'reception' && g.state === 'arriving' && !run.arrivedSent) {
      run.arrivedSent = true;
      visitors.arrived();
    }
    if (run.phase === 'done' && g.state === 'touring' && run.reported !== g.station && g.stations[g.station] === run.at) {
      const guideThere = !run.guide?.alive || (!run.guide.walking && Math.hypot(run.guide.position.x - NODES[run.at].x, run.guide.position.z - NODES[run.at].z) < 0.6);
      if (guideThere) {
        run.reported = g.station;
        run.stationIndex = g.station;
        visitors.reachedStation(g.station);
      }
    }
    if (run.phase === 'done' && run.guide?.alive && !run.guide.walking && NODES[run.at]) {
      const a = AREAS[run.at];
      if (a) run.guide.face(headingTo((a.x0 + a.x1) / 2 - NODES[run.at].x, (a.z0 + a.z1) / 2 - NODES[run.at].z));
    }
  }

  // ---------- Sichtbarkeit und Animation ----------

  const nearStairs = (p) => p.x > STAIRS.x0 - 2.5 && p.z < STAIRS.zLow + 2.5 && p.z > STAIRS.zHigh - 1.5;

  function present(dt, camera, culling) {
    const camLevel = camera && upperFloor?.built && camera.position.y > FLOOR_Y + 0.6 ? 1 : 0;
    for (const f of run.followers) {
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
      if (visible && !f.person) {
        f.person = takePerson(f.look);
        if (f.person) {
          f.person.setScale(f.scale);
          f.holder.add(f.person.object);
        }
      }
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
      if ((frame + f.index) % every === 0) {
        p.update(f.animDt);
        f.animDt = 0;
      }
    }
  }

  // Figuren vorab anlegen (verteilt auf mehrere Bilder), damit die Ankunft nicht ruckelt
  function prepare(g) {
    let budget = g.state === 'announced' ? CREATE_PER_FRAME : CREATE_PER_FRAME * 3;
    for (const f of run.followers) {
      if (budget <= 0) break;
      if (f.person || !ready.has(f.look)) continue;
      f.person = takePerson(f.look);
      if (!f.person) continue;
      f.person.setScale(f.scale);
      f.holder.add(f.person.object);
      budget--;
    }
  }

  // dt: Sekunden · camera: für Stockwerk, Entfernung und Ausweichen · culling: world/room-culling.js (optional)
  function update(dt, camera = null, culling = null) {
    frame++;
    const g = visitors.group;
    if (!g) {
      teardown();
      return;
    }
    if (!run || run.id !== g.id) {
      teardown();
      run = newRun(g);
      trimPool(run);
    }
    preload(g);
    prepare(g);
    if (g.state === 'announced') return;
    ensureGuide(g);
    const player = camera ? {
      x: camera.position.x, z: camera.position.z,
      level: upperFloor?.built && camera.position.y > FLOOR_Y + 0.6 ? 1 : 0,
    } : null;
    const boxes = collision ? [collision.boxesOn(0, SKIP_DOORS), collision.boxesOn(1, SKIP_DOORS)] : [];
    step(dt, g, player);
    if (!run) return;
    settle(dt, boxes);
    present(dt, camera, culling);
  }

  // Positionen für die Bewegungsmelder der Türen (Haustür öffnet sich für Besucher und den führenden Azubi)
  function positions() {
    positionsOut.length = 0;
    if (!run) return positionsOut;
    for (const f of run.followers) if (f.mode !== 'gone' && f.mode !== 'off' && f.level === 0) positionsOut.push(f.holder.position);
    if (run.guide?.alive) positionsOut.push(run.guide.position);
    return positionsOut;
  }

  // Für Tests: Zustand der laufenden Gruppe
  const debug = () => ({ run, stats, nodes: NODES, areas: AREAS, pool });

  return { group, update, preload, positions, debug };
}
