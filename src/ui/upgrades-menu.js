// App „Ausbau“ im PC-Fenster: Drucktische, Regalebenen, zweite Etage, Keller (mit Ausbaustufen und Kellerkarte) und
// Fahrstühle kaufen, dazu die laufenden Kosten pro Stunde.
import { RACKS_PER_TABLE, SLOTS_PER_TABLE, SPOOLS_PER_SHELF_LEVEL } from '../core/upgrades.js';
import { RENT_PER_HOUR } from '../core/economy.js';
import { euro } from '../core/format.js';
import { FIELD_SIZE, FIELD_TYPE_LABELS, GRID } from '../core/basement-layout.js';

const FIELD_ICONS = { storage: '📦', bunker: '💾' };

export function createUpgradesMenu(upgrades, economy) {
  const layout = upgrades.basementLayout;

  // Kellerausbau: Stand der laufenden Stufe
  function basementStageStatus() {
    const eta = upgrades.arrivalOf('basementStage');
    if (eta !== null) {
      const size = upgrades.basementSize + FIELD_SIZE;
      return ` · wird auf ${size} × ${size} m ausgebaut, noch ${Math.ceil(eta)} s`;
    }
    return '';
  }

  function basementStageCard() {
    const next = upgrades.nextBasementStage;
    const size = upgrades.basementSize;
    const now = upgrades.basement ? `Keller jetzt ${size} × ${size} m (${upgrades.basementStage ** 2} ${upgrades.basementStage === 1 ? 'Feld' : 'Felder'})` : 'Erst den Keller bauen';
    const nextText = next && upgrades.basementStageOrdered === upgrades.basementStage
      ? ` · nächste Stufe ${next.size} × ${next.size} m mit ${next.fields} Feldern` : '';
    return card({
      id: 'basementStage', title: 'Kellerausbau', perStep: 'je Stufe +20 m',
      sub: `${now}${nextText}${basementStageStatus()}`,
      owned: upgrades.basementStage, max: upgrades.maxBasementStage,
      price: upgrades.basementStageOrdered > upgrades.basementStage ? null : upgrades.basementStagePrice,
      problem: upgrades.basementStageProblem,
    });
  }

  // Kellerkarte: 6 × 6 Felder, Norden oben, Treppenhaus links oben (Nordwest). Klick stellt ein Feld um.
  function basementMap() {
    if (!upgrades.basement) return '';
    const cells = [];
    for (let i = 0; i < GRID * GRID; i++) {
      if (!layout.isBuilt(i)) {
        cells.push('<div class="bm-cell"></div>');
        continue;
      }
      const type = layout.fieldType(i);
      const label = type ? FIELD_TYPE_LABELS[type] : 'nicht festgelegt';
      const icon = type ? FIELD_ICONS[type] : '?';
      if (i === 0) {
        cells.push(`<div class="bm-cell built storage fixed" title="Feld 1 · Lager mit Treppenhaus (fest)"><span>${icon}</span><span class="bm-stairs">🪜</span></div>`);
        continue;
      }
      const to = layout.nextType(i);
      const problem = layout.fieldProblem(i, to);
      const hint = problem ? ` – ${problem}` : ` – Klick: ${FIELD_TYPE_LABELS[to]}`;
      cells.push(`<button class="bm-cell built ${type ?? 'unset'}${problem ? ' blocked' : ''}" data-field="${i}" title="Feld ${i + 1} · ${label}${hint}"><span>${icon}</span></button>`);
    }
    const count = (t) => layout.fields().filter((f) => f.type === t).length;
    return `
      <div class="card basement-map-card">
        <div class="card-head"><div>
          <div class="card-title">Kellerkarte</div>
          <div class="card-sub">Je Feld 20 × 20 m – Klick wechselt zwischen Lager und Daten-Bunker (gratis, nur solange das Feld leer ist). Treppenhaus links oben.</div>
        </div></div>
        <div class="basement-map">${cells.join('')}</div>
        <div class="bm-legend">
          <span><i class="bm-swatch storage"></i>📦 Lager: ${count('storage')}</span>
          <span><i class="bm-swatch bunker"></i>💾 Daten-Bunker: ${count('bunker')}</span>
          <span><i class="bm-swatch unset"></i>? nicht festgelegt: ${count(null)}</span>
        </div>
      </div>`;
  }
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
        ${basementStageCard()}
      </div>
      ${basementMap()}
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
    if (id === 'basementStage' && upgrades.buyBasementStage()) {
      const size = upgrades.basementStageOrdered * FIELD_SIZE;
      return `Kellerausbau bestellt – in ${upgrades.basementStageSeconds} s ist der Keller ${size} × ${size} m groß`;
    }
    // Kellerkarte: Feld umstellen (nicht festgelegt → Lager → Daten-Bunker → Lager …)
    const field = e.target.closest('[data-field]')?.dataset.field;
    if (field !== undefined) {
      const i = Number(field);
      const to = upgrades.basementLayout.nextType(i);
      const problem = upgrades.basementLayout.setFieldType(i, to);
      return problem ? `⚠️ ${problem}` : `Feld ${i + 1} ist jetzt ${FIELD_TYPE_LABELS[to]}`;
    }
    return null;
  }

  return { render, handleClick };
}
