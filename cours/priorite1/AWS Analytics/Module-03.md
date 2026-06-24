# M3 — Athena

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Athena** comme un **service de requêtage SQL serverless** sur des données stockées dans S3 (et d'autres sources), et expliquer son modèle "Query-in-place".
- Identifier le **moteur SQL sous-jacent** d'Athena : **Trino** (anciennement PrestoSQL, fork du projet Presto), et comprendre ses implications (latence, syntaxe, fonctions).
- Connaître les **formats de fichiers supportés** par Athena (CSV, TSV, JSON, Parquet, ORC, Avro, ION, …) et savoir lequel choisir pour quelle performance (item N1 explicite).
- Citer les **services avec lesquels Athena s'intègre** : S3, Glue Data Catalog, QuickSight, Lambda, EMR, Step Functions, JDBC/ODBC, federated query vers RDS/Redshift/DynamoDB (item N2).
- Expliquer le **partitionnement S3** (par préfixe, "Hive-style") et son **effet drastique** sur la performance et le coût (item N2 central).
- **Créer une table externe** Athena pointant vers des données S3, avec partitions, et **lancer des requêtes**.
- Reconnaître les **anti-patterns** (fichiers trop petits, format CSV en prod, pas de partitions, pas de Parquet).

## Durée estimée

1 jour.

## Pré-requis

- M1-M2 (CloudWatch Logs et Alerting).
- AWS CLI v2 avec permissions `athena:*`, `s3:*`, `glue:*`.
- Bases SQL : SELECT, WHERE, GROUP BY, JOIN, fonctions d'agrégation. Cf. parcours SQL si besoin.
- Un bucket S3 où on peut uploader des fichiers de test.

---

## 1. Pourquoi Athena

### 1.1 — Le problème — data analytics sans déménager les données

Les entreprises stockent des **téraoctets** de données dans S3 (logs, exports DB, click streams, datasets). Pour les analyser **avant Athena**, deux approches :

1. **ETL traditionnel** : Glue / Spark transforme S3 → charge dans Redshift / Aurora → on requête. **Lourd, lent, coûteux**.
2. **Outils tiers** : Snowflake / BigQuery / Databricks. **Cher, vendor lock-in**.

**Athena casse ce dilemme** : on **requête S3 directement en SQL**, sans déménager les données, **pay-per-query**.

### 1.2 — Athena en une phrase

> **Athena** est un service **serverless** qui permet d'exécuter des requêtes **SQL standard** sur des **fichiers stockés dans S3** (et d'autres sources via federated query), avec une **facturation au TB scanné** (5 $/TB).

Trois propriétés clés :

- **Serverless** : pas d'infrastructure à provisionner. On crée une requête, AWS la lance, on paye le scan.
- **Query-in-place** : les données restent dans S3 dans leur format d'origine.
- **SQL standard ANSI** : couvre 95 % des besoins analytiques sans apprendre un dialecte custom.

### 1.3 — L'analogie de la bibliothèque

Une **bibliothèque** (S3) contient des millions de livres dans plusieurs formats (CSV = livres broches, Parquet = livres reliés indexés).

- **Sans Athena** : pour répondre à "combien de livres mentionnent Paris ?", on emprunte tous les livres, on les rapatrie chez soi, on les lit.
- **Avec Athena** : on envoie une **bibliothécaire ultra-rapide** (Athena, basée sur Trino) qui parcourt **uniquement les rayons concernés** (partitions) et compte sur place.

Plus les livres sont **bien indexés** (Parquet partitionné), plus la bibliothécaire est rapide et bon marché.

### 1.4 — Cas d'usage typiques

| Cas                                                         | Pourquoi Athena                                |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Analyse de **logs S3** (CloudFront, ALB, VPC Flow Logs)     | Logs nativement archivés S3, pas besoin d'ETL. |
| Exploration ad hoc d'un **dataset entreprise**              | Pas de provisioning, on paye à l'usage.        |
| **Reporting BI** branché à QuickSight                       | Athena est la source par défaut de QuickSight. |
| **Recherche de logs anciens** (> 30 jours archivés vers S3) | Moins cher que CloudWatch Logs Insights.       |
| **ETL léger** via `CREATE TABLE AS SELECT` (CTAS)           | Reformatter CSV en Parquet partitionné.        |
| Réponse à un **audit** (ex. "qui a accédé à quoi en 2024")  | Requête CloudTrail archivé.                    |

### 1.5 — Athena vs alternatives

| Solution                 | Cas d'usage                  | Différence avec Athena                                                       |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| **Redshift**             | Data warehouse "always-on"   | Cluster provisionné, plus rapide pour lourdes charges récurrentes. Vu en M8. |
| **RDS / Aurora**         | OLTP transactionnel          | Petites tables, requêtes < 100ms.                                            |
| **EMR + Spark**          | Data engineering, ML         | Cluster Spark/Hadoop pour des transformations complexes. Vu en M4.           |
| **DynamoDB**             | Key-value, OLTP scalable     | Pas de SQL ad hoc.                                                           |
| **BigQuery / Snowflake** | Concurrents directs hors AWS | Modèle similaire à Athena, plus de fonctionnalités enterprise.               |

**Règle simple** : pour des **requêtes ad hoc** sur des **données S3**, **Athena**. Pour du dashboard temps réel récurrent à fort volume → Redshift.

---

## 2. Le moteur SQL sous-jacent (item N2)

### 2.1 — Trino, fork de Presto

Athena utilise **Trino** (anciennement **PrestoSQL**, un fork du projet Presto initialement développé chez Facebook) comme moteur de requête.

**Trino** :

- Moteur **distribué** : un cluster de workers exécute les requêtes en parallèle.
- **Massively Parallel Processing** (MPP) : scan parallèle de S3, agrégations distribuées.
- **SQL ANSI** + extensions (`UNNEST`, fonctions de window, lambda functions).
- **In-memory** : pas de disque intermédiaire (vs Hive sur disque) → rapide.

Athena **abstrait totalement** le cluster Trino : pour l'utilisateur, c'est une API SQL. AWS gère le provisioning, le scaling, la facturation.

### 2.2 — Athena Engine v3 (2023+)

Depuis 2023, Athena propose **Engine v3** basé sur Trino v411+. Améliorations vs Engine v2 :

- Plus rapide (jusqu'à 2× sur certaines requêtes).
- Plus de fonctions (e.g. `array_zip`, `map_zip`, JSON functions étendues).
- Support natif Apache Iceberg.

**Bonne pratique 2026** : utiliser Engine v3 par défaut.

### 2.3 — Conséquences pratiques du moteur Trino

- **Syntaxe SQL ANSI** standard, donc transférable vers d'autres moteurs.
- **Pas de transactions** (Athena est read-only sur S3, pas de UPDATE/DELETE classiques).
- **Performance dépend du format S3** : Parquet > ORC > JSON > CSV.
- **Pas de stockage propre** : si on supprime les fichiers S3, les tables Athena pointent dans le vide.
- **Pas de cache de résultats** automatique (mais on peut activer le **result reuse** payant).

### 2.4 — Distinctions à connaître

- **Athena ≠ Presto/Trino self-hosted** : Athena est managé, Presto self-hosted dans EMR demande du tuning.
- **Athena SQL ≠ Spark SQL** : syntaxe proche mais différente sur certaines fonctions.
- **Athena ≠ Glue ETL** : Glue (M6-M7) fait de l'ETL en Spark ; Athena requête en SQL.

---

## 3. Formats de fichiers supportés (item N1)

C'est l'**item N1 explicite** : connaître les formats supportés.

### 3.1 — Les formats principaux

| Format                          | Type               | Compression  | Lecture Athena  | Cas d'usage                                  |
| ------------------------------- | ------------------ | ------------ | --------------- | -------------------------------------------- |
| **CSV / TSV**                   | Texte délimité     | gzip, bzip2  | Lente           | Imports depuis Excel, données legacy.        |
| **JSON**                        | Texte structuré    | gzip         | Lente           | Logs applicatifs, exports API.               |
| **JSONL** (JSON Lines)          | 1 JSON/ligne       | gzip         | Moyenne         | Streaming logs, CloudWatch exports.          |
| **Parquet**                     | Colonnaire binaire | Snappy, gzip | **Très rapide** | **Standard analytics** AWS.                  |
| **ORC**                         | Colonnaire binaire | ZLIB, Snappy | Très rapide     | Alternative à Parquet (origine Hortonworks). |
| **Avro**                        | Binaire structuré  | Snappy       | Rapide          | Streaming Kafka, échange entre systèmes.     |
| **ION** (Amazon ION)            | Binaire / texte    | gzip         | Rapide          | Format spécifique AWS (DynamoDB exports).    |
| **Iceberg / Hudi / Delta Lake** | Table format       | …            | Engine v3       | Tables transactionnelles modernes.           |

### 3.2 — Pourquoi Parquet domine

**Parquet** est un format **colonnaire** : les valeurs d'une même colonne sont stockées **ensemble**, pas mélangées avec les autres colonnes.

``` txt
Format CSV (par ligne) :
  Alice,30,Paris
  Bob,25,Lyon
  Carol,28,Marseille

Format Parquet (par colonne, avec métadonnées) :
  Names : [Alice, Bob, Carol]            (dict-encoded)
  Ages : [30, 25, 28]                    (compressed int)
  Cities : [Paris, Lyon, Marseille]      (dict-encoded)
  + Stats par bloc : min/max, count, dict
```

**Avantages** :

- **Compression** : 5-10× plus dense que CSV.
- **Projection** : si la requête ne sélectionne que `Ages`, Athena **ne lit que cette colonne**. Pas tout le fichier.
- **Predicate pushdown** : Athena lit les **min/max** des blocs et **saute** les blocs qui ne matchent pas le `WHERE`.
- **Type-safe** : les types sont stockés (int, string, timestamp), pas inférés.

**Conséquence économique** :

- Une requête `SELECT AVG(price) FROM sales WHERE year=2026` sur :
  - **CSV** non partitionné de 100 GB : Athena scanne **100 GB** = 0,50 $.
  - **Parquet** partitionné par année : Athena scanne **1 colonne sur 1 partition**, souvent < 100 MB = 0,0005 $.

**Gain : 1 000×**. C'est **massif**.

### 3.3 — Convertir CSV → Parquet (CTAS)

Athena permet de **convertir et écrire** des fichiers via `CREATE TABLE AS SELECT` :

```sql
CREATE TABLE sales_parquet
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['year', 'month'],
  external_location = 's3://my-data/sales-parquet/'
)
AS
SELECT product_id, price, qty, EXTRACT(YEAR FROM dt) AS year, EXTRACT(MONTH FROM dt) AS month
FROM sales_csv;
```

Investissement initial (quelques minutes + coût du scan) → toutes les requêtes futures **10-100× plus rapides et moins chères**. **À faire systématiquement** sur des données qu'on requêtera plusieurs fois.

### 3.4 — Choix de format — règle simple

| Source de données                        | Format recommandé                         |
| ---------------------------------------- | ----------------------------------------- |
| Logs applicatifs ingérés en S3           | JSON ou JSONL puis CTAS → Parquet         |
| Exports DynamoDB                         | ION ou JSON                               |
| Exports RDS / data warehouse             | Parquet directement                       |
| Données legacy CSV                       | CSV → CTAS → Parquet pour usage récurrent |
| Streaming Kinesis Firehose               | Parquet directement (Firehose convertit)  |
| Tables transactionnelles (besoin update) | Iceberg ou Delta Lake                     |

---

## 4. Intégrations Athena (item N2)

C'est l'**item N2** : savoir avec quoi Athena s'intègre.

### 4.1 — Sources de données

| Source                                                                       | Intégration                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **S3** (natif)                                                               | Source principale. Lecture directe.                                         |
| **Glue Data Catalog**                                                        | Stocke les schémas de tables (M6).                                          |
| **AWS Lake Formation**                                                       | Gouvernance et permissions fines sur S3.                                    |
| **Federated Query** : RDS, Aurora, DynamoDB, MSK, ElasticSearch, Redshift, … | Connectors Lambda. Athena requête ailleurs comme s'il s'agissait de tables. |
| **External Hive Metastore**                                                  | Schémas hors Glue (par ex. Hive on EMR).                                    |
| **Apache Iceberg / Hudi / Delta Lake**                                       | Tables transactionnelles modernes.                                          |

### 4.2 — Consommateurs / sorties

| Outil                     | Comment                                        |
| ------------------------- | ---------------------------------------------- |
| **QuickSight**            | Source de données par défaut.                  |
| **JDBC / ODBC**           | Brancher DBeaver, Tableau, Power BI, …         |
| **SDK / CLI**             | Lancer des requêtes programmatiques.           |
| **Lambda**                | Lancer Athena depuis une Lambda.               |
| **Step Functions**        | Orchestration de workflows analytiques.        |
| **EventBridge**           | Déclencher Athena périodiquement ou sur event. |
| **Saved Queries / Views** | Sauvegarder des requêtes, créer des vues SQL.  |
| **Workgroups**            | Séparer les équipes, limites coûts.            |

### 4.3 — Glue Data Catalog — le sujet central (vu en M6)

Athena **ne stocke pas ses schémas tout seul**. Il utilise le **Glue Data Catalog** comme metastore.

- Une **base de données** Athena = une **database Glue**.
- Une **table** Athena = une **table Glue** avec son schema + son emplacement S3.

Cette dépendance permet :

- **Partage** des schémas entre Athena, Glue ETL, EMR, Redshift Spectrum.
- Auto-population via les **Glue Crawlers** (M6) : pas besoin d'écrire le DDL manuellement.

### 4.4 — Schéma d'intégration

```text
                    ┌──────────────────────┐
                    │ Glue Data Catalog    │
                    │ (schémas, partitions)│
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
       ┌──────────┐                      ┌──────────┐
       │ Athena   │ ←─── SQL ─────→     │ EMR Spark │
       │ (Trino)  │                      │           │
       └────┬─────┘                      └────┬─────┘
            │                                 │
            │ lit                             │ lit
            ▼                                 ▼
       ┌──────────────────────────────────────────────┐
       │ S3 (données brutes : Parquet, JSON, CSV, …) │
       └──────────────────────────────────────────────┘

       ▲                                 ▲
       │                                 │
       │ JDBC/ODBC                       │ Federated
       │                                 │
   ┌────┴─────┐                    ┌────┴─────┐
   │QuickSight │                    │ RDS /    │
   │ BI tools  │                    │ DynamoDB │
   └───────────┘                    └──────────┘
```

---

## 5. Partitionnement S3 (item N2 central)

### 5.1 — Le concept

**Partitionner** = organiser les fichiers S3 dans des **préfixes hiérarchiques** correspondant à des colonnes de filtrage.

Structure non-partitionnée :

```text
s3://logs/access-2026-01-01.json
s3://logs/access-2026-01-02.json
s3://logs/access-2026-01-03.json
... (365 fichiers/an)
```

Structure partitionnée (style **Hive partition**) :

```text
s3://logs/year=2026/month=01/day=01/access.json
s3://logs/year=2026/month=01/day=02/access.json
s3://logs/year=2026/month=01/day=03/access.json
...
s3://logs/year=2026/month=02/day=01/access.json
```

### 5.2 — L'effet sur les requêtes

Une requête :

```sql
SELECT count(*) FROM logs WHERE year = 2026 AND month = 1 AND day = 1
```

- **Sans partition** : Athena scanne **tous les 365 fichiers** (~100 GB) → 0,50 $, ~30s.
- **Avec partition** : Athena ne scanne que `year=2026/month=01/day=01/` (~300 MB) → 0,0015 $, ~1s.

**Gain : 300×.**

### 5.3 — Schéma de partitionnement à choisir

Le choix dépend des requêtes typiques :

| Type de requête typique              | Partitionnement recommandé               |
| ------------------------------------ | ---------------------------------------- |
| Par date (`WHERE day = ...`)         | `year/month/day` (le standard)           |
| Par tenant (`WHERE tenant = ...`)    | `tenant_id/year/month/day`               |
| Par région (`WHERE region = ...`)    | `region/year/month/day`                  |
| Par utilisateur (cardinalité énorme) | **PAS** par user_id (trop de partitions) |
| Mix : par date + tenant              | `tenant_id/year/month/day`               |

**Bonne pratique** : viser **100-1000 partitions** par table en production. Plus → ralentit Glue Catalog. Moins → partitions trop grosses, scan inefficace.

### 5.4 — Conventions de partitionnement

**Convention Hive (préférée)** :

```text
s3://bucket/table/year=2026/month=05/day=17/file.parquet
                  └─ key=value séparé par /
```

Avantages :

- **Auto-détection** par Glue Crawler.
- **Lisible** depuis l'URL.
- **Standard** dans l'écosystème Hadoop.

**Convention non-Hive** (plus rare) :

```text
s3://bucket/table/2026/05/17/file.parquet
```

Demande de déclarer manuellement le mapping.

### 5.5 — Déclarer les partitions à Athena

Quand on crée une table, on déclare les colonnes partitionnées :

```sql
CREATE EXTERNAL TABLE logs (
  request_id string,
  status int,
  user_id string,
  duration_ms double
)
PARTITIONED BY (year int, month int, day int)
STORED AS PARQUET
LOCATION 's3://logs/'
TBLPROPERTIES ('classification' = 'parquet');
```

Puis charger les partitions :

**Option A — Manuelle** :

```sql
ALTER TABLE logs ADD PARTITION (year=2026, month=5, day=17)
  LOCATION 's3://logs/year=2026/month=05/day=17/';
```

**Option B — MSCK REPAIR** (Hive-style auto-discovery) :

```sql
MSCK REPAIR TABLE logs;
```

Scanne tous les préfixes et ajoute les partitions trouvées. Lent sur de gros volumes.

**Option C — Glue Crawler** (recommandé) :

Configurer un crawler (M6) qui scanne périodiquement le bucket et met à jour les partitions du Catalog.

**Option D — Partition Projection** (recommandé pour les patterns prévisibles) :

Au lieu de stocker les partitions dans Glue, Athena **calcule** les partitions à la volée selon une convention :

```sql
CREATE EXTERNAL TABLE logs (...)
PARTITIONED BY (year int, month int, day int)
LOCATION 's3://logs/'
TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.year.type' = 'integer',
  'projection.year.range' = '2020,2030',
  'projection.month.type' = 'integer',
  'projection.month.range' = '1,12',
  'projection.month.digits' = '2',
  'projection.day.type' = 'integer',
  'projection.day.range' = '1,31',
  'projection.day.digits' = '2',
  'storage.location.template' = 's3://logs/year=${year}/month=${month}/day=${day}/'
);
```

Plus de Glue partitions à maintenir, performance excellente. **Recommandé** pour les schémas prévisibles (logs datés).

---

## 6. Créer une table externe et requêter

### 6.1 — Le flow complet

1. Avoir des données dans S3 (CSV / JSON / Parquet).
2. Créer une **database Glue** (ou utiliser `default`).
3. Créer une **table externe** Athena pointant vers le préfixe S3.
4. (Si partitionnée) déclarer les partitions.
5. Requêter.

### 6.2 — Setup minimal — exemple complet

**Étape 1 — Uploader des fichiers test** :

```bash
BUCKET=my-tp-athena-$(date +%s)
aws s3 mb s3://$BUCKET --region eu-west-1

# CSV test
cat > /tmp/sales.csv <<EOF
date,product,qty,price
2026-01-15,A,10,9.99
2026-01-15,B,5,19.99
2026-01-16,A,3,9.99
2026-01-16,C,7,4.99
2026-02-01,A,8,9.99
EOF

aws s3 cp /tmp/sales.csv s3://$BUCKET/sales-csv/sales.csv
```

**Étape 2 — Créer la database Glue (via Athena)** :

```sql
CREATE DATABASE IF NOT EXISTS tp_athena;
```

**Étape 3 — Créer la table externe** :

```sql
CREATE EXTERNAL TABLE tp_athena.sales (
  date string,
  product string,
  qty int,
  price double
)
ROW FORMAT DELIMITED FIELDS TERMINATED BY ','
STORED AS TEXTFILE
LOCATION 's3://my-tp-athena-XXX/sales-csv/'
TBLPROPERTIES ('skip.header.line.count' = '1');
```

**Étape 4 — Requêter** :

```sql
SELECT product, SUM(qty * price) AS revenue
FROM tp_athena.sales
GROUP BY product
ORDER BY revenue DESC;
```

### 6.3 — Configuration — emplacement des résultats

Athena **stocke les résultats** de chaque requête dans un bucket S3 dédié (à configurer dans le **workgroup**) :

```bash
aws athena update-work-group \
  --work-group primary \
  --configuration-updates "ResultConfigurationUpdates={OutputLocation=s3://my-athena-results/}"
```

Si pas configuré : Athena refuse les requêtes. Bucket de résultats = obligatoire.

### 6.4 — Lancer une requête via CLI

```bash
QUERY_ID=$(aws athena start-query-execution \
  --query-string "SELECT count(*) FROM tp_athena.sales" \
  --result-configuration "OutputLocation=s3://my-athena-results/" \
  --query 'QueryExecutionId' --output text)

# Attendre la fin
aws athena wait query-execution-completed --query-execution-id $QUERY_ID

# Récupérer les résultats
aws athena get-query-results --query-execution-id $QUERY_ID
```

---

## 7. Coûts et optimisations

### 7.1 — Le modèle de tarification

**5 $/TB scanné** (cohérent dans toutes les régions). Pas de coût fixe — pay-per-query.

Plus on **scan**, plus on paye. **Réduire le scan** = optimiser à la fois performance ET coût.

### 7.2 — Les 5 leviers d'optimisation

| Levier                           | Gain typique                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| **1. Convertir CSV → Parquet**   | 5-10× moins de scan                                                        |
| **2. Partitionner**              | 10-1000× moins de scan                                                     |
| **3. Compresser** (Snappy, gzip) | 2-5× moins de scan                                                         |
| **4. Projection de colonnes**    | Implicite avec Parquet — sélectionner uniquement les colonnes nécessaires. |
| **5. Predicate pushdown**        | Implicite avec Parquet + bons filtres.                                     |

### 7.3 — Bonnes pratiques côté écriture S3

- **Taille de fichier** : viser **128 MB à 1 GB** par fichier. Trop petit → overhead, trop gros → moins de parallélisme.
- **Pas trop de petits fichiers** : Athena gère mal des millions de fichiers de 1 KB. Compacter périodiquement.
- **Compression Snappy** (par défaut Parquet) : équilibré rapide/dense.

### 7.4 — Limites importantes

- **30 minutes** par requête (timeout).
- **20 GB** de résultat par requête.
- **20 requêtes** simultanées par compte (relevable).
- **500 000 partitions** par table (limite Glue).

---

## 8. Pratique — Athena sur données partitionnées (item N1 + N2)

L'objectif : construire un pipeline complet **partitionné** + requête.

### 8.1 — Le scénario

On a des **logs applicatifs JSON** ingérés tous les jours dans S3. Structure :

```text
s3://my-logs/app=notes-api/year=2026/month=05/day=17/logs.json
s3://my-logs/app=notes-api/year=2026/month=05/day=18/logs.json
...
```

On veut requêter :

- Compter les erreurs par jour de mai 2026.
- Top 10 utilisateurs avec le plus d'actions.

### 8.2 — Générer des fichiers test

```bash
BUCKET=tp-athena-$(date +%s)
aws s3 mb s3://$BUCKET

for day in 15 16 17; do
  cat > /tmp/logs.json <<EOF
{"timestamp": "2026-05-${day}T08:00:00", "user": "alice", "action": "GET", "status": 200, "duration_ms": 42}
{"timestamp": "2026-05-${day}T08:01:00", "user": "alice", "action": "POST", "status": 201, "duration_ms": 87}
{"timestamp": "2026-05-${day}T08:02:00", "user": "bob", "action": "GET", "status": 500, "duration_ms": 250}
{"timestamp": "2026-05-${day}T09:00:00", "user": "carol", "action": "DELETE", "status": 200, "duration_ms": 65}
{"timestamp": "2026-05-${day}T10:00:00", "user": "bob", "action": "GET", "status": 200, "duration_ms": 35}
EOF
  aws s3 cp /tmp/logs.json s3://$BUCKET/app=notes-api/year=2026/month=05/day=${day}/logs.json
done
```

### 8.3 — Créer la table avec partition projection

```sql
CREATE EXTERNAL TABLE tp_athena.notes_logs (
  `timestamp` string,
  `user` string,
  action string,
  status int,
  duration_ms int
)
PARTITIONED BY (app string, year int, month int, day int)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://tp-athena-XXX/'
TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.app.type' = 'enum',
  'projection.app.values' = 'notes-api,notes-worker',
  'projection.year.type' = 'integer',
  'projection.year.range' = '2025,2030',
  'projection.month.type' = 'integer',
  'projection.month.range' = '1,12',
  'projection.month.digits' = '2',
  'projection.day.type' = 'integer',
  'projection.day.range' = '1,31',
  'projection.day.digits' = '2',
  'storage.location.template' = 's3://tp-athena-XXX/app=${app}/year=${year}/month=${month}/day=${day}/'
);
```

### 8.4 — Requêtes

**Compter les erreurs par jour** :

```sql
SELECT day, COUNT(*) AS errors
FROM tp_athena.notes_logs
WHERE app = 'notes-api'
  AND year = 2026
  AND month = 5
  AND status >= 500
GROUP BY day
ORDER BY day;
```

**Top 10 users** :

```sql
SELECT "user", COUNT(*) AS actions, AVG(duration_ms) AS avg_ms
FROM tp_athena.notes_logs
WHERE app = 'notes-api'
  AND year = 2026
GROUP BY "user"
ORDER BY actions DESC
LIMIT 10;
```

### 8.5 — Observer le scan

Dans l'historique des queries Athena, on voit **"Data scanned"**. Comparer :

- Sans filtre de partition (`WHERE year = ...`) : scan = TOUS les fichiers.
- Avec filtre de partition : scan = uniquement les fichiers du jour ciblé.

**Effet observable** : 10-100× moins de bytes scannés = 10-100× moins de coût.

---

## 9. Anti-patterns courants

| Anti-pattern                                                 | Conséquence                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| **Garder du CSV en prod** pour des données requêtées souvent | 10× plus cher en scan. Convertir en Parquet via CTAS.      |
| **Pas de partition** sur une table à fort volume.            | Scan total à chaque requête → facture qui explose.         |
| **Partition trop fine** (par user_id, par minute).           | Millions de partitions → Glue overloaded, requêtes lentes. |
| **Petits fichiers** (1 KB chacun, des millions).             | Overhead massif. Compacter régulièrement.                  |
| **Pas de bucket de résultats** configuré.                    | Requêtes refusées.                                         |
| **Pas de `LIMIT`** lors d'exploration.                       | Coûts inattendus, résultats énormes.                       |
| **Stocker secrets dans logs partitionnés**.                  | RGPD à risque.                                             |
| **Confondre Athena et Redshift**.                            | Mauvais outil pour le cas d'usage (M8 explique le choix).  |
| **Pas de Glue Crawler** ni Partition Projection.             | Partitions manuelles à maintenir, oublis fréquents.        |
| **Workgroups absents**.                                      | Pas de séparation entre équipes, pas de quota.             |

---

## 10. Exercices pratiques

### Exercice 1 — Premier setup Athena (≈ 30 min)

**Objectif.** Configurer le bucket de résultats + créer une première table.

**Étapes :**

1. Créer un bucket S3 pour les résultats Athena.
2. Configurer le workgroup `primary` avec ce bucket.
3. Uploader le `sales.csv` de la section 6.2.
4. Créer la database et la table.
5. Exécuter une première requête simple.

**Livrable.** Captures de la requête et du résultat.

### Exercice 2 — Convertir CSV → Parquet via CTAS (≈ 30 min)

**Objectif.** Apprécier le gain.

**Étapes :**

1. Sur la table `tp_athena.sales`, créer une version Parquet via `CTAS`.
2. Mesurer le **Data scanned** pour la même requête sur CSV puis Parquet.
3. Calculer le ratio.

**Livrable.** Comparaison + résultats.

### Exercice 3 — Table partitionnée avec Projection (≈ 60 min)

**Objectif.** L'exercice central du module.

**Étapes :** suivre la section 8 — créer les fichiers test partitionnés, créer la table avec Partition Projection, lancer des requêtes ciblées.

**Bonus :** mesurer le Data scanned avec/sans filtre de partition.

**Livrable.** Schéma S3 + table DDL + 2 requêtes + mesures.

### Exercice 4 — Federated Query (≈ 45 min, optionnel)

**Objectif.** Athena qui requête une autre source.

**Étapes :**

1. Activer le Athena Federated Query connector pour **DynamoDB** ou **RDS**.
2. Créer une `EXTERNAL CATALOG` pointant vers la source.
3. Requête : `SELECT * FROM <catalog>.<schema>.<table>` mixant data S3 et DDB.

**Livrable.** Capture du résultat hybride.

### Exercice 5 — Workgroup pour quota (≈ 30 min)

**Objectif.** Limiter le coût involontaire.

**Étapes :**

1. Créer un workgroup `tp-team`.
2. Configurer une **limite de bytes scannés** par requête (par ex. 100 MB).
3. Lancer une requête qui scannerait plus → doit être bloquée.

**Livrable.** Capture de la requête bloquée.

### Mini-défi — Audit CloudTrail via Athena (≈ 45 min)

**Cas.** Vous voulez répondre à : "Quels users ont fait des `DeleteObject` S3 sur le bucket prod-data dans le mois écoulé ?"

**Étapes :**

1. Identifier où sont stockés les logs CloudTrail S3 (typique `s3://aws-cloudtrail-logs-ACCOUNT-XXXX/AWSLogs/ACCOUNT/CloudTrail/REGION/YEAR/MONTH/DAY/`).
2. Créer la table Athena (AWS fournit le DDL standard pour CloudTrail).
3. Requêter pour répondre à la question.

**Livrable.** La requête + le résultat (réel ou mocké).

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Athena** et son modèle "Query-in-place".
- [ ] Citer le **moteur SQL** sous-jacent (Trino) et ses propriétés.
- [ ] Citer les **principaux formats supportés** (CSV, JSON, Parquet, ORC, Avro).
- [ ] Expliquer pourquoi **Parquet** est si supérieur à CSV (colonnaire, compression, projection, predicate pushdown).
- [ ] Citer **6 intégrations** d'Athena (S3, Glue, QuickSight, Lambda, federated query, BI tools).
- [ ] Définir le **partitionnement** Hive-style et son effet sur le scan.
- [ ] Citer les **3 manières** de déclarer les partitions (ALTER, MSCK, Crawler, Projection).
- [ ] Choisir un **schéma de partitionnement** pour des logs datés (year/month/day).
- [ ] **Créer une table externe Athena** depuis zéro de mémoire.
- [ ] Donner le **prix** d'Athena (5 $/TB) et les **5 leviers d'optimisation**.
- [ ] Citer **3 anti-patterns** courants.

### Items du glossaire visés

**N1 atteint** :

- _effectuer des requêtes avec Athena_ — sections 6 et 8.
- _formats de fichiers supportés par Athena_ — section 3.

**N2 atteint** :

- _services avec lesquels Athena peut s'intégrer_ — section 4.
- _type de moteur SQL fonctionnant derrière Athena (Trino)_ — section 2.
- _comment partitionner des données sur S3 via Athena_ — section 5.

---

## 12. Ressources complémentaires

### Documentation AWS

- [Athena User Guide](https://docs.aws.amazon.com/athena/latest/ug/what-is.html)
- [Supported file formats](https://docs.aws.amazon.com/athena/latest/ug/supported-formats.html)
- [Partitioning data](https://docs.aws.amazon.com/athena/latest/ug/partitions.html)
- [Partition Projection](https://docs.aws.amazon.com/athena/latest/ug/partition-projection.html)
- [Federated Query](https://docs.aws.amazon.com/athena/latest/ug/connect-to-a-data-source.html)
- [Pricing](https://aws.amazon.com/athena/pricing/)

### Outils

- [DBeaver](https://dbeaver.io/) avec JDBC Athena — meilleur client SQL gratuit.
- [Athena CLI](https://docs.aws.amazon.com/cli/latest/reference/athena/index.html)
- [SQLAlchemy / PyAthena](https://github.com/laughingman7743/PyAthena) — Python.

### Pour aller plus loin

- **M4 (EMR)** — pour des transformations Spark complexes.
- **M5 (Firehose)** — comment livrer des données nativement en Parquet partitionné.
- **M6-M7 (Glue)** — catalog + crawlers + ETL.
- **M8 (Comparatifs)** — Athena vs Redshift vs RDS.
- **Niveau 3** : Redshift Spectrum, QuickSight dashboards, X-Ray.
