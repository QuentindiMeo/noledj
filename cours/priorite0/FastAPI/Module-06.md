# M6 — Injection de dépendances

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est l'**injection de dépendances** et pourquoi FastAPI la place au cœur de son design.
- Utiliser **`Depends()`** pour injecter une dépendance dans un endpoint.
- Chaîner des **sous-dépendances** (une dépendance qui en utilise d'autres).
- Écrire des **dépendances paramétrées** (classes, closures, factory).
- Utiliser des dépendances avec **`yield`** pour le setup + cleanup automatique (sessions DB, ressources).
- Appliquer une dépendance à un **endpoint**, un **router**, ou l'**app entière**.
- **Surcharger** une dépendance dans les tests.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M5 terminés.

---

## 1. Le concept — pourquoi l'injection de dépendances ?

### Le problème

Une fonction qui crée elle-même ses dépendances est difficile à tester et à maintenir :

```python
@app.get("/users/{id}")
def get_user(id: int):
    db = Database("postgresql://...")  # création interne, hardcodée
    user = db.fetch_user(id)
    db.close()
    return user
```

Trois problèmes :

1. **Couplage fort** : impossible de tester sans une vraie DB.
2. **Duplication** : la même création apparaîtra dans chaque endpoint.
3. **Cycle de vie** : ouvrir + fermer la connexion à chaque appel coûte cher.

### La solution

**Inverser le contrôle** : ce n'est plus la fonction qui crée ses dépendances, c'est le framework qui les lui fournit.

```python
@app.get("/users/{id}")
def get_user(id: int, db: Database = Depends(get_db)):
    return db.fetch_user(id)
```

FastAPI appelle `get_db()` au moment de la requête, injecte le résultat dans le paramètre `db`, et nettoie après la réponse.

**Analogie.** Un restaurant où le serveur t'apporte les couverts. Tu n'as pas à aller en cuisine — ils arrivent à ta table. Si le restaurant change de couverts (verres en métal au lieu de plastique), ta façon de manger ne change pas. **Le client est découplé du fournisseur** : il commande, il reçoit, sans connaître les détails.

### Trois bénéfices concrets

- **Testabilité** : on remplace la dépendance par un mock sans toucher au code de l'endpoint.
- **Réutilisation** : la même dépendance sert dans 50 endpoints sans copier-coller.
- **Composition** : une dépendance peut en utiliser d'autres (chaînage automatique).

---

## 2. `Depends()` — fondamentaux

### Syntaxe de base

Une dépendance est **n'importe quel callable** (fonction, classe, méthode) qui peut prendre des paramètres FastAPI :

```python
from fastapi import Depends

def common_pagination(skip: int = 0, limit: int = 10):
    return {"skip": skip, "limit": limit}


@app.get("/items")
def list_items(pagination: dict = Depends(common_pagination)):
    return pagination
```

À chaque appel `GET /items?skip=5&limit=20`, FastAPI :

1. Voit que `pagination` est un `Depends(common_pagination)`.
2. Lit `skip` et `limit` depuis la query string.
3. Appelle `common_pagination(skip=5, limit=20)`.
4. Injecte le résultat dans le paramètre `pagination`.

### Forme moderne avec `Annotated`

Depuis FastAPI 0.95, la forme préférée utilise `typing.Annotated` :

```python
from typing import Annotated
from fastapi import Depends

@app.get("/items")
def list_items(pagination: Annotated[dict, Depends(common_pagination)]):
    return pagination
```

L'avantage : on peut écrire `def list_items(p: Pagination)` une fois pour toutes en définissant `Pagination = Annotated[dict, Depends(common_pagination)]`, et la réutiliser.

```python
Pagination = Annotated[dict, Depends(common_pagination)]

@app.get("/items")
def list_items(p: Pagination): return p

@app.get("/users")
def list_users(p: Pagination): return p
```

---

## 3. Sous-dépendances et chaînage

### Une dépendance peut en utiliser d'autres

```python
def get_settings() -> Settings:
    return Settings()

def get_db(settings: Annotated[Settings, Depends(get_settings)]) -> Database:
    return Database(settings.database_url)

def get_user_repo(db: Annotated[Database, Depends(get_db)]) -> UserRepo:
    return UserRepo(db)


@app.get("/users/{id}")
def get_user(id: int, repo: Annotated[UserRepo, Depends(get_user_repo)]):
    return repo.find(id)
```

FastAPI **résout récursivement** la chaîne : pour fournir `repo`, il faut `get_user_repo`, qui demande `db`, qui demande `settings`. FastAPI orchestre tout, dans l'ordre.

### Cache de dépendances par requête

Dans une même requête, **la même dépendance n'est appelée qu'une fois** :

```python
@app.get("/items")
def list_items(
    p: Annotated[dict, Depends(common_pagination)],
    sort: Annotated[dict, Depends(common_pagination)],
):
    return p, sort   # mêmes valeurs, même appel sous le capot
```

`common_pagination` n'est exécuté qu'une seule fois pour cette requête, et le résultat est partagé. Si l'on veut désactiver ce cache pour une dépendance :

```python
Depends(common_pagination, use_cache=False)
```

---

## 4. Dépendances paramétrées — classes et closures

### Approche classe

Une classe avec `__call__` (ou même juste sa méthode `__init__`) peut servir de dépendance :

```python
class Paginator:
    def __init__(self, skip: int = 0, limit: int = 10):
        self.skip = skip
        self.limit = limit


@app.get("/items")
def list_items(p: Annotated[Paginator, Depends()]):
    return {"skip": p.skip, "limit": p.limit}
```

`Depends()` sans argument déduit la dépendance du type annoté (`Paginator`).

### Closure paramétrée (factory)

Quand on veut une dépendance dont la **configuration** change selon l'endpoint :

```python
def require_role(role: str):
    def checker(user: Annotated[User, Depends(get_current_user)]):
        if user.role != role:
            raise HTTPException(status_code=403, detail=f"Requires {role} role")
        return user
    return checker


@app.get("/admin/stats")
def admin_stats(user: Annotated[User, Depends(require_role("admin"))]):
    return {"admin": user.name}

@app.get("/manager/reports")
def manager_reports(user: Annotated[User, Depends(require_role("manager"))]):
    return {"manager": user.name}
```

`require_role` est une **factory** : appelée avec un paramètre (`"admin"`), elle renvoie une dépendance configurée. C'est le pattern à 3 niveaux qu'on a vu avec les décorateurs paramétrés (Python M6).

---

## 5. Dépendances avec `yield` — setup + cleanup

### Le pattern

Une dépendance peut utiliser `yield` au lieu de `return` pour exécuter du code **après la réponse** :

```python
def get_db():
    db = Database(settings.database_url)
    try:
        yield db
    finally:
        db.close()


@app.get("/users/{id}")
def get_user(id: int, db: Annotated[Database, Depends(get_db)]):
    return db.fetch_user(id)
```

Flux d'exécution :

1. **Avant l'endpoint** : `db = Database(...)`, puis `yield db`.
2. **L'endpoint s'exécute** avec `db` injecté.
3. **Après l'endpoint** : le code après `yield` (ici `db.close()`) s'exécute, même en cas d'exception.

**Analogie.** Le serveur apporte les couverts (setup), tu manges (endpoint), puis le serveur les ramasse (cleanup). Tu n'as jamais à débarrasser la table.

### Cas d'usage

- **Session de base de données** : ouvre une session, garantit la fermeture.
- **Connexion réseau / fichier** : libération propre.
- **Mutex / verrou applicatif** : acquisition + libération.
- **Trace / span** : démarrage + clôture pour observabilité.

### Exception et `yield`

Le code après `yield` s'exécute **même en cas d'exception** dans l'endpoint. Pour réagir spécifiquement à une exception, on peut capturer dans la dépendance :

```python
def get_db():
    db = Database(...)
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

---

## 6. Niveaux d'application : endpoint, router, app

### Niveau endpoint

L'usage le plus courant — on a vu les exemples précédents.

### Niveau router

Dans le décorateur d'`APIRouter`, on peut appliquer des dépendances à **toutes les routes** du router :

```python
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)
```

`require_admin` s'exécute avant chaque endpoint du router. Pas besoin d'injecter le résultat (on a juste besoin de l'effet de bord : lever une 401/403 si non admin).

### Niveau app

Pour appliquer à **toutes les routes** :

```python
app = FastAPI(dependencies=[Depends(log_request)])
```

Typiquement pour du logging global, du tracing, du rate limiting. À utiliser avec discernement — toute requête paie le coût de cette dépendance.

---

## 7. Quatre cas d'usage canoniques

### Cas 1 — Authentification

```python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    user = decode_jwt(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


@app.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
```

L'auth est approfondie en **M9**.

### Cas 2 — Session DB (avec cleanup)

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/users")
def list_users(db: Annotated[Session, Depends(get_db)]):
    return db.query(User).all()
```

### Cas 3 — Pagination réutilisable

```python
@dataclass
class Pagination:
    skip: int = 0
    limit: int = 10

def common_pagination(skip: int = 0, limit: int = Query(default=10, le=100)) -> Pagination:
    return Pagination(skip=skip, limit=limit)


@app.get("/items")
def list_items(p: Annotated[Pagination, Depends(common_pagination)]):
    return items[p.skip:p.skip + p.limit]
```

### Cas 4 — Settings (vu en M5)

```python
@app.get("/info")
def info(settings: Annotated[Settings, Depends(get_settings)]):
    return {"app": settings.app_name, "version": settings.version}
```

---

## 8. Surcharge pour les tests

### Le mécanisme

`app.dependency_overrides` permet de remplacer **toute dépendance** par une autre, le temps des tests :

```python
def fake_db():
    return InMemoryDatabase()

app.dependency_overrides[get_db] = fake_db

with TestClient(app) as client:
    response = client.get("/users")
    # utilise InMemoryDatabase au lieu de la vraie
```

### Bonnes pratiques

- Toujours définir les dépendances comme des **fonctions de top-level** (pas des lambdas) — sinon `app.dependency_overrides` ne peut pas les retrouver.
- Reset les overrides après chaque test : `app.dependency_overrides = {}` (ou utiliser un fixture pytest).
- L'override fonctionne récursivement : si `get_user_repo` dépend de `get_db`, surcharger `get_db` suffit.

---

## 9. Exercices pratiques

### Exercice 1 — Pagination réutilisable (≈ 20 min)

Implémenter `common_pagination(skip: int = 0, limit: int = Query(default=10, le=100))` et l'utiliser dans deux endpoints distincts (`/items`, `/users`). Vérifier qu'un `limit=200` renvoie 422.

### Exercice 2 — Factory de rôle (≈ 25 min)

Implémenter `require_role(role: str)` qui :

1. Récupère `get_current_user` (peut être stubbé pour cet exercice).
2. Vérifie que `user.role == role`, sinon lève 403.

L'utiliser sur trois endpoints exigeant trois rôles différents (`admin`, `manager`, `viewer`).

### Exercice 3 — Dépendance avec `yield` (≈ 25 min)

Écrire `get_db()` qui :

1. "Ouvre" une connexion (peut juste afficher `"open"` pour cet exercice).
2. `yield` un objet `db`.
3. "Ferme" la connexion dans `finally` (affiche `"close"`).

L'utiliser dans un endpoint. Vérifier que `open` et `close` apparaissent dans les logs **même** quand l'endpoint lève une exception.

### Exercice 4 — Chaînage de dépendances (≈ 30 min)

Construire la chaîne :

```
get_settings → get_db → get_user_repo → endpoint
```

Chaque dépendance n'utilise que la précédente. Vérifier que `get_settings` n'est appelé qu'une fois par requête, même si plusieurs dépendances en aval en ont besoin.

### Exercice 5 — Surcharge pour les tests (≈ 25 min)

Reprendre l'exercice 4. Écrire un test pytest qui :

1. Surcharge `get_settings` pour renvoyer une `Settings` de test.
2. Surcharge `get_db` pour renvoyer un mock.
3. Appelle l'endpoint via `TestClient`.
4. Vérifie que `get_user_repo` reçoit bien le mock — sans avoir à toucher au code de l'endpoint.

---

## 10. Mini-défi de synthèse (≈ 2 à 3 heures)

Concevoir un **système d'authentification réutilisable** complet :

**Dépendances** :

- `get_settings` — retourne `Settings` (M5).
- `get_db` — session DB avec `yield` + cleanup.
- `get_token_from_header` — lit `Authorization: Bearer ...` ou lève 401.
- `decode_token` — décode (stub pour l'instant) ou lève 401.
- `get_current_user(token)` — charge l'utilisateur depuis la DB.
- `get_current_active_user(user)` — vérifie `user.is_active`, sinon 403.
- `require_role(role: str)` — factory qui exige un rôle spécifique.

**Endpoints** :

- `GET /me` → user actuel (requiert `get_current_active_user`).
- `GET /admin/dashboard` → requiert `require_role("admin")`.
- `GET /public/ping` → pas d'auth.

**Tests** :

- 3 cas dans `TestClient` : sans token (401), token invalide (401), token valide non-admin sur `/admin/dashboard` (403), token valide admin (200).
- Toutes les dépendances DB et settings sont surchargées par des fakes.

**Validation** :

- [ ] Chaque dépendance fait **une seule chose** (single responsibility).
- [ ] Les dépendances s'enchaînent sans duplication de code.
- [ ] Les tests passent en utilisant `app.dependency_overrides` — aucun mock de bas niveau.

---

## 11. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant peut expliquer la DI en deux phrases avec une analogie.
- [ ] Il sait écrire une dépendance simple, paramétrée (factory), et avec `yield`.
- [ ] Il maîtrise la forme `Annotated[Type, Depends(...)]`.
- [ ] Il sait chaîner des dépendances et expliquer le cache par requête.
- [ ] Il sait appliquer une dépendance à un endpoint, un router ou l'app.
- [ ] Il utilise `app.dependency_overrides` dans les tests.
- [ ] Le mini-défi d'auth réutilisable est implémenté et testé.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : injection de dépendances avec `Depends`.
- **N3** (préfiguration) : scoping des dépendances (request-scoped, lifespan-scoped — approfondi au passage 2.5 → 3).

---

## 12. Ressources complémentaires

- **Documentation FastAPI** : _Dependencies_ (section entière du _Tutorial - User Guide_ et _Advanced User Guide_). Référence complète.
- **Documentation FastAPI** : _Dependencies with yield_ — pour les patterns setup/cleanup.
- **Documentation FastAPI** : _Testing Dependencies with Overrides_.
- **Real Python** — article _Dependency Injection with FastAPI_.
- **Pattern général** — Martin Fowler, _Inversion of Control Containers and the Dependency Injection pattern_ (article de 2004, toujours pertinent pour comprendre le concept).
