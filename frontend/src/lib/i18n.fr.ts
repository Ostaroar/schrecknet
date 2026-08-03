// Split out of i18n.ts so the three non-English UI packs are code-split: every
// visitor used to download all four languages (~33 KB gzip of it unused) to use
// one. i18n.ts keeps `en` statically imported as the synchronous fallback and
// registers this pack via `loadUiLanguage()` before first paint, which is why
// `getUiStrings()` can stay synchronous and no component needed to change.
// The `UiStrings` import is type-only, so there is no runtime import cycle.
import type { UiStrings } from './i18n'

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
    routeLoading: 'Chargement…',
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
    settings: 'Données et sauvegarde',
  },
  settings: {
    title: 'Données et sauvegarde',
    intro: 'Vos decks et votre inventaire sont stockés uniquement dans ce navigateur. Rien n’est envoyé, ce qui signifie aussi que personne ne peut les récupérer à votre place : conservez une sauvegarde.',
    yourDataTitle: 'Vos données',
    yourDataNote: 'Une sauvegarde contient tout : les decks avec leurs étiquettes, descriptions et modes d’inventaire, vos quantités de cartes à l’unité et les précons que vous possédez.',
    counts: (decks, cards, precons) => `${decks} deck${decks === 1 ? '' : 's'} · ${cards} carte${cards === 1 ? '' : 's'} d’inventaire · ${precons} précon${precons === 1 ? '' : 's'} possédé${precons === 1 ? '' : 's'}`,
    downloadBackup: 'Télécharger la sauvegarde',
    creating: 'Création de la sauvegarde…',
    backupCreated: (name) => `${name} enregistré`,
    restoreTitle: 'Restaurer une sauvegarde',
    restoreNote: 'La restauration remplace tout ce qui se trouve actuellement dans ce navigateur par le contenu du fichier. C’est irréversible, donc une sauvegarde de vos données actuelles est téléchargée d’abord.',
    chooseFile: 'Choisir un fichier de sauvegarde…',
    restoring: 'Restauration…',
    restoreConfirm: (currentDecks, currentCards, backupDecks, backupCards) =>
      `Remplacer vos données actuelles (${currentDecks} decks, ${currentCards} cartes d’inventaire) par la sauvegarde (${backupDecks} decks, ${backupCards} cartes) ? C’est irréversible.`,
    restoreDone: 'Sauvegarde restaurée.',
    restoreFailed: (error) => `Restauration impossible : ${error}`,
    sensitiveNote: 'Le fichier contient aussi les codes et mots de passe de vos groupes de jeu — traitez-le comme un mot de passe.',
    lastBackup: (when) => `Dernière sauvegarde : ${when}`,
    neverBackedUp: 'Vous n’avez jamais fait de sauvegarde.',
    reminder: 'Vos decks et votre inventaire n’existent que dans ce navigateur. Téléchargez une sauvegarde pour qu’un effacement des données du site ne les perde pas.',
    storageTitle: 'Stockage du navigateur',
    storagePersisted: 'Le navigateur a été invité à conserver vos données et a accepté : elles ne seront pas supprimées automatiquement.',
    storageNotPersisted: 'Vos données sont stockées « au mieux » : le navigateur peut les supprimer si l’espace manque.',
    enablePersistence: 'Demander au navigateur de conserver mes données',
    storageUsage: (used, quota) => `${used} utilisés sur environ ${quota} disponibles`,
    cardDataTitle: 'Données des cartes',
    cardDataNote: 'La base de données des cartes est téléchargée depuis le serveur et se met à jour dès qu’une nouvelle version paraît. La recharger ne touche jamais vos decks ni votre inventaire.',
    cardDataVersion: (version) => `Version des données de cartes chargée : ${version}`,
    refreshCardData: 'Recharger les données des cartes',
    refreshing: 'Rechargement…',
    refreshDone: 'Données des cartes rechargées.',
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
      { date: '2026-07-23', title: 'Groupes de jeu privés et classements', summary: 'Suivez les parties informelles avec votre groupe habituel et consultez un classement partagé — sans compte.', items: ["Rejoignez un groupe avec un code à partager, enregistrez des parties et suivez victoires, VP et performance par archétype.", "Rejoignez plusieurs groupes, modifiez ou supprimez une partie enregistrée, et verrouillez l'édition avec une phrase de passe optionnelle."] },
      { date: '2026-07-23', title: 'Quantités de préconstruits, enfin justes', summary: "Ajouter un préconstruit à votre inventaire utilise maintenant le nombre réel d'exemplaires par carte de chaque préconstruit, pas une estimation fixe.", items: ["Indiquez combien d'exemplaires d'un préconstruit vous possédez ; chaque carte est ajustée selon sa quantité réelle.", 'Le navigateur de préconstruits affiche aussi ce que vous possédez déjà, à partir de votre inventaire.'] },
      { date: '2026-07-23', title: 'Nouveau look, et allemand', summary: "SchreckNet a une nouvelle identité avec sceau de chauve-souris, et l'interface est maintenant disponible en allemand.", items: ["Logo, wordmark et slogan renouvelés dans toute l'application.", 'Ajout des pages Impressum et Datenschutzerklärung pour les visiteurs allemands.'] },
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
    clanLabel: 'Clan', anyClan: 'Tout clan', titleLabel: 'Titre', anyTitle: 'Tout titre', nonTitled: 'Sans titre', votes: 'Voix', anyVotes: 'Toutes voix', noVotes: 'Aucune voix', votesAtLeast: (count) => `${count}+ voix`, group: 'Groupe', groupsAria: 'Groupes de crypte', sortAria: 'Trier les résultats de crypte', capacity: 'cap', minimum: 'min', maximum: 'max', sect: 'Secte', orDiscipline: '+ discipline OU', choose: 'Choisir…', results: (count, semantic) => `${count} cartes de crypte${semantic ? ' sémantiques' : ''}`, semanticEmpty: 'Décrivez un concept pour chercher dans la crypte V5.', sortCapacityDesc: 'Capacité décroissante', sortCapacityAsc: 'Capacité croissante', sortClan: 'Clan', sortGroup: 'Groupe', sortName: 'Nom', sortSect: 'Secte', similarity: 'similarité',
  },
  librarySearch: {
    anyType: 'Tout type', anyClanRequirement: 'Toute exigence de clan / voie', requiresCapacity: 'requiert cap', capacityRequirementAria: "Exigence de capacité", capacityRequirementComparisonAria: "Comparaison de l'exigence de capacité", blood: 'sang', bloodCostAria: 'Coût en sang', bloodCostComparisonAria: 'Comparaison du coût en sang', pool: 'pool', poolCostAria: 'Coût en pool', poolCostComparisonAria: 'Comparaison du coût en pool', sortAria: 'Trier les résultats de bibliothèque', disciplineLogic: 'Logique des disciplines', noRequirement: 'Sans exigence', sect: 'Secte', title: 'Titre', results: (count, semantic) => `${count} cartes de bibliothèque${semantic ? ' sémantiques' : ''}`, semanticEmpty: 'Décrivez un concept pour chercher dans la bibliothèque V5.', sortRequirement: 'Clan / voie / discipline', sortCostDesc: 'Coût décroissant', sortCostAsc: 'Coût croissant', sortName: 'Nom', sortType: 'Type', similarity: 'similarité', requirement: 'exigence', notRequired: 'Non requis', titledSpecific: 'Titré (spécifique)', titledAny: 'Titré (tout)', nonTitled: 'Sans titre',
  },
  table: {
    title: 'Table', intro: 'Consignez les parties de votre groupe privé et partagez un classement, sans compte. Les données ne sont accessibles qu’avec le code du groupe.', cancel: 'Annuler', joinAnother: '+ Rejoindre un autre', groupMissing: "Ce code de groupe n'existe plus.", noGroup: 'Aucun groupe ne possède ce code.', confirmLeave: (name) => `Quitter ${name} ? Vous pourrez le rejoindre avec son code.`, thisGroup: 'ce groupe', createGroup: 'Créer un groupe', groupExample: 'p. ex. Coterie du jeudi', create: 'Créer', joinGroup: 'Rejoindre un groupe', groupCode: 'Code du groupe', join: 'Rejoindre', shareCode: 'Partagez ce code privé avec votre groupe :', copied: 'Copié !', leaveGroup: 'Quitter le groupe', loading: 'Chargement…', leaderboard: 'Classement', noGamesFirst: 'Aucune partie — consignez la première ci-dessous.', player: 'Joueur', games: 'Parties', totalVp: 'VP total', avgVp: 'VP moyen', wins: 'Victoires', winRate: '% victoires', logGame: 'Consigner la partie', editGame: 'Modifier la partie', datePlayed: 'Date', notes: 'Notes (facultatif)', seat: (number) => `Place ${number}`, playerName: 'Nom du joueur', deckOptional: 'Deck (facultatif)', archetype: 'Archétype', anyArchetype: 'Archétype (facultatif)', removeRow: (number) => `Retirer la ligne ${number}`, addPlayer: '+ Ajouter un joueur', addOnePlayer: 'Ajoutez au moins un joueur.', invalidVp: (name) => `${name} : les VP doivent être un nombre positif ou nul.`, saveChanges: 'Enregistrer', archetypePerformance: 'Performance par archétype', recentGames: 'Parties récentes', exportCsv: 'Exporter CSV', exportText: 'Exporter texte', edit: 'Modifier', delete: 'Supprimer', deleting: 'Suppression…', deleteAria: (date) => `Supprimer la partie du ${date}`, confirmDelete: (date, players) => `Supprimer la partie du ${date} (${players}) ? Elle disparaîtra définitivement du classement.`, alreadyDeleted: 'Cette partie avait déjà été supprimée.', noGames: 'Aucune partie consignée.', predator: (name) => `Prédateur : ${name}`, prey: (name) => `Proie : ${name}`, writePassphraseOptional: 'Phrase d’écriture (facultative, 8+ caractères)', confirmPassphrase: 'Confirmer la phrase d’écriture', passphraseTooShort: 'La phrase d’écriture doit contenir au moins 8 caractères.', passphrasesDiffer: 'Les phrases ne correspondent pas.', editingLocked: 'Modification verrouillée', editingLockedHelp: 'Toute personne ayant le code peut lire. Saisissez la phrase pour ajouter, modifier ou supprimer des parties.', writePassphrase: 'Phrase d’écriture', unlockEditing: 'Déverrouiller', editingUnlocked: 'La modification est déverrouillée pour cette session.', wrongPassphrase: 'La phrase d’écriture est incorrecte.',
  },
  inventory: {
    title: 'Inventaire', counts: (crypt, library) => `${crypt} crypte · ${library} bibliothèque`, loading: "Chargement de l'inventaire…", loadError: "Impossible de charger l'inventaire", decreaseQty: 'Diminuer la quantité', increaseQty: 'Augmenter la quantité', importExportTitle: 'Import / export texte', exportTxt: 'Exporter .txt', loadTxt: 'Charger .txt', importText: 'Importer texte…', hideImport: "Masquer l'import", importPlaceholder: 'Collez une liste de cartes, p. ex.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', addToInventory: "Ajouter à l'inventaire", importing: 'Importation…', addedCards: (count) => `${count} carte${count === 1 ? '' : 's'} ajoutée${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Introuvable : ${names}.`, addRemovePreconTitle: 'Ajouter / retirer un préconstruit', preconNote: "Indiquez combien d'exemplaires de ce préconstruit vous possédez — chaque carte est ajustée selon son propre nombre réel de copies par préconstruit (certains préconstruits incluent plus d'un exemplaire de certaines cartes), pas une quantité fixe.", choosePrecon: 'Choisir un préconstruit…', preconQuantityLabel: 'Préconstruits', adding: 'Ajout…', removeFromInventory: "Retirer de l'inventaire", removing: 'Retrait…', addedCopies: (precons, count) => `${precons} préconstruit${precons === 1 ? '' : 's'} ajouté${precons === 1 ? '' : 's'} (${count} cartes distinctes, en utilisant le nombre réel de copies par carte de chaque préconstruit).`, removedCopies: (precons, count) => `${precons} préconstruit${precons === 1 ? '' : 's'} retiré${precons === 1 ? '' : 's'} (${count} cartes distinctes, en utilisant le nombre réel de copies par carte de chaque préconstruit).`, noOwnedPrecons: "Aucun exemplaire de ce préconstruit n'est enregistré.", missingCardsTitle: (total, count) => `Cartes manquantes — ${total} copies sur ${count} carte${count === 1 ? '' : 's'}`, exportWantList: 'Exporter la liste de souhaits .txt', missingNote: 'Ce dont chaque deck suivi par l\'inventaire a encore besoin, combiné — les decks marqués « Pas dans l\'inventaire » ne comptent pas.', crypt: 'Crypte', library: 'Bibliothèque', noCryptOwned: 'Aucune carte de crypte possédée pour le moment.', noLibraryOwned: 'Aucune carte de bibliothèque possédée pour le moment.', removeAria: (name) => `Retirer ${name} de l'inventaire`, youOwn: (qty) => `Vous possédez ${qty}`, ownedBadge: (qty) => `Possédées ${qty}`,
  },
  addCardBox: {
    placeholderCrypt: 'Ajouter une carte de crypte par son nom…', placeholderLibrary: 'Ajouter une carte de bibliothèque par son nom…',
  },
  precons: {
    title: 'Decks préconstruits', intro: 'Decks préconstruits officiels de la gamme moderne BCP/V5, groupés par extension.', cardCountNote: 'Liste prête à jouer avec le nombre réel de chaque carte.', loading: 'Chargement des préconstruits…', loadError: (error) => `Impossible de charger les préconstruits : ${error}`, backToPrecons: '← Préconstruits', cardsSuffix: (count) => `${count} cartes distinctes`, cryptCount: (count) => `Crypte · ${count}`, libraryCount: (count) => `Bibliothèque · ${count}`, none: 'Aucune', ownedOverview: (copies, distinct) => `${copies} préconstruit${copies === 1 ? '' : 's'} possédé${copies === 1 ? '' : 's'} · ${distinct} différent${distinct === 1 ? '' : 's'}`, ownedOverviewNote: "Compte les produits ajoutés via l'inventaire ; les cartes seules ne sont pas prises pour des préconstruits physiques.", ownedCopies: (count) => `${count} possédé${count === 1 ? '' : 's'}`, notOwned: 'non possédé',
  },
  decks: {
    newDeckPlaceholder: 'Nom du nouveau deck', createDeck: 'Créer un deck', compareTwoDecks: 'Comparer deux decks →', loading: 'Chargement des decks…', loadError: (error) => `Impossible de charger vos decks : ${error}`, noDecks: "Pas encore de decks — les decks sont stockés localement dans ce navigateur (aucun compte requis).", ownsCopies: 'Possède des copies', sharesCopies: 'Partage des copies', missingSuffix: (count) => `${count} manquante${count === 1 ? '' : 's'}`, byAuthor: (author) => `par ${author}`, clone: 'Cloner', delete: 'Supprimer', confirmDelete: (name) => `Supprimer « ${name} » ? Cette action est irréversible.`,
  },
  deckEditor: {
    decreaseQty: 'Diminuer la quantité', increaseQty: 'Augmenter la quantité', inventoryModeLabel: 'Inventaire', inventoryModeAria: "Mode d'inventaire", modeExcluded: "Pas dans l'inventaire", modeExcludedHint: "Les cartes de ce deck n'affectent pas le décompte des copies manquantes.", modeFlexible: 'Partage des copies', modeFlexibleHint: "Réclame des copies dans un pool partagé — d'autres decks flexibles peuvent utiliser les mêmes copies.", modeFixed: 'Possède des copies', modeFixedHint: 'Réclame des copies en exclusivité — aucun autre deck ne peut compter dessus.', missingBadge: (count) => `${count} manquante${count === 1 ? '' : 's'}`, fixedHint: 'Fixe ici — réclame ces copies en exclusivité. Cliquez pour partager à la place.', flexibleHint: "Flexible ici — partage des copies avec d'autres decks. Cliquez pour réclamer en exclusivité.", fixedLabel: 'Fixe', flexibleLabel: 'Flexible', importExportTitle: 'Import / export texte', exportTxt: 'Exporter .txt', copied: 'Copié !', couldNotCopy: 'Impossible de copier', copyText: 'Copier le texte', loadTxt: 'Charger .txt', hideImport: "Masquer l'import", importText: 'Importer texte…', importPlaceholder: 'Collez une liste de deck, p. ex.\n4x Deflection\n1x Aaradhya, The Callous Tyrant', importing: 'Importation…', importIntoDeck: 'Importer dans ce deck', addedCards: (count) => `${count} carte${count === 1 ? '' : 's'} ajoutée${count === 1 ? '' : 's'}.`, couldNotMatch: (names) => `Introuvable : ${names}.`, drawErrorFallback: 'Impossible de tirer une main de test', testHand: 'Main de test', drawCrypt: 'Tirer la crypte', drawLibrary: 'Tirer la bibliothèque', capAbbrev: (capacity) => `cap ${capacity}`, archetypeScan: "Analyse d'archétypes", tagged: 'Étiqueté', addTagButton: '+ étiquette', removeTagAria: (name) => `Retirer l'étiquette ${name}`, addTagPlaceholder: 'Ajouter une étiquette…', addButton: 'Ajouter', loadingDeck: 'Chargement du deck…', loadError: (error) => `Impossible de charger le deck : ${error}`, noDeckWithId: (id) => `Aucun deck avec l'id ${id}.`, backToDecks: 'Retour aux decks', backArrow: '← decks', linkCopied: 'Lien copié !', share: 'Partager', clone: 'Cloner', review: 'Revue', printProxies: 'Imprimer les proxies', confirmDeleteDeck: (name) => `Supprimer « ${name} » ? Cette action est irréversible.`, deleteDeck: 'Supprimer le deck', authorPlaceholder: 'Auteur', descriptionPlaceholder: 'Description du deck, stratégie ou notes…', cryptWord: 'crypte', libraryWord: 'bibliothèque', capacityWord: 'capacité', avgWord: 'moy', v5Legal: 'V5 légal', limitedFormatLegal: 'Format limité légal', limitedViolationsText: (count, names) => `${count} carte${count === 1 ? '' : 's'} hors du format limité actif : ${names}`, libraryTypes: 'Types de bibliothèque', disciplinesLabel: 'Disciplines', bloodCostCurve: 'Courbe de coût en sang', poolCostCurve: 'Courbe de coût en pool', copiesMissing: (count) => `${count} copie${count === 1 ? '' : 's'} manquante${count === 1 ? '' : 's'}`, allCopiesCovered: "Toutes les copies sont couvertes par l'inventaire", cryptHeader: 'Crypte', sortLabel: 'Trier', sortOptionCapacity: 'Capacité', sortOptionClan: 'Clan', sortOptionGroup: 'Groupe', sortOptionName: 'Nom', sortOptionQuantity: 'Quantité', noCryptCards: 'Aucune carte de crypte pour le moment.', libraryHeader: 'Bibliothèque', noLibraryCards: 'Aucune carte de bibliothèque pour le moment.',
  },
  deckReview: {
    loadError: (error) => `Impossible de revoir le deck : ${error}`, loading: 'Chargement de la revue du deck…', backToEdit: '← modifier le deck', title: 'Revue du deck', byAuthor: (author) => `par ${author}`, crypt: 'Crypte', library: 'Bibliothèque', capacity: 'Capacité', average: (value) => `moyenne ${value}`, legality: 'Légalité V5', noViolations: 'Aucune infraction au format de base trouvée.', libraryComposition: 'Composition de la bibliothèque', disciplineFootprint: 'Répartition des disciplines', bloodCostCurve: 'Courbe de coût en sang', poolCostCurve: 'Courbe de coût en pool', timingWindows: 'Fenêtres de jeu',
  },
  limitedFormat: {
    title: 'Format limité', introActive: 'Construisez un pool de cartes personnalisé pour un événement limité/draft : choisissez les extensions autorisées, puis autorisez ou interdisez des cartes individuelles. Ce format est actif — les decks affichent sa légalité à côté de la légalité V5.', introInactive: 'Construisez un pool de cartes personnalisé pour un événement limité/draft : choisissez les extensions autorisées, puis autorisez ou interdisez des cartes individuelles. Vide pour le moment, donc sans effet sur les decks.', importExportTitle: 'Import / export', exportTxt: 'Exporter .txt', loadTxt: 'Charger .txt', importText: 'Importer texte…', hideImport: "Masquer l'import", resetFormat: 'Réinitialiser le format', importPlaceholder: 'Collez un format limité exporté .txt', loadFormat: 'Charger le format', importError: "Impossible d'analyser ce fichier — le JSON exporté depuis cette page était attendu.", allowedSets: 'Extensions autorisées', allowedCrypt: 'Cartes de crypte autorisées', allowedLibrary: 'Cartes de bibliothèque autorisées', bannedCrypt: 'Cartes de crypte interdites', bannedLibrary: 'Cartes de bibliothèque interdites', none: 'Aucune', removeAria: (name) => `Retirer ${name}`,
  },
  rules: {
    subLoopEntry: 'Entrée du sous-cycle', close: 'Fermer', summarizedNote: 'Cette branche est résumée ici car elle se situe en dehors des quatre approfondissements principaux.', unavailable: 'Référence des règles indisponible', opening: 'Ouverture de la référence des règles V5…', eyebrow: 'Référence des règles VTES V5', heading: 'Un tour, en cinq phases claires.', intro: 'Suivez le tour d’un mathusalem, du déverrouillage à la défausse. Choisissez une phase pour voir ce qui s’y passe et où commence son sous-cycle de règles.', complexityLabel: 'Complexité des règles', complexityBasicHint: 'Déroulement essentiel pour apprendre et jouer.', complexityAdvancedHint: 'Détail complet des timings pour joueurs expérimentés et juges.', basic: 'Basique', advancedJudge: 'Avancé / Juge', impulseOrder: 'Ordre d’impulsion et de priorité →', turnPhasesAria: 'Phases du tour', phaseOf: (index, total) => `Phase ${index} sur ${total}`, previous: '← Précédent', next: 'Suivant →', continueInto: 'Continuer dans cette phase', source: 'Source : le diagramme d’états canonique du cycle de jeu V5 de SchreckNet · disponible hors ligne',
  },
  deckDiff: {
    title: 'Comparer des decks', backToDecks: '← Decks', needTwoDecks: 'Créez au moins deux decks pour les comparer.', deckA: 'Deck A', deckB: 'Deck B', identical: 'Les decks sont identiques', changedCount: (count) => `${count} carte${count === 1 ? '' : 's'} modifiée${count === 1 ? '' : 's'}`, quantityChanged: 'Quantité modifiée', onlyInA: 'Uniquement dans le deck A', onlyInB: 'Uniquement dans le deck B', unchanged: 'Inchangée',
  },
  sharedDeck: {
    invalidLink: (error) => `Ce lien de partage n'est pas valide : ${error}`, backToDecks: 'Retour aux decks', loading: 'Chargement du deck partagé…', title: 'Deck partagé', namePlaceholder: 'Nommez ce deck', saveAsNewDeck: 'Enregistrer comme nouveau deck', emptyDeck: 'Ce lien de partage pointe vers un deck vide.', crypt: 'Crypte', library: 'Bibliothèque', none: 'Aucune',
  },
  proxy: {
    backToDeck: '← Retour au deck', print: 'Imprimer / Enregistrer en PDF', onlyMissing: 'Uniquement les copies manquantes', caption: (count) => `${count} carte${count === 1 ? '' : 's'} au format 2,5"×3,5" (taille réelle), 9 par page Lettre US. Usage proxy personnel uniquement.`, empty: "Ce deck n'a pas encore de cartes à imprimer.",
  },
  badges: {
    outOfFormat: 'Hors format', outOfFormatTooltip: 'Non légal dans le format limité actif', rulingsHeading: 'Décisions', printingsHeading: 'Éditions', sourceFallback: 'Source', noRuleDetail: 'Aucun détail supplémentaire enregistré pour cette étape.', previewCardImage: 'Aperçu de la carte', previewImageFor: (name) => `Aperçu de l'image de ${name}`, cardImageAlt: (name) => `Carte ${name}`,
  },
  cardDetail: {
    loading: 'Chargement…', loadError: (error) => `Impossible de charger la carte : ${error}`, notFound: (id) => `Aucune carte avec l'id ${id} dans le pool V5.`, backToSearch: 'Retour à la recherche', backToKindSearch: (kind) => `← retour à la recherche ${kind}`, englishName: (name) => `Nom anglais : ${name}`, groupSuffix: (group) => `· Groupe ${group}`, requiresClan: (clan) => `· nécessite ${clan}`, requires: '· nécessite', bloodSuffix: (cost) => `· ${cost} sang`, poolSuffix: (cost) => `· ${cost} pool`, noTranslation: (lang) => `Aucune traduction en ${lang} disponible pour cette carte ; affichage en anglais.`, cardTextLanguage: (lang) => `Texte de la carte : ${lang}`, artistsLabel: (count, names) => `Artiste${count > 1 ? 's' : ''} : ${names}`, availableCardText: (langs) => `Texte de carte disponible : ${langs}`, printingsInline: 'Éditions :', fullPageLink: 'Page complète et lien de partage →',
  },
  commandPalette: {
    searchPlaceholder: 'Rechercher une carte par son nom…', noResults: (query) => `Aucune carte nommée « ${query} ».`,
  },
  searchDeckPanel: {
    panelAria: 'Deck de recherche', activeDeck: 'Deck actif', noLocalDecks: 'Aucun deck local', hideDeck: 'Masquer le deck', showDeck: 'Afficher le deck', loadingDecks: 'Chargement des decks locaux…', updateError: (error) => `Impossible de mettre à jour le deck local : ${error}`, tryAgain: 'Réessayer', createDeckPrompt: 'Créez un deck local pour ajouter des cartes pendant la recherche.', goToDecks: 'Aller aux decks', summary: (crypt, library, total) => `${crypt} crypte · ${library} bibliothèque · ${total} au total`, crypt: 'Crypte', library: 'Bibliothèque', groupAria: (label) => `Cartes de ${label.toLowerCase()}`, emptyGroup: (label) => `Aucune carte de ${label.toLowerCase()} pour le moment.`, savingChanges: 'Enregistrement des modifications du deck…', addAnother: (cardName, deckName, qty) => `Ajouter un autre exemplaire de ${cardName} à ${deckName} ; actuellement ${qty}`, addToDeck: (cardName, deckName) => `Ajouter ${cardName} à ${deckName}`, selectDeckFirst: (cardName) => `Créez ou sélectionnez un deck avant d'ajouter ${cardName}`, removeOneCopy: (cardName) => `Retirer un exemplaire de ${cardName}`, copiesAria: (qty) => `${qty} exemplaires`, addOneCopy: (cardName) => `Ajouter un exemplaire de ${cardName}`,
  },
  cardTiming: {
    heading: 'Quand puis-je jouer cette carte ?', fullReference: 'Voir la référence des règles complète →',
  },
  gameLoopWidgets: {
    breadcrumbAria: 'Fil d’Ariane des règles', actionResolution: 'Résolution d’action', visibleNodes: (count) => `${count} nœuds visibles`, flowAria: (label) => `Flux ${label}`, advanced: 'Avancé', nextPathsAria: 'Chemins suivants', openBranch: (label) => `Ouvrir ${label} →`, stateKindDecision: 'Décision', stateKindNote: 'Note de timing', stateKindWindow: 'Fenêtre de jeu', stateKindStep: 'Étape', impulsePriorityOrderLabel: 'Ordre d’impulsion et de priorité', priorityWindow: 'Fenêtre de priorité', whoPassesNext: 'Qui passe l’impulsion ensuite ?', impulseIntro: 'L’impulsion revient toujours au mathusalem actif après toute action jouée. Choisissez un contexte pour voir qui a la priorité, et dans quel ordre, une fois qu’ils passent.', contextAria: 'Contexte', seatActing: 'Mathusalem actif', seatDefender: 'Défenseur', seatTargeted: 'Visé', seatPasses: 'Passe', seatPrey: 'Proie', seatPredator: 'Prédateur', positionActing: 'Actif', stepOf: (step, total) => `Étape ${step} sur ${total}`, seatSuffix: (seat) => `— siège ${seat}`, firstPriority: 'Le mathusalem actif a la priorité en premier.', passOrderNote: 'L’impulsion revient au mathusalem actif dès que quelqu’un joue — c’est l’ordre de passage si tout le monde décline à tour de rôle.', pause: 'Pause', animate: 'Animer',
  },
  gameLoopHooks: {
    HK_UNLOCK: 'Pendant la phase de déverrouillage.', HK_MASTER: 'Pendant votre phase de maître, une fois par tour.', HK_INFLUENCE: "Pendant votre phase d'influence.", HK_DISCARD: 'Pendant votre phase de défausse.', HK_ASANN: 'Au moment où vous annoncez une action.', HK_AMOD: 'Après qu’une action est déclarée, avant sa résolution.', HK_REACT: 'En réaction à une action dirigée contre vous ou vos alliés.', HK_BLOCK: 'Lors de la déclaration ou de la contestation d’une tentative de blocage.', HK_REF: 'Tant qu’un référendum ou un vote est ouvert.', HK_BLEED: 'Spécifiquement pendant la détermination des dégâts de saignée.', HK_CMB_RANGE: "Au début d'une manche de combat, quand la distance est fixée.", HK_CMB_STRIKE: "Pendant l'étape de frappe d'une manche de combat.", HK_CMB_PRESS: "Pendant l'étape de poursuite, en continuant le combat.", HK_CMB_END: 'Quand le combat se termine.', HK_OOT: "Hors tour, comme s'il s'agissait d'une carte de maître pendant le tour d'un autre joueur.", HK_INPLAY: 'En continu, une fois en jeu.', HK_ASPLAYED: 'Immédiatement, au moment où elle est jouée.',
  },
}

export default fr
