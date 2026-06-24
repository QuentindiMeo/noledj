# M2 — Routage HTTP

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Déclarer des endpoints pour les verbes HTTP courants (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- Distinguer **path parameters**, **query parameters** et **request body**.
- Typer les paramètres pour profiter de la validation automatique.
- Définir le **status code** de la réponse.
- Lever des erreurs HTTP via `HTTPException`.
- Implémenter un **CRUD minimal en mémoire** combinant tous ces éléments.

## Durée estimée

0,5 à 1 jour.

## Pré-requis

- M1 terminé (FastAPI + Uvicorn opérationnels).

---

## 1. Les verbes HTTP

### Théorie

REST repose sur cinq verbes principaux :

| Verbe    | Usage                                     | Idempotent ?      | Body ?            |
| -------- | ----------------------------------------- | ----------------- | ----------------- |
| `GET`    | Lire une ressource                        | Oui               | Non               |
| `POST`   | Créer une ressource                       | Non               | Oui               |
| `PUT`    | Remplacer entièrement une ressource       | Oui               | Oui               |
| `PATCH`  | Mettre à jour partiellement une ressource | Non (typiquement) | Oui               |
| `DELETE` | Supprimer une ressource                   | Oui               | Non (typiquement) |

**Idempotent** = appeler la même requête N fois produit le même état que de l'appeler une fois. `GET /users/42` est idempotent (lire 5 fois ne change rien). `POST /users` ne l'est pas (créer 5 utilisateurs ≠ en créer 1).

**Analogie.** Un panneau d'affichage. `GET` = consulter une affiche. `POST` = ajouter une nouvelle affiche. `PUT` = remplacer une affiche entièrement. `PATCH` = corriger un détail. `DELETE` = retirer une affiche.

### Décorateurs FastAPI

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items")
def list_items(): ...

@app.post("/items")
def create_item(): ...

@app.put("/items/{id}")
def replace_item(id: int): ...

@app.patch("/items/{id}")
def update_item(id: int): ...

@app.delete("/items/{id}")
def delete_item(id: int): ...
```

Un décorateur par verbe. Chaque décorateur prend le **path** en argument positionnel.

---

## 2. Path parameters

### Théorie

Les **path parameters** sont les morceaux variables de l'URL. Ils identifient typiquement **la ressource** que l'on manipule.

```python
@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}
```

`{user_id}` dans le path se mappe automatiquement au paramètre `user_id` de la fonction. Le type (`int`) déclenche une validation : `/users/abc` renvoie une erreur 422 automatique.

**Analogie.** Le numéro d'appartement dans une adresse postale. C'est l'identité de la chose, pas une option dessus. `/users/42` parle de l'utilisateur 42 spécifiquement.

### Types supportés

```python
from enum import Enum

@app.get("/items/{item_id}")
def get_item(item_id: int): ...

@app.get("/users/{username}")
def get_user(username: str): ...

@app.get("/coords/{lat}/{lon}")
def get_point(lat: float, lon: float): ...

class Role(str, Enum):
    admin = "admin"
    user = "user"

@app.get("/roles/{role}")
def get_role(role: Role): ...
```

Les enums restreignent les valeurs autorisées — FastAPI rejette tout ce qui n'est pas dans l'enum, et Swagger UI affiche un dropdown.

### Path entiers (avec `/`)

`{path:path}` permet de capturer un path entier incluant des `/` :

```python
@app.get("/files/{file_path:path}")
def get_file(file_path: str):
    return {"path": file_path}

# GET /files/a/b/c.txt → file_path = "a/b/c.txt"
```

---

## 3. Query parameters

### Théorie

Les **query parameters** sont les paramètres après le `?` dans l'URL. Ils servent typiquement à **filtrer, paginer, ou affiner** la requête.

```python
@app.get("/items")
def list_items(skip: int = 0, limit: int = 100):
    return {"skip": skip, "limit": limit}

# GET /items?skip=10&limit=20
```

Les paramètres de la fonction qui ne sont **pas dans le path** sont interprétés comme query parameters. Une valeur par défaut les rend optionnels.

**Analogie.** Le path est l'adresse postale. Les query sont les instructions sur le bordereau de livraison : _fragile_, _à livrer avant 18h_, _porte de service_. Elles précisent comment ou quoi sélectionner, pas l'identité de la ressource.

### Types et valeurs

```python
@app.get("/search")
def search(
    q: str,                          # obligatoire (pas de default)
    limit: int = 10,                 # optionnel avec default
    sort: str | None = None,         # optionnel, défaut None
    active: bool = False,
):
    return {"q": q, "limit": limit, "sort": sort, "active": active}
```

FastAPI accepte plusieurs formats pour les booléens (`true`, `1`, `yes`, `on` → `True`) et les convertit automatiquement.

### Listes en query

```python
from typing import Annotated
from fastapi import Query

@app.get("/items")
def list_items(tags: Annotated[list[str], Query()] = []):
    return {"tags": tags}

# GET /items?tags=a&tags=b&tags=c  →  tags = ["a", "b", "c"]
```

`Query()` est nécessaire pour les types complexes (listes, options avancées). On l'utilise via `Annotated` (forme moderne recommandée depuis FastAPI 0.95).

### Validations avancées

```python
from typing import Annotated
from fastapi import Query

@app.get("/search")
def search(
    q: Annotated[str, Query(min_length=3, max_length=50, pattern="^[a-z]+$")],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
):
    return {"q": q, "limit": limit}
```

`min_length`, `max_length`, `pattern`, `ge` (≥), `le` (≤), `gt`, `lt` — toutes ces contraintes sont remontées dans Swagger UI et appliquées par FastAPI avant l'appel de la fonction.

---

## 4. Request body

### Théorie

Quand on envoie un body (POST / PUT / PATCH), FastAPI utilise **Pydantic** pour le parser et le valider. On déclare un modèle Pydantic et on l'utilise comme type d'un paramètre :

```python
from pydantic import BaseModel
from fastapi import FastAPI

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    in_stock: bool = True

@app.post("/items")
def create_item(item: Item):
    return {"created": item}
```

À l'appel `POST /items` avec body `{"name": "book", "price": 12.5}`, FastAPI :

1. Parse le JSON en `dict`.
2. Valide contre le modèle `Item` (types, champs obligatoires).
3. Instancie `item` et l'injecte dans la fonction.
4. En cas d'erreur, renvoie automatiquement une **422** avec le détail.

**Analogie.** Le body est le contenu d'un colis. Pydantic est le douanier : il vérifie que le contenu correspond bien à la déclaration en douane (le modèle) avant de le laisser passer.

Pydantic est approfondi en **M3**. Ici, on s'en sert juste pour pouvoir faire le CRUD.

### Combiner path + query + body

Une route peut combiner les trois sources :

```python
@app.put("/items/{item_id}")
def update_item(
    item_id: int,                       # path
    item: Item,                         # body (type Pydantic)
    notify: bool = False,               # query (type primitif avec default)
):
    return {"id": item_id, "item": item, "notify": notify}

# PUT /items/42?notify=true
# Body: {"name": "book", "price": 12.5}
```

FastAPI distingue les trois sources via la position dans le path et le type :

- Présent dans le path → **path parameter**.
- Type Pydantic (ou `BaseModel`) → **body**.
- Autre type (int, str, bool, float...) → **query parameter**.

---

## 5. Status codes et erreurs

### Définir le status code

```python
from fastapi import FastAPI, status

@app.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(item: Item):
    return item
```

Les codes courants sont accessibles via la constante `status.*` — plus lisible que les nombres bruts.

### Status codes REST courants

| Code | Nom                   | Quand l'utiliser                                                 |
| ---- | --------------------- | ---------------------------------------------------------------- |
| 200  | OK                    | Réponse standard pour `GET` / `PUT` / `PATCH` / `DELETE` réussis |
| 201  | Created               | Après un `POST` qui a créé une ressource                         |
| 204  | No Content            | Réponse réussie sans corps (typiquement `DELETE`)                |
| 400  | Bad Request           | Paramètres invalides hors validation Pydantic                    |
| 401  | Unauthorized          | Pas authentifié                                                  |
| 403  | Forbidden             | Authentifié mais sans droits                                     |
| 404  | Not Found             | Ressource inexistante                                            |
| 422  | Unprocessable Entity  | Validation FastAPI/Pydantic échouée (**automatique**)            |
| 500  | Internal Server Error | Exception non gérée (**automatique**)                            |

### Lever une erreur

```python
from fastapi import HTTPException

@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = db.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

`HTTPException` est l'idiome FastAPI pour signaler une erreur. Le `detail` est renvoyé dans le JSON de la réponse d'erreur. Approfondi en **M7** (handlers globaux, formats personnalisés).

---

## 6. CRUD minimal en mémoire

Tout ensemble — un CRUD complet d'articles, stocké dans un dict en mémoire.

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="Items CRUD")

# "Base de données" en mémoire
items_db: dict[int, "Item"] = {}
next_id: int = 1


class Item(BaseModel):
    name: str
    price: float
    in_stock: bool = True


@app.get("/items")
def list_items(in_stock: bool | None = None):
    items = items_db.values()
    if in_stock is not None:
        items = [i for i in items if i.in_stock == in_stock]
    return list(items)


@app.get("/items/{item_id}")
def get_item(item_id: int):
    item = items_db.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(item: Item):
    global next_id
    items_db[next_id] = item
    id_ = next_id
    next_id += 1
    return {"id": id_, **item.model_dump()}


@app.put("/items/{item_id}")
def replace_item(item_id: int, item: Item):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    items_db[item_id] = item
    return {"id": item_id, **item.model_dump()}


@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    del items_db[item_id]
```

À tester via Swagger UI sur `/docs` :

1. `POST /items` plusieurs fois pour créer.
2. `GET /items` pour lister, avec et sans `?in_stock=true`.
3. `GET /items/{id}` pour lire.
4. `PUT /items/{id}` pour remplacer.
5. `DELETE /items/{id}` pour supprimer.

Le code stocke dans un dict global — volontairement basique. La persistance arrive plus tard (M13).

---

## 7. Exercices pratiques

### Exercice 1 — GET avec path + query (≈ 20 min)

Implémenter `GET /products/{category}/{product_id}?fields=name,price` :

- `category` (path) : enum parmi `["books", "music", "games"]`.
- `product_id` (path) : `int`.
- `fields` (query) : optionnel, string CSV des champs à retourner.

Tester via Swagger UI : `category=invalid` doit renvoyer une 422.

### Exercice 2 — POST avec body (≈ 20 min)

Implémenter `POST /products` avec un body :

```json
{
  "name": "Book of Python",
  "price": 29.99,
  "category": "books"
}
```

Retourner `{"id": <int_généré>, ...body}` avec status 201. Vérifier qu'un body manquant `name` renvoie 422 automatiquement.

### Exercice 3 — PATCH partiel (≈ 25 min)

Implémenter `PATCH /products/{id}` qui accepte un body **avec tous les champs optionnels** :

```python
class ProductPatch(BaseModel):
    name: str | None = None
    price: float | None = None
    category: str | None = None
```

Ne mettre à jour que les champs présents (utiliser `.model_dump(exclude_unset=True)`). Comparer avec `PUT` qui remplace totalement.

### Exercice 4 — DELETE et status 204 (≈ 15 min)

Implémenter `DELETE /products/{id}` qui :

- Retourne **204 No Content** en cas de succès.
- Retourne **404** si l'id n'existe pas.

Vérifier qu'un DELETE sur un id inexistant ne change pas l'état du store.

### Exercice 5 — Filtrage combiné (≈ 30 min)

Implémenter `GET /products` avec :

- `category` (query) : optionnel, filtre par catégorie.
- `min_price`, `max_price` (query) : optionnels, filtre par fourchette de prix.
- `sort` (query) : enum `["name", "price"]`, défaut `"name"`.
- `limit` (query) : `int`, contrainte `Query(ge=1, le=100)`, défaut 10.

Tester avec plusieurs combinaisons depuis Swagger UI.

---

## 8. Mini-défi de synthèse (≈ 2 heures)

Implémenter un **CRUD complet** pour un domaine au choix (livres, tâches, contacts, recettes...) avec :

- 5 endpoints : `GET /<resource>`, `GET /<resource>/{id}`, `POST /<resource>`, `PUT /<resource>/{id}`, `DELETE /<resource>/{id}`.
- Un modèle Pydantic propre.
- Status codes appropriés (201 pour create, 204 pour delete).
- Au moins **2 query parameters de filtrage** sur le list endpoint.
- Validation des inputs (types + contraintes basiques via `Query()`).
- Gestion des **404** sur les ids inexistants.

**Validation** : tout doit être testable via Swagger UI. Documenter en README un cas d'erreur attendu par endpoint.

---

## 9. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant peut citer les 5 verbes HTTP principaux et leur sémantique REST.
- [ ] Il sait déclarer un path parameter typé et le valider automatiquement.
- [ ] Il sait déclarer un query parameter optionnel avec valeur par défaut.
- [ ] Il sait recevoir un body Pydantic dans une fonction.
- [ ] Il sait définir un status code via `status_code=...`.
- [ ] Il sait lever une `HTTPException` pour signaler une 404.
- [ ] Le CRUD minimal est implémenté et fonctionnel.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : décorateurs HTTP, path/query parameters, retourner du JSON (achevés).
- **N2** : déclarer un request body Pydantic (introduit, approfondi en M3).

---

## 10. Ressources complémentaires

- **Documentation FastAPI officielle** : sections _Path Parameters_, _Query Parameters_, _Request Body_ du _Tutorial - User Guide_ — couvre exactement ce module.
- **MDN HTTP methods** : [developer.mozilla.org/en-US/docs/Web/HTTP/Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods).
- **RFC 9110** — _HTTP Semantics_ — référence formelle des verbes et status codes.
