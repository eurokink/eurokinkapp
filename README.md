# EuroKink — appli web (PWA)

Toutes les soirées fetish, en France puis en Europe.

**Version 0.1.0, étape 1 (démonstration)** : les écrans Accueil, Explorer, Fiche soirée, Mes soirées, Communauté (à venir) et Profil avec le passeport. Les soirées sont **fictives** et les favoris, rappels, alertes et présences sont enregistrés **sur l'appareil** uniquement. Supabase sera branché à l'étape 2.

## Tester sur le téléphone

1. Ouvrir le lien GitHub Pages du dépôt dans Safari (iPhone) ou Chrome (Android).
2. Pour l'installer comme une appli : bouton Partager › « Sur l'écran d'accueil » (iPhone), ou menu › « Installer l'application » (Android).
3. Pour essayer le passeport sans être à une soirée : Profil › Réglages › **Mode test**, puis « Je suis sur place » sur n'importe quelle soirée.

## Organisation des fichiers

```
index.html            Page unique de l'appli
manifest.webmanifest  Nom, couleurs et icônes pour l'installation
sw.js                 Fonctionnement hors ligne (changer CACHE à chaque version)
css/styles.css        Style (univers sombre noir, gris, rouge)
js/app.js             Écrans et logique
js/data.js            Soirées, villes, types et badges de démonstration
fonts/                Police Inter hébergée localement (aucun appel à Google)
icons/                Icônes de l'appli
```

## Publier une nouvelle version

1. Augmenter le numéro dans `sw.js` (`CACHE`), `js/app.js` (`VERSION`) et `index.html` (`?v=`).
2. Envoyer les fichiers sur la branche `main` : GitHub Pages met le site à jour en une minute environ.
3. Sur le téléphone, fermer puis rouvrir l'appli pour charger la nouvelle version.

## Confidentialité

- Aucun outil de statistiques, aucune police ni ressource chargée depuis un service tiers.
- La position GPS sert uniquement à vérifier la présence à une soirée : elle n'est ni enregistrée ni envoyée.
- Les rappels de calendrier peuvent porter le titre neutre « Sortie » (réglage « Notifications discrètes »).
