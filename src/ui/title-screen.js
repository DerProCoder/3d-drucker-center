// Titel- und Pausenbildschirm: Weiterspielen/Spiel starten, Neues Spiel, Grafikstufe, Gerät (PC oder Tablet), Sprache.
// Beim allerersten Start wird zuerst gefragt, über welches Gerät man spielt – danach steht die passende Steuerung da.
// Ein Sprachwechsel (#69) baut den Bildschirm sofort neu und setzt <html lang>.
import { QUALITY_LEVELS } from '../world/graphics.js';
import { LANGUAGES, getLanguage, setLanguage, subscribe, t } from '../core/i18n.js';

// Steuerungsübersicht: [Taste(n), Text]; Tasten als Schlüssel unter controls.kbd werden übersetzt
const kbd = (keys) => keys.map((k) => `<kbd>${k.startsWith('controls.') ? t(k) : k}</kbd>`).join('');
const keyList = (rows) => rows.map(([keys, text]) => `\n  <span>${kbd(keys)} ${t(text)}</span>`).join('');
const PC_KEYS = [
  [['W', 'A', 'S', 'D'], 'controls.walk'],
  [['C'], 'controls.sneakHold'],
  [['controls.kbd.mouse'], 'controls.look'],
  [['controls.kbd.click'], 'controls.use'],
  [['controls.kbd.wheel'], 'controls.chooseSpool'],
  [['E'], 'controls.pickUp'],
  [['F'], 'controls.throw'],
  [['Q'], 'controls.toStorage'],
  [['G'], 'controls.tablet'],
  [['M'], 'controls.sound'],
  [['Esc'], 'controls.pause'],
];
const TABLET_KEYS = [
  [['controls.kbd.dragLeft'], 'controls.walk'],
  [['controls.kbd.swipeRight'], 'controls.look'],
  [['controls.kbd.tap'], 'controls.use'],
  [['✋'], 'controls.pickUp'],
  [['🤾'], 'controls.throw'],
  [['↩'], 'controls.toStorage'],
  [['🔄'], 'controls.switchSpool'],
  [['🧎'], 'controls.sneak'],
  [['📱'], 'controls.tablet'],
  [['⏸'], 'controls.pause'],
];

const setDocumentLanguage = () => { document.documentElement.lang = getLanguage(); };

// onPlay: Maus einfangen bzw. Touch-Steuerung einschalten und spielen · onNewGame: Spielstand löschen und neu laden
// onQuality(q): Grafikstufe speichern und neu laden · gpu: { name, software } aus graphics.js
// device: 'pc' | 'tablet' | null (noch nicht gefragt) · suggested: Vorschlag beim Fragen · onDevice(d): gewählt
export function createTitleScreen({ overlay, hasSave, quality, gpu, device, suggested, onPlay, onNewGame, onQuality, onDevice }) {
  let paused = false;
  let gameOverStats = null; // gesetzt, sobald die Pleite-Anzeige steht
  let kicker;
  let playButton;

  function render() {
    const qualityButtons = QUALITY_LEVELS
      .map((q) => `<button class="seg ${q === quality ? 'active' : ''}" data-quality="${q}">${t(`title.quality.${q}`)}</button>`)
      .join('');
    const languageButtons = LANGUAGES
      .map((l) => `<button class="seg ${l.id === getLanguage() ? 'active' : ''}" data-lang="${l.id}" title="${l.name}" lang="${l.id}">${l.short}</button>`)
      .join('');

    overlay.innerHTML = `
    <div class="title-bg"></div>
    <div class="title-card">
      <div class="title-kicker" data-kicker></div>
      <h1 class="title-logo">DRUCKER<span>CENTER</span></h1>
      <p class="title-tagline">${t('title.tagline')}</p>
      <div class="title-device" data-device-ask>
        <p>${t('title.deviceAsk')}</p>
        <div class="title-device-choices">
          <button data-device="pc" class="${suggested === 'pc' ? 'suggested' : ''}"><span>🖥️</span>${t('title.devicePc')}<small>${t('title.devicePcHint')}</small></button>
          <button data-device="tablet" class="${suggested === 'tablet' ? 'suggested' : ''}"><span>📱</span>${t('title.deviceTablet')}<small>${t('title.deviceTabletHint')}</small></button>
        </div>
      </div>
      <div class="title-buttons" data-main>
        <button class="title-play" data-play>${hasSave ? t('title.continue') : t('title.play')}</button>
        ${hasSave ? `<button class="title-secondary" data-new>${t('title.newGame')}</button>` : ''}
      </div>
      <div class="title-quality" data-main>${t('title.graphics')} <div class="segments">${qualityButtons}</div></div>
      <div class="title-quality" data-main>${t('title.device')} <div class="segments">
        <button class="seg" data-device="pc">🖥️ ${t('title.devicePc')}</button><button class="seg" data-device="tablet">📱 ${t('title.deviceTablet')}</button>
      </div></div>
      <div class="title-quality title-language">${t('title.language')} <div class="segments">${languageButtons}</div></div>
      ${gpu ? `<div class="title-gpu ${gpu.software ? 'warn' : ''}">🖥️ ${gpu.name}${gpu.software
        ? `<br><strong>${t('title.gpuSoftware')}</strong>
           ${t('title.gpuSoftwareHelp')}`
        : ''}</div>` : ''}
      <div class="title-keys" data-main data-keys></div>
      <div class="title-save" data-save-note>${hasSave ? t('title.saveFound') : t('title.saveAuto')}</div>
    </div>
    <div class="title-resume">${t('title.resume')}</div>
  `;
    kicker = overlay.querySelector('[data-kicker]');
    playButton = overlay.querySelector('[data-play]');
    showDevice();
    showPaused();
  }

  // Gerät anzeigen: Frage, solange keins gewählt ist, sonst Steuerungsübersicht und Umschalter
  function showDevice() {
    overlay.querySelector('[data-device-ask]').hidden = !!device;
    for (const el of overlay.querySelectorAll('[data-main]')) el.hidden = !device;
    for (const el of overlay.querySelectorAll('.seg[data-device]')) el.classList.toggle('active', el.dataset.device === device);
    overlay.querySelector('[data-keys]').innerHTML = keyList(device === 'tablet' ? TABLET_KEYS : PC_KEYS);
  }

  // „Pause“ über dem Logo; im Pausenmenü heißt der Knopf immer „Weiterspielen“
  function showPaused() {
    kicker.textContent = paused ? t('title.pause') : '';
    playButton.textContent = paused || hasSave ? t('title.continue') : t('title.play');
  }

  function renderGameOver() {
    const s = gameOverStats;
    const line = [
      t('title.gameOver.day', { day: s.day }),
      t('title.gameOver.deliveries', { count: s.deliveries }),
      t('title.gameOver.prints', { count: s.printsDone }),
      t('title.gameOver.failures', { count: s.failures }),
    ].join(' · ');
    overlay.querySelector('.title-card').innerHTML = `
        <div class="title-kicker">${t('title.gameOver.kicker')}</div>
        <h1 class="title-logo">${t('title.gameOver.logo')}<span>${t('title.gameOver.logoAccent')}</span></h1>
        <p class="title-tagline">${t('title.gameOver.tagline')}</p>
        <p class="title-save">${line}</p>
        <div class="title-buttons"><button class="title-play" data-restart>${t('title.gameOver.restart')}</button></div>`;
    overlay.querySelector('[data-restart]').addEventListener('click', onNewGame);
  }

  setDocumentLanguage();
  render();

  // Sprache gewechselt: alles neu beschriften (Zustand Pause/Gerät/Pleite bleibt)
  subscribe(() => {
    setDocumentLanguage();
    render();
    if (gameOverStats) renderGameOver();
  });

  overlay.addEventListener('click', (e) => {
    const lang = e.target.closest('[data-lang]')?.dataset.lang;
    if (lang) {
      setLanguage(lang);
      return;
    }
    const chosen = e.target.closest('[data-device]')?.dataset.device;
    if (chosen) {
      device = chosen;
      showDevice();
      onDevice(chosen);
    } else if (overlay.classList.contains('resume') || e.target.closest('[data-play]')) onPlay();
    else if (e.target.closest('[data-new]')) {
      if (confirm(t('title.confirmNewGame'))) onNewGame();
    } else {
      const q = e.target.closest('[data-quality]')?.dataset.quality;
      if (q && q !== quality) onQuality(q);
    }
  });

  return {
    // paused: kleiner Hinweis „Pause“ über dem Logo
    show(isPaused) {
      paused = !!isPaused;
      showPaused();
      overlay.classList.remove('hidden', 'resume');
    },
    // Nach dem PC: statt des Pausenmenüs nur ein Hinweis, ein Klick irgendwohin spielt weiter. Der Browser fängt
    // die Maus nach Esc nicht von selbst wieder ein, dafür braucht es einen Klick.
    showResume() {
      overlay.classList.remove('hidden');
      overlay.classList.add('resume');
    },
    isResume: () => !overlay.classList.contains('hidden') && overlay.classList.contains('resume'),
    hide() {
      overlay.classList.add('hidden');
      overlay.classList.remove('resume');
    },
    // Pleite: nur noch ein neues Spiel ist möglich
    showGameOver(stats) {
      gameOverStats = stats;
      renderGameOver();
      overlay.classList.remove('hidden');
    },
  };
}
