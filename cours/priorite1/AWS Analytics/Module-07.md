# M7 — Glue Tarification et Bookmark

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir les **Glue ETL Jobs** : moteur Spark / Python Shell managé, types de jobs (Spark, Streaming, Python Shell, Ray), worker types (G.1X, G.2X, G.4X, G.8X, Z.2X).
- Expliquer le **modèle de tarification** de Glue ETL (DPU-heures, minimum facturé) et énoncer ses **limites** : tarif élevé par DPU-heure, minimum de 1 minute facturée, complexité du dimensionnement, lock-in (item N2 explicite).
- Définir l'**intérêt d'un job bookmark** dans Glue (item N2 explicite) : suivre les données déjà traitées pour ne pas les reprocesser → coût ↓, idempotence ↑, latence ↓.
- Comprendre les **trois modes de bookmark** : `Enable`, `Disable`, `Pause`, et savoir quand utiliser chacun.
- Mettre en place un **job Glue avec bookmark** end-to-end : script PySpark, source S3, sink Parquet, vérifier que les fichiers déjà traités sont ignorés au prochain run.
- Reconnaître les **patterns canoniques** (ETL incrémental quotidien, Catalog comme source, Spark UI debug) et les **anti-patterns** (job sans bookmark sur source qui croît, DPU surdimensionné, monolithe Spark).

## Durée estimée

1 jour.

## Pré-requis

- M6 (Glue Data Catalog et Crawlers).
- Bases PySpark : DataFrame, transformations, écriture Parquet.
- AWS CLI v2 avec permissions `glue:*`, `s3:*`, `iam:*`.
- Un bucket S3 avec des fichiers JSON/CSV organisés (réutiliser ceux de M6).

---

## 1. Glue ETL Jobs

### 1.1 — Vue d'ensemble

Un **Glue ETL Job** est un **script** (PySpark, Scala Spark ou Python pur) qui :

- Lit des données depuis une source (Glue Catalog, S3, JDBC, Kafka, …).
- Applique des **transformations** (filter, join, aggregate, dedup, mask).
- Écrit dans une destination (S3, Glue Catalog, JDBC, Redshift, …).

AWS provisionne dynamiquement un **cluster Spark** managé, exécute le script, puis le détruit. Pas de cluster à provisionner manuellement.

### 1.2 — Types de jobs

| Type                | Description                                         | Cas d'usage                                  |
| ------------------- | --------------------------------------------------- | -------------------------------------------- |
| **Spark**           | Apache Spark batch.                                 | ETL classique, dedup, joins, agrégations.    |
| **Spark Streaming** | Spark Structured Streaming sur Kinesis / Kafka.     | Pipelines streaming managés.                 |
| **Python Shell**    | Script Python pur (sans Spark) sur 0,0625 ou 1 DPU. | Petits jobs, orchestration, calls API tiers. |
| **Ray**             | Distributed Python via Ray.                         | ML training, simulations.                    |

Le type le plus courant en analytics : **Spark** (PySpark).

### 1.3 — Worker types

Pour les jobs Spark, on choisit un **worker type** (instance underlying) :

| Worker type | vCPU | Mémoire | Disk   | Cas d'usage                    |
| ----------- | ---- | ------- | ------ | ------------------------------ |
| **G.1X**    | 4    | 16 GB   | 64 GB  | Standard, défaut (DPU = 1).    |
| **G.2X**    | 8    | 32 GB   | 128 GB | Plus de mémoire (DPU = 2).     |
| **G.4X**    | 16   | 64 GB   | 256 GB | Charges intensives (DPU = 4).  |
| **G.8X**    | 32   | 128 GB  | 512 GB | Très gros workloads (DPU = 8). |
| **Z.2X**    | 8    | 64 GB   | 128 GB | Ray jobs (DPU = 2).            |

**1 DPU** = 4 vCPU + 16 GB RAM (unité de facturation).

### 1.4 — Anatomie d'un script PySpark Glue

```python
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.context import SparkContext

# Arguments
args = getResolvedOptions(sys.argv, ['JOB_NAME', 'source_db', 'source_table', 'target_path'])

# Init
sc = SparkContext()
gc = GlueContext(sc)
spark = gc.spark_session
job = Job(gc)
job.init(args['JOB_NAME'], args)

# Lire depuis Catalog (préféré)
df = gc.create_dynamic_frame.from_catalog(
    database=args['source_db'],
    table_name=args['source_table'],
)

# Transformer (exemple : filtrer status >= 500)
df_errors = Filter.apply(frame=df, f=lambda x: x['status'] >= 500)

# Écrire
gc.write_dynamic_frame.from_options(
    frame=df_errors,
    connection_type='s3',
    connection_options={'path': args['target_path'], 'partitionKeys': ['year', 'month']},
    format='parquet',
)

job.commit()
```

`job.init()` et `job.commit()` activent les bookmarks (section 4).

### 1.5 — Lancer un job

```bash
aws glue create-job \
  --name tp-etl-job \
  --role arn:aws:iam::ACCOUNT:role/AWSGlueServiceRole \
  --command "Name=glueetl,ScriptLocation=s3://my-scripts/etl.py,PythonVersion=3" \
  --glue-version "4.0" \
  --worker-type G.1X \
  --number-of-workers 2 \
  --default-arguments '{
    "--job-language": "python",
    "--enable-job-insights": "true",
    "--source_db": "tp_glue_db",
    "--source_table": "events",
    "--target_path": "s3://my-bucket/processed/"
  }'

# Démarrer
aws glue start-job-run --job-name tp-etl-job
```

---

## 2. Modèle de tarification (item N2)

C'est **l'item N2 explicite** : connaître la tarification.

### 2.1 — La formule

> **Coût = DPU-heures consommées × tarif horaire × max(1 min, durée réelle)**

| Type de job                        | Tarif (eu-west-1)  |
| ---------------------------------- | ------------------ |
| **Spark / Streaming**              | 0,44 $ / DPU-heure |
| **Python Shell**                   | 0,44 $ / DPU-heure |
| **Ray**                            | 0,44 $ / DPU-heure |
| **Glue Studio (notebook session)** | 0,44 $ / DPU-heure |

### 2.2 — Calcul concret

**Job Spark** : 2 workers G.1X (= 2 DPU) pendant 10 minutes :

``` txt
Coût = 2 DPU × (10/60) heures × 0,44 $/DPU-h = 2 × 0,1667 × 0,44 = 0,147 $
```

**Job qui dure 30s** (mais facturé minimum 1 min) : 2 × (1/60) × 0,44 = 0,015 $.

**Job lourd** : 20 workers G.2X (= 40 DPU) pendant 2 heures :

``` txt
Coût = 40 × 2 × 0,44 = 35,20 $
```

### 2.3 — Coûts annexes

- **Storage** Data Catalog : 1 $ / 100k objets / mois (négligeable).
- **Crawler runs** : 0,44 $/DPU-heure aussi (minimum 1 min).
- **Data Quality** rule sets : payant en plus depuis 2023.
- **Data transfer** : standard AWS (inter-AZ, internet egress).

### 2.4 — Limites du modèle de tarification (item N2 explicite)

C'est **l'autre item N2** : énoncer les **limites**.

| Limite                                                              | Explication                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Coût horaire élevé** (0,44 $/DPU-h)                               | ~25-50× plus cher qu'EC2 équivalent en self-managed.                                    |
| **Minimum 1 minute facturée**                                       | Les jobs < 1 min payent quand même 1 min. Pour des micro-jobs récurrents, accumulation. |
| **Pas d'auto-scaling pendant le job** (sauf Glue 3.0+ auto-scaling) | Mauvais dimensionnement initial = coût gaspillé.                                        |
| **Pas de spot instances** par défaut (sauf Glue Flex)               | Coût supérieur à un EMR Spot.                                                           |
| **Limites de DPU par compte** (default 100)                         | Pour très gros workloads : demande de relèvement.                                       |
| **Verrouillage AWS**                                                | API et conventions Glue spécifiques, moins portable que Spark pur.                      |
| **Cold start**                                                      | 1-3 min avant le démarrage du Spark cluster (managé).                                   |
| **Pas de partage de cluster** entre jobs                            | Chaque job = un cluster dédié. Pas de mutualisation.                                    |

**Glue Flex** (depuis 2022) : -34 % sur le tarif en échange de **délais de démarrage variables** (utilisation de capacité spare AWS). Pour les jobs **non urgents**.

```bash
aws glue start-job-run --job-name my-job \
  --arguments '{"--enable-spark-ui": "true"}' \
  --execution-class FLEX
```

### 2.5 — Glue vs EMR — quand basculer

| Critère                                   | Glue ETL                        | EMR Spark                                  |
| ----------------------------------------- | ------------------------------- | ------------------------------------------ |
| Démarrage rapide                          | 1-3 min                         | 5-10 min (cluster) ou < 1 min (Serverless) |
| Coût par job court (< 30 min)             | Compétitif                      | EMR Serverless souvent moins cher          |
| Coût pour gros workloads (> 1h, > 50 DPU) | **Cher**                        | **EMR moins cher** (surtout Spot)          |
| Provisioning                              | 0 (managé)                      | Moyen (EC2) ou 0 (Serverless)              |
| Customisation                             | Limitée (versions Spark figées) | Complète                                   |
| Catalog intégré                           | Natif                           | Catalog en option                          |

**Règle empirique** : si un job tourne **plus de 2h** et **plusieurs fois par jour**, **EMR** devient moins cher. Sinon, **Glue** reste pratique.

---

## 3. Job Bookmark — concept

### 3.1 — Le problème

Un job ETL **incrémental** consomme une source qui croît. Exemple : tous les jours à 1h du matin, lire `s3://logs/` et le transformer.

**Sans bookmark** : à chaque run, le job lit **tous les fichiers** (anciens + nouveaux). Conséquences :

- **Coût** ↑ : on paie le scan des anciens fichiers à chaque fois.
- **Idempotence** : on risque de **dédupliquer mal** ou de **réécrire** des données déjà traitées.
- **Latence** ↑ : le job prend plus longtemps que nécessaire.

### 3.2 — La solution — Job Bookmark

> Un **Job Bookmark** est un **état persistant** stocké par Glue qui mémorise **quelles données ont déjà été traitées** par un job. Au prochain run, le job ne traite que les **nouvelles données**.

Bookmarks supportés sur :

- **S3** (par chemin / timestamp / nom de fichier).
- **JDBC** (par valeur d'une colonne `bookmarkKey`).
- **DynamoDB** (par timestamp d'export).
- **Glue Catalog tables** (héritent du bookmark de leur source).

### 3.3 — Le mécanisme

Pour S3 :

```text
Run 1 (07h00) :
  - Bookmark vide.
  - Glue lit tous les fichiers existants : f1.json, f2.json, f3.json.
  - Job traite tout.
  - À job.commit() : bookmark sauvegarde {timestamp: 07h00, files: [f1, f2, f3]}.

Run 2 (08h00) :
  - Bookmark = {timestamp: 07h00, ...}.
  - Glue lit uniquement les fichiers postérieurs : f4.json, f5.json.
  - Job traite seulement les nouveaux.
  - À job.commit() : bookmark mis à jour.

Run 3 :
  - Glue lit uniquement les fichiers nouveaux depuis le dernier run.
  - ...
```

### 3.4 — Intérêt d'un job bookmark (item N2 explicite)

| Bénéfice               | Détail                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Coût ↓**             | Pas de re-traitement des anciens fichiers.                                       |
| **Idempotence**        | Pas de doublons en sortie.                                                       |
| **Latence ↓**          | Job plus rapide (lit moins).                                                     |
| **Simplicité**         | Pas à coder soi-même le suivi de progression.                                    |
| **Reprise sur erreur** | Si un run échoue, le bookmark ne commit pas → re-run reprend où on s'est arrêté. |
| **Compatible Catalog** | Fonctionne aussi avec source = table Catalog.                                    |

### 3.5 — Les 3 modes

| Mode        | Effet                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **Enable**  | Bookmark actif : seules les nouvelles données sont traitées.                                       |
| **Disable** | Bookmark inactif : toutes les données sont traitées (mode "full"). Pas de mise à jour du bookmark. |
| **Pause**   | Lit comme `Enable` mais **ne met pas à jour** le bookmark. Utile pour **rejouer** sans avancer.    |

Configurable au niveau **job** ou **par run** :

```bash
# Au niveau job
aws glue update-job --job-name my-job \
  --job-update '{
    "Command": {...},
    "DefaultArguments": {"--job-bookmark-option": "job-bookmark-enable"}
  }'

# Au niveau run
aws glue start-job-run --job-name my-job \
  --arguments '{"--job-bookmark-option": "job-bookmark-pause"}'
```

### 3.6 — Quand le bookmark échoue

Le bookmark **ne fonctionne pas** dans certains cas :

- **Fichiers réécrits** au même path : Glue voit le timestamp inchangé.
- **Fichiers avec timestamps incorrects** (ex : copie qui réinitialise).
- **Bucket S3 versionning** dans certaines configurations.
- **Sources non standard** (Kafka sans bookmark natif).

**Bonne pratique** : pour le streaming, utiliser **Spark Structured Streaming** avec checkpoint (mode Spark Streaming, pas batch).

---

## 4. Job bookmark — mise en pratique

### 4.1 — Activer le bookmark dans le script PySpark

```python
import sys
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext

# init avec args
args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
gc = GlueContext(sc)

# IMPORTANT : initialiser et commit Job pour activer le bookmark
job = Job(gc)
job.init(args['JOB_NAME'], args)

# Lecture (bookmark transparent)
df = gc.create_dynamic_frame.from_catalog(
    database="tp_glue_db",
    table_name="events",
    transformation_ctx="events_source",  # ← CRUCIAL : ID stable pour le bookmark
)

# Transformation
df_filtered = df.filter(lambda x: x['status'] >= 200)

# Écriture
gc.write_dynamic_frame.from_options(
    frame=df_filtered,
    connection_type='s3',
    connection_options={'path': 's3://my-bucket/processed/'},
    format='parquet',
    transformation_ctx="processed_sink",  # ← ID stable
)

# IMPORTANT : commit du bookmark
job.commit()
```

**Deux choses indispensables** :

1. `transformation_ctx` sur **chaque source/sink** — identifiant stable du contexte (sans ça, pas de bookmark).
2. `job.commit()` à la fin — sans ça, le bookmark n'est pas sauvegardé.

### 4.2 — Configurer le job

```bash
aws glue create-job \
  --name tp-bookmark-job \
  --role arn:aws:iam::ACCOUNT:role/AWSGlueServiceRole \
  --command "Name=glueetl,ScriptLocation=s3://my-scripts/bookmark.py,PythonVersion=3" \
  --glue-version "4.0" \
  --worker-type G.1X \
  --number-of-workers 2 \
  --default-arguments '{
    "--job-bookmark-option": "job-bookmark-enable",
    "--enable-metrics": "",
    "--enable-job-insights": "true"
  }'
```

L'argument `--job-bookmark-option job-bookmark-enable` est ce qui **active** le mécanisme.

### 4.3 — Vérifier l'état du bookmark

```bash
aws glue get-job-bookmark --job-name tp-bookmark-job
```

Sortie typique :

```json
{
  "JobBookmarkEntry": {
    "JobName": "tp-bookmark-job",
    "Version": 3,
    "Run": 2,
    "Attempt": 1,
    "JobBookmark": "{...état JSON...}"
  }
}
```

### 4.4 — Reset du bookmark

Si besoin de **re-traiter tout** :

```bash
aws glue reset-job-bookmark --job-name tp-bookmark-job
```

Le prochain run repartira de zéro.

---

## 5. Pratique — job Glue avec bookmark (item du glossaire)

L'objectif : faire tourner un job Glue **deux fois**, ajouter des fichiers entre les deux, et vérifier que **seuls les nouveaux** sont traités.

### 5.1 — Plan

1. Bucket S3 source + bucket destination.
2. Script PySpark avec bookmark.
3. Rôle IAM Glue.
4. Créer le job.
5. **Run 1** : traiter les fichiers initiaux.
6. Ajouter des nouveaux fichiers.
7. **Run 2** : traiter uniquement les nouveaux.
8. Vérifier.

### 5.2 — Étape 1 — Données initiales

```bash
SRC=tp-glue-src-$(date +%s)
DST=tp-glue-dst-$(date +%s)
aws s3 mb s3://$SRC --region eu-west-1
aws s3 mb s3://$DST --region eu-west-1

# Fichiers initiaux
for i in 1 2 3; do
  cat > /tmp/data$i.json <<EOF
{"id": $i, "user": "u-$i", "score": $((RANDOM % 100))}
EOF
  aws s3 cp /tmp/data$i.json s3://$SRC/raw/data$i.json
done
```

### 5.3 — Étape 2 — Script PySpark

```python
# bookmark_job.py
import sys
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext

args = getResolvedOptions(sys.argv, ['JOB_NAME', 'src_path', 'dst_path'])
gc = GlueContext(SparkContext())
job = Job(gc)
job.init(args['JOB_NAME'], args)

# Lire S3
df = gc.create_dynamic_frame.from_options(
    connection_type='s3',
    connection_options={'paths': [args['src_path']], 'recurse': True},
    format='json',
    transformation_ctx="src",
)

print(f"Records lus : {df.count()}")
df.toDF().show()

# Écrire en Parquet
gc.write_dynamic_frame.from_options(
    frame=df,
    connection_type='s3',
    connection_options={'path': args['dst_path']},
    format='parquet',
    transformation_ctx="dst",
)

job.commit()
```

Uploader dans S3 :

```bash
aws s3 cp bookmark_job.py s3://my-scripts/bookmark_job.py
```

### 5.4 — Étape 3 — Rôle IAM

(Réutiliser celui de M6 ou créer un similaire avec `AWSGlueServiceRole` + accès S3 aux deux buckets.)

### 5.5 — Étape 4 — Créer le job

```bash
aws glue create-job \
  --name tp-bookmark-job \
  --role arn:aws:iam::ACCOUNT:role/tp-glue-crawler-role \
  --command "Name=glueetl,ScriptLocation=s3://my-scripts/bookmark_job.py,PythonVersion=3" \
  --glue-version "4.0" \
  --worker-type G.1X \
  --number-of-workers 2 \
  --default-arguments "{
    \"--job-bookmark-option\": \"job-bookmark-enable\",
    \"--src_path\": \"s3://$SRC/raw/\",
    \"--dst_path\": \"s3://$DST/parquet/\"
  }"
```

### 5.6 — Étape 5 — Run 1

```bash
RUN_ID=$(aws glue start-job-run --job-name tp-bookmark-job --query 'JobRunId' --output text)

# Attendre la fin
aws glue wait job-run-succeeded --job-name tp-bookmark-job --run-id $RUN_ID

# Vérifier les fichiers parquet créés
aws s3 ls s3://$DST/parquet/ --recursive
# Devrait montrer 1-3 fichiers Parquet pour 3 records
```

Inspecter le bookmark :

```bash
aws glue get-job-bookmark --job-name tp-bookmark-job
```

### 5.7 — Étape 6 — Ajouter de nouveaux fichiers

```bash
# 3 nouveaux fichiers
for i in 4 5 6; do
  cat > /tmp/data$i.json <<EOF
{"id": $i, "user": "u-$i", "score": $((RANDOM % 100))}
EOF
  aws s3 cp /tmp/data$i.json s3://$SRC/raw/data$i.json
done
```

### 5.8 — Étape 7 — Run 2

```bash
RUN_ID2=$(aws glue start-job-run --job-name tp-bookmark-job --query 'JobRunId' --output text)
aws glue wait job-run-succeeded --job-name tp-bookmark-job --run-id $RUN_ID2

# Vérifier les logs CloudWatch — le job doit afficher "Records lus : 3" (uniquement les nouveaux !)
LOG_GROUP=/aws-glue/jobs/output
aws logs filter-log-events --log-group-name $LOG_GROUP --filter-pattern "Records lus"
```

**Observation clé** :

- Sans bookmark, le 2ᵉ run lirait **6 fichiers** (3 anciens + 3 nouveaux).
- Avec bookmark, il ne lit que **3 fichiers** (les nouveaux).

### 5.9 — Étape 8 — Tester le mode Pause

```bash
# Rejouer le 2ᵉ run en pause
aws glue start-job-run --job-name tp-bookmark-job \
  --arguments '{"--job-bookmark-option": "job-bookmark-pause"}'

# Lit les 3 derniers fichiers mais ne met PAS à jour le bookmark
```

### 5.10 — Cleanup

```bash
aws glue delete-job --job-name tp-bookmark-job
aws s3 rm s3://$SRC --recursive && aws s3 rb s3://$SRC
aws s3 rm s3://$DST --recursive && aws s3 rb s3://$DST
```

---

## 6. Anti-patterns

| Anti-pattern                                                    | Conséquence                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Job sans `transformation_ctx` sur les sources/sinks.            | Bookmark inactif silencieusement.                                |
| **Oublier `job.commit()`**.                                     | Bookmark non sauvegardé → re-traitement chaque run.              |
| **DPU surdimensionné** "par sécurité".                          | Coût × N.                                                        |
| **Run trop souvent** (toutes les minutes).                      | Minimum 1 min × 1440 × DPUs = facture qui explose.               |
| **Réécrire les fichiers** source au même path.                  | Bookmark croit que ce sont les mêmes → skip.                     |
| **Pas de monitoring** des Glue metrics CloudWatch.              | Échecs silencieux.                                               |
| **Streaming avec batch bookmark**.                              | Mauvais outil. Utiliser Spark Structured Streaming + checkpoint. |
| **Job Glue pour des transforms simples** (CSV → Parquet).       | Sur-coût vs Athena CTAS ou Firehose conversion.                  |
| **Cluster long-running EMR** quand un Glue Job ponctuel suffit. | Sur-coût inverse.                                                |
| **Pas de Flex** sur les jobs non urgents.                       | -34 % de coût manqués.                                           |

---

## 7. Exercices pratiques

### Exercice 1 — Premier job Glue (≈ 45 min)

**Objectif.** Setup d'un job basique.

**Étapes :**

1. Créer un job Glue qui lit un CSV en S3 et écrit du Parquet partitionné.
2. Lancer le job manuellement.
3. Mesurer la durée et le coût.

**Livrable.** Logs + capture des fichiers Parquet créés.

### Exercice 2 — Job avec bookmark (≈ 60 min)

**Objectif.** L'item central du glossaire.

**Étapes :** suivre la section 5 — créer le job avec bookmark, run 1, ajout de fichiers, run 2, vérifier l'effet.

**Livrable.** Logs CloudWatch montrant les counts différents entre run 1 et run 2.

### Exercice 3 — Mode Pause (≈ 20 min)

**Objectif.** Comprendre les 3 modes.

**Étapes :**

1. Sur le job de l'exercice 2, lancer en mode `pause` après avoir ajouté de nouveaux fichiers.
2. Constater que le job lit comme un run normal mais le bookmark n'avance pas.
3. Re-lancer en mode `enable` → traite les mêmes fichiers.

**Livrable.** Logs avant/après.

### Exercice 4 — Reset bookmark (≈ 15 min)

**Objectif.** Maîtriser le reset.

**Étapes :**

1. `aws glue reset-job-bookmark --job-name ...`.
2. Re-lancer : doit traiter TOUS les fichiers.

**Livrable.** Comparaison des counts.

### Exercice 5 — Comparaison de coûts (≈ 30 min, papier)

**Objectif.** Maîtriser la facturation.

Estimer le coût mensuel pour ces 3 scénarios :

1. Job Glue Spark **2 workers G.1X**, **10 min**, **1×/jour**.
2. Idem mais **24×/jour** (toutes les heures).
3. **5 workers G.2X**, **30 min**, **24×/jour**.

**Livrable.** Tableau avec calcul détaillé.

### Mini-défi — Architecture ETL incrémentale (≈ 30 min)

**Cas.** Logs S3 ingérés via Firehose, 50 GB/jour, format JSON.

**Concevoir** :

1. Crawler quotidien ou pas ?
2. Job Glue avec bookmark ? Quel schedule ?
3. Conversion vers Parquet partitionné comment ?
4. Estimation de coût mensuel.

**Livrable.** Schéma + budget.

---

## 8. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un **Glue ETL Job** et ses 4 types.
- [ ] Citer les **worker types** Spark (G.1X, G.2X, G.4X) et la définition d'un **DPU**.
- [ ] Énoncer la **formule de tarification** Glue (DPU × heures × 0,44 $).
- [ ] Citer **3 limites** du modèle de tarification.
- [ ] Définir un **Job Bookmark** et son **intérêt**.
- [ ] Citer les **3 modes** (Enable, Disable, Pause).
- [ ] Activer un bookmark dans un script PySpark (`transformation_ctx`, `job.init`, `job.commit`).
- [ ] **Reseter** un bookmark.
- [ ] Distinguer **Glue Spark** et **Spark Structured Streaming** pour les cas streaming.
- [ ] Quand basculer de **Glue à EMR** pour des raisons de coût.
- [ ] Citer **3 anti-patterns** Glue.

### Items du glossaire visés

**N2 atteint** :

- _limites du modèle de tarification de Glue_ — section 2.4.
- _intérêt d'un job bookmark dans Glue_ — sections 3 et 4.

---

## 9. Ressources complémentaires

### Documentation AWS

- [Glue ETL Jobs](https://docs.aws.amazon.com/glue/latest/dg/author-job.html)
- [Job Bookmarks](https://docs.aws.amazon.com/glue/latest/dg/monitor-continuations.html)
- [Worker types & DPU](https://docs.aws.amazon.com/glue/latest/dg/add-job.html)
- [Glue Flex](https://docs.aws.amazon.com/glue/latest/dg/run-jobs-flex.html)
- [Glue pricing](https://aws.amazon.com/glue/pricing/)

### Patterns

- [AWS Glue Best Practices](https://aws.amazon.com/blogs/big-data/category/analytics/aws-glue/)
- [Glue + Step Functions](https://aws.amazon.com/step-functions/use-cases/data-processing/)

### Pour aller plus loin

- **M8 (Comparatifs)** — Athena vs Redshift vs Aurora.
- **Niveau 3** : Glue auto-scaling, Spark UI debug, Glue Schema Registry, data quality rule sets, scaling streaming jobs.
- **AWS Lake Formation** — gouvernance fine sur Glue Catalog.
