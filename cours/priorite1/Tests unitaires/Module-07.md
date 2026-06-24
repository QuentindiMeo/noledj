# M7 — TDD en pratique

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Conduire un **cycle TDD canonique** Red / Green / Refactor sur une feature complète, sans tricher (test rouge d'abord, code minimal pour vert, refactor sur vert seulement).
- Connaître les **trois lois de Robert Martin** sur le TDD et la version étendue **Canon TDD** de Kent Beck (2024).
- Distinguer et appliquer **trois stratégies pour passer du Red au Green** : **Obvious Implementation**, **Fake It (Till You Make It)**, **Triangulation**.
- Tenir une **hygiène git** alignée avec le cycle : commits Red / Green / Refactor distincts, message qui exprime l'intention.
- Reconnaître les **anti-patterns du cycle** (tests écrits a posteriori, refactor sur tests rouges, méga-cycles, refactor "ressenti" non scopé).
- **Implémenter une feature de A à Z en TDD** (item N3 explicite — la pratique) : pricing + remises sur un panier, en suivant 10+ cycles complets et documentés.

## Durée estimée

1 jour à 1,5 jour (atelier inclus).

## Pré-requis

- M1 à M6.
- `pytest` (ou framework équivalent) configuré.
- `git` pour suivre les commits.
- Un projet bac à sable où on peut écrire from scratch (pas de legacy à respecter).

---

## 1. Pourquoi un module pratique sur TDD

### 1.1 — Ce que le module n'est pas

> Ce n'est **pas** une introduction à TDD — celle-ci est dans **M3** (TDD vs BDD). Ce module est **un atelier d'application**.

L'objectif n'est pas d'expliquer "Red / Green / Refactor" mais de **dérouler** un cas complet, en montrant :

- Les **petits choix** entre obvious / fake-it / triangulation à chaque cycle.
- Les **moments d'hésitation** (refactor maintenant ou plus tard ?).
- La **discipline git** qui rend la trace lisible.

### 1.2 — Pourquoi une "feature de A à Z"

Le glossaire N3 demande **"implémentation TDD d'une feature de A à Z"**. C'est une exigence forte :

- "De A à Z" exclut les exercices "1 fonction isolée fizzbuzz".
- Une **feature** implique plusieurs objets, des collaborations, du refactor.
- Le déroulé complet **fait apparaître** des moments délicats (ajouter un test redondant ? extraire une classe ?).

La feature retenue dans la section 5 : un **moteur de pricing de panier** avec items, quantité, remises, conditions — assez riche pour 15-20 cycles, assez petit pour tenir dans un module.

### 1.3 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                                     | Conséquence                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Écrire le code, puis "rajouter" des tests : c'est du **test-after**, pas du TDD. | On rate le bénéfice design. Les tests valident l'existant sans aider à corriger. |
| Sauter le **refactor**.                                                          | Le code accumule de la dette à chaque cycle.                                     |
| Refactor sur un test rouge.                                                      | On mélange "ajouter" et "améliorer" — perte du filet de sécurité.                |
| **Méga-cycle** : test gros, code gros, refactor gros.                            | Plus de feedback rapide. Petits pas perdus.                                      |
| Pas de commit par phase.                                                         | Trace illisible. Bisect impossible.                                              |
| Pas de **refactor du test** lui-même.                                            | Les tests s'empilent, deviennent répétitifs, fragiles.                           |

---

## 2. Le cycle — rappel et nuances

### 2.1 — Le cycle canonique

```text
   ┌─────────────────┐
   │ RED             │  Écrire un test qui décrit le prochain
   │ (failing test)  │  comportement. Il DOIT échouer.
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ GREEN           │  Écrire la solution la plus simple
   │ (passing test)  │  qui fait passer le test.
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ REFACTOR        │  Améliorer le code (et les tests)
   │ (no new tests)  │  sans changer le comportement.
   └────────┬────────┘
            │
            ▼
       (cycle suivant)
```

Trois phases, **trois disciplines** :

1. **Red** = **prescrire** ce qui doit marcher.
2. **Green** = **réussir** par n'importe quel moyen, même moche.
3. **Refactor** = **nettoyer** sans bouger le sens.

### 2.2 — Les trois lois de Robert Martin

Robert C. Martin a formulé trois lois qui **encadrent strictement** le cycle :

1. **Tu n'écriras pas de code de production sans qu'un test échoue d'abord.**
2. **Tu n'écriras pas plus de test que nécessaire pour échouer.**
3. **Tu n'écriras pas plus de code de production que nécessaire pour faire passer le test.**

Ces lois imposent un cycle **très court** : on alterne entre éditer le test et éditer le code toutes les **30 secondes à 2 minutes**.

### 2.3 — Canon TDD (Kent Beck, 2023-2024)

Kent Beck a publié récemment une **version étendue** du cycle, "Canon TDD", qui décompose plus finement la pratique :

```text
   1. Test list      — Lister les comportements à coder (sur un papier).
   2. Test           — Choisir un comportement, écrire le test (Red).
   3. Code           — Faire passer le test (Green).
   4. Refactor       — Nettoyer.
   5. Update list    — Ajouter / retirer des items selon ce qu'on a appris.
   → goto 2 jusqu'à liste vide.
```

L'ajout important : la **liste explicite** des comportements à coder. On la met à jour à chaque cycle — chaque nouveau test "découvert" pendant l'implémentation rejoint la liste pour plus tard.

C'est une excellente discipline pour **ne pas se perdre** dans des digressions.

### 2.4 — Durée des phases

| Phase             | Durée typique                         |
| ----------------- | ------------------------------------- |
| Red               | 30 s à 2 min.                         |
| Green             | 1 min à 5 min.                        |
| Refactor          | 0 (skip) à 5 min.                     |
| **Cycle complet** | **2 à 10 minutes**, idéalement 4 min. |

Au-delà de 15 min par cycle, c'est un signe que les pas sont **trop gros** ; on peut redescendre à un test plus petit.

### 2.5 — Le "test list"

Avant de commencer, écrire sur un **papier** (ou dans un fichier `TODO.md`) la **liste des comportements** à coder. Exemple pour le pricing :

```text
☐ Panier vide → total = 0
☐ Un item → total = prix
☐ Plusieurs items → total = somme
☐ Quantité > 1 sur un item
☐ Remise pourcentage sur le total
☐ Remise fixe (coupon)
☐ Remise par catégorie
☐ Premium = -20 % global
☐ Cumul de remises (règle d'ordre)
☐ Plafond de remise
```

On **coche** au fur et à mesure. On **ajoute** ce qu'on découvre. On **regroupe** des items si on s'aperçoit qu'ils sont identiques.

---

## 3. Trois stratégies pour passer du Red au Green

### 3.1 — Obvious Implementation

Quand la **solution est évidente**, on l'écrit directement.

```python
# Red
def test_addition():
    assert add(2, 3) == 5

# Green — obvious
def add(a, b):
    return a + b
```

Pas de fake, pas de triangulation. Bon pour des cas vraiment simples.

**Piège** : on se croit toujours "évident" et on saute des étapes. Si on se trompe au Green, on retombe au Red — c'est OK, mais on aurait peut-être gagné à passer par **Fake It**.

### 3.2 — Fake It (Till You Make It)

Quand on **ne sait pas** comment résoudre, on **triche** : on retourne la valeur attendue en dur, juste pour passer le test.

```python
# Red
def test_returns_5_for_2_plus_3():
    assert add(2, 3) == 5

# Green — fake it
def add(a, b):
    return 5
```

Le test passe. C'est "moche" mais l'objectif est atteint : **Red → Green**.

Au cycle suivant, on **triangle** (3.3) pour casser la solution fake et la généraliser.

**Pourquoi ça aide** : on **avance même** quand la solution n'est pas claire. Le pas du Red à Green est **toujours faisable** (même de manière triviale), ce qui maintient le **momentum**.

### 3.3 — Triangulation

On écrit un **deuxième test** qui invalide la solution fake-it.

```python
# Red 2
def test_returns_7_for_3_plus_4():
    assert add(3, 4) == 7

# Notre fake retourne 5 → échec.

# Green — généraliser
def add(a, b):
    return a + b
```

La triangulation **force la généralisation**. Avec deux exemples non-identiques, la solution "retourner une constante" devient impossible — on doit **comprendre la règle** sous-jacente.

### 3.4 — Quand utiliser quoi

| Situation                                                | Stratégie                    |
| -------------------------------------------------------- | ---------------------------- |
| Cas trivial, solution claire en 1 ligne.                 | **Obvious**.                 |
| Solution **possible mais on hésite**.                    | **Fake It**.                 |
| Solution **inconnue** mais on a 2-3 exemples.            | **Fake It + Triangulation**. |
| On veut **explorer** plusieurs cas avant de généraliser. | **Triangulation pure**.      |

La majorité des cycles "réels" mélangent : on commence Obvious, on tombe sur une difficulté, on fait Fake It, on triangule. C'est fluide.

---

## 4. Refactor — la phase qui change tout

### 4.1 — Pourquoi insister sur le refactor

Sans refactor, TDD produit du code qui passe les tests mais **accumule la dette** : duplications, noms approximatifs, classes mal placées.

> Le refactor est **où le design se cristallise**. Sauter cette étape vide TDD de la moitié de son intérêt.

### 4.2 — Ce qu'on refactore

Trois cibles à inspecter à chaque cycle vert :

1. **Le code de prod** : duplication, noms, abstractions, principes SOLID.
2. **Les tests** : duplication, nommage, fixtures.
3. **L'interface** : un test qui demande des paramètres bizarres signale qu'on doit revoir le contrat.

### 4.3 — Quand ne pas refactorer

- Si **rien n'est sale** : skip légitime.
- Si on est **à 30 minutes de la fin de session** : refactor incomplet, mieux vaut un cycle Green propre que d'ouvrir une nouvelle direction.
- Si le **prochain test va remettre en cause** la structure : attendre, refactorer plus tard quand on aura le contexte.

### 4.4 — Le "refactor" doit garder tous les tests verts

**Règle absolue** : on ne touche **pas** à un test rouge en refactorant. Si en refactorant on casse un test :

1. Revert le changement de refactor.
2. Comprendre **pourquoi** le test a cassé (changement de comportement involontaire ? test fragile ?).
3. Recommencer plus petit, ou ajouter d'abord un test qui décrit le comportement à préserver.

---

## 5. Atelier — TDD complet sur "Shopping Cart Pricing"

L'exigence de l'item N3 : une **feature de A à Z**. Voici 20 cycles documentés.

### 5.1 — Spec initiale

> On construit un moteur de pricing pour un panier. Les exigences (test list initiale) :
>
> - Panier vide → total 0.
> - Items avec quantité.
> - Remise pourcentage globale (premium = -20 %).
> - Coupon montant fixe.
> - Plafond de remise.

### 5.2 — Test list de départ

```text
[ ] empty cart → 0
[ ] one item, qty 1 → price
[ ] one item, qty N → price * N
[ ] two items → sum
[ ] premium user → -20 % global
[ ] coupon −5 € fixed
[ ] discount cap at 50 % of subtotal
```

### 5.3 — Cycle 1 : panier vide

**Red**

```python
# test_cart.py
from cart import Cart

def test_empty_cart_total_is_zero():
    cart = Cart()
    assert cart.total() == 0
```

`pytest` → `ImportError` puis `NameError`. **Red OK.**

**Green** (obvious)

```python
# cart.py
class Cart:
    def total(self):
        return 0
```

Test passe.

**Refactor** : rien.

**Git** :

```bash
git add . && git commit -m "test: empty cart returns 0 (Green)"
```

### 5.4 — Cycle 2 : un item

**Red**

```python
def test_cart_with_one_item_returns_price():
    cart = Cart()
    cart.add(price=10)
    assert cart.total() == 10
```

Échec : `Cart` n'a pas `add()`.

**Green** (fake-it)

```python
class Cart:
    def __init__(self):
        self._items = []

    def add(self, price):
        self._items.append(price)

    def total(self):
        return sum(self._items)
```

Note : on est presque "obvious" déjà. Bon.

Les **deux tests passent**.

**Refactor** : ok.

```bash
git commit -am "feat: add item to cart"
```

### 5.5 — Cycle 3 : quantité

**Red**

```python
def test_cart_with_quantity():
    cart = Cart()
    cart.add(price=10, quantity=3)
    assert cart.total() == 30
```

Échec : `add` accepte seulement `price`.

**Green**

```python
def add(self, price, quantity=1):
    self._items.append(price * quantity)
```

Les 3 tests passent.

**Refactor** : on perd la notion d'**item** (on accumule des prix calculés). C'est OK pour l'instant mais on aura à structurer plus tard.

```bash
git commit -am "feat: support quantity in add"
```

### 5.6 — Cycle 4 : plusieurs items

**Red**

```python
def test_two_items_sum():
    cart = Cart()
    cart.add(price=10, quantity=2)
    cart.add(price=5)
    assert cart.total() == 25
```

**Green** : le code actuel fonctionne déjà ! On passe le test sans rien changer.

C'est un **test de redondance** : il confirme que la solution généralise déjà. On peut **garder** (documentation) ou **supprimer** s'il est strictement redondant. Ici, gardons-le, il documente l'addition.

**Refactor** : non.

```bash
git commit -am "test: multiple items sum"
```

### 5.7 — Cycle 5 : premium user

**Red**

```python
def test_premium_user_gets_20_percent_off():
    cart = Cart(premium=True)
    cart.add(price=100)
    assert cart.total() == 80
```

Échec : `Cart()` ne prend pas `premium`.

**Green** (obvious)

```python
class Cart:
    def __init__(self, premium=False):
        self._items = []
        self._premium = premium

    def total(self):
        sub = sum(self._items)
        if self._premium:
            return sub * 0.8
        return sub
```

Tests passent. Mais on remarque : la `Cart` mélange items et règles de remise. Signal de refactor.

**Refactor** — extraire la règle :

```python
class Cart:
    def __init__(self, premium=False):
        self._items = []
        self._premium = premium

    def add(self, price, quantity=1):
        self._items.append(price * quantity)

    def _subtotal(self):
        return sum(self._items)

    def _discount(self, subtotal):
        return subtotal * 0.20 if self._premium else 0

    def total(self):
        sub = self._subtotal()
        return sub - self._discount(sub)
```

Tests toujours verts. La logique est **séparée** : subtotal vs discount.

```bash
git commit -am "refactor: separate subtotal and discount in Cart"
```

### 5.8 — Cycle 6 : coupon montant fixe

**Red**

```python
def test_coupon_fixed_amount():
    cart = Cart()
    cart.add(price=100)
    cart.apply_coupon(amount=5)
    assert cart.total() == 95
```

**Green** (obvious)

```python
def __init__(self, premium=False):
    ...
    self._coupon = 0

def apply_coupon(self, amount):
    self._coupon = amount

def total(self):
    sub = self._subtotal()
    return sub - self._discount(sub) - self._coupon
```

Tests passent.

**Refactor** : le `total` commence à empiler les soustractions. Pour maintenir la lisibilité, on regroupera plus tard.

```bash
git commit -am "feat: apply fixed-amount coupon"
```

### 5.9 — Cycle 7 : premium + coupon

**Red**

```python
def test_premium_with_coupon():
    cart = Cart(premium=True)
    cart.add(price=100)
    cart.apply_coupon(amount=5)
    # Question : la remise premium s'applique-t-elle AVANT ou APRÈS le coupon ?
    # Décision business : remise % d'abord, puis coupon.
    # Donc : 100 → 80 (premium) → 75 (coupon)
    assert cart.total() == 75
```

C'est un test qui **révèle une question business**. La décision (commenter dans le test) fait partie du design.

**Green** : le code actuel fait `sub - discount - coupon`, soit `100 - 20 - 5 = 75`. Test passe.

```bash
git commit -am "test: premium + coupon order, premium first"
```

### 5.10 — Cycle 8 : plafond de remise

**Red**

```python
def test_discount_cap_at_50_percent():
    # Un coupon ne peut pas faire descendre en dessous de 50 % du subtotal
    cart = Cart()
    cart.add(price=100)
    cart.apply_coupon(amount=80)  # 80 € de coupon sur un panier 100 €
    # Le coupon serait écrasé : on cap à 50 € = 50 % du subtotal
    assert cart.total() == 50
```

**Green** (fake-it d'abord)

```python
def total(self):
    sub = self._subtotal()
    discount = self._discount(sub)
    coupon = min(self._coupon, sub * 0.5)   # ← le cap
    return sub - discount - coupon
```

Tests passent.

**Refactor** : extraire un **plafond** est suspect mais ok pour l'instant. À surveiller si la complexité grimpe.

```bash
git commit -am "feat: cap coupon at 50% of subtotal"
```

### 5.11 — Cycle 9 : refactor design

À ce stade, `total()` mélange beaucoup de calculs. On extrait :

```python
@dataclass
class LineItem:
    price: float
    quantity: int = 1

    @property
    def amount(self):
        return self.price * self.quantity

class Cart:
    def __init__(self, premium=False):
        self._items: list[LineItem] = []
        self._premium = premium
        self._coupon = 0

    def add(self, price, quantity=1):
        self._items.append(LineItem(price, quantity))

    def apply_coupon(self, amount):
        self._coupon = amount

    def _subtotal(self):
        return sum(item.amount for item in self._items)

    def _premium_discount(self, subtotal):
        return subtotal * 0.20 if self._premium else 0

    def _effective_coupon(self, subtotal):
        return min(self._coupon, subtotal * 0.5)

    def total(self):
        sub = self._subtotal()
        return sub - self._premium_discount(sub) - self._effective_coupon(sub)
```

Tous les tests passent. La structure est plus claire.

```bash
git commit -am "refactor: introduce LineItem dataclass and extract discount methods"
```

### 5.12 — Cycle 10 : edge case — coupon négatif

**Red**

```python
def test_negative_coupon_raises():
    cart = Cart()
    cart.add(price=100)
    with pytest.raises(ValueError, match="negative"):
        cart.apply_coupon(amount=-10)
```

**Green**

```python
def apply_coupon(self, amount):
    if amount < 0:
        raise ValueError("negative coupon not allowed")
    self._coupon = amount
```

**Refactor** : rien.

```bash
git commit -am "feat: reject negative coupons"
```

### 5.13 — Cycles 11-15 : suite de la feature

À ce stade, le test list initial est presque vide. On en ajoute :

```text
[x] empty cart → 0
[x] one item → price
[x] item with quantity
[x] multiple items
[x] premium → -20 %
[x] coupon fixed amount
[x] discount cap
[x] negative coupon → error
[ ] remove item from cart
[ ] coupon on top of premium
[ ] decimal prices precision
[ ] cart serialization to JSON
```

Chaque item donne un cycle. Au bout de 15-20 cycles, on a une feature **complète** et une suite **dense** (15-25 tests).

### 5.14 — Bilan de l'atelier

Ce qu'on observe :

- Les tests ont **émergé** de la spécification, pas d'un design préalable.
- L'**interface** (`add`, `apply_coupon`, `total`) s'est révélée par usage, pas par décret.
- Le **refactor** a introduit `LineItem`, séparation `_subtotal` / `_premium_discount` / `_effective_coupon`.
- Le **commit log** raconte une histoire lisible — bisect possible, revue facile.

> Le **résultat** est aussi bon qu'un design upfront — souvent meilleur car testé en continu.

---

## 6. Hygiène git en TDD

### 6.1 — Trois patterns de commits

| Pattern              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| **Commit par cycle** | Un commit par cycle complet Red/Green/(Refactor).              |
| **Commit par phase** | Trois commits : Red (failing), Green (passing), Refactor.      |
| **Commit groupé**    | Plusieurs cycles → un commit après une "feature unit" achevée. |

Le **commit par cycle** est le **bon compromis** pour la majorité des projets :

- Trace fine, mais pas trop verbeux.
- Bisect efficace.
- Messages porteurs : "feat: add coupon support", "refactor: extract LineItem".

### 6.2 — Convention de message

```text
type(scope): description

test: phrase au présent       # cycle qui a ajouté un test (Red puis Green)
feat: phrase au présent       # nouveau comportement
refactor: phrase au présent   # refactor sans changement de comportement
fix: phrase au présent        # correction de bug (regression test added)
```

Exemples observés dans l'atelier 5.x :

```text
test: empty cart returns 0 (Green)
feat: add item to cart
feat: support quantity in add
feat: apply fixed-amount coupon
test: premium + coupon order, premium first
feat: cap coupon at 50% of subtotal
refactor: introduce LineItem dataclass and extract discount methods
feat: reject negative coupons
```

### 6.3 — Pre-commit hooks utiles

- `pytest` lancé à chaque commit (rapide grâce à `pytest -x --testmon`).
- `pre-commit` framework avec : `ruff`, `mypy`, `pytest --cov-fail-under=80`.

Empêche de commiter du code rouge ou non couvert.

### 6.4 — Pair / mob programming

TDD se prête particulièrement bien au **pair** et au **mob** :

- Le binôme **tour à tour** : un écrit le test (Red), l'autre écrit le code (Green), tour à l'autre pour le refactor.
- "Ping-pong programming" : variation où on **doit** changer de claviériste à chaque transition Red/Green.

Très productif et pédagogique.

---

## 7. Anti-patterns du cycle TDD

| Anti-pattern                                         | Symptôme                                                         | Remède                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Test-after**.                                      | On code, puis on rajoute des tests pour atteindre coverage.      | Discipline : test toujours en premier.                                           |
| **Skip refactor**.                                   | Le code s'empile, devient illisible.                             | Toujours faire le tour Refactor, même 30 secondes.                               |
| **Refactor en rouge**.                               | On change la structure pendant qu'un test est rouge.             | Si refactor nécessaire pour passer le test : revert le test, refactorer d'abord. |
| **Test trop gros**.                                  | Le cycle prend 30 min, on perd le fil.                           | Casser en plusieurs petits tests.                                                |
| **Pas de test list**.                                | On oublie des comportements en cours de route.                   | Tenir la liste à jour.                                                           |
| **Fake it éternel**.                                 | On ne triangule jamais, le code reste avec une constante en dur. | Toujours triangulariser ou généraliser explicitement.                            |
| **Obvious avec bug**.                                | On croit que la solution est évidente, on se trompe.             | Si on tombe au rouge après "obvious", c'est OK — reculer à Fake It.              |
| **Tester l'implémentation** au lieu du comportement. | Refactor cosmétique casse 10 tests.                              | Tester un contrat (M2).                                                          |
| **Pas de commit clair**.                             | Trace illisible, bisect inutile.                                 | 1 commit par cycle, message explicite.                                           |
| **TDD sur du code legacy non testable**.             | On passe 2 jours à essayer d'écrire un premier test.             | Golden Master (M9) d'abord, TDD ensuite.                                         |

---

## 8. Outillage

### 8.1 — Pytest watch mode

```bash
pip install pytest-watch
ptw
```

Relance les tests à chaque sauvegarde. Boucle Red / Green ultra-rapide.

Alternative : `pytest-testmon` qui ne relance que les tests **affectés** par les modifications.

### 8.2 — Make / scripts

Un `Makefile` ou `justfile` qui automatise :

```makefile
.PHONY: red green refactor

red:
	pytest -x  # premier échec stoppe

green:
	pytest --cov=myapp --cov-report=term-missing

refactor:
	pytest && ruff check . && mypy myapp/
```

### 8.3 — Pomodoro / timer

Beaucoup de pratiquants TDD utilisent un **timer Pomodoro** (25 min) pour rester focus, en mob particulièrement.

### 8.4 — Mocking parcimonie

Pendant un atelier TDD, **évitez les mocks** quand possible — préférez des Fakes (cf. M2). Les mocks fragilisent les refactor.

---

## 9. Exercices pratiques

### Exercice 1 — FizzBuzz canonique en 10 cycles (≈ 45 min)

**Objectif.** S'éprouver à la discipline.

**Étapes :**

1. Écrire la test list (cycles attendus : 1, 2, 3, 4, 5, 6, 15, séquence 1..15).
2. Suivre **10 cycles** complets : Red / Green / Refactor.
3. Documenter dans `LOG.md` chaque cycle (test, code green, refactor éventuel).
4. Vérifier qu'on a **un commit par cycle**.

**Livrable.** Code final + LOG + log git.

### Exercice 2 — Fake It → Triangulation (≈ 30 min)

**Objectif.** Maîtriser les stratégies.

**Étapes :**

1. Écrire un test `test_fizz_for_3 → "Fizz"`.
2. Green = **fake-it** : `return "Fizz"`.
3. Écrire `test_buzz_for_5 → "Buzz"`.
4. Triangulariser pour généraliser.
5. Noter le **moment exact** où la généralisation devient nécessaire.

**Livrable.** 2 commits avec messages distincts pour fake-it et triangulation.

### Exercice 3 — Refactor en TDD — extraction de classe (≈ 60 min)

**Objectif.** Refactor scopé, tests toujours verts.

Sur le code FizzBuzz ou Cart de l'atelier :

1. Identifier une duplication ou un mélange de responsabilités.
2. **Refactorer** : extraire une classe (ex : `FizzRule`, `BuzzRule`).
3. À chaque sous-étape, **vérifier les tests verts**.
4. Commit le refactor en un seul commit (ou plusieurs petits si nécessaire).

**Livrable.** Diff avant / après + log git.

### Exercice 4 — Atelier complet : Shopping Cart (≈ 3 h)

**Objectif.** L'item N3 explicite — feature de A à Z.

**Étapes :**

1. Reproduire l'atelier 5.x sans regarder le code (la spec uniquement).
2. Suivre la test list, ajouter les items au fur et à mesure.
3. Au moins **15 cycles** complets.
4. Commits propres (1 par cycle minimum).
5. Refactors visibles.

**Livrable.** Repo git avec historique + LOG.md commenté.

### Exercice 5 — Pair programming TDD (≈ 90 min, à deux)

**Objectif.** Discipline en duo.

Avec un partenaire :

- Choisir une feature à implémenter.
- **Ping-pong** : A écrit le test, B écrit le green, B fait le refactor, B écrit le prochain test, A le green, etc.
- Compter le nombre de cycles.

**Livrable.** Repo + 5 lignes de bilan.

### Mini-défi — TDD sous contrainte temps (≈ 45 min)

**Objectif.** Cadence.

Implémenter en TDD une fonction `palindrome(s) -> bool` qui retourne True si `s` est un palindrome (ignorant casse et espaces).

Contraintes :

- **Au moins 8 cycles**.
- **Chronométrer** : noter la durée de chaque cycle.
- **Aucun cycle > 5 min**.

**Livrable.** Code final + tableau (cycle, durée, action).

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **3 phases** du cycle TDD et leur ordre obligatoire.
- [ ] Énoncer les **3 lois de Robert Martin**.
- [ ] Décrire le **Canon TDD** (5 étapes incluant test list).
- [ ] Distinguer **Obvious**, **Fake It**, **Triangulation**.
- [ ] Décrire un cas où chaque stratégie est adaptée.
- [ ] Faire un cycle **complet en moins de 5 min** sur un exemple simple.
- [ ] Citer **3 anti-patterns** du cycle TDD.
- [ ] Tenir une **test list** au fil des cycles.
- [ ] Pratiquer une **hygiène git** alignée au cycle (1 commit/cycle).
- [ ] Refactorer sans casser les tests verts.
- [ ] Implémenter une **mini-feature complète** (15+ cycles) en TDD.

### Items du glossaire visés

**N3 atteint** :

- _capacité à mettre en place du TDD_ — l'ensemble du module.

**N3+** abordé :

- TDD top-down vs bottom-up — section 3 (Fake-it ressemble plutôt à bottom-up, triangulation au top-down). Approfondissement N4.

---

## 11. Ressources complémentaires

### Articles fondateurs

- [Kent Beck — Canon TDD](https://tidyfirst.substack.com/p/canon-tdd) — version récente du cycle (2024).
- [Robert C. Martin — The Three Laws of TDD](http://butunclebob.com/ArticleS.UncleBob.TheThreeRulesOfTdd).
- [Martin Fowler — Refactoring](https://refactoring.com/) — la référence sur le refactor.

### Livres

- _Test-Driven Development by Example_ (Kent Beck) — l'original. Court, dense, indispensable.
- _Refactoring_ (Martin Fowler) — comment refactorer en pratique.
- _Growing Object-Oriented Software, Guided by Tests_ (Freeman & Pryce) — TDD mockist, design émergent.
- _The TDD Bible_ (J.B. Rainsberger) — vidéos et articles plus avancés.

### Outils

- [pytest-watch](https://github.com/joeyespo/pytest-watch) — auto-rerun.
- [pytest-testmon](https://testmon.org/) — ne relance que les tests affectés.
- [ruff](https://docs.astral.sh/ruff/) — linter Python ultra-rapide.
- [cyber-dojo.org](https://cyber-dojo.org/) — katas TDD en ligne, multi-langage.

### Katas pour pratiquer

- FizzBuzz.
- Roman numerals.
- Bowling game.
- Tennis game scoring.
- Gilded Rose (kata de refactoring).
- Bank kata (compte, dépôt, retrait, historique).

### Pour aller plus loin

- **M8 (Factorisation)** — factoriser les tests qui s'accumulent en TDD.
- **M9 (Golden Master)** — TDD adaptée au legacy non testable.
- **M5 (Pertinence)** — décider quelles features méritent TDD strict.
