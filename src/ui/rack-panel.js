// Schrankfenster (Klick auf einen Serverschrank in der zweiten Etage): alle eingebauten Geräte von oben nach unten mit
// ihren Ports (nur Anzeige: wer woran hängt – gesteckt wird hinten am Schrank, world/server-room.js). Server zeigen,
// ob sie online sind und warum nicht. Freie Höheneinheiten stehen als Lücken dazwischen, ▲ / ▼ verschiebt ein Gerät.
// Geräte lassen sich ausbauen (Karton zurück in den Abstellraum), ein leerer Schrank abbauen.
import { KIND_NAMES, portName } from '../core/server-catalog.js';
import { CABLE_COLOR } from '../models/server-hardware.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// servers: core/servers.js · onClose: Fenster wurde geschlossen (zurück ins Spiel)
export function createRackPanel({ economy, servers, onClose }) {
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

  const isOpen = () => rackId !== null;

  // Port als Anzeige: blau, wenn ein Kabel steckt; Tooltip nennt die Gegenstelle
  function portBadge(device, port) {
    const ref = { id: device.id, port };
    const peer = servers.peerLabel(ref);
    const title = peer ? `Verbunden mit ${peer} (${servers.cableAt(ref).length.toLocaleString('de-DE')} m)` : 'Frei';
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
      </div>`;
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
      <p class="slots">🔌 Kabel im Vorrat: <strong>${servers.cableMeters.toLocaleString('de-DE')} m</strong> · Belegt: ${usedUnits} / ${rack.type.units} HE
        · Online-Server: <strong>${online.length} / ${devices.filter((d) => d.type.kind === 'server').length}</strong>
        · Einnahmen ${euro.format(income)} / h · Strom ${euro.format(power)} / h</p>
      <p class="rack-help">So kommt ein Server ins Internet: <b>Server → Switch → Firewall (LAN)</b> und
        <b>Firewall (WAN) → Patchpanel</b>. Verkabelt wird <b>hinten am Schrank</b>: ersten Port anklicken, dann den
        zweiten. Klick auf einen belegten Port zieht das Kabel ab. Mit ▲ / ▼ ein Gerät im Schrank verschieben.</p>
      ${message ? `<p class="rack-message">${message}</p>` : ''}
      ${rows || '<p class="empty">Noch leer. Gerätekartons aus dem Abstellraum holen, die Glastür öffnen und mit dem Karton in der Hand auf den Schrank klicken.</p>'}
      ${devices.length ? '' : '<button class="secondary" data-remove-rack>Schrank abbauen (Karton zurück in den Abstellraum)</button>'}`;
  }

  root.addEventListener('click', (e) => {
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
  }

  function close() {
    if (!isOpen()) return;
    rackId = null;
    root.classList.add('hidden');
    onClose?.();
  }

  return { open, close, isOpen };
}
