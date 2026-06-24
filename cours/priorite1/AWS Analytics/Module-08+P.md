# M8 — Comparatifs analytics

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Positionner les **principaux services analytics et bases AWS** : **Athena**, **Redshift**, **EMR**, **RDS**, **Aurora**, **DynamoDB**, **OpenSearch**, **QuickSight**, **Lake Formation**.
- Expliquer la **différence entre Redshift et Aurora/RDS** (item N2 explicite) : OLAP vs OLTP, MPP colonnaire vs row-store, échelle, modèle de tarification, cas d'usage typiques.
- Expliquer la **dimension serverless** des services analytics AWS (item N2 explicite) : pay-per-use, scaling automatique, démarrage instant, implications opérationnelles (pas de tuning, pas de provisioning, contraintes sur la prévisibilité du coût et sur les latences cold start).
- Construire une **matrice de choix** pour 2 cas d'usage concrets en pondérant : latence, volume, fréquence, complexité opérationnelle, coût, équipe.
- Mettre en place le **mini-projet final du parcours AWS Analytics** : pipeline complet **S3 → Glue crawler → Athena**, avec **alerting CloudWatch** sur un seuil de coût ou de volume.
- Reconnaître les **patterns d'architecture data** modernes (data lakehouse, Medallion, ELT vs ETL) et les **anti-patterns** (Redshift pour de l'OLTP, RDS pour de l'analytique massive, …).

## Durée estimée

1 à 2 jours, mini-projet final inclus.

## Pré-requis

- M1-M7 (CloudWatch, Athena, EMR, Firehose, Glue Catalog, Glue ETL).
- AWS CLI v2 avec permissions analytics complètes.
- Idéalement : avoir suivi le parcours **AWS Identity** (KMS pour le chiffrement des données) et un peu de **SQL**.

---

## 1. Pourquoi comparer

### 1.1 — Le problème

AWS propose **plus de 15 services** "data/analytics". Sans grille de lecture, on ne sait pas lequel utiliser et **on cumule les erreurs** :

- Mettre du transactionnel sur Athena → 30s par requête, frustrant.
- Mettre de l'analytique sur RDS → bloque la prod transactionnelle.
- Choisir Redshift sans le justifier → 1 000+ $/mois inutiles.
- Confondre Aurora et Aurora Serverless → mauvaise courbe de coût.

### 1.2 — Les questions à se poser

Pour **chaque** workload data, 5 questions structurent le choix :

1. **OLTP ou OLAP ?** (transactionnel vs analytique).
2. **Volume** : Mo, Go, To, Po ?
3. **Latence cible** : < 10 ms, < 1 s, < 30 s ?
4. **Fréquence de requêtes** : 1 par jour, 100 par seconde ?
5. **Prévisibilité** : charge régulière ou pics imprévisibles ?

Ce module donne les **outils** pour répondre.

---

## 2. Les acteurs analytics AWS — panorama

### 2.1 — Bases OLTP (transactionnelles)

| Service                                                  | Type                           | Cas d'usage                          |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| **RDS** (PostgreSQL, MySQL, MariaDB, Oracle, SQL Server) | Row-store SGBD                 | Apps transactionnelles classiques.   |
| **Aurora** (PG / MySQL compatible)                       | Row-store distribué AWS-native | Idem mais perf et scale supérieures. |
| **Aurora Serverless v2**                                 | Idem mais scaling auto         | Apps à charge variable.              |
| **DynamoDB**                                             | Key-Value NoSQL                | Apps haute scalabilité, < 10ms.      |
| **DocumentDB**                                           | Document JSON                  | Mongo-compatible.                    |
| **ElastiCache** (Redis, Memcached)                       | Cache in-memory                | Cache de session, leaderboards.      |

### 2.2 — Bases OLAP / analytics

| Service                 | Type                   | Cas d'usage                                      |
| ----------------------- | ---------------------- | ------------------------------------------------ |
| **Athena**              | Serverless SQL on S3   | Requêtes ad hoc sur data lake (M3).              |
| **Redshift**            | MPP columnar DW        | Data warehouse always-on, dashboards récurrents. |
| **Redshift Serverless** | Idem mais pay-per-use  | Charges variables, démarrage rapide.             |
| **Redshift Spectrum**   | Redshift qui lit S3    | Hybrider DW + data lake.                         |
| **EMR**                 | Cluster Spark/Hive     | ETL massif, ML, custom (M4).                     |
| **OpenSearch**          | Search + log analytics | Recherche full-text, dashboards Kibana.          |

### 2.3 — ETL / orchestration / lake

| Service                  | Rôle                                              |
| ------------------------ | ------------------------------------------------- |
| **Glue**                 | Catalog + crawlers + ETL (M6-M7).                 |
| **Data Firehose**        | Livraison managée streams → S3/destinations (M5). |
| **Kinesis Data Streams** | Log distribué (parcours Kinesis).                 |
| **MSK** (Kafka managé)   | Streaming Kafka.                                  |
| **Step Functions**       | Orchestration workflows.                          |
| **EventBridge**          | Bus d'événements.                                 |
| **Lake Formation**       | Gouvernance / permissions fines sur data lake.    |

### 2.4 — BI / consommation

| Service                           | Rôle                                   |
| --------------------------------- | -------------------------------------- |
| **QuickSight**                    | BI / dashboards managés.               |
| **Tableau / Power BI** (via JDBC) | BI tiers branchés à Athena / Redshift. |
| **SageMaker**                     | ML platform.                           |

### 2.5 — Schéma d'architecture data moderne

```text
┌──────────────────────────────────────────────────────────────────┐
│ INGESTION                                                        │
│  Firehose / Kinesis / DMS / MSK / direct PUT                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ STORAGE — Data Lake S3                                           │
│  - raw/   (JSON, CSV)                                            │
│  - silver/ (Parquet partitionné)                                 │
│  - gold/  (agrégats curés)                                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ CATALOG — Glue Data Catalog                                      │
│  Schemas + partitions + lineage                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │  Athena  │   │   EMR    │   │ Redshift │
       │ ad hoc   │   │ ETL/ML   │   │ Spectrum │
       └────┬─────┘   └──────────┘   └────┬─────┘
            │                              │
            ▼                              ▼
       ┌──────────────────────────────────────┐
       │ QuickSight / BI tools / Apps          │
       └───────────────────────────────────────┘
```

---

## 3. Redshift vs Aurora/RDS (item N2 explicite)

C'est **l'item N2 majeur** : maîtriser la différence.

### 3.1 — Une distinction structurelle — OLTP vs OLAP

| Aspect             | **OLTP** (RDS, Aurora)             | **OLAP** (Redshift)                     |
| ------------------ | ---------------------------------- | --------------------------------------- |
| **Acronyme**       | Online Transaction Processing      | Online Analytical Processing            |
| **Workload**       | Beaucoup de petites transactions   | Peu de grosses requêtes analytiques     |
| **Pattern**        | `INSERT user/order/payment...`     | `SELECT SUM(...) GROUP BY ... JOIN ...` |
| **Latence cible**  | < 10 ms                            | < 30 s (acceptable)                     |
| **Concurrency**    | Milliers de connexions simultanées | Dizaines de queries lourdes             |
| **Storage layout** | Row-store                          | **Columnar store** (MPP)                |

### 3.2 — Architecture sous le capot

**RDS / Aurora** (OLTP) :

- **Row-store** : une ligne complète est stockée contiguement (toutes les colonnes ensemble).
- Optimisé pour : `INSERT`, `UPDATE`, `SELECT * FROM users WHERE id = 42`.
- **Indexation** par colonne pour speed-up des lookups.
- Aurora : storage distribué sur 6 copies en 3 AZ, scaling horizontal des read replicas.

**Redshift** (OLAP) :

- **Columnar store** : les valeurs d'une même colonne sont stockées ensemble.
- Optimisé pour : `SELECT col1, SUM(col2) FROM huge_table GROUP BY col1` — ne lit que les colonnes utilisées.
- **Compression colonne** (très efficace, ratio 3-10×).
- **MPP** (Massively Parallel Processing) : le cluster distribue les données entre nodes ; chaque node calcule sa portion ; le leader agrège.

### 3.3 — Cas d'usage typique

**Aurora / RDS** :

- Backend d'une app web (users, orders, payments).
- Transactions ACID critiques (banque, e-commerce).
- Petite analytique (jusqu'à quelques TB) **partagée** avec l'OLTP.

**Redshift** :

- Data warehouse d'entreprise.
- Dashboards BI sur **TB à PB** de données.
- Requêtes complexes sur historiques longs.
- Analyse marketing, financière, opérationnelle.

### 3.4 — Tableau comparatif détaillé

| Critère                 | **RDS / Aurora**             | **Redshift**                        |
| ----------------------- | ---------------------------- | ----------------------------------- |
| Type de workload        | OLTP transactionnel          | OLAP analytique                     |
| Architecture            | Row-store                    | Columnar MPP                        |
| Volume typique          | GB à quelques TB             | TB à PB                             |
| Latence d'une requête   | < 10 ms (avec index)         | secondes à minutes                  |
| Throughput              | Milliers de TPS              | Dizaines de queries concurrentes    |
| ACID transactions       | **Oui**                      | Oui (mais moins fines)              |
| Schéma                  | Normalisé (3NF)              | Dénormalisé (star/snowflake schema) |
| Joins de tables énormes | Limité                       | **Excellent** (MPP)                 |
| Agrégations             | Coûteuses                    | **Excellentes**                     |
| Indexation              | B-tree, GIN, GiST            | Sort keys + dist keys               |
| Tarification            | Per instance/h ou Serverless | Per node/h ou Serverless            |
| Démarrage               | Instance always-on           | Cluster always-on (ou Serverless)   |
| Backup                  | Snapshots auto               | Snapshots auto                      |
| Cas d'usage             | Backend app                  | Data warehouse, BI                  |

### 3.5 — Pour les anti-confusions courantes

**Aurora a un mode "data warehouse" ?** Non. Aurora reste row-store. Pour de l'analytique massive, **Redshift Spectrum** ou Athena.

**Redshift fait de l'OLTP ?** Possible mais terrible pour de petites transactions. **Ne pas le faire.**

**Aurora Serverless v2 fait du analytique scalable ?** Non — c'est Aurora qui scale CPU/mémoire dynamiquement, toujours row-store.

### 3.6 — Coût comparatif (ordre de grandeur)

Pour ~1 TB de données + queries modérées :

- **Aurora MySQL** : ~600 $/mois (1 writer + 1 reader, db.r5.xlarge).
- **RDS PostgreSQL** : ~400 $/mois.
- **Redshift Provisioned** : ~1 800 $/mois (1 node ra3.xlplus).
- **Redshift Serverless** : ~50-200 $/mois selon usage.
- **Athena** : ~5-50 $/mois selon requêtes (le moins cher pour usage ad hoc).

→ Redshift est **plus cher** pour de petits workloads ; **moins cher au TB** sur des very-large datasets.

---

## 4. La dimension serverless (item N2 explicite)

C'est l'**autre item N2 majeur** : comprendre les implications du serverless en analytics.

### 4.1 — Qu'est-ce que "serverless"

> Un service **serverless** facture l'usage réel (requêtes, GB scannés, DPU-heures) et **ne demande aucun provisioning** d'infrastructure côté client.

Trois conséquences typiques :

- **Pay-per-use** : 0 $ quand inactif.
- **Scaling automatique** : monte et descend en fonction de la charge.
- **Démarrage rapide** (mais pas instantané).

### 4.2 — Services analytics serverless AWS

| Service                     | Mode serverless natif                                  |
| --------------------------- | ------------------------------------------------------ |
| **Athena**                  | 100 % serverless, pay-per-TB scanné.                   |
| **Glue ETL / Crawlers**     | 100 % serverless, pay-per-DPU-heure.                   |
| **EMR Serverless**          | 100 % serverless, pay-per-vCPU-h + GB-h.               |
| **Redshift Serverless**     | Depuis 2022, pay-per-RPU-h (Redshift Processing Unit). |
| **Aurora Serverless v2**    | Pay-per-ACU-h (Aurora Capacity Unit).                  |
| **Lambda**                  | Pay-per-invocation + GB-s.                             |
| **DynamoDB On-Demand**      | Pay-per-request.                                       |
| **OpenSearch Serverless**   | Pay-per-OCU-h.                                         |
| **Data Firehose**           | Pay-per-GB ingéré.                                     |
| **EventBridge / SQS / SNS** | Pay-per-message.                                       |
| **QuickSight**              | Pay-per-user-month ou per-session.                     |

### 4.3 — Les **implications** opérationnelles

| Implication                  | Détail                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| **Pas de tuning d'infra**    | Pas de master node, pas de réplication à configurer.                |
| **Pas de capacity planning** | Pas besoin d'estimer "combien de RAM pour mes pics".                |
| **Démarrage rapide**         | Athena : ms. Redshift Serverless : 1-30 s. Aurora Serverless : 1 s. |
| **Auto-scaling**             | Monte / descend selon la charge.                                    |
| **Pay-per-use** = 0 $ idle   | Idéal pour workloads variables / sporadiques.                       |
| **Idempotence**              | Pas d'état persistant à gérer (pour la plupart).                    |

### 4.4 — Les **conséquences** — ce qu'il faut accepter

| Conséquence                           | Détail                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| **Coût peu prévisible** à fort volume | Une mauvaise requête peut coûter 100 $ d'un coup.            |
| **Latence cold start**                | Lambda, Redshift Serverless : 1-30s au premier appel.        |
| **Limites silencieuses**              | Plafonds par compte/région à connaître (throttling).         |
| **Moins de tuning fin**               | Pas de "tweak ce paramètre Hadoop" possible.                 |
| **Lock-in AWS**                       | Migrer vers une autre cloud demande de re-architecter.       |
| **Charges très récurrentes**          | Peut être **plus cher** que provisionné en charge constante. |

### 4.5 — Quand serverless gagne / perd

| Charge                         | Serverless | Provisionné |
| ------------------------------ | ---------- | ----------- |
| Sporadique (1×/jour, < 1 min)  | **Gagne**  | Perd        |
| Variable (jour vs nuit)        | **Gagne**  | Perd        |
| Saisonnier (peak Black Friday) | **Gagne**  | Perd        |
| Continu (24/7) sur années      | Perd       | **Gagne**   |
| Très haut débit prévisible     | Perd       | **Gagne**   |
| POC / exploration              | **Gagne**  | Perd        |
| Latence sub-seconde exigée     | Dépend     | **Gagne**   |

### 4.6 — Pattern hybride

Il est courant d'utiliser **les deux** :

- **Charge baseline** : provisionné (Redshift cluster always-on, RDS, EMR cluster fixe).
- **Charge variable / pics** : serverless (Lambda, Athena, Redshift Serverless burst).

---

## 5. La matrice de décision

### 5.1 — Les 5 dimensions

Pour chaque besoin analytics, scorer :

| Dimension               | 1 (min)       | 5 (max)                   |
| ----------------------- | ------------- | ------------------------- |
| **Volume**              | < 10 GB       | > 100 TB                  |
| **Latence cible**       | < 10 ms       | tolère plusieurs min      |
| **Fréquence**           | quotidien     | 1000 req/s                |
| **Complexité requêtes** | Lookup simple | Joins/agrégations massifs |
| **Budget**              | minimal       | élevé acceptable          |

### 5.2 — Matrice indicative

| Profil                              | Outil recommandé                             |
| ----------------------------------- | -------------------------------------------- |
| Lookup transactionnel rapide        | DynamoDB / RDS / Aurora                      |
| App backend "all-in-one"            | RDS PostgreSQL ou Aurora                     |
| Charge variable, lightweight        | Aurora Serverless v2                         |
| Recherche full-text / logs récents  | OpenSearch                                   |
| Logs / events archivés, ad hoc      | **S3 + Athena**                              |
| Dashboards BI récurrents            | **Redshift** ou Redshift Serverless          |
| Dashboards BI ad hoc                | **Athena + QuickSight**                      |
| ETL incrémental simple              | **Glue ETL avec bookmark** (M7)              |
| ETL massif Spark / ML               | **EMR**                                      |
| Streaming ingestion → S3            | **Firehose**                                 |
| Streaming temps réel multi-consumer | **Kinesis Data Streams**                     |
| Stream processing                   | Kinesis Data Analytics, MSK, Spark Streaming |

### 5.3 — Méthode rapide en 3 questions

``` md
1. Est-ce de l'OLTP transactionnel critique ?
   → Aurora / RDS / DynamoDB
   → STOP

2. Est-ce des requêtes ad hoc sur du data lake ?
   → Athena (cas dominant)
   → STOP

3. Est-ce un dashboard BI récurrent sur grosse volumétrie ?
   → Redshift (cluster ou Serverless selon variabilité)
   → STOP

Sinon :
- ETL complexe → EMR ou Glue
- Search → OpenSearch
- Streaming → Kinesis / MSK
```

---

## 6. Patterns d'architecture data

### 6.1 — Le data lakehouse

Le **lakehouse** combine la **flexibilité du data lake** (S3) avec la **performance du data warehouse** (Redshift / Iceberg / Delta) :

- **Bronze** (raw) : ingestion brute, format origine.
- **Silver** (cleaned) : Parquet partitionné, schéma stabilisé.
- **Gold** (curated) : tables agrégées prêtes pour la BI.

Athena, Spark et Redshift Spectrum consomment ces couches.

### 6.2 — ELT vs ETL

- **ETL** (Extract / Transform / Load) : transformer **avant** de charger. Pattern classique pour DW.
- **ELT** (Extract / Load / Transform) : charger brut, transformer **dans** le DW. Plus moderne, mieux adapté à Redshift et Snowflake.

### 6.3 — Médaillon

Pattern (popularisé par Databricks) qui structure le data lake :

```text
ingestion → bronze → silver → gold → consumption
            (raw)   (clean)  (curated)
```

S'applique parfaitement à S3 + Glue + Athena.

---

## 7. Mini-projet final du parcours AWS Analytics

**Mini-projet final** = pipeline **S3 → Glue crawler → Athena**, avec **alerting CloudWatch** sur seuil de coût/volume.

### 7.1 — Énoncé

Vous êtes responsable d'une plateforme **analytics events utilisateurs** :

- Une app génère des **events JSON** uploadés régulièrement dans S3.
- Vous devez :
  - **Cataloger** automatiquement les events (Glue Crawler).
  - **Permettre des requêtes SQL** via Athena.
  - **Mettre en place une alerte** CloudWatch sur **coût** ou **volume** quand un seuil est dépassé.

### 7.2 — Architecture cible

```text
┌──────────────┐
│ App (mock    │
│  data        │
│  generator)  │
└──────┬───────┘
       │
       │ upload JSON
       ▼
┌──────────────┐
│  S3 bucket   │
│  events/     │
│  year/month/ │
│  day/        │
└──────┬───────┘
       │
       │ scan
       ▼
┌─────────────────┐     ┌──────────────────┐
│ Glue Crawler    │ ──► │ Glue Catalog     │
│ (schedule daily)│     │ database/table   │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Athena           │
                        │ SELECT ...       │
                        └──────────────────┘
                                 │
                                 │ scanned bytes
                                 ▼
                        ┌──────────────────┐
                        │ CloudWatch       │
                        │ Athena metrics   │
                        │ + custom alarm   │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ SNS Topic        │
                        │ → email          │
                        └──────────────────┘
```

### 7.3 — Plan en 7 étapes

1. **Bucket S3** pour les events.
2. **Générateur de données** (script Python ou Lambda) qui pousse des JSON partitionnés.
3. **Rôle IAM Glue** + **Database Glue**.
4. **Crawler Glue** avec schedule quotidien.
5. **Workgroup Athena** avec **quota par requête** (sécurité coût).
6. **Alarme CloudWatch** sur :
   - Volume : `DataScannedInBytes` (Athena metric) > N GB par requête / par jour.
   - **OU** Coût : un budget AWS Budgets avec alerte.
7. **Tests** : pousser des données, run crawler, exécuter requêtes, déclencher l'alerte.

### 7.4 — Étape 1 — Bucket S3 + données

```bash
BUCKET=tp-analytics-final-$(date +%s)
aws s3 mb s3://$BUCKET --region eu-west-1

# Générer 3 jours de données
for day in 15 16 17; do
  cat > /tmp/events.json <<EOF
{"event_id": "e-${day}-1", "user_id": "u1", "type": "click", "ts": "2026-05-${day}T08:00:00", "value": 12.50}
{"event_id": "e-${day}-2", "user_id": "u2", "type": "purchase", "ts": "2026-05-${day}T08:01:00", "value": 199.00}
{"event_id": "e-${day}-3", "user_id": "u3", "type": "click", "ts": "2026-05-${day}T08:02:00", "value": 0.00}
{"event_id": "e-${day}-4", "user_id": "u1", "type": "view", "ts": "2026-05-${day}T08:03:00", "value": 0.00}
EOF
  aws s3 cp /tmp/events.json s3://$BUCKET/events/year=2026/month=05/day=${day}/events.json
done

aws s3 ls s3://$BUCKET/events/ --recursive
```

### 7.5 — Étape 2 — Glue Crawler

(Reprendre le pattern de M6, section 7.)

```bash
# Rôle + database + crawler (cf. M6)
aws glue create-database --database-input '{"Name": "analytics_final"}'

aws glue create-crawler \
  --name analytics-events-crawler \
  --role arn:aws:iam::ACCOUNT:role/tp-glue-crawler-role \
  --database-name analytics_final \
  --targets "{\"S3Targets\": [{\"Path\": \"s3://$BUCKET/events/\"}]}" \
  --schedule "cron(0 1 * * ? *)"

# Run immédiat pour initialiser
aws glue start-crawler --name analytics-events-crawler

# Attendre
while [ "$(aws glue get-crawler --name analytics-events-crawler --query 'Crawler.State' --output text)" = "RUNNING" ]; do
  sleep 10
done

aws glue get-tables --database-name analytics_final \
  --query 'TableList[].{Name:Name, Cols:StorageDescriptor.Columns[].Name, Parts:PartitionKeys[].Name}'
```

### 7.6 — Étape 3 — Workgroup Athena avec quota

```bash
aws athena create-work-group \
  --name analytics-final-wg \
  --configuration '{
    "ResultConfiguration": {"OutputLocation": "s3://'$BUCKET'/athena-results/"},
    "EnforceWorkGroupConfiguration": true,
    "PublishCloudWatchMetricsEnabled": true,
    "BytesScannedCutoffPerQuery": 1073741824
  }' \
  --description "TP analytics final — limited to 1 GB/query"
```

`BytesScannedCutoffPerQuery: 1073741824` = 1 GB max scanné par requête → bloque les requêtes qui dépasseraient.

`PublishCloudWatchMetricsEnabled: true` → métriques Athena disponibles dans CloudWatch.

### 7.7 — Étape 4 — Requêtes

```sql
-- Compter par jour
SELECT day, COUNT(*) AS events
FROM analytics_final.events
WHERE year = 2026 AND month = 5
GROUP BY day
ORDER BY day;

-- Revenu par user
SELECT user_id, SUM(value) AS revenue
FROM analytics_final.events
WHERE type = 'purchase'
GROUP BY user_id;
```

### 7.8 — Étape 5 — SNS Topic pour notifications

```bash
TOPIC_ARN=$(aws sns create-topic --name analytics-final-alerts --query 'TopicArn' --output text)
aws sns subscribe --topic-arn $TOPIC_ARN --protocol email --notification-endpoint you@example.com
# Confirmer l'email reçu
```

### 7.9 — Étape 6 — Alarme CloudWatch sur volume scanné

Athena publie la métrique `ProcessedBytes` par workgroup :

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "athena-workgroup-high-scan" \
  --alarm-description "Total bytes scanned exceeds 10 GB in 1h" \
  --namespace AWS/Athena \
  --metric-name ProcessedBytes \
  --dimensions Name=WorkGroup,Value=analytics-final-wg \
  --statistic Sum \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 10737418240 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions $TOPIC_ARN
```

→ Alerte si **plus de 10 GB scannés** en 1 h sur ce workgroup.

### 7.10 — Étape 7 — Alarme alternative — AWS Budgets

Pour une alerte sur **coût AWS** plutôt que volume scanné :

```bash
aws budgets create-budget \
  --account-id ACCOUNT \
  --budget '{
    "BudgetName": "athena-monthly-cost",
    "BudgetLimit": {"Amount": "50", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {"Service": ["Amazon Athena"]}
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "you@example.com"}]
    }
  ]'
```

→ Alerte par email quand le coût Athena mensuel dépasse **80 % de 50 $ = 40 $**.

### 7.11 — Tests

1. **Test du quota workgroup** : lancer une requête sur une table énorme → doit être bloquée par `BytesScannedCutoffPerQuery`.
2. **Test de l'alarme volume** : lancer plusieurs requêtes pour cumuler > 10 GB scannés en 1 h → email reçu.
3. **Test du crawler quotidien** : ajouter une partition `day=18`, attendre le run de demain matin, vérifier que la partition apparaît.

### 7.12 — Livrables attendus

Un **dépôt Git** contenant :

- **Code** :
  - `infra/` : Terraform / CLI scripts pour tout créer.
  - `mock-producer.py` : générateur de données mockées.
- **Documentation** (3-5 pages) :
  - Section 1 — Architecture (schéma + description).
  - Section 2 — Choix techniques (justification Athena vs alternatives, partitionnement, format).
  - Section 3 — Coûts estimés (Glue, Athena, S3, alerting).
  - Section 4 — Configuration du crawler (schedule, classifiers).
  - Section 5 — Configuration des alertes (volume, coût).
  - Section 6 — Tests effectués + captures.
  - Section 7 — Limites et évolutions.

### 7.13 — Critères de validation

- [ ] Pipeline fonctionnel : on pousse des events, on les requête.
- [ ] Crawler **scheduled** et exécutable manuellement, schéma découvert automatiquement.
- [ ] Workgroup Athena avec **quota par requête**.
- [ ] **Au moins une alarme** opérationnelle (volume **ou** coût).
- [ ] **Email** reçu lors du test de l'alerte.
- [ ] Doc structurée comme indiqué.

### 7.14 — Cleanup

```bash
aws glue delete-crawler --name analytics-events-crawler
aws glue delete-table --database-name analytics_final --name events
aws glue delete-database --name analytics_final
aws athena delete-work-group --work-group analytics-final-wg --recursive-delete-option
aws cloudwatch delete-alarms --alarm-names athena-workgroup-high-scan
aws sns delete-topic --topic-arn $TOPIC_ARN
aws budgets delete-budget --account-id ACCOUNT --budget-name athena-monthly-cost
aws s3 rm s3://$BUCKET --recursive && aws s3 rb s3://$BUCKET
```

---

## 8. Exercices pratiques

### Exercice 1 — Matrice de choix sur 2 cas (≈ 30 min, papier)

**Cas A.** Une startup gère 100k utilisateurs avec :

- Backend transactionnel (orders, payments).
- Dashboards internes (CA mensuel, top clients).
- Audit log de toutes les actions admin.

**Cas B.** Une plateforme e-commerce :

- Catalogue produits (100 GB, lectures massives).
- Sessions utilisateurs (10 millions/jour).
- BI temps réel sur ventes.
- Recherche full-text sur catalogue.

**Livrable.** Pour chaque cas :

- Quelle base OLTP ?
- Quelle solution analytics ?
- Serverless ou provisionné ? Pourquoi ?
- Budget mensuel estimé.

### Exercice 2 — Comparer un workload réel (≈ 45 min)

**Objectif.** Faire le même calcul sur Athena vs Redshift Serverless.

**Cas.** 1 TB de données Parquet, 100 requêtes/jour, 1 GB scanné par requête en moyenne.

**Calcul** :

- Athena : 100 × 1 GB × 30 jours × 0,005 $/GB = **~15 $/mois**.
- Redshift Serverless : base RPU × heures actives = à estimer.

**Livrable.** Tableau comparatif + recommandation.

### Exercice 3 — Mini-projet final (≈ 1-2 jours)

**Objectif.** Suivre la section 7 — pipeline complet S3 → Crawler → Athena + alerting.

**Livrable.** Repo Git + doc + captures.

### Exercice 4 — Tester l'alerte volume (≈ 20 min)

**Objectif.** Voir l'alerte fonctionner.

**Étapes :**

1. Sur le mini-projet, lancer une requête `SELECT * FROM ...` sur une grosse table (ou répéter une requête lourde).
2. Cumuler > 10 GB scannés en 1 h.
3. Vérifier la réception de l'email.

**Livrable.** Capture email + extrait CloudWatch.

### Mini-défi — Plan multi-année (≈ 30 min, papier)

**Cas.** Une entreprise prévoit la croissance suivante :

- Année 1 : 100 GB de données analytics.
- Année 3 : 10 TB.
- Année 5 : 100 TB.

**Concevoir** un **plan d'évolution** des choix techniques :

- An 1 : quels services ?
- An 3 : qu'est-ce qui change ?
- An 5 : architecture mature ?

**Livrable.** Plan en 3 phases + budget mensuel par phase.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Positionner **10 services** AWS data/analytics et leur cas d'usage principal.
- [ ] Distinguer **OLTP** et **OLAP** sur 5 axes.
- [ ] Énoncer la **différence Redshift vs Aurora/RDS** (row-store vs columnar, OLTP vs OLAP, volumes, latence).
- [ ] Décrire le **mode columnar MPP** et son avantage en analytics.
- [ ] Définir **serverless** dans le contexte analytics AWS.
- [ ] Citer **5 services analytics serverless** AWS.
- [ ] Énoncer les **implications** du serverless (scaling auto, pay-per-use, démarrage rapide).
- [ ] Énoncer les **conséquences** du serverless (coût peu prévisible, cold start, limites, lock-in).
- [ ] Construire une **matrice de choix** pour un cas donné.
- [ ] Décrire un **data lakehouse** et le pattern **medallion**.
- [ ] Mettre en place un **pipeline S3 → Crawler → Athena + alerting**.

### Items du glossaire visés

**N2 atteint** :

- _différence entre Redshift et Aurora / RDS_ — section 3.
- _dimension serverless des services AWS Analytics (implications, conséquences)_ — section 4.

À l'issue du mini-projet final, l'apprenant atteint le niveau **Confirmé 2** ciblé par le parcours **AWS Analytics**.

**Pour aller plus loin (N3, non couvert)** :

- Dashboards CloudWatch & métriques custom.
- EMR clusters hébergement avancé.
- Transformations Firehose via Lambda.
- Glue Schema Registry, structure des bases Glue, scaling de jobs.
- Redshift Spectrum, QuickSight dashboards.
- AWS X-Ray pour profiling.

---

## 10. Ressources complémentaires

### Documentation AWS

- [Amazon Redshift Developer Guide](https://docs.aws.amazon.com/redshift/latest/dg/welcome.html)
- [Aurora vs Redshift comparison](https://aws.amazon.com/blogs/database/comparing-amazon-aurora-and-amazon-redshift/)
- [Redshift Serverless](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-whatis.html)
- [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [Athena Workgroups](https://docs.aws.amazon.com/athena/latest/ug/manage-queries-control-costs-with-workgroups.html)
- [AWS Budgets](https://docs.aws.amazon.com/awsaccountbillingocs/latest/aboutv2/budgets-managing-costs.html)

### Patterns

- [AWS Well-Architected — Analytics Lens](https://docs.aws.amazon.com/wellarchitected/latest/analytics-lens/welcome.html)
- [Lakehouse architecture on AWS](https://aws.amazon.com/blogs/big-data/category/analytics/)
- [Modern Data Architecture](https://aws.amazon.com/big-data/datalakes-and-analytics/modern-data-architecture/)

### Synthèse du parcours

Le parcours **AWS Analytics** se referme avec ce mini-projet. À ce stade :

- **M1** — CloudWatch Logs : observabilité textuelle.
- **M2** — CloudWatch Alerting : observabilité métrique + alerting.
- **M3** — Athena : SQL serverless sur S3.
- **M4** — EMR : Spark/Hadoop managé.
- **M5** — Data Firehose : livraison managée.
- **M6** — Glue Catalog + Crawlers : metastore central + découverte automatique.
- **M7** — Glue ETL Jobs : transformations Spark, bookmarks, tarification.
- **M8** (ce module) — Comparatifs + mini-projet final.

L'apprenant est désormais **Confirmé N2** sur AWS Analytics — capable de **concevoir, déployer, opérer et alerter** sur un pipeline analytics AWS de production complet, en orchestrant **ingestion → catalog → requêtage → observabilité → contrôle des coûts**.
