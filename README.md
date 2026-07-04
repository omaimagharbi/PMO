# PMP Simulateur

Plateforme d'entraînement à l'examen de certification **PMP (Project Management Professional)**, générée à partir de ta banque de 65 questions (3 examens blancs), avec comptes utilisateurs, suivi de progression par domaine PMI, et espace d'administration.

## Démarrer

Aucune installation n'est nécessaire : ouvre simplement `index.html` dans un navigateur.

Pour un fonctionnement optimal (notamment si tu ajoutes des images plus tard), tu peux aussi le servir avec un petit serveur local :

```bash
cd pmp-simulator
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Compte admin par défaut

- **Utilisateur :** `admin`
- **Mot de passe :** `admin123`

⚠️ Change ce mot de passe dès la première connexion, depuis **Administration → Paramètres**.

## Fonctionnalités

- **Comptes utilisateurs** : inscription / connexion (page d'accueil).
- **4 formats d'examen** : Examen blanc I (30 questions), Examen éclair (5 questions), Examen blanc II (30 questions), et un Examen mixte (65 questions mélangées).
- **Minuteur, navigation entre questions, indicateur de progression.**
- **Correction détaillée** après chaque examen : bonne/mauvaise réponse, justification, répartition par domaine PMI (Personnes / Processus / Environnement commercial), historique complet.
- **Espace admin** :
  - Ajouter, modifier, supprimer des questions (banque complète, y compris tes 65 questions d'origine).
  - Voir la liste des comptes créés et leurs statistiques (nombre d'examens, score moyen, meilleur score).
  - Changer le mot de passe admin.

## Comment fonctionnent les données — point important

Ce projet est **100% statique** (HTML/CSS/JS, sans serveur ni base de données). Toutes les données — comptes, mots de passe, tentatives d'examen, questions ajoutées par l'admin — sont stockées dans le **`localStorage` du navigateur**, c'est-à-dire :

- Les données restent **sur l'appareil et le navigateur** où le site est utilisé. Si tu ouvres le site sur un autre ordinateur ou un autre navigateur, tu repars de zéro.
- L'espace admin ne peut donc voir que les comptes/scores créés **sur ce même navigateur** — pas ceux d'utilisateurs sur d'autres appareils.
- Le "hash" de mot de passe utilisé est volontairement simple et sert uniquement à éviter de stocker les mots de passe en clair localement — **ce n'est pas une sécurité de niveau production**.

### Pour héberger une vraie plateforme multi-utilisateurs

Si tu veux que plusieurs personnes partagent les mêmes comptes/scores depuis des appareils différents, il faut ajouter un vrai backend (base de données + API). La structure du code est prévue pour ça : toutes les opérations de données passent par l'objet `Store` dans `js/storage.js` — il suffit de remplacer les fonctions `localStorage` par des appels `fetch()` vers une API, sans toucher au reste de l'app (pages, quiz, admin).

Options simples si tu veux franchir cette étape : Supabase, Firebase, ou une petite API Node/Express + PostgreSQL.

## Structure du projet

```
pmp-simulator/
├── index.html          # connexion / inscription
├── dashboard.html       # tableau de bord, choix de l'examen
├── quiz.html             # passage de l'examen
├── results.html          # résultats + correction détaillée
├── history.html          # historique complet des tentatives
├── admin.html             # espace administration
├── css/style.css
├── js/
│   ├── data.js           # banque de 65 questions (générée depuis ton document)
│   ├── storage.js        # couche de persistance (localStorage)
│   ├── ui.js              # composants partagés (nav, compas des domaines, toasts)
│   ├── dashboard.js
│   ├── quiz.js
│   ├── results.js
│   └── admin.js
└── data/questions.json    # même banque de questions, au format JSON brut
```

## Personnaliser la banque de questions

Deux façons :
1. **Via l'interface** : Administration → Questions → Ajouter/Modifier/Supprimer.
2. **Directement dans le code** : édite `js/data.js` (tableau `QUESTIONS`) — chaque question a la forme :

```js
{
  "id": 1,
  "exam": 1,
  "domain": "People",
  "text": "Énoncé de la question...",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "C",
  "justification": "Explication affichée dans la correction."
}
```

---

*Outil d'entraînement indépendant, non affilié au Project Management Institute (PMI®). PMP® est une marque déposée du PMI.*
