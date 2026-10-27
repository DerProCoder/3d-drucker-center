// Schrankfenster (Klick auf einen Serverschrank in der zweiten Etage): alle eingebauten Geräte von oben nach unten mit
// ihren Ports (nur Anzeige: wer woran hängt – gesteckt wird hinten am Schrank, world/server-room.js). Server zeigen,
// ob sie online sind und warum nicht. Freie Höheneinheiten stehen als Lücken dazwischen, ▲ / ▼ verschiebt ein Gerät.
// Geräte lassen sich ausbauen (Karton zurück in den Abstellraum), ein leerer Schrank abbauen.
// Klima (core/server-climate.js): oben Regler für Zu- und Abluft des Schranks, je Gerät Temperatur und Lüfterregler,
// Reparieren bzw. Neustarten nach Ausfall. Die Temperaturen laufen live mit, ohne das Fenster neu aufzubauen.
import { KIND_NAMES, portName } from '../core/server-catalog.js';
import { TEMP_LIMITS } from '../core/server-climate.js';
import { CABLE_COLOR } from '../models/server-hardware.js';
import { euro, meters } from '../core/format.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const celsius = (t) => `${Math.round(t)} °C`; // Einstufung (climate.level) auch mit dem gerundeten Wert, damit beides passt
const LEVEL_NAMES = { cold: 'zu kalt', cool: 'kühl', ok: 'gut', warm: 'warm', hot: 'zu heiß' };
const CLIMATE_REFRESH_MS = 500;

// servers: core/servers.js · climate: core/server-climate.js · onClose: Fenster wurde geschlossen (zurück ins Spiel)
export function createRackPanel({ economy, servers, climate, onClose }) {
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

  function deviceRow(rack, device, reached) {
    const t = device.type;
    let status = '';
    if (t.kind === 'server') {
      const why = servers.offlineReason(device, reached);
      status = why ? `<span class="rack-status off">offline – ${why}</span>` : `<span class="rack-status on">online · +${euro.format(t.income)} / h</span>`;
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
          <b>${t.name}</b><span class="rack-kind">${KIND_NAMES[t.kind]}</span>
          ${status}
          <span class="rack-move">
            <button class="secondary small" data-move="${device.id}:${up}" title="Nach oben schieben" ${up === -1 ? 'disabled' : ''}>▲</button>
            <button class="secondary small" data-move="${device.id}:${down}" title="Nach unten schieben" ${down === -1 ? 'disabled' : ''}>▼</button>
          </span>
          <button class="secondary small" data-remove="${device.id}">Ausbauen</button>
        </div>
        <div class="rack-ports">${ports}</div>
        ${climateRow(device)}
      </div>`;
  }

  // Temperatur, Lüfterregler und – nach einem Ausfall – Reparieren bzw. Neustarten
  function climateRow(device) {
    if (!climate.hasFan(device)) return '';
    const s = climate.device(device.id);
    let fix = '';
    if (s.status === 'broken') {
      fix = `<button class="small" data-repair="${device.id}">Reparieren (${euro.format(climate.repairCost(device))})</button>`;
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
    return `
      <div class="rack-climate">
        <span>🌡️ Luft im Schrank <b class="rack-temp" data-rack-air></b> · Zuluft <b data-rack-inlet></b>
          · Lüfterstrom <b data-fan-power></b></span>
        ${slider('bottom', '⬇️ Zuluft unten')}
        ${slider('top', '⬆️ Abluft oben')}
      </div>`;
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
    titleEl.textContent = rack.type.name;
    const reached = servers.reachable();
    const devices = servers.devicesIn(rack.id);
    const usedUnits = devices.reduce((sum, d) => sum + d.type.units, 0);
    const online = devices.filter((d) => servers.isOnline(d, reached));
    const income = online.reduce((sum, d) => sum + d.type.income, 0);
    const power = devices.reduce((sum, d) => sum + d.type.power, 0);
    // Geräte und freie Lücken von oben nach unten, damit man sieht, wo noch Platz ist
    const gaps = devices.length ? servers.freeGaps(rack) : [];
    const rows = [
      ...devices.map((d) => ({ unit: d.unit, html: deviceRow(rack, d, reached) })),
      ...gaps.map((g) => ({ unit: g.unit, html: `<div class="rack-gap"><span class="rack-units">${unitLabel(g.unit, g.units)}</span> frei</div>` })),
    ].sort((a, b) => a.unit - b.unit).map((r) => r.html).join('');
    contentEl.innerHTML = `
      <p class="slots">🔌 Kabel im Vorrat: <strong>${meters(servers.cableMeters)}</strong> · Belegt: ${usedUnits} / ${rack.type.units} HE
        · Online-Server: <strong>${online.length} / ${devices.filter((d) => d.type.kind === 'server').length}</strong>
        · Einnahmen ${euro.format(income)} / h · Strom ${euro.format(power)} / h</p>
      <p class="rack-help">So kommt ein Server ins Internet: <b>Server → Switch → Firewall (LAN)</b> und
        <b>Firewall (WAN) → Patchpanel</b>. Verkabelt wird <b>hinten am Schrank</b>: ersten Port anklicken, dann den
        zweiten. Klick auf einen belegten Port zieht das Kabel ab. Mit ▲ / ▼ ein Gerät im Schrank verschieben.
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
    const remove = e.target.closest('[data-remove]')?.dataset.remove;
    if (remove) {
      servers.removeDevice(Number(remove));
      message = 'Gerät ausgebaut – der Karton steht im Abstellraum, die Kabel im Vorrat.';
    }
    const repair = e.target.closest('[data-repair]')?.dataset.repair;
    if (repair) {
      const device = economy.furnitureById(Number(repair));
      const problem = climate.repairProblem(device);
      message = problem ?? `${device.type.name} repariert – jetzt die Lüfter so einstellen, dass es nicht wieder zu heiß wird.`;
      if (!problem) climate.repair(device.id);
    }
    const restart = e.target.closest('[data-restart]')?.dataset.restart;
    if (restart) {
      const device = economy.furnitureById(Number(restart));
      const problem = climate.restartProblem(device);
      message = problem ?? `${device.type.name} läuft wieder.`;
      if (!problem) climate.restart(device.id);
    }
    if (e.target.closest('[data-remove-rack]')) {
      servers.removeRack(rackId);
      close();
      return;
    }
    render();
  });
  economy.subscribe(() => render()); // z. B. Kabel geliefert, Server geht online

  function open(id) {
    rackId = id;
    message = '';
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
