# M9 — Secrets Manager vs Parameter Store

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Secrets Manager** et **AWS Systems Manager Parameter Store**, et expliquer pourquoi ces services existent (gestion centralisée, chiffrement, audit, vs hardcoder dans le code).
- Énoncer **les différences** entre Secrets Manager et Parameter Store sur au moins **six axes** : rotation automatique, prix, taille max, types de données, intégration croisée, cas d'usage typiques.
- **Récupérer un paramètre** depuis Parameter Store via CLI et SDK.
- **Récupérer un secret** depuis Secrets Manager via CLI et SDK.
- Expliquer le mode **`SecureString`** dans Parameter Store : intégration KMS, chiffrement at-rest, déchiffrement à la demande, permissions séparées (KMS key policy + paramètre IAM policy).
- **Stocker et lire un secret depuis une Lambda** end-to-end : config Lambda → IAM permissions → KMS access → code de lecture en Python.
- Reconnaître les patterns d'usage canoniques (DB credentials avec rotation, config statique, hiérarchie de paramètres) et les anti-patterns (secrets dans variables d'environnement Lambda, hardcodage, scope IAM trop large).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M8 (IAM, policies, AssumeRole, Identity Center).
- AWS CLI v2 configurée.
- Une Lambda à disposition (ou possibilité d'en créer une).
- Notions basiques de KMS (utile, mais le module M10 couvre KMS — un rappel court est fait en section 6).

---

## 1. Pourquoi un service de gestion des secrets

### 1.1 — Le problème — où mettre les secrets

Toute application a besoin de **secrets** : mot de passe DB, clé API tiers, clé de chiffrement, token JWT signing, certificat client, …

Mauvaises pratiques courantes :

| Anti-pattern                                     | Risque                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Hardcoder dans le code source.                   | Git history publique = leak permanent.                                                              |
| `.env` poussé dans le repo par erreur.           | Idem.                                                                                               |
| Variables d'environnement de l'instance EC2.     | Visible dans `/proc/<pid>/environ`, dump d'instance, logs.                                          |
| Variables d'environnement Lambda **en clair**.   | Visible dans la console, dans CloudFormation, par tout user avec `lambda:GetFunctionConfiguration`. |
| Fichier sur le disque sans chiffrement.          | Compromission EC2 = compromission secrets.                                                          |
| Copier-coller entre développeurs (Slack, mails). | Audit impossible, rotation impossible.                                                              |

### 1.2 — Ce qu'on attend d'un service de secrets

| Capacité                      | Pourquoi                                      |
| ----------------------------- | --------------------------------------------- |
| **Stockage chiffré** au repos | Le disque physique compromis ne révèle rien.  |
| **Chiffrement à la volée**    | Le secret est déchiffré uniquement à l'usage. |
| **Contrôle d'accès IAM**      | Audit : qui peut lire quoi.                   |
| **Audit CloudTrail**          | Audit : qui a lu quoi quand.                  |
| **Rotation automatique**      | Pas d'oubli, pas de friction.                 |
| **Versioning**                | Rollback en cas de problème.                  |
| **API standard**              | Intégration uniforme dans toutes les apps.    |

**AWS Secrets Manager** offre tout cela. **Parameter Store** offre la majorité (sauf rotation native). À choisir selon le cas d'usage.

### 1.3 — L'analogie du coffre vs le tableau d'affichage

- **Secrets Manager** : un **coffre-fort** dans la banque. Auto-rotation par la banque, audit fin, payant à l'usage.
- **Parameter Store** : un **tableau d'affichage** (sécurisé) dans la salle de réunion. Gratuit ou très bon marché, simple, idéal pour de la configuration générale, mais sans services de coffre-fort (pas de rotation auto native).

---

## 2. AWS Secrets Manager — le service complet

### 2.1 — Caractéristiques

- **Stockage de secrets** (binaires ou texte structuré JSON).
- **Chiffrement KMS** obligatoire (clé AWS-managed par défaut, ou clé custom).
- **Rotation automatique** native pour : RDS, Aurora, Redshift, DocumentDB, autres bases de données via Lambda custom.
- **Versioning** : `AWSCURRENT`, `AWSPREVIOUS`, `AWSPENDING` (pour les rotations).
- **Cross-region replication**.
- **Tarif** : 0,40 $/secret/mois + 0,05 $/10 000 API calls.

### 2.2 — Anatomie d'un secret

```graph
Secret : "prod/db/postgres-master"
├── Description : "Master credentials for prod PostgreSQL"
├── KMS Key : alias/aws/secretsmanager (ou custom)
├── Versions :
│   ├── AWSCURRENT  → version-id-v3
│   ├── AWSPREVIOUS → version-id-v2
│   └── AWSPENDING  → (vide, sauf pendant rotation)
├── Rotation :
│   ├── Lambda function : arn:aws:lambda:...:function:rotate-postgres
│   ├── Schedule : automatic, every 30 days
│   └── Last rotated : 2026-04-17T03:00:00Z
└── Tags : Environment=prod, Owner=backend
```

### 2.3 — Format typique du value

Pour des credentials DB, AWS recommande un **JSON structuré** :

```json
{
  "username": "admin",
  "password": "VerySecretPassword123!",
  "engine": "postgres",
  "host": "prod-db.eu-west-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "appdb"
}
```

Pour une clé API tiers, le simple texte suffit :

```txt
sk_live_abc123def456...
```

### 2.4 — Rotation automatique — la killer feature

Configurer une rotation tous les **30 jours** :

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/postgres-master \
  --rotation-lambda-arn arn:aws:lambda:eu-west-1:ACCOUNT:function:rotate-postgres \
  --rotation-rules AutomaticallyAfterDays=30
```

Le workflow de rotation :

1. **Create** : la Lambda génère un nouveau password, le pousse vers `AWSPENDING`.
2. **Set** : la Lambda applique le nouveau password sur la DB.
3. **Test** : la Lambda vérifie qu'elle peut se logger avec le nouveau password.
4. **Finish** : `AWSPENDING` devient `AWSCURRENT`, l'ancien devient `AWSPREVIOUS`.

Pour les bases AWS-managed (RDS, Aurora), AWS fournit la Lambda de rotation **prête à l'emploi**. Pour d'autres bases ou clés API, il faut écrire sa propre Lambda (templates disponibles).

### 2.5 — Pricing — l'enjeu pour les gros volumes

- **0,40 $/secret/mois**.
- **0,05 $/10 000 API calls**.

À 1 000 secrets : **400 $/mois**. C'est **cher** comparé à Parameter Store si on a beaucoup d'éléments simples.

**Optimisation typique** : ne mettre **que les vrais secrets** dans Secrets Manager (DB, clés API), et la **config statique** dans Parameter Store.

---

## 3. AWS Systems Manager Parameter Store — le service léger

### 3.1 — Caractéristiques

- Service **gratuit pour les paramètres standard** (jusqu'à 10 000 paramètres / compte / région).
- **3 types de valeurs** : `String`, `StringList`, `SecureString`.
- **Hiérarchie** par paths : `/app/prod/db/url`, `/app/prod/db/password`.
- **Versioning** automatique (jusqu'à 100 versions par paramètre).
- **Pas de rotation native** (mais on peut implémenter via EventBridge + Lambda custom).
- **Limite de taille** : 4 KB standard, 8 KB advanced.

### 3.2 — Types

| Type             | Stockage                   | Cas d'usage                             |
| ---------------- | -------------------------- | --------------------------------------- |
| **String**       | Texte clair                | URL, ID, valeur de config non sensible. |
| **StringList**   | Liste séparée par virgules | Liste d'IPs autorisées, etc.            |
| **SecureString** | **Chiffré KMS**            | Mot de passe, clé API, secret sensible. |

### 3.3 — Tiers

- **Standard** : gratuit, 4 KB max, 10 000 paramètres / compte / région.
- **Advanced** : payant (0,05 $/paramètre/mois), 8 KB max, 100 000 paramètres / compte / région, **policies** (expiration, notification).

### 3.4 — Hiérarchie

Parameter Store permet une **hiérarchie naturelle** :

```graph
/myapp/
├── prod/
│   ├── db/
│   │   ├── host       (String)         = "prod-db.eu-west-1.rds.amazonaws.com"
│   │   ├── port       (String)         = "5432"
│   │   └── password   (SecureString)   = "<chiffré KMS>"
│   ├── api/
│   │   ├── stripe-key (SecureString)
│   │   └── twilio-sid (String)
│   └── feature-flags/
│       ├── new-checkout (String)       = "true"
│       └── beta-feature (String)       = "false"
├── staging/
│   └── ... (même structure)
└── dev/
    └── ...
```

Cette organisation facilite :

- **Récupération en masse** : `aws ssm get-parameters-by-path --path /myapp/prod/`.
- **Permissions IAM** : `resource: arn:aws:ssm:...:parameter/myapp/prod/*`.
- **Audit et lisibilité**.

---

## 4. Comparaison complète

C'est **l'item N1 majeur** : connaître la différence.

| Critère                            | Secrets Manager                              | Parameter Store                                       |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| **Cas d'usage principal**          | Secrets dynamiques avec rotation             | Config + secrets statiques                            |
| **Rotation automatique native**    | **Oui** (RDS, Aurora, …)                     | Non (à coder via EventBridge + Lambda)                |
| **Versioning**                     | Oui (named: CURRENT/PREVIOUS/PENDING)        | Oui (numéroté, jusqu'à 100 versions)                  |
| **Cross-region replication**       | Oui                                          | Non native                                            |
| **Taille max**                     | 64 KB                                        | 4 KB (standard), 8 KB (advanced)                      |
| **Tarif**                          | **0,40 $/secret/mois** + 0,05 $/10k requêtes | **Gratuit** standard ; 0,05 $/paramètre/mois advanced |
| **Format JSON natif**              | Oui (structure encouragée)                   | Non (texte brut, parser manuel si JSON)               |
| **Hiérarchie de paths**            | Non (noms plats)                             | **Oui** (`/app/prod/db/*`)                            |
| **Audit CloudTrail**               | Oui (Read et Write)                          | Oui                                                   |
| **Intégration KMS**                | Oui (par défaut)                             | Oui (SecureString)                                    |
| **Intégration directe ECS/Lambda** | Oui (variables d'env)                        | Oui (variables d'env)                                 |
| **Référencement croisé**           | Possible via ARN                             | Possible via ARN                                      |
| **Limite par compte/région**       | 500 000 secrets                              | 10 000 (standard), 100 000 (advanced)                 |

### 4.1 — La règle de décision simple

```graph
Question : ce que je veux stocker doit-il être ROTATIONNÉ automatiquement ?

  ├── Oui → Secrets Manager
  │   (DB credentials, OAuth tokens d'API tierces avec besoin de rotation)
  │
  └── Non
      ├── Sensible (clé API, secret) → Parameter Store SecureString
      │   (clé API tierce sans rotation native, JWT signing secret, …)
      │
      └── Non sensible (URL, config, feature flag) → Parameter Store String
```

### 4.2 — Cas concrets

| Cas                                                              | Service recommandé               |
| ---------------------------------------------------------------- | -------------------------------- |
| Master password RDS PostgreSQL en prod.                          | **Secrets Manager** (rotation).  |
| Token Stripe (`sk_live_*`).                                      | Parameter Store SecureString.    |
| URL de l'API : `https://api.example.com`.                        | Parameter Store String.          |
| Liste d'IPs autorisées.                                          | Parameter Store StringList.      |
| Feature flag `new_checkout=true`.                                | Parameter Store String.          |
| Clé d'API d'un partenaire critique, à rotater tous les 90 jours. | Secrets Manager.                 |
| Certificat TLS (PEM, ~3 KB).                                     | Parameter Store advanced ou ACM. |

---

## 5. Récupération — CLI et SDK

### 5.1 — Parameter Store — CLI

```bash
# Lire un paramètre String
aws ssm get-parameter --name /myapp/prod/db/host

# Sortie :
# {
#   "Parameter": {
#     "Name": "/myapp/prod/db/host",
#     "Type": "String",
#     "Value": "prod-db.eu-west-1.rds.amazonaws.com",
#     "Version": 3,
#     "LastModifiedDate": "2026-05-10T10:30:00Z",
#     "ARN": "arn:aws:ssm:..."
#   }
# }

# Lire un SecureString (déchiffré)
aws ssm get-parameter --name /myapp/prod/db/password --with-decryption

# Sans --with-decryption, la valeur reste chiffrée :
aws ssm get-parameter --name /myapp/prod/db/password
# Renvoie la valeur en base64 chiffré, peu utile en pratique

# Lister par path
aws ssm get-parameters-by-path --path /myapp/prod/ --recursive --with-decryption

# Lister plusieurs paramètres en une fois
aws ssm get-parameters --names /myapp/prod/db/host /myapp/prod/db/port --with-decryption
```

### 5.2 — Parameter Store — Python SDK

```python
import boto3

ssm = boto3.client("ssm", region_name="eu-west-1")

# Un paramètre
response = ssm.get_parameter(
    Name="/myapp/prod/db/password",
    WithDecryption=True,
)
password = response["Parameter"]["Value"]

# Plusieurs paramètres
response = ssm.get_parameters(
    Names=["/myapp/prod/db/host", "/myapp/prod/db/port", "/myapp/prod/db/password"],
    WithDecryption=True,
)
config = {p["Name"]: p["Value"] for p in response["Parameters"]}

# Tout sous un préfixe
response = ssm.get_parameters_by_path(
    Path="/myapp/prod/",
    Recursive=True,
    WithDecryption=True,
)
config = {p["Name"]: p["Value"] for p in response["Parameters"]}
```

### 5.3 — Secrets Manager — CLI

```bash
# Lire le secret en version courante
aws secretsmanager get-secret-value --secret-id prod/db/postgres-master

# Sortie :
# {
#   "ARN": "arn:aws:secretsmanager:...",
#   "Name": "prod/db/postgres-master",
#   "VersionId": "version-uuid",
#   "SecretString": "{\"username\":\"admin\",\"password\":\"...\",\"host\":\"...\"}",
#   "VersionStages": ["AWSCURRENT"],
#   "CreatedDate": "..."
# }

# Si le secret est en JSON, parser
aws secretsmanager get-secret-value --secret-id prod/db/postgres-master \
  --query 'SecretString' --output text | jq '.password'

# Lire une version spécifique
aws secretsmanager get-secret-value --secret-id prod/db/postgres-master \
  --version-stage AWSPREVIOUS
```

### 5.4 — Secrets Manager — Python SDK

```python
import boto3, json

sm = boto3.client("secretsmanager", region_name="eu-west-1")

response = sm.get_secret_value(SecretId="prod/db/postgres-master")
secret = json.loads(response["SecretString"])

# secret = {"username": "admin", "password": "...", "host": "...", ...}
db_password = secret["password"]
```

### 5.5 — Cache et performance

**Anti-pattern courant** : faire `get_parameter` / `get_secret_value` à **chaque requête** d'une application.

- Coût (Secrets Manager facture par API call).
- Latence (~20-50 ms par call).
- Risque de throttling (limites API).

**Solution** : cacher les valeurs **en mémoire** au démarrage de l'application, avec un TTL de 5-15 min. Pour Lambda :

- Charger au **cold start** (en haut du fichier, hors du handler).
- Bénéficier du reuse de container Lambda.

```python
import boto3, os
sm = boto3.client("secretsmanager")
# Chargé une seule fois par container Lambda
SECRET = json.loads(sm.get_secret_value(SecretId=os.environ["SECRET_NAME"])["SecretString"])

def handler(event, context):
    db_password = SECRET["password"]
    # ...
```

**Outils** : AWS fournit le **Parameters and Secrets Lambda Extension** qui cache automatiquement avec un endpoint HTTP local. Pratique pour les Lambdas.

---

## 6. SecureString dans Parameter Store (item N2)

C'est **l'item N2 explicite** du module : expliquer le fonctionnement de SecureString.

### 6.1 — Qu'est-ce que SecureString

Un paramètre Parameter Store de type **`SecureString`** est :

- **Stocké chiffré** via AWS KMS.
- **Renvoyé en clair** uniquement si la requête `GetParameter` inclut `--with-decryption`.
- **Lié à une clé KMS** : `alias/aws/ssm` (clé AWS-managed par défaut, gratuite) ou une **clé KMS custom** (du compte ou cross-account).

### 6.2 — Le chiffrement — comment ça marche

```md
1. Stockage :
   - L'application appelle ssm:PutParameter(Type=SecureString, Value="mypassword")
   - Parameter Store appelle kms:Encrypt(KeyId=<clé>, Plaintext="mypassword")
   - KMS renvoie le ciphertext
   - Parameter Store stocke le ciphertext

2. Lecture (avec --with-decryption) :
   - L'application appelle ssm:GetParameter(Name=..., WithDecryption=True)
   - Parameter Store appelle kms:Decrypt(CiphertextBlob=...)
   - KMS renvoie le plaintext
   - Parameter Store renvoie le plaintext à l'application
```

À **chaque** lecture, KMS est sollicité (sauf cache niveau SDK). Cela génère :

- **Audit CloudTrail** côté KMS (qui a déchiffré ce paramètre quand).
- **Coût KMS** (0,03 $/10 000 requêtes Decrypt).

### 6.3 — Permissions — la double évaluation

Pour qu'une identité puisse lire un SecureString, **deux** permissions doivent être réunies :

1. **`ssm:GetParameter`** sur l'ARN du paramètre.
2. **`kms:Decrypt`** sur la clé KMS qui chiffre le paramètre.

Si on utilise la **clé AWS-managed** `alias/aws/ssm` (défaut) :

- L'IAM policy `ssm:GetParameter` **suffit** pour les paramètres du compte.
- AWS configure automatiquement la policy KMS via le service `ssm.amazonaws.com`.

Si on utilise une **clé KMS custom** :

- Il faut **également** une permission `kms:Decrypt` sur la clé, attribuée par la **key policy** de la clé (vu en M10) **ou** par une IAM policy attachée à l'identité.

C'est la **subtilité** qui surprend les débutants : "j'ai `ssm:GetParameter`, pourquoi ça ne marche pas ?" → la clé KMS custom refuse, il faut aussi `kms:Decrypt`.

### 6.4 — Pourquoi utiliser une clé KMS custom

| Option                            | Pour quoi                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Clé AWS-managed (`alias/aws/ssm`) | Simple, gratuit. Bien pour la majorité des cas.                                                                |
| Clé custom (Customer-managed CMK) | Audit fin (qui a Decrypt sur cette clé), rotation contrôlée, cross-account sharing, conformité (HSM CloudHSM). |

Pour des secrets **vraiment sensibles** (clés de signature, secrets de prod), recommandé : clé custom + key policy restrictive.

### 6.5 — Exemple complet

**Créer un paramètre SecureString** :

```bash
# Avec la clé AWS-managed
aws ssm put-parameter \
  --name /myapp/prod/db/password \
  --value "VerySecretPassword123!" \
  --type SecureString

# Avec une clé custom
aws ssm put-parameter \
  --name /myapp/prod/db/password \
  --value "VerySecretPassword123!" \
  --type SecureString \
  --key-id arn:aws:kms:eu-west-1:ACCOUNT:key/12345678-1234-1234-1234-1234567890ab
```

**Lire** :

```bash
aws ssm get-parameter \
  --name /myapp/prod/db/password \
  --with-decryption \
  --query 'Parameter.Value' --output text
# → VerySecretPassword123!
```

**Policy IAM minimale pour lire** :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:eu-west-1:ACCOUNT:parameter/myapp/prod/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:eu-west-1:ACCOUNT:key/12345678-1234-1234-1234-1234567890ab"
    }
  ]
}
```

Le deuxième statement n'est nécessaire **que si on utilise une clé KMS custom**. Avec la clé AWS-managed, le premier statement suffit.

---

## 7. Patterns d'usage canoniques

### 7.1 — DB credentials avec rotation (Secrets Manager)

```python
import boto3, json, psycopg2, os

sm = boto3.client("secretsmanager")

def get_db_connection():
    secret = json.loads(sm.get_secret_value(SecretId="prod/db/postgres")["SecretString"])
    return psycopg2.connect(
        host=secret["host"],
        port=secret["port"],
        dbname=secret["dbname"],
        user=secret["username"],
        password=secret["password"],
    )
```

La rotation auto par Secrets Manager :

- Lambda RDS rotation fait : nouvelle valeur → applique sur RDS → vérifie connexion → promote.
- L'application qui re-lit le secret après une rotation obtient automatiquement les nouveaux credentials.

### 7.2 — Config par environnement (Parameter Store)

```tree
/myapp/dev/
/myapp/staging/
/myapp/prod/
```

Lambda env var : `CONFIG_PATH=/myapp/prod`

```python
import boto3, os

ssm = boto3.client("ssm")
PATH = os.environ["CONFIG_PATH"]
params = ssm.get_parameters_by_path(Path=PATH, Recursive=True, WithDecryption=True)
CONFIG = {p["Name"].replace(PATH + "/", ""): p["Value"] for p in params["Parameters"]}
```

### 7.3 — Feature flags

```txt
/myapp/prod/features/new-checkout       String  "true"
/myapp/prod/features/dark-mode          String  "false"
/myapp/prod/features/beta-users         StringList  "user-1,user-42,user-100"
```

Lecture programmatique à chaque déploiement ou en runtime (cache TTL).

### 7.4 — Référencement croisé Secrets Manager ↔ Parameter Store

Un paramètre Parameter Store peut **référencer** un secret Secrets Manager :

```txt
/myapp/prod/db/credentials = secretsmanager:prod/db/postgres-master
```

À la lecture, AWS résout automatiquement. Permet de centraliser dans Secrets Manager tout en gardant une hiérarchie Parameter Store.

### 7.5 — Intégration variables d'environnement Lambda

```bash
# Référence directe dans la config Lambda
aws lambda update-function-configuration \
  --function-name my-fn \
  --environment Variables={DB_SECRET_NAME=prod/db/postgres-master}
```

Dans la Lambda, lire `os.environ["DB_SECRET_NAME"]` puis l'utiliser comme `SecretId` du SDK.

**Anti-pattern** : mettre le secret **directement** comme valeur de l'env var. La valeur est visible en clair dans la config Lambda → contournement de la sécurité.

---

## 8. Pratique — Lambda lit un secret end-to-end

L'objectif : mettre en place une Lambda Python qui lit un secret de Secrets Manager pour se connecter à une base.

### 8.1 — Plan

1. Créer un secret dans Secrets Manager.
2. Créer une Lambda Python.
3. Donner à la Lambda les permissions `secretsmanager:GetSecretValue` + `kms:Decrypt` si CMK custom.
4. La Lambda lit le secret au cold start, l'utilise dans le handler.

### 8.2 — Étape 1 — Créer le secret

```bash
aws secretsmanager create-secret \
  --name prod/external-api/key \
  --description "API key for external service X" \
  --secret-string '{"api_key":"sk_live_abcdef123456"}' \
  --region eu-west-1
```

### 8.3 — Étape 2 — Code Lambda

```python
# lambda_function.py
import json, os
import boto3

SECRET_NAME = os.environ["SECRET_NAME"]
sm = boto3.client("secretsmanager")

# Chargé au cold start, partagé entre invocations du même container
SECRET = json.loads(sm.get_secret_value(SecretId=SECRET_NAME)["SecretString"])

def lambda_handler(event, context):
    api_key = SECRET["api_key"]
    # Faire un appel à l'API tierce avec cette clé
    # ...
    return {
        "statusCode": 200,
        "body": json.dumps({"message": f"used key starting with {api_key[:10]}..."})
    }
```

### 8.4 — Étape 3 — Rôle IAM de la Lambda

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ReadSecret",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:prod/external-api/key-*"
    }
  ]
}
```

À noter : l'ARN d'un secret contient un suffixe aléatoire (`-AbCdEf`). On utilise un wildcard `-*` ou la valeur exacte.

Si la clé KMS est custom :

```json
{
  "Sid": "KMSDecrypt",
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "arn:aws:kms:eu-west-1:ACCOUNT:key/<KEY_ID>"
}
```

### 8.5 — Étape 4 — Créer / mettre à jour la Lambda

```bash
zip lambda.zip lambda_function.py

aws lambda create-function \
  --function-name read-secret-lambda \
  --runtime python3.12 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://lambda.zip \
  --role arn:aws:iam::ACCOUNT:role/lambda-read-secret-role \
  --environment Variables={SECRET_NAME=prod/external-api/key}
```

### 8.6 — Étape 5 — Tester

```bash
aws lambda invoke --function-name read-secret-lambda /tmp/out.json
cat /tmp/out.json
# → {"statusCode": 200, "body": "{\"message\": \"used key starting with sk_live_ab...\"}"}
```

Et observer dans CloudTrail : un événement `GetSecretValue` avec l'identité du rôle Lambda et le timestamp.

---

## 9. Anti-patterns récurrents

| Anti-pattern                                                          | Conséquence                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Secret stocké en clair dans une **variable d'env Lambda**.            | Visible par tout user avec `lambda:GetFunctionConfiguration`. |
| **Hardcoder** le secret dans le code source.                          | Git history = leak permanent.                                 |
| Faire `GetSecretValue` à **chaque requête HTTP**.                     | Coût + latence + risque throttling.                           |
| **IAM trop large** : `secretsmanager:*` sur `*`.                      | Une compromission = tous les secrets accessibles.             |
| Stocker un secret **non chiffré** dans Parameter Store (type String). | Pas de chiffrement at-rest. À utiliser SecureString.          |
| Confondre **secret** (à protéger) et **config** (URL, port, etc.).    | Soit on sur-protège, soit on sous-protège.                    |
| Mettre les **certificats TLS** dans Secrets Manager.                  | Préférable : **ACM** (vu en M10).                             |
| Pas de **rotation** sur les credentials critiques (DB, OAuth).        | Une compromission = accès durable.                            |
| Ne **pas auditer** les `GetSecretValue` dans CloudTrail.              | Compromission silencieuse impossible à détecter.              |
| Stocker un secret **trop gros** (> 4 KB) en Parameter Store standard. | Limite atteinte. Utiliser advanced ou Secrets Manager.        |

---

## 10. Exercices pratiques

### Exercice 1 — Stocker et lire des paramètres (≈ 30 min)

**Objectif.** Premiers pas avec Parameter Store.

**Étapes :**

1. Créer 3 paramètres :
   - `/tp/dev/db/host` (String) : valeur arbitraire.
   - `/tp/dev/db/port` (String) : `5432`.
   - `/tp/dev/db/password` (SecureString, clé AWS-managed) : un mot de passe inventé.
2. Lire chaque paramètre via CLI.
3. Lire `/tp/dev/db/password` **sans** `--with-decryption` puis **avec** : observer la différence.
4. Modifier le password, observer le versioning : `aws ssm get-parameter-history --name /tp/dev/db/password`.

**Livrable.** Captures des commandes + une phrase sur la différence avec/sans decryption.

### Exercice 2 — Lire des paramètres par path (≈ 20 min)

**Objectif.** Utiliser la hiérarchie.

**Étapes :**

1. Sur le path `/tp/dev/`, lire tous les paramètres en une seule commande.
2. En SDK Python, faire un dict `config[name] = value`.
3. Bonus : faire une fonction qui prend un path en entrée et renvoie le dict.

**Livrable.** Script Python fonctionnel.

### Exercice 3 — Créer et lire un secret Secrets Manager (≈ 30 min)

**Objectif.** Premier secret.

**Étapes :**

1. Créer un secret JSON `{"api_key": "sk_test_abc", "endpoint": "https://api.example.com"}`.
2. Lire via CLI + parser le JSON pour extraire `api_key`.
3. Lire via Python (`boto3.client("secretsmanager").get_secret_value`).

**Livrable.** Captures + script.

### Exercice 4 — Lambda qui lit un secret (≈ 45 min)

**Objectif.** L'exercice central, section 8.

**Étapes :** suivre la section 8 — créer secret, créer Lambda, créer rôle IAM, déployer, tester.

**Bonus :** observer les **cold starts** vs invocations chaudes — au premier appel, l'API GetSecretValue est appelée ; aux suivants (container réutilisé), non.

**Livrable.** Capture des logs CloudWatch Lambda (premier cold start vs warm) + extrait CloudTrail montrant l'événement GetSecretValue.

### Exercice 5 — Configurer une rotation Secrets Manager (≈ 30 min, optionnel)

**Objectif.** Toucher la rotation.

**Étapes :**

1. Sur le secret de l'exercice 4, configurer une rotation tous les 30 jours via une Lambda template (depuis la console, choisir "Other type of secret" + template).
2. Manuellement déclencher la rotation : `aws secretsmanager rotate-secret --secret-id ... --rotation-rules ...`.
3. Observer : `AWSPENDING` puis `AWSCURRENT`.
4. Vérifier que l'ancien value est en `AWSPREVIOUS`.

**Livrable.** Capture des versions.

### Exercice 6 — Permissions fines avec SecureString + clé KMS custom (≈ 45 min, niveau N2)

**Objectif.** Maîtriser la double évaluation IAM + KMS.

**Étapes :**

1. Créer une **clé KMS custom** dans le compte.
2. Créer un paramètre SecureString chiffré avec **cette clé custom**.
3. Créer un rôle IAM avec **uniquement** `ssm:GetParameter` (pas de KMS).
4. Tenter de lire avec `--with-decryption` : doit **échouer** (KMS refuse).
5. Ajouter `kms:Decrypt` sur la clé custom dans la policy du rôle.
6. Re-tenter : doit **fonctionner**.

**Livrable.** Captures avant/après + une phrase expliquant la double évaluation.

### Mini-défi — Architecture secrets pour une app SaaS (≈ 30 min, papier)

**Cas.** Application FastAPI déployée sur ECS Fargate avec :

- 3 environnements (dev, staging, prod).
- Connexion à RDS PostgreSQL.
- Appels à 3 API tierces (Stripe, Twilio, SendGrid).
- Feature flags (~10).
- Configuration de logs (URLs, formats).

**Concevoir** :

1. Quoi dans Secrets Manager ? Quoi dans Parameter Store ?
2. Structure hiérarchique de Parameter Store.
3. Rotations à activer.
4. Policies IAM nécessaires pour ECS task role.
5. Stratégie de cache côté app.

**Livrable.** Schéma + matrice de décision.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Secrets Manager** et **Parameter Store** et leur cas d'usage principal.
- [ ] Citer les **6 différences** majeures (rotation, prix, taille, types, hiérarchie, intégration).
- [ ] Énoncer la **règle de décision** : rotation auto → Secrets Manager ; sinon → Parameter Store.
- [ ] **Récupérer un paramètre** Parameter Store de mémoire (CLI + Python).
- [ ] **Récupérer un secret** Secrets Manager de mémoire (CLI + Python).
- [ ] Définir **SecureString** : chiffrement KMS at-rest, déchiffrement à la lecture, intégration KMS automatique.
- [ ] Expliquer la **double évaluation IAM + KMS** pour SecureString avec clé custom.
- [ ] Configurer une **Lambda lisant un secret** depuis zéro (IAM, env var, code).
- [ ] Citer le **bon endroit** où charger un secret dans une Lambda (cold start, pas par invocation).
- [ ] Citer **3 anti-patterns** : variable d'env Lambda en clair, hardcode, IAM trop large.
- [ ] Décrire les **3 versions Secrets Manager** : AWSCURRENT, AWSPREVIOUS, AWSPENDING.

### Items du glossaire visés

**N1 atteint** :

- _récupérer un secret de Secret Manager_ — sections 5.3-5.4.
- _différence entre Secret Manager et Parameter Store_ — section 4.
- _récupérer un paramètre du Parameter Store_ — sections 5.1-5.2.

**N2 atteint** :

- _fonctionnement du mode SecureString dans Parameter Store_ — section 6.

---

## 12. Ressources complémentaires

### Documentation AWS

- [Secrets Manager User Guide](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [Parameter Store User Guide](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [SecureString](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-securestring-parameters.html)
- [Secrets Manager rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)
- [Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html)

### Outils

- [aws-secretsmanager-agent](https://github.com/aws/aws-secretsmanager-agent) — cache local pour secrets.
- [chamber](https://github.com/segmentio/chamber) — CLI tool pour Parameter Store.

### Bonnes pratiques

- [AWS Well-Architected — Secrets management](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [Twelve-Factor App: Config](https://12factor.net/config) — principes de séparation config/code.

### Pour aller plus loin

- **M10 (KMS et Certificate Manager)** — la couche en-dessous, chiffrement et certificats.
- **Niveau 3** : rotation custom pour API tierces, granularité d'accès aux secrets, intégrations services AWS.
- **Mini-projet** du parcours (M11) — design IAM complet d'une app multi-rôle.
