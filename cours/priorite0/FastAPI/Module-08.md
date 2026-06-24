# M8 — Middleware et CORS

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer le **pattern middleware** et son ordre d'exécution.
- Écrire un **middleware custom** via `@app.middleware("http")` (logging, request id, timing).
- Connaître les **middlewares built-in** (CORS, GZip, TrustedHost, HTTPSRedirect).
- Expliquer pourquoi **CORS** existe et quel problème de sécurité il résout.
- Configurer **`CORSMiddleware`** pour différents scénarios (dev local, multi-domaines, prod).
- Comprendre la requête **pre-flight OPTIONS** et savoir la déboguer.

## Durée estimée

0,5 à 0,75 jour.

## Pré-requis

- M1 à M7 terminés.

---

## 1. Le concept de middleware

### Théorie

Un **middleware** est un composant qui intercepte chaque requête **avant** qu'elle n'atteigne l'endpoint, et chaque réponse **avant** qu'elle ne soit renvoyée au client. Il forme une **chaîne** qui enrobe l'app.

```
client → MW1 → MW2 → MW3 → endpoint
client ← MW1 ← MW2 ← MW3 ← endpoint
```

Chaque middleware peut :

- Lire ou modifier la requête entrante.
- Lire ou modifier la réponse sortante.
- Court-circuiter (renvoyer une réponse directement, sans appeler la suite).
- Mesurer des choses (temps, taille).

**Analogie.** Une chaîne de production avec plusieurs postes de contrôle. Chaque colis passe par tous les postes à l'aller (étiquetage, contrôle qualité, scellé), et la facture repasse par les mêmes postes au retour. Aucun colis ne court-circuite la chaîne — c'est ce qui rend les middlewares pratiques pour les concerns transverses.

### Cas d'usage typiques

- **Logging** : tracer chaque requête/réponse.
- **Métriques** : compter les appels, mesurer la latence.
- **Sécurité** : ajouter des en-têtes (`X-Frame-Options`, `Strict-Transport-Security`).
- **Authentification globale** (préfère `dependencies`, voir M6).
- **CORS** : gérer les requêtes cross-origin (sujet de la moitié du module).
- **Compression** : GZip sur les réponses.
- **Rate limiting** : limiter les appels par IP.

---

## 2. Middleware FastAPI custom — décorateur `@app.middleware("http")`

### Syntaxe

```python
from fastapi import FastAPI, Request
import time
import uuid

app = FastAPI()


@app.middleware("http")
async def add_request_id_and_timer(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start

    response.headers["X-Request-Id"] = request_id
    response.headers["X-Process-Time"] = f"{elapsed:.4f}"
    return response
```

Mécanique :

1. La fonction reçoit `request` et `call_next`.
2. Avant `call_next` : code exécuté **à l'entrée**.
3. `response = await call_next(request)` invoque le middleware suivant (ou l'endpoint).
4. Après `call_next` : code exécuté **au retour**.
5. La fonction renvoie la `response` (modifiée ou non).

Le décorateur **doit** être une fonction `async`. C'est le contrat ASGI.

### `request.state` — passer de l'info à l'endpoint

`request.state` est un namespace libre, partagé entre middleware et endpoint pour la durée de **cette** requête :

```python
@app.middleware("http")
async def attach_user(request: Request, call_next):
    request.state.user = decode_user_from_jwt(request.headers.get("Authorization"))
    return await call_next(request)


@app.get("/me")
def me(request: Request):
    return request.state.user
```

Pratique pour les infos transverses (request id, user, locale). Mais préférer `Depends` pour les vraies dépendances injectées dans la signature : `request.state` est moins typé.

---

## 3. Middleware ASGI — la forme bas niveau

Pour des besoins avancés (modifier le body en streaming, gérer WebSocket), le décorateur ne suffit pas. On écrit alors une classe ASGI :

```python
class CustomMiddleware:
    def __init__(self, app, *, option: str = "default"):
        self.app = app
        self.option = option

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # logique custom
        await self.app(scope, receive, send)


app.add_middleware(CustomMiddleware, option="value")
```

Plus de contrôle, mais plus de complexité. **À éviter** sauf besoin spécifique. Approfondi au niveau N3 du parcours (item _middleware ASGI de bas niveau_).

---

## 4. Middlewares built-in

### Inventaire

FastAPI hérite des middlewares de Starlette. Les plus utiles :

| Middleware                | Utilité                                 |
| ------------------------- | --------------------------------------- |
| `CORSMiddleware`          | Configuration CORS (sujet de la suite). |
| `GZipMiddleware`          | Compresser les réponses > N octets.     |
| `TrustedHostMiddleware`   | Whitelist d'hôtes acceptés (sécurité).  |
| `HTTPSRedirectMiddleware` | Force la redirection HTTP → HTTPS.      |

### `GZipMiddleware`

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

Compresse les réponses dépassant 1000 octets. Gain de bande passante notable sur les listes JSON.

### `TrustedHostMiddleware`

```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["api.example.com", "*.example.com"],
)
```

Rejette toute requête dont le header `Host` n'est pas dans la liste. Protection contre les attaques par _Host header injection_.

### `HTTPSRedirectMiddleware`

```python
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

app.add_middleware(HTTPSRedirectMiddleware)
```

Redirige toute requête HTTP vers HTTPS. À placer **derrière** un reverse proxy (Nginx, Cloudfront, ALB) qui transmet le bon `X-Forwarded-Proto`, sinon faux positifs.

---

## 5. CORS — pourquoi et comment

### Le problème que CORS résout

Le navigateur applique la **Same-Origin Policy** : par défaut, un script chargé depuis `https://app.example.com` **ne peut pas** appeler `https://api.example.com` (origine différente).

C'est une protection contre les attaques **CSRF** (un site malveillant qui essaierait de lire ta banque depuis ton navigateur connecté).

Mais c'est aussi un blocage légitime quand on a vraiment besoin d'appeler une API depuis un autre domaine. **CORS** (Cross-Origin Resource Sharing) est le mécanisme qui permet au serveur de **dire au navigateur** : "oui, ce domaine peut m'appeler".

**Analogie.** La frontière entre deux pays. Sans visa (header CORS), un voyageur ne peut pas entrer. Le serveur joue le rôle d'ambassade : il émet le visa via des headers `Access-Control-*`. Le navigateur joue le rôle de douanier : il vérifie le visa avant de laisser passer la requête.

### Le pre-flight OPTIONS

Pour les requêtes "non simples" (méthodes autres que GET/POST, headers personnalisés, body JSON...), le navigateur envoie d'abord une requête **OPTIONS** vers le serveur, pour demander :

> "Est-ce que tu autorises mon origine à faire ce type de requête avec ces headers ?"

Si le serveur répond avec les bons headers `Access-Control-Allow-*`, le navigateur envoie la vraie requête. Sinon, il la bloque et logue une erreur dans la console.

C'est pourquoi un endpoint qui fonctionne via curl peut échouer depuis le navigateur : curl ne fait pas le pre-flight, le navigateur si.

### `CORSMiddleware`

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
    max_age=600,
)
```

| Paramètre            | Rôle                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `allow_origins`      | Liste des origines autorisées (exact match).                                                   |
| `allow_origin_regex` | Regex sur l'origine (utile pour `*.example.com`).                                              |
| `allow_credentials`  | Autoriser les cookies / Authorization. Si `True`, **incompatible avec `allow_origins=["*"]`**. |
| `allow_methods`      | Verbes HTTP autorisés.                                                                         |
| `allow_headers`      | Headers acceptés dans la requête.                                                              |
| `expose_headers`     | Headers exposés au JS du client (par défaut, seuls les "simples" le sont).                     |
| `max_age`            | Durée de cache du pre-flight (secondes).                                                       |

---

## 6. Configurations CORS courantes

### Développement local

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Permissif, mais limité aux ports de dev front. Ne **pas** dupliquer en prod tel quel.

### Production stricte

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
    max_age=3600,
)
```

Restrictif : une seule origine, méthodes et headers nominatifs. Sécurité maximale.

### Plusieurs sous-domaines

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https://(.+)\.example\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_origin_regex` est utile quand on a `app.example.com`, `admin.example.com`, `mobile.example.com`...

### API publique sans cookies

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,    # ← obligatoire avec "*"
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

Pour une API publique en lecture seule (open data, météo, etc.). Important : `allow_credentials=True` interdit `allow_origins=["*"]` côté spec CORS.

### Configurer depuis la config (M5)

```python
from my_api.config import get_settings

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Pour avoir des CORS différents en dev / staging / prod sans recompilation.

---

## 7. Ordre des middlewares

### Règle

L'ordre d'ajout via `app.add_middleware(...)` est important. Le **dernier ajouté** est exécuté **en premier** à l'entrée (et **en dernier** à la sortie).

```python
app.add_middleware(MW1)
app.add_middleware(MW2)
app.add_middleware(MW3)
```

Ordre d'exécution :

```
request  → MW3 → MW2 → MW1 → endpoint
response ← MW3 ← MW2 ← MW1 ← endpoint
```

C'est contre-intuitif mais cohérent avec le décorateur Python (`@A @B @C f` = `A(B(C(f)))` — voir Python M6).

### Implications pratiques

- Le middleware de **logging** (qui veut voir tout) → ajouter **en premier** (devient le plus extérieur).
- Le middleware **CORS** → typiquement en premier ou très tôt, pour qu'il puisse répondre aux pre-flight OPTIONS sans interférence.
- Le middleware **auth** → typiquement après CORS (puisque le pre-flight ne porte pas d'auth).

```python
app.add_middleware(CORSMiddleware, ...)        # ajouté en premier
app.add_middleware(AuthMiddleware, ...)        # ajouté après
app.add_middleware(LoggingMiddleware, ...)     # ajouté en dernier → exécuté en premier
```

Astuce : pour le logging des requêtes, préférer le **décorateur `@app.middleware("http")`** qui s'enroule différemment et capture tout, y compris les retours de CORS.

---

## 8. Exercices pratiques

### Exercice 1 — Middleware de timing (≈ 20 min)

Écrire un middleware qui :

1. Mesure le temps total de traitement.
2. Ajoute un header `X-Process-Time` à la réponse.
3. Logue les requêtes prenant plus de 500 ms.

Tester sur un endpoint rapide et un endpoint volontairement lent (`time.sleep(0.6)`).

### Exercice 2 — Request ID (≈ 25 min)

Écrire un middleware qui :

1. Génère un UUID par requête.
2. L'attache à `request.state.request_id`.
3. L'ajoute en header de réponse `X-Request-Id`.
4. Le **réutilise** si le client a déjà fourni `X-Request-Id` en entrée (traçage distribué).

Vérifier que `request.state.request_id` est accessible depuis un endpoint.

### Exercice 3 — CORS dev local (≈ 15 min)

Configurer `CORSMiddleware` pour autoriser `http://localhost:3000` et `http://localhost:5173`. Tester depuis un mini front (ou via les DevTools du navigateur) :

- Une requête `GET` (simple, pas de pre-flight).
- Une requête `POST` avec `Content-Type: application/json` (déclenche un pre-flight).
- Observer les headers `Access-Control-*` dans les réponses.

### Exercice 4 — CORS multi-domaines via regex (≈ 20 min)

Configurer `allow_origin_regex=r"^https://(.+)\.example\.com$"`. Tester depuis 3 origines fictives :

- `https://app.example.com` → autorisé.
- `https://admin.example.com` → autorisé.
- `https://evil.com` → bloqué (réponse sans header `Access-Control-Allow-Origin` → navigateur bloque).

### Exercice 5 — Headers de sécurité (≈ 25 min)

Écrire un middleware qui ajoute systématiquement les headers de sécurité suivants à toute réponse :

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (sur HTTPS uniquement)
- `Referrer-Policy: strict-origin-when-cross-origin`

Vérifier la présence des headers via `curl -I` sur n'importe quel endpoint.

---

## 9. Mini-défi de synthèse (≈ 2 heures)

Construire un **stack middleware production-ready** combinant :

1. **CORS** — configurable depuis `Settings.cors_allowed_origins` (M5).
2. **GZip** — pour les réponses > 1 ko.
3. **Headers de sécurité** — `nosniff`, `DENY`, `HSTS`, `Referrer-Policy`.
4. **Request ID** — UUID propagé en header, accessible dans les logs.
5. **Timing** — `X-Process-Time` + log des requêtes > 1 s.
6. **Logging structuré** — log JSON contenant `method`, `path`, `status_code`, `duration_ms`, `request_id`, `user_agent`.

**Tests** :

- Un endpoint test renvoyant un JSON volumineux → vérifier la compression GZip.
- Un test avec `Origin: https://allowed.example.com` → CORS OK.
- Un test avec `Origin: https://evil.com` → CORS bloqué.
- Un test qui provoque une exception → vérifier que le log contient `status_code: 500` et `request_id`.

**Validation** :

- [ ] Tous les middlewares sont configurés dans `main.py`, dans le bon ordre.
- [ ] L'ordre est documenté en commentaire.
- [ ] La config CORS est lue depuis `Settings` (pas hardcodée).
- [ ] `request_id` est présent dans tous les logs serveur **et** dans le header de réponse.

---

## 10. Auto-évaluation

Le module M8 est validé lorsque :

- [ ] L'apprenant peut expliquer la chaîne de middlewares et son ordre d'exécution.
- [ ] Il sait écrire un middleware via `@app.middleware("http")`.
- [ ] Il connaît 3 middlewares built-in et leur usage.
- [ ] Il peut expliquer la Same-Origin Policy et le rôle du pre-flight OPTIONS.
- [ ] Il configure `CORSMiddleware` correctement pour 3 scénarios (dev, prod stricte, multi-sous-domaines).
- [ ] Il connaît l'incompatibilité `allow_origins=["*"]` + `allow_credentials=True`.
- [ ] Le mini-défi est implémenté et tous les tests passent.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : créer un middleware dans FastAPI, configurer la politique de CORS via `CORSMiddleware`.

---

## 11. Ressources complémentaires

- **Documentation FastAPI** : _Middleware_ et _CORS (Cross-Origin Resource Sharing)_ dans le _Tutorial - User Guide_.
- **Documentation Starlette** : _Middleware_ (FastAPI hérite directement de Starlette pour les middlewares).
- **MDN** — _Cross-Origin Resource Sharing (CORS)_ : [developer.mozilla.org/en-US/docs/Web/HTTP/CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS).
- **MDN** — _Same-origin policy_ : [developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy).
- **OWASP** — _HTTP Security Response Headers Cheat Sheet_ : pour aller plus loin sur les headers de sécurité.
