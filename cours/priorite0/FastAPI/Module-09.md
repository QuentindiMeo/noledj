# M9 — Authentification

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **authentification** et **autorisation**.
- Citer les principaux **schémas d'auth HTTP** et choisir le bon.
- Hasher un mot de passe avec **bcrypt** ou **argon2**.
- Comprendre l'anatomie d'un **JWT** (header.payload.signature).
- Implémenter le flow **access token + refresh token** complet.
- Utiliser **`OAuth2PasswordBearer`** comme security dependency.
- Protéger des endpoints avec une dépendance d'auth réutilisable.
- Appliquer les **bonnes pratiques** (expiration, rotation, stockage des secrets).

## Durée estimée

1 jour.

## Pré-requis

- M1 à M8 terminés (M6 _Injection de dépendances_ est central).

---

## 1. Authentification vs Autorisation

### Distinction

Deux questions distinctes, souvent confondues :

- **Authentification (AuthN)** — _Qui es-tu ?_ Le client prouve son identité.
- **Autorisation (AuthZ)** — _As-tu le droit de faire ça ?_ Une fois identifié, le système vérifie les permissions.

**Analogie.** À l'entrée d'un immeuble :

- Le **vigile à l'entrée** demande ta carte d'identité (AuthN).
- Le **digicode de l'étage** vérifie si tu as le droit d'y monter (AuthZ).

Ce module couvre l'AuthN. L'AuthZ par rôles a été touchée en M6 (factory `require_role`) et est approfondie au niveau Senior.

---

## 2. Schémas d'authentification HTTP

### Inventaire

| Schéma                 | Header                                              | Cas d'usage                                                              |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| **Basic**              | `Authorization: Basic <base64(user:pass)>`          | Usage interne, simple à mettre en place, peu sécurisé sans HTTPS strict. |
| **Bearer (JWT)**       | `Authorization: Bearer <token>`                     | API publiques modernes. Token signé, stateless.                          |
| **API Key**            | `Authorization: ApiKey <key>` ou header `X-API-Key` | Intégrations machine-à-machine.                                          |
| **OAuth2**             | `Authorization: Bearer <token>` (selon le flow)     | Multi-providers, délégation (Google, GitHub).                            |
| **Cookies de session** | `Cookie: session=<id>`                              | Apps web classiques, sécurité gérée par le navigateur.                   |

FastAPI propose des helpers pour chaque schéma. Ce module se concentre sur **JWT en Bearer**, le pattern le plus répandu en API REST moderne.

### Pourquoi JWT ?

- **Stateless** : pas de session côté serveur, le token porte l'info.
- **Scalable** : pas de lookup DB à chaque requête.
- **Cross-services** : un même token peut être validé par plusieurs services qui partagent la clé.
- **Standard** : RFC 7519, supporté par toutes les libs auth.

Trade-off : un JWT émis est valable jusqu'à expiration. Pour le révoquer plus tôt, il faut maintenir une **deny-list** (ce qui réintroduit du stateful).

---

## 3. Hashing de mot de passe

### Pourquoi pas en clair ?

Stocker un mot de passe en clair en base est **catastrophique** : une fuite expose tous les comptes. Et beaucoup d'utilisateurs réutilisent le même mot de passe ailleurs.

La solution : **stocker un hash** unidirectionnel. Au login, on hash le mot de passe fourni et on compare avec le hash stocké. Personne ne peut "retrouver" le mot de passe à partir du hash.

**Analogie.** Couler du béton sur une clé. On peut vérifier qu'une clé qu'on te présente correspond au béton (en la posant dessus), mais on ne peut pas extraire la clé originale du béton.

### bcrypt vs argon2

Deux algorithmes recommandés :

- **bcrypt** — standard depuis 1999. Lent par design (résiste au bruteforce). Très répandu.
- **argon2** — vainqueur du _Password Hashing Competition_ en 2015. Plus résistant aux attaques GPU. Moderne.

Pour un nouveau projet, **argon2** est le choix par défaut. **bcrypt** reste largement acceptable.

### Avec `passlib`

```bash
pip install passlib[bcrypt]
# ou
pip install passlib[argon2]
```

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


h = hash_password("hello123")
print(h)                              # $argon2id$v=19$...
print(verify_password("hello123", h)) # True
print(verify_password("wrong", h))    # False
```

`CryptContext` permet de gérer la migration : si l'on change de scheme, on peut continuer à vérifier les anciens hashes tout en réhashant à la première vérification réussie.

---

## 4. JWT — anatomie

### Structure

Un JWT est une chaîne de trois parties séparées par des points :

```
<header>.<payload>.<signature>
```

Exemple décodé :

```
Header   = base64({"alg": "HS256", "typ": "JWT"})
Payload  = base64({"sub": "user-42", "exp": 1735689600, "role": "admin"})
Signature = HMAC_SHA256(base64(header) + "." + base64(payload), SECRET)
```

**Le payload n'est pas chiffré, seulement encodé en base64.** N'importe qui peut le lire en collant le token dans [jwt.io](https://jwt.io). En revanche, **personne ne peut le modifier sans casser la signature**, à condition de garder le secret.

### Claims standards

Le payload contient des **claims** (déclarations). Quelques standards (RFC 7519) :

| Claim | Sens                                                         |
| ----- | ------------------------------------------------------------ |
| `sub` | Subject — identifiant de l'utilisateur.                      |
| `exp` | Expiration — timestamp Unix.                                 |
| `iat` | Issued At — timestamp d'émission.                            |
| `nbf` | Not Before — pas valide avant ce timestamp.                  |
| `iss` | Issuer — qui a émis le token.                                |
| `aud` | Audience — pour qui le token est destiné.                    |
| `jti` | JWT ID — identifiant unique du token (utile pour deny-list). |

On peut ajouter ses propres claims (`role`, `email`, etc.). **Garder le payload léger** — il transite à chaque requête.

### Avec `pyjwt`

```bash
pip install pyjwt[crypto]
```

```python
import jwt
from datetime import datetime, timedelta, timezone

SECRET = "very-secret-key-keep-safe"

def create_token(user_id: int, expires_in: timedelta) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + expires_in,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=["HS256"])


t = create_token(42, timedelta(minutes=15))
print(t)                      # eyJ...
print(decode_token(t))        # {'sub': '42', 'iat': ..., 'exp': ...}
```

`jwt.decode` lève automatiquement :

- `ExpiredSignatureError` si `exp` est dépassé.
- `InvalidSignatureError` si la signature ne correspond pas.
- `DecodeError` si le format est invalide.

À attraper proprement dans l'app.

---

## 5. Flow access + refresh

### Pourquoi deux tokens ?

Si on émet un seul token longue durée, il est dangereux : un attaquant qui le vole a un accès prolongé. Si on émet un token court (15 min), l'utilisateur doit se reconnecter sans cesse — UX cassée.

**Solution** : deux tokens.

- **Access token** — courte durée (15 min - 1 h). Sert à appeler l'API.
- **Refresh token** — longue durée (7 jours - 30 jours). Sert **uniquement** à obtenir un nouvel access token.

**Analogie.** Le bracelet d'accès à un parc d'attractions (15 min, dans toutes les attractions) vs le badge annuel (1 an, ne sert qu'à retirer un nouveau bracelet à l'accueil). Le bracelet, s'il est volé, expire vite ; le badge est mieux protégé (seulement utilisable à l'accueil).

### Flow complet

```
1. POST /auth/login        ↓
   {username, password}      → Vérifier identifiants.
                              ← {access_token, refresh_token}

2. GET /api/me              ↓
   Authorization: Bearer A   → Vérifier access_token.
                              ← Réponse normale.

3. (15 min plus tard)
   GET /api/me               ↓
   Authorization: Bearer A   → access_token expiré → 401.

4. POST /auth/refresh        ↓
   {refresh_token: R}        → Vérifier refresh_token, émettre nouveau couple.
                              ← {access_token: A2, refresh_token: R2}

5. GET /api/me               ↓
   Authorization: Bearer A2  → OK.
```

### Rotation du refresh token

À l'étape 4, on émet un **nouveau** refresh token et on **invalide l'ancien**. Si un attaquant volait le refresh, à la prochaine rotation légitime, le sien serait rejeté.

Implémentation : maintenir une table `refresh_tokens` en base, marquer `revoked=True` à chaque usage. Ou utiliser un identifiant unique (`jti`) et une liste de jti valides.

---

## 6. `OAuth2PasswordBearer` et security dependencies

### Le helper FastAPI

`OAuth2PasswordBearer` est une dépendance qui :

1. Extrait le token de `Authorization: Bearer <token>`.
2. Lève 401 si absent.
3. Documente l'endpoint en OpenAPI comme nécessitant un OAuth2 password flow (Swagger UI gère le login automatiquement).

```python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    user = db.get_user(int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


@app.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
```

`tokenUrl="/auth/login"` est juste l'URL où le client peut récupérer un token — Swagger UI s'en sert pour son bouton "Authorize".

### Encapsuler avec `Annotated`

```python
CurrentUser = Annotated[User, Depends(get_current_user)]


@app.get("/me")
def me(user: CurrentUser):
    return user


@app.get("/orders")
def list_orders(user: CurrentUser):
    return db.orders_for(user.id)
```

`CurrentUser` est un type réutilisable — la signature des endpoints reste lisible.

---

## 7. Implémentation complète — squelette

### `auth/security.py`

```python
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

from my_api.config import get_settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def _create_token(*, sub: str, expires_in: timedelta, token_type: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "iat": now,
        "exp": now + expires_in,
        "type": token_type,
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm="HS256")


def create_access_token(sub: str) -> str:
    return _create_token(sub=sub, expires_in=timedelta(minutes=15), token_type="access")

def create_refresh_token(sub: str) -> str:
    return _create_token(sub=sub, expires_in=timedelta(days=30), token_type="refresh")


def decode_token(token: str, *, expected_type: str) -> dict:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret.get_secret_value(), algorithms=["HS256"])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload
```

### `auth/dependencies.py`

```python
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from my_api.auth.security import decode_token
from my_api.repositories.user_repo import UserRepo, get_user_repo

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    repo: Annotated[UserRepo, Depends(get_user_repo)],
):
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = repo.get(int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive or missing")
    return user


CurrentUser = Annotated["User", Depends(get_current_user)]
```

### `auth/router.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Annotated

from my_api.auth.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from my_api.repositories.user_repo import UserRepo, get_user_repo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    repo: Annotated[UserRepo, Depends(get_user_repo)],
):
    user = repo.get_by_username(form.username)
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": create_access_token(sub=str(user.id)),
        "refresh_token": create_refresh_token(sub=str(user.id)),
        "token_type": "bearer",
    }


@router.post("/refresh")
def refresh(refresh_token: str):
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return {
        "access_token": create_access_token(sub=payload["sub"]),
        "refresh_token": create_refresh_token(sub=payload["sub"]),
        "token_type": "bearer",
    }
```

---

## 8. Bonnes pratiques

### Stockage du secret JWT

- **Jamais** dans le code source.
- Toujours via `Settings` (M5).
- En prod : variable d'environnement, idéalement gérée par un secret manager (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets).
- Type `SecretStr` pour masquer dans les logs.

### Durées d'expiration

| Token   | Durée recommandée                                     |
| ------- | ----------------------------------------------------- |
| Access  | 15 min (services internes) à 1 h (API publiques)      |
| Refresh | 7 jours (sécurité élevée) à 30 jours (UX prioritaire) |

Choisir selon la criticité de l'API.

### Algorithme

- **HS256** (symétrique) — pour les apps monolithiques. Simple.
- **RS256** (asymétrique) — quand plusieurs services valident des tokens émis par un Identity Provider. Le secret reste chez l'IdP, les autres ont la clé publique.

Démarrer en HS256 pour un projet greenfield ; migrer vers RS256 si le besoin apparaît.

### À ne **jamais** faire

- Stocker des données sensibles dans le JWT payload (mot de passe, numéro de CB) — le payload n'est pas chiffré.
- Désactiver la vérification de signature (`jwt.decode(token, options={"verify_signature": False})`) en prod.
- Émettre un JWT sans `exp`.
- Réutiliser le même secret pour signer et chiffrer.
- Passer un token JWT en query string (apparaît dans les logs serveur, l'historique navigateur, etc.). Toujours en header `Authorization`.

### Pour aller plus loin

- **Deny-list** — table des tokens révoqués (mot de passe changé, logout explicite).
- **Rate limiting** sur `/auth/login` pour empêcher le bruteforce.
- **MFA / 2FA** — code TOTP supplémentaire à la connexion.
- **Sessions cookies** — pour les apps web classiques, mieux qu'un JWT en localStorage (vulnérable XSS).

---

## 9. Exercices pratiques

### Exercice 1 — Hashing (≈ 20 min)

Écrire deux fonctions `hash_password(p: str) -> str` et `verify_password(p: str, h: str) -> bool` avec `passlib` et argon2. Vérifier :

- Le hash change à chaque appel pour le même mot de passe (salt aléatoire).
- `verify_password("right", hash_password("right"))` est `True`.
- `verify_password("wrong", hash_password("right"))` est `False`.

### Exercice 2 — Créer et décoder un JWT (≈ 25 min)

Écrire `create_token(sub: str, minutes: int) -> str` et `decode_token(token: str) -> dict`. Tester :

- Décoder un token valide.
- Décoder un token expiré → `ExpiredSignatureError`.
- Modifier un caractère du token → `InvalidSignatureError`.
- Décoder avec un secret différent → `InvalidSignatureError`.

### Exercice 3 — `OAuth2PasswordBearer` + `get_current_user` (≈ 30 min)

Implémenter `get_current_user` qui :

1. Extrait le token via `OAuth2PasswordBearer`.
2. Le décode.
3. Charge l'utilisateur depuis un `UserRepo` injecté (M6).
4. Lève 401 sur chaque erreur (expiration, signature, user introuvable).

L'utiliser dans un endpoint `GET /me` protégé. Tester via Swagger UI (bouton "Authorize").

### Exercice 4 — Login + refresh flow (≈ 45 min)

Implémenter :

- `POST /auth/login` — accepte `username` + `password` (via `OAuth2PasswordRequestForm`), renvoie `{access, refresh}`.
- `POST /auth/refresh` — accepte `{refresh_token}`, renvoie un nouveau couple `{access, refresh}`.
- Type marker dans le payload : `"type": "access"` ou `"type": "refresh"` pour éviter qu'un access soit utilisé comme refresh.

Tester :

- Login avec credentials valides → tokens.
- Login avec credentials invalides → 401.
- Refresh avec access token → 401 (type incorrect).
- Refresh avec refresh token → nouveau couple.

### Exercice 5 — Endpoints protégés par rôle (≈ 25 min)

Étendre `get_current_user` pour charger le `role` depuis le user, puis implémenter `require_role(role: str)` (factory, M6).

- `GET /me` → tout user authentifié.
- `GET /admin/dashboard` → `require_role("admin")`.

Tester via Swagger UI avec deux comptes (admin et user standard).

---

## 10. Mini-défi de synthèse (≈ 3 à 4 heures)

Construire un **module d'authentification production-ready** :

**Endpoints** :

- `POST /auth/register` — création de compte (email + password). 201 + access + refresh.
- `POST /auth/login` — connexion. 200 + access + refresh.
- `POST /auth/refresh` — renouveler les tokens.
- `POST /auth/logout` — invalider le refresh token (deny-list).
- `GET /auth/me` — profil de l'utilisateur courant.

**Fonctionnalités** :

- Hashing argon2.
- JWT HS256 avec `sub`, `iat`, `exp`, `type` (access/refresh), `jti`.
- Access token = 15 min, refresh token = 7 jours.
- Rotation du refresh token à chaque appel `/auth/refresh`.
- Deny-list en mémoire (set de `jti` révoqués).
- `Settings.jwt_secret` en `SecretStr`, lu depuis `.env`.
- Format d'erreur unifié (M7).

**Sécurité** :

- Format d'erreur identique pour "user inconnu" et "password faux" (anti-énumération de comptes).
- Rate limiting basique sur `/auth/login` (max 5 tentatives / minute).
- Headers sécurité actifs (M8).

**Tests** :

- Registration → login → me → refresh → logout (flow complet).
- Login avec mauvais password → 401, message générique.
- Use access expiré → 401.
- Use refresh révoqué → 401.
- Endpoint protégé sans token → 401.

---

## 11. Auto-évaluation

Le module M9 est validé lorsque :

- [ ] L'apprenant peut distinguer AuthN et AuthZ avec une analogie.
- [ ] Il connaît 4 schémas d'auth HTTP et peut citer leur cas d'usage.
- [ ] Il sait hasher un mot de passe avec argon2 ou bcrypt.
- [ ] Il décrit l'anatomie d'un JWT (3 parties) et l'effet d'une modification.
- [ ] Il implémente un flow access + refresh complet avec rotation.
- [ ] Il sait protéger un endpoint avec une security dependency réutilisable.
- [ ] Il connaît au moins 5 bonnes pratiques (secret, expiration, payload, algorithme, deny-list).
- [ ] Le mini-défi est implémenté et tous les tests passent.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : authentification par token (`OAuth2PasswordBearer`, JWT).

---

## 12. Ressources complémentaires

- **Documentation FastAPI** : _Security - First Steps_ + _Simple OAuth2 with Password and Bearer_ + _OAuth2 with Password (and hashing), Bearer with JWT tokens_. Référence directe pour ce module.
- **JWT debugger** : [jwt.io](https://jwt.io). Pour décoder et inspecter ses tokens.
- **OWASP** — _JWT Cheat Sheet for Java_ (transposable Python) — bonnes pratiques de production.
- **RFC 7519** — _JSON Web Token (JWT)_ — spec officielle.
- **PyJWT documentation** : [pyjwt.readthedocs.io](https://pyjwt.readthedocs.io).
- **passlib documentation** : [passlib.readthedocs.io](https://passlib.readthedocs.io).
