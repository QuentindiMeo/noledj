# M4 — EMR

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS EMR** (Elastic MapReduce) comme la plateforme **big data managée** d'AWS, son **intérêt** (Hadoop / Spark managé sans opérer le cluster soi-même) et son positionnement par rapport à Athena, Glue, Databricks.
- Citer les **technologies supportées** par EMR : **Spark**, **Hive**, **Presto / Trino**, **HBase**, **Flink**, **Hudi**, **Jupyter**, **Zeppelin**, et savoir laquelle utiliser pour quel cas (item N2 explicite).
- Distinguer les **trois modes de déploiement** : **EMR on EC2** (cluster classique), **EMR Serverless** (depuis 2022), **EMR on EKS** (cluster Kubernetes).
- Définir **EMR Studio** : un IDE web basé sur Jupyter / Workspaces pour développer et exécuter des notebooks et des scripts (Spark, Hive, Presto) sur un cluster EMR.
- **Exécuter un script** Spark / Hive depuis EMR Studio (item N1 explicite) : créer un workspace, attacher un cluster, lancer un notebook.
- Reconnaître les **patterns d'usage** (ETL massif, ML sur gros volumes, exploration interactive) et les **anti-patterns** (utiliser EMR pour des cas où Athena ou Glue suffisent).

## Durée estimée

1 jour.

## Pré-requis

- M1-M3 (CloudWatch Logs, Alerting, Athena).
- Bases Python ou SQL (pour les notebooks Spark / Hive).
- Notions de **big data** : ce qu'est un cluster Hadoop, MapReduce, Spark. Une intro courte est donnée en section 1.
- AWS CLI v2 avec permissions `elasticmapreduce:*`, `iam:*` (pour les rôles de cluster).

---

## 1. Pourquoi EMR

### 1.1 — Le problème — au-delà des limites d'Athena

Athena (M3) est excellent pour des **requêtes SQL sur S3**, mais a ses limites :

- **Pas d'algorithmique** : pas de boucle, pas d'ML, pas d'UDFs Python avancées.
- **Pas de transformations stateful complexes** : pas de Spark RDD, pas de DataFrame Python.
- **Limite 30 min** par requête.
- **Pas d'écriture en place** : pas de UPDATE/DELETE classique (Iceberg/Delta partiels en v3).
- **Pas de streaming**.

Pour ces cas, **EMR** offre un cluster **Apache Spark / Hadoop / Flink** managé.

### 1.2 — EMR en une phrase

> **AWS EMR** (Elastic MapReduce) est un service qui **provisionne et opère des clusters big data managés** (Spark, Hadoop, Hive, Presto, Flink, …) sur AWS, en **quelques minutes**, sans devoir installer ni maintenir l'infrastructure Hadoop.

Trois propriétés clés :

- **Provisionning rapide** : un cluster prêt en **5-10 minutes**.
- **Auto-scaling** : ajouter / retirer des nodes à la volée.
- **Intégration AWS** : S3, Glue Catalog, EMRFS, IAM, KMS.

### 1.3 — L'intérêt de la plateforme (item N2)

C'est l'**item N2 explicite** : expliquer l'**intérêt d'EMR**.

| Bénéfice                              | Détail                                                               |
| ------------------------------------- | -------------------------------------------------------------------- |
| **Pas d'opération Hadoop**            | Pas d'install, pas de patching, pas de tuning JVM. AWS gère.         |
| **Coût optimisé**                     | Spot instances, auto-scaling, clusters transient (créer pour 1 job). |
| **Multi-techno** dans un même cluster | Spark + Hive + Presto sur le même hardware.                          |
| **Intégration S3** native (EMRFS)     | Pas besoin de HDFS local, S3 est le storage par défaut.              |
| **Glue Data Catalog**                 | Les tables Hive sont partagées avec Athena.                          |
| **EMR Studio**                        | IDE web pour développer sans SSH au cluster.                         |
| **Versions managées**                 | AWS maintient des releases stables d'Hadoop/Spark/etc.               |

Sans EMR, monter un cluster Spark "à la main" :

- Provisionner des EC2.
- Installer JVM, Hadoop, Spark.
- Configurer le réseau Hadoop (YARN, HDFS).
- Maintenir les configurations.
- Patcher les vulnérabilités.

→ **3-6 mois** d'engineering, **équipe dédiée**, peu de valeur métier.

### 1.4 — L'analogie de la cuisine

- **Athena** = un robot de cuisine pré-réglé pour quelques recettes (SQL).
- **Glue** (M6-M7) = un robot ETL avec quelques recettes pré-faites (transformations standard).
- **EMR** = une **cuisine équipée complète** avec tous les ustensiles (Spark, Hive, Flink…). On choisit, on cuisine, on paye à l'usage horaire.
- **EMR Serverless** = la même cuisine, mais on paye uniquement le temps où on cuisine (vs locataire à l'année).

### 1.5 — Quand utiliser EMR vs autres

| Besoin                                             | Outil recommandé                             |
| -------------------------------------------------- | -------------------------------------------- |
| Requête SQL ad hoc sur S3                          | **Athena**.                                  |
| ETL périodique simple (CSV → Parquet, dedup, join) | **Glue ETL** (M6-M7).                        |
| ETL Spark complexe, ML, streaming                  | **EMR Spark**.                               |
| Cluster Hadoop / Hive existant à migrer            | **EMR**.                                     |
| Exploration interactive avec notebooks             | **EMR Studio** ou **SageMaker Studio**.      |
| ML sur très gros volumes (TB+)                     | **EMR PySpark** ou **SageMaker**.            |
| Streaming temps réel sur Kafka/Kinesis             | **EMR Flink** ou **Kinesis Data Analytics**. |
| Cas serverless ponctuel                            | **EMR Serverless**.                          |
| Charge récurrente à forte volumétrie               | **EMR cluster** ou **Databricks**.           |

---

## 2. Les technologies supportées par EMR (item N2)

C'est **l'item N2 majeur** : connaître les technologies disponibles.

### 2.1 — Vue d'ensemble

Une **release EMR** (par exemple, EMR 7.x) regroupe un ensemble de technologies maintenues et compatibles entre elles.

| Catégorie                  | Technologies typiques                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| **Compute SQL/batch**      | **Spark**, **Hive**, **Presto / Trino**, **Tez**, **Pig**              |
| **Streaming**              | **Spark Streaming**, **Flink**                                         |
| **NoSQL / KV**             | **HBase**                                                              |
| **Workflow**               | **Oozie**, **Airflow** (en EMR EKS)                                    |
| **Notebooks / IDE**        | **Jupyter**, **Zeppelin**, **EMR Studio**                              |
| **Stockage / Format**      | **HDFS**, **EMRFS** (S3), **Apache Hudi**, **Iceberg**, **Delta Lake** |
| **Sécurité / Métadonnées** | **Ranger**, **Glue Data Catalog**, **Hive Metastore**                  |
| **ML**                     | **MLlib** (Spark), **XGBoost on Spark**                                |

### 2.2 — Spark — la techno phare

**Apache Spark** est utilisé dans 80 % des clusters EMR. Trois APIs principales :

- **Spark SQL** : moteur SQL distribué, DataFrame API.
- **Spark Core / RDD** : transformations distribuées low-level.
- **Spark Structured Streaming** : streaming via micro-batches.
- **MLlib** : algorithmes ML distribués (régression, k-means, ALS, …).
- **GraphX** : traitement de graphes.

Cas d'usage : ETL massif, ML, exploration, streaming.

### 2.3 — Hive — SQL sur HDFS / S3

**Apache Hive** : moteur SQL initial du monde Hadoop. Compile le SQL en jobs MapReduce ou Tez.

- **Avantage** : excellent pour des **transformations batch lourdes** longues.
- **Limite** : plus lent que Spark SQL pour des requêtes courtes.

Sur EMR, Hive utilise souvent Glue Catalog comme metastore.

### 2.4 — Presto / Trino — SQL interactif

Identique au moteur d'Athena (cf. M3). Sur EMR, **Presto sur cluster dédié** permet :

- Plus de **contrôle** (workers dimensionnés, configurations custom).
- Plus rapide à **stable load** que Athena qui scale tout seul.
- Coût **prévisible** (pay-per-instance plutôt que pay-per-TB scanné).

Cas d'usage : organisation qui pousse beaucoup de requêtes SQL avec un cluster always-on plus économique qu'Athena.

### 2.5 — Flink — streaming

**Apache Flink** : moteur de streaming réel (true streaming, vs micro-batch Spark).

- Latence plus faible.
- Stateful processing avancé.
- Cas d'usage : trading, fraud detection, IoT temps réel.

Alternative serverless : **Kinesis Data Analytics** (= Flink managé sans cluster).

### 2.6 — HBase — KV distribué

**Apache HBase** : base NoSQL colonnaire (modèle Bigtable).

- Cas d'usage : très haut volume, accès random à des milliards de rows.
- Alternative AWS-native : **DynamoDB** (en général préférable).

HBase sur EMR : rare en pratique, mais possible pour migrer un setup on-premise.

### 2.7 — Notebooks — Jupyter, Zeppelin

- **Jupyter** : notebooks Python (la norme moderne).
- **Zeppelin** : alternative orientée big data (Scala, Spark, Hive).

Aujourd'hui, **EMR Studio** (section 4) remplace ces outils en mode managé.

### 2.8 — Choix de release

Une release EMR fige les versions :

``` log
EMR 7.0 : Spark 3.5, Hive 3.1, Presto 0.290, Flink 1.18, ...
EMR 6.15 : Spark 3.4, Hive 3.1, Trino 426, ...
EMR 5.36 : Spark 2.4, Hive 2.3, Presto 0.244, ... (legacy)
```

À choisir selon les compatibilités requises. **Privilégier la dernière release majeure** pour un nouveau projet.

---

## 3. Les trois modes de déploiement

EMR a **3 façons** de provisionner les ressources.

### 3.1 — EMR on EC2 — le mode historique

Un **cluster d'EC2** (master + worker nodes) provisionné directement.

```text
┌──────────────┐
│ Master node  │  (1 EC2 — orchestration)
└──────────────┘
       │
┌──────┴───────┬───────────┐
│              │           │
▼              ▼           ▼
┌──────┐  ┌──────┐  ┌──────┐
│Worker│  │Worker│  │Worker│
└──────┘  └──────┘  └──────┘
```

- **Pay-per-second** par EC2.
- **Auto-scaling** activable.
- **Bootstrap actions** : scripts custom à l'install.
- **Cluster transient** : créer pour un job, détruire à la fin (économique).
- **Cluster long-running** : pour des charges récurrentes.

**Cas d'usage** : besoin de contrôle fin, customisations, charges connues.

### 3.2 — EMR Serverless (depuis 2022)

Pas de cluster à provisionner. On définit une **application EMR Serverless** (Spark ou Hive), on **soumet des jobs**, AWS alloue les ressources automatiquement.

- **Pay-per-job-second** (vCPU-h + GB-h).
- Démarrage **rapide** (~10s pour le premier, instant après).
- **Auto-tune** selon le job.
- **Pas de cluster à dimensionner** : juste min/max workers.

**Cas d'usage** : jobs ad hoc, workflows variables, équipes sans expertise Hadoop.

### 3.3 — EMR on EKS

EMR tourne sur un cluster **Kubernetes (EKS)**. Permet de partager le cluster K8s avec d'autres workloads (apps, services).

- Granularité fine au niveau des pods.
- Partage de ressources Kubernetes avec d'autres charges.
- Demande maîtrise Kubernetes.

**Cas d'usage** : organisations déjà fortement K8s qui veulent unifier la stack.

### 3.4 — Tableau de choix

| Mode               | Pour quoi                                         | Coût        |
| ------------------ | ------------------------------------------------- | ----------- |
| **EMR on EC2**     | Charges long-running, customisations, batch lourd | Pay-per-EC2 |
| **EMR Serverless** | Jobs ad hoc, simplicité, variabilité              | Pay-per-job |
| **EMR on EKS**     | Org K8s, unification compute, multi-tenant fin    | Pay-per-pod |

Pour ce module, on se concentre sur **EMR on EC2** + **Serverless** (les deux dominants).

---

## 4. EMR Studio

### 4.1 — Définition

**EMR Studio** est un **IDE web** intégré à AWS, basé sur **Jupyter Lab**, qui permet de :

- Créer des **workspaces** (environnements de développement).
- Attacher un workspace à un **cluster EMR** (EC2 ou Serverless).
- Développer des **notebooks** Jupyter (Python, SQL, Spark, Hive).
- Exécuter sur le cluster sans SSH ni accès direct.
- Versionner via **Git**.

### 4.2 — Architecture

```text
┌────────────────────────────────────────────┐
│  Utilisateur (navigateur)                   │
└──────────────────┬──────────────────────────┘
                   │ HTTPS + IAM Identity Center / SAML
                   ▼
┌────────────────────────────────────────────┐
│  EMR Studio (web IDE Jupyter)               │
│  - Workspaces                                │
│  - Notebooks (.ipynb stockés en S3)          │
│  - Git integration                           │
└──────────────────┬──────────────────────────┘
                   │ Submit code (Livy / Spark Connect)
                   ▼
┌────────────────────────────────────────────┐
│  Cluster EMR (EC2 ou Serverless)             │
│  - Exécute le code Spark/Hive/Presto         │
│  - Lit/écrit S3                              │
└────────────────────────────────────────────┘
```

### 4.3 — Création d'EMR Studio — pas à pas

```bash
# 1. Créer un bucket S3 pour le storage Studio
aws s3 mb s3://my-emr-studio-storage --region eu-west-1

# 2. Créer le rôle IAM pour Studio (service role)
aws iam create-role --role-name EMRStudioServiceRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "elasticmapreduce.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attacher la policy managée
aws iam attach-role-policy --role-name EMRStudioServiceRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEMRFullAccessPolicy_v2

# 3. Créer EMR Studio
aws emr create-studio \
  --name my-emr-studio \
  --auth-mode IAM \
  --vpc-id vpc-0xxx \
  --subnet-ids subnet-0xxx subnet-0yyy \
  --service-role arn:aws:iam::ACCOUNT:role/EMRStudioServiceRole \
  --user-role arn:aws:iam::ACCOUNT:role/EMRStudioUserRole \
  --workspace-security-group-id sg-0xxx \
  --engine-security-group-id sg-0yyy \
  --default-s3-location s3://my-emr-studio-storage/
```

(Plus simple via la console pour la première fois.)

### 4.4 — Mode d'authentification

Deux modes :

- **IAM** : authentification via IAM users / Identity Center (recommandé en production).
- **IAM Identity Center** : federation SSO.

### 4.5 — Workspace — l'unité de travail

Un **workspace** :

- Stockage de notebooks dans S3.
- Possibilité d'attacher à un ou plusieurs clusters EMR.
- Partage entre utilisateurs (collaboration).
- Versioning Git optionnel.

### 4.6 — Limites et coûts

- EMR Studio est **gratuit**.
- Vous payez **uniquement** le cluster EMR ou l'application Serverless sous-jacente.
- Le storage S3 des notebooks est facturé normal (~0,023 $/GB/mois).

---

## 5. Pratique — Exécuter un script depuis EMR Studio (item N1)

L'objectif : suivre un workflow complet pour exécuter un job Spark depuis EMR Studio.

### 5.1 — Le scénario

On a un **CSV de 10 millions de lignes** dans S3 : `s3://my-data/sales.csv`. On veut :

1. Le lire avec Spark.
2. Filtrer les ventes 2026.
3. Calculer le top 10 produits par revenu.
4. Écrire le résultat en Parquet partitionné.

### 5.2 — Étape 1 — Créer un cluster EMR (mode EC2 ou Serverless)

**Option A — Cluster EC2 transient** :

```bash
aws emr create-cluster \
  --name "tp-emr-cluster" \
  --release-label emr-7.0.0 \
  --applications Name=Spark Name=Hive \
  --instance-groups \
      InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m5.xlarge \
      InstanceGroupType=CORE,InstanceCount=2,InstanceType=m5.xlarge \
  --use-default-roles \
  --log-uri s3://my-emr-logs/ \
  --ec2-attributes "SubnetId=subnet-0xxx" \
  --auto-terminate
```

**Option B — Application EMR Serverless** :

```bash
APP_ID=$(aws emr-serverless create-application \
  --name tp-spark-app \
  --type SPARK \
  --release-label emr-7.0.0 \
  --query 'applicationId' --output text)

# Démarrer l'application
aws emr-serverless start-application --application-id $APP_ID
```

### 5.3 — Étape 2 — Créer le workspace EMR Studio

Via la console : Studios → Workspaces → Create Workspace.

Configurer :

- Nom : `tp-workspace`
- Description : "TP Spark sales analysis"
- Default S3 location : `s3://my-emr-studio-storage/workspaces/`

### 5.4 — Étape 3 — Attacher au cluster

Dans le workspace, **Compute → Attach** → choisir le cluster EMR (EC2 ou Serverless).

### 5.5 — Étape 4 — Créer un notebook PySpark

Nouveau notebook → Kernel **PySpark**.

```python
# Cell 1 — Lire le CSV
from pyspark.sql.functions import col, sum as Fsum, year as Fyear, to_date

df = spark.read.csv(
    "s3://my-data/sales.csv",
    header=True,
    inferSchema=True,
)
df.printSchema()
df.show(5)
```

```python
# Cell 2 — Filtrer et agréger
sales_2026 = (
    df.withColumn("date_d", to_date(col("date")))
      .filter(Fyear(col("date_d")) == 2026)
)

top10 = (
    sales_2026
      .withColumn("revenue", col("qty") * col("price"))
      .groupBy("product")
      .agg(Fsum("revenue").alias("total_revenue"))
      .orderBy(col("total_revenue").desc())
      .limit(10)
)

top10.show()
```

```python
# Cell 3 — Écrire en Parquet partitionné par produit
(sales_2026
   .withColumn("revenue", col("qty") * col("price"))
   .withColumn("month", Fyear(col("date_d")))  # ou month
   .write
   .mode("overwrite")
   .partitionBy("product")
   .parquet("s3://my-data/sales-2026-parquet/")
)
```

### 5.6 — Étape 5 — Observer

- **Spark UI** : depuis le workspace, ouvrir Spark UI pour voir les jobs / stages / tasks.
- **CloudWatch logs** : les logs du cluster sont écrits dans `s3://my-emr-logs/`.

### 5.7 — Étape 6 — Cleanup

**Important** : terminer le cluster ou stopper l'application pour ne pas continuer à payer.

```bash
# Si cluster EC2 (non auto-terminated)
aws emr terminate-clusters --cluster-ids j-XXX

# Si Serverless
aws emr-serverless stop-application --application-id $APP_ID
aws emr-serverless delete-application --application-id $APP_ID
```

---

## 6. Coûts

### 6.1 — EMR on EC2

- **Frais EMR par instance/h** : ~25 % du prix EC2 (par exemple, m5.xlarge On-Demand 0,192 $ + 0,048 $ EMR = 0,24 $/h).
- **Frais EC2** : selon types.
- **Frais Spot** : 50-80 % de réduction sur EC2 — **fortement recommandé** pour les workers.

Exemple : cluster 1 master m5.xlarge + 5 workers m5.2xlarge spot pendant 2h = ~3-5 $.

### 6.2 — EMR Serverless

- **Per-job** : vCPU-h × 0,052 $ + GB-h × 0,0057 $.
- Pas de coût fixe.

Exemple : job utilisant 16 vCPU × 1h + 32 GB × 1h = 0,832 + 0,182 ≈ **1 $/job**.

### 6.3 — Optimisations

- **Spot instances** pour les workers (jamais le master).
- **Auto-scaling** activé.
- **Auto-terminate** quand le job finit.
- **Auto-pause** sur Serverless (15 min idle).
- **Lire/écrire en Parquet** dès que possible (réduit volume scanné).

---

## 7. Anti-patterns

| Anti-pattern                                                                  | Conséquence                                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cluster EMR EC2 **long-running** pour un job d'une heure/jour                 | 95 % du temps inutilisé. Préférer cluster **transient** ou Serverless. |
| Utiliser **EMR pour ce qu'Athena fait mieux** (SQL ad hoc).                   | Sur-engineering, sur-coût.                                             |
| **Master en Spot** instances.                                                 | Si le Spot est récupéré → cluster mort.                                |
| **Pas d'auto-terminate** ni de monitoring.                                    | Facture qui explose en oublii (vraie story : 5000 $ pour un weekend).  |
| **Notebook attaché à un cluster always-on** pour de l'exploration ponctuelle. | Sous-utilisation.                                                      |
| Stocker des **données critiques sur HDFS** du cluster.                        | Cluster terminé = data perdue. Préférer S3 (EMRFS).                    |
| Utiliser **EMR 5.x** sur un nouveau projet.                                   | Versions Spark/Hive obsolètes. Privilégier EMR 7.x.                    |
| **Pas de Glue Catalog** comme metastore.                                      | Tables Hive isolées, pas de partage avec Athena.                       |
| Utiliser **EMR Serverless** pour des charges très récurrentes.                | Cluster EC2 réservé peut être moins cher.                              |

---

## 8. Exercices pratiques

### Exercice 1 — Lancer un cluster EMR transient (≈ 30 min)

**Objectif.** Premier cluster.

**Étapes :**

1. Créer un petit cluster EMR EC2 (1 master + 1 worker m5.xlarge) avec Spark.
2. Soumettre un job Spark (via step ou EMR Studio).
3. Vérifier dans CloudWatch / logs S3 que le job a tourné.
4. Auto-terminer le cluster.

**Livrable.** Capture de la console EMR montrant le cluster terminé.

### Exercice 2 — EMR Studio + notebook (≈ 60 min)

**Objectif.** L'item N1 explicite.

**Étapes :** suivre la section 5 — créer Studio, workspace, attacher cluster, notebook PySpark.

**Bonus :** modifier le notebook pour calculer une métrique supplémentaire (par exemple, revenu mensuel).

**Livrable.** Capture du notebook avec sorties.

### Exercice 3 — EMR Serverless (≈ 30 min)

**Objectif.** Toucher le mode serverless.

**Étapes :**

1. Créer une application EMR Serverless type SPARK.
2. Soumettre un job (script PySpark uploadé en S3).
3. Observer la durée et le coût (CloudWatch metrics).
4. Stopper l'application.

**Livrable.** Capture de l'application avec le job historique.

### Exercice 4 — Comparer EMR Spark vs Athena (≈ 45 min)

**Objectif.** Choisir le bon outil.

**Setup.** Une table partitionnée Parquet en S3 (réutiliser celle de M3).

**Étapes :**

1. Exécuter la même requête (`SELECT product, SUM(revenue) FROM sales GROUP BY product`) :
   - Via **Athena** : noter durée + scan bytes + prix estimé.
   - Via **EMR Spark** : noter durée + coût cluster estimé.
2. Comparer.
3. Conclusion : quand EMR vaut le coup ?

**Livrable.** Tableau comparatif + une phrase sur le seuil.

### Mini-défi — Architecture EMR + Athena (≈ 30 min, papier)

**Cas.** Plateforme d'analytique web :

- **100 GB/jour** de logs S3 (JSON).
- Besoin de :
  - **ETL** : convertir JSON → Parquet partitionné chaque nuit.
  - **Ad hoc** : analystes interrogent les Parquet via SQL.
  - **ML** : data scientists entraînent des modèles hebdo.

**Concevoir** :

1. Qui fait quoi ? (Athena / Glue / EMR ?)
2. Quel mode EMR ?
3. Estimation de coût mensuel.

**Livrable.** Schéma + matrice + estimation.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **EMR** et son **intérêt** (Hadoop / Spark managé).
- [ ] Distinguer **EMR** de **Athena** et **Glue**.
- [ ] Citer les **technologies supportées** : Spark, Hive, Presto/Trino, Flink, HBase.
- [ ] Pour chaque techno, donner **un cas d'usage** type.
- [ ] Distinguer **EMR on EC2**, **EMR Serverless**, **EMR on EKS**.
- [ ] Définir **EMR Studio** et son rôle (IDE web).
- [ ] Définir un **workspace** et expliquer comment l'attacher à un cluster.
- [ ] **Exécuter un notebook PySpark** depuis EMR Studio (étapes).
- [ ] Citer les **3 modes de cluster** (transient, long-running, Serverless).
- [ ] Citer **3 anti-patterns** EMR.
- [ ] Calculer le coût approximatif d'un cluster EMR EC2 sur 1 h.

### Items du glossaire visés

**N1 atteint** :

- _exécuter des scripts depuis EMR Studio_ — sections 4, 5.

**N2 atteint** :

- _intérêt de la plateforme EMR_ — section 1.3.
- _différentes technologies qu'EMR supporte_ — section 2.

---

## 10. Ressources complémentaires

### Documentation AWS

- [EMR Documentation](https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-what-is-emr.html)
- [EMR Studio](https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-studio.html)
- [EMR Serverless](https://docs.aws.amazon.com/emr/latest/EMR-Serverless-UserGuide/emr-serverless.html)
- [EMR on EKS](https://docs.aws.amazon.com/emr/latest/EMR-on-EKS-DevelopmentGuide/emr-eks.html)
- [Release versions](https://docs.aws.amazon.com/emr/latest/ReleaseGuide/emr-release-components.html)

### Pour aller plus loin

- **M5 (Data Firehose)** — pour livrer des données dans S3 prêtes pour EMR/Athena.
- **M6-M7 (Glue)** — alternative ETL plus simple, ou complémentaire.
- **M8 (Comparatifs analytics)** — Redshift, RDS, EMR positionnés.
- **Niveau 3** : tuning Spark, lancer EMR depuis Step Functions, configuration sécurité avancée.
