// Filamentsorten und -farben für den Filament-Shop, dazu die Holzplatten aus dem Holzshop. Reine Daten.

// Bambu-Lab-Filamentsorten. finish bestimmt das Aussehen von Spule und Druckteil (siehe models/spool.js,
// models/printed-part.js), payBonus, wie viel mehr Kunden für Aufträge in dieser Sorte zahlen. special: Effektsorte –
// Kunden bestellen sie nur ab und zu. label steht im Namen („PLA Matte Aschgrau“), bei Basic bleibt es leer.
export const FILAMENT_LINES = {
  'pla-basic': { label: '', name: 'PLA Basic', hint: 'Der Allrounder in vielen Farben' },
  'pla-matte': { label: 'Matte', name: 'PLA Matte', finish: 'matte', special: true, payBonus: 1.15, hint: 'Samtig matt, Schichtlinien fallen kaum auf' },
  'pla-silk': { label: 'Silk+', name: 'PLA Silk+', finish: 'silk', special: true, payBonus: 1.3, hint: 'Seidiger Metallic-Glanz' },
  'pla-glow': { label: 'Glow', name: 'PLA Glow', finish: 'glow', special: true, payBonus: 1.5, hint: 'Leuchtet im Dunkeln nach' },
  'pla-translucent': { label: 'Translucent', name: 'PLA Translucent', finish: 'translucent', special: true, payBonus: 1.25, hint: 'Durchscheinend wie Glas' },
  'petg-basic': { label: '', name: 'PETG Basic', hint: 'Robust und schlagfest, gut für Gebrauchsteile' },
  'petg-translucent': { label: 'Translucent', name: 'PETG Translucent', finish: 'translucent', special: true, payBonus: 1.25, hint: 'Durchscheinend und zäh' },
  abs: { label: '', name: 'ABS', hint: 'Hitzebeständig, braucht ein geschlossenes Gehäuse' },
  'tpu-95a': { label: '', name: 'TPU 95A HF', hint: 'Flexibel und gummiartig, schnell druckbar' },
};

// Preise pro 1-kg-Spule in € (Stand Oktober 2026, 3DJake.de; Silk+, Translucent und die ABS-Spule geschätzt).
// Farbwerte aus der Open Filament Database (MIT-Lizenz, siehe README).
// Die ID ergibt sich aus Material, Sorte und Farbe. Spielstände von vor den Sorten nutzen IDs wie 'pla-grün' –
// wo sich der Farbname geändert hat, steht die alte ID als letztes Argument, damit gespeicherte Spulen gültig bleiben.
const slug = (text) => text.toLowerCase().replace(/\+/g, '').replace(/\s+/g, '-');
const filament = (lineId, color, hex, price, legacyId = null) => {
  const line = FILAMENT_LINES[lineId];
  const material = line.name.split(' ')[0];
  return {
    id: legacyId ?? (line.label ? `${slug(material)}-${slug(line.label)}-${slug(color)}` : `${slug(material)}-${slug(color)}`),
    material,
    lineId,
    line,
    color,
    hex,
    price,
    finish: line.finish ?? 'basic',
    translucent: line.finish === 'translucent',
  };
};

export const FILAMENTS = [
  filament('pla-basic', 'Weiß', '#FFFFFF', 19.99), // Jade White
  filament('pla-basic', 'Schwarz', '#000000', 19.99),
  filament('pla-basic', 'Grau', '#8E9089', 19.99),
  filament('pla-basic', 'Rot', '#C12E1F', 19.99),
  filament('pla-basic', 'Blau', '#0A2989', 19.99),
  filament('pla-basic', 'Cyan', '#0086D6', 19.99),
  filament('pla-basic', 'Bambu-Grün', '#00AE42', 19.99, 'pla-grün'),
  filament('pla-basic', 'Gelb', '#F4EE2A', 19.99),
  filament('pla-basic', 'Orange', '#FF6A13', 19.99),
  filament('pla-basic', 'Pink', '#F55A74', 19.99),
  filament('pla-basic', 'Magenta', '#EC008C', 19.99),
  filament('pla-basic', 'Lila', '#5E43B7', 19.99),
  filament('pla-matte', 'Elfenbeinweiß', '#F4F1E6', 19.99), // Ivory White – in der Datenbank reinweiß
  filament('pla-matte', 'Anthrazit', '#1E1E1E', 19.99),     // Charcoal – in der Datenbank tiefschwarz
  filament('pla-matte', 'Aschgrau', '#9B9EA0', 19.99),
  filament('pla-matte', 'Scharlachrot', '#DE4343', 19.99),
  filament('pla-matte', 'Marineblau', '#0078BF', 19.99),
  filament('pla-matte', 'Grasgrün', '#61C680', 19.99),
  filament('pla-matte', 'Zitronengelb', '#F7D959', 19.99),
  filament('pla-matte', 'Mandarine', '#F99963', 19.99),
  filament('pla-matte', 'Sakura-Rosa', '#E8AFCF', 19.99),
  filament('pla-matte', 'Latte-Braun', '#D3B7A7', 19.99),
  filament('pla-matte', 'Terrakotta', '#A15636', 19.99),
  filament('pla-silk', 'Gold', '#F4A925', 22.99),
  filament('pla-silk', 'Silber', '#C8C8C8', 22.99),
  filament('pla-silk', 'Roségold', '#BA9594', 22.99),
  filament('pla-silk', 'Champagner', '#F3CFB2', 22.99),
  filament('pla-silk', 'Blau', '#008BDA', 22.99),
  filament('pla-silk', 'Candy-Rot', '#D02727', 22.99),
  filament('pla-silk', 'Mint', '#96DCB9', 22.99),
  filament('pla-silk', 'Lila', '#8671CB', 22.99),
  filament('pla-glow', 'Grün', '#A1FFAC', 27.99),
  filament('pla-glow', 'Blau', '#7AC0E9', 27.99),
  filament('pla-glow', 'Orange', '#FF9D5B', 27.99),
  filament('pla-glow', 'Pink', '#F17B8F', 27.99),
  filament('pla-glow', 'Gelb', '#F8FF80', 27.99),
  filament('pla-translucent', 'Eisblau', '#B8CDE9', 22.99, 'pla-transparent'),
  filament('pla-translucent', 'Rot', '#B50011', 22.99),
  filament('pla-translucent', 'Blau', '#0047BB', 22.99),
  filament('pla-translucent', 'Orange', '#F74E02', 22.99),
  filament('pla-translucent', 'Lavendel', '#B8ACD6', 22.99),
  filament('pla-translucent', 'Petrol', '#009FA1', 22.99),
  filament('petg-basic', 'Schwarz', '#000000', 18.99),
  filament('petg-basic', 'Weiß', '#FFFFFF', 18.99),
  filament('petg-basic', 'Grau', '#7F7E83', 18.99),
  filament('petg-basic', 'Rot', '#D6001C', 18.99),
  filament('petg-basic', 'Blau', '#0086D6', 18.99),
  filament('petg-basic', 'Orange', '#FF671F', 18.99),
  filament('petg-basic', 'Gelb', '#FCE300', 18.99),
  filament('petg-basic', 'Limettengrün', '#62AF41', 18.99),
  filament('petg-translucent', 'Klar', '#E8F2F8', 19.99, 'petg-transparent'),
  filament('petg-translucent', 'Orange', '#FF911A', 19.99),
  filament('petg-translucent', 'Hellblau', '#61B0FF', 19.99),
  filament('petg-translucent', 'Lila', '#D6ABFF', 19.99),
  filament('petg-translucent', 'Türkis', '#77EDD7', 19.99),
  filament('abs', 'Weiß', '#FFFFFF', 19.99),
  filament('abs', 'Schwarz', '#000000', 19.99),
  filament('abs', 'Silbergrau', '#87909A', 19.99, 'abs-grau'),
  filament('abs', 'Rot', '#D32941', 19.99),
  filament('abs', 'Blau', '#0A2CA5', 19.99),
  filament('abs', 'Bambu-Grün', '#00AE42', 19.99),
  filament('abs', 'Orange', '#FF6A13', 19.99),
  filament('tpu-95a', 'Schwarz', '#101820', 34.99),
  filament('tpu-95a', 'Weiß', '#FFFFFF', 34.99),
  filament('tpu-95a', 'Grau', '#898D8D', 34.99),
  filament('tpu-95a', 'Rot', '#C8102E', 34.99),
  filament('tpu-95a', 'Blau', '#0072CE', 34.99),
  filament('tpu-95a', 'Gelb', '#F3E600', 34.99),
];

// Findet auch Holzsorten (WOODS): fertige Laserteile haben ihr Holz dort stehen, wo gedruckte Teile ihr Filament
// haben, damit Lager, Aufträge und Farbpunkte für beide gleich funktionieren
export const filamentById = (id) => FILAMENTS.find((f) => f.id === id) ?? WOODS.find((w) => w.id === id);
// Farbe mit Sorte, z. B. „Matte Aschgrau“ (bei Basic und Holz nur „Aschgrau“)
export const filamentColorName = (f) => (f.line?.label ? `${f.line.label} ${f.color}` : f.color);
// Voller Name, z. B. „PLA Matte Aschgrau“
export const filamentLabel = (f) => `${f.material} ${filamentColorName(f)}`;

// ---------- Holzshop (Platten für den Laser R1) ----------

// Holzplatten aus dem Holzshop, Format SHEET_MM. color: Holzart (für Beschriftungen wie „Holz Birke“),
// hex: Farbe der Platte, burn: Farbe der gelaserten Stellen
export const SHEET_MM = { x: 300, y: 200 };
export const WOODS = [
  { id: 'holz-pappel', material: 'Holz', color: 'Pappel', name: 'Pappelsperrholz 3 mm', hex: '#e3c99a', burn: '#5a3a1e', price: 4 },
  { id: 'holz-birke', material: 'Holz', color: 'Birke', name: 'Birkensperrholz 3 mm', hex: '#efdcb8', burn: '#6b4524', price: 6 },
  { id: 'holz-walnuss', material: 'Holz', color: 'Walnuss', name: 'Walnuss-Platte 3 mm', hex: '#8a5d3b', burn: '#2b170b', price: 9 },
];
export const woodById = (id) => WOODS.find((w) => w.id === id);

export const SPOOL_GRAMS = 1000; // eine volle Spule
