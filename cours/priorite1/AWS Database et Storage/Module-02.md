# M2 — RDS / Aurora — Provisionnement

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir une **classe d'instance RDS / Aurora** : nomenclature `<famille>.<génération>.<taille>` (par exemple `db.m6i.large`, `db.r7g.2xlarge`).
- Distinguer les **familles d'instances** : **M** (généraliste), **R** (memory-optimized), **T** (burstable), **X** (extra memory), **Aurora Serverless v2** (ACU-based), et savoir laquelle utiliser quand (item N2 explicite).
- Choisir une **classe d'instance adaptée** à un besoin donné en pondérant CPU, RAM, IOPS, débit réseau, prix, et savoir lire les bornes (vCPU, GiB RAM, network).
- Distinguer les **types de storage RDS** : **gp3** (général), **io1 / io2** (IOPS provisionnées), **st1 / sc1** (legacy, throughput-optimized), **Aurora distributed storage** (architecture distincte).
- Comprendre la topologie d'un **cluster Aurora** : 1 writer + N readers, storage layer distribué, endpoint réservé pour les readers.
- Distinguer **Multi-AZ** (HA standby) et **Read Replicas** (scaling lectures).
- **Provisionner une instance RDS** (et un cluster Aurora) end-to-end : subnet group, security group, parameter group, instance class, storage, encryption, backup, maintenance window.
- Reconnaître les **anti-patterns** : surdimensionner par défaut, utiliser T burstable en prod sans burst credits maîtrisés, ne pas activer Multi-AZ en prod.

## Durée estimée

1 jour.

## Pré-requis

- M1 (tour d'horizon).
- Parcours **AWS Networking** : VPC à 2 AZ, subnets privés, security groups (pour le DB subnet group).
- AWS CLI v2 avec permissions `rds:*`, `ec2:*` (pour SG / subnets).
- Notions de base SGBD : connection pool, IOPS, latence.

---

## 1. Pourquoi le provisionnement est critique

### 1.1 — Le problème

Provisionner une base RDS / Aurora demande de choisir :

- **Classe d'instance** : ~50 options de la `db.t4g.micro` (1 vCPU, 1 GB) à `db.r7g.16xlarge` (64 vCPU, 512 GB).
- **Storage type** : gp3, io1, io2, ou Aurora.
- **Storage size** : 20 GB à 65 TB.
- **IOPS** : autoallouées ou provisionnées.
- **Multi-AZ** ou pas.
- **Read replicas** ou pas.
- **Backup retention** (M3).
- **Parameter group** (custom configuration).
- **VPC, subnets, SG** (vu en Networking).

**Erreur classique** : sous-dimensionner ou sur-dimensionner. Conséquences :

- **Sous-dimensionner** : latence, throttling, downtime → urgent à corriger.
- **Sur-dimensionner** : facture 2-5× trop élevée, sans bénéfice → durable.

### 1.2 — L'analogie de la voiture

Choisir une instance RDS, c'est comme choisir une **voiture** :

- **T4g.micro** (1 vCPU) : scooter — pour aller au coin, pas pour autoroute.
- **m6i.large** (2 vCPU, 8 GB) : citadine — usage quotidien moyen.
- **r6i.xlarge** (4 vCPU, 32 GB) : break confortable — beaucoup de mémoire, jolies passagères.
- **r7g.16xlarge** (64 vCPU, 512 GB) : camion — gros workload, lourd à manœuvrer et cher.

Trop petit → on cale. Trop gros → on paie l'essence pour rien.

### 1.3 — La règle de migration

Provisionner n'est **pas définitif** :

- **Instance class** : modifiable à chaud (downtime ~3-5 min sans Multi-AZ, ~30s avec).
- **Storage size** : peut **grandir** (pas réduire).
- **Storage type** : modifiable (downtime court, scaling progressif).
- **Multi-AZ** : activable / désactivable.

Donc **partir conservateur** et ajuster à l'usage. Mais éviter le yo-yo (chaque resize = stress).

---

## 2. Anatomie d'une instance RDS

### 2.1 — Composants

```text
┌──────────────────────────────────────────────────────────┐
│ RDS DB Instance                                          │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │ Compute (EC2 sous-jacente, managée)      │            │
│  │  - Class : db.m6i.large (2 vCPU, 8 GiB)  │            │
│  │  - Engine : PostgreSQL 16                │            │
│  └──────────────┬───────────────────────────┘            │
│                 │                                        │
│                 ▼                                        │
│  ┌──────────────────────────────────────────┐            │
│  │ Storage (EBS sous-jacent)                │            │
│  │  - Type : gp3                            │            │
│  │  - Size : 100 GB                         │            │
│  │  - IOPS : 3000 (par défaut gp3)          │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  Subnet group : 2+ subnets en 2+ AZ                       │
│  Security Group : contrôle d'accès réseau                │
│  Parameter Group : config du moteur (work_mem, …)        │
│  Option Group : extensions (ex: cmd line tools Oracle)   │
│  Backup window : 1h/jour de snapshot                      │
│  Maintenance window : 1h/semaine pour patch              │
└──────────────────────────────────────────────────────────┘
```

### 2.2 — Distinctions Aurora

Pour **Aurora**, le storage est **séparé** des instances :

```text
┌──────────────────────────────────────────────────────────┐
│ Aurora Cluster                                           │
│                                                          │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐      │
│  │ Writer     │    │ Reader 1   │    │ Reader 2   │      │
│  │ db.r6g.xlg │    │ db.r6g.lg  │    │ db.r6g.lg  │      │
│  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘      │
│        │                 │                 │              │
│        └─────────────────┴─────────────────┘              │
│                          │                                │
│                          ▼                                │
│        ┌──────────────────────────────────────────┐       │
│        │ Aurora Storage Layer                     │       │
│        │  - 6 copies sur 3 AZ                     │       │
│        │  - Auto-scaling 10 GB → 128 TB           │       │
│        │  - Storage facturé à part                │       │
│        └──────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

Les **instances** sont essentiellement du compute. Le **storage** est distribué et auto-géré par AWS.

---

## 3. Les classes d'instances (item N2 explicite)

C'est **l'item N2 central** : savoir choisir une classe.

### 3.1 — La nomenclature

```text
db.m6i.large
   │  │ │
   │  │ └── Taille : nano, micro, small, medium, large, xlarge, 2xlarge, ..., 32xlarge
   │  └──── Génération : 5, 6, 6g (Graviton), 6i (Intel), 7g, 7i...
   └─────── Famille : T (burstable), M (general), R (mem), X (high mem), …
```

### 3.2 — Les familles principales

| Famille | Caractéristique    | Ratio vCPU:RAM (par vCPU) | Cas d'usage typique                             |
| ------- | ------------------ | ------------------------- | ----------------------------------------------- |
| **T**   | Burstable CPU      | 1:2 à 1:4                 | Dev, staging, prod faible (< 50 % CPU continu). |
| **M**   | Général équilibré  | 1:4                       | Apps moyennes, charges variables modérées.      |
| **R**   | Memory-optimized   | 1:8                       | Cache lourd, analytics, sessions volumineuses.  |
| **X**   | Extra memory       | 1:16+                     | In-memory DBs, SAP HANA, Aurora I/O bound.      |
| **Z**   | High frequency CPU | 1:8                       | Workloads CPU-intensifs.                        |

### 3.3 — Les générations

À chaque nouvelle génération, AWS améliore prix/perf :

| Génération          | Processeur                         | Économie / perf                               |
| ------------------- | ---------------------------------- | --------------------------------------------- |
| **5** (legacy)      | Intel Xeon                         | À éviter pour nouveau projet.                 |
| **6** (i = Intel)   | Intel Xeon Cascade Lake            | Solide.                                       |
| **6g** (Graviton 2) | ARM AWS Graviton                   | **~20 % moins cher** que m6i, **bonne perf**. |
| **7g / 7i**         | Graviton 3 / Intel Sapphire Rapids | Dernière, le top.                             |

**Recommandation 2026** : **Graviton (g)** sauf incompatibilité applicative (rare). Économies évidentes.

### 3.4 — Les tailles

| Taille      | vCPU | Mémoire | Bande passante réseau |
| ----------- | ---- | ------- | --------------------- |
| nano        | 2    | 0,5 GB  | Jusqu'à 5 Gbps        |
| micro       | 2    | 1 GB    | Jusqu'à 5 Gbps        |
| small       | 2    | 2 GB    | Jusqu'à 5 Gbps        |
| medium      | 2    | 4 GB    | Jusqu'à 5 Gbps        |
| **large**   | 2    | 8 GB    | Jusqu'à 10 Gbps       |
| **xlarge**  | 4    | 16 GB   | Jusqu'à 10 Gbps       |
| **2xlarge** | 8    | 32 GB   | Jusqu'à 10 Gbps       |
| 4xlarge     | 16   | 64 GB   | Jusqu'à 10 Gbps       |
| 8xlarge     | 32   | 128 GB  | 10 Gbps               |
| 16xlarge    | 64   | 256 GB  | 20 Gbps               |
| 24xlarge    | 96   | 384 GB  | 20 Gbps               |

Pour la famille **R** : doubler la RAM (large = 16 GB au lieu de 8).

### 3.5 — Tableau de choix par profil

| Profil de charge                        | Classe recommandée                    |
| --------------------------------------- | ------------------------------------- |
| Dev / pré-prod, < 50 GB                 | `db.t4g.medium` (Burstable, ~$0.08/h) |
| Petite prod (1k req/min, < 100 GB)      | `db.m6g.large` ou `db.t4g.large`      |
| Prod moyenne (10k req/min, 100 GB-1 TB) | `db.m6g.xlarge` à `db.m6g.2xlarge`    |
| Charge mémoire (analytics, cache lourd) | `db.r6g.xlarge` à `db.r6g.4xlarge`    |
| Charge écriture massive                 | `db.m6g.4xlarge` + IOPS provisionnées |
| Workload variable / sporadique          | **Aurora Serverless v2**              |
| Très gros workload                      | `db.r7g.16xlarge`+ + cluster Aurora   |

### 3.6 — Aurora Serverless v2 — la dimension élastique

**Aurora Serverless v2** ne se choisit pas comme une classe figée mais comme une **plage de capacité** :

- **ACU** (Aurora Capacity Unit) = 2 GB RAM + CPU proportionnel.
- Plage : `min ACU` → `max ACU` (ex: 0,5 ACU min, 16 ACU max).
- AWS scale **automatiquement** en quelques secondes.
- Tarif : ~0,12 $/ACU-heure.

**Idéal pour** :

- Charge variable (jour vs nuit, peaks saisonniers).
- Dev / staging.
- Apps sporadiques.

À éviter pour des charges **constantes** : provisioned est moins cher à charge stable.

### 3.7 — Le piège du Burstable (T)

Les classes **T** ont du **CPU burstable** : elles fonctionnent à un **baseline** (10-40 % CPU selon taille) avec des **credits** pour dépasser.

- Sous le baseline : on accumule des credits.
- Au-delà : on consomme les credits.
- Credits épuisés : CPU bridé au baseline → **latence catastrophique**.

**Mode "unlimited"** (par défaut sur T3+) : on **paie** les bursts au-delà des credits. Permet de ne pas s'effondrer, mais peut coûter cher.

**Recommandation** :

- **T pour dev / staging / faible prod** : OK.
- **T en prod sérieuse** : surveillance étroite + alarmes sur CPU credits.
- **M pour prod stable** : sans surprise.

---

## 4. Storage types

### 4.1 — Pour RDS classique

| Type                                  | Description             | IOPS                                            | Cas d'usage                                 |
| ------------------------------------- | ----------------------- | ----------------------------------------------- | ------------------------------------------- |
| **gp3** (général SSD, défaut moderne) | Performance prédictible | 3000 baseline + provisionnable jusqu'à 16k IOPS | **La norme actuelle**.                      |
| **gp2** (legacy)                      | SSD basé sur la taille  | 3 IOPS/GB jusqu'à 16k                           | À migrer vers gp3.                          |
| **io1 / io2** (provisioned IOPS)      | SSD haute perf          | Jusqu'à 256k IOPS                               | Workloads très intensifs (banque, trading). |
| **io2 Block Express** (premium)       | Ultra haute perf        | Jusqu'à 256k IOPS, latence < 1 ms               | Workloads critiques.                        |
| **st1 / sc1** (legacy HDD)            | Magnétique              | Bas                                             | À ne plus utiliser pour DB.                 |

**Recommandation 2026** : **gp3** par défaut. `io2` pour charges très intensives.

### 4.2 — Pour Aurora

Aurora a son **propre layer de storage distribué**. On ne choisit **pas** de type de disque. AWS gère :

- 6 copies sur 3 AZ (durabilité).
- Auto-scaling de 10 GB à 128 TB.
- Tarif : ~0,10 $/GB/mois (storage) + 0,20 $/million d'I/O.

**Important** : Aurora **facture les I/O séparément** (sauf en mode **Aurora I/O-Optimized** depuis 2023, qui inclut les I/O).

### 4.3 — Aurora Standard vs I/O-Optimized

| Mode                     | Coût compute | Coût storage | Coût I/O         | Cas d'usage                   |
| ------------------------ | ------------ | ------------ | ---------------- | ----------------------------- |
| **Aurora Standard**      | Standard     | 0,10 $/GB    | **0,20 $/M I/O** | Workloads moyens (<25 % I/O). |
| **Aurora I/O-Optimized** | +30 % cher   | 0,225 $/GB   | **Gratuit**      | Workloads I/O-intensifs.      |

**Quand basculer en I/O-Optimized** : si > 25 % de la facture Aurora vient des I/O → I/O-Optimized devient moins cher.

### 4.4 — IOPS et débit — comment dimensionner

**Règle empirique** :

- **OLTP léger** : 3000 IOPS suffit (gp3 défaut).
- **OLTP moyen** : 5000-10000 IOPS.
- **OLTP lourd** (10k+ TPS) : > 10000 IOPS provisionnées (gp3 ou io2).
- **Analytics** : moins IOPS, plus de **débit** (MB/s).

Monitorer **`WriteIOPS`** et **`ReadIOPS`** CloudWatch et ajuster.

---

## 5. Aurora — cluster topology

### 5.1 — Le cluster

Un **Aurora cluster** contient :

- **1 instance Writer** (la primaire, accepte les écritures).
- **0 à 15 instances Reader** (secondaires, accepte uniquement les lectures).
- **Un storage layer distribué** partagé.

### 5.2 — Les endpoints

Aurora expose **plusieurs endpoints DNS** :

| Endpoint              | Cible                              | Cas d'usage                     |
| --------------------- | ---------------------------------- | ------------------------------- |
| **Writer endpoint**   | L'instance writer actuelle         | Écritures, lectures cohérentes. |
| **Reader endpoint**   | Round-robin entre tous les readers | Lectures distribuées.           |
| **Custom endpoint**   | Subset choisi de readers           | Isolation analytique vs OLTP.   |
| **Instance endpoint** | Une instance précise               | Debug, cas spéciaux.            |

Quand le writer **tombe** :

1. Aurora promote un reader en writer (~30 s).
2. Le DNS du writer endpoint pointe vers le nouveau.
3. Les apps se reconnectent automatiquement (avec un client correct).

### 5.3 — Replication et lag

Les readers Aurora ont un **lag de réplication très court** (~20-100 ms typiquement) car la réplication est **physique** (au niveau storage), pas logique.

C'est **bien meilleur** que RDS Read Replicas (lag de plusieurs secondes possible).

### 5.4 — Cas d'usage des readers

- **Scaling des lectures** : reporting, dashboards, BI.
- **Isolation OLTP / analytique** : writer pour les transactions, custom endpoint pour les queries longues.
- **Tolérance aux pannes** : si writer tombe, un reader prend le relais.

---

## 6. Multi-AZ vs Read Replicas

### 6.1 — Multi-AZ (HA)

**Multi-AZ** = un standby synchrone dans une autre AZ. **Pas de read** sur le standby (jusqu'à RDS Multi-AZ Cluster récent).

| Aspect              | Détail                                         |
| ------------------- | ---------------------------------------------- |
| Réplication         | **Synchrone**                                  |
| Failover            | Automatique (~60 s pour RDS, ~30s Aurora)      |
| Lecture sur standby | **Non** (sauf Multi-AZ Cluster)                |
| Coût                | **Double** (2 instances)                       |
| Cas d'usage         | **Haute disponibilité** (obligatoire en prod). |

### 6.2 — Read Replicas

**Read Replicas** = copies asynchrones pour scaling des lectures.

| Aspect      | Détail                     |
| ----------- | -------------------------- |
| Réplication | Asynchrone (lag possible)  |
| Lecture     | **Oui**, séparée du writer |
| Failover    | Manuel ou via app          |
| Cas d'usage | **Scaling des lectures**.  |

### 6.3 — Aurora — Multi-AZ + Read Replicas en un

**Aurora** combine les deux concepts :

- Les **readers** servent à la fois pour le **scaling des lectures** **et** pour le **failover automatique** (HA).
- Pas besoin d'instance "standby" séparée comme pour RDS.

C'est un des **gros avantages** d'Aurora.

### 6.4 — Recommandations par environnement

| Environnement | Multi-AZ              | Read Replicas                |
| ------------- | --------------------- | ---------------------------- |
| Dev           | Non                   | Non                          |
| Staging       | Non                   | Non                          |
| Pré-prod      | Oui                   | Optionnel                    |
| Prod basique  | **Oui (obligatoire)** | Selon charge lecture         |
| Prod critique | **Oui**               | **Oui** (au moins 2 readers) |

---

## 7. Provisionner une instance RDS — pas à pas

L'objectif : créer une instance PostgreSQL avec configuration **production-like**.

### 7.1 — Plan

1. Subnet group (DB Subnet Group) sur 2+ AZ.
2. Security group.
3. Parameter group (optionnel — peut utiliser le défaut).
4. Instance class + storage.
5. Multi-AZ.
6. Backup window + retention.
7. Maintenance window.

### 7.2 — Étape 1 — DB Subnet Group

```bash
# Réutiliser les subnets privés du VPC créé en Networking M2
aws rds create-db-subnet-group \
  --db-subnet-group-name tp-rds-subnet-group \
  --db-subnet-group-description "TP RDS subnets" \
  --subnet-ids subnet-priv-a subnet-priv-b
```

### 7.3 — Étape 2 — Security Group

```bash
# SG qui autorise PostgreSQL (5432) depuis le SG de l'app
SG_DB=$(aws ec2 create-security-group \
  --group-name sg-tp-rds \
  --description "RDS PostgreSQL SG" \
  --vpc-id vpc-0xxx \
  --query 'GroupId' --output text)

# Autoriser depuis le SG d'app (par exemple sg-app)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_DB \
  --protocol tcp --port 5432 \
  --source-group sg-app
```

### 7.4 — Étape 3 — Créer l'instance

```bash
aws rds create-db-instance \
  --db-instance-identifier tp-postgres-1 \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16.4 \
  --master-username admin \
  --master-user-password "ChangeMe-2026-Strong!" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids $SG_DB \
  --db-subnet-group-name tp-rds-subnet-group \
  --backup-retention-period 7 \
  --preferred-backup-window "02:00-03:00" \
  --preferred-maintenance-window "Sun:03:00-Sun:04:00" \
  --no-multi-az \
  --storage-encrypted \
  --kms-key-id alias/aws/rds \
  --publicly-accessible false \
  --enable-cloudwatch-logs-exports '["postgresql"]' \
  --copy-tags-to-snapshot \
  --tags Key=Environment,Value=tp Key=Owner,Value=me

# Attendre la disponibilité (~5-10 min)
aws rds wait db-instance-available --db-instance-identifier tp-postgres-1
```

**Clés** :

- `--db-instance-class db.t4g.micro` : Graviton burstable, le moins cher.
- `--storage-type gp3` : recommandé.
- `--backup-retention-period 7` : 7 jours de PITR (vu en M3).
- `--storage-encrypted` + KMS : best practice.
- `--publicly-accessible false` : **toujours** en VPC privé.
- `--multi-az` (pas dans ce TP, mais à activer pour prod).

### 7.5 — Étape 4 — Récupérer l'endpoint et tester

```bash
ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier tp-postgres-1 \
  --query 'DBInstances[0].Endpoint.Address' --output text)

echo "Endpoint : $ENDPOINT"

# Depuis une EC2 dans le même VPC (avec sg-app attaché)
ssh ec2-user@ec2-bastion
psql -h $ENDPOINT -U admin -d postgres
```

### 7.6 — Étape 5 — Modifier à chaud

```bash
# Resizer l'instance (downtime ~3-5 min si pas Multi-AZ)
aws rds modify-db-instance \
  --db-instance-identifier tp-postgres-1 \
  --db-instance-class db.t4g.small \
  --apply-immediately
```

### 7.7 — Cleanup

```bash
aws rds delete-db-instance \
  --db-instance-identifier tp-postgres-1 \
  --skip-final-snapshot \
  --delete-automated-backups
```

---

## 8. Provisionner un cluster Aurora — pas à pas

### 8.1 — Création — 2 étapes

```bash
# 1. Cluster (storage + metadata)
aws rds create-db-cluster \
  --db-cluster-identifier tp-aurora-cluster \
  --engine aurora-postgresql \
  --engine-version 16.4 \
  --master-username admin \
  --master-user-password "ChangeMe-2026-Strong!" \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids $SG_DB \
  --backup-retention-period 7 \
  --storage-encrypted \
  --kms-key-id alias/aws/rds \
  --enable-cloudwatch-logs-exports '["postgresql"]' \
  --tags Key=Environment,Value=tp

# 2. Instance writer dans le cluster
aws rds create-db-instance \
  --db-instance-identifier tp-aurora-writer \
  --db-cluster-identifier tp-aurora-cluster \
  --engine aurora-postgresql \
  --db-instance-class db.r6g.large

# (Optionnel) 3. Reader
aws rds create-db-instance \
  --db-instance-identifier tp-aurora-reader-1 \
  --db-cluster-identifier tp-aurora-cluster \
  --engine aurora-postgresql \
  --db-instance-class db.r6g.large
```

### 8.2 — Endpoints

```bash
aws rds describe-db-clusters --db-cluster-identifier tp-aurora-cluster \
  --query 'DBClusters[0].{Writer:Endpoint, Reader:ReaderEndpoint, Port:Port}'

# Sortie :
# Writer : tp-aurora-cluster.cluster-xxx.eu-west-1.rds.amazonaws.com
# Reader : tp-aurora-cluster.cluster-ro-xxx.eu-west-1.rds.amazonaws.com
# Port : 5432
```

Côté app :

- **Writes** : utiliser le **Writer endpoint**.
- **Reads** : utiliser le **Reader endpoint** (round-robin auto).

### 8.3 — Aurora Serverless v2 — variante

```bash
aws rds create-db-cluster \
  --db-cluster-identifier tp-aurora-serverless \
  --engine aurora-postgresql \
  --engine-version 16.4 \
  --master-username admin \
  --master-user-password "ChangeMe-2026-Strong!" \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16 \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids $SG_DB

# Instance compatible Serverless v2
aws rds create-db-instance \
  --db-instance-identifier tp-aurora-serverless-instance \
  --db-cluster-identifier tp-aurora-serverless \
  --engine aurora-postgresql \
  --db-instance-class db.serverless
```

**Tarif** : 0,5 ACU × 0,12 $ × 730h = ~44 $/mois pour le minimum (vs ~150 $/mois pour une `r6g.large` toujours allumée).

---

## 9. Anti-patterns

| Anti-pattern                                                 | Conséquence                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| **Surdimensionner par défaut** "au cas où".                  | 2-5× le prix nécessaire. Scaler à la hausse est facile.         |
| **T burstable en prod sans monitoring** des credits.         | Latence catastrophique imprévisible.                            |
| **Pas de Multi-AZ** en prod.                                 | Une panne AZ = downtime applicatif.                             |
| **gp2 en 2026**.                                             | gp3 toujours meilleur.                                          |
| **Lancer une instance en subnet public**.                    | Surface d'attaque massive. Toujours en subnet privé.            |
| **Pas de chiffrement at-rest**.                              | Compliance (RGPD, HIPAA) à risque.                              |
| **Aurora Serverless v2 sans bornes max**.                    | Coût qui explose lors d'un peak imprévu.                        |
| **Connexion directe depuis Internet** (publicly-accessible). | Surface d'attaque, brute force.                                 |
| **Pas de tagging** des instances.                            | Audit et FinOps impossibles.                                    |
| **Master password partagé** entre devs.                      | Pas d'audit, rotation impossible. Utiliser **Secrets Manager**. |

---

## 10. Exercices pratiques

### Exercice 1 — Provisionner une instance RDS (≈ 45 min)

**Objectif.** L'item du glossaire pratique.

**Étapes :** suivre la section 7.

**Livrable.** Capture de l'instance créée + test de connexion psql.

### Exercice 2 — Provisionner un cluster Aurora (≈ 60 min)

**Étapes :** suivre la section 8 — cluster + writer + reader.

**Livrable.** Endpoints + test de connexion (writer + reader).

### Exercice 3 — Choisir une classe pour 3 profils (≈ 30 min)

**Cas A** : staging d'une app web, 5 GB de données, 100 req/min.

**Cas B** : production e-commerce, 200 GB, 5000 req/min, peaks Black Friday × 10.

**Cas C** : analytique interne, 500 GB, 10 requêtes/jour mais lourdes (joins sur 100M lignes).

**Livrable.** Classe + storage type + Multi-AZ + justification pour chaque cas.

### Exercice 4 — Comparer Aurora Serverless v2 vs Provisioned (≈ 30 min)

**Cas.** App avec charge :

- 6h-22h : 5 req/s.
- 22h-6h : 0,5 req/s.

**Calcul** :

- Aurora Provisioned `r6g.large` (toujours allumée).
- Aurora Serverless v2 (min 0,5 ACU, max 8 ACU).

**Livrable.** Coût mensuel comparatif + recommandation.

### Exercice 5 — Modifier une instance à chaud (≈ 20 min)

**Étapes :**

1. Sur l'instance de l'exercice 1, monter `db.t4g.micro` → `db.t4g.small`.
2. Mesurer le downtime (avec un test de connexion en boucle).
3. Augmenter le storage de 20 GB → 30 GB (sans downtime).

**Livrable.** Timeline observée.

### Mini-défi — Architecture DB pour une app SaaS (≈ 30 min)

**Cas.** SaaS B2B :

- 1000 tenants, ~10 GB / tenant.
- Charge : 5000 req/s en moyenne, 20 000 en pic.
- Besoin BI quotidien.

**Concevoir** :

1. RDS ou Aurora ? Standard ou Serverless ?
2. Classe d'instance ? Storage ?
3. Combien de readers ?
4. Multi-AZ ?
5. Budget mensuel estimé.

**Livrable.** Architecture + justification + budget.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Lire une **classe d'instance** : `db.r6g.xlarge` → R = mémoire, 6g = Graviton 2, xlarge = 4 vCPU/32GB.
- [ ] Distinguer les **familles** T, M, R, X.
- [ ] Citer le **piège des T burstable** (credits).
- [ ] Distinguer **gp3**, **io1/io2** et savoir quand basculer.
- [ ] Différencier **Aurora Standard** et **Aurora I/O-Optimized**.
- [ ] Décrire la **topologie d'un cluster Aurora** (writer + readers + storage).
- [ ] Distinguer **Writer endpoint** et **Reader endpoint**.
- [ ] Distinguer **Multi-AZ** et **Read Replicas** (sync vs async, HA vs scaling).
- [ ] **Provisionner une instance RDS** de mémoire (CLI ou console).
- [ ] **Provisionner un cluster Aurora** avec 1 writer + 1 reader.
- [ ] **Préconiser une classe** pour 3 profils donnés.
- [ ] Citer **3 anti-patterns** de provisionnement.

### Items du glossaire visés

**N2 atteint** :

- _préconiser un type de classe d'instance RDS / Aurora_ — sections 3 et 4.

---

## 12. Ressources complémentaires

### Documentation AWS

- [RDS DB Instance Classes](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html)
- [Aurora DB Cluster Topology](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)
- [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [RDS Storage Types](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html)
- [RDS Pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)

### Outils

- [AWS Compute Optimizer](https://docs.aws.amazon.com/compute-optimizer/) — recommandations RDS resize.
- [RDS Performance Insights](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PerfInsights.html) — analyse fine perf.

### Pour aller plus loin

- **M3 (Backups RDS/Aurora)** — la suite directe.
- **M4-M5 (DynamoDB)** — alternative NoSQL.
- **Niveau 3** : RDS Proxy, ElastiCache integration, Multi-AZ Cluster (RDS Multi-AZ avec 2 readers), DB blue-green deployment.
