# M7 — Polymorphisme avancé

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **trois formes de polymorphisme** : par héritage, paramétrique, par surcharge.
- Différencier polymorphisme **dynamique** (résolu au runtime) et **statique** (résolu à la compilation).
- Lire un **MRO** et prédire l'ordre d'appel des méthodes.
- Illustrer chaque forme dans un mini-projet.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M6 POO.
- Parcours Python M3 (MRO et `super()` en détail).

---

## 1. Rappel — qu'est-ce que le polymorphisme

Le **polymorphisme** ("plusieurs formes") permet à un même **message** ou une même **opération** de produire des comportements différents selon le contexte.

C'est l'un des 4 piliers de la POO (M1). Cette module l'approfondit en distinguant **trois formes** dont chacune répond à un besoin différent :

| Forme                        | Idée                                                   | Exemple Python                       |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------ |
| **Par héritage (subtype)**   | Une méthode redéfinie dans une sous-classe             | `Dog.speak()` vs `Cat.speak()`       |
| **Paramétrique (générique)** | Un même code fonctionne avec différents types          | `list[int]`, `list[str]`, `Stack[T]` |
| **Par surcharge (ad-hoc)**   | Plusieurs versions de la même fonction selon les types | Plus courant en Java/C++             |

Chaque forme se distingue aussi par **quand** la résolution se fait :

- **Dynamique** — au runtime, selon le type réel de l'objet (héritage).
- **Statique** — à la compilation, selon le type déclaré (surcharge).

On en parle dans la section 6.

---

## 2. Polymorphisme par héritage

### Théorie

C'est la forme la plus visible et la plus courante en OO. Une méthode définie dans une **classe parente** est **redéfinie** (override) dans des **sous-classes**. Le code qui utilise l'objet ne connaît que la classe parente — c'est Python qui dispatche vers la bonne implémentation au runtime.

**Analogie.** Le verbe **"appuyer"**. Tu peux appuyer sur un interrupteur (allume une lampe), sur une touche de piano (joue une note), sur une porte (ouverture). Le geste reste le même, le résultat dépend de l'objet.

### Démonstration

```python
class Animal:
    def speak(self) -> str:
        raise NotImplementedError


class Dog(Animal):
    def speak(self): return "Wouaf"

class Cat(Animal):
    def speak(self): return "Miaou"

class Cow(Animal):
    def speak(self): return "Meuh"


animals: list[Animal] = [Dog(), Cat(), Cow()]
for a in animals:
    print(a.speak())   # Wouaf, Miaou, Meuh
```

Le **code de la boucle** ne change pas si on ajoute `Sheep`. C'est ce qui rend le polymorphisme puissant — il ouvre le code à l'extension (OCP, M5).

### Lien avec LSP

Pour que le polymorphisme par héritage **marche**, les sous-classes doivent **respecter le contrat** de la parente — c'est exactement le Principe de Substitution de Liskov (M5). Une sous-classe qui lève `NotImplementedError` casse le polymorphisme.

### Duck typing — polymorphisme sans héritage formel

```python
class Email:
    def send(self): print("email sent")

class Sms:
    def send(self): print("sms sent")

class Slack:
    def send(self): print("slack sent")


def notify(channel):
    channel.send()


for c in [Email(), Sms(), Slack()]:
    notify(c)
```

Aucun héritage. Tant que les classes ont `send()`, elles "passent pour" un canal. C'est du **polymorphisme structurel** : _si ça caquette comme un canard..._ (cf. `Protocol`, POO M3).

---

## 3. Polymorphisme paramétrique

### Théorie

Un **même code** fonctionne pour **plusieurs types** sans être réécrit. Les types deviennent des **paramètres**.

C'est ce qu'on appelle les **génériques** : `list[int]`, `list[str]`, `Stack[T]`, `dict[K, V]`...

**Analogie.** Une caisse de transport. Que tu y mettes des livres, des fruits ou des outils, la caisse fait le même travail (transporter). Le **contenu** est paramétrable, la **forme** est constante.

### En Python — `TypeVar`

```python
from typing import TypeVar

T = TypeVar("T")

def first(items: list[T]) -> T:
    return items[0]


first([1, 2, 3])     # T = int, renvoie int
first(["a", "b"])    # T = str, renvoie str
```

Le type de retour **dépend du type d'entrée**, sans avoir à dupliquer la fonction.

### Classes génériques

```python
from typing import TypeVar, Generic

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


int_stack: Stack[int] = Stack()
int_stack.push(1)
int_stack.push("oops")   # ✗ mypy refuse — pas un int

str_stack: Stack[str] = Stack()
str_stack.push("hello")
```

`Stack[T]` est une **classe générique**. Une fois paramétrée (`Stack[int]`), le type checker garantit que seules les valeurs `int` y entrent et en sortent.

### Syntaxe moderne — Python 3.12+

PEP 695 introduit une syntaxe plus concise :

```python
class Stack[T]:
    def __init__(self):
        self._items: list[T] = []

    def push(self, item: T): self._items.append(item)
    def pop(self) -> T: return self._items.pop()
```

Plus de `TypeVar` ni `Generic[T]`. Cette syntaxe est l'avenir pour les nouveaux projets en Python 3.12+.

### Contraintes de type

```python
from typing import TypeVar

Number = TypeVar("Number", int, float)


def double(x: Number) -> Number:
    return x * 2


double(3)       # int → int
double(3.0)     # float → float
double("hello") # ✗ refusé : str pas dans la contrainte
```

Ou via une borne supérieure :

```python
T = TypeVar("T", bound="Comparable")

def max_(a: T, b: T) -> T:
    return a if a > b else b
```

`T` doit être une **sous-classe** (ou implémenter le protocole) `Comparable`.

### Approfondissement

Le polymorphisme paramétrique est le sujet **central** du module **M11 (Généricité)**. Ici, on retient surtout :

- Il existe en Python avec `TypeVar` et `Generic`.
- Il est **vérifié statiquement** (mypy / pyright), pas au runtime.
- Il complète le polymorphisme par héritage : un `Stack[T]` peut être substitué pour n'importe quel type.

---

## 4. Polymorphisme par surcharge (ad-hoc)

### Théorie

Plusieurs **fonctions du même nom** coexistent, distinguées par leurs **signatures** (nombre ou type des paramètres). Le compilateur ou l'interpréteur choisit la bonne version à l'appel.

**Analogie.** Le mot "**voler**" :

- _Je vole un sac à main_ — verbe de soustraction.
- _Je vole en avion_ — verbe de déplacement aérien.

Le contexte (la phrase, les compléments) lève l'ambiguïté.

### En Java / C++

```java
class Calculator {
    int sum(int a, int b) { return a + b; }
    double sum(double a, double b) { return a + b; }
    int sum(int a, int b, int c) { return a + b + c; }
}

Calculator c = new Calculator();
c.sum(1, 2);           // appelle le premier
c.sum(1.5, 2.5);       // appelle le deuxième
c.sum(1, 2, 3);        // appelle le troisième
```

### En Python — pas de surcharge native

Python **ne supporte pas** la surcharge classique. Définir deux fonctions du même nom = la seconde **remplace** la première.

```python
class Calculator:
    def sum(self, a, b):
        return a + b

    def sum(self, a, b, c):     # remplace la précédente !
        return a + b + c


Calculator().sum(1, 2)          # TypeError : missing argument
```

### Comment l'imiter

**Option 1 — Paramètres optionnels** :

```python
class Calculator:
    def sum(self, a, b, c=0):
        return a + b + c

Calculator().sum(1, 2)          # 3
Calculator().sum(1, 2, 3)       # 6
```

**Option 2 — `@functools.singledispatch`** :

```python
from functools import singledispatch


@singledispatch
def render(value):
    return str(value)

@render.register
def _(value: int):
    return f"Number: {value}"

@render.register
def _(value: str):
    return f"Text: '{value}'"

@render.register
def _(value: list):
    return f"List of {len(value)} items"


render(42)             # "Number: 42"
render("hello")        # "Text: 'hello'"
render([1, 2, 3])      # "List of 3 items"
```

`singledispatch` choisit la fonction selon le **type du premier argument**. C'est une **surcharge sur un seul paramètre**, mais utile.

**Option 3 — `@overload` pour le typage** :

```python
from typing import overload


@overload
def fetch(query: int) -> str: ...
@overload
def fetch(query: str) -> list[str]: ...

def fetch(query):
    if isinstance(query, int):
        return f"id: {query}"
    else:
        return [query, query]


x = fetch(42)        # mypy infère str
y = fetch("hello")   # mypy infère list[str]
```

`@overload` ne fait **que documenter** les signatures pour le type checker. L'implémentation réelle gère elle-même les cas.

### Pourquoi Python évite

Python privilégie le **duck typing** et le **polymorphisme par héritage** ou **paramétrique**. La surcharge à la Java :

- Force à déclarer plusieurs signatures verbose.
- Ne fonctionne pas avec le typage dynamique pur.
- Le besoin est souvent résolu plus élégamment via défauts ou `*args/**kwargs`.

---

## 5. Polymorphisme dynamique vs statique

### Théorie

| Type          | Résolution                                | Coût                | Sécurité              |
| ------------- | ----------------------------------------- | ------------------- | --------------------- |
| **Dynamique** | Au runtime, selon le type réel de l'objet | Léger dispatch      | Erreurs au runtime    |
| **Statique**  | À la compilation, selon le type déclaré   | Aucun (déjà résolu) | Erreurs détectées tôt |

### Python est dynamique par défaut

```python
class Animal:
    def speak(self): print("generic")

class Dog(Animal):
    def speak(self): print("Wouaf")


a: Animal = Dog()
a.speak()       # "Wouaf" — Python regarde le type RÉEL (Dog), pas déclaré (Animal)
```

Le dispatch est **dynamique** : Python regarde `type(a)` à l'exécution et choisit `Dog.speak()`.

### Java / C++ supportent les deux

```java
Animal a = new Dog();
a.speak();      // Dispatch dynamique sur les méthodes virtuelles (default en Java)
```

Mais :

```java
class Helper {
    static void log(Animal a) { System.out.println("animal"); }
    static void log(Dog d) { System.out.println("dog"); }
}

Animal a = new Dog();
Helper.log(a);     // "animal" — dispatch STATIQUE basé sur le type déclaré !
```

La surcharge en Java est **statique** : le compilateur choisit en fonction du type déclaré.

### En Python avec `singledispatch`

`singledispatch` regarde le **type réel** :

```python
@singledispatch
def log(x): print("generic")

@log.register
def _(x: int): print("int")

@log.register
def _(x: bool): print("bool")    # bool est une sous-classe d'int


log(True)         # "bool" — dispatch dynamique sur type(True) = bool
```

Avantage : précision. Inconvénient : peut surprendre quand on attend la résolution statique habituelle.

---

## 6. MRO en pratique

### Rappel

Le **MRO** (Method Resolution Order) est l'ordre dans lequel Python consulte les classes pour résoudre une méthode. Voir Python M3 pour le détail théorique (linéarisation C3, contraintes).

Ici, on retient l'application **côté polymorphisme** :

- Quand on appelle `obj.method()`, Python prend la **première** classe du MRO de `type(obj)` qui définit `method`.
- `super()` appelle la **classe suivante** dans le MRO, pas le parent direct.

### Inspecter le MRO

```python
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass

print(D.__mro__)
# (D, B, C, A, object)
```

### Cas typique du diamant

```python
class Tool:
    def use(self): print("Tool")

class Hammer(Tool):
    def use(self):
        print("Hammer")
        super().use()

class Screwdriver(Tool):
    def use(self):
        print("Screwdriver")
        super().use()

class MultiTool(Hammer, Screwdriver):
    def use(self):
        print("MultiTool")
        super().use()


MultiTool().use()
# MultiTool
# Hammer
# Screwdriver
# Tool
```

Le MRO est `MultiTool → Hammer → Screwdriver → Tool → object`. Chaque `super().use()` appelle la **classe suivante** dans cette liste.

### Pourquoi c'est lié au polymorphisme

C'est exactement le **polymorphisme par héritage** appliqué à des **hiérarchies en diamant**. Sans MRO, le polymorphisme serait ambigu (quelle méthode appeler ?). Le MRO **garantit** un ordre prévisible.

---

## 7. Exercices pratiques

### Exercice 1 — Identifier la forme (≈ 20 min)

Pour chaque cas, indiquer le ou les types de polymorphisme à l'œuvre :

```python
# Cas A
class Vehicle:
    def fuel_cost(self, km): raise NotImplementedError

class Car(Vehicle):
    def fuel_cost(self, km): return km * 0.08

class Truck(Vehicle):
    def fuel_cost(self, km): return km * 0.20


vehicles = [Car(), Truck()]
for v in vehicles:
    print(v.fuel_cost(100))
```

```python
# Cas B
from functools import singledispatch

@singledispatch
def export(data): return str(data)

@export.register
def _(data: dict): return json.dumps(data)

@export.register
def _(data: list): return ",".join(map(str, data))
```

```python
# Cas C
from typing import TypeVar

T = TypeVar("T")

def first_or_default(items: list[T], default: T) -> T:
    return items[0] if items else default
```

```python
# Cas D
class Container:
    def __getitem__(self, key):
        return self._data[key]

# Container() supporte indexation comme une liste ou un dict selon ce qu'on lui passe
```

### Exercice 2 — Héritage propre (≈ 30 min)

Concevoir une hiérarchie :

- `Shape` (abstraite) avec `area() -> float`.
- `Circle`, `Square`, `Triangle` qui implémentent.

Écrire une fonction `total_area(shapes: list[Shape]) -> float` qui marche sans modification quand on ajoute `Pentagon`.

Vérifier le polymorphisme avec une boucle.

### Exercice 3 — Générique typé (≈ 30 min)

Implémenter une classe `LRUCache[K, V]` avec :

- `get(key: K) -> V | None`.
- `set(key: K, value: V) -> None`.
- Capacité fixe (oldest evicted first).

Tester avec `LRUCache[str, int]` et `LRUCache[int, str]`. Vérifier en mypy strict que les types sont respectés.

**Bonus** : syntaxe Python 3.12+ (`class LRUCache[K, V]:`).

### Exercice 4 — `singledispatch` (≈ 25 min)

Implémenter une fonction `format_for_display(value)` qui :

- `int` → `f"{value:,}"` (séparateur de milliers).
- `float` → `f"{value:.2f}"`.
- `datetime` → ISO 8601.
- `list` → ", ".join(repr(item) for item in value).
- Tout autre type → `str(value)`.

Utiliser `@singledispatch`.

### Exercice 5 — Tracer le MRO (≈ 25 min)

Soit :

```python
class A:
    def m(self):
        print("A")

class B(A):
    def m(self):
        print("B")
        super().m()

class C(A):
    def m(self):
        print("C")
        super().m()

class D(B, C):
    def m(self):
        print("D")
        super().m()
```

1. Prédire `D.__mro__` sans exécuter.
2. Prédire la sortie de `D().m()` ligne par ligne.
3. Modifier la hiérarchie pour que `D` hérite de `(C, B)` au lieu de `(B, C)`. Re-prédire le MRO et la sortie.

---

## 8. Mini-défi de synthèse (≈ 2 à 3 heures)

Concevoir un **mini-projet de pipeline de transformation de données** qui illustre les **trois formes** de polymorphisme.

**Domaine** : traiter des données d'origines variées (CSV, JSON, fichier texte) et appliquer des transformations.

**Polymorphisme par héritage** :

- Classe abstraite `DataSource` avec `read() -> list[dict]`.
- Implémentations : `CsvSource`, `JsonSource`, `TextSource`.

**Polymorphisme paramétrique** :

- Classe `Pipeline[T]` (générique) qui chaîne des transformations.
- Méthodes : `add(fn: Callable[[T], T]) -> Pipeline[T]`, `run(items: list[T]) -> list[T]`.

**Polymorphisme par surcharge (singledispatch)** :

- Fonction `serialize(data)` qui :
  - `dict` → JSON.
  - `list[dict]` → JSON array.
  - `str` → texte brut.
  - Autres → `repr()`.

**Test de scénario** :

```python
source: DataSource = JsonSource("input.json")
data = source.read()

pipeline: Pipeline[dict] = (
    Pipeline[dict]()
    .add(lambda x: {**x, "uppercase_name": x["name"].upper()})
    .add(lambda x: {**x, "id_squared": x["id"] ** 2})
)

result = pipeline.run(data)

with open("output.txt", "w") as f:
    f.write(serialize(result))
```

**Validation** :

- [ ] Chaque forme de polymorphisme est documentée par un commentaire dans le code.
- [ ] L'ajout d'un nouveau `DataSource` ne modifie pas le code du pipeline.
- [ ] `Pipeline[int]` et `Pipeline[dict]` cohabitent sans warning mypy.
- [ ] `serialize` accepte au moins 4 types différents sans `isinstance` direct.

---

## 9. Auto-évaluation

Le module M7 est validé lorsque :

- [ ] L'apprenant peut citer les 3 formes de polymorphisme et donner un exemple Python pour chacune.
- [ ] Il distingue dynamique et statique et sait que Python est dynamique par défaut.
- [ ] Il prédit correctement un MRO et la sortie d'un appel impliquant `super()`.
- [ ] Il sait utiliser `TypeVar` et `Generic` pour une classe paramétrée.
- [ ] Il connaît `singledispatch` et `@overload` comme alternatives à la surcharge.
- [ ] Le mini-défi est implémenté avec les 3 formes documentées.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : trois types de polymorphisme.
- **N3** : polymorphisme dynamique vs statique, MRO (consolidation après Python M3).

---

## 10. Ressources complémentaires

- **Documentation Python** — `typing.TypeVar`, `typing.Generic`, `typing.overload`, `functools.singledispatch`.
- **PEP 695** — _Type Parameter Syntax_ (syntaxe de génériques de Python 3.12+).
- **PEP 3119** — _Introducing Abstract Base Classes_.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 14 — _Inheritance: For Better or for Worse_.
- **Real Python** — articles _Single Dispatch Generic Functions_ et _Python Type Checking - Generics_.
- **Wikipedia** — _Polymorphism (computer science)_ : vue d'ensemble des formes de polymorphisme dans les langages.
