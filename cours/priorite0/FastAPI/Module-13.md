# M13 — Approfondissement N3 (vers 2.5)

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Intégrer **SQLAlchemy async** (`AsyncSession`) dans une app FastAPI.
- Utiliser les **lifespan events** pour le setup et le teardown de ressources globales.
- Comprendre le **scoping des dépendances** (request-scoped vs lifespan-scoped).
- Implémenter un **endpoint WebSocket** simple (connexion, échange, déconnexion).

Ce module amène le niveau au-delà du Confirmé (2.5) et amorce le passage vers le Senior (3).

## Durée estimée

1 jour.

## Pré-requis

- M1 à M12 terminés.

---

## 1. SQLAlchemy async — pourquoi

### Le problème de SQLAlchemy synchrone dans FastAPI

Dans une app FastAPI `async def`, appeler une session SQLAlchemy synchrone bloque l'event loop (cf. M10). Le bénéfice de l'async disparaît dès le premier `session.query(...)`.

Deux solutions :

1. Garder SQLAlchemy sync, mais déclarer les endpoints en `def` (FastAPI les exécute dans un thread pool — c'est l'approche par défaut historique).
2. Utiliser **SQLAlchemy async** avec un driver async (`asyncpg` pour PostgreSQL, `aiomysql` pour MySQL, `aiosqlite` pour SQLite).

L'option 2 est plus moderne et plus performante en charge I/O élevée — c'est le sujet de cette section.

**Analogie.** Si le serveur d'un restaurant porte un seul plateau (sync), il fait des allers-retours en file d'attente. S'il a une voiturette de service (async), il transporte plusieurs commandes en parallèle. SQLAlchemy async = la voiturette.

### Installation

```bash
pip install "sqlalchemy[asyncio]>=2.0" asyncpg     # PostgreSQL
# ou
pip install "sqlalchemy[asyncio]>=2.0" aiosqlite   # SQLite
```

SQLAlchemy 2.0+ unifie l'API sync et async sous un même paradigme — toujours préférer 2.0+ pour un nouveau projet.

---

## 2. Setup SQLAlchemy async

### Engine et factory de session

```python
# src/my_api/db.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/mydb"
# ou pour SQLite : "sqlite+aiosqlite:///./test.db"

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)
```

- `pool_pre_ping=True` — vérifie que la connexion est vivante avant chaque emprunt. Évite les `OperationalError` après une coupure réseau.
- `expire_on_commit=False` — recommandé en async, pour éviter le rechargement automatique d'objets après commit.

### Modèles ORM

```python
# src/my_api/models/user.py
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

`Mapped[...]` est la syntaxe SQLAlchemy 2.0 — annotations typées, validation, autocompletion IDE.

### Création des tables (au démarrage)

```python
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

À appeler au lifespan startup (cf. section 4).

---

## 3. `AsyncSession` comme dépendance

### Le pattern `Depends` avec `yield`

```python
# src/my_api/dependencies/db.py
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from my_api.db import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

Bonnes pratiques :

- **`async with`** garantit la fermeture de la session.
- **`rollback`** explicite sur exception, sinon une exception en cours de requête peut laisser des changements pending.
- **`close`** dans `finally` (même si `async with` le fait déjà — la redondance est légère et explicite).

### Utilisation dans un endpoint

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from my_api.dependencies.db import get_db
from my_api.models.user import User
from my_api.schemas.user import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

Trois choses à retenir :

- Toutes les opérations DB sont `await`ées.
- L'API SQLAlchemy 2.0 utilise `select()` + `db.execute()` (l'ancienne `db.query()` reste sync).
- `db.add(...)` reste **synchrone** (juste un enregistrement en cache local) — seuls `commit`, `refresh`, `execute` sont async.

---

## 4. Lifespan events — l'idiome moderne

### Le problème

Les anciens `@app.on_event("startup")` et `@app.on_event("shutdown")` sont **dépréciés** depuis FastAPI 0.95. Ils ne fournissent pas une garantie complète sur l'ordre d'exécution et la gestion d'exceptions.

L'idiome moderne : un **context manager `lifespan`** passé à l'app.

**Analogie.** Le rideau d'ouverture et de fermeture du restaurant. À l'ouverture, on dresse les tables (init DB, warm cache, charger les modèles ML). À la fermeture, on range (close DB, flush cache). FastAPI orchestre ça **proprement** : la phase de service ne démarre qu'après le setup, et le shutdown attend la fin des requêtes en cours.

### Syntaxe

```python
# src/my_api/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI

from my_api.db import engine, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    print("App started, DB initialized")

    yield   # — l'app sert les requêtes

    # Shutdown
    await engine.dispose()
    print("App shutting down")


app = FastAPI(title="My API", lifespan=lifespan)
```

Flux d'exécution :

1. **Startup** — tout le code avant `yield` s'exécute. L'app n'accepte pas encore de requêtes.
2. **Service** — l'app traite les requêtes pendant tout le temps du `yield`.
3. **Shutdown** — quand le serveur reçoit `SIGTERM` (Ctrl+C, redéploiement Kubernetes), le code après `yield` s'exécute.

### Pour passer de l'état au runtime

Utiliser `app.state` :

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Charger un ML model lourd une fois
    app.state.model = load_model("./model.pkl")
    yield
    # Pas de cleanup nécessaire pour un modèle en mémoire


@app.get("/predict")
def predict(request: Request, payload: PredictRequest):
    model = request.app.state.model
    return {"result": model.predict(payload)}
```

Pratique pour :

- Modèles ML chargés une fois pour toutes.
- Connexions long-lived (Redis pool, gRPC stub).
- Cache global.
- Configuration enrichie.

---

## 5. Scoping des dépendances

### Théorie

Toute dépendance FastAPI déclarée via `Depends(...)` est **request-scoped par défaut** : elle est appelée une fois par requête, cachée durant cette requête, libérée à la fin.

Mais certaines ressources doivent être **partagées entre requêtes** : un pool DB, un client HTTP réutilisable, un modèle ML.

**Analogie.** Dans un restaurant :

- Les **couverts du client** sont request-scoped : on les sort à chaque table, on les ramasse à la fin.
- La **machine à café** est lifespan-scoped : elle reste en place, partagée par tous les clients.

Confondre les deux scopes mène à deux problèmes :

- **Request-scoped quand on devrait partager** : on recrée un pool DB à chaque requête → effondrement de performance.
- **Lifespan-scoped quand on devrait isoler** : un état "client en cours" partagé → race conditions, leaks de données entre clients.

### Comment choisir

| Ressource                       | Scope recommandé | Raison                                              |
| ------------------------------- | ---------------- | --------------------------------------------------- |
| `AsyncSession` (transaction DB) | Request          | Une transaction par requête.                        |
| Pool de connexions DB (engine)  | Lifespan         | Recréer un pool à chaque requête détruit l'intérêt. |
| Settings (config)               | Lifespan / cache | Immuable, lue une fois.                             |
| User authentifié                | Request          | Différent par requête.                              |
| Modèle ML chargé en RAM         | Lifespan         | Coûteux à charger, immuable.                        |
| Client HTTP `httpx.AsyncClient` | Lifespan         | Réutilise les connexions TCP.                       |

### Pattern lifespan + dépendance request

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()


async def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


@app.get("/external")
async def call_external(
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    response = await client.get("https://api.example.com")
    return response.json()
```

L'instance `httpx.AsyncClient` est créée une fois (lifespan), récupérée à chaque requête (`Depends`), réutilisée par toutes.

### Cache de Settings via `@lru_cache`

Pattern vu en M5 :

```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`@lru_cache` simule un scope **process-wide** : la première instance est mise en cache, les suivantes la réutilisent. Pas tout à fait du lifespan (la cache survit même si l'app redémarre via `--reload`), mais l'effet pratique est identique.

---

## 6. WebSockets — introduction

### Théorie

Un **WebSocket** est une connexion **bidirectionnelle persistante** entre client et serveur. Contrairement à HTTP (requête → réponse, déconnexion), un WebSocket reste ouvert et permet à chaque côté d'envoyer des messages à tout moment.

**Analogie.** HTTP = courrier postal (envoi, attente, réponse, fin du cycle). WebSocket = ligne téléphonique (les deux interlocuteurs parlent quand ils veulent, jusqu'à raccrocher).

Cas d'usage :

- Chat en temps réel.
- Notifications push.
- Streaming de données live (dashboards, monitoring).
- Jeux multi-joueurs.
- Collaboration temps réel (Google Docs-like).

### Endpoint WebSocket FastAPI

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


@app.websocket("/ws/echo")
async def websocket_echo(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_text(f"echo: {message}")
    except WebSocketDisconnect:
        print("Client disconnected")
```

Trois primitives :

- `await websocket.accept()` — accepter la connexion.
- `await websocket.receive_text()` / `receive_json()` / `receive_bytes()` — lire un message.
- `await websocket.send_text(...)` — envoyer un message.

### Tester depuis le navigateur

```html
<!DOCTYPE html>
<html>
  <body>
    <script>
      const ws = new WebSocket("ws://localhost:8000/ws/echo");
      ws.onmessage = (event) => console.log("received:", event.data);
      ws.onopen = () => ws.send("hello");
    </script>
  </body>
</html>
```

Ouvrir dans le navigateur, regarder la console JS.

### Gestion multi-clients — un _Connection Manager_

```python
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: str):
        for ws in self.active:
            await ws.send_text(message)


manager = ConnectionManager()


@app.websocket("/ws/chat")
async def chat(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            await manager.broadcast(msg)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

C'est un chat minimal : tout client envoie un message, tous les autres le reçoivent.

### Sécurité — auth sur WebSocket

L'auth via JWT fonctionne, mais avec une subtilité : les WebSockets n'ont pas de mécanisme standard pour le header `Authorization` pendant la phase d'upgrade. Solutions courantes :

- Passer le token en **query parameter** (`/ws?token=...`).
- Passer le token en **cookie** (si l'origine le permet).
- Authentifier dans un **premier message** une fois la connexion ouverte.

À approfondir au niveau Senior.

### Limites des WebSockets en stateless

Les WebSockets gardent une connexion par client. À haut volume (10k+ connexions par worker), cela demande un dimensionnement spécifique :

- Workers Uvicorn dédiés.
- Sticky sessions ou broker pub/sub (Redis, NATS) pour relayer entre instances.
- Heartbeats pour détecter les déconnexions silencieuses.

Pour aller plus loin : cf. parcours Senior (item _WebSockets_).

---

## 7. Exercices pratiques

### Exercice 1 — Setup SQLAlchemy async (≈ 45 min)

1. Installer `sqlalchemy[asyncio]` + `aiosqlite`.
2. Définir un modèle `Item(id, name, price, in_stock)`.
3. Créer `engine`, `AsyncSessionLocal`, et la dépendance `get_db()`.
4. Implémenter `init_db()` qui crée les tables.

### Exercice 2 — CRUD async (≈ 45 min)

Refactorer le CRUD du M2 (en mémoire) en **SQLAlchemy async** :

- `POST /items` avec `db.add()` + `await db.commit()` + `await db.refresh()`.
- `GET /items/{id}` avec `select() + await db.execute() + result.scalar_one_or_none()`.
- `GET /items` avec `select() + await db.execute() + result.scalars().all()`.
- `PUT /items/{id}` + `DELETE /items/{id}`.

Tester via Swagger UI. Inspecter la DB SQLite avec un outil graphique (DB Browser for SQLite).

### Exercice 3 — Lifespan events (≈ 25 min)

Remplacer `init_db()` appelé manuellement par un `lifespan` :

- Au startup, `await init_db()`.
- Au shutdown, `await engine.dispose()`.

Vérifier dans les logs Uvicorn la séquence : startup → service → shutdown au Ctrl+C.

### Exercice 4 — Lifespan-scoped httpx client (≈ 30 min)

Ajouter un endpoint `/external/{user_id}` qui :

1. Récupère le user en DB (request-scoped via `Depends(get_db)`).
2. Appelle une API externe (lifespan-scoped via `app.state.http_client`).
3. Renvoie une combinaison.

Confirmer dans les logs que `httpx.AsyncClient` n'est créé **qu'une seule fois** au démarrage, et fermé proprement au shutdown.

### Exercice 5 — WebSocket echo + chat (≈ 45 min)

1. Implémenter `/ws/echo` qui répond `echo: <message>` à chaque entrée.
2. Implémenter `/ws/chat` avec un `ConnectionManager` qui broadcast à tous les clients connectés.
3. Tester avec **deux navigateurs simultanément** ou deux outils WebSocket (Postman, wscat).
4. Vérifier que les messages sont diffusés en temps réel.

---

## 8. Mini-défi de synthèse (≈ 4 à 5 heures)

Construire une **mini-app temps réel** combinant tous les concepts :

**Domaine** : un compteur partagé entre clients (style "personnes en ligne sur une page").

**Endpoints HTTP** :

- `POST /events` (REST) → enregistre un événement métier en DB (SQLAlchemy async).
- `GET /events` → liste paginée.

**Endpoint WebSocket** :

- `/ws/live` → diffuse en temps réel chaque nouvel événement à tous les clients connectés.

**Architecture** :

- DB en SQLAlchemy async + `AsyncSession` request-scoped via `Depends`.
- `ConnectionManager` lifespan-scoped (`app.state`).
- `lifespan` initialise la DB + crée le `ConnectionManager` + ferme proprement.
- Quand `POST /events` est appelé, broadcaster l'event sur le WebSocket.

**Tests** :

- Test HTTP : `POST /events` puis `GET /events` retourne bien l'event.
- Test WebSocket : avec **deux clients connectés**, un `POST /events` provoque la réception sur les deux clients.

**Critères de validation** :

- [ ] Aucun `time.sleep` ou appel bloquant — tout est `async`.
- [ ] `httpx.AsyncClient`, `AsyncSession` correctement scopés.
- [ ] Lifespan utilisé (pas de `@app.on_event` déprécié).
- [ ] Les WebSockets se referment proprement à la déconnexion client.
- [ ] Au moins 3 clients WebSocket peuvent être connectés simultanément.

---

## 9. Auto-évaluation

Le module M13 est validé lorsque :

- [ ] L'apprenant peut écrire une dépendance `get_db()` `AsyncSession` avec `yield` et rollback.
- [ ] Il sait utiliser `select()` + `await db.execute()` (SQLAlchemy 2.0 async).
- [ ] Il maîtrise le pattern `@asynccontextmanager` pour les lifespan events.
- [ ] Il sait identifier 3 ressources qui doivent être lifespan-scoped vs request-scoped.
- [ ] Il sait écrire un endpoint WebSocket avec accept / receive / send / disconnect.
- [ ] Il peut concevoir un `ConnectionManager` pour gérer plusieurs clients.
- [ ] Le mini-défi temps réel est implémenté et fonctionne avec 3 clients simultanés.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : SQLAlchemy async (`AsyncSession`), lifespan events, WebSockets, scoping des dépendances.

Avec ce module validé, le niveau Pydantic du parcours atteint **2.5+** (Confirmé complet + amorces N3). La porte vers le **Senior (3)** est ouverte : il reste à approfondir StreamingResponse, sub-applications, middleware ASGI bas niveau et patterns de pagination/versioning.

---

## 10. Ressources complémentaires

- **Documentation SQLAlchemy 2.0** : _Async ORM tutorial_ — référence officielle.
- **Documentation FastAPI** : _Async SQL (Relational) Databases_ dans le _Tutorial - User Guide_.
- **Documentation FastAPI** : _Lifespan Events_ dans le _Advanced User Guide_.
- **Documentation FastAPI** : _WebSockets_ dans le _Tutorial - User Guide_.
- **asyncpg** : [magicstack.github.io/asyncpg](https://magicstack.github.io/asyncpg/) — driver PostgreSQL async (le plus rapide).
- **Real Python** — articles _Async IO in Python: A Complete Walkthrough_ et _Build a Chat Application Using FastAPI_.
- **uvicorn-workers + Gunicorn** — pour le déploiement production avec WebSockets (parcours Senior).
