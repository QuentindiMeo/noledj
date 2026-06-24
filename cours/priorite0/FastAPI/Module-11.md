# M11 — Tests d'API

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser **`TestClient`** (Starlette) pour appeler son API sans serveur HTTP réel.
- Écrire des **fixtures pytest** réutilisables (app, client, DB de test, user authentifié).
- Tester un cycle complet **arrange / act / assert**.
- **Surcharger les dépendances** dans les tests (`app.dependency_overrides`).
- Tester un endpoint **authentifié** sans réseau.
- Connaître l'alternative **`httpx.AsyncClient`** pour les tests async natifs.
- Appliquer les **bonnes pratiques** (isolation, nommage, AAA).

## Durée estimée

0,75 jour.

## Pré-requis

- M1 à M10 terminés (M6 _Injection de dépendances_ est central).
- Parcours Tests unitaires niveau N2 recommandé en complément.

---

## 1. Pourquoi tester son API ?

### Quatre raisons concrètes

1. **Détecter les régressions** — toute modification non testée peut casser un comportement existant.
2. **Documenter le comportement attendu** — un test lit comme un contrat exécutable.
3. **Refactorer en confiance** — sans tests, un refactor demande de tout retester à la main.
4. **CI/CD viable** — la merge automatique repose sur le passage des tests.

**Analogie.** Les tests sont les radars de sécurité d'une route. Ils ne **font pas** rouler la voiture, mais ils détectent quand quelque chose dévie. Sans eux, on conduit à l'aveugle — chaque modification est un pari.

### Niveau de test couvert ici

| Type                  | Couverture                           | Outils              |
| --------------------- | ------------------------------------ | ------------------- |
| **Unitaire**          | Une fonction isolée                  | `pytest`            |
| **Intégration / API** | Un endpoint complet via HTTP factice | `TestClient`        |
| **End-to-end**        | Avec vrai serveur, vraie DB          | `httpx`, Playwright |

Ce module se concentre sur **les tests d'intégration au niveau API** — appeler les endpoints comme le ferait un client.

---

## 2. `TestClient` — fondamentaux

### Principe

`TestClient` est un client HTTP **synchrone** qui parle à l'app **directement en mémoire**, sans serveur réel. Il utilise le protocole ASGI sous le capot pour transmettre la requête à FastAPI exactement comme Uvicorn le ferait.

**Analogie.** Téléphoner depuis le bureau d'à côté plutôt que d'utiliser un téléphone public. La conversation est identique, mais sans détour par le réseau.

### Premier test

```python
# tests/test_health.py
from fastapi.testclient import TestClient
from my_api.main import app


def test_health_returns_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

Trois étapes (le pattern **AAA**) :

- **Arrange** : créer le client.
- **Act** : appeler l'endpoint.
- **Assert** : vérifier le résultat.

### Toutes les méthodes HTTP

```python
client.get("/users")
client.post("/users", json={"email": "a@b.c"})
client.put("/users/1", json={"email": "z@b.c"})
client.patch("/users/1", json={"active": True})
client.delete("/users/1")
```

Les méthodes acceptent les mêmes paramètres que `requests` ou `httpx` (`params=`, `headers=`, `cookies=`, `json=`, `data=`, `files=`).

### Inspecter la réponse

```python
response = client.get("/users/42")

response.status_code         # int
response.json()              # dict ou list
response.text                # str
response.headers             # dict insensible à la casse
response.cookies             # cookies
```

---

## 3. Fixtures pytest

### Pourquoi des fixtures

Sans fixtures, chaque test recrée son client, son app, sa DB. Code dupliqué, lent, et chaque test pollue les autres si la DB n'est pas isolée.

Les **fixtures** factorisent la mise en place. Elles sont injectées dans la signature du test, comme des dépendances FastAPI.

**Analogie.** Les ustensiles dressés sur la table avant un test de pâtisserie. Tu retrouves le four, le saladier, les œufs au même endroit pour chaque épreuve — sans devoir les chercher à chaque fois.

### Fixture `client` partagée

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from my_api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
```

Le `with TestClient(app)` déclenche les événements `startup` et `shutdown` de l'app — utile si l'app a des `lifespan events` (sujet du M13).

### Fixture pour DB de test isolée

```python
# tests/conftest.py
@pytest.fixture
def db():
    """Une DB en mémoire, neuve à chaque test."""
    fake_db = {}
    yield fake_db
    fake_db.clear()


@pytest.fixture
def client(db):
    """Client avec DB de test injectée."""
    from my_api.dependencies import get_db
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Pattern essentiel : **réinitialiser `dependency_overrides` après chaque test**, pour ne pas polluer les suivants.

### Scope des fixtures

```python
@pytest.fixture(scope="function")   # défaut — recréée à chaque test
@pytest.fixture(scope="class")      # une par classe
@pytest.fixture(scope="module")     # une par fichier
@pytest.fixture(scope="session")    # une pour toute la suite
```

Pour les ressources **lentes à créer** (vraie DB, conteneur Docker), utiliser `scope="session"` + un reset léger entre tests. Pour le code simple, garder le défaut `function`.

---

## 4. Tests sur un CRUD

### Exemple complet

```python
# tests/test_items.py
def test_create_item(client):
    payload = {"name": "Book", "price": 12.5, "in_stock": True}

    response = client.post("/items", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Book"
    assert data["price"] == 12.5
    assert "id" in data


def test_get_item_not_found(client):
    response = client.get("/items/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Item not found"


def test_list_items_returns_empty_initially(client):
    response = client.get("/items")
    assert response.status_code == 200
    assert response.json() == []


def test_full_crud_workflow(client):
    # Create
    create = client.post("/items", json={"name": "A", "price": 1.0})
    assert create.status_code == 201
    item_id = create.json()["id"]

    # Read
    get = client.get(f"/items/{item_id}")
    assert get.status_code == 200

    # Update
    put = client.put(f"/items/{item_id}", json={"name": "B", "price": 2.0})
    assert put.status_code == 200
    assert put.json()["name"] == "B"

    # Delete
    delete = client.delete(f"/items/{item_id}")
    assert delete.status_code == 204

    # Verify gone
    get_again = client.get(f"/items/{item_id}")
    assert get_again.status_code == 404
```

### Tester la validation

```python
def test_create_item_missing_field(client):
    response = client.post("/items", json={"price": 10})   # name manquant
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(e["loc"] == ["body", "name"] for e in errors)


def test_create_item_negative_price(client):
    response = client.post("/items", json={"name": "X", "price": -5})
    assert response.status_code == 422
```

Les 422 automatiques sont des **comportements documentés** — donc à tester.

---

## 5. Tester l'authentification

### Stratégie 1 — passer par le vrai flow

```python
def test_protected_route_requires_token(client):
    response = client.get("/me")
    assert response.status_code == 401


def test_protected_route_with_valid_token(client):
    # Login
    login = client.post(
        "/auth/login",
        data={"username": "alice", "password": "wonderland"},
    )
    token = login.json()["access_token"]

    # Use the token
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "alice"
```

Avantage : on teste le **flow complet** (login + accès).
Inconvénient : si chaque test reconnecte, c'est verbeux et lent.

### Stratégie 2 — surcharger `get_current_user`

```python
@pytest.fixture
def auth_client(client):
    from my_api.auth.dependencies import get_current_user

    fake_user = User(id=1, username="alice", role="user", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: fake_user

    yield client

    del app.dependency_overrides[get_current_user]


def test_me_returns_user(auth_client):
    response = auth_client.get("/me")
    assert response.status_code == 200
    assert response.json()["username"] == "alice"
```

Avantage : isole le test du flow auth (utile si on teste autre chose).
Inconvénient : on **suppose** que `get_current_user` marche — il faut le couvrir au moins une fois par un vrai test bout-en-bout (stratégie 1).

### Stratégie 3 — fixture qui produit un token valide

```python
@pytest.fixture
def auth_header(client):
    login = client.post(
        "/auth/login",
        data={"username": "alice", "password": "wonderland"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_me(client, auth_header):
    response = client.get("/me", headers=auth_header)
    assert response.status_code == 200
```

Compromis entre les deux précédentes : un vrai login (le flow auth est testé), un header réutilisable (pas de duplication).

---

## 6. Surcharger les dépendances

### Le mécanisme

`app.dependency_overrides` accepte une fonction de remplacement pour **toute** dépendance déclarée par `Depends(...)`. C'est le levier principal pour rendre l'app testable.

### Cas typiques

```python
# Settings de test
def fake_settings():
    return Settings(
        database_url="sqlite:///./test.db",
        jwt_secret="testsecret-for-tests-only",
    )

app.dependency_overrides[get_settings] = fake_settings


# DB en mémoire
def fake_db():
    return InMemoryDatabase()

app.dependency_overrides[get_db] = fake_db


# User authentifié
fake_user = User(id=1, username="test")
app.dependency_overrides[get_current_user] = lambda: fake_user
```

### Reset entre tests

Soit dans la fixture (`del app.dependency_overrides[get_db]`), soit globalement :

```python
@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    app.dependency_overrides.clear()
```

`autouse=True` applique la fixture à **tous** les tests automatiquement.

### Pourquoi pas mocker plus bas ?

Tentation : `unittest.mock.patch("my_api.repositories.user_repo.UserRepo.get")`. Ça fonctionne, mais :

- Couplage au chemin d'import (un refactor casse les tests).
- Moins lisible.
- Ne profite pas de la mécanique FastAPI.

`dependency_overrides` reste l'idiome — mocker à un niveau plus bas en dernier recours.

---

## 7. Tests async natifs (mention)

`TestClient` est synchrone — il enveloppe une boucle async en interne. Pour la plupart des cas, c'est suffisant.

Si l'on a besoin de tester explicitement des comportements async (concurrence, WebSocket, streaming), utiliser `httpx.AsyncClient` avec `pytest-asyncio` :

```python
import pytest
from httpx import AsyncClient, ASGITransport
from my_api.main import app


@pytest.mark.asyncio
async def test_async_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
```

À utiliser quand `TestClient` ne suffit pas — pour la majorité des cas, garder `TestClient` (plus simple).

---

## 8. Bonnes pratiques

### Nommage des tests

```
test_<sujet>_<contexte>_<résultat_attendu>
```

Exemples :

- `test_create_item_with_valid_payload_returns_201`.
- `test_get_item_when_missing_returns_404`.
- `test_login_with_invalid_credentials_returns_401`.

Lisibles, signifient l'intention sans lire le corps.

### Un test = un comportement

Un test qui vérifie 5 choses différentes est difficile à lire et à maintenir. Séparer.

```python
# ✗ Test qui fait trop de choses
def test_user_crud(client):
    ...   # create, read, update, delete, edge cases

# ✓ Tests focalisés
def test_create_user_returns_201(): ...
def test_get_user_returns_user(): ...
def test_update_user_modifies_email(): ...
def test_delete_user_removes_from_db(): ...
```

L'exception : un _workflow test_ (cf. test CRUD complet plus haut) reste utile pour vérifier le chaînage.

### Pas de logique dans les tests

```python
# ✗ if/for dans les tests
def test_users(client):
    for i in range(10):
        client.post("/users", json={"email": f"u{i}@a.b"})
    if response.status_code == 201: ...

# ✓ paramétrer ou séparer
@pytest.mark.parametrize("email", ["a@b.c", "x@y.z"])
def test_create_user_with_email(client, email):
    response = client.post("/users", json={"email": email})
    assert response.status_code == 201
```

`@pytest.mark.parametrize` permet de réutiliser un test sur plusieurs jeux de données sans copier-coller.

### Isolation entre tests

Chaque test doit pouvoir tourner **seul** et **dans n'importe quel ordre**. Si `test_b` exige que `test_a` ait laissé un user en DB, c'est une bombe à retardement.

Fixtures avec `scope="function"` + reset entre tests = isolation garantie.

### Cibler 80 % de couverture

Le 100 % est trop coûteux et donne de faux positifs (tests inutiles qui freinent les refactors). 80 % est un bon objectif :

- Tous les **endpoints heureux**.
- Tous les **endpoints malheureux** (4xx).
- Au moins 1 cas par **validator Pydantic**.
- Au moins 1 cas par **branche métier importante**.

Cf. Tests unitaires N3 — _quand améliorer le coverage_.

---

## 9. Exercices pratiques

### Exercice 1 — Premier test (≈ 15 min)

Sur un endpoint simple `GET /health`, écrire un test qui vérifie status 200 + body `{"status": "ok"}`.

Lancer `pytest` et vérifier la sortie.

### Exercice 2 — CRUD complet (≈ 45 min)

Reprendre le CRUD du M2 et écrire :

- Un test par opération CRUD (create, get, list, update, delete).
- Au moins 2 tests de cas d'erreur (404, 422).
- 1 test "workflow" qui chaîne create → read → update → delete.

Utiliser une fixture `client` partagée via `conftest.py`.

### Exercice 3 — Surcharge de DB (≈ 30 min)

Refactorer la fixture pour :

1. Créer une `InMemoryDatabase()` neuve à chaque test.
2. La surcharger via `app.dependency_overrides[get_db]`.
3. Vérifier qu'un test ne voit **pas** les données d'un autre.

Le pré-requis est d'avoir une dépendance `get_db` à surcharger — refactor à faire si nécessaire.

### Exercice 4 — Tester l'auth (≈ 35 min)

Sur le module auth du M9, écrire :

- `test_protected_route_no_token_returns_401`.
- `test_protected_route_invalid_token_returns_401`.
- `test_protected_route_valid_token_returns_200` (via stratégie 3 : fixture `auth_header`).
- `test_admin_route_with_user_role_returns_403`.

### Exercice 5 — Parametrize et coverage (≈ 25 min)

Écrire un test paramétré qui vérifie 5 inputs invalides du POST `/items` :

```python
@pytest.mark.parametrize("payload,expected_field", [
    ({}, "name"),
    ({"name": ""}, "name"),
    ({"name": "X"}, "price"),
    ({"name": "X", "price": -1}, "price"),
    ({"name": "X" * 1000, "price": 5}, "name"),
])
def test_create_item_invalid_payload(client, payload, expected_field):
    response = client.post("/items", json=payload)
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(expected_field in e["loc"] for e in errors)
```

Lancer `pytest --cov=my_api` (avec `pytest-cov`) et observer la couverture.

---

## 10. Mini-défi de synthèse (≈ 2 heures)

Reprendre le système d'auth du M9 + le CRUD du M2, et construire une **suite de tests d'intégration** :

**Coverage cible** : 80 % minimum (mesuré par `pytest --cov`).

**Tests d'auth** :

- Register → Login → Me → Refresh → Logout (workflow complet).
- Login avec mauvais password → 401, message générique (anti-énumération).
- Endpoint protégé sans token → 401.
- Endpoint protégé avec token expiré → 401.
- Endpoint `/admin/...` avec rôle `user` → 403.
- Endpoint `/admin/...` avec rôle `admin` → 200.

**Tests CRUD** :

- CRUD complet pour 1 ressource.
- 422 sur tous les validators Pydantic (au moins 1 cas par champ).
- 404 sur ressource absente.

**Fixtures partagées** :

- `client` — TestClient.
- `db` — DB en mémoire injectée via `dependency_overrides`.
- `user` — user authentifié injecté via `dependency_overrides`.
- `auth_header` — header `Authorization` valide.
- `admin_user` / `admin_header` — équivalents pour le rôle admin.

**Lancement** :

```bash
pytest --cov=my_api --cov-report=term-missing
```

**Validation** :

- [ ] `pytest` passe en moins de 10 s.
- [ ] Coverage ≥ 80 %.
- [ ] Aucun test ne pollue un autre (réordonner les tests doit donner le même résultat).
- [ ] Tous les noms de tests respectent `test_<sujet>_<contexte>_<résultat>`.

---

## 11. Auto-évaluation

Le module M11 est validé lorsque :

- [ ] L'apprenant peut écrire un test simple avec `TestClient` en moins de 5 minutes.
- [ ] Il sait isoler un test via `dependency_overrides`.
- [ ] Il écrit des fixtures partagées via `conftest.py`.
- [ ] Il maîtrise les 3 stratégies pour tester l'auth.
- [ ] Il utilise `@pytest.mark.parametrize` pour factoriser les cas.
- [ ] Il connaît le pattern AAA et le suit dans ses tests.
- [ ] Le mini-défi atteint 80 % de coverage avec une suite isolée et rapide.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : écrire des tests avec `TestClient` de Starlette et `pytest`.

---

## 12. Ressources complémentaires

- **Documentation FastAPI** : _Testing_ dans le _Tutorial - User Guide_ — référence officielle.
- **Documentation FastAPI** : _Testing Dependencies with Overrides_.
- **Documentation FastAPI** : _Async Tests_ — pour `httpx.AsyncClient`.
- **Documentation pytest** : [docs.pytest.org](https://docs.pytest.org).
- **pytest-cov** : pour la couverture de code.
- **pytest-asyncio** : pour les tests async natifs.
- **Real Python** — article _Effective Python Testing With Pytest_.
