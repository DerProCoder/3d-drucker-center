// Serverraum in der zweiten Etage: Serverschränke aufstellen, Geräte einbauen, Kabel stecken und mit Servern Geld
// verdienen. Schränke und Geräte sind Einrichtung aus economy.furniture (Karton, Lieferung, Abstellraum, Tragen wie
// bei Regalen) mit eigenen Orten:
//   Schrank: location 'server', slot = Stellplatz (core/server-zones.js: 0–15 Kunden, 16–23 privat, 24–27 Automatik,
//            ab 28 Daten-Bunker im Keller – Miete dort ×1,5, eigenes Kabelgitter und eigener Glasfaser-Anschluss)
//   Gerät:   location 'rack', rackId, unit = oberste belegte Höheneinheit (0 = ganz oben im Schrank). Die Höhe
//            wählt man beim Einbauen durch Zielen und kann sie im Schrankfenster ändern.
// Ein Server ist online, wenn er über Kabel am LAN der Firewall hängt (direkt oder über Switches) und der WAN-Port
// der Firewall Internet hat: direkt am Internet-Anschluss an der Wand ({ id: 'wan', port }, core/cable-tray.js) oder an
// einem Patchpanel, das selbst eine Leitung zum Wandanschluss hat. Gesteckt wird hinten am Schrank Port für Port
// (world/server-room.js). Im selben Schrank läuft ein Kabel über die Clips der Kabelführung; zwischen zwei Schränken
// bzw. zum Wandanschluss nur über das Kabelgitter unter der Decke (Wegpunkte `tray`). Kabel kommt als Rolle in Metern,
// jede Verbindung verbraucht ihre Länge, Abziehen gibt das Stück zurück in den Vorrat.
// Geld bringen Server nur über vermietete VMs (core/server-rentals.js, Miete zu jeder vollen Spielstunde, solange
// der Server online ist); Strom kosten alle eingebauten Geräte
// (economy.extraPowerPerHour, läuft mit der normalen Stromrechnung; Server nach ihren Cores, core/server-parts.js).
// Ein Server, dem ein Pflichtteil fehlt (core/server-parts.js), ist „unvollständig“ und offline. Ohne Three.js und DOM.
import { CABLE_ROLL, SERVER_CORES, SERVER_RAM, UNIT_METERS, isServerHardware, portName } from './server-catalog.js';
import { meters } from './format.js';
import {
  ALL_SPOTS, BUNKER_RENT_FACTOR, bunkerFieldOf, bunkerWanField, isAutomationRack, isBunkerRack, isPrivateRack,
  setBunkerLayout, setBunkerWanField, spotUsable,
} from './server-zones.js';
import {
  BASEMENT_TRAY_NX, BASEMENT_TRAY_NZ, BASEMENT_WALL_PORTS, BASEMENT_WAN_PORT0, CABLE_SLACK, WALL_PORTS, WAN_ID, basementAutoRoute,
  basementCellOf, basementWan, endField,
  isBasementWanPort, isWanPort, isWanRef, rackEnd, sanitizeTray, trayCableLength, trayPath, trayProblem, trayToJSON,
  validWanRef, wanEnd, wanPortName,
} from './cable-tray.js';
import { GRID } from './basement-layout.js';

// Stellplätze und Zonen (Kunden, privat, Automatik, Daten-Bunker) stehen in core/server-zones.js
export {
  ALL_SPOTS, BUNKER_RENT_FACTOR, SERVER_SPOTS, isAutomationRack, isBunkerRack, isPrivateRack, spotArea, spotDistance,
  spotLabel, spotPosition, spotUsable, spotZone,
} from './server-zones.js';
const CLIP_DETOUR = 0.25;       // m je Seite der Kabelführung, die das Kabel anläuft (hin und zurück)
const round1 = (m) => Math.round(m * 10) / 10;

export class Servers {
  constructor(economy) {
    this.economy = economy;
    // { a: { id, port }, b: { id, port }, clips: [{ side, index }], tray: [Feld-Indizes], length (m) } – id: Gerät aus
    // economy.furniture oder 'wan' (Internet-Anschluss an der Wand, port 0 … WALL_PORTS − 1),
    // clips: Clips der Kabelführung, durch die das Kabel läuft (side −1/1 = −x/+x, von hinten gesehen rechts/links; index 0 = oben; leer = frei)
    // tray: angeklickte Gitterfelder in Klick-Reihenfolge (nur bei Kabeln zwischen Schränken bzw. zum Wandanschluss, sonst leer)
    this.cables = [];
    this.cableMeters = 0;   // Kabel im Vorrat in Metern
    this.deliveries = [];   // Kabelrollen unterwegs: { arriveIn (Sekunden), meters }
    this.onEvent = null;    // (type, data) => void – z. B. 'cables-delivered'
    // Alter Spielstand (vor dem Wandanschluss): Hinweis „Internet nur über den Wandanschluss“ einmal zeigen (main.js)
    this.wanNotice = false;
    // Warum ein Gerät nicht arbeitet (defekt, eingefroren – core/server-climate.js setzt das), oder null
    this.deviceProblem = () => null;
    // Miete pro Spielstunde der VMs auf einem Server (core/server-rentals.js setzt das; ohne Mieter bringt er nichts)
    this.rentOf = () => 0;
    // Belegung eines Servers durch VMs { cores, ram } (core/server-rentals.js setzt das)
    this.usageOf = () => ({ cores: 0, ram: 0 });
    // Bauteile (core/server-parts.js setzt das): Platz für VMs { cores, ram } aus den eingebauten Teilen, Strom pro
    // Spielstunde (Server nach Cores) und warum ein Server wegen seiner Teile nicht läuft (z. B. „unvollständig –
    // Netzteil fehlt“) oder null. Ohne Teile-System: Werte aus dem Katalog.
    this.capacityOf = (device) => ({ cores: device.type.cores ?? SERVER_CORES, ram: device.type.ram ?? SERVER_RAM });
    this.powerOf = (device) => device.type.power;
    this.buildProblem = () => null;
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

  // Schrank, in dem ein Gerät eingebaut ist, oder null
  rackOf(device) {
    return device?.location === 'rack' ? this.economy.furnitureById(device.rackId) ?? null : null;
  }

  // Ob das Gerät in einem privaten Schrank steckt (Reihe „Private Server“ oder Automatik-Reihe) – nicht vermietbar
  isPrivateDevice(device) {
    return isPrivateRack(this.rackOf(device));
  }

  // Ob das Gerät in einem Schrank auf einem Automatik-Platz steckt
  isAutomationDevice(device) {
    return isAutomationRack(this.rackOf(device));
  }

  // Ob das Gerät in einem Schrank im Daten-Bunker steckt (Keller, #52)
  isBunkerDevice(device) {
    return isBunkerRack(this.rackOf(device));
  }

  // Miet-Aufschlag für VMs und Speicher auf diesem Gerät: im Daten-Bunker BUNKER_RENT_FACTOR (×1,5), sonst 1 – wirkt
  // zusätzlich zum Mietfaktor des Modells (core/server-rentals.js, core/storage-rentals.js)
  rentBonus(device) {
    return this.isBunkerDevice(device) ? BUNKER_RENT_FACTOR : 1;
  }

  // ---------- Daten-Bunker im Keller (#52) ----------

  // Kellerfelder anbinden (core/basement-layout.js, upgrades.basementLayout): Bunker-Plätze und Keller-Gitter kennen
  // dann die Feldarten, und ein Bunker-Feld lässt sich nur umstellen, wenn dort nichts mehr steht oder läuft
  attachBasement(layout) {
    setBunkerLayout(layout);
    this.detachBasement?.();
    this.detachBasement = layout.addFieldCheck((i, from, to) => (from === 'bunker' && to !== 'bunker' ? this.bunkerFieldProblem(i) : null));
  }

  // Grund, warum Bunker-Feld i nicht umgestellt werden kann, oder null: Schränke im Feld, Kabel am Keller-Anschluss,
  // wenn er in diesem Feld steht, oder Kabel im Gitter des Feldes (auch am Rand der Nachbarn, der mit dem Umstellen
  // wegfiele)
  bunkerFieldProblem(i) {
    const racks = this.racks.filter((r) => bunkerFieldOf(r.slot) === i).length;
    if (racks) return racks === 1 ? 'Im Feld steht noch ein Serverschrank' : `Im Feld stehen noch ${racks} Serverschränke`;
    const atWan = (ref) => isWanRef(ref) && isBasementWanPort(ref.port);
    if (basementWan()?.field === i && this.cables.some((c) => atWan(c.a) || atWan(c.b))) {
      return 'Am Glasfaser-Anschluss im Feld stecken noch Kabel';
    }
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    const lastX = BASEMENT_TRAY_NX - 1; // letzte Trassenspalte bzw. -zeile eines Kellerfeldes
    const lastZ = BASEMENT_TRAY_NZ - 1;
    const touches = (f) => {
      const c = basementCellOf(f);
      if (!c) return false;
      if (c.area === i) return true;
      return (row > 0 && c.area === i - GRID && c.lz === lastZ) || (row < GRID - 1 && c.area === i + GRID && c.lz === 0)
        || (col > 0 && c.area === i - 1 && c.lx === lastX) || (col < GRID - 1 && c.area === i + 1 && c.lx === 0);
    };
    const through = this.cables.filter((c) => this.trayRoute(c)?.fields.some(touches)).length;
    if (through) return through === 1 ? 'Durch das Feld läuft noch ein Kabel im Kabelgitter' : `Durch das Feld laufen noch ${through} Kabel im Kabelgitter`;
    return null;
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
    if (rack?.type.kind !== 'rack' || !Number.isInteger(spot) || spot < 0 || spot >= ALL_SPOTS) return false;
    // Bunker-Plätze nur in ausgebauten Daten-Bunker-Feldern (core/server-zones.js)
    if (!spotUsable(spot) || this.spotUsed(spot)) return false;
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
    const lengths = mine.map((c) => this.cableLength(c.a, c.b, c.clips, c.tray, unitOf) ?? c.length);
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

  // Leeren Schrank abbauen (zurück in den Abstellraum). Kabel hängen nur an Geräten – die sind beim Ausbauen schon
  // abgezogen worden (removeDevice → unplugAll, auch Gitterkabel zu anderen Schränken und zum Wandanschluss).
  removeRack(rackId) {
    const rack = this.economy.furnitureById(rackId);
    if (rack?.location !== 'server' || this.devicesIn(rack.id).length) return false;
    this.economy.returnFurnitureToStorage(rack.id);
    return true;
  }

  // ---------- Kabel ----------

  // Kabel an einem Port (Gerät oder Wandanschluss { id: 'wan', port }) oder null
  cableAt({ id, port }) {
    return this.cables.find((c) => (c.a.id === id && c.a.port === port) || (c.b.id === id && c.b.port === port)) ?? null;
  }

  // Ports am Internet-Anschluss an der Wand für die Anzeige am Wandkasten: [{ port, name: 'WAN n', cable | null }]
  wanPorts() {
    return Array.from({ length: WALL_PORTS }, (_, port) => ({ port, name: wanPortName(port), cable: this.cableAt({ id: WAN_ID, port }) }));
  }

  // Ebenso am Glasfaser-Anschluss im Keller (leer, solange es kein Bunker-Feld gibt)
  basementWanPorts() {
    if (!basementWan()) return [];
    return Array.from({ length: BASEMENT_WALL_PORTS }, (_, k) => {
      const port = BASEMENT_WAN_PORT0 + k;
      return { port, name: wanPortName(port), cable: this.cableAt({ id: WAN_ID, port }) };
    });
  }

  // Ob ein Kabel zwischen a und b über das Kabelgitter läuft: ein Ende am Wandanschluss oder Geräte in verschiedenen
  // Schränken (im selben Schrank geht es über die Clips)
  isTrayCable(a, b) {
    if (isWanRef(a) || isWanRef(b)) return true;
    const da = this.economy.furnitureById(a.id);
    const db = this.economy.furnitureById(b.id);
    return !!da && !!db && da.rackId !== db.rackId;
  }

  // Ende für core/cable-tray.js: Wandanschluss-Port oder Gerät mit Stellplatz und Höhe im Schrank, oder null
  // (Gerät nicht eingebaut). unitOf wie bei cableLength.
  trayEnd(ref, unitOf = (d) => d.unit) {
    if (isWanRef(ref)) return wanEnd(ref.port);
    const device = this.economy.furnitureById(ref.id);
    const rack = this.rackOf(device);
    return rack ? rackEnd(rack.slot, rack.type.units, unitOf(device), device.type.units) : null;
  }

  // Weg eines Gitterkabels durch die Felder (für das Zeichnen): { fields, steps } – oder null bei Kabeln im selben
  // Schrank bzw. wenn der Weg nicht (mehr) geht
  trayRoute(cable) {
    if (!cable || !this.isTrayCable(cable.a, cable.b)) return null;
    const ea = this.trayEnd(cable.a);
    const eb = this.trayEnd(cable.b);
    if (!ea || !eb) return null;
    const path = trayPath(endField(ea), cable.tray ?? [], endField(eb));
    return path.fields ? { fields: path.fields, steps: path.steps } : null;
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

  // Kabellänge in Metern, auf 10 cm gerundet. Im selben Schrank: Höhenweg über die Clips (ohne Clips direkt), Spiel an
  // den Steckern und der Umweg zur Kabelführung je angelaufener Seite. Zwischen Schränken bzw. zum Wandanschluss: Weg
  // über das Kabelgitter mit den Wegpunkten tray (core/cable-tray.js trayCableLength) – null, wenn der Weg nicht geht.
  // unitOf(device) erlaubt, eine andere Höhe anzunehmen (beim Verschieben).
  cableLength(a, b, clips = [], tray = [], unitOf = (d) => d.unit) {
    if (this.isTrayCable(a, b)) {
      const ea = this.trayEnd(a, unitOf);
      const eb = this.trayEnd(b, unitOf);
      return ea && eb ? trayCableLength(ea, eb, tray) : null;
    }
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

  // Grund, warum sich die beiden Ports nicht verbinden lassen, oder null. Im selben Schrank über die Clips (tray
  // zählt dort nicht), zwischen Schränken bzw. zum Wandanschluss { id: 'wan', port } über die Gitterfelder tray
  // (Wegpunkte in Klick-Reihenfolge, clips zählen dort nicht).
  connectProblem(a, b, clips = [], tray = []) {
    if (isWanRef(a) && isWanRef(b)) return 'Internet-Anschluss kann man nicht mit sich selbst verbinden';
    for (const ref of [a, b]) {
      if (isWanRef(ref)) {
        if (!isWanPort(ref.port)) return 'Kein Port am Internet-Anschluss';
      } else if (this.economy.furnitureById(ref.id)?.location !== 'rack') {
        return 'Gerät nicht eingebaut';
      }
    }
    if (a.id === b.id) return 'Ein Gerät kann man nicht mit sich selbst verbinden';
    if (this.cableAt(a) || this.cableAt(b)) return 'Port ist schon belegt';
    if (this.isTrayCable(a, b)) {
      const problem = trayProblem(this.trayEnd(a), this.trayEnd(b), tray);
      if (problem) return problem;
    } else {
      const rack = this.rackOf(this.economy.furnitureById(a.id));
      if (clips.some((c) => this.clipProblem(rack, c))) return 'Clip gehört nicht zu diesem Schrank';
    }
    const length = this.cableLength(a, b, clips, tray);
    if (this.cableMeters < length) return `Zu wenig Kabel – braucht ${meters(length)}, im Server-Shop nachkaufen`;
    return null;
  }

  connect(a, b, clips = [], tray = []) {
    if (this.connectProblem(a, b, clips, tray)) return false;
    const length = this.cableLength(a, b, clips, tray);
    const viaTray = this.isTrayCable(a, b);
    this.cables.push({
      a: { ...a }, b: { ...b },
      clips: viaTray ? [] : clips.map((c) => ({ ...c })),
      tray: viaTray ? sanitizeTray(tray) : [],
      length,
    });
    this.cableMeters = round1(this.cableMeters - length);
    this.economy.notify();
    return true;
  }

  // Kabel an diesem Port abziehen (das Stück kommt in den Vorrat zurück) – auch am Wandanschluss { id: 'wan', port }
  disconnect(ref) {
    const cable = this.cableAt(ref);
    if (!cable) return false;
    this.cables = this.cables.filter((c) => c !== cable);
    this.cableMeters = round1(this.cableMeters + cable.length);
    this.economy.notify();
    return true;
  }

  // Alle Kabel eines Geräts abziehen, auch Gitterkabel zu anderen Schränken und zum Wandanschluss
  unplugAll(deviceId) {
    const mine = this.cables.filter((c) => c.a.id === deviceId || c.b.id === deviceId);
    this.cables = this.cables.filter((c) => !mine.includes(c));
    this.cableMeters = round1(this.cableMeters + mine.reduce((sum, c) => sum + c.length, 0));
  }

  // Gegenstelle eines Ports (ref auch am Wandanschluss): { device, port } bzw. am Wandanschluss
  // { device: null, wan: true, port } – oder null
  peer(ref) {
    const cable = this.cableAt(ref);
    if (!cable) return null;
    const other = cable.a.id === ref.id && cable.a.port === ref.port ? cable.b : cable.a;
    if (isWanRef(other)) return { device: null, wan: true, port: other.port };
    return { device: this.economy.furnitureById(other.id), port: other.port };
  }

  // Gegenstelle als Text: „Switch 8 Ports · Port 3“, „Firewall 4 Ports · WAN“, „Internet-Anschluss · WAN 1“
  peerLabel(ref) {
    const p = this.peer(ref);
    if (p?.wan) return `Internet-Anschluss · ${wanPortName(p.port)}`;
    if (!p?.device) return null;
    const name = portName(p.device.type, p.port);
    return `${p.device.type.name} · ${/^\d+$/.test(name) ? `Port ${name}` : name}`;
  }

  // ---------- Online? ----------

  // Patchpanels mit Internet: mindestens ein Port per Kabel am Wandanschluss – oder an einem anderen Patchpanel mit
  // Internet (leitet passiv weiter). Alle Ports eines solchen Panels gelten als Internet. Menge der Geräte-IDs.
  internetPatches() {
    const ports = (d) => Array.from({ length: d.type.ports }, (_, i) => i);
    const patches = this.installed.filter((d) => d.type.kind === 'patch');
    const online = new Set(patches.filter((d) => ports(d).some((port) => this.peer({ id: d.id, port })?.wan)).map((d) => d.id));
    const queue = patches.filter((d) => online.has(d.id));
    while (queue.length) {
      const panel = queue.shift();
      for (const port of ports(panel)) {
        const next = this.peer({ id: panel.id, port })?.device;
        if (next?.type.kind === 'patch' && !online.has(next.id)) {
          online.add(next.id);
          queue.push(next);
        }
      }
    }
    return online;
  }

  // Ob die Firewall über ihren WAN-Port (Port 0) Internet hat: direkt am Wandanschluss oder an einem Patchpanel mit
  // Internet. patches: aus internetPatches() (spart Rechnen)
  firewallHasInternet(firewall, patches = this.internetPatches()) {
    const wan = this.peer({ id: firewall.id, port: 0 });
    return !!wan?.wan || (wan?.device?.type.kind === 'patch' && patches.has(wan.device.id));
  }

  // Alle Geräte, die übers Netz ans Internet kommen: vom Wandanschluss (direkt oder über Patchpanels) über den
  // WAN-Port der Firewall, aus deren LAN-Ports weiter über Switches bis zu den Servern. Gibt die Menge der erreichten
  // Geräte-IDs zurück (Patchpanels mit Internet gehören dazu).
  reachable() {
    const patches = this.internetPatches();
    const reached = new Set(patches);
    const queue = [];
    const neighbors = (device, ports) => ports.map((port) => this.peer({ id: device.id, port })).filter((p) => p?.device);
    for (const device of this.installed.filter((d) => d.type.kind === 'firewall')) {
      // WAN muss Internet haben (Wandanschluss direkt oder Patchpanel mit Leitung zur Wand)
      if (this.deviceProblem(device) || !this.firewallHasInternet(device, patches)) continue;
      reached.add(device.id);
      const lan = Array.from({ length: device.type.ports - 1 }, (_, i) => i + 1);
      queue.push(...neighbors(device, lan).map((p) => p.device));
    }
    while (queue.length) {
      const device = queue.shift();
      if (reached.has(device.id)) continue;
      // Nur Switches leiten weiter; Server sind Endgeräte, Patchpanel und Firewall auf LAN-Seite nicht
      if (device.type.kind !== 'server' && device.type.kind !== 'switch') continue;
      if (this.workProblem(device)) continue; // defekt, eingefroren oder unvollständig: arbeitet nicht und leitet nicht weiter
      reached.add(device.id);
      if (device.type.kind === 'switch') {
        const all = Array.from({ length: device.type.ports }, (_, i) => i);
        queue.push(...neighbors(device, all).map((p) => p.device));
      }
    }
    return reached;
  }

  // Warum ein Gerät gerade nicht arbeitet, oder null: defekt bzw. eingefroren (core/server-climate.js), sonst wegen
  // seiner Bauteile, z. B. „unvollständig – Netzteil fehlt“ (core/server-parts.js)
  workProblem(device) {
    return this.deviceProblem(device) ?? this.buildProblem(device);
  }

  isOnline(device, reached = this.reachable()) {
    return device.type.kind === 'server' && reached.has(device.id);
  }

  // Warum ein Server offline ist (für das Schrankfenster), oder null
  offlineReason(device, reached = this.reachable()) {
    if (device.type.kind !== 'server' || reached.has(device.id)) return null;
    const problem = this.workProblem(device);
    if (problem) return problem;
    const ports = Array.from({ length: device.type.ports }, (_, i) => i);
    if (!ports.some((port) => this.cableAt({ id: device.id, port }))) return 'kein Kabel';
    // Netz des Servers ablaufen wie in reachable(), aber auch durch Switches, die nicht arbeiten: welche Firewalls
    // hängen mit einem LAN-Port daran, welche Switches unterwegs sind defekt oder eingefroren?
    const firewalls = [];
    const down = [];
    const seen = new Set([device.id]);
    const queue = [device];
    while (queue.length) {
      const d = queue.shift();
      for (let port = 0; port < d.type.ports; port++) {
        const p = this.peer({ id: d.id, port });
        if (!p?.device || seen.has(p.device.id)) continue;
        seen.add(p.device.id);
        if (p.device.type.kind === 'firewall' && p.port !== 0) firewalls.push(p.device);
        if (p.device.type.kind !== 'switch') continue;
        if (this.deviceProblem(p.device)) down.push(p.device);
        queue.push(p.device);
      }
    }
    const downText = (d) => `${d.type.name} ${this.deviceProblem(d)}`;
    if (!firewalls.length) {
      if (down.length) return downText(down[0]);
      const inRack = this.devicesIn(device.rackId).some((d) => d.type.kind === 'firewall');
      return inRack ? 'keine Verbindung zum LAN der Firewall' : 'keine Firewall im Schrank';
    }
    const working = firewalls.filter((f) => !this.deviceProblem(f));
    if (!working.length) return downText(firewalls[0]);
    const patches = this.internetPatches();
    if (!working.some((f) => this.firewallHasInternet(f, patches))) {
      const onPatch = working.some((f) => this.peer({ id: f.id, port: 0 })?.device?.type.kind === 'patch');
      return onPatch ? 'Patchpanel nicht mit dem Internet-Anschluss verbunden' : 'keine Leitung zum Internet-Anschluss';
    }
    if (down.length) return downText(down[0]);
    return 'keine Verbindung zum LAN der Firewall';
  }

  get onlineServers() {
    const reached = this.reachable();
    return this.installed.filter((d) => this.isOnline(d, reached));
  }

  // Miete pro Spielstunde, die die Online-Server gerade bringen (nur vermietete VMs zahlen, core/server-rentals.js)
  get incomePerHour() {
    return this.onlineServers.reduce((sum, d) => sum + this.rentOf(d), 0);
  }

  get powerPerHour() {
    return this.installed.reduce((sum, d) => sum + this.powerOf(d), 0);
  }

  // ---------- Speichern ----------

  toJSON() {
    return {
      cables: this.cables.map((c) => ({
        a: { ...c.a }, b: { ...c.b }, clips: c.clips.map((k) => ({ ...k })), tray: trayToJSON(c.tray), length: c.length,
      })),
      cableMeters: this.cableMeters,
      deliveries: this.deliveries.map((d) => ({ ...d })),
      // Einmalige Nachricht zum Wandanschluss (alte Stände, core/save.js Version 14) noch nicht gezeigt
      wanNotice: this.wanNotice || undefined,
      // Kellerfeld mit dem Glasfaser-Anschluss des Bunkers (#52; fehlt → erstes Bunker-Feld)
      basementWanField: bunkerWanField() ?? undefined,
    };
  }

  // Kabel im Bunker aus einem Spielstand vor den Trassen (#60, core/save.js Version 26 setzt reroute): Die alten
  // Wegpunkte im 1-m-Gitter passen nicht mehr, das Kabel wird über den kürzesten Trassenweg neu verlegt. Die neue
  // Länge wird mit dem Vorrat verrechnet; reicht der Vorrat dafür nicht oder gibt es keinen Weg, gibt load das Kabel
  // ganz in den Vorrat zurück (false) – es geht also kein Meter verloren.
  reroute(c) {
    const ea = this.trayEnd(c.a);
    const eb = this.trayEnd(c.b);
    if (!ea || !eb) return false;
    const tray = basementAutoRoute(endField(ea), endField(eb));
    if (!tray || trayProblem(ea, eb, tray)) return false;
    const length = trayCableLength(ea, eb, tray);
    const extra = round1(length - (c.length ?? 0));
    if (extra > this.cableMeters) return false;
    this.cableMeters = round1(this.cableMeters - extra);
    c.tray = tray;
    c.length = length;
    return true;
  }

  load(data) {
    this.cables = data?.cables ?? [];
    this.cableMeters = data?.cableMeters ?? 0;
    this.deliveries = data?.deliveries ?? [];
    this.wanNotice = !!data?.wanNotice;
    // Vor dem Prüfen der Kabel: wo der Keller-Anschluss steht (die Kellerfelder lädt core/save.js vorher)
    setBunkerWanField(data?.basementWanField ?? null);
    // Kabel zu Geräten, die nicht (mehr) eingebaut sind oder den Port nicht (mehr) haben, und Gitterkabel, deren Weg
    // nicht (mehr) geht, zurück in den Vorrat
    const ok = (ref) => {
      if (isWanRef(ref)) return validWanRef(ref);
      const device = this.economy.furnitureById(ref?.id);
      return device?.location === 'rack' && ref.port < device.type.ports;
    };
    const routeOk = (c) => {
      if (!this.isTrayCable(c.a, c.b)) return true;
      if (c.reroute) return this.reroute(c);
      c.tray = sanitizeTray(c.tray);
      return !trayProblem(this.trayEnd(c.a), this.trayEnd(c.b), c.tray);
    };
    const broken = this.cables.filter((c) => !ok(c.a) || !ok(c.b) || !routeOk(c));
    for (const c of this.cables) delete c.reroute;
    this.cables = this.cables.filter((c) => !broken.includes(c));
    for (const c of this.cables) {
      if (this.isTrayCable(c.a, c.b)) {
        c.clips = [];
      } else {
        c.tray = [];
        c.clips ??= this.defaultClips(c.a, c.b);
      }
      c.length ??= this.cableLength(c.a, c.b, c.clips, c.tray);
    }
    this.cableMeters = round1(this.cableMeters + broken.reduce((sum, c) => sum + (c.length ?? 1), 0));
  }
}
