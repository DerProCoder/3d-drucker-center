// Reiter „Aufträge“ im PC-Fenster: offene Kundenaufträge mit Frist, Lohn und Liefern-Knopf.
import { templateById } from './catalog.js';
import { GAME_MINUTES_PER_SECOND } from './economy.js';
import { formatMinutes } from './printer-menu.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Fristen unter dieser Restzeit (Spielminuten) werden rot markiert
const URGENT_MINUTES = 60;

export function createOrdersMenu(orders, economy) {
  function deadlineText(order) {
    const realMinutes = order.minutesLeft / GAME_MINUTES_PER_SECOND / 60;
    return `Frist: noch ${formatMinutes(order.minutesLeft)} (echt ca. ${formatMinutes(realMinutes)})`;
  }

  function card(order) {
    const t = templateById(order.templateId);
    const have = economy.finishedParts.get(order.templateId) ?? 0;
    const problem = orders.deliveryProblem(order);
    const urgent = order.minutesLeft < URGENT_MINUTES;
    return `
      <div class="card order" data-order="${order.id}">
        <div class="card-head">
          <div>
            <div class="card-title">${order.quantity} × ${t.name}</div>
            <div class="card-sub">${order.customer}</div>
          </div>
        </div>
        <dl class="specs">
          <dt>Material</dt><dd>${t.materials.join(' / ')}</dd>
          <dt>Pro Teil</dt><dd>${t.grams} g · ${formatMinutes(t.minutes)}</dd>
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
    const intro = `<p class="slots">Druck die bestellten Teile, entnimm sie im Druckermenü und liefer sie hier vor Ablauf der Frist ab.
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
    if (action === 'decline' && confirm(`Auftrag von ${order.customer} ablehnen?`)) orders.decline(order.id);
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
