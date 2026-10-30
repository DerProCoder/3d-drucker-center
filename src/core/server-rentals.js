// Server-Vermietung wie bei einem Hyperscaler: Kunden kommen mit VM-Wünschen (RAM und Cores) zum Empfang, der
// Spieler wählt selbst einen Server mit genug freiem Platz und nimmt an (oder die privaten Server vergeben
// automatisch, core/rental-automation.js). Wie viel RAM und Cores ein Server hat, ergibt sich aus seinen eingebauten
// Teilen (core/server-parts.js, servers.capacityOf – beim Kauf SERVER_RAM GB und SERVER_CORES Cores, aufgerüstet bis
// 1024 GB / 128 Cores); die VMs darauf dürfen zusammen nicht mehr belegen. Gibt es aufgerüstete Server, kommen auch
// größere Anfragen (bis zur Größe des größten vermietbaren Servers).
// Miete pro Spielstunde = (RENT_PER_GB × GB + RENT_PER_CORE × Cores) × rentFactor des Servers, gezahlt zu jeder vollen
// Spielstunde für jede VM, deren Server gerade online ist. Ein Vertrag läuft eine feste Zeit; ist sein Server zu
// lange am Stück offline (auch ausgebaut, defekt, eingefroren oder in einen privaten Schrank umgezogen), kündigt der
// Kunde. Server in privaten Schränken (core/server-zones.js) sind nicht vermietbar und bringen keine Miete.
// KI-GPU-Server (rentable: false, core/ai-service.js) sind nie vermietbar und tauchen in der Serverwahl nicht auf.
// Zeiten in Spielminuten (Delta-Zeit). Ohne Three.js und DOM.
//
// Anfrage: { id, customer, note, ram (GB), cores, duration (Spielminuten Vertragslaufzeit), waitLeft (Spielminuten,
//            die der Kunde am Empfang noch wartet), atCounter (Kunde ist am Empfang angekommen – markArrived; wird
//            nicht gespeichert, nach dem Laden kommt der Kunde neu herein) }
// VM (laufender Vertrag): { id, customer, note, ram, cores, serverId, duration, minutesLeft (Restlaufzeit),
//            offlineFor (Spielminuten, die der Server gerade am Stück offline ist), auto (true: von den privaten
//            Servern automatisch vergeben, core/rental-automation.js) }
// Online-Anfragen über die eigene Website (#54, core/website.js) tragen source: 'website' (bleibt am Vertrag): Sie
// kommen ohne Figur am Empfang, zählen nicht bei maxWaiting (counterRequests) und warten in der App auf Antwort.
import { SERVER_CORES, SERVER_RAM, isRentableType } from './server-catalog.js';

export const NEW_REQUEST_EVERY = 60;      // Spielminuten zwischen zwei Anfragen (echt ca. 3 min) …
const REQUEST_JITTER = 0.3;               // … ± 30 % Zufall
export const REQUEST_PATIENCE = 120;      // so lange wartet ein Kunde am Empfang (wie bei Druckaufträgen)
export const MAX_WAITING = 5;             // höchstens so viele wartende Anfragen (main.js setzt die Plätze am Empfang)
export const CONTRACT_HOURS = [12, 72];   // Vertragslaufzeit in Spielstunden (echt 36 min – 3,6 h)
export const CANCEL_AFTER_OFFLINE = 180;  // so viele Spielminuten am Stück offline, dann kündigt der Kunde
export const RENT_PER_GB = 0.05;          // € je GB RAM und Spielstunde
export const RENT_PER_CORE = 0.4;         // € je Core und Spielstunde
const MIN_RAM = 2;
const MIN_CORES = 2;
const GB_PER_CORE = [2, 8];               // RAM passt grob zur Core-Zahl
// Größe der Anfragen: meist klein, selten riesig (Anteil, Cores von–bis)
const SIZES = [
  { share: 0.62, cores: [2, 8] },
  { share: 0.3, cores: [10, 24] },
  { share: 0.08, cores: [26, SERVER_CORES] }, // obere Grenze: größter vermietbarer Server (biggestServer)
];
const JONAS_CHANCE = 0.04;                // so oft kommt Jonas (12) mit seinem Minecraft-Server

// Kunden mit typischen Sprüchen
const CUSTOMERS = {
  'Startup Wolkig GmbH': ['Wir skalieren gerade. Also … hoffentlich.', 'Unser Investor will das Wort „Cloud“ hören.'],
  'Gaming-Clan Pixelsturm': ['Heute Abend ist Raid – bitte ohne Lag!', 'Ping unter 20, sonst gibt’s Ärger im Chat.'],
  'Onlineshop Kaffeebohne': ['Black Friday kommt bestimmt.', 'Der Warenkorb darf nicht wieder abstürzen.'],
  'Lehrstuhl Informatik': ['Für unsere Simulationen. Die laufen … etwas länger.', 'Die Doktoranden brauchen Rechenzeit, dringend.'],
  'Agentur Klickwerk': ['Die Kundenwebseite muss heute noch live.', '100 % Uptime, bitte. Mindestens.'],
  'Praxis Dr. Sommer': ['Für die Terminbuchung. Bitte gut abschließen.', 'Unser alter Server stand im Putzraum.'],
  'Stadtwerke Talheim': ['Für die Ablesung der Stromzähler. Ironisch, oder?', 'Bitte mit Rechnung in dreifacher Ausfertigung.'],
  'KI-Labor Neuronix': ['Unser Modell hat Hunger.', 'Mehr Cores! Immer mehr Cores!'],
  'Hobbyfunk e.V.': ['Für unser Vereinsforum. 300 Mitglieder, 12 davon aktiv.', 'Wir zahlen pünktlich. Meistens.'],
  'Influencerin @PrintQueen': ['Für meinen eigenen Streaming-Server! ✨', 'Das wird mein Content des Jahres!'],
};
const JONAS = { customer: 'Jonas (12)', ram: 2, cores: 2, note: 'Nur ein kleiner Minecraft-Server, bitte!! Mama zahlt.' };

const even = (n) => Math.round(n / 2) * 2;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const cents = (n) => Math.round(n * 100) / 100;

export class ServerRentals {
  constructor(economy, servers, upgrades) {
    this.economy = economy;
    this.servers = servers;
    this.upgrades = upgrades;
    this.requests = [];       // wartende Anfragen, älteste zuerst
    this.vms = [];            // laufende Verträge
    this.nextId = 1;
    this.untilNext = NEW_REQUEST_EVERY;
    this.maxWaiting = MAX_WAITING;
    this.random = Math.random; // austauschbar für Tests
    this.website = null;      // core/website.js setzt sich hier ein (Statistik: angenommene Online-Anfragen, Miete)
    this.listeners = new Set();
    // (type, data) => void – 'new-request' { request }, 'request-expired' { request }, 'request-declined' { request },
    // 'accepted' { request, vm, server }, 'rental-ended' { vm, server }, 'rental-cancelled' { vm, server },
    // 'income' { amount, vms }
    this.onEvent = null;
    // core/servers.js kennt die Verträge nicht (rentOf liefert dort ohne Vermietung 0). Damit Schrankfenster und
    // andere Anzeigen trotzdem die Miete eines Servers zeigen, ersetzen wir die Funktion durch rentOn – so muss
    // servers.js diese Datei nicht importieren.
    servers.rentOf = (server) => this.rentOn(server);
    // Belegung je Server für core/server-parts.js (Abrüsten nur, solange die VMs Platz haben)
    servers.usageOf = (server) => ({ cores: this.usedCores(server), ram: this.usedRam(server) });
  }

  // ---------- Abfragen für die UI ----------

  requestById(id) {
    return this.requests.find((r) => r.id === id) ?? null;
  }

  vmById(id) {
    return this.vms.find((v) => v.id === id) ?? null;
  }

  // Anfragen von Kunden, die am Empfang stehen bzw. dorthin kommen (ohne Online-Anfragen über die Website)
  get counterRequests() {
    return this.requests.filter((r) => r.source !== 'website');
  }

  // Alle eingebauten Server (für die Serverwahl), ob online oder nicht – auch private; die sperrt fitsOn mit Grund.
  // KI-GPU-Server fehlen ganz (rechnen für die eigene KI)
  get rentableServers() {
    return this.servers.installed.filter((d) => isRentableType(d.type));
  }

  // Server einer VM (Gerät aus economy.furniture) oder null
  serverOf(vm) {
    return this.economy.furnitureById(vm.serverId) ?? null;
  }

  vmsOn(server) {
    return this.vms.filter((v) => v.serverId === server.id);
  }

  usedRam(server) {
    return this.vmsOn(server).reduce((sum, v) => sum + v.ram, 0);
  }

  usedCores(server) {
    return this.vmsOn(server).reduce((sum, v) => sum + v.cores, 0);
  }

  // Ausstattung des Servers aus seinen Teilen: { cores, ram }
  capacity(server) {
    return this.servers.capacityOf(server);
  }

  freeRam(server) {
    return this.capacity(server).ram - this.usedRam(server);
  }

  freeCores(server) {
    return this.capacity(server).cores - this.usedCores(server);
  }

  // Größter vermietbarer Server außerhalb des privaten Bereichs: { cores, ram } – beide Werte vom selben Server (die
  // meisten Cores, bei Gleichstand der meiste RAM), damit jede neue Anfrage auf ihn passt. Danach richtet sich die
  // Größe neuer Anfragen. Ohne solchen Server: Standardausstattung.
  get biggestServer() {
    let best = null;
    for (const server of this.rentableServers) {
      if (this.servers.isPrivateDevice(server)) continue;
      const c = this.capacity(server);
      if (!best || c.cores > best.cores || (c.cores === best.cores && c.ram > best.ram)) best = { cores: c.cores, ram: c.ram };
    }
    return best ?? { cores: SERVER_CORES, ram: SERVER_RAM };
  }

  // Miete pro Spielstunde für eine Anfrage bzw. VM auf diesem Server (abhängig vom Mietfaktor des Modells)
  rentPerHour(request, server) {
    return cents((RENT_PER_GB * request.ram + RENT_PER_CORE * request.cores) * (server.type.rentFactor ?? 1));
  }

  // Miete pro Spielstunde aller VMs auf dem Server (ob er gerade online ist oder nicht)
  rentOn(server) {
    return cents(this.vmsOn(server).reduce((sum, v) => sum + this.rentPerHour(v, server), 0));
  }

  // Ob die VMs auf dem Server gerade laufen und Miete bringen: Er ist online und steht nicht in einem privaten
  // Schrank. Zieht ein Server mit VMs in einen privaten Schrank um, gilt er für seine Kunden wie offline (keine
  // Miete, offlineFor läuft, nach CANCEL_AFTER_OFFLINE kündigen sie).
  serves(server, reached = this.servers.reachable()) {
    return !!server && this.servers.isOnline(server, reached) && !this.servers.isPrivateDevice(server);
  }

  // Warum die VMs auf dem Server gerade nicht laufen (für die Anzeige), oder null
  vmProblem(server, reached = this.servers.reachable()) {
    if (server?.location !== 'rack') return 'Server ausgebaut – Kunde kündigt bald';
    if (this.servers.isPrivateDevice(server)) return 'privater Server – Kunde kündigt bald';
    if (!this.servers.isOnline(server, reached)) return `offline – ${this.servers.offlineReason(server, reached) ?? 'keine Verbindung'}`;
    return null;
  }

  // Was die VMs auf laufenden Servern gerade pro Spielstunde bringen
  get incomePerHour() {
    const reached = this.servers.reachable();
    return cents(this.vms.reduce((sum, v) => {
      const server = this.serverOf(v);
      return this.serves(server, reached) ? sum + this.rentPerHour(v, server) : sum;
    }, 0));
  }

  // Grund, warum die Anfrage nicht auf den Server passt, oder null. reached: aus servers.reachable() (spart Rechnen)
  fitsOn(request, server, reached = this.servers.reachable()) {
    if (server?.type.kind !== 'server' || server.location !== 'rack') return 'Server nicht eingebaut';
    if (!isRentableType(server.type)) return 'KI-Server – nicht vermietbar';
    // Server in privaten Schränken (Reihe „Private Server“ und Automatik-Reihe, core/server-zones.js) gehören einem selbst
    if (this.servers.isPrivateDevice(server)) return 'privater Server';
    if (!this.servers.isOnline(server, reached)) return `offline – ${this.servers.offlineReason(server, reached) ?? 'keine Verbindung'}`;
    const ram = this.freeRam(server);
    if (request.ram > ram) return `zu wenig freier RAM (frei ${ram} GB)`;
    const cores = this.freeCores(server);
    if (request.cores > cores) return `zu wenig freie Cores (frei ${cores})`;
    return null;
  }

  // ---------- Annehmen ----------

  // Kunde der Anfrage ist am Empfang angekommen (main.js beim 'arrived' aus world/customers.js) – erst dann vergibt
  // die automatische Vergabe (core/rental-automation.js). Gibt false zurück, wenn es die Anfrage nicht (mehr) gibt.
  markArrived(requestId) {
    const request = this.requestById(requestId);
    if (!request) return false;
    request.atCounter = true;
    return true;
  }

  // Anfrage auf dem gewählten Server annehmen: { ok: true, vm } oder { ok: false, reason }
  // auto: von der automatischen Vergabe (die VM bekommt das Kennzeichen vm.auto, die App zeigt 🤖)
  acceptRequest(requestId, serverId, { auto = false } = {}) {
    const request = this.requestById(requestId);
    if (!request) return { ok: false, reason: 'Anfrage gibt es nicht mehr' };
    const server = this.economy.furnitureById(serverId);
    const reason = this.fitsOn(request, server);
    if (reason) return { ok: false, reason };
    const { waitLeft, atCounter, ...rest } = request;
    const vm = { ...rest, serverId: server.id, minutesLeft: request.duration, offlineFor: 0 };
    if (auto) vm.auto = true;
    this.requests = this.requests.filter((r) => r !== request);
    this.vms.push(vm);
    this.onEvent?.('accepted', { request, vm, server });
    this.website?.recordAccepted(request);
    this.notify();
    return { ok: true, vm };
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

  // Anfragen gibt es erst, wenn die zweite Etage steht und mindestens ein Server außerhalb des privaten Bereichs
  // eingebaut ist
  get requestsPossible() {
    return !!this.upgrades?.upperFloor && this.rentableServers.some((s) => !this.servers.isPrivateDevice(s));
  }

  // Fertige Anfrage einreihen (core/website.js für Online-Anfragen – ohne Prüfung der Empfangsplätze)
  addRequest(request) {
    this.requests.push(request);
    this.onEvent?.('new-request', { request });
    this.notify();
    return request;
  }

  // Neue Anfrage (ohne sie einzureihen): meist kleine VMs, selten riesige
  createRequest() {
    const between = (min, max) => min + this.random() * (max - min);
    const patience = { waitLeft: REQUEST_PATIENCE };
    const [minHours, maxHours] = CONTRACT_HOURS;
    const duration = (minHours + Math.floor(this.random() * (maxHours - minHours + 1))) * 60;
    if (this.random() < JONAS_CHANCE) return { id: this.nextId++, ...JONAS, duration, ...patience };
    let roll = this.random();
    const size = SIZES.find((s) => (roll -= s.share) < 0) ?? SIZES[SIZES.length - 1];
    // Die größten Anfragen wachsen mit dem größten Server (aufgerüstet bis 128 Cores / 1024 GB)
    const biggest = this.biggestServer;
    const [minCores, maxCores] = size === SIZES[SIZES.length - 1] ? [size.cores[0], biggest.cores] : size.cores;
    const cores = clamp(even(between(minCores, maxCores)), MIN_CORES, biggest.cores);
    const ram = clamp(even(cores * between(...GB_PER_CORE)), MIN_RAM, biggest.ram);
    const names = Object.keys(CUSTOMERS);
    const customer = names[Math.floor(this.random() * names.length)];
    const notes = CUSTOMERS[customer];
    const note = notes[Math.floor(this.random() * notes.length)];
    return { id: this.nextId++, customer, note, ram, cores, duration, ...patience };
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

    // Verträge: Laufzeit und Offline-Zeit am Stück
    if (this.vms.length) {
      const reached = this.servers.reachable();
      const ended = [];
      const cancelled = [];
      for (const vm of this.vms) {
        const server = this.serverOf(vm);
        vm.minutesLeft -= gameMinutes;
        vm.offlineFor = this.serves(server, reached) ? 0 : vm.offlineFor + gameMinutes; // privat zählt wie offline
        if (vm.minutesLeft <= 0) ended.push(vm);
        else if (vm.offlineFor >= CANCEL_AFTER_OFFLINE) cancelled.push(vm);
      }
      if (ended.length || cancelled.length) {
        this.vms = this.vms.filter((v) => !ended.includes(v) && !cancelled.includes(v));
        for (const vm of ended) this.onEvent?.('rental-ended', { vm, server: this.serverOf(vm) });
        for (const vm of cancelled) this.onEvent?.('rental-cancelled', { vm, server: this.serverOf(vm) });
        changed = true;
      }
    }

    // Neue Kunden, solange am Empfang Platz ist
    if (this.requestsPossible) {
      this.untilNext -= gameMinutes;
      if (this.untilNext <= 0) {
        this.untilNext = NEW_REQUEST_EVERY * (1 - REQUEST_JITTER + this.random() * 2 * REQUEST_JITTER);
        if (this.counterRequests.length < this.maxWaiting) { // Online-Anfragen belegen keinen Platz am Empfang
          const request = this.createRequest();
          this.requests.push(request);
          this.onEvent?.('new-request', { request });
          changed = true;
        }
      }
    }
    if (changed) this.notify();
  }

  // Zu jeder vollen Spielstunde: Miete aller VMs, deren Server gerade online ist (und nicht privat steht)
  payHour() {
    const reached = this.servers.reachable();
    let amount = 0;
    let paying = 0;
    let online = 0; // davon Verträge über die Website (Statistik in core/website.js)
    for (const vm of this.vms) {
      const server = this.serverOf(vm);
      if (!this.serves(server, reached)) continue;
      const rent = this.rentPerHour(vm, server);
      amount += rent;
      if (vm.source === 'website') online += rent;
      paying++;
    }
    amount = cents(amount);
    if (online > 0) this.website?.recordIncome(cents(online));
    if (amount <= 0) return 0;
    this.economy.earn(amount);
    this.onEvent?.('income', { amount, vms: paying });
    return amount;
  }

  // ---------- Speichern ----------

  toJSON() {
    return {
      requests: this.requests.map(({ atCounter, ...r }) => r), // nach dem Laden kommt der Kunde neu herein
      vms: this.vms.map((v) => ({ ...v })),
      nextId: this.nextId,
      untilNext: this.untilNext,
    };
  }

  // Ohne Daten (alte Spielstände): keine Anfragen, keine Mieter – alle Server sind frei
  load(data) {
    this.requests = (data?.requests ?? []).map(({ atCounter, ...r }) => r);
    // Verträge auf Servern, die es nicht mehr gibt, verwerfen
    this.vms = (data?.vms ?? [])
      .filter((v) => this.economy.furnitureById(v.serverId)?.type.kind === 'server')
      .map((v) => ({ ...v, offlineFor: v.offlineFor ?? 0 }));
    const ids = [...this.requests, ...this.vms].map((x) => x.id);
    this.nextId = Math.max(data?.nextId ?? 1, ...ids.map((id) => id + 1));
    this.untilNext = data?.untilNext ?? NEW_REQUEST_EVERY;
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
