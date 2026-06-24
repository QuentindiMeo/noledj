# M1 — Tour d'horizon

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Cartographier les **principaux services AWS de bases de données** (RDS, Aurora, DynamoDB, ElastiCache, DocumentDB, MemoryDB, Neptune, …) et savoir lequel cibler pour un besoin donné.
- Cartographier les **principaux services AWS de stockage** (S3, EBS, EFS, FSx, Storage Gateway, FileCache, Glacier) et leur cas d'usage typique.
- Citer les **moteurs SQL pris en charge par RDS et Aurora** (item N1 explicite) : RDS (MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, **IBM Db2**) ; Aurora (MySQL-compatible, PostgreSQL-compatible).
- Définir **S3** (item N1 explicite) : object storage durable, scalable, accessible par HTTP, organisé en buckets + objets.
- Citer les **classes de stockage S3** (item N1 explicite) : Standard, Standard-IA, One Zone-IA, Intelligent-Tiering, Glacier Instant Retrieval, Glacier Flexible Retrieval, Glacier Deep Archive, Express One Zone.
- **Choisir le bon service** pour 3 besoins distincts (transactionnel, archive long terme, partage de fichiers entre VMs).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- Bases SQL (`SELECT`, `JOIN`).
- Notions NoSQL (clé-valeur, document).
- AWS CLI v2 configurée.

---

## 1. Pourquoi un tour d'horizon

### 1.1 — Le problème

AWS propose **plus de 15 services data/storage** :

- 8 moteurs de base de données.
- 5 types de stockage.
- 10+ classes de stockage S3.

Choisir au hasard mène à des erreurs **structurelles** : impossibles à réparer sans migration coûteuse (semaines/mois).

Ce module donne **la grille de lecture** pour les 7 modules suivants.

### 1.2 — La règle 80/20

Dans 80 % des projets AWS, on utilise **3 services** :

- **RDS / Aurora** : base relationnelle.
- **DynamoDB** : NoSQL clé-valeur.
- **S3** : stockage objet.

Les 17 % suivants : **EBS** (disques EC2) et **EFS** (partage de fichiers). Les 3 % restants : services exotiques.

Ce module **dimensionne** la suite : on creuse en M2-M7 ce qui est réellement utilisé.

### 1.3 — L'analogie de l'entrepôt

Une entreprise gère son stock dans plusieurs entrepôts spécialisés :

- **Coffre-fort de bureau** (DynamoDB) : petits objets précieux, accès ultra-rapide.
- **Étagères principales** (RDS/Aurora) : produits classés, accessibles par référence, structurés.
- **Hangar général** (S3) : tout ce qu'on veut, infiniment extensible, on classe les rayons selon la fréquence d'accès.
- **Disques attachés à chaque poste de travail** (EBS) : usage propre à une machine.
- **Salle commune partagée** (EFS) : plusieurs équipes y posent leurs fichiers.

Chacun a sa raison d'exister. Mélanger les usages → bordel et coût.

---

## 2. Les services AWS Database — cartographie

### 2.1 — Familles

| Famille                  | Services AWS                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| **Relationnel (SQL)**    | **RDS**, **Aurora**, **Redshift** (DW, vu en Analytics)          |
| **Key-Value / Document** | **DynamoDB**, **DocumentDB** (MongoDB-compatible)                |
| **Cache in-memory**      | **ElastiCache** (Redis, Memcached), **MemoryDB** (Redis durable) |
| **Graph**                | **Neptune** (cas spécifique)                                     |
| **Time-series**          | **Timestream**                                                   |
| **Ledger / Blockchain**  | **QLDB** (immuable), **Managed Blockchain**                      |
| **Search**               | **OpenSearch** (vu en Analytics)                                 |

### 2.2 — Pour ce parcours, focus sur 3

| Service          | Type            | Pourquoi central                               |
| ---------------- | --------------- | ---------------------------------------------- |
| **RDS / Aurora** | SQL relationnel | Backend de 90 % des apps web/SaaS.             |
| **DynamoDB**     | NoSQL KV        | Apps haute scale, lookups < 10 ms.             |
| **ElastiCache**  | Cache           | Sessions, leaderboards (mentionné, hors core). |

Le reste est en niveau 3-4 du glossaire.

### 2.3 — RDS vs Aurora — distinction préliminaire

| Aspect       | **RDS**                                                 | **Aurora**                                |
| ------------ | ------------------------------------------------------- | ----------------------------------------- |
| Architecture | Instance + disque EBS                                   | **Storage distribué** (6 copies sur 3 AZ) |
| Moteurs      | MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, IBM Db2 | MySQL-compatible, PostgreSQL-compatible   |
| Performance  | Standard                                                | Jusqu'à 5× MySQL, 3× PostgreSQL           |
| Scale read   | Read replicas standard (jusqu'à 5)                      | Jusqu'à 15 read replicas, low lag         |
| Failover     | Multi-AZ (~60 s)                                        | Multi-AZ (~30 s)                          |
| Tarif        | Per-instance + storage EBS                              | Per-instance + storage (différent)        |
| Cas d'usage  | App standard, simple                                    | Workloads exigeants, haute concurrence    |

**Règle simple** : **Aurora** pour les nouveaux projets sérieux, **RDS** pour les besoins simples ou les moteurs non-compatibles Aurora (Oracle, SQL Server).

---

## 3. Moteurs SQL RDS / Aurora (item N1 explicite)

C'est **l'item N1 explicite** : connaître les moteurs.

### 3.1 — RDS — les 6 moteurs

| Moteur                    | Cas d'usage typique                                            |
| ------------------------- | -------------------------------------------------------------- |
| **MySQL**                 | Apps OSS (WordPress, Drupal, …), populaire, communauté.        |
| **PostgreSQL**            | Apps modernes, riche en types, extensions (PostGIS, pgvector). |
| **MariaDB**               | Fork OSS de MySQL, communauté indépendante.                    |
| **Oracle Database**       | Apps legacy enterprise, licences existantes.                   |
| **Microsoft SQL Server**  | Apps .NET / Windows enterprise.                                |
| **IBM Db2** (depuis 2023) | Apps legacy IBM.                                               |

### 3.2 — Aurora — 2 saveurs

| Saveur                           | Compatibilité                       |
| -------------------------------- | ----------------------------------- |
| **Aurora MySQL-compatible**      | Drop-in pour MySQL 5.6 / 5.7 / 8.0. |
| **Aurora PostgreSQL-compatible** | Drop-in pour PostgreSQL 11-16.      |

**Avantage Aurora** : code app conçu pour MySQL / PostgreSQL fonctionne **sans changement**, avec les bénéfices d'Aurora (storage distribué, replication, failover rapide).

### 3.3 — Choisir un moteur

| Cas                                               | Moteur recommandé                                  |
| ------------------------------------------------- | -------------------------------------------------- |
| Nouveau projet, équipe libre                      | **Aurora PostgreSQL**.                             |
| Migration depuis MySQL existant                   | **Aurora MySQL** ou **RDS MySQL**.                 |
| Charge prévisible faible, budget tight            | **RDS MySQL / PostgreSQL** (moins cher qu'Aurora). |
| Legacy Oracle ou SQL Server                       | **RDS Oracle / SQL Server**.                       |
| Besoin de PostGIS (geospatial), pgvector (vector) | **Aurora PostgreSQL** ou **RDS PostgreSQL**.       |
| Charge variable                                   | **Aurora Serverless v2**.                          |

### 3.4 — Aurora Serverless v2 — mention

Aurora Serverless v2 = Aurora qui **scale CPU/mémoire automatiquement** en fonction de la charge. Pay-per-ACU (Aurora Capacity Unit). Idéal pour :

- Charges variables (peaks).
- Dev/staging à charge faible.
- Apps occasionnellement consultées.

Détails en M2.

---

## 4. Les services AWS Storage — cartographie

### 4.1 — Familles

| Famille                     | Services AWS                                               |
| --------------------------- | ---------------------------------------------------------- |
| **Object storage**          | **S3** (Standard, IA, Glacier, …)                          |
| **Block storage** (disques) | **EBS** (gp3, io2, st1, sc1)                               |
| **File storage** (NFS-like) | **EFS** (Linux), **FSx** (Windows, Lustre, ONTAP, OpenZFS) |
| **Edge caching**            | **CloudFront** (vu en Networking M6) + **FileCache**       |
| **Backup / archive**        | **Glacier** (sous-classes S3), **AWS Backup**              |
| **Hybride on-prem**         | **Storage Gateway**, **Snow Family**                       |

### 4.2 — Pour ce parcours, focus sur 3

| Service | Type                   | Cas d'usage                               |
| ------- | ---------------------- | ----------------------------------------- |
| **S3**  | Object storage         | Files, backups, data lake, static assets. |
| **EBS** | Disque attaché à 1 EC2 | Filesystem root, base de données.         |
| **EFS** | NFS partagé multi-EC2  | Partage de fichiers entre instances.      |

EBS et EFS sont vus en **M7**. S3 en **M6**.

### 4.3 — Choix rapide

- **Besoin d'écrire/lire en HTTP, scalable infini** → **S3**.
- **Besoin d'un disque dur attaché à une EC2** → **EBS**.
- **Besoin de partager des fichiers entre plusieurs EC2** → **EFS**.

---

## 5. S3 — définition (item N1 explicite)

C'est l'**item N1 explicite** : définir S3.

### 5.1 — Définition

> **Amazon S3** (Simple Storage Service) est un service de **stockage d'objets** managé d'AWS, accessible par **API HTTP/HTTPS**, conçu pour stocker une **quantité illimitée d'objets** (de quelques octets à 5 TB chacun) avec une **durabilité de 99,999999999 %** (11 neufs).

Cinq propriétés à graver :

1. **Object storage** : pas de système de fichiers — on stocke des **objets** identifiés par une clé.
2. **HTTP/HTTPS** : accès via API REST, pas via mount filesystem.
3. **Illimité** en volume.
4. **Régional** : un bucket vit dans une région AWS (et est répliqué multi-AZ par défaut).
5. **Durabilité 11 9's** : la probabilité de perdre un objet en un an est ~1 sur 100 milliards.

### 5.2 — Vocabulaire

| Terme             | Définition                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Bucket**        | "Conteneur" de niveau supérieur. Nom **globalement unique** (par compte AWS, dans une partition). |
| **Object**        | Une donnée stockée : clé + valeur (bytes) + metadata.                                             |
| **Key**           | Chemin de l'objet dans le bucket (`logs/2026/05/17/file.json`).                                   |
| **Prefix**        | Préfixe d'une clé (utilisé pour pseudo-hiérarchie : `logs/2026/`).                                |
| **Version ID**    | Si versioning activé, identifie une version particulière d'un objet.                              |
| **Storage class** | Classe de stockage (Standard, IA, Glacier, …).                                                    |
| **Region**        | Où vit le bucket.                                                                                 |

### 5.3 — Ce qu'est S3 **et n'est pas**

| **S3 est…**                                     | **S3 n'est pas…**                                            |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Object storage HTTP                             | Un filesystem (pas de mount Linux natif)                     |
| Multi-AZ par défaut                             | Multi-région (sauf CRR)                                      |
| Hautement durable (11 9's)                      | Hautement disponible (99,9 % — pas 99,99 %)                  |
| Régional                                        | Global (le nom est global, le contenu reste régional)        |
| Cas universel : files, backups, logs, data lake | Pour transactionnel à très basse latence (utiliser DynamoDB) |

### 5.4 — Cas d'usage typiques

| Cas                                           | Pertinence                            |
| --------------------------------------------- | ------------------------------------- |
| Static website hosting                        | **Idéal**                             |
| Images / vidéos d'une app web                 | **Idéal**                             |
| Backups automatiques (RDS, EBS snapshots, …)  | **Idéal**                             |
| Data lake (logs, exports BI)                  | **Idéal**                             |
| Distribution de fichiers via CloudFront       | **Idéal**                             |
| Stockage de session utilisateur (par requête) | **Non** — utiliser DynamoDB ou Redis. |
| Filesystem pour appli legacy (mount Linux)    | **Non** — utiliser EFS.               |
| Base transactionnelle                         | **Non** — utiliser RDS/DynamoDB.      |

### 5.5 — Tarification — ordre de grandeur

- **Storage** : ~0,023 $/GB/mois (Standard).
- **PUT/POST** : ~0,005 $ / 1000 requêtes.
- **GET** : ~0,0004 $ / 1000 requêtes.
- **Data transfer OUT vers Internet** : ~0,09 $/GB (le coût le plus surprenant !).

À 1 TB stocké, 1M requêtes/mois, 100 GB de transfert sortant : ~38 $/mois.

---

## 6. Classes de stockage S3 (item N1 explicite)

C'est **l'item N1 explicite** : savoir qu'il y a plusieurs classes.

### 6.1 — La liste

| Classe                                 | Cas d'usage                                                  |
| -------------------------------------- | ------------------------------------------------------------ |
| **S3 Standard**                        | Accès fréquent, milliseconde de latence.                     |
| **S3 Intelligent-Tiering**             | Accès variable / inconnu — AWS choisit la classe.            |
| **S3 Standard-IA** (Infrequent Access) | Accès rare mais immédiat.                                    |
| **S3 One Zone-IA**                     | Idem mais 1 AZ seulement → moins cher mais moins durable.    |
| **S3 Express One Zone**                | Très haute performance, 1 AZ, latence < 10 ms.               |
| **S3 Glacier Instant Retrieval**       | Archive avec accès immédiat (ms).                            |
| **S3 Glacier Flexible Retrieval**      | Archive, accès en minutes à heures (anciennement "Glacier"). |
| **S3 Glacier Deep Archive**            | Archive ultra-froid, accès en 12-48h.                        |
| **S3 Reduced Redundancy** (déprécié)   | Ancienne classe — ne plus utiliser.                          |

### 6.2 — Tableau comparatif synthétique

| Classe                         | Coût stockage / GB / mois | Coût retrieval / GB | Latence accès | Durabilité    |
| ------------------------------ | ------------------------- | ------------------- | ------------- | ------------- |
| **Standard**                   | ~0,023 $                  | 0                   | ms            | 11 9's, 3+ AZ |
| **Intelligent-Tiering**        | 0,023-0,0036 $            | 0 ou minimal        | ms            | 11 9's        |
| **Standard-IA**                | ~0,0125 $                 | 0,01 $              | ms            | 11 9's, 3+ AZ |
| **One Zone-IA**                | ~0,01 $                   | 0,01 $              | ms            | 1 AZ          |
| **Express One Zone**           | ~0,16 $ (plus cher)       | 0                   | ms (sub-10ms) | 1 AZ          |
| **Glacier Instant Retrieval**  | ~0,004 $                  | 0,03 $              | ms            | 11 9's        |
| **Glacier Flexible Retrieval** | ~0,0036 $                 | 0,01-0,03 $         | min-h         | 11 9's        |
| **Glacier Deep Archive**       | ~0,00099 $                | 0,02-0,025 $        | 12-48 h       | 11 9's        |

### 6.3 — Choisir une classe — règle simple

``` graph
Q : À quelle fréquence accède-t-on aux objets ?
   ├─ Très fréquent (plusieurs fois/jour)
   │   → Standard
   │
   ├─ Variable / imprévisible
   │   → Intelligent-Tiering (laisse AWS optimiser)
   │
   ├─ Rare (1×/mois) mais besoin d'accès immédiat
   │   → Standard-IA (3 AZ) ou One Zone-IA (1 AZ pour économies)
   │
   ├─ Archive long terme (1×/an), accès immédiat
   │   → Glacier Instant Retrieval
   │
   ├─ Archive long terme, accès minutes-heures
   │   → Glacier Flexible Retrieval
   │
   └─ Ultra-froid (compliance / audit légal), accès 12-48h
       → Glacier Deep Archive
```

### 6.4 — Intelligent-Tiering — le pattern moderne

**Intelligent-Tiering** est un type de classe qui **observe les patterns d'accès** et **déplace automatiquement** les objets entre Frequent Access / Infrequent Access / Archive Instant.

- **Pas de coût de retrieval**.
- **Frais de monitoring** ~0,0025 $/1000 objets/mois.
- Recommandé pour des datasets **dont on ne connaît pas le pattern d'accès** à l'avance.

C'est souvent la **classe par défaut** sur les nouveaux datasets — laisser AWS optimiser.

### 6.5 — Transitions automatiques — Lifecycle policies (vu en M6)

Pour déplacer **automatiquement** des objets d'une classe à une autre selon leur âge :

```yaml
# Exemple Lifecycle Policy
Rules:
  - Status: Enabled
    Filter: { Prefix: "logs/" }
    Transitions:
      - Days: 30
        StorageClass: STANDARD_IA
      - Days: 90
        StorageClass: GLACIER_IR
      - Days: 365
        StorageClass: DEEP_ARCHIVE
    Expiration:
      Days: 2555 # 7 ans
```

Voir M6 pour le détail.

---

## 7. Pratique — choisir le bon service pour 3 besoins

C'est l'**item pratique** du module.

### 7.1 — Cas 1 — Backend d'une app e-commerce

**Besoin** :

- Utilisateurs, produits, commandes, paiements.
- ACID transactions (commande + paiement atomiques).
- Lookups par ID rapides, requêtes analytiques basiques (CA mensuel).
- 100 000 utilisateurs, 1 000 commandes/jour.

**Service recommandé** :

- **Base** : **Aurora PostgreSQL-compatible** (ou **RDS PostgreSQL** si budget tight).
  - Pourquoi : SQL, ACID, joins, transactions.
  - Pas DynamoDB : besoin de joins et de transactions complexes.
  - Pas Redshift : trop cher pour ce volume, pas OLTP.
- **Images produits / avatars users** : **S3 Standard** ou **Intelligent-Tiering** + CloudFront.
- **Sessions utilisateur** : **ElastiCache Redis** ou DynamoDB.

### 7.2 — Cas 2 — Archive de documents légaux 7 ans

**Besoin** :

- Stocker des PDF de contrats clients.
- Accès rare (1×/an typiquement, pour audit).
- Conservation légale 7 ans, **interdiction de suppression** avant.
- Volume : 10 TB.

**Service recommandé** :

- **S3 Glacier Deep Archive** + **Object Lock** (mode Compliance).
  - Pourquoi : durée long terme, accès rare, conformité.
  - Pas Standard : 50× plus cher pour rien (objets jamais lus).
  - Pas Glacier Flexible : peut suffire si accès en min-h acceptable. Deep Archive si vraiment 1×/an et lourde compliance.

**Estimation coût** :

- 10 TB × 0,00099 $/GB-mois = **~10 $/mois** vs 230 $/mois en Standard.

### 7.3 — Cas 3 — Partage de fichiers entre 5 EC2 d'un cluster web

**Besoin** :

- Plusieurs serveurs web (Apache/Nginx) partagent un répertoire de fichiers uploadés.
- Tous les serveurs doivent voir les écritures **en quasi-temps réel**.
- Compatibilité **POSIX** (`mount`, `chmod`, `chown`).

**Service recommandé** :

- **EFS** (Elastic File System).
  - Pourquoi : NFS partagé multi-instance, POSIX-compliant, scaling automatique.
  - Pas EBS : un EBS = 1 instance (sauf io2 multi-attach, limité).
  - Pas S3 : pas POSIX, demanderait de réécrire les apps web.

### 7.4 — Matrice synthétique

| Besoin                              | Service                                |
| ----------------------------------- | -------------------------------------- |
| Backend transactionnel SQL          | RDS / Aurora                           |
| Backend KV haute scale              | DynamoDB                               |
| Cache de session                    | ElastiCache Redis                      |
| Fichiers statiques HTTP             | S3 Standard ou Intelligent-Tiering     |
| Archive long terme                  | S3 Glacier (Instant / Flexible / Deep) |
| Disque attaché à 1 EC2              | EBS gp3 / io2                          |
| Partage de fichiers multi-EC2 POSIX | EFS                                    |
| Filesystem haute perf SAP/HPC       | FSx Lustre / FSx ONTAP                 |

---

## 8. Anti-patterns

| Anti-pattern                                                | Conséquence                                      |
| ----------------------------------------------------------- | ------------------------------------------------ |
| **Mettre tout en S3 Standard** sans Lifecycle.              | Facture 5-50× trop élevée sur les vieux objets.  |
| **Utiliser RDS pour de la session / cache**.                | Coût élevé, performance médiocre vs Redis.       |
| **DynamoDB pour des requêtes complexes** (joins, GROUP BY). | DynamoDB ne le supporte pas → on simule mal.     |
| **EBS multi-attach** sans cluster filesystem.               | Corruption garantie.                             |
| **Pas de backup** RDS automatique.                          | Une seule erreur humaine = perte de données.     |
| **Glacier Deep Archive** sur des données accédées 1×/mois.  | Coût de retrieval élevé > économies de stockage. |
| **S3 cross-region replication automatique sans réflexion**. | Doublement des coûts storage + sortie réseau.    |
| **Oracle / SQL Server** quand PostgreSQL suffit.            | Licences chères, vendor lock-in.                 |

---

## 9. Exercices pratiques

### Exercice 1 — Choisir un service pour 5 besoins (≈ 30 min)

Pour chacun, choisir le service AWS optimal et justifier :

1. Catalogue de 1 million de produits, lectures massives, faible écriture.
2. Logs applicatifs verbeux, recherche occasionnelle.
3. Session utilisateur d'une app web (10k users actifs).
4. Backup quotidien d'une DB MySQL on-premise.
5. Filesystem partagé pour 3 containers ECS qui écrivent des thumbnails.

**Livrable.** Tableau avec service + justification.

### Exercice 2 — Cartographier les moteurs (≈ 15 min)

Sans aller chercher : citer **les 6 moteurs RDS** et les **2 saveurs Aurora**.

Bonus : pour chacun, donner 1 cas d'usage typique.

### Exercice 3 — Calculer un coût S3 (≈ 30 min)

**Cas.** 5 TB stockés, 50 % en accès quotidien, 50 % accès mensuel.

Comparer :

- Tout en Standard : ?
- Mix Standard + Standard-IA : ?
- Intelligent-Tiering : ?

**Livrable.** Calcul détaillé avec économies.

### Exercice 4 — Premier S3 (≈ 20 min)

**Étapes :**

1. Créer un bucket `tp-storage-tour-<timestamp>`.
2. Uploader 3 fichiers de classes différentes (Standard, Standard-IA, Glacier IR).
3. Lister les objets et leurs classes : `aws s3api list-objects-v2 --bucket ... --query 'Contents[].{Key:Key, StorageClass:StorageClass}'`.
4. Récupérer un objet Glacier IR (pas de delay, contrairement à Flexible Retrieval).

**Livrable.** Captures + liste des objets.

### Exercice 5 — Lister les classes via CLI (≈ 10 min)

```bash
# Lister les classes valides
aws s3api put-object-acl help | grep -A 100 "StorageClass"
```

Vérifier qu'on a les **8 classes principales**.

### Mini-défi — Architecture data d'une app (≈ 30 min, papier)

**Cas.** Application SaaS pour cabinets d'avocats :

- Backend transactionnel : clients, dossiers, factures.
- Documents légaux : contrats, courriers, PV.
- Données utilisateur sensibles (RGPD).
- 10 000 utilisateurs prévus en année 1.

**Concevoir** :

1. Quelles bases ? (SQL + NoSQL + cache).
2. Quel stockage pour les documents ? Classes ? Lifecycle ?
3. Quelle stratégie de backup ?
4. Estimation coût mensuel à l'année 1.

**Livrable.** Schéma + matrice + budget.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Cartographier les **3 services data centraux** (RDS/Aurora, DynamoDB, ElastiCache).
- [ ] Cartographier les **3 services storage centraux** (S3, EBS, EFS).
- [ ] Distinguer **RDS** et **Aurora** sur 3 axes.
- [ ] Citer les **6 moteurs RDS** et les **2 saveurs Aurora**.
- [ ] Définir **S3** : object storage, HTTP, illimité, 11 9's, régional.
- [ ] Citer les **8 classes principales S3** et leur cas d'usage.
- [ ] Décrire **Intelligent-Tiering**.
- [ ] **Choisir un service** pour 3 cas typiques sans hésiter.
- [ ] Citer **3 anti-patterns** courants.

### Items du glossaire visés

**N1 atteint** :

- _moteurs SQL pris en charge par RDS / Aurora_ — section 3.
- _ce qu'est un S3_ — section 5.
- _il y a plusieurs classes de stockage S3_ — section 6.

(_query vs scan DynamoDB_, _partition / range key DynamoDB_ — couverts en M4.)

---

## 11. Ressources complémentaires

### Documentation AWS

- [AWS Database Services](https://aws.amazon.com/products/databases/)
- [AWS Storage Services](https://aws.amazon.com/products/storage/)
- [S3 Storage Classes](https://aws.amazon.com/s3/storage-classes/)
- [RDS Documentation](https://docs.aws.amazon.com/rds/)
- [Aurora Documentation](https://docs.aws.amazon.com/aurora/)

### Bonnes pratiques

- [AWS Well-Architected — Storage](https://docs.aws.amazon.com/wellarchitected/latest/storage-optimization-lens/welcome.html)
- [AWS Well-Architected — Performance Efficiency](https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html)

### Pour aller plus loin

- **M2 (RDS/Aurora provisionnement)** — classes d'instances, choix.
- **M3 (RDS/Aurora backups)** — automatic backups, snapshots.
- **M4-M5 (DynamoDB)** — concepts et limites.
- **M6 (S3 lifecycle et versioning)** — gestion avancée S3.
- **M7 (EBS, EFS, S3)** — comparatif détaillé.
- **M8 (Calcul des coûts)** — estimation et optimisation.
