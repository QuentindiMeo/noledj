# M8 — Factorisation des tests

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Identifier les **types de duplication** dans une suite de tests : duplication de **setup**, de **données d'entrée**, d'**assertions**, de **structure de scénario**.
- Maîtriser les **tests paramétrés** (item N3 explicite) en `pytest` : `@pytest.mark.parametrize`, IDs lisibles, paramétrisation multi-axes, paramétrisation indirecte via fixtures.
- Connaître les **patterns avancés** : **fixture paramétrée**, **factory fixture**, **test data builder**, **object mother**.
- Décider **quand factoriser** et **quand laisser dupliqué** (la duplication de tests n'est pas toujours un mal — la lisibilité prime souvent).
- **Convertir une série de tests répétitifs en tests paramétrés** (item N3 explicite — la pratique) sur un exemple complet.
- Reconnaître les **anti-patterns** : sur-factorisation, IDs cryptiques, dépendances cachées entre paramètres, paramétrisation qui masque des cas distincts.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M7.
- `pytest` (les exemples sont `pytest`-centrés ; principes transposables à JUnit, vitest).
- Avoir une suite avec **des répétitions visibles** pour s'exercer (ou utiliser les exemples du module).

---

## 1. Pourquoi un module sur la factorisation

### 1.1 — Le coût caché de la duplication

> Trois tests qui font la même chose à un paramètre près représentent **3 endroits à maintenir** pour chaque évolution.

Cas typique :

```python
def test_age_25_is_adult():
    user = User(age=25)
    assert user.is_adult() is True

def test_age_18_is_adult():
    user = User(age=18)
    assert user.is_adult() is True

def test_age_17_is_minor():
    user = User(age=17)
    assert user.is_adult() is False

def test_age_0_is_minor():
    user = User(age=0)
    assert user.is_adult() is False
```

Quatre fonctions, **un seul comportement** testé (la frontière à 18 ans). Quand `User` change de signature (`User(age=25, country="FR")`), il faut éditer **4 endroits**.

Le test paramétré ramène à **1 endroit** :

```python
@pytest.mark.parametrize("age,expected", [
    (25, True), (18, True), (17, False), (0, False),
])
def test_is_adult(age, expected):
    assert User(age=age).is_adult() is expected
```

Plus dense, plus maintenable.

### 1.2 — Mais attention au piège inverse

> La sur-factorisation rend les tests **illisibles**. Un seul test paramétré sur 8 axes simultanés est moins clair que 3 tests focalisés.

L'équilibre est fin : factoriser **ce qui est strictement répétitif**, garder **ce qui exprime des intentions distinctes**.

### 1.3 — L'analogie de la cuisine

Penser à la factorisation comme à un **livre de recettes** :

- Trois **variantes** d'une même base (carbonara / amatriciana / cacio e pepe) : on peut écrire une recette de base + 3 variantes.
- Trois **plats différents** (pâtes / soupe / dessert) : aucune factorisation ne ferait sens.

Le critère : **la même structure cognitive** ? Oui → factoriser. Non → laisser séparés.

### 1.4 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                             | Conséquence                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Refuser toute duplication ("DRY à tout prix").                           | Tests illisibles, paramètres opaques.                                      |
| Garder 50 copies "pour la lisibilité".                                   | Maintenance pénible, refactor freiné.                                      |
| Paramétrer avec des **IDs auto-générés** (`age=25-True-…`).              | Test runner output illisible.                                              |
| Paramétrer **3 axes** indépendants en un seul test.                      | 8 combinaisons floues, difficile à débugger.                               |
| Cacher la **dépendance entre paramètres** dans une fixture mystère.      | Test illisible.                                                            |
| Paramétrer **des intentions distinctes** (nominal + erreur + edge case). | On perd la distinction "test du chemin heureux" vs "test du cas d'erreur". |

---

## 2. Tests paramétrés `pytest` (item N3 explicite)

### 2.1 — `@pytest.mark.parametrize` — syntaxe de base

```python
import pytest

@pytest.mark.parametrize("age,expected", [
    (25, True),
    (18, True),
    (17, False),
    (0, False),
])
def test_is_adult(age, expected):
    assert User(age=age).is_adult() is expected
```

À l'exécution, `pytest` génère **4 tests distincts** :

```text
test_is_adult[25-True]   PASSED
test_is_adult[18-True]   PASSED
test_is_adult[17-False]  PASSED
test_is_adult[0-False]   PASSED
```

Chaque cas a son **ID** (le suffixe entre `[...]`). On peut lancer un seul cas :

```bash
pytest -k "test_is_adult[17-False]"
```

### 2.2 — IDs personnalisés pour la lisibilité

Quand les paramètres sont des objets complexes, les IDs auto-générés deviennent cryptiques. On peut les nommer :

```python
@pytest.mark.parametrize(
    "user,expected",
    [
        pytest.param(User(age=25), True, id="adult_25"),
        pytest.param(User(age=17), False, id="minor_17"),
        pytest.param(User(age=18), True, id="adult_at_threshold_18"),
        pytest.param(User(age=0), False, id="newborn_0"),
    ],
)
def test_is_adult(user, expected):
    assert user.is_adult() is expected
```

Sortie :

```text
test_is_adult[adult_25]                  PASSED
test_is_adult[minor_17]                  PASSED
test_is_adult[adult_at_threshold_18]     PASSED
test_is_adult[newborn_0]                 PASSED
```

**Beaucoup plus lisible** dans les rapports CI, en particulier pour 20+ paramètres.

### 2.3 — Plusieurs axes — produit cartésien

On peut **empiler** plusieurs `parametrize` pour un produit cartésien :

```python
@pytest.mark.parametrize("country", ["FR", "DE", "JP"])
@pytest.mark.parametrize("age", [17, 18, 25])
def test_is_adult_by_country(age, country):
    user = User(age=age, country=country)
    expected = age >= LEGAL_AGE[country]
    assert user.is_adult() is expected
```

→ Génère **3 × 3 = 9 tests**. Pratique pour explorer une matrice complète.

**Attention** : ne pas abuser — au-delà de 20-30 cas, le test devient un mini-program qu'on ne lit plus.

### 2.4 — Paramétrisation indirecte via fixtures

Si le paramètre demande une **construction non triviale**, on passe par une **fixture paramétrée** :

```python
@pytest.fixture(params=["sqlite", "postgres", "mysql"])
def db_session(request):
    backend = request.param
    if backend == "sqlite":
        return create_session_sqlite()
    if backend == "postgres":
        return create_session_postgres()
    return create_session_mysql()

def test_create_user(db_session):
    user = User(email="a@b.c")
    db_session.add(user)
    assert db_session.query(User).count() == 1
```

→ Le test tourne **3 fois**, une par backend. Idéal pour valider la portabilité d'une couche.

### 2.5 — `pytest.param` avec markers

On peut **marquer** un cas particulier :

```python
@pytest.mark.parametrize("input,expected", [
    ("normal", "result"),
    pytest.param("slow_case", "result", marks=pytest.mark.slow),
    pytest.param("broken", "result", marks=pytest.mark.skip(reason="Bug #123")),
    pytest.param("expected_fail", "result", marks=pytest.mark.xfail),
])
def test_process(input, expected):
    ...
```

Permet de :

- Marquer un cas `slow` pour le skip en CI rapide.
- `skip` un cas connu cassé.
- `xfail` un cas attendu en échec (test passe si le test échoue).

### 2.6 — Fournir les paramètres depuis une fonction

```python
def cases():
    return [
        ("a", 1),
        ("b", 2),
        ("c", 3),
    ]

@pytest.mark.parametrize("name,value", cases())
def test_dynamic_cases(name, value):
    ...
```

Utile quand les cas viennent d'un CSV, d'une fonction de calcul, ou d'une factory.

### 2.7 — Équivalents dans d'autres langages

| Langage           | Mécanisme                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| **JUnit 5**       | `@ParameterizedTest` + `@CsvSource` / `@MethodSource` / `@EnumSource`. |
| **Vitest / Jest** | `test.each(table)` ou `describe.each(table)`.                          |
| **Go**            | Tables-driven tests : `for _, tc := range testCases { t.Run(...) }`.   |
| **C#**            | `[Theory]` + `[InlineData]` / `[MemberData]` (xUnit).                  |

Le concept est universel.

---

## 3. Property-based testing — prolonger la paramétrisation

### 3.1 — De la table aux propriétés

Tests paramétrés = **table de cas explicites**. Property-based testing = **génération aléatoire** d'entrées dans le domaine de définition, avec vérification d'une **propriété invariante**.

```python
from hypothesis import given, strategies as st

@given(st.integers(min_value=-1000, max_value=1000))
def test_double_then_halve_is_identity(x):
    assert (x * 2) // 2 == x
```

Hypothesis génère **100 entiers** aléatoires entre -1000 et 1000 et vérifie la propriété. Si elle trouve un cas qui casse (overflow, par exemple), elle **rétrécit** automatiquement vers le plus petit cas reproductible.

### 3.2 — Quand l'utiliser

- **Algorithmes mathématiques** : `sort(sort(x)) == sort(x)`, `add(a,b) == add(b,a)`, etc.
- **Sérialiseurs / parsers** : `parse(serialize(x)) == x`.
- **Validateurs** : "tout email valide passe la validation".

Pas adapté pour : tests métiers très spécifiques où l'on connaît les cas particuliers.

### 3.3 — Outils

| Langage | Lib                                                                                           |
| ------- | --------------------------------------------------------------------------------------------- |
| Python  | [Hypothesis](https://hypothesis.readthedocs.io/).                                             |
| JS / TS | [fast-check](https://fast-check.dev/).                                                        |
| Java    | [jqwik](https://jqwik.net/), [QuickTheories](https://github.com/quicktheories/QuickTheories). |
| Rust    | [proptest](https://github.com/proptest-rs/proptest).                                          |
| Haskell | QuickCheck — l'original.                                                                      |

Mention pour aller plus loin ; le module se concentre sur la paramétrisation classique.

---

## 4. Fixtures avancées pour factoriser

### 4.1 — Factory fixture — créer plusieurs objets

Quand chaque test a besoin de **plusieurs objets uniques** sans qu'on veuille tous les définir :

```python
@pytest.fixture
def make_user():
    """Factory pour créer des Users uniques."""
    counter = [0]
    def _make(**kwargs):
        counter[0] += 1
        defaults = {
            "id": counter[0],
            "email": f"user{counter[0]}@test.local",
            "name": f"User {counter[0]}",
            "premium": False,
        }
        defaults.update(kwargs)
        return User(**defaults)
    return _make

def test_two_users_different(make_user):
    a = make_user()
    b = make_user()
    assert a.id != b.id

def test_premium_user_gets_discount(make_user):
    user = make_user(premium=True)
    assert apply_discount(user, 100) == 80
```

Avantages :

- Chaque test construit **exactement** ce dont il a besoin (en gardant des défauts sensés).
- Les IDs sont uniques entre tests.

### 4.2 — Test data builder

Quand les objets sont **complexes**, on construit un **builder** :

```python
class UserBuilder:
    def __init__(self):
        self._user = User(
            email="default@test.local",
            name="Default User",
            premium=False,
            country="FR",
        )

    def with_email(self, email):
        self._user.email = email
        return self

    def premium(self):
        self._user.premium = True
        return self

    def in_country(self, country):
        self._user.country = country
        return self

    def build(self):
        return self._user

# Usage
user = UserBuilder().premium().in_country("DE").build()
```

Avantages :

- Tests **explicites** sur les attributs qui comptent.
- Défauts sensés pour le reste.
- Facile à étendre.

**Pattern fréquent** en Java (Mockito + builder) et en C# (xUnit + AutoFixture).

### 4.3 — Object Mother

Variante du builder où l'on définit des **prototypes nommés** :

```python
class UserMother:
    @staticmethod
    def alice_premium():
        return User(email="alice@test.local", name="Alice", premium=True)

    @staticmethod
    def bob_standard():
        return User(email="bob@test.local", name="Bob", premium=False)

    @staticmethod
    def underage():
        return User(email="kid@test.local", age=15)

# Usage
def test_premium_discount():
    user = UserMother.alice_premium()
    assert apply_discount(user, 100) == 80
```

**Avantage** : nommer les "types" de users qu'on utilise souvent.

**Inconvénient** : Si on a 50 mothers, ça devient difficile à mémoriser.

**Compromis** : combiner Mother (pour les cas archétypaux) et Builder (pour les ad-hoc).

### 4.4 — Choisir entre les patterns

| Situation                                                                      | Pattern recommandé                  |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| 2-5 tests qui ont besoin du même setup simple.                                 | Fixture simple (`@pytest.fixture`). |
| Beaucoup de tests avec des objets **uniques mais similaires**.                 | Factory fixture (`make_user`).      |
| Tests avec **beaucoup d'attributs** dont seuls quelques-uns comptent par test. | Test data builder.                  |
| 3-5 archétypes réutilisés.                                                     | Object Mother.                      |
| Combinaison de plusieurs types de users.                                       | Mother + Builder.                   |

---

## 5. Refactor répétitif → paramétré (la pratique)

L'exigence du glossaire. Voici la **méthode**.

### 5.1 — Étape 1 — repérer la répétition

Indicateurs :

- Plusieurs tests dont les **3 lignes diffèrent** : nom, valeur d'entrée, valeur attendue.
- Tests numérotés (`test_case_1`, `test_case_2`).
- Tests dont le nom est presque identique : `test_age_25`, `test_age_18`, `test_age_17`.

### 5.2 — Étape 2 — identifier les paramètres

Pour chaque test similaire, lister :

- Ce qui **varie** → ce seront les paramètres.
- Ce qui **reste constant** → c'est le corps du test paramétré.

Exemple :

```python
def test_age_25_is_adult():
    user = User(age=25, country="FR")
    assert user.is_adult() is True

def test_age_18_is_adult():
    user = User(age=18, country="FR")
    assert user.is_adult() is True
```

Varie : `age`, et `expected`. Constant : `country="FR"`, le pattern de construction et d'assertion.

### 5.3 — Étape 3 — écrire le test paramétré

```python
@pytest.mark.parametrize("age,expected", [
    (25, True),
    (18, True),
])
def test_is_adult_fr(age, expected):
    user = User(age=age, country="FR")
    assert user.is_adult() is expected
```

### 5.4 — Étape 4 — étendre

On peut maintenant **ajouter facilement** des cas :

```python
@pytest.mark.parametrize("age,expected", [
    (25, True),
    (18, True),
    (17, False),
    (0, False),
])
def test_is_adult_fr(age, expected):
    ...
```

Ou paramétrer un nouvel axe (country) :

```python
@pytest.mark.parametrize("age,country,expected", [
    (18, "FR", True),
    (17, "FR", False),
    (18, "JP", False),   # majorité au Japon = 20 ans (avant 2022, retenu pour l'exemple)
    (20, "JP", True),
])
def test_is_adult(age, country, expected):
    assert User(age=age, country=country).is_adult() is expected
```

### 5.5 — Étape 5 — nettoyer

- Supprimer les anciens tests dupliqués.
- Vérifier que le total de cas couverts est **au moins** identique.
- Ajouter `pytest.param(...)` avec IDs si les cas sont nombreux ou complexes.

### 5.6 — Exemple complet — refactor d'une suite

Avant :

```python
def test_format_amount_positive():
    assert format_amount(100) == "100.00 €"

def test_format_amount_zero():
    assert format_amount(0) == "0.00 €"

def test_format_amount_negative():
    assert format_amount(-50) == "-50.00 €"

def test_format_amount_with_cents():
    assert format_amount(12.5) == "12.50 €"

def test_format_amount_with_many_decimals():
    assert format_amount(12.999) == "13.00 €"

def test_format_amount_large():
    assert format_amount(1_000_000) == "1000000.00 €"
```

Six fonctions, **un seul comportement** testé.

Après :

```python
@pytest.mark.parametrize("amount,expected", [
    pytest.param(100,        "100.00 €",     id="positive_int"),
    pytest.param(0,          "0.00 €",       id="zero"),
    pytest.param(-50,        "-50.00 €",     id="negative"),
    pytest.param(12.5,       "12.50 €",      id="cents_simple"),
    pytest.param(12.999,     "13.00 €",      id="many_decimals_rounded"),
    pytest.param(1_000_000,  "1000000.00 €", id="large_no_grouping"),
])
def test_format_amount(amount, expected):
    assert format_amount(amount) == expected
```

Six cas, un test paramétré. **Lisibilité** identique, **maintenance** réduite.

---

## 6. Quand factoriser, quand laisser dupliqué

### 6.1 — Critères en faveur de la paramétrisation

- Les tests ont **la même structure cognitive** (même setup, même type d'assertion).
- On veut **explorer une matrice** (plusieurs entrées, plusieurs sorties attendues).
- Les cas **augmentent dans le temps** — facile d'ajouter une ligne.

### 6.2 — Critères en faveur de la duplication

- Les tests **expriment des intentions distinctes** : nominal, edge, erreur.
- Les assertions sont **structurellement différentes** (une assertion d'égalité, une assertion d'exception).
- Le **setup diffère** trop entre cas.
- Le test serait **moins lisible** une fois paramétré.

### 6.3 — Heuristique simple

> Si en lisant le test paramétré on doit **fouiller la table** pour comprendre l'intention de chaque cas, ne pas paramétrer.

Mauvais — on ne sait plus à quoi servent les cas :

```python
@pytest.mark.parametrize("a,b,expected,case_type", [
    (1, 2, 3, "addition"),
    (-1, 1, 0, "addition"),
    (5, 0, ZeroDivisionError, "division"),
    (10, 0, ZeroDivisionError, "division"),
])
def test_compute(a, b, expected, case_type):
    if case_type == "addition":
        assert add(a, b) == expected
    elif case_type == "division":
        with pytest.raises(expected):
            divide(a, b)
```

C'est **deux** intentions distinctes (addition vs division-par-zéro). Mieux : deux fonctions.

### 6.4 — Cas typiques de séparation

| Type de test                        | Recommandation                                 |
| ----------------------------------- | ---------------------------------------------- |
| Cas nominaux                        | Paramétrer.                                    |
| Cas d'erreur (exceptions)           | Souvent un test séparé (assertion différente). |
| Tests de performance                | Séparés (peuvent ne pas tourner partout).      |
| Tests dépendants de l'environnement | Marquer + souvent séparés.                     |

---

## 7. Anti-patterns transverses

| Anti-pattern                                                                         | Conséquence                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Paramètres opaques — `(1, 2, 3, True, "X")` sans IDs.                                | Output de test runner illisible.                                                 |
| **3 axes** paramétrés en même temps sans IDs nommés.                                 | Explosion combinatoire, debug pénible.                                           |
| Paramétrer **les exceptions** ensemble avec les cas nominaux.                        | Mélange d'intentions. Séparer.                                                   |
| Builder qui devient **un mini-projet** (50 méthodes, 200 lignes).                    | Sur-engineering. Préférer des fixtures + factory fixture.                        |
| Object Mother **figée** avec 30 méthodes statiques.                                  | Catalogue difficile à mémoriser. Garder 3-5 archétypes.                          |
| **Property-based testing** sans assertion claire.                                    | Tests qui passent mais ne valident rien.                                         |
| Paramétrisation qui **masque** un bug d'un cas particulier (test passe globalement). | Un cas peut être incohérent. Lire chaque ligne.                                  |
| Sur-factoriser pour **DRY à tout prix**.                                             | Tests illisibles. Le but est **lisibilité + maintenance**, pas zéro duplication. |

---

## 8. Exercices pratiques

### Exercice 1 — Convertir 6 tests en 1 paramétré (≈ 30 min)

**Objectif.** Item N3 explicite — la pratique.

Soit cette suite :

```python
def test_validates_email_a(): assert is_valid("a@b.c") is True
def test_validates_email_b(): assert is_valid("alice@example.com") is True
def test_rejects_no_at(): assert is_valid("invalid") is False
def test_rejects_double_at(): assert is_valid("a@@b.c") is False
def test_rejects_empty(): assert is_valid("") is False
def test_rejects_none(): assert is_valid(None) is False
```

**Refactor** en 1 test paramétré avec IDs explicites.

**Livrable.** Code avant / après.

### Exercice 2 — Produit cartésien d'axes (≈ 30 min)

**Objectif.** Maîtriser le multi-axes.

Tester une fonction `weekend_premium(country, day)` qui retourne :

- `True` si `day` est samedi ou dimanche, pour les pays "Europe".
- `True` si `day` est vendredi ou samedi pour les pays "Middle East".

Écrire un test paramétré sur les 2 axes (3 pays × 7 jours = 21 cas).

**Livrable.** Test paramétré + IDs lisibles.

### Exercice 3 — Construire une factory fixture (≈ 30 min)

**Objectif.** Factor une fixture commune.

Sur son projet, identifier un objet souvent construit dans les tests. Écrire une `make_<X>` factory fixture qui :

- Gère un compteur unique.
- Permet override des champs critiques.

Refactorer 3 tests pour l'utiliser.

**Livrable.** Code fixture + 3 tests refactorés.

### Exercice 4 — Test data builder (≈ 45 min)

**Objectif.** Maîtriser le pattern.

Pour un objet complexe (par exemple `Order` avec items, customer, status, discount), écrire un **OrderBuilder** fluent. Écrire ensuite 3 tests qui l'utilisent.

**Livrable.** Builder + 3 tests.

### Exercice 5 — Audit de duplication (≈ 60 min)

**Objectif.** Œil critique.

Sur sa suite, identifier **5 groupes** de tests dupliqués. Pour chacun, décider :

- **Paramétrer** (et écrire le refactor).
- **Garder dupliqué** (et justifier).

**Livrable.** Liste annotée + 2-3 refactors concrets.

### Mini-défi — Refactor à grande échelle (≈ 90 min)

**Objectif.** Mettre en application.

Choisir un fichier de tests de 200+ lignes dans son projet. Refactorer pour réduire à **moins de 100 lignes** sans perdre de couverture, en utilisant :

- Tests paramétrés.
- Fixtures.
- Builders / mothers si pertinents.

**Livrable.** Diff avant / après + 5 lignes de bilan.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Identifier **4 types de duplication** dans une suite de tests.
- [ ] Écrire un `@pytest.mark.parametrize` simple à 2 paramètres.
- [ ] Utiliser **IDs personnalisés** avec `pytest.param(..., id="...")`.
- [ ] Empiler plusieurs `parametrize` pour un **produit cartésien**.
- [ ] Faire une **fixture paramétrée** pour itérer sur des backends.
- [ ] Écrire une **factory fixture** avec compteur unique.
- [ ] Implémenter un **test data builder** fluent.
- [ ] Choisir entre fixture, factory, builder, mother selon le cas.
- [ ] Citer **3 critères** en faveur de la paramétrisation.
- [ ] Citer **3 critères** en faveur de la duplication.
- [ ] Reconnaître **3 anti-patterns** de factorisation.
- [ ] Refactor une série de 5+ tests dupliqués en 1 test paramétré.

### Items du glossaire visés

**N3 atteint** :

- _factoriser ses paramètres de tests afin d'éviter les répétitions_ — l'ensemble du module.

---

## 10. Ressources complémentaires

### Documentation

- [pytest — parametrize](https://docs.pytest.org/en/stable/how-to/parametrize.html).
- [pytest — fixtures paramétrées](https://docs.pytest.org/en/stable/explanation/fixtures.html#fixture-parametrize).
- [JUnit 5 — Parameterized Tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests).
- [Vitest — test.each](https://vitest.dev/api/#test-each).

### Property-based testing

- [Hypothesis docs (Python)](https://hypothesis.readthedocs.io/).
- [fast-check (JS/TS)](https://fast-check.dev/).
- _Property-Based Testing with PropEr, Erlang, and Elixir_ (Hébert).

### Patterns

- [Martin Fowler — Object Mother](https://martinfowler.com/bliki/ObjectMother.html).
- [Test Data Builder](http://www.natpryce.com/articles/000714.html) — Nat Pryce.
- _xUnit Test Patterns_ (Meszaros) — chapitres "Object Mother", "Test Data Builder", "Parameterized Test".

### Pour aller plus loin

- **M9 (Golden Master)** — type particulier de paramétrisation sur des sorties existantes.
- **M5 (Pertinence)** — décider quelles séries de cas méritent d'être étendues.
- **M7 (TDD)** — la paramétrisation arrive souvent en phase Refactor.
