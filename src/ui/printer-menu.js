// Druckermenü (Reiter ganz rechts im PC-Fenster): Drucker steuern – Vorlage wählen, Geschwindigkeit,
// Start/Pause/Abbrechen, fertiges Teil entnehmen.
import {
  FAILURES, LED_COLORS, PRINT_TEMPLATES, filamentById, filamentColorName, filamentLabel, templateById, speedById, speedModesFor,
} from '../core/catalog.js';
import {
  DAMP, GAME_MINUTES_PER_SECOND, NOZZLE_POKES, NOZZLE_WORN, WASTE_BIN_GRAMS, WASTE_EMPTY_AT, WET, plateLayout,
} from '../core/economy.js';
import {
  CHANGER_TIME, DUAL_NOZZLE_TIME, SINGLE_NOZZLE_TIME, SINGLE_NOZZLE_WASTE, hasDualNozzle, hasNozzleChanger,
  colorCount, hasWasteBin, isMultiColor, isTwoColor, partColors, usesDualNozzle,
  waitingFilament,
} from '../core/two-color.js';
import { renderPartPreview } from './printer-preview.js';

// Farbpunkt(e) eines Teils oder Drucks: einer, bei zweifarbigen zwei, mehrfarbig einer pro Farbe.
// Nimmt einzelne Filament-IDs oder eine Liste.
export function colorDots(...filamentIds) {
  return filamentIds.flat().filter(Boolean)
    .map((id) => `<span class="dot" style="--c:${filamentById(id).hex}"></span>`).join('');
}

export function formatMinutes(minutes) {
  const total = Math.ceil(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function createPrinterMenu(economy) {
  const selectedTemplate = new Map(); // Drucker-ID → gewählte Vorlage (nur Anzeige-Zustand)
  const selectedCount = new Map();    // Drucker-ID → gewünschte Anzahl Teile auf der Platte

  // Gewählte Anzahl, begrenzt auf das, was auf die Platte passt (mindestens 1)
  function countFor(p, template) {
    const max = Math.max(1, plateLayout(template, p.model.build).max);
    return Math.min(selectedCount.get(p.id) ?? 1, max);
  }

  function statusOf(p) {
    if (p.location === 'shipping') return { text: `Unterwegs – kommt in ${Math.ceil(p.arriveIn)} s`, cls: 'idle' };
    if (p.location === 'floor') return { text: 'Liegt auf dem Boden – aufheben und auf den Tisch stellen', cls: 'idle' };
    if (p.location === 'storage') return { text: 'Noch im Karton im Abstellraum', cls: 'idle' };
    if (p.location === 'carried') return { text: 'Wird gerade getragen', cls: 'idle' };
    const job = p.job;
    if (!job && p.clogged) return { text: `🪡 Düse verstopft – am Drucker freistechen (${p.nozzlePokes}/${NOZZLE_POKES})`, cls: 'failed' };
    if (!job) return { text: 'Bereit', cls: 'ready' };
    const count = job.count ?? 1;
    const name = `${count > 1 ? `${count} × ` : ''}${templateById(job.templateId).name}`;
    const pct = Math.floor(job.progress * 100);
    if (job.status === 'done') return { text: `Fertig: ${name} – ${count > 1 ? 'Teile' : 'Teil'} entnehmen (PC oder am Drucker)`, cls: 'done' };
    if (job.status === 'failed') {
      return { text: `⚠️ Fehldruck bei ${pct} %: ${FAILURES[job.failure].text}. Am Drucker wegräumen!`, cls: 'failed' };
    }
    if (job.pauseReason === 'filament') {
      return { text: `🧵 Filament leer bei ${pct} % – neue Spule ${filamentLabel(filamentById(waitingFilament(job)))} einlegen`, cls: 'paused' };
    }
    if (job.pauseReason === 'waste') {
      return { text: `🗑️ Mülleimer voll bei ${pct} % – leeren, dann geht es weiter`, cls: 'paused' };
    }
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
      const name = isTwoColor(t) ? `🎨 ${t.name} (zweifarbig)` : isMultiColor(t) ? `🌈 ${t.name} (${t.colors} Farben)` : t.name;
      const label = `${name} · ${Math.round(economy.jobGrams(p, t))} g · ${formatMinutes(economy.jobMinutes(p, t) / speed)} · ${t.materials.join('/')}${problem ? ` – ${problem}` : ''}`;
      return `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  function actions(p, template) {
    if (p.location !== 'table') return '';
    const job = p.job;
    if (!job) {
      const count = countFor(p, template);
      const problem = economy.printProblem(p, template, count);
      if (problem) return `<button class="buy" disabled>${problem}</button>`;
      return `<button class="buy" data-action="start">${count > 1 ? `${count} Teile drucken` : 'Druck starten'}</button>`;
    }
    if (job.status === 'done') {
      return `<button class="buy" data-action="collect">${(job.count ?? 1) > 1 ? `${job.count} Teile entnehmen` : 'Teil entnehmen'}</button>`;
    }
    if (job.status === 'failed') return '<button class="buy" disabled>Fehldruck am Drucker wegräumen</button>';
    let toggle = job.status === 'printing'
      ? '<button class="secondary" data-action="pause">Pause</button>'
      : '<button class="buy" data-action="resume">Fortsetzen</button>';
    if (job.pauseReason === 'filament') toggle = '<button class="buy" disabled>Neue Spule einlegen</button>';
    if (job.pauseReason === 'waste') toggle = '<button class="buy" data-action="empty">Mülleimer leeren</button>';
    return `${toggle}<button class="danger" data-action="cancel">Abbrechen</button>`;
  }

  // Vor dem Start: Gesamtmenge, wie riskant der Druck ist und ob das Filament reicht
  function riskInfo(p, template) {
    const count = countFor(p, template);
    if (economy.printProblem(p, template, count)) return '';
    const spoolNow = economy.activeSpool(p);
    const risk = Math.round(economy.failureRisk(p, template, spoolNow, count) * 100);
    const speed = speedById(p.speedId).percent / 100;
    const total = count > 1
      ? `<div class="risk info">Platte: ${count} × ${template.name} · ${Math.round(economy.jobGrams(p, template, count))} g · ${formatMinutes(economy.jobMinutes(p, template, count) / speed)}`
        + ' – ein Fehldruck trifft alle Teile</div>'
      : '';
    const level = risk >= 30 ? 'high' : risk >= 12 ? 'mid' : 'low';
    const reasons = [];
    const spool = economy.activeSpool(p);
    const material = filamentById(spool.filamentId).material;
    if (speedById(p.speedId).percent > 100) reasons.push('hohe Geschwindigkeit');
    if (material === 'ABS' && !p.model.enclosed) reasons.push('ABS ohne Gehäuse verzieht sich');
    if (spool.moisture > DAMP) reasons.push('feuchtes Filament');
    if (p.model.failureFactor < 1) reasons.push(`−${Math.round((1 - p.model.failureFactor) * 100)} % durch präzise Mechanik und starke Kühlung`);
    const shortfall = economy.filamentShortfall(p, template, count);
    const warn = shortfall > 0
      ? `<div class="risk high">🧵 Filament reicht nicht: Es fehlen ${Math.ceil(shortfall)} g – der Drucker hält an, bis du nachlegst.</div>`
      : '';
    return `${total}${twoColorInfo(p, template)}<div class="risk ${level}">Fehldruckrisiko: ${risk} %${reasons.length ? ` · ${reasons.join(', ')}` : ''}</div>${warn}`;
  }

  // Zweifarbig: mit zwei Düsen fast so schnell wie einfarbig, mit einer Düse Farbwechsel in jeder Schicht
  function twoColorInfo(p, template) {
    if (colorCount(template) < 2) return '';
    if (hasNozzleChanger(p)) {
      return `<div class="risk low">🎨 Düsenwechsler: der Kopf holt sich für jede Farbe ihre eigene Düse – nur ${Math.round((CHANGER_TIME - 1) * 100)} % länger als einfarbig, fast kein Spülabfall</div>`;
    }
    if (usesDualNozzle(p)) {
      return `<div class="risk low">🎨 Dual-Nozzle: jede Farbe hat ihre eigene Düse – nur ${Math.round((DUAL_NOZZLE_TIME - 1) * 100)} % länger als einfarbig</div>`;
    }
    const why = hasDualNozzle(p) ? 'Eine Düse ist verstopft – ' : 'Nur eine Düse: ';
    return `<div class="risk mid">🎨 ${why}Farbwechsel in jeder Schicht, dauert ${Math.round((SINGLE_NOZZLE_TIME - 1) * 100)} % länger`
      + ` und braucht ${Math.round((SINGLE_NOZZLE_WASTE - 1) * 100)} % mehr Filament (Spülabfall)</div>`;
  }

  // Farbwahl für zwei- und mehrfarbige Vorlagen: pro Teil der Form eine Reihe mit allen eingelegten Spulen, die
  // gewählte grün. Daneben eine Vorschau des Teils in genau diesen Farben. Ohne AMS gibt es nur den Hinweis aus
  // printProblem.
  function colorField(p, template) {
    if (colorCount(template) < 2 || p.spools.length < 2) return '';
    const slots = economy.colorSlots(p, template);
    const hexes = template.parts.map((_, i) => {
      const s = slots[i] >= 0 ? p.spools[slots[i]] : null;
      return s ? filamentById(s.filamentId).hex : null;
    });
    const preview = renderPartPreview(template, hexes);
    const rows = template.parts.map((part, i) => {
      const buttons = p.spools.map((s, slot) => (s ? `
        <button data-color-part="${i}" data-color-slot="${slot}" class="${slots[i] === slot ? 'chosen' : ''}"
          title="Fach ${slot + 1}">${colorDots(s.filamentId)}${filamentColorName(filamentById(s.filamentId))}</button>` : '')).join('');
      return `<div class="color-row"><small>${part}</small><div class="color-options">${buttons}</div></div>`;
    }).join('');
    return `<div class="field">Farben
      <div class="color-pick">
        ${preview ? `<img class="color-preview" src="${preview}" alt="Vorschau: ${template.name}">` : ''}
        <div class="color-rows">${rows}</div>
      </div></div>`;
  }

  // Wie viele Teile auf einmal: bis zu so vielen, wie mit Abstand auf die Platte passen
  function countField(p, template) {
    const max = plateLayout(template, p.model.build).max;
    if (max <= 1) return '';
    const current = countFor(p, template);
    const options = Array.from({ length: max }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${n === current ? 'selected' : ''}>${n} ×</option>`).join('');
    return `<label class="field">Anzahl auf der Platte (passen bis zu ${max})
      <select data-count>${options}</select></label>`;
  }

  // Düsenverschleiß: ab NOZZLE_WORN gelb, verschlissen rot
  function nozzleInfo(p) {
    const wear = p.nozzleWear ?? 0;
    const cls = wear >= 1 ? 'bad' : wear >= NOZZLE_WORN ? 'warn' : 'ok';
    const text = wear >= 1 ? 'verschlissen – Ersatzdüse einbauen' : `${Math.round(wear * 100)} % abgenutzt`;
    const changer = hasNozzleChanger(p)
      ? `<dt>Düsenwechsler</dt><dd>${p.model.nozzles} Düsen – eine im Kopf, ${p.model.nozzles - 1} im Wechsler rechts, eine pro AMS-Fach</dd>`
      : '';
    return `<dl class="specs"><dt>Düse</dt><dd class="wear ${cls}">🔧 ${text}</dd>${changer}${wasteInfo(p)}</dl>`;
  }

  // Mülleimer für den Spülabfall (eine Düse mit AMS): Füllstand, ab WASTE_EMPTY_AT gelb, voll rot
  function wasteInfo(p) {
    if (!hasWasteBin(p.model)) return '';
    const grams = Math.min(WASTE_BIN_GRAMS, Math.round(p.waste ?? 0));
    const cls = grams >= WASTE_BIN_GRAMS ? 'bad' : grams >= WASTE_EMPTY_AT ? 'warn' : 'ok';
    const empty = grams > 0 && p.location === 'table' ? ' <button class="secondary small" data-action="empty">Leeren</button>' : '';
    return `<dt>Mülleimer</dt><dd class="wear ${cls}">🗑️ ${grams} / ${WASTE_BIN_GRAMS} g Spülabfall${empty}</dd>`;
  }

  // LED-Leiste unten am Sockel (H2C): Farbe wählen, geht jederzeit
  function ledField(p) {
    if (!p.model.ledStrip) return '';
    const buttons = LED_COLORS.map((c) => `
      <button data-led="${c.id}" class="${c.id === (p.ledColor ?? LED_COLORS[0].id) ? 'active' : ''}">
        <span class="dot" style="--c:${c.hex}"></span>${c.name}
      </button>`).join('');
    return `<div class="field">LED-Leiste<div class="speeds leds">${buttons}</div></div>`;
  }

  function card(p) {
    const onTable = p.location === 'table';
    const status = statusOf(p);
    const templateId = p.job?.templateId ?? selectedTemplate.get(p.id) ?? PRINT_TEMPLATES[0].id;
    const template = templateById(templateId);
    const spoolLabel = (spool) => {
      if (!spool) return 'leer';
      const f = filamentById(spool.filamentId);
      const wet = spool.moisture >= WET ? ' · 💧 feucht' : '';
      return `<span class="dot" style="--c:${f.hex}"></span>${filamentLabel(f)} · ${Math.round(spool.grams)} g${wet}`;
    };
    // AMS: Fach auswählen, aus dem gedruckt wird. Ohne AMS: nur die eine Spule anzeigen.
    const canPick = onTable && !economy.isBusy(p) && !p.job;
    const filament = p.spools.length > 1
      ? `<div class="ams-slots">${p.spools.map((s, i) => `
          <button data-ams-slot="${i}" class="${i === p.activeSlot ? 'active' : ''}" ${canPick ? '' : 'disabled'}>
            <small>Fach ${i + 1}</small>${spoolLabel(s)}
          </button>`).join('')}</div>`
      : `<dl class="specs"><dt>Filament</dt><dd>${p.spools[0] ? spoolLabel(p.spools[0]) : 'Keine Spule eingelegt'}</dd></dl>`;
    const speeds = speedModesFor(p.model).map((s) => `
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
        ${filament}
        ${nozzleInfo(p)}
        ${ledField(p)}
        <label class="field">Druckvorlage
          <select data-template ${onTable && !p.job ? '' : 'disabled'}>${templateOptions(p, templateId)}</select>
        </label>
        ${onTable && !p.job ? colorField(p, template) : ''}
        ${onTable && !p.job ? countField(p, template) : ''}
        <div class="field">Geschwindigkeit<div class="speeds">${speeds}</div></div>
        ${onTable && !p.job ? riskInfo(p, template) : ''}
        <div class="card-foot actions">${actions(p, template)}</div>
      </div>`;
  }

  function render() {
    const parts = economy.partsList()
      .map((x) => `${colorDots(partColors(x))}${templateById(x.templateId).name} × ${x.count}`)
      .join(' ') || 'noch keine';
    const gameSeconds = Math.round(GAME_MINUTES_PER_SECOND * 60);
    const intro = `<p class="slots">Spielzeit: 1 echte Sekunde = ${gameSeconds} Sekunden im Spiel · Fertige Teile: <strong>${parts}</strong></p>`;
    if (!economy.printers.length) {
      return `${intro}<p class="empty">Noch keine Drucker. Kauf einen im Drucker-Shop, hol den Karton aus dem Abstellraum und stell ihn auf den Druckertisch.</p>`;
    }
    const sorted = [...economy.printers].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    return `${intro}<div class="grid control-grid">${sorted.map(card).join('')}</div>`;
  }

  // Klicks im Menü. Zustandsänderungen laufen über economy und lösen dadurch ein Neuzeichnen aus.
  function handleClick(e) {
    const cardEl = e.target.closest('[data-printer]');
    if (!cardEl) return;
    const id = Number(cardEl.dataset.printer);
    const led = e.target.closest('[data-led]')?.dataset.led;
    if (led) {
      economy.setLedColor(id, led);
      return;
    }
    const speed = e.target.closest('[data-speed]')?.dataset.speed;
    if (speed) {
      economy.setPrintSpeed(id, speed);
      return;
    }
    const amsSlot = e.target.closest('[data-ams-slot]')?.dataset.amsSlot;
    if (amsSlot !== undefined) {
      economy.setActiveSlot(id, Number(amsSlot));
      return;
    }
    const colorButton = e.target.closest('[data-color-part]');
    if (colorButton) {
      const template = templateById(selectedTemplate.get(id) ?? PRINT_TEMPLATES[0].id);
      economy.setColorSlot(id, template, Number(colorButton.dataset.colorPart), Number(colorButton.dataset.colorSlot));
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const p = economy.printerById(id);
    if (action === 'start') {
      const template = templateById(selectedTemplate.get(id) ?? PRINT_TEMPLATES[0].id);
      economy.startPrint(id, template, countFor(p, template));
    }
    if (action === 'pause') economy.pausePrint(id);
    if (action === 'resume') economy.resumePrint(id);
    if (action === 'cancel' && confirm(`Druck auf ${p.model.name} abbrechen? Das Filament ist dann verloren.`)) economy.cancelPrint(id);
    if (action === 'collect') economy.collectPart(id);
    if (action === 'empty') economy.emptyWasteBin(id);
  }

  // Gibt true zurück, wenn neu gezeichnet werden muss
  function handleChange(e) {
    const id = Number(e.target.closest('[data-printer]')?.dataset.printer);
    if (e.target.closest('[data-template]')) {
      selectedTemplate.set(id, e.target.value);
      return true;
    }
    if (e.target.closest('[data-count]')) {
      selectedCount.set(id, Number(e.target.value));
      return true;
    }
    return false;
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
