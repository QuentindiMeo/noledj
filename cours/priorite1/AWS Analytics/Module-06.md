# M6 — Glue Catalog et Crawlers

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Glue** comme la plateforme ETL serverless d'AWS, et distinguer ses **trois composants principaux** : **Data Catalog** (metadata), **Crawlers** (découverte schéma), **ETL Jobs** (Spark managé, vu en M7).
- Expliquer le **fonctionnement du Glue Data Catalog** (item N2 explicite) : metastore Hive-compatible, hiérarchie database → table → partitions, schémas versionnés, intégration native à Athena, EMR, Redshift Spectrum.
- Expliquer l'**intérêt des crawlers** et leur **intégration avec le Data Catalog** (item N2 explicite) : auto-découverte de schéma depuis S3, JDBC, DynamoDB, Kafka ; création/mise à jour de tables Catalog ; auto-détection des partitions.
- **Créer un crawler** sur des fichiers S3 (CSV, JSON, Parquet) et lancer un **requête Athena** sur la table créée.
- Comprendre la **logique de classifiers** (built-in + custom), la **gestion du schéma drift** et les modes (`UPDATE_IN_DATABASE`, `LOG`).
- Reconnaître les **patterns d'usage** (crawl quotidien d'un data lake, crawl à la demande après ingestion, intégration Firehose → Crawler → Athena) et les **anti-patterns** (re-crawler sans cesse, ne pas tagger, schéma incohérent).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M5 (CloudWatch, Athena, EMR, Firehose).
- AWS CLI v2 avec permissions `glue:*`, `s3:*`, `iam:*`.
- Un bucket S3 avec quelques fichiers structurés (réutiliser ceux de M3 ou M5).

---

## 1. Pourquoi Glue

### 1.1 — Le problème

Une organisation a des **centaines de datasets** dispersés :

- Logs S3 en JSON.
- Exports DynamoDB en JSON ION.
- Tables RDS Postgres.
- Streams Kinesis archivés Parquet.
- Datasets externes (partenaires, open data).

Pour les **requêter via Athena** ou les **traiter via EMR / Glue ETL**, il faut :

- Un **schéma déclaré** quelque part (sinon Athena ne sait pas quelles colonnes lire).
- Une **maintenance** : ajouter des partitions, modifier des colonnes, suivre les schémas qui évoluent.

Faire cela **manuellement** sur 100 datasets = inhumain. C'est le rôle du **Glue Data Catalog** + **Crawlers**.

### 1.2 — Vue d'ensemble de Glue

Glue est une **plateforme ETL serverless** avec **trois familles** de fonctionnalités :

| Composant        | Rôle                                                              |
| ---------------- | ----------------------------------------------------------------- |
| **Data Catalog** | **Metastore** centralisé : schémas, tables, partitions.           |
| **Crawlers**     | **Découverte automatique** des schémas depuis des sources.        |
| **ETL Jobs**     | Spark / Python managé pour transformer les données. **Vu en M7.** |

À cela s'ajoutent :

- **Glue Studio** : UI visuelle pour créer des jobs ETL.
- **Glue DataBrew** : transformation sans code (data prep).
- **Glue Streaming** : ETL sur Kinesis / Kafka.
- **Glue Schema Registry** : registre de schémas Avro/JSON (sujet N3).

**Ce module se concentre sur Catalog + Crawlers.** Le reste (jobs, tarification, bookmarks) est en M7.

### 1.3 — L'analogie de la bibliothèque

- Le **Data Catalog**, c'est le **catalogue des livres** de la bibliothèque. Sans lui, on a des étagères pleines de livres mais personne ne sait quel livre est où, ni de quoi il parle.
- Un **Crawler**, c'est le **bibliothécaire** qui, périodiquement, fait le tour des étagères (S3), lit le titre/auteur/résumé (schéma), et met à jour le catalogue.
- **Athena, EMR, Spectrum**, ce sont les **lecteurs** qui consultent le catalogue pour trouver et lire les livres.

Sans bibliothécaire, on devrait ajouter chaque nouveau livre au catalogue à la main.

### 1.4 — Glue Data Catalog : la pièce centrale

> Le Glue Data Catalog est le **metastore Hive-compatible** d'AWS, **partagé** entre tous les services analytics : Athena, EMR Spark/Hive/Presto, Redshift Spectrum, Lake Formation, Glue ETL.

C'est ce qui permet à une **table créée par un crawler** d'être **immédiatement interrogeable** par Athena ET EMR ET Spectrum sans configuration supplémentaire.

---

## 2. Glue Data Catalog (item N2 explicite)

### 2.1 — Architecture conceptuelle

```text
┌─────────────────────────────────────────────────┐
│ Glue Data Catalog                               │
│                                                 │
│  ┌────────────────────────────────────────┐     │
│  │ Database : "analytics"                 │     │
│  │  ┌──────────────────────────────────┐  │     │
│  │  │ Table : "sales"                  │  │     │
│  │  │   schema : product, qty, price...│  │     │
│  │  │   location : s3://my-bucket/...  │  │     │
│  │  │   format : Parquet               │  │     │
│  │  │   partitions : year=2026/month=05│  │     │
│  │  └──────────────────────────────────┘  │     │
│  │  ┌──────────────────────────────────┐  │     │
│  │  │ Table : "users"                  │  │     │
│  │  │   ...                            │  │     │
│  │  └──────────────────────────────────┘  │     │
│  └────────────────────────────────────────┘     │
│                                                 │
│  ┌────────────────────────────────────────┐     │
│  │ Database : "raw_logs"                  │     │
│  │  ...                                   │     │
│  └────────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘
```

### 2.2 — Hiérarchie

| Objet         | Définition                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| **Database**  | Namespace de tables (équivalent d'un schema PostgreSQL).                   |
| **Table**     | Schéma + emplacement physique des données (S3, JDBC, DynamoDB, …).         |
| **Partition** | Sous-ensemble d'une table identifié par valeurs de colonnes partitionnées. |
| **Column**    | Nom + type + commentaire optionnel.                                        |

### 2.3 — Anatomie d'une table Glue

```json
{
  "Name": "sales",
  "DatabaseName": "analytics",
  "Owner": "owner",
  "TableType": "EXTERNAL_TABLE",
  "StorageDescriptor": {
    "Columns": [
      { "Name": "product", "Type": "string" },
      { "Name": "qty", "Type": "int" },
      { "Name": "price", "Type": "double" }
    ],
    "Location": "s3://my-bucket/sales/",
    "InputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
    "OutputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
    "SerdeInfo": {
      "SerializationLibrary": "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    },
    "Compressed": true
  },
  "PartitionKeys": [
    { "Name": "year", "Type": "int" },
    { "Name": "month", "Type": "int" }
  ],
  "Parameters": {
    "classification": "parquet",
    "compressionType": "snappy"
  }
}
```

Trois sections clés :

- **`Columns`** : le schéma fondamental (non-partitions).
- **`Location`** : où sont les données.
- **`PartitionKeys`** : les colonnes partitionnées (qui ne sont **pas** dans Columns).

### 2.4 — Comment Glue Catalog se distingue d'un Hive Metastore

| Aspect            | Hive Metastore on-premise  | Glue Data Catalog                   |
| ----------------- | -------------------------- | ----------------------------------- |
| Operations        | À gérer (Postgres backend) | **Serverless** (AWS gère)           |
| Disponibilité     | Selon votre infra          | 99,9 % SLA                          |
| Backup / DR       | À implémenter              | Automatique multi-AZ                |
| Tarif             | Coût de l'infra            | 1 $/100 000 objets + 1 $/M requêtes |
| Intégration AWS   | Custom                     | Native (Athena, EMR, Spectrum, …)   |
| Schema versioning | Limité                     | Supporté                            |

### 2.5 — Tarifs

- **Stockage** : 1 $/100 000 objets/mois (1 objet = 1 table, 1 partition, 1 user-defined function).
- **Requêtes** : 1 $/million d'API calls (le **Free Tier inclut 1M de requêtes gratuites/mois**).

Pour une organisation moyenne avec 100 tables et 10 000 partitions : ~1 $/mois. **Négligeable.**

### 2.6 — Création manuelle (vs Crawler)

On peut créer une database / table **manuellement** via :

- Console Glue.
- AWS CLI / SDK.
- Athena DDL : `CREATE DATABASE`, `CREATE EXTERNAL TABLE` (vu en M3).
- Terraform / CloudFormation.

```bash
aws glue create-database --database-input Name=tp_glue,Description="TP Glue Catalog"

aws glue create-table --database-name tp_glue --table-input '{
  "Name": "sales",
  "StorageDescriptor": {
    "Columns": [...],
    "Location": "s3://my-bucket/sales/",
    ...
  },
  ...
}'
```

C'est **fastidieux**. D'où l'intérêt des **Crawlers**.

---

## 3. Crawlers (item N2 explicite)

### 3.1 — Définition

> Un **Glue Crawler** est un programme managé qui **scanne une source de données** (S3, JDBC, DynamoDB, MongoDB, Kafka, …), **infère le schéma** et **met à jour le Glue Data Catalog**.

C'est l'**outil d'auto-population** du Catalog. Plus on a de datasets, plus le crawler est précieux.

### 3.2 — L'intérêt précis (item N2 explicite)

| Bénéfice                               | Détail                                        |
| -------------------------------------- | --------------------------------------------- |
| **Pas de DDL manuel** à écrire         | Le crawler infère colonnes, types, format.    |
| **Auto-détection des partitions**      | Pas de `MSCK REPAIR TABLE` à exécuter.        |
| **Multi-source**                       | S3, RDS, DynamoDB, JDBC… via un même outil.   |
| **Schedule automatique**               | Quotidien / horaire / on-demand.              |
| **Schema drift handling**              | Détecte les nouvelles colonnes et les ajoute. |
| **Intégration native** avec Athena/EMR | Une fois crawlé, immédiatement queryable.     |

### 3.3 — Le workflow

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. CREATE : on définit un crawler                            │
│    - target (S3 path / JDBC / DDB / Kafka)                   │
│    - IAM role                                                │
│    - database de destination                                 │
│    - classifiers (built-in + custom)                         │
│    - schedule (on-demand / cron)                             │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. RUN : on déclenche le crawler (manuel ou schedule)         │
│    - Scanne récursivement le path                            │
│    - Identifie les formats (classifier)                      │
│    - Échantillonne les fichiers (premiers MB)                │
│    - Détecte les partitions (préfixes Hive-style)            │
│    - Construit le schéma global                              │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. UPDATE : met à jour le Data Catalog                       │
│    - Si table existe : ajoute partitions / colonnes          │
│    - Sinon : crée la table                                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 — Classifiers

Un **classifier** est un module qui identifie le format d'un fichier. Glue fournit des **classifiers built-in** :

- **CSV / TSV**.
- **JSON / JSON Lines**.
- **Parquet / ORC / Avro**.
- **XML**.
- **Apache Web Logs** (Common Log Format, ELB logs).
- **AWS CloudTrail**.
- **Ion** (DynamoDB exports).
- **Iceberg / Hudi / Delta**.

Quand on a un format **custom**, on peut créer un **custom classifier** (regex, JSON path, XML XPath, CSV avec delimiter custom).

Le crawler applique les classifiers **en ordre de priorité** : custom d'abord, built-in ensuite.

### 3.5 — Sources supportées

| Source                          | Détail                                           |
| ------------------------------- | ------------------------------------------------ |
| **S3**                          | Le cas le plus courant. Préfixe + récursif.      |
| **JDBC**                        | RDS, Aurora, autres SGBD via JDBC driver.        |
| **Amazon DynamoDB**             | Lit le schéma des items (premiers échantillons). |
| **Amazon DocumentDB / MongoDB** | Connecté via le connector approprié.             |
| **Delta Lake / Hudi / Iceberg** | Formats transactionnels modernes.                |
| **MSK / Kafka**                 | Topics Kafka (schéma Avro).                      |

### 3.6 — Schedule

| Mode                             | Cas d'usage                                      |
| -------------------------------- | ------------------------------------------------ |
| **On-demand**                    | Lancement manuel ou via Lambda / Step Functions. |
| **Daily / hourly / custom cron** | Auto-update régulier (logs quotidiens, par ex.). |
| **Event-driven**                 | Via EventBridge → trigger Lambda → run crawler.  |

---

## 4. Comment le crawler infère le schéma

### 4.1 — L'échantillonnage

Le crawler ne lit **pas tous les fichiers**. Il prend des **échantillons** (typiquement quelques MB des premiers fichiers de chaque "branche" de partition) et déduit :

- **Format** : Parquet, JSON, CSV…
- **Colonnes** : noms (depuis le header ou la première clé JSON).
- **Types** : int, string, double, date, struct, array…
- **Partitions** : à partir des préfixes Hive-style (`year=2026/month=05/`).

### 4.2 — Détection des partitions

```text
s3://my-bucket/logs/
├── year=2025/month=12/day=31/file.json
├── year=2026/month=01/day=01/file.json
└── year=2026/month=01/day=02/file.json
```

Le crawler détecte automatiquement :

- 3 partitions de la table `logs` :
  - `year=2025, month=12, day=31`.
  - `year=2026, month=01, day=01`.
  - `year=2026, month=01, day=02`.
- Trois colonnes partition : `year` (int), `month` (int), `day` (int).

C'est **immédiatement** queryable par Athena : `SELECT * FROM logs WHERE year=2026 AND month=1`.

### 4.3 — Détection de plusieurs tables sous un même path

```text
s3://my-bucket/data/
├── sales/year=2026/...
├── users/year=2026/...
└── products/year=2026/...
```

Le crawler peut **créer 3 tables séparées** (`sales`, `users`, `products`) **automatiquement** si la structure le permet.

Configuration : `TablesGroupingPolicy: CombineCompatibleSchemas` ou non, selon qu'on veut grouper ou séparer.

### 4.4 — Gestion du schema drift

Quand un crawler tourne sur une table existante et trouve **de nouvelles colonnes** ou **types différents**, on configure le comportement :

| Mode                            | Effet                                                |
| ------------------------------- | ---------------------------------------------------- |
| **UPDATE_IN_DATABASE** (défaut) | Met à jour la table Catalog avec le nouveau schéma.  |
| **LOG**                         | Détecte mais ne modifie pas. Notifie via CloudWatch. |
| **DEPRECATE_IN_DATABASE**       | Marque la table comme deprecated, ne touche pas.     |

**Bonne pratique** : `LOG` pour production (revue manuelle avant changement), `UPDATE` pour environnements dev/staging.

### 4.5 — Comportement sur nouveaux fichiers / partitions

Par défaut, le crawler **rescan tous les objets**. Pour des sources volumineuses, c'est lent et coûteux. Solutions :

- **Crawl only newly added folders** : ne re-scan que les nouveaux préfixes (basé sur S3 inventory).
- **Sample size** : limiter le nombre de fichiers échantillonnés (par défaut, 100 par dossier).
- **Incremental crawl** : pour S3, mode "recrawl behavior" peut être configuré sur "Add new files only".

---

## 5. Schema inference — les pièges

### 5.1 — JSON pas structuré

```json
{"user": "alice", "score": 42}
{"user": "bob", "score": "high"}    // ← string au lieu d'int
```

Le crawler verra deux types incompatibles pour `score`. Il choisira :

- **String** (couvre tout) → on perd la sémantique numérique.
- Ou échouera si on lui demande de la rigueur.

**Solution** : valider le schéma côté producer, ou utiliser un **Schema Registry**.

### 5.2 — CSV sans header

Sans header, le crawler nomme les colonnes `col1`, `col2`, … et infère le type. **À renommer manuellement** ou avec un custom classifier.

### 5.3 — Petits vs gros fichiers

Le crawler échantillonne les **premiers N MB** de chaque dossier. Si tous les premiers fichiers sont vides ou exotiques, le schéma déduit est faux.

**Solution** : avoir des fichiers représentatifs au début (par convention de nommage ou Glue config).

### 5.4 — Plusieurs schémas sous un même path

Si `s3://bucket/data/` contient un mix de JSON et CSV, le crawler peut **créer deux tables** ou **paniquer**. Préférer un préfixe **par type de fichier**.

---

## 6. Intégrations — Athena, EMR, Redshift Spectrum

### 6.1 — Athena

Athena **utilise Glue Data Catalog comme metastore par défaut**. Quand un crawler crée la table `analytics.sales`, Athena la voit **immédiatement** :

```sql
SELECT product, SUM(qty * price) AS revenue
FROM analytics.sales
WHERE year = 2026 AND month = 5
GROUP BY product;
```

**Pas de DDL Athena à écrire**. C'est le pattern le plus rentable du Catalog.

### 6.2 — EMR Spark / Hive / Presto

EMR peut **utiliser Glue Catalog comme metastore Hive** :

```python
# Spark
spark = SparkSession.builder \
    .appName("...") \
    .config("hive.metastore.client.factory.class", "com.amazonaws.glue.catalog.metastore.AWSGlueDataCatalogHiveClientFactory") \
    .enableHiveSupport() \
    .getOrCreate()

# Lire la table créée par le crawler
df = spark.sql("SELECT * FROM analytics.sales WHERE year=2026")
```

Idem pour Hive et Presto sur EMR. **Une table = visible partout**.

### 6.3 — Redshift Spectrum

Redshift Spectrum permet de **requêter S3 depuis Redshift** sans charger les données. Il utilise **Glue Catalog** comme metastore :

```sql
-- Dans Redshift, créer un external schema pointant vers Glue
CREATE EXTERNAL SCHEMA analytics_spectrum
FROM DATA CATALOG DATABASE 'analytics'
IAM_ROLE 'arn:aws:iam::ACCOUNT:role/redshift-spectrum-role';

-- Maintenant requêtable
SELECT * FROM analytics_spectrum.sales WHERE year=2026;
```

Pattern utile pour joindre données **chaudes** (Redshift) avec données **froides** (S3 via Spectrum).

### 6.4 — Glue ETL

Les **jobs Glue ETL** (M7) utilisent aussi le Catalog comme source/sink :

```python
# Job Glue Spark — lecture
from awsglue.context import GlueContext
gc = GlueContext(SparkContext())
df = gc.create_dynamic_frame.from_catalog(database="analytics", table_name="sales")

# Transformation Spark...

# Sink
gc.write_dynamic_frame.from_catalog(frame=df_transformed, database="analytics", table_name="sales_curated")
```

---

## 7. Pratique — crawler + Athena (item du glossaire)

L'objectif : créer un crawler sur des fichiers S3 et requêter la table via Athena.

### 7.1 — Plan

1. Préparer des données partitionnées en S3.
2. Créer un rôle IAM pour le crawler.
3. Créer une database Glue.
4. Créer et lancer le crawler.
5. Requêter via Athena.

### 7.2 — Étape 1 — Données S3

```bash
BUCKET=tp-glue-$(date +%s)
aws s3 mb s3://$BUCKET --region eu-west-1

# Créer des fichiers JSON partitionnés
for day in 15 16 17; do
  cat > /tmp/events.json <<EOF
{"event_id": "e1-${day}", "user": "alice", "action": "GET", "duration_ms": 42, "status": 200}
{"event_id": "e2-${day}", "user": "bob", "action": "POST", "duration_ms": 87, "status": 201}
{"event_id": "e3-${day}", "user": "carol", "action": "DELETE", "duration_ms": 65, "status": 200}
{"event_id": "e4-${day}", "user": "alice", "action": "GET", "duration_ms": 250, "status": 500}
EOF
  aws s3 cp /tmp/events.json s3://$BUCKET/events/year=2026/month=05/day=${day}/events.json
done

aws s3 ls s3://$BUCKET/events/ --recursive
```

### 7.3 — Étape 2 — Rôle IAM pour Glue

```bash
cat > glue-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "glue.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name tp-glue-crawler-role \
  --assume-role-policy-document file://glue-trust.json

aws iam attach-role-policy --role-name tp-glue-crawler-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole

cat > s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"]
  }]
}
EOF

aws iam put-role-policy --role-name tp-glue-crawler-role \
  --policy-name s3-read \
  --policy-document file://s3-policy.json
```

### 7.4 — Étape 3 — Database Glue

```bash
aws glue create-database \
  --database-input '{"Name": "tp_glue_db", "Description": "TP Glue Crawler"}'
```

### 7.5 — Étape 4 — Créer et lancer le crawler

```bash
ROLE_ARN=$(aws iam get-role --role-name tp-glue-crawler-role --query 'Role.Arn' --output text)

aws glue create-crawler \
  --name tp-events-crawler \
  --role $ROLE_ARN \
  --database-name tp_glue_db \
  --targets "{\"S3Targets\": [{\"Path\": \"s3://$BUCKET/events/\"}]}" \
  --schema-change-policy "UpdateBehavior=UPDATE_IN_DATABASE,DeleteBehavior=DEPRECATE_IN_DATABASE"

# Lancer
aws glue start-crawler --name tp-events-crawler

# Attendre la fin (peut prendre 1-3 min)
while [ "$(aws glue get-crawler --name tp-events-crawler --query 'Crawler.State' --output text)" = "RUNNING" ]; do
  echo "Crawler en cours..."
  sleep 10
done

echo "Crawler terminé."
```

### 7.6 — Étape 5 — Inspecter la table créée

```bash
aws glue get-tables --database-name tp_glue_db \
  --query 'TableList[].{Name:Name, Cols:StorageDescriptor.Columns[].Name, Partitions:PartitionKeys[].Name}'

# Sortie attendue :
# [{
#   "Name": "events",
#   "Cols": ["event_id", "user", "action", "duration_ms", "status"],
#   "Partitions": ["year", "month", "day"]
# }]
```

Lister les partitions découvertes :

```bash
aws glue get-partitions --database-name tp_glue_db --table-name events \
  --query 'Partitions[].Values'
```

### 7.7 — Étape 6 — Requêter via Athena

Dans la console Athena (ou via CLI) :

```sql
-- Vérifier la table
SHOW CREATE TABLE tp_glue_db.events;

-- Compter par jour
SELECT day, COUNT(*) AS events
FROM tp_glue_db.events
WHERE year = 2026 AND month = 5
GROUP BY day
ORDER BY day;

-- Top users
SELECT "user", COUNT(*) AS actions, AVG(duration_ms) AS avg_ms
FROM tp_glue_db.events
WHERE year = 2026
GROUP BY "user"
ORDER BY actions DESC;
```

**Aucun DDL écrit à la main**. Le crawler a tout fait.

### 7.8 — Étape 7 — Cleanup

```bash
aws glue delete-crawler --name tp-events-crawler
aws glue delete-table --database-name tp_glue_db --name events
aws glue delete-database --name tp_glue_db
aws s3 rm s3://$BUCKET --recursive
aws s3 rb s3://$BUCKET
aws iam delete-role-policy --role-name tp-glue-crawler-role --policy-name s3-read
aws iam detach-role-policy --role-name tp-glue-crawler-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole
aws iam delete-role --role-name tp-glue-crawler-role
```

---

## 8. Anti-patterns

| Anti-pattern                                                              | Conséquence                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Re-crawler en continu** une source qui ne change pas.                   | Coût inutile (~$0.44/h-DPU).                              |
| Crawler en mode **UPDATE_IN_DATABASE** sur la prod.                       | Une nouvelle colonne mal nommée peut casser les requêtes. |
| **Plusieurs schémas** sous un même path S3.                               | Le crawler combine mal ou crée des tables fausses.        |
| **Pas de partitionnement Hive-style** sur les sources.                    | Le crawler ne détecte pas → pas de partitions Catalog.    |
| **Ignorer les classifications personnalisées**.                           | Logs custom mal détectés → tables CSV au lieu de JSON.    |
| **Ne pas tagger les tables Catalog**.                                     | Audit / FinOps impossible.                                |
| Crawler avec **trop de permissions IAM** (S3:\*).                         | Surface d'attaque.                                        |
| Utiliser un crawler **au lieu d'écrire le DDL** quand le schéma est figé. | Sur-engineering.                                          |
| **Ne pas monitorer** les CloudWatch metrics du crawler.                   | Échecs silencieux.                                        |
| **Mélanger** crawlers Glue et tables manuelles dans la même DB.           | Conflits, mises à jour qui s'écrasent.                    |

---

## 9. Exercices pratiques

### Exercice 1 — Crawler sur S3 (≈ 45 min)

**Objectif.** L'item du glossaire pratique.

**Étapes :** suivre la section 7 — créer données, rôle, database, crawler, table, requête Athena.

**Livrable.** Schéma déduit + requête Athena réussie.

### Exercice 2 — Schema drift (≈ 30 min)

**Objectif.** Observer comment le crawler gère un changement de schéma.

**Étapes :**

1. Avec la table de l'exercice 1, **ajouter** des fichiers contenant un **nouveau champ** (par ex. `client_ip`).
2. Relancer le crawler.
3. Inspecter le schéma : la colonne `client_ip` doit apparaître.
4. Tester la requête Athena : les anciens événements affichent `null` pour `client_ip`.

**Livrable.** Capture du schéma avant/après + résultat de la requête.

### Exercice 3 — Crawler avec custom classifier (≈ 45 min)

**Objectif.** Cas réel des logs custom.

**Étapes :**

1. Uploader un fichier de logs au format `<date>|<user>|<action>|<duration>` (pipe-delimited).
2. Créer un **custom classifier** Glue (type CSV avec delimiter `|`).
3. Créer un crawler avec ce classifier en priorité.
4. Vérifier le schéma.

**Livrable.** Configuration du custom classifier + table créée.

### Exercice 4 — Crawler JDBC (≈ 45 min, optionnel)

**Objectif.** Voir une autre source.

**Étapes :**

1. Avoir une instance RDS PostgreSQL accessible.
2. Créer une **Glue Connection** vers cette base.
3. Créer un crawler ciblant cette connection.
4. Lancer et vérifier les tables découvertes.

**Livrable.** Liste des tables Postgres importées dans Glue Catalog.

### Exercice 5 — Crawler quotidien + EventBridge (≈ 30 min)

**Objectif.** Automatisation.

**Étapes :**

1. Configurer le crawler en **schedule quotidien** (cron `0 1 * * ? *` = 1h du matin UTC).
2. Tester en attendant le déclenchement ou en simulant via `start-crawler`.
3. Vérifier que les **nouvelles partitions** sont détectées.

**Livrable.** Capture de la configuration schedule + historique des runs.

### Mini-défi — Architecture Catalog (≈ 30 min, papier)

**Cas.** Data lake avec :

- 10 datasets de logs S3 (différents formats : JSON, Parquet).
- 5 tables RDS Postgres.
- 1 table DynamoDB exportée vers S3.
- 3 topics MSK Kafka.

**Concevoir** :

1. Combien de databases Glue ?
2. Combien de crawlers ? Sur quels rythmes ?
3. Comment éviter la cacophonie de schémas ?
4. Stratégie de naming des tables.

**Livrable.** Architecture + matrice crawler/source/schedule.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Glue** et ses 3 composants (Catalog, Crawlers, ETL Jobs).
- [ ] Définir le **Glue Data Catalog** : metastore Hive-compatible, hiérarchie database → table → partitions.
- [ ] Citer les **3 services analytics** qui utilisent Glue Catalog (Athena, EMR, Redshift Spectrum).
- [ ] Définir un **Crawler** et son **intérêt**.
- [ ] Décrire le **workflow d'un crawler** en 3 étapes (scan → infer → update).
- [ ] Citer les **sources supportées** (S3, JDBC, DynamoDB, MongoDB, Kafka).
- [ ] Définir un **classifier** built-in vs custom.
- [ ] Expliquer la **détection des partitions** Hive-style.
- [ ] Décrire les **3 modes de schema drift** (UPDATE, LOG, DEPRECATE).
- [ ] Construire un **crawler S3 + requête Athena** de mémoire.
- [ ] Citer **3 anti-patterns** (re-crawler en continu, schémas mélangés, IAM trop large).

### Items du glossaire visés

**N2 atteint** :

- _fonctionnement du Glue Catalog_ — section 2.
- _intérêt des crawlers et leur intégration avec le Data Catalog_ — sections 3, 4 et 7.

---

## 11. Ressources complémentaires

### Documentation AWS

- [Glue Developer Guide](https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html)
- [Data Catalog overview](https://docs.aws.amazon.com/glue/latest/dg/components-overview.html#data-catalog-intro)
- [Crawlers](https://docs.aws.amazon.com/glue/latest/dg/add-crawler.html)
- [Built-in classifiers](https://docs.aws.amazon.com/glue/latest/dg/classifier.html)
- [Schema versioning](https://docs.aws.amazon.com/glue/latest/dg/schema-evolution.html)
- [Glue pricing](https://aws.amazon.com/glue/pricing/)

### Pour aller plus loin

- **M7 (Glue — tarification et bookmark)** — la suite directe : jobs ETL Spark.
- **M8 (Comparatifs)** — choix Athena / Redshift / Aurora.
- **AWS Lake Formation** — gouvernance fine sur Glue Catalog (niveau 3).
- **Glue Schema Registry** — registre versionné Avro/JSON (niveau 3).
