# M4 — Décisions techniques

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Conduire une **décision technique structurée** (choix de langage, de framework, de SGBD) en s'appuyant sur une méthode reproductible plutôt que sur l'intuition ou la mode.
- Distinguer les **critères qui comptent vraiment** des critères qui semblent compter (popularité, GitHub stars, lecture en vacances).
- **Recommander un SGBD** adapté à un contexte donné en mobilisant un arbre de décision concret (relationnel, document, clé-valeur, colonne, graphe, temporel, recherche).
- Rédiger une **note de cadrage technique** (ou _ADR — Architecture Decision Record_) qui survit au turnover et explique le **pourquoi** d'un choix six mois après.
- Identifier les **anti-patterns** de prise de décision : _hype-driven development_, _résumé driven design_, _curriculum-driven choice_, _golden hammer_.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M1 à M3 (vocabulaire architecture, trade-offs, CQRS).
- Connaissance suffisante d'au moins **deux** SGBD (typiquement un relationnel + une variante NoSQL, ex : PostgreSQL + DynamoDB ou MongoDB).
- POO M5 (SOLID) — pour reconnaître quand un choix technique en cache un autre (couplage, abstraction).

---

## 1. Pourquoi formaliser les décisions techniques ?

### Le problème silencieux

Trois ans après avoir choisi un framework ou un SGBD, **personne** dans l'équipe ne se souvient pourquoi. Le contexte initial a été oublié, les compromis assumés sont devenus invisibles, et les frustrations actuelles ressemblent à des défauts de l'outil — alors qu'elles découlent souvent d'un choix qui était **bon à l'époque** mais qui n'a pas été réévalué.

**Conséquences concrètes**, observées dans la plupart des projets :

- Le choix technique se transmet **par tradition orale**, distordu à chaque transmission.
- Les nouvelles décisions s'ajoutent **sans cohérence** avec les anciennes (parce qu'on ne sait plus à quelles contraintes les anciennes répondaient).
- Le débat "on garde X ou on passe à Y ?" tourne en rond, faute de critères communs.
- Les évolutions d'équipe (départs, recrutements) effacent le contexte plus vite que la documentation se met à jour.

### Ce qu'apporte une décision formalisée

Une décision technique **bien documentée** :

1. Rend **le contexte explicite** — on sait ce qu'on essayait de résoudre.
2. Liste les **alternatives écartées** — on sait ce qu'on n'a pas choisi et pourquoi.
3. Précise les **compromis assumés** — on sait ce qu'on a accepté de perdre.
4. Définit des **conditions de réévaluation** — on sait quand redébattre.

C'est l'objet de l'**ADR** (_Architecture Decision Record_), un format léger popularisé par Michael Nygard en 2011. Un ADR tient sur une page, vit dans le repo, et accompagne chaque décision structurante.

**Analogie.** Un compte-rendu de visite chez le médecin. Sans compte-rendu, dans six mois on ne sait plus pourquoi tel traitement a été prescrit, ni à quel symptôme il répondait. Avec un compte-rendu daté, le médecin suivant peut reprendre où on en était, ajuster si le diagnostic a évolué, et savoir si le traitement a porté ses fruits. Un ADR fait la même chose pour une décision technique.

---

## 2. Une méthode reproductible — la grille à six questions

Pour ne pas redécouvrir la roue à chaque décision, six questions à se poser dans l'ordre. C'est une boussole, pas une checklist mécanique — chaque question doit être **honnêtement** répondue.

### 2.1 — Quelle est la contrainte qu'on essaie de résoudre ?

Une décision technique n'a de sens qu'**en réponse à une contrainte**. Si on n'arrive pas à formuler la contrainte en une phrase, la décision est probablement **esthétique** (ou idéologique) — et donc fragile.

Mauvaise formulation : _"On veut un framework moderne."_
Bonne formulation : _"On doit livrer un MVP en 8 semaines avec 3 développeurs, dont un junior. La V1 ne doit pas dépasser 50 utilisateurs simultanés."_

### 2.2 — Quel est l'horizon temporel ?

Une décision pour un prototype 3 mois n'est pas la même que pour un système conçu pour 10 ans.

- **Horizon court (< 1 an)** — privilégier ce qu'on connaît déjà, accepter la dette, ne pas sur-investir.
- **Horizon moyen (1 à 5 ans)** — accepter un coût d'apprentissage si le bénéfice durable le justifie.
- **Horizon long (5+ ans)** — privilégier la **maturité** de la techno et la disponibilité du marché de l'emploi sur la fraîcheur conceptuelle.

### 2.3 — Qui va maintenir le système ?

Une techno excellente entre les mains d'une équipe qui ne la maîtrise pas est pire qu'une techno moyenne bien maîtrisée. La question n'est pas _"quel est le meilleur outil ?"_ mais _"quel est le meilleur outil **pour cette équipe**, sur cette **durée**, dans ce **bassin d'emploi** ?"_

Trois sous-questions concrètes :

- **Compétences actuelles** — est-ce qu'au moins deux personnes maîtrisent la techno ?
- **Recrutabilité** — est-ce qu'on peut embaucher facilement sur cette techno dans la zone géographique ciblée ?
- **Diffusion interne** — est-ce qu'un nouvel arrivant peut monter en compétence en moins de 4 semaines avec les ressources publiques ?

### 2.4 — Quels sont les compromis assumés ?

Toute décision technique sacrifie quelque chose. Si on ne peut pas nommer ce qu'on sacrifie, on n'a pas vraiment décidé — on a juste **adopté**.

Liste de compromis typiques :

- **Vitesse de développement** vs **performance d'exécution**.
- **Simplicité** vs **flexibilité**.
- **Cohérence des données** vs **scalabilité horizontale**.
- **Liberté du modèle** (NoSQL) vs **garanties relationnelles**.
- **Standardisation** vs **adaptation fine au domaine**.
- **Coût initial** vs **coût récurrent**.

### 2.5 — Quels sont les **réversibles** vs **irréversibles** ?

Toutes les décisions ne se valent pas. Jeff Bezos parle de _**one-way doors**_ (irréversibles) et de _**two-way doors**_ (réversibles).

- **Réversible (two-way)** — choix de l'éditeur, du linter, du framework de test. On peut changer en quelques jours.
- **Semi-réversible** — choix d'un framework web, d'un broker de messages. On peut changer, mais ça coûte des semaines.
- **Quasi-irréversible (one-way)** — choix de langage principal, choix du SGBD primaire, modèle d'authentification central. Le retour en arrière coûte des mois ou des années.

**Règle.** Sur les décisions **réversibles**, décider vite et corriger plus tard. Sur les **irréversibles**, prendre le temps, multiplier les options, demander des avis externes.

### 2.6 — Quelles sont les conditions de réévaluation ?

Une décision n'est jamais éternelle. Définir **dès maintenant** les conditions qui la rendraient caduque :

- **Seuil quantitatif** — _"on réévalue le choix de SGBD si la latence p99 dépasse 200 ms ou si la taille de la base dépasse 500 Go."_
- **Événement métier** — _"on réévalue le choix de framework si une nouvelle équipe rejoint et qu'aucun de ses membres ne le maîtrise."_
- **Échéance temporelle** — _"on revoit la question dans 12 mois, indépendamment de l'état."_

Sans condition de réévaluation, la décision devient un dogme.

---

## 3. Choix d'un langage / framework applicatif

### 3.1 — Les critères qui comptent

Par ordre d'importance décroissante :

1. **Adéquation au domaine.** Le langage est-il **fait pour** ce qu'on veut faire ? Python excelle en data / scripts / API. Go excelle en réseau / outillage. TypeScript excelle en frontend / Node. Rust excelle en systèmes critiques. Java excelle en backend d'entreprise. Choisir Java pour un script de scraping est une mauvaise réponse, indépendamment de la qualité de Java.

2. **Maturité de l'écosystème.** Existe-t-il des **bibliothèques actives** pour les briques dont on va avoir besoin (ORM, validation, HTTP, observabilité, tests, déploiement) ?

3. **Marché de l'emploi.** Quelle est la **profondeur** du bassin de recrutement ? Une techno qui n'a que 200 ingés en France posera un problème quand il faudra grossir l'équipe.

4. **Compétences internes.** Les équipes en place sont-elles déjà compétentes ? L'apprentissage d'un langage coûte 3 à 6 mois avant productivité, 12 à 24 mois avant maîtrise.

5. **Performance brute.** Pertinent **uniquement** si la contrainte le rend critique (jeu, finance haute fréquence, calcul scientifique). Pour 90 % des apps métier, n'importe quel langage moderne tient la charge.

6. **Compatibilité avec l'infrastructure cible.** Le langage est-il **bien outillé** dans le cloud visé ? AWS / GCP / Azure ont tous des SDK pour les langages mainstream — c'est un non-critère sauf cas spécifique.

### 3.2 — Les critères qui ne comptent pas (ou pas autant qu'on le croit)

- **GitHub stars du framework.** Indicateur de bruit, pas de pertinence.
- **Présence dans la _"liste des technos cool"_ du blog tech du moment.**
- **Adoption par une grande entreprise** ("Netflix utilise X") — ce qui fonctionne chez Netflix avec 2 000 ingés ne fonctionne pas chez vous avec 12.
- **Élégance syntaxique perçue.** Source d'amour personnel, source nulle d'arbitrage d'équipe.

### 3.3 — Cinq familles de critères d'élimination

Quand on hésite entre deux options viables, ces cinq filtres permettent d'éliminer :

1. **Filtre de l'équipe** — qui peut intervenir dessus dans 6 mois ?
2. **Filtre du recrutement** — combien de candidats potentiels sur cette stack dans la zone géographique cible ?
3. **Filtre du _long-term support_** — la techno est-elle activement maintenue ? Quelle est sa cadence de release ? Quand sortira-t-elle de support ?
4. **Filtre des dépendances** — la techno impose-t-elle des dépendances lourdes (DSL propriétaire, framework couplant) ?
5. **Filtre de l'expérience comparable** — quels autres projets de taille similaire ont adopté cette techno avec succès **dans le même contexte** ?

### 3.4 — Anti-patterns courants

- **_Hype-driven development_** — on choisit ce qui faisait le buzz sur Twitter / Hacker News la semaine dernière.
- **_Résumé-driven design_** — on choisit la techno qui sera **bien sur le CV** plutôt que celle qui sert le projet.
- **_Curriculum-driven choice_** — on choisit ce que l'école / la formation interne enseigne, indépendamment du contexte.
- **_Golden hammer_** — on choisit toujours la même techno parce qu'elle a marché une fois ("quand on a un marteau, tout ressemble à un clou").
- **_Best-in-class fallacy_** — on assemble dans le système les meilleurs outils de chaque catégorie ; l'intégration entre ces outils mange tout le gain.

---

## 4. Choix du SGBD — vue d'ensemble

### 4.1 — Sept familles à connaître

Le mot "base de données" recouvre des produits radicalement différents. À l'échelle d'un parcours N2, sept familles à savoir nommer et distinguer :

| Famille                    | Représentants                                   | Question principale                                        |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| **Relationnel (SQL)**      | PostgreSQL, MySQL, SQL Server, Oracle, SQLite   | "Comment relier des entités fortement structurées ?"      |
| **Document**               | MongoDB, Couchbase, DocumentDB                  | "Comment stocker des objets riches sans schéma rigide ?"  |
| **Clé-valeur**             | Redis, DynamoDB (en mode K/V), Memcached        | "Comment lire / écrire très vite par identifiant ?"        |
| **Colonne (wide-column)**  | Cassandra, ScyllaDB, HBase                      | "Comment scaler en écriture sur des séries massives ?"     |
| **Graphe**                 | Neo4j, Amazon Neptune, ArangoDB                 | "Comment requêter des relations à N degrés ?"              |
| **Série temporelle**       | InfluxDB, TimescaleDB, Prometheus               | "Comment stocker et agréger des métriques horodatées ?"    |
| **Recherche**              | Elasticsearch, OpenSearch, Meilisearch          | "Comment indexer du texte pour la recherche full-text ?"   |

Une huitième famille à mentionner sans approfondir : les **bases multi-modèles** (DynamoDB en mode advanced, FaunaDB, ArangoDB) qui combinent plusieurs paradigmes — souvent au prix de la spécialisation.

### 4.2 — Arbre de décision

Question 1 — **Connaît-on précisément le schéma des données et leurs relations ?**

- **Oui, schéma stable, relations multiples.** → **Relationnel** (PostgreSQL par défaut).
- **Non, schéma flou ou très variable, faibles relations.** → continuer.

Question 2 — **Quel est le pattern d'accès dominant ?**

- **Lecture par identifiant unique, écriture ponctuelle.** → **Clé-valeur** ou **document**.
- **Écritures massives, peu de lectures complexes.** → **Colonne (Cassandra)**.
- **Lectures complexes type _"trouver tous les amis des amis"_** → **Graphe**.
- **Lectures principalement temporelles ou agrégats sur séries temporelles.** → **Série temporelle**.
- **Recherche full-text, scoring de pertinence.** → **Recherche (Elasticsearch)**.

Question 3 — **Le volume justifie-t-il une techno spécialisée ?**

Pour 90 % des projets, la réponse est **non au démarrage**. Un PostgreSQL bien indexé tient :

- 100 millions de lignes par table sans souffrir.
- 10 000 requêtes par seconde sur une instance correctement dimensionnée.
- Du JSON avec `JSONB` quand on a besoin de souplesse documentaire.
- De la recherche full-text basique avec `tsvector`.
- Des séries temporelles avec **TimescaleDB** (extension).

**Le piège classique** est de choisir un MongoDB ou un DynamoDB par anticipation d'une charge qui n'arrivera jamais. C'est l'équivalent d'acheter un camion pour transporter une bibliothèque qu'on ne lira jamais.

Question 4 — **Y a-t-il une contrainte d'écosystème ?**

- L'app est sur AWS et on veut du **managed**. → DynamoDB, RDS Aurora, Elasticache, etc. sont à privilégier (cf. parcours AWS Database).
- L'app vit on-premise. → choix plus large, mais coût d'exploitation à intégrer.

### 4.3 — Les questions piège

Trois questions souvent posées qui orientent mal le choix :

**"SQL ou NoSQL ?"** — fausse dichotomie. NoSQL regroupe 5+ familles très différentes. Reformuler en "**relationnel ou autre, et si autre, quelle famille ?**"

**"Postgres ou MongoDB ?"** — souvent comparées comme si c'était deux versions du même produit. Postgres est relationnel + extensions ; Mongo est document. Le bon choix dépend du **modèle métier**, pas d'un benchmark synthétique.

**"On scale comment ?"** — souvent prématurée. Avant de parler de scaling, vérifier qu'on a **un produit qui marche** et qu'on **mesure** sa charge. Beaucoup de projets meurent de sur-engineering du scaling avant d'avoir un utilisateur.

---

## 5. Critères de choix d'un SGBD — détail par axe

### 5.1 — Modèle de données

- **Entités relationnelles, transactions multi-tables, intégrité référentielle stricte** → relationnel.
- **Documents agrégés (un objet = un blob de données utilisables ensemble)** → document.
- **Accès par clé exclusivement, pas de relations** → clé-valeur.
- **Données fortement connectées, requêtes de parcours** → graphe.

### 5.2 — Garanties transactionnelles

Le théorème **CAP** dit qu'en présence de partition réseau, on doit choisir entre **cohérence** (C) et **disponibilité** (A). Tous les SGBD distribués font un choix sur cet axe.

- **CP (cohérence privilégiée)** — MongoDB par défaut, HBase, etcd.
- **AP (disponibilité privilégiée)** — Cassandra, DynamoDB en mode _eventually consistent_.
- **Bases relationnelles single-node** — pas concernées par CAP au sens strict (pas de partition à gérer), elles offrent ACID complet.

Pour un système métier où la cohérence des données est critique (finance, comptabilité, médical), **CP** ou **ACID** est obligatoire. Pour un système de feed social ou d'analytics, **AP** est acceptable.

### 5.3 — Profil de charge

- **OLTP (Online Transaction Processing)** — beaucoup de petites transactions courtes (CRUD type). → relationnel ou document.
- **OLAP (Online Analytical Processing)** — peu de grosses requêtes analytiques. → Redshift, BigQuery, Snowflake, Aurora avec extensions analytiques.
- **Mixte** → relationnel avec _read replicas_ pour l'analytique, ou CQRS physique (cf. M3) pour basculer les rapports sur une base dédiée.

### 5.4 — Coût opérationnel

- **Managed cloud** (RDS, DynamoDB, Atlas) — coût récurrent élevé, mais zéro opération.
- **Self-hosted** — coût récurrent faible, mais nécessite des compétences DBA en interne (backups, replication, upgrades, monitoring).

Pour une équipe de moins de 20 personnes sans DBA dédié, **toujours privilégier le managed**, sauf cas régulatoire ou contraintes spécifiques (on-premise obligatoire).

### 5.5 — Évolutivité du schéma

- **Schéma stable** sur la durée du projet → relationnel, contraintes fortes.
- **Schéma qui change souvent** (produits early-stage, expérimentations) → document, ou relationnel avec colonnes `JSONB`.

À noter : la **flexibilité de schéma** de MongoDB est un mythe sur le long terme. Au bout d'un an, on a quand même un schéma — il est juste **implicite** (non vérifié par la DB) au lieu d'**explicite** (vérifié). L'absence de schéma DB ne supprime pas le besoin de schéma applicatif.

### 5.6 — Compétences de l'équipe

Comme pour le langage, le **meilleur SGBD pour votre équipe** est celui que l'équipe maîtrise déjà — sauf si la contrainte métier l'interdit. Apprendre un nouveau SGBD coûte 2 à 6 mois avant d'éviter les erreurs débutants.

---

## 6. Le format ADR — Architecture Decision Record

### 6.1 — Format minimal

Un ADR tient sur **une page maximum**. Structure recommandée (popularisée par Michael Nygard) :

```markdown
# ADR-0007 — Choix de PostgreSQL comme SGBD primaire

## Statut

Accepté — 2026-04-15

## Contexte

[3 à 8 lignes décrivant la situation : besoin métier, contraintes,
ce qu'on essaie de résoudre, hypothèses non-discutables.]

## Décision

[1 à 3 lignes : on choisit X. Le verbe doit être au présent.]

## Alternatives considérées

- **MongoDB** — écarté car [raison].
- **DynamoDB** — écarté car [raison].
- **MySQL** — viable mais [raison de préférence].

## Conséquences

### Positives

- [Ce qu'on gagne, concrètement.]

### Négatives (compromis assumés)

- [Ce qu'on perd, concrètement.]

## Conditions de réévaluation

- Si la base dépasse 500 Go en taille.
- Si la latence p99 dépasse 200 ms en lecture après optimisation raisonnable.
- Au plus tard : 2027-04 (revue annuelle).
```

### 6.2 — Bonnes pratiques

- **Un ADR par décision.** Pas d'ADR fourre-tout.
- **Numérotation séquentielle.** ADR-0001, ADR-0002, etc. Jamais de réécriture rétroactive.
- **Statut immutable.** Un ADR accepté reste tel quel pour l'histoire. Si on revient sur la décision, on écrit un **nouvel ADR** qui supplante l'ancien (statut `Superseded by ADR-NNNN`).
- **Localisation** — dans le repo, sous `docs/adr/` ou `docs/architecture/decisions/`. Pas dans Confluence où plus personne ne va.
- **Court** — un ADR qui fait 3 pages n'est plus un ADR, c'est un livre blanc. Si la décision mérite 3 pages, soit la décision est trop large (la découper), soit on confond ADR et étude technique préalable.

### 6.3 — Ce qu'un ADR n'est **pas**

- Un **manuel d'utilisation** de la techno choisie.
- Un **benchmark** détaillé (qui va dans une étude annexe).
- Un **post-mortem** d'une décision passée (on écrit un nouvel ADR _Superseded by_).
- Une **wishlist** ("on aimerait avoir X un jour").

Le ton d'un ADR est **décisionnel et daté**, pas exploratoire.

---

## 7. Note de cadrage technique — au-delà de l'ADR

Un ADR formalise **une décision**. Une **note de cadrage** est plus large : elle pose le **contexte global** d'un projet ou d'une fonctionnalité avant que les décisions ne soient prises.

Structure typique d'une note de cadrage technique (2 à 4 pages) :

1. **Contexte métier** — qui demande quoi, pourquoi, dans quel délai.
2. **Périmètre** — ce qui est dans le projet, ce qui ne l'est pas.
3. **Contraintes** — techniques, organisationnelles, réglementaires, budgétaires.
4. **Hypothèses** — ce qu'on tient pour acquis (volumes, charge, profils utilisateurs).
5. **Options envisagées** — 2 ou 3 options structurantes, avec leurs trade-offs (formats cohérent avec M2 : couplage, complexité op., TTM, coût).
6. **Recommandation** — l'option retenue, en une phrase, avec les principaux trade-offs assumés.
7. **Risques** — ce qui peut faire dérailler le projet, et comment on prévoit d'y faire face.
8. **Décisions à prendre** — la liste des ADR à produire à partir de cette note de cadrage.

La note de cadrage **précède** les ADR. Les ADR **suivent** la note de cadrage. Ils ne se substituent pas l'un à l'autre.

---

## 8. Exercices pratiques

### Exercice 1 — Rédiger un ADR rétroactif (≈ 45 min)

Choisir une **décision technique** réelle de son contexte professionnel ou personnel (choix de framework, de base, de bibliothèque). Rédiger l'**ADR rétroactif** qui aurait dû exister à l'époque.

Contraintes :

- Une page maximum.
- Au moins **deux alternatives** documentées (même si elles n'avaient pas été sérieusement étudiées à l'époque — l'exercice consiste justement à les reconstruire).
- Au moins **deux conséquences négatives** (compromis assumés).
- Une **condition de réévaluation** chiffrée ou datée.

### Exercice 2 — Choisir un SGBD pour cinq cas (≈ 75 min)

Pour chaque cas, recommander **une famille** (relationnel, document, K/V, colonne, graphe, série temporelle, recherche) et **un produit** précis. Justifier en 3 à 5 lignes.

**Cas A — Backoffice de gestion clients d'un cabinet d'avocats.** 300 clients, 50 utilisateurs internes. Chaque client a un dossier avec contrats, factures, échanges. Audit légal exigé. Requêtes : recherche par client, listing par avocat, rapports trimestriels.

**Cas B — Application mobile de fitness.** 200 000 utilisateurs actifs / mois. Chaque utilisateur enregistre 1 à 5 séances / jour. Chaque séance contient 50 à 500 mesures horodatées (cardiaque, allure, etc.). Affichage : courbes hebdo / mensuelles, agrégats personnels.

**Cas C — Système de recommandation pour réseau social.** 5 millions d'utilisateurs. Chacun suit en moyenne 200 personnes. Question type : _"quels sont les amis des amis qui ont liké X cette semaine ?"_

**Cas D — Tableau de bord d'observabilité interne.** 200 services, chacun pushant 10 métriques par seconde. Stockage 90 jours. Requêtes : moyennes glissantes, alertes sur seuils, comparaisons d'historiques.

**Cas E — Recherche dans un catalogue e-commerce.** 2 millions de produits avec titre, description, attributs (couleur, taille, marque, prix, catégorie). Recherche full-text avec tolérance aux fautes, filtres à facettes, classement par pertinence.

**Critères de réussite.**

- Aucun cas n'est résolu par "MongoDB par défaut" ou "PostgreSQL par défaut" sans argument spécifique.
- Au moins **un cas** est attribué à un SGBD relationnel — pas tous au NoSQL.
- Pour chaque cas, **un compromis** explicite est nommé.

### Exercice 3 — Démasquer un anti-pattern (≈ 30 min)

Pour chaque extrait de réunion, identifier l'**anti-pattern** à l'œuvre (_hype-driven_, _résumé-driven_, _curriculum-driven_, _golden hammer_, _best-in-class fallacy_) et formuler **une question** qui ramène la discussion à un critère pertinent.

**Extrait 1.** _"On devrait passer à Rust sur le back. Tout le monde en parle, et puis ça nous différencierait au recrutement, on attirerait les bons ingénieurs."_

**Extrait 2.** _"Pour stocker les commandes, on prend Mongo, et pour les utilisateurs, Postgres, et pour les sessions, Redis, et pour la recherche, Elasticsearch. Comme ça chaque besoin a le bon outil."_

**Extrait 3.** _"On utilise Spring depuis 10 ans, et ça marche. Pour ce nouveau service de streaming temps réel à 50K events/s, on part aussi sur Spring, on connaît."_

**Extrait 4.** _"Le bootcamp envoie deux promos par an formées à Vue + Nuxt + Pinia. On part sur cette stack, ça nous évite la formation initiale des juniors."_

**Extrait 5.** _"GraphQL a fait le buzz à la conf' la semaine dernière. Notre API REST commence à dater, on devrait migrer."_

### Exercice 4 — Comparer deux options avec rigueur (≈ 60 min)

On hésite entre **deux frameworks backend Python** pour une nouvelle API : **FastAPI** (parcours en cours) et **Django REST Framework**. Le contexte :

- App d'administration interne pour 200 utilisateurs.
- Beaucoup de CRUD, interface d'admin native souhaitée.
- Équipe : 3 ingénieurs dont 2 connaissent Django, 1 connaît Flask, 0 connaissent FastAPI.
- Délai V1 : 3 mois.
- Pas de besoin de performance extrême.

Pour chaque framework, lister :

- **2 à 3 avantages** dans ce contexte.
- **2 à 3 inconvénients** dans ce contexte.

Puis recommander une option, en formulant la recommandation comme dans un ADR (statut, contexte, décision, alternatives, conséquences). 1 page maximum.

**Piège à éviter.** Ne pas choisir FastAPI "parce qu'on est dans le parcours FastAPI". Le contexte de l'exercice n'est pas celui du parcours.

---

## 9. Mini-défi de synthèse — note de cadrage technique (≈ 2,5 h)

Reprendre l'un des trois cas métier de **M2 exercice 3** (SaaS notes de frais / e-commerce européen / comptabilité de cabinet) ou un cas réel personnel. Produire une **note de cadrage technique** de **3 pages maximum** structurée selon la section 7 de ce module.

Contraintes spécifiques :

- **Section 5 (options envisagées)** — au moins 2 options structurantes pour le **choix de SGBD**, au moins 2 pour le **choix de langage / framework backend**. Avec leurs trade-offs.
- **Section 6 (recommandation)** — formulée en une phrase par axe (architecture / langage / SGBD).
- **Section 8 (décisions à prendre)** — produire en parallèle **deux ADR** d'une page chacun pour les deux décisions les plus structurantes (langage / framework et SGBD).

**Critères de validation.**

- La note de cadrage tient sur 3 pages.
- Chaque ADR tient sur 1 page.
- Les ADR ont une **numérotation** (ADR-0001, ADR-0002), un **statut daté**, et des **conditions de réévaluation**.
- Le mot "moderne" / "scalable" / "best practice" n'apparaît pas seul — il est toujours qualifié par un critère mesurable.
- Une **alternative crédible** est documentée et explicitement écartée pour chaque décision.

Ce livrable nourrit directement le **mini-projet final** du parcours architecture (M6).

---

## 10. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant cite spontanément la **grille à six questions** (contrainte, horizon, mainteneurs, compromis, réversibilité, réévaluation) avant de trancher une décision technique.
- [ ] Il sait nommer **les 7 familles de SGBD** et donner pour chacune un cas d'usage typique et un produit phare.
- [ ] Il identifie **les anti-patterns** de prise de décision (hype-driven, résumé-driven, curriculum-driven, golden hammer, best-in-class fallacy).
- [ ] Il a produit **au moins 2 ADR** complets selon le format de la section 6.
- [ ] La **note de cadrage** du mini-défi est complète, tient sur 3 pages, et propose des conditions de réévaluation chiffrées.
- [ ] Il ne défend **plus** un choix par "c'est moderne" ou "c'est ce qui se fait" — il défend par une contrainte nommée.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : capacité à conseiller sur le **choix technologique applicatif**.
- **N2** : capacité à conseiller sur le **choix du SGBD** en fonction du contexte.
- **N3** (amorce) : conseiller sur le **dimensionnement** de l'infrastructure — la grille à six questions et le filtre du profil de charge ouvrent ce travail, qui s'approfondit sur les modules cloud (AWS).

---

## 11. Ressources complémentaires

### Méthodologie de décision

- **Michael Nygard** — _Documenting Architecture Decisions_ (article, 2011). [cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Article fondateur de l'ADR, 5 minutes de lecture.
- **adr.github.io** — collection canonique de modèles d'ADR (Nygard, MADR, Y-statement). Pour piocher un format adapté à son équipe.
- **Tom Gilb** — _Principles of Software Engineering Management_ (1988). Pour la culture de la **décision quantifiée** — daté mais lucide.
- **Daniel Kahneman** — _Thinking, Fast and Slow_ (2011). Pour comprendre les biais qui orientent les décisions techniques (ancrage, halo, disponibilité).
- **Jeff Bezos** — _Letter to Shareholders_ (1997, 2016). Les notions _one-way / two-way doors_ et _high-velocity decision-making_.

### Choix de SGBD

- **Martin Kleppmann** — _Designing Data-Intensive Applications_ (2017). La **référence absolue** pour comprendre les familles de bases. Lire les chapitres 1, 2 et 3 ; le reste est pour le parcours Senior.
- **Pramod J. Sadalage, Martin Fowler** — _NoSQL Distilled_ (2012). Court (200 pages), parfait pour cartographier les familles NoSQL.
- **Eric Brewer** — _CAP Twelve Years Later_ (2012). Pour ne pas dire de bêtises sur le théorème CAP.
- **Documentation PostgreSQL officielle** — [postgresql.org/docs](https://www.postgresql.org/docs/). Indispensable, en particulier les sections sur `JSONB`, _full-text search_, et `tsvector`.
- **AWS — Choosing a database** — [aws.amazon.com/products/databases](https://aws.amazon.com/products/databases/). Arbre de décision officiel d'AWS, pertinent même si on n'est pas sur AWS.

### Cas pratiques et anti-patterns

- **Adam Tornhill** — _Your Code as a Crime Scene_ (2015). Lecture forensique des choix techniques passés.
- **Sam Newman** — _Building Microservices_ (2ᵉ éd., 2021). Chapitres sur le _polyglot persistence_ et ses pièges.
- **The Twelve-Factor App** — [12factor.net](https://12factor.net). Standards de configuration applicative — utile pour distinguer ce qui se décide _au niveau code_ et ce qui se décide _au niveau infra_.
- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — items N2 sur le choix technologique et le choix du SGBD.
