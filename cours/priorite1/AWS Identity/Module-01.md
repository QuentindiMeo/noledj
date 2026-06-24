# M1 — Concepts IAM fondamentaux

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **IAM** (Identity and Access Management), son rôle dans AWS et son périmètre.
- Distinguer les **quatre entités principales** d'IAM : **User**, **Group**, **Role**, **Policy**.
- Expliquer précisément la **différence entre un rôle IAM et une policy** — distinction fondamentale du N1.
- Définir un **ARN** (Amazon Resource Name), **décomposer** ses 6 segments et reconnaître les variations selon les services.
- Lire une **policy IAM** minimale et y identifier les attributs indispensables : **Effect**, **Action**, **Resource**, **Principal** (et leur rôle).
- Comprendre le **modèle d'évaluation d'une permission** en première approche (qui peut faire quoi, sur quelle ressource).

## Durée estimée

0,5 jour.

## Pré-requis

- Compte AWS opérationnel.
- AWS CLI v2 configurée.
- Aucun pré-requis sur IAM lui-même — ce module est le **point de départ** du parcours.
- Avoir suivi le parcours **AWS Networking** est un plus (les patterns récurrents y sont mentionnés), pas un bloquant.

---

## 1. Pourquoi IAM

### 1.1 — La question fondamentale du cloud

Toute interaction avec AWS — créer une EC2, lire un objet S3, modifier une rule Security Group — est une **action** qu'un **acteur** (humain ou service) effectue sur une **ressource**.

À chaque interaction, AWS pose en interne **trois questions** :

1. **Qui** essaie de faire cela ? (l'**identité** : un user, un rôle assumé, un service AWS).
2. **Quoi** essaie-t-il de faire ? (l'**action** : `ec2:RunInstances`, `s3:GetObject`, …).
3. **Sur quoi** ? (la **ressource** : un ARN d'instance, d'objet, de bucket, …).

**IAM** est le service AWS qui répond à ces trois questions. Il gère :

- Les **identités** : qui peut interagir avec AWS.
- Les **politiques** : ce que chaque identité a le droit de faire.
- L'**évaluation** des requêtes : à chaque appel API, IAM vérifie l'autorisation.

### 1.2 — La place d'IAM

``` graph
      ┌────────────────────────────┐
      │ Acteur                     │  (humain, service, autre compte)
      └─────────────┬──────────────┘
                    │
                    │ Appel API : ec2:RunInstances
                    ▼
      ┌────────────────────────────┐
      │ IAM                        │  Vérifie : qui ? quelle action ? sur quoi ?
      │ Évaluation des permissions │  Autorise ou refuse
      └─────────────┬──────────────┘
                    │  Si autorisé :
                    ▼
      ┌────────────────────────────┐
      │ Service AWS                │
      │ (EC2, S3, Lambda, …)       │
      └────────────────────────────┘
```

Sans IAM, AWS n'aurait aucun moyen de savoir qui peut faire quoi → tout serait permis (catastrophique) ou rien ne serait permis (inutilisable).

### 1.3 — L'analogie de l'entreprise

Penser à IAM comme la **gestion des accès dans une entreprise** :

- **User** : un employé identifié, avec ses identifiants (login/password ou clé).
- **Group** : un service, une équipe (Finance, RH, IT). Permet de gérer les droits par groupe plutôt qu'individu par individu.
- **Role** : une **casquette temporaire** qu'un employé peut endosser. "Tu es développeur, mais aujourd'hui tu interviens dans la salle serveur — prends cette casquette de Sysadmin Junior pour 2 h".
- **Policy** : un **document écrit** détaillant ce qui est permis ("les Sysadmins peuvent redémarrer les serveurs ; les RH peuvent lire les fiches paie").

IAM ne porte **aucune** logique métier — c'est uniquement de l'autorisation. La logique du métier (que fait la Lambda, que stocke S3) est ailleurs ; IAM décide juste qui peut déclencher quoi.

### 1.4 — IAM est **global et gratuit**

Deux faits importants :

- IAM est un service **global** : il n'est pas attaché à une région. Une policy créée existe pour le compte entier.
- IAM est **gratuit** : on ne paye pas IAM en tant que tel. On paye seulement les services qu'IAM permet d'utiliser.

### 1.5 — Périmètre d'IAM (et ce qui n'en fait pas partie)

| Dans IAM                                  | Hors IAM                                      |
| ----------------------------------------- | --------------------------------------------- |
| Users, Groups, Roles                      | Cognito (auth des utilisateurs **finaux**)    |
| Policies (identity-based, resource-based) | Identity Center / SSO (gestion multi-comptes) |
| Access keys, MFA pour users IAM           | KMS (chiffrement, vu en M10)                  |
| STS (Security Token Service)              | Secrets Manager, Parameter Store (M9)         |
| Permission Boundaries                     | CloudTrail (audit, hors parcours direct)      |

IAM est le **noyau** ; les autres services (Cognito, KMS, Identity Center, …) gravitent autour pour des besoins spécifiques.

---

## 2. Les quatre entités IAM principales

### 2.1 — User

Un **IAM User** représente une **identité durable** dans le compte AWS — typiquement un humain (admin, dev, ops) ou parfois une application avec ses propres credentials longue durée.

| Caractéristique  | Détail                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| Identifiant      | Nom unique dans le compte (`alice`, `ci-deployer`).                          |
| Authentification | Mot de passe (pour la console) + access keys (pour CLI/SDK) + MFA optionnel. |
| Durée            | Permanent (jusqu'à suppression).                                             |
| Cas d'usage      | Admin humain, automation legacy, compte de service.                          |
| Limite           | 5 000 users par compte par défaut.                                           |

**Anti-pattern** : créer un IAM user **pour chaque application** ou **chaque CI** — préférer un **rôle** (voir 2.3). Aujourd'hui, les IAM users sont à réserver aux **humains** (et encore : remplacés par Identity Center / SSO en pratique moderne).

### 2.2 — Group

Un **IAM Group** est un **regroupement de users** auxquels on attache des policies. Permet de gérer les droits par fonction plutôt que par individu.

``` graph
Group : "Developers"
├── User : alice
├── User : bob
└── User : charlie

Policy attachée : "DevReadWriteS3", "DevReadOnlyRDS"
```

Quand Alice est ajoutée au groupe Developers, elle hérite immédiatement de toutes les policies du groupe. Quand elle quitte le groupe, elle perd ces droits.

**Bonnes pratiques :**

- **Toujours** mettre les users dans des groupes, jamais leur attacher de policy directement.
- Nommer les groupes par **fonction** ("Developers", "DataScientists", "SecurityOps"), pas par projet.
- Un user peut appartenir à **plusieurs groupes** (10 max par défaut).

### 2.3 — Role

Un **IAM Role** est une **identité temporaire** : pas de mot de passe, pas d'access keys permanentes, mais une **policy à assumer** par un autre acteur autorisé.

Quand un service ou un user **assume un rôle**, AWS lui remet des **credentials temporaires** (typiquement 1 h, configurable jusqu'à 12 h) avec les permissions du rôle.

| Caractéristique       | Détail                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Identifiant           | Nom unique dans le compte (`ec2-app-role`, `cross-account-readonly`).        |
| Authentification      | Aucune (le rôle est **assumé** par un acteur qui a la permission).           |
| Durée des credentials | 1 h par défaut, 15 min à 12 h configurables.                                 |
| Cas d'usage           | EC2 / Lambda / ECS qui appellent AWS, cross-account access, federation, SSO. |
| Limite                | 5 000 rôles par compte par défaut.                                           |

**Cas d'usage canoniques :**

- **EC2 → S3** : on attache un rôle à l'EC2 (instance profile). L'EC2 récupère automatiquement des credentials temporaires via le metadata service, sans qu'aucune clé ne soit stockée sur l'instance.
- **Lambda** : chaque fonction a un **execution role** que Lambda assume automatiquement.
- **Cross-account access** : un user du compte A assume un rôle du compte B pour y faire des actions.
- **Identity Center / SSO** : un user fédéré "atterrit" sur un rôle AWS via SAML/OIDC.

Les rôles sont **la** brique moderne d'IAM. Préférer **toujours** un rôle à des access keys statiques quand c'est possible.

### 2.4 — Policy

Une **policy** est un **document JSON** qui décrit **ce qui est permis ou interdit**. C'est l'objet sur lequel reposent **toutes** les décisions d'autorisation.

Une policy ne fait **rien** seule — elle doit être **attachée** à quelque chose :

- À un **user**, **group** ou **rôle** (on parle alors d'**identity-based policy**).
- À une **ressource** comme un bucket S3, une clé KMS, une queue SQS (on parle de **resource-based policy**).

Une policy est un document texte structuré, on l'écrit, on l'attache, et IAM consulte ces documents à chaque appel API.

Voir section 6 pour l'anatomie détaillée — et le module **M2** qui pousse plus loin.

### 2.5 — Récapitulatif

| Entité     | Quoi                     | Authentification | Durée                | Cas d'usage                 |
| ---------- | ------------------------ | ---------------- | -------------------- | --------------------------- |
| **User**   | Identité humaine durable | Password + clés  | Permanent            | Admin humain                |
| **Group**  | Regroupement de users    | (Hérité)         | Permanent            | Gestion par équipe          |
| **Role**   | Identité temporaire      | Aucune (assumée) | Credentials 1-12 h   | Services AWS, cross-account |
| **Policy** | Document de permissions  | N/A              | Permanent (attachée) | Décrit qui peut faire quoi  |

---

## 3. Rôle vs Policy — la distinction fondamentale (item N1)

C'est **l'item N1 le plus régulièrement raté** par les apprenants. La distinction tient en une phrase :

> Un **rôle** est une **identité** qui peut être assumée ; une **policy** est un **document** qui décrit des permissions.

**Conséquences :**

- Un rôle **a** une (ou plusieurs) policy(ies) attachée(s) — qui décrivent ce que le rôle peut faire.
- Une policy peut être attachée à **plusieurs** rôles (et aussi à des users / groups, dans le cas d'une identity-based policy).
- Un rôle **sans policy** n'a aucun droit. Une policy **non attachée** n'autorise rien.
- On **assume** un rôle (et on en obtient des credentials). On **n'assume pas** une policy.

### 3.1 — L'analogie du chantier

- Un **rôle** est une **paire de gants de protection** dans un casier au bord du chantier.
- Une **policy** est un **manuel d'utilisation** scotché à la paire de gants : "ces gants permettent de manipuler les outils X, Y, Z mais pas les outils W".
- Quand un ouvrier **enfile les gants**, il **assume** le rôle. Il peut alors faire ce que le manuel autorise. Quand il les retire, il perd ces droits.

Un rôle sans manuel : on l'enfile mais on ne sait rien faire (rejet).
Un manuel sans gants : un texte qui flotte, jamais activé.

### 3.2 — Exemple concret

``` tree
Rôle : ec2-s3-readonly-role
├── Trust policy : "qui a le droit d'assumer ce rôle ?"
│    └── { Service: "ec2.amazonaws.com" }  → seul EC2 peut l'assumer
└── Policy attachée : "AllowReadOnlyS3"
     └── { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::my-bucket/*" }
```

L'EC2 qui assume ce rôle peut faire `s3:GetObject` sur `my-bucket`. Rien d'autre.

Si on veut donner les mêmes droits à un user, on attache **la même policy** au user (sans avoir besoin de rôle). Si on veut les donner à une Lambda, on attache la même policy à un autre rôle qui a une trust policy pour `lambda.amazonaws.com`.

**La policy se réutilise ; le rôle est l'identité contextuelle qui l'active.**

---

## 4. Anatomie d'un ARN

L'**ARN** (Amazon Resource Name) est l'**identifiant universel** d'une ressource AWS. **Toute** ressource AWS a un ARN, et **toutes** les policies IAM s'expriment en termes d'ARN.

### 4.1 — La structure générale

Un ARN est une chaîne de **6 segments** séparés par des `:` :

``` txt
arn:partition:service:region:account-id:resource
```

| Segment      | Rôle                                                               | Exemple                                                    |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `arn`        | Préfixe constant.                                                  | `arn`                                                      |
| `partition`  | La grande zone AWS.                                                | `aws` (public), `aws-cn` (Chine), `aws-us-gov` (GovCloud). |
| `service`    | Le service AWS qui possède la ressource.                           | `s3`, `ec2`, `iam`, `lambda`, `kinesis`.                   |
| `region`     | La région AWS où vit la ressource. **Vide** pour services globaux. | `eu-west-1`, `us-east-1`, ou vide.                         |
| `account-id` | Le compte AWS propriétaire (12 chiffres).                          | `123456789012`. **Vide** pour S3.                          |
| `resource`   | L'identifiant local de la ressource dans le service.               | Très variable selon le service.                            |

### 4.2 — Exemples canoniques

**S3 bucket** (service global pour l'ARN, region vide, account-id vide) :

``` txt
arn:aws:s3:::my-bucket
```

**S3 object** :

``` txt
arn:aws:s3:::my-bucket/path/to/file.txt
```

**EC2 instance** :

``` txt
arn:aws:ec2:eu-west-1:123456789012:instance/i-0abc1234567890
```

**Lambda function** :

``` txt
arn:aws:lambda:eu-west-1:123456789012:function:my-function
```

**IAM user** (service global IAM, region vide) :

``` txt
arn:aws:iam::123456789012:user/alice
```

**IAM role** :

``` txt
arn:aws:iam::123456789012:role/ec2-app-role
```

**IAM policy** (managed) :

``` txt
arn:aws:iam::123456789012:policy/MyPolicy
```

**IAM policy AWS-managed** (compte AWS = `aws` au lieu d'un compte client) :

``` txt
arn:aws:iam::aws:policy/AdministratorAccess
```

**Kinesis stream** :

``` txt
arn:aws:kinesis:eu-west-1:123456789012:stream/orders-stream
```

### 4.3 — Variations par service

Le format `resource` varie selon le service. Trois variantes courantes :

| Format                      | Exemple                       | Services concernés        |
| --------------------------- | ----------------------------- | ------------------------- |
| `resource-type/resource-id` | `instance/i-0abc...`          | EC2, IAM, S3 (objets)     |
| `resource-type:resource-id` | `function:my-fn`              | Lambda, certains services |
| `resource-id` seul          | `my-bucket` (pour S3 buckets) | S3 buckets, queue SQS     |

À retenir : **lire la doc du service** pour le format exact, ou utiliser `aws ... describe-...` qui renvoie toujours l'ARN.

### 4.4 — Caractères spéciaux dans les ARN

- **Wildcard `*`** : autorisé pour exprimer "tout". Par exemple `arn:aws:s3:::my-bucket/*` = tous les objets du bucket.
- **Wildcard `?`** : un seul caractère.
- **Variables IAM** : `${aws:username}`, `${aws:CurrentTime}`. Très utile dans les policies (vu en M4).

### 4.5 — Pourquoi maîtriser les ARN dès le N1

Parce que **toute policy IAM** mentionne des ARN. Sans savoir les lire :

- On copie/colle sans comprendre, on autorise plus ou moins que voulu.
- On ne peut pas auditer une policy.
- On ne peut pas écrire une policy ciblée.

La règle d'or : **savoir lire un ARN à voix haute en moins de 5 secondes**.

---

## 5. Décomposer un ARN — exercice mental

Pour chaque ARN ci-dessous, identifier sans regarder la solution : service, region, account-id, type de ressource, identifiant local.

### Exemple 1

``` txt
arn:aws:ec2:eu-west-3:111122223333:security-group/sg-0abc1234
```

- **Service** : `ec2`
- **Region** : `eu-west-3` (Paris)
- **Account** : `111122223333`
- **Type** : `security-group`
- **ID** : `sg-0abc1234`

→ Un Security Group du compte 111122223333 en région Paris.

### Exemple 2

``` txt
arn:aws:s3:::user-uploads-prod/2026/05/photo.jpg
```

- **Service** : `s3`
- **Region** : (vide)
- **Account** : (vide)
- **Ressource** : `user-uploads-prod/2026/05/photo.jpg`

→ Un objet S3. La region et l'account ne figurent pas dans l'ARN S3 — c'est une particularité historique (les buckets S3 sont globalement uniques par nom).

### Exemple 3

``` txt
arn:aws:iam::aws:policy/ReadOnlyAccess
```

- **Service** : `iam`
- **Region** : (vide, IAM est global)
- **Account** : `aws` — c'est la convention pour les policies **AWS-managed** (gérées par AWS, pas par un compte client).
- **Type** : `policy`
- **Nom** : `ReadOnlyAccess`

→ Une policy AWS-managed. Reconnaissable au compte `aws` au lieu d'un compte client.

### Exemple 4

``` txt
arn:aws-us-gov:lambda:us-gov-west-1:444455556666:function:gov-audit-lambda
```

- **Partition** : `aws-us-gov` — partition GovCloud (pas la partition publique).
- **Service** : `lambda`
- **Region** : `us-gov-west-1`
- **Account** : `444455556666`
- **Type** : `function`
- **Nom** : `gov-audit-lambda`

→ Une Lambda dans GovCloud US.

---

## 6. Lire une policy minimale (attributs indispensables — item N1)

C'est le **second item N1 explicite** sur les policies : leurs **attributs indispensables**.

### 6.1 — Squelette JSON

Une policy IAM est un document JSON structuré :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

Quatre éléments clés :

1. **`Version`** : toujours `"2012-10-17"` (version du langage de policy). À mettre tel quel.
2. **`Statement`** : liste de **statements** (énoncés). Un statement = une règle. Une policy peut en contenir plusieurs.
3. À l'intérieur d'un statement :
   - **`Effect`** : `Allow` ou `Deny`.
   - **`Action`** : la ou les actions concernées (`s3:GetObject`, `ec2:RunInstances`, …). Peut être une chaîne ou un tableau.
   - **`Resource`** : la ou les ressources concernées (ARN). Peut être un tableau ou `"*"`.
   - **`Principal`** (resource-based policies uniquement) : qui est concerné (le user / role qui peut agir).
   - **`Condition`** (optionnel) : conditions supplémentaires (voir M2).

### 6.2 — Les attributs **indispensables** d'une policy (par le glossaire)

Le glossaire N1 demande de citer **trois attributs** :

| Attribut                            | Rôle                                            |
| ----------------------------------- | ----------------------------------------------- |
| **Principal**                       | **Qui** ? (l'identité concernée)                |
| **Resource**                        | **Sur quoi** ? (la ressource ciblée)            |
| **Action** (= droits / permissions) | **Quoi** ? (les actions autorisées ou refusées) |

À ces trois, on ajoute en pratique :

- **Effect** : Allow ou Deny (toujours nécessaire pour qu'une policy soit valide).
- **Condition** : optionnel, traité en M2/M4.

**Subtilité importante :**

- Dans une **identity-based policy** (attachée à un user/group/role) : le **Principal** est **implicite** — c'est l'identité à laquelle la policy est attachée. On l'omet du JSON.
- Dans une **resource-based policy** (attachée à un bucket S3, une queue SQS, etc.) : le **Principal** est **explicite** — il faut le citer (qui peut accéder à cette ressource).

Donc en pratique :

- Identity-based : `Effect`, `Action`, `Resource` (+ Condition optionnelle).
- Resource-based : `Effect`, `Principal`, `Action`, `Resource` (+ Condition optionnelle).

### 6.3 — Trois lectures concrètes

**Policy 1 — autoriser la lecture d'un bucket** (identity-based) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"]
    }
  ]
}
```

Lecture : "Autoriser GetObject et ListBucket sur my-bucket et tous ses objets."

À noter : `ListBucket` s'applique au **bucket** (`my-bucket`), `GetObject` s'applique aux **objets** (`my-bucket/*`). Ces deux ARN sont différents.

**Policy 2 — refuser explicitement la suppression** (identity-based) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

Lecture : "Interdire la suppression d'objets de my-bucket." Un `Deny` est **prioritaire** sur tout `Allow` (vu en M2).

**Policy 3 — resource-based sur un bucket** :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::123456789012:role/ec2-app-role" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

Lecture : "Le rôle `ec2-app-role` du compte 123456789012 peut lire les objets de my-bucket." Cette policy est attachée **au bucket**, pas au rôle. On indique le `Principal` car la policy n'est pas attachée à une identité particulière.

---

## 7. Le modèle d'évaluation — première vue

À chaque appel API, IAM évalue **toutes** les policies pertinentes :

1. **Identity-based policies** attachées à l'identité (user, group(s), role).
2. **Resource-based policies** attachées à la ressource ciblée.
3. **Permission Boundaries** (vu en M4) si configurées.
4. **Service Control Policies** (SCP, niveau 4) si dans une AWS Organization.

Trois principes :

- **Refus par défaut** : si rien n'autorise explicitement, la requête est refusée (par défaut).
- **Un `Allow` explicite** quelque part suffit à autoriser…
- **…sauf si un `Deny` explicite** existe. Un Deny gagne **toujours** sur un Allow.

Le détail complet est dans le **module M2 (Anatomie d'une policy)**. Ici, retenir la règle simple :

> Pour qu'une action soit autorisée : **au moins un Allow** + **aucun Deny** dans les policies évaluées.

---

## 8. Exercices pratiques

### Exercice 1 — Décomposer 10 ARN (≈ 15 min)

**Objectif.** Maîtriser la lecture d'ARN à vue.

Pour chacun des 10 ARN ci-dessous, identifier : service, région (ou "global"), compte, type de ressource, ID local. Sans rien chercher.

1. `arn:aws:rds:eu-west-1:111111111111:db:prod-postgres-1`
2. `arn:aws:sns:us-east-1:222222222222:topic/order-events`
3. `arn:aws:dynamodb:eu-west-3:111111111111:table/users`
4. `arn:aws:iam::333333333333:role/lambda-execution-role`
5. `arn:aws:sqs:eu-west-1:111111111111:queue/email-dlq.fifo`
6. `arn:aws:kms:eu-west-1:111111111111:key/12345678-1234-1234-1234-1234567890ab`
7. `arn:aws:cloudfront::111111111111:distribution/E2QWERTY12345`
8. `arn:aws:logs:eu-west-1:111111111111:log-group:/aws/lambda/my-fn:*`
9. `arn:aws:secretsmanager:eu-west-1:111111111111:secret:db-master-AbCdEf`
10. `arn:aws:execute-api:eu-west-1:111111111111:abc123/prod/GET/users`

**Livrable.** Une grille de 10 lignes.

### Exercice 2 — Écrire un premier ARN (≈ 10 min)

**Objectif.** Construire un ARN sans copier-coller.

Donner l'ARN attendu pour :

1. Le bucket S3 nommé `client-uploads`.
2. L'objet `2026/photo.jpg` dans ce bucket.
3. L'instance EC2 `i-0abcdef1234567890` dans la région `eu-west-3`, compte `444555666777`.
4. Le rôle IAM `cross-account-readonly` dans le compte `888999000111`.
5. La queue SQS standard `notifications` dans `us-east-1`, compte `111222333444`.

**Livrable.** 5 chaînes d'ARN.

### Exercice 3 — Identifier les attributs d'une policy (≈ 15 min)

**Objectif.** Maîtriser la lecture d'une policy.

Pour la policy ci-dessous, identifier :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:eu-west-1:111111111111:table/Users"
    },
    {
      "Effect": "Deny",
      "Action": "dynamodb:DeleteItem",
      "Resource": "*"
    }
  ]
}
```

1. Combien de statements contient-elle ?
2. Quels effets sont utilisés ?
3. Quelle est la ressource ciblée par le premier statement ?
4. Le second statement s'applique à quoi ?
5. Est-ce une identity-based ou resource-based ? Pourquoi ?
6. Un user avec cette policy peut-il **lire** la table `Users` ? Peut-il **supprimer** un item de **n'importe quelle** table ?

**Livrable.** 6 réponses.

### Exercice 4 — Distinguer user, role, policy (≈ 10 min)

**Objectif.** Mettre la main sur la distinction du N1.

Pour chacun des 6 cas, dire si on parle d'un **user**, d'un **group**, d'un **role**, d'une **policy**, ou de **plusieurs** :

1. Une EC2 qui doit lire dans S3.
2. Alice, l'admin AWS qui se connecte à la console.
3. La liste des autorisations attribuées aux développeurs.
4. Un compte de service utilisé par la CI pour déployer.
5. Un ensemble d'employés ayant les mêmes droits.
6. Le manuel qui dit "tu peux redémarrer une EC2 mais pas l'éteindre".

**Livrable.** 6 réponses argumentées en 1 phrase.

### Exercice 5 — Manipulation CLI (≈ 20 min)

**Objectif.** Toucher IAM via la CLI.

**Étapes :**

1. Lister tous les rôles du compte : `aws iam list-roles --query 'Roles[].{Name:RoleName, Arn:Arn}'`.
2. Lister toutes les policies AWS-managed dont le nom contient "ReadOnly" : `aws iam list-policies --scope AWS --query "Policies[?contains(PolicyName, 'ReadOnly')].{Name:PolicyName, Arn:Arn}"`.
3. Pour le rôle `<un-role-existant>`, lister les policies attachées : `aws iam list-attached-role-policies --role-name <un-role-existant>`.
4. Voir le contenu d'une policy AWS-managed : `aws iam get-policy-version --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess --version-id v??`.

**Livrable.** Captures des sorties + une phrase notant un fait observé qui surprend.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **IAM** et son rôle dans AWS.
- [ ] Distinguer **User**, **Group**, **Role**, **Policy** sur au moins 3 axes (durée, authentification, usage).
- [ ] Expliquer la **différence entre un rôle et une policy** en une phrase, et donner l'analogie des gants + manuel.
- [ ] Décomposer un **ARN** quelconque en 6 segments en moins de 5 secondes.
- [ ] Citer les **3 attributs indispensables** d'une policy (Principal, Resource, Action) et expliquer quand chacun est implicite ou explicite.
- [ ] Distinguer **identity-based** et **resource-based** policy par où elle est attachée et la présence ou non du Principal.
- [ ] Lire une policy JSON simple et dire ce qu'elle autorise / refuse.
- [ ] Énoncer la règle d'évaluation : au moins un Allow + aucun Deny.
- [ ] Donner 3 cas d'usage canoniques d'un **rôle** (EC2, Lambda, cross-account).

### Items du glossaire visés

**N1 atteint** :

- _différence entre un rôle IAM et une policy_ — sections 2 et 3.
- _attributs indispensables d'une policy IAM (Principle, Resource, droits)_ — section 6.
- _ce qu'est un ARN et comment il est constitué_ — sections 4 et 5.

Les autres items N1 (access_key, Cognito, Secrets Manager, Parameter Store) sont traités en M3, M7 et M9.

---

## 10. Ressources complémentaires

### Documentation AWS

- [IAM User Guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html)
- [Identities — Users, Groups, Roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id.html)
- [Policies and permissions in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)
- [ARN format](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html)
- [Actions, resources, and condition keys for AWS services](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html) — la référence absolue, à bookmarker.

### Outils

- [IAM Policy Simulator](https://policysim.aws.amazon.com/) — tester une policy avant de la déployer.
- [IAM Access Analyzer](https://aws.amazon.com/iam/features/analyze-access/) — détecter les permissions trop larges (vu en N3).

### Pour aller plus loin

- **M2 (Anatomie d'une policy)** — disséquer une policy en profondeur : Effect, Condition, NotAction, NotResource, ainsi que la logique d'évaluation complète.
- **M3 (Access Keys et alternatives)** — pourquoi les access keys statiques sont à éviter et comment les remplacer.
- **M4 (Policies avancées)** — identity-based vs resource-based, inline vs managed, Permission Boundaries.
- **M5 (Assume role et STS)** — la mécanique des credentials temporaires.
