# M3 — Validation avec Pydantic

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir des modèles `BaseModel` Pydantic v2 avec types riches.
- Configurer un champ via **`Field()`** (contraintes, description, exemples).
- Écrire des **validators** custom (`@field_validator`, `@model_validator`).
- Gérer des **modèles imbriqués** et des listes.
- Concevoir des **schémas In/Out séparés** (`UserCreate`, `UserUpdate`, `UserOut`).
- Contrôler la sortie d'un endpoint via **`response_model`**.

## Durée estimée

1 jour.

## Pré-requis

- M1 et M2 terminés.
- Parcours Python M4 (dataclasses, typing) recommandé.

---

## 1. Pourquoi Pydantic ?

### Le problème pré-Pydantic

Sans Pydantic, valider un body JSON en Python signifie :

1. Parser le JSON.
2. Vérifier la présence de chaque champ.
3. Vérifier les types.
4. Vérifier les contraintes (longueur, range...).
5. Renvoyer des erreurs cohérentes.

Du code répétitif, source de bugs, dupliquant l'information entre la documentation et le code.

### L'approche Pydantic

Pydantic part d'une autre idée : **on définit le modèle une fois (en Python), et tout en découle** — validation, sérialisation, documentation OpenAPI, autocomplétion IDE.

**Analogie.** Un moule à biscuit. Le moule fixe la forme — si la pâte ne rentre pas, on la rejette. Le moule est aussi la spécification du biscuit final : à partir de lui, on peut imprimer une fiche produit. **Un seul artefact** sert à valider, documenter et sérialiser.

### Pydantic v1 vs v2

Pydantic v2 (sorti en 2023) est largement réécrit en Rust : 10× à 50× plus rapide que v1, et avec une API plus claire. FastAPI le supporte nativement depuis sa version 0.100. Toujours préférer Pydantic v2 pour un nouveau projet.

Les syntaxes diffèrent sur certains points (`dict()` → `model_dump()`, `parse_obj()` → `model_validate()`). Tout ce module utilise la syntaxe v2.

---

## 2. `BaseModel` — les fondamentaux

### Définition et instanciation

```python
from pydantic import BaseModel
from datetime import datetime

class User(BaseModel):
    id: int
    email: str
    is_active: bool = True
    created_at: datetime


u = User(id=1, email="a@b.c", created_at=datetime.now())
print(u.email)                  # a@b.c
print(u.model_dump())           # dict Python
print(u.model_dump_json())      # str JSON
```

### Validation automatique

```python
User(id="not an int", email="a@b.c", created_at=datetime.now())
# pydantic.ValidationError: Input should be a valid integer ...
```

Pydantic tente aussi des conversions raisonnables (str `"123"` → int `123`, str ISO → `datetime`). On peut désactiver cette permissivité via `model_config` si l'on veut un mode strict :

```python
from pydantic import BaseModel, ConfigDict

class StrictUser(BaseModel):
    model_config = ConfigDict(strict=True)
    id: int
```

### Méthodes utiles (Pydantic v2)

| Méthode                                | Rôle                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `obj.model_dump()`                     | → `dict` Python                                                             |
| `obj.model_dump_json()`                | → `str` JSON                                                                |
| `obj.model_dump(exclude_unset=True)`   | Inclut seulement les champs explicitement fournis (utile pour PATCH)        |
| `obj.model_dump(exclude={"password"})` | Exclut des champs nommés                                                    |
| `Cls.model_validate(data)`             | Construit depuis un `dict` ou un objet (équivalent de l'ancien `parse_obj`) |
| `Cls.model_json_schema()`              | Schéma JSON Schema (utilisé par OpenAPI)                                    |

---

## 3. Types courants

### Types Python standards

```python
from datetime import datetime, date, time, timedelta
from uuid import UUID
from decimal import Decimal
from enum import Enum

class Demo(BaseModel):
    id: UUID
    when: datetime
    duration: timedelta
    price: Decimal
    tags: list[str]
    metadata: dict[str, str]
    optional_note: str | None = None
```

### Types Pydantic spécialisés

```python
from pydantic import BaseModel, EmailStr, HttpUrl, IPvAnyAddress, SecretStr

class Account(BaseModel):
    email: EmailStr            # nécessite "email-validator" : pip install email-validator
    website: HttpUrl
    ip: IPvAnyAddress
    password: SecretStr        # masqué dans __repr__
```

- **`EmailStr`** valide la syntaxe d'un email.
- **`HttpUrl`** valide qu'il s'agit bien d'une URL HTTP/HTTPS.
- **`IPvAnyAddress`** accepte IPv4 et IPv6.
- **`SecretStr`** masque la valeur dans la représentation (`repr`) et la sérialisation par défaut.

### Enums

```python
from enum import Enum

class Role(str, Enum):
    admin = "admin"
    user = "user"
    guest = "guest"


class Account(BaseModel):
    role: Role


Account(role="admin")        # ✓
Account(role="superuser")    # ✗ ValidationError
```

L'héritage de `str` est important : il rend l'enum sérialisable proprement en JSON.

---

## 4. `Field()` — contraintes et métadonnées

### Théorie

`Field()` permet d'ajouter des **contraintes** et des **métadonnées** à un champ :

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Nom du produit")
    price: float = Field(..., gt=0, description="Prix en EUR")
    stock: int = Field(default=0, ge=0)
    sku: str = Field(..., pattern=r"^[A-Z]{3}-\d{4}$", examples=["ABC-1234"])
```

`...` (Ellipsis) marque un champ **obligatoire** sans valeur par défaut. Sans default explicite, c'est implicite, mais `...` rend l'intention claire.

**Analogie.** `Field()` ajoute des marqueurs au moule à biscuit : épaisseur minimale, motif imposé, étiquette imprimée. Le moule sans `Field()` accepte toute pâte dans la bonne forme ; avec `Field()`, il vérifie aussi les dimensions et applique l'étiquette.

### Contraintes courantes

| Contrainte                 | Type ciblé            | Effet                                        |
| -------------------------- | --------------------- | -------------------------------------------- |
| `min_length`, `max_length` | `str`, `list`, `dict` | Longueur                                     |
| `gt`, `ge`, `lt`, `le`     | nombres               | Comparaisons                                 |
| `multiple_of`              | nombres               | Multiple de N                                |
| `pattern`                  | `str`                 | Regex                                        |
| `default_factory`          | tout                  | Factory pour valeur par défaut (mutables OK) |

### Métadonnées (alimentent Swagger UI)

```python
class Product(BaseModel):
    name: str = Field(
        ...,
        description="Nom commercial",
        examples=["Brique de lait", "Pain de mie"],
        title="Product name",
    )
```

Toutes ces métadonnées remontent dans la documentation OpenAPI — pas besoin de duplication.

---

## 5. Validators — règles métier

### `@field_validator` — un champ à la fois

```python
from pydantic import BaseModel, field_validator

class User(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def username_must_be_lowercase(cls, v: str) -> str:
        if v != v.lower():
            raise ValueError("username must be lowercase")
        return v
```

Règles :

- Le validator est une **`@classmethod`**.
- Il **reçoit la valeur** et la renvoie (possiblement modifiée).
- Lever **`ValueError`** pour signaler l'invalidité — Pydantic l'enrobera en `ValidationError`.

### `@model_validator(mode="after")` — règles cross-fields

```python
from pydantic import BaseModel, model_validator

class Signup(BaseModel):
    password: str
    password_confirm: str

    @model_validator(mode="after")
    def passwords_match(self) -> "Signup":
        if self.password != self.password_confirm:
            raise ValueError("passwords do not match")
        return self
```

`mode="after"` (le défaut) : appelé une fois tous les champs parsés. Il reçoit `self` directement.

`mode="before"` : appelé avant le parsing des champs (sur le dict brut). Utile pour normaliser ou transformer la structure entrante.

### Validation et modification

Les validators peuvent transformer la valeur, pas seulement valider :

```python
class Article(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def strip_and_capitalize(cls, v: str) -> str:
        return v.strip().capitalize()


a = Article(title="  hello world  ")
print(a.title)   # "Hello world"
```

---

## 6. Modèles imbriqués

### Théorie

Pydantic parse **récursivement** les structures imbriquées :

```python
class Address(BaseModel):
    street: str
    city: str
    country: str

class User(BaseModel):
    name: str
    addresses: list[Address]
    primary_address: Address | None = None


u = User(
    name="Alice",
    addresses=[
        {"street": "1 rue", "city": "Paris", "country": "FR"},
        {"street": "2 avenue", "city": "Lyon", "country": "FR"},
    ],
)
print(u.addresses[0].city)   # "Paris"
```

Chaque dict imbriqué est validé contre son modèle, à n'importe quelle profondeur. Pas besoin d'instancier manuellement les sous-objets.

### Référence circulaire (forward reference)

```python
class TreeNode(BaseModel):
    value: int
    children: list["TreeNode"] = []


TreeNode.model_rebuild()  # nécessaire si l'on utilise une string forward ref
```

Le `"TreeNode"` (entre guillemets) permet la référence circulaire ; `model_rebuild()` finalise les types après définition.

---

## 7. Schémas In/Out séparés — la règle d'or

### Le problème

Tentation classique du débutant : utiliser le même modèle pour l'entrée API et la sortie API.

```python
# ✗ Anti-pattern
class User(BaseModel):
    id: int
    email: EmailStr
    password: str
    created_at: datetime
```

Problèmes :

- Le **mot de passe** ne doit jamais apparaître en sortie.
- L'**id** est généré côté serveur (pas fourni par le client).
- Le **timestamp** est calculé (pas fourni).
- À la création, `email` est obligatoire ; à la mise à jour partielle, il est optionnel.

Un seul modèle ne peut pas honorer toutes ces contraintes contradictoires.

**Analogie.** Le bon de commande qu'on remplit au restaurant (ce qu'on donne au serveur) n'est pas la facture qu'on reçoit (ce qu'on récupère). Ce sont deux documents distincts, même s'ils parlent du même repas.

### La solution — trois modèles minimum

```python
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserCreate(BaseModel):
    """Ce qui arrive à l'API quand le client crée un user."""
    email: EmailStr
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    """Ce qui arrive à l'API pour une mise à jour partielle (PATCH)."""
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)


class UserOut(BaseModel):
    """Ce que l'API renvoie au client."""
    id: int
    email: EmailStr
    is_active: bool
    created_at: datetime
```

Chaque modèle reflète **exactement** son contexte. Pas de `password` dans `UserOut`. Pas d'`id` dans `UserCreate`. Tous les champs de `UserUpdate` sont optionnels (pattern PATCH).

### Bonus — `model_config = ConfigDict(from_attributes=True)`

Pour construire un modèle de sortie à partir d'un objet ORM (SQLAlchemy, Tortoise...) :

```python
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr


user_out = UserOut.model_validate(orm_user)  # lit orm_user.id, orm_user.email...
```

Anciennement appelé `orm_mode = True` en Pydantic v1.

---

## 8. `response_model` — contrôler la sortie

### Théorie

`response_model` est l'argument du décorateur qui définit la **forme de la réponse** :

```python
@app.post("/users", response_model=UserOut, status_code=201)
def create_user(user: UserCreate):
    db_user = save_user_in_db(user)
    return db_user      # peut contenir password, sera filtré par response_model
```

Trois bénéfices :

1. **Documentation OpenAPI** — `/docs` affiche le schéma de sortie attendu.
2. **Filtrage** — les champs absents de `UserOut` sont retirés silencieusement, même si présents dans l'objet retourné. Garde-fou de sécurité.
3. **Validation** — la sortie est validée contre le modèle. Une régression côté code (un champ renommé, manquant) est détectée immédiatement.

**Analogie.** Le `response_model` est le filtre à la sortie du four. Même si la pâte initiale contenait sel, sucre, et secrets de fabrication, le client ne voit que ce qui passe le filtre du sachet final.

### Variantes

```python
# Liste
@app.get("/users", response_model=list[UserOut])
def list_users(): ...

# Optional (peut renvoyer None → 204 ou 404 selon votre logique)
@app.get("/users/{id}", response_model=UserOut | None)
def get_user(id: int): ...

# response_model_exclude pour retirer des champs au cas par cas
@app.get("/users/{id}/public", response_model=UserOut, response_model_exclude={"email"})
def get_user_public(id: int): ...
```

### Sans `response_model`

Si l'on n'indique pas `response_model`, FastAPI utilise le **type de retour** de la signature :

```python
@app.get("/users/{id}")
def get_user(id: int) -> UserOut:
    ...
```

Équivalent à `response_model=UserOut`. Forme plus moderne, recommandée par la doc FastAPI récente.

---

## 9. Exercices pratiques

### Exercice 1 — Modèle de base + `Field()` (≈ 20 min)

Définir un modèle `Book` avec :

- `title: str` — obligatoire, 1 à 200 caractères.
- `isbn: str` — pattern `^\d{13}$` (13 chiffres).
- `year: int` — `ge=1900`, `le=2100`.
- `price: Decimal` — `gt=0`.
- `tags: list[str]` — défaut `[]`.

Tester avec un body invalide depuis Swagger UI et observer le détail de l'erreur 422.

### Exercice 2 — Validators (≈ 30 min)

Étendre le modèle `Book` :

- `@field_validator("title")` : retire les espaces de début/fin et capitalise la première lettre.
- `@field_validator("tags")` : déduplique les tags et les met en lowercase.
- `@model_validator(mode="after")` : si `year > 2024`, alors `tags` doit contenir `"future"`.

Tester chaque règle.

### Exercice 3 — Modèles imbriqués (≈ 25 min)

Modéliser un `Order` :

```python
class OrderItem(BaseModel):
    book_isbn: str
    quantity: int

class ShippingAddress(BaseModel):
    street: str
    city: str
    zip_code: str

class Order(BaseModel):
    customer_email: EmailStr
    items: list[OrderItem]   # non vide
    shipping: ShippingAddress
```

Ajouter :

- Une contrainte `min_length=1` sur `items`.
- Un validator qui rejette `quantity <= 0` sur `OrderItem`.

### Exercice 4 — Schémas In/Out (≈ 40 min)

Refactorer le CRUD du M2 en utilisant **trois modèles** pour `Item` :

- `ItemCreate` (POST input) : `name`, `price`, `in_stock`.
- `ItemUpdate` (PATCH input) : tous les champs optionnels.
- `ItemOut` (output API) : `id` + tous les champs.

Tous les endpoints doivent utiliser `response_model=ItemOut` (ou `list[ItemOut]`) et **filtrer correctement les champs** internes (ex. ajouter un champ `_internal_secret` au stockage interne qui ne doit jamais sortir).

### Exercice 5 — `response_model` filtrage (≈ 20 min)

Définir un modèle `User` qui contient `email` et `password_hash`. Stocker des users avec leur `password_hash`. Implémenter `GET /users/{id}` avec `response_model=UserPublic` où `UserPublic` n'a pas de `password_hash`.

Vérifier que la sortie via Swagger UI **ne contient jamais** `password_hash`, même si le code retourne l'objet complet.

---

## 10. Mini-défi de synthèse (≈ 2 à 3 heures)

Concevoir un système de **gestion d'utilisateurs** :

**Modèles** :

- `UserCreate` : `email`, `password` (min 8 caractères), `age` (≥ 13).
- `UserUpdate` : tous champs optionnels (PATCH).
- `UserOut` : `id`, `email`, `age`, `is_active`, `created_at`.

**Validators** :

- `email` : doit contenir un `@` (déjà couvert par `EmailStr`, mais ajouter une vérification de domaine refusant `"example.com"`).
- `password` : doit contenir au moins une majuscule, un chiffre, et un caractère spécial. Implémenter via `@field_validator`.
- `age` : ≥ 13.

**Endpoints** :

- `POST /users` → 201, body `UserCreate`, retour `UserOut`.
- `GET /users` → list `UserOut`, query optionnel `?active_only=true`.
- `GET /users/{id}` → `UserOut`, 404 si inexistant.
- `PATCH /users/{id}` → body `UserUpdate`, retour `UserOut`.
- `DELETE /users/{id}` → 204.

**Contraintes** :

- Stockage en mémoire (dict).
- `response_model` sur tous les endpoints.
- Le `password` n'apparaît **jamais** en sortie API.
- Au moins un email "unique" : `POST` avec un email déjà existant renvoie 409 Conflict.

---

## 11. Auto-évaluation

Le module M3 est validé lorsque :

- [ ] L'apprenant peut définir un `BaseModel` avec des types riches (UUID, datetime, EmailStr).
- [ ] Il utilise `Field()` pour ajouter contraintes et métadonnées.
- [ ] Il sait écrire un `@field_validator` qui transforme la valeur.
- [ ] Il sait écrire un `@model_validator(mode="after")` pour des règles cross-fields.
- [ ] Il maîtrise les modèles imbriqués (listes, dicts, références).
- [ ] Il sépare systématiquement `<Resource>Create`, `<Resource>Update`, `<Resource>Out`.
- [ ] Il utilise `response_model` sur tous les endpoints.
- [ ] Le mini-défi est implémenté et passe les contraintes de validation.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : maîtrise Pydantic (BaseModel, Field, validators), déclarer un request body, `response_model`.

---

## 12. Ressources complémentaires

- **Documentation Pydantic v2** : [docs.pydantic.dev](https://docs.pydantic.dev). Les sections _Models_, _Fields_, _Validators_, _Migration Guide_ sont la référence.
- **Documentation FastAPI** : _Body - Fields_, _Body - Nested Models_, _Response Model_ dans le _Tutorial - User Guide_.
- **Real Python** — article _Pydantic: Simplifying Data Validation in Python_.
- **Migration Pydantic v1 → v2** : [docs.pydantic.dev/latest/migration](https://docs.pydantic.dev/latest/migration/). Utile si l'on rencontre du code legacy.
