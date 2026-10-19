// Reiter „Aufträge“ im PC-Fenster: offene Kundenaufträge mit Frist, Lohn und Liefern-Knopf.
import { filamentById, filamentLabel, templateById } from '../core/catalog.js';
import { GAME_MINUTES_PER_SECOND } from '../core/economy.js';
import { CHANGER_TIME, DUAL_NOZZLE_TIME, SINGLE_NOZZLE_TIME, isMultiColor, isTwoColor } from '../core/two-color.js';
import { colorDots, formatMinutes } from './printer-menu.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Fristen unter dieser Restzeit (Spielminuten) werden rot markiert
const URGENT_MINUTES = 60;

export function createOrdersMenu(orders, economy) {
  function deadlineText(order) {
    const realMinutes = order.minutesLeft / GAME_MINUTES_PER_SECOND / 60;
    return `Frist: noch ${formatMinutes(order.minutesLeft)} (echt ca. ${formatMinutes(realMinutes)})`;
  }

  // Was genau bestellt ist: Farbe + Material, nur Material, oder (alte Aufträge) egal
  function wantText(order, t) {
    if (order.filamentId && order.filamentId2) {
      const [a, b] = [order.filamentId, order.filamentId2].map(filamentById);
      return `${colorDots(a.id, b.id)}${order.material} ${a.color} + ${b.color}`;
    }
    if (isTwoColor(t) && order.material) return `${order.material}, zwei verschiedene Farben nach Wahl`;
    if (isMultiColor(t) && order.material) return `${order.material}, ${t.colors} verschiedene Farben nach Wahl`;
    if (order.filamentId) {
      const f = filamentById(order.filamentId);
      return `<span class="dot" style="--c:${f.hex}"></span>${filamentLabel(f)}`;
    }
    if (order.material) return `${order.material}, Farbe egal`;
    return t.materials.join(' / ');
  }

  // Ruf beim Kunden: Sterne, Stammkunde ab 3
  function starsText(customer) {
    const stars = orders.starsOf(customer);
    if (stars < 0) return `<span class="stars angry" title="Verärgert – zahlt weniger">${'😠'.repeat(-stars)}</span>`;
    const label = orders.isRegular(customer) ? ' <span class="tag regular">Stammkunde</span>' : '';
    return stars ? `<span class="stars" title="Zufrieden – zahlt mehr">${'★'.repeat(stars)}</span>${label}` : '';
  }

  function card(order) {
    const t = templateById(order.templateId);
    const have = orders.partsReady(order);
    const problem = orders.deliveryProblem(order);
    const urgent = order.minutesLeft < URGENT_MINUTES;
    const tags = [
      order.rush ? '<span class="tag rush">⚡ Eilauftrag</span>' : '',
      order.special ? '<span class="tag special">🤪 Sonderwunsch</span>' : '',
      isTwoColor(t) ? '<span class="tag two-color">🎨 Zweifarbig</span>' : '',
      isMultiColor(t) ? `<span class="tag two-color">🌈 ${t.colors} Farben</span>` : '',
    ].join('');
    // Zweifarbig: mit Dual-Nozzle deutlich schneller als mit einer Düse und AMS. Mehrfarbig geht nur mit
    // so vielen AMS-Fächern wie Farben, also auf dem H2C mit Düsenwechsler.
    const time = isTwoColor(t)
      ? `${formatMinutes(t.minutes * DUAL_NOZZLE_TIME)} mit Dual-Nozzle, ${formatMinutes(t.minutes * SINGLE_NOZZLE_TIME)} mit einer Düse`
      : isMultiColor(t) ? `${formatMinutes(t.minutes * CHANGER_TIME)} mit Düsenwechsler (nur H2C)`
      : formatMinutes(t.minutes);
    return `
      <div class="card order ${order.rush ? 'rush' : ''}" data-order="${order.id}">
        <div class="card-head">
          <div>
            <div class="card-title">${order.quantity} × ${t.name} ${tags}</div>
            <div class="card-sub">${order.customer} ${starsText(order.customer)}</div>
          </div>
        </div>
        ${order.note ? `<p class="order-note">„${order.note}“</p>` : ''}
        <dl class="specs">
          <dt>Gewünscht</dt><dd>${wantText(order, t)}</dd>
          <dt>Pro Teil</dt><dd>${t.grams} g · ${time}</dd>
          <dt>Fertig im Lager</dt><dd>${Math.min(have, order.quantity)} / ${order.quantity}</dd>
        </dl>
        <div class="status ${urgent ? 'urgent' : 'idle'}" data-deadline>${deadlineText(order)}</div>
        <div class="card-foot">
          <span class="price">${euro.format(order.reward)}</span>
          <span class="stock"></span>
          <button class="danger" data-action="decline">Ablehnen</button>
          ${problem
            ? `<button class="buy" disabled>${problem}</button>`
            : '<button class="buy" data-action="deliver">Liefern</button>'}
        </div>
      </div>`;
  }

  function render() {
    const intro = `<p class="slots">Druck die bestellten Teile in Wunschmaterial und -farbe, entnimm sie und liefer sie hier vor Ablauf der Frist ab.
      Pünktliche Lieferungen bringen Sterne beim Kunden (mehr Lohn, öfter Aufträge), verfallene kosten einen.
      Erledigte Aufträge: <strong>${orders.completed}</strong></p>`;
    if (!orders.open.length) {
      return `${intro}<p class="empty">Gerade keine Aufträge. Neue Kunden melden sich bald.</p>`;
    }
    return `${intro}<div class="grid">${orders.open.map(card).join('')}</div>`;
  }

  // Gibt den Text für die Erfolgsmeldung zurück oder null
  function handleClick(e) {
    const cardEl = e.target.closest('[data-order]');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!cardEl || !action) return null;
    const order = orders.orderById(Number(cardEl.dataset.order));
    if (!order) return null;
    if (action === 'deliver' && orders.deliver(order.id)) return `Geliefert an ${order.customer}: +${euro.format(order.reward)}`;
    if (action === 'decline' && confirm(`Auftrag von ${order.customer} ablehnen? (Ablehnen kostet keinen Stern, verfallen lassen schon.)`)) orders.decline(order.id);
    return null;
  }

  // Restzeiten aktualisieren, ohne das ganze Menü neu aufzubauen
  function liveUpdate(container) {
    for (const cardEl of container.querySelectorAll('[data-order]')) {
      const order = orders.orderById(Number(cardEl.dataset.order));
      if (!order) continue;
      const el = cardEl.querySelector('[data-deadline]');
      el.textContent = deadlineText(order);
      el.className = `status ${order.minutesLeft < URGENT_MINUTES ? 'urgent' : 'idle'}`;
    }
  }

  return { render, handleClick, liveUpdate };
}
