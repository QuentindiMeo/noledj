# M12 — ECS, opération + mini-projet du parcours

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir un **ECS Service** (vs `run-task` standalone) : maintenir un nombre désiré de tasks, gérer rolling deploy, intégrer un Load Balancer.
- **Démarrer un service ECS** manuellement (item N1 explicite) : `create-service` avec Task Definition, desired count, network config, et integration ALB optionnelle.
- **Mettre à jour un service** manuellement (item N1 explicite) : `update-service` vers une nouvelle révision de Task Definition, paramètres de **rolling deploy** (`minimumHealthyPercent`, `maximumPercent`), forçage d'un nouveau déploiement, rollback rapide.
- Connaître et configurer le **Service Auto Scaling** (Application Auto Scaling) : target tracking sur CPU / RAM / ALB Request Count, step scaling, scheduled scaling.
- Intégrer un service ECS à **ALB** (target group de type `ip` pour Fargate) et à **Cloud Map** (service discovery).
- **Diagnostiquer** un déploiement échoué : tasks `STOPPED`, événements du service, logs CloudWatch, ECS Exec.
- Conduire le **mini-projet final du parcours** : déployer une application conteneurisée sur ECS Fargate, orchestrée par Step Functions et déclenchée par une Lambda.

## Durée estimée

1 jour (hors mini-projet) — **mini-projet 3 à 5 jours**.

## Pré-requis

- M11 (ECS bases, Task Definition, Fargate vs EC2).
- M4-M6 (Lambda).
- M9 (Step Functions).
- M10 (ECR).
- AWS Networking M2-M4 (VPC, subnets, SG) et M8 (ALB) — fortement recommandés.
- AWS CLI v2 configurée.
- Permissions IAM : `ecs:*`, `elasticloadbalancing:*`, `application-autoscaling:*`, `iam:PassRole`, `logs:*`, `ec2:Describe*`.

---

## 1. Pourquoi ce module et son scope opérationnel

### 1.1 — Ce qui change vs M11

M11 a couvert la **conception** : cluster, Task Definition, comparaison Fargate / EC2. M12 couvre **l'opération** : faire tourner un service, le maintenir, le mettre à jour, l'inspecter quand ça plante.

Un Service ECS est ce qui sépare un **container jetable** (run-task) d'une **stack web de production** :

- Maintient un nombre désiré de tasks en permanence (auto-réparation).
- Met à jour les tasks en rolling sans downtime.
- S'intègre à un Load Balancer.
- Scale automatiquement selon une métrique.

### 1.2 — Anti-patterns récurrents en opération ECS

| Anti-pattern                                                 | Conséquence                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `update-service` à la main depuis un poste dev.              | Pas de traçabilité, déploiement non reproductible. CI/CD obligatoire en équipe. |
| `minimumHealthyPercent: 0`.                                  | Downtime garantie pendant le déploiement.                                       |
| Pas d'Auto Scaling.                                          | Service fixe, surpaye ou sous-dimensionné.                                      |
| Health check ALB en lieu et place du health check container. | Les deux ont des sémantiques différentes. Souvent les deux ensemble.            |
| Logs uniquement vers fluent-bit interne sans CloudWatch.     | Plus de visibilité par défaut au troubleshooting.                               |
| Pas de **Container Insights** activé.                        | Métriques absentes au moment où on en a besoin.                                 |
| Stopped tasks ignorées (`stopped` reason inspecté tard).     | Cause masquée, diagnostic d'incident lent.                                      |

---

## 2. ECS Service — anatomie

### 2.1 — Vs `run-task`

| Aspect                        | `run-task` standalone      | **Service ECS**                             |
| ----------------------------- | -------------------------- | ------------------------------------------- |
| Maintient `N` tasks running   | Non (1 fois et c'est tout) | **Oui** (`desiredCount`)                    |
| Remplace une task morte       | Non                        | **Oui** automatiquement                     |
| Rolling deploy                | Non                        | **Oui** vers une nouvelle Task Def revision |
| Intégration ALB / NLB         | Non                        | **Oui** (registration / deregistration)     |
| Service Discovery (Cloud Map) | Non                        | **Oui**                                     |
| Auto Scaling                  | Non                        | **Oui** (Application Auto Scaling)          |
| Usage typique                 | Jobs ponctuels, batch      | Services HTTP, workers permanents           |

### 2.2 — Service principal — paramètres clés

| Paramètre                                  | Description                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `serviceName`                              | Nom du service.                                                                                           |
| `cluster`                                  | Cluster dans lequel le service tourne.                                                                    |
| `taskDefinition`                           | ARN ou family:revision.                                                                                   |
| `desiredCount`                             | Combien de tasks doivent tourner.                                                                         |
| `launchType` ou `capacityProviderStrategy` | Fargate, EC2, mix.                                                                                        |
| `networkConfiguration`                     | Subnets, SG, assignPublicIp (Fargate awsvpc).                                                             |
| `loadBalancers`                            | Si intégration ALB / NLB : target group, container name + port.                                           |
| `serviceRegistries`                        | Si Cloud Map : namespace, service name.                                                                   |
| `healthCheckGracePeriodSeconds`            | Délai avant que ALB / ECS commencent à compter les health checks (utile pour les apps lentes à démarrer). |
| `deploymentConfiguration`                  | `minimumHealthyPercent`, `maximumPercent`, `deploymentCircuitBreaker`.                                    |
| `placementStrategies` (EC2 only)           | `random`, `spread`, `binpack`.                                                                            |
| `placementConstraints` (EC2 only)          | `distinctInstance`, `memberOf` (filtre EC2).                                                              |

---

## 3. Démarrer un service ECS (item N1 explicite)

### 3.1 — Service minimal — sans ALB

```bash
aws ecs create-service \
  --cluster tp-m11-cluster \
  --service-name tp-m12-web-svc \
  --task-definition tp-m11-web:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={
    subnets=[subnet-aaa,subnet-bbb],
    securityGroups=[sg-xxx],
    assignPublicIp=ENABLED
  }' \
  --deployment-configuration 'minimumHealthyPercent=100,maximumPercent=200' \
  --enable-execute-command
```

Lecture :

- `desiredCount=2` : 2 tasks tournent en permanence (1 par AZ via les subnets).
- `assignPublicIp=ENABLED` : chaque task a une IP publique. À utiliser **uniquement** si pas d'ALB devant.
- `minimumHealthyPercent=100, maximumPercent=200` : pendant un rolling update, on monte jusqu'à 4 tasks (2 anciennes + 2 nouvelles), on attend que les nouvelles soient healthy, puis on dégage les anciennes. **Zéro downtime**.
- `enable-execute-command` : permet d'utiliser `ecs execute-command` (shell dans le container) plus tard pour le debug.

### 3.2 — Avec un ALB

```bash
# 1. Créer un ALB (Networking M8)
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name tp-m12-alb \
  --subnets subnet-aaa subnet-bbb \
  --security-groups sg-alb \
  --scheme internet-facing --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# 2. Target group de type "ip" (obligatoire pour awsvpc / Fargate)
TG_ARN=$(aws elbv2 create-target-group \
  --name tp-m12-tg \
  --protocol HTTP --port 8000 \
  --target-type ip \
  --vpc-id vpc-xxx \
  --health-check-path /healthz \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# 3. Listener
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn="$TG_ARN"

# 4. Service avec attachement ALB
aws ecs create-service \
  --cluster tp-m11-cluster \
  --service-name tp-m12-web-svc \
  --task-definition tp-m11-web:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={
    subnets=[subnet-aaa,subnet-bbb],
    securityGroups=[sg-task],
    assignPublicIp=DISABLED
  }' \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=app,containerPort=8000" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration 'minimumHealthyPercent=50,maximumPercent=200' \
  --enable-execute-command
```

Lecture :

- Le target group est de type **`ip`** car en Fargate chaque task a sa propre IP (mode `awsvpc`). Le type `instance` est réservé au launch type EC2 en `bridge` ou `host`.
- ECS **enregistre / déregistre** automatiquement les IPs des tasks dans le target group.
- `containerName=app,containerPort=8000` : ECS sait quel port du container exposer.
- `healthCheckGracePeriodSeconds=60` : pendant la première minute après démarrage, l'ALB ne marque pas la task unhealthy même si le check échoue (laisse à l'app le temps de démarrer).

### 3.3 — Vérifier le démarrage

```bash
# État du service
aws ecs describe-services \
  --cluster tp-m11-cluster \
  --services tp-m12-web-svc \
  --query 'services[0].{
    Desired:desiredCount,
    Running:runningCount,
    Pending:pendingCount,
    Status:status,
    Events:events[0:5]
  }'

# Tasks en cours
aws ecs list-tasks --cluster tp-m11-cluster --service-name tp-m12-web-svc

# Détails de chaque task
aws ecs describe-tasks --cluster tp-m11-cluster --tasks <TASK_ARN>
```

Le champ **`events`** est très précieux : il consigne tout ce que le service fait ou tente de faire :

```json
"Events": [
  { "message": "(service tp-m12-web-svc) has reached a steady state.", "createdAt": "..." },
  { "message": "(service tp-m12-web-svc) registered 2 targets in (target-group ...)", "createdAt": "..." },
  { "message": "(service tp-m12-web-svc) has started 2 tasks: (task ...)", "createdAt": "..." }
]
```

Si quelque chose foire, c'est là qu'on lit en premier.

---

## 4. Mettre à jour un service (item N1 explicite)

### 4.1 — Mise à jour vers une nouvelle Task Definition

```bash
# 1. Pousser une nouvelle image
docker tag tp-m11-web:1.0.1 ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/tp-m11-web:1.0.1
docker push ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/tp-m11-web:1.0.1

# 2. Créer une nouvelle révision de Task Def (qui pointe sur l'image 1.0.1)
aws ecs register-task-definition --cli-input-json file://taskdef-v2.json
# → tp-m11-web:2

# 3. Mettre à jour le service vers cette révision
aws ecs update-service \
  --cluster tp-m11-cluster \
  --service tp-m12-web-svc \
  --task-definition tp-m11-web:2
```

ECS lance immédiatement un **rolling deploy** :

```text
État        Tasks         Description
─────       ──────        ────────────────────────────
T0          2 × v1         État stable initial.
T1          2 × v1 + 2 × v2 starting   ECS démarre les 2 nouvelles tasks.
T2          2 × v1 + 2 × v2 healthy    ALB enregistre les nouvelles ; toutes en HEALTHY.
T3          1 × v1 + 2 × v2            ECS déregistre et stoppe la première v1.
T4          2 × v2                     ECS stoppe la seconde v1.
T5          État stable nouvelle révision.
```

Durée typique pour 2 tasks : 2-5 minutes selon le démarrage de l'app.

### 4.2 — Forcer un nouveau déploiement

Si on veut **redémarrer** les tasks sans changer la Task Def (par exemple pour récupérer une nouvelle valeur de secret depuis Secrets Manager) :

```bash
aws ecs update-service \
  --cluster tp-m11-cluster \
  --service tp-m12-web-svc \
  --force-new-deployment
```

ECS relance le rolling avec la **même révision**. Les nouvelles tasks récupèrent les secrets les plus récents au démarrage.

### 4.3 — Paramètres de rolling deploy

| Paramètre                        | Effet                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `minimumHealthyPercent`          | % minimum de tasks healthy pendant le déploiement. **100** = zero downtime, **50** = on accepte une réduction temporaire.            |
| `maximumPercent`                 | % maximum de tasks pendant le déploiement. **200** = on peut doubler temporairement (recommandé). **100** = remplacement un-pour-un. |
| `deploymentCircuitBreaker`       | Si les nouvelles tasks échouent N fois, ECS **rollback automatiquement** vers la révision précédente.                                |
| `enable: true`, `rollback: true` | Active le circuit breaker + rollback auto.                                                                                           |

Pour un service prod **zero-downtime** :

```bash
--deployment-configuration 'minimumHealthyPercent=100,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}'
```

### 4.4 — Rollback rapide

Méthode 1 — re-pointer vers la révision précédente :

```bash
aws ecs update-service \
  --cluster tp-m11-cluster \
  --service tp-m12-web-svc \
  --task-definition tp-m11-web:1
```

ECS lance un rolling deploy "en arrière". Fonctionne tant que la révision 1 est toujours dans ECR (lifecycle policy à surveiller).

Méthode 2 — circuit breaker (automatique) :

Si le déploiement vers `:2` échoue (par exemple `:2` plante au démarrage), le circuit breaker **rollback** automatiquement vers `:1`. Indispensable pour la prod.

### 4.5 — Blue/Green via CodeDeploy

Pour des déploiements **blue/green** stricts (Lambda canary, traffic shifting graduel) :

- Intégration ECS + **CodeDeploy** (`deploymentController.type: CODE_DEPLOY`).
- CodeDeploy gère deux target groups et bascule progressivement le traffic.
- Plus complexe à mettre en place mais permet : canary 10 % → 50 % → 100 %, fallback automatique sur métrique CloudWatch.

Hors périmètre direct du M12 — mention pour aller plus loin.

### 4.6 — Anti-patterns update-service

| Anti-pattern                                                           | Conséquence                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `minimumHealthyPercent: 0`.                                            | Downtime garantie. Tout enlever avant de remettre.                           |
| Pas de **circuit breaker** + rollback auto.                            | Service bloqué en deploy infini en cas d'image cassée.                       |
| `update-service` à la main en prod.                                    | Pas de traçabilité, déploiement non reproductible. CI/CD avec audit log.     |
| Push un nouveau `:latest` au lieu d'une nouvelle révision.             | Le service ne se met pas à jour automatiquement (sauf force-new-deployment). |
| Lifecycle policy ECR qui supprime `:N-1` avant le déploiement terminé. | Rollback impossible (image source disparue).                                 |

---

## 5. Service Auto Scaling

### 5.1 — Application Auto Scaling — la mécanique

ECS s'appuie sur **Application Auto Scaling** (un service AWS générique aussi utilisé par DynamoDB, Aurora Serverless, etc.) pour ajuster `desiredCount` selon une métrique.

Étapes :

1. **Register a scalable target** : déclarer "ce service peut scaler entre 2 et 20 tasks".
2. **Créer un scaling policy** : règles de scaling — target tracking, step scaling, scheduled.

### 5.2 — Registre du scalable target

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/tp-m11-cluster/tp-m12-web-svc \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 20
```

### 5.3 — Target Tracking — le plus utilisé

> "Maintenir une métrique cible à une valeur donnée."

Exemple : maintenir l'**ALB Request Count per target** autour de **1000 req/min/task**.

```bash
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/tp-m11-cluster/tp-m12-web-svc \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name tt-alb-rcpt \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 1000.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/tp-m12-alb/<HASH>/targetgroup/tp-m12-tg/<HASH>"
    },
    "ScaleInCooldown": 60,
    "ScaleOutCooldown": 60
  }'
```

Lecture : si la métrique dépasse 1000/min/task, ECS **scale-out** (ajoute des tasks). Si elle descend bien en dessous, ECS **scale-in** (retire des tasks). Cooldowns évitent le yo-yo.

Métriques prédéfinies typiques :

- `ECSServiceAverageCPUUtilization` (cible 50-70 %).
- `ECSServiceAverageMemoryUtilization`.
- `ALBRequestCountPerTarget`.

On peut aussi utiliser une **métrique custom** CloudWatch (latence p99, queue length SQS…).

### 5.4 — Step Scaling — pour cas plus précis

Step scaling permet de définir **plusieurs paliers** :

```text
Si CPU > 60 % pendant 5 min → +1 task.
Si CPU > 80 % pendant 2 min → +3 tasks.
Si CPU > 95 % pendant 1 min → +5 tasks.
```

Plus réactif que target tracking pour des picks abrupts.

### 5.5 — Scheduled Scaling

Pour des **patterns prévisibles** (par exemple "8h du matin tous les jours de semaine, monter à 10 tasks") :

```bash
aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --resource-id service/tp-m11-cluster/tp-m12-web-svc \
  --scalable-dimension ecs:service:DesiredCount \
  --scheduled-action-name scale-up-morning \
  --schedule "cron(0 8 ? * MON-FRI *)" \
  --scalable-target-action 'MinCapacity=10,MaxCapacity=20'
```

### 5.6 — Anti-patterns Auto Scaling

| Anti-pattern                                        | Conséquence                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Target tracking sur CPU pour une app IO-bound.      | Pas de signal — l'app n'utilise jamais le CPU. Choisir une métrique pertinente. |
| Cooldown trop court (5 s).                          | Yo-yo entre scale-out et scale-in.                                              |
| `MaxCapacity` trop bas.                             | Throttling en pick — service indisponible.                                      |
| Pas de **scale-in protection**.                     | Une task occupée peut être tuée pendant un scale-in.                            |
| Pas de **scheduled scaling** pour pics prévisibles. | On scale réactivement, latence en retard.                                       |

---

## 6. Service Discovery et intégrations

### 6.1 — AWS Cloud Map

Pour qu'**un service appelle un autre par nom DNS interne** (microservices), sans connaître les IPs de tasks (qui changent) :

```bash
# Namespace privé (vit dans le VPC)
aws servicediscovery create-private-dns-namespace \
  --name internal.tp-m12 \
  --vpc vpc-xxx

# Service
aws servicediscovery create-service \
  --name api \
  --namespace-id ns-xxx \
  --dns-config 'NamespaceId=ns-xxx,RoutingPolicy=MULTIVALUE,DnsRecords=[{Type=A,TTL=10}]' \
  --health-check-custom-config FailureThreshold=1
```

Puis lors de la création du service ECS :

```bash
aws ecs create-service ... \
  --service-registries 'registryArn=arn:aws:servicediscovery:...:service/srv-xxx'
```

Désormais, depuis un autre container du même VPC : `curl http://api.internal.tp-m12:8000/healthz` résout vers une des IPs healthy.

### 6.2 — ALB vs Cloud Map

- **ALB** : exposition publique (ou interne) HTTP / HTTPS avec features (auth, routing avancé, WAF). Adapté pour les **edge** services.
- **Cloud Map** : DNS-based discovery interne, simple et léger. Adapté pour les **inter-services** au sein d'une même architecture.
- Un service peut utiliser **les deux** simultanément.

---

## 7. Diagnostic et troubleshooting

### 7.1 — Service qui ne démarre pas — checklist

1. **Events du service** : `aws ecs describe-services ... --query 'services[0].events'`. Les 10 derniers messages racontent presque toujours la cause.
2. **Tasks stopped récentes** : `aws ecs list-tasks --cluster X --service Y --desired-status STOPPED`, puis `describe-tasks`. Champ `stoppedReason` essentiel.
3. **Logs CloudWatch** du container : si la task a au moins démarré, regarder les logs.
4. **Configuration réseau** : SG, NACLs, route table — la task arrive-t-elle à pull l'image depuis ECR ? À atteindre Secrets Manager ?
5. **IAM** : le Task Execution Role a-t-il `ecr:GetAuthorizationToken`, `secretsmanager:GetSecretValue` ?

### 7.2 — Erreurs fréquentes — table

| Symptôme                                                | Cause typique                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `CannotPullContainerError`                              | Image inexistante, mauvais ARN, IAM Execution Role insuffisant.               |
| `ResourceInitializationError: unable to pull secrets`   | Pas de `secretsmanager:GetSecretValue` ou `kms:Decrypt` sur l'Execution Role. |
| Task démarre puis stoppe immédiatement (`exit 1`)       | App qui crashe au boot — voir logs CloudWatch.                                |
| Task `RUNNING` mais ALB target `unhealthy`              | Health check path ou port différent. Grace period trop courte.                |
| Service stuck en `deployment` avec circuit breaker.     | Nouvelle image cassée. Vérifier logs, rollback.                               |
| `Service unable to place tasks (insufficient capacity)` | EC2 launch type : ASG saturé. Fargate : quota Fargate du compte atteint.      |
| Service scale infiniment.                               | Target tracking sur métrique mal calibrée.                                    |

### 7.3 — ECS Exec — shell dans un container

Indispensable pour debug live.

Prérequis :

- Service créé avec `--enable-execute-command`.
- Task Role avec `ssmmessages:CreateControlChannel`, `ssmmessages:CreateDataChannel`, `ssmmessages:OpenControlChannel`, `ssmmessages:OpenDataChannel`.
- Plugin Session Manager installé localement.

```bash
aws ecs execute-command \
  --cluster tp-m11-cluster \
  --task <TASK_ARN> \
  --container app \
  --interactive \
  --command "/bin/sh"
```

Permet de :

- `ps`, `top` dans le container.
- Tester la connectivité (`curl localhost:8000/healthz`).
- Inspecter les variables d'env (`env`).
- Cat fichiers de config.

**Très utilisé en troubleshooting** sans avoir à modifier l'image ou attendre un redéploiement.

---

## 8. Monitoring d'un service ECS

### 8.1 — Métriques CloudWatch natives

Namespace `AWS/ECS` :

- `CPUUtilization` (service, cluster).
- `MemoryUtilization`.
- `RunningTaskCount`, `PendingTaskCount`, `DesiredTaskCount`.

### 8.2 — Container Insights

Activé au niveau cluster (M11 7.2), expose dans `AWS/ECS/ContainerInsights` :

- Métriques **par task** : CPU, RAM, réseau, disque.
- Métriques **agrégées service** : task count, deployment status.
- Container-level metrics : OOM kills, restarts.

Container Insights est **payant** (~1 $/jour par cluster moyen), mais quasi indispensable pour exploiter un service ECS sérieusement.

### 8.3 — Dashboard recommandé

Pour un service web prod :

```text
┌──────────────────────────────┬──────────────────────────────┐
│ Service CPU% (cible 60 %)    │ Service Memory% (cible 70 %) │
├──────────────────────────────┼──────────────────────────────┤
│ Running vs Desired tasks     │ ALB 4xx + 5xx (separated)    │
├──────────────────────────────┼──────────────────────────────┤
│ ALB target response time p99 │ Deployment status            │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 9. Anti-patterns transverses

| Anti-pattern                                     | Conséquence                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Pas de `deploymentCircuitBreaker`.               | Service bloqué en deploy infini en cas d'image cassée.                  |
| `desiredCount=1` en prod.                        | SPOF — la mort d'une task = downtime. **≥ 2** réparti sur 2 AZ minimum. |
| Pas d'alarme **DesiredCount ≠ RunningCount**.    | Service en sous-capacité silencieuse.                                   |
| Auto Scaling sans `MaxCapacity` réaliste.        | Pick → facture imprévue.                                                |
| Service Discovery + ALB pour le même besoin.     | Souvent un seul suffit. Choisir.                                        |
| Pas de **smoke test** post-deploy.               | Régression détectée par utilisateur réel.                               |
| Le `Service Role` (legacy) au lieu du Task Role. | Hors guidelines modernes — Task Role est le bon pattern depuis 2017.    |

---

## 10. Mini-projet du parcours — cadrage complet

### 10.1 — L'énoncé

> **Déployer une application conteneurisée sur ECS Fargate orchestrée par Step Functions et déclenchée par une Lambda.**

Quatre briques :

1. **Une Lambda** réagit à un événement (typiquement un upload S3 ou un schedule EventBridge).
2. La Lambda déclenche une **Step Function** (state machine).
3. La Step Function lance une **tâche ECS Fargate** (un container qui fait un travail concret) **et** orchestre éventuellement plusieurs étapes Lambda + tâche.
4. Tout est observable, sécurisé (IAM moindre privilège), idempotent et reproductible.

### 10.2 — Choix de cas d'usage suggéré

Pour ne pas réinventer un domaine, suggestion : **pipeline de traitement d'image** :

- Un user upload une image dans S3 (`incoming/`).
- Lambda capte l'event S3.
- Lambda démarre une exécution Step Functions avec la clé de l'image en paramètre.
- Step Functions :
  - Étape 1 : **Lambda** qui valide le format et les métadonnées (mime, taille, EXIF).
  - Étape 2 : **Choice** :
    - Si JPEG / PNG / WebP : **ECS Fargate Task** qui redimensionne en 3 tailles avec ffmpeg/ImageMagick et upload vers `processed/`.
    - Si autre format : **Fail** explicite.
  - Étape 3 : **Lambda** qui écrit un record DynamoDB avec le résultat.
- En cas d'échec : **Catch** global → publish SNS / écriture en DLQ.

D'autres cas d'usage acceptables (à choisir selon l'envie) :

- Pipeline de transcription audio (Whisper en container Fargate).
- Pipeline ML : feature engineering en Lambda, training léger en Fargate, écriture du modèle en S3.
- Pipeline ETL : extraction Lambda, transformation lourde Fargate, load DynamoDB.

### 10.3 — Schéma cible

```graph
              ┌──────────────────────────────────────────────────────────┐
              │ S3 bucket "tp-final-uploads"                              │
              │   └─ incoming/<uuid>.jpg  (event ObjectCreated)          │
              └────────────────────────┬─────────────────────────────────┘
                                       │
                                       ▼
                         ┌─────────────────────────┐
                         │ Lambda "trigger"        │
                         │ - Lit l'event S3        │
                         │ - Démarre la state mach.│
                         └─────────────┬───────────┘
                                       │
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Step Function "tp-final-sm"                                              │
   │                                                                          │
   │   [Validate (Lambda)] ─► [Choice: format OK?] ─► [Run ECS Task: resize]  │
   │           │                          │                       │           │
   │           │                          │ Non                   │           │
   │           │                          ▼                       │           │
   │           │                      [Fail]                       │           │
   │           │                                                   ▼           │
   │           │                                          [Save metadata DDB]  │
   │           │                                                   │           │
   │           │      Catch (any error) ────► [Notify SNS]         │           │
   │           │                                                   ▼           │
   │           └────────────────────────────────────────►      [Succeed]       │
   └─────────────────────────────────────────────────────────────────────────┘
                                                                  │
                                                                  ▼
                                                  S3 "processed/<uuid>-{small,med,large}.jpg"
                                                  DynamoDB "tp-final-records"
```

### 10.4 — Découpage du livrable — par jour

**J1 — Setup et infra (≈ 1 j)**

- VPC + 2 subnets publics + 2 privés + NAT.
- ALB optionnel (pas obligatoire pour ce mini-projet — Step Functions appelle ECS via `ecs:runTask.sync` sans ALB).
- Bucket S3 `tp-final-uploads` avec préfixes `incoming/`, `processed/`, `archive/`.
- DynamoDB table `tp-final-records` (PK `id`).
- ECR repository `tp-final-resizer`.
- IAM : 4 rôles (Lambda trigger, Lambda validate, SF execution, ECS task).

**J2 — Container resize (≈ 1 j)**

- Dockerfile minimal Python + Pillow (ou Node + Sharp).
- Script qui lit `key` depuis env, télécharge depuis S3, redimensionne en 3 tailles, upload en S3.
- Build ARM64, push dans ECR.
- Task Definition Fargate, 1 vCPU / 2 GB.
- Test en `aws ecs run-task` manuel.

**J3 — Lambdas et state machine (≈ 1 j)**

- Lambda `trigger` (S3 event → SF start-execution).
- Lambda `validate` (lit l'objet S3, vérifie mime, taille).
- Lambda `save-record` (PutItem DDB).
- State machine ASL avec Task, Choice, Catch.

**J4 — Branchement, observabilité (≈ 1 j)**

- Connecter S3 event notification → Lambda trigger.
- CloudWatch Log Groups par composant avec rétention.
- Dashboard avec : invocations Lambda, durée Step Functions executions, count ECS tasks par status.
- Alarmes : SF executions failed > 0 sur 5 min.

**J5 — Polish, doc, démo (≈ 1 j, optionnel)**

- README détaillé.
- Tests bout en bout sur 5 images variées (succès + 1 échec).
- Script `cleanup.sh` pour démonter tout proprement.
- Schéma final propre.

### 10.5 — Critères de validation

Le mini-projet est validé si :

- Upload d'une image JPEG valide → 3 fichiers redimensionnés apparaissent dans `processed/<uuid>-{small,medium,large}.jpg` en < 90 s.
- Un record est créé dans DynamoDB avec les métadonnées.
- Upload d'un fichier non-supporté (par exemple `.bin`) → la Step Function termine en `Fail`, un message SNS est publié, **aucun** objet processed n'est créé.
- Les logs CloudWatch montrent le déroulé complet par exécution.
- Le démontage (`cleanup.sh`) supprime tout sans laisser d'EIP / EBS / Logs orphelins.
- Les **IAM roles** suivent le moindre privilège (un par fonction, un pour ECS).
- Le mini-projet est **redéployable** depuis zéro en lançant un script.

### 10.6 — Variantes "stretch"

Pour aller au-delà du Confirmé N2 :

- **Auto Scaling** sur ECS service (mais ici on n'a pas de service permanent — pivoter vers un design service-based) — alternativement, garder run-task.
- **Step Functions Distributed Map** : si on accepte un batch (1000 images en un seul upload zippé).
- **Blue/green** via CodeDeploy sur le service de prod.
- **ARM64 + Spot** sur Fargate (-50 % de coût compute).
- **Provisioned Concurrency** sur la Lambda trigger pour éviter le cold start.
- **Workflow Studio** rendu visuel exporté en image dans le README.

### 10.7 — Mode d'usage du livrable

Trois exploitations possibles :

1. **Portfolio** : push GitHub, README détaillé, schéma. Démonstration concrète des **9 modules clés** du parcours.
2. **Base d'évolution** : ajouter Auto Scaling, multi-région, observabilité avancée.
3. **Comparaison** : refaire le même workflow en EC2 + cron + script bash → mesurer le delta opérationnel.

### 10.8 — Démontage final

Important : ne pas oublier de détruire :

- ECS Service / Tasks (`update-service --desired-count 0` puis `delete-service`).
- Cluster ECS (`delete-cluster`).
- ECR repository (avec lifecycle ou suppression manuelle).
- Lambda functions.
- State machine.
- Log Groups.
- DynamoDB table.
- S3 bucket (vider d'abord).
- IAM rôles.
- VPC / subnets / NAT (les NAT Gateway coûtent ~33 $/mois et fuite souvent après un projet).

Un script `cleanup.sh` qui tape les CLI dans le bon ordre est un livrable à part entière.

---

## 11. Exercices pratiques (en plus du mini-projet)

### Exercice 1 — Démarrer un service ECS sans ALB (≈ 45 min)

**Objectif.** Item N1 explicite — démarrage manuel.

**Étapes :**

1. Réutiliser la Task Definition `tp-m11-web:1`.
2. Créer le service `tp-m12-web-svc-noLB` avec desiredCount=1, sans LB, `assignPublicIp=ENABLED`.
3. Récupérer l'IP publique de la task (via ENI).
4. `curl` la task directement.
5. Stopper le service.

**Livrable.** Captures CLI.

### Exercice 2 — Service avec ALB et health checks (≈ 75 min)

**Objectif.** Service production-ready.

**Étapes :**

1. Créer un ALB + target group de type `ip` + listener HTTP:80.
2. Créer le service `tp-m12-web-svc-alb` avec desiredCount=2, integration ALB.
3. Vérifier l'enregistrement automatique des cibles.
4. `curl` l'ALB → load balance entre les 2 tasks.
5. Arrêter manuellement une task → vérifier que ECS la remplace et que ALB rétablit.

**Livrable.** Captures + un test "kill une task et observe".

### Exercice 3 — Rolling update et rollback (≈ 60 min)

**Objectif.** Item N1 explicite — mise à jour manuelle.

**Étapes :**

1. Sur le service de l'exercice 2, push une nouvelle image avec un bug (par exemple `exit(1)` au démarrage).
2. Enregistrer Task Def `:2` qui pointe sur cette image.
3. `update-service --task-definition :2`.
4. Observer le circuit breaker rollback automatique (si activé).
5. Sinon, faire un rollback manuel vers `:1`.

**Livrable.** Captures du déploiement + une description de la séquence.

### Exercice 4 — Auto Scaling target tracking sur CPU (≈ 45 min)

**Objectif.** Comprendre l'Application Auto Scaling.

**Étapes :**

1. Register scalable target (min=2, max=10) sur le service.
2. Créer une policy target tracking sur `ECSServiceAverageCPUUtilization` cible 50 %.
3. Générer du load via `ab` ou `wrk` sur l'ALB.
4. Observer le scale-out.
5. Couper le load, observer le scale-in après cooldown.

**Livrable.** Captures + courbes CloudWatch.

### Exercice 5 — Diagnostiquer un service en panne (≈ 45 min)

**Objectif.** Méthode de troubleshooting.

**Étapes :**

1. Volontairement casser une Task Def (ARN ECR inexistant).
2. Enregistrer + update-service.
3. Observer le déploiement bloqué.
4. Lire les **events** du service.
5. Inspecter les tasks `STOPPED` (`stoppedReason`).
6. Corriger et rollback.

**Livrable.** Diagnostic écrit en 10 lignes + capture du message d'erreur.

### Mini-projet — voir section 10

5 jours, livrable final du parcours.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Distinguer **run-task** standalone et **Service** ECS.
- [ ] **Démarrer un service** complet en CLI : task def, desired count, network config, ALB optionnel.
- [ ] Décrire la **rolling update** ECS pas à pas.
- [ ] Décrire les paramètres `minimumHealthyPercent` et `maximumPercent`.
- [ ] Expliquer le **deployment circuit breaker** et son intérêt en prod.
- [ ] Mettre à jour un service vers une **nouvelle révision** et faire un **rollback rapide**.
- [ ] Forcer un nouveau déploiement (`--force-new-deployment`) — quand et pourquoi.
- [ ] Configurer **Application Auto Scaling** target tracking sur CPU.
- [ ] Distinguer **target tracking**, **step scaling**, **scheduled scaling**.
- [ ] Distinguer **ALB integration** et **Cloud Map service discovery** côté ECS.
- [ ] Lister les **5 étapes** du diagnostic d'un service en panne.
- [ ] Utiliser **ECS Exec** pour debug live.
- [ ] Décrire les **4 briques** du mini-projet final (S3 → Lambda → Step Functions → ECS Fargate).

### Items du glossaire visés

**N1 atteint** :

- _démarrer et mettre à jour manuellement un service ECS_ — sections 3 et 4.

**N2 consolidé** (déjà vu en M11) :

- _différences Fargate / EC2_, _Task Definition_.

**N3 amorcé** :

- _stratégies de déploiement ECS_ — rolling, circuit breaker, blue/green via CodeDeploy.

---

## 13. Synthèse du parcours AWS Compute, Container & Orchestration

Le parcours se referme ici. À ce stade :

- **M1** — EC2, bases : AMI, familles, générations, User Data.
- **M2** — EC2, pricing & lifecycle : On-Demand / Spot / RI / SP, stop vs terminate.
- **M3** — Métriques et monitoring : CloudWatch, agent, alarmes.
- **M4** — Lambda fondamentaux : code, handler, packaging.
- **M5** — Lambda déclenchement : API Gateway, S3, EventBridge, SQS.
- **M6** — Lambda limitations et Layers.
- **M7** — AppRunner et serverless dim.
- **M8** — Batch vs Lambda.
- **M9** — Step Functions.
- **M10** — ECR.
- **M11** — ECS bases (Fargate vs EC2, Task Definition).
- **M12** (ce module) — ECS opération + mini-projet final.

L'apprenant est désormais **Confirmé N2** sur AWS Compute, Container & Orchestration — capable de :

- Choisir le bon service compute pour un workload donné.
- Concevoir, déployer et opérer une architecture conteneurisée moderne sur AWS.
- Combiner Lambda, Step Functions et ECS Fargate dans des pipelines évènementiels.
- Surveiller, diagnostiquer et faire évoluer un service en production.
- Maîtriser les leviers de coût (Spot, Savings Plans, rightsizing) et les pièges associés (cold start, idle, vendor lock-in).

Pour viser le **N2,5 / Senior** : approfondir Auto Scaling Groups EC2, EKS basics, ECS Capacity Providers avancés, Blue/Green via CodeDeploy, et l'observabilité fine (X-Ray, EMF, custom metrics).

---

## 14. Ressources complémentaires

### Documentation AWS

- [ECS services](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html)
- [Service update](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/update-service-console-v2.html)
- [Service auto scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/what-is-application-auto-scaling.html)
- [Deployment strategies (rolling, blue/green)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-types.html)
- [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
- [Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights.html)
- [Service discovery — Cloud Map](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)

### Outils

- [AWS Copilot CLI](https://aws.github.io/copilot-cli/) — orchestration ECS de bout en bout.
- [aws-ecs-deploy](https://github.com/silinternational/ecs-deploy) — wrapper de déploiement.
- [ChamberSecrets](https://github.com/segmentio/chamber) — gestion de secrets via Parameter Store.

### Patterns

- [AWS Well-Architected — Containers Lens](https://docs.aws.amazon.com/wellarchitected/latest/containers-lens/welcome.html)
- [Best practices for ECS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate-best-practices.html)

### Pour aller plus loin (N3 / Senior)

- **EKS** : alternative Kubernetes, courbe d'apprentissage plus longue.
- **ECS Anywhere** : tasks ECS sur des serveurs on-premise.
- **App Mesh** : service mesh AWS.
- **CodeDeploy Blue/Green** : déploiements canary fins.
- **Capacity Providers avancés** : mixer Fargate + EC2 spot + EC2 on-demand dans le même service.
