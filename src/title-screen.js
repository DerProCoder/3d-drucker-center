// Titel- und Pausenbildschirm: Weiterspielen/Spiel starten, Neues Spiel, Grafikstufe.
import { QUALITY_LEVELS } from './graphics.js';

// onPlay: Maus einfangen und spielen · onNewGame: Spielstand löschen und neu laden
// onQuality(q): Grafikstufe speichern und neu laden · gpu: { name, software } aus graphics.js
export function createTitleScreen({ overlay, hasSave, quality, gpu, onPlay, onNewGame, onQuality }) {
  const qualityButtons = QUALITY_LEVELS
    .map((q) => `<button class="seg ${q === quality ? 'active' : ''}" data-quality="${q}">${q[0].toUpperCase()}${q.slice(1)}</button>`)
    .join('');

  overlay.innerHTML = `
    <div class="title-bg"></div>
    <div class="title-card">
      <div class="title-kicker" data-kicker></div>
      <h1 class="title-logo">DRUCKER<span>CENTER</span></h1>
      <p class="title-tagline">Deine eigene 3D-Druckerhalle</p>
      <div class="title-buttons">
        <button class="title-play" data-play>${hasSave ? '▶ Weiterspielen' : '▶ Spiel starten'}</button>
        ${hasSave ? '<button class="title-secondary" data-new>Neues Spiel</button>' : ''}
      </div>
      <div class="title-quality">Grafik <div class="segments">${qualityButtons}</div></div>
      ${gpu ? `<div class="title-gpu ${gpu.software ? 'warn' : ''}">🖥️ ${gpu.name}${gpu.software
        ? `<br><strong>Der Browser rendert ohne Grafikkarte – das Spiel wird stark ruckeln.</strong>
           Schalte in den Browser-Einstellungen unter System „Grafikbeschleunigung verwenden“ ein und starte den Browser neu.`
        : ''}</div>` : ''}
      <div class="title-keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> laufen</span>
        <span><kbd>Maus</kbd> umschauen</span>
        <span><kbd>Klick</kbd> benutzen</span>
        <span><kbd>Mausrad</kbd> Spule wählen</span>
        <span><kbd>Q</kbd> zurück ins Lager</span>
        <span><kbd>M</kbd> Ton an/aus</span>
        <span><kbd>Esc</kbd> Pause</span>
      </div>
      <div class="title-save" data-save-note>${hasSave ? '💾 Spielstand gefunden – dein Fortschritt wird automatisch gespeichert' : '💾 Dein Fortschritt wird automatisch gespeichert'}</div>
    </div>
  `;

  const kicker = overlay.querySelector('[data-kicker]');
  const playButton = overlay.querySelector('[data-play]');
  const startLabel = playButton.textContent;

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-play]')) onPlay();
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
      overlay.classList.remove('hidden');
    },
    hide() {
      overlay.classList.add('hidden');
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
