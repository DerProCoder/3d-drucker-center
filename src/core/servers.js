// Serverraum in der zweiten Etage: Serverschränke aufstellen, Geräte einbauen, Kabel stecken und mit Servern Geld
// verdienen. Schränke und Geräte sind Einrichtung aus economy.furniture (Karton, Lieferung, Abstellraum, Tragen wie
// bei Regalen) mit eigenen Orten:
//   Schrank: location 'server', slot = Stellplatz oben (world/server-room.js)
//   Gerät:   location 'rack', rackId, unit = oberste belegte Höheneinheit (0 = ganz oben im Schrank). Die Höhe
//            wählt man beim Einbauen durch Zielen und kann sie im Schrankfenster ändern.
// Ein Server ist online, wenn er über Kabel am LAN der Firewall hängt (direkt oder über Switches) und der WAN-Port
// der Firewall mit einem Patchpanel (dem Internetanschluss) verbunden ist. Kabel gibt es nur innerhalb eines Schranks;
// gesteckt wird hinten am Schrank Port für Port (world/server-room.js). Kabel kommt als Rolle in Metern, jede
// Verbindung verbraucht ihre Länge, Abziehen gibt das Stück zurück in den Vorrat.
// Online-Server bringen zu jeder vollen Spielstunde Einnahmen; Strom kosten alle eingebauten Geräte
// (economy.extraPowerPerHour, läuft mit der normalen Stromrechnung). Ohne Three.js und DOM.
import { CABLE_ROLL, UNIT_METERS, isServerHardware, portName } from './server-catalog.js';
import { meters } from './format.js';

export const SERVER_SPOTS = 16; // Stellplätze für Schränke in der zweiten Etage
const CABLE_SLACK = 0.3;        // m je Kabel für die Schlaufe an den Steckern
const CLIP_DETOUR = 0.25;       // m je Seite der Kabelführung, die das Kabel anläuft (hin und zurück)
const round1 = (m) => Math.round(m * 10) / 10;

export class Servers {
  constructor(economy) {
    this.economy = economy;
    // { a: { id, port }, b: { id, port }, clips: [{ side, index }], length (m) } – id: Gerät aus economy.furniture,
    // clips: Clips der Kabelführung, durch die das Kabel läuft (side −1/1 = −x/+x, von hinten gesehen rechts/links; index 0 = oben; leer = frei)
    this.cables = [];
    this.cableMeters = 0;   // Kabel im Vorrat in Metern
    this.deliveries = [];   // Kabelrollen unterwegs: { arriveIn (Sekunden), meters }
    this.onEvent = null;    // (type, data) => void – z. B. 'cables-delivered'
    // Warum ein Gerät nicht arbeitet (defekt, eingefroren – core/server-climate.js setzt das), oder null
    this.deviceProblem = () => null;
    economy.extraPowerPerHour = () => this.powerPerHour;
  }

  get hardware() {
    return this.economy.furniture.filter((f) => isServerHardware(f.type));
  }

  // Aufgestellte Schränke
  get racks() {
    return this.economy.furniture.filter((f) => f.type.kind === 'rack' && f.location === 'server');
  }

  devicesIn(rackId) {
    return this.economy.furniture.filter((f) => f.location === 'rack' && f.rackId === rackId).sort((a, b) => a.unit - b.unit);
  }

  get installed() {
    return this.economy.furniture.filter((f) => f.location === 'rack');
  }

  spotUsed(spot) {
    return this.racks.some((r) => r.slot === spot);
  }

  // ---------- Kaufen ----------

  // Grund, warum man gerade nicht kaufen kann, oder null. upperFloor: ob die zweite Etage steht
  // type: Karton, der in den Abstellraum muss (ohne type, z. B. Kabelrollen, zählt nur das Geld)
  buyProblem(price, upperFloor, type = null) {
    if (!upperFloor) return 'Erst die zweite Etage bauen (Ausbau)';
    if (type && !this.economy.roomForBox({ type })) return 'Abstellraum voll';
    if (!this.economy.canAfford(price)) return 'Zu wenig Geld';
    return null;
  }

  buyHardware(type) {
    return this.economy.buyFurniture(type);
  }

  buyCables() {
    if (!this.economy.spend(CABLE_ROLL.price)) return false;
    this.deliveries.push({ arriveIn: this.economy.deliverySeconds, meters: CABLE_ROLL.meters });
    this.economy.notify();
    return true;
  }

  // Läuft in echter Zeit: angekommene Kabelrollen in den Vorrat
  advance(seconds) {
    if (!this.deliveries.length) return;
    for (const d of this.deliveries) d.arriveIn -= seconds;
    const arrived = this.deliveries.filter((d) => d.arriveIn <= 0);
    if (!arrived.length) return;
    this.deliveries = this.deliveries.filter((d) => d.arriveIn > 0);
    const meters = arrived.reduce((sum, d) => sum + d.meters, 0);
    this.cableMeters = round1(this.cableMeters + meters);
    this.onEvent?.('cables-delivered', { meters });
    this.economy.notify();
  }

  get nextCableArrival() {
    return this.deliveries.length ? Math.max(0, Math.min(...this.deliveries.map((d) => d.arriveIn))) : null;
  }

  // ---------- Aufbauen ----------

  // Getragenen Schrank auf einen freien Stellplatz stellen
  placeRack(id, spot) {
    const rack = this.economy.furnitureById(id);
    if (rack?.type.kind !== 'rack' || spot < 0 || spot >= SERVER_SPOTS || this.spotUsed(spot)) return false;
    rack.location = 'server';
    rack.slot = spot;
    this.economy.notify();
    return true;
  }

  // Ob units Einheiten ab unit im Schrank frei sind (ignoreId: dieses Gerät zählt nicht, z. B. beim Verschieben)
  unitFits(rack, unit, units, ignoreId = null) {
    if (unit < 0 || unit + units > rack.type.units) return false;
    return !this.devicesIn(rack.id).some((d) => d.id !== ignoreId && d.unit < unit + units && unit < d.unit + d.type.units);
  }

  // Freie Höheneinheit für units Einheiten möglichst nah an wanted (ohne wanted: die oberste), oder -1
  freeUnit(rack, units, wanted = 0, ignoreId = null) {
    let best = -1;
    for (let u = 0; u + units <= rack.type.units; u++) {
      if (this.unitFits(rack, u, units, ignoreId) && (best === -1 || Math.abs(u - wanted) < Math.abs(best - wanted))) best = u;
    }
    return best;
  }

  // Freie Lücken im Schrank von oben nach unten: [{ unit, units }]
  freeGaps(rack) {
    const gaps = [];
    for (let u = 0; u < rack.type.units; u++) {
      if (!this.unitFits(rack, u, 1)) continue;
      const last = gaps[gaps.length - 1];
      if (last && last.unit + last.units === u) last.units++;
      else gaps.push({ unit: u, units: 1 });
    }
    return gaps;
  }

  // Grund, warum das Gerät nicht in den Schrank passt, oder null
  installProblem(device, rack) {
    if (!device || device.type.kind === 'rack') return 'Das ist kein Gerät für den Schrank';
    if (this.freeUnit(rack, device.type.units) === -1) return `Kein Platz – braucht ${device.type.units} HE`;
    return null;
  }

  // unit: gewünschte oberste Höheneinheit; ist dort kein Platz, kommt das Gerät an die nächste freie Stelle
  installDevice(deviceId, rackId, unit = 0) {
    const device = this.economy.furnitureById(deviceId);
    const rack = this.economy.furnitureById(rackId);
    if (!rack || this.installProblem(device, rack)) return false;
    device.location = 'rack';
    device.rackId = rack.id;
    device.unit = this.freeUnit(rack, device.type.units, unit);
    device.slot = null;
    this.economy.notify();
    return true;
  }

  // Eingebautes Gerät im selben Schrank an eine andere Höheneinheit setzen (Kabel bleiben gesteckt)
  // Die Kabel des Geräts werden dabei passend länger oder kürzer (Rest aus dem bzw. in den Vorrat).
  moveDevice(deviceId, unit) {
    const device = this.economy.furnitureById(deviceId);
    const rack = device?.location === 'rack' ? this.economy.furnitureById(device.rackId) : null;
    if (!rack || !this.unitFits(rack, unit, device.type.units, device.id)) return false;
    const mine = this.cables.filter((c) => c.a.id === device.id || c.b.id === device.id);
    const unitOf = (d) => (d === device ? unit : d.unit);
    const lengths = mine.map((c) => this.cableLength(c.a, c.b, c.clips, unitOf));
    const extra = lengths.reduce((sum, l) => sum + l, 0) - mine.reduce((sum, c) => sum + c.length, 0);
    if (extra > this.cableMeters) return false;
    mine.forEach((c, i) => { c.length = lengths[i]; });
    this.cableMeters = round1(this.cableMeters - extra);
    device.unit = unit;
    this.economy.notify();
    return true;
  }

  // Gerät ausbauen: Kabel kommen in den Vorrat zurück, das Gerät als Karton in den Abstellraum
  removeDevice(deviceId) {
    const device = this.economy.furnitureById(deviceId);
    if (device?.location !== 'rack') return false;
    this.unplugAll(device.id);
    delete device.rackId;
    delete device.unit;
    this.economy.returnFurnitureToStorage(device.id);
    return true;
  }

  // Leeren Schrank abbauen (zurück in den Abstellraum)
  removeRack(rackId) {
    const rack = this.economy.furnitureById(rackId);
    if (rack?.location !== 'server' || this.devicesIn(rack.id).length) return false;
    this.economy.returnFurnitureToStorage(rack.id);
    return true;
  }

  // ---------- Kabel ----------

  cableAt({ id, port }) {
    return this.cables.find((c) => (c.a.id === id && c.a.port === port) || (c.b.id === id && c.b.port === port)) ?? null;
  }

  // Clips der Kabelführung im Schrank (je Seite), Höhe eines Clips in HE von oben
  clipCount(rack) {
    return Math.ceil(rack.type.units / rack.type.clipEvery);
  }

  clipUnit(rack, index) {
    return index * rack.type.clipEvery + 0.5;
  }

  // Grund, warum der Clip nicht nutzbar ist, oder null
  clipProblem(rack, clip) {
    if (rack?.type.kind !== 'rack' || ![-1, 1].includes(clip.side)) return 'Kein Clip';
    if (!Number.isInteger(clip.index) || clip.index < 0 || clip.index >= this.clipCount(rack)) return 'Kein Clip';
    return null;
  }

  // Kabellänge in Metern zwischen zwei Ports im selben Schrank, auf 10 cm gerundet: Höhenweg über die Clips (ohne
  // Clips direkt), Spiel an den Steckern und der Umweg zur Kabelführung je angelaufener Seite.
  // unitOf(device) erlaubt, eine andere Höhe anzunehmen (beim Verschieben).
  cableLength(a, b, clips = [], unitOf = (d) => d.unit) {
    const da = this.economy.furnitureById(a.id);
    const db = this.economy.furnitureById(b.id);
    const rack = this.economy.furnitureById(da.rackId);
    const mid = (d) => unitOf(d) + d.type.units / 2;
    const heights = [mid(da), ...clips.map((c) => this.clipUnit(rack, c.index)), mid(db)];
    let units = 0;
    for (let i = 1; i < heights.length; i++) units += Math.abs(heights[i] - heights[i - 1]);
    const sides = clips.filter((c, i) => i === 0 || c.side !== clips[i - 1].side).length;
    return round1(Math.ceil((CABLE_SLACK + units * UNIT_METERS + sides * CLIP_DETOUR) * 10) / 10);
  }

  // Clips, durch die ein Kabel aus einem alten Spielstand läuft (vor der Clip-Auswahl): rechts, die zu den Ports
  // nächsten Clips
  defaultClips(a, b) {
    const da = this.economy.furnitureById(a.id);
    const db = this.economy.furnitureById(b.id);
    const rack = this.economy.furnitureById(da.rackId);
    const nearest = (d) => Math.min(this.clipCount(rack) - 1, Math.max(0, Math.round((d.unit + d.type.units / 2 - 0.5) / rack.type.clipEvery)));
    const indices = [...new Set([nearest(da), nearest(db)])];
    return indices.map((index) => ({ side: 1, index }));
  }

  // Grund, warum sich die beiden Ports (über die Clips) nicht verbinden lassen, oder null
  connectProblem(a, b, clips = []) {
    const da = this.economy.furnitureById(a.id);
    const db = this.economy.furnitureById(b.id);
    if (!da || !db || da.location !== 'rack' || db.location !== 'rack') return 'Gerät nicht eingebaut';
    if (da === db) return 'Ein Gerät kann man nicht mit sich selbst verbinden';
    if (da.rackId !== db.rackId) return 'Kabel reichen nur innerhalb eines Schranks';
    if (this.cableAt(a) || this.cableAt(b)) return 'Port ist schon belegt';
    const rack = this.economy.furnitureById(da.rackId);
    if (clips.some((c) => this.clipProblem(rack, c))) return 'Clip gehört nicht zu diesem Schrank';
    const length = this.cableLength(a, b, clips);
    if (this.cableMeters < length) return `Zu wenig Kabel – braucht ${meters(length)}, im Server-Shop nachkaufen`;
    return null;
  }

  connect(a, b, clips = []) {
    if (this.connectProblem(a, b, clips)) return false;
    const length = this.cableLength(a, b, clips);
    this.cables.push({ a: { ...a }, b: { ...b }, clips: clips.map((c) => ({ ...c })), length });
    this.cableMeters = round1(this.cableMeters - length);
    this.economy.notify();
    return true;
  }

  // Kabel an diesem Port abziehen (das Stück kommt in den Vorrat zurück)
  disconnect(ref) {
    const cable = this.cableAt(ref);
    if (!cable) return false;
    this.cables = this.cables.filter((c) => c !== cable);
    this.cableMeters = round1(this.cableMeters + cable.length);
    this.economy.notify();
    return true;
  }

  unplugAll(deviceId) {
    const mine = this.cables.filter((c) => c.a.id === deviceId || c.b.id === deviceId);
    this.cables = this.cables.filter((c) => !mine.includes(c));
    this.cableMeters = round1(this.cableMeters + mine.reduce((sum, c) => sum + c.length, 0));
  }

  // Gegenstelle eines Ports: { device, port } oder null
  peer(ref) {
    const cable = this.cableAt(ref);
    if (!cable) return null;
    const other = cable.a.id === ref.id && cable.a.port === ref.port ? cable.b : cable.a;
    return { device: this.economy.furnitureById(other.id), port: other.port };
  }

  peerLabel(ref) {
    const p = this.peer(ref);
    return p?.device ? `${p.device.type.name} · ${portName(p.device.type, p.port)}` : null;
  }

  // ---------- Online? ----------

  // Alle Geräte, die übers Netz ans Internet kommen: vom Patchpanel über den WAN-Port der Firewall, aus deren
  // LAN-Ports weiter über Switches bis zu den Servern. Gibt die Menge der erreichten Geräte-IDs zurück.
  reachable() {
    const reached = new Set();
    const queue = [];
    const neighbors = (device, ports) => ports.map((port) => this.peer({ id: device.id, port })).filter((p) => p?.device);
    for (const device of this.installed.filter((d) => d.type.kind === 'firewall')) {
      // WAN muss an einem Patchpanel hängen
      if (this.deviceProblem(device) || this.peer({ id: device.id, port: 0 })?.device?.type.kind !== 'patch') continue;
      reached.add(device.id);
      const lan = Array.from({ length: device.type.ports - 1 }, (_, i) => i + 1);
      queue.push(...neighbors(device, lan).map((p) => p.device));
    }
    while (queue.length) {
      const device = queue.shift();
      if (reached.has(device.id)) continue;
      // Nur Switches leiten weiter; Server sind Endgeräte, Patchpanel und Firewall auf LAN-Seite nicht
      if (device.type.kind !== 'server' && device.type.kind !== 'switch') continue;
      if (this.deviceProblem(device)) continue; // defekt oder eingefroren: arbeitet nicht und leitet nicht weiter
      reached.add(device.id);
      if (device.type.kind === 'switch') {
        const all = Array.from({ length: device.type.ports }, (_, i) => i);
        queue.push(...neighbors(device, all).map((p) => p.device));
      }
    }
    return reached;
  }

  isOnline(device, reached = this.reachable()) {
    return device.type.kind === 'server' && reached.has(device.id);
  }

  // Warum ein Server offline ist (für das Schrankfenster), oder null
  offlineReason(device, reached = this.reachable()) {
    if (device.type.kind !== 'server' || reached.has(device.id)) return null;
    const problem = this.deviceProblem(device);
    if (problem) return problem;
    const ports = Array.from({ length: device.type.ports }, (_, i) => i);
    if (!ports.some((port) => this.cableAt({ id: device.id, port }))) return 'kein Kabel';
    const firewalls = this.devicesIn(device.rackId).filter((d) => d.type.kind === 'firewall');
    if (!firewalls.length) return 'keine Firewall im Schrank';
    if (!firewalls.some((f) => this.peer({ id: f.id, port: 0 })?.device?.type.kind === 'patch')) return 'Firewall-WAN nicht am Patchpanel';
    const down = this.devicesIn(device.rackId).find((d) => d.type.kind !== 'server' && this.deviceProblem(d));
    if (down) return `${down.type.name} ${this.deviceProblem(down)}`;
    return 'keine Verbindung zum LAN der Firewall';
  }

  get onlineServers() {
    const reached = this.reachable();
    return this.installed.filter((d) => this.isOnline(d, reached));
  }

  get incomePerHour() {
    return this.onlineServers.reduce((sum, d) => sum + d.type.income, 0);
  }

  get powerPerHour() {
    return this.installed.reduce((sum, d) => sum + d.type.power, 0);
  }

  // Zu jeder vollen Spielstunde: Einnahmen der Online-Server gutschreiben (Strom läuft über die Stromrechnung)
  payHour() {
    const income = this.incomePerHour;
    if (income <= 0) return;
    this.economy.earn(income);
    this.onEvent?.('income', { amount: income, servers: this.onlineServers.length });
  }

  // ---------- Speichern ----------

  toJSON() {
    return {
      cables: this.cables.map((c) => ({ a: { ...c.a }, b: { ...c.b }, clips: c.clips.map((k) => ({ ...k })), length: c.length })),
      cableMeters: this.cableMeters,
      deliveries: this.deliveries.map((d) => ({ ...d })),
    };
  }

  load(data) {
    this.cables = data?.cables ?? [];
    this.cableMeters = data?.cableMeters ?? 0;
    this.deliveries = data?.deliveries ?? [];
    // Kabel zu Geräten, die nicht (mehr) eingebaut sind oder den Port nicht (mehr) haben, zurück in den Vorrat
    const ok = (ref) => {
      const device = this.economy.furnitureById(ref.id);
      return device?.location === 'rack' && ref.port < device.type.ports;
    };
    const broken = this.cables.filter((c) => !ok(c.a) || !ok(c.b));
    this.cables = this.cables.filter((c) => !broken.includes(c));
    for (const c of this.cables) {
      c.clips ??= this.defaultClips(c.a, c.b);
      c.length ??= this.cableLength(c.a, c.b, c.clips);
    }
    this.cableMeters = round1(this.cableMeters + broken.reduce((sum, c) => sum + (c.length ?? 1), 0));
  }
}
