# M4 — Indépendance des tests

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Énoncer le **principe d'indépendance des tests** (item N3 explicite) et en déduire les **3 propriétés** qu'une suite saine doit garantir : **order-independence**, **parallel-safety**, **repeatability**.
- Identifier les **sources de couplage** entre tests : état partagé mutable, side-effects filesystem / DB, appels réseau, horloge, génération aléatoire, variables d'environnement, monkey-patching mal scopé.
- Reconnaître et anticiper les **cas dégradés liés au contexte d'exécution** (item N3 explicite) : DST, fuseau horaire, encoding locale, ordre des dictionnaires, exécution parallèle, CI vs local, OS différent (Windows / macOS / Linux).
- Utiliser les **outils** pour faire émerger ces dépendances cachées : `pytest-randomly` (ordre aléatoire), `pytest-xdist` (parallélisme), `pytest --collect-only`, comparaison CI/local.
- Appliquer les **patterns** garantissant l'isolation : rollback transactionnel DB, `tmp_path` plutôt que `/tmp`, `freezegun` pour le temps, `monkeypatch` pour env vars, seed fixe pour RNG.
- **Auditer une suite existante** pour en identifier les dépendances cachées — c'est la pratique demandée par le glossaire.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (fixtures, setup / teardown, cycle de vie).
- M2-M3 (familiarité avec mocks, TDD).
- `pytest` + `pytest-xdist` + `pytest-randomly` installables.
- Une suite de tests existante à auditer (perso, projet, OSS).

---

## 1. Pourquoi un module dédié à l'indépendance

### 1.1 — Les symptômes typiques

> Une suite **non indépendante** ne dit pas son nom. Elle se manifeste par des **comportements bizarres** :

- "Quand je lance `test_create_user` **seul**, il passe. Quand je lance toute la suite, il échoue."
- "Sur ma machine ça marche. En CI ça échoue."
- "Sur ma machine ça marche. Hier ça marchait. Aujourd'hui non, je n'ai rien changé."
- "Les tests passent en série, mais en parallèle (`-n auto`) plusieurs échouent aléatoirement."
- "Le test passe quand je l'exécute en premier dans le fichier, échoue en dernier."

Tous ces symptômes ont **une cause commune** : un test influence l'état observable d'un autre. C'est précisément ce que le principe d'indépendance interdit.

### 1.2 — L'analogie de la salle blanche

Penser à un test comme une **expérience de laboratoire** :

- Une **salle blanche** = un environnement où **rien n'a été touché** depuis la fin de l'expérience précédente.
- **Setup** = on prépare les conditions exactes prévues.
- **Test** = on exécute l'expérience.
- **Teardown** = on **remet la salle blanche** dans son état initial avant la prochaine.

Une expérience qui contamine la salle suivante **invalide les résultats** de toutes les expériences qui suivent. Pas d'isolation = pas de science.

### 1.3 — Le coût caché de la non-indépendance

| Symptôme                               | Coût pour l'équipe                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Flaky tests (échoue parfois).          | Devs perdent confiance en la CI, "rerun" devient un réflexe — vraies régressions noyées. |
| Tests qui passent en série uniquement. | Pas de parallélisme → CI lente.                                                          |
| "Marche sur ma machine".               | Time perdu à reproduire localement avant de fixer.                                       |
| Tests d'ordre dépendant.               | Refactor d'ordre casse 50 tests → résistance au changement.                              |
| Tests qui dépendent de l'horloge.      | Échec à minuit du 31 décembre, en heure d'été, etc.                                      |

C'est typiquement la **dette technique la plus pénible** d'une suite mature.

### 1.4 — Anti-patterns récurrents

| Anti-pattern                                                               | Conséquence                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tests numérotés (`test_01_setup`, `test_02_use`, `test_03_cleanup`).       | Ordre explicite — la moindre suppression casse la chaîne.                            |
| Variable globale modifiée par un test.                                     | Pollution croisée invisible.                                                         |
| Données réelles en DB partagée (`users` table inscrite dans la migration). | Les tests dépendent du seed initial qui peut bouger.                                 |
| `os.environ["DEBUG"] = "1"` dans un test sans cleanup.                     | Tests suivants partent en mode debug.                                                |
| Connexion réseau réelle dans un test "unitaire".                           | Échec si pas de wifi, latence variable, dépendance à des données externes mouvantes. |

---

## 2. Le principe d'indépendance des tests (item N3 explicite)

### 2.1 — Énoncé

> Un test doit pouvoir s'exécuter **seul**, dans **n'importe quel ordre** par rapport aux autres, **plusieurs fois de suite**, sur **n'importe quelle machine**, sans changement de résultat.

Cette définition se décompose en **trois propriétés cardinales** :

| Propriété              | Définition                                                              | Vérification                                            |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| **Order-independence** | Le test passe quel que soit l'ordre d'exécution.                        | `pytest-randomly` ou `pytest --collect-only` + reverse. |
| **Parallel-safety**    | Le test passe en parallèle avec n'importe quel autre.                   | `pytest -n auto` (`pytest-xdist`).                      |
| **Repeatability**      | Le test passe **identiquement** à chaque exécution sur la même machine. | Lancer 10 fois, vérifier 10 succès.                     |

Et une 4ᵉ propriété, souvent négligée :

| Propriété                    | Définition                                                      |
| ---------------------------- | --------------------------------------------------------------- |
| **Environment-independence** | Le test passe sur n'importe quelle machine (CI, dev, autre OS). |

### 2.2 — Pourquoi ces propriétés

Chacune élimine un bug class de la suite :

- **Order-independence** → pas de chaîne implicite, on peut sélectionner un sous-ensemble.
- **Parallel-safety** → on peut diviser la suite sur N cœurs et passer de 10 min à 1 min.
- **Repeatability** → un échec **signale une vraie régression**, pas un aléa.
- **Environment-independence** → "marche sur ma machine" n'est plus une excuse.

### 2.3 — Schéma mental — le contrat du test

```text
   ┌────────────────────────────────────────────────────────┐
   │ TEST                                                   │
   │ ┌────────────────────────────────────────────────────┐ │
   │ │ Setup : Je pose explicitement l'état dont j'ai     │ │
   │ │         besoin. Je n'assume RIEN sur ce que        │ │
   │ │         l'environnement contient.                  │ │
   │ ├────────────────────────────────────────────────────┤ │
   │ │ Run   : Je manipule cet état.                     │ │
   │ ├────────────────────────────────────────────────────┤ │
   │ │ Tear- : Je remets l'environnement EXACTEMENT       │ │
   │ │ down    dans l'état où je l'ai trouvé.            │ │
   │ └────────────────────────────────────────────────────┘ │
   └────────────────────────────────────────────────────────┘
```

Le contrat est **symétrique** : "je ne polue pas l'environnement, je n'attends rien de lui".

---

## 3. Les sources de couplage — catalogue

Cinq grandes catégories de couplage caché.

### 3.1 — État partagé mutable

```python
USERS = []  # variable de module

def test_add_user():
    USERS.append(User("alice"))
    assert len(USERS) == 1   # passe SEUL

def test_no_users_initially():
    assert USERS == []        # passe SEUL — échoue si exécuté après test_add_user
```

**Détection** : ordre inversé ou aléatoire fait échouer.

**Remède** : éviter les globals mutables. Si on en a, **réinitialiser** dans une fixture autouse.

```python
@pytest.fixture(autouse=True)
def reset_users():
    USERS.clear()
    yield
    USERS.clear()
```

### 3.2 — Filesystem partagé

```python
def test_writes_report():
    with open("/tmp/report.txt", "w") as f:
        f.write("report")
    assert os.path.exists("/tmp/report.txt")

def test_no_report_yet():
    assert not os.path.exists("/tmp/report.txt")  # échoue si test précédent a tourné
```

**Remède** : `tmp_path` (fixture pytest intégrée) donne **un dossier propre par test**.

```python
def test_writes_report(tmp_path):
    out = tmp_path / "report.txt"
    out.write_text("report")
    assert out.exists()
```

`tmp_path` est nettoyée automatiquement (pytest garde les 3 dernières sessions par défaut). **Pas de pollution croisée.**

### 3.3 — Base de données

Un test qui INSERT sans rollback laisse des lignes pour les suivants.

**Trois patterns** pour résoudre :

**Pattern A — Rollback transactionnel** :

```python
@pytest.fixture
def db_session():
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn)
    yield session
    session.close()
    trans.rollback()   # ← toutes les écritures sont annulées
    conn.close()
```

Le plus rapide et le plus propre quand le SGBD le supporte.

**Pattern B — TRUNCATE / DELETE entre tests** :

```python
@pytest.fixture
def clean_db(db_session):
    yield db_session
    for table in reversed(metadata.sorted_tables):
        db_session.execute(table.delete())
    db_session.commit()
```

Plus lent mais simple.

**Pattern C — Base éphémère** (`testcontainers`, SQLite `:memory:`) :

```python
@pytest.fixture(scope="session")
def engine():
    return create_engine("sqlite:///:memory:")

@pytest.fixture
def db_session(engine):
    SessionLocal = sessionmaker(bind=engine)
    metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()
    metadata.drop_all(engine)
```

Maximum d'isolation, lent au démarrage.

### 3.4 — Réseau

Un test qui appelle `requests.get("https://api.openweather.com/...")` :

- **Échoue sans wifi**.
- **Latence variable** → flake.
- **API change** → bug indépendant du code testé.
- **Quota / rate limit**.

**Remède** : intercepter le réseau systématiquement.

| Lib                | Usage                                                  |
| ------------------ | ------------------------------------------------------ |
| `responses`        | Mock `requests` côté Python.                           |
| `httpretty`        | Mock plus large.                                       |
| `respx`            | Mock `httpx`.                                          |
| `pytest-recording` | Record/replay des vraies réponses (`vcrpy`-style).     |
| `msw`              | Mock service worker côté JS / Node.                    |
| `wiremock`         | Serveur de mock HTTP standalone (Java, multi-langage). |
| `moto`             | Mock du SDK AWS.                                       |

**Règle d'or** : aucun test unitaire ne touche le réseau réel. Au mieux des tests d'intégration explicitement marqués `@pytest.mark.network`.

### 3.5 — Horloge

```python
def test_token_expires():
    token = create_token(ttl_seconds=10)
    time.sleep(11)
    assert is_expired(token)   # passe... mais le test prend 11 secondes
```

Deux problèmes : **lent** et **fragile** (sur machine chargée, peut prendre 20 s).

**Remède** : figer l'horloge.

```python
from freezegun import freeze_time

def test_token_expires():
    with freeze_time("2026-01-01 10:00:00"):
        token = create_token(ttl_seconds=10)

    with freeze_time("2026-01-01 10:00:11"):
        assert is_expired(token)
```

Mieux encore : **injecter le clock** dans le code :

```python
class TokenService:
    def __init__(self, clock=datetime.now):
        self.clock = clock

# Dans le test :
fake_clock = lambda: datetime(2026, 1, 1, 10, 0, 0)
service = TokenService(clock=fake_clock)
```

L'injection de dépendance est **toujours préférable** au monkey-patching quand c'est possible.

### 3.6 — Aléatoire

```python
def test_random_token_is_unique():
    a = generate_token()
    b = generate_token()
    assert a != b   # presque toujours vrai mais... non déterministe
```

Le test **passe quasiment toujours**, mais peut **flake** sur une collision improbable. Surtout, en cas d'échec, **on ne peut pas reproduire**.

**Remède** : seed fixe.

```python
def test_random_token_format(monkeypatch):
    monkeypatch.setattr(random, "random", lambda: 0.5)
    token = generate_token()
    assert token == "expected_value_for_seed_0.5"
```

Ou injecter une source RNG :

```python
class TokenGen:
    def __init__(self, rng=random):
        self.rng = rng

# Test
test_rng = random.Random(42)  # seed fixe
gen = TokenGen(rng=test_rng)
```

### 3.7 — Variables d'environnement et process state

```python
def test_with_debug():
    os.environ["DEBUG"] = "1"
    assert app_starts_in_debug_mode()
    # OUBLI : du os.environ.pop("DEBUG") en cleanup
```

Tous les tests suivants ont `DEBUG=1`. Effets de bord opaques.

**Remède** : `monkeypatch` (fixture pytest intégrée). Cleanup automatique au teardown.

```python
def test_with_debug(monkeypatch):
    monkeypatch.setenv("DEBUG", "1")
    assert app_starts_in_debug_mode()
    # Cleanup automatique
```

`monkeypatch` gère aussi `setattr`, `delattr`, `delenv`, `syspath_prepend` — toujours scopé proprement.

### 3.8 — Cache et singletons

```python
def get_config():
    if not _CONFIG:
        _CONFIG.update(load_from_file())
    return _CONFIG

def test_load_config():
    cfg = get_config()
    assert cfg["env"] == "prod"

def test_override_env():
    monkeypatch.setenv("ENV", "dev")
    cfg = get_config()
    assert cfg["env"] == "dev"   # échoue : le cache _CONFIG est resté du test précédent
```

**Remède** : injecter ou reset.

```python
@pytest.fixture(autouse=True)
def reset_config_cache():
    _CONFIG.clear()
    yield
    _CONFIG.clear()
```

---

## 4. Cas dégradés du contexte d'exécution (item N3 explicite)

Au-delà du couplage entre tests, certains tests **échouent à cause du contexte** lui-même. Catalogue à anticiper.

### 4.1 — Fuseau horaire et DST

```python
def test_event_date():
    event = Event.now()
    assert event.date == date(2026, 5, 18)
```

Sur une machine en UTC à 23h59, c'est le 18. Sur une machine en `Asia/Tokyo` à 01h00, c'est le **19**.

**Remède** :

- Toujours utiliser **UTC** en interne, formater en local en bord.
- Tests : `freeze_time` ou injection de clock UTC explicite.

### 4.2 — Daylight Saving Time

Plus pernicieux : le **passage à l'heure d'été**.

```python
def test_two_minutes_after_midnight():
    t = datetime(2026, 3, 29, 1, 59, 0, tzinfo=local)
    later = t + timedelta(minutes=2)
    assert later.hour == 2  # FAUX en Europe : à 02:00 on saute à 03:00
```

**Remède** :

- Tester **explicitement** les transitions DST.
- Stocker en UTC interne.

### 4.3 — Encoding et locale

```python
def test_format_currency():
    assert format_currency(1234.5) == "1,234.50 €"
```

Sur une locale `en_US`, le séparateur est `,`. Sur `fr_FR`, c'est `1 234,50 €`. Sur une CI Docker minimal, la locale peut être `C` ou `POSIX` avec format différent.

**Remède** :

- **Injecter la locale** ou la **figer** dans le test.
- Ne pas tester `print()` mais une fonction qui retourne une string déterministe.

### 4.4 — Filesystem case sensitivity

- Linux : `Test.txt` ≠ `test.txt`.
- macOS (HFS+ par défaut) : `Test.txt` == `test.txt`.
- Windows : `Test.txt` == `test.txt`.

Test qui passe sur macOS, échoue sur Linux CI.

**Remède** : éviter les hypothèses sur la casse. Si critique, tester explicitement les deux cas.

### 4.5 — Séparateur de chemin

- Linux / macOS : `/`.
- Windows : `\`.

```python
assert path == "data/users/alice.json"   # marche sur Linux, échoue sur Windows
```

**Remède** : utiliser `pathlib.Path` partout.

```python
assert path == Path("data") / "users" / "alice.json"
```

### 4.6 — Ordre des dictionnaires

Avant Python 3.7, l'ordre n'était pas garanti. **Depuis 3.7**, il l'est. Mais :

- Tests qui dépendent de l'ordre d'**iteration** d'un `set` : **toujours** non déterministe.
- JSON output : `json.dumps(d)` produit l'ordre du dict (3.7+) mais `json.dumps(d, sort_keys=True)` est plus sûr pour les tests.

```python
def test_to_json():
    assert json.dumps({"a":1,"b":2}, sort_keys=True) == '{"a": 1, "b": 2}'
```

### 4.7 — Précision flottante

```python
def test_sum():
    assert 0.1 + 0.2 == 0.3   # FAUX : 0.30000000000000004
```

**Remède** : `pytest.approx`.

```python
assert 0.1 + 0.2 == pytest.approx(0.3)
```

### 4.8 — CI vs local

Différences fréquentes entre dev laptop et CI :

| Aspect          | Local                   | CI typique              |
| --------------- | ----------------------- | ----------------------- |
| OS              | macOS, Windows          | Linux (Ubuntu, Alpine). |
| Locale          | fr_FR / en_US.UTF-8     | C ou POSIX.             |
| Time zone       | Locale de l'utilisateur | UTC souvent.            |
| CPU             | 8 cores, rapide         | 2 cores, partagé.       |
| RAM             | 16-64 GB                | 4-8 GB.                 |
| Variables d'env | `~/.bashrc` perso       | Strict minimum.         |
| Réseau          | Internet                | Pas d'accès parfois.    |

**Remède** : faire tourner la CI **localement** régulièrement (`docker compose run ci`) — sinon les surprises se découvrent au pire moment.

### 4.9 — Tableau récapitulatif

| Source de fragilité | Symptôme                             | Remède                                |
| ------------------- | ------------------------------------ | ------------------------------------- |
| Fuseau horaire      | Test échoue selon machine.           | UTC interne, freezegun.               |
| DST                 | Test du 29 mars / 26 octobre échoue. | Tests explicites des transitions.     |
| Locale              | Format de date / nombre change.      | Forcer locale en test.                |
| Filesystem case     | `Test.txt` ≠ `test.txt` sur Linux.   | Pas d'hypothèse sur casse.            |
| Path separator      | `\` ≠ `/`.                           | `pathlib.Path`.                       |
| Dict ordering       | Set iteration.                       | `sort_keys`, sets triés.              |
| Float precision     | `0.1 + 0.2 != 0.3`.                  | `pytest.approx`.                      |
| CI vs local         | OS, locale, RAM différents.          | Docker reproductible, runs CI locaux. |
| Parallélisme        | Race conditions cachées.             | Toutes les autres remédiations.       |

---

## 5. Outils pour faire émerger le couplage

### 5.1 — `pytest-randomly` — ordre aléatoire

```bash
pip install pytest-randomly
pytest
```

À chaque run, `pytest-randomly` **mélange l'ordre** des tests (au niveau module, classe, fonction). En cas d'échec, on a la **seed** qui permet de reproduire :

```text
Using --randomly-seed=1234567
```

Lancer 5-10 fois la suite avec différentes seeds → les **flaky tests par ordre** apparaissent rapidement.

### 5.2 — `pytest-xdist` — parallélisme

```bash
pip install pytest-xdist
pytest -n auto    # autant de workers que de CPUs
```

Si la suite passe en série mais **échoue** en parallèle, c'est qu'il y a du **shared state** entre tests. Symptômes :

- Erreurs de DB (deadlock, unique constraint).
- Fichiers créés à un chemin fixe.
- Ports déjà utilisés.

### 5.3 — `pytest --collect-only` + reverse

```bash
pytest --collect-only -q > tests.txt
# Lancer en ordre inversé
pytest $(tac tests.txt | grep "::test_")
```

Lance la suite à l'envers. Compare avec l'ordre normal — les tests qui échouent indiquent des dépendances cachées.

### 5.4 — Lancer un test seul

```bash
pytest tests/test_users.py::test_create_user
```

Méthode simple : si le test passe quand lancé seul **mais échoue** dans la suite, il y a un couplage en amont.

### 5.5 — Audit en CI vs local

Lancer la suite dans un container Docker minimal (Alpine, par exemple) :

```bash
docker run -it -v $PWD:/app -w /app python:3.12-slim bash -c "pip install -e .[test] && pytest"
```

Si ça passe local et échoue ici : différence d'environnement à débusquer.

### 5.6 — `pytest --pdb` et `--pdb-trace`

Pour disséquer un test qui échoue uniquement en suite :

```bash
pytest --pdb
```

Au premier échec, `pdb` s'ouvre. Inspecter l'état partagé qui ne devrait pas l'être (`globals()`, fichiers, env vars).

---

## 6. Patterns pour rester indépendant

### 6.1 — Tableau des recommandations

| Source de couplage           | Pattern recommandé                        |
| ---------------------------- | ----------------------------------------- |
| Fichiers temporaires         | `tmp_path` (pytest).                      |
| Variables d'env              | `monkeypatch.setenv()`.                   |
| Attributs / méthodes patch   | `monkeypatch.setattr()`.                  |
| `sys.path`                   | `monkeypatch.syspath_prepend()`.          |
| Horloge                      | `freezegun` ou injection de clock.        |
| RNG                          | Seed fixe ou injection.                   |
| Base de données              | Rollback transactionnel (fixture).        |
| Cache / singleton            | `autouse` fixture qui clear.              |
| Réseau HTTP                  | `responses` / `httpretty` / `respx`.      |
| Variables de module mutables | À éviter ; si présentes, `autouse` reset. |
| Tests d'ordre intentionnel   | Refactor en 1 test paramétré (M8).        |

### 6.2 — Pattern "fixture autouse" pour le reset universel

```python
@pytest.fixture(autouse=True)
def reset_world():
    # Setup : reset état global
    cache.clear()
    GLOBAL_STATE.reset()
    monkeypatch.setenv("ENV", "test")

    yield  # le test tourne ici

    # Teardown : symétrique
    cache.clear()
    GLOBAL_STATE.reset()
```

`autouse=True` → la fixture s'applique à **tous les tests** sans avoir à la nommer.

### 6.3 — Pattern "session-scope read-only"

Quand un setup coûteux est partagé mais qu'on peut garantir l'**immutabilité** :

```python
@pytest.fixture(scope="session")
def reference_dataset():
    # Coûteux : charger 100 MB de référence
    return tuple(load_reference())   # tuple = immuable
```

L'immutabilité garantit qu'aucun test ne pollue le suivant. Le `tuple` est crucial — `list` permettrait `.append()`.

### 6.4 — Pattern "factory fixture"

Évite que deux tests construisent par hasard le même objet "globalement" :

```python
@pytest.fixture
def make_user():
    counter = [0]
    def _make(**kwargs):
        counter[0] += 1
        return User(
            id=counter[0],
            email=f"user_{counter[0]}@test.local",
            **kwargs
        )
    return _make

def test_two_users(make_user):
    a = make_user(role="admin")
    b = make_user(role="user")
    assert a.id != b.id
```

Chaque test obtient des objets **uniques**, pas un objet partagé.

---

## 7. Méthode d'audit des dépendances cachées

### 7.1 — La pratique demandée par le glossaire

Pour une suite donnée, suivre **5 étapes** :

#### Étape 1 — Lancer en parallèle

```bash
pytest -n auto
```

Noter les tests qui **échouent uniquement en parallèle**. Causes typiques : fichiers à chemin fixe, ports, DB partagée.

#### Étape 2 — Lancer en ordre aléatoire

```bash
pytest --randomly-seed=1
pytest --randomly-seed=2
pytest --randomly-seed=3
```

Les tests qui **passent en ordre par défaut et échouent en aléatoire** ont une dépendance d'ordre.

#### Étape 3 — Reverse run

```bash
pytest --collect-only -q | tac | xargs pytest
```

Mêmes échecs → confirme dépendance d'ordre.

#### Étape 4 — Run en CI / Docker minimal

```bash
docker run -v $PWD:/app -w /app python:3.12-slim sh -c "pip install -e .[test] && pytest"
```

Les tests qui échouent ici et passent en local : sensibilité à l'environnement.

#### Étape 5 — Run répété

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do pytest; done
```

Les tests qui flake (passent/échouent aléatoirement) : aléatoire ou timing.

### 7.2 — Tableau de classification

Pour chaque test "suspect" trouvé, classer la cause :

| Cause              | Indice                                            |
| ------------------ | ------------------------------------------------- |
| Ordre dépendant    | Échoue en `--randomly` ou reverse.                |
| Parallélisme       | Échoue uniquement en `-n auto`.                   |
| Filesystem partagé | Erreur "file exists" / "permission denied".       |
| DB partagée        | Unique constraint, foreign key error.             |
| Network            | Échoue sans wifi, timeout, 5xx.                   |
| Time-dependent     | Échec en heure pleine (DST), aux limites de date. |
| Env vars           | Variation entre `os.environ` local et CI.         |
| Locale             | Différences de format de nombre / date.           |
| Race condition     | Échec ~5 % du temps, parallèle.                   |

### 7.3 — Plan de remédiation

Pour chaque cause, prescrire un remède (section 6.1). Prioriser par **fréquence d'échec** et **temps d'analyse perdu**.

Documenter dans un fichier `TESTS_RELIABILITY.md` du projet.

---

## 8. Anti-patterns transverses

| Anti-pattern                                             | Conséquence                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Numéroter les tests pour forcer l'ordre.                 | Ordre implicite — moindre changement casse la chaîne.                        |
| Pas de **rollback DB** entre tests.                      | Lignes résiduelles, ordre dépendant.                                         |
| `os.environ` modifié sans cleanup.                       | Pollution croisée.                                                           |
| Cache module-level non resetté.                          | Premier test pollue les suivants.                                            |
| Réseau réel non mocké.                                   | Flake, lenteur, sensibilité aux APIs externes.                               |
| `time.sleep()` pour synchroniser des tests.              | Tests lents et fragiles. Mécanismes d'attente déterministes (events, mocks). |
| Test très long qui fait plusieurs setups.                | Difficile à isoler. Découper.                                                |
| Faire confiance à `randomized_seed=12345` sans vérifier. | Couvre un cas mais pas d'autres. Lancer avec **plusieurs seeds**.            |
| Pas de `parallel-safety` en CI.                          | CI lente, perd la confiance.                                                 |

---

## 9. Exercices pratiques

### Exercice 1 — Faire échouer une suite par l'ordre (≈ 30 min)

**Objectif.** Démontrer le couplage caché.

**Étapes :**

1. Sur sa propre suite, installer `pytest-randomly`.
2. Lancer 5 fois avec des seeds différentes (`pytest -p randomly --randomly-seed=N`).
3. Identifier les tests qui **réussissent en mode normal et échouent en mode randomisé**.
4. Pour chacun, identifier la cause.

**Livrable.** Tableau "test ↔ cause".

### Exercice 2 — Audit en parallèle (≈ 30 min)

**Objectif.** Démontrer le couplage parallèle.

**Étapes :**

1. Installer `pytest-xdist`.
2. Lancer `pytest -n auto`.
3. Identifier les échecs spécifiques au parallèle (souvent : file already exists, port in use, DB constraint).
4. Pour chacun, proposer une remédiation (tmp_path, port aléatoire, transaction).

**Livrable.** Liste annotée.

### Exercice 3 — Casser une dépendance cachée (≈ 60 min)

**Objectif.** Refactor un test fragile.

**Étapes :**

1. Identifier dans son projet un test qui :
   - Échoue en parallèle ou en ordre inversé.
2. Appliquer le pattern adapté (fixture rollback, tmp_path, monkeypatch, …).
3. Vérifier qu'il passe désormais dans toutes les configurations.

**Livrable.** Diff avant / après + commentaire.

### Exercice 4 — Tests sensibles au contexte (≈ 45 min)

**Objectif.** Catalogue cas dégradés.

Pour son projet, identifier des tests potentiellement sensibles à :

- Timezone.
- DST.
- Locale.
- Path separator.
- Précision flottante.

Pour chacun, vérifier le comportement et appliquer le remède (UTC interne, freeze_time, pathlib, approx).

**Livrable.** Liste annotée + 2-3 fixes.

### Exercice 5 — Audit complet (≈ 90 min)

**Objectif.** Méthode complète.

Sur une suite de 50+ tests :

1. Étapes 1-5 de la section 7.1.
2. Tableau de classification (section 7.2).
3. Plan de remédiation chiffré (combien de tests, quelles priorités).

**Livrable.** Note d'audit (1 page) + un `TESTS_RELIABILITY.md` du projet.

### Mini-défi — Reproductible en CI (≈ 60 min)

**Objectif.** Faire passer la même suite localement et en CI.

**Étapes :**

1. Dockerfile minimal (`python:3.12-slim`) qui installe les deps + lance pytest.
2. Comparer les résultats avec l'exécution locale.
3. Si différence : identifier la cause (locale, time zone, RAM, paquets manquants).
4. Fixer.

**Livrable.** Dockerfile + diff de causes identifiées.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Énoncer le **principe d'indépendance** et ses **3 propriétés** (order, parallel, repeatable).
- [ ] Citer **5 sources de couplage** (état partagé, fs, db, réseau, horloge).
- [ ] Donner pour chaque source un **pattern de remédiation**.
- [ ] Décrire **5 cas dégradés du contexte d'exécution** (timezone, DST, locale, casse fs, path separator, float precision).
- [ ] Citer **3 outils** pour faire émerger les dépendances cachées (`pytest-randomly`, `pytest-xdist`, reverse run).
- [ ] Utiliser **`tmp_path`** correctement.
- [ ] Utiliser **`monkeypatch`** pour env vars et attributs.
- [ ] Utiliser **`freezegun`** pour figer le temps.
- [ ] Configurer une **fixture autouse** pour reset un état global.
- [ ] Décrire le **rollback transactionnel** comme pattern de propreté DB.
- [ ] Suivre la **méthode d'audit 5 étapes** sur une suite donnée.

### Items du glossaire visés

**N3 atteint** :

- _réflexe de remettre son contexte à l'état initial (indépendance des tests)_ — sections 2, 6.
- _réflexe de penser aux cas dégradés liés au contexte d'exécution_ — section 4.

---

## 11. Ressources complémentaires

### Documentation

- [pytest fixtures](https://docs.pytest.org/en/stable/explanation/fixtures.html) — autouse, scopes.
- [pytest tmp_path](https://docs.pytest.org/en/stable/how-to/tmp_path.html).
- [pytest monkeypatch](https://docs.pytest.org/en/stable/how-to/monkeypatch.html).
- [pytest-xdist](https://pytest-xdist.readthedocs.io/) — parallélisme.
- [pytest-randomly](https://github.com/pytest-dev/pytest-randomly) — ordre aléatoire.

### Articles

- [Martin Fowler — Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html) — la référence.
- [Test Independence — xUnit Test Patterns](http://xunitpatterns.com/Independent%20Tests.html).
- [Why Test Order Should Be Random](https://www.benhoyt.com/writings/test-randomly/) — Ben Hoyt.

### Outils complémentaires

- [`responses`](https://github.com/getsentry/responses) — mock HTTP requests.
- [`respx`](https://lundberg.github.io/respx/) — mock httpx.
- [`freezegun`](https://github.com/spulec/freezegun) — figer le temps.
- [`time-machine`](https://github.com/adamchainz/time-machine) — alternative plus rapide à freezegun.
- [`testcontainers`](https://testcontainers-python.readthedocs.io/) — bases éphémères en Docker.
- [`moto`](https://docs.getmoto.org/) — mock AWS SDK.

### Pour aller plus loin

- **M5 (Pertinence)** — savoir où mettre les efforts d'isolation.
- **M6 (Coverage)** — coverage des cas dégradés du contexte.
- **M8 (Factorisation)** — réduire le risque de copier-coller fragile.
