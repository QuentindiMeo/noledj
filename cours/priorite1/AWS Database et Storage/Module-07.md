# M7 — EBS, EFS, S3

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer en profondeur les **trois familles de stockage** AWS : **EBS** (block, attaché à une EC2), **EFS** (file, partagé via NFS), **S3** (object, HTTP) — sur 8 axes (item N2 explicite).
- Énumérer les **différents types d'EBS** (item N2 explicite) : **gp3** (général SSD défaut), **gp2** (legacy SSD), **io1 / io2** (Provisioned IOPS SSD), **io2 Block Express** (extreme perf), **st1** (throughput HDD), **sc1** (cold HDD) — et savoir lequel utiliser pour quel cas.
- **Attacher un EBS à plusieurs instances** via **EBS Multi-Attach** (item N2 explicite) : conditions (io1/io2, même AZ, nitro-based, ≤ 16 instances), nécessité d'un **cluster filesystem** (OCFS2, GFS2) sans lequel la corruption est garantie.
- Reconnaître les **cas d'usage** de chaque famille : EBS pour disque OS / DB / filesystem privé ; EFS pour partage POSIX entre EC2 / containers ; S3 pour stockage massif HTTP / archive.
- Connaître **FSx** par son nom : famille de services file storage pour Windows, Lustre HPC, NetApp ONTAP, OpenZFS — quand basculer.
- Reconnaître les **anti-patterns** (EBS multi-attach sans cluster FS, EFS pour DB, S3 mounté comme FS).

## Durée estimée

1 jour.

## Pré-requis

- M1 (tour d'horizon storage) et M6 (S3 lifecycle/versioning).
- Parcours **AWS Networking** : VPC, SG, subnets.
- Notions Linux : montage filesystem (`mount`), `fdisk`, `mkfs`.
- AWS CLI v2 avec permissions `ec2:*`, `elasticfilesystem:*`.

---

## 1. Trois philosophies de stockage

### 1.1 — Le panorama

| Famille                         | Modèle | Accès                      | Mountable Linux ?   | Cas d'usage type                    |
| ------------------------------- | ------ | -------------------------- | ------------------- | ----------------------------------- |
| **EBS** (Elastic Block Store)   | Block  | Bloc (comme un disque dur) | **Oui** (1 EC2)     | Disque OS, base de données.         |
| **EFS** (Elastic File System)   | File   | NFS v4                     | **Oui** (multi-EC2) | Partage de fichiers POSIX.          |
| **S3** (Simple Storage Service) | Object | HTTP                       | Non (sauf hack)     | Files, backups, data lake, archive. |

### 1.2 — L'analogie du bureau

- **EBS** = le **disque dur** dans votre PC. Personne d'autre n'y accède directement.
- **EFS** = le **dossier réseau partagé** entre les machines de l'équipe (NFS / SMB).
- **S3** = **Dropbox / Google Drive** : on dépose des fichiers via une API, on les récupère via URL.

Chaque modèle a sa raison d'être. Pas substitut.

### 1.3 — Schéma comparatif

```text
┌──────────────────┐
│ EC2 instance     │
│ ┌──────────────┐ │
│ │ OS + apps    │ │       ←── monte un EBS comme /dev/xvdf
│ └──────────────┘ │
└────────┬─────────┘
         │ attaché 1:1 (sauf Multi-Attach)
         ▼
   ┌──────────┐
   │   EBS    │   block device, dans 1 AZ
   └──────────┘

──────────────────────────────────────────

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ EC2 instance │  │ EC2 instance │  │ EC2 instance │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │ NFS v4
                         ▼
                  ┌──────────────┐
                  │     EFS      │   filesystem managé, multi-AZ
                  └──────────────┘

──────────────────────────────────────────

┌──────────────┐                              ┌──────────────┐
│ EC2 / Lambda │ ───── HTTPS PUT/GET ──────► │      S3      │
│ Mobile / Web │                              │              │
└──────────────┘                              └──────────────┘
                                              objet, multi-AZ, illimité
```

---

## 2. EBS en détail

### 2.1 — Définition

**Amazon Elastic Block Store** = service de **disques virtuels** attachables à une instance EC2. Du point de vue de l'OS, un EBS apparaît comme un **block device** (`/dev/xvdf`, `/dev/nvme1n1`), partitionnable et formatable.

### 2.2 — Propriétés clés

- **Attaché à 1 EC2** typiquement (Multi-Attach possible pour io1/io2, voir section 4).
- **Dans 1 AZ** : un volume ne peut pas être attaché à une instance d'une autre AZ.
- **Persistant** : survit à l'arrêt de l'instance (sauf root volume avec `DeleteOnTermination=true`).
- **Détachable** : peut être détaché d'une instance et rattaché à une autre.
- **Snapshotable** : snapshots stockés en S3 (incrémentaux).

### 2.3 — Tailles

- **Min** : 1 GB.
- **Max** : 64 TB (io2 Block Express), 16 TB (autres types).
- **Redimensionnable à chaud** : on peut **augmenter** la taille (pas réduire) sans downtime.

### 2.4 — IOPS et débit

| Métrique       | Unité           | Définition                               |
| -------------- | --------------- | ---------------------------------------- |
| **IOPS**       | I/O par seconde | Nombre d'opérations de lecture/écriture. |
| **Throughput** | MiB/s           | Débit en données par seconde.            |
| **Latency**    | ms              | Temps de réponse moyen d'une I/O.        |

À choisir selon le workload :

- **OLTP DB** : IOPS importantes, throughput modéré.
- **Streaming logs / video** : throughput important, IOPS modérées.
- **Backup / restore** : throughput important, IOPS faibles.

---

## 3. Types d'EBS (item N2 explicite)

C'est **l'item N2 explicite** : connaître les types et leurs cas d'usage.

### 3.1 — Tableau récapitulatif

| Type                     | Catégorie            | IOPS max    | Throughput max  | Tarif (eu-west-1) ~       | Cas d'usage                                   |
| ------------------------ | -------------------- | ----------- | --------------- | ------------------------- | --------------------------------------------- |
| **gp3** (général SSD)    | SSD général          | 16 000      | 1 000 MiB/s     | 0,08 $/GB/mois            | **La norme moderne**. Tout-terrain.           |
| **gp2** (legacy)         | SSD général          | 16 000      | 250 MiB/s       | 0,11 $/GB/mois            | **À migrer vers gp3**.                        |
| **io1**                  | SSD Provisioned IOPS | 64 000      | 1 000 MiB/s     | 0,138 $/GB + 0,072 $/IOPS | Workloads I/O intensifs legacy.               |
| **io2**                  | SSD Provisioned IOPS | 64 000      | 1 000 MiB/s     | 0,138 $/GB + 0,072 $/IOPS | Améliore io1 en durabilité (5 9's).           |
| **io2 Block Express**    | SSD extreme          | **256 000** | **4 000 MiB/s** | 0,138 $/GB + 0,072 $/IOPS | Critique : SAP HANA, Oracle massive, trading. |
| **st1** (throughput HDD) | HDD                  | ~500        | **500 MiB/s**   | 0,045 $/GB/mois           | Big data, logs streaming, data warehousing.   |
| **sc1** (cold HDD)       | HDD froid            | ~250        | 250 MiB/s       | 0,025 $/GB/mois           | Données rarement accédées.                    |
| **EBS Snapshot Archive** | Snapshot Glacier     | -           | -               | 0,0125 $/GB/mois          | Snapshots > 90j.                              |

### 3.2 — gp3 — le défaut moderne

**gp3** (depuis 2021) est devenu **la norme** :

- **3 000 IOPS baseline** (vs gp2 où les IOPS dépendaient de la taille).
- **125 MiB/s baseline**.
- **Provisionnable indépendamment** jusqu'à 16 000 IOPS / 1 000 MiB/s.
- **20 % moins cher** que gp2 à perf équivalente.

**Recommandation** : tout nouveau projet en **gp3**. Migrer les anciens gp2.

```bash
# Migrer gp2 → gp3 à chaud
aws ec2 modify-volume --volume-id vol-0abc --volume-type gp3
```

### 3.3 — io1 / io2 — provisioned IOPS

Pour des workloads **I/O critiques** :

- **Banque** : OLTP avec garantie de latence.
- **SAP HANA** : 50 000+ IOPS requis.
- **Oracle massive** : workloads transactionnels lourds.

**Durabilité** :

- **io1** : 99,8-99,9 % (5 9's annualisés).
- **io2** : 99,999 % (5 9's, mieux qu'io1).
- **io2 Block Express** : extrême, jusqu'à 256k IOPS et sub-millisecond latency.

**Tarif** : provisionner les IOPS séparément (~0,072 $/IOPS-mois). Vite cher.

### 3.4 — st1 — throughput optimized HDD

Pour des workloads **big data** :

- Streaming write/read sur de gros volumes.
- Data warehousing local (rare en AWS où on préfère S3).
- Logs séquentiels.

**Limites** :

- IOPS bas (~500).
- Adapté aux **lectures/écritures séquentielles**.

### 3.5 — sc1 — cold HDD

Pour des **données froides** rarement accédées. Très bon marché mais lent. **Cas d'usage** rare — souvent S3 est mieux placé.

### 3.6 — Tableau de choix par profil

| Workload                                  | Type EBS recommandé                                         |
| ----------------------------------------- | ----------------------------------------------------------- |
| Disque OS d'une EC2 standard              | **gp3** (8 à 50 GB).                                        |
| Base de données moyenne (Postgres, MySQL) | **gp3** (50 à 500 GB, ~6000 IOPS provisionnées).            |
| Base de données critique (banque, SAP)    | **io2 Block Express**.                                      |
| Logs applicatifs séquentiels              | **st1** (volumes 500 GB+).                                  |
| Backup local infrequent                   | **sc1** (sinon → S3).                                       |
| Cache éphémère ultra-rapide               | **Instance Store** (NVMe local, pas EBS — perdu à l'arrêt). |

### 3.7 — Snapshots EBS

Backups d'un volume EBS, stockés **en S3** par AWS (transparent) :

- **Incrémentaux** : seules les blocs modifiés sont stockés.
- **Cross-region** : copiables.
- **Cross-account** : partageables.
- **Restorables** vers un nouveau volume (potentiellement de type différent, taille ≥).

```bash
aws ec2 create-snapshot --volume-id vol-0abc --description "Pre-update backup"

# Restorer
aws ec2 create-volume --snapshot-id snap-0xyz --availability-zone eu-west-1a --volume-type gp3
```

**Snapshot Archive** (depuis 2022) : déplace les vieux snapshots vers Glacier S3 pour ~75 % d'économies.

---

## 4. EBS Multi-Attach (item N2 explicite)

### 4.1 — Définition

> **EBS Multi-Attach** permet d'attacher **un même volume io1 ou io2** à **jusqu'à 16 instances EC2** dans la **même AZ**, simultanément.

C'est l'**item N2 explicite** : savoir le faire (et savoir quand).

### 4.2 — Les conditions strictes

Pour utiliser Multi-Attach :

1. **Type de volume** : **io1** ou **io2** uniquement (pas gp3, ni st1, ni sc1).
2. **Même AZ** : toutes les instances dans la même Availability Zone.
3. **Instances Nitro** : génération moderne (M5, M6, R5, R6, C5, C6, …).
4. **OS Linux** uniquement (pas Windows).
5. **Maximum 16 instances** attachées en simultané.

### 4.3 — Le piège — corruption garantie sans cluster filesystem

> Si on attache un EBS Multi-Attach et qu'on le **formate en ext4 / XFS** (filesystems classiques), **la corruption est garantie** dès que 2 instances écrivent dessus.

Pourquoi : ext4 / XFS supposent **un seul writer**. Deux écrivains simultanés sur les mêmes blocs → **corruption silencieuse**.

**Solution obligatoire** : utiliser un **cluster filesystem** qui coordonne les accès :

- **OCFS2** (Oracle Cluster File System).
- **GFS2** (Red Hat Global File System).
- **VeritasInfoScale**.
- Ou des applications "cluster-aware" qui gèrent elles-mêmes les locks (par exemple, certains middlewares Oracle RAC).

### 4.4 — Cas d'usage légitimes

- **Oracle Real Application Clusters (RAC)** : LE cas d'usage historique.
- **Clusters HA avec failover rapide** : un noeud secondaire peut prendre instantanément le relais.
- **Workloads partagés très spécifiques** : SAS Grid, certains EDA.

**Pour 99 % des autres cas** : utiliser **EFS** (partage POSIX standard) ou **FSx** (filesystem managé).

### 4.5 — Limites supplémentaires

- **Snapshots** : pris pendant Multi-Attach peuvent capturer des états inconsistants. Quiescer le filesystem avant.
- **Boot volume** non supporté : seul un volume de données peut être Multi-Attach.
- **Pas de support PIOPS auto-scaling** quand Multi-Attach est activé.

### 4.6 — Activation à la création

```bash
aws ec2 create-volume \
  --availability-zone eu-west-1a \
  --size 100 \
  --volume-type io2 \
  --iops 5000 \
  --multi-attach-enabled \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=tp-multiattach}]'
```

### 4.7 — Attacher à plusieurs instances

```bash
# Instance 1
aws ec2 attach-volume --volume-id vol-0abc \
  --instance-id i-instance1 --device /dev/sdf

# Instance 2 (même AZ !)
aws ec2 attach-volume --volume-id vol-0abc \
  --instance-id i-instance2 --device /dev/sdf

# Lister les attachements
aws ec2 describe-volumes --volume-ids vol-0abc \
  --query 'Volumes[0].Attachments'
```

---

## 5. EFS en détail

### 5.1 — Définition

**Amazon EFS** (Elastic File System) = **filesystem POSIX** entièrement managé, accessible **via NFS v4** depuis plusieurs instances EC2 (et containers Fargate, Lambda).

### 5.2 — Propriétés

- **Multi-AZ par défaut** (sauf classe One Zone, voir 5.4).
- **Scaling automatique** : grandit / rétrécit sans intervention.
- **Pay-per-GB** : pas de capacité à provisionner.
- **POSIX compliant** : `chmod`, `chown`, symlinks, locks, etc.
- **Concurrent access** : milliers d'instances peuvent monter en même temps.

### 5.3 — Architecture

```text
                           ┌─────────────────┐
                           │ EFS file system │
                           │ (multi-AZ)      │
                           └────┬───────┬────┘
                                │       │
       ┌────────────────────────┘       └─────────────────────────┐
       │                                                          │
       ▼                                                          ▼
  ┌──────────┐                                                ┌──────────┐
  │ Mount    │                                                │ Mount    │
  │ Target   │                                                │ Target   │
  │ AZ-a     │                                                │ AZ-b     │
  └────┬─────┘                                                └────┬─────┘
       │                                                           │
       │ NFS v4                                                    │ NFS v4
       │                                                           │
  ┌────▼─────┐  ┌──────────┐  ┌──────────┐              ┌──────────┐
  │ EC2 #1   │  │ EC2 #2   │  │ ECS task │              │ EC2 #3   │
  │ AZ-a     │  │ AZ-a     │  │ AZ-a     │              │ AZ-b     │
  └──────────┘  └──────────┘  └──────────┘              └──────────┘
```

Chaque AZ a un **mount target** (point d'entrée). Les instances montent via leur AZ.

### 5.4 — Classes de stockage EFS

| Classe                              | Caractéristiques                                               | Cas d'usage                               |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| **Standard**                        | Multi-AZ, hautement durable                                    | Production, partage critique.             |
| **Standard-IA** (Infrequent Access) | Multi-AZ, accès rare, moins cher au stockage, retrieval payant | Fichiers vieux.                           |
| **One Zone**                        | 1 AZ, moins cher                                               | Dev / staging non critique.               |
| **One Zone-IA**                     | 1 AZ + IA                                                      | Combo économies maximales (non-critique). |

### 5.5 — Lifecycle EFS

Comme S3, EFS supporte un **Lifecycle Management** pour automatiquement déplacer les fichiers vers IA :

```bash
aws efs put-lifecycle-configuration \
  --file-system-id fs-0abc \
  --lifecycle-policies '[{"TransitionToIA": "AFTER_30_DAYS"}]'
```

→ Fichiers non accédés depuis 30j → IA (moins cher).

### 5.6 — Throughput modes

- **Bursting** (défaut) : throughput baseline + crédits de burst (basé sur taille du FS).
- **Provisioned** : on provisionne un débit fixe (cher si beaucoup).
- **Elastic** : scale dynamiquement, paye à l'usage.

**Recommandation 2026** : **Elastic** par défaut, sauf très petits volumes en Bursting.

### 5.7 — Montage

```bash
# Installer le helper EFS sur Amazon Linux
sudo yum install -y amazon-efs-utils

# Monter
sudo mkdir /mnt/efs
sudo mount -t efs fs-0abc1234:/ /mnt/efs

# Ou via fstab pour permanence
echo "fs-0abc1234:/ /mnt/efs efs _netdev,tls 0 0" >> /etc/fstab
```

`tls` chiffre le trafic NFS en transit. **Recommandé**.

### 5.8 — Cas d'usage typiques

| Cas                                           | EFS pertinent ?                |
| --------------------------------------------- | ------------------------------ |
| Cluster web avec uploads partagés             | **Excellent**.                 |
| WordPress multi-server                        | **Excellent**.                 |
| Container ECS / EKS avec besoin POSIX partagé | **Excellent**.                 |
| CI/CD avec workspace partagé                  | **Bon**.                       |
| Big data (Hadoop) — HDFS-like                 | Non — utiliser FSx Lustre.     |
| Base de données                               | **Non** — utiliser EBS ou RDS. |
| Stockage massif HTTP                          | Non — utiliser S3.             |

---

## 6. EFS vs EBS vs S3 — matrice détaillée (item N2 explicite)

C'est **l'item N2 majeur** du module : connaître les différences.

### 6.1 — Tableau comparatif

| Critère                | **EBS**                              | **EFS**                            | **S3**                                 |
| ---------------------- | ------------------------------------ | ---------------------------------- | -------------------------------------- |
| **Modèle**             | Block storage                        | File system (POSIX)                | Object storage                         |
| **Accès**              | OS direct (`/dev/xvdf`)              | NFS v4                             | API HTTP/HTTPS                         |
| **Mount Linux ?**      | Oui (1 EC2, ou ≤ 16 si Multi-Attach) | Oui (multi-EC2, ECS, Lambda)       | Non (sauf hacks comme s3fs)            |
| **Concurrent writers** | 1 (sauf Multi-Attach + cluster FS)   | N (concurrent natif)               | N (par objet, dernière écriture gagne) |
| **Durabilité**         | 99,8-99,999 % (selon type)           | 99,999999999 % (11 9's, équiv. S3) | 99,999999999 % (11 9's)                |
| **AZ**                 | **1 AZ** (un volume)                 | Multi-AZ (sauf One Zone)           | Multi-AZ (auto)                        |
| **Taille max**         | 64 TB (io2 BE)                       | Illimité                           | Illimité (objet : 5 TB)                |
| **Latence**            | Sub-ms                               | Single-digit ms                    | 10-100 ms                              |
| **Scaling**            | Manuel (resize)                      | Auto                               | Auto                                   |
| **Tarif (~)**          | 0,025-0,138 $/GB/mois                | 0,30 $/GB Standard, 0,025 $/GB IA  | 0,023 $/GB Standard                    |
| **Cas d'usage**        | Disque OS, DB, FS privé              | Partage POSIX entre instances      | Object, web, archive, data lake        |
| **Snapshots**          | EBS Snapshots → S3                   | AWS Backup                         | Versioning natif                       |
| **Chiffrement**        | EBS encryption KMS                   | EFS encryption KMS                 | SSE-S3 / SSE-KMS / SSE-C               |

### 6.2 — Quand choisir lequel

**EBS** :

- Disque d'OS d'une EC2.
- Base de données auto-hébergée (RDS managé est mieux).
- Filesystem privé d'une instance (logs, cache local).

**EFS** :

- **Plusieurs EC2 / containers** doivent partager **les mêmes fichiers**.
- App nécessitant **POSIX** (`chmod`, locks, symlinks).
- Workload qui scale dynamiquement (Auto Scaling Group).

**S3** :

- Stockage de **fichiers via HTTP** (images, vidéos, downloads).
- **Data lake** (logs, exports, datasets).
- **Backups / archives**.
- **Static website**.

### 6.3 — Anti-confusions

| "Je veux…"                                 | Bonne réponse                            |
| ------------------------------------------ | ---------------------------------------- |
| Stocker des images uploadées par mes users | **S3** (+ CloudFront).                   |
| Partager des fichiers entre EC2            | **EFS**.                                 |
| Disque pour ma base PostgreSQL             | **EBS gp3 / io2** (ou **RDS**).          |
| Filesystem partagé pour CI/CD workspaces   | **EFS**.                                 |
| Stocker des logs sortis en streaming       | **S3** via Firehose.                     |
| Données analytics dans un data lake        | **S3**.                                  |
| Cache de session web                       | Aucun → **ElastiCache** ou **DynamoDB**. |

---

## 7. FSx — mention rapide

**Amazon FSx** = famille de **filesystems managés** spécialisés :

| Service                         | Cas d'usage                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| **FSx for Windows File Server** | Filesystem Windows / SMB. AD intégré. Apps .NET / Windows.         |
| **FSx for Lustre**              | HPC, ML training, simulations massives. Linké à S3.                |
| **FSx for NetApp ONTAP**        | Filesystem enterprise NetApp (data mgmt avancé, snapshots, dedup). |
| **FSx for OpenZFS**             | Filesystem ZFS managé (snapshots, clones, …).                      |

À connaître par leur nom au N2. **Niveau 3** pour la pratique.

---

## 8. Pratique — attacher un EBS à plusieurs instances (item du glossaire)

L'item du glossaire pratique : EBS Multi-Attach.

### 8.1 — Plan

1. Créer un volume io2 Multi-Attach.
2. Lancer 2 instances EC2 Nitro **dans la même AZ**.
3. Attacher le volume aux deux.
4. Vérifier que le block device apparaît.
5. **NE PAS** formater en ext4 (corruption garantie) — **soit** installer un cluster FS, **soit** simplement vérifier l'attachement.
6. Détacher et nettoyer.

### 8.2 — Étape 1 — Créer le volume Multi-Attach

```bash
AZ=eu-west-1a
VOL_ID=$(aws ec2 create-volume \
  --availability-zone $AZ \
  --size 10 \
  --volume-type io2 \
  --iops 5000 \
  --multi-attach-enabled \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=tp-multiattach}]' \
  --query 'VolumeId' --output text)

echo "Volume créé : $VOL_ID"

# Attendre que ce soit "available"
aws ec2 wait volume-available --volume-ids $VOL_ID
```

### 8.3 — Étape 2 — Lancer 2 instances dans la même AZ

```bash
# Utiliser une AMI moderne Amazon Linux 2023 sur instance Nitro (M6, R6, C6, ...)
SUBNET=subnet-priv-a-in-eu-west-1a   # subnet dans la bonne AZ

INSTANCE_IDS=()
for i in 1 2; do
  ID=$(aws ec2 run-instances \
    --image-id ami-0xxx \
    --instance-type m6i.large \
    --subnet-id $SUBNET \
    --security-group-ids sg-yyy \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=tp-multiattach-$i}]" \
    --query 'Instances[0].InstanceId' --output text)
  INSTANCE_IDS+=($ID)
done

aws ec2 wait instance-running --instance-ids ${INSTANCE_IDS[@]}
echo "Instances : ${INSTANCE_IDS[@]}"
```

### 8.4 — Étape 3 — Attacher aux deux

```bash
for ID in ${INSTANCE_IDS[@]}; do
  aws ec2 attach-volume \
    --volume-id $VOL_ID \
    --instance-id $ID \
    --device /dev/sdf
done

# Vérifier
aws ec2 describe-volumes --volume-ids $VOL_ID \
  --query 'Volumes[0].Attachments[].{Instance:InstanceId, Device:Device, State:State}'
```

Sortie attendue :

```json
[
  { "Instance": "i-aaa", "Device": "/dev/sdf", "State": "attached" },
  { "Instance": "i-bbb", "Device": "/dev/sdf", "State": "attached" }
]
```

### 8.5 — Étape 4 — Vérifier l'OS voit le block device

SSH dans les deux instances :

```bash
# Sur instance 1
lsblk
# Devrait afficher nvme1n1 (le device EBS)

# Sur instance 2
lsblk
# Idem, même device
```

### 8.6 — Étape 5 — Ce qu'il NE faut PAS faire

```bash
# Sur instance 1
sudo mkfs.ext4 /dev/nvme1n1
sudo mount /dev/nvme1n1 /mnt/shared

# Sur instance 2
sudo mount /dev/nvme1n1 /mnt/shared
# Filesystem corrompu dès qu'on écrit depuis les 2.
```

**Si on veut un partage POSIX entre 2 instances** : **utiliser EFS**, pas Multi-Attach.

Si on veut **réellement** Multi-Attach (Oracle RAC, OCFS2) : installer le cluster filesystem.

### 8.7 — Étape 6 — Cleanup

```bash
# Détacher
for ID in ${INSTANCE_IDS[@]}; do
  aws ec2 detach-volume --volume-id $VOL_ID --instance-id $ID --force
done

aws ec2 wait volume-available --volume-ids $VOL_ID
aws ec2 delete-volume --volume-id $VOL_ID

# Terminer les instances
aws ec2 terminate-instances --instance-ids ${INSTANCE_IDS[@]}
```

### 8.8 — Alternative recommandée — EFS

Pour la plupart des cas où on pense à Multi-Attach :

```bash
# Créer un EFS
FS_ID=$(aws efs create-file-system \
  --creation-token tp-efs-$(date +%s) \
  --performance-mode generalPurpose \
  --throughput-mode elastic \
  --query 'FileSystemId' --output text)

# Mount target dans chaque AZ
for SN in subnet-priv-a subnet-priv-b; do
  aws efs create-mount-target \
    --file-system-id $FS_ID \
    --subnet-id $SN \
    --security-groups sg-efs
done

# Sur chaque instance
sudo mount -t efs $FS_ID:/ /mnt/efs
```

→ Partage POSIX multi-AZ, sans cluster FS à gérer. **La bonne solution dans 95 % des cas**.

---

## 9. Anti-patterns

| Anti-pattern                                                  | Conséquence                                             |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| **EBS Multi-Attach + ext4/xfs**.                              | **Corruption silencieuse garantie**.                    |
| **EFS pour stocker des binaires de DB**.                      | Latence élevée, pas l'usage prévu, perf désastreuses.   |
| **S3 mounté comme un filesystem** via s3fs / s3-fuse.         | Performance dégradée, sémantique POSIX cassée, fragile. |
| **gp2 en 2026** pour un nouveau projet.                       | 20 % plus cher que gp3 sans bénéfice.                   |
| **io2 Block Express** pour un workload qui n'en a pas besoin. | Coût × 10-100 inutile.                                  |
| **Multi-Attach pour partager des fichiers entre apps web**.   | Mauvais outil. EFS est fait pour ça.                    |
| **Pas de snapshots EBS** sur DB self-hostée.                  | Pas de récupération possible.                           |
| **EBS root volume avec `DeleteOnTermination=true`** sur prod. | Suppression accidentelle = perte du root.               |
| **EFS Standard** sur fichiers jamais accédés.                 | Coût × 12 vs IA.                                        |
| **Confondre EFS et FSx for Windows**.                         | Pas d'AD / SMB sur EFS — apps Windows cassent.          |

---

## 10. Exercices pratiques

### Exercice 1 — Comparer EBS / EFS / S3 (≈ 30 min)

Pour chaque besoin, choisir et justifier :

1. Disque pour PostgreSQL self-hosté sur EC2 (50 GB de données chaudes).
2. Partage de fichiers entre 5 conteneurs Fargate (workspaces de CI).
3. Stockage de logs applicatifs archivés (10 TB sur 5 ans).
4. Cache local d'un serveur web Nginx (logs rotatifs).
5. Filesystem Windows partagé pour app .NET legacy.
6. Stockage des images uploadées par 1M users d'une app mobile.

**Livrable.** Tableau choix + justification.

### Exercice 2 — Migrer gp2 vers gp3 (≈ 20 min)

**Étapes :**

1. Créer un volume gp2 (10 GB).
2. Attacher à une EC2, formater, écrire.
3. Modifier le volume en gp3 à chaud : `aws ec2 modify-volume --volume-id vol-... --volume-type gp3`.
4. Vérifier le statut de modification.
5. Constater la baisse de prix (20 %).

**Livrable.** Capture avant/après + estimation économies sur 1 TB.

### Exercice 3 — EBS Multi-Attach (≈ 60 min)

**Objectif.** L'item N2 explicite.

**Étapes :** suivre la section 8 (sans formater le FS pour ne pas corrompre).

**Livrable.** Captures du volume attaché aux 2 instances + extrait `lsblk`.

### Exercice 4 — EFS monté sur 3 EC2 (≈ 45 min)

**Étapes :**

1. Créer un EFS Standard.
2. Mount targets dans 2 AZ.
3. Lancer 3 EC2 (2 dans AZ-a, 1 dans AZ-b).
4. Monter EFS sur chaque.
5. Écrire un fichier depuis EC2-1, vérifier sa visibilité depuis EC2-2 et EC2-3.

**Livrable.** Démonstration concurrente — captures.

### Exercice 5 — Snapshots EBS (≈ 30 min)

**Étapes :**

1. Créer un volume gp3, attacher, formater, écrire des données.
2. Créer un snapshot.
3. Restaurer le snapshot dans une autre AZ.
4. Comparer le contenu.

**Livrable.** Captures du nouveau volume avec mêmes données.

### Mini-défi — Architecture stateful application (≈ 30 min, papier)

**Cas.** App SaaS multi-tenant :

- 5 instances EC2 (cluster web).
- Database self-hosted (PostgreSQL en HA).
- Uploads users (PDF, images).
- Workspace temporaire pour traitements batch.

**Concevoir** :

1. Quel storage pour chaque composant ?
2. Backups ?
3. Estimation du coût mensuel total.

**Livrable.** Schéma + budget.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Distinguer **EBS / EFS / S3** sur 8 axes.
- [ ] Citer les **types d'EBS** : gp3, gp2, io1/io2, io2 BE, st1, sc1.
- [ ] Pour chaque type, donner **un cas d'usage** principal.
- [ ] Énoncer la règle "**gp3 par défaut en 2026**".
- [ ] Définir **EBS Multi-Attach** et ses **5 conditions** (io1/io2, même AZ, Nitro, Linux, ≤ 16).
- [ ] Énoncer le **piège** : Multi-Attach + ext4 = corruption.
- [ ] Définir **EFS** et sa différence avec EBS.
- [ ] Citer **3 classes EFS** (Standard, IA, One Zone).
- [ ] **Attacher un EBS** à 2 instances de mémoire.
- [ ] Citer **3 cas où on utilise S3** vs EFS vs EBS.
- [ ] Connaître **FSx** par son nom (4 variantes).
- [ ] Citer **3 anti-patterns** classiques.

### Items du glossaire visés

**N2 atteint** :

- _différences entre EFS, EBS et S3_ — section 6.
- _il y a plusieurs types d'EBS et leurs cas d'usage_ — section 3.
- _attacher un EBS à plusieurs instances_ — sections 4 et 8.

---

## 12. Ressources complémentaires

### Documentation AWS

- [EBS Documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AmazonEBS.html)
- [EBS Volume Types](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html)
- [EBS Multi-Attach](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volumes-multi.html)
- [EFS Documentation](https://docs.aws.amazon.com/efs/)
- [FSx Documentation](https://docs.aws.amazon.com/fsx/)
- [S3 vs EFS vs EBS comparison](https://aws.amazon.com/compare/the-difference-between-amazon-efs-amazon-fsx-and-amazon-s3/)

### Outils

- [AWS Backup](https://aws.amazon.com/backup/) — backup centralisé EBS / EFS / S3 / RDS.

### Pour aller plus loin

- **M8 (Calcul des coûts)** — comparer économiquement.
- **Niveau 3** : EBS encryption KMS, snapshots cross-region, FSx Lustre + S3, EFS access points.
