import type { Frequency, RecurrenceTextStrings, SchedulerMessages } from '../index'

// Translated wording. Pass a pack's `messages` to `<Scheduler :messages>`, and its `recurrence` to
// `recurrenceToText`. Dates and weekday names already follow the `locale` prop.

export interface LocalePack {
  messages: Partial<SchedulerMessages>
  recurrence: RecurrenceTextStrings
}

type Units = Record<Frequency, [string, string]>

function pack(words: {
  today: string
  previous: string
  next: string
  allDay: string
  close: string
  noEvents: string
  more: (n: number) => string
  eventCount: (n: number) => string
  dragHint: string
  changed: (title: string, when: string) => string
  cancelled: string
  moveArmed: (title: string) => string
  conflict: string
  eventStack: (n: number) => string
  timeFold: (start: string, end: string) => string
  draftChanges: (n: number) => string
  apply: string
  discard: string
  selected: (when: string) => string
  resources: string
  moreViews: string
  loading: string
  error: string
  searchResources: string
  popOut: string
  popIn: string
  poppedOut: string
  units: Units
  every: (unit: string) => string
  everyN: (n: number, unit: string) => string
  onDays: string
  onMonthDay: string
  onNth: (nth: number, weekday: string) => string
  inMonths: string
  times: (n: number) => string
  until: string
  and: string
}): LocalePack {
  return {
    messages: {
      today: words.today,
      previous: words.previous,
      next: words.next,
      allDay: words.allDay,
      close: words.close,
      noEvents: words.noEvents,
      more: words.more,
      eventCount: words.eventCount,
      dragHint: words.dragHint,
      eventChanged: words.changed,
      dragCancelled: words.cancelled,
      selected: words.selected,
      resources: words.resources,
      moreViews: words.moreViews,
      loading: words.loading,
      error: words.error,
      searchResources: words.searchResources,
      popOut: words.popOut,
      popIn: words.popIn,
      poppedOut: words.poppedOut,
      moveArmed: words.moveArmed,
      conflict: words.conflict,
      eventStack: words.eventStack,
      timeFold: words.timeFold,
      draftChanges: words.draftChanges,
      apply: words.apply,
      discard: words.discard,
    },
    recurrence: {
      every: (freq, n) =>
        n === 1 ? words.every(words.units[freq][0]) : words.everyN(n, words.units[freq][1]),
      onDays: (list) => `${words.onDays} ${list}`,
      onMonthDay: (list) => `${words.onMonthDay} ${list}`,
      onNth: words.onNth,
      inMonths: (list) => `${words.inMonths} ${list}`,
      times: words.times,
      until: (date) => `${words.until} ${date}`,
      and: words.and,
    },
  }
}

const NL_NTH: Record<string, string> = {
  '1': 'eerste',
  '2': 'tweede',
  '3': 'derde',
  '4': 'vierde',
  '5': 'vijfde',
  '-1': 'laatste',
  '-2': 'voorlaatste',
}

export const nl = pack({
  today: 'Vandaag',
  previous: 'Vorige',
  next: 'Volgende',
  allDay: 'Hele dag',
  close: 'Sluiten',
  noEvents: 'Geen afspraken',
  more: (n) => `+${n} meer`,
  eventCount: (n) => (n === 1 ? '1 afspraak' : `${n} afspraken`),
  dragHint:
    'Druk op Alt en de pijltjestoetsen om te verplaatsen, Alt Shift om het einde te wijzigen, Alt Control om het begin te wijzigen, Delete om te verwijderen.',
  changed: (title, when) => `${title} verplaatst naar ${when}`,
  cancelled: 'Verplaatsen geannuleerd',
  selected: (when) => `${when} geselecteerd`,
  resources: 'Middelen',
  moreViews: 'Meer',
  loading: 'Laden…',
  error: 'Er ging iets mis',
  searchResources: 'Middelen zoeken',
  popOut: 'Openen in zwevend venster',
  popIn: 'Terug naar pagina',
  poppedOut: 'De planner is geopend in een zwevend venster.',
  moveArmed: (title) => `${title} opgepakt. Kies waar het naartoe gaat, of druk op Escape.`,
  conflict: 'Overlapt met een andere afspraak',
  eventStack: (n) => (n === 1 ? '1 afspraak' : `${n} afspraken`),
  timeFold: (start, end) => `${start} tot ${end}, geen afspraken`,
  draftChanges: (n) => (n === 1 ? '1 wijziging' : `${n} wijzigingen`),
  apply: 'Toepassen',
  discard: 'Verwerpen',
  units: {
    YEARLY: ['jaar', 'jaar'],
    MONTHLY: ['maand', 'maanden'],
    WEEKLY: ['week', 'weken'],
    DAILY: ['dag', 'dagen'],
    HOURLY: ['uur', 'uur'],
    MINUTELY: ['minuut', 'minuten'],
  },
  every: (unit) => (unit === 'jaar' || unit === 'uur' ? `Elk ${unit}` : `Elke ${unit}`),
  everyN: (n, unit) => `Elke ${n} ${unit}`,
  onDays: 'op',
  onMonthDay: 'op dag',
  onNth: (nth, weekday) => `op de ${NL_NTH[nth] ?? `${nth}e`} ${weekday}`,
  inMonths: 'in',
  times: (n) => (n === 1 ? 'eenmaal' : `${n} keer`),
  until: 'tot',
  and: 'en',
})

const FR_NTH: Record<string, string> = {
  '1': 'premier',
  '2': 'deuxième',
  '3': 'troisième',
  '4': 'quatrième',
  '5': 'cinquième',
  '-1': 'dernier',
  '-2': 'avant-dernier',
}

export const fr = pack({
  today: "Aujourd'hui",
  previous: 'Précédent',
  next: 'Suivant',
  allDay: 'Toute la journée',
  close: 'Fermer',
  noEvents: 'Aucun événement',
  more: (n) => `+${n} en plus`,
  eventCount: (n) => (n === 1 ? '1 événement' : `${n} événements`),
  dragHint:
    'Appuyez sur Alt et les flèches pour déplacer, Alt Maj pour modifier la fin, Alt Ctrl pour modifier le début, Suppr pour supprimer.',
  changed: (title, when) => `${title} déplacé à ${when}`,
  cancelled: 'Déplacement annulé',
  selected: (when) => `${when} sélectionné`,
  resources: 'Ressources',
  moreViews: 'Plus',
  loading: 'Chargement…',
  error: "Une erreur s'est produite",
  searchResources: 'Rechercher des ressources',
  popOut: 'Ouvrir en mode incrustation',
  popIn: 'Revenir à la page',
  poppedOut: 'Le planificateur est ouvert dans une fenêtre en incrustation.',
  moveArmed: (title) => `${title} sélectionné. Choisissez sa destination, ou appuyez sur Échap.`,
  conflict: 'Chevauche un autre événement',
  eventStack: (n) => (n === 1 ? '1 événement' : `${n} événements`),
  timeFold: (start, end) => `${start} à ${end}, aucun événement`,
  draftChanges: (n) => (n === 1 ? '1 modification' : `${n} modifications`),
  apply: 'Appliquer',
  discard: 'Annuler',
  units: {
    YEARLY: ['année', 'ans'],
    MONTHLY: ['mois', 'mois'],
    WEEKLY: ['semaine', 'semaines'],
    DAILY: ['jour', 'jours'],
    HOURLY: ['heure', 'heures'],
    MINUTELY: ['minute', 'minutes'],
  },
  every: (unit) => `Chaque ${unit}`,
  // Weeks, hours and minutes are feminine in French.
  everyN: (n, unit) =>
    `${/^(semaines|heures|minutes)$/.test(unit) ? 'Toutes' : 'Tous'} les ${n} ${unit}`,
  onDays: 'le',
  onMonthDay: 'le',
  onNth: (nth, weekday) => `le ${FR_NTH[nth] ?? `${nth}e`} ${weekday}`,
  inMonths: 'en',
  times: (n) => (n === 1 ? 'une fois' : `${n} fois`),
  until: "jusqu'au",
  and: 'et',
})

const DE_NTH: Record<string, string> = {
  '1': 'ersten',
  '2': 'zweiten',
  '3': 'dritten',
  '4': 'vierten',
  '5': 'fünften',
  '-1': 'letzten',
  '-2': 'vorletzten',
}

export const de = pack({
  today: 'Heute',
  previous: 'Zurück',
  next: 'Weiter',
  allDay: 'Ganztägig',
  close: 'Schließen',
  noEvents: 'Keine Termine',
  more: (n) => `+${n} weitere`,
  eventCount: (n) => (n === 1 ? '1 Termin' : `${n} Termine`),
  dragHint:
    'Alt und die Pfeiltasten zum Verschieben, Alt Umschalt für das Ende, Alt Strg für den Anfang, Entf zum Löschen.',
  changed: (title, when) => `${title} verschoben auf ${when}`,
  cancelled: 'Verschieben abgebrochen',
  selected: (when) => `${when} ausgewählt`,
  resources: 'Ressourcen',
  moreViews: 'Mehr',
  loading: 'Wird geladen…',
  error: 'Etwas ist schiefgegangen',
  searchResources: 'Ressourcen suchen',
  popOut: 'Im Bild-im-Bild-Fenster öffnen',
  popIn: 'Zurück zur Seite',
  poppedOut: 'Der Planer ist in einem Bild-im-Bild-Fenster geöffnet.',
  moveArmed: (title) => `${title} aufgenommen. Wählen Sie das Ziel oder drücken Sie Esc.`,
  conflict: 'Überschneidet sich mit einem anderen Termin',
  eventStack: (n) => (n === 1 ? '1 Termin' : `${n} Termine`),
  timeFold: (start, end) => `${start} bis ${end}, keine Termine`,
  draftChanges: (n) => (n === 1 ? '1 Änderung' : `${n} Änderungen`),
  apply: 'Übernehmen',
  discard: 'Verwerfen',
  units: {
    YEARLY: ['Jahr', 'Jahre'],
    MONTHLY: ['Monat', 'Monate'],
    WEEKLY: ['Woche', 'Wochen'],
    DAILY: ['Tag', 'Tage'],
    HOURLY: ['Stunde', 'Stunden'],
    MINUTELY: ['Minute', 'Minuten'],
  },
  every: (unit) =>
    ({
      Jahr: 'Jedes Jahr',
      Monat: 'Jeden Monat',
      Woche: 'Jede Woche',
      Tag: 'Jeden Tag',
      Stunde: 'Jede Stunde',
      Minute: 'Jede Minute',
    })[unit] ?? unit,
  everyN: (n, unit) => `Alle ${n} ${unit}`,
  onDays: 'am',
  onMonthDay: 'am Tag',
  onNth: (nth, weekday) => `am ${DE_NTH[nth] ?? `${nth}.`} ${weekday}`,
  inMonths: 'im',
  times: (n) => (n === 1 ? 'einmal' : `${n} Mal`),
  until: 'bis',
  and: 'und',
})

const ES_NTH: Record<string, string> = {
  '1': 'primer',
  '2': 'segundo',
  '3': 'tercer',
  '4': 'cuarto',
  '5': 'quinto',
  '-1': 'último',
  '-2': 'penúltimo',
}

export const es = pack({
  today: 'Hoy',
  previous: 'Anterior',
  next: 'Siguiente',
  allDay: 'Todo el día',
  close: 'Cerrar',
  noEvents: 'Sin eventos',
  more: (n) => `+${n} más`,
  eventCount: (n) => (n === 1 ? '1 evento' : `${n} eventos`),
  dragHint:
    'Pulsa Alt y las flechas para mover, Alt Mayús para cambiar el final, Alt Ctrl para cambiar el inicio, Supr para eliminar.',
  changed: (title, when) => `${title} movido a ${when}`,
  cancelled: 'Movimiento cancelado',
  selected: (when) => `${when} seleccionado`,
  resources: 'Recursos',
  moreViews: 'Más',
  loading: 'Cargando…',
  error: 'Algo salió mal',
  searchResources: 'Buscar recursos',
  popOut: 'Abrir en imagen en imagen',
  popIn: 'Volver a la página',
  poppedOut: 'El calendario está abierto en una ventana flotante.',
  moveArmed: (title) => `${title} seleccionado. Elige el destino o pulsa Esc.`,
  conflict: 'Se solapa con otro evento',
  eventStack: (n) => (n === 1 ? '1 evento' : `${n} eventos`),
  timeFold: (start, end) => `${start} a ${end}, sin eventos`,
  draftChanges: (n) => (n === 1 ? '1 cambio' : `${n} cambios`),
  apply: 'Aplicar',
  discard: 'Descartar',
  units: {
    YEARLY: ['año', 'años'],
    MONTHLY: ['mes', 'meses'],
    WEEKLY: ['semana', 'semanas'],
    DAILY: ['día', 'días'],
    HOURLY: ['hora', 'horas'],
    MINUTELY: ['minuto', 'minutos'],
  },
  every: (unit) => `Cada ${unit}`,
  everyN: (n, unit) => `Cada ${n} ${unit}`,
  onDays: 'el',
  onMonthDay: 'el día',
  onNth: (nth, weekday) => `el ${ES_NTH[nth] ?? `${nth}.º`} ${weekday}`,
  inMonths: 'en',
  times: (n) => (n === 1 ? 'una vez' : `${n} veces`),
  until: 'hasta el',
  and: 'y',
})
