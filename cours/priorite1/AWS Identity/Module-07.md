# M7 — Cognito

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **Cognito** comme le service AWS d'**authentification des utilisateurs finaux** (vs IAM qui gère les opérateurs / services AWS), et expliquer son **intérêt** : éviter de réinventer le système d'auth, gérer signup / signin / MFA / OAuth / federation sans serveur dédié.
- Distinguer clairement **User Pool** (annuaire d'utilisateurs + auth) et **Identity Pool** (federation → credentials AWS temporaires), comprendre quand l'un suffit et quand on combine les deux.
- Décrire le **flux OAuth 2.0 / OIDC** que Cognito implémente : `/authorize`, `/token`, `/userInfo`, codes d'autorisation, tokens (`id_token`, `access_token`, `refresh_token`).
- **Configurer un User Pool** : utilisateurs, attributs requis, password policy, MFA, app client, domaine hosted UI.
- **Configurer un Identity Pool** lié à un User Pool pour donner aux utilisateurs des **credentials AWS temporaires** (par exemple, upload S3 direct depuis le navigateur).
- Mettre en place une **auth web simple** avec hosted UI + redirection callback + récupération JWT côté frontend.
- Reconnaître les **anti-patterns** courants (Cognito pour le back office IAM, mélange User/Identity Pool sans raison, MFA SMS vs TOTP).

## Durée estimée

1 jour.

## Pré-requis

- M1-M6 (IAM, policies, AssumeRole).
- Bases OAuth 2.0 / OIDC : grand intérêt. Sinon une intro courte est faite en section 6.
- Connaissance basique d'une SPA (React / Vue / vanilla JS) pour les exercices.
- AWS CLI v2, permissions Cognito.

---

## 1. Pourquoi Cognito (intérêt — item N1)

### 1.1 — Le besoin

Toute application web ou mobile qui a des **utilisateurs finaux** doit gérer :

- **Signup** (inscription) : créer un compte avec email/password, vérification email.
- **Signin** (connexion) : valider les credentials, émettre une session.
- **Mot de passe oublié** : reset par email avec lien temporaire.
- **MFA** : second facteur (TOTP, SMS).
- **Sécurité** : hash bcrypt, rate limiting, protection contre brute force.
- **Federation** : "Se connecter avec Google / Facebook / Apple".
- **Permissions applicatives** : groupes d'utilisateurs (admin, premium, free, …).

**Coder tout cela soi-même** prend des semaines, est dangereux (sécurité), et n'apporte aucune différenciation métier.

Trois options pour ne pas le faire :

| Solution                          | Avantages                                         | Inconvénients                |
| --------------------------------- | ------------------------------------------------- | ---------------------------- |
| **Cognito** (AWS)                 | Intégré AWS, pay-per-MAU, gratuit jusqu'à 50k MAU | Customisation parfois rigide |
| **Auth0** / Okta / Clerk          | UX très polie, customisation poussée              | Coût plus élevé à l'échelle  |
| **Open source** (Keycloak, Hydra) | Contrôle total                                    | À opérer soi-même            |

**Cognito** est le choix par défaut sur AWS si on n'a pas de raison contraire.

### 1.2 — Cognito vs IAM — la distinction CAPITALE

C'est **l'erreur la plus fréquente** des débutants : confondre Cognito et IAM.

| Aspect           | **IAM**                                     | **Cognito**                          |
| ---------------- | ------------------------------------------- | ------------------------------------ |
| Pour qui ?       | **Opérateurs** AWS (admins, devs, services) | **Utilisateurs finaux** de votre app |
| Combien ?        | Quelques dizaines à centaines maximum       | Des dizaines de milliers à millions  |
| Tarif            | Gratuit                                     | Pay-per-MAU                          |
| Authentification | Console, CLI, SDK                           | Web, mobile, OAuth, OIDC, SAML       |
| Cas d'usage      | Gérer AWS                                   | Login app SaaS, mobile, web          |
| Audit            | CloudTrail                                  | Cognito events + CloudWatch          |

> **IAM = "qui peut faire quoi dans AWS"**.
> **Cognito = "qui peut se connecter à ton app"**.

Ne **jamais** créer un IAM user par utilisateur final. C'est garanti d'exploser : limite de 5 000 users par compte, gestion humaine, surface IAM exposée.

### 1.3 — L'analogie de l'entreprise

Reprendre l'analogie de M1 :

- **IAM** = badges des **employés** de l'entreprise (devs, sysadmins, support).
- **Cognito** = comptes des **clients** de l'application que l'entreprise vend.

Si une entreprise de e-commerce a 50 employés et 500 000 clients, elle a :

- 50 IAM users (employés) ou des accès SSO via Identity Center.
- 500 000 Cognito users (clients).

Deux systèmes distincts. Deux outils distincts.

### 1.4 — L'intérêt précis (item N1)

Cognito **délègue le système d'auth** :

- **Gain de temps** : pas de code à écrire pour signup/signin/reset/MFA.
- **Sécurité** : hash, rotation de tokens, détection de bot — par défaut, par AWS.
- **Scalabilité** : géré par AWS, dimensionne sans intervention.
- **Intégration AWS native** : un user Cognito peut obtenir des credentials AWS temporaires via Identity Pool, pour accéder directement à S3, DynamoDB, etc., depuis le frontend.
- **Federation prête à l'emploi** : Google, Facebook, Apple, SAML, OIDC en quelques clics.
- **Multi-tenant clean** via les groupes Cognito.

---

## 2. Architecture — User Pool + Identity Pool

Cognito se compose de **deux services distincts**, souvent combinés.

### 2.1 — Vue d'ensemble

``` graph
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  User Pool             Identity Pool                    │
│  (annuaire + auth)     (federation → credentials AWS)   │
│                                                         │
│  ┌──────────────┐      ┌────────────────────────┐       │
│  │ Users        │      │ Mappages :             │       │
│  │ Groups       │      │ User → IAM Role        │       │
│  │ Attributes   │      │                        │       │
│  │ Password     │      │ Sources d'identité :   │       │
│  │ MFA          │      │ - User Pool            │       │
│  │ Triggers     │      │ - Google               │       │
│  └──────────────┘      │ - Facebook             │       │
│                        │ - SAML / OIDC tiers    │       │
│         │              │ - Guests (unauth)      │       │
│         │              └────────────────────────┘       │
│         │                       │                       │
│         │                       │                       │
│         ▼                       ▼                       │
│    JWT tokens             Credentials AWS               │
│    (id, access, refresh) (AK ASIA + SK + SessionToken)  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 — Cas d'usage typiques

| Cas                                                                          | User Pool | Identity Pool   |
| ---------------------------------------------------------------------------- | --------- | --------------- |
| Site SaaS : login → accès aux APIs de votre backend.                         | **Oui**   | Non             |
| Mobile app : login + upload direct vers S3 depuis le mobile.                 | **Oui**   | **Oui**         |
| Site qui permet aux utilisateurs anonymes d'accéder à un service AWS limité. | Non       | **Oui** (guest) |
| Application qui ne fait que de l'auth (pas d'AWS direct côté client).        | **Oui**   | Non             |
| Federation pure : "Login avec Google" → backend custom (pas AWS).            | **Oui**   | Non             |
| Federation + accès AWS direct depuis le client.                              | **Oui**   | **Oui**         |

**Règle simple** : **User Pool** dans ~95 % des cas. **Identity Pool** seulement si on a un besoin spécifique de credentials AWS côté client.

---

## 3. User Pool en détail

### 3.1 — Définition

Un **User Pool** est un **annuaire d'utilisateurs** géré par Cognito. C'est essentiellement une **base de données d'utilisateurs** + un **service d'authentification**.

Ce qu'il gère :

- **Identités** : un user a un username, des attributs (email, phone, custom), un mot de passe (hashé).
- **Auth flows** : signup, signin (multiple méthodes), MFA, reset.
- **Tokens** : émission de JWT (id, access, refresh) après auth réussie.
- **OAuth 2.0 / OIDC** : Cognito agit comme un **IdP standard**.
- **Federation IdP externes** : Google, Facebook, Apple, SAML, OIDC.
- **Triggers Lambda** : personnaliser n'importe quelle étape du flow (pré-signup, post-confirmation, custom message, …).

### 3.2 — Configuration — les choix clés

À la création d'un User Pool, plusieurs choix sont **structurants** (difficiles à changer après) :

| Choix                             | Options                                                          | Implication                                      |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| **Sign-in attribute**             | Username / Email / Phone                                         | Détermine comment les users se connectent.       |
| **Attributs requis**              | Email, name, phone, custom attributes…                           | Tout user devra les fournir au signup.           |
| **Password policy**               | Longueur min, chiffres/spéciaux/majuscules                       | Standard : 8+ chars, 1 chiffre, 1 spécial.       |
| **MFA**                           | Off / Optional / Required                                        | Required = inflexible, Optional est typique.     |
| **MFA methods**                   | SMS, TOTP, Email                                                 | TOTP est le plus sûr ; SMS est vulnérable.       |
| **Self-service account recovery** | Email, phone, both                                               | Comment l'utilisateur récupère son mot de passe. |
| **App client**                    | Public (SPA, mobile) vs Confidential (backend)                   | Détermine les flows OAuth utilisables.           |
| **Domaine hosted UI**             | Sous-domaine `*.auth.region.amazoncognito.com` ou domaine custom | Pour la hosted UI standard.                      |

### 3.3 — App Client — la subtilité

Un **App Client** est l'**application** qui se connecte au User Pool. Une User Pool peut avoir **plusieurs App Clients** (web, mobile, API tierce, …).

Deux types :

- **Public** (pas de secret) : pour SPA et mobile (le secret ne peut pas être protégé côté client).
- **Confidential** (avec secret) : pour backend / serveur (peut stocker un secret).

L'App Client définit :

- Quels **flows OAuth** sont activés (Authorization Code, Implicit, Client Credentials).
- Quels **scopes** sont demandés (`openid`, `email`, `profile`, …).
- Quelles **callback URLs** sont autorisées (`https://myapp.com/callback`).
- Quels **identity providers** sont disponibles (Cognito User Pool, Google, …).

### 3.4 — Hosted UI

Cognito fournit une **interface de login prête à l'emploi**, customisable visuellement :

``` bash
https://my-pool.auth.eu-west-1.amazoncognito.com/login
  ?client_id=ABCDEF123456
  &response_type=code
  &scope=openid+email+profile
  &redirect_uri=https://myapp.com/callback
```

L'utilisateur voit la page Cognito (avec le logo / CSS qu'on a customisé), se logue, et est redirigé vers `redirect_uri` avec un code d'autorisation.

**Bénéfice** : aucun code de login à écrire. Limite : la customisation est limitée (CSS, pas le HTML).

Alternative : utiliser le **SDK Amplify** ou **boto3** pour faire un login en pure code avec votre propre UI.

### 3.5 — Federation externe

Dans un User Pool, on peut configurer des **IdP externes** :

- **Google** : OAuth Google → User Pool crée un user fédéré.
- **Facebook** : pareil.
- **Apple** : pareil.
- **SAML** (Okta, AD FS, OneLogin, Auth0) : entreprise.
- **OIDC** générique : n'importe quel IdP OIDC.

L'utilisateur clique "Login avec Google" → Cognito le redirige vers Google → Google authentifie → renvoie à Cognito → Cognito crée/retrouve un user local → émet ses propres JWT vers votre app.

C'est **Cognito qui devient l'IdP de votre app**, peu importe la source initiale. Simplifie énormément le code côté app.

### 3.6 — Triggers Lambda

Pour des **customisations**, on peut attacher des **Lambda triggers** à des moments précis :

| Trigger                 | Quand                              | Cas d'usage                                             |
| ----------------------- | ---------------------------------- | ------------------------------------------------------- |
| `Pre Sign-up`           | Avant la création du user          | Validation custom (whitelist domain email).             |
| `Post Confirmation`     | Après confirmation (email vérifié) | Créer une entrée DB, envoyer un welcome.                |
| `Pre Authentication`    | Avant signin                       | Bloquer un user spécifique, géo-restrictions.           |
| `Post Authentication`   | Après signin réussi                | Logger, déclencher un workflow.                         |
| `Custom Message`        | Avant envoi d'email/SMS            | Customiser le contenu.                                  |
| `Pre Token Generation`  | Avant émission du JWT              | Ajouter des claims custom (par exemple un rôle métier). |
| `Define Auth Challenge` | Custom auth flow                   | Implémenter passwordless, magic links.                  |

Ces triggers sont **niveau 3** dans le glossaire, à connaître par leur nom au N2.

---

## 4. Identity Pool en détail

### 4.1 — Définition

Un **Identity Pool** (aussi appelé Cognito Federated Identities) n'a **rien à voir** avec un User Pool fonctionnellement. Son rôle :

> Prendre un **token d'identification** (de Cognito User Pool, Google, Facebook, SAML, …) et l'échanger contre des **credentials AWS temporaires** (AK ASIA + SK + SessionToken), via `AssumeRoleWithWebIdentity` côté STS.

C'est, en pratique, un **broker entre OAuth/OIDC et IAM**.

### 4.2 — Pourquoi en avoir besoin

Cas typique : une application mobile veut **uploader directement** des fichiers vers S3 depuis le téléphone, sans passer par un backend intermédiaire.

Sans Identity Pool : le mobile doit appeler le backend, le backend doit signer une URL S3, le mobile upload. Latence + charge backend.

Avec Identity Pool : le mobile login → reçoit credentials AWS temporaires → upload S3 direct.

### 4.3 — Authenticated vs Unauthenticated

Un Identity Pool peut donner des credentials à :

- **Authenticated identities** : users authentifiés via un IdP (User Pool, Google, …). Reçoivent un rôle IAM avec des permissions plus larges.
- **Unauthenticated (guest) identities** : visiteurs anonymes. Reçoivent un rôle IAM avec des permissions minimales.

Cas d'usage des guests : un site qui permet aux visiteurs anonymes de lire publiquement du contenu S3 mais pas d'écrire. Plus rare en pratique.

### 4.4 — Configuration

``` tree
Identity Pool : "my-app-identity-pool"
├── Authentication providers :
│   ├── Cognito User Pool : my-user-pool / app-client-id
│   ├── Google : client-id
│   └── Facebook : app-id
├── Authenticated role : arn:aws:iam::ACCOUNT:role/CognitoAuthRole
└── Unauthenticated role : arn:aws:iam::ACCOUNT:role/CognitoUnauthRole (optionnel)
```

Le **Authenticated role** a une trust policy spéciale :

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "cognito-identity.amazonaws.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "cognito-identity.amazonaws.com:aud": "eu-west-1:abc-identity-pool-id"
    },
    "ForAnyValue:StringLike": {
      "cognito-identity.amazonaws.com:amr": "authenticated"
    }
  }
}
```

Lecture : "Cognito peut assumer ce rôle au nom d'un user authentifié de cet Identity Pool."

### 4.5 — Le flux complet (User Pool + Identity Pool)

``` graph
┌──────────────┐
│ App (SPA)    │
└──────┬───────┘
       │
       │ 1. Login (hosted UI Cognito User Pool)
       ▼
┌────────────────────────────┐
│ Cognito User Pool          │
│ Authentifie → JWT id_token │
└──────┬─────────────────────┘
       │
       │ 2. Échanger id_token contre credentials AWS
       ▼
┌────────────────────────────┐
│ Cognito Identity Pool      │
│ GetCredentialsForIdentity  │
│ → assume Authenticated     │
│   role via STS             │
└──────┬─────────────────────┘
       │
       │ 3. AK ASIA + SK + SessionToken
       ▼
┌──────────────┐
│ App (SPA)    │
│ Upload direct vers S3 avec ces credentials
└──────────────┘
```

### 4.6 — Mappage role par groupe / claim

On peut configurer l'Identity Pool pour **donner des rôles différents** selon le groupe Cognito ou un claim custom du JWT.

Exemple : les users du groupe `admin` reçoivent un rôle avec accès full S3, ceux du groupe `free` un rôle limité.

Permet du **multi-tier** dans la même app sans coder cela côté serveur.

---

## 5. Quand utiliser quoi

### 5.1 — Cas 1 — Site SaaS web classique

App : login → backend API → DynamoDB.

``` graph
Frontend (SPA)  →  Cognito User Pool  (login)
                ↓
                JWT
                ↓
            Backend API  ──► DynamoDB
```

**Configuration** : User Pool **uniquement**. Pas d'Identity Pool. Le frontend reçoit un JWT, le backend valide le JWT (via JWKS Cognito).

### 5.2 — Cas 2 — Mobile avec upload direct vers S3

App mobile : photos uploadées par les users vers S3.

``` graph
Mobile  →  Cognito User Pool  (login)
        ↓ id_token
        Cognito Identity Pool
        ↓ AWS credentials
        S3 (upload direct)
```

**Configuration** : User Pool + Identity Pool.

### 5.3 — Cas 3 — Pure federation, pas d'AWS direct

App qui veut juste "Login avec Google", puis appeler son propre backend.

``` graph
Frontend  →  Cognito User Pool  (federation Google)
          ↓ JWT
          Backend
```

**Configuration** : User Pool **uniquement** avec Google configuré comme IdP.

### 5.4 — Cas 4 — Visiteurs anonymes avec accès S3 limité

App qui permet de lire publiquement un bucket sans login.

**Configuration** : Identity Pool **avec Unauthenticated role** uniquement.

Mais en pratique : autant utiliser un bucket public + CloudFront, plus simple.

---

## 6. Le flux OAuth 2.0 / OIDC dans Cognito — rappel

Cognito User Pool est un **provider OIDC standard**. Pour ceux qui ne connaissent pas OAuth :

### 6.1 — Le flow Authorization Code (le standard)

``` md
1. User → App : "Je veux me connecter"
2. App → User : redirect vers Cognito
   https://my-pool.auth.eu-west-1.amazoncognito.com/oauth2/authorize
     ?response_type=code
     &client_id=ABC123
     &redirect_uri=https://myapp.com/callback
     &scope=openid+email+profile
3. User → Cognito : se logue
4. Cognito → User : redirect vers callback avec un code
   https://myapp.com/callback?code=abc.123.def
5. App → Cognito : POST /oauth2/token avec le code
   { grant_type: "authorization_code", code: "abc.123.def", redirect_uri: "..." }
6. Cognito → App : 3 tokens
   { id_token: "eyJ...", access_token: "eyJ...", refresh_token: "eyJ..." }
```

L'App utilise :

- **id_token** : qui est l'utilisateur (claims : email, name, groups, …). Pas pour appeler des API.
- **access_token** : pour appeler des API protégées (Cognito User Info, votre backend).
- **refresh_token** : pour renouveler les autres tokens sans re-login (durée typiquement 30 jours).

### 6.2 — Pourquoi pas le flow Implicit ?

Le flow Implicit (response_type=token) renvoie directement les tokens dans l'URL. **Déconseillé depuis 2019** (RFC OAuth 2.1) car les tokens sont exposés dans l'historique navigateur, les logs proxy, etc.

Toujours préférer **Authorization Code + PKCE** pour les SPA.

### 6.3 — PKCE — la protection des SPA

Une SPA ne peut pas stocker de secret (le code JS est public). Le **PKCE** (Proof Key for Code Exchange) ajoute une protection : la SPA génère un **secret aléatoire** par requête, et le serveur Cognito vérifie qu'il est cohérent entre `/authorize` et `/token`.

Activé automatiquement par les SDK Cognito modernes.

---

## 7. JWT et JWKS

### 7.1 — Structure d'un JWT

Trois parties séparées par des points :

``` txt
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature
[header].[payload].[signature]
```

- **Header** : `{ "alg": "RS256", "kid": "abc123" }` — l'algorithme et l'ID de la clé.
- **Payload** : les **claims** (qui, quand, scopes, custom).
- **Signature** : signature RS256 du header+payload par Cognito.

### 7.2 — Claims importants d'un id_token Cognito

```json
{
  "sub": "abc-123-def", // ID unique du user
  "email": "alice@example.com",
  "email_verified": true,
  "cognito:username": "alice",
  "cognito:groups": ["admin", "premium"],
  "iss": "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_ABCDEF",
  "aud": "ABC123-app-client-id",
  "exp": 1726524000,
  "iat": 1726520400
}
```

### 7.3 — Valider un JWT côté backend

Le backend reçoit un JWT du frontend, doit :

1. **Décoder** le header pour récupérer le `kid` (Key ID).
2. **Récupérer la clé publique** de Cognito depuis JWKS : `https://cognito-idp.eu-west-1.amazonaws.com/USER-POOL-ID/.well-known/jwks.json`.
3. **Vérifier la signature** avec RS256.
4. **Vérifier** `exp` (pas expiré), `iss` (bon issuer), `aud` (bon client_id).
5. Extraire le `sub` et autres claims pour identifier l'utilisateur.

```python
# Exemple Python avec PyJWT et requests
import jwt, requests
from jwt import PyJWKClient

USER_POOL_ID = "eu-west-1_ABCDEF"
REGION = "eu-west-1"
JWKS_URL = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"

jwks_client = PyJWKClient(JWKS_URL)

def verify_token(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token).key
    claims = jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience="ABC123-app-client-id",
        issuer=f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}",
    )
    return claims
```

### 7.4 — Validation côté API Gateway

API Gateway HTTP API supporte nativement la validation JWT Cognito :

```yaml
# OpenAPI 3.0
security:
  - CognitoAuthorizer: []

components:
  securitySchemes:
    CognitoAuthorizer:
      type: openIdConnect
      openIdConnectUrl: https://cognito-idp.eu-west-1.amazonaws.com/USER-POOL-ID/.well-known/openid-configuration
```

API Gateway fait toute la validation automatiquement. Pratique.

---

## 8. Configurer un User Pool — pas à pas

L'objectif : avoir un User Pool fonctionnel en moins de 15 minutes.

### 8.1 — Création

```bash
USER_POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name my-app-users \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false,
      "TemporaryPasswordValidityDays": 7
    }
  }' \
  --auto-verified-attributes email \
  --username-attributes email \
  --schema \
    "Name=email,AttributeDataType=String,Required=true,Mutable=true" \
    "Name=name,AttributeDataType=String,Required=false,Mutable=true" \
  --mfa-configuration OPTIONAL \
  --query 'UserPool.Id' --output text)

echo "User Pool : $USER_POOL_ID"
```

### 8.2 — Domaine hosted UI

```bash
aws cognito-idp create-user-pool-domain \
  --user-pool-id $USER_POOL_ID \
  --domain my-app-auth-2026

# Maintenant accessible sur :
# https://my-app-auth-2026.auth.eu-west-1.amazoncognito.com
```

### 8.3 — App Client

```bash
APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-name my-app-spa \
  --no-generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-flows-user-pool-client \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls "https://myapp.com/callback" "http://localhost:3000/callback" \
  --logout-urls "https://myapp.com/logout" "http://localhost:3000" \
  --supported-identity-providers COGNITO \
  --query 'UserPoolClient.ClientId' --output text)
```

### 8.4 — Créer un user de test

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS    # Ne pas envoyer l'email

# Définir un mot de passe permanent
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --password MyStrongPassword1! \
  --permanent
```

### 8.5 — Tester en ligne de commande

```bash
# Auth via ADMIN_NO_SRP_AUTH (simple, pour test)
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $APP_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=alice@example.com,PASSWORD=MyStrongPassword1!

# Sortie :
# {
#   "AuthenticationResult": {
#     "AccessToken": "eyJ...",
#     "IdToken": "eyJ...",
#     "RefreshToken": "eyJ...",
#     "TokenType": "Bearer",
#     "ExpiresIn": 3600
#   }
# }
```

Le User Pool est fonctionnel. On peut maintenant l'intégrer dans une SPA.

---

## 9. Auth web simple — exemple complet (item pratique)

Mise en place d'une page web simple qui utilise Cognito hosted UI.

### 9.1 — Frontend minimal (HTML + JS vanilla)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
  </head>
  <body>
    <h1>My App</h1>
    <button id="login">Login</button>
    <pre id="output"></pre>

    <script>
      const COGNITO_DOMAIN =
        "my-app-auth-2026.auth.eu-west-1.amazoncognito.com";
      const CLIENT_ID = "ABC123APPCLIENTID";
      const REDIRECT_URI = "http://localhost:3000/callback";

      document.getElementById("login").onclick = () => {
        const url =
          `https://${COGNITO_DOMAIN}/oauth2/authorize` +
          `?response_type=code` +
          `&client_id=${CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&scope=openid+email+profile`;
        window.location.href = url;
      };

      // À l'URL /callback, on récupère le code
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code: code,
            redirect_uri: REDIRECT_URI,
          }),
        })
          .then((r) => r.json())
          .then((tokens) => {
            document.getElementById("output").textContent = JSON.stringify(
              tokens,
              null,
              2,
            );
            // Décoder le JWT id_token pour extraire l'email
            const idToken = tokens.id_token;
            const payload = JSON.parse(atob(idToken.split(".")[1]));
            console.log("Logged in as:", payload.email);
          });
      }
    </script>
  </body>
</html>
```

### 9.2 — Backend Python (validation du JWT)

```python
from fastapi import FastAPI, Header, HTTPException
import jwt, requests
from jwt import PyJWKClient

app = FastAPI()

USER_POOL_ID = "eu-west-1_ABCDEF"
CLIENT_ID = "ABC123APPCLIENTID"
REGION = "eu-west-1"
JWKS_URL = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
jwks_client = PyJWKClient(JWKS_URL)


def verify(token: str) -> dict:
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, signing_key, algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}",
        )
        return claims
    except jwt.PyJWTError as exc:
        raise HTTPException(401, f"Invalid token: {exc}")


@app.get("/me")
def me(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    claims = verify(token)
    return {"email": claims["email"], "groups": claims.get("cognito:groups", [])}
```

### 9.3 — Variante avec Amplify

Plutôt que d'écrire manuellement le flow, **AWS Amplify** ou la librairie `amazon-cognito-identity-js` simplifient drastiquement. Mais le flow manuel ci-dessus est utile à comprendre.

---

## 10. Sécurité — MFA, password policy, advanced security

### 10.1 — MFA

Configurer **Optional** par défaut, encourager les users à l'activer eux-mêmes pour les comptes sensibles (admin, premium).

**TOTP** (Google Authenticator, Authy) est **préférable** à SMS :

- SMS vulnérable au SIM-swapping.
- SMS coûteux (~0,05 $/SMS, selon le pays).
- TOTP est gratuit et plus sûr.

Pour des comptes sensibles ou en B2B : configurer MFA **Required**.

### 10.2 — Password Policy

Standard moderne :

- 12 caractères minimum (8 est trop court selon NIST 2024).
- Pas de complexité forcée (lettres/chiffres/spéciaux) — NIST recommande de **ne pas** forcer.
- Check contre les passwords compromis (HaveIBeenPwned) via un trigger Lambda.

### 10.3 — Advanced Security Features

Cognito propose une option "Advanced security" payante (~0,05 $/MAU) qui :

- Détecte les **comptes compromis** (credentials trouvés dans des leaks).
- Détecte les **logins suspects** (IP nouvelles, géographie inhabituelle).
- Force le **MFA adaptatif** (demander MFA seulement quand suspect).

Recommandé pour applications **sérieuses** avec utilisateurs sensibles.

### 10.4 — Anti-patterns sécurité

- **Allow self-signup** sans validation email → spam de comptes.
- **Pas de rate limiting** sur le login → brute force possible.
- **MFA SMS only** → vulnérable.
- **Stockage du refresh_token** dans le localStorage (préférable : httponly cookie).
- **CORS trop permissif** sur les endpoints OAuth.

---

## 11. Coûts

Cognito est **gratuit jusqu'à 50 000 MAU** (Monthly Active Users) pour les User Pools, hors features avancées.

| Volume               | Coût mensuel approximatif     |
| -------------------- | ----------------------------- |
| ≤ 50 000 MAU         | **0 $** (free tier permanent) |
| 50 001 - 100 000 MAU | 275 $                         |
| 100 001 - 1M MAU     | 0,0055 $/MAU au-delà          |
| > 1M MAU             | 0,0046 $/MAU (dégressif)      |

Options payantes :

- **Advanced security** : 0,05 $/MAU.
- **SMS** : ~0,05 $/SMS (variable selon le pays).
- **MFA SMS** : compte dans le SMS pricing.

Identity Pool : **gratuit**.

Comparé à Auth0 (~25 000 $ pour 100k MAU à plein tarif), Cognito est généralement **10× moins cher**.

---

## 12. Anti-patterns récurrents

| Anti-pattern                                                                  | Conséquence                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Créer un **IAM user** par utilisateur final.                                  | Limite 5 000, audit cauchemar, surface IAM dangereuse. |
| Mélanger User Pool et Identity Pool sans en avoir besoin.                     | Confusion architecturale.                              |
| MFA SMS only.                                                                 | Vulnérable au SIM-swap.                                |
| **Allow self-signup** sans validation email.                                  | Spam de comptes / fraude.                              |
| Mettre des **secrets dans un client SPA** (App Client confidential pour SPA). | Le secret est public dans le JS.                       |
| **Stocker des PII** custom sans chiffrement.                                  | RGPD à risque.                                         |
| Ne pas valider les **JWT côté backend** (faire confiance au frontend).        | Compromission triviale.                                |
| Confondre **access_token et id_token**.                                       | Bugs subtils, fuite de PII dans les logs.              |
| **Refresh token trop long** (1 an) sans rotation.                             | Tokens compromis = accès durable.                      |

---

## 13. Exercices pratiques

### Exercice 1 — User Pool minimal (≈ 30 min)

**Objectif.** Avoir un User Pool fonctionnel.

**Étapes :** suivre les sections 8.1 à 8.5 — créer pool, domaine, app client, user de test, tester l'auth via CLI.

**Livrable.** Captures de chaque étape + les tokens reçus (sans les coller en clair, juste leur format).

### Exercice 2 — Hosted UI fonctionnel (≈ 30 min)

**Objectif.** Connexion via le navigateur.

**Étapes :**

1. Servir localement (avec un simple `python3 -m http.server`) la page HTML de la section 9.1.
2. Configurer la callback URL `http://localhost:8000/callback` dans l'App Client.
3. Cliquer "Login", se logger avec le user de test, observer le redirect, observer les tokens dans la page de callback.

**Livrable.** Capture de la page après login affichant les tokens (decoded payload, pas en clair).

### Exercice 3 — Validation JWT backend (≈ 30 min)

**Objectif.** Sécuriser une API.

**Étapes :**

1. Lancer le backend FastAPI de la section 9.2 (avec `pip install fastapi uvicorn pyjwt cryptography requests`).
2. Tester sans token : 401.
3. Tester avec un faux token : 401.
4. Tester avec le vrai id_token : 200 + email + groupes.

**Livrable.** Captures des 3 tests.

### Exercice 4 — Federation Google (≈ 45 min, optionnel)

**Objectif.** Ajouter "Login with Google".

**Étapes :**

1. Créer un projet sur Google Cloud Console, activer OAuth, créer des credentials OAuth Web Application.
2. Dans Cognito User Pool : Sign-in experience → Add identity provider → Google. Coller client ID + secret.
3. Modifier l'App Client : autoriser Google comme IdP.
4. Tester via Hosted UI : un bouton "Login with Google" doit apparaître.

**Livrable.** Capture du nouveau bouton + login Google réussi.

### Exercice 5 — Identity Pool pour S3 direct (≈ 60 min)

**Objectif.** Le pattern avancé : credentials AWS depuis Cognito.

**Étapes :**

1. Créer un Identity Pool lié au User Pool de l'exercice 1.
2. Créer un rôle IAM `cognito-authenticated-role` avec trust policy adéquate + une policy autorisant `s3:PutObject` sur un préfixe spécifique :

   ```
   arn:aws:s3:::user-uploads/${cognito-identity.amazonaws.com:sub}/*
   ```

3. Côté frontend, après login, échanger l'id_token contre des credentials AWS via `cognito-identity:GetCredentialsForIdentity`.
4. Utiliser ces credentials pour uploader un fichier dans S3 depuis le navigateur (via SDK aws-sdk-js).

**Livrable.** Schéma + capture du fichier uploadé avec le préfixe `<user-sub>/`.

### Mini-défi — Conception d'auth pour une plateforme (≈ 30 min, papier)

**Cas.** Plateforme SaaS B2B avec :

- 2 000 entreprises clientes.
- 50 000 utilisateurs finaux au total.
- Login email/password, mais 30 % des entreprises veulent du SSO SAML.
- Certains utilisateurs uploadent des fichiers (vers S3).
- MFA obligatoire pour les admins.

**Concevoir** :

1. Combien de User Pools (1 ou N) ?
2. Identity Pool nécessaire ?
3. Strategy multi-tenant (un pool par tenant, ou un pool global avec un attribut `tenant_id`) ?
4. SAML integration : comment ?
5. MFA policy ?

**Livrable.** Schéma + justification de chaque décision.

---

## 14. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Cognito** et son rôle (gérer les utilisateurs finaux d'une app).
- [ ] Distinguer **Cognito** et **IAM** sur 4 axes (pour qui, combien, tarif, cas d'usage).
- [ ] Énoncer **l'intérêt** de Cognito : déléguer auth, sécurité, scalabilité, federation, intégration AWS.
- [ ] Distinguer **User Pool** et **Identity Pool** (fonctions, quand utiliser).
- [ ] Décrire le **flow OAuth 2.0 Authorization Code** en 6 étapes.
- [ ] Distinguer **id_token**, **access_token**, **refresh_token**.
- [ ] Décrire **comment valider un JWT** côté backend (JWKS, signature, exp, iss, aud).
- [ ] **Configurer un User Pool** depuis zéro de mémoire (pool, domaine, app client, user).
- [ ] **Configurer un Identity Pool** lié à un User Pool pour donner des credentials AWS.
- [ ] Distinguer **MFA TOTP** et **MFA SMS** (avantages, faiblesses).
- [ ] Citer **3 anti-patterns** Cognito.

### Items du glossaire visés

**N1 atteint** :

- _intérêt de Cognito pour gérer l'authentification utilisateur_ — section 1.

**N2 atteint** :

- _configurer un user pool et un identity pool dans Cognito_ — sections 3, 4, 8.

---

## 15. Ressources complémentaires

### Documentation AWS

- [Cognito User Pools Developer Guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [Cognito Identity Pools Developer Guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html)
- [Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html)
- [JWT verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)

### SDKs et outils

- [AWS Amplify](https://docs.amplify.aws/) — abstractions niveau supérieur pour SPA.
- [amazon-cognito-identity-js](https://github.com/amazon-archives/amazon-cognito-identity-js) — SDK JavaScript natif Cognito.
- [PyJWT](https://pyjwt.readthedocs.io/) — pour validation backend Python.

### Pour aller plus loin

- **M8 (Identity Center)** — gestion des opérateurs / employés, à ne pas confondre avec Cognito.
- **Niveau 3** : triggers Lambda Cognito avancés, custom auth flows passwordless, federation SAML enterprise.
- **AWS Lambda authorizers** pour API Gateway — alternative ou complément à Cognito.
