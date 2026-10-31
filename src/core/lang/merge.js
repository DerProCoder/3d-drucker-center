// Fügt die Teil-Wörterbücher einer Sprache (base.js, apps.js, catalog.js …) zu einem zusammen.
// Jede Teildatei besitzt eigene Bereiche auf oberster Ebene (z. B. 'hud', 'shop'); kommt ein Bereich in zwei
// Teildateien vor, gewinnt die spätere und es gibt eine Warnung – so fallen Überschneidungen beim Testen auf.
export function mergeParts(lang, parts) {
  const dict = {};
  const owner = {};
  for (const [file, part] of Object.entries(parts)) {
    for (const [area, value] of Object.entries(part)) {
      if (Object.hasOwn(dict, area)) console.warn(`i18n: Bereich „${area}“ in ${lang}/${owner[area]} und ${lang}/${file}`);
      dict[area] = value;
      owner[area] = file;
    }
  }
  return dict;
}
