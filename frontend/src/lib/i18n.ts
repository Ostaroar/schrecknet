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
    precons: string
    rules: string
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
}

const en: UiStrings = {
  nav: {
    cryptSearch: 'crypt search',
    librarySearch: 'library search',
    decks: 'decks',
    precons: 'precons',
    rules: 'rules',
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
      "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission under the Dark Pack agreement. All rights reserved.",
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
      'Portions of the materials are the copyrights and trademarks of Paradox Interactive AB and are used with permission under the Dark Pack agreement. All rights reserved.',
  },
}

const es: UiStrings = {
  nav: {
    cryptSearch: 'buscar cripta',
    librarySearch: 'buscar biblioteca',
    decks: 'mazos',
    precons: 'premontados',
    rules: 'reglas',
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
      'Parte de este material es propiedad y marca registrada de Paradox Interactive AB, y se usa con permiso bajo el acuerdo Dark Pack. Todos los derechos reservados.',
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
      'Parte de este material es propiedad y marca registrada de Paradox Interactive AB y se usa con permiso bajo el acuerdo Dark Pack. Todos los derechos reservados.',
  },
}

const fr: UiStrings = {
  nav: {
    cryptSearch: 'recherche crypte',
    librarySearch: 'recherche bibliothèque',
    decks: 'decks',
    precons: 'préconstruits',
    rules: 'règles',
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
      "Une partie de ce matériel est protégée par le droit d'auteur et les marques de Paradox Interactive AB, et est utilisée avec permission dans le cadre de l'accord Dark Pack. Tous droits réservés.",
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
      "Une partie de ce matériel est protégée par le droit d'auteur et les marques de Paradox Interactive AB, et est utilisée avec permission dans le cadre de l'accord Dark Pack. Tous droits réservés.",
  },
}

const STRINGS: Record<UiLanguage, UiStrings> = { en, es, fr }

export function getUiStrings(language: string): UiStrings {
  return STRINGS[resolveUiLanguage(language)]
}
