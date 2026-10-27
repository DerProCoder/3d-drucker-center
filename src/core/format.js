// Gemeinsame Formatierer für Anzeigen (Geld, Kabellänge, Zeiten). Rein, ohne DOM und ohne three, damit HUD, PC-Apps
// und Halle dieselbe Schreibweise nutzen.
import { GAME_MINUTES_PER_SECOND } from './economy.js';

// Geldbeträge („12,50 €“); Aufruf: euro.format(betrag)
export const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
// Geldbeträge ohne Nachkommastellen („13 €“)
export const euroRound = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Kabellänge in Metern („1.234 m“)
export const meters = (m) => `${m.toLocaleString('de-DE')} m`;

// Minuten als „2 h 5 min“ bzw. „5 min“ (aufgerundet)
export function formatMinutes(minutes) {
  const total = Math.ceil(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

// Spielminuten als echte Zeit („5 min“)
export const realTime = (gameMinutes) => formatMinutes(gameMinutes / GAME_MINUTES_PER_SECOND / 60);
