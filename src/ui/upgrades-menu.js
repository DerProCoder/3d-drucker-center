// App „Ausbau“ im PC-Fenster: Drucktische, Regalebenen, zweite Etage, Keller und Fahrstühle kaufen, dazu die laufenden
// Kosten pro Stunde.
import { RACKS_PER_TABLE, SLOTS_PER_TABLE, SPOOLS_PER_SHELF_LEVEL } from '../core/upgrades.js';
import { RENT_PER_HOUR } from '../core/economy.js';
import { euro } from '../core/format.js';

export function createUpgradesMenu(upgrades, economy) {
  function steps(owned, max) {
    return Array.from({ length: max }, (_, i) => `<span class="step ${i < owned ? 'owned' : ''}"></span>`).join('');
  }

  function card({ id, title, sub, owned, max, price, perStep, problem = upgrades.buyProblem(price) }) {
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

  // Etage bzw. Fahrstuhl: unterwegs oder schon gebaut
  function buildStatus(kind, built) {
    if (built) return ' · gebaut';
    const eta = upgrades.arrivalOf(kind);
    return eta === null ? '' : ` · wird gebaut, noch ${Math.ceil(eta)} s`;
  }

  function render() {
    return `
      <p class="slots">Bau deine Halle aus. Bestellungen sind eine Minute unterwegs: Tische stellst du danach an der grünen Markierung in der Halle auf, Regalebenen, Etage, Keller und Fahrstühle werden eingebaut.</p>
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
        ${card({
          id: 'floor', title: 'Zweite Etage', perStep: 'so groß wie die Halle, mit Treppe',
          sub: `Eine ganze Etage über der Halle – die Treppe kommt in die Ecke rechts hinten${buildStatus('floor', upgrades.upperFloor)}`,
          owned: upgrades.upperFloor ? 1 : 0, max: 1, price: upgrades.upperFloorPrice,
        })}
        ${card({
          id: 'elevator', title: 'Fahrstuhl', perStep: 'fährt zwischen Halle und zweiter Etage',
          sub: `Neben der Treppe – nimmt alles mit, was du trägst${buildStatus('elevator', upgrades.elevator)}`,
          owned: upgrades.elevator ? 1 : 0, max: 1, price: upgrades.elevatorPrice, problem: upgrades.elevatorProblem,
        })}
        ${card({
          id: 'basement', title: 'Keller mit Treppe', perStep: '70 m tief, so groß wie die Halle',
          sub: `Ein leerer Keller tief unter der Halle – das Treppenhaus beginnt in der Ecke links hinten${buildStatus('basement', upgrades.basement)}`,
          owned: upgrades.basement ? 1 : 0, max: 1, price: upgrades.basementPrice,
        })}
        ${card({
          id: 'basementElevator', title: 'Keller-Fahrstuhl', perStep: 'fährt zwischen Halle und Keller',
          sub: `Neben dem Treppenhaus – spart dir 70 m Treppe${buildStatus('basementElevator', upgrades.basementElevator)}`,
          owned: upgrades.basementElevator ? 1 : 0, max: 1, price: upgrades.basementElevatorPrice,
          problem: upgrades.basementElevatorProblem,
        })}
      </div>
      <p class="slots power-note">💸 Laufende Kosten, abgebucht zu jeder vollen Spielstunde: <strong>${euro.format(economy.costPerHour)} / h</strong>
        (Miete ${euro.format(RENT_PER_HOUR)} + Strom ${euro.format(economy.powerPerHour)} für alle aufgestellten Drucker${economy.wagesPerHour ? ` + Lohn ${euro.format(economy.wagesPerHour)}` : ""})</p>`;
  }

  // Gibt den Text für die Erfolgsmeldung zurück oder null
  function handleClick(e) {
    const id = e.target.closest('[data-upgrade]')?.dataset.upgrade;
    if (id === 'table' && upgrades.buyTable()) return `Drucktisch bestellt – kommt in ${economy.deliverySeconds} s, dann an der grünen Markierung in der Halle aufstellen`;
    if (id === 'shelf' && upgrades.buyShelfLevel()) return `Regalebene bestellt – wird in ${economy.deliverySeconds} s im Abstellraum eingebaut`;
    if (id === 'floor' && upgrades.buyUpperFloor()) return `Zweite Etage bestellt – wird in ${economy.deliverySeconds} s gebaut, die Treppe kommt in die Ecke rechts hinten`;
    if (id === 'elevator' && upgrades.buyElevator()) return `Fahrstuhl bestellt – wird in ${economy.deliverySeconds} s neben der Treppe eingebaut`;
    if (id === 'basement' && upgrades.buyBasement()) return `Keller bestellt – wird in ${economy.deliverySeconds} s gebaut, das Treppenhaus beginnt links hinten in der Halle`;
    if (id === 'basementElevator' && upgrades.buyBasementElevator()) return `Keller-Fahrstuhl bestellt – wird in ${economy.deliverySeconds} s neben dem Treppenhaus eingebaut`;
    return null;
  }

  return { render, handleClick };
}
