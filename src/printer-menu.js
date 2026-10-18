// Druckermenü (Reiter ganz rechts im PC-Fenster): Drucker steuern – Vorlage wählen, Geschwindigkeit,
// Start/Pause/Abbrechen, fertiges Teil entnehmen.
import {
  PRINT_TEMPLATES, SPEED_MODES, filamentById, filamentLabel, templateById, speedById,
} from './catalog.js';
import { GAME_MINUTES_PER_SECOND } from './economy.js';

export function formatMinutes(minutes) {
  const total = Math.ceil(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function createPrinterMenu(economy) {
  const selectedTemplate = new Map(); // Drucker-ID → gewählte Vorlage (nur Anzeige-Zustand)

  function statusOf(p) {
    if (p.location === 'storage') return { text: 'Noch im Karton im Abstellraum', cls: 'idle' };
    if (p.location === 'carried') return { text: 'Wird gerade getragen', cls: 'idle' };
    const job = p.job;
    if (!job) return { text: 'Bereit', cls: 'ready' };
    const name = templateById(job.templateId).name;
    const pct = Math.floor(job.progress * 100);
    if (job.status === 'done') return { text: `Fertig: ${name} – Teil entnehmen`, cls: 'done' };
    if (job.status === 'paused') return { text: `Pausiert: ${name} – ${pct} %`, cls: 'paused' };
    const remaining = economy.remainingMinutes(p);
    const realMinutes = remaining / GAME_MINUTES_PER_SECOND / 60;
    return {
      text: `Druckt: ${name} – ${pct} % · noch ${formatMinutes(remaining)} (echt ca. ${formatMinutes(realMinutes)})`,
      cls: 'printing',
    };
  }

  function templateOptions(p, selectedId) {
    const speed = speedById(p.speedId).percent / 100;
    return PRINT_TEMPLATES.map((t) => {
      const problem = p.job ? null : economy.printProblem(p, t);
      const label = `${t.name} · ${t.grams} g · ${formatMinutes(t.minutes / speed)} · ${t.materials.join('/')}${problem ? ` – ${problem}` : ''}`;
      return `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  function actions(p, template) {
    if (p.location !== 'table') return '';
    const job = p.job;
    if (!job) {
      const problem = economy.printProblem(p, template);
      return problem
        ? `<button class="buy" disabled>${problem}</button>`
        : '<button class="buy" data-action="start">Druck starten</button>';
    }
    if (job.status === 'done') return '<button class="buy" data-action="collect">Teil entnehmen</button>';
    const toggle = job.status === 'printing'
      ? '<button class="secondary" data-action="pause">Pause</button>'
      : '<button class="buy" data-action="resume">Fortsetzen</button>';
    return `${toggle}<button class="danger" data-action="cancel">Abbrechen</button>`;
  }

  function card(p) {
    const onTable = p.location === 'table';
    const status = statusOf(p);
    const templateId = p.job?.templateId ?? selectedTemplate.get(p.id) ?? PRINT_TEMPLATES[0].id;
    const template = templateById(templateId);
    const f = p.filament ? filamentById(p.filament) : null;
    const filament = f
      ? `<span class="dot" style="--c:${f.hex}"></span>${filamentLabel(f)} · ${Math.round(p.filamentGrams)} g`
      : 'Keine Spule eingelegt';
    const speeds = SPEED_MODES.map((s) => `
      <button data-speed="${s.id}" class="${s.id === p.speedId ? 'active' : ''}" ${onTable ? '' : 'disabled'}>
        ${s.name}<small>${s.percent} %</small>
      </button>`).join('');

    return `
      <div class="card control" data-printer="${p.id}">
        <div class="card-head">
          <div>
            <div class="card-title">${p.model.name}</div>
            <div class="card-sub">${onTable ? `Platz ${p.slot + 1} auf dem Druckertisch` : 'Nicht aufgestellt'}</div>
          </div>
        </div>
        <div class="status ${status.cls}" data-status>${status.text}</div>
        <div class="progress"><div class="bar" data-bar style="width:${(p.job?.progress ?? 0) * 100}%"></div></div>
        <dl class="specs"><dt>Filament</dt><dd>${filament}</dd></dl>
        <label class="field">Druckvorlage
          <select data-template ${onTable && !p.job ? '' : 'disabled'}>${templateOptions(p, templateId)}</select>
        </label>
        <div class="field">Geschwindigkeit<div class="speeds">${speeds}</div></div>
        <div class="card-foot actions">${actions(p, template)}</div>
      </div>`;
  }

  function render() {
    const parts = [...economy.finishedParts]
      .map(([id, count]) => `${templateById(id).name} × ${count}`)
      .join(', ') || 'noch keine';
    const gameSeconds = Math.round(GAME_MINUTES_PER_SECOND * 60);
    const intro = `<p class="slots">Spielzeit: 1 echte Sekunde = ${gameSeconds} Sekunden im Spiel · Fertige Teile: <strong>${parts}</strong></p>`;
    if (!economy.printers.length) {
      return `${intro}<p class="empty">Noch keine Drucker. Kauf einen im Reiter „Drucker“, hol den Karton aus dem Abstellraum und stell ihn auf den Druckertisch.</p>`;
    }
    const sorted = [...economy.printers].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    return `${intro}<div class="grid control-grid">${sorted.map(card).join('')}</div>`;
  }

  // Klicks im Menü. Zustandsänderungen laufen über economy und lösen dadurch ein Neuzeichnen aus.
  function handleClick(e) {
    const cardEl = e.target.closest('[data-printer]');
    if (!cardEl) return;
    const id = Number(cardEl.dataset.printer);
    const speed = e.target.closest('[data-speed]')?.dataset.speed;
    if (speed) {
      economy.setPrintSpeed(id, speed);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const p = economy.printerById(id);
    if (action === 'start') economy.startPrint(id, templateById(selectedTemplate.get(id) ?? PRINT_TEMPLATES[0].id));
    if (action === 'pause') economy.pausePrint(id);
    if (action === 'resume') economy.resumePrint(id);
    if (action === 'cancel' && confirm(`Druck auf ${p.model.name} abbrechen? Das Filament ist dann verloren.`)) economy.cancelPrint(id);
    if (action === 'collect') economy.collectPart(id);
  }

  // Gibt true zurück, wenn neu gezeichnet werden muss
  function handleChange(e) {
    const select = e.target.closest('[data-template]');
    if (!select) return false;
    selectedTemplate.set(Number(select.closest('[data-printer]').dataset.printer), select.value);
    return true;
  }

  // Fortschritt laufender Drucke aktualisieren, ohne das ganze Menü neu aufzubauen
  function liveUpdate(container) {
    for (const cardEl of container.querySelectorAll('[data-printer]')) {
      const p = economy.printerById(Number(cardEl.dataset.printer));
      if (!p?.job) continue;
      const status = statusOf(p);
      const statusEl = cardEl.querySelector('[data-status]');
      statusEl.textContent = status.text;
      statusEl.className = `status ${status.cls}`;
      cardEl.querySelector('[data-bar]').style.width = `${p.job.progress * 100}%`;
    }
  }

  return { render, handleClick, handleChange, liveUpdate };
}
