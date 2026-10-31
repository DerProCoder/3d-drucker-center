// Deutsch (Ausgangssprache) – Start-/Pausenbildschirm, HUD, Touch-Knöpfe, Fadenkreuz-Hinweise und Abblenden (#69).
// Bereiche: title, controls, hud, power, progress, touch, input, hints, fade
export default {
  // Start-, Pausen- und Game-Over-Bildschirm (ui/title-screen.js)
  title: {
    tagline: 'Deine eigene 3D-Druckerhalle',
    pause: 'Pause',
    deviceAsk: 'Über welches Gerät spielst du?',
    devicePc: 'PC',
    devicePcHint: 'Maus und Tastatur',
    deviceTablet: 'Tablet',
    deviceTabletHint: 'Touch-Steuerung',
    play: '▶ Spiel starten',
    continue: '▶ Weiterspielen',
    newGame: 'Neues Spiel',
    confirmNewGame: 'Wirklich ein neues Spiel starten? Dein bisheriger Spielstand wird gelöscht.',
    graphics: 'Grafik',
    device: 'Gerät',
    language: 'Sprache',
    // Grafikstufen – Schlüssel sind die ids aus world/graphics.js (QUALITY_LEVELS)
    quality: { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' },
    gpuSoftware: 'Der Browser rendert ohne Grafikkarte – das Spiel wird stark ruckeln.',
    gpuSoftwareHelp: 'Schalte in den Browser-Einstellungen unter System „Grafikbeschleunigung verwenden“ ein und starte den Browser neu.',
    saveFound: '💾 Spielstand gefunden – dein Fortschritt wird automatisch gespeichert',
    saveAuto: '💾 Dein Fortschritt wird automatisch gespeichert',
    resume: '🖱️ Klicken, um weiterzuspielen',
    gameOver: {
      kicker: 'Game Over',
      logo: 'PLEITE',
      logoAccent: '!',
      tagline: 'Die Bank hat die Halle übernommen. Kater Düsentrieb zieht zu Tante Erika.',
      day: 'Tag {day}',
      deliveries_one: '{count} Auftrag geliefert',
      deliveries_other: '{count} Aufträge geliefert',
      prints_one: '{count} Druck',
      prints_other: '{count} Drucke',
      failures_one: '{count} Fehldruck',
      failures_other: '{count} Fehldrucke',
      restart: '↻ Neues Spiel',
    },
  },

  // Steuerungsübersicht im Startbildschirm: Tastenbeschriftung (kbd) und was sie tut
  controls: {
    kbd: {
      mouse: 'Maus',
      click: 'Klick',
      wheel: 'Mausrad',
      dragLeft: 'Links ziehen',
      swipeRight: 'Rechts wischen',
      tap: 'Antippen',
    },
    walk: 'laufen',
    sneakHold: 'halten: schleichen',
    look: 'umschauen',
    use: 'benutzen',
    chooseSpool: 'Spule wählen',
    pickUp: 'Drucker aufheben',
    throw: 'Drucker werfen',
    toStorage: 'zurück ins Lager',
    sound: 'Ton an/aus',
    pause: 'Pause',
    switchSpool: 'Spule wechseln',
    sneak: 'schleichen',
    tablet: 'Tablet',
  },

  // HUD oben links und Einblendungen (ui/hud.js)
  hud: {
    clock: 'Uhrzeit',
    clockText: 'Tag {day} · {time}',
    power: 'Strom',
    costs: 'Laufende Kosten',
    perHour: '{value} / h',
    orders: 'Aufträge',
    ordersOpen: '{count} offen',
    warning: 'Konto im Minus! Ab {limit} macht die Bank die Halle dicht.',
    xp: '{xp} XP · noch {left} bis Level {next}',
    levelUp: 'Level aufgestiegen!',
    level: 'Level {level}',
    levelPerks: '+10 % Lohn pro Auftrag · bis zu {max} Aufträge gleichzeitig',
    saved: '💾 Gespeichert',
    achievement: 'Erfolg freigeschaltet',
  },

  // Stromanzeige im HUD (core/power-grid.js, core/backup-power.js); Generator-Texte folgen in #70
  power: {
    day: 'Tagstrom',
    night: 'Nachtstrom',
    outage: '⚡ Stromausfall · noch {minutes} min',
    backup: '🔋 Notstrom',
    backupPercent: '🔋 Notstrom: {percent} %',
  },

  // Level-Titel (core/progress.js TITLES, gleiche Reihenfolge)
  progress: {
    titles: [
      'Bastler', 'Hobby-Drucker', 'Garagen-Werkstatt', 'Kleine Druckerei', 'Druckerei',
      'Druck-Manufaktur', 'Druckfabrik', 'Druck-Konzern', 'Druck-Imperium', 'Legende des Filaments',
    ],
  },

  // Touch-Knöpfe (ui/touch-controls.js)
  touch: {
    take: 'Aufheben',
    throw: 'Werfen',
    return: 'Ins Lager',
    cycle: 'Spule',
    sneak: 'Schleichen',
    tablet: 'Tablet',
    pause: 'Pause',
  },

  // Bausteine der Hinweise, die tabletText() für das Tablet umschreibt: input.pc.x wird zu input.tablet.x.
  // Hinweise, die von Maus und Tasten sprechen, müssen genau diese Wörter enthalten.
  input: {
    pc: {
      click: 'Linksklick',
      take: 'E: hochheben',
      throw: 'F: werfen',
      wheel: 'Mausrad: Spule wählen',
      store: 'Q: ',
      orEsc: ' oder Esc:',
    },
    tablet: {
      click: 'Tippen',
      take: '✋ Aufheben',
      throw: '🤾 Werfen',
      wheel: '🔄 Spule wechseln',
      store: '↩ ',
      orEsc: ':',
    },
  },

  // Hinweise unter dem Fadenkreuz und kurze Meldungen aus main.js
  hints: {
    pc: 'Linksklick: PC benutzen (Shop, Aufträge, Ausbau & Druckermenü)',
    noThrowUpstairs: 'Von hier oben lieber nichts werfen – erst runter in die Halle',
    noThrowBelow: 'Hier unten lieber nichts werfen – erst hoch in die Halle',
  },

  // Texte beim Abblenden (ui/screen-fade.js, Fahrstühle in main.js)
  fade: {
    elevatorUp: '🛗 Fahrstuhl fährt nach oben …',
    elevatorDown: '🛗 Fahrstuhl fährt nach unten …',
    basementToHall: '🛗 Fahrstuhl fährt nach oben in die Halle …',
    basementToCellar: '🛗 Fahrstuhl fährt hinunter in den Keller …',
    basementToControlRoom: '🛗 Fahrstuhl fährt zum Raum bei −10,5 m …',
  },
};
