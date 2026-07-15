// ============================================================
// MODE TERRE HISTORIQUE — An 1000
// Carte du monde en hexagones, nations et provinces historiques
// ============================================================
'use strict';

// Légende : . mer | p plaine | f forêt | c colline | m montagne | d désert | t toundra
// 64 colonnes × 40 lignes (84°N → 56°S), générée depuis les contours réels
// des continents (polygones lon/lat), déserts et chaînes de montagnes réels.
const CARTE_TERRE = [
  '...............ttttttttttttttt...................t..............',
  '..............tttt.ttttttttt......tt.............tt.............',
  '..........ttt.tttt....ttttttt.............tt...tttttt....t......',
  '...tt....tttttttttt...tttttt........t....t..tttttttttttttttt....',
  'p..ttttttttttttttf.tt.ttttt........ttffttttttttttttttttttttttttt',
  'p.tttfffftttttfff.ft..ttt...t....tttfffttfmfffttftttftttttfffftt',
  '..pfpfpfffffpfff..ff...tt........fpttfffffpfpfffffffpffffffpfff.',
  '...f...pffpfffff..fff............fp.pffpffmfpffpfpffffpfp...f...',
  '.........fmffppfffffff........ff.ppffpfppfmfpffppffffffpfp..f...',
  '.........fmmmpfpfpfpff.........ffffpffffppmffpffppppffffff......',
  '..........fffpffffffpff.........fmmffffppfffffpfffffffmpff......',
  '.........fpmmpfcpfff..........pfcfpfp..mppfppmmdddfcfpcp.f......',
  '..........cmfpffffp...........ccf..ffffpmfppfmmdddddcfm.........',
  '..........cmmppfpf............cpfc...pfpcpfcppddfdddfcc.c.......',
  '...........fpdpppp.............ccpp...cpfddcpmmpmmfpcc..c.......',
  '...........dddccp.............ddddpdddpcmddpfmmcmmcppf..........',
  '............ddp..............dddddddddppdmpcdcffccpppp..........',
  '............dp...............pdddddddddddcp.fccffppff...........',
  '.............pffp..c.........cfdddddddccddc..pcc.ppp............',
  '..............fff...........cfpcpffpfcfdd....pp..cp..p..........',
  '................p..f.........pppfpcfppppd....cp...fp............',
  '.................pffp........pfffpffffmfp....c........f.........',
  '..................ffffp.......ffpfppfffpf.........f..f..........',
  '.................ffmfff..........pfffffp.........f.pf...........',
  '..................pffpfff.........pfffff..........p.fp..f.......',
  '.................pfppfpff.........fpfpp...........f.....fp......',
  '..................fmffppfp........fpffpp............f....ff.....',
  '..................pmcfpfp.........ppppf................p........',
  '...................mpppcp.........pppcffc.............pcpp......',
  '...................mpppcp.........dfpf.fp............dppdf......',
  '...................ppfpfc..........dfcf.p...........cdddfpp.....',
  '...................ppff...........ddpp..............ppdddcc.....',
  '...................mpccf...........dcp...............ddfdpcc....',
  '...................pppc............cc...............cfddccc.....',
  '...................mcp...................................fp.....',
  '..................mmc..........................................p',
  '...................mp.........................................p.',
  '..................mm............................................',
  '...................f............................................',
  '..................ff............................................',
];
const TERRE_W = 64;
const TERRE_H = 40;
const CODE_TERRAIN = { p: 'plaine', f: 'foret', c: 'colline', m: 'montagne', d: 'desert', t: 'toundra', '.': 'eau' };

// Les 12 puissances de l'an 1000. capitale : [col, ligne] approximatifs
// (si la case est en mer, la terre la plus proche est utilisée).
const NATIONS_TERRE = [
  {
    nom: 'Royaume de France', couleur: '#2d5bd1', perso: 'diplomate', capitale: [32, 10], nomCapitale: 'Île-de-France',
    provinces: ['Normandie', 'Bourgogne', 'Aquitaine', 'Champagne', 'Anjou', 'Toulouse', 'Flandre', 'Bretagne', 'Provence', 'Gascogne'],
  },
  {
    nom: 'Saint-Empire', couleur: '#c8a015', perso: 'expansionniste', capitale: [34, 9], nomCapitale: 'Saxe',
    provinces: ['Bavière', 'Souabe', 'Franconie', 'Lorraine', 'Bohême', 'Carinthie', 'Frise', 'Thuringe', 'Lombardie', 'Autriche'],
  },
  {
    nom: 'Royaume d\'Angleterre', couleur: '#c0392b', perso: 'opportuniste', capitale: [31, 9], nomCapitale: 'Wessex',
    provinces: ['Mercie', 'Northumbrie', 'Est-Anglie', 'Kent', 'Cornouailles', 'Galles', 'Écosse', 'Irlande'],
  },
  {
    nom: 'Califat de Cordoue', couleur: '#1e8449', perso: 'savant', capitale: [31, 13], nomCapitale: 'Cordoue',
    provinces: ['Séville', 'Grenade', 'Tolède', 'Valence', 'Saragosse', 'Léon', 'Castille', 'Algarve'],
  },
  {
    nom: 'Empire byzantin', couleur: '#7d3c98', perso: 'diplomate', capitale: [37, 12], nomCapitale: 'Constantinople',
    provinces: ['Anatolie', 'Thrace', 'Macédoine', 'Morée', 'Chypre', 'Trébizonde', 'Épire', 'Bulgarie', 'Crète', 'Antioche'],
  },
  {
    nom: 'Califat fatimide', couleur: '#117a65', perso: 'marchand', capitale: [37, 15], nomCapitale: 'Le Caire',
    provinces: ['Alexandrie', 'Damas', 'Jérusalem', 'La Mecque', 'Barqa', 'Assouan', 'Kairouan', 'Tripoli'],
  },
  {
    nom: 'Rus\' de Kiev', couleur: '#5d6d7e', perso: 'expansionniste', capitale: [37, 10], nomCapitale: 'Kiev',
    provinces: ['Tchernigov', 'Smolensk', 'Polotsk', 'Volhynie', 'Riazan', 'Souzdal', 'Pereïaslav', 'Galicie'],
  },
  {
    nom: 'Empire Song', couleur: '#d35400', perso: 'savant', capitale: [52, 14], nomCapitale: 'Kaifeng',
    provinces: ['Hebei', 'Shandong', 'Jiangnan', 'Sichuan', 'Guangdong', 'Fujian', 'Hunan', 'Shaanxi', 'Yunnan', 'Henan'],
  },
  {
    nom: 'Japon Heian', couleur: '#a83f6b', perso: 'opportuniste', capitale: [56, 14], nomCapitale: 'Yamato',
    provinces: ['Kantō', 'Mutsu', 'Shikoku', 'Kyūshū', 'Izumo', 'Echigo', 'Owari'],
  },
  {
    nom: 'Empire chola', couleur: '#b3812e', perso: 'marchand', capitale: [46, 21], nomCapitale: 'Tanjore',
    provinces: ['Pandya', 'Kerala', 'Ceylan', 'Vengi', 'Kalinga', 'Karnata', 'Andhra'],
  },
  {
    nom: 'Empire du Ghana', couleur: '#8e6c3a', perso: 'marchand', capitale: [30, 19], nomCapitale: 'Koumbi Saleh',
    provinces: ['Aoudaghost', 'Oualata', 'Djenné', 'Gao', 'Takrour', 'Sosso', 'Bambouk'],
  },
  {
    nom: 'Empire toltèque', couleur: '#b03a2e', perso: 'conquerant', capitale: [14, 18], nomCapitale: 'Tula',
    provinces: ['Cholula', 'Tulancingo', 'Culhuacán', 'Matlatzinca', 'Huastèque', 'Mixtèque', 'Zapotèque'],
  },
];

// Cités-états historiques : [nom, col, ligne]
const CITES_TERRE = [
  ['Venise', 34, 11],
  ['Novgorod', 37, 7],
  ['Palerme', 34, 13],
  ['Kilwa', 39, 26],
  ['Angkor', 50, 20],
  ['Cuzco', 19, 28],
  ['Cahokia', 16, 13],
];

// Noms de provinces pour les terres libres, par grande région du monde
// zone : [colMin, colMax, ligneMin, ligneMax]
const ZONES_NOMS_TERRE = [
  { zone: [3, 24, 2, 15], noms: ['Vinland', 'Athabasca', 'Iroquoisie', 'Ojibwé', 'Cri', 'Lakota', 'Shawnee', 'Alaska', 'Yukon', 'Huronie', 'Cherokee', 'Chinook', 'Navajo', 'Béothuk'] },
  { zone: [11, 22, 15, 22], noms: ['Anasazi', 'Comanche', 'Maya', 'Yucatán', 'Taïno', 'Caraïbe', 'Mixteca', 'Totonaque', 'Tarasque', 'Chichimèque'] },
  { zone: [15, 26, 21, 39], noms: ['Chimú', 'Tiwanaku', 'Moche', 'Quechua', 'Aymara', 'Mapuche', 'Guarani', 'Tupi', 'Chibcha', 'Nazca', 'Patagonie', 'Amazonie', 'Chaco'] },
  { zone: [28, 41, 2, 8], noms: ['Islande', 'Groenland', 'Laponie', 'Norvège', 'Suède', 'Danemark', 'Gotland', 'Finlande', 'Carélie', 'Estonie'] },
  { zone: [27, 38, 8, 14], noms: ['Pologne', 'Hongrie', 'Croatie', 'Serbie', 'Valachie', 'Moldavie', 'Lituanie', 'Prusse', 'Poméranie', 'Navarre', 'Sardaigne', 'Sicile', 'Naples', 'Rome', 'Toscane'] },
  { zone: [28, 44, 13, 19], noms: ['Fès', 'Marrakech', 'Tlemcen', 'Ifriqiya', 'Cyrénaïque', 'Nubie', 'Axoum', 'Adal', 'Hedjaz', 'Oman', 'Yémen', 'Nedjd', 'Sinaï', 'Palmyre'] },
  { zone: [28, 42, 19, 36], noms: ['Kanem', 'Bornou', 'Haoussa', 'Yoruba', 'Igbo', 'Kongo', 'Louba', 'Zoulou', 'Swahili', 'Madagascar', 'Zimbabwé', 'Kalahari', 'Namib', 'Le Cap'] },
  { zone: [38, 63, 2, 8], noms: ['Sibérie', 'Oural', 'Iakoutie', 'Toungouska', 'Kamtchatka', 'Bachkirie', 'Khanat bulgare', 'Petchénègues', 'Coumans', 'Khazarie'] },
  { zone: [38, 48, 8, 16], noms: ['Perse', 'Khorassan', 'Sogdiane', 'Kharezm', 'Boukhara', 'Samarcande', 'Ghazni', 'Kaboul', 'Arménie', 'Géorgie', 'Azerbaïdjan', 'Mésopotamie', 'Bagdad', 'Chiraz'] },
  { zone: [48, 60, 7, 15], noms: ['Mongolie', 'Ouïgourie', 'Tangoutes', 'Khitans', 'Mandchourie', 'Corée', 'Tibet', 'Kachgar', 'Dzoungarie', 'Gobi'] },
  { zone: [43, 55, 15, 24], noms: ['Bengale', 'Gujarat', 'Rajputana', 'Cachemire', 'Sind', 'Pendjab', 'Birmanie', 'Pagan', 'Siam', 'Dai Viet', 'Champa', 'Malacca', 'Sumatra', 'Java', 'Bornéo', 'Célèbes'] },
  { zone: [50, 63, 22, 38], noms: ['Arnhem', 'Kimberley', 'Pilbara', 'Nullarbor', 'Uluru', 'Queensland', 'Tasmanie', 'Aotearoa', 'Fidji', 'Papouasie', 'Mélanésie'] },
];

// ---- Prénoms dynastiques par puissance (an 1000) ----
const PRENOMS_TERRE = {
  'Royaume de France': ['Hugues', 'Robert', 'Philippe', 'Louis', 'Henri', 'Eudes', 'Charles'],
  'Saint-Empire': ['Otton', 'Henri', 'Conrad', 'Frédéric', 'Lothaire', 'Albert'],
  'Royaume d\'Angleterre': ['Æthelred', 'Edmond', 'Édouard', 'Harold', 'Guillaume', 'Alfred'],
  'Califat de Cordoue': ['Hichām', 'Abd al-Rahmān', 'Al-Mansūr', 'Sulaymān', 'Muhammad'],
  'Empire byzantin': ['Basile', 'Constantin', 'Romain', 'Nicéphore', 'Alexis', 'Jean'],
  'Califat fatimide': ['Al-Hākim', 'Al-Azīz', 'Al-Zāhir', 'Al-Mustansir', 'Al-Mu\'izz'],
  'Rus\' de Kiev': ['Vladimir', 'Iaroslav', 'Sviatoslav', 'Iziaslav', 'Oleg', 'Igor'],
  'Empire Song': ['Zhenzong', 'Renzong', 'Taizu', 'Taizong', 'Shenzong', 'Yingzong'],
  'Japon Heian': ['Ichijō', 'Sanjō', 'Go-Ichijō', 'Go-Suzaku', 'Go-Reizei', 'Shirakawa'],
  'Empire chola': ['Rājarāja', 'Rājendra', 'Kulottunga', 'Vikrama', 'Adhirajendra'],
  'Empire du Ghana': ['Tunka Manin', 'Bassi', 'Kaya Magan', 'Soumaba', 'Dinga'],
  'Empire toltèque': ['Topiltzin', 'Huemac', 'Matlacxochitl', 'Nauhyotl', 'Mitl'],
};

// (Les noms de zones sont copiés à chaque génération — voir game.js)
