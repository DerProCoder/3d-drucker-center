// Sprachsystem (#69): angezeigte Texte in Deutsch, Englisch, Französisch und Spanisch. Deutsch ist die
// Ausgangssprache – fehlt ein Text in einer anderen Sprache, wird der deutsche genommen.
//
// ---------- Anleitung: Texte umstellen ----------
//   import { t } from '../core/i18n.js';
//   import { euro } from '../core/format.js';
//
//   el.textContent = 'Gespeichert';                      →  el.textContent = t('hud.saved');
//   `Konto im Minus! Ab ${euro.format(x)} …`             →  t('hud.warning', { limit: euro.format(x) })
//   `${n} offen`                                         →  t('hud.ordersOpen', { count: n })
//
// - Platzhalter stehen im Wörterbuch als {name} und werden aus dem zweiten Argument gefüllt. Zahlen und Geld vorher
//   mit format.js formatieren (euro.format, meters …) – t() setzt Werte unverändert als Text ein.
// - Mehrzahl: Gibt es zum Schlüssel Varianten mit Endung _one / _other (Französisch auch 0 = _one, siehe
//   Intl.PluralRules), wählt t() anhand von values.count die passende. Fehlt _one, wird _other genommen.
// - Listen (z. B. Level-Titel) per Index: t(`progress.titles.${i}`).
// - Wechsel der Sprache: subscribe((lang) => …) schreibt die Texte neu; Rückgabe meldet wieder ab.
//   Wo das schwierig ist (3D-Schilder, Canvas-Texturen), darf das Spiel nach setLanguage() neu laden.
// - Neue Texte zuerst im deutschen Wörterbuch eintragen (src/core/lang/de/…), dann in en/fr/es.
//   Schlüssel: kleinCamelCase, Punkte trennen Bereiche – 'bereich.unterbereich.text', z. B. 'title.newGame'.
//   Ein Schlüssel, den es auch auf Deutsch nicht gibt, ergibt einmalig eine Warnung in der Konsole und
//   erscheint selbst als Text (so fällt er beim Testen auf).
//
// ---------- Ausnahme localStorage/navigator ----------
// core/ kennt eigentlich kein DOM; nur save.js darf localStorage. Hier gibt es eine zweite, bewusst kleine Ausnahme:
// Die Sprache muss schon beim Laden der Module feststehen (format.js baut damit seine Schreibweise, UI-Module
// rendern sofort). Würde main.js sie erst von außen hereinreichen, sähe alles bis dahin Gebaute deutsch aus.
// Deshalb liest i18n.js die Wahl selbst – ausschließlich über readStored/writeStored/browserLanguage unten,
// alle mit typeof-Prüfung und try/catch, sodass das Modul auch ohne Browser (Tests) läuft und dann Deutsch nimmt.
// Gespeichert wird wie Grafikstufe und Gerätewahl als Browser-Einstellung, nicht im Spielstand.
import de from './lang/de/index.js';
import en from './lang/en/index.js';
import fr from './lang/fr/index.js';
import es from './lang/es/index.js';

const STORAGE_KEY = 'druckercenter-sprache';
const DEFAULT = 'de';

// Reihenfolge = Reihenfolge der Knöpfe im Umschalter
export const LANGUAGES = [
  { id: 'de', short: 'DE', name: 'Deutsch', locale: 'de-DE' },
  { id: 'en', short: 'EN', name: 'English', locale: 'en-GB' },
  { id: 'fr', short: 'FR', name: 'Français', locale: 'fr-FR' },
  { id: 'es', short: 'ES', name: 'Español', locale: 'es-ES' },
];
const DICTS = { de, en, fr, es };
const isLanguage = (lang) => Object.hasOwn(DICTS, lang);

// ---------- Zugriff auf den Browser (einzige Stellen mit localStorage/navigator) ----------
function readStored() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(lang) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  } catch { /* ohne localStorage gilt die Wahl nur bis zum Neuladen */ }
}
// Erste passende Browsersprache ('en-US' → 'en'), sonst null
function browserLanguage() {
  try {
    if (typeof navigator === 'undefined') return null;
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of list) {
      const lang = String(tag ?? '').slice(0, 2).toLowerCase();
      if (isLanguage(lang)) return lang;
    }
  } catch { /* dann Deutsch */ }
  return null;
}

// Gespeicherte Wahl, sonst Browsersprache, sonst Deutsch
export function detectLanguage() {
  const stored = readStored();
  if (isLanguage(stored)) return stored;
  return browserLanguage() ?? DEFAULT;
}

let current = detectLanguage();
const listeners = new Set();
const warned = new Set();
const pluralRules = new Map();

export const getLanguage = () => current;
// BCP-47-Tag der aktuellen Sprache für Intl ('de-DE', 'en-GB', 'fr-FR', 'es-ES')
export const getLocale = (lang = current) => LANGUAGES.find((l) => l.id === lang)?.locale ?? 'de-DE';

// Sprache wechseln, speichern und alle Abonnenten benachrichtigen. Unbekannte Sprache: false, nichts ändert sich.
export function setLanguage(lang) {
  if (!isLanguage(lang)) return false;
  writeStored(lang);
  if (lang === current) return true;
  current = lang;
  for (const fn of [...listeners]) {
    try {
      fn(lang);
    } catch (e) {
      console.error(e);
    }
  }
  return true;
}

// fn(lang) bei jedem Wechsel; Rückgabe: Funktion zum Abmelden
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Wert zu 'a.b.c' im Wörterbuch (verschachtelte Objekte und Listen), sonst undefined
function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function pluralCategory(lang, count) {
  if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(getLocale(lang)));
  return pluralRules.get(lang).select(count);
}

// Text in einer Sprache suchen, bei values.count zuerst die passende Mehrzahl-Variante
function find(lang, key, count) {
  const dict = DICTS[lang];
  if (typeof count === 'number') {
    const exact = lookup(dict, `${key}_${pluralCategory(lang, count)}`);
    if (exact !== undefined) return exact;
    const other = lookup(dict, `${key}_other`);
    if (other !== undefined) return other;
  }
  return lookup(dict, key);
}

const fill = (text, values) => (values
  ? text.replace(/\{(\w+)\}/g, (m, name) => (Object.hasOwn(values, name) && values[name] != null ? String(values[name]) : m))
  : text);

// Übersetzter Text zum Schlüssel; values füllt {platzhalter}, values.count wählt die Mehrzahl
export const t = (key, values) => tFor(current, key, values);

// Wie t(), aber in einer bestimmten Sprache (z. B. deutsche Bausteine für noch nicht übersetzte Hinweise)
export function tFor(lang, key, values) {
  if (!isLanguage(lang)) lang = DEFAULT;
  const count = values?.count;
  let text = find(lang, key, count);
  if (text === undefined && lang !== DEFAULT) text = find(DEFAULT, key, count);
  if (text === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`i18n: Text „${key}“ fehlt`);
    }
    return key;
  }
  return fill(text, values);
}

// Gibt es den Text (in der aktuellen Sprache oder auf Deutsch)? Ohne Warnung.
export const hasText = (key) => [current, DEFAULT].some((lang) => find(lang, key, 1) !== undefined);
