// ============================================================
// IA DES NATIONS — décisions économiques, militaires, diplomatiques
// selon la personnalité de chaque nation
// ============================================================
'use strict';

function iaJouerTour(nid) {
  const n = nation(nid);
  const perso = PERSONNALITES[n.perso];
  const miennes = provincesDe(nid);
  if (miennes.length === 0) return;

  // ---- 1. Diplomatie ----
  iaDiplomatie(nid, perso);

  // ---- 2. Commerce : vendre les surplus, acheter le nécessaire ----
  iaCommerce(nid, perso);

  // ---- 3. Économie : construire ----
  iaConstruire(nid, perso, miennes);

  // ---- 4. Recruter ----
  iaRecruter(nid, perso, miennes);

  // ---- 4bis. Doctrine, spécialisation, marine ----
  if (!n.doctrine && n.ere >= 1) {
    const choix = perso.agression > 0.6 ? 'militariste'
      : perso.commerce > 0.6 ? 'mercantiliste'
      : perso.science > 0.6 ? 'rationaliste' : 'agraire';
    choisirDoctrine(nid, choix);
  }
  // Spécialiser une ou deux provinces par tour selon leurs atouts
  for (let i = 0; i < 2; i++) {
    const p = pick(miennes);
    if (p.focus !== 'equilibre') continue;
    if (p.gisements.length >= 1 && Math.random() < 0.6) definirFocus(p.id, 'minier');
    else if (perso.science > 0.6) definirFocus(p.id, 'lettre');
    else if (perso.commerce > 0.6) definirFocus(p.id, 'commercant');
    else if (p.terrain === 'plaine') definirFocus(p.id, 'agricole');
  }
  // Flotte : les nations côtières arment des navires
  if (nbPorts(nid) > 0 && n.or > 250 && n.flotte < miennes.length && Math.random() < 0.4) {
    construireNavires(nid, 2);
  }

  // ---- 5. Mercenaires : renfort en temps de guerre ----
  if (n.guerres.length > 0 && Math.random() < 0.35) {
    const idx = G.mercenaires.findIndex(c => c.cout * 1.5 < n.or);
    if (idx >= 0) embaucherMercenaires(nid, idx);
  }

  // ---- 6. Cités-états : annexion pacifique si le trésor le permet ----
  if (n.or > 400 && Math.random() < 0.3) {
    for (const p of miennes) {
      const cite = voisinsHex(p.col, p.row).map(i => G.provinces[i])
        .find(v => v.citeEtat && v.proprietaire === -1);
      if (cite) { annexerCiteEtat(nid, cite.id); break; }
    }
  }

  // ---- 7. Guerre : attaquer / consolider ----
  iaMilitaire(nid, perso, miennes);

  // ---- 5. Projet Ascension ----
  if (n.ere >= 4 && !n.ascensionActive && n.science >= PROJET_ASCENSION.cout &&
      Math.random() < 0.3 + perso.science * 0.5) {
    lancerAscension(nid);
    // Le monde s'inquiète de cette ambition démesurée
    for (const autre of G.nations) {
      if (autre.vivante && autre.id !== nid) modifierRelation(nid, autre.id, -15);
    }
  }
}

function iaDiplomatie(nid, perso) {
  const n = nation(nid);
  const vivantes = G.nations.filter(x => x.vivante && x.id !== nid);
  const maPuissance = puissanceMilitaire(nid);

  for (const autre of vivantes) {
    const rel = n.relations[autre.id];
    const saPuissance = puissanceMilitaire(autre.id);

    // Chercher la paix si la guerre tourne mal
    if (enGuerre(nid, autre.id)) {
      const perd = maPuissance < saPuissance * 0.7 || n.stabilite < 35;
      if (perd && Math.random() < 0.5) {
        proposerPaix(nid, autre.id, Math.min(n.or, 30));
      }
      continue;
    }

    // Proposer une alliance contre une menace commune
    if (!allies(nid, autre.id) && rel > 35 && Math.random() < perso.diplomatie * 0.3) {
      const menace = vivantes.find(x => x.id !== autre.id && puissanceMilitaire(x.id) > maPuissance * 1.5);
      if (menace || Math.random() < 0.3) proposerAlliance(nid, autre.id);
    }

    // Pacte de non-agression avec les voisins puissants
    if (!aPacte(nid, autre.id) && !allies(nid, autre.id) && rel > -10 &&
        saPuissance > maPuissance * 1.4 && Math.random() < 0.25) {
      proposerPacte(nid, autre.id);
    }

    // Cadeau diplomatique (marchands/diplomates)
    if (rel < 30 && rel > -40 && n.or > 150 && Math.random() < perso.commerce * 0.15) {
      envoyerCadeau(nid, autre.id, 30);
    }

    // Accord commercial avec les nations amicales
    if (!aAccord(nid, autre.id) && rel > 10 && Math.random() < perso.commerce * 0.3) {
      proposerAccordCommercial(nid, autre.id);
    }

    // Mariage royal pour sceller une amitié
    if (!n.mariages.includes(autre.id) && rel > 30 && Math.random() < perso.diplomatie * 0.15) {
      mariageRoyal(nid, autre.id);
    }

    // Déclarer la guerre à une cible faible et détestée
    if (!enGuerre(nid, autre.id) && !aPacte(nid, autre.id) && !allies(nid, autre.id) &&
        autre.vassalDe !== nid && n.vassalDe === -1) {
      const cibleFaible = saPuissance < maPuissance * 0.6;
      const menaceAscension = autre.ascensionActive; // stopper la course aux étoiles
      const envie = perso.agression * 0.35 + (rel < -30 ? 0.15 : 0) + (cibleFaible ? 0.1 : 0) +
        (menaceAscension ? 0.4 : 0);
      const frontaliers = provincesDe(nid).some(p =>
        voisinsHex(p.col, p.row).some(v => G.provinces[v].proprietaire === autre.id));
      if (frontaliers && (cibleFaible || menaceAscension) && n.guerres.length === 0 &&
          n.stabilite > 45 && Math.random() < envie) {
        declarerGuerre(nid, autre.id);
      }
    }

    // Demander la vassalisation d'un voisin écrasé
    if (maPuissance > saPuissance * 3.5 && provincesDe(autre.id).length <= 4 && Math.random() < 0.15) {
      demanderVassalite(nid, autre.id);
    }
  }
}

function iaConstruire(nid, perso, miennes) {
  const n = nation(nid);
  let budget = n.or * 0.5;

  for (let essais = 0; essais < 4 && budget > 40; essais++) {
    const p = pick(miennes);
    // Options valides dans cette province, pondérées par la personnalité
    const options = [];
    for (const [type, def] of Object.entries(BATIMENTS)) {
      if (p.batiments[type] >= NIVEAU_MAX_BATIMENT) continue;
      if (!peutConstruire(p, type).ok) continue;
      let poids = 1;
      if (def.type === 'extraction') poids = 3;                      // exploiter ses gisements d'abord
      if (type === 'ferme' && p.pop >= capaciteProvince(p) - 1) poids = 3; // débloquer la croissance
      if (type === 'port') poids = 1 + perso.commerce * 2;
      if (type === 'marche' || type === 'mine_or') poids *= 1 + perso.commerce;
      if (type === 'ecole') poids *= 1 + perso.science;
      if (type === 'fort') poids *= 0.5 + perso.agression;
      if (type === 'mine_fer') poids *= 1 + perso.agression;         // l'industrie de guerre
      options.push({ type, poids });
    }
    if (!options.length) continue;
    // Tirage pondéré
    const total = options.reduce((s, o) => s + o.poids, 0);
    let tirage = Math.random() * total;
    let choix = options[0].type;
    for (const o of options) { tirage -= o.poids; if (tirage <= 0) { choix = o.type; break; } }
    const cout = coutBatiment(choix, p.batiments[choix], n.ere);
    if (cout <= budget && n.or >= cout) {
      if (construire(p.id, choix).ok) budget -= cout;
    }
  }
}

// L'IA vend ses surplus, achète ce qui lui manque et festoie si besoin
function iaCommerce(nid, perso) {
  const n = nation(nid);
  for (const bien of Object.keys(MARCHANDISES)) {
    // Vendre l'excédent (les marchands stockent moins)
    const plafond = 60 - perso.commerce * 20;
    if (n.marchandises[bien] > plafond) {
      marcheVendre(nid, bien, Math.floor(n.marchandises[bien] - plafond + 10));
    }
  }
  // Acheter le fer nécessaire au recrutement
  if (n.marchandises.fer < 10 && n.or > 100) marcheAcheter(nid, 'fer', 10);
  // Acheter le bois nécessaire aux constructions
  if (n.marchandises.bois < 10 && n.or > 120) marcheAcheter(nid, 'bois', 10);
  // Fêtes si le peuple gronde
  if (n.stabilite < 40 && n.marchandises.epices >= COUT_FETES_EPICES) organiserFetes(nid);
}

// Choix du type d'unité selon la personnalité et la situation
function iaChoisirTypeUnite(n, perso) {
  const roll = Math.random();
  if (n.guerres.length > 0 && roll < 0.15) return 'siege';
  if (roll < 0.2 + perso.agression * 0.3) return 'choc';
  return 'inf';
}

function iaRecruter(nid, perso, miennes) {
  const n = nation(nid);
  const troupes = miennes.reduce((s, p) => s + p.troupes, 0);
  const cible = miennes.length * (3 + perso.agression * 4) + (n.guerres.length > 0 ? 15 : 0);
  if (troupes >= cible) return;
  let aRecruter = Math.min(
    Math.ceil(cible - troupes),
    Math.floor(n.or / TYPES_UNITES.inf.cout.or / 2),
    Math.floor(n.nourriture / TYPES_UNITES.inf.cout.nourriture / 2)
  );
  let echecs = 0;
  while (aRecruter > 0 && echecs < 3) {
    // Recruter près du front ou dans la capitale
    const front = miennes.filter(p => voisinsHex(p.col, p.row).some(v => {
      const vp = G.provinces[v];
      return vp.proprietaire !== nid && vp.terrain !== 'eau';
    }));
    const ou = front.length ? pick(front) : pick(miennes);
    const lot = Math.min(aRecruter, 3);
    const type = iaChoisirTypeUnite(n, perso);
    const res = recruter(ou.id, type, lot);
    if (!res.ok) {
      // Le type voulu est trop cher : retenter en infanterie
      const res2 = recruter(ou.id, 'inf', lot);
      if (!res2.ok) { echecs++; continue; }
    }
    aRecruter -= lot;
  }
}

function iaMilitaire(nid, perso, miennes) {
  const n = nation(nid);
  for (const p of miennes) {
    if (p.aBouge || p.troupes < 3) continue;
    const voisins = voisinsHex(p.col, p.row).map(i => G.provinces[i]);

    // Cibles : provinces ennemies (en guerre) ou indépendantes
    const cibles = voisins.filter(v => peutAttaquer(p.id, v.id));
    if (cibles.length) {
      // Attaquer seulement avec un avantage estimé
      const meilleures = cibles
        .map(c => {
          const ereDef = c.proprietaire >= 0 ? nation(c.proprietaire).ere : 0;
          const reducSiege = Math.max(0.35, 1 - p.armee.siege * 0.12);
          const puissDef = Math.max(1, forceDefense(c.armee, ereDef)) *
            (1 + c.batiments.fort * BATIMENTS.fort.bonus * reducSiege) * TERRAINS[c.terrain].defense;
          const puissAtt = forceAttaque(p.armee, n.ere) * (p.troupes - 1) / p.troupes;
          return { c, avantage: puissAtt / puissDef };
        })
        .filter(x => x.avantage > 1.15 + (1 - perso.agression) * 0.5)
        .sort((a, b) => b.avantage - a.avantage);
      if (meilleures.length) {
        resoudreAttaque(p.id, meilleures[0].c.id);
        continue;
      }
    }

    // Sinon : regrouper les troupes vers le front
    const amies = voisins.filter(v => v.proprietaire === nid);
    const front = amies.filter(v => voisinsHex(v.col, v.row).some(i => {
      const vp = G.provinces[i];
      return vp.proprietaire !== nid && vp.terrain !== 'eau';
    }));
    const estAuFront = voisins.some(v => v.proprietaire !== nid && v.terrain !== 'eau');
    if (!estAuFront && front.length && p.troupes > 2 && Math.random() < 0.7) {
      deplacerTroupes(p.id, pick(front).id, p.troupes - 1);
    }
  }
}
