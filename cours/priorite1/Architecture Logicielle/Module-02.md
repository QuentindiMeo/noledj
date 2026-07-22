# M2 — Avantages et inconvénients

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Énoncer les **avantages et les inconvénients** de chaque famille d'architecture (n-tier, en couche / oignon, hexagonale, microservice) selon **quatre axes** : couplage, complexité opérationnelle, time-to-market, coût.
- Identifier les **signaux d'alerte** qui indiquent qu'une architecture donnée a été choisie pour de mauvaises raisons.
- Produire un **choix argumenté** d'architecture pour trois cas métier distincts, en justifiant par les trade-offs et non par la mode.
- Reconnaître les **anti-patterns** récurrents : monolithe distribué, hexagonal cosmétique, microservices prématurés, n-tier rituel.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M1 (cartographie des quatre familles).
- Avoir produit la carte mentale comparative du mini-défi de M1 — elle sert de support de départ.

---

## 1. Pourquoi parler de trade-offs ?

### Le piège des "best practices"

Quand on cherche "best architecture" sur Google, on trouve des articles péremptoires : _"Why microservices are the future"_, _"Why monoliths are back"_, _"Hexagonal architecture is the only way"_. Chacun a raison **dans son contexte** et tort dès qu'on l'applique en dehors.

L'architecture logicielle n'a pas de bonne réponse universelle. Elle a des **réponses adaptées** à :

- la taille de l'équipe,
- la maturité opérationnelle (qui surveille les serveurs à 3h du matin ?),
- les contraintes métier (un site marchand n'a pas les mêmes contraintes qu'un système bancaire),
- le budget,
- l'horizon de temps (prototype 3 mois vs produit pour 10 ans).

**Analogie.** Le choix d'un véhicule. Une moto en ville bat largement une berline (rapide, agile, garée partout) — mais essaie de transporter une famille de cinq sous la pluie. Une 4×4 sur un chantier de montagne bat n'importe quelle citadine — mais consomme trois fois plus en ville. Demander "quel est le meilleur véhicule ?" sans contexte est une question vide. Pour les architectures, c'est exactement pareil.

### Quatre axes pour parler honnêtement

Pour comparer deux architectures sans tourner en rond, ce module utilise systématiquement **quatre axes** :

1. **Couplage** — à quel point une partie du système ressent les changements d'une autre. Faible couplage = on peut modifier A sans casser B.
2. **Complexité opérationnelle** — ce que coûte le système à **faire tourner** en prod : déploiement, observabilité, résilience, astreintes, debug.
3. **Time-to-market** — combien de temps il faut pour livrer la première version utilisable et combien il en faut pour livrer la N+1ᵉ feature.
4. **Coût** — au sens large : infrastructure, salaires (combien d'ingés faut-il ?), outillage, formation.

Aucun de ces axes n'est gagnable seul. Améliorer le couplage coûte du temps. Réduire la complexité opérationnelle limite la scalabilité. Accélérer le time-to-market crée de la dette. Ce sont les **arbitrages** entre ces quatre axes qui définissent un choix d'architecture pertinent.

---

## 2. Architecture n-tier — trade-offs

### Avantages

- **Concept maîtrisé universellement.** Tout développeur sait ce qu'est un 3-tier (présentation / app / data). Pas de courbe d'apprentissage.
- **Scalabilité horizontale par tier.** On peut ajouter des serveurs au tier applicatif sans toucher au tier de données, ou faire grossir la DB sans déranger l'app.
- **Délimitation claire des responsabilités d'infrastructure.** Les ops savent qui surveille quoi.
- **Compatible avec presque tout le reste** — n-tier décrit une topologie de déploiement et peut héberger n'importe quelle organisation de code interne.

### Inconvénients

- **Ne dit rien sur le code.** Une app 3-tier peut être un monolithe spaghetti à l'intérieur — n-tier ne protège pas du chaos applicatif.
- **Latence inter-tier.** Chaque hop réseau coûte 1 à 10 ms. Un appel qui traverse 4 tiers coûte 4 à 40 ms minimum.
- **Coût d'infrastructure structurel.** Trois tiers = au moins trois choses à provisionner, monitorer, sécuriser, même pour un faible trafic.
- **N-tier rituel.** Beaucoup d'équipes empilent des tiers (gateway, reverse proxy, cache, app, DB) sans avoir réellement besoin de la séparation. Chaque tier ajouté est un point de panne et un coût d'exploitation supplémentaire.

### Lecture par axe

| Axe                           | Évaluation                                                           |
| ----------------------------- | -------------------------------------------------------------------- |
| **Couplage**                  | Neutre — n-tier ne contraint pas le couplage applicatif.             |
| **Complexité opérationnelle** | Faible à modérée. Bien outillée par les fournisseurs cloud.          |
| **Time-to-market**            | Bon dès la V1. La topologie ne ralentit pas la livraison.            |
| **Coût**                      | Coût d'entrée non-nul (3 services minimum). Linéaire avec le trafic. |

### Signaux d'alerte

- Un **tier qui n'est jamais appelé** ou qui ne fait que transmettre — il devrait être supprimé.
- Une **équipe d'ops** dédiée au maintien des tiers, sans valeur métier ajoutée.
- Un débat **"on rajoute un cache"** sans benchmark préalable — l'ajout d'un tier doit être justifié par la mesure.

---

## 3. Architecture en couche (layered) — trade-offs

### Avantages

- **Lisibilité.** Un nouveau développeur sait où chercher : la validation est en présentation, la règle métier en domaine, la requête SQL en infrastructure.
- **Convention universelle.** Le découpage `presentation / application / domain / infrastructure` est largement compris.
- **Permet la spécialisation.** Un développeur peut intervenir sur la couche métier sans toucher au SQL, et inversement.

### Inconvénients

- **Le domaine dépend de l'infrastructure** dans la version classique (sans inversion). Conséquence : on ne peut pas tester le métier sans une vraie DB, et on ne peut pas changer de DB sans réécrire le métier.
- **Multiplication des objets de transfert.** Pour traverser quatre couches proprement, on finit avec quatre versions de la même donnée (DTO de présentation, modèle applicatif, entité domaine, modèle ORM) — du _mapping_ partout.
- **Risque de "leaky layer"** — une couche qui contourne l'autre. Un controller qui appelle directement le repository sans passer par le use case applicatif. Ces fuites s'accumulent et finissent par invalider l'architecture.
- **Mauvais découpage métier déguisé.** On peut avoir un découpage en couches techniquement parfait mais un découpage métier catastrophique (toutes les fonctionnalités mélangées dans une couche "application").

### Lecture par axe

| Axe                           | Évaluation                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| **Couplage**                  | Vertical contraint (chaque couche ne voit que celle du dessous) ; horizontal libre, donc fragile. |
| **Complexité opérationnelle** | Identique à l'architecture sous-jacente (n-tier ou monolithe). La couche est interne.             |
| **Time-to-market**            | Bon, surtout en début de projet. Le coût d'entrée est faible.                                     |
| **Coût**                      | Coût caché du _mapping_ entre couches sur le long terme.                                          |

### Signaux d'alerte

- **Une couche "utils" ou "helpers"** qui est appelée depuis toutes les autres — c'est une dépendance circulaire déguisée.
- **Un domaine qui importe SQLAlchemy** ou un client HTTP — la couche métier devrait être pure.
- **Des fichiers de _mapping_ aussi gros que la logique** — signe que le découpage en couches est plus cosmétique qu'utile.

---

## 4. Architecture en oignon / hexagonale — trade-offs

### Avantages

- **Domaine testable sans infrastructure.** On peut tester la logique métier sans démarrer ni DB, ni serveur HTTP, ni broker — juste avec des **fakes** injectés. Ce gain est immense sur la vitesse des suites de tests.
- **Changement d'infrastructure isolé.** Passer de MySQL à PostgreSQL, ou de REST à gRPC, se fait en réécrivant un adapter — sans toucher au cœur métier.
- **Couplage maîtrisé.** Le domaine n'a aucune dépendance sortante vers la technique. C'est l'application directe du **principe DIP** (cf. POO M5).
- **Vocabulaire industriel commun.** "Ports, adapters, hexagonal, clean architecture" est compris dans tout le monde Java / Python / Go moderne.

### Inconvénients

- **Coût d'entrée non-négligeable.** Pour un projet de quelques fichiers, monter une structure hexagonale en bonne et due forme est sur-ingénierie. Le retour sur investissement vient à partir d'un certain seuil (typiquement quelques dizaines de fichiers métier).
- **Pollution conceptuelle.** Si l'équipe ne maîtrise pas DIP, on se retrouve avec des dossiers "domain / infrastructure" qui ne respectent pas la règle d'inversion — du clean architecture cosmétique qui n'apporte rien.
- **Indirection.** Chaque appel passe par une interface — c'est conceptuellement propre, mais un développeur qui veut "voir ce que fait le code" doit suivre la chaîne port → interface → adapter → implémentation. Pénible à debugger pour les nouveaux arrivants.
- **Tentation du "tout est un port".** À force d'abstraire, on peut finir par avoir 50 interfaces avec une seule implémentation chacune. Inutile.

### Lecture par axe

| Axe                           | Évaluation                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| **Couplage**                  | Minimal vers l'infrastructure. C'est la promesse centrale.                          |
| **Complexité opérationnelle** | Inchangée — l'hexagonal porte sur le code, pas sur le déploiement.                  |
| **Time-to-market**            | Lent au début (coût d'amorçage). Rapide ensuite, surtout pour les évolutions infra. |
| **Coût**                      | Investissement initial, gain composé sur la durée de vie du projet.                 |

### Signaux d'alerte

- Un dossier `domain/` qui importe `from sqlalchemy import ...` — c'est mort.
- Des **interfaces à une seule implémentation** qui n'ont jamais évolué et ne sont pas utilisées en test — c'est de l'abstraction prématurée.
- **Aucune amélioration des tests** après refactor en hexagonal — il manque le suivi : si les tests n'ont pas accéléré, l'investissement n'a pas porté.

---

## 5. Architecture microservice — trade-offs

### Avantages

- **Indépendance des équipes.** Une équipe peut livrer son service sans coordination avec les autres. C'est le **gain principal**, et il s'observe surtout au-delà de 50 à 100 développeurs.
- **Scalabilité différentielle.** On peut faire grossir le service `Search` (gourmand) sans grossir le service `Profile` (calme). Économie sur le coût d'infrastructure.
- **Stack hétérogène.** Chaque service peut être dans le langage le plus adapté (Python pour ML, Go pour le réseau, Java pour la finance).
- **Pannes localisées (en théorie).** Une panne d'un service n'arrête pas l'ensemble — à condition que les services soient correctement isolés.

### Inconvénients

- **Explosion de la complexité opérationnelle.** Observabilité distribuée (tracing), résilience (retries, circuit breakers, timeouts), déploiements coordonnés, gestion des versions d'API. Chaque service est un système d'exploitation à lui seul.
- **Coût d'infrastructure multiplié.** N services = N déploiements, N bases (au moins), N monitorings. La facture monte vite.
- **Difficulté de debug.** Un bug qui traverse cinq services nécessite de corréler des logs sur cinq nœuds avec des traces distribuées. Plusieurs jours d'enquête pour ce qui serait un breakpoint en monolithe.
- **Couplage de données.** Si plusieurs services lisent la **même donnée**, il faut décider : duplication ? source unique ? réplication ? Aucune réponse n'est gratuite.
- **Anti-pattern du monolithe distribué.** Pire des deux mondes : complexité opérationnelle du microservice + couplage du monolithe. Touche les équipes qui découpent mal leurs services.

### Lecture par axe

| Axe                           | Évaluation                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| **Couplage**                  | Théoriquement faible. Pratiquement, dépend entièrement de la qualité du découpage.          |
| **Complexité opérationnelle** | Très élevée. À ne pas sous-estimer.                                                         |
| **Time-to-market**            | Très lent en début de projet. Devient bon à l'échelle (>5 équipes parallèles).              |
| **Coût**                      | Élevé en infrastructure et en ingénieurs. Justifié seulement si le scale humain le demande. |

### Signaux d'alerte (microservices prématurés)

- **Moins de 20 développeurs** dans l'équipe globale. À cette taille, un monolithe modulaire est presque toujours plus efficace.
- **Services qui se déploient toujours ensemble.** S'ils ne sont jamais déployés isolément, ce sont des modules d'un monolithe, pas des services.
- **Services qui partagent une base de données.** C'est la définition même du monolithe distribué.
- **Plus de temps passé à maintenir l'infrastructure** qu'à livrer du métier.
- **"On fait des microservices parce qu'on veut scaler."** Si on ne sait pas combien d'utilisateurs on a, le besoin de scale n'est probablement pas la vraie raison.

---

## 6. Tableau de synthèse

| Architecture              | Couplage                              | Complexité op.       | Time-to-market V1 | Time-to-market V+N   | Coût d'entrée | Coût à l'échelle        |
| ------------------------- | ------------------------------------- | -------------------- | ----------------- | -------------------- | ------------- | ----------------------- |
| **n-tier (3-tier)**       | Neutre                                | Faible à modérée     | Bon               | Bon                  | Faible        | Linéaire avec trafic    |
| **En couche (classique)** | Vertical contraint, horizontal libre  | Identique au support | Très bon          | Se dégrade           | Très faible   | Coût de _mapping_ caché |
| **Oignon / hexagonal**    | Minimal vers l'infrastructure         | Identique au support | Lent              | Très bon             | Modéré        | Modéré, amorti          |
| **Microservice**          | Faible si bien fait, sinon désastreux | Très élevée          | Très lent         | Très bon à l'échelle | Élevé         | Élevé mais scalable     |

---

## 7. Quatre anti-patterns à connaître

### 7.1 Le monolithe distribué

**Symptôme.** Plusieurs services microservices, mais qui se déploient toujours en même temps, partagent des tables, ou échouent en cascade quand l'un d'eux tombe.

**Pourquoi c'est mauvais.** On paie le coût opérationnel du microservice sans en récolter le bénéfice de découplage.

**Comment l'éviter.** Avant de découper en microservice, vérifier que les équipes peuvent **vraiment** déployer indépendamment. Sinon, monolithe modulaire d'abord.

### 7.2 L'hexagonal cosmétique

**Symptôme.** Des dossiers `domain/`, `application/`, `infrastructure/` qui respectent la nomenclature mais où `domain/` importe `from infrastructure.db import Session`.

**Pourquoi c'est mauvais.** On porte la complexité de l'architecture sans en récolter aucun gain.

**Comment l'éviter.** Mettre en place un **linter d'imports** (ex : `import-linter` en Python) qui interdit `domain → infrastructure` au niveau CI.

### 7.3 Les microservices prématurés

**Symptôme.** Une équipe de 4 développeurs avec 12 microservices.

**Pourquoi c'est mauvais.** Le coût opérationnel mange tout le temps d'ingénierie. Personne ne livre de fonctionnalités.

**Comment l'éviter.** Démarrer **monolithe modulaire**. Découper en microservice **uniquement** quand la limite humaine est franchie (équipes qui se marchent dessus dans le même code) ou quand un sous-domaine a un profil de scale ou de tech radicalement différent.

### 7.4 Le n-tier rituel

**Symptôme.** Une stack avec API gateway + reverse proxy + load balancer + app server + cache + DB, dont la moitié des composants ne sert à rien sur le volume actuel.

**Pourquoi c'est mauvais.** Chaque composant est une chose à monitorer, mettre à jour, sécuriser. Multiplie le coût d'exploitation pour aucun gain.

**Comment l'éviter.** Justifier chaque tier par **un bénéfice mesuré** (sécurité, performance, scalabilité). Pas de tier "au cas où".

---

## 8. Méthode de choix — la grille de décision

Quand on doit recommander une architecture, raisonner dans l'ordre suivant :

1. **Combien d'équipes** travailleront en parallèle sur le système ?
   - 1 équipe (≤ 10 personnes) → **monolithe modulaire** par défaut.
   - 2 à 5 équipes → monolithe modulaire ou quelques services larges (macro-services).
   - 5+ équipes → microservices justifiés si le domaine le permet.

2. **Quel est l'horizon de vie du projet ?**
   - Prototype < 6 mois → simplicité maximale, dette acceptable.
   - Projet 1 à 5 ans → soigner la testabilité (hexagonal vaut le coup).
   - Projet 10+ ans → privilégier les architectures où l'infrastructure est remplaçable sans réécrire le métier.

3. **Quelle est la maturité opérationnelle de l'équipe ?**
   - Pas d'astreintes, pas d'observabilité distribuée, pas de CI/CD multi-services → **rester en monolithe**, sans débat.
   - Maturité prouvée → microservice possible.

4. **Quelles sont les contraintes métier réelles ?**
   - Pic de charge saisonnier sur une seule fonctionnalité → un service dédié peut être justifié.
   - Régulation (audit, traçabilité forte) → architecture en couche bien tracée, ou microservice avec audit centralisé.

5. **Quel est le budget infrastructure mensuel acceptable ?**
   - Très bas → monolithe sur un serveur unique, 3-tier simple.
   - Moyen → 3-tier managed (RDS, App Service, Lambda + API Gateway).
   - Élevé → microservices possibles, observabilité incluse dans la facture.

**Règle d'or.** L'architecture est une **réponse à des contraintes**, pas un choix esthétique. Si on ne peut pas nommer la contrainte que l'architecture résout, on ne peut pas justifier le choix.

---

## 9. Exercices pratiques

### Exercice 1 — Annoter sa carte mentale (≈ 20 min)

Reprendre la carte mentale produite en M1 (mini-défi). Ajouter pour chaque architecture **deux colonnes** :

- **Top 2 avantages** (les plus saillants).
- **Top 2 inconvénients** (les plus saignants).

Limite : pas plus de deux par case. Forcer le tri est l'objectif — c'est ce qui force à prioriser.

### Exercice 2 — Reconnaître les anti-patterns (≈ 30 min)

Pour chacun des cas suivants, identifier le ou les anti-patterns à l'œuvre :

**Cas A.** Une startup de 6 développeurs gère 14 services qui communiquent en HTTP synchrone. Chaque release nécessite une coordination de tous les services. Un service down met le système entier hors-ligne.

**Cas B.** Un projet "clean architecture" a un dossier `domain/entities/` qui contient des classes décorées par `@dataclass(orm_mapped=True)`. Le test unitaire du domaine échoue si la DB n'est pas disponible.

**Cas C.** Une application en ligne sert 200 utilisateurs par jour avec une architecture incluant API Gateway, ALB, ECS Fargate, Redis, RDS Aurora, DynamoDB et un broker Kafka. Le bill cloud mensuel dépasse les 4 000 €.

**Cas D.** Un système microservice de 30 services, où trois services lisent la même table `users` directement dans la base du service `Users`.

Pour chaque cas, écrire :

- Quel anti-pattern (1 ou plusieurs).
- Quelle serait la **première étape** de remédiation.

### Exercice 3 — Choix argumenté sur trois cas métier (≈ 90 min)

Pour chacun des trois cas suivants, recommander **une architecture** avec :

- 1 phrase de **recommandation** (ex : "monolithe modulaire en oignon").
- 3 à 5 lignes de **justification** par les **quatre axes** (couplage, complexité opérationnelle, TTM, coût).
- 1 à 2 lignes sur ce qu'on ferait **différer** (si l'équipe grandit, si le volume explose...).

**Cas 1 — SaaS de gestion de notes de frais pour PME (jeune startup, équipe de 4).**

> L'app vise 50 PME clientes dans 12 mois. Chaque PME a 5 à 50 utilisateurs. Fonctionnalités : upload de reçu (OCR), workflow d'approbation, export comptable. Pas de pic saisonnier. Délai V1 : 4 mois.

**Cas 2 — Plateforme e-commerce sur le marché européen, équipe de 80 développeurs.**

> Catalogue de 500 000 articles. 1 million de visiteurs/jour, pics x10 lors du Black Friday. Fonctionnalités : catalogue, panier, paiement, livraison, retours, marketplace pour vendeurs tiers. Plusieurs équipes domaine (catalogue, paiement, logistique, marketplace). Système en place depuis 8 ans.

**Cas 3 — Application interne de comptabilité pour un cabinet de 15 personnes.**

> Stocke les écritures comptables des clients (≈ 200). Utilisée à 9h-19h par les comptables. Pas de mobile. Pas d'API publique. Régulation forte (archivage 10 ans, traçabilité des accès). Budget infrastructure < 200 €/mois.

**Critères de réussite.**

- Aucune des trois recommandations n'est "microservices". (Si c'est le cas, relire et reformuler — les trois cas sont conçus pour s'en passer.)
- Au moins **un trade-off explicite** par cas (l'inconvénient assumé du choix).
- La justification ne mentionne pas le mot "moderne", "scalable" ou "best practice" — ce ne sont pas des arguments.

### Exercice 4 — Le débat d'équipe (≈ 30 min)

Imaginer la scène : un collègue propose de découper un monolithe Django en 8 microservices. L'équipe est de 12 développeurs, le système sert 5 000 utilisateurs internes. Préparer **trois questions** à lui poser **avant** d'accepter le découpage.

Les trois questions doivent :

- Cibler les **conditions de pertinence** du microservice (cf. section 8).
- Ne pas être agressives — formuler comme une exploration partagée.
- Forcer une **réponse chiffrée** ou **datée** (pas de "ça scale mieux", on veut "combien d'utilisateurs en plus prévus dans 12 mois").

---

## 10. Mini-défi de synthèse — note de cadrage (≈ 2 h)

Choisir l'un des trois cas de l'exercice 3 (ou un cas réel issu de l'expérience personnelle). Rédiger une **note de cadrage architectural** de **deux pages maximum** structurée ainsi :

1. **Contexte** (5 lignes) — qui, quoi, combien, dans quel délai.
2. **Recommandation** (3 lignes) — l'architecture choisie en une phrase, suivie de deux phrases qui ancrent le choix.
3. **Justification par axe** (un paragraphe court par axe : couplage, complexité op., TTM, coût).
4. **Trade-offs assumés** (3 à 5 lignes) — ce qu'on sacrifie en faisant ce choix.
5. **Points de bascule** (3 à 5 lignes) — à partir de quels seuils mesurables (utilisateurs, équipes, latence) le choix devrait être réévalué.

**Critères de validation.**

- Le document tient sur deux pages. Si ça déborde, c'est qu'on n'a pas trié.
- Chaque section a un titre clair. Pas de prose continue.
- Le mot "microservice" n'apparaît pas sans être encadré d'un trade-off assumé.
- Les **points de bascule** sont chiffrés ou datés (pas "quand on sera plus gros").

Ce livrable préfigure le **mini-projet final** du parcours architecture (M6). On y reviendra avec une exigence plus large.

---

## 11. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant peut citer **deux avantages et deux inconvénients** de chaque famille d'architecture (n-tier, en couche, oignon / hexagonal, microservice).
- [ ] Il identifie les **quatre anti-patterns** (monolithe distribué, hexagonal cosmétique, microservices prématurés, n-tier rituel) sur des cas concrets.
- [ ] Il sait raisonner par les **quatre axes** (couplage, complexité op., TTM, coût) plutôt qu'en suivant la mode.
- [ ] Il a produit **trois recommandations argumentées** pour les trois cas métier de l'exercice 3.
- [ ] La **note de cadrage** du mini-défi tient sur deux pages et propose des points de bascule chiffrés.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : avantages / inconvénients de l'architecture hexagonale, microservice, en couche / oignon, n-tier.
- **N2** : capacité naissante à conseiller sur les choix structurants (technologique, SGBD) — affinée en M4.

Les items N2 _CQRS_ et _RGPD_ relèvent respectivement de **M3** et **M5**. L'_optimisation des coûts_ est approfondie en **M6**.

---

## 12. Ressources complémentaires

- **Sam Newman** — _Monolith to Microservices_ (2019). Le livre à lire avant de proposer un découpage en microservice ; chapitres 1 à 4 suffisent pour ce module.
- **Martin Fowler** — _MonolithFirst_ (2015) et _Microservice Tradeoffs_ (2015). Articles courts et lucides.
- **Vlad Khononov** — _Learning Domain-Driven Design_ (2021). Chapitres sur le découpage en _bounded contexts_ — l'amont de toute décision d'architecture orientée services.
- **Eric Evans** — _Domain-Driven Design_ (2003), chapitres 14 à 16. Fondamentaux sur les contextes et les anticorruption layers.
- **Robert C. Martin** — _Clean Architecture_ (2017), partie V (chapitres 25-27). Ce que coûte et ce que rapporte une architecture orientée plug-in.
- **Adam Tornhill** — _Software Design X-Rays_ (2018). Pour relier architecture et historique Git — où les coûts cachés se révèlent.
- **Article Stack Overflow Engineering Blog** — _The Architecture of Stack Overflow_ (Marco Cecconi). Un cas réel d'architecture qui privilégie la simplicité contre l'air du temps.
- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — niveaux 2 et 3 pour étendre cette grille à la dimension Senior.
