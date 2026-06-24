# M12 — ASGI et comparatifs

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est **WSGI** et pourquoi il a régné sur Python pendant 15 ans.
- Décrire **ASGI** et le besoin auquel il répond (async, WebSockets, streaming).
- Comparer honnêtement **FastAPI vs Flask** et **FastAPI vs Django (DRF)**.
- Identifier les cas où **FastAPI n'est pas le bon choix**.
- Rédiger une **note technique** argumentée pour défendre un choix de framework devant une équipe.

## Durée estimée

0,5 jour (plus théorique que pratique, à 80 % de la lecture et de la rédaction).

## Pré-requis

- M1 à M11 terminés.

---

## 1. WSGI — le standard historique

### Contexte

**WSGI** = _Web Server Gateway Interface_, défini en **2003 par la PEP 333** (révisée par la PEP 3333 en 2010). C'est le contrat entre :

- Un **serveur HTTP** (Apache + mod_wsgi, Gunicorn, uWSGI).
- Une **application Python** (Django, Flask, Pyramid, Bottle).

L'interface est minimaliste : une fonction `app(environ, start_response)` qui prend une requête et renvoie une réponse. Le serveur appelle l'app **une fois par requête, synchroniquement**.

**Analogie.** Une prise électrique murale standard. Un fil arrive, un appareil se branche, l'électricité circule, le cycle se termine. C'est simple, universel, mais conçu pour des appareils ponctuels.

### Conséquence

- **Modèle synchrone par construction** : un thread ou un process par requête.
- **Pas de WebSocket** : WSGI ne sait pas faire de connexion longue.
- **Pas de streaming bidirectionnel** : on peut streamer dans un sens (réponse en chunks), pas dans l'autre.
- **Pas d'async natif** : `async def` n'est pas exploitable côté serveur tant qu'on est en WSGI.

C'est suffisant pour 80 % des cas (CRUD, pages HTML, dashboards). Mais le monde a évolué vers le temps réel, et WSGI ne suit plus.

---

## 2. ASGI — la suite moderne

### Contexte

**ASGI** = _Asynchronous Server Gateway Interface_, lancé en **2018** par Andrew Godwin (créateur de Django Channels). Conçu pour :

- Le support natif d'`async / await`.
- Les **WebSockets** et autres protocoles long-lived.
- Le streaming bidirectionnel.
- Le multi-protocole (HTTP, WebSocket, lifespan events).

L'interface est plus riche : une coroutine `app(scope, receive, send)` qui gère un cycle de vie complet et peut envoyer ou recevoir des événements à tout moment.

**Analogie.** Un boîtier de connexion multi-protocole avec lifecycle managé : USB, jack, HDMI, alimentation continue, déconnexion gérée. Conçu pour les appareils modernes qui ont besoin de plus qu'un simple aller-retour.

### Ce qu'ASGI permet

- `async def` natif côté serveur (event loop dans le worker).
- WebSockets en first-class.
- Server-Sent Events, HTTP/2 streaming.
- Évènements `lifespan` (startup / shutdown) propres.
- Background tasks ASGI (cf. M10).

### Serveurs ASGI

- **Uvicorn** — basé sur uvloop, très rapide. Standard de fait.
- **Hypercorn** — supporte HTTP/2 et HTTP/3.
- **Daphne** — historique, créé pour Django Channels.

---

## 3. Tableau comparatif WSGI vs ASGI

| Dimension                | WSGI                        | ASGI                                        |
| ------------------------ | --------------------------- | ------------------------------------------- |
| Année                    | 2003 (PEP 333)              | 2018                                        |
| Modèle                   | Synchrone                   | Synchrone + asynchrone                      |
| `async def` côté serveur | Non                         | Oui                                         |
| WebSockets               | Non                         | Oui                                         |
| Lifespan events          | Non                         | Oui                                         |
| Streaming bidir          | Non                         | Oui                                         |
| Multi-protocole          | HTTP seul                   | HTTP + WS + autres                          |
| Serveurs                 | Gunicorn, uWSGI, mod_wsgi   | Uvicorn, Hypercorn, Daphne                  |
| Frameworks               | Flask, Django <3.0, Pyramid | FastAPI, Starlette, Django ≥ 3.0 (Channels) |
| Performance brute (sync) | Comparable                  | Comparable                                  |
| Performance scaling I/O  | Limitée (1 thread = 1 req)  | Élevée (1 thread = N coroutines)            |

### Migration WSGI → ASGI

Django **3.0+** supporte ASGI optionnellement (peut tourner en sync ou en async). Flask reste WSGI à ce jour (Quart est l'équivalent async de Flask, ASGI).

Migrer un projet WSGI vers ASGI n'apporte un gain **que si** :

- Les libs I/O utilisées ont une version async.
- Les workloads sont à dominante I/O-bound (cf. Python M5).

Sinon, c'est une complexité ajoutée sans bénéfice mesurable.

---

## 4. FastAPI vs Flask

### Caractéristiques comparées

| Aspect                   | Flask                      | FastAPI                            |
| ------------------------ | -------------------------- | ---------------------------------- |
| Année                    | 2010                       | 2018                               |
| Modèle                   | WSGI synchrone             | ASGI async natif                   |
| Validation auto          | Non (Marshmallow en addon) | Oui, via Pydantic                  |
| Documentation auto       | Non (Flasgger en addon)    | Oui (Swagger, ReDoc)               |
| Async natif              | Limité (Flask 2.0+)        | Oui                                |
| Type hints               | Optionnels                 | Cœur de l'API                      |
| Performance              | Bonne                      | Excellente (uvloop, async)         |
| Maturité de l'écosystème | Très étendu                | Croissant rapidement               |
| Courbe d'apprentissage   | Très douce                 | Douce (si à l'aise avec les types) |
| Communauté               | Très large                 | Très large, jeune                  |

### Quand préférer Flask

- Projet **legacy** ou existant déjà en Flask — pas de raison de migrer "pour la beauté".
- Besoin d'une **stack ultra-minimaliste** sans validation typée (scripts internes, prototypes).
- **Plugins Flask** essentiels au projet et sans équivalent (Flask-Admin par exemple).

### Quand préférer FastAPI

- API REST/JSON avec **validation stricte** et documentation auto-générée.
- Workloads **I/O-bound** (DB, HTTP externe, files).
- Équipe à l'aise avec les **annotations de types**.
- Besoin de **performance** native sur des microservices.

---

## 5. FastAPI vs Django (REST Framework)

### Caractéristiques comparées

| Aspect                 | Django + DRF                     | FastAPI                                |
| ---------------------- | -------------------------------- | -------------------------------------- |
| Philosophie            | "Batteries included"             | Minimaliste, à composer                |
| ORM                    | Intégré (excellent)              | Aucun (SQLAlchemy / Tortoise au choix) |
| Admin                  | Intégré                          | Aucun                                  |
| Templating HTML        | Intégré                          | Aucun (Jinja2 en addon)                |
| Migrations DB          | Intégré                          | Alembic en addon                       |
| Auth (sessions, users) | Intégré                          | À implémenter (cf. M9)                 |
| Validation             | Serializers DRF                  | Pydantic                               |
| Async support          | Partiel (à partir de Django 4.1) | Natif                                  |
| Performance            | Bonne                            | Excellente                             |
| Documentation auto     | drf-yasg, drf-spectacular        | Native                                 |
| Courbe d'apprentissage | Plus longue                      | Plus courte                            |
| Convention vs liberté  | Conventions fortes               | Liberté forte                          |

### Quand préférer Django + DRF

- Projet **monolithique** avec aspects HTML + API + admin.
- **Modèle riche** avec besoin d'un admin instantané (CRM, back-office).
- Équipe habituée aux conventions Django, gain de vélocité immédiate.
- Migration et historique d'écriture DB demandant l'ORM Django.
- **Faible appétit pour la composition** : on veut un cadre prêt à l'emploi.

### Quand préférer FastAPI

- API **uniquement** (pas d'HTML server-side rendering).
- Besoin de **performances** ou de patterns async-first.
- Liberté dans le choix de la DB, ORM, auth, cache.
- Architecture **microservices**.
- Équipe à l'aise avec la composition explicite.

### Ce qui ne change pas

Dans les deux cas, on peut faire :

- Une API REST production-ready.
- De l'authentification JWT.
- De la documentation OpenAPI.
- Des tests d'intégration.

Le débat **"lequel est meilleur"** est mal posé. La bonne question : **lequel est le mieux adapté à mon contexte ?**

---

## 6. Quand ne PAS utiliser FastAPI

FastAPI brille sur certains cas. Sur d'autres, ce n'est pas le bon outil :

- **Application full-stack avec rendu HTML lourd côté serveur** — Django est meilleur (Jinja2 sur FastAPI fonctionne, mais on perd les bénéfices de Django).
- **Back-office riche avec besoin d'admin instantané** — Django Admin n'a pas d'équivalent FastAPI.
- **Équipe peu à l'aise avec les types** — la friction Pydantic peut ralentir au début.
- **Petit script ponctuel** — Flask reste plus léger pour un microservice de 5 endpoints.
- **Projet legacy stable en Flask/Django** — migrer "pour migrer" est une perte sèche.

L'erreur classique : **choisir un framework parce qu'il est à la mode**. Choisir parce qu'il résout _votre_ problème.

---

## 7. Mini-projet de réflexion — la note technique

### L'exercice principal du module

Rédiger une **note technique** d'une page (~500 mots) qui :

1. **Contextualise** un projet hypothétique (description, contraintes, équipe).
2. **Compare** 2 ou 3 frameworks candidats (FastAPI, Flask, Django).
3. **Recommande** un choix avec arguments.
4. **Anticipe** les risques de ce choix.

Cette note est l'élément de validation principal du module. Elle force à articuler les concepts au-delà du code.

### Plan-type

```
1. Contexte
   - Projet : ...
   - Charge attendue : ...
   - Équipe : ... (taille, niveau, expertise)
   - Contraintes : (délai, intégrations, sécurité, etc.)

2. Options examinées
   - Option A : ...
     - Forces, faiblesses, fit avec le contexte
   - Option B : ...
   - Option C : ...

3. Recommandation
   - Choix : ...
   - Arguments clés (3 à 5)

4. Risques et mitigations
   - Risque 1 : ... → mitigation : ...
   - Risque 2 : ... → mitigation : ...

5. Décision révisable
   - Critères qui justifieraient de revoir ce choix dans 6 mois.
```

### Bons critères de notation

- La note **ne tranche pas avant** d'avoir comparé.
- Les arguments sont **liés au contexte**, pas génériques ("FastAPI est rapide" n'est pas un argument suffisant).
- Les **risques** sont identifiés et mitigés (pas balayés).
- La position est **assumée** : le rédacteur recommande, il n'hésite pas.

---

## 8. Exercices pratiques

### Exercice 1 — Comprendre l'interface WSGI (≈ 15 min)

Écrire une mini-app WSGI **sans framework** :

```python
def app(environ, start_response):
    status = "200 OK"
    headers = [("Content-Type", "application/json")]
    start_response(status, headers)
    return [b'{"hello": "world"}']
```

Lancer avec Gunicorn : `gunicorn my_module:app`. Tester avec `curl`.

But : **ressentir** le contrat minimaliste WSGI (et apprécier ce que FastAPI ajoute).

### Exercice 2 — Comprendre l'interface ASGI (≈ 25 min)

Écrire une mini-app ASGI **sans framework** :

```python
async def app(scope, receive, send):
    assert scope["type"] == "http"
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [(b"content-type", b"application/json")],
    })
    await send({
        "type": "http.response.body",
        "body": b'{"hello": "asgi"}',
    })
```

Lancer avec Uvicorn : `uvicorn my_module:app`. Tester avec `curl`.

But : voir le **flux d'événements** ASGI brut (start + body, deux messages).

### Exercice 3 — WebSocket ASGI minimal (≈ 25 min)

Étendre l'exercice 2 pour répondre à un **WebSocket** :

```python
async def app(scope, receive, send):
    if scope["type"] == "websocket":
        await receive()             # connection event
        await send({"type": "websocket.accept"})
        while True:
            msg = await receive()
            if msg["type"] == "websocket.disconnect":
                break
            await send({
                "type": "websocket.send",
                "text": f"echo: {msg.get('text', '')}",
            })
    elif scope["type"] == "http":
        # comme exercice 2
        ...
```

Tester avec un client WebSocket en ligne. But : sentir ce qu'ASGI **permet** que WSGI ne pourrait pas.

### Exercice 4 — Migrer un endpoint Flask vers FastAPI (≈ 30 min)

Prendre un endpoint Flask :

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/items", methods=["POST"])
def create_item():
    data = request.json
    if "name" not in data or "price" not in data:
        return jsonify({"error": "missing fields"}), 400
    if not isinstance(data["price"], (int, float)) or data["price"] < 0:
        return jsonify({"error": "invalid price"}), 400
    return jsonify({"id": 1, **data}), 201
```

Le réécrire en FastAPI. Comparer le nombre de lignes, la lisibilité, et la documentation automatique générée.

### Exercice 5 — Tableau de décision (≈ 20 min)

Pour 5 projets hypothétiques, **noter** quel framework recommander :

1. _API publique de météo, charge variable, équipe data engineering_.
2. _Plateforme de gestion d'écoles avec back-office riche et user-facing_.
3. _Microservice de webhooks pour Slack, 3 endpoints_.
4. _Refonte d'un CRUD interne legacy écrit en Flask 2014_.
5. _Plateforme de streaming temps réel avec WebSockets et SSE_.

Justifier en 2-3 lignes par projet. Confronter avec un collègue ou un mentor si possible.

---

## 9. Mini-défi de synthèse — la note technique complète (≈ 2 heures)

Choisir l'un des 5 projets de l'exercice 5 et rédiger une **note technique complète** en suivant le plan de la section 7.

Critères de validation :

- [ ] La note tient sur **1 à 2 pages** (500 à 1000 mots).
- [ ] Au moins **2 frameworks** sont comparés en profondeur.
- [ ] Les arguments sont **chiffrés** quand c'est possible (perf, time-to-market, jours de dev).
- [ ] Une **recommandation claire** est assumée.
- [ ] Au moins **3 risques** sont identifiés et mitigés.
- [ ] Le document est **lisible par un manager non-tech** (vocabulaire accessible, sans pour autant simplifier à outrance).

Optionnel : présenter la note à voix haute en 5 minutes — c'est l'exercice ultime pour vérifier qu'on tient la position.

---

## 10. Auto-évaluation

Le module M12 est validé lorsque :

- [ ] L'apprenant peut définir WSGI et ASGI en deux phrases chacun.
- [ ] Il connaît 3 différences fondamentales entre WSGI et ASGI.
- [ ] Il peut citer 2 raisons de préférer FastAPI à Flask, et 2 raisons de l'éviter.
- [ ] Il peut citer 2 raisons de préférer FastAPI à Django + DRF, et 2 raisons de l'éviter.
- [ ] Il identifie 3 situations où FastAPI n'est pas le bon choix.
- [ ] La note technique est rédigée et défendable à l'oral.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : expliquer ce qu'est ASGI et pourquoi FastAPI s'appuie dessus, avantages de la validation FastAPI par rapport à Django REST Framework.
- **N3** (préfiguration) : conseiller quand utiliser FastAPI vs Django / Flask.

---

## 11. Ressources complémentaires

- **PEP 3333** — _Python Web Server Gateway Interface v1.0.1_ — la spec WSGI moderne.
- **ASGI specification** : [asgi.readthedocs.io](https://asgi.readthedocs.io). La spec officielle ASGI.
- **Documentation FastAPI** : _Alternatives, Inspiration and Comparisons_ — argumentation officielle de Sebastián Ramírez sur les choix de FastAPI face aux autres frameworks.
- **Andrew Godwin** — _Putting Channels in core_ (blog 2018, contexte de la création d'ASGI).
- **TechEmpower benchmarks** : [techempower.com/benchmarks](https://www.techempower.com/benchmarks/). Données chiffrées de comparaison de performances entre frameworks.
- **Django documentation** : _Asynchronous support_ — pour comprendre comment Django se rapproche progressivement d'ASGI.
