# M2 — Comparaisons

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **quatre familles** de systèmes de messagerie — **queue**, **pub/sub**, **stream** (log distribué), **bus d'événements** — et nommer un représentant AWS de chacune.
- Expliquer **la différence entre Kinesis et SQS** sans hésiter, sur au moins quatre axes (modèle de consommation, ordre, rejouabilité, multi-consommateurs).
- Comparer Kinesis aux **autres message brokers** courants (SNS, MSK / Kafka, EventBridge, RabbitMQ) et **recommander** le bon outil pour un cas d'usage donné.
- Construire et utiliser une **matrice de choix** structurée pour trancher une décision d'architecture de messagerie.
- Reconnaître les **anti-patterns** de choix de messagerie : _Kinesis utilisé comme queue_, _SQS utilisé comme stream_, _broker enterprise dans une équipe de 5 personnes_.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (fondamentaux Kinesis : record, partition key, shard, rétention, multi-consommateurs).
- Architecture Logicielle M2 (raisonnement par trade-offs) et M4 (méthode de décision) — utiles, pas obligatoires.

---

## 1. Pourquoi le sujet n'est pas anodin

### Le piège du "broker générique"

Pour un développeur qui n'a pas pratiqué plusieurs brokers, ils se ressemblent tous : un système où des **producteurs** envoient des **messages** et des **consommateurs** les reçoivent. Cette vision simplifiée mène à des décisions catastrophiques :

- Choisir **Kinesis** pour traiter des tâches asynchrones → coût élevé, complexité inutile.
- Choisir **SQS** pour de l'analytics temps réel multi-consommateurs → impossible à scaler, rejouabilité absente.
- Choisir **Kafka** dans une équipe de 5 personnes → opérationnellement non tenable.
- Choisir **SNS** seul pour des flux à fort volume → perte de garanties d'ordre et de rejeu.

**Conséquence.** Trois à six mois après le choix, on découvre qu'on est dans le mauvais outil. Migrer entre brokers coûte typiquement **trois à six mois** d'engineering, avec un risque opérationnel élevé.

### Une grille en quatre familles

Pour ne pas confondre, distinguer dès maintenant **quatre familles** de systèmes de messagerie. Chaque famille répond à un besoin **structurellement** différent :

| Famille                    | Question qu'elle adresse                                   | Représentants AWS                         |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| **Queue (file)**           | Comment distribuer du **travail** entre workers ?          | **SQS**                                   |
| **Pub/Sub**                | Comment **diffuser** un message à plusieurs abonnés ?      | **SNS**                                   |
| **Stream (log distribué)** | Comment **rejouer** un historique de records partitionné ? | **Kinesis Data Streams**, **MSK / Kafka** |
| **Bus d'événements**       | Comment **router** des événements selon des règles ?       | **EventBridge**                           |

Ces familles ne sont pas mutuellement exclusives — une architecture moderne **combine** souvent les quatre. Mais utiliser une famille pour le besoin d'une autre est une erreur structurante.

---

## 2. Queue vs Stream — la distinction fondamentale

C'est **la** distinction à maîtriser parfaitement avant de choisir entre SQS et Kinesis. Elle se résume en une phrase :

> **Une queue distribue le travail entre workers — un message lu disparaît.**
> **Un stream conserve l'historique — plusieurs lecteurs indépendants lisent à leur rythme.**

### 2.1 — Le modèle queue

```
                                       ┌──────────┐
                                  →    │ Worker 1 │  (lit msg-1, traite, ACK → msg-1 supprimé)
┌──────────────────────────┐      │    └──────────┘
│   Queue : msg-1, msg-2,  │ ─────┤
│   msg-3, msg-4, ...      │      │    ┌──────────┐
└──────────────────────────┘      └ →  │ Worker 2 │  (lit msg-2, traite, ACK → msg-2 supprimé)
                                       └──────────┘
```

- Chaque message est traité **une seule fois**.
- Les workers se **partagent** le travail.
- Un message est **supprimé** après ACK (ou après expiration).
- L'ordre est **généralement non garanti** (sauf FIFO chez SQS, mais à débit limité).
- Pas de rejouabilité d'un message déjà ACKé.

**Quand l'utiliser.** Un message = une tâche à exécuter. Découplage temporel entre producteur et workers. Tolérance aux pics (la queue absorbe).

**Exemples concrets.**

- Envoi d'emails après inscription.
- Génération de PDF à la demande.
- Encodage vidéo.
- Webhooks à distribuer à plusieurs cibles.

### 2.2 — Le modèle stream

```
                                       ┌──────────┐
                                  ←    │ Consumer 1 (analytics) │
┌──────────────────────────┐      │    └──────────┘
│   Stream :               │      │                    (positions indépendantes)
│   r1, r2, r3, r4, ...    │ ─────┤    ┌──────────┐
│   (conservés N jours)    │      └ ←  │ Consumer 2 (fraud detection) │
└──────────────────────────┘           └──────────┘
                                       ┌──────────┐
                                  ←    │ Consumer 3 (audit) │
                                       └──────────┘
```

- Chaque record est **conservé** pendant la durée de rétention (24h à 365 jours pour Kinesis).
- **Plusieurs consumers** lisent **le même** flux indépendamment.
- Chaque consumer **garde sa position** (sequence number / offset).
- L'ordre **par partition** est garanti.
- On peut **rejouer** un consumer depuis n'importe quel point antérieur.

**Quand l'utiliser.** Un record = un fait historique partagé. Plusieurs systèmes lisent le même flux pour des finalités différentes. Besoin de rejouer en cas de bug, de remonter sur 7 jours pour un nouveau consumer.

**Exemples concrets.**

- Flux de clics utilisateurs lu par analytics + recommendation + fraud detection.
- Mesures IoT lues par stockage long terme + alerting + ML pipeline.
- Journal d'opérations lu par audit + cache invalidation + projection CQRS (cf. Architecture Logicielle M3).

### 2.3 — Le test à dix secondes

Pour savoir si un besoin est **queue** ou **stream**, deux questions suffisent :

1. **Plusieurs consommateurs** lisent-ils le même message pour des **raisons différentes** ?
2. A-t-on besoin de **rejouer** un message déjà traité (ex : nouveau consommateur qui démarre, bug détecté après coup) ?

- **Deux fois non** → queue.
- **Au moins un oui** → stream.

---

## 3. Kinesis Data Streams vs SQS — comparaison en détail

C'est **la** comparaison sur laquelle un développeur AWS est interrogé en entretien et sur laquelle se prennent les décisions structurantes.

### 3.1 — Tableau d'écart

| Axe                        | Kinesis Data Streams                                           | SQS Standard / FIFO                                           |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **Famille**                | Stream (log distribué)                                         | Queue (file de tâches)                                        |
| **Modèle de consommation** | Multi-consommateurs, positions indépendantes                   | Un message → un worker (sauf duplication SNS→SQS amont)       |
| **Ordre garanti**          | Oui, **par partition key** (au sein d'un shard)                | Standard : non. FIFO : oui, par groupe de message             |
| **Rétention**              | 24h par défaut, jusqu'à 365 jours configurable                 | 1 minute à 14 jours, max 14 jours                             |
| **Rejouabilité**           | Oui (depuis n'importe quel point dans la fenêtre de rétention) | Non (un message ACKé est supprimé)                            |
| **Débit**                  | Par shard ou On-Demand. Très élevé, mais à dimensionner.       | Élastique automatiquement, virtuellement illimité.            |
| **Latence end-to-end**     | 70 ms à 1 s selon mode et fan-out                              | < 100 ms typiquement                                          |
| **Taille de message**      | 1 Mo par record                                                | 256 Ko (256 Ko via SQS Extended Library en pointant S3)       |
| **Garantie de livraison**  | At-least-once (consumer doit gérer l'idempotence)              | At-least-once (Standard), exactly-once (FIFO, à débit limité) |
| **Modèle tarifaire**       | Au shard-heure + record (Provisioned) ou volume (On-Demand)    | À la requête + à l'octet en sortie                            |
| **Coût d'entrée**          | Non négligeable (shards facturés même à vide)                  | Très faible (zéro à l'arrêt)                                  |
| **Intégration native**     | Kinesis Firehose, Lambda, Flink, OpenSearch                    | Lambda, SNS, ECS, partout AWS                                 |

### 3.2 — Quatre questions à se poser dans l'ordre

**Question 1 — Le message doit-il être lu par un seul consommateur (worker) ou par plusieurs systèmes distincts ?**

- Un seul (un travail à faire) → **SQS**.
- Plusieurs systèmes pour des finalités différentes → **Kinesis**.

**Question 2 — Faut-il rejouer l'historique récent (24h à 7 jours typiquement) ?**

- Non, une fois traité, c'est définitif → **SQS**.
- Oui, replay nécessaire → **Kinesis**.

**Question 3 — L'ordre est-il critique au sein d'une catégorie ?**

- Aucun ordre nécessaire → SQS Standard ou Kinesis, indifférent.
- Ordre par catégorie (par utilisateur, par device, par compte) → **Kinesis** (via partition key) ou **SQS FIFO** (via MessageGroupId, mais à débit limité).

**Question 4 — Quel est le volume ?**

- Très variable, jusqu'à des millions de messages/s, avec creux et pics → **SQS** (élasticité native) ou **Kinesis On-Demand**.
- Volume stable et significatif (> 1 Mo/s soutenu) → **Kinesis Provisioned** (typiquement moins cher à ce niveau).

### 3.3 — Le contre-exemple : Kinesis comme queue

C'est une **erreur courante**. Un développeur qui découvre Kinesis y voit "un meilleur SQS" et l'utilise pour des tâches asynchrones :

```
[Producer] → [Kinesis] → [Lambda consumer qui traite chaque record]
```

Pourquoi c'est mauvais :

- **Coût** : un shard coûte ≈ 11 €/mois minimum, même vide. Une queue SQS quasi-gratuite à l'arrêt.
- **Scaling** : le parallélisme côté consommation est limité au **nombre de shards** (en mode standard). Si on a 4 shards, on a au mieux 4 workers en parallèle. Avec SQS, n workers se distribuent élastiquement.
- **Gestion d'erreur** : SQS a une **DLQ** (Dead Letter Queue) native. Kinesis non — il faut bricoler.
- **Pas de réelle utilisation de la rétention longue ni du multi-consommateur** : on n'utilise pas ce qu'on paye.

**Règle.** Si on ne lit le record qu'une seule fois, par un seul système, et qu'on ne replay jamais, on n'a pas besoin de Kinesis.

### 3.4 — Le contre-exemple : SQS comme stream

Symétrique. Quand on découvre SQS, on est tenté de **brancher plusieurs lambdas dessus** pour faire du fan-out :

```
[Producer] → [SQS] → [Lambda A]
                   → [Lambda B]
                   → [Lambda C]
```

Cela **ne fonctionne pas** : SQS ne duplique pas les messages, chacun est traité par **un seul** consommateur. Le fan-out via SQS demande **soit** plusieurs queues alimentées par SNS, **soit** un duplicate explicite côté producteur — et dans tous les cas, on perd la rejouabilité historique.

Pour ce besoin, **Kinesis** (ou **SNS + plusieurs SQS** pour de la diffusion simple) est l'outil approprié.

---

## 4. Kinesis vs SNS — diffusion ponctuelle vs flux persistant

### Le rôle de SNS

**SNS** (Simple Notification Service) est un **pub/sub** : les producteurs publient sur un **topic**, et tous les **abonnés** reçoivent une copie du message.

- Pas de **persistance** : si un abonné est down, il **rate** les messages.
- Pas de **rejeu**.
- Pas d'**ordre** (sauf FIFO topic, comme SQS FIFO).
- Pas de **garantie d'historique**.
- Très bon marché.

### Comparaison

| Axe                  | SNS                     | Kinesis Data Streams               |
| -------------------- | ----------------------- | ---------------------------------- |
| Persistance          | Non                     | Oui (24h à 365j)                   |
| Rejouabilité         | Non                     | Oui                                |
| Ordre                | Non (sauf FIFO limité)  | Oui par partition key              |
| Multi-abonnés        | Oui                     | Oui (consumers KCL ou Enhanced FO) |
| Modèle               | Push (vers les abonnés) | Pull (les consumers viennent lire) |
| Latence              | Très faible             | 70 ms à 1 s                        |
| Coût à faible volume | Quasi-nul               | Minimal mais shard-horaire         |

### Quand SNS suffit

- **Notifications transitoires** (email, SMS, push mobile).
- **Fan-out vers SQS** pour distribuer aux workers (pattern **SNS → SQS**).
- **Webhooks** sortants vers des systèmes externes.
- **Pas de besoin de rejeu** ni d'historique.

### Le pattern hybride SNS + SQS

Très courant en architecture AWS :

```
                       ┌─→ [SQS-A] → [Workers du service A]
[Producer] → [SNS] ─→  ├─→ [SQS-B] → [Workers du service B]
                       └─→ [SQS-C] → [Workers du service C]
```

- SNS diffuse à chaque abonné une copie du message.
- Chaque SQS découple temporellement les workers et offre une DLQ.
- Idéal pour le **fan-out asynchrone simple** sans besoin de stream.

**Quand préférer Kinesis** : besoin de rejeu, d'historique, ou de garantie d'ordre par catégorie au-delà du débit FIFO.

---

## 5. Kinesis vs Amazon MSK (Kafka managé)

### Kafka en deux phrases

**Kafka** est le standard de fait du streaming d'événements open-source, créé chez LinkedIn (2011), maintenu par l'Apache Software Foundation et largement adopté dans l'industrie. **MSK** (Managed Streaming for Apache Kafka) est l'offre AWS managée de Kafka.

Conceptuellement très proche de Kinesis :

- **Topic** ≈ stream.
- **Partition** ≈ shard.
- **Offset** ≈ sequence number.
- **Producer / consumer group** ≈ producer / consumer (avec KCL).
- **Retention** configurable.

### Comparaison

| Axe                               | Kinesis Data Streams                | Amazon MSK                                                   |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| **Standard**                      | Propriétaire AWS                    | Apache Kafka (standard de fait, portable)                    |
| **Écosystème**                    | AWS-natif (Lambda, Firehose, Flink) | Très riche (Kafka Connect, Streams, ksqlDB, Schema Registry) |
| **Coût d'entrée**                 | Bas (1 shard On-Demand suffit)      | Élevé (cluster MSK minimal ≈ 200 €/mois)                     |
| **Coût à l'échelle**              | Élevé au volume                     | Plus bas au volume (clusters denses)                         |
| **Opérationnel**                  | Zéro                                | Réduit mais non nul (versions, JVM heap, scaling)            |
| **Multi-cloud / portabilité**     | Non (lock-in)                       | Oui (Kafka est partout)                                      |
| **Latence min**                   | 70 ms typique                       | 5 à 20 ms (configuration agressive)                          |
| **Maturité de l'écosystème data** | Bonne dans AWS                      | Très large, indépendamment du cloud                          |

### Quand préférer Kinesis

- Équipe **moyenne** sans expertise Kafka.
- Pipelines **AWS-natifs** (Lambda, Firehose, OpenSearch, Glue).
- **Pas de besoin** de portabilité multi-cloud.
- Volume modéré (< 50 Mo/s soutenu).

### Quand préférer MSK / Kafka

- Équipe avec **expertise Kafka** déjà en place.
- **Écosystème Kafka** indispensable (Connect, Streams, Schema Registry).
- Volume **très élevé** (clusters denses moins chers).
- **Portabilité** multi-cloud ou hybride exigée.
- Latence critique < 50 ms.

### Le cas Confluent Cloud

Confluent (créé par les auteurs originaux de Kafka) propose Kafka managé multi-cloud, souvent comparé à MSK. Hors périmètre de ce module, à mentionner uniquement comme **option** à connaître.

---

## 6. Kinesis vs EventBridge

### EventBridge en deux phrases

**EventBridge** (anciennement CloudWatch Events) est un **bus d'événements** AWS qui route les événements selon des **règles** :

- Source = service AWS (S3, EC2, custom), SaaS partenaire (Datadog, Zendesk), ou application maison.
- Cible = Lambda, SQS, SNS, Step Functions, autre bus, etc.
- Filtrage par **pattern matching** sur le contenu.

### Quand EventBridge

- Routage **conditionnel** d'événements (une règle = un sous-ensemble).
- **Intégration native** avec les services AWS et SaaS (sans coder l'extraction).
- **Faible volume** (jusqu'à quelques milliers d'events / seconde par bus).
- Architecture **événementielle découplée** entre services / domaines.

### Quand pas EventBridge

- **Très haut volume** continu (Kinesis ou MSK).
- Besoin de **rejouer un historique** (EventBridge ne le permet pas nativement — Archive existe mais avec limites).
- **Ordre strict** par catégorie (Kinesis avec partition key).

### Comparaison rapide

| Axe                    | EventBridge                         | Kinesis Data Streams       |
| ---------------------- | ----------------------------------- | -------------------------- |
| Modèle                 | Bus avec règles                     | Stream multi-consommateurs |
| Routage conditionnel   | Oui, natif (patterns)               | Non, à coder côté consumer |
| Volume max             | Modéré (5 000 events/s/bus typique) | Très élevé                 |
| Rejouabilité           | Limitée (Archive payante)           | Oui, natif                 |
| Intégration AWS / SaaS | Très riche                          | Plus restreinte            |
| Coût                   | À l'événement publié + matched      | Au shard / volume          |

---

## 7. Kinesis Data Streams vs Kinesis Data Firehose

Cas particulier : deux produits **de la même famille** Kinesis souvent confondus.

| Axe                | Kinesis Data Streams        | Kinesis Data Firehose                                |
| ------------------ | --------------------------- | ---------------------------------------------------- |
| **Rôle**           | Stream multi-consommateurs  | Tuyau d'ingestion vers une destination               |
| **Consumers**      | Custom (KCL, Lambda, Flink) | Aucun — Firehose **est** le consumer                 |
| **Destinations**   | Code consumer libre         | S3, Redshift, OpenSearch, Splunk, HTTP, Datadog, ... |
| **Transformation** | À coder côté consumer       | Optionnelle via Lambda intercalée                    |
| **Latence**        | Sub-seconde                 | Buffer 60 s à 15 min (configurable)                  |
| **Rejouabilité**   | Oui                         | Non                                                  |
| **Tarification**   | Shard ou volume             | Volume ingéré + transformations                      |

**Règle.** Si la seule destination du flux est **S3** ou **Redshift** ou **OpenSearch**, et qu'on n'a pas besoin de rejeu ni de plusieurs consommateurs, **Firehose** est plus simple et souvent moins cher.

Si on a **plusieurs consommateurs** ou un besoin de **traitement custom**, **Data Streams** est la bonne brique — éventuellement avec Firehose **en aval** comme l'un des consumers (pattern courant).

---

## 8. RabbitMQ, ActiveMQ — les classiques on-premise

Hors AWS, on rencontre fréquemment **RabbitMQ** et **ActiveMQ**, deux brokers traditionnels au modèle queue + pub/sub.

- **AMQ Streams (Strimzi)** — distribution Kafka sur Kubernetes.
- **Amazon MQ** — managé AWS pour ActiveMQ et RabbitMQ. Existe quand un système legacy attend du protocole AMQP ou Stomp.

Quand un système **legacy** parle AMQP / Stomp / JMS, **Amazon MQ** est la bonne réponse. Sinon, dans l'écosystème AWS moderne, on combine **SQS / SNS / Kinesis / EventBridge** pour couvrir les besoins.

---

## 9. La matrice de choix

Pour ne pas tomber dans la décision intuitive, voici une matrice à dérouler quand on hésite. Elle synthétise tout ce qui précède.

### 9.1 — Questions cardinales

1. **Modèle** : un message = une tâche (queue) ou un fait historique (stream) ?
2. **Multi-consommateurs** : combien de systèmes consomment le même flux ?
3. **Rejouabilité** : a-t-on besoin de relire le passé ?
4. **Ordre** : ordre strict nécessaire ? Par quelle clé ?
5. **Volume** : pic max et soutenu ?
6. **Latence acceptable** : sub-100 ms ? Seconde ? Plus ?
7. **Écosystème** : intégration AWS ou multi-cloud ?

### 9.2 — Tableau de décision rapide

| Besoin principal                                                | Recommandation principale | Variante                             |
| --------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| Tâches asynchrones, un worker, pas de rejeu                     | **SQS**                   | SQS FIFO si ordre strict             |
| Diffusion ponctuelle à plusieurs cibles, pas de rejeu           | **SNS**                   | SNS → SQS pour ajouter du découplage |
| Flux d'événements multi-consommateurs, rejeu sur quelques jours | **Kinesis Data Streams**  | MSK si Kafka required                |
| Livraison simple d'un flux vers S3 / Redshift / OpenSearch      | **Kinesis Firehose**      |                                      |
| Routage conditionnel d'événements entre services AWS / SaaS     | **EventBridge**           |                                      |
| Volume **massif** et écosystème **Kafka** requis                | **Amazon MSK**            | Confluent Cloud                      |
| Système legacy attendant AMQP / Stomp / JMS                     | **Amazon MQ**             |                                      |
| Calcul temps réel sur le flux (agrégats, fenêtres glissantes)   | **Managed Apache Flink**  | KDS en source                        |

### 9.3 — Patterns combinés courants

Plusieurs systèmes utilisent **plusieurs briques ensemble**. Quelques patterns canoniques :

- **SNS → SQS (fan-out queue)** : un événement publié, plusieurs équipes consomment indépendamment.
- **Kinesis → Lambda** : transformation temps réel d'un flux.
- **Kinesis → Firehose → S3** : archivage long terme du stream pour audit et data lake.
- **EventBridge → SQS → Lambda** : routage conditionnel vers une queue de tâches.
- **Kinesis → Flink → DynamoDB / OpenSearch** : pipeline analytique temps réel.

Combiner les outils n'est pas un échec — c'est souvent le **bon choix**.

---

## 10. Anti-patterns à reconnaître

### 10.1 — Kinesis pour de l'asynchrone simple

**Symptôme.** Une équipe utilise Kinesis pour envoyer des emails après inscription. Un shard, un consumer, jamais de rejeu, latence pas critique.

**Pourquoi mauvais.** Coût mensuel disproportionné, parallélisme limité par le shard, pas de DLQ native.

**Correction.** SQS. Lambda en consommateur si besoin.

### 10.2 — SQS pour du fan-out multi-systèmes

**Symptôme.** Plusieurs lambdas branchées sur la même SQS, on s'étonne qu'elles ne reçoivent pas les mêmes messages.

**Pourquoi mauvais.** SQS distribue, ne diffuse pas. C'est l'inverse du besoin.

**Correction.** SNS → plusieurs SQS, ou Kinesis si rejeu nécessaire.

### 10.3 — MSK / Kafka pour 200 events/s

**Symptôme.** Une équipe de 5 personnes monte un cluster Kafka pour ingérer 200 events/s. Trois mois plus tard, deux ingénieurs sont dédiés à maintenir le cluster.

**Pourquoi mauvais.** Coût opérationnel délirant par rapport au besoin.

**Correction.** Kinesis On-Demand ou SQS, selon le besoin réel.

### 10.4 — EventBridge pour un flux de millions d'events / seconde

**Symptôme.** On atteint la limite par bus, les events sont rejetés silencieusement.

**Pourquoi mauvais.** EventBridge n'est pas conçu pour le très haut débit.

**Correction.** Kinesis Data Streams ou MSK.

### 10.5 — Firehose pour un besoin de plusieurs consommateurs

**Symptôme.** On veut deux consommateurs sur le même flux, on bricole pour dupliquer côté Firehose.

**Pourquoi mauvais.** Firehose est une livraison unidirectionnelle, pas un stream multi-consommateurs.

**Correction.** Kinesis Data Streams en amont, Firehose en aval comme **l'un** des consumers.

### 10.6 — "On choisit X parce que la conf' Re:Invent l'a vanté"

**Symptôme.** Choix par hype (cf. M4 Architecture Logicielle, _hype-driven development_).

**Correction.** Revenir aux 7 questions cardinales et à la matrice.

---

## 11. Exercices pratiques

### Exercice 1 — Identifier la famille (≈ 20 min)

Pour chaque scénario, désigner la **famille** de messagerie pertinente (queue / pub/sub / stream / bus d'événements) et le **service AWS** que vous choisiriez.

1. Envoyer un email de confirmation à chaque commande passée.
2. Permettre à 5 équipes de consommer indépendamment les clics utilisateurs de l'app web.
3. Notifier 3 systèmes (CRM, comptabilité, marketing) quand un client change d'abonnement, sans rejeu.
4. Distribuer 12 000 jobs d'encodage vidéo par jour à un parc de 20 workers EC2.
5. Permettre à un nouveau consommateur de relire 7 jours d'activité de capteurs IoT.
6. Router les événements S3 `ObjectCreated:Put` vers une lambda selon le préfixe.
7. Pousser 200 Mo/s de logs applicatifs vers S3 partitionné, sans transformation.

### Exercice 2 — Justifier un choix (≈ 30 min)

Pour chaque cas, choisir entre **SQS**, **SNS**, **Kinesis Data Streams**, **Kinesis Firehose**, **EventBridge**, **MSK**. Justifier en 4 à 6 lignes avec **les 7 questions cardinales** de la section 9.1.

**Cas A.** Plateforme de jeu mobile. 50 000 events/s en pic (parties, achats, sessions). 4 systèmes consomment : analytics, anti-fraude, leaderboards, archivage S3 pour audit légal 5 ans.

**Cas B.** Application interne RH. 200 utilisateurs. Quand un employé pose un congé, déclencher la mise à jour de 3 systèmes (paie, planning, manager notification). Pas de besoin de rejeu, équipe de 4 ingés.

**Cas C.** Service de transcription audio. Les fichiers .mp3 sont déposés dans un bucket S3, doivent être traités un par un par une lambda. 500 fichiers / jour en moyenne, jusqu'à 5 000 sur les pics.

**Cas D.** Capteurs industriels. 2 000 capteurs envoient une mesure / seconde chacun (2 Ko / mesure). Trois pipelines : stockage long terme, alerting < 1 s sur seuils, analyse ML batch hebdomadaire.

### Exercice 3 — Démasquer les anti-patterns (≈ 20 min)

Pour chaque extrait, identifier l'anti-pattern (cf. section 10) et proposer la correction.

1. _"On utilise Kinesis pour notre file d'envoi de mails post-inscription, on a 5 mails par minute en moyenne, et on veut le suivi par utilisateur."_
2. _"On a une SQS sur laquelle on a branché 3 lambdas, mais bizarrement chaque message n'est traité que par l'une des 3."_
3. _"On monte un cluster MSK 3 brokers pour notre app interne de gestion projet. On est 6 ingés."_
4. _"On utilise Firehose mais on veut aussi qu'une autre lambda voie les events en parallèle pour faire du temps réel."_
5. _"Notre EventBridge plafonne à 5 000 events/s, on n'arrive pas à monter à 50 000."_

### Exercice 4 — Construire sa matrice (≈ 45 min)

Reprendre la grille de la **section 9.1** et en faire **sa propre version** sur une page A4 (papier, tableur, Markdown — au choix). Y intégrer :

- Les 7 questions cardinales.
- Le tableau de décision rapide.
- 3 patterns combinés qu'on retient comme particulièrement utiles.
- 1 ou 2 anti-patterns qu'on a déjà vus dans sa propre expérience (réelle ou imaginée).

Cette matrice doit être **dégainable en réunion** en 30 secondes.

### Exercice 5 — Estimer le coût (≈ 30 min)

Pour le **Cas A** de l'exercice 2 (plateforme de jeu mobile, 50 000 events/s en pic, payload moyen 1 Ko), estimer **en ordre de grandeur** le coût mensuel de :

- **Kinesis Data Streams On-Demand**.
- **Kinesis Data Streams Provisioned** (calculer le nombre de shards).
- **MSK** (cluster minimal 3 brokers `kafka.m5.large` + stockage).
- **SQS** (en supposant qu'on contourne le multi-consommateur, ce qui ne marche pas mais on chiffre).

Utiliser la documentation de tarification AWS pour les chiffres précis ; sinon, accepter une estimation à ±30 %.

**Bonus.** Quel mode (On-Demand vs Provisioned) recommander pour ce cas, et à partir de quel seuil bascule-t-on ?

---

## 12. Mini-défi de synthèse — matrice de choix appliquée (≈ 90 min)

Reprendre un projet récent (perso, pro, fictif) qui a au moins **un** besoin de messagerie. Produire un document d'**une page** structuré ainsi :

1. **Contexte** (5 lignes) — quel projet, quels acteurs, quelle volumétrie.
2. **Besoins de messagerie identifiés** — lister chacun avec une phrase descriptive.
3. **Réponse aux 7 questions cardinales** pour le besoin principal.
4. **Recommandation** : service AWS choisi + pourquoi.
5. **Alternatives écartées** : 2 services qu'on aurait pu utiliser, et pourquoi on les écarte.
6. **Anti-pattern qu'on évite** : nommer le piège dans lequel un développeur peu expérimenté serait tombé.

**Critères de validation.**

- Le document tient sur **une page**.
- Les 7 questions cardinales sont **toutes** répondues, même brièvement.
- La recommandation cite **explicitement** un trade-off assumé.
- Au moins une **alternative crédible** est écartée avec un argument autre que "c'est moins moderne".

---

## 13. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant distingue **queue, pub/sub, stream, bus d'événements** et nomme un représentant AWS de chacun.
- [ ] Il explique en deux phrases **la différence entre Kinesis et SQS**, sans hésitation.
- [ ] Il **recommande** un service AWS pour un cas d'usage donné en passant par les 7 questions cardinales (section 9.1).
- [ ] Il **reconnaît** au moins 4 des 6 anti-patterns de la section 10.
- [ ] Il a produit **sa propre matrice** de choix d'une page (exercice 4).
- [ ] Il a complété le **mini-défi de synthèse** sur un projet de son choix.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : différence entre Kinesis et SQS.
- **N2** : intérêt de Kinesis vis-à-vis d'un autre message broker.

L'item N2 _ordonnancement / répartition des messages_ et la _configuration de la rétention_ sont approfondis en **M3**.

---

## 14. Ressources complémentaires

### Documentation officielle

- **Choosing between AWS messaging services** — [docs.aws.amazon.com/decision-guides/latest/messaging-services-on-aws](https://docs.aws.amazon.com/decision-guides/latest/messaging-services-on-aws/messaging-services-on-aws.html). Guide officiel AWS, à lire intégralement.
- **Amazon SQS Developer Guide** — [docs.aws.amazon.com/AWSSimpleQueueService](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/). Sections sur Standard vs FIFO.
- **Amazon SNS Developer Guide** — [docs.aws.amazon.com/sns/latest/dg](https://docs.aws.amazon.com/sns/latest/dg/welcome.html).
- **Amazon EventBridge User Guide** — [docs.aws.amazon.com/eventbridge/latest/userguide](https://docs.aws.amazon.com/eventbridge/latest/userguide/).
- **Amazon MSK Developer Guide** — [docs.aws.amazon.com/msk/latest/developerguide](https://docs.aws.amazon.com/msk/latest/developerguide/).

### Articles et comparaisons

- **AWS Blog** — _Kinesis vs SQS_ (plusieurs articles selon les années). Toujours utile de croiser plusieurs angles.
- **Yan Cui** — _AWS messaging services compared_ (theburningmonk.com). Article synthétique d'un expert serverless reconnu.
- **Jay Kreps** — _The Log: What every software engineer should know about real-time data's unifying abstraction_ (2013, blog LinkedIn). Texte fondateur sur la notion de **log distribué** ; éclaire pourquoi Kinesis et Kafka sont structurés ainsi.

### Approfondissement

- **Martin Kleppmann** — _Designing Data-Intensive Applications_ (2017), chapitre 11 sur les flux de données. Indépendant de la techno, indispensable pour comprendre les choix de fond.
- **Tyler Akidau, Slava Chernyak, Reuven Lax** — _Streaming Systems_ (2018). Pour le pont vers le calcul temps réel (Flink, Beam, Dataflow).
- **Documentation interne** : `resources/priority1/AWS Kinesis.md` — niveaux 1 et 2 pour situer M2 dans le parcours et préparer M3.
