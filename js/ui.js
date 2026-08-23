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
  fondCarte: null,      // sprite de la carte du monde (mode Terre)
  gfx: {},              // objets Graphics dynamiques
  pool: { noms: new Map(), icones: new Map(), effectifs: new Map(), decor: new Map(), gisements: new Map() },
  modeCarte: 'politique',   // politique | terrain | ressources | militaire
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

// Cache de textures pour les textes répétés (décor, gisements) : indispensable
// avec 10 000 provinces, un PIXI.Text par case saturerait la mémoire GPU
const texturesTexte = new Map();
function spriteTexte(chaine, fontSize) {
  const cle = fontSize + '|' + chaine;
  let tex = texturesTexte.get(cle);
  if (!tex) {
    const t = new PIXI.Text(chaine, { fontSize });
    tex = UI.app.renderer.generateTexture(t, { resolution: 2 });
    t.destroy(true);
    texturesTexte.set(cle, tex);
  }
  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5);
  return spr;
}

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
  for (const nom of ['fond', 'eau', 'vagues', 'terrain', 'politique', 'frontieres', 'routes', 'decor',
                     'gisements', 'surbrillance', 'unites', 'icones', 'noms', 'fx']) {
    UI.couches[nom] = new PIXI.Container();
    UI.monde.addChild(UI.couches[nom]);
  }
  // Graphics partagés
  for (const nom of ['eau', 'vagues', 'terrain', 'politique', 'frontieres', 'mien', 'routes', 'cibles', 'selection', 'unites']) {
    UI.gfx[nom] = new PIXI.Graphics();
  }
  UI.couches.routes.addChild(UI.gfx.routes);
  UI.couches.eau.addChild(UI.gfx.eau);
  UI.couches.vagues.addChild(UI.gfx.vagues);
  UI.couches.terrain.addChild(UI.gfx.terrain);
  UI.couches.politique.addChild(UI.gfx.politique);
  UI.couches.frontieres.addChild(UI.gfx.frontieres);
  UI.couches.frontieres.addChild(UI.gfx.mien);
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

  // Carte du monde ancienne sous les hexagones (mode Terre uniquement) :
  // l'image couvre exactement l'étendue de la grille, les hexagones d'eau
  // semi-transparents la laissent transparaître.
  if (UI.fondCarte) { UI.fondCarte.destroy(); UI.fondCarte = null; }
  if (G.mode === 'terre') {
    const spr = PIXI.Sprite.from('assets/carte-monde.jpg');
    spr.width = Math.sqrt(3) * s * (MAP_W + 0.5);
    spr.height = 1.5 * s * (MAP_H - 1) + 2 * s;
    spr.alpha = 0.92;
    UI.couches.fond.addChild(spr);
    UI.fondCarte = spr;
  }

  const gEau = UI.gfx.eau; gEau.clear();
  const gVagues = UI.gfx.vagues; gVagues.clear();
  const gTerrain = UI.gfx.terrain; gTerrain.clear();

  for (const p of G.provinces) {
    const c = hexCentre(p.col, p.row);
    const h = hashProvince(p.id);

    if (p.terrain === 'eau') {
      const pts = hexSommets(c.x, c.y, s + 0.5);
      // Eaux côtières plus claires, océan profond plus sombre —
      // semi-transparentes pour laisser respirer la carte marine en fond
      const cotier = voisinsHex(p.col, p.row).some(i => G.provinces[i].terrain !== 'eau');
      const teinte = cotier
        ? (h < 0.5 ? 0x3c6f92 : 0x407598)
        : (h < 0.33 ? 0x28506e : h < 0.66 ? 0x2b5573 : 0x254a66);
      gEau.beginFill(teinte, cotier ? 0.55 : 0.32);
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

    // Décoration de terrain (sprite à texture partagée)
    const decor = DECOR_TERRAIN[p.terrain];
    if (decor) {
      const txt = spriteTexte(decor, s * 0.3);
      txt.alpha = 0.75;
      txt.position.set(c.x - s * 0.48, c.y - s * 0.3);
      UI.couches.decor.addChild(txt);
      UI.pool.decor.set(p.id, txt);
    }

    // Icônes de gisements (visibles en mode Ressources)
    if (p.gisements.length) {
      const gtxt = spriteTexte(p.gisements.map(g => ICONES_GISEMENTS[g]).join(''), s * 0.42);
      gtxt.position.set(c.x, c.y - s * 0.1);
      UI.couches.gisements.addChild(gtxt);
      UI.pool.gisements.set(p.id, gtxt);
    }
  }
  // Les étiquettes de nom sont créées à la demande selon le viewport (majNomsVisibles)
  nomsCache.zoom = NaN;
}

// Étiquettes de nom créées paresseusement : seules les provinces proches du
// viewport ont un PIXI.Text (10 000 textes permanents seraient trop lourds)
const nomsCache = { x: NaN, y: NaN, zoom: NaN };
function majNomsVisibles() {
  if (UI.cam.x === nomsCache.x && UI.cam.y === nomsCache.y && UI.cam.zoom === nomsCache.zoom) return;
  nomsCache.x = UI.cam.x; nomsCache.y = UI.cam.y; nomsCache.zoom = UI.cam.zoom;
  const s = UI.hexSize;
  const marge = s * 2;
  const x1 = -UI.cam.x / UI.cam.zoom - marge;
  const y1 = -UI.cam.y / UI.cam.zoom - marge;
  const x2 = (UI.app.screen.width - UI.cam.x) / UI.cam.zoom + marge;
  const y2 = (UI.app.screen.height - UI.cam.y) / UI.cam.zoom + marge;
  for (const p of G.provinces) {
    if (p.terrain === 'eau' || !p.nom) continue;
    const c = hexCentre(p.col, p.row);
    const dedans = c.x >= x1 && c.x <= x2 && c.y >= y1 && c.y <= y2;
    const existant = UI.pool.noms.get(p.id);
    if (dedans && !existant) {
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
    } else if (!dedans && existant && UI.pool.noms.size > 400) {
      existant.destroy();
      UI.pool.noms.delete(p.id);
    }
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

  // Opacité politique selon le mode de carte
  const modeC = UI.modeCarte;
  const alphaPol = modeC === 'terrain' ? 0 : modeC === 'ressources' ? 0.25 : modeC === 'militaire' ? 0.82 : 0.61;

  // Mon royaume doit se lire d'un coup d'œil : teinte plus franche que les
  // autres nations, et un liseré doré tout autour de mes terres.
  const gMien = UI.gfx.mien; gMien.clear();
  const mesEnnemis = new Set(nation(G.joueur).guerres.filter(g => nation(g).vivante));

  for (const p of G.provinces) {
    if (p.terrain === 'eau') continue;
    const c = hexCentre(p.col, p.row);
    const pts = hexSommets(c.x, c.y, s - 0.5);
    const mien = p.proprietaire === G.joueur;

    // Teinte politique — la mienne saturée, celle des autres en retrait
    if (alphaPol > 0) {
      if (p.proprietaire >= 0) {
        const a = mien ? Math.min(0.95, alphaPol * 1.3) : alphaPol * 0.78;
        gPol.beginFill(couleurNum(nation(p.proprietaire).couleur), a);
        gPol.drawPolygon(pts.flat());
        gPol.endFill();
      } else {
        gPol.beginFill(0x000000, 0.22 * alphaPol / 0.61);
        gPol.drawPolygon(pts.flat());
        gPol.endFill();
      }
    }

    // Côtes et frontières nationales
    for (const vid of voisinsHex(p.col, p.row)) {
      const v = G.provinces[vid];
      const cv = hexCentre(v.col, v.row);
      const [a, b] = areteVers(pts, cv);
      if (v.terrain === 'eau') {
        if (!mien) {
          gFro.lineStyle(2.5, 0xe8d9a0, 0.4);
          gFro.moveTo(a[0], a[1]);
          gFro.lineTo(b[0], b[1]);
        }
      } else if (v.proprietaire !== p.proprietaire) {
        // Frontière avec un ennemi en guerre : trait rouge alarmant
        const guerre = mien && mesEnnemis.has(v.proprietaire);
        const coul = guerre ? 0xff4433
          : p.proprietaire >= 0 ? assombrirNum(nation(p.proprietaire).couleur, 1.35) : 0x111111;
        gFro.lineStyle(guerre ? 4 : 3, coul, p.proprietaire >= 0 ? 1 : 0.6);
        gFro.moveTo(a[0], a[1]);
        gFro.lineTo(b[0], b[1]);
      }
      // Contour extérieur de mon royaume (mer comprise) : double trait doré
      if (mien && (v.terrain === 'eau' || v.proprietaire !== G.joueur)) {
        for (const [larg, coulM, alphaM] of [[7, 0x000000, 0.35], [4.5, 0xffe9a0, 0.95]]) {
          gMien.lineStyle(larg, coulM, alphaM);
          gMien.moveTo(a[0], a[1]);
          gMien.lineTo(b[0], b[1]);
        }
      }
    }
    gFro.lineStyle(0);
    gMien.lineStyle(0);

    // Icônes capitale / cité-état / forteresse / port (pool)
    let icones = '';
    if (p.capitale) icones += '👑';
    if (p.citeEtat) icones += '🏛️';
    if (p.batiments.fort > 0 && !p.citeEtat) icones += '🏰';
    if (p.batiments.port > 0) icones += '⚓';
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

  // Routes commerciales maritimes du joueur (pointillés entre ports partenaires)
  const gRoutes = UI.gfx.routes; gRoutes.clear();
  const mesPorts = provincesDe(G.joueur).filter(pp => pp.batiments.port > 0);
  if (mesPorts.length > 0) {
    const monPort = hexCentre(mesPorts[0].col, mesPorts[0].row);
    for (const pid of nation(G.joueur).accords) {
      const partenaire = nation(pid);
      if (!partenaire.vivante) continue;
      const sesPorts = provincesDe(pid).filter(pp => pp.batiments.port > 0);
      if (!sesPorts.length) continue;
      const sonPort = hexCentre(sesPorts[0].col, sesPorts[0].row);
      // Ligne pointillée segmentée : halo doré + cœur à la couleur du partenaire
      const dist = Math.hypot(sonPort.x - monPort.x, sonPort.y - monPort.y);
      const pas = 16, nSeg = Math.max(2, Math.floor(dist / pas));
      for (const [larg, coul, alpha] of [[6, 0xffe9a0, 0.5], [3, couleurNum(partenaire.couleur), 1]]) {
        gRoutes.lineStyle(larg, coul, alpha);
        for (let i = 0; i < nSeg; i += 2) {
          const t1 = i / nSeg, t2 = Math.min(1, (i + 1) / nSeg);
          gRoutes.moveTo(monPort.x + (sonPort.x - monPort.x) * t1, monPort.y + (sonPort.y - monPort.y) * t1);
          gRoutes.lineTo(monPort.x + (sonPort.x - monPort.x) * t2, monPort.y + (sonPort.y - monPort.y) * t2);
        }
      }
      gRoutes.lineStyle(0);
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

  // Noms visibles selon le zoom (étiquettes créées à la demande)
  const voulu = UI.cam.zoom > 0.75;
  if (voulu !== UI.nomsVisibles) {
    UI.nomsVisibles = voulu;
    UI.couches.noms.visible = voulu;
  }
  if (voulu && UI.ecran === 'jeu' && G) majNomsVisibles();

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
  UI.cam.zoom = clamp(UI.cam.zoom * facteur, 0.07, 2.5);
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

// ---------- Modes de carte (calques) ----------
function changerModeCarte(mode) {
  UI.modeCarte = mode;
  // Visibilité des couches selon le calque choisi
  UI.couches.gisements.visible = mode === 'ressources';
  UI.couches.decor.visible = mode !== 'ressources' && mode !== 'militaire';
  UI.couches.unites.visible = mode !== 'ressources';
  document.querySelectorAll('#modes-carte button').forEach(b => {
    b.classList.toggle('actif', b.dataset.mode === mode);
  });
  const noms = { politique: '🏛️ Vue politique', terrain: '🗺️ Vue terrain', ressources: '📦 Vue des gisements', militaire: '⚔️ Vue militaire' };
  toast(noms[mode]);
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

  const gisements = p.gisements.map(g => ICONES_GISEMENTS[g]).join(' ');
  const rendement = Math.round(facteurTravail(p) * 100);
  const prod = productionProvince(p, n && subitBlocus(p.proprietaire) >= 0);
  const biensTxt = Object.entries(prod.biens).map(([b, v]) => `${ICONES_GISEMENTS[b]} +${v}`).join(' ');
  const orGisement = p.gisements.includes('or');
  let html = `<div class="pp-titre">
    <span class="pastille" style="background:${n ? n.couleur : '#777'}"></span>
    <b>${p.nom}</b> ${p.capitale ? '★' : ''} ${FOCUS_PROVINCE[p.focus] && p.focus !== 'equilibre' ? FOCUS_PROVINCE[p.focus].icone : ''}
    <span class="pp-sous">${t.nom} · ${n ? n.nom : (p.citeEtat ? '🏛️ Cité-état libre' : 'Indépendante')}</span>
    <button class="fermer" onclick="deselectionner()">✕</button>
  </div>
  <div class="pp-prod">Produit chaque tour :
    <b>💰 ${prod.or.toFixed(1)} · 🌾 ${prod.nourriture.toFixed(1)} · 🔬 ${prod.science.toFixed(1)}${biensTxt ? ' · ' + biensTxt : ''}</b>
  </div>
  <div class="pp-stats">
    <span>👥 ${p.pop}/${capaciteProvince(p)} habitants <small>· bras : ${rendement} %</small></span>
    <span>Gisements : ${gisements || 'aucun'}${orGisement && !p.batiments.mine_or ? ' <small>(🪙 : bâtir une mine d\'or !)</small>' : ''}</span>
    <span>🛡️ Défense ×${(t.defense * (1 + p.batiments.fort * BATIMENTS.fort.bonus * (1 - (p.usureFort || 0)))).toFixed(1)}${p.usureFort > 0 ? ` <small>(murailles −${Math.round(p.usureFort * 100)} %)</small>` : ''}</span>
    <span>⚔️ ${p.troupes} soldats (${TYPES_UNITES.inf.icone}${p.armee.inf} ${TYPES_UNITES.choc.icone}${p.armee.choc} ${TYPES_UNITES.siege.icone}${p.armee.siege})${monTour && p.aBouge ? ' · a agi' : ''}</span>
  </div>`;

  if (monTour) {
    const moi = nation(G.joueur);
    html += `<div class="pp-recrues">`;
    for (const [type, def] of Object.entries(TYPES_UNITES)) {
      const c = def.cout;
      const couts = `1👥 ${c.or}💰 ${c.nourriture}🌾${c.fer ? ` ${c.fer}⚒️` : ''}${c.pierre ? ` ${c.pierre}🪨` : ''}`;
      html += `<div class="ligne-recrue">
        <div class="lr-info"><b>${def.icone} ${def.noms[moi.ere]}</b><small>${couts} par unité</small></div>
        <button class="btn btn-mini" onclick="uiRecruter(${pid},'${type}',1)">+1</button>
        <button class="btn btn-mini" onclick="uiRecruter(${pid},'${type}',5)">+5</button>
      </div>`;
    }
    html += `</div>`;
    // Actions spéciales : démobilisation, transport naval
    let actions = '';
    if (p.troupes > 1) {
      actions += `<button class="btn" onclick="uiDemobiliser(${pid})">🏳️ Démobiliser 5 <small>→ +👥</small></button>`;
    }
    if (p.batiments.port > 0 && p.troupes > 1 && !p.aBouge) {
      actions += `<button class="btn" onclick="ouvrirTransportNaval(${pid})">🚢 Transport naval</button>`;
      if (nation(G.joueur).flotte >= p.troupes - 1 && nation(G.joueur).guerres.length > 0) {
        actions += `<button class="btn btn-danger" onclick="ouvrirInvasion(${pid})">🌊 Invasion amphibie</button>`;
      }
    }
    if (actions) html += `<div class="pp-actions">${actions}</div>`;

    // Spécialisation de la province (affectation de la population)
    html += `<div class="pp-emplacements">👥 Spécialisation :</div><div class="rangee-focus">`;
    for (const [id, fdef] of Object.entries(FOCUS_PROVINCE)) {
      html += `<button class="btn btn-focus ${p.focus === id ? 'actif' : ''}" onclick="uiFocus(${pid},'${id}')" title="${fdef.nom}">${fdef.icone}<br><small>${fdef.nom}</small></button>`;
    }
    html += `</div>`;

    // Bâtiments : seuls les constructibles ici sont proposés
    html += `<div class="pp-emplacements">🏗️ Emplacements : ${emplacementsUtilises(p)}/${emplacementsMax(p)}</div>
    <div class="pp-batiments">`;
    for (const [type, def] of Object.entries(BATIMENTS)) {
      const niv = p.batiments[type];
      const nomEre = NOMS_BATIMENTS_PAR_ERE[type][ere];
      // Masquer les bâtiments impossibles ici (mauvais terrain / pas de gisement)
      if (niv === 0) {
        if (def.type === 'cotier' && !estCotiere(p)) continue;
        if (def.type === 'extraction' && !p.gisements.includes(def.bien)) continue;
      }
      if (niv >= NIVEAU_MAX_BATIMENT) {
        html += `<button class="btn btn-bat" disabled>${def.icone} ${nomEre}<br><small>MAX (${niv})</small></button>`;
      } else {
        const cout = coutBatiment(type, niv, moi.ere);
        const mat = coutMateriaux(type, niv);
        const plein = niv === 0 && emplacementsUtilises(p) >= emplacementsMax(p);
        const couts = plein ? 'emplacements pleins' : `${cout}💰${mat.bois ? ` ${mat.bois}🪵` : ''}${mat.pierre ? ` ${mat.pierre}🪨` : ''}`;
        html += `<button class="btn btn-bat" ${plein ? 'disabled' : ''} onclick="uiConstruire(${pid},'${type}')">${def.icone} ${nomEre} ${niv > 0 ? 'niv.' + (niv + 1) : ''}<br><small>${couts}</small></button>`;
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

function uiDemobiliser(pid) {
  const r = demobiliser(pid, 5);
  if (!r.ok) toast(r.raison);
  else toast(`🏳️ ${r.rendus} soldats rendus à la vie civile.`);
  majTout();
  afficherPanneauProvince(pid);
}

// Choisir le port de destination pour un transport naval
function ouvrirTransportNaval(pid) {
  const p = G.provinces[pid];
  const destinations = provincesDe(G.joueur).filter(d => d.id !== pid && d.batiments.port > 0);
  if (!destinations.length) {
    toast('Aucun autre port : construisez-en un second.');
    return;
  }
  let boutons = '';
  for (const d of destinations) {
    boutons += `<button class="btn btn-choix" onclick="uiTransporter(${pid},${d.id})">⚓ ${d.nom}<br><small>${d.troupes} troupes sur place</small></button>`;
  }
  ouvrirModale(`<h2>🚢 Transport naval depuis ${p.nom}</h2>
    <p>Embarquer <b>${p.troupes - 1}</b> troupes (1 reste en garnison) vers l'un de vos ports :</p>
    <div class="colonne-btn">${boutons}</div>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Annuler</button></div>`);
}

function uiTransporter(source, cible) {
  const s = G.provinces[source];
  const r = transporterTroupes(source, cible, s.troupes - 1);
  if (!r.ok) toast(r.raison || 'Impossible');
  else toast(`🚢 Troupes débarquées à ${G.provinces[cible].nom} !`);
  fermerModale();
  deselectionner();
  majTout();
}

function uiFocus(pid, focus) {
  definirFocus(pid, focus);
  toast(`${FOCUS_PROVINCE[focus].icone} ${G.provinces[pid].nom} devient ${FOCUS_PROVINCE[focus].nom.toLowerCase()}.`);
  majTout();
  afficherPanneauProvince(pid);
}

// Invasion amphibie : choisir la côte ennemie à prendre d'assaut
function ouvrirInvasion(pid) {
  const p = G.provinces[pid];
  const cibles = G.provinces
    .filter(c => peutAttaquerAmphibie(pid, c.id) && c.proprietaire >= 0)
    .sort((a, b) => Math.hypot(a.col - p.col, a.row - p.row) - Math.hypot(b.col - p.col, b.row - p.row))
    .slice(0, 10);
  if (!cibles.length) {
    toast('Aucune côte ennemie à portée (guerre et flotte suffisante requises).');
    return;
  }
  let boutons = '';
  for (const c of cibles) {
    const sim = simulerBataille(pid, c.id, true, 120);
    const pct = Math.round(sim.pVictoire * 100);
    const coul = pct >= 70 ? '#5c5' : pct >= 45 ? '#cc5' : '#e55';
    boutons += `<button class="btn btn-choix" onclick="uiInvasion(${pid},${c.id})">
      ⚔️ ${c.nom} <small>(${nation(c.proprietaire).nom})</small> — <b style="color:${coul}">${pct} %</b><br><small>garnison ${c.troupes}${c.batiments.fort ? ' · 🏰' : ''}</small>
    </button>`;
  }
  ouvrirModale(`<h2>🌊 Invasion amphibie depuis ${p.nom}</h2>
    <p>Votre flotte (${nation(G.joueur).flotte} ⛵) débarque <b>${p.troupes - 1}</b> troupes — attaquer depuis la mer inflige un malus de 15 %.</p>
    <div class="colonne-btn">${boutons}</div>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Annuler</button></div>`);
}

function uiInvasion(source, cible) {
  const c = G.provinces[cible];
  const r = attaqueAmphibie(source, cible);
  fermerModale();
  if (!r.ok) { toast(r.raison || 'Impossible'); return; }
  const centre = hexCentre(c.col, c.row);
  fxExplosion(centre.x, centre.y, r.victoire ? 0xffd75e : 0xff5544, r.victoire ? 22 : 14);
  UI.shake = r.victoire ? 8 : 12;
  toast(r.victoire ? `🌊 Débarquement réussi ! ${c.nom} est prise.` : `💥 Le débarquement échoue (−${r.pertes} pertes).`);
  deselectionner();
  majTout();
  if (G.fini) verifierFinPartie();
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
  const sim = simulerBataille(source, cible);
  const pct = Math.round(sim.pVictoire * 100);
  const coulPct = pct >= 70 ? '#5c5' : pct >= 45 ? '#cc5' : '#e55';
  const totalForce = sim.forceAtt + sim.forceDef;
  // Modificateurs lisibles
  const mods = [];
  if (sim.bonusTerrain > 1) mods.push(`terrain ${TERRAINS[c.terrain].nom.toLowerCase()} : défense ×${sim.bonusTerrain.toFixed(1)}`);
  if (c.batiments.fort > 0) mods.push(`🏰 forteresse niv.${c.batiments.fort} : défense ×${sim.bonusFort.toFixed(2)}`);
  if (s.armee.siege > 0 && c.batiments.fort > 0) mods.push(`💣 siège : fortifications −${Math.round((1 - sim.reducSiege) * 100)} %`);
  if (sim.multAtt > 1.01) mods.push(`vos bonus (doctrine, souverain) : attaque ×${sim.multAtt.toFixed(2)}`);
  const noteSiege = mods.length ? `<p><small>${mods.join('<br>')}</small></p>` : '';
  const chances = `<div class="duel">
      <div class="duel-barre"><div class="duel-att" style="width:${Math.round(sim.forceAtt / totalForce * 100)}%"></div></div>
      <div class="duel-libelle"><span>⚔️ Vous : ${sim.forceAtt}</span><span>${sim.forceDef} : Eux 🛡️</span></div>
    </div>
    <p style="text-align:center;font-size:17px">Victoire estimée : <b style="color:${coulPct}">${pct} %</b><br>
    <small>pertes attendues : ~${sim.pertesSiVictoire} si victoire · ~${sim.pertesSiDefaite} si défaite (sur 300 batailles simulées)</small></p>`;

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
    <p><small>${defNom} — garnison ${c.troupes} (${TYPES_UNITES.inf.icone}${c.armee.inf} ${TYPES_UNITES.choc.icone}${c.armee.choc} ${TYPES_UNITES.siege.icone}${c.armee.siege}) ·
    vous engagez ${engages} (${TYPES_UNITES.inf.icone}${s.armee.inf} ${TYPES_UNITES.choc.icone}${s.armee.choc} ${TYPES_UNITES.siege.icone}${s.armee.siege}, 1 en garnison)</small></p>
    ${chances}
    ${noteSiege}
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
    if (!nation(G.joueur).mariages.includes(nid)) boutons += `<button class="btn" onclick="uiDiplo('mariage',${nid})">💍 Mariage royal (+30 relations, +5 🏛️)</button>`;
    boutons += `<button class="btn" onclick="ouvrirAchatRessources(${nid})">🛒 Acheter des ressources (−10 % du marché)</button>`;
    boutons += `<button class="btn" onclick="uiDiplo('cadeau',${nid},50)">🎁 Cadeau (50 💰)</button>`;
    boutons += `<button class="btn btn-danger" onclick="uiDiplo('tribut',${nid})">🪙 Exiger un tribut (menace)</button>`;
    if (!monVassal && moi.vassalDe === -1) boutons += `<button class="btn" onclick="uiDiplo('vassal',${nid})">👑 Exiger la vassalité</button>`;
    if (monVassal) boutons += `<button class="btn" onclick="uiDiplo('liberer',${nid})">🕊️ Libérer ce vassal</button>`;
    if (nation(G.joueur).embargos.includes(nid)) {
      boutons += `<button class="btn" onclick="uiDiplo('leverEmbargo',${nid})">🕊️ Lever l'embargo</button>`;
    } else {
      boutons += `<button class="btn btn-danger" onclick="uiDiplo('embargo',${nid})">🚫 Décréter un embargo</button>`;
    }
    if (!allie && !pacte && !monVassal) boutons += `<button class="btn btn-danger" onclick="uiDiplo('guerre',${nid})">⚡ Déclarer la guerre</button>`;
  }
  // Espionnage
  const moiN = nation(G.joueur);
  boutons += `<div class="pp-emplacements" style="margin-top:8px">🕵️ Espionnage — ${moiN.espions} espion(s) · mission : ${COUT_MISSION} 💰</div>`;
  if (moiN.espions < 3) boutons += `<button class="btn" onclick="uiRecruterEspion(${nid})">🕵️ Recruter un espion (${COUT_ESPION} 💰)</button>`;
  if (moiN.espions > 0) {
    boutons += `<button class="btn" onclick="uiMission(${nid},'volerScience')">📜 Voler la science <small>(65 %)</small></button>
      <button class="btn" onclick="uiMission(${nid},'saboter')">💥 Saboter port/fort <small>(60 %)</small></button>
      <button class="btn" onclick="uiMission(${nid},'fomenter')">🔥 Fomenter une révolte <small>(50 %)</small></button>
      <button class="btn btn-danger" onclick="uiMission(${nid},'assassiner')">🗡️ Assassiner un héritier <small>(40 %)</small></button>`;
  }

  const contact = nationsEnContact(G.joueur, nid);
  ouvrirModale(`<h2><span class="pastille" style="background:${n.couleur}"></span> ${n.nom}</h2>
    <p>${PERSONNALITES[n.perso].nom} · ${ERES[n.ere].nom} · ${provincesDe(nid).length} provinces · ⚔️ ${Math.round(puissanceMilitaire(nid))} · ⛵ ${n.flotte} · Relations : <b>${rel > 0 ? '+' : ''}${rel}</b></p>
    <p><small>👑 ${n.dirigeant.nom}, ${n.dirigeant.age} ans${nation(G.joueur).mariages.includes(nid) ? ' · 💍 nos dynasties sont unies' : ''}</small></p>
    ${contact ? '' : `<p><small>🚫 Nations sans contact : il faut une frontière commune, ou un port de chaque côté, pour traiter ensemble.</small></p>`}
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
    case 'mariage': r = mariageRoyal(G.joueur, nid);
      if (r.ok) toast('💍 Vos dynasties sont unies !');
      break;
    case 'tribut': r = exigerTribut(G.joueur, nid);
      if (r.ok) toast(`🪙 Tribut de ${r.tribut} 💰 obtenu !`);
      break;
    case 'embargo': r = declarerEmbargo(G.joueur, nid);
      if (r.ok) toast('🚫 Embargo décrété (les marchands grognent).');
      break;
    case 'leverEmbargo': r = leverEmbargo(G.joueur, nid); break;
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
  html += `</div>`;
  // Chaînes de production et besoins du peuple
  const transfo = transformerBiens(G.joueur, false);
  const pop = provincesDe(G.joueur).reduce((s, p) => s + p.pop, 0);
  const demandeLuxe = Math.ceil(pop / LUXE_PAR_POP);
  html += `<div class="pp-prod">🏭 Vos forges produisent <b>${transfo.armes} 🗡️/tour</b> (2 ⚒️ → 1 🗡️) · vos ateliers <b>${transfo.luxe} 💎/tour</b> (2 🌶️ → 1 💎)<br>
    👥 Votre peuple demande <b>${demandeLuxe} 💎/tour</b> — satisfait : +2 🏛️ stabilité chaque tour</div>
    <button class="btn" style="width:100%" onclick="uiFetes()">🎉 Organiser des fêtes (${COUT_FETES_EPICES} 🌶️ → +10 🏛️ stabilité)</button>
    <h3 class="titre-section">⛵ Marine de guerre</h3>`;
  const ports = nbPorts(G.joueur);
  const blocus = subitBlocus(G.joueur);
  html += `<div class="ligne-bien">
    <div class="lb-info">
      <b>Flotte : ${moi.flotte} ⛵</b>
      <small>${ports} port(s) · entretien ${Math.floor(moi.flotte / 2)} 💰/tour${blocus >= 0 ? ` · ⛔ BLOCUS par ${nation(blocus).nom} !` : ''}</small>
    </div>
    <button class="btn btn-mini btn-principal" ${ports ? '' : 'disabled'} onclick="uiNavires(2)">+2 ⛵<br><small>${COUT_NAVIRE.or * 2}💰 ${COUT_NAVIRE.bois * 2}🪵</small></button>
    <button class="btn btn-mini btn-principal" ${ports ? '' : 'disabled'} onclick="uiNavires(5)">+5 ⛵<br><small>${COUT_NAVIRE.or * 5}💰 ${COUT_NAVIRE.bois * 5}🪵</small></button>
  </div>
  <p><small>Une flotte supérieure impose un <b>blocus</b> aux ennemis (routes coupées, ports affaiblis) et permet les <b>invasions amphibies</b> depuis vos ports. Batailles navales automatiques chaque tour en guerre.</small></p>
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
  html += `<h3 class="titre-section">🏦 Banquiers</h3>
    <div class="ligne-bien">
      <div class="lb-info">
        <b>Dette : ${moi.dette} 💰</b>
        <small>intérêts : ${Math.ceil(moi.dette * TAUX_INTERET)} 💰/tour · plafond ${DETTE_MAX} 💰${moi.dette >= DETTE_MAX * 0.8 ? ' · ⚠️ le peuple gronde !' : ''}</small>
      </div>
      <button class="btn btn-mini" onclick="uiEmprunter(200)">Emprunter<br><small>+200💰</small></button>
      <button class="btn btn-mini btn-principal" ${moi.dette ? '' : 'disabled'} onclick="uiRembourser(100)">Rembourser<br><small>−100💰</small></button>
    </div>`;
  html += `<p style="margin-top:6px"><small>Les compagnies changent tous les ${TOURS_ROTATION_MERCENAIRES} tours. Vos rivaux peuvent aussi les engager…</small></p>
    <p style="margin-top:10px"><small>💱 Accords commerciaux : ${moi.accords.filter(a => nation(a).vivante).length}
    · ⚓ Routes maritimes : ${revenus(G.joueur).routesMaritimes || 0} (+5 💰/tour chacune, il faut un port des deux côtés)
    · total commerce : +${revenus(G.joueur).commerce || 0} 💰/tour<br>
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

function uiNavires(q) {
  const r = construireNavires(G.joueur, q);
  if (!r.ok) toast(r.raison);
  else toast(`⛵ ${q} navires rejoignent votre flotte !`);
  majBarre();
  ouvrirCommerce();
}

function uiEmprunter(m) {
  const r = emprunter(G.joueur, m);
  if (!r.ok) toast(r.raison);
  else toast(`🏦 +${m} 💰 empruntés.`);
  majBarre();
  ouvrirCommerce();
}

function uiRembourser(m) {
  const r = rembourser(G.joueur, m);
  if (!r.ok) toast(r.raison);
  else toast(`🏦 ${r.montant} 💰 remboursés (dette : ${nation(G.joueur).dette}).`);
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

function uiRecruterEspion(nid) {
  const r = recruterEspion(G.joueur);
  if (!r.ok) toast(r.raison);
  else toast('🕵️ Un espion rejoint votre réseau.');
  majBarre();
  ouvrirDiplomatieAvec(nid);
}

function uiMission(nid, mission) {
  const r = missionEspionnage(G.joueur, nid, mission);
  toast(r.ok ? `🕵️ ${r.resultat}` : (r.raison || 'Échec'));
  majTout();
  ouvrirDiplomatieAvec(nid);
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
      <div><b>${e.nom}</b><small>${e.unite} · puissance ×${e.puissance}${e.seuil > 0 ? ` · ${seuilEre(e.id)} 🔬` : ''}</small></div>
      ${actuelle ? '<span class="badge">ACTUELLE</span>' : atteinte ? '<span class="badge ok">✓</span>' : ''}
    </div>`;
  }
  html += `</div><h3 class="titre-section">🏛️ Doctrine nationale</h3>`;
  const delaiOk = G.tour - moi.doctrineTour >= DELAI_DOCTRINE;
  for (const [id, d] of Object.entries(DOCTRINES)) {
    const active = moi.doctrine === id;
    html += `<button class="btn btn-choix ${active ? 'btn-principal' : ''}" ${active || !delaiOk && moi.doctrine ? 'disabled' : ''}
      onclick="uiDoctrine('${id}')">${d.icone} ${d.nom} ${active ? '· ACTIVE' : ''}<br><small>${d.desc}</small></button>`;
  }
  if (moi.doctrine && !delaiOk) {
    html += `<p><small>Changement possible dans ${DELAI_DOCTRINE - (G.tour - moi.doctrineTour)} tours.</small></p>`;
  }
  if (moi.ere >= 4) {
    if (moi.ascensionActive) {
      html += `<div class="carte-ere actuelle"><span class="ere-icone">🌌</span>
        <div><b>${PROJET_ASCENSION.nom}</b><small>En cours : ${moi.ascension}/${PROJET_ASCENSION.tours} tours</small></div></div>`;
    } else {
      html += `<button class="btn btn-principal" onclick="uiAscension()">🌌 Lancer ${PROJET_ASCENSION.nom} (${coutAscension()} 🔬)<br><small>Victoire scientifique en ${PROJET_ASCENSION.tours} tours</small></button>`;
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

function uiDoctrine(id) {
  const r = choisirDoctrine(G.joueur, id);
  if (!r.ok && r.raison) toast(r.raison);
  else if (r.ok) toast(`${DOCTRINES[id].icone} Doctrine ${DOCTRINES[id].nom.toLowerCase()} adoptée !`);
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
  fermerHub();
  const avant = (G.alertes || []).length;
  const orAvant = nation(G.joueur).or;
  const { evenementsTour, fin } = finDeTour();
  sauvegarder();
  majTout();

  // Rapport du tour : d'où vient exactement ce que je viens de gagner
  afficherRapportTour(Math.floor(nation(G.joueur).or - orAvant));
  // Les alertes nées de ce tour s'affichent en bandeau, la plus grave d'abord
  const nouvelles = (G.alertes || []).slice(0, Math.max(0, (G.alertes || []).length - avant));
  const majeure = nouvelles.find(a => a.gravite === 'critique') || nouvelles[0];
  if (majeure) afficherBandeau(majeure);
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

// ---------- Rapport de fin de tour ----------
// « +27 d'or » ne dit rien tout seul : on montre les trois postes qui pèsent
// le plus dans ce chiffre, et un lien vers le détail complet.
function afficherRapportTour(gagneOr) {
  const moi = nation(G.joueur);
  const rev = revenus(G.joueur);
  const d = rev.detail;

  // Les postes affichés décomposent exactement le chiffre en vedette :
  // les plus lourds sont nommés, le reste est regroupé sous « divers ».
  const tous = [
    ['Provinces', d.orProvinces + d.orBonus],
    ['Impôts', d.impots],
    ['Commerce', d.commerce],
    ['Tributs', d.tribut],
    ['Armée', -d.entretienArmee],
    ['Flotte', -d.entretienFlotte],
    ['Dette', -(rev.interets || 0)],
    ['Suzerain', -d.verse],
  ].filter(([, v]) => Math.round(v) !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const nommes = tous.slice(0, 4);
  const reste = rev.or - nommes.reduce((s, [, v]) => s + Math.round(v), 0);
  const postes = nommes.map(([nom, v]) => [nom, Math.round(v)]);
  if (Math.round(reste) !== 0) {
    postes.push([d.instable ? 'Instabilité' : 'Divers', Math.round(reste)]);
  }

  const el = document.getElementById('rapport-tour');
  el.innerHTML = `
    <div class="rt-entete">
      <b>Tour ${G.tour}</b><small>an ${G.annee} · encaissé : ${gagneOr >= 0 ? '+' : ''}${gagneOr} 💰</small>
      <button class="rt-fermer" onclick="fermerRapport()">✕</button>
    </div>
    <div class="rt-gains">
      <span class="${rev.or >= 0 ? 'pos' : 'neg'}">${rev.or >= 0 ? '+' : ''}${rev.or} 💰</span>
      <span class="${rev.nourriture >= 0 ? 'pos' : 'neg'}">${rev.nourriture >= 0 ? '+' : ''}${rev.nourriture} 🌾</span>
      <span class="pos">+${rev.science} 🔬</span>
    </div>
    <div class="rt-postes">${postes.map(([nom, v]) =>
      `<span class="${v > 0 ? 'pos' : 'neg'}">${nom} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>
    <button class="rt-detail" onclick="fermerRapport();ouvrirHub('economie')">Voir le détail complet ›</button>`;
  el.classList.add('visible');
  clearTimeout(UI.rapportTimer);
  UI.rapportTimer = setTimeout(fermerRapport, 7000);
}

function fermerRapport() {
  clearTimeout(UI.rapportTimer);
  document.getElementById('rapport-tour').classList.remove('visible');
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
// Hiérarchie : identité du royaume et alertes en haut (ce qui doit sauter aux
// yeux), l'or en vedette au-dessous, les jauges secondaires en plus discret.
function majBarre() {
  const moi = nation(G.joueur);
  const rev = revenus(G.joueur);
  const nonLues = alertesNonLues().length;
  const critiques = alertesNonLues().some(a => a.gravite === 'critique');
  const guerres = moi.guerres.filter(g => nation(g).vivante).length;

  // Une ressource : valeur en gros, variation par tour en couleur juste après
  const jauge = (icone, valeur, delta, cls, titre) => `
    <button class="bh-jauge ${cls}" onclick="ouvrirHub('economie')" title="${titre}">
      <span class="bhj-icone">${icone}</span>
      <span class="bhj-val">${Math.floor(valeur)}</span>
      <span class="bhj-delta ${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : ''}${delta}</span>
    </button>`;

  document.getElementById('barre-haut').innerHTML = `
    <div class="bh-rang1">
      <button class="bh-nation" onclick="ouvrirHub()" style="--coul:${moi.couleur}">
        <span class="bh-blason" style="background:${moi.couleur}"></span>
        <span class="bh-nom">${moi.nom}</span>
        <span class="bh-sous">an ${G.annee} · ${provincesDe(G.joueur).length} prov.</span>
      </button>
      ${guerres ? `<button class="bh-guerre" onclick="ouvrirHub('menaces')" title="Guerres en cours">⚔️ ${guerres}</button>` : ''}
      <button class="bh-cloche ${nonLues ? (critiques ? 'critique' : 'actif') : ''}" onclick="ouvrirAlertes()" title="Alertes">
        🔔${nonLues ? `<span class="bh-pastille">${nonLues}</span>` : ''}
      </button>
      <button class="bh-menu" onclick="ouvrirMenu()">⚙️</button>
    </div>
    <div class="bh-rang2">
      ${jauge('💰', moi.or, rev.or, 'or', 'Or — appuyez pour le détail')}
      ${jauge('🌾', moi.nourriture, rev.nourriture, 'nour', 'Nourriture')}
      ${jauge('🔬', moi.science, rev.science, 'sci', 'Science')}
      <button class="bh-jauge mini ${moi.stabilite < 50 ? 'alerte' : ''}" onclick="ouvrirHub('menaces')" title="Stabilité">
        <span class="bhj-icone">🏛️</span><span class="bhj-val">${Math.floor(moi.stabilite)}%</span>
      </button>
      <button class="bh-jauge mini" onclick="ouvrirHub()" title="Population">
        <span class="bhj-icone">👥</span><span class="bhj-val">${rev.popTotale}</span>
      </button>
    </div>`;
}

// ---------- Bandeau d'alerte critique ----------
// Une guerre déclarée ou une province perdue ne doit pas passer dans un toast
// fugace : le bandeau reste jusqu'à ce que le joueur l'ait vu.
function afficherBandeau(a) {
  const el = document.getElementById('bandeau-alerte');
  el.className = 'visible ' + a.gravite;
  el.innerHTML = `
    <span class="ba-icone">${a.icone}</span>
    <span class="ba-texte"><b>${a.titre}</b><small>${a.texte}</small></span>
    <button class="ba-fermer" onclick="fermerBandeau()">✕</button>`;
  el.onclick = (e) => {
    if (e.target.closest('.ba-fermer')) return;
    fermerBandeau();
    ouvrirAlertes();
  };
  clearTimeout(UI.bandeauTimer);
  UI.bandeauTimer = setTimeout(fermerBandeau, 9000);
}

function fermerBandeau() {
  clearTimeout(UI.bandeauTimer);
  document.getElementById('bandeau-alerte').className = '';
}

// ---------- Journal des alertes ----------
function ouvrirAlertes() {
  const liste = (G.alertes || []);
  for (const a of liste) a.lue = true;
  majBarre();
  const contenu = liste.length === 0
    ? '<p><small>Aucune alerte pour l\'instant. Les déclarations de guerre, provinces perdues, famines et révoltes apparaîtront ici.</small></p>'
    : liste.slice(0, 20).map(a => `
      <div class="alerte-ligne ${a.gravite}" ${a.cible ? `onclick="allerVers('${a.cible.type}',${a.cible.id})"` : ''}>
        <span class="al-icone">${a.icone}</span>
        <div class="al-corps">
          <b>${a.titre}</b>
          <small>${a.texte}</small>
          <small class="al-tour">tour ${a.tour}${a.cible ? ' · appuyez pour y aller' : ''}</small>
        </div>
      </div>`).join('');
  ouvrirModale(`<h2>🔔 Alertes</h2>${contenu}
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`);
}

// Va sur la carte à l'endroit concerné par une alerte
function allerVers(type, id) {
  fermerModale();
  fermerHub();
  if (type === 'province') {
    const p = G.provinces[id];
    if (!p) return;
    const c = hexCentre(p.col, p.row);
    UI.cam.zoom = 0.9;
    UI.cam.x = UI.app.screen.width / 2 - c.x * UI.cam.zoom;
    UI.cam.y = UI.app.screen.height / 2 - c.y * UI.cam.zoom;
    afficherPanneauProvince(id);
  } else if (type === 'nation') {
    ouvrirDiplomatieAvec(id);
  }
}

// ---------- Écran Empire (détail des revenus et forces) ----------
function ligneDetail(label, valeur, icone) {
  if (!valeur) return '';
  const cls = valeur > 0 ? 'pos' : 'neg';
  return `<div class="ligne-detail"><span>${label}</span><b class="${cls}">${valeur > 0 ? '+' : ''}${valeur} ${icone}</b></div>`;
}

// ---------- HUB — où j'en suis, en un coup d'œil ----------
// Quatre questions dans l'ordre : qui suis-je, qu'est-ce qui me menace,
// que puis-je saisir, d'où vient mon argent.
function ouvrirHub(section) {
  const moi = nation(G.joueur);
  const b = bilanRoyaume(G.joueur);
  const rev = b.rev;
  UI.hubSection = section || UI.hubSection || 'royaume';
  for (const a of (G.alertes || [])) a.lue = true;

  const onglets = [
    ['royaume', '🛡️', 'Royaume'],
    ['menaces', '⚠️', 'Menaces', b.menaces.length],
    ['opportunites', '✨', 'Saisir', b.opportunites.length],
    ['economie', '💰', 'Économie'],
  ].map(([id, ic, lib, n]) => `
    <button class="hub-onglet ${UI.hubSection === id ? 'actif' : ''} ${id === 'menaces' && b.menaces.some(m => m.gravite === 'critique') ? 'danger' : ''}"
      onclick="ouvrirHub('${id}')">${ic}<span>${lib}</span>${n ? `<i>${n}</i>` : ''}</button>`).join('');

  const html = `
    <div class="hub-entete" style="--coul:${moi.couleur}">
      <span class="hub-blason" style="background:${moi.couleur}"></span>
      <div class="hub-ident">
        <b>${moi.nom}</b>
        <small>${ERES[moi.ere].icone} ${ERES[moi.ere].nom} · an ${G.annee} · 👑 ${moi.dirigeant.nom}</small>
      </div>
      <button class="pp-fermer" onclick="fermerHub()">✕</button>
    </div>
    <div class="hub-onglets">${onglets}</div>
    <div class="hub-corps">${
      UI.hubSection === 'menaces' ? hubMenaces(b)
      : UI.hubSection === 'opportunites' ? hubOpportunites(b)
      : UI.hubSection === 'economie' ? hubEconomie(moi, rev)
      : hubRoyaume(moi, b, rev)}</div>`;

  const el = document.getElementById('hub');
  el.innerHTML = html;
  el.classList.add('ouvert');
  majBarre();
}

function fermerHub() {
  document.getElementById('hub').classList.remove('ouvert');
}

// Vue d'ensemble : mes forces, mon territoire, mon état de santé
function hubRoyaume(moi, b, rev) {
  const total = armeeVide();
  for (const p of provincesDe(G.joueur)) {
    total.inf += p.armee.inf; total.choc += p.armee.choc; total.siege += p.armee.siege;
  }
  const rang = [...G.nations].filter(n => n.vivante)
    .map(n => ({ n, pts: provincesDe(n.id).length }))
    .sort((a, c) => c.pts - a.pts);
  const monRang = rang.findIndex(r => r.n.id === G.joueur) + 1;
  const critiques = b.menaces.filter(m => m.gravite === 'critique');
  const prochaine = ERES[moi.ere + 1];

  return `
    ${critiques.length ? `<button class="hub-appel danger" onclick="ouvrirHub('menaces')">
      ⚠️ <b>${critiques.length} menace${critiques.length > 1 ? 's' : ''} critique${critiques.length > 1 ? 's' : ''}</b> — ${critiques[0].titre}</button>` : ''}
    ${b.opportunites.filter(o => o.pret).length ? `<button class="hub-appel bonne" onclick="ouvrirHub('opportunites')">
      ✨ <b>${b.opportunites.filter(o => o.pret).length} action${b.opportunites.filter(o => o.pret).length > 1 ? 's' : ''} possible${b.opportunites.filter(o => o.pret).length > 1 ? 's' : ''}</b> — ${b.opportunites.find(o => o.pret).titre}</button>` : ''}

    <div class="hub-tuiles">
      <div class="tuile"><b>${b.provinces}</b><small>provinces</small><i>${monRang}ᵉ sur ${rang.length}</i></div>
      <div class="tuile"><b>${b.pop}</b><small>habitants</small><i>+${rev.detail.impots} 💰 d'impôts</i></div>
      <div class="tuile"><b>${b.troupes}</b><small>soldats</small><i>−${rev.detail.entretienArmee} 💰/tour</i></div>
      <div class="tuile ${moi.stabilite < 50 ? 'alerte' : ''}"><b>${Math.floor(moi.stabilite)}%</b><small>stabilité</small>
        <i>${moi.stabilite < 50 ? 'revenus −30 %' : 'royaume calme'}</i></div>
    </div>

    <h3 class="titre-section">⚔️ Forces armées</h3>
    <div class="pp-stats">
      <span>${TYPES_UNITES.inf.icone} ${total.inf} ${TYPES_UNITES.inf.noms[moi.ere]}</span>
      <span>${TYPES_UNITES.choc.icone} ${total.choc} ${TYPES_UNITES.choc.noms[moi.ere]}</span>
      <span>${TYPES_UNITES.siege.icone} ${total.siege} ${TYPES_UNITES.siege.noms[moi.ere]}</span>
      <span>⛵ ${moi.flotte} navires</span>
    </div>

    <h3 class="titre-section">${ERES[moi.ere].icone} Progression</h3>
    ${prochaine ? `<div class="barre-prog"><div class="barre-prog-int" style="width:${Math.min(100, Math.round(moi.science / seuilEre(moi.ere + 1) * 100))}%"></div></div>
      <p><small>${Math.floor(moi.science)} / ${seuilEre(moi.ere + 1)} 🔬 vers « ${prochaine.nom} » (+${rev.science}/tour)</small></p>`
    : '<p><small>Ère finale atteinte — visez l\'Ascension Stellaire !</small></p>'}

    <h3 class="titre-section">🏛️ Factions internes</h3>
    ${['nobles', 'marchands', 'peuple'].map(f => {
      const v = moi.factions[f];
      const coul = v <= 25 ? '#e55' : v <= 40 ? '#cc5' : '#7ec97e';
      const noms = { nobles: '⚜️ Noblesse', marchands: '⚖️ Marchands', peuple: '👥 Peuple' };
      return `<div class="ligne-detail"><span>${noms[f]}${v <= 25 ? ' ⚠️' : ''}</span>
        <span class="barre-prog" style="width:90px;margin:0"><span class="barre-prog-int" style="width:${v}%;background:${coul};display:block;height:100%"></span></span></div>`;
    }).join('')}

    <h3 class="titre-section">📜 Dernières chroniques</h3>
    ${G.journal.slice(0, 6).map(l => `<div class="ligne-journal"><small>Tour ${l.tour}</small> ${l.txt}</div>`).join('')}
    <div class="rangee-btn"><button class="btn" onclick="ouvrirJournal()">📜 Tout le journal</button>
      <button class="btn" onclick="ouvrirDynastie()">👑 Dynastie</button></div>`;
}

// Ce qui peut me coûter la partie
function hubMenaces(b) {
  if (!b.menaces.length) {
    return `<div class="hub-vide">🕊️<b>Aucune menace</b>
      <small>Personne ne vous fait la guerre, vos caisses et vos greniers tiennent, votre peuple est calme. C'est le moment de vous étendre.</small>
      <button class="btn btn-principal" onclick="ouvrirHub('opportunites')">✨ Voir les opportunités</button></div>`;
  }
  return b.menaces.map(m => `
    <div class="hub-carte ${m.gravite}" ${m.cible ? `onclick="allerVers('${m.cible.type}',${m.cible.id})"` : ''}>
      ${m.couleur ? `<span class="hc-blason" style="background:${m.couleur}"></span>` : `<span class="hc-icone">${m.icone}</span>`}
      <div class="hc-corps">
        <b>${m.titre}</b>
        <small>${m.texte}</small>
      </div>
      ${m.cible ? '<span class="hc-fleche">›</span>' : ''}
    </div>`).join('');
}

// Ce que je peux saisir maintenant
function hubOpportunites(b) {
  if (!b.opportunites.length) {
    return `<div class="hub-vide">🔭<b>Rien à saisir dans l'immédiat</b>
      <small>Développez vos provinces et vos relations : de nouvelles occasions apparaîtront.</small></div>`;
  }
  return b.opportunites.map(o => `
    <div class="hub-carte ${o.pret ? 'pret' : 'attente'}"
      ${o.cible ? `onclick="allerVers('${o.cible.type}',${o.cible.id})"` : o.ecran === 'techno' ? 'onclick="fermerHub();ouvrirTechnologie()"' : ''}>
      ${o.couleur ? `<span class="hc-blason" style="background:${o.couleur}"></span>` : `<span class="hc-icone">${o.icone}</span>`}
      <div class="hc-corps">
        <b>${o.titre}</b>
        <small>${o.texte}</small>
      </div>
      ${o.cible || o.ecran ? '<span class="hc-fleche">›</span>' : ''}
    </div>`).join('');
}

// D'où vient mon or, ligne par ligne
function hubEconomie(moi, rev) {
  const d = rev.detail;
  const prod = productionMarchandises(G.joueur);
  return `
    ${d.bloque ? '<div class="hub-carte critique"><span class="hc-icone">⛔</span><div class="hc-corps"><b>Blocus naval</b><small>Routes maritimes coupées, ports affaiblis.</small></div></div>' : ''}
    ${d.instable ? '<div class="hub-carte critique"><span class="hc-icone">⚠️</span><div class="hc-corps"><b>Instabilité</b><small>Stabilité sous 50 % : tous les revenus sont réduits de 30 %.</small></div></div>' : ''}

    <div class="hub-total ${rev.or >= 0 ? '' : 'neg'}">
      <span>💰 Or</span><b>${rev.or >= 0 ? '+' : ''}${rev.or}<small>/tour</small></b>
    </div>
    ${ligneDetail('Provinces (terrain, marchés, ports, mines)', d.orProvinces, '💰')}
    ${ligneDetail('Doctrine et souverain', d.orBonus, '💰')}
    ${ligneDetail(`Impôts (${rev.popTotale} 👥 × 0,15)`, d.impots, '💰')}
    ${ligneDetail(`Commerce (${d.commerce ? rev.routesMaritimes + ' routes maritimes, ' + rev.caravanes + ' caravanes' : 'aucun accord'})`, d.commerce, '💰')}
    ${ligneDetail('Tributs des vassaux', d.tribut, '💰')}
    ${ligneDetail('Versé au suzerain', -d.verse, '💰')}
    ${ligneDetail(`Entretien de l'armée (${d.troupes} ⚔️)`, -d.entretienArmee, '💰')}
    ${ligneDetail(`Entretien de la flotte (${moi.flotte} ⛵)`, -d.entretienFlotte, '💰')}
    ${ligneDetail(`Intérêts de la dette (${moi.dette} 💰 dus)`, -(rev.interets || 0), '💰')}
    ${ligneDetail(d.instable ? 'Instabilité (−30 % sur le total)' : 'Arrondis',
      rev.or - (d.orProvinces + d.orBonus + d.impots + d.commerce + d.tribut
        - d.verse - d.entretienArmee - d.entretienFlotte - (rev.interets || 0)), '💰')}

    <div class="hub-total ${rev.nourriture >= 0 ? '' : 'neg'}">
      <span>🌾 Nourriture</span><b>${rev.nourriture >= 0 ? '+' : ''}${rev.nourriture}<small>/tour</small></b>
    </div>
    ${ligneDetail('Provinces et fermes', d.nourProvinces, '🌾')}
    ${ligneDetail('Doctrine agraire', d.nourBonus, '🌾')}
    ${ligneDetail('Ravitaillement des troupes', -d.rationTroupes, '🌾')}
    ${ligneDetail(d.instable ? 'Instabilité (−30 %)' : 'Arrondis',
      rev.nourriture - (d.nourProvinces + d.nourBonus - d.rationTroupes), '🌾')}

    <div class="hub-total"><span>🔬 Science</span><b>+${rev.science}<small>/tour</small></b></div>
    ${ligneDetail('Provinces et bibliothèques', d.sciProvinces, '🔬')}
    ${ligneDetail('Doctrine rationaliste', d.sciBonus, '🔬')}
    ${ligneDetail(d.instable ? 'Instabilité (−30 %)' : 'Arrondis',
      rev.science - (d.sciProvinces + d.sciBonus), '🔬')}

    <h3 class="titre-section">📦 Production de marchandises</h3>
    <div class="pp-stats">${Object.entries(MARCHANDISES).map(([bien, def]) =>
      `<span>${def.icone} ${moi.marchandises[bien] | 0} <small class="${prod[bien] ? 'pos' : ''}">${
        def.manufacture ? '(atelier)' : '+' + (prod[bien] || 0)}</small></span>`).join('')}</div>
    <div class="rangee-btn"><button class="btn" onclick="fermerHub();ouvrirCommerce()">📦 Marché</button></div>`;
}

// ---------- Menu & sauvegardes manuelles ----------
function ouvrirMenu() {
  let slots = '';
  for (let s = 1; s <= 3; s++) {
    const info = infoSlot(s);
    slots += `<div class="ligne-bien">
      <div class="lb-info">
        <b>💾 Emplacement ${s}</b>
        <small>${info ? `${info.nation} — tour ${info.tour}, an ${info.annee}` : 'vide'}</small>
      </div>
      <button class="btn btn-mini btn-principal" onclick="uiSauvegarderSlot(${s})">Sauver</button>
      <button class="btn btn-mini" ${info ? '' : 'disabled'} onclick="uiChargerSlot(${s})">Charger</button>
    </div>`;
  }
  ouvrirModale(`<h2>⚙️ Menu</h2>
    <div class="colonne-btn" style="margin-bottom:10px">
      <button class="btn btn-principal" onclick="ouvrirDynastie()">👑 Ma dynastie</button>
    </div>
    <p><small>La partie en cours est aussi sauvegardée automatiquement à chaque fin de tour.</small></p>
    ${slots}
    <div class="colonne-btn" style="margin-top:14px">
      <button class="btn btn-danger" onclick="uiRetourTitre()">🏳️ Abandonner et retourner au titre</button>
    </div>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`);
}

function uiSauvegarderSlot(s) {
  if (sauvegarderSlot(s)) toast(`💾 Partie sauvegardée (emplacement ${s}).`);
  else toast('Échec de la sauvegarde.');
  ouvrirMenu();
}

function uiChargerSlot(s) {
  if (!chargerSlot(s)) { toast('Emplacement vide ou illisible.'); return; }
  fermerModale();
  deselectionner();
  construireCarteStatique();
  centrerSurJoueur();
  majTout();
  toast(`📂 Partie chargée (emplacement ${s}).`);
}

function uiRetourTitre() {
  fermerModale();
  afficherEcranTitre();
}

// ---------- Aide & légende ----------
function ouvrirAide() {
  let terrains = '';
  for (const [id, t] of Object.entries(TERRAINS)) {
    if (id === 'eau') continue;
    const g = (GISEMENTS_PAR_TERRAIN[id] || []).map(([b]) => ICONES_GISEMENTS[b]).join('');
    terrains += `<div class="ligne-detail"><span>${DECOR_TERRAIN[id] || '🟩'} ${t.nom}</span>
      <small>🌾${t.nourriture} 💰${t.or} 🔬${t.science} · déf ×${t.defense}${g ? ' · ' + g : ''}</small></div>`;
  }
  let unites = '';
  for (const [id, u] of Object.entries(TYPES_UNITES)) {
    unites += `<div class="ligne-detail"><span>${u.icone} ${u.noms[nation(G.joueur).ere]}</span>
      <small>att ×${u.attaque} · déf ×${u.defense} · ${u.cout.or}💰 ${u.cout.nourriture}🌾${u.cout.fer ? ' ' + u.cout.fer + '⚒️' : ''}${u.cout.pierre ? ' ' + u.cout.pierre + '🪨' : ''} + 1👥</small></div>`;
  }
  ouvrirModale(`<h2>❓ Aide</h2>
    <h3 class="titre-section">Terrains</h3>${terrains}
    <h3 class="titre-section">Unités (${ERES[nation(G.joueur).ere].nom})</h3>${unites}
    <h3 class="titre-section">Les clés du jeu</h3>
    <p><small>
    🛡️ Le bouton <b>Royaume</b> (ou la barre du haut) ouvre votre tableau de bord : forces, <b>menaces</b>, <b>opportunités</b> et le détail de chaque pièce d'or gagnée.<br>
    🔔 La <b>cloche</b> garde les événements importants : guerre déclarée, province perdue, famine. Une pastille rouge = à lire.<br>
    ✨ Votre royaume est cerné d'un <b>liseré doré</b> sur la carte ; vos frontières avec un ennemi en guerre virent au <b>rouge</b>.<br>
    🗺️ Les boutons en haut à gauche changent la <b>vue de la carte</b> : politique, terrain, gisements 📦, militaire.<br>
    👥 La <b>population</b> travaille (rendement max à 8+) et fournit les recrues. Démobilisez pour repeupler.<br>
    ⛏️ Un <b>gisement</b> produit 1/tour ; avec son bâtiment (mine, scierie…) : jusqu'à 7/tour.<br>
    🏗️ <b>4 emplacements</b> de bâtiment par province : spécialisez-vous !<br>
    ⚓ Le <b>port</b> ouvre le commerce maritime, le contact avec les nations lointaines et les invasions.<br>
    🕊️ On ne traite qu'avec les nations <b>en contact</b> (frontière ou ports des deux côtés).<br>
    💍 <b>Mariages royaux</b> et cadeaux montent les relations ; les alliés rejoignent vos guerres défensives.<br>
    🏭 Les <b>forges</b> (2 ⚒️ → 1 🗡️) et <b>ateliers</b> (2 🌶️ → 1 💎) créent des biens 3-4× plus chers — le peuple consomme du 💎.<br>
    ⚔️ Un <b>général</b> booste vos attaques ; les assauts répétés usent les <b>murailles</b> ennemies ; les guerres longues épuisent le peuple.<br>
    🕵️ Les <b>espions</b> volent, sabotent, soulèvent et assassinent ; surveillez vos <b>factions</b> (écran Royaume).<br>
    🏆 <b>3 victoires</b> : domination (55 % des terres), science (Ascension), diplomatie (allié avec tous).
    </small></p>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`);
}

// ---------- Dynastie ----------
function cartePersonnage(perso, role) {
  return `<div class="ligne-bien">
    <div class="lb-info">
      <b>${role} ${perso.nom}</b>
      <small>${perso.age} ans · 🗡️ ${perso.martial} martial · 🕊️ ${perso.diplomatie} diplomatie · 💰 ${perso.intendance} intendance</small>
    </div>
  </div>`;
}

function uiNommerGeneral(index) {
  const r = nommerGeneral(G.joueur, index);
  if (!r.ok) toast(r.raison || 'Impossible');
  else toast(`⚔️ ${nation(G.joueur).general.nom} commande désormais vos armées !`);
  majTout();
  ouvrirDynastie();
}

function ouvrirDynastie() {
  const moi = nation(G.joueur);
  let html = `<h2>👑 Dynastie de ${moi.nom}</h2>`;
  html += cartePersonnage(moi.dirigeant, '👑');
  html += `<p><small>🗡️ martial : +${(moi.dirigeant.martial * 1.5).toFixed(1)} % de force en attaque ·
    💰 intendance : +${(moi.dirigeant.intendance * 1.5).toFixed(1)} % d'or ·
    🕊️ diplomatie : alliances plus faciles</small></p>
    <h3 class="titre-section">Héritiers</h3>`;
  if (moi.heritiers.length === 0) {
    html += `<p><small>Aucun héritier… Si le souverain meurt, une crise de succession éclatera (−15 stabilité).</small></p>`;
  }
  for (const h of moi.heritiers) {
    html += cartePersonnage(h, h.age >= AGE_MAJORITE ? '🤴' : '👶');
  }
  html += `<h3 class="titre-section">⚔️ Général en chef</h3>`;
  if (moi.general) {
    html += cartePersonnage(moi.general, '⚔️') +
      `<p><small>${moi.general.victoires || 0} victoires · bonus d'attaque : +${(moi.general.martial * 2).toFixed(0)} % · il peut tomber au combat…</small></p>`;
  } else {
    html += `<p><small>Aucun général : vos armées ne bénéficient d'aucun commandement d'élite.</small></p>
      <div class="colonne-btn">`;
    moi.heritiers.forEach((h, i) => {
      if (h.age >= AGE_MAJORITE) {
        html += `<button class="btn" onclick="uiNommerGeneral(${i})">⚔️ Nommer ${h.nom} général <small>(quitte la succession · 🗡️ ${h.martial})</small></button>`;
      }
    });
    html += `<button class="btn" onclick="uiNommerGeneral(-1)">⚔️ Recruter un général de métier (150 💰)</button></div>`;
  }
  const unions = moi.mariages.filter(m => nation(m).vivante).map(m => nation(m).nom);
  html += `<h3 class="titre-section">💍 Unions royales</h3>
    <p><small>${unions.length ? unions.join(' · ') : 'Aucune — proposez un mariage royal via la Diplomatie (héritier de 16 ans requis).'}</small></p>
    <div class="rangee-btn"><button class="btn" onclick="fermerModale()">Fermer</button></div>`;
  ouvrirModale(html);
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
  if (!UI.mode) UI.mode = 'terre';
  const el = document.getElementById('ecran-titre');
  const defs = UI.mode === 'terre' ? NATIONS_TERRE : NATIONS_DEFS;
  let cartes = '';
  defs.forEach((d, i) => {
    const p = PERSONNALITES[d.perso];
    cartes += `<div class="carte-nation choix-nation" onclick="demarrerPartie(${i})">
      <span class="pastille" style="background:${d.couleur}"></span>
      <div class="cn-info"><b>${d.nom}</b><small>${p.nom}${UI.mode === 'terre' ? ' · capitale : ' + d.nomCapitale : ''}</small></div>
    </div>`;
  });
  el.innerHTML = `
    <div class="titre-bloc">
      <h1>⚔️ Chroniques des Ères</h1>
      <p class="sous-titre">De l'an 1000 à la conquête des étoiles.<br>Guerre · Diplomatie · Commerce · Technologie</p>
      ${sauvegardeExiste() ? '<button class="btn btn-principal btn-large" onclick="reprendrePartie()">▶️ Reprendre la partie</button>' : ''}
      <div class="choix-mode">
        <button class="btn ${UI.mode === 'terre' ? 'btn-principal' : ''}" onclick="UI.mode='terre';afficherEcranTitre()">🌍 Terre — An 1000</button>
        <button class="btn ${UI.mode === 'aleatoire' ? 'btn-principal' : ''}" onclick="UI.mode='aleatoire';afficherEcranTitre()">🎲 Monde aléatoire</button>
      </div>
      <h3>Choisissez votre ${UI.mode === 'terre' ? 'puissance historique' : 'nation'}</h3>
      <div class="liste-nations">${cartes}</div>
    </div>`;
  el.style.display = 'flex';
  document.getElementById('ecran-jeu').style.display = 'none';
}

function demarrerPartie(nid) {
  supprimerSauvegarde();
  nouvellePartie(nid, UI.mode);
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
