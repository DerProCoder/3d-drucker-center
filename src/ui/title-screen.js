// Titel- und Pausenbildschirm: Weiterspielen/Spiel starten, Neues Spiel, Grafikstufe, Gerät (PC oder Tablet).
// Beim allerersten Start wird zuerst gefragt, über welches Gerät man spielt – danach steht die passende Steuerung da.
import { QUALITY_LEVELS } from '../world/graphics.js';

const PC_KEYS = `
  <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> laufen</span>
  <span><kbd>C</kbd> halten: schleichen</span>
  <span><kbd>Maus</kbd> umschauen</span>
  <span><kbd>Klick</kbd> benutzen</span>
  <span><kbd>Mausrad</kbd> Spule wählen</span>
  <span><kbd>E</kbd> Drucker aufheben</span>
  <span><kbd>F</kbd> Drucker werfen</span>
  <span><kbd>Q</kbd> zurück ins Lager</span>
  <span><kbd>M</kbd> Ton an/aus</span>
  <span><kbd>Esc</kbd> Pause</span>`;
const TABLET_KEYS = `
  <span><kbd>Links ziehen</kbd> laufen</span>
  <span><kbd>Rechts wischen</kbd> umschauen</span>
  <span><kbd>Antippen</kbd> benutzen</span>
  <span><kbd>✋</kbd> Drucker aufheben</span>
  <span><kbd>🤾</kbd> Drucker werfen</span>
  <span><kbd>↩</kbd> zurück ins Lager</span>
  <span><kbd>🔄</kbd> Spule wechseln</span>
  <span><kbd>🧎</kbd> schleichen</span>
  <span><kbd>⏸</kbd> Pause</span>`;

// onPlay: Maus einfangen bzw. Touch-Steuerung einschalten und spielen · onNewGame: Spielstand löschen und neu laden
// onQuality(q): Grafikstufe speichern und neu laden · gpu: { name, software } aus graphics.js
// device: 'pc' | 'tablet' | null (noch nicht gefragt) · suggested: Vorschlag beim Fragen · onDevice(d): gewählt
export function createTitleScreen({ overlay, hasSave, quality, gpu, device, suggested, onPlay, onNewGame, onQuality, onDevice }) {
  const qualityButtons = QUALITY_LEVELS
    .map((q) => `<button class="seg ${q === quality ? 'active' : ''}" data-quality="${q}">${q[0].toUpperCase()}${q.slice(1)}</button>`)
    .join('');

  overlay.innerHTML = `
    <div class="title-bg"></div>
    <div class="title-card">
      <div class="title-kicker" data-kicker></div>
      <h1 class="title-logo">DRUCKER<span>CENTER</span></h1>
      <p class="title-tagline">Deine eigene 3D-Druckerhalle</p>
      <div class="title-device" data-device-ask>
        <p>Über welches Gerät spielst du?</p>
        <div class="title-device-choices">
          <button data-device="pc" class="${suggested === 'pc' ? 'suggested' : ''}"><span>🖥️</span>PC<small>Maus und Tastatur</small></button>
          <button data-device="tablet" class="${suggested === 'tablet' ? 'suggested' : ''}"><span>📱</span>Tablet<small>Touch-Steuerung</small></button>
        </div>
      </div>
      <div class="title-buttons" data-main>
        <button class="title-play" data-play>${hasSave ? '▶ Weiterspielen' : '▶ Spiel starten'}</button>
        ${hasSave ? '<button class="title-secondary" data-new>Neues Spiel</button>' : ''}
      </div>
      <div class="title-quality" data-main>Grafik <div class="segments">${qualityButtons}</div></div>
      <div class="title-quality" data-main>Gerät <div class="segments">
        <button class="seg" data-device="pc">🖥️ PC</button><button class="seg" data-device="tablet">📱 Tablet</button>
      </div></div>
      ${gpu ? `<div class="title-gpu ${gpu.software ? 'warn' : ''}">🖥️ ${gpu.name}${gpu.software
        ? `<br><strong>Der Browser rendert ohne Grafikkarte – das Spiel wird stark ruckeln.</strong>
           Schalte in den Browser-Einstellungen unter System „Grafikbeschleunigung verwenden“ ein und starte den Browser neu.`
        : ''}</div>` : ''}
      <div class="title-keys" data-main data-keys></div>
      <div class="title-save" data-save-note>${hasSave ? '💾 Spielstand gefunden – dein Fortschritt wird automatisch gespeichert' : '💾 Dein Fortschritt wird automatisch gespeichert'}</div>
    </div>
    <div class="title-resume">🖱️ Klicken, um weiterzuspielen</div>
  `;

  const kicker = overlay.querySelector('[data-kicker]');
  // Gerät anzeigen: Frage, solange keins gewählt ist, sonst Steuerungsübersicht und Umschalter
  function showDevice() {
    overlay.querySelector('[data-device-ask]').hidden = !!device;
    for (const el of overlay.querySelectorAll('[data-main]')) el.hidden = !device;
    for (const el of overlay.querySelectorAll('.seg[data-device]')) el.classList.toggle('active', el.dataset.device === device);
    overlay.querySelector('[data-keys]').innerHTML = device === 'tablet' ? TABLET_KEYS : PC_KEYS;
  }
  showDevice();
  const playButton = overlay.querySelector('[data-play]');
  const startLabel = playButton.textContent;

  overlay.addEventListener('click', (e) => {
    const chosen = e.target.closest('[data-device]')?.dataset.device;
    if (chosen) {
      device = chosen;
      showDevice();
      onDevice(chosen);
    } else if (overlay.classList.contains('resume') || e.target.closest('[data-play]')) onPlay();
    else if (e.target.closest('[data-new]')) {
      if (confirm('Wirklich ein neues Spiel starten? Dein bisheriger Spielstand wird gelöscht.')) onNewGame();
    } else {
      const q = e.target.closest('[data-quality]')?.dataset.quality;
      if (q && q !== quality) onQuality(q);
    }
  });

  return {
    // paused: kleiner Hinweis „Pause“ über dem Logo
    show(paused) {
      kicker.textContent = paused ? 'Pause' : '';
      playButton.textContent = paused ? '▶ Weiterspielen' : startLabel;
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
      overlay.querySelector('.title-card').innerHTML = `
        <div class="title-kicker">Game Over</div>
        <h1 class="title-logo">PLEITE<span>!</span></h1>
        <p class="title-tagline">Die Bank hat die Halle übernommen. Kater Düsentrieb zieht zu Tante Erika.</p>
        <p class="title-save">Tag ${stats.day} · ${stats.deliveries} Aufträge geliefert · ${stats.printsDone} Drucke · ${stats.failures} Fehldrucke</p>
        <div class="title-buttons"><button class="title-play" data-restart>↻ Neues Spiel</button></div>`;
      overlay.querySelector('[data-restart]').addEventListener('click', onNewGame);
      overlay.classList.remove('hidden');
    },
  };
}
