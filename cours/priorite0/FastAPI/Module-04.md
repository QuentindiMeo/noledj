# M4 — Organisation modulaire

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser **`APIRouter`** pour regrouper des endpoints par domaine.
- Appliquer un `prefix`, des `tags` et des `dependencies` à un router entier.
- Organiser les routers dans une **structure de dossiers** cohérente.
- Combiner plusieurs routers via `app.include_router(...)`.
- Choisir une **stratégie de découpage** (par ressource, par feature, par couche).

## Durée estimée

0,5 à 0,75 jour.

## Pré-requis

- M1 à M3 terminés.

---

## 1. Le problème — pourquoi `APIRouter` ?

### Symptômes du `main.py` qui grossit

Un fichier `main.py` qui contient toutes les routes finit par ressembler à ceci :

```python
app = FastAPI()

@app.get("/users") ...
@app.post("/users") ...
@app.get("/users/{id}") ...
# ... 12 endpoints users

@app.get("/orders") ...
@app.post("/orders") ...
# ... 15 endpoints orders

@app.get("/products") ...
# ... 20 endpoints products
```

À 50 endpoints, naviguer dans le fichier devient pénible. À 200, c'est ingérable. La modification d'un endpoint touche un fichier que tout le monde modifie en parallèle → conflits Git fréquents.

**Analogie.** Une administration qui mettrait tous ses dossiers dans une seule armoire géante. Plus elle grossit, plus retrouver un document devient lent ; et deux employés qui veulent consulter en même temps se gênent. La solution : un classeur par service.

### La réponse FastAPI — `APIRouter`

`APIRouter` est l'équivalent FastAPI d'un sous-dossier d'administration : un ensemble d'endpoints liés, configurable indépendamment, qu'on intègre à l'app finale via `include_router`.

---

## 2. `APIRouter` — fondamentaux

### Syntaxe

```python
# src/my_api/routers/users.py
from fastapi import APIRouter

router = APIRouter()


@router.get("/users")
def list_users():
    return []

@router.post("/users")
def create_user():
    return {"id": 1}
```

L'API est strictement identique à celle de `FastAPI` (mêmes décorateurs `get/post/put/...`). Le router ne fait que **collecter** les routes ; il ne sert pas tout seul. Pour les exposer, on les attache à l'app :

```python
# src/my_api/main.py
from fastapi import FastAPI
from my_api.routers import users

app = FastAPI()
app.include_router(users.router)
```

`include_router` copie toutes les routes du router dans l'app principale, en préservant les décorations.

---

## 3. `prefix`, `tags`, `dependencies` — paramètres clés

### `prefix`

Plutôt que de répéter `/users` dans chaque décorateur, on factorise via le `prefix` :

```python
# src/my_api/routers/users.py
router = APIRouter(prefix="/users")

@router.get("")              # → GET /users
def list_users(): ...

@router.get("/{user_id}")    # → GET /users/{user_id}
def get_user(user_id: int): ...

@router.post("")             # → POST /users
def create_user(): ...
```

Le prefix s'applique à tous les paths du router. On peut le surcharger à l'inclusion :

```python
app.include_router(users.router, prefix="/api/v1/users")
# → /api/v1/users
```

C'est l'idiome pour versionner une API.

### `tags`

Les `tags` servent à grouper les endpoints dans Swagger UI :

```python
router = APIRouter(prefix="/users", tags=["users"])
```

Toutes les routes du router apparaîtront dans la section "users" de la doc. C'est cosmétique mais important : sans tags, la doc Swagger devient illisible passé une douzaine d'endpoints.

### `dependencies`

Pour appliquer une dépendance (auth, log, rate limit) à **toutes** les routes d'un router :

```python
from fastapi import APIRouter, Depends
from my_api.dependencies.auth import require_admin

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)
```

Toutes les routes du router exigeront un admin authentifié, sans avoir à le répéter dans chaque signature. Les dépendances sont approfondies en **M6**.

### `responses` — documenter les codes d'erreur communs

```python
router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={
        404: {"description": "User not found"},
        401: {"description": "Not authenticated"},
    },
)
```

Ces réponses sont documentées par défaut pour toutes les routes du router. Approfondi en M7.

---

## 4. Organisation par domaine

### Structure recommandée

```
src/my_api/
├── main.py
├── routers/
│   ├── __init__.py
│   ├── users.py
│   ├── orders.py
│   ├── products.py
│   └── auth.py
├── schemas/
│   ├── __init__.py
│   ├── user.py
│   └── order.py
├── models/
│   ├── __init__.py
│   └── user.py
├── services/
│   ├── __init__.py
│   └── user_service.py
└── dependencies/
    ├── __init__.py
    └── auth.py
```

**Routers** : un fichier par domaine métier. Chaque fichier expose un objet `router = APIRouter(...)`.

**Règle de symétrie** : pour chaque router, on retrouve souvent un fichier correspondant dans `schemas/`, `models/`, `services/`. Cette symétrie aide à naviguer.

### Exemple `users.py`

```python
# src/my_api/routers/users.py
from fastapi import APIRouter, HTTPException

from my_api.schemas.user import UserCreate, UserUpdate, UserOut
from my_api.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

# Instanciation simple — l'injection sera revue en M6
user_service = UserService()


@router.get("", response_model=list[UserOut])
def list_users(active_only: bool = False):
    return user_service.list(active_only=active_only)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int):
    user = user_service.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate):
    return user_service.create(payload)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate):
    user = user_service.update(user_id, payload)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int):
    if not user_service.delete(user_id):
        raise HTTPException(status_code=404, detail="User not found")
```

Le router porte **uniquement** la couche HTTP. La logique métier est dans `services/user_service.py`. Cette séparation est l'amorce d'une architecture en couches (couvert au parcours architecture hexagonale Senior).

---

## 5. `include_router` et hiérarchie

### Assemblage dans `main.py`

```python
# src/my_api/main.py
from fastapi import FastAPI

from my_api.routers import users, orders, products, auth

app = FastAPI(title="My API", version="0.1.0")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(products.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

L'ordre n'a aucun impact fonctionnel — il n'affecte que l'affichage dans Swagger UI.

### Routers imbriqués (rare mais utile)

Un router peut en inclure un autre, ce qui permet une hiérarchie :

```python
# src/my_api/routers/admin/__init__.py
from fastapi import APIRouter
from my_api.routers.admin import users as admin_users
from my_api.routers.admin import audit

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(admin_users.router)
admin_router.include_router(audit.router)

# Dans main.py :
# app.include_router(admin_router)
# → /admin/users/..., /admin/audit/...
```

À utiliser avec parcimonie : trop d'imbrication tue la lisibilité. Pour les grands projets, on préfère parfois plusieurs `app.include_router(... prefix="/v1/admin/...")` plats.

### Préfixage de version

Pour versionner l'API :

```python
v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(users.router)
v1_router.include_router(orders.router)

v2_router = APIRouter(prefix="/api/v2")
v2_router.include_router(users_v2.router)

app.include_router(v1_router)
app.include_router(v2_router)
```

L'API versionnée est approfondie au niveau Senior (`API versionnée maintenable` dans le glossaire).

---

## 6. Stratégies de découpage

Trois axes possibles. Aucun n'est universellement meilleur — c'est le contexte qui décide.

### Découpage par ressource (le défaut)

Un router = une ressource REST.

```
routers/
├── users.py
├── orders.py
├── products.py
```

**Avantages** : alignement direct avec la documentation OpenAPI / REST. Lecture intuitive.
**Inconvénients** : si une feature traverse plusieurs ressources, son code est éparpillé.

### Découpage par feature

Un router = une feature transverse.

```
routers/
├── checkout.py        # touche orders, products, payments
├── onboarding.py      # touche users, emails, billing
├── analytics.py
```

**Avantages** : un sujet métier, un fichier. Très bon pour les domaines complexes.
**Inconvénients** : l'API peut sembler moins "REST canonical" en surface.

### Découpage par couche

Plus rare. Plutôt qu'organiser le code par domaine, on l'organise par couche technique :

```
http/
├── handlers.py
└── middlewares.py
services/
└── ...
```

**Avantages** : bénéfique en architecture hexagonale.
**Inconvénients** : nécessite plus de discipline, courbe d'apprentissage.

### Heuristique de choix

- **Projet jeune, équipe petite** → par ressource (le plus simple).
- **Domaine métier riche, équipe organisée par feature** → par feature.
- **Projet visant une architecture hexagonale stricte** → par couche.

L'important : **cohérence**. Quel que soit le découpage choisi, tout le projet le suit.

---

## 7. Exercices pratiques

### Exercice 1 — Premier router (≈ 15 min)

Reprendre le `main.py` du CRUD M2 et le **refactorer** :

- Créer `src/<package>/routers/items.py` avec un `router = APIRouter(prefix="/items", tags=["items"])`.
- Déplacer toutes les routes `items` dedans.
- Dans `main.py`, ne garder que `app = FastAPI()` + `app.include_router(items.router)` + une route `/health` directe.

Lancer le serveur et vérifier que tout fonctionne comme avant. Constater la lisibilité de `main.py`.

### Exercice 2 — Tags et docs Swagger (≈ 10 min)

Ajouter `tags=["users"]`, `tags=["orders"]`, `tags=["products"]` à trois routers distincts. Ouvrir `/docs` et constater le regroupement.

**Bonus** : enrichir le tag avec une description via `openapi_tags` au niveau de l'app :

```python
app = FastAPI(
    openapi_tags=[
        {"name": "users", "description": "Gestion des utilisateurs"},
        {"name": "orders", "description": "Gestion des commandes"},
    ]
)
```

### Exercice 3 — Prefix et versioning (≈ 20 min)

Préfixer tous les routers par `/api/v1` au niveau de l'inclusion :

```python
app.include_router(users.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
```

Vérifier que toutes les routes commencent désormais par `/api/v1/`. Comparer cette approche avec un router global :

```python
v1 = APIRouter(prefix="/api/v1")
v1.include_router(users.router)
v1.include_router(orders.router)
app.include_router(v1)
```

Discuter laquelle est préférable selon le contexte.

### Exercice 4 — Refactor en domaines (≈ 45 min)

Concevoir une mini-API avec 3 domaines :

- **Users** : CRUD users.
- **Posts** : CRUD posts (avec un `author_id` faisant référence à un user).
- **Comments** : CRUD comments (avec un `post_id`).

Organiser :

```
src/blog_api/
├── main.py
├── routers/
│   ├── users.py
│   ├── posts.py
│   └── comments.py
└── schemas/
    ├── user.py
    ├── post.py
    └── comment.py
```

Chaque router a son `prefix`, ses `tags`. Vérifier la doc Swagger.

### Exercice 5 — Router avec dépendance globale (≈ 25 min)

Créer un router `admin.py` avec :

```python
def check_admin(x_admin_token: str | None = Header(default=None)):
    if x_admin_token != "secret":
        raise HTTPException(status_code=403, detail="Admin only")

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(check_admin)],
)
```

Ajouter quelques routes (`GET /admin/stats`, `POST /admin/maintenance`). Vérifier qu'elles renvoient toutes 403 sans header, 200 avec `X-Admin-Token: secret`.

`Depends` et `Header` sont approfondis en M6 — l'objectif ici est seulement d'observer l'effet de `dependencies` sur un router entier.

---

## 8. Mini-défi de synthèse (≈ 2 heures)

Construire une **API de bibliothèque** complète :

**Domaines** :

- `books` : CRUD livres.
- `authors` : CRUD auteurs.
- `loans` : emprunts (POST création, GET liste, PATCH pour rendre).

**Organisation imposée** :

```
src/library_api/
├── main.py
├── routers/
│   ├── __init__.py
│   ├── books.py
│   ├── authors.py
│   └── loans.py
├── schemas/
│   ├── __init__.py
│   ├── book.py
│   ├── author.py
│   └── loan.py
└── services/
    ├── __init__.py
    ├── book_service.py
    ├── author_service.py
    └── loan_service.py
```

**Contraintes** :

- Chaque router porte uniquement la couche HTTP — toute logique métier dans `services/`.
- Tous les endpoints sont préfixés `/api/v1`.
- Tags distincts par domaine.
- Stockage en mémoire (dicts) dans les services.
- `response_model` partout (cf. M3).
- `main.py` ne dépasse pas 20 lignes (instanciation + inclusions + 1 route `/health`).

---

## 9. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant peut décrire le rôle de `APIRouter` en deux phrases.
- [ ] Il utilise `prefix`, `tags` sur tout router non trivial.
- [ ] Il sait appliquer une dépendance globale à un router via `dependencies=[Depends(...)]`.
- [ ] Il sait préfixer une API par version (`/api/v1/...`).
- [ ] Il organise son projet en `routers/`, `schemas/`, `services/` séparés.
- [ ] Le `main.py` se limite à l'instanciation et aux `include_router`.
- [ ] Le mini-défi _library_api_ est implémenté et respecte les contraintes.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : organiser ses routes avec `APIRouter` pour structurer son projet en modules.

---

## 10. Ressources complémentaires

- **Documentation FastAPI** : section _Bigger Applications - Multiple Files_ du _Tutorial - User Guide_ — couvre exactement ce module.
- **Documentation FastAPI** : _Metadata and Docs URLs_ — pour aller plus loin sur `openapi_tags`, `summary`, `description`.
- **Real Python** — article _Build and Secure a FastAPI Application with Multiple Routers_.
