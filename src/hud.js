// HUD oben links: Level mit XP-Balken, Kontostand (zählt animiert hoch/runter, mit +/−-Einblendungen),
// Stromkosten und offene Aufträge. Dazu die Level-Up-Einblendung und das Speichern-Symbol.

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const COUNT_SECONDS = 0.6; // so lange zählt der Kontostand zum neuen Wert

export function createHud(economy, orders, progress) {
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
    <div class="hud-row"><span class="hud-label">⚡ Stromkosten</span><span class="hud-value" data-field="power"></span></div>
    <div class="hud-row"><span class="hud-label">📋 Aufträge</span><span class="hud-value" data-field="orders"></span></div>
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
    const target = economy.money;
    const t = Math.min(1, (now - countStart) / (COUNT_SECONDS * 1000));
    shownMoney = countFrom + (target - countFrom) * (1 - (1 - t) ** 3);
    moneyEl.textContent = euro.format(shownMoney);
    if (t < 1) requestAnimationFrame(animateMoney);
  }

  economy.subscribe((eco) => {
    if (lastMoney === null) {
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
    field('power').textContent = `${euro.format(eco.powerCostPerMonth)} / Monat`;
  });

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

  return { showLevelUp, showSaved };
}
