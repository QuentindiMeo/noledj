# M8 — Patrons de conception fondamentaux

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer les **trois familles** de design patterns (créationnels, structurels, comportementaux).
- Implémenter les **7 patterns fondamentaux** en Python : Singleton, Factory, Observer, Decorator, Strategy, Iterator, State.
- **Reconnaître** ces patterns dans du code existant.
- Choisir les **alternatives pythoniques** quand un pattern Java/C++ est sur-dimensionné.
- Identifier les **anti-patterns** : Singleton abusif, Factory pour deux cas figés, etc.

## Durée estimée

1,5 à 2 jours.

## Pré-requis

- M1 à M7 POO.

---

## 1. Qu'est-ce qu'un design pattern ?

### Théorie

Un **design pattern** est une **solution réutilisable** à un problème de conception récurrent. Il ne s'agit pas de code copiable, mais d'un **modèle conceptuel** qu'on adapte au contexte.

Le terme a été popularisé par le livre **Design Patterns: Elements of Reusable Object-Oriented Software** (Gamma, Helm, Johnson, Vlissides — le "**Gang of Four**" ou GoF), publié en 1994. Le livre catalogue 23 patterns regroupés en 3 familles.

**Analogie.** Les patterns sont des **figures imposées** en gymnastique. Le saut périlleux n'est pas un mouvement à inventer à chaque fois — c'est un nom commun qui désigne une combinaison de gestes connue. Connaître le nom permet de communiquer rapidement avec ses pairs.

### Les trois familles

| Famille             | Question                           | Exemples                                     |
| ------------------- | ---------------------------------- | -------------------------------------------- |
| **Créationnels**    | Comment créer des objets ?         | Singleton, Factory, Builder, Prototype       |
| **Structurels**     | Comment composer les objets ?      | Decorator, Adapter, Composite, Facade        |
| **Comportementaux** | Comment les objets interagissent ? | Observer, Strategy, Iterator, State, Command |

Ce module couvre **7 patterns fondamentaux** des trois familles. M9 ira plus loin avec 5 patterns moins courants.

### Avertissement avant de plonger

> _Knowing patterns isn't a goal — solving problems is._

Beaucoup de débutants après avoir lu le GoF appliquent les patterns **partout**, même quand un `if` ou une fonction simple suffirait. C'est l'**over-engineering**. La règle : on choisit un pattern **quand on en a besoin**, pas pour le plaisir d'en placer un.

---

## 2. Singleton — créationnel

### Intention

Garantir qu'une classe n'a **qu'une seule instance** dans toute l'application, et fournir un point d'accès global.

**Analogie.** Le président d'un pays. Un seul à la fois, accessible par référence ("le président") sans préciser lequel.

### Cas d'usage

- Logger global.
- Cache partagé.
- Pool de connexions.
- Configuration partagée.

### Implémentation Python

```python
class Logger:
    _instance: "Logger | None" = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            self.messages: list[str] = []
            self._initialized = True

    def log(self, msg: str):
        self.messages.append(msg)


a = Logger()
b = Logger()
assert a is b   # ✓ même instance
```

### Alternative pythonique — le module

En Python, **un module est déjà un Singleton** : il n'est chargé qu'une fois et partagé par tous les imports.

```python
# logger.py
messages: list[str] = []

def log(msg: str):
    messages.append(msg)
```

```python
# usage
from my_app import logger
logger.log("hello")
```

Plus simple, plus pythonique. **Préférer cette forme** quand on n'a pas besoin de la classe.

### Quand l'éviter

Le Singleton est **controversé** :

- Il introduit un **état global** caché — rend les tests difficiles.
- Il couple toutes les classes qui l'utilisent à un point unique.
- Il viole le **DIP** (M5) si utilisé directement plutôt qu'injecté.

Préférer l'**injection de dépendances** quand c'est possible. Garder le Singleton pour les cas où l'unicité est **intrinsèque** au domaine.

---

## 3. Factory — créationnel

### Intention

Déléguer la création d'objets à une **fabrique**, plutôt que d'instancier directement avec `new` / `Class(...)`. Permet de découpler le client de la classe concrète instanciée.

**Analogie.** Un atelier de fabrication. Tu commandes "une voiture rouge" — l'atelier décide quelle marque, quelle ligne d'assemblage utiliser, comment l'assembler. Le client n'a pas à savoir.

### Cas d'usage

- Création conditionnelle selon des paramètres.
- Multiples constructeurs alternatifs (cf. POO M6 — `@classmethod`).
- Découplage du client et de la classe concrète.

### Implémentation — Factory Method

```python
from abc import ABC, abstractmethod


class Notification(ABC):
    @abstractmethod
    def send(self, message: str): ...


class EmailNotification(Notification):
    def send(self, message): print(f"email: {message}")

class SmsNotification(Notification):
    def send(self, message): print(f"sms: {message}")


def notification_factory(kind: str) -> Notification:
    factories = {
        "email": EmailNotification,
        "sms": SmsNotification,
    }
    if kind not in factories:
        raise ValueError(f"Unknown notification: {kind}")
    return factories[kind]()
```

### Alternative — Abstract Factory

Quand on doit créer des **familles d'objets cohérents** :

```python
class UIComponentFactory(ABC):
    @abstractmethod
    def create_button(self) -> "Button": ...
    @abstractmethod
    def create_dialog(self) -> "Dialog": ...


class MacUIFactory(UIComponentFactory):
    def create_button(self): return MacButton()
    def create_dialog(self): return MacDialog()

class WindowsUIFactory(UIComponentFactory):
    def create_button(self): return WindowsButton()
    def create_dialog(self): return WindowsDialog()
```

### Pythonisation

En Python, un **dict de classes** suffit souvent :

```python
NOTIFICATIONS = {
    "email": EmailNotification,
    "sms": SmsNotification,
}

def create(kind: str) -> Notification:
    return NOTIFICATIONS[kind]()
```

Plus court. La hiérarchie de Factory n'est utile que quand on veut **étendre dynamiquement** ou **partager du code** entre factories.

### Quand l'éviter

- Si on a **2 ou 3 cas figés** : un `if/elif` reste OK.
- Si on n'a aucun besoin de découplage : instancier directement.

---

## 4. Decorator — structurel

### Intention

**Ajouter des comportements** à un objet **sans modifier sa classe**, en l'enveloppant dans un autre objet qui implémente la même interface.

**Analogie.** Un emballage cadeau. L'objet d'origine (un livre, une montre) garde sa nature. On y ajoute des couches (papier, ruban, étiquette). Le résultat reste utilisable comme un objet à offrir — mais avec des couches supplémentaires.

À ne pas confondre avec les **décorateurs Python** (cf. Python M6) — concept apparenté mais syntaxique.

### Cas d'usage

- Ajouter des fonctionnalités (logging, caching, retry) à un service existant sans le modifier.
- Composer des comportements dynamiquement.

### Implémentation

```python
from abc import ABC, abstractmethod


class Coffee(ABC):
    @abstractmethod
    def cost(self) -> float: ...
    @abstractmethod
    def description(self) -> str: ...


class SimpleCoffee(Coffee):
    def cost(self): return 2.0
    def description(self): return "Coffee"


class CoffeeDecorator(Coffee):
    def __init__(self, wrapped: Coffee):
        self.wrapped = wrapped


class Milk(CoffeeDecorator):
    def cost(self): return self.wrapped.cost() + 0.5
    def description(self): return self.wrapped.description() + " + milk"


class Sugar(CoffeeDecorator):
    def cost(self): return self.wrapped.cost() + 0.2
    def description(self): return self.wrapped.description() + " + sugar"


coffee = Sugar(Milk(SimpleCoffee()))
print(coffee.cost())          # 2.7
print(coffee.description())   # "Coffee + milk + sugar"
```

`Sugar` et `Milk` **ajoutent** au coût et à la description sans modifier `SimpleCoffee`. On peut empiler à volonté.

### Lien avec les décorateurs Python

```python
def retry(times: int):
    def decorator(fn):
        def wrapper(*args, **kwargs):
            for _ in range(times):
                try: return fn(*args, **kwargs)
                except: continue
        return wrapper
    return decorator

@retry(times=3)
def fetch(url): ...
```

C'est le **même concept** : enrober une fonction d'un comportement supplémentaire. La syntaxe `@` est juste plus concise.

### Quand l'éviter

- Si on a un nombre **fini** et **stable** d'options : ajouter les paramètres au constructeur (`SimpleCoffee(milk=True, sugar=True)`) est plus lisible.
- Si la composition de décorateurs devient **dépendante de l'ordre** (Sugar(Milk(...)) ≠ Milk(Sugar(...))), c'est un signal d'alerte.

---

## 5. Strategy — comportemental

### Intention

Encapsuler **plusieurs algorithmes interchangeables** sous une même interface, et permettre au client de choisir lequel utiliser au runtime.

**Analogie.** Le GPS qui propose plusieurs **itinéraires** : rapide, économique, scénique. La voiture (le contexte) ne change pas — c'est la stratégie de calcul d'itinéraire qui change.

### Cas d'usage

- Plusieurs algorithmes pour le même problème (tri, compression, chiffrement).
- Sélection au runtime selon des paramètres utilisateur.
- Couper les longs `if/elif` qui choisissent un comportement.

### Implémentation

```python
from abc import ABC, abstractmethod


class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: list) -> list: ...


class BubbleSort(SortStrategy):
    def sort(self, data):
        data = data.copy()
        n = len(data)
        for i in range(n):
            for j in range(n - 1):
                if data[j] > data[j+1]:
                    data[j], data[j+1] = data[j+1], data[j]
        return data


class QuickSort(SortStrategy):
    def sort(self, data):
        return sorted(data)


class Context:
    def __init__(self, strategy: SortStrategy):
        self.strategy = strategy

    def execute(self, data):
        return self.strategy.sort(data)


c = Context(QuickSort())
c.execute([3, 1, 4, 1, 5, 9, 2, 6])
c.strategy = BubbleSort()    # changement au runtime
```

### Alternative pythonique — fonctions de première classe

```python
def bubble_sort(data): ...
def quick_sort(data): ...


def execute(strategy: Callable[[list], list], data: list):
    return strategy(data)


execute(quick_sort, [3, 1, 4])
```

Python traite les **fonctions comme des objets**. Pas besoin de hiérarchie de classes pour passer des "stratégies".

### Lien avec OCP

Strategy implémente **directement** le Open/Closed Principle (M5) : ajouter une nouvelle stratégie = créer une nouvelle classe sans toucher au reste.

---

## 6. Observer — comportemental

### Intention

Définir une dépendance **un-à-plusieurs** où, quand un objet (le sujet) change d'état, tous ses **observateurs** sont notifiés automatiquement.

**Analogie.** Une newsletter. Le journal (sujet) publie une édition. Tous les abonnés (observateurs) la reçoivent automatiquement. Les abonnés ne **demandent pas** la nouvelle — ils sont **prévenus**.

### Cas d'usage

- Système d'événements (UI, jeux).
- Pub/sub interne.
- Mise à jour de plusieurs vues quand un modèle change (MVC).
- Hooks d'extension.

### Implémentation

```python
from typing import Protocol


class Observer(Protocol):
    def update(self, event: dict): ...


class Subject:
    def __init__(self):
        self._observers: list[Observer] = []

    def attach(self, observer: Observer):
        self._observers.append(observer)

    def detach(self, observer: Observer):
        self._observers.remove(observer)

    def notify(self, event: dict):
        for o in self._observers:
            o.update(event)


class Logger:
    def update(self, event): print(f"log: {event}")

class Emailer:
    def update(self, event): print(f"send email about: {event}")


subject = Subject()
subject.attach(Logger())
subject.attach(Emailer())
subject.notify({"type": "user_signup", "user_id": 42})
```

### Variantes

- **Push** (illustré ci-dessus) — le sujet envoie l'événement complet aux observateurs.
- **Pull** — le sujet notifie seulement, les observateurs viennent lire son état.

### Alternative pythonique — callbacks

```python
class Subject:
    def __init__(self):
        self._callbacks: list[Callable] = []

    def on_change(self, cb): self._callbacks.append(cb)

    def trigger(self, event):
        for cb in self._callbacks:
            cb(event)


s = Subject()
s.on_change(lambda e: print(f"log: {e}"))
s.on_change(lambda e: print(f"email: {e}"))
```

Plus léger, et tout aussi expressif pour les cas simples.

---

## 7. Iterator — comportemental

### Intention

Fournir un **accès séquentiel** aux éléments d'une collection sans exposer sa **structure interne**.

**Analogie.** Le ticket de file d'attente. Tu obtiens "le suivant" sans connaître la structure interne (file, pile, deque, liste chaînée).

### Cas d'usage

- Parcourir une structure complexe (arbre, graphe, base de données).
- Cacher la représentation interne.
- Permettre plusieurs parcours indépendants.

### En Python — natif

Python a **intégré** l'Iterator dans la syntaxe :

```python
for item in collection:
    ...
```

Cette syntaxe appelle implicitement `iter(collection)` puis `next(iterator)`. Les patterns ne sont donc **presque jamais à implémenter à la main** — il suffit de respecter le protocole `__iter__` et `__next__`.

### Implémentation

```python
class CountDown:
    def __init__(self, start: int):
        self.current = start

    def __iter__(self):
        return self

    def __next__(self):
        if self.current <= 0:
            raise StopIteration
        value = self.current
        self.current -= 1
        return value


for n in CountDown(3):
    print(n)   # 3, 2, 1
```

### Avec un générateur (plus pythonique)

```python
def countdown(start: int):
    while start > 0:
        yield start
        start -= 1


for n in countdown(3):
    print(n)
```

Les **générateurs** sont la forme moderne et concise. Réserver l'iterator avec classes complète quand on a besoin d'état complexe ou de plusieurs itérateurs simultanés.

### Cas plus riche — arbre

```python
class TreeNode:
    def __init__(self, value, children=None):
        self.value = value
        self.children = children or []

    def __iter__(self):
        yield self.value
        for child in self.children:
            yield from iter(child)


tree = TreeNode(1, [TreeNode(2, [TreeNode(4)]), TreeNode(3)])
list(tree)   # [1, 2, 4, 3]
```

`yield from` est l'idiome pour déléguer à un sous-itérateur. Lisible et performant.

---

## 8. State — comportemental

### Intention

Permettre à un objet de **changer son comportement** quand son état interne change. L'objet "semble" changer de classe.

**Analogie.** L'humeur d'une personne. "Dire bonjour" produit un résultat différent selon l'état (joyeux : grand sourire ; déprimé : marmonnement ; en colère : grommellement). Le **même message** (la salutation) déclenche des comportements distincts.

### Cas d'usage

- Machine à états (commandes, transactions).
- Workflow avec étapes (brouillon → en revue → publié → archivé).
- Logique conditionnelle complexe basée sur un état.

### Implémentation — sans pattern

```python
class Order:
    def __init__(self):
        self.state = "draft"

    def pay(self):
        if self.state == "draft":
            self.state = "paid"
            print("Order paid")
        elif self.state == "paid":
            print("Already paid")
        elif self.state == "cancelled":
            raise ValueError("Cannot pay a cancelled order")
```

Avec 5 méthodes (pay, ship, cancel, refund, archive) et 5 états, on a 25 branches. Ingérable.

### Implémentation — avec le pattern State

```python
from abc import ABC, abstractmethod


class OrderState(ABC):
    @abstractmethod
    def pay(self, order): ...
    @abstractmethod
    def cancel(self, order): ...


class DraftState(OrderState):
    def pay(self, order):
        order.state = PaidState()
        print("Order paid")

    def cancel(self, order):
        order.state = CancelledState()
        print("Order cancelled")


class PaidState(OrderState):
    def pay(self, order):
        print("Already paid")

    def cancel(self, order):
        order.state = CancelledState()
        order.refund()
        print("Order refunded and cancelled")


class CancelledState(OrderState):
    def pay(self, order):
        raise ValueError("Cannot pay a cancelled order")

    def cancel(self, order):
        print("Already cancelled")


class Order:
    def __init__(self):
        self.state: OrderState = DraftState()

    def pay(self): self.state.pay(self)
    def cancel(self): self.state.cancel(self)
    def refund(self): print("Refunding...")
```

Chaque état encapsule **ses propres règles** de transition. Ajouter un état = ajouter une classe, sans modifier les autres (OCP).

### Quand l'utiliser

- Machine à états avec **3+ états** ET **plusieurs comportements** par état.
- Quand on accumule des `if/elif` sur un attribut `state`.

Pour 2 états simples, un boolean reste OK.

---

## 9. Tableau de synthèse

| Pattern   | Famille        | Question                                | Alternative pythonique       |
| --------- | -------------- | --------------------------------------- | ---------------------------- |
| Singleton | Créationnel    | "Une seule instance ?"                  | Module Python                |
| Factory   | Créationnel    | "Comment créer sans coupler ?"          | Dict de classes              |
| Decorator | Structurel     | "Comment enrichir sans modifier ?"      | Décorateur Python (`@`)      |
| Strategy  | Comportemental | "Quel algo choisir au runtime ?"        | Fonctions de première classe |
| Observer  | Comportemental | "Notifier plusieurs abonnés ?"          | Callbacks, signaux Django/Qt |
| Iterator  | Comportemental | "Parcourir sans exposer la structure ?" | Générateurs (`yield`)        |
| State     | Comportemental | "Comportement variable selon état ?"    | Dict de fonctions            |

---

## 10. Exercices pratiques

### Exercice 1 — Identifier le pattern (≈ 25 min)

Pour chaque code, identifier le pattern et la famille :

```python
# Cas A
class Database:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
```

```python
# Cas B
class Sender(Protocol):
    def send(self, msg): ...

def make_sender(kind: str) -> Sender:
    return {"email": EmailSender, "sms": SmsSender}[kind]()
```

```python
# Cas C
class TimedDecorator:
    def __init__(self, target):
        self.target = target
    def execute(self):
        start = time.time()
        result = self.target.execute()
        print(f"took {time.time() - start:.2f}s")
        return result
```

```python
# Cas D
class Cart:
    def __init__(self):
        self.listeners = []

    def add_item(self, item):
        # ...
        for l in self.listeners:
            l.notify("item_added", item)
```

### Exercice 2 — Refactor en Factory (≈ 25 min)

Soit :

```python
def create_payment(kind, data):
    if kind == "card":
        return {"type": "card", "card_number": data["number"]}
    elif kind == "transfer":
        return {"type": "transfer", "iban": data["iban"]}
    elif kind == "wallet":
        return {"type": "wallet", "wallet_id": data["id"]}
    else:
        raise ValueError("Unknown")
```

Refactorer avec :

1. Une classe abstraite `PaymentMethod`.
2. Trois classes concrètes.
3. Une factory `create_payment(kind, data)` qui retourne un `PaymentMethod`.

### Exercice 3 — Strategy interchangeable (≈ 30 min)

Implémenter un système de **compression** :

- `CompressionStrategy` (abstract) avec `compress(data: bytes) -> bytes`.
- 3 implémentations : `GzipCompression`, `Bz2Compression`, `NoOpCompression`.
- `FileSaver(strategy)` qui utilise la strategy choisie.

Démontrer le changement de stratégie au runtime.

**Bonus** : réécrire l'exercice sans classes, juste avec des fonctions (`Callable[[bytes], bytes]`). Comparer les deux versions.

### Exercice 4 — Observer simple (≈ 30 min)

Implémenter un système d'événements pour un blog :

- `Post.publish()` notifie ses observateurs.
- Observateurs : `EmailNotifier` (envoie un email aux abonnés), `RssGenerator` (régénère le flux RSS), `Analytics` (compte les publications).

Tester avec 3 observateurs attachés. Vérifier que la suppression d'un observateur n'affecte pas les autres.

### Exercice 5 — Iterator d'arbre (≈ 30 min)

Implémenter une classe `Tree` :

- Chaque nœud a une `value` et une liste `children`.
- `__iter__` parcourt l'arbre **en profondeur** (DFS).
- Bonus : implémenter aussi `bfs()` qui parcourt en largeur (avec une queue).

Tester sur un arbre à 3 niveaux.

### Exercice 6 — State pour un Document (≈ 35 min)

Modéliser un cycle de vie de document :

États : `Draft`, `Review`, `Published`, `Archived`.

Transitions :

- `Draft.submit()` → `Review`.
- `Review.approve()` → `Published`.
- `Review.reject()` → `Draft`.
- `Published.archive()` → `Archived`.
- `Archived.restore()` → `Published`.

Implémenter avec le pattern State (une classe par état).

---

## 11. Mini-défi de synthèse — 2 patterns dans un cas réel (≈ 2 à 3 heures)

Choisir un domaine et implémenter **2 patterns** au minimum.

**Exemples de domaines** :

1. **Système de notification** — Factory (créer les canaux) + Observer (notifier plusieurs canaux à la fois).
2. **Pipeline de transformation de données** — Strategy (algorithme de transformation) + Decorator (ajouter logging/cache).
3. **Moteur de jeu** — State (états du joueur) + Observer (réactions des entités).
4. **API de paiement** — Factory (créer les payment methods) + Strategy (calcul des frais).

**Critères de validation** :

- [ ] Les 2 patterns sont identifiables sans ambiguïté.
- [ ] Chaque pattern est commenté avec son **intention** et son **rôle dans le code**.
- [ ] L'ajout d'un nouveau cas (canal, état, algorithme...) ne nécessite pas de modifier le code existant.
- [ ] Les anti-patterns (Singleton inutile, Factory pour 2 cas) sont évités — justifier en commentaire pourquoi le pattern est légitime ici.

---

## 12. Auto-évaluation

Le module M8 est validé lorsque :

- [ ] L'apprenant cite les 3 familles de patterns avec un exemple par famille.
- [ ] Il peut implémenter chacun des 7 patterns en moins de 15 minutes.
- [ ] Il identifie les patterns dans un code donné (au moins 4 sur 4 cas).
- [ ] Il connaît l'**alternative pythonique** pour chaque pattern (module / dict / fonction / générateur).
- [ ] Il sait justifier **quand un pattern est légitime** et quand il est over-engineering.
- [ ] Le mini-défi est implémenté avec 2 patterns documentés.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : familles de patrons de conception, principaux patterns (Singleton, Factory, Observer, Decorator, Strategy, Iterator, State).

---

## 13. Ressources complémentaires

- **Erich Gamma et al.** — _Design Patterns: Elements of Reusable Object-Oriented Software_ (1994). La référence canonique du Gang of Four.
- _Head First Design Patterns_ (Eric Freeman et al.) — version illustrée et accessible.
- **Refactoring Guru** : [refactoring.guru/design-patterns](https://refactoring.guru/design-patterns) — explications visuelles de chaque pattern.
- **Brandon Rhodes** — _Python Design Patterns_ (site web et conférences PyCon). Approche pragmatique, pythonique.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 10 — _Design Patterns with First-Class Functions_ (alternatives pythoniques).
- **Wikipedia** — _Software design pattern_ : index des patterns avec catégorisation.
