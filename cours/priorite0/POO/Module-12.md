# M12 — Métaprogrammation et réflexivité

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **métaprogrammation** et **réflexivité**, et expliquer leur intérêt.
- Utiliser l'**introspection** Python (`type()`, `dir()`, `getattr()`, `inspect`).
- Créer des classes **dynamiquement** (`type()`, `__init_subclass__`, décorateurs de classe).
- Comprendre le rôle des **métaclasses** (sans en abuser).
- Appliquer la métaprogrammation à des **cas réels** : plugin system, ORM, validation.
- Identifier les cas où **la métaprogrammation est superflue**.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M11 POO terminés.
- Parcours Python M6 (décorateurs) recommandé.

---

## 1. Définitions

### Métaprogrammation

La **métaprogrammation** est l'écriture de code qui **manipule du code**. Le code n'est plus passif (instructions à exécuter) mais devient **données** que l'on peut lire, modifier ou générer.

**Analogie.** Un robot qui assemble d'autres robots. Le programmeur écrit le robot-mère ; les robots-enfants n'existaient pas avant le runtime.

### Réflexivité

La **réflexivité** est la capacité d'un programme à **examiner** et **modifier sa propre structure** pendant l'exécution.

**Analogie.** Un objet qui se regarde dans un miroir et liste ce qu'il voit (ses méthodes, attributs, type). Plus fort : il peut **modifier** ce qu'il voit en se regardant.

### Pourquoi en Python ?

Python rend la métaprogrammation **naturelle** :

- Les **classes sont des objets** (instances de `type`).
- Les **fonctions sont des objets** de première classe.
- L'**introspection** est partout (`dir`, `getattr`, `type`...).
- Les **décorateurs** sont du sucre pour transformer fonctions et classes.

Beaucoup de bibliothèques Python (Django ORM, Pydantic, FastAPI, SQLAlchemy, Pytest, dataclasses) reposent fondamentalement sur la métaprogrammation. Comprendre ses bases permet de **lire** ces bibliothèques et d'en **écrire** des analogues.

---

## 2. Introspection — explorer un objet au runtime

### Les briques de base

```python
class User:
    def __init__(self, name: str):
        self.name = name

    def greet(self) -> str:
        return f"Hello, {self.name}"


u = User("Alice")

type(u)                  # <class 'User'>
isinstance(u, User)      # True
u.__class__              # <class 'User'>
u.__class__.__name__     # "User"
u.__dict__               # {'name': 'Alice'}

dir(u)                   # ['__class__', '__init__', 'greet', 'name', ...]
hasattr(u, "greet")      # True
getattr(u, "name")       # "Alice"
setattr(u, "email", "a@b.c")    # modifie l'instance
```

### Le module `inspect`

`inspect` va plus loin :

```python
import inspect

inspect.getmembers(u)            # liste de (nom, valeur) pour tous les attributs
inspect.signature(User.greet)    # Signature (self)
inspect.getsourcefile(User)      # chemin du fichier source
inspect.getsource(User.greet)    # le code source de la méthode
inspect.getdoc(User.greet)       # la docstring
```

Utile pour le debugging, la génération de documentation, ou la construction d'outils.

### Inspecter une classe

```python
User.__name__              # "User"
User.__bases__             # (object,)
User.__mro__               # (User, object)
User.__dict__              # méthodes, attributs de classe
```

Tous les objets Python exposent ces dunders — pas seulement les classes.

### Limites

L'introspection lit ce qui est **déclaré**. Elle ne lit pas :

- Les **arguments** d'une closure (sauf via `func.__closure__`).
- Les variables **locales** d'une fonction en cours.
- Les types **erasés** (cf. M11 sur les génériques au runtime).

Pour le typage, utiliser `typing.get_type_hints` ou `inspect.signature(...).parameters`.

---

## 3. Créer des classes dynamiquement

### `type()` — l'usine à classes

`type` a deux usages : récupérer la classe d'un objet (`type(x)`) **ou** créer une nouvelle classe.

```python
# Forme à 3 arguments : type(name, bases, namespace)
User = type("User", (object,), {
    "greet": lambda self: f"Hello, {self.name}",
    "__init__": lambda self, name: setattr(self, "name", name),
})

u = User("Alice")
print(u.greet())   # "Hello, Alice"
```

Équivalent strict de la déclaration `class User: ...`. La syntaxe classique est juste du sucre syntaxique pour cet appel à `type`.

### Quand utiliser `type()` directement

- Générer des classes à partir de **données externes** (schémas JSON, fichiers de config).
- Construire un **DSL** (Domain-Specific Language).
- Outils de test / mocking.

Pour 99 % du code applicatif, la syntaxe `class` est préférable. `type()` reste rarement nécessaire.

---

## 4. Hooks de cycle de vie — `__init_subclass__` et `__set_name__`

### `__init_subclass__` — réagir à la création d'une sous-classe

```python
class Plugin:
    _registry: dict[str, type["Plugin"]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        Plugin._registry[cls.__name__.lower()] = cls


class Backup(Plugin):
    pass


class Restore(Plugin):
    pass


print(Plugin._registry)
# {'backup': <class 'Backup'>, 'restore': <class 'Restore'>}
```

`__init_subclass__` est appelé **automatiquement** à la création de chaque sous-classe. Pas besoin de métaclasse pour beaucoup de cas — c'est l'outil moderne (Python 3.6+).

### Cas d'usage

- **Auto-enregistrement** dans un registre (illustré ci-dessus).
- **Validation** que la sous-classe a bien certains attributs.
- **Génération** de méthodes manquantes.

### `__set_name__` — réagir à l'attachement à une classe

Quand un descripteur ou un objet personnalisé est assigné comme attribut de classe, Python appelle `__set_name__(owner, name)` :

```python
class Field:
    def __set_name__(self, owner, name):
        self.owner = owner
        self.name = name


class User:
    email = Field()
    name = Field()


print(User.email.name)    # "email"
print(User.email.owner)   # <class 'User'>
```

Pratique pour les **ORM** et **frameworks de validation** : chaque champ "sait" son propre nom et sa classe propriétaire.

---

## 5. Décorateurs de classe

### Théorie

Un décorateur de classe (déjà introduit en Python M6) **reçoit la classe** après sa création et peut la modifier :

```python
def add_str(cls):
    def __str__(self):
        return f"<{cls.__name__} {self.__dict__}>"
    cls.__str__ = __str__
    return cls


@add_str
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y


p = Point(1, 2)
print(p)    # "<Point {'x': 1, 'y': 2}>"
```

Le décorateur **modifie** `Point` après sa création. Tout ce qu'on peut faire dynamiquement, on peut le faire via un décorateur de classe.

### Décorateurs paramétrés

```python
def trace_methods(methods: list[str]):
    def decorator(cls):
        for name in methods:
            original = getattr(cls, name)
            def make_traced(fn):
                def wrapper(self, *args, **kwargs):
                    print(f"[trace] {cls.__name__}.{fn.__name__}({args})")
                    return fn(self, *args, **kwargs)
                return wrapper
            setattr(cls, name, make_traced(original))
        return cls
    return decorator


@trace_methods(["deposit", "withdraw"])
class Account:
    def __init__(self, balance): self.balance = balance
    def deposit(self, amount): self.balance += amount
    def withdraw(self, amount): self.balance -= amount


a = Account(100)
a.deposit(50)    # [trace] Account.deposit((50,))
a.withdraw(20)   # [trace] Account.withdraw((20,))
```

Familier pour qui a lu les décorateurs : Python M6.

---

## 6. Métaclasses — l'usine qui fabrique les usines

### Théorie

Une **métaclasse** est la classe d'une classe. Par défaut, toutes les classes Python sont des instances de **`type`**.

```python
class User: pass

type(User)        # <class 'type'>
isinstance(User, type)   # True
```

Une métaclasse personnalisée hérite de `type` et **personnalise** la création des classes :

```python
class LoggedMeta(type):
    def __new__(mcs, name, bases, namespace):
        print(f"Creating class {name}")
        return super().__new__(mcs, name, bases, namespace)


class User(metaclass=LoggedMeta):    # déclencheur
    pass

# Output: "Creating class User"
```

### Cas où les métaclasses brillent

- **Frameworks** qui injectent du comportement dans **toutes** les classes filles (Django ORM, SQLAlchemy déclaratif).
- **Validation** structurale avant que la classe ne soit créée.
- **Generation** de méthodes basée sur les annotations (Pydantic, dataclasses).

### Cas où ce n'est PAS nécessaire

Avant Python 3.6, beaucoup de besoins demandaient une métaclasse. Depuis Python 3.6 :

- **`__init_subclass__`** couvre la plupart des cas d'auto-enregistrement.
- **`__set_name__`** couvre les descripteurs.
- **Décorateurs de classe** couvrent les transformations post-création.

**Règle de Tim Peters** :

> _Metaclasses are deeper magic than 99% of users should ever worry about. If you wonder whether you need them, you don't._

Ne pas écrire de métaclasse **avant** d'avoir épuisé les autres outils. Mais savoir les **lire** dans une lib existante.

---

## 7. Cas d'usage réels

### Cas 1 — Plugin system auto-découvert

```python
class Plugin:
    _registry: dict[str, type["Plugin"]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        Plugin._registry[cls.__name__.lower()] = cls

    @classmethod
    def find(cls, name: str) -> type["Plugin"]:
        return cls._registry[name]

    def run(self):
        raise NotImplementedError


class Backup(Plugin):
    def run(self):
        print("backing up...")


class Restore(Plugin):
    def run(self):
        print("restoring...")


# Auto-découverte
for name in ["backup", "restore"]:
    Plugin.find(name)().run()
```

Pas besoin de hardcoder la liste des plugins — toute nouvelle sous-classe s'enregistre toute seule.

### Cas 2 — Mini-ORM déclaratif

```python
class Field:
    def __init__(self, kind: type):
        self.kind = kind

    def __set_name__(self, owner, name):
        self.name = name


class Model:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls._fields = {
            name: attr for name, attr in vars(cls).items()
            if isinstance(attr, Field)
        }

    def __init__(self, **kwargs):
        for name, field in type(self)._fields.items():
            value = kwargs.get(name)
            if not isinstance(value, field.kind):
                raise TypeError(f"{name} must be {field.kind.__name__}")
            setattr(self, name, value)


class User(Model):
    name = Field(str)
    age = Field(int)


u = User(name="Alice", age=30)    # ✓
v = User(name="Bob", age="oops")  # ✗ TypeError
```

L'utilisateur écrit une classe déclarative ; le framework gère validation et stockage. C'est exactement le modèle de Pydantic, Django, SQLAlchemy 2.0.

### Cas 3 — Validation des configurations

```python
class Config:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "version"):
            raise TypeError(f"{cls.__name__} must define 'version'")


class AppConfig(Config):
    version = "1.0"


class BadConfig(Config):   # ✗ erreur au moment de la création
    pass
```

L'erreur survient à **l'import du module**, pas au runtime. Plus tôt = plus facile à corriger.

### Cas 4 — Test automation

```python
class TestRegistry:
    _tests: dict[str, callable] = {}


def register_test(name=None):
    def decorator(fn):
        TestRegistry._tests[name or fn.__name__] = fn
        return fn
    return decorator


@register_test()
def test_basic_addition():
    assert 1 + 1 == 2


@register_test("custom_name")
def some_function():
    assert True


# Exécuter tous les tests enregistrés
for name, fn in TestRegistry._tests.items():
    try:
        fn()
        print(f"✓ {name}")
    except AssertionError:
        print(f"✗ {name}")
```

Pytest fait exactement cela (en plus sophistiqué) via introspection des modules.

---

## 8. Quand ne PAS utiliser la métaprogrammation

### Trois signaux d'alerte

1. **Le besoin pourrait être résolu par une fonction ou une classe normale.** La métaprogrammation a un coût cognitif. Tant que l'option directe marche, la garder.
2. **L'équipe n'est pas à l'aise.** La métaprogrammation est puissante mais opaque. Un développeur qui débarque sur le projet doit pouvoir comprendre le code. Si on est seul à savoir lire le code "magique", c'est une dette technique.
3. **Le code dépend de noms / types runtime.** Le typage statique (mypy, pyright) a du mal avec la métaprogrammation. Si on souffre déjà du type checker, en rajouter va aggraver le problème.

### Citations

> _"There should be one — and preferably only one — obvious way to do it."_ — _The Zen of Python_

> _"Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it."_ — Brian Kernighan.

La métaprogrammation rend le code **clever**. À utiliser **seulement** quand le bénéfice surpasse cette dette.

---

## 9. Exercices pratiques

### Exercice 1 — Introspection (≈ 20 min)

Écrire une fonction `describe(obj)` qui imprime :

- Le **type** de l'objet.
- Sa **liste d'attributs publics** (sans `_`).
- Sa **liste de méthodes publiques** avec leur signature.

Tester avec une classe quelconque (par exemple `User` du parcours).

### Exercice 2 — Création dynamique (≈ 25 min)

Étant donné un dict de spécification :

```python
spec = {
    "name": "Animal",
    "attrs": {"sound": "generic"},
    "methods": {
        "speak": lambda self: f"I say {self.sound}",
    },
}
```

Écrire une fonction `build_class(spec) -> type` qui construit dynamiquement la classe correspondante via `type()`.

Tester avec 3 specs différentes.

### Exercice 3 — Auto-enregistrement (≈ 30 min)

Implémenter un système d'**actions CLI** auto-découvert :

```python
class Action:
    _registry: dict[str, type["Action"]] = {}

    def __init_subclass__(cls, **kwargs): ...
    @classmethod
    def run(cls, name: str, *args): ...

    def execute(self, *args):
        raise NotImplementedError


class Greet(Action):
    def execute(self, name): print(f"Hello, {name}")

class Bye(Action):
    def execute(self): print("Goodbye!")


Action.run("greet", "Alice")
Action.run("bye")
```

### Exercice 4 — Décorateur de classe pour timing (≈ 30 min)

Écrire un décorateur `@time_all_methods` qui :

1. Parcourt toutes les méthodes publiques de la classe.
2. Les remplace par une version qui imprime leur temps d'exécution.

Tester sur une classe de calcul avec 3 méthodes (somme, moyenne, écart-type).

### Exercice 5 — Mini-ORM (≈ 45 min)

Implémenter le mini-ORM de la section 7 (Cas 2) avec :

- `Field(kind, required=True)` qui supporte `required=False`.
- `Model.to_dict()` qui sérialise l'instance.
- `Model.from_dict(data)` qui désérialise depuis un dict.

Tester avec 2 classes `User(name, age)` et `Order(id, total, customer)`.

---

## 10. Mini-défi de synthèse — plugin system (≈ 2 à 3 heures)

Construire un **système de plugins** complet pour un mini-éditeur de texte.

**Spécifications** :

- Une classe abstraite `Command` avec :
  - `name: str` — identifiant.
  - `description: str` — texte d'aide.
  - `execute(editor) -> None` — action.
- **Auto-enregistrement** : toute sous-classe de `Command` est automatiquement disponible.
- **CLI** : l'éditeur lit le `name` au clavier, dispatche la commande, affiche l'aide via `help`.
- **Découverte au runtime** : ajouter une nouvelle commande dans un fichier séparé suffit à la rendre disponible.

**Au moins 4 commandes** :

- `Insert` — insère du texte.
- `Delete` — supprime un caractère.
- `Save` — sauve dans un fichier.
- `Help` — liste toutes les commandes disponibles avec leur description.

**Critères de validation** :

- [ ] Aucune liste hardcodée des commandes — tout passe par l'auto-découverte (`__init_subclass__`).
- [ ] Ajouter une nouvelle commande dans un fichier `commands/new.py` (importé dans `main.py`) la rend disponible sans modifier `main.py`.
- [ ] `Help` parcourt les commandes et affiche leur `description` (introspection).
- [ ] Au moins une commande utilise un **décorateur de classe** pour ajouter du comportement (logging, validation).
- [ ] Un commentaire en haut du fichier documente **pourquoi** la métaprogrammation est légitime ici (et liste l'alternative directe rejetée).

---

## 11. Auto-évaluation

Le module M12 est validé lorsque :

- [ ] L'apprenant peut définir métaprogrammation et réflexivité avec des analogies.
- [ ] Il sait introspecter une classe (attributs, méthodes, MRO, signature).
- [ ] Il peut créer une classe via `type()` directement.
- [ ] Il maîtrise `__init_subclass__` et l'utilise dans un cas réel.
- [ ] Il sait écrire un décorateur de classe simple.
- [ ] Il connaît le rôle d'une métaclasse sans en abuser.
- [ ] Le mini-défi de plugin system fonctionne avec auto-découverte.
- [ ] Il connaît les trois signaux d'alerte qui invitent à ne **pas** métaprogrammer.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : métaprogrammation / réflexivité lorsque l'usage est adapté.

---

## 12. Ressources complémentaires

- **Documentation Python** : _Data model_ — section sur `__init_subclass__`, `__set_name__`, `type`, métaclasses.
- **Documentation Python** : `inspect` (référence complète d'introspection).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitres 23 à 25 — _Attribute Descriptors_, _Class Metaprogramming_ (référence canonique).
- **Real Python** — articles _Python Metaclasses_ et _Python's Reflection Tools_.
- **Code de Django** — `django/db/models/base.py` : exemple massif de métaprogrammation appliquée à un ORM mature.
- **Code de SQLAlchemy 2.0** — `sqlalchemy/orm/decl_api.py` : approche déclarative via Mapped et types.
- **Code de Pydantic v2** — utilisation de Rust pour la performance, mais l'API publique reste métaprogrammation pure côté Python.
