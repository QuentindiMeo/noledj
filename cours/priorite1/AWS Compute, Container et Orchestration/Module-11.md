# M11 — ECS, bases (Fargate vs EC2, Task Definition)

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **Amazon ECS** (Elastic Container Service) : service d'orchestration de containers managé par AWS, et le positionner par rapport à **EKS**, **AppRunner**, et un cluster Kubernetes self-managed.
- Citer les **5 objets fondamentaux** d'ECS : **Cluster**, **Task Definition**, **Task**, **Service**, et (pour le launch type EC2) **Container Instance**.
- Distinguer les **deux launch types** (item N2 explicite) : **Fargate** (serverless, AWS gère les hosts) vs **EC2** (on gère un Auto Scaling Group d'EC2 enregistrées dans le cluster). Connaître leurs trade-offs respectifs sur 6+ critères.
- Définir une **Task Definition** (item N2 explicite) : son rôle de "template" immuable, ses sections clés (family, containerDefinitions, networkMode, IAM roles, resource requirements, volumes).
- **Écrire et déployer** une Task Definition Fargate simple avec une image ECR, un health check, des variables d'environnement, des secrets injectés depuis Secrets Manager, et un log driver CloudWatch.
- Comprendre le mode réseau **`awsvpc`** (un ENI par task) et son rôle dans Fargate vs EC2.
- Distinguer **Task Role** (permissions du code) et **Task Execution Role** (permissions du runtime ECS pour pull l'image et publier les logs).

## Durée estimée

1 jour.

## Pré-requis

- M1-M3 (EC2 : pour comprendre le launch type EC2).
- M10 (ECR : la Task Definition pointe vers une image dans ECR).
- AWS CLI v2 configurée.
- Docker installé localement (pour push une image de test).
- Permissions IAM : `ecs:*`, `iam:CreateRole`, `iam:PassRole`, `ec2:*`, `elasticloadbalancing:*`, `secretsmanager:GetSecretValue`, `logs:*`.
- AWS Networking M2-M4 (VPC, subnets, Security Groups — l'`awsvpc` mode en a besoin).

---

## 1. Pourquoi un module dédié à ECS

### 1.1 — La place d'ECS dans le catalogue compute

Reprise de la cartographie M1, focalisée sur les containers :

| Service                     | Niveau d'abstraction                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **EC2 + Docker manuel**     | On gère tout : OS, Docker daemon, déploiement.                                              |
| **ECS sur EC2**             | AWS gère le scheduler ; on gère les EC2 sous-jacentes.                                      |
| **ECS Fargate**             | AWS gère **tout** sauf l'image et la config (Task Definition).                              |
| **AppRunner**               | AWS gère encore plus : LB, certificat, scaling automatique inclus, juste l'image à fournir. |
| **EKS**                     | Kubernetes managé : control plane par AWS, worker nodes (EC2 ou Fargate) à gérer.           |
| **Kubernetes self-managed** | On gère tout, y compris le control plane.                                                   |

**ECS** est le **premier niveau d'orchestration** qu'on rencontre quand on quitte le container "manuel" sur EC2 et qu'on veut un **scheduler** qui :

- Place les containers sur des hosts.
- Les redémarre s'ils meurent.
- Les met à jour proprement (rolling deploy).
- Les expose derrière un load balancer.
- Les fait scaler.

### 1.2 — ECS vs EKS — le choix d'orchestrateur

| Critère                 | **ECS**                                  | **EKS (Kubernetes)**                                               |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Origine                 | Service propriétaire AWS.                | Standard CNCF open-source.                                         |
| Courbe d'apprentissage  | Quelques heures pour les bases.          | Plusieurs semaines.                                                |
| Portabilité multi-cloud | Faible (vendor lock-in).                 | **Forte** (Kubernetes tourne partout).                             |
| Écosystème              | AWS-centric.                             | Massif (Helm, Argo, Istio, Knative, …).                            |
| Coût control plane      | Gratuit.                                 | 0,10 $/h (~73 $/mois).                                             |
| Sweet spot              | Petites/moyennes équipes, **stack AWS**. | Équipes plus grandes, besoins avancés (mesh, GitOps, multi-cloud). |

Pour ce parcours et la majorité des cas réels en France, **ECS** est le bon point d'entrée. EKS est mentionné mais hors périmètre direct du module.

### 1.3 — L'analogie de la cuisine de restaurant

Penser à ECS comme **la cuisine d'un restaurant** :

- Un **Cluster** = la cuisine (l'espace de travail).
- Une **Task Definition** = la recette (immuable, versionnée).
- Une **Task** = un plat en cours de préparation, suivant une recette précise.
- Un **Service** = la commande standing "garde 3 burgers prêts en permanence pour la salle" — le chef remplace au fur et à mesure.
- Une **Container Instance** (EC2 launch type) = un poste de cuisson individuel ; en Fargate, AWS fournit la table de cuisson à la demande.

L'analogie est utile : on **ne refait pas la recette** quand on cuisine un plat ; on prend une recette existante et on l'exécute. On peut publier une nouvelle version (Task Definition `:5`) sans perdre les anciennes.

### 1.4 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                            | Conséquence                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Démarrer en **EC2 launch type** "pour économiser" sans expertise EC2.   | Surcharge opérationnelle (patching, ASG, scaling). Fargate gagne en TCO sur petit/moyen. |
| **Pas de Task Role** distinct du Task Execution Role.                   | Le code applicatif a des permissions de pull image et de logs (inutiles + risques).      |
| **Hardcoded credentials** dans `environment` au lieu de `secrets`.      | Visibles dans la Task Definition. Utiliser Secrets Manager / Parameter Store.            |
| Une seule Task Definition `:latest` qu'on rewrite à chaque déploiement. | Pas de rollback fiable. Toujours **publier une nouvelle révision**.                      |
| Pas de **health check** dans la Task Definition.                        | Tasks "zombies" qui répondent 500 sans être remplacées.                                  |
| **`bridge` network mode** en Fargate.                                   | Non supporté. Fargate exige `awsvpc`.                                                    |
| Pas de log driver configuré.                                            | Logs perdus à la mort du container.                                                      |

---

## 2. ECS — définition et objets fondamentaux

### 2.1 — Ce qu'est ECS

> **Amazon Elastic Container Service (ECS)** est un service d'**orchestration de containers** fully managed par AWS. ECS planifie, exécute et supervise des containers Docker sur une **flotte de hosts** — soit gérée par AWS (Fargate), soit fournie par nous (EC2 enregistrées dans le cluster).

Quatre propriétés à retenir :

1. **Propriétaire AWS** (pas Kubernetes). API simple, vocabulaire propre.
2. **Deux launch types** : Fargate (serverless) et EC2 (cluster d'EC2 à gérer).
3. **Intégré profondément** à AWS : IAM, CloudWatch, ALB/NLB, Service Discovery, Secrets Manager, ECR.
4. **Gratuit** (sauf la facturation des resources sous-jacentes : Fargate ou EC2 + ALB + …).

### 2.2 — Les 5 objets fondamentaux

| Objet                  | Définition courte                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Cluster**            | Un **groupement logique** de ressources (Fargate capacity providers, EC2 enregistrées) sur lequel tournent des tasks. |
| **Task Definition**    | Un **template immuable** qui décrit comment lancer une ou plusieurs containers (image, CPU, RAM, env, …). Versionnée. |
| **Task**               | Une **instance** d'une Task Definition en train de tourner. Composée d'un ou plusieurs containers.                    |
| **Service**            | Un **gestionnaire** qui maintient un nombre N de tasks en permanence, gère le rolling deploy, intègre l'ALB, etc.     |
| **Container Instance** | Une **EC2 enregistrée** dans le cluster (uniquement pour le launch type EC2). N'existe pas en Fargate.                |

Vu d'ensemble :

```graph
   ┌────────────────────────────────────────────────────────────┐
   │ Cluster "prod-cluster"                                     │
   │                                                            │
   │   ┌──────────────────────────────────────┐                │
   │   │ Service "web-service"                │                │
   │   │ desired count = 3                    │                │
   │   │                                      │                │
   │   │  Task ←─ Task Definition "web:5"     │                │
   │   │   ├─ Container "nginx"               │                │
   │   │   └─ Container "fluent-bit" (side-car)│               │
   │   │                                      │                │
   │   │  Task ←─ Task Definition "web:5"     │                │
   │   │   ├─ Container "nginx"               │                │
   │   │   └─ Container "fluent-bit"          │                │
   │   │                                      │                │
   │   │  Task ←─ Task Definition "web:5"     │                │
   │   │   └─ ...                             │                │
   │   └──────────────────────────────────────┘                │
   │                                                            │
   │   Capacity providers : FARGATE, FARGATE_SPOT, EC2-ASG     │
   └────────────────────────────────────────────────────────────┘
```

### 2.3 — Cluster — détails

Un cluster est essentiellement un **namespace** logique. Il définit :

- Quelles **capacity providers** sont disponibles (Fargate, Fargate Spot, un ou plusieurs Auto Scaling Groups d'EC2).
- Des **paramètres globaux** : Container Insights activé ou non, default capacity provider strategy.

Un cluster ne **coûte rien en soi**. Ce qui coûte, c'est ce qui tourne dedans.

```bash
aws ecs create-cluster --cluster-name tp-m11-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
  --settings name=containerInsights,value=enabled
```

### 2.4 — Service vs Task standalone

Deux manières de faire tourner une Task Definition :

| Mode                | Description                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Task standalone** | `aws ecs run-task` — lance 1 task, ECS ne la remplace pas si elle meurt. Pour des jobs ponctuels (batch, cron). |
| **Service**         | `aws ecs create-service` — ECS maintient `desiredCount` tasks en permanence, rolling update, intégration LB.    |

Pour des **services HTTP long-running**, toujours utiliser un **Service**. Le standalone est réservé aux jobs finis dans le temps (à orchestrer avec Step Functions ou Batch).

---

## 3. Launch type — Fargate vs EC2 (item N2 explicite)

### 3.1 — Définition de chacun

> **Fargate** : AWS fournit la capacité compute "à la demande", par task. Aucune EC2 à gérer.
>
> **EC2 launch type** : on enregistre des EC2 (souvent un Auto Scaling Group) dans le cluster, et ECS y place les tasks. On gère le sizing, le scaling et le patching des EC2.

### 3.2 — Tableau comparatif détaillé

| Critère                            | **Fargate**                                  | **EC2 launch type**                                             |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Provisioning**                   | AWS provisionne à la demande, par task.      | On gère un ASG d'EC2.                                           |
| **Scaling**                        | Scaling au niveau **task**.                  | Scaling au niveau **EC2** + tasks. Plus complexe.               |
| **Patching OS / kernel**           | AWS gère totalement.                         | On gère (AMI ECS-optimized, mise à jour).                       |
| **CPU/RAM disponibles**            | 0,25-16 vCPU, 0,5-120 GB.                    | Tout ce que la famille EC2 propose, jusqu'à 768 GB+ et 96 vCPU. |
| **GPU**                            | **Non supporté**.                            | **Oui** (instance G/P).                                         |
| **Network mode**                   | **Obligatoire : `awsvpc`** (1 ENI par task). | Au choix : `awsvpc`, `bridge`, `host`, `none`.                  |
| **Stockage éphémère**              | 20 GB par défaut, jusqu'à 200 GB.            | Capacité disque de l'instance EC2 (peut être très grande).      |
| **Pricing**                        | vCPU-h + GB-h, **par task**.                 | Coût des EC2 + ECS gratuit.                                     |
| **Spot**                           | **FARGATE_SPOT** (interruptible).            | Spot EC2 classique.                                             |
| **Cold start de task**             | 30-90 s (création task + pull image).        | Plus rapide si EC2 déjà chaude ; sinon similaire.               |
| **Effort opérationnel**            | **Très faible**.                             | Moyen à élevé.                                                  |
| **Mode d'exécution**               | Tasks isolées (Firecracker microVM).         | Tasks colocalisées sur la même EC2.                             |
| **Side-cars supportés**            | Oui (containers dans la même task).          | Oui.                                                            |
| **Daemon containers** (1 par node) | Non.                                         | **Oui** (utile pour agent Datadog, fluent-bit, …).              |

### 3.3 — Quand Fargate gagne

- **Microservices stateless** à charge variable.
- **Équipe sans expertise** EC2 / Linux poussée.
- **Pas besoin de GPU**, pas de très grosses instances.
- **Petite à moyenne échelle**.
- **Pas de side-cars haute-fréquence** type "agent fluent-bit qui consomme 0,1 vCPU sur chaque node".

C'est le **choix par défaut** pour 80 % des cas en 2026.

### 3.4 — Quand EC2 launch type gagne

- **GPU obligatoire** (G/P instances).
- **Très grosses instances** (> 16 vCPU ou > 120 GB RAM).
- **Workload constant et prévisible** sur grosse échelle où le pricing EC2 (avec RI ou Savings Plans) bat Fargate.
- **Besoin de "daemon" partagé** entre tasks (un agent par EC2, pas par task).
- **Stockage local NVMe massif** (familles `i4i`, `d3`).
- **Réseau host mode** ou autre besoin réseau spécial.

### 3.5 — Mix de capacity providers

Un même cluster peut **mixer** plusieurs capacity providers :

```bash
aws ecs create-service ... \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=2,base=2 \
    capacityProvider=FARGATE_SPOT,weight=8
```

Lecture : "garder 2 tasks Fargate base, puis répartir 20/80 entre Fargate régulier et Fargate Spot." Économie + résilience.

### 3.6 — Anti-patterns launch type

| Anti-pattern                                          | Conséquence                                      |
| ----------------------------------------------------- | ------------------------------------------------ |
| Fargate pour un workload **constant 24/7 énorme**.    | 30-50 % plus cher qu'EC2 RI équivalent.          |
| EC2 launch type pour **3 tasks** sur petits services. | Surcoût opérationnel injustifié.                 |
| 100 % FARGATE_SPOT sans tolérance à l'interruption.   | Service indisponible aux pires moments.          |
| **Tasks géantes** (15 vCPU) sur Fargate.              | Limite proche, pas de stretch ; surcoût Fargate. |

---

## 4. Task Definition (item N2 explicite)

### 4.1 — Définition

> Une **Task Definition** est un **document JSON** (versionné en révisions) qui décrit **comment lancer une ou plusieurs containers ensemble** : image, CPU/RAM, environnement, secrets, IAM roles, volumes, ports, dépendances entre containers, mode réseau, log driver.

Quatre propriétés à retenir :

1. **Immuable** : on ne modifie pas une Task Definition existante, on en **publie une nouvelle révision** (`my-task:5`, `my-task:6`, …).
2. **Indépendante du cluster** : la même Task Def peut tourner dans plusieurs clusters.
3. **Indépendante du launch type** dans une certaine mesure (mais certaines options sont spécifiques à Fargate ou EC2).
4. **Identifiée par "family + revision"** : `my-task:5`. Le numéro de révision s'incrémente automatiquement.

### 4.2 — Structure générale

```json
{
  "family": "tp-m11-web",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/AppTaskRole",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": {
    "operatingSystemFamily": "LINUX",
    "cpuArchitecture": "ARM64"
  },
  "containerDefinitions": [
    {
      "name": "web",
      "image": "ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/my-app:1.4.2",
      "essential": true,
      "portMappings": [{ "containerPort": 8080, "protocol": "tcp" }],
      "environment": [
        { "name": "ENV", "value": "prod" },
        { "name": "LOG_LEVEL", "value": "info" }
      ],
      "secrets": [
        {
          "name": "DATABASE_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:prod/db-pass-abc123"
        }
      ],
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:8080/healthz || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 30
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/tp-m11-web",
          "awslogs-region": "eu-west-1",
          "awslogs-stream-prefix": "web",
          "awslogs-create-group": "true"
        }
      },
      "stopTimeout": 30
    }
  ]
}
```

### 4.3 — Sections clés

#### Family

Le **nom logique** de la Task Definition. Tous les containers d'un même service utilisent la même `family`. Les révisions s'enchaînent : `tp-m11-web:1`, `tp-m11-web:2`, etc.

#### Compatibilité — `requiresCompatibilities`

Au choix : `["FARGATE"]`, `["EC2"]`, ou les deux `["FARGATE","EC2"]`. Détermine quelles validations AWS applique au moment d'enregistrer la Task Def.

#### Network mode

| Mode     | Description                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| `awsvpc` | **Chaque task** reçoit sa propre ENI dans un subnet du VPC. Mode obligatoire en Fargate. |
| `bridge` | Docker bridge network — chaque container partage l'IP de l'EC2 hôte avec NAT.            |
| `host`   | Le container partage directement le réseau de l'EC2 hôte (pas d'isolation).              |
| `none`   | Pas de réseau (rare).                                                                    |

`awsvpc` est **fortement recommandé** : chaque task a une IP, son propre SG, sa propre exposition réseau — plus simple à raisonner et à sécuriser.

#### Resource requirements

Pour Fargate, les couples `cpu` / `memory` doivent suivre une **matrice limitée** :

| CPU              | Memory (combinaisons valides)           |
| ---------------- | --------------------------------------- |
| 256 (.25 vCPU)   | 512, 1024, 2048 MB                      |
| 512 (.5 vCPU)    | 1024, 2048, 3072, 4096 MB               |
| 1024 (1 vCPU)    | 2048 → 8192 MB (par incréments de 1024) |
| 2048 (2 vCPU)    | 4096 → 16 384 MB                        |
| 4096 (4 vCPU)    | 8192 → 30 720 MB                        |
| 8192 (8 vCPU)    | 16 384 → 61 440 MB                      |
| 16 384 (16 vCPU) | 32 768 → 122 880 MB                     |

Pour EC2, les valeurs sont **plus flexibles** mais doivent rentrer dans une instance enregistrée.

#### Architecture

Spécifie `LINUX_ARM64` ou `LINUX_X86_64`. Couplé avec une image Docker compatible. **ARM64 (Graviton)** est ~20 % moins cher sur Fargate.

#### Container Definitions

Une liste de **un ou plusieurs containers** qui partagent la task. Cas multi-container typiques :

- App principale + **fluent-bit** (forward des logs vers Datadog/Elasticsearch).
- App + **Envoy proxy** (sidecar mesh).
- App + **localstack init** (préparer un état au démarrage).

Dans la liste, **chaque container a un nom unique**. Le champ `essential: true` indique qu'**arrêter ce container = arrêter toute la task**.

### 4.4 — Container Definition — détails

Champs les plus utilisés :

| Champ                                | Description                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `name`                               | Nom interne du container.                                                              |
| `image`                              | URL ECR / Docker Hub.                                                                  |
| `essential`                          | Si `true`, la mort du container = mort de la task.                                     |
| `portMappings`                       | Ports exposés vers l'extérieur de la task (ALB / NLB / Service Discovery).             |
| `environment`                        | Variables d'env **en clair** (visibles dans la Task Def).                              |
| `secrets`                            | Variables d'env **injectées au runtime** depuis Secrets Manager ou Parameter Store.    |
| `healthCheck`                        | Commande shell exécutée périodiquement pour vérifier la santé. Échec → task remplacée. |
| `logConfiguration`                   | Driver `awslogs` (CloudWatch), `awsfirelens`, etc.                                     |
| `dependsOn`                          | Dépendances de démarrage entre containers (`fluent-bit` doit être prêt avant `app`).   |
| `stopTimeout`                        | Délai avant SIGKILL après SIGTERM (utile pour graceful shutdown).                      |
| `ulimits`                            | Limites système (file descriptors, processus).                                         |
| `mountPoints`, `volumesFrom`         | Montages de volumes définis dans `volumes` au niveau de la Task Def.                   |
| `linuxParameters.initProcessEnabled` | Activer init PID 1 (forwarding propre des signaux).                                    |
| `readonlyRootFilesystem`             | Sécurité : empêcher l'écriture dans `/` (forcer /tmp).                                 |

### 4.5 — Secrets vs environment

**Mauvais** :

```json
"environment": [
  { "name": "DB_PASSWORD", "value": "supersecret123" }
]
```

→ Le secret est lisible par toute personne avec `ecs:DescribeTaskDefinition`.

**Bon** :

```json
"secrets": [
  {
    "name": "DB_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:prod/db-pass-abc123"
  }
]
```

→ ECS récupère la valeur **au démarrage** du container, l'injecte comme variable d'env, sans la stocker dans la Task Def. Le **Task Execution Role** doit avoir `secretsmanager:GetSecretValue` sur l'ARN.

### 4.6 — Health check

```json
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:8080/healthz || exit 1"],
  "interval": 30,
  "timeout": 5,
  "retries": 3,
  "startPeriod": 60
}
```

- `interval`: secondes entre deux checks.
- `timeout`: temps max par check.
- `retries`: nombre d'échecs avant de marquer unhealthy.
- `startPeriod`: temps de "grace" au démarrage (ne compte pas les checks pendant cette période).

Une task unhealthy est **remplacée** par le Service. Sans health check, ECS se fie au **process status** uniquement (exit code) — insuffisant pour détecter une app qui ne sert plus mais ne crashe pas.

### 4.7 — Logger en CloudWatch — la base

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/ecs/tp-m11-web",
    "awslogs-region": "eu-west-1",
    "awslogs-stream-prefix": "web",
    "awslogs-create-group": "true"
  }
}
```

Toujours :

- **Définir un log group** par service (ou par environnement × service).
- **Activer `awslogs-create-group`** pour que ECS le crée si absent.
- **Configurer la rétention** du log group (cf. M3).

Pour un routing plus avancé (Datadog, Elasticsearch) : driver `awsfirelens` + side-car fluent-bit.

### 4.8 — Versions et déploiement

```bash
# Publier une nouvelle révision
aws ecs register-task-definition --cli-input-json file://taskdef.json
# → renvoie ARN avec :5

# Mettre à jour le service vers la nouvelle revision
aws ecs update-service \
  --cluster tp-m11-cluster \
  --service tp-m11-web-svc \
  --task-definition tp-m11-web:5
```

Le service effectue un **rolling deploy** : il démarre les nouvelles tasks de la révision 5, attend qu'elles soient healthy, puis arrête les anciennes (révision 4). Ratio configurable par `minimumHealthyPercent` / `maximumPercent`.

Pour un **rollback rapide** : `update-service --task-definition tp-m11-web:4`. ECS revient à la révision précédente en quelques minutes.

---

## 5. Rôles IAM dans ECS

### 5.1 — Trois rôles distincts

| Rôle                    | Qui l'assume ?                       | À quoi sert ?                                                                                    |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Task Execution Role** | Le service ECS (runtime).            | Pull l'image ECR, écrire dans CloudWatch Logs, lire des secrets.                                 |
| **Task Role**           | **Le code applicatif** dans la task. | Permissions du code : appeler DynamoDB, S3, etc.                                                 |
| **ECS Service Role**    | Le service ECS (orchestration).      | Pour la gestion des LB, du service discovery (souvent une AWS service-linked role, automatique). |

### 5.2 — Task Execution Role

Policy AWS-managed la plus courante : `AmazonECSTaskExecutionRolePolicy`. Permissions données :

- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage` — pour pull l'image.
- `logs:CreateLogStream`, `logs:PutLogEvents` — pour les logs.

À étendre selon le besoin (Secrets Manager, KMS) :

```bash
aws iam put-role-policy --role-name ecsTaskExecutionRole \
  --policy-name SecretsAccess \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":["secretsmanager:GetSecretValue","kms:Decrypt"],
      "Resource":["arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:prod/*"]
    }]
  }'
```

### 5.3 — Task Role — pour le code applicatif

Le **Task Role** est ce que l'**application elle-même** voit comme identité IAM. Boto3 / AWS SDK utilise ces credentials pour appeler les services.

```bash
aws iam create-role --role-name AppTaskRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

# Donner accès à une table DDB précise
aws iam put-role-policy --role-name AppTaskRole \
  --policy-name DDBAppData \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":["dynamodb:GetItem","dynamodb:PutItem"],
      "Resource":"arn:aws:dynamodb:eu-west-1:ACCOUNT:table/app-data"
    }]
  }'
```

**Séparer** Execution Role et Task Role est une **bonne pratique de sécurité** : si l'application est compromise, ses droits sont limités à ce dont elle a besoin (DDB) — elle ne peut pas modifier la Task Definition ou pull n'importe quelle image.

---

## 6. Premier déploiement Fargate complet

### 6.1 — Étapes

1. Cluster.
2. Rôles IAM (Task Execution, Task Role).
3. CloudWatch Log Group.
4. Task Definition.
5. (Optionnel) Service + ALB.

### 6.2 — Commandes complètes

```bash
# 1. Cluster
aws ecs create-cluster --cluster-name tp-m11-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --settings name=containerInsights,value=enabled

# 2. Rôles (créés une fois, réutilisables)
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'
aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name AppTaskRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'
# (attacher des policies métier minimum)

# 3. Log group
aws logs create-log-group --log-group-name /ecs/tp-m11-web
aws logs put-retention-policy --log-group-name /ecs/tp-m11-web --retention-in-days 30

# 4. Task Definition
aws ecs register-task-definition --cli-input-json file://taskdef.json

# 5. Run standalone (pour test)
aws ecs run-task \
  --cluster tp-m11-cluster \
  --launch-type FARGATE \
  --task-definition tp-m11-web:1 \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-aaa],securityGroups=[sg-xxx],assignPublicIp=ENABLED}'
```

### 6.3 — Inspecter une task qui tourne

```bash
# Lister
aws ecs list-tasks --cluster tp-m11-cluster --desired-status RUNNING

# Détails
aws ecs describe-tasks --cluster tp-m11-cluster --tasks <TASK_ARN> \
  --query 'tasks[0].{Status:lastStatus,Health:healthStatus,Started:startedAt,Containers:containers[].{Name:name,Status:lastStatus,Reason:reason,Health:healthStatus}}'

# Logs
aws logs tail /ecs/tp-m11-web --follow
```

### 6.4 — Stopper et nettoyer

```bash
aws ecs stop-task --cluster tp-m11-cluster --task <TASK_ARN>

# Pour terminer le cluster
aws ecs delete-cluster --cluster tp-m11-cluster
```

L'opération `delete-cluster` échoue si des services / tasks tournent encore — il faut les arrêter d'abord.

---

## 7. Anti-patterns transverses

| Anti-pattern                                                                       | Conséquence                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Une Task Definition `:latest` qu'on rewrite à chaque déploiement.                  | Pas de rollback fiable. Toujours publier `:N+1`.                                                        |
| Secrets en clair dans `environment`.                                               | Lisibles par `describe-task-definition`. Utiliser `secrets`.                                            |
| Pas de **healthCheck** dans la Task Def.                                           | Zombies invisibles, "200 OK" mais l'app ne sert plus.                                                   |
| Une Task Def avec **un seul container essential** + 3 side-cars `essential=true`.  | La mort d'un side-car tue toute la task. Configurer `essential: false` sur les side-cars non critiques. |
| Task Definition avec CPU/RAM **invalides** sur Fargate (combinaison hors matrice). | `RegisterTaskDefinition` échoue. Consulter la matrice 4.3.                                              |
| Pas de **CloudWatch Container Insights** activé.                                   | Pas de métriques agrégées par service. Activer au niveau cluster.                                       |
| **Hardcoded Account ID** dans la Task Def.                                         | Pas portable. Utiliser variables CloudFormation / Terraform.                                            |
| Task Role qui a `*` partout.                                                       | Compromission étendue. Principe du moindre privilège.                                                   |
| Pas de **stopTimeout**.                                                            | SIGKILL après 30 s default — pas de graceful shutdown.                                                  |

---

## 8. Exercices pratiques

### Exercice 1 — Créer un cluster ECS Fargate vide (≈ 20 min)

**Objectif.** Manipuler la création de cluster.

**Étapes :**

1. Créer le cluster `tp-m11-cluster` avec FARGATE et FARGATE_SPOT, Container Insights activé.
2. Lister les capacity providers.
3. Vérifier les coûts associés (rien tant qu'aucune task ne tourne).

**Livrable.** Captures CLI + console.

### Exercice 2 — Écrire et enregistrer une Task Definition (≈ 45 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Construire une mini-app FastAPI exposant `/healthz` et `/hello`.
2. Dockerfile ARM64, push dans ECR (réutiliser repo M10).
3. Écrire `taskdef.json` qui :
   - Famille `tp-m11-fastapi`.
   - Compatibilité FARGATE.
   - 512 MB / 256 CPU.
   - Architecture ARM64.
   - Container `app` avec port 8000, image ECR, health check sur `/healthz`, log driver awslogs.
   - Variables d'env `ENV=prod`.
4. Enregistrer la Task Definition.
5. Vérifier la révision créée.

**Livrable.** `taskdef.json` + ARN de la Task Definition.

### Exercice 3 — Run task standalone et inspecter (≈ 30 min)

**Objectif.** Manipuler `run-task`.

**Étapes :**

1. Lancer la Task Definition de l'exercice 2 en standalone avec `assignPublicIp=ENABLED`.
2. Récupérer l'IP publique de la task (ENI publique).
3. `curl` sur `http://<IP>:8000/hello`.
4. Lire les logs CloudWatch.
5. Stopper la task.

**Livrable.** Captures.

### Exercice 4 — Injecter un secret depuis Secrets Manager (≈ 45 min)

**Objectif.** Manipuler `secrets`.

**Étapes :**

1. Créer un secret `tp-m11-app/api-key` avec valeur `dummy-secret-123`.
2. Donner au Task Execution Role la permission `secretsmanager:GetSecretValue` sur cet ARN.
3. Modifier la Task Definition pour injecter le secret comme variable d'env `API_KEY`.
4. Publier la nouvelle révision.
5. Lancer la task. SSH dans le container via ECS Exec :

   ```bash
   aws ecs execute-command --cluster tp-m11-cluster --task <TASK_ARN> \
     --container app --interactive --command "/bin/sh"
   ```

6. Vérifier que `echo $API_KEY` retourne bien la valeur.

**Livrable.** Capture du `echo` + ARN du secret.

### Exercice 5 — Comparer Fargate vs EC2 launch type sur un même Task Def (≈ 45 min, conceptuel)

**Objectif.** Item N2 explicite.

Pour un workload typique (10 tasks `c6g.large` équivalent, 24/7), calculer :

1. Coût Fargate (vCPU-h + GB-h × 730 × 10).
2. Coût EC2 : combien d'EC2 il faut pour héberger 10 tasks de cette taille, prix EC2 RI 1 an.
3. Surcoût opérationnel estimé (patching, ASG management).
4. Recommandation.

**Livrable.** Tableau + conclusion en 5 lignes.

### Mini-défi — Task multi-container avec sidecar fluent-bit (≈ 60 min, conceptuel + exemple JSON)

**Cas.** App + sidecar fluent-bit pour forward des logs vers un endpoint OpenSearch.

Écrire la Task Definition complète :

- Container `app` (essential, image ECR, healthcheck).
- Container `fluent-bit` (essential=false, image AWS for fluent-bit).
- LogConfiguration `awsfirelens` sur `app`.
- `dependsOn` pour démarrer fluent-bit avant app.

**Livrable.** `taskdef.json` annoté.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **ECS**, son positionnement vs EKS / AppRunner.
- [ ] Citer les **5 objets fondamentaux** (Cluster, Task Definition, Task, Service, Container Instance).
- [ ] Distinguer **Fargate** et **EC2 launch type** sur **6+ critères**.
- [ ] Citer **3 cas où Fargate gagne** et **3 où EC2 launch type gagne**.
- [ ] Définir une **Task Definition** (item N2) — immuable, versionnée, JSON.
- [ ] Lister les **sections clés** d'une Task Def (family, requiresCompatibilities, networkMode, cpu/memory, containerDefinitions, roles).
- [ ] Décrire la **matrice CPU/RAM** Fargate (valeurs valides).
- [ ] Distinguer **Task Execution Role** et **Task Role**.
- [ ] Distinguer `environment` et `secrets` en Task Definition.
- [ ] Écrire un **health check** Task Definition.
- [ ] Décrire la **rolling update** d'un service vers une nouvelle révision.
- [ ] Distinguer `awsvpc`, `bridge`, `host` network modes.
- [ ] Citer **5 anti-patterns** Task Definition / launch type.

### Items du glossaire visés

**N2 atteint** :

- _différences entre un service Fargate et un service EC2 dans un ECS_ — section 3.
- _ce qu'est une Task Definition dans un ECS_ — section 4.

**N3 amorcés** (introduits, non couverts en profondeur) :

- _ressources ECS : namespace, cluster, service, task, deployment_ — section 2.
- _cycle de vie d'une Task Definition_ — section 4.8.

---

## 10. Ressources complémentaires

### Documentation AWS

- [Amazon ECS Developer Guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
- [Task definitions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html)
- [Task definition parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html)
- [Fargate vs EC2 launch types](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/launch_types.html)
- [Fargate task sizes (matrice CPU/RAM)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size)
- [Container Insights for ECS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights.html)
- [Specifying sensitive data](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html) — injection de secrets.
- [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html) — shell dans un container.

### Outils

- [AWS Copilot CLI](https://aws.github.io/copilot-cli/) — wrapper qui orchestre ECS Service / Task Def / ALB / CI/CD.
- [ECS Compose-X](https://docs.compose-x.io/) — déployer un `docker-compose.yml` sur ECS.
- [AWS CDK Patterns ECS](https://constructs.dev/packages/aws-cdk-lib/) — constructs CDK pour ECS.

### Pour aller plus loin

- **M12 (ECS opération)** — créer le Service, manipuler le rolling deploy, intégrer un ALB.
- **AWS Networking M2-M4** — VPC, subnets, SG, indispensables au `awsvpc` mode.
- **AWS Networking M8** — ALB devant les tasks ECS.
- **AWS Identity M5** — IAM Roles for ECS Tasks (le bon pattern de Task Role).
