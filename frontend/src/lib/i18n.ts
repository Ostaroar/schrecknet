import { useCardLanguage } from './cardLanguage'
import staticPagesEn from '../../../content/static-pages.en.json'

export type UiLanguage = 'en' | 'es' | 'fr' | 'de'

export const UI_LANGUAGES: UiLanguage[] = ['en', 'es', 'fr', 'de']

export function resolveUiLanguage(language: string): UiLanguage {
  const lower = language.toLowerCase()
  return (UI_LANGUAGES as string[]).includes(lower) ? (lower as UiLanguage) : 'en'
}

export interface UiStrings {
  nav: {
    cryptSearch: string
    librarySearch: string
    decks: string
    inventory: string
    limited: string
    precons: string
    table: string
    rules: string
    changelog: string
    help: string
    about: string
  }
  header: {
    cardTextLabel: string
    cardCounts: (crypt: number, library: number) => string
    v5Only: string
    tagline: string
  }
  footer: {
    copyright: string
    disclaimer: string
    help: string
    about: string
    legal: string
    support: string
  }
  help: {
    eyebrow: string
    title: string
    findCardsTitle: string
    findCards1: string
    findCards2: string
    buildDecksTitle: string
    buildDecks1: string
    buildDecks2: string
    offlineTitle: string
    offline1: string
    offline2: string
    apiTitle: string
    api1: string
    api2: string
  }
  about: {
    eyebrow: string
    title: string
    lead: string
    travelTitle: string
    travel1: string
    travel2: string
    engineTitle: string
    engine1: string
    engine2: string
    creditsTitle: string
    creditsBuildsOn: string
    creditsAnd: string
    creditsCardData: string
    creditsRights: string
  }
  changelog: {
    eyebrow: string
    title: string
    lead: string
    entries: Array<{ date: string; title: string; summary: string; items: string[] }>
  }
  search: {
    nameText: string
    semanticPrompt: string
    all: string
    any: string
    not: string
    only: string
    name: string
    text: string
    artist: string
    clear: string
    loading: string
    loadError: string
    noMatches: string
    sort: string
    relevance: string
    onlyOwned: string
    onlyInFormat: string
    traits: string
    allTraitsRequired: string
    set: string
    anySet: string
    setAge: string
    inSet: string
    orNewer: string
    orOlder: string
    notNewer: string
    notOlder: string
    printing: string
    anyPrinting: string
    onlyIn: string
    firstPrint: string
    reprint: string
    preconFilters: string
    addPrecon: string
    anyPrecon: string
    selectedPrecons: string
    removePrecon: (precon: string, set: string) => string
    semantic: string
    semanticTitle: string
    semanticIdle: string
    semanticLoading: string
    semanticDownloading: string
    semanticReady: string
    semanticUnavailable: (error: string) => string
    retry: string
    removeModel: string
  }
  cryptSearch: {
    anyClan: string
    anyTitle: string
    nonTitled: string
    votes: string
    anyVotes: string
    noVotes: string
    votesAtLeast: (count: number) => string
    group: string
    capacity: string
    minimum: string
    maximum: string
    sect: string
    orDiscipline: string
    choose: string
    results: (count: number, semantic: boolean) => string
    semanticEmpty: string
    sortCapacityDesc: string
    sortCapacityAsc: string
    sortClan: string
    sortGroup: string
    sortName: string
    sortSect: string
    similarity: string
  }
  librarySearch: {
    anyType: string
    anyClanRequirement: string
    requiresCapacity: string
    blood: string
    pool: string
    disciplineLogic: string
    noRequirement: string
    sect: string
    title: string
    results: (count: number, semantic: boolean) => string
    semanticEmpty: string
    sortRequirement: string
    sortCostDesc: string
    sortCostAsc: string
    sortName: string
    sortType: string
    similarity: string
    requirement: string
    notRequired: string
    titledSpecific: string
    titledAny: string
    nonTitled: string
  }
  table: {
    title: string; intro: string; cancel: string; joinAnother: string; groupMissing: string
    noGroup: string; confirmLeave: (name: string) => string; thisGroup: string
    createGroup: string; groupExample: string; create: string; joinGroup: string
    groupCode: string; join: string; shareCode: string; copied: string; leaveGroup: string
    loading: string; leaderboard: string; noGamesFirst: string; player: string
    games: string; totalVp: string; avgVp: string; wins: string; winRate: string
    logGame: string; editGame: string; datePlayed: string; notes: string
    seat: (number: number) => string; playerName: string; deckOptional: string
    archetype: string; anyArchetype: string; removeRow: (number: number) => string
    addPlayer: string; addOnePlayer: string; invalidVp: (name: string) => string
    saveChanges: string; archetypePerformance: string; recentGames: string
    exportCsv: string; exportText: string; edit: string; delete: string; deleting: string
    deleteAria: (date: string) => string; confirmDelete: (date: string, players: string) => string
    alreadyDeleted: string; noGames: string; predator: (name: string) => string
    prey: (name: string) => string
  }
  inventory: {
    title: string
    counts: (crypt: number, library: number) => string
    loading: string
    loadError: string
    importExportTitle: string
    exportTxt: string
    loadTxt: string
    importText: string
    hideImport: string
    importPlaceholder: string
    addToInventory: string
    importing: string
    addedCards: (count: number) => string
    couldNotMatch: (names: string) => string
    addRemovePreconTitle: string
    preconNote: string
    choosePrecon: string
    preconQuantityLabel: string
    adding: string
    removeFromInventory: string
    removing: string
    addedCopies: (precons: number, count: number) => string
    removedCopies: (precons: number, count: number) => string
    missingCardsTitle: (total: number, count: number) => string
    exportWantList: string
    missingNote: string
    crypt: string
    library: string
    noCryptOwned: string
    noLibraryOwned: string
    removeAria: (name: string) => string
  }
  addCardBox: {
    placeholderCrypt: string
    placeholderLibrary: string
  }
  precons: {
    title: string
    intro: string
    cardCountNote: string
    loading: string
    loadError: (error: string) => string
    backToPrecons: string
    cardsSuffix: (count: number) => string
    cryptCount: (count: number) => string
    libraryCount: (count: number) => string
    none: string
  }
  decks: {
    newDeckPlaceholder: string
    createDeck: string
    compareTwoDecks: string
    loading: string
    loadError: (error: string) => string
    noDecks: string
    ownsCopies: string
    sharesCopies: string
    missingSuffix: (count: number) => string
    byAuthor: (author: string) => string
    clone: string
    delete: string
    confirmDelete: (name: string) => string
  }
  limitedFormat: {
    title: string
    introActive: string
    introInactive: string
    importExportTitle: string
    exportTxt: string
    loadTxt: string
    importText: string
    hideImport: string
    resetFormat: string
    importPlaceholder: string
    loadFormat: string
    importError: string
    allowedSets: string
    allowedCrypt: string
    allowedLibrary: string
    bannedCrypt: string
    bannedLibrary: string
    none: string
    removeAria: (name: string) => string
  }
}

const en: UiStrings = {
  nav: {
    cryptSearch: 'crypt search',
    librarySearch: 'library search',
    decks: 'decks',
    inventory: 'inventory',
    limited: 'limited',
    precons: 'precons',
    table: 'table',
    rules: 'rules',
    changelog: 'changelog',
    help: 'help',
    about: 'about',
  },
  header: {
    cardTextLabel: 'Card text',
    cardCounts: (crypt, library) => `${crypt} crypt · ${library} library`,
    v5Only: 'V5 only',
    tagline: 'Search fast. Build locally. Keep control.',
  },
  footer: {
    copyright:
      'Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com.',
    disclaimer: 'SchreckNet is unofficial fan content and is not endorsed by or affiliated with Paradox Interactive. It is not official World of Darkness material.',
    help: 'Help',
    about: 'About',
    legal: 'Legal notice',
    support: 'Support this project',
  },
  help: staticPagesEn.help,
  about: staticPagesEn.about,
  changelog: staticPagesEn.changelog,
  search: {
    nameText: 'Name / text', semanticPrompt: 'Describe a card concept (English)', all: 'All', any: 'Any', not: 'Not', only: 'Only', name: 'Name', text: 'Text', artist: 'Artist', clear: 'clear', loading: 'Loading card database…', loadError: "Couldn't load the card database", noMatches: 'No cards match those filters.', sort: 'Sort', relevance: 'Relevance', onlyOwned: 'Only owned', onlyInFormat: 'Only in format', traits: 'Traits', allTraitsRequired: 'all selected traits required', set: 'Set', anySet: 'Any set', setAge: 'Set age relation', inSet: 'In set', orNewer: 'Or newer', orOlder: 'Or older', notNewer: 'Not newer', notOlder: 'Not older', printing: 'Printing relation', anyPrinting: 'Any printing', onlyIn: 'Only in', firstPrint: 'First print', reprint: 'Reprint', preconFilters: 'Precon filters', addPrecon: 'Add precon', anyPrecon: 'Any precon / add another…', selectedPrecons: 'Selected precons', removePrecon: (precon, set) => `Remove ${precon} from ${set}`, semantic: 'Semantic', semanticTitle: 'Find cards by English concept using the local offline model', semanticIdle: 'Describe an English card concept. First use downloads about 46 MB (model + runtime); queries stay on this device.', semanticLoading: 'Preparing the local semantic model…', semanticDownloading: 'Downloading local model', semanticReady: 'Local semantic model ready. Results are cosine-ranked; the score is similarity, not a probability.', semanticUnavailable: (error) => `Semantic model unavailable: ${error}`, retry: 'Retry', removeModel: 'Remove local model',
  },
  cryptSearch: {
    anyClan: 'Any clan', anyTitle: 'Any title', nonTitled: 'Non-titled', votes: 'Votes', anyVotes: 'Any votes', noVotes: 'No votes', votesAtLeast: (count) => `${count}+ votes`, group: 'Group', capacity: 'cap', minimum: 'min', maximum: 'max', sect: 'Sect', orDiscipline: '+ OR discipline', choose: 'Choose…', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} crypt cards`, semanticEmpty: 'Describe a concept to search the V5 crypt.', sortCapacityDesc: 'Capacity high–low', sortCapacityAsc: 'Capacity low–high', sortClan: 'Clan', sortGroup: 'Group', sortName: 'Name', sortSect: 'Sect', similarity: 'similarity',
  },
  librarySearch: {
    anyType: 'Any type', anyClanRequirement: 'Any clan requirement', requiresCapacity: 'requires cap', blood: 'blood', pool: 'pool', disciplineLogic: 'Discipline logic', noRequirement: 'No requirement', sect: 'Sect', title: 'Title', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} library cards`, semanticEmpty: 'Describe a concept to search the V5 library.', sortRequirement: 'Clan / discipline', sortCostDesc: 'Cost high–low', sortCostAsc: 'Cost low–high', sortName: 'Name', sortType: 'Type', similarity: 'similarity', requirement: 'requirement', notRequired: 'Not required', titledSpecific: 'Titled (specific)', titledAny: 'Titled (any)', nonTitled: 'Non-titled',
  },
  table: {
    title: 'Table', intro: 'Track games with your private playgroup and keep a shared leaderboard — no account needed. Group data is accessible only with its share code.', cancel: 'Cancel', joinAnother: '+ Join another', groupMissing: "That group code doesn't exist anymore.", noGroup: 'No group has that code.', confirmLeave: (name) => `Leave ${name}? You can rejoin later with its code.`, thisGroup: 'this group', createGroup: 'Create a group', groupExample: 'e.g. Thursday Night Coterie', create: 'Create', joinGroup: 'Join a group', groupCode: 'Group code', join: 'Join', shareCode: 'Share this private code with your group:', copied: 'Copied!', leaveGroup: 'Leave group', loading: 'Loading…', leaderboard: 'Leaderboard', noGamesFirst: 'No games logged yet — log your first game below.', player: 'Player', games: 'Games', totalVp: 'Total VP', avgVp: 'Avg VP', wins: 'Wins', winRate: 'Win rate', logGame: 'Log game', editGame: 'Edit game', datePlayed: 'Date played', notes: 'Notes (optional)', seat: (number) => `Seat ${number}`, playerName: 'Player name', deckOptional: 'Deck (optional)', archetype: 'Archetype', anyArchetype: 'Archetype (optional)', removeRow: (number) => `Remove player row ${number}`, addPlayer: '+ Add player', addOnePlayer: 'Add at least one player.', invalidVp: (name) => `${name}: VP must be a non-negative number.`, saveChanges: 'Save changes', archetypePerformance: 'Archetype performance', recentGames: 'Recent games', exportCsv: 'Export CSV', exportText: 'Export text', edit: 'Edit', delete: 'Delete', deleting: 'Deleting…', deleteAria: (date) => `Delete the ${date} game`, confirmDelete: (date, players) => `Delete the ${date} game (${players})? This permanently removes it from the leaderboard.`, alreadyDeleted: 'That game was already deleted.', noGames: 'No games logged yet.', predator: (name) => `Predator: ${name}`, prey: (name) => `Prey: ${name}`,
  },
  inventory: {
    title: 'Inventory', counts: (crypt, library) => `${crypt} crypt · ${library} library`, loading: 'Loading inventory…', loadError: "Couldn't load inventory", importExportTitle: 'Text import / export', exportTxt: 'Export .txt', loadTxt: 'Load .txt', importText: 'Import text…', hideImport: 'Hide import', importPlaceholder: 'Paste a card list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Add to inventory', importing: 'Importing…', addedCards: (count) => `Added ${count} card${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Couldn't match: ${names}.`, addRemovePreconTitle: 'Add / remove a precon', preconNote: "Enter how many copies of this precon you own — each card is adjusted by its own real per-precon copy count (some precons include more than one of a given card), not a flat amount.", choosePrecon: 'Choose a precon…', preconQuantityLabel: 'Precons', adding: 'Adding…', removeFromInventory: 'Remove from inventory', removing: 'Removing…', addedCopies: (precons, count) => `Added ${precons} precon${precons === 1 ? '' : 's'} (${count} distinct cards, using each card's real per-precon copy count).`, removedCopies: (precons, count) => `Removed ${precons} precon${precons === 1 ? '' : 's'} (${count} distinct cards, using each card's real per-precon copy count).`, missingCardsTitle: (total, count) => `Missing cards — ${total} copies across ${count} card${count === 1 ? '' : 's'}`, exportWantList: 'Export want-list .txt', missingNote: 'What every inventory-tracked deck still needs, combined — decks marked "Not in inventory" aren\'t counted.', crypt: 'Crypt', library: 'Library', noCryptOwned: 'No crypt cards owned yet.', noLibraryOwned: 'No library cards owned yet.', removeAria: (name) => `Remove ${name} from inventory`,
  },
  addCardBox: {
    placeholderCrypt: 'Add crypt card by name…', placeholderLibrary: 'Add library card by name…',
  },
  precons: {
    title: 'Precon decks', intro: "Official preconstructed decks from the V5 pool, grouped by set. Card quantities per deck aren't tracked by the data source — each entry shows the deck's known card pool.", cardCountNote: "Card pool for this precon — quantities aren't tracked by the data source, so this shows which cards belong to it, not a ready-to-play decklist.", loading: 'Loading precons…', loadError: (error) => `Couldn't load precons: ${error}`, backToPrecons: '← Precons', cardsSuffix: (count) => `${count} cards`, cryptCount: (count) => `Crypt · ${count}`, libraryCount: (count) => `Library · ${count}`, none: 'None',
  },
  decks: {
    newDeckPlaceholder: 'New deck name', createDeck: 'Create deck', compareTwoDecks: 'Compare two decks →', loading: 'Loading decks…', loadError: (error) => `Couldn't load your decks: ${error}`, noDecks: 'No decks yet — decks are stored locally in this browser (no account needed).', ownsCopies: 'Owns copies', sharesCopies: 'Shares copies', missingSuffix: (count) => `${count} missing`, byAuthor: (author) => `by ${author}`, clone: 'Clone', delete: 'Delete', confirmDelete: (name) => `Delete "${name}"? This can't be undone.`,
  },
  limitedFormat: {
    title: 'Limited format', introActive: 'Build a custom card pool for a limited/draft event: pick allowed sets, then allow or ban individual cards on top. This format is active — decks show its legality alongside V5 legality.', introInactive: 'Build a custom card pool for a limited/draft event: pick allowed sets, then allow or ban individual cards on top. Empty for now, so it has no effect on decks.', importExportTitle: 'Import / export', exportTxt: 'Export .txt', loadTxt: 'Load .txt', importText: 'Import text…', hideImport: 'Hide import', resetFormat: 'Reset format', importPlaceholder: 'Paste an exported limited-format .txt', loadFormat: 'Load format', importError: "Couldn't parse that file — expected the JSON exported from this page.", allowedSets: 'Allowed sets', allowedCrypt: 'Allowed crypt cards', allowedLibrary: 'Allowed library cards', bannedCrypt: 'Banned crypt cards', bannedLibrary: 'Banned library cards', none: 'None', removeAria: (name) => `Remove ${name}`,
  },
}

const es: UiStrings = {
  nav: {
    cryptSearch: 'buscar cripta',
    librarySearch: 'buscar biblioteca',
    decks: 'mazos',
    inventory: 'inventario',
    limited: 'formato limitado',
    precons: 'premontados',
    table: 'mesa',
    rules: 'reglas',
    changelog: 'novedades',
    help: 'ayuda',
    about: 'acerca de',
  },
  header: {
    cardTextLabel: 'Texto de carta',
    cardCounts: (crypt, library) => `${crypt} cripta · ${library} biblioteca`,
    v5Only: 'Solo V5',
    tagline: 'Busca rápido. Construye en local. Mantén el control.',
  },
  footer: {
    copyright:
      'Parte de este material es propiedad y marca registrada de Paradox Interactive AB, y se usa con permiso. Todos los derechos reservados. Para más información visite worldofdarkness.com.',
    disclaimer:
      'SchreckNet es contenido de fans no oficial y no está avalado ni afiliado a Paradox Interactive. No es material oficial de World of Darkness.',
    help: 'Ayuda',
    about: 'Acerca de',
    legal: 'Aviso legal',
    support: 'Apoya este proyecto',
  },
  help: {
    eyebrow: 'Ayuda',
    title: 'Busca rápido. Construye en local. Mantén el control.',
    findCardsTitle: 'Buscar cartas',
    findCards1:
      'Usa la búsqueda de Cripta o Biblioteca para filtros detallados exclusivos de V5. Selecciona un resultado para abrir su página completa.',
    findCards2: 'Pulsa ⌘K en macOS o Ctrl+K en otros sistemas para buscar cualquier carta por nombre.',
    buildDecksTitle: 'Construir mazos',
    buildDecks1: 'Crea un mazo local, añade cartas por nombre y ajusta las cantidades con los controles compactos.',
    buildDecks2: 'Importa o exporta listas de texto, comparte la URL de un mazo, roba manos de prueba, compara mazos y revisa la legalidad V5.',
    offlineTitle: 'Datos sin conexión',
    offline1:
      'La primera visita descarga la base de datos de cartas V5. Las búsquedas y ediciones posteriores usan SQLite local del navegador.',
    offline2:
      'Borrar el almacenamiento del navegador de este sitio también elimina los mazos locales anónimos, así que exporta las listas importantes.',
    apiTitle: 'API para máquinas',
    api1: 'MCP Streamable HTTP se sirve en /mcp; los clientes locales pueden usar schrecknet-server --mcp-stdio.',
    api2: 'Los endpoints REST de cartas, reflejo del MCP, están bajo /api/v1.',
  },
  about: {
    eyebrow: 'Acerca de SchreckNet',
    title: 'La biblioteca de cartas y el taller de mazos de V5.',
    lead: 'SchreckNet es una aplicación independiente, creada desde cero y sin conexión, centrada exclusivamente en la investigación de cartas y la construcción de mazos de VTES Quinta Edición. VDB sirve como referencia de funciones y comportamiento; SchreckNet no reutiliza ni depende de su código fuente. Los archivos de torneos, las clasificaciones comunitarias y las funciones del programa de pruebas quedan deliberadamente fuera de su alcance.',
    travelTitle: 'Hecho para viajar',
    travel1: 'La búsqueda de cartas y los mazos locales siguen funcionando después de que la app y la base de datos V5 se hayan guardado en caché.',
    travel2: 'Tus mazos anónimos viven en una base de datos SQLite separada y con permisos de escritura en este navegador.',
    engineTitle: 'Un único motor de reglas',
    engine1: 'La lógica de dominio en Rust se ejecuta de forma nativa en el servidor y como WebAssembly en el navegador.',
    engine2: 'SQLite es la capa de almacenamiento en ambos lados; MCP y REST comparten los mismos servicios de cartas.',
    creditsTitle: 'Créditos',
    creditsBuildsOn: 'SchreckNet usa',
    creditsAnd: 'como referencia de funciones y comportamiento; los datos de cartas y erratas proceden de',
    creditsCardData: '. El código fuente está disponible bajo licencia MIT.',
    creditsRights:
      'Parte de este material es propiedad y marca registrada de Paradox Interactive AB, y se usa con permiso. Todos los derechos reservados. Para más información visite worldofdarkness.com. SchreckNet es contenido de fans no oficial y no está avalado ni afiliado a Paradox Interactive; no es material oficial de World of Darkness.',
  },
  changelog: {
    eyebrow: 'Novedades',
    title: 'Qué ha cambiado en SchreckNet.',
    lead: 'Hitos del banco de trabajo para investigar cartas y construir mazos V5.',
    entries: [
      { date: '2026-07-22', title: 'Busca en tu idioma', summary: 'Los controles de Cripta y Biblioteca siguen ahora el idioma de interfaz seleccionado: inglés, español o francés.', items: ['Se han traducido los controles de búsqueda exacta, regex, semántica, edición, premontado, rasgos y ordenación.', 'La cobertura del navegador prueba ambas rutas de búsqueda en español y francés.'] },
      { date: '2026-07-22', title: 'Construcción de mazos adaptable', summary: 'El banco de trabajo completo cabe ahora en teléfonos compactos sin ocultar las acciones principales.', items: ['Se han validado diez rutas principales a 320 px y 360 px.', 'Se han mejorado los objetivos táctiles, el inventario y el editor de mazos con cartas.'] },
      { date: '2026-07-22', title: 'Inventario local completo', summary: 'El inventario anónimo funciona sin conexión junto a los mazos locales.', items: ['Incluye filtros de cartas propias, listas de faltantes, exportación de compras e integración con proxies.', 'El inventario y los mazos permanecen en la base local del navegador.'] },
      { date: '2026-07-21', title: 'Investigación semántica sin conexión', summary: 'La búsqueda conceptual funciona sin enviar textos ni consultas a un modelo remoto.', items: ['Se añadió un modelo local verificado y vectores V5 integrados.', 'El navegador, REST y MCP comparten la clasificación implementada en Rust.'] },
    ],
  },
  search: {
    nameText: 'Nombre / texto', semanticPrompt: 'Describe un concepto de carta (en inglés)', all: 'Todos', any: 'Cualquiera', not: 'No', only: 'Solo', name: 'Nombre', text: 'Texto', artist: 'Artista', clear: 'limpiar', loading: 'Cargando la base de cartas…', loadError: 'No se pudo cargar la base de cartas', noMatches: 'Ninguna carta coincide con esos filtros.', sort: 'Ordenar', relevance: 'Relevancia', onlyOwned: 'Solo propias', onlyInFormat: 'Solo en formato', traits: 'Rasgos', allTraitsRequired: 'se requieren todos los rasgos seleccionados', set: 'Edición', anySet: 'Cualquier edición', setAge: 'Relación de edición', inSet: 'En la edición', orNewer: 'O más nueva', orOlder: 'O más antigua', notNewer: 'No más nueva', notOlder: 'No más antigua', printing: 'Relación de impresión', anyPrinting: 'Cualquier impresión', onlyIn: 'Solo en', firstPrint: 'Primera impresión', reprint: 'Reimpresión', preconFilters: 'Filtros de premontados', addPrecon: 'Añadir premontado', anyPrecon: 'Cualquier premontado / añadir otro…', selectedPrecons: 'Premontados seleccionados', removePrecon: (precon, set) => `Quitar ${precon} de ${set}`, semantic: 'Semántica', semanticTitle: 'Busca cartas por concepto en inglés con el modelo local sin conexión', semanticIdle: 'Describe un concepto de carta en inglés. El primer uso descarga unos 46 MB; las consultas permanecen en este dispositivo.', semanticLoading: 'Preparando el modelo semántico local…', semanticDownloading: 'Descargando el modelo local', semanticReady: 'Modelo semántico local listo. Los resultados se ordenan por similitud coseno; la puntuación no es una probabilidad.', semanticUnavailable: (error) => `Modelo semántico no disponible: ${error}`, retry: 'Reintentar', removeModel: 'Eliminar modelo local',
  },
  cryptSearch: {
    anyClan: 'Cualquier clan', anyTitle: 'Cualquier título', nonTitled: 'Sin título', votes: 'Votos', anyVotes: 'Cualquier voto', noVotes: 'Sin votos', votesAtLeast: (count) => `${count}+ votos`, group: 'Grupo', capacity: 'cap', minimum: 'mín', maximum: 'máx', sect: 'Secta', orDiscipline: '+ disciplina O', choose: 'Elegir…', results: (count, semantic) => `${count} cartas de cripta${semantic ? ' semánticas' : ''}`, semanticEmpty: 'Describe un concepto para buscar en la cripta V5.', sortCapacityDesc: 'Capacidad mayor–menor', sortCapacityAsc: 'Capacidad menor–mayor', sortClan: 'Clan', sortGroup: 'Grupo', sortName: 'Nombre', sortSect: 'Secta', similarity: 'similitud',
  },
  librarySearch: {
    anyType: 'Cualquier tipo', anyClanRequirement: 'Cualquier requisito de clan', requiresCapacity: 'requiere cap', blood: 'sangre', pool: 'pool', disciplineLogic: 'Lógica de disciplinas', noRequirement: 'Sin requisito', sect: 'Secta', title: 'Título', results: (count, semantic) => `${count} cartas de biblioteca${semantic ? ' semánticas' : ''}`, semanticEmpty: 'Describe un concepto para buscar en la biblioteca V5.', sortRequirement: 'Clan / disciplina', sortCostDesc: 'Coste mayor–menor', sortCostAsc: 'Coste menor–mayor', sortName: 'Nombre', sortType: 'Tipo', similarity: 'similitud', requirement: 'requisito', notRequired: 'No requerido', titledSpecific: 'Con título (específico)', titledAny: 'Con título (cualquiera)', nonTitled: 'Sin título',
  },
  table: {
    title: 'Mesa', intro: 'Registra partidas con tu grupo privado y mantén una clasificación compartida, sin cuenta. Solo se accede a los datos con el código del grupo.', cancel: 'Cancelar', joinAnother: '+ Unirse a otro', groupMissing: 'Ese código de grupo ya no existe.', noGroup: 'No existe un grupo con ese código.', confirmLeave: (name) => `¿Salir de ${name}? Puedes volver a unirte con su código.`, thisGroup: 'este grupo', createGroup: 'Crear un grupo', groupExample: 'p. ej. Coterie del jueves', create: 'Crear', joinGroup: 'Unirse a un grupo', groupCode: 'Código del grupo', join: 'Unirse', shareCode: 'Comparte este código privado con tu grupo:', copied: '¡Copiado!', leaveGroup: 'Salir del grupo', loading: 'Cargando…', leaderboard: 'Clasificación', noGamesFirst: 'Aún no hay partidas — registra la primera abajo.', player: 'Jugador', games: 'Partidas', totalVp: 'VP total', avgVp: 'VP medio', wins: 'Victorias', winRate: '% victorias', logGame: 'Registrar partida', editGame: 'Editar partida', datePlayed: 'Fecha', notes: 'Notas (opcional)', seat: (number) => `Asiento ${number}`, playerName: 'Nombre del jugador', deckOptional: 'Mazo (opcional)', archetype: 'Arquetipo', anyArchetype: 'Arquetipo (opcional)', removeRow: (number) => `Quitar fila ${number}`, addPlayer: '+ Añadir jugador', addOnePlayer: 'Añade al menos un jugador.', invalidVp: (name) => `${name}: los VP deben ser un número no negativo.`, saveChanges: 'Guardar cambios', archetypePerformance: 'Rendimiento por arquetipo', recentGames: 'Partidas recientes', exportCsv: 'Exportar CSV', exportText: 'Exportar texto', edit: 'Editar', delete: 'Eliminar', deleting: 'Eliminando…', deleteAria: (date) => `Eliminar la partida del ${date}`, confirmDelete: (date, players) => `¿Eliminar la partida del ${date} (${players})? Se quitará permanentemente de la clasificación.`, alreadyDeleted: 'Esa partida ya se había eliminado.', noGames: 'Aún no hay partidas.', predator: (name) => `Depredador: ${name}`, prey: (name) => `Presa: ${name}`,
  },
  inventory: {
    title: 'Inventario', counts: (crypt, library) => `${crypt} cripta · ${library} biblioteca`, loading: 'Cargando inventario…', loadError: 'No se pudo cargar el inventario', importExportTitle: 'Importar / exportar texto', exportTxt: 'Exportar .txt', loadTxt: 'Cargar .txt', importText: 'Importar texto…', hideImport: 'Ocultar importación', importPlaceholder: 'Pega una lista de cartas, p. ej.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Añadir al inventario', importing: 'Importando…', addedCards: (count) => `${count} carta${count === 1 ? '' : 's'} añadida${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `No se pudo encontrar: ${names}.`, addRemovePreconTitle: 'Añadir / quitar un premontado', preconNote: 'Indica cuántas copias de este premontado tienes — cada carta se ajusta según su número real de copias por premontado (algunos premontados incluyen más de una copia de ciertas cartas), no una cantidad fija.', choosePrecon: 'Elegir un premontado…', preconQuantityLabel: 'Premontados', adding: 'Añadiendo…', removeFromInventory: 'Quitar del inventario', removing: 'Quitando…', addedCopies: (precons, count) => `Añadido${precons === 1 ? '' : 's'} ${precons} premontado${precons === 1 ? '' : 's'} (${count} cartas distintas, usando el número real de copias por carta de cada premontado).`, removedCopies: (precons, count) => `Quitado${precons === 1 ? '' : 's'} ${precons} premontado${precons === 1 ? '' : 's'} (${count} cartas distintas, usando el número real de copias por carta de cada premontado).`, missingCardsTitle: (total, count) => `Cartas que faltan — ${total} copias en ${count} carta${count === 1 ? '' : 's'}`, exportWantList: 'Exportar lista de deseos .txt', missingNote: 'Lo que necesita en total cada mazo con seguimiento de inventario — los mazos marcados "No en inventario" no cuentan.', crypt: 'Cripta', library: 'Biblioteca', noCryptOwned: 'Aún no posees cartas de cripta.', noLibraryOwned: 'Aún no posees cartas de biblioteca.', removeAria: (name) => `Quitar ${name} del inventario`,
  },
  addCardBox: {
    placeholderCrypt: 'Añadir carta de cripta por nombre…', placeholderLibrary: 'Añadir carta de biblioteca por nombre…',
  },
  precons: {
    title: 'Mazos premontados', intro: 'Mazos preconstruidos oficiales del conjunto V5, agrupados por edición. Las cantidades por mazo no están registradas en la fuente de datos — cada entrada muestra el conjunto de cartas conocido del mazo.', cardCountNote: 'Conjunto de cartas de este premontado — las cantidades no están registradas en la fuente de datos, así que esto muestra qué cartas pertenecen a él, no una lista lista para jugar.', loading: 'Cargando premontados…', loadError: (error) => `No se pudieron cargar los premontados: ${error}`, backToPrecons: '← Premontados', cardsSuffix: (count) => `${count} cartas`, cryptCount: (count) => `Cripta · ${count}`, libraryCount: (count) => `Biblioteca · ${count}`, none: 'Ninguna',
  },
  decks: {
    newDeckPlaceholder: 'Nombre del mazo nuevo', createDeck: 'Crear mazo', compareTwoDecks: 'Comparar dos mazos →', loading: 'Cargando mazos…', loadError: (error) => `No se pudieron cargar tus mazos: ${error}`, noDecks: 'Aún no hay mazos — los mazos se guardan localmente en este navegador (sin necesidad de cuenta).', ownsCopies: 'Posee copias', sharesCopies: 'Comparte copias', missingSuffix: (count) => `${count} faltantes`, byAuthor: (author) => `por ${author}`, clone: 'Clonar', delete: 'Eliminar', confirmDelete: (name) => `¿Eliminar "${name}"? Esto no se puede deshacer.`,
  },
  limitedFormat: {
    title: 'Formato limitado', introActive: 'Crea un conjunto de cartas personalizado para un evento limitado/draft: elige las ediciones permitidas y luego permite o prohíbe cartas individuales. Este formato está activo — los mazos muestran su legalidad junto a la legalidad V5.', introInactive: 'Crea un conjunto de cartas personalizado para un evento limitado/draft: elige las ediciones permitidas y luego permite o prohíbe cartas individuales. Está vacío por ahora, así que no afecta a los mazos.', importExportTitle: 'Importar / exportar', exportTxt: 'Exportar .txt', loadTxt: 'Cargar .txt', importText: 'Importar texto…', hideImport: 'Ocultar importación', resetFormat: 'Restablecer formato', importPlaceholder: 'Pega un formato limitado exportado .txt', loadFormat: 'Cargar formato', importError: 'No se pudo interpretar ese archivo — se esperaba el JSON exportado desde esta página.', allowedSets: 'Ediciones permitidas', allowedCrypt: 'Cartas de cripta permitidas', allowedLibrary: 'Cartas de biblioteca permitidas', bannedCrypt: 'Cartas de cripta prohibidas', bannedLibrary: 'Cartas de biblioteca prohibidas', none: 'Ninguna', removeAria: (name) => `Quitar ${name}`,
  },
}

const fr: UiStrings = {
  nav: {
    cryptSearch: 'recherche crypte',
    librarySearch: 'recherche bibliothèque',
    decks: 'decks',
    inventory: 'inventaire',
    limited: 'format limité',
    precons: 'préconstruits',
    table: 'table',
    rules: 'règles',
    changelog: 'nouveautés',
    help: 'aide',
    about: 'à propos',
  },
  header: {
    cardTextLabel: 'Texte de carte',
    cardCounts: (crypt, library) => `${crypt} crypte · ${library} bibliothèque`,
    v5Only: 'V5 uniquement',
    tagline: 'Cherchez vite. Construisez en local. Gardez le contrôle.',
  },
  footer: {
    copyright:
      "Une partie de ce matériel est protégée par le droit d'auteur et les marques de Paradox Interactive AB, et est utilisée avec permission. Tous droits réservés. Pour plus d'informations, visitez worldofdarkness.com.",
    disclaimer:
      "SchreckNet est un contenu de fans non officiel, non approuvé par et sans affiliation avec Paradox Interactive. Ce n'est pas du matériel officiel World of Darkness.",
    help: 'Aide',
    about: 'À propos',
    legal: 'Mentions légales',
    support: 'Soutenir ce projet',
  },
  help: {
    eyebrow: 'Aide',
    title: 'Cherchez vite. Construisez en local. Gardez le contrôle.',
    findCardsTitle: 'Trouver des cartes',
    findCards1:
      'Utilisez la recherche Crypte ou Bibliothèque pour des filtres détaillés propres à la V5. Sélectionnez un résultat pour ouvrir sa fiche complète.',
    findCards2: 'Appuyez sur ⌘K sous macOS ou Ctrl+K ailleurs pour chercher n\'importe quelle carte par son nom.',
    buildDecksTitle: 'Construire des decks',
    buildDecks1: 'Créez un deck local, ajoutez des cartes par leur nom et ajustez les quantités avec les compteurs compacts.',
    buildDecks2: 'Importez ou exportez des listes texte, partagez l\'URL d\'un deck, tirez des mains de test, comparez des decks et vérifiez la légalité V5.',
    offlineTitle: 'Données hors ligne',
    offline1:
      'La première visite télécharge la base de cartes V5. Les recherches et modifications suivantes utilisent SQLite en local dans le navigateur.',
    offline2:
      "Vider le stockage du navigateur pour ce site supprime aussi les decks locaux anonymes : pensez à exporter les listes importantes.",
    apiTitle: 'API machine',
    api1: 'MCP Streamable HTTP est servi sur /mcp ; les clients locaux peuvent utiliser schrecknet-server --mcp-stdio.',
    api2: 'Les points d\'accès REST des cartes, miroirs du MCP, se trouvent sous /api/v1.',
  },
  about: {
    eyebrow: 'À propos de SchreckNet',
    title: 'La bibliothèque de cartes et l\'atelier de decks V5.',
    lead: "SchreckNet est une application indépendante, conçue de zéro et hors ligne, dédiée exclusivement à la recherche de cartes et à la construction de decks pour VTES Cinquième Édition. VDB sert de référence fonctionnelle et comportementale ; SchreckNet ne réutilise pas son code source et n'en dépend pas. Les archives de tournois, classements communautaires et fonctionnalités du programme de playtest sont volontairement hors de son périmètre.",
    travelTitle: 'Conçu pour voyager',
    travel1: "La recherche de cartes et les decks locaux continuent de fonctionner une fois l'application et la base V5 mises en cache.",
    travel2: 'Vos decks anonymes vivent dans une base SQLite distincte, accessible en écriture, dans ce navigateur.',
    engineTitle: 'Un seul moteur de règles',
    engine1: 'La logique métier en Rust tourne nativement sur le serveur et en WebAssembly dans le navigateur.',
    engine2: 'SQLite est la couche de stockage des deux côtés ; MCP et REST partagent les mêmes services de cartes.',
    creditsTitle: 'Crédits',
    creditsBuildsOn: 'SchreckNet utilise',
    creditsAnd: 'comme référence fonctionnelle et comportementale ; les données de cartes et erratas proviennent de',
    creditsCardData: '. Le code source est disponible sous licence MIT.',
    creditsRights:
      "Une partie de ce matériel est protégée par le droit d'auteur et les marques de Paradox Interactive AB, et est utilisée avec permission. Tous droits réservés. Pour plus d'informations, visitez worldofdarkness.com. SchreckNet est un contenu de fans non officiel, non approuvé par et sans affiliation avec Paradox Interactive ; ce n'est pas du matériel officiel World of Darkness.",
  },
  changelog: {
    eyebrow: 'Nouveautés',
    title: 'Ce qui a changé dans SchreckNet.',
    lead: "Les étapes marquantes de l'atelier de recherche de cartes et de construction de decks V5.",
    entries: [
      { date: '2026-07-22', title: 'Recherchez dans votre langue', summary: "Les commandes Crypte et Bibliothèque suivent maintenant la langue d'interface choisie : anglais, espagnol ou français.", items: ['Les commandes de recherche exacte, regex, sémantique, extension, préconstruit, traits et tri sont traduites.', 'La couverture navigateur vérifie les deux recherches en espagnol et en français.'] },
      { date: '2026-07-22', title: 'Construction de decks adaptative', summary: "L'atelier complet tient maintenant sur les téléphones compacts sans masquer les actions essentielles.", items: ['Dix routes principales sont validées à 320 px et 360 px.', "Les cibles tactiles, l'inventaire et l'éditeur de deck rempli ont été améliorés."] },
      { date: '2026-07-22', title: 'Inventaire local complet', summary: "L'inventaire anonyme fonctionne hors ligne avec les decks locaux.", items: ['Filtres de cartes possédées, listes de cartes manquantes, export des achats et intégration des proxies.', "L'inventaire et les decks restent dans la base locale du navigateur."] },
      { date: '2026-07-21', title: 'Recherche sémantique hors ligne', summary: "La recherche par concept fonctionne sans envoyer les textes ou requêtes à un modèle distant.", items: ['Un modèle local vérifié et les vecteurs V5 sont intégrés.', 'Le navigateur, REST et MCP partagent le classement implémenté en Rust.'] },
    ],
  },
  search: {
    nameText: 'Nom / texte', semanticPrompt: 'Décrivez un concept de carte (en anglais)', all: 'Tous', any: 'Au moins un', not: 'Exclure', only: 'Seulement', name: 'Nom', text: 'Texte', artist: 'Artiste', clear: 'effacer', loading: 'Chargement de la base de cartes…', loadError: 'Impossible de charger la base de cartes', noMatches: 'Aucune carte ne correspond à ces filtres.', sort: 'Trier', relevance: 'Pertinence', onlyOwned: 'Possédées seulement', onlyInFormat: 'Seulement dans le format', traits: 'Traits', allTraitsRequired: 'tous les traits sélectionnés sont requis', set: 'Extension', anySet: 'Toute extension', setAge: "Relation d'extension", inSet: "Dans l'extension", orNewer: 'Ou plus récente', orOlder: 'Ou plus ancienne', notNewer: 'Pas plus récente', notOlder: 'Pas plus ancienne', printing: "Relation d'impression", anyPrinting: 'Toute impression', onlyIn: 'Seulement dans', firstPrint: 'Première impression', reprint: 'Réimpression', preconFilters: 'Filtres de préconstruits', addPrecon: 'Ajouter un préconstruit', anyPrecon: 'Tout préconstruit / en ajouter un…', selectedPrecons: 'Préconstruits sélectionnés', removePrecon: (precon, set) => `Retirer ${precon} de ${set}`, semantic: 'Sémantique', semanticTitle: 'Trouvez des cartes par concept anglais avec le modèle local hors ligne', semanticIdle: 'Décrivez un concept de carte en anglais. La première utilisation télécharge environ 46 Mo ; les requêtes restent sur cet appareil.', semanticLoading: 'Préparation du modèle sémantique local…', semanticDownloading: 'Téléchargement du modèle local', semanticReady: "Le modèle sémantique local est prêt. Les résultats sont classés par similarité cosinus ; le score n'est pas une probabilité.", semanticUnavailable: (error) => `Modèle sémantique indisponible : ${error}`, retry: 'Réessayer', removeModel: 'Supprimer le modèle local',
  },
  cryptSearch: {
    anyClan: 'Tout clan', anyTitle: 'Tout titre', nonTitled: 'Sans titre', votes: 'Voix', anyVotes: 'Toutes voix', noVotes: 'Aucune voix', votesAtLeast: (count) => `${count}+ voix`, group: 'Groupe', capacity: 'cap', minimum: 'min', maximum: 'max', sect: 'Secte', orDiscipline: '+ discipline OU', choose: 'Choisir…', results: (count, semantic) => `${count} cartes de crypte${semantic ? ' sémantiques' : ''}`, semanticEmpty: 'Décrivez un concept pour chercher dans la crypte V5.', sortCapacityDesc: 'Capacité décroissante', sortCapacityAsc: 'Capacité croissante', sortClan: 'Clan', sortGroup: 'Groupe', sortName: 'Nom', sortSect: 'Secte', similarity: 'similarité',
  },
  librarySearch: {
    anyType: 'Tout type', anyClanRequirement: 'Toute exigence de clan', requiresCapacity: 'requiert cap', blood: 'sang', pool: 'pool', disciplineLogic: 'Logique des disciplines', noRequirement: 'Sans exigence', sect: 'Secte', title: 'Titre', results: (count, semantic) => `${count} cartes de bibliothèque${semantic ? ' sémantiques' : ''}`, semanticEmpty: 'Décrivez un concept pour chercher dans la bibliothèque V5.', sortRequirement: 'Clan / discipline', sortCostDesc: 'Coût décroissant', sortCostAsc: 'Coût croissant', sortName: 'Nom', sortType: 'Type', similarity: 'similarité', requirement: 'exigence', notRequired: 'Non requis', titledSpecific: 'Titré (spécifique)', titledAny: 'Titré (tout)', nonTitled: 'Sans titre',
  },
  table: {
    title: 'Table', intro: 'Consignez les parties de votre groupe privé et partagez un classement, sans compte. Les données ne sont accessibles qu’avec le code du groupe.', cancel: 'Annuler', joinAnother: '+ Rejoindre un autre', groupMissing: "Ce code de groupe n'existe plus.", noGroup: 'Aucun groupe ne possède ce code.', confirmLeave: (name) => `Quitter ${name} ? Vous pourrez le rejoindre avec son code.`, thisGroup: 'ce groupe', createGroup: 'Créer un groupe', groupExample: 'p. ex. Coterie du jeudi', create: 'Créer', joinGroup: 'Rejoindre un groupe', groupCode: 'Code du groupe', join: 'Rejoindre', shareCode: 'Partagez ce code privé avec votre groupe :', copied: 'Copié !', leaveGroup: 'Quitter le groupe', loading: 'Chargement…', leaderboard: 'Classement', noGamesFirst: 'Aucune partie — consignez la première ci-dessous.', player: 'Joueur', games: 'Parties', totalVp: 'VP total', avgVp: 'VP moyen', wins: 'Victoires', winRate: '% victoires', logGame: 'Consigner la partie', editGame: 'Modifier la partie', datePlayed: 'Date', notes: 'Notes (facultatif)', seat: (number) => `Place ${number}`, playerName: 'Nom du joueur', deckOptional: 'Deck (facultatif)', archetype: 'Archétype', anyArchetype: 'Archétype (facultatif)', removeRow: (number) => `Retirer la ligne ${number}`, addPlayer: '+ Ajouter un joueur', addOnePlayer: 'Ajoutez au moins un joueur.', invalidVp: (name) => `${name} : les VP doivent être un nombre positif ou nul.`, saveChanges: 'Enregistrer', archetypePerformance: 'Performance par archétype', recentGames: 'Parties récentes', exportCsv: 'Exporter CSV', exportText: 'Exporter texte', edit: 'Modifier', delete: 'Supprimer', deleting: 'Suppression…', deleteAria: (date) => `Supprimer la partie du ${date}`, confirmDelete: (date, players) => `Supprimer la partie du ${date} (${players}) ? Elle disparaîtra définitivement du classement.`, alreadyDeleted: 'Cette partie avait déjà été supprimée.', noGames: 'Aucune partie consignée.', predator: (name) => `Prédateur : ${name}`, prey: (name) => `Proie : ${name}`,
  },
  inventory: {
    title: 'Inventaire', counts: (crypt, library) => `${crypt} crypte · ${library} bibliothèque`, loading: "Chargement de l'inventaire…", loadError: "Impossible de charger l'inventaire", importExportTitle: 'Import / export texte', exportTxt: 'Exporter .txt', loadTxt: 'Charger .txt', importText: 'Importer texte…', hideImport: "Masquer l'import", importPlaceholder: 'Collez une liste de cartes, p. ex.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: "Ajouter à l'inventaire", importing: 'Importation…', addedCards: (count) => `${count} carte${count === 1 ? '' : 's'} ajoutée${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Introuvable : ${names}.`, addRemovePreconTitle: 'Ajouter / retirer un préconstruit', preconNote: "Indiquez combien d'exemplaires de ce préconstruit vous possédez — chaque carte est ajustée selon son propre nombre réel de copies par préconstruit (certains préconstruits incluent plus d'un exemplaire de certaines cartes), pas une quantité fixe.", choosePrecon: 'Choisir un préconstruit…', preconQuantityLabel: 'Préconstruits', adding: 'Ajout…', removeFromInventory: "Retirer de l'inventaire", removing: 'Retrait…', addedCopies: (precons, count) => `${precons} préconstruit${precons === 1 ? '' : 's'} ajouté${precons === 1 ? '' : 's'} (${count} cartes distinctes, en utilisant le nombre réel de copies par carte de chaque préconstruit).`, removedCopies: (precons, count) => `${precons} préconstruit${precons === 1 ? '' : 's'} retiré${precons === 1 ? '' : 's'} (${count} cartes distinctes, en utilisant le nombre réel de copies par carte de chaque préconstruit).`, missingCardsTitle: (total, count) => `Cartes manquantes — ${total} copies sur ${count} carte${count === 1 ? '' : 's'}`, exportWantList: 'Exporter la liste de souhaits .txt', missingNote: 'Ce dont chaque deck suivi par l\'inventaire a encore besoin, combiné — les decks marqués « Pas dans l\'inventaire » ne comptent pas.', crypt: 'Crypte', library: 'Bibliothèque', noCryptOwned: 'Aucune carte de crypte possédée pour le moment.', noLibraryOwned: 'Aucune carte de bibliothèque possédée pour le moment.', removeAria: (name) => `Retirer ${name} de l'inventaire`,
  },
  addCardBox: {
    placeholderCrypt: 'Ajouter une carte de crypte par son nom…', placeholderLibrary: 'Ajouter une carte de bibliothèque par son nom…',
  },
  precons: {
    title: 'Decks préconstruits', intro: "Decks préconstruits officiels du pool V5, groupés par extension. Les quantités par deck ne sont pas suivies par la source de données — chaque entrée montre le pool de cartes connu du deck.", cardCountNote: "Pool de cartes de ce préconstruit — les quantités ne sont pas suivies par la source de données, ceci montre donc quelles cartes en font partie, pas une liste prête à jouer.", loading: 'Chargement des préconstruits…', loadError: (error) => `Impossible de charger les préconstruits : ${error}`, backToPrecons: '← Préconstruits', cardsSuffix: (count) => `${count} cartes`, cryptCount: (count) => `Crypte · ${count}`, libraryCount: (count) => `Bibliothèque · ${count}`, none: 'Aucune',
  },
  decks: {
    newDeckPlaceholder: 'Nom du nouveau deck', createDeck: 'Créer un deck', compareTwoDecks: 'Comparer deux decks →', loading: 'Chargement des decks…', loadError: (error) => `Impossible de charger vos decks : ${error}`, noDecks: "Pas encore de decks — les decks sont stockés localement dans ce navigateur (aucun compte requis).", ownsCopies: 'Possède des copies', sharesCopies: 'Partage des copies', missingSuffix: (count) => `${count} manquante${count === 1 ? '' : 's'}`, byAuthor: (author) => `par ${author}`, clone: 'Cloner', delete: 'Supprimer', confirmDelete: (name) => `Supprimer « ${name} » ? Cette action est irréversible.`,
  },
  limitedFormat: {
    title: 'Format limité', introActive: 'Construisez un pool de cartes personnalisé pour un événement limité/draft : choisissez les extensions autorisées, puis autorisez ou interdisez des cartes individuelles. Ce format est actif — les decks affichent sa légalité à côté de la légalité V5.', introInactive: 'Construisez un pool de cartes personnalisé pour un événement limité/draft : choisissez les extensions autorisées, puis autorisez ou interdisez des cartes individuelles. Vide pour le moment, donc sans effet sur les decks.', importExportTitle: 'Import / export', exportTxt: 'Exporter .txt', loadTxt: 'Charger .txt', importText: 'Importer texte…', hideImport: "Masquer l'import", resetFormat: 'Réinitialiser le format', importPlaceholder: 'Collez un format limité exporté .txt', loadFormat: 'Charger le format', importError: "Impossible d'analyser ce fichier — le JSON exporté depuis cette page était attendu.", allowedSets: 'Extensions autorisées', allowedCrypt: 'Cartes de crypte autorisées', allowedLibrary: 'Cartes de bibliothèque autorisées', bannedCrypt: 'Cartes de crypte interdites', bannedLibrary: 'Cartes de bibliothèque interdites', none: 'Aucune', removeAria: (name) => `Retirer ${name}`,
  },
}

// German UI strings ship with no card-text data (KRCG/VEKN don't provide German
// card translations), so card text always falls back to English per-card
// (cardDetail.ts's localizeCardText already handles that gracefully) — but the
// interface itself is fully translated.
const de: UiStrings = {
  nav: {
    cryptSearch: 'Kryptasuche',
    librarySearch: 'Bibliothekssuche',
    decks: 'Decks',
    inventory: 'Inventar',
    limited: 'Limitiert',
    precons: 'Vorkonstruiert',
    table: 'Tisch',
    rules: 'Regeln',
    changelog: 'Änderungen',
    help: 'Hilfe',
    about: 'Über',
  },
  header: {
    cardTextLabel: 'Kartentext',
    cardCounts: (crypt, library) => `${crypt} Krypta · ${library} Bibliothek`,
    v5Only: 'Nur V5',
    tagline: 'Schnell suchen. Lokal bauen. Kontrolle behalten.',
  },
  footer: {
    copyright:
      'Teile des Materials sind Copyright und Marken von Paradox Interactive AB und werden mit Genehmigung verwendet. Alle Rechte vorbehalten. Weitere Informationen unter worldofdarkness.com.',
    disclaimer: 'SchreckNet ist inoffizieller Fan-Inhalt und wird von Paradox Interactive weder unterstützt noch ist es damit verbunden. Es handelt sich nicht um offizielles World-of-Darkness-Material.',
    help: 'Hilfe',
    about: 'Über',
    legal: 'Impressum & Datenschutz',
    support: 'Dieses Projekt unterstützen',
  },
  help: {
    eyebrow: 'Hilfe',
    title: 'Schnell suchen. Lokal bauen. Die Kontrolle behalten.',
    findCardsTitle: 'Karten finden',
    findCards1: 'Nutze die Krypta- oder Bibliothekssuche für detaillierte, V5-exklusive Filter. Wähle ein Ergebnis, um die vollständige Kartenseite zu öffnen.',
    findCards2: 'Drücke ⌘K auf macOS oder Strg+K anderswo, um jede Karte per Namen zu suchen.',
    buildDecksTitle: 'Decks bauen',
    buildDecks1: 'Erstelle ein lokales Deck, füge Karten per Namen hinzu und passe Mengen mit den kompakten Reglern an.',
    buildDecks2: 'Textlisten importieren oder exportieren, eine Deck-URL teilen, Testhände ziehen, Decks vergleichen und die V5-Legalität prüfen.',
    offlineTitle: 'Offline-Daten',
    offline1: 'Beim ersten Besuch wird die V5-Kartendatenbank heruntergeladen. Spätere Suchen und Deck-Bearbeitungen nutzen browserlokales SQLite.',
    offline2: 'Das Löschen des Browser-Speichers dieser Seite entfernt auch anonyme lokale Decks — exportiere daher wichtige Listen.',
    apiTitle: 'Maschinen-API',
    api1: 'MCP Streamable HTTP wird unter /mcp bereitgestellt; lokale Clients können schrecknet-server --mcp-stdio verwenden.',
    api2: 'Gespiegelte Karten-REST-Endpunkte liegen unter /api/v1.',
  },
  about: {
    eyebrow: 'Über SchreckNet',
    title: 'Die V5-Kartenbibliothek und Deck-Werkstatt.',
    lead: 'SchreckNet ist eine eigenständige, von Grund auf entwickelte Offline-first-Anwendung für VTES-Fifth-Edition-Kartenrecherche und Deckbau. VDB dient als Referenz für Funktionen und Bedienverhalten; SchreckNet übernimmt dessen Quellcode nicht und ist technisch nicht davon abhängig. Turnierarchive, Community-Ranglisten und Playtest-Programm-Funktionen liegen bewusst außerhalb des Umfangs.',
    travelTitle: 'Für unterwegs gebaut',
    travel1: 'Kartensuche und lokale Decks funktionieren weiter, nachdem die App und die V5-Datenbank zwischengespeichert wurden.',
    travel2: 'Deine anonymen Decks liegen in einer separaten, beschreibbaren SQLite-Datenbank in diesem Browser.',
    engineTitle: 'Eine Regel-Engine',
    engine1: 'Die Rust-Domänenlogik läuft nativ auf dem Server und als WebAssembly im Browser.',
    engine2: 'SQLite ist die Speicherschicht auf beiden Seiten; MCP und REST teilen sich dieselben Kartendienste.',
    creditsTitle: 'Danksagungen',
    creditsBuildsOn: 'SchreckNet nutzt',
    creditsAnd: 'als Funktions- und Verhaltensreferenz; Kartendaten und Regelentscheidungen stammen von',
    creditsCardData: '. Der Quellcode ist unter der MIT-Lizenz verfügbar.',
    creditsRights:
      'Teile des Materials sind Copyright und Marken von Paradox Interactive AB und werden mit Genehmigung verwendet. Alle Rechte vorbehalten. Weitere Informationen unter worldofdarkness.com. SchreckNet ist inoffizieller Fan-Inhalt und wird von Paradox Interactive weder unterstützt noch ist es damit verbunden; es handelt sich nicht um offizielles World-of-Darkness-Material.',
  },
  changelog: {
    eyebrow: 'Änderungen',
    title: 'Was sich bei SchreckNet geändert hat.',
    lead: 'Meilensteine für die V5-Kartenrecherche- und Deckbau-Werkstatt.',
    entries: [
      { date: '2026-07-22', title: 'Suche in deiner Sprache', summary: 'Krypta- und Bibliotheksrecherche folgt jetzt der gewählten Oberflächensprache Englisch, Spanisch oder Französisch.', items: ['Exakte, Regex-, semantische, Set-, Vorkonstruktions-, Merkmals- und Sortiersteuerungen lokalisiert.', 'Browser-Testabdeckung für beide Suchrouten auf Spanisch und Französisch hinzugefügt.'] },
      { date: '2026-07-22', title: 'Responsives Deckbauen', summary: 'Die komplette Werkstatt passt jetzt auch auf kompakte Handys, ohne zentrale Aktionen zu verstecken.', items: ['Zehn Hauptrouten bei 320 px und 360 px geprüft.', 'Touch-Ziele, Inventar-Layout und den gefüllten Deck-Editor verbessert.'] },
      { date: '2026-07-22', title: 'Lokales Inventar fertig', summary: 'Anonymes Inventar funktioniert offline neben lokalen Decks.', items: ['Filter für besessene Karten, Listen fehlender Karten, Wunschlisten-Export und Proxy-Integration hinzugefügt.', 'Inventar- und Deckdaten in der browserlokalen Benutzerdatenbank behalten.'] },
      { date: '2026-07-21', title: 'Offline-semantische Recherche', summary: 'Konzeptsuche ist möglich, ohne Kartentext oder Anfragen an ein entferntes Modell zu senden.', items: ['Ein prüfsummenfixiertes lokales Modell und eingebettete V5-Vektoren hinzugefügt.', 'Browser-, REST- und MCP-Ergebnisreihenfolge über gemeinsamen Rust-Code synchron gehalten.'] },
    ],
  },
  search: {
    nameText: 'Name / Text', semanticPrompt: 'Beschreibe ein Kartenkonzept (Englisch)', all: 'Alle', any: 'Beliebig', not: 'Nicht', only: 'Nur', name: 'Name', text: 'Text', artist: 'Künstler', clear: 'leeren', loading: 'Lade Kartendatenbank…', loadError: 'Kartendatenbank konnte nicht geladen werden', noMatches: 'Keine Karten entsprechen diesen Filtern.', sort: 'Sortieren', relevance: 'Relevanz', onlyOwned: 'Nur besessene', onlyInFormat: 'Nur im Format', traits: 'Merkmale', allTraitsRequired: 'alle ausgewählten Merkmale erforderlich', set: 'Set', anySet: 'Beliebiges Set', setAge: 'Set-Alter-Beziehung', inSet: 'Im Set', orNewer: 'Oder neuer', orOlder: 'Oder älter', notNewer: 'Nicht neuer', notOlder: 'Nicht älter', printing: 'Druck-Beziehung', anyPrinting: 'Beliebiger Druck', onlyIn: 'Nur in', firstPrint: 'Erstdruck', reprint: 'Nachdruck', preconFilters: 'Vorkonstruktions-Filter', addPrecon: 'Vorkonstruktion hinzufügen', anyPrecon: 'Beliebige Vorkonstruktion / weitere hinzufügen…', selectedPrecons: 'Ausgewählte Vorkonstruktionen', removePrecon: (precon, set) => `${precon} aus ${set} entfernen`, semantic: 'Semantisch', semanticTitle: 'Karten per englischem Konzept mit dem lokalen Offline-Modell finden', semanticIdle: 'Beschreibe ein englisches Kartenkonzept. Die erste Nutzung lädt etwa 46 MB (Modell + Laufzeit) herunter; Anfragen bleiben auf diesem Gerät.', semanticLoading: 'Bereite das lokale semantische Modell vor…', semanticDownloading: 'Lokales Modell wird heruntergeladen', semanticReady: 'Lokales semantisches Modell bereit. Ergebnisse sind kosinussortiert; der Wert ist eine Ähnlichkeit, keine Wahrscheinlichkeit.', semanticUnavailable: (error) => `Semantisches Modell nicht verfügbar: ${error}`, retry: 'Erneut versuchen', removeModel: 'Lokales Modell entfernen',
  },
  cryptSearch: {
    anyClan: 'Beliebiger Klan', anyTitle: 'Beliebiger Titel', nonTitled: 'Ohne Titel', votes: 'Stimmen', anyVotes: 'Beliebige Stimmen', noVotes: 'Keine Stimmen', votesAtLeast: (count) => `${count}+ Stimmen`, group: 'Gruppe', capacity: 'Kap', minimum: 'min', maximum: 'max', sect: 'Sekte', orDiscipline: '+ ODER-Disziplin', choose: 'Wählen…', results: (count, semantic) => `${count} Kryptakarten${semantic ? ' semantisch' : ''}`, semanticEmpty: 'Beschreibe ein Konzept, um die V5-Krypta zu durchsuchen.', sortCapacityDesc: 'Kapazität hoch–niedrig', sortCapacityAsc: 'Kapazität niedrig–hoch', sortClan: 'Klan', sortGroup: 'Gruppe', sortName: 'Name', sortSect: 'Sekte', similarity: 'Ähnlichkeit',
  },
  librarySearch: {
    anyType: 'Beliebiger Typ', anyClanRequirement: 'Beliebige Klan-Anforderung', requiresCapacity: 'erfordert Kap', blood: 'Blut', pool: 'Pool', disciplineLogic: 'Disziplin-Logik', noRequirement: 'Keine Anforderung', sect: 'Sekte', title: 'Titel', results: (count, semantic) => `${count} Bibliothekskarten${semantic ? ' semantisch' : ''}`, semanticEmpty: 'Beschreibe ein Konzept, um die V5-Bibliothek zu durchsuchen.', sortRequirement: 'Klan / Disziplin', sortCostDesc: 'Kosten hoch–niedrig', sortCostAsc: 'Kosten niedrig–hoch', sortName: 'Name', sortType: 'Typ', similarity: 'Ähnlichkeit', requirement: 'Anforderung', notRequired: 'Nicht erforderlich', titledSpecific: 'Betitelt (bestimmt)', titledAny: 'Betitelt (beliebig)', nonTitled: 'Ohne Titel',
  },
  table: {
    title: 'Tisch', intro: 'Erfasse Partien mit deiner privaten Spielgruppe und führe eine gemeinsame Rangliste — ohne Konto. Die Daten sind nur mit dem Gruppencode erreichbar.', cancel: 'Abbrechen', joinAnother: '+ Weiterer Gruppe beitreten', groupMissing: 'Diesen Gruppencode gibt es nicht mehr.', noGroup: 'Keine Gruppe hat diesen Code.', confirmLeave: (name) => `${name} verlassen? Du kannst später mit dem Code wieder beitreten.`, thisGroup: 'diese Gruppe', createGroup: 'Gruppe erstellen', groupExample: 'z. B. Donnerstags-Coterie', create: 'Erstellen', joinGroup: 'Gruppe beitreten', groupCode: 'Gruppencode', join: 'Beitreten', shareCode: 'Teile diesen privaten Code mit deiner Gruppe:', copied: 'Kopiert!', leaveGroup: 'Gruppe verlassen', loading: 'Lädt…', leaderboard: 'Rangliste', noGamesFirst: 'Noch keine Partien — erfasse unten die erste.', player: 'Spieler', games: 'Partien', totalVp: 'VP gesamt', avgVp: 'VP Ø', wins: 'Siege', winRate: 'Siegquote', logGame: 'Partie erfassen', editGame: 'Partie bearbeiten', datePlayed: 'Spieldatum', notes: 'Notizen (optional)', seat: (number) => `Sitz ${number}`, playerName: 'Spielername', deckOptional: 'Deck (optional)', archetype: 'Archetyp', anyArchetype: 'Archetyp (optional)', removeRow: (number) => `Spielerzeile ${number} entfernen`, addPlayer: '+ Spieler hinzufügen', addOnePlayer: 'Füge mindestens einen Spieler hinzu.', invalidVp: (name) => `${name}: VP müssen eine nichtnegative Zahl sein.`, saveChanges: 'Änderungen speichern', archetypePerformance: 'Archetypen-Auswertung', recentGames: 'Letzte Partien', exportCsv: 'CSV exportieren', exportText: 'Text exportieren', edit: 'Bearbeiten', delete: 'Löschen', deleting: 'Wird gelöscht…', deleteAria: (date) => `Partie vom ${date} löschen`, confirmDelete: (date, players) => `Partie vom ${date} (${players}) löschen? Sie wird dauerhaft aus der Rangliste entfernt.`, alreadyDeleted: 'Diese Partie wurde bereits gelöscht.', noGames: 'Noch keine Partien erfasst.', predator: (name) => `Predator: ${name}`, prey: (name) => `Prey: ${name}`,
  },
  inventory: {
    title: 'Inventar', counts: (crypt, library) => `${crypt} Krypta · ${library} Bibliothek`, loading: 'Lade Inventar…', loadError: 'Inventar konnte nicht geladen werden', importExportTitle: 'Text importieren / exportieren', exportTxt: 'Exportieren .txt', loadTxt: 'Laden .txt', importText: 'Text importieren…', hideImport: 'Import ausblenden', importPlaceholder: 'Füge eine Kartenliste ein, z. B.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Zum Inventar hinzufügen', importing: 'Importiere…', addedCards: (count) => `${count} Karte${count === 1 ? '' : 'n'} hinzugefügt.`, couldNotMatch: (names) => `Konnte nicht gefunden werden: ${names}.`, addRemovePreconTitle: 'Vorkonstruktion hinzufügen / entfernen', preconNote: 'Gib an, wie viele Exemplare dieser Vorkonstruktion du besitzt — jede Karte wird um ihre echte Kopienzahl pro Vorkonstruktion angepasst (manche Vorkonstruktionen enthalten manche Karten mehrfach), nicht um eine feste Menge.', choosePrecon: 'Vorkonstruktion wählen…', preconQuantityLabel: 'Vorkonstruktionen', adding: 'Füge hinzu…', removeFromInventory: 'Aus Inventar entfernen', removing: 'Entferne…', addedCopies: (precons, count) => `${precons} Vorkonstruktion${precons === 1 ? '' : 'en'} hinzugefügt (${count} verschiedene Karten, mit der echten Kopienzahl pro Karte je Vorkonstruktion).`, removedCopies: (precons, count) => `${precons} Vorkonstruktion${precons === 1 ? '' : 'en'} entfernt (${count} verschiedene Karten, mit der echten Kopienzahl pro Karte je Vorkonstruktion).`, missingCardsTitle: (total, count) => `Fehlende Karten — ${total} Exemplare auf ${count} Karte${count === 1 ? '' : 'n'}`, exportWantList: 'Wunschliste exportieren .txt', missingNote: 'Was jedes im Inventar erfasste Deck insgesamt noch braucht — Decks, die als "Nicht im Inventar" markiert sind, zählen nicht mit.', crypt: 'Krypta', library: 'Bibliothek', noCryptOwned: 'Noch keine Kryptakarten besessen.', noLibraryOwned: 'Noch keine Bibliothekskarten besessen.', removeAria: (name) => `${name} aus dem Inventar entfernen`,
  },
  addCardBox: {
    placeholderCrypt: 'Kryptakarte per Namen hinzufügen…', placeholderLibrary: 'Bibliothekskarte per Namen hinzufügen…',
  },
  precons: {
    title: 'Vorkonstruierte Decks', intro: 'Offizielle vorkonstruierte Decks aus dem V5-Pool, gruppiert nach Set. Kartenmengen pro Deck werden von der Datenquelle nicht erfasst — jeder Eintrag zeigt den bekannten Kartenpool des Decks.', cardCountNote: 'Kartenpool dieser Vorkonstruktion — Mengen werden von der Datenquelle nicht erfasst, daher zeigt dies, welche Karten dazugehören, keine spielfertige Deckliste.', loading: 'Lade Vorkonstruktionen…', loadError: (error) => `Vorkonstruktionen konnten nicht geladen werden: ${error}`, backToPrecons: '← Vorkonstruktionen', cardsSuffix: (count) => `${count} Karten`, cryptCount: (count) => `Krypta · ${count}`, libraryCount: (count) => `Bibliothek · ${count}`, none: 'Keine',
  },
  decks: {
    newDeckPlaceholder: 'Name des neuen Decks', createDeck: 'Deck erstellen', compareTwoDecks: 'Zwei Decks vergleichen →', loading: 'Lade Decks…', loadError: (error) => `Deine Decks konnten nicht geladen werden: ${error}`, noDecks: 'Noch keine Decks — Decks werden lokal in diesem Browser gespeichert (kein Konto nötig).', ownsCopies: 'Besitzt Exemplare', sharesCopies: 'Teilt Exemplare', missingSuffix: (count) => `${count} fehlend`, byAuthor: (author) => `von ${author}`, clone: 'Klonen', delete: 'Löschen', confirmDelete: (name) => `"${name}" löschen? Dies kann nicht rückgängig gemacht werden.`,
  },
  limitedFormat: {
    title: 'Limitiertes Format', introActive: 'Baue einen eigenen Kartenpool für ein Limited-/Draft-Event: wähle erlaubte Sets, erlaube oder verbanne dann einzelne Karten. Dieses Format ist aktiv — Decks zeigen seine Legalität neben der V5-Legalität an.', introInactive: 'Baue einen eigenen Kartenpool für ein Limited-/Draft-Event: wähle erlaubte Sets, erlaube oder verbanne dann einzelne Karten. Momentan leer, wirkt sich also nicht auf Decks aus.', importExportTitle: 'Importieren / Exportieren', exportTxt: 'Exportieren .txt', loadTxt: 'Laden .txt', importText: 'Text importieren…', hideImport: 'Import ausblenden', resetFormat: 'Format zurücksetzen', importPlaceholder: 'Füge ein exportiertes Limited-Format .txt ein', loadFormat: 'Format laden', importError: 'Die Datei konnte nicht gelesen werden — erwartet wurde das von dieser Seite exportierte JSON.', allowedSets: 'Erlaubte Sets', allowedCrypt: 'Erlaubte Kryptakarten', allowedLibrary: 'Erlaubte Bibliothekskarten', bannedCrypt: 'Verbannte Kryptakarten', bannedLibrary: 'Verbannte Bibliothekskarten', none: 'Keine', removeAria: (name) => `${name} entfernen`,
  },
}

const STRINGS: Record<UiLanguage, UiStrings> = { en, es, fr, de }

export function getUiStrings(language: string): UiStrings {
  return STRINGS[resolveUiLanguage(language)]
}

export function useUiStrings(): UiStrings {
  return getUiStrings(useCardLanguage().language)
}
