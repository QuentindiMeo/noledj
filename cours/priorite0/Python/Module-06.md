# M6 — Décorateurs et choix de paradigme

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est un décorateur et pourquoi Python permet cette construction.
- Écrire un décorateur simple, paramétré, ou basé sur une classe.
- Utiliser `functools.wraps` pour préserver les métadonnées de la fonction décorée.
- Reconnaître les décorateurs standards (`@property`, `@staticmethod`, `@classmethod`, `@dataclass`, `@functools.lru_cache`, `@functools.cache`, `@functools.cached_property`, `@functools.total_ordering`).
- Distinguer les trois principaux paradigmes (impératif, fonctionnel, objet) et choisir lequel utiliser selon le contexte.
- Implémenter un même algorithme dans deux paradigmes différents et justifier les compromis.

## Durée estimée

1,5 jours.

## Pré-requis

- M2 à M5 terminés.
- Items du plan de remédiation visés : N3 #10 (choix de paradigme), #17 (décorateurs).

---

## 1. Décorateurs — l'intuition

### Théorie

Un **décorateur** est une fonction (ou un callable) qui prend une fonction en entrée et renvoie une fonction (généralement modifiée). La syntaxe `@decorator` est du sucre syntaxique pour `func = decorator(func)`.

**Analogie.** Un emballage cadeau autour d'un objet. L'objet reste utilisable, mais l'emballage ajoute une couche (papier, ruban, étiquette). On peut empiler plusieurs emballages — chaque couche se voit sur le résultat final.

```python
def gift_wrap(func):
    def wrapped(*args, **kwargs):
        print(">>>")
        result = func(*args, **kwargs)
        print("<<<")
        return result
    return wrapped

@gift_wrap
def hello(name):
    print(f"hello {name}")

hello("world")
# >>>
# hello world
# <<<
```

Équivalent sans le sucre `@` :

```python
def hello(name):
    print(f"hello {name}")

hello = gift_wrap(hello)
hello("world")
```

Le `@` n'apporte rien techniquement — il rend la lecture plus claire pour qui parcourt le code.

### Pourquoi c'est possible

Trois propriétés de Python rendent les décorateurs possibles :

1. Les **fonctions sont des objets de première classe** : on peut les passer en paramètre, les renvoyer, les stocker.
2. Les **closures** : une fonction interne capture les variables de la fonction englobante.
3. Le sucre syntaxique `@decorator` qui transforme `@decorator\ndef f(): ...` en `f = decorator(f)`.

---

## 2. `functools.wraps` — préserver l'identité

### Le problème

```python
def naive_decorator(func):
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@naive_decorator
def add(a, b):
    """Additionne deux nombres."""
    return a + b

print(add.__name__)    # 'wrapper' — surprise !
print(add.__doc__)     # None — la docstring a disparu
```

Le wrapper a remplacé la fonction originale, donc ses métadonnées (`__name__`, `__doc__`, signature) sont perdues.

### La solution

```python
from functools import wraps

def good_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@good_decorator
def add(a, b):
    """Additionne deux nombres."""
    return a + b

print(add.__name__)    # 'add'
print(add.__doc__)     # 'Additionne deux nombres.'
```

`@wraps(func)` copie les métadonnées de `func` vers le wrapper. **À utiliser systématiquement** dans tout décorateur — sinon les outils (debuggers, Sphinx, IDE) afficheront des informations erronées.

---

## 3. Décorateurs avec arguments

### Le pattern à 3 niveaux

Quand un décorateur prend des paramètres, il faut un niveau d'imbrication supplémentaire :

```python
from functools import wraps

def repeat(times):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for _ in range(times):
                result = func(*args, **kwargs)
            return result
        return wrapper
    return decorator


@repeat(times=3)
def greet(name):
    print(f"hello {name}")

greet("Alice")
# hello Alice
# hello Alice
# hello Alice
```

L'évaluation se fait en deux temps :

1. `repeat(times=3)` est appelé → renvoie `decorator`.
2. `decorator(greet)` est appelé → renvoie `wrapper`.

C'est pourquoi un décorateur paramétré exige **trois niveaux** de fonctions : _factory → décorateur → wrapper_.

---

## 4. Décorer une classe + classe comme décorateur

### Décorer une classe

`@dataclass`, `@total_ordering`, `@final` (typing) : ces décorateurs s'appliquent à une classe et la modifient.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Point:
    x: float
    y: float
```

`@dataclass(frozen=True)` reçoit la classe `Point`, génère les méthodes manquantes, et la renvoie. Même mécanique que pour une fonction.

### Une classe comme décorateur

Si on a besoin d'un état entre appels, une classe peut servir de décorateur :

```python
class CallCounter:
    def __init__(self, func):
        self.func = func
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return self.func(*args, **kwargs)


@CallCounter
def hello():
    print("hello")

hello()
hello()
hello()
print(hello.calls)  # 3
```

`@CallCounter` équivaut à `hello = CallCounter(hello)`. L'instance est appelable (`__call__`) et expose son état (`.calls`).

---

## 5. Patterns courants

### Mesure de temps

```python
from functools import wraps
import time

def timer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.4f}s")
        return result
    return wrapper

@timer
def compute(n):
    return sum(i * i for i in range(n))

compute(1_000_000)
```

### Cache de résultats — `functools.lru_cache`

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

fib(50)   # rapide grâce au cache (sans cache, exponential blow-up)
```

`@cache` (Python 3.9+) est un alias de `@lru_cache(maxsize=None)`.

### Retry

```python
from functools import wraps
import time

def retry(times=3, delay=0.5, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last = None
            for _ in range(times):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last = e
                    time.sleep(delay)
            raise last
        return wrapper
    return decorator


@retry(times=3, exceptions=(ConnectionError,))
def fetch():
    ...
```

### Validation des arguments

```python
def positive(func):
    @wraps(func)
    def wrapper(n):
        if n < 0:
            raise ValueError(f"n must be >= 0, got {n}")
        return func(n)
    return wrapper

@positive
def sqrt(n):
    return n ** 0.5
```

### Décorateurs standards à connaître

- `@property` — transformer une méthode en attribut calculé.
- `@staticmethod`, `@classmethod` — déjà vus en M2.
- `@dataclass` — déjà vu en M4.
- `@functools.lru_cache`, `@functools.cache` — mémoïsation.
- `@functools.cached_property` — `@property` avec cache (calculé une fois par instance).
- `@functools.total_ordering` — génère les opérateurs de comparaison à partir de `__eq__` + `__lt__`.
- `@contextlib.contextmanager` — transformer un générateur en context manager (`with`).

---

## 6. Empilement de décorateurs

### Ordre d'application

```python
@A
@B
@C
def f():
    ...
```

Équivaut à `f = A(B(C(f)))`. Lecture **du bas vers le haut** à l'application :

1. `C` enveloppe `f` → `C_f`
2. `B` enveloppe `C_f` → `B_C_f`
3. `A` enveloppe `B_C_f` → `A_B_C_f`

À l'exécution, l'appel traverse les couches dans l'ordre **inverse** : A entre en premier (plus extérieur), C est le plus proche du code original.

```python
@timer            # extérieur — mesure le temps total y compris les retries
@retry(times=3)
def fetch():
    ...
```

Inverser change radicalement le sens :

```python
@retry(times=3)   # extérieur — retry inclut le temps mesuré
@timer
def fetch():
    ...
```

L'ordre **n'est jamais cosmétique** quand les décorateurs interagissent.

---

## 7. Paradigmes — trois manières de penser

### Théorie

Trois grandes familles :

| Paradigme       | Idée centrale                                            | Exemples Python                                         |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| **Impératif**   | Décrire les étapes (le _comment_)                        | Boucles, mutation, séquences de statements              |
| **Fonctionnel** | Décrire les transformations (le _quoi_)                  | `map`, `filter`, `reduce`, comprehensions, immutabilité |
| **Objet**       | Modéliser le domaine en entités avec état + comportement | Classes, méthodes, héritage                             |

**Analogie.** Trois outils dans une boîte à outils :

- Le **marteau** (impératif) — universel, direct, rapide pour les petits problèmes.
- Le **tournevis** (objet) — précis, idéal pour assembler de gros systèmes structurés.
- La **scie** (fonctionnel) — élégante pour découper un flux en transformations.

Aucun n'est meilleur ; le choix dépend du travail. Python est un langage **multi-paradigme** : on peut (et on doit) mélanger les trois.

### Le même calcul en trois paradigmes

Compter les mots de plus de 4 lettres dans une phrase.

**Impératif :**

```python
def count_long_words_imperative(text):
    count = 0
    for word in text.split():
        if len(word) > 4:
            count += 1
    return count
```

**Fonctionnel :**

```python
def count_long_words_functional(text):
    return sum(1 for w in text.split() if len(w) > 4)
```

**Objet :**

```python
class WordCounter:
    def __init__(self, text):
        self.words = text.split()

    def count_longer_than(self, threshold):
        return sum(1 for w in self.words if len(w) > threshold)


def count_long_words_oop(text):
    return WordCounter(text).count_longer_than(4)
```

Les trois donnent le même résultat. Lequel choisir ?

### Quand utiliser quoi

**Impératif** :

- Script court, traitement linéaire évident.
- Mutation explicitement souhaitée (accumulation, état progressif).
- Lisibilité maximale pour des collègues non spécialisés.

**Fonctionnel** :

- Transformation d'un flux de données (filter / map / reduce).
- Concurrence (les fonctions pures sont thread-safe par construction).
- Tests faciles (entrées → sorties, pas de side effects).
- Pipelines de traitement de données.

**Objet** :

- Plusieurs comportements partagent un même état (l'objet).
- Polymorphisme (plusieurs implémentations d'une même interface).
- Domaine métier complexe avec entités persistantes.
- Réutilisation par héritage ou composition.

### La réalité Python

La plupart des bons codes Python **mélangent les trois**. Une classe (objet) avec des méthodes qui utilisent des comprehensions (fonctionnel) et une boucle d'orchestration (impératif) : c'est l'idiome courant.

```python
class Pipeline:
    def __init__(self, steps):
        self.steps = steps              # objet

    def run(self, items):
        for step in self.steps:         # impératif
            items = [step(x) for x in items]  # fonctionnel
        return items
```

L'erreur à éviter : forcer un paradigme par dogmatisme. Quand le code devient tordu pour rester "pure functional" ou "tout objet", c'est qu'on lutte contre le langage.

---

## 8. Heuristique de choix de paradigme

Trois questions pour orienter :

1. **Est-ce que le problème est essentiellement une transformation de données ?**
   - Oui → fonctionnel (comprehensions, generators, `map`/`filter`).
2. **Y a-t-il un état persistant manipulé par plusieurs comportements ?**
   - Oui → objet.
3. **Le problème est-il court, linéaire, sans abstraction nécessaire ?**
   - Oui → impératif.

Pour les problèmes plus larges, identifier les sous-parties et appliquer la question à chacune.

---

## 9. Exercices pratiques

### Exercice 1 — Décorateur simple (≈ 15 min)

Écrire un décorateur `@log_calls` qui imprime le nom de la fonction, ses arguments, et son retour à chaque appel.

```python
@log_calls
def add(a, b):
    return a + b

add(2, 3)
# Calling add(2, 3)
# add returned 5
```

Utiliser `@functools.wraps`. Vérifier que `add.__name__` reste `'add'`.

### Exercice 2 — Décorateur paramétré (≈ 25 min)

Écrire un décorateur `@validate(*types)` qui vérifie le type de chaque argument positionnel :

```python
@validate(int, int)
def add(a, b):
    return a + b

add(2, 3)            # 5
add("a", "b")        # TypeError: expected int, got str
```

**Bonus** : étendre `@validate(*types, **kwtypes)` pour gérer aussi les arguments nommés.

### Exercice 3 — Classe comme décorateur (≈ 25 min)

Écrire une classe `RateLimiter` utilisable comme décorateur, qui limite une fonction à `max_calls` appels par fenêtre glissante de `period` secondes.

```python
@RateLimiter(max_calls=5, period=1.0)
def api_call():
    ...
```

Au-delà de 5 appels par seconde, l'appel suivant doit lever `RuntimeError("rate limit exceeded")`.

### Exercice 4 — Empilement (≈ 20 min)

Combiner `@timer` et `@retry(times=3, exceptions=(ConnectionError,))` sur une même fonction.

1. Tester d'abord `@timer` au-dessus de `@retry` : le timer inclut-il les retries ?
2. Inverser l'ordre. Comparer les sorties.
3. Documenter en commentaire quel ordre est généralement souhaité, et pourquoi.

### Exercice 5 — Trois paradigmes pour un même algorithme (≈ 30 min)

Implémenter en trois versions une fonction qui prend une liste d'opérations bancaires (chaque opération est un `dict` avec `type` parmi `["debit", "credit"]` et `amount`) et renvoie le solde final :

- Version **impérative** (boucle, accumulateur).
- Version **fonctionnelle** (`functools.reduce` ou expression en une ligne).
- Version **objet** (classe `Account` avec `apply(operation)` et `balance`).

Comparer les trois sur trois axes : lisibilité, testabilité, extensibilité (par exemple : ajouter une commission par opération).

---

## 10. Mini-défi de synthèse (≈ 1 à 2 heures)

Concevoir un système de _plugins_ paramétrés via décorateurs :

```python
@plugin(name="uppercase", priority=10)
def to_upper(text):
    return text.upper()

@plugin(name="reverse", priority=5)
def reverse(text):
    return text[::-1]
```

`@plugin(...)` enregistre la fonction dans un registre global (`plugin_registry`) avec son nom et sa priorité.

`build_pipeline()` renvoie une fonction qui applique tous les plugins en chaîne, dans l'ordre de **priorité décroissante**.

```python
pipeline = build_pipeline()
pipeline("hello")   # "OLLEH" — uppercase (priority 10), puis reverse (priority 5)
```

**Bonus** : ajouter un décorateur `@traced` qui log chaque étape (empilable avec `@plugin`).

```python
@traced
@plugin(name="uppercase", priority=10)
def to_upper(text):
    return text.upper()
```

Validation : `pipeline("hello")` doit produire `"OLLEH"` et logger l'entrée/sortie de chaque plugin si `@traced` est appliqué.

---

## 11. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant peut expliquer ce qu'est un décorateur en une phrase, avec une analogie.
- [ ] Il sait écrire un décorateur simple, paramétré, et basé sur une classe.
- [ ] Il utilise `@functools.wraps` systématiquement.
- [ ] Il peut prédire le comportement d'une pile de décorateurs avant exécution.
- [ ] Il peut citer 3 décorateurs standards de la stdlib et leur usage.
- [ ] Il distingue les trois paradigmes et peut implémenter le même algorithme dans deux d'entre eux.
- [ ] Il peut justifier son choix de paradigme sur un problème donné, sans dogmatisme.

**Items du glossaire visés** (passage P/N → A) : N3 #10 (choix de paradigme), #17 (décorateurs).

---

## 12. Ressources complémentaires

- **Documentation officielle** : _functools_ — section sur les décorateurs et `wraps`.
- **PEP 318** — _Decorators for Functions and Methods_ (la PEP fondatrice).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitres 7, 9, 18 — fonctions de première classe, décorateurs, programmation fonctionnelle.
- **Real Python** — articles _Primer on Python Decorators_ et _Functional Programming in Python_.
- **Raymond Hettinger** — _Transforming Code into Beautiful, Idiomatic Python_ (conférence PyCon 2013, illustration des paradigmes en pratique).
