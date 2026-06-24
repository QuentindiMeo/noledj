# M5 — Configuration et environnements

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Externaliser la configuration via **`pydantic-settings`**.
- Charger des valeurs depuis les **variables d'environnement** et un fichier **`.env`**.
- Gérer plusieurs **environnements** (dev / staging / prod) sans réécrire le code.
- Injecter la configuration comme une **dépendance FastAPI** (préfiguration de M6).
- Appliquer les bonnes pratiques **12-factor** (config != code, jamais de secrets en clair dans le repo).

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M4 terminés.

---

## 1. Pourquoi externaliser la config ?

### Le problème

Hardcoder l'URL d'une base de données, un secret JWT ou le niveau de log dans le code source pose trois problèmes :

1. **Différents environnements** demandent des valeurs différentes (la DB de dev n'est pas celle de prod).
2. **Secrets en clair** dans Git = fuite de sécurité (clés API, mots de passe).
3. **Redéploiement pour un changement de config** : passer un `LOG_LEVEL` de `INFO` à `DEBUG` ne devrait pas nécessiter une recompilation.

**Analogie.** Le tableau de bord d'une voiture. Les paramètres (mode éco, mode sport, températures) influencent le comportement sans changer le moteur. On règle le tableau de bord ; on ne soude pas un nouveau moteur à chaque trajet.

### Les 12 facteurs

L'idiome moderne pour les applications cloud est résumé par le manifeste _[The Twelve-Factor App](https://12factor.net/)_. Le **facteur III** dit explicitement :

> _Store config in the environment._

La config (URL de DB, secrets, niveau de log) vit dans les **variables d'environnement** — séparées du code, différentes selon l'environnement, jamais commitées.

`pydantic-settings` est le pont entre cette philosophie et le typage Python.

---

## 2. `pydantic-settings` — les fondamentaux

### Installation

```bash
pip install pydantic-settings
```

Note : depuis Pydantic v2, `BaseSettings` a été **déplacé** dans un package séparé (`pydantic-settings`). En Pydantic v1, il vivait dans `pydantic` directement.

### Première classe `Settings`

```python
# src/my_api/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "My API"
    debug: bool = False
    database_url: str
    jwt_secret: str
    log_level: str = "INFO"
```

`BaseSettings` se comporte comme `BaseModel` mais avec une particularité : à l'instanciation, **il lit aussi les variables d'environnement** (et un `.env` si configuré).

### Charger la configuration

```python
settings = Settings()
print(settings.database_url)
print(settings.debug)
```

Lors de `Settings()`, Pydantic :

1. Lit les **variables d'environnement** (et le `.env` si `env_file` est précisé).
2. Lit les **valeurs par défaut** des champs.
3. **Valide** les types — un champ `port: int` typé en `int` rejette une valeur non numérique.
4. **Lève** `ValidationError` si un champ obligatoire manque.

Par défaut, le nom de la variable d'environnement correspond au nom du champ en majuscules : `database_url` → `DATABASE_URL`.

---

## 3. Sources de configuration

### Priorité (du plus prioritaire au moins prioritaire)

1. **Variables d'environnement OS** — toujours en tête.
2. **Variables du fichier `.env`** — si configuré.
3. **Valeurs par défaut** déclarées dans la classe.
4. **Erreur** si un champ obligatoire reste non résolu.

Donc une variable OS exportée écrase la valeur du `.env`. C'est ce qu'on veut en CI/CD : injecter les secrets via le système, sans dépendre d'un fichier.

### Format du `.env`

```
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/dev
JWT_SECRET=devsecret-not-for-prod
LOG_LEVEL=DEBUG
DEBUG=true
```

- Pas d'espaces autour de `=`.
- Pas de guillemets nécessaires (sauf si la valeur contient `#` ou des espaces).
- Les commentaires commencent par `#`.

### `.gitignore` obligatoire

```
# .gitignore
.env
.env.local
.env.*.local
```

Et fournir un **`.env.example`** dans le repo, pour documenter les variables attendues :

```
# .env.example
DATABASE_URL=postgresql://...
JWT_SECRET=changeme
LOG_LEVEL=INFO
DEBUG=false
```

Ce fichier-là est commité, sans secrets réels. Il sert de modèle.

---

## 4. Multi-environnement (dev / staging / prod)

### Stratégie 1 — Un `.env` par environnement

```
.env.dev
.env.staging
.env.prod
```

On charge dynamiquement le bon :

```python
import os

env = os.environ.get("ENV", "dev")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=f".env.{env}")
    ...
```

Lancement : `ENV=staging uvicorn main:app`.

Simple, mais nécessite que chaque environnement maintienne son fichier.

### Stratégie 2 — `.env` local + variables CI/CD

C'est l'approche la plus courante :

- **En dev** : un fichier `.env` local (ignoré par Git).
- **En staging/prod** : les variables sont injectées par la plateforme (Docker env, Kubernetes secrets, AWS Parameter Store, etc.).

Le code charge simplement `.env` quand il existe, et utilise les variables OS sinon.

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    ...
```

Pas de duplication de fichiers ; les secrets de prod ne sont jamais dans un fichier.

### Stratégie 3 — Settings par environnement (héritage)

Quand les configs divergent fortement, on peut hériter :

```python
class BaseConfig(BaseSettings):
    app_name: str = "My API"

class DevConfig(BaseConfig):
    debug: bool = True
    database_url: str = "sqlite:///./dev.db"

class ProdConfig(BaseConfig):
    debug: bool = False
    database_url: str  # obligatoire, pas de default

def get_settings():
    env = os.environ.get("ENV", "dev")
    return {"dev": DevConfig, "prod": ProdConfig}[env]()
```

Plus structuré pour des écarts importants, mais plus de code à maintenir. À réserver aux cas où la simple variable d'environnement ne suffit pas.

---

## 5. Settings comme dépendance FastAPI

### Anti-pattern — instance globale

```python
# ✗ À éviter dans une vraie app
settings = Settings()

@app.get("/health")
def health():
    return {"app": settings.app_name}
```

L'instance est créée à l'import du module — donc aussi pendant les tests, ce qui rend difficile l'injection d'une config différente.

### Pattern recommandé — `Depends(get_settings)`

```python
# src/my_api/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    app_name: str
    database_url: str
    jwt_secret: str

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

```python
# src/my_api/routers/health.py
from fastapi import APIRouter, Depends
from my_api.config import Settings, get_settings

router = APIRouter()

@router.get("/health")
def health(settings: Settings = Depends(get_settings)):
    return {"app": settings.app_name}
```

`@lru_cache` garantit qu'on ne lit le `.env` qu'une seule fois — l'instance est mise en cache après le premier appel.

`Depends(get_settings)` permet de **surcharger** la config dans les tests, en remplaçant le provider :

```python
def override_settings():
    return Settings(database_url="sqlite:///./test.db", jwt_secret="test")

app.dependency_overrides[get_settings] = override_settings
```

L'injection de dépendances est approfondie en **M6**. L'idée à retenir ici : `get_settings` est lui-même une dépendance — testable, surchargeable, isolé.

---

## 6. Bonnes pratiques

### Ne jamais commiter de secret

Le mantra : **un secret commité = un secret compromis**, même si supprimé après. Git conserve l'historique. Si ça arrive :

1. **Révoquer** immédiatement le secret (côté service).
2. **Émettre** un nouveau secret.
3. **Nettoyer l'historique** (cf. `git filter-repo` ou `BFG Repo-Cleaner`) — mais le secret originel est mort.

### Validation à l'instanciation

Pydantic Settings valide à `Settings()`. Profitez-en pour **échouer au démarrage**, pas à la première requête :

```python
class Settings(BaseSettings):
    database_url: str   # pas de default → obligatoire

    @field_validator("database_url")
    @classmethod
    def validate_db_url(cls, v: str) -> str:
        if not v.startswith(("postgresql://", "sqlite:///")):
            raise ValueError("Unsupported database scheme")
        return v
```

Un mauvais `.env` fait crasher l'app au boot — bien mieux qu'un crash 30 minutes plus tard sur un endpoint rare.

### Types riches pour valider

```python
from pydantic import HttpUrl, SecretStr, PostgresDsn

class Settings(BaseSettings):
    database_url: PostgresDsn
    sentry_dsn: HttpUrl | None = None
    jwt_secret: SecretStr
```

`PostgresDsn` valide la forme `postgresql://...`. `SecretStr` masque la valeur dans les logs et `repr()`.

### Préfixe pour grouper

Si plusieurs services partagent une convention, on peut préfixer :

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MYAPI_")

    database_url: str   # lit MYAPI_DATABASE_URL
    jwt_secret: str     # lit MYAPI_JWT_SECRET
```

Utile en environnement partagé (CI/CD multi-app).

### Settings imbriqués

Pour grouper logiquement :

```python
class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DB_")
    url: str
    pool_size: int = 5

class Settings(BaseSettings):
    database: DatabaseSettings = DatabaseSettings()
    app_name: str = "My API"
```

Lecture des variables `DB_URL`, `DB_POOL_SIZE`, etc. Accès via `settings.database.url`.

---

## 7. Exercices pratiques

### Exercice 1 — Première Settings (≈ 15 min)

1. Créer `config.py` avec une classe `Settings(BaseSettings)` contenant :
   - `app_name: str = "Test API"`.
   - `database_url: str` (obligatoire).
   - `log_level: str = "INFO"`.
2. Créer un `.env` avec `DATABASE_URL=sqlite:///./test.db` et `LOG_LEVEL=DEBUG`.
3. Instancier et afficher `settings.database_url`.
4. Lancer sans le `.env` → constater l'erreur de validation.

### Exercice 2 — Injection comme dépendance (≈ 25 min)

Refactorer un endpoint existant pour qu'il prenne `settings: Settings = Depends(get_settings)`. Décorer `get_settings` avec `@lru_cache`.

Vérifier dans les logs que `get_settings()` n'est appelé qu'**une seule fois**, même sur 100 requêtes successives.

### Exercice 3 — Multi-env via variable `ENV` (≈ 25 min)

Implémenter la stratégie 1 : un fichier par environnement.

- `.env.dev` avec `LOG_LEVEL=DEBUG`.
- `.env.prod` avec `LOG_LEVEL=WARNING`.
- Code qui lit `ENV=dev` ou `ENV=prod` (variable OS) et choisit le bon `.env`.

Tester : `ENV=prod uvicorn main:app` vs `ENV=dev uvicorn main:app`. Constater que `settings.log_level` diffère.

### Exercice 4 — Types riches et validation (≈ 20 min)

Renforcer la classe `Settings` :

- `database_url: PostgresDsn`.
- `sentry_dsn: HttpUrl | None = None`.
- `jwt_secret: SecretStr` (au moins 16 caractères, validé par `@field_validator`).

Tester avec des valeurs invalides — vérifier que l'app crash au démarrage avec un message clair.

### Exercice 5 — Surcharge pour les tests (≈ 25 min)

1. Écrire un test pytest qui appelle `/health` via `TestClient` (cf. M11 — préview ici).
2. Avant l'appel, surcharger `get_settings` :

```python
from fastapi.testclient import TestClient

def fake_settings():
    return Settings(database_url="sqlite:///./test.db", jwt_secret="testsecret123456")

app.dependency_overrides[get_settings] = fake_settings

with TestClient(app) as client:
    response = client.get("/health")
```

Vérifier que les tests utilisent bien `sqlite:///./test.db` même sans `.env`.

---

## 8. Mini-défi de synthèse (≈ 1,5 heure)

Reprendre le **mini-défi M4** (API de bibliothèque) et y ajouter :

**Configuration externalisée** :

- `app_name`, `version` (avec default).
- `database_url` (obligatoire, validé en `PostgresDsn`).
- `jwt_secret` (obligatoire, en `SecretStr`, ≥ 32 caractères).
- `cors_allowed_origins: list[str]` (default `[]`).
- `debug: bool = False`.

**Multi-env** :

- `.env.example` commité (avec les noms de variables sans secrets).
- `.env.dev` et `.env.test` (gitignored).
- Variable `ENV` qui charge le bon fichier.

**Injection** :

- `get_settings()` décoré `@lru_cache`.
- Au moins 2 endpoints qui utilisent `Settings` via `Depends`.

**Test** :

- Un test pytest qui surcharge `get_settings` pour pointer vers une DB de test, et qui passe.

**Validation finale** :

- Au démarrage, si `JWT_SECRET` est absent ou trop court, l'app **crash avec un message clair** — pas un crash à la première requête.

---

## 9. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant peut expliquer pourquoi externaliser la config (3 raisons).
- [ ] Il sait créer une classe `Settings(BaseSettings)` avec `env_file` configuré.
- [ ] Il distingue `.env`, `.env.example`, `.env.local` et leur traitement Git.
- [ ] Il sait charger une configuration différente par environnement (stratégie 1 ou 2).
- [ ] Il utilise `get_settings()` avec `@lru_cache` et `Depends`.
- [ ] Il sait surcharger la config dans les tests.
- [ ] Le mini-défi est implémenté et crash proprement sur config invalide.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : injection de valeurs différentes selon l'environnement (`pydantic-settings`, `.env`).

---

## 10. Ressources complémentaires

- **Documentation pydantic-settings** : [docs.pydantic.dev/latest/concepts/pydantic_settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/). Référence officielle.
- **The Twelve-Factor App** : [12factor.net](https://12factor.net/). Le manifeste des bonnes pratiques cloud-native. Le facteur III (_Config_) et le facteur X (_Dev/Prod parity_) sont directement applicables ici.
- **Documentation FastAPI** : _Settings and Environment Variables_ dans le _Advanced User Guide_.
- **Real Python** — article _Using Python Pydantic Settings_.
