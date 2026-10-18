// HUD oben links: Level mit XP-Balken, Kontostand (zählt animiert hoch/runter, mit +/−-Einblendungen),
// Spieluhr, laufende Kosten und offene Aufträge. Dazu die Level-Up-Einblendung, Meldungen (Pannen, Lieferungen …),
// Erfolge und das Speichern-Symbol.
import { BANKRUPT_AT } from '../core/economy.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const COUNT_SECONDS = 0.6; // so lange zählt der Kontostand zum neuen Wert

// clock: Spieluhr (game-clock.js)
export function createHud(economy, orders, progress, clock) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div class="hud-level">
      <div class="hud-level-badge" data-field="level"></div>
      <div class="hud-level-info">
        <div class="hud-level-title" data-field="title"></div>
        <div class="hud-xp"><div class="hud-xp-bar" data-field="xpbar"></div></div>
        <div class="hud-xp-text" data-field="xptext"></div>
      </div>
    </div>
    <div class="hud-money">
      <span class="hud-money-value" data-field="money"></span>
      <div class="hud-money-popups"></div>
    </div>
    <div class="hud-row"><span class="hud-label">🕒 Uhrzeit</span><span class="hud-value" data-field="clock"></span></div>
    <div class="hud-row"><span class="hud-label">💸 Miete + Strom</span><span class="hud-value" data-field="costs"></span></div>
    <div class="hud-row"><span class="hud-label">📋 Aufträge</span><span class="hud-value" data-field="orders"></span></div>
    <div class="hud-warning hidden" data-field="warning"></div>
  `;
  document.body.appendChild(hud);

  const field = (name) => hud.querySelector(`[data-field="${name}"]`);
  const moneyEl = field('money');
  const popupsEl = hud.querySelector('.hud-money-popups');

  // Kontostand: angezeigter Wert läuft dem echten hinterher
  let shownMoney = null;
  let lastMoney = null;
  let countFrom = 0;
  let countStart = 0;

  function popup(amount) {
    const el = document.createElement('div');
    el.className = `hud-popup ${amount >= 0 ? 'plus' : 'minus'}`;
    el.textContent = `${amount >= 0 ? '+' : '−'}${euro.format(Math.abs(amount))}`;
    popupsEl.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function animateMoney(now) {
    if (economy.unlimited) return; // Anzeige bleibt bei ∞
    const target = economy.money;
    const t = Math.min(1, (now - countStart) / (COUNT_SECONDS * 1000));
    shownMoney = countFrom + (target - countFrom) * (1 - (1 - t) ** 3);
    moneyEl.textContent = euro.format(shownMoney);
    if (t < 1) requestAnimationFrame(animateMoney);
  }

  economy.subscribe((eco) => {
    if (eco.unlimited) {
      moneyEl.textContent = '∞ €';
      shownMoney = eco.money;
    } else if (lastMoney === null || moneyEl.textContent === '∞ €') {
      moneyEl.textContent = euro.format(eco.money);
      shownMoney = eco.money;
    } else if (eco.money !== lastMoney) {
      popup(eco.money - lastMoney);
      moneyEl.classList.remove('flash-plus', 'flash-minus');
      void moneyEl.offsetWidth; // Animation neu starten
      moneyEl.classList.add(eco.money > lastMoney ? 'flash-plus' : 'flash-minus');
      countFrom = shownMoney;
      countStart = performance.now();
      requestAnimationFrame(animateMoney);
    }
    lastMoney = eco.money;
    moneyEl.classList.toggle('negative', eco.money < 0);
    field('costs').textContent = `${euro.format(eco.costPerHour)} / h`;
    const warning = field('warning');
    warning.classList.toggle('hidden', eco.money >= 0);
    warning.textContent = `Konto im Minus! Ab ${euro.format(BANKRUPT_AT)} macht die Bank die Halle dicht.`;
  });

  // Uhr und Kosten ändern sich laufend – aber nur neu schreiben, wenn sich die Anzeige ändert
  let lastClock = '';
  function update() {
    const text = `Tag ${clock.day} · ${clock.timeText}`;
    if (text === lastClock) return;
    lastClock = text;
    field('clock').textContent = text;
    field('costs').textContent = `${euro.format(economy.costPerHour)} / h`;
  }

  orders.subscribe((o) => {
    field('orders').textContent = `${o.open.length} offen`;
  });

  progress.subscribe((p) => {
    field('level').textContent = p.level;
    field('title').textContent = p.title;
    field('xpbar').style.width = `${p.levelProgress * 100}%`;
    field('xptext').textContent = `${p.xp} XP · noch ${p.xpToNext} bis Level ${p.level + 1}`;
  });

  // Level-Up: großes Banner mit Konfetti
  const banner = document.createElement('div');
  banner.id = 'levelup';
  document.body.appendChild(banner);
  let bannerTimer = null;

  function showLevelUp(level, title) {
    banner.innerHTML = `
      <div class="levelup-small">Level aufgestiegen!</div>
      <div class="levelup-level">Level ${level}</div>
      <div class="levelup-title">${title}</div>
      <div class="levelup-perks">+10 % Lohn pro Auftrag · bis zu ${progress.maxOpenOrders} Aufträge gleichzeitig</div>
      ${Array.from({ length: 40 }, (_, i) => `<i class="confetti" style="--x:${Math.random() * 2 - 1};--d:${Math.random()};--h:${i * 37 % 360}"></i>`).join('')}
    `;
    banner.classList.remove('visible');
    void banner.offsetWidth;
    banner.classList.add('visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('visible'), 4200);
  }

  // Kleines Speichern-Symbol unten rechts
  const saveEl = document.createElement('div');
  saveEl.id = 'save-indicator';
  saveEl.textContent = '💾 Gespeichert';
  document.body.appendChild(saveEl);
  let saveTimer = null;

  function showSaved() {
    saveEl.classList.add('visible');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveEl.classList.remove('visible'), 1500);
  }

  // Meldungen rechts oben: kind 'good' | 'bad' | 'info', verschwinden nach ein paar Sekunden
  const feed = document.createElement('div');
  feed.id = 'feed';
  document.body.appendChild(feed);

  function notify(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `feed-item ${kind}`;
    el.textContent = text;
    feed.prepend(el);
    while (feed.children.length > 5) feed.lastChild.remove();
    setTimeout(() => el.classList.add('leaving'), 5200);
    setTimeout(() => el.remove(), 5800);
  }

  // Erfolg freigeschaltet: Pokal-Banner oben in der Mitte
  const trophy = document.createElement('div');
  trophy.id = 'achievement';
  document.body.appendChild(trophy);
  let trophyTimer = null;

  function showAchievement(a) {
    trophy.innerHTML = `<span class="achievement-icon">${a.icon}</span>
      <div><div class="achievement-small">Erfolg freigeschaltet</div>
      <div class="achievement-name">${a.name}</div><div class="achievement-text">${a.text}</div></div>`;
    trophy.classList.remove('visible');
    void trophy.offsetWidth;
    trophy.classList.add('visible');
    clearTimeout(trophyTimer);
    trophyTimer = setTimeout(() => trophy.classList.remove('visible'), 4000);
  }

  return { showLevelUp, showSaved, notify, showAchievement, update };
}
