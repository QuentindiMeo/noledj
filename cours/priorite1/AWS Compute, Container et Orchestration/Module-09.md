# M9 — Step Functions

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Step Functions** : service managé d'**orchestration** de workflows distribués via une **state machine** déclarative (ASL — Amazon States Language).
- Distinguer **Standard Workflows** (durables, jusqu'à 1 an) et **Express Workflows** (haute fréquence, 5 minutes max).
- Citer et configurer les **états principaux** (item N2 explicite) : **Task**, **Pass**, **Choice**, **Wait**, **Parallel**, **Map**, **Succeed**, **Fail**.
- Comprendre **l'intérêt des Lambdas dans un Step** (item N2 explicite) : pourquoi Lambda et Step Functions sont conçus l'un pour l'autre, vs un orchestrateur maison.
- Utiliser les **intégrations natives** (200+ services AWS) pour invoquer DynamoDB / SNS / SQS / ECS / Batch / EventBridge / Lambda directement sans Lambda intermédiaire.
- Concevoir une **gestion d'erreurs robuste** via `Retry`, `Catch`, branches d'échec, et `Parallel` avec tolérance partielle.
- Construire un **workflow combinant 3 Lambdas** : extract → transform → load, avec Choice, Retry, et Parallel.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M4-M6 (Lambda : packaging, invoke, limites — Step orchestre principalement des Lambdas).
- M8 (Batch — Step peut aussi orchestrer Batch).
- AWS CLI v2 configurée.
- Permissions IAM : `states:*`, `lambda:InvokeFunction`, `iam:PassRole`, `logs:*`.
- (Optionnel) Stedi's Workflow Studio dans la console — utile pour prototyper visuellement.

---

## 1. Pourquoi Step Functions

### 1.1 — Le problème d'orchestration

À partir d'une certaine taille, un workload AWS implique **plusieurs services qui se passent la main** :

```md
1. Lambda A lit un fichier S3
2. Lambda B transforme
3. Lambda C écrit dans DynamoDB
4. SNS notifie
5. Si erreur, retry, sinon archive
```

Trois façons d'orchestrer ces étapes :

| Approche                        | Description                                                                             | Limites                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Chorégraphie (EventBridge)**  | Chaque Lambda publie un event, la suivante s'abonne au pattern.                         | Visibilité opérationnelle faible, pas de vue "workflow", retry et timeouts dispersés.   |
| **Orchestrateur maison Lambda** | Une "main Lambda" qui appelle les autres en synchrone.                                  | Limitée à 15 min, fragile, **double facturation** (main + sub), retry complexe à coder. |
| **Step Functions**              | State machine déclarative qui orchestre Lambdas, services AWS, retries, parallel, wait. | Apprentissage initial, coût propre, vendor lock-in.                                     |

Step Functions est conçu pour **résoudre la 3ᵉ approche** : visibilité graphique, retry/catch déclaratifs, intégrations natives, durabilité (état préservé entre les transitions).

### 1.2 — L'analogie du chef de chantier

Penser à Step Functions comme un **chef de chantier** :

- Il **ne soulève pas les briques** lui-même — il **coordonne** les corps de métier (Lambda, Batch, ECS).
- Il **a le plan** (la state machine) qui décrit l'ordre et les conditions.
- Il **note** où on en est, peut reprendre après une pause, retry une étape qui foire.
- Il fait des **parallèles** quand c'est sûr, attend avant la suivante.

Le chef de chantier n'est pas l'ouvrier — il **fait travailler** efficacement les autres.

### 1.3 — Trois cas d'usage canoniques

| Cas                                                                      | Pourquoi Step Functions                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Pipeline ETL** : extract → transform → load + retry + notif.           | Lisibilité, robustesse, observabilité.                                                   |
| **Workflow d'approbation humaine** : créer, attendre signature, valider. | Step Functions a un état `Task` qui peut **attendre des semaines** une callback humaine. |
| **Orchestration de microservices** : commande → paiement → expédition.   | Chaque étape un service, retry isolé par service, vue globale.                           |

### 1.4 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                       | Conséquence                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Step Functions pour **chaîner 2 Lambdas**.                         | Sur-engineering. Une Lambda qui appelle l'autre suffit.                               |
| Step Functions Standard pour **workflow ultra-rapide** (10 000/s). | Coût explose. **Express** ou EventBridge.                                             |
| **Logique métier dans la state machine**.                          | ASL n'est pas un langage de programmation. La logique va dans les Lambdas / services. |
| Workflows monstres (50+ états).                                    | Difficile à débugger, à modifier. Découper en sous-workflows ou repenser.             |
| Pas de `Retry` / `Catch`.                                          | Erreurs propagent, workflow planté, données partielles.                               |
| Boucle `Choice → Task → Choice` infinie sans guard.                | Workflow qui ne finit jamais — facturé jusqu'au timeout (1 an pour Standard).         |

---

## 2. AWS Step Functions — définition

### 2.1 — Ce qu'est Step Functions

> **AWS Step Functions** est un service de **workflow orchestration** : on définit une **state machine** en JSON (Amazon States Language, ASL), et AWS exécute la machine en gérant les transitions, les retries, les timeouts, l'état entre les étapes, et l'observabilité.

Quatre propriétés à retenir :

1. **Déclaratif** : on **décrit** ce qu'il faut faire (et dans quel ordre), pas comment.
2. **Stateful** : l'état du workflow (variables, résultat de chaque step) est **persisté par AWS**, pas par notre code.
3. **Durable** : un workflow Standard peut tourner **jusqu'à 1 an** sans aucun problème.
4. **Visualisable** : la console montre le **graphe d'exécution** en direct, chaque step coloré selon son statut.

### 2.2 — Standard vs Express

| Aspect                      | **Standard Workflows**                                | **Express Workflows**                                               |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| **Durée max**               | **1 an**.                                             | **5 minutes**.                                                      |
| **Garantie**                | **Exactly-once** — un workflow exécuté une fois.      | **At-least-once** — peut s'exécuter plusieurs fois en cas d'erreur. |
| **Throughput**              | ~2000 transitions/s par compte.                       | **100 000+** transitions/s.                                         |
| **Pricing**                 | Par **transition d'état** (~0,025 $/1000).            | Par **invocation + GB-seconde** (proche Lambda).                    |
| **Stockage des executions** | 90 jours, historique complet.                         | Pas conservé par défaut. Logger via CloudWatch.                     |
| **Cas d'usage**             | Workflows long-running, audit, finance, pipeline ETL. | API backend, ingestion event haute fréquence, streaming.            |

**Règle simple** :

- **Standard** par défaut pour les workflows métier critiques.
- **Express** pour les pipelines à très haut volume ou les API derrière Lambda.

### 2.3 — Schéma fonctionnel

```graphviz
   ┌─────────────────────────────────────────────────────────────┐
   │ State Machine (définition ASL en JSON)                      │
   │                                                             │
   │  Start ──► [State A : Task Lambda] ──► [State B : Choice]   │
   │                                             │               │
   │            ┌────────────────────────────────┤               │
   │            ▼                                ▼               │
   │       [State C : Wait 5 min]      [State D : Parallel]      │
   │            │                                │               │
   │            └────────────────────────────────┴──► End        │
   └─────────────────────────────────────────────────────────────┘

   À chaque transition :
   1. AWS persiste l'état actuel et le payload.
   2. Exécute l'action du state (invoque Lambda, attend, branche...).
   3. Récupère le résultat, le passe au state suivant.
```

---

## 3. Amazon States Language (ASL)

### 3.1 — Squelette minimal

Une state machine est un **JSON** avec une **clé `States`** contenant un dictionnaire d'états, et un **`StartAt`** qui désigne l'état initial :

```json
{
  "Comment": "Mon premier workflow",
  "StartAt": "GreetUser",
  "States": {
    "GreetUser": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "tp-m4-hello",
        "Payload.$": "$"
      },
      "ResultPath": "$.greeting",
      "End": true
    }
  }
}
```

Trois clés à toujours retenir :

- **`Type`** : nature de l'état (`Task`, `Choice`, `Wait`, `Parallel`, `Map`, `Pass`, `Succeed`, `Fail`).
- **`Next`** ou **`End: true`** : où aller après cet état.
- **`Resource`** ou **`Parameters`** : ce que l'état fait.

### 3.2 — Le flot de données — input, parameters, result, output

Chaque état reçoit un **input JSON**, exécute son action, retourne un **output JSON**. ASL offre 4 hooks pour transformer l'input/output :

``` txt
  Input ─► [InputPath] ─► [Parameters] ─► EXECUTE ─► [ResultPath] ─► [OutputPath] ─► Output
```

| Hook           | Rôle                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| **InputPath**  | Quel sous-objet de l'input on lit (par défaut `$` = tout).                       |
| **Parameters** | Construit le payload réellement envoyé à la ressource (avec `.$` pour les refs). |
| **ResultPath** | Où insérer le résultat dans l'input (par défaut écrase tout en `$`).             |
| **OutputPath** | Quel sous-objet on garde pour la suite (par défaut `$`).                         |

Exemple : une Lambda qui renvoie `{"sum": 42}` :

```json
{
  "Type": "Task",
  "Resource": "...",
  "Parameters": { "FunctionName": "compute-sum", "Payload.$": "$.numbers" },
  "ResultPath": "$.computeResult",
  "Next": "NextState"
}
```

Si l'input était `{"numbers":[1,2,3], "user":"alice"}`, l'output sera :

```json
{
  "numbers": [1, 2, 3],
  "user": "alice",
  "computeResult": {
    "sum": 42,
    "ExecutedVersion": "...",
    "Payload": { "sum": 42 }
  }
}
```

Cette gymnastique de paths est **l'aspect le plus piégeux** de l'ASL au début. Le **Workflow Studio** dans la console aide à les construire visuellement.

---

## 4. Les états principaux (item N2 explicite)

### 4.1 — `Task` — le travail effectif

> Un `Task` est un état qui **invoque une ressource externe** : Lambda, Batch, ECS, DynamoDB, SQS, SNS, ECS, EventBridge, etc.

```json
{
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {
    "FunctionName": "process-file",
    "Payload": { "key.$": "$.key" }
  },
  "TimeoutSeconds": 30,
  "Retry": [
    {
      "ErrorEquals": ["States.TaskFailed"],
      "IntervalSeconds": 2,
      "MaxAttempts": 3,
      "BackoffRate": 2.0
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "ErrorHandler"
    }
  ],
  "Next": "NextState"
}
```

**Trois modes d'invocation Lambda** dans un Task :

| Resource ARN                                      | Comportement                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `arn:aws:states:::lambda:invoke`                  | Synchrone, attend la réponse (mode recommandé).                                        |
| `arn:aws:states:::lambda:invoke.waitForTaskToken` | Pattern callback — la Lambda envoie un token et Step Functions attend qu'on le revoie. |
| `arn:aws:states:::lambda:invoke.sync`             | Synchrone court (legacy, moins utilisé).                                               |

### 4.2 — `Pass` — transformer sans rien faire

> Un `Pass` permet de **transformer** le payload sans appeler quoi que ce soit. Utile pour préparer le data pour l'état suivant.

```json
{
  "AddDefaults": {
    "Type": "Pass",
    "Parameters": {
      "user.$": "$.user",
      "language": "fr",
      "timestamp.$": "$$.State.EnteredTime"
    },
    "Next": "Process"
  }
}
```

Le `$$.State.EnteredTime` est une **context variable** AWS, qui expose des métadonnées du workflow (state name, execution name, etc.).

### 4.3 — `Choice` — branches conditionnelles

> Un `Choice` évalue une condition et **branche** vers un autre état.

```json
{
  "IsLargeFile": {
    "Type": "Choice",
    "Choices": [
      {
        "Variable": "$.size",
        "NumericGreaterThan": 1000000,
        "Next": "ProcessWithBatch"
      },
      {
        "Variable": "$.size",
        "NumericLessThanEquals": 1000000,
        "Next": "ProcessWithLambda"
      }
    ],
    "Default": "ProcessWithLambda"
  }
}
```

Opérateurs disponibles :

- `StringEquals`, `StringMatches`, `StringLessThan`, etc.
- `NumericEquals`, `NumericGreaterThan`, etc.
- `BooleanEquals`.
- `TimestampLessThan`, etc.
- `IsPresent`, `IsNull`, `IsString`, `IsNumeric`.
- `And`, `Or`, `Not` pour combiner.

### 4.4 — `Wait` — délai temporel

> Un `Wait` met le workflow **en pause** pendant un temps déterminé, **sans coût compute**.

```json
{
  "DelayBeforeRetry": {
    "Type": "Wait",
    "Seconds": 60,
    "Next": "RetryAction"
  }
}
```

Variantes :

- **`Seconds`** : nombre fixe (ex : 60).
- **`SecondsPath`** : nombre depuis le payload (`"$.retryDelay"`).
- **`Timestamp`** : `"2026-12-31T00:00:00Z"`.
- **`TimestampPath`** : depuis le payload.

**Cas d'usage** :

- Retry exponentiel manuel ("attends 1 min, retry").
- Workflow planifié à terme ("dans 7 jours, déclenche l'archivage").
- Cooldown après échec.
- Polling externe : "attends 30 s puis check si le système externe a fini".

**Limite** : un Wait peut aller **jusqu'à 1 an** (limite Standard). Express : 5 min max.

### 4.5 — `Parallel` — branches simultanées

> Un `Parallel` lance **plusieurs branches** simultanément, attend que **toutes** finissent, puis combine les résultats.

```json
{
  "FanOut": {
    "Type": "Parallel",
    "Branches": [
      {
        "StartAt": "NotifySlack",
        "States": {
          "NotifySlack": {
            "Type": "Task",
            "Resource": "arn:aws:states:::sns:publish",
            "Parameters": { "TopicArn": "arn:aws:sns:...", "Message.$": "$.msg" },
            "End": true
          }
        }
      },
      {
        "StartAt": "StoreInDB",
        "States": {
          "StoreInDB": {
            "Type": "Task",
            "Resource": "arn:aws:states:::dynamodb:putItem",
            "Parameters": { "TableName": "events", "Item": {...} },
            "End": true
          }
        }
      }
    ],
    "Next": "Done"
  }
}
```

Le résultat d'un `Parallel` est un **tableau** : chaque élément est l'output de la branche correspondante.

**Cas d'usage** :

- Notifier Slack **et** écrire en DB en même temps.
- Lancer 4 transformations indépendantes sur le même input.
- Fan-out avec join automatique.

### 4.6 — `Map` — itérer sur une liste

> Un `Map` exécute des sous-étapes **pour chaque élément** d'un tableau d'entrée, en parallèle (max 40 par défaut).

```json
{
  "ProcessFiles": {
    "Type": "Map",
    "ItemsPath": "$.files",
    "MaxConcurrency": 10,
    "Iterator": {
      "StartAt": "ProcessOne",
      "States": {
        "ProcessOne": {
          "Type": "Task",
          "Resource": "arn:aws:states:::lambda:invoke",
          "Parameters": {
            "FunctionName": "process-file",
            "Payload.$": "$"
          },
          "End": true
        }
      }
    },
    "ResultPath": "$.results",
    "Next": "Aggregate"
  }
}
```

Si l'input est `{"files":["a.csv","b.csv","c.csv"]}`, le Map invoque `ProcessOne` 3 fois, en parallèle (jusqu'à `MaxConcurrency=10`). Le résultat est un tableau de 3 outputs.

**Variante "Distributed Map"** (introduite en 2022) :

- Permet d'itérer sur **des millions d'items** (chargés depuis S3 par exemple).
- Concurrence jusqu'à **10 000** en parallèle.
- Tolérance aux pannes par chunk.

Excellent pour des workflows ETL massifs (équivalent d'un array job Batch, mais avec orchestration sophistiquée).

### 4.7 — `Succeed` et `Fail` — états terminaux

```json
{
  "Done": { "Type": "Succeed" },

  "OutOfBudget": {
    "Type": "Fail",
    "Error": "BudgetExceeded",
    "Cause": "Monthly budget consumed before EOM."
  }
}
```

- `Succeed` : le workflow se termine en succès, l'output est l'input courant.
- `Fail` : termine en échec, expose `Error` et `Cause` à l'extérieur (CloudWatch, EventBridge, etc.).

---

## 5. L'intérêt des Lambdas dans Step (item N2 explicite)

### 5.1 — Pourquoi Lambda et Step se marient bien

> **Lambda fait le calcul ; Step Functions fait le flow.** Cette division du travail simplifie chaque composant.

Quatre raisons spécifiques :

| Raison                        | Sans Step Functions                                                             | Avec Step Functions                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Découper > 15 min**         | Une Lambda monolithique qui touche au timeout.                                  | Chaîne de Lambdas courtes orchestrées, durée totale illimitée (Standard). |
| **Retry sophistiqué**         | Code manuel `try/except` + sleep + état partagé en DB.                          | `Retry` déclaratif (`IntervalSeconds`, `BackoffRate`, par type d'erreur). |
| **Branches conditionnelles**  | Logique en début de Lambda qui appelle d'autres Lambdas en synchrone (coûteux). | `Choice` natif, branchement gratuit.                                      |
| **Visibilité opérationnelle** | Logs CloudWatch éparpillés, debugging à la main.                                | Graphe coloré en direct, replay possible, observation par exécution.      |

### 5.2 — Pattern "Lambda comme building block"

La pratique recommandée :

1. Chaque Lambda = **une responsabilité unique** (lire un fichier, valider, transformer un format, écrire en DB).
2. **Inputs / outputs JSON propres**.
3. **Stateless** — pas de variables globales partagées entre Lambdas.
4. **Errors typées** — la Lambda raise des exceptions avec des noms identifiables (`InvalidFormatError`, `DatabaseUnavailableError`) que Step peut catch sélectivement.

Step Functions devient alors le **vrai orchestrateur**, pas une couche au-dessus d'un autre orchestrateur.

### 5.3 — vs orchestrateur Lambda maison

Une Lambda "main" qui appelle d'autres Lambdas en synchrone (`boto3.client('lambda').invoke(...)`) :

- ✅ Simple à comprendre au début.
- ❌ Limitée à 15 min totale.
- ❌ Double facturation (la "main" tourne pendant que les "sub" tournent).
- ❌ Retry, conditions et états manuels.
- ❌ Pas de vue graphique du flow.
- ❌ Pas de durabilité — si la main crashe, tout l'état est perdu.

Step Functions **élimine** ces 5 dernières lignes.

### 5.4 — vs orchestrateur EventBridge (chorégraphie)

Chorégraphie EventBridge : Lambda A publie un event "FilProcessed", Lambda B est triggered par ce pattern, etc.

- ✅ Très scalable.
- ✅ Pas d'orchestrateur central.
- ❌ Pas de vue d'ensemble du flow.
- ❌ Retry et timeouts en silos (chaque Lambda gère pour soi).
- ❌ Difficile de répondre à "où en est l'execution X ?".

Choix typique :

- Workflows **métier** (lisibilité critique) → Step Functions.
- Pipeline **infra haute fréquence** (chacun fait sa part) → EventBridge / chorégraphie.

---

## 6. Intégrations natives — au-delà de Lambda

### 6.1 — Optimized integrations

Step Functions peut invoquer **directement** plus de 200 services AWS, sans passer par une Lambda intermédiaire :

| Resource ARN                                  | Cible                                        |
| --------------------------------------------- | -------------------------------------------- |
| `arn:aws:states:::dynamodb:putItem`           | Écrire un item dans DDB.                     |
| `arn:aws:states:::dynamodb:getItem`           | Lire un item.                                |
| `arn:aws:states:::sns:publish`                | Publier sur un topic SNS.                    |
| `arn:aws:states:::sqs:sendMessage`            | Envoyer un message SQS.                      |
| `arn:aws:states:::ecs:runTask.sync`           | Lancer une tâche ECS (sync : attend la fin). |
| `arn:aws:states:::batch:submitJob.sync`       | Soumettre un job Batch et attendre.          |
| `arn:aws:states:::events:putEvents`           | Publier sur EventBridge.                     |
| `arn:aws:states:::glue:startJobRun.sync`      | Lancer un job Glue ETL et attendre.          |
| `arn:aws:states:::athena:startQueryExecution` | Lancer une query Athena.                     |
| `arn:aws:states:::states:startExecution.sync` | Sous-workflow Step Functions.                |

Pattern recommandé : **évitez de wrapper un appel SDK dans une Lambda inutile**. Si l'étape "écrire un item DDB" peut être faite par l'intégration native, on économise une Lambda (coût, cold start, maintenance).

### 6.2 — AWS SDK integrations

Depuis 2021, Step Functions supporte **n'importe quel appel SDK AWS** :

```json
{
  "Type": "Task",
  "Resource": "arn:aws:states:::aws-sdk:s3:listObjectsV2",
  "Parameters": { "Bucket": "my-bucket", "Prefix": "data/" }
}
```

L'URL `aws-sdk:<service>:<action>` couvre presque toute la surface de l'API AWS. Permet de réduire drastiquement le code Lambda "glue".

### 6.3 — Callback pattern — `waitForTaskToken`

Pour des tâches **asynchrones longues** (envoyer un mail d'approbation, attendre une signature de contrat, attendre la fin d'un job externe) :

```json
{
  "RequestApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
    "Parameters": {
      "FunctionName": "send-approval-email",
      "Payload": {
        "user.$": "$.user",
        "token.$": "$$.Task.Token"
      }
    },
    "TimeoutSeconds": 604800,
    "Next": "Approved"
  }
}
```

Le Lambda reçoit un `token` qu'il transmet ailleurs (email avec un bouton). Quand l'utilisateur clique, le système callback appelle :

```bash
aws stepfunctions send-task-success \
  --task-token "$TOKEN" \
  --output '{"approved":true}'
```

Step Functions reprend alors le workflow. Le `Wait` peut durer **1 an**.

---

## 7. Erreurs, retries, catch

### 7.1 — `Retry` — relance automatique

```json
{
  "Type": "Task",
  "Resource": "...",
  "Retry": [
    {
      "ErrorEquals": [
        "Lambda.ServiceException",
        "Lambda.AWSLambdaException",
        "Lambda.SdkClientException"
      ],
      "IntervalSeconds": 2,
      "MaxAttempts": 6,
      "BackoffRate": 2
    },
    {
      "ErrorEquals": ["Lambda.TooManyRequestsException"],
      "IntervalSeconds": 1,
      "MaxAttempts": 3,
      "BackoffRate": 2
    }
  ]
}
```

Le retry est **ordonné** : Step Functions essaie le **premier matcher**. Avec `BackoffRate=2` et `IntervalSeconds=2`, les délais sont 2, 4, 8, 16, 32, 64 secondes.

**Erreurs spéciales** :

- `"States.ALL"` : matche tout.
- `"States.Timeout"` : timeout `TimeoutSeconds`.
- `"States.TaskFailed"` : échec de la ressource.
- `"States.Permissions"` : pas d'autorisation IAM.
- `"States.DataLimitExceeded"` : payload > 256 KB.

### 7.2 — `Catch` — branche d'erreur

```json
{
  "Type": "Task",
  "Resource": "...",
  "Catch": [
    {
      "ErrorEquals": ["ValidationError"],
      "ResultPath": "$.error",
      "Next": "NotifyValidationFailure"
    },
    {
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "GenericErrorHandler"
    }
  ],
  "Next": "Continue"
}
```

`Catch` est évalué **après** `Retry` épuisé. Permet de **dérouter** vers un état d'erreur (notification, log, compensation).

Le pattern complet "Try / Retry / Catch" donne des workflows très robustes en quelques lignes de JSON.

### 7.3 — Erreurs personnalisées depuis une Lambda

Quand une Lambda lève une exception nommée :

```python
class ValidationError(Exception):
    pass

def lambda_handler(event, context):
    if not event.get("file"):
        raise ValidationError("file is required")
```

Step Functions reçoit l'erreur avec le nom de la classe : `"errorType": "ValidationError"`. On peut alors la catch précisément.

---

## 8. Construire et exécuter une state machine

### 8.1 — Créer une state machine

```bash
# 1. Rôle d'exécution pour Step Functions (assume role + permissions sur les cibles)
aws iam create-role --role-name sfn-exec-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"states.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

aws iam put-role-policy --role-name sfn-exec-role --policy-name InvokeLambdas \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":"lambda:InvokeFunction",
      "Resource":"arn:aws:lambda:eu-west-1:ACCOUNT:function:*"
    }]
  }'

# 2. Créer la state machine
aws stepfunctions create-state-machine \
  --name tp-m9-etl \
  --type STANDARD \
  --role-arn arn:aws:iam::ACCOUNT:role/sfn-exec-role \
  --definition file://state-machine.json
```

### 8.2 — Démarrer une exécution

```bash
EXEC_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:eu-west-1:ACCOUNT:stateMachine:tp-m9-etl \
  --name "run-$(date +%s)" \
  --input '{"key":"in/file.csv","size":150000}' \
  --query 'executionArn' --output text)

# Suivre l'état
aws stepfunctions describe-execution --execution-arn $EXEC_ARN

# Voir l'historique
aws stepfunctions get-execution-history --execution-arn $EXEC_ARN
```

Dans la console, on voit le **graphe en direct** : chaque état en jaune pendant l'exécution, vert si succès, rouge si échec, gris si non exécuté.

---

## 9. Anti-patterns transverses

| Anti-pattern                                             | Conséquence                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Step Functions pour orchestrer 2 Lambdas.                | Sur-engineering. Simplifier.                                                                 |
| Logique métier dans le JSON (calculs, parsing complexe). | ASL n'est pas un langage. Mettre la logique dans une Lambda.                                 |
| Payload > 256 KB entre états.                            | `States.DataLimitExceeded`. Stocker en S3 et passer juste la clé.                            |
| Pas de **tags**.                                         | Impossible de facturer / observer par projet.                                                |
| Workflows en production sans **`Catch`**.                | Erreurs propagent, données partielles.                                                       |
| Une Lambda dans un Task **pour faire un PutItem** DDB.   | Inutile. Utiliser `arn:aws:states:::dynamodb:putItem` direct.                                |
| Map sans **MaxConcurrency**.                             | Parallélisme à 40 par défaut. Pour 10 000 items, monter à plus, ou utiliser Distributed Map. |
| Express pour des workflows long-running.                 | Timeout à 5 min. Standard.                                                                   |
| Pas de **logs CloudWatch** activés.                      | Debug impossible en cas d'incident. Activer.                                                 |

---

## 10. Exercices pratiques

### Exercice 1 — Première state machine : Hello + Wait (≈ 30 min)

**Objectif.** Manipuler ASL minimal.

**Étapes :**

1. Créer un rôle `sfn-exec-role` avec permission `lambda:InvokeFunction` sur `tp-m4-hello`.
2. Définir une state machine avec :
   - Task : invoque `tp-m4-hello`.
   - Wait : 10 secondes.
   - Task : invoque encore `tp-m4-hello` (avec un nom différent dans le payload).
   - Succeed.
3. Créer la SM. Lancer une execution.
4. Observer la console (graphe en direct).
5. Récupérer l'historique via CLI.

**Livrable.** JSON de la SM + capture du graphe.

### Exercice 2 — Choice + branche d'erreur (≈ 45 min)

**Objectif.** Maîtriser `Choice` et `Catch`.

**Étapes :**

1. Lambda `tp-m9-validate` qui vérifie qu'un `event["size"]` existe et est un int positif. Sinon raise `ValidationError`.
2. Lambda `tp-m9-small-process` (pour size < 1000) et `tp-m9-big-process` (pour size ≥ 1000).
3. State machine :
   - `ValidateInput` (Task) → `Catch ValidationError` → `NotifyError` (SNS).
   - Sinon `IsBig` (Choice) → `BigProcess` ou `SmallProcess`.
4. Tester avec 3 inputs : `{}` (validation fail), `{"size": 500}`, `{"size": 5000}`.

**Livrable.** JSON SM + captures des 3 exécutions.

### Exercice 3 — Map sur une liste de fichiers (≈ 60 min)

**Objectif.** Maîtriser `Map`.

**Étapes :**

1. Lambda `tp-m9-process-file` qui prend `{"key":"..."}` et logge "processing {key}".
2. SM :
   - Pass qui injecte `{"files":["a.csv","b.csv","c.csv","d.csv","e.csv"]}`.
   - Map sur `$.files` avec `MaxConcurrency=2` qui invoque `tp-m9-process-file` pour chaque.
   - Succeed avec l'output agrégé.
3. Lancer une execution.
4. Observer le parallélisme dans le graphe (2 jobs en parallèle, files attente).

**Livrable.** JSON + capture du graphe.

### Exercice 4 — Parallel + intégration DynamoDB (≈ 60 min)

**Objectif.** Mixer Lambda et intégration native.

**Étapes :**

1. Créer une table DDB `tp-m9-events` (PK `id`).
2. SM avec :
   - Pass qui génère un `id` (UUID) et un `payload`.
   - Parallel à 2 branches :
     - Branche A : `dynamodb:putItem` directement (intégration native).
     - Branche B : Lambda `tp-m9-notify` qui logge.
   - Succeed avec l'output combiné.
3. Lancer, vérifier l'item dans DDB et le log de la Lambda.

**Livrable.** JSON + captures DDB + log.

### Exercice 5 — Workflow ETL complet avec 3 Lambdas (≈ 90 min)

**Objectif.** Le scenario central — workflow combinant 3 Lambdas (item N2 explicite).

**Cas.**

- `tp-m9-extract` : lit `s3://bucket/in/data.csv`, retourne `{"rows": [...]}`.
- `tp-m9-transform` : prend `{"rows": [...]}`, retourne `{"transformed": [...]}`.
- `tp-m9-load` : prend `{"transformed": [...]}`, écrit `s3://bucket/out/data.json`.

SM :

- Extract → Transform → Load → Succeed.
- Retry sur chaque Task (3 tentatives, backoff 2x sur erreurs transients).
- Catch global → `NotifyFailure` (SNS).

**Livrable.** Code des 3 Lambdas + JSON SM + capture d'exécution.

### Mini-défi — Workflow Distributed Map sur S3 (≈ 60 min)

**Objectif.** Tester Distributed Map.

**Cas.** Bucket S3 avec 1000 petits fichiers JSON.

SM :

- Distributed Map qui scanne le bucket via "ItemReader" S3.
- Pour chaque fichier, Lambda qui valide le JSON, retourne `{"valid": true/false}`.
- Agrégation finale : un report "1000 fichiers traités, X invalides".

**Livrable.** JSON + capture d'exécution + count des erreurs.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Step Functions** et son périmètre.
- [ ] Distinguer **Standard** et **Express** sur 4 axes.
- [ ] Citer les **8 types d'états** principaux (Task, Pass, Choice, Wait, Parallel, Map, Succeed, Fail).
- [ ] Décrire le **flot de données** ASL (InputPath, Parameters, ResultPath, OutputPath).
- [ ] Écrire un état `Task` qui invoque une Lambda avec retry et catch.
- [ ] Écrire un état `Choice` à 3 branches.
- [ ] Écrire un état `Wait` paramétrable depuis le payload.
- [ ] Distinguer `Parallel` (branches fixes) et `Map` (itération sur liste).
- [ ] Citer **4 raisons** pour lesquelles Lambda et Step Functions se marient bien.
- [ ] Citer **3 intégrations natives** non-Lambda (DynamoDB, SNS, ECS).
- [ ] Décrire le **pattern callback** (`waitForTaskToken`).
- [ ] Expliquer la **politique de Retry** (intervals, backoff rate, max attempts).
- [ ] Citer **3 anti-patterns** courants.

### Items du glossaire visés

**N2 atteint** :

- _avantage d'utiliser les lambdas par rapport à d'autres services dans une Step Function_ — section 5.
- _différentes actions de flux spécifiques à Step Function_ — section 4 (Map, Choice, Parallel, Wait, etc.).

**N3 amorcé** :

- _syntaxe JSON permettant de paramétrer l'exécution d'une tâche_ — section 3 (Parameters, ResultPath).
- _passage de paramètres à des instances ECS / Batch_ — intégrations natives en section 6.

---

## 12. Ressources complémentaires

### Documentation AWS

- [AWS Step Functions Developer Guide](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html)
- [Amazon States Language Spec](https://states-language.net/spec.html) — la référence ASL.
- [Workflow Studio (visual editor)](https://docs.aws.amazon.com/step-functions/latest/dg/workflow-studio.html)
- [Service integrations](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-service-integrations.html)
- [AWS SDK service integrations](https://docs.aws.amazon.com/step-functions/latest/dg/supported-services-awssdk.html)
- [Distributed Map state](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-asl-use-map-state-distributed.html)
- [Callback patterns (waitForTaskToken)](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html#connect-wait-token)

### Patterns et exemples

- [The Serverless Workflow Patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/saga-pattern.html) — Saga pattern, etc.
- [AWS Step Functions Workshop](https://catalog.workshops.aws/stepfunctions/en-US) — tutoriels guidés.
- [AWS Serverless Land](https://serverlessland.com/patterns?services=stepfunctions) — recettes par cas d'usage.

### Outils

- [AWS Toolkit for VS Code](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html) — validation ASL + rendu graphique local.
- [Statelint](https://github.com/awslabs/statelint) — lint pour ASL.

### Pour aller plus loin

- **M11-M12 (ECS)** — Step Functions peut orchestrer des tâches ECS (`ecs:runTask.sync`).
- **M8 (Batch)** — Step Functions peut soumettre et attendre des jobs Batch.
- **AWS Networking M7** — EventBridge, complémentaire pour la chorégraphie.
- **AWS Analytics M3-M6** — Glue / Athena workflows orchestrés par Step Functions.
