// App „Ausbau“ im PC-Fenster: Drucktische und Regalebenen kaufen, dazu die tägliche Stromrechnung.
import { SLOTS_PER_TABLE, SPOOLS_PER_SHELF_LEVEL } from './upgrades.js';
import { DAYS_PER_MONTH } from './game-clock.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function createUpgradesMenu(upgrades, economy) {
  function steps(owned, max) {
    return Array.from({ length: max }, (_, i) => `<span class="step ${i < owned ? 'owned' : ''}"></span>`).join('');
  }

  function card({ id, title, sub, owned, max, price, perStep }) {
    const problem = upgrades.buyProblem(price);
    return `
      <div class="card upgrade">
        <div class="card-head"><div>
          <div class="card-title">${title}</div>
          <div class="card-sub">${sub}</div>
        </div></div>
        <div class="steps">${steps(owned, max)}</div>
        <div class="card-foot">
          <span class="stock">${owned} von ${max} · ${perStep}</span>
          ${price !== null ? `<span class="price">${euro.format(price)}</span>` : ''}
          ${problem
            ? `<button class="buy" disabled>${problem}</button>`
            : `<button class="buy" data-upgrade="${id}">Kaufen</button>`}
        </div>
      </div>`;
  }

  function render() {
    const dailyPower = economy.powerCostPerMonth / DAYS_PER_MONTH;
    return `
      <p class="slots">Bau deine Halle aus. Neue Tische stehen sofort in der Halle, neue Regalebenen im Abstellraum.</p>
      <div class="grid">
        ${card({
          id: 'table', title: 'Drucktisch', perStep: `je ${SLOTS_PER_TABLE} Stellplätze`,
          sub: `${upgrades.printerSlots} Stellplätze für Drucker`, owned: upgrades.tables, max: upgrades.maxTables,
          price: upgrades.nextTablePrice,
        })}
        ${card({
          id: 'shelf', title: 'Regalebene', perStep: `je ${SPOOLS_PER_SHELF_LEVEL} Spulen`,
          sub: `Platz für ${upgrades.shelfCapacity} Spulen im Lager`, owned: upgrades.shelfLevels, max: upgrades.maxShelfLevels,
          price: upgrades.nextShelfPrice,
        })}
      </div>
      <p class="slots power-note">⚡ Stromrechnung: jeden Spieltag um Mitternacht <strong>${euro.format(dailyPower)}</strong>
        (${euro.format(economy.powerCostPerMonth)} im Monat für alle aufgestellten Drucker)</p>`;
  }

  // Gibt den Text für die Erfolgsmeldung zurück oder null
  function handleClick(e) {
    const id = e.target.closest('[data-upgrade]')?.dataset.upgrade;
    if (id === 'table' && upgrades.buyTable()) return `Drucktisch ${upgrades.tables} gekauft – steht jetzt in der Halle`;
    if (id === 'shelf' && upgrades.buyShelfLevel()) return `Regalebene ${upgrades.shelfLevels} gekauft – im Abstellraum`;
    return null;
  }

  return { render, handleClick };
}
