# M10 — Architecture vs design

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer un **patron de conception** (design pattern) d'un **patron d'architecture** (architectural pattern).
- Citer les principaux patrons d'architecture : couches, hexagonale, microservices, MVC, event-driven, CQRS.
- Comprendre la notion d'**inertie** entre classes (coupling / cohesion).
- **Analyser** l'architecture d'un projet existant via une méthode reproductible.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M9 POO terminés.

---

## 1. Une question d'échelle

### Théorie

Design pattern et architectural pattern sont deux **niveaux de zoom** différents sur le même problème : organiser le code.

| Niveau                    | Quoi                                                                | Qui                            |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| **Design pattern**        | Une **classe** ou un **groupe restreint de classes**                | Le développeur, dans le code   |
| **Patron d'architecture** | Un **module entier**, un **service**, ou **l'application complète** | L'architecte, sur un diagramme |

**Analogie.** Un design pattern, c'est la **disposition des meubles** dans une pièce — où placer le canapé par rapport à la TV. Un patron d'architecture, c'est le **plan d'urbanisme** d'une ville — où se trouve le quartier d'affaires par rapport aux zones résidentielles, comment les rues les relient.

Les deux questions sont distinctes : on peut mal arranger des meubles dans une bonne ville, ou bien arranger les meubles dans une ville mal pensée. Les deux échelles méritent leur attention.

### Pourquoi les distinguer

- **Vocabulaire** — confondre les deux mène à des conversations confuses ("on a un Singleton" ≠ "on a une architecture en microservices").
- **Décisions** — un design pattern coûte une heure à implémenter. Un patron d'architecture engage **toute l'équipe pour des années**.
- **Coût de changement** — refactorer un Singleton est facile. Migrer d'un monolithe vers des microservices prend des mois.

---

## 2. Les patrons d'architecture courants

### Architecture en couches (Layered)

L'application est découpée en **couches horizontales**, chacune ne dépendant que de la couche immédiatement inférieure.

```
┌─────────────────────────┐
│  Presentation (HTTP)    │
├─────────────────────────┤
│  Application (use cases)│
├─────────────────────────┤
│  Domain (entités)       │
├─────────────────────────┤
│  Infrastructure (DB)    │
└─────────────────────────┘
```

**Avantage** : simple à comprendre, équipes alignées sur les couches.
**Inconvénient** : tendance à des couches trop fines, dépendance "vers le bas" coupe le domaine de la persistance.

### Architecture hexagonale (Ports & Adapters)

Le **domaine** est au centre. Tout ce qui est externe (DB, HTTP, files) passe par des **ports** (interfaces) implémentés par des **adapters**.

```
            ┌──── HTTP API ────┐
            │                  │
   ┌────────▼──────────┐       │
   │                   │       │
   │   Domain Core     │◄──────┤
   │   (use cases)     │       │
   │                   │       │
   └────────┬──────────┘       │
            │                  │
            └──── DB / Cache ──┘
```

**Avantage** : domaine isolé des détails techniques. Tests faciles avec adapters fakes.
**Inconvénient** : plus de classes, courbe d'apprentissage.

C'est le sujet majeur du parcours Architecture Logicielle (Senior).

### Modèle MVC / MVP / MVVM

Séparation **présentation / logique / données**.

- **Model** — état + logique métier.
- **View** — affichage.
- **Controller** — orchestrateur entre l'utilisateur et le model.

Présent dans Django, Rails, .NET MVC. Pour les apps web classiques avec rendu côté serveur.

### Architecture microservices

L'application est décomposée en **services indépendants** qui communiquent via le réseau (HTTP, message broker).

```
[Order Service] ──HTTP──► [Payment Service]
        │                          │
        └──Kafka──► [Inventory Service]
```

**Avantage** : scaling indépendant, déploiement indépendant, équipes autonomes.
**Inconvénient** : complexité opérationnelle (réseau, monitoring, cohérence), latence.

### Architecture event-driven

Les services communiquent par **événements asynchrones** plutôt que par appels directs.

```
[Order Service] ──"order.created"──► Event Bus
                                       │
                            ┌──────────┼──────────┐
                            ▼          ▼          ▼
                    [Payment]   [Inventory]  [Email]
```

**Avantage** : découplage temporel, scalable, audit naturel.
**Inconvénient** : raisonnement plus difficile, debugging complexe.

### CQRS (Command Query Responsibility Segregation)

Les **écritures** (commands) et les **lectures** (queries) passent par des chemins **séparés**. Souvent associé à des modèles de données différents pour chaque côté.

```
        ┌── COMMAND ──► [Write Model] ──► Event Store
Client ─┤
        └── QUERY ────► [Read Model] (optimisé pour la lecture)
```

**Avantage** : optimisation indépendante. Lectures peuvent scaler horizontalement.
**Inconvénient** : complexité, synchronisation eventually consistent.

### Monolithe modulaire

Une **seule application** déployée, mais **structurée en modules** indépendants avec dépendances explicites.

```
my-app/
├── billing/        # ne dépend que de "shared/"
├── catalog/        # ne dépend que de "shared/"
├── shipping/       # peut dépendre de "billing" et "catalog"
└── shared/         # primitives communes
```

**Avantage** : simplicité opérationnelle d'un monolithe + isolation modulaire. Souvent un bon **premier pas avant microservices**.

### Tableau comparatif

| Architecture        | Quand l'utiliser                                   | Quand l'éviter                               |
| ------------------- | -------------------------------------------------- | -------------------------------------------- |
| Couches             | Petits/moyens projets, équipe en formation         | Domaine complexe nécessitant isolation forte |
| Hexagonale          | Domaine métier riche, besoin de testabilité        | CRUD simple                                  |
| MVC                 | Apps web avec rendu serveur                        | APIs pures, SPA                              |
| Microservices       | Scaling indépendant, équipes multiples             | Petite équipe, projet jeune                  |
| Event-driven        | Workflows asynchrones, intégrations multiples      | Cas synchrones simples                       |
| CQRS                | Lectures et écritures avec besoins très différents | Lecture/écriture symétriques                 |
| Monolithe modulaire | Premier pas avant les microservices                | Quand le scaling indépendant est avéré       |

---

## 3. Inertie entre classes

### Théorie

L'**inertie** d'un système OO mesure la **résistance au changement**. Plus une classe est inerte, plus la modifier impacte le reste du code.

L'inertie dépend de deux notions classiques :

- **Couplage (coupling)** — combien de **dépendances** la classe a (et combien l'utilisent).
- **Cohésion (cohesion)** — à quel point ses méthodes/attributs **travaillent ensemble**.

**Objectif :** _low coupling, high cohesion_.

**Analogie.** Un meuble dans une pièce :

- **Inertie faible** = une chaise. Facile à déplacer.
- **Inertie forte** = un mur porteur. Le bouger demande de refaire la maison.

Une classe avec 50 dépendances (utilisée et utilisant 50 autres classes) est un mur porteur. La modifier casse tout.

### Mesurer l'inertie

Plusieurs heuristiques :

- **Fan-in** — nombre de classes qui dépendent de moi. Élevé = je suis utilisé partout, donc inerte.
- **Fan-out** — nombre de classes dont je dépends. Élevé = je suis fragile aux changements ailleurs.
- **LCOM (Lack of Cohesion of Methods)** — mesure combien les méthodes d'une classe partagent les mêmes attributs. Élevé = classe fourre-tout, mauvaise cohésion.

### Classes à risque

| Symptôme           | Type              | Conséquence                                       |
| ------------------ | ----------------- | ------------------------------------------------- |
| Fan-in très élevé  | "God class"       | Modification = risque sur 50 endroits             |
| Fan-out très élevé | "Dispatcher"      | Très fragile aux refactors externes               |
| LCOM élevé         | Mauvaise cohésion | Plusieurs responsabilités cachées (violation SRP) |

### Réduire l'inertie

Trois leviers, tous vus dans les modules précédents :

1. **Séparer les responsabilités** (SRP, M5) → réduit le fan-in/fan-out par division.
2. **Introduire des abstractions** (DIP, M5) → les dépendances pointent vers des interfaces stables, pas des classes concrètes mutantes.
3. **Composition plutôt qu'héritage** (M1, M2) → réduit le couplage hiérarchique.

### Cas concret

```python
# ✗ Forte inertie
class OrderService:
    def __init__(self):
        self.db = MySQLDatabase("...")        # couplage à MySQL
        self.email = SmtpClient("smtp.x")     # couplage à SMTP
        self.payment = StripeClient("key")    # couplage à Stripe
        self.cache = RedisClient("...")       # couplage à Redis
        self.logger = ElasticLogger("...")    # couplage à Elastic
```

5 dépendances concrètes. Changer Stripe pour PayPal = modifier `OrderService`. Tester sans réseau = impossible. Cette classe **freine** toute évolution du système.

```python
# ✓ Faible inertie
class OrderService:
    def __init__(
        self,
        order_repo: OrderRepository,
        notifier: Notifier,
        payment: PaymentGateway,
        cache: Cache,
        logger: Logger,
    ):
        ...
```

5 dépendances abstraites. Changer une implémentation = créer un nouvel adapter, pas modifier `OrderService`. Test = injecter des fakes.

---

## 4. Méthode d'analyse d'une architecture existante

### Méthode en 6 étapes

**1. Cartographier les modules**

Lister les dossiers de premier niveau. Quel est leur rôle apparent ? `domain/`, `infrastructure/`, `api/`, `tests/` → indices d'architecture hexagonale. `views/`, `models/`, `controllers/` → MVC. Pas de structure claire → monolithique organique.

**2. Identifier le ou les patrons d'architecture**

Croiser les noms de dossiers avec le contenu. Y a-t-il des **interfaces / abstractions** au cœur du domaine ? Le domaine **importe-t-il** des modules d'infrastructure (mauvais signe) ou l'inverse (bon signe) ?

**3. Évaluer le couplage**

Outil rapide : `grep -r "import" src/ | wc -l` ou `pydeps` pour générer un graphe de dépendances. Repérer les modules les plus importés (fan-in élevé = peut-être un module noyau, ou un dieu).

**4. Évaluer la cohésion**

Lecture rapide des plus gros fichiers. Ont-ils **une responsabilité** identifiable ou s'agit-il de fourre-tout (`utils.py`, `helpers.py` géants) ?

**5. Repérer les design patterns identifiables**

Singleton, Factory, Strategy, Decorator... Sont-ils utilisés sciemment et nommés ? Ou bien le code reproduit des patterns sans les nommer ?

**6. Évaluer la testabilité**

Combien de tests, combien de coverage ? Les tests dépendent-ils de vrais services externes (DB réelle, HTTP réel) ou exploitent-ils des fakes / mocks (signe que l'architecture supporte l'isolation) ?

### Outils utiles

- **`pydeps`** — graphe de dépendances entre modules Python.
- **`pylint --reports`** — métriques de complexité par module.
- **`radon cc`** — complexité cyclomatique.
- **`tokei`** ou **`cloc`** — comptage de lignes par dossier.
- **Diagramme manuel** sur PlantUML / Mermaid — la simple action de dessiner force à clarifier.

---

## 5. Exercices pratiques

### Exercice 1 — Distinguer design vs architecture (≈ 15 min)

Pour chaque cas, indiquer s'il s'agit d'un **design pattern**, d'un **patron d'architecture**, ou **d'autre chose** :

1. Le module FastAPI sépare `routers/`, `schemas/`, `services/`.
2. La classe `OrderFactory` crée des `Order` selon le type d'utilisateur.
3. Un Kafka topic relaie les événements entre 3 services.
4. Un objet `History` empile les commandes pour permettre l'undo.
5. Le projet est découpé en `frontend/` (Next.js), `api/` (FastAPI), `worker/` (Celery).
6. La classe `Logger` est un Singleton.
7. Le service `BillingService` ne connaît que des abstractions `Repository` et `Notifier`.

### Exercice 2 — Identifier l'inertie (≈ 25 min)

Soit la classe :

```python
class UserService:
    def __init__(self):
        self.db = MySqlClient("localhost")
        self.cache = RedisClient("localhost")
        self.email = SmtpClient("smtp.example.com")
        self.audit = ElkClient("elk.example.com")
        self.events = KafkaProducer("kafka")

    def signup(self, email, password):
        if self.cache.get(f"user:{email}"):
            raise ValueError("exists")
        user_id = self.db.insert("users", ...)
        self.cache.set(f"user:{email}", user_id)
        self.email.send(email, "Welcome")
        self.audit.log("signup", user_id)
        self.events.publish("user.signup", {"id": user_id})
        return user_id
```

1. Lister les dépendances concrètes (fan-out).
2. Évaluer la testabilité : peut-on tester `signup` sans aucun service externe ?
3. Refactorer en abstractions injectées + au moins un test avec fakes.
4. Mesurer la réduction d'inertie : combien de classes externes seraient impactées par un changement de SGBD (avant / après) ?

### Exercice 3 — Choisir un patron d'architecture (≈ 30 min)

Pour chaque scénario, recommander **un patron d'architecture** (avec une alternative crédible) et **justifier** :

1. Une startup de 2 développeurs lance une plateforme de réservation. Modèle métier simple, peu de trafic au début.
2. Un grand groupe de e-commerce avec 200 ingénieurs en 12 équipes scinde son monolithe en services pour permettre des déploiements indépendants.
3. Une plateforme financière doit traiter 100k commandes/sec en lecture, 10k/sec en écriture, avec des modèles de lecture et d'écriture très différents.
4. Une application interne RH affiche des données utilisateurs depuis 5 systèmes différents (LDAP, SQL, REST).
5. Une équipe de gaming construit un MMORPG avec des évènements asynchrones et plusieurs serveurs régionaux.

### Exercice 4 — Schéma d'architecture (≈ 35 min)

Choisir un projet auquel on contribue (ou un repo open-source : FastAPI, Django REST Framework, requests, Flask...) et **dessiner un diagramme** (Mermaid, PlantUML ou ASCII art) qui montre :

1. Les **3-5 modules principaux**.
2. Les **dépendances** entre eux (flèches).
3. Les **interfaces / abstractions clés** (en pointillés ou couleur différente).

Le diagramme doit tenir sur une page A4.

### Exercice 5 — Quantifier le couplage (≈ 30 min)

Sur un projet Python existant :

1. Installer `pydeps` (`pip install pydeps`).
2. Générer le graphe de dépendances : `pydeps mypackage --show-deps`.
3. Identifier les modules avec le **fan-in le plus élevé** — sont-ce des noyaux légitimes ou des god modules ?
4. Identifier les modules avec le **fan-out le plus élevé** — sont-ils fragiles ?
5. Proposer un module à refactorer en priorité.

---

## 6. Mini-défi de synthèse — analyse d'un repo (≈ 2 à 3 heures)

Choisir **un projet open-source de taille moyenne** (5k - 50k lignes Python). Suggestions :

- **FastAPI** — `tiangolo/fastapi`.
- **httpx** — `encode/httpx`.
- **Pydantic** — `pydantic/pydantic`.
- **Click** — `pallets/click`.
- **Rich** — `Textualize/rich`.

**Mission** : produire une **note d'analyse** d'environ 800-1200 mots qui couvre :

1. **Vue d'ensemble** — but du projet, taille, langage.
2. **Patron d'architecture** identifié (couches / hexagonale / autre). Justifier avec des observations.
3. **Modules clés** — 3 à 5 modules, leur rôle, leurs dépendances internes/externes.
4. **Design patterns repérés** — au moins 3, avec citation du fichier où ils apparaissent.
5. **Mesure d'inertie** — au moins 2 modules très inertes (fan-in élevé), expliquer pourquoi c'est légitime ou pas.
6. **Forces** — au moins 2 décisions d'architecture qui semblent bien pensées.
7. **Risques** — au moins 1 zone qui pourrait poser problème à terme.
8. **Diagramme** — un schéma simple résumant l'architecture.

**Critères de validation** :

- [ ] L'analyse est **factuelle** (citations de fichiers et lignes).
- [ ] La distinction design vs architecture est **respectée**.
- [ ] Les conclusions sont **nuancées** (pas de jugement à l'emporte-pièce).
- [ ] Le diagramme est **lisible** sans la note.

---

## 7. Auto-évaluation

Le module M10 est validé lorsque :

- [ ] L'apprenant distingue design pattern et architectural pattern avec deux analogies.
- [ ] Il peut citer 5 patrons d'architecture et donner un cas d'usage pour chacun.
- [ ] Il connaît les notions de couplage, cohésion, fan-in, fan-out.
- [ ] Il sait identifier une classe inerte et proposer un refactor pour la rendre plus légère.
- [ ] Il maîtrise une méthode d'analyse d'architecture en 6 étapes.
- [ ] La note d'analyse est rédigée et défendable à l'oral.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : patron d'architecture et exemple.
- **N3** : différence entre patron d'architecture et patron de conception, inertie entre classes.

---

## 8. Ressources complémentaires

- **Mark Richards et Neal Ford** — _Fundamentals of Software Architecture_ (2020). Référence moderne sur les patrons d'architecture.
- **Robert C. Martin** — _Clean Architecture_ (2017). Architecture hexagonale et ses dérivés.
- **Sam Newman** — _Building Microservices_ (2ᵉ édition, 2021). La référence microservices.
- **Vaughn Vernon** — _Implementing Domain-Driven Design_ (2013). Pour aller plus loin sur la cohésion métier.
- **Microsoft Cloud Design Patterns** : [learn.microsoft.com/en-us/azure/architecture/patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns). Catalogue de patterns d'architecture cloud.
- **C4 Model** : [c4model.com](https://c4model.com). Notation standard pour diagrammes d'architecture (4 niveaux : Context, Container, Component, Code).
