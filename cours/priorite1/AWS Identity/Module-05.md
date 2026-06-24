# M5 — Assume role et STS

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir le **Security Token Service** (STS), son rôle dans IAM et les **5 API principales** qu'il expose : `AssumeRole`, `AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`, `GetSessionToken`, `GetFederationToken`.
- Expliquer le **mécanisme complet d'AssumeRole** : double évaluation (caller side + trust policy), récupération de credentials temporaires, durée configurable.
- Décomposer une **trust policy** : Principal qui peut assumer le rôle, action `sts:AssumeRole`, conditions optionnelles (ExternalId, MFA, source IP, …).
- Mettre en place un **cross-account access** complet : compte A assume un rôle du compte B, via CLI et via SDK.
- Comprendre l'usage de l'**`ExternalId`** comme protection contre le pattern "confused deputy" (tiers SaaS).
- Configurer une condition **MFA** sur AssumeRole pour les opérations sensibles.
- Reconnaître les patterns récurrents (`Switch Role` console, federation OIDC, chaining de rôles) et leurs limites.

## Durée estimée

1 jour.

## Pré-requis

- M1-M4 (entités IAM, policies, alternatives access keys, policies avancées).
- AWS CLI v2 configurée.
- **Recommandé** : disposer de **deux profils CLI** (deux comptes différents, ou un user + un rôle) pour les exercices cross-account.

---

## 1. Pourquoi STS

### 1.1 — Le besoin

Plusieurs situations exigent d'**emprunter une identité temporairement** plutôt que d'utiliser une identité durable :

- **EC2 → AWS API** : l'instance n'a pas d'access key statique (idéal), elle assume son rôle via Instance Profile (vu en M3).
- **Compte A → Compte B** : Alice du compte A doit faire un audit dans le compte B. Plutôt que de créer un user dans B, elle **assume** un rôle de B depuis son user de A.
- **Federation SSO / OIDC** : un user d'un IdP externe (Okta, Google, GitHub Actions) atterrit sur un **rôle AWS** via un token signé. Vu en M3 (OIDC).
- **Console "Switch Role"** : un admin se logue avec son user, puis bascule sur un rôle de plus hautes permissions pour une tâche précise. Permet de **journaliser** précisément les actions sensibles.
- **Délégation à un tiers** : un SaaS (Datadog, CrowdStrike, …) doit lire des logs / des metrics dans le compte client. Le tiers assume un rôle dédié dans ce compte.

Dans tous ces cas, **STS** est le service qui orchestre l'émission des credentials temporaires.

### 1.2 — L'analogie du visiteur

Un employé d'une autre entreprise vient en réunion :

- Il ne reçoit pas une **carte d'accès permanente** au bâtiment.
- Il reçoit un **badge visiteur** qui :
  - Est nominatif (on sait qui l'a porté).
  - Expire à la fin de la journée.
  - Donne accès **uniquement** aux salles autorisées.
  - Peut être révoqué immédiatement.

STS, c'est le **comptoir d'accueil** qui émet ces badges visiteurs. **Toute** identité temporaire passe par lui.

### 1.3 — Position de STS

``` graph
                       ┌─────────────────────────┐
                       │ STS                     │
                       │ (Security Token Service)│
                       └──────────┬──────────────┘
                                  │
                                  │ Émet des credentials temporaires
                                  │ (AK+SK+Session Token)
                                  │ Durée : 15 min à 12 h
                                  │
   ┌───────────────────────┬──────┴────────┬─────────────────────┐
   │ EC2 (instance profile)│ User → Role   │ Federation SSO/OIDC │
   │                       │ (assume role) │                     │
   └───────────────────────┴───────────────┴─────────────────────┘
```

Toutes les **identités contextuelles** d'AWS reposent sur STS sous le capot.

### 1.4 — STS, c'est gratuit (et global)

Comme IAM, STS est **gratuit** (on paye ce qu'on fait avec les credentials, pas leur émission).

Par défaut, STS a un **endpoint global** (`sts.amazonaws.com`) et des endpoints régionaux (`sts.eu-west-1.amazonaws.com`). Utiliser l'endpoint régional est **recommandé** : plus rapide, moins de dépendance à `us-east-1`, plus simple à filtrer par VPC endpoint.

---

## 2. STS — les 5 API principales

| API                             | Quand l'utiliser                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| **`AssumeRole`**                | Un user / role AWS assume un autre rôle (même ou autre compte).                     |
| **`AssumeRoleWithSAML`**        | Federation SAML 2.0 (Okta, AD FS, OneLogin, …).                                     |
| **`AssumeRoleWithWebIdentity`** | Federation OIDC (Cognito, Google, Facebook, GitHub Actions, …).                     |
| **`GetSessionToken`**           | Récupérer un token temporaire pour un user (typiquement avec MFA).                  |
| **`GetFederationToken`**        | Cas legacy : un service qui distribue des credentials à des users externes non-IAM. |

Pour le **niveau 2**, on creuse **`AssumeRole`** principalement (le plus utilisé) et on connaît les autres par leur nom.

---

## 3. AssumeRole — le mécanisme central

### 3.1 — Définition

`sts:AssumeRole` est l'appel API qui :

1. **Vérifie** que le caller (user / rôle) a la **permission** d'assumer le rôle cible.
2. **Vérifie** que le **rôle cible accepte** d'être assumé par ce caller (via sa **trust policy**).
3. Si oui, **émet** des credentials temporaires (AK + SK + Session Token) avec les permissions du rôle.

C'est une **double évaluation** : il faut que **les deux** policies (côté caller ET côté cible) soient satisfaites.

### 3.2 — Schéma complet

``` graph
┌─────────────────────────────────────────────────────────────┐
│ 1. Caller (user alice) appelle sts:AssumeRole(RoleArn=R)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │ 2. STS vérifie :            │
              │   (a) Alice a-t-elle une    │
              │       policy autorisant     │
              │       sts:AssumeRole sur R ?│
              │   (b) R a-t-il une trust    │
              │       policy autorisant     │
              │       Alice ?               │
              └─────────────────────────────┘
                            │
                  ┌─────────┴──────────┐
                  │                    │
                Refus               OK : 3.
                  │                    │
                  ▼                    ▼
       ┌──────────────────┐  ┌──────────────────────────┐
       │ AccessDenied     │  │ 3. STS émet credentials  │
       └──────────────────┘  │    temporaires :         │
                             │   - AccessKeyId (ASIA…)  │
                             │   - SecretAccessKey      │
                             │   - SessionToken         │
                             │   - Expiration (1 h par défaut) │
                             └──────────┬───────────────┘
                                        │
                                        ▼
                             ┌──────────────────────────┐
                             │ 4. Alice utilise ces      │
                             │    creds pour les appels  │
                             │    suivants avec les      │
                             │    permissions de R       │
                             └──────────────────────────┘
```

### 3.3 — Les paramètres clés

| Paramètre                       | Rôle                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `RoleArn` (obligatoire)         | ARN du rôle à assumer.                                                         |
| `RoleSessionName` (obligatoire) | Identifiant lisible de la session (visible dans CloudTrail).                   |
| `DurationSeconds`               | Durée de validité des credentials. Entre 15 min et 12 h. Défaut : 1 h.         |
| `Policy` (session policy)       | Restreindre encore plus les permissions du rôle pour cette session (vu en M4). |
| `PolicyArns`                    | Liste d'ARN de managed policies à appliquer comme session policy.              |
| `ExternalId`                    | Secret partagé pour le pattern "confused deputy" (voir 7).                     |
| `SerialNumber` + `TokenCode`    | Pour exiger MFA.                                                               |
| `Tags`                          | Session tags (voir 9).                                                         |

### 3.4 — Exemple CLI

```bash
# Alice (compte A) assume le rôle "audit-role" dans le compte B
aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/audit-role \
  --role-session-name "alice-audit-2026-05-17" \
  --duration-seconds 3600

# Sortie :
# {
#   "Credentials": {
#     "AccessKeyId": "ASIA...",
#     "SecretAccessKey": "...",
#     "SessionToken": "FwoGZXIvYXdzE...",
#     "Expiration": "2026-05-17T15:30:00Z"
#   },
#   "AssumedRoleUser": {
#     "AssumedRoleId": "AROA...:alice-audit-2026-05-17",
#     "Arn": "arn:aws:sts::222222222222:assumed-role/audit-role/alice-audit-2026-05-17"
#   }
# }
```

Pour utiliser ces credentials :

```bash
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=FwoGZXIvYXdzE...

aws s3 ls --region eu-west-1
# → Appelle l'API avec les permissions du rôle "audit-role"
```

### 3.5 — Le caractère "temporaire"

Trois propriétés des credentials temporaires :

- **Expiration absolue** : passée l'expiration, plus aucune action n'est autorisée → il faut re-appeler `AssumeRole`.
- **Pas de révocation directe** d'une session particulière (jusqu'à l'expiration). On peut **détacher** les policies du rôle ou supprimer le rôle → invalide toutes ses sessions actives en quelques minutes.
- **AccessKeyId préfixé par `ASIA`** : reconnaissable d'un coup d'œil.

### 3.6 — Reconnaître un caller assumé dans CloudTrail

Quand Alice fait un appel API avec les credentials temporaires, CloudTrail logge :

```json
{
  "eventName": "GetObject",
  "userIdentity": {
    "type": "AssumedRole",
    "principalId": "AROA...:alice-audit-2026-05-17",
    "arn": "arn:aws:sts::222222222222:assumed-role/audit-role/alice-audit-2026-05-17",
    "sessionContext": {
      "sessionIssuer": {
        "type": "Role",
        "userName": "audit-role"
      }
    }
  },
  ...
}
```

Trois faits importants pour l'audit :

- **Type** : `AssumedRole`.
- **RoleSessionName** apparaît dans l'ARN, donc on sait **qui** a assumé le rôle (si le nom est descriptif comme "alice-audit-2026-05-17").
- **SessionIssuer** : le rôle d'origine.

**Bonne pratique** : imposer dans les trust policies un `RoleSessionName` qui ressemble au user (par exemple, `${aws:username}-${aws:CurrentTime}`).

---

## 4. La trust policy — la double clé

C'est **la** policy qui détermine **qui peut assumer un rôle**.

### 4.1 — Définition

La **trust policy** d'un rôle est une **resource-based policy** attachée au rôle (techniquement), qui répond à : "qui a le droit d'invoquer `sts:AssumeRole` sur ce rôle ?".

À la création du rôle, on doit fournir une trust policy. Ensuite, modifiable.

### 4.2 — Exemples canoniques

**Trust policy pour un service AWS** (EC2 va assumer ce rôle) :

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

**Trust policy pour un cross-account** (le compte 111111111111 peut assumer ce rôle) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111111111111:root" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Le `root` ici ne désigne pas le root user — c'est la convention pour dire "n'importe quelle identité IAM du compte 111111111111 qui a la permission `sts:AssumeRole` sur ce rôle, peut le faire". La granularité fine se fait côté compte A.

**Trust policy pour un user précis** :

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

**Trust policy pour un rôle (chaining)** :

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111111111111:role/source-role" },
  "Action": "sts:AssumeRole"
}
```

Permet à un rôle d'**assumer un autre rôle**. Cas d'usage : un job CI/CD assume un rôle "déploiement" dans le compte cible.

**Trust policy avec OIDC (federation GitHub Actions)** :

```json
{
  "Effect": "Allow",
  "Principal": {
    "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:*"
    }
  }
}
```

**Trust policy avec MFA exigé** :

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::ACCOUNT:user/admin" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "Bool": { "aws:MultiFactorAuthPresent": "true" }
  }
}
```

### 4.3 — La double évaluation, détaillée

Récap : pour que `AssumeRole` réussisse, **deux** conditions doivent être satisfaites.

**Côté caller (le user qui appelle AssumeRole) :**

Il doit avoir une policy attachée du type :

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::222222222222:role/audit-role"
}
```

**Côté cible (le rôle à assumer) :**

Sa trust policy doit autoriser le caller :

```json
{
  "Principal": { "AWS": "arn:aws:iam::111111111111:user/alice" },
  "Action": "sts:AssumeRole"
}
```

**Les deux sont obligatoires.** Manquant l'un ou l'autre → AccessDenied.

C'est exactement le même principe que cross-account S3 : il faut **les deux côtés**.

### 4.4 — Mise à jour d'une trust policy

```bash
aws iam update-assume-role-policy \
  --role-name audit-role \
  --policy-document file://trust-policy.json
```

L'update est **immédiat** mais **non rétroactif** : les sessions déjà émises restent valides jusqu'à expiration.

---

## 5. Les credentials temporaires

### 5.1 — Composition

Trois éléments :

``` txt
AccessKeyId      : ASIA...                                            (20 chars)
SecretAccessKey  : ...                                                (40 chars)
SessionToken     : FwoGZXIvYXdzE... (très long, ~300-600 chars)
```

Le **session token** est ajouté par STS pour invalider les credentials passé l'expiration. Toute requête API avec credentials temporaires doit inclure le session token (header `X-Amz-Security-Token` dans la requête signée).

### 5.2 — Durée

| Cas                                 | Durée max                             | Défaut |
| ----------------------------------- | ------------------------------------- | ------ |
| `AssumeRole` par un user            | 12 h (configurable au niveau du rôle) | 1 h    |
| `AssumeRole` par un rôle (chaining) | **1 h max** (limite stricte)          | 1 h    |
| `AssumeRoleWithSAML`                | 12 h                                  | 1 h    |
| `AssumeRoleWithWebIdentity`         | 12 h                                  | 1 h    |
| `GetSessionToken`                   | 36 h                                  | 12 h   |
| `GetFederationToken`                | 36 h                                  | 12 h   |

À retenir : le **chaining de rôles** est limité à **1 h max**, même si on demande 12 h.

### 5.3 — Renouvellement

Les SDK et la CLI **renouvellent automatiquement** les credentials temporaires quand l'expiration approche, à condition que la **source** des credentials (le user, le rôle source) soit encore valide.

Pour un profil CLI avec source profile :

```ini
# ~/.aws/config

[profile default]
region = eu-west-1

[profile cross-account-audit]
role_arn = arn:aws:iam::222222222222:role/audit-role
source_profile = default
region = eu-west-1
mfa_serial = arn:aws:iam::111111111111:mfa/alice  # optionnel
```

Avec ce setup :

```bash
aws s3 ls --profile cross-account-audit
# La CLI lit le profile, voit qu'il faut assumer audit-role, fait l'appel STS en arrière-plan,
# cache les credentials, les renouvelle automatiquement avant expiration.
```

C'est la manière idiomatique d'utiliser AssumeRole au quotidien.

---

## 6. Les variantes d'AssumeRole — survol

### 6.1 — `AssumeRoleWithSAML`

Pour la **federation SAML 2.0**. L'IdP (Okta, AD FS) émet une assertion SAML signée, qui est échangée contre des credentials STS.

``` md
Workflow :
1. User s'authentifie auprès d'Okta.
2. Okta émet une assertion SAML.
3. Le client la passe à STS via AssumeRoleWithSAML.
4. STS valide la signature, vérifie la trust policy, émet des credentials.
```

Configuration : créer un **SAML identity provider** dans IAM, importer le métadata XML de l'IdP, créer un rôle avec trust policy `Federated: arn:aws:iam::ACCOUNT:saml-provider/Okta`.

### 6.2 — `AssumeRoleWithWebIdentity`

Pour la **federation OIDC**. Token OIDC signé (de GitHub Actions, Cognito, Google, …) → credentials STS.

Le workflow vu en M3 pour GitHub Actions repose dessus.

### 6.3 — `GetSessionToken`

Pour un **user IAM** qui veut obtenir des credentials temporaires (typiquement pour passer la barrière MFA).

```bash
aws sts get-session-token \
  --duration-seconds 3600 \
  --serial-number arn:aws:iam::ACCOUNT:mfa/alice \
  --token-code 123456
```

Renvoie des credentials temporaires "MFA-attested" qu'on peut utiliser pour des actions exigeant MFA dans leurs conditions.

### 6.4 — `GetFederationToken`

Cas **legacy** où un service distribue des credentials AWS à des users externes non-IAM. Aujourd'hui remplacé par AssumeRoleWithWebIdentity / Cognito.

---

## 7. ExternalId — confused deputy protection

### 7.1 — Le problème

Imaginons un SaaS tiers (par exemple Datadog) qui doit accéder à votre compte AWS pour lire des logs. Datadog vous donne un rôle qui dit "depuis le compte Datadog, j'assume ce rôle chez le client".

**Risque** : Datadog est un compte AWS aussi. Un **autre** client de Datadog pourrait, en théorie, demander à Datadog de "passer chez le client X aussi" — et Datadog le ferait sans le savoir. Ce risque s'appelle **confused deputy**.

### 7.2 — La solution — ExternalId

Une **chaîne secrète** partagée entre vous et Datadog, **uniquement** connue de vous deux. Datadog doit la fournir à chaque AssumeRole. Vous l'exigez dans votre trust policy via une condition :

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::DATADOG-ACCOUNT:role/integration-role" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "sts:ExternalId": "secret-shared-with-datadog-CLIENT-X" }
  }
}
```

Lecture : "Datadog peut assumer ce rôle **uniquement** s'il fournit `secret-shared-with-datadog-CLIENT-X`."

Datadog stocke cet ExternalId côté Datadog pour le compte client X. Quand un autre client tente de faire des opérations chez X via Datadog, Datadog n'aurait pas le bon ExternalId → AssumeRole échoue.

### 7.3 — Quand l'utiliser

- **Toujours** quand on configure un accès cross-account à un SaaS tiers (Datadog, CrowdStrike, JFrog, Snyk, …).
- **Inutile** pour un cross-account interne à votre organisation (vous contrôlez les deux côtés).

**Best practice** : générer un ExternalId **aléatoire et long** (au moins 32 caractères, par exemple un UUID v4) plutôt qu'un identifiant lisible.

---

## 8. MFA et AssumeRole

### 8.1 — Pourquoi exiger MFA

Pour les rôles **sensibles** (admin, prod write, suppression…), on veut s'assurer que le caller utilise un **second facteur** au moment d'assumer le rôle, même s'il a été authentifié il y a longtemps.

### 8.2 — Configuration

**Côté trust policy :**

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::ACCOUNT:user/admin" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "Bool": { "aws:MultiFactorAuthPresent": "true" },
    "NumericLessThan": { "aws:MultiFactorAuthAge": "3600" }
  }
}
```

Lecture : "Autoriser l'assume role **uniquement si MFA est présent ET datant de moins de 1 heure**."

**Côté caller :**

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT:role/admin-role \
  --role-session-name "alice-admin" \
  --serial-number arn:aws:iam::ACCOUNT:mfa/alice \
  --token-code 123456
```

Ou via la config CLI (config.ini) :

```ini
[profile admin]
role_arn = arn:aws:iam::ACCOUNT:role/admin-role
source_profile = default
mfa_serial = arn:aws:iam::ACCOUNT:mfa/alice
```

La CLI demandera le code MFA à chaque renouvellement de session.

### 8.3 — La protection MFA en pratique

Une trust policy MFA bloque :

- Les credentials volés sans MFA (leak GitHub, leak laptop).
- Les sessions automatisées (scripts CI/CD) — ces sessions doivent passer par un autre mécanisme (OIDC, dedicated role sans MFA).

Donc en pratique, on a **deux types** de rôles :

- Rôles **humains** : MFA exigé, durée courte.
- Rôles **service** : pas de MFA possible (CI/CD, Lambda, …), durée selon besoin, mais avec d'autres conditions (IP, ExternalId, source ARN).

---

## 9. Session tags — survol

À l'`AssumeRole`, on peut passer des **session tags** : des paires clé/valeur attachées à la session, accessibles dans les policies via la condition key `aws:PrincipalTag/<Key>`.

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT:role/multi-tenant-role \
  --role-session-name "alice" \
  --tags Key=Department,Value=Engineering Key=Project,Value=Atlas
```

Dans une policy attachée au rôle :

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::projects/${aws:PrincipalTag/Project}/*"
}
```

Lecture : "Le caller peut lire les objets de `projects/<son-projet>/`." Permet du **multi-tenant** clean sans dupliquer les rôles.

Sujet plutôt N3-N4. Bon à connaître.

---

## 10. Cross-account access — pas à pas

L'exercice central du module. Mettre en place un accès cross-account complet.

### 10.1 — Setup

- **Compte A** (`111111111111`) : un user `alice`.
- **Compte B** (`222222222222`) : un bucket `data-shared-from-B` contenant des objets.

Objectif : Alice peut lire les objets de `data-shared-from-B`.

### 10.2 — Étape 1 — Côté compte B : créer le rôle à assumer

```bash
# (sur les credentials du compte B)

# Trust policy : qui peut assumer ?
cat > trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111111111111:user/alice"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Créer le rôle
aws iam create-role --role-name cross-account-read-role \
  --assume-role-policy-document file://trust.json

# Attacher une policy minimale au rôle
cat > permissions.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::data-shared-from-B",
      "arn:aws:s3:::data-shared-from-B/*"
    ]
  }]
}
EOF

aws iam put-role-policy --role-name cross-account-read-role \
  --policy-name allow-bucket-read \
  --policy-document file://permissions.json
```

### 10.3 — Étape 2 — Côté compte A : autoriser Alice à assumer

```bash
# (sur les credentials du compte A)

cat > assume-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::222222222222:role/cross-account-read-role"
  }]
}
EOF

aws iam put-user-policy --user-name alice \
  --policy-name allow-assume-B-role \
  --policy-document file://assume-policy.json
```

### 10.4 — Étape 3 — Alice assume le rôle

```bash
# Alice exécute (avec ses credentials du compte A)
CREDS=$(aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/cross-account-read-role \
  --role-session-name "alice-cross-test")

export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r '.Credentials.SessionToken')

# Tester
aws s3 ls s3://data-shared-from-B
aws s3 cp s3://data-shared-from-B/file.txt /tmp/file.txt
```

### 10.5 — Étape 4 — Config CLI persistante

Configurer `~/.aws/config` pour ne plus avoir à exporter manuellement :

```ini
[profile default]
region = eu-west-1

[profile B-read]
role_arn = arn:aws:iam::222222222222:role/cross-account-read-role
source_profile = default
role_session_name = alice-from-A
region = eu-west-1
```

Puis :

```bash
aws s3 ls s3://data-shared-from-B --profile B-read
```

La CLI fait tout automatiquement.

### 10.6 — Variante console — Switch Role

Dans la console AWS, on peut cliquer "Switch Role" en haut à droite, fournir l'ARN du rôle, et basculer la console. Pratique pour les admins humains.

---

## 11. Patterns récurrents

### 11.1 — Switch Role d'admin

Un admin n'utilise **jamais** ses credentials puissants directement. Il :

- Se logue avec un user `alice` aux droits minimaux.
- Switch role vers `admin-prod-role` (trust policy : Alice + MFA exigé).
- Effectue ses tâches d'admin.
- Sort de la session.

Bénéfices : audit clair, rejet automatique de tout appel sans MFA, sessions courtes.

### 11.2 — Federation OIDC pour CI/CD

Vu en M3. Le pipeline GitHub Actions assume un rôle via OIDC pour déployer dans AWS. Pas de secret stocké.

### 11.3 — Chaining

``` graph
User Alice (compte A)
  ──assume──► role-intermediate (compte B)
                 ──assume──► role-final (compte C)
```

**Limite** : la session finale est limitée à **1 h max**. Et le chaining augmente la latence.

À utiliser avec parcimonie. Préférer une trust policy directe quand possible.

### 11.4 — SaaS tiers avec ExternalId

Pattern classique : Datadog, NewRelic, Sumo Logic, JFrog.

```json
{
  "Principal": { "AWS": "arn:aws:iam::SAAS-ACCOUNT:root" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "sts:ExternalId": "RANDOM-UUID-FOR-CLIENT" }
  }
}
```

### 11.5 — Multi-tenant via session tags

Vu en section 9. Une seule policy paramétrée par `${aws:PrincipalTag/Tenant}` pour servir N tenants sans dupliquer les rôles.

---

## 12. Exercices pratiques

### Exercice 1 — Cross-account complet (≈ 60 min)

**Objectif.** L'exercice central, section 10.

**Setup.** Deux profils CLI distincts (idéalement deux comptes AWS, sinon deux sub-accounts d'une Org, sinon un user + un rôle simulant).

**Étapes :** suivre la section 10 — trust policy côté B, identity policy côté A, AssumeRole, configurer la CLI.

**Bonus :** ajouter une **condition MFA** dans la trust policy et re-tester (doit échouer sans MFA).

**Livrable.** Captures des deux trust/identity policies + des tests réussis et échoués.

### Exercice 2 — Federation OIDC GitHub Actions (≈ 45 min)

**Objectif.** Mettre en place un AssumeRoleWithWebIdentity.

**Setup.** Un repo GitHub avec un workflow.

**Étapes :**

1. Créer un OIDC provider AWS pour `token.actions.githubusercontent.com`.
2. Créer un rôle avec trust policy :

   ```json
   {
     "Principal": {
       "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
     },
     "Action": "sts:AssumeRoleWithWebIdentity",
     "Condition": {
       "StringEquals": {
         "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
       },
       "StringLike": {
         "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
       }
     }
   }
   ```

3. Attacher une policy minimale (par exemple `s3:Sync` sur un bucket).
4. Workflow GitHub Actions qui assume le rôle et fait un `aws sts get-caller-identity`.

**Livrable.** Capture du workflow run réussi + caller identity affichée (doit être ASIA…).

### Exercice 3 — ExternalId (≈ 30 min)

**Objectif.** Sécuriser un accès tiers contre confused deputy.

**Étapes :**

1. Créer un rôle `tiers-saas-role` avec trust policy mentionnant un autre compte (peut être le même compte pour le TP) + une condition `sts:ExternalId`.
2. Tenter d'assumer sans ExternalId → AccessDenied.
3. Assumer avec le bon ExternalId → succès.
4. Assumer avec un mauvais ExternalId → AccessDenied.

**Livrable.** Captures des 3 tests.

### Exercice 4 — Trust policy avec MFA exigé (≈ 30 min)

**Objectif.** Forcer le MFA sur un rôle admin.

**Setup.** Un user avec MFA virtuel configuré (Google Authenticator, Authy, …).

**Étapes :**

1. Créer un rôle `mfa-required-role` avec trust policy exigeant `aws:MultiFactorAuthPresent: true`.
2. Tenter d'assumer sans MFA → échec.
3. Récupérer un session token avec MFA via `get-session-token --serial-number ... --token-code ...`.
4. Avec ces credentials, re-tenter l'assume role → succès.
5. Vérifier dans CloudTrail que la session est bien marquée MFA.

**Livrable.** Captures + extrait CloudTrail.

### Exercice 5 — Configuration CLI avec source_profile (≈ 20 min)

**Objectif.** Maîtriser la config CLI pour AssumeRole.

**Étapes :**

1. Éditer `~/.aws/config` pour ajouter un profil avec `role_arn` + `source_profile` + `mfa_serial`.
2. Lancer `aws sts get-caller-identity --profile <nom-du-profil>` — doit déclencher l'AssumeRole automatiquement.
3. Vérifier que la CLI a caché les credentials dans `~/.aws/cli/cache/`.
4. Faire un second appel — doit utiliser le cache (pas de re-AssumeRole).

**Livrable.** Capture de la config + des 2 appels (premier qui assume, second qui cache).

### Mini-défi — Concevoir un système cross-account (≈ 30 min, papier)

**Cas.** Une entreprise a 4 comptes AWS :

- `sandbox` (dev autonomie totale)
- `staging` (tests automatisés + QA manuel)
- `production` (workloads critiques)
- `audit` (lecture seule sur tout, pour la sécurité interne)

**Concevoir** :

1. Quels rôles dans chaque compte ?
2. Qui peut assumer quoi ?
3. Quelles conditions MFA/IP/ExternalId ?
4. Comment configurer la CLI / la console pour qu'un admin puisse switcher rapidement entre les 4 ?

**Livrable.** Schéma + listing des rôles avec leurs trust policies clés.

---

## 13. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **STS** et son rôle dans IAM.
- [ ] Citer les **5 API STS principales** et leur cas d'usage.
- [ ] Décrire le **mécanisme complet d'AssumeRole** en 4 étapes (caller policy → trust policy → émission → utilisation).
- [ ] Définir une **trust policy**, sa différence d'avec une identity-based policy classique.
- [ ] Énoncer la règle **"les deux côtés doivent autoriser"** pour AssumeRole.
- [ ] Reconnaître un **caller assumé dans CloudTrail** (type `AssumedRole`, ARN avec session name).
- [ ] Décrire les **3 composants** des credentials temporaires (AK ASIA, SK, SessionToken).
- [ ] Citer la **durée par défaut et max** d'une session AssumeRole, et la limite spéciale du **chaining (1h)**.
- [ ] Expliquer le pattern **confused deputy** et la solution **ExternalId**.
- [ ] Configurer une **condition MFA** dans une trust policy.
- [ ] Configurer la **CLI avec source_profile** pour un AssumeRole automatique.
- [ ] Mettre en place un **cross-account access complet** depuis zéro de mémoire (trust policy + identity policy + assume-role).

### Items du glossaire visés

**N2 atteint** :

- _fonctionnement de l'assume role pour déléguer des permissions_ — sections 3 à 10.
- _ce qu'est le Security Token Service (STS) dans IAM_ — sections 1 et 2.

---

## 14. Ressources complémentaires

### Documentation AWS

- [STS Documentation](https://docs.aws.amazon.com/STS/latest/APIReference/welcome.html)
- [AssumeRole API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- [Trust policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_terms-and-concepts.html)
- [Cross-account access](https://docs.aws.amazon.com/IAM/latest/UserGuide/tutorial_cross-account-with-roles.html)
- [Confused deputy and ExternalId](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html)
- [Switch roles in console](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-console.html)

### Outils

- [aws-vault](https://github.com/99designs/aws-vault) — gérer les credentials avec MFA + cache local.
- [AWS Extend Switch Roles](https://chrome.google.com/webstore/detail/aws-extend-switch-roles/) — extension navigateur pour switcher rapidement entre rôles dans la console.
- [Granted CLI](https://www.granted.dev/) — UX moderne pour gérer plusieurs rôles AWS.

### Pour aller plus loin

- **M6 (Moindre privilège)** — appliquer en pratique tout ce qu'on a vu.
- **M8 (Identity Center)** — l'évolution moderne de la gestion des rôles humains.
- **Niveau 3** : Trust policies fines, federation SAML, IAM Access Analyzer.
- **Niveau 4** : architecture IAM multi-comptes, AWS Organizations, SCP.
