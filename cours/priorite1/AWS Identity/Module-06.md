# M6 — Moindre privilège

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Énoncer **précisément** le principe du **moindre privilège** (least privilege) et expliquer pourquoi il est **central** en sécurité cloud, au-delà de la simple "bonne pratique".
- Décrire **pourquoi appliquer le moindre privilège est difficile en pratique** : actions implicites, ressources créées dynamiquement, friction développeur, complexité opérationnelle.
- Suivre la **méthode en 5 étapes** pour durcir une policy : observer → cartographier → générer un premier draft → simuler/tester → itérer.
- Utiliser les **outils AWS** dédiés : **CloudTrail** (historique des appels), **IAM Access Analyzer** (génération de policy + scan de permissions inutilisées), **Policy Simulator**, **AWS Config**, **CloudTrail Lake**.
- **Durcir concrètement** une policy trop large en passant de `Action: "*", Resource: "*"` à une liste précise d'actions sur des ressources ciblées, sans casser l'application.
- Reconnaître les **patterns courants à durcir** (admin partout, full S3, full EC2, IAM trop large) et les **anti-patterns récurrents** ("on durcira plus tard", "on copie depuis Stack Overflow", "wildcard pour aller vite").

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M5 (entités IAM, policies, alternatives access keys, policies avancées, AssumeRole et STS).
- AWS CLI v2, permissions IAM, accès à CloudTrail dans le compte.
- Une application déployée ou un workload existant à durcir (idéalement, le mini-projet ou un script CI).

---

## 1. Le principe du moindre privilège

### 1.1 — Définition

> Le **principe du moindre privilège** (least privilege) : **une identité ne doit avoir que les permissions strictement nécessaires à sa fonction, ni plus ni moins, et pas plus longtemps que nécessaire.**

Trois dimensions à maîtriser :

1. **Quoi** — uniquement les actions nécessaires, pas plus.
2. **Sur quoi** — uniquement les ressources nécessaires, pas plus.
3. **Quand / sous quelles conditions** — uniquement quand c'est légitime (IP, MFA, plage horaire, …).

### 1.2 — Pourquoi c'est central

Le moindre privilège **limite le rayon d'impact** d'une compromission. Une identité compromise ne peut faire **que** ce qu'elle pouvait faire légitimement.

| Sans moindre privilège                                                                                                                          | Avec moindre privilège                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Une access key leakée avec `AdministratorAccess` → compromission complète du compte AWS, drop de la facture sur du mining crypto, exfiltration. | Une access key leakée avec `s3:GetObject` sur 1 bucket → un attaquant peut au pire lire ce bucket. |
| Un user pris en main par phishing → exfiltration de données depuis n'importe quel service.                                                      | Pris en main → uniquement le périmètre du user.                                                    |
| Un service AWS compromis (par exemple via SSRF) → escalade complète.                                                                            | Un service compromis → uniquement les ressources qu'il pouvait toucher.                            |

Les **incidents publics réguliers** d'AWS (Capital One, Imperva, …) ont en commun : **les permissions étaient trop larges**.

### 1.3 — L'analogie du trousseau de clés

Un agent de maintenance qui doit changer une ampoule au 3ᵉ étage :

- **Trop large** : on lui donne le **trousseau complet** (toutes les portes de l'immeuble). S'il perd le trousseau, l'immeuble entier est compromis.
- **Moindre privilège** : on lui donne uniquement la clé du 3ᵉ étage, pour les **2 heures** que dure son intervention. S'il perd la clé, l'impact est borné à un étage pendant 2 h.

En cloud, le **trousseau** = la policy. La **durée** = la session temporaire / la rotation. Les **étages** = les services et ressources.

### 1.4 — Trois bénéfices pratiques

Au-delà de la sécurité pure :

- **Lisibilité** : une policy ciblée est lisible. Une policy `*/**/*` est opaque (qu'est-ce qu'elle autorise réellement ?).
- **Audit** : une policy précise simplifie les audits (conformité, ISO 27001, PCI, RGPD…). L'auditeur peut vérifier ligne à ligne.
- **Hygiène opérationnelle** : forcer le réflexe "quelles permissions doit avoir ce composant ?" oblige à **comprendre** ce qu'il fait. Excellent pour détecter du code mort ou des dépendances oubliées.

---

## 2. Pourquoi c'est difficile en pratique

Si le principe était trivial à appliquer, on n'aurait pas besoin d'un module. Quatre raisons concrètes pour lesquelles c'est dur :

### 2.1 — Les actions implicites

Beaucoup d'API AWS dépendent d'**autres actions** non documentées sur le moment. Exemples :

- `s3:PutObject` nécessite **aussi** `s3:GetBucketLocation` pour certains usages.
- `lambda:UpdateFunctionCode` nécessite **aussi** `iam:PassRole` si on assigne un rôle d'exécution.
- `ec2:RunInstances` nécessite `iam:PassRole`, `ec2:CreateTags`, parfois `ec2:DescribeImages`, etc.

Sans tests, on découvre ces dépendances **au pire moment** : en production, à la première erreur.

### 2.2 — Les ressources créées dynamiquement

Une Lambda qui crée des fichiers S3 ne connaît pas leurs noms à l'avance. On écrit `s3:PutObject on arn:aws:s3:::my-bucket/*` mais le `*` autorise potentiellement tout le bucket.

**Solution partielle** : utiliser des **préfixes contraints** (`s3:PutObject on arn:aws:s3:::my-bucket/uploads/${aws:PrincipalTag/Tenant}/*`). Demande de structurer le code en conséquence.

### 2.3 — La friction développeur

"Je voulais juste tester une nouvelle API, ma policy n'autorise pas → je perds 30 minutes à demander une mise à jour, valider, re-déployer."

Avec le temps, les développeurs poussent vers du `*` "pour aller plus vite", "on durcira plus tard". **On ne durcit jamais.**

**Solution** : un workflow où les permissions sont **larges en dev**, **modérées en staging**, **strictes en prod**. Et un processus de demande de permissions rapide (Slack bot, ticket avec SLA court).

### 2.4 — La complexité opérationnelle

Une organisation avec 100 services, 30 équipes, 50 rôles IAM → maintenir le moindre privilège pour chacun demande du **temps**, de la **discipline** et un **outillage**.

Sans outillage (Access Analyzer, Cloudsplaining, simulator), c'est **impossible** à grande échelle.

---

## 3. La méthode en 5 étapes

Une **méthode systématique** pour aller d'une policy trop large à une policy minimale.

### 3.1 — Étape 1 — Observer

Identifier **ce que fait réellement** l'identité concernée :

- Consulter **CloudTrail** sur les 30-90 derniers jours pour cette identité.
- Lister les **API calls** observés : services, actions, ressources.
- Identifier les **patterns** : combien d'API distinctes ? quelles ressources ?

```bash
# Lister les API calls d'un user sur 30 jours
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=alice \
  --start-time $(date -d '30 days ago' --iso-8601=seconds) \
  --max-results 1000 \
  --query 'Events[].{Time:EventTime, Action:EventName, Resource:Resources[0].ResourceName}' \
  | jq -r '.[] | "\(.Action)\t\(.Resource)"' \
  | sort | uniq -c | sort -rn
```

Sortie typique :

``` log
  342 s3:GetObject     arn:aws:s3:::my-bucket/file.txt
  156 s3:ListBucket    arn:aws:s3:::my-bucket
   42 logs:PutLogEvents arn:aws:logs:eu-west-1:...
    8 dynamodb:GetItem  arn:aws:dynamodb:eu-west-1:...:table/Users
    1 iam:GetUser       (s'est peut-être trompé)
```

**Observation immédiate** : la policy d'Alice peut être restreinte à 4-5 actions précises sur 3 ressources, sans nuire au quotidien.

### 3.2 — Étape 2 — Cartographier

Catégoriser les actions observées :

| Catégorie                  | Actions exemple                                                |
| -------------------------- | -------------------------------------------------------------- |
| **Indispensables**         | Sans elles, l'app casse. À conserver.                          |
| **Erronées / abandonnées** | API call qui a échoué ou qui n'a plus de raison.               |
| **Périphériques**          | API utilisée 1× il y a 6 mois — vérifier si encore nécessaire. |
| **Imprévues**              | Quelqu'un fait `iam:GetUser` alors qu'on pensait que non.      |

Distinguer les "vraies" actions des "exceptions" qui peuvent souvent être supprimées.

### 3.3 — Étape 3 — Générer un premier draft

Construire la **première policy** restrictive depuis les observations.

**Outil idéal** : **IAM Access Analyzer Policy Generation** — AWS analyse l'historique CloudTrail de l'identité et génère une policy minimale.

```bash
# Démarrer la génération
aws accessanalyzer start-policy-generation \
  --policy-generation-details principalArn=arn:aws:iam::ACCOUNT:role/my-role \
  --cloud-trail-details accessRole=arn:aws:iam::ACCOUNT:role/access-analyzer-cloudtrail-role,trails='[{cloudTrailArn=arn:aws:cloudtrail:eu-west-1:ACCOUNT:trail/my-trail}]'

# Récupérer le job ID, puis :
aws accessanalyzer get-generated-policy --job-id <jobId>
```

Sortie : une policy JSON prête à examiner.

**À défaut**, écrire le draft à la main depuis la cartographie de l'étape 2.

### 3.4 — Étape 4 — Simuler et tester

**Ne pas appliquer en prod direct**. D'abord :

1. **IAM Policy Simulator** : tester des actions précises avec la nouvelle policy.

   ```bash
   aws iam simulate-custom-policy \
     --policy-input-list file://new-policy.json \
     --action-names s3:GetObject s3:ListBucket dynamodb:GetItem \
     --resource-arns arn:aws:s3:::my-bucket/file.txt arn:aws:s3:::my-bucket arn:aws:dynamodb:...:table/Users
   ```

2. **Déployer en environnement de test** (staging, sandbox dédié).

3. **Lancer un test fonctionnel complet** : tous les use cases métier. Souvent, des cas border (par exemple, une feature utilisée 1 fois par jour) révèle un manque.

4. **Observer 24-48 h** : monitorer les `AccessDenied` dans CloudTrail.

### 3.5 — Étape 5 — Itérer

Si on observe des `AccessDenied` légitimes :

- Identifier l'action manquante.
- Décider : ajouter la permission ? ou bien le code qui l'appelle est-il superflu ?
- Mettre à jour la policy.
- Re-tester.

Boucler jusqu'à ce que la policy soit **stable** et **minimale**.

**Important** : ce n'est **pas** un cycle qui se termine. Une fois en prod, **re-observer** trimestriellement pour vérifier que la policy reste alignée avec l'usage.

---

## 4. Outils pour appliquer le principe

### 4.1 — CloudTrail

Le **journal d'audit** de toutes les actions API AWS. **Activé par défaut** pour la dernière semaine ; pour conserver l'historique, créer un **trail** persistant qui écrit vers S3.

```bash
# Vérifier les trails actifs
aws cloudtrail describe-trails --query 'trailList[].{Name:Name, S3:S3BucketName, Multi:IsMultiRegionTrail}'

# Lookup interactif (90 derniers jours)
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject --max-results 50
```

**Bonnes pratiques** :

- Un **trail multi-region** par compte.
- Écriture **chiffrée KMS** vers un bucket S3 dédié et immuable (Object Lock).
- **CloudTrail Lake** pour des requêtes SQL avancées.
- Conservation : 90 j minimum, idéalement 1-7 ans selon la conformité.

### 4.2 — IAM Access Analyzer

Service AWS gratuit qui analyse les permissions effectives et identifie :

- **Permissions inutilisées** : un user a accès à 50 services mais n'a utilisé que 4.
- **Accès cross-account inattendu** : un bucket / rôle est accessible depuis des comptes externes.
- **Findings** : alertes sur les configurations risquées.

```bash
# Activer Access Analyzer
aws accessanalyzer create-analyzer \
  --analyzer-name my-analyzer \
  --type ACCOUNT

# Lister les findings
aws accessanalyzer list-findings --analyzer-arn arn:aws:access-analyzer:eu-west-1:ACCOUNT:analyzer/my-analyzer
```

**Sous-fonctionnalités** :

- **External Access Analyzer** : détecte les ressources partagées en dehors de l'org.
- **Unused Access Analyzer** : détecte les permissions IAM non utilisées depuis X jours.
- **Policy Generation** : génère une policy depuis CloudTrail (vu en 3.3).
- **Policy Validation** : valide une policy avant déploiement, signale les warnings (par exemple, "MFA missing for sensitive action").

### 4.3 — Policy Simulator

Outil web (et CLI) qui simule l'évaluation d'une action sur une policy donnée.

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/file.txt
```

Sortie : pour chaque action × ressource, le verdict (`allowed`, `implicitDeny`, `explicitDeny`) et la policy responsable.

### 4.4 — AWS Config

Service de **configuration management** + **conformité** continue. Permet :

- Audit en continu de la conformité (par exemple : "tous les buckets S3 doivent avoir le chiffrement activé").
- Règles managées prêtes à l'emploi : `iam-user-no-policies-check`, `iam-password-policy`, `access-keys-rotated`.
- Notifications quand une règle passe en non-conforme.

### 4.5 — Cloudsplaining (open source)

Un outil tiers (Salesforce) qui analyse les policies IAM et identifie automatiquement :

- Actions à risque (privileges escalation).
- Wildcards excessifs sur des actions sensibles.
- Données qu'une compromission permettrait d'exfiltrer.

Très utile pour un **audit one-shot** d'un compte AWS dont on hérite.

---

## 5. Patterns courants à durcir

### 5.1 — Le user "humain admin" avec AdministratorAccess

**Avant.**

```json
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*"
}
```

**Après.**

- Le user humain n'a **plus** `AdministratorAccess` attaché directement.
- Il a juste la permission d'assumer un rôle `admin-role` qui, lui, a les droits admin.
- Le rôle exige **MFA** et **durée courte** (1 h).
- Toutes les actions admin laissent une trace claire dans CloudTrail (RoleSessionName = nom du user).

```json
// Policy attachée au user
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::ACCOUNT:role/admin-role",
  "Condition": {
    "Bool": { "aws:MultiFactorAuthPresent": "true" }
  }
}
```

### 5.2 — Le rôle "service" avec full S3

**Avant.**

```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "*"
}
```

**Après.**

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket"
  ],
  "Resource": ["arn:aws:s3:::my-app-data", "arn:aws:s3:::my-app-data/*"]
}
```

**Gain** : la compromission ne peut toucher que **ce bucket précis**, et seulement avec ces 4 actions. Les autres buckets du compte sont protégés.

### 5.3 — La Lambda avec `iam:*`

**Avant.**

```json
{
  "Effect": "Allow",
  "Action": "iam:*",
  "Resource": "*"
}
```

**Après** (si on a besoin de PassRole pour assigner un rôle à un job spawné) :

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::ACCOUNT:role/job-execution-role"
}
```

**Gain** : escalade de privilèges impossible. La Lambda peut **uniquement** passer un rôle bien identifié à un service connu.

### 5.4 — Le rôle CI/CD avec PowerUserAccess

**Avant.** PowerUserAccess attaché.

**Après.**

- Une **Customer-managed policy** dédiée listant exactement les services et actions du pipeline (par exemple : ECR, ECS UpdateService, CloudFormation, …).
- **Condition** sur la branche (via OIDC `token.actions.githubusercontent.com:sub`).
- **Condition** sur la région (si déploiement régional).

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:BatchGetImage",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecr:PutImage"
  ],
  "Resource": "arn:aws:ecr:eu-west-1:ACCOUNT:repository/my-app",
  "Condition": {
    "StringEquals": { "aws:RequestedRegion": "eu-west-1" }
  }
}
```

### 5.5 — Le bucket "internal" sans Deny défensif

**Avant.** Bucket sans bucket policy → tout user du compte avec `s3:*` y a accès.

**Après.** Bucket policy explicite :

```json
{
  "Statement": [
    {
      "Sid": "AllowAppRole",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:role/app-role" },
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::sensitive-data/*"
    },
    {
      "Sid": "DenyEveryoneElse",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::sensitive-data",
        "arn:aws:s3:::sensitive-data/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::ACCOUNT:role/app-role"
        }
      }
    }
  ]
}
```

**Gain** : même si quelqu'un d'autre dans le compte a accidentellement `AdministratorAccess`, il ne peut pas lire ce bucket. Le bucket est **verrouillé** au seul rôle légitime.

---

## 6. Anti-patterns récurrents

| Anti-pattern                                              | Conséquence                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "**On durcira plus tard**"                                | On ne durcit jamais. La dette s'accumule. La compromission arrive avant l'amélioration.                                              |
| **Copier-coller** une policy depuis Stack Overflow / blog | Souvent trop large, parfois fausse, jamais auditée.                                                                                  |
| **Wildcard "pour aller vite"** en dev                     | Le dev devient le test puis la prod. Le wildcard reste.                                                                              |
| **Confondre "lecture seule" et "sans danger"**            | `iam:Get*` permet de lire des credentials. `secretsmanager:Get*` permet de lire des secrets. Tous les "Get" ne sont pas inoffensifs. |
| **Pas de Deny défensif** sur les ressources sensibles     | Une mauvaise attribution d'AdministratorAccess plus tard = compromission.                                                            |
| **Pas de revue trimestrielle**                            | Les permissions inutilisées s'accumulent. Access Analyzer les remonte si on les regarde.                                             |
| **Pas de tagging**                                        | Impossible d'auditer "qui possède cette policy".                                                                                     |
| **Inline policies inversibles** difficiles à comparer     | Les changements ne sont pas tracés sans versionning.                                                                                 |

---

## 7. Pratique — durcir une policy trop large

L'exercice central du module. Prendre une policy trop large existante et la **resserrer méthodiquement**.

### 7.1 — Cas d'étude

Le rôle `app-prod-role` a actuellement :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    }
  ]
}
```

(Oui, ça arrive.) L'application est une API REST FastAPI qui :

- Lit / écrit dans un bucket `app-uploads`.
- Lit / écrit dans une table DynamoDB `users`.
- Loggue dans CloudWatch.
- Envoie des emails via SES.
- Lit le secret de DB dans Secrets Manager.

### 7.2 — Application de la méthode

**Étape 1 — Observer.** Sur 30 jours, CloudTrail montre que `app-prod-role` a appelé :

``` log
12450  s3:GetObject       arn:aws:s3:::app-uploads/users/*/avatar.png
 5400  s3:PutObject       arn:aws:s3:::app-uploads/users/*/avatar.png
 1200  dynamodb:GetItem   arn:aws:dynamodb:...:table/users
 1100  dynamodb:UpdateItem arn:aws:dynamodb:...:table/users
  900  dynamodb:Query     arn:aws:dynamodb:...:table/users
  800  logs:CreateLogStream arn:aws:logs:...:log-group:/aws/lambda/...
 2400  logs:PutLogEvents
  120  ses:SendEmail
   10  secretsmanager:GetSecretValue  arn:aws:secretsmanager:...:secret:db-credentials
```

Aucune action inattendue. La policy peut être très ciblée.

**Étape 2 — Cartographier.** 4 services, ~8 actions distinctes, ~5 ressources précises.

**Étape 3 — Draft.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3UserAvatars",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::app-uploads/users/*/avatar.png"
    },
    {
      "Sid": "DynamoUsersTable",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/users"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup"
      ],
      "Resource": "arn:aws:logs:eu-west-1:ACCOUNT:log-group:/aws/lambda/app:*"
    },
    {
      "Sid": "SendEmail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:eu-west-1:ACCOUNT:identity/noreply@example.com"
    },
    {
      "Sid": "ReadDBSecret",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:db-credentials-*"
    }
  ]
}
```

5 statements, 9 actions, 5 ressources précises. **Du `*` à du ciblé**, sans perdre de fonctionnalité.

**Étape 4 — Tester.**

Déployer en staging, lancer la suite de tests E2E, surveiller CloudTrail pendant 48 h.

**Étape 5 — Itérer.**

Si une action manque (par exemple `s3:GetBucketLocation` pour le SDK boto3 sur certains profils), l'ajouter et noter pourquoi.

### 7.3 — Bénéfices observés

| Avant                                    | Après                                                |
| ---------------------------------------- | ---------------------------------------------------- |
| Compromission = compte entier            | Compromission = 1 bucket + 1 table + logs + 1 secret |
| Audit impossible (`*`)                   | Audit ligne à ligne                                  |
| Wildcards ouvrent toute évolution future | Toute évolution exige une mise à jour explicite      |
| Anxiété compliance                       | Conforme aux frameworks usuels                       |

---

## 8. Le ratio coût/bénéfice

Le moindre privilège a un **coût** : temps d'analyse, friction développeur, opérations.

| Effort                                                           | Bénéfice attendu                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| Restreindre `Action: "*"` à 10 actions précises (1 h de travail) | Énorme : surface d'attaque réduite de 99 %.            |
| Restreindre `Resource: "*"` à 5 ARN précis (1 h)                 | Très grand : compromission compartimentée.             |
| Ajouter des conditions IP / MFA / VPC (2-3 h)                    | Grand : protection contre vol de credentials.          |
| Audit trimestriel via Access Analyzer (4 h / trimestre)          | Constant : détection des dérives.                      |
| Refactoriser pour structurer les préfixes S3 (10-40 h)           | Énorme à long terme : ABAC propre, multi-tenant clean. |

**Règle empirique** : viser un effort modéré au moment de la création, et un audit léger récurrent. Ne pas viser la perfection initiale, mais ne pas accepter `*` non plus.

---

## 9. Exercices pratiques

### Exercice 1 — Lire CloudTrail (≈ 30 min)

**Objectif.** Premier contact avec l'audit.

**Étapes :**

1. Pour un user / rôle de votre choix dans le compte, lister les API calls des 7 derniers jours.
2. Agréger : combien d'API distinctes ? Sur combien de ressources ?
3. Identifier 3 actions qu'on pensait que l'identité faisait, et qu'elle ne fait pas (suspectes ou supprimables).
4. Identifier 3 actions inattendues.

**Livrable.** Mini-rapport (10 lignes) sur ce qu'on a observé.

### Exercice 2 — Activer Access Analyzer (≈ 20 min)

**Objectif.** Avoir le scanner allumé.

**Étapes :**

1. Créer un analyzer de type `ACCOUNT` dans `eu-west-1` (ou région principale).
2. Lister les findings au bout de 5-10 min.
3. Pour chaque finding "External Access", évaluer : légitime ou pas ?
4. Pour les "Unused Access", planifier les correctifs (avec dates).

**Livrable.** Tableau des findings + plan d'action.

### Exercice 3 — Durcir une policy existante (≈ 60 min)

**Objectif.** L'exercice central, section 7.

**Setup.** Prendre une policy actuellement attachée à un user ou rôle dans son compte (idéalement, une attachée à un workload qu'on connaît bien — sinon, demander à un collègue ou utiliser un user de test avec PowerUserAccess).

**Étapes :** suivre la méthode en 5 étapes de la section 3.

**Livrable.** Avant / après de la policy, avec justification de chaque restriction.

### Exercice 4 — Utiliser Access Analyzer Policy Generation (≈ 30 min)

**Objectif.** Manipuler l'outil de génération automatique.

**Étapes :**

1. Choisir une identité utilisée régulièrement (un rôle de Lambda, par exemple).
2. Activer la génération de policy via la console ou la CLI.
3. Attendre la génération (~15-30 min, dépend du volume).
4. Comparer la policy générée avec la policy actuelle.
5. Identifier les actions trop larges actuelles et les actions générées plus précises.

**Livrable.** Diff entre policy actuelle et policy générée, avec commentaires.

### Exercice 5 — Ajouter un Deny défensif (≈ 30 min)

**Objectif.** Mettre en place une protection même en cas de mauvaise attribution future.

**Cas.** Le bucket `confidential-archive` doit être lisible **uniquement** par le rôle `archive-reader-role`.

**Étapes :**

1. Écrire une bucket policy avec :
   - Allow pour `archive-reader-role`.
   - Deny pour tout le reste (avec `aws:PrincipalArn` qui n'est pas celui du rôle légitime).
2. Tester avec deux identités : la légitime → OK, une autre avec `s3:*` → refusée.
3. Vérifier dans CloudTrail que les refus sont bien loggés.

**Livrable.** Bucket policy + captures des tests.

### Mini-défi — Audit d'un environnement (≈ 30 min, mémo)

**Cas.** Vous arrivez dans une nouvelle équipe. Vous découvrez :

- 20 users IAM.
- 50 rôles.
- 80 policies attachées (mix AWS-managed + Customer-managed + inline).
- Pas d'Access Analyzer activé.
- Pas de revue de permissions depuis 2 ans.

**Plan d'attaque** : décrire en **8-10 étapes concrètes** sur **3 mois** comment :

1. Cartographier l'existant.
2. Identifier les risques majeurs.
3. Durcir en priorité.
4. Mettre en place un processus continu.

**Livrable.** Plan d'action chiffré (effort/jour, priorité).

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Énoncer le **principe du moindre privilège** sur ses **trois dimensions** (quoi, sur quoi, quand).
- [ ] Donner **3 bénéfices** au-delà de la sécurité pure (lisibilité, audit, hygiène opérationnelle).
- [ ] Donner **4 raisons** pour lesquelles c'est dur en pratique (actions implicites, ressources dynamiques, friction dev, complexité ops).
- [ ] Décrire la **méthode en 5 étapes** : observer → cartographier → générer → simuler/tester → itérer.
- [ ] Utiliser **CloudTrail** pour lister les API calls d'une identité.
- [ ] Utiliser **Access Analyzer** pour : detecter cross-account inattendu, lister permissions inutilisées, générer une policy.
- [ ] Utiliser **Policy Simulator** pour tester une décision avant déploiement.
- [ ] **Durcir une policy** `Action: "*", Resource: "*"` vers une policy précise en justifiant chaque restriction.
- [ ] Citer **3 patterns courants à durcir** (admin partout, full S3, IAM trop large).
- [ ] Citer **3 anti-patterns** récurrents.
- [ ] Écrire un **Deny défensif** sur une ressource sensible.

### Items du glossaire visés

**N2 atteint** :

- _principe de moindre privilège et son application dans les configurations IAM_ — toutes les sections.

---

## 11. Ressources complémentaires

### Documentation AWS

- [Least privilege best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)
- [IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html)
- [Generate policies based on access activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-generation.html)
- [Policy Simulator](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
- [CloudTrail User Guide](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)

### Outils

- [Cloudsplaining](https://github.com/salesforce/cloudsplaining) — audit open source.
- [Prowler](https://github.com/prowler-cloud/prowler) — auditeur de sécurité multi-cloud.
- [PMapper](https://github.com/nccgroup/PMapper) — graphe de privilèges IAM, détection d'escalades.
- [Aardvark / Repokid](https://github.com/Netflix/aardvark) — Netflix tools pour gérer les permissions IAM.

### Lectures

- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [SANS — Principle of Least Privilege](https://www.sans.org/cyber-security-resources/least-privilege/)
- [Cloud Security Alliance — IAM best practices](https://cloudsecurityalliance.org/)

### Pour aller plus loin

- **M7 (Cognito)** — auth utilisateur, contexte différent de l'IAM machine.
- **M8 (Identity Center)** — gestion humaine moderne.
- **Niveau 3** : IAM Access Analyzer en détail, automatisation des revues.
- **Niveau 4** : architecture IAM pour multi-comptes, SCP comme garde-fous globaux.
