# M8 — Calcul des coûts

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Énoncer le **modèle tarifaire** de chacun des services storage et database vus dans le parcours : RDS/Aurora, DynamoDB, S3, EBS, EFS.
- **Calculer le coût** d'un service de storage en fonction d'un besoin donné (item N2 explicite) : volume, classe, retrieval, requêtes, transferts.
- **Calculer le coût** d'un service de database en fonction d'un besoin donné (item N2 explicite) : instance/heure, storage, IOPS, backup, transferts.
- Faire une **projection mensuelle** pour une app type combinant plusieurs services.
- Connaître les **outils AWS** pour estimer : Pricing Calculator, AWS Cost Explorer, AWS Budgets, AWS Compute Optimizer.
- Identifier les **principaux leviers d'optimisation** (lifecycle S3, Reserved Instances / Savings Plans RDS, DynamoDB On-Demand vs Provisioned, gp3 vs gp2, etc.).
- Mener le **mini-projet final du parcours** : app stateful avec RDS + DynamoDB + S3 (lifecycle, versioning, backup automatisé), avec une estimation de budget mensuel.

## Durée estimée

1 à 2 jours, mini-projet final inclus.

## Pré-requis

- M1-M7 du parcours **AWS Database et Storage**.
- Avoir suivi **AWS Identity** (KMS pour le chiffrement) et **AWS Networking** (VPC) — utile pour le mini-projet.
- AWS CLI v2 + console AWS Pricing Calculator accessible.

---

## 1. Pourquoi calculer

### 1.1 — Le problème — la facture qui surprend

> **Ne pas savoir combien coûte une app AWS, c'est s'exposer à des factures multipliées par 5, 10, parfois 100 vs ce qu'on avait estimé.**

Les pièges courants :

- **Volumes** mal estimés (10× plus de logs/jour que prévu).
- **Data transfer OUT** négligé (le coût caché AWS classique).
- **Multi-AZ / Read replicas** doublent le coût compute.
- **Backups étendus** au-delà des 100 % gratuits.
- **Snapshots accumulés** non gérés.
- **GSI projection ALL** sur DynamoDB.
- **Aurora I/O** non optimisés.
- **NAT Gateway** sur petit workload (~33 $/mois par AZ).

### 1.2 — Le bénéfice d'une bonne estimation

- **Devis client** réaliste pour des projets.
- **Architecture** dimensionnée correctement dès le départ.
- **Décisions** entre alternatives (Aurora vs DynamoDB, EBS vs EFS) pondérées par le coût.
- **FinOps** : maîtrise et optimisation continue.

### 1.3 — La règle du **70/30**

Pour un budget mensuel donné, viser :

- **70 %** sur le compute / database / storage (ce qui produit de la valeur).
- **30 %** sur l'overhead (réseau, snapshots, monitoring, sauvegardes).

Si l'overhead dépasse 30 %, c'est qu'il y a un anti-pattern à éliminer.

---

## 2. Modèle tarifaire AWS — vue d'ensemble

### 2.1 — Les axes de facturation

Tous les services AWS facturent sur **au moins 2-3** des axes suivants :

| Axe               | Exemples                                                          |
| ----------------- | ----------------------------------------------------------------- |
| **Compute time**  | EC2 par heure, Aurora ACU-h, Glue DPU-h.                          |
| **Storage**       | EBS / S3 par GB-mois, snapshot par GB-mois.                       |
| **Requests**      | DynamoDB RRU/WRU, S3 PUT/GET, Lambda invocations.                 |
| **Data transfer** | OUT vers Internet (cher), cross-region, inter-AZ.                 |
| **Throughput**    | RDS IOPS provisionnées, EFS provisioned throughput.               |
| **Operations**    | RDS automated backups au-delà du gratuit, snapshots cross-region. |

### 2.2 — Le piège du data transfer

> **80 % des factures AWS surprenantes** viennent du **data transfer OUT** (sortie Internet).

| Type de transfer             | Tarif (~)                                    |
| ---------------------------- | -------------------------------------------- |
| **Entrant** (Internet → AWS) | **Gratuit**                                  |
| **Intra-AZ** (même AZ)       | Gratuit (sauf NLB cross-zone)                |
| **Inter-AZ** (même region)   | 0,01 $/GB chaque sens                        |
| **Cross-region**             | 0,02 $/GB                                    |
| **OUT vers Internet**        | **0,09 $/GB** (régressif à très haut volume) |

Une appli qui sert 10 TB d'images/mois aux utilisateurs :

- 10 240 GB × 0,09 $ = **~922 $/mois** de transfer OUT.
- Mettre CloudFront devant : 10 240 GB × 0,085 $ + cache hits ~90 % → **réduction ~85 %**.

**Toujours penser au transfer OUT.**

### 2.3 — Les régions ne coûtent pas pareil

Variation typique entre régions : **5 à 30 %**.

| Région              | Pricing relatif (vs us-east-1) |
| ------------------- | ------------------------------ |
| `us-east-1`         | Baseline (le moins cher).      |
| `us-west-2`         | ~+5 %.                         |
| `eu-west-1`         | ~+10 %.                        |
| `eu-west-3` (Paris) | ~+15 %.                        |
| `ap-northeast-1`    | ~+15 à 20 %.                   |
| `sa-east-1`         | ~+20 à 30 %.                   |

Pour une app sans contrainte géo : `us-east-1` est le moins cher (vu en Networking M1). Mais ne pas oublier la **latence client** et la **conformité**.

---

## 3. Pricing RDS / Aurora

### 3.1 — Axes de facturation

| Axe                   | Détail                                                             |
| --------------------- | ------------------------------------------------------------------ |
| **Instance/heure**    | Par classe (db.t4g.micro à db.r7g.16xlarge).                       |
| **Storage**           | Par GB-mois (gp3, io1/io2 + IOPS provisionnées).                   |
| **Backup storage**    | Gratuit jusqu'à 100 % de la taille de l'instance ; payant au-delà. |
| **Data transfer OUT** | 0,09 $/GB hors Free Tier.                                          |
| **Multi-AZ**          | **Double** le coût compute + storage.                              |
| **Snapshots**         | Inclus dans backup storage, ou Snapshot Export S3 séparé.          |
| **RDS Proxy**         | Payant à l'heure.                                                  |

### 3.2 — Tarifs RDS PostgreSQL (eu-west-1, ~)

| Class            | $/heure on-demand | $/mois (730h) |
| ---------------- | ----------------- | ------------- |
| `db.t4g.micro`   | 0,018             | 13            |
| `db.t4g.small`   | 0,036             | 26            |
| `db.t4g.medium`  | 0,072             | 53            |
| `db.t4g.large`   | 0,144             | 105           |
| `db.m6g.large`   | 0,193             | 141           |
| `db.m6g.xlarge`  | 0,386             | 282           |
| `db.r6g.large`   | 0,254             | 185           |
| `db.r6g.xlarge`  | 0,508             | 371           |
| `db.r6g.2xlarge` | 1,016             | 742           |

**Multi-AZ** : × 2 sur ces chiffres.

### 3.3 — Tarifs Aurora PostgreSQL (eu-west-1, ~)

| Class            | $/heure | $/mois |
| ---------------- | ------- | ------ |
| `db.t4g.medium`  | 0,082   | 60     |
| `db.r6g.large`   | 0,29    | 212    |
| `db.r6g.xlarge`  | 0,58    | 423    |
| `db.r6g.2xlarge` | 1,16    | 847    |

**+ Storage Aurora** : 0,10 $/GB/mois (Standard) ou 0,225 $/GB/mois (I/O-Optimized).

**+ I/O Aurora Standard** : 0,20 $/million.

### 3.4 — Aurora Serverless v2

- 0,12 $/ACU-heure.
- Min 0,5 ACU = 0,5 × 0,12 × 730 = **44 $/mois** baseline.
- Si charge moyenne 2 ACU : 2 × 0,12 × 730 = **175 $/mois**.

### 3.5 — Calcul exemple — RDS Postgres standard

**Cas** : `db.t4g.medium`, 100 GB gp3, Multi-AZ, backup 14 jours.

```text
Instance      : 0,072 $/h × 730h × 2 (Multi-AZ) = 105 $
Storage       : 100 GB × 0,138 $/GB × 2 (Multi-AZ) = 27,60 $
Backup        : 14 jours × 100 GB rotated → gratuit (< 100 % size)
Data transfer : selon usage
─────────────────────────────────────────────────
TOTAL minimum                                     ≈ 133 $/mois
```

### 3.6 — Reserved Instances et Savings Plans

Pour des charges **prévisibles** longues durées (1 ou 3 ans) :

- **Reserved Instances** : engagement, économie 30-70 %.
- **Compute Savings Plans** : flexible (EC2 + Lambda + Fargate), économie 20-66 %.

**Pas applicable** à Aurora Serverless v2.

---

## 4. Pricing DynamoDB

### 4.1 — Deux modes

**On-Demand** :

- **Read** : 0,25 $/million de RRU.
- **Write** : 1,25 $/million de WRU.
- **Storage** : 0,30 $/GB/mois (Standard) ou 0,114 $/GB/mois (Standard-IA depuis 2023).
- **Pas de capacity à provisionner**.

**Provisioned** :

- **Read** : 0,00013 $/RCU/heure.
- **Write** : 0,00065 $/WCU/heure.
- **Storage** : idem.
- **Reserved Capacity** disponible (économie ~50-77 %).

### 4.2 — Quand bascule On-Demand vs Provisioned

| Cas                                       | Mode                     |
| ----------------------------------------- | ------------------------ |
| < 70 % utilisation moyenne                | **On-Demand**.           |
| Charge stable bien dimensionnée à > 80 %  | **Provisioned**.         |
| Variabilité élevée                        | **On-Demand**.           |
| Cas exotique : Provisioned + auto-scaling | Compromis intermédiaire. |

Règle empirique : On-Demand devient plus cher que Provisioned **dès qu'on dépasse ~70 % d'utilisation moyenne stable**.

### 4.3 — Calcul exemple — DynamoDB On-Demand

**Cas** : 100M reads / 10M writes / mois, 50 GB de data.

```text
Reads   : 100M × 0,25 $/M = 25 $
Writes  : 10M × 1,25 $/M = 12,50 $
Storage : 50 GB × 0,30 $ = 15 $
─────────────────────────────────────
TOTAL                       ≈ 52,50 $/mois
```

### 4.4 — Calcul exemple — DynamoDB Provisioned

**Cas** : 100 RCU + 20 WCU provisionnés, 50 GB de data, charge constante.

```text
Reads   : 100 × 0,00013 $/h × 730h = 9,50 $
Writes  : 20 × 0,00065 $/h × 730h = 9,50 $
Storage : 15 $
─────────────────────────────────────
TOTAL                       ≈ 34 $/mois
```

→ Provisioned ~35 % moins cher **si** la charge réelle correspond à 100 RCU / 20 WCU.

### 4.5 — GSI coût

Chaque **GSI réplique les writes** et stocke ses propres données :

- **Storage GSI** : 0,30 $/GB sur ce que la projection contient.
- **WCU GSI** : 1× write supplémentaire (×N pour N GSI).
- **RCU GSI** : facturés sur les reads via le GSI.

Si on a 3 GSI projection ALL : **× 4 WCU** par write sur la table principale. À considérer.

### 4.6 — Autres coûts

- **DynamoDB Streams** : 0,02 $/100k read requests.
- **Backup PITR (Point-in-Time Recovery)** : 0,20 $/GB/mois.
- **On-demand backup** : 0,10 $/GB/mois.
- **DAX (DynamoDB Accelerator)** : payant à l'instance.

---

## 5. Pricing S3

### 5.1 — Storage par classe (eu-west-1, ~/GB/mois)

| Classe                              | Tarif     |
| ----------------------------------- | --------- |
| Standard                            | 0,023 $   |
| Intelligent-Tiering Frequent        | 0,023 $   |
| Intelligent-Tiering Infrequent      | 0,0125 $  |
| Intelligent-Tiering Archive Instant | 0,004 $   |
| Intelligent-Tiering Archive (FR)    | 0,0036 $  |
| Intelligent-Tiering Deep Archive    | 0,00099 $ |
| Standard-IA                         | 0,0125 $  |
| One Zone-IA                         | 0,01 $    |
| Glacier Instant Retrieval           | 0,004 $   |
| Glacier Flexible Retrieval          | 0,0036 $  |
| Glacier Deep Archive                | 0,00099 $ |
| Express One Zone                    | 0,16 $    |

### 5.2 — Requests

| Type                         | Tarif (~/1000)                         |
| ---------------------------- | -------------------------------------- |
| PUT / COPY / POST (Standard) | 0,005 $                                |
| GET / SELECT (Standard)      | 0,0004 $                               |
| Lifecycle transitions        | 0,01 $                                 |
| Glacier retrieval (Flexible) | Variable (Expedited / Standard / Bulk) |

### 5.3 — Retrieval Glacier

| Classe                   | Coût retrieval     |
| ------------------------ | ------------------ |
| **Glacier IR**           | 0,03 $/GB          |
| **Glacier FR Standard**  | 0,01 $/GB, 3-5h    |
| **Glacier FR Bulk**      | 0,0025 $/GB, 5-12h |
| **Glacier FR Expedited** | 0,03 $/GB, 1-5 min |
| **Deep Archive Std**     | 0,02 $/GB, 12h     |
| **Deep Archive Bulk**    | 0,0025 $/GB, 48h   |

### 5.4 — Data transfer

- **Entrant** : gratuit.
- **OUT vers Internet** : ~0,09 $/GB (régressif).
- **OUT vers CloudFront** : **gratuit** (! gros levier d'optimisation).
- **Cross-region replication** : 0,02 $/GB + storage en double.

### 5.5 — Calcul exemple — bucket data lake 1 TB

**Cas** : 1 TB de logs, 100k PUT/mois, 1M GET/mois, lifecycle vers IA à J+30.

**Hypothèse répartition** :

- 100 GB en Standard (récents).
- 900 GB en Standard-IA.

```text
Storage Standard   : 100 GB × 0,023 $ = 2,30 $
Storage IA         : 900 GB × 0,0125 $ = 11,25 $
PUT                : 100k × 0,005 $/1000 = 0,50 $
GET                : 1M × 0,0004 $/1000 = 0,40 $
Lifecycle transitions : 100k × 0,01 $/1000 = 1 $
Data transfer (interne Athena) : ~gratuit
──────────────────────────────────────────────
TOTAL                                    ≈ 15,45 $/mois
```

Sans lifecycle (tout en Standard) : 23 $/mois. **Économie 33 %** avec lifecycle.

### 5.6 — Calcul exemple — site web avec CloudFront

**Cas** : 1 TB images servies à 1M users/mois.

**Sans CloudFront** :

```text
Storage : 1 TB × 0,023 = 23,50 $
Transfer OUT vers Internet : 1 TB × 0,09 = 92 $
Total : ~116 $/mois
```

**Avec CloudFront** (cache hit 90 %) :

```text
Storage S3 : 23,50 $
Transfer S3 → CloudFront : 100 GB × 0 = 0 (gratuit)
Transfer CloudFront → Internet : 1 TB × 0,085 = 87 $
Total : ~110 $/mois (peu de différence à ce volume)
```

**Avec CloudFront + bucket key + Intelligent-Tiering** (cas optimisé pour gros volumes) : économies plus importantes à 10+ TB.

---

## 6. Pricing EBS / EFS

### 6.1 — EBS — par type

| Type                  | $/GB/mois    | $/IOPS                              | $/MiB-s                           |
| --------------------- | ------------ | ----------------------------------- | --------------------------------- |
| **gp3**               | 0,0922       | 3000 inclus, 0,006 $/IOPS au-delà   | 125 inclus, 0,048 $/MiB-s au-delà |
| **gp2**               | 0,110        | IOPS gérées                         | -                                 |
| **io1**               | 0,138        | 0,072 $                             | -                                 |
| **io2**               | 0,138        | 0,072 $ (premier palier, dégressif) | -                                 |
| **io2 Block Express** | 0,138 + tier | 0,072 $-0,032 $                     | -                                 |
| **st1**               | 0,045        | (HDD)                               | -                                 |
| **sc1**               | 0,025        | (HDD)                               | -                                 |

### 6.2 — EBS Snapshot

- Standard (S3 backed) : 0,05 $/GB/mois.
- **Archive (S3 Glacier)** : 0,0125 $/GB/mois (snapshots > 90j peuvent y aller).

### 6.3 — Calcul exemple — EBS 500 GB gp3

```text
Storage      : 500 GB × 0,0922 $ = 46,10 $
IOPS inclus  : 3000 (suffisant pour 99 % usages)
Snapshots (50 % size, accumulés) : 250 GB × 0,05 $ = 12,50 $
──────────────────────────────────────────────
TOTAL                              ≈ 58,60 $/mois
```

### 6.4 — EFS — par classe

| Classe      | $/GB/mois |
| ----------- | --------- |
| Standard    | 0,30      |
| Standard-IA | 0,025     |
| One Zone    | 0,16      |
| One Zone-IA | 0,0133    |

**Throughput** :

- **Bursting** : inclus.
- **Provisioned** : 6 $/MB-s/mois.
- **Elastic** : 0,03 $/GB read + 0,06 $/GB write.

### 6.5 — Calcul exemple — EFS 200 GB

**Cas** : 200 GB répartis 50/50 Standard / IA, 1 TB/mois read en mode Elastic.

```text
Standard storage : 100 GB × 0,30 = 30 $
IA storage       : 100 GB × 0,025 = 2,50 $
Read throughput  : 1024 GB × 0,03 = 30,72 $
──────────────────────────────────────────
TOTAL                              ≈ 63 $/mois
```

---

## 7. Estimer une app type — méthodologie

### 7.1 — Les étapes

1. **Inventaire** : lister chaque ressource (instance, table, bucket, …).
2. **Volumétrie** : pour chaque, estimer la volumétrie (GB, requêtes/mois, IOPS).
3. **Recherche tarifaire** : trouver le tarif unitaire (Pricing Calculator).
4. **Calcul** : multiplier.
5. **Frais réseau** : ajouter le transfer OUT.
6. **Marge** : ajouter 10-30 % pour les imprévus.

### 7.2 — Template d'estimation

| Service       | Détail                             | Coût mensuel | Notes |
| ------------- | ---------------------------------- | ------------ | ----- |
| EC2 / Lambda  | Type × heures                      |              |       |
| RDS / Aurora  | Instance + storage + backup        |              |       |
| DynamoDB      | Mode + reads + writes + storage    |              |       |
| S3            | Classes + requests + retrieval     |              |       |
| EBS           | Volume × type + snapshots          |              |       |
| EFS           | Volume × classes + throughput      |              |       |
| Data transfer | OUT Internet + cross-region        |              |       |
| Réseau        | NAT GW + LBs + endpoints           |              |       |
| Monitoring    | CloudWatch logs + metrics + alarms |              |       |
| Marge 20 %    | (somme × 0,20)                     |              |       |
| **TOTAL**     |                                    |              |       |

### 7.3 — Exemple complet — app SaaS moyenne

**Hypothèses** :

- 5 000 utilisateurs actifs.
- API REST sur 2 EC2 m6g.large.
- DB : Aurora Postgres `r6g.large` Multi-AZ + read replica.
- DynamoDB pour sessions (10M reads, 1M writes/mois).
- S3 pour uploads (500 GB, 100k PUT, 1M GET).
- CloudFront + ALB + Route 53.

| Poste                              | Calcul                                    | $/mois          |
| ---------------------------------- | ----------------------------------------- | --------------- |
| 2 EC2 m6g.large                    | 0,096 × 2 × 730                           | 140             |
| Aurora `r6g.large` writer + reader | 0,29 × 2 × 730                            | 423             |
| Aurora storage 100 GB              | 100 × 0,10                                | 10              |
| Aurora I/O (Standard)              | ~estimation 2M × 0,20                     | 0,40            |
| DynamoDB On-Demand                 | 10M × 0,25/M + 1M × 1,25/M + 20 GB × 0,30 | 6,30            |
| S3 Standard 500 GB                 | 500 × 0,023 + requests + transfer         | 14              |
| ALB                                | ~16 + LCU                                 | 25              |
| CloudFront 200 GB OUT              | 200 × 0,085                               | 17              |
| Route 53                           | 0,50 + requests                           | 1               |
| NAT GW 2 AZ                        | 2 × 33 + trafic                           | 70              |
| CloudWatch (logs 50 GB, 20 alarms) | 50 × 0,57 + 20 × 0,10                     | 31              |
| **Sous-total**                     |                                           | **738**         |
| Marge 20 %                         |                                           | 148             |
| **TOTAL**                          |                                           | **~886 $/mois** |

À garder en mémoire : **~900 $/mois** pour une app SaaS 5 000 users avec une archi proprement Multi-AZ. C'est l'**ordre de grandeur** à connaître.

---

## 8. Outils AWS pour estimer

### 8.1 — AWS Pricing Calculator

**Outil web officiel** : [AWS Pricing Calculator](https://calculator.aws)

- Ajouter les services un par un.
- Configurer chaque service (région, classe, volume).
- Sauvegarder l'estimation, la partager.

**Recommandation** : **avant** chaque nouveau projet, faire une estimation officielle. Source de vérité de la prévision.

### 8.2 — AWS Cost Explorer

**Pour les comptes existants** :

- Visualiser les coûts passés (12 mois).
- Grouper par service / tag / région / linked account.
- Projections futures (basées sur l'historique).
- Recommandations (Reserved Instances, Savings Plans).

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-05-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### 8.3 — AWS Budgets

Configurer des **budgets mensuels** avec alertes :

```bash
aws budgets create-budget \
  --account-id ACCOUNT \
  --budget '{
    "BudgetName": "monthly-budget",
    "BudgetLimit": {"Amount": "1000", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[...]'
```

→ Email à 50 %, 80 %, 100 % du budget.

### 8.4 — AWS Compute Optimizer

**Recommandations** d'optimisation pour EC2, RDS, EBS, Auto Scaling, Lambda.

- Détecte les ressources sous-utilisées.
- Propose des classes / sizes optimisées.
- Estime les économies.

Activer dans la console pour avoir les recommandations.

### 8.5 — Cost Anomaly Detection

ML-based : détecte les **dépenses anormales** et alerte automatiquement.

Activer dans Cost Explorer → Cost Anomaly Detection.

---

## 9. Leviers d'optimisation — récap

### 9.1 — Storage

| Levier                                           | Économie typique                           |
| ------------------------------------------------ | ------------------------------------------ |
| **Lifecycle S3** vers IA / Glacier               | **70-90 %** sur les anciens objets.        |
| **Intelligent-Tiering** par défaut               | 30-50 % vs Standard pour pattern variable. |
| **EBS gp2 → gp3**                                | ~20 %.                                     |
| **Snapshot Archive** > 90j                       | ~75 %.                                     |
| **Compression** (gzip) sur logs S3               | 50-80 %.                                   |
| **Suppression** des objets / snapshots obsolètes | Très variable.                             |

### 9.2 — Database

| Levier                                       | Économie typique     |
| -------------------------------------------- | -------------------- |
| **Reserved Instances** RDS 1-3 ans           | 30-70 %.             |
| **Aurora Serverless v2** sur charge variable | 30-60 %.             |
| **Right-sizing** (audit Compute Optimizer)   | 20-40 %.             |
| **Read replicas** seulement si nécessaires   | Variable.            |
| **DynamoDB On-Demand vs Provisioned**        | 30-70 % selon usage. |
| **DynamoDB Standard-IA** sur tables peu lues | ~60 %.               |
| **GSI** projection minimale                  | 20-40 % par GSI.     |

### 9.3 — Réseau

| Levier                              | Économie typique                                   |
| ----------------------------------- | -------------------------------------------------- |
| **CloudFront** devant les assets    | 80-90 % sur transfer OUT.                          |
| **VPC Endpoints S3 (Gateway)**      | 100 % sur trafic S3 via NAT.                       |
| **NAT Gateway partagé** (1 vs 3 AZ) | Économies sur NAT idle (au prix de la résilience). |
| **Compression HTTP**                | 60-80 % sur transfer.                              |

### 9.4 — Compute

| Levier                                   | Économie typique |
| ---------------------------------------- | ---------------- |
| **Graviton (g)** instances               | ~20 %.           |
| **Spot instances** (EC2 / EMR)           | 50-90 %.         |
| **Savings Plans / Reserved Instances**   | 30-70 %.         |
| **Auto Scaling** down la nuit / weekends | 30-50 %.         |

---

## 10. Mini-projet final du parcours — app stateful

**Mini-projet final** = construire une app stateful avec **RDS + DynamoDB + S3**, avec **lifecycle, versioning et backup automatisé**, et **chiffrée**.

### 10.1 — Énoncé

Vous concevez une **plateforme de gestion documentaire** :

- **Utilisateurs** : 1 000 utilisateurs B2B.
- **Données structurées** (utilisateurs, métadonnées documents) : PostgreSQL (Aurora ou RDS).
- **Sessions / cache d'auth** : DynamoDB (lecture rapide).
- **Documents** (PDF, images) : S3 avec lifecycle vers Glacier après 90j, versioning activé.
- **Backups automatisés** : RDS auto-backup 14j + snapshot manuel mensuel.

### 10.2 — Architecture cible

```text
┌──────────────┐
│ App Frontend │
└──────┬───────┘
       │ HTTPS
       ▼
┌──────────────┐    ┌──────────────┐
│   ALB        │ ←──│ Cognito      │ (vu en AWS Identity)
└──────┬───────┘    └──────────────┘
       │
       ▼
┌──────────────┐
│  Lambda /    │
│  ECS Fargate │
└──────┬───────┘
       │
       ├──────────────────────────────────────┐
       │                                      │
       ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐
│ Aurora Postgres  │                  │   DynamoDB       │
│ Multi-AZ         │                  │ (sessions/cache) │
│ KMS encrypted    │                  │ KMS encrypted    │
│ Backup 14j +     │                  │ PITR             │
│ snapshots mensuel│                  │                  │
└──────────────────┘                  └──────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ S3 Bucket "documents"                │
│ Versioning enabled                   │
│ KMS encrypted                        │
│ Lifecycle :                          │
│   J+30  → IA                         │
│   J+90  → Glacier IR                 │
│   J+730 → Deep Archive               │
│ Block public access                  │
└──────────────────────────────────────┘
```

### 10.3 — Étapes de mise en œuvre

#### Étape 1 — VPC (réutiliser l'existant)

Réutiliser le VPC à 2 AZ du parcours **AWS Networking M2**.

#### Étape 2 — KMS CMK

```bash
KEY_ID=$(aws kms create-key \
  --description "Mini-projet storage" \
  --query 'KeyMetadata.KeyId' --output text)
aws kms create-alias --alias-name alias/mp-storage --target-key-id $KEY_ID
aws kms enable-key-rotation --key-id $KEY_ID
```

#### Étape 3 — Aurora PostgreSQL Multi-AZ

```bash
aws rds create-db-cluster \
  --db-cluster-identifier mp-aurora \
  --engine aurora-postgresql \
  --engine-version 16.4 \
  --master-username admin \
  --master-user-password "MP-Strong-2026!" \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids $SG_DB \
  --backup-retention-period 14 \
  --storage-encrypted \
  --kms-key-id alias/mp-storage \
  --enable-cloudwatch-logs-exports '["postgresql"]'

# Writer + Reader
for role in writer reader; do
  aws rds create-db-instance \
    --db-instance-identifier mp-aurora-$role \
    --db-cluster-identifier mp-aurora \
    --engine aurora-postgresql \
    --db-instance-class db.r6g.large
done
```

#### Étape 4 — DynamoDB pour sessions

```bash
aws dynamodb create-table \
  --table-name mp-sessions \
  --attribute-definitions \
    AttributeName=session_id,AttributeType=S \
  --key-schema \
    AttributeName=session_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification "Enabled=true,SSEType=KMS,KMSMasterKeyId=alias/mp-storage" \
  --time-to-live-specification "AttributeName=expires_at,Enabled=true"

# Activer PITR
aws dynamodb update-continuous-backups \
  --table-name mp-sessions \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

`TTL` sur l'attribut `expires_at` → DynamoDB supprime automatiquement les sessions expirées.

#### Étape 5 — S3 documents avec versioning + lifecycle

```bash
BUCKET=mp-documents-$(aws sts get-caller-identity --query Account --output text)
aws s3 mb s3://$BUCKET --region eu-west-1

# Block public access
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Versioning
aws s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled

# KMS encryption
aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "alias/mp-storage"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Lifecycle
cat > lifecycle.json <<EOF
{
  "Rules": [
    {
      "ID": "documents-tiering",
      "Status": "Enabled",
      "Filter": {"Prefix": "documents/"},
      "Transitions": [
        {"Days": 30, "StorageClass": "STANDARD_IA"},
        {"Days": 90, "StorageClass": "GLACIER_IR"},
        {"Days": 730, "StorageClass": "DEEP_ARCHIVE"}
      ]
    },
    {
      "ID": "noncurrent-versions",
      "Status": "Enabled",
      "Filter": {},
      "NoncurrentVersionTransitions": [
        {"NoncurrentDays": 30, "StorageClass": "STANDARD_IA"}
      ],
      "NoncurrentVersionExpiration": {"NoncurrentDays": 180}
    },
    {
      "ID": "abort-multipart",
      "Status": "Enabled",
      "Filter": {},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET \
  --lifecycle-configuration file://lifecycle.json
```

#### Étape 6 — Backup automatisé via AWS Backup

```bash
# Backup plan
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName": "mp-monthly",
  "Rules": [{
    "RuleName": "MonthlySnapshot",
    "TargetBackupVaultName": "Default",
    "ScheduleExpression": "cron(0 5 1 * ? *)",
    "Lifecycle": {"DeleteAfterDays": 365}
  }]
}'

# Sélection des ressources
aws backup create-backup-selection \
  --backup-plan-id <PLAN_ID> \
  --backup-selection '{
    "SelectionName": "AuroraDDB",
    "IamRoleArn": "arn:aws:iam::ACCOUNT:role/service-role/AWSBackupDefaultServiceRole",
    "Resources": [
      "arn:aws:rds:eu-west-1:ACCOUNT:cluster:mp-aurora",
      "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/mp-sessions"
    ]
  }'
```

#### Étape 7 — Estimation de coût

| Poste                                                 | $/mois          |
| ----------------------------------------------------- | --------------- |
| Aurora r6g.large × 2                                  | 423             |
| Aurora storage 100 GB                                 | 10              |
| Aurora I/O Standard                                   | ~5              |
| DynamoDB On-Demand (5M req/mois)                      | 7               |
| S3 1 TB (mix Standard / IA / Glacier après lifecycle) | 18              |
| S3 requests + transfer                                | 5               |
| KMS (1 CMK + API)                                     | 1,50            |
| AWS Backup                                            | ~5              |
| Sous-total                                            | **475**         |
| Marge 20 %                                            | 95              |
| **TOTAL**                                             | **~570 $/mois** |

### 10.4 — Livrables attendus

Un **dépôt Git** contenant :

- **Code / Infra** : Terraform / CloudFormation / scripts CLI.
- **Documentation** (3-5 pages) :
  - Architecture (schéma).
  - Choix techniques (RDS vs Aurora, On-Demand vs Provisioned, classes S3).
  - Stratégie de backup (RDS auto + snapshot manuel + AWS Backup).
  - Stratégie de chiffrement (KMS partout).
  - Stratégie de lifecycle (S3).
  - **Estimation détaillée du coût mensuel** ligne par ligne.

### 10.5 — Critères de validation

- [ ] **Aurora** Multi-AZ avec backup 14j et snapshots mensuels via AWS Backup.
- [ ] **DynamoDB** avec PITR activé et TTL configuré.
- [ ] **S3** avec versioning + lifecycle + chiffrement KMS + Block Public Access.
- [ ] **KMS** CMK custom avec rotation annuelle.
- [ ] **Estimation de coût** réaliste (à ±20 %).
- [ ] Tout est créé par le **code IaC** (reproductible).
- [ ] Cleanup script fonctionnel.

### 10.6 — Modes d'usage du livrable

- **Portfolio** : démonstration end-to-end de la maîtrise data/storage.
- **Référence interne** : template pour vrais projets.
- **Évolutions** :
  - Ajouter cross-region replication.
  - Ajouter Object Lock pour compliance.
  - Migrer vers Aurora Serverless v2.

### 10.7 — Cleanup

**Important** : nettoyer pour éviter la facturation continue (~500 $/mois si oublié).

```bash
aws rds delete-db-cluster --db-cluster-identifier mp-aurora --skip-final-snapshot
aws dynamodb delete-table --table-name mp-sessions
aws s3 rm s3://$BUCKET --recursive
aws s3 rb s3://$BUCKET
aws kms schedule-key-deletion --key-id $KEY_ID --pending-window-in-days 7
aws backup delete-backup-plan --backup-plan-id <PLAN_ID>
```

---

## 11. Exercices pratiques

### Exercice 1 — Estimer une stack (≈ 45 min)

**Cas.** Petite app SaaS B2B : 200 users, 1 EC2 t4g.medium, RDS Postgres t4g.medium (Single-AZ), S3 50 GB, peu de trafic.

**Livrable.** Tableau d'estimation détaillé.

### Exercice 2 — Comparer 2 architectures (≈ 30 min)

**Cas.** Pour 10M reads / 1M writes DynamoDB par mois :

- Mode A : On-Demand.
- Mode B : Provisioned 100 RCU + 20 WCU.

**Livrable.** Calcul + recommandation.

### Exercice 3 — Optimiser un bucket S3 (≈ 30 min)

**Cas.** Bucket 10 TB en Standard sans lifecycle, ~120 $/mois en storage seul (logs, accès rare passé 30j).

**Proposer un plan de lifecycle**, **calculer** les économies.

**Livrable.** Plan + nouveau coût estimé.

### Exercice 4 — Mini-projet final (≈ 1-2 jours)

**Objectif.** Suivre la section 10.

**Livrable.** Repo Git + doc avec estimation détaillée.

### Exercice 5 — Configurer AWS Budgets (≈ 20 min)

Sur votre compte sandbox :

1. Créer un budget mensuel de 50 $.
2. Configurer alertes à 50, 80, 100 %.
3. Tester en simulant un dépassement.

**Livrable.** Capture des notifications.

### Mini-défi — Plan FinOps trimestriel (≈ 30 min, papier)

**Cas.** Vous héritez d'un compte AWS qui coûte 5 000 $/mois sans visibilité.

**Plan en 5 étapes** sur 1 trimestre pour comprendre et optimiser :

1. Inventaire.
2. Identification top 5 postes.
3. Optimisations rapides.
4. Optimisations structurelles.
5. Monitoring continu.

**Livrable.** Plan documenté.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Énumérer les **6 axes de facturation** AWS (compute, storage, requests, transfer, throughput, ops).
- [ ] Donner les **tarifs approximatifs** pour : EC2 m6g.large, RDS r6g.large, S3 Standard, DynamoDB On-Demand reads.
- [ ] Énoncer le **piège transfer OUT** (0,09 $/GB).
- [ ] Différencier **DynamoDB On-Demand vs Provisioned** côté coût.
- [ ] Calculer un **coût Aurora** (instance + storage + I/O) de mémoire.
- [ ] Calculer un **coût S3** mixant classes.
- [ ] Donner le **gain de lifecycle** S3 (Standard → IA = ~46 %, → Glacier = ~85 %).
- [ ] Citer **3 leviers** d'optimisation storage et **3 leviers** database.
- [ ] Utiliser **Pricing Calculator** pour estimer une stack.
- [ ] Configurer **AWS Budgets** + **Cost Anomaly Detection**.
- [ ] Estimer une **app SaaS moyenne** (~900 $/mois pour 5000 users avec Multi-AZ).

### Items du glossaire visés

**N2 atteint** :

- _calcul du coût des services de storage en fonction d'un besoin donné_ — sections 5, 6.
- _calcul du coût des services de database en fonction d'un besoin donné_ — sections 3, 4.

À l'issue du mini-projet final, l'apprenant atteint le niveau **Confirmé 2** ciblé par le parcours **AWS Database et Storage**.

**Pour aller plus loin (N3, non couvert)** :

- Cluster RDS / ElastiCache integration.
- Point-in-time recovery DynamoDB.
- Change Data Capture via DynamoDB Stream.
- Encryption at rest / SSE-KMS S3 détaillé.
- Concurrency S3, métriques monitoring S3.
- MemoryDB, DocumentDB, FileCache.

---

## 13. Ressources complémentaires

### Documentation AWS

- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/)
- [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/)
- [Compute Optimizer](https://aws.amazon.com/compute-optimizer/)
- [Cost Anomaly Detection](https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/)

### Bonnes pratiques

- [AWS Well-Architected — Cost Optimization Pillar](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html)
- [FinOps Foundation](https://www.finops.org/)

### Outils tiers

- [Vantage](https://www.vantage.sh/) — observability FinOps.
- [Infracost](https://www.infracost.io/) — estimation depuis Terraform.

### Synthèse du parcours AWS Database et Storage

Le parcours se referme ici. À ce stade :

- **M1** — Tour d'horizon : cartographie SQL / NoSQL / object / block / file.
- **M2** — RDS / Aurora provisionnement.
- **M3** — RDS / Aurora backups.
- **M4** — DynamoDB bases.
- **M5** — DynamoDB limites et index.
- **M6** — S3 cycle de vie et versioning.
- **M7** — EBS, EFS, S3 différenciés.
- **M8** (ce module) — Coûts + mini-projet final.

L'apprenant est désormais **Confirmé N2** sur AWS Database et Storage — capable de **choisir, dimensionner, sécuriser et budgéter** une stack stateful AWS de production.
