import { useCardLanguage } from './cardLanguage'

export type UiLanguage = 'en' | 'es' | 'fr'

export const UI_LANGUAGES: UiLanguage[] = ['en', 'es', 'fr']

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
    rules: string
    changelog: string
    help: string
    about: string
  }
  header: {
    cardTextLabel: string
    cardCounts: (crypt: number, library: number) => string
    v5Only: string
  }
  footer: {
    copyright: string
    disclaimer: string
    help: string
    about: string
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
    adding: string
    removeFromInventory: string
    removing: string
    addedCopies: (count: number) => string
    removedCopies: (count: number) => string
    missingCardsTitle: (total: number, count: number) => string
    exportWantList: string
    missingNote: string
    crypt: string
    library: string
    noCryptOwned: string
    noLibraryOwned: string
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
    rules: 'rules',
    changelog: 'changelog',
    help: 'help',
    about: 'about',
  },
  header: {
    cardTextLabel: 'Card text',
    cardCounts: (crypt, library) => `${crypt} crypt · ${library} library`,
    v5Only: 'V5 only',
  },
  footer: {
    copyright:
      'Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com.',
    disclaimer: 'SchreckNet is unofficial fan content and is not endorsed by or affiliated with Paradox Interactive. It is not official World of Darkness material.',
    help: 'Help',
    about: 'About',
  },
  help: {
    eyebrow: 'Help',
    title: 'Search fast. Build locally. Keep control.',
    findCardsTitle: 'Find cards',
    findCards1: 'Use Crypt or Library search for detailed V5-only filters. Select a result to open its full card page.',
    findCards2: 'Press ⌘K on macOS or Ctrl+K elsewhere to search every card by name.',
    buildDecksTitle: 'Build decks',
    buildDecks1: 'Create a local deck, add cards by name, and adjust quantities with the compact steppers.',
    buildDecks2: 'Import or export text lists, share a deck URL, draw test hands, compare decks, and review V5 legality.',
    offlineTitle: 'Offline data',
    offline1: 'The first visit downloads the V5 card database. Later searches and deck edits use browser-local SQLite.',
    offline2: "Clearing this site's browser storage also removes anonymous local decks, so export important lists.",
    apiTitle: 'Machine API',
    api1: 'MCP Streamable HTTP is served at /mcp; local clients can use schrecknet-server --mcp-stdio.',
    api2: 'Mirrored card REST endpoints live under /api/v1.',
  },
  about: {
    eyebrow: 'About SchreckNet',
    title: 'The V5 card library and deck workbench.',
    lead: 'SchreckNet is a ground-up, offline-first rebuild of VDB focused exclusively on VTES Fifth Edition card research and deck building. Tournament archives, community rankings, and playtest-program features are intentionally outside its scope.',
    travelTitle: 'Built to travel',
    travel1: 'Card search and local decks keep working after the app and V5 database have been cached.',
    travel2: 'Your anonymous decks live in a separate writable SQLite database in this browser.',
    engineTitle: 'One rules engine',
    engine1: 'Rust domain logic runs natively on the server and as WebAssembly in the browser.',
    engine2: 'SQLite is the storage layer on both sides; MCP and REST share the same card services.',
    creditsTitle: 'Credits',
    creditsBuildsOn: 'SchreckNet builds on',
    creditsAnd: 'and card data and rulings from',
    creditsCardData: '. The source code is available under the MIT license.',
    creditsRights:
      'Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. SchreckNet is unofficial fan content and is not endorsed by or affiliated with Paradox Interactive; it is not official World of Darkness material.',
  },
  changelog: {
    eyebrow: 'Changelog',
    title: 'What changed in SchreckNet.',
    lead: 'Product milestones for the V5 card-research and deckbuilding workbench.',
    entries: [
      { date: '2026-07-22', title: 'Search in your language', summary: 'Crypt and Library research controls now follow the selected English, Spanish, or French interface language.', items: ['Localized exact, regex, semantic, set, precon, trait, and sorting controls.', 'Added browser coverage for both search routes in Spanish and French.'] },
      { date: '2026-07-22', title: 'Responsive deckbuilding', summary: 'The complete workbench now fits compact phones without hiding core actions.', items: ['Validated ten primary routes at 320 px and 360 px.', 'Improved touch targets, Inventory layout, and the populated deck editor.'] },
      { date: '2026-07-22', title: 'Local inventory complete', summary: 'Anonymous inventory works offline alongside local decks.', items: ['Added owned-card search filters, missing-card lists, want-list export, and proxy integration.', 'Kept inventory and deck data in the browser-local user database.'] },
      { date: '2026-07-21', title: 'Offline semantic research', summary: 'Concept search is available without sending card text or queries to a remote model.', items: ['Added a checksum-pinned local model and embedded V5 vectors.', 'Kept browser, REST, and MCP result ranking aligned through shared Rust.'] },
    ],
  },
  search: {
    nameText: 'Name / text', semanticPrompt: 'Describe a card concept (English)', all: 'All', any: 'Any', not: 'Not', only: 'Only', name: 'Name', text: 'Text', artist: 'Artist', clear: 'clear', loading: 'Loading card database…', loadError: "Couldn't load the card database", noMatches: 'No cards match those filters.', sort: 'Sort', relevance: 'Relevance', onlyOwned: 'Only owned', onlyInFormat: 'Only in format', traits: 'Traits', allTraitsRequired: 'all selected traits required', set: 'Set', anySet: 'Any set', setAge: 'Set age relation', inSet: 'In set', orNewer: 'Or newer', orOlder: 'Or older', notNewer: 'Not newer', notOlder: 'Not older', printing: 'Printing relation', anyPrinting: 'Any printing', onlyIn: 'Only in', firstPrint: 'First print', reprint: 'Reprint', preconFilters: 'Precon filters', addPrecon: 'Add precon', anyPrecon: 'Any precon / add another…', selectedPrecons: 'Selected precons', removePrecon: (precon, set) => `Remove ${precon} from ${set}`, semantic: 'Semantic', semanticTitle: 'Find cards by English concept using the local offline model', semanticIdle: 'Describe an English card concept. First use downloads about 46 MB (model + runtime); queries stay on this device.', semanticLoading: 'Preparing the local semantic model…', semanticDownloading: 'Downloading local model', semanticReady: 'Local semantic model ready. Results are cosine-ranked; the score is similarity, not a probability.', semanticUnavailable: (error) => `Semantic model unavailable: ${error}`, retry: 'Retry', removeModel: 'Remove local model',
  },
  cryptSearch: {
    anyClan: 'Any clan', anyTitle: 'Any title', nonTitled: 'Non-titled', votes: 'Votes', anyVotes: 'Any votes', noVotes: 'No votes', votesAtLeast: (count) => `${count}+ votes`, group: 'Group', capacity: 'cap', minimum: 'min', maximum: 'max', sect: 'Sect', orDiscipline: '+ OR discipline', choose: 'Choose…', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} crypt cards`, semanticEmpty: 'Describe a concept to search the V5 crypt.', sortCapacityDesc: 'Capacity high–low', sortCapacityAsc: 'Capacity low–high', sortClan: 'Clan', sortGroup: 'Group', sortName: 'Name', sortSect: 'Sect', similarity: 'similarity',
  },
  librarySearch: {
    anyType: 'Any type', anyClanRequirement: 'Any clan requirement', requiresCapacity: 'requires cap', blood: 'blood', pool: 'pool', disciplineLogic: 'Discipline logic', noRequirement: 'No requirement', sect: 'Sect', title: 'Title', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} library cards`, semanticEmpty: 'Describe a concept to search the V5 library.', sortRequirement: 'Clan / discipline', sortCostDesc: 'Cost high–low', sortCostAsc: 'Cost low–high', sortName: 'Name', sortType: 'Type', similarity: 'similarity', requirement: 'requirement', notRequired: 'Not required', titledSpecific: 'Titled (specific)', titledAny: 'Titled (any)', nonTitled: 'Non-titled',
  },
  inventory: {
    title: 'Inventory', counts: (crypt, library) => `${crypt} crypt · ${library} library`, loading: 'Loading inventory…', loadError: "Couldn't load inventory", importExportTitle: 'Text import / export', exportTxt: 'Export .txt', loadTxt: 'Load .txt', importText: 'Import text…', hideImport: 'Hide import', importPlaceholder: 'Paste a card list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Add to inventory', importing: 'Importing…', addedCards: (count) => `Added ${count} card${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Couldn't match: ${names}.`, addRemovePreconTitle: 'Add / remove a precon', preconNote: "Card quantities per precon aren't tracked by the data source, so this adds or removes one copy of each distinct card in the deck's known pool, not a full ready-to-play count.", choosePrecon: 'Choose a precon…', adding: 'Adding…', removeFromInventory: 'Remove from inventory', removing: 'Removing…', addedCopies: (count) => `Added 1 copy each of ${count} cards.`, removedCopies: (count) => `Removed 1 copy each of ${count} cards.`, missingCardsTitle: (total, count) => `Missing cards — ${total} copies across ${count} card${count === 1 ? '' : 's'}`, exportWantList: 'Export want-list .txt', missingNote: 'What every inventory-tracked deck still needs, combined — decks marked "Not in inventory" aren\'t counted.', crypt: 'Crypt', library: 'Library', noCryptOwned: 'No crypt cards owned yet.', noLibraryOwned: 'No library cards owned yet.', removeAria: (name) => `Remove ${name} from inventory`,
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
    rules: 'reglas',
    changelog: 'novedades',
    help: 'ayuda',
    about: 'acerca de',
  },
  header: {
    cardTextLabel: 'Texto de carta',
    cardCounts: (crypt, library) => `${crypt} cripta · ${library} biblioteca`,
    v5Only: 'Solo V5',
  },
  footer: {
    copyright:
      'Parte de este material es propiedad y marca registrada de Paradox Interactive AB, y se usa con permiso. Todos los derechos reservados. Para más información visite worldofdarkness.com.',
    disclaimer:
      'SchreckNet es contenido de fans no oficial y no está avalado ni afiliado a Paradox Interactive. No es material oficial de World of Darkness.',
    help: 'Ayuda',
    about: 'Acerca de',
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
    lead: 'SchreckNet es una reconstrucción de VDB hecha desde cero y sin conexión, centrada exclusivamente en la investigación de cartas y la construcción de mazos de VTES Quinta Edición. Los archivos de torneos, las clasificaciones comunitarias y las funciones del programa de pruebas quedan deliberadamente fuera de su alcance.',
    travelTitle: 'Hecho para viajar',
    travel1: 'La búsqueda de cartas y los mazos locales siguen funcionando después de que la app y la base de datos V5 se hayan guardado en caché.',
    travel2: 'Tus mazos anónimos viven en una base de datos SQLite separada y con permisos de escritura en este navegador.',
    engineTitle: 'Un único motor de reglas',
    engine1: 'La lógica de dominio en Rust se ejecuta de forma nativa en el servidor y como WebAssembly en el navegador.',
    engine2: 'SQLite es la capa de almacenamiento en ambos lados; MCP y REST comparten los mismos servicios de cartas.',
    creditsTitle: 'Créditos',
    creditsBuildsOn: 'SchreckNet se basa en',
    creditsAnd: 'y en los datos de cartas y erratas de',
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
  inventory: {
    title: 'Inventario', counts: (crypt, library) => `${crypt} cripta · ${library} biblioteca`, loading: 'Cargando inventario…', loadError: 'No se pudo cargar el inventario', importExportTitle: 'Importar / exportar texto', exportTxt: 'Exportar .txt', loadTxt: 'Cargar .txt', importText: 'Importar texto…', hideImport: 'Ocultar importación', importPlaceholder: 'Pega una lista de cartas, p. ej.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Añadir al inventario', importing: 'Importando…', addedCards: (count) => `${count} carta${count === 1 ? '' : 's'} añadida${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `No se pudo encontrar: ${names}.`, addRemovePreconTitle: 'Añadir / quitar un premontado', preconNote: 'Las cantidades por premontado no están registradas en la fuente de datos, así que esto añade o quita una copia de cada carta distinta del mazo conocido, no un recuento listo para jugar.', choosePrecon: 'Elegir un premontado…', adding: 'Añadiendo…', removeFromInventory: 'Quitar del inventario', removing: 'Quitando…', addedCopies: (count) => `Añadida 1 copia de cada una de ${count} cartas.`, removedCopies: (count) => `Quitada 1 copia de cada una de ${count} cartas.`, missingCardsTitle: (total, count) => `Cartas que faltan — ${total} copias en ${count} carta${count === 1 ? '' : 's'}`, exportWantList: 'Exportar lista de deseos .txt', missingNote: 'Lo que necesita en total cada mazo con seguimiento de inventario — los mazos marcados "No en inventario" no cuentan.', crypt: 'Cripta', library: 'Biblioteca', noCryptOwned: 'Aún no posees cartas de cripta.', noLibraryOwned: 'Aún no posees cartas de biblioteca.', removeAria: (name) => `Quitar ${name} del inventario`,
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
    rules: 'règles',
    changelog: 'nouveautés',
    help: 'aide',
    about: 'à propos',
  },
  header: {
    cardTextLabel: 'Texte de carte',
    cardCounts: (crypt, library) => `${crypt} crypte · ${library} bibliothèque`,
    v5Only: 'V5 uniquement',
  },
  footer: {
    copyright:
      "Une partie de ce matériel est protégée par le droit d'auteur et les marques de Paradox Interactive AB, et est utilisée avec permission. Tous droits réservés. Pour plus d'informations, visitez worldofdarkness.com.",
    disclaimer:
      "SchreckNet est un contenu de fans non officiel, non approuvé par et sans affiliation avec Paradox Interactive. Ce n'est pas du matériel officiel World of Darkness.",
    help: 'Aide',
    about: 'À propos',
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
    lead: "SchreckNet est une reconstruction de VDB entièrement repensée et hors ligne, dédiée exclusivement à la recherche de cartes et à la construction de decks pour VTES Cinquième Édition. Les archives de tournois, classements communautaires et fonctionnalités du programme de playtest sont volontairement hors de son périmètre.",
    travelTitle: 'Conçu pour voyager',
    travel1: "La recherche de cartes et les decks locaux continuent de fonctionner une fois l'application et la base V5 mises en cache.",
    travel2: 'Vos decks anonymes vivent dans une base SQLite distincte, accessible en écriture, dans ce navigateur.',
    engineTitle: 'Un seul moteur de règles',
    engine1: 'La logique métier en Rust tourne nativement sur le serveur et en WebAssembly dans le navigateur.',
    engine2: 'SQLite est la couche de stockage des deux côtés ; MCP et REST partagent les mêmes services de cartes.',
    creditsTitle: 'Crédits',
    creditsBuildsOn: 'SchreckNet s\'appuie sur',
    creditsAnd: 'ainsi que sur les données de cartes et erratas de',
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
  inventory: {
    title: 'Inventaire', counts: (crypt, library) => `${crypt} crypte · ${library} bibliothèque`, loading: "Chargement de l'inventaire…", loadError: "Impossible de charger l'inventaire", importExportTitle: 'Import / export texte', exportTxt: 'Exporter .txt', loadTxt: 'Charger .txt', importText: 'Importer texte…', hideImport: "Masquer l'import", importPlaceholder: 'Collez une liste de cartes, p. ex.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: "Ajouter à l'inventaire", importing: 'Importation…', addedCards: (count) => `${count} carte${count === 1 ? '' : 's'} ajoutée${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Introuvable : ${names}.`, addRemovePreconTitle: 'Ajouter / retirer un préconstruit', preconNote: "Les quantités par préconstruit ne sont pas suivies par la source de données ; ceci ajoute ou retire une copie de chaque carte distincte du pool connu du deck, pas un décompte prêt à jouer.", choosePrecon: 'Choisir un préconstruit…', adding: 'Ajout…', removeFromInventory: "Retirer de l'inventaire", removing: 'Retrait…', addedCopies: (count) => `1 copie de chacune de ${count} cartes ajoutée.`, removedCopies: (count) => `1 copie de chacune de ${count} cartes retirée.`, missingCardsTitle: (total, count) => `Cartes manquantes — ${total} copies sur ${count} carte${count === 1 ? '' : 's'}`, exportWantList: 'Exporter la liste de souhaits .txt', missingNote: 'Ce dont chaque deck suivi par l\'inventaire a encore besoin, combiné — les decks marqués « Pas dans l\'inventaire » ne comptent pas.', crypt: 'Crypte', library: 'Bibliothèque', noCryptOwned: 'Aucune carte de crypte possédée pour le moment.', noLibraryOwned: 'Aucune carte de bibliothèque possédée pour le moment.', removeAria: (name) => `Retirer ${name} de l'inventaire`,
  },
}

const STRINGS: Record<UiLanguage, UiStrings> = { en, es, fr }

export function getUiStrings(language: string): UiStrings {
  return STRINGS[resolveUiLanguage(language)]
}

export function useUiStrings(): UiStrings {
  return getUiStrings(useCardLanguage().language)
}
