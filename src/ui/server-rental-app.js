// PC-App „Server-Vermietung“: Anfragen der Kunden am Empfang (VM mit RAM und Cores), Serverwahl und Auslastung.
// Der Spieler wählt für jede Anfrage selbst einen Server – oder die privaten Server vergeben automatisch
// (core/rental-automation.js, oben Schalter und Status, 🤖 an automatisch vergebenen VMs). Unpassende Server (offline,
// zu wenig frei, privat) sind ausgegraut mit Grund. Darunter je Server zwei Balken (RAM, Cores) und die laufenden
// Verträge (RAM und Cores je Server aus seinen Bauteilen). Die Logik steckt in core/server-rentals.js, hier wird nur
// angezeigt und weitergereicht.
// Speicher-Vermietung (#47, core/storage-rentals.js, optional): Speicher-Anfragen stehen mit 💾 und Größe zwischen den
// VM-Anfragen und passen nur auf NAS. Jede NAS zeigt zusätzlich einen Balken „Speicher: 1,2 / 4,5 TB belegt“ und ihre
// Speicher-Verträge (scrollbar wie die VMs). Nach einem Plattendefekt (#49) läuft die NAS weiter; Verträge, die nicht
// mehr auf die heilen Platten passen, sind mit 💽 als offline gekennzeichnet.
// Online-Anfragen über die eigene Website (#54, core/website.js, source: 'website') tragen das Kennzeichen „🌐 Website“ –
// der Kunde steht nicht am Empfang, sondern wartet online auf Antwort. Verträge daraus zeigen 🌐 vor dem Namen.
import { CANCEL_AFTER_OFFLINE, RENT_PER_CORE, RENT_PER_GB } from '../core/server-rentals.js';
import { RENT_PER_GB_STORAGE, StorageRentals } from '../core/storage-rentals.js';
import { isNas, storageText } from '../core/nas.js';
import { spotLabel } from '../core/server-zones.js';
import { euro, realTime } from '../core/format.js';

// Ab so viel Offline-Zeit (Anteil an CANCEL_AFTER_OFFLINE) wird die Warnung rot
const DANGER_SHARE = 0.5;
// So viele VM-Zeilen zeigt die Liste einer Server-Karte ohne Scrollen (Höhe von .rental-vms in css/apps.css)
const VMS_VISIBLE = 4;

const percent = (used, total) => (total > 0 ? Math.min(100, Math.round((used / total) * 100)) : (used > 0 ? 100 : 0)); // ohne CPU bzw. RAM: 0
// Anfrage- bzw. Vertrags-ID aus data-Attributen: VMs haben Zahlen, Speicher 'S1' …
const idOf = (text) => (StorageRentals.isStorageId(text) ? text : Number(text));

// economy: core/economy.js · servers: core/servers.js · rentals: core/server-rentals.js
// automation: core/rental-automation.js (fehlt es, gibt es keinen Schalter für die automatische Vergabe)
// storage: core/storage-rentals.js (fehlt es, gibt es keine Speicher-Anfragen und keinen Speicher-Balken)
// website: core/website.js (optional) – Statuszeile „🌐 Website: Live · … Online-Anfragen heute“
export function createServerRentalApp({ economy, servers, rentals, automation = null, storage = null, website = null }) {
  const chosen = new Map(); // Anfrage-ID → gewählte Server-ID (bleibt beim Neuzeichnen erhalten)
  // Anfrage bzw. Vertrag gehört zur Speicher-Vermietung?
  const isStorage = (id) => !!storage && StorageRentals.isStorageId(id);
  const marketOf = (id) => (isStorage(id) ? storage : rentals);
  const requestById = (id) => marketOf(id).requestById(id);

  // „Reihe A · Platz 3 · HE 5“ (bzw. „🔒 Privat · Platz 2“ …) – Stellplatz wie im Schrankfenster, damit man gleiche
  // Modelle auseinanderhält und den Schrank im Serverraum findet
  function place(server) {
    const rack = servers.rackOf(server);
    return rack ? `${spotLabel(rack.slot)} · HE ${server.unit + 1}` : 'nicht eingebaut';
  }

  const viaWeb = (x) => x.source === 'website';
  const waitText = (request) => (viaWeb(request)
    ? `Wartet noch ca. ${realTime(request.waitLeft)} online auf Antwort`
    : `Wartet noch ca. ${realTime(request.waitLeft)} am Empfang`);
  // Kennzeichen „🌐 Website“ an Anfragen und Verträgen, die über die Website kamen
  const webBadge = (x) => (viaWeb(x) ? '<span class="rental-web" title="über die Website gebucht">🌐 Website</span>' : '');
  const webMark = (x) => (viaWeb(x) ? '<span title="über die Website gebucht">🌐</span> ' : '');
  const leftText = (vm) => `noch ${realTime(vm.minutesLeft)}`;
  // Server privat (läuft, bedient die VM aber nicht) oder offline – Speicher-Verträge auch wegen einer defekten Platte
  // der NAS (#49)
  const warnText = (vm) => {
    const server = economy.furnitureById(vm.serverId);
    const disk = vm.kind === 'storage' && storage?.isStranded(vm);
    const why = disk ? '💽 Festplatte defekt – Daten passen nicht auf die heilen Platten'
      : server && servers.isPrivateDevice(server) ? 'privater Server' : 'Server offline';
    return `⚠ ${why} – Kunde kündigt in ca. ${realTime(Math.max(0, CANCEL_AFTER_OFFLINE - vm.offlineFor))}`;
  };

  // Statuszeile der automatischen Vergabe: wer vergibt, oder warum nicht
  function autoText(reached) {
    const { state, server, rackLabel } = automation.status(reached);
    if (state === 'off') return { text: '✋ Automatische Vergabe aus – du vergibst die VMs selbst', on: false };
    if (state === 'active') return { text: `🤖 Automatische Vergabe aktiv über ${server.type.name}, ${rackLabel.replace('🔒 ', '')}`, on: true };
    return { text: 'Automatische Vergabe: kein privater Server online – Server in einen Schrank der orangen Reihe „Private Server“ einbauen und online bringen', on: false };
  }

  function autoRow(reached) {
    if (!automation) return '';
    const { text, on } = autoText(reached);
    return `
      <div class="rack-auto rental-auto">
        <span data-rental-auto-text class="${on ? 'on' : ''}">${text}</span>
        <button class="secondary small" data-rental-auto>${automation.enabled ? 'Automatische Vergabe aus' : 'Automatische Vergabe an'}</button>
      </div>`;
  }

  // Gewählter Server einer Anfrage, nur wenn die VM bzw. der Speicher dort (noch) passt
  function validChoice(request, reached) {
    const server = economy.furnitureById(chosen.get(request.id));
    return server && !marketOf(request.id).fitsOn(request, server, reached) ? server : null;
  }

  // Auswahl einer NAS für eine Speicher-Anfrage (frei: Speicher statt RAM/Cores)
  function nasOption(request, server, reached) {
    const reason = storage.fitsOn(request, server, reached);
    const selected = !reason && chosen.get(request.id) === server.id;
    return `
      <button class="rental-server${selected ? ' selected' : ''}" data-pick="${request.id}:${server.id}" ${reason ? 'disabled' : ''}>
        <span class="rental-server-name"><b>${server.type.name}</b> <small>${place(server)}</small></span>
        <span class="rental-server-free">frei ${storageText(storage.freeOn(server))} von ${storageText(storage.storageOf(server))}</span>
        <span class="rental-server-rent">${reason ? reason : `+${euro.format(storage.rentPerHour(request, server))} / h`}</span>
      </button>`;
  }

  // Speicher-Anfrage: 💾 mit Größe, Auswahl nur unter den NAS
  function storageRequestCard(request, reached) {
    const server = validChoice(request, reached);
    const list = storage.nasDevices;
    const options = list.length
      ? list.map((s) => nasOption(request, s, reached)).join('')
      : '<p class="empty">Noch keine NAS eingebaut – Speicher gibt es nur auf NAS.</p>';
    return `
      <div class="card rental-request storage-request${viaWeb(request) ? ' web-request' : ''}" data-request="${request.id}">
        <div class="card-head">
          <span class="accessory-icon">💾</span>
          <div>
            <div class="card-title">${request.customer} ${webBadge(request)}</div>
            <div class="card-sub">${request.note}</div>
          </div>
        </div>
        <p class="order-note">„Ich möchte gern Speicherplatz mieten – <b>💾 ${storageText(request.storage)}</b>“</p>
        <dl class="specs">
          <dt>Laufzeit</dt><dd>ca. ${realTime(request.duration)} (${Math.round(request.duration / 60)} Spielstunden)</dd>
        </dl>
        <div class="status idle" data-wait>${waitText(request)}</div>
        <div class="rental-servers">${options}</div>
        <div class="card-foot">
          <span class="stock">${server ? `auf ${server.type.name}` : 'NAS wählen'}</span>
          <span class="price">${server ? `${euro.format(storage.rentPerHour(request, server))} / h` : ''}</span>
          <button class="danger" data-decline="${request.id}">Ablehnen</button>
          <button class="buy" data-rent="${request.id}" ${server ? '' : 'disabled'}>Vermieten</button>
        </div>
      </div>`;
  }

  function serverOption(request, server, reached) {
    const reason = rentals.fitsOn(request, server, reached);
    const selected = !reason && chosen.get(request.id) === server.id;
    return `
      <button class="rental-server${selected ? ' selected' : ''}" data-pick="${request.id}:${server.id}" ${reason ? 'disabled' : ''}>
        <span class="rental-server-name"><b>${server.type.name}</b> <small>${place(server)}</small></span>
        <span class="rental-server-free">frei ${rentals.freeRam(server)} GB · ${rentals.freeCores(server)} Cores</span>
        <span class="rental-server-rent">${reason ? reason : `+${euro.format(rentals.rentPerHour(request, server))} / h`}</span>
      </button>`;
  }

  function requestCard(request, list, reached) {
    const server = validChoice(request, reached);
    const options = list.length
      ? list.map((s) => serverOption(request, s, reached)).join('')
      : '<p class="empty">Noch kein Server eingebaut.</p>';
    return `
      <div class="card rental-request${viaWeb(request) ? ' web-request' : ''}" data-request="${request.id}">
        <div class="card-head">
          <span class="accessory-icon">${viaWeb(request) ? '🌐' : '💬'}</span>
          <div>
            <div class="card-title">${request.customer} ${webBadge(request)}</div>
            <div class="card-sub">${request.note}</div>
          </div>
        </div>
        <p class="order-note">„Ich möchte gern einen Server mieten – <b>${request.ram} GB RAM · ${request.cores} Cores</b>“</p>
        <dl class="specs">
          <dt>Laufzeit</dt><dd>ca. ${realTime(request.duration)} (${Math.round(request.duration / 60)} Spielstunden)</dd>
        </dl>
        <div class="status idle" data-wait>${waitText(request)}</div>
        <div class="rental-servers">${options}</div>
        <div class="card-foot">
          <span class="stock">${server ? `auf ${server.type.name}` : 'Server wählen'}</span>
          <span class="price">${server ? `${euro.format(rentals.rentPerHour(request, server))} / h` : ''}</span>
          <button class="danger" data-decline="${request.id}">Ablehnen</button>
          <button class="buy" data-rent="${request.id}" ${server ? '' : 'disabled'}>Vermieten</button>
        </div>
      </div>`;
  }

  function meter(label, used, total, unit) {
    return `
      <div class="rental-meter">
        <span>${label}</span>
        <div class="progress"><div class="bar" style="width:${percent(used, total)}%"></div></div>
        <span>${used} / ${total}${unit}</span>
      </div>`;
  }

  function vmRow(vm, server, online) {
    const danger = !online && vm.offlineFor >= CANCEL_AFTER_OFFLINE * DANGER_SHARE;
    return `
      <li class="rental-vm" data-vm="${vm.id}">
        <span>${vm.auto ? '<span title="automatisch vergeben">🤖</span> ' : ''}${webMark(vm)}<b>${vm.customer}</b></span>
        <span>${vm.ram} GB · ${vm.cores} Cores</span>
        <span>${euro.format(rentals.rentPerHour(vm, server))} / h</span>
        <span data-left>${leftText(vm)}</span>
        ${online ? '' : `<span class="rental-warn${danger ? ' danger' : ''}" data-warn>${warnText(vm)}</span>`}
      </li>`;
  }

  // Speicher-Vertrag in der Liste einer NAS
  function contractRow(contract, server, online) {
    const danger = !online && contract.offlineFor >= CANCEL_AFTER_OFFLINE * DANGER_SHARE;
    return `
      <li class="rental-vm" data-contract="${contract.id}">
        <span>${contract.auto ? '<span title="automatisch vergeben">🤖</span> ' : ''}${webMark(contract)}💾 <b>${contract.customer}</b></span>
        <span>${storageText(contract.storage)}</span>
        <span>${euro.format(storage.rentPerHour(contract, server))} / h</span>
        <span data-left>${leftText(contract)}</span>
        ${online ? '' : `<span class="rental-warn${danger ? ' danger' : ''}" data-warn>${warnText(contract)}</span>`}
      </li>`;
  }

  // NAS: Balken „Speicher: 1,2 / 4,5 TB belegt“ und die Speicher-Verträge – nach einem Plattendefekt (#49) zählt nur
  // der Speicher der heilen Platten, Verträge, die nicht mehr passen, sind offline
  function storageBlock(server, serving) {
    const contracts = storage.contractsOn(server);
    const used = storage.usedOn(server);
    const total = storage.storageOf(server);
    const stranded = storage.strandedOn(server);
    const defect = stranded.length
      ? `<span class="rack-status off">💽 Festplatte defekt – ${stranded.length} ${stranded.length === 1 ? 'Speicher-Vertrag' : 'Speicher-Verträge'} offline, Platte tauschen</span>`
      : '';
    // Mehr vermietet als verfügbar (defekte Platte): orange der Teil, der passt, rot der Überhang – nie über 100 %
    const over = used > total;
    const bar = over
      ? `<div class="bar" style="width:${percent(total, used)}%"></div><div class="bar over" style="width:${100 - percent(total, used)}%"></div>`
      : `<div class="bar" style="width:${percent(used, total)}%"></div>`;
    return `
      <div class="rental-meter storage-meter">
        <span>Speicher</span>
        <div class="progress">${bar}</div>
        <span>${over ? `${storageText(used)} vermietet · <b class="bad">${storageText(total)} verfügbar</b>` : `${storageText(used)} / ${storageText(total)} belegt`}</span>
      </div>
      ${defect}
      ${contracts.length
        ? `<ul class="rental-vms" data-keep-scroll="rental-storage:${server.id}">${contracts.map((c) => contractRow(c, server, serving && !stranded.includes(c))).join('')}</ul>`
        : '<p class="empty">Noch kein Speicher vermietet.</p>'}`;
  }

  function serverCard(server, reached) {
    const why = servers.offlineReason(server, reached);
    const vms = rentals.vmsOn(server);
    const serving = rentals.serves(server, reached); // privat zählt für die VMs wie offline
    const { ram, cores } = rentals.capacity(server); // aus den eingebauten Teilen (core/server-parts.js)
    const nas = !!storage && isNas(server);
    const contracts = nas ? storage.contractsOn(server).length : 0;
    const busy = vms.length + contracts;
    // Summe ohne Speicher-Verträge, die wegen einer defekten Platte offline sind (#49) – die stehen extra daneben
    const rent = rentals.rentOn(server) + (nas ? storage.activeRentOn(server) : 0);
    const lost = nas ? Math.max(0, storage.rentOn(server) - storage.activeRentOn(server)) : 0;
    const counts = `${vms.length} ${vms.length === 1 ? 'VM' : 'VMs'}${nas ? ` · ${contracts} Speicher` : ''}`;
    const scrolls = vms.length > VMS_VISIBLE || contracts > VMS_VISIBLE;
    return `
      <div class="card rental-host${nas ? ' rental-nas' : ''}">
        <div class="card-head">
          <span class="server-icon">${nas ? '💾' : '🖥️'}</span>
          <div>
            <div class="card-title">${server.type.name}</div>
            <div class="card-sub">${place(server)} · Mietfaktor ×${server.type.rentFactor.toLocaleString('de-DE', { minimumFractionDigits: 1 })}${servers.isPrivateDevice?.(server) ? ' · privat, nicht vermietbar' : ''}</div>
          </div>
        </div>
        ${why ? `<span class="rack-status off">offline – ${why}</span>`
          : busy && !serving ? `<span class="rack-status off">online · ${rentals.vmProblem(server, reached)}</span>`
            : '<span class="rack-status on">online</span>'}
        ${meter('RAM', rentals.usedRam(server), ram, ' GB')}
        ${meter('Cores', rentals.usedCores(server), cores, '')}
        ${vms.length
          ? `<ul class="rental-vms" data-keep-scroll="rental-vms:${server.id}">${vms.map((vm) => vmRow(vm, server, serving)).join('')}</ul>`
          : '<p class="empty">Frei – noch keine VM.</p>'}
        ${nas ? storageBlock(server, serving) : ''}
        <div class="card-foot">
          <span class="stock">${counts}${scrolls ? ' <span class="rental-more">· Liste scrollt ↕</span>' : ''}</span>
          <span class="price">${euro.format(rent)} / h${lost > 0.004 ? ` <span class="rental-more">(${euro.format(lost)} / h fallen offline aus)</span>` : ''}</span>
        </div>
      </div>`;
  }

  // Statuszeile der Website (#54): Status und Online-Anfragen heute
  function webLine() {
    if (!website) return '';
    const t = website.stats().today;
    const why = website.state === 'live' ? '' : website.state === 'off' ? ` – ${website.offlineReason() ?? 'kein Website-Server online'}` : website.state === 'setup' ? ' – in der App „Website“ einrichten und veröffentlichen' : '';
    return `<p class="slots rental-web-line">🌐 Website: <strong>${website.stateText}</strong>${why}
      · Online-Anfragen heute: <strong>${t.requests}</strong>, davon angenommen ${t.accepted} · Einnahmen heute ${euro.format(t.income)}</p>`;
  }

  function render() {
    const reached = servers.reachable();
    const list = rentals.rentableServers;
    // VM- und Speicher-Anfragen zusammen, älteste zuerst (alle Kunden warten gleich lange, REQUEST_PATIENCE)
    const all = storage ? [...rentals.requests, ...storage.requests].sort((a, b) => a.waitLeft - b.waitLeft) : rentals.requests;
    const possible = rentals.requestsPossible || !!storage?.requestsPossible;
    const storageLine = storage
      ? ` · 💾 Speicher: <strong>${storage.contracts.length}</strong> (${storageText(storage.rentedTotal)}) · Miete <strong>${euro.format(storage.incomePerHour)} / h</strong>`
      : '';
    const intro = `${autoRow(reached)}
      <p class="slots">☁️ VMs: <strong>${rentals.vms.length}</strong>
        · Miete <strong>${euro.format(rentals.incomePerHour)} / h</strong>${storageLine} · Strom ${euro.format(servers.powerPerHour)} / h
        · Online: ${list.filter((s) => servers.isOnline(s, reached)).length} / ${list.length} Server</p>
      <p class="slots">Kunden kommen mit ihrem Wunsch zum <strong>Empfang</strong>. Wähl für jede Anfrage einen Server mit genug
        freiem RAM und freien Cores und klick auf <strong>Vermieten</strong>. Die Miete kommt jede Spielstunde, solange der
        Server online ist: (${euro.format(RENT_PER_GB)} × GB + ${euro.format(RENT_PER_CORE)} × Cores) × Mietfaktor des Servers.
        ${storage ? `💾 Speicher-Anfragen passen nur auf eine <strong>NAS</strong> mit genug freiem Speicher und bringen
        ${euro.format(RENT_PER_GB_STORAGE * 1000)} je 1.000 GB × Mietfaktor pro Spielstunde. Vermieteter Speicher sperrt das Herausnehmen der Platten.` : ''}
        Ist ein Server zu lange am Stück offline (${realTime(CANCEL_AFTER_OFFLINE)}), kündigt der Kunde.
        ${automation ? 'Läuft ein Server in der orangen Reihe „Private Server“, vergibt er die Anfragen automatisch (🤖) – solange er noch nicht zugegriffen hat, kannst du trotzdem selbst vergeben.' : ''}
        🌐 Ist deine <strong>Website</strong> live (Website-Server online, in der App „Website“ eingerichtet), kommen zusätzlich Online-Anfragen direkt hierher – ohne Kunden am Empfang.</p>${webLine()}`;
    const requests = all.length
      ? `<div class="grid rental-requests">${all.map((r) => (r.kind === 'storage' && storage ? storageRequestCard(r, reached) : requestCard(r, list, reached))).join('')}</div>`
      : `<p class="empty">${possible ? 'Gerade keine Anfragen. Neue Kunden melden sich bald.'
        : 'Noch keine Anfragen – Kunden kommen erst, wenn die zweite Etage steht und ein Server eingebaut ist.'}</p>`;
    const hosts = list.length
      ? `<div class="grid rental-hosts">${list.map((s) => serverCard(s, reached)).join('')}</div>`
      : '<p class="empty">Noch kein Server eingebaut – im Server-Shop kaufen und in einen Schrank einbauen.</p>';
    return `${intro}
      <section><h3>Anfragen <span class="hint">älteste zuerst</span></h3>${requests}</section>
      <section><h3>Server <span class="hint">Auslastung und laufende Verträge</span></h3>${hosts}</section>`;
  }

  // Restzeiten laufen mit, ohne das Fenster neu aufzubauen
  function liveUpdate(container) {
    // Status der automatischen Vergabe (privater Server fällt aus oder kommt online, ohne dass sich Verträge ändern)
    const autoEl = automation && container.querySelector('[data-rental-auto-text]');
    if (autoEl) {
      const { text, on } = autoText();
      if (autoEl.textContent !== text) autoEl.textContent = text;
      autoEl.className = on ? 'on' : '';
    }
    for (const el of container.querySelectorAll('[data-request]')) {
      const request = requestById(idOf(el.dataset.request));
      if (request) el.querySelector('[data-wait]').textContent = waitText(request);
    }
    const rows = [
      ...[...container.querySelectorAll('[data-vm]')].map((el) => [el, rentals.vmById(Number(el.dataset.vm))]),
      ...(storage ? [...container.querySelectorAll('[data-contract]')].map((el) => [el, storage.contractById(el.dataset.contract)]) : []),
    ];
    for (const [el, vm] of rows) {
      if (!vm) continue;
      el.querySelector('[data-left]').textContent = leftText(vm);
      const warn = el.querySelector('[data-warn]');
      if (warn) warn.textContent = warnText(vm);
    }
  }

  // Gibt { message, render } zurück: message für die Erfolgsmeldung (oder null), render = neu zeichnen nötig
  function handleClick(e) {
    if (automation && e.target.closest('[data-rental-auto]')) {
      automation.setEnabled(!automation.enabled);
      return { message: `Automatische Vergabe ${automation.enabled ? 'an' : 'aus'}`, render: true };
    }
    const pick = e.target.closest('[data-pick]')?.dataset.pick;
    if (pick) {
      const [requestId, serverId] = pick.split(':');
      chosen.set(idOf(requestId), Number(serverId));
      return { message: null, render: true };
    }
    const rent = e.target.closest('[data-rent]')?.dataset.rent;
    if (rent) {
      const id = idOf(rent);
      const request = requestById(id);
      const server = economy.furnitureById(chosen.get(id));
      if (!request || !server) return { message: null, render: true };
      const result = marketOf(id).acceptRequest(request.id, server.id);
      chosen.delete(request.id);
      const done = isStorage(id)
        ? `✅ ${storageText(request.storage)} Speicher für ${request.customer} auf ${server.type.name}`
        : `✅ VM für ${request.customer} läuft auf ${server.type.name}`;
      return { message: result.ok ? done : `⚠️ ${result.reason}`, render: true };
    }
    const decline = e.target.closest('[data-decline]')?.dataset.decline;
    if (decline) {
      const id = idOf(decline);
      const request = requestById(id);
      if (request && confirm(`Anfrage von ${request.customer} ablehnen? Der Kunde geht dann.`) && marketOf(id).declineRequest(request.id)) {
        chosen.delete(request.id);
        return { message: `Anfrage von ${request.customer} abgelehnt`, render: true };
      }
    }
    return { message: null, render: false };
  }

  return { render, handleClick, liveUpdate };
}
