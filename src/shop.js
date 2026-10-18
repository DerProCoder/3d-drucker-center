// PC-Fenster: Reiter „Filamente“ und „Drucker“ zum Einkaufen, rechts „Aufträge“ und das „Druckermenü“ zum Steuern.
import { FILAMENTS, MATERIALS, PRINTERS, SPEED_MODES, formatBuildVolume } from './catalog.js';
import { renderPrinterPreviews } from './printer-preview.js';
import { createPrinterMenu } from './printer-menu.js';
import { createOrdersMenu } from './orders-menu.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const speedPercents = SPEED_MODES.map((m) => m.percent);
const speedRange = `${Math.min(...speedPercents)}–${Math.max(...speedPercents)} %`;

// freePrinterSlots: () => wie viele Drucker noch gekauft werden dürfen (Stellplätze auf dem Tisch)
// freeShelfSpace: () => freie Spulenplätze im Lagerregal
// orders: Kundenaufträge (orders.js)
export function createShop(economy, { orders, freePrinterSlots, freeShelfSpace, onClose }) {
  const root = document.createElement('div');
  root.id = 'shop';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="shop-window" role="dialog" aria-label="Druckercenter">
      <div class="shop-titlebar">
        <span class="shop-title">Druckercenter</span>
        <span class="shop-balance"></span>
        <button class="shop-close" aria-label="Schließen">✕</button>
      </div>
      <div class="shop-tabs">
        <button data-tab="filaments">Filamente</button>
        <button data-tab="printers">Drucker</button>
        <button data-tab="orders" class="tab-right">Aufträge<span class="tab-count"></span></button>
        <button data-tab="control">Druckermenü</button>
      </div>
      <div class="shop-content"></div>
      <div class="shop-toast"></div>
    </div>
  `;
  document.body.appendChild(root);

  const balanceEl = root.querySelector('.shop-balance');
  const contentEl = root.querySelector('.shop-content');
  const toastEl = root.querySelector('.shop-toast');
  const tabButtons = root.querySelectorAll('[data-tab]');
  const orderCountEl = root.querySelector('.tab-count');
  let tab = 'filaments';
  let toastTimer = null;
  const printerMenu = createPrinterMenu(economy);
  const ordersMenu = createOrdersMenu(orders, economy);

  function buyButton(id, blockedReason) {
    return blockedReason
      ? `<button class="buy" disabled>${blockedReason}</button>`
      : `<button class="buy" data-buy="${id}">Kaufen</button>`;
  }

  function renderFilaments() {
    const shelfFree = freeShelfSpace();
    const sections = Object.values(MATERIALS).map((mat) => {
      const cards = FILAMENTS.filter((f) => f.material === mat.name).map((f) => `
        <div class="card">
          <div class="card-head">
            <span class="spool" style="--c:${f.hex}"></span>
            <div>
              <div class="card-title">${f.material} – ${f.color}</div>
              <div class="card-sub">1 kg Spule · 1,75 mm</div>
            </div>
          </div>
          <div class="card-foot">
            <span class="stock">Im Lager: ${economy.filamentStock(f.id)}</span>
            <span class="price">${euro.format(f.price)}</span>
            ${buyButton(f.id, shelfFree <= 0 ? 'Regal voll' : economy.canAfford(f.price) ? null : 'Zu wenig Geld')}
          </div>
        </div>`).join('');
      return `
        <section>
          <h3>${mat.name} <span class="hint">${mat.hint}</span></h3>
          <div class="grid">${cards}</div>
        </section>`;
    }).join('');
    return `<p class="slots">Lieferung ins Regal im Abstellraum · Freie Plätze: <strong>${shelfFree}</strong></p>${sections}`;
  }

  let printerImages = null; // erst beim ersten Öffnen des Reiters erzeugt

  function renderPrinters() {
    printerImages ??= renderPrinterPreviews(PRINTERS);
    const slots = freePrinterSlots();
    const cards = PRINTERS.map((p) => {
      let blocked = null;
      if (slots <= 0) blocked = 'Kein Platz mehr';
      else if (!economy.canAfford(p.price)) blocked = 'Zu wenig Geld';
      return `
        <div class="card printer">
          <img class="product-image" src="${printerImages.get(p.id)}" alt="${p.name}">
          <div class="card-head">
            <span class="badge" style="--c:${p.accent}">${p.tier}</span>
            <div class="card-title">${p.name}</div>
          </div>
          <dl class="specs">
            <dt>Geschwindigkeit</dt><dd>${speedRange}</dd>
            <dt>Bauraum</dt><dd>${formatBuildVolume(p.build)}</dd>
            <dt>Materialien</dt><dd>${p.materials.join(', ')}</dd>
            <dt>Stromkosten</dt><dd>${euro.format(p.powerCostPerMonth)} / Monat</dd>
          </dl>
          <div class="card-foot">
            <span class="stock">Im Besitz: ${economy.printersOfModel(p.id)}</span>
            <span class="price">${euro.format(p.price)}</span>
            ${buyButton(p.id, blocked)}
          </div>
        </div>`;
    }).join('');
    return `
      <p class="slots">Lieferung als Karton in den Abstellraum · Freie Plätze auf dem Druckertisch: <strong>${slots}</strong></p>
      <div class="grid">${cards}</div>`;
  }

  function render() {
    balanceEl.textContent = euro.format(economy.money);
    orderCountEl.textContent = orders.open.length ? ` (${orders.open.length})` : '';
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const scroll = contentEl.scrollTop;
    const renderers = {
      filaments: renderFilaments, printers: renderPrinters, orders: ordersMenu.render, control: printerMenu.render,
    };
    contentEl.innerHTML = renderers[tab]();
    contentEl.scrollTop = scroll;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1800);
  }

  tabButtons.forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    contentEl.scrollTop = 0;
    render();
  }));

  contentEl.addEventListener('change', (e) => {
    if (tab === 'control' && printerMenu.handleChange(e)) render();
  });

  // Fortschrittsbalken im Druckermenü und Fristen bei den Aufträgen laufen live mit
  setInterval(() => {
    if (!isOpen()) return;
    if (tab === 'control') printerMenu.liveUpdate(contentEl);
    if (tab === 'orders') ordersMenu.liveUpdate(contentEl);
  }, 250);

  contentEl.addEventListener('click', (e) => {
    if (tab === 'control') {
      printerMenu.handleClick(e);
      return;
    }
    if (tab === 'orders') {
      const message = ordersMenu.handleClick(e);
      if (message) toast(message);
      return;
    }
    const id = e.target.closest('[data-buy]')?.dataset.buy;
    if (!id) return;
    if (tab === 'filaments') {
      const f = FILAMENTS.find((x) => x.id === id);
      if (freeShelfSpace() > 0 && economy.buyFilament(f)) toast(`Gekauft: ${f.material} ${f.color} – liegt im Lagerregal`);
    } else {
      const p = PRINTERS.find((x) => x.id === id);
      if (freePrinterSlots() > 0 && economy.buyPrinter(p)) toast(`Gekauft: ${p.name} – steht im Abstellraum`);
    }
  });

  function open() {
    root.classList.remove('hidden');
    render();
  }

  function close() {
    if (isOpen()) {
      root.classList.add('hidden');
      onClose?.();
    }
  }

  const isOpen = () => !root.classList.contains('hidden');

  root.querySelector('.shop-close').addEventListener('click', close);
  economy.subscribe(() => { if (isOpen()) render(); });
  orders.subscribe(() => { if (isOpen()) render(); });

  return { open, close, isOpen };
}
