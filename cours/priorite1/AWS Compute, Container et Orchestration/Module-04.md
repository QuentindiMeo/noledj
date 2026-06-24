# M4 — Lambda, fondamentaux

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Lambda** : service de **Functions-as-a-Service** (FaaS), positionnement par rapport à EC2 / ECS / AppRunner, modèle d'exécution et de facturation à la milliseconde.
- Décrire l'**anatomie d'une Lambda** : code, **handler**, runtime, **execution role**, **configuration** (mémoire, timeout, variables d'environnement, VPC, concurrency).
- Citer et choisir parmi les **trois manières de fournir le code** (item N1 explicite) : **archive ZIP uploadée directement**, **archive ZIP référencée dans S3**, **image Docker depuis ECR** — avec les contraintes de taille de chaque méthode.
- **Configurer l'entrypoint** d'une Lambda (item N1 explicite) : convention `<fichier>.<fonction>` selon le runtime, signature attendue, paramètres `event` et `context`.
- Écrire, packager et déployer **une première Lambda Python** en deux variantes (ZIP et image Docker) répondant à un événement simple.
- Comprendre le **rôle d'exécution** d'une Lambda et le distinguer du rôle d'invocation.

## Durée estimée

1 jour.

## Pré-requis

- AWS CLI v2 configurée.
- Python 3.x installé localement (ou Node.js, mais les exemples sont en Python).
- Docker installé localement pour la variante image (exercice 4).
- AWS Identity M1-M3 — recommandé (notions de role, policy, assume role).
- Permissions IAM : `lambda:*`, `iam:CreateRole`, `iam:PassRole`, `iam:AttachRolePolicy`, `s3:*` (pour la variante S3), `ecr:*` (pour la variante image).
- Connaître les bases d'EC2 (M1) — utile pour comprendre ce qui change avec Lambda.

---

## 1. Pourquoi Lambda

### 1.1 — Le serverless en une phrase

> **Lambda** exécute du code **à la demande**, sans gérer aucune VM. AWS provisionne, met à l'échelle et fait mourir l'environnement d'exécution. On paye **à la milliseconde** consommée, **uniquement quand le code tourne**.

Trois implications majeures :

1. **Pas d'EC2 à entretenir** : pas de patches OS, pas de configuration de service, pas d'Auto Scaling Group à dimensionner.
2. **Scaling instantané** : 1 requête ou 10 000 requêtes simultanées — AWS lance autant d'instances de Lambda que nécessaire (dans la limite de la **concurrency quota** du compte, voir M6).
3. **Coût zéro à l'idle** : un service appelé 10 fois par mois coûte des cents. Un service à 50 000 invocations/jour coûte typiquement quelques dollars.

### 1.2 — L'analogie de l'auto-stop

Penser à Lambda comme un **service d'auto-stop logiciel** :

- Avec **EC2**, on **loue une voiture** à plein temps. Elle est garée devant chez soi 24 h/24, on paye même quand on ne roule pas. Avantage : elle démarre instantanément, on contrôle tout (intérieur, musique, etc.).
- Avec **Lambda**, on lève le pouce et **un chauffeur passe** dès qu'on en a besoin. On paye **à la minute** de trajet uniquement. AWS gère le véhicule, l'essence, les patches. Inconvénient : démarrage parfois pas instantané (cold start) ; pas de stockage permanent dans le véhicule entre deux trajets.

Le service est **conçu pour les workloads événementiels et stateless** :

- Traiter un message d'une queue.
- Répondre à un appel API HTTP via API Gateway.
- Réagir à l'arrivée d'un fichier sur S3.
- Exécuter une tâche planifiée (EventBridge cron).

Ce qu'il **n'est pas** :

- Un serveur web 24/7 à charge soutenue (préférer Fargate ou EC2 + ALB).
- Un job de 4 heures (timeout max 15 minutes).
- Un workload qui a besoin d'**état local persistant** entre les invocations.

### 1.3 — Le modèle de facturation

Lambda facture **trois choses** :

| Composant                                | Granularité       | Taux indicatif (eu-west-1)       |
| ---------------------------------------- | ----------------- | -------------------------------- |
| **Invocations**                          | Par appel         | 0,20 $ par million d'invocations |
| **Durée**                                | À la milliseconde | ~0,0000166667 $ / GB-seconde     |
| **Stockage éphémère** ((`/tmp` > 512 MB) | À la GB-s         | Coût additionnel marginal        |

**Exemples chiffrés** :

| Workload                           | Coût mensuel approximatif |
| ---------------------------------- | ------------------------- |
| 1M invocations × 200 ms × 256 MB   | < 1 $                     |
| 100M invocations × 500 ms × 512 MB | ~430 $                    |
| 10M invocations × 5 s × 2 GB       | ~1 700 $                  |

À gros volume, Lambda **peut devenir plus cher** que des conteneurs Fargate sur EC2 — d'où la nécessité de mesurer (M6).

### 1.4 — Lambda dans le catalogue compute

Reprise du tableau de M1, pour situer :

| Service            | Modèle d'exécution       | Pricing                   | Cas central                                    |
| ------------------ | ------------------------ | ------------------------- | ---------------------------------------------- |
| **EC2**            | VM 24/7 ou intermittente | Heure / seconde de VM     | Stack contrôlé, charge soutenue.               |
| **ECS Fargate**    | Container long-running   | vCPU + RAM × durée        | Microservices conteneurisés à charge soutenue. |
| **Lambda**         | Function éphémère        | Invocations + GB-secondes | Événements, batch courts, glue logic.          |
| **Step Functions** | Orchestration de Lambdas | Transitions d'états       | Workflows multi-étapes (M9).                   |
| **AppRunner**      | Container fully-managed  | Heure (avec idle scaling) | Apps web simples (M7).                         |
| **Batch**          | Jobs long-running        | EC2/Fargate sous-jacent   | Workload batch lourd (M8).                     |

### 1.5 — Anti-patterns avant même d'avoir commencé

| Anti-pattern                                                              | Conséquence                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "On va mettre toute l'app en Lambda."                                     | Service avec connexions WebSocket persistantes, état session, longues requêtes → mauvais cas d'usage. |
| Lambda qui attend une réponse HTTP synchrone de 30 secondes.              | Risque de timeout, gaspillage GB-seconde, mauvaise UX. À découper.                                    |
| Lambda qui se connecte à RDS sans connection pooling (RDS Proxy).         | Saturation immédiate du pool de connexions de la DB.                                                  |
| Mettre des **secrets en variables d'environnement** Lambda en clair.      | Visibles dans `aws lambda get-function-configuration`. Utiliser Secrets Manager.                      |
| Une Lambda qui en invoque une autre **synchroniquement** dans une boucle. | Latence cumulée et **double facturation** (les deux Lambdas comptent). Préférer Step Functions.       |

---

## 2. Anatomie d'une Lambda

Une fonction Lambda se résume à **6 composants principaux** :

| Composant                   | Rôle                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| **Code**                    | Le programme, packagé en ZIP ou image Docker.                                         |
| **Runtime**                 | Environnement d'exécution (Python 3.12, Node.js 22, Java 21, Go, Ruby, .NET, custom). |
| **Handler**                 | Point d'entrée dans le code (l'**entrypoint**). Format dépend du runtime.             |
| **Execution Role**          | Rôle IAM **assumé par Lambda** pendant l'exécution pour appeler les API AWS.          |
| **Configuration**           | Memory, timeout, env vars, VPC, ephemeral storage, concurrency.                       |
| **Triggers / Destinations** | Sources d'événements et cibles éventuelles (voir M5).                                 |

### 2.1 — Configuration des ressources

| Paramètre             | Plage                                 | Effet                                                                                 |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| **Memory**            | 128 MB → 10 240 MB                    | Définit **aussi** le CPU alloué : 1 769 MB = 1 vCPU plein. Plus de RAM = plus de CPU. |
| **Timeout**           | 1 s → 900 s (15 min)                  | Au-delà, Lambda kill la fonction. Pour > 15 min, **Step Functions** ou **Batch**.     |
| **Ephemeral storage** | 512 MB → 10 240 MB                    | Taille du `/tmp` mounté. Au-delà de 512 MB, facturé en sus.                           |
| **Environment**       | Jusqu'à 4 KB total                    | Variables d'environnement lues par le code (et par AWS).                              |
| **Concurrency**       | 1 → quota du compte (1000 par défaut) | Combien d'invocations parallèles maximum. Au-delà : throttling.                       |
| **VPC**               | Optionnel                             | Si attaché, la Lambda voit le VPC privé ; sinon, elle est dans un VPC AWS managé.     |
| **Architectures**     | `x86_64` ou `arm64`                   | ARM (Graviton) : ~20 % moins cher, perf souvent meilleure.                            |

### 2.2 — Mémoire et CPU sont liés

Point souvent ignoré : Lambda **ne propose pas de réglage indépendant pour le CPU**. Le nombre de vCPU est **proportionnel** à la RAM allouée. Quelques repères :

| Memory    | Approx. vCPU |
| --------- | ------------ |
| 128 MB    | 0,07 vCPU    |
| 512 MB    | 0,29 vCPU    |
| 1 024 MB  | 0,58 vCPU    |
| 1 769 MB  | 1,00 vCPU    |
| 3 008 MB  | 1,70 vCPU    |
| 5 308 MB  | 3,00 vCPU    |
| 10 240 MB | 6,00 vCPU    |

**Conséquence pratique** : si une Lambda est CPU-bound, **augmenter la RAM** est souvent la bonne réponse — la fonction tourne plus vite, ce qui **peut faire baisser** la facture (car le coût est `RAM × durée`). C'est l'optimisation comptée parmi les premières à essayer.

### 2.3 — VPC : optionnel, mais structurant

Par défaut, une Lambda tourne dans un **VPC géré par AWS** invisible. Elle a accès à Internet et aux endpoints publics AWS, mais **pas** aux ressources d'un VPC privé.

Pour accéder à une RDS dans un subnet privé, à un service interne via un ALB privé, ou à une ressource on-premise via Direct Connect, on **attache** la Lambda à un ou plusieurs **subnets privés** d'un VPC :

```bash
aws lambda update-function-configuration \
  --function-name myfn \
  --vpc-config 'SubnetIds=subnet-aaa,subnet-bbb,SecurityGroupIds=sg-xxx'
```

Effets :

- La Lambda obtient une **ENI** (interface réseau) dans chaque subnet — consomme une IP du CIDR.
- Pour sortir sur Internet depuis cette Lambda VPC-attached, il faut une **NAT Gateway** (ou un VPC endpoint).
- Le cold start est **un peu plus long** (provisioning de l'ENI), mais largement réduit depuis 2019 grâce à Hyperplane.

À considérer dans les choix d'architecture, pas un détail.

### 2.4 — Diagramme d'exécution

```graphviz
        Event
          │
          ▼
   ┌────────────────────────────┐
   │ AWS Lambda Service         │
   │                            │
   │   ┌────────────────────┐   │
   │   │ Execution Env      │   │
   │   │ (micro-VM Firecracker, │
   │   │  isolée, éphémère) │   │
   │   │                    │   │
   │   │ ┌────────────────┐ │   │
   │   │ │ Runtime (e.g.  │ │   │
   │   │ │ python3.12)    │ │   │
   │   │ │  ┌─────────────│ │   │
   │   │ │  │ Code        │ │   │
   │   │ │  │ + handler   │ │   │
   │   │ │  └─────────────│ │   │
   │   │ └────────────────┘ │   │
   │   │                    │   │
   │   │ Assume execution   │   │
   │   │ role → credentials │   │
   │   │ via env + IMDS-like│   │
   │   └────────────────────┘   │
   └────────────────────────────┘
          │
          ▼
       Result
```

L'environnement est **éphémère** : il peut être **réutilisé** pour plusieurs invocations consécutives (warm start), ou **détruit** après une période d'inactivité. Toute écriture dans `/tmp` survit entre warm starts mais est perdue au cold start suivant.

---

## 3. Les trois manières de fournir le code (item N1 explicite)

C'est **l'item N1 explicite** du module. Trois modes de packaging existent.

### 3.1 — Tableau comparatif d'abord

| Méthode                    | Taille max (compressé) | Taille max (décompressé) | Provenance     | Cas d'usage typique                                          |
| -------------------------- | ---------------------- | ------------------------ | -------------- | ------------------------------------------------------------ |
| **ZIP direct (upload)**    | 50 MB                  | 250 MB                   | Console / CLI  | Code simple, peu de dépendances, déploiement direct.         |
| **ZIP via S3**             | 50 MB (objet S3)       | 250 MB                   | Bucket S3      | Pipeline CI/CD, artefacts gérés en S3, taille intermédiaire. |
| **Image Docker (via ECR)** | 10 GB                  | 10 GB                    | Repository ECR | Dépendances natives lourdes, modèles ML, runtime custom.     |

À cela s'ajoute la **Layer** (introduite en M6) qui permet de mutualiser des dépendances communes — c'est une variante du ZIP.

### 3.2 — Méthode 1 — ZIP uploadé directement

Le code et ses dépendances sont packagés en archive ZIP et envoyés **directement** à Lambda via `aws lambda create-function` ou `update-function-code`.

**Structure du ZIP** :

```tree
lambda.zip
├── lambda_function.py       ← le code (point d'entrée)
├── requirements/
│   └── (toutes les deps Python installées dans le ZIP)
└── README.md (facultatif)
```

**Création** :

```bash
# 1. Le code minimal
cat > lambda_function.py <<'PY'
import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({"hello": "world", "event_received": event})
    }
PY

# 2. (Optionnel) installer les dépendances dans un dossier sœur
mkdir -p package
pip install --target ./package requests   # si on a des deps
cp lambda_function.py ./package/

# 3. Zipper
cd package && zip -r ../lambda.zip . && cd ..

# 4. Déployer
aws lambda create-function \
  --function-name tp-m4-hello \
  --runtime python3.12 \
  --role arn:aws:iam::ACCOUNT:role/lambda-basic-exec \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://lambda.zip \
  --timeout 10 --memory-size 256 \
  --architectures arm64
```

**Avantages** :

- Très **simple** à mettre en place pour un code de quelques fichiers.
- Pas besoin d'infrastructure annexe (pas de bucket S3, pas d'ECR).
- Démarrage rapide pour les démos et POC.

**Limites** :

- Taille max 50 MB compressé / 250 MB décompressé.
- Pour des Python deps lourdes (pandas, ML libs natives), on **explose** rapidement la limite. Cf. méthode 3.
- Le ZIP upload est **synchrone** dans le `create-function` : pour 40 MB, ça prend plusieurs secondes par déploiement.

### 3.3 — Méthode 2 — ZIP référencé dans S3

On upload d'abord le ZIP dans un **bucket S3**, puis on **référence** l'objet S3 dans la création de la Lambda.

```bash
# 1. Upload du ZIP dans S3
aws s3 cp lambda.zip s3://my-artifacts-bucket/lambdas/hello-v1.zip

# 2. Création / mise à jour Lambda avec une référence S3
aws lambda create-function \
  --function-name tp-m4-hello-s3 \
  --runtime python3.12 \
  --role arn:aws:iam::ACCOUNT:role/lambda-basic-exec \
  --handler lambda_function.lambda_handler \
  --code 'S3Bucket=my-artifacts-bucket,S3Key=lambdas/hello-v1.zip' \
  --timeout 10 --memory-size 256
```

**Avantages** :

- Limite **identique** (50 MB compressé / 250 MB décompressé), mais le upload S3 peut utiliser le **transfert multipart** — plus rapide pour des artefacts moyens.
- Permet de **découpler** la construction (CI/CD) et le déploiement : la CI dépose l'artefact dans S3, le déploiement Lambda le lit.
- **Versionnement S3** activé sur le bucket → on garde l'historique des artefacts (rollback facile).
- Bonne fit avec des **pipelines IaC** (Terraform, CloudFormation, CDK) qui référencent l'objet S3.

**Limites** :

- Demande un bucket S3 dédié avec une bucket policy adaptée.
- Permission Lambda doit pouvoir lire le bucket (le rôle utilisateur qui déploie, pas le rôle d'exécution).
- Si le ZIP S3 est **chiffré KMS**, le rôle d'exécution Lambda doit aussi avoir `kms:Decrypt` (rare en pratique).

### 3.4 — Méthode 3 — Image Docker depuis ECR

On packagize la fonction dans une **image Docker** publiée sur **ECR** (Elastic Container Registry, vu en M10), puis on la référence.

**Dockerfile minimal** :

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

# Installer les deps
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Code de la fonction
COPY lambda_function.py "${LAMBDA_TASK_ROOT}"

# Pointer le handler
CMD ["lambda_function.lambda_handler"]
```

Le `CMD` joue le rôle de **handler** par défaut (mais on peut surcharger via la config Lambda).

**Build et push** :

```bash
# 1. Construire l'image
docker build --platform linux/arm64 -t hello-lambda:latest .

# 2. Créer le repository ECR (une fois)
aws ecr create-repository --repository-name hello-lambda

# 3. Authentifier docker auprès d'ECR
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin \
  ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com

# 4. Tag + push
docker tag hello-lambda:latest \
  ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/hello-lambda:latest
docker push ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/hello-lambda:latest
```

**Déployer la Lambda à partir de l'image** :

```bash
aws lambda create-function \
  --function-name tp-m4-hello-docker \
  --package-type Image \
  --code 'ImageUri=ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/hello-lambda:latest' \
  --role arn:aws:iam::ACCOUNT:role/lambda-basic-exec \
  --timeout 10 --memory-size 512 \
  --architectures arm64
```

Pas de `--handler` ni `--runtime` ici : ils sont **portés par l'image** (via `CMD` et le runtime de l'image de base).

**Avantages** :

- Taille **10 GB** — permet d'embarquer pandas, scikit-learn, des modèles ML, des binaires natifs.
- Build et test local **identiques** au déploiement (on lance le container avec `docker run` localement).
- Runtime entièrement maîtrisé : si AWS ne propose pas Python 3.13, on peut packager le sien.
- Pratique commune dans les équipes qui déploient déjà des conteneurs ECS / Fargate.

**Limites** :

- **Cold start plus long** que ZIP (typique : 1-3 s pour un container vs 100-500 ms pour ZIP, sauf optimisation SnapStart). Voir M6.
- Demande un repository ECR à provisionner et nettoyer (lifecycle policy).
- Builds plus lourds en CI/CD.

### 3.5 — Comment choisir parmi les 3

| Critère                                                                                                            | Choix                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Code court, < 5 fichiers, deps natives faibles.                                                                    | **ZIP direct** — le plus simple.                                    |
| Pipeline CI/CD avec artefacts versionnés S3.                                                                       | **ZIP via S3**.                                                     |
| Deps lourdes (pandas, OpenCV, modèles ML).                                                                         | **Image Docker** (incontournable au-delà de 250 MB décompressé).    |
| Binaires natifs Linux spécifiques.                                                                                 | **Image Docker** (toolchain maîtrisée).                             |
| Runtime non supporté par Lambda nativement (Rust dans certains contextes, Python 3.13 avant son support officiel). | **Image Docker** + Custom Runtime.                                  |
| Maximum de cold start ultra-rapide (sub-100 ms).                                                                   | **ZIP** + **SnapStart** (vu en M6) — l'image Docker est plus lente. |

**Pratique commune** : démarrer en ZIP direct, basculer en ZIP+S3 quand on a une CI/CD, basculer en image Docker quand les deps explosent ou qu'on aligne le packaging avec ses microservices ECS.

### 3.6 — Mettre à jour une Lambda existante

```bash
# ZIP direct
aws lambda update-function-code \
  --function-name tp-m4-hello --zip-file fileb://lambda.zip

# ZIP via S3
aws lambda update-function-code \
  --function-name tp-m4-hello-s3 \
  --s3-bucket my-artifacts-bucket --s3-key lambdas/hello-v2.zip

# Image Docker
aws lambda update-function-code \
  --function-name tp-m4-hello-docker \
  --image-uri ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/hello-lambda:v2
```

Toujours **versionner** les artefacts (tag d'image, version S3, alias Lambda) pour pouvoir rollback rapidement.

---

## 4. Configuration de l'entrypoint (item N1 explicite)

C'est **l'item N1 explicite** : configurer le **handler** d'une Lambda.

### 4.1 — Définition

> Le **handler** est la **fonction du code** que Lambda invoque à chaque événement. Le format de référence d'un handler suit la convention `<chemin>.<fonction>` propre au runtime.

Exemple en Python :

| `--handler`                      | Signifie                                                         |
| -------------------------------- | ---------------------------------------------------------------- |
| `lambda_function.lambda_handler` | Dans `lambda_function.py`, appeler la fonction `lambda_handler`. |
| `src.app.handler`                | Dans `src/app.py`, appeler la fonction `handler`.                |
| `mypkg.runner.process_event`     | Dans `mypkg/runner.py`, appeler `process_event`.                 |

### 4.2 — Conventions par runtime

| Runtime          | Format du handler                            | Exemple                          |
| ---------------- | -------------------------------------------- | -------------------------------- |
| **Python**       | `<filename_sans_ext>.<fonction>`             | `lambda_function.lambda_handler` |
| **Node.js**      | `<filename_sans_ext>.<export>`               | `index.handler`                  |
| **Java**         | `<package>.<classname>::<method>`            | `com.acme.Hello::handleRequest`  |
| **Go (custom)**  | Nom du binaire (`main` traditionnellement)   | `main` ou `bootstrap`            |
| **.NET (C#)**    | `<assembly>::<namespace>.<class>::<method>`  | `MyLib::My.NS.Class::Method`     |
| **Ruby**         | `<filename_sans_ext>.<méthode>`              | `lambda_function.lambda_handler` |
| **Image Docker** | `CMD` du Dockerfile (souvent format Python). | `["app.handler"]`                |

### 4.3 — Signature du handler — Python

```python
def lambda_handler(event, context):
    # event   : dict — payload de l'événement (cf. M5 pour les formats par source)
    # context : objet exposant des métadonnées d'invocation
    return {"statusCode": 200, "body": "hello"}
```

`event` :

- **dict** (Python) ou **object** (Node.js) sérialisé depuis le JSON envoyé à Lambda.
- Sa **structure dépend de la source** : un event API Gateway HTTP ressemble à `{"version":"2.0","routeKey":"GET /hello","body":"..."}` ; un event S3 ressemble à `{"Records":[{"s3":{...}}]}`. La forme précise est documentée en M5.

`context` :

- Métadonnées d'exécution : `aws_request_id`, `function_name`, `memory_limit_in_mb`, `get_remaining_time_in_millis()`, `invoked_function_arn`, `log_group_name`.
- Sert essentiellement pour : tracer les invocations, décider de couper proprement un job qui approche du timeout.

### 4.4 — Une Lambda Python complète et lisible

```python
# lambda_function.py
import json
import logging
import os

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


def lambda_handler(event, context):
    logger.info("Received event", extra={"event": event})
    logger.info(
        "Remaining time (ms): %s",
        context.get_remaining_time_in_millis()
    )

    name = event.get("queryStringParameters", {}).get("name", "world")

    response = {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": f"hello {name}", "request_id": context.aws_request_id})
    }
    return response
```

Points pédagogiques :

- **Logger Python standard** → tout `logger.info(...)` est capturé par CloudWatch Logs automatiquement (un log group par fonction, `/aws/lambda/<function-name>`).
- **Lecture de variables d'environnement** (`LOG_LEVEL`).
- **Lecture du payload** (`queryStringParameters` est typique d'API Gateway HTTP API).
- **Lecture du `context`** pour journaliser le temps restant — utile pour des fonctions qui se rapprochent du timeout.

### 4.5 — Modifier le handler post-déploiement

```bash
# Changer juste le handler
aws lambda update-function-configuration \
  --function-name tp-m4-hello --handler src.app.new_handler

# Vérifier la config
aws lambda get-function-configuration --function-name tp-m4-hello \
  --query '{Handler:Handler, Runtime:Runtime, MemorySize:MemorySize, Timeout:Timeout, Role:Role}'
```

### 4.6 — Anti-patterns sur l'entrypoint

| Anti-pattern                                                                         | Conséquence                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Code lourd **dans le handler** (chargement de modèles, connexion DB à chaque appel). | Cold start lent, latence élevée. **Mettre l'init hors du handler** (variable module-scope).        |
| Handler qui **lance un thread** et retourne immédiatement.                           | Le thread est **gelé** dès que Lambda retourne (sandbox suspendu).                                 |
| Handler qui **n'attrape pas les exceptions**.                                        | Lambda ré-essaie automatiquement sur certaines sources (SQS, EventBridge) → exécutions dupliquées. |
| Plusieurs handlers exportés et confusion sur lequel est appelé.                      | Une seule fonction est appelée — celle référencée dans la config Lambda.                           |
| Handler **synchrone qui fait 10 s d'IO**.                                            | Gaspillage GB-seconde. Vérifier si async / Step Functions seraient plus adaptés.                   |

### 4.7 — Initialisation hors du handler — le pattern

**Mauvais** (init répétée à chaque invocation) :

```python
def lambda_handler(event, context):
    import boto3
    s3 = boto3.client('s3')   # créé à chaque appel
    # ... utilisation de s3
```

**Bon** (init à l'init du conteneur, partagée entre warm starts) :

```python
import boto3

s3 = boto3.client('s3')  # créé UNE fois par conteneur

def lambda_handler(event, context):
    # s3 réutilisé sur les warm starts
    ...
```

Différence pratique : sur 10 000 invocations qui réutilisent le même conteneur, le client `boto3` est instancié **1 fois** vs **10 000 fois**. La latence moyenne baisse de 50-200 ms par appel.

---

## 5. Rôle d'exécution (Execution Role)

### 5.1 — Définition

Le **rôle d'exécution** est un **rôle IAM assumé par Lambda** au moment d'exécuter la fonction. C'est ce rôle qui détermine **ce que le code peut faire** dans AWS (lire S3, écrire DynamoDB, publier sur SNS, etc.).

À distinguer du **rôle de l'appelant** (qui invoque la fonction) — ce dernier intervient en amont via la resource-based policy de la Lambda.

### 5.2 — Trust policy minimale

Pour que Lambda puisse assumer le rôle, la trust policy du rôle doit autoriser le service Lambda :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 5.3 — Permission minimale pour pousser des logs CloudWatch

À la création, le rôle doit pouvoir au minimum **écrire dans CloudWatch Logs** :

- Politique AWS-managed : `AWSLambdaBasicExecutionRole`.
- Permet : `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.

Sans ce rôle, la Lambda tourne mais **on ne voit pas ses logs**. Diagnostic frustrant.

```bash
# Créer un rôle d'exécution basique
aws iam create-role --role-name lambda-basic-exec \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

aws iam attach-role-policy --role-name lambda-basic-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

### 5.4 — Étendre les permissions selon le besoin

Pour qu'une Lambda lise un bucket S3 :

```bash
aws iam put-role-policy --role-name lambda-basic-exec \
  --policy-name S3ReadDataBucket \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":["s3:GetObject","s3:ListBucket"],
      "Resource":["arn:aws:s3:::my-data","arn:aws:s3:::my-data/*"]
    }]
  }'
```

Pour qu'elle écrive dans DynamoDB, qu'elle publie dans SQS, etc. : ajouter les permissions adaptées **au plus juste** (principe du moindre privilège, vu en Identity M6).

### 5.5 — Récupération des credentials dans le code

Quand on utilise un SDK AWS (boto3, AWS SDK for Node.js), il **détecte automatiquement** les credentials du rôle d'exécution via les variables d'environnement injectées par Lambda :

```log
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_REGION
```

Le développeur **ne** doit **jamais** mettre de credentials statiques en variables d'env Lambda — c'est exactement ce que le rôle d'exécution permet d'éviter.

---

## 6. Déployer, invoquer, observer — boucle complète

### 6.1 — Invoquer manuellement une Lambda

```bash
# Invocation synchrone, payload JSON dans le terminal
aws lambda invoke \
  --function-name tp-m4-hello \
  --payload '{"queryStringParameters":{"name":"noledj"}}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/response.json

# Lire la réponse
cat /tmp/response.json
```

Quatre champs utiles dans la réponse :

- **StatusCode** : 200 = invocation acceptée (ne dit rien du contenu).
- **FunctionError** : `Unhandled` ou `Handled` si la fonction a levé une exception.
- **LogResult** (si `--log-type Tail`) : base64 des derniers logs.
- **ExecutedVersion** : version exécutée.

### 6.2 — Lire les logs

```bash
# Tail en direct (CloudWatch Logs)
aws logs tail /aws/lambda/tp-m4-hello --follow
```

Ou via la console (CloudWatch > Log groups > `/aws/lambda/<function-name>`).

Chaque invocation génère typiquement 3 lignes :

```log
START RequestId: 1234abcd Version: $LATEST
INFO  ... (les logger.info du code)
END   RequestId: 1234abcd
REPORT RequestId: 1234abcd  Duration: 13.42 ms  Billed Duration: 14 ms  Memory Size: 256 MB  Max Memory Used: 64 MB
```

La ligne **REPORT** est précieuse : `Duration`, `Billed Duration`, `Max Memory Used` permettent de **rightsizer**.

### 6.3 — Versions et alias

Lambda supporte le **versionnement** : à chaque `publish-version`, AWS fige une version immuable (`v1`, `v2`, …). Un **alias** (par exemple `prod`) pointe vers une version, et peut être basculé sans changer les invocations.

```bash
# Publier une version
aws lambda publish-version --function-name tp-m4-hello --description "v1 initial"

# Créer un alias prod pointant sur v1
aws lambda create-alias --function-name tp-m4-hello \
  --name prod --function-version 1

# Plus tard, après update-function-code et publish-version :
aws lambda update-alias --function-name tp-m4-hello \
  --name prod --function-version 2
```

Les invocations cible alors `function-name:prod`, ce qui découple le déploiement de la mise en service.

---

## 7. Anti-patterns transverses

| Anti-pattern                                                   | Conséquence                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Lambda > 5 minutes de durée moyenne.                           | Coût élevé, mauvaise fit. Considérer Fargate ou Batch.                                                               |
| Lambda à 128 MB "pour économiser".                             | Souvent plus chère que 512 MB car durée multipliée. **Tester** avec `aws lambda invoke` et lire le REPORT.           |
| Pas de `architectures arm64`.                                  | 20 % d'économie loupée si le runtime supporte ARM (Python, Node, Go, Rust : oui ; .NET et Java : oui aussi en 2026). |
| **Code lourd dans le handler**.                                | Cold start énorme. Init hors handler.                                                                                |
| 10 secrets en env vars en clair.                               | Secrets Manager + variable contenant l'ID du secret = bonne pratique.                                                |
| Pas de **dead letter queue** ni de **destination on failure**. | Erreurs silencieuses. À configurer en M5.                                                                            |
| Lambda déployée **manuellement** depuis le poste dev.          | Pas de traçabilité, pas de rollback. CI/CD obligatoire en équipe.                                                    |

---

## 8. Exercices pratiques

### Exercice 1 — Première Lambda en ZIP direct (≈ 30 min)

**Objectif.** Manipuler le packaging ZIP et le handler.

**Étapes :**

1. Créer le rôle `lambda-basic-exec` avec `AWSLambdaBasicExecutionRole`.
2. Écrire `lambda_function.py` qui renvoie `{"hello": "<name>"}` en lisant un paramètre `name` dans `event`.
3. Zipper, créer la fonction `tp-m4-hello` (runtime `python3.12`, handler `lambda_function.lambda_handler`, ARM).
4. Invoquer avec deux payloads différents.
5. Lire les logs via `aws logs tail`.

**Livrable.** Code + 2 captures d'invocation + extrait logs.

### Exercice 2 — Lambda en ZIP via S3 avec versioning (≈ 30 min)

**Objectif.** Maîtriser la variante S3.

**Étapes :**

1. Créer un bucket S3 `tp-m4-artifacts-<initials>` avec **versioning activé**.
2. Uploader `lambda.zip` en `lambdas/hello-v1.zip`.
3. Créer `tp-m4-hello-s3` qui pointe vers `S3Bucket=..., S3Key=lambdas/hello-v1.zip`.
4. Modifier le code, re-zipper, uploader en `lambdas/hello-v2.zip`.
5. Mettre à jour la Lambda vers la nouvelle clé.
6. Lister les versions S3 et vérifier qu'on peut revenir en arrière en re-pointant Lambda vers `hello-v1.zip`.

**Livrable.** Captures CLI des étapes + une phrase sur l'avantage du versioning.

### Exercice 3 — Configurer le handler à un chemin custom (≈ 20 min)

**Objectif.** Maîtriser l'entrypoint hors convention par défaut.

**Étapes :**

1. Réorganiser le code en `src/app.py` avec une fonction `process_event(event, context)`.
2. Modifier le ZIP (en faisant attention que le **dossier `src/`** soit à la racine du ZIP).
3. Mettre à jour la Lambda : `--handler src.app.process_event`.
4. Vérifier que ça fonctionne.

**Livrable.** Le script de build du ZIP + la commande `update-function-configuration`.

### Exercice 4 — Lambda Docker depuis ECR (≈ 60 min)

**Objectif.** Maîtriser la 3e méthode de packaging.

**Étapes :**

1. Écrire un `Dockerfile` basé sur `public.ecr.aws/lambda/python:3.12`.
2. Y installer `requests` et `pandas` (sera trop lourd pour ZIP — d'où l'intérêt de la voie image).
3. Build local avec `--platform linux/arm64`.
4. Tester localement avec `docker run -p 9000:8080 hello-lambda` puis `curl -d '{}' http://localhost:9000/2015-03-31/functions/function/invocations`.
5. Push vers ECR (créer le repository au préalable).
6. Créer une Lambda `tp-m4-hello-docker` avec `--package-type Image`.
7. Invoquer.
8. Comparer la **taille de l'archive packagée** et le **cold start** vs la version ZIP.

**Livrable.** Dockerfile + capture du `docker run` local OK + capture de l'invocation Lambda.

### Exercice 5 — Mémoire / durée — tuning (≈ 30 min)

**Objectif.** Voir l'effet de la mémoire sur la durée.

**Étapes :**

1. Écrire une Lambda qui fait un calcul un peu CPU-bound (par exemple `hashlib.sha256(b'x'*1024*1024).hexdigest()` dans une boucle de 100 itérations).
2. Déployer avec 256 MB, mesurer la durée moyenne via les logs REPORT (10 invocations).
3. Re-déployer avec 1024 MB, mesurer.
4. Re-déployer avec 3008 MB, mesurer.
5. Calculer le coût total (`mémoire × durée`) pour chaque cas.

**Livrable.** Tableau (RAM, durée moyenne, GB-secondes, coût pour 1M invocations) + commentaire sur le "sweet spot".

### Mini-défi — Lambda S3 → traitement → S3 (≈ 60 min, conceptuel + premier code)

**Cas.** Lambda qui :

- Reçoit un événement S3 (la forme exacte est vue en M5 — utiliser une forme représentative pour l'exercice).
- Lit l'objet uploadé.
- Convertit (ou hash) son contenu.
- Réécrit le résultat dans un autre bucket.

Pour ce module : se concentrer sur **le code et le handler**, la connexion d'événement S3 réel arrive en M5.

Étapes :

1. Écrire la fonction qui prend un event factice `{"bucket":"src","key":"hello.txt"}`.
2. Utiliser `boto3` (en init hors handler).
3. Donner au rôle d'exécution `s3:GetObject` sur `src/*` et `s3:PutObject` sur `dst/*`.
4. Invoquer manuellement et vérifier.

**Livrable.** Code + commande de test + capture du résultat dans le bucket `dst`.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Lambda** et son modèle de facturation (invocations + GB-secondes).
- [ ] Positionner Lambda vs EC2 vs ECS Fargate vs AppRunner.
- [ ] Citer les **6 composants** d'une Lambda (code, handler, runtime, execution role, configuration, triggers).
- [ ] Expliquer la **relation RAM/CPU** sur Lambda (1 769 MB = 1 vCPU).
- [ ] Citer les **3 manières de fournir le code** (ZIP direct, ZIP via S3, image Docker) et leurs tailles max.
- [ ] Choisir la méthode adaptée pour : un script de 10 lignes ; une fonction ML avec pandas ; un pipeline CI/CD versionné.
- [ ] Décrire le format `<file>.<function>` du handler, et le différencier d'un runtime à l'autre.
- [ ] Écrire un handler Python avec signature `(event, context)`.
- [ ] Expliquer **pourquoi placer l'init hors du handler**.
- [ ] Décrire le **rôle d'exécution** : trust policy, permissions minimales pour les logs.
- [ ] Comment **invoquer une Lambda** depuis la CLI.
- [ ] Comment **lire les logs** d'une Lambda (`/aws/lambda/<name>`, `aws logs tail`).
- [ ] Décrire le concept de **version** et d'**alias** Lambda.

### Items du glossaire visés

**N1 atteint** :

- _3 manières de fournir du code à une lambda (zip, image docker, code source depuis un S3)_ — section 3.
- _configuration de l'entrypoint d'une lambda_ — section 4.

(Les autres N1 — les **manières de déclencher** une Lambda — sont l'objet de M5. Les **limitations / Layers** sont l'objet de M6.)

---

## 10. Ressources complémentaires

### Documentation AWS

- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [Lambda function handler in Python](https://docs.aws.amazon.com/lambda/latest/dg/python-handler.html)
- [Deploy Python Lambda functions with .zip files](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html)
- [Deploy Python Lambda functions with container images](https://docs.aws.amazon.com/lambda/latest/dg/python-image.html)
- [Lambda function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [Versions and aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html)

### Outils

- [AWS SAM (Serverless Application Model)](https://docs.aws.amazon.com/serverless-application-model/) — framework de packaging et déploiement Lambda.
- [AWS Lambda Powertools (Python / Node / Java)](https://docs.powertools.aws.dev/) — librairie de helpers (logging, tracing, validation).
- [Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) — outil pour trouver le sweet spot RAM/coût.

### Tarification

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- Réfléchir au calcul : `(invocations × prix_invocation) + (invocations × durée_sec × (RAM_MB/1024) × prix_GBs)`.

### Pour aller plus loin

- **M5 (Lambda — déclenchement)** — sources d'événements et forme du `event` selon la source.
- **M6 (Lambda — limitations et Layers)** — cold start, ressources, Layers pour mutualiser les deps.
- **M9 (Step Functions)** — orchestrer plusieurs Lambdas dans un workflow durable.
- **M10 (ECR)** — gestion du registry de containers pour les Lambdas image.
- **AWS Identity M3-M5** — Execution Role, assume role, permission boundary appliqués à Lambda.
