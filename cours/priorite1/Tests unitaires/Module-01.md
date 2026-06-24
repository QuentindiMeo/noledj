# M1 — Audit des pratiques N2

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Faire un **auto-diagnostic** précis de ses pratiques de test au regard du **niveau 2** du glossaire — savoir ce qu'il maîtrise, ce qu'il fait par intuition, et ce qu'il survole encore.
- Décrire la **structure canonique** d'un test unitaire en **Given / When / Then** (item N2 explicite) et reconnaître ce pattern dans des suites existantes.
- Distinguer **cas nominal**, **cas dégradé** et **edge cases** (item N2 explicite), et identifier les edge cases types pour des entrées numériques, chaînes, dates, collections.
- Définir et écrire des **fixtures** (item N2 explicite) qui factorisent les conditions initiales d'un test, et placer **setup / test / teardown** dans le cycle de vie.
- Donner une définition opérationnelle de **mocking**, **test coverage** et **test de non-régression** (items N2 du glossaire) — chacune en survol, les approfondissements arrivent en M2, M6 et chapitres connexes.
- **Auditer une suite de tests existante** sur 6 critères (lisibilité, given/when/then, edge cases, fixtures, indépendance, coverage) et produire une feuille de route d'amélioration.

## Durée estimée

0,5 jour.

## Pré-requis

- Pratiquer les tests unitaires depuis au moins 6 mois (niveau de départ N2 supposé).
- Un langage et un framework de test maîtrisés : Python + `pytest`, JavaScript + `vitest` / `jest`, Java + JUnit, etc. Les exemples sont en Python `pytest` mais le contenu se transpose.
- Un **projet existant** à auditer (perso, professionnel, OSS) avec une suite de tests sur laquelle s'exercer. Si rien sous la main, un repo open-source non-trivial (FastAPI, Flask, Pandas, …) fait l'affaire.

---

## 1. Pourquoi commencer par un audit

### 1.1 — Ce que l'audit débloque

> Avant de monter en niveau, savoir précisément **où on en est**. Un module sur le coverage n'apporte rien si on ne connaît pas son coverage actuel ; un module sur les mocks n'apporte rien si on confond déjà mock et stub.

L'audit de pratiques N2 a trois bénéfices concrets :

1. **Cartographier ses zones de confort** vs ses **angles morts** — souvent surprenants quand on les met à plat.
2. **Construire un vocabulaire commun** : les termes "fixture", "edge case", "given/when/then" doivent être **opérationnels**, pas juste familiers.
3. **Acquérir un œil critique** sur une suite de tests existante — utile pour la revue de code et pour entrer dans un projet inconnu.

### 1.2 — Le glossaire N2 — la cible à valider

Reprise des items N2 du glossaire ([source](../../resources/priority1/Tests%20unitaires.md)) :

- Structurer un test unitaire : **given / when / then**.
- Déterminer les **conditions initiales** à ses tests.
- Connaître la notion de **mocking**.
- Avoir connaissance de ce qu'est le **TDD**.
- Différencier un **cas nominal** d'un **cas dégradé**.
- Effectuer des **edge cases**.
- Expliquer la notion de **test coverage**.
- Expliquer ce qu'est un test de **non-régression**.
- Utiliser des **mocks**.
- Utiliser des **stubs**.
- Décrire le cycle de vie d'un test unitaire (**setup, test, teardown**).
- Créer et utiliser des **fixtures**.

Le M1 **vérifie** ces 12 points. Les modules suivants (M2-M9) **les consolident** et **amorcent le N3**.

### 1.3 — L'analogie du diagnostic médical

Passer du N2 au N3 est une **mise à niveau ciblée**, pas un cours d'introduction. Comme un check-up médical : on identifie ce qui est faible, on traite avec précision. Sans audit, on prescrit large et on rate la cible.

### 1.4 — Anti-patterns identifiables d'emblée

| Signe                                                                          | Diagnostic                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| "Mes tests sont indépendants" mais les nommer `test_01`, `test_02`, `test_03`. | Suspect — les tests dépendent peut-être de l'ordre.               |
| "Je fais du mocking" mais utilise systématiquement le même mock global.        | Mocking superficiel — chaque test devrait avoir ses mocks scopés. |
| "Je teste mon code" mais 80 % des tests testent le framework (ORM, FastAPI).   | Pertinence à revisiter (M5).                                      |
| Coverage à 95 % mais les tests passent même avec `return None` dans le métier. | Tests qui n'assert quasiment rien — pseudo-coverage.              |
| Tests qui prennent 12 minutes pour 80 fichiers.                                | Pas isolés du I/O, suite probablement fragile.                    |

Ce module construit le **diagnostic personnel** ; les modules suivants traitent les pathologies identifiées.

---

## 2. Vocabulaire de référence

### 2.1 — Les familles de tests — situer le périmètre

Le glossaire ([N1](../../resources/priority1/Tests%20unitaires.md)) attend qu'on **distingue les familles de tests**. Récapitulatif :

| Famille                  | Ce qu'on teste                                                            | Coût d'exécution                      | Quand l'écrire                               |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| **Unitaire**             | Une **unité isolée** (classe, fonction). Pas d'I/O réel.                  | < 10 ms par test.                     | À chaque feature, au plus près du code.      |
| **Intégration**          | **Plusieurs composants ensemble** (service + DB réelle, deux modules).    | 100 ms - quelques secondes.           | Aux points d'intégration critiques.          |
| **End-to-end (E2E)**     | Le **système complet** (app + DB + APIs externes) du point de vue user.   | Plusieurs secondes par scénario.      | Quelques scénarios critiques, pas tous.      |
| **Contrat (contract)**   | L'**interface** entre deux services (consumer / provider).                | Variable.                             | À chaque évolution d'une API publique.       |
| **Snapshot**             | Une **sortie** complète, comparée à une référence (UI, serialization).    | Rapide à écrire, fragile à maintenir. | Régressions visuelles, JSON canonique.       |
| **Property-based**       | Une **propriété** invariante avec des entrées aléatoires (Hypothesis, …). | Variable, plus lent.                  | Algorithmes mathématiques, sérialiseurs.     |
| **Mutation**             | Tester les **tests** : muter le code, vérifier que ≥ 1 test échoue.       | Long.                                 | Audit de qualité périodique, pas dans la CI. |
| **Performance / charge** | Latence / throughput sous charge.                                         | Long.                                 | À part, après stabilisation fonctionnelle.   |

Ce parcours **vise les tests unitaires**. Mais nommer correctement les autres permet de **ne pas tordre un unitaire en y mettant de l'intégration cachée** (anti-pattern fréquent : "test unitaire" qui ouvre une vraie connexion PostgreSQL → ce n'est plus un unitaire).

### 2.2 — Tests de non-régression — précision

> Un **test de non-régression** est un test qui vérifie qu'**un comportement qui marchait avant** marche toujours après un changement.

Caractéristique : ce n'est **pas** un type de test au sens technique (unitaire, intégration, E2E) — c'est un **rôle**. La plupart des tests, une fois écrits, **deviennent** des tests de non-régression : ils étaient initialement écrits pour valider une nouvelle feature, et persistent ensuite comme garde-fous.

Cas particulier : un test **explicitement** écrit après un bug fix pour qu'il ne se reproduise pas. On le nomme alors souvent `test_regression_issue_XXX` ou `test_bug_fix_YYY` — sa raison d'être est documentée.

### 2.3 — Mocking — premier survol

> Le **mocking** est le remplacement d'une **dépendance** d'un code testé par un **objet de substitution** qui imite l'interface, mais dont on contrôle le comportement.

Cas typique : la fonction `send_invoice()` qui appelle `email_client.send(...)`. Dans le test, on **mock** `email_client` pour que `send()` ne fasse **rien** (et qu'on puisse vérifier qu'il a été appelé avec les bons arguments). On ne veut pas envoyer de vrai mail.

Le **vocabulaire complet** (mock, stub, fake, spy, dummy, etc.) est l'objet de **M2**. À ce stade, retenir : "on remplace la vraie dépendance par un objet contrôlé pour isoler le code testé".

### 2.4 — Coverage — premier survol

> Le **test coverage** est une mesure de **proportion de code** (lignes, branches, conditions) **exécuté** par la suite de tests.

Plusieurs niveaux de granularité :

- **Line coverage** : pourcentage de lignes exécutées.
- **Branch coverage** : pourcentage de branches `if/else` empruntées.
- **Condition coverage** : pourcentage de sous-expressions booléennes évaluées à `True` ET à `False`.

Un piège connu : **coverage élevé ≠ code testé**. Une ligne **exécutée** sans **assertion** sur son résultat n'est pas testée — juste touchée. Approfondissement en **M6**.

### 2.5 — Cycle de vie — setup / test / teardown

Tout test unitaire suit le cycle :

```text
   Setup  ──► Test  ──► Teardown
   (avant)   (corps)   (après)
```

- **Setup** : préparer les conditions initiales (instanciation, données mocks, fixture init).
- **Test** : exécuter la logique testée + faire les assertions.
- **Teardown** : nettoyer ce qui doit l'être (fichiers temp, connexions, variables globales).

En `pytest`, on l'exprime via les **fixtures** avec `yield` :

```python
@pytest.fixture
def db_in_memory():
    db = SQLiteInMemory.connect()    # setup
    db.create_schema()
    yield db                          # test reçoit `db`
    db.close()                        # teardown
```

En JUnit 5 : `@BeforeEach` / `@AfterEach`. En Vitest : `beforeEach` / `afterEach`. Le **vocabulaire varie**, le concept est universel.

---

## 3. Structurer un test — Given / When / Then (item N2)

### 3.1 — Le pattern

> **Given** (préparation) → **When** (action testée) → **Then** (assertions).

Une variante : **Arrange / Act / Assert** (AAA). Les deux disent la même chose ; **given/when/then** vient du BDD (cf. M3), AAA est plus courant en Python/Ruby/JS.

Exemple en Python `pytest` :

```python
def test_apply_discount_reduces_price():
    # Given : un panier à 100 € et une remise 10 %
    cart = Cart(items=[Item(price=100)])
    discount = Discount(rate=0.10)

    # When : on applique la remise
    cart.apply(discount)

    # Then : le total est 90 €
    assert cart.total() == 90
```

Trois principes pour bien écrire un test :

1. **Lisible** : un lecteur qui ne connaît pas le code comprend l'intention en 5 secondes.
2. **Atomique** : un seul comportement vérifié. Si plusieurs sont vérifiés, c'est probablement plusieurs tests.
3. **Indépendant** : tourne seul, dans n'importe quel ordre, sans dépendance partagée mutable (cf. M4).

### 3.2 — Ce qu'un bon test n'est pas

| Mauvais signe                                              | Pourquoi                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `test_everything()` avec 30 assertions de domaines variés. | Difficile à lire, difficile à diagnostiquer en cas d'échec (lequel exactement ?).                                          |
| Test qui appelle 5 méthodes du SUT (system under test).    | Pas atomique. Découper en 5 tests focalisés.                                                                               |
| Test qui assert `True == True`.                            | N'assert rien sur le code. Pseudo-coverage.                                                                                |
| Test qui dépend d'un état modifié par un test précédent.   | Pas indépendant. La perte d'ordre casse tout.                                                                              |
| Test sans assertion claire (`assert result`).              | Trop faible : `result = None` ferait `assert None` → faux mais c'est trop générique. Précis : `assert result == Foo(...)`. |
| Test très long sans commentaires Given/When/Then.          | Lecture pénible. Marquer les sections aide la revue.                                                                       |

### 3.3 — Nommage des tests

Quatre conventions usuelles :

| Convention                               | Exemple                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `test_<comportement>`                    | `test_apply_discount_reduces_price`                           |
| `test_<unit>_<condition>_<expected>`     | `test_cart_with_expired_coupon_raises_error`                  |
| `test_<feature>__<contexte>__<résultat>` | `test_checkout__empty_cart__raises_emptycart`                 |
| Phrase complète (BDD)                    | `it should apply the discount when coupon is valid` (JS/Ruby) |

Quelle que soit la convention, le nom doit **dire le comportement**, pas la mécanique (`test_function_returns_list_of_3` < `test_search_returns_top_3_matches`).

### 3.4 — Atelier de réécriture

Voici un test qui réussit mais qui est **mal structuré** :

```python
def test_calc():
    c = Cart()
    c.add(Item("book", 10))
    c.add(Item("pen", 2))
    assert c.total() == 12
    c.remove("book")
    assert c.total() == 2
    assert len(c) == 1
    c.empty()
    assert c.total() == 0
```

Quatre comportements distincts en un test. Réécriture en 4 tests + 1 fixture :

```python
@pytest.fixture
def two_item_cart():
    c = Cart()
    c.add(Item("book", 10))
    c.add(Item("pen", 2))
    return c

def test_adding_items_sums_total(two_item_cart):
    # Given : panier avec 2 items totalisant 12
    # When : on lit le total
    # Then : il vaut 12
    assert two_item_cart.total() == 12

def test_removing_item_updates_total(two_item_cart):
    # Given : panier avec 2 items
    # When : on retire "book"
    two_item_cart.remove("book")
    # Then : total = 2, et 1 item reste
    assert two_item_cart.total() == 2
    assert len(two_item_cart) == 1

def test_emptying_cart_resets_total(two_item_cart):
    two_item_cart.empty()
    assert two_item_cart.total() == 0
    assert len(two_item_cart) == 0
```

On gagne en **lisibilité**, en **diagnostic** (chaque test passe/échoue indépendamment), et la fixture **factorise** le setup.

---

## 4. Cas nominal, cas dégradé, edge cases (item N2)

### 4.1 — Définitions opérationnelles

| Catégorie       | Définition                                                                      | Exemple — fonction `sqrt(x)`   |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| **Cas nominal** | Entrée typique, sortie attendue.                                                | `sqrt(9) == 3`                 |
| **Edge case**   | Entrée **valide mais aux limites** du domaine — où les bugs se cachent souvent. | `sqrt(0) == 0`, `sqrt(1) == 1` |
| **Cas dégradé** | Entrée **invalide** ou conditions anormales — comment le système réagit-il ?    | `sqrt(-1)` → exception         |

Un bon ensemble de tests pour une fonction couvre **les 3 catégories**.

### 4.2 — Edge cases — catalogue

Selon le **type de l'entrée**, des edge cases types reviennent :

#### Entrées numériques

- `0`.
- Nombre négatif si la fonction accepte des positifs.
- `1` (élément neutre).
- `-1`.
- Valeur maximale du type (`sys.maxsize`, `Number.MAX_SAFE_INTEGER`).
- Valeur minimale.
- Valeurs flottantes : `0.0`, `0.1 + 0.2` (precision), `NaN`, `+Infinity`, `-Infinity`.

#### Entrées chaînes

- Chaîne vide `""`.
- Chaîne d'un seul caractère.
- Chaîne très longue (kilo-caractères).
- Caractères spéciaux (`'`, `"`, `\n`, `\t`, `\0`).
- Unicode : accents, emoji, RTL (arabe, hébreu).
- Whitespace au début / fin.
- `None` / `null`.

#### Entrées collections (listes, sets, dicts)

- Vide `[]` / `{}`.
- Un seul élément.
- Doublons (pour les sets, ensembles).
- Très grande collection (1M éléments — soulève les questions perf).
- Éléments `None`.
- Collection avec ordre spécifique vs aléatoire.

#### Entrées date/temps

- Aujourd'hui.
- Hier / demain.
- Bord d'année (`2025-12-31` / `2026-01-01`).
- Bord de mois (`2026-02-28` / `2026-02-29` année bissextile).
- Avant Unix epoch.
- Time zones (UTC vs locale, DST).
- Format invalide.

#### Entrées objets

- `None` / `null`.
- Objet "vide" (champs à défaut).
- Objet avec **tous** les champs optionnels remplis.
- Objet avec **un seul** champ requis.

### 4.3 — Cas dégradés — au-delà des entrées

Au-delà des entrées de fonction, certains **cas dégradés** viennent du **contexte d'exécution** (couvert en M4) :

- Service externe **indisponible** (timeout, 503).
- Base de données **lente** (timeout sur lock).
- Disque **plein** au moment d'écrire un log.
- Permission IAM/file **refusée**.
- Concurrence : deux requêtes simultanées sur la même ressource.

Ces cas dégradés sont **plus difficiles à tester en unitaire** — ils nécessitent souvent du mocking ciblé (M2).

### 4.4 — Méthode "TDD-style pour edge cases"

Trois questions à se poser pour chaque fonction :

1. **Quelle est la valeur typique ?** → 1 test nominal.
2. **Quelles sont les limites du domaine ?** → 1-3 tests edge cases.
3. **Que se passe-t-il en dehors du domaine ?** → 1-2 tests cas dégradés (exception attendue, valeur par défaut, etc.).

Soit typiquement **3 à 6 tests** par fonction non-triviale.

### 4.5 — Exemple complet

Fonction à tester :

```python
def parse_age(s: str) -> int:
    """Parse 'NN ans' (ou 'NN year(s)') → int. Lève ValueError si non parsable ou < 0."""
    ...
```

Tests requis :

```python
def test_parse_age_nominal_french():
    assert parse_age("30 ans") == 30

def test_parse_age_nominal_english():
    assert parse_age("30 years") == 30
    assert parse_age("1 year") == 1

# Edge cases
def test_parse_age_zero():
    assert parse_age("0 ans") == 0

def test_parse_age_one_digit():
    assert parse_age("5 ans") == 5

def test_parse_age_large_number():
    assert parse_age("999 ans") == 999

# Cas dégradés
def test_parse_age_empty_raises():
    with pytest.raises(ValueError):
        parse_age("")

def test_parse_age_no_number_raises():
    with pytest.raises(ValueError):
        parse_age("ans")

def test_parse_age_negative_raises():
    with pytest.raises(ValueError):
        parse_age("-5 ans")

def test_parse_age_float_raises():
    with pytest.raises(ValueError):
        parse_age("30.5 ans")

def test_parse_age_unicode_whitespace():
    # whitespace insécable autour
    assert parse_age(" 30 ans ") == 30  # ou : raise selon la spec — à déterminer
```

10 tests pour une fonction d'1 ligne — souvent plus que la fonction elle-même. C'est **normal et attendu** sur du code critique de parsing.

---

## 5. Fixtures et conditions initiales (item N2)

### 5.1 — Pourquoi les fixtures

Sans fixture, le setup se duplique dans chaque test :

```python
def test_add_item():
    cart = Cart(); cart.add(Item("book", 10))
    ...

def test_remove_item():
    cart = Cart(); cart.add(Item("book", 10))
    ...

def test_total():
    cart = Cart(); cart.add(Item("book", 10))
    ...
```

3 lignes répétées 3 fois. À 50 tests, le setup change → 50 endroits à modifier.

Avec fixture :

```python
@pytest.fixture
def cart_with_book():
    c = Cart()
    c.add(Item("book", 10))
    return c

def test_add_item(cart_with_book): ...
def test_remove_item(cart_with_book): ...
def test_total(cart_with_book): ...
```

### 5.2 — Anatomie d'une fixture pytest

```python
@pytest.fixture(scope="function")
def db_session():
    # Setup
    session = SessionLocal()

    yield session                      # le test reçoit `session`

    # Teardown
    session.rollback()
    session.close()
```

Quatre points à retenir :

- **`@pytest.fixture`** — déclare une fonction comme fixture.
- **Argument dans la signature du test** = injection de la fixture (par nom).
- **`yield`** — sépare setup et teardown.
- **`scope=`** — durée de vie (cf. 5.4).

### 5.3 — Composition de fixtures

Une fixture peut **dépendre** d'une autre :

```python
@pytest.fixture
def db_session(): ...

@pytest.fixture
def user_in_db(db_session):
    user = User(email="a@b.c")
    db_session.add(user)
    db_session.commit()
    return user

def test_user_email(user_in_db):
    assert user_in_db.email == "a@b.c"
```

`pytest` résout l'ordre automatiquement : il crée `db_session`, puis `user_in_db`, puis injecte `user_in_db` dans le test.

### 5.4 — Scopes — durée de vie

| Scope      | Durée de vie                                                           |
| ---------- | ---------------------------------------------------------------------- |
| `function` | (Défaut) — une instance **par test**. Setup et teardown à chaque test. |
| `class`    | Une instance **par classe de tests**.                                  |
| `module`   | Une instance **par fichier**.                                          |
| `session`  | Une instance **par run pytest** (réutilisée pour tous les tests).      |

**Compromis** : un scope plus large = perf meilleure (setup lourd partagé), mais risque de **partager un état mutable** entre tests (anti-pattern d'indépendance — M4).

Bonne pratique : **`function` par défaut**, élargir au cas par cas si la perf l'exige et si l'état partagé est **immutable** (ex : connexion DB en lecture seule à un dataset gelé).

### 5.5 — Fixtures intégrées de `pytest`

| Fixture       | Usage                                                           |
| ------------- | --------------------------------------------------------------- |
| `tmp_path`    | Chemin vers un dossier temporaire propre par test.              |
| `monkeypatch` | Patcher des variables d'env, attributs, sans pollution croisée. |
| `capsys`      | Capturer `stdout` / `stderr` pendant le test.                   |
| `caplog`      | Capturer les logs Python générés.                               |

```python
def test_writes_file(tmp_path):
    out = tmp_path / "out.txt"
    write_report(out)
    assert out.read_text() == "report"
```

### 5.6 — Anti-patterns fixtures

| Anti-pattern                                                    | Conséquence                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Fixture qui lit un fichier sans `scope="session"` quand stable. | Setup répété N fois inutilement. Élargir le scope.                        |
| Fixture `scope="session"` qui retourne un objet mutable.        | Pollutions croisées entre tests. Réduire le scope ou retourner une copie. |
| Fixture qui dépend d'une **variable globale**.                  | Indépendance des tests cassée. Utiliser une autre fixture.                |
| Fixture qui fait trop de choses (`big_fixture` qui setup tout). | Couplage fort, tests qui setup beaucoup pour pas grand-chose.             |
| Pas de teardown (rollback, close, delete file).                 | Fuite de ressources sur runs longs.                                       |

---

## 6. Mocking — avant-goût (approfondi en M2)

### 6.1 — Pourquoi mocker

Un test unitaire **isole** une unité de son environnement. Si la fonction testée appelle `send_email()`, on **ne veut pas** envoyer un vrai mail. On remplace `send_email` par un objet contrôlé qui se contente de **noter** qu'il a été appelé.

### 6.2 — Premier exemple en Python — `unittest.mock`

```python
from unittest.mock import Mock

def notify_user(user, email_client):
    if user.active:
        email_client.send(to=user.email, subject="Welcome")
        return True
    return False

def test_notify_user_sends_email_to_active_user():
    # Given
    user = Mock(active=True, email="alice@example.com")
    email_client = Mock()

    # When
    result = notify_user(user, email_client)

    # Then
    assert result is True
    email_client.send.assert_called_once_with(
        to="alice@example.com", subject="Welcome"
    )

def test_notify_user_does_not_send_for_inactive():
    user = Mock(active=False, email="b@b.c")
    email_client = Mock()

    notify_user(user, email_client)

    email_client.send.assert_not_called()
```

Le **`Mock()`** :

- Imite l'interface (n'importe quel attribut / méthode existe).
- Enregistre les appels — `assert_called_once_with(...)`, `assert_not_called()`.

### 6.3 — Mock vs Stub — préambule

Sans entrer dans les détails (M2) :

- **Stub** : objet qui **retourne** des valeurs prédéfinies. On vérifie l'**output** du code testé.
- **Mock** : objet qui **enregistre** les interactions. On vérifie les **appels** faits par le code testé.

Beaucoup d'outils (`unittest.mock`, `sinon.js`) mélangent les deux concepts dans une même classe. Le M2 désambiguïse.

---

## 7. Test coverage — avant-goût (approfondi en M6)

### 7.1 — Mesurer son coverage

```bash
# Python
pip install pytest-cov
pytest --cov=myapp --cov-report=term-missing

# Sortie typique :
# Name              Stmts   Miss  Cover   Missing
# -----------------------------------------------
# myapp/cart.py        45      3    93%   17, 22-23
# myapp/discount.py    18      0   100%
```

`Stmts` = lignes exécutables. `Miss` = non couvertes. `Missing` = numéros des lignes non couvertes.

### 7.2 — Lire un rapport — ce qui compte vraiment

Quatre points :

1. **Coverage absolu** : 80-90 % est une cible saine pour la majorité des projets. 95 %+ pour des libs critiques. 100 % est presque toujours du gaspillage.
2. **Lignes manquantes** : où sont-elles ? Souvent des branches d'erreur peu testées, du code mort à supprimer, ou du défensif inutile.
3. **Branch coverage** est plus strict que line coverage. Activable via `--cov-branch`.
4. **Différence vs précédent** : ne pas baisser le coverage en CI = règle simple.

### 7.3 — Le piège — coverage ≠ qualité

Un test qui exécute la ligne sans assertion la "couvre". Coverage 100 % avec 0 assertion ≠ tests utiles.

Outils complémentaires :

- **Mutation testing** (cf. M9) : altère le code, vérifie qu'un test échoue. Si non, le test n'est pas utile.
- **Code review** des assertions : revoir si elles sont précises.

---

## 8. Audit pratique — méthode

### 8.1 — Grille d'audit en 6 axes

Pour une suite de tests, noter 0-3 chaque axe :

| Axe                                 | 0                         | 1                             | 2                                 | 3                                             |
| ----------------------------------- | ------------------------- | ----------------------------- | --------------------------------- | --------------------------------------------- |
| **Lisibilité (nommage, structure)** | Tests cryptiques.         | Quelques tests clairs.        | Pattern given/when/then visible.  | Tous bien nommés + structure AAA évidente.    |
| **Couverture given/when/then**      | Absent.                   | Quelques tests structurés.    | Majorité.                         | 100 % de la suite.                            |
| **Edge cases / cas dégradés**       | Aucun.                    | Nominal seul, parfois 1 edge. | Majorité des fonctions critiques. | Systématique sur le métier critique.          |
| **Fixtures et factorisation**       | Setup dupliqué partout.   | Quelques fixtures.            | Hiérarchie de fixtures cohérente. | Fixtures composées, scopes adaptés.           |
| **Indépendance des tests**          | Tests fragiles à l'ordre. | Quelques tests partagés.      | Indépendance générale.            | Indépendance garantie + tests en parallèle.   |
| **Coverage**                        | Inconnu.                  | Mesuré ponctuellement.        | Suivi en CI.                      | Mesuré, branchu, mutation testing périodique. |

Score total / 18 — un audit qui sort à 12+ a une base solide.

### 8.2 — Méthode d'audit en 1 heure

Pour une suite de 50-200 tests :

1. **5 min** — Lancer la suite, mesurer la durée. Au-delà de 30 s, c'est suspect (I/O caché ?).
2. **10 min** — Coverage : `pytest --cov`. Noter le %.
3. **15 min** — Lire 10 tests au hasard. Noter pour chaque : nommage clair ? Given/When/Then ? Edge cases ? Fixtures ? Assertion précise ?
4. **10 min** — Lancer la suite en parallèle (`pytest -n auto` avec `pytest-xdist`). Si des tests échouent, indépendance cassée.
5. **10 min** — Inverser l'ordre des tests (`pytest -p no:randomly --collect-only` puis run inverse). Échecs = dépendances cachées.
6. **10 min** — Rédiger la note d'audit (1 page) avec score et 3-5 priorités.

### 8.3 — Note d'audit type

Modèle :

```markdown
# Audit suite de tests — projet X — date

## Score (grille 6 axes /3) — total : 11/18

- Lisibilité : 2/3 — bons noms, given/when/then implicite mais lisible.
- Given/When/Then : 1/3 — convention pas systématique.
- Edge cases : 1/3 — seuls les cas nominaux sont testés.
- Fixtures : 2/3 — bonne base, scopes parfois trop larges.
- Indépendance : 2/3 — passe en parallèle, mais 3 tests échouent en ordre inversé.
- Coverage : 3/3 — 87 %, mesuré en CI, branchu.

## Priorités

1. Documenter 3-5 edge cases manquants sur les modules métier (cart, discount).
2. Casser les 3 dépendances cachées détectées en ordre inversé.
3. Aligner sur given/when/then comme convention équipe.

## Délai estimé : 1 semaine.
```

---

## 9. Exercices pratiques

### Exercice 1 — Auto-audit personnel (≈ 30 min)

**Objectif.** Le diagnostic initial.

**Étapes :**

1. Reprendre les 12 items du glossaire N2 (section 1.2).
2. Pour chaque item, se noter sur 3 :
   - 0 — je découvre, je ne pratique pas.
   - 1 — j'ai vu/utilisé, sans confiance.
   - 2 — je pratique régulièrement.
   - 3 — je peux l'expliquer et l'enseigner.
3. Identifier les **2-3 items les plus faibles** — c'est là que les modules suivants apporteront le plus.

**Livrable.** Tableau 12 lignes + 3 items prioritaires.

### Exercice 2 — Réécrire un test en given/when/then (≈ 30 min)

**Objectif.** Item N2 explicite.

Prendre 3 tests **mal structurés** de son projet (ou de l'exemple section 3.4). Pour chacun :

1. Identifier les **comportements multiples** testés en un seul test.
2. Réécrire en N tests focalisés, chacun avec sections Given/When/Then explicites (commentaires ou blocs).
3. Extraire une **fixture** pour le setup commun.

**Livrable.** Tests avant/après, fixture nouvelle.

### Exercice 3 — Catalogue d'edge cases (≈ 45 min)

**Objectif.** Item N2 explicite.

Choisir une fonction non triviale de son projet (parser, calcul, validateur). Lister :

1. **2-3 cas nominaux**.
2. **3-5 edge cases** (selon le type d'entrée).
3. **2-3 cas dégradés**.

Écrire les tests correspondants. Faire tourner. Si certains passent **sans** changer le code, c'était déjà couvert. Si d'autres révèlent un bug — corriger le code et garder le test.

**Livrable.** Liste des cas + suite de tests + 1 ligne par bug éventuel découvert.

### Exercice 4 — Fixtures composées (≈ 30 min)

**Objectif.** Item N2 explicite — fixtures.

Sur son projet, créer une **hiérarchie de 3 fixtures** :

- `db_session` (scope `function`) : session DB en mémoire.
- `seeded_db` (dépend de `db_session`) : pré-rempli avec 3 users.
- `admin_user` (dépend de `seeded_db`) : récupère le user admin.

Écrire 3 tests qui utilisent chacun une de ces fixtures différemment.

**Livrable.** Code des fixtures + 3 tests.

### Exercice 5 — Audit complet d'une suite (≈ 60 min)

**Objectif.** Méthode d'audit.

Sur la suite de tests d'un projet réel (perso, repo OSS, ou suite d'entreprise) :

1. Suivre la **méthode 8.2** (1h).
2. Noter sur la **grille 8.1**.
3. Rédiger la **note d'audit** (section 8.3).
4. Lister les **3 priorités** d'amélioration concrètes.

**Livrable.** Note d'audit complète (1 page).

### Mini-défi — Repérer un faux coverage (≈ 30 min)

**Cas.** Lancer `pytest --cov` sur son projet. Identifier **une ligne couverte** dans le rapport, et vérifier dans le test correspondant qu'**aucune assertion** ne vérifie le **comportement** de cette ligne.

Si on en trouve : ajouter une assertion pertinente. Si on n'en trouve pas : excellente nouvelle.

**Livrable.** Capture du rapport + 1 cas analysé.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **8 familles** de tests et leur scope respectif.
- [ ] Définir un **test de non-régression** et distinguer son rôle de la "famille technique".
- [ ] Structurer un test en **Given / When / Then** avec exemple en 5 lignes.
- [ ] Décrire les **3 principes** d'un bon test (lisible, atomique, indépendant).
- [ ] Distinguer **cas nominal / edge case / cas dégradé** avec un exemple par catégorie.
- [ ] Lister **3-5 edge cases types** pour : entier, chaîne, liste, date.
- [ ] Définir une **fixture** : décorateur, yield, scope, injection.
- [ ] Citer les **4 scopes** pytest et leur impact perf vs isolation.
- [ ] Donner une définition **opérationnelle** de mocking, coverage, non-régression.
- [ ] Décrire le **cycle de vie** setup / test / teardown et leur correspondance en pytest (fixture + yield).
- [ ] Suivre la **méthode d'audit en 6 axes** sur une suite donnée.

### Items du glossaire visés

**N2 consolidés** :

- _structurer un test : given / when / then_ — section 3.
- _déterminer les conditions initiales_ — sections 3 et 5.
- _connaître la notion de mocking_ — section 6 (approfondi M2).
- _différencier cas nominal / cas dégradé_ — section 4.
- _effectuer des edge cases_ — section 4.
- _expliquer la notion de test coverage_ — section 7 (approfondi M6).
- _expliquer le test de non-régression_ — section 2.2.
- _utiliser des mocks et stubs_ — section 6 (approfondi M2).
- _cycle de vie setup / test / teardown_ — section 5.
- _créer et utiliser des fixtures_ — section 5.

L'audit M1 valide l'**état des lieux** N2. Les modules suivants poussent au **N3** :

---

## 11. Ressources complémentaires

### Documentation

- [pytest documentation](https://docs.pytest.org/) — référence Python.
- [pytest fixtures](https://docs.pytest.org/en/stable/explanation/fixtures.html) — détail des scopes et composition.
- [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/) — équivalent Java.
- [Vitest / Jest](https://vitest.dev/) — JS / TS.

### Livres

- _xUnit Test Patterns_ (Meszaros) — la référence sur le vocabulaire et les patterns.
- _Working Effectively with Legacy Code_ (Feathers) — pour appliquer les tests à du code existant (utile au M9).
- _Growing Object-Oriented Software, Guided by Tests_ (Freeman & Pryce) — TDD profond.

### Articles

- [Martin Fowler — Test Double](https://martinfowler.com/bliki/TestDouble.html) — vocabulaire stub / mock / fake / spy.
- [Kent Beck — Test Desiderata](https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3) — les qualités d'un bon test.

### Pour aller plus loin

- **M2 (Stubs vs Mocks)** — désambiguïser le vocabulaire.
- **M4 (Indépendance des tests)** — verrouiller la fiabilité de la suite.
- **M6 (Coverage)** — interpréter les métriques de coverage.
