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
    twda: string
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
    routeLoading: string
  }
  footer: {
    copyright: string
    disclaimer: string
    help: string
    about: string
    legal: string
    support: string
    settings: string
    account: string
  }
  settings: {
    title: string
    intro: string
    yourDataTitle: string
    yourDataNote: string
    counts: (decks: number, cards: number, precons: number) => string
    downloadBackup: string
    creating: string
    backupCreated: (name: string) => string
    restoreTitle: string
    restoreNote: string
    chooseFile: string
    restoring: string
    restoreConfirm: (
      currentDecks: number,
      currentCards: number,
      backupDecks: number,
      backupCards: number,
    ) => string
    restoreDone: string
    restoreFailed: (error: string) => string
    sensitiveNote: string
    lastBackup: (when: string) => string
    neverBackedUp: string
    reminder: string
    storageTitle: string
    storagePersisted: string
    storageNotPersisted: string
    enablePersistence: string
    storageUsage: (used: string, quota: string) => string
    cardDataTitle: string
    cardDataNote: string
    cardDataVersion: (version: string) => string
    refreshCardData: string
    refreshing: string
    refreshDone: string
  }
  account: {
    title: string
    signedOutIntro: string
    whatItsFor: string
    passkeyNote: string
    displayNameLabel: string
    displayNamePlaceholder: string
    registerButton: string
    registering: string
    loginButton: string
    loggingIn: string
    switchToLogin: string
    switchToRegister: string
    recoveryInstead: string
    recoveryCodeLabel: string
    recoverButton: string
    recovering: string
    backToLogin: string
    signedInAs: (name: string) => string
    memberSince: (date: string) => string
    logout: string
    loggingOut: string
    dataSafetyTitle: string
    dataSafetyPasskey: string
    dataSafetySession: string
    dataSafetyDecks: string
    passkeyManagerNote: string
    passkeysTitle: string
    passkeysNote: string
    loadingPasskeys: string
    addPasskeyButton: string
    addingPasskey: string
    lastPasskeyBadge: string
    unnamedPasskey: string
    renamePasskey: string
    removePasskey: string
    removing: string
    nicknamePrompt: string
    recoveryCodeTitle: string
    recoveryCodeIntro: string
    recoveryCodeSavedConfirm: string
    recoveryCodeContinue: string
    newRecoveryCodeTitle: string
    newRecoveryCodeIntro: string
    unsupportedBrowser: string
    error: (message: string) => string
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
    clanLabel: string
    anyClan: string
    titleLabel: string
    anyTitle: string
    nonTitled: string
    votes: string
    anyVotes: string
    noVotes: string
    votesAtLeast: (count: number) => string
    group: string
    groupsAria: string
    sortAria: string
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
    capacityRequirementAria: string
    capacityRequirementComparisonAria: string
    blood: string
    bloodCostAria: string
    bloodCostComparisonAria: string
    pool: string
    poolCostAria: string
    poolCostComparisonAria: string
    sortAria: string
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
    writePassphraseOptional: string; confirmPassphrase: string; passphraseTooShort: string
    passphrasesDiffer: string; editingLocked: string; editingLockedHelp: string
    writePassphrase: string; unlockEditing: string; editingUnlocked: string
    wrongPassphrase: string
  }
  inventory: {
    title: string
    counts: (crypt: number, library: number) => string
    loading: string
    loadError: string
    decreaseQty: string
    increaseQty: string
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
    noOwnedPrecons: string
    missingCardsTitle: (total: number, count: number) => string
    exportWantList: string
    missingNote: string
    crypt: string
    library: string
    noCryptOwned: string
    noLibraryOwned: string
    removeAria: (name: string) => string
    youOwn: (qty: number) => string
    ownedBadge: (qty: number) => string
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
    ownedOverview: (copies: number, distinct: number) => string
    ownedOverviewNote: string
    ownedCopies: (count: number) => string
    notOwned: string
  }
  twda: {
    title: string
    intro: string
    playerLabel: string
    cardLabel: string
    dateFromLabel: string
    dateToLabel: string
    search: string
    loading: string
    loadError: (error: string) => string
    none: string
    resultsCount: (count: number) => string
    backToSearch: string
    playersCount: (count: number) => string
    cryptCount: (count: number) => string
    libraryCount: (count: number) => string
    notFound: string
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
  deckEditor: {
    decreaseQty: string
    increaseQty: string
    inventoryModeLabel: string
    inventoryModeAria: string
    modeExcluded: string
    modeExcludedHint: string
    modeFlexible: string
    modeFlexibleHint: string
    modeFixed: string
    modeFixedHint: string
    missingBadge: (count: number) => string
    fixedHint: string
    flexibleHint: string
    fixedLabel: string
    flexibleLabel: string
    importExportTitle: string
    exportTxt: string
    copied: string
    couldNotCopy: string
    copyText: string
    loadTxt: string
    hideImport: string
    importText: string
    importPlaceholder: string
    importing: string
    importIntoDeck: string
    addedCards: (count: number) => string
    couldNotMatch: (names: string) => string
    drawErrorFallback: string
    testHand: string
    drawCrypt: string
    drawLibrary: string
    capAbbrev: (capacity: number | null) => string
    archetypeScan: string
    tagged: string
    addTagButton: string
    removeTagAria: (name: string) => string
    addTagPlaceholder: string
    addButton: string
    loadingDeck: string
    loadError: (error: string) => string
    noDeckWithId: (id: number) => string
    backToDecks: string
    backArrow: string
    linkCopied: string
    share: string
    clone: string
    review: string
    printProxies: string
    confirmDeleteDeck: (name: string) => string
    deleteDeck: string
    authorPlaceholder: string
    descriptionPlaceholder: string
    cryptWord: string
    libraryWord: string
    capacityWord: string
    avgWord: string
    v5Legal: string
    limitedFormatLegal: string
    limitedViolationsText: (count: number, names: string) => string
    libraryTypes: string
    disciplinesLabel: string
    bloodCostCurve: string
    poolCostCurve: string
    copiesMissing: (count: number) => string
    allCopiesCovered: string
    cryptHeader: string
    sortLabel: string
    sortOptionCapacity: string
    sortOptionClan: string
    sortOptionGroup: string
    sortOptionName: string
    sortOptionQuantity: string
    noCryptCards: string
    libraryHeader: string
    noLibraryCards: string
  }
  deckReview: {
    loadError: (error: string) => string
    loading: string
    backToEdit: string
    title: string
    byAuthor: (author: string) => string
    crypt: string
    library: string
    capacity: string
    average: (value: string) => string
    legality: string
    noViolations: string
    libraryComposition: string
    disciplineFootprint: string
    bloodCostCurve: string
    poolCostCurve: string
    timingWindows: string
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
  rules: {
    subLoopEntry: string
    close: string
    summarizedNote: string
    unavailable: string
    opening: string
    eyebrow: string
    heading: string
    intro: string
    complexityLabel: string
    complexityBasicHint: string
    complexityAdvancedHint: string
    basic: string
    advancedJudge: string
    impulseOrder: string
    turnPhasesAria: string
    phaseOf: (index: number, total: number) => string
    previous: string
    next: string
    continueInto: string
    source: string
  }
  deckDiff: {
    title: string
    backToDecks: string
    needTwoDecks: string
    deckA: string
    deckB: string
    identical: string
    changedCount: (count: number) => string
    quantityChanged: string
    onlyInA: string
    onlyInB: string
    unchanged: string
  }
  sharedDeck: {
    invalidLink: (error: string) => string
    backToDecks: string
    loading: string
    title: string
    namePlaceholder: string
    saveAsNewDeck: string
    emptyDeck: string
    crypt: string
    library: string
    none: string
  }
  proxy: {
    backToDeck: string
    print: string
    onlyMissing: string
    caption: (count: number) => string
    empty: string
  }
  badges: {
    outOfFormat: string
    outOfFormatTooltip: string
    rulingsHeading: string
    printingsHeading: string
    sourceFallback: string
    noRuleDetail: string
    previewCardImage: string
    previewImageFor: (name: string) => string
    cardImageAlt: (name: string) => string
  }
  cardDetail: {
    loading: string
    loadError: (error: string) => string
    notFound: (id: number) => string
    backToSearch: string
    backToKindSearch: (kind: string) => string
    englishName: (name: string) => string
    groupSuffix: (group: number) => string
    requiresClan: (clan: string) => string
    requires: string
    bloodSuffix: (cost: string) => string
    poolSuffix: (cost: string) => string
    noTranslation: (lang: string) => string
    cardTextLanguage: (lang: string) => string
    artistsLabel: (count: number, names: string) => string
    availableCardText: (langs: string) => string
    printingsInline: string
    fullPageLink: string
  }
  commandPalette: {
    searchPlaceholder: string
    noResults: (query: string) => string
  }
  searchDeckPanel: {
    panelAria: string
    activeDeck: string
    noLocalDecks: string
    hideDeck: string
    showDeck: string
    loadingDecks: string
    updateError: (error: string) => string
    tryAgain: string
    createDeckPrompt: string
    goToDecks: string
    summary: (crypt: number, library: number, total: number) => string
    crypt: string
    library: string
    groupAria: (label: string) => string
    emptyGroup: (label: string) => string
    savingChanges: string
    addAnother: (cardName: string, deckName: string, qty: number) => string
    addToDeck: (cardName: string, deckName: string) => string
    selectDeckFirst: (cardName: string) => string
    removeOneCopy: (cardName: string) => string
    copiesAria: (qty: number) => string
    addOneCopy: (cardName: string) => string
  }
  cardTiming: {
    heading: string
    fullReference: string
  }
  gameLoopWidgets: {
    breadcrumbAria: string
    actionResolution: string
    visibleNodes: (count: number) => string
    flowAria: (label: string) => string
    advanced: string
    nextPathsAria: string
    openBranch: (label: string) => string
    stateKindDecision: string
    stateKindNote: string
    stateKindWindow: string
    stateKindStep: string
    impulsePriorityOrderLabel: string
    priorityWindow: string
    whoPassesNext: string
    impulseIntro: string
    contextAria: string
    seatActing: string
    seatDefender: string
    seatTargeted: string
    seatPasses: string
    seatPrey: string
    seatPredator: string
    positionActing: string
    stepOf: (step: number, total: number) => string
    seatSuffix: (seat: number) => string
    firstPriority: string
    passOrderNote: string
    pause: string
    animate: string
  }
  gameLoopHooks: {
    HK_UNLOCK: string
    HK_MASTER: string
    HK_INFLUENCE: string
    HK_DISCARD: string
    HK_ASANN: string
    HK_AMOD: string
    HK_REACT: string
    HK_BLOCK: string
    HK_REF: string
    HK_BLEED: string
    HK_CMB_RANGE: string
    HK_CMB_STRIKE: string
    HK_CMB_PRESS: string
    HK_CMB_END: string
    HK_OOT: string
    HK_INPLAY: string
    HK_ASPLAYED: string
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
    twda: 'twd',
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
    routeLoading: 'Loading…',
  },
  footer: {
    copyright:
      'Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com.',
    disclaimer: 'SchreckNet is unofficial fan content and is not endorsed by or affiliated with Paradox Interactive. It is not official World of Darkness material.',
    help: 'Help',
    about: 'About',
    legal: 'Legal notice',
    support: 'Support this project',
    settings: 'Data & backup',
    account: 'Account',
  },
  account: {
    title: 'Account',
    signedOutIntro: 'Optional. SchreckNet works fully with zero account — this is only for whoever wants their decks to follow them across devices.',
    whatItsFor: 'An account does one thing: it lets your decks and inventory sync to another device. Everything else keeps working exactly the same without one.',
    passkeyNote: 'No password, no email. Sign in with a passkey — the same technology behind "sign in with Face ID/fingerprint" — stored by your device or password manager (1Password, Bitwarden, iCloud Keychain, Google Password Manager all work, entirely your choice).',
    displayNameLabel: 'Display name',
    displayNamePlaceholder: 'How you’ll be identified — this is also your login name',
    registerButton: 'Create account',
    registering: 'Creating…',
    loginButton: 'Sign in with passkey',
    loggingIn: 'Signing in…',
    switchToLogin: 'Already have an account? Sign in',
    switchToRegister: "Don't have an account? Create one",
    recoveryInstead: 'Lost every passkey? Use your recovery code',
    recoveryCodeLabel: 'Recovery code',
    recoverButton: 'Recover account',
    recovering: 'Recovering…',
    backToLogin: '← Back to sign in',
    signedInAs: (name) => `Signed in as ${name}`,
    memberSince: (date) => `Member since ${date}`,
    logout: 'Sign out',
    loggingOut: 'Signing out…',
    dataSafetyTitle: 'What survives clearing browser data?',
    dataSafetyPasskey: 'Your passkey — it lives in your device or password manager, not in this site’s storage. Unaffected.',
    dataSafetySession: 'Your sign-in — you’ll be signed out. Just sign in again.',
    dataSafetyDecks: 'Your local decks and inventory — destroyed, exactly as without an account. Keep a backup from Data & backup.',
    passkeyManagerNote: 'The single best safeguard: add a second passkey on another device before you need it.',
    passkeysTitle: 'Your passkeys',
    passkeysNote: 'One row per device or password manager that can sign you in. Add another before you lose access to this one.',
    loadingPasskeys: 'Loading passkeys…',
    addPasskeyButton: 'Add a passkey',
    addingPasskey: 'Adding…',
    lastPasskeyBadge: 'only passkey',
    unnamedPasskey: 'Unnamed passkey',
    renamePasskey: 'Rename',
    removePasskey: 'Remove',
    removing: 'Removing…',
    nicknamePrompt: 'Label this passkey (e.g. "iPhone", "work laptop")',
    recoveryCodeTitle: 'Save your recovery code',
    recoveryCodeIntro: 'This is the only way back into your account if you lose every passkey. It is shown once and never recoverable — save it somewhere safe, like a password manager.',
    recoveryCodeSavedConfirm: "I've saved my recovery code",
    recoveryCodeContinue: 'Continue',
    newRecoveryCodeTitle: 'Your recovery code has changed',
    newRecoveryCodeIntro: 'Redeeming a recovery code retires it. Here is your new one — save it the same way.',
    unsupportedBrowser: 'This browser does not support passkeys, so accounts are unavailable here. Everything else on SchreckNet still works.',
    error: (message) => `Something went wrong: ${message}`,
  },
  settings: {
    title: 'Data & backup',
    intro: 'Your decks and inventory are stored only in this browser. Nothing is uploaded, which also means nothing is recovered for you — so keep a backup.',
    yourDataTitle: 'Your data',
    yourDataNote: 'A backup contains everything: decks with their tags, descriptions and inventory modes, your loose card quantities, and your owned precons.',
    counts: (decks, cards, precons) => `${decks} deck${decks === 1 ? '' : 's'} · ${cards} inventory card${cards === 1 ? '' : 's'} · ${precons} owned precon${precons === 1 ? '' : 's'}`,
    downloadBackup: 'Download backup',
    creating: 'Creating backup…',
    backupCreated: (name) => `Saved ${name}`,
    restoreTitle: 'Restore a backup',
    restoreNote: 'Restoring replaces everything currently in this browser with the contents of the backup file. This cannot be undone, so a backup of your current data is downloaded first.',
    chooseFile: 'Choose backup file…',
    restoring: 'Restoring…',
    restoreConfirm: (currentDecks, currentCards, backupDecks, backupCards) =>
      `Replace your current data (${currentDecks} decks, ${currentCards} inventory cards) with the backup (${backupDecks} decks, ${backupCards} inventory cards)? This cannot be undone.`,
    restoreDone: 'Backup restored.',
    restoreFailed: (error) => `Could not restore: ${error}`,
    sensitiveNote: 'The backup file also contains your game-group codes and passphrases — treat it like a password.',
    lastBackup: (when) => `Last backup: ${when}`,
    neverBackedUp: 'You have never made a backup.',
    reminder: 'Your decks and inventory exist only in this browser. Download a backup so clearing site data cannot lose them.',
    storageTitle: 'Browser storage',
    storagePersisted: 'This browser has been asked to keep your data and agreed — it will not be evicted automatically.',
    storageNotPersisted: 'Your data is stored "best effort": the browser may discard it when storage runs low.',
    enablePersistence: 'Ask the browser to keep my data',
    storageUsage: (used, quota) => `Using ${used} of about ${quota} available`,
    cardDataTitle: 'Card data',
    cardDataNote: 'The card database is downloaded from the server and refreshes itself when a new version is published. Reloading it never touches your decks or inventory.',
    cardDataVersion: (version) => `Loaded card data version ${version}`,
    refreshCardData: 'Reload card data',
    refreshing: 'Reloading…',
    refreshDone: 'Card data reloaded.',
  },
  help: staticPagesEn.help,
  about: staticPagesEn.about,
  changelog: staticPagesEn.changelog,
  search: {
    nameText: 'Name / text', semanticPrompt: 'Describe a card concept (English)', all: 'All', any: 'Any', not: 'Not', only: 'Only', name: 'Name', text: 'Text', artist: 'Artist', clear: 'clear', loading: 'Loading card database…', loadError: "Couldn't load the card database", noMatches: 'No cards match those filters.', sort: 'Sort', relevance: 'Relevance', onlyOwned: 'Only owned', onlyInFormat: 'Only in format', traits: 'Traits', allTraitsRequired: 'all selected traits required', set: 'Set', anySet: 'Any set', setAge: 'Set age relation', inSet: 'In set', orNewer: 'Or newer', orOlder: 'Or older', notNewer: 'Not newer', notOlder: 'Not older', printing: 'Printing relation', anyPrinting: 'Any printing', onlyIn: 'Only in', firstPrint: 'First print', reprint: 'Reprint', preconFilters: 'Precon filters', addPrecon: 'Add precon', anyPrecon: 'Any precon / add another…', selectedPrecons: 'Selected precons', removePrecon: (precon, set) => `Remove ${precon} from ${set}`, semantic: 'Semantic', semanticTitle: 'Find cards by English concept using the local offline model', semanticIdle: 'Describe an English card concept. First use downloads about 46 MB (model + runtime); queries stay on this device.', semanticLoading: 'Preparing the local semantic model…', semanticDownloading: 'Downloading local model', semanticReady: 'Local semantic model ready. Results are cosine-ranked; the score is similarity, not a probability.', semanticUnavailable: (error) => `Semantic model unavailable: ${error}`, retry: 'Retry', removeModel: 'Remove local model',
  },
  cryptSearch: {
    clanLabel: 'Clan', anyClan: 'Any clan', titleLabel: 'Title', anyTitle: 'Any title', nonTitled: 'Non-titled', votes: 'Votes', anyVotes: 'Any votes', noVotes: 'No votes', votesAtLeast: (count) => `${count}+ votes`, group: 'Group', groupsAria: 'Crypt groups', sortAria: 'Sort crypt results', capacity: 'cap', minimum: 'min', maximum: 'max', sect: 'Sect', orDiscipline: '+ OR discipline', choose: 'Choose…', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} crypt cards`, semanticEmpty: 'Describe a concept to search the V5 crypt.', sortCapacityDesc: 'Capacity high–low', sortCapacityAsc: 'Capacity low–high', sortClan: 'Clan', sortGroup: 'Group', sortName: 'Name', sortSect: 'Sect', similarity: 'similarity',
  },
  librarySearch: {
    anyType: 'Any type', anyClanRequirement: 'Any clan / path requirement', requiresCapacity: 'requires cap', capacityRequirementAria: 'Capacity requirement', capacityRequirementComparisonAria: 'Capacity requirement comparison', blood: 'blood', bloodCostAria: 'Blood cost', bloodCostComparisonAria: 'Blood cost comparison', pool: 'pool', poolCostAria: 'Pool cost', poolCostComparisonAria: 'Pool cost comparison', sortAria: 'Sort library results', disciplineLogic: 'Discipline logic', noRequirement: 'No requirement', sect: 'Sect', title: 'Title', results: (count, semantic) => `${count}${semantic ? ' semantic' : ''} library cards`, semanticEmpty: 'Describe a concept to search the V5 library.', sortRequirement: 'Clan / path / discipline', sortCostDesc: 'Cost high–low', sortCostAsc: 'Cost low–high', sortName: 'Name', sortType: 'Type', similarity: 'similarity', requirement: 'requirement', notRequired: 'Not required', titledSpecific: 'Titled (specific)', titledAny: 'Titled (any)', nonTitled: 'Non-titled',
  },
  table: {
    title: 'Table', intro: 'Track games with your private playgroup and keep a shared leaderboard — no account needed. Group data is accessible only with its share code.', cancel: 'Cancel', joinAnother: '+ Join another', groupMissing: "That group code doesn't exist anymore.", noGroup: 'No group has that code.', confirmLeave: (name) => `Leave ${name}? You can rejoin later with its code.`, thisGroup: 'this group', createGroup: 'Create a group', groupExample: 'e.g. Thursday Night Coterie', create: 'Create', joinGroup: 'Join a group', groupCode: 'Group code', join: 'Join', shareCode: 'Share this private code with your group:', copied: 'Copied!', leaveGroup: 'Leave group', loading: 'Loading…', leaderboard: 'Leaderboard', noGamesFirst: 'No games logged yet — log your first game below.', player: 'Player', games: 'Games', totalVp: 'Total VP', avgVp: 'Avg VP', wins: 'Wins', winRate: 'Win rate', logGame: 'Log game', editGame: 'Edit game', datePlayed: 'Date played', notes: 'Notes (optional)', seat: (number) => `Seat ${number}`, playerName: 'Player name', deckOptional: 'Deck (optional)', archetype: 'Archetype', anyArchetype: 'Archetype (optional)', removeRow: (number) => `Remove player row ${number}`, addPlayer: '+ Add player', addOnePlayer: 'Add at least one player.', invalidVp: (name) => `${name}: VP must be a non-negative number.`, saveChanges: 'Save changes', archetypePerformance: 'Archetype performance', recentGames: 'Recent games', exportCsv: 'Export CSV', exportText: 'Export text', edit: 'Edit', delete: 'Delete', deleting: 'Deleting…', deleteAria: (date) => `Delete the ${date} game`, confirmDelete: (date, players) => `Delete the ${date} game (${players})? This permanently removes it from the leaderboard.`, alreadyDeleted: 'That game was already deleted.', noGames: 'No games logged yet.', predator: (name) => `Predator: ${name}`, prey: (name) => `Prey: ${name}`, writePassphraseOptional: 'Write passphrase (optional, 8+ characters)', confirmPassphrase: 'Confirm write passphrase', passphraseTooShort: 'The write passphrase needs at least 8 characters.', passphrasesDiffer: 'The passphrases do not match.', editingLocked: 'Editing locked', editingLockedHelp: 'Anyone with the group code can read. Enter the write passphrase to add, edit, or delete games.', writePassphrase: 'Write passphrase', unlockEditing: 'Unlock editing', editingUnlocked: 'Editing is unlocked for this browser session.', wrongPassphrase: 'The write passphrase is incorrect.',
  },
  inventory: {
    title: 'Inventory', counts: (crypt, library) => `${crypt} crypt · ${library} library`, loading: 'Loading inventory…', loadError: "Couldn't load inventory", decreaseQty: 'Decrease quantity', increaseQty: 'Increase quantity', importExportTitle: 'Text import / export', exportTxt: 'Export .txt', loadTxt: 'Load .txt', importText: 'Import text…', hideImport: 'Hide import', importPlaceholder: 'Paste a card list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: 'Add to inventory', importing: 'Importing…', addedCards: (count) => `Added ${count} card${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Couldn't match: ${names}.`, addRemovePreconTitle: 'Add / remove a precon', preconNote: "Enter how many copies of this precon you own — each card is adjusted by its own real per-precon copy count (some precons include more than one of a given card), not a flat amount.", choosePrecon: 'Choose a precon…', preconQuantityLabel: 'Precons', adding: 'Adding…', removeFromInventory: 'Remove from inventory', removing: 'Removing…', addedCopies: (precons, count) => `Added ${precons} precon${precons === 1 ? '' : 's'} (${count} distinct cards, using each card's real per-precon copy count).`, removedCopies: (precons, count) => `Removed ${precons} precon${precons === 1 ? '' : 's'} (${count} distinct cards, using each card's real per-precon copy count).`, noOwnedPrecons: 'None of this precon is recorded as owned.', missingCardsTitle: (total, count) => `Missing cards — ${total} copies across ${count} card${count === 1 ? '' : 's'}`, exportWantList: 'Export want-list .txt', missingNote: 'What every inventory-tracked deck still needs, combined — decks marked "Not in inventory" aren\'t counted.', crypt: 'Crypt', library: 'Library', noCryptOwned: 'No crypt cards owned yet.', noLibraryOwned: 'No library cards owned yet.', removeAria: (name) => `Remove ${name} from inventory`, youOwn: (qty) => `You own ${qty}`, ownedBadge: (qty) => `Owned ${qty}`,
  },
  addCardBox: {
    placeholderCrypt: 'Add crypt card by name…', placeholderLibrary: 'Add library card by name…',
  },
  precons: {
    title: 'Precon decks', intro: 'Official preconstructed decks from the modern BCP/V5 product line, grouped by set.', cardCountNote: 'Ready-to-play decklist with the real number of copies printed in one precon.', loading: 'Loading precons…', loadError: (error) => `Couldn't load precons: ${error}`, backToPrecons: '← Precons', cardsSuffix: (count) => `${count} distinct cards`, cryptCount: (count) => `Crypt · ${count}`, libraryCount: (count) => `Library · ${count}`, none: 'None', ownedOverview: (copies, distinct) => `${copies} precon${copies === 1 ? '' : 's'} owned · ${distinct} different`, ownedOverviewNote: 'Counts products added through Inventory; loose cards are not miscounted as physical precons.', ownedCopies: (count) => `${count} owned`, notOwned: 'not owned',
  },
  twda: {
    title: 'Tournament-winning decks', intro: 'Confirmed-V5 tournament winners, sourced from the TWDA — every card in every deck shown here has been checked against the V5 pool.', playerLabel: 'Player', cardLabel: 'Card', dateFromLabel: 'From', dateToLabel: 'To', search: 'Search', loading: 'Loading…', loadError: (error) => `Couldn't load decks: ${error}`, none: 'No decks match those filters.', resultsCount: (count) => `${count} deck${count === 1 ? '' : 's'}`, backToSearch: '← Tournament decks', playersCount: (count) => `${count} players`, cryptCount: (count) => `Crypt · ${count}`, libraryCount: (count) => `Library · ${count}`, notFound: 'Deck not found.',
  },
  decks: {
    newDeckPlaceholder: 'New deck name', createDeck: 'Create deck', compareTwoDecks: 'Compare two decks →', loading: 'Loading decks…', loadError: (error) => `Couldn't load your decks: ${error}`, noDecks: 'No decks yet — decks are stored locally in this browser (no account needed).', ownsCopies: 'Owns copies', sharesCopies: 'Shares copies', missingSuffix: (count) => `${count} missing`, byAuthor: (author) => `by ${author}`, clone: 'Clone', delete: 'Delete', confirmDelete: (name) => `Delete "${name}"? This can't be undone.`,
  },
  deckEditor: {
    decreaseQty: 'Decrease quantity', increaseQty: 'Increase quantity', inventoryModeLabel: 'Inventory', inventoryModeAria: 'Inventory mode', modeExcluded: 'Not in inventory', modeExcludedHint: "This deck's cards don't affect missing-copy counts.", modeFlexible: 'Shares copies', modeFlexibleHint: 'Claims copies from a shared pool — other flexible decks can use the same copies.', modeFixed: 'Owns copies', modeFixedHint: 'Claims copies exclusively — no other deck can count on them.', missingBadge: (count) => `${count} missing`, fixedHint: 'Fixed here — claims these copies exclusively. Click to share instead.', flexibleHint: 'Flexible here — shares copies with other decks. Click to claim exclusively.', fixedLabel: 'Fixed', flexibleLabel: 'Flexible', importExportTitle: 'Text import / export', exportTxt: 'Export .txt', copied: 'Copied!', couldNotCopy: "Couldn't copy", copyText: 'Copy text', loadTxt: 'Load .txt', hideImport: 'Hide import', importText: 'Import text…', importPlaceholder: 'Paste a deck list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', importing: 'Importing…', importIntoDeck: 'Import into this deck', addedCards: (count) => `Added ${count} card${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Couldn't match: ${names}.`, drawErrorFallback: 'Could not draw a test hand', testHand: 'Test hand', drawCrypt: 'Draw crypt', drawLibrary: 'Draw library', capAbbrev: (capacity) => `cap ${capacity}`, archetypeScan: 'Archetype scan', tagged: 'Tagged', addTagButton: '+ tag', removeTagAria: (name) => `Remove tag ${name}`, addTagPlaceholder: 'Add tag…', addButton: 'Add', loadingDeck: 'Loading deck…', loadError: (error) => `Couldn't load deck: ${error}`, noDeckWithId: (id) => `No deck with id ${id}.`, backToDecks: 'Back to decks', backArrow: '← decks', linkCopied: 'Link copied!', share: 'Share', clone: 'Clone', review: 'Review', printProxies: 'Print proxies', confirmDeleteDeck: (name) => `Delete "${name}"? This can't be undone.`, deleteDeck: 'Delete deck', authorPlaceholder: 'Author', descriptionPlaceholder: 'Deck description, strategy, or notes…', cryptWord: 'crypt', libraryWord: 'library', capacityWord: 'capacity', avgWord: 'avg', v5Legal: 'V5 Legal', limitedFormatLegal: 'Limited Format Legal', limitedViolationsText: (count, names) => `${count} card${count === 1 ? '' : 's'} not in the active limited format: ${names}`, libraryTypes: 'Library types', disciplinesLabel: 'Disciplines', bloodCostCurve: 'Blood cost curve', poolCostCurve: 'Pool cost curve', copiesMissing: (count) => `${count} copies missing`, allCopiesCovered: 'All copies covered by inventory', cryptHeader: 'Crypt', sortLabel: 'Sort', sortOptionCapacity: 'Capacity', sortOptionClan: 'Clan', sortOptionGroup: 'Group', sortOptionName: 'Name', sortOptionQuantity: 'Quantity', noCryptCards: 'No crypt cards yet.', libraryHeader: 'Library', noLibraryCards: 'No library cards yet.',
  },
  deckReview: {
    loadError: (error) => `Couldn't review deck: ${error}`, loading: 'Loading deck review…', backToEdit: '← edit deck', title: 'Deck review', byAuthor: (author) => `by ${author}`, crypt: 'Crypt', library: 'Library', capacity: 'Capacity', average: (value) => `average ${value}`, legality: 'V5 legality', noViolations: 'No base-format violations found.', libraryComposition: 'Library composition', disciplineFootprint: 'Discipline footprint', bloodCostCurve: 'Blood-cost curve', poolCostCurve: 'Pool-cost curve', timingWindows: 'Timing windows',
  },
  limitedFormat: {
    title: 'Limited format', introActive: 'Build a custom card pool for a limited/draft event: pick allowed sets, then allow or ban individual cards on top. This format is active — decks show its legality alongside V5 legality.', introInactive: 'Build a custom card pool for a limited/draft event: pick allowed sets, then allow or ban individual cards on top. Empty for now, so it has no effect on decks.', importExportTitle: 'Import / export', exportTxt: 'Export .txt', loadTxt: 'Load .txt', importText: 'Import text…', hideImport: 'Hide import', resetFormat: 'Reset format', importPlaceholder: 'Paste an exported limited-format .txt', loadFormat: 'Load format', importError: "Couldn't parse that file — expected the JSON exported from this page.", allowedSets: 'Allowed sets', allowedCrypt: 'Allowed crypt cards', allowedLibrary: 'Allowed library cards', bannedCrypt: 'Banned crypt cards', bannedLibrary: 'Banned library cards', none: 'None', removeAria: (name) => `Remove ${name}`,
  },
  rules: {
    subLoopEntry: 'Sub-loop entry', close: 'Close', summarizedNote: 'This branch is summarized here because it sits outside the four core drill-downs.', unavailable: 'Rules reference unavailable', opening: 'Opening the V5 rules reference…', eyebrow: 'VTES V5 rules reference', heading: 'A turn, in five clear phases.', intro: 'Follow one Methuselah’s turn from unlock to discard. Choose a phase to see what happens and where its deeper rules loop begins.', complexityLabel: 'Rules complexity', complexityBasicHint: 'Core flow for learning and play.', complexityAdvancedHint: 'Full timing detail for experienced players and judges.', basic: 'Basic', advancedJudge: 'Advanced / Judge', impulseOrder: 'Impulse & priority order →', turnPhasesAria: 'Turn phases', phaseOf: (index, total) => `Phase ${index} of ${total}`, previous: '← Previous', next: 'Next →', continueInto: 'Continue into this phase', source: 'Source: the canonical SchreckNet V5 game-loop statechart · available offline',
  },
  deckDiff: {
    title: 'Compare decks', backToDecks: '← Decks', needTwoDecks: 'Create at least two decks to compare them.', deckA: 'Deck A', deckB: 'Deck B', identical: 'Decks are identical', changedCount: (count) => `${count} changed card${count === 1 ? '' : 's'}`, quantityChanged: 'Quantity changed', onlyInA: 'Only in deck A', onlyInB: 'Only in deck B', unchanged: 'Unchanged',
  },
  sharedDeck: {
    invalidLink: (error) => `This share link isn't valid: ${error}`, backToDecks: 'Back to decks', loading: 'Loading shared deck…', title: 'Shared deck', namePlaceholder: 'Name this deck', saveAsNewDeck: 'Save as new deck', emptyDeck: 'This share link points to an empty deck.', crypt: 'Crypt', library: 'Library', none: 'None',
  },
  proxy: {
    backToDeck: '← Back to deck', print: 'Print / Save as PDF', onlyMissing: 'Only missing copies', caption: (count) => `${count} card${count === 1 ? '' : 's'} at 2.5"×3.5" (real card size), 9 per US Letter page. For personal proxy use only.`, empty: 'This deck has no cards to print yet.',
  },
  badges: {
    outOfFormat: 'Out of format', outOfFormatTooltip: 'Not legal in the active limited format', rulingsHeading: 'Rulings', printingsHeading: 'Printings', sourceFallback: 'Source', noRuleDetail: 'No additional detail is recorded for this step.', previewCardImage: 'Preview card image', previewImageFor: (name) => `Preview image for ${name}`, cardImageAlt: (name) => `${name} card`,
  },
  cardDetail: {
    loading: 'Loading…', loadError: (error) => `Couldn't load card: ${error}`, notFound: (id) => `No card with id ${id} in the V5 pool.`, backToSearch: 'Back to search', backToKindSearch: (kind) => `← back to ${kind} search`, englishName: (name) => `English name: ${name}`, groupSuffix: (group) => `· Group ${group}`, requiresClan: (clan) => `· requires ${clan}`, requires: '· requires', bloodSuffix: (cost) => `· ${cost} blood`, poolSuffix: (cost) => `· ${cost} pool`, noTranslation: (lang) => `No ${lang} translation is available for this card; showing English.`, cardTextLanguage: (lang) => `Card text: ${lang}`, artistsLabel: (count, names) => `Artist${count > 1 ? 's' : ''}: ${names}`, availableCardText: (langs) => `Available card text: ${langs}`, printingsInline: 'Printings:', fullPageLink: 'Full page & share link →',
  },
  commandPalette: {
    searchPlaceholder: 'Search any card by name…', noResults: (query) => `No cards named "${query}".`,
  },
  searchDeckPanel: {
    panelAria: 'Search deck', activeDeck: 'Active deck', noLocalDecks: 'No local decks', hideDeck: 'Hide Deck', showDeck: 'Show Deck', loadingDecks: 'Loading local decks…', updateError: (error) => `Couldn't update the local deck: ${error}`, tryAgain: 'Try again', createDeckPrompt: 'Create a local deck to add cards while searching.', goToDecks: 'Go to decks', summary: (crypt, library, total) => `${crypt} crypt · ${library} library · ${total} total`, crypt: 'Crypt', library: 'Library', groupAria: (label) => `${label} cards`, emptyGroup: (label) => `No ${label.toLowerCase()} cards yet.`, savingChanges: 'Saving deck changes…', addAnother: (cardName, deckName, qty) => `Add another ${cardName} to ${deckName}; currently ${qty}`, addToDeck: (cardName, deckName) => `Add ${cardName} to ${deckName}`, selectDeckFirst: (cardName) => `Create or select a deck before adding ${cardName}`, removeOneCopy: (cardName) => `Remove one copy of ${cardName}`, copiesAria: (qty) => `${qty} copies`, addOneCopy: (cardName) => `Add one copy of ${cardName}`,
  },
  cardTiming: {
    heading: 'When can I play this?', fullReference: 'See the full rules reference →',
  },
  gameLoopWidgets: {
    breadcrumbAria: 'Rules breadcrumb', actionResolution: 'Action resolution', visibleNodes: (count) => `${count} visible nodes`, flowAria: (label) => `${label} flow`, advanced: 'Advanced', nextPathsAria: 'Next paths', openBranch: (label) => `Open ${label} →`, stateKindDecision: 'Decision', stateKindNote: 'Timing note', stateKindWindow: 'Play window', stateKindStep: 'Step', impulsePriorityOrderLabel: 'Impulse & priority order', priorityWindow: 'Priority window', whoPassesNext: 'Who passes impulse next?', impulseIntro: 'Impulse always returns to the acting Methuselah after any play. Pick a context to see who gets priority, and in what order, once they pass.', contextAria: 'Context', seatActing: 'Acting Methuselah', seatDefender: 'Defender', seatTargeted: 'Targeted', seatPasses: 'Passes', seatPrey: 'Prey', seatPredator: 'Predator', positionActing: 'Acting', stepOf: (step, total) => `Step ${step} of ${total}`, seatSuffix: (seat) => `— seat ${seat}`, firstPriority: 'The acting Methuselah has priority first.', passOrderNote: 'Impulse snaps back to the acting Methuselah as soon as anyone plays — this is the pass order if everyone declines in turn.', pause: 'Pause', animate: 'Animate',
  },
  gameLoopHooks: {
    HK_UNLOCK: 'During the unlock phase.', HK_MASTER: 'During your master phase, once per turn.', HK_INFLUENCE: 'During your influence phase.', HK_DISCARD: 'During your discard phase.', HK_ASANN: 'As you announce an action.', HK_AMOD: 'After an action is declared, before it resolves.', HK_REACT: 'In reaction to an action directed at you or your allies.', HK_BLOCK: 'When declaring or contesting a block attempt.', HK_REF: 'While a referendum or vote is open.', HK_BLEED: 'Specifically while bleed damage is being determined.', HK_CMB_RANGE: 'At the start of a combat round, when range is set.', HK_CMB_STRIKE: 'During the strike step of a combat round.', HK_CMB_PRESS: 'During the press step, when continuing combat.', HK_CMB_END: 'As combat ends.', HK_OOT: "Out of turn, as though it were a master card during someone else's turn.", HK_INPLAY: 'Continuously, once in play.', HK_ASPLAYED: 'Immediately, as it is played.',
  },
}

// `en` is the only pack bundled into the main chunk: it is the fallback for
// every unresolved key and the majority language, so it must be available
// synchronously. es/fr/de are fetched on demand by `loadUiLanguage()` — see
// i18n.es.ts. Registering into this map (rather than making the getter async)
// keeps `getUiStrings`/`useUiStrings` synchronous, so no component had to change.
const STRINGS: Partial<Record<UiLanguage, UiStrings>> = { en }

const LOADERS: Record<Exclude<UiLanguage, 'en'>, () => Promise<{ default: UiStrings }>> = {
  es: () => import('./i18n.es'),
  fr: () => import('./i18n.fr'),
  de: () => import('./i18n.de'),
}

/**
 * Loads a language pack and registers it for synchronous lookup. Awaited once
 * during bootstrap (main.tsx) and again whenever the user switches language
 * (App.tsx), so the strings are present before anything renders with them.
 * A failed chunk fetch is swallowed on purpose: the UI then keeps rendering in
 * English rather than breaking, which is the same graceful degradation
 * `getUiStrings` already applies to an unknown language tag.
 */
export async function loadUiLanguage(language: string): Promise<void> {
  const resolved = resolveUiLanguage(language)
  if (resolved === 'en' || STRINGS[resolved]) return
  try {
    STRINGS[resolved] = (await LOADERS[resolved]()).default
  } catch {
    // Keep English; see above.
  }
}

export function getUiStrings(language: string): UiStrings {
  return STRINGS[resolveUiLanguage(language)] ?? en
}

export function useUiStrings(): UiStrings {
  return getUiStrings(useCardLanguage().language)
}
