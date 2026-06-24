# M8 — Identity Center

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS Identity Center** (anciennement **AWS SSO**) comme le service AWS de gestion centralisée des **identités humaines** et des **accès multi-comptes**.
- Énoncer la **différence avec Cognito** sur au moins six axes : population servie, scale, intégration AWS, source d'identité, durée de session, audit.
- Définir un **Permission Set** : sa structure (managed policies + inline + permissions boundary + durée de session), son lien avec un **rôle IAM** créé automatiquement dans chaque compte cible.
- **Attribuer un Permission Set** à un utilisateur ou à un groupe sur un ou plusieurs comptes AWS (action centrale du N2).
- Comprendre le **portail utilisateur Identity Center** (Access Portal) et les modes d'utilisation : **console** ("Switch role") et **CLI** (`aws sso login`).
- Reconnaître les patterns canoniques (utilisation avec **AWS Organizations**, federation avec **IdP d'entreprise**, attribution par groupe) et les anti-patterns (IAM users humains malgré Identity Center, Permission Sets trop larges, pas de groupes…).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M7 (entités IAM, policies, AssumeRole, Cognito).
- Recommandé : **AWS Organizations** activé sur le compte (Identity Center est typiquement utilisé en multi-comptes).
- AWS CLI v2 avec support `sso` (v2.0+).
- Connaissance basique d'un IdP d'entreprise (Active Directory, Okta, Google Workspace) pour les sections de federation.

---

## 1. Pourquoi Identity Center

### 1.1 — Le problème des IAM users humains

À petite échelle (un compte AWS, 2-3 admins), un IAM user par humain fonctionne. Au-delà :

- **Plusieurs comptes AWS** : il faut créer le user dans chaque compte → multiplication de comptes à gérer.
- **Onboarding / offboarding** d'employés : créer / supprimer dans chaque compte = friction et risque d'oublis.
- **Pas de SSO** : chaque user a son propre password AWS, à mémoriser ou stocker.
- **Rotation des credentials** : access keys statiques par user — risque (vu en M3).
- **Audit** : qui s'est connecté quand, depuis où ? Difficile sans outillage externe.
- **Pas d'intégration IdP** : si l'entreprise a Active Directory ou Okta, on devrait pouvoir réutiliser ces identités.

**Identity Center résout tout cela** en centralisant l'auth humaine au niveau de l'**Organisation** et en distribuant des **rôles temporaires** dans chaque compte cible.

### 1.2 — L'histoire — AWS SSO devenu Identity Center

- **2017** : AWS SSO sort.
- **2022** : renommé **AWS IAM Identity Center**.
- **2026** : c'est **le standard recommandé** pour l'accès humain à AWS multi-comptes.

Le renommage marque l'évolution : ce n'est plus juste "SSO", c'est un **service d'identité complet** intégré à AWS Organizations.

### 1.3 — Ce qu'Identity Center fait

- **Annuaire centralisé** d'utilisateurs et de groupes (ou federation avec un IdP externe).
- **Permission Sets** : templates de permissions qui se matérialisent en rôles IAM dans les comptes cibles.
- **Attribution** : "ce user / ce groupe a ce Permission Set sur ces comptes".
- **Portail utilisateur** : page web où chaque user voit la liste des comptes auxquels il a accès, et clique pour s'y connecter (console ou CLI).
- **Sessions temporaires** : sous le capot, c'est `AssumeRoleWithSAML` ou `AssumeRoleWithWebIdentity` → credentials temporaires (1-12 h).
- **Audit centralisé** : CloudTrail logs avec session names traçables.

### 1.4 — L'analogie de l'entreprise multi-sites

Une entreprise avec 5 bureaux dans différentes villes :

- **Sans Identity Center** : chaque bureau a sa propre liste de cartes d'accès. Quand un employé est embauché, il faut lui créer 5 cartes. Quand il part, en retirer 5 (et on en oublie souvent une).
- **Avec Identity Center** : un seul badge nominatif, configuré au siège, qui ouvre les portes des 5 bureaux selon les autorisations. Quand l'employé part, on désactive le badge **une fois** au siège, et les 5 bureaux sont automatiquement à jour.

Identity Center = le badge unique + le siège qui gère.

### 1.5 — Identity Center, c'est gratuit (et global)

Comme IAM et STS, Identity Center est **gratuit** (on paye seulement les actions effectuées par les users qui y atterrissent).

C'est un service **régional** : on choisit la région d'hébergement à l'activation, mais il sert tous les comptes de l'Organisation.

---

## 2. Identity Center vs Cognito — la distinction CAPITALE (item N2)

C'est **l'item N2 explicite** du module. La confusion est fréquente, mais la distinction est claire.

### 2.1 — Tableau comparatif

| Aspect                   | **Identity Center**                                          | **Cognito**                                                               |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Pour qui ?**           | **Opérateurs** AWS : employés, devs, admins, ops             | **Utilisateurs finaux** : clients de votre app                            |
| **Population**           | Dizaines à milliers (taille de l'entreprise)                 | Milliers à millions (taille du marché)                                    |
| **Cas d'usage**          | Gérer AWS (console, CLI, multi-comptes)                      | Login app SaaS web/mobile                                                 |
| **Source d'identité**    | IdP entreprise (AD, Okta, Google Workspace) ou store interne | Cognito interne, federation Google/FB/Apple                               |
| **Sortie**               | Rôle IAM dans un compte AWS                                  | JWT pour votre app (et optionnellement credentials AWS via Identity Pool) |
| **Durée de session**     | 1-12 h                                                       | 1 h (access), 30 j (refresh)                                              |
| **Tarif**                | Gratuit                                                      | Free tier 50k MAU, ensuite ~0,0055 $/MAU                                  |
| **Intégration avec AWS** | Native (AWS Organizations, comptes IAM)                      | Native (S3, API Gateway via Identity Pool)                                |
| **API d'auth**           | `AssumeRoleWithSAML` (sous le capot)                         | OAuth 2.0 / OIDC                                                          |
| **Audit**                | CloudTrail avec session names                                | Cognito events + CloudWatch                                               |

### 2.2 — La règle de décision

``` graph
Question : qui doit s'authentifier ?

  ├── Un EMPLOYÉ de votre entreprise (admin, dev, ops, support)
  │   → Identity Center
  │
  └── Un CLIENT/UTILISATEUR de votre produit
      → Cognito
```

C'est aussi simple que cela. Les **deux** services peuvent coexister dans la même organisation, pour des populations différentes.

### 2.3 — Cas concret — entreprise SaaS

Une entreprise SaaS a :

- **30 employés** (devs, ops, support, sales) qui accèdent à AWS pour développer / opérer.
  → **Identity Center**, fédéré avec Google Workspace.
- **5 000 clients** qui se loguent à l'application SaaS.
  → **Cognito User Pool**.

Aucun conflit. Chacun son périmètre.

### 2.4 — Pourquoi on les confond

Plusieurs raisons :

- Les deux gèrent de **l'auth** → mot-clé commun.
- Les deux émettent des **tokens / credentials**.
- Les deux supportent la **federation**.
- Les deux sont AWS services dans le pavé "Security, Identity & Compliance".

La **clé pour ne plus se tromper** : se demander **qui** est authentifié.

---

## 3. Architecture Identity Center

### 3.1 — Composants

``` graph
┌──────────────────────────────────────────────────┐
│ AWS Organizations                                │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Identity Center (dans le compte management)│  │
│  │                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  │  │
│  │  │ Identity Source │  │ Permission Sets │  │  │
│  │  │ - Built-in      │  │ - AdminAccess   │  │  │
│  │  │ - AD            │  │ - PowerUser     │  │  │
│  │  │ - External IdP  │  │ - ReadOnly      │  │  │
│  │  │   (Okta, Google)│  │ - Custom        │  │  │
│  │  └────────┬────────┘  └────────┬────────┘  │  │
│  │           │                    │           │  │
│  │           ▼                    ▼           │  │
│  │  ┌────────────────────────────────────┐    │  │
│  │  │ Assignments                        │    │  │
│  │  │ user/group + permission set +      │    │  │
│  │  │ account(s)                         │    │  │
│  │  └─────────────────┬──────────────────┘    │  │
│  └────────────────────┼───────────────────────┘  │
│                       │                          │
│         ┌─────────────┼─────────────┐            │
│         │             │             │            │
│         ▼             ▼             ▼            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│   │ Compte A │  │ Compte B │  │ Compte C │       │
│   │ (auto)   │  │ (auto)   │  │ (auto)   │       │
│   │ Role :   │  │ Role :   │  │ Role :   │       │
│   │ AWSReser-│  │ AWSReser-│  │ AWSReser-│       │
│   │ vedSSO_  │  │ vedSSO_  │  │ vedSSO_  │       │
│   │ <PS-Name>│  │ <PS-Name>│  │ <PS-Name>│       │
│   └──────────┘  └──────────┘  └──────────┘       │
└──────────────────────────────────────────────────┘
```

### 3.2 — Identity Source — les 3 options

À l'activation, on choisit **une** source d'identité (modifiable plus tard, mais avec migration) :

| Source                                                                  | Pour qui ?                         | Avantage                                       | Inconvénient                                    |
| ----------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| **Identity Center directory** (built-in)                                | Entreprises sans IdP, ou démarrage | Aucune dépendance externe.                     | Mots de passe à gérer dans IAM Identity Center. |
| **Active Directory** (on-prem ou AWS Directory Service)                 | Entreprises avec AD                | Identités existantes, SSO direct.              | AD à maintenir.                                 |
| **External IdP** (Okta, Azure AD, Google Workspace, Ping, JumpCloud, …) | Entreprises modernes               | Source unique, gestion centralisée chez l'IdP. | Configuration SAML/SCIM à faire.                |

**Recommandation 2026** : si on a déjà Okta / Google Workspace / Azure AD, **fédérer**. Sinon, démarrer avec le directory built-in et migrer plus tard.

### 3.3 — Permission Set

Un **Permission Set** est un **template de permissions** qu'on définit **une fois** dans Identity Center. Il contient :

- Des **AWS-managed policies** attachées (ex. `AdministratorAccess`, `ReadOnlyAccess`).
- Des **Customer-managed policies** (créées dans les comptes cibles avec le nom de la PS).
- Des **inline policies** (incluses dans la définition de la PS).
- Une **Permission Boundary** optionnelle.
- Une **session duration** (1-12 h, défaut 1 h).
- Un **relay state URL** optionnel (page de redirection après login).

Quand on **attribue** un Permission Set à un user/group sur un compte cible :

1. Identity Center **crée automatiquement** un rôle IAM dans le compte cible, nommé `AWSReservedSSO_<PermissionSetName>_<hash>`.
2. Ce rôle a la trust policy autorisant Identity Center à l'assumer.
3. Le user, en se loguant à ce compte via le portail, **assume** ce rôle.

### 3.4 — Assignment

Un **assignment** est le **triplet** :

``` txt
(Principal, PermissionSet, AccountTarget)
```

Où Principal est un user ou un groupe Identity Center.

Exemple :

| Principal          | Permission Set        | Account         |
| ------------------ | --------------------- | --------------- |
| group "Developers" | `DeveloperAccess`     | dev-account     |
| group "Developers" | `ReadOnly`            | prod-account    |
| group "Admins"     | `AdministratorAccess` | ALL accounts    |
| user "alice"       | `BillingAccess`       | billing-account |

**Bonne pratique** : assigner aux **groupes**, pas aux **users**. La gestion devient triviale à l'échelle.

### 3.5 — Le portail utilisateur (Access Portal)

Chaque utilisateur Identity Center a accès à un portail web personnalisé :

``` log
https://<your-subdomain>.awsapps.com/start
```

Sur ce portail, il voit la liste des comptes auxquels il a accès et, pour chaque compte, les Permission Sets attribués.

Cliquer sur un Permission Set offre deux options :

- **Management Console** : ouvre la console AWS du compte cible avec les permissions du Permission Set (durée = session duration).
- **Command line / Programmatic access** : affiche les credentials temporaires à copier dans son shell, **ou** propose un setup `aws sso` (recommandé).

---

## 4. Activer Identity Center — pas à pas

### 4.1 — Prérequis

- AWS Organizations activée (Identity Center s'active dans le **management account**).
- Permissions IAM nécessaires (Administrator du management account ou rôle équivalent).

### 4.2 — Activation

```bash
# Activer Identity Center (en pratique, via la console, plus simple)
aws sso-admin create-instance-access-control-attribute-configuration \
  ... # (rarement fait par CLI, généralement console)
```

Étape par étape via la console :

1. **AWS Console → Identity Center → Enable**.
2. Choisir la **région d'hébergement** (irréversible — choisir la région principale de l'organisation).
3. Identity Center est activé. Le **management account** voit l'option dans la nav.

### 4.3 — Choisir la source d'identité

``` md
Identity Center → Settings → Identity source → Change

Options :
  - Identity Center directory (built-in)
  - Active Directory
  - External identity provider
```

Pour ce TP, partir sur **built-in directory** (le plus simple).

### 4.4 — Créer un utilisateur (built-in directory)

``` md
Identity Center → Users → Add user
  Username : alice
  Email : alice@example.com
  First name : Alice
  Last name : Smith
  Display name : Alice S.
```

Alice reçoit un email d'invitation avec un lien pour définir son mot de passe et activer MFA.

### 4.5 — Créer un groupe

``` md
Identity Center → Groups → Create group
  Name : Developers
  Description : "Dev team — all environments"
```

Ajouter Alice au groupe Developers.

---

## 5. Permission Sets — création et attribution

### 5.1 — Créer un Permission Set "ReadOnly"

``` md
Identity Center → Permission sets → Create permission set
  Type : Predefined permission set
  Template : ReadOnlyAccess
  Name : ReadOnlyAccess
  Description : "Read-only access to all services"
  Session duration : 4 hours
```

### 5.2 — Créer un Permission Set custom

``` md
Identity Center → Permission sets → Create permission set
  Type : Custom permission set
  Name : DeveloperSandbox
  Description : "Dev autonomie sandbox"
  AWS managed policies : (none)
  Customer managed policies : (none — voir plus bas)
  Inline policy : voir ci-dessous
  Permissions boundary : (optional)
  Session duration : 4 hours
```

Inline policy d'exemple :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:*", "ec2:*", "lambda:*", "logs:*", "cloudwatch:*"],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["iam:*", "kms:*"],
      "Resource": "*"
    }
  ]
}
```

### 5.3 — Attribuer un Permission Set (item N2 pratique central)

Via la console (la plus simple en N2) :

``` md
Identity Center → AWS accounts → (sélectionner un compte cible)
  → Assign users or groups
  → Sélectionner le groupe "Developers"
  → Sélectionner le Permission Set "DeveloperSandbox"
  → Submit
```

Via CLI :

```bash
# Lister les Permission Sets
aws sso-admin list-permission-sets \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef

# Récupérer l'ARN de DeveloperSandbox
PS_ARN=$(aws sso-admin list-permission-sets \
  --instance-arn $INSTANCE_ARN \
  --query 'PermissionSets[]' --output text | while read ps; do
    NAME=$(aws sso-admin describe-permission-set \
      --instance-arn $INSTANCE_ARN \
      --permission-set-arn $ps \
      --query 'PermissionSet.Name' --output text)
    if [ "$NAME" = "DeveloperSandbox" ]; then echo $ps; fi
  done)

# Attribuer le PS au groupe sur un compte cible
aws sso-admin create-account-assignment \
  --instance-arn $INSTANCE_ARN \
  --target-id 222222222222 \
  --target-type AWS_ACCOUNT \
  --permission-set-arn $PS_ARN \
  --principal-type GROUP \
  --principal-id <group-id>
```

Quelques minutes après l'attribution, Identity Center crée **automatiquement** un rôle IAM dans le compte 222222222222, nommé `AWSReservedSSO_DeveloperSandbox_<hash>`.

### 5.4 — Que voit l'utilisateur

Alice ouvre `https://<your-subdomain>.awsapps.com/start` :

- Elle voit la liste des comptes AWS auxquels elle a accès.
- Pour chaque compte, la liste des Permission Sets attribués.
- Elle clique sur "DeveloperSandbox" du compte `dev-account` → bascule en console AWS de ce compte avec les permissions du PS, pour 4 h.

---

## 6. Utilisation côté CLI — `aws sso login`

Le mode CLI est plus avancé mais essentiel pour l'utilisation quotidienne.

### 6.1 — Configurer un profil SSO

```bash
aws configure sso

# Réponses :
# SSO start URL : https://your-subdomain.awsapps.com/start
# SSO region : eu-west-1
# (Le navigateur s'ouvre pour login)
# Choose account : dev-account
# Choose role : DeveloperSandbox
# Profile name : dev
```

Cela crée dans `~/.aws/config` :

```ini
[profile dev]
sso_session = my-org
sso_account_id = 222222222222
sso_role_name = DeveloperSandbox
region = eu-west-1
output = json

[sso-session my-org]
sso_start_url = https://your-subdomain.awsapps.com/start
sso_region = eu-west-1
sso_registration_scopes = sso:account:access
```

### 6.2 — Se logger et utiliser

```bash
# Login (ouvre le navigateur, demande validation)
aws sso login --profile dev

# Utiliser la CLI avec ces credentials
aws s3 ls --profile dev
aws ec2 describe-instances --profile dev
```

Les credentials sont cachées dans `~/.aws/sso/cache/` et valides pendant la session duration (4 h dans notre exemple).

### 6.3 — Auto-renouvellement

Au bout de 4 h, le prochain appel `aws ... --profile dev` déclenche automatiquement une re-validation (ouverture du navigateur). Si on a MFA, on revalide.

C'est **la** méthode moderne d'authentification CLI sur AWS.

---

## 7. Federation avec un IdP d'entreprise

### 7.1 — Cas typique — Okta

Si l'entreprise utilise Okta comme IdP :

1. **Côté Okta** : créer une application "AWS SSO" en mode SAML 2.0.
2. **Côté Identity Center** : Settings → Identity source → External identity provider. Fournir le métadata XML d'Okta.
3. **SCIM** (optionnel mais recommandé) : configurer la synchronisation automatique des users / groupes Okta → Identity Center.
4. À ce stade : un user crée dans Okta arrive automatiquement dans Identity Center. On lui attribue des Permission Sets sur les comptes via groupes Okta.

### 7.2 — Bénéfices

- **Single source of truth** : l'IdP entreprise est la vérité. Si un employé part, sa désactivation dans Okta le coupe automatiquement d'AWS.
- **MFA déjà géré** par l'IdP (push notifications, FIDO2, …).
- **Onboarding zéro** : à l'arrivée, l'employé est dans Okta → AWS access auto-provisionné via les groupes.
- **Audit centralisé** chez l'IdP en plus de CloudTrail.

### 7.3 — Federation avec Google Workspace

Même principe avec Google Workspace : configurer Identity Center comme application SAML dans la Google Admin Console, fournir le métadata IdP, brancher SCIM si on veut le sync automatique.

Pour les startups qui utilisent Google Workspace, c'est **le** setup recommandé.

---

## 8. Patterns canoniques et anti-patterns

### 8.1 — Patterns canoniques

**Pattern 1 — Multi-comptes avec quelques Permission Sets**.

Plutôt que des dizaines de Permission Sets fins, en avoir **5-10 standards** qui couvrent 95 % des cas :

- `AdministratorAccess` — pour les admins.
- `PowerUserAccess` — pour les seniors devs.
- `DeveloperSandbox` — pour les devs en autonomie sur dev/staging.
- `ReadOnly` — pour les analystes, support, audit.
- `BillingAccess` — pour la finance.
- `SecurityAuditor` — pour la sécurité (read-only étendu sur Config, GuardDuty, …).

**Pattern 2 — Attribution par groupes**.

Toujours assigner les Permission Sets à des **groupes**, jamais à des **users individuels**. Un user appartient à 1-3 groupes selon son rôle.

**Pattern 3 — Permission Sets différents par environnement**.

``` txt
Developers + DeveloperSandbox sur dev-account
Developers + ReadOnly         sur prod-account
SeniorDevs + PowerUser        sur dev-account
SeniorDevs + DeveloperSandbox sur prod-account
```

**Pattern 4 — Session courte pour la prod**.

PS sur prod : 1 h max. PS sur dev/staging : 4-8 h.

**Pattern 5 — MFA obligatoire**.

Configurer Identity Center pour exiger MFA à chaque login.

### 8.2 — Anti-patterns

| Anti-pattern                                                              | Conséquence                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Garder des **IAM users humains** alors qu'Identity Center est en place.   | Double système, audit éclaté, onboarding/offboarding cassé. |
| Attribuer les PS à des **users individuels**.                             | Maintenance cauchemar à 50+ users.                          |
| Permission Sets **trop larges** (AdministratorAccess pour tout le monde). | Risque sécurité énorme.                                     |
| Pas d'**MFA**.                                                            | Compromission un seul facteur.                              |
| Session duration **trop longue** (12 h sur prod).                         | Credentials volés = accès durable.                          |
| Confondre Identity Center et Cognito.                                     | Erreurs architecturales.                                    |
| Ne pas tagger les Permission Sets et les rôles SSO.                       | Audit / FinOps difficile.                                   |
| Pas de federation alors qu'on a Okta / Google Workspace.                  | Onboarding manuel, double maintenance.                      |

---

## 9. Exercices pratiques

### Exercice 1 — Activer Identity Center et créer un user (≈ 30 min)

**Objectif.** Mettre le pied à l'étrier.

**Étapes :**

1. Activer Identity Center dans la région principale de votre Organisation.
2. Choisir le **built-in directory**.
3. Créer un user `dev-test@example.com` (utiliser un email vraiment accessible pour l'invitation).
4. Créer un groupe `Developers` et y ajouter le user.
5. Activer Identity Center comme delegated administrator pour permettre la gestion depuis un compte non-management (optionnel mais bonne pratique).

**Livrable.** Capture du portail utilisateur après login.

### Exercice 2 — Créer 2 Permission Sets (≈ 30 min)

**Objectif.** Maîtriser la création de PS.

**Étapes :**

1. Créer `ReadOnlyAccess` (depuis le template AWS-managed).
2. Créer `DeveloperSandbox` avec :
   - AWS-managed `PowerUserAccess`.
   - Inline policy `Deny iam:*, kms:*`.
   - Session duration : 4 h.

**Livrable.** Captures des 2 PS configurés.

### Exercice 3 — Attribuer un Permission Set (≈ 20 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Choisir un compte cible (peut être le management account, pour simplifier).
2. Attribuer `ReadOnlyAccess` au groupe `Developers` sur ce compte.
3. Attribuer `DeveloperSandbox` au user `alice` individuel sur un autre compte (juste pour observer la différence — en pratique on évite).
4. Constater dans IAM du compte cible que les rôles `AWSReservedSSO_*` ont été créés automatiquement.

**Livrable.** Captures montrant les attributions + les rôles créés.

### Exercice 4 — Utilisation CLI avec aws sso login (≈ 30 min)

**Objectif.** Configurer la CLI moderne.

**Étapes :**

1. Configurer un profil avec `aws configure sso`.
2. Login : `aws sso login --profile <name>`.
3. Tester : `aws sts get-caller-identity --profile <name>`. L'ARN doit être de type `arn:aws:sts::ACCOUNT:assumed-role/AWSReservedSSO_<PS>_<hash>/<email>`.
4. Faire quelques actions API (par exemple `aws s3 ls`).
5. Attendre la fin de session (ou supprimer le cache) et tester le re-login automatique.

**Livrable.** Capture de `get-caller-identity` montrant un ARN SSO.

### Exercice 5 — Federation avec Google Workspace (≈ 60 min, optionnel)

**Objectif.** Aller plus loin.

**Étapes :**

1. Configurer Identity Center comme application SAML dans Google Admin.
2. Brancher le SCIM pour la synchro automatique.
3. Mapper des groupes Google → groupes Identity Center.
4. Tester un login avec un compte Google.

**Livrable.** Capture du flux complet + un user qui se connecte via Google.

### Mini-défi — Architecture multi-comptes (≈ 30 min, papier)

**Cas.** Organisation AWS avec 6 comptes :

- `management`
- `audit`
- `security`
- `dev`
- `staging`
- `prod`

**Équipes** :

- Admins (2 personnes)
- Devs (8 personnes)
- Senior Devs / Ops (3 personnes)
- Security (2 personnes)
- Billing (1 personne)
- Audit externe (variable, parfois 0)

**Concevoir** :

1. Quels groupes Identity Center ?
2. Quels Permission Sets ?
3. Matrice d'attribution (groupe × PS × compte) ?
4. Session duration par compte ?
5. MFA policy ?

**Livrable.** Matrice complète + justifications.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Identity Center** et son rôle (gestion identité humaine multi-comptes).
- [ ] Citer les **différences entre Identity Center et Cognito** sur au moins 6 axes (population, scale, cas d'usage, source d'identité, durée, tarif).
- [ ] Énoncer la **règle de décision** "employé → Identity Center, client → Cognito".
- [ ] Définir un **Permission Set** : ce qu'il contient (policies, boundary, session duration).
- [ ] Expliquer **comment un Permission Set se matérialise** dans les comptes cibles (rôle IAM `AWSReservedSSO_*` créé automatiquement).
- [ ] Décrire les **3 sources d'identité** d'Identity Center (built-in, AD, External IdP).
- [ ] **Attribuer un Permission Set** à un user/groupe sur un compte cible de mémoire (étapes console et CLI).
- [ ] Configurer un **profil AWS CLI SSO** et faire `aws sso login`.
- [ ] Citer **3 patterns canoniques** (5-10 PS standards, attribution par groupes, sessions courtes en prod, MFA, …).
- [ ] Citer **3 anti-patterns** (IAM users humains, attribution par user, PS trop larges, pas d'MFA).

### Items du glossaire visés

**N2 atteint** :

- _différences entre Identity Center et Cognito_ — section 2.
- _attribuer des Permission Sets à des utilisateurs ou des groupes_ — sections 5 et exercice 3.

---

## 11. Ressources complémentaires

### Documentation AWS

- [Identity Center User Guide](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [Permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html)
- [SCIM provisioning](https://docs.aws.amazon.com/singlesignon/latest/userguide/scim-profile-saml.html)
- [Federate with external IdP](https://docs.aws.amazon.com/singlesignon/latest/userguide/connectawsapp.html)
- [aws sso CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)

### Outils

- [Granted CLI](https://www.granted.dev/) — UX moderne pour Identity Center.
- [AWSume](https://github.com/trek10inc/awsume) — gestion multi-profils.
- [Leapp](https://www.leapp.cloud/) — desktop GUI pour AWS sessions.

### Bonnes pratiques

- [AWS Well-Architected Security Pillar — Identity](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [AWS Multi-Account Strategy](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html)

### Pour aller plus loin

- **M9 (Secret Manager vs Parameter Store)** — gestion des secrets applicatifs.
- **M10 (KMS et Certificate Manager)** — chiffrement.
- **Niveau 3** : permission sets avec séparation des responsabilités, SCP au niveau Organization, Control Tower, federation avancée.
- **Niveau 4** : architecture IAM multi-comptes, gestion fine des landing zones.
