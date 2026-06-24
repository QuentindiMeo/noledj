# M2 — Stubs vs Mocks

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Restituer la **taxonomie des Test Doubles** de Meszaros : **Dummy**, **Stub**, **Fake**, **Spy**, **Mock**, et savoir nommer chacun à partir d'un cas d'usage.
- Définir précisément un **stub** (fournit des **entrées indirectes** à l'unité testée) et un **mock** (vérifie les **sorties indirectes** — les appels que l'unité fait à ses dépendances) — c'est **l'item N3 explicite** du module.
- Identifier dans un test existant **quel double est utilisé** et s'il est **bien employé** (un mock qui ne vérifie rien est en fait un stub mal nommé ; un stub qui assert sur ses appels est en réalité un mock).
- Choisir le **bon double** selon le besoin de vérification : **state verification** (stub) vs **behavior verification** (mock).
- **Refactor** un test stub vers mock (et inversement) en gardant l'intention de test intacte — la pratique demandée par le glossaire.
- Reconnaître les **anti-patterns** classiques : sur-mocking, mock chains, mock de sa propre logique, fragilité aux refactors.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (audit, vocabulaire général, mocking en survol).
- `pytest` + `unittest.mock` (ou équivalent dans le langage choisi).
- Avoir écrit au moins quelques tests avec un mock dans le passé.

---

## 1. Pourquoi un module dédié à la distinction

### 1.1 — La confusion est partout

> Les mots **mock** et **stub** sont **utilisés de manière interchangeable** dans 80 % de la documentation et des conversations d'équipe.

Trois exemples vécus :

- "Mock the database" — souvent on **stub** la DB (faire retourner des données), on ne **mock** pas (vérifier les appels SQL).
- "I added a stub for the email service" — souvent c'est un **mock** (on veut vérifier que `send()` est appelé), pas un stub.
- Une `Mock()` Python qu'on utilise comme stub (on lit ses retours sans vérifier `assert_called_*`) — la classe est mal nommée pour son usage.

La confusion n'a **pas de conséquence pédagogique** au N2. À partir du N3, elle **devient bloquante** : on ne sait plus pourquoi un test échoue après un refactor, on a des tests fragiles qui assertent des détails d'implémentation sans le savoir.

Ce module **distingue rigoureusement** stubs, mocks, et leurs cousins.

### 1.2 — L'analogie du double de cinéma

Une analogie qui colle bien : les **doublures** au cinéma.

| Test Double | Doublure cinéma                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dummy**   | Un **figurant non identifié** au fond du plan — il est là, on ne le voit pas.                                                                      |
| **Stub**    | Une **doublure lumière** : on tourne la scène sans la star, juste pour les plans génériques. Pas de dialogue, pas d'action.                        |
| **Fake**    | Un **acteur de seconde classe** qui peut **vraiment jouer** la scène à la place de la star — version simplifiée mais fonctionnelle.                |
| **Spy**     | Un **assistant caché derrière la caméra** qui **note** tout ce que la star fait, sans intervenir.                                                  |
| **Mock**    | Une **doublure cascade** **scénarisée à l'avance** : "tu devrais voir le héros sauter de cette voiture exactement, ou la scène n'est pas validée." |

Stub fournit le décor ; Mock vérifie la chorégraphie.

### 1.3 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                             | Conséquence                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Tout `Mock()` en Python sans réfléchir.                                  | Tests cassent à chaque refactor cosmétique (un appel renommé).                      |
| Mocker **ses propres classes métier** trop facilement.                   | Tests qui valident l'implémentation, pas le comportement.                           |
| Chaîne de mocks : `mock.foo.bar.baz.return_value = "x"`.                 | Signal de couplage fort. Repenser l'architecture (Demeter).                         |
| Mocker une dépendance **transitive** (la lib X de la lib Y de mon code). | Le test connaît trop de détails internes. Mocker la couche immédiatement adjacente. |
| Stub qui retourne `Mock()` au lieu d'un domain object réel.              | Tests qui passent malgré des bugs de domaine (un mock accepte tout).                |

---

## 2. Taxonomie complète — les Test Doubles (Meszaros)

La référence canonique : Gerard Meszaros, _xUnit Test Patterns_ (2007). Cinq catégories.

### 2.1 — Tableau

| Type      | Rôle                                                                                           | Vérifie quoi ?                 | Exemple                                                     |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| **Dummy** | Objet **passé mais jamais utilisé**. Sert à remplir une signature.                             | Rien — il existe, c'est tout.  | `notify(user, logger=None)` — passer `None` au test.        |
| **Stub**  | Fournit des **valeurs prédéfinies** quand on lui demande quelque chose.                        | Rien (on lit son output).      | `stub_db.find_user(...).return_value = User(...)`           |
| **Fake**  | Implémentation **simplifiée mais réelle** d'une dépendance — par exemple SQLite en mémoire.    | Rien — il joue le rôle entier. | `class FakePaymentGateway` qui stocke les paiements en RAM. |
| **Spy**   | Comme un stub, mais **enregistre** ses appels pour vérification a posteriori.                  | Les appels reçus.              | `spy.send.was_called_with("hello")` — assertion fine.       |
| **Mock**  | Pré-programmé avec **attentes d'appels** ; échoue **automatiquement** si l'attente est violée. | Les appels reçus, scénarisés.  | `email.expects("send").with(args).times(1)` — strict mode.  |

### 2.2 — Différences pratiques avec Spy

La distinction Spy / Mock est **subtile** :

- **Spy** : on **observe** après coup. `assert spy.send.was_called_with(...)`. Si on oublie l'assert, le test passe.
- **Mock** : on **prescrit** d'avance. `mock.expect(send).with(...).times(1)`. Si l'appel ne correspond pas, le test échoue **automatiquement** au teardown.

Cette différence est claire dans les libs **strictes** comme Mockito (Java) ou `verify()` en jasmine.js. En `unittest.mock` Python, il n'y a pas de "strict mode" natif — on peut faire des spies (lecture) ou des mocks (assertion explicite), mais le framework ne distingue pas.

### 2.3 — Dummy — le grand oublié

```python
class Logger:
    def info(self, msg): ...

def process(data, logger):
    if data:
        logger.info("processing")
        return data.upper()
    return None

def test_process_returns_none_when_empty():
    # Dummy : on n'utilise pas le logger dans cette branche
    dummy_logger = None  # ou Mock(), peu importe
    assert process("", dummy_logger) is None
```

Le `None` ici est un **dummy** : la branche testée n'appelle pas `logger`. C'est légitime ; pas besoin d'un mock complet.

### 2.4 — Fake — la doublure pleinement fonctionnelle

```python
class FakeUserRepo:
    def __init__(self):
        self._users = {}

    def save(self, user):
        self._users[user.id] = user

    def find(self, user_id):
        return self._users.get(user_id)

def test_create_then_read_user():
    repo = FakeUserRepo()
    user = User(id=1, name="alice")
    repo.save(user)
    assert repo.find(1) == user
```

Le `FakeUserRepo` est une **vraie** implémentation simplifiée. Avantages :

- Lisible : pas de magie `unittest.mock`.
- Stable au refactor : si on ajoute une méthode `find_by_email`, le Fake évolue, pas chaque test.
- Comportementalement plus proche du vrai (notamment pour des tests d'intégration légers).

Inconvénient : maintenance du Fake elle-même.

C'est souvent **le meilleur choix** pour des dépendances stables (Repository, Clock, Random source).

---

## 3. Stub — entrées indirectes

### 3.1 — Définition

> Un **stub** fournit des **valeurs prédéfinies** à l'unité testée quand celle-ci interroge une dépendance. Le stub **n'est pas vérifié** : ce qu'on teste, c'est l'**effet de ses valeurs** sur le code testé.

Vocabulaire : on parle d'**entrées indirectes** — l'unité testée reçoit des données via une dépendance plutôt que via ses arguments directs.

### 3.2 — Exemple — calcul de réduction selon role utilisateur

```python
# Code à tester
def discount_for(user_repo, user_id, base_price):
    user = user_repo.find(user_id)
    if user.is_premium:
        return base_price * 0.8
    return base_price

# Test avec stub
def test_premium_user_gets_20_percent_off():
    # Given : un stub de user_repo qui retourne un user premium
    stub_repo = Mock()
    stub_repo.find.return_value = User(id=1, is_premium=True)

    # When
    price = discount_for(stub_repo, user_id=1, base_price=100)

    # Then : on vérifie l'EFFET (le prix), pas l'appel
    assert price == 80
```

Ce qu'on teste :

- L'**output** (`price == 80`).
- **Pas** que `find()` a été appelé avec `1`.

→ C'est un **stub**.

### 3.3 — State verification

> Un test "stub" suit le pattern **state verification** : on injecte un état, on lit un état après, on vérifie l'égalité.

Synonymes courants : tests à **boîte noire** ou tests **classicist** (terme issu de la communauté Detroit TDD).

Avantages :

- Tests **stables** : tant que le contrat (entrées → sortie) ne change pas, le test passe — peu importe comment l'implémentation interne évolue.
- Faciles à lire.
- Moins fragiles au refactor.

### 3.4 — Quand stub est le bon choix

- L'unité testée **lit** des données depuis une dépendance.
- On veut tester **le résultat** de ce qu'elle fait avec ces données.
- On ne se soucie pas **comment** elle les obtient (lire 1 fois, 10 fois, cache, peu importe).

---

## 4. Mock — sorties indirectes

### 4.1 — Définition

> Un **mock** vérifie que l'unité testée **interagit correctement** avec ses dépendances : les méthodes appelées, les arguments passés, l'ordre, la fréquence.

Vocabulaire : on parle de **sorties indirectes** — l'unité testée **émet** des effets vers ses dépendances (appel à `send`, `save`, `publish`…).

### 4.2 — Exemple — envoyer un mail de bienvenue

```python
# Code à tester
def welcome_user(email_client, user):
    if not user.confirmed:
        return  # ne rien envoyer
    email_client.send(
        to=user.email,
        subject="Bienvenue",
        body=f"Bonjour {user.name}",
    )

# Test avec mock
def test_welcome_sends_email_to_confirmed_user():
    # Given
    mock_email = Mock()
    user = User(email="alice@example.com", name="Alice", confirmed=True)

    # When
    welcome_user(mock_email, user)

    # Then : on vérifie L'APPEL fait sur la dépendance
    mock_email.send.assert_called_once_with(
        to="alice@example.com",
        subject="Bienvenue",
        body="Bonjour Alice",
    )

def test_welcome_does_not_send_for_unconfirmed_user():
    mock_email = Mock()
    user = User(email="a@b.c", name="X", confirmed=False)

    welcome_user(mock_email, user)

    mock_email.send.assert_not_called()
```

Ce qu'on teste :

- **Pas** la valeur de retour de `welcome_user` (elle retourne `None` dans les deux cas).
- **L'effet de bord** : `send` est appelée exactement comme prévu, ou pas du tout.

→ C'est un **mock**.

### 4.3 — Behavior verification

> Un test "mock" suit le pattern **behavior verification** : on observe **les interactions** entre l'unité et ses dépendances.

Synonymes : tests **à boîte blanche partielle**, tests **mockist** (terme issu de la communauté London TDD, opposé à classicist).

Avantages :

- Permet de tester du code **sans valeur de retour** (effets de bord uniquement).
- Vérifie les **collaborations** clés explicitement.

Inconvénients :

- Plus **fragile** : un refactor qui change l'ordre d'appel, le nom d'une méthode, ou la signature, casse le test même si le comportement final est identique.
- Le test **connaît l'implémentation**.

### 4.4 — Quand mock est le bon choix

- L'unité testée **provoque** un effet sur une dépendance.
- On veut s'assurer que **cet effet précis** a lieu (envoyer un mail, écrire en DB, publier un event).
- La dépendance est **externe** ou **coûteuse** (mailer, payment gateway, notification push) — on ne veut pas l'exécuter réellement.

---

## 5. Stub vs Mock — la différence (item N3 explicite)

### 5.1 — Tableau frontal

| Aspect                      | **Stub**                                          | **Mock**                                              |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| **Rôle**                    | Fournit des **entrées indirectes**.               | Vérifie des **sorties indirectes**.                   |
| **Vérification**            | State (on assert l'**état** final).               | Behavior (on assert les **appels**).                  |
| **Style associé**           | Classicist (école Detroit, Kent Beck).            | Mockist (école London, Steve Freeman).                |
| **Sensibilité au refactor** | Faible — survit aux changements d'implémentation. | Forte — tout changement de l'interface casse le test. |
| **Lisibilité**              | Très bonne — `assert price == 80`.                | Moyenne — `mock.send.assert_called_once_with(...)`.   |
| **Cas typique**             | Calcul à partir de données lues.                  | Vérifier qu'un side-effect a eu lieu.                 |

### 5.2 — Exemple comparatif — la même unité testée des deux façons

Code :

```python
def process_order(order_repo, payment_gateway, order_id):
    order = order_repo.find(order_id)
    if order.total > 0:
        payment_gateway.charge(order.customer_id, order.total)
    return order
```

**Test "stub" (state verification)** — on s'intéresse à ce qui sort de `process_order` :

```python
def test_process_order_returns_order():
    stub_repo = Mock()
    stub_repo.find.return_value = Order(id=1, customer_id=42, total=100)
    dummy_gateway = Mock()  # dummy : on ne vérifie rien dessus

    result = process_order(stub_repo, dummy_gateway, order_id=1)

    assert result.total == 100
```

**Test "mock" (behavior verification)** — on s'intéresse à l'appel `charge` :

```python
def test_process_order_charges_customer():
    stub_repo = Mock()
    stub_repo.find.return_value = Order(id=1, customer_id=42, total=100)
    mock_gateway = Mock()

    process_order(stub_repo, mock_gateway, order_id=1)

    mock_gateway.charge.assert_called_once_with(42, 100)
```

Le **premier test** survit à un refactor qui changerait la signature de `charge` (ou le service `payment_gateway`). Le **second test** y est sensible — mais c'est précisément ce qu'on veut tester : "le bon montant est facturé au bon customer".

### 5.3 — Confusion fréquente — `unittest.mock.Mock` est-il un mock ou un stub ?

La classe `Mock` de Python s'appelle **mal**. Elle peut jouer **les deux** rôles :

- **En stub** : `m.return_value = X` — on lui dit quoi retourner, on n'assert rien sur ses appels.
- **En mock** : `m.method.assert_called_once_with(...)` — on assert les appels.

La même classe sert pour tout. Le nom est trompeur, mais c'est l'usage de l'objet dans le test qui détermine son rôle.

Conséquence pratique : **un `Mock()` Python n'est pas forcément un mock**. Lire les `assert_*` du test pour décider.

### 5.4 — Heuristique de choix — l'arbre

```text
   Quelle est la nature de la fonction testée ?
   ├─ Elle retourne une valeur calculée à partir de données externes
   │  → STUB la dépendance, ASSERT la valeur retournée.
   │
   ├─ Elle provoque un effet de bord (mail, DB write, event publish)
   │  → MOCK la dépendance, ASSERT l'appel.
   │
   ├─ Les deux à la fois (rare mais arrive)
   │  → Découper en 2 tests : un stub-style (résultat), un mock-style (effet).
   │
   └─ Effet de bord vers la propre logique interne du module testé
      → DON'T MOCK — tester en intégration ou refactorer.
```

---

## 6. Fake et Spy — précisions

### 6.1 — Fake — quand préférer un objet réel

Un **Fake** est une **implémentation alternative simplifiée mais fonctionnelle**. Cas d'usage typiques :

- **In-memory database** : SQLite en mode `:memory:` au lieu de PostgreSQL.
- **Fake clock** : `class FakeClock: now = 1716000000` qu'on incrémente manuellement.
- **Fake cache** : un dict au lieu de Redis.
- **Fake HTTP client** : une classe qui retourne des réponses prédéfinies sans réseau.

Avantages :

- **Pas de magie** : c'est du code normal qu'on lit.
- **Robuste au refactor** : la signature interne du Fake évolue avec l'interface, pas chaque test.
- **Comportement réaliste** : un Fake DB peut gérer transactions, contraintes, etc.

Quand le préférer à `Mock()` :

- Dépendance **stable** (Clock, Random, Logger, Repository).
- **Plusieurs tests** utilisent la même dépendance — un Fake économise la duplication de `mock.return_value = ...` partout.
- Tests qui **enchaînent** plusieurs interactions avec la dépendance.

### 6.2 — Spy — l'observateur passif

Un **Spy** est l'intermédiaire entre stub et mock — il **enregistre** les appels comme un mock, mais on **lit** les appels après coup comme un stub.

En `unittest.mock` Python, un `Mock` joue spontanément le rôle de spy : il enregistre tout, et on peut **lire** `mock.call_args_list`, `mock.call_count`. Pas besoin d'assert explicite.

```python
def test_logger_received_3_warnings():
    spy_logger = Mock()

    process_with_warnings(spy_logger)

    # Lecture des appels — style spy
    warnings = [call for call in spy_logger.method_calls if call[0] == "warning"]
    assert len(warnings) == 3
```

Spy est utile quand on veut vérifier des **patterns d'appels** non triviaux (combien d'appels, dans quel ordre, avec quelles séquences).

### 6.3 — Sinon.js et Mockito — vocabulaire strict

| Lib                | Stub                   | Mock                             | Spy                |
| ------------------ | ---------------------- | -------------------------------- | ------------------ |
| **sinon.js**       | `sinon.stub()`         | `sinon.mock()` (mode strict)     | `sinon.spy()`      |
| **Mockito (Java)** | `when(x).thenReturn()` | `verify(mock).method()` (strict) | `spy(obj)`         |
| **Jest (JS)**      | `jest.fn()`            | `expect(fn).toHaveBeenCalled()`  | `jest.spyOn(o,m)`  |
| **unittest.mock**  | `m.return_value=X`     | `m.assert_called_with(...)`      | `m.call_args_list` |

Dans des langages où le framework **distingue strictement**, on doit choisir explicitement.

---

## 7. Anti-patterns

### 7.1 — Over-mocking

```python
def test_user_service():
    repo = Mock()
    cache = Mock()
    logger = Mock()
    notifier = Mock()
    audit = Mock()

    service = UserService(repo, cache, logger, notifier, audit)

    service.create_user("alice")

    repo.save.assert_called_once()
    cache.set.assert_called_once()
    logger.info.assert_called_once()
    notifier.send.assert_called_once()
    audit.log.assert_called_once()
```

Cinq mocks, cinq asserts. Symptôme : la **logique métier** est diluée, l'unité testée a **trop de dépendances**, le test sera **réécrit à chaque refactor**.

Solutions :

- **Repenser l'architecture** : encapsuler `cache + logger + notifier + audit` derrière une seule façade (`UserSideEffects`).
- **Tester moins** : ne mocker que ce qui compte vraiment pour ce test précis (le `repo`, peut-être). Le reste, dummy.
- **Test d'intégration léger** : avec des Fakes au lieu de mocks individuels.

### 7.2 — Mock chains

```python
mock.find().filter().order_by().first().return_value = User(...)
```

Cinq niveaux de chaîne. Cas typique : on mock un ORM Django/SQLAlchemy. Trois problèmes :

1. **Couplage extrême** : tout changement du chaînage casse le test.
2. **Vraie violation de Demeter** : le code testé connaît trop la structure interne.
3. **Test illisible**.

Solutions :

- **Wrapper le repository** : `UserRepository.find_premium()` au lieu d'exposer le query builder.
- **Fake repository** comme vu en 6.1.

### 7.3 — Mocker sa propre logique

```python
def test_calculate_discount():
    cart = Cart()
    cart.compute_subtotal = Mock(return_value=100)
    cart.apply_coupon = Mock(return_value=80)

    assert cart.total() == 80
```

On mock `compute_subtotal` et `apply_coupon` de la **même classe** qu'on teste. → On ne teste **plus rien** : `total()` est juste vérifié comme un orchestrateur de 2 méthodes qu'on a fakées.

Solutions :

- **Tester `total()` avec un vrai Cart** : insérer des items réels.
- **Si les deux méthodes sont vraiment complexes**, les tester séparément, et tester `total()` comme un wrapper trivial (ou supprimer le test).

### 7.4 — Mock de la stdlib ou d'une lib stable

```python
@patch("datetime.datetime")
def test_uses_now(mock_dt):
    mock_dt.now.return_value = datetime(2026, 1, 1)
    ...
```

Plomberie fragile. Préférer :

- **Inject le clock** : `def __init__(self, clock=datetime.now): self.clock = clock`. Test passe `lambda: datetime(2026,1,1)`.
- **`freezegun`** ou **`time-machine`** : libs spécialisées pour figer le temps.

### 7.5 — Mock qui retourne `Mock()`

```python
mock_user = Mock()
# mock_user.email, mock_user.name, etc. retournent tous des Mock() — sans valeur précise
```

Le test passe mais ne valide rien : un mock auto-attribut accepte **tout**. Solutions :

- Utiliser **`spec`** : `Mock(spec=User)` — restreint aux attributs déclarés sur `User`.
- Construire un **vrai User** à la place : `User(email="a@b.c", name="Alice")`.

### 7.6 — Tableau récapitulatif

| Anti-pattern                            | Symptôme                                 | Remède                                 |
| --------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Over-mocking                            | 5+ mocks par test.                       | Réduire dépendances, façade, Fake.     |
| Mock chains                             | `mock.a().b().c().d.return_value = X`.   | Wrapper / Fake.                        |
| Mocker sa propre logique                | `obj.method = Mock()`.                   | Tester avec vrai objet.                |
| Mocker la stdlib                        | `@patch("datetime.datetime")`.           | Injection + freezegun.                 |
| Mock sans `spec`                        | Mock qui accepte tous les attributs.     | `Mock(spec=Class)`.                    |
| Mock partagé entre tests                | Fixture session-scope contenant un mock. | Fixture function-scope.                |
| Asserter `called_with` détaillé fragile | Toute modif de signature casse 30 tests. | `assert_called_once()` minimum + spec. |

---

## 8. Refactor d'un test entre stub et mock — la pratique

L'exercice demandé par le glossaire : **convertir** un test stub en mock, et inversement, en préservant l'intention.

### 8.1 — De stub à mock

Soit ce test à state-verification (stub) :

```python
def test_send_invoice_returns_success():
    stub_mailer = Mock()
    stub_mailer.send.return_value = True  # stub : on prépare un retour

    result = send_invoice(stub_mailer, Invoice(id=1, total=100))

    assert result is True
```

On veut vérifier en plus **comment** `send_invoice` interagit avec le mailer.

```python
def test_send_invoice_calls_mailer_with_invoice():
    mock_mailer = Mock()
    mock_mailer.send.return_value = True  # ici on stub le retour

    send_invoice(mock_mailer, Invoice(id=1, total=100))

    # On rajoute la vérification d'appel : c'est devenu un mock
    mock_mailer.send.assert_called_once_with(
        to_invoice_id=1, amount=100
    )
```

L'objet a **les deux rôles** : stub (return_value) **et** mock (assertion). C'est fréquent en pratique. Le test passe en mode **mock** car on assert **l'appel** explicitement.

### 8.2 — De mock à stub

Soit ce test à behavior-verification (mock) :

```python
def test_process_calls_save():
    mock_repo = Mock()
    process(mock_repo, data=[1, 2, 3])
    mock_repo.save.assert_called_once_with([1, 2, 3])
```

Si on découvre que `process` **retourne** aussi une valeur intéressante à valider, et que la vérification d'appel est fragile, on peut **passer en stub**.

```python
def test_process_returns_summary():
    fake_repo = FakeRepo()  # Fake, pas Mock
    summary = process(fake_repo, data=[1, 2, 3])
    assert summary == {"saved": 3}
    # On vérifie l'effet d'état, pas l'appel
    assert fake_repo.count() == 3
```

On a remplacé Mock par un Fake et on vérifie **l'état final** plutôt que l'appel.

### 8.3 — Quand changer ?

| Symptôme                                                    | Aller vers                                   |
| ----------------------------------------------------------- | -------------------------------------------- |
| Tests qui cassent à chaque refactor d'implémentation.       | **De mock à stub** (state).                  |
| Tests qui passent même quand le side-effect ne se fait pas. | **De stub à mock** (behavior).               |
| 3+ mocks dans le même test.                                 | Passer aux **Fakes** dès que possible.       |
| Mock d'une dépendance externe (mailer, payment).            | **Garder en mock** — c'est sa raison d'être. |

### 8.4 — Bilan — les deux styles coexistent

> Un projet sain utilise **des deux** : stub-style pour la logique pure ; mock-style pour les bords (mailers, gateways, queues).

Le débat "classicist vs mockist" (Detroit vs London TDD) est un faux dilemme à l'échelle d'un projet. C'est **au niveau du test** qu'on tranche, pas du projet entier.

---

## 9. Outillage par langage

### 9.1 — Python — `unittest.mock`

Standard library. Pas d'install supplémentaire :

```python
from unittest.mock import Mock, MagicMock, patch, call

# Stub
m = Mock()
m.find.return_value = User(id=1)

# Mock (assertions)
m.send.assert_called_once_with(to="x", body="y")
m.send.assert_called_with(to="x", body="y")  # dernière fois
m.send.assert_any_call(to="x", body="y")     # parmi les appels
assert m.send.call_count == 3

# Spec — restreindre les attributs
m = Mock(spec=EmailClient)  # plante si on accède à un attribut hors EmailClient

# Patch — remplacer dans un module
with patch("myapp.module.email_client") as m:
    m.send.return_value = True
    ...
```

Bibliothèques complémentaires :

- **`pytest-mock`** : wrapper `mocker.patch(...)` plus ergonomique en `pytest`.
- **`responses`** / **`httpretty`** : mocker `requests` HTTP.
- **`freezegun`** / **`time-machine`** : figer le temps.
- **`moto`** : mocker AWS SDK.

### 9.2 — JavaScript / TypeScript — `vitest` / `jest`

```javascript
// Stub
const stub = vi.fn().mockReturnValue({ id: 1 });

// Mock (assertions)
const mock = vi.fn();
mock("hello");
expect(mock).toHaveBeenCalledWith("hello");
expect(mock).toHaveBeenCalledTimes(1);

// Spy sur un objet existant
const spy = vi.spyOn(obj, "method");
```

### 9.3 — Java — Mockito

```java
EmailClient mock = mock(EmailClient.class);

// Stub
when(mock.sendable(any())).thenReturn(true);

// Mock (verify)
verify(mock).send(eq("to@example.com"), eq("body"));
verify(mock, times(2)).log(any());
verify(mock, never()).delete();
```

### 9.4 — Choisir l'outil

Quelle que soit la lib :

- Préférer une **lib qui distingue** stub et mock (Mockito, sinon, Jest) si possible.
- Si la lib **mélange** (Python `Mock`), respecter la **distinction côté usage** en lisant le test : qu'est-ce qui est asserté ?

---

## 10. Exercices pratiques

### Exercice 1 — Identifier le type de Test Double (≈ 20 min)

**Objectif.** Maîtriser la taxonomie.

Pour chacun des extraits ci-dessous, dire s'il s'agit de **dummy, stub, fake, spy, ou mock**.

1. `logger = None` passé à `process(data, logger)` qui ne loggue rien sur cet input.
2. `m = Mock(); m.now.return_value = datetime(2026,1,1); price = compute(m, ...)`.
3. `class FakeUserRepo: def find(self, id): return self._users.get(id)`.
4. `m = Mock(); call(m); assert m.call_args_list == [...]`.
5. `m = Mock(); m.expects("send").with("a").times(1)` (lib stricte).

**Livrable.** Tableau 5 lignes.

### Exercice 2 — Refactor stub → mock (≈ 30 min)

**Objectif.** L'item N3 explicite.

Soit ce test stub :

```python
def test_pay_returns_success():
    stub = Mock()
    stub.charge.return_value = {"status": "ok"}
    assert pay(stub, customer="alice", amount=100) is True
```

**Reformuler en mock** : on veut vérifier que `charge` est appelé avec `customer="alice", amount=100` exactement une fois.

**Livrable.** Code refactoré.

### Exercice 3 — Refactor mock → stub via Fake (≈ 45 min)

**Objectif.** L'item N3 explicite, sens inverse.

Soit ce test mock :

```python
def test_create_order_saves_in_db():
    mock_db = Mock()
    create_order(mock_db, customer="alice", items=[Item("book")])
    mock_db.save_order.assert_called_once()
    mock_db.save_item.assert_called_once_with(Item("book"))
```

**Refactor** en utilisant un **FakeDB** qui stocke en RAM, et vérifier l'état final plutôt que les appels.

**Livrable.** Classe `FakeDB` + test refactoré.

### Exercice 4 — Repérer les anti-patterns dans une suite existante (≈ 45 min)

**Objectif.** Œil critique.

Sur sa propre suite (ou un repo open-source) :

1. Chercher tous les `Mock()` ou équivalents.
2. Pour chacun, classer en : **dummy / stub / fake / spy / mock**.
3. Identifier **3 anti-patterns** parmi : over-mocking, mock chains, mock de soi-même, mock stdlib, mock sans spec.

**Livrable.** Liste annotée + 3 anti-patterns documentés.

### Exercice 5 — Construire un Fake utile (≈ 60 min)

**Objectif.** Préférer Fake quand pertinent.

Choisir une dépendance souvent mockée dans son projet (typiquement un `Repository`). Construire un `Fake<Repo>` qui implémente l'interface en RAM.

Réécrire **3 tests** qui utilisent actuellement des mocks pour ce repository → utiliser le Fake à la place.

Comparer : lisibilité, robustesse à un refactor de signature.

**Livrable.** Classe Fake + 3 tests réécrits + 5 lignes de bilan.

### Mini-défi — Argumenter classicist vs mockist (≈ 30 min, papier)

**Cas.** Une équipe est divisée : la moitié veut tout tester par état (classicist), l'autre veut tout tester par appels (mockist).

Rédiger une note de **1 page** :

- Quand chaque approche est préférable.
- Comment **co-exister** dans un projet.
- 3 règles simples pour décider sur un test donné.

**Livrable.** Note 1 page.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **5 catégories** de Test Doubles (Dummy, Stub, Fake, Spy, Mock) et la fonction de chacune.
- [ ] Définir un **stub** : entrées indirectes, state verification.
- [ ] Définir un **mock** : sorties indirectes, behavior verification.
- [ ] Distinguer **Spy** et **Mock** (observation vs prescription).
- [ ] Donner un **cas typique** où Stub est le bon choix et un où Mock l'est.
- [ ] Expliquer pourquoi `unittest.mock.Mock` peut jouer **les deux rôles**.
- [ ] Citer **3 anti-patterns** de mocking et leur remède.
- [ ] Donner un exemple où **Fake** est meilleur que **Mock** (Repository / Clock).
- [ ] Refactor un test **stub → mock** sur un exemple en 3 minutes.
- [ ] Refactor un test **mock → stub via Fake** en 3 minutes.
- [ ] Énumérer **3 différences** entre tests classicist et mockist.
- [ ] Reconnaître à la lecture si un test fait du state verification ou du behavior verification.

### Items du glossaire visés

**N3 atteint** :

- _connaître la différence entre les stubs et les mocks_ — sections 3, 4, 5.

**N2 consolidés** :

- _utiliser des mocks_ — sections 4, 9.
- _utiliser des stubs_ — sections 3, 9.

---

## 12. Ressources complémentaires

### Articles fondateurs

- [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) — la référence sur la distinction et les écoles.
- [Martin Fowler — Test Double](https://martinfowler.com/bliki/TestDouble.html) — vocabulaire compact.
- [Robert Martin — When to Mock](http://blog.cleancoder.com/uncle-bob/2014/05/14/TheLittleMocker.html) — recommandations pragmatiques.

### Livres

- _xUnit Test Patterns_ (Meszaros) — chapitres 23 (Test Stub) et 24 (Mock Object).
- _Growing Object-Oriented Software, Guided by Tests_ (Freeman & Pryce) — mockist TDD.
- _Test-Driven Development_ (Beck) — classicist TDD.

### Outils

- Python : [`unittest.mock`](https://docs.python.org/3/library/unittest.mock.html), [`pytest-mock`](https://pytest-mock.readthedocs.io/), [`responses`](https://github.com/getsentry/responses), [`freezegun`](https://github.com/spulec/freezegun), [`moto`](https://github.com/getmoto/moto).
- JS : [`vitest`](https://vitest.dev/), [`jest`](https://jestjs.io/), [`sinon`](https://sinonjs.org/), [`msw`](https://mswjs.io/).
- Java : [Mockito](https://site.mockito.org/), [AssertJ](https://assertj.github.io/doc/).

### Pour aller plus loin

- **M3 (TDD vs BDD)** — les écoles classicist / mockist y prennent tout leur sens.
- **M4 (Indépendance des tests)** — comment les mocks peuvent fragiliser l'indépendance.
- **M5 (Pertinence)** — quand mocker n'apporte rien.
- **M9 (Golden Master)** — quand on n'a aucun mock et qu'on capture la sortie.
