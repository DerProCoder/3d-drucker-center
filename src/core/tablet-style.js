// Aussehen des Tablets (#68): Gehäusefarbe und Hintergrundbild des Startbildschirms. Der Spieler wählt beides in der
// App „Einstellungen“ (ui/settings-app.js), kostenlos. Gespeichert werden nur die IDs (core/save.js, ab Version 34).
// Das 3D-Gehäuse (world/tablet-hold.js), der Rand und der Hintergrund im HTML-Bildschirm (ui/tablet.js) folgen über
// subscribe(). Ohne Three.js und DOM.

// hex: Gehäusefarbe des 3D-Modells. Schwarz entspricht DEFAULT_TABLET_COLOR in models/tablet.js
export const TABLET_COLORS = [
  { id: 'black', name: 'Schwarz', hex: 0x23262d },
  { id: 'white', name: 'Weiß', hex: 0xe9ebef },
  { id: 'silver', name: 'Silber', hex: 0xaeb3bb },
  { id: 'gold', name: 'Gold', hex: 0xc9a35e },
  { id: 'blue', name: 'Blau', hex: 0x2c5fb4 },
  { id: 'red', name: 'Rot', hex: 0xb5303a },
  { id: 'green', name: 'Grün', hex: 0x2e8552 },
  { id: 'purple', name: 'Lila', hex: 0x6b3fb0 },
];

// Hintergrundbilder für den Startbildschirm – gezeichnet werden sie in ui/tablet-wallpapers.js
export const TABLET_WALLPAPERS = [
  { id: 'bloom', name: 'Blüte' },
  { id: 'sunset', name: 'Sonnenuntergang' },
  { id: 'mountains', name: 'Berge' },
  { id: 'stars', name: 'Sternenhimmel' },
  { id: 'filament', name: 'Filament' },
  { id: 'slate', name: 'Schiefer' },
];

export const DEFAULT_TABLET_STYLE = { color: 'black', wallpaper: 'bloom' };

const colorById = (id) => TABLET_COLORS.find((c) => c.id === id);
const wallpaperById = (id) => TABLET_WALLPAPERS.find((w) => w.id === id);

// Zahl 0xrrggbb → CSS-Farbe '#rrggbb'
export const hexToCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export class TabletStyle {
  constructor() {
    this.color = DEFAULT_TABLET_STYLE.color;         // ID aus TABLET_COLORS
    this.wallpaper = DEFAULT_TABLET_STYLE.wallpaper; // ID aus TABLET_WALLPAPERS
    this.listeners = new Set();
  }

  get colorHex() { return (colorById(this.color) ?? TABLET_COLORS[0]).hex; }
  get colorCss() { return hexToCss(this.colorHex); }

  // Farbe wählen; gibt true zurück, wenn sie sich geändert hat
  setColor(id) {
    if (!colorById(id) || id === this.color) return false;
    this.color = id;
    this.notify();
    return true;
  }

  // Hintergrundbild wählen; gibt true zurück, wenn es sich geändert hat
  setWallpaper(id) {
    if (!wallpaperById(id) || id === this.wallpaper) return false;
    this.wallpaper = id;
    this.notify();
    return true;
  }

  // fn() bei jeder Änderung; gibt eine Abmelde-Funktion zurück
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this);
  }

  toJSON() {
    return { color: this.color, wallpaper: this.wallpaper };
  }

  // Alte Stände (bis Version 33) haben nichts gespeichert – dann Standard; unbekannte IDs ebenfalls
  load(data) {
    this.color = colorById(data?.color) ? data.color : DEFAULT_TABLET_STYLE.color;
    this.wallpaper = wallpaperById(data?.wallpaper) ? data.wallpaper : DEFAULT_TABLET_STYLE.wallpaper;
    this.notify();
  }
}
