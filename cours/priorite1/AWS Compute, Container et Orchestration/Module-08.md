# M8 — Batch vs Lambda

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Batch** : service managé pour exécuter des **jobs conteneurisés** à grande échelle sur Fargate ou EC2, avec orchestration (queues, dependencies), auto-scaling et integration Spot.
- Citer les **trois concepts cardinaux** d'AWS Batch — **Compute Environment**, **Job Queue**, **Job Definition** — et décrire leur rôle respectif (item N3 amorcé).
- **Distinguer Batch et Lambda** (item N2 explicite) : modèle d'exécution, contraintes de durée et de taille, dépendances, scheduling, parallélisme, coût.
- **Choisir** entre Batch et Lambda pour un workload donné, et savoir reconnaître les **cas où ni l'un ni l'autre** n'est le bon choix (ECS Fargate, EMR, Step Functions seul).
- **Soumettre un job Batch** complet : créer un Compute Environment Fargate, une Job Queue, une Job Definition, soumettre un job, suivre ses logs et son statut.
- Comprendre les **jobs array** et les **job dependencies** comme primitives d'orchestration légère.

## Durée estimée

1 jour.

## Pré-requis

- M4-M6 (Lambda : modèle, packaging, limites). Permet d'avoir un repère pour la comparaison.
- M1-M3 (EC2) : Batch peut tourner sur EC2.
- M10 sera utile pour l'image (ECR). On peut faire l'exercice avec une image publique en attendant.
- AWS CLI v2 configurée.
- Docker installé localement (pour la variante image).
- Permissions IAM : `batch:*`, `iam:PassRole`, `ecs:*` (Batch utilise ECS en coulisses), `ec2:*` (pour Compute Environment EC2), `logs:*`.

---

## 1. Pourquoi un module dédié au choix Batch / Lambda

### 1.1 — Un faux dilemme fréquent

> "On va le faire en Lambda" et **"on aurait dû le faire en Batch"** sont les deux phrases les plus entendues sur les workloads longs et lourds dans AWS.

Le piège : **Lambda paraît plus simple** à mettre en place, et beaucoup d'équipes y entassent des jobs qui ne lui correspondent pas. Le **timeout de 15 minutes** sert souvent de signal d'alarme — mais il est tardif : à 14 minutes, on est déjà près du mur. Avant, il y a déjà des **côuts** qui montent, des **résultats partiels** difficiles à reprendre.

À l'inverse, **Batch a une réputation d'usine à gaz**. Il existe une période d'apprentissage (3 concepts) qui rebute. Beaucoup d'équipes choisissent ECS Fargate "lifté" en orchestrant à la main des tâches, et réinventent — en moins bon — ce que Batch fait nativement.

Ce module **clarifie le choix**.

### 1.2 — L'analogie du courrier

Penser aux deux services comme deux **systèmes de livraison** :

- **Lambda** = **le coursier vélo** : prend un colis à la fois, livre vite, parfait pour beaucoup de petits envois sur courte distance. Mauvais pour livrer un piano.
- **Batch** = **l'entreprise de transport routier** : a une **flotte de camions** (Compute Environment), une **file d'expéditions à traiter** (Job Queue), un **bon de transport** standardisé par type d'envoi (Job Definition). Lent à mettre en route, mais imbattable pour 10 000 colis ou un piano.

Le mauvais usage typique : confier un piano au coursier vélo (Lambda timeout au 4ᵉ étage), ou confier une enveloppe au transporteur routier (Batch overhead pour une fonction 200 ms).

### 1.3 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                                | Conséquence                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Découper un job de 30 min en 5 Lambdas de 6 min pour contourner le timeout. | Couplage temporel, complexité d'orchestration, échecs partiels à gérer. **Préférer Batch.** |
| Batch pour un job qui prend 30 secondes 1000 fois par jour.                 | Overhead de start de Batch > durée du job. **Préférer Lambda**.                             |
| Mettre tout en `priority=100` dans la même queue.                           | Pas de priorité réelle.                                                                     |
| Pas de **timeout** sur le job Batch.                                        | Job pendu en boucle, facture EC2 qui grimpe.                                                |
| Compute Environment EC2 sans Spot mix.                                      | Coût ×3 sur batch tolérant à l'interruption.                                                |

---

## 2. AWS Batch — qu'est-ce que c'est

### 2.1 — Définition

> **AWS Batch** est un service **fully-managed** qui exécute des **jobs conteneurisés** (Docker) à grande échelle, en orchestrant :
>
> - la **capacité compute** (provisionning et scaling de Fargate ou EC2),
> - la **mise en file** des jobs (queues prioritaires),
> - les **dépendances** entre jobs (DAGs simples),
> - les **retries**, **timeouts**, **logs**.

Concrètement, Batch est l'outil AWS pour des **workloads de calcul lourds, parallèles, finis dans le temps** : pipelines ETL, simulations scientifiques, encodage vidéo massif, training ML léger, processing batch de données.

### 2.2 — Trois concepts fondamentaux

| Concept                      | Rôle                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Compute Environment (CE)** | Où les jobs vont tourner. C'est un **pool de capacité**. Fargate ou EC2, configurable en min/max vCPU, modes On-Demand / Spot.           |
| **Job Queue (JQ)**           | Une file d'attente où on dépose les jobs. Une queue est rattachée à 1+ Compute Environments avec un **ordre de préférence**.             |
| **Job Definition (JD)**      | Un **modèle de job** : quelle image Docker, quels paramètres par défaut, quels vCPU/RAM, quel timeout, quel rôle IAM, quelle log config. |

Un **job** = une instance de Job Definition, soumise à une Job Queue. Batch décide quand le lancer, sur quel CE, et le surveille.

### 2.3 — Schéma de fonctionnement

```graphviz
  ┌─────────────────┐
  │ Job (instance)  │  ← `submit-job` (Job Definition + overrides)
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │   Job Queue     │  ← rattachée à 1+ CE
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────────────────┐
  │  Compute Environments           │
  │  ┌─────────────┐ ┌────────────┐ │
  │  │ CE Fargate  │ │ CE EC2 Spot│ │
  │  │             │ │            │ │
  │  │ scaling     │ │ ASG-like   │ │
  │  └─────────────┘ └────────────┘ │
  └─────────────────────────────────┘
          │
          ▼
  ┌─────────────────┐
  │ Container runs  │  ← logs vers CloudWatch
  └─────────────────┘
```

### 2.4 — Vocabulaire complémentaire

| Terme                       | Définition                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Multi-node parallel job** | Un job réparti sur **plusieurs nodes** (HPC, MPI).                                                             |
| **Array job**               | Un job qui est en réalité **N copies** (par exemple 1000 copies indexées de 0 à 999), parallélisées par Batch. |
| **Job dependency**          | Un job peut **attendre** la fin (succès) d'un autre job avant de démarrer.                                     |
| **Job state**               | `SUBMITTED → PENDING → RUNNABLE → STARTING → RUNNING → SUCCEEDED` (ou `FAILED`).                               |
| **Allocation strategy**     | `BEST_FIT`, `BEST_FIT_PROGRESSIVE`, `SPOT_CAPACITY_OPTIMIZED` (selon CE EC2).                                  |

---

## 3. Le cycle d'un job Batch

### 3.1 — Soumission

```bash
aws batch submit-job \
  --job-name tp-m8-process-batch-001 \
  --job-queue my-queue \
  --job-definition my-job-def:3 \
  --parameters 'input=s3://bucket/in/file.csv,output=s3://bucket/out/' \
  --container-overrides 'vcpus=4,memory=8192'
```

À la soumission, Batch crée l'objet **Job**, qui passe par des **états successifs** :

| État        | Que se passe-t-il                                               |
| ----------- | --------------------------------------------------------------- |
| `SUBMITTED` | Le job est enregistré, en attente d'évaluation des dépendances. |
| `PENDING`   | Il attend une dépendance (autre job non terminé).               |
| `RUNNABLE`  | Prêt à tourner. Batch attend de la capacité dans le CE.         |
| `STARTING`  | Batch a réservé la capacité, le container démarre.              |
| `RUNNING`   | Le container exécute le code.                                   |
| `SUCCEEDED` | Le container a retourné `exit code 0`.                          |
| `FAILED`    | Sortie non-zero, timeout, ou échec d'allocation après retries.  |

### 3.2 — Logs et résultats

Les logs stdout/stderr du container sont envoyés à **CloudWatch Logs** dans le log group `/aws/batch/job` (configurable). Pour les résultats persistants, le code applicatif écrit en S3, DynamoDB, RDS, etc.

```bash
# Récupérer l'ARN du log stream du job
aws batch describe-jobs --jobs <JOB_ID> \
  --query 'jobs[0].container.logStreamName'

# Voir les logs
aws logs tail /aws/batch/job --log-stream-names <STREAM> --follow
```

### 3.3 — Timeouts et retries

Configurés dans la Job Definition (ou en override) :

```json
{
  "retryStrategy": {
    "attempts": 3,
    "evaluateOnExit": [
      { "onExitCode": "1", "action": "EXIT" },
      { "onReason": "Host EC2*", "action": "RETRY" }
    ]
  },
  "timeout": { "attemptDurationSeconds": 3600 }
}
```

Le retry est **paramétrable selon les causes** (exit code, reason). Utile pour retry uniquement sur les échecs transients (host Spot interrompu) sans retry sur des erreurs logiques (exit 1).

### 3.4 — Array jobs — paralléliser N copies

```bash
aws batch submit-job \
  --job-name etl-array \
  --job-queue my-queue \
  --job-definition etl-def \
  --array-properties size=1000
```

Batch lance **1000 copies** du même job, chaque copie reçoit un index via la variable d'env `AWS_BATCH_JOB_ARRAY_INDEX` (0 à 999). Le code utilise cet index pour décider **quelle partition** traiter :

```python
import os
idx = int(os.environ["AWS_BATCH_JOB_ARRAY_INDEX"])
chunk = chunks[idx]
process(chunk)
```

Idéal pour : traiter 1000 fichiers, lancer 1000 simulations avec paramètres différents, processing parallèle d'un dataset partitionné.

### 3.5 — Dependencies — chaîner des jobs

```bash
# Soumettre un job A
A_ID=$(aws batch submit-job ... --query 'jobId' --output text)

# Soumettre B qui attend A
aws batch submit-job ... --depends-on jobId=$A_ID
```

Pour un array job, on peut chaîner en mode `N_TO_N` (le job i de B attend le job i de A — utile pour pipeline ETL paralléle).

Pour des workflows plus complexes (branches, parallel, choice, retry sophistiqué), **Step Functions** (M9) est plus adapté.

---

## 4. Batch vs Lambda — la comparaison (item N2 explicite)

### 4.1 — Tableau exhaustif

| Critère                          | **Lambda**                                     | **AWS Batch**                                                               |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| **Modèle d'exécution**           | Function, déclenchée par événement.            | Job containerisé, soumis explicitement à une queue.                         |
| **Durée max**                    | 15 minutes (900 s).                            | **Aucune limite** (peut tourner des heures, voire jours).                   |
| **Mémoire / vCPU max**           | 10 240 MB, ~6 vCPU.                            | Fargate : 4 vCPU / 30 GB. EC2 : jusqu'à `r5d.metal` (96 vCPU, 768 GB), GPU. |
| **Démarrage**                    | 100 ms (warm) à 3 s (cold).                    | 30 s (Fargate) à plusieurs minutes (EC2 cold, avec provisioning).           |
| **Scaling**                      | 0 → 1000+ instantané (concurrency quotas).     | Selon CE : Fargate scale en secondes ; EC2 en minutes.                      |
| **Packaging**                    | ZIP (250 MB) ou image (10 GB).                 | **Image Docker** (jusqu'à 10 GB) — ECR ou public registry.                  |
| **Pricing**                      | Invocations + GB-seconds.                      | vCPU-h + GB-h du compute (Fargate ou EC2), pas de coût de "service".        |
| **Concurrent runs**              | 1000 / région (soft).                          | Limité par capacité CE (vCPU max).                                          |
| **GPU**                          | Non supporté.                                  | **Oui** (CE EC2 avec instance G/P).                                         |
| **Long-running, stateful**       | Non.                                           | Oui (job tourne jusqu'à sa fin).                                            |
| **Trigger automatique**          | Oui (S3, EventBridge, SQS, …).                 | Non (submit explicite via SDK / SF / EventBridge).                          |
| **Dépendances entre exécutions** | Non natif (Step Functions ou choreography).    | **Oui natif** (`--depends-on`).                                             |
| **Job arrays (N copies)**        | Pas natif (orchestrer côté SDK).               | **Oui natif** (`--array-properties size=N`).                                |
| **Retry sophistiqué**            | 0-2 retries pour async ; SDK manuel pour sync. | Configurable par exit code / reason.                                        |
| **Coût "idle"**                  | 0.                                             | 0 si CE à `MinvCpus=0`, sinon coût de la capacité minimale.                 |
| **Cas typique**                  | Event-driven, glue logic, API.                 | ETL nocturne, simulations, training, encoding, analyse parallèle.           |

### 4.2 — Tableau croisé — "Quand chacun gagne"

| Workload                                                              | Lambda                  | Batch           | Verdict                                        |
| --------------------------------------------------------------------- | ----------------------- | --------------- | ---------------------------------------------- |
| API REST < 100 req/s, < 1 s par requête.                              | ✅                      | ❌              | Lambda (Batch trop lent à start, mauvais fit). |
| Encodage vidéo 4K, 1 h par fichier.                                   | ❌ (timeout)            | ✅              | Batch.                                         |
| ETL nightly, 2 h, 100 GB de transformation.                           | ❌ (timeout)            | ✅              | Batch.                                         |
| Notifications mail à l'arrivée d'un fichier S3.                       | ✅                      | ⚠️ (overkill)   | Lambda.                                        |
| 1000 simulations paramétriques (chacune 5 min).                       | ⚠️ (faisable, complexe) | ✅ (array job)  | Batch.                                         |
| Pipeline analytique 50 étapes (extract → transform → load → publish). | ❌                      | ✅+SF           | Batch + Step Functions.                        |
| Job qui doit tourner 24/7 sans arrêt.                                 | ❌                      | ❌              | **Ni l'un ni l'autre** → ECS Fargate ou EC2.   |
| Génération de thumbnail 10 000 fois/jour, 2 s chaque.                 | ✅                      | ⚠️              | Lambda (volume invocation × durée OK).         |
| Training ML — fine-tuning 30 min GPU.                                 | ❌                      | ✅ (CE EC2 G/P) | Batch.                                         |
| Cron mensuel "génère le rapport" (3-5 min CPU).                       | ✅                      | ✅              | **Les deux** marchent — Lambda plus simple.    |

### 4.3 — Coût comparé sur un cas concret

**Cas** : 500 jobs/jour, chacun 5 min de CPU, 2 GB de RAM.

| Hypothèse                                                  | Calcul mensuel approximatif                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Lambda** 2048 MB, 5 min/run                              | 500 × 30 = 15 000 runs × 5 min × 2 GB-s × 0,0000166667 $ ≈ **~80 $/mois** |
| **Batch Fargate** 1 vCPU / 2 GB, 5 min                     | 15 000 × (5/60) h × (0,04 $/vCPU-h + 0,007 × 2 $/GB-h) ≈ **~75 $/mois**   |
| **Batch EC2 Spot** `c6g.large` (~0,02 $/h en spot) partagé | Beaucoup moins, ~25-30 $/mois selon mutualisation.                        |

Pour ce cas, **Batch Spot devient nettement moins cher** dès qu'on dépasse quelques dizaines de minutes de calcul par jour. Lambda est compétitif pour des durées plus courtes ou des volumes plus faibles.

---

## 5. Choisir Lambda ou Batch — méthode

### 5.1 — Arbre de décision

```treeviz
 Le job dure-t-il > 15 minutes ?
 ├─ Oui → Batch (ou Fargate si long-running 24/7)
 └─ Non
     │
     Le job demande-t-il > 6 vCPU ou > 10 GB de RAM ou GPU ?
     ├─ Oui → Batch (CE EC2)
     └─ Non
         │
         Le job est-il déclenché par un événement et synchrone ?
         ├─ Oui → Lambda
         └─ Non — c'est plutôt un calcul batch / scheduled / array
             │
             Y a-t-il > 100 exécutions parallèles indépendantes (array) ?
             ├─ Oui → Batch (array job)
             └─ Non — un job ponctuel, < 15 min, sans GPU
                 │
                 Préfère-t-on la simplicité opérationnelle ?
                 ├─ Oui → Lambda (cron EventBridge)
                 └─ Non — besoin de retry sophistiqué, dépendances, queue prioritaire → Batch
```

### 5.2 — Trois exemples concrets

**Exemple 1 — Calcul mensuel d'un rapport financier (5-10 min CPU, 1 fois/mois)**

- Lambda : oui (dans la limite des 15 min). Simple, EventBridge cron déclenche.
- Batch : oui aussi, mais sur-engineering pour cette charge.
- **Choix** : Lambda.

**Exemple 2 — Reprocessing nightly de 500 fichiers S3 (3 min chacun)**

- Lambda : faisable avec un fan-out (Lambda master → SQS → 500 Lambdas children). Complexe.
- Batch : **array job size=500**, chaque copie prend un fichier via son `ARRAY_INDEX`. Plus simple opérationnellement.
- **Choix** : Batch array.

**Exemple 3 — Encodage vidéo H.265 (45 min par vidéo, GPU)**

- Lambda : impossible (timeout 15 min, pas de GPU).
- Batch : **Compute Environment EC2 avec `g4dn.xlarge` Spot**, job par vidéo.
- **Choix** : Batch.

### 5.3 — Quand Lambda + Step Functions remplace Batch

Si le workload est **chaîne de petites étapes** (chacune < 15 min) avec besoin de retry/conditions/parallel, **Step Functions orchestrant des Lambdas** est souvent plus adapté que Batch :

- ETL léger : Extract (Lambda 5 min) → Transform (Lambda 8 min) → Load (Lambda 3 min).
- Avec parallel : Map state sur 1000 fichiers, chaque Lambda 2 min.
- Retry + conditions : Step Functions plus déclaratif que Batch dependencies.

Step Functions est l'objet de **M9**.

### 5.4 — Quand ni Batch ni Lambda

Si le workload est **long-running 24/7 et stateless** (microservice, API constante, websocket) → **ECS Fargate** ou **EKS**, pas Batch (qui est pour des jobs finis).

Si le workload est **interactif** (notebook ML, exploration de données) → **SageMaker Notebooks** ou **EMR Studio**, pas Batch.

Si le workload est **big data** distribué (Spark, Hive, Presto) → **EMR** ou **Glue**, pas Batch (qui n'oriente pas le développeur vers le framework distribué).

---

## 6. Premiers pas — déployer Batch concrètement

### 6.1 — Pré-requis : rôles IAM

Batch a besoin de plusieurs rôles, à créer une fois :

```bash
# 1. Service role pour Batch (assume role + policies managed)
aws iam create-role --role-name AWSBatchServiceRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"batch.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'
aws iam attach-role-policy --role-name AWSBatchServiceRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole

# 2. Execution role pour la tâche Fargate (permissions runtime ECS)
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'
aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# 3. Task role (permissions du code applicatif — S3, DDB, ...)
aws iam create-role --role-name BatchJobRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'
# Attacher les permissions nécessaires (S3 read/write, …)
```

### 6.2 — Créer un Compute Environment Fargate

```bash
aws batch create-compute-environment \
  --compute-environment-name ce-fargate-default \
  --type MANAGED --state ENABLED \
  --service-role arn:aws:iam::ACCOUNT:role/AWSBatchServiceRole \
  --compute-resources '{
    "type": "FARGATE",
    "maxvCpus": 64,
    "subnets": ["subnet-aaa","subnet-bbb"],
    "securityGroupIds": ["sg-xxx"]
  }'
```

Fargate **sans EC2** : pas de cluster à gérer, scale instantané, surcoût ~20 % vs EC2 mais simplicité incomparable.

### 6.3 — Créer une Job Queue

```bash
aws batch create-job-queue \
  --job-queue-name default-queue \
  --state ENABLED \
  --priority 1 \
  --compute-environment-order order=1,computeEnvironment=ce-fargate-default
```

Une queue peut être rattachée à **plusieurs CE** (par exemple : Fargate prioritaire pour les jobs urgents, EC2 Spot pour les jobs économiques) — Batch place dans l'ordre.

### 6.4 — Créer une Job Definition

```bash
aws batch register-job-definition \
  --job-definition-name jd-process-csv \
  --type container \
  --platform-capabilities FARGATE \
  --container-properties '{
    "image": "public.ecr.aws/docker/library/python:3.12-slim",
    "command": ["python", "-c", "import sys; print(\"hello\"); sys.exit(0)"],
    "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
    "jobRoleArn": "arn:aws:iam::ACCOUNT:role/BatchJobRole",
    "resourceRequirements": [
      {"type": "VCPU", "value": "0.5"},
      {"type": "MEMORY", "value": "1024"}
    ],
    "networkConfiguration": {"assignPublicIp": "ENABLED"},
    "fargatePlatformConfiguration": {"platformVersion": "LATEST"},
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/aws/batch/job",
        "awslogs-region": "eu-west-1",
        "awslogs-stream-prefix": "tp-m8"
      }
    }
  }' \
  --retry-strategy 'attempts=2' \
  --timeout 'attemptDurationSeconds=600'
```

### 6.5 — Soumettre un job et suivre

```bash
JOB_ID=$(aws batch submit-job \
  --job-name tp-m8-first \
  --job-queue default-queue \
  --job-definition jd-process-csv \
  --query 'jobId' --output text)

# Suivre les transitions d'état
watch -n 5 "aws batch describe-jobs --jobs $JOB_ID --query 'jobs[0].{Status:status,Reason:statusReason}'"

# Une fois RUNNING, récupérer le log stream
LOG_STREAM=$(aws batch describe-jobs --jobs $JOB_ID \
  --query 'jobs[0].container.logStreamName' --output text)

aws logs tail /aws/batch/job --log-stream-names "$LOG_STREAM" --follow
```

### 6.6 — Array job et dépendances

```bash
# Job A — array de 5 indices
A_ID=$(aws batch submit-job \
  --job-name array-A --job-queue default-queue --job-definition jd-process-csv \
  --array-properties size=5 --query 'jobId' --output text)

# Job B — dépend de A (attend que les 5 indices A finissent)
aws batch submit-job \
  --job-name finisher-B --job-queue default-queue --job-definition jd-process-csv \
  --depends-on jobId=$A_ID
```

Pour un `N_TO_N` (B_i attend A_i) :

```bash
aws batch submit-job ... --array-properties size=5 \
  --depends-on "jobId=$A_ID,type=N_TO_N"
```

---

## 7. Compute Environment — Fargate, EC2, Spot

### 7.1 — Fargate

Avantages :

- **Aucune gestion d'instances** — Batch demande à Fargate de provisionner.
- **Scaling très rapide** (secondes).
- **Idéal pour des jobs courts** (5 min - 1 h) où la simplicité prime.

Limites :

- **4 vCPU / 30 GB max** par tâche.
- **Pas de GPU**.
- **Prix par vCPU-h** plus élevé que EC2.

### 7.2 — EC2 — managed by Batch

Batch peut gérer un **pool d'EC2 dynamique** : il lance des instances selon la charge, les arrête quand la queue est vide.

```bash
aws batch create-compute-environment \
  --compute-environment-name ce-ec2 \
  --type MANAGED --state ENABLED \
  --service-role arn:aws:iam::ACCOUNT:role/AWSBatchServiceRole \
  --compute-resources '{
    "type": "EC2",
    "minvCpus": 0,
    "maxvCpus": 128,
    "desiredvCpus": 0,
    "instanceTypes": ["c6i","m6i","r6i"],
    "subnets": ["subnet-aaa","subnet-bbb"],
    "securityGroupIds": ["sg-xxx"],
    "instanceRole": "ecsInstanceRole",
    "allocationStrategy": "BEST_FIT_PROGRESSIVE"
  }'
```

`minvCpus=0` : Batch éteint **tout** le pool en l'absence de jobs (vraie économie idle).

`instanceTypes` : on donne une **liste de familles** ; Batch choisit la plus adaptée selon les requirements du job.

### 7.3 — EC2 Spot — l'option économique

Pour des workloads **tolérants à l'interruption** (idempotents, checkpointés) :

```json
{
  "type": "SPOT",
  "minvCpus": 0,
  "maxvCpus": 256,
  "instanceTypes": ["c6i.large", "c6i.xlarge", "c6a.large", "m6i.large"],
  "bidPercentage": 100,
  "allocationStrategy": "SPOT_CAPACITY_OPTIMIZED",
  "spotIamFleetRole": "arn:aws:iam::ACCOUNT:role/AmazonEC2SpotFleetRole"
}
```

Le `allocationStrategy: SPOT_CAPACITY_OPTIMIZED` minimise les interruptions en choisissant les pools les moins demandés.

**Économies typiques** : 50 à 80 % vs On-Demand.

### 7.4 — Choisir entre les trois

| Profil de job                                  | CE recommandé                             |
| ---------------------------------------------- | ----------------------------------------- |
| Job 5-30 min, jamais > 4 vCPU.                 | **Fargate**.                              |
| Job 1-12 h, contrôle fin du type d'instance.   | **EC2 On-Demand**.                        |
| Job tolérant à l'interruption, gros volume.    | **EC2 Spot**.                             |
| Mix : urgents en Fargate, économiques en Spot. | **Plusieurs CE**, ordre dans la JQ.       |
| GPU.                                           | **EC2 On-Demand ou Spot** (familles G/P). |

---

## 8. Anti-patterns transverses

| Anti-pattern                                                           | Conséquence                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lambda découpé en 5 morceaux pour franchir 15 min sans utiliser Batch. | Coupling, complexité, échecs partiels. Batch ou Step Functions est plus propre. |
| Batch CE sans `minvCpus=0`.                                            | Coût continu même sans job.                                                     |
| `maxvCpus` trop élevé.                                                 | Spike inattendu = facture imprévue. Mettre une limite raisonnable + alarme.     |
| Pas de **retry** différencié par exit code.                            | Retry sur erreur métier = boucle inutile, retry sur interruption Spot = perdu.  |
| Image Docker énorme (5 GB) pour un job qui pèse 50 MB.                 | Cold start de plusieurs minutes. Optimiser le Dockerfile.                       |
| Pas de timeout sur la Job Definition.                                  | Job pendu = facture qui grimpe sans plafond.                                    |
| Pas de **tags** sur les jobs.                                          | Impossible de facturer par équipe / projet.                                     |
| Logs CloudWatch sans rétention.                                        | Coût qui s'accumule sur des années.                                             |

---

## 9. Exercices pratiques

### Exercice 1 — Choisir entre Batch et Lambda sur 8 cas (≈ 30 min)

**Objectif.** Item N2 explicite.

Pour chaque cas, **choisir Lambda, Batch ou autre** (préciser quoi), avec 2-3 lignes de justification :

1. Nettoyer un bucket S3 (supprime tous les objets > 90 jours) — 1 fois par semaine, 5-30 minutes.
2. Encoder 1000 vidéos H.264 → H.265, chacune 30 min, GPU.
3. Notifier Slack à chaque écriture sur une table DynamoDB.
4. Reprocessing nightly d'un dataset de 200 GB en transformations Pandas.
5. Workflow ETL : extract (5 min) → transform (3 min) → load (2 min), avec retry et conditions.
6. Service web Flask exposé en HTTP.
7. Simulation Monte Carlo paramétrique : 10 000 runs indépendants, 2 min chacun.
8. Cron mensuel pour générer un rapport PDF (3 min CPU).

**Livrable.** Tableau.

### Exercice 2 — Setup Batch complet — premier job Fargate (≈ 60 min)

**Objectif.** Tour complet du service.

**Étapes :**

1. Créer les rôles IAM (`AWSBatchServiceRole`, `ecsTaskExecutionRole`, `BatchJobRole`).
2. Créer le Compute Environment Fargate `tp-m8-ce`.
3. Créer la Job Queue `tp-m8-queue`.
4. Créer la Job Definition `tp-m8-hello` (image `public.ecr.aws/docker/library/python:3.12-slim`, command `python -c "import time; print('hello'); time.sleep(30)"`, 0.5 vCPU, 1 GB).
5. Soumettre un job. Suivre son cycle d'état.
6. Lire les logs.

**Livrable.** Captures CLI de chaque étape.

### Exercice 3 — Array job et `AWS_BATCH_JOB_ARRAY_INDEX` (≈ 45 min)

**Objectif.** Maîtriser les array jobs.

**Étapes :**

1. Modifier la Job Definition pour un command qui imprime l'index :

   ```bash
   python -c "import os; print('Processing chunk', os.environ['AWS_BATCH_JOB_ARRAY_INDEX'])"
   ```

2. Soumettre avec `--array-properties size=10`.
3. Observer la création des **10 sous-jobs** indexés `:0`, `:1`, …, `:9`.
4. Vérifier que chacun a logué son propre index.

**Livrable.** Capture des 10 logs.

### Exercice 4 — Job avec dépendance (≈ 30 min)

**Objectif.** Chaînage simple.

**Étapes :**

1. Soumettre un job A `--array-properties size=5`.
2. Soumettre un job B `--depends-on jobId=$A_ID` qui imprime "all chunks done".
3. Observer que B reste en `PENDING` tant qu'un sous-job A n'a pas fini.
4. Une fois A complet (5/5 SUCCEEDED), vérifier que B passe à RUNNABLE puis RUNNING.

**Livrable.** Captures de l'état avant/pendant/après.

### Exercice 5 — Compute Environment EC2 Spot (≈ 60 min)

**Objectif.** Économie Spot.

**Étapes :**

1. Créer un rôle `AmazonEC2SpotFleetRole`.
2. Créer un CE `tp-m8-ce-spot` (Spot, bidPercentage=100, instanceTypes c6i / m6i / c6a).
3. Créer une queue qui pointe sur ce CE (priorité plus basse que la queue Fargate).
4. Soumettre un job long (5 min sleep, 1 vCPU / 2 GB) sur cette queue.
5. Observer l'instance EC2 lancée.
6. Vérifier la facture EC2 vs Fargate sur 1 h de calcul équivalent (ordre de grandeur).

**Livrable.** Captures + comparaison de coût.

### Mini-défi — Architecture batch pour un usage réel (≈ 60 min, papier)

**Cas.** Pipeline d'analyse satellite :

- Chaque jour à 02:00 UTC, 200 images satellites arrivent en S3.
- Chaque image doit être analysée par un modèle OpenCV + ML (durée 10-30 min selon résolution, GPU souhaitable).
- Le résultat (vecteurs de features) est écrit en RDS PostgreSQL.
- Une fois toutes les images traitées, un rapport est généré (1 Lambda 2 min).

Proposer :

1. Type de Compute Environment.
2. Modèle de Job Definition (vCPU, RAM, GPU, image Docker).
3. Modèle de soumission (array de 200, dépendance avec Lambda de rapport).
4. Estimation du coût d'une exécution complète.

**Livrable.** Schéma + 3 commandes CLI symboliques.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **AWS Batch** et son périmètre.
- [ ] Citer les **3 concepts** Compute Environment / Job Queue / Job Definition.
- [ ] Décrire le **cycle d'un job** : SUBMITTED → PENDING → RUNNABLE → STARTING → RUNNING → SUCCEEDED/FAILED.
- [ ] **Distinguer Batch et Lambda** sur au moins 6 critères (durée, mémoire, scaling, packaging, retry, dependencies).
- [ ] Citer **3 cas où Batch gagne** et **3 cas où Lambda gagne**.
- [ ] Citer un cas où **ni Batch ni Lambda** ne sont le bon choix.
- [ ] Définir un **array job** et expliquer `AWS_BATCH_JOB_ARRAY_INDEX`.
- [ ] Définir une **job dependency** et son mode `N_TO_N`.
- [ ] Choisir entre **Fargate** et **EC2 On-Demand** et **EC2 Spot** pour un Compute Environment.
- [ ] Citer **4 anti-patterns** Batch (CE sans minvCpus=0, pas de timeout, retry indifférencié, etc.).

### Items du glossaire visés

**N2 atteint** :

- _différence entre Batch et Lambda_ — section 4.

**N3 amorcé** (concepts introduits, non couverts en profondeur) :

- _différence entre compute environment, job queue et task definition_ — sections 2 et 6.
- _avantages et inconvénients EC2 vs Fargate dans Batch_ — section 7.

---

## 11. Ressources complémentaires

### Documentation AWS

- [AWS Batch User Guide](https://docs.aws.amazon.com/batch/latest/userguide/what-is-batch.html)
- [Compute environments](https://docs.aws.amazon.com/batch/latest/userguide/compute_environments.html)
- [Job queues](https://docs.aws.amazon.com/batch/latest/userguide/job_queues.html)
- [Job definitions](https://docs.aws.amazon.com/batch/latest/userguide/job_definitions.html)
- [Array jobs](https://docs.aws.amazon.com/batch/latest/userguide/array_jobs.html)
- [Job dependencies](https://docs.aws.amazon.com/batch/latest/userguide/job_dependencies.html)
- [Allocation strategies](https://docs.aws.amazon.com/batch/latest/userguide/allocation-strategies.html)

### Outils

- [AWS Batch Examples](https://github.com/awsdocs/aws-batch-user-guide) — modèles JSON.
- [Step Functions integration with Batch](https://docs.aws.amazon.com/step-functions/latest/dg/connect-batch.html) — utile en lien M9.

### Pour aller plus loin

- **M9 (Step Functions)** — orchestration de workflows plus complexes que les dependencies natives Batch.
- **M11-M12 (ECS Fargate)** — alternative pour long-running.
- **AWS Database et Storage M6** — S3 + lifecycle, environnement habituel des inputs/outputs Batch.
- **AWS Analytics M3-M6** — Athena, Glue : alternative au Batch pour des transformations SQL/Spark sur S3.
