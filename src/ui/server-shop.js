// PC-App „Server-Shop“: Serverschränke, Server, Switches, Firewalls, Patchpanels und Kabelrollen kaufen. Oben steht,
// was der Serverraum gerade bringt. Gekauft werden kann erst, wenn die zweite Etage steht (dort kommen die Schränke hin).
import { CABLE_ROLL, SERVER_DEVICES, SERVER_RACKS, SERVER_SERIES } from '../core/server-catalog.js';
import { createCableRoll, createServerHardwareModel } from '../models/server-hardware.js';
import { renderPreviews } from './printer-preview.js';
import { euro, meters } from '../core/format.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const ICONS ={ rack: '🗄️', server: '🖥️', switch: '🔀', firewall: '🛡️', patch: '🔌' };

export function createServerShop({ economy, servers, upgrades }) {
  const owned = (type) => servers.hardware.filter((f) => f.type === type).length;
  let images = null; // Produktbilder wie im Drucker-Shop, beim ersten Öffnen erzeugt

  const image = (id, name) => (images.has(id) ? `<img class="product-image" src="${images.get(id)}" alt="${name}">` : '');

  function card(type) {
    const problem = servers.buyProblem(type.price, upgrades.upperFloor, type);
    const specs = [
      type.kind === 'rack' ? `<dt>Platz</dt><dd>${type.units} Höheneinheiten (HE)</dd>` : `<dt>Größe</dt><dd>${type.units} HE</dd>`,
      type.ports ? `<dt>Ports</dt><dd>${type.ports}${type.kind === 'firewall' ? ' (1 × WAN, Rest LAN)' : ''}</dd>` : '',
      type.income ? `<dt>Einnahmen</dt><dd>${euro.format(type.income)} / h, solange online</dd>` : '',
      type.power ? `<dt>Strom</dt><dd>${euro.format(type.power)} / h</dd>` : '',
    ].join('');
    return `
      <div class="card">
        ${image(type.id, type.name)}
        <div class="card-head"><span class="server-icon">${ICONS[type.kind]}</span><div class="card-title">${type.name}</div></div>
        <dl class="specs">${specs}</dl>
        <div class="card-foot">
          <span class="stock">Im Besitz: ${owned(type)}</span>
          <span class="price">${euro.format(type.price)}</span>
          ${problem ? `<button class="buy" disabled>${problem}</button>` : `<button class="buy" data-server-buy="${type.id}">Kaufen</button>`}
        </div>
      </div>`;
  }

  function render() {
    images ??= renderPreviews([
      ...[...SERVER_RACKS, ...SERVER_DEVICES].map((t) => ({ id: t.id, name: t.name, make: () => createServerHardwareModel(t) })),
      { id: CABLE_ROLL.id, name: CABLE_ROLL.name, make: createCableRoll },
    ]);
    const serverList = servers.hardware.filter((f) => f.type.kind === 'server');
    const eta = servers.nextCableArrival;
    const cableProblem = servers.buyProblem(CABLE_ROLL.price, upgrades.upperFloor);
    const kinds = (list) => list.map(card).join('');
    return `
      <p class="slots">🖥️ Online: <strong>${servers.onlineServers.length} / ${serverList.length} Server</strong>
        · Einnahmen <strong>${euro.format(servers.incomePerHour)} / h</strong> · Strom ${euro.format(servers.powerPerHour)} / h
        · 🔌 Kabel: ${meters(servers.cableMeters)}${eta !== null ? ` (+${meters(CABLE_ROLL.meters)} in ${Math.ceil(eta)} s)` : ''}</p>
      <p class="slots">Alles kommt als Karton in den Abstellraum (eine Minute Lieferzeit). Schränke trägst du in die zweite Etage
        und stellst sie an einer grünen Markierung auf, Geräte klickst du mit dem Karton in der Hand auf einen Schrank.
        Verkabelt wird hinten am Schrank – ersten Port anklicken, dann den zweiten: <b>Server → Switch → Firewall (LAN)</b>,
        <b>Firewall (WAN) → Patchpanel</b>. Jede Verbindung schneidet so viel Kabel von der Rolle ab, wie sie lang ist.</p>
      <section><h3>Serverschränke</h3><div class="grid">${kinds(SERVER_RACKS)}</div></section>
      <section><h3>Server<span class="hint">verdienen Geld, solange sie online sind</span></h3>
        ${SERVER_SERIES.map((s) => `<h4 class="server-series"${s.color ? ` style="--series:${hex(s.color)}"` : ''}>${s.name}</h4>
          <div class="grid">${kinds(SERVER_DEVICES.filter((d) => d.series === s.id))}</div>`).join('')}</section>
      <section><h3>Netzwerk</h3><div class="grid">${kinds(SERVER_DEVICES.filter((d) => d.kind !== 'server'))}</div></section>
      <section><h3>Kabel</h3><div class="grid">
        <div class="card">
          ${image(CABLE_ROLL.id, CABLE_ROLL.name)}
          <div class="card-head"><span class="server-icon">🔌</span><div class="card-title">${CABLE_ROLL.name}</div></div>
          <dl class="specs"><dt>Wofür</dt><dd>Verbindet Ports im selben Schrank, je nach Abstand und Weg durch die Clips ca. 0,3–2 m pro Kabel</dd><dt>Vorrat</dt><dd>${meters(servers.cableMeters)}</dd></dl>
          <div class="card-foot">
            <span class="stock">kommt direkt in den Vorrat</span>
            <span class="price">${euro.format(CABLE_ROLL.price)}</span>
            ${cableProblem ? `<button class="buy" disabled>${cableProblem}</button>` : '<button class="buy" data-server-cables>Kaufen</button>'}
          </div>
        </div>
      </div></section>`;
  }

  // Gibt den Text für die Erfolgsmeldung zurück oder null
  function handleClick(e) {
    const id = e.target.closest('[data-server-buy]')?.dataset.serverBuy;
    const type = [...SERVER_RACKS, ...SERVER_DEVICES].find((t) => t.id === id);
    if (type && !servers.buyProblem(type.price, upgrades.upperFloor, type) && servers.buyHardware(type)) {
      return `${type.name} bestellt – kommt in ${economy.deliverySeconds} s in den Abstellraum`;
    }
    if (e.target.closest('[data-server-cables]') && !servers.buyProblem(CABLE_ROLL.price, upgrades.upperFloor) && servers.buyCables()) {
      return `${CABLE_ROLL.name} bestellt – in ${economy.deliverySeconds} s im Vorrat`;
    }
    return null;
  }

  return { render, handleClick };
}
