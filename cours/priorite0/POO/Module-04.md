# M4 — Visibilité avancée

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **visibilité technique** (mécanisme du langage) et **contrat d'API** (décision de design).
- Choisir le bon **niveau de visibilité** pour chaque membre selon son rôle.
- Utiliser **`__all__`** pour rendre le contrat public d'un module explicite.
- Réaliser une **revue d'API publique** d'un module existant et proposer des corrections.
- Identifier les **anti-patterns** classiques de visibilité (over-exposition, leakage interne).

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M3 POO.
- Parcours Python M2 (le mécanisme technique : `_`, `__`, name mangling).

---

## 1. Visibilité technique vs contrat d'API

### Le malentendu

En Python, on confond souvent deux notions distinctes :

1. **Visibilité technique** — ce que le langage **empêche** ou **complique** (très peu en Python).
2. **Contrat d'API** — ce que l'auteur du code **promet** au reste du monde, et donc ce qu'il accepte de maintenir.

Le langage Python offre peu de barrières techniques (cf. Python M2). En revanche, la **convention de nommage** sert de **contrat social** :

- `nom` : _je m'engage à le maintenir_ (public).
- `_nom` : _je peux le changer sans préavis_ (interne).
- `__nom` : _je veux qu'il ne soit pas mélangé avec un homonyme en sous-classe_ (technique).

**Analogie.** La vitrine d'un magasin. Ce qui est en vitrine est destiné aux clients (API publique). Ce qui est dans la réserve à l'arrière sert au fonctionnement interne, et un client qui s'y aventure n'a aucune garantie sur ce qu'il y trouvera.

### Pourquoi cette distinction est cruciale

Un attribut **public** est un engagement. Tout code externe peut l'utiliser, et tu **devras le maintenir** dans toutes les versions futures sans le casser — sinon tu casses tes utilisateurs.

Un attribut **interne** est libre : tu peux le renommer, le supprimer, changer son type, sans rien casser hors de ton module.

**Mal segmenter l'API publique = dette technique permanente.**

---

## 2. Les niveaux de visibilité et leur choix

### Les trois conventions Python

| Convention | Sens contractuel                                | Quand l'utiliser                                        |
| ---------- | ----------------------------------------------- | ------------------------------------------------------- |
| `nom`      | Public. API officielle. Maintenu.               | Méthodes et attributs exposés aux utilisateurs.         |
| `_nom`     | Interne / "privé par convention". Peut changer. | Détails d'implémentation, helpers internes.             |
| `__nom`    | Name-mangled. Anti-collision dans l'héritage.   | Quand on craint **vraiment** une collision sous-classe. |

Note : `__nom__` (avec underscores aux deux bouts) est **réservé** aux dunders Python. Ne jamais inventer ses propres dunders.

### Heuristique de décision

Pour chaque méthode/attribut, se poser :

1. **Quelqu'un d'autre que cette classe doit-il l'utiliser ?**
   - Non → `_nom`.
2. **Vais-je m'engager à ne pas le changer dans les 12 prochains mois ?**
   - Non → `_nom`.
3. **Est-ce un détail de fonctionnement (helper, cache, format intermédiaire) ?**
   - Oui → `_nom`.
4. \*\*Sinon → `nom` (public).

Par défaut, **être conservateur** : démarrer en `_nom`. Promouvoir en `nom` quand un besoin externe légitime apparaît. L'inverse — passer une API publique en privé — casse les utilisateurs.

### Cas concrets

```python
class HttpClient:
    def __init__(self, base_url: str, timeout: float = 10):
        self.base_url = base_url             # ✓ public — config visible
        self.timeout = timeout               # ✓ public — config visible
        self._session = self._create_session()  # ✓ interne — détail
        self._retries = 0                    # ✓ interne — compteur

    def get(self, path: str) -> dict:        # ✓ public — API principale
        return self._send("GET", path)

    def post(self, path: str, body: dict):   # ✓ public — API principale
        return self._send("POST", path, body)

    def _send(self, method, path, body=None):  # ✓ interne — orchestration
        # ...
        pass

    def _create_session(self):               # ✓ interne — détail
        # ...
        pass
```

Règle implicite : **ce qui est documenté pour les utilisateurs doit être public**. Si la doc ne parle pas d'un attribut, il y a de fortes chances qu'il doive être en `_`.

---

## 3. `__all__` — le contrat public d'un module

### Le problème

```python
# my_module.py
def public_helper(): ...
def _private_helper(): ...
def __internal_only(): ...

CONSTANT = 42
_TEMP = 0
```

Quand on fait `from my_module import *`, qu'est-ce qui est importé ?

- Par défaut : **tout ce qui ne commence pas par `_`** (donc `public_helper` et `CONSTANT`).
- Mais c'est implicite et fragile : ajouter une fonction publique change le comportement de `import *` chez les utilisateurs.

### La solution

```python
# my_module.py
__all__ = ["public_helper", "CONSTANT"]


def public_helper(): ...
def _private_helper(): ...

CONSTANT = 42
_TEMP = 0
```

`__all__` rend explicite ce qui constitue l'**API publique** du module. Trois effets :

1. **`from my_module import *`** n'importe que ce qui est dans `__all__`.
2. La documentation de l'API publique devient **lisible en haut de fichier**.
3. Les outils (linters, générateurs de doc Sphinx, type checkers) s'en servent comme source de vérité.

**Analogie.** La liste affichée sur la porte du magasin. Elle dit explicitement "voici ce qui est en vente". Sans elle, le client doit deviner d'après ce qu'il voit en vitrine.

### Quand l'utiliser

- **Module exposé** comme bibliothèque ou API publique — toujours.
- **Module interne** d'une application — utile mais moins critique.
- **Petit script** ou fichier de tests — superflu.

### Bonnes pratiques

- Placer `__all__` **en haut** du fichier, juste après les imports.
- L'ordre dans la liste reflète l'**importance** : exposer les noms les plus utilisés en premier.
- Synchroniser `__all__` avec ce qui est documenté.

---

## 4. Heuristiques de design d'API

### Règle 1 — Une API publique se conçoit, elle ne se constate pas

Penser le contrat **avant** d'écrire la classe :

- "Si quelqu'un utilise cette classe sans connaître son code interne, qu'est-ce qu'il appellera ?"

Une fois identifié, **tout le reste doit être marqué interne**.

### Règle 2 — Minimiser la surface publique

Plus l'API publique est petite, plus l'auteur est **libre** de refactorer en interne. Une grande surface publique = du code qu'on devra maintenir compatibilité éternellement.

**Stevey's law** : _Less is more, especially in API design_.

### Règle 3 — Préférer les fonctions et les propriétés aux attributs nus

```python
# ✗ Attribut nu exposé
class Order:
    total: float = 0.0          # public, peut être changé partout

# ✓ Propriété en lecture seule
class Order:
    def __init__(self):
        self._items: list = []

    @property
    def total(self) -> float:
        return sum(i.price for i in self._items)
```

La propriété donne le **contrôle** : on peut changer le calcul, ajouter de la validation, mettre en cache, sans casser les utilisateurs (`order.total` reste lisible comme un attribut).

### Règle 4 — Documenter le contrat

Une docstring sur chaque méthode publique. Au minimum : entrée, sortie, exceptions levées.

```python
class Order:
    def add_item(self, item: Item) -> None:
        """Ajoute un item à la commande.

        Lève ValueError si l'item est déjà présent.
        """
        if item in self._items:
            raise ValueError("already added")
        self._items.append(item)
```

Sans documentation, l'API publique reste une promesse implicite — donc fragile.

### Règle 5 — Versionner les changements de contrat

Quand on change une API publique :

- **Ajout** d'une méthode → version mineure (`1.2 → 1.3`).
- **Modification** (signature, comportement) → version majeure (`1.2 → 2.0`). Documenter en changelog.
- **Suppression** → idéalement précédée d'une période de **déprécation** (warning à l'usage, suppression dans une version ultérieure).

Suivre le **SemVer** ([semver.org](https://semver.org)) — pas une option pour une bibliothèque distribuée.

---

## 5. Anti-patterns à reconnaître

### Anti-pattern 1 — Attributs internes nus

```python
class UserStore:
    def __init__(self):
        self.users = {}     # ✗ exposé en public
```

Pourquoi c'est un problème :

- N'importe qui peut `store.users["alice"] = "garbage"`.
- On ne peut plus changer la structure interne (dict → DB → cache).
- On ne sait pas si `users` est documenté.

**Correction** : `_users` + propriétés/méthodes pour l'accès contrôlé.

### Anti-pattern 2 — Méthodes "utilitaires" publiques

```python
class Order:
    def total(self): ...
    def format_total_for_log(self): ...   # ✗ helper interne exposé
```

`format_total_for_log` est un helper que personne en dehors d'`Order` ne devrait appeler. Le rendre public **augmente** la surface à maintenir.

**Correction** : `_format_total_for_log`.

### Anti-pattern 3 — `import *` à tout va

```python
# main.py
from my_module import *
```

Si `my_module` n'a pas `__all__`, on importe tout ce qui ne commence pas par `_`. Quand `my_module` ajoute une variable publique, ça pollue le namespace de l'appelant **silencieusement**.

**Correction** : import explicite (`from my_module import X, Y`) ou `__all__` strict.

### Anti-pattern 4 — Confusion `_` et `__`

```python
class Database:
    def __init__(self):
        self.__connection = ...   # ✗ name-mangled sans raison
```

`__connection` devient `_Database__connection`. Si une sous-classe veut accéder ou redéfinir cet attribut, c'est cassé sans bonne raison.

**Correction** : `_connection`. On ne réserve `__` qu'en cas de **vraie** crainte de collision.

### Anti-pattern 5 — Sur-exposition de l'état interne

```python
class CartCalculator:
    def calculate(self, cart):
        self.intermediate_result = self._do_step1(cart)  # ✗ exposition
        self.cached_taxes = self._do_step2(cart)         # ✗ exposition
        return self.intermediate_result + self.cached_taxes
```

L'état intermédiaire n'a aucune raison d'être visible de l'extérieur — il pollue l'API et empêche tout refactor du calcul.

**Correction** : variables locales dans `calculate`, pas attributs d'instance. Ou attributs internes (`_intermediate_result`).

---

## 6. Audit d'un module existant

### Méthode en 5 étapes

1. **Lister les membres** publics du module (sans `_`).
2. **Confronter** à la documentation (README, docstrings) : tout ce qui est exposé est-il documenté ? Tout ce qui est documenté est-il exposé ?
3. **Identifier les fuites** : attributs `users`, `internal_state` qui devraient être `_users`, `_internal_state`.
4. **Identifier les manques** : fonctions documentées comme publiques mais préfixées `_` par habitude.
5. **Rédiger un `__all__`** explicite.

### Outils

- `dir(module)` — liste tous les noms d'un module.
- `[n for n in dir(module) if not n.startswith("_")]` — la "surface publique" implicite.
- **pyright** ou **mypy strict** — signale les usages d'attributs non documentés.
- **Sphinx** avec `:undoc-members:` désactivé — la doc générée affiche ce qui doit être documenté.

---

## 7. Exercices pratiques

### Exercice 1 — Classifier les membres (≈ 20 min)

Pour chaque membre de la classe suivante, indiquer s'il devrait être public, interne, ou name-mangled :

```python
class CacheManager:
    def __init__(self, max_size):
        self.max_size = ...
        self.entries = ...
        self.access_count = ...
        self.last_eviction_time = ...

    def get(self, key): ...
    def set(self, key, value): ...
    def evict_lru(self): ...
    def format_stats_for_log(self): ...
    def calculate_hit_rate(self): ...
    def reset(self): ...
```

Justifier en 1 ligne chaque choix.

### Exercice 2 — Refactor une classe over-exposée (≈ 30 min)

Soit :

```python
class TaskRunner:
    def __init__(self):
        self.queue = []
        self.running = False
        self.thread = None
        self.completed_count = 0

    def add_task(self, task): self.queue.append(task)
    def start(self): self.running = True; ...
    def stop(self): self.running = False; ...
    def get_next_task(self): return self.queue.pop(0)
    def increment_completed(self): self.completed_count += 1
    def reset_state(self): self.completed_count = 0; self.queue = []
```

Refactorer :

1. Identifier les méthodes internes (`get_next_task`, `increment_completed` — appelées seulement depuis l'intérieur).
2. Identifier les attributs internes (`queue`, `thread`).
3. Exposer `completed_count` en `@property` (lecture seule).
4. Ajouter `__all__` au module.

### Exercice 3 — `__all__` (≈ 20 min)

Concevoir un module `string_utils.py` avec :

- Fonction publique `slugify(s)`.
- Fonction publique `camel_to_snake(s)`.
- Fonction interne `_normalize_unicode(s)`.
- Fonction interne `_compile_pattern()`.
- Constante publique `MAX_LENGTH`.
- Constante interne `_DEFAULT_PATTERN`.

Ajouter `__all__` au sommet. Tester :

```python
from string_utils import *
# Doit accepter slugify, camel_to_snake, MAX_LENGTH
# Doit refuser _normalize_unicode
```

### Exercice 4 — Audit (≈ 30 min)

Choisir un module Python du projet en cours (ou de la stdlib : `pathlib`, `collections`, etc.) et :

1. Lister sa surface publique avec `dir()`.
2. Vérifier la cohérence avec la documentation officielle.
3. Identifier (au moins 3) noms publics implicites qui pourraient être internes, et inversement.

Format de rendu : tableau `nom | actuel | proposé | raison`.

### Exercice 5 — Propriété au lieu d'attribut (≈ 25 min)

Soit :

```python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.area = width * height       # ✗ figé à l'instanciation
        self.perimeter = 2 * (width + height)
```

Problème : modifier `width` ne met pas à jour `area` ni `perimeter`.

Refactorer :

1. Garder `width` et `height` privés (ou semi-privés).
2. Exposer `area` et `perimeter` en `@property` (calcul dynamique).
3. Si l'on veut autoriser la modification de `width` / `height`, ajouter des `@width.setter` avec validation.

---

## 8. Mini-défi de synthèse (≈ 1,5 heure) — revue d'API publique

Reprendre un module rédigé dans un parcours précédent (par exemple le `Stack` de Python M2, le système de paiements de Python M4, ou le système de notification de POO M1).

**Mission** :

1. **Audit** — produire un tableau qui liste tous les membres et leur visibilité actuelle.
2. **Critique** — pour chaque membre, indiquer si la visibilité est correcte selon les règles du module M4. Si non, proposer une correction.
3. **Refactor** — appliquer les corrections.
4. **`__all__`** — ajouter un `__all__` au sommet du module.
5. **Documentation** — rédiger une docstring pour chaque membre public, indiquant : but, paramètres, retour, exceptions, exemple d'usage.

**Critères de validation** :

- [ ] Au moins **un membre** est passé de public à interne, ou inversement.
- [ ] `__all__` est défini et reflète exactement la documentation.
- [ ] Tous les membres publics ont une docstring.
- [ ] Aucun **attribut nu** ne reste exposé directement (préférer `@property` quand applicable).
- [ ] Un script externe peut utiliser le module en n'accédant qu'aux membres de `__all__`.

---

## 9. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant distingue visibilité technique et contrat d'API.
- [ ] Il choisit le bon préfixe (`x` / `_x` / `__x`) selon une heuristique claire.
- [ ] Il sait écrire un `__all__` et explique son rôle.
- [ ] Il identifie 3+ anti-patterns courants dans un code donné.
- [ ] Il réalise une revue d'API d'un module existant.
- [ ] Il préfère `@property` aux attributs nus pour exposer une valeur calculée.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : choix du type de visibilité selon le contexte (API publique vs détail interne).

---

## 10. Ressources complémentaires

- **PEP 8** — _Style Guide for Python Code_ : section _Naming Conventions_ (conventions `_`, `__`).
- **PEP 257** — _Docstring Conventions_ — comment documenter une API publique.
- **PEP 440 et SemVer** — versionnement et compatibilité ascendante.
- **Real Python** — articles _Python's "private" methods_ et _Python Modules and Packages_.
- **Joshua Bloch** — _How to Design a Good API and Why It Matters_ (conférence Google 2007 — référence universelle, transposable au Python).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 11 — _A Pythonic Object_ (sur la conception de classes idiomatiques).
