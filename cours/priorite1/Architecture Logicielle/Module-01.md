# M1 — Cartographie des architectures

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Décrire en deux ou trois phrases chacune des **quatre familles d'architecture** : **n-tier**, **en couche / oignon**, **hexagonale**, **microservice**.
- **Reconnaître** dans un projet existant à quelle famille il appartient (et nommer les indices qui l'ont mis sur la piste).
- Distinguer les **quatre types de liens** entre composants : _dépendance fonctionnelle_, _communication_, _data flow_, _control flow_.
- Produire une **carte mentale comparative** des quatre architectures, lisible par un pair en moins de cinq minutes.

## Durée estimée

1 jour.

## Pré-requis

- Avoir déjà manipulé une application en production ou en projet, quelle qu'en soit l'architecture (ne serait-ce qu'un monolithe Django ou un projet FastAPI à plat).
- Vocabulaire de base : _classe_, _module_, _API_, _base de données_, _frontend / backend_.

---

## 1. Pourquoi parler d'architecture ?

### Le mot piégé

"Architecture logicielle" est un mot que tout le monde utilise et que personne ne définit de la même façon. Selon l'interlocuteur, on parle :

- **De découpage applicatif** : combien d'applications, comment elles communiquent.
- **De découpage interne** : comment le code d'**une** application est organisé.
- **D'infrastructure** : où tournent les choses, sur quoi, à quel coût.

Les quatre familles abordées ici mélangent volontairement ces niveaux : **n-tier** parle d'infrastructure, **en couche** d'organisation interne, **hexagonale** de couplage au monde extérieur, **microservice** de découpage applicatif. Ne pas chercher à les ranger dans une même grille — ce sont quatre **angles** différents pour décrire un système.

### Pourquoi en parler avant tout le reste

Sans vocabulaire commun, les discussions d'architecture tournent en rond. Quelqu'un parle d'"hexagonal" parce qu'il a lu un article, l'équipe applique "microservice" parce que c'était à la mode en 2018, le client demande "scalable" sans préciser quoi. Le rôle de ce module n'est pas de choisir — c'est de **poser le vocabulaire** pour que les modules suivants (M2 trade-offs, M3 CQRS, etc.) aient un socle.

**Analogie.** Avant de prescrire un sport, on apprend à reconnaître un terrain. La course sur piste, le trail, le sprint et le marathon sont quatre disciplines avec quatre logiques, quatre coûts, quatre profils d'athlète. On ne dit pas "c'est mieux le marathon" — on dit "c'est plus adapté à _ce_ contexte". Pareil pour les architectures.

---

## 2. Architecture n-tier (n niveaux)

### Définition

Un système est **n-tier** quand il est physiquement découpé en `n` niveaux d'exécution distincts, chacun avec une responsabilité dédiée et communiquant via le réseau.

Le découpage classique est **3-tier** :

1. **Tier de présentation** — ce qui parle à l'utilisateur (navigateur, app mobile, terminal).
2. **Tier applicatif (ou métier)** — la logique du système (API, services).
3. **Tier de données** — la persistance (base de données, file de messages, cache).

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Présentation  │ →  │    Applicatif   │ →  │     Données     │
│   (Navigateur)  │    │       (API)     │    │       (DB)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
       Tier 1                Tier 2                  Tier 3
```

**Analogie.** Un restaurant. La salle (présentation) prend la commande, la cuisine (applicatif) prépare le plat, la chambre froide (données) stocke les ingrédients. Chacun a son métier, ses outils, ses horaires. On peut changer le chef sans refaire la salle, et inversement.

### Variantes

- **2-tier** — client lourd parlant directement à la DB (ex : Access, vieux applicatifs métiers). Confidentiel aujourd'hui.
- **3-tier** — la norme historique des années 2000.
- **n-tier** (au-delà) — on insère des niveaux supplémentaires : _reverse proxy_, _API gateway_, _cache_, _CDN_, _bus de messages_. Chaque niveau supplémentaire ajoute un point d'optimisation mais aussi un point de panne.

### Marqueurs de reconnaissance

- Le terme "tier" sert à parler d'**infrastructure** : où le code tourne, sur quelle machine.
- Chaque tier est généralement **déployable indépendamment** sur sa propre VM, son propre conteneur, sa propre instance managée.
- Le découpage est **horizontal** (par couche d'infrastructure), pas par fonctionnalité métier.

### Limite à garder en tête

"n-tier" décrit la **topologie de déploiement**, pas l'organisation du code. Une application monolithique Django déployée en 3-tier reste un monolithe — le code n'est pas découpé pour autant. Confondre les deux est l'erreur de débutant la plus courante.

---

## 3. Architecture en couche (layered) et architecture oignon

### Architecture en couche — définition

Le code d'**une** application est organisé en **couches superposées**, chaque couche ne pouvant appeler **que** la couche immédiatement en dessous. La forme classique :

```
┌─────────────────────────────────────────┐
│            Couche présentation          │  ← Controllers, vues, DTO
├─────────────────────────────────────────┤
│             Couche applicative          │  ← Use cases, orchestration
├─────────────────────────────────────────┤
│              Couche domaine             │  ← Entités, règles métier
├─────────────────────────────────────────┤
│           Couche infrastructure         │  ← DB, HTTP, fichiers, queue
└─────────────────────────────────────────┘
```

Règle d'or : **une couche ne dépend que des couches en dessous d'elle.** La présentation peut appeler l'applicatif ; l'applicatif peut appeler le domaine ; le domaine ne sait rien de ce qui est au-dessus.

**Analogie.** Le bâtiment d'habitation. Le 4ᵉ étage s'appuie sur le 3ᵉ qui s'appuie sur le 2ᵉ qui s'appuie sur le 1ᵉʳ qui s'appuie sur les fondations. Personne au 4ᵉ ne va creuser les fondations — l'ordre des dépendances est strict, et c'est ce qui rend l'immeuble stable.

### Architecture en oignon — variante

L'**architecture en oignon** (Jeffrey Palermo, 2008) est une réinterprétation de l'architecture en couches qui inverse une règle clé : **les dépendances vont vers le centre, pas vers le bas**.

```
                ┌────────────────────────┐
                │      Infrastructure    │
                │  ┌──────────────────┐  │
                │  │   Application    │  │
                │  │ ┌──────────────┐ │  │
                │  │ │   Domaine    │ │  │
                │  │ │   (cœur)     │ │  │
                │  │ └──────────────┘ │  │
                │  └──────────────────┘  │
                └────────────────────────┘
```

Le **domaine** est au centre. Il ne dépend de rien. **L'infrastructure** (DB, HTTP, etc.) dépend du domaine — pas l'inverse. Concrètement : le domaine **définit des interfaces** (`UserRepository`, `PaymentGateway`), et l'infrastructure **les implémente**. C'est l'application directe du **principe d'inversion des dépendances** (cf. POO M5 — DIP).

**Analogie.** Le noyau d'une pêche. Le noyau (domaine) est dur et immuable. La chair (application) l'entoure. La peau (infrastructure) sert d'interface au monde extérieur, mais ne décide pas de la forme du noyau — le noyau décide de la forme du fruit.

### En couche vs oignon — la différence en une phrase

- **En couche** : le domaine **dépend** de l'infrastructure (l'entité `User` connaît `UserRepository` qui connaît la DB).
- **Oignon** : l'infrastructure **dépend** du domaine (la DB connaît l'interface `UserRepository` que le domaine a définie).

Dans la pratique moderne, "architecture en couche" désigne souvent un mélange des deux. Quand on parle de **clean architecture** (Robert C. Martin) ou de **DDD tactique**, on est en oignon.

### Marqueurs de reconnaissance

- Des **dossiers nommés par couche** : `presentation/`, `application/`, `domain/`, `infrastructure/`.
- Une convention explicite "le domaine n'importe que du domaine".
- Des **interfaces définies côté domaine** et implémentées côté infrastructure (le marqueur oignon).
- Du code **testable sans base de données** parce que le domaine est isolé.

---

## 4. Architecture hexagonale (ports & adapters)

### Définition

L'**architecture hexagonale** (Alistair Cockburn, 2005), aussi appelée **ports and adapters**, généralise l'idée de l'oignon : le **cœur applicatif** (logique métier) ne connaît que des **ports** (interfaces abstraites), jamais des technologies concrètes. Le monde extérieur (HTTP, DB, queue, CLI, tests) entre et sort via des **adapters** qui branchent les technologies sur ces ports.

```
                       ┌──────────────────┐
                       │     CLI Adapter  │
                       └────────┬─────────┘
                                │
            ┌───────────────────▼──────────────────┐
            │                                      │
   ┌────────┤             Cœur applicatif          ├────────┐
   │ HTTP   │       (use cases + domain logic)     │   DB   │
   │Adapter │                                      │Adapter │
   └────────┤        Ports: interfaces d'I/O       ├────────┘
            │                                      │
            └───────────────────▲──────────────────┘
                                │
                       ┌────────┴─────────┐
                       │   Queue Adapter  │
                       └──────────────────┘
```

Le terme "hexagonal" vient du **dessin** que Cockburn faisait : un hexagone pour symboliser le cœur, entouré d'adapters sur chaque face. Le nombre 6 n'a aucune importance — c'est juste plus pratique à dessiner qu'un cercle.

**Analogie.** Une prise multi-format pour voyageurs. À l'intérieur du chargeur, il y a un circuit qui transforme du courant — peu importe la prise (UK, EU, US, Japon). Les adapters sont les têtes interchangeables ; le port est la forme du connecteur ; le cœur ne sait pas dans quel pays il est branché.

### Hexagonale vs oignon — la nuance

L'oignon et l'hexagonale partagent la **même idée fondatrice** : inverser les dépendances vers le centre. La différence est de **présentation conceptuelle** :

- **Oignon** parle de _couches concentriques_ ; on raisonne en strates.
- **Hexagonale** parle de _ports et adapters_ ; on raisonne en interfaces et en branchements.

Beaucoup d'équipes utilisent les deux termes comme synonymes. C'est défendable. À retenir : si une discussion bloque sur la nuance entre les deux, le débat est probablement stérile.

### Marqueurs de reconnaissance

- Un dossier `core/` ou `domain/` qui **n'importe rien** des frameworks (pas de SQLAlchemy, pas de FastAPI dans les imports).
- Des **interfaces** (souvent `Protocol` en Python, `interface` en Java/TypeScript) côté cœur.
- Des **adapters** clairement isolés : `http/`, `db/`, `messaging/`.
- Une **inversion explicite** : le métier déclare ce dont il a besoin, l'infrastructure le fournit.

### Pourquoi en parler tôt

L'hexagonale est devenue la **valeur par défaut** des projets Python/Java/Go modernes qui visent la testabilité. Sans la nommer, on peut très bien l'appliquer (FastAPI M6 sur l'injection de dépendances en pose tous les outils). La nommer aide à parler le langage commun de l'industrie.

---

## 5. Architecture microservice

### Définition

Un système est en **architecture microservice** quand il est découpé en plusieurs **services indépendants**, chacun :

- déployé séparément,
- propriétaire de **ses données** (sa propre base, son propre stockage),
- communiquant avec les autres via le **réseau** (HTTP, gRPC, file de messages).

```
┌──────────────┐  HTTP  ┌──────────────┐  AMQP  ┌──────────────┐
│   Service A  │◄──────►│   Service B  │◄──────►│   Service C  │
│   (Users)    │        │   (Orders)   │        │  (Billing)   │
│    DB A      │        │    DB B      │        │    DB C      │
└──────────────┘        └──────────────┘        └──────────────┘
```

Chaque service est typiquement développé par une **équipe distincte**, dans le langage qu'elle préfère, avec son cycle de release propre.

**Analogie.** Une chaîne de magasins en franchise plutôt qu'une grande surface unique. Chaque magasin (service) a son local, son stock, son équipe ; ils partagent une marque et des règles communes, mais opèrent indépendamment. La grande surface (monolithe) centralise tout sous un même toit. L'un est plus simple à piloter ; l'autre est plus simple à faire grandir géographiquement.

### Microservice vs monolithe — vocabulaire utile

- **Monolithe** — une seule application, un seul déploiement, une seule base. Pas un gros mot : la majorité des projets devraient commencer monolithiques.
- **Monolithe modulaire** — un seul déploiement, mais un code soigneusement découpé en modules internes. Souvent suffisant.
- **Microservice** — plusieurs services indépendants. Beaucoup de complexité opérationnelle (déploiement, observabilité, résilience), à réserver aux contextes qui le justifient.
- **Service distribué** ou **macro-service** — entre monolithe et microservice, plusieurs services mais peu nombreux et plus larges.

Le débat "monolithe vs microservice" est repris en détail en **M2** (avantages / inconvénients). Pour l'instant, retenir : **microservice n'est pas un objectif, c'est une réponse à un problème spécifique**.

### Couplage et inertie — premier aperçu

Deux services microservices sont **couplés** quand l'évolution de l'un oblige l'autre à changer. L'**inertie** désigne la résistance globale du système au changement : un système très couplé a une forte inertie, donc un coût d'évolution élevé.

Le **découplage** des microservices repose sur trois piliers :

1. **Données séparées** — chaque service est seul propriétaire de sa base. Un autre service qui veut accéder à la donnée passe **par l'API** du propriétaire, jamais par sa DB.
2. **Contrats stables** — l'API publique d'un service évolue par **version**, pas par modification cassante.
3. **Communication asynchrone** quand possible — un message dans une file plutôt qu'un appel HTTP synchrone tendu.

Le couplage est approfondi en N3 (cf. **M2** pour les trade-offs et un module futur dédié au couplage microservice côté Senior).

### Marqueurs de reconnaissance

- **Plusieurs dépôts** Git, ou un mono-repo avec plusieurs cibles de déploiement.
- **Plusieurs bases de données** indépendantes, une par service.
- Un **registre de services** (Consul, Eureka, service mesh) ou un **API gateway** central.
- Une **observabilité distribuée** (tracing type Jaeger, Tempo, OpenTelemetry).
- Des conversations d'équipe qui mentionnent "leur service" et "notre service".

### Limite à garder en tête

Beaucoup de systèmes étiquetés "microservices" sont en réalité des **monolithes distribués** : ils ont la complexité opérationnelle du microservice mais le couplage du monolithe (services qui se cassent en cascade, bases partagées, déploiements coordonnés). Ce sont le pire des deux mondes. Reconnaître la différence est un objectif **Senior** (cf. parcours N3).

---

## 6. Les quatre types de liens

Quand on documente une architecture, on dessine des flèches entre des boîtes. Toutes les flèches ne représentent pas la même chose. Quatre familles à distinguer :

### 6.1 Dépendance fonctionnelle

**Définition.** Le composant A a besoin du composant B pour remplir sa fonction. Si B disparaît, A ne marche plus.

**Exemple.** Un service `Orders` qui ne peut pas exister sans un service `Users` (un ordre est forcément lié à un utilisateur).

**Lecture.** "A dépend de B au sens métier."

### 6.2 Communication

**Définition.** A et B s'échangent des messages au runtime, via un protocole concret (HTTP, gRPC, AMQP, etc.).

**Exemple.** Le frontend appelle `GET /orders` sur l'API.

**Lecture.** "A parle à B via tel canal."

### 6.3 Data flow

**Définition.** Une donnée circule du composant A au composant B, indépendamment de qui a initié l'échange.

**Exemple.** Un fichier déposé dans S3 (A) est lu par une Lambda (B) — le data flow va de S3 vers Lambda, même si c'est Lambda qui pull.

**Lecture.** "La donnée circule de A à B."

### 6.4 Control flow

**Définition.** Le contrôle d'exécution passe de A à B. Qui décide quoi se passe en premier, qui orchestre, qui rend la main.

**Exemple.** Une Step Function (A) qui invoque une Lambda (B) — le contrôle est dans Step Function, qui décide de la suite.

**Lecture.** "L'orchestration est portée par A, qui appelle B."

### Pourquoi distinguer

Sur un diagramme, on peut avoir une flèche unique entre A et B alors qu'il s'y joue **trois** choses différentes : une dépendance fonctionnelle, un control flow et un data flow. Confondre les trois mène à des malentendus :

- "Inverser la flèche" peut signifier inverser le control flow sans toucher au data flow (cf. _callback_).
- "Découpler" peut signifier supprimer la dépendance fonctionnelle, ou simplement passer la communication en asynchrone.

Un bon diagramme d'architecture **précise quel type de lien** chaque flèche représente — au minimum en distinguant **control flow** (qui appelle qui) et **data flow** (où va la donnée).

---

## 7. Comparer en un coup d'œil

| Architecture       | Quel niveau ?                  | Question qu'elle adresse                    | Marqueur visuel principal           |
| ------------------ | ------------------------------ | ------------------------------------------- | ----------------------------------- |
| **n-tier**         | Infrastructure                 | Où tournent les composants ?                | Boîtes empilées horizontalement     |
| **En couche**      | Code interne d'une app         | Comment ranger le code d'une app ?          | Couches superposées, flèches vers le bas |
| **Oignon**         | Code interne d'une app         | Comment isoler le métier de la technique ?  | Cercles concentriques, flèches vers le centre |
| **Hexagonale**     | Code interne d'une app         | Comment brancher le métier à l'extérieur ?  | Hexagone central avec adapters autour |
| **Microservice**   | Découpage applicatif           | Comment partitionner un grand système ?     | Plusieurs boîtes indépendantes en réseau |

**Important.** Ces architectures ne sont **pas mutuellement exclusives**. Un système réaliste est typiquement :

- Déployé en **n-tier** (présentation / app / data).
- Découpé en **microservices** ou en monolithe modulaire.
- Chaque service est codé en **hexagonal** ou en **couche** en interne.

On peut donc à la fois être "3-tier + microservice + hexagonal" — ce sont trois angles complémentaires.

---

## 8. Exercices pratiques

### Exercice 1 — Identifier l'architecture d'un projet connu (≈ 30 min)

Choisir un projet que l'on connaît bien (perso, professionnel, open-source).

Répondre par écrit en quelques phrases :

1. Combien de **tiers** d'infrastructure compte-t-il ? Lister.
2. Combien d'**applications** (déployables indépendamment) ? Une seule = monolithe ; plusieurs = vers le microservice.
3. À l'intérieur d'une app, le code est-il **organisé en couches** ? Si oui, lesquelles ?
4. Le **domaine** dépend-il de la **base de données** (couche classique) ou l'inverse (oignon / hexagonal) ?
5. Quel **type de lien** prédomine entre les composants : communication synchrone ? data flow asynchrone ? control flow centralisé ?

Le but n'est pas de trancher "c'est hexagonal" ou "c'est microservice" — c'est d'identifier honnêtement les **traits dominants**, en assumant les zones grises.

### Exercice 2 — Lire un repo open-source (≈ 45 min)

Choisir un projet open-source au choix (suggestions : `fastapi`, `django`, `dispatch` de Netflix, `mastodon`, `wagtail`). Cloner le repo.

Identifier en parcourant l'arborescence :

- Y a-t-il un dossier `domain/`, `core/`, `application/` ? Que contient-il ?
- Le dossier qui contient les modèles d'ORM **importe-t-il** quelque chose du dossier qui contient la logique métier, ou l'inverse ?
- Existe-t-il un dossier `adapters/`, `infrastructure/`, `ports/` ?
- Le code utilisateur du framework est-il un **plugin** branché via interface, ou un **client** qui appelle directement le framework ?

Rédiger un paragraphe de cinq à dix lignes sur ce qu'on a observé.

### Exercice 3 — Diagramme à quatre flèches (≈ 30 min)

Soit le système suivant :

> Un site e-commerce. Le navigateur affiche un catalogue. Quand l'utilisateur passe commande, l'API métier enregistre la commande en base, dépose un message dans une file pour le service de facturation, et envoie un email de confirmation via un fournisseur externe.

Dessiner ce système (papier ou outil au choix). Pour **chaque flèche** :

- Préciser s'il s'agit d'une **communication**, d'un **data flow**, d'un **control flow** ou d'une combinaison.
- Indiquer si elle est **synchrone** ou **asynchrone**.

Comparer ensuite avec un pair (réel ou imaginaire) pour voir si la même flèche est lue de la même façon.

### Exercice 4 — Reformuler sans le mot (≈ 20 min)

Pour chacun des quatre termes (`n-tier`, `en couche`, `oignon / hexagonal`, `microservice`), écrire **deux phrases** qui le décrivent **sans utiliser** le terme lui-même ni un dérivé.

Critère de réussite : un développeur qui n'a jamais entendu le mot peut deviner duquel on parle après lecture des deux phrases.

---

## 9. Mini-défi de synthèse — carte mentale comparative (≈ 1 h)

Produire une **carte mentale** ou un **tableau** (papier, Excalidraw, Miro, Markdown — peu importe le support) qui répond aux questions suivantes pour chacune des **quatre architectures** :

| Question                                                           | n-tier | en couche | oignon / hexagonal | microservice |
| ------------------------------------------------------------------ | ------ | --------- | ------------------- | ------------ |
| À quel **niveau** parle-t-elle (infra, code, applicatif) ?         |        |           |                     |              |
| Quel **problème** principal résout-elle ?                          |        |           |                     |              |
| Quel est son **marqueur visuel** dans le code ou les diagrammes ?  |        |           |                     |              |
| Avec **quelles autres** est-elle compatible ?                      |        |           |                     |              |
| Un **piège classique** quand on l'applique mal ?                   |        |           |                     |              |

Le but n'est pas une fiche encyclopédique — c'est une **antisèche personnelle** que l'on pourrait dégainer en réunion pour clarifier un débat. Tenir sur une page (recto, pas verso).

Conserver cette carte. Elle servira de **support de référence** pour le M2 (où les trade-offs seront ajoutés en colonnes).

---

## 10. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] L'apprenant peut **citer les 4 architectures** sans hésiter, et donner pour chacune une analogie.
- [ ] Il identifie le **niveau** (infra / code / applicatif) auquel chaque architecture s'applique.
- [ ] Il distingue **en couche** et **oignon / hexagonal** par la **direction des dépendances**.
- [ ] Il sait que **microservice est compatible avec hexagonal**, et que **n-tier décrit une topologie de déploiement, pas une organisation de code**.
- [ ] Il distingue les **4 types de liens** entre composants et sait identifier lequel s'applique à une flèche donnée.
- [ ] La **carte mentale comparative** du mini-défi est produite et tient sur une page.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : caractérisation de l'architecture hexagonale, microservice, en couche / oignon, n-tier.
- **N1** : les différents liens (dépendance fonctionnelle, communication, data flow, control flow).
- **N1** : capacité à documenter une architecture existante (amorcée ici, approfondie en pratique au fil des modules suivants).

Les items N2 (avantages / inconvénients) sont **explicitement repoussés à M2**. Ne pas chercher à trancher "quelle est la meilleure" — c'est l'erreur que M2 corrige.

---

## 11. Ressources complémentaires

- **Alistair Cockburn** — _Hexagonal Architecture_ (2005, article fondateur). [alistair.cockburn.us/hexagonal-architecture](https://alistair.cockburn.us/hexagonal-architecture/) — court, dense, à lire en VO.
- **Jeffrey Palermo** — _The Onion Architecture_ (2008, série de trois articles). Référence pour la variante oignon.
- **Robert C. Martin** — _Clean Architecture_ (2017). Chapitre 22 sur la _Clean Architecture_ (synthèse oignon + hexagonal + DDD).
- **Sam Newman** — _Building Microservices_ (2ᵉ édition, 2021). Référence absolue sur les microservices ; chapitres 1 à 3 suffisent pour ce module.
- **Martin Fowler** — _Microservices_ (article, 2014) et _MonolithFirst_ (article, 2015). [martinfowler.com](https://martinfowler.com). Lecture rapide, vue d'ensemble équilibrée.
- **Vaughn Vernon** — _Implementing Domain-Driven Design_ (2013). Pour faire le lien entre architecture en oignon et DDD.
- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — référence faisant foi sur le découpage des items du glossaire.
