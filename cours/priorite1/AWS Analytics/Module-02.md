# M2 — CloudWatch Alerting

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **CloudWatch Metrics**, distinguer **métriques standards AWS** (gratuites) et **métriques custom** (payantes), comprendre les **dimensions** et **agrégations** (statistic).
- Définir une **CloudWatch Alarm** : ses 5 composants (metric, statistic, period, threshold, comparison) + actions associées (SNS, Auto Scaling, EC2).
- Distinguer les **3 états** d'une alarme : `OK`, `ALARM`, `INSUFFICIENT_DATA`.
- **Créer une alarme** sur une métrique standard via CLI et console.
- **Créer une alarme à partir des logs** via un **Metric Filter** (extraire une métrique d'un Log Group, puis poser une alarme).
- Configurer **SNS** pour recevoir des notifications par email / SMS / Slack.
- Reconnaître les **composite alarms** (combiner plusieurs alarmes via AND/OR) et l'**Anomaly Detection** (alarmes adaptatives).
- Mettre en place une **alerte concrète sur la latence** d'une Lambda ou d'un ALB.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (CloudWatch Logs).
- AWS CLI v2 avec permissions `cloudwatch:*`, `sns:*`, `logs:PutMetricFilter`.
- Une adresse email accessible pour les notifications.
- Idéalement : une Lambda ou un ALB déployé qui produit du trafic.

---

## 1. Pourquoi alerter

### 1.1 — La pyramide de l'observabilité

> **On n'opère pas ce qu'on ne voit pas.**

L'observabilité d'un système repose sur trois piliers :

1. **Logs** (M1) — événements détaillés, "qu'est-ce qui s'est passé ?".
2. **Metrics** (M2 — ce module) — mesures numériques continues, "comment va le système ?".
3. **Traces** (X-Ray, niveau 3) — parcours d'une requête à travers les services.

Sans **alerting**, les métriques sont **passives** : on les regarde quand on y pense. Avec alerting, le système **vous prévient** quand quelque chose dérape — même à 3 h du matin.

### 1.2 — Trois types d'alertes

| Type           | Exemple                               | Action attendue           |
| -------------- | ------------------------------------- | ------------------------- |
| **Symptôme**   | "Latence p99 > 1 s sur l'API"         | Investiguer immédiatement |
| **Cause**      | "CPU > 90 % sur EC2-prod-1"           | Diagnostic technique      |
| **Prédictive** | "Disque atteindra 100 % dans 3 jours" | Action préventive         |

Les **bonnes** alertes sont **symptômes** : on est alerté de ce que vit l'utilisateur, pas de chaque sous-système qui tousse.

### 1.3 — L'analogie de la voiture

Le tableau de bord d'une voiture n'affiche que **3-5 voyants critiques** (huile, température, batterie, frein à main, ceinture). Pas un voyant par sous-système.

Une voiture qui afficherait 50 voyants en permanence aurait des conducteurs qui **les ignorent tous**. C'est le piège de l'alerting AWS : trop d'alertes → personne ne les regarde → la vraie alerte se noie.

**Règle d'or** : **moins d'alertes, mais actionnables**.

---

## 2. CloudWatch Metrics — fondamentaux

### 2.1 — Qu'est-ce qu'une métrique

Une **métrique** est une **série temporelle** de valeurs numériques. Exemple : `CPUUtilization` de l'instance `i-abc123` → une valeur (en %) toutes les 1 ou 5 minutes.

Chaque métrique a :

- Un **namespace** (`AWS/EC2`, `AWS/Lambda`, custom).
- Un **nom** (`CPUUtilization`, `Duration`).
- Des **dimensions** (key=value qui qualifient la métrique : `InstanceId=i-abc123`).
- Un **timestamp** + une **valeur**.
- Une **unité** (Percent, Count, Milliseconds, Bytes…).

### 2.2 — Métriques standards AWS (gratuites)

Quasi tous les services AWS écrivent des métriques **automatiquement** dans CloudWatch :

| Service         | Métriques typiques                                                            |
| --------------- | ----------------------------------------------------------------------------- |
| **EC2**         | CPUUtilization, NetworkIn/Out, DiskReadOps, StatusCheckFailed.                |
| **Lambda**      | Invocations, Errors, Duration, Throttles, ConcurrentExecutions.               |
| **ALB / NLB**   | RequestCount, TargetResponseTime, HTTPCode_Target_5XX, ActiveConnectionCount. |
| **RDS**         | CPUUtilization, DatabaseConnections, ReadLatency, FreeStorageSpace.           |
| **DynamoDB**    | ConsumedReadCapacityUnits, ReadThrottleEvents, SuccessfulRequestLatency.      |
| **S3**          | NumberOfObjects, BucketSizeBytes (1×/jour), 4xxErrors, 5xxErrors.             |
| **CloudFront**  | Requests, BytesDownloaded, 4xxErrorRate, 5xxErrorRate.                        |
| **API Gateway** | Count, 4XXError, 5XXError, Latency, IntegrationLatency.                       |
| **SQS / SNS**   | NumberOfMessagesSent, ApproximateAgeOfOldestMessage.                          |

Ces métriques sont **gratuites** pour leur ingestion et leur lecture jusqu'à un certain volume. Au-delà : 0,30 $/million de DataPoints API calls.

### 2.3 — Métriques custom (payantes)

L'application peut publier ses **propres métriques** via `PutMetricData` :

```python
import boto3
cw = boto3.client("cloudwatch")
cw.put_metric_data(
    Namespace="MyApp/Production",
    MetricData=[{
        "MetricName": "OrdersProcessed",
        "Dimensions": [{"Name": "Region", "Value": "eu-west-1"}],
        "Value": 42,
        "Unit": "Count",
    }],
)
```

**Tarif** : 0,30 $/métrique/mois.

**Bonne pratique** : préférer **embedded metric format** (EMF) — la Lambda écrit des **JSON spéciaux** dans ses logs, CloudWatch extrait automatiquement les métriques. Pas d'API call, pas de latence.

### 2.4 — Dimensions et agrégations

Une métrique peut avoir **plusieurs dimensions** :

``` txt
Namespace : AWS/Lambda
MetricName : Duration
Dimensions :
  - FunctionName=notes-api
  - Resource=notes-api:LIVE
```

CloudWatch agrège selon les **statistics** :

| Statistic                    | Sens                                  |
| ---------------------------- | ------------------------------------- |
| `Sum`                        | Somme des valeurs (utile pour count). |
| `Average`                    | Moyenne.                              |
| `Minimum` / `Maximum`        | Min/Max sur la période.               |
| `SampleCount`                | Nombre de data points.                |
| `p50`, `p90`, `p99`, `p99.9` | Percentiles (latence).                |

Pour la **latence**, **toujours utiliser p95 / p99**, pas Average — la moyenne masque les outliers qui pourtant impactent les utilisateurs.

### 2.5 — Résolution des métriques

| Résolution                    | Détail                                                   |
| ----------------------------- | -------------------------------------------------------- |
| **Standard**                  | 1 datapoint / 60 s. Toutes les métriques AWS par défaut. |
| **High resolution**           | 1 datapoint / 1 s. Custom uniquement, payant.            |
| **Detailed monitoring** (EC2) | Datapoints toutes les minutes au lieu de 5 min, payant.  |

---

## 3. Anatomie d'une CloudWatch Alarm

### 3.1 — Les 5 composants

Une alarme évalue **une métrique** par rapport à un **seuil** sur une **période**, et déclenche **des actions**.

``` txt
ALARM si  <Statistic>(<Metric>) <ComparisonOperator> <Threshold>
          pour <EvaluationPeriods> sur <Period> secondes
```

| Composant              | Exemple                                       |
| ---------------------- | --------------------------------------------- |
| **Metric**             | `AWS/Lambda Duration`, FunctionName=notes-api |
| **Statistic**          | `p99`                                         |
| **Period**             | 60 secondes (la fenêtre d'agrégation)         |
| **Threshold**          | 1000 (millisecondes)                          |
| **ComparisonOperator** | `GreaterThanThreshold`                        |
| **EvaluationPeriods**  | 3 (3 périodes consécutives en dépassement)    |
| **DatapointsToAlarm**  | 3 sur 3 (M-of-N)                              |

Lecture : "Passer en ALARM si la latence p99 de notes-api dépasse 1000 ms pendant 3 minutes consécutives."

### 3.2 — Les 3 états

| État                  | Signification                                                                     |
| --------------------- | --------------------------------------------------------------------------------- |
| **OK**                | La métrique est sous le seuil.                                                    |
| **ALARM**             | La métrique a dépassé le seuil pendant `EvaluationPeriods`.                       |
| **INSUFFICIENT_DATA** | Pas assez de données pour évaluer (service ne tourne plus, métriques manquantes). |

Une alarme **change d'état** quand la condition est remplie. Les **actions** sont déclenchées **uniquement à chaque transition d'état**, pas en continu pendant qu'on reste en `ALARM`.

### 3.3 — Le piège `INSUFFICIENT_DATA`

C'est **le piège classique** : une Lambda qui n'est plus invoquée n'écrit plus de métriques → l'alarme `Errors > 0` ne se déclenche pas (pas de data points), elle passe en `INSUFFICIENT_DATA`. **Aucune notification**.

**Solution** : configurer **`TreatMissingData`** sur l'alarme :

- `missing` (défaut) : pas considéré comme alarme.
- `notBreaching` : considérer les data manquantes comme "OK".
- `breaching` : **considérer les data manquantes comme alarmes**.
- `ignore` : pas de transition d'état.

Pour des alarmes critiques (Lambda doit toujours répondre), choisir `breaching` ou poser une alarme séparée sur `Invocations = 0`.

### 3.4 — M-of-N — alarmes plus robustes

`DatapointsToAlarm` permet "M dépassements sur N périodes" :

- `EvaluationPeriods=5, DatapointsToAlarm=3` → "passer en alarme si 3 des 5 dernières périodes ont dépassé le seuil".

Pratique pour des **métriques bruyantes** où on veut éviter les faux positifs sur un spike isolé.

---

## 4. Créer une alarme — CLI

### 4.1 — Alarme simple sur une métrique standard

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "lambda-notes-api-high-latency" \
  --alarm-description "Latency p99 of notes-api > 1s" \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=notes-api \
  --statistic ExtendedStatistic --extended-statistic p99 \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:eu-west-1:ACCOUNT:ops-alerts \
  --ok-actions arn:aws:sns:eu-west-1:ACCOUNT:ops-alerts
```

`--extended-statistic` pour les percentiles. `--statistic` (Average, Sum, Min, Max) pour les standards.

### 4.2 — Alarme sur erreurs

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "lambda-notes-api-errors" \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=notes-api \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:eu-west-1:ACCOUNT:ops-alerts
```

→ Passe en ALARM dès qu'il y a 5 erreurs ou plus en 5 minutes.

### 4.3 — Alarme sur ALB latence

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "alb-prod-target-5xx" \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=app/my-alb/abc123 \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 5 \
  --datapoints-to-alarm 3 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:eu-west-1:ACCOUNT:ops-alerts
```

→ 3 minutes sur 5 avec plus de 10 erreurs 5xx.

### 4.4 — Lister et inspecter

```bash
aws cloudwatch describe-alarms --query 'MetricAlarms[].{Name:AlarmName, State:StateValue, Threshold:Threshold}'

aws cloudwatch describe-alarms-for-metric \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=notes-api
```

### 4.5 — Tester manuellement

```bash
# Forcer une alarme en ALARM (utile pour tester les notifications)
aws cloudwatch set-alarm-state \
  --alarm-name lambda-notes-api-high-latency \
  --state-value ALARM \
  --state-reason "Manual test"
```

Le SNS reçoit la notification → email arrive → on vérifie que tout fonctionne.

---

## 5. Alarmes à partir des logs — Metric Filter

C'est **un pattern central** : extraire une métrique depuis un **Log Group**, puis poser une alarme dessus.

### 5.1 — Le principe

Pas toujours les services AWS publient des métriques détaillées sur **tout** ce qui vous intéresse. Exemple :

- Une Lambda log `{"event": "payment_failed", "user_id": "..."}` → on veut **alerter** dès qu'il y a > 5 `payment_failed` en 10 min.
- AWS ne publie aucune métrique "payment_failed" — c'est applicatif.

**Solution** : un **Metric Filter** sur le Log Group transforme les logs matchant un pattern en **valeurs de métrique** dans CloudWatch Metrics. Ensuite, une alarme classique fait le reste.

### 5.2 — Créer un Metric Filter

```bash
aws logs put-metric-filter \
  --log-group-name /aws/lambda/notes-api \
  --filter-name payment-failed-counter \
  --filter-pattern '{ $.event = "payment_failed" }' \
  --metric-transformations \
      metricName=PaymentFailed,metricNamespace=NotesApp/Custom,metricValue=1,defaultValue=0
```

**Effet** : à chaque event matchant `{$.event = "payment_failed"}` dans le Log Group, CloudWatch incrémente la métrique custom `NotesApp/Custom.PaymentFailed` de 1.

### 5.3 — Poser une alarme dessus

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "payment-failed-spike" \
  --namespace NotesApp/Custom \
  --metric-name PaymentFailed \
  --statistic Sum \
  --period 600 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:eu-west-1:ACCOUNT:ops-alerts
```

→ Si > 5 paiements échoués en 10 min : alerte.

### 5.4 — Extraire une valeur depuis le log

On peut **extraire une valeur numérique** depuis le log, pas seulement compter :

```bash
aws logs put-metric-filter \
  --log-group-name /aws/lambda/notes-api \
  --filter-name request-duration \
  --filter-pattern '{ $.duration_ms = * }' \
  --metric-transformations \
      metricName=RequestDuration,metricNamespace=NotesApp/Custom,metricValue='$.duration_ms'
```

→ La métrique `RequestDuration` reçoit la **valeur du champ `duration_ms`** de chaque log.

### 5.5 — Avantages des Metric Filters

- **Pas de code** côté application — c'est CloudWatch qui fait le travail.
- **Rétro-actif** : pas d'historique avant la création du filter, mais aucune modif app.
- **Gratuit** : pas de surcoût au-delà de la métrique custom (qui elle, coûte 0,30 $/mois).

---

## 6. SNS — recevoir les notifications

### 6.1 — Pourquoi SNS

CloudWatch Alarms ne **notifient pas directement** par email. Elles publient sur un **SNS Topic**, qui ensuite envoie aux destinataires.

Pourquoi ce double-saut : un **SNS Topic peut avoir plusieurs subscribers** :

- Email (1 ou plusieurs).
- SMS.
- HTTP/S webhook (Slack, PagerDuty, Opsgenie).
- Lambda (pour traitement custom).
- SQS (pour buffering).

### 6.2 — Créer un Topic SNS

```bash
TOPIC_ARN=$(aws sns create-topic --name ops-alerts --query 'TopicArn' --output text)

# S'abonner par email
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint ops@example.com

# Confirmer l'email (cliquer sur le lien reçu)

# S'abonner par SMS (si supporté dans la région)
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol sms \
  --notification-endpoint +33612345678

# S'abonner via Slack webhook
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/T.../B.../...
```

### 6.3 — Intégration Slack — le pattern courant

Direct SNS → webhook Slack fonctionne mais le **formatage** est moche (JSON brut). Solution moderne :

- **AWS Chatbot** : service AWS qui s'intègre nativement avec Slack et MS Teams. Configurer "AWS Chatbot" comme subscriber SNS → notifications formatées dans Slack avec liens vers la console.

### 6.4 — Tarifs SNS

- 1 M de publications **gratuites/mois**.
- 0,50 $/million ensuite.
- SMS : payant selon le pays (~0,05 $/SMS en France).

Pour 99 % des cas d'alerting interne : **gratuit**.

---

## 7. Composite Alarms

### 7.1 — Le besoin

Parfois, on veut alerter **seulement quand plusieurs conditions** sont remplies :

- "L'API est lente **ET** le CPU EC2 est haut" → vraie surcharge.
- "Erreurs 5xx **OU** erreurs 4xx > 50/min" → quelque chose ne va pas.
- "Latence haute **ET PAS** déploiement en cours" → vrai incident.

### 7.2 — Création

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name "api-real-incident" \
  --alarm-rule "ALARM(lambda-notes-api-high-latency) AND ALARM(ec2-cpu-high)" \
  --alarm-actions $TOPIC_ARN
```

La règle utilise `ALARM(name)`, `OK(name)`, `INSUFFICIENT_DATA(name)`, combinables avec `AND`, `OR`, `NOT`.

### 7.3 — Quand l'utiliser

| Cas                                                           | Outil            |
| ------------------------------------------------------------- | ---------------- |
| Alerte simple sur un seuil.                                   | Metric Alarm.    |
| Combiner plusieurs métriques pour réduire les faux positifs.  | Composite Alarm. |
| Réduire le bruit des notifications en groupant les incidents. | Composite Alarm. |
| Logique complexe.                                             | Composite Alarm. |

---

## 8. Anomaly Detection — mention rapide

CloudWatch propose **Anomaly Detection** : au lieu d'un seuil fixe, l'alarme **apprend la baseline** d'une métrique et alerte sur les **écarts statistiques**.

Cas d'usage : trafic web qui a un pattern jour/nuit/weekend → seuil fixe = trop d'alertes le jour, ou pas assez la nuit. Avec Anomaly Detection, l'alarme s'**adapte**.

```bash
# Créer un anomaly detector
aws cloudwatch put-anomaly-detector \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=notes-api \
  --stat Average

# Créer une alarme basée sur la déviation
aws cloudwatch put-metric-alarm \
  --alarm-name "lambda-duration-anomaly" \
  --comparison-operator LessThanLowerOrGreaterThanUpperThreshold \
  --evaluation-periods 2 \
  --metrics '[
    {"Id": "m1", "MetricStat": {"Metric": {"Namespace": "AWS/Lambda", "MetricName": "Duration", "Dimensions": [{"Name": "FunctionName", "Value": "notes-api"}]}, "Period": 300, "Stat": "Average"}, "ReturnData": true},
    {"Id": "ad1", "Expression": "ANOMALY_DETECTION_BAND(m1, 2)"}
  ]' \
  --threshold-metric-id ad1
```

**Coût** : 0,30 $/anomaly detector/mois. À utiliser pour les métriques **vraiment importantes** sans baseline stable.

---

## 9. Pratique — alerte sur latence (item N2 explicite)

C'est l'**exercice du glossaire** : alerter sur un seuil de latence.

### 9.1 — Scénario

Sur une Lambda `notes-api` :

- **Alerter** si la **latence p99 dépasse 1 000 ms** pendant **3 minutes consécutives**.
- Notification par **email** via SNS.
- Tester en injectant de la latence artificielle.

### 9.2 — Étape 1 — Créer le Topic SNS

```bash
TOPIC_ARN=$(aws sns create-topic --name notes-api-alerts --query 'TopicArn' --output text)
aws sns subscribe --topic-arn $TOPIC_ARN --protocol email --notification-endpoint you@example.com
# Confirmer l'email
```

### 9.3 — Étape 2 — Créer l'alarme

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "notes-api-p99-latency-high" \
  --alarm-description "p99 latency > 1s for 3 min" \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=notes-api \
  --extended-statistic p99 \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions $TOPIC_ARN \
  --ok-actions $TOPIC_ARN
```

### 9.4 — Étape 3 — Provoquer une latence

Modifier la Lambda pour ajouter un `time.sleep(2)` temporaire :

```python
import time, random
def lambda_handler(event, context):
    if random.random() < 0.2:  # 20% des invocations
        time.sleep(2)  # 2 secondes
    return {"statusCode": 200, "body": "ok"}
```

Lancer 30-50 invocations.

### 9.5 — Étape 4 — Observer

- Dans CloudWatch console : voir l'alarme passer en `ALARM` après ~3 min.
- Recevoir un email avec le détail.
- Retirer le `sleep`, relancer des invocations → l'alarme repasse en `OK` (et un email "back to OK" est envoyé).

### 9.6 — Étape 5 — Cleanup

Ne **pas** oublier de supprimer l'alarme après le TP si on ne veut pas être pollué :

```bash
aws cloudwatch delete-alarms --alarm-names notes-api-p99-latency-high
```

---

## 10. Anti-patterns

| Anti-pattern                                                | Conséquence                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Alerter sur chaque sous-système** (CPU, mémoire, disque…) | Trop d'alertes → personne ne réagit. Préférer les **symptômes** (latence utilisateur, erreurs vues). |
| **Alerter sur l'Average** au lieu de p95/p99.               | La moyenne masque les outliers, vous ne voyez pas le drame.                                          |
| **TreatMissingData par défaut** sur alarmes critiques.      | Service down → pas de notification.                                                                  |
| **Threshold fixé "au pif"** sans baseline.                  | Faux positifs constants ou faux négatifs.                                                            |
| **Pas de cleanup** des alarmes après tests.                 | Pollution, fatigue, coûts custom metrics.                                                            |
| **Multiplier les subscribers SNS** (5 emails, 3 SMS).       | Pas de plan d'astreinte clair.                                                                       |
| **Pas de runbook** par alarme.                              | À 3h du matin, personne ne sait quoi faire.                                                          |
| **Composite alarms imbriquées** trop profondément.          | Logic incompréhensible.                                                                              |
| **Alertes en silos** (un dashboard par équipe).             | Vision globale perdue, problèmes inter-services ignorés.                                             |

---

## 11. Exercices pratiques

### Exercice 1 — Créer un Topic SNS et s'abonner (≈ 15 min)

**Objectif.** Premier maillon.

**Étapes :**

1. Créer un Topic SNS `tp-alerts`.
2. S'abonner par email, confirmer.
3. Publier un message de test : `aws sns publish --topic-arn $TOPIC_ARN --message "Test"`.
4. Recevoir l'email.

**Livrable.** Capture de l'email.

### Exercice 2 — Alarme sur une métrique standard (≈ 30 min)

**Objectif.** L'item N2 central.

**Étapes :** suivre la section 9 — créer une alarme sur la latence p99 d'une Lambda, provoquer la latence, observer.

**Bonus :** ajouter une seconde alarme sur le **taux d'erreurs** (`Errors / Invocations > 0.05`).

**Livrable.** Captures des deux alarmes en ALARM puis OK + emails reçus.

### Exercice 3 — Alarme à partir des logs (≈ 30 min)

**Objectif.** Le pattern logs → metric → alarme.

**Étapes :**

1. Sur un Log Group existant (Lambda, ECS), créer un **Metric Filter** qui compte les logs `ERROR`.
2. Poser une alarme sur cette métrique custom (`> 5 errors / 5 min`).
3. Faire échouer 6 invocations pour déclencher l'alarme.

**Livrable.** Capture du Metric Filter + alarme + email.

### Exercice 4 — Composite Alarm (≈ 30 min)

**Objectif.** Réduire les faux positifs.

**Étapes :**

1. Créer 2 alarmes : `lambda-high-latency` et `lambda-high-errors`.
2. Créer une composite : `ALARM(lambda-high-latency) AND ALARM(lambda-high-errors)`.
3. Déclencher l'une ou l'autre : la composite reste en `OK`.
4. Déclencher les deux : la composite passe en `ALARM`.

**Livrable.** Captures des 3 alarmes.

### Exercice 5 — Slack via AWS Chatbot (≈ 30 min, optionnel)

**Objectif.** Notifications propres.

**Étapes :**

1. Activer AWS Chatbot pour son workspace Slack.
2. Configurer un channel et lier au Topic SNS de l'exercice 1.
3. Déclencher une alarme → vérifier le message Slack formaté avec boutons "Open in console".

**Livrable.** Capture du message Slack.

### Mini-défi — Plan d'alerting pour une API (≈ 30 min, papier)

**Cas.** API REST publique sur ALB + Lambda + DynamoDB. Trafic : 100 req/s en moyenne, 500 en pic.

**Concevoir** :

1. Quelles **5 alarmes** poser (max), choisies parmi : latence, erreurs, throttles, capacity, freshness ?
2. Threshold initial pour chacune (justifier).
3. Combien de subscribers et lesquels (email pour quoi, SMS pour quoi, Slack pour quoi) ?
4. Runbook : que faire pour chacune des 5 alarmes (3-5 lignes par runbook) ?

**Livrable.** Matrice + runbooks succincts.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Distinguer **CloudWatch Metrics** et **CloudWatch Logs**.
- [ ] Distinguer **métriques standards AWS** (gratuites) et **métriques custom** (payantes).
- [ ] Citer les **5 composants** d'une alarme (metric, statistic, period, threshold, comparison + evaluation periods).
- [ ] Citer les **3 états** d'une alarme.
- [ ] Expliquer le piège **INSUFFICIENT_DATA** et comment le contourner (`TreatMissingData`).
- [ ] Différencier **Average** et **p99** pour la latence, et savoir lequel utiliser.
- [ ] **Créer une alarme** sur métrique standard de mémoire (CLI).
- [ ] Définir un **Metric Filter** : transformer des logs en métriques.
- [ ] Créer un **Topic SNS** + s'abonner par email/Slack.
- [ ] Définir une **composite alarm** et quand l'utiliser.
- [ ] Citer **3 anti-patterns** courants d'alerting.

### Items du glossaire visés

**N2 atteint** :

- _créer de l'alerting via CloudWatch_ — sections 4, 5, 9.

---

## 13. Ressources complémentaires

### Documentation AWS

- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [Metric Math and composite](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Combine_Alarms.html)
- [Anomaly Detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html)
- [SNS Topics](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)
- [AWS Chatbot](https://docs.aws.amazon.com/chatbot/latest/adminguide/what-is.html)

### Pour aller plus loin

- **M3 (Athena)** — analyser des logs S3 par SQL.
- **Niveau 3** : dashboards CloudWatch, métriques custom, X-Ray pour le tracing distribué.
- [SRE Workbook — Practical Alerting](https://sre.google/workbook/practical-alerting/) — bonnes pratiques d'alerting (signaux, runbooks, fatigue).
