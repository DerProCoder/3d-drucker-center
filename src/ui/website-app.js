// PC-App „Website“ (#55): eigene Firmen-Website einrichten und gestalten, mit Live-Vorschau (kleiner Browser mit
// Adresszeile, Kopfzeile, Willkommensnachricht, Angebotskarten und „Jetzt mieten“-Knopf) und Statistik.
// Logik, Einstellungen und Speichern stehen in core/website.js (#54) – die App speichert nichts selbst.
//
// Ablauf: kein Website-Server online → Hinweis auf den Server-Shop · Hochfahren → Fortschrittsbalken ·
// noch nicht eingerichtet → Assistent in 6 Schritten (Name/Logo, Farben, Schrift, Texte, Angebote, Fertig → publish) ·
// danach Reiter „Gestaltung“ (alles jederzeit änderbar, auch Layout, Muster, Ecken, Knöpfe, Dunkelmodus) und „Statistik“.
//
// Sicherheit: Eingaben der Spieler stehen NIE in HTML-Strings. render() liefert nur feste Bausteine; Feldwerte und die
// Vorschau setzt attach() bzw. die Eingabe-Behandlung per value/textContent. Farben nur nach normalizeColor.
// Die App ist nicht „live“ (shop.js): Beim Tippen wird nur die Vorschau aktualisiert, damit Fokus und Cursor bleiben.
// liveUpdate (alle 250 ms) aktualisiert Hochfahr-Balken und Statistik und meldet, wenn sich der Zustand geändert hat.
import {
  BUTTON_STYLES, COLOR_SCHEMES, CORNERS, FONTS, LAYOUTS, LOGO_SUGGESTIONS, MIN_CONTRAST, PATTERNS, TEXT_LIMITS,
  domainFor, fontById, normalizeColor, offerPrices, themeColors,
} from '../core/website.js';
import { euro } from '../core/format.js';

const STEPS = [
  { id: 'identity', name: 'Name & Logo', short: 'Name' },
  { id: 'colors', name: 'Farben', short: 'Farben' },
  { id: 'font', name: 'Schrift', short: 'Schrift' },
  { id: 'texts', name: 'Texte', short: 'Texte' },
  { id: 'offers', name: 'Angebote', short: 'Angebote' },
  { id: 'done', name: 'Fertig', short: 'Fertig' },
];
// Platzhalter in der Vorschau für leere Felder (blass dargestellt)
const PLACEHOLDER = {
  name: 'Deine Firma',
  welcome: 'Willkommen bei uns!',
  slogan: 'Dein Slogan steht hier',
  about: 'Erzähl deinen Kunden, wer ihr seid und was euch ausmacht.',
};
const COLOR_FIELDS = [['primary', 'Hauptfarbe'], ['background', 'Hintergrund'], ['text', 'Textfarbe']];
const pct = (x) => `${Math.round(x * 100)} %`;
const num = (x, digits = 0) => x.toLocaleString('de-DE', { maximumFractionDigits: digits });

// Kleiner DOM-Helfer: Element mit Klasse und (reinem) Text
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// website: core/website.js (Website-Instanz) oder null (dann wie „kein Website-Server“)
export function createWebsiteApp({ website = null }) {
  let step = 0;            // Schritt im Assistenten (0 … 5)
  let tab = 'design';      // nach der Einrichtung: 'design' | 'stats'
  let shownKey = null;     // Zustand beim letzten Zeichnen – ändert er sich, zeichnet shop.js neu
  let container = null;    // Inhalt des PC-Fensters, solange die App offen ist

  const state = () => website?.state ?? 'off';
  const settings = () => website.settings;
  const viewKey = () => `${state()}|${website?.published ? 1 : 0}|${website?.storageAvailable ? 1 : 0}`;
  const wizard = () => state() === 'setup' && !website.published;

  // ---------- Bausteine (nur feste Texte, keine Spielereingaben) ----------

  const choiceButtons = (key, list) => `
    <div class="web-choices">
      ${list.map((o) => `<button class="web-choice${settings()[key] === o.id ? ' active' : ''}" data-web-set="${key}" data-web-value="${o.id}">${o.name}</button>`).join('')}
    </div>`;

  const textField = (key, label, { multiline = false, hint = '' } = {}) => `
    <label class="web-field">
      <span class="web-label">${label}<small data-web-count="${key}"></small></span>
      ${multiline
    ? `<textarea rows="4" data-web-field="${key}" data-keep-focus="web-${key}" spellcheck="false"></textarea>`
    : `<input type="text" data-web-field="${key}" data-keep-focus="web-${key}" autocomplete="off" spellcheck="false">`}
      ${hint ? `<small class="web-hint">${hint}</small>` : ''}
    </label>`;

  function sectionIdentity() {
    return `
      ${textField('name', 'Firmenname')}
      ${textField('logo', 'Logo (Symbol oder Emoji)')}
      <div class="web-logos">
        ${LOGO_SUGGESTIONS.map((e, i) => `<button class="web-logo${settings().logo === e ? ' active' : ''}" data-web-logo="${i}" title="Als Logo nehmen">${e}</button>`).join('')}
      </div>`;
  }

  function sectionColors() {
    return `
      <div class="web-label">Fertige Farbschemata</div>
      <div class="web-schemes">
        ${COLOR_SCHEMES.map((c) => `
          <button class="web-scheme" data-web-scheme="${c.id}" title="${c.name}" style="--s-bg:${normalizeColor(c.background)};--s-text:${normalizeColor(c.text)};--s-primary:${normalizeColor(c.primary)}">
            <span class="web-scheme-swatch"><i></i><b>Aa</b></span><span class="web-scheme-name">${c.name}</span>
          </button>`).join('')}
      </div>
      <div class="web-colors">
        ${COLOR_FIELDS.map(([key, label]) => `
          <label class="web-color">
            <span class="web-label">${label}</span>
            <span class="web-color-row">
              <input type="color" data-web-color="${key}">
              <input type="text" class="web-hex" data-web-hex="${key}" data-keep-focus="web-hex-${key}" maxlength="7" autocomplete="off" spellcheck="false">
            </span>
          </label>`).join('')}
      </div>
      <div class="web-contrast" data-web-contrast></div>`;
  }

  function sectionFont() {
    return `
      <div class="web-fonts">
        ${FONTS.map((f) => `
          <button class="web-font${settings().font === f.id ? ' active' : ''}" data-web-set="font" data-web-value="${f.id}" style="font-family:${f.css.replace(/"/g, '&quot;')}">
            <b>Aa</b><span>${f.name}</span>
          </button>`).join('')}
      </div>`;
  }

  function sectionTexts() {
    return `
      ${textField('welcome', 'Willkommensnachricht (Überschrift)')}
      ${textField('slogan', 'Slogan')}
      ${textField('about', 'Über uns', { multiline: true })}`;
  }

  function sectionOffers() {
    const s = settings();
    const nas = website.storageAvailable;
    const p = offerPrices();
    return `
      <div class="web-offers">
        <button class="web-offer${s.offerVms ? ' active' : ''}" data-web-toggle="offerVms">
          <span class="web-check">${s.offerVms ? '✓' : ''}</span>
          <span><b>🖥️ VMs mieten</b><small>Virtuelle Server ab ${euro.format(p.vmFrom)} pro Stunde</small></span>
        </button>
        <button class="web-offer${s.offerStorage && nas ? ' active' : ''}${nas ? '' : ' locked'}" data-web-toggle="offerStorage" ${nas ? '' : 'disabled'}>
          <span class="web-check">${s.offerStorage && nas ? '✓' : ''}</span>
          <span><b>💾 Speicher mieten</b><small>${nas ? `${euro.format(p.storagePerTb)} je TB und Stunde` : 'Braucht eine NAS – im Server-Shop (Serie „NAS“)'}</small></span>
        </button>
      </div>`;
  }

  function sectionLook() {
    const s = settings();
    return `
      <div class="web-label">Layout</div>${choiceButtons('layout', LAYOUTS)}
      <div class="web-label">Hintergrundmuster</div>${choiceButtons('pattern', PATTERNS)}
      <div class="web-label">Ecken</div>${choiceButtons('corners', CORNERS)}
      <div class="web-label">Knopf-Stil</div>${choiceButtons('buttons', BUTTON_STYLES)}
      <button class="web-switch${s.dark ? ' on' : ''}" data-web-toggle="dark"><i></i>Dunkelmodus ${s.dark ? 'an' : 'aus'}</button>`;
  }

  // Bewertung: Felder, Kontrast, Bonus und Hinweise (Texte aus core, ohne Spielereingaben – trotzdem per textContent)
  const scoreBox = () => '<div class="web-score" data-web-score></div>';

  function renderWizard() {
    const s = STEPS[step];
    const bodies = [sectionIdentity, sectionColors, sectionFont, sectionTexts, sectionOffers];
    const body = s.id === 'done'
      ? `<p class="web-intro">Fast geschafft! So sieht deine Website gerade aus. Fehlt noch etwas, geh einfach zurück –
           alles bleibt auch nach dem Veröffentlichen im Reiter „Gestaltung“ änderbar.</p>
         ${scoreBox()}
         <div class="web-problems" data-web-problems></div>
         <button class="buy web-publish" data-web-publish>🚀 Website veröffentlichen</button>`
      : bodies[step]();
    return `
      <div class="web-steps">
        ${STEPS.map((x, i) => `<button title="${x.name}" class="web-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}" data-web-step="${i}"><b>${i < step ? '✓' : i + 1}</b><span>${x.short}</span></button>`).join('')}
      </div>
      <h3 class="web-step-title">Schritt ${step + 1} von ${STEPS.length}: ${s.name}</h3>
      ${body}
      <div class="web-nav">
        <button class="secondary" data-web-step="${step - 1}" ${step === 0 ? 'disabled' : ''}>← Zurück</button>
        ${step < STEPS.length - 1 ? `<button class="buy" data-web-step="${step + 1}">Weiter →</button>` : ''}
      </div>`;
  }

  function renderDesign() {
    const group = (title, body) => `<section class="web-group"><h3>${title}</h3>${body}</section>`;
    return `
      ${scoreBox()}
      ${group('Name & Logo', sectionIdentity())}
      ${group('Farben', sectionColors())}
      ${group('Schrift', sectionFont())}
      ${group('Texte', sectionTexts())}
      ${group('Angebote', sectionOffers())}
      ${group('Aussehen', sectionLook())}`;
  }

  function renderStats() {
    return '<div class="web-stats" data-web-stats></div>';
  }

  // Status oben: offline (mit Grund und Knopf zum Server-Shop), Hochfahren (Balken), live
  function renderStatus() {
    const st = state();
    if (st === 'off') {
      return `
        <div class="web-status off">
          <div class="web-status-icon">🔌</div>
          <div class="web-status-text">
            <b>Kein Website-Server online</b>
            <span data-web-reason></span>
            <span>Website-Server (Serie „Web“) in einen Serverschrank einbauen und per Netzwerkkabel über Switch bzw. Firewall ans Internet anschließen – dann fährt die Website hoch.</span>
          </div>
          <button class="buy" data-open="servers">Zum Server-Shop</button>
        </div>`;
    }
    if (st === 'booting') {
      return `
        <div class="web-status booting">
          <div class="web-status-icon">⏳</div>
          <div class="web-status-text">
            <b>Website fährt hoch …</b>
            <div class="web-boot"><div class="web-boot-bar" data-web-boot></div></div>
          </div>
        </div>`;
    }
    if (st === 'live') {
      return `
        <div class="web-status live">
          <span class="web-live-dot"></span><b>Live</b>
          <span class="web-domain" data-web-domain></span>
          <span class="web-status-meta" data-web-meta></span>
        </div>`;
    }
    return ''; // 'setup': Assistent bzw. Reiter
  }

  function render() {
    shownKey = viewKey();
    if (!website) return `<div class="web-app">${renderStatus()}</div>`;
    const st = state();
    const showEditor = website.published || st === 'setup';
    if (!showEditor) return `<div class="web-app single">${renderStatus()}</div>`;
    const editor = wizard()
      ? renderWizard()
      : `<div class="web-tabs">
           <button class="web-tab${tab === 'design' ? ' active' : ''}" data-web-tab="design">🎨 Gestaltung</button>
           <button class="web-tab${tab === 'stats' ? ' active' : ''}" data-web-tab="stats">📊 Statistik</button>
         </div>
         ${tab === 'stats' ? renderStats() : renderDesign()}`;
    return `
      <div class="web-app">
        ${renderStatus()}
        <div class="web-main">
          <div class="web-editor" data-keep-scroll="web-editor">${editor}</div>
          <div class="web-preview-wrap">
            <div class="web-preview-label">Live-Vorschau</div>
            <div class="web-browser">
              <div class="web-browser-bar">
                <span class="web-dots"><i></i><i></i><i></i></span>
                <span class="web-address"><span class="web-lock">🔒</span><span data-web-address></span></span>
              </div>
              <div class="web-page-scroll" data-keep-scroll="web-page"><div class="web-page" data-web-page></div></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ---------- Vorschau (nur DOM + textContent) ----------

  function buildPreview(page) {
    const s = settings();
    const colors = themeColors(s);
    const font = fontById(s.font);
    page.className = `web-page layout-${s.layout} pattern-${s.pattern} corners-${s.corners} buttons-${s.buttons}${s.dark ? ' dark' : ''}`;
    // Farben nur geprüft setzen (normalizeColor), Schrift nur aus der festen Liste
    page.style.setProperty('--wp-primary', normalizeColor(colors.primary) ?? '#1f8fd6');
    page.style.setProperty('--wp-bg', normalizeColor(colors.background) ?? '#ffffff');
    page.style.setProperty('--wp-text', normalizeColor(colors.text) ?? '#1b2733');
    page.style.setProperty('--wp-btn-text', normalizeColor(colors.buttonText) ?? '#ffffff');
    page.style.fontFamily = font.css;

    const textOr = (node, key) => {
      const value = String(s[key] ?? '').trim();
      node.textContent = value || PLACEHOLDER[key];
      node.classList.toggle('wp-empty', !value);
      return node;
    };
    const button = (text) => el('span', 'wp-btn', text);
    page.replaceChildren();

    // Kopfzeile: Logo, Name, Menü
    const header = el('header', 'wp-header');
    const brand = el('div', 'wp-brand');
    brand.append(el('span', 'wp-logo', s.logo || '🌐'), textOr(el('span', 'wp-name'), 'name'));
    const nav = el('nav', 'wp-nav');
    for (const item of ['Angebote', 'Über uns', 'Kontakt']) nav.append(el('span', '', item));
    header.append(brand, nav);

    // Willkommen
    const hero = el('section', 'wp-hero');
    const heroText = el('div', 'wp-hero-text');
    heroText.append(textOr(el('h1', 'wp-welcome'), 'welcome'), textOr(el('p', 'wp-slogan'), 'slogan'), button('Jetzt mieten'));
    const heroArt = el('div', 'wp-hero-art', s.logo || '🌐');
    hero.append(heroText, heroArt);

    // Angebote mit Preisen
    const offers = el('section', 'wp-offers');
    offers.append(el('h2', 'wp-h2', 'Unsere Angebote'));
    const cards = el('div', 'wp-cards');
    const p = offerPrices();
    const storage = s.offerStorage && website.storageAvailable;
    const list = [
      s.offerVms && ['🖥️', 'Virtuelle Server', `ab ${euro.format(p.vmFrom)} / Std.`, 'Eigene VM mit RAM und Cores nach Wunsch – sofort startklar.'],
      storage && ['💾', 'Cloud-Speicher', `${euro.format(p.storagePerTb)} je TB / Std.`, 'Sicherer Speicherplatz auf unseren NAS-Servern.'],
    ].filter(Boolean);
    if (!list.length) cards.append(el('p', 'wp-empty', 'Noch keine Angebote ausgewählt'));
    for (const [icon, title, price, text] of list) {
      const card = el('div', 'wp-card');
      card.append(el('div', 'wp-card-icon', icon), el('h3', '', title), el('div', 'wp-price', price), el('p', '', text), button('Jetzt mieten'));
      cards.append(card);
    }
    offers.append(cards);

    // Über uns
    const about = el('section', 'wp-about');
    about.append(el('h2', 'wp-h2', 'Über uns'), textOr(el('p', 'wp-about-text'), 'about'));

    const footer = el('footer', 'wp-footer');
    footer.textContent = `© ${String(s.name ?? '').trim() || PLACEHOLDER.name} · Impressum · Datenschutz`;

    page.append(header, hero, offers, about, footer);
  }

  // Bewertung und Hinweise (Lesbarkeit) – Texte aus core/website.js, per textContent
  function updateScore(root) {
    const report = website.design();
    const box = root.querySelector('[data-web-score]');
    if (box) {
      box.replaceChildren();
      const head = el('div', 'web-score-head');
      const meter = el('div', 'web-score-meter');
      const bar = el('div', 'web-score-bar');
      bar.style.width = `${Math.round((report.bonus / 0.2) * 100)}%`;
      meter.append(bar);
      head.append(
        el('span', '', `Felder ${report.filled} / ${report.total}`),
        el('span', report.readable ? 'good' : 'bad', `Kontrast ${num(report.contrast, 2)} : 1`),
        el('b', '', `+${num(report.bonus * 100, 1)} % Anfragen`),
      );
      box.append(head, meter);
      for (const hint of report.hints) {
        const bad = hint.startsWith('Text schlecht lesbar');
        box.append(el('div', `web-hint-line${bad ? ' bad' : ''}`, `${bad ? '⚠️' : '💡'} ${hint}`));
      }
      if (!report.hints.length) box.append(el('div', 'web-hint-line good', '✨ Top gestaltet – volle Bonus-Anfragen'));
    }
    const contrast = root.querySelector('[data-web-contrast]');
    if (contrast) {
      contrast.className = `web-contrast ${report.readable ? 'good' : 'bad'}`;
      contrast.textContent = report.readable
        ? `✓ Gut lesbar (Kontrast ${num(report.contrast, 2)} : 1)`
        : `⚠️ Text schlecht lesbar – weniger Kunden (Kontrast ${num(report.contrast, 2)} : 1, gut ab ${num(MIN_CONTRAST, 1)} : 1)`;
    }
    const problems = root.querySelector('[data-web-problems]');
    if (problems) {
      const list = website.publishProblems();
      problems.replaceChildren(...list.map((p) => el('div', 'web-hint-line bad', `✗ ${p}`)));
      const btn = root.querySelector('[data-web-publish]');
      if (btn) btn.disabled = list.length > 0;
    }
  }

  // Zähler „12 / 40“ an den Textfeldern
  function updateCounts(root) {
    for (const node of root.querySelectorAll('[data-web-count]')) {
      const key = node.dataset.webCount;
      node.textContent = ` ${Array.from(settings()[key] ?? '').length} / ${TEXT_LIMITS[key]}`;
    }
  }

  // Alles, was von den Einstellungen abhängt, ohne die Eingabefelder anzufassen
  function updatePreview(root = container) {
    if (!root || !website) return;
    const page = root.querySelector('[data-web-page]');
    if (page) buildPreview(page);
    const address = root.querySelector('[data-web-address]');
    if (address) address.textContent = domainFor(settings().name);
    const domain = root.querySelector('[data-web-domain]');
    if (domain) domain.textContent = domainFor(settings().name);
    updateScore(root);
    updateCounts(root);
  }

  // Feldwerte setzen (per value, nie als HTML)
  function fillFields(root) {
    const s = settings();
    for (const input of root.querySelectorAll('[data-web-field]')) input.value = s[input.dataset.webField] ?? '';
    for (const input of root.querySelectorAll('[data-web-color]')) input.value = normalizeColor(s[input.dataset.webColor]) ?? '#000000';
    for (const input of root.querySelectorAll('[data-web-hex]')) {
      input.value = normalizeColor(s[input.dataset.webHex]) ?? '';
      input.classList.remove('invalid');
    }
  }

  // Nach dem Zeichnen (shop.js): Felder füllen, Vorschau aufbauen, Status und Statistik
  function attach(root) {
    container = root;
    if (!website) return;
    fillFields(root);
    updatePreview(root);
    liveUpdate(root);
  }

  // ---------- Live (alle 250 ms) ----------

  function renderStatsInto(box) {
    const st = website.stats();
    const t = st.today;
    const tile = (label, value, sub = '') => {
      const node = el('div', 'web-stat');
      node.append(el('span', '', label), el('b', '', value));
      if (sub) node.append(el('small', '', sub));
      return node;
    };
    const tiles = el('div', 'web-stat-grid');
    tiles.append(
      tile('Besucher heute', num(t.visitors)),
      tile('Online-Anfragen heute', num(t.requests), t.missed ? `${num(t.missed)} verpasst` : ''),
      tile('Davon angenommen', num(t.accepted), t.requests ? pct(Math.min(1, t.accepted / t.requests)) : ''),
      tile('Einnahmen heute', euro.format(t.income), `gesamt ${euro.format(st.totalIncome)}`),
      tile('Auslastung Server', pct(st.utilization), `${st.servers} online · ${st.counted} zählen`),
      tile('Anfragen pro Tag', num(st.requestsPerDay, 1), `${st.waiting} warten · ${st.contracts} Verträge`),
    );
    // Verlauf der letzten Tage als Balken (Besucher), heute zuerst rechts
    const days = [...st.history].reverse().concat([t]);
    const max = Math.max(1, ...days.map((d) => d.visitors));
    const chart = el('div', 'web-chart');
    for (const d of days) {
      const col = el('div', 'web-chart-col');
      const bar = el('div', 'web-chart-bar');
      bar.style.height = `${Math.round((d.visitors / max) * 100)}%`;
      bar.title = `Tag ${d.day}: ${d.visitors} Besucher, ${d.requests} Anfragen, ${euro.format(d.income)}`;
      col.append(el('small', '', num(d.visitors)), bar, el('span', '', d === t ? 'Heute' : `Tag ${d.day}`));
      chart.append(col);
    }
    const table = el('table', 'web-history');
    const head = el('tr');
    for (const h of ['Tag', 'Besucher', 'Anfragen', 'Angen.', 'Umsatz', 'Last']) head.append(el('th', '', h));
    table.append(head);
    for (const d of [t, ...st.history]) {
      const row = el('tr');
      for (const v of [d === t ? `Heute (${d.day})` : `Tag ${d.day}`, num(d.visitors), num(d.requests), num(d.accepted), euro.format(d.income), pct(d.load)]) row.append(el('td', '', v));
      table.append(row);
    }
    const note = website.isLive ? '' : 'Die Website ist gerade nicht live – es kommen keine neuen Online-Anfragen.';
    box.replaceChildren(tiles, el('h3', '', 'Besucher der letzten Tage'), chart, table);
    if (note) box.prepend(el('div', 'web-hint-line bad', `⚠️ ${note}`));
  }

  // Gibt true zurück, wenn die App neu gezeichnet werden muss (Zustand gewechselt)
  function liveUpdate(root = container) {
    if (!root) return false;
    if (viewKey() !== shownKey) return true;
    if (!website) return false;
    const boot = root.querySelector('[data-web-boot]');
    if (boot) boot.style.width = `${Math.round(website.bootProgress * 100)}%`;
    const reason = root.querySelector('[data-web-reason]');
    if (reason) reason.textContent = (website.offlineReason() ?? '').replace(/^Kein Website-Server online( – )?/, ''); // Überschrift sagt das schon
    const meta = root.querySelector('[data-web-meta]');
    if (meta) {
      const st = website.stats();
      meta.textContent = `${st.servers} Server · ${num(st.requestsPerDay, 1)} Anfragen/Tag · heute ${num(st.today.visitors)} Besucher`;
    }
    const stats = root.querySelector('[data-web-stats]');
    if (stats) renderStatsInto(stats);
    return false;
  }

  // ---------- Eingaben ----------

  function handleInput(e) {
    if (!website) return;
    const t = e.target;
    if (t.dataset.webField) {
      const key = t.dataset.webField;
      website.setSettings({ [key]: t.value });
      // Gekürzt (Höchstlänge, Steuerzeichen)? Dann das Feld angleichen
      const clean = settings()[key];
      if (clean !== t.value) t.value = clean;
      if (key === 'logo') {
        for (const b of container?.querySelectorAll('[data-web-logo]') ?? []) b.classList.toggle('active', LOGO_SUGGESTIONS[+b.dataset.webLogo] === clean);
      }
      updatePreview();
    } else if (t.dataset.webColor) {
      const key = t.dataset.webColor;
      website.setSettings({ [key]: t.value });
      const hex = container?.querySelector(`[data-web-hex="${key}"]`);
      if (hex) { hex.value = settings()[key]; hex.classList.remove('invalid'); }
      updatePreview();
    } else if (t.dataset.webHex) {
      const key = t.dataset.webHex;
      const color = normalizeColor(t.value);
      t.classList.toggle('invalid', !color);
      if (!color) return;
      website.setSettings({ [key]: color });
      const picker = container?.querySelector(`[data-web-color="${key}"]`);
      if (picker) picker.value = color;
      updatePreview();
    }
  }

  // Tasten in den Feldern sollen die Spielsteuerung nicht erreichen (z. B. M = Ton aus); Esc schließt weiter den PC
  function handleKey(e) {
    if (e.key !== 'Escape' && e.target.closest?.('[data-web-field], [data-web-hex]')) e.stopPropagation();
  }

  // Klicks: { message, render } wie die anderen Apps
  function handleClick(e) {
    if (!website) return {};
    const t = e.target.closest('button');
    if (!t || t.disabled) return {};
    const d = t.dataset;
    if (d.webTab) {
      tab = d.webTab;
      return { render: true };
    }
    if (d.webStep !== undefined) {
      step = Math.max(0, Math.min(STEPS.length - 1, +d.webStep));
      return { render: true };
    }
    if (d.webSet) {
      website.setSettings({ [d.webSet]: d.webValue });
      return { render: true };
    }
    if (d.webScheme) {
      website.applyScheme(d.webScheme);
      return { render: true, message: `Farbschema „${COLOR_SCHEMES.find((c) => c.id === d.webScheme)?.name}“ übernommen` };
    }
    if (d.webLogo !== undefined) {
      const logo = LOGO_SUGGESTIONS[+d.webLogo];
      if (logo) website.setSettings({ logo });
      return { render: true };
    }
    if (d.webToggle) {
      website.setSettings({ [d.webToggle]: !settings()[d.webToggle] });
      return { render: true };
    }
    if (d.webPublish !== undefined) {
      const result = website.publish();
      if (!result.ok) return { message: result.reason };
      tab = 'design';
      return { render: true, message: `🚀 Website ist live: ${domainFor(settings().name)}` };
    }
    return {};
  }

  return { render, attach, liveUpdate, handleInput, handleKey, handleClick };
}
