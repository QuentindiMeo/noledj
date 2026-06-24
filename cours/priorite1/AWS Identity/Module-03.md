# M3 — Access Keys et alternatives

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir une **access key** AWS, ses deux composants (Access Key ID + Secret Access Key), et son **rôle dans l'authentification** auprès de l'API AWS (signature SigV4).
- Expliquer **pourquoi** une access key statique est une **identité longue durée** problématique en termes de sécurité, et lister les **5 risques classiques** (leak GitHub, leak laptop, leak CI, manque de rotation, manque de traçabilité).
- Connaître et choisir parmi les **alternatives modernes** : **Instance Profile** (EC2), **Execution Role** (Lambda), **Task Role** (ECS), **IRSA** (EKS), **OIDC federation** (CI/CD), **Identity Center / SSO** (humains), **IAM Roles Anywhere** (on-premise).
- Décrire le fonctionnement de l'**IMDS** (Instance Metadata Service) et la différence entre IMDSv1 et IMDSv2 (sécurité contre SSRF).
- **Migrer concrètement** une access key d'un cas réel vers un rôle IAM, en suivant une méthode en 6 étapes.
- Appliquer les **règles d'hygiène** des access keys qu'on ne peut pas supprimer (rotation, scope minimal, MFA, alertes Access Analyzer).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (entités IAM, ARN), M2 (anatomie d'une policy).
- AWS CLI v2 configurée.
- Une instance EC2 et une Lambda à disposition pour les exercices (ou possibilité d'en créer).
- Connaissance basique d'un fichier `~/.aws/credentials` ou des variables d'environnement `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

---

## 1. L'access key — utilité (item N1)

### 1.1 — Définition

Une **access key** AWS est un couple de **credentials longue durée** permettant à un acteur (typiquement un user IAM) de **s'authentifier** auprès de l'API AWS sans passer par la console web.

Une access key se compose de :

- **Access Key ID** (AK) : un identifiant public, en clair, qui dit "qui je suis" (par exemple `AKIAIOSFODNN7EXAMPLE`).
- **Secret Access Key** (SK) : un secret privé, jamais transmis dans les requêtes, qui sert à **signer** chaque appel (par exemple `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`).

Format reconnaissable :

| Champ             | Préfixe / format                                                | Taille typique |
| ----------------- | --------------------------------------------------------------- | -------------- |
| Access Key ID     | `AKIA...` (user IAM) ou `ASIA...` (credentials STS temporaires) | 20 caractères  |
| Secret Access Key | Base64, aléatoire                                               | 40 caractères  |

À retenir : **`AKIA` = longue durée**, **`ASIA` = temporaire**. Reconnaître la différence en un coup d'œil aide à diagnostiquer des leaks ou des configs.

### 1.2 — Utilité (item N1 explicite)

Une access key permet à un acteur d'**appeler l'API AWS** depuis :

- Un **terminal local** (AWS CLI, SDK).
- Un **script** d'automation.
- Une **application** déployée n'importe où (laptop, serveur on-premise, CI/CD, autre cloud).

C'est le **canal d'authentification programmatique** historique d'AWS.

Sans access key (et sans alternative moderne), un script Python qui veut faire `boto3.client('s3').list_buckets()` ne saurait pas **qui** il est ni **prouver** son identité à AWS.

### 1.3 — Le mécanisme — signature SigV4

À chaque appel API, le SDK ou la CLI :

1. Récupère l'access key (`AKIA...`).
2. Calcule une **signature HMAC-SHA256** de la requête en utilisant la **secret access key** comme clé.
3. Envoie la requête avec :
   - L'access key ID **en clair** (dans le header `Authorization`).
   - La **signature** (dans le même header).
   - **Pas** le secret — il ne sort jamais du client.

AWS, à la réception :

1. Lit l'access key ID.
2. Récupère le secret correspondant (qu'il connaît côté serveur).
3. Recalcule la signature de la requête.
4. Compare. Si match → authentifié, on évalue les policies.

``` graph
Client                                              AWS
  │                                                  │
  │  GET /my-bucket/file.txt                         │
  │  Authorization: AWS4-HMAC-SHA256                 │
  │   Credential=AKIA.../20260517/eu-west-1/s3/...   │
  │   Signature=abcdef12345...                       │
  │ ───────────────────────────────────────────────► │
  │                                                  │
  │                                                  │ 1. Lookup AKIA...
  │                                                  │ 2. Recalcule signature
  │                                                  │ 3. Compare
  │                                                  │ 4. Évalue les policies
  │                                                  │
  │ ◄─────────────────────────────────────────────── │
  │  200 OK + contenu                                │
```

**Conséquences pratiques :**

- Le secret n'est **jamais transmis** sur le réseau (sauf à la création, où AWS le montre une seule fois).
- Si quelqu'un intercepte une requête, il **ne peut pas la rejouer** (la signature inclut un timestamp et un payload hash).
- Si quelqu'un **vole le secret** (leak GitHub, leak laptop), il peut signer **n'importe quelle** requête → compromission totale.

### 1.4 — Où une access key est stockée

Sur la machine cliente, le SDK / la CLI cherche les credentials dans l'ordre suivant :

1. **Variables d'environnement** : `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (optionnel).
2. **Fichier de credentials partagé** : `~/.aws/credentials` (sections `[default]`, `[profile-x]`, …).
3. **Fichier de config** : `~/.aws/config`.
4. **Credentials provider chain** (rôles IMDS, SSO, container, etc., voir section 6).

``` txt
# ~/.aws/credentials
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[prod]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
```

### 1.5 — Créer une access key

```bash
# Pour le user "alice"
aws iam create-access-key --user-name alice
```

Sortie :

```json
{
  "AccessKey": {
    "UserName": "alice",
    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "Status": "Active",
    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "CreateDate": "2026-05-17T10:00:00Z"
  }
}
```

**Le secret est affiché une seule fois.** Si on le perd, on doit recréer une clé (la précédente reste valide, donc à désactiver).

**Limite** : un user IAM peut avoir au maximum **2 access keys actives** simultanément (pour permettre la rotation).

---

## 2. Le problème — pourquoi les access keys sont dangereuses

### 2.1 — Identité longue durée

Une access key reste valide **indéfiniment** tant qu'elle n'est pas désactivée ou supprimée. Pas d'expiration automatique. Conséquence : un secret leakié il y a 6 mois fonctionne **encore aujourd'hui** sauf intervention.

### 2.2 — Les 5 risques classiques

| Risque                                        | Fréquence en prod | Impact                                                                   |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| **Leak GitHub public**                        | Très courant      | Compromission immédiate du compte AWS.                                   |
| **Leak via dotfiles laptop volé**             | Courant           | Idem.                                                                    |
| **Leak via CI/CD logs ou env vars exportées** | Courant           | Idem.                                                                    |
| **Pas de rotation**                           | Quasi-universel   | Une clé vieille de 3 ans, leakée 2 ans plus tôt, encore active.          |
| **Pas de traçabilité fine**                   | Très courant      | Une seule clé partagée = on ne sait pas qui a fait quoi dans CloudTrail. |

**Statistique** : selon les rapports annuels (HashiCorp, Verizon DBIR, GitGuardian), **les secrets AWS leakés sont parmi les plus exfiltrés** sur GitHub, avec un délai moyen entre commit public et exploitation par un bot de **moins de 4 minutes**.

### 2.3 — L'analogie de la clé physique

Comparer une access key à une **clé physique** :

- C'est durable (elle ne s'autodétruit pas).
- Si on la copie ou la perd, le voleur a un accès égal au propriétaire.
- Personne ne saura **qui** a ouvert la porte avec la clé (pas de signature personnelle sur l'usage).
- Changer la serrure (rotation) demande un effort. Beaucoup de gens ne le font jamais.

Maintenant comparer à un **badge magnétique nominatif et révocable** :

- Chaque badge est nominatif → on sait qui a ouvert quelle porte (traçabilité).
- Un badge perdu peut être révoqué en 1 clic.
- Les badges peuvent expirer automatiquement.

Les **rôles IAM** + credentials temporaires sont l'équivalent du badge magnétique.

### 2.4 — Le scénario du leak GitHub

``` md
1. Alice push son code sur GitHub. Sans s'en rendre compte,
   son ~/.aws/credentials est dans le repo.
2. 4 minutes plus tard, un bot scrape les nouveaux commits, trouve la clé.
3. 30 secondes plus tard, le bot lance des EC2 GPU pour miner de la crypto
   dans toutes les régions activables.
4. Le matin, Alice reçoit une facture AWS de 8 000 $ pour la nuit.
```

Ce scénario est **réel** et arrive régulièrement. AWS a même mis en place un service **AWS Health** qui détecte les leaks sur GitHub via un partenariat, et envoie un email d'urgence + désactive temporairement la clé. Mais ce filet de sécurité est **insuffisant** : il ne couvre pas tous les cas (gists, repos privés rendus publics, archives téléchargées).

---

## 3. Les alternatives modernes (item N2)

C'est **l'item N2** central : connaître les alternatives à privilégier.

### 3.1 — Le principe général

Au lieu d'une **clé longue durée**, on utilise un **rôle IAM** que l'acteur **assume** au moment d'agir, et qui lui remet des **credentials temporaires** (typiquement 1 heure). Ces credentials :

- **Expirent automatiquement** → un leak a un impact limité dans le temps.
- Sont **liés à une identité contextuelle** (cette EC2, cette Lambda, ce job CI…) → meilleure traçabilité.
- Ne sont **pas stockés** sur disque → pas de risque de leak dans dotfiles.

### 3.2 — Instance Profile (EC2)

C'est **la** méthode pour qu'une EC2 puisse appeler l'API AWS.

**Comment ça marche :**

1. On crée un **rôle IAM** avec la trust policy `ec2.amazonaws.com`.
2. On y attache les policies nécessaires.
3. On crée un **Instance Profile** (un wrapper du rôle, pour EC2) — souvent automatique côté console.
4. On attache l'Instance Profile à l'EC2 au lancement (ou plus tard).
5. Le SDK / la CLI sur l'instance **récupère automatiquement** des credentials temporaires via le metadata service (IMDS).

```bash
# Créer le rôle avec trust policy EC2
aws iam create-role --role-name ec2-app-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attacher une policy
aws iam attach-role-policy --role-name ec2-app-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Créer l'instance profile et y associer le rôle
aws iam create-instance-profile --instance-profile-name ec2-app-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name ec2-app-profile \
  --role-name ec2-app-role

# Attacher à une EC2 existante
aws ec2 associate-iam-instance-profile \
  --instance-id i-0abc... \
  --iam-instance-profile Name=ec2-app-profile
```

À ce stade, sur l'EC2 :

```bash
aws s3 ls   # Fonctionne sans aucun fichier credentials, ni variable
```

Le SDK détecte qu'il tourne sur EC2, interroge IMDS, récupère des credentials temporaires, fait l'appel. Magie complète, transparente, sécurisée.

### 3.3 — Lambda Execution Role

Pour Lambda, **chaque fonction** a un **execution role** obligatoire. Pas d'option, pas de cas où Lambda utilise des access keys statiques.

```bash
# Créer une Lambda avec son rôle
aws lambda create-function \
  --function-name my-fn \
  --runtime python3.12 \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler app.handler \
  --zip-file fileb://function.zip
```

Le rôle a une trust policy `lambda.amazonaws.com`. À l'invocation, AWS injecte automatiquement les credentials temporaires dans l'environnement de la Lambda (variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` — temporaires).

### 3.4 — ECS Task Role

Pour des conteneurs ECS (sur EC2 ou Fargate), on attache un **task role** au niveau de la **task definition**. Chaque conteneur peut récupérer ses credentials via l'**endpoint metadata ECS** (un service local équivalent à IMDS pour les conteneurs).

```json
{
  "family": "my-task",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ecs-task-role",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecs-execution-role",
  "containerDefinitions": [...]
}
```

Deux rôles différents :

- **Task Role** : ce que le **conteneur** peut faire à l'API AWS (S3, DynamoDB…).
- **Execution Role** : ce que **ECS** peut faire pour démarrer la task (pull l'image ECR, écrire dans CloudWatch).

### 3.5 — EKS IRSA (IAM Roles for Service Accounts)

Pour Kubernetes sur EKS, chaque **service account** peut être lié à un rôle IAM via OIDC.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/app-sa-role
```

Les pods utilisant ce service account obtiennent des credentials temporaires via le sidecar AWS, sans access key statique. C'est la méthode **canonique** pour Kubernetes sur AWS.

### 3.6 — OIDC Federation (GitHub Actions, GitLab CI, etc.)

Pour les **pipelines CI/CD**, plutôt que stocker une access key dans les secrets GitHub, on configure une **federation OIDC** :

1. AWS fait confiance au token OIDC de GitHub (`token.actions.githubusercontent.com`).
2. Le pipeline CI demande un token OIDC à GitHub.
3. Le pipeline appelle `sts:AssumeRoleWithWebIdentity` avec ce token.
4. AWS valide, renvoie des credentials temporaires.

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write # Permet à GitHub d'émettre un token OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/gh-actions-deploy
          aws-region: eu-west-1
      - run: aws s3 sync ./dist s3://my-bucket
```

**Bénéfices :**

- Aucune access key stockée dans GitHub Secrets.
- Le rôle peut être restreint au repo / à la branche via une condition sur le token OIDC.
- Crédentials temporaires (1h).

C'est **le standard 2026** pour le CI/CD avec AWS.

### 3.7 — Identity Center / SSO (humains)

Pour les **humains** (admins, devs, ops), AWS recommande de remplacer les IAM users par **AWS Identity Center** (anciennement AWS SSO) :

- L'utilisateur se logue avec ses credentials d'entreprise (Active Directory, Google Workspace, Okta, …).
- Identity Center le fait atterrir sur un **Permission Set** (équivalent d'un rôle avec une policy attachée).
- Credentials temporaires injectés dans la session console ou CLI (via `aws sso login`).

Sujet du **module M8**.

### 3.8 — IAM Roles Anywhere (on-premise)

Pour des charges de travail **hors AWS** (serveurs on-premise, autres clouds), AWS offre **IAM Roles Anywhere** : un service qui permet à un acteur de **prouver son identité** via un certificat X.509 et de **récupérer des credentials temporaires** AWS.

```bash
# Sur le serveur on-premise, avec une PKI configurée
aws_signing_helper credential-process \
  --certificate /etc/aws/cert.pem \
  --private-key /etc/aws/key.pem \
  --trust-anchor-arn arn:aws:rolesanywhere:eu-west-1:ACCOUNT:trust-anchor/abc \
  --profile-arn arn:aws:rolesanywhere:eu-west-1:ACCOUNT:profile/def \
  --role-arn arn:aws:iam::ACCOUNT:role/onprem-app
```

Plus de mise en place initiale, mais permet d'éliminer les access keys même pour les workloads hybrides.

### 3.9 — Récapitulatif

| Contexte                                | Alternative recommandée                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| EC2 qui appelle l'API AWS               | **Instance Profile**                                                      |
| Lambda                                  | **Execution Role** (obligatoire)                                          |
| Conteneur ECS                           | **Task Role**                                                             |
| Pod EKS                                 | **IRSA**                                                                  |
| GitHub Actions / GitLab CI / Bitbucket  | **OIDC Federation**                                                       |
| Humain (admin, dev, ops)                | **Identity Center / SSO**                                                 |
| Serveur on-prem ou autre cloud          | **IAM Roles Anywhere**                                                    |
| Application AWS interne sans plateforme | Idéalement : rôle assumé via un broker. Sinon Secrets Manager + rotation. |

---

## 4. IMDS — Instance Metadata Service

### 4.1 — Définition

L'**IMDS** (Instance Metadata Service) est un endpoint **local** sur chaque EC2, accessible à l'IP magique `169.254.169.254`, qui expose :

- Des **métadonnées** sur l'instance (région, AZ, instance ID, type, IP…).
- Les **credentials temporaires** du rôle attaché (si Instance Profile).
- Les **user-data** initiaux.

```bash
# Depuis l'EC2
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
# → ec2-app-role

curl http://169.254.169.254/latest/meta-data/iam/security-credentials/ec2-app-role
# → JSON avec AccessKeyId (ASIA...), SecretAccessKey, Token, Expiration
```

Le SDK fait cela **automatiquement** quand il ne trouve pas de credentials ailleurs.

### 4.2 — IMDSv1 vs IMDSv2

| Version    | Authentification                                     | Risque                                                                                                                                                    |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMDSv1** | Aucune. Simple GET sur l'URL.                        | **Vulnérable à SSRF** : une appli vulnérable côté EC2 peut être trompée en proxifiant des requêtes IMDS, et l'attaquant récupère les credentials du rôle. |
| **IMDSv2** | Session token obligatoire (PUT puis GET avec token). | Robuste contre SSRF (l'attaquant ne peut pas faire le PUT initial).                                                                                       |

**Recommandation 2026** : **IMDSv2 obligatoire** sur toutes les EC2 nouvelles. La console AWS l'active par défaut. Pour les anciennes :

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-0abc... \
  --http-tokens required \
  --http-endpoint enabled
```

Activer IMDSv2 obligatoire évite la plupart des compromissions via SSRF. C'est un **quick win sécurité** énorme.

### 4.3 — Désactiver IMDS

Pour des cas extrêmes (workload qui n'appelle jamais l'API AWS), on peut **désactiver complètement IMDS** :

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-0abc... \
  --http-endpoint disabled
```

Le rôle attaché devient inutilisable depuis l'EC2. Très rare en pratique.

---

## 5. Migrer une access key vers un rôle — méthode

### 5.1 — Les 6 étapes

C'est l'exercice pratique du module : prendre un cas où une access key est utilisée, et la **remplacer** par un rôle.

```
1. IDENTIFIER : qui utilise l'access key ? Quel workload ?
2. CARTOGRAPHIER : quelles actions AWS sont faites ? Lister via CloudTrail.
3. CRÉER LE RÔLE : avec une trust policy adaptée au workload.
4. ATTACHER LES POLICIES : minimales, basées sur le cartographe.
5. CONFIGURER : attacher le rôle au workload (Instance Profile, Lambda role, etc.).
6. SUPPRIMER : désactiver l'access key, vérifier que tout fonctionne, supprimer.
```

### 5.2 — Cas concret — migration d'une access key EC2

**Avant** : une EC2 a une access key dans `~/.aws/credentials`. Le script `backup.sh` y stocke des fichiers dans S3.

**Étape 1 — Identifier**

```bash
# Vérifier l'access key utilisée
ssh ec2-user@instance
cat ~/.aws/credentials
# → AKIAIOSFODNN7EXAMPLE
```

**Étape 2 — Cartographier**

```bash
# Sur CloudTrail (la console ou CLI), filtrer par AccessKeyId
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE \
  --max-results 100 \
  --query 'Events[].{Time:EventTime, Action:EventName, Resource:Resources[0].ResourceName}'

# → Voir les actions : s3:PutObject sur my-backup-bucket, s3:ListBucket, …
```

**Étape 3 — Créer le rôle**

```bash
aws iam create-role --role-name ec2-backup-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

**Étape 4 — Attacher les policies minimales**

```bash
cat > backup-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::my-backup-bucket",
      "arn:aws:s3:::my-backup-bucket/*"
    ]
  }]
}
EOF

aws iam create-policy --policy-name ec2-backup-policy \
  --policy-document file://backup-policy.json

aws iam attach-role-policy --role-name ec2-backup-role \
  --policy-arn arn:aws:iam::ACCOUNT:policy/ec2-backup-policy
```

**Étape 5 — Configurer**

```bash
aws iam create-instance-profile --instance-profile-name ec2-backup-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name ec2-backup-profile \
  --role-name ec2-backup-role

aws ec2 associate-iam-instance-profile \
  --instance-id i-0abc... \
  --iam-instance-profile Name=ec2-backup-profile

# Sur l'EC2, supprimer les credentials
ssh ec2-user@instance
mv ~/.aws/credentials ~/.aws/credentials.OLD-2026-05-17
# Tester
./backup.sh
# → Doit fonctionner avec le rôle (le SDK détecte IMDS automatiquement)
```

**Étape 6 — Supprimer**

```bash
# Désactiver d'abord (réversible)
aws iam update-access-key \
  --user-name old-backup-user \
  --access-key-id AKIAIOSFODNN7EXAMPLE \
  --status Inactive

# Attendre quelques jours sans incident, puis :
aws iam delete-access-key \
  --user-name old-backup-user \
  --access-key-id AKIAIOSFODNN7EXAMPLE

# Si plus aucun usage, supprimer le user lui-même
aws iam delete-user --user-name old-backup-user
```

### 5.3 — Conseils

- **Désactiver avant supprimer** : permet de récupérer si quelque chose casse.
- **Attendre 7-14 jours** entre désactivation et suppression.
- **Vérifier CloudTrail** entre temps pour s'assurer qu'aucune autre app ne dépendait de cette clé.
- **Préférer un rôle par workload** plutôt qu'un rôle "fourre-tout".

---

## 6. Si on doit garder une access key — hygiène

Il y a des cas légitimes où on garde une access key :

- Application **hors AWS** sans possibilité d'OIDC ni IAM Roles Anywhere.
- Système hérité difficile à migrer.
- Cas où une rotation manuelle est plus simple qu'une refonte.

Dans ces cas, appliquer une **hygiène stricte** :

### 6.1 — Rotation

- **Tous les 90 jours** maximum. Beaucoup d'organismes (PCI, HIPAA) l'exigent.
- Méthode : créer une nouvelle clé, basculer les workloads, **désactiver** l'ancienne, **observer**, **supprimer**.
- Outils : Secrets Manager peut **rotater automatiquement** une clé via une Lambda custom.

### 6.2 — Scope minimal (moindre privilège — vu en M6)

- Une clé par workload, jamais partagée entre projets.
- Policy attachée minimale, basée sur les actions réelles observées dans CloudTrail.

### 6.3 — MFA pour les humains

- Les access keys d'**humains** : exiger MFA (via une `Condition` sur les policies sensibles).
- Les access keys de **service** : pas de MFA possible, donc compenser par d'autres restrictions (IP, VPC, plage horaire).

### 6.4 — Alertes et audit

- **IAM Access Analyzer** : détecte automatiquement les credentials inutilisés depuis X jours, les permissions trop larges.
- **AWS Config Rule** : `iam-user-no-policies-check`, `access-keys-rotated`, `iam-password-policy`.
- **CloudTrail** : monitorer les `CreateAccessKey`, `DeleteAccessKey`, `UpdateAccessKey` et alerter.
- **GitHub secret scanning** : actif par défaut sur les repos publics, à activer sur les privés.

### 6.5 — Ne **jamais**…

- Pusher une access key dans Git.
- Mettre une access key dans une AMI.
- Mettre une access key dans une variable d'environnement systemd (visible dans `/proc`).
- Réutiliser une access key entre prod et dev.
- Garder une access key vieille de plus de 1 an "au cas où".

---

## 7. Exercices pratiques

### Exercice 1 — Lister et auditer ses access keys (≈ 20 min)

**Objectif.** Diagnostic d'hygiène.

**Étapes :**

1. Lister tous les users IAM du compte : `aws iam list-users`.
2. Pour chaque user, lister ses access keys : `aws iam list-access-keys --user-name $USER`.
3. Pour chaque clé active, lire sa date de création et la date de dernière utilisation :

    ``` bash
    aws iam get-access-key-last-used --access-key-id AKIA...
    ```

4. Identifier les clés :
   - **Plus utilisées depuis > 90 jours** → candidates à suppression.
   - **Datant de plus d'1 an** → candidates à rotation urgente.
   - **Jamais utilisées** → suppression immédiate.

**Livrable.** Tableau récapitulatif des access keys du compte avec leur état.

### Exercice 2 — Migrer un script vers un rôle EC2 (≈ 45 min)

**Objectif.** L'exercice central, vu en section 5.2.

**Setup.** Une EC2 avec un fichier `~/.aws/credentials` contenant une access key qui sert à faire `aws s3 ls`.

**Étapes :** suivre la section 5.2 — créer un rôle, l'attacher, supprimer les credentials de l'EC2, vérifier que `aws s3 ls` fonctionne via IMDS.

**Livrable.** Captures avant/après + le contenu du rôle créé (trust policy + policy attachée).

### Exercice 3 — Vérifier IMDSv2 (≈ 15 min)

**Objectif.** Mettre en place la bonne hygiène IMDS.

**Étapes :**

1. Lister toutes les EC2 et leur configuration IMDS :

   ```bash
   aws ec2 describe-instances \
     --query 'Reservations[].Instances[].{Id:InstanceId, HttpTokens:MetadataOptions.HttpTokens}'
   ```

2. Pour les instances avec `HttpTokens=optional` (IMDSv1 toléré), basculer en `required` :

   ```bash
   aws ec2 modify-instance-metadata-options \
     --instance-id i-... \
     --http-tokens required
   ```

3. Tester sur l'EC2 :

   ```bash
   # IMDSv1 doit échouer
   curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
   # → 401 Unauthorized

   # IMDSv2 doit fonctionner
   TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
     -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
   curl -H "X-aws-ec2-metadata-token: $TOKEN" \
     http://169.254.169.254/latest/meta-data/iam/security-credentials/
   ```

**Livrable.** Confirmation que toutes les EC2 sont en IMDSv2 required.

### Exercice 4 — Configurer OIDC GitHub Actions (≈ 30 min)

**Objectif.** Remplacer un secret GitHub par OIDC.

**Étapes :**

1. Sur AWS, créer un **OIDC provider** pour `token.actions.githubusercontent.com` (une seule fois par compte).
2. Créer un rôle avec trust policy autorisant le token OIDC pour un repo précis :

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

3. Attacher au rôle une policy minimale (par exemple `s3:Sync` sur un bucket précis).
4. Mettre à jour le workflow GitHub Actions pour utiliser `aws-actions/configure-aws-credentials@v4` avec `role-to-assume`.
5. Supprimer les secrets `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY` du repo.

**Livrable.** Workflow YAML mis à jour + capture du run réussi avec OIDC.

### Mini-défi — Audit d'un script (≈ 20 min)

**Cas.** Vous trouvez ce script Python sur un laptop :

```python
import boto3, os
boto3.setup_default_session(
    aws_access_key_id="AKIAIOSFODNN7EXAMPLE",
    aws_secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region_name="eu-west-1",
)
s3 = boto3.client("s3")
s3.put_object(Bucket="logs-prod", Key="report.json", Body=open("report.json", "rb"))
```

Le script tourne :

- Sur un laptop de dev.
- Sur une EC2 de prod (la même clé).
- Dans GitHub Actions pour la CI (oui, la même clé).

**Livrable.** Mini-rapport :

1. Citer **5 problèmes** distincts dans cette configuration.
2. Proposer un plan de migration en **4 étapes** pour les trois usages.
3. Estimer l'effort (heures-personne) et l'impact si la clé est compromise.

---

## 8. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir une **access key** (AK + SK) et son **utilité**.
- [ ] Expliquer la **signature SigV4** en 3 lignes (le secret ne sort jamais, signature HMAC, AWS recalcule).
- [ ] Distinguer **AKIA** et **ASIA** au préfixe.
- [ ] Lister les **5 risques** classiques des access keys.
- [ ] Citer les **7 alternatives modernes** : Instance Profile, Lambda Execution Role, ECS Task Role, IRSA, OIDC Federation, Identity Center, IAM Roles Anywhere.
- [ ] Pour chacun de ces 7 contextes, donner l'alternative à privilégier.
- [ ] Définir l'**IMDS** et distinguer IMDSv1 et IMDSv2 (vulnérabilité SSRF).
- [ ] Décrire la **méthode de migration** d'une access key vers un rôle en **6 étapes**.
- [ ] Énoncer les **règles d'hygiène** si on doit garder une access key (rotation 90j, scope minimal, MFA, audit).
- [ ] Configurer un **rôle EC2 avec instance profile** depuis zéro de mémoire (étapes CLI).

### Items du glossaire visés

**N1 atteint** :

- _utilité d'une access_key_ — section 1.

**N2 atteint** :

- _alternatives à privilégier par rapport à une access_key_ — section 3.

---

## 9. Ressources complémentaires

### Documentation AWS

- [Access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- [Best practices for managing AWS access keys](https://docs.aws.amazon.com/general/latest/gr/aws-access-keys-best-practices.html)
- [IAM Roles for EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)
- [IRSA for EKS](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [OIDC federation with GitHub Actions](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [IAM Roles Anywhere](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html)

### Outils

- [IAM Access Analyzer](https://aws.amazon.com/iam/features/analyze-access/) — détecter les credentials inutilisés.
- [git-secrets](https://github.com/awslabs/git-secrets) — empêcher de commiter des secrets AWS.
- [GitGuardian](https://www.gitguardian.com/) — scanner de secrets dans Git.
- [Trufflehog](https://github.com/trufflesecurity/trufflehog) — scanner orientés secrets dans repos et clouds.

### Pour aller plus loin

- **M4 (Policies avancées)** — identity-based vs resource-based, Permission Boundaries.
- **M5 (Assume role et STS)** — la mécanique complète des credentials temporaires.
- **M8 (Identity Center)** — SSO pour les humains.
- **Niveau 3** : MFA conditionnel, federation SAML, IAM Access Analyzer en détail.
