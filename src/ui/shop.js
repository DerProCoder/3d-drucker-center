// PC-Fenster: Desktop mit App-Symbolen, Taskleiste und eigenem Mauszeiger. Jede App öffnet ein Fenster:
// „Filament-Shop“ (mit Zubehör) und „Drucker-Shop“ zum Einkaufen, „Aufträge“ und „Druckermenü“ zum Steuern,
// „Ausbau“ für Tische und Regalebenen, „Drucker-Cam“ mit Live-Bild, dazu „Erfolge“, „Notizen“ und „Rechner“.
// Geheim: dreimal schnell aufs Windows-Symbol in der Taskleiste öffnet das „Entwicklermenü“.
import {
  ACCESSORIES, FILAMENTS, FURNITURE, MATERIALS, PRINTERS, SPARE_PARTS, formatBuildVolume, speedModesFor,
} from '../core/catalog.js';
import { ACHIEVEMENTS } from '../core/achievements.js';
import { renderPrinterPreviews } from './printer-preview.js';
import { createPrinterMenu } from './printer-menu.js';
import { createOrdersMenu } from './orders-menu.js';
import { createUpgradesMenu } from './upgrades-menu.js';
import { createStaffMenu } from './staff-menu.js';
import { createCalcApp, createNotesApp } from './pc-apps.js';
import { iconDataUrl, wallpaperDataUrl } from './desktop.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
// Geschwindigkeitsbereich eines Druckers, z. B. „50–166 %“
const speedRange = (model) => {
  const percents = speedModesFor(model).map((s) => s.percent);
  return `${Math.min(...percents)}–${Math.max(...percents)} %`;
};

// live: Inhalt hängt vom Spielstand ab und wird bei Änderungen neu gezeichnet
// (Notizen und Rechner nicht, sonst gingen Eingaben verloren)
const APPS = [
  { id: 'filaments', name: 'Filament-Shop', icon: 'spool', live: true },
  { id: 'printers', name: 'Drucker-Shop', icon: 'printer', live: true },
  { id: 'orders', name: 'Aufträge', icon: 'orders', live: true },
  { id: 'upgrades', name: 'Ausbau', icon: 'build', live: true },
  { id: 'control', name: 'Druckermenü', icon: 'pc', live: true },
  { id: 'cam', name: 'Drucker-Cam', icon: 'cam', live: true },
  { id: 'staff', name: 'Personal', icon: 'staff', live: true },
  { id: 'achievements', name: 'Erfolge', icon: 'trophy', live: true },
  { id: 'notes', name: 'Notizen', icon: 'notes', live: false, small: true },
  { id: 'calc', name: 'Rechner', icon: 'calc', live: false, small: true },
  // versteckt: kein Symbol, nur über dreimal Windows-Symbol
  { id: 'dev', name: 'Entwicklermenü', icon: 'start', live: true, small: true, hidden: true },
];
const VISIBLE_APPS = APPS.filter((a) => !a.hidden);
const SECRET_CLICKS = 3;
const SECRET_SECONDS = 1.5; // so schnell hintereinander muss man klicken
const appById = (id) => APPS.find((a) => a.id === id);

// freePrinterSlots: () => wie viele Drucker noch gekauft werden dürfen (Stellplätze auf dem Tisch)
// freeShelfSpace: () => freie Spulenplätze im Lagerregal
// orders: Kundenaufträge (orders.js), achievements: Erfolge (achievements.js), cam: Drucker-Cam (printer-cam.js)
// upgrades: Hallen-Ausbau (upgrades.js)
// staff: Personal (staff.js), staffStatus(id): was ein Mitarbeiter gerade tut
export function createShop(economy, {
  orders, achievements, cam, upgrades, staff, staffStatus, freePrinterSlots, freeShelfSpace, onClose,
}) {
  const icons = new Map(APPS.map((a) => [a.id, iconDataUrl(a.icon)]));
  const root = document.createElement('div');
  root.id = 'shop';
  root.className = 'hidden';
  root.style.backgroundImage = `url(${wallpaperDataUrl()})`;
  root.innerHTML = `
    <div class="desktop-icons">
      ${VISIBLE_APPS.map((a) => `
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
        ${VISIBLE_APPS.map((a) => `<button class="taskbar-app" data-open="${a.id}" title="${a.name}"><img src="${icons.get(a.id)}" alt="${a.name}"></button>`).join('')}
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
  const upgradesMenu = createUpgradesMenu(upgrades, economy);
  const staffMenu = createStaffMenu(staff, staffStatus);
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
    const accessories = ACCESSORIES.map((a) => {
      const owned = economy.accessories.has(a.id);
      const blocked = owned ? 'Gekauft ✔' : economy.canAfford(a.price) ? null : 'Zu wenig Geld';
      return `
        <div class="card">
          <div class="card-head">
            <span class="accessory-icon">🔥</span>
            <div>
              <div class="card-title">${a.name}</div>
              <div class="card-sub">${a.hint}</div>
            </div>
          </div>
          <div class="card-foot">
            <span class="stock">Wird in den Abstellraum geliefert</span>
            <span class="price">${euro.format(a.price)}</span>
            ${owned ? `<button class="buy" disabled>${blocked}</button>` : buyButton(`accessory:${a.id}`, blocked)}
          </div>
        </div>`;
    }).join('');
    const spare = SPARE_PARTS.map((part) => {
      let blocked = null;
      if (!economy.partsRacks.length) blocked = 'Erst Ersatzteilregal aufstellen';
      else if (economy.partsRackSpace <= 0) blocked = 'Ersatzteilregal voll';
      else if (!economy.canAfford(part.price)) blocked = 'Zu wenig Geld';
      return `
        <div class="card">
          <div class="card-head">
            <span class="accessory-icon">🔩</span>
            <div>
              <div class="card-title">${part.name}</div>
              <div class="card-sub">${part.hint}</div>
            </div>
          </div>
          <div class="card-foot">
            <span class="stock">Im Ersatzteilregal: ${economy.spareNozzles}</span>
            <span class="price">${euro.format(part.price)}</span>
            ${buyButton(`spare:${part.id}`, blocked)}
          </div>
        </div>`;
    }).join('');
    return `<p class="slots">Lieferung ins Regal im Abstellraum · Freie Plätze: <strong>${shelfFree}</strong>
      · Offen gelagerte Spulen ziehen mit der Zeit Feuchtigkeit 💧 – feuchtes Filament verursacht Fehldrucke.</p>
      ${sections}
      <section><h3>Zubehör</h3><div class="grid">${accessories}</div></section>
      <section><h3>Ersatzteile <span class="hint">Düsen nutzen sich beim Drucken ab – Lieferung direkt ins Ersatzteilregal am Druckertisch</span></h3>
        <div class="grid">${spare}</div></section>`;
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
          ${printerImages.has(p.id) ? `<img class="product-image" src="${printerImages.get(p.id)}" alt="${p.name}">` : ''}
          <div class="card-head">
            <span class="badge" style="--c:${p.accent}">${p.tier}</span>
            <div class="card-title">${p.name}</div>
          </div>
          <dl class="specs">
            <dt>Geschwindigkeit</dt><dd>${speedRange(p)}${p.turboSpeed ? ' – mit Turbo-Stufe' : ''}</dd>
            <dt>Bauraum</dt><dd>${formatBuildVolume(p.build)}</dd>
            <dt>Materialien</dt><dd>${p.materials.join(', ')}</dd>
            <dt>Filament</dt><dd>${p.spoolSlots > 4 ? `${p.spoolSlots / 4} AMS mit zusammen ${p.spoolSlots} Fächern` : p.spoolSlots > 1 ? `AMS mit ${p.spoolSlots} Fächern` : '1 Spule'}</dd>
            <dt>Gehäuse</dt><dd>${p.enclosed ? 'geschlossen' : 'offen (ABS verzieht sich)'}</dd>
            ${p.nozzleChanger ? `<dt>Düsen</dt><dd>${p.nozzles} im Düsenwechsler – eigene Düse pro Farbe, kaum Spülabfall, Ersatz bei Verstopfung</dd>`
              : p.nozzles > 1 ? `<dt>Düsen</dt><dd>${p.nozzles} – halber Verschleiß, Ersatzdüse bei Verstopfung</dd>` : ''}
            ${p.ledStrip ? '<dt>Beleuchtung</dt><dd>LED-Leiste am Sockel, Farbe im Druckermenü wählbar</dd>' : ''}
            ${p.failureFactor < 1 ? '<dt>Präzision</dt><dd>Präzisere Mechanik und starke Bauteilkühlung – nur halb so viele Fehldrucke</dd>' : ''}
            ${p.aiCamera ? '<dt>Kamera</dt><dd>HD mit KI – stoppt Fehldrucke früh, spart Filament</dd>' : ''}
            <dt>Strom beim Drucken</dt><dd>${euro.format(p.powerPerHour)} / h</dd>
          </dl>
          <div class="card-foot">
            <span class="stock">Im Besitz: ${economy.printersOfModel(p.id)}</span>
            <span class="price">${euro.format(p.price)}</span>
            ${buyButton(p.id, blocked)}
          </div>
        </div>`;
    }).join('');
    const rackSlots = upgrades.rackSlots - economy.furniture.length;
    const furniture = FURNITURE.map((f) => {
      let blocked = null;
      if (rackSlots <= 0) blocked = 'Kein Platz mehr';
      else if (!economy.canAfford(f.price)) blocked = 'Zu wenig Geld';
      const owned = economy.furniture.filter((x) => x.type.id === f.id).length;
      return `
        <div class="card">
          <div class="card-head">
            <span class="accessory-icon">${f.id === 'filament-rack' ? '🗄️' : '🧰'}</span>
            <div>
              <div class="card-title">${f.name}</div>
              <div class="card-sub">${f.hint} · steht zwischen zwei Druckern</div>
            </div>
          </div>
          <div class="card-foot">
            <span class="stock">Im Besitz: ${owned}</span>
            <span class="price">${euro.format(f.price)}</span>
            ${buyButton(`furniture:${f.id}`, blocked)}
          </div>
        </div>`;
    }).join('');
    return `
      <p class="slots">Lieferung als Karton in den Abstellraum · Freie Plätze auf dem Druckertisch: <strong>${slots}</strong></p>
      <div class="grid">${cards}</div>
      <section><h3>Einrichtung <span class="hint">Regale für die Lücken zwischen den Druckern · freie Regalplätze: ${rackSlots}</span></h3>
        <div class="grid">${furniture}</div></section>`;
  }

  function renderAchievements() {
    const cards = ACHIEVEMENTS.map((a) => {
      const done = achievements.unlocked.has(a.id);
      return `
        <div class="card achievement ${done ? 'unlocked' : 'locked'}">
          <div class="card-head">
            <span class="achievement-icon">${done ? a.icon : '🔒'}</span>
            <div>
              <div class="card-title">${a.name}</div>
              <div class="card-sub">${a.text}</div>
            </div>
          </div>
        </div>`;
    }).join('');
    const s = achievements.stats;
    return `
      <p class="slots">Freigeschaltet: <strong>${achievements.unlocked.size} / ${ACHIEVEMENTS.length}</strong>
        · Drucke: ${s.printsDone} · Fehldrucke: ${s.failures} · Verdruckt: ${(s.grams / 1000).toFixed(2)} kg
        · Kater gestreichelt: ${s.catPets}×</p>
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
    balanceEl.textContent = !info.live ? '' : economy.unlimited ? '∞ €' : euro.format(economy.money);
    const scroll = contentEl.scrollTop;
    const renderers = {
      filaments: renderFilaments, printers: renderPrinters, orders: ordersMenu.render, upgrades: upgradesMenu.render, staff: staffMenu.render,
      control: printerMenu.render, achievements: renderAchievements, notes: notes.render, calc: calc.render,
      cam: cam.render, dev: renderDev,
    };
    // Wirft eine App beim Zeichnen, nicht den Inhalt der vorher offenen App stehen lassen
    try {
      contentEl.innerHTML = renderers[app]();
    } catch (err) {
      console.error(`App „${info.name}“ konnte nicht angezeigt werden:`, err);
      contentEl.innerHTML = '<p class="slots">Diese App konnte nicht geladen werden. Details stehen in der Browser-Konsole.</p>';
      return;
    }
    if (app === 'cam') cam.attach(contentEl.querySelector('[data-cam]'));
    contentEl.scrollTop = scroll;
  }

  // Entwicklermenü: unendlich Geld, Geld dazu, Lieferungen sofort
  function renderDev() {
    const toggle = (id, on, label, text) => `
      <div class="card dev-option">
        <div class="card-head"><div>
          <div class="card-title">${label}</div>
          <div class="card-sub">${text}</div>
        </div></div>
        <div class="card-foot"><span class="stock">${on ? 'An' : 'Aus'}</span>
          <button class="${on ? 'danger' : 'buy'}" data-dev="${id}">${on ? 'Ausschalten' : 'Einschalten'}</button></div>
      </div>`;
    return `
      <p class="slots">🛠️ Psst – geheimes Entwicklermenü. Nicht weitersagen!</p>
      <div class="dev-list">
        ${toggle('unlimited', economy.unlimited, '💰 Unendlich Geld', 'Alles kaufen, ohne dass Geld abgeht. Miete und Strom werden auch nicht berechnet.')}
        ${toggle('instant', economy.instantDelivery, '🚀 Lieferung sofort', 'Pakete, Tische und Regalebenen kommen ohne Wartezeit an.')}
        <div class="card dev-option">
          <div class="card-head"><div><div class="card-title">💶 Taschengeld</div><div class="card-sub">1.000 € aufs Konto</div></div></div>
          <div class="card-foot"><span class="stock"></span><button class="buy" data-dev="money">+1.000 €</button></div>
        </div>
      </div>`;
  }

  function handleDev(e) {
    const id = e.target.closest('[data-dev]')?.dataset.dev;
    if (id === 'unlimited') {
      economy.unlimited = !economy.unlimited;
      economy.notify();
      toast(economy.unlimited ? '💰 Unendlich Geld an' : 'Unendlich Geld aus');
    } else if (id === 'instant') {
      economy.instantDelivery = !economy.instantDelivery;
      if (economy.instantDelivery) { // was schon unterwegs ist, kommt gleich an
        for (const item of economy.shipments) item.arriveIn = 0;
        for (const d of upgrades.deliveries) d.arriveIn = 0;
      }
      economy.notify();
      toast(economy.instantDelivery ? '🚀 Lieferungen kommen sofort' : 'Lieferungen dauern wieder');
    } else if (id === 'money') {
      economy.earn(1000);
      toast('+1.000 € aufs Konto');
    }
  }

  // Dreimal schnell aufs Windows-Symbol: Entwicklermenü öffnen
  let secretClicks = [];
  root.querySelector('.taskbar-start').addEventListener('click', () => {
    const now = performance.now();
    secretClicks = [...secretClicks.filter((t) => now - t < SECRET_SECONDS * 1000), now];
    if (secretClicks.length < SECRET_CLICKS) return;
    secretClicks = [];
    openApp('dev');
    toast('🛠️ Entwicklermenü freigeschaltet');
  });

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

  let liveTicks = 0;
  // Fortschrittsbalken im Druckermenü, Fristen bei den Aufträgen und die Uhr laufen live mit
  setInterval(() => {
    if (!isOpen()) return;
    updateClock();
    if (app === 'control') printerMenu.liveUpdate(contentEl);
    if (app === 'orders') ordersMenu.liveUpdate(contentEl);
    if (app === 'staff') staffMenu.liveUpdate(contentEl);
    // Lieferungen unterwegs: Restzeit im Ausbau und im Druckermenü mitzählen (etwa einmal pro Sekunde)
    if ((app === 'upgrades' && upgrades.deliveries.length) || (app === 'control' && economy.shipments.length)) {
      if ((liveTicks = (liveTicks + 1) % 4) === 0) render();
    }
  }, 250);

  contentEl.addEventListener('click', (e) => {
    if (app === 'control') {
      printerMenu.handleClick(e);
      return;
    }
    if (app === 'dev') {
      handleDev(e);
      return;
    }
    if (app === 'staff') {
      const message = staffMenu.handleClick(e);
      if (message) toast(message);
      return;
    }
    if (app === 'upgrades') {
      const message = upgradesMenu.handleClick(e);
      if (message) toast(message);
      return;
    }
    if (app === 'orders') {
      const message = ordersMenu.handleClick(e);
      if (message) toast(message);
      return;
    }
    if (app === 'cam') {
      if (cam.handleClick(e)) render();
      return;
    }
    if (app === 'calc') {
      if (calc.handleClick(e)) render();
      return;
    }
    const id = e.target.closest('[data-buy]')?.dataset.buy;
    if (!id) return;
    if (id.startsWith('furniture:')) {
      const f = FURNITURE.find((x) => `furniture:${x.id}` === id);
      if (upgrades.rackSlots - economy.furniture.length > 0 && economy.buyFurniture(f)) toast(`Bestellt: ${f.name} – kommt in ${economy.deliverySeconds} s in den Abstellraum`);
    } else if (id.startsWith('spare:')) {
      const part = SPARE_PARTS.find((x) => `spare:${x.id}` === id);
      if (economy.buySparePart(part)) toast(`Gekauft: ${part.name} – liegt im Ersatzteilregal`);
    } else if (id.startsWith('accessory:')) {
      const a = ACCESSORIES.find((x) => `accessory:${x.id}` === id);
      if (economy.buyAccessory(a)) toast(`Gekauft: ${a.name} – steht im Abstellraum`);
    } else if (app === 'filaments') {
      const f = FILAMENTS.find((x) => x.id === id);
      if (freeShelfSpace() > 0 && economy.buyFilament(f)) toast(`Gekauft: ${f.material} ${f.color} – liegt im Lagerregal`);
    } else if (app === 'printers') {
      const p = PRINTERS.find((x) => x.id === id);
      if (freePrinterSlots() > 0 && economy.buyPrinter(p)) toast(`Bestellt: ${p.name} – kommt in ${economy.deliverySeconds} s in den Abstellraum`);
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
  upgrades.subscribe(refresh);
  staff.subscribe(refresh);

  return { open, close, isOpen };
}
