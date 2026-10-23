// Bildschirm kurz abblenden, mit Text in der Mitte – z. B. für die Fahrt mit dem Fahrstuhl (world/upper-floor.js).
// Während es dunkel ist, wird onMiddle aufgerufen (dort springt die Spielfigur aufs andere Stockwerk).
const FADE_MS = 450;  // Ab- bzw. Aufblenden
const HOLD_MS = 900;  // so lange bleibt es dunkel

export function createScreenFade() {
  const el = document.createElement('div');
  el.className = 'screen-fade hidden';
  document.body.appendChild(el);
  let busy = false;

  // Gibt false zurück, wenn gerade schon abgeblendet wird
  function run(text, onMiddle) {
    if (busy) return false;
    busy = true;
    el.textContent = text;
    el.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('dark'))); // erst zeichnen, dann blenden
    setTimeout(onMiddle, FADE_MS + HOLD_MS / 2);
    setTimeout(() => el.classList.remove('dark'), FADE_MS + HOLD_MS);
    setTimeout(() => {
      el.classList.add('hidden');
      busy = false;
    }, FADE_MS * 2 + HOLD_MS);
    return true;
  }

  return { run, get busy() { return busy; } };
}
