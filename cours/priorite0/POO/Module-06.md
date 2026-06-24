# M6 — Méthodes et attributs statiques

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer un **membre de classe** d'un **membre d'instance**.
- Choisir correctement entre méthode d'instance, `@classmethod` et `@staticmethod`.
- Appliquer les **patterns canoniques** : factory statique, compteur partagé, registre.
- Identifier les **anti-patterns** (mutables partagés, surcharge `@staticmethod` à la place de `@classmethod`).

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M5 POO.
- Parcours Python M2 (la mécanique technique : `cls` vs `self`, name mangling).

---

## 1. Niveau classe vs niveau instance

### Théorie

Une classe est à la fois une **fabrique** d'objets et un **espace de nommage** à part entière. Deux niveaux coexistent :

- **Instance** — chaque objet a ses propres attributs et méthodes liées à son état.
- **Classe** — un état et un comportement **partagés** entre toutes les instances.

**Analogie.** Une entreprise et ses employés :

- L'**instance** est la fiche de paye d'un employé donné — propre à lui.
- La **classe** est le règlement de l'entreprise — partagé par tous les employés, modifié à un seul endroit.

Cette distinction guide le choix entre les trois types de méthodes :

| Type               | Premier paramètre | Niveau d'action               |
| ------------------ | ----------------- | ----------------------------- |
| Méthode d'instance | `self`            | Sur **un objet**              |
| `@classmethod`     | `cls`             | Sur **la classe**             |
| `@staticmethod`    | (rien)            | Indépendante, mais rangée ici |

### Pourquoi en parler à part

Mal choisir entre les trois peut produire un code qui marche mais qui :

- **Casse l'héritage** (`@staticmethod` qui crée une instance directement par nom de classe, donc qui ne fonctionne plus dans une sous-classe).
- **Partage par accident** un mutable entre toutes les instances (bug subtil, difficile à repérer).
- **Mélange** les responsabilités (méthode d'instance qui n'utilise pas `self`).

---

## 2. Méthode d'instance — le défaut

### Théorie

C'est la forme la plus courante. La méthode reçoit `self` (l'instance) en premier paramètre, et agit sur son état.

```python
class Account:
    def __init__(self, balance: float):
        self.balance = balance

    def deposit(self, amount: float) -> None:
        self.balance += amount

    def withdraw(self, amount: float) -> None:
        if amount > self.balance:
            raise ValueError("Insufficient funds")
        self.balance -= amount
```

`deposit` et `withdraw` modifient **cet objet précis**. Deux instances `a` et `b` ont chacune leur propre `balance`.

### Quand l'utiliser

- Quand le comportement **dépend de l'état de l'instance** (lecture ou modification).
- Quand le comportement est **différent** d'une instance à l'autre.

### Test simple

Si la méthode utilise `self.x` au moins une fois, c'est une méthode d'instance. Si elle ne l'utilise pas, c'est probablement une `@classmethod` ou une `@staticmethod` mal classée.

---

## 3. `@classmethod` — agir au niveau de la classe

### Théorie

Une `@classmethod` reçoit la classe (`cls`) en premier paramètre. Elle peut :

- Créer une instance via `cls(...)` (factory alternative).
- Modifier un attribut de classe.
- Lire/écrire un registre partagé par toutes les instances.

**Analogie.** Le chef du personnel qui dit "embauche un nouveau commercial selon le contrat-type". Il agit **au nom de l'entreprise**, pas au nom d'un employé particulier. Il peut instancier un nouvel employé, ou modifier le règlement.

### Pattern Factory

```python
class Date:
    def __init__(self, year: int, month: int, day: int):
        self.year, self.month, self.day = year, month, day

    @classmethod
    def from_string(cls, s: str) -> "Date":
        year, month, day = map(int, s.split("-"))
        return cls(year, month, day)

    @classmethod
    def today(cls) -> "Date":
        from datetime import date
        d = date.today()
        return cls(d.year, d.month, d.day)


d1 = Date(2026, 5, 15)
d2 = Date.from_string("2026-05-15")
d3 = Date.today()
```

L'utilisation de `cls(...)` au lieu de `Date(...)` est cruciale : si une sous-classe `BusinessDate(Date)` existe, `BusinessDate.today()` renvoie une `BusinessDate`, pas une `Date`. Avec `Date(...)` codé en dur, on aurait perdu l'héritage.

### Pattern Compteur partagé

```python
class User:
    _count: int = 0          # attribut de classe partagé

    def __init__(self, name: str):
        self.name = name
        User._count += 1     # ou type(self)._count += 1

    @classmethod
    def total_users(cls) -> int:
        return cls._count
```

Toutes les instances partagent `_count`. La `@classmethod` `total_users` expose la valeur sans nécessiter d'instance.

### Pattern Registre

```python
class Plugin:
    _registry: dict[str, "Plugin"] = {}

    @classmethod
    def register(cls, name: str, plugin: "Plugin") -> None:
        cls._registry[name] = plugin

    @classmethod
    def get(cls, name: str) -> "Plugin":
        return cls._registry[name]
```

Le registre est partagé. Permet un "service locator" basique (à utiliser avec parcimonie — c'est un pattern controversé).

### Quand utiliser `@classmethod`

- **Factory alternatives** (multiples constructeurs).
- **Manipulation d'un attribut de classe** partagé.
- **Code qui doit fonctionner correctement** avec des sous-classes (utiliser `cls(...)`).

---

## 4. `@staticmethod` — fonction associée à la classe

### Théorie

Une `@staticmethod` ne reçoit **ni `self` ni `cls`**. Elle est **logiquement liée** à la classe (rangée dedans par cohérence), mais elle n'a accès ni à l'instance ni à la classe.

**Analogie.** La calculatrice posée sur le comptoir d'une boulangerie. Elle sert au boulanger pour convertir la farine en grammes, mais elle ne sait rien de la boulangerie. On l'a rangée là parce qu'elle est utile dans le contexte boulanger. Aucun lien fonctionnel avec la boulangerie elle-même.

### Démonstration

```python
class Date:
    def __init__(self, year, month, day):
        self.year, self.month, self.day = year, month, day

    @staticmethod
    def is_leap(year: int) -> bool:
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


Date.is_leap(2024)          # True
Date(2024, 1, 1).is_leap(2024)   # True aussi — mais inhabituel
```

`is_leap` ne dépend ni de l'instance ni de la classe. Elle aurait pu être une fonction libre. Mais elle est **conceptuellement** liée aux dates — on la range donc dans `Date`.

### Quand utiliser `@staticmethod`

- Quand la fonction est **logiquement liée** à la classe.
- Quand elle n'a **besoin ni de l'instance ni de la classe**.
- Quand on n'a **pas besoin** de support à l'héritage (cf. piège ci-dessous).

### Le piège — substituer `@staticmethod` à `@classmethod`

Bug classique :

```python
class A:
    @staticmethod
    def make():
        return A()             # ✗ codé en dur


class B(A):
    pass


b = B.make()
type(b)                        # A, pas B !
```

Si la fonction **crée une instance**, utiliser `@classmethod` avec `cls(...)` :

```python
class A:
    @classmethod
    def make(cls):
        return cls()           # ✓


B.make()                       # type B, comme attendu
```

Règle simple : **toute factory doit être `@classmethod`**.

---

## 5. Attributs de classe vs attributs d'instance

### Théorie

```python
class Dog:
    species = "Canis familiaris"   # attribut de classe

    def __init__(self, name: str):
        self.name = name             # attribut d'instance


rex = Dog("Rex")
buddy = Dog("Buddy")

print(rex.species, buddy.species)  # 'Canis familiaris' 'Canis familiaris'
```

`species` est défini une seule fois sur la classe. Toutes les instances le partagent.

### Subtilité — affecter vs muter

```python
Dog.species = "Canis lupus"        # ✓ modifie pour tous
print(rex.species)                  # 'Canis lupus'

rex.species = "Custom"             # ⚠️ crée un attribut d'instance qui shadow le partagé
print(buddy.species)                # 'Canis lupus' (toujours partagé)
print(rex.species)                  # 'Custom' (instance-level désormais)
```

C'est subtil. Affecter `instance.x = ...` crée un attribut **d'instance** qui masque l'attribut de classe. Ce dernier reste intact pour les autres.

### Le piège du mutable partagé

```python
class Cart:
    items: list = []   # ✗ MUTABLE de classe — partagé entre toutes les instances


c1 = Cart()
c2 = Cart()
c1.items.append("apple")
print(c2.items)        # ['apple'] !!!
```

`c1` et `c2` partagent **la même liste**. Bug classique.

Correction :

```python
class Cart:
    def __init__(self):
        self.items = []     # ✓ instance-level
```

Règle : **jamais de mutable comme attribut de classe**, sauf si c'est délibérément partagé (registre, cache global).

---

## 6. Patterns canoniques

### Pattern Factory statique

Plusieurs constructeurs pour différents formats d'entrée.

```python
class Color:
    def __init__(self, r: int, g: int, b: int):
        self.r, self.g, self.b = r, g, b

    @classmethod
    def from_hex(cls, hex_str: str) -> "Color":
        h = hex_str.lstrip("#")
        return cls(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    @classmethod
    def from_name(cls, name: str) -> "Color":
        names = {"red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255)}
        return cls(*names[name])


c1 = Color(255, 0, 0)
c2 = Color.from_hex("#ff8800")
c3 = Color.from_name("red")
```

Très idiomatique. Évite les `__init__` à signature complexe.

### Pattern Compteur

Compter le nombre total d'instances créées.

```python
class Order:
    _next_id: int = 1

    def __init__(self):
        self.id = Order._next_id
        Order._next_id += 1


Order().id    # 1
Order().id    # 2
Order().id    # 3
```

### Pattern Registre (auto-enregistrement)

```python
class Command:
    _registry: dict[str, type["Command"]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls._registry[cls.__name__.lower()] = cls

    @classmethod
    def get_class(cls, name: str) -> type["Command"]:
        return cls._registry[name]

    def execute(self): ...


class Save(Command): ...
class Delete(Command): ...


Command.get_class("save")       # <class 'Save'>
```

`__init_subclass__` est un hook appelé à la **création** d'une sous-classe. Couplé à un `@classmethod`, il permet l'auto-enregistrement.

### Pattern Singleton (à utiliser avec parcimonie)

```python
class Logger:
    _instance: "Logger | None" = None

    @classmethod
    def get_instance(cls) -> "Logger":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance


log1 = Logger.get_instance()
log2 = Logger.get_instance()
assert log1 is log2
```

Le Singleton est un pattern **controversé** (cf. M8 sur les patterns) : il introduit un état global, complique les tests. Préférer l'**injection de dépendances** (cf. SOLID DIP).

---

## 7. Anti-patterns à reconnaître

### Anti-pattern 1 — Méthode d'instance qui ignore `self`

```python
class MathUtils:
    def add(self, a, b):       # ✗ pas besoin de self
        return a + b
```

Si `self` n'est pas utilisé, c'est une `@staticmethod`. Sinon, c'est une fonction libre déguisée.

### Anti-pattern 2 — `@staticmethod` qui crée une instance directement

Vu en section 4 : casse l'héritage. Utiliser `@classmethod` à la place.

### Anti-pattern 3 — Mutable de classe partagé par accident

Vu en section 5. Convertir en attribut d'instance dans `__init__`.

### Anti-pattern 4 — Tout en `@staticmethod`

```python
class Utils:
    @staticmethod
    def a(x): ...
    @staticmethod
    def b(x): ...
    @staticmethod
    def c(x): ...
```

Si **toutes** les méthodes sont statiques, ce n'est pas une classe — c'est un module. Mettre les fonctions au niveau module et oublier la classe.

### Anti-pattern 5 — Attribut de classe utilisé comme default mutable

```python
class Form:
    fields = []         # ✗ partagé entre tous

    def add_field(self, f):
        self.fields.append(f)
```

Bug : tous les formulaires partagent leurs champs.

**Correction** : initialiser dans `__init__`.

---

## 8. Exercices pratiques

### Exercice 1 — Choisir le bon type de méthode (≈ 20 min)

Pour chaque cas, indiquer méthode d'instance / `@classmethod` / `@staticmethod` / fonction libre, et justifier :

1. Convertir une couleur RGB en HSL (calcul mathématique pur).
2. Récupérer le solde d'un compte bancaire.
3. Créer un `User` à partir d'un dict JSON.
4. Compter le nombre total d'instances de `Order` créées.
5. Vérifier si une chaîne ressemble à un email.
6. Annuler une transaction donnée.

### Exercice 2 — Factory propre (≈ 25 min)

Implémenter une classe `Distance` avec :

- `__init__(self, meters: float)`.
- `@classmethod from_kilometers(cls, km)`.
- `@classmethod from_miles(cls, miles)`.
- `@classmethod from_feet(cls, feet)`.
- Méthode d'instance `to_kilometers()`.

Vérifier que `Distance.from_miles(1).to_kilometers()` renvoie environ `1.609`.

**Bonus** : créer une sous-classe `BankerDistance` qui arrondit toujours au mètre. Vérifier que `BankerDistance.from_miles(1)` renvoie bien une `BankerDistance` (et non une `Distance`).

### Exercice 3 — Compteur partagé (≈ 25 min)

Implémenter une classe `Connection` avec :

- Un attribut de classe `_active_connections: int = 0`.
- Un `__init__` qui incrémente le compteur.
- Une méthode `close()` qui le décrémente.
- Une `@classmethod active_count()` qui renvoie le nombre actuel.

Test :

```python
c1 = Connection()
c2 = Connection()
assert Connection.active_count() == 2
c1.close()
assert Connection.active_count() == 1
```

### Exercice 4 — Repérer le piège (≈ 20 min)

Soit :

```python
class TodoList:
    tasks: list = []

    def add(self, task):
        self.tasks.append(task)


a = TodoList()
b = TodoList()
a.add("buy milk")
print(b.tasks)
```

Prédire la sortie. La corriger.

### Exercice 5 — Registre auto-enregistré (≈ 35 min)

Implémenter un système de plugins :

- Classe abstraite `Plugin` avec une méthode `run()` abstraite.
- `__init_subclass__` qui enregistre automatiquement chaque sous-classe dans un registre `Plugin._registry` (clé : nom de la classe en lowercase).
- Méthode `@classmethod Plugin.find(name)` qui renvoie la classe correspondante.

Test :

```python
class Backup(Plugin):
    def run(self): print("backup")

class Restore(Plugin):
    def run(self): print("restore")


Plugin.find("backup")().run()    # affiche "backup"
Plugin.find("restore")().run()   # affiche "restore"
```

---

## 9. Mini-défi de synthèse (≈ 1,5 à 2 heures) — factory statique et compteur partagé

Concevoir une classe `BankAccount` qui combine **factory statique** et **compteur partagé**.

**Spécifications** :

- **Factory** :
  - `BankAccount(owner: str, balance: float = 0)` — constructeur principal.
  - `@classmethod from_dict(cls, data: dict)` — depuis un dict JSON-like.
  - `@classmethod open_savings(cls, owner: str, initial_deposit: float)` — comptes "épargne", balance initiale obligatoire ≥ 100.
- **Compteur partagé** :
  - Attribut de classe `_total_accounts: int` qui compte tous les comptes créés.
  - Attribut de classe `_total_balance: float` qui suit la somme totale des soldes.
  - `@classmethod get_stats(cls)` qui renvoie `{"count": ..., "total": ...}`.
- **Méthode statique utilitaire** :
  - `@staticmethod is_valid_iban(iban: str) -> bool` — validation basique du format (longueur, premiers caractères en lettres).
- **Méthodes d'instance** :
  - `deposit(amount)` et `withdraw(amount)` qui mettent à jour la balance individuelle **et** la balance totale.

**Critères de validation** :

- [ ] Aucun mutable n'est partagé par accident entre instances.
- [ ] `cls(...)` est utilisé dans toutes les factory, pas `BankAccount(...)`.
- [ ] Une sous-classe `BusinessAccount(BankAccount)` créée via `from_dict` renvoie bien une `BusinessAccount`.
- [ ] `BankAccount.get_stats()` renvoie le bon décompte après création et suppression de comptes.
- [ ] `is_valid_iban` est utilisable sans instance.

---

## 10. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant peut distinguer instance / classe / statique avec une analogie.
- [ ] Il choisit le bon type de méthode dans 6 cas sur 6.
- [ ] Il sait écrire un constructeur alternatif via `@classmethod`.
- [ ] Il identifie et corrige le piège du mutable partagé.
- [ ] Il connaît au moins 3 patterns canoniques (factory, compteur, registre).
- [ ] Le mini-défi est implémenté et passe les critères de validation.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : méthodes / attributs statiques.

---

## 11. Ressources complémentaires

- **Documentation Python** : _Class and Instance Variables_ dans le tutorial officiel.
- **Documentation Python** : `classmethod` et `staticmethod` (decorators built-in).
- **Real Python** — articles _Python's @classmethod and @staticmethod Explained_.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 11 (classes pythoniques).
- **Raymond Hettinger** — _Class development toolkit_ (conférence PyCon 2013 — très bon survol des outils de classe).
