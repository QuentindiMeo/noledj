# M5 — Lambda, déclenchement

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer les **trois modes d'invocation** d'une Lambda — **synchrone**, **asynchrone** et **poll-based / event source mapping** — et leurs implications sur les retries, les erreurs et la scalabilité.
- Citer et décrire **au moins 5 sources d'événements** courantes (API Gateway, S3, EventBridge, SQS, DynamoDB Streams), savoir laquelle utilise quel mode d'invocation, et reconnaître la **forme du payload `event`** pour chacune.
- **Configurer trois Lambdas** avec trois déclencheurs différents : une API Gateway HTTP, une notification S3, un schedule EventBridge.
- Comprendre la mécanique des **resource-based policies** Lambda (permission donnée au service appelant : API Gateway, S3, EventBridge…) et utiliser `aws lambda add-permission`.
- Gérer les **erreurs** : retries automatiques selon la source, **Dead Letter Queue** (SQS / SNS), **Destinations on success / on failure**.
- Comprendre les notions de **batching** et de **visibility timeout** quand SQS / Kinesis / DynamoDB Streams sont sources.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M4 (Lambda fondamentaux : code, handler, packaging, rôle d'exécution).
- AWS CLI v2 configurée.
- Permissions IAM : `lambda:*`, `apigateway:*`, `s3:*`, `events:*`, `sqs:*`, `sns:*`, `iam:PassRole`.
- Avoir une Lambda fonctionnelle (réutilisable de M4) pour la connecter à plusieurs sources.

---

## 1. Pourquoi Lambda est-elle "event-driven"

### 1.1 — Le principe

Lambda **ne tourne pas en boucle**. Elle est **réveillée** par un **événement**, exécute son handler, retourne, et meurt (logiquement). Tout ce qui peut produire un événement structuré dans AWS peut, par conséquent, devenir une **source** de Lambda.

Cela inclut :

- **Une requête HTTP** entrante (via API Gateway, ALB, Function URL).
- **Une action sur une ressource AWS** (un fichier déposé dans S3, un message publié sur SNS, un record DynamoDB modifié).
- **Un événement temporel** (cron via EventBridge Scheduler).
- **Un signal sur un bus d'événements** (EventBridge rules, IoT topics).
- **Une queue / un stream à consommer** (SQS, Kinesis Data Streams, MSK Kafka, DynamoDB Streams).

> Plus de **140 services AWS** peuvent émettre vers une Lambda directement ou via EventBridge.

### 1.2 — L'analogie de la sonnette

Penser à une Lambda comme un **artisan disponible sur sonnette** :

- **API Gateway** = un visiteur appuie sur la sonnette (HTTP request). L'artisan **doit répondre immédiatement** au visiteur (mode synchrone).
- **S3 notification** = un colis est déposé dans la boîte aux lettres. Quelqu'un **glisse un mot** à l'artisan ("colis arrivé, à toi de jouer"), pas besoin d'attendre une réponse (mode asynchrone).
- **SQS poll** = un panier d'enveloppes à traiter. L'artisan **vient régulièrement piocher** dans le panier, vide ce qu'il peut, repart (mode poll).
- **EventBridge schedule** = un réveil programmé à 7 h chaque matin. L'artisan se lève, fait sa tâche, se recouche (mode asynchrone).

Ces trois modes — **synchrone**, **asynchrone**, **poll** — sont à connaître. Ils déterminent **les retries, la gestion d'erreurs et le scaling**.

### 1.3 — Anti-patterns avant d'attaquer

| Anti-pattern                                                                                      | Conséquence                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Connecter S3 directement à une Lambda **dans un compte différent** sans cross-account permission. | Échec d'invocation silencieux ou refusé.                                                              |
| Configurer un schedule **toutes les minutes** pour vérifier 200 ressources.                       | Coût + temps d'exécution potentiellement énorme. Préférer EventBridge Events sur signaux.             |
| Ne pas configurer de **DLQ** sur une Lambda async.                                                | Toute erreur après les 2 retries automatiques disparaît silencieusement.                              |
| Lambda qui **modifie le bucket S3 qui la déclenche**.                                             | Boucle infinie potentiellement coûteuse. Vérifier les filtres ou utiliser deux buckets distincts.     |
| Surcharger une Lambda derrière API Gateway avec un timeout de 30 s.                               | API Gateway timeout HTTP = 30 s strict (29 s en pratique). Au-delà, 504. Découper en async + polling. |

---

## 2. Les trois modes d'invocation

### 2.1 — Vue d'ensemble

| Mode                            | Qui appelle ?                              | Réponse attendue ? | Retries Lambda automatiques ?         | Scaling                                |
| ------------------------------- | ------------------------------------------ | ------------------ | ------------------------------------- | -------------------------------------- |
| **Synchrone**                   | API Gateway, ALB, Function URL, SDK direct | **Oui** (HTTP/SDK) | **Non** (à charge du caller)          | Concurrence simultanée jusqu'au quota. |
| **Asynchrone**                  | S3, SNS, EventBridge                       | Non                | **Oui** (2 retries par défaut)        | Idem.                                  |
| **Event Source Mapping** (poll) | SQS, Kinesis, DynamoDB Streams, MSK        | Non (poll-based)   | **Oui** (configurable, plus complexe) | Polling parallèle, configurable.       |

### 2.2 — Synchrone

Le caller appelle l'API `Invoke` (`InvocationType=RequestResponse`) ou passe par un service synchrone (API Gateway, ALB, Function URL) et **attend** la réponse.

```graphviz
        ┌──────────────┐
        │ Caller       │ ─── invoke (sync) ──► Lambda ──► réponse retournée
        └──────────────┘                                  │
                                                          ▼
                                                  Caller reçoit la réponse
```

**Implications** :

- Si la Lambda échoue, **l'erreur remonte au caller** (qui décide de retry ou pas).
- Pas de retries automatiques par Lambda.
- Mauvais choix pour des tâches > 15 minutes ou > 30 secondes (limite API Gateway).
- Bon choix pour : HTTP API REST, calculs synchrones, queries DB ponctuelles, intégrations bot-to-API.

### 2.3 — Asynchrone

Le caller dépose l'événement dans une **internal queue** managée par Lambda, et retourne **immédiatement**. Lambda dépile la queue et invoque la fonction en arrière-plan.

```graphviz
        ┌──────────────┐
        │ Caller (S3)  │ ─── invoke (async) ──► Lambda internal queue
        └──────────────┘
                                                     │
                                                     ▼
                                              Lambda invocation
                                                     │
                                                     ▼
                                       (succès / échec → destinations)
```

**Implications** :

- Lambda **retry automatiquement** 2 fois en cas d'erreur (configurable de 0 à 2).
- En cas d'échec définitif, l'événement va vers la **DLQ** ou les **Destinations on failure** si configurées — sinon **perdu**.
- Le caller **ne sait pas** si l'invocation a réussi.

### 2.4 — Event Source Mapping (poll)

Le **service Lambda** poll régulièrement la source (SQS, Kinesis, …) et **batch** les messages reçus avant d'invoquer la fonction.

```graphviz
        ┌──────────────┐
        │ SQS / Kinesis│ ◄─── poll ─── Lambda Event Source Mapping
        │ / DDB Streams│ ─── records ─►
        └──────────────┘                          │
                                                  ▼
                                            Lambda invocation
                                            (batch de N records)
```

**Implications** :

- Lambda gère le polling — pas besoin d'écrire de boucle.
- **Batching** : on reçoit plusieurs records en un seul appel (jusqu'à 10 000 pour SQS standard, configurable).
- En cas d'erreur :
  - **SQS** : les messages **restent en queue** (et reviennent après la **visibility timeout**) jusqu'à atteindre la limite de réception → DLQ SQS.
  - **Kinesis / DDB Streams** : la fonction **bloque** sur le batch problématique (un seul shard) jusqu'à expiration ou config "bisect on error".

### 2.5 — Conséquences pratiques

Pour chaque source qu'on configure, savoir **dans quel mode** elle est rangée évite des heures de debug :

| Source                                               | Mode                   |
| ---------------------------------------------------- | ---------------------- |
| API Gateway, ALB, Function URL                       | Synchrone              |
| SDK / CLI `invoke --invocation-type RequestResponse` | Synchrone              |
| SDK / CLI `invoke --invocation-type Event`           | Asynchrone             |
| S3 Event Notifications                               | Asynchrone             |
| SNS Topic                                            | Asynchrone             |
| EventBridge (rules + scheduler)                      | Asynchrone             |
| Step Functions tasks                                 | Synchrone (par défaut) |
| SQS (standard et FIFO)                               | Event source mapping   |
| Kinesis Data Streams                                 | Event source mapping   |
| DynamoDB Streams                                     | Event source mapping   |
| MSK / Kafka self-managed                             | Event source mapping   |
| Cognito triggers                                     | Synchrone              |

---

## 3. API Gateway → Lambda (synchrone)

### 3.1 — Pourquoi

Le cas le plus courant : exposer une **API REST ou HTTP** sans gérer de serveur. Le client HTTP appelle l'URL d'API Gateway → API Gateway invoque la Lambda → la réponse de la Lambda devient la réponse HTTP.

Deux variantes d'API Gateway :

| Variante          | Caractéristiques                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **HTTP API (v2)** | Plus récent, plus simple, **moins cher** (1 $/M de requêtes vs 3,5 $/M). Suffit pour 80 % des cas.             |
| **REST API (v1)** | Plus complet : usage plans, API keys, request validation, plus de transformations. Plus cher et plus complexe. |

Pour ce parcours, **HTTP API** sauf besoin spécifique.

Un troisième mode existe : **Function URLs** — Lambda gère elle-même une URL HTTPS sans passer par API Gateway. Plus simple encore, mais sans throttling, cache, ni transformations. Bon pour des POC et webhooks internes.

### 3.2 — Forme du `event` côté Lambda (HTTP API)

```json
{
  "version": "2.0",
  "routeKey": "GET /hello",
  "rawPath": "/hello",
  "rawQueryString": "name=noledj",
  "headers": {
    "host": "abc123.execute-api.eu-west-1.amazonaws.com",
    "user-agent": "curl/8.4.0",
    "x-forwarded-proto": "https"
  },
  "queryStringParameters": {
    "name": "noledj"
  },
  "requestContext": {
    "http": {
      "method": "GET",
      "path": "/hello",
      "sourceIp": "203.0.113.42"
    },
    "requestId": "abc-123",
    "stage": "$default",
    "time": "18/May/2026:14:00:00 +0000"
  },
  "body": null,
  "isBase64Encoded": false
}
```

Le code Python type :

```python
def lambda_handler(event, context):
    name = event.get("queryStringParameters", {}).get("name", "world")
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"hello": name})
    }
```

### 3.3 — Créer une HTTP API → Lambda — méthode CLI

```bash
LAMBDA_ARN=$(aws lambda get-function --function-name tp-m4-hello \
  --query 'Configuration.FunctionArn' --output text)

# 1. Créer l'HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name tp-m5-hello-api \
  --protocol-type HTTP \
  --target "$LAMBDA_ARN" \
  --query 'ApiId' --output text)

# 2. Autoriser API Gateway à invoquer la Lambda (resource-based policy)
aws lambda add-permission \
  --function-name tp-m4-hello \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:eu-west-1:ACCOUNT:${API_ID}/*/*/*"

# 3. URL générée par API Gateway
aws apigatewayv2 get-api --api-id "$API_ID" --query 'ApiEndpoint'

# 4. Tester
curl "https://${API_ID}.execute-api.eu-west-1.amazonaws.com/?name=noledj"
```

L'option `--target $LAMBDA_ARN` à la création crée automatiquement l'intégration et une route par défaut `$default`. Pour des routes nommées (par exemple `GET /users`), on utilise `create-route` + `create-integration`.

### 3.4 — Resource-based policy — l'élément structurant

Une Lambda peut être protégée par une **resource-based policy** (la "function policy") qui décide **qui peut l'invoquer**. C'est elle qu'on enrichit avec `aws lambda add-permission` à chaque fois qu'on ajoute une source.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "apigw-invoke",
      "Effect": "Allow",
      "Principal": { "Service": "apigateway.amazonaws.com" },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:tp-m4-hello",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:execute-api:eu-west-1:ACCOUNT:apiId/*/*/*"
        }
      }
    }
  ]
}
```

Sans la `Condition` `SourceArn`, **n'importe quelle API Gateway** du compte pourrait invoquer la Lambda — anti-pattern.

### 3.5 — Anti-patterns API Gateway → Lambda

| Anti-pattern                                  | Conséquence                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Timeout Lambda > 29 s.                        | API Gateway timeout HTTP = 29 s. Réponse 504 garantie.                               |
| Une seule Lambda pour 20 routes monolithique. | Cold start unique mais blast radius énorme. Préférer 1 Lambda / domaine fonctionnel. |
| Auth dans la Lambda elle-même.                | Préférer **JWT Authorizer** ou **Cognito Authorizer** au niveau API Gateway.         |
| Pas de **throttling**.                        | Un client agressif sature la Lambda et son quota concurrency.                        |
| Renvoyer du JSON sans `Content-Type`.         | Selon le client, parsing imprécis. Toujours déclarer.                                |

---

## 4. S3 → Lambda (asynchrone)

### 4.1 — Pourquoi

S3 envoie une **notification** vers Lambda chaque fois qu'un objet est créé, modifié ou supprimé selon un filtre configurable. Cas d'usage classiques :

- Génération de thumbnail d'image quand un upload arrive.
- Indexation de PDFs dans OpenSearch.
- Détection de fichiers sensibles (scan antivirus, classification).
- ETL léger : un fichier CSV uploadé → transformation → réécriture en Parquet.

### 4.2 — Forme du `event` côté Lambda

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "awsRegion": "eu-west-1",
      "eventTime": "2026-05-18T14:00:00.000Z",
      "eventName": "ObjectCreated:Put",
      "s3": {
        "bucket": {
          "name": "tp-uploads",
          "arn": "arn:aws:s3:::tp-uploads"
        },
        "object": {
          "key": "incoming/file.csv",
          "size": 1024,
          "eTag": "abc123…"
        }
      }
    }
  ]
}
```

Un event peut contenir **plusieurs records** si S3 a batché des notifications.

```python
import urllib.parse

def lambda_handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        # ... traitement
```

Important : la **clé est URL-encoded** dans l'event (les espaces deviennent `+`, etc.). Utiliser `unquote_plus`.

### 4.3 — Configurer la notification

```bash
LAMBDA_ARN=$(aws lambda get-function --function-name tp-m5-process-upload \
  --query 'Configuration.FunctionArn' --output text)

# 1. Autoriser S3 à invoquer la Lambda
aws lambda add-permission \
  --function-name tp-m5-process-upload \
  --statement-id s3-invoke \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::tp-uploads \
  --source-account ACCOUNT

# 2. Configurer la notification sur le bucket
cat > notification.json <<EOF
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "ProcessUpload",
      "LambdaFunctionArn": "$LAMBDA_ARN",
      "Events": ["s3:ObjectCreated:Put"],
      "Filter": {
        "Key": {
          "FilterRules": [
            { "Name": "prefix", "Value": "incoming/" },
            { "Name": "suffix", "Value": ".csv" }
          ]
        }
      }
    }
  ]
}
EOF

aws s3api put-bucket-notification-configuration \
  --bucket tp-uploads \
  --notification-configuration file://notification.json
```

Les **FilterRules** permettent de scoper finement : `prefix=incoming/` et `suffix=.csv` ⇒ la Lambda n'est appelée que pour les CSV uploadés sous `incoming/`.

### 4.4 — Comportement asynchrone

- S3 dépose l'event dans la queue interne Lambda et retourne immédiatement.
- Si la Lambda échoue, **Lambda retry 2 fois** (configurable de 0 à 2 via `MaximumRetryAttempts`).
- Après échec définitif → **DLQ** ou **Destinations on failure** si configurées.

Ce point est crucial : **si on ne configure ni DLQ ni Destination**, les erreurs sont **perdues**. À l'inverse, attention aux **side effects** des retries : si la Lambda écrit dans une autre table, un événement traité deux fois écrit deux fois. Idéalement, écrire **idempotent**.

### 4.5 — Anti-patterns S3 → Lambda

| Anti-pattern                                            | Conséquence                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Lambda qui écrit **dans le bucket source** sans filtre. | Boucle infinie : chaque écriture re-déclenche la Lambda.            |
| Pas de **dédoublonnage** dans la Lambda.                | Retries → opérations dupliquées. Stocker un état idempotency (DDB). |
| Filtre `suffix=.jpg` au lieu de `suffix=.JPG`.          | S3 est **case-sensitive**. Les majuscules ne matchent pas.          |
| Pas de **DLQ**.                                         | Échecs perdus silencieusement.                                      |
| Lambda à 128 MB pour traiter des images de 10 MB.       | OOM. Bumper la mémoire, valider sur des tailles réelles.            |

---

## 5. EventBridge → Lambda (asynchrone)

### 5.1 — Deux usages distincts

**EventBridge** est un service à deux facettes :

1. **EventBridge Scheduler** (et historiquement EventBridge Rules avec expression cron) — déclencher une Lambda à intervalles réguliers (cron / rate).
2. **EventBridge Rules** sur un bus d'événements — déclencher une Lambda quand un événement matche un pattern (par exemple "à chaque fois qu'une instance EC2 est terminée", "à chaque fois qu'une commande Stripe arrive via partner event source").

### 5.2 — Schedule (cron)

**Cas d'usage** :

- Job nocturne (purge, agrégation, backup).
- Reminder envoyé par mail tous les lundis.
- Polling d'un système externe sans webhook.
- Refresh de cache toutes les 10 minutes.

```bash
# Schedule "tous les jours à 02:00 UTC"
aws scheduler create-schedule \
  --name tp-m5-nightly-cleanup \
  --schedule-expression "cron(0 2 * * ? *)" \
  --target "{
    \"Arn\":\"$LAMBDA_ARN\",
    \"RoleArn\":\"arn:aws:iam::ACCOUNT:role/scheduler-exec-role\"
  }" \
  --flexible-time-window 'Mode=OFF'
```

**Formats** :

- `rate(5 minutes)`, `rate(1 hour)`, `rate(1 day)`.
- `cron(MIN HOUR DAY-OF-MONTH MONTH DAY-OF-WEEK YEAR)` — attention, le format AWS diffère légèrement du cron Unix (6 champs au lieu de 5, et `?` pour "indifférent").

EventBridge Scheduler **assume un rôle** pour invoquer la cible — d'où l'`--role-arn` (le rôle a `lambda:InvokeFunction` sur la Lambda cible).

### 5.3 — Forme du `event` côté Lambda — Schedule

Par défaut, l'event reçu est un dict avec les métadonnées Scheduler :

```json
{
  "scheduledTime": "2026-05-18T02:00:00Z",
  "version": "1.0",
  "executionId": "abc-123"
}
```

On peut surcharger via le champ `Input` du schedule : passer un JSON arbitraire que la Lambda reçoit en `event`.

### 5.4 — Rules sur événements AWS

Tous les services AWS publient sur le **default event bus** des événements quand des choses se passent : EC2 state changes, S3 PutBucketPolicy, IAM CreateRole, etc. On peut créer une **rule** qui filtre ces événements et invoque une Lambda quand le pattern matche.

```bash
# Détection : "à chaque fois qu'un Auto Scaling Group lance une EC2"
aws events put-rule \
  --name asg-launch-notify \
  --event-pattern '{
    "source": ["aws.autoscaling"],
    "detail-type": ["EC2 Instance Launch Successful"]
  }'

aws events put-targets \
  --rule asg-launch-notify \
  --targets "Id=1,Arn=$LAMBDA_ARN"

# Autoriser EventBridge à invoquer la Lambda
aws lambda add-permission \
  --function-name tp-m5-asg-notify \
  --statement-id eventbridge-invoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:eu-west-1:ACCOUNT:rule/asg-launch-notify
```

L'event reçu en Lambda :

```json
{
  "version": "0",
  "id": "abc",
  "detail-type": "EC2 Instance Launch Successful",
  "source": "aws.autoscaling",
  "account": "ACCOUNT",
  "time": "2026-05-18T14:00:00Z",
  "region": "eu-west-1",
  "resources": ["arn:aws:autoscaling:..."],
  "detail": {
    "AutoScalingGroupName": "asg-web",
    "EC2InstanceId": "i-0abc",
    "...": "..."
  }
}
```

### 5.5 — Cas d'usage classiques EventBridge Rules

- **Réaction à un événement IAM** : un nouvel utilisateur créé → envoie un mail.
- **Réaction à un upload Marketplace** : une AMI partagée → tag automatiquement.
- **Intégration partenaire (SaaS)** : Stripe → un event → une Lambda qui crée la commande.
- **Custom bus** : nos applis publient des events métier sur un bus dédié → plusieurs Lambdas s'abonnent.

### 5.6 — Anti-patterns EventBridge

| Anti-pattern                                                                                               | Conséquence                                           |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Cron très fréquent (1 minute) pour 10 000 ressources.                                                      | Coût + saturation rapide.                             |
| Rule pattern trop large (`source: aws.s3`).                                                                | Lambda invoquée pour **tout** événement S3 du compte. |
| Reformater l'event en post-traitement Lambda quand on pouvait le faire dans la rule **Input Transformer**. | Code Lambda bruité.                                   |
| Oublier le rôle scheduler.                                                                                 | Schedule créé mais ne tire rien.                      |

---

## 6. SQS → Lambda (event source mapping)

### 6.1 — Mécanique

SQS = queue de messages. Lambda **poll** la queue, batch les messages reçus, invoque la fonction avec le batch en `event`.

```graphviz
  Producer ── send-message ──► SQS Queue ◄── poll ── Lambda ESM
                                                        │
                                                        ▼
                                                    Lambda invocation
                                                    (batch up to N messages)
```

Trois paramètres essentiels :

| Paramètre                          | Description                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **BatchSize**                      | Nombre max de messages par invocation. Standard queue : 1-10 000. FIFO : 1-10.                                      |
| **MaximumBatchingWindowInSeconds** | Temps max d'attente pour remplir un batch (0 → invoque dès le premier message, 0-300).                              |
| **Visibility Timeout**             | Temps pendant lequel un message poll'é est invisible aux autres consumers (côté SQS). À **> 6× le timeout Lambda**. |

### 6.2 — Configurer l'event source mapping

```bash
QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# Le rôle d'exécution Lambda doit avoir : sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes
aws iam attach-role-policy --role-name lambda-basic-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole

# Créer l'event source mapping
aws lambda create-event-source-mapping \
  --function-name tp-m5-sqs-consumer \
  --event-source-arn $QUEUE_ARN \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5
```

### 6.3 — Forme du `event` côté Lambda

```json
{
  "Records": [
    {
      "messageId": "abc-123",
      "receiptHandle": "AQEB…",
      "body": "Hello world",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1716040000000",
        "SenderId": "AIDA...",
        "ApproximateFirstReceiveTimestamp": "1716040001000"
      },
      "messageAttributes": {},
      "md5OfBody": "...",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:eu-west-1:ACCOUNT:my-queue",
      "awsRegion": "eu-west-1"
    }
  ]
}
```

```python
def lambda_handler(event, context):
    success, failures = [], []
    for record in event["Records"]:
        try:
            process(record["body"])
            success.append(record["messageId"])
        except Exception:
            failures.append(record["messageId"])

    # Partial Batch Response : si certains échouent, dire à Lambda lesquels
    return {"batchItemFailures": [{"itemIdentifier": mid} for mid in failures]}
```

### 6.4 — Partial Batch Response — le pattern essentiel

Sans `batchItemFailures`, **un seul échec dans le batch** fait revenir **tout le batch** en queue (donc les messages réussis sont retraités → side effects). Avec `batchItemFailures`, Lambda ne renvoie en queue **que** les messages explicitement échoués.

À activer dans la config de l'ESM :

```bash
aws lambda update-event-source-mapping \
  --uuid <ESM_UUID> \
  --function-response-types ReportBatchItemFailures
```

### 6.5 — Visibility timeout et retries

Quand Lambda poll un message, le message devient invisible aux autres consumers pendant la **visibility timeout** de la queue. Si la Lambda finit avec succès, le message est **supprimé**. Si elle échoue (ou ne répond pas), le message **redevient visible** et sera repoll'é.

**Règle d'or** : `visibility_timeout >= 6 × Lambda timeout`. Sinon, Lambda finit après que le message est redevenu visible, ce qui mène à des doubles invocations.

Si le compteur **ApproximateReceiveCount** dépasse `MaxReceiveCount` sur la queue → le message va dans la **DLQ** configurée sur SQS (pas sur Lambda).

### 6.6 — Anti-patterns SQS → Lambda

| Anti-pattern                                         | Conséquence                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Visibility timeout < timeout Lambda.                 | Messages re-traités plusieurs fois.                                                        |
| Pas de **DLQ SQS**.                                  | Messages buggés tournent en boucle (économique tant que ça reste limité, mais bruit logs). |
| Pas de **Partial Batch Response**.                   | Tout le batch retraité en cas d'un seul échec.                                             |
| BatchSize trop grand (1000) sur un traitement lourd. | Timeout Lambda atteint, batch entier perdu.                                                |
| Lambda non idempotente.                              | Retries SQS → doublons.                                                                    |

---

## 7. Autres sources — panorama rapide

| Source                                    | Mode                 | Cas d'usage                                                              |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| **SNS**                                   | Asynchrone           | Fan-out d'un message vers plusieurs Lambdas / endpoints.                 |
| **Kinesis Data Streams**                  | Event source mapping | Ingestion de millions d'événements/s, ordering par shard.                |
| **DynamoDB Streams**                      | Event source mapping | Réagir aux changements d'une table DDB (CDC).                            |
| **MSK / Self-managed Kafka**              | Event source mapping | Consommer un topic Kafka sans gérer de consumer.                         |
| **Application Load Balancer (ALB)**       | Synchrone            | Alternative à API Gateway, surtout pour intégration dans une VPC privée. |
| **Cognito triggers**                      | Synchrone            | Custom logic à l'inscription, login, password change (pre/post hooks).   |
| **IoT Core**                              | Asynchrone           | Réagir à un message MQTT.                                                |
| **CloudFront Lambda@Edge / Functions**    | Synchrone            | Modifier requêtes/réponses au plus près du visiteur.                     |
| **CodeCommit / CodeBuild / CodePipeline** | Asynchrone           | Réagir à un push / build / step.                                         |
| **Lex / Connect / SES**                   | Synchrone            | Bots vocaux / chat, voix, traitement email.                              |

EventBridge sert souvent de **point d'entrée commun** pour les sources non-natives — beaucoup de SaaS publient sur des Partner Event Sources (Stripe, Datadog, etc.), et on s'abonne via une rule.

---

## 8. Erreurs, retries, DLQ, Destinations

### 8.1 — Synchrone

- L'erreur **remonte au caller**. Le caller décide quoi faire (retry, alarme, etc.).
- Lambda ne retry **pas**.

### 8.2 — Asynchrone

- 2 retries automatiques (configurable de 0 à 2) avec un délai exponentiel.
- Au terme : **destination on failure** (recommandé) ou **DLQ** (héritée, fonctionne encore).

**Destinations** (mode moderne) :

```bash
aws lambda put-function-event-invoke-config \
  --function-name tp-m5-process-upload \
  --maximum-retry-attempts 2 \
  --destination-config '{
    "OnSuccess": {"Destination":"arn:aws:sqs:eu-west-1:ACCOUNT:success-queue"},
    "OnFailure": {"Destination":"arn:aws:sqs:eu-west-1:ACCOUNT:failure-queue"}
  }'
```

Le payload envoyé à la destination contient l'event original + le **résultat** ou **l'erreur** — utile pour debug et replay.

**DLQ classique** (legacy, mais toujours valide) : SQS ou SNS désignée comme cible des messages morts :

```bash
aws lambda update-function-configuration \
  --function-name tp-m5-process-upload \
  --dead-letter-config TargetArn=arn:aws:sqs:eu-west-1:ACCOUNT:dlq
```

### 8.3 — Event Source Mapping (SQS, Kinesis, DDB Streams)

- **SQS** : visibility timeout + redrive policy + DLQ SQS. Configuration **sur la queue**, pas sur Lambda.
- **Kinesis / DDB Streams** : "bisect on error" pour diviser un batch buggé en deux, retry, et finalement skip un record problématique après N tentatives. Possibilité d'envoyer le batch problématique vers une DLQ (SNS / SQS).

### 8.4 — Patterns d'idempotence

Quand on accepte que les retries peuvent dupliquer les invocations, écrire **idempotent** :

- Identifier chaque invocation par un `idempotency_key` (par exemple le SQS `messageId` ou le S3 `eventTime + key`).
- Avant d'appliquer un effet de bord (écriture DB, envoi mail), **vérifier** que la clé n'a pas déjà été traitée.
- AWS Lambda Powertools propose un module `idempotency` qui stocke les clés dans DynamoDB.

---

## 9. Exercices pratiques

### Exercice 1 — Lambda derrière API Gateway HTTP (≈ 45 min)

**Objectif.** Le premier des 3 déclencheurs cibles (N1 explicite).

**Étapes :**

1. Réutiliser `tp-m4-hello` (M4).
2. Créer une HTTP API qui pointe vers cette Lambda.
3. Ajouter la permission `apigateway.amazonaws.com` sur la Lambda.
4. Appeler l'URL avec `curl` avec et sans `?name=`.
5. Inspecter le `event` reçu via les logs CloudWatch.

**Livrable.** Capture `curl` + extrait du log montrant le `event` reçu.

### Exercice 2 — Lambda déclenchée par S3 (≈ 45 min)

**Objectif.** 2e déclencheur — asynchrone S3.

**Étapes :**

1. Créer un bucket `tp-m5-uploads-<initials>`.
2. Créer une Lambda `tp-m5-on-upload` qui logge `bucket` et `key` du record et écrit un objet `meta/{key}.json` dans le **même** bucket sous un préfixe distinct (pour éviter la boucle).
3. Configurer la notification `s3:ObjectCreated:Put` avec `prefix=incoming/` et `suffix=.txt`.
4. Ajouter la permission `s3.amazonaws.com` sur la Lambda.
5. Uploader `incoming/hello.txt`, vérifier la création de `meta/incoming/hello.txt.json`.
6. Tester le filtre : uploader `incoming/hello.csv` — la Lambda **ne doit pas** s'exécuter.

**Livrable.** Capture des objets dans le bucket + extrait du log.

### Exercice 3 — Lambda déclenchée par EventBridge schedule (≈ 30 min)

**Objectif.** 3e déclencheur cible — schedule.

**Étapes :**

1. Créer une Lambda `tp-m5-heartbeat` qui log "Beat @ {timestamp}".
2. Créer un rôle `scheduler-exec-role` avec `lambda:InvokeFunction` sur la cible.
3. Créer un schedule EventBridge Scheduler à `rate(2 minutes)`.
4. Attendre 10 minutes, vérifier 5 invocations dans le log.
5. Supprimer le schedule.

**Livrable.** Capture du log + commande de suppression.

### Exercice 4 — Lambda consumer SQS avec Partial Batch Response (≈ 60 min)

**Objectif.** Maîtriser l'event source mapping.

**Étapes :**

1. Créer une queue SQS standard `tp-m5-jobs` (visibility timeout = 60 s).
2. Créer une Lambda `tp-m5-sqs-consumer` (timeout = 10 s, mémoire = 256 MB) qui :
   - Pour chaque record, si `body` commence par `FAIL`, lève une exception.
   - Sinon log et succès.
   - Retourne un `batchItemFailures` avec les `messageId` échoués.
3. Activer **ReportBatchItemFailures** dans l'ESM.
4. Configurer une DLQ SQS (redrive policy avec maxReceiveCount=3).
5. Envoyer 10 messages : 7 normaux, 3 `FAIL`.
6. Observer que les 7 sont consommés une seule fois, et que les 3 atterrissent en DLQ après 3 tentatives.

**Livrable.** Commandes + capture des deux queues (main et DLQ).

### Exercice 5 — Configurer Destinations on success / on failure (≈ 30 min)

**Objectif.** Comprendre les Destinations.

**Étapes :**

1. Reprendre la Lambda de l'exercice 2 (S3).
2. Créer deux queues SQS : `tp-m5-on-success` et `tp-m5-on-failure`.
3. Configurer la Lambda avec `MaximumRetryAttempts=2` et destinations sur les deux queues.
4. Faire upload un fichier qui passe → vérifier message dans `on-success`.
5. Casser la Lambda intentionnellement (raise inconditionnel), upload → vérifier message dans `on-failure` après 2 retries.

**Livrable.** Captures des messages des deux queues + une phrase sur la différence vs DLQ classique.

### Mini-défi — Pipeline événementiel (≈ 90 min)

**Cas.** Construire un mini pipeline :

- Un upload S3 (`incoming/`) déclenche `tp-m5-classify` qui :
  - Lit le fichier.
  - Si c'est un `.csv` → publie un message dans `to-process` (SQS).
  - Si c'est un `.json` → publie un message dans `to-archive` (SQS).
- `tp-m5-process-csv` consomme `to-process` (ESM, batch 5) et copie le fichier en `processed/`.
- `tp-m5-archive-json` consomme `to-archive` (ESM, batch 10) et copie le fichier en `archive/` + compression simple.
- Configurer une DLQ pour chacune.

**Livrable.** Schéma + 3 codes Lambda + commandes de wiring.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **3 modes d'invocation** (synchrone, asynchrone, event source mapping) et identifier chaque source à son mode.
- [ ] Citer **5 sources d'événements** courantes (API Gateway, S3, EventBridge, SQS, DynamoDB Streams).
- [ ] Décrire la forme du **`event` API Gateway** (`queryStringParameters`, `headers`, `body`).
- [ ] Décrire la forme du **`event` S3** (`Records[].s3.bucket.name`, `Records[].s3.object.key` URL-encoded).
- [ ] Décrire la forme du **`event` SQS** (`Records[].body`, `messageId`, `receiptHandle`).
- [ ] Décrire la forme d'un **event EventBridge** (`source`, `detail-type`, `detail`).
- [ ] Expliquer ce qu'est une **resource-based policy** Lambda et pourquoi on ajoute `add-permission` par source.
- [ ] Distinguer **HTTP API** et **REST API** (cost, complexity).
- [ ] Expliquer **DLQ vs Destinations on failure** (legacy vs moderne).
- [ ] Régler **visibility timeout** SQS vs Lambda timeout.
- [ ] Implémenter **Partial Batch Response** et expliquer pourquoi.
- [ ] Citer **3 anti-patterns** de chaque source.

### Items du glossaire visés

**N1 atteint** :

- _au moins 3 manières de déclencher une lambda_ — sections 3 (API Gateway), 4 (S3), 5 (EventBridge), 6 (SQS) — quatre couvertes, plus le panorama section 7.

---

## 11. Ressources complémentaires

### Documentation AWS

- [Lambda invocation models](https://docs.aws.amazon.com/lambda/latest/dg/lambda-invocation.html)
- [API Gateway → Lambda (HTTP API)](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html)
- [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html)
- [EventBridge Rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rules.html)
- [Using Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
- [Asynchronous invocation — destinations](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html)
- [Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)

### Outils

- [AWS Lambda Powertools — Idempotency](https://docs.powertools.aws.dev/lambda/python/latest/utilities/idempotency/)
- [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli.html) — packager API Gateway + Lambda en un seul template.

### Schémas d'événements

- [Lambda event source examples](https://docs.aws.amazon.com/lambda/latest/dg/lambda-services.html) — formes JSON pour chaque source.
- [EventBridge schema registry](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schema.html) — registre des schémas pour générer des bindings code.

### Pour aller plus loin

- **M6 (Lambda limitations et Layers)** — cold start, timeout, mémoire, partages de code par Layer.
- **M9 (Step Functions)** — orchestration de plusieurs Lambdas plutôt que chaînage par event.
- **AWS Identity M5** — assume role et cross-account permissions (Lambda dans le compte A, S3 dans le compte B).
- **AWS Analytics M1** — CloudWatch Logs Insights pour analyser les logs Lambda à l'échelle.
