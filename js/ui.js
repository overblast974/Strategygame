// ============================================================
// INTERFACE — rendu canvas (carte hexagonale), gestes tactiles,
// panneaux, modales, notifications
// ============================================================
'use strict';

const UI = {
  canvas: null, ctx: null,
  cam: { x: 0, y: 0, zoom: 1 },
  hexSize: 42,
  selection: -1,        // province sélectionnée
  pointers: new Map(),  // gestion tactile
  dragDist: 0,
  lastPinch: 0,
  ecran: 'titre',       // 'titre' | 'jeu'
};

// ---------- Géométrie hexagonale ----------
function hexCentre(col, row) {
  const s = UI.hexSize;
  const w = Math.sqrt(3) * s;
  return {
    x: w * (col + 0.5 * (row % 2)) + w / 2,
    y: 1.5 * s * row + s,
  };
}

function hexSommets(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
  }
  return pts;
}

function ecranVersMonde(px, py) {
  return {
    x: (px - UI.cam.x) / UI.cam.zoom,
    y: (py - UI.cam.y) / UI.cam.zoom,
  };
}

function provinceSousPoint(px, py) {
  const m = ecranVersMonde(px, py);
  let best = -1, bestD = Infinity;
  for (const p of G.provinces) {
    const c = hexCentre(p.col, p.row);
    const d = Math.hypot(m.x - c.x, m.y - c.y);
    if (d < UI.hexSize * 0.95 && d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

// ---------- Rendu ----------
function assombrir(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * f), g = Math.floor(((n >> 8) & 255) * f), b = Math.floor((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function dessiner() {
  const { ctx, canvas } = UI;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1a2634';
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  ctx.translate(UI.cam.x, UI.cam.y);
  ctx.scale(UI.cam.zoom, UI.cam.zoom);

  const s = UI.hexSize;
  const selection = UI.selection >= 0 ? G.provinces[UI.selection] : null;
  const ciblesValides = new Set();
  if (selection && selection.proprietaire === G.joueur) {
    for (const vid of voisinsHex(selection.col, selection.row)) {
      const v = G.provinces[vid];
      if (v.terrain === 'eau') continue;
      if (v.proprietaire === G.joueur || peutAttaquer(UI.selection, vid) ||
          (v.proprietaire >= 0 && v.proprietaire !== G.joueur)) {
        ciblesValides.add(vid);
      }
    }
  }

  for (const p of G.provinces) {
    const c = hexCentre(p.col, p.row);
    const pts = hexSommets(c.x, c.y, s - 1.5);

    // Fond terrain
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    let base = TERRAINS[p.terrain].couleur;
    ctx.fillStyle = base;
    ctx.fill();

    // Teinte du propriétaire
    if (p.proprietaire >= 0) {
      ctx.fillStyle = nation(p.proprietaire).couleur + 'b8';
      ctx.fill();
    } else if (p.terrain !== 'eau') {
      ctx.fillStyle = '#00000030';
      ctx.fill();
    }

    // Bordure
    if (UI.selection === p.id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
    } else if (ciblesValides.has(p.id)) {
      const hostile = p.proprietaire !== G.joueur;
      ctx.strokeStyle = hostile ? '#ff5544' : '#66ddff';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = p.proprietaire >= 0 ? assombrir(nation(p.proprietaire).couleur, 0.6) : '#00000055';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    if (p.terrain === 'eau') continue;

    // Icônes : capitale, fort
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let icones = '';
    if (p.capitale) icones += '★';
    if (p.batiments.fort > 0) icones += '🏰';
    if (icones) {
      ctx.font = `${s * 0.38}px sans-serif`;
      ctx.fillStyle = '#ffe9a0';
      ctx.fillText(icones, c.x, c.y - s * 0.42);
    }

    // Troupes
    if (p.troupes > 0) {
      const grise = p.proprietaire === G.joueur && p.aBouge;
      ctx.beginPath();
      ctx.arc(c.x, c.y + s * 0.1, s * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = grise ? '#555c66' : '#12181f';
      ctx.fill();
      ctx.strokeStyle = p.proprietaire >= 0 ? nation(p.proprietaire).couleur : '#999';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `bold ${s * 0.34}px sans-serif`;
      ctx.fillStyle = grise ? '#aaa' : '#fff';
      ctx.fillText(p.troupes, c.x, c.y + s * 0.12);
    }

    // Nom de la province (zoom suffisant)
    if (UI.cam.zoom > 0.75) {
      ctx.font = `${s * 0.22}px sans-serif`;
      ctx.fillStyle = '#ffffffcc';
      ctx.fillText(p.nom, c.x, c.y + s * 0.62);
    }
  }
}

// ---------- Gestes (souris + tactile) ----------
function initGestes() {
  const cv = UI.canvas;

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    UI.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    UI.dragDist = 0;
    if (UI.pointers.size === 2) {
      const [a, b] = [...UI.pointers.values()];
      UI.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  cv.addEventListener('pointermove', e => {
    if (!UI.pointers.has(e.pointerId)) return;
    const prev = UI.pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    UI.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (UI.pointers.size === 1) {
      UI.dragDist += Math.abs(dx) + Math.abs(dy);
      UI.cam.x += dx;
      UI.cam.y += dy;
      dessiner();
    } else if (UI.pointers.size === 2) {
      const [a, b] = [...UI.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (UI.lastPinch > 0) {
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        zoomVers(cx, cy, d / UI.lastPinch);
      }
      UI.lastPinch = d;
      UI.dragDist += 10;
    }
  });

  const finPointer = e => {
    UI.pointers.delete(e.pointerId);
    UI.lastPinch = 0;
    if (UI.pointers.size === 0 && UI.dragDist < 12) {
      const rect = cv.getBoundingClientRect();
      gererTap(e.clientX - rect.left, e.clientY - rect.top);
    }
  };
  cv.addEventListener('pointerup', finPointer);
  cv.addEventListener('pointercancel', e => { UI.pointers.delete(e.pointerId); UI.lastPinch = 0; });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    zoomVers(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.9);
  }, { passive: false });
}

function zoomVers(px, py, facteur) {
  const avant = ecranVersMonde(px, py);
  UI.cam.zoom = clamp(UI.cam.zoom * facteur, 0.35, 2.5);
  UI.cam.x = px - avant.x * UI.cam.zoom;
  UI.cam.y = py - avant.y * UI.cam.zoom;
  dessiner();
}

function centrerSurJoueur() {
  const cap = provincesDe(G.joueur).find(p => p.capitale) || provincesDe(G.joueur)[0];
  if (!cap) return;
  const c = hexCentre(cap.col, cap.row);
  const dpr = window.devicePixelRatio || 1;
  UI.cam.zoom = 0.8;
  UI.cam.x = UI.canvas.width / dpr / 2 - c.x;
  UI.cam.y = UI.canvas.height / dpr / 2 - c.y;
}

// ---------- Interaction : tap sur la carte ----------
function gererTap(px, py) {
  if (G.fini) return;
  const pid = provinceSousPoint(px, py);
  if (pid < 0) { deselectionner(); return; }
  const p = G.provinces[pid];
  if (p.terrain === 'eau') { deselectionner(); return; }

  const sel = UI.selection >= 0 ? G.provinces[UI.selection] : null;

  // Une province à moi est sélectionnée → tenter action sur la cible
  if (sel && sel.proprietaire === G.joueur && pid !== UI.selection &&
      voisinsHex(sel.col, sel.row).includes(pid)) {
    if (p.proprietaire === G.joueur) {
      ouvrirDeplacement(UI.selection, pid);
      return;
    }
    if (peutAttaquer(UI.selection, pid)) {
      ouvrirAttaque(UI.selection, pid);
      return;
    }
    if (p.proprietaire >= 0 && !enGuerre(G.joueur, p.proprietaire)) {
      ouvrirConfirmation(
        `Déclarer la guerre ?`,
        `Attaquer ${p.nom} exige de déclarer la guerre à ${nation(p.proprietaire).nom}. Leurs alliés pourraient s'en mêler.`,
        () => {
          const r = declarerGuerre(G.joueur, p.proprietaire);
          if (!r.ok) toast(r.raison || 'Impossible');
          majTout();
        });
      return;
    }
    if (sel.aBouge) { toast('Cette armée a déjà agi ce tour.'); return; }
  }

  // Sinon : sélectionner
  UI.selection = pid;
  afficherPanneauProvince(pid);
  dessiner();
}

function deselectionner() {
  UI.selection = -1;
  document.getElementById('panneau-province').classList.remove('ouvert');
  dessiner();
}

// ---------- Panneaux ----------
function afficherPanneauProvince(pid) {
  const p = G.provinces[pid];
  const el = document.getElementById('panneau-province');
  const n = p.proprietaire >= 0 ? nation(p.proprietaire) : null;
  const t = TERRAINS[p.terrain];
  const monTour = p.proprietaire === G.joueur;
  const ere = n ? n.ere : 0;

  let html = `<div class="pp-titre">
    <span class="pastille" style="background:${n ? n.couleur : '#777'}"></span>
    <b>${p.nom}</b> ${p.capitale ? '★' : ''}
    <span class="pp-sous">${t.nom} · ${n ? n.nom : 'Indépendante'}</span>
    <button class="fermer" onclick="deselectionner()">✕</button>
  </div>
  <div class="pp-stats">
    <span>🌾 ${t.nourriture + p.batiments.ferme * 3}</span>
    <span>💰 ${t.or + p.batiments.marche * 3}</span>
    <span>🔬 ${t.science + p.batiments.ecole * 3}</span>
    <span>⚔️ ${p.troupes} ${monTour && p.aBouge ? '(a agi)' : ''}</span>
    <span>🛡️ ×${(t.defense * (1 + p.batiments.fort * BATIMENTS.fort.bonus)).toFixed(1)}</span>
  </div>`;

  if (monTour) {
    const moi = nation(G.joueur);
    html += `<div class="pp-actions">
      <button class="btn btn-recruter" onclick="uiRecruter(${pid},1)">+1 ${ERES[moi.ere].unite}<br><small>${COUT_RECRUE_OR}💰 ${COUT_RECRUE_NOURRITURE}🌾</small></button>
      <button class="btn btn-recruter" onclick="uiRecruter(${pid},5)">+5<br><small>${COUT_RECRUE_OR * 5}💰 ${COUT_RECRUE_NOURRITURE * 5}🌾</small></button>
    </div><div class="pp-batiments">`;
    for (const [type, def] of Object.entries(BATIMENTS)) {
      const niv = p.batiments[type];
      const nomEre = NOMS_BATIMENTS_PAR_ERE[type][ere];
      if (niv >= NIVEAU_MAX_BATIMENT) {
        html += `<button class="btn btn-bat" disabled>${def.icone} ${nomEre}<br><small>MAX (${niv})</small></button>`;
      } else {
        const cout = coutBatiment(type, niv, moi.ere);
        html += `<button class="btn btn-bat" onclick="uiConstruire(${pid},'${type}')">${def.icone} ${nomEre} ${niv > 0 ? 'niv.' + (niv + 1) : ''}<br><small>${cout}💰</small></button>`;
      }
    }
    html += `</div><div class="pp-aide">Touchez une case voisine : la vôtre = déplacer · ennemie = attaquer</div>`;
  } else if (n) {
    html += `<div class="pp-actions">
      <button class="btn" onclick="ouvrirDiplomatieAvec(${n.id})">🕊️ Diplomatie avec ${n.nom}</button>
    </div>`;
  } else {
    html += `<div class="pp-aide">Province indépendante — attaquable sans déclaration de guerre.</div>`;
  }

  el.innerHTML = html;
  el.classList.add('ouvert');
}

function uiRecruter(pid, q) {
  const r = recruter(pid, q);
  if (!r.ok) toast(r.raison);
  majTout();
  afficherPanneauProvince(pid);
}

function uiConstruire(pid, type) {
  const r = construire(pid, type);
  if (!r.ok) toast(r.raison);
  else toast(`${BATIMENTS[type].icone} ${BATIMENTS[type].nom} amélioré !`);
  majTout();
  afficherPanneauProvince(pid);
}

// ---------- Modales génériques ----------
function ouvrirModale(html) {
  const fond = document.getElementById('modale-fond');
  document.getElementById('modale-contenu').innerHTML = html;
  fond.classList.add('ouvert');
}
function fermerModale() {
  document.getElementById('modale-fond').classList.remove('ouvert');
}

function ouvrirConfirmation(titre, texte, action) {
  UI._confirmation = action;
  ouvrirModale(`<h2>${titre}</h2><p>${texte}</p>
    <div class="rangee-btn">
      <button class="btn btn-danger" onclick="UI._confirmation();fermerModale()">Confirmer</button>
      <button class="btn" onclick="fermerModale()">Annuler</button>
    </div>`);
}

// ---------- Attaque / déplacement ----------
function ouvrirAttaque(source, cible) {
  const s = G.provinces[source], c = G.provinces[cible];
  const defNom = c.proprietaire >= 0 ? nation(c.proprietaire).nom : 'Indépendants';
  const engages = s.troupes - 1;
  const puissDef = Math.max(1, c.troupes) *
    (c.proprietaire >= 0 ? ERES[nation(c.proprietaire).ere].puissance : 1) *
    (1 + c.batiments.fort * BATIMENTS.fort.bonus) * TERRAINS[c.terrain].defense;
  const puissAtt = engages * ERES[nation(G.joueur).ere].puissance;
  const chances = puissAtt > puissDef * 1.3 ? 'Très favorables' : puissAtt > puissDef ? 'Favorables' : puissAtt > puissDef * 0.7 ? 'Incertaines' : 'Défavorables';

  UI._attaque = () => {
    const r = resoudreAttaque(source, cible);
    toast(r.victoire ? `🎉 Victoire ! ${c.nom} est à vous (−${r.pertes} pertes).` : `💥 Défaite… ${r.pertes} soldats perdus.`);
    deselectionner();
    majTout();
    if (G.fini) verifierFinPartie();
  };
  ouvrirModale(`<h2>⚔️ Attaquer ${c.nom}</h2>
    <p>${defNom} — garnison de <b>${c.troupes}</b> ${c.batiments.fort ? '· 🏰 forteresse' : ''} · terrain ${TERRAINS[c.terrain].nom.toLowerCase()}</p>
    <p>Vous engagez <b>${engages}</b> ${ERES[nation(G.joueur).ere].unite} (1 reste en garnison).</p>
    <p>Estimation : <b>${chances}</b></p>
    <div class="rangee-btn">
      <button class="btn btn-danger" onclick="UI._attaque();fermerModale()">À l'assaut !</button>
      <button class="btn" onclick="fermerModale()">Annuler</button>
    </div>`);
}

function ouvrirDeplacement(source, cible) {
  const s = G.provinces[source], c = G.provinces[cible];
  if (s.aBouge) { toast('Cette armée a déjà agi ce tour.'); return; }
  if (s.troupes < 2) { toast('Pas assez de troupes (1 doit rester).'); return; }
  const max = s.troupes - 1;
  ouvrirModale(`<h2>➡️ Déplacer vers ${c.nom}</h2>
    <p>${s.nom} : ${s.troupes} troupes → déplacer <b><span id="dep-val">${max}</span></b></p>
    <input type="range" id="dep-slider" min="1" max="${max}" value="${max}"
      oninput="document.getElementById('dep-val').textContent=this.value">
    <div class="rangee-btn">
      <button class="btn btn-principal" onclick="uiDeplacer(${source},${cible})">Déplacer</button>
      <button class="btn" onclick="fermerModale()">Annuler</button>
    </div>`);
}

function uiDeplacer(source, cible) {
  const q = parseInt(document.getElementById('dep-slider').value, 10);
  const r = deplacerTroupes(source, cible, q);
  if (!r.ok) toast(r.raison || 'Impossible');
  fermerModale();
  deselectionner();
  majTout();
}

// ---------- Diplomatie ----------
function ouvrirDiplomatie() {
  const moi = nation(G.joueur);
  let html = `<h2>🕊️ Diplomatie</h2><div class="liste-nations">`;
  for (const n of G.nations) {
    if (n.id === G.joueur || !n.vivante) continue;
    const rel = moi.relations[n.id];
    const relCouleur = rel > 30 ? '#5c5' : rel < -30 ? '#e55' : '#cc5';
    let statut = [];
    if (enGuerre(G.joueur, n.id)) statut.push('⚡ EN GUERRE');
    if (allies(G.joueur, n.id)) statut.push('🤝 Allié');
    if (aPacte(G.joueur, n.id)) statut.push('📜 Pacte');
    if (n.vassalDe === G.joueur) statut.push('👑 Votre vassal');
    if (moi.vassalDe === n.id) statut.push('⛓️ Votre suzerain');
    html += `<div class="carte-nation" onclick="ouvrirDiplomatieAvec(${n.id})">
      <span class="pastille" style="background:${n.couleur}"></span>
      <div class="cn-info">
        <b>${n.nom}</b>
        <small>${PERSONNALITES[n.perso].nom} · ${ERES[n.ere].nom} · ${provincesDe(n.id).length} provinces · ⚔️ ${Math.round(puissanceMilitaire(n.id))}</small>
        ${statut.length ? `<small class="statut">${statut.join(' · ')}</small>` : ''}
      </div>
      <span class="rel" style="color:${relCouleur}">${rel > 0 ? '+' : ''}${rel}</span>
    </div>`;
  }
  html += `</div><div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`;
  ouvrirModale(html);
}

function ouvrirDiplomatieAvec(nid) {
  const moi = nation(G.joueur);
  const n = nation(nid);
  const rel = moi.relations[nid];
  const guerre = enGuerre(G.joueur, nid);
  const allie = allies(G.joueur, nid);
  const pacte = aPacte(G.joueur, nid);
  const monVassal = n.vassalDe === G.joueur;

  let boutons = '';
  if (guerre) {
    boutons += `<button class="btn btn-principal" onclick="uiDiplo('paix',${nid},0)">🕊️ Proposer la paix</button>`;
    boutons += `<button class="btn" onclick="uiDiplo('paix',${nid},50)">🕊️ Paix + 50 💰</button>`;
  } else {
    if (!allie) boutons += `<button class="btn btn-principal" onclick="uiDiplo('alliance',${nid})">🤝 Proposer une alliance</button>`;
    else boutons += `<button class="btn btn-danger" onclick="uiDiplo('rompre',${nid})">💔 Rompre l'alliance</button>`;
    if (!pacte && !allie) boutons += `<button class="btn" onclick="uiDiplo('pacte',${nid})">📜 Pacte de non-agression</button>`;
    boutons += `<button class="btn" onclick="uiDiplo('cadeau',${nid},50)">🎁 Cadeau (50 💰)</button>`;
    if (!monVassal && moi.vassalDe === -1) boutons += `<button class="btn" onclick="uiDiplo('vassal',${nid})">👑 Exiger la vassalité</button>`;
    if (monVassal) boutons += `<button class="btn" onclick="uiDiplo('liberer',${nid})">🕊️ Libérer ce vassal</button>`;
    if (!allie && !pacte && !monVassal) boutons += `<button class="btn btn-danger" onclick="uiDiplo('guerre',${nid})">⚡ Déclarer la guerre</button>`;
  }

  ouvrirModale(`<h2><span class="pastille" style="background:${n.couleur}"></span> ${n.nom}</h2>
    <p>${PERSONNALITES[n.perso].nom} · ${ERES[n.ere].nom} · ${provincesDe(nid).length} provinces · ⚔️ ${Math.round(puissanceMilitaire(nid))} · Relations : <b>${rel > 0 ? '+' : ''}${rel}</b></p>
    <div class="colonne-btn">${boutons}</div>
    <div class="rangee-btn"><button class="btn" onclick="ouvrirDiplomatie()">← Retour</button></div>`);
}

function uiDiplo(action, nid, montant = 0) {
  let r = { ok: false };
  switch (action) {
    case 'paix': r = proposerPaix(G.joueur, nid, montant); break;
    case 'alliance': r = proposerAlliance(G.joueur, nid); break;
    case 'rompre': romprAlliance(G.joueur, nid); r = { ok: true }; break;
    case 'pacte': r = proposerPacte(G.joueur, nid); break;
    case 'cadeau': r = envoyerCadeau(G.joueur, nid, montant); break;
    case 'vassal': r = demanderVassalite(G.joueur, nid); break;
    case 'liberer': r = liberer(G.joueur, nid); break;
    case 'guerre': r = declarerGuerre(G.joueur, nid); break;
  }
  if (!r.ok && r.raison) toast(r.raison);
  majTout();
  ouvrirDiplomatieAvec(nid);
}

// ---------- Technologie ----------
function ouvrirTechnologie() {
  const moi = nation(G.joueur);
  const rev = revenus(G.joueur);
  let html = `<h2>🔬 Technologie</h2>
    <p>Science : <b>${Math.floor(moi.science)}</b> (+${rev.science}/tour)</p>
    <div class="liste-eres">`;
  for (const e of ERES) {
    const atteinte = moi.ere >= e.id;
    const actuelle = moi.ere === e.id;
    html += `<div class="carte-ere ${atteinte ? 'atteinte' : ''} ${actuelle ? 'actuelle' : ''}">
      <span class="ere-icone">${e.icone}</span>
      <div><b>${e.nom}</b><small>${e.unite} · puissance ×${e.puissance}${e.seuil > 0 ? ` · ${e.seuil} 🔬` : ''}</small></div>
      ${actuelle ? '<span class="badge">ACTUELLE</span>' : atteinte ? '<span class="badge ok">✓</span>' : ''}
    </div>`;
  }
  html += `</div>`;
  if (moi.ere >= 4) {
    if (moi.ascensionActive) {
      html += `<div class="carte-ere actuelle"><span class="ere-icone">🌌</span>
        <div><b>${PROJET_ASCENSION.nom}</b><small>En cours : ${moi.ascension}/${PROJET_ASCENSION.tours} tours</small></div></div>`;
    } else {
      html += `<button class="btn btn-principal" onclick="uiAscension()">🌌 Lancer ${PROJET_ASCENSION.nom} (${PROJET_ASCENSION.cout} 🔬)<br><small>Victoire scientifique en ${PROJET_ASCENSION.tours} tours</small></button>`;
    }
  }
  html += `<div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`;
  ouvrirModale(html);
}

function uiAscension() {
  const r = lancerAscension(G.joueur);
  if (!r.ok) toast(r.raison);
  majTout();
  ouvrirTechnologie();
}

// ---------- Journal ----------
function ouvrirJournal() {
  let html = `<h2>📜 Chroniques</h2><div class="journal">`;
  for (const l of G.journal) html += `<div class="ligne-journal"><small>Tour ${l.tour}</small> ${l.txt}</div>`;
  html += `</div><div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`;
  ouvrirModale(html);
}

// ---------- Événements à choix ----------
function afficherEvenement(ev) {
  let boutons = '';
  ev.choix.forEach((c, i) => {
    const effets = Object.entries(c.effets).map(([k, v]) => {
      const ic = { or: '💰', nourriture: '🌾', science: '🔬', stabilite: '🏛️', troupes: '⚔️', relationsTous: '🕊️' }[k];
      return `${v > 0 ? '+' : ''}${v}${ic}`;
    }).join(' ');
    boutons += `<button class="btn btn-choix" onclick="uiChoixEvenement(${i})">${c.label}<br><small>${effets || '—'}</small></button>`;
  });
  UI._evenement = ev;
  ouvrirModale(`<h2>📯 ${ev.titre}</h2><p>${ev.texte}</p><div class="colonne-btn">${boutons}</div>`);
}

function uiChoixEvenement(i) {
  appliquerChoix(UI._evenement, i);
  UI._evenement = null;
  fermerModale();
  majTout();
}

// ---------- Fin de tour ----------
function uiFinDeTour() {
  if (G.fini) return;
  deselectionner();
  const { evenementsTour, fin } = finDeTour();
  sauvegarder();
  majTout();

  for (const msg of evenementsTour) toast(msg);
  if (G.message) {
    const m = G.message; G.message = null;
    ouvrirModale(`<h2>${m.titre}</h2><p>${m.texte}</p>
      <div class="rangee-btn"><button class="btn btn-principal" onclick="fermerModale();suiteFinDeTour(${fin ? 'true' : 'false'})">Continuer</button></div>`);
    UI._finEnAttente = fin;
    return;
  }
  suiteFinDeTour(!!fin, fin);
}

function suiteFinDeTour(aFin, fin) {
  fin = fin || UI._finEnAttente;
  UI._finEnAttente = null;
  if (aFin && fin) { afficherFin(fin); return; }
  if (G.fini) { verifierFinPartie(); return; }
  const ev = tirerEvenement();
  if (ev) afficherEvenement(ev);
}

function verifierFinPartie() {
  const fin = verifierVictoire();
  if (fin) afficherFin(fin);
}

function afficherFin(fin) {
  supprimerSauvegarde();
  const victoire = fin.type === 'victoire';
  ouvrirModale(`<h2>${victoire ? '🏆 VICTOIRE' : '💀 DÉFAITE'}</h2>
    <p>${fin.texte}</p>
    <p><small>Partie terminée au tour ${G.tour}, an ${G.annee}.</small></p>
    <div class="rangee-btn"><button class="btn btn-principal" onclick="location.reload()">Nouvelle partie</button></div>`);
}

// ---------- Barre du haut ----------
function majBarre() {
  const moi = nation(G.joueur);
  const rev = revenus(G.joueur);
  const fmt = (v, r) => `${Math.floor(v)}<small class="${r >= 0 ? 'pos' : 'neg'}">${r >= 0 ? '+' : ''}${r}</small>`;
  document.getElementById('barre-haut').innerHTML = `
    <span class="bh-nation"><span class="pastille" style="background:${moi.couleur}"></span>${moi.nom}</span>
    <span title="Or">💰 ${fmt(moi.or, rev.or)}</span>
    <span title="Nourriture">🌾 ${fmt(moi.nourriture, rev.nourriture)}</span>
    <span title="Science">🔬 ${fmt(moi.science, rev.science)}</span>
    <span title="Stabilité">🏛️ ${Math.floor(moi.stabilite)}%</span>
    <span class="bh-ere">${ERES[moi.ere].icone} ${ERES[moi.ere].nom} · An ${G.annee}</span>`;
}

function majTout() {
  majBarre();
  dessiner();
}

// ---------- Notifications ----------
let toastTimer = null;
const toastFile = [];
function toast(msg) {
  toastFile.push(msg);
  if (!toastTimer) prochainToast();
}
function prochainToast() {
  const el = document.getElementById('toast');
  if (toastFile.length === 0) { el.classList.remove('visible'); toastTimer = null; return; }
  el.textContent = toastFile.shift();
  el.classList.add('visible');
  toastTimer = setTimeout(() => { el.classList.remove('visible'); toastTimer = setTimeout(prochainToast, 250); }, 2200);
}

// ---------- Écran titre ----------
function afficherEcranTitre() {
  UI.ecran = 'titre';
  const el = document.getElementById('ecran-titre');
  let cartes = '';
  NATIONS_DEFS.forEach((d, i) => {
    const p = PERSONNALITES[d.perso];
    cartes += `<div class="carte-nation choix-nation" onclick="demarrerPartie(${i})">
      <span class="pastille" style="background:${d.couleur}"></span>
      <div class="cn-info"><b>${d.nom}</b><small>${p.nom}</small></div>
    </div>`;
  });
  el.innerHTML = `
    <div class="titre-bloc">
      <h1>⚔️ Chroniques des Ères</h1>
      <p class="sous-titre">Du Moyen Âge à la conquête des étoiles.<br>Guerre · Diplomatie · Alliances · Technologie</p>
      ${sauvegardeExiste() ? '<button class="btn btn-principal btn-large" onclick="reprendrePartie()">▶️ Reprendre la partie</button>' : ''}
      <h3>Choisissez votre nation</h3>
      <div class="liste-nations">${cartes}</div>
    </div>`;
  el.style.display = 'flex';
  document.getElementById('ecran-jeu').style.display = 'none';
}

function demarrerPartie(nid) {
  supprimerSauvegarde();
  nouvellePartie(nid);
  lancerJeu();
}

function reprendrePartie() {
  if (charger()) lancerJeu();
  else toast('Sauvegarde illisible.');
}

function lancerJeu() {
  UI.ecran = 'jeu';
  document.getElementById('ecran-titre').style.display = 'none';
  document.getElementById('ecran-jeu').style.display = 'block';
  redimensionner();
  centrerSurJoueur();
  majTout();
  toast(`Bienvenue, souverain de ${nation(G.joueur).nom} ! Touchez vos provinces pour agir.`);
}

// ---------- Initialisation ----------
function redimensionner() {
  const cv = UI.canvas;
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  if (UI.ecran === 'jeu' && G) dessiner();
}

window.addEventListener('DOMContentLoaded', () => {
  UI.canvas = document.getElementById('carte');
  UI.ctx = UI.canvas.getContext('2d');
  initGestes();
  window.addEventListener('resize', redimensionner);
  document.getElementById('modale-fond').addEventListener('pointerdown', e => {
    if (e.target.id === 'modale-fond') fermerModale();
  });
  afficherEcranTitre();
});
