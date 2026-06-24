# M1 — Audit Python et plan de remédiation

## Objectif

Le module M1 ouvre le parcours Python avec un constat : avec un niveau de départ à 2,5 sur 4, une partie significative des concepts du glossaire est déjà acquise. Travailler ces sujets en aveugle reviendrait à perdre du temps sur ce qui est maîtrisé tout en passant à côté des trous discrets.

À la fin de ce module, l'apprenant aura produit :

- Une cartographie **A / P / N** (Acquis / Partiel / Non acquis) de tous les items N2 et N3 du glossaire Python.
- Une **liste de remédiation** priorisée des modules M2 à M7 à parcourir.
- Une **validation pratique** (snippets écrits de tête) de chaque item marqué "Acquis".

## Durée estimée

Une demi-journée à une journée (4 à 8 heures), selon le nombre d'items à valider par snippet.

## Pré-requis

Aucun — c'est le module d'entrée du parcours Python.

---

## 1. Pourquoi commencer par un audit ?

L'auto-évaluation est inconfortable parce qu'elle met face à des zones d'incertitude qu'on préfère ignorer. Mais la rentabilité d'un parcours d'apprentissage en dépend directement : sans connaître le point de départ exact, n'importe quel programme sera soit trop facile (on s'ennuie, on abandonne), soit trop ambitieux (on bloque, on abandonne aussi).

**Analogie.** Le médecin qui ausculte avant de prescrire ne cherche pas à humilier le patient — il cherche les zones de douleur. Un audit Python suit la même logique : il faut chercher les zones d'hésitation, pas cocher des cases. L'objectif n'est pas de "réussir" l'audit, mais de produire une feuille de route fiable pour la suite.

Trois pièges classiques :

- **Effet Dunning-Kruger.** Confondre "j'ai déjà vu ce mot" avec "je sais l'expliquer".
- **Effet récence.** Surévaluer ce qu'on a utilisé la semaine dernière, sous-évaluer ce qu'on n'a pas touché depuis six mois.
- **Effet halo.** Si on est bon en POO Python, on s'imagine bon partout — alors que la bibliothèque standard ou la concurrence restent souvent des angles morts.

L'antidote aux trois : un test pratique par item marqué Acquis. Si on n'arrive pas à écrire un snippet de tête en quelques minutes, ce n'est pas Acquis.

---

## 2. Méthode d'auto-évaluation

Pour chaque item du glossaire, se poser trois questions dans cet ordre :

1. **Reconnaître** — Suis-je capable d'identifier ce concept dans du code existant que je lis ?
2. **Expliquer** — Pourrais-je l'expliquer à un collègue sans regarder la documentation ?
3. **Appliquer** — Ai-je écrit du code utilisant ce concept dans les 6 derniers mois (production ou projet personnel) ?

Échelle de notation :

| Note  | Signification | Critère          | Action                                         |
| ----- | ------------- | ---------------- | ---------------------------------------------- |
| **A** | Acquis        | 3 oui sur 3      | Revue rapide possible, pas de travail dédié    |
| **P** | Partiel       | 1 ou 2 oui sur 3 | Lecture du module concerné + un exercice ciblé |
| **N** | Non acquis    | 0 oui sur 3      | Le module entier à dérouler                    |

**Règle d'honnêteté.** Surévaluer un "P" en "A" produit un plan vide qui rate des trous réels. Mieux vaut être pessimiste : une revue inutile coûte 30 minutes, un trou non détecté coûte des semaines plus tard.

---

## 3. Questionnaire N2 (26 items)

Pour chaque ligne, indiquer **A**, **P** ou **N** dans la colonne de droite.

| #   | Item N2                                                         | Note |
| --- | --------------------------------------------------------------- | ---- |
| 1   | Le langage est **interprété** (et ce que ça implique)           | \_\_ |
| 2   | **Garbage collector** — rôle et principe (ramasse-miettes)      | \_\_ |
| 3   | **Nested functions** — closures et capture de variables         | \_\_ |
| 4   | **Typage dynamique**                                            | \_\_ |
| 5   | **Annotations de types** (hints)                                | \_\_ |
| 6   | **Itérateurs** — protocole `__iter__` / `__next__`              | \_\_ |
| 7   | **Générateurs** — `yield`, paresse                              | \_\_ |
| 8   | **Docstrings** — génération de documentation                    | \_\_ |
| 9   | **Collections natives** (list, dict, set, tuple, frozenset)     | \_\_ |
| 10  | **Comprehensions** (list, set, dict)                            | \_\_ |
| 11  | Manipulation du **CLI Python**                                  | \_\_ |
| 12  | Fonctions de base de la **bibliothèque standard**               | \_\_ |
| 13  | Installation d'un package via **pip**                           | \_\_ |
| 14  | **Shallow copy** vs **deep copy**                               | \_\_ |
| 15  | **Environnement virtuel** (venv, poetry, pipenv, anaconda)      | \_\_ |
| 16  | **Paradigmes de programmation** (impératif, fonctionnel, objet) | \_\_ |
| 17  | **Packing / unpacking**, `*args`, `**kwargs`                    | \_\_ |
| 18  | **PEP 8** et son utilité                                        | \_\_ |
| 19  | **Linter** (isort, black, flake8)                               | \_\_ |
| 20  | Bibliothèque de **tests unitaires** (pytest, unittest)          | \_\_ |
| 21  | **Lambdas** — usage judicieux                                   | \_\_ |
| 22  | **Debugger** et **breakpoints**                                 | \_\_ |
| 23  | **pathlib** pour manipuler les fichiers                         | \_\_ |
| 24  | **Contextes** avec `with`                                       | \_\_ |
| 25  | `is` vs `==`                                                    | \_\_ |
| 26  | `if __name__ == '__main__'`                                     | \_\_ |

## 4. Questionnaire N3 (19 items)

| #   | Item N3                                                                            | Note |
| --- | ---------------------------------------------------------------------------------- | ---- |
| 1   | **Collections judicieuses** (deque, Counter, OrderedDict, defaultdict, namedtuple) | \_\_ |
| 2   | Maîtrise de la **bibliothèque standard**                                           | \_\_ |
| 3   | **Type checker** (mypy, pytype, pyre)                                              | \_\_ |
| 4   | **Dataclasses**                                                                    | \_\_ |
| 5   | **Frozen** (dataclasses, objets immuables)                                         | \_\_ |
| 6   | Différences **Python 2 vs Python 3**                                               | \_\_ |
| 7   | **Classes abstraites** via `abc`                                                   | \_\_ |
| 8   | **Versions de Python 3** (3.7 → 3.12) — nouveautés clés                            | \_\_ |
| 9   | **Créer un module** distribuable via `pip`                                         | \_\_ |
| 10  | Choisir un **paradigme** selon le contexte                                         | \_\_ |
| 11  | **Méthodes dunder** / magiques (`__eq__`, `__hash__`, `__repr__`, etc.)            | \_\_ |
| 12  | **Multiprocessing**, **multithreading**, **GIL**                                   | \_\_ |
| 13  | **MRO** + influence de `super()`                                                   | \_\_ |
| 14  | Compilation **`.pyc`**                                                             | \_\_ |
| 15  | **Visibilité** des classes (`_x`, `__x`) — est-ce vraiment privé ?                 | \_\_ |
| 16  | `@classmethod` vs `@staticmethod` (et `cls` vs `self`)                             | \_\_ |
| 17  | **Décorateurs**                                                                    | \_\_ |
| 18  | **Mixin**                                                                          | \_\_ |
| 19  | **Hashable** — intérêt et conditions                                               | \_\_ |

---

## 5. Exercice de validation — Snippets de vérification

Pour chaque item noté **A**, écrire (sans assistance, sans documentation) un mini-snippet de 3 à 15 lignes qui démontre le concept en action. Si l'écriture coince plus de 5 minutes, repasser l'item à **P**.

Cinq exemples d'attendus à titre de **calibrage** (la complexité visée par snippet est de cet ordre — pas plus, pas moins).

### Item N2 #25 — `is` vs `==`

```python
a = [1, 2, 3]
b = a
c = list(a)
print(a == b, a is b)  # True True
print(a == c, a is c)  # True False
```

### Item N2 #24 — Contextes avec `with`

```python
from pathlib import Path

path = Path("hello.txt")
with path.open("w") as f:
    f.write("hello")

with path.open() as f:
    print(f.read())
```

### Item N3 #4 — Dataclass

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

p = Point(1.0, 2.0)
print(p)  # Point(x=1.0, y=2.0)
```

### Item N3 #16 — `@classmethod` vs `@staticmethod`

```python
class Color:
    def __init__(self, rgb):
        self.rgb = rgb

    @classmethod
    def from_hex(cls, hex_str):
        return cls(tuple(int(hex_str[i:i+2], 16) for i in (1, 3, 5)))

    @staticmethod
    def is_valid_hex(hex_str):
        return len(hex_str) == 7 and hex_str.startswith("#")

print(Color.from_hex("#ff8800").rgb)
print(Color.is_valid_hex("#ff8800"))
```

### Item N3 #17 — Décorateur

```python
from functools import wraps
import time

def timer(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        print(f"{fn.__name__} took {time.perf_counter() - start:.4f}s")
        return result
    return wrapper

@timer
def compute(n):
    return sum(i * i for i in range(n))

compute(1_000_000)
```

---

## 6. Construire le plan de remédiation

Regrouper les items P et N par module destinataire :

| Module                               | Items N3 P/N à couvrir                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| **M2 — Modèle de classe avancé**     | #11 (dunders), #15 (visibilité), #16 (classmethod/staticmethod), #18 (mixin), #19 (hashable) |
| **M3 — MRO et héritage multiple**    | #13 (MRO + `super()`)                                                                        |
| **M4 — Outils de modélisation**      | #4 (dataclasses), #5 (frozen), #7 (abc)                                                      |
| **M5 — Concurrence et parallélisme** | #12 (multiprocessing / threading / GIL)                                                      |
| **M6 — Décorateurs et paradigmes**   | #10 (paradigmes), #17 (décorateurs)                                                          |
| **M7 — Outillage Python**            | #3 (mypy), #6 (Py2 vs Py3), #8 (versions Py3), #9 (modules pip), #14 (.pyc)                  |

**Items N2 P/N** : à reprendre en révision rapide _avant_ d'attaquer les modules ci-dessus. Un trou N2 fragilise tout ce qui suit.

**Items transversaux** : N3 #1 (collections judicieuses) et N3 #2 (maîtrise stdlib) se travaillent en continu — ils ne font pas l'objet d'un module dédié mais s'évaluent au fil des modules M2 à M7.

**Règle de priorisation.** Faire les modules dans l'ordre **M2 → M7**, indépendamment du nombre d'items à couvrir : la séquence est conçue pour que chaque module s'appuie sur les précédents (M2 prépare M3, qui prépare M4, etc.).

---

## 7. Auto-évaluation du module M1

Le module est validé lorsque :

- [ ] Les **26 items N2** ont reçu une note (A / P / N).
- [ ] Les **19 items N3** ont reçu une note (A / P / N).
- [ ] Tous les items notés **A** ont été vérifiés par un snippet écrit de tête.
- [ ] Le tableau de remédiation de la section 6 est rempli.
- [ ] L'ordre de parcours **M2 → M7** est noté quelque part (planning, doc, etc.).

---

## 8. Score final

Compter le nombre d'items dans chaque catégorie :

- N2 Acquis : \_\_ / 26
- N3 Acquis : \_\_ / 19
- **Total** : \_\_ / 45

Échelle indicative (proportion d'items A) :

| Total A | Niveau approximatif                    |
| ------- | -------------------------------------- |
| 0 – 11  | ≈ N1 (≈ 1)                             |
| 12 – 22 | ≈ N2 incomplet (≈ 1,5 – 2)             |
| 23 – 34 | ≈ N2 complet ou N3 partiel (≈ 2 – 2,5) |
| 35 – 42 | ≈ N3 (≈ 3)                             |
| 43 – 45 | ≈ N3 complet, vers N4 (≈ 3,5+)         |

C'est une boussole, pas un thermomètre exact : la pondération réelle des items varie selon leur poids relatif dans le glossaire.

---

## 9. Ressources complémentaires

- **Glossaire interne** : `resources/priority0/Python.md` — référence faisant foi sur le découpage des items.
- **Documentation Python officielle** : [docs.python.org](https://docs.python.org/3/) — en particulier la section _What's New_ pour cerner ce qui distingue les versions de Python 3.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition) — référence à consulter sur les items N3 incertains.
- _Real Python_ — articles courts, accessibles, alignés sur le niveau visé.
