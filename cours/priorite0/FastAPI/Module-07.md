# M7 — Gestion des erreurs

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser **`HTTPException`** pour signaler des erreurs HTTP standard.
- Comprendre le format **422** produit par Pydantic et le personnaliser.
- Écrire des **exception handlers globaux** via `@app.exception_handler(...)`.
- Implémenter un **format de réponse d'erreur unifié** pour toute l'API.
- Distinguer **erreurs métier** (4xx, prévisibles) et **erreurs techniques** (5xx, à logger).
- Convertir des **exceptions métier** en réponses HTTP propres à la frontière.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M6 terminés.

---

## 1. Pourquoi gérer les erreurs proprement ?

### Sans plan, c'est l'anarchie

Une API qui renvoie :

- Un `dict` pour certaines erreurs, une `str` pour d'autres, du HTML pour d'autres encore.
- Des messages d'erreur internes (stack trace, noms de tables) en clair.
- Des status codes incohérents (400 pour du `not found`, 500 pour du `forbidden`).

… est un cauchemar pour le front-end qui doit consommer cette API. Chaque endpoint impose son propre format → multiplication de code conditionnel côté client.

**Analogie.** Un service après-vente où chaque guichet utilise un formulaire différent. Le client doit s'adapter à chaque fois. Avec un **formulaire unifié**, il sait quoi attendre — peu importe le guichet.

### L'objectif

Trois règles à viser pour une API mûre :

1. **Un format de réponse d'erreur unifié** — toute erreur a la même structure JSON.
2. **Pas de fuite d'information interne** — ni stack trace, ni détails d'implémentation en prod.
3. **Status codes cohérents** — 404 pour ressource absente, 403 pour droits manquants, 422 pour validation, 500 pour exception non gérée.

---

## 2. `HTTPException` — l'idiome FastAPI

### Théorie

`HTTPException` est la manière idiomatique de signaler une erreur HTTP dans un endpoint :

```python
from fastapi import HTTPException

@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = db.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

FastAPI attrape l'exception, formate une réponse JSON :

```json
{ "detail": "User not found" }
```

… et renvoie le status code spécifié. Pas besoin d'`if/else` ni de `return`.

### Avec contexte

`detail` peut être un dict, pas seulement une string :

```python
raise HTTPException(
    status_code=404,
    detail={
        "error": "user_not_found",
        "user_id": user_id,
        "hint": "Vérifier l'identifiant",
    },
)
```

Permet d'envoyer un code d'erreur métier en plus du message, utile pour que le front fasse du routage logique sur la réponse.

### Headers personnalisés

```python
raise HTTPException(
    status_code=401,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)
```

Indispensable pour certains scénarios (auth Basic, rate limiting avec `Retry-After`, etc.).

---

## 3. Erreurs Pydantic (422) — comprendre et personnaliser

### Le format par défaut

Quand la validation Pydantic échoue, FastAPI renvoie automatiquement une **422 Unprocessable Entity** avec un détail précis :

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "email"],
      "msg": "Field required",
      "input": { "name": "Alice" }
    },
    {
      "type": "value_error",
      "loc": ["body", "age"],
      "msg": "Value error, age must be >= 13",
      "input": 12
    }
  ]
}
```

Chaque erreur indique :

- **`type`** : type technique de l'erreur (missing, value_error, type_error...).
- **`loc`** : où se trouve l'erreur (body / query / path + nom du champ).
- **`msg`** : message lisible.
- **`input`** : valeur reçue (utile pour debugger côté client).

### Personnaliser le format 422

Si l'on veut un format différent (par exemple aligné avec un format maison), on écrit un handler pour `RequestValidationError` :

```python
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI()


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error_code": "validation_error",
            "message": "La requête contient des données invalides.",
            "fields": [
                {
                    "path": ".".join(str(p) for p in err["loc"]),
                    "issue": err["msg"],
                }
                for err in exc.errors()
            ],
        },
    )
```

Désormais, toutes les erreurs Pydantic renvoient une structure homogène avec un `error_code` lisible et une liste d'erreurs simplifiée.

---

## 4. Exception handlers globaux

### Le mécanisme

`@app.exception_handler(ExceptionType)` enregistre un handler appelé chaque fois qu'une exception de ce type (ou de ses sous-types) remonte sans être gérée.

```python
class UserNotFoundError(Exception):
    def __init__(self, user_id: int):
        self.user_id = user_id


@app.exception_handler(UserNotFoundError)
async def user_not_found_handler(request: Request, exc: UserNotFoundError):
    return JSONResponse(
        status_code=404,
        content={
            "error_code": "user_not_found",
            "message": f"User {exc.user_id} not found.",
        },
    )


@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = db.get(user_id)
    if user is None:
        raise UserNotFoundError(user_id)   # ← exception métier
    return user
```

**Bénéfice** : la couche métier (`service`, `repo`) lève des **exceptions métier** (vocabulaire du domaine), et la couche HTTP (le handler) les **traduit** en réponses propres. Le service ne dépend pas de FastAPI.

**Analogie.** Le bureau des plaintes d'une administration. Toutes les remontées arrivent là, et on décide d'un formulaire de réponse unifié — sans que les services internes (compta, RH) aient à connaître ce formulaire.

### Ordre de résolution

FastAPI matche le **type le plus spécifique d'abord**. Si on a un handler pour `Exception` (catch-all) et un pour `UserNotFoundError`, le second gagne pour un `UserNotFoundError`.

### `HTTPException` est aussi catchable

```python
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": "http_error",
            "message": exc.detail,
            "status_code": exc.status_code,
        },
    )
```

Permet d'**uniformiser** le format de toutes les `HTTPException` levées par les endpoints — sans changer leur signature.

> Note : utiliser `starlette.exceptions.HTTPException` (le parent), pas `fastapi.HTTPException` (l'enfant), pour intercepter aussi les exceptions levées en interne par FastAPI.

---

## 5. Format de réponse unifié

### Choisir un schéma

Quelques formats répandus dans l'industrie :

**Format simple FastAPI par défaut** :

```json
{ "detail": "User not found" }
```

**Format RFC 7807 (Problem Details for HTTP APIs)** — standard JSON pour exposer une erreur :

```json
{
  "type": "https://api.example.com/errors/user-not-found",
  "title": "User not found",
  "status": 404,
  "detail": "User 42 does not exist.",
  "instance": "/users/42"
}
```

**Format maison** :

```json
{
  "error_code": "user_not_found",
  "message": "User 42 not found.",
  "status_code": 404,
  "request_id": "req-abc123"
}
```

L'important n'est pas le format choisi, c'est qu'il soit **stable** sur toute l'API.

### Implémentation maison

```python
from pydantic import BaseModel

class ErrorResponse(BaseModel):
    error_code: str
    message: str
    status_code: int
    request_id: str | None = None
    extra: dict | None = None


def make_error(
    *, code: str, message: str, status: int, extra: dict | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(
            error_code=code,
            message=message,
            status_code=status,
            extra=extra,
        ).model_dump(exclude_none=True),
    )


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return make_error(
        code="http_error",
        message=exc.detail,
        status=exc.status_code,
    )
```

Une seule fonction `make_error` partout : impossible d'avoir un format divergent.

---

## 6. Erreurs métier vs erreurs techniques

### Théorie

Deux classes d'erreurs à distinguer clairement :

| Type                | Status                       | Sémantique                                              | Loggage                        |
| ------------------- | ---------------------------- | ------------------------------------------------------- | ------------------------------ |
| **Métier (4xx)**    | 400, 401, 403, 404, 409, 422 | Prévisible. Le client a fait quelque chose d'inattendu. | INFO/WARN, pas de stack trace. |
| **Technique (5xx)** | 500, 502, 503, 504           | Imprévu. Bug ou panne.                                  | ERROR + stack trace complète.  |

### Implémentation

```python
import logging
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        logger.error("HTTP %d on %s: %s", exc.status_code, request.url, exc.detail)
    else:
        logger.info("HTTP %d on %s", exc.status_code, request.url)
    return make_error(code="http_error", message=exc.detail, status=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s", request.url)
    return make_error(
        code="internal_server_error",
        message="An unexpected error occurred.",
        status=500,
    )
```

Le handler `Exception` est le **filet de sécurité** : aucune exception ne fuit en clair vers le client. La stack trace est loggée côté serveur, le client voit un message générique.

### Anti-pattern à éviter

```python
# ✗ NE PAS FAIRE
@app.exception_handler(Exception)
async def bad_handler(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc), "traceback": traceback.format_exc()})
```

Exposer une stack trace au client est une **fuite d'information sécuritaire** (chemins de fichiers, noms de classes internes, parfois données sensibles).

---

## 7. Exercices pratiques

### Exercice 1 — `HTTPException` propre (≈ 15 min)

Refactorer le CRUD du M2 pour que tous les `404` (ressource absente) utilisent `HTTPException(status_code=404, detail=...)`. Ajouter un détail riche : `{"error": "item_not_found", "item_id": id}`.

Tester via Swagger UI que la réponse est bien formatée.

### Exercice 2 — Personnaliser les 422 Pydantic (≈ 25 min)

Écrire un handler pour `RequestValidationError` qui transforme le format par défaut en :

```json
{
  "error_code": "validation_error",
  "message": "Invalid input.",
  "fields": [{ "path": "body.email", "issue": "field required" }]
}
```

Tester avec un POST manquant un champ obligatoire.

### Exercice 3 — Exception métier custom (≈ 25 min)

Créer une exception `UserNotFoundError(user_id: int)` et un handler global qui :

1. Renvoie 404.
2. Utilise le format unifié.
3. Inclut `user_id` dans le détail.

Faire en sorte que le service métier (`user_service.get(id)`) lève `UserNotFoundError`, et que la couche HTTP n'attrape rien (l'exception remonte naturellement au handler).

### Exercice 4 — Filet de sécurité 500 (≈ 20 min)

Ajouter un handler global pour `Exception` qui :

1. Loggue la stack trace côté serveur.
2. Renvoie un message générique côté client (`{"error_code": "internal_server_error", "message": "..."}`).
3. Renvoie 500.

Provoquer un `1 / 0` dans un endpoint pour tester. Vérifier qu'aucune info sensible ne fuit dans la réponse.

### Exercice 5 — Helper `make_error` (≈ 20 min)

Implémenter la fonction `make_error(code, message, status, extra=None)` introduite en section 5. La réutiliser dans tous les handlers et dans 3-4 endpoints qui levaient des `HTTPException` manuellement.

Vérifier que **toutes** les réponses d'erreur de l'API ont désormais exactement la même structure (`error_code`, `message`, `status_code`, éventuellement `extra`).

---

## 8. Mini-défi de synthèse (≈ 1,5 à 2 heures)

Reprendre une API existante (le CRUD M2 ou le système d'auth M6) et lui ajouter un **système d'erreurs complet** :

**Structure d'erreur unifiée** :

```json
{
  "error_code": "snake_case_identifier",
  "message": "Human-readable message.",
  "status_code": 400,
  "request_id": "req-xyz",
  "details": { "any": "extra context" }
}
```

**Au moins 3 exceptions métier** :

- `ResourceNotFoundError(resource: str, id: Any)` → 404.
- `ConflictError(message: str)` → 409 (par exemple email déjà utilisé).
- `BusinessRuleViolation(rule: str, message: str)` → 422.

**Handlers globaux** :

- `RequestValidationError` → format `error_code: "validation_error"`.
- `StarletteHTTPException` → reformaté en `error_code`.
- Les 3 exceptions métier ci-dessus → handlers dédiés.
- `Exception` (catch-all) → 500, log stack trace, message générique.

**Tests** :

- Un test par type d'erreur, vérifiant le status code et le format de réponse.
- Un test qui provoque un crash interne (`1/0`) et vérifie que la stack trace n'apparaît pas dans la réponse client.

**Critères de validation** :

- [ ] Aucune réponse d'erreur de l'API ne diverge du format unifié.
- [ ] Aucune stack trace n'apparaît côté client.
- [ ] Les exceptions métier sont déclenchées par la couche service (pas par les routers).
- [ ] Un handler par type d'erreur — pas d'`if status_code == X:` éparpillés.

---

## 9. Auto-évaluation

Le module M7 est validé lorsque :

- [ ] L'apprenant peut citer 4 status codes 4xx et leur sémantique.
- [ ] Il utilise `HTTPException` avec `detail` riche dans ses endpoints.
- [ ] Il sait personnaliser le format 422 via `RequestValidationError`.
- [ ] Il écrit des exceptions métier et leurs handlers globaux.
- [ ] Il distingue logging INFO/WARN (erreurs métier) vs ERROR + stack trace (erreurs techniques).
- [ ] Il a un handler catch-all `Exception` qui ne fuit pas d'info sensible.
- [ ] Le mini-défi respecte tous les critères de validation.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : gestion des erreurs via `HTTPException` et `exception handlers` personnalisés.

---

## 10. Ressources complémentaires

- **Documentation FastAPI** : _Handling Errors_ dans le _Tutorial - User Guide_ — couvre `HTTPException` et `@app.exception_handler`.
- **Documentation FastAPI** : _Custom Request and APIRoute class_ (avancé) — pour intercepter avant même le routage.
- **RFC 7807** — _Problem Details for HTTP APIs_ — le standard d'erreur JSON, à connaître même si on choisit un autre format.
- **Real Python** — article _Handling Exceptions in Python Effectively_ (concepts généraux, pas FastAPI-spécifique).
