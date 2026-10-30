// Speicher-Vermietung (#47): Kunden mieten Speicherplatz auf den NAS (core/nas.js, z. B. „2 TB für Backups“). Läuft
// wie die VM-Vermietung (core/server-rentals.js): Kunde am Empfang, Annahme am PC (App „Server-Vermietung“) oder
// automatisch durch die privaten Server (core/rental-automation.js), Vertrag über mehrere Spieltage, Miete zu jeder
// vollen Spielstunde. VMs dürfen weiterhin auch auf die NAS (Cores und RAM) – Speicher und VMs belegen getrennt.
//
// Speicher-Anfragen kommen neben den VM-Anfragen mit eigenem Takt, sodass sie ca. STORAGE_SHARE aller Anfragen
// ausmachen – aber nur, wenn die zweite Etage steht und eine NAS außerhalb des privaten Bereichs eingebaut ist. Am
// Empfang warten VM- und Speicher-Kunden zusammen höchstens maxWaiting (rentals.maxWaiting zählt die Speicher-Anfragen
// mit, siehe Konstruktor). Eine Anfrage passt nur auf eine NAS, die online ist, nicht privat steht und genug freien
// Speicher hat (Summe der Platten minus vermieteter Speicher).
// Miete pro Spielstunde = RENT_PER_GB_STORAGE × GB × Mietfaktor der NAS, nur solange die NAS die Daten bereitstellt
// (rentals.serves: online, nicht privat). Ist sie zu lange am Stück offline (CANCEL_AFTER_OFFLINE, auch ausgebaut,
// defekt oder „zu klein“), kündigt der Kunde – wie bei VMs.
// Vermieteter Speicher sperrt das Herausnehmen von Platten: nas.rentedStorageOf liefert ihn (Konstruktor), core/nas.js
// lehnt dann mit „Belegt: 3,5 TB vermietet“ ab. Zeiten in Spielminuten (Delta-Zeit). Ohne Three.js und DOM.
//
// Defekte Festplatte (#49): Die NAS bleibt online, ihr Speicher zählt nur die heilen Platten. Passen die Daten aller
// Verträge nicht mehr darauf, laufen die gerade laufenden Verträge (ältere zuerst) weiter, solange sie in den heilen
// Speicher passen; danach kommen offline Verträge (ältere zuerst) zurück, sobald Platz frei ist (strandedOn, Kennzeichen
// stranded je Vertrag – so geht kein laufender Vertrag offline, nur weil ein älterer zurückkommt). Offline Verträge
// zahlen keine Miete und kündigen nach CANCEL_AFTER_OFFLINE am Stück; alle anderen laufen normal weiter.
//
// Anfrage: { id ('S1' …, getrennt von den VM-Nummern), kind: 'storage', customer, note, storage (GB), duration
//            (Spielminuten Vertragslaufzeit), waitLeft (Spielminuten am Empfang), atCounter (am Empfang angekommen,
//            wird nicht gespeichert) }
// Vertrag:  { id, kind: 'storage', customer, note, storage, serverId (NAS), duration, minutesLeft, offlineFor, auto,
//            stranded (offline, weil die Daten nach einem Plattendefekt nicht auf die heilen Platten passen, #49) }
import { CANCEL_AFTER_OFFLINE, CONTRACT_HOURS, NEW_REQUEST_EVERY, REQUEST_PATIENCE } from './server-rentals.js';
import { isNas, storageText } from './nas.js';

export const STORAGE_SHARE = 0.3;          // Anteil der Speicher-Anfragen an allen Server-Anfragen (ca. 30 %)
// Takt der Speicher-Anfragen: neben einer VM-Anfrage je NEW_REQUEST_EVERY ergibt das den Anteil STORAGE_SHARE
export const STORAGE_REQUEST_EVERY = NEW_REQUEST_EVERY * (1 - STORAGE_SHARE) / STORAGE_SHARE; // 140 Spielminuten
const REQUEST_JITTER = 0.3;                // ± 30 % Zufall wie bei den VMs
export const RENT_PER_GB_STORAGE = 0.002;  // € je GB Speicher und Spielstunde (2 TB ≈ 4,10 €/h), mal Mietfaktor
// Größen: meist klein – 64 GB bis 512 GB zusammen ca. 70 %, 1–2 TB ca. 25 %, 4 TB ca. 5 % (gleich verteilt je Gruppe)
export const STORAGE_SIZES = [
  { gb: 64, share: 0.175 },
  { gb: 128, share: 0.175 },
  { gb: 256, share: 0.175 },
  { gb: 512, share: 0.175 },
  { gb: 1024, share: 0.125 },
  { gb: 2048, share: 0.125 },
  { gb: 4096, share: 0.05 },
];
const ID_PREFIX = 'S';                     // Speicher-IDs 'S1', 'S2' … – kollidieren nie mit den VM-Nummern

// Kunden mit ihrem Zweck
const CUSTOMERS = {
  'Fotostudio Blende 8': ['Fotoarchiv – zwanzig Jahre Hochzeiten.', 'Fotoarchiv. Bitte nichts löschen, die Bräute merken das.'],
  'Praxis Dr. Sommer': ['Backup Arztpraxis – bitte gut verschlüsseln.', 'Backup Arztpraxis. Der alte USB-Stick ist uns zu heikel.'],
  'Filmschule Talheim': ['Videoschnitt – die Rohdaten sind riesig.', 'Videoschnitt. 8K, weil man es kann.'],
  'Steuerbüro Kranich': ['Backup der Mandantenakten, zehn Jahre aufbewahren.', 'Archiv für die Belege. Papier hatten wir lange genug.'],
  'Gaming-Clan Pixelsturm': ['Für unsere Replays und Clips.', 'Speicher für die Mod-Sammlung. Sie wächst.'],
  'Hobbyfunk e.V.': ['Vereinsarchiv mit Fotos seit 1987.', 'Backup vom Vereinsforum. Sicher ist sicher.'],
  'Influencerin @PrintQueen': ['Für meine Videos! Alle! ✨', 'Backup von meinem Content – Fans vergessen nie.'],
};

const cents = (n) => Math.round(n * 100) / 100;

export class StorageRentals {
  // rentals: core/server-rentals.js (Offline-Regeln, Empfangsplätze) · nas: core/nas.js (Speicher je NAS)
  constructor(economy, servers, upgrades, rentals, nas) {
    this.economy = economy;
    this.servers = servers;
    this.upgrades = upgrades;
    this.rentals = rentals;
    this.nas = nas;
    this.requests = [];       // wartende Speicher-Anfragen, älteste zuerst
    this.contracts = [];      // laufende Speicher-Verträge
    this.nextId = 1;
    this.untilNext = STORAGE_REQUEST_EVERY;
    this.random = Math.random; // austauschbar für Tests
    this.listeners = new Set();
    // (type, data) => void – 'new-request' { request }, 'request-expired' { request }, 'request-declined' { request },
    // 'accepted' { request, contract, server }, 'rental-ended' { contract, server },
    // 'rental-cancelled' { contract, server, diskFailure }, 'income' { amount, contracts }
    this.onEvent = null;

    // Vermieteter Speicher je NAS für core/nas.js (Platte herausnehmen, „zu klein“) und Verträge, die wegen defekter
    // Platten offline sind (#49)
    nas.rentedStorageOf = (device) => this.usedOn(device);
    nas.strandedOf = (device) => this.strandedOn(device);
    // Miete je Gerät für Schrankfenster und servers.incomePerHour: VMs (core/server-rentals.js) plus Speicher (ohne
    // Verträge, die wegen einer defekten Platte offline sind)
    const vmRent = servers.rentOf;
    servers.rentOf = (device) => cents((vmRent?.(device) ?? 0) + this.activeRentOn(device));
    // Höchstens maxWaiting wartende Anfragen insgesamt: Die VM-Seite sieht so viele Plätze weniger, wie Speicher-Kunden
    // warten (main.js setzt rentals.maxWaiting wie bisher)
    let maxWaiting = rentals.maxWaiting;
    Object.defineProperty(rentals, 'maxWaiting', {
      configurable: true,
      get: () => Math.max(0, maxWaiting - this.requests.length),
      set: (value) => { maxWaiting = value; },
    });
    this.totalWaiting = () => maxWaiting;
    // Gemeinsame Sicht auf VM- und Speicher-Anfragen für den Empfang (world/customers.js, world/reception.js)
    this.desk = this.createDesk();
  }

  // ---------- Abfragen für die UI ----------

  // Ob die ID zu einer Speicher-Anfrage bzw. einem Speicher-Vertrag gehört ('S1' …)
  static isStorageId(id) {
    return typeof id === 'string' && id.startsWith(ID_PREFIX);
  }

  requestById(id) {
    return this.requests.find((r) => r.id === id) ?? null;
  }

  contractById(id) {
    return this.contracts.find((c) => c.id === id) ?? null;
  }

  // Alle eingebauten NAS (für die Auswahl), ob online oder nicht – private sperrt fitsOn mit Grund
  get nasDevices() {
    return this.servers.installed.filter((d) => isNas(d));
  }

  // NAS eines Vertrags (Gerät aus economy.furniture) oder null
  serverOf(contract) {
    return this.economy.furnitureById(contract.serverId) ?? null;
  }

  contractsOn(server) {
    return this.contracts.filter((c) => c.serverId === server.id);
  }

  // Vermieteter Speicher in GB auf der NAS
  usedOn(server) {
    return server ? this.contractsOn(server).reduce((sum, c) => sum + c.storage, 0) : 0;
  }

  // Speicher der NAS (Summe der Platten) bzw. davon frei
  storageOf(server) {
    return this.nas.storageOf(server);
  }

  freeOn(server) {
    return Math.max(0, this.storageOf(server) - this.usedOn(server));
  }

  // Miete pro Spielstunde für eine Anfrage bzw. einen Vertrag auf dieser NAS
  rentPerHour(request, server) {
    return cents(RENT_PER_GB_STORAGE * request.storage * (server.type.rentFactor ?? 1));
  }

  // Miete pro Spielstunde aller Speicher-Verträge auf der NAS (ob sie gerade online ist oder nicht)
  rentOn(server) {
    return cents(this.contractsOn(server).reduce((sum, c) => sum + this.rentPerHour(c, server), 0));
  }

  // Miete pro Spielstunde der Verträge auf der NAS, deren Daten auf die heilen Platten passen (#49)
  activeRentOn(server) {
    const stranded = this.strandedOn(server);
    return cents(this.contractsOn(server).reduce((sum, c) => (stranded.includes(c) ? sum : sum + this.rentPerHour(c, server)), 0));
  }

  // Ob die NAS die Daten gerade bereitstellt (online, nicht privat) – Regeln wie bei VMs
  serves(server, reached = this.servers.reachable()) {
    return this.rentals.serves(server, reached);
  }

  // Verträge auf der NAS, deren Daten nach einem Plattendefekt (#49) nicht mehr auf die heilen Platten passen.
  // Vorrang haben die gerade laufenden Verträge (contract.stranded nicht gesetzt), ältere zuerst: Jeder, der noch in den
  // verbleibenden heilen Speicher passt, läuft weiter. Danach bekommen offline Verträge, ältere zuerst, den Rest. Das
  // Ergebnis wird als contract.stranded vermerkt (wird gespeichert) – ein zweiter Aufruf ergibt dasselbe, und kein
  // laufender Vertrag geht offline, nur weil ein älterer zurückkommt. Ohne defekte Platte passt immer alles
  // (vermieteter Speicher sperrt das Herausnehmen heiler Platten).
  strandedOn(server) {
    if (!server) return [];
    let free = this.storageOf(server);
    const list = this.contractsOn(server);
    const out = new Set();
    for (const c of [...list.filter((x) => !x.stranded), ...list.filter((x) => x.stranded)]) {
      if (c.storage <= free) free -= c.storage;
      else out.add(c);
    }
    for (const c of list) {
      if (out.has(c)) c.stranded = true;
      else delete c.stranded;
    }
    return list.filter((c) => out.has(c));
  }

  // Ob der Vertrag offline ist, weil seine Daten nicht auf die heilen Platten passen (#49)
  isStranded(contract) {
    return this.strandedOn(this.serverOf(contract)).includes(contract);
  }

  // Alle Verträge, die wegen defekter Platten offline sind (Set, für einen Durchlauf)
  strandedSet() {
    const out = new Set();
    for (const id of new Set(this.contracts.map((c) => c.serverId))) {
      for (const c of this.strandedOn(this.economy.furnitureById(id))) out.add(c);
    }
    return out;
  }

  // Ob der Vertrag gerade läuft: NAS stellt die Daten bereit und sie passen auf die heilen Platten
  servesContract(contract, reached = this.servers.reachable(), stranded = this.strandedSet()) {
    return this.serves(this.serverOf(contract), reached) && !stranded.has(contract);
  }

  // Was die Speicher-Verträge auf laufenden NAS gerade pro Spielstunde bringen
  get incomePerHour() {
    const reached = this.servers.reachable();
    const stranded = this.strandedSet();
    return cents(this.contracts.reduce((sum, c) => (this.servesContract(c, reached, stranded) ? sum + this.rentPerHour(c, this.serverOf(c)) : sum), 0));
  }

  // Vermieteter Speicher aller Verträge in GB
  get rentedTotal() {
    return this.contracts.reduce((sum, c) => sum + c.storage, 0);
  }

  // Grund, warum die Anfrage nicht auf das Gerät passt, oder null. reached: aus servers.reachable() (spart Rechnen)
  fitsOn(request, server, reached = this.servers.reachable()) {
    if (server?.type.kind !== 'server' || server.location !== 'rack') return 'Server nicht eingebaut';
    if (!isNas(server)) return 'keine NAS – Speicher gibt es nur auf NAS';
    if (this.servers.isPrivateDevice(server)) return 'privater Server';
    if (!this.servers.isOnline(server, reached)) return `offline – ${this.servers.offlineReason(server, reached) ?? 'keine Verbindung'}`;
    const free = this.freeOn(server);
    if (request.storage > free) return `zu wenig freier Speicher (frei ${storageText(free)})`;
    return null;
  }

  // ---------- Annehmen ----------

  // Kunde ist am Empfang angekommen (über desk.markArrived) – erst dann vergibt die Automatik
  markArrived(requestId) {
    const request = this.requestById(requestId);
    if (!request) return false;
    request.atCounter = true;
    return true;
  }

  // Anfrage auf der gewählten NAS annehmen: { ok: true, contract } oder { ok: false, reason }
  // auto: von der automatischen Vergabe (Kennzeichen contract.auto, die App zeigt 🤖)
  acceptRequest(requestId, serverId, { auto = false } = {}) {
    const request = this.requestById(requestId);
    if (!request) return { ok: false, reason: 'Anfrage gibt es nicht mehr' };
    const server = this.economy.furnitureById(serverId);
    const reason = this.fitsOn(request, server);
    if (reason) return { ok: false, reason };
    const { waitLeft, atCounter, ...rest } = request;
    const contract = { ...rest, serverId: server.id, minutesLeft: request.duration, offlineFor: 0 };
    if (auto) contract.auto = true;
    this.requests = this.requests.filter((r) => r !== request);
    this.contracts.push(contract);
    this.onEvent?.('accepted', { request, contract, server });
    this.notify();
    return { ok: true, contract };
  }

  // Anfrage ablehnen: Der Kunde geht ohne Vertrag
  declineRequest(requestId) {
    const request = this.requestById(requestId);
    if (!request) return false;
    this.requests = this.requests.filter((r) => r !== request);
    this.onEvent?.('request-declined', { request });
    this.notify();
    return true;
  }

  // ---------- Anfragen erzeugen ----------

  // Speicher-Anfragen gibt es erst, wenn die zweite Etage steht und eine NAS außerhalb des privaten Bereichs eingebaut ist
  get requestsPossible() {
    return !!this.upgrades?.upperFloor && this.nasDevices.some((d) => !this.servers.isPrivateDevice(d));
  }

  // Neue Anfrage (ohne sie einzureihen): meist kleine Größen, selten 4 TB
  createRequest() {
    const [minHours, maxHours] = CONTRACT_HOURS;
    const duration = (minHours + Math.floor(this.random() * (maxHours - minHours + 1))) * 60;
    let roll = this.random();
    const size = STORAGE_SIZES.find((s) => (roll -= s.share) < 0) ?? STORAGE_SIZES[STORAGE_SIZES.length - 1];
    const names = Object.keys(CUSTOMERS);
    const customer = names[Math.floor(this.random() * names.length)];
    const notes = CUSTOMERS[customer];
    const note = notes[Math.floor(this.random() * notes.length)];
    return { id: `${ID_PREFIX}${this.nextId++}`, kind: 'storage', customer, note, storage: size.gb, duration, waitLeft: REQUEST_PATIENCE };
  }

  // ---------- Zeit ----------

  advance(gameMinutes) {
    let changed = false;
    // Wartende Kunden verlieren die Geduld
    for (const request of this.requests) request.waitLeft -= gameMinutes;
    const expired = this.requests.filter((r) => r.waitLeft <= 0);
    if (expired.length) {
      this.requests = this.requests.filter((r) => r.waitLeft > 0);
      for (const request of expired) this.onEvent?.('request-expired', { request });
      changed = true;
    }

    // Verträge: Laufzeit und Offline-Zeit am Stück (offline, privat, ausgebaut oder „zu klein“ – wie bei VMs – oder
    // wegen einer defekten Platte nicht mehr auf der NAS, #49)
    if (this.contracts.length) {
      const reached = this.servers.reachable();
      const stranded = this.strandedSet();
      const ended = [];
      const cancelled = [];
      for (const contract of this.contracts) {
        contract.minutesLeft -= gameMinutes;
        contract.offlineFor = this.servesContract(contract, reached, stranded) ? 0 : contract.offlineFor + gameMinutes;
        if (contract.minutesLeft <= 0) ended.push(contract);
        else if (contract.offlineFor >= CANCEL_AFTER_OFFLINE) cancelled.push(contract);
      }
      if (ended.length || cancelled.length) {
        this.contracts = this.contracts.filter((c) => !ended.includes(c) && !cancelled.includes(c));
        for (const contract of ended) this.onEvent?.('rental-ended', { contract, server: this.serverOf(contract) });
        // diskFailure: Kündigung, weil die Daten wegen einer defekten Platte nicht erreichbar waren (NAS lief, #49)
        for (const contract of cancelled) {
          const server = this.serverOf(contract);
          this.onEvent?.('rental-cancelled', { contract, server, diskFailure: stranded.has(contract) && this.serves(server, reached) });
        }
        changed = true;
      }
    }

    // Neue Kunden, solange am Empfang (VM- und Speicher-Kunden zusammen) Platz ist
    if (this.requestsPossible) {
      this.untilNext -= gameMinutes;
      if (this.untilNext <= 0) {
        this.untilNext = STORAGE_REQUEST_EVERY * (1 - REQUEST_JITTER + this.random() * 2 * REQUEST_JITTER);
        if (this.rentals.requests.length + this.requests.length < this.totalWaiting()) {
          const request = this.createRequest();
          this.requests.push(request);
          this.onEvent?.('new-request', { request });
          changed = true;
        }
      }
    }
    if (changed) this.notify();
  }

  // Zu jeder vollen Spielstunde: Miete aller Speicher-Verträge, deren NAS gerade online ist (und nicht privat steht)
  // und deren Daten auf die heilen Platten passen (#49)
  payHour() {
    const reached = this.servers.reachable();
    const stranded = this.strandedSet();
    let amount = 0;
    let paying = 0;
    for (const contract of this.contracts) {
      if (!this.servesContract(contract, reached, stranded)) continue;
      amount += this.rentPerHour(contract, this.serverOf(contract));
      paying++;
    }
    amount = cents(amount);
    if (amount <= 0) return 0;
    this.economy.earn(amount);
    this.onEvent?.('income', { amount, contracts: paying });
    return amount;
  }

  // ---------- Empfang ----------

  // Sicht für world/customers.js und world/reception.js (statt rentals übergeben): VM- und Speicher-Anfragen zusammen,
  // Annahme (vmById) und Ankunft (markArrived) für beide Arten
  createDesk() {
    const rentals = this.rentals;
    const desk = {
      get requests() { return [...rentals.requests, ...this.storage.requests]; },
      storage: this,
      requestById: (id) => rentals.requestById(id) ?? this.requestById(id),
      vmById: (id) => rentals.vmById(id) ?? this.contractById(id),
      markArrived: (id) => rentals.markArrived(id) || this.markArrived(id),
      subscribe: (listener) => {
        const offVms = rentals.subscribe(() => listener(desk));
        const offStorage = this.subscribe(() => listener(desk));
        return () => { offVms(); offStorage(); };
      },
    };
    return desk;
  }

  // ---------- Speichern ----------

  toJSON() {
    return {
      requests: this.requests.map(({ atCounter, ...r }) => r), // nach dem Laden kommt der Kunde neu herein
      contracts: this.contracts.map((c) => ({ ...c })),
      nextId: this.nextId,
      untilNext: this.untilNext,
    };
  }

  // Ohne Daten (alte Spielstände): keine Speicher-Anfragen, keine Verträge
  load(data) {
    this.requests = (data?.requests ?? []).map(({ atCounter, ...r }) => ({ ...r, kind: 'storage' }));
    // Verträge auf NAS, die es nicht mehr gibt, verwerfen
    this.contracts = (data?.contracts ?? [])
      .filter((c) => isNas(this.economy.furnitureById(c.serverId)))
      .map(({ stranded, ...c }) => ({ ...c, kind: 'storage', offlineFor: c.offlineFor ?? 0, ...(stranded ? { stranded: true } : {}) }));
    const numbers = [...this.requests, ...this.contracts].map((x) => Number(String(x.id).slice(ID_PREFIX.length)) || 0);
    this.nextId = Math.max(data?.nextId ?? 1, ...numbers.map((n) => n + 1));
    this.untilNext = data?.untilNext ?? STORAGE_REQUEST_EVERY;
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }
}
