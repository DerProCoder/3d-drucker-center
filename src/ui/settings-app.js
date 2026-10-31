// App „Einstellungen“ (#68): Aussehen des Tablets wählen – Gehäusefarbe als runde Farbfelder und das Hintergrundbild
// des Startbildschirms als Vorschaubilder. Ein Klick ändert sofort und kostenlos; Logik und Speichern stehen in
// core/tablet-style.js. Läuft am PC und im Tablet (dieselbe App aus ui/shop.js). Aussehen in css/tablet.css.
import { TABLET_COLORS, TABLET_WALLPAPERS, hexToCss } from '../core/tablet-style.js';
import { tabletWallpaperUrl } from './tablet-wallpapers.js';

// style: core/tablet-style.js (TabletStyle) oder null – dann zeigt die App nur einen Hinweis
export function createSettingsApp({ style = null }) {
  function render() {
    if (!style) return '<p class="slots">Einstellungen sind gerade nicht verfügbar.</p>';
    const colors = TABLET_COLORS.map((c) => `
      <button class="tset-color${c.id === style.color ? ' selected' : ''}" data-tablet-color="${c.id}"
        title="${c.name}" aria-label="${c.name}" aria-pressed="${c.id === style.color}">
        <span class="tset-dot" style="--dot: ${hexToCss(c.hex)}"></span><span class="tset-label">${c.name}</span>
      </button>`).join('');
    const wallpapers = TABLET_WALLPAPERS.map((w) => `
      <button class="tset-wallpaper${w.id === style.wallpaper ? ' selected' : ''}" data-tablet-wallpaper="${w.id}"
        aria-pressed="${w.id === style.wallpaper}">
        <img src="${tabletWallpaperUrl(w.id, 240, 150)}" alt=""><span class="tset-label">${w.name}</span>
      </button>`).join('');
    return `
      <p class="slots">📱 So sieht dein Tablet aus (Taste G). Änderungen gelten sofort und kosten nichts.</p>
      <section>
        <h3>Tablet-Farbe</h3>
        <div class="tset-colors">${colors}</div>
      </section>
      <section>
        <h3>Hintergrundbild</h3>
        <div class="tset-wallpapers">${wallpapers}</div>
      </section>`;
  }

  // Klick im Fenster: { message, render } – render: true, wenn neu gezeichnet werden muss
  function handleClick(e) {
    if (!style) return {};
    const color = e.target.closest('[data-tablet-color]')?.dataset.tabletColor;
    if (color && style.setColor(color)) {
      const name = TABLET_COLORS.find((c) => c.id === color).name;
      return { message: `Tablet-Farbe: ${name}`, render: true };
    }
    const wallpaper = e.target.closest('[data-tablet-wallpaper]')?.dataset.tabletWallpaper;
    if (wallpaper && style.setWallpaper(wallpaper)) {
      const name = TABLET_WALLPAPERS.find((w) => w.id === wallpaper).name;
      return { message: `Hintergrundbild: ${name}`, render: true };
    }
    return {};
  }

  return { render, handleClick };
}
