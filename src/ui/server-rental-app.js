// PC-App „Server-Vermietung“: Anfragen der Kunden am Empfang (VM mit RAM und Cores), Serverwahl und Auslastung.
// Der Spieler wählt für jede Anfrage selbst einen Server – oder die privaten Server vergeben automatisch
// (core/rental-automation.js, oben Schalter und Status, 🤖 an automatisch vergebenen VMs). Unpassende Server (offline,
// zu wenig frei, privat) sind ausgegraut mit Grund. Darunter je Server zwei Balken (RAM, Cores) und die laufenden
// Verträge. Die Logik steckt in core/server-rentals.js, hier wird nur angezeigt und weitergereicht.
import { CANCEL_AFTER_OFFLINE, RENT_PER_CORE, RENT_PER_GB } from '../core/server-rentals.js';
import { spotLabel } from '../core/server-zones.js';
import { euro, realTime } from '../core/format.js';

// Ab so viel Offline-Zeit (Anteil an CANCEL_AFTER_OFFLINE) wird die Warnung rot
const DANGER_SHARE = 0.5;
// So viele VM-Zeilen zeigt die Liste einer Server-Karte ohne Scrollen (Höhe von .rental-vms in css/apps.css)
const VMS_VISIBLE = 4;

const percent = (used, total) => Math.min(100, Math.round((used / total) * 100));

// economy: core/economy.js · servers: core/servers.js · rentals: core/server-rentals.js
// automation: core/rental-automation.js (fehlt es, gibt es keinen Schalter für die automatische Vergabe)
export function createServerRentalApp({ economy, servers, rentals, automation = null }) {
  const chosen = new Map(); // Anfrage-ID → gewählte Server-ID (bleibt beim Neuzeichnen erhalten)

  // „Reihe A · Platz 3 · HE 5“ (bzw. „🔒 Privat · Platz 2“ …) – Stellplatz wie im Schrankfenster, damit man gleiche
  // Modelle auseinanderhält und den Schrank im Serverraum findet
  function place(server) {
    const rack = servers.rackOf(server);
    return rack ? `${spotLabel(rack.slot)} · HE ${server.unit + 1}` : 'nicht eingebaut';
  }

  const waitText = (request) => `Wartet noch ca. ${realTime(request.waitLeft)} am Empfang`;
  const leftText = (vm) => `noch ${realTime(vm.minutesLeft)}`;
  // Server privat (läuft, bedient die VM aber nicht) oder offline
  const warnText = (vm) => {
    const server = rentals.serverOf(vm);
    const why = server && servers.isPrivateDevice(server) ? 'privater Server' : 'Server offline';
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

  // Gewählter Server einer Anfrage, nur wenn die VM dort (noch) passt
  function validChoice(request, reached) {
    const server = economy.furnitureById(chosen.get(request.id));
    return server && !rentals.fitsOn(request, server, reached) ? server : null;
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
      <div class="card rental-request" data-request="${request.id}">
        <div class="card-head">
          <span class="accessory-icon">💬</span>
          <div>
            <div class="card-title">${request.customer}</div>
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
        <span>${vm.auto ? '<span title="automatisch vergeben">🤖</span> ' : ''}<b>${vm.customer}</b></span>
        <span>${vm.ram} GB · ${vm.cores} Cores</span>
        <span>${euro.format(rentals.rentPerHour(vm, server))} / h</span>
        <span data-left>${leftText(vm)}</span>
        ${online ? '' : `<span class="rental-warn${danger ? ' danger' : ''}" data-warn>${warnText(vm)}</span>`}
      </li>`;
  }

  function serverCard(server, reached) {
    const why = servers.offlineReason(server, reached);
    const vms = rentals.vmsOn(server);
    const serving = rentals.serves(server, reached); // privat zählt für die VMs wie offline
    const ram = server.type.ram;
    const cores = server.type.cores;
    return `
      <div class="card rental-host">
        <div class="card-head">
          <span class="server-icon">🖥️</span>
          <div>
            <div class="card-title">${server.type.name}</div>
            <div class="card-sub">${place(server)} · Mietfaktor ×${server.type.rentFactor.toLocaleString('de-DE', { minimumFractionDigits: 1 })}${servers.isPrivateDevice?.(server) ? ' · privat, nicht vermietbar' : ''}</div>
          </div>
        </div>
        ${why ? `<span class="rack-status off">offline – ${why}</span>`
          : vms.length && !serving ? `<span class="rack-status off">online · ${rentals.vmProblem(server, reached)}</span>`
            : '<span class="rack-status on">online</span>'}
        ${meter('RAM', rentals.usedRam(server), ram, ' GB')}
        ${meter('Cores', rentals.usedCores(server), cores, '')}
        ${vms.length
          ? `<ul class="rental-vms" data-keep-scroll="rental-vms:${server.id}">${vms.map((vm) => vmRow(vm, server, serving)).join('')}</ul>`
          : '<p class="empty">Frei – noch keine VM.</p>'}
        <div class="card-foot">
          <span class="stock">${vms.length} ${vms.length === 1 ? 'VM' : 'VMs'}${vms.length > VMS_VISIBLE ? ' <span class="rental-more">· Liste scrollt ↕</span>' : ''}</span>
          <span class="price">${euro.format(rentals.rentOn(server))} / h</span>
        </div>
      </div>`;
  }

  function render() {
    const reached = servers.reachable();
    const list = rentals.rentableServers;
    const intro = `${autoRow(reached)}
      <p class="slots">☁️ VMs: <strong>${rentals.vms.length}</strong>
        · Miete <strong>${euro.format(rentals.incomePerHour)} / h</strong> · Strom ${euro.format(servers.powerPerHour)} / h
        · Online: ${list.filter((s) => servers.isOnline(s, reached)).length} / ${list.length} Server</p>
      <p class="slots">Kunden kommen mit ihrem Wunsch zum <strong>Empfang</strong>. Wähl für jede Anfrage einen Server mit genug
        freiem RAM und freien Cores und klick auf <strong>Vermieten</strong>. Die Miete kommt jede Spielstunde, solange der
        Server online ist: (${euro.format(RENT_PER_GB)} × GB + ${euro.format(RENT_PER_CORE)} × Cores) × Mietfaktor des Servers.
        Ist ein Server zu lange am Stück offline (${realTime(CANCEL_AFTER_OFFLINE)}), kündigt der Kunde.
        ${automation ? 'Läuft ein Server in der orangen Reihe „Private Server“, vergibt er die Anfragen automatisch (🤖) – solange er noch nicht zugegriffen hat, kannst du trotzdem selbst vergeben.' : ''}</p>`;
    const requests = rentals.requests.length
      ? `<div class="grid rental-requests">${rentals.requests.map((r) => requestCard(r, list, reached)).join('')}</div>`
      : `<p class="empty">${rentals.requestsPossible ? 'Gerade keine Anfragen. Neue Kunden melden sich bald.'
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
      const request = rentals.requestById(Number(el.dataset.request));
      if (request) el.querySelector('[data-wait]').textContent = waitText(request);
    }
    for (const el of container.querySelectorAll('[data-vm]')) {
      const vm = rentals.vmById(Number(el.dataset.vm));
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
      const [requestId, serverId] = pick.split(':').map(Number);
      chosen.set(requestId, serverId);
      return { message: null, render: true };
    }
    const rent = e.target.closest('[data-rent]')?.dataset.rent;
    if (rent) {
      const request = rentals.requestById(Number(rent));
      const server = economy.furnitureById(chosen.get(Number(rent)));
      if (!request || !server) return { message: null, render: true };
      const result = rentals.acceptRequest(request.id, server.id);
      chosen.delete(request.id);
      return { message: result.ok ? `✅ VM für ${request.customer} läuft auf ${server.type.name}` : `⚠️ ${result.reason}`, render: true };
    }
    const decline = e.target.closest('[data-decline]')?.dataset.decline;
    if (decline) {
      const request = rentals.requestById(Number(decline));
      if (request && confirm(`Anfrage von ${request.customer} ablehnen? Der Kunde geht dann.`) && rentals.declineRequest(request.id)) {
        chosen.delete(request.id);
        return { message: `Anfrage von ${request.customer} abgelehnt`, render: true };
      }
    }
    return { message: null, render: false };
  }

  return { render, handleClick, liveUpdate };
}
