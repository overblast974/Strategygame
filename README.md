# ⚔️ Chroniques des Ères

**Grand strategy mobile** inspiré de Crusader Kings : menez votre nation du Moyen Âge (an 1000) jusqu'à l'ère futuriste, par la guerre, la diplomatie ou la science.

## 🎮 Jouer

C'est un jeu web 100 % autonome (aucune dépendance, aucun serveur requis) :

- **Sur téléphone / ordinateur** : ouvrez simplement `index.html` dans un navigateur.
- **En local** : `python3 -m http.server 8000` puis ouvrez `http://localhost:8000`.
- **En ligne** : activez GitHub Pages sur ce dépôt (Settings → Pages → branche) et jouez depuis n'importe quel téléphone. Ajoutez la page à votre écran d'accueil pour une expérience plein écran.

La partie est **sauvegardée automatiquement** à chaque fin de tour (localStorage).

## 🏰 Systèmes de jeu

| Système | Détails |
|---|---|
| **Carte** | ~190 provinces hexagonales générées aléatoirement (plaines, forêts, collines, montagnes, déserts, mers). Pan au doigt, pinch pour zoomer. |
| **8 nations** | Chacune avec une personnalité d'IA : conquérant, diplomate, marchand, savant, opportuniste, expansionniste. |
| **5 ères** | Moyen Âge → Renaissance → Industrielle → Moderne → Futuriste. Les unités évoluent (chevaliers → mousquetaires → fusiliers → blindés → mechas) ainsi que les bâtiments. |
| **Guerre** | Déclaration de guerre, conquête province par province, bonus de terrain et de forteresse, garnisons, capitales. Les alliés rejoignent les guerres défensives. |
| **Diplomatie** | Relations dynamiques, alliances, pactes de non-agression, cadeaux, tributs, vassalisation, négociation de paix (avec compensation en or). |
| **Économie** | Or, nourriture, science, stabilité. Constructions améliorables : fermes, marchés, académies, forteresses. Famines, révoltes, entretien des armées. |
| **Événements** | Événements narratifs à choix multiples adaptés à votre ère (mariage princier, peste, grève ouvrière, IA émergente…). |

## 🏆 Trois voies de victoire

1. **Domination** — contrôlez 70 % des terres ou soumettez toutes les nations.
2. **Scientifique** — atteignez l'ère futuriste et achevez le projet *Ascension Stellaire* avant les autres.
3. **Diplomatique** — unissez toutes les nations survivantes sous vos alliances.

## 🛠️ Technique

- HTML5 / JavaScript vanilla + **PixiJS 7** (rendu WebGL, embarqué localement — aucun CDN, aucun build).
- PWA : installable sur l'écran d'accueil, jouable **hors-ligne** (service worker).
- `js/lib/pixi.min.js` — moteur de rendu PixiJS.
- `js/data.js` — terrains, ères, nations, bâtiments, événements.
- `js/game.js` — moteur : carte, économie, combat, diplomatie, technologie, sauvegarde.
- `js/ai.js` — IA des nations (utilité + personnalité).
- `js/ui.js` — scène PixiJS (couches, animations, particules), gestes tactiles, panneaux et modales.
