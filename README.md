# Plane is out — v5 (îles 1 et 2, 1 à 4 joueurs)

Jeu d'aventure coopératif low poly en HTML, CSS et JavaScript (Three.js). C'est un mélange de trois choses :
- **Esprit RV There Yet :** un véhicule que l'on répare, remorque et bichonne.
- **Esprit How to Fish :** on pêche, on achève sa prise, on la revend.
- **Une nuit de zombies** à survivre.

Vous êtes l'équipage du Coucou, un vieil hydravion qui transporte la caisse Hélios, le remède attendu par le laboratoire.

## Jouer seul

Ouvrez `dist/plane-is-out.html` dans un navigateur récent. Aucun serveur n'est nécessaire.

## Jouer à plusieurs : le serveur de jeu

Le serveur (`server/server.js`) sert le jeu et gère les parties.
- **Parties :** chaque partie est une salle avec un code à 4 lettres, jusqu'à 4 joueurs.
- **Hôte :** le serveur le désigne (le plus ancien joueur de la salle) et le remplace automatiquement s'il part.
- **Sauvegarde :** l'hôte l'envoie au serveur toutes les 20 secondes. Une partie peut être reprise plus tard avec le même code, et elle est gardée 14 jours.
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
- **Déplacement :** Z Q S D · Souris : regarder · Maj : courir · Espace : sauter
- **Interagir :** E (maintenir pour réparer, treuiller, tirer une corde, relever un coéquipier) · G : lâcher
- **Outils :** 1 à 7 ou molette : poings, clé à molette (et chalumeau), diable, lanterne, pistolet de détresse, fusil-harpon, canne à pêche
- **Clic :** frapper, tirer, lancer la ligne. Clic maintenu : souder ou mouliner.
- **Infos :** T : montre · Tab : carnet · M : carte · P : photo d'un indice · Échap : pause

En équipe :
- **Entrée :** message texte, entendu de près (ou partout avec un talkie).
- **B maintenu :** parler au micro, même règle de portée.
- **C maintenu :** messages rapides.
- **V :** placer un repère.

Aux commandes : Z / S gaz · Q / D palonnier · Souris ou flèches : manche · P : pilote automatique · C : vue cockpit · E : quitter le siège.

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

**Crash**
- Le Coucou heurte les arbres, les bâtiments et le relief. Au roulage, c'est un simple choc ; en vol, c'est l'épave.
- Deux ou trois pièces sont éjectées autour de l'épave, et la coque est percée de deux trous.
- **Réparer :**
  1. Prendre le chalumeau dans la caisse à outils de la porte cargo.
  2. Rapporter chaque pièce et la positionner.
  3. Plaquer une tôle sur chaque trou (les tôles sont éparpillées autour de l'épave).
  4. Souder chaque point orange : outil 2, viser, clic maintenu, relâcher quand la jauge est dans le vert. Trop tard, c'est la surchauffe.
- Si l'épave est à terre, on la tire à la corde, sous la queue, jusqu'à l'eau. Elle bute sur les obstacles et avance plus vite à plusieurs.

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
3. Treuiller la caisse Hélios dans la soute, puis décoller.

Bonus : coffre du canot (3 symboles à retrouver sur l'île), Crabe-Roi dans sa crique, pêche, canards, trésor.

**Chapitre 2 · Saint-Escale** (position aléatoire, à trouver au radar)
1. Remettre le courant : 3 fusibles, placés selon l'affiche du terminal.
2. Prendre l'ascenseur de la tour (séquenceur de sécurité, un jeu de mémoire), puis appeler Marthe sur la fréquence écrite sur la caisse. Elle annonce une tempête pour le soir : la mer sera trop forte pour décoller sur l'eau, il faudra la piste. Elle donne aussi le code du hangar, et la tour fournit des talkies.
3. Récupérer les roues amphibies dans le hangar 2 et les monter sur l'avion.
4. Faire le plein : décrocher le pistolet de la pompe (le tuyau suit le joueur), le brancher sur l'aile droite, purger le circuit (énigme des tuyaux), puis doser la pression.
5. **Nuit de tempête :**
   - la porte de l'avion est grillée ;
   - il faut défendre le générateur de la centrale jusqu'à 21 h, contre 3 vagues dont le Colosse ;
   - on répare le générateur à la clé s'il lâche.
6. Décoller depuis la piste : c'est la fin de la démo.

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
  - `wreck.js` : crash, soudure, remorquage
  - `fishing.js` : pêche
  - `combat.js` : armes, boss, siège, coquillages
  - `interact.js` : interactions et énigmes
  - `saves.js` : sauvegardes
- **Réseau :**
  - `mp.js` : salon, avatars, synchronisation, chat de proximité
  - `net.js` : transports (serveur de salles ou salon de page)
  - `voice.js` : voix
- **Monde :** `terrain.js` (dont les collisions automatiques et les panneaux), `decor.js`, `island2.js`, `planeModel.js`, `enemies.js`
