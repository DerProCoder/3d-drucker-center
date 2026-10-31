// Leitstand (#58) im Raum bei −10,5 m: Anzeigen für die Bildschirmwand und das Overlay „Leitstand“ am Pult.
//
// createControlStatus(game): sammelt den Spielzustand für alle Anzeigen des Leitstands (Drucker, Serverraum, Geld,
//   Aufträge, Warnungen, Strom) – nur lesend, höchstens alle STATUS_MS neu. Warnungen kommen aus der Probleme-Liste
//   des KI-Beraters (core/ai-advisor.js), Tageswerte aus dem Tagesverlauf der KI (core/ai-day-log.js).
// createWallScreens({ status, cam }): sechs Maler für die Bildschirme der Wand (world/control-wall.js ruft sie nur
//   alle paar Sekunden auf, solange man im Raum ist). Der Kamera-Bildschirm filmt reihum die Drucker (ui/printer-cam.js).
// createControlPanel(…): das Overlay mit den Reitern Drucker, Serverraum, Geld, Warnungen und Strom. Vom Pult aus
//   startet man Drucke und nimmt fertige ab (economy.startPrint / collectPart) – Spule einlegen, Fehldruck wegräumen,
//   Düse freistechen bleibt Handarbeit am Drucker. Keine Spiellogik hier: alles läuft über core/.
//   Erweiterung für den Reiter „Strom“ (Notstrom, #59): panel.addPowerSection({ id, title, render, onClick }).
import { PRINT_TEMPLATES, templateById } from '../core/catalog.js';
import { RENT_PER_HOUR, plateLayout } from '../core/economy.js';
import { isLaser, laserJobLabel } from '../core/laser.js';
import { spotLabel } from '../core/server-zones.js';
import { TEMP_LIMITS } from '../core/server-climate.js';
import { euro, euroRound, realTime } from '../core/format.js';

const STATUS_MS = 500;          // so alt darf der gesammelte Zustand höchstens sein
const PANEL_REFRESH_MS = 1000;  // offenes Overlay: Anzeigen jede Sekunde auffrischen
const URGENT_MINUTES = 120;     // Spielminuten bis zur Frist, ab denen ein Auftrag als knapp gilt (wie die KI)

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const degrees = (t) => (t == null ? '–' : `${Math.round(t)} °C`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const rackName = (rack) => `Schrank ${spotLabel(rack.slot).replace(/^(🔒|🌡️)\s*/u, '')}`;

// Name des Drucks („3 × Benchy“, Laser: Motiv bzw. Text)
function jobName(job) {
  const count = job.pieces ?? job.count ?? 1;
  return job.laser ? laserJobLabel(job) : `${count > 1 ? `${count} × ` : ''}${templateById(job.templateId).name}`;
}

// Kurzer Status eines aufgestellten Druckers: { text, cls } – cls wie im Druckermenü (ready, printing, paused, done, failed)
function printerStatus(economy, p) {
  const job = p.job;
  if (!job && p.clogged) return { text: 'Düse verstopft', cls: 'failed' };
  if (!job && (p.nozzleWear ?? 0) >= 1) return { text: 'Düse verschlissen', cls: 'failed' };
  if (!job && !isLaser(p) && !p.spools.some(Boolean)) return { text: 'Kein Filament', cls: 'failed' };
  if (!job) return { text: 'Bereit', cls: 'ready' };
  const pct = Math.floor(job.progress * 100);
  if (job.status === 'done') return { text: `Fertig: ${jobName(job)}`, cls: 'done' };
  if (job.status === 'failed') return { text: `Fehldruck bei ${pct} %`, cls: 'failed' };
  if (job.pauseReason === 'filament') return { text: `Filament leer · ${pct} %`, cls: 'failed' };
  if (job.pauseReason === 'waste') return { text: `Mülleimer voll · ${pct} %`, cls: 'paused' };
  if (job.pauseReason === 'power') return { text: `⚡ Stromausfall · ${pct} %`, cls: 'paused' };
  if (job.status === 'paused') return { text: `Pausiert · ${pct} %`, cls: 'paused' };
  return { text: `${jobName(job)} · ${pct} % · noch ${realTime(economy.remainingMinutes(p))}`, cls: 'printing' };
}

// ---------- Zustand für alle Anzeigen ----------

// game: { economy, orders, servers, climate, automation, advisor, aiService, clock }
export function createControlStatus(game) {
  const { economy, orders, servers, climate, automation, advisor, aiService, clock } = game;
  let cached = null;
  let cachedAt = -Infinity;

  function printerRows() {
    return economy.printers
      .filter((p) => p.location === 'table')
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ p, ...printerStatus(economy, p), progress: p.job?.progress ?? 0 }));
  }

  function serverState() {
    const out = { racks: [], online: 0, total: 0, down: 0, hot: 0, maxTemp: null, automation: automation?.serverCount ?? 0 };
    if (!servers) return out;
    const reached = servers.reachable();
    for (const rack of servers.racks) {
      const devices = servers.devicesIn(rack.id);
      const air = climate?.racks.get(rack.id)?.air ?? null;
      let max = air;
      let online = 0;
      let total = 0;
      const broken = [];
      for (const d of devices) {
        const s = climate?.devices.get(d.id);
        if (s && (max === null || s.temp > max)) max = s.temp;
        if (s && (s.status === 'broken' || s.status === 'frozen')) broken.push({ device: d, text: climate.problem(d) });
        if (d.type.kind !== 'server') continue;
        total++;
        if (reached.has(d.id)) online++;
      }
      const level = max == null ? 'ok' : climate.level(max);
      if (level === 'hot' || (max ?? 0) > TEMP_LIMITS.idealMax) out.hot++;
      out.racks.push({ rack, name: rackName(rack), air, max, level, online, total, broken, devices: devices.length, auto: automation?.isControlled(rack.id) ?? false });
      out.online += online;
      out.total += total;
      out.down += broken.length;
      if (max !== null && (out.maxTemp === null || max > out.maxTemp)) out.maxTemp = max;
    }
    // Wichtigste zuerst: Defekte, dann die heißesten
    out.racks.sort((a, b) => b.broken.length - a.broken.length || (b.max ?? -99) - (a.max ?? -99));
    return out;
  }

  function moneyState(facts) {
    const log = aiService?.log;
    return {
      balance: economy.money,
      today: log?.today ?? null,
      yesterday: log?.yesterday ?? null,
      incomePerHour: facts?.income ?? 0,
      costPerHour: economy.costPerHour,
      powerCostPerHour: economy.powerCostPerHour,
      wagesPerHour: economy.wagesPerHour ?? 0,
      rentPerHour: RENT_PER_HOUR,
    };
  }

  function orderState() {
    const list = (orders?.open ?? []).map((o) => {
      const template = templateById(o.templateId);
      const ready = Math.min(orders.partsReady(o), o.quantity);
      return { order: o, name: `${o.quantity} × ${template?.name ?? 'Teil'}`, customer: o.customer, ready, done: ready >= o.quantity, urgent: o.stage === 'open' && o.minutesLeft < URGENT_MINUTES };
    });
    const by = (stage) => list.filter((x) => x.order.stage === stage);
    const open = by('open').sort((a, b) => a.order.minutesLeft - b.order.minutesLeft);
    return { open, counter: by('counter'), packed: by('packed') };
  }

  // Warnungen: Probleme (rot) und Hinweise (gelb, z. B. fertiger Druck, Spule fast leer)
  function warningState(facts, power) {
    const list = [];
    if (power.outage) list.push({ text: `Stromausfall – noch etwa ${Math.max(1, Math.ceil(power.outage.minutesLeft))} Spielminuten`, level: 'bad' });
    if (advisor && facts) {
      for (const text of advisor.allProblems(facts)) list.push({ text, level: 'bad' });
      for (const x of facts.printers) if (x.hint && !x.problem) list.push({ text: `${advisor.printerName(x.p)}: ${x.hint}`, level: 'hint' });
    }
    return list;
  }

  function collect() {
    const facts = advisor?.facts() ?? null;
    const power = economy.powerStatus;
    return {
      time: clock ? `Tag ${clock.day} · ${clock.timeText}` : '',
      printers: printerRows(),
      servers: serverState(),
      money: moneyState(facts),
      orders: orderState(),
      warnings: warningState(facts, power),
      power,
    };
  }

  return {
    // Zustand (höchstens STATUS_MS alt); fresh: sofort neu sammeln (nach einer Aktion im Overlay)
    get(fresh = false) {
      const now = performance.now();
      if (fresh || !cached || now - cachedAt > STATUS_MS) {
        cached = collect();
        cachedAt = now;
      }
      return cached;
    },
  };
}

// ---------- Bildschirmwand ----------

const CLS_COLOR = { ready: '#2f6f4a', printing: '#1f5f9a', paused: '#8a6a1a', done: '#2a8a4a', failed: '#9a2a2a' };
const BAR_COLOR = { ready: '#4be08a', printing: '#3aa0ff', paused: '#ffb340', done: '#4be08a', failed: '#ff5a4a' };
const LEVEL_COLOR = { cold: '#6ab8ff', cool: '#9ad0ff', ok: '#4be08a', warm: '#ffb340', hot: '#ff5a4a' };
const FONT = '"Segoe UI", Arial, sans-serif';

// Text auf maxWidth kürzen („…“)
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// Hintergrund und Kopfzeile eines Bildschirms; gibt die Oberkante des Inhalts zurück
function frame(ctx, w, h, title, time, color = '#1f6fc0') {
  ctx.fillStyle = '#0b1018';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 24px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, 14, 21);
  ctx.textAlign = 'right';
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(time, w - 12, 21);
  ctx.textAlign = 'left';
  return 48;
}

function line(ctx, text, x, y, size, color = '#e6e8ec', weight = 600, maxWidth = 9999) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(fit(ctx, text, maxWidth), x, y);
}

function noSignal(ctx, x, y, w, h, text) {
  ctx.fillStyle = '#0d0f12';
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 700; i++) {
    const v = Math.random() * 60;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2);
  }
  ctx.textAlign = 'center';
  line(ctx, text, x + w / 2, y + h / 2 - 12, 22, '#9aa1a9');
  ctx.textAlign = 'left';
}

// status: createControlStatus(…) · cam: ui/printer-cam.js. Jeder Maler: draw(ctx, w, h) → { alert } oder ein Promise
// davon (Kamera); alert: Bildschirm soll rot blinken.
export function createWallScreens({ status, cam }) {
  let camIndex = -1;

  const printers = {
    id: 'printers',
    draw(ctx, w, h) {
      const s = status.get();
      const top = frame(ctx, w, h, '🖨️ Drucker', s.time);
      const rows = s.printers;
      if (!rows.length) {
        line(ctx, 'Noch kein Drucker aufgestellt', 14, top + 20, 26, '#9aa1a9');
        return { alert: false };
      }
      const shown = rows.slice(0, 40);
      const cols = Math.min(shown.length, Math.max(1, Math.ceil(Math.sqrt(shown.length * 2.4))));
      const lines = Math.ceil(shown.length / cols);
      const gap = 6;
      const tw = (w - gap * (cols + 1)) / cols;
      const th = (h - top - gap * (lines + 1)) / lines;
      const size = Math.max(11, Math.min(34, th / 3.6, tw / 14));
      shown.forEach((r, i) => {
        const x = gap + (i % cols) * (tw + gap);
        const y = top + gap + Math.floor(i / cols) * (th + gap);
        ctx.fillStyle = CLS_COLOR[r.cls] ?? '#333';
        ctx.fillRect(x, y, tw, th);
        line(ctx, `${r.p.slot + 1} · ${r.p.model.name}`, x + 6, y + 4, size, '#ffffff', 700, tw - 12);
        line(ctx, r.text, x + 6, y + 6 + size * 1.2, size * 0.85, '#e6e8ec', 600, tw - 12);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 6, y + th - 10, tw - 12, 6);
        ctx.fillStyle = BAR_COLOR[r.cls] ?? '#fff';
        ctx.fillRect(x + 6, y + th - 10, (tw - 12) * (r.cls === 'done' ? 1 : r.progress), 6);
      });
      if (rows.length > shown.length) line(ctx, `+${rows.length - shown.length} weitere`, w - 160, h - 26, 18, '#ffb340');
      return { alert: false };
    },
  };

  const serverRoom = {
    id: 'servers',
    draw(ctx, w, h) {
      const s = status.get().servers;
      const top = frame(ctx, w, h, '🗄️ Serverraum', status.get().time);
      if (!s.racks.length) {
        line(ctx, 'Noch kein Serverschrank aufgestellt', 14, top + 20, 26, '#9aa1a9');
        return { alert: false };
      }
      line(ctx, `Server online ${s.online} / ${s.total}`, 14, top + 4, 28, s.online < s.total ? '#ffb340' : '#4be08a', 700);
      const extra = [s.down ? `${s.down} defekt` : '', s.hot ? `${plural(s.hot, 'Schrank', 'Schränke')} zu heiß` : '', `max ${degrees(s.maxTemp)}`].filter(Boolean).join(' · ');
      line(ctx, extra, 14, top + 40, 20, s.down || s.hot ? '#ff8a7a' : '#c9ccd1');
      const rowH = 30;
      const maxRows = Math.floor((h - top - 76) / rowH);
      s.racks.slice(0, maxRows).forEach((r, i) => {
        const y = top + 72 + i * rowH;
        line(ctx, `${r.auto ? '🌡️ ' : ''}${r.name}`, 14, y, 19, '#e6e8ec', 600, w * 0.36);
        const bx = w * 0.4;
        const bw = w * 0.36;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, y + 4, bw, 16);
        ctx.fillStyle = LEVEL_COLOR[r.level] ?? '#fff';
        ctx.fillRect(bx, y + 4, bw * Math.max(0.02, Math.min(1, (r.max ?? 0) / 90)), 16);
        line(ctx, degrees(r.max), bx + bw + 10, y, 19, LEVEL_COLOR[r.level]);
        const right = r.broken.length ? `${r.broken.length} defekt` : `${r.online}/${r.total}`;
        ctx.textAlign = 'right';
        line(ctx, right, w - 12, y, 19, r.broken.length ? '#ff5a4a' : '#c9ccd1');
        ctx.textAlign = 'left';
      });
      return { alert: false };
    },
  };

  const money = {
    id: 'money',
    draw(ctx, w, h) {
      const s = status.get();
      const m = s.money;
      const top = frame(ctx, w, h, '💶 Geld', s.time);
      line(ctx, euro.format(m.balance), 14, top + 6, 64, m.balance < 0 ? '#ff5a4a' : '#7ee08a', 700);
      const t = m.today;
      if (t) {
        line(ctx, `Heute: +${euroRound.format(t.income)} rein · −${euroRound.format(t.costs)} laufende Kosten`, 14, top + 90, 22, '#e6e8ec', 600, w - 28);
      }
      line(ctx, `Kosten ${euro.format(m.costPerHour)} / h · davon Strom ${euro.format(m.powerCostPerHour)} / h`, 14, top + 126, 22, '#c9ccd1', 600, w - 28);
      line(ctx, `Einnahmen Miete + KI ${euro.format(m.incomePerHour)} / h`, 14, top + 160, 22, '#c9ccd1', 600, w - 28);
      line(ctx, s.power.text ?? '', 14, top + 196, 22, s.power.outage ? '#ff5a4a' : '#ffb340', 700, w - 28);
      return { alert: false };
    },
  };

  const orderScreen = {
    id: 'orders',
    draw(ctx, w, h) {
      const s = status.get();
      const o = s.orders;
      const top = frame(ctx, w, h, '📋 Aufträge', s.time);
      line(ctx, `${o.open.length} offen · ${o.counter.length} am Empfang · ${o.packed.length} im Abholregal`, 14, top + 4, 24, '#ffffff', 700, w - 28);
      if (!o.open.length) {
        line(ctx, 'Keine angenommenen Aufträge', 14, top + 50, 22, '#9aa1a9');
        return { alert: false };
      }
      const rowH = 32;
      o.open.slice(0, Math.floor((h - top - 50) / rowH)).forEach((x, i) => {
        const y = top + 46 + i * rowH;
        const color = x.done ? '#4be08a' : x.urgent ? '#ff8a7a' : '#e6e8ec';
        line(ctx, `${x.name} · ${x.customer}`, 14, y, 20, color, 600, w * 0.62);
        ctx.textAlign = 'right';
        line(ctx, x.done ? 'fertig – einpacken' : `${x.ready}/${x.order.quantity} · noch ${realTime(x.order.minutesLeft)}`, w - 12, y, 20, color);
        ctx.textAlign = 'left';
      });
      return { alert: false };
    },
  };

  const camera = {
    id: 'camera',
    draw(ctx, w, h) {
      const s = status.get();
      const top = frame(ctx, w, h, '📷 Kamera', s.time);
      const list = cam.printers();
      const ih = h - top;
      const iw = Math.min(w, (ih * 16) / 9);
      if (!list.length) {
        noSignal(ctx, 0, top, w, ih, 'Kein Signal – kein Drucker aufgestellt');
        return { alert: false };
      }
      camIndex = (camIndex + 1) % list.length;
      const p = list[camIndex];
      // Rechts neben dem Bild: welche Kamera gerade läuft
      const sx = iw + 10;
      line(ctx, `Kamera ${camIndex + 1} / ${list.length}`, sx, top + 8, 20, '#ffffff', 700, w - sx - 8);
      line(ctx, p.model.name, sx, top + 38, 18, '#c9ccd1', 600, w - sx - 8);
      line(ctx, `Platz ${p.slot + 1}`, sx, top + 62, 18, '#c9ccd1', 600, w - sx - 8);
      return cam.still(ctx, 0, top, iw, ih, p).then((ok) => {
        if (!ok) noSignal(ctx, 0, top, iw, ih, 'Kamera verbindet …');
        return { alert: false };
      });
    },
  };

  const warnings = {
    id: 'warnings',
    draw(ctx, w, h) {
      const s = status.get();
      const bad = s.warnings.filter((x) => x.level === 'bad');
      const hints = s.warnings.filter((x) => x.level !== 'bad');
      const top = frame(ctx, w, h, bad.length ? `⚠️ Warnungen (${bad.length})` : '⚠️ Warnungen', s.time, bad.length ? '#b3261e' : '#2f6f4a');
      if (!s.warnings.length) {
        line(ctx, '✔ Alles in Ordnung', 14, top + 30, 34, '#4be08a', 700);
        return { alert: false };
      }
      const rowH = 30;
      [...bad, ...hints].slice(0, Math.floor((h - top - 6) / rowH)).forEach((x, i) => {
        line(ctx, `${x.level === 'bad' ? '●' : '○'} ${x.text}`, 14, top + 6 + i * rowH, 20, x.level === 'bad' ? '#ff8a7a' : '#ffd27a', 600, w - 28);
      });
      return { alert: bad.length > 0 };
    },
  };

  // Reihenfolge der Bildschirme an der Wand: oben links nach unten rechts
  return [printers, serverRoom, money, orderScreen, camera, warnings];
}

// ---------- Overlay „Leitstand“ ----------

const TABS = [
  { id: 'printers', label: '🖨️ Drucker' },
  { id: 'servers', label: '🗄️ Serverraum' },
  { id: 'money', label: '💶 Geld' },
  { id: 'warnings', label: '⚠️ Warnungen' },
  { id: 'power', label: '⚡ Strom' },
];

// economy: core/economy.js (Drucke starten und abnehmen) · status: createControlStatus(…) · cam: ui/printer-cam.js
// onClose: Fenster wurde geschlossen (zurück ins Spiel)
export function createControlPanel({ economy, status, cam, onClose }) {
  const root = document.createElement('div');
  root.id = 'control-panel';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="shop-window control-window" role="dialog" aria-label="Leitstand">
      <div class="shop-titlebar">
        <span class="shop-title">🖥️ Leitstand</span>
        <span class="cp-time" data-time></span>
        <button class="shop-close" aria-label="Schließen">✕</button>
      </div>
      <nav class="cp-tabs" role="tablist">${TABS.map((t) => `<button class="cp-tab" role="tab" data-tab="${t.id}">${t.label}<span class="cp-badge" data-badge="${t.id}"></span></button>`).join('')}</nav>
      <div class="shop-content cp-content"></div>
    </div>`;
  document.body.appendChild(root);
  const contentEl = root.querySelector('.cp-content');
  const timeEl = root.querySelector('[data-time]');
  let open = false;
  let tab = 'printers';
  let message = null; // { text, tone } – Rückmeldung nach Start/Abnehmen
  let timer = null;
  let queued = false;
  const choice = new Map(); // Drucker-ID → { templateId, count } (nur Anzeige-Zustand)
  const powerSections = []; // weitere Abschnitte im Reiter „Strom“ (addPowerSection)

  // ---------- Reiter „Drucker“ ----------

  function chosenTemplate(p) {
    const c = choice.get(p.id);
    const fallback = p.job && !p.job.laser ? p.job.templateId : PRINT_TEMPLATES[0].id;
    return templateById(c?.templateId ?? fallback);
  }

  function countOptions(p, template, selected) {
    const max = Math.max(1, Math.min(12, plateLayout(template, p.model.build).max));
    return Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${i + 1} ×</option>`).join('');
  }

  // Aktionen eines Druckers: Abnehmen (fertig), Starten (bereit) oder ein Hinweis, was am Drucker selbst zu tun ist
  function printerActions(p, row) {
    const job = p.job;
    if (job?.status === 'done') {
      return `<button class="buy cp-action" data-collect="${p.id}">✋ Fertigen Druck abnehmen</button>`;
    }
    if (job?.status === 'failed') return '<span class="cp-note bad">Fehldruck – am Drucker wegräumen</span>';
    if (job?.pauseReason === 'filament') return '<span class="cp-note bad">Neue Spule am Drucker einlegen</span>';
    if (job) return '';
    if (isLaser(p)) return '<span class="cp-note">Laser: am PC im Druckermenü starten</span>';
    const template = chosenTemplate(p);
    const count = Math.min(choice.get(p.id)?.count ?? 1, Math.max(1, plateLayout(template, p.model.build).max));
    const problem = economy.printProblem(p, template, count);
    const options = PRINT_TEMPLATES.map((t) => `<option value="${t.id}" ${t.id === template.id ? 'selected' : ''}>${escapeHtml(t.name)}${economy.printProblem(p, t) ? ' ✖' : ''}</option>`).join('');
    return `
      <select class="cp-select" data-template-for="${p.id}" aria-label="Vorlage">${options}</select>
      <select class="cp-select cp-count" data-count-for="${p.id}" aria-label="Anzahl">${countOptions(p, template, count)}</select>
      <button class="buy cp-action" data-start="${p.id}" ${problem ? 'disabled' : ''}>▶ Druck starten</button>
      ${problem ? `<span class="cp-note bad">${escapeHtml(problem)}</span>` : `<span class="cp-note">${escapeHtml(row.minutes)}</span>`}`;
  }

  function printersHtml(s) {
    if (!s.printers.length) return '<p class="empty">Noch kein Drucker aufgestellt.</p>';
    const rows = s.printers.map((r) => {
      const p = r.p;
      let minutes = '';
      if (!p.job && !isLaser(p)) {
        const template = chosenTemplate(p);
        const count = Math.min(choice.get(p.id)?.count ?? 1, Math.max(1, plateLayout(template, p.model.build).max));
        // Dauer bei 100 % Tempo in echter Zeit (das Tempo stellt man am Drucker bzw. im Druckermenü ein)
        minutes = `Dauer ca. ${realTime(economy.jobMinutes(p, template, count))} (echt, bei 100 %)`;
      }
      return `
        <div class="cp-printer ${r.cls}" data-printer-row="${p.id}">
          <div class="cp-printer-head">
            <span class="cp-printer-name">${escapeHtml(p.model.name)} <small>Platz ${p.slot + 1}</small></span>
            <span class="cp-printer-status">${escapeHtml(r.text)}</span>
          </div>
          <div class="progress"><div class="bar" style="width:${(r.cls === 'done' ? 1 : r.progress) * 100}%"></div></div>
          <div class="cp-printer-actions">${printerActions(p, { minutes })}</div>
        </div>`;
    }).join('');
    return `<div class="cp-printer-list">${rows}</div>`;
  }

  // ---------- Reiter „Serverraum“ ----------

  function serversHtml(s) {
    const v = s.servers;
    if (!v.racks.length) return '<p class="empty">Noch kein Serverschrank aufgestellt.</p>';
    const head = `
      <div class="cp-stats">
        <div class="cp-stat"><b>${v.online} / ${v.total}</b><span>Server online</span></div>
        <div class="cp-stat ${v.down ? 'bad' : ''}"><b>${v.down}</b><span>Geräte defekt</span></div>
        <div class="cp-stat ${v.hot ? 'warn' : ''}"><b>${degrees(v.maxTemp)}</b><span>höchste Temperatur</span></div>
        <div class="cp-stat"><b>${v.automation}</b><span>Klima-Automatik-Server</span></div>
      </div>`;
    const rows = v.racks.map((r) => `
      <tr class="${r.broken.length ? 'bad' : r.level === 'hot' || r.level === 'warm' ? 'warn' : ''}">
        <td>${escapeHtml(r.name)}</td>
        <td>${degrees(r.air)}</td>
        <td class="lvl-${r.level}">${degrees(r.max)}</td>
        <td>${r.online} / ${r.total}</td>
        <td>${r.auto ? '🌡️ an' : '–'}</td>
        <td>${r.broken.length ? r.broken.map((b) => `${escapeHtml(b.device.type.name)}: ${escapeHtml(b.text)}`).join('<br>') : '–'}</td>
      </tr>`).join('');
    return `${head}
      <p class="cp-help">Lüfter, Reparatur und Neustart gibt es im Schrankfenster am Schrank selbst.</p>
      <div class="cp-table-wrap"><table class="cp-table">
        <thead><tr><th>Schrank</th><th>Luft</th><th>Max.</th><th>Server online</th><th>Automatik</th><th>Defekt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  // ---------- Reiter „Geld“ ----------

  function moneyHtml(s) {
    const m = s.money;
    const day = (d) => (d ? [d.income, d.costs, d.power, d.income - d.costs, d.orders] : null);
    const today = day(m.today);
    const yesterday = day(m.yesterday);
    const cell = (v, i) => (v == null ? '–' : i === 4 ? String(v) : euro.format(v));
    const row = (label, i) => `<tr><td>${label}</td><td>${today ? cell(today[i], i) : '–'}</td><td>${yesterday ? cell(yesterday[i], i) : '–'}</td></tr>`;
    const partial = m.today && m.today.since > 0 ? `<p class="cp-help">Heute wird erst seit ${String(Math.floor(m.today.since / 60)).padStart(2, '0')}:${String(m.today.since % 60).padStart(2, '0')} Uhr gezählt.</p>` : '';
    return `
      <div class="cp-stats">
        <div class="cp-stat ${m.balance < 0 ? 'bad' : 'good'}"><b>${euro.format(m.balance)}</b><span>Kontostand</span></div>
        <div class="cp-stat"><b>${euro.format(m.incomePerHour)}</b><span>Miete + KI-Abo pro Stunde</span></div>
        <div class="cp-stat"><b>${euro.format(m.costPerHour)}</b><span>Kosten pro Stunde</span></div>
      </div>
      <h3>Heute und gestern</h3>
      ${m.today ? `<div class="cp-table-wrap"><table class="cp-table">
        <thead><tr><th></th><th>Heute</th><th>Gestern</th></tr></thead>
        <tbody>${row('Einnahmen', 0)}${row('Laufende Kosten (Miete, Strom, Löhne)', 1)}${row('davon Strom', 2)}${row('Saldo', 3)}${row('Aufträge geliefert', 4)}</tbody>
      </table></div>${partial}` : '<p class="empty">Noch keine Tageswerte.</p>'}
      <h3>Laufende Kosten pro Stunde</h3>
      <div class="cp-table-wrap"><table class="cp-table">
        <tbody>
          <tr><td>Hallenmiete</td><td>${euro.format(m.rentPerHour)}</td></tr>
          <tr><td>Strom (jetzt, mit Tarif)</td><td>${euro.format(m.powerCostPerHour)}</td></tr>
          <tr><td>Löhne</td><td>${euro.format(m.wagesPerHour)}</td></tr>
          <tr><th>Summe</th><th>${euro.format(m.costPerHour)}</th></tr>
        </tbody>
      </table></div>`;
  }

  // ---------- Reiter „Warnungen“ ----------

  function warningsHtml(s) {
    if (!s.warnings.length) return '<p class="cp-ok">✔ Alles in Ordnung – gerade keine Probleme.</p>';
    const bad = s.warnings.filter((x) => x.level === 'bad');
    const hints = s.warnings.filter((x) => x.level !== 'bad');
    const list = (items, cls) => `<ul class="cp-warnings ${cls}">${items.map((x) => `<li>${escapeHtml(x.text)}</li>`).join('')}</ul>`;
    return `${bad.length ? `<h3>Probleme (${bad.length})</h3>${list(bad, 'bad')}` : '<p class="cp-ok">✔ Keine Probleme.</p>'}
      ${hints.length ? `<h3>Hinweise (${hints.length})</h3>${list(hints, 'hint')}` : ''}`;
  }

  // ---------- Reiter „Strom“ ----------

  const GROUP_NAMES = { printers: 'Drucker', servers: 'Server und Klima', lights: 'Licht' };
  function gridHtml(power) {
    const o = power.outage;
    const outage = o
      ? `<span class="bad">⚡ Stromausfall – noch etwa ${Math.max(1, Math.ceil(o.minutesLeft))} Spielminuten (insgesamt ${Math.round(o.duration)})</span>`
      : '<span class="good">Netz in Ordnung</span>';
    const groups = Object.entries(power.powered ?? {}).map(([g, on]) => `<li class="${on ? 'good' : 'bad'}">${on ? '✔' : '✖'} ${escapeHtml(GROUP_NAMES[g] ?? g)}</li>`).join('');
    const last = power.lastOutage ? `Letzter Ausfall: ${Math.round(power.lastOutage.duration)} Spielminuten` : 'Bisher kein Stromausfall';
    const next = power.backup
      ? (power.nextOutageIn != null && !o ? `Nächster Ausfall in etwa ${realTime(power.nextOutageIn)} (echt)` : '')
      : 'Stromausfälle gibt es erst mit Notstrom im Technikraum.';
    return `
      <div class="cp-stats">
        <div class="cp-stat"><b>${escapeHtml(power.tariff?.text ?? '–')}</b><span>Tarif (× ${String(power.factor ?? 1).replace('.', ',')})</span></div>
        <div class="cp-stat"><b>${euro.format(power.powerCostPerHour ?? 0)}</b><span>Stromkosten pro Stunde</span></div>
        <div class="cp-stat"><b>${euro.format(power.powerPerHour ?? 0)}</b><span>Verbrauch pro Stunde (Grundpreis)</span></div>
      </div>
      <p>${outage}</p>
      <p class="cp-help">${escapeHtml(last)}${next ? ` · ${escapeHtml(next)}` : ''}</p>
      ${groups ? `<h3>Versorgung</h3><ul class="cp-groups">${groups}</ul>` : ''}`;
  }

  function powerHtml(s) {
    const sections = [{ id: 'grid', title: 'Stromnetz', render: gridHtml }, ...powerSections];
    const body = sections.map((sec) => {
      let html = '';
      try {
        html = sec.render(s.power) ?? '';
      } catch (err) {
        console.error(`Leitstand: Abschnitt „${sec.title ?? sec.id}“ im Reiter Strom`, err);
        html = '<p class="cp-note bad">Anzeige fehlerhaft</p>';
      }
      return `<section class="cp-power-section" data-power-section="${escapeHtml(sec.id)}">${sec.title ? `<h3>${escapeHtml(sec.title)}</h3>` : ''}${html}</section>`;
    }).join('');
    const placeholder = powerSections.length ? '' : '<p class="cp-help">Notstrom (Akkus, Generator, Prioritäten) kommt mit dem Technikraum dazu.</p>';
    return body + placeholder;
  }

  // ---------- Zeichnen ----------

  const RENDER = { printers: printersHtml, servers: serversHtml, money: moneyHtml, warnings: warningsHtml, power: powerHtml };

  function render(fresh = false) {
    if (!open) return;
    const s = status.get(fresh);
    timeEl.textContent = s.time;
    for (const btn of root.querySelectorAll('[data-tab]')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    }
    const bad = s.warnings.filter((x) => x.level === 'bad').length;
    const badge = root.querySelector('[data-badge="warnings"]');
    badge.textContent = bad ? String(bad) : '';
    badge.classList.toggle('on', bad > 0);
    const msg = message ? `<p class="cp-message ${message.tone}">${escapeHtml(message.text)}</p>` : '';
    let main = contentEl.querySelector('[data-main]');
    // Drucker: die Kamera bleibt stehen (sonst flackerte sie bei jedem Auffrischen), nur die Liste darüber wird neu gebaut
    if (tab === 'printers') {
      if (!contentEl.querySelector('[data-cam-box]')) {
        contentEl.innerHTML = '<div data-main></div><section class="cp-cam"><h3>Kamera</h3><div data-cam-box></div></section>';
        renderCam();
        main = contentEl.querySelector('[data-main]');
      }
    } else if (!main || contentEl.querySelector('[data-cam-box]')) {
      contentEl.innerHTML = '<div data-main></div>';
      main = contentEl.querySelector('[data-main]');
    }
    main.innerHTML = msg + RENDER[tab](s);
  }

  function renderCam() {
    const box = contentEl.querySelector('[data-cam-box]');
    if (!box) return;
    box.innerHTML = cam.render();
    const canvas = box.querySelector('[data-cam]');
    if (canvas) cam.attach(canvas);
  }

  // Auffrischen, außer man wählt gerade in einer Auswahlliste (sonst klappte sie am Handy wieder zu)
  function refresh() {
    if (!open) return;
    const active = document.activeElement;
    if (active?.tagName === 'SELECT' && root.contains(active)) return;
    render();
  }

  // Mehrere Änderungen kurz hintereinander (economy.subscribe) nur einmal zeichnen
  function queueRender() {
    if (!open || queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      refresh();
    }, 0);
  }

  function say(text, tone = 'info') {
    message = { text, tone };
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('.shop-close')) {
      close();
      return;
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      message = null;
      render(true);
      return;
    }
    if (cam.handleClick(e)) {
      renderCam();
      return;
    }
    const start = e.target.closest('[data-start]')?.dataset.start;
    if (start) {
      const p = economy.printerById(Number(start));
      const template = chosenTemplate(p);
      const count = Math.min(choice.get(p.id)?.count ?? 1, Math.max(1, plateLayout(template, p.model.build).max));
      const problem = economy.printProblem(p, template, count);
      if (!problem && economy.startPrint(p.id, template, count)) say(`▶ ${p.model.name} (Platz ${p.slot + 1}) druckt ${count > 1 ? `${count} × ` : ''}${template.name}`, 'good');
      else say(`${p.model.name}: ${problem ?? 'Druck lässt sich nicht starten'}`, 'bad');
      render(true);
      return;
    }
    const collect = e.target.closest('[data-collect]')?.dataset.collect;
    if (collect) {
      const p = economy.printerById(Number(collect));
      const name = p.job ? jobName(p.job) : '';
      economy.collectPart(p.id);
      say(p.job ? `${p.model.name}: nichts zum Abnehmen` : `✋ ${name} von ${p.model.name} abgenommen – liegt bei den fertigen Teilen`, p.job ? 'bad' : 'good');
      render(true);
      return;
    }
    // Weitere Abschnitte im Reiter „Strom“ (#59) dürfen eigene Knöpfe haben
    const section = e.target.closest('[data-power-section]')?.dataset.powerSection;
    const sec = section && powerSections.find((x) => x.id === section);
    if (sec?.onClick && sec.onClick(e) !== false) render(true);
  });

  root.addEventListener('change', (e) => {
    const t = e.target.closest('[data-template-for]');
    const c = e.target.closest('[data-count-for]');
    if (!t && !c) return;
    const id = Number((t ?? c).dataset[t ? 'templateFor' : 'countFor']);
    const current = choice.get(id) ?? {};
    if (t) choice.set(id, { ...current, templateId: t.value });
    else choice.set(id, { ...current, count: Number(c.value) });
    e.target.blur();
    render(true);
  });

  economy.subscribe(queueRender); // z. B. Druck fertig, Fehldruck, Spule eingelegt

  function openPanel() {
    open = true;
    message = null;
    root.classList.remove('hidden');
    contentEl.innerHTML = '';
    render(true);
    clearInterval(timer);
    timer = setInterval(refresh, PANEL_REFRESH_MS);
  }

  function close() {
    if (!open) return;
    open = false;
    clearInterval(timer);
    root.classList.add('hidden');
    contentEl.innerHTML = ''; // Kamera-Canvas aus dem Dokument nehmen: die Drucker-Cam hört dann auf zu filmen
    onClose?.();
  }

  // Erweiterungsstelle für den Reiter „Strom“ (Notstrom #59): weiterer Abschnitt unter „Stromnetz“.
  //   id: eindeutiger Name · title: Überschrift (optional) · render(power) → HTML-Text; power = economy.powerStatus
  //   (Tarif, Ausfall, backup, powered, Verbrauch, Kosten pro Stunde) · onClick(e): Klick in diesem Abschnitt
  //   (optional; false = nicht neu zeichnen). Knöpfe darin rufen nur Funktionen aus core/ auf.
  //   Gibt eine Funktion zurück, die den Abschnitt wieder entfernt. Gleiche id ersetzt den alten Abschnitt.
  function addPowerSection({ id, title = '', render: renderSection, onClick = null }) {
    const old = powerSections.findIndex((x) => x.id === id);
    const entry = { id, title, render: renderSection, onClick };
    if (old >= 0) powerSections[old] = entry;
    else powerSections.push(entry);
    queueRender();
    return () => {
      const i = powerSections.indexOf(entry);
      if (i >= 0) powerSections.splice(i, 1);
      queueRender();
    };
  }

  return {
    open: openPanel,
    close,
    isOpen: () => open,
    addPowerSection,
    refresh: () => queueRender(),
    // Für Tests und Sprünge aus anderen Stellen: Reiter wählen
    showTab(id) {
      if (!TABS.some((t) => t.id === id)) return;
      tab = id;
      render(true);
    },
  };
}
