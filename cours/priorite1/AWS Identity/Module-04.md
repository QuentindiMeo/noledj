# M4 — Policies avancées

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer en profondeur les **identity-based policies** et les **resource-based policies** : où chacune est attachée, quand chacune est nécessaire, et leur **logique d'évaluation combinée** (cas même compte vs cross-account).
- Distinguer **inline policies** et **managed policies**, et au sein des managed : **AWS-managed** vs **Customer-managed**. Connaître les **trade-offs** de chaque option (réutilisabilité, traçabilité, contrôle, scope).
- Définir une **Permission Boundary**, expliquer son rôle de **plafond de permissions effectives** sur un user ou un rôle, et la distinguer d'une SCP.
- Reconnaître les autres types de policies du paysage IAM : **session policies** (`AssumeRole` avec `--policy`), **Service Control Policies** (SCP — niveau 4), **VPC endpoint policies**.
- **Concevoir** un ensemble cohérent de policies pour **deux personas** distincts (par exemple : `Developer-Sandbox` et `DataAnalyst-Readonly`).
- Reconnaître les **anti-patterns** courants (inline partout, AWS-managed pour des besoins fins, boundary mal calibrée, …).

## Durée estimée

1 jour.

## Pré-requis

- M1 (entités IAM), M2 (anatomie d'une policy), M3 (alternatives aux access keys).
- AWS CLI v2 configurée avec permissions IAM complètes pour le compte sandbox.
- Un éditeur JSON correct.

---

## 1. Le paysage des policies IAM — vue d'ensemble

Avant de plonger : il existe **plus de types** de policies que ce qu'on imagine au début. Vue d'ensemble :

| Type                             | Attachée à                            | Qui peut la modifier      | Effet                                          |
| -------------------------------- | ------------------------------------- | ------------------------- | ---------------------------------------------- |
| **Identity-based managed**       | User / Group / Role                   | Admin IAM                 | Octroyer des permissions à l'identité.         |
| **Identity-based inline**        | User / Group / Role                   | Admin IAM                 | Idem mais inline (non réutilisable).           |
| **Resource-based**               | Ressource (bucket, queue, key, …)     | Owner de la ressource     | Contrôler qui peut accéder à la ressource.     |
| **Permission Boundary**          | User / Role                           | Admin                     | Plafond des permissions effectives.            |
| **Session policy**               | Une session STS temporaire            | Au moment de `AssumeRole` | Réduire ad hoc les permissions du rôle assumé. |
| **Service Control Policy (SCP)** | Compte / OU / Org (AWS Organizations) | Admin de l'Org            | Plafond au niveau organisationnel.             |
| **VPC endpoint policy**          | Un VPC endpoint                       | Owner du VPC              | Filtrer le trafic via l'endpoint.              |
| **AWS Organizations BPM**        | Compte                                | Org                       | Backup, sécurité, tagging.                     |

Pour ce module, on creuse les **5 premiers** (les 3 derniers sont niveau 3-4).

---

## 2. Identity-based vs Resource-based — la dichotomie fondamentale

### 2.1 — Définitions

**Identity-based policy** :

- Attachée à **une identité** (user, group, role).
- Dit : "Cette identité peut faire X sur Y."
- Le **Principal** est implicite (= l'identité à laquelle la policy est attachée), donc **on ne l'écrit pas**.

**Resource-based policy** :

- Attachée à **une ressource** (bucket S3, queue SQS, topic SNS, key KMS, …).
- Dit : "Tel ou tel acteur peut faire X sur **moi** (la ressource)."
- Le **Principal** est **explicite** (qui peut faire quoi).

### 2.2 — Comparaison côte à côte

``` graph
─── Identity-based ───                         ─── Resource-based ───

   Attachée au User Alice                          Attachée au bucket "my-bucket"

   {                                                {
     "Effect": "Allow",                               "Effect": "Allow",
     "Action": "s3:GetObject",                        "Principal": {"AWS": "arn:...:user/alice"},
     "Resource": "arn:aws:s3:::my-bucket/*"           "Action": "s3:GetObject",
   }                                                  "Resource": "arn:aws:s3:::my-bucket/*"
                                                    }

   Lecture :                                        Lecture :
   "Alice peut faire GetObject                      "my-bucket autorise Alice à GetObject
    sur les objets de my-bucket."                     sur ses objets."
```

Les deux policies, **dans ce cas même compte**, ont **exactement le même effet** : Alice peut lire les objets du bucket.

### 2.3 — Quand l'une suffit, quand les deux sont nécessaires

**Règle d'évaluation IAM, simplifiée :**

| Cas                                            | Suffit-il d'une identity-based ?  | Faut-il aussi une resource-based ?    |
| ---------------------------------------------- | --------------------------------- | ------------------------------------- |
| User du même compte → ressource du même compte | **Oui** (l'un OU l'autre suffit). | Non.                                  |
| User du compte A → ressource du compte B       | Non.                              | **Oui** (les deux sont obligatoires). |

**Détaillé pour le cas cross-account :**

> Pour qu'un user du compte A accède à une ressource du compte B :
>
> 1. Le user du compte A doit avoir une **identity-based policy** qui autorise l'action.
> 2. La ressource du compte B doit avoir une **resource-based policy** qui autorise le Principal (le user de A).
>
> **Les deux** doivent être satisfaites. C'est un **ET logique**.

C'est **le** point qui surprend les débutants : "j'ai mis ma policy bucket pour autoriser Alice du compte B, ça ne marche pas". Réponse : il faut **aussi** qu'Alice ait sa propre policy qui autorise cela côté son compte.

### 2.4 — Schéma de la décision cross-account

``` graph
                  ┌─────────────────────────────────────────┐
                  │ Cross-account request                   │
                  │ User Alice (compte A) → bucket compte B │
                  └─────────────────────┬───────────────────┘
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │                                                   │
              ▼                                                   ▼
   ┌────────────────────────┐                       ┌────────────────────────┐
   │ Côté compte A          │                       │ Côté compte B          │
   │ Alice a-t-elle une     │                       │ Le bucket a-t-il une   │
   │ identity-based policy  │                       │ resource-based policy  │
   │ qui autorise           │                       │ qui autorise Alice ?   │
   │ s3:GetObject ?         │                       │                        │
   └──────────┬─────────────┘                       └──────────┬─────────────┘
              │                                                │
              │           Les DEUX doivent dire OUI            │
              └────────────────────┬───────────────────────────┘
                                   ▼
                            ALLOW ou DENY
```

### 2.5 — Services qui supportent les resource-based policies

Tous les services ne supportent **pas** les resource-based policies. La liste varie :

| Service             | Resource-based policy ?                                  | Nom local                |
| ------------------- | -------------------------------------------------------- | ------------------------ |
| S3                  | **Oui**                                                  | Bucket policy            |
| SQS                 | **Oui**                                                  | Queue policy             |
| SNS                 | **Oui**                                                  | Topic policy             |
| KMS                 | **Oui**                                                  | Key policy (obligatoire) |
| Lambda              | **Oui**                                                  | Resource policy          |
| Secrets Manager     | **Oui**                                                  | Resource policy          |
| IAM (sur les rôles) | **Oui**                                                  | Trust policy             |
| ECR                 | **Oui**                                                  | Repository policy        |
| API Gateway         | **Oui**                                                  | Resource policy          |
| EFS                 | **Oui**                                                  | File system policy       |
| EventBridge         | **Oui**                                                  | Bus policy               |
| EC2                 | Non                                                      | —                        |
| RDS                 | Non (sauf via DB-level)                                  | —                        |
| DynamoDB            | Non (jusqu'à 2024 où resource-based limité a été ajouté) | —                        |

Pour les services **sans** resource-based, le cross-account passe par d'autres mécanismes : **assume role** (vu en M5), VPC peering + IAM, RAM share, etc.

### 2.6 — Trust policy d'un rôle — un cas particulier

La **trust policy** d'un rôle est techniquement une resource-based policy attachée au rôle, qui dit "qui peut **assumer** ce rôle". C'est elle qui contient le `Principal` :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111111111111:user/alice" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Lecture : "L'user Alice du compte 111111111111 peut assumer ce rôle." Détail complet en M5.

---

## 3. Resource-based — exemples par service

### 3.1 — S3 bucket policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFront",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST-ID"
        }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

Lecture :

- Statement 1 : autoriser CloudFront (avec scope sur la bonne distribution) à lire les objets — pattern OAC vu en Networking M6.
- Statement 2 : refuser tout accès HTTP non sécurisé. Best practice.

### 3.2 — SQS queue policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:role/app-role" },
      "Action": ["sqs:SendMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:eu-west-1:ACCOUNT:my-queue"
    }
  ]
}
```

### 3.3 — KMS key policy — la subtilité

Pour KMS, la **key policy est obligatoire** et primaire : c'est le **seul** moyen de contrôler l'accès à la clé. Si la key policy ne nomme pas un acteur, **aucune** identity-based policy ne peut donner accès à cette clé.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnableRootAccount",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "AllowAppRole",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:role/app-role" },
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "*"
    }
  ]
}
```

C'est une particularité importante : **KMS inverse la logique d'IAM** (key policy primaire). Vu en M10.

### 3.4 — Lambda resource policy

```bash
aws lambda add-permission \
  --function-name my-fn \
  --statement-id allow-apigw \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn arn:aws:execute-api:eu-west-1:ACCOUNT:API-ID/*/GET/hello
```

Cette commande **construit** automatiquement le statement dans la resource policy de la Lambda. Pattern utilisé partout pour autoriser un service AWS (API Gateway, EventBridge, S3, …) à invoquer une Lambda.

---

## 4. Inline vs Managed — la deuxième dichotomie

### 4.1 — Inline policy

Une **inline policy** est **encapsulée directement** dans la définition de l'entité (user, group, role) à laquelle elle s'applique. Elle **n'existe pas comme objet IAM autonome**.

```bash
# Attacher une inline policy à un rôle
aws iam put-role-policy \
  --role-name my-role \
  --policy-name SpecificAccess \
  --policy-document file://policy.json
```

**Caractéristiques :**

- **Strictement liée à l'entité** : pas de réutilisation possible.
- Si on supprime le rôle, l'inline policy disparaît automatiquement.
- Pas d'ARN propre (donc pas référencable par d'autres entités).
- Pas de versionnage AWS-natif.

**Cas d'usage légitime :**

- Permission **très spécifique** à un user ou rôle, qu'on ne va **jamais** réutiliser.
- Garantir qu'**aucune** autre entité ne peut hériter de cette policy (sécurité par scope strict).

### 4.2 — Managed policy

Une **managed policy** est un objet IAM **autonome**, avec son **propre ARN**, **réutilisable** sur plusieurs entités.

```bash
# Créer une managed policy customer-managed
aws iam create-policy \
  --policy-name S3ReadOnlyMyBucket \
  --policy-document file://policy.json

# La renvoie avec son ARN
# arn:aws:iam::ACCOUNT:policy/S3ReadOnlyMyBucket

# L'attacher à un rôle, un user, ou un groupe
aws iam attach-role-policy --role-name my-role --policy-arn arn:aws:iam::ACCOUNT:policy/S3ReadOnlyMyBucket
aws iam attach-user-policy --user-name alice --policy-arn arn:aws:iam::ACCOUNT:policy/S3ReadOnlyMyBucket
aws iam attach-group-policy --group-name DataAnalysts --policy-arn arn:aws:iam::ACCOUNT:policy/S3ReadOnlyMyBucket
```

**Caractéristiques :**

- **Réutilisable** : une policy → N entités.
- **Versionnée** : jusqu'à 5 versions, on peut rollbacker.
- **Référencable** par ARN partout (Terraform, CloudFormation, audits…).
- **Survivante** : la suppression d'une entité ne supprime pas la policy.

### 4.3 — Tableau comparatif

| Critère                     | Inline                         | Managed                                        |
| --------------------------- | ------------------------------ | ---------------------------------------------- |
| Réutilisable                | **Non**                        | **Oui** (plusieurs entités attachées)          |
| ARN propre                  | Non                            | Oui (`arn:aws:iam::ACCOUNT:policy/Name`)       |
| Versionnage                 | Non                            | Oui (5 versions, rollback)                     |
| Vie liée à l'entité         | Oui                            | Non                                            |
| Visibilité console          | Sous l'entité                  | Liste dédiée                                   |
| Bon pour                    | Permissions uniques ad hoc     | Permissions réutilisables                      |
| Bon pour audit / conformité | Moins (éparpillé)              | **Oui** (un point de vérité)                   |
| Limite par entité           | 10 KB par user, 10 KB par role | 10 attachements max d'une managed à une entité |

**Bonne pratique** : préférer les **managed policies** dans 90 % des cas, réserver les inline aux **cas spécifiques** d'un user/rôle unique.

---

## 5. AWS-managed vs Customer-managed

Les **managed policies** se subdivisent en deux familles :

### 5.1 — AWS-managed

Policies **fournies et maintenues par AWS**. Reconnaissables à leur ARN avec `aws` comme compte :

``` txt
arn:aws:iam::aws:policy/ReadOnlyAccess
arn:aws:iam::aws:policy/AdministratorAccess
arn:aws:iam::aws:policy/AmazonS3FullAccess
arn:aws:iam::aws:policy/PowerUserAccess
```

**Caractéristiques :**

- Couvrent les **cas génériques**.
- AWS les **met à jour** automatiquement quand de nouvelles actions sont ajoutées (par exemple, quand un nouveau service S3 sort, `AmazonS3FullAccess` est étendu).
- **On ne peut pas les modifier** (logique : c'est AWS qui les contrôle).
- **Très utiles pour démarrer**, **dangereuses en production** car souvent **trop larges**.

**Quelques AWS-managed à connaître :**

| Policy                                                   | Permissions                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AdministratorAccess`                                    | `"Action": "*", "Resource": "*"` — full admin. À réserver à très peu de monde. |
| `PowerUserAccess`                                        | Tout sauf IAM, Organizations. Pour devs avec autonomie totale.                 |
| `ReadOnlyAccess`                                         | Read-only sur tous les services.                                               |
| `AmazonS3FullAccess`                                     | Full S3.                                                                       |
| `AmazonS3ReadOnlyAccess`                                 | Read-only S3.                                                                  |
| `AmazonEC2FullAccess`                                    | Full EC2.                                                                      |
| `AWSLambda_FullAccess`                                   | Full Lambda.                                                                   |
| Service Role Policies (`AWSLambdaBasicExecutionRole`, …) | Permissions de service utilisées par AWS lui-même.                             |

### 5.2 — Customer-managed

Policies **créées et gérées par le client** (vous). Avec votre compte dans l'ARN :

``` txt
arn:aws:iam::123456789012:policy/MyBackupPolicy
arn:aws:iam::123456789012:policy/DenyDeleteProd
```

**Caractéristiques :**

- **Adaptables** à votre besoin précis.
- Versionnage (5 versions actives, rollback possible).
- **Recommandées en production** quand on veut un contrôle fin.

### 5.3 — Trio synthétique

``` graph
┌────────────────────────────────────────────────────────────┐
│ POLICIES IAM                                               │
├────────────────────────┬───────────────────────────────────┤
│ INLINE                 │ MANAGED                           │
│                        ├──────────────┬────────────────────┤
│                        │ AWS-managed  │ Customer-managed   │
│ Spécifique à l'entité  │ Génériques   │ Customisées        │
│ Non réutilisable       │ AWS contrôle │ Vous contrôlez     │
│ Pas d'ARN              │ ARN: aws     │ ARN: votre compte  │
│ Utilité : ad hoc       │ Utilité :    │ Utilité :          │
│                        │ démarrer     │ production         │
└────────────────────────┴──────────────┴────────────────────┘
```

### 5.4 — Quand utiliser quoi

| Cas                                                           | Choix recommandé                                |
| ------------------------------------------------------------- | ----------------------------------------------- |
| Premier compte sandbox, exploration, POC.                     | AWS-managed (rapide).                           |
| Compte de prod, permission générique applicable telle quelle. | AWS-managed (si **strictement** ce qu'on veut). |
| Compte de prod, besoin spécifique du métier.                  | **Customer-managed**.                           |
| Permission unique à un rôle, jamais à réutiliser.             | Inline (acceptable, parfois préférable).        |
| Permission qu'on veut auditer / tagger / versionner.          | Customer-managed.                               |

---

## 6. Permission Boundaries (item N2 central)

### 6.1 — Définition

Une **Permission Boundary** est une **policy attachée à un user ou un role** qui **plafonne** ses permissions effectives.

> Permissions effectives = **intersection** de (permissions accordées par les identity-based policies) **et** (permissions autorisées par la boundary).

C'est un **garde-fou** : même si on attache à un user une policy `AdministratorAccess`, sa boundary peut limiter ce qu'il peut **réellement** faire.

### 6.2 — Cas d'usage canonique — déléguer la création d'IAM

Le cas pour lequel les boundaries ont été inventées : **déléguer la création d'utilisateurs IAM aux équipes** sans craindre qu'elles créent des "super users".

**Sans boundary** : si Alice peut créer des users IAM, elle peut leur attacher `AdministratorAccess` → elle devient admin de fait.

**Avec boundary** : on dit "Alice peut créer des users **à condition** que ces users aient cette boundary B attachée". B limite ce que les nouveaux users peuvent faire (par exemple, jamais d'IAM, jamais de KMS sensible).

```json
{
  "Effect": "Allow",
  "Action": "iam:CreateUser",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/dev-boundary"
    }
  }
}
```

Alice peut créer des users mais **seulement** si elle leur attache la boundary `dev-boundary`. Ces users auront au maximum les permissions de la boundary, jamais plus.

### 6.3 — La logique d'évaluation avec boundary

À chaque appel API par un user qui a une boundary, IAM évalue :

1. Existe-t-il un `Deny` dans la session policy, identity-based, ou resource-based ? → REFUSER.
2. La boundary autorise-t-elle l'action ? → si non, REFUSER (même si identity-based autorise).
3. L'identity-based ou la resource-based autorise-t-elle l'action ? → si non, REFUSER.
4. Sinon, AUTORISER.

**Formellement** : `permissions_effectives = (identity_based_allow) ∩ (boundary_allow) - (any_deny)`.

### 6.4 — Boundary vs SCP — distinction critique

| Aspect                    | Permission Boundary      | Service Control Policy (SCP)                            |
| ------------------------- | ------------------------ | ------------------------------------------------------- |
| Attachée à                | User / Role (individuel) | Compte / OU / Org (collectif)                           |
| Cadre                     | Compte AWS               | AWS Organizations                                       |
| Granularité               | Une identité à la fois   | Tous les users du compte / OU                           |
| Affecte le root account ? | Non                      | **Oui**                                                 |
| Cas d'usage               | Déléguer la création IAM | Verrouiller globalement (par ex. interdire `us-east-1`) |

**À retenir** : les **SCP** plafonnent tous les utilisateurs d'un compte AWS (y compris le root). Les **boundaries** plafonnent une identité spécifique. Ce sont des **plafonds complémentaires**.

### 6.5 — Exemple — boundary `dev-boundary`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDevServices",
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "ec2:*",
        "dynamodb:*",
        "lambda:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyDestructiveIAM",
      "Effect": "Deny",
      "Action": [
        "iam:DeleteRole",
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:AttachUserPolicy",
        "iam:DetachUserPolicy",
        "iam:PutUserPolicy"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyKMS",
      "Effect": "Deny",
      "Action": "kms:*",
      "Resource": "*"
    }
  ]
}
```

Tout user portant cette boundary peut faire S3, EC2, DynamoDB, Lambda, mais **jamais** modifier IAM ni utiliser KMS, **quoi qu'il y ait** dans ses policies attachées.

### 6.6 — Attacher une boundary

```bash
# Lors de la création d'un user
aws iam create-user \
  --user-name new-dev \
  --permissions-boundary arn:aws:iam::ACCOUNT:policy/dev-boundary

# Sur un user existant
aws iam put-user-permissions-boundary \
  --user-name existing-dev \
  --permissions-boundary arn:aws:iam::ACCOUNT:policy/dev-boundary

# Idem pour un rôle
aws iam put-role-permissions-boundary \
  --role-name dev-role \
  --permissions-boundary arn:aws:iam::ACCOUNT:policy/dev-boundary
```

### 6.7 — Limitations

- **Une seule** boundary par user / role.
- Une boundary est elle-même une policy de **6144 caractères max** (comme une managed normale).
- Une boundary **ne donne** pas de permissions — elle plafonne. Sans identity-based pour autoriser, rien ne passe.
- **Très peu lue par les débutants** — bien documenter, bien tagger.

---

## 7. Session policies

À l'`AssumeRole`, on peut passer une **session policy** qui **réduit** les permissions du rôle pour cette session particulière.

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT:role/PowerUser \
  --role-session-name "alice-restricted" \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::specific-bucket/*"
    }]
  }'
```

Lecture : Alice assume le rôle `PowerUser` mais, pour **cette session**, ses permissions sont **réduites à `s3:GetObject` sur un bucket**. Même si le rôle PowerUser autorise tout, la session policy plafonne.

Cas d'usage : un broker / un orchestrateur qui assume un rôle pour le compte d'un client final, et veut le restreindre à ce qu'il a réellement besoin.

Sujet plutôt N3 — bon à connaître pour la cohérence du modèle.

---

## 8. Service Control Policies (SCP) — mention

Les **SCP** sont attachées à des **comptes AWS ou des OU** dans une **AWS Organization**. Elles **plafonnent** ce que les users **du compte** peuvent faire, **y compris le root**.

Exemples typiques :

- **Interdire l'usage de régions hors UE** :

  ```json
  {
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEqualsIfExists": {
        "aws:RequestedRegion": ["eu-west-1", "eu-west-3", "eu-central-1"]
      }
    }
  }
  ```

- **Interdire la modification des CloudTrail** : empêche n'importe qui (même admin) de désactiver l'audit.

Sujet **niveau 4** dans le glossaire. À connaître par son nom au N2.

---

## 9. Choisir le bon type — synthèse

| Question                                                   | Type de policy                              |
| ---------------------------------------------------------- | ------------------------------------------- |
| "Alice peut faire X sur Y" (même compte).                  | Identity-based attachée à Alice.            |
| "Tout le monde peut accéder à ce bucket (sous condition)." | Resource-based sur le bucket.               |
| "Le compte A peut lire le bucket du compte B."             | Resource-based **+** identity-based dans A. |
| "Cette permission ne sera **jamais** réutilisée."          | Inline (acceptable).                        |
| "Cette permission est partagée entre 5 rôles."             | Customer-managed.                           |
| "Je veux déléguer la création d'utilisateurs."             | Permission Boundary.                        |
| "Je veux verrouiller la prod pour toute l'org."            | SCP (niveau 4).                             |
| "Je veux restreindre une session STS particulière."        | Session policy.                             |

---

## 10. Design pour deux personas (item pratique)

L'exercice central : **concevoir** les policies de deux personas réalistes.

### 10.1 — Persona 1 — Developer Sandbox

**Profil.** Développeur autonome dans un compte AWS de sandbox. Doit pouvoir tester librement les services de **compute, storage, messaging**, mais **ne doit pas** :

- Modifier IAM.
- Utiliser KMS (production).
- Ouvrir des accès Internet.

**Solution.**

- Un **Permission Boundary** `dev-sandbox-boundary` qui :
  - Allow tout sur EC2, S3, Lambda, DynamoDB, SQS, SNS, Logs.
  - Deny IAM (sauf passrole pour ses propres rôles).
  - Deny KMS.
- Une **Customer-managed policy** `dev-sandbox-policy` attachée au user, qui autorise les mêmes services.
- Un **rôle** `ec2-dev-role` que le user peut passer à ses EC2.

**Pourquoi cette structure.** La boundary **garantit** que même si l'admin ajoute par erreur `AdministratorAccess` au user, il ne pourra pas faire d'IAM ni KMS. Sécurité à deux étages.

### 10.2 — Persona 2 — Data Analyst Read-only

**Profil.** Analyste qui consulte les données de production via Athena et S3, sans rien modifier. **Doit** :

- Lire des buckets S3 spécifiques (read-only).
- Exécuter des requêtes Athena.
- Consulter Glue catalog.
- **Ne rien écrire** ni supprimer.
- **Pas** d'accès à d'autres bases.

**Solution.**

- Une **Customer-managed policy** `data-analyst-readonly` attachée au user / groupe :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadAnalyticsBuckets",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::analytics-data",
        "arn:aws:s3:::analytics-data/*",
        "arn:aws:s3:::dashboard-exports",
        "arn:aws:s3:::dashboard-exports/*"
      ]
    },
    {
      "Sid": "RunAthenaQueries",
      "Effect": "Allow",
      "Action": [
        "athena:StartQueryExecution",
        "athena:GetQueryExecution",
        "athena:GetQueryResults",
        "athena:StopQueryExecution",
        "athena:GetWorkGroup"
      ],
      "Resource": "*"
    },
    {
      "Sid": "GlueCatalogRead",
      "Effect": "Allow",
      "Action": ["glue:GetDatabase*", "glue:GetTable*", "glue:GetPartition*"],
      "Resource": "*"
    },
    {
      "Sid": "AthenaResultsBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::athena-query-results",
        "arn:aws:s3:::athena-query-results/*"
      ]
    },
    {
      "Sid": "DenyEverythingElseS3",
      "Effect": "Deny",
      "Action": ["s3:DeleteObject", "s3:DeleteBucket", "s3:PutBucketPolicy"],
      "Resource": "*"
    },
    {
      "Sid": "RequireMFA",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
      }
    }
  ]
}
```

**Pourquoi cette structure.**

- Les actions **Read** explicitement listées sur les ressources analytiques.
- Athena nécessite d'écrire ses résultats temporaires dans un bucket dédié — exception minimale.
- Le 2ᵉ-avant-dernier statement (Deny destructive) est un **garde-fou** : même si la policy globale s'élargit demain par erreur, on ne pourra pas supprimer.
- Le dernier statement exige MFA. Best practice pour des données sensibles.

### 10.3 — Conseils de design

1. **Commencer par les actions** : que doit faire le persona ? Lister les API calls réels.
2. **Cibler les ressources** : préférer des ARN précis (`bucket/prefix/*`) plutôt que `*`.
3. **Ajouter les Deny défensifs** : pour les actions destructives qu'on ne veut **jamais**.
4. **Conditions** : MFA, IP, VPC, plage horaire selon le besoin.
5. **Tester avec le Simulator** avant de déployer.
6. **Boundary** si on veut un plafond garanti même en cas de mauvaise attribution future.

---

## 11. Exercices pratiques

### Exercice 1 — Cross-account read S3 (≈ 45 min)

**Objectif.** Mettre en pratique le combo identity-based + resource-based.

**Setup.** Deux comptes AWS (ou deux profils CLI distincts du même compte pour simuler).

**Étapes :**

1. Compte A : un user `alice`.
2. Compte B : un bucket `cross-account-data`.
3. Sur le bucket de B, écrire une bucket policy autorisant `alice` du compte A à `s3:GetObject`.
4. Tester depuis A — doit **échouer** (pas encore d'identity-based policy côté A).
5. Sur le user `alice`, ajouter une identity-based policy qui autorise `s3:GetObject` sur le bucket de B.
6. Re-tester — doit **fonctionner**.

**Livrable.** Captures des deux tests + les deux policies JSON.

### Exercice 2 — Permission Boundary qui bloque IAM (≈ 30 min)

**Objectif.** L'exercice canonique des boundaries.

**Étapes :**

1. Créer une managed policy `iam-blocker-boundary` qui :
   - Autorise tous les services (S3, EC2, etc.).
   - **Refuse** explicitement toutes les actions IAM.
2. Créer un user `test-bounded` et lui attacher cette boundary.
3. Attacher à ce user une identity-based policy `AdministratorAccess`.
4. Avec les credentials de `test-bounded`, tester :
   - `aws s3 ls` → autorisé.
   - `aws iam list-users` → **refusé** (malgré AdministratorAccess).
5. Retirer la boundary, retester `aws iam list-users` → autorisé.

**Livrable.** Captures des 3 commandes et explication de la logique.

### Exercice 3 — Design pour 2 personas (≈ 60 min)

**Objectif.** L'exercice du module.

**Cas.**

- **Persona A** : "BI Analyst" — accède en read-only à 2 buckets analytiques + Athena + Glue.
- **Persona B** : "ML Engineer" — accède en read-write à 1 bucket de données ML + SageMaker + ECR (pull images).

**Livrable.** Pour chacun :

1. Liste des actions AWS nécessaires (5-15 actions justifiées).
2. Liste des ressources ciblées (ARN précis).
3. Conditions à appliquer (MFA ? IP ? Plage ?).
4. Une **policy customer-managed** complète.
5. Optionnellement, une **Permission Boundary** plus large mais protectrice.

### Exercice 4 — Migrer inline vers managed (≈ 30 min)

**Objectif.** Refactoriser.

**Setup.** Un compte avec plusieurs users / rôles qui partagent des inline policies très similaires.

**Étapes :**

1. Identifier 2-3 inline policies redondantes via `aws iam list-user-policies` ou la console.
2. Extraire le contenu commun, créer une **customer-managed** unique.
3. Attacher la managed aux users/rôles concernés.
4. Supprimer les inlines correspondantes.
5. Vérifier que les permissions effectives n'ont pas changé via IAM Policy Simulator.

**Livrable.** Capture avant/après + une phrase sur le bénéfice.

### Mini-défi — Audit de policies (≈ 30 min)

**Cas.** Trois policies attachées à différents users :

```json
// User 1 — Inline
{ "Effect": "Allow", "Action": "*", "Resource": "*" }

// User 2 — AWS-managed AmazonS3FullAccess
// + Inline { "Effect": "Allow", "Action": "iam:*", "Resource": "*" }

// User 3 — Customer-managed "EC2DevAccess"
// + Boundary "dev-boundary" (deny IAM, deny KMS)
```

**Livrable.** Pour chacun :

1. Niveau de risque (faible / moyen / élevé / critique).
2. Recommandation d'amélioration concrète.
3. Pour le user 3, quelles sont ses **permissions effectives** si EC2DevAccess autorise EC2+IAM ?

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Distinguer **identity-based** et **resource-based policy** (où attachée, qui est implicite/explicite, cas cross-account).
- [ ] Énoncer la règle "**en cross-account, il faut LES DEUX**" — identity + resource — pour autoriser.
- [ ] Citer **5 services AWS** qui supportent les resource-based policies.
- [ ] Distinguer **inline** et **managed** sur 5 axes (réutilisabilité, ARN, versionnage, vie, audit).
- [ ] Distinguer **AWS-managed** et **Customer-managed** (qui les contrôle, comment les reconnaître à l'ARN).
- [ ] Définir une **Permission Boundary**, énoncer la formule "permissions effectives = identity ∩ boundary".
- [ ] Donner le **cas d'usage canonique** des boundaries (déléguer la création IAM en toute sécurité).
- [ ] Distinguer **Boundary** et **SCP** (granularité, qui les contrôle, qui en est affecté).
- [ ] Définir une **session policy** et son usage typique.
- [ ] Concevoir des **policies pour 2 personas** distincts depuis zéro.
- [ ] Citer **3 anti-patterns** courants (inline partout, AWS-managed mal calibrée, boundary mal pensée).

### Items du glossaire visés

**N2 atteint** :

- _différence entre identity-based policy et resource-based policy_ — sections 2 et 3.
- _différence entre inline policies et managed policies_ — sections 4 et 5.
- _fonctionnement des Permission Boundaries_ — section 6.

---

## 13. Ressources complémentaires

### Documentation AWS

- [Identity-based and resource-based policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_identity-vs-resource.html)
- [Inline vs managed policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html)
- [Permission Boundaries](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html)
- [Policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [AWS-managed policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#aws-managed-policies)

### Outils

- [IAM Policy Simulator](https://policysim.aws.amazon.com/) — tester boundaries et combinaisons identity/resource.
- [IAM Access Analyzer Policy Generation](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-generation.html) — générer une policy à partir de l'historique CloudTrail.
- [Cloudsplaining](https://github.com/salesforce/cloudsplaining) — audit open source de policies trop permissives.

### Pour aller plus loin

- **M5 (Assume role et STS)** — la mécanique des credentials temporaires.
- **M6 (Moindre privilège)** — l'application pratique de tout ce qu'on a vu.
- **Niveau 3** : IAM Access Analyzer en détail, trust policies avancées, federation SAML/OIDC.
- **Niveau 4** : Service Control Policies, multi-comptes via AWS Organizations.
