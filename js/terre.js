// ============================================================
// MODE TERRE HISTORIQUE — An 1000
// Carte du monde en hexagones, nations et provinces historiques
// ============================================================
'use strict';

// Légende : . mer | p plaine | f forêt | c colline | m montagne | d désert | t toundra
// 40 colonnes × 26 lignes (75°N → 55°S environ)
const CARTE_TERRE = [
  '..............ttt.......ttttttttt.......',
  '....tttttt....ttt....tt.ttttttttttttt...',
  '...tttffftt...tt..t.tft.fffftttttttttt..',
  '..ttffffftt.......t.tfffffffffffffftt...',
  '..tffffffft......fp.pfffffffffffffff....',
  '...fffffff.......pp.ppppffpppfffffff....',
  '....ffffpp.......pp.mpmpppppdppmmpf.....',
  '....fppppp.......pm.pmppmmmddmmmpp.ff...',
  '.....pppdp.......dd.dpddmmmdddmpppp.f...',
  '......ppdd.......dd.ddddddddddmpppp.f...',
  '.......pdd.......ddddddddddddcpppp......',
  '.......cpp.......dddddddddddpcppp.p.....',
  '........pp.......ppdpppdddppccppp.p.....',
  '.........pp......fpppffpdppfpcpp.pp.....',
  '.........ppf.....ffffff.pffp..pp..p.....',
  '..........fff....ffffff..ff...pp.pp.....',
  '..........ffff....fffff..f.....p..p.p...',
  '..........ffff....pffff..f.........pp...',
  '..........mfff....pdfpf.......ddpp......',
  '..........mfpf.....dppf.f....ddddp......',
  '...........mpp.....dpp..f....ddddp......',
  '...........mpp.....ppp.......dddpp......',
  '...........mp......pp.........dpp.p.....',
  '...........mp.................pp..p.....',
  '...........mp.....................p.....',
  '...........tp...........................',
];
const TERRE_W = 40;
const TERRE_H = 26;
const CODE_TERRAIN = { p: 'plaine', f: 'foret', c: 'colline', m: 'montagne', d: 'desert', t: 'toundra', '.': 'eau' };

// Les 12 puissances de l'an 1000. capitale : [col, ligne] approximatifs
// (si la case est en mer, la terre la plus proche est utilisée).
const NATIONS_TERRE = [
  {
    nom: 'Royaume de France', couleur: '#2d5bd1', perso: 'diplomate', capitale: [19, 5], nomCapitale: 'Île-de-France',
    provinces: ['Normandie', 'Bourgogne', 'Aquitaine', 'Champagne', 'Anjou', 'Toulouse', 'Flandre', 'Bretagne', 'Provence', 'Gascogne'],
  },
  {
    nom: 'Saint-Empire', couleur: '#c8a015', perso: 'expansionniste', capitale: [20, 4], nomCapitale: 'Saxe',
    provinces: ['Bavière', 'Souabe', 'Franconie', 'Lorraine', 'Bohême', 'Carinthie', 'Frise', 'Thuringe', 'Lombardie', 'Autriche'],
  },
  {
    nom: 'Royaume d\'Angleterre', couleur: '#c0392b', perso: 'opportuniste', capitale: [18, 4], nomCapitale: 'Wessex',
    provinces: ['Mercie', 'Northumbrie', 'Est-Anglie', 'Kent', 'Cornouailles', 'Galles', 'Écosse', 'Irlande'],
  },
  {
    nom: 'Califat de Cordoue', couleur: '#1e8449', perso: 'savant', capitale: [18, 7], nomCapitale: 'Cordoue',
    provinces: ['Séville', 'Grenade', 'Tolède', 'Valence', 'Saragosse', 'Léon', 'Castille', 'Algarve'],
  },
  {
    nom: 'Empire byzantin', couleur: '#7d3c98', perso: 'diplomate', capitale: [22, 6], nomCapitale: 'Constantinople',
    provinces: ['Anatolie', 'Thrace', 'Macédoine', 'Morée', 'Chypre', 'Trébizonde', 'Épire', 'Bulgarie', 'Crète', 'Antioche'],
  },
  {
    nom: 'Califat fatimide', couleur: '#117a65', perso: 'marchand', capitale: [22, 9], nomCapitale: 'Le Caire',
    provinces: ['Alexandrie', 'Damas', 'Jérusalem', 'La Mecque', 'Barqa', 'Assouan', 'Kairouan', 'Tripoli'],
  },
  {
    nom: 'Rus\' de Kiev', couleur: '#5d6d7e', perso: 'expansionniste', capitale: [22, 4], nomCapitale: 'Kiev',
    provinces: ['Tchernigov', 'Smolensk', 'Polotsk', 'Volhynie', 'Riazan', 'Souzdal', 'Pereïaslav', 'Galicie'],
  },
  {
    nom: 'Empire Song', couleur: '#d35400', perso: 'savant', capitale: [32, 8], nomCapitale: 'Kaifeng',
    provinces: ['Hebei', 'Shandong', 'Jiangnan', 'Sichuan', 'Guangdong', 'Fujian', 'Hunan', 'Shaanxi', 'Yunnan', 'Henan'],
  },
  {
    nom: 'Japon Heian', couleur: '#a83f6b', perso: 'opportuniste', capitale: [35, 7], nomCapitale: 'Yamato',
    provinces: ['Kantō', 'Mutsu', 'Shikoku', 'Kyūshū', 'Izumo', 'Echigo', 'Owari'],
  },
  {
    nom: 'Empire chola', couleur: '#b3812e', perso: 'marchand', capitale: [29, 12], nomCapitale: 'Tanjore',
    provinces: ['Pandya', 'Kerala', 'Ceylan', 'Vengi', 'Kalinga', 'Karnata', 'Andhra'],
  },
  {
    nom: 'Empire du Ghana', couleur: '#8e6c3a', perso: 'marchand', capitale: [18, 11], nomCapitale: 'Koumbi Saleh',
    provinces: ['Aoudaghost', 'Oualata', 'Djenné', 'Gao', 'Takrour', 'Sosso', 'Bambouk'],
  },
  {
    nom: 'Empire toltèque', couleur: '#b03a2e', perso: 'conquerant', capitale: [7, 11], nomCapitale: 'Tula',
    provinces: ['Cholula', 'Tulancingo', 'Culhuacán', 'Matlatzinca', 'Huastèque', 'Mixtèque', 'Zapotèque'],
  },
];

// Cités-états historiques : [nom, col, ligne]
const CITES_TERRE = [
  ['Venise', 20, 6],
  ['Novgorod', 22, 3],
  ['Palerme', 20, 7],
  ['Kilwa', 23, 17],
  ['Angkor', 31, 12],
  ['Cuzco', 11, 18],
  ['Cahokia', 8, 6],
];

// Noms de provinces pour les terres libres, par grande région du monde
// zone : [colMin, colMax, ligneMin, ligneMax]
const ZONES_NOMS_TERRE = [
  { zone: [0, 13, 0, 8], noms: ['Vinland', 'Athabasca', 'Iroquoisie', 'Ojibwé', 'Cri', 'Lakota', 'Shawnee', 'Alaska', 'Yukon', 'Huronie', 'Cherokee', 'Chinook', 'Navajo', 'Béothuk'] },
  { zone: [0, 13, 9, 15], noms: ['Anasazi', 'Comanche', 'Maya', 'Yucatán', 'Taïno', 'Caraïbe', 'Mixteca', 'Totonaque', 'Tarasque', 'Chichimèque'] },
  { zone: [8, 17, 13, 25], noms: ['Chimú', 'Tiwanaku', 'Moche', 'Quechua', 'Aymara', 'Mapuche', 'Guarani', 'Tupi', 'Chibcha', 'Nazca', 'Patagonie', 'Amazonie', 'Chaco'] },
  { zone: [14, 24, 0, 4], noms: ['Islande', 'Groenland', 'Laponie', 'Norvège', 'Suède', 'Danemark', 'Gotland', 'Finlande', 'Carélie', 'Estonie'] },
  { zone: [17, 24, 4, 8], noms: ['Pologne', 'Hongrie', 'Croatie', 'Serbie', 'Valachie', 'Moldavie', 'Lituanie', 'Prusse', 'Poméranie', 'Navarre', 'Sardaigne', 'Sicile', 'Naples', 'Rome', 'Toscane'] },
  { zone: [17, 26, 8, 13], noms: ['Fès', 'Marrakech', 'Tlemcen', 'Ifriqiya', 'Cyrénaïque', 'Nubie', 'Axoum', 'Adal', 'Hedjaz', 'Oman', 'Yémen', 'Nedjd', 'Sinaï', 'Palmyre'] },
  { zone: [17, 26, 13, 25], noms: ['Kanem', 'Bornou', 'Haoussa', 'Yoruba', 'Igbo', 'Kongo', 'Louba', 'Zoulou', 'Swahili', 'Madagascar', 'Zimbabwé', 'Kalahari', 'Namib', 'Le Cap'] },
  { zone: [22, 30, 0, 5], noms: ['Sibérie', 'Oural', 'Iakoutie', 'Toungouska', 'Kamtchatka', 'Bachkirie', 'Khanat bulgare', 'Petchénègues', 'Coumans', 'Khazarie'] },
  { zone: [23, 31, 5, 10], noms: ['Perse', 'Khorassan', 'Sogdiane', 'Kharezm', 'Boukhara', 'Samarcande', 'Ghazni', 'Kaboul', 'Arménie', 'Géorgie', 'Azerbaïdjan', 'Mésopotamie', 'Bagdad', 'Chiraz'] },
  { zone: [26, 33, 3, 8], noms: ['Mongolie', 'Ouïgourie', 'Tangoutes', 'Khitans', 'Mandchourie', 'Corée', 'Tibet', 'Kachgar', 'Dzoungarie', 'Gobi'] },
  { zone: [26, 34, 9, 16], noms: ['Bengale', 'Gujarat', 'Rajputana', 'Cachemire', 'Sind', 'Pendjab', 'Birmanie', 'Pagan', 'Siam', 'Dai Viet', 'Champa', 'Malacca', 'Sumatra', 'Java', 'Bornéo', 'Célèbes'] },
  { zone: [30, 39, 16, 25], noms: ['Arnhem', 'Kimberley', 'Pilbara', 'Nullarbor', 'Uluru', 'Queensland', 'Tasmanie', 'Aotearoa', 'Fidji', 'Papouasie', 'Mélanésie'] },
];

// (Les noms de zones sont copiés à chaque génération — voir game.js)
