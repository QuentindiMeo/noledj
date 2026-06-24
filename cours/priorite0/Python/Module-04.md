# M4 — Outils de modélisation

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser `@dataclass` avec ses principales options (`init`, `repr`, `eq`, `order`, `frozen`, `slots`, `kw_only`).
- Maîtriser `field()` et ses paramètres (`default`, `default_factory`, `init`, `repr`, `compare`, `hash`).
- Concevoir des modèles **immuables** avec `frozen=True` et en comprendre les implications.
- Définir une **classe abstraite** avec `abc.ABC` et `@abstractmethod`.
- Choisir entre `dataclass`, `dataclass(frozen=True)`, `NamedTuple`, classe ordinaire et héritage abstrait selon le besoin.

## Durée estimée

1 à 1,5 jours.

## Pré-requis

- M2 terminé (dunders, hashable).
- M3 terminé (héritage, `super()`).
- Items du plan de remédiation visés : N3 #4 (dataclasses), #5 (frozen), #7 (abc).

---

## 1. Pourquoi `@dataclass` ?

### Le problème — le boilerplate

Voici une classe simple écrite "à la main" :

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point(x={self.x!r}, y={self.y!r})"

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))
```

Environ 20 lignes pour un objet qui ne fait que **porter de la donnée**. Le code est largement répétitif : `__init__`, `__repr__`, `__eq__`, `__hash__` sont des copies adaptées du même schéma.

**Analogie.** Remplir le même formulaire administratif pour chaque déménagement : nom, prénom, date de naissance, adresse... La forme du formulaire est connue, seules les valeurs changent. `dataclasses` automatise la forme.

### Version `dataclass`

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float
```

3 lignes. Python génère `__init__`, `__repr__`, `__eq__` automatiquement à partir des annotations de type. Pas de magie : c'est de la métaprogrammation qui réécrit le code à la création de la classe.

---

## 2. `@dataclass` — paramètres et `field()`

### Paramètres du décorateur

```python
@dataclass(
    init=True,         # générer __init__ ?
    repr=True,         # générer __repr__ ?
    eq=True,           # générer __eq__ ?
    order=False,       # générer __lt__, __le__, etc. ?
    unsafe_hash=False, # forcer __hash__ même si mutable ?
    frozen=False,      # immuable ?
    kw_only=False,     # tous les champs en keyword-only ?
    slots=False,       # générer __slots__ ?
)
class Cls:
    ...
```

Combinaisons fréquentes :

- `@dataclass` : valeur par défaut, comportement attendu dans 80 % des cas.
- `@dataclass(frozen=True)` : immuable, hashable gratuit.
- `@dataclass(order=True)` : ajout des opérateurs `<`, `<=`, `>`, `>=`.
- `@dataclass(slots=True)` : économie mémoire via `__slots__` (Python 3.10+).
- `@dataclass(kw_only=True)` : oblige à nommer les arguments à la construction — utile dès qu'on dépasse 3 ou 4 champs, et indispensable pour certains cas d'héritage (voir §4).

### `field()` pour configurer un champ

`field()` est la fonction qui permet de configurer un champ individuellement :

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class Article:
    title: str
    tags: list[str] = field(default_factory=list)       # default mutable
    likes: int = field(default=0, compare=False)        # ignoré dans __eq__
    _internal: str = field(default="", repr=False)      # caché du __repr__
    created_at: datetime = field(default_factory=datetime.now)
```

| Paramètre de `field()` | Effet                                                 |
| ---------------------- | ----------------------------------------------------- |
| `default`              | Valeur par défaut (immuable seulement)                |
| `default_factory`      | Factory qui produit la valeur par défaut (mutable OK) |
| `init`                 | Inclure dans `__init__`                               |
| `repr`                 | Afficher dans `__repr__`                              |
| `compare`              | Participer à `__eq__` / `__lt__`                      |
| `hash`                 | Participer à `__hash__`                               |
| `metadata`             | Données arbitraires (sérialisation, validation)       |

### Le piège du default mutable

```python
@dataclass
class Bad:
    items: list = []   # ✗ TypeError au démarrage : mutable default

@dataclass
class Good:
    items: list = field(default_factory=list)   # ✓
```

Python interdit le default mutable, parce qu'il serait partagé entre toutes les instances — un bug classique (analogue à celui des fonctions à default mutable : `def f(x=[]):`).

---

## 3. Frozen — objets immuables

### Théorie

`@dataclass(frozen=True)` empêche la modification des champs après l'instanciation. Toute tentative lève `FrozenInstanceError`.

**Analogie.** Un colis scellé : une fois fermé et envoyé, on ne peut plus en changer le contenu. Si le destinataire veut un colis différent, on en envoie un nouveau, on ne modifie pas l'ancien.

### Démonstration

```python
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

m = Money(10, "EUR")
# m.amount = 20      # FrozenInstanceError

# Pour "modifier", on crée une copie modifiée :
m2 = replace(m, amount=20)
print(m, m2)         # Money(amount=10, currency='EUR') Money(amount=20, currency='EUR')
```

`replace()` produit une nouvelle instance avec les champs spécifiés modifiés — c'est l'équivalent du _copy with_ fonctionnel.

### Pourquoi rendre les objets immuables ?

- **Hashable gratuit.** `frozen=True` génère automatiquement un `__hash__` cohérent avec `__eq__`.
- **Sécurité parallèle.** Un objet immuable est _thread-safe_ par construction — pas de race condition sur ses champs.
- **Raisonnement local.** Quand on lit du code, on sait qu'un objet immuable passé à une fonction ne sera pas modifié.
- **Mémoïsation possible.** Les objets immuables peuvent servir de clés de cache.

### Limites

- Coût mémoire (chaque "modification" alloue une nouvelle instance).
- Pas adapté aux objets dont les champs changent en permanence (compteurs, états de session).
- Les attributs eux-mêmes doivent être immuables pour que la garantie soit complète : un `frozen` qui contient une `list` peut voir cette `list` mutée silencieusement.

```python
@dataclass(frozen=True)
class WithList:
    items: list

w = WithList([1, 2])
# w.items = [3]    # FrozenInstanceError
w.items.append(3)  # ✓ — mais ça défait la garantie d'immutabilité
```

Pour une immutabilité vraie : préférer `tuple` à `list`, `frozenset` à `set`.

---

## 4. Héritage avec `dataclass`

### Cas simple

```python
@dataclass
class Animal:
    name: str
    age: int

@dataclass
class Dog(Animal):
    breed: str

d = Dog(name="Rex", age=5, breed="Labrador")
```

L'héritage fonctionne, et `Dog.__init__` accepte les champs des deux classes.

### Cas piégeux — default sur la classe parente

Si un champ parent a un default, **tous** les champs suivants (parents et enfants) doivent en avoir aussi :

```python
@dataclass
class Animal:
    name: str
    age: int = 0          # default

@dataclass
class Dog(Animal):
    breed: str            # ✗ TypeError: non-default argument 'breed' follows default argument
```

Solution avec `kw_only` :

```python
@dataclass(kw_only=True)
class Animal:
    name: str
    age: int = 0

@dataclass(kw_only=True)
class Dog(Animal):
    breed: str        # ✓ — l'ordre n'est plus contraint
```

`kw_only=True` rend les arguments nommés, ce qui évacue la règle "non-default avant default".

---

## 5. Classes abstraites — `abc.ABC` et `@abstractmethod`

### Théorie

Une classe abstraite définit un **contrat** : elle déclare des méthodes que ses sous-classes **doivent** implémenter, sans fournir l'implémentation elle-même. Tenter d'instancier directement une classe abstraite lève `TypeError`.

**Analogie.** Un contrat de location. Il stipule que le locataire doit payer un loyer mensuel, sans préciser le mode de paiement (virement, chèque, espèces). Chaque locataire concret décide comment honorer le contrat, mais aucun ne peut s'en exonérer.

### Syntaxe

```python
from abc import ABC, abstractmethod

class Storage(ABC):
    @abstractmethod
    def save(self, key: str, value: bytes) -> None: ...

    @abstractmethod
    def load(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None:
        """Méthode concrète — héritée par défaut, redéfinissable."""
        ...


class S3Storage(Storage):
    def save(self, key, value):
        ...  # implémentation S3

    def load(self, key):
        ...  # implémentation S3


# storage = Storage()    # TypeError: can't instantiate abstract class
storage = S3Storage()    # ✓
```

`Storage` ne peut pas être instanciée tant que `save` et `load` n'ont pas d'implémentation. `S3Storage` fournit les deux : elle est concrète et instanciable.

### Pourquoi pas une interface "informelle" ?

Sans `abc.ABC`, on pourrait écrire :

```python
class Storage:
    def save(self, key, value):
        raise NotImplementedError

    def load(self, key):
        raise NotImplementedError
```

Mais cette version :

- Permet l'instanciation directe (`Storage()`).
- Ne détecte l'oubli d'implémentation qu'à l'exécution (au moment où on appelle la méthode).

Avec `abc`, l'erreur est levée à **l'instanciation** — donc plus tôt et plus clairement.

### Combiner `@dataclass` et `abc.ABC`

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class Shape(ABC):
    name: str

    @abstractmethod
    def area(self) -> float: ...


@dataclass
class Circle(Shape):
    radius: float

    def area(self) -> float:
        return 3.14159 * self.radius ** 2


c = Circle(name="C1", radius=5)
print(c.area())          # 78.53975
# s = Shape(name="S1")   # TypeError
```

---

## 6. Choisir le bon outil

| Besoin                                         | Outil                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| Data holder simple, mutable                    | `@dataclass`                                       |
| Data holder simple, immuable                   | `@dataclass(frozen=True)`                          |
| Tuple avec champs nommés                       | `typing.NamedTuple` (équivalent fonctionnel léger) |
| Modèle avec validation à la construction       | Pydantic (cf. parcours FastAPI)                    |
| Optimisation mémoire pour beaucoup d'instances | `@dataclass(slots=True)`                           |
| Contrat polymorphique                          | `abc.ABC`                                          |
| Logique métier complexe (méthodes lourdes)     | Classe ordinaire                                   |

### `dataclass` vs `NamedTuple`

```python
from typing import NamedTuple
from dataclasses import dataclass

class P1(NamedTuple):       # tuple → indexable et immuable
    x: float
    y: float

@dataclass(frozen=True)
class P2:                   # plus flexible, supporte héritage, méthodes, post_init
    x: float
    y: float
```

`NamedTuple` :

- Hashable et immuable par défaut.
- Hérite de `tuple` — indexable (`p[0]`).
- Pas d'héritage flexible, peu de méthodes ajoutables facilement.

`dataclass(frozen=True)` :

- Plus expressif (héritage, `__post_init__`, méthodes, `field()`).
- Pas indexable.
- Légèrement plus lourd à instancier.

---

## 7. Exercices pratiques

### Exercice 1 — De la main au dataclass (≈ 15 min)

Convertir cette classe écrite "à la main" en `@dataclass` équivalente :

```python
class Order:
    def __init__(self, id, customer, items):
        self.id = id
        self.customer = customer
        self.items = items

    def __repr__(self):
        return f"Order(id={self.id!r}, customer={self.customer!r}, items={self.items!r})"

    def __eq__(self, other):
        if not isinstance(other, Order):
            return NotImplemented
        return (self.id, self.customer, self.items) == (other.id, other.customer, other.items)
```

**Bonus** : ajouter un champ `created_at` initialisé à `datetime.now()` par défaut.

### Exercice 2 — Configurer les `field()` (≈ 20 min)

Concevoir un `@dataclass User` avec :

- `id: int`
- `email: str`
- `tags: list[str]` par défaut `[]`, **non comparé** (`compare=False`).
- `password_hash: str` **caché** du `__repr__`.
- `created_at: datetime` initialisé à `datetime.now()` à chaque instanciation.

Vérifier :

- Le `repr` ne montre pas `password_hash`.
- `User(1, "a@b") == User(1, "a@b", tags=["x"])` est vrai (tags ignorés).
- Deux utilisateurs créés à un instant différent ne sont pas égaux si on ne marque pas `created_at` avec `compare=False`.

### Exercice 3 — Frozen et `replace` (≈ 20 min)

Concevoir une `@dataclass(frozen=True) Config` avec :

- `host: str`
- `port: int`
- `tls: bool = True`

Démontrer :

1. Une modification directe (`config.port = 80`) lève `FrozenInstanceError`.
2. `replace(config, port=8443)` produit une nouvelle instance avec `port=8443`.
3. Un `set` de `Config` élimine les doublons (puisqu'immuable et hashable).

### Exercice 4 — Interface abstraite (≈ 30 min)

Définir une classe abstraite `Notifier` avec :

- `@abstractmethod def send(self, recipient: str, message: str) -> bool`
- `@property` + `@abstractmethod def name(self) -> str` (propriété abstraite)

Implémenter deux notifications concrètes :

- `EmailNotifier(Notifier)`
- `SmsNotifier(Notifier)`

Écrire une fonction `broadcast(notifiers: list[Notifier], recipient, message)` qui appelle `send` sur chaque notifier et collecte les résultats dans un dict `{notifier.name: bool}`.

### Exercice 5 — Composition dataclass + abc (≈ 30 min)

Reprendre la classe `Shape` abstraite et créer :

- `Circle(Shape)` avec `radius` et `area()`.
- `Rectangle(Shape)` avec `width`, `height` et `area()`.
- `Triangle(Shape)` avec `base`, `height` et `area()`.

Toutes en `@dataclass(frozen=True)`. Écrire un test qui range une liste de shapes par aire croissante via `sorted(shapes, key=lambda s: s.area())`.

---

## 8. Mini-défi de synthèse (≈ 1 à 2 heures)

Modéliser un système de paiements en utilisant **tous** les outils du module :

- `@dataclass(frozen=True) Money` avec `amount: int` (en cents) et `currency: str`.
- Classe abstraite `PaymentMethod(ABC)` :
  - `@abstractmethod def charge(self, amount: Money) -> str` (renvoie un id de transaction).
  - `@abstractmethod def refund(self, transaction_id: str) -> bool`.
- Trois implémentations : `CreditCardPayment`, `BankTransferPayment`, `WalletPayment` (chacune `@dataclass` avec leurs champs propres).
- `@dataclass OrderItem` avec `sku`, `quantity`, `unit_price: Money`.
- `@dataclass Order` avec `id`, `items: list[OrderItem]`, `total: Money` calculé via `__post_init__`, et `method: PaymentMethod`.

Validation — ce code doit fonctionner :

```python
items = [OrderItem(sku="A", quantity=2, unit_price=Money(500, "EUR"))]
order = Order(id="O-1", items=items, method=CreditCardPayment(card="4242..."))
print(order.total)                  # Money(amount=1000, currency='EUR')

tx_id = order.method.charge(order.total)
assert order.method.refund(tx_id) is True
```

---

## 9. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant peut convertir une classe "à la main" en `@dataclass` équivalente.
- [ ] Les paramètres `default_factory`, `compare`, `repr` de `field()` sont maîtrisés.
- [ ] L'apprenant connaît au moins trois raisons d'utiliser `frozen=True`.
- [ ] Le piège du default mutable est identifié.
- [ ] L'apprenant peut définir et utiliser une `abc.ABC` avec `@abstractmethod`.
- [ ] Le mini-défi paiement passe les assertions de validation.
- [ ] L'apprenant peut motiver le choix entre `dataclass`, `dataclass(frozen=True)`, `NamedTuple` et classe ordinaire.

**Items du glossaire visés** (passage P/N → A) : N3 #4 (dataclasses), #5 (frozen), #7 (abc).

---

## 10. Ressources complémentaires

- **Documentation officielle** : _dataclasses_ — [docs.python.org/3/library/dataclasses.html](https://docs.python.org/3/library/dataclasses.html).
- **Documentation officielle** : _abc_ — [docs.python.org/3/library/abc.html](https://docs.python.org/3/library/abc.html).
- **PEP 557** — la PEP qui a introduit `dataclasses` en Python 3.7 (motivation et design).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 5 — _Data Class Builders_.
- **Real Python** — articles _Data Classes in Python 3.7+_ et _Abstract Base Classes in Python_.
