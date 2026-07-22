# M3 — CQRS

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **CQRS** (Command Query Responsibility Segregation) en une phrase et le distinguer du pattern **CRUD** auquel on l'oppose souvent.
- Expliquer **comment CQRS améliore la collaboration entre utilisateur·ices**, en particulier sur les systèmes à forte concurrence d'écriture ou à forte asymétrie lecture / écriture.
- Identifier les **contextes pertinents** pour adopter CQRS et les contextes où il est sur-dimensionné.
- Distinguer **CQRS simple** (séparation logique) de **CQRS avec event sourcing** (deux modèles physiques différents).
- Illustrer CQRS sur un cas métier concret avec **trois écritures** et **deux lectures** distinctes.

## Durée estimée

1 jour.

## Pré-requis

- M1 et M2 (vocabulaire architecture, trade-offs).
- POO M5 (SOLID, en particulier SRP et DIP) — CQRS est SRP appliqué au niveau d'une API.
- Notion de transaction (cf. SQL M7 si déjà parcouru — sinon, suffisamment intuitive ici).

---

## 1. Le constat de départ — l'asymétrie lecture / écriture

### Pourquoi un nom barbare ?

CQRS = **Command Query Responsibility Segregation**. Le pattern a été nommé par **Greg Young** vers 2010, en s'appuyant sur le principe **CQS** (Command-Query Separation) introduit par **Bertrand Meyer** dans les années 80.

CQS, version méthode :

- Une **query** retourne une valeur **sans modifier l'état**.
- Une **command** modifie l'état **sans retourner de valeur** (au-delà d'un statut).
- Une méthode est soit l'une, soit l'autre — pas les deux.

CQRS, c'est ce principe **étendu à l'architecture d'une application** : on sépare le **modèle d'écriture** (qui gère les commands) du **modèle de lecture** (qui gère les queries). Ces deux modèles peuvent vivre dans deux objets, deux services, voire deux bases différentes.

**Analogie.** Une bibliothèque municipale. Les **lecteurs** consultent les étagères, parcourent les rayons, comparent les livres — et ils sont nombreux, simultanément. Les **bibliothécaires** rangent, indexent, retirent, complètent — opérations soigneusement coordonnées, peu nombreuses à la fois. Mélanger les deux flux (lecteur qui range, bibliothécaire qui consulte) ralentit tout le monde. La bibliothèque les sépare physiquement : zone de lecture / arrière-salle de rangement. CQRS fait la même chose dans un système.

### L'observation qui motive CQRS

Dans la plupart des systèmes métier, les opérations **ne sont pas symétriques** :

- Une commande sur un système d'e-commerce : **1 écriture** (insertion d'ordre) pour **20 à 100 lectures** (panier, suivi, historique).
- Une publication sur un réseau social : **1 écriture** (post créé) pour **1 000 à 1 000 000 lectures** (timeline, recherche, profil).
- Une saisie comptable : **1 écriture** (passage d'écriture) pour **5 à 50 lectures** (rapports, audit, exports).

Un modèle **CRUD classique** traite ces deux flux de la même façon — même table, mêmes contraintes, mêmes index. CQRS dit : **traite-les différemment, ils n'ont pas les mêmes contraintes**.

---

## 2. CRUD vs CQRS — la différence en pratique

### Le modèle CRUD classique

Dans un système CRUD typique (la grande majorité des apps web), un objet métier est manipulé via les mêmes outils en lecture et en écriture :

```python
# Modèle unique
class Order:
    id: int
    customer_id: int
    items: list[Item]
    total: float
    status: str
    created_at: datetime

# Repository unique
class OrderRepository:
    def create(self, order: Order) -> Order: ...
    def get(self, order_id: int) -> Order: ...
    def update(self, order_id: int, ...) -> Order: ...
    def delete(self, order_id: int) -> None: ...

# Service unique
class OrderService:
    def place_order(self, ...) -> Order: ...
    def get_order(self, order_id: int) -> Order: ...
    def list_orders_for_customer(self, customer_id: int) -> list[Order]: ...
```

Le `Order` qu'on **écrit** est exactement la même structure que celui qu'on **lit**. Lecture et écriture partagent :

- Le modèle (`Order`).
- Le repository (`OrderRepository`).
- Le stockage (une table `orders` en base).

C'est simple, ça marche pour 80 % des systèmes. La question — c'est dans les **20 % restants** que CQRS apporte une vraie valeur.

### Le modèle CQRS

CQRS sépare **deux modèles** :

- Un modèle **côté commande** (write side) — ce qui sert à modifier l'état.
- Un modèle **côté requête** (read side) — ce qui sert à interroger l'état.

```python
# ---- Côté écriture (commands) ----

class PlaceOrderCommand:
    customer_id: int
    items: list[Item]

class OrderCommandHandler:
    def handle(self, cmd: PlaceOrderCommand) -> OrderId:
        # Validation métier, transactions, écriture en base
        ...

# ---- Côté lecture (queries) ----

class CustomerOrdersView:           # vue dénormalisée
    order_id: int
    customer_name: str              # joint au moment de l'écriture
    total: float
    status_label: str               # "Expédié" plutôt que "SHIPPED"
    formatted_date: str

class OrderQueryHandler:
    def get_orders_for_customer(self, customer_id: int) -> list[CustomerOrdersView]: ...
    def get_order_summary(self, order_id: int) -> OrderSummaryView: ...
```

Les deux côtés peuvent vivre dans le **même processus** (CQRS logique) ou dans **deux services différents** avec **deux bases différentes** (CQRS physique).

### Tableau de différences clés

| Axe                        | CRUD                          | CQRS                                      |
| -------------------------- | ----------------------------- | ----------------------------------------- |
| **Modèle**                 | Un seul                       | Deux (Command / Query)                    |
| **Stockage**               | Une table par entité          | Une table source + projections de lecture |
| **Validation métier**      | Mêlée à la lecture            | Concentrée côté commande                  |
| **Optimisation des reads** | Index sur la table principale | Vues dénormalisées dédiées                |
| **Cohérence**              | Forte (transaction unique)    | Forte côté write, éventuelle côté read    |
| **Complexité**             | Faible                        | Modérée à élevée                          |

---

## 3. Comment CQRS améliore la collaboration entre utilisateur·ices

### L'asymétrie d'usage

Sur un même système, différentes personnes ne font **pas la même chose** :

- Un **commercial** consulte des historiques de devis, exporte des Excel, croise des données — il a besoin de **lectures riches et rapides**.
- Un **gestionnaire administratif** saisit des écritures, applique des règles métier strictes, valide des workflows — il a besoin d'**écritures fiables et tracées**.
- Un **manager** consulte des tableaux de bord agrégés — il a besoin de **rapports**, pas du détail.
- Un **opérateur back-office** corrige des entrées, journalise les rectifications — il a besoin d'**écritures audit-friendly**.

Avec un modèle CRUD unique :

- Les écritures sont **lentes** car la table est encombrée d'index pour servir les lecteurs.
- Les lectures sont **lentes** car la table est verrouillée par les écritures longues.
- Les **rapports complexes** (joints multi-tables) **bloquent les saisies** simultanées.
- Les **règles de validation** sont rejouées même sur des lectures innocentes.

**Conséquence concrète.** Le commercial qui tire un rapport d'activité bloque le système pour la saisie des écritures pendant 12 secondes. Le manager qui actualise son dashboard ralentit la mise à jour de stocks. Les utilisateurs se gênent **mutuellement**.

### Ce que CQRS débloque

En séparant le modèle d'écriture du modèle de lecture, on permet :

1. **Des lectures rapides et adaptées au consommateur.** Le commercial a une vue dénormalisée optimisée pour son cas, le manager a une vue agrégée pré-calculée, l'opérateur back-office a une vue détaillée. Aucun ne ralentit les autres.

2. **Des écritures focalisées.** Le modèle d'écriture sert uniquement à valider et persister les commandes. Pas d'index parasite, pas de jointure lecteur.

3. **Une scalabilité différenciée.** Côté écriture, on peut rester sur une seule base relationnelle (fiabilité). Côté lecture, on peut scaler horizontalement, ajouter du cache, déporter sur du _read replica_ ou sur Elasticsearch pour la recherche.

4. **Une indépendance des cycles de vie.** Une équipe peut faire évoluer la vue commerciale sans toucher au modèle de saisie comptable. Les conflits entre équipes diminuent.

5. **Un audit clair.** Toutes les écritures passent par des **commands** explicitement nommées (`PlaceOrderCommand`, `RefundPaymentCommand`). On capture l'intention métier, pas seulement le résultat final.

**Analogie.** Dans un magasin de bricolage, séparer la **caisse** (commande) du **rayon conseil** (requête) permet d'optimiser chacun : la caisse a un protocole strict, le rayon conseil a des vendeurs disponibles pour discuter sans tenir la queue. Mélanger les deux ralentit tout le monde — le client qui veut juste payer s'impatiente, et celui qui veut un conseil n'est pas écouté.

### Limite à reconnaître

CQRS n'**est pas** un outil de collaboration en temps réel comme du _live editing_ collaboratif (cf. Google Docs, Figma). Pour ce besoin-là, on combine CQRS avec d'**autres** mécanismes (CRDTs, OT, _operational transform_). CQRS aide à **organiser** les responsabilités côté serveur ; il n'écrit pas tout seul le collaboratif côté client.

---

## 4. Les deux niveaux de CQRS

### CQRS logique (light)

Une seule base. Deux modèles applicatifs. Deux handlers.

```graphviz
┌─────────────┐   ┌─────────────────────┐   ┌────────────┐
│   Client    │ → │  CommandHandler     │ → │            │
│             │   └─────────────────────┘   │  Base SQL  │
│             │                             │   unique   │
│             │   ┌─────────────────────┐   │            │
│             │ → │  QueryHandler       │ ← │            │
└─────────────┘   │  (vues SQL / DTO)   │   └────────────┘
                  └─────────────────────┘
```

- Les écritures passent par des **commands** validées et transactionnelles.
- Les lectures passent par des **vues SQL** ou des DTO dédiés (pas les entités d'écriture).
- Une seule base = **cohérence forte** instantanée.

C'est la version **par défaut** quand on parle de CQRS sans préciser. Pertinente dans la **majorité** des contextes où CQRS est justifié.

### CQRS physique (avec projections asynchrones)

Une **base d'écriture** distincte d'une (ou plusieurs) **base de lecture**. Les écritures sur la première sont **propagées** vers les secondes via des événements.

```graphviz
                           ┌────────────────┐
                           │   Commands     │
                           └────────┬───────┘
                                    │
                                    ▼
                  ┌────────────────────────────────┐
                  │       Write database           │
                  │      (modèle normalisé)        │
                  └────────────┬───────────────────┘
                               │ events
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
       ┌──────────────┐ ┌──────────────┐ ┌───────────────┐
       │ Read DB #1   │ │ Read DB #2   │ │ Cache /       │
       │ (rapports)   │ │ (recherche)  │ │ Elasticsearch │
       └──────────────┘ └──────────────┘ └───────────────┘
```

- **Cohérence éventuelle** côté lectures (lag de quelques ms à quelques secondes).
- Permet d'utiliser le **bon outil** côté lecture : SQL pour les rapports, Elasticsearch pour la recherche, Redis pour le cache d'agrégats.
- Couplage souvent associé à de l'**event sourcing** (les events deviennent la source de vérité).

C'est la version **lourde**, à réserver à des contextes où l'asymétrie de charge ou le besoin de stockages spécialisés le justifie. Coût d'exploitation élevé.

### Tableau récapitulatif

| Aspect                 | CQRS logique                                 | CQRS physique                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------------- |
| **Nombre de bases**    | 1                                            | 2+                                                 |
| **Cohérence**          | Forte                                        | Éventuelle (lag)                                   |
| **Complexité ops**     | Faible                                       | Élevée (event bus, monitoring du lag)              |
| **Cas d'usage**        | Logique métier riche, audit clair            | Asymétrie de charge majeure, stockages spécialisés |
| **Quand l'introduire** | Tôt, si l'on prévoit de la complexité métier | Tard, sur déclencheur métier / charge              |

---

## 5. CQRS et ses voisins

### CQRS vs CQS

**CQS** est une **discipline de signature** au niveau d'une méthode : ne pas mélanger lecture et écriture dans une même méthode. CQRS est l'**architecture** qui généralise CQS à un système entier. On peut respecter CQS sans faire de CQRS (et c'est conseillé). On ne peut pas faire CQRS proprement sans respecter CQS.

### CQRS vs Event Sourcing

Beaucoup de littérature mélange les deux — ce sont **deux choses distinctes** :

- **CQRS** : séparer le modèle d'écriture du modèle de lecture.
- **Event Sourcing** : stocker l'historique des événements comme **source de vérité**, l'état actuel étant reconstitué à partir des événements.

On peut faire :

- **CQRS sans Event Sourcing** (cas le plus fréquent — recommandé en première intention).
- **Event Sourcing sans CQRS** (rare, peu pratique).
- **Les deux ensemble** — combo puissant mais lourd, à réserver à des contextes très spécifiques (finance, audit lourd, _undo_ historique).

### CQRS vs Hexagonal

CQRS est **complémentaire** de l'architecture hexagonale (cf. M1). En hexagonal, on a déjà :

- Des **commands handlers** côté entrée (les use cases d'écriture).
- Des **query handlers** côté entrée (les use cases de lecture).

CQRS formalise simplement la **séparation explicite** des deux familles. Si l'app est déjà en hexagonal, passer à CQRS logique est un petit pas. Si elle est en CRUD spaghetti, c'est un gros saut.

---

## 6. Quand adopter CQRS — et quand s'abstenir

### Signaux **pour** CQRS

- **Asymétrie majeure** entre lectures et écritures (ratio > 10:1).
- **Plusieurs personas** qui consomment la même donnée sous des angles très différents.
- **Règles métier d'écriture riches** qui pollueraient les lectures si elles étaient mélangées.
- **Rapports complexes** qui bloquent les saisies en CRUD classique.
- **Besoin d'audit fort** — chaque commande devient un événement métier nommé et traçable.
- **Besoin de stockages spécialisés** côté lecture (recherche full-text, agrégats temps réel).

### Signaux **contre** CQRS

- App **CRUD simple** sans logique métier d'écriture spécifique.
- Équipe **petite** sans appétit pour la complexité supplémentaire.
- **Charge faible** — le CRUD classique tient sans broncher.
- **Time-to-market serré** — CQRS ralentit la première version.
- Mauvaise compréhension du pattern dans l'équipe — appliquer CQRS sans le maîtriser produit un système incohérent et difficile à debugger.

### Règle pratique

> Démarrer **CRUD**. Identifier les **points de souffrance** au fil du temps. Adopter **CQRS logique** sur les domaines qui en ont vraiment besoin. Évaluer **CQRS physique** uniquement quand le logique n'est plus suffisant.

CQRS n'est pas un choix initial — c'est une **réponse à une douleur observée**.

---

## 7. Illustration sur un cas métier — application de gestion de tâches d'équipe

Pour rendre concret, prenons un cas réaliste qu'on déroulera tout au long du module.

### Contexte

Une application de gestion de tâches pour une équipe :

- Les **équipiers** créent et mettent à jour des tâches.
- Les **managers** suivent l'avancement, consultent des rapports d'équipe.
- Les **clients** (visibilité limitée) consultent le statut public des tâches qui les concernent.

### Modélisation CRUD naïve

```python
class Task:
    id: int
    title: str
    description: str
    assignee_id: int
    status: str            # "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE"
    priority: int
    due_date: date
    created_at: datetime
    updated_at: datetime
    history: list[Event]   # audit interne

class TaskRepository:
    def create(self, task: Task) -> Task: ...
    def update(self, task: Task) -> Task: ...
    def get(self, task_id: int) -> Task: ...
    def list(self, **filters) -> list[Task]: ...
```

**Problèmes observés au bout de 6 mois.**

- Les rapports managers (regroupement par assignee, agrégat par statut, temps moyen par tâche) tournent en 5 à 15 secondes — bloquent la table.
- Les clients voient des **détails internes** qu'ils n'auraient pas dû voir (history complet, descriptions techniques).
- Chaque endpoint de mise à jour `PATCH /tasks/:id` doit valider des règles complexes (transition de statut, droit de l'assignee, blocage si dépendances ouvertes) — la logique se duplique partout.
- Les exports CSV pour les managers font tomber le service pendant 30 secondes.

### Modélisation CQRS

On sépare **trois écritures** clairement nommées et **deux lectures** dédiées par persona.

#### Côté écriture — Commands

```python
class CreateTaskCommand:
    title: str
    description: str
    assignee_id: int
    priority: int
    due_date: date

class TransitionTaskStatusCommand:
    task_id: int
    new_status: str
    actor_id: int
    reason: str | None = None

class ReassignTaskCommand:
    task_id: int
    new_assignee_id: int
    actor_id: int


class TaskCommandHandler:
    def __init__(self, repo: TaskRepository, event_bus: EventBus):
        self.repo = repo
        self.event_bus = event_bus

    def handle_create(self, cmd: CreateTaskCommand) -> TaskId:
        # Validation métier (dates, droits, charge de l'assignee, etc.)
        # Création atomique
        # Publication d'un event TaskCreated
        ...

    def handle_transition(self, cmd: TransitionTaskStatusCommand) -> None:
        # Vérification des règles de transition (TODO → IN_PROGRESS OK, DONE → TODO interdit, etc.)
        # Vérification des droits (seul assignee ou manager autorisé)
        # Publication TaskStatusTransitioned
        ...

    def handle_reassign(self, cmd: ReassignTaskCommand) -> None:
        # Vérification des droits du manager
        # Publication TaskReassigned
        ...
```

Chaque command **dit explicitement** ce qui se passe : pas un `update_task` générique, mais trois intentions métier distinctes. Le code est lisible, l'audit est gratuit (chaque command = un événement nommé).

#### Côté lecture — Queries par persona

```python
# Vue pour le manager — large, agrégée
class TeamDashboardView:
    assignee_name: str
    tasks_todo: int
    tasks_in_progress: int
    tasks_blocked: int
    tasks_done_this_week: int
    avg_time_in_progress_hours: float
    overdue_count: int

# Vue pour le client — minimaliste, filtrée
class PublicTaskView:
    public_reference: str        # pas l'id interne
    title: str                   # pas la description technique
    public_status: str           # "En cours" / "Terminé" plutôt que statuts internes
    estimated_delivery: date     # pas la due_date interne


class TaskQueryHandler:
    def dashboard_for_manager(self, manager_id: int) -> list[TeamDashboardView]:
        # Requête optimisée sur une vue matérialisée ou une projection dédiée
        ...

    def public_tasks_for_client(self, client_id: int) -> list[PublicTaskView]:
        # Filtre strict, projection sécurisée
        ...
```

#### Stockage

Au choix selon la complexité :

- **Niveau logique** : tout dans la même base PostgreSQL, avec des **vues SQL** (`CREATE VIEW team_dashboard_v AS ...`) ou des **tables matérialisées** rafraîchies périodiquement.
- **Niveau physique** : table d'écriture en PostgreSQL, projection dans une table read-only sur le _read replica_ ou dans Elasticsearch pour la recherche de tâches.

Au démarrage, **on commence par le niveau logique**. On bascule sur le physique seulement si la charge ou le besoin de stockage spécialisé le justifie.

### Ce qu'on a gagné — concrètement

- **Audit gratuit** : chaque action métier est nommée (`TaskStatusTransitioned` plutôt que "champ status modifié"). On peut rejouer l'historique d'une tâche action par action.
- **Sécurité par construction** : `PublicTaskView` n'expose pas les champs sensibles — impossible de les fuiter par erreur via un endpoint public.
- **Performances découplées** : un manager qui consulte son dashboard ne bloque plus la saisie des équipiers.
- **Évolution indépendante** : ajouter une nouvelle vue pour un nouveau persona (commercial, support client) ne touche pas au code d'écriture.

### Ce que ça a coûté

- **Plus de classes** : trois commands, deux vues, deux handlers — 8 classes au lieu de 2 en CRUD.
- **Mapping à maintenir** entre le modèle d'écriture et les vues de lecture.
- **Validation à concentrer** côté command — l'erreur classique étant de re-valider dans les vues.
- **Onboarding plus long** pour les nouveaux développeurs.

Le calcul du retour sur investissement se fait sur la **durée de vie** du projet. Sur 3 mois, c'est probablement perdu. Sur 3 ans, c'est largement rentable.

---

## 8. Exercices pratiques

### Exercice 1 — Repérer les violations de CQS (≈ 20 min)

Pour chaque méthode ci-dessous, dire si elle viole CQS (mélange query et command). Si oui, proposer un découpage en deux méthodes.

```python
class Account:
    def withdraw(self, amount: float) -> float:
        self._balance -= amount
        return self._balance     # ← ?

    def get_balance(self) -> float:
        return self._balance     # ← ?

    def deposit(self, amount: float) -> None:
        self._balance += amount  # ← ?

    def pop_next_event(self) -> Event:
        return self._events.pop(0)   # ← ?
```

### Exercice 2 — Identifier la pertinence de CQRS (≈ 30 min)

Pour chaque cas, dire **CQRS pertinent** ou **CRUD suffisant**, et justifier en 2 à 3 lignes.

**Cas A.** Application interne de gestion de congés pour 80 employés. Saisies ponctuelles (un congé par mois et par employé). Rapports RH mensuels en fin de mois.

**Cas B.** Plateforme de trading temps réel. 10 000 transactions par seconde côté écriture. 1 000 000 de consultations de carnet d'ordres par seconde. Audit légal exigé sur chaque opération.

**Cas C.** Blog personnel. 1 publication par semaine. 100 lecteurs par jour. Auteur unique.

**Cas D.** SaaS de comptabilité multi-cabinets. Saisies d'écritures avec règles métier complexes (validations, journaux, rapprochements). Exports comptables mensuels, déclarations fiscales trimestrielles, audits réguliers.

### Exercice 3 — Modéliser CQRS pour un cas métier (≈ 60 min)

Reprendre le cas suivant :

> Une bibliothèque numérique. Les **adhérents** empruntent des livres (e-books), notent, ajoutent en favoris. Les **bibliothécaires** ajoutent des ouvrages au catalogue, gèrent les retours, suspendent un compte en cas d'abus. Les **administrateurs** consultent des statistiques d'usage, font des rapports trimestriels au conseil municipal.

Produire :

1. **3 commands** clairement nommées, avec leurs champs (côté écriture).
2. **3 vues** (queries) distinctes, une par persona (adhérent / bibliothécaire / administrateur). Préciser pour chacune les champs exposés.
3. Une **règle métier d'écriture** côté commands qui **ne doit pas** apparaître côté reads.
4. Une **règle de sécurité** qui filtre ce qu'un adhérent peut voir, exprimée comme une **différence de vue** plutôt qu'un contrôle d'accès.

### Exercice 4 — Refactor CQS sur une fonction (≈ 30 min)

Soit :

```python
def consume_credit(user_id: int, amount: float) -> dict:
    user = db.users.find_one({"_id": user_id})
    if user["credit"] < amount:
        return {"ok": False, "remaining": user["credit"]}
    db.users.update_one(
        {"_id": user_id},
        {"$inc": {"credit": -amount}},
    )
    new_user = db.users.find_one({"_id": user_id})
    return {"ok": True, "remaining": new_user["credit"]}
```

Cette fonction **mélange** une query (vérifier le solde, retourner le solde) et une command (débiter). Réécrire en respectant CQS — deux fonctions distinctes, l'API utilisant les deux.

Justifier en deux lignes en quoi la version refactorée est plus testable.

### Exercice 5 — Estimation du gain (≈ 30 min)

Pour le cas métier de la **section 7** (gestion de tâches d'équipe), estimer **en ordre de grandeur** :

- Combien de classes en plus pour passer de CRUD à CQRS logique ?
- Combien d'heures de développement supplémentaires sur la V1 ?
- Au bout de combien de mois le gain en bugs évités et en vélocité compense ce coût ? (Donner une fourchette, justifier les hypothèses.)

Pas de bonne réponse — l'objectif est de pratiquer l'**argumentation chiffrée** que les modules M4 (décisions techniques) et M6 (coûts) exigeront.

---

## 9. Mini-défi de synthèse — fiche d'illustration CQRS (≈ 2 h)

Reprendre le cas de l'exercice 3 (bibliothèque numérique) ou un cas tiré de l'expérience personnelle. Produire une **fiche de présentation** d'une page A4 destinée à un pair non familier de CQRS.

Structure imposée :

1. **Contexte** (3 lignes) — quel système, quelles personas.
2. **Pourquoi pas CRUD ?** (5 à 8 lignes) — la douleur observée, l'asymétrie.
3. **Découpage CQRS** :
   - Diagramme **Commands** : 3 à 5 commands nommées avec un mot-clé chacune.
   - Diagramme **Queries** : 2 à 3 vues par persona.
4. **Bénéfice attendu** (3 lignes) — ce qu'on cherche à obtenir.
5. **Coût assumé** (3 lignes) — ce qu'on accepte comme contrepartie.
6. **Quand y aller ?** (1 phrase) — le déclencheur qui justifie le passage.

**Critères de validation.**

- La fiche tient sur **une page**.
- Les commands sont des **verbes au présent / impératif** (`CreateTask`, `TransitionStatus`) — pas des noms (`TaskCreation`).
- Au moins **deux vues** sont visiblement **différentes** entre personas (pas juste un filtre `WHERE`).
- Le mot "performance" ou "scalabilité" n'apparaît **pas seul** — il est toujours accompagné d'un ordre de grandeur ou d'un contexte.

---

## 10. Auto-évaluation

Le module M3 est validé lorsque :

- [ ] L'apprenant définit **CQRS** en une phrase et le distingue clairement de **CQS** et d'**Event Sourcing**.
- [ ] Il identifie au moins **trois bénéfices de CQRS** en termes de collaboration entre utilisateur·ices.
- [ ] Il distingue **CQRS logique** et **CQRS physique** et sait dans quel cas adopter chacun.
- [ ] Il a produit une **modélisation CQRS** sur le cas de l'exercice 3 (3 commands, 3 vues par persona).
- [ ] La **fiche d'illustration** tient sur une page et respecte les critères de la section 9.
- [ ] Il **n'introduit pas CQRS spontanément** sur un cas CRUD simple — il sait dire non.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : capacité à expliquer comment le pattern CQRS améliore la collaboration entre utilisateur·ices.
- **N3** (amorce) : capacité à mettre en place CQRS dans un contexte adapté — le pattern est compris, l'application en condition réelle se travaille au fil de la pratique métier.

---

## 11. Ressources complémentaires

- **Greg Young** — _CQRS Documents by Greg Young_ (2010, PDF court). Le texte fondateur, à lire en VO. [cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf).
- **Martin Fowler** — _CQRS_ (article, 2011). [martinfowler.com/bliki/CQRS.html](https://martinfowler.com/bliki/CQRS.html). Lecture rapide, vue d'ensemble équilibrée — y compris sur quand **ne pas** l'appliquer.
- **Bertrand Meyer** — _Object-Oriented Software Construction_ (1988). Le chapitre 23 introduit CQS au niveau méthode, la racine du pattern.
- **Vaughn Vernon** — _Implementing Domain-Driven Design_ (2013). Chapitres sur CQRS dans le contexte DDD, avec des exemples concrets en Java.
- **Eric Evans** — _Domain-Driven Design_ (2003), parties tactiques. Le repository et l'aggregate, briques sur lesquelles CQRS se pose naturellement.
- **Documentation Microsoft Architecture Center** — _CQRS pattern_. [learn.microsoft.com/azure/architecture/patterns/cqrs](https://learn.microsoft.com/azure/architecture/patterns/cqrs). Variantes avec et sans event sourcing, bien illustrées.
- **Udi Dahan** — _Clarified CQRS_ (article, 2009). Précisions sur les pièges récurrents. [udidahan.com/2009/12/09/clarified-cqrs/](https://udidahan.com/2009/12/09/clarified-cqrs/).
- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — repère les items N2 et N3 mentionnant CQRS.
