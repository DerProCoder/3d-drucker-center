// HUD oben links: Kontostand, Stromkosten und offene Aufträge.

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function createHud(economy, orders) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div class="hud-row"><span class="hud-label">Money</span><span class="hud-value" data-field="money"></span></div>
    <div class="hud-row"><span class="hud-label">Stromkosten</span><span class="hud-value" data-field="power"></span></div>
    <div class="hud-row"><span class="hud-label">Aufträge</span><span class="hud-value" data-field="orders"></span></div>
  `;
  document.body.appendChild(hud);

  const moneyEl = hud.querySelector('[data-field="money"]');
  const powerEl = hud.querySelector('[data-field="power"]');
  const ordersEl = hud.querySelector('[data-field="orders"]');

  economy.subscribe((eco) => {
    moneyEl.textContent = euro.format(eco.money);
    moneyEl.classList.toggle('negative', eco.money < 0);
    powerEl.textContent = `${euro.format(eco.powerCostPerMonth)} / Monat`;
  });

  orders.subscribe((o) => {
    ordersEl.textContent = `${o.open.length} offen`;
  });
}
