// Werkbank-Menü (Klick auf die Werkbank im Serverraum, world/workbench.js): zeigt den offenen Server mit allen
// Steckplätzen (Mainboard, Netzteil, CPUs, RAM-Riegel je CPU, Lüfter, ggf. Festplatten-Schächte). Oben stehen die Werte
// aus den eingebauten Teilen („128 Cores / 1024 GB“) und Warnungen („Läuft nicht: unvollständig – Netzteil fehlt“,
// defekte Teile, belegte VMs). Klick auf einen Steckplatz klappt darunter die Auswahl auf: das Teil ausbauen (heile
// Teile kommen ins Teilelager, defekte werden entsorgt) bzw. ein Teil aus dem Teilelager einbauen oder gegen das
// vorhandene tauschen. Geht etwas nicht, steht der Grund aus core/server-parts.js daneben (…Problem-Methoden).
// Unten: Server wieder als Karton aufnehmen. Große Tippflächen fürs Tablet (css/workbench.css).
import { partById, partKindById, partsOfKind, layoutOf, toSlot } from '../core/server-parts.js';
import { euro } from '../core/format.js';

const KIND_ORDER = ['board', 'psu', 'cpu', 'ram', 'fan', 'disk'];
const SINGLE = ['board', 'psu'];

// Steckplatz für die Anzeige: „Mainboard“, „CPU 1“, „RAM 5“, „Lüfter 2“, „Schacht 3“
function slotLabel(slot) {
  if (SINGLE.includes(slot.kind)) return partKindById(slot.kind).name;
  const name = { cpu: 'CPU', ram: 'RAM', fan: 'Lüfter', disk: 'Schacht' }[slot.kind] ?? partKindById(slot.kind)?.name ?? slot.kind;
  return `${name} ${slot.index + 1}`;
}

// Kurzwert eines Teils für die Kachel: „64 Cores“, „128 GB“ bzw. der Name
function partValue(part) {
  if (part.kind === 'cpu') return `${part.cores} Cores`;
  if (part.kind === 'ram') return `${part.ram} GB`;
  return part.name;
}

const capText = (cap) => `${cap.cores} Cores / ${cap.ram} GB`;

// economy, parts: core/server-parts.js, bench: core/workbench.js
// canPickUp(): Grund, warum man den Server gerade nicht aufnehmen kann, oder null · onPickUp(): Server als Karton in
// die Hand nehmen (world/workbench.js pickUp), gibt true zurück, wenn es geklappt hat · onClose: zurück ins Spiel
export function createWorkbenchPanel({ economy, parts, bench, canPickUp = () => null, onPickUp, onClose }) {
  const root = document.createElement('div');
  root.id = 'workbench-panel';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="shop-window wb-window" role="dialog">
      <div class="shop-titlebar">
        <span class="shop-title"></span>
        <button class="shop-close" aria-label="Schließen">✕</button>
      </div>
      <div class="shop-content"></div>
    </div>`;
  document.body.appendChild(root);
  const titleEl = root.querySelector('.shop-title');
  const contentEl = root.querySelector('.shop-content');
  let deviceId = null;
  let selected = null; // gewählter Steckplatz (ID wie 'cpu0') oder null
  let message = '';
  let messageBad = false;

  const isOpen = () => deviceId !== null;
  const device = () => (deviceId === null ? null : economy.furnitureById(deviceId));

  // Kopf: Werte, Standard und Höchstwerte, Strom, Warnungen
  function summaryHtml(d) {
    const s = bench.summary(d);
    const max = s.max.cores ? ` · höchstens ${capText({ cores: s.max.cores, ram: s.max.ram })}` : '';
    const warnings = [];
    if (s.problem) warnings.push(`⚠️ Läuft nicht: ${s.problem}`);
    for (const b of s.broken) warnings.push(`🔥 ${b.part.name} defekt (${slotLabel(b)}) – ausbauen und ein heiles Teil einsetzen`);
    const notes = [];
    if (!s.upgradable) notes.push('🔒 Dieser Server lässt sich nicht auf- oder abrüsten – nur defekte Teile tauschen.');
    if (s.usage.cores || s.usage.ram) {
      notes.push(`🖥️ VMs auf diesem Server brauchen ${capText(s.usage)} – so weit lässt er sich nicht abrüsten.`);
    }
    const ok = !warnings.length
      ? '<p class="wb-ok">✅ Vollständig – läuft, sobald er wieder in einem Schrank steckt und verkabelt ist.</p>' : '';
    return `
      <div class="wb-summary${warnings.length ? ' bad' : ''}">
        <div class="wb-values"><b data-wb-capacity>${capText(s.capacity)}</b></div>
        <div class="wb-sub">Standard ${capText(s.standard)}${max} · Strom ${euro.format(s.power)} / h</div>
      </div>
      ${warnings.map((w) => `<p class="wb-warn">${w}</p>`).join('')}
      ${ok}
      ${notes.map((n) => `<p class="wb-note">${n}</p>`).join('')}`;
  }

  function tileHtml(slot) {
    const classes = ['wb-slot', slot.kind];
    if (!slot.part) classes.push('empty');
    if (slot.broken) classes.push('broken');
    if (slot.locked) classes.push('locked');
    if (slot.id === selected) classes.push('selected');
    const value = slot.part ? partValue(slot.part) : 'leer';
    return `<button class="${classes.join(' ')}" data-slot="${slot.id}" aria-pressed="${slot.id === selected}">
      <span class="wb-slot-name">${slotLabel(slot)}${slot.locked ? ' 🔒' : ''}</span>
      <span class="wb-slot-value">${slot.broken ? '🔥 ' : ''}${value}</span>
    </button>`;
  }

  // Auswahl für den gewählten Steckplatz: ausbauen, einbauen bzw. tauschen – mit Grund, wenn es nicht geht
  function detailHtml(d, slot) {
    const current = slot.part;
    let removeBtn = '';
    if (current) {
      const why = parts.removeProblem(d, slot.id);
      const label = slot.broken ? 'Defektes Teil ausbauen (wird entsorgt)' : 'Ausbauen (ins Teilelager)';
      removeBtn = `<div class="wb-option">
        <button class="secondary" data-remove ${why ? 'disabled' : ''}>${label}</button>
        ${why ? `<span class="wb-reason">${why}</span>` : ''}
      </div>`;
    }
    const options = partsOfKind(slot.kind)
      .filter((p) => !(current && p.id === current.id && !slot.broken))
      .map((p) => {
        const why = current ? parts.replaceProblem(d, slot.id, p.id) : parts.installProblem(d, slot.id, p.id);
        const after = parts.capacityWith(d, toSlot(slot.id), p.id);
        const verb = current ? 'Tauschen gegen' : 'Einbauen:';
        const changes = ['cpu', 'ram'].includes(slot.kind) ? ` → ${capText(after)}` : '';
        return `<div class="wb-option">
          <button class="buy" data-part="${p.id}" ${why ? 'disabled' : ''}>${verb} ${p.name}
            <small>im Lager: ${parts.stockOf(p.id)}${changes}</small></button>
          ${why ? `<span class="wb-reason">${why}</span>` : ''}
        </div>`;
      }).join('');
    const head = current
      ? `${slotLabel(slot)}: <b>${current.name}</b>${slot.broken ? ' <span class="wb-bad">defekt</span>' : ''}`
      : `${slotLabel(slot)}: <b>leer</b>`;
    return `<div class="wb-detail">
      <p class="wb-detail-head">${head}</p>
      ${removeBtn}
      ${options || '<p class="wb-reason">Kein passendes Teil im Katalog.</p>'}
    </div>`;
  }

  // Steckplätze nach Art, RAM je CPU, die Auswahl direkt unter der Gruppe mit dem gewählten Platz
  function slotsHtml(d) {
    const slots = parts.slotsOf(d);
    const layout = layoutOf(d) ?? {};
    const groups = [];
    for (const kind of KIND_ORDER) {
      const list = slots.filter((s) => s.kind === kind);
      if (!list.length) continue;
      const name = SINGLE.includes(kind) ? partKindById(kind).name : partKindById(kind)?.plural ?? kind;
      if (kind === 'ram' && layout.cpus > 1) {
        const per = Math.ceil(list.length / layout.cpus);
        for (let c = 0; c < layout.cpus; c++) groups.push({ title: `${name} an CPU ${c + 1}`, list: list.slice(c * per, (c + 1) * per) });
      } else {
        groups.push({ title: kind === 'disk' ? 'Festplatten-Schächte' : name, list });
      }
    }
    return groups.map((g) => {
      const used = g.list.filter((s) => s.part).length;
      const chosen = g.list.find((s) => s.id === selected);
      return `<section class="wb-group">
        <h4>${g.title} <span class="hint">${used} / ${g.list.length} belegt</span></h4>
        <div class="wb-slots">${g.list.map(tileHtml).join('')}</div>
        ${chosen ? detailHtml(d, chosen) : ''}
      </section>`;
    }).join('');
  }

  function stockHtml() {
    const list = parts.stockList;
    const text = list.length
      ? list.map(({ part, count }) => `${count} × ${part.name}`).join(' · ')
      : 'leer – Teile im Teile-Shop am PC bestellen';
    return `<p class="wb-stock">📦 Teilelager: ${text}</p>`;
  }

  function render() {
    if (!isOpen()) return;
    const d = device();
    if (!d || d !== bench.device) {
      close();
      return;
    }
    if (selected && !parts.slotsOf(d).some((s) => s.id === selected)) selected = null;
    titleEl.textContent = `Werkbank · ${d.type.name}`;
    const pickUpWhy = canPickUp();
    // Scrollstand halten (Neuaufbau nach jedem Klick)
    const scroll = contentEl.scrollTop;
    contentEl.innerHTML = `
      ${summaryHtml(d)}
      ${message ? `<p class="rack-message wb-message${messageBad ? ' bad' : ''}">${message}</p>` : ''}
      <p class="rack-help">Steckplatz antippen, dann ausbauen oder ein Teil aus dem Teilelager einbauen bzw. tauschen.
        Pflicht zum Laufen: Mainboard, Netzteil, mindestens 1 CPU, 1 RAM-Riegel und alle Lüfter.</p>
      ${stockHtml()}
      ${slotsHtml(d)}
      <div class="wb-footer">
        <button class="secondary" data-pickup ${pickUpWhy ? 'disabled' : ''}>📦 Server als Karton aufnehmen</button>
        ${pickUpWhy ? `<span class="wb-reason">${pickUpWhy}</span>` : '<span class="wb-reason">Danach in einen Schrank einbauen (Glastür öffnen, auf den Schrank klicken).</span>'}
      </div>`;
    contentEl.scrollTop = scroll;
  }

  const say = (text, bad = false) => {
    message = text;
    messageBad = bad;
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('.shop-close')) {
      close();
      return;
    }
    const d = device();
    if (!d) return;
    const slotBtn = e.target.closest('[data-slot]');
    if (slotBtn) {
      selected = selected === slotBtn.dataset.slot ? null : slotBtn.dataset.slot;
      say('');
      render();
      return;
    }
    const slot = selected ? parts.slotsOf(d).find((s) => s.id === selected) : null;
    if (e.target.closest('[data-remove]') && slot?.part) {
      const why = parts.removeProblem(d, slot.id);
      const name = slot.part.name;
      const broken = slot.broken;
      if (why || !parts.remove(d.id, slot.id)) say(why ?? 'Ausbauen ging nicht', true);
      else say(`${name}${SINGLE.includes(slot.kind) ? '' : ` aus ${slotLabel(slot)}`} ausgebaut${broken ? ' und entsorgt' : ' – liegt im Teilelager'}. Jetzt ${capText(parts.capacity(d))}.`);
    }
    const partId = e.target.closest('[data-part]')?.dataset.part;
    if (partId && slot) {
      const why = slot.part ? parts.replaceProblem(d, slot.id, partId) : parts.installProblem(d, slot.id, partId);
      const ok = !why && (slot.part ? parts.replace(d.id, slot.id, partId) : parts.install(d.id, slot.id, partId));
      if (!ok) say(why ?? 'Einbauen ging nicht', true);
      else say(`${partById(partId).name}${SINGLE.includes(slot.kind) ? '' : ` in ${slotLabel(slot)}`} ${slot.part ? 'getauscht' : 'eingebaut'}. Jetzt ${capText(parts.capacity(d))}.`);
    }
    if (e.target.closest('[data-pickup]')) {
      const why = canPickUp();
      if (!why && onPickUp?.()) {
        close();
        return;
      }
      say(why ?? 'Aufnehmen ging nicht', true);
    }
    render();
  });
  economy.subscribe(() => render()); // z. B. Teile geliefert

  function open(id) {
    deviceId = id;
    selected = null;
    say('');
    root.classList.remove('hidden');
    render();
  }

  function close() {
    if (!isOpen()) return;
    deviceId = null;
    root.classList.add('hidden');
    onClose?.();
  }

  return { open, close, isOpen };
}
