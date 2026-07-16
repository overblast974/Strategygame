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
| **Deux mondes** | 🌍 **Terre historique — An 1000** : carte du monde réel 64×40 générée depuis les contours réels des continents (déserts, chaînes de montagnes et climats aux bons endroits) avec les 12 puissances de l'époque — France capétienne, Saint-Empire, Angleterre, Califat de Cordoue, Byzance, Fatimides, Rus' de Kiev, Empire Song, Japon Heian, Cholas, Ghana, Toltèques — leurs **provinces historiques** (Normandie, Anatolie, Sichuan…) et les cités-états de l'époque (Venise, Novgorod, Angkor, Cuzco…). Ou 🎲 **Monde aléatoire** : continents procéduraux, nations fictives. |
| **Dynasties** 👑 | Chaque nation est menée par un souverain (âge, compétences martiale/diplomatie/intendance qui influencent guerre, or et alliances). Naissances d'héritiers, morts, successions — et **crises de succession** sans héritier majeur. **Mariages royaux** entre dynasties (+30 relations, alliances facilitées). |
| **12 nations** | Chacune avec une personnalité d'IA : conquérant, diplomate, marchand, savant, opportuniste, expansionniste. |
| **Contact** | On ne traite qu'avec les nations **en contact** : frontière commune, ou un port de chaque côté — construire des ports ouvre le monde. |
| **Marine** ⛵ | Navires de guerre construits dans les ports : **batailles navales** automatiques en guerre, **blocus** (flotte très supérieure = routes coupées et ports affaiblis chez l'ennemi), **invasions amphibies** sur toute côte ennemie. |
| **Doctrines** 🏛️ | Une doctrine nationale au choix (militariste, mercantiliste, rationaliste, agraire) avec bonus exclusifs, changeable tous les 15 tours. |
| **Spécialisation** | Chaque province peut être orientée : agricole, minière, lettrée, commerçante (+50 % sur la voie choisie, −25 % ailleurs). |
| **Cités-états** 🏛️ | 7 cités libres fortifiées (Byzance, Samarkande, Palmyre…) annexables par la négociation (contre de l'or, si votre territoire les borde) ou par la force. |
| **Mercenaires** 🏴 | 3 compagnies libres à engager contre de l'or (Lames Noires, Compagnie du Faucon…), renouvelées tous les 6 tours. Les IA en guerre les embauchent aussi. |
| **5 ères** | Moyen Âge → Renaissance → Industrielle → Moderne → Futuriste. Les unités évoluent (chevaliers → mousquetaires → fusiliers → blindés → mechas) ainsi que les bâtiments. |
| **Guerre** | Déclaration de guerre, conquête province par province, bonus de terrain et de forteresse, garnisons, capitales. Les alliés rejoignent les guerres défensives. |
| **Armées** | 3 types d'unités à acheter, aux noms évoluant par ère : infanterie 🗡️, choc 🐎 (chevaliers → chars → mechas, +60 % attaque) et siège 💣 (trébuchets → artillerie, neutralise les forteresses). |
| **Diplomatie** | Relations dynamiques, alliances, pactes de non-agression, accords commerciaux, achat direct de ressources (−10 % du marché), tribut sous la menace (gare au retour de flamme…), cadeaux, vassalisation, négociation de paix. |
| **Économie** | Or, nourriture, science, stabilité. Constructions améliorables : fermes, marchés, académies, forteresses, exploitations. Famines, révoltes, entretien des armées. |
| **Population** 👥 | Chaque province a des habitants : ils travaillent (le rendement dépend de la population), paient l'impôt et croissent si le peuple est nourri. **Recruter consomme la population** ; on peut démobiliser des soldats pour les rendre aux champs. |
| **Gisements & extraction** | Chaque province recèle 0 à 2 gisements (🪵 ⚒️ 🪨 🌶️ et 🪙 or) selon son terrain. Il faut bâtir **le bâtiment adéquat** (scierie, mine de fer, carrière, plantation, mine d'or) pour l'exploiter vraiment. |
| **Choix d'aménagement** | **4 emplacements de bâtiment par province** (5 en capitale) parmi 10 bâtiments : impossible de tout avoir. Pays marchand (marchés, mines d'or, plantations, ports) ou puissance industrielle (mines de fer, carrières = armes bon marché) ? |
| **Commerce naval** ⚓ | Le port (côtier) ouvre des **routes maritimes** avec les partenaires commerciaux équipés de ports (+5 💰/tour chacune, tracées sur la carte) et permet le **transport naval** de troupes entre vos ports. |
| **Production & commerce** | 4 marchandises échangeables : le fer équipe les unités, le bois et la pierre servent aux bâtiments, les épices remontent la stabilité. **Marché mondial à prix dynamiques** (l'offre et la demande — y compris celles des IA — font bouger les cours) et accords commerciaux entre nations (+8 💰/tour chacun). |
| **Sauvegardes** 💾 | Sauvegarde automatique chaque tour + **3 emplacements manuels** via le menu ⚙️. |
| **Chaînes de production** 🏭 | Les forges transforment le fer en 🗡️ armes, les ateliers les épices en 💎 luxe — des biens 3-4× plus chers au marché. Le peuple **consomme du luxe** (stabilité). Événements de marché (pénuries, surabondances), **embargos**, **prêts bancaires** avec intérêts, **caravanes terrestres** entre voisins. |
| **Guerre stratégique** ⚔️ | **Généraux** (héritier qui renonce au trône, ou soldat de métier) : bonus d'attaque, gloire… et mort possible au combat. Les assauts répétés **usent les murailles** ennemies ; les **guerres longues épuisent** la stabilité des deux camps. |
| **Espionnage** 🕵️ | Jusqu'à 3 espions : voler la science, saboter ports et forteresses, fomenter des révoltes, **assassiner un héritier** (au risque de déclencher une guerre). |
| **Factions internes** | Noblesse, marchands et peuple réagissent à chaque décision — une faction poussée à bout organise une **vraie rébellion armée**. |
| **Événements historiques** 📜 | En mode Terre : l'appel à la croisade (~1096), **l'invasion mongole** (~1206 : Gengis Khan surgit en 13e nation, puis son empire **se fragmente à sa mort**), la **peste noire** (~1347), le **Nouveau Monde** (~1492). |
| **Lisibilité** 📊 | Tapez la barre du haut → **écran Empire** (revenus détaillés ligne par ligne, forces, progression d'ère). **4 vues de carte** : politique, terrain, gisements, militaire. **Simulation de bataille** avant chaque assaut (probabilité de victoire sur 300 combats simulés, pertes attendues, détail des modificateurs). Aide-légende ❓ intégrée. |
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
