// ============================================================
// MOTEUR DE JEU — État, génération de carte, économie, combat,
// diplomatie, technologie, événements, sauvegarde
// ============================================================
'use strict';

const MAP_W = 16;
const MAP_H = 12;
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

// ---------- Génération de la carte ----------
function genererCarte() {
  const provinces = [];
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const id = r * MAP_W + c;
      // Bordures = mer, plus quelques lacs
      const bord = c === 0 || r === 0 || c === MAP_W - 1 || r === MAP_H - 1;
      let terrain;
      if (bord || Math.random() < 0.08) {
        terrain = 'eau';
      } else {
        const roll = Math.random();
        terrain = roll < 0.34 ? 'plaine' : roll < 0.54 ? 'foret' : roll < 0.72 ? 'colline' : roll < 0.87 ? 'montagne' : 'desert';
      }
      provinces.push({
        id, col: c, row: r, terrain,
        nom: terrain === 'eau' ? '' : nomProvince(),
        proprietaire: -1,          // -1 = indépendant, sinon id de nation
        troupes: 0,
        armee: armeeVide(),
        aBouge: false,             // l'armée a déjà agi ce tour
        batiments: { ferme: 0, marche: 0, ecole: 0, fort: 0, exploitation: 0 },
        capitale: false,
      });
    }
  }
  // Lissage : éviter les cases d'eau isolées au milieu
  for (const p of provinces) {
    if (p.terrain === 'eau' && !(p.col === 0 || p.row === 0 || p.col === MAP_W - 1 || p.row === MAP_H - 1)) {
      const vEau = voisinsHex(p.col, p.row).filter(i => provinces[i].terrain === 'eau').length;
      if (vEau === 0 && Math.random() < 0.5) { p.terrain = 'plaine'; p.nom = nomProvince(); }
    }
  }
  return provinces;
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
}

// ---------- Nouvelle partie ----------
function nouvellePartie(nationJoueur) {
  const nations = NATIONS_DEFS.map((def, i) => ({
    id: i,
    nom: def.nom,
    couleur: def.couleur,
    perso: def.perso,
    joueur: i === nationJoueur,
    vivante: true,
    or: 100,
    nourriture: 100,
    science: 0,
    stabilite: 70,
    ere: 0,
    ascension: 0,           // progression du projet final
    ascensionActive: false,
    vassalDe: -1,
    relations: NATIONS_DEFS.map((_, j) => (i === j ? 100 : rand(21) - 10)),
    alliances: [],
    pactes: [],
    guerres: [],
    accords: [],            // accords commerciaux
    marchandises: { bois: 30, fer: 20, pierre: 20, epices: 10 },
  }));

  const provinces = genererCarte();
  placerNations(provinces, nations);

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
  };
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
function revenus(nid) {
  const n = nation(nid);
  let or_ = 0, nour = 0, sci = 0;
  for (const p of provincesDe(nid)) {
    const t = TERRAINS[p.terrain];
    or_ += t.or + p.batiments.marche * BATIMENTS.marche.bonus;
    nour += t.nourriture + p.batiments.ferme * BATIMENTS.ferme.bonus;
    sci += t.science + p.batiments.ecole * BATIMENTS.ecole.bonus;
    if (p.capitale) { or_ += 4; sci += 3; }
  }
  // Entretien des troupes
  const troupes = provincesDe(nid).reduce((s, p) => s + p.troupes, 0);
  const entretien = Math.floor(troupes / 2);
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
  // Accords commerciaux : +8 or par partenaire vivant
  let commerce = 0;
  for (const pid of n.accords) if (nation(pid).vivante) commerce += 8;
  const mult = n.stabilite >= 50 ? 1 : 0.7; // instabilité = pertes
  return {
    or: Math.floor((or_ - entretien + tribut + commerce - verse) * mult),
    commerce,
    nourriture: Math.floor((nour - Math.ceil(troupes / 2)) * mult),
    science: Math.floor(sci * mult),
    entretien,
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

function construire(pid, type) {
  const p = G.provinces[pid];
  const n = nation(p.proprietaire);
  const niv = p.batiments[type];
  if (niv >= NIVEAU_MAX_BATIMENT) return { ok: false, raison: 'Niveau maximum atteint' };
  if (type === 'exploitation' && !TERRAIN_BIEN[p.terrain]) {
    return { ok: false, raison: 'Aucune ressource à exploiter ici' };
  }
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
  if (n.or < c.or * quantite) return { ok: false, raison: 'Or insuffisant' };
  if (n.nourriture < c.nourriture * quantite) return { ok: false, raison: 'Nourriture insuffisante' };
  if (n.marchandises.fer < c.fer * quantite) return { ok: false, raison: `Fer insuffisant (${c.fer * quantite} ⚒️ requis)` };
  if (n.marchandises.pierre < c.pierre * quantite) return { ok: false, raison: `Pierre insuffisante (${c.pierre * quantite} 🪨 requise)` };
  n.or -= c.or * quantite;
  n.nourriture -= c.nourriture * quantite;
  n.marchandises.fer -= c.fer * quantite;
  n.marchandises.pierre -= c.pierre * quantite;
  p.armee[type] += quantite;
  majTroupes(p);
  return { ok: true };
}

// ---------- Production & marché mondial ----------
function productionMarchandises(nid) {
  const prod = { bois: 0, fer: 0, pierre: 0, epices: 0 };
  for (const p of provincesDe(nid)) {
    const bien = TERRAIN_BIEN[p.terrain];
    if (bien) prod[bien] += 2 + p.batiments.exploitation * BATIMENTS.exploitation.bonus;
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
  const gain = prixVente(bien) * quantite;
  n.marchandises[bien] -= quantite;
  n.or += gain;
  // L'offre fait baisser le prix
  G.marche[bien].prix = clamp(G.marche[bien].prix * (1 - 0.005 * quantite), PRIX_MIN, PRIX_MAX);
  return { ok: true, gain };
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

function resoudreAttaque(source, cible) {
  const s = G.provinces[source], c = G.provinces[cible];
  const att = nation(s.proprietaire);
  const engages = extraireArmee(s, s.troupes - 1); // une garnison reste
  const nbEngages = totalArmee(engages);
  const ereDef = c.proprietaire >= 0 ? nation(c.proprietaire).ere : 0;
  // Les armes de siège neutralisent une partie des fortifications
  const reducSiege = Math.max(0.35, 1 - engages.siege * 0.12);
  const bonusFort = 1 + c.batiments.fort * BATIMENTS.fort.bonus * reducSiege;
  const bonusTerrain = TERRAINS[c.terrain].defense;
  const forceAtt = forceAttaque(engages, att.ere) * randF(0.85, 1.2);
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

function declarerGuerre(a, b) {
  if (enGuerre(a, b)) return { ok: false };
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
  const cible = nation(b);
  if (!cible.joueur) {
    const rel = cible.relations[a];
    const perso = PERSONNALITES[cible.perso];
    const seuil = 55 - perso.diplomatie * 25;
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
    // Famine
    if (n.nourriture < 0) {
      n.nourriture = 0;
      n.stabilite -= 8;
      const miennes = provincesDe(n.id).filter(p => p.troupes > 1);
      if (miennes.length) { retirerUnites(pick(miennes), 1); }
      if (n.joueur) evenementsTour.push('⚠️ Famine ! Votre peuple souffre (stabilité et troupes en baisse).');
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
    if (part >= 0.7 || vivantes.every(v => v.id === n.id || v.vassalDe === n.id)) {
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

// Compatibilité avec les sauvegardes d'avant le système économique
function migrerSauvegarde() {
  if (!G.marche) {
    G.marche = Object.fromEntries(Object.entries(MARCHANDISES).map(([k, m]) => [k, { prix: m.prixBase }]));
  }
  for (const n of G.nations) {
    if (!n.marchandises) n.marchandises = { bois: 30, fer: 20, pierre: 20, epices: 10 };
    if (!n.accords) n.accords = [];
  }
  for (const p of G.provinces) {
    if (!p.armee) p.armee = { inf: p.troupes || 0, choc: 0, siege: 0 };
    if (p.batiments.exploitation === undefined) p.batiments.exploitation = 0;
  }
}

function sauvegardeExiste() {
  try { return !!localStorage.getItem(CLE_SAUVEGARDE); } catch (e) { return false; }
}

function supprimerSauvegarde() {
  try { localStorage.removeItem(CLE_SAUVEGARDE); } catch (e) {}
}
