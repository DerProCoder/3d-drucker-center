// Kleine Zusatz-Apps auf dem PC-Desktop: Notizen und Rechner. Ohne Spiellogik, reiner DOM-Zustand.

const MAX_DIGITS = 12;

// Notizen: Text bleibt erhalten, solange das Spiel offen ist
export function createNotesApp() {
  let text = 'Einkaufsliste:\n- PLA Weiß\n- \n';
  return {
    render: () => `<textarea class="notes" spellcheck="false" placeholder="Notizen…">${escapeHtml(text)}</textarea>`,
    handleInput(e) {
      if (e.target.matches('.notes')) text = e.target.value;
    },
  };
}

// Rechner mit den vier Grundrechenarten, rechnet von links nach rechts wie ein Taschenrechner
export function createCalcApp() {
  let display = '0';
  let stored = null;     // erster Operand
  let operator = null;   // '+', '−', '×', '÷'
  let fresh = true;      // nächste Ziffer beginnt eine neue Zahl

  const keys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='];

  function compute(a, b, op) {
    if (op === '+') return a + b;
    if (op === '−') return a - b;
    if (op === '×') return a * b;
    if (op === '÷') return b === 0 ? NaN : a / b;
    return b;
  }

  const toNumber = (s) => Number(s.replace(',', '.'));

  function format(n) {
    if (!Number.isFinite(n)) return 'Fehler';
    const s = String(Number(n.toPrecision(MAX_DIGITS)));
    return s.replace('.', ',');
  }

  function press(key) {
    if (/^[0-9]$/.test(key)) {
      display = fresh || display === '0' ? key : (display.length < MAX_DIGITS ? display + key : display);
      fresh = false;
    } else if (key === ',') {
      if (fresh) display = '0';
      if (!display.includes(',')) display += ',';
      fresh = false;
    } else if (key === 'C') {
      display = '0';
      stored = null;
      operator = null;
      fresh = true;
    } else if (key === '±') {
      display = format(-toNumber(display));
    } else if (key === '%') {
      display = format(toNumber(display) / 100);
    } else if (key === '=') {
      if (operator !== null) display = format(compute(stored, toNumber(display), operator));
      stored = null;
      operator = null;
      fresh = true;
    } else {
      // Rechenzeichen: bisherige Rechnung abschließen und weitermachen
      if (operator !== null && !fresh) display = format(compute(stored, toNumber(display), operator));
      stored = toNumber(display);
      operator = key;
      fresh = true;
    }
  }

  return {
    render: () => `
      <div class="calc">
        <div class="calc-display">${operator && stored !== null ? `<small>${format(stored)} ${operator}</small>` : ''}${display}</div>
        <div class="calc-keys">
          ${keys.map((k) => `<button data-key="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : ''}${k === '0' ? ' wide' : ''}">${k}</button>`).join('')}
        </div>
      </div>`,
    // Gibt true zurück, wenn neu gezeichnet werden muss
    handleClick(e) {
      const key = e.target.closest('[data-key]')?.dataset.key;
      if (!key) return false;
      press(key);
      return true;
    },
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
