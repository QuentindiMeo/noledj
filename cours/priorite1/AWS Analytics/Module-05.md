# M5 — Data Firehose

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **Amazon Data Firehose** (anciennement **Kinesis Data Firehose**) : un service de **livraison managée** de flux de données en temps quasi-réel vers des destinations analytics (S3, Redshift, OpenSearch, Splunk, HTTP endpoints).
- Énoncer l'**intérêt de Firehose** (item N1 explicite) : pas de cluster à gérer, buffering automatique, conversion de format, partitionnement, livraison fiable, intégration native AWS.
- Citer les **sources de données exploitables** par Firehose (item N2 explicite) : SDK direct (PutRecord), **Kinesis Data Streams**, **CloudWatch Logs** (subscription filter), **CloudWatch Events / EventBridge**, **IoT Core**, **Pinpoint**, **WAF**, **Route 53**, **AWS DMS**, **MSK** (Kafka).
- Définir les **destinations** standard : S3 (le cas dominant), Redshift via S3 staging, OpenSearch, Splunk, custom HTTP endpoints (Datadog, New Relic, MongoDB Atlas, …).
- Configurer le **buffering** (taille + temps) pour équilibrer **latence** et **coût**.
- Activer la **conversion automatique JSON → Parquet** (ou ORC) avec Glue Data Catalog pour préparer les données pour Athena/EMR.
- Construire un **pipe Firehose vers S3** end-to-end et observer les fichiers livrés.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M4 (CloudWatch, Athena, EMR).
- AWS CLI v2 avec permissions `firehose:*`, `s3:*`, `iam:*`, `glue:*`.
- Un bucket S3 de destination.
- Idéalement : avoir fait le parcours **AWS Kinesis** (Data Streams) — utile pour distinguer Firehose vs Streams.

---

## 1. Pourquoi Data Firehose

### 1.1 — Le problème

Une application produit un **flux continu de données** (logs, clics, événements IoT, métriques applicatives). On veut **les archiver dans S3** ou **les indexer dans OpenSearch** pour les analyser ensuite. Trois approches naïves :

1. **Écrire à chaque event un fichier S3** → millions de petits fichiers, ingestion S3 saturée, coûts API explosés.
2. **Tampons custom côté app** → code à maintenir, perte de données en cas de crash.
3. **Kinesis Data Streams + consumer** → puissant mais demande de coder un consumer, gérer le scaling, le checkpoint.

**Firehose résout ces problèmes** en offrant un service managé qui **bufferise, transforme et livre** automatiquement.

### 1.2 — Firehose en une phrase

> **Amazon Data Firehose** est un service **serverless de livraison de flux de données** qui ingère des records, les **bufferise**, applique optionnellement des **transformations**, et **livre** à intervalles réguliers (60s-15min) vers une destination (S3, Redshift, OpenSearch, Splunk, HTTP endpoint).

Trois propriétés clés :

- **Serverless** : aucun cluster à provisionner.
- **Buffering automatique** : par taille (1-128 MB) **ou** temps (60-900s).
- **Transformations Lambda** : optionnelles, à la volée.

### 1.3 — L'intérêt précis (item N1 explicite)

C'est **l'item N1 explicite** : pouvoir expliquer **pourquoi** utiliser Firehose.

| Bénéfice                                                    | Détail                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **Pas de cluster** ni de consumer à coder                   | AWS gère scaling, fiabilité, redémarrages.                       |
| **Buffering intelligent** par taille/temps                  | Réduit le nombre de fichiers S3, optimise les coûts.             |
| **Conversion JSON → Parquet** native                        | Préparer les données pour Athena en une option.                  |
| **Partitionnement S3 dynamique** (Dynamic Partitioning)     | Préfixes Hive-style (`year=YYYY/month=MM/day=DD/`) automatiques. |
| **Transformations** Lambda intégrées                        | Filtrer, enrichir, masquer à la volée.                           |
| **Retry & dead-letter** automatiques                        | Pas de perte de données en cas d'erreur.                         |
| **Compression** au choix (gzip, snappy, hadoop-snappy, zip) | Réduit stockage et coût de transfert.                            |
| **Intégration native** AWS                                  | CloudWatch, Kinesis, IoT, EventBridge, MSK.                      |
| **Tarification simple**                                     | Pay-per-GB ingéré, pas de cluster horaire.                       |

### 1.4 — Firehose vs Kinesis Data Streams

C'est **la confusion la plus fréquente**. Récap :

| Aspect                           | **Kinesis Data Streams (KDS)**      | **Data Firehose**             |
| -------------------------------- | ----------------------------------- | ----------------------------- |
| Modèle                           | Log distribué partitionné           | Livraison managée             |
| Consumer                         | À coder (lecture des shards)        | **AWS gère**                  |
| Rejouabilité                     | **Oui** (rétention 24h-365j)        | **Non** (delivery one-way)    |
| Latence ingestion → consommation | < 1s                                | 60-900s (buffering)           |
| Multi-consumer                   | **Oui** (fan-out)                   | Non (1 destination)           |
| Cas d'usage                      | Streaming temps réel multi-consumer | Archive / indexation différée |
| Coût                             | Per-shard ou On-Demand              | Per-GB ingéré                 |

**Règle simple** :

- Si on veut **archiver des données dans S3** sans coder de consumer → **Firehose**.
- Si on veut **traiter en temps réel** (< 1s) ou **plusieurs consumers** → **KDS**.

Ces deux services se **combinent** : KDS comme source → Firehose comme livraison.

### 1.5 — L'analogie postale

- **Kinesis Data Streams** = un **tapis roulant continu** dans une usine. Plusieurs ouvriers (consumers) peuvent venir prendre les colis dans l'ordre.
- **Firehose** = un **camion de livraison** qui ramasse les colis, attend d'être plein (ou que l'heure tourne), puis livre **directement** à l'entrepôt cible.

---

## 2. Le service en détail

### 2.1 — Anatomie d'un "Delivery Stream"

```text
┌──────────────────────────────────────────────────────────────┐
│ Delivery Stream "my-firehose"                                │
│                                                              │
│  Source                Buffer              Transform         │
│  ┌──────────┐          ┌──────────┐        ┌──────────┐      │
│  │ Direct   │          │ 5 MB ou  │        │ Lambda   │      │
│  │ PUT API  │ ───────► │ 300 s    │ ─────► │ (opt.)   │      │
│  │ KDS      │          │ buffer   │        │          │      │
│  │ MSK      │          └──────────┘        └────┬─────┘      │
│  │ CW Logs  │                                   │            │
│  └──────────┘                                   ▼            │
│                                          ┌──────────┐        │
│                                          │ Convert  │        │
│                                          │ Format   │        │
│                                          │ (opt.)   │        │
│                                          └────┬─────┘        │
│                                               │              │
│                                               ▼              │
│                                       Destination            │
│                                       ┌──────────┐           │
│                                       │ S3       │           │
│                                       │ Redshift │           │
│                                       │OpenSearch│           │
│                                       │ HTTP     │           │
│                                       └──────────┘           │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 — Le record

L'unité de base est un **record** : un blob binaire de **max 1 000 KB**. Le contenu est libre (JSON typiquement, mais aussi CSV, texte, binaire).

```python
import boto3, json
firehose = boto3.client("firehose")

firehose.put_record(
    DeliveryStreamName="my-firehose",
    Record={"Data": json.dumps({"user": "alice", "action": "login"}).encode() + b"\n"},
)
```

À noter : **ajouter `\n`** en fin de record pour faciliter le split côté lecture S3.

### 2.3 — PutRecord vs PutRecordBatch

- `put_record` : 1 record à la fois (1 API call).
- `put_record_batch` : jusqu'à **500 records** ou **4 MB** par call. **Toujours préférer** en production.

```python
firehose.put_record_batch(
    DeliveryStreamName="my-firehose",
    Records=[{"Data": (json.dumps(r) + "\n").encode()} for r in batch_of_records],
)
```

### 2.4 — Latence — comprendre le délai

> Firehose **n'est pas temps réel**. Les records sont **bufferisés** avant livraison.

Deux paramètres de buffer :

- **Buffer size** : 1 à 128 MB. Quand atteint, livraison.
- **Buffer interval** : 60 à 900 secondes. Si pas atteint, livraison forcée.

**Bonnes valeurs typiques** :

| Cas d'usage                         | Buffer size | Buffer interval | Latence typique |
| ----------------------------------- | ----------- | --------------- | --------------- |
| Logs archivés pour analyse différée | 64 MB       | 300 s           | ~5 min          |
| Logs critiques (security, audit)    | 5 MB        | 60 s            | ~1 min          |
| Métriques temps quasi-réel          | 1 MB        | 60 s            | ~1 min          |
| Archive massive (rare lecture)      | 128 MB      | 900 s           | ~15 min         |

**Trade-off** : plus le buffer est petit, plus la latence est faible **mais** plus on a de **petits fichiers** côté destination (mauvais pour Athena).

---

## 3. Sources de données exploitables (item N2)

C'est **l'item N2 explicite** : connaître les sources.

### 3.1 — Liste complète

| Source                                    | Description                                                    |
| ----------------------------------------- | -------------------------------------------------------------- |
| **Direct PUT** (SDK / CLI)                | Application qui appelle `PutRecord` / `PutRecordBatch`.        |
| **Kinesis Data Streams** (KDS)            | Consomme un KDS et le livre. Pattern le plus puissant.         |
| **Amazon MSK** (Kafka managé)             | Consomme un topic Kafka.                                       |
| **CloudWatch Logs** (subscription filter) | Logs CW automatiquement livrés (avec compression et encodage). |
| **CloudWatch Events** / **EventBridge**   | Events EventBridge livrés vers Firehose.                       |
| **AWS IoT Core**                          | Topics IoT routés vers Firehose via une rule IoT.              |
| **Amazon Pinpoint**                       | Events de campagne marketing.                                  |
| **AWS WAF**                               | Logs WAF (matched requests).                                   |
| **Amazon Route 53 Resolver**              | Query logs DNS.                                                |
| **AWS Database Migration Service** (DMS)  | Changements de base de données en streaming.                   |
| **AWS Network Firewall**                  | Logs réseau.                                                   |

### 3.2 — La règle de choix

- **Direct PUT** : pour des applications custom qui veulent juste pousser dans Firehose.
- **Kinesis Data Streams** : pour des flux **avec besoin de multi-consumer ou rejeu** (KDS → consumers temps réel + Firehose vers S3 pour archive).
- **CloudWatch Logs subscription** : pattern courant pour archiver les logs CloudWatch vers S3 (économique pour rétention longue).
- **MSK** : pour les organisations Kafka qui veulent un sink S3 sans coder un Kafka Connect.
- **IoT Core / Pinpoint / WAF** : intégrations natives, à activer dans les services source.

### 3.3 — Pattern phare : KDS → Firehose → S3

```text
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Producer │ ─► │   KDS    │ ─► │ Firehose │ ─► │    S3    │
│          │    │ 2 shards │    │  buffer  │    │ Parquet  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │
                     │  + autres consumers temps réel
                     ▼
                ┌──────────┐
                │ Lambda   │
                │ ECS app  │
                └──────────┘
```

Avantages :

- **Lecture temps réel** côté Lambda (KDS direct).
- **Archive automatique** S3 via Firehose, format Parquet partitionné, prêt pour Athena.
- **Rejouabilité** sur KDS (rétention 24h-365j).

### 3.4 — Pattern logs CloudWatch → S3

```text
┌──────────────┐    ┌─────────────────────┐    ┌──────────┐    ┌────────┐
│ Lambda /     │ ─► │ CloudWatch Log      │ ─► │ Firehose │ ─► │   S3   │
│ ECS / etc.   │    │ Group + sub. filter │    │          │    │        │
└──────────────┘    └─────────────────────┘    └──────────┘    └────────┘
                                                                    │
                                                                    ▼
                                                              Athena queries
```

Pourquoi : CloudWatch Logs coûte cher pour la rétention longue (0,03 $/GB/mois). S3 + Athena = 100× moins cher pour la même fonction de "search ancien".

---

## 4. Destinations

### 4.1 — Liste

| Destination                   | Cas d'usage                                          |
| ----------------------------- | ---------------------------------------------------- |
| **Amazon S3**                 | Cas dominant : archivage + Athena/EMR derrière.      |
| **Amazon Redshift**           | Data warehouse — S3 staging puis `COPY` automatique. |
| **Amazon OpenSearch**         | Indexation pour recherche / dashboards Kibana.       |
| **Splunk**                    | SIEM enterprise.                                     |
| **HTTP endpoint** (générique) | Datadog, New Relic, MongoDB Atlas, Coralogix, …      |
| **Snowflake**                 | Data warehouse cloud.                                |
| **Apache Iceberg** (sur S3)   | Tables transactionnelles modernes.                   |

### 4.2 — S3 — le standard

Configuration typique :

```text
Destination prefix : raw/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/
Error prefix : errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/
Compression : GZIP (texte) ou SNAPPY (Parquet)
Format conversion : Disabled / Apache Parquet / Apache ORC
```

Les **variables** `!{timestamp:format}` permettent un **partitionnement Hive-style** automatique.

### 4.3 — Redshift

Firehose ne **livre pas directement** à Redshift. Il **stage** en S3 puis exécute un `COPY` :

```text
1. Records → buffer → S3 (staging)
2. Firehose appelle COPY sur Redshift, lit le fichier S3
3. Redshift ingère
```

Demande un cluster Redshift + IAM role pour COPY + sécurité réseau.

### 4.4 — OpenSearch

Direct delivery vers OpenSearch (ex-ElasticSearch) :

- Création automatique des indices par date.
- Compression et bulk inserts.
- Fallback S3 si OpenSearch unavailable.

### 4.5 — HTTP endpoint

Pour des SaaS observabilité :

- URL HTTPS à fournir.
- Optionnellement, un **access key** à mettre dans le header.
- AWS gère retry et formatage selon le SaaS.

---

## 5. Buffering — équilibrer latence et coût

### 5.1 — Le trade-off

| Buffer plus petit / temps plus court | Buffer plus gros / temps plus long |
| ------------------------------------ | ---------------------------------- |
| Latence plus faible                  | Latence plus haute                 |
| Plus de petits fichiers S3           | Moins de fichiers, plus gros       |
| Coûts S3 PUT plus élevés             | Moins de coûts S3                  |
| Athena : scan moins efficace         | Athena : scan plus efficace        |

### 5.2 — Configuration

```bash
aws firehose create-delivery-stream \
  --delivery-stream-name my-firehose \
  --extended-s3-destination-configuration '{
    "BucketARN": "arn:aws:s3:::my-bucket",
    "Prefix": "raw/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "ErrorOutputPrefix": "errors/!{firehose:error-output-type}/",
    "BufferingHints": {
      "SizeInMBs": 64,
      "IntervalInSeconds": 300
    },
    "CompressionFormat": "GZIP",
    "RoleARN": "arn:aws:iam::ACCOUNT:role/firehose-role"
  }'
```

### 5.3 — Dynamic Partitioning

Depuis 2021, Firehose supporte le **Dynamic Partitioning** : partitionner sur des **champs du record** (et pas seulement le timestamp).

Exemple : partitionner par `tenant_id` :

```text
Partition key : tenant_id
Prefix : raw/tenant=!{partitionKeyFromQuery:tenant_id}/year=!{timestamp:yyyy}/...
```

Permet du **multi-tenant clean** sans transformation préalable.

---

## 6. Transformations Lambda

### 6.1 — Le pattern

Une Lambda peut être attachée à Firehose pour **transformer chaque record** avant livraison :

- Enrichissement (lookup d'IDs).
- Masquage de PII.
- Filtrage (drop des records non pertinents).
- Reformatage (CSV → JSON).
- Validation.

### 6.2 — Code Lambda — squelette

```python
import json, base64

def lambda_handler(event, context):
    output = []
    for record in event["records"]:
        payload = base64.b64decode(record["data"]).decode("utf-8")

        # Parse et transformer
        try:
            data = json.loads(payload)
            # Exemple : masquer l'email
            if "email" in data:
                data["email"] = data["email"][:3] + "***"
            transformed = json.dumps(data) + "\n"

            output.append({
                "recordId": record["recordId"],
                "result": "Ok",
                "data": base64.b64encode(transformed.encode()).decode(),
            })
        except Exception:
            output.append({
                "recordId": record["recordId"],
                "result": "ProcessingFailed",
                "data": record["data"],
            })
    return {"records": output}
```

Trois résultats possibles :

- `Ok` : livré normalement.
- `Dropped` : pas livré (filtré).
- `ProcessingFailed` : envoyé vers `errors/processing-failed/`.

### 6.3 — Tarif des transformations

- **Lambda standard** facturée comme d'habitude (invocations + GB-s).
- **Pas de surcoût Firehose** propre.

Buffer Firehose × Lambda : Firehose batch jusqu'à **3 MB** ou 5 min, puis appelle Lambda. La Lambda peut donc être bien dimensionnée.

---

## 7. Conversion JSON → Parquet (le killer feature)

### 7.1 — Le pattern

Firehose peut **convertir automatiquement** des records JSON en **Apache Parquet** (ou ORC) à la volée.

Configuration :

- Activer **Record format conversion**.
- Choisir **Apache Parquet** ou **Apache ORC**.
- Pointer vers une **table Glue Data Catalog** qui décrit le schéma.

À la livraison, S3 reçoit du **Parquet partitionné**, prêt pour Athena/EMR.

### 7.2 — Pourquoi c'est génial

Sans Firehose :

- L'app pousse du JSON dans S3.
- Job Glue / EMR le matin pour convertir JSON → Parquet partitionné.
- Athena requête le résultat.

Avec Firehose + Parquet conversion :

- L'app pousse du JSON dans Firehose.
- Firehose livre du Parquet **directement** dans S3, déjà partitionné.
- Athena requête immédiatement.

**Économie** :

- Pas de Glue Job à coder/payer.
- Pas de double stockage (raw JSON + processed Parquet).
- Athena requête 10× plus vite et 10× moins cher.

### 7.3 — Configuration

```bash
aws firehose create-delivery-stream \
  --delivery-stream-name parquet-stream \
  --extended-s3-destination-configuration '{
    "BucketARN": "arn:aws:s3:::my-bucket",
    "Prefix": "events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "ErrorOutputPrefix": "errors/",
    "BufferingHints": {"SizeInMBs": 64, "IntervalInSeconds": 300},
    "CompressionFormat": "UNCOMPRESSED",
    "DataFormatConversionConfiguration": {
      "Enabled": true,
      "InputFormatConfiguration": {"Deserializer": {"OpenXJsonSerDe": {}}},
      "OutputFormatConfiguration": {"Serializer": {"ParquetSerDe": {"Compression": "SNAPPY"}}},
      "SchemaConfiguration": {
        "DatabaseName": "tp_athena",
        "TableName": "events",
        "RoleARN": "arn:aws:iam::ACCOUNT:role/firehose-role"
      }
    },
    "RoleARN": "arn:aws:iam::ACCOUNT:role/firehose-role"
  }'
```

Note : `CompressionFormat=UNCOMPRESSED` car Parquet a sa **propre compression interne** (Snappy ici).

---

## 8. Pratique — pipe simple Firehose → S3

L'exercice central du module.

### 8.1 — Plan

1. Créer un bucket S3.
2. Créer un rôle IAM pour Firehose.
3. Créer le delivery stream (Direct PUT, S3 destination).
4. Pousser quelques records via la CLI / SDK.
5. Attendre 1-2 min, vérifier les fichiers livrés.

### 8.2 — Étape 1 — Bucket et rôle

```bash
BUCKET=tp-firehose-$(date +%s)
aws s3 mb s3://$BUCKET --region eu-west-1

# Rôle Firehose
cat > trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "firehose.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name firehose-tp-role \
  --assume-role-policy-document file://trust.json

cat > policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:AbortMultipartUpload",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:PutObject"
    ],
    "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"]
  }]
}
EOF

aws iam put-role-policy --role-name firehose-tp-role \
  --policy-name firehose-s3-access \
  --policy-document file://policy.json
```

### 8.3 — Étape 2 — Créer le Delivery Stream

```bash
ROLE_ARN=$(aws iam get-role --role-name firehose-tp-role --query 'Role.Arn' --output text)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

aws firehose create-delivery-stream \
  --delivery-stream-name tp-stream \
  --extended-s3-destination-configuration "{
    \"BucketARN\": \"arn:aws:s3:::$BUCKET\",
    \"Prefix\": \"raw/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/\",
    \"ErrorOutputPrefix\": \"errors/!{firehose:error-output-type}/\",
    \"BufferingHints\": {\"SizeInMBs\": 1, \"IntervalInSeconds\": 60},
    \"CompressionFormat\": \"GZIP\",
    \"RoleARN\": \"$ROLE_ARN\"
  }"
```

**Note** : buffer petit (1 MB / 60 s) pour observer rapidement les livraisons en TP.

### 8.4 — Étape 3 — Pousser des records

```python
# producer.py
import boto3, json, time, random, uuid

firehose = boto3.client("firehose", region_name="eu-west-1")

for i in range(100):
    record = {
        "id": str(uuid.uuid4()),
        "user": random.choice(["alice", "bob", "carol"]),
        "action": random.choice(["GET", "POST", "DELETE"]),
        "timestamp": time.time(),
    }
    firehose.put_record(
        DeliveryStreamName="tp-stream",
        Record={"Data": (json.dumps(record) + "\n").encode()}
    )
    if i % 20 == 0:
        print(f"Sent {i}")

print("Done.")
```

Exécuter et attendre **1 à 2 minutes**.

### 8.5 — Étape 4 — Vérifier la livraison

```bash
aws s3 ls s3://$BUCKET/raw/ --recursive

# Résultat typique :
# 2026-05-18 12:34:45  3214  raw/year=2026/month=05/day=18/tp-stream-1-2026-05-18-12-34-45-abcd1234.gz

# Télécharger et inspecter
aws s3 cp s3://$BUCKET/raw/year=2026/month=05/day=18/tp-stream-1-2026-05-18-12-34-45-abcd1234.gz /tmp/
gunzip -c /tmp/tp-stream-1-2026-05-18-12-34-45-abcd1234.gz
# {"id":"...","user":"alice","action":"GET","timestamp":1763472000.123}
# {"id":"...","user":"bob",...}
# ...
```

### 8.6 — Étape 5 — Cleanup

```bash
aws firehose delete-delivery-stream --delivery-stream-name tp-stream
aws s3 rm s3://$BUCKET --recursive
aws s3 rb s3://$BUCKET
aws iam delete-role-policy --role-name firehose-tp-role --policy-name firehose-s3-access
aws iam delete-role --role-name firehose-tp-role
```

---

## 9. Coûts

### 9.1 — Tarification

- **Ingestion** : 0,029 $/GB pour les premiers 500 TB/mois, dégressif ensuite.
- **Format conversion** (JSON → Parquet) : +0,018 $/GB.
- **Dynamic Partitioning** : +0,02 $/GB.
- **Transformations Lambda** : coût standard Lambda en plus.

### 9.2 — Estimer

Cas typique : 100 GB/jour de logs ingérés, format conversion activée.

- Ingestion : 100 × 30 × 0,029 = **~87 $/mois**.
- Conversion : 100 × 30 × 0,018 = **~54 $/mois**.
- **Total : ~141 $/mois** pour 3 TB/mois de logs structurés et archivés en Parquet partitionné.

Comparé à un cluster Kafka + ETL custom : **immensément moins cher**.

---

## 10. Anti-patterns

| Anti-pattern                                                      | Conséquence                                       |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| Utiliser Firehose pour du **vraiment temps réel** (< 30s).        | Mauvais outil. Utiliser KDS avec consumer Lambda. |
| **Pas activer la conversion Parquet** quand on a besoin d'Athena. | Garder du JSON brut → 10× plus cher à requêter.   |
| **Buffer trop petit** → millions de petits fichiers S3.           | Athena lente, S3 saturée.                         |
| Pousser **un record à la fois** (`PutRecord`) au lieu de batch.   | API calls × 500, throttling possible.             |
| **Pas de partitionnement timestamp** → tout dans un préfixe.      | Athena scanne tout, à chaque fois.                |
| Oublier le **`\n`** entre records.                                | Fichiers livrés non lisibles ligne par ligne.     |
| **Pas de monitoring** des `DeliveryToS3 failed`.                  | Pertes silencieuses.                              |
| **Records > 1 000 KB**.                                           | Rejets silencieux.                                |
| Confondre **KDS et Firehose**.                                    | Mauvais choix d'architecture.                     |

---

## 11. Exercices pratiques

### Exercice 1 — Pipe Firehose → S3 (≈ 30 min)

**Objectif.** L'item de glossaire pratique.

**Étapes :** suivre la section 8 — créer le delivery stream, pousser des records, vérifier les fichiers livrés.

**Livrable.** Capture du contenu d'un fichier livré + commande qui a fonctionné.

### Exercice 2 — Conversion JSON → Parquet (≈ 45 min)

**Objectif.** Configurer le killer feature.

**Étapes :**

1. Créer une table Glue Catalog avec le schéma de votre événement.
2. Créer un delivery stream avec `DataFormatConversionConfiguration` activé.
3. Pousser 1000 records.
4. Vérifier que les fichiers livrés sont **`.parquet`** et **lisibles via Athena**.

**Livrable.** Schéma Glue + capture des fichiers Parquet.

### Exercice 3 — Source CloudWatch Logs (≈ 30 min)

**Objectif.** Archiver des logs CW vers S3.

**Étapes :**

1. Sur un Log Group existant (Lambda, ECS), créer un **subscription filter** vers Firehose.
2. Le delivery stream livre dans S3.
3. Générer quelques logs et vérifier les fichiers S3.

**Livrable.** Capture de la subscription + des fichiers livrés.

### Exercice 4 — Transformation Lambda (≈ 45 min)

**Objectif.** Masquer une PII.

**Étapes :**

1. Créer une Lambda qui transforme les records pour **masquer l'email** (e.g. `alice@example.com` → `ali***`).
2. L'attacher au delivery stream.
3. Pousser des records avec emails et vérifier que les fichiers S3 contiennent la version masquée.

**Livrable.** Lambda code + sample de fichier livré.

### Mini-défi — Architecture streaming + archive (≈ 30 min, papier)

**Cas.** Application e-commerce produisant des **events de panier** (`add_to_cart`, `remove_from_cart`, `checkout`).

- **Besoin temps réel** : un dashboard de métriques < 30s.
- **Besoin analytics** : queries SQL Athena sur l'historique.
- **Besoin alerting** : détection de comportements suspects.

**Concevoir** :

1. Quel rôle pour Kinesis Data Streams ?
2. Quel rôle pour Firehose ?
3. Quelles destinations ?
4. Buffering choisi ?

**Livrable.** Schéma + justification.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Data Firehose** et énoncer son **intérêt** (livraison managée serverless).
- [ ] Distinguer **Firehose** et **Kinesis Data Streams** sur au moins 4 axes.
- [ ] Citer les **principales sources** : Direct PUT, KDS, MSK, CloudWatch Logs, IoT, EventBridge.
- [ ] Citer les **principales destinations** : S3, Redshift, OpenSearch, Splunk, HTTP.
- [ ] Expliquer le **buffering** par taille/temps et le trade-off latence/coût.
- [ ] Configurer la **conversion JSON → Parquet** automatique.
- [ ] Activer le **Dynamic Partitioning** sur un champ du record.
- [ ] Construire un **pipe Firehose → S3** de mémoire.
- [ ] Écrire une **transformation Lambda** simple.
- [ ] Estimer le coût mensuel d'un Firehose pour 100 GB/jour.
- [ ] Citer **3 anti-patterns**.

### Items du glossaire visés

**N1 atteint** :

- _intérêt du service Data Firehose_ — section 1.3.

**N2 atteint** :

- _sources de données exploitables par Data Firehose_ — section 3.

---

## 13. Ressources complémentaires

### Documentation AWS

- [Amazon Data Firehose Developer Guide](https://docs.aws.amazon.com/firehose/latest/dev/what-is-this-service.html)
- [Data Sources](https://docs.aws.amazon.com/firehose/latest/dev/writing-with-kinesis-streams.html)
- [Data Transformation with Lambda](https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html)
- [Dynamic Partitioning](https://docs.aws.amazon.com/firehose/latest/dev/dynamic-partitioning.html)
- [Format Conversion](https://docs.aws.amazon.com/firehose/latest/dev/record-format-conversion.html)
- [Pricing](https://aws.amazon.com/firehose/pricing/)

### Pour aller plus loin

- **M6-M7 (Glue)** — catalog + crawlers utilisés par Firehose pour la conversion Parquet.
- **M8 (Comparatifs)** — Redshift comme destination alternative.
- **Parcours AWS Kinesis** — distinguer KDS et Firehose.
- **Niveau 3** : Lambda transformations avancées, partitionnement dynamique custom, integration MSK.
