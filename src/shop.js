// PC-Fenster: Desktop mit App-Symbolen, Taskleiste und eigenem Mauszeiger. Jede App öffnet ein Fenster:
// „Filament-Shop“ und „Drucker-Shop“ zum Einkaufen, „Aufträge“ und „Druckermenü“ zum Steuern,
// dazu „Notizen“ und „Rechner“.
import { FILAMENTS, MATERIALS, PRINTERS, SPEED_MODES, formatBuildVolume } from './catalog.js';
import { renderPrinterPreviews } from './printer-preview.js';
import { createPrinterMenu } from './printer-menu.js';
import { createOrdersMenu } from './orders-menu.js';
import { createCalcApp, createNotesApp } from './pc-apps.js';
import { iconDataUrl, wallpaperDataUrl } from './desktop.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const speedPercents = SPEED_MODES.map((m) => m.percent);
const speedRange = `${Math.min(...speedPercents)}–${Math.max(...speedPercents)} %`;

// live: Inhalt hängt vom Spielstand ab und wird bei Änderungen neu gezeichnet
// (Notizen und Rechner nicht, sonst gingen Eingaben verloren)
const APPS = [
  { id: 'filaments', name: 'Filament-Shop', icon: 'spool', live: true },
  { id: 'printers', name: 'Drucker-Shop', icon: 'printer', live: true },
  { id: 'orders', name: 'Aufträge', icon: 'orders', live: true },
  { id: 'control', name: 'Druckermenü', icon: 'pc', live: true },
  { id: 'notes', name: 'Notizen', icon: 'notes', live: false, small: true },
  { id: 'calc', name: 'Rechner', icon: 'calc', live: false, small: true },
];
const appById = (id) => APPS.find((a) => a.id === id);

// freePrinterSlots: () => wie viele Drucker noch gekauft werden dürfen (Stellplätze auf dem Tisch)
// freeShelfSpace: () => freie Spulenplätze im Lagerregal
// orders: Kundenaufträge (orders.js)
export function createShop(economy, { orders, freePrinterSlots, freeShelfSpace, onClose }) {
  const icons = new Map(APPS.map((a) => [a.id, iconDataUrl(a.icon)]));
  const root = document.createElement('div');
  root.id = 'shop';
  root.className = 'hidden';
  root.style.backgroundImage = `url(${wallpaperDataUrl()})`;
  root.innerHTML = `
    <div class="desktop-icons">
      ${APPS.map((a) => `
        <button class="desktop-icon" data-open="${a.id}">
          <img src="${icons.get(a.id)}" alt=""><span>${a.name}</span><span class="icon-badge" data-badge="${a.id}"></span>
        </button>`).join('')}
    </div>
    <div class="shop-window hidden" role="dialog">
      <div class="shop-titlebar">
        <img class="shop-icon" alt="">
        <span class="shop-title"></span>
        <span class="shop-balance"></span>
        <button class="shop-close" aria-label="Fenster schließen">✕</button>
      </div>
      <div class="shop-content"></div>
    </div>
    <div class="shop-toast"></div>
    <div class="taskbar">
      <button class="taskbar-power" title="PC verlassen (Esc)">⏻ PC verlassen</button>
      <div class="taskbar-apps">
        <img class="taskbar-start" src="${iconDataUrl('start', 24)}" alt="">
        ${APPS.map((a) => `<button class="taskbar-app" data-open="${a.id}" title="${a.name}"><img src="${icons.get(a.id)}" alt="${a.name}"></button>`).join('')}
      </div>
      <div class="taskbar-clock"></div>
    </div>
  `;
  document.body.appendChild(root);

  const windowEl = root.querySelector('.shop-window');
  const titleEl = root.querySelector('.shop-title');
  const titleIconEl = root.querySelector('.shop-icon');
  const balanceEl = root.querySelector('.shop-balance');
  const contentEl = root.querySelector('.shop-content');
  const toastEl = root.querySelector('.shop-toast');
  const clockEl = root.querySelector('.taskbar-clock');
  let app = null; // offene App oder null (nur Desktop)
  let toastTimer = null;
  const printerMenu = createPrinterMenu(economy);
  const ordersMenu = createOrdersMenu(orders, economy);
  const notes = createNotesApp();
  const calc = createCalcApp();

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
            <dt>Filament</dt><dd>${p.spoolSlots > 1 ? `AMS mit ${p.spoolSlots} Fächern` : '1 Spule'}</dd>
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
    // Zähler am Aufträge-Symbol
    for (const badge of root.querySelectorAll('[data-badge]')) {
      badge.textContent = badge.dataset.badge === 'orders' && orders.open.length ? orders.open.length : '';
    }
    for (const b of root.querySelectorAll('.taskbar-app')) b.classList.toggle('active', b.dataset.open === app);
    windowEl.classList.toggle('hidden', !app);
    if (!app) return;

    const info = appById(app);
    titleEl.textContent = info.name;
    titleIconEl.src = icons.get(app);
    windowEl.classList.toggle('small', !!info.small);
    balanceEl.textContent = info.live ? euro.format(economy.money) : '';
    const scroll = contentEl.scrollTop;
    const renderers = {
      filaments: renderFilaments, printers: renderPrinters, orders: ordersMenu.render,
      control: printerMenu.render, notes: notes.render, calc: calc.render,
    };
    contentEl.innerHTML = renderers[app]();
    contentEl.scrollTop = scroll;
  }

  function openApp(id) {
    app = id;
    contentEl.scrollTop = 0;
    render();
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1800);
  }

  function updateClock() {
    const now = new Date();
    clockEl.innerHTML = `${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}<br>${now.toLocaleDateString('de-DE')}`;
  }

  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]')?.dataset.open;
    if (open) openApp(open);
  });
  root.querySelector('.shop-close').addEventListener('click', () => openApp(null));
  root.querySelector('.taskbar-power').addEventListener('click', () => close());

  contentEl.addEventListener('change', (e) => {
    if (app === 'control' && printerMenu.handleChange(e)) render();
  });
  contentEl.addEventListener('input', (e) => {
    if (app === 'notes') notes.handleInput(e);
  });

  // Fortschrittsbalken im Druckermenü, Fristen bei den Aufträgen und die Uhr laufen live mit
  setInterval(() => {
    if (!isOpen()) return;
    updateClock();
    if (app === 'control') printerMenu.liveUpdate(contentEl);
    if (app === 'orders') ordersMenu.liveUpdate(contentEl);
  }, 250);

  contentEl.addEventListener('click', (e) => {
    if (app === 'control') {
      printerMenu.handleClick(e);
      return;
    }
    if (app === 'orders') {
      const message = ordersMenu.handleClick(e);
      if (message) toast(message);
      return;
    }
    if (app === 'calc') {
      if (calc.handleClick(e)) render();
      return;
    }
    const id = e.target.closest('[data-buy]')?.dataset.buy;
    if (!id) return;
    if (app === 'filaments') {
      const f = FILAMENTS.find((x) => x.id === id);
      if (freeShelfSpace() > 0 && economy.buyFilament(f)) toast(`Gekauft: ${f.material} ${f.color} – liegt im Lagerregal`);
    } else if (app === 'printers') {
      const p = PRINTERS.find((x) => x.id === id);
      if (freePrinterSlots() > 0 && economy.buyPrinter(p)) toast(`Gekauft: ${p.name} – steht im Abstellraum`);
    }
  });

  function open() {
    root.classList.remove('hidden');
    updateClock();
    render();
  }

  function close() {
    if (isOpen()) {
      root.classList.add('hidden');
      onClose?.();
    }
  }

  const isOpen = () => !root.classList.contains('hidden');

  // Bei Spieländerungen nur Apps neu zeichnen, die davon abhängen
  const refresh = () => {
    if (isOpen() && (!app || appById(app).live)) render();
  };
  economy.subscribe(refresh);
  orders.subscribe(refresh);

  return { open, close, isOpen };
}
