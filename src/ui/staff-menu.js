// App „Personal“ im PC-Fenster: Azubis und die Empfangskraft einstellen und entlassen, sehen, was sie gerade tun.
import { HIRE_FEE, MAX_WORKERS, RECEPTION_HIRE_FEE, RECEPTION_WAGE, WAGE_PER_HOUR } from '../core/staff.js';
import { euro } from '../core/format.js';

// getStatus(workerId) → Text, was der Mitarbeiter gerade tut (aus world/workers.js)
export function createStaffMenu(staff, getStatus) {

  function card(worker) {
    return `
      <div class="card staff">
        <div class="card-head">
          <span class="staff-avatar">🧑‍🔧</span>
          <div>
            <div class="card-title">Azubi ${worker.name}</div>
            <div class="card-sub" data-staff-status="${worker.id}">${getStatus(worker.id)}</div>
          </div>
        </div>
        <div class="card-foot">
          <span class="stock">Lohn ${euro.format(WAGE_PER_HOUR)} pro Stunde</span>
          <button class="danger" data-fire="${worker.id}">Entlassen</button>
        </div>
      </div>`;
  }

  // Empfangskraft: eine Stelle, steht hinter dem Tresen
  function receptionCard() {
    const r = staff.receptionist;
    if (r) {
      return `
      <div class="card staff">
        <div class="card-head">
          <span class="staff-avatar">💁</span>
          <div>
            <div class="card-title">Empfang ${r.name}</div>
            <div class="card-sub">Begrüßt die Kunden, nimmt Aufträge am Tresen an und kassiert beim Abholen</div>
          </div>
        </div>
        <div class="card-foot">
          <span class="stock">Lohn ${euro.format(RECEPTION_WAGE)} pro Stunde</span>
          <button class="danger" data-fire-reception>Entlassen</button>
        </div>
      </div>`;
    }
    const problem = staff.receptionProblem();
    return `
      <div class="card staff hire">
        <div class="card-head">
          <span class="staff-avatar">💁</span>
          <div>
            <div class="card-title">Empfangskraft einstellen</div>
            <div class="card-sub">Steht am Tresen, empfängt die Kunden und nimmt ihre Aufträge an</div>
          </div>
        </div>
        <div class="card-foot">
          <span class="stock">${euro.format(RECEPTION_HIRE_FEE)} einmalig, dann ${euro.format(RECEPTION_WAGE)}/h</span>
          ${problem ? `<button class="buy" disabled>${problem}</button>` : '<button class="buy" data-hire-reception>Einstellen</button>'}
        </div>
      </div>`;
  }

  function render() {
    const problem = staff.hireProblem();
    return `
      <p class="slots">Azubis räumen Fehldrucke weg und starten den Druck gleich neu, stechen verstopfte Düsen frei,
        nehmen fertige Teile ab, heben runtergefallene Teile auf und holen neues Filament aus dem Lager, wenn ein
        Drucker darauf wartet. Ohne Arbeit sitzen sie in ihrem Büro hinter der Ostwand – an der Werkbank oder zum
        Zocken auf der Couch. Besucher-Grüppchen gehen allein durch die Halle – dafür
        brauchst du keinen Azubi.</p>
      <div class="grid">
        ${staff.workers.map(card).join('')}
        <div class="card staff hire">
          <div class="card-head">
            <span class="staff-avatar">➕</span>
            <div>
              <div class="card-title">Azubi einstellen</div>
              <div class="card-sub">${staff.workers.length} von ${MAX_WORKERS} Plätzen besetzt</div>
            </div>
          </div>
          <div class="card-foot">
            <span class="stock">${euro.format(HIRE_FEE)} einmalig, dann ${euro.format(WAGE_PER_HOUR)}/h</span>
            ${problem ? `<button class="buy" disabled>${problem}</button>` : '<button class="buy" data-hire>Einstellen</button>'}
          </div>
        </div>
        ${receptionCard()}
      </div>`;
  }

  // Gibt den Text für die Meldung zurück oder null
  function handleClick(e) {
    if (e.target.closest('[data-hire]')) {
      const worker = staff.hire();
      return worker ? `Azubi ${worker.name} eingestellt – kommt gleich durch die Lagertür` : null;
    }
    if (e.target.closest('[data-hire-reception]')) {
      const r = staff.hireReceptionist();
      return r ? `${r.name} steht jetzt am Empfang` : null;
    }
    if (e.target.closest('[data-fire-reception]')) {
      const r = staff.receptionist;
      if (r && confirm(`${r.name} vom Empfang wirklich entlassen?`)) {
        staff.fireReceptionist();
        return `${r.name} hat den Empfang verlassen`;
      }
      return null;
    }
    const fireId = e.target.closest('[data-fire]')?.dataset.fire;
    if (fireId) {
      const worker = staff.workers.find((w) => w.id === Number(fireId));
      if (worker && confirm(`Azubi ${worker.name} wirklich entlassen?`)) {
        staff.fire(worker.id);
        return `Azubi ${worker.name} hat seine Sachen gepackt`;
      }
    }
    return null;
  }

  // Status-Zeilen aktualisieren, ohne das Menü neu aufzubauen
  function liveUpdate(container) {
    for (const el of container.querySelectorAll('[data-staff-status]')) el.textContent = getStatus(Number(el.dataset.staffStatus));
  }

  return { render, handleClick, liveUpdate };
}
