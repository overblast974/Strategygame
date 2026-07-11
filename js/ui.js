// ============================================================
// INTERFACE — rendu WebGL (PixiJS), gestes tactiles,
// panneaux, modales, notifications, effets visuels
// ============================================================
'use strict';

const UI = {
  canvas: null,
  app: null,            // PIXI.Application
  monde: null,          // conteneur racine de la carte (caméra)
  couches: {},          // conteneurs par couche
  gfx: {},              // objets Graphics dynamiques
  pool: { noms: new Map(), icones: new Map(), effectifs: new Map(), decor: new Map() },
  particules: [],
  cam: { x: 0, y: 0, zoom: 1 },
  shake: 0,
  temps: 0,
  nomsVisibles: true,
  hexSize: 42,
  selection: -1,
  pointers: new Map(),
  dragDist: 0,
  lastPinch: 0,
  ecran: 'titre',
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

// ---------- Couleurs ----------
function couleurNum(hex) { return parseInt(hex.slice(1), 16); }

function assombrirNum(hex, f) {
  const n = couleurNum(hex);
  const r = Math.min(255, Math.floor(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.floor(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.floor((n & 255) * f));
  return (r << 16) | (g << 8) | b;
}

function assombrir(hex, f) {
  const n = assombrirNum(hex, f);
  return '#' + n.toString(16).padStart(6, '0');
}

// Variation déterministe par province (casse l'uniformité des couleurs)
function hashProvince(id) {
  return ((id * 2654435761) % 97) / 97;
}

// Sommets partagés entre un hexagone et son voisin (pour tracer les frontières)
function areteVers(pts, cVoisin) {
  const tri = pts
    .map(pt => ({ pt, d: Math.hypot(pt[0] - cVoisin.x, pt[1] - cVoisin.y) }))
    .sort((a, b) => a.d - b.d);
  return [tri[0].pt, tri[1].pt];
}

const DECOR_TERRAIN = { foret: '🌲', montagne: '⛰️', desert: '🌵', colline: '🌿', toundra: '❄️' };

// ---------- Initialisation PixiJS ----------
function initPixi() {
  UI.app = new PIXI.Application({
    view: UI.canvas,
    resizeTo: window,
    antialias: true,
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  UI.monde = new PIXI.Container();
  UI.app.stage.addChild(UI.monde);

  // Couches (ordre de dessin)
  for (const nom of ['eau', 'vagues', 'terrain', 'politique', 'frontieres', 'decor',
                     'surbrillance', 'unites', 'icones', 'noms', 'fx']) {
    UI.couches[nom] = new PIXI.Container();
    UI.monde.addChild(UI.couches[nom]);
  }
  // Graphics partagés
  for (const nom of ['eau', 'vagues', 'terrain', 'politique', 'frontieres', 'cibles', 'selection', 'unites']) {
    UI.gfx[nom] = new PIXI.Graphics();
  }
  UI.couches.eau.addChild(UI.gfx.eau);
  UI.couches.vagues.addChild(UI.gfx.vagues);
  UI.couches.terrain.addChild(UI.gfx.terrain);
  UI.couches.politique.addChild(UI.gfx.politique);
  UI.couches.frontieres.addChild(UI.gfx.frontieres);
  UI.couches.surbrillance.addChild(UI.gfx.cibles);
  UI.couches.surbrillance.addChild(UI.gfx.selection);
  UI.couches.unites.addChild(UI.gfx.unites);

  UI.app.ticker.add(() => tick());
}

function viderPools() {
  for (const pool of Object.values(UI.pool)) {
    for (const obj of pool.values()) obj.destroy();
    pool.clear();
  }
  for (const p of UI.particules) p.gfx.destroy();
  UI.particules = [];
}

// Construit les couches statiques (terrain, eau, décorations, noms) — une fois par partie
function construireCarteStatique() {
  viderPools();
  const s = UI.hexSize;

  const gEau = UI.gfx.eau; gEau.clear();
  const gVagues = UI.gfx.vagues; gVagues.clear();
  const gTerrain = UI.gfx.terrain; gTerrain.clear();

  for (const p of G.provinces) {
    const c = hexCentre(p.col, p.row);
    const h = hashProvince(p.id);

    if (p.terrain === 'eau') {
      const pts = hexSommets(c.x, c.y, s + 0.5);
      // Eaux côtières plus claires, océan profond plus sombre
      const cotier = voisinsHex(p.col, p.row).some(i => G.provinces[i].terrain !== 'eau');
      const teinte = cotier
        ? (h < 0.5 ? 0x3c6f92 : 0x407598)
        : (h < 0.33 ? 0x28506e : h < 0.66 ? 0x2b5573 : 0x254a66);
      gEau.beginFill(teinte);
      gEau.drawPolygon(pts.flat());
      gEau.endFill();
      if (h > 0.45) {
        gVagues.lineStyle(1.5, 0xffffff, 0.12);
        for (let w = 0; w < 2; w++) {
          const wx = c.x + (h - 0.5) * s * 0.8 - 8 + w * 14;
          const wy = c.y + (w - 0.5) * s * 0.5;
          const a0 = Math.PI * 0.15;
          // moveTo au départ de l'arc, sinon Pixi trace une corde de liaison
          gVagues.moveTo(wx + Math.cos(a0) * 6, wy + Math.sin(a0) * 6);
          gVagues.arc(wx, wy, 6, a0, Math.PI * 0.85);
        }
        gVagues.lineStyle(0);
      }
      continue;
    }

    const pts = hexSommets(c.x, c.y, s - 0.5);
    const varia = 0.92 + h * 0.16;
    gTerrain.beginFill(assombrirNum(TERRAINS[p.terrain].couleur, varia));
    gTerrain.drawPolygon(pts.flat());
    gTerrain.endFill();
    // Relief pseudo-3D : arête claire en haut, sombre en bas
    gTerrain.lineStyle(2, 0xffffff, 0.13);
    gTerrain.moveTo(pts[3][0], pts[3][1]);
    gTerrain.lineTo(pts[4][0], pts[4][1]);
    gTerrain.lineTo(pts[5][0], pts[5][1]);
    gTerrain.lineStyle(2, 0x000000, 0.25);
    gTerrain.moveTo(pts[0][0], pts[0][1]);
    gTerrain.lineTo(pts[1][0], pts[1][1]);
    gTerrain.lineTo(pts[2][0], pts[2][1]);
    // Maillage discret
    gTerrain.lineStyle(1, 0x000000, 0.19);
    gTerrain.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) gTerrain.lineTo(pts[i][0], pts[i][1]);
    gTerrain.closePath();
    gTerrain.lineStyle(0);

    // Décoration de terrain
    const decor = DECOR_TERRAIN[p.terrain];
    if (decor) {
      const txt = new PIXI.Text(decor, { fontSize: s * 0.3 });
      txt.anchor.set(0.5);
      txt.alpha = 0.75;
      txt.position.set(c.x - s * 0.48, c.y - s * 0.3);
      UI.couches.decor.addChild(txt);
      UI.pool.decor.set(p.id, txt);
    }

    // Nom de la province (ombre portée via style)
    const nom = new PIXI.Text(p.nom, {
      fontFamily: 'sans-serif', fontSize: s * 0.2, fontWeight: '600',
      fill: 0xffffff, dropShadow: true, dropShadowDistance: 1,
      dropShadowAlpha: 0.7, dropShadowBlur: 1,
    });
    nom.anchor.set(0.5);
    nom.alpha = 0.85;
    nom.position.set(c.x, c.y + s * 0.62);
    UI.couches.noms.addChild(nom);
    UI.pool.noms.set(p.id, nom);
  }
}

// ---------- Mise à jour de la scène (état du jeu → affichage) ----------
function dessiner() {
  if (!UI.app || !G) return;
  const s = UI.hexSize;

  // Cibles valides depuis la sélection
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

  const gPol = UI.gfx.politique; gPol.clear();
  const gFro = UI.gfx.frontieres; gFro.clear();
  const gCib = UI.gfx.cibles; gCib.clear();
  const gSel = UI.gfx.selection; gSel.clear();
  const gUni = UI.gfx.unites; gUni.clear();

  for (const p of G.provinces) {
    if (p.terrain === 'eau') continue;
    const c = hexCentre(p.col, p.row);
    const pts = hexSommets(c.x, c.y, s - 0.5);

    // Teinte politique
    if (p.proprietaire >= 0) {
      gPol.beginFill(couleurNum(nation(p.proprietaire).couleur), 0.61);
      gPol.drawPolygon(pts.flat());
      gPol.endFill();
    } else {
      gPol.beginFill(0x000000, 0.22);
      gPol.drawPolygon(pts.flat());
      gPol.endFill();
    }

    // Côtes et frontières nationales
    for (const vid of voisinsHex(p.col, p.row)) {
      const v = G.provinces[vid];
      const cv = hexCentre(v.col, v.row);
      if (v.terrain === 'eau') {
        const [a, b] = areteVers(pts, cv);
        gFro.lineStyle(2.5, 0xe8d9a0, 0.4);
        gFro.moveTo(a[0], a[1]);
        gFro.lineTo(b[0], b[1]);
      } else if (v.proprietaire !== p.proprietaire) {
        const [a, b] = areteVers(pts, cv);
        const coul = p.proprietaire >= 0 ? assombrirNum(nation(p.proprietaire).couleur, 1.35) : 0x111111;
        gFro.lineStyle(3, coul, p.proprietaire >= 0 ? 1 : 0.6);
        gFro.moveTo(a[0], a[1]);
        gFro.lineTo(b[0], b[1]);
      }
    }
    gFro.lineStyle(0);

    // Icônes capitale / cité-état / forteresse (pool)
    let icones = '';
    if (p.capitale) icones += '👑';
    if (p.citeEtat) icones += '🏛️';
    if (p.batiments.fort > 0 && !p.citeEtat) icones += '🏰';
    let icoTxt = UI.pool.icones.get(p.id);
    if (icones) {
      if (!icoTxt) {
        icoTxt = new PIXI.Text('', { fontSize: s * 0.36 });
        icoTxt.anchor.set(0.5);
        icoTxt.position.set(c.x, c.y - s * 0.46);
        UI.couches.icones.addChild(icoTxt);
        UI.pool.icones.set(p.id, icoTxt);
      }
      icoTxt.text = icones;
      icoTxt.visible = true;
    } else if (icoTxt) {
      icoTxt.visible = false;
    }

    // Pions de troupes
    let effTxt = UI.pool.effectifs.get(p.id);
    if (p.troupes > 0) {
      const grise = p.proprietaire === G.joueur && p.aBouge;
      gUni.lineStyle(2, p.proprietaire >= 0 ? couleurNum(nation(p.proprietaire).couleur) : 0x999999);
      gUni.beginFill(grise ? 0x4a525c : 0x141b24);
      gUni.drawCircle(c.x, c.y + s * 0.08, s * 0.3);
      gUni.endFill();
      gUni.lineStyle(0);
      if (!effTxt) {
        effTxt = new PIXI.Text('', {
          fontFamily: 'sans-serif', fontSize: s * 0.32, fontWeight: 'bold', fill: 0xffffff,
        });
        effTxt.anchor.set(0.5);
        effTxt.position.set(c.x, c.y + s * 0.1);
        UI.couches.unites.addChild(effTxt);
        UI.pool.effectifs.set(p.id, effTxt);
      }
      effTxt.text = String(p.troupes);
      effTxt.style.fill = grise ? 0x9aa4ae : 0xffffff;
      effTxt.visible = true;
    } else if (effTxt) {
      effTxt.visible = false;
    }
  }

  // Surbrillance des cibles (pulse animé dans tick)
  for (const pid of ciblesValides) {
    const p = G.provinces[pid];
    const c = hexCentre(p.col, p.row);
    const hostile = p.proprietaire !== G.joueur;
    gCib.lineStyle(3, hostile ? 0xff5544 : 0x66ddff, 1);
    gCib.drawPolygon(hexSommets(c.x, c.y, s - 3).flat());
    gCib.lineStyle(0);
  }

  // Sélection (halo + trait, pulse dans tick)
  if (selection) {
    const c = hexCentre(selection.col, selection.row);
    gSel.lineStyle(9, 0xffffff, 0.25);
    gSel.drawPolygon(hexSommets(c.x, c.y, s - 2).flat());
    gSel.lineStyle(3.5, 0xffffff, 1);
    gSel.drawPolygon(hexSommets(c.x, c.y, s - 2).flat());
    gSel.lineStyle(0);
  }
}

// ---------- Boucle d'animation ----------
function tick() {
  if (!UI.app) return;
  const dms = UI.app.ticker.deltaMS;
  UI.temps += dms / 1000;

  // Caméra + tremblement d'écran
  let sx = 0, sy = 0;
  if (UI.shake > 0.3) {
    sx = (Math.random() - 0.5) * UI.shake;
    sy = (Math.random() - 0.5) * UI.shake;
    UI.shake *= Math.pow(0.86, dms / 16.7);
  } else {
    UI.shake = 0;
  }
  UI.monde.position.set(UI.cam.x + sx, UI.cam.y + sy);
  UI.monde.scale.set(UI.cam.zoom);

  // Pulsations
  UI.gfx.selection.alpha = 0.65 + 0.35 * Math.sin(UI.temps * 5);
  UI.gfx.cibles.alpha = 0.55 + 0.45 * Math.sin(UI.temps * 4);
  UI.gfx.vagues.alpha = 0.5 + 0.5 * Math.sin(UI.temps * 1.2);

  // Noms visibles selon le zoom
  const voulu = UI.cam.zoom > 0.75;
  if (voulu !== UI.nomsVisibles) {
    UI.nomsVisibles = voulu;
    UI.couches.noms.visible = voulu;
  }

  // Particules
  if (UI.particules.length) {
    for (let i = UI.particules.length - 1; i >= 0; i--) {
      const pa = UI.particules[i];
      pa.vie -= dms / 1000;
      pa.gfx.x += pa.vx * dms / 1000;
      pa.gfx.y += pa.vy * dms / 1000;
      pa.vy += 60 * dms / 1000;
      pa.gfx.alpha = Math.max(0, pa.vie / pa.vieMax);
      if (pa.vie <= 0) {
        pa.gfx.destroy();
        UI.particules.splice(i, 1);
      }
    }
  }
}

// Explosion de particules (bataille)
function fxExplosion(x, y, couleur, nombre = 16) {
  for (let i = 0; i < nombre; i++) {
    const g = new PIXI.Graphics();
    g.beginFill(couleur, 1);
    g.drawCircle(0, 0, 1.5 + Math.random() * 2.5);
    g.endFill();
    g.position.set(x, y);
    UI.couches.fx.addChild(g);
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 140;
    UI.particules.push({
      gfx: g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
      vie: 0.5 + Math.random() * 0.4, vieMax: 0.9,
    });
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
  UI.cam.zoom = clamp(UI.cam.zoom * facteur, 0.14, 2.5);
  UI.cam.x = px - avant.x * UI.cam.zoom;
  UI.cam.y = py - avant.y * UI.cam.zoom;
}

function centrerSurJoueur() {
  const cap = provincesDe(G.joueur).find(p => p.capitale) || provincesDe(G.joueur)[0];
  if (!cap) return;
  const c = hexCentre(cap.col, cap.row);
  UI.cam.zoom = 0.8;
  UI.cam.x = UI.app.screen.width / 2 - c.x * UI.cam.zoom;
  UI.cam.y = UI.app.screen.height / 2 - c.y * UI.cam.zoom;
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

  const bien = TERRAIN_BIEN[p.terrain];
  const prodBien = bien ? 2 + p.batiments.exploitation * BATIMENTS.exploitation.bonus : 0;
  let html = `<div class="pp-titre">
    <span class="pastille" style="background:${n ? n.couleur : '#777'}"></span>
    <b>${p.nom}</b> ${p.capitale ? '★' : ''}
    <span class="pp-sous">${t.nom} · ${n ? n.nom : (p.citeEtat ? '🏛️ Cité-état libre' : 'Indépendante')}</span>
    <button class="fermer" onclick="deselectionner()">✕</button>
  </div>
  <div class="pp-stats">
    <span>🌾 ${t.nourriture + p.batiments.ferme * 3}</span>
    <span>💰 ${t.or + p.batiments.marche * 3}</span>
    <span>🔬 ${t.science + p.batiments.ecole * 3}</span>
    ${bien ? `<span>${MARCHANDISES[bien].icone} ${prodBien}</span>` : ''}
    <span>🛡️ ×${(t.defense * (1 + p.batiments.fort * BATIMENTS.fort.bonus)).toFixed(1)}</span>
    <span>⚔️ ${p.troupes} (${TYPES_UNITES.inf.icone}${p.armee.inf} ${TYPES_UNITES.choc.icone}${p.armee.choc} ${TYPES_UNITES.siege.icone}${p.armee.siege})${monTour && p.aBouge ? ' · a agi' : ''}</span>
  </div>`;

  if (monTour) {
    const moi = nation(G.joueur);
    html += `<div class="pp-recrues">`;
    for (const [type, def] of Object.entries(TYPES_UNITES)) {
      const c = def.cout;
      const couts = `${c.or}💰 ${c.nourriture}🌾${c.fer ? ` ${c.fer}⚒️` : ''}${c.pierre ? ` ${c.pierre}🪨` : ''}`;
      html += `<div class="ligne-recrue">
        <div class="lr-info"><b>${def.icone} ${def.noms[moi.ere]}</b><small>${couts}</small></div>
        <button class="btn btn-mini" onclick="uiRecruter(${pid},'${type}',1)">+1</button>
        <button class="btn btn-mini" onclick="uiRecruter(${pid},'${type}',5)">+5</button>
      </div>`;
    }
    html += `</div><div class="pp-batiments">`;
    for (const [type, def] of Object.entries(BATIMENTS)) {
      if (type === 'exploitation' && !bien) continue;
      const niv = p.batiments[type];
      const nomEre = NOMS_BATIMENTS_PAR_ERE[type][ere];
      if (niv >= NIVEAU_MAX_BATIMENT) {
        html += `<button class="btn btn-bat" disabled>${def.icone} ${nomEre}<br><small>MAX (${niv})</small></button>`;
      } else {
        const cout = coutBatiment(type, niv, moi.ere);
        const mat = coutMateriaux(type, niv);
        const couts = `${cout}💰${mat.bois ? ` ${mat.bois}🪵` : ''}${mat.pierre ? ` ${mat.pierre}🪨` : ''}`;
        html += `<button class="btn btn-bat" onclick="uiConstruire(${pid},'${type}')">${def.icone} ${nomEre} ${niv > 0 ? 'niv.' + (niv + 1) : ''}<br><small>${couts}</small></button>`;
      }
    }
    html += `</div><div class="pp-aide">Touchez une case voisine : la vôtre = déplacer · ennemie = attaquer</div>`;
  } else if (n) {
    html += `<div class="pp-actions">
      <button class="btn" onclick="ouvrirDiplomatieAvec(${n.id})">🕊️ Diplomatie avec ${n.nom}</button>
    </div>`;
  } else if (p.citeEtat) {
    const cout = coutAnnexionCite(p);
    const adjacente = voisinsHex(p.col, p.row).some(i => G.provinces[i].proprietaire === G.joueur);
    html += `<div class="pp-actions">
      <button class="btn btn-principal" style="flex:1" ${adjacente ? '' : 'disabled'} onclick="uiAnnexerCite(${pid})">
        🏛️ Négocier le rattachement<br><small>${cout} 💰${adjacente ? '' : ' · votre territoire doit border la cité'}</small>
      </button>
    </div>
    <div class="pp-aide">Cité-état indépendante : annexable par la négociation… ou par la force.</div>`;
  } else {
    html += `<div class="pp-aide">Province indépendante — attaquable sans déclaration de guerre.</div>`;
  }

  el.innerHTML = html;
  el.classList.add('ouvert');
}

function uiAnnexerCite(pid) {
  const r = annexerCiteEtat(G.joueur, pid);
  if (!r.ok) { toast(r.raison || 'Impossible'); return; }
  toast(`🏛️ ${G.provinces[pid].nom} rejoint votre nation !`);
  deselectionner();
  majTout();
}

function uiRecruter(pid, type, q) {
  const r = recruter(pid, type, q);
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
  const ereDef = c.proprietaire >= 0 ? nation(c.proprietaire).ere : 0;
  const reducSiege = Math.max(0.35, 1 - s.armee.siege * 0.12);
  const puissDef = Math.max(1, forceDefense(c.armee, ereDef)) *
    (1 + c.batiments.fort * BATIMENTS.fort.bonus * reducSiege) * TERRAINS[c.terrain].defense;
  const puissAtt = forceAttaque(s.armee, nation(G.joueur).ere) * engages / Math.max(1, s.troupes);
  const chances = puissAtt > puissDef * 1.3 ? 'Très favorables' : puissAtt > puissDef ? 'Favorables' : puissAtt > puissDef * 0.7 ? 'Incertaines' : 'Défavorables';
  const noteSiege = s.armee.siege > 0 && c.batiments.fort > 0
    ? `<p>💣 Vos armes de siège réduisent la forteresse de ${Math.round((1 - reducSiege) * 100)} %.</p>` : '';

  UI._attaque = () => {
    const r = resoudreAttaque(source, cible);
    const centre = hexCentre(c.col, c.row);
    fxExplosion(centre.x, centre.y, r.victoire ? 0xffd75e : 0xff5544, r.victoire ? 22 : 14);
    UI.shake = r.victoire ? 7 : 11;
    toast(r.victoire ? `🎉 Victoire ! ${c.nom} est à vous (−${r.pertes} pertes).` : `💥 Défaite… ${r.pertes} soldats perdus.`);
    deselectionner();
    majTout();
    if (G.fini) verifierFinPartie();
  };
  ouvrirModale(`<h2>⚔️ Attaquer ${c.nom}</h2>
    <p>${defNom} — garnison de <b>${c.troupes}</b> (${TYPES_UNITES.inf.icone}${c.armee.inf} ${TYPES_UNITES.choc.icone}${c.armee.choc} ${TYPES_UNITES.siege.icone}${c.armee.siege}) ${c.batiments.fort ? '· 🏰 forteresse' : ''} · terrain ${TERRAINS[c.terrain].nom.toLowerCase()}</p>
    <p>Vous engagez <b>${engages}</b> unités (${TYPES_UNITES.inf.icone}${s.armee.inf} ${TYPES_UNITES.choc.icone}${s.armee.choc} ${TYPES_UNITES.siege.icone}${s.armee.siege}, 1 reste en garnison).</p>
    ${noteSiege}
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
    if (aAccord(G.joueur, n.id)) statut.push('💱 Commerce');
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
    if (!aAccord(G.joueur, nid)) boutons += `<button class="btn" onclick="uiDiplo('accord',${nid})">💱 Accord commercial (+8 💰/tour chacun)</button>`;
    boutons += `<button class="btn" onclick="ouvrirAchatRessources(${nid})">🛒 Acheter des ressources (−10 % du marché)</button>`;
    boutons += `<button class="btn" onclick="uiDiplo('cadeau',${nid},50)">🎁 Cadeau (50 💰)</button>`;
    boutons += `<button class="btn btn-danger" onclick="uiDiplo('tribut',${nid})">🪙 Exiger un tribut (menace)</button>`;
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
    case 'accord': r = proposerAccordCommercial(G.joueur, nid); break;
    case 'tribut': r = exigerTribut(G.joueur, nid);
      if (r.ok) toast(`🪙 Tribut de ${r.tribut} 💰 obtenu !`);
      break;
    case 'achatRessource': r = acheterRessourceNation(G.joueur, nid, montant); break;
    case 'cadeau': r = envoyerCadeau(G.joueur, nid, montant); break;
    case 'vassal': r = demanderVassalite(G.joueur, nid); break;
    case 'liberer': r = liberer(G.joueur, nid); break;
    case 'guerre': r = declarerGuerre(G.joueur, nid); break;
  }
  if (!r.ok && r.raison) toast(r.raison);
  majTout();
  ouvrirDiplomatieAvec(nid);
}

// ---------- Commerce ----------
function ouvrirCommerce() {
  const moi = nation(G.joueur);
  const prod = productionMarchandises(G.joueur);
  let html = `<h2>📦 Commerce</h2>
    <p>💰 Trésor : <b>${Math.floor(moi.or)}</b> · Le marché mondial fluctue selon l'offre et la demande.</p>
    <div class="liste-biens">`;
  for (const [bien, def] of Object.entries(MARCHANDISES)) {
    const m = G.marche[bien];
    const tendance = m.prix > def.prixBase * 1.15 ? '📈' : m.prix < def.prixBase * 0.85 ? '📉' : '➖';
    html += `<div class="ligne-bien">
      <div class="lb-info">
        <b>${def.icone} ${def.nom}</b>
        <small>Stock : ${Math.floor(moi.marchandises[bien])} (+${prod[bien]}/tour) · Prix : ${m.prix.toFixed(1)} ${tendance}</small>
      </div>
      <button class="btn btn-mini" onclick="uiMarche('acheter','${bien}')">Acheter 10<br><small>−${prixAchat(bien) * 10}💰</small></button>
      <button class="btn btn-mini btn-principal" onclick="uiMarche('vendre','${bien}')">Vendre 10<br><small>+${prixVente(bien) * 10}💰</small></button>
    </div>`;
  }
  html += `</div>
    <button class="btn" style="width:100%" onclick="uiFetes()">🎉 Organiser des fêtes (${COUT_FETES_EPICES} 🌶️ → +10 🏛️ stabilité)</button>
    <h3 class="titre-section">🏴 Compagnies de mercenaires</h3>`;
  if (G.mercenaires.length === 0) {
    html += `<p><small>Aucune compagnie disponible pour l'instant — elles reviennent régulièrement.</small></p>`;
  }
  G.mercenaires.forEach((cie, i) => {
    html += `<div class="ligne-bien">
      <div class="lb-info">
        <b>${cie.nom}</b>
        <small>${TYPES_UNITES.inf.icone}${cie.inf} ${TYPES_UNITES.choc.icone}${cie.choc} ${TYPES_UNITES.siege.icone}${cie.siege} — déployés dans votre capitale</small>
      </div>
      <button class="btn btn-mini btn-principal" onclick="uiEmbaucher(${i})">Engager<br><small>${cie.cout}💰</small></button>
    </div>`;
  });
  html += `<p style="margin-top:6px"><small>Les compagnies changent tous les ${TOURS_ROTATION_MERCENAIRES} tours. Vos rivaux peuvent aussi les engager…</small></p>
    <p style="margin-top:10px"><small>💱 Accords commerciaux actifs : ${moi.accords.filter(a => nation(a).vivante).length}
    (+${revenus(G.joueur).commerce || 0} 💰/tour) — négociez-en via la Diplomatie.<br>
    ⚒️ Le fer équipe vos unités · 🪵 le bois et 🪨 la pierre servent aux bâtiments · 🌶️ les épices font la fête.</small></p>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`;
  ouvrirModale(html);
}

function uiMarche(action, bien) {
  const r = action === 'acheter' ? marcheAcheter(G.joueur, bien, 10) : marcheVendre(G.joueur, bien, 10);
  if (!r.ok) toast(r.raison);
  majBarre();
  ouvrirCommerce();
}

function uiFetes() {
  const r = organiserFetes(G.joueur);
  if (!r.ok) toast(r.raison);
  else toast('🎉 Le peuple festoie ! (+10 stabilité)');
  majBarre();
  ouvrirCommerce();
}

function uiEmbaucher(index) {
  const cie = G.mercenaires[index];
  const r = embaucherMercenaires(G.joueur, index);
  if (!r.ok) { toast(r.raison || 'Impossible'); ouvrirCommerce(); return; }
  toast(`🏴 La ${cie.nom} rejoint vos rangs !`);
  majTout();
  ouvrirCommerce();
}

// Sous-écran : acheter 20 unités d'un bien à une nation
function ouvrirAchatRessources(nid) {
  const vendeur = nation(nid);
  let boutons = '';
  for (const [bien, def] of Object.entries(MARCHANDISES)) {
    const dispo = vendeur.marchandises[bien] >= 40;
    const prix = Math.ceil(G.marche[bien].prix * 0.9 * 20);
    boutons += `<button class="btn btn-choix" ${dispo ? '' : 'disabled'} onclick="uiDiplo('achatRessource',${nid},'${bien}')">
      ${def.icone} 20 ${def.nom}<br><small>${dispo ? prix + ' 💰 (marché −10 %)' : 'stock insuffisant chez eux'}</small>
    </button>`;
  }
  ouvrirModale(`<h2>🛒 Acheter à ${vendeur.nom}</h2>
    <p>Achat direct de ressources, 10 % sous le cours mondial. Améliore légèrement vos relations.</p>
    <div class="colonne-btn">${boutons}</div>
    <div class="rangee-btn"><button class="btn" onclick="ouvrirDiplomatieAvec(${nid})">← Retour</button></div>`);
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
  UI.app.resize();
  construireCarteStatique();
  centrerSurJoueur();
  majTout();
  toast(`Bienvenue, souverain de ${nation(G.joueur).nom} ! Touchez vos provinces pour agir.`);
}

// ---------- Initialisation ----------
window.addEventListener('DOMContentLoaded', () => {
  UI.canvas = document.getElementById('carte');
  initPixi();
  initGestes();
  document.getElementById('modale-fond').addEventListener('pointerdown', e => {
    if (e.target.id === 'modale-fond') fermerModale();
  });
  afficherEcranTitre();
});
