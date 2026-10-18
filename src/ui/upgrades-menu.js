// App „Ausbau“ im PC-Fenster: Drucktische und Regalebenen kaufen, dazu die laufenden Kosten pro Stunde.
import { RACKS_PER_TABLE, SLOTS_PER_TABLE, SPOOLS_PER_SHELF_LEVEL } from '../core/upgrades.js';
import { RENT_PER_HOUR } from '../core/economy.js';

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

  // Lieferstand für die Untertitel der Karten
  function tableStatus() {
    if (upgrades.tablesReady > 0) return ' · geliefert, in der Halle aufstellen!';
    const eta = upgrades.nextTableArrival;
    return eta === null ? '' : ` · unterwegs, noch ${Math.ceil(eta)} s`;
  }

  function shelfStatus() {
    const shelf = upgrades.deliveries.filter((d) => d.kind === 'shelf');
    return shelf.length ? ` · ${shelf.length} unterwegs, noch ${Math.ceil(Math.min(...shelf.map((d) => d.arriveIn)))} s` : '';
  }

  function render() {
    return `
      <p class="slots">Bau deine Halle aus. Bestellungen sind eine Minute unterwegs: Tische stellst du danach an der grünen Markierung in der Halle auf, Regalebenen werden im Abstellraum eingebaut.</p>
      <div class="grid">
        ${card({
          id: 'table', title: 'Drucktisch', perStep: `je ${SLOTS_PER_TABLE} Drucker- und ${RACKS_PER_TABLE} Regalplätze`,
          sub: `${upgrades.printerSlots} Stellplätze für Drucker, ${upgrades.rackSlots} für Regale${tableStatus()}`, owned: upgrades.tables, max: upgrades.maxTables,
          price: upgrades.nextTablePrice,
        })}
        ${card({
          id: 'shelf', title: 'Regalebene', perStep: `je ${SPOOLS_PER_SHELF_LEVEL} Spulen`,
          sub: `Platz für ${upgrades.shelfCapacity} Spulen im Lager${shelfStatus()}`, owned: upgrades.shelfLevels, max: upgrades.maxShelfLevels,
          price: upgrades.nextShelfPrice,
        })}
      </div>
      <p class="slots power-note">💸 Laufende Kosten, abgebucht zu jeder vollen Spielstunde: <strong>${euro.format(economy.costPerHour)} / h</strong>
        (Miete ${euro.format(RENT_PER_HOUR)} + Strom ${euro.format(economy.powerPerHour)} für alle aufgestellten Drucker)</p>`;
  }

  // Gibt den Text für die Erfolgsmeldung zurück oder null
  function handleClick(e) {
    const id = e.target.closest('[data-upgrade]')?.dataset.upgrade;
    if (id === 'table' && upgrades.buyTable()) return `Drucktisch bestellt – kommt in ${economy.deliverySeconds} s, dann an der grünen Markierung in der Halle aufstellen`;
    if (id === 'shelf' && upgrades.buyShelfLevel()) return `Regalebene bestellt – wird in ${economy.deliverySeconds} s im Abstellraum eingebaut`;
    return null;
  }

  return { render, handleClick };
}
