# M11 — Mini-projet final du parcours AWS Identity

## Objectif

Ce mini-projet **clôt le parcours AWS Identity** et valide les compétences **Confirmé N2** sur l'ensemble des modules M1-M10.

À la fin du mini-projet, l'apprenant aura conçu et déployé **un système d'identité complet** pour une application réaliste, en orchestrant :

- **Cognito** pour l'authentification des utilisateurs finaux (M7).
- **Identity Center** pour l'accès des opérateurs (M8).
- **Policies IAM** avec moindre privilège, identity-based et resource-based (M2, M4, M6).
- **Rôles** assumés par les services AWS (Lambda, ECS) avec credentials temporaires (M3, M5).
- **Secrets Manager** et **Parameter Store** pour les secrets applicatifs (M9).
- **KMS** et **ACM** pour le chiffrement et les certificats (M10).
- **Permission Boundaries** pour cadrer la délégation (M4).

## Durée estimée

2 à 4 jours selon le périmètre choisi.

## Pré-requis

- M1-M10 du parcours **AWS Identity** complets.
- Le mini-projet du parcours **AWS Networking** est un **plus** (VPC à 2 AZ, ALB, CloudFront, Route 53), mais on peut faire ce mini-projet sans, en mode "Lambda + API Gateway + DynamoDB" qui ne nécessite pas de VPC.
- AWS CLI v2, permissions IAM complètes dans un compte sandbox (ou ressources créables).
- Un nom de domaine (sous-domaine d'un domaine que vous contrôlez) — recommandé mais optionnel.

---

## 1. L'énoncé

### 1.1 — Le contexte fictif

Vous êtes l'architecte sécurité d'une **startup SaaS** qui développe une plateforme de **gestion de notes personnelles** avec :

- **Utilisateurs finaux** (`alice@example.com`, `bob@example.com`, …) qui se loguent à l'app web pour gérer leurs notes.
- **Opérateurs internes** (devs, ops, support) qui accèdent à AWS pour développer / opérer.
- Trois **environnements** : `dev`, `staging`, `prod`.

L'app stocke :

- Des **notes textuelles** dans **DynamoDB**.
- Des **fichiers attachés** (images, PDF) dans **S3**.
- Des **clés API tierces** (par exemple, Stripe pour la facturation) dans **Secrets Manager**.

Les **trois personas** opérateurs à gérer :

- **Admin** : full accès tous environnements.
- **Developer** : full accès dev/staging, read-only sur prod.
- **Support** : read-only sur les données utilisateur en prod (pour assistance), aucun accès en écriture.

### 1.2 — Les exigences de sécurité

- **Authentification utilisateur** : email + password + MFA optionnel via Cognito.
- **Authentification opérateurs** : via Identity Center (avec MFA obligatoire).
- **Moindre privilège** strict pour tous les rôles applicatifs.
- **Permission Boundary** pour cadrer ce que les devs peuvent créer.
- **Tous les secrets** dans Secrets Manager ou Parameter Store SecureString.
- **Toutes les données au repos** chiffrées via KMS (CMK custom pour la prod).
- **Tous les endpoints publics** en HTTPS avec cert ACM.
- **Audit** : CloudTrail activé sur tous les services.
- **Isolation** : un user ne peut accéder qu'**à ses propres** notes et fichiers.

---

## 2. L'architecture cible

```graph
┌──────────────────────────────────────────────────────────────────────────┐
│ Opérateurs (devs, ops, support)                                          │
│ Identity Center → Permission Sets → rôles dans comptes dev/staging/prod  │
└────────────────────────────────────────┬─────────────────────────────────┘
                                         │
                                         │ aws sso login
                                         ▼
       ┌──────────────────────────────────────────────────────────────┐
       │ AWS Account "prod" (focus du mini-projet)                    │
       │                                                              │
       │   ┌─────────────┐         ┌──────────────┐                   │
       │   │ Cognito     │         │ ACM          │                   │
       │   │ User Pool   │         │ cert *.app.. │                   │
       │   └──────┬──────┘         └──────┬───────┘                   │
       │          │                       │                           │
       │          │ JWT                   │                           │
       │          ▼                       ▼                           │
       │   ┌─────────────────────────────────────┐                    │
       │   │ API Gateway (HTTP API)              │                    │
       │   │ JWT Authorizer Cognito              │                    │
       │   │ Custom domain api.app.example.com   │                    │
       │   └────────────────┬────────────────────┘                    │
       │                    │                                         │
       │                    ▼                                         │
       │   ┌─────────────────────────────────────┐                    │
       │   │ Lambda "notes-api"                  │                    │
       │   │ Execution Role : notes-api-role     │                    │
       │   │ - DynamoDB CRUD (avec préfixe user) │                    │
       │   │ - S3 CRUD (avec préfixe user)       │                    │
       │   │ - Secrets Manager Read (Stripe)     │                    │
       │   │ - KMS Decrypt (CMK)                 │                    │
       │   └─────┬─────────┬─────────┬───────────┘                    │
       │         │         │         │                                │
       │   ┌─────▼───┐ ┌───▼────┐ ┌──▼─────────┐                      │
       │   │DynamoDB │ │  S3    │ │ Secrets    │                      │
       │   │"notes"  │ │"files" │ │ Manager    │                      │
       │   │(KMS)    │ │(KMS)   │ │ "stripe"   │                      │
       │   └─────────┘ └────────┘ └────────────┘                      │
       │                                                              │
       │   ┌─────────────────────┐                                    │
       │   │ Customer-managed    │                                    │
       │   │ KMS Key (CMK)       │                                    │
       │   │ alias/notes-prod    │                                    │
       │   └─────────────────────┘                                    │
       └──────────────────────────────────────────────────────────────┘
```

### 2.1 — Choix d'architecture

Pour simplifier (et rester dans le scope d'**Identity**), on retient l'**architecture serverless** plutôt qu'EC2 + RDS :

- **Lambda** au lieu d'EC2 → pas besoin de VPC, plus simple.
- **DynamoDB** au lieu de RDS → idem.
- **API Gateway** au lieu d'ALB → idem.

Si on **a** déjà fait le mini-projet du parcours Networking, on peut **alternativement** déployer en VPC avec ECS Fargate + RDS — le squelette IAM reste identique.

---

## 3. Étapes de mise en œuvre

Vue d'ensemble — **9 étapes** :

```md
1. Cognito User Pool (auth utilisateurs)
2. KMS CMK (chiffrement)
3. Secrets Manager (clé Stripe)
4. DynamoDB (notes) + S3 (files) avec SSE-KMS
5. Lambda + IAM execution role moindre privilège
6. API Gateway HTTP API + JWT Authorizer Cognito
7. ACM + custom domain + Route 53
8. Identity Center + Permission Sets pour les opérateurs
9. Permission Boundary pour les devs
```

### 3.1 — Étape 1 — Cognito User Pool

```bash
USER_POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name notes-app-users-prod \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --auto-verified-attributes email \
  --username-attributes email \
  --schema "Name=email,AttributeDataType=String,Required=true,Mutable=true" \
  --mfa-configuration OPTIONAL \
  --query 'UserPool.Id' --output text)

# Domaine hosted UI
aws cognito-idp create-user-pool-domain \
  --user-pool-id $USER_POOL_ID \
  --domain notes-app-auth-prod-2026

# App Client (SPA)
APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-name notes-app-spa \
  --no-generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-flows-user-pool-client \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls "https://app.example.com/callback" "http://localhost:3000/callback" \
  --logout-urls "https://app.example.com/" "http://localhost:3000/" \
  --supported-identity-providers COGNITO \
  --query 'UserPoolClient.ClientId' --output text)

# User de test
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --password Alice-Strong-Password-2026! \
  --permanent
```

### 3.2 — Étape 2 — KMS CMK

```bash
KEY_ID=$(aws kms create-key \
  --description "Notes app prod — SSE-KMS for DynamoDB, S3, Secrets" \
  --tags TagKey=Environment,TagValue=prod TagKey=App,TagValue=notes \
  --query 'KeyMetadata.KeyId' --output text)

aws kms create-alias \
  --alias-name alias/notes-prod \
  --target-key-id $KEY_ID

# Activer la rotation annuelle
aws kms enable-key-rotation --key-id $KEY_ID
```

Mettre à jour la **key policy** pour autoriser la Lambda (qu'on créera plus tard) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnableRoot",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "AllowNotesApi",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:role/notes-api-role" },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowAWSServices",
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "dynamodb.amazonaws.com",
          "s3.amazonaws.com",
          "secretsmanager.amazonaws.com"
        ]
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.3 — Étape 3 — Secrets Manager (clé Stripe)

```bash
aws secretsmanager create-secret \
  --name notes-app/prod/stripe \
  --description "Stripe API key for prod" \
  --secret-string '{"api_key": "sk_live_FAKE_KEY_FOR_TP_123456"}' \
  --kms-key-id alias/notes-prod
```

### 3.4 — Étape 4 — DynamoDB + S3

**DynamoDB** :

```bash
aws dynamodb create-table \
  --table-name notes-prod \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=note_id,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
    AttributeName=note_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification "Enabled=true,SSEType=KMS,KMSMasterKeyId=alias/notes-prod" \
  --tags Key=Environment,Value=prod Key=App,Value=notes
```

**S3** :

```bash
BUCKET=notes-app-files-prod-$(aws sts get-caller-identity --query Account --output text)

aws s3 mb s3://$BUCKET --region eu-west-1

aws s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration "{
    \"Rules\": [{
      \"ApplyServerSideEncryptionByDefault\": {
        \"SSEAlgorithm\": \"aws:kms\",
        \"KMSMasterKeyID\": \"alias/notes-prod\"
      },
      \"BucketKeyEnabled\": true
    }]
  }"

# Force HTTPS via bucket policy
cat > bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}
EOF
aws s3api put-bucket-policy --bucket $BUCKET --policy file://bucket-policy.json
```

### 3.5 — Étape 5 — Lambda + IAM execution role moindre privilège

**Lambda code** (`lambda_function.py`) :

```python
import json, os, boto3
from boto3.dynamodb.conditions import Key

REGION = os.environ["AWS_REGION"]
TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET = os.environ["BUCKET_NAME"]
STRIPE_SECRET_ID = os.environ["STRIPE_SECRET_ID"]

ddb = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
s3 = boto3.client("s3", region_name=REGION)
sm = boto3.client("secretsmanager", region_name=REGION)

# Cold start : charger les secrets une fois
STRIPE_KEY = json.loads(sm.get_secret_value(SecretId=STRIPE_SECRET_ID)["SecretString"])["api_key"]


def lambda_handler(event, context):
    # Récupérer l'identité de l'utilisateur depuis le JWT (claims passés par API Gateway)
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    user_id = claims["sub"]  # ID unique Cognito

    method = event["requestContext"]["http"]["method"]
    path = event["rawPath"]

    if path == "/notes" and method == "GET":
        # Lister les notes de l'utilisateur (filtrage par user_id en clé de partition)
        resp = ddb.query(KeyConditionExpression=Key("user_id").eq(user_id))
        return {"statusCode": 200, "body": json.dumps({"notes": resp["Items"]})}

    elif path == "/notes" and method == "POST":
        body = json.loads(event["body"])
        note_id = body["note_id"]
        content = body["content"]
        ddb.put_item(Item={"user_id": user_id, "note_id": note_id, "content": content})
        return {"statusCode": 201, "body": json.dumps({"created": note_id})}

    # ... autres routes (GET /files/{key}, POST /files/{key}, etc.)
    return {"statusCode": 404, "body": "Not found"}
```

**IAM Execution Role** (`notes-api-role`) :

Trust policy :

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

Identity-based policy (moindre privilège, **respecte M6**) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:eu-west-1:ACCOUNT:log-group:/aws/lambda/notes-api*"
    },
    {
      "Sid": "DynamoDBUserNotes",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/notes-prod"
    },
    {
      "Sid": "S3UserFiles",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::notes-app-files-prod-*/*"
    },
    {
      "Sid": "ReadStripeSecret",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-west-1:ACCOUNT:secret:notes-app/prod/stripe-*"
    },
    {
      "Sid": "KMSDecryptForServices",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:eu-west-1:ACCOUNT:key/KEY_ID"
    }
  ]
}
```

**Note** : on n'autorise **pas** `dynamodb:Scan` sur toute la table — l'app utilise uniquement `Query` avec `user_id`, ce qui garantit l'isolation entre users.

**Pour l'isolation S3** : on devrait idéalement contraindre les ARN avec le préfixe utilisateur. Mais comme on ne peut pas connaître à l'avance le `user_id` Cognito (`sub` UUID), on accepte le `*/*` côté policy IAM, et on implémente l'isolation **côté code** (la Lambda vérifie systématiquement que le `key` commence par le `user_id` du caller).

Pour aller plus loin, on peut utiliser des **session tags** ou des claims JWT custom pour contraindre via Condition `aws:PrincipalTag/UserId`.

### 3.6 — Étape 6 — API Gateway + JWT Authorizer

```bash
# Créer l'API HTTP
API_ID=$(aws apigatewayv2 create-api \
  --name notes-api-prod \
  --protocol-type HTTP \
  --query 'ApiId' --output text)

# Créer un JWT Authorizer Cognito
AUTHORIZER_ID=$(aws apigatewayv2 create-authorizer \
  --api-id $API_ID \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration "Audience=$APP_CLIENT_ID,Issuer=https://cognito-idp.eu-west-1.amazonaws.com/$USER_POOL_ID" \
  --name CognitoAuthorizer \
  --query 'AuthorizerId' --output text)

# Créer l'intégration Lambda
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:eu-west-1:ACCOUNT:function:notes-api \
  --payload-format-version 2.0 \
  --query 'IntegrationId' --output text)

# Créer les routes avec authorizer
for ROUTE in "GET /notes" "POST /notes" "GET /notes/{id}" "DELETE /notes/{id}"; do
  aws apigatewayv2 create-route \
    --api-id $API_ID \
    --route-key "$ROUTE" \
    --target integrations/$INTEGRATION_ID \
    --authorization-type JWT \
    --authorizer-id $AUTHORIZER_ID
done

# Permission Lambda
aws lambda add-permission \
  --function-name notes-api \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:eu-west-1:ACCOUNT:$API_ID/*/*"

# Stage
aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name prod \
  --auto-deploy
```

### 3.7 — Étape 7 — ACM + custom domain + Route 53

```bash
# Certificat (dans la région de l'API)
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.app.example.com \
  --validation-method DNS \
  --region eu-west-1 \
  --query 'CertificateArn' --output text)

# Ajouter le record de validation dans Route 53 (manuel ou automatique via la console)
aws acm wait certificate-validated --certificate-arn $CERT_ARN

# Créer le custom domain
aws apigatewayv2 create-domain-name \
  --domain-name api.app.example.com \
  --domain-name-configurations CertificateArn=$CERT_ARN,EndpointType=REGIONAL,SecurityPolicy=TLS_1_2

# API Mapping
aws apigatewayv2 create-api-mapping \
  --domain-name api.app.example.com \
  --api-id $API_ID \
  --stage prod

# Route 53 ALIAS
# (récupérer DomainEndpoint et HostedZoneId du custom domain, créer le record)
```

### 3.8 — Étape 8 — Identity Center + Permission Sets

Dans Identity Center (assumant qu'il est déjà activé) :

**Trois Permission Sets** :

1. **`NotesAdmin`** : Administrator full pour les admins.
2. **`NotesDeveloper`** : Custom policy autorisant `lambda:*`, `dynamodb:*`, `s3:*` mais `Deny iam:* + kms:* sensibles`.
3. **`NotesSupport`** : Custom policy autorisant uniquement `dynamodb:GetItem`, `s3:GetObject`, `logs:Get*`, `logs:Describe*`.

**Trois groupes** :

- `admins` (1-2 personnes) — assigné `NotesAdmin` sur tous les comptes.
- `developers` (5-10 personnes) — assigné `NotesDeveloper` sur dev/staging, `NotesSupport` sur prod.
- `support` (2-3 personnes) — assigné `NotesSupport` sur prod uniquement.

**Attribution** :

```bash
# Pour chaque assignment (groupe × PS × compte)
aws sso-admin create-account-assignment \
  --instance-arn $INSTANCE_ARN \
  --target-id ACCOUNT_ID \
  --target-type AWS_ACCOUNT \
  --permission-set-arn PS_ARN \
  --principal-type GROUP \
  --principal-id GROUP_ID
```

### 3.9 — Étape 9 — Permission Boundary

Pour permettre aux devs senior de **créer eux-mêmes des rôles** (par exemple pour leurs propres Lambdas), sans risquer une escalade :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDevServices",
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "s3:*",
        "apigateway:*",
        "logs:*",
        "cloudwatch:*",
        "events:*",
        "sns:*",
        "sqs:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowPassRoleScoped",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT:role/notes-*"
    },
    {
      "Sid": "DenyEscalation",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:AttachUserPolicy",
        "iam:PutUserPolicy",
        "iam:CreateAccessKey"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenySensitiveKMS",
      "Effect": "Deny",
      "Action": ["kms:Disable*", "kms:ScheduleKeyDeletion"],
      "Resource": "*"
    }
  ]
}
```

Appliquée aux Permission Sets `NotesDeveloper` comme **boundary**, garantit qu'aucun dev ne peut s'auto-promouvoir admin.

---

## 4. Livrables attendus

Un **dépôt Git** contenant :

### 4.1 — Code

- `infra/` : code Terraform / CloudFormation / scripts CLI bash idempotents qui crée tout.
- `app/lambda_function.py` + `tests/` : code Lambda Python testé.
- `frontend/` (optionnel) : SPA HTML/JS minimal qui se logue via Cognito et appelle l'API.

### 4.2 — Documentation (4 à 6 pages)

#### Section 1 — Cahier des charges (½ page)

Reprendre l'énoncé, ajouter les contraintes spécifiques retenues.

#### Section 2 — Architecture (1 page)

Schéma d'ensemble + justification des choix (serverless vs VPC).

#### Section 3 — Identités et auth (1 page)

- **Utilisateurs finaux** : Cognito User Pool config (password policy, MFA, attributs).
- **Opérateurs** : Identity Center + Permission Sets matrix.
- **Services** : Lambda execution role.

#### Section 4 — Policies (1 à 2 pages)

- Tous les **rôles IAM** créés.
- Tous les **Permission Sets**.
- La **Permission Boundary**.
- Les **resource-based policies** (key policy KMS, bucket policy S3).
- Justification de chaque choix (moindre privilège).

#### Section 5 — Secrets et chiffrement (½ page)

- Inventaire des secrets et leur emplacement (Secrets Manager / Parameter Store).
- Inventaire des clés KMS (CMK alias/notes-prod).
- Key policy de la CMK.

#### Section 6 — Endpoints et certificats (½ page)

- Certificats ACM utilisés (domaines, région).
- Configuration custom domain API Gateway.
- Route 53 records.

#### Section 7 — Tests effectués (½ à 1 page)

- Test fonctionnel : Alice se logue via hosted UI, crée une note, la relit, ajoute un fichier.
- Test d'isolation : Alice ne peut **pas** voir les notes de Bob (vérifier via deux comptes Cognito).
- Test de moindre privilège : modifier la policy Lambda pour retirer `dynamodb:Query` → l'API échoue.
- Test du Permission Boundary : un dev essaie `iam:CreateUser` → AccessDenied.

#### Section 8 — Audit (½ page)

Extraits CloudTrail montrant :

- `cognito-idp:InitiateAuth` quand Alice se logue.
- `kms:Decrypt` quand la Lambda lit le secret Stripe.
- `dynamodb:Query` quand l'API liste les notes.

#### Section 9 — Limites et évolutions (½ page)

- 3 limites identifiées (par exemple : pas de rotation auto de la clé Stripe, pas de WAF, isolation S3 via code et non IAM, …).
- 3 évolutions possibles.

---

## 5. Critères de validation

Le mini-projet est **validé** si :

- [ ] Un utilisateur peut **signup, signin, créer une note, l'ajouter, la lire** via l'API.
- [ ] **L'isolation entre users** est démontrée (Alice ne voit pas Bob).
- [ ] **Toutes les données** au repos sont **chiffrées** (DynamoDB SSE-KMS, S3 SSE-KMS, Secrets Manager KMS).
- [ ] **Aucun secret en clair** dans le code, les env vars Lambda, ou les paramètres CloudFormation.
- [ ] La Lambda a une **policy strictement moindre privilège** (pas de `*` sur Action ou Resource).
- [ ] **Identity Center** est configuré avec au moins 3 Permission Sets distincts attribués à des groupes.
- [ ] **Permission Boundary** appliquée aux devs et **testée** (un test prouve qu'elle bloque).
- [ ] **Toute communication externe** est en **HTTPS** (cert ACM valide).
- [ ] **CloudTrail** est activé, capture les events pertinents.
- [ ] Le **code et la doc** permettent à un tiers de reproduire l'infra.

---

## 6. Modes d'usage du livrable

Trois manières d'exploiter ce mini-projet sur la durée :

1. **Portfolio / entretien** : push GitHub, mettre le PDF en README. Démonstration **tangible** de la maîtrise IAM/Cognito/KMS.
2. **Base d'évolutions** : étendre avec :
   - WAF sur API Gateway.
   - Rotation auto de la clé Stripe via Lambda.
   - Federation Google sur Cognito.
   - Multi-tenant via session tags / claim JWT custom.
   - Mode "mode admin" via switch de rôle.
3. **Référence interne** : utiliser ce livrable comme **template** pour vos vrais projets professionnels.

---

## 7. Démontage propre

**Important** : ne pas oublier de détruire à la fin pour éviter la facturation continue :

- Lambda : ~0 $/mois si pas d'invocations.
- API Gateway : 0 $/mois en idle.
- Cognito : 0 $/mois si < 50k MAU.
- DynamoDB on-demand : 0 $/mois si 0 trafic.
- KMS CMK : **~1 $/mois** — à supprimer.
- ACM : gratuit, peut rester.
- Secrets Manager : **0,40 $/mois par secret** — à supprimer.
- Identity Center : 0 $ (gratuit).

Total si on laisse traîner : ~1-2 $/mois — pas critique mais propre de nettoyer.

```bash
# Suppression KMS CMK (avec délai)
aws kms schedule-key-deletion --key-id $KEY_ID --pending-window-in-days 7

# Suppression Secrets Manager
aws secretsmanager delete-secret --secret-id notes-app/prod/stripe --force-delete-without-recovery

# Le reste : suppression des Lambda, DDB table, S3 bucket, API Gateway, Cognito UP
```

Ou bien, si on a tout fait en Terraform : `terraform destroy`.

---

## 8. Auto-évaluation finale du parcours

À l'issue du mini-projet, l'apprenant doit pouvoir **dire à voix haute** et **démontrer** :

- [ ] Différence **rôle vs policy** et lecture d'un ARN.
- [ ] Anatomie d'une policy avec **Effect, Principal, Action, Resource, Condition**.
- [ ] **Identity-based vs resource-based**, **inline vs managed**, **Permission Boundary**.
- [ ] Pourquoi les **access keys statiques** sont à éviter, et les **7 alternatives modernes**.
- [ ] Fonctionnement d'**AssumeRole** et de **STS**.
- [ ] **Moindre privilège** appliqué en pratique sur leur propre projet.
- [ ] Différence **Identity Center** vs **Cognito**.
- [ ] Configuration **User Pool / Identity Pool** Cognito.
- [ ] Attribution **Permission Sets** sur des comptes via Identity Center.
- [ ] Différence **Secrets Manager** vs **Parameter Store**, et **SecureString**.
- [ ] Différence **CMK** vs **AWS-managed** vs **BYOK**.
- [ ] Cycle de **renouvellement automatique** d'un certificat ACM.

---

## 9. Synthèse du parcours AWS Identity

Le parcours AWS Identity se referme ici. À ce stade :

- **M1** — Concepts fondamentaux (rôle, policy, ARN).
- **M2** — Anatomie d'une policy + conditions.
- **M3** — Access keys et alternatives modernes.
- **M4** — Policies avancées (identity vs resource, inline vs managed, boundaries).
- **M5** — Assume role et STS.
- **M6** — Moindre privilège.
- **M7** — Cognito (auth utilisateurs).
- **M8** — Identity Center (auth opérateurs).
- **M9** — Secrets Manager + Parameter Store.
- **M10** — KMS + Certificate Manager.
- **M11** (ce module) — Mini-projet final intégrant tous les concepts.

L'apprenant est désormais **Confirmé N2** sur AWS Identity — capable de concevoir, déployer et défendre une **architecture d'identité complète** pour une application AWS de production, en orchestrant authentification utilisateur, authentification opérateur, secrets, chiffrement, certificats et moindre privilège.

**Pour aller plus loin** :

- **Niveau 3** : Trust Policy avancée, MFA conditionnel, Cognito Lambda triggers, federation SAML, KMS Grants, rotation custom, Session Manager, audit Compliance via CloudTrail + Access Analyzer.
- **Niveau 4** : architecture IAM multi-comptes via AWS Organizations, SCP, Control Tower, séparation des responsabilités, BYOK en environnement souverain.

Le parcours **AWS Identity Confirmé** est complet.
