# Noledj 📚

Bienvenue ! Noledj est un projet d'apprentissage personnel, en français, conçu pour
**un seul apprenant** qui suit un parcours structuré d'environ 5 mois
(**2026-06-01 → 2026-10-15**, ~300 heures d'effort).

Toute l'application de suivi et de consultation des cours tient dans **un seul fichier HTML autonome**
(`avancement.html`) — du _vanilla JS_ + CSS, **sans système de build, sans framework, sans dépendance**.  
La progression est enregistrée entièrement dans le `localStorage` du navigateur (clé `noledj_v1`).  
Il n'y a ni serveur, ni _backend_ : tout reste chez vous.

## Pour démarrer 🚀

Le contenu des cours est chargé à l'exécution via `fetch()`, ce qui ne fonctionne pas en
`file://` (à cause du CORS). Il faut donc servir le dossier en HTTP :

```bash
python3 -m http.server 8000
# puis ouvrez http://localhost:8000/avancement.html
```

Et voilà, vous êtes prêt à apprendre ! ✨

## Ce que Noledj fait

- **Une _timeline_** de 5 phases → semaines → séances, chacune avec sa date, ses heures prévues et son intitulé.
- **La mise en avant du jour** et des statistiques **heures prévues vs. réalisées**, pilotées par la `date` de chaque séance.
- **Des cours chargés à la demande** : cliquer sur une séance ouvre une fenêtre à onglets qui va chercher le _markdown_
  correspondant au moment voulu (puis le met en cache), affiché par un moteur de rendu _markdown_ écrit à la main.
- **Une persistance locale** avec sauvegarde/import et réinitialisation — tout dans le `localStorage`, rien ne quitte le navigateur.

---

## Outils 🛠️

```bash
# Régénérer l'index COURSES dans avancement.html à partir du markdown sur le disque
python3 inject_courses.py
python3 inject_courses.py --dry-run    # affiche le résumé, sans écrire

# Produire une version minifiée en un seul fichier (avancement.min.html)
python3 minify.py
python3 minify.py --stats              # affiche les stats (taille/gzip), sans écrire
```

Il n'y a ni tests, ni _linter_, ni manifeste de dépendances.

## Organisation des fichiers 🗂️

```tree
avancement.html        l'application (la seule chose à lancer)
inject_courses.py      construit l'index COURSES et l'injecte dans avancement.html
minify.py              avancement.html → avancement.min.html
parcours.md            le plan d'apprentissage maître / le squelette
cours/                 le contenu des cours : cours/prioriteN/<Sujet>/Module-NN.md
ressources/            les docs sources du parcours (chronologie, glossaire, gogetit, priorityN/)
```

`prioriteN` correspond à un niveau de priorité (0 = le plus élevé).  
Un suffixe `+P` sur un fichier de module (par ex. `Module-07+P.md`) signale le module qui contient le mini-projet.

## Comment tout reste synchronisé 🔄

Trois pièces couplées doivent rester d'accord :

1. **`avancement.html`** contient `PHASES` (la _timeline_ qui fait foi) et `COURSES`
   (un index séance → _markdown_ généré ; au repos, simplement `const COURSES = {};`).
2. **`inject_courses.py`** contient `SESSION_MODULES` (id de séance → fichiers de cours) et régénère `COURSES`.
   Relancer le script est idempotent.
3. **`cours/.../Module-*.md`** sont les fichiers référencés par `SESSION_MODULES` et chargés à l'exécution.

Un identifiant de séance `sNN` apparaît à la fois dans `PHASES` et dans `SESSION_MODULES`.  
Quand vous ajoutez/renommez/déplacez un fichier de cours ou ajoutez une séance :

- mettez à jour `SESSION_MODULES` dans `inject_courses.py`, puis **relancez** `python3 inject_courses.py`
- une séance présente dans `PHASES` mais absente de `SESSION_MODULES` s'affiche simplement sans contenu de cours
  (c'est voulu pour les séances de révision ou tampon — l'interface ne propose un cours que lorsque `COURSES[sid]` existe).

Après avoir modifié `avancement.html`, régénérez `avancement.min.html` avec `minify.py` si vous avez besoin d'une version minifiée.

Bonne visite ou bon apprentissage ! 🎓
