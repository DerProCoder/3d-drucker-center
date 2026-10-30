// Schrankfenster (Klick auf einen Serverschrank in der zweiten Etage): alle eingebauten Geräte von oben nach unten mit
// ihren Ports (nur Anzeige: wer woran hängt – gesteckt wird hinten am Schrank, world/server-room.js). Server zeigen,
// ob sie online sind und warum nicht. Freie Höheneinheiten stehen als Lücken dazwischen, ▲ / ▼ verschiebt ein Gerät.
// Geräte lassen sich ausbauen (Karton zurück in den Abstellraum; laufen auf einem Server VMs, erst nach einem zweiten
// Klick), ein leerer Schrank abbauen. Die Kopfzeile nennt den Stellplatz (Reihe A/B, 🔒 Privat · 🤖 Vergabe-Server,
// 🌡️ Automatik-Platz).
// Klima (core/server-climate.js): oben Regler für Zu- und Abluft des Schranks, je Gerät Temperatur und Lüfterregler,
// Reparieren bzw. Neustarten nach Ausfall. Die Temperaturen laufen live mit, ohne das Fenster neu aufzubauen.
// Server zeigen ihre Ausstattung aus den Bauteilen (Cores / RAM, core/server-parts.js über servers.capacityOf); ist nach
// Überhitzung ein Teil defekt, steht es im Status („Lüfter defekt“) – selbst tauschen oder den Techniker rufen.
// NAS (core/nas.js) zeigen Cores, RAM / max. RAM, Speicher und belegte Schächte; Platten tauscht man direkt im Schrank.
// Eine defekte Platte legt die NAS nicht lahm (#49): Die Zeile nennt sie und die Speicher-Verträge, die offline sind.
// Klima-Automatik (core/climate-automation.js): Kopfzeile nennt den regelnden Automatik-Server, Schalter „Automatik an/aus“.
// Regelt sie, bewegen sich die Regler von selbst; wer einen anfasst, bekommt einen Hinweis – sie übernimmt gleich wieder.
import { KIND_NAMES, portName } from '../core/server-catalog.js';
import { TEMP_LIMITS } from '../core/server-climate.js';
import { CANCEL_AFTER_OFFLINE } from '../core/server-rentals.js';
import { BUNKER_RENT_FACTOR, isBunkerRack, isPrivateRowRack, spotLabel } from '../core/server-zones.js';
import { CABLE_COLOR } from '../models/server-hardware.js';
import { euro, meters } from '../core/format.js';
import { isNas, storageText } from '../core/nas.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const celsius = (t) => `${Math.round(t)} °C`; // Einstufung (climate.level) auch mit dem gerundeten Wert, damit beides passt
const LEVEL_NAMES = { cold: 'zu kalt', cool: 'kühl', ok: 'gut', warm: 'warm', hot: 'zu heiß' };
const CLIMATE_REFRESH_MS = 500;

// servers: core/servers.js · climate: core/server-climate.js · onClose: Fenster wurde geschlossen (zurück ins Spiel)
// rentals: core/server-rentals.js (VMs je Server; fehlt es, zeigt das Fenster nur die Miete über servers.rentOf)
// automation: core/climate-automation.js (fehlt es, gibt es keine Automatik-Anzeige)
// ai: KI-Dienst (core/ai-service.js) – KI-GPU-Server zeigen damit, ob sie für die KI rechnen (überhitzt: nein)
// nas: core/nas.js (Nas) – NAS zeigen Speicher und Schächte („32 Cores · 256 / 512 GB RAM · 2,5 TB Speicher · 2 / 4 Schächte“)
export function createRackPanel({ economy, servers, climate, automation = null, rentals = null, ai = null, nas = null, onClose }) {
  const root = document.createElement('div');
  root.id = 'rack-panel';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="shop-window rack-window" role="dialog">
      <div class="shop-titlebar">
        <span class="shop-title"></span>
        <button class="shop-close" aria-label="Schließen">✕</button>
      </div>
      <div class="shop-content"></div>
    </div>`;
  document.body.appendChild(root);
  const titleEl = root.querySelector('.shop-title');
  const contentEl = root.querySelector('.shop-content');
  let rackId = null;
  let message = '';    // Rückmeldung unter der Kopfzeile
  let confirmRemove = null; // Server mit VMs, dessen „Ausbauen“ einmal geklickt wurde (zweiter Klick baut aus)
  let refreshTimer = null;

  const isOpen = () => rackId !== null;

  // Port als Anzeige: blau, wenn ein Kabel steckt; Tooltip nennt die Gegenstelle
  function portBadge(device, port) {
    const ref = { id: device.id, port };
    const peer = servers.peerLabel(ref);
    const title = peer ? `Verbunden mit ${peer} (${meters(servers.cableAt(ref).length)})` : 'Frei';
    return `<span class="rack-port${peer ? ' cabled' : ''}${device.type.kind === 'firewall' && port === 0 ? ' wan' : ''}"
      title="${title}" ${peer ? `style="--cable:${hex(CABLE_COLOR)}"` : ''}>${portName(device.type, port)}</span>`;
  }

  const unitLabel = (unit, units) => (units > 1 ? `HE ${unit + 1}–${unit + units}` : `HE ${unit + 1}`);

  // Nächste Höheneinheit oberhalb (dir −1) bzw. unterhalb (dir +1), an die das Gerät passt – auch über andere
  // Geräte hinweg in die nächste Lücke –, oder −1
  function moveTarget(rack, device, dir) {
    for (let u = device.unit + dir; u >= 0 && u + device.type.units <= rack.type.units; u += dir) {
      if (servers.unitFits(rack, u, device.type.units, device.id)) return u;
    }
    return -1;
  }

  // Belegung eines Servers durch VMs: „3 VMs · RAM 96/512 GB · Cores 12/64 · +4,80 € / h“ bzw. „frei, keine VM“
  function vmText(server, online) {
    const t = server.type;
    if (t.rentable === false) return online ? (t.web ? '🌐 betreibt die Website' : '🧠 rechnet für die KI (KI-Abo)') : ''; // KI-GPU- und Website-Server: keine VMs
    const rent = `+${euro.format(servers.rentOf(server))} / h`;
    if (!rentals) return online ? `${rent} Miete` : '';
    const vms = rentals.vmsOn(server).length;
    if (!vms) return online ? (servers.isPrivateDevice(server) ? 'privat' : 'frei, keine VM') : '';
    const cap = servers.capacityOf(server);
    const usage = `${vms} ${vms === 1 ? 'VM' : 'VMs'} · RAM ${rentals.usedRam(server)}/${cap.ram} GB · Cores ${rentals.usedCores(server)}/${cap.cores}`;
    return online ? `${usage} · ${rent}` : ` · ${usage} – Kunden kündigen bei zu langem Ausfall`;
  }

  function deviceRow(rack, device, reached) {
    const t = device.type;
    let status = '';
    // Ausstattung aus den Bauteilen, z. B. „Server · 128 Cores · 1024 GB“
    const cap = t.kind === 'server' ? servers.capacityOf(device) : null;
    const nasInfo = nas && isNas(device) ? nas.summary(device) : null;
    const kindText = nasInfo ? `NAS · ${nasText(nasInfo)}` : cap ? `${KIND_NAMES[t.kind]} · ${cap.cores} Cores · ${cap.ram} GB` : KIND_NAMES[t.kind];
    if (t.kind === 'server') {
      const why = servers.offlineReason(device, reached);
      // Server mit VMs in einem privaten Schrank: läuft, aber die Kunden zahlen nicht und kündigen (core/server-rentals.js)
      const privateVms = !why && servers.isPrivateDevice(device) ? rentals?.vmsOn(device).length : 0;
      // KI-GPU-Server online, aber überhitzt: die GPUs drosseln, er zählt nicht für die KI (core/ai-service.js)
      const aiProblem = !why && t.rentable === false && !t.web ? ai?.problemOf(device, reached) : null;
      if (aiProblem) status = `<span class="rack-status off">online · ⚠️ ${aiProblem} – rechnet nicht für die KI</span>`;
      else if (why) status = `<span class="rack-status off">offline – ${why}${vmText(device, false)}</span>`;
      else if (privateVms) {
        status = `<span class="rack-status off">online · ${rentals.vmProblem(device, reached)}
          (${privateVms} ${privateVms === 1 ? 'VM' : 'VMs'}, keine Miete)</span>`;
      }
      else status = `<span class="rack-status on">online · ${vmText(device, true)}</span>`;
    } else if (climate.problem(device)) {
      status = `<span class="rack-status off">${climate.problem(device)}</span>`;
    }
    const ports = Array.from({ length: t.ports }, (_, i) => portBadge(device, i)).join('');
    const up = moveTarget(rack, device, -1);
    const down = moveTarget(rack, device, 1);
    return `
      <div class="rack-device ${t.kind}" style="--units:${t.units}">
        <div class="rack-device-head">
          <span class="rack-units">${unitLabel(device.unit, t.units)}</span>
          <b>${t.name}</b><span class="rack-kind">${kindText}</span>
          ${status}
          <span class="rack-move">
            <button class="secondary small" data-move="${device.id}:${up}" title="Nach oben schieben" ${up === -1 ? 'disabled' : ''}>▲</button>
            <button class="secondary small" data-move="${device.id}:${down}" title="Nach unten schieben" ${down === -1 ? 'disabled' : ''}>▼</button>
          </span>
          ${confirmRemove === device.id
            ? `<button class="secondary small danger" data-remove="${device.id}">Wirklich ausbauen?</button>`
            : `<button class="secondary small" data-remove="${device.id}">Ausbauen</button>`}
        </div>
        <div class="rack-ports">${ports}</div>
        ${nasInfo ? nasRow(device, nasInfo) : ''}
        ${climateRow(device)}
      </div>`;
  }

  // Ausstattung einer NAS: „32 Cores · 256 / 512 GB RAM · 2,5 TB Speicher · 2 / 4 Schächte“
  function nasText(s) {
    return `${s.cores} Cores · ${s.ram} / ${s.maxRam} GB RAM · ${storageText(s.storage)} Speicher · ${s.usedBays} / ${s.bays} Schächte`;
  }

  // Platten der NAS: vermieteter Speicher, defekte Platten (fallen nur selbst aus, #49 – betroffene Speicher-Verträge
  // sind offline) und wie man Platten tauscht (direkt im Schrank, world/server-room.js)
  function nasRow(device, s) {
    const stock = nas.diskStock.reduce((sum, d) => sum + d.count, 0);
    const broken = s.brokenDisks;
    const used = s.used ? ` · ${storageText(s.used)} vermietet, ${storageText(s.free)} frei` : '';
    const offline = s.stranded
      ? `${s.stranded} ${s.stranded === 1 ? 'Speicher-Vertrag' : 'Speicher-Verträge'} offline (passen nicht auf die heilen Platten, keine Miete)`
      : 'NAS läuft weiter';
    const defect = broken ? ` · <b class="bad">${broken} ${broken === 1 ? 'Platte' : 'Platten'} defekt (${storageText(s.brokenStorage)} fehlen) – ${offline}; herausnehmen und ersetzen</b>` : '';
    return `
      <div class="rack-nas">💽 ${storageText(s.storage)} in ${s.usedBays} / ${s.bays} Schächten${used}${defect}
        <span class="rack-nas-help">Festplatten tauschen: Glastür öffnen und vorn auf einen Schacht klicken – leer: größte
        Platte aus dem Teilelager (${stock ? `${stock} im Lager` : 'keine im Lager – im Teile-Shop kaufen'}), voll: herausnehmen.</span></div>`;
  }

  // Temperatur, Lüfterregler und – nach einem Ausfall – Reparieren bzw. Neustarten
  function climateRow(device) {
    if (!climate.hasFan(device)) return '';
    const s = climate.device(device.id);
    let fix = '';
    if (climate.needsRepair(device)) {
      // Server: das defekte Teil lässt sich auch selbst tauschen (Teile-Shop, Werkbank) – der Techniker ist teurer.
      // Auch bei einer NAS, die nur eine defekte Platte hat und weiterläuft (#49)
      const part = device.type.kind === 'server' ? climate.brokenPart(device) ?? (s.status === 'broken' ? null : 'Festplatte') : null;
      fix = `<button class="small" data-repair="${device.id}" title="${part ? `${part} defekt – selbst tauschen oder den Techniker rufen` : 'Techniker repariert das Gerät'}">`
        + `Techniker rufen (${euro.format(climate.repairCost(device))})</button>`;
      // NAS mit nur defekter Platte kann zusätzlich eingefroren sein (#49): dann auch neu starten
      if (s.status === 'frozen' && !climate.restartProblem(device)) fix += ` <button class="small" data-restart="${device.id}">Neu starten</button>`;
    } else if (s.status === 'frozen') {
      fix = `<button class="small" data-restart="${device.id}">Neu starten</button>`;
    }
    return `
      <div class="rack-climate-row">
        <span class="rack-temp" data-temp="${device.id}"></span>
        <label class="rack-fan">🌀 Lüfter
          <input type="range" min="0" max="100" step="5" value="${s.fan}" data-fan="${device.id}">
          <span class="rack-fan-value">${s.fan} %</span>
        </label>
        ${fix}
      </div>`;
  }

  // Kopf mit Schrankluft und den beiden Schranklüftern
  function rackClimate(rack) {
    const r = climate.rack(rack.id);
    const slider = (which, label) => `
      <label class="rack-fan">${label}
        <input type="range" min="0" max="100" step="5" value="${r[which]}" data-rack-fan="${which}">
        <span class="rack-fan-value">${r[which]} %</span>
      </label>`;
    const auto = automation ? `
      <div class="rack-auto">
        <span data-auto-text></span>
        <button class="secondary small" data-auto-toggle>${automation.isAuto(rack.id) ? 'Automatik aus' : 'Automatik an'}</button>
      </div>` : '';
    return `
      <div class="rack-climate">
        ${auto}
        <span>🌡️ Luft im Schrank <b class="rack-temp" data-rack-air></b> · Zuluft <b data-rack-inlet></b>
          · Lüfterstrom <b data-fan-power></b></span>
        ${slider('bottom', '⬇️ Zuluft unten')}
        ${slider('top', '⬆️ Abluft oben')}
        <p class="rack-message" data-auto-hint hidden>Automatik ist an – zum Selbstregeln ausschalten.
          Sie übernimmt in der nächsten Spielminute wieder.</p>
      </div>`;
  }

  // Zeile zur Klima-Automatik: wer regelt, oder warum nicht
  function autoText(rack) {
    if (!automation.isAuto(rack.id)) return { text: '✋ Automatik aus – du regelst die Lüfter selbst', on: false };
    const server = automation.controllerOf(rack.id);
    if (server) {
      const home = servers.rackOf(server);
      return { text: `🌡️ Automatik (über ${server.type.name}, ${spotLabel(home.slot).replace('🌡️ ', '')})`, on: true };
    }
    const why = automation.serverCount ? '' : ' – Server in einen Schrank auf einem grünen Platz einbauen und online bringen';
    return { text: `Keine Automatik – zu wenige Automatik-Server${why}`, on: false };
  }

  // Regler auf den aktuellen Wert stellen (die Automatik bewegt sie) – nicht, solange man ihn gerade zieht
  function syncSlider(input, value) {
    if (input.matches(':active') || Number(input.value) === value) return;
    input.value = value;
    input.nextElementSibling.textContent = `${value} %`;
  }

  // Temperaturen im offenen Fenster auffrischen (ohne Neuaufbau, damit die Regler bedienbar bleiben)
  function refreshClimate() {
    if (!isOpen()) return;
    const r = climate.rack(rackId);
    const air = contentEl.querySelector('[data-rack-air]');
    if (air) {
      air.textContent = celsius(r.air);
      air.className = `rack-temp ${climate.level(Math.round(r.air))}`;
      contentEl.querySelector('[data-rack-inlet]').textContent = celsius(r.inlet);
      contentEl.querySelector('[data-fan-power]').textContent = `${euro.format(climate.rackFanPower(rackId))} / h`;
    }
    const autoEl = contentEl.querySelector('[data-auto-text]');
    if (autoEl) {
      const { text, on } = autoText(economy.furnitureById(rackId));
      autoEl.textContent = text;
      autoEl.className = on ? 'on' : '';
    }
    for (const el of contentEl.querySelectorAll('[data-rack-fan]')) syncSlider(el, r[el.dataset.rackFan]);
    for (const el of contentEl.querySelectorAll('[data-fan]')) syncSlider(el, climate.device(Number(el.dataset.fan)).fan);
    for (const el of contentEl.querySelectorAll('[data-temp]')) {
      const temp = Math.round(climate.device(Number(el.dataset.temp)).temp);
      const level = climate.level(temp);
      el.textContent = `${celsius(temp)} · ${LEVEL_NAMES[level]}`;
      el.className = `rack-temp ${level}`;
    }
  }

  function render() {
    if (!isOpen()) return;
    const rack = economy.furnitureById(rackId);
    if (!rack || rack.location !== 'server') {
      close();
      return;
    }
    // Orange Reihe: die Server darin vergeben VM-Anfragen automatisch (core/rental-automation.js); im Daten-Bunker
    // (Keller, #52) bringt jede Miete ×1,5
    const bunkerText = (r) => (isBunkerRack(r) ? ` · 🛡️ Daten-Bunker ×${BUNKER_RENT_FACTOR.toLocaleString('de-DE', { minimumFractionDigits: 1 })}` : '');
    titleEl.textContent = `${rack.type.name} · ${spotLabel(rack.slot)}${isPrivateRowRack(rack) ? ' · 🤖 Vergabe-Server' : ''}${bunkerText(rack)}`;
    const reached = servers.reachable();
    const devices = servers.devicesIn(rack.id);
    const usedUnits = devices.reduce((sum, d) => sum + d.type.units, 0);
    const online = devices.filter((d) => servers.isOnline(d, reached));
    // Miete der VMs (core/server-rentals.js) – nur von Servern, die ihre VMs gerade bedienen (nicht privat)
    const income = online.filter((d) => !rentals || rentals.serves(d, reached)).reduce((sum, d) => sum + servers.rentOf(d), 0);
    const power = devices.reduce((sum, d) => sum + servers.powerOf(d), 0);
    const vmCount = rentals ? devices.reduce((sum, d) => sum + (d.type.kind === 'server' ? rentals.vmsOn(d).length : 0), 0) : null;
    // Geräte und freie Lücken von oben nach unten, damit man sieht, wo noch Platz ist
    const gaps = devices.length ? servers.freeGaps(rack) : [];
    const rows = [
      ...devices.map((d) => ({ unit: d.unit, html: deviceRow(rack, d, reached) })),
      ...gaps.map((g) => ({ unit: g.unit, html: `<div class="rack-gap"><span class="rack-units">${unitLabel(g.unit, g.units)}</span> frei</div>` })),
    ].sort((a, b) => a.unit - b.unit).map((r) => r.html).join('');
    contentEl.innerHTML = `
      <p class="slots">🔌 Kabel im Vorrat: <strong>${meters(servers.cableMeters)}</strong> · Belegt: ${usedUnits} / ${rack.type.units} HE
        · Online-Server: <strong>${online.length} / ${devices.filter((d) => d.type.kind === 'server').length}</strong>
        ${vmCount !== null ? `· VMs: <strong>${vmCount}</strong> ` : ''}· Miete ${euro.format(income)} / h · Strom ${euro.format(power)} / h</p>
      <p class="rack-help">So kommt ein Server ins Internet: <b>Server → Switch → Firewall (LAN)</b> und
        <b>Firewall (WAN) → Patchpanel → Kabelgitter → Internet-Anschluss an der Wand</b> (die Firewall-WAN darf auch
        direkt an die Wand). Verkabelt wird <b>hinten am Schrank</b>: ersten Port anklicken, dann den zweiten. Kabel zu
        einem anderen Schrank oder zur Wand laufen über das <b>Kabelgitter oben</b> – dazwischen die Gitterfelder für
        den Weg anklicken. Klick auf einen belegten Port zieht das Kabel ab. Mit ▲ / ▼ ein Gerät im Schrank verschieben.
        <b>Temperatur:</b> gut sind ${TEMP_LIMITS.idealMin}–${TEMP_LIMITS.idealMax} °C. Über ${TEMP_LIMITS.hot} °C geht ein Gerät
        irgendwann kaputt, unter ${TEMP_LIMITS.cold} °C friert es ein. Zuluft unten kühlt den ganzen Schrank, Abluft oben zieht
        die Wärme ab (oben wird es am wärmsten), jedes Gerät hat dazu einen eigenen Lüfter.</p>
      ${rackClimate(rack)}
      ${message ? `<p class="rack-message">${message}</p>` : ''}
      ${rows || '<p class="empty">Noch leer. Gerätekartons aus dem Abstellraum holen, die Glastür öffnen und mit dem Karton in der Hand auf den Schrank klicken.</p>'}
      ${devices.length ? '' : '<button class="secondary" data-remove-rack>Schrank abbauen (Karton zurück in den Abstellraum)</button>'}`;
    refreshClimate();
  }

  // Lüfterregler: Wert sofort übernehmen, ohne das Fenster neu aufzubauen (sonst reißt das Ziehen ab)
  root.addEventListener('input', (e) => {
    const input = e.target;
    if (input.dataset.fan) climate.setDeviceFan(Number(input.dataset.fan), input.value);
    else if (input.dataset.rackFan) climate.setRackFan(rackId, input.dataset.rackFan, input.value);
    else return;
    input.nextElementSibling.textContent = `${input.value} %`;
    // Regelt gerade die Automatik, holt sie den Regler gleich zurück – darauf hinweisen
    const hint = contentEl.querySelector('[data-auto-hint]');
    if (hint) hint.hidden = !automation?.isControlled(rackId);
    refreshClimate();
  });

  root.addEventListener('click', (e) => {
    if (e.target.matches('input')) return;
    if (e.target.closest('.shop-close')) {
      close();
      return;
    }
    const move = e.target.closest('[data-move]')?.dataset.move;
    if (move) {
      const [id, unit] = move.split(':').map(Number);
      message = servers.moveDevice(id, unit) ? '' : 'Zu wenig Kabel im Vorrat, um die Kabel zu verlängern.';
    }
    const remove = Number(e.target.closest('[data-remove]')?.dataset.remove);
    const vms = remove && rentals ? rentals.vmsOn(economy.furnitureById(remove)).length : 0;
    if (remove && vms && confirmRemove !== remove) {
      // Erster Klick auf einen Server mit VMs: nur warnen, der zweite Klick baut aus
      confirmRemove = remove;
      message = `⚠️ Läuft: ${vms} ${vms === 1 ? 'VM' : 'VMs'} – Kunden kündigen nach ${CANCEL_AFTER_OFFLINE / 60} Spielstunden
        ohne Server. Zum Ausbauen noch einmal klicken.`;
      render();
      return;
    }
    confirmRemove = null;
    if (remove) {
      const removed = economy.furnitureById(remove);
      servers.removeDevice(remove);
      // Server: auf der Werkbank im Serverraum lassen sich Teile tauschen, auf- und abrüsten (world/workbench.js)
      message = removed?.type.kind === 'server'
        ? 'Server ausgebaut – der Karton steht im Abstellraum, die Kabel im Vorrat – auf der Werkbank (Südwand) Teile tauschen.'
        : 'Gerät ausgebaut – der Karton steht im Abstellraum, die Kabel im Vorrat.';
    }
    const repair = e.target.closest('[data-repair]')?.dataset.repair;
    if (repair) {
      const device = economy.furnitureById(Number(repair));
      const problem = climate.repairProblem(device);
      message = problem ?? `Der Techniker hat ${device.type.name} repariert – jetzt die Lüfter so einstellen, dass es nicht wieder zu heiß wird.`;
      if (!problem) climate.repair(device.id);
    }
    const restart = e.target.closest('[data-restart]')?.dataset.restart;
    if (restart) {
      const device = economy.furnitureById(Number(restart));
      const problem = climate.restartProblem(device);
      message = problem ?? `${device.type.name} läuft wieder.`;
      if (!problem) climate.restart(device.id);
    }
    if (e.target.closest('[data-auto-toggle]')) {
      const on = !automation.isAuto(rackId);
      automation.setAuto(rackId, on);
      message = on ? 'Klima-Automatik für diesen Schrank eingeschaltet.' : 'Automatik aus – die Lüfter bleiben, wie sie sind, bis du sie selbst verstellst.';
    }
    if (e.target.closest('[data-remove-rack]')) {
      servers.removeRack(rackId);
      close();
      return;
    }
    render();
  });
  economy.subscribe(() => render()); // z. B. Kabel geliefert, Server geht online
  rentals?.subscribe(() => render()); // VM vermietet, Vertrag ausgelaufen oder gekündigt
  ai?.subscribe(() => render()); // KI-GPU-Server rechnet wieder bzw. nicht mehr (z. B. überhitzt)

  function open(id) {
    rackId = id;
    message = '';
    confirmRemove = null;
    root.classList.remove('hidden');
    render();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshClimate, CLIMATE_REFRESH_MS);
  }

  function close() {
    if (!isOpen()) return;
    rackId = null;
    clearInterval(refreshTimer);
    root.classList.add('hidden');
    onClose?.();
  }

  return { open, close, isOpen };
}
