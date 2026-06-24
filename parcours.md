# Parcours d'apprentissage Noledj

## Préambule

Ce document décrit la **séquence pédagogique** par compétence pour atteindre la cible **Confirmé** (obligatoire) sur la période 2026-05-14 → 2026-10-01, et amorcer la cible **Senior** lorsque pertinent.

Chaque compétence est décomposée en **modules ordonnés**. Pour chaque module sont précisés :

- **Concepts** à couvrir (sourcés du glossaire de la compétence).
- **Pratique** suggérée : exercice court ou TP encadré.
- Le **mini-projet** transverse en fin de compétence (≤ 5 jours, conformément à `gogetit.md`).

Les **parties théoriques détaillées**, les **analogies**, les **ressources complémentaires** et l'éventuelle **gamification** seront produites dans un second temps, module par module. Ce parcours sert de squelette pour le chiffrage et la timeline.

## Ordonnancement macro recommandé

Phasage par dépendances et synergies :

1. **Phase 1 — Consolidation des acquis** : Python, React, Architecture Logicielle, Tests unitaires (petits deltas, base solide à confirmer avant d'élargir).
2. **Phase 2 — Approfondissement langage et conception** : POO puis FastAPI (FastAPI capitalise sur Python consolidé et les piliers POO).
3. **Phase 3 — Fondations cloud** : AWS Identity → AWS Compute → AWS Networking → AWS Database et Storage (IAM et VPC perméent tous les autres tracks AWS).
4. **Phase 4 — Data et analytics** : SQL → AWS Analytics → AWS Kinesis (SQL nourrit Athena, Redshift et l'analyse).
5. **Phase 5 — Bonus Senior** : revue ciblée sur les compétences en avance pour pousser au-delà du Confirmé (hors AWS Identity, AWS Kinesis, SQL — Senior ignoré pour ces trois).

---

## Pondération 0

### Python — Départ 2.5 | Confirmé 3 | Senior 3.5

#### M1. Audit Python et plan de remédiation

- Concepts : auto-évaluation N2/N3, identification des items partiels
- Pratique : quiz d'auto-positionnement + sélection des modules à approfondir

#### M2. Modèle de classe avancé

- Concepts : visibilité (et limites), `@classmethod` vs `@staticmethod`, méthodes dunder, hashable, mixin
- Pratique : classe avec dunders custom (`__eq__`, `__hash__`, `__repr__`) et mixin

#### M3. MRO et héritage multiple

- Concepts : Method Resolution Order, comportement de `super()`, diamant d'héritage
- Pratique : démonstration et trace du MRO sur un diamant

#### M4. Outils de modélisation

- Concepts : `dataclasses`, `frozen`, classes abstraites avec `abc`
- Pratique : modèle de données immutable typé + interface abstraite

#### M5. Concurrence et parallélisme

- Concepts : GIL, `multiprocessing` vs `threading`
- Pratique : benchmark threading vs multiprocessing sur tâche I/O puis CPU

#### M6. Décorateurs et choix de paradigme

- Concepts : concept de décorateur, paradigmes (impératif, fonctionnel, objet) et choix selon contexte
- Pratique : décorateur de mesure de temps + version fonctionnelle vs objet d'un même algorithme

#### M7. Outillage Python

- Concepts : type checker (`mypy`), packaging `pip`, compilation `.pyc`
- Pratique : projet typé strict validé par `mypy --strict`

#### Mini-projet : micro-bibliothèque publiée sur PyPI (test, doc, types stricts, CI)

---

### React — Départ 2 | Confirmé 2.5 | Senior 3

#### M1. Audit N2 et consolidation

- Concepts : virtual DOM, props key, props children, cycle de vie, `useEffect` et dépendances, `useMemo`/`useCallback` (base), Suspense, fragments
- Pratique : refactor d'un composant existant pour expliciter chaque concept maîtrisé

#### M2. Moteur de réconciliation

- Concepts : algorithmes de hashing et de diffing, réconciliation
- Pratique : trace de rendu via React DevTools sur composant volontairement non optimisé

#### M3. Hooks de performance

- Concepts : `useMemo`/`useCallback` (pertinence et inconvénients), `useRef`, `useDeferredValue`
- Pratique : mesure avant/après mémoïsation sur un cas représentatif

#### M4. Patterns avancés

- Concepts : compound components, class components (lecture du legacy)
- Pratique : implémentation d'un compound component (ex. `Tabs`, `Accordion`)

#### M5. Écosystème React

- Concepts : comparaison des frameworks (Next.js, Remix, Astro), choix d'un state manager selon le contexte
- Pratique : matrice comparative documentée

#### M6. Bibliothèque de composants

- Concepts : création d'une bibliothèque, documentation Storybook, identification des composants peu performants
- Pratique : profilage d'une bibliothèque, optimisation guidée par mesure

#### Mini-projet : mini-bibliothèque de composants documentée Storybook avec benchmark de performance avant/après optimisation

---

### FastAPI — Départ 0 | Confirmé 2.5 | Senior 3

#### M1. Architecture et premier serveur

- Concepts : structure de fichiers (`main.py`, `routers`, `schemas`, `models`, `dependencies`), Uvicorn, ASGI
- Pratique : initialiser le projet et exposer un endpoint racine

#### M2. Routage HTTP

- Concepts : décorateurs (`@app.get`, `@app.post`, `@app.put`, `@app.delete`), path/query/body params, réponses JSON
- Pratique : implémenter un CRUD minimal en mémoire

#### M3. Validation avec Pydantic

- Concepts : `BaseModel`, `Field`, validators, `response_model`
- Pratique : schémas d'entrée et de sortie séparés avec contraintes

#### M4. Organisation modulaire

- Concepts : `APIRouter`, découpage par domaine
- Pratique : refactor du CRUD en routers métier

#### M5. Configuration et environnements

- Concepts : `pydantic-settings`, fichiers `.env`, dev vs prod
- Pratique : injection d'une config différente par environnement

#### M6. Injection de dépendances

- Concepts : `Depends`, dépendances paramétrées, scopes
- Pratique : factoriser une dépendance d'auth réutilisable

#### M7. Gestion des erreurs

- Concepts : `HTTPException`, exception handlers personnalisés
- Pratique : gestionnaire d'erreur global avec format de réponse unifié

#### M8. Middleware et CORS

- Concepts : middleware FastAPI, `CORSMiddleware`
- Pratique : middleware de logging des requêtes + configuration CORS

#### M9. Authentification

- Concepts : `OAuth2PasswordBearer`, JWT, security dependencies
- Pratique : auth JWT avec access + refresh tokens

#### M10. Async et tâches différées

- Concepts : `def` vs `async def`, Background Tasks
- Pratique : envoi de notification post-réponse via Background Task

#### M11. Tests d'API

- Concepts : `TestClient` (Starlette), `pytest`, fixtures FastAPI
- Pratique : suite de tests d'intégration sur le CRUD

#### M12. ASGI et comparatifs

- Concepts : ASGI vs WSGI, avantages de FastAPI vs Django REST Framework
- Pratique : note technique comparative

#### M13. Vers 2.5 — Approfondissement N3

- Concepts : SQLAlchemy async (`AsyncSession`), lifespan events, intro WebSockets, scoping des dépendances
- Pratique : ajouter une base de données async au projet + endpoint WebSocket simple

#### Mini-projet : API REST sécurisée complète (auth JWT, DB async, tests, documentation OpenAPI publiée)

---

### Programmation Orientée Objet — Départ 1.5 | Confirmé 3 | Senior 3.5

#### M1. Piliers de la POO

- Concepts : encapsulation, polymorphisme, interaction entre classes, abstraction
- Pratique : modélisation d'un cas métier démontrant les 4 piliers

#### M2. Relations entre classes

- Concepts : extension, implémentation, composition, agrégation, namespace
- Pratique : diagramme UML + traduction en code

#### M3. Interface vs classe abstraite

- Concepts : distinction, choix selon contexte
- Pratique : refactor d'une hiérarchie en introduisant une abstraction

#### M4. Visibilité avancée

- Concepts : choix du modificateur selon contexte d'API publique/interne
- Pratique : revue de l'API publique d'un module

#### M5. SOLID en détail

- Concepts : SRP, OCP, LSP, ISP, DIP
- Pratique : audit d'une classe avec application des 5 principes

#### M6. Méthodes et attributs statiques

- Concepts : différence avec membres d'instance, cas d'usage
- Pratique : factory statique et compteur partagé

#### M7. Polymorphisme avancé

- Concepts : trois types (surcharge, héritage, paramétrique), dynamique vs statique, MRO
- Pratique : illustration des trois formes dans un mini-projet

#### M8. Patrons de conception — fondamentaux

- Concepts : familles (créationnels, structurels, comportementaux), Singleton, Factory, Observer, Decorator, Strategy, Iterator, State
- Pratique : implémenter 2 patterns au choix dans un cas réel

#### M9. Patrons de conception — secondaires

- Concepts : Visitor, Adapter, Command, Memento, Composite
- Pratique : implémenter 1 pattern parmi les 5

#### M10. Architecture vs design

- Concepts : patron d'architecture vs patron de conception, inertie entre classes
- Pratique : analyser l'architecture d'un projet open-source ou d'un repo existant

#### M11. Généricité

- Concepts : classes génériques, contraintes de type, cas d'usage pertinents
- Pratique : conteneur typé générique

#### M12. Métaprogrammation et réflexivité

- Concepts : introspection, manipulation de classes au runtime
- Pratique : registre auto-découvert par introspection (plugin system)

#### Mini-projet : refactor d'un mini-projet en appliquant 3+ design patterns avec justification

---

## Pondération 1

### Architecture Logicielle — Départ 1 | Confirmé 1.5 | Senior 2

#### M1. Cartographie des architectures

- Concepts : hexagonale, microservice, oignon / en couche, n-tier (rappels)
- Pratique : carte mentale comparative des 4 architectures

#### M2. Avantages et inconvénients

- Concepts : trade-offs de chaque type (couplage, complexité opérationnelle, time-to-market, coût)
- Pratique : choix argumenté pour 3 cas métier différents

#### M3. CQRS

- Concepts : Command Query Responsibility Segregation, collaboration utilisateur-ices
- Pratique : illustration sur un cas métier

#### M4. Décisions techniques

- Concepts : choix technologique applicatif, choix du SGBD selon contexte
- Pratique : note de cadrage technique

#### M5. Réglementation des données

- Concepts : RGPD, conservation, anonymisation
- Pratique : checklist conformité d'un projet existant

#### M6. Optimisation des coûts

- Concepts : alternatives moins coûteuses à une architecture donnée
- Pratique : revue de coût d'une infra fictive

#### Mini-projet : dossier d'architecture pour un cas d'usage donné (options, coûts, risques, recommandation)

---

### Tests unitaires — Départ 2 | Confirmé 3 | Senior 3.5

#### M1. Audit des pratiques N2

- Concepts : given/when/then, mocking, edge cases, coverage, fixtures
- Pratique : revue d'une suite de tests existante

#### M2. Stubs vs Mocks

- Concepts : distinction conceptuelle, cas d'usage de chacun
- Pratique : refactor d'un test stub vers mock (et inverse)

#### M3. TDD vs BDD

- Concepts : philosophies, frameworks associés, lecture des deux styles
- Pratique : implémenter la même feature en TDD puis en BDD

#### M4. Indépendance des tests

- Concepts : remise à l'état initial, cas dégradés liés au contexte d'exécution
- Pratique : identifier les dépendances cachées dans une suite

#### M5. Pertinence des tests unitaires

- Concepts : où les tests apportent de la valeur, où ils en coûtent plus qu'ils n'en rapportent
- Pratique : matrice "à tester / à ne pas tester" sur un projet

#### M6. Coverage

- Concepts : analyse du coverage, identification des zones à améliorer
- Pratique : audit de coverage et plan d'amélioration

#### M7. TDD en pratique

- Concepts : cycle red-green-refactor
- Pratique : implémentation TDD d'une feature de A à Z

#### M8. Factorisation des tests

- Concepts : tests paramétrés, éviter les répétitions
- Pratique : convertir une série de tests répétitifs en tests paramétrés

#### M9. Golden Master Testing

- Concepts : sécurisation d'un refactor par capture de sortie de référence
- Pratique : refactor sécurisé d'un module hérité non testé

#### Mini-projet : refactor TDD d'un module avec stratégie de Golden Master sur la sortie existante

---

### AWS Identity — Départ 0 | Confirmé 2 | Senior ignoré

#### M1. Concepts IAM fondamentaux

- Concepts : rôle vs policy, ARN et sa structure
- Pratique : lire et décomposer un ARN

#### M2. Anatomie d'une policy

- Concepts : principle, resource, actions (droits), conditions map
- Pratique : écrire une policy minimale + une avec condition

#### M3. Access Keys et alternatives

- Concepts : utilité d'une access_key, alternatives modernes (rôles, instance profile)
- Pratique : remplacer une access_key par un rôle dans un cas concret

#### M4. Policies avancées

- Concepts : identity-based vs resource-based, inline vs managed, Permission Boundaries
- Pratique : design de policies pour 2 personas distincts

#### M5. Assume role et STS

- Concepts : assume role, Security Token Service, délégation
- Pratique : cross-account access via assume role

#### M6. Moindre privilège

- Concepts : principe et application
- Pratique : durcir une policy trop large

#### M7. Cognito

- Concepts : user pool, identity pool, intérêt
- Pratique : auth web simple avec user pool

#### M8. Identity Center

- Concepts : Permission Sets, distinction avec Cognito
- Pratique : attribution d'un Permission Set à un utilisateur

#### M9. Secret Manager vs Parameter Store

- Concepts : différences, récupération, SecureString
- Pratique : stocker et lire un secret depuis une Lambda

#### M10. KMS et Certificate Manager

- Concepts : clé KMS vs clé client (BYOK), renouvellement de certificat
- Pratique : chiffrement d'un objet S3 avec KMS + déploiement d'un certificat

#### Mini-projet : design IAM complet d'une app multi-rôle (auth Cognito, secrets KMS, policies moindre privilège)

---

### AWS Compute, Container & Orchestration — Départ 0 | Confirmé 2 | Senior 2.5

#### M1. EC2 — bases

- Concepts : AMI, familles, générations, User Data
- Pratique : lancer une EC2 avec User Data injectant un script

#### M2. EC2 — pricing et cycle de vie

- Concepts : on-demand vs spot vs reserved, terminate vs shutdown
- Pratique : comparer le coût des 3 modèles sur un workload donné

#### M3. Métriques et monitoring

- Concepts : métriques CPU, RAM, disque, réseau
- Pratique : lecture d'un tableau de bord EC2

#### M4. Lambda — fondamentaux

- Concepts : 3 manières de fournir le code (zip, image docker, S3), configuration de l'entrypoint
- Pratique : déployer une lambda en zip puis en image docker

#### M5. Lambda — déclenchement

- Concepts : 3+ déclencheurs (API Gateway, S3, EventBridge, SQS...)
- Pratique : 3 lambdas avec 3 déclencheurs différents

#### M6. Lambda — limitations et Layers

- Concepts : temps d'exécution, cold start, RAM/CPU, Lambda Layers
- Pratique : extraire une dépendance lourde dans un Layer

#### M7. AppRunner et dimension serverless

- Concepts : cas d'usage AppRunner, implications du serverless (scaling, facturation, cold start)
- Pratique : déployer une app simple sur AppRunner

#### M8. Batch vs Lambda

- Concepts : différences, choix selon le workload
- Pratique : design d'un workload batch

#### M9. Step Functions

- Concepts : intérêt des lambdas dans Step, actions de flux (Map, Choice, Parallel, Wait...)
- Pratique : workflow combinant 3 lambdas

#### M10. ECR

- Concepts : utilité, quand il est indispensable
- Pratique : push d'une image dans ECR

#### M11. ECS — bases

- Concepts : Fargate vs EC2, Task Definition
- Pratique : déployer un service Fargate

#### M12. ECS — opération

- Concepts : démarrer, mettre à jour un service ECS manuellement
- Pratique : déployer une nouvelle version d'un service

#### Mini-projet : déployer une app conteneurisée sur ECS Fargate orchestrée par Step Functions et déclenchée par une Lambda

---

### AWS Networking — Départ 0 | Confirmé 2 | Senior 2.5

#### M1. Régions, zones et IP

- Concepts : région, zone de disponibilité, Elastic IP
- Pratique : choisir région et AZ pour un déploiement

#### M2. VPC

- Concepts : subnet, NAT gateway, table de routage
- Pratique : créer un VPC avec sous-réseaux public et privé

#### M3. Sécurité réseau

- Concepts : Security Group, ACL réseau, règles de trafic
- Pratique : durcir le trafic entrant et sortant d'une instance

#### M4. Types de sous-réseaux

- Concepts : public, privé, isolé, bonnes pratiques d'exposition selon les workloads
- Pratique : design de subnets pour une 3-tier app

#### M5. Route53

- Concepts : hosted zones (public/private), health check
- Pratique : nom de domaine vers une instance avec failover

#### M6. CloudFront

- Concepts : optimisation de distribution, raccordement d'un nom de domaine
- Pratique : distribution CloudFront devant un bucket S3

#### M7. API Gateway

- Concepts : lien à un VPC ou à un nom de domaine
- Pratique : exposer une lambda derrière API Gateway

#### M8. Load Balancers

- Concepts : ALB vs NLB, target group, raccordement nom de domaine
- Pratique : ALB devant 2 instances avec health checks

#### Mini-projet : déployer une app derrière ALB + CloudFront + Route53 avec gestion DNS multi-AZ

---

### AWS Database et Storage — Départ 0 | Confirmé 2 | Senior 2.5

#### M1. Tour d'horizon

- Concepts : classes de stockage S3, moteurs SQL RDS/Aurora
- Pratique : choisir le bon service pour 3 besoins distincts

#### M2. RDS / Aurora — provisionnement

- Concepts : classes d'instances, choix selon besoin
- Pratique : provisionner une instance RDS

#### M3. RDS / Aurora — backups

- Concepts : automatic backups, snapshots
- Pratique : restaurer un snapshot

#### M4. DynamoDB — bases

- Concepts : partition key, range key, query vs scan
- Pratique : modéliser et requêter une table simple

#### M5. DynamoDB — limites et index

- Concepts : taille maximale d'un enregistrement et contournement, GSI vs LSI
- Pratique : ajout d'un GSI sur une table existante

#### M6. S3 — concepts et cycle de vie

- Concepts : cas d'usage, types de S3, lifecycle policy, versioning
- Pratique : bucket avec lifecycle policy et versioning activés

#### M7. EBS, EFS, S3

- Concepts : différences, types d'EBS, attachement multi-instances
- Pratique : attacher un EBS à plusieurs instances

#### M8. Calcul des coûts

- Concepts : pricing storage et database, projection mensuelle
- Pratique : estimation de budget mensuel pour une app type

#### Mini-projet : app stateful avec RDS + DynamoDB + S3 (lifecycle, versioning, backup automatisé)

---

### AWS Kinesis — Départ 0 | Confirmé 2 | Senior ignoré

#### M1. Fondamentaux

- Concepts : intérêt de Kinesis, shard, partition key, records
- Pratique : créer un stream et envoyer des records

#### M2. Comparaisons

- Concepts : Kinesis vs SQS, vs autres message brokers
- Pratique : matrice de choix

#### M3. Mécanique du stream

- Concepts : ordonnancement, répartition des messages, configuration de la rétention
- Pratique : tracer la distribution des messages sur 2 shards

#### Mini-projet : pipeline producer/consumer avec partitionnement et rétention configurés selon un cas d'usage défini

---

### AWS Analytics — Départ 0 | Confirmé 2 | Senior 2.5

#### M1. CloudWatch — logs

- Concepts : recherche de logs, Logs Groups, suivi en direct via Trail
- Pratique : requête CloudWatch sur des logs applicatifs

#### M2. CloudWatch — alerting

- Concepts : création d'alarmes
- Pratique : alerte sur un seuil de latence

#### M3. Athena

- Concepts : requêtes, formats supportés, moteur SQL sous-jacent, intégrations, partitionnement S3
- Pratique : requête Athena sur des données partitionnées dans S3

#### M4. EMR

- Concepts : EMR Studio (exécution de scripts), intérêt de la plateforme, technologies supportées
- Pratique : exécuter un script depuis EMR Studio

#### M5. Data Firehose

- Concepts : intérêt, sources exploitables
- Pratique : pipe simple Firehose vers S3

#### M6. Glue — Catalog et crawlers

- Concepts : Glue Catalog, crawlers et leur intégration au Data Catalog
- Pratique : crawler sur des fichiers S3 et requête Athena dessus

#### M7. Glue — tarification et bookmark

- Concepts : limites du modèle de tarification, intérêt d'un job bookmark
- Pratique : job Glue avec bookmark

#### M8. Comparatifs analytics

- Concepts : Redshift vs Aurora / RDS, dimension serverless
- Pratique : matrice de choix pour 2 cas d'usage

#### Mini-projet : pipeline complet S3 → Glue crawler → Athena, avec alerting CloudWatch sur seuil de coût ou de volume

---

## Pondération 2

### SQL — Départ 0 | Confirmé 2.5 | Senior ignoré

#### M1. Contexte SQL

- Concepts : contexte d'utilisation du SQL, notion de schéma
- Pratique : décrire le schéma d'une base existante

#### M2. CRUD

- Concepts : `SELECT`, `INSERT`, `UPDATE`, `DELETE` (avec `WHERE`)
- Pratique : opérations CRUD complètes sur une table

#### M3. DDL et contraintes

- Concepts : `CREATE`/`ALTER`/`DROP TABLE`, clés primaires, clés étrangères, contraintes de nommage
- Pratique : création d'une base relationnelle complète

#### M4. Agrégation

- Concepts : fonctions d'agrégation, `GROUP BY`, `HAVING`
- Pratique : rapports d'agrégation sur jeu de données

#### M5. Jointures et ensembles

- Concepts : `INNER JOIN`, `LEFT/RIGHT JOIN`, fonctions d'ensemble (`UNION`, `INTERSECT`, `EXCEPT`)
- Pratique : requêtes multi-tables

#### M6. Lisibilité et conditions

- Concepts : alias, `SELECT CASE`, wildcards
- Pratique : requêtes lisibles et conditionnelles

#### M7. Transactions

- Concepts : `COMMIT`, `ROLLBACK`
- Pratique : opération atomique multi-tables

#### M8. Vues

- Concepts : création, intérêt, utilisation
- Pratique : créer une vue pour simplifier une requête récurrente

#### M9. Modélisation

- Concepts : formes normales (1NF, 2NF, 3NF), MCD à partir de besoins métiers et de dépendances fonctionnelles, MLD/MPD
- Pratique : modélisation complète d'un domaine métier (MCD → MLD → MPD)

#### M10. Manipulation avancée

- Concepts : suppression en cascade, dump SQL
- Pratique : export/import d'une base existante

#### M11. Sécurité

- Concepts : injections SQL, paramétrage des requêtes
- Pratique : refactor d'une requête vulnérable

#### M12. Vers 2.5 — Approfondissement N3

- Concepts : requêtes imbriquées, index (intérêt et création), introduction aux triggers et procédures stockées
- Pratique : optimiser une requête lente par ajout d'un index

#### Mini-projet : modélisation et implémentation d'un schéma métier (MCD → MLD → SQL + migrations versionnées)
