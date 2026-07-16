// ============================================================
// MOTEUR DE JEU — État, génération de carte, économie, combat,
// diplomatie, technologie, événements, sauvegarde
// ============================================================
'use strict';

let MAP_W = 22;
let MAP_H = 26;
const ANNEE_DEPART = 1000;

let G = null; // état global de la partie

// ---------- Utilitaires ----------
function rand(n) { return Math.floor(Math.random() * n); }
function randF(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[rand(arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function nomProvince() {
  return pick(SYLLABES_A) + pick(SYLLABES_B) + pick(SYLLABES_C);
}

// Coordonnées axiales pour hexagones (offset "odd-r")
function voisinsHex(col, row) {
  const impair = row % 2 === 1;
  const deltas = impair
    ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const res = [];
  for (const [dc, dr] of deltas) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < MAP_W && r >= 0 && r < MAP_H) res.push(r * MAP_W + c);
  }
  return res;
}

// ---------- Génération de la carte (monde façon Terre) ----------
// Continents = somme de "masses continentales" gaussiennes, séparées par des océans.
// Climat par latitude : toundra aux pôles, déserts vers l'équateur.
function genererCarte() {
  // 1. Relief : masses continentales espacées les unes des autres,
  //    pour dessiner de vrais continents séparés par des océans
  const nbContinents = 5 + rand(3);
  const blobs = [];
  for (let i = 0; i < nbContinents; i++) {
    let meilleur = null, meilleureDist = -1;
    for (let essai = 0; essai < 40; essai++) {
      const cand = {
        x: 3.5 + Math.random() * (MAP_W - 7),
        y: 3 + Math.random() * (MAP_H - 6),
        rayon: 2.2 + Math.random() * 2.4,
        amp: 0.85 + Math.random() * 0.4,
      };
      let dMin = Infinity;
      for (const b of blobs) dMin = Math.min(dMin, Math.hypot(cand.x - b.x, cand.y - b.y));
      if (blobs.length === 0) dMin = 100;
      if (dMin > meilleureDist) { meilleureDist = dMin; meilleur = cand; }
    }
    blobs.push(meilleur);
  }
  const elevation = (c, r) => {
    let e = 0;
    for (const b of blobs) {
      const d2 = (c - b.x) ** 2 + (r - b.y) ** 2;
      e += b.amp * Math.exp(-d2 / (2 * b.rayon * b.rayon));
    }
    return e + (Math.random() - 0.5) * 0.18;
  };

  const provinces = [];
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const id = r * MAP_W + c;
      const bord = c === 0 || r === 0 || c === MAP_W - 1 || r === MAP_H - 1;
      const e = bord ? 0 : elevation(c, r);
      const lat = Math.abs(r - (MAP_H - 1) / 2) / ((MAP_H - 1) / 2); // 0 = équateur, 1 = pôle

      let terrain;
      if (e < 0.54) {
        terrain = 'eau';
      } else if (e > 1.0 && Math.random() < 0.7) {
        terrain = 'montagne';
      } else if (lat > 0.78) {
        terrain = Math.random() < 0.75 ? 'toundra' : 'foret';
      } else if (lat < 0.28 && Math.random() < 0.5) {
        terrain = 'desert';
      } else {
        const roll = Math.random();
        terrain = roll < 0.36 ? 'plaine' : roll < 0.62 ? 'foret' : roll < 0.85 ? 'colline' : 'montagne';
      }
      provinces.push({
        id, col: c, row: r, terrain,
        nom: terrain === 'eau' ? '' : nomProvince(),
        proprietaire: -1,          // -1 = indépendant, sinon id de nation
        troupes: 0,
        armee: armeeVide(),
        aBouge: false,             // l'armée a déjà agi ce tour
        batiments: batimentsVides(),
        gisements: [],
        pop: 0,
        focus: 'equilibre',
        capitale: false,
        citeEtat: false,
      });
    }
  }
  // Lissage : supprimer les îlots d'une case et les lacs d'une case
  for (const p of provinces) {
    if (p.col === 0 || p.row === 0 || p.col === MAP_W - 1 || p.row === MAP_H - 1) continue;
    const vEau = voisinsHex(p.col, p.row).filter(i => provinces[i].terrain === 'eau').length;
    const vTot = voisinsHex(p.col, p.row).length;
    if (p.terrain === 'eau' && vEau === 0 && Math.random() < 0.6) {
      p.terrain = 'plaine'; p.nom = nomProvince();
    } else if (p.terrain !== 'eau' && vEau === vTot && Math.random() < 0.5) {
      p.terrain = 'eau'; p.nom = '';
    }
  }
  // Gisements : chaque terre peut receler 0 à 2 ressources selon son terrain.
  // Population initiale : les terres fertiles sont plus peuplées.
  for (const p of provinces) {
    if (p.terrain === 'eau') continue;
    for (const [bien, prob] of (GISEMENTS_PAR_TERRAIN[p.terrain] || [])) {
      if (Math.random() < prob) p.gisements.push(bien);
    }
    p.pop = (p.terrain === 'plaine' ? 6 : p.terrain === 'toundra' || p.terrain === 'desert' ? 3 : 4) + rand(4);
  }
  return provinces;
}

function batimentsVides() {
  return Object.fromEntries(Object.keys(BATIMENTS).map(k => [k, 0]));
}

// ---------- Population & emplacements ----------
function estCotiere(p) {
  return voisinsHex(p.col, p.row).some(i => G.provinces[i].terrain === 'eau');
}

function capaciteProvince(p) {
  return 10 + p.batiments.ferme * 4 + (p.capitale ? 5 : 0);
}

// Rendement du travail : une province dépeuplée produit moins
function facteurTravail(p) {
  return clamp(p.pop / 8, 0.25, 1);
}

// Multiplicateur de spécialisation : +50 % sur la voie choisie, −25 % ailleurs
const FOCUS_CATEGORIES = { agricole: 'nourriture', minier: 'marchandise', lettre: 'science', commercant: 'or' };
function focusMult(p, categorie) {
  if (!p.focus || p.focus === 'equilibre') return 1;
  return FOCUS_CATEGORIES[p.focus] === categorie ? 1.5 : 0.75;
}

function definirFocus(pid, focus) {
  const p = G.provinces[pid];
  if (!FOCUS_PROVINCE[focus]) return { ok: false };
  p.focus = focus;
  return { ok: true };
}

// ---------- Doctrines nationales ----------
function choisirDoctrine(nid, doctrine) {
  const n = nation(nid);
  if (!DOCTRINES[doctrine]) return { ok: false };
  if (n.doctrine === doctrine) return { ok: false };
  if (G.tour - n.doctrineTour < DELAI_DOCTRINE) {
    return { ok: false, raison: `Changement possible dans ${DELAI_DOCTRINE - (G.tour - n.doctrineTour)} tours` };
  }
  n.doctrine = doctrine;
  n.doctrineTour = G.tour;
  journal(`${DOCTRINES[doctrine].icone} ${n.nom} adopte la doctrine ${DOCTRINES[doctrine].nom.toLowerCase()}.`);
  return { ok: true };
}

// ---------- Dynasties ----------
function chiffreRomain(n) {
  const t = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return t[Math.min(n, 12)] || String(n);
}

function prenomsDynastie(nid) {
  const n = nation(nid);
  return (typeof PRENOMS_TERRE !== 'undefined' && PRENOMS_TERRE[n.nom]) || PRENOMS_GENERIQUES;
}

// Crée un personnage : nom numéroté (Hugues II…), âge, trois compétences
function creerPersonnage(nid, age) {
  const n = nation(nid);
  if (!n.numerotation) n.numerotation = {};
  const prenom = pick(prenomsDynastie(nid));
  n.numerotation[prenom] = (n.numerotation[prenom] || 0) + 1;
  const numero = n.numerotation[prenom];
  return {
    nom: numero > 1 ? `${prenom} ${chiffreRomain(numero)}` : prenom,
    age,
    martial: 1 + rand(9),
    diplomatie: 1 + rand(9),
    intendance: 1 + rand(9),
  };
}

function initDynastie(nid) {
  const n = nation(nid);
  n.dirigeant = creerPersonnage(nid, 25 + rand(25));
  n.heritiers = Math.random() < 0.6 ? [creerPersonnage(nid, rand(15))] : [];
  n.mariages = [];
}

// Vieillissement, naissances et morts — appelé chaque tour pour chaque nation
function vivreDynastie(nid, annees) {
  const n = nation(nid);
  if (!n.dirigeant) return;
  n.dirigeant.age += annees;
  for (const h of n.heritiers) h.age += annees;

  // Naissance d'un héritier
  if (n.dirigeant.age >= 18 && n.dirigeant.age <= 52 && n.heritiers.length < MAX_HERITIERS &&
      Math.random() < 0.12 * (annees / 10 + 0.4)) {
    const h = creerPersonnage(nid, 0);
    n.heritiers.push(h);
    if (n.joueur) journal(`👶 Naissance à la cour : ${h.nom} rejoint la lignée.`);
  }

  // Mort du souverain (l'âge ne pardonne pas)
  const risque = Math.max(0.004, (n.dirigeant.age - 48) * 0.011) * (annees / 10 + 0.4);
  if (Math.random() < risque) {
    const defunt = n.dirigeant;
    const majeurs = n.heritiers.filter(h => h.age >= AGE_MAJORITE);
    if (majeurs.length > 0) {
      n.dirigeant = majeurs[0];
      n.heritiers = n.heritiers.filter(h => h !== majeurs[0]);
      journal(`⚰️ ${defunt.nom} de ${n.nom} s'éteint à ${defunt.age} ans. ${n.dirigeant.nom} monte sur le trône.`);
      if (n.joueur) {
        G.message = {
          titre: `⚰️ Mort de ${defunt.nom}`,
          texte: `Votre souverain s'éteint à ${defunt.age} ans. ${n.dirigeant.nom} (${n.dirigeant.age} ans) est couronné — ` +
            `🗡️ ${n.dirigeant.martial} · 🕊️ ${n.dirigeant.diplomatie} · 💰 ${n.dirigeant.intendance}. Longue vie au nouveau règne !`,
        };
      }
    } else {
      // Pas d'héritier majeur : crise de succession, un régent prend le pouvoir
      n.dirigeant = creerPersonnage(nid, 30 + rand(20));
      n.stabilite = clamp(n.stabilite - 15, 0, 100);
      journal(`⚰️ ${defunt.nom} de ${n.nom} meurt sans héritier majeur ! ${n.dirigeant.nom} s'impose dans la crise.`);
      if (n.joueur) {
        G.message = {
          titre: '⚠️ Crise de succession !',
          texte: `${defunt.nom} meurt sans héritier en âge de régner. ${n.dirigeant.nom} s'empare du pouvoir dans la confusion (−15 stabilité).`,
        };
      }
    }
  }
}

// Mariage royal entre deux dynasties : grande amitié durable
function mariageRoyal(a, b) {
  const na = nation(a), nb = nation(b);
  if (na.mariages.includes(b)) return { ok: false, raison: 'Vos dynasties sont déjà unies' };
  if (enGuerre(a, b)) return { ok: false, raison: 'Impossible en temps de guerre' };
  if (!nationsEnContact(a, b)) return { ok: false, raison: RAISON_CONTACT };
  const aUnHeritier = na.heritiers.some(h => h.age >= AGE_MAJORITE) || nb.heritiers.some(h => h.age >= AGE_MAJORITE);
  if (!aUnHeritier) return { ok: false, raison: 'Aucun héritier en âge de se marier (16 ans) dans les deux cours' };
  if (!nb.joueur && nb.relations[a] < 0) {
    return { ok: false, raison: `${nb.nom} refuse d'unir sa lignée à la vôtre (relations trop froides).` };
  }
  na.mariages.push(b);
  nb.mariages.push(a);
  modifierRelation(a, b, 30);
  na.stabilite = clamp(na.stabilite + 5, 0, 100);
  nb.stabilite = clamp(nb.stabilite + 5, 0, 100);
  journal(`💍 Mariage royal ! Les dynasties de ${na.nom} et ${nb.nom} sont unies.`);
  return { ok: true };
}

// ---------- Marine de guerre ----------
function construireNavires(nid, quantite) {
  const n = nation(nid);
  if (nbPorts(nid) < 1) return { ok: false, raison: 'Un port est requis' };
  const or_ = COUT_NAVIRE.or * quantite, bois = COUT_NAVIRE.bois * quantite;
  if (n.or < or_) return { ok: false, raison: 'Or insuffisant' };
  if (n.marchandises.bois < bois) return { ok: false, raison: `Bois insuffisant (${bois} 🪵)` };
  n.or -= or_;
  n.marchandises.bois -= bois;
  n.flotte += quantite;
  return { ok: true };
}

// La nation nid subit-elle un blocus ? (ennemi en guerre avec flotte très supérieure)
function subitBlocus(nid) {
  const n = nation(nid);
  for (const eid of n.guerres) {
    const e = nation(eid);
    if (e.vivante && e.flotte > n.flotte * 1.5 && e.flotte >= 3) return eid;
  }
  return -1;
}

function emplacementsUtilises(p) {
  return Object.values(p.batiments).filter(n => n > 0).length;
}

function emplacementsMax(p) {
  return EMPLACEMENTS_PROVINCE + (p.capitale ? 1 : 0);
}

// Rendre des soldats à la vie civile
function demobiliser(pid, n) {
  const p = G.provinces[pid];
  n = Math.min(n, p.troupes);
  if (n <= 0) return { ok: false, raison: 'Aucune troupe' };
  retirerUnites(p, n);
  p.pop = Math.min(capaciteProvince(p) + 5, p.pop + n);
  return { ok: true, rendus: n };
}

// ---------- Transport naval entre ports ----------
function transporterTroupes(source, cible, quantite) {
  const s = G.provinces[source], c = G.provinces[cible];
  if (s.proprietaire !== c.proprietaire) return { ok: false };
  if (s.batiments.port < 1 || c.batiments.port < 1) return { ok: false, raison: 'Deux ports requis' };
  if (s.aBouge) return { ok: false, raison: 'Cette armée a déjà agi ce tour' };
  if (quantite >= s.troupes) return { ok: false, raison: 'Une garnison doit rester' };
  ajouterArmee(c, extraireArmee(s, quantite));
  s.aBouge = true;
  journal(`🚢 ${nation(s.proprietaire).nom} transporte ${quantite} troupes de ${s.nom} à ${c.nom} par la mer.`);
  return { ok: true };
}

function placerNations(provinces, nations) {
  const terres = provinces.filter(p => p.terrain !== 'eau');
  // Choisir des capitales éloignées les unes des autres
  const capitales = [];
  for (let n = 0; n < nations.length; n++) {
    let meilleure = null, meilleureDist = -1;
    for (let essai = 0; essai < 120; essai++) {
      const cand = pick(terres);
      if (cand.proprietaire !== -1) continue;
      // La capitale doit avoir au moins 3 voisins terrestres libres
      const voisinsLibres = voisinsHex(cand.col, cand.row)
        .filter(i => provinces[i].terrain !== 'eau' && provinces[i].proprietaire === -1).length;
      if (voisinsLibres < 3) continue;
      let dMin = Infinity;
      for (const cap of capitales) {
        const d = Math.hypot(cand.col - cap.col, cand.row - cap.row);
        dMin = Math.min(dMin, d);
      }
      if (capitales.length === 0) dMin = 100;
      if (dMin > meilleureDist) { meilleureDist = dMin; meilleure = cand; }
    }
    if (!meilleure) meilleure = terres.find(p => p.proprietaire === -1);
    meilleure.proprietaire = n;
    meilleure.capitale = true;
    meilleure.armee = { inf: 8, choc: 2, siege: 0 };
    majTroupes(meilleure);
    meilleure.batiments.fort = 1;
    meilleure.pop = 12;
    capitales.push(meilleure);
  }
  // Premier anneau garanti autour de chaque capitale
  for (let n = 0; n < nations.length; n++) {
    const cap = capitales[n];
    for (const vid of voisinsHex(cap.col, cap.row)) {
      const v = provinces[vid];
      if (v.terrain !== 'eau' && v.proprietaire === -1) {
        v.proprietaire = n;
        v.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
        majTroupes(v);
      }
    }
  }
  // Expansion : chaque nation revendique quelques provinces supplémentaires
  for (let vague = 0; vague < 2; vague++) {
    for (let n = 0; n < nations.length; n++) {
      const miennes = provinces.filter(p => p.proprietaire === n);
      for (const p of miennes) {
        for (const vid of voisinsHex(p.col, p.row)) {
          const v = provinces[vid];
          if (v.terrain !== 'eau' && v.proprietaire === -1 && Math.random() < 0.35) {
            v.proprietaire = n;
            v.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
            majTroupes(v);
          }
        }
      }
    }
  }
  // Provinces indépendantes restantes : petite garnison
  for (const p of provinces) {
    if (p.terrain !== 'eau' && p.proprietaire === -1) {
      p.armee = { inf: 3 + rand(4), choc: 0, siege: 0 };
      majTroupes(p);
    }
  }
  // Cités-états : indépendantes, riches et fortifiées — annexables par la négociation
  const libres = provinces.filter(p => p.terrain !== 'eau' && p.proprietaire === -1 && !['montagne', 'toundra'].includes(p.terrain));
  const nomsCites = [...NOMS_CITES];
  for (let i = 0; i < NB_CITES_ETATS && libres.length; i++) {
    const p = libres.splice(rand(libres.length), 1)[0];
    p.citeEtat = true;
    p.nom = nomsCites.length ? nomsCites.splice(rand(nomsCites.length), 1)[0] : p.nom;
    p.armee = { inf: 7 + rand(5), choc: 2, siege: 0 };
    majTroupes(p);
    p.batiments.fort = 1;
    p.batiments.marche = 1;
    p.pop = 12;
  }
}

// ---------- Génération du monde historique (Terre, an 1000) ----------
function genererCarteTerre() {
  const provinces = [];
  for (let r = 0; r < TERRE_H; r++) {
    const ligne = (CARTE_TERRE[r] || '').padEnd(TERRE_W, '.');
    for (let c = 0; c < TERRE_W; c++) {
      const id = r * MAP_W + c;
      const terrain = CODE_TERRAIN[ligne[c]] || 'eau';
      provinces.push({
        id, col: c, row: r, terrain,
        nom: '',
        proprietaire: -1,
        troupes: 0,
        armee: armeeVide(),
        aBouge: false,
        batiments: batimentsVides(),
        gisements: [],
        pop: 0,
        focus: 'equilibre',
        capitale: false,
        citeEtat: false,
      });
    }
  }
  for (const p of provinces) {
    if (p.terrain === 'eau') continue;
    for (const [bien, prob] of (GISEMENTS_PAR_TERRAIN[p.terrain] || [])) {
      if (Math.random() < prob) p.gisements.push(bien);
    }
    p.pop = (p.terrain === 'plaine' ? 6 : p.terrain === 'toundra' || p.terrain === 'desert' ? 3 : 4) + rand(4);
  }
  return provinces;
}

// Terre libre la plus proche d'une coordonnée cible
function terreProche(provinces, col, ligne) {
  let best = null, bestD = Infinity;
  for (const p of provinces) {
    if (p.terrain === 'eau' || p.proprietaire !== -1 || p.citeEtat) continue;
    const d = Math.hypot(p.col - col, p.row - ligne);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function placerNationsTerre(provinces, nations) {
  // Capitales historiques
  const capitales = [];
  for (let n = 0; n < nations.length; n++) {
    const def = NATIONS_TERRE[n];
    const cap = terreProche(provinces, def.capitale[0], def.capitale[1]);
    cap.proprietaire = n;
    cap.capitale = true;
    cap.nom = def.nomCapitale;
    cap.armee = { inf: 8, choc: 2, siege: 0 };
    majTroupes(cap);
    cap.batiments.fort = 1;
    cap.pop = 12;
    capitales.push(cap);
  }
  // Provinces historiques : nommées et revendiquées à leurs coordonnées réelles
  for (let n = 0; n < nations.length; n++) {
    for (const [nomProv, pc, pl] of NATIONS_TERRE[n].provinces) {
      const p = terreProche(provinces, pc, pl);
      if (!p || Math.hypot(p.col - pc, p.row - pl) > 3) continue;
      p.proprietaire = n;
      p.nom = nomProv;
      p.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
      majTroupes(p);
    }
  }
  // Premier anneau garanti + expansion
  for (let n = 0; n < nations.length; n++) {
    for (const vid of voisinsHex(capitales[n].col, capitales[n].row)) {
      const v = provinces[vid];
      if (v.terrain !== 'eau' && v.proprietaire === -1) {
        v.proprietaire = n;
        v.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
        majTroupes(v);
      }
    }
  }
  for (let vague = 0; vague < 2; vague++) {
    for (let n = 0; n < nations.length; n++) {
      for (const p of provinces.filter(x => x.proprietaire === n)) {
        for (const vid of voisinsHex(p.col, p.row)) {
          const v = provinces[vid];
          if (v.terrain !== 'eau' && v.proprietaire === -1 && Math.random() < 0.4) {
            v.proprietaire = n;
            v.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
            majTroupes(v);
          }
        }
      }
    }
  }
  // Minimum territorial : chaque puissance revendique au moins 8 provinces
  for (let n = 0; n < nations.length; n++) {
    let miennes = provinces.filter(p => p.proprietaire === n);
    let garde = 0;
    while (miennes.length < 8 && garde++ < 25) {
      let best = null, bestD = Infinity;
      for (const libre of provinces) {
        if (libre.terrain === 'eau' || libre.proprietaire !== -1 || libre.citeEtat) continue;
        for (const m of miennes) {
          const d = Math.hypot(libre.col - m.col, libre.row - m.row);
          if (d < bestD) { bestD = d; best = libre; }
        }
      }
      if (!best) break;
      best.proprietaire = n;
      best.armee = { inf: 2 + rand(3), choc: 0, siege: 0 };
      majTroupes(best);
      miennes = provinces.filter(p => p.proprietaire === n);
    }
  }
  // Cités-états historiques
  for (const [nom, c, l] of CITES_TERRE) {
    const p = terreProche(provinces, c, l);
    if (!p) continue;
    p.proprietaire = -1;
    p.citeEtat = true;
    p.nom = nom;
    p.armee = { inf: 7 + rand(5), choc: 2, siege: 0 };
    majTroupes(p);
    p.batiments.fort = 1;
    p.batiments.marche = 1;
    p.pop = 12;
  }
  // Terres libres : garnisons + noms régionaux historiques
  const zones = ZONES_NOMS_TERRE.map(z => ({ zone: z.zone, noms: [...z.noms] }));
  const nomRegional = (col, ligne) => {
    for (const z of zones) {
      const [c1, c2, l1, l2] = z.zone;
      if (col >= c1 && col <= c2 && ligne >= l1 && ligne <= l2 && z.noms.length) {
        return z.noms.splice(rand(z.noms.length), 1)[0];
      }
    }
    return nomProvince();
  };
  for (const p of provinces) {
    if (p.terrain === 'eau') continue;
    if (p.proprietaire === -1 && !p.citeEtat && p.troupes === 0) {
      p.armee = { inf: 3 + rand(4), choc: 0, siege: 0 };
      majTroupes(p);
    }
    if (!p.nom) p.nom = nomRegional(p.col, p.row);
  }
}

// ---------- Nouvelle partie ----------
function nouvellePartie(nationJoueur, mode = 'terre') {
  let defs;
  if (mode === 'terre') {
    MAP_W = TERRE_W;
    MAP_H = TERRE_H;
    defs = NATIONS_TERRE;
  } else {
    MAP_W = 22; // dimensions du monde procédural
    MAP_H = 26;
    defs = NATIONS_DEFS;
  }
  const nations = defs.map((def, i) => ({
    id: i,
    nom: def.nom,
    couleur: def.couleur,
    perso: def.perso,
    joueur: i === nationJoueur,
    vivante: true,
    or: 100,
    nourriture: 160,
    science: 0,
    stabilite: 70,
    ere: 0,
    ascension: 0,           // progression du projet final
    ascensionActive: false,
    vassalDe: -1,
    relations: defs.map((_, j) => (i === j ? 100 : rand(21) - 10)),
    alliances: [],
    pactes: [],
    guerres: [],
    accords: [],            // accords commerciaux
    marchandises: { bois: 30, fer: 20, pierre: 20, epices: 10 },
    flotte: 0,
    doctrine: null,
    doctrineTour: -99,
  }));

  const provinces = mode === 'terre' ? genererCarteTerre() : genererCarte();
  if (mode === 'terre') placerNationsTerre(provinces, nations);
  else placerNations(provinces, nations);

  G = {
    tour: 1,
    annee: ANNEE_DEPART,
    provinces,
    nations,
    joueur: nationJoueur,
    journal: [],
    fini: false,
    message: null,
    marche: Object.fromEntries(Object.entries(MARCHANDISES).map(([k, m]) => [k, { prix: m.prixBase }])),
    mercenaires: [],
    mapW: MAP_W,
    mapH: MAP_H,
    mode,
  };
  genererMercenaires();
  for (const n of nations) initDynastie(n.id);
  journal(`⚑ L'an ${G.annee}. ${nations[nationJoueur].nom} entre dans l'Histoire.`);
  return G;
}

function journal(txt) {
  G.journal.unshift({ tour: G.tour, txt });
  if (G.journal.length > 60) G.journal.pop();
}

// ---------- Accès pratiques ----------
function provincesDe(nid) { return G.provinces.filter(p => p.proprietaire === nid); }
function nation(nid) { return G.nations[nid]; }
function enGuerre(a, b) { return nation(a).guerres.includes(b); }
function allies(a, b) { return nation(a).alliances.includes(b); }
function aPacte(a, b) { return nation(a).pactes.includes(b); }
function estVassal(a, b) { return nation(a).vassalDe === b; }

// ---------- Armées (composition inf / choc / siège) ----------
function armeeVide() { return { inf: 0, choc: 0, siege: 0 }; }
function totalArmee(a) { return a.inf + a.choc + a.siege; }
function majTroupes(p) { p.troupes = totalArmee(p.armee); }

function forceAttaque(a, ere) {
  return (a.inf * TYPES_UNITES.inf.attaque + a.choc * TYPES_UNITES.choc.attaque +
          a.siege * TYPES_UNITES.siege.attaque) * ERES[ere].puissance;
}
function forceDefense(a, ere) {
  return (a.inf * TYPES_UNITES.inf.defense + a.choc * TYPES_UNITES.choc.defense +
          a.siege * TYPES_UNITES.siege.defense) * ERES[ere].puissance;
}

// Retire n unités d'une composition (en commençant par le type le plus nombreux)
function retirerComposition(a, n) {
  const retire = armeeVide();
  for (let i = 0; i < n; i++) {
    const type = ['inf', 'choc', 'siege'].sort((x, y) => a[y] - a[x])[0];
    if (a[type] <= 0) break;
    a[type]--;
    retire[type]++;
  }
  return retire;
}

// Prélève n unités d'une province (pour attaque / déplacement)
function extraireArmee(p, n) {
  const prise = retirerComposition(p.armee, Math.min(n, totalArmee(p.armee)));
  majTroupes(p);
  return prise;
}

function ajouterArmee(p, comp) {
  p.armee.inf += comp.inf;
  p.armee.choc += comp.choc;
  p.armee.siege += comp.siege;
  majTroupes(p);
}

// Retire n unités directement dans la province
function retirerUnites(p, n) {
  retirerComposition(p.armee, Math.min(n, totalArmee(p.armee)));
  majTroupes(p);
}

function puissanceMilitaire(nid) {
  const n = nation(nid);
  let f = 0;
  for (const p of provincesDe(nid)) f += forceAttaque(p.armee, n.ere);
  return f;
}

// ---------- Économie ----------
function nbPorts(nid) {
  return provincesDe(nid).filter(p => p.batiments.port > 0).length;
}

// Production d'une seule province (avec rendement, focus et blocus)
function productionProvince(p, bloque = false) {
  const t = TERRAINS[p.terrain];
  const f = facteurTravail(p);
  const portBonus = p.batiments.port * BATIMENTS.port.bonus * (bloque ? 0.5 : 1);
  const res = {
    or: (t.or * f + p.batiments.marche * BATIMENTS.marche.bonus + portBonus +
         p.batiments.mine_or * BATIMENTS.mine_or.bonus * f) * focusMult(p, 'or'),
    nourriture: (t.nourriture * f + p.batiments.ferme * BATIMENTS.ferme.bonus) * focusMult(p, 'nourriture'),
    science: (t.science * f + p.batiments.ecole * BATIMENTS.ecole.bonus) * focusMult(p, 'science'),
    biens: {},
  };
  if (p.capitale) { res.or += 4; res.science += 3; }
  for (const bien of p.gisements) {
    if (bien === 'or') continue;
    const bat = BATIMENT_POUR_GISEMENT[bien];
    res.biens[bien] = Math.round((1 + p.batiments[bat] * BATIMENTS[bat].bonus) * f * focusMult(p, 'marchandise'));
  }
  return res;
}

function revenus(nid) {
  const n = nation(nid);
  const bloque = subitBlocus(nid) >= 0;
  let or_ = 0, nour = 0, sci = 0, popTotale = 0;
  for (const p of provincesDe(nid)) {
    const prod = productionProvince(p, bloque);
    or_ += prod.or;
    nour += prod.nourriture;
    sci += prod.science;
    popTotale += p.pop;
  }
  const orProvinces = or_, nourProvinces = nour, sciProvinces = sci;
  // Doctrines nationales
  if (n.doctrine === 'mercantiliste') or_ *= 1.2;
  if (n.doctrine === 'agraire') nour *= 1.25;
  if (n.doctrine === 'rationaliste') sci *= 1.25;
  // Un bon intendant sur le trône enrichit le royaume
  if (n.dirigeant) or_ *= 1 + n.dirigeant.intendance * 0.015;
  const orBonus = or_ - orProvinces; // part due à la doctrine et au souverain
  // Impôts : la population paie
  or_ += popTotale * 0.15;
  // Entretien des troupes et de la flotte
  const troupes = provincesDe(nid).reduce((s, p) => s + p.troupes, 0);
  const entretien = Math.floor(troupes / 2) + Math.floor(n.flotte / 2);
  // Tribut des vassaux
  let tribut = 0;
  for (const autre of G.nations) {
    if (autre.vivante && autre.vassalDe === nid) {
      tribut += Math.max(0, Math.floor(revenusBruts(autre.id).or * 0.25));
    }
  }
  // Le vassal verse 25 % de son or
  let verse = 0;
  if (n.vassalDe >= 0 && nation(n.vassalDe).vivante) verse = Math.floor(or_ * 0.25);
  // Accords commerciaux : +8 or par partenaire vivant,
  // +5 de plus par partenaire si chacun possède un port (routes maritimes)
  let commerce = 0;
  let routesMaritimes = 0;
  const mesPorts = nbPorts(nid);
  for (const pid of n.accords) {
    if (!nation(pid).vivante) continue;
    commerce += 8;
    if (mesPorts > 0 && nbPorts(pid) > 0 && !bloque) { commerce += 5; routesMaritimes++; }
  }
  const mult = n.stabilite >= 50 ? 1 : 0.7; // instabilité = pertes
  return {
    or: Math.floor((or_ - entretien + tribut + commerce - verse) * mult),
    commerce,
    routesMaritimes,
    nourriture: Math.floor((nour - Math.ceil(troupes / 3)) * mult),
    science: Math.floor(sci * mult),
    entretien,
    popTotale,
    // Décomposition pour l'écran Empire
    detail: {
      orProvinces: Math.round(orProvinces),
      orBonus: Math.round(orBonus),
      impots: Math.round(popTotale * 0.15),
      tribut, verse, commerce,
      entretienArmee: Math.floor(troupes / 2),
      entretienFlotte: Math.floor(n.flotte / 2),
      nourProvinces: Math.round(nourProvinces),
      nourBonus: Math.round(nour - nourProvinces),
      rationTroupes: Math.ceil(troupes / 3),
      sciProvinces: Math.round(sciProvinces),
      sciBonus: Math.round(sci - sciProvinces),
      instable: mult < 1,
      bloque,
      troupes,
    },
  };
}

// Simulation Monte-Carlo d'une attaque (sans modifier l'état du jeu)
function simulerBataille(source, cible, amphibie = false, essais = 300) {
  const s = G.provinces[source], c = G.provinces[cible];
  const att = nation(s.proprietaire);
  let multAtt = amphibie ? 0.85 : 1;
  if (att.doctrine === 'militariste') multAtt *= 1.1;
  if (att.dirigeant) multAtt *= 1 + att.dirigeant.martial * 0.015;
  // Composition engagée (copie, une garnison reste)
  const engages = { ...s.armee };
  retirerComposition(engages, 1); // approximation : la garnison est retirée du plus nombreux
  const nbEngages = totalArmee(engages);
  const ereDef = c.proprietaire >= 0 ? nation(c.proprietaire).ere : 0;
  const reducSiege = Math.max(0.35, 1 - engages.siege * 0.12);
  const bonusFort = 1 + c.batiments.fort * BATIMENTS.fort.bonus * reducSiege;
  const bonusTerrain = TERRAINS[c.terrain].defense;
  const baseAtt = forceAttaque(engages, att.ere) * multAtt;
  const baseDef = Math.max(1, forceDefense(c.armee, ereDef)) * bonusFort * bonusTerrain;

  let victoires = 0, pertesV = 0, pertesD = 0;
  for (let i = 0; i < essais; i++) {
    const ratio = (baseAtt * randF(0.85, 1.2)) / (baseDef * randF(0.85, 1.2));
    if (ratio > 1) {
      victoires++;
      pertesV += Math.min(nbEngages - 1, Math.round(nbEngages * (0.5 / ratio)));
    } else {
      pertesD += Math.round(nbEngages * clamp(0.4 + (1 - ratio) * 0.5, 0.4, 0.9));
    }
  }
  return {
    pVictoire: victoires / essais,
    pertesSiVictoire: victoires ? Math.round(pertesV / victoires) : 0,
    pertesSiDefaite: victoires < essais ? Math.round(pertesD / (essais - victoires)) : 0,
    forceAtt: Math.round(baseAtt),
    forceDef: Math.round(baseDef),
    bonusTerrain, bonusFort, reducSiege, multAtt, nbEngages,
  };
}
function revenusBruts(nid) {
  let or_ = 0;
  for (const p of provincesDe(nid)) or_ += TERRAINS[p.terrain].or + p.batiments.marche * BATIMENTS.marche.bonus;
  return { or: or_ };
}

function coutBatiment(type, niveauActuel, ere) {
  return Math.floor(BATIMENTS[type].coutBase * (niveauActuel + 1) * (1 + ere * 0.35));
}

// Coût matériaux d'un bâtiment au niveau donné
function coutMateriaux(type, niveauActuel) {
  const def = BATIMENTS[type];
  return {
    bois: def.bois * (niveauActuel + 1),
    pierre: def.pierre * (niveauActuel + 1),
  };
}

// Peut-on bâtir ce type ici ? (prérequis de terrain / gisement / emplacement)
function peutConstruire(p, type) {
  const def = BATIMENTS[type];
  if (def.type === 'cotier' && !estCotiere(p)) return { ok: false, raison: 'Il faut un accès à la mer' };
  if (def.type === 'extraction' && !p.gisements.includes(def.bien)) {
    return { ok: false, raison: `Aucun gisement de ${def.bien === 'or' ? 'or' : MARCHANDISES[def.bien].nom.toLowerCase()} ici` };
  }
  if (p.batiments[type] === 0 && emplacementsUtilises(p) >= emplacementsMax(p)) {
    return { ok: false, raison: `Tous les emplacements sont occupés (${emplacementsMax(p)} max)` };
  }
  return { ok: true };
}

function construire(pid, type) {
  const p = G.provinces[pid];
  const n = nation(p.proprietaire);
  const niv = p.batiments[type];
  if (niv >= NIVEAU_MAX_BATIMENT) return { ok: false, raison: 'Niveau maximum atteint' };
  const pre = peutConstruire(p, type);
  if (!pre.ok) return pre;
  const cout = coutBatiment(type, niv, n.ere);
  const mat = coutMateriaux(type, niv);
  if (n.or < cout) return { ok: false, raison: 'Or insuffisant' };
  if (n.marchandises.bois < mat.bois) return { ok: false, raison: `Bois insuffisant (${mat.bois} 🪵 requis)` };
  if (n.marchandises.pierre < mat.pierre) return { ok: false, raison: `Pierre insuffisante (${mat.pierre} 🪨 requise)` };
  n.or -= cout;
  n.marchandises.bois -= mat.bois;
  n.marchandises.pierre -= mat.pierre;
  p.batiments[type]++;
  return { ok: true };
}

function recruter(pid, type, quantite) {
  const p = G.provinces[pid];
  const n = nation(p.proprietaire);
  const c = TYPES_UNITES[type].cout;
  const coutOr = Math.round(c.or * quantite * (n.doctrine === 'militariste' ? 0.8 : 1));
  if (p.pop <= quantite) return { ok: false, raison: `Population insuffisante (${quantite} 👥 requis, il faut en garder)` };
  if (n.or < coutOr) return { ok: false, raison: 'Or insuffisant' };
  if (n.nourriture < c.nourriture * quantite) return { ok: false, raison: 'Nourriture insuffisante' };
  if (n.marchandises.fer < c.fer * quantite) return { ok: false, raison: `Fer insuffisant (${c.fer * quantite} ⚒️ requis)` };
  if (n.marchandises.pierre < c.pierre * quantite) return { ok: false, raison: `Pierre insuffisante (${c.pierre * quantite} 🪨 requise)` };
  n.or -= coutOr;
  n.nourriture -= c.nourriture * quantite;
  n.marchandises.fer -= c.fer * quantite;
  n.marchandises.pierre -= c.pierre * quantite;
  p.pop -= quantite; // les soldats viennent du peuple
  p.armee[type] += quantite;
  majTroupes(p);
  return { ok: true };
}

// ---------- Production & marché mondial ----------
// Un gisement produit 1/tour à l'état brut, bien plus avec le bâtiment adéquat.
function productionMarchandises(nid) {
  const prod = { bois: 0, fer: 0, pierre: 0, epices: 0 };
  for (const p of provincesDe(nid)) {
    const f = facteurTravail(p);
    for (const bien of p.gisements) {
      if (bien === 'or') continue; // l'or est géré dans revenus()
      const bat = BATIMENT_POUR_GISEMENT[bien];
      prod[bien] += Math.round((1 + p.batiments[bat] * BATIMENTS[bat].bonus) * f * focusMult(p, 'marchandise'));
    }
  }
  return prod;
}

function prixAchat(bien) { return Math.ceil(G.marche[bien].prix * 1.1); }
function prixVente(bien) { return Math.max(1, Math.floor(G.marche[bien].prix * 0.9)); }

function marcheAcheter(nid, bien, quantite) {
  const n = nation(nid);
  const cout = prixAchat(bien) * quantite;
  if (n.or < cout) return { ok: false, raison: 'Or insuffisant' };
  n.or -= cout;
  n.marchandises[bien] += quantite;
  // La demande fait monter le prix
  G.marche[bien].prix = clamp(G.marche[bien].prix * (1 + 0.005 * quantite), PRIX_MIN, PRIX_MAX);
  return { ok: true, cout };
}

function marcheVendre(nid, bien, quantite) {
  const n = nation(nid);
  if (n.marchandises[bien] < quantite) return { ok: false, raison: 'Stock insuffisant' };
  const gain = Math.round(prixVente(bien) * quantite * (n.doctrine === 'mercantiliste' ? 1.1 : 1));
  n.marchandises[bien] -= quantite;
  n.or += gain;
  // L'offre fait baisser le prix
  G.marche[bien].prix = clamp(G.marche[bien].prix * (1 - 0.005 * quantite), PRIX_MIN, PRIX_MAX);
  return { ok: true, gain };
}

// ---------- Mercenaires ----------
// Trois compagnies libres disponibles, renouvelées régulièrement.
// L'effectif et le prix suivent l'avancée du monde (ère moyenne).
function genererMercenaires() {
  const ereMonde = Math.round(
    G.nations.filter(n => n.vivante).reduce((s, n) => s + n.ere, 0) /
    Math.max(1, G.nations.filter(n => n.vivante).length));
  const noms = [...NOMS_MERCENAIRES];
  G.mercenaires = [];
  for (let i = 0; i < 3; i++) {
    const inf = 3 + rand(6);
    const choc = rand(4);
    const siege = rand(3);
    const cout = Math.round((inf * 12 + choc * 22 + siege * 26) * (1 + ereMonde * 0.3));
    G.mercenaires.push({
      nom: noms.splice(rand(noms.length), 1)[0],
      inf, choc, siege, cout,
    });
  }
}

function embaucherMercenaires(nid, index) {
  const n = nation(nid);
  const cie = G.mercenaires[index];
  if (!cie) return { ok: false };
  if (n.or < cie.cout) return { ok: false, raison: 'Or insuffisant' };
  const cap = provincesDe(nid).find(p => p.capitale) || provincesDe(nid)[0];
  if (!cap) return { ok: false };
  n.or -= cie.cout;
  ajouterArmee(cap, { inf: cie.inf, choc: cie.choc, siege: cie.siege });
  G.mercenaires.splice(index, 1);
  journal(`🏴 ${n.nom} engage la ${cie.nom} (${cie.inf + cie.choc + cie.siege} soldats, déployés à ${cap.nom}).`);
  return { ok: true, province: cap.id };
}

// ---------- Cités-états ----------
function coutAnnexionCite(p) {
  return 150 + p.troupes * 25;
}

// Annexion pacifique d'une cité-état adjacente au territoire
function annexerCiteEtat(nid, pid) {
  const p = G.provinces[pid];
  const n = nation(nid);
  if (!p.citeEtat || p.proprietaire !== -1) return { ok: false };
  const adjacente = voisinsHex(p.col, p.row).some(i => G.provinces[i].proprietaire === nid);
  if (!adjacente) return { ok: false, raison: 'Votre territoire doit border la cité' };
  const cout = coutAnnexionCite(p);
  if (n.or < cout) return { ok: false, raison: `${cout} 💰 requis` };
  n.or -= cout;
  p.proprietaire = nid;
  journal(`🏛️ ${p.nom} rejoint ${n.nom} par la négociation (${cout} 💰).`);
  return { ok: true };
}

// ---------- Négociations commerciales entre nations ----------
// Acheter 20 unités d'un bien directement à une nation (10 % sous le marché)
function acheterRessourceNation(a, b, bien) {
  const QTE = 20;
  const vendeur = nation(b);
  if (enGuerre(a, b)) return { ok: false, raison: 'Impossible en temps de guerre' };
  if (!nationsEnContact(a, b)) return { ok: false, raison: RAISON_CONTACT };
  if (vendeur.marchandises[bien] < QTE + 20) {
    return { ok: false, raison: `${vendeur.nom} n'a pas assez de ${MARCHANDISES[bien].nom.toLowerCase()} en surplus.` };
  }
  if (!vendeur.joueur && vendeur.relations[a] < -20) {
    return { ok: false, raison: `${vendeur.nom} refuse de commercer avec vous (relations trop mauvaises).` };
  }
  const prix = Math.ceil(G.marche[bien].prix * 0.9 * QTE);
  if (nation(a).or < prix) return { ok: false, raison: 'Or insuffisant' };
  nation(a).or -= prix;
  vendeur.or += prix;
  nation(a).marchandises[bien] += QTE;
  vendeur.marchandises[bien] -= QTE;
  modifierRelation(a, b, 3);
  journal(`🛒 ${nation(a).nom} achète ${QTE} ${MARCHANDISES[bien].icone} à ${vendeur.nom} pour ${prix} 💰.`);
  return { ok: true };
}

// Exiger un tribut sous la menace : fonctionne si on est bien plus fort
function exigerTribut(a, b) {
  const cible = nation(b);
  if (enGuerre(a, b)) return { ok: false, raison: 'Vous êtes déjà en guerre' };
  const ratio = puissanceMilitaire(a) / Math.max(1, puissanceMilitaire(b));
  if (ratio > 2 && (cible.joueur ? false : cible.stabilite < 75)) {
    const tribut = Math.min(cible.or, 80 + rand(40));
    cible.or -= tribut;
    nation(a).or += tribut;
    modifierRelation(a, b, -15);
    journal(`🪙 ${cible.nom} cède un tribut de ${tribut} 💰 à ${nation(a).nom} sous la menace.`);
    return { ok: true, tribut };
  }
  modifierRelation(a, b, -20);
  // L'humiliation peut déclencher une guerre
  if (!cible.joueur && Math.random() < 0.25) {
    declarerGuerre(b, a);
    return { ok: false, raison: `${cible.nom} répond à votre insolence par la guerre !` };
  }
  journal(`🪙 ${cible.nom} rejette avec mépris l'ultimatum de ${nation(a).nom}.`);
  return { ok: false, raison: `${cible.nom} refuse de plier (soyez 2× plus puissant).` };
}

function organiserFetes(nid) {
  const n = nation(nid);
  if (n.marchandises.epices < COUT_FETES_EPICES) {
    return { ok: false, raison: `${COUT_FETES_EPICES} 🌶️ épices requises` };
  }
  n.marchandises.epices -= COUT_FETES_EPICES;
  n.stabilite = clamp(n.stabilite + 10, 0, 100);
  if (n.joueur) journal(`🎉 Grandes fêtes dans tout le royaume ! (+10 stabilité)`);
  return { ok: true };
}

// ---------- Combat & mouvement ----------
function peutAttaquer(source, cible) {
  const s = G.provinces[source], c = G.provinces[cible];
  if (s.proprietaire === c.proprietaire) return false;
  if (c.terrain === 'eau') return false;
  if (s.aBouge || s.troupes < 2) return false;
  if (!voisinsHex(s.col, s.row).includes(cible)) return false;
  if (c.proprietaire >= 0) {
    const att = s.proprietaire, def = c.proprietaire;
    if (!enGuerre(att, def)) return false;           // il faut déclarer la guerre
    if (estVassal(def, att) || estVassal(att, def)) return false;
  }
  return true;
}

function resoudreAttaque(source, cible, multAtt = 1) {
  const s = G.provinces[source], c = G.provinces[cible];
  const att = nation(s.proprietaire);
  if (att.doctrine === 'militariste') multAtt *= 1.1;
  if (att.dirigeant) multAtt *= 1 + att.dirigeant.martial * 0.015; // génie militaire du souverain
  const engages = extraireArmee(s, s.troupes - 1); // une garnison reste
  const nbEngages = totalArmee(engages);
  const ereDef = c.proprietaire >= 0 ? nation(c.proprietaire).ere : 0;
  // Les armes de siège neutralisent une partie des fortifications
  const reducSiege = Math.max(0.35, 1 - engages.siege * 0.12);
  const bonusFort = 1 + c.batiments.fort * BATIMENTS.fort.bonus * reducSiege;
  const bonusTerrain = TERRAINS[c.terrain].defense;
  const forceAtt = forceAttaque(engages, att.ere) * multAtt * randF(0.85, 1.2);
  const forceDef = Math.max(1, forceDefense(c.armee, ereDef)) * bonusFort * bonusTerrain * randF(0.85, 1.2);

  s.aBouge = true;
  const ratio = forceAtt / forceDef;
  const nomCible = c.nom;
  if (ratio > 1) {
    // Victoire de l'attaquant
    const pertesAtt = Math.min(nbEngages - 1, Math.round(nbEngages * (0.5 / ratio)));
    retirerComposition(engages, pertesAtt);
    const ancienProprio = c.proprietaire;
    c.proprietaire = s.proprietaire;
    c.armee = engages;
    majTroupes(c);
    c.aBouge = true;
    const etaitCapitale = c.capitale;
    c.capitale = false;
    if (ancienProprio >= 0) {
      modifierRelation(ancienProprio, s.proprietaire, -20);
      if (etaitCapitale) {
        journal(`🔥 ${att.nom} s'empare de ${nomCible}, capitale de ${nation(ancienProprio).nom} !`);
        nation(ancienProprio).stabilite -= 20;
        // Nouvelle capitale ou élimination
        const restantes = provincesDe(ancienProprio);
        if (restantes.length > 0) { restantes[0].capitale = true; }
      } else {
        journal(`⚔️ ${att.nom} conquiert ${nomCible} (${nation(ancienProprio).nom}).`);
      }
      verifierElimination(ancienProprio);
    } else {
      journal(`⚔️ ${att.nom} soumet la province indépendante de ${nomCible}.`);
    }
    return { ok: true, victoire: true, pertes: pertesAtt };
  } else {
    // Défaite : lourdes pertes, les survivants rentrent
    const pertesAtt = Math.round(nbEngages * clamp(0.4 + (1 - ratio) * 0.5, 0.4, 0.9));
    const pertesDef = Math.round(c.troupes * clamp(ratio * 0.4, 0.05, 0.5));
    retirerComposition(engages, pertesAtt);
    ajouterArmee(s, engages);
    if (c.troupes - pertesDef >= 1) retirerUnites(c, pertesDef);
    journal(`🛡️ ${nomCible} repousse l'assaut de ${att.nom}.`);
    return { ok: true, victoire: false, pertes: pertesAtt };
  }
}

// Invasion amphibie : depuis un port, attaquer toute côte ennemie (flotte requise)
function peutAttaquerAmphibie(source, cible) {
  const s = G.provinces[source], c = G.provinces[cible];
  if (s.proprietaire === c.proprietaire || c.terrain === 'eau') return false;
  if (s.batiments.port < 1 || !estCotiere(c)) return false;
  if (s.aBouge || s.troupes < 2) return false;
  if (nation(s.proprietaire).flotte < s.troupes - 1) return false;
  if (c.proprietaire >= 0) {
    if (!enGuerre(s.proprietaire, c.proprietaire)) return false;
    if (estVassal(c.proprietaire, s.proprietaire) || estVassal(s.proprietaire, c.proprietaire)) return false;
  }
  return true;
}

function attaqueAmphibie(source, cible) {
  if (!peutAttaquerAmphibie(source, cible)) return { ok: false, raison: 'Invasion impossible' };
  journal(`🌊 Débarquement de ${nation(G.provinces[source].proprietaire).nom} sur ${G.provinces[cible].nom} !`);
  return resoudreAttaque(source, cible, 0.85); // débarquer sous le feu coûte cher
}

function deplacerTroupes(source, cible, quantite) {
  const s = G.provinces[source], c = G.provinces[cible];
  if (s.proprietaire !== c.proprietaire) return { ok: false };
  if (!voisinsHex(s.col, s.row).includes(cible)) return { ok: false };
  if (s.aBouge || quantite >= s.troupes) return { ok: false, raison: 'Une garnison doit rester' };
  ajouterArmee(c, extraireArmee(s, quantite));
  s.aBouge = true;
  return { ok: true };
}

function verifierElimination(nid) {
  const n = nation(nid);
  if (n.vivante && provincesDe(nid).length === 0) {
    n.vivante = false;
    n.guerres = [];
    n.alliances = [];
    n.pactes = [];
    n.accords = [];
    for (const autre of G.nations) {
      autre.guerres = autre.guerres.filter(x => x !== nid);
      autre.alliances = autre.alliances.filter(x => x !== nid);
      autre.pactes = autre.pactes.filter(x => x !== nid);
      autre.accords = autre.accords.filter(x => x !== nid);
      if (autre.vassalDe === nid) autre.vassalDe = -1;
    }
    journal(`💀 ${n.nom} a été rayé de la carte.`);
  }
}

// ---------- Diplomatie ----------
function modifierRelation(a, b, delta) {
  nation(a).relations[b] = clamp(nation(a).relations[b] + delta, -100, 100);
  nation(b).relations[a] = clamp(nation(b).relations[a] + delta, -100, 100);
}

// Deux nations sont-elles en contact ? (frontière commune, ou mer ouverte des deux côtés)
function nationsEnContact(a, b) {
  if (nbPorts(a) > 0 && nbPorts(b) > 0) return true;
  for (const p of provincesDe(a)) {
    for (const vid of voisinsHex(p.col, p.row)) {
      if (G.provinces[vid].proprietaire === b) return true;
    }
  }
  return false;
}
const RAISON_CONTACT = 'Vos nations ne sont pas en contact : frontière commune ou un port de chaque côté requis.';

function declarerGuerre(a, b) {
  if (enGuerre(a, b)) return { ok: false };
  // Guerre possible si contact, ou si l'attaquant a une flotte face à une nation côtière
  const porteeNavale = nbPorts(a) > 0 && nation(a).flotte > 0 && provincesDe(b).some(p => estCotiere(p));
  if (!nationsEnContact(a, b) && !porteeNavale) return { ok: false, raison: RAISON_CONTACT };
  if (aPacte(a, b)) return { ok: false, raison: 'Un pacte de non-agression vous lie' };
  if (allies(a, b)) return { ok: false, raison: 'Vous êtes alliés' };
  if (estVassal(b, a) || estVassal(a, b)) return { ok: false, raison: 'Lien de vassalité' };
  nation(a).guerres.push(b);
  nation(b).guerres.push(a);
  // La guerre rompt tout accord commercial
  if (aAccord(a, b)) {
    nation(a).accords = nation(a).accords.filter(x => x !== b);
    nation(b).accords = nation(b).accords.filter(x => x !== a);
    journal(`💸 L'accord commercial entre ${nation(a).nom} et ${nation(b).nom} est rompu.`);
  }
  modifierRelation(a, b, -40);
  nation(a).stabilite -= 5;
  journal(`⚡ ${nation(a).nom} déclare la guerre à ${nation(b).nom} !`);
  // Les alliés du défenseur rejoignent la guerre
  for (const allie of [...nation(b).alliances]) {
    if (allie !== a && !enGuerre(a, allie) && nation(allie).vivante) {
      if (nation(allie).relations[b] > 20) {
        nation(a).guerres.push(allie);
        nation(allie).guerres.push(a);
        modifierRelation(a, allie, -30);
        journal(`🤝 ${nation(allie).nom} rejoint la guerre aux côtés de ${nation(b).nom}.`);
      }
    }
  }
  return { ok: true };
}

// L'IA (ou le joueur) évalue une offre de paix. bonus = or offert.
function proposerPaix(a, b, orOffert = 0) {
  if (!enGuerre(a, b)) return { ok: false };
  if (orOffert > 0 && nation(a).or < orOffert) return { ok: false, raison: 'Or insuffisant' };
  const cible = nation(b);
  if (!cible.joueur) {
    // Volonté de paix de l'IA : dépend du rapport de force
    const ratio = puissanceMilitaire(b) / Math.max(1, puissanceMilitaire(a));
    const volonte = (1 - ratio) * 50 + orOffert / 5 + (cible.stabilite < 40 ? 20 : 0);
    if (volonte < 10 && ratio > 1.3) return { ok: false, raison: `${cible.nom} sent la victoire proche et refuse.` };
    if (volonte < 0) return { ok: false, raison: `${cible.nom} refuse votre offre.` };
  }
  faireLaPaix(a, b);
  if (orOffert > 0) { nation(a).or -= orOffert; cible.or += orOffert; }
  return { ok: true };
}

function faireLaPaix(a, b) {
  nation(a).guerres = nation(a).guerres.filter(x => x !== b);
  nation(b).guerres = nation(b).guerres.filter(x => x !== a);
  modifierRelation(a, b, 20);
  journal(`🕊️ Paix conclue entre ${nation(a).nom} et ${nation(b).nom}.`);
}

function proposerAlliance(a, b) {
  if (allies(a, b)) return { ok: false };
  if (enGuerre(a, b)) return { ok: false, raison: 'Vous êtes en guerre' };
  if (!nationsEnContact(a, b)) return { ok: false, raison: RAISON_CONTACT };
  const cible = nation(b);
  if (!cible.joueur) {
    const rel = cible.relations[a];
    const perso = PERSONNALITES[cible.perso];
    // Un souverain diplomate convainc plus facilement ; un mariage royal aussi
    const bonusDiplo = (nation(a).dirigeant ? nation(a).dirigeant.diplomatie * 1.5 : 0) +
      (nation(a).mariages && nation(a).mariages.includes(b) ? 15 : 0);
    const seuil = Math.round(55 - perso.diplomatie * 25 - bonusDiplo);
    if (rel < seuil) return { ok: false, raison: `${cible.nom} ne vous fait pas assez confiance (relations ${rel}, ${seuil} requis).` };
  }
  nation(a).alliances.push(b);
  nation(b).alliances.push(a);
  modifierRelation(a, b, 25);
  journal(`🤝 Alliance scellée entre ${nation(a).nom} et ${nation(b).nom} !`);
  return { ok: true };
}

function romprAlliance(a, b) {
  nation(a).alliances = nation(a).alliances.filter(x => x !== b);
  nation(b).alliances = nation(b).alliances.filter(x => x !== a);
  modifierRelation(a, b, -30);
  journal(`💔 ${nation(a).nom} rompt son alliance avec ${nation(b).nom}.`);
}

function proposerPacte(a, b) {
  if (aPacte(a, b) || enGuerre(a, b)) return { ok: false };
  if (!nationsEnContact(a, b)) return { ok: false, raison: RAISON_CONTACT };
  const cible = nation(b);
  if (!cible.joueur && cible.relations[a] < -20) {
    return { ok: false, raison: `${cible.nom} refuse (relations trop mauvaises).` };
  }
  nation(a).pactes.push(b);
  nation(b).pactes.push(a);
  modifierRelation(a, b, 10);
  journal(`📜 Pacte de non-agression entre ${nation(a).nom} et ${nation(b).nom}.`);
  return { ok: true };
}

function aAccord(a, b) { return nation(a).accords.includes(b); }

function proposerAccordCommercial(a, b) {
  if (aAccord(a, b)) return { ok: false };
  if (enGuerre(a, b)) return { ok: false, raison: 'Impossible en temps de guerre' };
  if (!nationsEnContact(a, b)) return { ok: false, raison: RAISON_CONTACT };
  const cible = nation(b);
  if (!cible.joueur) {
    const perso = PERSONNALITES[cible.perso];
    const seuil = 20 - perso.commerce * 15;
    if (cible.relations[a] < seuil) {
      return { ok: false, raison: `${cible.nom} refuse de commercer (relations ${cible.relations[a]}, ${seuil} requis).` };
    }
  }
  nation(a).accords.push(b);
  nation(b).accords.push(a);
  modifierRelation(a, b, 12);
  journal(`💱 Accord commercial entre ${nation(a).nom} et ${nation(b).nom} (+8 💰/tour chacun).`);
  return { ok: true };
}

function envoyerCadeau(a, b, montant) {
  const n = nation(a);
  if (n.or < montant) return { ok: false, raison: 'Or insuffisant' };
  n.or -= montant;
  nation(b).or += montant;
  const gain = Math.min(25, Math.ceil(montant / 10));
  modifierRelation(a, b, gain);
  journal(`🎁 ${n.nom} envoie ${montant} d'or à ${nation(b).nom} (+${gain} relations).`);
  return { ok: true };
}

function demanderVassalite(a, b) {
  const cible = nation(b);
  if (cible.vassalDe === a) return { ok: false };
  const ratio = puissanceMilitaire(a) / Math.max(1, puissanceMilitaire(b));
  const tailleCible = provincesDe(b).length;
  if (!cible.joueur) {
    const accepte = ratio > 3 && (cible.relations[a] > 0 || cible.stabilite < 40) && tailleCible <= 6;
    if (!accepte) return { ok: false, raison: `${cible.nom} refuse de plier le genou (soyez 3× plus puissant et en bons termes).` };
  }
  cible.vassalDe = a;
  if (enGuerre(a, b)) faireLaPaix(a, b);
  modifierRelation(a, b, 10);
  journal(`👑 ${cible.nom} devient vassal de ${nation(a).nom} !`);
  return { ok: true };
}

function liberer(a, b) {
  if (nation(b).vassalDe !== a) return { ok: false };
  nation(b).vassalDe = -1;
  modifierRelation(a, b, 30);
  journal(`🕊️ ${nation(a).nom} libère ${nation(b).nom} de sa vassalité.`);
  return { ok: true };
}

// ---------- Technologie ----------
function verifierEre(nid) {
  const n = nation(nid);
  while (n.ere < ERES.length - 1 && n.science >= ERES[n.ere + 1].seuil) {
    n.ere++;
    journal(`${ERES[n.ere].icone} ${n.nom} entre dans l'${ERES[n.ere].nom.toLowerCase().startsWith('è') ? '' : 'ère : '}${ERES[n.ere].nom} !`);
    if (n.joueur) G.message = { titre: 'Nouvelle ère !', texte: `Votre nation entre dans l'ère « ${ERES[n.ere].nom} ». Vos unités deviennent des ${ERES[n.ere].unite} (puissance ×${ERES[n.ere].puissance}).` };
  }
}

function lancerAscension(nid) {
  const n = nation(nid);
  if (n.ere < 4) return { ok: false, raison: 'Ère futuriste requise' };
  if (n.science < PROJET_ASCENSION.cout) return { ok: false, raison: `${PROJET_ASCENSION.cout} science requise` };
  n.science -= PROJET_ASCENSION.cout;
  n.ascensionActive = true;
  journal(`🌌 ${n.nom} lance le projet ${PROJET_ASCENSION.nom} ! (${PROJET_ASCENSION.tours} tours)`);
  return { ok: true };
}

// ---------- Événements ----------
function tirerEvenement() {
  const n = nation(G.joueur);
  if (!n.vivante || Math.random() > 0.45) return null;
  const dispo = EVENEMENTS.filter(e => e.ereMin <= n.ere);
  return pick(dispo);
}

function appliquerChoix(evenement, indexChoix) {
  const n = nation(G.joueur);
  const eff = evenement.choix[indexChoix].effets;
  if (eff.or) n.or = Math.max(0, n.or + eff.or);
  if (eff.nourriture) n.nourriture = Math.max(0, n.nourriture + eff.nourriture);
  if (eff.science) n.science = Math.max(0, n.science + eff.science);
  if (eff.stabilite) n.stabilite = clamp(n.stabilite + eff.stabilite, 0, 100);
  if (eff.troupes) {
    const miennes = provincesDe(G.joueur);
    if (miennes.length) {
      const p = pick(miennes);
      if (eff.troupes > 0) p.armee.inf += eff.troupes;
      else retirerUnites(p, -eff.troupes);
      majTroupes(p);
    }
  }
  if (eff.relationsTous) {
    for (const autre of G.nations) {
      if (autre.id !== G.joueur && autre.vivante) modifierRelation(G.joueur, autre.id, eff.relationsTous);
    }
  }
  verifierEre(G.joueur);
}

// ---------- Fin de tour ----------
function finDeTour() {
  const evenementsTour = [];

  // 1. Tours des IA
  for (const n of G.nations) {
    if (!n.vivante || n.joueur) continue;
    iaJouerTour(n.id);
  }

  // 2. Économie, production et science pour tous
  for (const n of G.nations) {
    if (!n.vivante) continue;
    const rev = revenus(n.id);
    n.or = Math.max(0, n.or + rev.or);
    n.nourriture += rev.nourriture;
    n.science += Math.max(0, rev.science);
    // Production de marchandises
    const prod = productionMarchandises(n.id);
    for (const bien of Object.keys(MARCHANDISES)) n.marchandises[bien] += prod[bien];
    // Famine : le peuple meurt, les soldats désertent
    if (n.nourriture < 0) {
      n.nourriture = 0;
      n.stabilite -= 8;
      const miennes = provincesDe(n.id).filter(p => p.troupes > 1);
      if (miennes.length) { retirerUnites(pick(miennes), 1); }
      const peuplees = provincesDe(n.id).filter(p => p.pop > 2);
      for (let i = 0; i < 2 && peuplees.length; i++) pick(peuplees).pop--;
      if (n.joueur) evenementsTour.push('⚠️ Famine ! Votre peuple meurt et vos soldats désertent.');
    } else {
      // Croissance démographique : le peuple nourri prospère
      const tauxCroissance = n.doctrine === 'agraire' ? 0.65 : 0.5;
      for (const p of provincesDe(n.id)) {
        if (p.pop < capaciteProvince(p) && Math.random() < tauxCroissance) p.pop++;
      }
    }
    // Stabilité se régénère lentement en paix
    if (n.guerres.length === 0) n.stabilite = clamp(n.stabilite + 2, 0, 100);
    else n.stabilite = clamp(n.stabilite - 1, 0, 100);
    // Révolte si stabilité nulle
    if (n.stabilite <= 5 && Math.random() < 0.3) {
      const miennes = provincesDe(n.id).filter(p => !p.capitale);
      if (miennes.length) {
        const p = pick(miennes);
        p.proprietaire = -1;
        p.armee = { inf: 4 + rand(4), choc: 0, siege: 0 };
        majTroupes(p);
        journal(`🔥 Révolte à ${p.nom} ! La province fait sécession de ${n.nom}.`);
        verifierElimination(n.id);
      }
    }
    verifierEre(n.id);
    // Projet Ascension
    if (n.ascensionActive) {
      n.ascension++;
      if (n.joueur && n.ascension < PROJET_ASCENSION.tours) {
        evenementsTour.push(`🌌 ${PROJET_ASCENSION.nom} : ${n.ascension}/${PROJET_ASCENSION.tours} tours.`);
      }
    }
  }

  // 3. Dérive des relations : érosion naturelle + frictions frontalières
  for (const a of G.nations) {
    if (!a.vivante) continue;
    for (const b of G.nations) {
      if (b.id <= a.id || !b.vivante) continue;
      // Érosion vers 0 (les amitiés s'entretiennent, les rancunes s'estompent)
      const rel = a.relations[b.id];
      if (rel > 0 && !allies(a.id, b.id)) modifierRelation(a.id, b.id, -1);
      else if (rel < 0) modifierRelation(a.id, b.id, 1);
      // Friction entre voisins ambitieux
      const frontaliers = provincesDe(a.id).some(p =>
        voisinsHex(p.col, p.row).some(v => G.provinces[v].proprietaire === b.id));
      if (frontaliers) {
        const tension = (PERSONNALITES[a.perso].agression + PERSONNALITES[b.perso].agression) / 2;
        if (Math.random() < tension * 0.5) modifierRelation(a.id, b.id, -2);
      }
    }
  }

  // 4. Fluctuation naturelle des prix du marché
  for (const bien of Object.keys(MARCHANDISES)) {
    const m = G.marche[bien];
    // Marche aléatoire + rappel vers le prix de base
    m.prix = clamp(m.prix * randF(0.95, 1.05) + (MARCHANDISES[bien].prixBase - m.prix) * 0.05, PRIX_MIN, PRIX_MAX);
  }

  // Batailles navales : les flottes en guerre s'affrontent en mer
  for (const a of G.nations) {
    if (!a.vivante || a.flotte === 0) continue;
    for (const bid of a.guerres) {
      if (bid <= a.id) continue; // chaque paire une seule fois
      const b = nation(bid);
      if (!b.vivante || b.flotte === 0) continue;
      const pertesA = Math.min(a.flotte, Math.round(b.flotte * randF(0.1, 0.3)));
      const pertesB = Math.min(b.flotte, Math.round(a.flotte * randF(0.1, 0.3)));
      a.flotte -= pertesA;
      b.flotte -= pertesB;
      if ((a.joueur || b.joueur) && (pertesA || pertesB)) {
        journal(`⚔️🌊 Bataille navale : ${a.nom} perd ${pertesA} navires, ${b.nom} en perd ${pertesB}.`);
      }
    }
  }

  // Rotation des compagnies de mercenaires
  if (G.tour % TOURS_ROTATION_MERCENAIRES === 0 || G.mercenaires.length === 0) genererMercenaires();

  // Les dynasties vivent : vieillesse, naissances, successions
  const anneesTour = ERES[nation(G.joueur).ere].anneesParTour;
  for (const n of G.nations) {
    if (n.vivante) vivreDynastie(n.id, anneesTour);
  }

  // 5. Réinitialiser les mouvements
  for (const p of G.provinces) p.aBouge = false;

  // 4. Avancer le temps
  const ereJoueur = nation(G.joueur).ere;
  G.tour++;
  G.annee += ERES[ereJoueur].anneesParTour;

  // 5. Vérifier la victoire / défaite
  const fin = verifierVictoire();

  return { evenementsTour, fin };
}

function verifierVictoire() {
  const joueur = nation(G.joueur);
  if (!joueur.vivante) {
    G.fini = true;
    return { type: 'defaite', texte: 'Votre nation a été anéantie. L\'Histoire vous oubliera…' };
  }
  const vivantes = G.nations.filter(n => n.vivante);
  // Victoire par domination : seul survivant ou 70 % des terres
  const terres = G.provinces.filter(p => p.terrain !== 'eau').length;
  for (const n of vivantes) {
    const part = provincesDe(n.id).length / terres;
    const vassaux = vivantes.filter(v => v.vassalDe === n.id).length;
    if (part >= 0.55 || vivantes.every(v => v.id === n.id || v.vassalDe === n.id)) {
      G.fini = true;
      return n.joueur
        ? { type: 'victoire', texte: `🏆 Victoire par DOMINATION ! Vous contrôlez le monde connu (${Math.round(part * 100)} % des terres, ${vassaux} vassaux).` }
        : { type: 'defaite', texte: `${n.nom} domine le monde. Votre étoile s'éteint.` };
    }
  }
  // Victoire scientifique
  for (const n of vivantes) {
    if (n.ascension >= PROJET_ASCENSION.tours) {
      G.fini = true;
      return n.joueur
        ? { type: 'victoire', texte: `🌌 Victoire SCIENTIFIQUE ! Votre civilisation s'élève vers les étoiles grâce au projet ${PROJET_ASCENSION.nom}.` }
        : { type: 'defaite', texte: `${n.nom} a atteint les étoiles avant vous.` };
    }
  }
  // Victoire diplomatique : allié avec toutes les nations vivantes (min 4)
  if (vivantes.length >= 4) {
    const autres = vivantes.filter(n => n.id !== G.joueur);
    if (autres.length >= 3 && autres.every(n => allies(G.joueur, n.id) || n.vassalDe === G.joueur)) {
      G.fini = true;
      return { type: 'victoire', texte: '🕊️ Victoire DIPLOMATIQUE ! Toutes les nations du monde sont unies sous votre égide.' };
    }
  }
  return null;
}

// ---------- Sauvegarde ----------
const CLE_SAUVEGARDE = 'chroniques-des-eres-save';

function sauvegarder() {
  try {
    localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(G));
    return true;
  } catch (e) { return false; }
}

function charger() {
  try {
    const brut = localStorage.getItem(CLE_SAUVEGARDE);
    if (!brut) return false;
    G = JSON.parse(brut);
    migrerSauvegarde();
    return true;
  } catch (e) { return false; }
}

// Compatibilité avec les sauvegardes des versions précédentes
function migrerSauvegarde() {
  // Dimensions de la carte (les anciennes parties étaient en 16×12)
  MAP_W = G.mapW || 16;
  MAP_H = G.mapH || 12;
  if (!G.mapW) { G.mapW = MAP_W; G.mapH = MAP_H; }
  if (!G.marche) {
    G.marche = Object.fromEntries(Object.entries(MARCHANDISES).map(([k, m]) => [k, { prix: m.prixBase }]));
  }
  for (const n of G.nations) {
    if (!n.marchandises) n.marchandises = { bois: 30, fer: 20, pierre: 20, epices: 10 };
    if (!n.accords) n.accords = [];
  }
  for (const p of G.provinces) {
    if (!p.armee) p.armee = { inf: p.troupes || 0, choc: 0, siege: 0 };
    if (p.citeEtat === undefined) p.citeEtat = false;
    // Nouveaux bâtiments : compléter les clés manquantes
    for (const type of Object.keys(BATIMENTS)) {
      if (p.batiments[type] === undefined) p.batiments[type] = 0;
    }
    // Population : initialiser si absente
    if (p.pop === undefined) p.pop = p.terrain === 'eau' ? 0 : (p.capitale || p.citeEtat ? 12 : 5 + rand(4));
    // Gisements : générer si absents, en garantissant l'ancien bien du terrain
    if (p.gisements === undefined) {
      p.gisements = [];
      if (p.terrain !== 'eau') {
        for (const [bien, prob] of (GISEMENTS_PAR_TERRAIN[p.terrain] || [])) {
          if (Math.random() < prob) p.gisements.push(bien);
        }
        const ancien = TERRAIN_BIEN[p.terrain];
        if (ancien && !p.gisements.includes(ancien)) p.gisements.push(ancien);
      }
    }
    // Ancienne « Exploitation » générique → bâtiment d'extraction dédié
    if (p.batiments.exploitation > 0) {
      const bien = TERRAIN_BIEN[p.terrain];
      if (bien) {
        const bat = BATIMENT_POUR_GISEMENT[bien];
        p.batiments[bat] = Math.max(p.batiments[bat], p.batiments.exploitation);
      }
      delete p.batiments.exploitation;
    }
  }
  if (!G.mercenaires) { G.mercenaires = []; genererMercenaires(); }
  if (!G.mode) G.mode = 'aleatoire';
  for (const n of G.nations) {
    if (n.flotte === undefined) n.flotte = 0;
    if (n.doctrine === undefined) { n.doctrine = null; n.doctrineTour = -99; }
    if (!n.dirigeant) initDynastie(n.id);
    if (!n.mariages) n.mariages = [];
  }
  for (const p of G.provinces) {
    if (p.focus === undefined) p.focus = 'equilibre';
  }
}

function sauvegardeExiste() {
  try { return !!localStorage.getItem(CLE_SAUVEGARDE); } catch (e) { return false; }
}

function supprimerSauvegarde() {
  try { localStorage.removeItem(CLE_SAUVEGARDE); } catch (e) {}
}

// ---------- Sauvegardes manuelles (3 emplacements) ----------
function cleSlot(slot) { return CLE_SAUVEGARDE + '-slot' + slot; }

function sauvegarderSlot(slot) {
  try {
    localStorage.setItem(cleSlot(slot), JSON.stringify(G));
    return true;
  } catch (e) { return false; }
}

function chargerSlot(slot) {
  try {
    const brut = localStorage.getItem(cleSlot(slot));
    if (!brut) return false;
    G = JSON.parse(brut);
    migrerSauvegarde();
    sauvegarder(); // devient aussi la partie en cours
    return true;
  } catch (e) { return false; }
}

// Métadonnées d'un emplacement pour l'affichage du menu
function infoSlot(slot) {
  try {
    const brut = localStorage.getItem(cleSlot(slot));
    if (!brut) return null;
    const s = JSON.parse(brut);
    return { tour: s.tour, annee: s.annee, nation: s.nations[s.joueur].nom };
  } catch (e) { return null; }
}
