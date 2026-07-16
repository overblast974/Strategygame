// ============================================================
// MODE TERRE HISTORIQUE — An 1000
// Carte du monde en hexagones, nations et provinces historiques
// ============================================================
'use strict';

// Légende : . mer | p plaine | f forêt | c colline | m montagne | d désert | t toundra
// 128 colonnes × 80 lignes (84°N → 56°S), générée depuis les contours réels
// des continents (polygones lon/lat), déserts et chaînes de montagnes réels.
const CARTE_TERRE = [
  '.................................ttttttttt......tttttttt........................................................................',
  '..............................ttttttttttttttttttttttttttttt......................................tt.............................',
  '...........................t..tttttttt..tttttttttttttttttt..........tttttt.......................tttt...........................',
  '.....................t.......t..tttt..ttttttttttttttttttt...........tt.t............................tt..........................',
  '.....................ttttt..tttttttt......ttttttttttttttt............................ttt........ttttttttt........ttt............',
  '...................ttt.......ttttttt.......tttttttttttttt..........................tt.........tttttttttt........................',
  '...................tttttttt.ttt.ttttt.......tttttttttttt...........................t.....t.ttttttttttttttttttt....tttt..........',
  '......ttttt...........ttttt..tt.ttttttt.....tttttttttttt................ttt........t...tttttttttttttttttttttttttttttttttt.......',
  '.....ttttttttttttttttttttttt.tttttf..ttt.....tttttttttt...............ttttffff.......ttttttttttttttttttttttttttttttttttttttttttt',
  'pp...tttttttttttttttttttttttttttttf.ttttt...tttttttt.................tttttfffftttttttttttttttttttttttttttttttttttttttttttttttttt',
  'ppp.ttttttffffffffttttttttttffffff..fftttt...tttttt.....ttt.........tttt.ffff.ttttffmmffffffttttffttttttffttttttttttfffffffftttt',
  '.....tttttffffffffttttttttttffff.ft...ttt....tttt.......tt.........tttttffffffttttffmmffffffttttffttttttffttttttttttfffffffftttt',
  '.....pffppffppffffffffffppfffff.....fff.......ttt.................ffppt.ttffffffffffppffppffffffffffffffppffffffffffffppfffffft.',
  '.....pffppffppffffffffffppffff......fff........t.................tffpp.tttffffffffffppffppffffffffffffffppffffffffffffp..ffff...',
  '.......fff.....pffffppfffffffff.....ffffff....................f...ffppp..pffffppffffmmffppffffppffppffffffffppffppf......f......',
  '.......f........ffffppffffffffff....ffffff...................ff....fpp.pppffffppffffmmffppffffppffppffffffffppffp......fff......',
  '......f..........pffmmffffppppfffff.ffffffff.................fff...pp.ffffppffppppffmmffppffffppppffffffffffffppf.......ff......',
  '................ppffmmffffppppffffffffffffff................ffff.fppppffffppffppppffmmffppffffppppffffffffffffppffp....ff.......',
  '..................ffmmmmmmppffppffppffppffff..................ffffffffppffffffffppppmmffffppffffppppppppffffffffffff....f.......',
  '..................ffmmmmmmppffppffppffppff.f...................fffffffppffffffffppppmmffffppffffppppppppfffffffffff.............',
  '....................ffffffppffffffffffffp..fff.................fffmmmmffffffffppppffffffffffppffffffffffffffmmppff..............',
  '...................fffffffppffffffffffffpp.....................fffmmmmffffffffppppffffffffffppffffffffffffffmmppf...............',
  '....................ppmmmmppffccppffffffff......................ccffppffppf.ffmmp.ppffppppmmmmddddddffccffppccppp..f............',
  '...................fppmmmmppffccppfffff.....................ppffc..fp.ffpp....mmp.ppffppppmmmmddddddffccffppccpp..f.............',
  '....................ccmmffppffffffffppf......................cccf..c.fffffffffppmm.fppppffmmmmddddddddddccffmmc...f.............',
  '...................fccmmffppffffffffp.......................cccc.....f.f.fffffppmm.fppppffmmmmddddddddddcc.fmm...pf.............',
  '....................ccmmmmppppffppfff........................cpp...c.f..f.ppffppcc.pffccppppddddffddddddffcc.cm..cc.............',
  '....................ccmmmmppppffppfff........................c.pffcc........ffppccppffccppppddddffddddddffc..c.mcc..............',
  '......................ffppddppppppppf........................cccccpp.........cppffddddccppmmmmppmmmmffppccc....cc...............',
  '......................ffppddppppppp.........................ccccccppp..p....ccppffddddccppmmmmppmmmmffppccc...c.................',
  '.......................dddddccccppp..........................dddddddppddddddppccmmddddppffmmmmccmmmmccppppff....................',
  '.......................dddddcc....p.........................ddddddddppddddddppccm.ddddppffmmmmccmmmmccppppf.....................',
  '.......................dddddpp.....p.......................dddddddddddddddddppppdd.mppccddccffffccccppppppp.....................',
  '.........................dddp.............................dddddddddddddddddd.pppdd.m.pccddccffffccccppppppp.....................',
  '..........................ppd.............................ppddddddddddddddddd.ddddccp...ffccccffffppppffff.p....................',
  '..........................ppd......p......................ppddddddddddddddddd.ddddccp...ffccccffffppppff........................',
  '........p.................ppff..p...c.c...................ccffddddddddddddddccccddddc.....ppccc..fpppp.p........................',
  '...........................pffffp.....c...................ccffddddddddddddddccccdddd......ppcc...fpppp..........................',
  '............................fffff.........................ffppccppffffppffccff.ddddd......pppp....ccppp....p....................',
  '..............................ffff.......................cffppccppffffppffccff.ddd........pp......ccppp...pp....................',
  '................................ppf.......................ppppppffppccffppppppppd..........cp......cffp....pp...................',
  '.................................p...ff...................ppppppffppccffppppppp.dd........cc.......cffp.....p...................',
  '..................................p..fffppp................pffffffppffffffffmmffppd........cc......f.f......f...................',
  '..................................ppffffppp................pffffffppffffffffmmffpp..........c......f.......ff...................',
  '....................................ffffffffp...............ffffppffppppffffffppff..................f.....f.f...................',
  '....................................ffffffffp.....................ffppppffffffppf.................fff...ff......................',
  '....................................ffmmffffff......................ffffffffffppp..................fff..ff......................',
  '...................................fffmmffffff.....................pffffffffffpp...................ff..pff.f.f..................',
  '...................................fppffffppffff...................pppffffffffff....................pp.pff.p...f................',
  '...................................fppffffppfffff..................pppffffffff......................pp.pf.p....fff..............',
  '...................................pffppppffppfffff.................ffppffppppf......................f.....f....ffpp..f.........',
  '...................................pffppppffppfffff.................ffppffpppp.......................f...........fpppp..........',
  '....................................ffmmffffppppffpp.................fppffffpp........................fff........ffff...........',
  '...................................pffmmffffppppffp.................ffppffffpp..............................p.......f...........',
  '....................................ppmmccffppffppf..................pppppppffp.................................................',
  '....................................ppmmccffppffpp..................ppppppppff...p............................ppf.f.............',
  '.....................................pmmppppppccpp..................ppppppccfff..c...........................pccp..p............',
  '.....................................pmmppppppccpp..................ppppppccff.fcc..........................ppccp.pp............',
  '.......................................mppppppccpp..................ddffppffcc..pp..........................ppppddffp...........',
  '.......................................mppppppccpp..................ddffppffc..fp.........................ddppppddffp...........',
  '.......................................pppffppffcc...................dddffccf...pp.......................cddddddffpppp.....c....',
  '......................................ppppffppff.....................dddffccf..fp.......................ccddddddffpppp..........',
  '.......................................pppffffp......................dddpppp....p........................pppddddddccccp.........',
  '......................................ppppffffp......................dddpppp............................ppppddddddccccp.........',
  '.......................................mppccccf.......................ddccpp.............................pddddffddppccc.........',
  '......................................mmppcccc........................ddccp..............................pddddffddppccc.........',
  '.......................................pppppcc.........................cccc..............................cffdd.dccccccc.........',
  '......................................ppppppc.........................ccc................................cff....cccccc..........',
  '......................................mmccpp......................................................................ffpp..........',
  '.....................................pmmccpp......................................................................ffp.........p.',
  '......................................mmcc....................................................................................pp',
  '.....................................mmmcc..........................................................................f........pp.',
  '......................................mmp...........................................................................f........p..',
  '.....................................mmmp..................................................................................pp...',
  '.....................................mmm....................................................................................p...',
  '.....................................mmm........................................................................................',
  '.....................................mff........................................................................................',
  '.....................................mf...m.....................................................................................',
  '......................................ff........................................................................................',
  '......................................ff........................................................................................',
];
const TERRE_W = 128;
const TERRE_H = 80;
const CODE_TERRAIN = { p: 'plaine', f: 'foret', c: 'colline', m: 'montagne', d: 'desert', t: 'toundra', '.': 'eau' };

// Les 12 puissances de l'an 1000. capitale : [col, ligne] approximatifs
// (si la case est en mer, la terre la plus proche est utilisée).
const NATIONS_TERRE = [
  {
    nom: 'Royaume de France', couleur: '#2d5bd1', perso: 'diplomate', capitale: [64, 20], nomCapitale: 'Île-de-France',
    provinces: [['Normandie', 64, 19], ['Bretagne', 63, 20], ['Anjou', 64, 20], ['Aquitaine', 64, 22], ['Gascogne', 64, 22], ['Toulouse', 64, 23], ['Provence', 65, 23], ['Bourgogne', 66, 20], ['Champagne', 65, 20], ['Flandre', 65, 18]],
  },
  {
    nom: 'Saint-Empire', couleur: '#c8a015', perso: 'expansionniste', capitale: [68, 18], nomCapitale: 'Saxe',
    provinces: [['Bavière', 68, 20], ['Souabe', 67, 20], ['Franconie', 67, 19], ['Lorraine', 65, 19], ['Bohême', 68, 19], ['Carinthie', 68, 21], ['Frise', 66, 17], ['Thuringe', 68, 18], ['Lombardie', 67, 21], ['Autriche', 70, 20]],
  },
  {
    nom: 'Royaume d\'Angleterre', couleur: '#c0392b', perso: 'opportuniste', capitale: [62, 18], nomCapitale: 'Wessex',
    provinces: [['Mercie', 63, 17], ['Northumbrie', 63, 17], ['Est-Anglie', 64, 17], ['Kent', 64, 18], ['Cornouailles', 62, 19], ['Galles', 62, 18], ['Écosse', 62, 15], ['Irlande', 61, 17]],
  },
  {
    nom: 'Califat de Cordoue', couleur: '#1e8449', perso: 'savant', capitale: [62, 26], nomCapitale: 'Cordoue',
    provinces: [['Séville', 62, 26], ['Grenade', 62, 26], ['Tolède', 62, 25], ['Valence', 63, 25], ['Saragosse', 63, 24], ['Léon', 61, 23], ['Castille', 62, 23], ['Algarve', 61, 26]],
  },
  {
    nom: 'Empire byzantin', couleur: '#7d3c98', perso: 'diplomate', capitale: [74, 24], nomCapitale: 'Constantinople',
    provinces: [['Anatolie', 75, 25], ['Thrace', 73, 24], ['Macédoine', 72, 24], ['Morée', 72, 26], ['Chypre', 75, 27], ['Trébizonde', 78, 24], ['Épire', 71, 25], ['Bulgarie', 72, 23], ['Crète', 72, 27], ['Antioche', 76, 27]],
  },
  {
    nom: 'Califat fatimide', couleur: '#117a65', perso: 'marchand', capitale: [74, 30], nomCapitale: 'Le Caire',
    provinces: [['Alexandrie', 74, 30], ['Damas', 77, 28], ['Jérusalem', 76, 29], ['La Mecque', 77, 35], ['Barqa', 70, 29], ['Assouan', 75, 34], ['Kairouan', 67, 27], ['Tripoli', 68, 29]],
  },
  {
    nom: 'Rus\' de Kiev', couleur: '#5d6d7e', perso: 'expansionniste', capitale: [74, 20], nomCapitale: 'Kiev',
    provinces: [['Tchernigov', 75, 18], ['Smolensk', 75, 16], ['Polotsk', 74, 16], ['Volhynie', 73, 18], ['Riazan', 78, 16], ['Souzdal', 78, 15], ['Pereïaslav', 74, 19], ['Galicie', 72, 19]],
  },
  {
    nom: 'Empire Song', couleur: '#d35400', perso: 'savant', capitale: [104, 28], nomCapitale: 'Kaifeng',
    provinces: [['Hebei', 105, 26], ['Shandong', 105, 27], ['Jiangnan', 106, 29], ['Sichuan', 101, 30], ['Guangdong', 104, 34], ['Fujian', 106, 33], ['Hunan', 104, 31], ['Shaanxi', 103, 28], ['Yunnan', 100, 33], ['Henan', 104, 28]],
  },
  {
    nom: 'Japon Heian', couleur: '#a83f6b', perso: 'opportuniste', capitale: [112, 28], nomCapitale: 'Yamato',
    provinces: [['Kantō', 113, 27], ['Mutsu', 114, 26], ['Shikoku', 111, 28], ['Kyūshū', 110, 29], ['Izumo', 111, 27], ['Echigo', 113, 26], ['Owari', 112, 27]],
  },
  {
    nom: 'Empire chola', couleur: '#b3812e', perso: 'marchand', capitale: [92, 42], nomCapitale: 'Tanjore',
    provinces: [['Pandya', 92, 42], ['Kerala', 91, 42], ['Ceylan', 92, 43], ['Vengi', 93, 38], ['Kalinga', 94, 36], ['Karnata', 91, 40], ['Andhra', 92, 38]],
  },
  {
    nom: 'Empire du Ghana', couleur: '#8e6c3a', perso: 'marchand', capitale: [60, 38], nomCapitale: 'Koumbi Saleh',
    provinces: [['Aoudaghost', 60, 37], ['Oualata', 61, 38], ['Djenné', 62, 40], ['Gao', 64, 38], ['Takrour', 58, 38], ['Sosso', 60, 41], ['Bambouk', 60, 40]],
  },
  {
    nom: 'Empire toltèque', couleur: '#b03a2e', perso: 'conquerant', capitale: [28, 36], nomCapitale: 'Tula',
    provinces: [['Cholula', 28, 37], ['Tulancingo', 29, 36], ['Culhuacán', 28, 36], ['Matlatzinca', 28, 36], ['Huastèque', 28, 35], ['Mixtèque', 29, 38], ['Zapotèque', 30, 38]],
  },
];

// Cités-états historiques : [nom, col, ligne]
const CITES_TERRE = [
  ['Venise', 68, 22],
  ['Novgorod', 74, 14],
  ['Palerme', 68, 26],
  ['Kilwa', 78, 52],
  ['Angkor', 100, 40],
  ['Cuzco', 38, 56],
  ['Cahokia', 32, 26],
];

// Noms de provinces pour les terres libres, par grande région du monde
// zone : [colMin, colMax, ligneMin, ligneMax]
const ZONES_NOMS_TERRE = [
  { zone: [6, 49, 4, 31], noms: ['Vinland', 'Athabasca', 'Iroquoisie', 'Ojibwé', 'Cri', 'Lakota', 'Shawnee', 'Alaska', 'Yukon', 'Huronie', 'Cherokee', 'Chinook', 'Navajo', 'Béothuk'] },
  { zone: [22, 45, 30, 45], noms: ['Anasazi', 'Comanche', 'Maya', 'Yucatán', 'Taïno', 'Caraïbe', 'Mixteca', 'Totonaque', 'Tarasque', 'Chichimèque'] },
  { zone: [30, 53, 42, 79], noms: ['Chimú', 'Tiwanaku', 'Moche', 'Quechua', 'Aymara', 'Mapuche', 'Guarani', 'Tupi', 'Chibcha', 'Nazca', 'Patagonie', 'Amazonie', 'Chaco'] },
  { zone: [56, 83, 4, 17], noms: ['Islande', 'Groenland', 'Laponie', 'Norvège', 'Suède', 'Danemark', 'Gotland', 'Finlande', 'Carélie', 'Estonie'] },
  { zone: [56, 66, 14, 21], noms: ['Ulster', 'Munster', 'Connacht', 'Strathclyde', 'Man', 'Orcades', 'Hébrides'] },
  { zone: [66, 74, 21, 27], noms: ['Rome', 'Toscane', 'Naples', 'Sicile', 'Sardaigne', 'Ombrie', 'Ligurie', 'Corse'] },
  { zone: [54, 77, 16, 29], noms: ['Pologne', 'Hongrie', 'Croatie', 'Serbie', 'Valachie', 'Moldavie', 'Lituanie', 'Prusse', 'Poméranie', 'Navarre'] },
  { zone: [56, 89, 28, 39], noms: ['Fès', 'Marrakech', 'Tlemcen', 'Ifriqiya', 'Cyrénaïque', 'Nubie', 'Axoum', 'Adal', 'Hedjaz', 'Oman', 'Yémen', 'Nedjd', 'Sinaï', 'Palmyre'] },
  { zone: [56, 85, 38, 73], noms: ['Kanem', 'Bornou', 'Haoussa', 'Yoruba', 'Igbo', 'Kongo', 'Louba', 'Zoulou', 'Swahili', 'Madagascar', 'Zimbabwé', 'Kalahari', 'Namib', 'Le Cap'] },
  { zone: [76, 127, 4, 17], noms: ['Sibérie', 'Oural', 'Iakoutie', 'Toungouska', 'Kamtchatka', 'Bachkirie', 'Khanat bulgare', 'Petchénègues', 'Coumans', 'Khazarie'] },
  { zone: [76, 97, 16, 33], noms: ['Perse', 'Khorassan', 'Sogdiane', 'Kharezm', 'Boukhara', 'Samarcande', 'Ghazni', 'Kaboul', 'Arménie', 'Géorgie', 'Azerbaïdjan', 'Mésopotamie', 'Bagdad', 'Chiraz'] },
  { zone: [96, 121, 14, 31], noms: ['Mongolie', 'Ouïgourie', 'Tangoutes', 'Khitans', 'Mandchourie', 'Corée', 'Tibet', 'Kachgar', 'Dzoungarie', 'Gobi'] },
  { zone: [86, 111, 30, 49], noms: ['Bengale', 'Gujarat', 'Rajputana', 'Cachemire', 'Sind', 'Pendjab', 'Birmanie', 'Pagan', 'Siam', 'Dai Viet', 'Champa', 'Malacca', 'Sumatra', 'Java', 'Bornéo', 'Célèbes'] },
  { zone: [100, 127, 44, 77], noms: ['Arnhem', 'Kimberley', 'Pilbara', 'Nullarbor', 'Uluru', 'Queensland', 'Tasmanie', 'Aotearoa', 'Fidji', 'Papouasie', 'Mélanésie'] },
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
