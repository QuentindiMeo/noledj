# M11 — Généricité

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir des **fonctions** et **classes génériques** via `TypeVar` et `Generic`.
- Distinguer **contraintes par énumération** et **contraintes par borne** (`bound=`).
- Comprendre les bases de la **variance** (covariance, contravariance, invariance).
- Utiliser la **nouvelle syntaxe PEP 695** (Python 3.12+).
- Reconnaître les **cas d'usage pertinents** et les **anti-patterns** (généricité non nécessaire).

## Durée estimée

1 jour.

## Pré-requis

- M1 à M10 POO terminés.
- Parcours Python M7 (typing et `mypy --strict`) recommandé.

---

## 1. Rappel et motivation

### Le besoin

Reprendre la classe `Stack` du parcours Python M7 :

```python
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item): self._items.append(item)
    def pop(self): return self._items.pop()
```

Cette `Stack` accepte n'importe quoi : `int`, `str`, `dict`. Pratique, mais on ne peut pas garantir au type checker que les éléments seront cohérents.

Au moment où le code grandit, on veut :

- Une `Stack` qui ne contient **que des `int`**.
- Une `Stack` qui ne contient **que des `User`**.
- Le **même code** pour les deux.

C'est le **polymorphisme paramétrique** (M7) : un même code, plusieurs types.

**Analogie.** Une caisse de transport. Que tu y mettes des livres, des fruits ou des outils, le mécanisme de transport est le même. Le **type** est paramétrable ; la **forme** est commune.

---

## 2. `TypeVar` — la brique de base

### Théorie

Un `TypeVar` est une **variable de type** : un nom qui représente un type sans préciser lequel. Le type checker l'unifie en fonction du contexte.

```python
from typing import TypeVar

T = TypeVar("T")


def first(items: list[T]) -> T:
    return items[0]


first([1, 2, 3])         # T = int  → renvoie int
first(["a", "b"])        # T = str  → renvoie str
first([1.0, 2.0])        # T = float
```

Le type de retour est **lié au type d'entrée**. C'est précis sans dupliquer la fonction.

### Sans `TypeVar`

```python
def first(items: list) -> Any:
    return items[0]
```

`Any` détruit le typage : le retour n'a plus aucune info. Tout appel au retour peut être n'importe quoi. **Évitez `Any`** quand un `TypeVar` est applicable.

### Plusieurs `TypeVar`

```python
K = TypeVar("K")
V = TypeVar("V")


def swap_pair(pair: tuple[K, V]) -> tuple[V, K]:
    a, b = pair
    return b, a


swap_pair((1, "hello"))   # tuple[str, int]
```

Deux paramètres de type indépendants. Le type checker tient chaque variable séparée.

---

## 3. Classes génériques — `Generic[T]`

### Théorie

Pour qu'une **classe** soit paramétrée, on l'hérite de `Generic[T]` :

```python
from typing import Generic, TypeVar

T = TypeVar("T")


class Stack(Generic[T]):
    def __init__(self):
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

    def peek(self) -> T:
        return self._items[-1]

    def __len__(self) -> int:
        return len(self._items)


int_stack: Stack[int] = Stack()
int_stack.push(1)
int_stack.push("oops")    # ✗ mypy : "oops" n'est pas int

str_stack: Stack[str] = Stack()
str_stack.push("hello")
```

`Stack[int]` et `Stack[str]` partagent **le même code**, mais le type checker garantit que chaque instance reste cohérente.

### Lien avec l'héritage

Une classe peut hériter d'un `Generic[T]` paramétré :

```python
class IntStack(Stack[int]):    # spécialisation
    def sum(self) -> int:
        return sum(self._items)
```

`IntStack` est `Stack[int]` ; `T` est fixé à `int`.

### Avec plusieurs paramètres

```python
K = TypeVar("K")
V = TypeVar("V")


class Cache(Generic[K, V]):
    def __init__(self):
        self._data: dict[K, V] = {}

    def get(self, key: K) -> V | None:
        return self._data.get(key)

    def set(self, key: K, value: V) -> None:
        self._data[key] = value


user_cache: Cache[int, "User"] = Cache()
config_cache: Cache[str, str] = Cache()
```

`Cache[K, V]` accepte deux types. Mypy / pyright propage les bonnes contraintes.

---

## 4. Contraintes — `bound=` et énumération

### Pourquoi contraindre

`TypeVar("T")` accepte **tout type**. C'est souvent trop permissif. On veut parfois dire :

- "T doit être **comparable**" (supporte `<`).
- "T doit être un **`int` ou un `float`**" (mais pas `str`).
- "T doit hériter de **`BaseModel`**".

Deux mécanismes répondent à ces besoins.

### Énumération de types (`constrained`)

```python
from typing import TypeVar

Number = TypeVar("Number", int, float)


def double(x: Number) -> Number:
    return x * 2


double(3)          # int → int
double(3.5)        # float → float
double("hello")    # ✗ mypy : str pas autorisé
```

`T = TypeVar("T", A, B, C)` : T peut **uniquement** être A, B ou C. Aucun sous-type.

### Borne supérieure (`bound=`)

```python
from typing import TypeVar, Protocol


class Comparable(Protocol):
    def __lt__(self, other) -> bool: ...


C = TypeVar("C", bound=Comparable)


def maximum(items: list[C]) -> C:
    best = items[0]
    for item in items[1:]:
        if best < item:
            best = item
    return best


maximum([3, 1, 4, 1, 5])      # int est comparable → int
maximum(["b", "a", "c"])      # str est comparable → str
```

`bound=Comparable` : T doit être **un sous-type ou implémenter** `Comparable`. Plus souple que l'énumération — on accepte n'importe quoi qui respecte le protocole.

### Choisir entre les deux

| Cas                                                             | Outil                                 |
| --------------------------------------------------------------- | ------------------------------------- |
| Liste fermée et finie de types autorisés                        | `TypeVar("T", A, B, C)` (énumération) |
| Tout type respectant une **interface** ou héritant d'une classe | `TypeVar("T", bound=...)`             |

**Analogie** :

- L'énumération est une **liste blanche** : "seulement ces personnes ont l'accès".
- La borne est une **carte d'accès** : "toute personne ayant le bon badge entre".

---

## 5. Variance — un avant-goût

### Le problème

Si `Cat` hérite de `Animal`, est-ce que `list[Cat]` est un sous-type de `list[Animal]` ?

Réponse mathématique : ça dépend de la **variance** du type générique.

| Cas                                                      | Nom                | Réponse               |
| -------------------------------------------------------- | ------------------ | --------------------- |
| `Container[Cat]` est un sous-type de `Container[Animal]` | **Covariance**     | Si on lit seulement   |
| `Container[Animal]` est un sous-type de `Container[Cat]` | **Contravariance** | Si on écrit seulement |
| Ni l'un ni l'autre                                       | **Invariance**     | Si on lit ET on écrit |

Les **lists Python** (`list[T]`) sont **invariantes** : on lit ET on écrit dedans. Donc `list[Cat]` n'est **pas** un sous-type de `list[Animal]`, et inversement.

### Démonstration

```python
class Animal: ...
class Cat(Animal): ...


def feed_all(animals: list[Animal]):
    for a in animals:
        feed(a)


cats: list[Cat] = [Cat(), Cat()]
feed_all(cats)    # ✗ mypy : list[Cat] n'est pas list[Animal]
```

Bizarre ? Pas tant que ça. Si `feed_all` faisait `animals.append(Dog())`, la `list[Cat]` initiale se retrouverait avec un `Dog` dedans. L'invariance protège contre ça.

### Solutions

Si la fonction **lit seulement** la liste, utiliser `Sequence` (qui est covariante) au lieu de `list` :

```python
from typing import Sequence


def count_animals(animals: Sequence[Animal]) -> int:
    return len(animals)


count_animals([Cat(), Cat()])   # ✓ Sequence est covariante
```

Ou définir un TypeVar :

```python
def count(items: list[T]) -> int:
    return len(items)


count([Cat(), Cat()])    # T = Cat, fonctionne
```

### Pour aller plus loin

La variance est un sujet riche. Pour la majorité du code applicatif :

- Préférer `Sequence` / `Iterable` / `Mapping` quand on **lit** seulement.
- Garder `list` / `dict` / `set` quand on **écrit** aussi.
- Utiliser un `TypeVar` quand on veut conserver le type d'entrée.

Approfondissement formel : PEP 484 section _Variance_, ou _Fluent Python_ (chapitre 15).

---

## 6. PEP 695 — la syntaxe moderne

### Python 3.12+

Depuis Python 3.12, la syntaxe se simplifie radicalement :

```python
# Avant Python 3.12
from typing import TypeVar, Generic

T = TypeVar("T")

class Stack(Generic[T]):
    ...


# Python 3.12+
class Stack[T]:
    ...
```

Plus de `TypeVar`, plus de `Generic`. La déclaration est dans la signature.

### Fonctions génériques

```python
# Avant
T = TypeVar("T")
def first(items: list[T]) -> T:
    return items[0]


# Python 3.12+
def first[T](items: list[T]) -> T:
    return items[0]
```

### Bornes et contraintes

```python
def maximum[C: Comparable](items: list[C]) -> C:
    ...

def double[N: (int, float)](x: N) -> N:
    ...
```

Plus concis. **À utiliser pour tout nouveau code en Python 3.12+**.

### Type alias

```python
type UserId = int
type StringDict[V] = dict[str, V]


users: StringDict[str] = {}
```

---

## 7. Cas d'usage pertinents

### Cas 1 — Conteneurs typés

Le plus évident. `Stack[T]`, `Queue[T]`, `Tree[T]`, `Result[T]`...

### Cas 2 — Fonctions utilitaires

```python
def first_or_default[T](items: list[T], default: T) -> T:
    return items[0] if items else default


def find[T](items: list[T], predicate: Callable[[T], bool]) -> T | None:
    for item in items:
        if predicate(item):
            return item
    return None
```

Le type de retour reste **lié** au type d'entrée.

### Cas 3 — Repository / DAO

```python
from typing import Generic, TypeVar
from abc import ABC, abstractmethod

T = TypeVar("T")
ID = TypeVar("ID")


class Repository(Generic[T, ID], ABC):
    @abstractmethod
    def get(self, id: ID) -> T | None: ...
    @abstractmethod
    def save(self, entity: T) -> None: ...
    @abstractmethod
    def delete(self, id: ID) -> bool: ...


class UserRepository(Repository[User, int]):
    def get(self, id: int) -> User | None: ...
    def save(self, entity: User) -> None: ...
    def delete(self, id: int) -> bool: ...
```

Pattern courant en architecture hexagonale (M10). Un seul `Repository[T, ID]` couvre tous les cas.

### Cas 4 — Result / Either

Pattern fonctionnel : encapsuler le succès ou l'échec dans un type.

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")
E = TypeVar("E")


@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T


@dataclass(frozen=True)
class Err(Generic[E]):
    error: E


Result = Ok[T] | Err[E]


def divide(a: float, b: float) -> Result[float, str]:
    if b == 0:
        return Err("Division by zero")
    return Ok(a / b)


r = divide(10, 0)
match r:
    case Ok(value): print(value)
    case Err(error): print(error)
```

Type-safe, sans exceptions, idiomatique en Rust/Scala — transposable en Python.

### Cas 5 — Builder / fluent API

```python
class QueryBuilder[T]:
    def __init__(self, entity: type[T]):
        self.entity = entity
        self.filters: list = []

    def filter(self, condition) -> "QueryBuilder[T]":
        self.filters.append(condition)
        return self

    def all(self) -> list[T]:
        # exécution
        return []


users = QueryBuilder(User).filter(...).filter(...).all()    # list[User]
```

Le `filter().filter()` reste typé `QueryBuilder[T]`, et `.all()` renvoie `list[T]`.

---

## 8. Anti-patterns et limites

### Anti-pattern 1 — Généricité non nécessaire

```python
T = TypeVar("T")

class UserService(Generic[T]):           # ✗ T n'est jamais utilisé
    def __init__(self, db: T):
        self.db = db
```

Si `T` n'apporte **rien** au typage, ne pas l'introduire. La généricité a un coût cognitif.

### Anti-pattern 2 — Forcer un seul type

```python
class Stack[T]:
    def __init__(self):
        self._items: list[T] = []

    @classmethod
    def of_ints(cls) -> "Stack[int]":     # ✗ pourquoi pas un constructeur normal ?
        return cls()
```

Si on a besoin d'un constructeur spécifique pour un type donné, faire une **classe dédiée** ou utiliser `Stack[int]()`.

### Anti-pattern 3 — Variance mal comprise

```python
def feed_all(animals: list[Animal]):    # invariant
    ...

feed_all([Cat(), Cat()])    # mypy refuse
```

Si on lit seulement, utiliser `Sequence` ou un `TypeVar`. Ne pas désactiver mypy par frustration.

### Limite — Runtime

Les types Python ne sont **pas** vérifiés au runtime sauf via outils externes (Pydantic, mypy, pyright). Un `Stack[int]` peut recevoir un `str` à l'exécution **sans erreur** :

```python
s: Stack[int] = Stack()
s.push("hello")    # à l'exécution : ça marche
                    # à la vérification mypy : erreur
```

C'est par design. Python conserve sa flexibilité runtime, tout en offrant un typage statique optionnel.

### Limite — Erasure partielle

Les paramètres de type **ne sont pas** disponibles au runtime de manière fiable :

```python
class Stack(Generic[T]):
    def __init__(self):
        # type(self) → <class 'Stack'>
        # type(self).__type_params__ → (T,)
        # mais le T réel n'est pas accessible facilement
        ...
```

Pour les besoins introspectifs (sérialisation, validation), des libs comme `typing.get_type_hints` ou Pydantic gèrent ça. Mais ne pas s'attendre à un `instanceof Stack[int]` qui marche.

---

## 9. Exercices pratiques

### Exercice 1 — Fonction générique simple (≈ 20 min)

Écrire trois fonctions génériques :

1. `first[T](items: list[T]) -> T | None`.
2. `swap[A, B](pair: tuple[A, B]) -> tuple[B, A]`.
3. `compose[A, B, C](f: Callable[[B], C], g: Callable[[A], B]) -> Callable[[A], C]`.

Vérifier en mypy strict que les types sont préservés à travers les compositions.

### Exercice 2 — `Stack[T]` typée (≈ 25 min)

Implémenter `Stack[T]` avec :

- `push`, `pop`, `peek`, `__len__`, `__iter__`.
- Test : `Stack[int]` rejette `push("string")` en mypy strict.

**Bonus** : ajouter `map[U]` qui transforme `Stack[T]` en `Stack[U]` via une fonction `Callable[[T], U]`.

### Exercice 3 — Contraintes (≈ 25 min)

Implémenter trois versions de `maximum` :

1. `maximum[T]` (sans contrainte) — fonctionne... mais mypy se plaint sur `<`.
2. `maximum[T: Comparable]` avec un Protocol.
3. `maximum[N: (int, float)]` — fonctionne seulement pour les nombres.

Comparer : quels arguments acceptent chaque version ?

### Exercice 4 — Repository générique (≈ 30 min)

Implémenter le pattern Repository générique :

```python
class Repository[T, ID](ABC):
    @abstractmethod
    def get(self, id: ID) -> T | None: ...
    @abstractmethod
    def save(self, entity: T) -> None: ...
```

Puis créer deux implémentations en mémoire :

- `UserRepository(Repository[User, int])`.
- `OrderRepository(Repository[Order, str])`.

Tester avec mypy strict.

### Exercice 5 — Result type (≈ 30 min)

Implémenter `Result[T, E] = Ok[T] | Err[E]` (cf. section 7).

Écrire trois fonctions qui renvoient des `Result` :

- `divide(a, b) -> Result[float, str]`.
- `parse_int(s) -> Result[int, str]`.
- `find_user(id) -> Result[User, str]`.

**Bonus** : implémenter `map[T, E, U](r: Result[T, E], fn: Callable[[T], U]) -> Result[U, E]`.

---

## 10. Mini-défi de synthèse — conteneur typé générique (≈ 2 heures)

Implémenter une classe **`CircularBuffer[T]`** :

**Spécifications** :

- Taille fixe `capacity` (entier passé au constructeur).
- Méthode `push(item: T) -> None` — ajoute un élément. Si plein, écrase le plus ancien.
- Méthode `pop() -> T | None` — récupère et supprime le plus ancien.
- Méthode `peek() -> T | None` — récupère sans supprimer.
- `__iter__` — itère du plus ancien au plus récent.
- `__len__` — nombre d'éléments actuels.
- `is_full() -> bool`.

**Test attendu** :

```python
buf: CircularBuffer[int] = CircularBuffer(3)
buf.push(1)
buf.push(2)
buf.push(3)
buf.push(4)            # écrase 1
list(buf)              # [2, 3, 4]
buf.pop()              # 2
list(buf)              # [3, 4]


buf_str: CircularBuffer[str] = CircularBuffer(2)
buf_str.push("hello")
buf_str.push(42)       # ✗ mypy strict refuse
```

**Critères de validation** :

- [ ] Le code passe **mypy --strict** sans erreur ni `# type: ignore`.
- [ ] La classe est utilisable avec **3 types différents** (`int`, `str`, un dataclass) dans le test.
- [ ] Au moins une méthode utilise une **borne ou une contrainte** (par exemple, version `map[U]` qui transforme via une fonction).
- [ ] Documentation : un commentaire au début explique le rôle de `T`.

**Bonus** :

- Utiliser la syntaxe **PEP 695** (Python 3.12+).
- Ajouter une variante `ComparableCircularBuffer[T: Comparable]` qui expose un `min()` et un `max()`.

---

## 11. Auto-évaluation

Le module M11 est validé lorsque :

- [ ] L'apprenant peut écrire une fonction générique avec `TypeVar` (ancienne syntaxe).
- [ ] Il peut écrire une classe générique avec `Generic[T]` (ancienne syntaxe).
- [ ] Il maîtrise la syntaxe **PEP 695** (Python 3.12+).
- [ ] Il distingue **bound** et **constrained** TypeVar et choisit selon le contexte.
- [ ] Il comprend les bases de la **variance** (covariance, contravariance, invariance).
- [ ] Il connaît 3 cas d'usage pertinents (conteneur, repository, result type).
- [ ] Le mini-défi `CircularBuffer[T]` passe mypy --strict.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : classe générique / généricité.
- **N3** : classe générique dans un contexte adapté à son usage.

---

## 12. Ressources complémentaires

- **PEP 484** — _Type Hints_ (section _Generics_).
- **PEP 695** — _Type Parameter Syntax_ (Python 3.12+).
- **Documentation Python** : `typing.TypeVar`, `typing.Generic`, `typing.Protocol`.
- **mypy documentation** — section _Generics_.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 15 — _More about Type Hints_ (variance, generics avancées).
- **Real Python** — articles _Python Type Checking - Generics_ et _Python Generics_.
- **Microsoft pyright** — implémentation rapide et stricte des génériques Python.
