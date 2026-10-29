// PC-App „Teile-Shop“: Server-Bauteile kaufen (CPUs, RAM-Riegel, Mainboards, Netzteile, Lüfter … – Katalog und
// Teilearten aus core/server-parts.js, neue Teilearten erscheinen automatisch als eigener Abschnitt). Oben stehen das
// Teilelager, ein Paket unterwegs und die Server mit defektem Teil („… : Lüfter defekt → Lüfter kaufen“) oder fehlendem
// Pflichtteil („unvollständig – Netzteil fehlt → Netzteil kaufen“).
// Bestellt wird mit Menge je Karte; alles kommt gesammelt als ein Paket nach economy.deliverySeconds direkt ins
// Teilelager. Gekauft werden kann erst, wenn die zweite Etage (Serverraum) steht. Die Logik steckt in
// core/server-parts.js, hier wird nur angezeigt und weitergereicht.
import { PART_KINDS, SERVER_PARTS, SLOT_SETS, partById, partKindById, partsOfKind, slotSetOf } from '../core/server-parts.js';
import { spotLabel } from '../core/server-zones.js';
import { euro } from '../core/format.js';
import { createPartPreview } from '../models/server-parts.js';
import { renderPreviews } from './printer-preview.js';

const MAX_QTY = 32; // höchstens so viele Stück je Bestellung und Teil (16 RAM-Plätze × 2 Server)
const ICONS = { board: '🧩', cpu: '🔲', ram: '🎞️', psu: '🔋', fan: '🌀', disk: '💽' };
// Werte eines Teils als Text (Teileart → values in core/server-parts.js)
const VALUE_TEXT = { cores: (n) => `${n} Cores`, ram: (n) => `${n} GB`, storage: (n) => (n >= 1024 ? `${+(n / 1024).toFixed(1)} TB` : `${n} GB`) };
const VALUE_LABEL = { cores: 'Cores', ram: 'Größe', storage: 'Speicher' };
// Variante für das 3D-Modell (models/server-parts.js createServerPart): Cores, GB …
const PREVIEW_VARIANT = { cpu: (p) => p.cores, ram: (p) => p.ram, disk: (p) => p.gb ?? p.storage ?? p.capacity };
// RAM-Riegel sind lang und schmal und wirken im Produktbild klein: Bild in der Karte vergrößert zeigen (css/parts-shop.css)
const ZOOMED = ['ram'];

// Steckplätze und Höchstwert eines normalen Servers je Teileart (Zeilen im Datenblatt der Karte)
const SERVER_SET = SLOT_SETS.server;
function fitRows(kind) {
  // Festplatten passen nur in die Schächte der NAS (#46): „nur NAS: 4 / 12 Schächte“, eingesetzt direkt im Schrank
  if (kind === 'disk') {
    const bays = [...new Set(Object.values(SLOT_SETS).map((s) => s.slots.disk).filter(Boolean))].sort((a, b) => a - b);
    return `<dt>Passt in</dt><dd>nur NAS: ${bays.join(' / ')} Schächte</dd><dt>Einbau</dt><dd>im Schrank: Glastür auf, auf einen leeren Schacht klicken</dd>`;
  }
  const n = SERVER_SET.slots[kind];
  if (!n) return '';
  const max = kind === 'cpu' ? `${SERVER_SET.max.cores} Cores` : kind === 'ram' ? `${SERVER_SET.max.ram} GB` : '';
  return `<dt>Steckplätze</dt><dd>${n} je Server</dd>${max ? `<dt>Max. je Server</dt><dd>${max}</dd>` : ''}`;
}

// economy: core/economy.js · servers: core/servers.js · serverParts: core/server-parts.js (ServerParts)
// upgrades: core/upgrades.js (zweite Etage)
export function createPartsShop({ economy, servers, serverParts, upgrades }) {
  const quantity = new Map(); // Teile-ID → gewählte Menge (bleibt beim Neuzeichnen erhalten)
  let images = null; // Produktbilder, beim ersten Öffnen erzeugt

  const qtyOf = (id) => quantity.get(id) ?? 1;
  const problemFor = (id, n) => serverParts.orderProblem({ [id]: n }, upgrades.upperFloor);
  const image = (part) => (images.has(part.id)
    ? `<div class="parts-image${ZOOMED.includes(part.kind) ? ' zoomed' : ''}"><img class="product-image" src="${images.get(part.id)}" alt="${part.name}"></div>`
    : '');
  const countText = (n) => `${n} ${n === 1 ? 'Teil' : 'Teile'}`;

  // „Reihe A · Platz 3 · HE 5“ – wie in der Server-Vermietung, damit man gleiche Modelle auseinanderhält
  function place(device) {
    const rack = servers.rackOf(device);
    if (device.location === 'bench') return 'auf der Werkbank';
    return rack ? `${spotLabel(rack.slot)} · HE ${device.unit + 1}` : 'nicht eingebaut';
  }

  // Teilelager als kleine Schildchen, darunter ein Paket unterwegs
  function stockOverview() {
    const list = serverParts.stockList;
    const chips = list.length
      ? list.map(({ part, count }) => `<span class="parts-chip">${ICONS[part.kind] ?? '⚙️'} ${count} × ${part.name}</span>`).join('')
      : '<span class="parts-empty">leer – gekaufte und ausgebaute Teile landen hier</span>';
    const eta = serverParts.nextArrival;
    const coming = serverParts.deliveries.reduce((sum, d) => sum + Object.values(d.items).reduce((a, b) => a + b, 0), 0);
    const delivery = eta !== null
      ? `<p class="parts-delivery">📦 Paket unterwegs: <strong>${countText(coming)}</strong> · kommt in ${Math.ceil(eta)} s</p>`
      : '';
    return `
      <div class="parts-box">
        <div class="parts-box-head">🗃️ Teilelager <span class="hint">${countText(serverParts.stockCount)}</span></div>
        <div class="parts-chips">${chips}</div>
        ${delivery}
      </div>`;
  }

  // Teil, das man für einen fehlenden Pflichtteil kauft: das der Standardausstattung, sonst das erste der Art
  function partForMissing(device, kind) {
    const standard = slotSetOf(device)?.standard[kind]?.find(Boolean);
    return partById(standard) ?? partsOfKind(kind)[0] ?? null;
  }

  // Server mit defektem oder fehlendem Pflichtteil: je Teil eine Zeile mit Kaufknopf (bzw. Hinweis, wenn es schon im
  // Lager liegt)
  function brokenOverview() {
    const rows = servers.hardware
      .filter((d) => d.type.kind === 'server')
      .flatMap((device) => {
        const broken = serverParts.brokenParts(device);
        // Gleiche Teile eines Servers zusammenfassen (z. B. zwei defekte Lüfter)
        const byPart = new Map();
        for (const s of broken) byPart.set(s.part.id, (byPart.get(s.part.id) ?? 0) + 1);
        const defect = [...byPart].map(([id, n]) => ({ device, part: partById(id), n, state: 'defekt' }));
        // Fehlende Pflichtteile („unvollständig – Netzteil fehlt“, core/server-parts.js missingParts)
        const missing = serverParts.missingParts(device)
          .map(({ kind, missing: n }) => ({ device, part: partForMissing(device, kind), n, state: n > 1 ? 'fehlen' : 'fehlt' }))
          .filter((r) => r.part);
        return [...defect, ...missing];
      });
    if (!rows.length) return '<p class="parts-ok">✅ Kein Server hat ein defektes oder fehlendes Teil.</p>';
    return `
      <div class="parts-box broken">
        <div class="parts-box-head">⚠️ Defekte und unvollständige Server</div>
        <ul class="parts-broken">${rows.map(({ device, part, n, state }) => {
          const kind = partKindById(part.kind)?.name ?? part.name;
          const stock = serverParts.stockOf(part.id);
          const problem = problemFor(part.id, n);
          const buy = problem
            ? `<button class="buy" disabled>${problem}</button>`
            : `<button class="buy" data-parts-order="${part.id}" data-count="${n}">${n > 1 ? `${n} × ` : ''}${part.name} kaufen</button>`;
          return `
            <li>
              <div class="parts-broken-text">
                <strong>${device.type.name}</strong> <span class="parts-place">${place(device)}</span><br>
                ${n > 1 ? `${n} × ` : ''}${kind} ${state}${kind === part.name ? '' : ` (${part.name})`}
                ${stock >= n ? `<span class="parts-have">✓ im Lager – ${part.kind === 'disk' ? 'im Schrank an der NAS' : 'an der Werkbank'} ${state === 'defekt' ? 'tauschen' : 'einbauen'}</span>` : ''}
              </div>
              ${buy}
            </li>`;
        }).join('')}</ul>
      </div>`;
  }

  function card(part) {
    const kind = partKindById(part.kind);
    const qty = qtyOf(part.id);
    const problem = problemFor(part.id, qty);
    const values = (kind?.values ?? []).filter((key) => part[key] != null)
      .map((key) => `<dt>${VALUE_LABEL[key] ?? key}</dt><dd>${(VALUE_TEXT[key] ?? String)(part[key])}</dd>`).join('');    return `
      <div class="card parts-card">
        ${image(part)}
        <div class="card-head"><span class="server-icon">${ICONS[part.kind] ?? '⚙️'}</span><div class="card-title">${part.name}</div></div>
        <dl class="specs">${values}${fitRows(part.kind)}<dt>Im Lager</dt><dd>${serverParts.stockOf(part.id)}</dd></dl>
        <div class="card-foot parts-foot">
          <div class="parts-qty" role="group" aria-label="Menge">
            <button class="parts-step" data-parts-qty="${part.id}" data-step="-1" ${qty <= 1 ? 'disabled' : ''} aria-label="weniger">−</button>
            <span class="parts-count">${qty}</span>
            <button class="parts-step" data-parts-qty="${part.id}" data-step="1" ${qty >= MAX_QTY ? 'disabled' : ''} aria-label="mehr">+</button>
          </div>
          <span class="price">${euro.format(part.price * qty)}</span>
          ${problem ? `<button class="buy" disabled>${problem}</button>` : `<button class="buy" data-parts-order="${part.id}" data-count="${qty}">Kaufen</button>`}
        </div>
      </div>`;
  }

  function render() {
    if (!serverParts) return '<p class="slots">Der Teile-Shop ist gerade nicht erreichbar.</p>';
    images ??= renderPreviews(SERVER_PARTS.map((p) => ({
      id: p.id, name: p.name, make: () => createPartPreview(p.kind, PREVIEW_VARIANT[p.kind]?.(p)),
    })));
    const locked = upgrades.upperFloor ? '' : '<p class="slots parts-locked">🔒 Erst die zweite Etage bauen (App „Ausbau“) – dort steht der Serverraum.</p>';
    // Abschnitte in der Reihenfolge der Teilearten; Arten ohne Teile im Katalog fallen weg
    const sections = PART_KINDS.map((kind) => ({ kind, parts: partsOfKind(kind.id) }))
      .filter((s) => s.parts.length)
      .map(({ kind, parts }) => `<section><h3>${ICONS[kind.id] ?? '⚙️'} ${kind.plural}</h3><div class="grid parts-grid">${parts.map(card).join('')}</div></section>`)
      .join('');
    return `
      ${locked}
      <div class="parts-overview">${stockOverview()}${brokenOverview()}</div>
      <p class="slots">Alles kommt gesammelt als <b>ein Paket</b> nach ${economy.deliverySeconds} s direkt ins Teilelager – nichts zu tragen.
        Eingebaut und getauscht wird an der <b>Werkbank</b> im Serverraum, Festplatten direkt im Schrank vorn an der NAS. Normale Server lassen sich bis
        ${SERVER_SET.max.cores} Cores / ${SERVER_SET.max.ram} GB aufrüsten, GPU- und KI-GPU-Server nicht (nur defekte Teile tauschen).</p>
      ${sections}`;
  }

  // { message (Text für die Erfolgsmeldung oder null), render (neu zeichnen, ohne dass sich der Spielstand ändert) }
  function handleClick(e) {
    const step = e.target.closest('[data-parts-qty]');
    if (step && !step.disabled) {
      const id = step.dataset.partsQty;
      quantity.set(id, Math.min(MAX_QTY, Math.max(1, qtyOf(id) + Number(step.dataset.step))));
      return { message: null, render: true };
    }
    const buy = e.target.closest('[data-parts-order]');
    const part = partById(buy?.dataset.partsOrder);
    const n = Number(buy?.dataset.count) || 1;
    if (part && !buy.disabled && serverParts.order({ [part.id]: n }, upgrades.upperFloor)) {
      quantity.delete(part.id);
      return { message: `${n} × ${part.name} bestellt – in ${economy.deliverySeconds} s im Teilelager`, render: true };
    }
    return { message: null, render: false };
  }

  return { render, handleClick };
}
