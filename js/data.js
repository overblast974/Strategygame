// ============================================================
// DONNÉES DU JEU — Terrains, Ères, Nations, Bâtiments, Événements
// ============================================================
'use strict';

const TERRAINS = {
  plaine:   { nom: 'Plaine',   couleur: '#8aa657', nourriture: 3, or: 2, science: 1, defense: 1.0 },
  foret:    { nom: 'Forêt',    couleur: '#4f7942', nourriture: 2, or: 2, science: 1, defense: 1.2 },
  colline:  { nom: 'Colline',  couleur: '#9a8f5f', nourriture: 2, or: 3, science: 1, defense: 1.3 },
  montagne: { nom: 'Montagne', couleur: '#7d7468', nourriture: 1, or: 3, science: 2, defense: 1.6 },
  desert:   { nom: 'Désert',   couleur: '#c9b077', nourriture: 1, or: 2, science: 1, defense: 1.1 },
  toundra:  { nom: 'Toundra',  couleur: '#aebfc4', nourriture: 1, or: 1, science: 1, defense: 1.2 },
  eau:      { nom: 'Mer',      couleur: '#3d6e8f', nourriture: 0, or: 0, science: 0, defense: 1.0 },
};

const ERES = [
  { id: 0, nom: 'Moyen Âge',       seuil: 0,     anneesParTour: 15, unite: 'Chevaliers',        puissance: 1.0, icone: '⚔️' },
  { id: 1, nom: 'Renaissance',     seuil: 1000,  anneesParTour: 12, unite: 'Mousquetaires',     puissance: 1.6, icone: '🛡️' },
  { id: 2, nom: 'Ère Industrielle',seuil: 2800,  anneesParTour: 8,  unite: 'Fusiliers',         puissance: 2.6, icone: '🏭' },
  { id: 3, nom: 'Ère Moderne',     seuil: 6500,  anneesParTour: 6,  unite: 'Divisions blindées', puissance: 4.2, icone: '🚀' },
  { id: 4, nom: 'Ère Futuriste',   seuil: 14000, anneesParTour: 4,  unite: 'Mechas de combat',  puissance: 7.0, icone: '🤖' },
];

// Projet de victoire scientifique (disponible à l'ère futuriste)
const PROJET_ASCENSION = { nom: 'Ascension Stellaire', cout: 10000, tours: 10 };

// ---- Types d'unités (noms par ère) ----
// attaque/defense : multiplicateurs de force. Le siège réduit l'effet des forteresses.
const TYPES_UNITES = {
  inf: {
    icone: '🗡️', attaque: 1.0, defense: 1.0,
    noms: ['Piquiers', 'Mousquetaires', 'Fusiliers', 'Infanterie mécanisée', 'Exo-soldats'],
    cout: { or: 8, nourriture: 4, fer: 1, pierre: 0 },
  },
  choc: {
    icone: '🐎', attaque: 1.6, defense: 1.2,
    noms: ['Chevaliers', 'Cuirassiers', 'Cavalerie lourde', 'Chars d\'assaut', 'Mechas de combat'],
    cout: { or: 14, nourriture: 5, fer: 3, pierre: 0 },
  },
  siege: {
    icone: '💣', attaque: 0.8, defense: 0.5,
    noms: ['Trébuchets', 'Canons', 'Artillerie', 'Lance-missiles', 'Canons à plasma'],
    cout: { or: 16, nourriture: 2, fer: 2, pierre: 3 },
  },
};

// ---- Marchandises (production, commerce) ----
const MARCHANDISES = {
  bois:   { nom: 'Bois',   icone: '🪵', prixBase: 4 },
  fer:    { nom: 'Fer',    icone: '⚒️', prixBase: 6 },
  pierre: { nom: 'Pierre', icone: '🪨', prixBase: 5 },
  epices: { nom: 'Épices', icone: '🌶️', prixBase: 9 },
};

// Bien produit par chaque terrain (2/tour + bonus d'exploitation)
const TERRAIN_BIEN = { foret: 'bois', montagne: 'fer', colline: 'pierre', desert: 'epices' };

const PRIX_MIN = 1, PRIX_MAX = 25;
const COUT_FETES_EPICES = 20; // 20 épices → +10 stabilité

const PERSONNALITES = {
  conquerant:   { nom: 'Conquérant',   agression: 0.9, diplomatie: 0.2, commerce: 0.4, science: 0.3 },
  diplomate:    { nom: 'Diplomate',    agression: 0.2, diplomatie: 0.9, commerce: 0.6, science: 0.5 },
  marchand:     { nom: 'Marchand',     agression: 0.3, diplomatie: 0.6, commerce: 0.9, science: 0.5 },
  savant:       { nom: 'Savant',       agression: 0.2, diplomatie: 0.5, commerce: 0.5, science: 0.9 },
  opportuniste: { nom: 'Opportuniste', agression: 0.6, diplomatie: 0.5, commerce: 0.5, science: 0.4 },
  expansionniste:{ nom: 'Expansionniste', agression: 0.7, diplomatie: 0.3, commerce: 0.5, science: 0.4 },
};

const NATIONS_DEFS = [
  { nom: 'Royaume de Valdor',    couleur: '#c0392b', perso: 'conquerant' },
  { nom: 'République d\'Ashan',  couleur: '#2980b9', perso: 'diplomate' },
  { nom: 'Empire de Karnag',     couleur: '#8e44ad', perso: 'expansionniste' },
  { nom: 'Cités-Libres de Mira', couleur: '#d4a017', perso: 'marchand' },
  { nom: 'Principauté de Solen', couleur: '#16a085', perso: 'savant' },
  { nom: 'Horde de Drakmar',     couleur: '#d35400', perso: 'opportuniste' },
  { nom: 'Confédération d\'Ys',  couleur: '#27ae60', perso: 'diplomate' },
  { nom: 'Dominion de Nyx',      couleur: '#5d6d7e', perso: 'conquerant' },
  { nom: 'Tsarat de Volkograd',  couleur: '#7f6690', perso: 'expansionniste' },
  { nom: 'Sultanat d\'Ormuz',    couleur: '#b3812e', perso: 'marchand' },
  { nom: 'Royaume de Kaelis',    couleur: '#4aa3a3', perso: 'diplomate' },
  { nom: 'Empire de Xin-Lao',    couleur: '#a83f6b', perso: 'savant' },
];

// ---- Mercenaires (compagnies libres) ----
const NOMS_MERCENAIRES = [
  'Compagnie du Faucon', 'Lames Noires', 'Boucliers d\'Argent', 'Loups des Steppes',
  'Garde Écarlate', 'Frères du Serpent', 'Corbeaux de Fer', 'Épées du Levant',
  'Bannière Grise', 'Chiens de Guerre', 'Fils du Tonnerre', 'Compagnie Dorée',
];
const TOURS_ROTATION_MERCENAIRES = 6; // renouvellement des compagnies

// ---- Cités-états indépendantes ----
const NB_CITES_ETATS = 7;
const NOMS_CITES = ['Vénara', 'Ashkelon', 'Tyrshan', 'Novgard', 'Qadesh', 'Palmyre', 'Byzance', 'Cartha', 'Ilion', 'Samarkande'];

// Bâtiments. type : 'commun' (partout), 'cotier' (bord de mer),
// 'extraction' (exige le gisement correspondant dans la province).
const BATIMENTS = {
  ferme:      { nom: 'Ferme',       icone: '🌾', type: 'commun',     bonus: 3,    coutBase: 40, bois: 8,  pierre: 0 },
  marche:     { nom: 'Marché',      icone: '💰', type: 'commun',     bonus: 3,    coutBase: 50, bois: 8,  pierre: 0 },
  ecole:      { nom: 'Académie',    icone: '📚', type: 'commun',     bonus: 3,    coutBase: 60, bois: 10, pierre: 0 },
  fort:       { nom: 'Forteresse',  icone: '🏰', type: 'commun',     bonus: 0.35, coutBase: 70, bois: 6,  pierre: 12 },
  port:       { nom: 'Port',        icone: '⚓', type: 'cotier',     bonus: 2,    coutBase: 55, bois: 14, pierre: 4 },
  scierie:    { nom: 'Scierie',     icone: '🪵', type: 'extraction', bien: 'bois',   bonus: 2, coutBase: 45, bois: 4,  pierre: 4 },
  mine_fer:   { nom: 'Mine de fer', icone: '⚒️', type: 'extraction', bien: 'fer',    bonus: 2, coutBase: 50, bois: 8,  pierre: 4 },
  carriere:   { nom: 'Carrière',    icone: '🪨', type: 'extraction', bien: 'pierre', bonus: 2, coutBase: 45, bois: 8,  pierre: 0 },
  plantation: { nom: 'Plantation',  icone: '🌶️', type: 'extraction', bien: 'epices', bonus: 2, coutBase: 50, bois: 8,  pierre: 0 },
  mine_or:    { nom: 'Mine d\'or',  icone: '🪙', type: 'extraction', bien: 'or',     bonus: 3, coutBase: 65, bois: 8,  pierre: 6 },
};
const NIVEAU_MAX_BATIMENT = 3;
const EMPLACEMENTS_PROVINCE = 4;   // bâtiments différents max par province (+1 en capitale)

// Noms d'ères pour les bâtiments (affichage évolutif)
const NOMS_BATIMENTS_PAR_ERE = {
  ferme:      ['Ferme', 'Domaine agricole', 'Exploitation mécanisée', 'Agro-complexe', 'Ferme hydroponique'],
  marche:     ['Marché', 'Comptoir', 'Bourse', 'Centre financier', 'Nexus commercial'],
  ecole:      ['Monastère', 'Université', 'Institut', 'Laboratoire', 'Centre quantique'],
  fort:       ['Forteresse', 'Citadelle', 'Bastion', 'Base militaire', 'Bouclier orbital'],
  port:       ['Port', 'Port marchand', 'Docks industriels', 'Terminal portuaire', 'Spatioport'],
  scierie:    ['Scierie', 'Atelier du bois', 'Scierie à vapeur', 'Complexe forestier', 'Synthé-bois'],
  mine_fer:   ['Mine de fer', 'Fonderie', 'Aciérie', 'Complexe sidérurgique', 'Forge à plasma'],
  carriere:   ['Carrière', 'Carrière taillée', 'Carrière mécanisée', 'Excavatrice géante', 'Foreuse quantique'],
  plantation: ['Plantation', 'Caravansérail', 'Comptoir des épices', 'Agro-tropicale', 'Bio-dôme'],
  mine_or:    ['Mine d\'or', 'Orpaillage royal', 'Mine profonde', 'Extraction chimique', 'Collecteur d\'astéroïdes'],
};

// Gisements possibles par terrain : [bien, probabilité]
// 'or' est un gisement spécial : la mine d'or produit de l'or directement.
const GISEMENTS_PAR_TERRAIN = {
  plaine:   [['bois', 0.25], ['epices', 0.15]],
  foret:    [['bois', 1.0], ['pierre', 0.2]],
  colline:  [['pierre', 0.7], ['fer', 0.35], ['or', 0.15]],
  montagne: [['fer', 0.8], ['pierre', 0.5], ['or', 0.25]],
  desert:   [['epices', 0.7], ['or', 0.2]],
  toundra:  [['bois', 0.4], ['fer', 0.25]],
};
const ICONES_GISEMENTS = { bois: '🪵', fer: '⚒️', pierre: '🪨', epices: '🌶️', or: '🪙' };

// Bâtiment d'extraction correspondant à chaque gisement
const BATIMENT_POUR_GISEMENT = { bois: 'scierie', fer: 'mine_fer', pierre: 'carriere', epices: 'plantation', or: 'mine_or' };

// ---- Événements à choix (style Crusader Kings) ----
// effets: { or, nourriture, science, stabilite, troupes (province aléatoire), relationsTous }
const EVENEMENTS = [
  {
    ereMin: 0, titre: 'Mariage princier',
    texte: 'Un royaume voisin propose une union entre votre héritier et leur princesse. Une dot généreuse accompagne l\'offre.',
    choix: [
      { label: 'Accepter l\'union', effets: { or: 80, relationsTous: 10 } },
      { label: 'Refuser poliment', effets: { stabilite: 5 } },
      { label: 'Exiger une dot double', effets: { or: 150, relationsTous: -15 } },
    ],
  },
  {
    ereMin: 0, titre: 'Peste dans les campagnes',
    texte: 'Une épidémie ravage vos provinces rurales. Les paysans réclament de l\'aide.',
    choix: [
      { label: 'Financer les médecins', effets: { or: -60, stabilite: 10 } },
      { label: 'Mettre en quarantaine', effets: { nourriture: -40, stabilite: -5 } },
      { label: 'Ignorer la crise', effets: { stabilite: -15, troupes: -3 } },
    ],
  },
  {
    ereMin: 0, titre: 'Croisade des prêcheurs',
    texte: 'Des fanatiques religieux appellent à la guerre sainte contre vos voisins.',
    choix: [
      { label: 'Soutenir leur ferveur', effets: { troupes: 5, relationsTous: -20 } },
      { label: 'Les disperser', effets: { stabilite: -8, relationsTous: 5 } },
      { label: 'Les rediriger vers les monastères', effets: { science: 30 } },
    ],
  },
  {
    ereMin: 0, titre: 'Tournoi des royaumes',
    texte: 'Vos chevaliers souhaitent organiser un grand tournoi pour impressionner les cours étrangères.',
    choix: [
      { label: 'Financer un tournoi somptueux', effets: { or: -50, relationsTous: 15, stabilite: 5 } },
      { label: 'Un tournoi modeste', effets: { or: -20, stabilite: 3 } },
    ],
  },
  {
    ereMin: 1, titre: 'Un artiste de génie',
    texte: 'Un peintre visionnaire demande votre mécénat. Ses œuvres pourraient rayonner dans le monde entier.',
    choix: [
      { label: 'Devenir son mécène', effets: { or: -70, science: 50, relationsTous: 10 } },
      { label: 'Refuser', effets: {} },
    ],
  },
  {
    ereMin: 1, titre: 'Découverte d\'un passage maritime',
    texte: 'Vos explorateurs ont cartographié une nouvelle route commerciale.',
    choix: [
      { label: 'Monopoliser la route', effets: { or: 120, relationsTous: -10 } },
      { label: 'La partager avec vos alliés', effets: { or: 60, relationsTous: 15 } },
    ],
  },
  {
    ereMin: 1, titre: 'Imprimerie clandestine',
    texte: 'Des pamphlets critiquant votre règne circulent dans les villes.',
    choix: [
      { label: 'Censurer les presses', effets: { stabilite: 5, science: -30 } },
      { label: 'Tolérer la libre pensée', effets: { science: 60, stabilite: -8 } },
    ],
  },
  {
    ereMin: 2, titre: 'Grève des ouvriers',
    texte: 'Les ouvriers de vos manufactures cessent le travail et exigent de meilleures conditions.',
    choix: [
      { label: 'Négocier des salaires', effets: { or: -80, stabilite: 12 } },
      { label: 'Réprimer la grève', effets: { stabilite: -12, troupes: -2 } },
      { label: 'Moderniser les usines', effets: { or: -120, science: 60, stabilite: 8 } },
    ],
  },
  {
    ereMin: 2, titre: 'Ruée vers le charbon',
    texte: 'D\'immenses gisements sont découverts sous vos montagnes.',
    choix: [
      { label: 'Exploitation intensive', effets: { or: 150, stabilite: -6 } },
      { label: 'Exploitation raisonnée', effets: { or: 70, science: 25 } },
    ],
  },
  {
    ereMin: 2, titre: 'Exposition universelle',
    texte: 'Votre capitale pourrait accueillir la grande exposition des nations.',
    choix: [
      { label: 'Accueillir l\'exposition', effets: { or: -100, science: 80, relationsTous: 20 } },
      { label: 'Décliner', effets: {} },
    ],
  },
  {
    ereMin: 3, titre: 'Course à l\'espace',
    texte: 'Vos ingénieurs proposent un programme spatial ambitieux.',
    choix: [
      { label: 'Financer le programme', effets: { or: -150, science: 120 } },
      { label: 'Un programme modeste', effets: { or: -60, science: 50 } },
      { label: 'Priorité au militaire', effets: { troupes: 8 } },
    ],
  },
  {
    ereMin: 3, titre: 'Crise financière mondiale',
    texte: 'Les marchés s\'effondrent. Votre économie vacille.',
    choix: [
      { label: 'Renflouer les banques', effets: { or: -120, stabilite: 8 } },
      { label: 'Laisser faire le marché', effets: { or: -40, stabilite: -10 } },
      { label: 'Nationaliser les industries', effets: { or: 50, relationsTous: -15 } },
    ],
  },
  {
    ereMin: 3, titre: 'Espionnage international',
    texte: 'Vos services secrets ont intercepté des plans militaires ennemis.',
    choix: [
      { label: 'Exploiter les renseignements', effets: { troupes: 6, relationsTous: -8 } },
      { label: 'Les rendre publics', effets: { relationsTous: 10, science: 30 } },
    ],
  },
  {
    ereMin: 4, titre: 'Intelligence artificielle émergente',
    texte: 'Une IA développée dans vos laboratoires montre des signes de conscience.',
    choix: [
      { label: 'L\'intégrer au gouvernement', effets: { science: 150, stabilite: -10 } },
      { label: 'La brider strictement', effets: { science: 60, stabilite: 5 } },
      { label: 'La débrancher', effets: { stabilite: 10, science: -50 } },
    ],
  },
  {
    ereMin: 4, titre: 'Colonie orbitale',
    texte: 'Votre station spatiale demande son autonomie politique.',
    choix: [
      { label: 'Accorder l\'autonomie', effets: { relationsTous: 15, or: -50 } },
      { label: 'Maintenir le contrôle', effets: { or: 100, stabilite: -8 } },
    ],
  },
  {
    ereMin: 4, titre: 'Percée en fusion nucléaire',
    texte: 'Vos savants maîtrisent enfin l\'énergie illimitée.',
    choix: [
      { label: 'Énergie pour tous', effets: { or: 100, nourriture: 100, relationsTous: 20 } },
      { label: 'Avantage militaire secret', effets: { troupes: 12, relationsTous: -10 } },
    ],
  },
];

// ---- Doctrines nationales (une seule active, changement limité) ----
const DOCTRINES = {
  militariste:   { nom: 'Militariste',   icone: '🗡️', desc: 'Recrues −20 % d\'or · force d\'attaque +10 %' },
  mercantiliste: { nom: 'Mercantiliste', icone: '💰', desc: 'Or de production +20 % · ventes au marché +10 %' },
  rationaliste:  { nom: 'Rationaliste',  icone: '📚', desc: 'Science +25 %' },
  agraire:       { nom: 'Agraire',       icone: '🌾', desc: 'Nourriture +25 % · croissance démographique accélérée' },
};
const DELAI_DOCTRINE = 15; // tours minimum entre deux changements

// ---- Spécialisation des provinces (affectation de la population) ----
const FOCUS_PROVINCE = {
  equilibre:  { nom: 'Équilibré',  icone: '⚖️' },
  agricole:   { nom: 'Agricole',   icone: '🌾' },  // +50 % nourriture, −25 % le reste
  minier:     { nom: 'Minier',     icone: '⛏️' },  // +50 % marchandises
  lettre:     { nom: 'Lettré',     icone: '📚' },  // +50 % science
  commercant: { nom: 'Commerçant', icone: '💰' },  // +50 % or
};

// ---- Marine de guerre ----
const COUT_NAVIRE = { or: 40, bois: 15 };

// Syllabes pour générer les noms de provinces
const SYLLABES_A = ['Bel', 'Cor', 'Dun', 'Fal', 'Gar', 'Hol', 'Kel', 'Lor', 'Mar', 'Nor', 'Or', 'Pel', 'Ras', 'Sil', 'Tor', 'Val', 'Wes', 'Yr', 'Zan', 'Ald'];
const SYLLABES_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou'];
const SYLLABES_C = ['bourg', 'dale', 'fort', 'gard', 'heim', 'mont', 'nia', 'ria', 'stad', 'ton', 'vik', 'wald', 'mer', 'val', 'port', 'car'];
