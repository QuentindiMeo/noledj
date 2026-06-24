# M3 — MRO et héritage multiple

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est le **MRO** (Method Resolution Order) et pourquoi il existe.
- Lire un MRO via `Cls.__mro__` ou `Cls.mro()` et prédire l'ordre d'appel des méthodes.
- Comprendre la **linéarisation C3** sans avoir à la calculer à la main (mais en sachant ses 3 règles).
- Utiliser **`super()`** correctement, y compris en héritage multiple.
- Reconnaître un **diamant d'héritage** et savoir l'orchestrer ou le refactorer.
- Choisir entre héritage multiple et composition selon le contexte.

## Durée estimée

1 à 1,5 jours (concept dense mais focalisé).

## Pré-requis

- M2 terminé (mixins et dunders, qui s'appuient sur le MRO).
- Item N3 #13 du plan de remédiation identifié dans M1.

---

## 1. Le problème du diamant

### Théorie

L'héritage simple est facile : une classe a un parent, qui a un parent, qui a un parent — chaîne linéaire, pas d'ambiguïté. Quand on appelle `obj.method()`, Python remonte la chaîne jusqu'à trouver la méthode.

L'héritage multiple casse cette linéarité. Considérons quatre classes :

```python
class Tool:
    def use(self):
        print("Tool")

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
```

`MultiTool` hérite de `Hammer` et `Screwdriver`, qui héritent tous deux de `Tool`. C'est un **diamant** :

```diagram
        Tool
       /    \
   Hammer  Screwdriver
       \    /
      MultiTool
```

Question : dans quel ordre `MultiTool().use()` appelle-t-il les méthodes ? Et surtout, `Tool.use()` doit-il être appelé une fois ou deux fois ?

**Analogie.** Quatre routes qui se rejoignent en losange. Si l'on part du bas et qu'on veut atteindre le sommet, il faut choisir un ordre de passage par les nœuds intermédiaires. Sans règle, c'est l'anarchie. Le MRO est la carte routière qui fixe cet ordre.

---

## 2. MRO — Method Resolution Order

### Théorie

Le MRO est la **liste ordonnée** des classes consultées pour résoudre un attribut ou une méthode. Python génère cette liste à la création de la classe en suivant l'algorithme **C3 linearization**.

On l'inspecte ainsi :

```python
print(MultiTool.__mro__)
# (<class 'MultiTool'>, <class 'Hammer'>, <class 'Screwdriver'>, <class 'Tool'>, <class 'object'>)

# Équivalent :
print(MultiTool.mro())
```

Règle d'or : **on lit la méthode dans la première classe du MRO qui la définit**. Pas la première rencontrée en remontant l'arbre — la première dans la liste linéaire.

### Trace sur l'exemple

```python
MultiTool().use()
# MultiTool
# Hammer
# Screwdriver
# Tool
```

Chaque `super().use()` appelle la **suivante dans le MRO**, pas le parent direct. Quand `Hammer.use()` fait `super().use()`, ça n'appelle **pas** `Tool.use()` — ça appelle `Screwdriver.use()`, parce que dans le MRO de `MultiTool`, c'est `Screwdriver` qui vient juste après `Hammer`.

C'est la principale source de confusion : **`super()` ne signifie pas "appelle le parent". Il signifie "appelle le suivant dans le MRO en cours"**.

---

## 3. Linéarisation C3 — les 3 règles

### Théorie

L'algorithme C3 produit la liste MRO en respectant trois contraintes :

1. **La classe d'abord.** Une classe vient avant ses ancêtres.
2. **L'ordre des parents.** Si une classe hérite de `(A, B)`, alors `A` vient avant `B` dans le MRO.
3. **Pas de duplication.** Une classe n'apparaît qu'une seule fois.

Ces trois contraintes sont parfois incompatibles — auquel cas Python lève `TypeError: Cannot create a consistent method resolution order`.

**Analogie.** Construire un classement final à partir de classements partiels. Si une épreuve dit A bat B et qu'une autre dit B bat A, on ne peut pas produire un classement cohérent. Python refuse alors la création de la classe.

### Exemple impossible

```python
class A: pass
class B(A): pass
class C(A, B): pass  # TypeError
```

`C` exige : `A` avant `B` (selon l'ordre des parents dans `C(A, B)`), mais `B` avant `A` (puisque `B` hérite de `A`, règle 1 appliquée à `B`). Conflit.

### Exemple résolvable

```python
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass

print(D.__mro__)
# (D, B, C, A, object)
```

`B` précède `A` (règle 1), `B` précède `C` (règle 2 sur `D`), `C` précède `A` (règle 1). Tout est compatible : `D → B → C → A → object`.

### Astuce pratique

On n'a quasi jamais besoin de calculer le MRO à la main. Il suffit de l'**imprimer** :

```python
print(MyClass.__mro__)
```

Et de vérifier que l'ordre obtenu correspond à l'intention. Si l'ordre paraît surprenant, c'est souvent que la hiérarchie devrait être refactorée.

---

## 4. `super()` — le suivant dans la chaîne

### Théorie

`super()` ne demande **pas** "donne-moi mon parent". Elle demande "donne-moi la classe suivante dans le MRO en cours". Cette nuance change tout en héritage multiple.

**Analogie.** Une chaîne radio coopérative où chaque émetteur passe la parole au suivant. Quand tu finis de parler, tu ne sais pas forcément qui parle après toi — tu sais juste qu'il y a un suivant, désigné par une liste préétablie (le MRO).

### Trace pas à pas

Reprenons :

```python
class Tool:
    def use(self):
        print("Tool")

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
```

MRO de `MultiTool` : `MultiTool → Hammer → Screwdriver → Tool → object`.

| Étape | Méthode appelée   | `super()` à l'instant   | Sortie        |
| ----- | ----------------- | ----------------------- | ------------- |
| 1     | `MultiTool.use`   | suivant = `Hammer`      | `MultiTool`   |
| 2     | `Hammer.use`      | suivant = `Screwdriver` | `Hammer`      |
| 3     | `Screwdriver.use` | suivant = `Tool`        | `Screwdriver` |
| 4     | `Tool.use`        | (pas de super)          | `Tool`        |

Si `Hammer.use` faisait `Tool.use(self)` directement à la place de `super().use()`, on **sauterait** `Screwdriver` — comportement subtilement bugué.

### Syntaxes

```python
class Child(Parent):
    def method(self):
        super().method()              # Python 3, recommandé
        super(Child, self).method()   # forme explicite, rarement nécessaire
```

La forme courte `super()` fonctionne dans 99 % des cas. La forme explicite reste utile en méta-programmation (par exemple quand `__class__` n'est pas accessible).

---

## 5. Le contrat coopératif

### Théorie

Pour que `super()` fonctionne dans une hiérarchie en diamant, **chaque classe doit appeler `super()`** à un moment de sa méthode. Si une classe oublie d'appeler `super()`, la chaîne se rompt et les classes en aval du MRO ne sont jamais exécutées.

**Règle implicite.** L'héritage multiple coopératif suppose un contrat : toutes les classes participantes appellent `super()`. Casser ce contrat introduit des bugs silencieux.

### Démonstration de la rupture

```python
class A:
    def setup(self):
        print("A")

class B(A):
    def setup(self):
        print("B")
        # ✗ pas de super() — rupture du contrat

class C(A):
    def setup(self):
        print("C")
        super().setup()

class D(B, C):
    def setup(self):
        print("D")
        super().setup()


D().setup()
# D
# B
# (C et A ne sont jamais appelés)
```

`B.setup` n'appelle pas `super()`, donc `C` et `A` sont silencieusement skippés malgré leur présence dans le MRO.

### Cas particulier de `object`

`object` est tout en bas de tout MRO. Certaines méthodes comme `__init__` appellent `super().__init__()` qui finit par toucher `object.__init__()` — qui n'accepte aucun argument. Pour concevoir une hiérarchie coopérative avec des paramètres, on utilise typiquement `**kwargs` :

```python
class A:
    def __init__(self, *, a_value=None, **kwargs):
        self.a_value = a_value
        super().__init__(**kwargs)

class B:
    def __init__(self, *, b_value=None, **kwargs):
        self.b_value = b_value
        super().__init__(**kwargs)

class C(A, B):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


c = C(a_value=1, b_value=2)
print(c.a_value, c.b_value)  # 1 2
```

Chaque classe consomme ce qu'elle connaît (par keyword-only) et passe le reste. Le dernier `super().__init__(**kwargs)` arrive à `object.__init__()` avec un dict vide — pas d'erreur.

---

## 6. Quand l'héritage multiple est-il une bonne idée ?

### Critères

L'héritage multiple a un coût cognitif élevé. Il est légitime quand :

- Les classes parentes sont **conçues** pour coexister (mixins, pas hiérarchies métier complètes).
- Les responsabilités sont **disjointes** (pas de méthodes en collision sémantique).
- Le MRO produit reste **lisible** (peu de classes, hiérarchie peu profonde).

Il est suspect quand :

- Deux parents définissent la même méthode "métier" avec des sémantiques différentes.
- L'ordre des parents dans la déclaration change le comportement de manière non triviale.
- On comprend mal le MRO obtenu.

### Refactor alternatif

Souvent, un héritage multiple douteux peut être remplacé par :

- **Composition** (avoir un attribut au lieu d'hériter).
- **Délégation explicite** (méthodes qui appellent un objet interne).
- **Protocoles / interfaces** (séparer la signature du comportement).

Heuristique : si l'héritage multiple sert à _réutiliser du code_, c'est probablement une composition. S'il sert à _coexister polymorphiquement_, c'est probablement un héritage légitime — typiquement des mixins.

---

## 7. Exercices pratiques

### Exercice 1 — Lire un MRO (≈ 10 min)

Pour chaque hiérarchie ci-dessous, **prédire le MRO sur papier** avant d'exécuter, puis comparer.

```python
# Cas 1
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass
print(D.__mro__)
```

```python
# Cas 2
class X: pass
class Y: pass
class Z(X, Y): pass
class W(Y, X): pass
class T(Z, W): pass
print(T.__mro__)
```

Le cas 2 lève une `TypeError`. Pourquoi ?

### Exercice 2 — Tracer `super()` (≈ 20 min)

Avec la hiérarchie suivante, prédire la sortie ligne par ligne avant exécution :

```python
class Animal:
    def speak(self):
        print("Animal")

class Mammal(Animal):
    def speak(self):
        print("Mammal")
        super().speak()

class Bird(Animal):
    def speak(self):
        print("Bird")
        super().speak()

class Bat(Mammal, Bird):
    def speak(self):
        print("Bat")
        super().speak()


Bat().speak()
```

**Bonus** : remplacer `class Bat(Mammal, Bird)` par `class Bat(Bird, Mammal)` et prédire la nouvelle sortie.

### Exercice 3 — Casser et réparer le contrat coopératif (≈ 30 min)

Soit la hiérarchie suivante avec une méthode `audit` censée logger chaque étape :

```python
class Logger:
    def audit(self, message):
        print(f"Logger: {message}")

class Validator(Logger):
    def audit(self, message):
        print(f"Validator: {message}")
        # ✗ super() manquant

class Persister(Logger):
    def audit(self, message):
        print(f"Persister: {message}")
        super().audit(message)

class Service(Validator, Persister):
    def audit(self, message):
        print(f"Service: {message}")
        super().audit(message)


Service().audit("save")
```

1. Exécuter et constater quelles classes manquent à l'appel.
2. Corriger `Validator` pour respecter le contrat coopératif.
3. Vérifier que la sortie complète attendue est `Service → Validator → Persister → Logger`.

### Exercice 4 — Diamant avec paramètres (≈ 30 min)

Concevoir une hiérarchie en diamant respectant le contrat coopératif sur `__init__` :

```python
class Vehicle:
    def __init__(self, *, wheels, **kwargs):
        self.wheels = wheels
        super().__init__(**kwargs)

class Electric:
    def __init__(self, *, battery_kwh, **kwargs):
        self.battery_kwh = battery_kwh
        super().__init__(**kwargs)

class Autonomous:
    def __init__(self, *, sensors, **kwargs):
        self.sensors = sensors
        super().__init__(**kwargs)


class Robotaxi(Vehicle, Electric, Autonomous):
    # Compléter le __init__ pour que :
    # Robotaxi(wheels=4, battery_kwh=80, sensors=12) fonctionne
    ...
```

Vérifier que les trois attributs sont correctement initialisés et que le MRO se termine sur `object` sans erreur.

### Exercice 5 — Refactor anti-diamant (≈ 30 min)

Soit la conception suivante :

```python
class Reader:
    def open(self, path): ...
    def read(self): ...

class Writer:
    def open(self, path): ...
    def write(self, data): ...

class ReadWriter(Reader, Writer):
    pass
```

`Reader.open` et `Writer.open` ont la même signature mais des sémantiques différentes (mode lecture vs écriture). Le MRO va appeler une seule des deux, ce qui corrompt silencieusement l'autre comportement.

Refactorer en **composition** : `ReadWriter` détient un `_reader` et un `_writer` au lieu d'en hériter, et expose des méthodes explicites (`open_read`, `open_write`, `read`, `write`).

---

## 8. Auto-évaluation

Le module M3 est validé lorsque :

- [ ] L'apprenant peut expliquer pourquoi le MRO existe sans pré-requis.
- [ ] Lire un `__mro__` et prédire l'ordre d'appel sans exécuter.
- [ ] Citer les 3 contraintes de la linéarisation C3.
- [ ] Expliquer pourquoi `super()` ≠ "appelle le parent".
- [ ] Identifier une rupture du contrat coopératif dans du code donné.
- [ ] Concevoir une hiérarchie coopérative avec `__init__` passant `**kwargs`.
- [ ] Donner deux critères pour choisir entre héritage multiple et composition.

**Item du glossaire visé** (passage P/N → A) : N3 #13 (MRO + influence de `super()`).

---

## 9. Ressources complémentaires

- **Documentation officielle** : _The Python 2.3 Method Resolution Order_ (Guido van Rossum) — explication historique de C3. [python.org/download/releases/2.3/mro](https://www.python.org/download/releases/2.3/mro/)
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 14 — _Inheritance: For Better or for Worse_.
- **Raymond Hettinger** — _Python's super() considered super!_ (article de référence, à lier lors de la rédaction finale).
- **Real Python** — article _Supercharge Your Classes With Python super()_.
