# M1 — Fondamentaux

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer en deux phrases **ce qu'est** Kinesis et **dans quel contexte** on le choisit.
- Distinguer les **quatre produits** de la famille Kinesis (Data Streams, Data Firehose, Managed Service for Apache Flink, Video Streams) et savoir lequel répond à quel besoin.
- Définir les trois **concepts fondamentaux** d'un stream Kinesis Data Streams : **shard**, **partition key**, **record**.
- Créer un **stream** simple et y **envoyer des records**, puis les **consommer**, via la console AWS ou la CLI.
- Reconnaître un **cas d'usage Kinesis valide** d'un cas d'usage où une autre brique serait plus adaptée (sans encore approfondir les comparaisons, qui sont l'objet du M2).

## Durée estimée

0,5 jour (1 demi-journée).

## Pré-requis

- Un compte AWS actif (sandbox personnelle, compte de formation, ou compte pro avec droits suffisants).
- Notions de base sur **IAM** (parcours AWS Identity : ARN, role, policy — pas obligatoire mais aide).
- Notion de **producer / consumer** (modèle producteur / consommateur).
- AWS CLI installée et configurée (`aws configure`), ou accès à la console AWS.

---

## 1. Qu'est-ce que Kinesis et pourquoi en parler ?

### Le besoin que Kinesis adresse

Beaucoup de systèmes ont besoin de **transporter des événements en continu** entre producteurs et consommateurs :

- Une application web produit des **clics utilisateurs** qu'on veut analyser.
- Un parc d'**objets connectés** envoie des mesures en temps réel.
- Un service de jeu produit des **événements de partie** consommés par plusieurs systèmes (scoring, fraude, analytics).
- Des **logs applicatifs** doivent être routés vers plusieurs destinataires (archivage, monitoring, alerting).

Pour répondre à ce besoin sans Kinesis, on bricole : un cron qui scrute une base, un service qui appelle un autre service en HTTP, un cron qui pousse vers S3, etc. Tout cela fonctionne tant qu'il n'y a **pas trop de volume** et **pas trop de consommateurs**. Au-delà, ça casse.

Kinesis est la réponse AWS à ce besoin : **un service managé pour ingérer et distribuer des flux d'événements à grande échelle**.

**Analogie.** Un système postal. Sans poste centralisée, chaque expéditeur livre directement à chaque destinataire — fragile, lent, complexe à coordonner. La poste sépare la **collecte** (les expéditeurs déposent dans n'importe quelle boîte) de la **distribution** (les destinataires reçoivent chez eux). Le tampon de tri au milieu permet aux deux côtés de fonctionner à leur rythme, indépendamment l'un de l'autre. Kinesis joue le rôle de ce tampon entre producteurs et consommateurs d'événements.

### Quand choisir Kinesis (en première intention)

- Le **volume** est conséquent (au-delà de quelques milliers d'events par seconde).
- **Plusieurs consommateurs** lisent le même flux, indépendamment les uns des autres.
- L'**ordre** des événements compte (au moins par catégorie : par utilisateur, par device, par session).
- Le besoin est de **rejouer** les données récentes (replay sur 24h, 7 jours, 365 jours).

### Quand Kinesis n'est pas la bonne réponse

- Le besoin est une **file de tâches** (un message = un travail à faire) avec une seule fois la consommation → SQS.
- Le besoin est une **diffusion à de multiples abonnés** sans persistance ni rejouabilité → SNS.
- Le besoin est un **broker plein** (Kafka complet, ksqlDB, Connect ecosystem, multi-cloud) → Amazon MSK ou Confluent Cloud.

Le module **M2** entre dans le détail de ces comparaisons. Pour l'instant, retenir que **Kinesis = stream managé**, et qu'un stream n'est pas une file ni un topic broadcast.

---

## 2. La famille Kinesis — quatre produits

"Kinesis" est un **nom de marque** chez AWS qui couvre quatre produits distincts. Confondre les quatre est une erreur classique.

### 2.1 — Kinesis Data Streams (KDS)

Le produit **historique** et le **cœur** de ce qu'on appelle "Kinesis" dans la majorité des conversations.

- Stream **persistant** d'événements (records).
- Pluralité de consommateurs lisent le même stream à leur propre rythme.
- Concepts clés : **shard**, **partition key**, **record**, **séquence number**.
- Modèles tarifaires : **Provisioned** (on dimensionne les shards) ou **On-Demand** (AWS gère la capacité automatiquement).

**Quand l'utiliser.** Pipeline de streaming temps réel avec plusieurs consommateurs, besoin de replay, ordonnancement par clé.

C'est **le seul produit** de la famille que ce module détaille en profondeur.

### 2.2 — Kinesis Data Firehose

Service de **livraison** managé. On lui envoie des records, il les agrège et les **livre** à une destination (S3, Redshift, OpenSearch, Splunk, Datadog, etc.).

- **Pas de notion de consommateur** côté utilisateur — Firehose **est** le consommateur.
- Buffer, compression et transformation avant livraison.
- Tarif à la **quantité de données ingérées**.

**Quand l'utiliser.** Quand on veut **simplement** déposer un flux d'événements dans un stockage cible, sans gestion de consommateurs ni replay.

**Différence clé avec KDS.** Firehose est un **tuyau de sortie**, KDS est un **réservoir avec robinet pour plusieurs lecteurs**.

### 2.3 — Amazon Managed Service for Apache Flink (anciennement Kinesis Data Analytics)

Service managé pour faire **du calcul temps réel** sur des flux (fenêtres glissantes, agrégats, jointures, détection de motifs).

- Basé sur Apache Flink (depuis 2023, qui remplace l'ancien SQL-based engine).
- Consomme typiquement depuis KDS, MSK ou Firehose.
- Adresse les besoins du parcours **AWS Analytics** plus que du parcours Kinesis.

**Quand l'utiliser.** Quand le besoin est de **transformer ou agréger** le flux en temps réel avant de le router.

### 2.4 — Kinesis Video Streams

Variante pour **flux vidéo** (caméras, IoT vidéo). Périmètre très spécifique.

- Sécurité, ingestion vidéo, intégration ML (Rekognition).
- Concepts différents (chunks, fragments) — n'a rien à voir avec un stream d'événements classique.

**Quand l'utiliser.** Vidéosurveillance, reconnaissance d'image temps réel, télémédecine. **Pas couvert** dans ce parcours.

### Récapitulatif

| Produit                              | Rôle                                    | Couvert ici ?                       |
| ------------------------------------ | --------------------------------------- | ----------------------------------- |
| **Kinesis Data Streams (KDS)**       | Stream d'événements multi-consommateurs | Oui, en profondeur                  |
| **Kinesis Data Firehose**            | Livraison managée vers stockage cible   | Mentionné, M2                       |
| **Managed Service for Apache Flink** | Calcul temps réel sur stream            | Hors périmètre (parcours Analytics) |
| **Kinesis Video Streams**            | Flux vidéo                              | Hors périmètre                      |

Dans la suite du parcours, **"Kinesis" signifie Kinesis Data Streams** sauf mention contraire.

---

## 3. Les trois concepts fondamentaux

### 3.1 — Le record

Un **record** est l'unité élémentaire d'un stream. C'est l'**événement** que les producteurs envoient et que les consommateurs lisent.

Anatomie d'un record :

| Champ                             | Rôle                                                         | Qui le fixe |
| --------------------------------- | ------------------------------------------------------------ | ----------- |
| **Data**                          | Le contenu utile (jusqu'à **1 Mo**), arbitraire (binaire)    | Le producer |
| **Partition Key**                 | Clé qui détermine **dans quel shard** le record atterrit     | Le producer |
| **Sequence Number**               | Identifiant unique attribué par Kinesis, croissant par shard | Kinesis     |
| **Approximate Arrival Timestamp** | Horodatage d'arrivée fixé par Kinesis                        | Kinesis     |

**Important.** Le record est **opaque** pour Kinesis. La data peut être du JSON, du Protobuf, du CSV, un binaire — Kinesis ne regarde pas. Producteur et consommateur doivent s'accorder sur le **format**.

**Taille maximale d'un record** : 1 Mo (data + clé). C'est large pour un événement métier — c'est étroit pour pousser un fichier complet. Si l'objet est plus gros, le pattern est de **mettre l'objet dans S3** et de **streamer la référence** dans Kinesis.

### 3.2 — La partition key

La **partition key** est une chaîne de caractères (jusqu'à 256 octets) que le producer attache à chaque record. Elle a **un seul rôle** : déterminer dans **quel shard** le record sera placé.

Le mécanisme :

1. Kinesis prend la partition key.
2. La hash en MD5 (128 bits).
3. Trouve le shard dont la **plage de hash** contient ce hash.
4. Place le record dans ce shard.

```
partition_key  →  MD5  →  hash 128 bits  →  shard correspondant
   "user-42"   →  ...  →  0x3f...          →  Shard 2
```

**Conséquence majeure.** Tous les records avec **la même partition key** atterrissent dans **le même shard** et sont donc **ordonnés strictement entre eux**. C'est la **garantie d'ordre** que Kinesis offre.

**Choix de la partition key — règle d'or.** La partition key doit être la **dimension métier** dont on veut garantir l'ordre. Exemples :

- Analytics par utilisateur → `partition_key = user_id`.
- Mesures IoT par capteur → `partition_key = device_id`.
- Événements de jeu par session → `partition_key = session_id`.
- Logs applicatifs sans besoin d'ordre → `partition_key = uuid4()` (distribution aléatoire).

**Erreur classique.** Mettre une partition key **trop peu distincte** (ex : `partition_key = "default"`) → tous les records vont sur **un seul shard** → bottleneck, perte de la scalabilité du stream.

### 3.3 — Le shard

Un **shard** est l'**unité de capacité** et l'**unité d'ordre** d'un stream Kinesis Data Streams (en mode Provisioned).

#### Capacité par shard

- **En écriture** : 1 Mo/s **ou** 1 000 records/s, selon le seuil atteint en premier.
- **En lecture standard** : 2 Mo/s par shard, partagés entre tous les consommateurs.
- **En lecture Enhanced Fan-out** : 2 Mo/s par couple (shard, consommateur). Concept approfondi en N3.

Si on dépasse, Kinesis renvoie une erreur `ProvisionedThroughputExceededException`. Le producer doit retry avec backoff (les SDK le font par défaut).

#### Ordre dans un shard

Les records d'un même shard sont **strictement ordonnés** par leur sequence number, qui croît à chaque insertion. Un consumer lit dans cet ordre.

**Il n'y a pas d'ordre global** entre les shards. Deux records sur deux shards différents peuvent être consommés dans n'importe quel ordre.

#### Représentation visuelle

```
                  Stream "user-events"
   ┌─────────────────────────────────────────────────────────┐
   │   ┌──────────────────┐    ┌──────────────────┐          │
   │   │ Shard 0          │    │ Shard 1          │          │
   │   │ hash 0x00..0x7F  │    │ hash 0x80..0xFF  │          │
   │   │                  │    │                  │          │
   │   │ R1, R2, R3, R4   │    │ R5, R6, R7       │          │
   │   │ (ordonnés)       │    │ (ordonnés)       │          │
   │   └──────────────────┘    └──────────────────┘          │
   └─────────────────────────────────────────────────────────┘
                          ↑                    ↑
                  partition_key=A,B    partition_key=C,D
```

- Les records `R1` à `R4` sont strictement ordonnés entre eux.
- Les records `R5` à `R7` sont strictement ordonnés entre eux.
- Aucun ordre garanti **entre** Shard 0 et Shard 1.

### Synthèse — la phrase à retenir

> **Un producer envoie des records.** Chaque record a une **partition key** qui le place dans un **shard**. Tous les records d'un même shard sont **ordonnés**. Plusieurs **consumers** peuvent lire le stream indépendamment.

---

## 4. Modèles de capacité — On-Demand vs Provisioned

Depuis 2021, Kinesis Data Streams offre **deux modes** de facturation et de gestion de capacité.

### 4.1 — Mode Provisioned

- On **choisit** le nombre de shards.
- On **paye** au shard-heure + au record.
- C'est à nous d'ajuster (re-sharding) si la charge dépasse la capacité.
- Convient quand on **connaît** la charge à l'avance et qu'elle est stable.

### 4.2 — Mode On-Demand

- AWS **gère automatiquement** la capacité.
- Le stream supporte par défaut jusqu'à **200 Mo/s en écriture** et **400 Mo/s en lecture**.
- Tarification au volume écrit + lu (plus cher au volume que le Provisioned, plus simple à opérer).
- Convient pour des charges **imprévisibles** ou pour démarrer sans dimensionnement.

### 4.3 — Quel mode choisir au démarrage ?

Au tout début du parcours et pour les exercices de ce module, **On-Demand** est recommandé : zéro dimensionnement, on apprend les concepts sans s'enliser dans le calcul de shards. En production, le Provisioned devient préférable au-delà d'une charge stable et significative — gain de 20 à 60 % en coût.

---

## 5. Cycle de vie d'un record

```
┌────────────┐    PutRecord(s)     ┌────────────────┐    GetShardIterator + GetRecords    ┌────────────┐
│  Producer  │ ────────────────►  │  Stream KDS    │  ◄──────────────────────────────────│  Consumer  │
│            │                     │  (shards)      │                                      │            │
└────────────┘                     │                │                                      └────────────┘
                                   │  Rétention :   │                                      ┌────────────┐
                                   │  24h - 365j    │  ◄──────────────────────────────────│  Consumer  │
                                   │                │                                      │  (autre)   │
                                   └────────────────┘                                      └────────────┘
```

Étapes côté **producer** :

1. Construire le record (data + partition_key).
2. Appeler `PutRecord` (un par un) ou `PutRecords` (batch jusqu'à 500).
3. Le SDK gère les retries en cas de `ProvisionedThroughputExceededException`.

Étapes côté **consumer** (consommation **standard**) :

1. Récupérer la liste des shards (`ListShards`).
2. Pour chaque shard, obtenir un **shard iterator** (`GetShardIterator`) en précisant où commencer (`TRIM_HORIZON`, `LATEST`, `AT_TIMESTAMP`, `AT_SEQUENCE_NUMBER`).
3. Boucler sur `GetRecords` avec l'itérateur, qui renvoie un nouveau shard iterator pour la suite.
4. Traiter les records, puis stocker le **dernier sequence number consommé** quelque part (souvent DynamoDB via la **Kinesis Client Library / KCL**) pour reprendre après un redémarrage.

**Important.** Kinesis **ne supprime pas** les records après lecture. Ils restent disponibles pendant la **durée de rétention** (24h par défaut, jusqu'à 365 jours). C'est ce qui permet :

- Plusieurs consommateurs indépendants.
- Le rejeu (replay) d'événements anciens.
- La récupération après bug d'un consumer.

C'est aussi la **différence fondamentale** avec SQS, qui **supprime** un message après ACK.

---

## 6. Exercice guidé — Hello Kinesis

Cette section est un mode opératoire pas-à-pas, à reproduire en console AWS ou en CLI. Durée : 30 à 45 minutes.

### 6.1 — Pré-requis

- AWS CLI configurée (`aws configure`).
- Un profil IAM avec les permissions :
  - `kinesis:CreateStream`
  - `kinesis:PutRecord`
  - `kinesis:GetShardIterator`
  - `kinesis:GetRecords`
  - `kinesis:DescribeStream`
  - `kinesis:DeleteStream`
- Région choisie (ex : `eu-west-1`). On la fixe pour l'exercice.

### 6.2 — Créer un stream On-Demand

```bash
aws kinesis create-stream \
    --stream-name hello-kinesis \
    --stream-mode-details StreamMode=ON_DEMAND \
    --region eu-west-1
```

Attendre que le stream soit `ACTIVE` :

```bash
aws kinesis describe-stream-summary \
    --stream-name hello-kinesis \
    --region eu-west-1
```

Chercher `"StreamStatus": "ACTIVE"`. La création prend typiquement 30 à 60 secondes.

### 6.3 — Envoyer trois records

```bash
aws kinesis put-record \
    --stream-name hello-kinesis \
    --partition-key user-1 \
    --data "$(echo -n '{"event":"login","ts":"2026-05-16T10:00:00Z"}' | base64)" \
    --region eu-west-1

aws kinesis put-record \
    --stream-name hello-kinesis \
    --partition-key user-1 \
    --data "$(echo -n '{"event":"add_to_cart","ts":"2026-05-16T10:00:30Z"}' | base64)" \
    --region eu-west-1

aws kinesis put-record \
    --stream-name hello-kinesis \
    --partition-key user-2 \
    --data "$(echo -n '{"event":"login","ts":"2026-05-16T10:01:00Z"}' | base64)" \
    --region eu-west-1
```

**Note.** Les data sont en **base64** dans la CLI. Le SDK Python/Java/JS le fait automatiquement.

Observer la sortie : pour chaque appel, on récupère un `ShardId` et un `SequenceNumber`. Les deux premiers records (même partition key `user-1`) doivent être sur le **même shard**.

### 6.4 — Lire les records

Lister les shards :

```bash
aws kinesis list-shards \
    --stream-name hello-kinesis \
    --region eu-west-1
```

Pour chaque shard, récupérer un iterator au début (`TRIM_HORIZON`) :

```bash
aws kinesis get-shard-iterator \
    --stream-name hello-kinesis \
    --shard-id shardId-000000000000 \
    --shard-iterator-type TRIM_HORIZON \
    --region eu-west-1
```

Récupérer les records avec l'iterator :

```bash
aws kinesis get-records \
    --shard-iterator <l-iterator-renvoyé-ci-dessus> \
    --region eu-west-1
```

Le résultat est en JSON, avec le champ `Data` en base64. Le décoder pour voir le payload original.

### 6.5 — Nettoyer

Ne pas oublier, sinon le stream continue à facturer :

```bash
aws kinesis delete-stream \
    --stream-name hello-kinesis \
    --enforce-consumer-deletion \
    --region eu-west-1
```

---

## 7. Exercices pratiques

### Exercice 1 — Refaire l'exercice guidé avec un SDK (≈ 45 min)

Réécrire la séquence de la section 6 en Python avec **boto3**.

```bash
pip install boto3
```

Squelette à compléter :

```python
import boto3
import json
from datetime import datetime, timezone

client = boto3.client("kinesis", region_name="eu-west-1")

# 1. Créer le stream (s'il n'existe pas).
# 2. Boucler en attente du statut ACTIVE.
# 3. Publier 5 records avec deux partition keys différentes.
# 4. Lister les shards.
# 5. Pour chaque shard, lire les records et les afficher décodés.
# 6. Supprimer le stream.
```

**Critère de réussite.** Le script tourne de bout en bout (création → 5 records écrits → 5 records lus → suppression) en moins de 3 minutes. Tous les records lus contiennent leur JSON décodé.

### Exercice 2 — Observer la garantie d'ordre (≈ 30 min)

Modifier le script précédent pour :

1. Publier **20 records** avec partition key `user-1`.
2. Publier **20 records** avec partition key `user-2`.
3. Publier **20 records** avec partition key aléatoire (UUID).

Puis lire l'ensemble du stream et vérifier :

- Tous les records `user-1` arrivent dans l'**ordre exact** d'envoi.
- Tous les records `user-2` arrivent dans l'**ordre exact** d'envoi.
- Les records `user-1` et `user-2` peuvent **s'entrelacer** entre eux.
- Les records à clé aléatoire peuvent **s'entrelacer** avec n'importe quoi.

Inclure un compteur croissant dans le payload (`{"seq": N, ...}`) pour vérifier l'ordre programmatiquement.

### Exercice 3 — Identifier des cas d'usage (≈ 25 min)

Pour chaque scénario, répondre **Kinesis pertinent** ou **non pertinent**, et choisir parmi les produits de la famille (KDS / Firehose / Flink / Video / aucun). Justifier en 2 lignes.

1. Envoi automatique d'un email de bienvenue après inscription.
2. Capteurs industriels qui envoient 50 mesures par seconde par capteur, 1 000 capteurs en parc. Plusieurs systèmes consomment : alerting temps réel, archivage long terme, analyse fraude.
3. Livraison de logs CloudFront vers un bucket S3 partitionné par heure.
4. Traitement d'une commande e-commerce : déclencher facturation, expédition, email de confirmation.
5. Tableau de bord temps réel de l'activité utilisateurs sur une app mobile (1 million d'utilisateurs).
6. Sauvegarde quotidienne d'une base SQL vers S3.

### Exercice 4 — Calculer le besoin en shards (≈ 30 min)

On veut ingérer un flux dans Kinesis Data Streams. Voici trois scénarios. Pour chacun, calculer le **nombre minimum de shards** nécessaires en mode **Provisioned**.

**Rappel des limites par shard** :

- Écriture : 1 Mo/s **ou** 1 000 records/s.
- Lecture standard : 2 Mo/s par shard, partagé entre consommateurs.

**Scénario A.** 200 records/s, payload moyen 2 Ko. Deux consommateurs.

**Scénario B.** 3 000 records/s, payload moyen 500 octets. Un consommateur.

**Scénario C.** 50 records/s, payload moyen 800 Ko. Quatre consommateurs.

Pour chaque scénario, vérifier que la limite **écriture** ET la limite **lecture par consommateur** sont respectées.

### Exercice 5 — Mauvais choix de partition key (≈ 20 min)

Une équipe envoie tous les logs de son application avec `partition_key = "logs"`. Elle constate :

- Sur un stream à 4 shards, **1 seul shard** semble actif.
- Au-delà de 1 Mo/s d'ingestion, elle reçoit des `ProvisionedThroughputExceededException`.
- Le scaling à 16 shards **ne résout pas** le problème.

Expliquer ce qui se passe et proposer une **partition key alternative** adaptée si :

a) L'équipe veut garder l'ordre **par instance de serveur** émettrice.
b) L'équipe se moque de l'ordre et veut juste maximiser le débit.

---

## 8. Mini-défi — premier pipeline producer/consumer (≈ 90 min)

Construire un mini-pipeline complet en Python.

### Producteur

Un script `producer.py` qui simule l'activité d'une application web :

- Génère 200 événements en 60 secondes (≈ 3 events/s).
- Chaque événement est un JSON `{"user_id": "u-X", "action": "...", "ts": "..."}`.
- 5 utilisateurs distincts (`u-1` à `u-5`), partition_key = `user_id`.
- Actions tirées au hasard : `login`, `page_view`, `add_to_cart`, `purchase`, `logout`.

### Consommateur

Un script `consumer.py` qui :

- Liste les shards du stream.
- Pour chaque shard, démarre une boucle de lecture (`TRIM_HORIZON` à la première exécution).
- Affiche chaque record dans l'ordre, avec son shard d'origine.
- Compte les événements par `user_id` et par `action`, et affiche un rapport toutes les 10 secondes.

### Critères de validation

- [ ] Tous les événements d'un même `user_id` sont consommés dans l'**ordre d'émission**.
- [ ] Le rapport final indique **200 événements** total, répartis sur les 5 utilisateurs.
- [ ] Aucun crash sur les `ProvisionedThroughputExceededException` (retry géré).
- [ ] Le stream est supprimé à la fin du défi.

**Note.** Ce mini-défi reste **mono-process**. La consommation parallèle propre (avec checkpoint en DynamoDB, gestion des split/merge de shards) relève de la **Kinesis Client Library (KCL)** et sera abordée plus tard dans le parcours.

---

## 9. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] L'apprenant explique en deux phrases **ce qu'est Kinesis** et **dans quel cas le choisir**.
- [ ] Il distingue les **quatre produits** de la famille Kinesis et sait que "Kinesis" dans le parcours = **KDS**.
- [ ] Il définit **record**, **partition key**, **shard** sans hésiter.
- [ ] Il sait calculer le **nombre de shards** nécessaires à partir d'un débit donné (exercice 4).
- [ ] Il a **créé un stream**, **publié et lu des records** via la CLI ou un SDK.
- [ ] Il a complété le **mini-défi** producer/consumer avec 5 utilisateurs.
- [ ] Il reconnaît un **mauvais choix de partition key** (cf. exercice 5).

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : intérêt de Kinesis.
- **N1** : concepts fondamentaux (shard, partition key, records).

L'item N1 _différence entre Kinesis et SQS_ est **survolé** ici et sera **approfondi en M2**. L'item N2 _ordonnancement et répartition_ est partiellement traité ici (sections 3.3 et 5) et sera **consolidé en M3**.

---

## 10. Ressources complémentaires

### Documentation officielle

- **Amazon Kinesis Data Streams Developer Guide** — [docs.aws.amazon.com/streams/latest/dev](https://docs.aws.amazon.com/streams/latest/dev/). La référence ; lire l'introduction et la section _Key Concepts_.
- **Amazon Kinesis Data Streams API Reference** — [docs.aws.amazon.com/kinesis/latest/APIReference](https://docs.aws.amazon.com/kinesis/latest/APIReference/). Pour les détails de chaque appel (`PutRecord`, `GetShardIterator`, etc.).
- **AWS CLI Kinesis Reference** — [docs.aws.amazon.com/cli/latest/reference/kinesis](https://docs.aws.amazon.com/cli/latest/reference/kinesis/index.html).
- **Boto3 Kinesis** — [boto3.amazonaws.com/v1/documentation/api/latest/reference/services/kinesis](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/kinesis.html).

### Articles et tutoriels

- **AWS Blog** — _Snapshot of Kinesis_, articles _re:Invent_. Pour les usages réels par d'autres équipes.
- **AWS Workshop** — _Kinesis Data Streams Workshop_ (catalog.workshops.aws). Tutoriel guidé pas à pas, complémentaire à ce module.
- **AWS Well-Architected Framework — Analytics Lens**. Place Kinesis dans une vision plus large des architectures data.

### Approfondissement

- **Tyler Akidau, Slava Chernyak, Reuven Lax** — _Streaming Systems_ (2018). Pour comprendre les fondations conceptuelles du streaming (watermarks, fenêtres, exactly-once) — utile dès qu'on dépasse les bases.
- **Documentation interne** : `resources/priority1/AWS Kinesis.md` — niveaux 1 à 3 pour situer le parcours et préparer M2 et M3.
