# M2 — Anatomie d'une policy

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Disséquer en profondeur **chaque clé** d'une policy IAM : **Version**, **Statement**, **Sid**, **Effect**, **Principal**, **Action**, **Resource**, **Condition** — et leurs négations **NotAction**, **NotResource**, **NotPrincipal**.
- Distinguer la sémantique de **`Allow`** et **`Deny`**, et énoncer la **règle d'évaluation** : refus par défaut → un `Allow` explicite autorise → un `Deny` explicite refuse en priorité absolue.
- Lister les types d'**Actions** dans IAM (lecture, écriture, gestion de permissions, tagging, list) et savoir qu'un **wildcard** dans Action est puissant mais dangereux.
- Décrire la structure d'une **Condition** (operator + condition key + value), les **condition keys** globales (`aws:SourceIp`, `aws:CurrentTime`, `aws:MultiFactorAuthPresent`, …) et celles spécifiques à un service.
- **Écrire de zéro** une policy minimale (autoriser une action sur une ressource) et une policy avec **conditions** (autoriser sous certaines circonstances seulement).
- Décrire le **modèle d'évaluation complet** d'IAM (identity-based + resource-based + boundaries + SCP) au niveau d'introduction.

## Durée estimée

1 jour.

## Pré-requis

- M1 (users, groups, roles, policies, ARN).
- AWS CLI v2 configurée.
- Permissions IAM : `iam:CreatePolicy`, `iam:GetPolicy`, `iam:SimulatePrincipalPolicy`, `iam:CreateUser`, `iam:AttachUserPolicy`.
- Un éditeur JSON correct (VS Code avec extension JSON, ou la console AWS IAM).

---

## 1. Le langage de policy IAM

### 1.1 — Pourquoi un langage dédié

Une policy IAM doit pouvoir exprimer des règles fines : "Alice peut lire ce bucket **mais seulement** depuis ce VPC **et** quand elle a un MFA actif **et** entre 8h et 18h **et** pas le week-end". Un format libre ne suffit pas — il faut un **langage** précis, machine-évaluable, en quelques millisecondes, à chaque appel API.

IAM utilise un **dialecte JSON** spécifique, normalisé par AWS. Tout ingénieur AWS doit savoir le lire **à vue** et l'écrire **proprement** sans copier-coller.

### 1.2 — Squelette canonique

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Read",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["203.0.113.0/24"]
        }
      }
    }
  ]
}
```

Six clés à connaître **par cœur** :

| Clé         | Rôle                                                                   | Obligatoire ?            |
| ----------- | ---------------------------------------------------------------------- | ------------------------ |
| `Version`   | Version du langage. **Toujours** `"2012-10-17"`.                       | Recommandé               |
| `Statement` | Liste de statements (1 ou plusieurs).                                  | Oui                      |
| `Sid`       | Identifiant lisible du statement (Statement IDentifier). Pour l'audit. | Non — recommandé         |
| `Effect`    | `Allow` ou `Deny`.                                                     | **Oui**                  |
| `Action`    | Action(s) concernée(s).                                                | Oui (sauf `NotAction`)   |
| `Resource`  | Ressource(s) ciblée(s).                                                | Oui (sauf `NotResource`) |
| `Principal` | Qui est concerné (resource-based uniquement).                          | Conditionnel             |
| `Condition` | Conditions supplémentaires.                                            | Non                      |

### 1.3 — Plusieurs statements

Une policy peut contenir **plusieurs statements** dans la liste `Statement`. Chacun est évalué **indépendamment**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Read",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    },
    {
      "Sid": "DenyDelete",
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "*"
    }
  ]
}
```

Cette policy : autorise la lecture du bucket **et** refuse explicitement toute suppression S3, partout.

---

## 2. Effect — Allow ou Deny

`Effect` peut prendre **deux valeurs** :

| Valeur  | Sémantique                                                  |
| ------- | ----------------------------------------------------------- |
| `Allow` | "Autoriser explicitement cette action sur cette ressource". |
| `Deny`  | "Refuser explicitement cette action sur cette ressource".   |

### 2.1 — Le refus par défaut

> Sans aucun statement qui s'applique, l'action est **refusée**.

Conséquence : un user fraîchement créé, sans aucune policy attachée, ne peut **rien** faire dans AWS. Même pas se logger à la console (sauf à avoir un mot de passe configuré, ce qui est encore autre chose).

### 2.2 — La priorité absolue du Deny

> Si **n'importe quelle** policy applicable contient un `Deny` qui matche la requête, **la requête est refusée**, peu importe combien d'`Allow` existent ailleurs.

Le `Deny` est utilisé pour :

- **Garde-fous** : "interdire toute modification IAM sauf à un rôle spécifique".
- **Permission Boundaries** (vu en M4) : poser un plafond aux permissions effectives d'un user.
- **SCP** (Service Control Policies, niveau 4) : verrouiller globalement certaines actions au niveau de l'organisation.

### 2.3 — Exemple — protéger un tag

```json
{
  "Effect": "Deny",
  "Action": "ec2:TerminateInstances",
  "Resource": "*",
  "Condition": {
    "StringEquals": { "ec2:ResourceTag/Environment": "production" }
  }
}
```

Lecture : "Interdire la terminaison de toute EC2 taggée `Environment=production`." Même si la même policy (ou une autre attachée) autorise `ec2:TerminateInstances` plus largement, la prod est protégée.

---

## 3. Principal — qui est concerné

`Principal` désigne **qui** la policy concerne. Il n'apparaît que dans les **resource-based policies** (attachées à un bucket S3, une queue SQS, une clé KMS, etc.).

### 3.1 — Formes possibles

**Compte AWS** (tous les utilisateurs du compte) :

```json
"Principal": {"AWS": "arn:aws:iam::123456789012:root"}
```

ou simplement :

```json
"Principal": {"AWS": "123456789012"}
```

**Un user IAM précis** :

```json
"Principal": {"AWS": "arn:aws:iam::123456789012:user/alice"}
```

**Un rôle IAM précis** :

```json
"Principal": {"AWS": "arn:aws:iam::123456789012:role/lambda-role"}
```

**Un service AWS** :

```json
"Principal": {"Service": "lambda.amazonaws.com"}
```

**Plusieurs principals** :

```json
"Principal": {
  "AWS": [
    "arn:aws:iam::111111111111:role/role-a",
    "arn:aws:iam::222222222222:role/role-b"
  ],
  "Service": "ec2.amazonaws.com"
}
```

**Tout le monde (anonyme)** — **rare et dangereux** :

```json
"Principal": "*"
```

### 3.2 — Trust policy d'un rôle — un cas spécial

La **trust policy** d'un rôle est une resource-based policy attachée à un rôle, qui décrit **qui peut l'assumer**. Exemple :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Lecture : "EC2 (en tant que service) peut assumer ce rôle." → c'est exactement ce qu'il faut pour qu'une EC2 puisse utiliser le rôle via un instance profile.

Autre exemple — un rôle cross-account assumable par un user d'un autre compte :

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111111111111:user/ops-admin" },
  "Action": "sts:AssumeRole"
}
```

Détaillé en M5.

### 3.3 — Principal implicite dans une identity-based policy

Dans une identity-based policy, **on n'écrit jamais le Principal** — c'est implicitement l'identité à laquelle la policy est attachée.

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

Attachée au rôle `lambda-role` → autorise `lambda-role` (et seulement lui) à GetObject sur le bucket.

---

## 4. Action — quoi (le droit)

`Action` désigne **ce qui est autorisé / refusé**. Le format est :

``` txt
<service-prefix>:<ActionName>
```

| Exemple                  | Service | Action                |
| ------------------------ | ------- | --------------------- |
| `s3:GetObject`           | s3      | Lire un objet         |
| `s3:PutObject`           | s3      | Écrire un objet       |
| `ec2:RunInstances`       | ec2     | Lancer une instance   |
| `ec2:TerminateInstances` | ec2     | Terminer une instance |
| `iam:CreateRole`         | iam     | Créer un rôle         |
| `kinesis:PutRecord`      | kinesis | Envoyer un record     |
| `lambda:InvokeFunction`  | lambda  | Invoquer une Lambda   |

### 4.1 — Variantes de notation

**Liste d'actions :**

```json
"Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
```

**Wildcard sur un service entier :**

```json
"Action": "s3:*"
```

→ Toutes les actions S3. **Très large, à éviter en production** sauf à savoir ce qu'on fait.

**Wildcard avec préfixe :**

```json
"Action": "s3:Get*"
```

→ Toutes les actions S3 qui commencent par `Get` (`GetObject`, `GetBucketLocation`, `GetBucketPolicy`, …). Utile pour des permissions "lecture seule" sur un service.

**Wildcard global (sur tous les services) :**

```json
"Action": "*"
```

→ Toutes les actions de tous les services. **Le `AdministratorAccess`** — à utiliser **uniquement** pour le rôle d'admin du compte.

### 4.2 — Les grandes familles d'actions

| Famille                                             | Préfixes typiques                               | Risque                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Lecture (Read)**                                  | `Get*`, `Describe*`, `List*`                    | Faible (mais peut révéler des secrets si on List les Secrets Manager…).                                                             |
| **Écriture (Write)**                                | `Put*`, `Create*`, `Update*`, `Delete*`         | Modifie les ressources. À cadrer.                                                                                                   |
| **Gestion de permissions (Permissions Management)** | `iam:*`, `s3:PutBucketPolicy`, `kms:Put*Policy` | **Critique**. Peut donner des droits à des tiers.                                                                                   |
| **Tagging**                                         | `*:TagResource`, `*:UntagResource`              | Modifie la classification. Important si on utilise les tags pour contrôler les permissions (Attribute-Based Access Control — ABAC). |
| **List**                                            | `List*`                                         | Découverte (ne lit pas le contenu, mais énumère).                                                                                   |

Dans la console IAM, ces familles sont visibles dans le visualiseur de policies.

### 4.3 — Anti-patterns sur Action

| Anti-pattern                                             | Risque                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"Action": "*"` partout                                  | Permissions illimitées. À réserver à `AdministratorAccess`.                                                                                           |
| `"Action": "s3:*"` sans Condition                        | Tout sur S3, y compris suppression de buckets.                                                                                                        |
| Oublier `s3:ListBucket` quand on autorise `s3:GetObject` | Permet de lire un objet par URL exacte mais pas de lister le contenu. Symptôme : "j'ai accès au fichier mais je ne peux pas le voir dans la console". |
| Confondre `iam:*` et `iam:Get*`                          | Le premier permet de **changer les permissions** — escalade de privilèges.                                                                            |

---

## 5. Resource — sur quoi

`Resource` désigne **les ressources concernées**, en ARN.

### 5.1 — Variantes

**Une ressource précise :**

```json
"Resource": "arn:aws:s3:::my-bucket/file.txt"
```

**Plusieurs ressources :**

```json
"Resource": [
  "arn:aws:s3:::my-bucket",
  "arn:aws:s3:::my-bucket/*"
]
```

**Wildcard dans l'ARN :**

```json
"Resource": "arn:aws:s3:::my-bucket/users/*/profile.json"
```

→ Tous les `profile.json` sous `users/*/` du bucket.

**Toutes les ressources :**

```json
"Resource": "*"
```

→ Toutes les ressources sur lesquelles l'action peut s'appliquer. Légitime pour certaines actions (par exemple `s3:ListAllMyBuckets` n'a pas de ressource granulaire).

### 5.2 — Le couple Action / Resource doit être cohérent

Tous les couples ne sont pas valides. Par exemple :

| Action            | Resource valides                                               |
| ----------------- | -------------------------------------------------------------- |
| `s3:GetObject`    | ARN d'objets (`arn:aws:s3:::bucket/*`).                        |
| `s3:ListBucket`   | ARN de buckets (`arn:aws:s3:::bucket`), **pas** d'objets.      |
| `s3:CreateBucket` | `"*"` (la ressource n'existe pas encore au moment de l'appel). |
| `iam:CreateUser`  | `arn:aws:iam::ACCOUNT:user/*` ou un user précis.               |

Si on met une action sur une ressource où elle ne s'applique pas, le statement **n'autorise rien** (silencieusement). C'est une source de bugs classique → utiliser le **policy validator** ou le **simulator**.

### 5.3 — Variables dans les ARN

IAM permet d'utiliser des **variables** dans les ressources :

```json
"Resource": "arn:aws:s3:::user-uploads/${aws:username}/*"
```

→ Chaque user a accès **uniquement** au dossier portant son nom. Utilisé pour du multi-tenant simple.

Autres variables courantes :

- `${aws:username}` — nom du user IAM.
- `${aws:userid}` — ID unique du user.
- `${saml:sub}` — subject SAML (federation).

---

## 6. Condition — l'item N2 explicite

C'est **l'item N2 majeur** du module : savoir écrire une policy avec **conditions map**.

### 6.1 — Structure d'une condition

```json
"Condition": {
  "<operator>": {
    "<condition-key>": "<value>"
  }
}
```

Trois pièces :

- **Operator** : comment comparer (égalité, inégalité, contenance, IP, time, bool, …).
- **Condition key** : la "variable" sur laquelle on filtre (`aws:SourceIp`, `aws:RequestTag/X`, `s3:prefix`, …).
- **Value** : la valeur attendue.

### 6.2 — Operators courants

| Famille                      | Operators                                                         |
| ---------------------------- | ----------------------------------------------------------------- |
| **String**                   | `StringEquals`, `StringNotEquals`, `StringLike`, `StringNotLike`. |
| **Numeric**                  | `NumericEquals`, `NumericLessThan`, `NumericGreaterThan`, …       |
| **Date / Time**              | `DateEquals`, `DateLessThan`, `DateGreaterThan`.                  |
| **Boolean**                  | `Bool`.                                                           |
| **IP**                       | `IpAddress`, `NotIpAddress`.                                      |
| **ARN**                      | `ArnEquals`, `ArnLike`.                                           |
| **Null** (clé existe ou non) | `Null`.                                                           |

Chaque operator a une variante `IfExists` (matche si la clé n'existe pas) et `ForAllValues` / `ForAnyValue` (pour les clés multi-valeurs).

### 6.3 — Condition keys globales (préfixe `aws:`)

Disponibles pour **toutes** les actions de tous les services :

| Key                          | Valeur                                               |
| ---------------------------- | ---------------------------------------------------- |
| `aws:CurrentTime`            | Heure de la requête (ISO 8601).                      |
| `aws:SourceIp`               | IP source de l'appel API.                            |
| `aws:SecureTransport`        | `true` si HTTPS, `false` sinon.                      |
| `aws:MultiFactorAuthPresent` | `true` si la session est authentifiée par MFA.       |
| `aws:MultiFactorAuthAge`     | Secondes depuis l'authentification MFA.              |
| `aws:PrincipalArn`           | ARN du principal qui fait la requête.                |
| `aws:PrincipalTag/<TagKey>`  | Tag attaché au principal.                            |
| `aws:RequestTag/<TagKey>`    | Tag que la requête essaie de poser sur la ressource. |
| `aws:ResourceTag/<TagKey>`   | Tag déjà attaché à la ressource ciblée.              |
| `aws:UserAgent`              | User-agent du client.                                |
| `aws:SourceVpc`              | VPC source de l'appel (si depuis un VPC endpoint).   |
| `aws:SourceVpce`             | VPC Endpoint source.                                 |
| `aws:RequestedRegion`        | Région ciblée par la requête.                        |

### 6.4 — Condition keys spécifiques à un service (préfixe `<service>:`)

Chaque service AWS expose ses propres condition keys :

- **S3** : `s3:prefix`, `s3:delimiter`, `s3:x-amz-acl`, `s3:VersionId`, `s3:RequestObjectTag/<key>`.
- **EC2** : `ec2:InstanceType`, `ec2:Region`, `ec2:ResourceTag/<key>`, `ec2:Vpc`.
- **IAM** : `iam:PermissionsBoundary`, `iam:PassedToService`.

Référence officielle : [Actions, Resources, and Condition Keys](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html).

### 6.5 — Exemples concrets

**Exemple 1 — autoriser GetObject seulement depuis une IP** :

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*",
  "Condition": {
    "IpAddress": { "aws:SourceIp": "203.0.113.0/24" }
  }
}
```

**Exemple 2 — exiger HTTPS pour toute action sur le bucket** :

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": {
    "Bool": { "aws:SecureTransport": "false" }
  }
}
```

Lecture : "Refuser toute action sur le bucket si la connexion **n'est pas** HTTPS." Best practice de sécurité.

**Exemple 3 — exiger MFA pour des actions destructives** :

```json
{
  "Effect": "Deny",
  "Action": ["s3:DeleteBucket", "s3:DeleteObject"],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
  }
}
```

Lecture : "Refuser les suppressions si MFA absent (ou non vérifiable)." Le suffixe `IfExists` traite l'absence de la clé comme un échec — utile pour les credentials de service qui n'ont pas de MFA.

**Exemple 4 — restreindre par tag de ressource** (ABAC) :

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringEquals": { "ec2:ResourceTag/Owner": "${aws:username}" }
  }
}
```

Lecture : "Chaque user peut start/stop les instances qu'il a taggées avec son nom." Permission **dynamique** basée sur les tags.

**Exemple 5 — restreindre une plage horaire** :

```json
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "DateGreaterThan": { "aws:CurrentTime": "2026-01-01T00:00:00Z" },
    "DateLessThan": { "aws:CurrentTime": "2026-12-31T23:59:59Z" }
  }
}
```

Lecture : "Cette policy n'est active qu'en 2026." Utile pour des permissions temporaires (mission externe à durée déterminée, par exemple).

**Exemple 6 — exiger l'origine d'un VPC endpoint** :

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::sensitive-bucket",
    "arn:aws:s3:::sensitive-bucket/*"
  ],
  "Condition": {
    "StringNotEquals": { "aws:SourceVpce": "vpce-0abc123" }
  }
}
```

Lecture : "Refuser tout accès au bucket sauf si la requête vient via le VPC endpoint `vpce-0abc123`." Empêche tout accès depuis Internet, même par un user IAM légitime.

### 6.6 — Combiner plusieurs conditions

À l'intérieur d'un même `Condition` block, les conditions sont **toutes ET**. Pour faire un OU, on duplique les statements.

```json
"Condition": {
  "IpAddress": {"aws:SourceIp": "203.0.113.0/24"},
  "Bool": {"aws:MultiFactorAuthPresent": "true"}
}
```

Lecture : "IP dans `203.0.113.0/24` **ET** MFA présent."

À l'intérieur d'un operator donné, les valeurs sont en **OU** :

```json
"IpAddress": {"aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]}
```

→ Une IP dans **l'une ou l'autre** des plages.

---

## 7. NotAction, NotResource, NotPrincipal — les négations

IAM offre des **éléments négatifs** : "tout sauf…". Utilisation **rare**, mais utile à connaître.

### 7.1 — NotAction

```json
{
  "Effect": "Allow",
  "NotAction": ["iam:*", "kms:*"],
  "Resource": "*"
}
```

Lecture : "Autoriser **toutes les actions sauf** celles d'IAM et de KMS." Pratique pour donner un "admin restreint".

**Attention** : `NotAction` avec `Allow` peut être **plus permissif que prévu**. Tout nouveau service AWS sera autorisé automatiquement.

### 7.2 — NotResource

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "NotResource": "arn:aws:s3:::secret-bucket/*"
}
```

Lecture : "Autoriser GetObject sur **tous** les objets S3 **sauf** ceux de `secret-bucket`."

### 7.3 — NotPrincipal (resource-based uniquement)

```json
{
  "Effect": "Deny",
  "NotPrincipal": { "AWS": "arn:aws:iam::ACCOUNT:role/admin" },
  "Action": "s3:DeleteObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

Lecture : "Refuser la suppression d'objets sauf si on est le rôle `admin`." **Très puissant**, à manier avec précaution (risque de se locker dehors).

### 7.4 — À éviter en première intention

Les négations sont souvent **moins lisibles** et **plus risquées** que les positives explicites. Quand on peut écrire `Allow + liste explicite`, **préférer** cette forme.

---

## 8. Le modèle d'évaluation complet

À chaque appel API, IAM exécute une évaluation **en plusieurs étapes**. Connaissance N2 :

### 8.1 — L'algorithme simplifié

```
1. Y a-t-il un Deny explicite quelque part qui matche ?
   - Oui → REFUSER (point final).
   - Non → étape 2.

2. Y a-t-il un Allow explicite quelque part qui matche ?
   - Non → REFUSER (refus par défaut).
   - Oui → étape 3.

3. Le Allow est-il limité par une Permission Boundary ou un SCP plus restrictif ?
   - Oui (limité) → REFUSER.
   - Non → AUTORISER.
```

### 8.2 — Les sources de policies évaluées

Pour un user IAM appelant `s3:GetObject` sur un objet :

| Source                                     | Pertinence                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| **Identity-based** (sur le user)           | Oui — toutes les policies attachées au user et à ses groupes. |
| **Resource-based** (sur le bucket / objet) | Oui — bucket policy, ACL.                                     |
| **Permission Boundary** (sur le user)      | Oui si configurée — agit comme un plafond.                    |
| **SCP** (au niveau de l'AWS Organization)  | Oui si dans une Org — agit aussi comme un plafond global.     |
| **Session policy** (pour un rôle assumé)   | Oui si fournie au moment de l'`AssumeRole`.                   |

### 8.3 — Cas concret

Un user `alice` avec :

- Policy attachée : `Allow s3:* on *`.
- Permission Boundary : `Allow s3:Get*, s3:List* on *`.
- Bucket policy : ne mentionne pas Alice.

Quand Alice tente `s3:PutObject` :

- Identity-based : autorisé (`s3:*`).
- Permission Boundary : **non autorisé** (seulement Get/List).
- → **Refusé** (la boundary plafonne).

Quand Alice tente `s3:GetObject` :

- Identity-based : autorisé.
- Boundary : autorisé.
- Bucket policy : silencieuse (donc neutre — pas de Deny, pas de besoin d'Allow car identity-based suffit).
- → **Autorisé**.

Pour un cas plus complet (cross-account, où on a _besoin_ du resource-based en plus), voir M4-M5.

---

## 9. Patterns courants et anti-patterns

### 9.1 — Patterns utiles

**Read-only sur un service** :

```json
{ "Effect": "Allow", "Action": "rds:Describe*", "Resource": "*" }
```

**Read-write sur un bucket, mais pas suppression** :

```json
[
  {
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"]
  },
  { "Effect": "Deny", "Action": "s3:DeleteObject", "Resource": "*" }
]
```

**Self-service** (chaque user gère ses propres credentials) :

```json
{
  "Effect": "Allow",
  "Action": [
    "iam:ChangePassword",
    "iam:CreateAccessKey",
    "iam:UpdateAccessKey",
    "iam:DeleteAccessKey"
  ],
  "Resource": "arn:aws:iam::*:user/${aws:username}"
}
```

### 9.2 — Anti-patterns à reconnaître

| Anti-pattern                                                   | Risque                                           |
| -------------------------------------------------------------- | ------------------------------------------------ |
| `"Action": "*", "Resource": "*"` sur un user normal.           | Compromission = compte AWS pris.                 |
| Bucket policy avec `"Principal": "*"` sans condition.          | Bucket public ouvert.                            |
| Confondre `Allow Deny` (mauvaise syntaxe, n'existe pas).       | Policy invalide.                                 |
| Combiner `NotAction + Deny` mal réfléchi.                      | Souvent inverse de l'intention.                  |
| Ne pas tester avec **IAM Policy Simulator** avant de déployer. | Surprises après coup.                            |
| Ignorer le **Version** ou y mettre une autre date.             | Policy invalide ou comportement non standard.    |
| Wildcard dans Resource pour des actions destructives.          | Suppression accidentelle massive possible.       |
| Oublier les **conditions de support `IfExists`** pour MFA.     | Les credentials de service échouent inutilement. |

---

## 10. Écrire des policies — pratique

### 10.1 — Méthode en 5 étapes

1. **Identifier l'action principale** : que veut-on autoriser ? (GetObject, RunInstances, …)
2. **Identifier les ressources** : sur quoi exactement ? (un bucket précis, un préfixe, une table…)
3. **Écrire le premier statement Allow minimal**.
4. **Tester via IAM Policy Simulator** ou via la CLI réelle.
5. **Ajouter des conditions ou un Deny si nécessaire** pour cadrer.

### 10.2 — Outils

**AWS IAM Policy Simulator** : interface web où on injecte une policy et une requête, on voit le verdict.

**AWS CLI :**

```bash
# Valider la syntaxe d'une policy
aws accessanalyzer validate-policy \
  --policy-document file://my-policy.json \
  --policy-type IDENTITY_POLICY

# Simuler une décision pour un user existant
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:user/alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/file.txt
```

### 10.3 — Conventions de nommage

- **PolicyName** : descriptif et orienté usage : `S3ReadOnly-ClientUploads`, `EC2-DevSelfService`, `DenyIAMChanges`.
- **Sid** : un par statement, CamelCase : `AllowReadObjects`, `DenyDeleteWithoutMFA`.
- **Tagger** systématiquement avec `Owner`, `Project`, `Environment` pour l'audit.

---

## 11. Exercices pratiques

### Exercice 1 — Écrire une policy minimale (≈ 20 min)

**Objectif.** L'item du glossaire "écrire une policy minimale".

**Cas.** Le service de déploiement doit pouvoir :

- Lister tous les objets du bucket `app-artifacts`.
- Lire / écrire / supprimer les objets sous le préfixe `deployments/`.

**Livrable.** La policy JSON correspondante (avec Sid, Effect, Action, Resource explicites — pas de wildcard inutile).

### Exercice 2 — Écrire une policy avec conditions (≈ 30 min)

**Objectif.** L'item N2 explicite.

**Cas.** Construire la policy d'un rôle "Developer-Sandbox" qui peut :

- Lire et écrire dans S3 (`s3:GetObject`, `s3:PutObject`) sur les buckets taggés `Environment=sandbox`.
- Sans permettre la suppression de **buckets** ni d'**objets**.
- Uniquement depuis le VPC endpoint `vpce-0abc123`.
- Uniquement en HTTPS.
- Uniquement avec MFA actif.

**Livrable.** La policy JSON complète avec **toutes** les conditions imbriquées.

### Exercice 3 — Décoder une policy existante (≈ 20 min)

**Objectif.** Lire à vue ce qui est autorisé / refusé.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCRUDUnderUserPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::user-files/${aws:username}/*"
    },
    {
      "Sid": "AllowListOwnPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::user-files",
      "Condition": {
        "StringLike": { "s3:prefix": "${aws:username}/*" }
      }
    },
    {
      "Sid": "DenyOutsideOwnPrefix",
      "Effect": "Deny",
      "Action": "s3:*",
      "NotResource": [
        "arn:aws:s3:::user-files/${aws:username}/*",
        "arn:aws:s3:::user-files"
      ]
    }
  ]
}
```

Répondre :

1. À quoi cette policy donne-t-elle accès ?
2. Quelle est l'utilité du 3ᵉ statement ?
3. Que se passe-t-il si Alice tente `s3:GetObject` sur `user-files/bob/photo.jpg` ?
4. Que se passe-t-il si Bob essaie `s3:ListBucket` sur `user-files` ?
5. Pourquoi `${aws:username}` plutôt qu'un nom en dur ?

### Exercice 4 — Simuler une décision IAM (≈ 20 min)

**Objectif.** Manipuler le simulator.

**Étapes :**

1. Créer un user de test `alice-test`.
2. Lui attacher la policy `S3ReadOnly` (AWS-managed).
3. Via la CLI, simuler son accès à `s3:GetObject` sur un bucket existant : attendu = `allowed`.
4. Simuler son accès à `s3:PutObject` : attendu = `implicitDeny`.
5. Attacher une seconde policy avec `Deny s3:*`. Re-simuler `s3:GetObject` : attendu = `explicitDeny`.

**Livrable.** Captures CLI + une phrase d'explication pour chaque verdict.

### Exercice 5 — Bucket policy avec condition (≈ 25 min)

**Objectif.** Écrire une resource-based policy.

**Cas.** Le bucket `client-data` doit :

- Permettre à l'ensemble des users du compte `111111111111` de **lire** les objets…
- …mais **uniquement** s'ils accèdent en HTTPS.
- Toute tentative d'accès sans MFA doit être refusée.

**Livrable.** La bucket policy JSON.

### Mini-défi — Combiner identity-based et resource-based (≈ 30 min)

**Cas.** Le user `alice` (compte 111111111111) doit pouvoir lire les objets du bucket `external-data` qui appartient au compte 222222222222.

**Quelles policies écrire ? Où les attacher ?**

**Livrable.** Schéma + 2 policies JSON (une identity-based pour Alice, une resource-based pour le bucket).

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **6 clés principales** d'une policy IAM (Version, Statement, Effect, Action, Resource, Condition, Principal) et leur rôle.
- [ ] Énoncer la **règle d'évaluation** : refus par défaut → Allow autorise → Deny refuse en priorité.
- [ ] Distinguer **Allow** et **Deny**.
- [ ] Distinguer **Principal explicite** (resource-based) et **implicite** (identity-based).
- [ ] Citer 4 manières de **désigner un Principal** (compte, user, role, service).
- [ ] Citer les 4 grandes familles d'**Action** (Read, Write, Permissions Management, Tagging).
- [ ] Donner 3 cas où mettre un **wildcard** dans Action ou Resource est risqué.
- [ ] Décrire la structure d'une **Condition** (operator + key + value).
- [ ] Citer 5 **condition keys globales** (`aws:SourceIp`, `aws:MultiFactorAuthPresent`, `aws:SecureTransport`, `aws:RequestedRegion`, `aws:CurrentTime` ou autres).
- [ ] **Écrire une policy avec condition** pour : autoriser GetObject seulement en HTTPS + MFA, depuis une IP.
- [ ] Expliquer ce qu'est un **NotAction** et pourquoi c'est dangereux.
- [ ] Décrire le **modèle d'évaluation complet** (identity-based + resource-based + boundary + SCP).

### Items du glossaire visés

**N1 (consolidation)** :

- _attributs indispensables d'une policy IAM (Principal, Resource, Action)_ — sections 3, 4, 5.

**N2 atteint** :

- _créer des policies IAM avec des conditions map_ — section 6.

---

## 13. Ressources complémentaires

### Documentation AWS

- [IAM JSON policy elements](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html)
- [Condition operators](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html)
- [Global condition context keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html)
- [Actions, Resources, and Condition Keys reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html) — la référence absolue.
- [Policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)

### Outils

- [IAM Policy Simulator](https://policysim.aws.amazon.com/)
- [IAM Policy Validator (Access Analyzer)](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html)
- [aws iam simulate-principal-policy](https://docs.aws.amazon.com/cli/latest/reference/iam/simulate-principal-policy.html)
- [Visualiseur de policy console IAM](https://aws.amazon.com/blogs/security/visualize-aws-iam-policy-changes/)

### Pour aller plus loin

- **M3 (Access Keys et alternatives)** — comprendre pourquoi les clés permanentes sont à éviter.
- **M4 (Policies avancées)** — identity-based vs resource-based en détail, inline vs managed, Permission Boundaries.
- **M5 (Assume role et STS)** — la mécanique des credentials temporaires.
- **M6 (Moindre privilège)** — appliquer en pratique tout ce qu'on a vu.
