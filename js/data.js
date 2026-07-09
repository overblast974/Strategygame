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
  eau:      { nom: 'Mer',      couleur: '#3d6e8f', nourriture: 0, or: 0, science: 0, defense: 1.0 },
};

const ERES = [
  { id: 0, nom: 'Moyen Âge',       seuil: 0,    anneesParTour: 15, unite: 'Chevaliers',        puissance: 1.0, icone: '⚔️' },
  { id: 1, nom: 'Renaissance',     seuil: 400,  anneesParTour: 12, unite: 'Mousquetaires',     puissance: 1.6, icone: '🛡️' },
  { id: 2, nom: 'Ère Industrielle',seuil: 1100, anneesParTour: 8,  unite: 'Fusiliers',         puissance: 2.6, icone: '🏭' },
  { id: 3, nom: 'Ère Moderne',     seuil: 2500, anneesParTour: 6,  unite: 'Divisions blindées', puissance: 4.2, icone: '🚀' },
  { id: 4, nom: 'Ère Futuriste',   seuil: 5500, anneesParTour: 4,  unite: 'Mechas de combat',  puissance: 7.0, icone: '🤖' },
];

// Projet de victoire scientifique (disponible à l'ère futuriste)
const PROJET_ASCENSION = { nom: 'Ascension Stellaire', cout: 4000, tours: 10 };

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
];

const BATIMENTS = {
  ferme:  { nom: 'Ferme',       icone: '🌾', effet: 'nourriture', bonus: 3, coutBase: 40 },
  marche: { nom: 'Marché',      icone: '💰', effet: 'or',         bonus: 3, coutBase: 50 },
  ecole:  { nom: 'Académie',    icone: '📚', effet: 'science',    bonus: 3, coutBase: 60 },
  fort:   { nom: 'Forteresse',  icone: '🏰', effet: 'defense',    bonus: 0.35, coutBase: 70 },
};
const NIVEAU_MAX_BATIMENT = 3;

// Noms d'ères pour les bâtiments (affichage évolutif)
const NOMS_BATIMENTS_PAR_ERE = {
  ferme:  ['Ferme', 'Domaine agricole', 'Exploitation mécanisée', 'Agro-complexe', 'Ferme hydroponique'],
  marche: ['Marché', 'Comptoir', 'Bourse', 'Centre financier', 'Nexus commercial'],
  ecole:  ['Monastère', 'Université', 'Institut', 'Laboratoire', 'Centre quantique'],
  fort:   ['Forteresse', 'Citadelle', 'Bastion', 'Base militaire', 'Bouclier orbital'],
};

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

// Syllabes pour générer les noms de provinces
const SYLLABES_A = ['Bel', 'Cor', 'Dun', 'Fal', 'Gar', 'Hol', 'Kel', 'Lor', 'Mar', 'Nor', 'Or', 'Pel', 'Ras', 'Sil', 'Tor', 'Val', 'Wes', 'Yr', 'Zan', 'Ald'];
const SYLLABES_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou'];
const SYLLABES_C = ['bourg', 'dale', 'fort', 'gard', 'heim', 'mont', 'nia', 'ria', 'stad', 'ton', 'vik', 'wald', 'mer', 'val', 'port', 'car'];
