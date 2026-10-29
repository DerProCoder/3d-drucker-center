// PC-App „KI“: oben Stufe (Balken), KI-GPU-Server online und Einnahmen des KI-Abos, darunter der Chat mit der
// simulierten KI (Antworten aus core/ai-advisor.js, keine Anfrage ins Internet). Ohne KI-Server online ist der Chat
// gesperrt. Die App ist nicht „live“: Der Verlauf wird nicht bei jeder Spieländerung neu aufgebaut – neue Nachrichten
// werden angehängt, Kopf und Sperre aktualisiert liveUpdate gezielt. So bleiben Eingabe und Scroll-Position erhalten.
// Der Verlauf wird nicht gespeichert; nach dem Laden beginnt er mit einer Begrüßung.
import { MAX_LEVEL } from '../core/ai-advisor.js';
import { euro } from '../core/format.js';

const THINK_MS = [0, 2400, 1800, 1300, 850, 450]; // so lange „denkt“ die KI je Stufe (echte Millisekunden)
const MAX_MESSAGES = 100;   // ältere Nachrichten fallen aus dem Verlauf
const MAX_QUESTION = 200;   // Zeichen im Eingabefeld
const BOTTOM_SLACK = 24;    // px – so nah am Ende gilt der Verlauf als „unten“ und scrollt mit

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ai: core/ai-service.js (level, onlineCount, incomePerHour, totalIncome) oder null · advisor: core/ai-advisor.js
export function createAIApp({ ai = null, advisor }) {
  const messages = [];     // { from: 'user' | 'ai' | 'system', text }
  let draft = '';          // angefangene Frage im Eingabefeld
  let thinking = false;    // KI „denkt“ gerade nach
  let lastLevel = null;    // zuletzt gesehene Stufe (für Meldungen beim Stufenwechsel)
  let greeted = false;
  let pinned = true;       // Verlauf steht unten und scrollt bei neuen Nachrichten mit
  let container = null;    // Inhalt des PC-Fensters, solange die App offen ist

  const level = () => ai?.level ?? 0;

  function push(from, text) {
    messages.push({ from, text });
    if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
    appendToChat(messages.at(-1));
  }

  // Stufe mit dem Verlauf abgleichen: Begrüßung beim ersten Mal online, Meldung bei jedem Stufenwechsel
  function sync() {
    const now = level();
    if (lastLevel !== null && now !== lastLevel) {
      push('system', now === 0 ? 'KI offline – keine KI-GPU-Server mehr online.' : now > lastLevel ? `KI ist jetzt Stufe ${now} ⬆` : `KI ist nur noch Stufe ${now} ⬇`);
    }
    lastLevel = now;
    if (!greeted && now > 0) {
      greeted = true;
      push('ai', advisor.greeting(now));
    }
  }

  const bubble = (m) => `<div class="ai-msg ${m.from}">${escapeHtml(m.text)}</div>`;
  const steps = (n) => Array.from({ length: MAX_LEVEL }, (_, i) => `<span class="ai-step${i < n ? ' on' : ''}"></span>`).join('');
  const suggestions = (n) => advisor.suggestions(n).map((q) => `<button class="secondary" data-ai-ask="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');

  function render() {
    sync();
    const n = level();
    const offline = n === 0;
    return `
      <div class="ai-app">
        <div class="ai-head">
          <div class="ai-stat ai-level-box">
            <span>KI-Stufe</span>
            <b data-ai-level>${offline ? 'offline' : `${n} / ${MAX_LEVEL}`}</b>
            <div class="ai-steps" data-ai-steps>${steps(n)}</div>
          </div>
          <div class="ai-stat"><span>KI-GPU-Server online</span><b data-ai-online>${ai?.onlineCount ?? 0}</b></div>
          <div class="ai-stat"><span>KI-Abo</span><b data-ai-income>${euro.format(ai?.incomePerHour ?? 0)} / h</b></div>
        </div>
        <p class="ai-offline" data-ai-offline ${offline ? '' : 'hidden'}>🔌 KI offline – kaufe einen KI-GPU-Server im Server-Shop und bring ihn online.</p>
        <div class="ai-chat" data-ai-chat data-keep-scroll="ai-chat">
          ${messages.map(bubble).join('')}
          <div class="ai-msg ai thinking" data-ai-thinking ${thinking ? '' : 'hidden'}>KI denkt<span class="ai-dots"><i></i><i></i><i></i></span></div>
        </div>
        <div class="ai-suggest" data-ai-suggest data-level="${n}">${suggestions(n)}</div>
        <div class="ai-input">
          <input type="text" data-ai-input data-keep-focus="ai-input" maxlength="${MAX_QUESTION}" autocomplete="off" spellcheck="false"
            placeholder="${offline ? 'Chat gesperrt – KI offline' : 'Frag die KI … (Enter sendet)'}" value="${escapeHtml(draft)}" ${offline ? 'disabled' : ''}>
          <button class="buy" data-ai-send ${offline || thinking ? 'disabled' : ''}>Senden</button>
        </div>
      </div>`;
  }

  const chatEl = () => container?.querySelector('[data-ai-chat]') ?? null;

  function scrollDown() {
    const chat = chatEl();
    if (chat && pinned) chat.scrollTop = chat.scrollHeight;
  }

  // Neue Nachricht direkt anhängen (vor der „denkt“-Blase), statt alles neu zu zeichnen
  function appendToChat(m) {
    const chat = chatEl();
    if (!chat) return; // App gerade nicht offen: erscheint beim nächsten Öffnen
    chat.querySelector('[data-ai-thinking]').insertAdjacentHTML('beforebegin', bubble(m));
    while (chat.querySelectorAll('.ai-msg:not([data-ai-thinking])').length > MAX_MESSAGES) chat.querySelector('.ai-msg').remove();
    scrollDown();
  }

  // Nach dem Zeichnen (shop.js): Verlauf nach unten, Scrollen beobachten
  function attach(el) {
    container = el;
    const chat = chatEl();
    if (!chat) return;
    chat.addEventListener('scroll', () => {
      pinned = chat.scrollHeight - chat.scrollTop - chat.clientHeight < BOTTOM_SLACK;
    });
    pinned = true;
    scrollDown();
  }

  function setThinking(on) {
    thinking = on;
    const dots = container?.querySelector('[data-ai-thinking]');
    if (dots) dots.hidden = !on;
    const send = container?.querySelector('[data-ai-send]');
    if (send) send.disabled = on || level() === 0;
    if (on) scrollDown();
  }

  function ask(question) {
    const text = String(question ?? '').trim().slice(0, MAX_QUESTION);
    if (!text || thinking || level() === 0 || !advisor) return false;
    pinned = true;
    push('user', text);
    setThinking(true);
    setTimeout(() => {
      // Die Antwort gilt für die Stufe beim Antworten (fällt die KI in der Zwischenzeit aus, kommt der Offline-Hinweis)
      push('ai', advisor.answer(text, level()).text);
      setThinking(false);
    }, THINK_MS[level()] ?? THINK_MS[1]);
    return true;
  }

  function send() {
    const input = container?.querySelector('[data-ai-input]');
    const question = input ? input.value : draft;
    if (!ask(question)) return;
    draft = '';
    if (input) input.value = '';
  }

  // Kopf, Sperre und Vorschläge gezielt aktualisieren (shop.js ruft das alle 250 ms)
  function liveUpdate(el) {
    container = el;
    sync();
    const n = level();
    const offline = n === 0;
    const set = (sel, text) => {
      const node = el.querySelector(sel);
      if (node && node.textContent !== text) node.textContent = text;
    };
    set('[data-ai-level]', offline ? 'offline' : `${n} / ${MAX_LEVEL}`);
    set('[data-ai-online]', String(ai?.onlineCount ?? 0));
    set('[data-ai-income]', `${euro.format(ai?.incomePerHour ?? 0)} / h`);
    el.querySelectorAll('[data-ai-steps] .ai-step').forEach((s, i) => s.classList.toggle('on', i < n));
    const notice = el.querySelector('[data-ai-offline]');
    if (notice) notice.hidden = !offline;
    const input = el.querySelector('[data-ai-input]');
    if (input && input.disabled !== offline) {
      input.disabled = offline;
      input.placeholder = offline ? 'Chat gesperrt – KI offline' : 'Frag die KI … (Enter sendet)';
    }
    const send = el.querySelector('[data-ai-send]');
    if (send) send.disabled = offline || thinking;
    const box = el.querySelector('[data-ai-suggest]');
    if (box && box.dataset.level !== String(n)) {
      box.dataset.level = String(n);
      box.innerHTML = suggestions(n);
    }
  }

  function handleClick(e, el) {
    container = el;
    const asked = e.target.closest('[data-ai-ask]')?.dataset.aiAsk;
    if (asked) ask(asked);
    else if (e.target.closest('[data-ai-send]')) send();
    else return;
    el.querySelector('[data-ai-input]:not(:disabled)')?.focus({ preventScroll: true });
  }

  function handleInput(e) {
    if (e.target.matches('[data-ai-input]')) draft = e.target.value;
  }

  // Tasten im Eingabefeld: Enter sendet. Die Spielsteuerung (main.js hört am window) bekommt nichts davon mit –
  // nur Esc darf durch, damit der PC sich weiter wie gewohnt schließen lässt.
  function handleKey(e, el) {
    if (!e.target.matches?.('[data-ai-input]')) return;
    container = el;
    if (e.key !== 'Escape') e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return { render, attach, liveUpdate, handleClick, handleInput, handleKey, ask, messages };
}
