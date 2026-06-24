# M7 — Outillage Python

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Annoter du code avec les types Python (statiques, génériques, protocoles) et le valider avec **mypy** en mode strict.
- Citer les principales **différences Python 2 vs Python 3** et les nouveautés marquantes par version (3.6 à 3.13).
- Empaqueter un projet Python via `pyproject.toml`, **construire** un wheel, et le **publier** sur (Test)PyPI.
- Expliquer ce qu'est un fichier **`.pyc`**, où il est stocké (`__pycache__`) et quand il est régénéré.
- Composer une **structure de projet** propre (séparation `src/`, tests, configuration des outils).

## Durée estimée

1,5 jour (concepts pratiques, beaucoup de manipulation d'outils).

## Pré-requis

- M2 à M6 terminés.
- Items du plan de remédiation visés : N3 #3 (mypy), #6 (Py2 vs Py3), #8 (versions Py3), #9 (modules pip), #14 (.pyc).

---

## 1. Type checking avec mypy

### Pourquoi typer du code Python ?

Python est typé dynamiquement : les erreurs de type n'apparaissent qu'à l'exécution, parfois dans des chemins de code rarement empruntés. Les annotations de types ne changent pas le comportement à l'exécution — mais associées à un type checker, elles attrapent une grande partie de ces bugs avant qu'ils n'atteignent la production.

**Analogie.** Un correcteur orthographique pour le code. Il ne change pas la phrase qu'on écrit, mais il signale les fautes avant que le lecteur ne les rencontre. Pour des phrases complexes (code complexe), le correcteur évite des heures de relecture humaine.

### Démarrage

```bash
pip install mypy
```

Code annoté simple :

```python
def greet(name: str) -> str:
    return f"hello {name}"

def total(prices: list[float]) -> float:
    return sum(prices)
```

Vérification :

```bash
mypy script.py
```

Si l'on appelle `greet(42)`, mypy signale `error: Argument 1 to "greet" has incompatible type "int"; expected "str"` — sans avoir exécuté le code.

### Annotations courantes

```python
from typing import Optional, Callable, Any
from collections.abc import Iterable

x: int = 5
name: str = "Alice"
ratio: float = 0.75
flags: list[bool] = [True, False]
config: dict[str, str] = {"host": "localhost"}
maybe: Optional[int] = None          # équivalent à int | None
handler: Callable[[int, int], int] = lambda a, b: a + b
opaque: Any = "anything"             # désactive le type checking sur cette variable
```

Depuis Python 3.10, on peut écrire `int | None` au lieu de `Optional[int]`, et `int | str` au lieu de `Union[int, str]`.

### Génériques et `TypeVar`

```python
from typing import TypeVar

T = TypeVar("T")

def first(items: list[T]) -> T:
    return items[0]


first([1, 2, 3])         # T = int → renvoie int
first(["a", "b"])        # T = str → renvoie str
```

Python 3.12+ permet une syntaxe plus concise (PEP 695) :

```python
def first[T](items: list[T]) -> T:
    return items[0]
```

### `Protocol` — duck typing typé

Quand on veut typer "n'importe quel objet qui a une méthode `read`", on utilise un protocole :

```python
from typing import Protocol

class SupportsRead(Protocol):
    def read(self) -> str: ...


def parse(source: SupportsRead) -> dict:
    raw = source.read()
    return parse_str(raw)
```

Aucune classe n'a besoin d'hériter explicitement de `SupportsRead` — il suffit qu'elle implémente `read`. C'est l'équivalent typé du duck typing.

### Mode strict

```bash
mypy --strict module/
```

Ce mode active toutes les vérifications : annotations obligatoires, pas de `Any` implicite, pas de retour implicite `None`, etc. C'est le mode cible pour un projet sérieux. Il est intransigeant au début, mais payant à moyen terme.

Configuration via `pyproject.toml` :

```toml
[tool.mypy]
strict = true
python_version = "3.12"
```

### Alternatives à mypy

- **pyright** (Microsoft) — plus rapide, intégré à VS Code via Pylance.
- **pytype** (Google) — infère des types sans annotations.
- **pyre** (Facebook) — orienté grande base de code, moins répandu.

mypy reste la référence par sa stabilité et son intégration avec l'écosystème.

---

## 2. Versions de Python — Py2, Py3, et l'évolution récente

### Py2 vs Py3 (le bref historique)

Python 2 est **EOL depuis le 1ᵉʳ janvier 2020**. Tout nouveau projet doit être en Python 3. Connaître les différences reste utile pour lire d'anciens scripts ou comprendre certaines décisions de l'écosystème.

**Différences clés** :

| Aspect             | Python 2                        | Python 3                        |
| ------------------ | ------------------------------- | ------------------------------- |
| `print`            | Statement (`print "x"`)         | Fonction (`print("x")`)         |
| Division entière   | `5 / 2 == 2`                    | `5 / 2 == 2.5` (`5 // 2 == 2`)  |
| Chaînes par défaut | `str` = bytes, `unicode` séparé | `str` = unicode, `bytes` séparé |
| `super()`          | `super(Class, self).method()`   | `super().method()`              |
| `dict` order       | Non garanti                     | Garanti depuis 3.7              |
| `range`            | Liste en mémoire                | Itérateur paresseux             |

### Évolution de Python 3 — versions notables

| Version | Sortie | Nouveautés marquantes                                                                        |
| ------- | ------ | -------------------------------------------------------------------------------------------- |
| 3.6     | 2016   | f-strings (`f"{name}"`), variable annotations                                                |
| 3.7     | 2018   | `dataclasses`, ordered `dict` officiel, `from __future__ import annotations`                 |
| 3.8     | 2019   | Walrus operator (`:=`), positional-only params (`def f(x, /)`)                               |
| 3.9     | 2020   | Dict merge (`d1 \| d2`), `list[int]` natif (sans `typing.List`)                              |
| 3.10    | 2021   | `match-case` (pattern matching), meilleurs messages d'erreur, parenthesized context managers |
| 3.11    | 2022   | Speed-up (10-60 %), `ExceptionGroup`, `Self` type, `tomllib`                                 |
| 3.12    | 2023   | Syntaxe de génériques (PEP 695), per-interpreter GIL, f-string améliorées                    |
| 3.13    | 2024   | Mode _free-threaded_ expérimental (PEP 703), REPL interactif amélioré                        |

### Quelle version choisir ?

- **Production stable** : la version `N - 1` de la dernière sortie. En 2026, viser Python 3.12.
- **Nouveau projet "frais"** : la dernière stable (3.13).
- **Bibliothèque distribuée** : supporter ≥ 2 versions (par exemple 3.10 à 3.13).
- **Code à maintenir longtemps** : choisir une version, la pinner, et migrer vers la suivante à chaque cycle annuel.

Outils de gestion de versions : `pyenv` (Unix/macOS), `pyenv-win` ou `Hatch` (cross-plateforme).

---

## 3. Packaging — `pyproject.toml` et publication

### Pourquoi un format unifié ?

Historiquement, l'écosystème Python avait plusieurs façons de décrire un projet : `setup.py`, `setup.cfg`, `Pipfile`, `requirements.txt`. La **PEP 518** puis la **PEP 621** ont unifié tout cela dans un seul fichier : `pyproject.toml`.

**Analogie.** Un passeport — un seul document standardisé, lisible par tous les outils (PyPI, pip, build, tox, mypy, ruff, pytest...).

### Structure minimale

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "noledj-mini"
version = "0.1.0"
description = "Mini-bibliothèque exemple du parcours Python."
readme = "README.md"
requires-python = ">=3.11"
license = { text = "MIT" }
authors = [{ name = "Auteur", email = "auteur@example.com" }]
dependencies = [
    "requests >=2.31,<3.0",
]

[project.optional-dependencies]
dev = [
    "mypy >=1.8",
    "pytest >=8.0",
    "ruff >=0.4",
]

[project.scripts]
noledj-mini = "noledj_mini.cli:main"

[tool.mypy]
strict = true
python_version = "3.12"

[tool.ruff]
target-version = "py312"
line-length = 100
```

Sections clés :

- `[build-system]` — quel outil utiliser pour construire (hatchling, setuptools, poetry-core, flit-core...).
- `[project]` — métadonnées (nom, version, dépendances, Python requis, license).
- `[project.optional-dependencies]` — groupes installables via `pip install .[dev]`.
- `[project.scripts]` — points d'entrée CLI (génère un binaire dans le PATH).
- `[tool.*]` — configuration des outils tiers (mypy, ruff, pytest, etc.).

### Construire un wheel

```bash
pip install build
python -m build
```

Produit deux artefacts dans `dist/` :

- `noledj_mini-0.1.0-py3-none-any.whl` — distribution binaire, à installer.
- `noledj_mini-0.1.0.tar.gz` — distribution source (sdist).

Installation locale :

```bash
pip install dist/noledj_mini-0.1.0-py3-none-any.whl
```

### Publier sur PyPI (ou TestPyPI)

```bash
pip install twine
twine upload --repository testpypi dist/*       # serveur de test
twine upload dist/*                             # PyPI officiel
```

TestPyPI ([test.pypi.org](https://test.pypi.org)) est un PyPI parallèle pour s'entraîner sans polluer l'index officiel.

### Structure de projet recommandée

```
noledj-mini/
├── pyproject.toml
├── README.md
├── src/
│   └── noledj_mini/
│       ├── __init__.py
│       ├── core.py
│       └── cli.py
└── tests/
    ├── test_core.py
    └── test_cli.py
```

Le **layout `src/`** évite que les tests importent accidentellement le code "en place" au lieu du paquet installé. C'est la convention moderne (recommandée par la PyPA).

---

## 4. Bytecode `.pyc` et `__pycache__`

### Théorie

Python n'est ni purement interprété ni compilé en natif. Lorsqu'un module `.py` est importé, l'interpréteur le **compile en bytecode** (instructions de la machine virtuelle Python) et stocke le résultat dans un fichier `.pyc` à l'intérieur d'un dossier `__pycache__/`.

**Analogie.** Une recette de cuisine pré-préparée. Plutôt que de lire la recette intégrale à chaque cuisson, on a déjà découpé, dosé, mis en bocaux. La cuisson devient plus rapide. La recette d'origine reste la référence ; les bocaux ne sont qu'un cache.

### Où les `.pyc` apparaissent

```
my_project/
├── module.py
└── __pycache__/
    ├── module.cpython-312.pyc
    └── module.cpython-313.pyc
```

Le suffixe (`cpython-312`) indique l'implémentation et la version Python. Plusieurs `.pyc` peuvent cohabiter pour différentes versions.

### Quand sont-ils régénérés ?

À l'import, Python compare la date de modification du `.py` avec celle du `.pyc`. Si le `.py` est plus récent, le `.pyc` est régénéré.

Forcer une recompilation manuelle :

```bash
python -m compileall my_module/
```

Utile pour pré-compiler une bibliothèque dans une image Docker (gain de démarrage sur les containers froids).

### Bonnes pratiques

- **Ne jamais committer** `__pycache__/` ni les `.pyc` — toujours dans `.gitignore`.
- **Ne pas modifier** un `.pyc` à la main — il n'est pas portable entre versions de Python.
- En cas de comportement bizarre après refactor : `find . -name __pycache__ -exec rm -rf {} +` peut résoudre des caches devenus incohérents (rare, mais déjà observé).

### Pas de `.pyc` pour les scripts top-level

Le script directement exécuté (`python my_script.py`) n'est **pas** compilé en `.pyc`. Seuls les modules importés le sont. Donc un mono-fichier `script.py` ne profite pas du cache bytecode entre exécutions.

---

## 5. Exercices pratiques

### Exercice 1 — Annoter et passer mypy strict (≈ 30 min)

Reprendre un projet précédent (par exemple la classe `Money` du M2 ou le système de paiements du M4) et :

1. Ajouter les annotations de type sur toutes les fonctions et méthodes.
2. Exécuter `mypy --strict module.py`.
3. Corriger les erreurs jusqu'à 0 erreur.

### Exercice 2 — Générique typé (≈ 30 min)

Écrire une classe `Stack[T]` (pile générique) avec :

- `push(item: T) -> None`
- `pop() -> T`
- `peek() -> T`
- `__len__() -> int`

Vérifier en mypy strict que `Stack[int]` et `Stack[str]` produisent des types corrects, et qu'un `push(str)` sur une `Stack[int]` est signalé comme erreur.

**Bonus** : utiliser la syntaxe Python 3.12+ (`class Stack[T]:`).

### Exercice 3 — Découvrir une version (≈ 20 min)

Choisir une version Python parmi 3.10, 3.11 ou 3.12 et écrire 3 mini-snippets démontrant 3 nouveautés de cette version :

- 3.10 : `match-case`, parenthesized context managers, meilleures erreurs.
- 3.11 : `Self` type, `ExceptionGroup`, `tomllib`.
- 3.12 : syntaxe générique PEP 695, f-string améliorée, per-interpreter GIL.

Rédiger pour chaque snippet une explication d'1-2 lignes du gain par rapport à la version précédente.

### Exercice 4 — Empaqueter un module (≈ 45 min)

Créer un projet `hello_noledj/` avec la structure recommandée (`src/`, `tests/`, `pyproject.toml`).

1. Une fonction `hello_noledj.greet(name: str) -> str` qui renvoie `"Hello, {name}!"`.
2. Un test pytest qui valide le comportement.
3. Un `pyproject.toml` minimal avec `[build-system]` et `[project]`.
4. Construire le wheel : `python -m build`.
5. Installer le wheel dans un environnement virtuel propre et vérifier `import hello_noledj`.

**Bonus** : publier sur TestPyPI et installer depuis là.

### Exercice 5 — Investiguer `__pycache__` (≈ 15 min)

1. Créer un module `m.py` avec une fonction simple.
2. L'importer depuis un autre script → observer le `__pycache__/m.cpython-XYZ.pyc` créé.
3. Modifier `m.py` → ré-importer → constater que `m.cpython-XYZ.pyc` est régénéré.
4. Lancer `python -m dis __pycache__/m.cpython-XYZ.pyc` (ou `python -c "import dis; dis.dis(__import__('m'))"`) → observer le bytecode.

Documenter ce qu'on apprend en 5 à 10 lignes.

---

## 6. Mini-défi de synthèse — la micro-bibliothèque (≈ 1 à 2 jours, **mini-projet final du parcours Python**)

C'est le mini-projet annoncé dans le parcours global Python. Il rassemble les modules M2 à M7.

**Objectif.** Concevoir, packager et publier une micro-bibliothèque Python qui démontre la maîtrise des concepts du parcours.

**Spécifications** :

- Domaine au choix : par exemple, une bibliothèque de manipulation de devises (`@dataclass(frozen=True) Money`), un client API minimaliste, un parseur de fichiers `.ini`, un mini-ORM SQLite, etc.
- Modélisation : utilise `@dataclass`, héritage propre, MRO maîtrisé si héritage multiple, dunders implémentés (M2-M4).
- Concurrence : au moins une fonction qui exploite `threading` ou `multiprocessing` (M5).
- Décorateurs : au moins un décorateur custom (timer, cache, retry, validation — M6).
- Typing : annotations partout, `mypy --strict` passe sans erreur (M7).
- Packaging : `pyproject.toml` propre, construction `python -m build`, wheel installable.
- Qualité : `ruff check` et `ruff format` passent, tests `pytest` avec couverture > 80 %.
- Documentation : `README.md` avec usage, API, et exemple d'installation.
- Publication : déposé sur **TestPyPI** au minimum.

**Critères de validation** :

- [ ] `mypy --strict` : 0 erreur.
- [ ] `ruff check .` : 0 erreur.
- [ ] `pytest --cov` : ≥ 80 %.
- [ ] `python -m build` : produit un wheel et une sdist.
- [ ] `pip install --index-url https://test.pypi.org/simple/ <package>` fonctionne dans un environnement propre.
- [ ] Lecture rapide du code par un pair : noms clairs, structure cohérente, pas de TODO ouvert.

---

## 7. Auto-évaluation

Le module M7 est validé lorsque :

- [ ] L'apprenant peut annoter une fonction de tête (paramètres, retour, optional).
- [ ] Il a fait passer un module en `mypy --strict` sans erreur.
- [ ] Il peut utiliser `TypeVar` ou la syntaxe générique 3.12+ pour une classe paramétrée.
- [ ] Il peut citer 4 différences Py2 / Py3 et 3 nouveautés post-3.7.
- [ ] Il sait écrire un `pyproject.toml` minimal et construire un wheel.
- [ ] Il a publié au moins un paquet sur TestPyPI.
- [ ] Il explique ce qu'est un `.pyc` et où il vit.
- [ ] Le mini-projet de synthèse passe tous les critères de validation.

**Items du glossaire visés** (passage P/N → A) : N3 #3 (mypy), #6 (Py2 vs Py3), #8 (versions Py3), #9 (modules pip), #14 (.pyc).

---

## 8. Ressources complémentaires

- **Documentation officielle mypy** : [mypy.readthedocs.io](https://mypy.readthedocs.io). Le _Cheat Sheet_ en particulier.
- **Documentation Python packaging** : [packaging.python.org](https://packaging.python.org). _Tutorials_ puis _Specifications_ pour aller plus loin.
- **PEP 484** — _Type Hints_ (introduction officielle des annotations).
- **PEP 561** — _Distributing and Packaging Type Information_.
- **PEP 621** — _Storing project metadata in pyproject.toml_.
- **PEP 695** — _Type Parameter Syntax_ (la syntaxe générique de Python 3.12).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 8 — _Type Hints in Functions_.
- **Real Python** — articles _Python Type Checking_ et _Publishing Your Package on PyPI_.
