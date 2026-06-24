# M1 — EC2, bases (AMI, familles, générations, User Data)

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **EC2** (Elastic Compute Cloud), expliquer ce qu'il fournit (VM dans le cloud) et le positionner par rapport aux autres services compute (Lambda, ECS, AppRunner — vus en M4-M12).
- Définir précisément une **AMI** (Amazon Machine Image), son contenu (snapshot + métadonnées + permissions), ses **quatre origines** (AWS-managed, AWS Marketplace, Community, Custom) et le **format d'identifiant** (`ami-0xxxxxxxxxxxxxxxx`).
- Décoder la **nomenclature d'un type d'instance EC2** (`t3.medium`, `m6i.large`, `c7g.xlarge`, …) : préfixe de famille, génération, suffixe d'architecture, taille.
- Citer les **familles principales** d'EC2 (T, M, C, R, I, G, …), leur orientation (général, compute, mémoire, stockage, GPU) et leur cas d'usage typique.
- Définir le **User Data** d'une instance, savoir **quand** et **comment** il s'exécute (cloud-init, une seule fois au premier boot), citer ses **limites** (16 KB) et écrire un User Data **idempotent** minimal.
- **Lancer une EC2** depuis la CLI avec une AMI choisie, un type d'instance pertinent et un User Data injectant un script de provisionnement de base.

## Durée estimée

1 jour.

## Pré-requis

- Compte AWS opérationnel (sandbox, perso ou pro avec autorisation EC2).
- **AWS CLI v2** installée et configurée (`aws configure`).
- AWS Networking M1-M2 — recommandé (notions de région, AZ, VPC, subnet, IP privée). Un VPC par défaut suffit pour démarrer.
- AWS Identity M1-M3 — recommandé (un user IAM avec permissions EC2 et un rôle assumable).
- Bases shell (bash) — pour comprendre les User Data.
- Connaissance basique de SSH (paire de clés `.pem`, `ssh -i`).

---

## 1. Pourquoi commencer par EC2

### 1.1 — La place d'EC2 dans le catalogue compute

AWS propose **plus de 10 services compute** différents. La sélection est confuse au premier abord, mais elle se ramène à une question simple :

> Combien de couches de l'OS / runtime / application est-on prêt à laisser AWS gérer ?

| Service               | Ce qu'AWS gère                | Ce qu'on gère                            | Couvert dans                      |
| --------------------- | ----------------------------- | ---------------------------------------- | --------------------------------- |
| **EC2**               | Hyperviseur, hardware, réseau | OS, runtime, deps, code, scaling         | **M1-M3** (ce module et suivants) |
| **ECS Fargate**       | + OS, scheduler container     | Image Docker, scaling déclaré            | **M11-M12**                       |
| **ECS sur EC2**       | + scheduler                   | EC2 sous-jacentes, OS, image Docker      | **M11-M12**                       |
| **EKS**               | Control plane Kubernetes      | Worker nodes (EC2 ou Fargate), manifests | Mention M11                       |
| **Lambda**            | Tout sauf le code             | Code et configuration                    | **M4-M6**                         |
| **AppRunner**         | Tout sauf le code source      | Source repo ou image Docker              | **M7**                            |
| **Batch**             | Orchestration job + queue     | Image Docker, job def, calcul            | **M8**                            |
| **Lightsail**         | Quasi tout (offre simplifiée) | Code applicatif                          | Hors parcours                     |
| **Elastic Beanstalk** | Plateforme app (legacy)       | Code applicatif                          | Hors parcours                     |

EC2 est le **service compute fondateur** d'AWS (lancé en 2006). C'est la couche **la plus basse**, celle qui donne **le plus de contrôle** et qui demande **le plus de travail opérationnel**. Toutes les autres briques compute (ECS, EKS, Beanstalk historiquement) tournent en réalité **sur** des EC2 — parfois invisibles (Fargate), parfois visibles (ECS sur EC2).

Comprendre EC2 reste indispensable même quand on ne s'en sert pas directement : c'est le **modèle mental** des VMs dans le cloud, et la facture mentionne presque toujours des heures EC2 dans des comptes non triviaux.

### 1.2 — L'analogie de la flotte de véhicules

Penser à EC2 comme une **flotte de voitures de location** :

- Une **AMI** est le **modèle de voiture** : une Clio essence, une Tesla Model 3, un utilitaire Renault Master. Le modèle définit **avec quoi** la voiture part (intérieur, équipements installés en usine, software embarqué).
- Un **type d'instance** est la **motorisation** : 1.0 essence, 1.5 diesel, électrique, V8 sport. Le moteur définit **les performances** (CPU/RAM/réseau).
- Le **User Data** est la **prestation au comptoir** : "à la prise en charge, configurez le siège bébé, mettez le GPS sur destination Paris, branchez mon téléphone Bluetooth". C'est une **séquence d'instructions ponctuelles** exécutées une seule fois au démarrage du véhicule.

Choisir une AMI Linux Ubuntu + un type `t3.medium` + un User Data qui installe nginx, c'est demander un véhicule essence compact équipé d'origine Ubuntu, avec un mécano qui installe nginx au moment de la livraison.

### 1.3 — Trois décisions, structurelles dès la création

Avant de cliquer sur "Launch Instance", trois choix précèdent tout le reste :

1. **Quelle AMI ?** — détermine l'OS, les paquets pré-installés, le filesystem racine.
2. **Quel type d'instance ?** — détermine les performances et le coût horaire.
3. **Quel User Data ?** — détermine ce qui s'exécute automatiquement au premier boot.

Ces trois choix sont **les premiers leviers** de l'EC2. Le reste (subnets, Security Groups, EBS, IAM role) gravite autour mais relève davantage du M2 (cycle de vie) et du parcours Networking.

### 1.4 — Anti-patterns récurrents

| Anti-pattern                                                                    | Conséquence                                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Lancer une EC2 sans choisir d'AMI précise ("prends celle proposée par défaut"). | OS Linux US-EAST-1 → packages anglophones, time-zone UTC, fuseaux étranges. |
| Choisir un `m5.large` "parce que ça avait l'air costaud".                       | Surcoût de 40 % vs `t3.medium` pour un workload faiblement chargé.          |
| Mettre du `apt install` dans le User Data sans `apt update` ni `set -e`.        | Installation silencieusement cassée, debug au matin suivant.                |
| Recompiler une App en User Data 3 minutes à chaque boot.                        | Cold start applicatif énorme. **Préférer une AMI custom** (golden image).   |
| Garder la clé SSH `.pem` dans `git`.                                            | Toute la flotte compromise dès le premier `git push`.                       |

La suite du module donne les outils pour éviter ces pièges.

---

## 2. EC2 — définition

### 2.1 — Ce qu'est EC2

> **Amazon EC2** (Elastic Compute Cloud) est un service AWS qui fournit des **machines virtuelles** (VMs) à la demande, facturées à l'usage (seconde, minute ou heure selon le mode), avec un large choix de **systèmes d'exploitation**, de **dimensionnements** et d'options réseau / stockage.

Cinq propriétés à retenir :

1. **Virtual machine, pas container.** Une EC2 est une VM complète : kernel, OS, processus init, services système. Pas un container léger qui partage le kernel hôte (Docker, ECS Fargate).
2. **Hardware abstrait.** AWS expose des "types d'instances" qui sont des abstractions calibrées (vCPU, RAM, bande passante, etc.). On ne choisit pas un modèle de processeur précis, on choisit une **enveloppe**.
3. **Localisée dans une AZ.** Une EC2 vit dans **une seule** zone de disponibilité. Pour la haute disponibilité, on multiplie les instances dans plusieurs AZ (voir M3 et Networking M2).
4. **Stockage persistant via EBS.** Le disque principal d'une EC2 est presque toujours un volume **EBS** (Elastic Block Store). Vu dans le parcours Storage M7.
5. **Identité IAM via Instance Profile.** Une EC2 peut endosser un rôle IAM via un Instance Profile, ce qui lui donne des credentials AWS sans clé statique. Vu en Identity M3.

### 2.2 — Vocabulaire à fixer

| Terme                | Définition courte                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Instance**         | Une EC2 en cours d'exécution.                                                               |
| **Type d'instance**  | Le format de machine choisi (`t3.medium`, `m6i.large`, …).                                  |
| **AMI**              | Le "modèle d'usine" utilisé pour démarrer l'instance (voir section 3).                      |
| **AZ**               | Zone de disponibilité où vit physiquement l'instance.                                       |
| **VPC + Subnet**     | Réseau et sous-réseau dans lesquels l'instance reçoit son IP privée.                        |
| **Security Group**   | Pare-feu virtuel stateful attaché à l'instance.                                             |
| **Key pair**         | Paire de clés SSH (publique injectée dans l'AMI, privée détenue par l'utilisateur).         |
| **User Data**        | Script ou fichier cloud-init exécuté **une seule fois** au premier démarrage de l'instance. |
| **Instance Profile** | Wrapper qui rattache un rôle IAM à l'instance (credentials via l'IMDS).                     |
| **EBS**              | Volume de disque persistant attaché à l'instance.                                           |
| **Instance Store**   | Disque éphémère physiquement attaché à l'host (perdu à `stop`, conservé à `reboot`).        |

### 2.3 — Schéma d'une EC2 minimale

``` graphviz
  ┌──────────────────────────────────────────────┐
  │ Région : eu-west-1                           │
  │  ┌───────────────────────────────────────┐   │
  │  │ AZ : eu-west-1a                       │   │
  │  │                                       │   │
  │  │   ┌─────────────────────────────────┐ │   │
  │  │   │ Instance EC2                    │ │   │
  │  │   │ ──────────────────────────────  │ │   │
  │  │   │ • Type      : t3.medium         │ │   │
  │  │   │ • AMI       : ami-0a1b2c3d…     │ │   │
  │  │   │ • OS booté  : Ubuntu 24.04      │ │   │
  │  │   │ • User Data : install + start   │ │   │
  │  │   │ • IP privée : 10.0.1.42         │ │   │
  │  │   │ • IP publique : 52.49.x.y       │ │   │
  │  │   │ • SG        : ssh-from-bastion  │ │   │
  │  │   │ • Role IAM  : ec2-app-role      │ │   │
  │  │   │ ┌────────────────────────────┐  │ │   │
  │  │   │ │ Volume EBS gp3 30 GiB      │  │ │   │
  │  │   │ │ (root, /dev/xvda)          │  │ │   │
  │  │   │ └────────────────────────────┘  │ │   │
  │  │   └─────────────────────────────────┘ │   │
  │  └───────────────────────────────────────┘   │
  └──────────────────────────────────────────────┘
```

Quatre choses à intégrer :

1. L'instance est **dans une AZ** (pas "dans une région" en soi — elle a une AZ précise).
2. Le disque racine est **attaché**, pas embarqué dans la machine. Si l'host physique tombe, AWS redémarre la VM sur un autre host avec le **même** EBS.
3. Le **Security Group** et le **rôle IAM** sont des attachements indépendants de l'AMI.
4. Le User Data n'apparaît pas dans le schéma post-boot : il a déjà fait son office et est désormais inerte (sauf re-exécution explicite, rare — voir section 5.6).

---

## 3. AMI — Amazon Machine Image (item N1 explicite)

C'est **l'item N1 explicite** du module : expliquer ce qu'est une AMI.

### 3.1 — Définition

> Une **AMI** (Amazon Machine Image) est un **modèle pré-fabriqué** à partir duquel AWS construit le filesystem initial et la configuration d'une instance EC2. Elle contient un snapshot du disque racine, des métadonnées de boot, et des permissions de partage.

Concrètement, une AMI **est composée** de :

| Composant                         | Rôle                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Un ou plusieurs snapshots EBS** | Le contenu du disque racine au moment de la création de l'AMI (OS, paquets, fichiers, configuration). C'est un snapshot d'un EBS, donc régional. |
| **Métadonnées de boot**           | Architecture (x86_64, arm64), type de virtualisation (HVM, le standard), kernel ID, type de root device (`ebs` ou `instance-store`).             |
| **Bloc Device Mapping**           | Liste des volumes à attacher au lancement et leur taille par défaut.                                                                             |
| **Permissions de partage**        | Privé (compte AWS uniquement), partagé avec une liste de comptes, ou public.                                                                     |
| **Tags**                          | Étiquettes facultatives (Name, Owner, Project…).                                                                                                 |

Une AMI **ne contient pas** :

- L'identité IAM de l'instance (c'est l'Instance Profile, attaché au lancement).
- Le hostname ni l'IP (calculés au boot).
- Les clés SSH propres à l'utilisateur (injectées par cloud-init au boot, en lisant l'IMDS).
- Les Security Groups (attachés au lancement).

### 3.2 — Lire un ID d'AMI

Une AMI a un identifiant de la forme :

```txt
ami-0a1b2c3d4e5f67890
```

``` tree
ami-0a1b2c3d4e5f67890
│   └──────────────┘
│   identifiant aléatoire (hex), 17 caractères
└─── préfixe constant `ami-`
```

Les IDs **diffèrent d'une région à l'autre**, même pour une même AMI logique. L'AMI Ubuntu 24.04 du jour a un ID différent en `eu-west-1`, `us-east-1`, `eu-west-3`, etc. Conséquence : tout script qui hardcode un ID d'AMI est **lié à une région**.

Pour rendre un script portable, on cherche l'AMI **dynamiquement** :

```bash
# Trouver la dernière AMI Amazon Linux 2023 dans la région courante
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' \
  --output text
```

AWS publie des **Public SSM Parameters** pour les AMIs populaires (Amazon Linux, Ubuntu via Canonical, Windows). Toujours préférer cette approche à un ID en dur.

### 3.3 — Les quatre origines d'AMI

| Origine                                        | Qui la fabrique                                 | Quand l'utiliser                                                                                       |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **AWS-managed** (Amazon Linux, AWS Linux 2023) | AWS                                             | Point de départ par défaut sur AWS. Intégrations natives (CloudWatch agent, SSM, …).                   |
| **Vendeur tiers via Marketplace**              | Éditeur (Bitnami, Red Hat, Palo Alto, …)        | Quand on veut une distribution commerciale avec support (RHEL, Windows Server, appliances réseau).     |
| **Communauté (Community AMIs)**                | Communautés, projets OSS (Canonical, Debian, …) | Distributions Linux standards : Ubuntu (Canonical), Debian, Fedora, …                                  |
| **Custom (la sienne)**                         | Soi-même (golden image)                         | Quand on a besoin de booter en 30 s avec son stack pré-installé (build via Packer, EC2 Image Builder). |

Quelques exemples nommés :

| AMI                             | Origine                               | Usage typique                                                     |
| ------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| **Amazon Linux 2023 (AL2023)**  | AWS-managed                           | Par défaut pour la plupart des serveurs Linux AWS modernes.       |
| **Ubuntu Server 24.04 LTS**     | Community (Canonical)                 | Distribution la plus utilisée pour des apps OSS, scripts, devops. |
| **Red Hat Enterprise Linux 9**  | Marketplace (Red Hat)                 | Environnements enterprise avec support payant.                    |
| **Windows Server 2022 Base**    | AWS-managed (licence Windows incluse) | Apps .NET, Active Directory, SQL Server.                          |
| **Bitnami WordPress**           | Marketplace                           | POC ou site personnel, stack pré-câblée.                          |
| **Custom : nginx + app maison** | Construite via Packer                 | Auto-Scaling Group avec boot rapide (< 30 s).                     |

### 3.4 — Choisir une AMI — méthode

Quatre critères dans l'ordre :

1. **OS et famille.** Linux ou Windows ? Pour Linux, **Amazon Linux 2023** ou **Ubuntu LTS** dans 80 % des cas. Amazon Linux a une meilleure intégration AWS (agents pré-installés) ; Ubuntu a un écosystème de paquets plus large et de la documentation très répandue.
2. **Architecture.** `x86_64` (compatible Intel/AMD, par défaut) ou `arm64` (Graviton, 20-40 % moins cher à perf équivalente). Privilégier `arm64` quand le stack le supporte (Java, Python, Node.js, Go récents → oui ; binaires compilés vieux Intel-only → non).
3. **Hardening / sécurité.** Image standard ou durcie (CIS Benchmark Level 1/2) ? Pour la production sensible, viser une image durcie ou une golden image custom intégrant les durcissements.
4. **Cycle de vie.** AMI de l'année courante avec patches récents. Une AMI Ubuntu 22.04 LTS reste valable, mais une AMI sortie il y a 4 ans accumule des CVE non patchées.

Pour ce parcours et la pratique, défaut conseillé :

- **Linux générique** → Amazon Linux 2023 (`al2023-ami-*-x86_64`).
- **Linux écosystème large** → Ubuntu 24.04 LTS (`ubuntu/images/hvm-ssd/ubuntu-noble-24.04-amd64-server-*`).
- **Test arm64** → Graviton équivalents (`al2023-ami-*-arm64`).

### 3.5 — Construire une AMI custom — vue d'ensemble

Quand on déploie 20 fois la même config en moins de 30 s (Auto Scaling, scale-out à chaud), provisionner via User Data devient trop lent. La pratique recommandée :

1. **Construire une golden image** avec Packer (HashiCorp) ou EC2 Image Builder (service AWS) à partir d'une AMI publique de base.
2. Y installer **statiquement** tout ce qui ne change pas (runtime, dépendances système, agents).
3. Publier l'AMI dans un compte AWS dédié, la **partager** aux comptes consommateurs.
4. **Démarrer les EC2 à partir de cette AMI** : le boot est rapide et déterministe.

Ce sujet relève du **niveau 3** du glossaire. À ce stade, la maîtrise consiste à savoir qu'**il existe** cette pratique, et qu'elle vient remplacer un User Data trop lourd.

### 3.6 — Commandes utiles

```bash
# Lister les AMIs publiées par Amazon dans la région
aws ec2 describe-images --owners amazon \
  --filters "Name=name,Values=al2023-ami-*-x86_64" "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].[ImageId, Name, CreationDate]' \
  --output table

# Lister les AMIs propres au compte
aws ec2 describe-images --owners self \
  --query 'Images[].[ImageId, Name, CreationDate, State]' \
  --output table

# Détails d'une AMI précise
aws ec2 describe-images --image-ids ami-0a1b2c3d4e5f67890 \
  --query 'Images[0].{Name:Name, Arch:Architecture, Root:RootDeviceType, BlockDevices:BlockDeviceMappings}'
```

---

## 4. Familles et générations d'instances (item N1 explicite)

C'est **l'item N1 explicite** : connaître la raison d'être des familles et générations.

### 4.1 — Lire un nom d'instance — la nomenclature

Tout type d'instance suit le même format :

``` txt
m6i.xlarge
│ │ │
│ │ └─ taille (nano, micro, small, medium, large, xlarge, 2xlarge, …, 24xlarge, metal)
│ └─── ajouts d'attributs (i = Intel, a = AMD, g = Graviton/ARM, n = network, d = NVMe disk)
└───── famille (t = burstable, m = général, c = compute, r = mémoire, …)
       │
       └─── 6 = génération (1, 2, 3, 4, 5, 6, 7…)
```

Exemples :

| Nom           | Décomposition                                                          |
| ------------- | ---------------------------------------------------------------------- |
| `t3.medium`   | famille T, génération 3, taille medium, processeur Intel (par défaut). |
| `t4g.medium`  | famille T, génération 4, taille medium, processeur Graviton (ARM).     |
| `m6i.large`   | famille M, génération 6, Intel, taille large.                          |
| `c7a.2xlarge` | famille C, génération 7, AMD, taille 2xlarge.                          |
| `r6g.4xlarge` | famille R, génération 6, Graviton ARM, taille 4xlarge.                 |
| `i4i.8xlarge` | famille I (storage NVMe), génération 4, Intel, taille 8xlarge.         |
| `g5.12xlarge` | famille G (GPU), génération 5, taille 12xlarge.                        |
| `m6i.metal`   | famille M, génération 6, Intel, **bare metal** (pas d'hyperviseur).    |

### 4.2 — Pourquoi des familles différentes — l'item N1

> Chaque famille correspond à un **profil de ressources** différent (ratio vCPU/RAM, disque, réseau, GPU). Choisir la bonne famille évite de payer pour des ressources inutiles.

| Famille | Orientation                         | Ratio vCPU/RAM | Cas d'usage                                                                                  |
| ------- | ----------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| **T**   | Burstable général                   | 1:4 typique    | Apps à charge **irrégulière** (dev, staging, petits backends). Crédits CPU qui s'accumulent. |
| **M**   | Général équilibré                   | 1:4            | Apps moyennes "standard" sans surcharge sur un axe précis. Bonne option par défaut.          |
| **C**   | Compute-optimized                   | 1:2            | Calcul intensif CPU : encodage vidéo, ML inference CPU, scientific computing, jeux.          |
| **R**   | Memory-optimized                    | 1:8            | Bases en mémoire (Redis, ElasticSearch, BI), grosses caches, JVM lourdes.                    |
| **X**   | Mémoire extrême                     | 1:16+          | SAP HANA, in-memory OLTP, datasets très volumineux.                                          |
| **I**   | Storage NVMe local très performant  | 1:8            | Bases NoSQL haute IOPS (Cassandra, MongoDB), data warehousing local, NVMe.                   |
| **D**   | Storage local HDD massif            | 1:8            | Workloads big data sur disques massifs (HDFS, MapReduce, distrib batch).                     |
| **G**   | GPU général-purpose                 | —              | Inference ML, graphique 3D, encodage vidéo, jeu cloud.                                       |
| **P**   | GPU haute performance               | —              | Entraînement deep learning, HPC GPU.                                                         |
| **Inf** | Inférence ML AWS (Inferentia)       | —              | ML inference grand volume, optimisé coût.                                                    |
| **Trn** | Training ML AWS (Trainium)          | —              | Entraînement ML, alternative à P.                                                            |
| **Mac** | Apple silicon (Mac mini virtualisé) | —              | Compiler iOS/macOS apps en CI.                                                               |
| **A**   | Graviton (ARM) génération 1, hist.  | 1:2 / 1:4      | Historique, peu utilisée — remplacée par les variantes `*g` des autres familles.             |

**Heuristique pratique** :

- Backend HTTP standard sous-utilisé → **T** (T4g, T3a) — bon marché, économies sur les périodes creuses.
- Backend HTTP régulier → **M** (M6i, M6a, M7g).
- API forte en calcul (compression, transformation) → **C** (C7g, C7i).
- Base ou cache mémoire → **R** (R6g, R7g).
- Machine learning inference → **G** ou **Inf**.

### 4.3 — Pourquoi des générations différentes — l'item N1

> Chaque génération apporte un **bond de performance** et une **baisse du prix au vCPU** par rapport à la précédente. À usage équivalent, **la dernière génération est presque toujours moins chère que la précédente** (à puissance comparable).

À titre d'illustration (chiffres indicatifs en `eu-west-1`, On-Demand Linux) :

| Type        | Génération | Prix On-Demand approx. ($/h) | Note                          |
| ----------- | ---------- | ---------------------------- | ----------------------------- |
| `m4.large`  | 4 (2015)   | 0,111                        | Génération obsolète.          |
| `m5.large`  | 5 (2017)   | 0,107                        |                               |
| `m6i.large` | 6 (2021)   | 0,107                        | Intel Ice Lake.               |
| `m6a.large` | 6 (2021)   | 0,096                        | AMD EPYC, ~10 % moins cher.   |
| `m6g.large` | 6 (2020)   | 0,086                        | Graviton2, ~20 % moins cher.  |
| `m7g.large` | 7 (2022)   | 0,089                        | Graviton3, perf +25 % vs M6g. |

Quatre conséquences pratiques :

- **Toujours préférer la dernière génération disponible** dans la région cible (sauf compatibilité matérielle particulière).
- **Vérifier la disponibilité régionale** : la dernière génération met 6-12 mois à arriver dans toutes les régions.
- **Considérer Graviton (ARM)** quand la stack le supporte — 15 à 40 % d'économie à perf comparable, et meilleure efficience énergétique.
- **Faire des benchmarks** pour valider — la performance varie selon la charge réelle (CPU intensif, cache locality, I/O).

### 4.4 — Les tailles — t-shirt sizing

À l'intérieur d'une famille / génération, les tailles **doublent à chaque palier** :

| Taille     | vCPU | RAM (GiB) — exemple sur M6i     |
| ---------- | ---- | ------------------------------- |
| `nano`     | 2    | 0,5                             |
| `micro`    | 2    | 1                               |
| `small`    | 2    | 2                               |
| `medium`   | 2    | 4                               |
| `large`    | 2    | 8                               |
| `xlarge`   | 4    | 16                              |
| `2xlarge`  | 8    | 32                              |
| `4xlarge`  | 16   | 64                              |
| `8xlarge`  | 32   | 128                             |
| `12xlarge` | 48   | 192                             |
| `16xlarge` | 64   | 256                             |
| `24xlarge` | 96   | 384                             |
| `metal`    | 96   | 384 (bare metal, l'hôte entier) |

Toutes les familles ne proposent pas toutes les tailles : `t` s'arrête à `2xlarge`, `c` et `m` montent jusqu'à `metal`, etc.

**Le prix scale linéairement** avec la taille : un `m6i.xlarge` coûte exactement 2× un `m6i.large`. Conséquence : **deux `large` valent un `xlarge`** côté facture, mais offrent **plus de résilience** (perdre 1 instance ne perd que 50 % de la capacité au lieu de 100 %).

### 4.5 — Les instances burstables — le cas T

Les familles **T** (T2, T3, T3a, T4g) ont une particularité : la **performance CPU n'est pas garantie en continu**. Elles fonctionnent sur un système de **crédits CPU** :

- Au repos, l'instance accumule des crédits.
- En charge, elle consomme les crédits pour faire tourner le CPU à 100 %.
- Si les crédits sont épuisés, deux modes :
  - **Standard mode** : l'instance est throttlée à sa baseline (par exemple 20 % d'un vCPU pour `t3.medium`) — performances dégradées.
  - **Unlimited mode** (par défaut sur T3, T4g, T3a) : on continue à 100 % mais on **paye** un overage (~0,05 $/vCPU-heure de dépassement).

**Quand T est un bon choix** :

- Backends à charge variable / faible la plupart du temps (dev, staging, petit prod).
- Workloads avec pics courts et creux longs (build CI, agents de tâches).

**Quand T est un mauvais choix** :

- Workload **constamment** à 100 % CPU → la facture Unlimited explose, mieux vaut M ou C.
- Workload critique où une dégradation pendant un pic est inacceptable → préférer M.

```bash
# Voir le mode T credit d'une instance
aws ec2 describe-instance-credit-specifications --instance-ids i-0123456789abcdef0
```

### 4.6 — Choisir un type d'instance — méthode

Quatre questions, dans l'ordre :

1. **Quelle famille ?** En fonction du profil de ressources (T/M/C/R/G…).
2. **Quelle génération ?** La plus récente disponible dans la région.
3. **Intel, AMD ou Graviton ?** Graviton si le code est compatible (langages modernes). AMD pour une économie marginale sans ARM. Intel par défaut sinon.
4. **Quelle taille ?** Démarrer **petit** (au choix : `small` ou `medium`) puis ajuster au monitoring (M3). Trop d'équipes démarrent en `xlarge` "pour être tranquille" et restent à 5 % de CPU pendant 3 mois.

**Règle d'or** : **dimensionner par le bas** + **scale out** (plusieurs petites instances) plutôt que **dimensionner par le haut** (une grosse). Plus résilient, plus économique en cas de scaling, plus flexible.

---

## 5. User Data (item N2 explicite)

C'est **l'item N2 explicite** : expliquer ce qu'est le User Data.

### 5.1 — Définition

> Le **User Data** est un **script** (ou fichier cloud-init YAML) injecté dans une EC2 au moment de son **lancement**, et exécuté **automatiquement au premier boot** par l'agent cloud-init de l'AMI.

Concrètement, c'est le mécanisme qui répond à la question : "comment configurer ma toute neuve EC2 sans m'y connecter manuellement en SSH ?"

Quatre propriétés à retenir :

1. **Exécuté une seule fois** par défaut (au premier boot). Pas à chaque redémarrage.
2. **En root**. Le script tourne avec les pleins privilèges, **sans** intervention humaine.
3. **Lu depuis l'IMDS.** L'agent cloud-init de l'AMI récupère le User Data via l'**Instance Metadata Service** (`http://169.254.169.254/latest/user-data`).
4. **Limité à 16 KB** (taille brute du payload, avant compression base64). Pour les scripts plus lourds, on stocke le gros dans S3 et le User Data se contente de `aws s3 cp ... && bash script.sh`.

### 5.2 — Format — bash classique

Le format le plus simple : un script bash commençant par `#!/bin/bash`.

```bash
#!/bin/bash
set -euo pipefail

# Mettre à jour les paquets (Ubuntu)
apt-get update -y
apt-get upgrade -y

# Installer nginx
apt-get install -y nginx

# Configurer une page d'accueil
cat > /var/www/html/index.html <<EOF
<h1>Hello from $(hostname)</h1>
<p>Provisionné via User Data à $(date)</p>
EOF

# Démarrer et activer nginx
systemctl enable nginx
systemctl start nginx
```

Quelques règles d'hygiène :

- **`set -euo pipefail`** : faire échouer immédiatement le script à la première erreur. Sans cette ligne, un `apt-get install` planté n'empêche pas la suite, et l'instance termine son boot dans un état incohérent.
- **`apt-get update`** avant tout install — sinon les index sont obsolètes et l'install échoue.
- **Idempotence** : écrire le script comme s'il pouvait tourner plusieurs fois sans casser (utiliser `mkdir -p`, `systemctl enable` sans `start` puis `start`, etc.).
- **Pas de secrets** dans le User Data — il est lisible par toute personne avec l'IAM `ec2:DescribeInstanceAttribute`. Pour les secrets, utiliser Secrets Manager ou Parameter Store et les lire depuis le script avec le rôle IAM.

### 5.3 — Format — cloud-init YAML

Pour des configurations plus structurées (utilisateurs, fichiers, paquets), `cloud-init` accepte un format YAML déclaratif :

```yaml
#cloud-config

# Mise à jour des paquets
package_update: true
package_upgrade: true

# Paquets à installer
packages:
  - nginx
  - curl
  - jq

# Fichiers à créer
write_files:
  - path: /var/www/html/index.html
    content: |
      <h1>Hello, cloud-init!</h1>
    owner: root:root
    permissions: "0644"

# Commandes finales (exécutées en fin de provisionnement)
runcmd:
  - systemctl enable nginx
  - systemctl start nginx
```

**Quand préférer YAML ?** Quand la config a beaucoup de fichiers, d'utilisateurs et de paquets à gérer — le YAML est plus lisible et plus déclaratif. Pour 3 lignes de bash, autant rester en bash.

### 5.4 — Comment fournir le User Data

**Via la console AWS** : à la création de l'instance, dans "Advanced details > User data" (champ texte ou upload de fichier).

**Via la CLI** :

```bash
# Encoder le script en base64 et l'injecter
aws ec2 run-instances \
  --image-id ami-0a1b2c3d4e5f67890 \
  --instance-type t3.medium \
  --key-name my-key \
  --security-group-ids sg-0abc123 \
  --subnet-id subnet-0def456 \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tp-m1-ec2}]'
```

`file://user-data.sh` lit le fichier local et l'envoie tel quel — la CLI s'occupe du base64.

**Via Terraform** (pour référence) :

```hcl
resource "aws_instance" "web" {
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.medium"
  user_data     = file("user-data.sh")

  tags = { Name = "tp-m1-ec2" }
}
```

### 5.5 — Récupérer le User Data depuis l'instance

Depuis l'instance, on peut **lire** le User Data injecté en interrogeant l'IMDS :

```bash
# IMDSv2 (recommandé) — récupérer un token court
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Lire le User Data
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/user-data
```

Utile pour le debug : "qu'est-ce que mon instance a vraiment reçu au boot ?"

Les logs de l'exécution sont écrits dans :

```bash
/var/log/cloud-init.log
/var/log/cloud-init-output.log
```

C'est l'endroit à inspecter en cas d'échec du User Data — généralement la commande qui a planté y apparaît avec son code de retour.

### 5.6 — Le User Data ne s'exécute qu'une fois

Par défaut, cloud-init marque le User Data comme exécuté **après le premier boot** et n'y revient pas — même si l'instance redémarre.

Si on veut **forcer** une re-exécution (cas rare, typiquement pour développer un script de provisionnement) :

```bash
# Effacer le marqueur cloud-init
sudo cloud-init clean
sudo reboot
```

Ou via l'attribut d'instance avant un stop/start :

```bash
# Modifier le User Data (ne s'applique qu'au prochain boot si on a aussi cloud-init clean)
aws ec2 modify-instance-attribute --instance-id i-0123 \
  --user-data file://nouveau-user-data.sh
```

**Bonne pratique** : ne pas s'appuyer sur un User Data modifiable post-boot. Si l'on veut **changer** la config d'une instance vivante, on utilise SSM Patch Manager, Ansible, ou — mieux — on **remplace** l'instance par une nouvelle (immutable infrastructure).

### 5.7 — Anti-patterns sur le User Data

| Anti-pattern                                                   | Conséquence                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Stocker un mot de passe ou une clé API en clair.               | Lecture possible par toute personne ayant `ec2:DescribeInstanceAttribute`.           |
| Recompiler une app entière à chaque boot.                      | Cold start de 10-20 minutes ; coûteux et fragile. Préférer une AMI custom.           |
| Faire un script de 500 lignes monolithique.                    | Debug pénible. Mieux : 5 fichiers `bash` modulaires ou cloud-init YAML.              |
| Oublier `set -e` ou un équivalent.                             | Échec silencieux, instance "à moitié" provisionnée.                                  |
| Dépendre de DNS sortant non encore configuré.                  | Échec si la résolution DNS n'est pas prête au moment du `curl`. Tester.              |
| Mettre tout en User Data sans rôle IAM.                        | Aucun accès à S3, Secrets Manager… → workarounds dangereux (credentials hard-codés). |
| Modifier User Data **post-boot** en pensant que ça s'applique. | Cloud-init ne le rejoue pas sans `cloud-init clean`. Logique fragile.                |

---

## 6. Lancer une première EC2 — méthode complète

Ce parcours pédagogique du M1 : créer **une** EC2 minimale dont on contrôle AMI, type et User Data.

### 6.1 — Pré-vérifications

```bash
# Identité IAM courante
aws sts get-caller-identity

# Région courante
aws configure get region

# Subnet du VPC par défaut dans une AZ donnée
aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" "Name=availability-zone,Values=eu-west-1a" \
  --query 'Subnets[0].SubnetId' --output text

# Security Group par défaut du VPC
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text
```

### 6.2 — Préparer une key pair SSH

```bash
# Créer une key pair (la clé privée s'imprime en stdout — la sauvegarder)
aws ec2 create-key-pair --key-name tp-m1-key \
  --query 'KeyMaterial' --output text > ~/.ssh/tp-m1-key.pem

chmod 400 ~/.ssh/tp-m1-key.pem
```

La clé `.pem` ne peut être téléchargée **qu'à la création**. Perdue, on en re-crée une nouvelle (et on perd l'accès SSH des EC2 existantes — sauf à passer par SSM Session Manager).

### 6.3 — Choisir une AMI dynamiquement

```bash
# Dernière AMI Amazon Linux 2023, x86_64
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)
echo "AMI choisie : $AMI_ID"
```

### 6.4 — Préparer un User Data minimal

`user-data.sh` :

```bash
#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log) 2>&1

dnf update -y
dnf install -y nginx

cat > /usr/share/nginx/html/index.html <<EOF
<h1>Hello from EC2</h1>
<p>Instance : $(hostname)</p>
<p>AMI : $(curl -s http://169.254.169.254/latest/meta-data/ami-id || echo "n/a")</p>
<p>AZ   : $(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone || echo "n/a")</p>
<p>Build at $(date -u +%FT%TZ)</p>
EOF

systemctl enable --now nginx
```

Trois points utiles :

- `exec > >(tee /var/log/user-data.log) 2>&1` redirige toutes les sorties vers un log auxiliaire (en plus du `cloud-init-output.log` standard).
- On lit l'IMDS pour afficher des infos contextuelles dans la page — bon réflexe à acquérir tôt.
- On utilise `dnf` (gestionnaire de paquets d'Amazon Linux 2023), pas `apt`.

### 6.5 — Lancer l'instance

```bash
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" "Name=availability-zone,Values=eu-west-1a" \
  --query 'Subnets[0].SubnetId' --output text)

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.medium \
  --key-name tp-m1-key \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tp-m1-ec2},{Key=Project,Value=noledj}]' \
  --query 'Instances[0].InstanceId' --output text
```

### 6.6 — Vérifier le bon démarrage

```bash
INSTANCE_ID=<ID retourné ci-dessus>

# Suivre l'état
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# Récupérer l'IP publique
PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

# Tester (si SG autorise port 80 entrant — pour le default SG, ce ne sera pas le cas
# par défaut ; voir Networking M3 pour ouvrir le port)
curl http://$PUBLIC_IP

# SSH (si SG autorise port 22 depuis votre IP)
ssh -i ~/.ssh/tp-m1-key.pem ec2-user@$PUBLIC_IP
```

Pour ce parcours et le démarrage, on ouvre les ports 22 (SSH) et 80 (HTTP) dans le SG depuis son IP personnelle uniquement — pas en `0.0.0.0/0`. Si on a déjà suivi Networking M3, c'est un acquis ; sinon, l'exercice 3 de ce module l'introduit.

### 6.7 — Inspecter les logs du User Data

```bash
ssh -i ~/.ssh/tp-m1-key.pem ec2-user@$PUBLIC_IP "sudo tail -n 50 /var/log/cloud-init-output.log"
```

Le log montre la séquence complète : récupération du User Data, exécution du script, codes de retour. Indispensable pour diagnostiquer une instance qui ne sert pas la page attendue.

### 6.8 — Terminer l'instance proprement

```bash
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
```

L'instance et son volume EBS racine (configuré par défaut en `DeleteOnTermination: true`) disparaissent. La key pair persiste (à supprimer aussi avec `aws ec2 delete-key-pair`).

Le cycle de vie complet (différence stop / terminate / hibernate, modèles de facturation On-Demand / Spot / Reserved) est l'objet de **M2**.

---

## 7. Anti-patterns transverses

| Anti-pattern                                             | Risque                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardcoder un ID d'AMI dans un script multi-régions.      | Le script casse silencieusement dès qu'on déploie hors de la région d'origine.                                                                              |
| Choisir un type d'instance "au pifomètre" sans bench.    | Surcoût important (typiquement ×2 à ×3) ou throttling en charge.                                                                                            |
| Démarrer une EC2 dans le VPC par défaut pour de la prod. | Pas de séparation propre des environnements. Pour la prod : VPC dédié.                                                                                      |
| User Data avec des secrets en clair.                     | Toute personne avec lecture EC2 voit les secrets.                                                                                                           |
| Ouvrir `0.0.0.0/0` sur le port 22 pour SSH.              | Tentatives de brute-force constantes. SSH bastion ou SSM Session Manager.                                                                                   |
| Recopier une AMI Marketplace en oubliant la licence.     | Coût caché : la licence Marketplace s'ajoute au prix horaire EC2.                                                                                           |
| Lancer en `metal` "pour la perf".                        | Bare metal = très cher (souvent 5 × le prix d'une `large` correspondante). Justifié seulement pour des cas spécifiques (KVM imbriqué, latence ultra basse). |

---

## 8. Exercices pratiques

### Exercice 1 — Décoder une nomenclature d'instance (≈ 15 min)

**Objectif.** Maîtriser la lecture de la nomenclature, item N1 explicite.

Pour chacun des types ci-dessous, indiquer : **famille**, **génération**, **processeur** (Intel/AMD/Graviton), **taille**, et **un cas d'usage typique** :

1. `m6i.large`
2. `c7g.4xlarge`
3. `r5a.2xlarge`
4. `t4g.nano`
5. `g5.xlarge`
6. `i4i.16xlarge`
7. `m7a.metal`

**Livrable.** Tableau avec une ligne par type.

### Exercice 2 — Trouver et comparer des AMIs (≈ 20 min)

**Objectif.** Maîtriser le sourcing d'AMIs.

**Étapes :**

1. Trouver l'ID de la dernière AMI **Amazon Linux 2023** dans `eu-west-1` via SSM Parameter Store.
2. Trouver l'ID de la dernière AMI **Ubuntu 24.04 LTS** dans la même région (chercher dans `aws ec2 describe-images --owners 099720109477` — l'AWS account ID de Canonical).
3. Comparer les deux AMIs en taille (root volume default) et architecture supportée.
4. Refaire les deux requêtes dans `us-east-1` et vérifier que **les IDs sont différents**.

**Livrable.** Mémo de 10-15 lignes avec les 4 IDs et les écarts constatés.

### Exercice 3 — Lancer une EC2 avec User Data (≈ 45 min)

**Objectif.** L'item N2 explicite, et le scénario central du M1.

**Étapes :**

1. Créer une key pair `tp-m1-key`.
2. Créer un Security Group `tp-m1-sg` autorisant **uniquement votre IP** sur les ports 22 (SSH) et 80 (HTTP).
3. Lancer une `t3.micro` Amazon Linux 2023 dans une AZ de votre choix, avec un User Data qui :
   - Installe nginx.
   - Affiche le hostname, l'AZ, l'AMI, l'heure du build dans `index.html`.
4. Récupérer l'IP publique et tester avec `curl`.
5. SSH dans l'instance et inspecter `/var/log/cloud-init-output.log` pour valider que le User Data a tourné sans erreur.
6. Terminer l'instance, supprimer la key pair et le SG.

**Livrable.** Capture du `curl` réussi + extrait du `cloud-init-output.log`.

### Exercice 4 — Adapter le User Data au cloud-init YAML (≈ 30 min)

**Objectif.** Manipuler les deux formats de User Data.

Reprendre le User Data de l'exercice 3 (bash) et le **réécrire en `#cloud-config` YAML** :

- Mise à jour des paquets.
- Installation de nginx.
- Création de la page HTML.
- Démarrage du service.

Relancer une nouvelle EC2 avec ce User Data, vérifier que le résultat est identique.

**Livrable.** Le fichier `user-data.yaml` + capture du `curl`.

### Exercice 5 — Choix de type d'instance par cas d'usage (≈ 30 min)

**Objectif.** Application de la grille familles/générations/tailles.

Pour chaque cas, **choisir un type d'instance précis** et justifier en 2-3 lignes :

1. Backend web Node.js, ~20 req/s en moyenne, pics rares à 100 req/s, environnement de dev partagé par 3 personnes.
2. Service de transcodage vidéo (ffmpeg) tournant constamment à 100 % CPU sur 4 cœurs.
3. Cache Redis avec 60 GB de données chaudes en mémoire, latence sub-milliseconde requise.
4. Worker batch nocturne traitant 2h de calcul puis idle 22h — budget contraint.
5. Endpoint d'inférence d'un modèle ML léger (CNN, 100 ms par prédiction).

**Livrable.** Tableau avec type proposé + justification + estimation prix On-Demand mensuel (24/7 ou usage réel).

### Mini-défi — Provisionnement d'une stack simple (≈ 60 min)

Concevoir et lancer une EC2 qui sert, dès son boot :

- Une page d'accueil `/` simple en HTML.
- Un endpoint `/healthz` répondant `200 OK`.
- Un endpoint `/info` exposant `hostname`, `instance-id`, `availability-zone`, `local-ipv4`, `public-ipv4` lus via l'IMDS.

Contraintes :

- Une seule commande `aws ec2 run-instances`.
- User Data ≤ 100 lignes, idempotent.
- Pas de credentials en dur.
- Le rôle IAM (Instance Profile) est facultatif au M1, mais on documentera comment il faudrait l'utiliser pour lire un secret depuis Secrets Manager (M9-M10 du parcours Identity).

**Livrable.** Le script `user-data.sh`, la commande de lancement, et des captures des trois endpoints.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **EC2** et le positionner par rapport à ECS, Lambda et AppRunner.
- [ ] Citer le **vocabulaire EC2** : instance, type d'instance, AMI, AZ, EBS, Instance Profile, User Data.
- [ ] Définir une **AMI**, citer ses 5 composants et ses 4 origines (AWS, Marketplace, Community, Custom).
- [ ] **Décoder** un type d'instance (par exemple `c7g.4xlarge`) : famille, génération, processeur, taille.
- [ ] Citer **5 familles** d'instances et leur orientation (T burstable, M général, C compute, R mémoire, G GPU).
- [ ] Expliquer **pourquoi il existe des générations** et donner un ordre de grandeur des gains entre 2 générations consécutives.
- [ ] Expliquer le principe des **instances burstables** T (crédits CPU, mode Standard vs Unlimited).
- [ ] Définir le **User Data** : quand exécuté, par qui (cloud-init), avec quels privilèges, et sa limite (16 KB).
- [ ] Écrire un **User Data bash minimal** idempotent (avec `set -e`, redirection des logs).
- [ ] Décrire **comment lancer une EC2** (CLI minimum : ami-id, type, subnet, SG, key pair, user-data).
- [ ] Lister **3 anti-patterns** de User Data et expliquer pourquoi.

### Items du glossaire visés

**N1 atteint** :

- _ce qu'est une AMI dans un EC2_ — section 3.
- _il existe différentes familles et différentes générations d'instances EC2_ — section 4.

**N2 atteint** :

- _ce qu'est le User Data pour un EC2_ — section 5.
- _déterminer quel type et quelle famille d'instance EC2 est la plus pertinente pour son cas d'usage_ — section 4.6.

(Le choix de l'**AMI la plus pertinente** est un item N3 — abordé en surface en 3.4 et 3.5, approfondissement renvoyé à plus tard.)

---

## 10. Ressources complémentaires

### Documentation AWS

- [Amazon EC2 User Guide](https://docs.aws.amazon.com/ec2/latest/userguide/)
- [AMIs — concepts](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html)
- [Instance types](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html) — la référence exhaustive (mises à jour à chaque nouveau type).
- [Run commands at launch (User Data)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
- [cloud-init documentation](https://cloudinit.readthedocs.io/en/latest/)
- [Instance Metadata Service v2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)
- [Public SSM Parameters for AMIs](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters-ami.html)

### Tarification

- [EC2 On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/) — comparer générations / tailles.
- [Instance Selector CLI](https://github.com/aws/amazon-ec2-instance-selector) — outil de recommandation de type selon vCPU/RAM cibles.

### Construire ses propres AMIs (N3)

- [Packer by HashiCorp](https://www.packer.io/) — l'outil de référence.
- [EC2 Image Builder](https://docs.aws.amazon.com/imagebuilder/latest/userguide/what-is-image-builder.html) — l'équivalent natif AWS.

### Pour aller plus loin

- **M2 (EC2 pricing et cycle de vie)** — On-Demand, Spot, Reserved, Savings Plans ; states stopped / terminated / hibernated.
- **M3 (Métriques et monitoring)** — CloudWatch metrics CPU / RAM / disque / réseau d'une EC2.
- **AWS Networking M2-M3** — VPC, subnets, Security Groups : l'environnement réseau de l'EC2.
- **AWS Identity M3** — Instance Profile : donner une identité IAM à l'EC2 sans access key statique.
