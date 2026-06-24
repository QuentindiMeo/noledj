# M1 — CloudWatch Logs

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS CloudWatch Logs**, son rôle dans l'écosystème AWS (collecte centralisée des logs de services et d'applications) et sa distinction d'avec **CloudWatch Metrics** ou **CloudTrail**.
- Distinguer **Log Group** et **Log Stream**, et expliquer leur **organisation hiérarchique** : un Log Group par application/service, un Log Stream par instance/conteneur/Lambda.
- **Rechercher un log** dans CloudWatch via les **trois moyens** disponibles : Filter Patterns (basique), **Logs Insights** (moteur SQL-like avancé), **tail en direct** (`aws logs tail`).
- Écrire des **requêtes Logs Insights** complètes : `fields`, `filter`, `stats`, `parse`, `sort`, `limit`.
- **Suivre en direct** les logs d'un service via `aws logs tail --follow` ou `aws logs start-live-tail`.
- Configurer des **retention policies** appropriées et reconnaître les coûts associés.
- Reconnaître les **anti-patterns** (un Log Group fourre-tout, rétention indéfinie, log de PII en clair).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- AWS CLI v2 configurée avec permissions `logs:*` et un service AWS produisant des logs.
- Idéalement : une Lambda déployée (rester sur l'environnement créé en AWS Identity) ou un workload EC2 / ECS qui écrit dans CloudWatch.
- Bases de la **regex** (utile pour les Filter Patterns) — non bloquant.

---

## 1. Pourquoi CloudWatch Logs

### 1.1 — Le problème

Une application en production génère des **logs** : événements applicatifs, erreurs, requêtes HTTP, traces. Trois questions se posent à chaque incident :

- **Où** sont les logs ? (sur quelle EC2 / dans quel conteneur ? Avant ou après le crash ?)
- **Comment chercher** dedans rapidement ?
- **Comment suivre en direct** quand on debug ?

**Sans solution centralisée**, chaque serveur garde ses logs en local, ils se perdent au reboot, et on doit SSH partout pour `grep` → impossible à l'échelle.

### 1.2 — CloudWatch Logs en une phrase

> **CloudWatch Logs** est le service AWS de **collecte, stockage et recherche centralisée** de logs depuis tous les services AWS (Lambda, EC2, ECS, RDS, VPC, …) et toute application custom via l'agent **CloudWatch Agent**.

Trois capacités majeures :

1. **Ingest** : tous les services AWS écrivent ici **par défaut** ou via une simple option.
2. **Stockage** : logs conservés selon une **retention policy** (1 jour à indéfini).
3. **Recherche** : recherche simple (Filter Pattern), avancée (Logs Insights SQL-like), temps réel (tail).

### 1.3 — Distinguer 3 services AWS souvent confondus

| Service                | Pour quoi                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| **CloudWatch Logs**    | **Logs applicatifs** (textes, JSON).                                |
| **CloudWatch Metrics** | **Métriques numériques** (CPU, requêtes/s, latence). Couvert en M2. |
| **CloudTrail**         | **Audit des appels API AWS** (qui a fait quoi).                     |

Les trois s'intègrent : on peut **extraire** une métrique depuis un Log Group (Metric Filter), et CloudTrail écrit ses events dans un Log Group si on le configure.

### 1.4 — L'analogie de la boîte aux lettres

- Chaque application **dépose** ses lettres (logs) dans sa **boîte aux lettres** (Log Group).
- Chaque émetteur (instance EC2, conteneur, Lambda execution) a sa **case** dans la boîte (Log Stream).
- Le facteur (CloudWatch) **trie** et **archive**.
- On peut **fouiller** une boîte avec une lampe (Filter Pattern), un détecteur (Logs Insights), ou regarder le facteur **en direct** (tail).

### 1.5 — Tarification

- **Ingest** : 0,57 $/GB en `eu-west-1`. C'est **le coût principal**.
- **Stockage** : 0,03 $/GB/mois.
- **Logs Insights queries** : 0,007 $/GB scanné.
- **Data transfer out** : selon volumes.

**Optimisation** : **rétention courte** (3-30 jours) + archivage S3 + Athena pour le long terme (vu en M3).

---

## 2. Log Groups et Log Streams

### 2.1 — Hiérarchie

```text
Log Group : /aws/lambda/notes-api
├── Log Stream : 2026/05/17/[$LATEST]abc123...   ← une invocation Lambda
├── Log Stream : 2026/05/17/[$LATEST]def456...
└── Log Stream : 2026/05/17/[$LATEST]ghi789...

Log Group : /aws/ecs/notes-app/web
├── Log Stream : ecs/web-container/task-abc...    ← un conteneur Fargate
└── Log Stream : ecs/web-container/task-def...

Log Group : my-custom-app/prod
├── Log Stream : ip-10-0-1-42                     ← une instance EC2
└── Log Stream : ip-10-0-1-43
```

### 2.2 — Convention de nommage AWS

Quand AWS crée automatiquement des Log Groups :

| Service       | Log Group typique                             |
| ------------- | --------------------------------------------- |
| Lambda        | `/aws/lambda/<function-name>`                 |
| ECS           | `/ecs/<cluster-name>/<service-name>` (custom) |
| API Gateway   | `API-Gateway-Execution-Logs_<api-id>/<stage>` |
| EKS           | `/aws/eks/<cluster-name>/cluster`             |
| CloudTrail    | `/aws/cloudtrail/<trail-name>` (si configuré) |
| VPC Flow Logs | `/aws/vpc/flowlogs`                           |
| Custom        | À nommer selon convention interne             |

**Bonne pratique** : convention `<env>/<app>/<service>` ou `/aws/<service>/<resource>`. Faciliter le filtrage et les permissions IAM par préfixe.

### 2.3 — Retention policies

Par défaut, **un Log Group créé manuellement est en rétention indéfinie** → grands coûts. **Toujours** définir une rétention.

Valeurs possibles : 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653 jours (1 jour à 10 ans).

```bash
# Définir une rétention de 30 jours
aws logs put-retention-policy \
  --log-group-name /aws/lambda/notes-api \
  --retention-in-days 30
```

**Recommandations** :

| Type de logs                            | Rétention recommandée                              |
| --------------------------------------- | -------------------------------------------------- |
| Logs applicatifs verbeux (debug)        | 3-7 jours                                          |
| Logs applicatifs prod (info/warn/error) | 14-30 jours                                        |
| Logs d'audit (CloudTrail)               | 365+ jours (et archive S3)                         |
| Logs réglementaires (RGPD, PCI)         | Selon réglementation, souvent 1-7 ans (archive S3) |
| Logs de tests / pré-prod                | 1-7 jours                                          |

### 2.4 — Création manuelle

```bash
# Créer un Log Group
aws logs create-log-group --log-group-name /myapp/prod/web

# Lui assigner une rétention
aws logs put-retention-policy --log-group-name /myapp/prod/web --retention-in-days 30

# Tagger
aws logs tag-log-group --log-group-name /myapp/prod/web \
  --tags Environment=prod,App=myapp

# Optionnel : chiffrement KMS
aws logs associate-kms-key \
  --log-group-name /myapp/prod/web \
  --kms-key-id arn:aws:kms:eu-west-1:ACCOUNT:key/KEY_ID
```

---

## 3. Rechercher un log — Filter Patterns (basique)

C'est l'**item N1 explicite** : savoir rechercher un log.

### 3.1 — Le pattern simple

Trois manières de rechercher dans la console CloudWatch :

1. **Filter pattern dans un Log Stream** : recherche texte basique sur un stream.
2. **Filter pattern dans un Log Group** : sur tous les streams du group.
3. **Logs Insights** : moteur SQL-like (section 4).

### 3.2 — Filter Pattern — syntaxe

| Pattern                                   | Effet                                            |
| ----------------------------------------- | ------------------------------------------------ |
| `ERROR`                                   | Match les events contenant "ERROR".              |
| `?ERROR ?WARN`                            | OR : "ERROR" **ou** "WARN".                      |
| `"connection refused"`                    | Match phrase exacte (avec espaces).              |
| `ERROR -Timeout`                          | ERROR **et pas** Timeout.                        |
| `[level=ERROR]`                           | Pour des logs structurés "space-delimited".      |
| `{$.level = "ERROR"}`                     | Pour des logs JSON, filter sur le champ `level`. |
| `{$.statusCode >= 500}`                   | Idem, sur un champ numérique.                    |
| `{$.path = "*api*" && $.duration > 1000}` | Combinaison AND.                                 |

### 3.3 — CLI

```bash
# Recherche basique
aws logs filter-log-events \
  --log-group-name /aws/lambda/notes-api \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --end-time $(date +%s)000

# Sur un stream spécifique
aws logs filter-log-events \
  --log-group-name /aws/lambda/notes-api \
  --log-stream-names "2026/05/17/[\$LATEST]abc123..." \
  --filter-pattern "ERROR"

# Sur logs JSON
aws logs filter-log-events \
  --log-group-name /aws/lambda/notes-api \
  --filter-pattern '{ $.level = "ERROR" }'
```

### 3.4 — Limites des Filter Patterns

- **Pas d'agrégation** : on ne peut pas compter, grouper, calculer.
- **Pas de tri** : on lit dans l'ordre stocké.
- **Pas de jointure** entre logs.
- **Performance** : sur des Log Groups volumineux, c'est lent.

Pour aller plus loin → **Logs Insights**.

---

## 4. Logs Insights — le moteur SQL-like

### 4.1 — Qu'est-ce que Logs Insights

**CloudWatch Logs Insights** est un moteur de requête **interactif** qui permet d'écrire des requêtes en **un langage proche du SQL** pour analyser les logs.

Différences avec un Filter Pattern :

- **Agrégations** (count, sum, avg, percentile).
- **Group by**, **sort**, **limit**.
- **Parsing** ad hoc de champs (extraction regex).
- **Performance** : optimisé pour scanner de gros volumes.
- **Coût** : 0,007 $/GB scanné (à mesurer sur volumes très importants).

### 4.2 — Anatomie d'une requête

``` txt
fields @timestamp, @message, @logStream
| filter @message like /ERROR/
| sort @timestamp desc
| limit 50
```

Commandes principales :

| Commande  | Rôle                                |
| --------- | ----------------------------------- |
| `fields`  | Sélectionner les champs à afficher. |
| `filter`  | Filtrer les events.                 |
| `parse`   | Extraire un champ via regex.        |
| `stats`   | Agréger (count, sum, avg, …).       |
| `sort`    | Trier.                              |
| `limit`   | Limiter le nombre de résultats.     |
| `display` | Renommer / formater l'affichage.    |

### 4.3 — Champs disponibles

Logs Insights fournit des **champs automatiques** :

- `@timestamp` : timestamp ISO 8601.
- `@message` : le contenu brut du log.
- `@logStream` : le Log Stream d'origine.
- `@log` : ARN du Log Group.

Pour les **logs JSON**, **tous les champs JSON** sont automatiquement parsés et accessibles : `@message.level`, `@message.path`, etc.

Si on log en JSON, Logs Insights devient extrêmement puissant **sans configuration**.

### 4.4 — Exemples concrets

**Compter les erreurs par heure** :

``` txt
fields @timestamp
| filter @message like /ERROR/
| stats count() as errors by bin(1h)
| sort @timestamp asc
```

**Top 10 URL avec le plus de 5xx (logs API Gateway)** :

``` txt
fields @timestamp, @message
| filter status >= 500
| stats count() as cnt by path
| sort cnt desc
| limit 10
```

**Latence p99 d'une Lambda** :

``` txt
fields @timestamp, @duration
| filter @type = "REPORT"
| stats avg(@duration), pct(@duration, 50) as p50,
        pct(@duration, 95) as p95, pct(@duration, 99) as p99
```

**Extraire un user_id d'un message texte** :

``` txt
fields @timestamp, @message
| parse @message /user_id=(?<user_id>\w+)/
| filter user_id like /alice/
| sort @timestamp desc
```

**Compter les actions par user** :

``` txt
fields @timestamp
| parse @message /user=(?<user>\S+) action=(?<action>\S+)/
| stats count() as cnt by user, action
| sort cnt desc
```

### 4.5 — Lancer une requête via CLI

```bash
# Démarrer une query
QUERY_ID=$(aws logs start-query \
  --log-group-name /aws/lambda/notes-api \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20' \
  --query 'queryId' --output text)

# Attendre et récupérer le résultat
aws logs get-query-results --query-id $QUERY_ID
```

### 4.6 — Multi Log Groups

Logs Insights peut interroger **plusieurs Log Groups** à la fois :

```bash
aws logs start-query \
  --log-group-names /aws/lambda/notes-api /aws/lambda/notes-worker \
  --start-time ... \
  --query-string 'fields @timestamp, @message, @log | filter @message like /ERROR/'
```

Utile pour debugger une chaîne de services interconnectés.

---

## 5. Tail en direct — suivre les logs

C'est **l'item N1 "suivre les logs d'un service en direct"** (la formulation "via Trail" du glossaire est ambiguë — on parle ici du **tail** des logs CloudWatch, à ne pas confondre avec CloudTrail).

### 5.1 — Pourquoi en direct

Pendant un debug ou un déploiement, on veut **voir les logs apparaître au fur et à mesure**, comme `tail -f` sur un fichier local.

### 5.2 — `aws logs tail`

```bash
# Suivre en direct le Log Group
aws logs tail /aws/lambda/notes-api --follow

# Avec filtre
aws logs tail /aws/lambda/notes-api --follow --filter-pattern "ERROR"

# Sur une période passée
aws logs tail /aws/lambda/notes-api --since 30m

# Format
aws logs tail /aws/lambda/notes-api --follow --format short
```

C'est l'outil **quotidien** des devs / ops sur AWS. Si on n'utilise qu'un seul outil CloudWatch en CLI, c'est celui-là.

### 5.3 — Live Tail (interface console)

Depuis 2023, la console CloudWatch propose un **Live Tail** :

- Cliquer dans CloudWatch → Live Tail.
- Sélectionner un ou plusieurs Log Groups.
- Optionnellement, ajouter un filter pattern.
- Les events s'affichent en temps réel.

**Coût** : 0,01 $/minute de session. Une session de 1 h = 0,60 $. À éteindre après usage.

### 5.4 — Démarrer une Live Tail via CLI

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:eu-west-1:ACCOUNT:log-group:/aws/lambda/notes-api \
  --log-stream-name-prefixes "2026/05/17"
```

### 5.5 — Quand utiliser quoi

| Besoin                                  | Outil                    |
| --------------------------------------- | ------------------------ |
| Debug en direct d'une Lambda / ECS task | `aws logs tail --follow` |
| Multi-Log-Group en direct               | Live Tail console        |
| Recherche sur 1 h passée                | Logs Insights            |
| Recherche simple sur quelques messages  | Filter Pattern           |
| Analyse aggrégée (stats, top, p99)      | Logs Insights            |

---

## 6. Pratique — requête sur logs applicatifs

L'objectif : sur la Lambda `notes-api` du mini-projet AWS Identity (ou n'importe quelle Lambda générant des logs), réaliser un cycle complet de recherche.

### 6.1 — Générer des logs

Si on n'a pas encore de Lambda qui logue, créer une rapide :

```python
import json, random, time
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    user = event.get("user", "unknown")
    action = random.choice(["GET", "POST", "DELETE"])
    duration = random.randint(50, 500)
    status = random.choice([200, 200, 200, 200, 404, 500])

    logger.info(json.dumps({
        "user": user,
        "action": action,
        "duration_ms": duration,
        "status": status
    }))

    if status >= 500:
        logger.error(json.dumps({"error": "server error", "user": user}))

    return {"statusCode": status}
```

Invoquer 50-100 fois avec des `user` différents.

### 6.2 — Recherche basique

```bash
# Voir les erreurs récentes
aws logs filter-log-events \
  --log-group-name /aws/lambda/notes-api \
  --filter-pattern "ERROR"
```

### 6.3 — Logs Insights — requêtes utiles

**Compter les status par user** :

``` txt
fields @timestamp, @message
| filter @message like /user/
| stats count() as cnt by status, user
| sort cnt desc
```

**Latence moyenne par action** :

``` txt
fields @timestamp, @message
| stats avg(duration_ms) as avg_ms, pct(duration_ms, 99) as p99_ms by action
| sort avg_ms desc
```

**Erreurs par heure** :

``` txt
filter status >= 500
| stats count() as errors by bin(15m)
```

### 6.4 — Suivre en direct

``` bash
aws logs tail /aws/lambda/notes-api --follow --filter-pattern "ERROR"
```

Pendant que des invocations Lambda arrivent → on voit les erreurs en temps réel.

---

## 7. Anti-patterns courants

| Anti-pattern                                               | Conséquence                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| **Rétention indéfinie** par défaut.                        | Facture qui grossit, conformité (RGPD = oblige à supprimer).    |
| **Un Log Group fourre-tout** pour 50 services.             | Impossible de filtrer par service, permissions IAM trop larges. |
| **Loger les PII** (emails, CB, noms) en clair.             | Fuite RGPD potentielle.                                         |
| **Logs non structurés** (texte libre).                     | Requêtes Logs Insights complexes (parse regex à chaque fois).   |
| Mettre des **secrets** dans les logs (passwords, tokens).  | Fuite garantie. Filtrer côté code.                              |
| Ne pas **chiffrer KMS** les Log Groups sensibles.          | Pas d'audit fin du déchiffrement.                               |
| **Live Tail laissée allumée** la nuit.                     | 0,60 $/h × 24 = 14 $/jour gaspillés.                            |
| **Verbose en prod** (DEBUG partout).                       | Coût d'ingest x10, signal noyé dans le bruit.                   |
| **Pas d'archivage S3** pour les logs réglementaires longs. | Coûts CloudWatch élevés vs S3 Glacier (10-100× moins cher).     |

---

## 8. Exercices pratiques

### Exercice 1 — Lister et auditer les Log Groups (≈ 20 min)

**Objectif.** Diagnostic d'hygiène.

**Étapes :**

1. Lister tous les Log Groups : `aws logs describe-log-groups`.
2. Identifier ceux avec `retentionInDays: null` (rétention indéfinie).
3. Identifier ceux qui n'ont pas été écrits depuis 30+ jours (suspects).
4. Définir une rétention pour tous les Log Groups orphelins (30 jours par défaut).

**Livrable.** Tableau récap avant/après avec les coûts mensuels avant/après.

### Exercice 2 — Recherche basique avec Filter Pattern (≈ 20 min)

**Objectif.** Maîtriser le filtrage simple.

**Étapes :**

1. Sur un Log Group de votre choix, faire 3 requêtes Filter Pattern :
   - Mots simples : `ERROR`.
   - Combinaison : `?ERROR ?WARN`.
   - Exclusion : `ERROR -Timeout`.
2. Pour des logs JSON : un filtre `{$.statusCode >= 500}`.

**Livrable.** Captures des 4 requêtes et leurs résultats.

### Exercice 3 — Logs Insights — requêtes (≈ 45 min)

**Objectif.** Le cœur du module.

**Étapes :**

1. Sur la Lambda de la section 6 (ou équivalente), écrire les **5 requêtes** ci-dessous dans Logs Insights :
   - Compter le total de requêtes sur la dernière heure.
   - Compter par status code.
   - Top 5 users par nombre d'actions.
   - Latence p50, p95, p99 (logs `@type=REPORT` Lambda).
   - Histogramme d'erreurs par tranche de 15 min.

**Livrable.** Les 5 requêtes + captures de leurs résultats.

### Exercice 4 — Tail en direct (≈ 15 min)

**Objectif.** Le réflexe debug.

**Étapes :**

1. Démarrer `aws logs tail /aws/lambda/<your-function> --follow`.
2. Dans un autre terminal, invoquer la Lambda 5-10 fois.
3. Observer les events apparaître.
4. Filtrer pour ne voir que les erreurs : ajouter `--filter-pattern "ERROR"`.

**Livrable.** Capture de la session tail.

### Exercice 5 — Multi Log Group (≈ 30 min)

**Objectif.** Cross-service debugging.

**Étapes :**

1. Identifier 2 services qui interagissent (par exemple Lambda + API Gateway).
2. Écrire une requête Logs Insights sur les **deux Log Groups** :

   ``` txt
   fields @timestamp, @log, @message
   | sort @timestamp desc
   | limit 100
   ```

3. Observer comment les events des deux services sont interlacés chronologiquement.

**Livrable.** Capture montrant le mix des events.

### Mini-défi — Détecter une anomalie (≈ 30 min)

**Cas.** On suspecte qu'un utilisateur lance beaucoup d'opérations destructives. Trouver via Logs Insights :

1. Les actions DELETE des dernières 24 h, groupées par user.
2. Le user qui a fait le plus de DELETE.
3. La distribution temporelle de ses actions (a-t-il fait tout en 1 minute ?).

**Livrable.** Les 3 requêtes + conclusion sur le user suspect (vrai ou faux positif).

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **CloudWatch Logs** et le distinguer de **CloudWatch Metrics** et **CloudTrail**.
- [ ] Distinguer **Log Group** et **Log Stream**, donner leur convention de nommage AWS.
- [ ] Citer les **3 manières** de rechercher dans CloudWatch Logs (Filter Pattern, Logs Insights, tail).
- [ ] Écrire un **Filter Pattern** simple et un Filter Pattern sur JSON.
- [ ] Écrire une **requête Logs Insights** avec `fields`, `filter`, `stats`, `sort`, `limit`.
- [ ] **Tailler en direct** un Log Group via `aws logs tail --follow`.
- [ ] Donner les **rétentions recommandées** par type de logs.
- [ ] Estimer le **coût** d'un Log Group (ingest, stockage, queries).
- [ ] Citer **3 anti-patterns** (rétention indéfinie, PII en clair, fourre-tout).
- [ ] Configurer le **chiffrement KMS** d'un Log Group.

### Items du glossaire visés

**N1 atteint** :

- _rechercher un log dans CloudWatch_ — sections 3 et 4.
- _utiliser CloudWatch Logs pour agréger des groupes de journaux_ — sections 2 et 4.6.
- _suivre les logs d'un service en direct_ — section 5.

---

## 10. Ressources complémentaires

### Documentation AWS

- [CloudWatch Logs User Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html)
- [Filter Pattern Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)
- [Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [Live Tail](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs_LiveTail.html)
- [Pricing](https://aws.amazon.com/cloudwatch/pricing/)

### Outils CLI

- [`aws logs tail`](https://docs.aws.amazon.com/cli/latest/reference/logs/tail.html) — l'outil quotidien.
- [`saw`](https://github.com/TylerBrock/saw) — alternative CLI populaire.
- [`awslogs`](https://github.com/jorgebastida/awslogs) — autre CLI.

### Pour aller plus loin

- **M2 (CloudWatch — alerting)** — créer des alarmes basées sur les logs.
- **M3 (Athena)** — requêter des logs archivés en S3 (Parquet, JSON, …).
- **Niveau 3** : dashboards CloudWatch, métriques custom, AWS X-Ray pour le tracing distribué.
