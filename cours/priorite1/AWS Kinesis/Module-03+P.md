# M3 — Mécanique du stream

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer **l'ordonnancement** dans Kinesis : pourquoi l'ordre est garanti **par shard** mais pas globalement, et ce qu'est un **sequence number**.
- Expliquer la **répartition des messages** : comment Kinesis utilise la **partition key** et son **hash MD5** pour acheminer un record vers un shard, ce qu'est un **hash key range**, et pourquoi une mauvaise partition key crée un **hot shard**.
- **Configurer la rétention** d'un stream (1 à 365 jours), connaître les coûts associés et choisir la rétention adaptée à son cas d'usage.
- **Tracer la distribution réelle** d'un flux de messages sur 2 shards et **diagnostiquer** un déséquilibre.
- Concevoir et implémenter un **pipeline producer/consumer Kinesis** end-to-end avec partition key et rétention justifiées (mini-projet final du parcours Kinesis).

## Durée estimée

2 à 3 jours, mini-projet final inclus.

## Pré-requis

- M1 (KDS, shard, partition key, record) et M2 (Kinesis vs autres brokers).
- AWS CLI v2 configurée avec des credentials valides (réutiliser l'environnement de M1).
- Python 3.11+ avec `boto3` installé (réutiliser l'environnement de M1).
- POO M5 (programmation Python avancée) — recommandé pour le mini-projet.

---

## 1. Le stream comme log distribué et partitionné

### Rappel synthétique

En M1 on a posé le vocabulaire — record, partition key, shard. En M2 on a positionné Kinesis vis-à-vis des autres familles de messagerie. Ce module pousse un cran plus profond : **comment Kinesis fonctionne mécaniquement à l'intérieur**.

Trois sous-systèmes à comprendre, et c'est tout :

1. **L'ordonnancement** — dans quel ordre les records sont stockés et lus.
2. **La répartition** — comment un record est acheminé vers tel shard plutôt que tel autre.
3. **La rétention** — combien de temps un record reste dans le stream.

Ces trois sujets sont **liés** : on choisit une partition key (répartition) pour préserver l'ordre logique (ordonnancement), et on dimensionne la rétention (durée) pour permettre aux consommateurs de rejouer si besoin.

### L'analogie du tapis roulant à voies multiples

Imaginer un entrepôt avec **plusieurs tapis roulants** en parallèle. Chaque colis arrivant à l'entrée est posé sur **un seul** des tapis, selon une règle de tri (par exemple : "destination Nord → tapis 1, destination Sud → tapis 2"). Une fois sur son tapis, le colis **conserve sa place** dans la file — premier posé, premier sorti. Mais entre deux tapis, l'ordre est **indépendant** : un colis arrivé à 9h sur le tapis 1 peut être derrière un colis arrivé à 10h sur le tapis 2 lorsque les opérateurs en bout de chaîne les regardent côte à côte.

Trois conséquences directes, qu'on retrouvera mot pour mot dans Kinesis :

- **Ordre par tapis** garanti, **ordre global** non garanti.
- La **règle de tri** détermine la répartition de la charge : mal choisie, elle entasse les colis sur un tapis et laisse les autres vides.
- Plus de tapis = plus de débit, mais aussi plus de complexité côté lecture (un opérateur par tapis).

Dans Kinesis : **tapis = shard**, **règle de tri = partition key**, **colis = record**, **opérateur = consumer**.

---

## 2. L'ordonnancement dans Kinesis

### 2.1 — Ordre garanti par shard

C'est la **première garantie fondamentale** de Kinesis, et elle se résume en une phrase :

> Dans un shard, les records sont stockés et lus dans l'**ordre d'arrivée** chez Kinesis.

Cela signifie qu'un consommateur qui lit le shard du début à la fin verra les records exactement dans l'ordre où ils ont été acceptés par le service. Si le producteur envoie `R1`, puis `R2`, puis `R3` **sur le même shard** (donc avec des partition keys qui hashent vers ce shard), le consommateur lira `R1 → R2 → R3` dans cet ordre, point.

Cet ordre est matérialisé par un **sequence number** : un identifiant unique, monotone croissant, attribué par Kinesis à chaque record au moment où il l'accepte dans un shard. Deux records dans le même shard ont des sequence numbers strictement croissants ; un consommateur peut donc trier ou reprendre la lecture à partir d'un sequence number précis.

```python
import boto3, json

client = boto3.client("kinesis", region_name="eu-west-1")

response = client.put_record(
    StreamName="orders-stream",
    Data=json.dumps({"order_id": "O-42", "amount": 19.99}).encode(),
    PartitionKey="customer-7",
)

print(response["SequenceNumber"])
# Exemple : 49635409832745728145923847562934857623948576234957
print(response["ShardId"])
# Exemple : shardId-000000000001
```

Le sequence number renvoyé par `PutRecord` est l'**adresse logique** du record dans le stream. Il sert à se positionner précisément lors de la lecture (`ShardIteratorType=AT_SEQUENCE_NUMBER`).

### 2.2 — Pas d'ordre global

C'est la **deuxième garantie fondamentale**, formulée en négatif :

> Entre deux shards, **aucun ordre n'est garanti**.

Si le producteur envoie `R1` (qui va sur `shard-A`), puis 1 milliseconde plus tard `R2` (qui va sur `shard-B`), un consommateur qui lit `shard-B` puis `shard-A` peut voir `R2` avant `R1`. Pire : deux consommateurs lisant chacun un shard différent peuvent voir les records dans deux ordres **incompatibles**.

Cette propriété n'est pas un défaut, c'est le **prix à payer** pour la scalabilité horizontale. Si Kinesis garantissait un ordre global, il faudrait un coordinateur central — exactement ce qui empêche Kafka, Kinesis, Pulsar et consorts de scaler. SQS FIFO offre un ordre global, mais à 300 messages/seconde par queue (3 000 avec batching), soit deux à trois ordres de grandeur en dessous de Kinesis.

**Conséquence d'architecture.** Tout besoin d'ordre dans une application Kinesis se traduit par une question préalable : **quelle clé d'ordonnancement** ? La réponse détermine la partition key.

### 2.3 — Partition key = clé d'ordonnancement logique

C'est ici que les deux propriétés se rejoignent :

> Tous les records partageant la **même partition key** vont sur le **même shard** (tant qu'il n'y a pas de re-sharding — voir N3). Et l'ordre dans ce shard est garanti.

Donc :

> **Choisir la partition key, c'est choisir la granularité d'ordre.**

| Cas d'usage         | Partition key        | Ordre garanti pour…                 |
| ------------------- | -------------------- | ----------------------------------- |
| IoT capteurs        | `device_id`          | …les mesures **d'un même capteur**  |
| Clickstream         | `session_id`         | …les clics **d'une même session**   |
| E-commerce — orders | `customer_id`        | …les commandes **d'un même client** |
| Logs applicatifs    | `host_id`            | …les logs **d'une même machine**    |
| Trading             | `symbol` (e.g. AAPL) | …les ticks **d'un même titre**      |

Si l'on choisit comme partition key un identifiant **trop large** (par exemple `region` avec 4 régions, dans un stream à 32 shards), on dégrade l'ordre **sans** rien gagner et on crée des hot shards. Si l'on choisit un identifiant **trop fin** (par exemple un UUID aléatoire par record), on obtient une distribution uniforme **mais** on n'a plus aucune notion d'ordre logique — chaque record est seul dans son monde.

Le bon niveau, dans 90 % des cas, est l'**entité métier** dont les événements doivent être ordonnés entre eux : utilisateur, commande, session, capteur, agrégat DDD.

### 2.4 — Comment Kinesis génère le sequence number

Le sequence number n'est **pas** une simple incrémentation d'entier. C'est une chaîne longue (typiquement 56 caractères) qui encode plusieurs informations internes — un identifiant interne de shard epoch, un timestamp, un compteur. Trois propriétés à retenir :

1. **Monotonie stricte** dans un shard donné : sequence(R_n+1) > sequence(R_n).
2. **Pas d'arithmétique** : on ne peut pas faire `seqN - seqN-1` pour compter les records. Pour cela, on lit séquentiellement.
3. **Pas de comparabilité inter-shards** : un sequence number du shard A et un sequence number du shard B ne sont **pas** comparables dans le temps.

Le bon réflexe : utiliser le sequence number **uniquement** comme curseur de reprise, jamais comme métrique.

### 2.5 — Ordonnancement : Kinesis vs alternatives

| Système          | Ordre par partition      | Ordre global                              | Mécanisme                      |
| ---------------- | ------------------------ | ----------------------------------------- | ------------------------------ |
| **Kinesis KDS**  | Oui (par shard)          | Non                                       | Sequence number                |
| **Kafka**        | Oui (par partition)      | Non                                       | Offset                         |
| **SQS standard** | Best-effort              | Non                                       | Aucun                          |
| **SQS FIFO**     | Oui (par MessageGroupId) | Quasi-global mais limité à 300-3000 msg/s | MessageGroupId + déduplication |
| **SNS standard** | Non                      | Non                                       | —                              |
| **EventBridge**  | Non                      | Non                                       | —                              |

Kinesis et Kafka adoptent **le même modèle** (ordre par partition / shard, pas d'ordre global). C'est le **modèle log distribué** classique.

---

## 3. La répartition des messages

### 3.1 — L'algorithme

À chaque appel `PutRecord`, Kinesis effectue trois opérations internes pour acheminer le record :

```
                ┌────────────────────────────────────────────────────────┐
                │  1. MD5(partition_key) → entier 128 bits ("hash key")  │
                │  2. Localiser le shard dont le hash key range          │
                │     contient ce hash key                               │
                │  3. Ajouter le record en queue du shard,               │
                │     attribuer un sequence number                       │
                └────────────────────────────────────────────────────────┘
```

C'est tout. Pas de heuristique, pas de "à la volée", pas de load balancing actif. **Une partition key → un et un seul shard**, de manière déterministe.

### 3.2 — Hash key range

L'espace des hash MD5 est un entier 128 bits, soit la plage **[0, 2^128 - 1]**. Kinesis découpe cette plage en intervalles disjoints, un par shard. Chaque shard reçoit un **hash key range** — par exemple, pour un stream à 2 shards :

| Shard               | Hash key range (simplifié) |
| ------------------- | -------------------------- |
| `shardId-000...001` | `[0, 2^127 - 1]`           |
| `shardId-000...002` | `[2^127, 2^128 - 1]`       |

Quand on fait `aws kinesis describe-stream`, on voit explicitement ces plages :

```bash
aws kinesis describe-stream --stream-name orders-stream \
  --query 'StreamDescription.Shards[].{ShardId:ShardId, StartHashKey:HashKeyRange.StartingHashKey, EndHashKey:HashKeyRange.EndingHashKey}'
```

Sortie typique :

```json
[
  {
    "ShardId": "shardId-000000000000",
    "StartHashKey": "0",
    "EndHashKey": "170141183460469231731687303715884105727"
  },
  {
    "ShardId": "shardId-000000000001",
    "StartHashKey": "170141183460469231731687303715884105728",
    "EndHashKey": "340282366920938463463374607431768211455"
  }
]
```

**À retenir.** Quand on crée un stream à N shards, Kinesis découpe la plage en N parts **égales** (par défaut). Lors d'un re-sharding (split / merge — niveau 3), ces plages deviennent inégales.

### 3.3 — Distribution uniforme vs hot shard

Si la partition key prend des valeurs **uniformément réparties**, le hash MD5 est lui-même uniformément réparti (c'est la propriété fondamentale d'un bon hash), donc les records se répartissent **uniformément** entre shards.

Mais si la partition key prend des valeurs **biaisées** — par exemple, 80 % des records ont `partition_key="region-EU"` et 20 % `partition_key="region-US"` — alors **tous les "EU" finissent sur le même shard** (et tous les "US" sur le même autre, voire le même !). On obtient un **hot shard** : un shard qui sature à 1 MB/s d'écriture ou 1 000 records/s pendant que les autres dorment.

```
Distribution équilibrée (10 partition keys variées, 2 shards) :

shardId-000 : ████████████████████████████ (52 records)
shardId-001 : ███████████████████████████  (48 records)


Hot shard (partition_key = "region", 4 valeurs, 2 shards) :

shardId-000 : ██                            ( 8 records — region-US)
shardId-001 : ████████████████████████████  (92 records — region-EU, region-FR, region-DE)
```

**Symptômes en production d'un hot shard :**

- Métrique CloudWatch `WriteProvisionedThroughputExceeded` non nulle sur **un** shard.
- Latence d'écriture en hausse, throttling côté producteur (`ProvisionedThroughputExceededException`).
- Latence de lecture en hausse côté consommateur du shard chaud, alors que les autres consommateurs sont oisifs.
- Facture qui ne baisse pas malgré l'ajout de shards (les nouveaux shards restent vides).

**Diagnostic.** Si on suspecte un hot shard, on instrumente le producteur pour compter les records par partition key, ou on lit les shards séparément et on compte côté consommateur. C'est exactement l'objet de l'exercice 1 de ce module.

### 3.4 — Explicit hash key (cas avancé)

`PutRecord` accepte un paramètre `ExplicitHashKey` qui **court-circuite** le hash MD5 :

```python
client.put_record(
    StreamName="orders-stream",
    Data=b"...",
    PartitionKey="customer-7",
    ExplicitHashKey="0",
)
```

Avec `ExplicitHashKey="0"`, le record va forcément dans le shard contenant le hash key 0, **quelle que soit** la partition key. Utilisations légitimes :

- Forcer un record à aller sur un shard précis pour des tests.
- Implémenter un load balancing custom (rare — typiquement Kinesis le fait mieux).
- Re-router temporairement après un re-sharding (avancé).

À éviter en exploitation courante : on perd la lisibilité de l'algorithme par défaut.

### 3.5 — Choisir une bonne partition key — checklist

Cinq questions à se poser **avant** d'écrire la première ligne de producer :

1. **Quelle est l'unité d'ordre dans mon métier ?** L'utilisateur ? La commande ? Le capteur ? La session ? La partition key doit être l'identifiant de cette unité.
2. **Combien de valeurs distinctes prend cette clé en pratique ?** Si c'est inférieur ou égal au nombre de shards, on aura forcément des shards vides et un risque de hot shard. Viser au minimum **10×** plus de valeurs distinctes que de shards.
3. **La distribution est-elle uniforme ?** Si 10 % des utilisateurs représentent 90 % du trafic (loi de Pareto), envisager de **suffixer** la clé chaude (`user-42-0`, `user-42-1`, …, `user-42-9`) — au prix de perdre l'ordre pour cet utilisateur.
4. **Y a-t-il un risque que la clé devienne biaisée dans le futur ?** Un `region` à 4 valeurs aujourd'hui restera à 4 valeurs demain — anti-pattern. Un `customer_id` qui grandit avec l'usage est bien plus robuste.
5. **Le besoin d'ordre est-il réel ?** Si on n'a pas besoin d'ordre, utiliser un **UUID aléatoire** comme partition key garantit une distribution parfaitement uniforme — mais perdre cette propriété rend l'utilisation de Kinesis souvent moins justifiée que SQS.

---

## 4. Configuration de la rétention

### 4.1 — La rétention, c'est quoi

La **rétention** d'un stream Kinesis est la **durée pendant laquelle un record reste disponible à la lecture** après avoir été ingéré. Passé ce délai, le record est **supprimé automatiquement** et plus aucun consommateur ne peut le lire — pas même via un sequence number.

Trois points à retenir :

- **Plage configurable** : de **24 heures** (minimum) à **365 jours** (maximum).
- **Par stream**, pas par shard ni par record.
- **Modifiable à chaud** : on peut augmenter ou diminuer la rétention d'un stream existant sans interruption.

### 4.2 — Comment configurer

Trois méthodes équivalentes — CLI, console, SDK.

**CLI :**

```bash
# Augmenter la rétention à 7 jours
aws kinesis increase-stream-retention-period \
  --stream-name orders-stream \
  --retention-period-hours 168

# Diminuer la rétention à 48 heures
aws kinesis decrease-stream-retention-period \
  --stream-name orders-stream \
  --retention-period-hours 48
```

**SDK Python (boto3) :**

```python
client.increase_stream_retention_period(
    StreamName="orders-stream",
    RetentionPeriodHours=168,
)
```

**À la création du stream :**

```bash
aws kinesis create-stream \
  --stream-name orders-stream \
  --shard-count 2 \
  --stream-mode-details StreamMode=PROVISIONED
# Note : create-stream ne prend pas de retention-period.
# Par défaut : 24h. Modifier ensuite via increase-stream-retention-period.
```

### 4.3 — Coût

La rétention au-delà de 24h est **facturée séparément** :

- **0 à 24h** : inclus dans le prix du shard.
- **24h à 7 jours** ("extended retention") : facturé par shard-heure supplémentaire (~0,02 $ / shard-heure, varie selon la région).
- **7 jours à 365 jours** ("long-term retention") : facturé à un tarif **plus élevé** (~0,10 $ par GB-mois retenu).

**Ordre de grandeur.** Pour un stream à 10 shards :

- 24h de rétention : ~108 $ / mois (shards seuls, On-Demand exclu).
- 7 jours : ~108 + ~144 = ~252 $ / mois.
- 365 jours : facturation principale au volume retenu (peut largement dépasser le coût des shards).

Conclusion pratique : ne payer **que** la rétention dont on a réellement besoin. Voir tableau ci-dessous.

### 4.4 — Choisir la rétention

| Cas d'usage                                             | Rétention recommandée | Raison                                                                                                      |
| ------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pipeline temps réel sans rejeu (clickstream → Firehose) | **24 h** (défaut)     | Pas de besoin de rejouer ; les consommateurs sont rapides ; budget minimal.                                 |
| Microservice consumer avec recovery sur incident court  | **48 à 72 h**         | Le temps de redéployer un consumer cassé sans perdre de données.                                            |
| Replay régulier en pré-production / debug               | **7 jours**           | Permettre aux dev/QA de rejouer une semaine de trafic pour reproduire un bug.                               |
| Recompute analytique périodique (modèle ML, agrégats)   | **7 à 30 jours**      | Recalculer un agrégat sur une fenêtre passée sans refaire l'ingestion depuis S3.                            |
| Source of truth temporaire avant archivage S3           | **7 à 90 jours**      | Donner du mou avant que Firehose / job batch n'archive vers S3.                                             |
| Archivage long terme dans Kinesis                       | **NON, utiliser S3**  | Kinesis n'est **pas** un système d'archivage. S3 (avec Glacier en lifecycle) est 100× moins cher. Voir 4.5. |

### 4.5 — Rétention longue vs archivage S3

**À ne pas faire :** utiliser Kinesis à 365 jours comme système d'archive.

**Pourquoi :**

- **Coût** : S3 standard est 10× moins cher au GB-mois ; S3 Glacier 100× moins cher.
- **Requête** : Kinesis n'a pas de requête par contenu — il faut lire séquentiellement chaque shard. S3 + Athena permet du SQL.
- **Garantie** : la durabilité 11 9's de S3 dépasse celle de Kinesis pour de l'archivage long terme.

**Pattern correct.** Mettre Firehose en consumer du stream avec destination S3 partitionnée (`year=2026/month=05/day=17/`), garder Kinesis à 24-72h pour le rejeu court terme, requêter S3 via Athena pour l'archive. Ce pattern est central au mini-projet de ce module.

### 4.6 — Subtilité — diminuer la rétention

`decrease-stream-retention-period` est immédiat mais **non rétroactif** dans le sens où on pourrait le craindre : les records déjà ingérés et dans la fenêtre récente restent lisibles le temps qu'ils expirent selon leur **propre** âge.

Exemple : un stream à 7 jours de rétention, on passe à 24h. Un record ingéré 3 jours plus tôt restera lisible quelques heures (jusqu'à ce qu'il franchisse les 7 jours d'âge — Kinesis applique l'expiration sur l'âge du record). Inversement, **augmenter** la rétention ne ressuscite **pas** les records déjà supprimés.

---

## 5. Le cycle de vie d'un record

Synthèse visuelle des 4 sections précédentes :

```
                                   ┌────────────────────────────────────────────┐
                                   │ Producer                                   │
                                   │ put_record(partition_key="customer-7",     │
                                   │            data=...)                       │
                                   └────────────────────┬───────────────────────┘
                                                        │
                                                        ▼
                              ┌─────────────────────────────────────────┐
                              │ Kinesis Frontend                        │
                              │ hash = MD5("customer-7")                │
                              │ shard = find_shard_for(hash)            │
                              │ sequence_number = next_in_shard(shard)  │
                              │ → ACK au producer (latence ~10-100ms)   │
                              └─────────────────────┬───────────────────┘
                                                    │
                                                    ▼
                              ┌─────────────────────────────────────────┐
                              │ Shard storage (réplique sur 3 AZ)       │
                              │ [..., R_n-1, R_n, R_n+1, ...]           │
                              │ Conservé pendant `retention_period`     │
                              └─────────┬───────────────────────┬───────┘
                                        │                       │
                                        │                       │
                              ┌─────────▼──────────┐   ┌────────▼────────┐
                              │ Consumer A         │   │ Consumer B      │
                              │ get_records(iter)  │   │ get_records(...) │
                              │ checkpoint chaque  │   │ Lit indépendam- │
                              │ N records          │   │ ment de A       │
                              └────────────────────┘   └─────────────────┘
                                        ▲
                                        │
                                        │  Au-delà de retention_period :
                                        │  record supprimé, plus lisible
                                        ▼
                                  ┌──────────┐
                                  │  Tombe   │
                                  └──────────┘
```

À chaque étape, retenir l'invariant :

- **Producer → frontend** : la partition key détermine **le shard**, immuablement.
- **Frontend → shard** : le sequence number détermine **l'ordre dans le shard**, immuablement.
- **Shard → consumers** : chaque consumer **avance à son rythme** ; la rétention détermine **combien de temps** il peut traîner.

---

## 6. Patterns d'ordonnancement et de répartition par domaine

Quatre cas réalistes pour ancrer les choix de partition key.

### 6.1 — IoT — capteurs industriels

**Contexte.** 10 000 capteurs envoient une mesure de température par seconde. On veut détecter une dérive de température sur un capteur donné.

- **Partition key** : `device_id`.
- **Pourquoi** : les mesures d'un même capteur doivent rester ordonnées pour calculer une dérive. 10 000 valeurs distinctes pour ~10 shards → distribution uniforme garantie.
- **Rétention** : 24-48h (les détections sont temps réel ; pas de rejeu prolongé nécessaire).

### 6.2 — Clickstream — analytics web

**Contexte.** 1 million d'événements de clic par jour. On veut reconstituer le parcours de chaque session pour de l'analytics et du ML.

- **Partition key** : `session_id`.
- **Pourquoi** : les clics d'une session doivent rester ordonnés. Très grand nombre de sessions concurrentes → distribution uniforme.
- **Rétention** : 7 jours, pour permettre à la pipeline ML de recompute.

### 6.3 — E-commerce — order events

**Contexte.** Un service publie des événements `OrderCreated`, `OrderPaid`, `OrderShipped`, `OrderDelivered`. Plusieurs consommateurs (notification, ERP, BI).

- **Partition key** : `customer_id` (ou `order_id` si l'ordre est intra-commande uniquement).
- **Pourquoi** : on veut traiter les événements d'une commande dans l'ordre. `order_id` est plus fin et garantit la distribution uniforme. `customer_id` plus pertinent si on veut sérialiser tous les événements d'un même client.
- **Rétention** : 72h, pour permettre au consumer ERP (le plus fragile) de rattraper après une panne.

### 6.4 — Trading — market data

**Contexte.** Cotations de 5 000 titres, ticks à la milliseconde. Reconstitution d'order book par titre.

- **Partition key** : `symbol` (e.g. `AAPL`, `MSFT`).
- **Pourquoi** : les ticks d'un même titre doivent être strictement ordonnés. 5 000 valeurs, distribution proche de uniforme — sauf sur les "stars" (loi de Pareto). Si AAPL représente 30 % du trafic à elle seule, suffixer (`AAPL-0`, …, `AAPL-9`).
- **Rétention** : 24h (les ticks sont consommés en quasi temps réel) ; pour l'historique long, archive S3 + Athena.

### 6.5 — Anti-pattern récurrent — la partition key à faible cardinalité

| Partition key tentante         | Pourquoi c'est mauvais                                          | Alternative               |
| ------------------------------ | --------------------------------------------------------------- | ------------------------- |
| `environment` (prod/staging)   | 2 valeurs → 2 shards utilisés maximum, le reste vide            | `request_id` ou `user_id` |
| `region` (eu/us/ap)            | 3 valeurs → hot shard si le trafic est régional                 | `user_id`                 |
| `event_type` (créé, payé, …)   | 5-10 valeurs, souvent biaisé (90 % de "créé")                   | `entity_id`               |
| Timestamp arrondi à la seconde | Tous les records d'une même seconde sur le même shard           | `entity_id` ou UUID       |
| `false` (constant)             | Tous les records sur le même shard. Vu en production. Vraiment. | `entity_id`               |

---

## 7. Outillage opérationnel — lire et instrumenter

### 7.1 — Lister les shards et leurs hash key ranges

```bash
aws kinesis describe-stream-summary --stream-name orders-stream \
  --query 'StreamDescriptionSummary.{Shards:OpenShardCount, Retention:RetentionPeriodHours, Mode:StreamModeDetails.StreamMode}'

aws kinesis list-shards --stream-name orders-stream \
  --query 'Shards[].{ShardId:ShardId, Start:HashKeyRange.StartingHashKey, End:HashKeyRange.EndingHashKey}'
```

### 7.2 — Calculer le hash MD5 d'une partition key

Pour prédire à quel shard une partition key va aboutir, on calcule son hash MD5 et on cherche le shard dont la plage le contient :

```python
import hashlib

def hash_of(partition_key: str) -> int:
    """MD5 d'une partition key, retourné comme entier 128 bits."""
    return int(hashlib.md5(partition_key.encode()).hexdigest(), 16)


def find_shard(partition_key: str, shards: list[dict]) -> str:
    """Renvoie l'id du shard qui recevra ce record."""
    h = hash_of(partition_key)
    for shard in shards:
        start = int(shard["HashKeyRange"]["StartingHashKey"])
        end = int(shard["HashKeyRange"]["EndingHashKey"])
        if start <= h <= end:
            return shard["ShardId"]
    raise ValueError("Aucun shard ne couvre ce hash — re-sharding en cours ?")


# Exemple
shards = client.list_shards(StreamName="orders-stream")["Shards"]
print(find_shard("customer-7", shards))
# → shardId-000000000001
```

C'est exactement ce que Kinesis fait côté serveur. On peut prédire **sans appel réseau** la destination de chaque record.

### 7.3 — Lire shard par shard et compter

```python
import boto3, time
from collections import Counter

client = boto3.client("kinesis", region_name="eu-west-1")
stream = "orders-stream"

shards = client.list_shards(StreamName=stream)["Shards"]
counts: Counter[str] = Counter()

for shard in shards:
    sid = shard["ShardId"]
    iterator = client.get_shard_iterator(
        StreamName=stream,
        ShardId=sid,
        ShardIteratorType="TRIM_HORIZON",
    )["ShardIterator"]

    while iterator:
        resp = client.get_records(ShardIterator=iterator, Limit=10_000)
        counts[sid] += len(resp["Records"])
        iterator = resp.get("NextShardIterator")
        if resp["MillisBehindLatest"] == 0 and not resp["Records"]:
            break
        time.sleep(0.2)  # courtoisie envers le rate limit (5 GetRecords/s/shard)

for sid, n in counts.items():
    print(f"{sid}: {n} records")
```

C'est le squelette de l'exercice 1. À garder sous le coude.

---

## 8. Exercices pratiques

### Exercice 1 — Tracer la distribution sur 2 shards (≈ 60 min)

**Objectif.** Visualiser concrètement comment la partition key détermine la répartition.

**Étapes :**

1. Créer un stream `dist-2-shards` à **2 shards** (mode `PROVISIONED`).
2. Récupérer les `HashKeyRange` des deux shards via `aws kinesis list-shards`.
3. Écrire un producer qui envoie **100 records** avec des partition keys variées :
   - Lot A : 50 records avec `partition_key = f"user-{i}"` pour i de 1 à 50.
   - Lot B : 30 records avec `partition_key = "region-EU"`.
   - Lot C : 20 records avec `partition_key = "region-US"`.
4. **Avant l'envoi**, prédire (script de la section 7.2) sur quel shard ira chaque record.
5. **Après l'envoi**, lire shard par shard (script de la section 7.3) et compter combien de records ont atterri où.
6. Comparer prédiction et observation. **Doivent être identiques** (sauf en cas de re-sharding).

**Livrable.** Un tableau :

| Shard               | Lot A | Lot B   | Lot C   | Total |
| ------------------- | ----- | ------- | ------- | ----- |
| `shardId-000...000` | ?     | 30 ou 0 | 20 ou 0 | ?     |
| `shardId-000...001` | ?     | 0 ou 30 | 0 ou 20 | ?     |

**Critère de réussite.** L'apprenant explique en deux phrases pourquoi `region-EU` et `region-US` se concentrent sur un ou deux shards (les deux valeurs hashent vers une zone précise de la plage), alors que `user-1` à `user-50` se répartissent à peu près 50/50.

**Astuce.** Si on observe que les deux régions hashent vers le **même** shard, ajouter un suffixe — `region-EU-shard1`, `region-EU-shard2` — montre comment résoudre un hot shard à la main.

### Exercice 2 — Diagnostiquer un hot shard (≈ 45 min)

**Objectif.** Identifier, mesurer et corriger un hot shard.

**Étapes :**

1. Sur le stream `dist-2-shards`, envoyer pendant 5 minutes des records à raison de 50 par seconde avec `partition_key = "tenant-A"` (constant), 10 par seconde avec `partition_key = "tenant-B"`.
2. Ouvrir CloudWatch et observer les métriques `IncomingRecords` et `WriteProvisionedThroughputExceeded` **par shard**.
3. Identifier le shard chaud.
4. Proposer **deux** corrections :
   - **Option 1** — Conserver la partition key, faire un **split shard** (re-sharding, vu en N3).
   - **Option 2** — Modifier la partition key côté producteur en suffixant : `tenant-A-0` à `tenant-A-9`, ce qui distribue tenant-A sur ~10 cellules de hash distinctes.
5. Discuter le compromis : option 2 perd l'ordre intra-tenant mais ne nécessite aucune action côté Kinesis.

**Livrable.** Un court mémo (½ page) : observation + diagnostic + correction recommandée + justification du compromis.

### Exercice 3 — Configurer et mesurer l'effet de la rétention (≈ 30 min)

**Objectif.** Comprendre la fenêtre de rejeu.

**Étapes :**

1. Sur le stream `dist-2-shards`, augmenter la rétention à 48 heures via `increase-stream-retention-period`.
2. Vérifier via `describe-stream-summary` que `RetentionPeriodHours` est à 48.
3. Envoyer un record marqué `MARKER-T0`.
4. Attendre 5 minutes, envoyer `MARKER-T1`.
5. Lire le stream depuis `TRIM_HORIZON` (début) — observer qu'on lit `MARKER-T0` puis `MARKER-T1`.
6. Diminuer la rétention à 24h. Vérifier que les deux marqueurs sont **encore** lisibles (ils ont moins de 24h, donc dans la nouvelle fenêtre).
7. Optionnel : pour observer une expiration réelle, garder un stream de test pendant 48h, on verra l'effet en pratique.

**Livrable.** Capture des commandes et de leurs sorties, plus une phrase expliquant pourquoi diminuer la rétention de 48h à 24h ne supprime pas immédiatement les records de moins de 24h.

### Exercice 4 — Vérifier l'ordre par shard (≈ 30 min)

**Objectif.** Constater empiriquement la garantie d'ordre par shard.

**Étapes :**

1. Sur le stream `dist-2-shards`, envoyer 100 records consécutifs avec **la même** `partition_key = "ordered-test"` et un payload contenant un index croissant : `{"i": 0}`, `{"i": 1}`, …, `{"i": 99}`.
2. Vérifier (script de la section 7.2) qu'ils sont tous allés sur le même shard.
3. Lire ce shard du début à la fin.
4. Vérifier que les `i` sont strictement croissants : 0, 1, 2, …, 99.
5. Envoyer maintenant 100 records avec une `partition_key` **différente à chaque fois** (`f"key-{i}"`).
6. Lire les deux shards en parallèle et concaténer les sorties dans l'ordre temporel d'arrivée. Vérifier que les `i` ne sont **pas** monotones globalement.

**Livrable.** Deux journaux : un ordonné, un désordonné. Conclusion en deux phrases.

### Mini-défi de synthèse — concevoir le partitionnement d'un cas réel (≈ 30 min)

On donne le cas suivant :

> Plateforme SaaS multi-tenant de logs applicatifs. 500 tenants. 95 % du volume vient des 10 plus gros tenants (loi de Pareto). On veut :
>
> - Pouvoir rejouer les logs d'un tenant donné dans l'ordre.
> - Faire de la détection d'anomalie temps réel par application au sein d'un tenant.
> - Maintenir un débit de 10 000 records/seconde au total.
> - Une rétention de 7 jours pour permettre du replay en cas d'incident.

Répondre par écrit :

1. Quelle partition key proposer ? Justifier.
2. Combien de shards approximativement ? Justifier.
3. Comment gérer les 10 gros tenants ?
4. Quelle rétention configurer ?

Pas de "bonne réponse unique" — l'objectif est de structurer le raisonnement (partition key naturelle → diagnostic Pareto → fan-out artificiel ou split shard ciblé → coût/bénéfice de la rétention).

---

## 9. Mini-projet final du parcours Kinesis — pipeline producer/consumer (≈ 1 à 2 jours)

Ce mini-projet **valide les trois modules** du parcours (M1, M2, M3) et atteint l'objectif **N2 Confirmé** sur AWS Kinesis.

### 9.1 — Choix du cas d'usage

Choisir **un** des trois scénarios suivants (ou en proposer un équivalent — à valider avec le glossaire avant de démarrer) :

- **Scénario A — Clickstream** : ingestion d'événements de navigation web (clic, vue page, ajout panier) d'une application e-commerce. Volume cible : 100 events/s. Cas de rejeu : recalculer un funnel d'achat sur les 24 dernières heures après un bug analytics.
- **Scénario B — IoT capteurs** : ingestion de mesures de température et d'humidité d'un parc de 200 capteurs, 1 mesure/seconde par capteur. Volume cible : 200 events/s. Cas de rejeu : détection d'une dérive sur un capteur défaillant.
- **Scénario C — Order events** : ingestion d'événements de cycle de vie de commandes (créée, payée, expédiée, livrée) d'une boutique. Volume cible : 50 events/s. Cas de rejeu : reconstruction d'un état de commande après crash du service ERP consommateur.

### 9.2 — Livrable attendu

Un **dépôt Git** contenant le code et un **document technique** (4 à 6 pages) structuré comme suit.

#### Section 1 — Spécification du cas d'usage (½ page)

- Domaine métier, volumétrie, SLA de latence visé, contraintes de coût.
- Identifier explicitement : producteurs, consommateurs, fréquence, taille moyenne d'un record.

#### Section 2 — Choix de partition key (½ page, à justifier)

- La partition key choisie et sa cardinalité estimée.
- Distribution attendue (uniforme / Pareto / autre).
- Risque de hot shard et mesure d'atténuation prévue.
- Lien avec les besoins d'ordre du métier.

#### Section 3 — Choix de rétention (¼ page)

- Durée retenue (en heures) et justification (cas de rejeu réaliste vu en 4.4).
- Coût mensuel estimé (calcul approximatif à partir du tarif AWS de la région choisie).

#### Section 4 — Producteur (code + ½ page d'explication)

- Script Python (`producer.py`) qui simule le flux du cas d'usage.
- Utilise `put_records` (par lot) pour respecter le débit.
- Gère les erreurs (`ProvisionedThroughputExceededException` → backoff exponentiel ou bascule sur un autre shard).
- Logue chaque envoi avec : partition key, shard cible **prédit** (calcul MD5), payload size.

#### Section 5 — Consommateur (code + ½ page d'explication)

- Script Python (`consumer.py`) qui consomme **tous les shards** du stream en parallèle (thread par shard, ou asyncio).
- Implémente un **checkpoint** simple (fichier JSON contenant le dernier `SequenceNumber` lu par shard).
- Applique une transformation triviale (par exemple : compter les events par minute par partition key).

#### Section 6 — Démonstration de la distribution (½ page + graphique)

- Lancer le producer pendant 5 à 10 minutes.
- Lire les shards et produire un tableau **records par shard** et un **graphique en barres** (matplotlib ou même un simple `print` avec des `█`).
- Commenter : la distribution est-elle uniforme ? Si non, pourquoi ? Quelle correction proposer ?

#### Section 7 — Configuration et coût (½ page)

- Commandes utilisées pour créer le stream et configurer la rétention.
- Estimation du coût mensuel : shards (24/7) + rétention étendue si > 24h + PUT payload + GET. Donner le détail.
- Comparer avec ce qu'aurait coûté la même solution en **SQS** (rappel des limites de SQS pour ce cas — défense de Kinesis en 3 lignes).

#### Section 8 — Limites et évolutions (¼ page)

- Trois limites identifiées du pipeline tel qu'écrit.
- Pour chacune, une piste d'évolution.

### 9.3 — Critères de validation

Le mini-projet est validé si :

- Le pipeline tourne **end-to-end** (producer → Kinesis → consumer) pendant au moins 5 minutes sans erreur.
- La distribution réelle est mesurée et **commentée**.
- La rétention configurée est **cohérente** avec le cas d'usage présenté.
- La partition key est **justifiée** sur les cinq critères de la section 3.5.
- Le coût mensuel est **chiffré** (même approximativement).

### 9.4 — Modes d'usage

Trois manières d'exploiter ce livrable :

1. **Carte de visite technique.** Pousser le dépôt sur GitHub avec le document en PDF dans le README. Référence concrète à montrer en entretien.
2. **Mémoire active.** Y revenir 6 mois plus tard pour ajouter Firehose en consommateur (archive vers S3) et Athena pour requêter — pivot vers le parcours AWS Analytics.
3. **Source de comparaison.** Refaire le même cas d'usage en SQS standard puis en MSK pour mesurer les écarts opérationnels concrets.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on est capable de **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Expliquer pourquoi l'ordre dans Kinesis est garanti **par shard** mais pas globalement.
- [ ] Définir ce qu'est un **sequence number** et trois propriétés qu'il vérifie (monotonie, non-arithmétique, non-comparabilité inter-shards).
- [ ] Décrire en une phrase l'**algorithme de répartition** des records (`MD5(partition_key)` → hash key range → shard).
- [ ] Définir un **hash key range** et le retrouver via `aws kinesis list-shards`.
- [ ] Définir un **hot shard**, citer trois symptômes et deux corrections.
- [ ] Lister les **cinq questions** à se poser pour choisir une partition key.
- [ ] Donner la **plage de configuration** de la rétention (24h à 365 jours) et trois cas d'usage avec leur rétention typique.
- [ ] Expliquer pourquoi Kinesis n'est **pas** un système d'archivage long terme (et ce qui doit le remplacer).
- [ ] Tracer la **distribution sur 2 shards** d'un flux donné, en CLI et en Python, et la commenter.
- [ ] Construire un **pipeline producer/consumer** end-to-end avec partition key et rétention adaptées.

### Items du glossaire visés

**N1 atteint** :

- _intérêt de Kinesis_ — consolidé avec M1.
- _différence entre AWS Kinesis et AWS SQS_ — consolidé avec M2.
- _shard_, _partition key_, _records_ — consolidé avec M1 et M3.

**N2 atteint** :

- _intérêt de Kinesis vis-à-vis d'un autre message broker_ — consolidé avec M2.
- _ordonnancement et répartition des messages dans un stream_ — ce module, sections 2 et 3.
- _configuration de la rétention de données de Kinesis_ — ce module, section 4.

À l'issue du mini-projet, l'apprenant atteint le niveau **Confirmé 2** ciblé par le parcours Kinesis.

**Pour aller plus loin (N3, non couvert par le parcours)** :

- _différence Enhanced Fan-out vs standard_ — modèles de consommation push/pull, latence, débit par consumer.
- _re-sharding_ — split shard, merge shards, gestion de l'ordre pendant la transition.

Ces deux sujets sont à explorer **après** validation du mini-projet, et constituent la frontière naturelle vers le niveau Senior (hors scope du parcours actuel).

---

## 11. Ressources complémentaires

### Documentation AWS

- [Kinesis Data Streams — Developer Guide](https://docs.aws.amazon.com/streams/latest/dev/introduction.html)
- [Kinesis Data Streams — Resharding](https://docs.aws.amazon.com/streams/latest/dev/kinesis-using-sdk-java-resharding.html)
- [Kinesis Data Streams — Retention period](https://docs.aws.amazon.com/streams/latest/dev/kinesis-extended-retention.html)
- [Kinesis Data Streams — Quotas et limites](https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html)

### Bonnes pratiques de partitionnement

- [AWS Big Data Blog — Choosing partition keys for Kinesis Data Streams](https://aws.amazon.com/blogs/big-data/under-the-hood-scaling-your-kinesis-data-streams/)
- [AWS re:Invent — Best practices for Amazon Kinesis Data Streams](https://www.youtube.com/results?search_query=reinvent+kinesis+best+practices) — sessions ANT308, ANT316.

### Outillage Python

- [boto3 — Kinesis client](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/kinesis.html)
- [aws-kinesis-agg](https://pypi.org/project/aws-kinesis-agg/) — agrégation côté producteur pour optimiser les PUT et contourner la limite de 1 MB/s par shard.

### Pour ouvrir vers les niveaux supérieurs

- **Enhanced Fan-out (N3)** — [AWS — Developing Enhanced Fan-Out Consumers](https://docs.aws.amazon.com/streams/latest/dev/enhanced-consumers.html) : push HTTP/2 vers chaque consumer, latence moyenne 70 ms vs 200+ ms en mode pull, débit dédié de 2 MB/s par consumer et par shard (vs 2 MB/s partagés en mode standard).
- **Re-sharding (N3)** — split / merge à chaud, gestion de la transition côté consumer (les child shards apparaissent en `ShardIteratorType=TRIM_HORIZON` une fois le parent fermé).

### Synthèse du parcours Kinesis

Le parcours Kinesis se referme ici. À ce stade :

- **M1** a posé le vocabulaire et la première mise en main (créer un stream, envoyer des records).
- **M2** a positionné Kinesis dans le paysage des messageries (queue / pub-sub / stream / event bus) et donné une matrice de choix.
- **M3** (ce module) a ouvert le capot : ordonnancement, répartition, rétention, et un pipeline complet via le mini-projet.

L'apprenant est désormais **Confirmé N2** sur AWS Kinesis. La prochaine étape naturelle est de combiner Kinesis avec **AWS Analytics** (Firehose → S3 → Athena) pour bâtir des pipelines analytics complets — sujet traité dans le parcours AWS Analytics.
