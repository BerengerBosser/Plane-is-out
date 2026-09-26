# Sons du jeu

Déposez ici vos fichiers audio (mp3, wav, ogg, m4a, flac, opus, webm), en vrac ou en sous-dossiers
(`music/` pour les musiques, par exemple).

1. `npm start`, puis ouvrez **http://localhost:8080/studio**.
2. Choisissez un son dans la liste, passez sa source sur « Fichiers » et glissez-y un fichier de la bibliothèque
   (ou déposez un mp3/wav depuis votre ordinateur : il est copié ici).
3. Découpez, calibrez, réglez la réverb… tout s'entend en direct, ici et dans le jeu ouvert dans le même navigateur.
4. **Enregistrer** (Ctrl+S) écrit `config.json`, que le jeu lit au démarrage.

Fichier remplacé ou ajouté à la main dans ce dossier : **F9** (dans le jeu ou le studio) recharge tout.

L'enregistrement et l'import ne sont acceptés que depuis la machine qui fait tourner le serveur
(variable `SOUND_EDIT=1` pour l'autoriser partout, `SOUND_EDIT=0` pour l'interdire).
