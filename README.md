# NEXUS — PPM Augmenté par l'IA

> *De l'épreuve à l'élan*

Prototype fonctionnel (MVP) d'une plateforme de **Project Portfolio Management (PPM) augmentée par l'IA**, illustrant trois scénarios de rupture pour la gestion de projet selon les standards PMI/PMP :

1. **Détecteur de scope creep & simulateur de chemin critique** — un chat client simulé déclenche une analyse de conformité au périmètre, un recalcul visuel du planning (Gantt) et un chiffrage automatique de l'impact (délai + budget).
2. **Carte thermique & arbitrage de ressources autonome** — une grille d'équipe avec jauges de charge colorées (vert/orange/rouge) déclenche une proposition d'arbitrage IA entre projets du portefeuille.
3. **Copilote contextuel de leçons apprises (OPA vivantes)** — un formulaire de création de tâche/risque est surveillé en tâche de fond par un copilote qui alerte sur les incidents historiques similaires et propose la mesure préventive associée.

## Stack technique

| Élément | Choix |
|---|---|
| Structure | HTML5 sémantique, SPA à onglets |
| Style | Tailwind CSS (CDN) + `style.css` pour les composants et animations spécifiques |
| Logique | JavaScript Vanilla ES6+, aucune dépendance externe |
| Typographies | Sora (titres), Inter (texte courant), JetBrains Mono (données chiffrées) |
| Persistance | `localStorage` pour le thème (clair/sombre) et l'onglet actif — aucune donnée envoyée à un serveur |

Aucun build, aucun bundler, aucun `node_modules` : le projet s'exécute directement dans le navigateur.

## Arborescence du dépôt

```
nexus-ppm/
├── index.html            Structure de la page et des 3 scénarios
├── tailwind.config.js    Palette de couleurs et typographies (chargé par le CDN Tailwind)
├── style.css              Composants visuels (cartes, badges, animations) et mode sombre/clair
├── app.js                  Navigation globale entre les onglets 01/02/03 et bascule de thème
├── scenarios.js           Moteur logique des 3 scénarios interactifs
└── README.md               Ce document
```

## Lancer le projet en local

Aucune installation n'est requise.

```bash
git clone https://github.com/<votre-compte>/nexus-ppm.git
cd nexus-ppm
```

Puis ouvrez simplement `index.html` dans votre navigateur, ou servez le dossier avec un serveur statique léger si votre navigateur restreint les requêtes locales :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Déployer sur GitHub Pages en 2 minutes

1. **Créer le dépôt**
   Sur GitHub, créez un nouveau dépôt public nommé par exemple `nexus-ppm`.

2. **Pousser le code**

   ```bash
   git init
   git add .
   git commit -m "Initial commit — NEXUS PPM Augmenté par l'IA"
   git branch -M main
   git remote add origin https://github.com/<votre-compte>/nexus-ppm.git
   git push -u origin main
   ```

3. **Activer GitHub Pages**
   Dans le dépôt GitHub : `Settings` → `Pages` → section **Build and deployment** :
   - Source : `Deploy from a branch`
   - Branch : `main` — dossier `/ (root)`
   - Cliquez sur `Save`.

4. **Accéder au site**
   Après 1 à 2 minutes, votre application est disponible à l'adresse :

   ```
   https://<votre-compte>.github.io/nexus-ppm/
   ```

   GitHub affiche l'URL exacte en haut de la page `Settings → Pages` une fois le déploiement terminé.

Aucune variable d'environnement, aucune clé API, aucun backend n'est requis : le dossier est servi tel quel en fichiers statiques.

## Personnalisation rapide

- **Couleurs de marque** : ajustez les valeurs hexadécimales des palettes `navy` et `gold` dans `tailwind.config.js`.
- **Données métier** (tâches du Gantt, ressources, base d'OPA) : modifiables directement dans les tableaux `baseTasks`, `resources` et `opaDatabase` en tête de `scenarios.js`.
- **Mode sombre par défaut** : la préférence système est détectée automatiquement au premier chargement (`prefers-color-scheme`), puis mémorisée localement dès que l'utilisateur bascule manuellement le thème.

## Mise en route du backend réel (à faire une seule fois)

1. **Créer une base Neon** sur https://neon.tech (offre gratuite suffisante pour démarrer), copier la chaîne de connexion dans `DATABASE_URL`.
2. **Créer une clé Voyage AI** sur https://www.voyageai.com pour `VOYAGE_API_KEY` (nécessaire au RAG du Scénario 3).
3. **Installer les dépendances et charger le schéma** :

   ```bash
   npm install
   cp .env.example .env   # puis remplir les valeurs
   npm run db:migrate
   ```

4. **Créer votre premier projet et récupérer son ID** :

   ```bash
   psql "$DATABASE_URL" -c "SELECT id, name FROM projects;"
   ```

   Copiez l'UUID de "AtlasApp" (créé automatiquement par `schema.sql`) et collez-le dans le champ **"ID Projet"** en haut de l'interface.

5. **Peupler la base de leçons apprises (Scénario 3)** :

   ```bash
   npm run db:seed-opa
   ```

6. **Déclarer votre équipe (Scénario 2)** — une ligne par personne, en associant son identifiant Jira et/ou GitHub :

   ```sql
   INSERT INTO resources (full_name, role, jira_account_id, github_username, weekly_capacity_hours)
   VALUES ('Amine K.', 'Développeur Senior', '<account-id-jira>', '<login-github>', 35);
   ```

7. **Téléverser une charte de projet PDF** directement dans l'interface (champ prévu en haut de page) pour créer la Scope Baseline du Scénario 1.

8. **Lancer en local avec les fonctions serverless actives** :

   ```bash
   npm run dev
   ```

   (`vercel dev` sert à la fois `index.html` et le dossier `/api` sur `http://localhost:3000`.)

## Limites connues à ne pas perdre de vue

- Le calcul de charge GitHub (`api/resources/webhook-github.js`) repose sur une heuristique volume-de-code → heures, calibrée arbitrairement (`40 lignes ≈ 1h`, plafonné à 6h/PR). À recalibrer avec des données réelles avant tout usage RH.
- Valider une recommandation d'arbitrage (Scénario 2) enregistre la décision en base mais ne modifie pas rétroactivement les heures déjà loggées : la charge affichée ne baissera réellement qu'avec les futurs événements Jira/GitHub reflétant le transfert.
- Les webhooks Jira/GitHub nécessitent que chaque ressource soit préalablement déclarée dans la table `resources` avec son identifiant externe (voir étape 6 ci-dessus) — un événement reçu pour un compte inconnu est rejeté avec une erreur 404 explicite.

## Prochaines étapes suggérées

- Ajouter un vrai moteur EVM (CPI/SPI calculés dynamiquement) en complément de l'estimation de dérive de périmètre.
- Ajouter une authentification et une gestion multi-utilisateurs si le prototype évolue vers un produit multi-tenant.
- Construire une interface d'administration pour créer des projets et déclarer les ressources sans passer par `psql`.

---

**NEXUS** — Prototype pédagogique et commercial. Aucune donnée personnelle ou client réelle n'est utilisée dans cette démonstration.
