# M3 — TDD vs BDD

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir précisément **TDD** (Test-Driven Development) : cycle **Red / Green / Refactor**, raison d'être (design émergent, suite de tests qui croît avec le code), et les deux écoles **Detroit (classicist)** vs **London (mockist)** déjà introduites en M2.
- Définir précisément **BDD** (Behavior-Driven Development) : pratique de spécification **outside-in**, langage **ubiquitaire**, **trois amigos** (Dev + QA + Business), et son expression usuelle en **Gherkin** (Given / When / Then en langage naturel).
- Distinguer **TDD et BDD** (item N3 explicite) : niveaux d'abstraction différents, audience différente, et complémentarité fréquente plutôt qu'opposition.
- **Lire** les deux styles (item N3 explicite) : reconnaître à l'œil un test unitaire TDD, un scénario BDD Gherkin, un test pytest-bdd, et savoir quoi y chercher.
- Citer les **frameworks associés** : pytest / JUnit / vitest côté TDD ; Cucumber / pytest-bdd / SpecFlow / Behave / Gauge côté BDD.
- **Implémenter la même feature** dans les deux styles : une feature `pricing` traitée en TDD pur puis en BDD avec Gherkin — c'est la pratique demandée par le glossaire.

## Durée estimée

1 jour.

## Pré-requis

- M1 (vocabulaire, given/when/then).
- M2 (stubs vs mocks, écoles classicist / mockist).
- `pytest` installé. Pour la partie BDD : `pytest-bdd` ou `behave`.
- Un mini-projet "bac à sable" pour faire l'exercice TDD + BDD.

---

## 1. Pourquoi un module dédié à la distinction TDD / BDD

### 1.1 — Deux confusions courantes

> **Confusion 1** : "TDD, c'est écrire les tests avant le code."
>
> **Confusion 2** : "BDD, c'est Cucumber et Gherkin."

Les deux raccourcis sont **partiellement vrais** mais **passent à côté** de l'essentiel.

- **TDD** : c'est un **cycle de design** où les tests guident l'émergence de la structure. Écrire les tests d'abord est l'**outil**, pas la finalité.
- **BDD** : c'est une **pratique de spécification collaborative** entre Dev, QA et Business. Gherkin est un **format possible**, pas la définition.

Ce module **dépasse les raccourcis** et fournit la définition rigoureuse.

### 1.2 — L'analogie de la construction

Penser à la construction d'une maison :

- **TDD** = on construit **brique par brique**, chaque brique testée avant la suivante. À la fin, la maison **tient**, ses murs ne sont pas droits par hasard mais parce qu'on a vérifié à chaque étape. C'est une discipline de **constructeur**.
- **BDD** = on commence par discuter avec le **client** : "à quoi ressemble votre maison idéale ? Combien de chambres ? Style ?" Ces conversations produisent une **spécification** (potentiellement formelle, comme un croquis ou un cahier des charges). C'est une discipline de **dialogue avant tout**.

On peut faire les deux dans le même projet — la spec BDD donne l'orientation, le TDD guide la réalisation brique par brique.

### 1.3 — Anti-patterns récurrents

| Anti-pattern                                                        | Conséquence                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Écrire les tests **après** le code et appeler ça TDD.               | On rate le bénéfice design ; les tests deviennent des "valideurs" et confirment l'existant.           |
| Cucumber + Gherkin **sans** parler avec le Business.                | "BDD façade" : on écrit en français-anglais des tests, mais personne d'autre que les devs ne les lit. |
| TDD à 100 % sur du code legacy non testable.                        | Souvent infaisable. Préférer Golden Master Testing (M9) pour casser le grain.                         |
| Mêler tests unitaires et scénarios BDD dans la même suite sans tag. | Test runner lent, runs CI confus.                                                                     |
| Tester la couche infra (DB, HTTP) en Gherkin.                       | Scénarios fragiles et lents. Gherkin pour le comportement métier, pas l'infra.                        |

---

## 2. TDD — Test-Driven Development

### 2.1 — Définition rigoureuse

> **TDD** est une discipline de développement qui suit le cycle **Red / Green / Refactor** : (1) écrire un **test qui échoue**, (2) écrire **le code minimal** pour qu'il passe, (3) **refactorer** sans casser les tests existants.

C'est une **pratique de conception** autant qu'une pratique de test. Les tests **forcent** à :

- Penser **interface avant implémentation**.
- Écrire du code **testable**, donc faiblement couplé.
- Garder une **suite de régression complète** qui croît avec le code.

### 2.2 — Le cycle Red / Green / Refactor

```text
   ┌─────────────────┐
   │ RED             │  Écrire un test qui décrit le prochain
   │ (test failing)  │  comportement souhaité. Il doit échouer.
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ GREEN           │  Écrire la solution la PLUS SIMPLE qui
   │ (test passing)  │  fait passer le test. Pas plus.
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ REFACTOR        │  Améliorer le code sans changer son
   │ (no new tests)  │  comportement observable. Tests verts.
   └────────┬────────┘
            │
            ▼
       (next cycle)
```

Quatre **règles d'or** souvent oubliées :

1. Le test **doit échouer** avant qu'on écrive le code — c'est la **garantie** que le test fonctionne (un test qui passe d'office ne teste rien).
2. **Pas plus de code** que nécessaire pour passer le Green. Si on s'avance, le test ne valide pas la suite.
3. Refactor uniquement avec **tous les tests verts**. Refactor sur un test rouge = on ne sait plus quel changement casse quoi.
4. **Petits pas** — un cycle complet prend 2-10 minutes idéalement.

### 2.3 — Exemple — fonction `fizzbuzz`

**Itération 1 — Red**

```python
def test_fizzbuzz_returns_1_for_1():
    assert fizzbuzz(1) == "1"
```

Code : `def fizzbuzz(n): pass` → test échoue.

**Itération 1 — Green**

```python
def fizzbuzz(n):
    return "1"
```

Test passe. Solution **stupide mais minimale** — c'est attendu.

**Itération 2 — Red**

```python
def test_fizzbuzz_returns_2_for_2():
    assert fizzbuzz(2) == "2"
```

Avec la solution actuelle, ce test échoue.

**Itération 2 — Green**

```python
def fizzbuzz(n):
    return str(n)
```

Désormais les deux tests passent. La "généralisation" arrive **forcée** par un test, pas par anticipation.

**Itération 3 — Red**

```python
def test_fizzbuzz_returns_fizz_for_3():
    assert fizzbuzz(3) == "Fizz"
```

**Itération 3 — Green**

```python
def fizzbuzz(n):
    if n == 3:
        return "Fizz"
    return str(n)
```

…et ainsi de suite. Chaque test apporte **une contrainte nouvelle**.

**Refactor (après une dizaine d'itérations)**

```python
def fizzbuzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)
```

À ce stade, on a une **suite de 10-15 tests** + une implémentation propre.

### 2.4 — Les deux écoles — rappel M2

| École                | Aussi appelée | Style                                                                                  | Tests                                     |
| -------------------- | ------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Detroit (Beck)**   | Classicist    | Tester l'unité **avec ses vraies dépendances** (objets concrets ou Fakes en mémoire).  | State verification. Peu de mocks.         |
| **London (Freeman)** | Mockist       | Tester l'unité **isolément** ; toutes les collaborations remplacées par des **mocks**. | Behavior verification. Beaucoup de mocks. |

Aucune n'est **la** bonne — chacune a sa zone d'efficacité (cf. M2 section 5).

### 2.5 — Bénéfices et limites du TDD

| Bénéfice                                             | Limite / coût                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Suite de tests **systématique** qui couvre le code.  | **Plus long** au démarrage (factor 1,5-2x sur du code neuf).                      |
| Conception émergente, **couplage faible** induit.    | **Difficile sur du code legacy non testable** (cf. M9 Golden Master).             |
| Confiance pour refactorer.                           | Demande **discipline** ; sans, on retombe vite dans "tests après".                |
| Documente l'intention du code par les noms de tests. | Tests "stupides" (tester n=1 puis n=2) sont longs sans heuristique.               |
| Bug finding en aval (les bugs sortent au test).      | Pas un remède contre les bugs d'**intégration** (à compléter par d'autres tests). |

### 2.6 — Quand TDD est le bon choix

- **Logique métier non triviale** : pricing, règles d'affaires, parseurs, validateurs.
- **Refactor de zone risquée** : TDD comme garde-fou.
- **Code neuf** dont on découvre l'interface en l'écrivant.
- **Algorithmes** : un test = une propriété à vérifier.

### 2.7 — Quand TDD est inadapté

- **Prototypes jetables** : 1-2 jours à explorer une idée — TDD ralentit pour rien.
- **UI exploratoire** : difficile de TDD un design émergent en CSS / front.
- **Code déjà testable mais legacy** : commencer par Golden Master (M9) plutôt que des tests unitaires reverse-engineering.

---

## 3. BDD — Behavior-Driven Development

### 3.1 — Définition rigoureuse

> **BDD** est une pratique de **spécification collaborative** : Dev, QA et Business (les "trois amigos") **co-rédigent** des scénarios qui décrivent le comportement attendu d'une feature en **langage ubiquitaire** (compréhensible par tous), puis les implémentent comme des **tests exécutables**.

Trois piliers :

1. **Collaboration** : les scénarios sont **co-écrits**, pas seulement écrits par les devs.
2. **Langage ubiquitaire** : un vocabulaire commun à Dev / QA / Business. Pas de jargon technique.
3. **Spécifications exécutables** : les scénarios deviennent des **tests automatisés**.

### 3.2 — Le format Gherkin — l'expression la plus connue

Gherkin est un **DSL** (langage dédié) pour rédiger ces scénarios :

```gherkin
Feature: Application de remise sur panier
  En tant qu'utilisateur premium
  Je veux une remise automatique
  Pour faire mes achats à prix réduit

  Scenario: Premium user gets 20% off
    Given a premium user named "Alice"
    And  a cart with 1 book at 100 €
    When she checks out
    Then the total should be 80 €

  Scenario: Standard user pays full price
    Given a standard user named "Bob"
    And  a cart with 1 book at 100 €
    When he checks out
    Then the total should be 100 €
```

Le **fichier `.feature`** est lisible par n'importe quel humain. Il est ensuite **branché** à du code via des **step definitions** dans le langage de l'équipe (Python, Java, JS, etc.).

### 3.3 — Step definitions — la glue code

En `pytest-bdd` :

```python
from pytest_bdd import scenarios, given, when, then

scenarios("../features/cart_discount.feature")

@given('a premium user named "Alice"')
def alice():
    return User(name="Alice", premium=True)

@given("a cart with 1 book at 100 €")
def cart_with_book(alice):
    cart = Cart(owner=alice)
    cart.add(Item("book", 100))
    return cart

@when("she checks out")
def checkout(cart_with_book):
    return cart_with_book.total()

@then("the total should be 80 €")
def total_is_80(checkout):
    assert checkout == 80
```

Le scénario Gherkin se **traduit** en appels Python via les décorateurs `@given`, `@when`, `@then`. Quand on lance `pytest`, le runner exécute le scénario en jouant chaque étape.

### 3.4 — Les trois amigos

Pratique d'atelier centrale au BDD :

| Rôle              | Apport                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| **Dev**           | "Voici ce qu'on peut implémenter techniquement et comment."                       |
| **QA**            | "Voici les cas limites, les comportements inattendus, les questions à clarifier." |
| **Business / PO** | "Voici la valeur attendue, les règles métier, les exceptions vues côté terrain."  |

Les trois co-écrivent les scénarios **avant** que le code soit écrit. Le résultat sert de **spécification vivante** : la doc et les tests sont la même chose.

### 3.5 — Niveau d'abstraction

> Un test TDD vit au niveau d'une **unité** (classe, fonction). Un scénario BDD vit au niveau d'un **comportement métier** (souvent une feature complète, traversant plusieurs unités).

Conséquence pratique : un scénario BDD est typiquement **plus long et plus lent** à exécuter qu'un test unitaire. Il manipule des objets de plus haut niveau (User, Cart, Order).

### 3.6 — BDD au-delà de Gherkin

Beaucoup d'équipes pratiquent BDD **sans écrire de Gherkin** :

- Écrire des tests en `pytest` / `vitest` avec des **noms phrasés en intention métier** : `test_premium_user_gets_20_percent_off_at_checkout`.
- Discuter les comportements **avant** de coder, même sans `.feature` files.
- Structurer les tests par **Feature / Scenario** dans le nom de fichier.

Si l'équipe **n'a pas de Business** dans la boucle, écrire du Gherkin que personne d'autre que les devs ne lira a peu d'intérêt. Le coût (DSL + step definitions à maintenir) dépasse le bénéfice.

### 3.7 — Bénéfices et limites de BDD

| Bénéfice                                                | Limite / coût                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Alignement Dev/QA/Business** assuré par construction. | Demande une vraie **culture collaborative**. Sans, devient un théâtre. |
| Spécifications vivantes (toujours à jour).              | **Maintenance** des step definitions et des fixtures.                  |
| **Lisibilité** des scénarios par non-devs.              | **Lenteur** d'exécution (souvent passe par l'UI ou l'API).             |
| Détecte les ambiguïtés métier **avant** le code.        | Effort de **rédaction** du langage ubiquitaire — pas trivial.          |

### 3.8 — Quand BDD est le bon choix

- **Feature métier** importante avec ambiguïté ou règles complexes.
- **Triangulation** Dev / QA / Business possible et souhaitée.
- **Documentation vivante** valorisée (régulé, audit, contrats clients).

### 3.9 — Quand BDD est inadapté

- Petite équipe **dev-only** sans interlocuteur business — surcoût pour rien.
- **Détails techniques** (algorithme, parseur) — TDD pur plus efficace.
- **MVP / prototype** en exploration.

---

## 4. TDD vs BDD — la distinction (item N3 explicite)

### 4.1 — Tableau frontal

| Aspect                              | **TDD**                                                       | **BDD**                                                                                             |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Origine**                         | Kent Beck (Extreme Programming, 1999).                        | Dan North (2003), à partir de TDD.                                                                  |
| **Niveau**                          | Unitaire / classe / fonction.                                 | Feature / comportement métier complet.                                                              |
| **Audience principale**             | Dev seul ou en pair.                                          | Dev + QA + Business (les "trois amigos").                                                           |
| **Langage**                         | Code de prod (Python, Java, JS).                              | Langage métier (souvent Gherkin, mais pas obligatoire).                                             |
| **Cycle**                           | Red / Green / Refactor (minutes).                             | Discovery → Formulation → Automation (jours/semaines pour la discovery, minutes pour l'automation). |
| **Outils typiques**                 | pytest, JUnit, vitest, Mockito.                               | Cucumber, pytest-bdd, SpecFlow, Behave, Gauge.                                                      |
| **Fragment**                        | "Quand on appelle `apply_discount`, le total baisse de 20 %." | "En tant qu'utilisateur premium, je veux une remise auto pour faire des achats à prix réduit."      |
| **Granularité**                     | Tests fins, nombreux.                                         | Scénarios plus gros, moins nombreux.                                                                |
| **Vitesse d'exécution**             | ms par test.                                                  | secondes par scénario (souvent intégration).                                                        |
| **Rôle dans la pyramide des tests** | Base de la pyramide (gros volume).                            | Sommet de la pyramide (couverture haute).                                                           |

### 4.2 — Comment ils se complètent

> Dans un projet sain, **les deux coexistent** : BDD pour spécifier le comportement, TDD pour implémenter chaque brique.

Workflow type :

1. Atelier "three amigos" → scénario BDD `Premium user gets 20% off`.
2. Le scénario est noté en Gherkin et **placé dans la suite de tests** (échouera tant que la feature n'est pas implémentée).
3. Le dev **descend** dans le détail : quelles classes, quelles méthodes ? Il fait du **TDD unitaire** sur chaque brique (`Cart`, `Discount`, `Coupon`).
4. À la fin, **le scénario BDD passe au vert** automatiquement — c'est l'acceptance critère.

C'est la **double boucle** TDD/BDD :

```text
                 ┌─────────────────────────┐
                 │ BDD scenario fails      │  ← outer loop (feature-level)
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ TDD : Red / Green / Ref │  ← inner loop (unit-level)
                 │     × N cycles           │     répété pour chaque brique
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ BDD scenario passes ✅   │
                 └─────────────────────────┘
```

### 4.3 — Tableau "ne pas confondre"

| Affirmation courante                          | Vraie ?   | Précision                                                                     |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| TDD = écrire les tests d'abord.               | Partielle | C'est le moyen. La finalité = design émergent + suite de régression.          |
| BDD = Cucumber.                               | Faux      | Cucumber est **un outil parmi d'autres** ; BDD est une pratique de discovery. |
| BDD est "TDD pour QA".                        | Trompeur  | BDD est une discipline collaborative ; TDD reste l'outil d'implémentation.    |
| Si on fait du BDD, on n'a plus besoin de TDD. | Faux      | Ils opèrent à des niveaux différents.                                         |
| On peut faire du BDD sans Gherkin.            | Vrai      | Le format est secondaire. Le triangle Dev/QA/Business est central.            |

---

## 5. Lire un test TDD — ce qu'on y cherche

À l'œil, **5 marqueurs** typiques d'un test TDD bien fait :

| Marqueur                                                     | Exemple                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Nom du test exprime l'**intention**, pas la mécanique.       | `test_premium_user_gets_20_percent_off` ✅ vs `test_apply_discount` ❌ |
| Une **seule assertion** principale.                          | Pas 7 asserts dans un test.                                            |
| **Given / When / Then** visible (commentaires ou structure). | `# Given`, `# When`, `# Then`.                                         |
| **Pas de setup massif** (fixtures factorisent).              | 1-3 lignes pour préparer.                                              |
| **Isolation** : pas de dépendance d'ordre.                   | Tourne en parallèle sans casser.                                       |

Exemple type :

```python
def test_premium_user_gets_20_percent_off(premium_user, cart_with_book):
    # When
    total = checkout(premium_user, cart_with_book)
    # Then
    assert total == 80
```

3 lignes, intention claire, fixture pour le setup.

### 5.1 — Anti-patterns de lecture TDD

- Test qui appelle `print()` (laissé après debug).
- Test commenté (`# @pytest.skip`) sans raison.
- Test dont la fonction commence par `_` (privée, oubliée du runner).
- Test qui dépend d'un fichier `/tmp/...` codé en dur.

---

## 6. Lire un test BDD — ce qu'on y cherche

Un scénario BDD bien écrit suit cinq règles :

| Règle                                                | Exemple                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **Feature** décrit le besoin métier, pas la techno.  | `Feature: Apply discount` ✅ vs `Feature: HTTP /discount endpoint` ❌  |
| **Scenario** est concret (un cas réel).              | "Premium user gets 20% off" — pas "Discount applies".                  |
| **Given** : contexte préexistant (état initial).     | "Given a premium user named Alice".                                    |
| **When** : action déclenchante (1 seule).            | "When she checks out".                                                 |
| **Then** : résultat observable du point de vue user. | "Then the total should be 80 €" (pas "Then the DB should contain..."). |

### 6.1 — Marqueurs avancés Gherkin

- **`Background`** : steps partagés par tous les scénarios d'un fichier (équivalent fixture).
- **`Scenario Outline`** + **`Examples`** : scénarios paramétrés.
- **`@tag`** : pour grouper / sélectionner des scénarios (`@wip`, `@smoke`, `@regression`).

```gherkin
Scenario Outline: Discount based on user status
  Given a <status> user
  When they check out a 100 € cart
  Then the total should be <total> €

  Examples:
    | status     | total |
    | premium    | 80    |
    | regular    | 100   |
    | VIP        | 70    |
```

Un seul scénario, 3 exécutions.

### 6.2 — Anti-patterns BDD

- Scénarios qui décrivent **les clics UI** ("And the user clicks the green button") — trop fragile.
- Scénarios qui appellent **directement la DB** ("And there is a row in users table") — détail d'implémentation.
- Scénarios **trop génériques** ("Then the response should be ok") — n'engagent rien.
- Step definitions **dupliquées** entre 3 fichiers — extraire en helpers.
- Une `Feature` par fichier avec 50 scénarios — découper par sous-feature.

---

## 7. Frameworks — panorama rapide

### 7.1 — TDD

| Langage     | Framework        | Spécificités                                                |
| ----------- | ---------------- | ----------------------------------------------------------- |
| **Python**  | `pytest`         | Standard. Fixtures puissantes. `pytest-cov`, `pytest-mock`. |
| **Python**  | `unittest`       | Std lib. Plus verbeux que pytest.                           |
| **Java**    | JUnit 5          | Standard. Mockito pour les mocks.                           |
| **JS / TS** | `vitest`, `jest` | Vitest plus rapide. Jest historique.                        |
| **Go**      | `testing` (std)  | Convention simple, pas de framework externe.                |
| **C#**      | xUnit, NUnit     | xUnit le plus moderne. Moq pour les mocks.                  |
| **Ruby**    | RSpec, Minitest  | RSpec orienté BDD-friendly.                                 |

### 7.2 — BDD

| Outil          | Langage cible         | Spécificités                                      |
| -------------- | --------------------- | ------------------------------------------------- |
| **Cucumber**   | JS / Ruby / Java / Go | Le pionnier. Multi-langage via DSL Gherkin.       |
| **pytest-bdd** | Python                | S'intègre dans pytest. Garde l'écosystème pytest. |
| **Behave**     | Python                | Standalone. Plus proche du Cucumber original.     |
| **SpecFlow**   | .NET                  | Cucumber pour C#.                                 |
| **Gauge**      | Multi-langage         | Markdown au lieu de Gherkin (plus rich).          |
| **RSpec**      | Ruby                  | BDD-style sans Gherkin (DSL Ruby idiomatique).    |
| **Jasmine**    | JS                    | `describe` / `it` BDD-style.                      |

### 7.3 — Choisir

| Situation                                                | Recommandation                                      |
| -------------------------------------------------------- | --------------------------------------------------- |
| Projet Python, pas de besoin Gherkin formel.             | **pytest** seul, noms de tests en intention.        |
| Projet Python + Business qui lit les scénarios.          | **pytest + pytest-bdd**.                            |
| Projet Java enterprise avec QA dédiée.                   | JUnit + **Cucumber-JVM**.                           |
| Projet JS / TS petite équipe.                            | **vitest** seul. Si Gherkin : `@cucumber/cucumber`. |
| Projet à exigence régulatoire (audit, finance, médical). | **Cucumber** pour traçabilité spec ↔ tests.         |

---

## 8. Implémenter la même feature en TDD puis en BDD

La pratique demandée par le glossaire. Suivons un exemple complet.

### 8.1 — Feature à implémenter

> Un utilisateur **premium** bénéficie d'une remise de **20 %** sur son panier au moment du checkout. Les utilisateurs **standards** payent le prix plein. Un panier vide doit échouer.

### 8.2 — Approche TDD pur

**Cycle 1 — RED**

```python
def test_standard_user_pays_full_price():
    user = User(name="Bob", premium=False)
    cart = Cart(items=[Item("book", 100)])
    assert checkout(user, cart) == 100
```

Pas de `checkout` ni de `User` ni de `Cart` → on les crée minimaux.

**Cycle 1 — GREEN**

```python
class User:
    def __init__(self, name, premium=False):
        self.premium = premium

class Item:
    def __init__(self, name, price):
        self.price = price

class Cart:
    def __init__(self, items):
        self.items = items

def checkout(user, cart):
    return sum(i.price for i in cart.items)
```

Test passe.

**Cycle 2 — RED**

```python
def test_premium_user_gets_20_percent_off():
    user = User(name="Alice", premium=True)
    cart = Cart(items=[Item("book", 100)])
    assert checkout(user, cart) == 80
```

Échec actuel : retourne 100.

**Cycle 2 — GREEN**

```python
def checkout(user, cart):
    total = sum(i.price for i in cart.items)
    if user.premium:
        total *= 0.8
    return total
```

Les deux tests passent.

**Cycle 3 — RED**

```python
def test_empty_cart_raises():
    user = User(name="Alice", premium=True)
    cart = Cart(items=[])
    with pytest.raises(ValueError, match="empty cart"):
        checkout(user, cart)
```

**Cycle 3 — GREEN**

```python
def checkout(user, cart):
    if not cart.items:
        raise ValueError("empty cart")
    total = sum(i.price for i in cart.items)
    if user.premium:
        total *= 0.8
    return total
```

**Refactor** — extraire le taux de remise en constante, isoler le calcul :

```python
PREMIUM_DISCOUNT_RATE = 0.20

def _subtotal(cart):
    return sum(i.price for i in cart.items)

def _discount(user, subtotal):
    return subtotal * PREMIUM_DISCOUNT_RATE if user.premium else 0

def checkout(user, cart):
    if not cart.items:
        raise ValueError("empty cart")
    sub = _subtotal(cart)
    return sub - _discount(user, sub)
```

Tous les tests restent verts.

Résultat : **3 tests** unitaires + une implémentation modulaire.

### 8.3 — Approche BDD avec Gherkin (pytest-bdd)

`features/checkout.feature` :

```gherkin
Feature: Checkout with discount

  Background:
    Given a cart with 1 book at 100 €

  Scenario: Premium user gets 20% off
    Given a premium user named "Alice"
    When she checks out
    Then the total should be 80 €

  Scenario: Standard user pays full price
    Given a standard user named "Bob"
    When he checks out
    Then the total should be 100 €

  Scenario: Empty cart fails at checkout
    Given an empty cart
    And  a premium user named "Alice"
    When she checks out
    Then checkout should fail with "empty cart"
```

`tests/test_checkout.py` :

```python
from pytest_bdd import scenarios, given, when, then, parsers
import pytest

scenarios("../features/checkout.feature")

# State partagé entre steps (via fixtures pytest)
@pytest.fixture
def state():
    return {}

@given("a cart with 1 book at 100 €", target_fixture="cart")
def cart_with_book():
    return Cart(items=[Item("book", 100)])

@given("an empty cart", target_fixture="cart")
def empty_cart():
    return Cart(items=[])

@given(parsers.parse('a {kind} user named "{name}"'), target_fixture="user")
def user(kind, name):
    return User(name=name, premium=(kind == "premium"))

@when("she checks out")
@when("he checks out")
def perform_checkout(user, cart, state):
    try:
        state["total"] = checkout(user, cart)
    except Exception as e:
        state["error"] = e

@then(parsers.parse("the total should be {amount:d} €"))
def total_equals(state, amount):
    assert state["total"] == amount

@then(parsers.parse('checkout should fail with "{msg}"'))
def fail_with(state, msg):
    assert "error" in state
    assert msg in str(state["error"])
```

Lancé avec `pytest tests/test_checkout.py`, on voit **3 scénarios** s'exécuter, chacun lisible par un non-dev.

### 8.4 — Comparaison

| Aspect                 | TDD pur               | BDD Gherkin                                              |
| ---------------------- | --------------------- | -------------------------------------------------------- |
| Volume de tests        | 3 tests Python.       | 3 scénarios + step definitions.                          |
| Audience               | Devs.                 | Devs + Business + QA.                                    |
| Vitesse d'exécution    | ~10 ms.               | ~30-100 ms.                                              |
| Maintenance            | Tests Python normaux. | Step definitions + Gherkin → 2 artefacts à synchroniser. |
| Lisibilité pour un PO  | Modérée.              | **Très bonne**.                                          |
| Cohérence avec le code | Très directe.         | Indirecte (DSL → step → code).                           |

Conclusion : **selon le contexte**, l'un ou l'autre. Le module M5 (Pertinence) approfondit le critère "quand quoi".

---

## 9. Anti-patterns transverses

| Anti-pattern                                                            | Conséquence                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Faire du TDD "à blanc" : tests écrits **après** le code, en simulation. | On rate le bénéfice design ; les tests valident l'existant et n'aident plus à corriger. |
| Faire du BDD sans **trois amigos** réels.                               | Les `.feature` deviennent du jargon dev déguisé.                                        |
| Écrire en Gherkin **les tests unitaires**.                              | Surcoût pour rien — Gherkin pour le comportement métier, pas l'unitaire.                |
| Pas de **tag** sur les scénarios.                                       | Impossible de lancer juste les smoke tests ou les WIP.                                  |
| Step definitions **non factorisées**.                                   | Duplication massive entre features. Refactorer en helpers.                              |
| TDD avec **uniquement** des tests "happy path".                         | Mauvaise couverture des edge cases ; revoir M1 section 4.                               |
| Mock-style TDD systématique sans réfléchir.                             | Tests fragiles. Mixer classicist / mockist selon contexte (cf. M2).                     |

---

## 10. Choisir TDD, BDD, ou les deux — méthode

### 10.1 — Arbre de décision

```text
   Le projet a-t-il un interlocuteur Business / QA actif ?
   ├─ Non → **TDD seul** (avec noms d'intention).
   └─ Oui
       │
       La feature traitée a-t-elle des règles métier ambiguës ou nombreuses ?
       ├─ Non → **TDD avec noms d'intention BDD-style** (sans Gherkin).
       └─ Oui
           │
           L'effort de mise en place Cucumber/pytest-bdd est-il justifié par la longévité ?
           ├─ Non (prototype, mvp court) → **TDD avec collaborations orales**.
           └─ Oui → **BDD complet** (Gherkin + step + atelier three amigos).
```

### 10.2 — Pattern de cohabitation recommandé

Pour un projet sérieux :

- **80 % des tests** : TDD unitaire (`pytest`, fast, isolated).
- **15 % des tests** : tests d'intégration (DB réelle, API entre 2 services).
- **5 % des tests** : scénarios BDD haut niveau (Gherkin + Cucumber) sur les **features critiques** (paiement, signup, parcours user).

C'est la **pyramide des tests** classique. BDD se loge **au sommet**, pas à la base.

---

## 11. Exercices pratiques

### Exercice 1 — Cycle TDD complet sur fizzbuzz (≈ 45 min)

**Objectif.** Pratiquer le Red / Green / Refactor.

**Étapes :**

1. Démarrer un fichier `test_fizzbuzz.py` vide.
2. Écrire le premier test (Red), implémenter le minimum (Green).
3. Continuer **10 cycles** au minimum, en notant à chaque cycle :
   - Le code du test.
   - Le code de la fonction après green.
4. À la fin, refactorer pour obtenir une version propre.

**Livrable.** Historique des 10 cycles + fonction finale.

### Exercice 2 — Lire et critiquer 5 tests (≈ 30 min)

**Objectif.** Œil critique sur les deux styles.

Trouver dans un repo public ou son projet :

- 3 tests **TDD-style** (unitaires).
- 2 scénarios **BDD-style** (`.feature` Gherkin).

Pour chacun, noter :

- Marqueurs présents (intention, given/when/then, isolation).
- Anti-patterns repérés.
- Une amélioration proposée.

**Livrable.** 5 fiches courtes.

### Exercice 3 — Implémenter la même feature TDD + BDD (≈ 90 min)

**Objectif.** La pratique du glossaire.

Choisir une mini-feature simple (par exemple : "calcul du prix d'une nuit d'hôtel avec tarif weekend +30 %").

1. Implémenter en **TDD pur** (3-5 tests `pytest`, cycles Red/Green/Refactor).
2. Implémenter **la même feature** en **BDD** : créer le `.feature` Gherkin, les step definitions `pytest-bdd`, et brancher au code.
3. Comparer : volume, lisibilité, temps de mise en place.

**Livrable.** Code TDD + .feature + step.py + 10 lignes de comparaison.

### Exercice 4 — Convertir un scénario Gherkin en `Scenario Outline` (≈ 30 min)

**Objectif.** Maîtriser les scénarios paramétrés.

Partir de 4 scénarios répétitifs (par exemple "Premium gets 20%", "Regular gets 0%", "VIP gets 30%", "Test gets 100%") et les fusionner en un seul `Scenario Outline` + `Examples`.

**Livrable.** Avant / après + step definitions adaptées.

### Exercice 5 — Animer une session three amigos (≈ 60 min, mise en situation)

**Objectif.** Comprendre la pratique BDD au-delà de l'outil.

À deux ou trois (en pair / mob) :

- Choisir une feature à implémenter (réelle ou fictive).
- Jouer les **3 rôles** Dev / QA / Business — chacun pose ses questions et apports.
- Co-rédiger les scénarios Gherkin **à la main**.
- Identifier les ambiguïtés que la conversation a révélées.

**Livrable.** Scénarios + liste des questions/découvertes.

### Mini-défi — Pyramide de tests d'un projet (≈ 45 min, conceptuel)

**Cas.** Sur un projet existant (perso ou pro), proposer la pyramide de tests cible :

1. Combien de tests unitaires (TDD) ?
2. Combien de tests d'intégration ?
3. Combien de scénarios BDD haut niveau ?

Justifier les ratios. Identifier les zones **manquantes** dans l'état actuel.

**Livrable.** Schéma + 10 lignes de justification.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **TDD** : cycle Red/Green/Refactor, raison d'être (design + suite de tests).
- [ ] Citer les **règles d'or** du cycle TDD (test rouge avant tout, code minimal, refactor sur vert, petits pas).
- [ ] Distinguer les écoles **Detroit (classicist)** et **London (mockist)**.
- [ ] Définir **BDD** : trois amigos, langage ubiquitaire, spécifications exécutables.
- [ ] Décrire la **structure Gherkin** : Feature, Scenario, Given, When, Then, Background, Scenario Outline.
- [ ] **Distinguer TDD et BDD** : niveau, audience, granularité, vitesse.
- [ ] Décrire la **double boucle** TDD/BDD (BDD outer, TDD inner).
- [ ] Lire un test TDD bien écrit et nommer **5 marqueurs** de qualité.
- [ ] Lire un scénario BDD et nommer **5 marqueurs** de qualité.
- [ ] Citer **3 frameworks TDD** et **3 frameworks BDD**.
- [ ] Décider si une feature relève plutôt de TDD pur ou de BDD.
- [ ] Citer **3 anti-patterns** TDD et **3 anti-patterns** BDD.

### Items du glossaire visés

**N3 atteint** :

- _différence entre TDD et BDD_ — sections 2, 3, 4.

**Préparation N3** :

- _mettre en place du TDD_ — sections 2, 8.2 (approfondi en M7).

---

## 13. Ressources complémentaires

### Articles fondateurs

- [Dan North — Introducing BDD](https://dannorth.net/introducing-bdd/) — l'article fondateur.
- [Liz Keogh — BDD: a simple definition](https://lizkeogh.com/2011/06/27/atdd-vs-bdd-and-a-potted-history-of-some-related-stuff/) — clarification.
- [Martin Fowler — Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) — où placer TDD et BDD.
- [Kent Beck — Canon TDD](https://tidyfirst.substack.com/p/canon-tdd) — refresh récent du cycle TDD.

### Livres

- _Test-Driven Development by Example_ (Beck) — la référence TDD originale.
- _Growing Object-Oriented Software, Guided by Tests_ (Freeman & Pryce) — TDD mockist appliqué.
- _Specification by Example_ (Gojko Adzic) — BDD étendu à la spécification.
- _The Cucumber Book_ — référence pratique Cucumber.

### Outils

- Python : [`pytest`](https://pytest.org/), [`pytest-bdd`](https://pytest-bdd.readthedocs.io/), [`behave`](https://behave.readthedocs.io/).
- JS/TS : [`vitest`](https://vitest.dev/), [`@cucumber/cucumber`](https://cucumber.io/docs/installation/javascript/).
- Java : JUnit 5, [Cucumber-JVM](https://cucumber.io/docs/installation/java/).
- .NET : [SpecFlow](https://specflow.org/).
- Markdown spec : [Gauge](https://gauge.org/).

### Pour aller plus loin

- **M5 (Pertinence)** — décider quand TDD apporte vraiment.
- **M7 (TDD en pratique)** — atelier complet d'une feature de A à Z.
- **M9 (Golden Master)** — TDD adaptée au legacy sans tests existants.
