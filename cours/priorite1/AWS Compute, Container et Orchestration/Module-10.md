# M10 — ECR (Elastic Container Registry)

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **Amazon ECR** (Elastic Container Registry) : registry **privé** et **public** managé par AWS pour stocker, distribuer et sécuriser des **images de conteneurs** Docker / OCI.
- Distinguer **ECR Private** (par compte, par région) et **ECR Public** (registry public via `public.ecr.aws/...`).
- Identifier **quand ECR est indispensable** (item N2 explicite) : Lambda container image, ECS / Fargate avec image privée, EKS, AppRunner image-based, Batch, et **quand il ne l'est pas** (Docker Hub suffit pour des images publiques de POC).
- **Créer un repository**, **s'authentifier** au registry, **push** une image construite localement, **pull** l'image, et la **déployer** dans le service consommateur.
- Définir une **stratégie de tagging** robuste (tags immutables, semver, no `latest` en prod) et une **lifecycle policy** pour nettoyer automatiquement les anciennes images.
- Activer le **scanning de vulnérabilités** (Amazon Inspector enhanced ou basic scan), comprendre les **niveaux de criticité** et le workflow de remédiation.
- Mettre en place une **policy de réplication cross-region** et un **pull-through cache** depuis un registry upstream (Docker Hub, ECR Public, GitHub Container Registry).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M4 (Lambda image-based) et M7 (AppRunner) — premiers contextes où on a déjà touché ECR.
- AWS CLI v2 configurée.
- **Docker** installé localement.
- Permissions IAM : `ecr:*` (création, push, pull), `iam:PassRole`.
- Une image Docker simple à pousser (un Dockerfile minimal hello-world).

---

## 1. Pourquoi un module dédié à ECR

### 1.1 — Ce que résout un container registry

Un container registry est un service qui **stocke** des images Docker et les **distribue** aux runtimes consommateurs (ECS, EKS, Lambda, etc.). Sans registry, chaque host devrait :

1. Construire l'image localement à partir du Dockerfile.
2. Disposer de la même version exacte des dependencies.
3. Recompiler à chaque démarrage.

Le registry **dispense** les hosts de cette charge en exposant des images **buildées une fois**, identifiées par un nom + un tag (ex : `my-app:1.4.2`). N'importe quel host avec les bonnes permissions peut alors `docker pull my-app:1.4.2` en quelques secondes.

### 1.2 — Trois options de registry

| Option                       | Propriétaire               | Usage typique                                                   |
| ---------------------------- | -------------------------- | --------------------------------------------------------------- |
| **Docker Hub**               | Docker Inc.                | Images publiques OSS (`nginx`, `postgres`, …). Limites de pull. |
| **Public registries autres** | GitHub, GitLab, Quay, etc. | Open source, miroir d'images.                                   |
| **ECR (Private + Public)**   | AWS                        | Images privées et publiques, intégration AWS native.            |

ECR est **le choix par défaut** dès qu'on déploie des containers **dans** AWS — pour des raisons d'**autorisation** (IAM natif), de **performance** (réseau intra-région), de **sécurité** (scanning, chiffrement) et d'**intégration** (ECS, EKS, Lambda, AppRunner pull depuis ECR sans config compliquée).

### 1.3 — L'analogie de l'entrepôt à colis

Penser à ECR comme un **entrepôt logistique** :

- L'**image Docker** = un colis prêt à livrer (avec son contenu identifié).
- Le **registry** = l'entrepôt qui stocke tous les colis et les indexe.
- Le **tag** = l'étiquette qui identifie une version précise d'un colis.
- Le **manifest** = la fiche de contenu du colis (couches, OS, architecture).
- **Push** = déposer un colis à l'entrepôt.
- **Pull** = aller chercher un colis pour le distribuer.

ECR garantit la **disponibilité** (durabilité 99,99 %+), la **rapidité** de pull en intra-AWS, et le **contrôle d'accès** par IAM (qui peut push, qui peut pull).

### 1.4 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                 | Conséquence                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pull une image depuis Docker Hub en production AWS.          | Limite de débit Docker Hub (100 pulls / 6 h pour les IP anonymes en 2026). Bloque les déploiements aux moments critiques. |
| Image taguée uniquement `latest` en production.              | Impossible de rollback précisément, déploiements non reproductibles.                                                      |
| Pas de **lifecycle policy** sur le repository.               | Coût qui grimpe doucement, 1000+ images obsolètes après quelques mois.                                                    |
| Pas de **scanning** activé.                                  | Vulnérabilités connues déployées sans alerte.                                                                             |
| Images de **6 GB** non optimisées (Dockerfile single-stage). | Pulls lents, cold start Lambda allongé, facture de stockage.                                                              |
| Push depuis le poste dev individuel sans CI.                 | Traçabilité zéro. Toujours pousser depuis CI/CD.                                                                          |

---

## 2. ECR — définition

### 2.1 — Ce qu'est ECR

> **Amazon Elastic Container Registry (ECR)** est un service managé qui **stocke** et **distribue** des **images de conteneurs** (Docker, OCI) sécurisées par IAM, durables (multi-AZ), et intégrées nativement aux services compute AWS.

Quatre propriétés à retenir :

1. **Privé par défaut** : un repository ECR Private est **invisible** sans authentification IAM (ECR Public expose une URL publique `public.ecr.aws`).
2. **Régional** : un repository vit dans **une région** précise. Pour distribuer multi-région, utiliser la **réplication** ECR (section 8.4).
3. **Compatible OCI** : on push n'importe quelle image OCI/Docker — Alpine, Ubuntu, Distroless, custom.
4. **IAM-based** : pas de credentials Docker à gérer — `aws ecr get-login-password` suffit.

### 2.2 — Vocabulaire

| Terme                | Définition                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Registry**         | L'ensemble des repositories d'un compte AWS dans une région (un par compte par région).      |
| **Repository**       | Un emplacement nommé qui contient les versions d'une image (ex : `my-app`, `data-pipeline`). |
| **Image**            | Un container immuable identifié par un digest SHA256 et 1+ tags.                             |
| **Tag**              | Étiquette humaine attachée à une image (`v1.4.2`, `dev`, `latest`).                          |
| **Manifest**         | Le fichier JSON qui décrit les couches d'une image et leurs métadonnées.                     |
| **Digest**           | Hash SHA256 immuable de l'image (ex : `sha256:abc123…`).                                     |
| **Lifecycle policy** | Règles automatiques pour supprimer / archiver d'anciennes images.                            |
| **Image scanning**   | Analyse automatique des vulnérabilités (CVE).                                                |

### 2.3 — ECR Private — URL et nommage

```txt
<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/<REPO>:<TAG>
```

Exemple :

```txt
123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-app:1.4.2
```

Chaque composant est précis :

- **`123456789012`** : AWS account ID propriétaire.
- **`dkr.ecr.eu-west-1.amazonaws.com`** : endpoint du registry dans la région.
- **`my-app`** : nom du repository.
- **`1.4.2`** : tag de la version.

### 2.4 — ECR Public — URL

```txt
public.ecr.aws/<ALIAS>/<REPO>:<TAG>
```

Exemple :

```txt
public.ecr.aws/myorg/my-public-app:1.0.0
```

ECR Public est utile pour **distribuer des images open-source** sans demander d'IAM aux pullers. AWS l'utilise pour ses propres images (`public.ecr.aws/lambda/python:3.12`).

### 2.5 — Pricing

| Composant                           | Tarif (eu-west-1)                              |
| ----------------------------------- | ---------------------------------------------- |
| Storage privé                       | 0,10 $/GB-mois.                                |
| Egress vers Internet                | 0,09 $/GB (au-delà du free tier).              |
| Egress intra-région                 | **Gratuit** (même région).                     |
| Egress cross-région                 | 0,02 $/GB.                                     |
| ECR Public                          | 50 GB gratuit/mois en egress puis 0,09 $/GB.   |
| Image scanning basic                | Gratuit.                                       |
| Image scanning Inspector (enhanced) | Coût Amazon Inspector (~0,09 $/image scannée). |

Pour un repository de 50 GB total, ~5 $/mois de storage. Le **coût caché** est le **egress** quand les pulls se font **inter-région** ou **vers Internet** (par exemple un build CI hors AWS).

---

## 3. Quand ECR est indispensable (item N2 explicite)

### 3.1 — Tableau de référence

| Service consommateur           | ECR Private indispensable ?                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Lambda image package**       | **OUI**. Lambda ne pull que depuis ECR Private (pas Docker Hub).                                               |
| **ECS Fargate** (image privée) | **OUI** pour des images propriétaires. Pour des images publiques (`nginx`), pas indispensable mais recommandé. |
| **ECS sur EC2**                | Idem ECS Fargate.                                                                                              |
| **EKS**                        | **OUI** pour images propriétaires ; aussi recommandé pour images publiques (pull-through cache).               |
| **AppRunner image-based**      | **OUI** pour images privées (Public ECR aussi supporté).                                                       |
| **AWS Batch container**        | Optionnel. Public registry possible mais recommandé d'utiliser ECR pour stabilité.                             |
| **CodeBuild**                  | Pas obligatoire. Mais pour des images custom de build, ECR est le bon choix.                                   |
| **EC2 + Docker manuel**        | Pas indispensable. Mais ECR évite les limites Docker Hub.                                                      |

### 3.2 — Pourquoi ECR est indispensable pour Lambda image

> Lambda **n'accepte une image que depuis un ECR Private du même compte AWS** (ou un compte cross-account avec permissions explicites).

Conséquence :

- On **ne peut pas** déployer une Lambda image directement depuis Docker Hub.
- On **ne peut pas** déployer une Lambda image depuis ECR Public.
- Le repository ECR doit être dans la **même région** que la Lambda.

C'est la limitation la plus stricte du catalogue.

### 3.3 — Pourquoi ECR est indispensable pour les images privées

Toute image qui contient :

- Du **code propriétaire** (binary maison, secrets compilés en dur — anti-pattern mais arrive).
- Des **clients SDK custom** internes.
- Des **certificats**, **clés**, **config sensibles** embarqués.

… ne peut pas être hostée sur Docker Hub gratuit (public) sans la divulguer. Docker Hub propose des plans privés, mais :

- Limites de bande passante (vs ECR intra-AWS gratuit).
- Pas d'intégration IAM (gestion de credentials Docker side-car).
- Latence variable depuis AWS.

ECR Private dans le même compte AWS résout tous ces points.

### 3.4 — Pourquoi ECR est recommandé même pour les images publiques

Trois bénéfices souvent ignorés :

1. **Limites de pull Docker Hub** : depuis 2020, Docker Hub limite à **100 pulls / 6 h** par IP anonyme, 200 pour les comptes free. Une équipe ECS qui scale fréquemment peut **saturer** la limite et bloquer les déploiements.
2. **Latence et bande passante** : pull `nginx:1.27` depuis Docker Hub peut prendre 10-30 s ; depuis ECR intra-région, 1-2 s.
3. **Audit et scanning** : on contrôle quelles versions on autorise.

Pour les images publiques massivement utilisées, **ECR pull-through cache** (section 8.5) est la solution : ECR cache transparente d'un registry upstream.

### 3.5 — Quand ECR n'est pas indispensable

- **POC personnel** : Docker Hub gratuit suffit pour tester.
- **Images publiques OSS** : tirer depuis ECR Public AWS ou Docker Hub avec mesure.
- **Pas de déploiement automatique** : si on déploie manuellement 1 fois par mois, les limites Docker Hub ne sont pas un sujet.
- **Pas d'AWS** : on ne déploie pas sur AWS — autre registry plus adapté.

---

## 4. Premiers pas — repository, auth, push, pull

### 4.1 — Créer un repository

```bash
aws ecr create-repository \
  --repository-name tp-m10-hello \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256
```

Trois choix structurants à la création :

| Option                     | Valeurs                          | Recommandation                                                                        |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| **`image-tag-mutability`** | `MUTABLE` (défaut) / `IMMUTABLE` | **IMMUTABLE** en prod : on ne peut pas re-push un même tag.                           |
| **`scanOnPush`**           | `true` / `false`                 | **`true`** — scanning de base gratuit.                                                |
| **`encryptionType`**       | `AES256` / `KMS`                 | `KMS` si vous utilisez déjà KMS pour la gouvernance ; sinon `AES256` (defaut managé). |

L'**immutabilité des tags** est cruciale : sans, quelqu'un peut re-push `v1.4.2` avec un contenu différent. Vous croyez déployer la version testée, vous déployez une version "patchée à chaud". À **IMMUTABLE**, ECR refuse le re-push d'un tag existant. Forcer un nouveau tag = traçabilité garantie.

### 4.2 — S'authentifier auprès d'ECR

ECR n'utilise **pas** de credentials Docker statiques. À la place, on récupère un **token éphémère** (valide 12 h) via la CLI AWS, et on l'injecte dans `docker login` :

```bash
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS \
  --password-stdin 123456789012.dkr.ecr.eu-west-1.amazonaws.com
```

À chaque session de push/pull, on refait cette commande. En CI/CD, on l'ajoute dans le step de build.

Permissions IAM nécessaires côté caller : `ecr:GetAuthorizationToken`, et pour les opérations push/pull : `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`.

Pour simplifier : policies AWS-managed `AmazonEC2ContainerRegistryFullAccess` (sur-permissif), `AmazonEC2ContainerRegistryPowerUser` (push + pull), `AmazonEC2ContainerRegistryReadOnly` (pull seul).

### 4.3 — Builder, tagger, pusher

```bash
# 1. Build l'image localement
docker build --platform linux/arm64 -t tp-m10-hello:1.0.0 .

# 2. Tagger avec l'URL ECR
docker tag tp-m10-hello:1.0.0 \
  123456789012.dkr.ecr.eu-west-1.amazonaws.com/tp-m10-hello:1.0.0

# 3. Push
docker push 123456789012.dkr.ecr.eu-west-1.amazonaws.com/tp-m10-hello:1.0.0
```

Sortie typique :

```log
The push refers to repository [123456789012.dkr.ecr.eu-west-1.amazonaws.com/tp-m10-hello]
abc123: Pushed
def456: Pushed
1.0.0: digest: sha256:7e83b... size: 1366
```

Le **digest** (`sha256:7e83b…`) est le **vrai** identifiant immuable de l'image. Pour des déploiements ultra-strict, on peut référencer par digest plutôt que par tag : `…/tp-m10-hello@sha256:7e83b…`.

### 4.4 — Vérifier le push

```bash
# Lister les images du repo
aws ecr describe-images --repository-name tp-m10-hello \
  --query 'imageDetails[].{Tags:imageTags,Pushed:imagePushedAt,Size:imageSizeInBytes,Digest:imageDigest}' \
  --output table

# Trouver une image par tag
aws ecr describe-images --repository-name tp-m10-hello \
  --image-ids imageTag=1.0.0 \
  --query 'imageDetails[0].{Digest:imageDigest,Size:imageSizeInBytes,Pushed:imagePushedAt}'
```

### 4.5 — Pull depuis un consommateur AWS

Côté **Lambda**, **ECS**, **AppRunner**, on référence l'image avec l'URL complète. AWS pull automatiquement, **sans** authentification manuelle, à condition que :

- Le **role d'exécution** du service ait `ecr:GetAuthorizationToken` + `ecr:BatchGetImage` + `ecr:GetDownloadUrlForLayer`.
- Pour Lambda spécifiquement, on attache la policy AWS-managed `AmazonElasticContainerRegistryPublicPowerUser` ou on configure une **resource-based policy** sur le repository (cross-account).

Côté **EC2** avec docker manuel :

```bash
# Authentification (sur l'EC2)
aws ecr get-login-password --region eu-west-1 | docker login ...

# Pull
docker pull 123456789012.dkr.ecr.eu-west-1.amazonaws.com/tp-m10-hello:1.0.0
```

---

## 5. Stratégie de tagging

### 5.1 — Pourquoi le tag `latest` est dangereux

Le tag `latest` **pointe vers la dernière image taguée `latest` poussée**. Conséquences :

- Deux développeurs poussent des `latest` différents → la production tire le dernier.
- Impossible de **rollback** précisément à une version donnée.
- Pas de **lien** entre l'image déployée et le commit Git.

À éviter en production. À limiter au développement.

### 5.2 — Stratégies de tagging classiques

**Stratégie 1 — Semantic versioning** :

```txt
my-app:1.4.2
my-app:1.4.3
my-app:1.5.0
```

Convient pour des releases manuelles et planifiées.

**Stratégie 2 — Commit SHA** :

```txt
my-app:abc1234def
my-app:bcd2345efa
```

Convient pour des CI/CD à fort throughput. Tag = sha court du commit Git. **Traçabilité parfaite**.

**Stratégie 3 — Hybride** :

```txt
my-app:1.4.2-abc1234
my-app:1.4.3-bcd2345
my-app:prod        ← alias mobile vers la version en prod
my-app:staging     ← alias mobile vers staging
```

L'image **immuable** porte un tag basé sur la version + sha. Les "aliases" sont des **tags mobiles** (mutable repository ou tag distinct dans un repo séparé).

### 5.3 — Bonne pratique : digest pinning en prod

Pour des déploiements ultra-déterministes :

```yaml
# task-definition ECS
image: 123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-app@sha256:7e83b...
```

Pinner par digest élimine toute ambiguïté. Recommandé pour la prod critique. En contrepartie, la mise à jour demande de retoucher le digest dans le déploiement (Terraform, CDK, etc.).

### 5.4 — Anti-patterns tagging

| Anti-pattern                                | Conséquence                                         |
| ------------------------------------------- | --------------------------------------------------- |
| `latest` en prod.                           | Pas de rollback fiable.                             |
| Re-pusher le même tag dans un repo MUTABLE. | Production change "à chaud" sans changement de tag. |
| Tags humains (`my-test`, `for-bob`).        | Pollution du repo, perte de traçabilité.            |
| Pas de tag de date / build / sha.           | Impossible de remonter à l'origine d'une image.     |
| **MUTABLE** activé pour des repos prod.     | Re-push possible — risque sécuritaire.              |

---

## 6. Lifecycle policies — nettoyage automatique

### 6.1 — Pourquoi

Sans lifecycle policy, ECR conserve **toutes** les images poussées. Sur un repo avec 10 builds/jour, on accumule 3650 images/an → coût croissant, lourd à débugger.

Une **lifecycle policy** déclare des règles de **suppression automatique** :

- Garder les 10 dernières.
- Supprimer les images > 90 jours qui ne sont taguées que `dev-*`.
- Garder toutes les `release-*`.

### 6.2 — Syntaxe de la policy

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Conserver les 20 dernières images de release",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["release-"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Supprimer les images dev plus vieilles que 14 jours",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "Supprimer les images untagged > 7 jours",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```bash
aws ecr put-lifecycle-policy --repository-name tp-m10-hello \
  --lifecycle-policy-text file://lifecycle.json
```

### 6.3 — Une policy "starter pack" raisonnable

Pour 90 % des repos applicatifs :

- Garder les **10 images `release-*` les plus récentes**.
- Supprimer les images **untagged** après **1 jour** (artefacts de builds avortés).
- Supprimer les images **`dev-*`** après **7 jours**.
- Supprimer les images **`pr-*`** après **30 jours**.

À toujours **simuler** avant d'activer (`aws ecr start-lifecycle-policy-preview` puis `get-lifecycle-policy-preview`).

### 6.4 — Anti-patterns lifecycle

| Anti-pattern                            | Conséquence                                                             |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Pas de policy du tout.                  | Coût qui grimpe.                                                        |
| Règle trop agressive sur `release-*`.   | Supprime des versions en prod, rollback impossible.                     |
| Ordre des `rulePriority` mal défini.    | Lifecycle évalue rule 1 puis 2 puis 3 — un mauvais ordre supprime trop. |
| Pas de **simulation** avant activation. | Suppression de prod-images au premier run.                              |

---

## 7. Scanning de vulnérabilités

### 7.1 — Deux niveaux

| Type                              | Couverture                                                                                   | Coût                            |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| **Basic scanning**                | CVEs OS (Alpine, Ubuntu, Amazon Linux) via Clair (open-source).                              | Gratuit, à activer.             |
| **Enhanced scanning (Inspector)** | CVE OS + **dépendances langage** (Python, Node, Java, Go, Ruby, .NET) + scoring CVSS / EPSS. | Payant (~0,09 $/image scannée). |

### 7.2 — Activer le scan basic

```bash
aws ecr put-image-scanning-configuration \
  --repository-name tp-m10-hello \
  --image-scanning-configuration scanOnPush=true
```

À chaque push, le scan déclenche automatiquement. Résultats disponibles :

```bash
aws ecr describe-image-scan-findings \
  --repository-name tp-m10-hello \
  --image-id imageTag=1.0.0 \
  --query 'imageScanFindings.findingSeverityCounts'
```

Sortie typique :

```json
{
  "CRITICAL": 1,
  "HIGH": 5,
  "MEDIUM": 12,
  "LOW": 30,
  "INFORMATIONAL": 8
}
```

### 7.3 — Activer Enhanced (Inspector)

```bash
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[{
    "scanFrequency":"CONTINUOUS_SCAN",
    "repositoryFilters":[{"filter":"*","filterType":"WILDCARD"}]
  }]'
```

Enhanced scan **continu** : si une nouvelle CVE est publiée pour une dépendance déjà présente dans une image taguée, on est alerté **sans repush**.

### 7.4 — Workflow de remédiation

1. **Bloquer le déploiement** d'images avec CRITICAL ou HIGH (via build pipeline qui vérifie le scan avant `update-function-code` / `update-service`).
2. **Notifier** via EventBridge → Lambda → Slack : event `ECR Image Scan` avec `findingSeverityCounts.HIGH > 0`.
3. **Patcher** : mettre à jour les versions de base / les dépendances vulnérables.
4. **Repusher** et vérifier le scan.

---

## 8. Réplication, pull-through cache et ECR Public

### 8.1 — Réplication cross-region / cross-account

Pour un déploiement **multi-région DR** ou un **partage cross-account** :

```bash
aws ecr put-replication-configuration \
  --replication-configuration '{
    "rules":[{
      "destinations":[
        {"region":"us-east-1","registryId":"123456789012"},
        {"region":"ap-northeast-1","registryId":"123456789012"}
      ],
      "repositoryFilters":[{"filter":"prod-","filterType":"PREFIX_MATCH"}]
    }]
  }'
```

Toute image poussée dans un repo dont le nom commence par `prod-` est automatiquement répliquée vers les destinations. La réplication est **asynchrone** (généralement < 1 min).

**Coût** : 0,02 $/GB de réplication cross-region + 0,10 $/GB de stockage dans la destination.

### 8.2 — Cross-account avec resource-based policy

Pour qu'un compte B puisse pull des images d'un repo dans le compte A :

```bash
aws ecr set-repository-policy \
  --repository-name shared-images \
  --policy-text '{
    "Version":"2012-10-17",
    "Statement":[{
      "Sid":"AllowPullFromAccountB",
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::222222222222:root"},
      "Action":["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer","ecr:BatchCheckLayerAvailability"]
    }]
  }'
```

Pattern courant dans une **architecture multi-comptes** : un compte "platform" centralise les images, les comptes "app" pullent.

### 8.3 — Pull-through cache — cache transparente d'un registry upstream

Configuration :

```bash
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub-cache \
  --upstream-registry-url registry-1.docker.io
```

Désormais, quand on pull :

```txt
123456789012.dkr.ecr.eu-west-1.amazonaws.com/dockerhub-cache/library/nginx:1.27
```

ECR récupère depuis Docker Hub, **cache localement**, et sert ensuite les pulls suivants depuis le cache. Avantages :

- **Contourner les rate limits** Docker Hub.
- **Latence réduite** (intra-AWS).
- **Stockage facturé** mais en général largement amorti.

Supports : Docker Hub, GitHub Container Registry, ECR Public, Quay.

### 8.4 — ECR Public

Pour distribuer une image publique :

```bash
# Créer le repo public (région obligatoirement us-east-1 pour ECR Public)
aws ecr-public create-repository --repository-name my-public-app

# Push
aws ecr-public get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin public.ecr.aws

docker tag my-app:1.0.0 public.ecr.aws/MY_ALIAS/my-public-app:1.0.0
docker push public.ecr.aws/MY_ALIAS/my-public-app:1.0.0
```

Quiconque peut pull `public.ecr.aws/MY_ALIAS/my-public-app:1.0.0` sans compte AWS.

---

## 9. Anti-patterns transverses

| Anti-pattern                                                        | Conséquence                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Push depuis le poste développeur sans CI.                           | Pas de traçabilité, builds non reproductibles.                                           |
| Image > 3 GB.                                                       | Pull lent, cold start Lambda explosé, coût stockage. Optimiser Dockerfile (multi-stage). |
| Pas de scanning activé.                                             | Vulnérabilités déployées en silence.                                                     |
| Pas de lifecycle policy.                                            | Storage qui grimpe sans limite.                                                          |
| Pull manuel depuis Docker Hub.                                      | Rate limit qui casse les déploiements aux pires moments.                                 |
| Repo `MUTABLE` en prod avec `latest`.                               | Re-push silencieux possible — pire des deux mondes.                                      |
| Pas de **réplication** sur app multi-région.                        | DR impossible si la région principale est indisponible.                                  |
| Permissions trop larges (`ecr:*` au lieu de PowerUser ou ReadOnly). | Risque d'effacement accidentel.                                                          |

---

## 10. Exercices pratiques

### Exercice 1 — Créer un repo et y pousser une image hello-world (≈ 30 min)

**Objectif.** Manipuler les opérations de base.

**Étapes :**

1. Écrire un Dockerfile minimaliste (Alpine + `CMD echo hello`).
2. Créer un repo `tp-m10-hello` avec scanOnPush=true et IMMUTABLE.
3. Builder local en arm64.
4. S'authentifier via `aws ecr get-login-password`.
5. Tagger et push.
6. Vérifier l'image dans la console ECR ; consulter les findings de scan.

**Livrable.** Dockerfile + commandes + capture du scan.

### Exercice 2 — Configurer une lifecycle policy "starter pack" (≈ 30 min)

**Objectif.** Manipuler les lifecycle policies.

**Étapes :**

1. Push 3 images avec tags : `release-1.0.0`, `dev-abc`, `dev-def`.
2. Définir une policy qui :
   - Garde les 5 dernières `release-*`.
   - Supprime les `dev-*` > 1 jour.
   - Supprime les untagged > 1 jour.
3. Lancer une simulation (preview) :

   ```bash
   aws ecr start-lifecycle-policy-preview --repository-name tp-m10-hello \
     --lifecycle-policy-text file://lifecycle.json
   aws ecr get-lifecycle-policy-preview --repository-name tp-m10-hello
   ```

4. Activer la policy.

**Livrable.** JSON policy + capture du preview.

### Exercice 3 — Tagging strategy avec digest pinning (≈ 30 min)

**Objectif.** Comprendre la traçabilité par digest.

**Étapes :**

1. Push une image taguée `1.0.0`.
2. Récupérer son **digest** via `describe-images`.
3. Tester un pull par **tag** puis par **digest**.
4. Push une nouvelle image taguée `1.0.0` → succès car MUTABLE (sinon on doit utiliser un repo MUTABLE pour cet exercice).
5. Vérifier que **le digest a changé** mais que la tag pointe vers la nouvelle.
6. Conclusion : sur un repo IMMUTABLE, la 2ᵉ tentative aurait été rejetée — démontrer.

**Livrable.** Commandes + captures avant/après.

### Exercice 4 — Configurer un pull-through cache Docker Hub (≈ 45 min)

**Objectif.** Comprendre le cache.

**Étapes :**

1. Créer un pull-through cache rule pour Docker Hub.
2. Faire un `docker pull` via le cache :

   ```bash
   docker pull ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com/dockerhub-cache/library/nginx:1.27
   ```

3. Vérifier que l'image apparait désormais dans ECR (repo créé automatiquement `dockerhub-cache/library/nginx`).
4. Tester un second pull — confirmer qu'il vient du cache (plus rapide).

**Livrable.** Captures CLI.

### Exercice 5 — Réplication cross-region (≈ 45 min)

**Objectif.** Comprendre la réplication.

**Étapes :**

1. Configurer la réplication des repos préfixés `prod-` vers `us-east-1`.
2. Créer `prod-app-a` dans `eu-west-1`.
3. Push une image.
4. Attendre 1-2 min, vérifier que le repo `prod-app-a` est apparu dans `us-east-1` avec l'image.
5. Comparer les digests : doivent être identiques.

**Livrable.** Captures dans les 2 régions.

### Mini-défi — Pipeline ECR complet (≈ 60 min, conceptuel + scripts)

**Cas.** Mettre en place un pipeline qui, à chaque push GitHub :

- Build l'image avec `commit_sha` comme tag.
- Push dans ECR `my-app`.
- Vérifie le scan : si CRITICAL ou HIGH, échec.
- Si OK, déploie sur AppRunner.

À écrire en pseudo-script (CI/CD comme GitHub Actions ou CodeBuild).

**Livrable.** Pseudo-pipeline + commentaires.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **ECR**, son périmètre, ses 4 propriétés.
- [ ] Citer les **différences entre ECR Private et ECR Public**.
- [ ] Décrire l'**URL** d'une image ECR Private et Public.
- [ ] Expliquer pourquoi **ECR est indispensable pour Lambda image**.
- [ ] Citer **3 cas** où ECR est indispensable et **1 cas** où il ne l'est pas.
- [ ] Faire la commande complète **`get-login-password | docker login`**.
- [ ] Expliquer ce qu'est l'**immutabilité des tags** et pourquoi l'activer en prod.
- [ ] Décrire une **stratégie de tagging** acceptable en prod (semver + sha vs latest).
- [ ] Définir une **lifecycle policy** et donner les 3 règles d'un "starter pack".
- [ ] Distinguer **basic scan** et **Enhanced scan** (Inspector).
- [ ] Expliquer **pull-through cache** et son intérêt vs Docker Hub.
- [ ] Décrire la **réplication ECR** cross-region.
- [ ] Citer **5 anti-patterns** classiques.

### Items du glossaire visés

**N2 atteint** :

- _utilité d'ECR et quand est-ce qu'il est indispensable_ — sections 2 et 3.

**N3 amorcés** (introduits, non couverts en profondeur) :

- _intérêt d'Amazon Inspector dans le contexte d'ECR_ — section 7.
- _bonnes pratiques de lifecycle pour ECR_ — section 6.

---

## 12. Ressources complémentaires

### Documentation AWS

- [Amazon ECR User Guide](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html)
- [Amazon ECR Public User Guide](https://docs.aws.amazon.com/AmazonECR/latest/public/what-is-ecr.html)
- [Lifecycle policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)
- [Image scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html)
- [Enhanced scanning (Inspector)](https://docs.aws.amazon.com/inspector/latest/user/scanning-ecr.html)
- [Pull-through cache](https://docs.aws.amazon.com/AmazonECR/latest/userguide/pull-through-cache.html)
- [Replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html)

### Outils

- [Trivy](https://aquasecurity.github.io/trivy/) — scanner OSS, complémentaire pour les déploiements stricts.
- [Hadolint](https://github.com/hadolint/hadolint) — lint Dockerfile.
- [Docker Buildx](https://docs.docker.com/buildx/working-with-buildx/) — build multi-architecture (arm64 + amd64) en un seul push.

### Pour aller plus loin

- **M11-M12 (ECS)** — premier consommateur typique d'ECR.
- **M4 / M7** — Lambda image et AppRunner image (déjà liés).
- **AWS Identity M4** — resource-based policies appliquées à ECR (cross-account share).
- **AWS Analytics M1** — recevoir les events de scan ECR via EventBridge → Lambda → alerting.
