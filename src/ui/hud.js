// HUD oben links: Level mit XP-Balken, Kontostand (zählt animiert hoch/runter, mit +/−-Einblendungen),
// Spieluhr, Stromtarif bzw. Stromausfall (#57), laufende Kosten und offene Aufträge. Dazu die Level-Up-Einblendung, Meldungen (Pannen, Lieferungen …),
// Erfolge und das Speichern-Symbol.
import { BANKRUPT_AT } from '../core/economy.js';
import { euro } from '../core/format.js';
import { TITLES } from '../core/progress.js';
import { subscribe as onLanguage, t } from '../core/i18n.js';

const COUNT_SECONDS = 0.6; // so lange zählt der Kontostand zum neuen Wert

// clock: Spieluhr (game-clock.js), powerGrid: Stromnetz (core/power-grid.js, #57) für Tarif bzw. Stromausfall
// backupPower: Notstrom (core/backup-power.js, #59) – während eines Ausfalls Kurzinfo hinter dem Ausfall („🔋 Notstrom: 64 %“)
export function createHud(economy, orders, progress, clock, powerGrid = null, backupPower = null) {
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
    <div class="hud-row hud-clock"><span class="hud-label">🕒<span class="hud-label-text" data-label="clock"></span></span><span class="hud-value" data-field="clock"></span></div>
    ${powerGrid ? '<div class="hud-row hud-power"><span class="hud-label">⚡<span class="hud-label-text" data-label="power"></span></span><span class="hud-value" data-field="power"></span></div>' : ''}
    <div class="hud-row hud-costs"><span class="hud-label">💸<span class="hud-label-text" data-label="costs"></span></span><span class="hud-value" data-field="costs"></span></div>
    <div class="hud-row hud-orders"><span class="hud-label">📋<span class="hud-label-text" data-label="orders"></span></span><span class="hud-value" data-field="orders"></span></div>
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
    const k = Math.min(1, (now - countStart) / (COUNT_SECONDS * 1000));
    shownMoney = countFrom + (target - countFrom) * (1 - (1 - k) ** 3);
    moneyEl.textContent = euro.format(shownMoney);
    if (k < 1) requestAnimationFrame(animateMoney);
  }

  let lastEco = null;
  economy.subscribe((eco) => {
    lastEco = eco;
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
    writeEcoTexts(eco);
  });

  // Kosten und Minus-Warnung (auch nach einem Sprachwechsel)
  function writeEcoTexts(eco) {
    field('costs').textContent = t('hud.perHour', { value: euro.format(eco.costPerHour) });
    const warning = field('warning');
    warning.classList.toggle('hidden', eco.money >= 0);
    warning.textContent = t('hud.warning', { limit: euro.format(BANKRUPT_AT) });
  }

  // Uhr und Kosten ändern sich laufend – aber nur neu schreiben, wenn sich die Anzeige ändert
  let lastClock = '';
  function update() {
    const text = t('hud.clockText', { day: clock.day, time: clock.timeText });
    if (text === lastClock) return;
    lastClock = text;
    field('clock').textContent = text;
    if (powerGrid) {
      const backup = backupPower?.hudText();
      field('power').textContent = backup ? `${powerText()} · ${backup}` : powerText();
      field('power').parentElement.classList.toggle('outage', powerGrid.isOutage);
    }
    field('costs').textContent = t('hud.perHour', { value: euro.format(economy.costPerHour) });
  }

  // Tarif bzw. Ausfall wie powerGrid.statusText(), aber übersetzt: „☀️ Tagstrom“ / „⚡ Stromausfall · noch 34 min“
  function powerText() {
    if (powerGrid.outage) return t('power.outage', { minutes: Math.max(1, Math.ceil(powerGrid.outage.minutesLeft)) });
    const tariff = powerGrid.tariff();
    return `${tariff.icon} ${t(`power.${tariff.id}`)}`;
  }

  let lastOrders = null;
  const writeOrders = (o) => { field('orders').textContent = t('hud.ordersOpen', { count: o.open.length }); };
  orders.subscribe((o) => {
    lastOrders = o;
    writeOrders(o);
  });

  // Level-Titel in der Spielsprache (gleiche Reihenfolge wie TITLES in core/progress.js)
  const levelTitle = (level) => t(`progress.titles.${Math.min(level - 1, TITLES.length - 1)}`);
  let lastProgress = null;
  function writeProgress(p) {
    field('title').textContent = levelTitle(p.level);
    field('xptext').textContent = t('hud.xp', { xp: p.xp, left: p.xpToNext, next: p.level + 1 });
  }
  progress.subscribe((p) => {
    lastProgress = p;
    field('level').textContent = p.level;
    field('xpbar').style.width = `${p.levelProgress * 100}%`;
    writeProgress(p);
  });

  // Level-Up: großes Banner mit Konfetti
  const banner = document.createElement('div');
  banner.id = 'levelup';
  document.body.appendChild(banner);
  let bannerTimer = null;

  // title (aus core/progress.js) bleibt als Parameter, angezeigt wird der Titel in der Spielsprache
  function showLevelUp(level, title) {
    banner.innerHTML = `
      <div class="levelup-small">${t('hud.levelUp')}</div>
      <div class="levelup-level">${t('hud.level', { level })}</div>
      <div class="levelup-title">${levelTitle(level) || title}</div>
      <div class="levelup-perks">${t('hud.levelPerks', { max: progress.maxOpenOrders })}</div>
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
  saveEl.textContent = t('hud.saved');
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
      <div><div class="achievement-small">${t('hud.achievement')}</div>
      <div class="achievement-name">${a.name}</div><div class="achievement-text">${a.text}</div></div>`;
    trophy.classList.remove('visible');
    void trophy.offsetWidth;
    trophy.classList.add('visible');
    clearTimeout(trophyTimer);
    trophyTimer = setTimeout(() => trophy.classList.remove('visible'), 4000);
  }

  // Feste Beschriftungen in der Spielsprache; nach einem Sprachwechsel auch alle Werte neu schreiben (#69)
  function relabel() {
    for (const el of hud.querySelectorAll('[data-label]')) el.textContent = ` ${t(`hud.${el.dataset.label}`)}`;
    saveEl.textContent = t('hud.saved');
  }
  relabel();
  onLanguage(() => {
    relabel();
    if (lastEco) {
      if (!lastEco.unlimited) moneyEl.textContent = euro.format(shownMoney ?? lastEco.money);
      writeEcoTexts(lastEco);
    }
    lastClock = '';
    update();
    if (lastOrders) writeOrders(lastOrders);
    if (lastProgress) writeProgress(lastProgress);
  });

  return { showLevelUp, showSaved, notify, showAchievement, update };
}
