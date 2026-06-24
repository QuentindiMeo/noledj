# M5 — DynamoDB — Limites et Index

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer les **principales limites** de DynamoDB : **400 KB par item**, 1 MB max par Query/Scan, 25 transactions par TransactWriteItems, GSI 20/table, LSI 5/table créés à la création de la table.
- Connaître la **taille maximale d'un enregistrement** (400 KB) et **les moyens de la contourner** (item N2 explicite) : externalisation S3 + pointer, compression, attribute pruning, splitting en plusieurs items.
- Définir un **index secondaire** dans DynamoDB et son rôle : permettre des access patterns alternatifs (autres que la primary key).
- Distinguer **GSI** (Global Secondary Index) et **LSI** (Local Secondary Index) (item N2 explicite) : portée, partition key, création (anytime vs at-table-creation), projection, capacity, consistance.
- **Ajouter un GSI** sur une table existante (item du glossaire pratique).
- Reconnaître les **patterns courants** (overloaded GSI, sparse index, hot GSI) et les **anti-patterns** (LSI sur trop grandes partitions, GSI sans projection optimisée, indexer tout par défaut).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M4 (DynamoDB bases : table, item, PK, SK, Query/Scan).
- AWS CLI v2 avec permissions `dynamodb:*`.
- Idéalement : avoir suivi le parcours **AWS Identity** pour les permissions IAM fines.

---

## 1. Les principales limites de DynamoDB

### 1.1 — Pourquoi les connaître

Toute base de données a ses limites, mais DynamoDB **explicite** les siennes :

- Si l'on dépasse → **erreur API claire** (`ValidationException`, `ItemSizeTooLarge`).
- Connaître les limites = pouvoir **architecturer dès le départ** pour les éviter.

À ce niveau N2, il y a **deux limites majeures** à maîtriser : la **taille d'un item** et les **types d'index**.

### 1.2 — Tableau des limites importantes

| Limite                                         | Valeur                                    |
| ---------------------------------------------- | ----------------------------------------- |
| **Taille d'un item**                           | **400 KB** (toutes les attributes inclus) |
| **Nom de table**                               | 255 chars                                 |
| **Nom d'attribut**                             | 255 bytes                                 |
| **Nombre d'attributs par item**                | Pas de hard limit                         |
| **Réponse Query/Scan**                         | 1 MB (paginer pour plus)                  |
| **Items par batch (BatchGetItem)**             | 100                                       |
| **Items par batch (BatchWriteItem)**           | 25                                        |
| **Items par transaction (TransactWriteItems)** | 100 (depuis 2022)                         |
| **Items par transaction (TransactGetItems)**   | 100                                       |
| **GSI par table**                              | 20                                        |
| **LSI par table**                              | 5                                         |
| **Tables par compte / région**                 | 2 500 (relevable)                         |
| **PK length**                                  | 2 048 bytes                               |
| **SK length**                                  | 1 024 bytes                               |

### 1.3 — Les conséquences pratiques

- **400 KB** : peu en absolu, mais suffisant pour ~95 % des cas key-value. Les **cas dépassants** sont à architecturer autrement (section 3).
- **1 MB par Query** : pour récupérer plus, paginer avec `LastEvaluatedKey`.
- **GSI 20/LSI 5** : suffisant pour 99 % des modèles. À noter : **LSI doivent être créés à la création de la table** (immutable). GSI peuvent être ajoutés/modifiés à chaud.

---

## 2. La limite 400 KB par item — détails

### 2.1 — Ce que 400 KB inclut

> La taille d'un item = **somme des longueurs (bytes)** de **tous les attribute names + values** + un peu d'overhead système.

Exemples :

| Attribute                                | Taille approximative             |
| ---------------------------------------- | -------------------------------- |
| `{"user_id": {"S": "alice"}}`            | ~13 bytes (nom + valeur + type)  |
| `{"avatar": {"B": "<1KB binaire>"}}`     | ~1 KB                            |
| `{"description": {"S": "<long texte>"}}` | longueur du texte en bytes UTF-8 |
| `{"items": {"L": [...]}}`                | somme des éléments imbriqués     |

→ Un item avec quelques attributes simples : ~100 bytes. Un item avec un long texte / liste / blob : peut dépasser 400 KB rapidement.

### 2.2 — Cas typiques qui dépassent 400 KB

| Cas                                                | Souci                                        |
| -------------------------------------------------- | -------------------------------------------- |
| Stocker l'**image complète** d'un avatar (binary). | Avatars ~50 KB max sinon 400 KB explosé.     |
| Stocker un **PDF / document** dans l'item.         | PDF > 400 KB ? Forcément.                    |
| Liste avec **milliers d'éléments** imbriqués.      | `items` avec 5000 sous-objets → 400 KB++.    |
| **Logs concaténés** dans un attribut "history".    | Croissance illimitée → tôt ou tard 400 KB.   |
| **JSON ML inference** (vecteurs embeddings).       | 1 vecteur 1536-dim = ~6 KB ; cumul → 400 KB. |
| **Audit trail** stocké dans l'item user.           | Croissance dans le temps.                    |

### 2.3 — Que se passe-t-il en cas de dépassement

```bash
aws dynamodb put-item --table-name ... --item '{... très gros ...}'
# Erreur :
# An error occurred (ValidationException) when calling the PutItem operation:
# Item size has exceeded the maximum allowed size
```

L'opération **échoue**. Aucun stockage partiel.

---

## 3. Contournements de la limite 400 KB (item N2 explicite)

C'est **l'item N2 majeur** : connaître les contournements.

### 3.1 — Stratégie 1 — Externaliser sur S3 + pointer

**La méthode la plus utilisée**.

```text
DynamoDB : {
  "user_id": "alice",
  "avatar_url": "s3://my-bucket/users/alice/avatar.jpg"
}

S3 : s3://my-bucket/users/alice/avatar.jpg  (binary 2 MB)
```

L'item DynamoDB stocke uniquement le **pointer S3**. Le binaire vit dans S3.

**Avantages** :

- **Pas de limite** sur la taille S3 (jusqu'à 5 TB par objet).
- **Coût** : S3 moins cher que DynamoDB au GB.
- **Versioning** : S3 supporte le versioning.
- **CDN** : S3 + CloudFront pour servir le binaire rapidement.

**Inconvénients** :

- **2 hops** : DynamoDB pour le pointer, puis S3 pour le contenu.
- **Consistency** : la création/mise à jour doit être **atomique** entre les deux (utiliser Step Functions ou pattern saga si critique).

**Pattern courant** : DynamoDB stocke métadonnées + pointer ; S3 stocke le contenu lourd. Vu en M6 (S3).

### 3.2 — Stratégie 2 — Compression

Si le contenu est **textuel** et **compressible** (logs, JSON, HTML, …), compresser avant stockage.

```python
import boto3, gzip, base64, json

def store_item(user_id, data_dict):
    raw_json = json.dumps(data_dict).encode()
    compressed = gzip.compress(raw_json)
    encoded = base64.b64encode(compressed).decode()  # DynamoDB Binary

    table.put_item(Item={
        'user_id': user_id,
        'data_gz': encoded
    })

def load_item(user_id):
    resp = table.get_item(Key={'user_id': user_id})
    encoded = resp['Item']['data_gz']
    compressed = base64.b64decode(encoded)
    raw_json = gzip.decompress(compressed)
    return json.loads(raw_json)
```

**Ratio typique** : gzip compresse le JSON de **3-5×**. Donc un item de 1.5 MB texte peut passer sous 400 KB.

**Inconvénient** : DynamoDB ne peut plus indexer / filter sur le contenu compressé (c'est un blob).

### 3.3 — Stratégie 3 — Attribute pruning

Stocker **uniquement ce qui est nécessaire** dans DynamoDB.

```text
Avant (1 MB) : {
  user_id, email, name, address, ..., profile_photo (binary 800 KB),
  preferences (list 100 KB), audit_logs (list 100 KB)
}

Après pruning (50 KB) : {
  user_id, email, name, address, preferences (last 10 only),
  audit_url: "s3://...",
  photo_url: "s3://..."
}
```

**Question** : pour chaque attribute, **a-t-on vraiment besoin** qu'il soit dans DynamoDB ?

Si non → vers S3, ou vers une autre table, ou supprimé.

### 3.4 — Stratégie 4 — Splitting en plusieurs items

Si la donnée a une **structure naturelle**, la séparer en items.

```text
Avant (1 item, 500 KB) :
  user_id=alice, orders=[{...}, {...}, ..., {...}]  (1000 orders embedded)

Après (1 user + 1000 order items) :
  user_id=alice  (50 bytes profil)
  user_id=alice, sk=order#001  (item séparé par order)
  user_id=alice, sk=order#002
  ...
```

**Avantages** :

- Pas de limite globale.
- **Requêtable** : Query sur PK=alice retourne toutes les commandes.
- Pagination naturelle.

**Inconvénients** :

- Plus d'items → plus de coût RCU si lecture massive.
- Modélisation plus complexe.

C'est souvent **le pattern naturel** une fois qu'on pense DynamoDB en single-table design.

### 3.5 — Stratégie 5 — Stockage tiered (DynamoDB + S3)

Pattern avancé pour le **time-series** :

- Items récents (hot) → DynamoDB.
- Items anciens (cold) → S3 + Athena (vu en parcours Analytics).
- Lambda périodique pour migrer.

### 3.6 — Tableau de décision

| Cas                                       | Stratégie recommandée                     |
| ----------------------------------------- | ----------------------------------------- |
| Avatars, photos, fichiers binaires        | **S3 + pointer**.                         |
| Logs / audit trail volumineux             | **Splitting** ou **archive S3 + Athena**. |
| JSON très imbriqué                        | **Compression** ou **splitting**.         |
| Liste qui croît indéfiniment dans un item | **Splitting**.                            |
| Données rarement lues                     | **Pruning** + archive S3.                 |
| Binaire fréquemment relu (cache)          | **S3 + CloudFront**.                      |

---

## 4. Index secondaires — introduction

### 4.1 — Le problème

Avec la primary key (PK + SK) seule, on a **un seul access pattern** efficace :

```text
Table Orders (PK=user_id, SK=order_id)
  → Query par user_id ✓
  → Query par order_id seul ? ✗ (impossible sans Scan)
```

Quand l'app a **plusieurs access patterns**, on a besoin d'**indexes secondaires**.

### 4.2 — Définition

Un **index secondaire** est une **structure de données** que DynamoDB maintient en parallèle de la table, indexée par **d'autres clés** que la primary.

```text
Table principale (PK=user_id, SK=order_id)
            ↕ synchronisé automatiquement
Index secondaire (PK=order_id)
  → Query par order_id ✓
```

DynamoDB met à jour l'index **automatiquement** à chaque écriture sur la table.

### 4.3 — Deux types

| Type                       | Acronyme | Portée                                                      |
| -------------------------- | -------- | ----------------------------------------------------------- |
| **Global Secondary Index** | **GSI**  | **Tout** (PK différente de la table).                       |
| **Local Secondary Index**  | **LSI**  | **Même partition** (PK = celle de la table, SK différente). |

C'est l'**item N2 majeur** du module. Section 5.

---

## 5. GSI vs LSI — la distinction (item N2 explicite)

### 5.1 — Tableau comparatif

| Aspect                   | **GSI** (Global Secondary Index)                    | **LSI** (Local Secondary Index)          |
| ------------------------ | --------------------------------------------------- | ---------------------------------------- |
| **Partition Key**        | **Différente** de la table                          | **Identique** à la table                 |
| **Sort Key**             | Différente ou identique                             | Différente                               |
| **Portée**               | **Toute la table**                                  | **Une seule partition** (locale)         |
| **Création**             | **À tout moment** (anytime)                         | **Uniquement à la création** de la table |
| **Suppression**          | **À tout moment**                                   | **Avec la table**                        |
| **Nombre max par table** | **20**                                              | **5**                                    |
| **Capacity (RCU/WCU)**   | **Séparée** de la table (à provisionner)            | **Partagée** avec la table               |
| **Consistance**          | **Eventually consistent** uniquement                | **Strongly consistent** disponible       |
| **Projection**           | Configurable (KEYS_ONLY, INCLUDE, ALL)              | Configurable                             |
| **Limites partition**    | Pas de limite (chaque GSI a ses propres partitions) | 10 GB par partition (incl. items + LSI)  |

### 5.2 — GSI — l'index "tout terrain"

**GSI = nouvelle table virtuelle** indexée par d'autres clés.

```text
Table principale :
  PK=user_id, SK=order_id, attributes : status, total, ...

GSI "status-index" :
  PK=status, SK=order_id
  → Permet : "Toutes les commandes en status='shipped'"
```

**Caractéristiques** :

- **Création / suppression à chaud** : flexible.
- **Capacity propre** : on dimensionne RCU/WCU séparément (mode Provisioned).
- **Eventually consistent** : la propagation prend ~quelques ms à secondes.
- **Coût** : on paie le stockage + écritures sur le GSI (item dupliqué).

### 5.3 — LSI — l'index local

**LSI = vue alternative au sein d'une même partition**, avec une SK différente.

```text
Table principale :
  PK=user_id, SK=order_id

LSI "by-date" :
  PK=user_id (forcément), SK=order_date
  → Permet : "Commandes d'alice triées par date plutôt que par order_id"
```

**Caractéristiques** :

- **PK identique** à la table (donc même partition).
- **Création à la création de la table seulement** : engagement.
- **Capacity partagée** : utilise les RCU/WCU de la table.
- **Strongly consistent** disponible : si besoin de cohérence forte sur l'index.

### 5.4 — Quand utiliser quoi

| Besoin                                                          | Index recommandé                         |
| --------------------------------------------------------------- | ---------------------------------------- |
| Indexer par une **clé totalement différente** de la table       | **GSI**                                  |
| Indexer par une **SK alternative** au sein des mêmes partitions | **LSI** (si table neuve)                 |
| Besoin de **strongly consistent reads** sur l'index             | **LSI**                                  |
| Indexation **dynamique** (ajout / retrait d'index)              | **GSI**                                  |
| Partitions très grosses (> 10 GB) sur la PK existante           | **GSI** (LSI imposerait < 10 GB)         |
| **Multi-tenant** avec accès par tenant                          | LSI (tenant_id PK partagée) ou GSI selon |

### 5.5 — La limite 10 GB des LSI — un piège

Les **items d'une même PK + leurs LSI** sont limités à **10 GB**. Si une PK accumule trop de données → écriture refusée.

**Solution** : utiliser un GSI à la place pour ces gros volumes.

C'est rare pour de l'OLTP, mais bloquant pour de l'historique cumulé.

### 5.6 — Projection — ce qu'on stocke dans l'index

À la création d'un GSI/LSI, on choisit **quels attributs** copier dans l'index :

| Projection    | Effet                                                   |
| ------------- | ------------------------------------------------------- |
| **KEYS_ONLY** | Seules les clés (PK/SK de l'index + PK/SK de la table). |
| **INCLUDE**   | Une liste **spécifiée** d'attributs.                    |
| **ALL**       | **Tous** les attributes (default).                      |

**Trade-off** :

- **ALL** : commode mais cher (chaque write duplique tout). Bon pour read-heavy patterns.
- **KEYS_ONLY** : minimal. Idéal pour "vérifier si l'item existe" sans rapatrier les données.
- **INCLUDE** : équilibré. **Le bon défaut** pour la plupart des cas.

### 5.7 — GSI — capacity sur Provisioned

En mode Provisioned, chaque GSI a **ses propres RCU/WCU**. Si on a 5 GSI sur une table à 100 WCU :

- Coût WCU = WCU de la table + somme des WCU des GSI.
- 100 + 5 × 100 = **600 WCU** si tous les GSI sont dimensionnés comme la table.

→ Les GSI **doublent voire quintuplent le coût d'écriture**. À surveiller.

### 5.8 — Exemple complet — single-table design

Modèle ambitieux d'une app SaaS :

```text
Table "saas-data"
  PK : composite_pk (ex: "TENANT#abc")
  SK : composite_sk (ex: "USER#alice", "PROJECT#42", "TASK#42#1")

GSI1 : pour "Tous les users avec un email donné"
  PK : email
  SK : composite_pk

GSI2 : pour "Tous les projects par status"
  PK : project_status
  SK : project_id
```

Une seule table, 2 GSI → couvre 4-5 access patterns différents.

C'est le **single-table design** classique (Alex DeBrie). Niveau 3-4.

---

## 6. Création de GSI

### 6.1 — À la création de la table

```bash
aws dynamodb create-table \
  --table-name tp-products \
  --attribute-definitions \
    AttributeName=product_id,AttributeType=S \
    AttributeName=category,AttributeType=S \
    AttributeName=price,AttributeType=N \
  --key-schema \
    AttributeName=product_id,KeyType=HASH \
  --global-secondary-indexes \
    "[{
      \"IndexName\": \"category-price-index\",
      \"KeySchema\": [
        {\"AttributeName\": \"category\", \"KeyType\": \"HASH\"},
        {\"AttributeName\": \"price\", \"KeyType\": \"RANGE\"}
      ],
      \"Projection\": {\"ProjectionType\": \"ALL\"}
    }]" \
  --billing-mode PAY_PER_REQUEST
```

### 6.2 — Sur une table existante (item du glossaire)

```bash
aws dynamodb update-table \
  --table-name tp-products \
  --attribute-definitions \
    AttributeName=category,AttributeType=S \
    AttributeName=price,AttributeType=N \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"category-price-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"category\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"price\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"INCLUDE\", \"NonKeyAttributes\": [\"name\", \"stock\"]}
      }
    }]"
```

**Important** : l'ajout d'un GSI sur une grande table prend du temps (backfill). Pendant le backfill, le GSI est dans l'état `CREATING` ou `UPDATING`.

```bash
# Suivre l'état
aws dynamodb describe-table --table-name tp-products \
  --query 'Table.GlobalSecondaryIndexes[].{Name:IndexName, Status:IndexStatus, BackfillRatio:Backfilling}'
```

Pour un million d'items : ~quelques minutes. Pour un milliard : ~heures.

### 6.3 — Query sur un GSI

```python
from boto3.dynamodb.conditions import Key

resp = table.query(
    IndexName='category-price-index',
    KeyConditionExpression=Key('category').eq('books') & Key('price').between(10, 50)
)
```

→ Retourne les livres avec un prix entre 10 et 50.

### 6.4 — Suppression d'un GSI

```bash
aws dynamodb update-table --table-name tp-products \
  --global-secondary-index-updates '[{"Delete": {"IndexName": "category-price-index"}}]'
```

---

## 7. Pratique — ajouter un GSI (item du glossaire)

### 7.1 — Le scénario

Reprendre la table `tp-orders` de M4. On veut maintenant **chercher les commandes par status** :

```text
Table : tp-orders (PK=user_id, SK=order_id)
  → Query par user_id : OK
  → Query "toutes les commandes shipped" : impossible sans Scan.

Solution : ajouter un GSI "status-index"
  PK=status, SK=order_id
```

### 7.2 — Étape 1 — Recréer la table de M4

```bash
aws dynamodb create-table \
  --table-name tp-orders \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=order_id,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
    AttributeName=order_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb wait table-exists --table-name tp-orders
```

### 7.3 — Étape 2 — Insérer des données

```bash
for user in alice bob carol; do
  for status in pending shipped delivered; do
    aws dynamodb put-item --table-name tp-orders --item "{
      \"user_id\": {\"S\": \"$user\"},
      \"order_id\": {\"S\": \"ORDER#$(date +%s)#$RANDOM\"},
      \"status\": {\"S\": \"$status\"},
      \"total\": {\"N\": \"$((RANDOM % 100)).99\"}
    }"
  done
done
```

### 7.4 — Étape 3 — Ajouter le GSI

```bash
aws dynamodb update-table --table-name tp-orders \
  --attribute-definitions AttributeName=status,AttributeType=S AttributeName=order_id,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "status-order-index",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "order_id", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'

# Attendre que l'index soit ACTIVE (sur petite table : ~1-2 min)
while true; do
  STATUS=$(aws dynamodb describe-table --table-name tp-orders \
    --query 'Table.GlobalSecondaryIndexes[?IndexName==`status-order-index`].IndexStatus' \
    --output text)
  echo "Status : $STATUS"
  [ "$STATUS" = "ACTIVE" ] && break
  sleep 10
done
```

### 7.5 — Étape 4 — Query sur le GSI

```bash
# Toutes les commandes en status "shipped"
aws dynamodb query --table-name tp-orders \
  --index-name status-order-index \
  --key-condition-expression "#st = :s" \
  --expression-attribute-names '{"#st": "status"}' \
  --expression-attribute-values '{":s": {"S": "shipped"}}'
```

Comparer la sortie à un Scan filtré :

```bash
aws dynamodb scan --table-name tp-orders \
  --filter-expression "#st = :s" \
  --expression-attribute-names '{"#st": "status"}' \
  --expression-attribute-values '{":s": {"S": "shipped"}}'
```

→ Le **Scan** lit **tous les items** puis filtre (cher). Le **Query sur GSI** lit **uniquement** ceux qui matchent (efficace).

### 7.6 — Étape 5 — Mesurer l'impact

```bash
# Statistiques de l'index
aws dynamodb describe-table --table-name tp-orders \
  --query 'Table.GlobalSecondaryIndexes[].{Name:IndexName, Size:IndexSizeBytes, ItemCount:ItemCount}'
```

### 7.7 — Cleanup

```bash
aws dynamodb delete-table --table-name tp-orders
```

---

## 8. Anti-patterns

| Anti-pattern                                                            | Conséquence                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| **Mettre des binaires** (images, PDFs) **dans DynamoDB** au lieu de S3. | 400 KB explosé, coût élevé.                     |
| **GSI avec Projection ALL** sur de gros items.                          | Stockage × 2, WCU × 2 par GSI.                  |
| **Trop de GSI** "au cas où".                                            | Chaque GSI multiplie les coûts d'écriture.      |
| **LSI sur partition qui peut dépasser 10 GB**.                          | Erreur silencieuse, écritures refusées à terme. |
| **Recréer la table pour ajouter un LSI** au lieu de prendre un GSI.     | Downtime + migration de données.                |
| **Hot GSI partition** (PK GSI à faible cardinalité).                    | Même problème de hot partition que la table.    |
| **Filter Expression sur GSI** pour des access patterns réguliers.       | Coût RCU élevé, latence augmentée.              |
| **Pas de monitoring** des GSI throttling séparé.                        | Latence inexpliquée, sans alerte.               |
| **Compresser** des données qu'on doit indexer / filtrer.                | Impossible de filter sur des bytes compressés.  |
| **Splitting trop fin** (1000 items à la place de 1).                    | Coût RCU multiplié, requêtes plus complexes.    |

---

## 9. Exercices pratiques

### Exercice 1 — Ajouter un GSI à une table existante (≈ 45 min)

**Objectif.** L'item central du glossaire.

**Étapes :** suivre la section 7.

**Livrable.** Captures des deux requêtes (Query GSI vs Scan filtré).

### Exercice 2 — Contourner la limite 400 KB (≈ 30 min)

**Cas.** Une app stocke des "profils utilisateur" qui contiennent une bio en markdown + une photo de profil. Certains profils dépassent 400 KB à cause de la photo.

**Refactoriser** : profile dans DynamoDB, photo dans S3 + url.

**Livrable.** Code avant/après (Python ou pseudo-code) + schéma.

### Exercice 3 — Choisir GSI vs LSI (≈ 20 min)

Pour chaque cas, GSI ou LSI ?

1. Index par email sur une table users (PK=user_id).
2. Index par status sur une table orders (PK=user_id, SK=order_id) — voir les orders triés par status pour un user donné.
3. Index par created_at descending sur une table orders.
4. Index par priority sur une table tickets (PK=team_id) — sortir les tickets prioritaires d'une team.
5. Index sur une table existante en prod, qu'on ne peut pas recréer.

**Livrable.** Tableau avec justification.

### Exercice 4 — Projection — choix optimal (≈ 20 min)

Pour une table users avec 30 attributes, on ajoute un GSI sur `email`. L'accès via le GSI sert uniquement à :

- **Cas A** : vérifier qu'un email est déjà utilisé.
- **Cas B** : récupérer le user complet pour login.
- **Cas C** : afficher une liste "amis suggérés" (besoin de `name`, `avatar_url`, `bio`).

**Pour chaque cas, choisir la projection** (KEYS_ONLY, INCLUDE, ALL) et justifier.

**Livrable.** Tableau + raisonnement coût/perf.

### Exercice 5 — Estimer le coût d'un GSI (≈ 30 min)

**Cas.** Table de 100M items, 50 KB chacun. Charge 1000 writes/s.

**Calculer** :

1. Coût mensuel sans GSI.
2. Coût avec 1 GSI projection ALL.
3. Coût avec 1 GSI projection KEYS_ONLY.

**Livrable.** Tableau avec calculs.

### Mini-défi — Single-table design pour blog (≈ 30 min, conception)

**Cas.** App blog :

- Users (id, email, name).
- Posts (id, user_id, title, content, published_at).
- Comments (id, post_id, user_id, body, created_at).

**Concevoir** une seule table DynamoDB avec :

- PK / SK qui permettent de récupérer les posts d'un user.
- GSI(s) qui permettent de :
  - Récupérer tous les comments d'un post.
  - Récupérer tous les comments d'un user.
  - Récupérer les posts publiés sur une période.

**Livrable.** Schéma + listing des access patterns.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer la **limite 400 KB** par item DynamoDB.
- [ ] Citer **4 stratégies** pour contourner la limite (S3, compression, pruning, splitting).
- [ ] Citer le **pattern S3 + pointer** et ses avantages/inconvénients.
- [ ] Définir un **index secondaire** DynamoDB.
- [ ] Distinguer **GSI** et **LSI** sur **6 axes** (PK, portée, création, capacity, consistance, limite max).
- [ ] Énoncer la règle "**LSI créés à la table seulement**".
- [ ] Choisir entre GSI et LSI pour 3 cas donnés.
- [ ] Citer les **3 types de projection** (KEYS_ONLY, INCLUDE, ALL) et leurs trade-offs.
- [ ] **Ajouter un GSI** sur une table existante de mémoire (CLI ou console).
- [ ] **Query** sur un GSI vs **Scan** filtré : différence de coût et perf.
- [ ] Citer **3 anti-patterns** GSI/LSI.

### Items du glossaire visés

**N2 atteint** :

- _taille maximale d'un enregistrement dans DynamoDB et manière de la contourner_ — sections 2 et 3.
- _différence entre Global Secondary Index et Local Secondary Index_ — section 5.

---

## 11. Ressources complémentaires

### Documentation AWS

- [DynamoDB Limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html)
- [Secondary Indexes overview](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html)
- [GSI vs LSI](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html#SecondaryIndexes.Comparison)
- [Best Practices for Modeling Relational Data in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql-B.html)

### Lectures avancées

- [The DynamoDB Book — Alex DeBrie](https://www.dynamodbbook.com/) — la référence.
- [Single-Table Design](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/) — AWS blog.

### Pour aller plus loin

- **M6 (S3 lifecycle)** — pour le pattern S3 + pointer.
- **Niveau 3** : PITR, DynamoDB Streams (CDC), DAX (caching), encryption at rest details.
- **Niveau 4** : DynamoDB Global Tables (multi-region), Transactions ACID.
