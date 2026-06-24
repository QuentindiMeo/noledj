# M2 — Modèle de classe avancé

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer le mécanisme de **visibilité** Python (`_`, `__`) et ses limites réelles (name mangling).
- Implémenter les **méthodes dunder** essentielles d'une classe custom : `__init__`, `__repr__`, `__eq__`, `__hash__`, `__lt__`, `__add__`, etc.
- Distinguer **`@classmethod` et `@staticmethod`** et savoir lequel utiliser dans quel cas.
- Construire une classe **hashable** correcte (les 4 règles d'or).
- Utiliser des **mixins** pour composer du comportement sans héritage profond.

## Durée estimée

1,5 à 2 jours (concepts denses, validation par exercices courts puis mini-défi de synthèse).

## Pré-requis

- M1 terminé : items du plan de remédiation pour M2 identifiés (N3 #11, #15, #16, #18, #19).
- Maîtrise OK des classes Python : `__init__`, héritage simple, méthodes d'instance.

---

## 1. Visibilité — un panneau, pas une serrure

### Théorie

Python n'a pas de modificateur d'accès strict (pas de `private` au sens Java ou C++). Il utilise des **conventions de nommage** :

- `attribut` : public — utilisable partout, sans contrainte.
- `_attribut` (un underscore initial) : "privé par convention" — c'est un signal au lecteur : _ne touche pas, ce n'est pas une API stable_. Aucun mécanisme technique ne l'empêche.
- `__attribut` (deux underscores initiaux) : déclenche le **name mangling** — Python renomme silencieusement l'attribut en `_ClassName__attribut` pour éviter les collisions lors de l'héritage. Ce n'est pas de la confidentialité, c'est de l'anti-collision.

**Analogie.** Un panneau "Privé" accroché sur une porte non verrouillée. Le panneau communique l'intention ; il n'empêche personne d'entrer. Si quelqu'un force la porte, c'est lui qui assume la responsabilité du contournement.

### Démonstration

```python
class Account:
    def __init__(self, balance):
        self.balance = balance           # public
        self._frozen = False             # privé par convention
        self.__pin = "1234"              # name mangled

a = Account(100)
print(a.balance)         # 100
print(a._frozen)         # False — accessible, juste mal vu
# print(a.__pin)         # AttributeError
print(a._Account__pin)   # '1234' — accessible si on connaît le nom mangled
```

Le name mangling **n'est pas** un mécanisme de sécurité. Il permet à une sous-classe de définir un attribut `__x` sans entrer en collision avec celui de la classe parente.

### Quand utiliser quoi

| Cas                                                  | Convention   |
| ---------------------------------------------------- | ------------ |
| API publique stable, documentée                      | `attribut`   |
| Détail d'implémentation, peut changer entre versions | `_attribut`  |
| Risque concret de collision en héritage              | `__attribut` |

Pièges à éviter :

- Ne **jamais** utiliser `__attribut` "pour rendre privé" — c'est un anti-pattern, ça casse l'héritage légitime.
- Les dunders (`__init__`, `__repr__`) ne subissent **pas** le name mangling, parce qu'ils se terminent aussi par `__`.

---

## 2. Méthodes dunder — les prises standardisées du langage

### Théorie

Les méthodes **dunder** (double underscore) sont les points de branchement officiels entre une classe et la syntaxe Python. Quand on écrit `a + b`, Python appelle en réalité `a.__add__(b)`. Quand on écrit `len(obj)`, Python appelle `obj.__len__()`.

**Analogie.** Les prises électriques standardisées. La forme de la prise est imposée par le réseau (Python) ; tant que ton appareil (ta classe) respecte cette forme, il se branche. Une lampe et un grille-pain sont très différents en interne, mais ils ont la même prise.

### Les dunders les plus utiles

| Dunder                          | Syntaxe associée           | Sert à                                   |
| ------------------------------- | -------------------------- | ---------------------------------------- |
| `__init__`                      | `Cls(...)`                 | Initialiser une instance                 |
| `__repr__`                      | `repr(obj)`, debug         | Représentation non ambiguë (vue dev)     |
| `__str__`                       | `str(obj)`, `print(obj)`   | Représentation lisible (vue utilisateur) |
| `__eq__`                        | `==`                       | Égalité de valeur                        |
| `__hash__`                      | `hash(obj)`, `set`, `dict` | Identité immuable                        |
| `__lt__`, `__le__`, ...         | `<`, `<=`, ...             | Comparaisons                             |
| `__len__`                       | `len(obj)`                 | Taille                                   |
| `__iter__`, `__next__`          | `for ... in obj`           | Itération                                |
| `__getitem__`, `__setitem__`    | `obj[key]`, `obj[key] = v` | Indexation                               |
| `__contains__`                  | `in`                       | Appartenance                             |
| `__call__`                      | `obj(...)`                 | Rendre l'instance appelable              |
| `__add__`, `__sub__`, `__mul__` | `+`, `-`, `*`              | Opérateurs arithmétiques                 |
| `__bool__`                      | `bool(obj)`, `if obj:`     | Véracité                                 |

### Démonstration

```python
class Money:
    def __init__(self, amount, currency):
        self.amount = amount
        self.currency = currency

    def __repr__(self):
        return f"Money({self.amount!r}, {self.currency!r})"

    def __str__(self):
        return f"{self.amount:.2f} {self.currency}"

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return (self.amount, self.currency) == (other.amount, other.currency)

    def __hash__(self):
        return hash((self.amount, self.currency))

    def __add__(self, other):
        if not isinstance(other, Money) or self.currency != other.currency:
            return NotImplemented
        return Money(self.amount + other.amount, self.currency)


m = Money(10, "EUR")
print(repr(m))             # Money(10, 'EUR')
print(str(m))              # 10.00 EUR
print(m + Money(5, "EUR")) # 15.00 EUR
print(m == Money(10, "EUR"))  # True
```

### Trois règles pratiques

1. **`__repr__` toujours**, `__str__` seulement si on a une représentation utilisateur distincte.
2. **`__eq__` et `__hash__` ensemble** ou aucun des deux (cf. section 4).
3. Renvoyer **`NotImplemented`** (pas `NotImplementedError`) quand on ne sait pas comparer ou opérer : Python essaiera la méthode symétrique de l'autre opérande.

---

## 3. `@classmethod` vs `@staticmethod`

### Théorie

Trois types de méthodes dans une classe :

| Type               | Premier paramètre | Reçoit     | Utilité                                                                |
| ------------------ | ----------------- | ---------- | ---------------------------------------------------------------------- |
| Méthode d'instance | `self`            | l'instance | Agir sur l'instance                                                    |
| `@classmethod`     | `cls`             | la classe  | Agir sur la classe (factory, alternative à `__init__`, registre)       |
| `@staticmethod`    | rien              | rien       | Fonction logiquement rattachée à la classe mais indépendante de l'état |

**Analogie.**

- Méthode d'instance = boulanger qui pétrit _cette_ pâte précise.
- `@classmethod` = chef boulanger qui définit une recette pour toute la boulangerie (peut produire des variantes selon le modèle).
- `@staticmethod` = calculatrice posée sur le comptoir — pratique pour calculer une conversion farine/sel, mais indépendante de la boulangerie. On la range là par cohérence.

### Démonstration

```python
class Date:
    def __init__(self, year, month, day):
        self.year, self.month, self.day = year, month, day

    @classmethod
    def from_string(cls, s):
        """Factory alternative — utilise cls pour rester compatible avec l'héritage."""
        year, month, day = map(int, s.split("-"))
        return cls(year, month, day)

    @classmethod
    def today(cls):
        from datetime import date
        d = date.today()
        return cls(d.year, d.month, d.day)

    @staticmethod
    def is_leap(year):
        """Indépendante de l'instance — pourrait être une fonction libre, rangée ici par cohérence."""
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


d = Date.from_string("2026-05-15")
print(Date.is_leap(2024))  # True
```

### Heuristique de choix

- A besoin de `self` → méthode d'instance.
- A besoin de la classe (pour héritage, factory) → `@classmethod`.
- N'a besoin ni de `self` ni de `cls`, mais lien logique avec la classe → `@staticmethod`.
- N'a besoin ni de `self` ni de `cls`, ET pas de lien logique avec la classe → fonction libre.

**Piège fréquent.** Utiliser `@staticmethod` quand `@classmethod` serait correct. Si la fonction crée une instance, c'est `@classmethod` (avec `cls(...)`) — sinon, une sous-classe ne pourra pas en hériter proprement.

```python
class A:
    @staticmethod
    def create():
        return A()    # ✗ casse l'héritage

class A:
    @classmethod
    def create(cls):
        return cls()  # ✓ fonctionne aussi pour les sous-classes
```

---

## 4. Hashable — les 4 règles d'or

### Théorie

Un objet est **hashable** s'il a une valeur de hash stable au cours de sa vie, et s'il peut être comparé à d'autres objets. C'est la condition pour être utilisable comme **clé de dictionnaire** ou élément d'un **set**.

**Analogie.** L'ISBN d'un livre. Identifiant stable, calculé une fois, qui permet de retrouver le livre en bibliothèque. Si l'ISBN changeait à chaque emprunt, le système s'effondrerait.

### Les 4 règles

1. **`__hash__` doit être stable.** Tant que l'objet existe, son hash ne change pas. Donc l'objet est immuable, ou au moins les champs participant au hash le sont.
2. **`__hash__` et `__eq__` sont liés.** Si `a == b`, alors `hash(a) == hash(b)`. L'inverse n'est pas obligatoire (les collisions sont autorisées).
3. **Si `__eq__` est redéfini, `__hash__` doit l'être aussi.** Sinon Python met `__hash__ = None` et l'objet devient non hashable.
4. **Les champs du hash et de l'égalité doivent coïncider.** Les attributs qui définissent l'égalité doivent être ceux qui définissent le hash.

### Démonstration correcte

```python
class Coordinate:
    def __init__(self, lat, lon):
        self.lat = lat
        self.lon = lon

    def __eq__(self, other):
        if not isinstance(other, Coordinate):
            return NotImplemented
        return (self.lat, self.lon) == (other.lat, other.lon)

    def __hash__(self):
        return hash((self.lat, self.lon))


paris = Coordinate(48.85, 2.35)
paris_bis = Coordinate(48.85, 2.35)
print(paris == paris_bis)               # True
print(hash(paris) == hash(paris_bis))   # True

visited = {paris, Coordinate(51.5, -0.13)}
print(paris_bis in visited)             # True — résolu par hash + ==
```

### Anti-pattern fréquent — hash sur champ mutable

```python
class BadKey:
    def __init__(self, name, items):
        self.name = name
        self.items = items

    def __eq__(self, other):
        return self.name == other.name and self.items == other.items

    def __hash__(self):
        return hash((self.name, tuple(self.items)))


k = BadKey("a", [1, 2])
d = {k: "value"}
k.items.append(3)        # le hash devient implicitement obsolète
print(d[k])              # KeyError — la clé est introuvable
```

Leçon : **si un objet est hashable, il doit être traité comme immuable** sur les champs du hash.

### Dataclasses et hashable

`@dataclass` règle automatiquement la question :

| Décorateur                | `__eq__` | `__hash__` | Conséquence                   |
| ------------------------- | -------- | ---------- | ----------------------------- |
| `@dataclass` (défaut)     | généré   | `None`     | Non hashable                  |
| `@dataclass(frozen=True)` | généré   | généré     | Hashable et immuable          |
| `@dataclass(eq=False)`    | hérité   | hérité     | Hash basé sur l'identité (id) |

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Point:
    x: float
    y: float

# Hashable, immuable, gratuit.
```

---

## 5. Mixin — composer sans empiler

### Théorie

Un **mixin** est une classe conçue pour être héritée à plusieurs, en complément d'une autre classe principale, afin d'apporter une fonctionnalité ciblée. Il ne fonctionne pas seul ; il ajoute du comportement à la classe qui l'utilise.

**Analogie.** Des roues de skate qu'on ajoute à différents types de planches. Les roues ne sont pas une planche, et elles ne font pas tout — mais combinées avec n'importe quelle planche, elles ajoutent la roulabilité. On peut mettre les mêmes roues sur un longboard, un cruiser ou un old school, sans changer la nature de la planche.

### Caractéristiques

Un bon mixin :

- N'a **pas** de `__init__` qui exige des paramètres spécifiques.
- N'a **pas** ou peu d'attributs propres.
- Apporte **une seule responsabilité**.
- Son nom se termine souvent par `Mixin` pour signaler l'intention.

### Démonstration

```python
class TimestampMixin:
    """Ajoute la capacité d'enregistrer la création et la dernière mise à jour."""

    def touch(self):
        from datetime import datetime
        if not hasattr(self, "created_at"):
            self.created_at = datetime.now()
        self.updated_at = datetime.now()


class ToDictMixin:
    """Sérialise l'objet en dict (pour JSON, API, etc.)."""

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


class Article(TimestampMixin, ToDictMixin):
    def __init__(self, title, content):
        self.title = title
        self.content = content
        self.touch()


a = Article("Sortie de Python 3.14", "Article sur les nouveautés")
print(a.to_dict())
# {'title': '...', 'content': '...', 'created_at': ..., 'updated_at': ...}
```

### Mixin vs héritage classique

| Héritage classique           | Mixin                                    |
| ---------------------------- | ---------------------------------------- |
| Relation "est un"            | Relation "a la capacité de"              |
| Une classe parent principale | Plusieurs petits modules de comportement |
| Arbre profond                | Composition large                        |
| Risque de diamants           | MRO à surveiller (voir M3)               |

**Quand préférer un mixin.** Quand une même fonctionnalité (logging, sérialisation, timestamps, comparaison...) revient dans plusieurs hiérarchies non liées. Plutôt que de copier le code ou de la coller dans une classe-parent commune artificielle, on l'isole dans un mixin.

---

## 6. Exercices pratiques

### Exercice 1 — Visibilité (≈ 15 min)

Écrire une classe `Counter` avec :

- Un attribut public `total`.
- Un attribut privé par convention `_history` (liste des incréments).
- Une méthode `bump(n)` qui ajoute `n` à `total` et `n` à `_history`.
- Une méthode `reset()` qui remet `total` à 0 et vide `_history`.

Puis : depuis l'extérieur, modifier `_history` directement. Constater que rien ne l'empêche. Documenter en commentaire pourquoi c'est mal vu mais pas interdit.

### Exercice 2 — Dunders (≈ 45 min)

Écrire une classe `Vector` représentant un vecteur 2D, avec :

- `__init__(self, x, y)`.
- `__repr__` (forme `Vector(x, y)`).
- `__eq__` comparant avec un autre `Vector`.
- `__add__` et `__sub__` renvoyant un nouveau `Vector`.
- `__mul__(scalar)` qui multiplie chaque composante par un scalaire (et `__rmul__` symétrique pour gérer `3 * v`).
- `__abs__` renvoyant la norme.
- `__bool__` renvoyant `False` pour le vecteur nul.

Test attendu :

```python
v = Vector(3, 4)
print(abs(v))              # 5.0
print(v + Vector(1, 1))    # Vector(4, 5)
print(3 * v)               # Vector(9, 12)
print(bool(Vector(0, 0)))  # False
```

### Exercice 3 — `@classmethod` vs `@staticmethod` (≈ 30 min)

Écrire une classe `Temperature` avec :

- `__init__(self, kelvin)` qui stocke en Kelvin.
- `@classmethod from_celsius(cls, c)` renvoyant une `Temperature` depuis des degrés Celsius.
- `@classmethod from_fahrenheit(cls, f)` analogue depuis Fahrenheit.
- `@staticmethod is_valid_kelvin(k)` qui vérifie `k >= 0`.
- Méthode d'instance `to_celsius()`.

**Bonus** : créer une sous-classe `BodyTemperature` héritant de `Temperature` et vérifier que `BodyTemperature.from_celsius(37)` renvoie bien une `BodyTemperature` (et non une `Temperature`).

### Exercice 4 — Hashable correct (≈ 30 min)

Écrire une classe `Card` représentant une carte à jouer :

- `__init__(self, rank, suit)` avec `rank` parmi `["2", ..., "10", "J", "Q", "K", "A"]` et `suit` parmi `["♠", "♥", "♦", "♣"]`.
- Implémenter `__eq__`, `__hash__`, `__repr__`.
- Mettre 5 instances (dont des doublons) dans un `set` et vérifier que les doublons sont éliminés.

**Bonus** : refaire la classe en `@dataclass(frozen=True)` et vérifier que tout fonctionne identiquement, avec moins de code.

### Exercice 5 — Mixin (≈ 45 min)

Écrire deux mixins indépendants :

- `JSONSerializableMixin` : méthode `to_json()` qui renvoie la représentation JSON de l'objet via `__dict__`.
- `ComparableByFieldsMixin` : génère `__eq__` et `__hash__` à partir d'une liste de noms de champs déclarée dans `_fields_for_comparison`.

Les combiner dans une classe `User(JSONSerializableMixin, ComparableByFieldsMixin)` :

```python
class User(JSONSerializableMixin, ComparableByFieldsMixin):
    _fields_for_comparison = ("id",)

    def __init__(self, id, name):
        self.id = id
        self.name = name
```

Vérifier que deux `User` avec le même `id` mais des noms différents sont considérés égaux, et que `to_json()` produit une chaîne JSON cohérente.

---

## 7. Mini-défi de synthèse (≈ 1 à 2 heures)

Concevoir une classe `Money` complète qui utilise **tous** les concepts du module :

- **Dunders** : `__init__`, `__repr__`, `__str__`, `__eq__`, `__hash__`, `__lt__`, `__add__`, `__sub__`, `__mul__` (par scalaire), `__neg__`.
- **Visibilité** : champs `_amount` et `_currency` "privés par convention".
- **Classmethod** : `Money.zero(currency)` et `Money.from_cents(cents, currency)`.
- **Staticmethod** : `Money.is_supported_currency(code)` qui vérifie l'appartenance à un ensemble fermé.
- **Hashable** : objet immuable et hashable.
- **Mixin** : extraire la sérialisation (`to_dict`, `to_json`) dans un `SerializableMixin` réutilisable.

Validation — ces deux assertions doivent passer :

```python
prices = {Money.from_cents(1500, "EUR"): "1×16Go", Money.from_cents(3000, "EUR"): "1×32Go"}
assert Money(15, "EUR") in prices

cart = Money.zero("EUR") + Money(10, "EUR") + Money(5, "EUR")
assert cart == Money(15, "EUR")
```

---

## 8. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant peut expliquer la différence entre `_x`, `__x`, `__x__` à l'oral, sans hésiter.
- [ ] Les exercices 1 à 5 sont faits, et l'apprenant peut justifier chaque choix (pourquoi `@classmethod` ici plutôt que `@staticmethod` ?).
- [ ] Le mini-défi `Money` passe les deux assertions de validation.
- [ ] L'apprenant connaît les 4 règles du hashable et peut citer un anti-pattern qui les viole.
- [ ] Le concept de mixin est différencié de l'héritage classique avec une analogie maîtrisée.

**Items du glossaire visés** (passage de P/N à A) : N3 #11 (dunders), #15 (visibilité), #16 (classmethod/staticmethod), #18 (mixin), #19 (hashable).

---

## 9. Ressources complémentaires

- **Documentation officielle** : _Data model_ — [docs.python.org/3/reference/datamodel.html](https://docs.python.org/3/reference/datamodel.html). Lecture de référence pour tous les dunders.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitres 1, 9, 12 : modèle de données, classes hashables, héritage et mixins.
- **PEP 8** — sections sur les conventions de nommage (`_x`, `__x`).
- **Real Python** — articles _Object-Oriented Programming in Python 3_ et _Python's Data Classes_.
