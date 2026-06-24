# M1 — Architecture et premier serveur

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est FastAPI et dans quel contexte le choisir (vs Flask, vs Django).
- Mettre en place un projet FastAPI avec environnement virtuel et dépendances.
- Lancer un serveur de développement avec **Uvicorn**.
- Exposer un endpoint racine `GET /` qui retourne un JSON.
- Accéder à la **documentation auto-générée** (Swagger UI / ReDoc / OpenAPI).
- Reconnaître la **structure de fichiers idiomatique** (`main.py`, `routers/`, `schemas/`, `models/`, `dependencies/`).

## Durée estimée

0,5 jour (1 demi-journée).

## Pré-requis

- Parcours Python à minima M2 à M4 (classes, décorateurs, dataclasses).
- Python 3.10+ installé.
- Un terminal et un éditeur de code.

---

## 1. Qu'est-ce que FastAPI ?

### Le contexte

Python a trois frameworks web majeurs :

- **Django** — framework full-featured (ORM, admin, templates), opinions fortes, orientation "tout intégré".
- **Flask** — micro-framework minimaliste, à composer avec d'autres bibliothèques.
- **FastAPI** — framework moderne async, validation par Pydantic, documentation auto-générée.

FastAPI est né en 2018 (Sebastián Ramírez). Il combine :

- La **simplicité de Flask** : une route = une fonction décorée.
- La **validation automatique** de Django REST Framework, mais via Pydantic (annotations de types).
- La **performance moderne** de l'async Python (ASGI).
- La **documentation interactive** (Swagger UI) générée à partir des annotations.

**Analogie.** Passer d'un vélo classique à un vélo électrique : même geste, plus efficace. On garde le contrôle du fonctionnement (les routes restent des fonctions), mais on gagne en vitesse de développement et en sécurité (les types deviennent des validations).

### Quand choisir FastAPI ?

- API REST / GraphQL / WebSocket modernes.
- Performance et concurrence importantes (workloads I/O-bound).
- Documentation auto-générée souhaitée.
- Équipe à l'aise avec les annotations de types.
- Pas de besoin de pages HTML rendues côté serveur (sinon Django reste pertinent).

---

## 2. Mise en place de l'environnement

### Création du projet

```bash
mkdir my-api && cd my-api
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows
pip install fastapi "uvicorn[standard]"
```

`fastapi` est le framework lui-même. `uvicorn` est le serveur ASGI qui exécute l'app. L'extra `[standard]` installe des dépendances utiles (websockets, watchfiles pour le reload, http-tools).

### Premier `main.py`

```python
from fastapi import FastAPI

app = FastAPI(title="My API", version="0.1.0")


@app.get("/")
def root():
    return {"message": "Hello, FastAPI"}
```

5 lignes — c'est tout ce qu'il faut pour avoir un serveur web fonctionnel.

### Lancer le serveur

```bash
uvicorn main:app --reload
```

`main:app` signifie : _dans le fichier `main.py`, prendre la variable `app`_. `--reload` redémarre le serveur quand un fichier change (mode dev uniquement).

Sortie attendue :

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

Tester depuis le navigateur ou `curl` :

```bash
curl http://127.0.0.1:8000/
# {"message":"Hello, FastAPI"}
```

---

## 3. Uvicorn et ASGI — le minimum vital

### Théorie (version courte)

FastAPI est un framework **ASGI** (Asynchronous Server Gateway Interface). ASGI est la norme moderne pour les serveurs Python async. C'est l'équivalent moderne de WSGI (utilisé par Flask et Django classique).

**Analogie.** L'app FastAPI est la voiture (le métier). Uvicorn est l'autoroute (le serveur HTTP). Ils sont conçus pour fonctionner ensemble mais sont conceptuellement séparés.

Le détail d'ASGI (vs WSGI, threading, async natif) est couvert en M12. Pour l'instant, retenir :

- **FastAPI** = code de l'app.
- **Uvicorn** = serveur qui exécute l'app.
- **ASGI** = contrat standardisé entre les deux.

### Alternatives à Uvicorn

- **Hypercorn** — autre serveur ASGI, supporte HTTP/2 et HTTP/3.
- **Daphne** — historique (créé pour Django Channels).
- **Gunicorn + workers Uvicorn** — pour la production : Gunicorn gère le multi-processus, chaque worker est un Uvicorn.

En développement, Uvicorn seul suffit. En production, le couple Gunicorn + Uvicorn est l'idiome courant (approfondi dans le parcours Senior).

---

## 4. Documentation auto-générée

### Swagger UI, ReDoc, OpenAPI

Dès qu'un endpoint est défini, FastAPI génère automatiquement trois ressources :

- **Swagger UI** : `http://127.0.0.1:8000/docs` — documentation interactive, on peut tester les endpoints depuis le navigateur.
- **ReDoc** : `http://127.0.0.1:8000/redoc` — vue plus formelle, pratique pour la lecture statique.
- **OpenAPI JSON** : `http://127.0.0.1:8000/openapi.json` — le schéma brut, standard de l'industrie pour décrire une API REST.

Swagger UI et ReDoc sont alimentés par le schéma OpenAPI ; ils ne sont que deux interfaces différentes pour le même contenu.

**Analogie.** Un menu interactif au restaurant. Sans rien expliquer, le client voit les plats disponibles, leurs ingrédients, leurs prix — et peut commander directement. La doc est un sous-produit du code, pas un document à maintenir séparément.

### Personnaliser l'instance

```python
app = FastAPI(
    title="My API",
    version="0.1.0",
    description="Description de l'API.",
    docs_url="/api-docs",        # déplacer Swagger UI
    redoc_url=None,              # désactiver ReDoc
    openapi_url="/openapi.json"  # chemin du schéma brut
)
```

En production, on désactive parfois `docs_url` et `redoc_url` (les laisser activés est OK pour une API publique documentée).

---

## 5. Structure de fichiers idiomatique

### Petit projet (un seul fichier)

Pour démarrer ou pour un microservice court, un seul `main.py` suffit. FastAPI ne force aucune structure.

### Projet structuré (recommandé dès que ça grossit)

```
my-api/
├── pyproject.toml
├── .env
├── src/
│   └── my_api/
│       ├── __init__.py
│       ├── main.py            # point d'entrée, instanciation de FastAPI
│       ├── routers/           # endpoints groupés par domaine
│       │   ├── __init__.py
│       │   ├── users.py
│       │   └── orders.py
│       ├── schemas/           # modèles Pydantic (entrée/sortie API)
│       │   ├── __init__.py
│       │   ├── user.py
│       │   └── order.py
│       ├── models/            # modèles persistés (SQLAlchemy / autre ORM)
│       │   ├── __init__.py
│       │   └── user.py
│       ├── dependencies/      # injection de dépendances (auth, DB session...)
│       │   ├── __init__.py
│       │   └── auth.py
│       ├── services/          # logique métier
│       │   └── ...
│       └── config.py          # settings via pydantic-settings
└── tests/
    └── ...
```

Conventions :

- `routers/` — endpoints organisés par ressource ou domaine.
- `schemas/` — ce qui circule sur le réseau (Pydantic).
- `models/` — ce qui est persisté (ORM).
- **Toujours séparer `schemas/` et `models/`** : tentation fréquente de tout fusionner, mais cela nuit à l'évolutivité (l'API et la DB évoluent à des rythmes différents).
- `dependencies/` — les `Depends` réutilisables (sujet du M6).

Cette structure rend le projet lisible quand il grossit. On approfondira chaque dossier dans les modules suivants.

---

## 6. Exercices pratiques

### Exercice 1 — Hello FastAPI (≈ 15 min)

1. Créer un nouveau dossier `hello-api`.
2. Mettre en place un environnement virtuel et installer `fastapi` + `uvicorn[standard]`.
3. Écrire un `main.py` minimal avec une route `GET /` qui retourne `{"message": "Hello, FastAPI"}`.
4. Lancer le serveur avec `uvicorn main:app --reload`.
5. Vérifier la réponse via `curl` et accéder à `/docs`.

### Exercice 2 — Plusieurs endpoints (≈ 15 min)

Étendre `main.py` avec :

- `GET /health` qui retourne `{"status": "ok"}`.
- `GET /version` qui retourne `{"version": "0.1.0"}`.
- `GET /echo/{message}` qui retourne `{"echo": "..."}` en utilisant un path parameter (sujet approfondi en M2).

Tester chaque endpoint depuis Swagger UI.

### Exercice 3 — Personnaliser l'instance (≈ 15 min)

Modifier l'instanciation `app = FastAPI(...)` pour :

- Définir `title`, `description`, `version`.
- Déplacer Swagger UI sur `/api-docs`.
- Désactiver ReDoc (`redoc_url=None`).

Vérifier que `/docs` renvoie une 404 et que `/api-docs` fonctionne.

### Exercice 4 — Refactor en structure idiomatique (≈ 30 min)

Refactorer le projet :

```
hello-api/
├── pyproject.toml
└── src/
    └── hello_api/
        ├── __init__.py
        ├── main.py
        └── routers/
            ├── __init__.py
            └── health.py
```

Dans `routers/health.py` :

```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}
```

Dans `main.py` :

```python
from fastapi import FastAPI
from hello_api.routers import health

app = FastAPI(title="Hello API")
app.include_router(health.router)
```

Lancer avec `uvicorn hello_api.main:app --reload` depuis le dossier `src/`.

`APIRouter` est l'outil officiel pour regrouper des endpoints — il sera approfondi en M4.

---

## 7. Mini-défi (≈ 30 min)

Concevoir une mini-API "calculatrice" :

- `GET /add/{a}/{b}` retourne `{"sum": a + b}`.
- `GET /sub/{a}/{b}` retourne `{"diff": a - b}`.
- `GET /mul/{a}/{b}` retourne `{"product": a * b}`.

Typer les paramètres `a` et `b` en `int` dans la signature de la fonction et observer que FastAPI **valide automatiquement** : passer une chaîne renvoie une erreur 422 propre, sans avoir rien codé. C'est le superpouvoir Pydantic — il sera approfondi en M3.

**Bonus** : tester l'API exclusivement via Swagger UI (sans `curl` ni navigateur direct).

---

## 8. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] L'apprenant peut expliquer pourquoi FastAPI vs Flask vs Django en deux phrases.
- [ ] Il sait monter un environnement virtuel et installer FastAPI + Uvicorn.
- [ ] Il sait lancer un serveur avec `uvicorn main:app --reload`.
- [ ] Il sait exposer un endpoint `GET` avec un décorateur et le tester via Swagger UI.
- [ ] Il connaît les trois URLs de docs auto-générées (`/docs`, `/redoc`, `/openapi.json`).
- [ ] Il peut décrire la structure idiomatique `src/<package>/{main,routers,schemas,models,dependencies}`.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : architecture de fichiers, déclarer une route, lancer le serveur, documentation auto-générée, retourner du JSON.

Les items N1 _path parameter_ et _query parameter_ seront finalisés en M2.

---

## 9. Ressources complémentaires

- **Documentation FastAPI officielle** : [fastapi.tiangolo.com](https://fastapi.tiangolo.com). Le _Tutorial - User Guide_ couvre exactement ce module.
- **Documentation Uvicorn** : [uvicorn.org](https://www.uvicorn.org). Utile pour les options du serveur en production.
- **ASGI specification** : [asgi.readthedocs.io](https://asgi.readthedocs.io). À survoler maintenant, à approfondir en M12.
- **Real Python** — article _Getting Started with FastAPI_.
