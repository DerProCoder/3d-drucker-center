// PC-App „Server-Shop“: Serverschränke, Server, Switches, Firewalls, Patchpanels und Kabelrollen kaufen. Oben steht,
// was der Serverraum gerade bringt (VMs und Miete aus core/server-rentals.js). Gekauft werden kann erst, wenn die
// zweite Etage steht (dort kommen die Schränke hin).
import { CABLE_ROLL, SERVER_CORES, SERVER_DEVICES, SERVER_RACKS, SERVER_RAM, SERVER_SERIES } from '../core/server-catalog.js';
import { createCableRoll, createServerHardwareModel } from '../models/server-hardware.js';
import { renderPreviews } from './printer-preview.js';
import { euro, meters } from '../core/format.js';
import { AI_FEE_PER_SERVER, isAIServer } from '../core/ai-service.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const ICONS ={ rack: '🗄️', server: '🖥️', switch: '🔀', firewall: '🛡️', patch: '🔌' };
// Eigener Hinweis unter einer Serien-Überschrift, wo der allgemeine („verdienen Geld mit vermieteten VMs“) nicht passt
const SERIES_HINTS = { ai: 'nicht vermietbar – betreiben die eigene KI, Geld über das KI-Abo (App „KI“)' };

// ai: KI-Dienst (core/ai-service.js) für die Kopfzeile (Stufe, rechnende KI-GPU-Server, KI-Abo) – ohne ihn kein KI-Teil
export function createServerShop({ economy, servers, upgrades, rentals, ai = null }) {
  const owned = (type) => servers.hardware.filter((f) => f.type === type).length;
  let images = null; // Produktbilder wie im Drucker-Shop, beim ersten Öffnen erzeugt

  const image = (id, name) => (images.has(id) ? `<img class="product-image" src="${images.get(id)}" alt="${name}">` : '');

  function card(type) {
    const problem = servers.buyProblem(type.price, upgrades.upperFloor, type);
    const specs = [
      type.kind === 'rack' ? `<dt>Platz</dt><dd>${type.units} Höheneinheiten (HE)</dd>` : `<dt>Größe</dt><dd>${type.units} HE</dd>`,
      type.ports ? `<dt>Ports</dt><dd>${type.ports}${type.kind === 'firewall' ? ' (1 × WAN, Rest LAN)' : ''}</dd>` : '',
      type.rentFactor ? `<dt>Ausstattung</dt><dd>${type.ram} GB RAM · ${type.cores} Cores</dd><dt>Mietfaktor</dt><dd>×${type.rentFactor.toLocaleString('de-DE', { minimumFractionDigits: 1 })}</dd>` : '',
      type.rentable === false ? `<dt>Einnahmen</dt><dd>KI-Abo statt Miete: ${euro.format(AI_FEE_PER_SERVER)} / h je Server × Stufenfaktor</dd>` : '',
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
    // Vermietbare Server und KI-GPU-Server getrennt zählen – wie die Server-Vermietung, die nur vermietbare kennt
    const serverList = servers.hardware.filter((f) => f.type.kind === 'server' && !isAIServer(f));
    const aiList = servers.hardware.filter(isAIServer);
    const onlineList = servers.onlineServers;
    // KI-Teil nur mit KI-Dienst (ohne ihn wüsste der Shop weder Stufe noch, welche Server wirklich rechnen)
    const aiText = ai && aiList.length
      ? ` · 🧠 KI: <strong>${ai.level ? `Stufe ${ai.level}` : 'offline'} (${ai.onlineCount} / ${aiList.length} KI-GPU-Server)</strong>`
        + ` · KI-Abo <strong>${euro.format(ai.incomePerHour)} / h</strong>`
      : '';
    const eta = servers.nextCableArrival;
    const cableProblem = servers.buyProblem(CABLE_ROLL.price, upgrades.upperFloor);
    const kinds = (list) => list.map(card).join('');
    return `
      <p class="slots">🖥️ Online: <strong>${onlineList.filter((d) => !isAIServer(d)).length} / ${serverList.length} Server</strong>${aiText}
        · ☁️ VMs: <strong>${rentals.vms.length}</strong>
        · Miete <strong>${euro.format(rentals.incomePerHour)} / h</strong> · Strom ${euro.format(servers.powerPerHour)} / h
        · 🔌 Kabel: ${meters(servers.cableMeters)}${eta !== null ? ` (+${meters(CABLE_ROLL.meters)} in ${Math.ceil(eta)} s)` : ''}</p>
      <p class="slots">Alles kommt als Karton in den Abstellraum (eine Minute Lieferzeit). Schränke trägst du in die zweite Etage
        und stellst sie an einer grünen Markierung auf, Geräte klickst du mit dem Karton in der Hand auf einen Schrank.
        Verkabelt wird hinten am Schrank – ersten Port anklicken, dann den zweiten: <b>Server → Switch → Firewall (LAN)</b>,
        <b>Firewall (WAN) → Patchpanel → Kabelgitter → Internet-Anschluss an der Wand</b> (Firewall-WAN auch direkt).
        Kabel zu einem anderen Schrank oder zur Wand laufen über das Kabelgitter unter der Decke. Jede Verbindung schneidet so viel Kabel von der Rolle ab, wie sie lang ist.</p>
      <p class="slots">💶 Geld bringen Server erst mit <b>vermieteten VMs</b>: Kunden kommen mit ihren Wünschen (RAM und Cores) zum
        Empfang, angenommen wird in der App <b>Server-Vermietung</b>. Jeder Server hat ${SERVER_RAM} GB RAM und ${SERVER_CORES} Cores – teurere Modelle
        haben einen höheren <b>Mietfaktor</b> und bringen für dieselbe VM mehr Miete.</p>
      <section><h3>Serverschränke</h3><div class="grid">${kinds(SERVER_RACKS)}</div></section>
      <section><h3>Server<span class="hint">verdienen Geld mit vermieteten VMs, solange sie online sind</span></h3>
        ${SERVER_SERIES.map((s) => `<h4 class="server-series"${s.color ? ` style="--series:${hex(s.color)}"` : ''}>${s.name}${SERIES_HINTS[s.id] ? `<span class="hint">${SERIES_HINTS[s.id]}</span>` : ''}</h4>
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
