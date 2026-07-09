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

  // ---- 2. Économie : construire ----
  iaConstruire(nid, perso, miennes);

  // ---- 3. Recruter ----
  iaRecruter(nid, perso, miennes);

  // ---- 4. Guerre : attaquer / consolider ----
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
  const priorites = [];
  if (perso.science > 0.5) priorites.push('ecole');
  if (perso.commerce > 0.5) priorites.push('marche');
  priorites.push('ferme', 'marche', 'fort', 'ecole');

  for (let essais = 0; essais < 3 && budget > 40; essais++) {
    const type = priorites[rand(priorites.length)];
    const candidates = miennes.filter(p => p.batiments[type] < NIVEAU_MAX_BATIMENT);
    if (!candidates.length) continue;
    const p = pick(candidates);
    const cout = coutBatiment(type, p.batiments[type], n.ere);
    if (cout <= budget && n.or >= cout) {
      construire(p.id, type);
      budget -= cout;
    }
  }
}

function iaRecruter(nid, perso, miennes) {
  const n = nation(nid);
  const troupes = miennes.reduce((s, p) => s + p.troupes, 0);
  const cible = miennes.length * (3 + perso.agression * 4) + (n.guerres.length > 0 ? 15 : 0);
  if (troupes >= cible) return;
  let aRecruter = Math.min(
    Math.ceil(cible - troupes),
    Math.floor(n.or / COUT_RECRUE_OR / 2),
    Math.floor(n.nourriture / COUT_RECRUE_NOURRITURE / 2)
  );
  while (aRecruter > 0) {
    // Recruter près du front ou dans la capitale
    const front = miennes.filter(p => voisinsHex(p.col, p.row).some(v => {
      const vp = G.provinces[v];
      return vp.proprietaire !== nid && vp.terrain !== 'eau';
    }));
    const ou = front.length ? pick(front) : pick(miennes);
    const lot = Math.min(aRecruter, 3);
    const res = recruter(ou.id, lot);
    if (!res.ok) break;
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
          const puissDef = Math.max(1, c.troupes) *
            (c.proprietaire >= 0 ? ERES[nation(c.proprietaire).ere].puissance : 1) *
            (1 + c.batiments.fort * BATIMENTS.fort.bonus) * TERRAINS[c.terrain].defense;
          const puissAtt = (p.troupes - 1) * ERES[n.ere].puissance;
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
