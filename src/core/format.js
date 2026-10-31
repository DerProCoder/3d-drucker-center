// Gemeinsame Formatierer für Anzeigen (Geld, Kabellänge, Zeiten). Rein, ohne DOM und ohne three, damit HUD, PC-Apps
// und Halle dieselbe Schreibweise nutzen. Die Schreibweise folgt der Spielsprache (core/i18n.js, #69):
// Deutsch „1.234,50 €“, Englisch „€1,234.50“, Französisch „1 234,50 €“, Spanisch „1234,50 €“ – Währung bleibt Euro.
// Die Sprache wird bei jedem Aufruf gelesen, ein Wechsel wirkt also sofort.
import { GAME_MINUTES_PER_SECOND } from './economy.js';
import { getLocale } from './i18n.js';

// Intl.NumberFormat je Sprache nur einmal bauen; nach außen wie ein NumberFormat mit format(betrag)
function localeFormat(options) {
  const cache = new Map();
  const get = () => {
    const locale = getLocale();
    if (!cache.has(locale)) cache.set(locale, new Intl.NumberFormat(locale, options));
    return cache.get(locale);
  };
  return {
    format: (value) => get().format(value),
    formatToParts: (value) => get().formatToParts(value),
    resolvedOptions: () => get().resolvedOptions(),
  };
}

// Geldbeträge („12,50 €“); Aufruf: euro.format(betrag)
export const euro = localeFormat({ style: 'currency', currency: 'EUR' });
// Geldbeträge ohne Nachkommastellen („13 €“)
export const euroRound = localeFormat({ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Kabellänge in Metern („1.234 m“)
export const meters = (m) => `${m.toLocaleString(getLocale())} m`;

// Minuten als „2 h 5 min“ bzw. „5 min“ (aufgerundet) – die Kürzel h/min gelten in allen vier Sprachen
export function formatMinutes(minutes) {
  const total = Math.ceil(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

// Spielminuten als echte Zeit („5 min“)
export const realTime = (gameMinutes) => formatMinutes(gameMinutes / GAME_MINUTES_PER_SECOND / 60);
