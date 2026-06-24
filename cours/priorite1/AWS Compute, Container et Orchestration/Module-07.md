# M7 — AppRunner et dimension serverless

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **la dimension serverless** : ce que recouvre vraiment le terme, les **quatre propriétés cardinales** (pas de serveur à gérer, auto-scaling, paiement à l'usage, infrastructure managée), et pourquoi tous les services dits "serverless" ne le sont pas au même degré.
- Citer les **principaux services serverless AWS** au-delà de Lambda : AppRunner, Fargate, DynamoDB on-demand, Aurora Serverless v2, S3, EventBridge, SQS, SNS, Athena.
- Définir **AWS App Runner** (item N2 explicite) : service entièrement managé pour exécuter une **application web conteneurisée** ou un **code source** sans gérer ECS, EKS, Load Balancer, certificat, ou auto-scaler.
- Identifier les **cas d'usage** d'AppRunner (item N2 explicite) — petit/moyen service HTTP stateless, MVP, équipe sans expertise infra — et les **cas où AppRunner perd** vs Lambda, ECS Fargate, EKS.
- **Déployer une app** sur AppRunner depuis une image ECR ou depuis un repo source (GitHub).
- Comprendre les **implications du serverless** (item N2 explicite) : scaling, facturation, cold start, statelessness, connection pooling, observabilité, vendor lock-in, et savoir les anticiper en design.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M4-M6 (Lambda : modèle d'invocation, packaging, limites).
- M1-M3 (EC2 : ce qu'on gère et qu'AppRunner / Lambda dispensent de gérer).
- AWS CLI v2 configurée.
- Docker installé localement pour la variante container.
- Permissions IAM : `apprunner:*`, `ecr:*`, `iam:PassRole`, `s3:*`.
- (Optionnel) Un repo GitHub accessible pour la variante "source" (compte AWS connecté à GitHub via CodeConnections).

---

## 1. Pourquoi un module dédié à AppRunner et au serverless

### 1.1 — Ce que ce module ajoute aux précédents

Lambda (M4-M6) montre **un** service serverless. Mais le serverless **n'est pas un produit**, c'est un **modèle d'opération**. AWS propose **une douzaine** de services qui suivent ce modèle, et **AppRunner** est l'un des plus récents (lancé en 2021) — pensé spécifiquement pour le cas "j'ai une app web, je veux qu'elle tourne, point".

Ce module a deux objectifs distincts :

1. **Stabiliser la notion de serverless** : ce que ça recouvre, ses propriétés, ses implications cachées.
2. **Maîtriser AppRunner** : quand l'utiliser, quand non, et concrètement comment l'opérer.

### 1.2 — L'analogie du restaurant

Reprenons l'analogie de la flotte de voitures (M1), enrichie :

- **EC2** = on **possède** sa voiture. On gère l'entretien, l'essence, le parking.
- **ECS Fargate** = on **loue** une voiture avec chauffeur, le chauffeur conduit (gère l'OS), on dit où aller (le container).
- **Lambda** = on **lève le pouce** quand on a besoin de bouger. On ne paye qu'à la course (chaque invocation).
- **AppRunner** = on a un **VTC dédié à temps plein** mais qui se gare et arrête le compteur quand on n'a pas besoin de lui. Il connaît déjà la destination (son code source ou son image). On ne s'occupe de rien.

AppRunner se positionne **entre** Lambda et Fargate : moins flexible que Fargate, plus simple. Plus puissant que Lambda pour des workloads HTTP long-running, mais moins événementiel.

### 1.3 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                           | Conséquence                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "Serverless = pas cher par défaut."                                    | Faux à fort volume. Lambda à 100M invocations/jour est souvent **plus cher** qu'un ECS Fargate équivalent. |
| Croire qu'AppRunner remplace ECS Fargate dans 100 % des cas.           | AppRunner est limité (1 service = 1 image, pas de side-cars complexes, observabilité plus simple).         |
| Utiliser AppRunner pour des **websockets persistants** en haute scale. | AppRunner gère mal ces patterns ; préférer ECS / EKS.                                                      |
| Ignorer le **cold start** d'AppRunner (oui, il existe).                | Le scaling de 0 → 1 instance prend des secondes.                                                           |
| "Plus de serveur, plus de monitoring nécessaire."                      | Faux. Le monitoring devient **plus** important — c'est la seule fenêtre sur ce qui se passe.               |

---

## 2. La dimension serverless — définition rigoureuse

### 2.1 — Les quatre propriétés cardinales

Un service est dit **serverless** s'il remplit (idéalement) **quatre conditions** :

| Propriété                     | Description                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1. Pas de serveur à gérer** | Aucune VM, aucun container à provisionner, patcher, sécuriser, redémarrer.                                     |
| **2. Auto-scaling intégré**   | Le service alloue / libère des ressources automatiquement selon la charge (de 0 à beaucoup).                   |
| **3. Facturation à l'usage**  | On paye **proportionnellement** à ce qu'on consomme : invocations, requêtes, données stockées, ms de calcul.   |
| **4. Infrastructure managée** | Le service garantit la disponibilité, la résilience, les patches, les mises à jour de runtime/version mineure. |

Sont aussi souvent attendues, mais pas toujours présentes :

- **Scaling à zéro** : la facture tombe à zéro quand il n'y a aucune activité. (Lambda ✅, AppRunner ✅ avec scale-to-zero depuis 2023, ECS Fargate ⚠️ pas vraiment, Aurora Serverless v2 ⚠️ scaling minimum).
- **Burst instantané** : monter de 0 à des milliers d'instances en quelques secondes (Lambda ✅, AppRunner avec quelques minutes de tolérance, ECS Fargate avec quelques minutes).

### 2.2 — Le spectre du serverless

Tous les services "serverless" ne le sont pas au même degré. Spectre du plus serverless au moins :

```txt
Plus serverless ←──────────────────────────────────────→ Moins serverless

Lambda        AppRunner    Fargate     Aurora SLS v2     RDS provisioned
DynamoDB OD   S3          EventBridge  Athena            EC2
```

Trois examples concrets :

- **Lambda + DynamoDB on-demand + S3 + EventBridge** : "100 % serverless". Aucune VM nulle part, scaling automatique partout, facture à zéro à 3h du matin.
- **AppRunner + Aurora Serverless v2** : "serverless majoritairement". Aurora SLS v2 ne descend pas à 0 par défaut (depuis fin 2024, capacité minimale 0 disponible mais avec un cold start de 10-20 s).
- **EC2 + Fargate Spot mix + RDS provisioned** : "containerisé mais pas serverless". On gère encore la capacité minimale.

### 2.3 — Ce que le serverless résout

Trois douleurs réelles du non-serverless :

| Douleur                                   | Comment le serverless la résout               |
| ----------------------------------------- | --------------------------------------------- |
| Sous-utilisation de la capacité réservée. | On paye à l'usage : zéro requête = zéro coût. |
| Patches OS, surveillance des VMs.         | AWS gère.                                     |
| Configuration manuelle de l'auto-scaling. | Inclus par défaut.                            |

### 2.4 — Ce que le serverless apporte de nouveau

Trois complications spécifiques :

| Nouveau problème                | Manifestation                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Cold start**                  | Premier appel après inactivité = latence supplémentaire.                                                                      |
| **Statelessness obligatoire**   | Pas de RAM ou disque persistant entre exécutions (sauf services qui le permettent comme AppRunner avec instance persistante). |
| **Quotas et limites partagées** | Souvent invisibles jusqu'au jour où on les atteint.                                                                           |
| **Observabilité décentralisée** | Logs et métriques dispersés ; pas de "se logger en SSH pour voir".                                                            |
| **Connection pooling**          | 1 000 Lambdas concurrentes → 1 000 connexions DB ouvertes → BDD saturée.                                                      |

### 2.5 — Les principaux services serverless AWS

| Service                            | Catégorie      | Note                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------- |
| **Lambda**                         | Compute (FaaS) | Functions courtes, événementiel.                        |
| **AppRunner**                      | Compute (PaaS) | Apps HTTP simples, conteneur ou source.                 |
| **Fargate**                        | Compute (CaaS) | Container pour ECS et EKS. Pas de scale-to-zero "vrai". |
| **DynamoDB on-demand**             | Database       | NoSQL clé-valeur, scaling automatique.                  |
| **Aurora Serverless v2**           | Database       | PostgreSQL/MySQL avec auto-scaling.                     |
| **S3**                             | Storage        | Le plus serverless qui soit.                            |
| **API Gateway**                    | API            | Front HTTP scalable.                                    |
| **EventBridge**                    | Event bus      | Routage d'événements.                                   |
| **SQS / SNS**                      | Messaging      | Queues et topics 100 % managés.                         |
| **Kinesis Data Streams on-demand** | Streaming      | Auto-scaling de shards.                                 |
| **Step Functions**                 | Orchestration  | Voir M9.                                                |
| **Athena**                         | Analytics SQL  | SQL sans cluster.                                       |
| **EMR Serverless**                 | Big Data       | Spark/Hive sans cluster.                                |
| **OpenSearch Serverless**          | Search         | OpenSearch sans nodes à gérer.                          |
| **MSK Serverless**                 | Kafka          | Topics Kafka sans cluster.                              |

Ce parcours couvre les services compute (Lambda, AppRunner, Fargate via ECS). Les autres relèvent des parcours **Database/Storage**, **Analytics**, et **Networking**.

---

## 3. AWS App Runner — définition (item N2 explicite)

### 3.1 — Ce qu'est AppRunner

> **AWS App Runner** est un service **entièrement managé** pour faire tourner une **application web** depuis une **image conteneur** (ECR) ou un **dépôt de code source** (GitHub via CodeConnections, ECR Public). AppRunner gère **tout** ce qui est habituellement manuel : load balancer, certificat TLS, auto-scaling, health checks, DNS, déploiements progressifs.

Le service est conçu pour un **persona précis** : développeur qui veut **mettre une app web en ligne en 10 minutes** sans avoir à apprendre ECS, ALB, ACM, Auto Scaling Group, etc.

### 3.2 — Anatomie d'un service AppRunner

| Composant                      | Rôle                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **Source**                     | Soit une image ECR/ECR Public, soit un repo source (Python, Node, Java, .NET, Go, Ruby, PHP). |
| **Build configuration**        | Si source code : commandes de build (ex : `npm ci && npm run build`).                         |
| **Run configuration**          | Commande de démarrage, port, variables d'environnement, secrets injectés.                     |
| **Instance configuration**     | vCPU (0.25 → 4) et RAM (0.5 → 12 GB).                                                         |
| **Auto-scaling configuration** | Min / max instances, concurrence par instance.                                                |
| **Networking**                 | Public / VPC, IP type, custom domain.                                                         |
| **Observability**              | Logs CloudWatch, traces X-Ray.                                                                |

### 3.3 — Deux modes de source

**Source-based (sans Docker)** :

- Connecter un repo GitHub via **AWS CodeConnections**.
- AppRunner détecte le runtime (Python, Node, Go…) et build l'image pour nous.
- À chaque push sur la branche surveillée, redéploiement automatique.
- Limites : versions de runtimes supportées limitées, build moins flexible qu'un Dockerfile.

**Image-based (avec Docker)** :

- Pousser une image dans ECR (ou ECR Public).
- AppRunner pull l'image et la lance.
- Plus flexible : runtime custom, multi-stage build optimisé, deps lourdes.
- Demande de gérer l'image (build, push, vulnerability scan via ECR — voir M10).

Le mode **image-based** est recommandé dès qu'on dépasse le hello-world : on contrôle exactement ce qui tourne, et on aligne avec ECS/Fargate s'il faut migrer plus tard.

### 3.4 — Cycle de vie d'une instance AppRunner

```graphviz
   Pull image          Start instance         Healthchecks OK         Reçoit traffic
       │                     │                       │                      │
       ▼                     ▼                       ▼                      ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ AppRunner gère :                                                        │
   │ • LB interne devant N instances                                         │
   │ • TLS / certificat ACM automatique                                      │
   │ • Auto-scaling : N entre min et max instances                           │
   │ • Health checks périodiques                                             │
   │ • Redéploiement progressif                                              │
   └─────────────────────────────────────────────────────────────────────────┘
```

Quand le service est inactif et que **scale-to-zero** est configuré (option "Active" + "auto" en 2023+), les instances sont arrêtées après quelques minutes d'inactivité. Le premier appel suivant subit un **cold start de quelques secondes** (typiquement 3-10 s).

### 3.5 — Tarification

AppRunner facture **deux choses** :

- **vCPU-heure et GB-heure actifs** : prix de référence ~0,064 $/vCPU-h + ~0,007 $/GB-h.
- **vCPU-heure et GB-heure provisionnés** (état "inactive" / scale-to-zero) : ~25 % du prix actif.

Pour une instance 1 vCPU + 2 GB tournant 24/7 : ~46 $/mois actif + ~12 $ provisioning passif = ~58 $/mois.

Vs Lambda à charge équivalente, AppRunner devient **plus cher** au-delà d'un certain seuil — typiquement quand on dépasse l'équivalent de plusieurs millions d'invocations Lambda longues.

---

## 4. Cas d'usage d'AppRunner (item N2 explicite)

### 4.1 — Quand AppRunner est le bon choix

**Profil "Cas d'usage AppRunner"** :

- App **HTTP stateless** : API REST, app web légère, microservice.
- **Traffic moyen** (100 req/s à quelques milliers) — pas un workload de millions de req/s.
- **Une seule image** par service (pas de side-cars complexes type Envoy / Datadog / Fluent Bit).
- **Pas de besoin de cluster** custom : on ne veut pas gérer ECS, EKS.
- **Pas d'expertise infra forte** dans l'équipe : devs full-stack, équipe startup.

Cas particulièrement adaptés :

| Cas                                                                 | Pourquoi AppRunner gagne                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **MVP / POC** d'une API.                                            | Mise en ligne en < 1 h, scaling automatique gratuit jusqu'au succès. |
| **Backend de mobile app** Node/Python/Go simple.                    | HTTP/JSON, on a juste besoin que ça réponde.                         |
| **Internal tools** (dashboards admins, mini-apps RH).               | Trafic faible, mais besoin de TLS + auth + dispo.                    |
| **Sites web SaaS B2B basse / moyenne échelle**.                     | Traffic prévisible, mise à jour fréquente, équipe agile.             |
| **APIs serverless** qui doivent rester chaudes (Lambda PC coûteux). | AppRunner peut tourner 24/7 à bas coût.                              |

### 4.2 — Quand AppRunner n'est pas le bon choix

Six cas où on choisira autre chose :

| Cas                                                                                                                      | Choix recommandé                       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Tâche événementielle courte** (≤ 15 min, déclenchée par S3/SQS).                                                       | **Lambda**.                            |
| **Job batch lourd** (1h+, GPU, parallel).                                                                                | **AWS Batch** (M8) ou **ECS sur EC2**. |
| **Cluster microservices complexe** (10+ services, side-cars Envoy / Linkerd / OpenTelemetry collectors / Datadog Agent). | **ECS Fargate** ou **EKS**.            |
| **Application stateful** (WebSocket persistant, session locale, jeu en ligne).                                           | **ECS sur EC2** + sticky sessions.     |
| **Charge énorme** > 50 000 req/s soutenu.                                                                                | **ECS Fargate** + ALB + Auto Scaling.  |
| **Régulation très précise du runtime** (kernel module, drivers).                                                         | **EC2**.                               |

### 4.3 — Tableau de positionnement

Reprenons les services compute déjà vus :

| Critère                             | EC2        | Lambda           | AppRunner       | Fargate (ECS) |
| ----------------------------------- | ---------- | ---------------- | --------------- | ------------- |
| **Effort opérationnel**             | Élevé      | Très faible      | **Très faible** | Moyen         |
| **Cold start**                      | Aucun      | 100 ms - 3 s     | **3-10 s**      | 10-30 s       |
| **Scale-to-zero**                   | Non        | Oui (instantané) | Oui (lent)      | Non (vrai 0)  |
| **Sidecars / containers multiples** | Oui        | Non              | Non             | **Oui**       |
| **WebSocket persistant**            | Oui        | Limité           | Limité          | **Oui**       |
| **Custom runtime / OS**             | **Oui**    | Custom Runtime   | Non             | Oui (image)   |
| **Sweet spot trafic**               | 24/7 lourd | Évènementiel     | **Moyen HTTP**  | Microservices |
| **Coût à charge zéro**              | Continu    | 0                | Très bas        | Continu       |

### 4.4 — Décision rapide — arbre

```treeviz
 Mon workload est-il déclenché par des événements courts (< 15 min) ?
 ├─ Oui → Lambda
 └─ Non
     │
     Est-ce une app HTTP stateless, image unique, < quelques milliers req/s ?
     ├─ Oui → AppRunner
     └─ Non
         │
         A-t-on besoin de plusieurs containers, side-cars, ou plus de contrôle ?
         ├─ Oui → ECS Fargate ou EKS
         └─ Non, le contrôle bas niveau (OS, kernel) est nécessaire → EC2
```

---

## 5. Déployer une app sur AppRunner

### 5.1 — Variante 1 — depuis une image ECR

**Pré-requis** : une image Docker dans ECR (cf. M10 pour la création du repository).

```bash
# 1. Construire et pousser l'image
docker build -t my-app:latest .
docker tag my-app:latest ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/my-app:latest
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com
docker push ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/my-app:latest

# 2. Créer le service AppRunner
aws apprunner create-service \
  --service-name tp-m7-my-app \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/my-app:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {
          "ENV": "prod"
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::ACCOUNT:role/apprunner-ecr-access"
    }
  }' \
  --instance-configuration '{
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
  }' \
  --health-check-configuration '{
    "Protocol": "HTTP",
    "Path": "/healthz",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 3
  }'
```

Le rôle `apprunner-ecr-access` doit avoir une trust policy autorisant `build.apprunner.amazonaws.com` et une policy `AWSAppRunnerServicePolicyForECRAccess` (managed) pour lire l'image.

Quelques minutes plus tard, AppRunner fournit une **URL publique** `https://<random>.<region>.awsapprunner.com`.

### 5.2 — Variante 2 — depuis un repo source GitHub

```bash
# 1. Créer une CodeConnection vers GitHub (manuel via console la première fois)
#    => arn:aws:codeconnections:...:connection/abc-123

# 2. Créer le service
aws apprunner create-service \
  --service-name tp-m7-from-source \
  --source-configuration '{
    "CodeRepository": {
      "RepositoryUrl": "https://github.com/me/my-app",
      "SourceCodeVersion": {"Type": "BRANCH", "Value": "main"},
      "CodeConfiguration": {
        "ConfigurationSource": "API",
        "CodeConfigurationValues": {
          "Runtime": "PYTHON_3",
          "BuildCommand": "pip install -r requirements.txt",
          "StartCommand": "uvicorn main:app --host 0.0.0.0 --port 8000",
          "Port": "8000",
          "RuntimeEnvironmentVariables": {"ENV": "prod"}
        }
      },
      "AutoDeploymentsEnabled": true
    },
    "AuthenticationConfiguration": {
      "ConnectionArn": "arn:aws:codeconnections:...:connection/abc-123"
    }
  }' \
  --instance-configuration '{"Cpu":"0.5 vCPU","Memory":"1 GB"}'
```

À chaque `git push` sur `main`, AppRunner détecte la nouvelle commit, déclenche un build, déploie en blue/green sans downtime.

### 5.3 — Mettre à jour, déployer une nouvelle version

**Si AutoDeploymentsEnabled = true** : push (source) ou push image (ECR) → AppRunner détecte et redéploie.

**Manuellement** :

```bash
aws apprunner start-deployment --service-arn <ARN>
```

### 5.4 — Pause / Resume

AppRunner offre une **pause de service** : on arrête de payer le compute, mais on conserve la config et l'URL. Reprise quasi-instantanée.

```bash
aws apprunner pause-service --service-arn <ARN>
aws apprunner resume-service --service-arn <ARN>
```

Pratique pour des environnements de pré-prod inutilisés la nuit / le week-end.

### 5.5 — Custom domain

```bash
aws apprunner associate-custom-domain \
  --service-arn <ARN> --domain-name api.mondomaine.fr
```

AppRunner provisionne automatiquement un certificat ACM et donne les enregistrements DNS à créer chez le registrar (CNAME).

---

## 6. Auto-scaling, networking, observability

### 6.1 — Auto-scaling configuration

Par défaut, AppRunner crée une **AutoScalingConfiguration** "DefaultConfiguration" :

| Paramètre          | Default | Description                                                                         |
| ------------------ | ------- | ----------------------------------------------------------------------------------- |
| **MaxConcurrency** | 100     | Nombre max de **requêtes simultanées par instance** avant d'en lancer une nouvelle. |
| **MinSize**        | 1       | Nombre min d'instances "provisioned" (scale-to-zero si =0 + activity off).          |
| **MaxSize**        | 25      | Nombre max d'instances.                                                             |

```bash
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name tp-m7-asc \
  --min-size 1 --max-size 10 --max-concurrency 50

# Puis attacher à un service :
aws apprunner update-service \
  --service-arn <ARN> \
  --auto-scaling-configuration-arn <ASC_ARN>
```

Le **scale-to-zero** est activé en passant `MinSize=1` et en désactivant "Active" — AppRunner suspend les instances après inactivité. Voir la console pour le toggle "Activity-based scaling".

### 6.2 — Networking — public vs VPC connector

**Mode public (par défaut)** : le service AppRunner a une URL publique HTTPS et sort sur Internet directement.

**Mode VPC connector** : AppRunner connecte le service à un VPC privé via un **VPC Connector** (équivalent ENI). Cas d'usage : besoin d'accéder à une RDS dans un subnet privé, à un service interne via ALB, ou à un VPN.

```bash
aws apprunner create-vpc-connector \
  --vpc-connector-name my-vpc-conn \
  --subnets subnet-aaa subnet-bbb \
  --security-groups sg-xxx
```

Puis attacher au service via `--network-configuration`.

### 6.3 — Observability

**Logs** :

- **System logs** : `/aws/apprunner/<service>/...service` — démarrage, scaling.
- **Application logs** : `/aws/apprunner/<service>/...application` — sortie stdout/stderr de l'app.

Toujours définir une **rétention** (cf. M3).

**Métriques** (`AWS/AppRunner`) :

- `RequestLatency` — latence moyenne / p99.
- `Requests` — nombre de requêtes.
- `2xxStatusResponses`, `4xxStatusResponses`, `5xxStatusResponses`.
- `CPUUtilization`, `MemoryUtilization`.
- `ActiveInstances` — instances en train de servir.
- `ConcurrentRequests`.

**Traces X-Ray** : activable, donne une vue distribuée des appels.

---

## 7. Implications du serverless (item N2 explicite)

### 7.1 — Scaling — promesse et limites

**Promesse** : AWS scale à votre place.

**Limites cachées** :

- **Vitesse de scale-up** : Lambda peut faire 500-3000 instances par minute (cf. M6). AppRunner met **plusieurs minutes** pour ajouter 5-10 instances. ECS Fargate aussi.
- **Quotas** : concurrence Lambda 1000/région par défaut, AppRunner max 25 instances par service.
- **Capacité régionale** : AWS peut ne pas avoir la capacité (rare mais déjà arrivé sur des picks régionaux).

**Conséquence design** : si un pic est **prévisible** (Black Friday, lancement marketing), **pré-warm** : Lambda Provisioned Concurrency, AppRunner MinSize élevé, ECS Fargate Auto Scaling cible plus généreuse.

### 7.2 — Facturation — pay-per-use et ses surprises

**Promesse** : on paye à l'usage.

**Surprises** :

- **À fort volume**, le serverless dépasse le provisionné. À 100M req/jour de Lambda 500 ms × 512 MB, on est à ~10 000 $/mois ; un cluster ECS Fargate équivalent à ~5 000 $.
- **Coûts indirects** : un Lambda VPC-attached consomme une NAT Gateway (33 $/mois × N AZ). Un Aurora Serverless v2 a des minimums d'ACU.
- **Coûts de transfert** : sortie Internet 0,09 $/GB. À 500 GB de réponses HTTP/jour : ~1 300 $/mois.

**Conséquence design** : **mesurer tôt** avec un volume représentatif. Cost Explorer + Tags.

### 7.3 — Cold start — pas une exclusivité Lambda

| Service                            | Cold start typique        |
| ---------------------------------- | ------------------------- |
| Lambda Python (no PC)              | 200-600 ms                |
| Lambda image Docker                | 1-3 s                     |
| Lambda Java sans SnapStart         | 2-5 s                     |
| AppRunner premier start            | 3-10 s                    |
| AppRunner scale-out (instance N+1) | 5-20 s                    |
| ECS Fargate task                   | 10-30 s                   |
| Aurora Serverless v2 scale from 0  | 10-20 s (depuis fin 2024) |

**Conséquence design** : ne **jamais** mettre une instance unique d'un service serverless en frontline d'une expérience utilisateur critique sans **PC / MinSize > 0 / capacité minimale**.

### 7.4 — Statelessness obligatoire

Sur tous les compute serverless, **on n'écrit pas sur disque "applicatif" entre invocations** (sauf `/tmp` Lambda éphémère). Toute persistance va dans un service tiers : DynamoDB, S3, Redis (ElastiCache), Aurora.

**Conséquence design** :

- Sessions utilisateur → JWT stateless, ou Redis.
- Cache local → cache RAM intra-invocation seulement (warm starts), pour le reste : Redis.
- Fichiers utilisateurs uploadés → S3.

### 7.5 — Connection pooling — le piège DB

Un cluster ECS Fargate avec 4 tasks ouvre typiquement 40 connexions à RDS (10 par task). Une Lambda peut être invoquée **1000 fois en parallèle** → 1000 connexions ouvertes simultanément. Le cluster RDS s'écroule.

**Solutions** :

- **RDS Proxy** : middleware qui mutualise les connexions au pool back-end. Indispensable pour Lambda + RDS.
- **DynamoDB** : pas de connexion persistante, HTTP-based. Pas de problème.
- **Aurora Data API** : HTTP au lieu de TCP, mais limite de débit.

### 7.6 — Observabilité — la centralisation est obligatoire

**Sans serveur** : pas de `ssh` pour aller voir, pas de `htop`, pas de `tail -f`. Tout doit être **explicitement** poussé vers un système central.

**Conséquence design** :

- Tout log vers CloudWatch Logs **structuré** (JSON, pas free-text).
- Métriques business custom (`request_count`, `payment_success`) via PutMetricData ou EMF (Embedded Metric Format).
- Traces distribuées via X-Ray ou OpenTelemetry.
- Alarmes sur **toutes** les métriques critiques (latence p99, erreurs, throttles).

### 7.7 — Vendor lock-in

Lambda + AppRunner + Step Functions + EventBridge + DynamoDB → application **fortement liée à AWS**. Pas trivial de migrer vers GCP / Azure.

**Conséquence design** : choix conscient. En interne, abstraire les services AWS derrière des interfaces (DDD, hexagonal) limite la fuite. Mais une migration cloud-to-cloud reste **un projet**, pas une bascule.

### 7.8 — Tableau récapitulatif des implications

| Implication                | Conséquence design                                             |
| -------------------------- | -------------------------------------------------------------- |
| Scaling rapide mais limité | Provisioned Concurrency / MinSize pour les services critiques. |
| Pay-per-use peut exploser  | Mesurer, budgéter, alertes Cost.                               |
| Cold start non nul         | Warm-up, PC, capacité minimale.                                |
| Stateless                  | Persistance externalisée (DDB, S3, Redis).                     |
| Connection pooling         | RDS Proxy ou DynamoDB.                                         |
| Observabilité dispersée    | CloudWatch Logs + Metrics + X-Ray, dashboards structurés.      |
| Vendor lock-in             | Architecture abstraite et choix conscient.                     |

---

## 8. Anti-patterns transverses

| Anti-pattern                                                        | Conséquence                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| AppRunner pour un **websocket persistant high-traffic**.            | Mauvais fit. ECS sur EC2 avec sticky sessions.                                              |
| AppRunner sans **health check** propre (`/healthz` qui répond 200). | Instances jugées unhealthy par AppRunner → boucle de redéploiement.                         |
| Mix AppRunner + Aurora provisioned 24/7 + EFS.                      | Une partie serverless, l'autre coûteuse en idle → bénéfice serverless perdu.                |
| Lambda + RDS classique sans RDS Proxy.                              | DB saturée à la première rafale.                                                            |
| "Serverless = pas besoin d'IaC".                                    | Au contraire — l'infra change vite, IaC (Terraform / CDK / SAM) plus que jamais nécessaire. |
| AppRunner avec MaxConcurrency par instance trop bas (1).            | Scaling trop agressif, surcoût.                                                             |
| AppRunner avec MaxSize trop bas pour le trafic réel.                | Throttling / 503 lors des picks.                                                            |

---

## 9. Exercices pratiques

### Exercice 1 — Lister les services serverless utilisés dans un compte (≈ 20 min)

**Objectif.** Maîtriser la cartographie.

**Étapes :**

1. Pour un compte (sandbox ou existant), lister via Resource Explorer ou Cost Explorer les services utilisés.
2. Classer chaque service comme : "fully serverless", "managed mais pas serverless", "self-managed".
3. Pour chaque "self-managed", identifier l'**alternative serverless** AWS et estimer un changement.

**Livrable.** Tableau 3 colonnes + 1 alternative par self-managed.

### Exercice 2 — Déployer une mini-app FastAPI sur AppRunner (image) (≈ 60 min)

**Objectif.** Item N2 explicite — premier AppRunner.

**Étapes :**

1. Construire une mini-API FastAPI ("GET /hello", "GET /healthz", "GET /env" exposant `os.environ['ENV']`).
2. Conteneuriser (Dockerfile multi-stage Python 3.12).
3. Pousser dans ECR (suivre M10 — créer le repository, push).
4. Créer un service AppRunner image-based, 0.5 vCPU / 1 GB.
5. Configurer une variable d'env `ENV=staging`.
6. Récupérer l'URL et tester les 3 endpoints.
7. Faire un changement, repush, observer le redéploiement automatique.

**Livrable.** Dockerfile, commandes, captures `curl`.

### Exercice 3 — AppRunner depuis le source (≈ 45 min)

**Objectif.** Mode source-based.

**Étapes :**

1. Forker un mini-projet Node.js Express simple sur GitHub.
2. Établir une CodeConnection (console).
3. Créer un AppRunner source-based pointant sur `main`.
4. Push un changement → vérifier le redéploiement.
5. Mesurer le temps de build.

**Livrable.** Captures + temps observé.

### Exercice 4 — Cold start AppRunner avec scale-to-zero (≈ 45 min)

**Objectif.** Mesurer le cold start AppRunner.

**Étapes :**

1. Sur le service de l'exercice 2, activer scale-to-zero (MinSize=0 + activity off via console).
2. Laisser inactif 15-20 min.
3. Lancer `curl` et mesurer le temps de la 1ʳᵉ réponse.
4. Refaire 5 fois (instance déjà chaude).
5. Comparer.

**Livrable.** Tableau : cold vs warm.

### Exercice 5 — Comparer AppRunner et Lambda pour un même endpoint (≈ 60 min, conceptuel et chiffrage)

**Objectif.** Choisir entre 2 modèles serverless.

**Cas.** API qui répond à 100 req/s en moyenne, avec des picks à 500 req/s. Réponse en 150 ms.

Comparer :

1. Lambda (256 MB, 150 ms) sans PC vs avec PC=5.
2. AppRunner (0.5 vCPU, 1 GB, MinSize=1, MaxSize=10, MaxConcurrency=100).
3. Coût mensuel, latence p99 attendue (cold start), simplicité opérationnelle.

**Livrable.** Tableau + recommandation argumentée.

### Mini-défi — Refactor d'une appli EC2 vers AppRunner (≈ 60 min, conceptuel)

**Cas.** Application Flask hébergée sur 2 EC2 derrière un ALB, RDS PostgreSQL, S3 pour fichiers.

Proposer :

1. Plan de migration vers AppRunner (conteneuriser, RDS Proxy si Lambda — ici pas nécessaire).
2. Ce qui reste inchangé (RDS, S3).
3. Ce qui doit être adapté (sessions, logging, déploiement).
4. Estimation des économies.

**Livrable.** Document 1 page + tableau avant/après.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir le **serverless** avec ses 4 propriétés.
- [ ] Citer **5 services serverless** AWS au-delà de Lambda.
- [ ] Définir **AppRunner** : ce qu'il fait, ce qu'il gère pour vous.
- [ ] Distinguer les **2 modes de source** (image ECR vs code repo).
- [ ] Citer **3 cas d'usage** d'AppRunner.
- [ ] Citer **3 cas où AppRunner n'est pas le bon choix**.
- [ ] Comparer **AppRunner vs Lambda vs Fargate** sur 5 axes.
- [ ] Décrire le **cycle de vie** d'un service AppRunner (pull, start, healthcheck, scale).
- [ ] Configurer **auto-scaling** (MinSize, MaxSize, MaxConcurrency).
- [ ] Citer les **implications du serverless** (scaling limits, pay-per-use, cold start, statelessness, pooling, observability, lock-in).
- [ ] Expliquer pourquoi le **connection pooling** est un problème pour Lambda + RDS.
- [ ] Citer **3 anti-patterns** typiques.

### Items du glossaire visés

**N2 atteint** :

- _cas d'usage AppRunner_ — section 4.
- _dimension serverless de certains services AWS (implications, conséquences)_ — sections 2 et 7.

---

## 11. Ressources complémentaires

### Documentation AWS

- [AWS App Runner Developer Guide](https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html)
- [AWS App Runner pricing](https://aws.amazon.com/apprunner/pricing/)
- [Serverless on AWS](https://aws.amazon.com/serverless/)
- [Serverless Well-Architected Lens](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html)
- [AWS Compute Services overview](https://docs.aws.amazon.com/decision-guides/latest/compute-on-aws-how-to-choose/choosing-aws-compute-service.html)

### Outils

- [AWS Copilot CLI](https://aws.github.io/copilot-cli/) — déployer App Runner / ECS avec abstraction.
- [Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) — voir la facture serverless.
- [Compute Optimizer](https://aws.amazon.com/compute-optimizer/) — rightsizing.

### Pour aller plus loin

- **M8 (Batch vs Lambda)** — autre brique du paysage compute serverless.
- **M11-M12 (ECS Fargate)** — le service "frère" plus puissant qu'AppRunner.
- **AWS Database et Storage M2-M3** — Aurora Serverless v2 (dim serverless côté DB).
- **AWS Networking M7-M8** — API Gateway, ALB devant Lambda et ECS.
