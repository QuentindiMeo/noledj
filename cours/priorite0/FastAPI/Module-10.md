# M10 — Async et tâches différées

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **`def`** et **`async def`** dans FastAPI et savoir lequel utiliser.
- Comprendre comment FastAPI dispatche les endpoints (event loop vs thread pool).
- Identifier le **piège du blocking** dans une coroutine `async`.
- Utiliser **`BackgroundTasks`** pour différer un traitement après la réponse.
- Connaître les **limites** des Background Tasks (in-process, non durable).
- Choisir entre Background Tasks et une vraie task queue (Celery, Arq, Dramatiq).

## Durée estimée

0,5 à 0,75 jour.

## Pré-requis

- M1 à M9 terminés.
- Parcours Python M5 (concurrence, GIL, asyncio).

---

## 1. `def` vs `async def` dans FastAPI

### Le rappel

Une fonction Python peut être **synchrone** (`def`) ou **asynchrone** (`async def`).

- `def` — exécution séquentielle classique.
- `async def` — coroutine, doit être `await`ed dans un event loop. Permet de céder le contrôle pendant les attentes I/O.

FastAPI accepte **les deux** pour ses endpoints — c'est l'une de ses forces. Mais le comportement diffère :

| Type de fonction | Comportement FastAPI                                                |
| ---------------- | ------------------------------------------------------------------- |
| `async def`      | Exécuté **directement dans l'event loop**.                          |
| `def`            | Exécuté **dans un thread pool** (pour ne pas bloquer l'event loop). |

**Analogie.** L'event loop est un serveur dans un café : une seule personne prend les commandes, mais pendant qu'un café coule (I/O), elle s'occupe du client suivant. Si on lui confie une tâche bloquante (un sandwich à préparer = `def`), elle délègue à un assistant en cuisine (thread pool) pour ne pas figer la file d'attente.

### Conséquence pratique

```python
@app.get("/sync")
def sync_endpoint():
    time.sleep(1)        # bloque 1s — mais dans un thread, donc l'event loop continue
    return {"ok": True}

@app.get("/async")
async def async_endpoint():
    await asyncio.sleep(1)   # cède 1s à l'event loop — pleinement non-bloquant
    return {"ok": True}
```

Les deux fonctionnent. Sur 100 requêtes simultanées, les deux versions répondent en ~1 s globalement (pas 100 s) — l'un grâce au thread pool, l'autre grâce à l'event loop. Le **bénéfice net** côté async vient des **bibliothèques async natives** : HTTP client (`httpx`), DB (`asyncpg`, SQLAlchemy async), Redis (`aioredis`)...

---

## 2. Quand utiliser `async def` ?

### Règle de décision

| Endpoint utilise...                                                  | Choisir                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| Uniquement des opérations CPU (pas d'I/O)                            | `def`                                                 |
| Des libs **async natives** (httpx, asyncpg, motor, redis-async...)   | `async def` + `await`                                 |
| Des libs **synchrones uniquement** (requests, psycopg2 classique...) | `def`                                                 |
| Mix sync + async                                                     | `async def` + `run_in_executor` pour les parties sync |

### Exemple — appel HTTP

**Mauvais — bloquant dans `async def`** :

```python
import requests   # ✗ lib synchrone

@app.get("/weather")
async def get_weather():
    response = requests.get("https://api.weather.com/...")  # ✗ bloque l'event loop !
    return response.json()
```

`requests` bloque le thread pendant que l'event loop est figé — toute l'app ralentit.

**Bon — async natif** :

```python
import httpx   # ✓ lib async-friendly

@app.get("/weather")
async def get_weather():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.weather.com/...")
    return response.json()
```

L'`await` cède proprement le contrôle pendant la requête HTTP.

**Acceptable — code sync dans `def`** :

```python
@app.get("/weather")
def get_weather():
    response = requests.get("https://api.weather.com/...")   # OK dans def
    return response.json()
```

FastAPI envoie cet endpoint dans le thread pool. Le service reste responsive.

### Le critère ultime

> Si toutes les libs I/O de l'endpoint sont async → `async def`.
> Si au moins une est sync → `def`.

Ne **jamais** mélanger une lib sync (bloquante) dans une fonction `async def` sans wrapper — c'est le piège principal.

---

## 3. Le piège du blocking dans `async def`

### Symptôme

L'app paraît rapide en charge faible, mais s'écroule en charge élevée. Quelques requêtes "lentes" font ramer toutes les autres. La latence explose.

### Cause

Un appel **bloquant** (synchrone, non-await) **fige** l'event loop. Pendant ce temps, toutes les autres coroutines attendent. C'est comme si la file d'attente du café s'arrêtait parce que le serveur s'est immobilisé.

### Exemples de pièges

```python
@app.get("/")
async def endpoint():
    time.sleep(0.5)           # ✗ — bloque 500ms
    requests.get("...")        # ✗ — bloque le temps de la requête
    cpu_heavy_computation()    # ✗ — bloque jusqu'à fin du calcul
    psycopg2_conn.execute(...) # ✗ — bloque
```

### Solutions

**1. Utiliser des libs async natives.**

```python
import asyncio
import httpx

await asyncio.sleep(0.5)                                # ✓
await httpx.AsyncClient().get("...")                    # ✓
await asyncpg_conn.fetch("...")                          # ✓
```

**2. Si la lib est sync, déléguer au thread pool via `run_in_executor` ou `asyncio.to_thread`.**

```python
import asyncio

@app.get("/heavy")
async def heavy():
    result = await asyncio.to_thread(cpu_heavy_computation)
    return result
```

`asyncio.to_thread` (Python 3.9+) exécute la fonction dans le thread pool d'asyncio, sans bloquer l'event loop.

**3. Si la fonction est purement CPU-bound, considérer un process pool.**

```python
from concurrent.futures import ProcessPoolExecutor

executor = ProcessPoolExecutor()

@app.get("/heavy-cpu")
async def heavy_cpu():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, cpu_heavy_function)
```

Pour les vrais calculs CPU lourds, un process pool contourne le GIL (cf. Python M5).

---

## 4. `BackgroundTasks` — différer un traitement

### Le besoin

Certaines opérations doivent se faire **après** la réponse au client :

- Envoyer un email de confirmation.
- Logger une trace métier dans un système externe.
- Invalider un cache.
- Notifier un webhook.

Faire ces opérations **dans l'endpoint** rallonge la latence inutilement — le client attend la fin de l'email pour recevoir sa confirmation HTTP.

**Analogie.** Un livreur qui dépose ton colis et **ensuite** prévient la centrale qu'il a livré. Tu n'attends pas qu'il finisse son appel pour signer le bon de livraison.

### Syntaxe FastAPI

```python
from fastapi import BackgroundTasks


def send_email(to: str, subject: str, body: str):
    # envoi SMTP, peut prendre 1-2 s
    smtp.send(to, subject, body)


@app.post("/signup", status_code=201)
def signup(payload: SignupRequest, tasks: BackgroundTasks):
    user = create_user(payload)
    tasks.add_task(send_email, user.email, "Welcome!", "Hello and welcome...")
    return {"id": user.id}
```

Mécanique :

1. L'endpoint s'exécute, renvoie la réponse au client.
2. **Après** que la réponse est envoyée, FastAPI exécute les tâches enregistrées dans l'ordre.
3. Le client a déjà sa réponse — la tâche n'impacte pas sa latence perçue.

### Plusieurs tâches

```python
tasks.add_task(send_email, ...)
tasks.add_task(invalidate_cache, ...)
tasks.add_task(notify_webhook, ...)
```

Toutes s'exécutent séquentiellement après la réponse. Si l'une lève une exception, les suivantes ne sont **pas** appelées (sauf à les wrapper en try/except).

### `BackgroundTasks` dans une dépendance

Une dépendance peut elle-même injecter des tâches :

```python
def with_audit(tasks: BackgroundTasks, user: CurrentUser):
    def audit(action: str):
        tasks.add_task(log_action, user.id, action)
    return audit


@app.post("/orders")
def create_order(payload: ..., audit=Depends(with_audit)):
    order = ...
    audit("order.created")
    return order
```

Pratique pour factoriser le logging d'audit transversal.

---

## 5. Limites des Background Tasks

`BackgroundTasks` est volontairement **simple**. À connaître :

### Limites

1. **In-process** — si l'app crash entre la réponse et l'exécution de la tâche, **la tâche est perdue**.
2. **Pas de persistance** — pas de retry, pas de queue durable, pas d'observabilité.
3. **Pas de planification** — pas de "dans 10 minutes" ou "à 18h".
4. **Pas de scaling horizontal** — la tâche s'exécute sur l'instance qui a reçu la requête. Pas de répartition entre workers.
5. **Bloque le shutdown** — un graceful shutdown attend la fin des tâches en cours. Une tâche très longue retarde le redémarrage.

### Quand c'est OK

- Email transactionnel **non critique** (si on perd 1 email sur 10 000 lors d'un crash, c'est gérable).
- Log d'audit best-effort.
- Webhook fire-and-forget vers un système robuste.
- Invalidation de cache.

### Quand c'est insuffisant

- Email de réinitialisation de mot de passe (perdre, c'est bloquer l'utilisateur).
- Traitement long (> 30 s).
- Job planifié récurrent.
- Workflow nécessitant des retries.

---

## 6. Alternatives — vraies task queues

Quand `BackgroundTasks` ne suffit plus, on passe à une **task queue** durable :

| Outil          | Caractéristiques                                                              |
| -------------- | ----------------------------------------------------------------------------- |
| **Celery**     | Le plus mature, large écosystème. Broker Redis ou RabbitMQ. Workers séparés.  |
| **Arq**        | Async-first, simple. Broker Redis. Conçu pour les apps asyncio modernes.      |
| **Dramatiq**   | Simple, performant, broker Redis ou RabbitMQ. Alternative légère à Celery.    |
| **RQ**         | Minimaliste, Redis uniquement, Python uniquement.                             |
| **Faststream** | Async, intégration native FastAPI. Pour event-driven (Kafka, NATS, RabbitMQ). |

**Pattern général** :

```
FastAPI app  → publie un job → broker (Redis/RabbitMQ) → worker → exécution
              renvoie la réponse                        ↑ persistant, retryable
```

Le **worker est un processus séparé** — il peut être scalé indépendamment, redémarré sans toucher à l'app HTTP.

### Heuristique de choix

- **Background Tasks** — durée < 5 s, perte tolérable, simplicité prioritaire.
- **Arq / Dramatiq / Celery** — durée > 5 s, ou retry nécessaire, ou job planifié, ou volume élevé.

Ne pas surinvestir : commencer avec Background Tasks, basculer quand le besoin est avéré.

---

## 7. Exercices pratiques

### Exercice 1 — Comparer `def` et `async def` (≈ 20 min)

Implémenter deux endpoints :

```python
@app.get("/sync-sleep")
def sync_sleep():
    time.sleep(1)
    return {"type": "sync"}

@app.get("/async-sleep")
async def async_sleep():
    await asyncio.sleep(1)
    return {"type": "async"}
```

Faire 20 requêtes simultanées à chaque endpoint (avec `httpx`, `curl` en parallèle, ou un outil de load test). Mesurer le temps total.

Constater : les deux versions répondent en ~1 s globalement (FastAPI thread pool / event loop). La différence se ferait sentir avec des libs natives sync vs async.

### Exercice 2 — Détecter le blocking (≈ 25 min)

Implémenter :

```python
@app.get("/blocking-bad")
async def blocking_bad():
    time.sleep(2)   # ✗ bloque l'event loop
    return {"done": True}
```

Avec un autre endpoint async qui répond vite :

```python
@app.get("/fast")
async def fast():
    return {"ok": True}
```

Faire un appel `/blocking-bad` en arrière-plan, puis spam `/fast` pendant ce temps. Constater que `/fast` est ralenti — l'event loop est gelé.

Refactorer `blocking_bad` en utilisant `await asyncio.sleep(2)`. Refaire le test : `/fast` reste rapide.

### Exercice 3 — Wrapper du sync via `asyncio.to_thread` (≈ 25 min)

Définir une fonction lente synchrone (par exemple un calcul CPU ou un `time.sleep(1)`). L'appeler depuis un endpoint `async def` :

1. **Naïf** : appeler directement → bloque (cf. exercice 2).
2. **Correct** : `await asyncio.to_thread(slow_function, args)`.

Mesurer l'impact sur les autres endpoints async pendant l'exécution.

### Exercice 4 — `BackgroundTasks` simple (≈ 25 min)

Implémenter `POST /signup` qui :

1. Crée un user en mémoire.
2. Ajoute deux background tasks : `send_welcome_email(email)` et `notify_analytics(user_id)`.
3. Renvoie immédiatement `{"id": user.id}`.

Dans les fonctions de tâche, faire un `time.sleep(1)` et un `print` pour observer l'ordre :

```
Réponse renvoyée
send_welcome_email
notify_analytics
```

Mesurer la latence client : elle doit être <50 ms, **pas** 2 s.

### Exercice 5 — Audit via dépendance + tâche (≈ 25 min)

Implémenter une dépendance `audit_logger` qui :

1. Prend `BackgroundTasks` et le user courant en paramètres.
2. Retourne une fonction `audit(action: str)` que les endpoints peuvent appeler.
3. Chaque appel `audit("xxx")` enregistre une background task de log.

Utiliser sur 3 endpoints distincts. Vérifier que les logs apparaissent **après** la réponse client à chaque fois.

---

## 8. Mini-défi de synthèse (≈ 2 heures)

Étendre un projet existant (système d'auth M9 ou CRUD) avec une couche **notifications post-réponse** :

**Endpoints concernés** :

- `POST /signup` → email de bienvenue.
- `POST /password-reset/request` → email avec lien de réinitialisation.
- `POST /orders` → email de confirmation + appel webhook.
- `DELETE /account` → email d'adieu + log d'audit + appel webhook.

**Implémentation** :

- Utiliser `BackgroundTasks` pour toutes les notifications.
- L'endpoint répond en < 100 ms même si la fonction de notif sleep 2 s.
- En cas d'exception dans une tâche, les suivantes s'exécutent quand même (wrap try/except).
- Logger chaque tâche (début, fin, durée, succès/échec) avec un `request_id` (M8).

**Tests** :

- Mesurer la latence client : < 100 ms.
- Vérifier que les notifications partent **après** la réponse (observation des logs).
- Provoquer une exception dans une tâche : vérifier que les autres tournent.

**Bonus — bascule vers une task queue** :

- Identifier 2 endpoints où les notifications **ne devraient pas** être en Background Tasks (ex : email de reset → perte = problème).
- Documenter en commentaire quel outil utiliser (Arq, Celery...) et pourquoi.
- Pas besoin d'implémenter la bascule — juste argumenter.

---

## 9. Auto-évaluation

Le module M10 est validé lorsque :

- [ ] L'apprenant peut dire quand utiliser `async def` vs `def` en une phrase claire.
- [ ] Il sait identifier un appel bloquant dans une `async def` et le corriger.
- [ ] Il maîtrise `await asyncio.to_thread(...)` pour wrapper du sync.
- [ ] Il utilise `BackgroundTasks` pour différer un traitement.
- [ ] Il connaît les 5 limites principales de `BackgroundTasks`.
- [ ] Il peut citer 3 task queues et leur cas d'usage.
- [ ] Le mini-défi est implémenté avec une latence client < 100 ms.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : différence route synchrone / asynchrone (`def` vs `async def`), Background Tasks.

---

## 10. Ressources complémentaires

- **Documentation FastAPI** : _Concurrency and async / await_ — explication officielle de la dispatch `def` / `async def`.
- **Documentation FastAPI** : _Background Tasks_ — section du _Tutorial - User Guide_.
- **Documentation FastAPI** : _Bigger Applications - Background Tasks_ — pour les patterns avancés.
- **PEP 492** — _Coroutines with async and await syntax_ — base du modèle async Python.
- **Documentation asyncio** : `asyncio.to_thread`, `loop.run_in_executor`.
- **Arq** : [arq-docs.helpmanual.io](https://arq-docs.helpmanual.io) — alternative async-native à Celery.
- **Celery** : [docs.celeryq.dev](https://docs.celeryq.dev) — la référence task queue Python.
