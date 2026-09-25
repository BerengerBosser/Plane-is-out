# Plane is out — v7 (trois îles, 1 à 4 joueurs)

Jeu d'aventure coopératif low poly en HTML, CSS et JavaScript (Three.js). C'est un mélange de trois choses :
- **Esprit RV There Yet :** un véhicule que l'on répare, remorque et bichonne.
- **Esprit How to Fish :** on pêche, on achève sa prise, on la revend.
- **Une nuit de zombies** à survivre.

**L'histoire.** Une fièvre court dans l'archipel des Sept Vents : au crépuscule, les malades se relèvent. Sur le continent, on a isolé la souche d'un remède, une seule, dans une seule caisse. Seul le laboratoire de Marthe, sur l'île d'Hélios, peut en tirer des doses pour tout l'archipel. Votre équipage doit la livrer par un vol direct, à bord du Coucou, un vieil hydravion.

Rien ne se passe comme prévu, et chaque étape en découle :
1. **L'orage** abat le Coucou sur un îlot perdu. Marthe capte la balise de détresse et vous guide par la radio de secours : il faut réparer.
2. **Le réservoir a été percé** dans le crash. Hélios est hors de portée : Marthe vous envoie faire le plein à Saint-Escale, l'aéroport évacué le plus proche. Sans courant, pas de pompe ; une tempête arrive, il faudra décoller de la piste.
3. **Le moteur remonté sur la plage lâche** en route vers Hélios. Atterrissage forcé à Port-Cendre, l'île au volcan : le Coucou est perdu, mais un Boeing abandonné peut finir le voyage.

Quatre personnages au choix dans le menu principal : Gaston le pilote, Nina la mécano, Mamie Lou la pêcheuse et Bako l'aventurier. La couleur du joueur teinte leur pièce signature (écharpe, salopette, bob, bandeau).

## Jouer seul

Ouvrez `dist/plane-is-out.html` dans un navigateur récent. Aucun serveur n'est nécessaire.

## Jouer à plusieurs : le serveur de jeu

Le serveur (`server/server.js`) sert le jeu et gère les parties.
- **Parties :** chaque partie est une salle avec un code à 4 lettres, jusqu'à 4 joueurs.
- **Hôte :** le serveur le désigne (le plus ancien joueur de la salle) et le remplace automatiquement s'il part.
- **Sauvegarde :** l'hôte l'envoie au serveur toutes les 20 secondes. Une partie peut être reprise plus tard avec le même code, et elle est gardée 14 jours. L'inventaire de chaque joueur est gardé avec la partie (retrouvé en revenant sous le même nom).
- **Solo → multijoueur :** Pause → « Inviter des amis » ouvre la partie en cours ; les amis rejoignent avec le code et apparaissent à côté de vous. Dans le salon, l'hôte peut aussi reprendre sa sauvegarde solo (cochée par défaut).
- **Connexion perdue :** le jeu se reconnecte tout seul et rejoint la même partie.

### Mettre le serveur en ligne (gratuit, environ 5 minutes, avec Render)
1. Mettez ce dossier sur un dépôt GitHub (privé ou public).
2. Sur [render.com](https://render.com), cliquez « New + », puis « Blueprint », et choisissez le dépôt. Le fichier `render.yaml` configure tout (installation, build, démarrage, vérification de santé).
3. Render vous donne une adresse, par exemple `plane-is-out.onrender.com`.
4. Tout le monde ouvre cette adresse dans son navigateur, clique « Multijoueur », puis crée ou rejoint une partie. La liste des parties ouvertes s'affiche.

À savoir sur l'offre gratuite de Render :
- le serveur s'endort après 15 minutes sans joueur, et le premier chargement prend alors environ 30 secondes ;
- son disque est effacé à chaque redémarrage. Pour garder les sauvegardes, ajoutez un disque Render monté sur `/app/data` et définissez la variable `DATA_DIR`.

### Autres façons de lancer le serveur
- **En local ou sur le réseau de la maison :**
  ```
  npm install
  node build.mjs
  npm start          # http://localhost:8080  (variables : PORT, DATA_DIR)
  ```
- **Avec Docker :**
  ```
  docker build -t plane-is-out .
  docker run -p 8080:8080 -v pio-data:/app/data plane-is-out
  ```
- **Fichier HTML ouvert ailleurs :** saisissez l'adresse du serveur dans le champ « Serveur » du salon multijoueur, par exemple `plane-is-out.onrender.com`.
- **Page publiée sur claude.ai :** elle ne peut pas joindre un serveur extérieur. Elle utilise son propre salon, réservé aux personnes avec qui la page est partagée.

**Micro (chat vocal) :** les navigateurs ne l'autorisent qu'en HTTPS ou sur `localhost`. Render fournit le HTTPS.

## Commandes

À pied :
- **Déplacement :** Z Q S D · Souris : regarder · Maj : courir · Espace : sauter · C maintenu : s'accroupir
- **Monter à bord :** un escalier (invisible) descend de la porte cargo jusqu'à l'eau : on marche jusqu'à la porte et on entre sans téléportation ; on ressort de la même façon. En vol, <kbd>E</kbd> à la porte pour sauter (Espace en chute libre : parachute, s'il est dans un équipement rapide). Une chute sans parachute fait très mal.
- **Échelles :** Z face à l'échelle pour grimper, S pour descendre, Espace pour lâcher.
- **Eau :** on nage ; Z face à un ponton, un quai ou un rocher pour se hisser dessus.
- **Interagir :** E (maintenir pour réparer, décharger, relever un coéquipier, pousser l'avion coincé) · R : action secondaire · G : lâcher
- **Inventaire (I), à la Unturned :** chaque objet occupe des cases (un fusil 4×2, un bandage 1×1). Les poches viennent des vêtements portés : tenue de base 2×2 + 2×2 au départ, puis chemises, pantalons cargo, gilets et sacs trouvés sur les îles (sacoche 3×3, sac à dos 4×4, sac de randonnée 5×5, sac militaire 6×6). Glisser-déposer, R pour tourner un objet, double-clic pour équiper ou prendre, clic droit pour les actions (utiliser, diviser une pile, jeter…).
- **En main :** 1 arme principale, 2 arme secondaire, 3 à 6 équipements rapides (bandage, talkie, lanterne, trousse, parachute…). 0 ou la même touche : mains nues. H : bandage. Les munitions sont des objets rangés dans les poches.
- **Combat :** clic pour frapper ou tirer · clic droit : viser · R : recharger. Tir dans la tête ×2. Le bruit des armes à feu attire les morts.
- **Talkie :** en main, il se lève devant vous quand vous parlez (B) et la voix des autres est claire ; rangé dans le sac, elle arrive étouffée.
- **Infos :** montre toujours affichée · T : montre au poignet · Tab : carnet · M : carte · P : photo d'un indice
- **Aide des touches :** elle apparaît quelques secondes quand la situation change (nouvel objet en main, véhicule, avion…), puis s'efface. La liste complète est dans Pause → Commandes.
- **Menu :** Échap : pause (plein écran, sauvegardes, paramètres, admin de la partie).

En équipe :
- **Entrée :** message texte, entendu de près (ou partout avec un talkie).
- **B maintenu :** parler au micro, même règle de portée.
- **X maintenu :** messages rapides · **V :** placer un repère.
- On voit ce que tiennent les coéquipiers (armes, outils, talkie, diable chargé ou vide) et on peut se taper dessus (tir ami désactivable dans l'admin).

Aux commandes : Z / S gaz · Q / D palonnier · Souris ou flèches : manche · P : pilote automatique · C : vue cockpit · E : quitter le siège.

En véhicule : E conduire ou monter en passager (le passager peut tirer) · Z accélérer · S freiner puis reculer · Q / D tourner · Espace : frein à main (dérapage) · C : vue. On voit son personnage au volant en vue extérieure. Camions spéciaux : Espace pomper, saisir/poser, atteler · R / F fourches · clic maintenu : lance à eau.

**Admin de la partie** (Pause → Admin, réservé à l'hôte en multijoueur) : passer la nuit, +1 heure, tombée de la nuit, temps ×10, réparer le Coucou, sauter au chapitre 2 ou 3, toutes les armes, +50 coquillages, soigner, invincible, horde, tuer tous les zombies, tir ami, infos de débogage. Il remplace les anciennes touches F1 à F4.

## Règles du monde

**La nuit (19 h à l'aube)**
- Les morts sortent de terre, de plus en plus nombreux au fil de la nuit.
- La lumière (feu de camp, lanterne, projecteurs de l'avion, fusées) les ralentit et les brûle un peu, sans les arrêter.
- Le seul endroit où l'on peut dormir, et donc passer la nuit, est l'avion, à condition qu'il soit à flot sur l'eau et que sa porte fonctionne. À terre, on peut s'y abriter, mais pas dormir.
- Les nuits passent plus vite que les jours.

**Le verrou de la porte cargo**
- Il se grippe parfois le soir, à partir du deuxième jour : impossible d'entrer ou de sortir.
- On le dégrippe à la clé en maintenant E à la porte. La progression est conservée, et c'est plus rapide avec l'aide d'un coéquipier. Sinon, il se débloque de lui-même au matin.
- Pendant la tempête de Saint-Escale, la foudre le grille : pas d'abri, il faut se battre.

**Zombies et armes**
- Six sortes de morts : le rôdeur, le coureur (rapide, il bondit), le rampant (au ras du sol, visez bas), le gonflé (il explose en nuage toxique : tuez-le de loin), le hurleur (il garde ses distances et appelle la horde) et le cogneur (énorme et blindé : visez la tête). Ils annoncent leurs coups : reculez au bon moment.
- Dans les bâtiments de Saint-Escale et de Port-Cendre, des morts dorment même le jour. Le bruit les réveille.
- Chaque coup fait gicler le sang (vert chez les crabes et les gonflés) et laisse des taches au sol.
- Armes de mêlée : poings, clé à molette, machette (campement de Jo), batte cloutée (bar de l'Escale), hache de pompier (caserne de Port-Cendre).
- Armes à feu : fusil à pompe du gardien (dans son cabanon), pistolet de service (coffre du poste de sécurité de Saint-Escale), carabine (bureau de la police aux frontières, terminal de Port-Cendre). Munitions : caisses dans les postes de garde (une fois par jour) et comptoirs.

**Pousser et treuiller le Coucou**
- Coincé contre la plage ou un rocher, le Coucou se pousse à la main (maintenir E contre la coque, à plusieurs c'est plus rapide). Sans roues, impossible de le monter sur le sable.
- Le treuil du nez tire l'avion vers un point d'ancrage : arbre, rocher, poteau… ou un pieu d'ancrage planté n'importe où (R, crochet en main). Les pieux s'achètent aux comptoirs.

**Coque et crash**
- Une jauge de coque (en bas à gauche près de l'avion, et dans les instruments de vol) mesure l'état du Coucou. Un avion cabossé tire moins fort et fume.
- Plus l'impact est violent, plus les dégâts sont lourds : un choc au roulage fait une bosse ; un atterrissage brutal cabosse la carcasse ; un vrai crash éjecte de 1 à 3 pièces et perce la coque. La carcasse se salit, se noircit et se couvre de brûlures.
- **Réparer :**
  1. Décrocher le fer à souder du poste à souder (flanc droit de l'avion) : il reste relié par un câble de 18 m. G pour le raccrocher.
  2. Rapporter chaque pièce et la positionner, plaquer une tôle sur chaque trou.
  3. Souder chaque point orange : viser, clic maintenu, relâcher quand la jauge est dans le vert. Chaque soudure fait remonter la coque, et l'avion reprend ses couleurs.
  4. Les bosses se ressoudent aussi, au fer, quand on veut (facultatif pour repartir).
- De petites orbes lumineuses signalent de loin chaque trou et chaque pièce à remettre.
- Avec les roues amphibies, l'avion réparé repart de la terre ferme. Sans roues, on tire l'épave au treuil jusqu'à l'eau : crochet au nez de l'avion, à accrocher à un arbre, un rocher ou un poteau, puis bouton au bout du câble.

**Butin, vêtements et coffre**
- Valises, casiers et caisses se fouillent (E) : leur contenu est tiré au sort pour la partie et partagé par l'équipage. Chaque île garantit au moins un sac : la sacoche de Jo, les objets trouvés du terminal de Saint-Escale, la caisse de la police de Port-Cendre. Les pièces les plus rares (sac militaire, gilet tactique) sont surtout à Port-Cendre.
- Les vêtements changent l'allure du personnage (tout le monde commence en tenue de base) : veste et treillis militaires, gilet de sauvetage (nage rapide), gilet renforcé, casques qui protègent.
- Le coffre du Coucou (dans la cabine, au pied de la couchette) est partagé : on y range ce qui ne tient pas dans les poches. Il affiche aussi l'équipement de l'avion (pièces, roues amphibies, améliorations) et sa coque.
- Au comptoir : sacoche, sac à dos, gilet renforcé et parachute, en plus des munitions.

**Pêche et coquillages**
- Les coquillages sont la monnaie de l'archipel. On les ramasse sur les plages (ils reviennent chaque matin), et les crabes et les zombies en lâchent parfois.
- La canne s'achète 3 🐚 chez Jo (caisse de troc au campement de l'île 1).
- **Pêcher :**
  1. Clic pour lancer vers l'eau.
  2. À la touche, clic pour ferrer.
  3. Clic maintenu pour mouliner, en relâchant quand la tension monte.
  4. Au sol, le poisson frétille : achevez-le. Un coup en plein saut compte double.
- La pêche se vend au comptoir, ou se grille au feu (+40 santé).

## Déroulé

**Chapitre 1 · Plage du Crash**
1. Trouver le diable, la clé à molette et la lanterne.
2. Rapporter les 6 pièces. Le code du cabanon se déduit du mot sur la porte et de la plaque du phare.
3. Treuiller la caisse Hélios dans la soute, monter à bord par la porte cargo et décoller vers Hélios. En vol, Marthe découvre que le réservoir fuit : cap sur Saint-Escale.

Bonus : coffre du canot (3 symboles à retrouver sur l'île), Crabe-Roi dans sa crique, pêche, canards, trésor.

**Chapitre 2 · Saint-Escale** (position aléatoire, à trouver au radar)
1. Remettre le courant : 3 fusibles, placés selon l'affiche du terminal. Chacun est derrière une énigme physique :
   - **rouge**, sur le toit du terminal : l'échelle de service est arrachée en bas, il faut glisser une caisse de fret dessous (le kart à bagages aide à la transporter) ;
   - **bleu**, dans le poste de sécurité : poser deux miroirs sur les socles et les orienter pour guider un laser jusqu'au capteur (un miroir est dans la salle, l'autre au terminal) ;
   - **jaune**, dans le local technique du balisage, en bout de piste côté dépôt de carburant : sa porte à double commande ne s'ouvre que si ses deux pédales de sécurité restent enfoncées (un coéquipier, le sac de lest de la manche à air ou le bloc de béton du chantier).
   Le kart à bagages électrique se recharge à sa borne, derrière le terminal.
2. Monter à la tour par l'escalier extérieur (ou l'ascenseur, avec le courant et son séquenceur), puis appeler Marthe sur la fréquence écrite sur la caisse (la radio de la tour porte bien plus loin que celle du Coucou). La météo de la tour annonce une tempête pour le soir : la mer sera trop forte pour décoller sur l'eau, il faudra la piste. Elle donne aussi le code du hangar, et la tour fournit des talkies.
3. Récupérer les roues amphibies dans le hangar 2 et les monter sur l'avion.
4. Faire le plein : décrocher le pistolet de la pompe (le tuyau suit le joueur), le brancher sur l'aile droite, purger le circuit (énigme des tuyaux), puis doser la pression.
5. **Nuit de tempête :**
   - la porte de l'avion est grillée ;
   - il faut défendre le générateur de la centrale jusqu'à 21 h, contre 3 vagues dont le Colosse ;
   - on répare le générateur à la clé s'il lâche.
6. Décoller de la piste, cap sur Hélios.

**Chapitre 3 · Port-Cendre** (île volcanique, aéroport international abandonné)
1. En route vers Hélios, au-dessus de Port-Cendre, le moteur droit (celui remonté sur la plage) prend feu : se poser tout de suite, sur la piste ou sur l'eau (rampe à l'est).
2. Éteindre l'incendie : rideaux de la caserne (bouton), camion de pompiers (clic maintenu : lance à eau) ou extincteurs.
3. Le Coucou ne revolera pas. Décharger la caisse Hélios, au sec.
4. Remettre en état le vol HX-404, resté à sa porte :
   - batterie de démarrage au sommet de la tour de contrôle, dont l'escalier s'est effondré : un chariot élévateur qui tient une caisse à la bonne hauteur fait un pont ;
   - kérosène : remplir le camion-citerne sous le portique du dépôt, puis le Boeing sous l'aile droite ;
   - caisse Hélios dans la soute avec le chariot élévateur (fourches levées) ;
   - repoussage jusqu'au taxiway avec le tracteur (atteler la roue avant) ;
   - camion-escalier contre la porte avant, puis le cockpit : décollage vers Hélios. C'est la fin de la démo.
   On peut dormir dans la cabine du Boeing.

## Sauvegardes

Dans le menu pause, on peut :
- sauvegarder la partie ;
- la télécharger au format `.json` ;
- importer une sauvegarde ;
- relancer une nouvelle partie (deux clics pour confirmer).

Le menu principal propose aussi l'import. En multijoueur, l'hôte détient la sauvegarde, et le serveur en garde une copie.

## Développer

```
npm install
node build.mjs     # dist/plane-is-out.html (+ variante pour page publiée)
npm start          # serveur de jeu
```

Sources principales dans `src/` :
- **Déroulé et état partagé :**
  - `game.js` : boucle, objectifs et vol
  - `world.js` : actions validées par l'hôte, instantanés
- **Mécaniques :**
  - `night.js` : nuit, verrou, sommeil
  - `wreck.js` : coque, crash, fer à souder, remorquage
  - `gear.js`, `inventory.js`, `invui.js` : objets, inventaire à grilles, coffres, butin partagé
  - `fishing.js` : pêche
  - `combat.js` : armes, boss, siège, coquillages
  - `interact.js` : interactions et énigmes
  - `puzzles3d.js` : énigmes physiques (échelle, caisses, laser, plaques de pression)
  - `vehicles.js` : kart, camions, chariot élévateur, tracteur
  - `chapter3.js` : incendie, Boeing, cinématique finale
  - `saves.js` : sauvegardes
- **Réseau :**
  - `mp.js` : salon, avatars, synchronisation, chat de proximité
  - `net.js` : transports (serveur de salles ou salon de page)
  - `voice.js` : voix
- **Monde :** `terrain.js` (dont les collisions automatiques et les panneaux), `decor.js`, `island2.js`, `island3.js`, `boeing.js`, `planeModel.js`, `enemies.js`, `props.js`, `textures.js`, `trail.js`
- **Personnages :** `avatars.js` (les quatre personnages, portraits du menu)

## Performances

Paramètres › Graphismes : préréglages Basse, Moyenne, Haute ; distance d'affichage ; résolution dynamique (activée par défaut, elle baisse la définition quand les images par seconde chutent) ; luminosité. Au-delà du brouillard, rien n'est dessiné, et les ombres sont recalculées une image sur deux.

## Voix

Le chat vocal est spatialisé en stéréo (HRTF). La réverbération dépend du lieu : petite pièce (cabines, vigies), grand hall (terminaux, hangars, caserne), écho près du volcan et des falaises.
