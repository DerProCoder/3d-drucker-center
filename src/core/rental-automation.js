// Automatische Vergabe der VM-Anfragen: Server in Schränken der orangen Reihe „Private Server“ (core/server-zones.js,
// nicht die grüne Automatik-Reihe) übernehmen, was der Spieler sonst in der App „Server-Vermietung“ macht – Anfrage
// öffnen, Server wählen, vermieten. Ein Vergabe-Server ist ein Server dort, der online ist (also auch weder defekt
// noch eingefroren). Einer genügt, mehr machen es nicht schneller.
// KI-GPU-Server (core/ai-service.js) rechnen nur für die eigene KI: Sie vergeben nichts und bekommen auch keine VMs
// (rentals.rentableServers lässt sie weg).
//
// Ablauf: Steht ein Server-Kunde am Empfang (world/customers.js meldet 'arrived', main.js ruft rentals.markArrived),
// wird seine Anfrage nach ASSIGN_DELAY Spielminuten „Bearbeitung“ vergeben. Passt sie auf keinen Server, bleibt sie
// wartend (der Spieler kann sie selbst zuweisen), es gibt genau eine Meldung, und die Automatik versucht es alle
// RETRY_EVERY Spielminuten erneut, solange der Kunde wartet.
// Regel: unter allen Servern, auf die die VM passt (rentals.fitsOn === null – online, nicht privat, genug RAM und
// Cores frei), zuerst der höchste Mietfaktor, bei gleichem Faktor der vollste (am wenigsten freier RAM, dann freie
// Cores – Best Fit, damit große Lücken für große VMs frei bleiben). Freier Platz je Server richtet sich nach seinen
// eingebauten Teilen (rentals.freeRam/freeCores, core/server-parts.js) – aufgerüstete Server nehmen auch große VMs an.
// Speicher-Anfragen (#47, core/storage-rentals.js) vergibt die Automatik genauso: auf die vollste NAS, auf die die
// Anfrage noch passt (storage.fitsOn === null, am wenigsten freier Speicher).
// Schalter „Automatische Vergabe an/aus“ (Standard an) wird gespeichert. Läuft in Spielminuten. Ohne Three.js und DOM.
import { isPrivateRowRack, spotLabel } from './server-zones.js';
import { isRentableType } from './server-catalog.js';

export const ASSIGN_DELAY = 1;  // Spielminuten zwischen Ankunft am Empfang und Vergabe (echt 3 s)
export const RETRY_EVERY = 1;   // Spielminuten zwischen zwei Versuchen, wenn nichts passt
const CHECK_EVERY = 1;          // Spielminuten zwischen zwei Prüfungen, ob noch ein Vergabe-Server online ist
// Vergeben wird erst, wenn der Kunde am Empfang steht – Online-Anfragen über die Website (#54, source: 'website')
// sind sofort da, ohne Figur
const ready = (request) => request.atCounter || request.source === 'website';

export class RentalAutomation {
  // storage: core/storage-rentals.js (Speicher-Anfragen, optional)
  constructor(rentals, storage = null) {
    this.rentals = rentals;
    this.storage = storage;
    this.servers = rentals.servers;
    this.economy = rentals.economy;
    this.enabled = true;          // Schalter „Automatische Vergabe an/aus“
    this.countdown = new Map();   // Anfrage-ID → Spielminuten bis zum nächsten Versuch (nur Anfragen am Empfang)
    this.reported = new Set();    // Anfrage-IDs, für die „passt auf keinen Server“ schon gemeldet wurde
    this.sinceCheck = 0;          // Spielminuten seit der letzten Prüfung der Vergabe-Server
    this.started = false;         // erste Prüfung (nach Start, Laden oder Umschalten) meldet nichts
    this.wasActive = false;
    // (type, data) => void – 'assigned' { request, vm, server, rack, rackLabel, rent, via (Vergabe-Server) } (bei Speicher-Anfragen
    // – request.kind === 'storage' – ist vm der Speicher-Vertrag),
    // 'no-fit' { request } (einmal je Anfrage), 'stopped' {} (kein privater Server mehr online),
    // 'active' { server, rack, rackLabel } (wieder bzw. erstmals ein Vergabe-Server online, nicht nach dem Laden)
    this.onEvent = null;
  }

  // ---------- Abfragen ----------

  // Vergabe-Server: online in einem Schrank der orangen Reihe, nach ID (der erste steht in der Statuszeile);
  // KI-GPU-Server zählen nicht
  assignServers(reached = this.servers.reachable()) {
    return this.servers.installed
      .filter((d) => isRentableType(d.type) && isPrivateRowRack(this.servers.rackOf(d)) && this.servers.isOnline(d, reached))
      .sort((a, b) => a.id - b.id);
  }

  // Für die Statuszeile in der App: { state: 'active' | 'off' | 'no-server', server, rack, rackLabel }
  // server/rack: Vergabe-Server und sein Schrank (nur bei 'active', sonst null)
  status(reached = this.servers.reachable()) {
    if (!this.enabled) return { state: 'off', server: null, rack: null, rackLabel: null };
    const server = this.assignServers(reached)[0];
    if (!server) return { state: 'no-server', server: null, rack: null, rackLabel: null };
    const rack = this.servers.rackOf(server);
    return { state: 'active', server, rack, rackLabel: spotLabel(rack.slot) };
  }

  // Ob die Automatik gerade vergibt (an und ein Vergabe-Server online)
  isActive(reached = this.servers.reachable()) {
    return this.enabled && this.assignServers(reached).length > 0;
  }

  // Alle wartenden Anfragen: VMs und (falls vorhanden) Speicher
  get requests() {
    return this.storage ? [...this.rentals.requests, ...this.storage.requests] : this.rentals.requests;
  }

  // Bester Server für die Anfrage nach der Regel oben, oder null, wenn sie nirgends passt
  pick(request, reached = this.servers.reachable()) {
    if (request.kind === 'storage') return this.pickNas(request, reached);
    const rentals = this.rentals;
    const fitting = rentals.rentableServers.filter((s) => rentals.fitsOn(request, s, reached) === null);
    fitting.sort((a, b) => (b.type.rentFactor ?? 1) - (a.type.rentFactor ?? 1)
      || rentals.freeRam(a) - rentals.freeRam(b)
      || rentals.freeCores(a) - rentals.freeCores(b)
      || a.id - b.id);
    return fitting[0] ?? null;
  }

  // Vollste NAS, auf die die Speicher-Anfrage noch passt (am wenigsten freier Speicher), oder null
  pickNas(request, reached = this.servers.reachable()) {
    const storage = this.storage;
    if (!storage) return null;
    const fitting = storage.nasDevices.filter((s) => storage.fitsOn(request, s, reached) === null);
    fitting.sort((a, b) => storage.freeOn(a) - storage.freeOn(b) || a.id - b.id);
    return fitting[0] ?? null;
  }

  // ---------- Schalter ----------

  setEnabled(on) {
    this.enabled = !!on;
    this.started = false; // Umschalten meldet nicht „gestoppt“ bzw. „aktiv“ – die App zeigt den Status
    this.rentals.notify();
    this.storage?.notify();
  }

  // ---------- Zeit ----------

  advance(minutes) {
    if (minutes <= 0) return;
    const requests = this.requests;
    // Wartezeit der Anfragen am Empfang; verschwundene (angenommen, abgelehnt, verfallen) vergessen
    let due = false;
    for (const request of requests) {
      if (!ready(request)) continue;
      const left = (this.countdown.get(request.id) ?? ASSIGN_DELAY) - minutes;
      this.countdown.set(request.id, left);
      if (left <= 0) due = true;
    }
    if (this.countdown.size > requests.length || this.reported.size > requests.length) {
      const ids = new Set(requests.map((r) => r.id));
      for (const id of this.countdown.keys()) if (!ids.has(id)) this.countdown.delete(id);
      for (const id of this.reported) if (!ids.has(id)) this.reported.delete(id);
    }
    this.sinceCheck += minutes;
    if (!due && this.sinceCheck < CHECK_EVERY && this.started) return;
    this.sinceCheck %= CHECK_EVERY;

    // Höchstens einmal je Aufruf das Netz ablaufen
    const reached = this.servers.reachable();
    const via = this.enabled ? this.assignServers(reached)[0] ?? null : null;
    this.report(via);
    if (!due) return;
    for (const request of [...requests]) {
      if (!ready(request) || this.countdown.get(request.id) > 0) continue;
      // Aus oder kein Vergabe-Server: in der nächsten Spielminute wieder nachsehen (nicht jedes Bild das Netz ablaufen)
      if (via) this.tryAssign(request, via, reached);
      else this.countdown.set(request.id, CHECK_EVERY);
    }
  }

  // Eine Anfrage vergeben oder (einmal) melden, dass sie nicht passt, und später erneut versuchen
  tryAssign(request, via, reached) {
    const server = this.pick(request, reached);
    if (!server) {
      this.countdown.set(request.id, RETRY_EVERY);
      if (!this.reported.has(request.id)) {
        this.reported.add(request.id);
        this.onEvent?.('no-fit', { request });
      }
      return false;
    }
    const market = request.kind === 'storage' ? this.storage : this.rentals;
    const rent = market.rentPerHour(request, server);
    const result = market.acceptRequest(request.id, server.id, { auto: true });
    if (!result.ok) {
      this.countdown.set(request.id, RETRY_EVERY);
      return false;
    }
    this.countdown.delete(request.id);
    this.reported.delete(request.id);
    const rack = this.servers.rackOf(server);
    this.onEvent?.('assigned', { request, vm: result.vm ?? result.contract, server, rack, rackLabel: rack ? spotLabel(rack.slot) : '', rent, via });
    return true;
  }

  // Meldungen beim Wechsel: kein Vergabe-Server mehr online bzw. wieder einer da (nicht nach Start/Laden/Umschalten)
  report(via) {
    const active = !!via;
    if (!this.started) {
      this.started = true;
      this.wasActive = active;
      return;
    }
    if (active === this.wasActive) return;
    this.wasActive = active;
    if (!this.enabled) return;
    if (active) {
      const rack = this.servers.rackOf(via);
      this.onEvent?.('active', { server: via, rack, rackLabel: spotLabel(rack.slot) });
    } else {
      this.onEvent?.('stopped', {});
    }
  }

  // ---------- Speichern ----------

  toJSON() {
    return { enabled: this.enabled };
  }

  // Ohne Daten (alte Spielstände): Automatik an
  load(data) {
    this.enabled = data?.enabled ?? true;
    this.countdown.clear();
    this.reported.clear();
    this.sinceCheck = 0;
    this.started = false;
  }
}
