# M4 — DynamoDB — Bases

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **DynamoDB** : base NoSQL clé-valeur / document **serverless**, fully-managed, scalable, latence single-digit milliseconde.
- Distinguer **table**, **item**, **attribute** (le vocabulaire DynamoDB).
- Définir une **Partition Key** (item N1 explicite) : la clé qui détermine **sur quelle partition** un item est stocké, calculée par hash.
- Définir une **Sort Key** (range key, item N1 explicite) : clé secondaire qui permet de **trier** et **filtrer par plage** au sein d'une même partition.
- Distinguer **Simple Primary Key** (partition key seule) et **Composite Primary Key** (partition + sort).
- Distinguer **Query** et **Scan** (item N1 explicite) : Query lit **une partition** par clé, Scan parcourt **toute la table**.
- Comprendre les **deux capacity modes** : Provisioned (RCU/WCU) et On-Demand (pay-per-request).
- **Modéliser et requêter une table simple** : créer la table, insérer / lire / mettre à jour / supprimer, lancer une Query.

## Durée estimée

1 jour.

## Pré-requis

- M1 (tour d'horizon).
- AWS CLI v2 avec permissions `dynamodb:*`.
- Bases Python (boto3) pour les exercices SDK.
- Aucun pré-requis SGBD préalable nécessaire — DynamoDB est différent du SQL.

---

## 1. Pourquoi DynamoDB

### 1.1 — Le problème

Certaines applications ont des besoins qui **explosent les SGBD relationnels** :

- **Volumétrie** : milliards d'items, plusieurs TB.
- **Latence** : < 10 ms exigée à 99,9 percentile.
- **Concurrence** : 100 000+ requêtes/seconde.
- **Scaling élastique** : trafic qui passe de 100 à 100 000 req/s en quelques minutes.
- **Disponibilité** : 99,999 % attendu.

Mettre cela sur PostgreSQL impose un **cluster lourd à opérer** (sharding manuel, replication custom). Mettre cela sur DynamoDB → **service managé** qui gère scale et durabilité automatiquement.

### 1.2 — DynamoDB en une phrase

> **Amazon DynamoDB** est une base **NoSQL serverless**, **key-value et document**, **fully-managed**, qui scale **horizontalement** sans limite et offre une **latence single-digit milliseconde** à n'importe quelle échelle.

Cinq propriétés à graver :

1. **Serverless** : pas d'instance à provisionner, pas de cluster à patcher.
2. **Multi-AZ** par défaut (réplication synchrone sur 3 AZ).
3. **Scaling élastique** automatique (On-Demand) ou contrôlé (Provisioned).
4. **Latence single-digit ms** (1-9 ms) à n'importe quel volume.
5. **Pricing pay-per-request** ou capacity-units.

### 1.3 — DynamoDB vs RDS / Aurora

| Aspect                | **RDS / Aurora**               | **DynamoDB**                                |
| --------------------- | ------------------------------ | ------------------------------------------- |
| Modèle                | Relationnel (SQL)              | Key-Value / Document (NoSQL)                |
| Schéma                | Strict, défini à l'avance      | **Flexible** (par item)                     |
| Joins                 | Oui                            | **Non** (à modéliser autrement)             |
| Transactions ACID     | Oui                            | Oui (mais limitées)                         |
| Scale horizontal      | Read replicas, sharding manuel | **Natif et automatique**                    |
| Latence               | ~10 ms                         | **1-10 ms**                                 |
| Coût à petite échelle | $$ (instances minimales)       | **$** (pay-per-request)                     |
| Coût à grande échelle | $$$$ (clusters)                | $$ (scale linéaire)                         |
| Cas d'usage           | OLTP transactionnel complexe   | KV haute scale, sessions, leaderboards, IoT |

### 1.4 — Cas d'usage typiques

| Cas                                               | DynamoDB ?                       |
| ------------------------------------------------- | -------------------------------- |
| Session store (login, cart)                       | **Excellent**.                   |
| Leaderboards (gaming)                             | **Excellent**.                   |
| Catalogue de produits e-commerce (lookups par ID) | **Excellent**.                   |
| IoT (millions de devices, time-series simples)    | **Excellent**.                   |
| Tracking de livraisons / commandes (event log)    | **Excellent**.                   |
| App SaaS avec besoin de jointures complexes       | **Mauvais** → Postgres.          |
| Analytics ad hoc avec aggregations dynamiques     | **Mauvais** → Redshift / Athena. |
| Reporting BI                                      | **Mauvais** → Redshift / Athena. |

### 1.5 — L'analogie du gardien de coffres

Imaginer un immense **dépôt de coffres-forts numérotés** :

- Vous donnez un **numéro de coffre** (partition key) au gardien.
- Le gardien va **directement** au bon coffre.
- Dans chaque coffre, il y a plusieurs **tiroirs triés** (sort key).
- Vous pouvez demander **un tiroir précis** ou **une plage de tiroirs**.

Le gardien sait toujours **où aller en une étape** parce qu'il **hashe** le numéro. Pas d'inventaire à parcourir.

C'est exactement la mécanique de DynamoDB.

---

## 2. Modèle de données

### 2.1 — Table, Item, Attribute

| Niveau        | Définition                                                     |
| ------------- | -------------------------------------------------------------- |
| **Table**     | Conteneur d'items (équivalent d'une table SQL).                |
| **Item**      | Une "ligne" (équivalent d'une row). Stocke des **attributes**. |
| **Attribute** | Paire (nom, valeur). Une "colonne" mais **flexible** par item. |

### 2.2 — Exemple

```json
// Table : "Users"
[
  {
    // Item 1
    "user_id": "alice",
    "email": "alice@example.com",
    "age": 30,
    "preferences": { "theme": "dark", "notifications": true }
  },
  {
    // Item 2 (autre schéma !)
    "user_id": "bob",
    "email": "bob@example.com",
    "phone": "+33612345678",
    "addresses": [
      { "type": "home", "city": "Paris" },
      { "type": "work", "city": "Lyon" }
    ]
  }
]
```

À noter :

- **Pas de schéma strict** : alice a `age` et `preferences`, bob a `phone` et `addresses`.
- **Attributes nested** : maps (`{"theme": ...}`) et lists (`[...]`) supportés.
- **Tous les items doivent avoir** la **Primary Key** (vu en section 3).

### 2.3 — Types d'attributs

| Type           | Notation | Exemple                     |
| -------------- | -------- | --------------------------- |
| **String**     | S        | `"alice"`                   |
| **Number**     | N        | `42`, `3.14`                |
| **Binary**     | B        | base64                      |
| **Boolean**    | BOOL     | `true`                      |
| **Null**       | NULL     | `null`                      |
| **Map**        | M        | `{"key": "value"}`          |
| **List**       | L        | `[1, "a", true]`            |
| **String Set** | SS       | `["red", "blue"]` (uniques) |
| **Number Set** | NS       | `[1, 2, 3]`                 |
| **Binary Set** | BS       | binary uniques              |

DynamoDB est **flexible** : un même attribute peut avoir des types différents entre items (mais déconseillé).

### 2.4 — Limites

- **Taille d'un item** : **400 KB max** (toutes les attributes inclus). Vu en M5.
- **Nombre d'attributes** : pas de limite hard.
- **Nombre d'items** : illimité.

---

## 3. Partition Key (item N1 explicite)

### 3.1 — Définition

La **Partition Key** (PK) est l'**attribute** qui détermine **sur quelle partition physique** un item est stocké.

DynamoDB :

1. Prend la valeur de la PK.
2. La **hashe** (SHA-256 modulo nombre de partitions).
3. Stocke l'item sur la partition correspondante.

```text
Item : {user_id: "alice", ...}
              │
              ▼ hash
         Partition #42 ──┐
                         │
                         ▼
        ┌────────────────────────────┐
        │ Storage replica 1 (AZ-a)   │
        │ Storage replica 2 (AZ-b)   │
        │ Storage replica 3 (AZ-c)   │
        └────────────────────────────┘
```

### 3.2 — Pourquoi c'est central

- **Performance** : DynamoDB sait **directement** quelle partition lire/écrire → O(1) lookup.
- **Scaling** : on peut avoir N partitions en parallèle, scale linéaire.
- **Distribution** : si la PK est bien choisie, la charge est répartie uniformément.

### 3.3 — Choisir une bonne Partition Key

Trois critères :

| Critère                                        | Bon                                           | Mauvais                                              |
| ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| **Cardinalité** (nombre de valeurs distinctes) | Élevée (`user_id`, `device_id`, `session_id`) | Faible (`region` = 3 valeurs, `is_active` = booléen) |
| **Distribution**                               | Uniforme (UUID, IDs, hashed)                  | Biaisée (Pareto : 80 % du trafic sur 10 % des keys)  |
| **Pattern d'accès**                            | On accède par cette clé                       | On scan tout le temps                                |

**Anti-pattern** : utiliser un attribute à faible cardinalité comme PK → **hot partition** (toute la charge sur 1 partition).

### 3.4 — Hot Partition

Quand une PK reçoit **disproportionnellement** de trafic :

```text
PK : "region" (3 valeurs)
  - "EU"  → 80 % du trafic
  - "US"  → 15 %
  - "ASIA" → 5 %

Conséquence : la partition "EU" sature, throttling sur cette PK.
```

**Symptômes** :

- `ProvisionedThroughputExceeded` (mode Provisioned).
- Augmentation de la latence sur certaines requêtes.
- CloudWatch metric `ThrottledRequests`.

**Solutions** :

- Choisir une PK à plus haute cardinalité (`user_id` au lieu de `region`).
- Ajouter un suffixe aléatoire (`user_id-1`, `user_id-2`, …) pour distribuer.
- Caching côté app pour les hot keys.

### 3.5 — Exemples

| Cas                           | Bonne PK                            | Mauvaise PK                             |
| ----------------------------- | ----------------------------------- | --------------------------------------- |
| Catalogue de 10M produits     | `product_id` (UUID)                 | `category` (10 valeurs)                 |
| Sessions utilisateur          | `session_id`                        | `user_type` (2-3 valeurs)               |
| IoT — mesures de 100k devices | `device_id`                         | `device_model`                          |
| Multi-tenant SaaS             | `tenant_id` + `entity_id` composite | `tenant_id` seul (skew si gros tenants) |

---

## 4. Sort Key (Range Key) (item N1 explicite)

### 4.1 — Définition

La **Sort Key** (SK, parfois appelée **Range Key**) est un attribute **secondaire** dans la primary key qui :

- **Ordonne** les items au sein d'une même partition.
- Permet des **requêtes par plage** (`BETWEEN`, `<`, `>`, `BEGINS_WITH`).
- Combinée avec la PK → **identifiant unique** d'un item.

### 4.2 — Composite Primary Key

Une primary key peut être :

- **Simple** : Partition Key seule. Items uniques par PK.
- **Composite** : Partition Key + Sort Key. Items uniques par couple (PK, SK).

```text
Table avec PK=user_id, SK=order_date
  ┌────────────────────────────────────────────────┐
  │ Partition "alice"                              │
  │  ├── order_date=2026-01-15  → item            │
  │  ├── order_date=2026-02-20  → item            │
  │  └── order_date=2026-05-17  → item            │
  └────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────┐
  │ Partition "bob"                                │
  │  ├── order_date=2026-03-10  → item            │
  │  └── order_date=2026-05-01  → item            │
  └────────────────────────────────────────────────┘
```

→ On peut récupérer **toutes les commandes d'alice entre janvier et mars** en une requête (Query avec `KeyConditionExpression`).

### 4.3 — Cas d'usage typique

| Modèle (PK / SK)          | Cas d'usage                              |
| ------------------------- | ---------------------------------------- |
| `user_id` / `order_date`  | "Commandes d'un user triées par date."   |
| `device_id` / `timestamp` | IoT — mesures d'un device dans le temps. |
| `session_id` / `event_id` | Events d'une session.                    |
| `tenant_id` / `entity_id` | Multi-tenant — items d'un tenant.        |
| `chat_id` / `message_id`  | Messages d'un chat.                      |

### 4.4 — Opérateurs de requête sur la Sort Key

| Opérateur            | Exemple                                            |
| -------------------- | -------------------------------------------------- |
| `=`                  | `order_date = '2026-05-17'`                        |
| `<`, `<=`, `>`, `>=` | `order_date >= '2026-01-01'`                       |
| `BETWEEN`            | `order_date BETWEEN '2026-01-01' AND '2026-05-31'` |
| `BEGINS_WITH`        | `entity_id BEGINS_WITH 'order#'`                   |

**Important** : on **doit** spécifier la **PK exacte** (=), **puis** filtrer la SK avec ces opérateurs.

### 4.5 — Sort Keys composites (overloading)

Pattern avancé : utiliser une SK qui **encode plusieurs informations** :

```text
PK=tenant_id, SK=
  "user#alice"        → un user
  "user#bob"          → un user
  "order#O-42"        → un order
  "order#O-43"        → un order
```

Requête : `Query(PK=tenant_id, SK BEGINS_WITH 'user#')` → tous les users du tenant.

C'est l'**overloading** des SK, technique courante dans les "single-table designs" DynamoDB (niveau 3-4).

---

## 5. Query vs Scan (item N1 explicite)

C'est l'**item N1 majeur** : connaître la différence.

### 5.1 — Query

**Query** = lecture **ciblée** sur **une partition** (PK exacte) avec optionnellement un filtre sur la SK.

| Aspect             | Détail                                                |
| ------------------ | ----------------------------------------------------- |
| **PK requise**     | **Oui** (exacte, `=`).                                |
| **SK optionnelle** | Avec opérateurs (`=`, `<`, `BETWEEN`, `BEGINS_WITH`). |
| **Performance**    | **O(log N)** sur la partition ciblée. Très rapide.    |
| **Coût**           | Lit uniquement les items matchant. Moindre coût RCU.  |
| **Cas d'usage**    | "Donner les commandes d'alice en 2026."               |

```python
# boto3 — Query
resp = ddb.query(
    TableName='Orders',
    KeyConditionExpression='user_id = :uid AND order_date BETWEEN :s AND :e',
    ExpressionAttributeValues={
        ':uid': {'S': 'alice'},
        ':s': {'S': '2026-01-01'},
        ':e': {'S': '2026-12-31'},
    },
)
```

### 5.2 — Scan

**Scan** = lecture de **toute la table** (ou tout un index), avec filtre optionnel **après** lecture.

| Aspect          | Détail                                                              |
| --------------- | ------------------------------------------------------------------- |
| **PK requise**  | Non.                                                                |
| **Filtre**      | Optionnel mais s'applique **après** le scan (paye le scan complet). |
| **Performance** | **O(N)** : lit **toute la table**. Très lent à grande échelle.      |
| **Coût**        | Lit **tous les items**. Très cher.                                  |
| **Cas d'usage** | Migration ponctuelle, debug, ETL ad hoc.                            |

```python
# boto3 — Scan
resp = ddb.scan(
    TableName='Orders',
    FilterExpression='order_date >= :s',
    ExpressionAttributeValues={':s': {'S': '2026-01-01'}},
)
```

### 5.3 — Tableau comparatif

| Critère              | **Query**                | **Scan**                  |
| -------------------- | ------------------------ | ------------------------- |
| Portée               | Une partition            | Toute la table            |
| PK obligatoire       | **Oui**                  | Non                       |
| Performance          | O(log N) — rapide        | O(N) — lent               |
| Coût (RCU consommés) | Faible (items matchants) | Élevé (table entière)     |
| Adapté pour          | Reads applicatifs OLTP   | Maintenance, ETL one-shot |

### 5.4 — La règle d'or

> **Tout pattern de lecture applicatif récurrent doit être Query, jamais Scan.**

Si on a besoin de Scan pour une feature → **mal modélisé**. Solutions :

- Ajouter un **index secondaire** (GSI / LSI, vu en M5).
- Restructurer les PK/SK.
- Précompiler la donnée (matérialiser une vue dans une autre table).

### 5.5 — Cas où Scan est acceptable

- **Migration ponctuelle** vers une autre table.
- **Export** vers S3 / Glue.
- **Backup custom** (déconseillé — préférer PITR natif).
- **Audit** ad hoc one-off.
- **Petites tables** (< 1000 items) où le scan reste rapide.

### 5.6 — Optimisations de Scan (quand inévitable)

- **`ParallelScan`** : N segments en parallèle.
- **`ProjectionExpression`** : ne lire que certains attributs (réduit le data transfer, mais pas les RCU).
- **`Limit`** + pagination via `LastEvaluatedKey`.

Voir AWS Glue Connector ou Step Functions Distributed Map pour des scans massifs structurés.

---

## 6. Capacity modes

### 6.1 — Provisioned

On **réserve** une capacité fixe :

- **RCU** (Read Capacity Unit) : 1 lecture éventuellement consistante de jusqu'à 4 KB / seconde. (Une lecture strongly consistent = 2 RCU. Une transaction = 2 RCU).
- **WCU** (Write Capacity Unit) : 1 écriture d'1 KB / seconde. (Transaction = 2 WCU).

**Avantages** :

- **Coût prévisible** à charge constante.
- Moins cher à charge **prévisible** que On-Demand.

**Inconvénients** :

- Si **sous-dimensionné** : throttling.
- Si **sur-dimensionné** : on paie pour rien.

**Auto-scaling** : peut être configuré pour ajuster RCU/WCU automatiquement entre min/max.

### 6.2 — On-Demand

Pay-per-request :

- ~0,25 $ par million de **read request units** (RRU).
- ~1,25 $ par million de **write request units** (WRU).

**Avantages** :

- **Pas de provisioning**.
- **Pas de throttling** (scale automatique).
- **Idéal** pour charges variables / imprévisibles.

**Inconvénients** :

- **5-7× plus cher** à charge constante que Provisioned bien dimensionné.

### 6.3 — Lequel choisir

| Profil                                  | Mode recommandé                |
| --------------------------------------- | ------------------------------ |
| Nouveau projet, charge inconnue         | **On-Demand**                  |
| Dev / staging                           | **On-Demand**                  |
| Production avec charge stable connue    | **Provisioned + auto-scaling** |
| Production avec pics imprévisibles      | **On-Demand**                  |
| Charge très haute (> 1k req/s constant) | **Provisioned**                |

On peut **basculer** entre les modes (1×/24h, modification at-rest).

---

## 7. Pratique — modéliser et requêter une table simple

L'item de glossaire pratique.

### 7.1 — Le cas — Orders d'un e-commerce

**Modèle** :

- PK : `user_id`
- SK : `order_id` (format `ORDER#YYYY-MM-DD#uuid`)
- Attributes : `total`, `status`, `items` (list).

### 7.2 — Étape 1 — Créer la table

```bash
aws dynamodb create-table \
  --table-name tp-orders \
  --attribute-definitions \
      AttributeName=user_id,AttributeType=S \
      AttributeName=order_id,AttributeType=S \
  --key-schema \
      AttributeName=user_id,KeyType=HASH \
      AttributeName=order_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Environment,Value=tp

# Attendre disponibilité
aws dynamodb wait table-exists --table-name tp-orders
```

### 7.3 — Étape 2 — Insérer des items

```bash
aws dynamodb put-item --table-name tp-orders --item '{
  "user_id": {"S": "alice"},
  "order_id": {"S": "ORDER#2026-05-15#abc"},
  "total": {"N": "19.99"},
  "status": {"S": "shipped"},
  "items": {"L": [{"S": "book-42"}, {"S": "pen-7"}]}
}'

aws dynamodb put-item --table-name tp-orders --item '{
  "user_id": {"S": "alice"},
  "order_id": {"S": "ORDER#2026-05-17#def"},
  "total": {"N": "9.50"},
  "status": {"S": "pending"}
}'

aws dynamodb put-item --table-name tp-orders --item '{
  "user_id": {"S": "bob"},
  "order_id": {"S": "ORDER#2026-05-16#ghi"},
  "total": {"N": "45.00"},
  "status": {"S": "shipped"}
}'
```

### 7.4 — Étape 3 — Lire un item précis (GetItem)

```bash
aws dynamodb get-item --table-name tp-orders --key '{
  "user_id": {"S": "alice"},
  "order_id": {"S": "ORDER#2026-05-15#abc"}
}'
```

### 7.5 — Étape 4 — Query

```bash
# Toutes les commandes d'alice
aws dynamodb query --table-name tp-orders \
  --key-condition-expression "user_id = :uid" \
  --expression-attribute-values '{":uid": {"S": "alice"}}'

# Commandes d'alice depuis le 16/05
aws dynamodb query --table-name tp-orders \
  --key-condition-expression "user_id = :uid AND order_id >= :s" \
  --expression-attribute-values '{
    ":uid": {"S": "alice"},
    ":s": {"S": "ORDER#2026-05-16"}
  }'
```

### 7.6 — Étape 5 — Scan (à comparer)

```bash
# Scanner toute la table — coût élevé !
aws dynamodb scan --table-name tp-orders

# Avec filtre (post-lecture)
aws dynamodb scan --table-name tp-orders \
  --filter-expression "#st = :st" \
  --expression-attribute-names '{"#st": "status"}' \
  --expression-attribute-values '{":st": {"S": "shipped"}}'
```

**Observer** : le scan consomme **toutes les RCU** pour la table (3 items ici, mais imaginer pour 10M items).

### 7.7 — Étape 6 — Update

```bash
aws dynamodb update-item --table-name tp-orders \
  --key '{"user_id": {"S": "alice"}, "order_id": {"S": "ORDER#2026-05-17#def"}}' \
  --update-expression "SET #st = :s" \
  --expression-attribute-names '{"#st": "status"}' \
  --expression-attribute-values '{":s": {"S": "shipped"}}'
```

### 7.8 — Étape 7 — Delete

```bash
aws dynamodb delete-item --table-name tp-orders \
  --key '{"user_id": {"S": "bob"}, "order_id": {"S": "ORDER#2026-05-16#ghi"}}'
```

### 7.9 — Cleanup

```bash
aws dynamodb delete-table --table-name tp-orders
```

### 7.10 — Variante Python boto3

```python
import boto3

ddb = boto3.resource('dynamodb', region_name='eu-west-1')
table = ddb.Table('tp-orders')

# Put
table.put_item(Item={
    'user_id': 'alice',
    'order_id': 'ORDER#2026-05-15#abc',
    'total': 19.99,
    'status': 'shipped'
})

# Get
resp = table.get_item(Key={'user_id': 'alice', 'order_id': 'ORDER#2026-05-15#abc'})
print(resp['Item'])

# Query
from boto3.dynamodb.conditions import Key
resp = table.query(
    KeyConditionExpression=Key('user_id').eq('alice') & Key('order_id').begins_with('ORDER#2026-05-')
)
for item in resp['Items']:
    print(item)
```

---

## 8. Anti-patterns

| Anti-pattern                                                               | Conséquence                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Partition Key à faible cardinalité** (`region`, `status`).               | Hot partition, throttling, scaling impossible.       |
| **Scan en pattern régulier** côté app.                                     | Coût × 1000, latence × 100. Refactoriser.            |
| **Pas de Sort Key** quand on a besoin de range queries.                    | Forcé à Scan + filter.                               |
| **Items trop gros** (> 100 KB) avec attributs inutilisés.                  | Coût RCU élevé.                                      |
| **Joins simulés** au niveau app (N+1 queries DynamoDB).                    | Latence applicative énorme.                          |
| **Pas d'index secondaire** (GSI/LSI) pour les access patterns secondaires. | Scan ou requêtes multi-tables forcées. (M5)          |
| **Mode Provisioned sans auto-scaling** ni surveillance.                    | Throttling sur peak, sur-coût sur creux.             |
| **Migration relationnelle telle quelle** (1 table SQL = 1 table DynamoDB). | Anti-pattern : DynamoDB demande un design différent. |
| **Backup non activé** (PITR).                                              | Erreur humaine = perte définitive.                   |
| **Pas de cache** ElastiCache / DAX sur les hot keys.                       | Coût élevé pour des données stables.                 |

---

## 9. Exercices pratiques

### Exercice 1 — Modéliser et requêter (≈ 60 min)

**Objectif.** L'item central du glossaire.

**Étapes :** suivre la section 7 — créer la table `tp-orders`, insérer 5-10 items, query, scan, update, delete.

**Livrable.** Captures des opérations + un mini-rapport sur la différence Query vs Scan.

### Exercice 2 — Identifier les bonnes/mauvaises PK (≈ 30 min)

Pour ces 6 cas, quelle PK proposeriez-vous ?

1. App de réservation de billets pour 5 concerts/an.
2. IoT — 100 000 capteurs envoient une mesure chaque minute.
3. Chat — 1M conversations actives.
4. Catalogue produits e-commerce — 100 000 produits.
5. Logs applicatifs — 10M lignes/jour.
6. SaaS multi-tenant — 1000 tenants, ~500 entités par tenant.

**Livrable.** Tableau avec PK proposée + justification (cardinalité, distribution).

### Exercice 3 — Tester un hot partition (≈ 45 min, optionnel)

**Objectif.** Voir l'effet en pratique.

**Étapes :**

1. Créer une table en mode **Provisioned** avec faible WCU (5).
2. Insérer 1000 items **tous avec la même PK** : provoque une saturation de partition.
3. Observer la métrique `ThrottledRequests`.
4. Refaire avec des PK variées : pas de throttling.

**Livrable.** Captures CloudWatch.

### Exercice 4 — Migration Scan → Query (≈ 45 min)

**Cas.** Une feature legacy fait :

```python
table.scan(FilterExpression=Attr('user_id').eq('alice'))
```

→ Scan la table de 10M items pour récupérer ceux d'alice. Lent et cher.

**Refactoriser** pour utiliser Query (avec la bonne PK).

**Livrable.** Code avant/après + estimation du gain (latence, coût).

### Exercice 5 — Composite SK overloading (≈ 30 min, conception)

**Cas.** Single-table design pour un SaaS B2B.

**Tables à modéliser** :

- Tenants
- Users (par tenant)
- Projects (par tenant)
- Tasks (par project)

**Tout dans une seule table** avec PK=`tenant_id`, SK=overloaded :

- `user#<email>`
- `project#<project_id>`
- `task#<project_id>#<task_id>`

**Exercice :** écrire les Query DynamoDB pour :

1. Tous les users d'un tenant.
2. Tous les projets d'un tenant.
3. Toutes les tâches d'un projet.

**Livrable.** Schéma + 3 queries.

### Mini-défi — Comparer DynamoDB et RDS (≈ 30 min, papier)

**Cas.** Mobile app gaming :

- 500k utilisateurs.
- Sessions de jeu, scores, items débloqués.
- Leaderboards mondiaux.
- Latence < 100 ms exigée.
- Charge variable jour/nuit/weekend.

**Concevoir** :

1. Quelle base ? DynamoDB ou RDS ?
2. Modèle de données.
3. Capacity mode.
4. Estimation coût mensuel.

**Livrable.** Justification + design.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **DynamoDB** : NoSQL serverless, KV/document, scaling élastique.
- [ ] Définir **table / item / attribute**.
- [ ] Définir une **Partition Key**, son rôle dans le hashing / distribution.
- [ ] Choisir une **bonne** vs **mauvaise** Partition Key (3 critères).
- [ ] Définir une **Sort Key** et les **opérateurs** de requête possibles.
- [ ] Distinguer **Simple Primary Key** et **Composite Primary Key**.
- [ ] Définir le **hot partition** et donner 3 symptômes / 2 solutions.
- [ ] Distinguer **Query** et **Scan** sur 4 axes.
- [ ] Énoncer la règle "**Tout pattern app récurrent = Query, jamais Scan**".
- [ ] Distinguer **Provisioned** et **On-Demand** capacity modes.
- [ ] **Créer une table**, faire un **put/get/query** en CLI ou boto3 de mémoire.
- [ ] Citer **3 anti-patterns** DynamoDB.

### Items du glossaire visés

**N1 atteint** :

- _différence entre query et scan dans DynamoDB_ — section 5.
- _partition key et range key dans DynamoDB_ — sections 3 et 4.

---

## 11. Ressources complémentaires

### Documentation AWS

- [DynamoDB Developer Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)
- [Core Components](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html)
- [Query vs Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html)
- [Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Pricing](https://aws.amazon.com/dynamodb/pricing/)

### Pour aller plus loin

- **M5 (DynamoDB limites et index)** — la suite directe : GSI, LSI, contournement 400 KB.
- **Niveau 3** : PITR, DynamoDB Streams, CDC, encryption, DAX, Single-table design.
- **AWS NoSQL Workbench** — outil de design visuel.
- **The DynamoDB Book** (Alex DeBrie) — référence majeure sur le single-table design.
