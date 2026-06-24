# M10 — KMS et Certificate Manager

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **AWS KMS** (Key Management Service), son rôle dans l'écosystème AWS (chiffrement at-rest et in-transit pour quasi tous les services managés), et le principe d'**envelope encryption**.
- Distinguer les **trois familles de clés** KMS : **AWS-owned**, **AWS-managed**, **Customer-managed (CMK)** — et savoir laquelle utiliser quand.
- Expliquer ce qu'est le **BYOK** (Bring Your Own Key), pourquoi on l'utilise (souveraineté, conformité, contrôle) et **comment** il s'oppose à une clé KMS standard générée par AWS (item N2 explicite).
- Définir une **Key Policy**, son caractère primaire dans KMS, et expliquer en première approche les **Grants** (sujet niveau 3).
- Configurer **SSE-KMS** sur un bucket S3 : chiffrement automatique au repos via une clé KMS, choix entre clé AWS-managed et clé custom.
- Définir **AWS Certificate Manager** (ACM), son rôle, et savoir **demander, valider, attacher et renouveler** un certificat TLS.
- Réaliser le **double exercice pratique** : chiffrer un objet S3 avec KMS + déployer un certificat sur un ALB ou CloudFront.

## Durée estimée

1 jour.

## Pré-requis

- M1-M9 (IAM, policies, Secrets Manager).
- AWS CLI v2 configurée, permissions sur KMS et ACM.
- Idéalement, un nom de domaine sous votre contrôle (pour les exercices ACM).
- Notions de chiffrement symétrique vs asymétrique : utile, mais une intro courte est faite en section 2.

---

## 1. Pourquoi KMS et ACM

### 1.1 — Deux services, deux problèmes complémentaires

| Service | Problème résolu                                                                |
| ------- | ------------------------------------------------------------------------------ |
| **KMS** | Comment **chiffrer** mes données au repos sans gérer mes propres clés ?        |
| **ACM** | Comment **émettre, attacher et renouveler** des certificats TLS gratuitement ? |

Les deux sont **indissociables** d'une bonne hygiène cloud :

- Sans KMS → données stockées en clair, conformité impossible (RGPD, HDS, PCI…).
- Sans ACM → certificats à acheter / renouveler / installer manuellement → expirations, sites cassés.

### 1.2 — L'analogie du coffre + boîte aux lettres

- **KMS** : la **clé du coffre**. AWS s'en occupe (perte, rotation, audit). Vous, vous **demandez** au coffre d'ouvrir / fermer, sans jamais voir la clé.
- **ACM** : un **bureau de poste** qui imprime gratuitement vos enveloppes officielles (certificats) et les renouvelle automatiquement à l'approche de l'expiration.

Aucun des deux ne stocke vos données / votre courrier — ils fournissent l'**outillage cryptographique** pour les sécuriser.

### 1.3 — Périmètre de ce module

On reste au **niveau 2** : comprendre les concepts, savoir utiliser, distinguer KMS-managed et BYOK. Les sujets niveau 3 (Grants, SSE-KMS en profondeur, lifecycle ACM avancé) sont **mentionnés** sans être creusés.

---

## 2. KMS — fondamentaux

### 2.1 — Définition

**KMS** est le service de gestion de **clés cryptographiques** d'AWS. Son rôle :

- **Créer** et **stocker** des clés cryptographiques (symétriques ou asymétriques).
- **Effectuer les opérations** crypto (chiffrement, déchiffrement, signature) **sans jamais exposer** la clé en clair.
- **Auditer** chaque utilisation via CloudTrail.
- **Intégrer** quasi tous les services AWS (S3, RDS, EBS, DynamoDB, Lambda env vars, Secrets Manager, …) pour le chiffrement at-rest natif.

### 2.2 — Rappel — chiffrement symétrique vs asymétrique

| Type            | Caractéristique                                                          | Cas d'usage typique              |
| --------------- | ------------------------------------------------------------------------ | -------------------------------- |
| **Symétrique**  | Une seule clé pour chiffrer et déchiffrer.                               | Chiffrement at-rest, à la volée. |
| **Asymétrique** | Une paire publique/privée. Chiffrer avec l'une, déchiffrer avec l'autre. | Signature, échange de clés.      |

KMS supporte les deux, mais **99 % des cas d'usage sont symétriques** (AES-256-GCM).

### 2.3 — Envelope Encryption — le pattern central

> **KMS ne chiffre presque jamais les données elles-mêmes.** Il chiffre **une clé** qui chiffre les données.

Pourquoi : performance. Faire un round-trip KMS pour chaque octet d'un fichier de 10 GB est inenvisageable.

Le pattern :

```md
1. L'application demande à KMS de générer une "Data Key" (DEK).
   → KMS renvoie : - DEK en clair (utilisable une seule fois en mémoire). - DEK chiffrée par la "Customer Master Key" (CMK).
2. L'application chiffre les données avec la DEK en clair.
3. L'application stocke :
   - Les données chiffrées.
   - La DEK chiffrée à côté.
4. L'application efface la DEK en clair de la mémoire.

Pour déchiffrer : 5. L'application demande à KMS : "déchiffre cette DEK chiffrée".
→ KMS renvoie la DEK en clair. 6. L'application déchiffre les données avec la DEK.
```

Bénéfices :

- **Performance** : un seul appel KMS par fichier (pas par octet).
- **Sécurité** : la CMK ne quitte **jamais** KMS. Seules les DEK ciruclent (et chiffrées au repos).
- **Audit** : KMS log uniquement les opérations sur la CMK (peu nombreuses).

S3 SSE-KMS, EBS, RDS, etc., utilisent **tous** envelope encryption sous le capot, **transparent** pour l'utilisateur.

### 2.4 — Les opérations API KMS principales

| API                               | Rôle                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `CreateKey`                       | Créer une CMK.                                                                      |
| `Encrypt`                         | Chiffrer un petit blob (jusqu'à 4 KB) directement avec la CMK.                      |
| `Decrypt`                         | Déchiffrer un ciphertext produit par `Encrypt` ou `GenerateDataKey`.                |
| `GenerateDataKey`                 | Obtenir une DEK (data key) plaintext + chiffrée. **Le cœur d'envelope encryption.** |
| `GenerateDataKeyWithoutPlaintext` | Idem mais sans plaintext (pour pré-générer).                                        |
| `ReEncrypt`                       | Re-chiffrer un blob avec une autre clé.                                             |
| `Sign` / `Verify`                 | Signer / vérifier (clé asymétrique).                                                |
| `ScheduleKeyDeletion`             | Marquer une clé pour suppression (délai 7-30 jours).                                |

Pour l'usage quotidien, **`Encrypt` / `Decrypt` / `GenerateDataKey`** suffisent.

---

## 3. Les trois familles de clés

KMS gère **trois** types de clés, à ne pas confondre.

### 3.1 — AWS-owned keys

- **Possédées par AWS**, partagées entre clients.
- **Invisibles** dans la console (on ne les liste pas).
- **Gratuites**.
- Utilisées par AWS pour chiffrer certaines données de service **par défaut** (par exemple, certains champs internes DynamoDB).
- **Pas de contrôle** côté client : on ne peut pas changer la rotation, l'auditer finement, etc.

**À retenir** : ces clés existent mais on ne les manipule **jamais**. Citoyens de 2ᵉ classe.

### 3.2 — AWS-managed keys

- Créées par AWS dans **votre compte**, **par service**.
- Reconnaissables : `alias/aws/s3`, `alias/aws/ebs`, `alias/aws/rds`, `alias/aws/secretsmanager`, `alias/aws/ssm`, …
- **Gratuites** (pas de frais mensuels). Coût uniquement sur les **API calls**.
- Visibles dans la console KMS.
- **Pas modifiables** (key policy gérée par AWS, rotation auto).
- Bonnes pour démarrer rapidement.

**Cas d'usage** : si on coche "Enable encryption with default KMS key" dans S3, Lambda, RDS… on utilise une AWS-managed key.

### 3.3 — Customer-managed keys (CMK)

- Créées **par vous**, gérées **par vous**.
- Vous contrôlez :
  - La **key policy** (qui peut faire quoi avec la clé).
  - La **rotation** (annuelle automatique ou manuelle).
  - L'**alias** et le **tagging**.
  - La **désactivation** / suppression.
- **Payantes** : ~1 $/clé/mois + 0,03 $/10 000 API calls.
- **Audit fin** via CloudTrail.

**Cas d'usage** : tout cas où on veut du contrôle fin (production sensible, multi-tenant, conformité).

### 3.4 — Tableau de choix

| Critère                  | AWS-owned | AWS-managed                | Customer-managed (CMK)                   |
| ------------------------ | --------- | -------------------------- | ---------------------------------------- |
| Possession               | AWS       | AWS dans votre compte      | Vous                                     |
| Visible dans la console  | Non       | Oui (`alias/aws/...`)      | Oui (`alias/votre-nom`)                  |
| Tarif                    | Gratuit   | Gratuit + API calls        | ~1 $/mois + API calls                    |
| Personnaliser key policy | Non       | Non                        | **Oui**                                  |
| Rotation                 | Auto AWS  | Annuelle auto (non config) | Annuelle auto (configurable) ou manuelle |
| Cross-account            | Non       | Non                        | **Oui**                                  |
| Conformité fine          | Non       | Partiel                    | **Oui**                                  |

### 3.5 — Règle simple

```graph
Question : ai-je besoin de contrôler la clé (key policy, audit fin, cross-account, conformité) ?

  ├── Non → AWS-managed (simple, gratuit).
  └── Oui → Customer-managed (CMK).
```

Pour de la **prod sérieuse**, **CMK** est la norme.

---

## 4. BYOK — Bring Your Own Key (item N2 explicite)

### 4.1 — Définition

**BYOK** signifie **importer du matériel cryptographique externe** dans KMS, plutôt que de laisser AWS le générer.

Concrètement : vous générez la clé dans **votre propre HSM** (hardware security module) on-premise, puis vous l'**importez** dans KMS. À partir de là, KMS s'occupe de l'utiliser, mais vous gardez une **copie externe** sous votre contrôle.

### 4.2 — KMS standard vs BYOK — la différence

| Aspect               | KMS standard (clé générée par KMS) | BYOK (clé importée)                                                                                     |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Origine du matériel  | KMS génère la clé                  | Vous générez hors d'AWS                                                                                 |
| Copie externe        | Aucune (KMS est source unique)     | **Vous gardez une copie**                                                                               |
| Sortie des données   | Impossible de sortir de KMS        | La clé peut être réimportée ailleurs si vous la perdez (avec la copie externe).                         |
| Rotation automatique | Oui (annuelle)                     | **Non** (vous gérez la rotation à la main : générer une nouvelle clé, réimporter).                      |
| Effacement           | Soft delete avec délai 7-30 j      | Vous pouvez supprimer la clé importée immédiatement (mais elle reste imitable si copie externe existe). |
| Coût                 | ~1 $/mois CMK                      | Idem + coût opérationnel élevé                                                                          |
| Audit                | CloudTrail                         | CloudTrail + audit de votre HSM                                                                         |
| Cas d'usage          | 99 % des entreprises               | Cas spécifiques (souveraineté, conformité réglementaire stricte)                                        |

### 4.3 — Pourquoi utiliser BYOK ?

Trois raisons légitimes :

- **Souveraineté** : votre HSM physique reste sous votre contrôle, dans votre data center. AWS ne peut pas accéder seul à la clé.
- **Conformité réglementaire** : certains secteurs (banque, défense, santé en France) ou cadres légaux exigent que la clé soit **vous-même** générée et que vous puissiez la **détruire à tout moment**.
- **Audit indépendant** : la copie externe permet de vérifier que la clé n'a pas été altérée.

### 4.4 — Pourquoi **ne pas** utiliser BYOK

- **Complexité opérationnelle** énorme : générer dans un HSM, transporter, importer, rotater à la main, gérer les expirations.
- **Aucune rotation automatique**.
- **Risque de perte** : si on perd la copie externe **et** la clé KMS expire, on perd l'accès aux données chiffrées.
- **Surcoût** : HSM physique = 10k-50k $.
- **Pas d'avantage réel** pour 99 % des entreprises : AWS KMS standard est suffisamment sécurisé (FIPS 140-2 Level 2, ou 3 avec CloudHSM).

**Recommandation 2026** : ne pas faire de BYOK sauf **contrainte légale explicite** ou **politique de groupe**.

### 4.5 — Variante — CloudHSM

AWS propose **AWS CloudHSM** : un HSM physiquement dédié à un client, opéré par AWS. Plus simple que BYOK en local mais plus cher (~1 $/h + frais), et donne des garanties FIPS 140-2 Level 3.

Pour la plupart, **KMS standard** suffit.

### 4.6 — External Key Store (XKS)

Variante moderne (2022+) du BYOK : votre clé reste dans **votre HSM externe**, et KMS appelle ce HSM via HTTP pour chaque opération crypto. **Latence**, complexité opérationnelle énorme, mais souveraineté maximale.

Rare et coûteux. À connaître par son nom seulement.

---

## 5. Key Policy vs Grants

### 5.1 — Key Policy

C'est la **policy primaire** d'une CMK. À la différence de l'IAM normal :

> **Si la Key Policy ne nomme pas un acteur, aucune IAM policy ne peut donner accès à cette clé.**

Concrètement : pour qu'un user IAM accède à une clé KMS custom, **les deux** doivent être satisfaits :

1. La key policy de la clé l'autorise.
2. Une IAM policy (identity ou resource) lui donne `kms:Decrypt` (ou autres).

Pour les **AWS-managed keys**, AWS configure une key policy permissive automatiquement : un IAM allow suffit.

Pour les **CMK**, **on doit configurer la key policy** explicitement.

### 5.2 — Key Policy minimale

À la création d'une CMK, AWS génère par défaut une key policy avec ces statements :

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
    }
  ]
}
```

Lecture : "Le compte (via IAM) contrôle pleinement la clé." Sans cela, on serait verrouillé dehors.

À cette base, on ajoute :

- Statement pour les **utilisateurs** (qui peut Encrypt/Decrypt).
- Statement pour les **admins de la clé** (qui peut rotater, désactiver, supprimer).
- Statement pour les **services AWS** (qui peuvent utiliser la clé en interne).

### 5.3 — Exemple complet

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
      "Sid": "AllowKeyAdmins",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT:role/key-admin" },
      "Action": [
        "kms:Create*",
        "kms:Describe*",
        "kms:Enable*",
        "kms:List*",
        "kms:Put*",
        "kms:Update*",
        "kms:Revoke*",
        "kms:Disable*",
        "kms:Get*",
        "kms:Delete*",
        "kms:TagResource",
        "kms:UntagResource",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowEncryptDecrypt",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::ACCOUNT:role/app-role",
          "arn:aws:iam::ACCOUNT:role/lambda-role"
        ]
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5.4 — Grants — survol

Un **Grant** est une **délégation temporaire** d'accès à une clé KMS, plus flexible qu'une key policy :

- Pas besoin de modifier la key policy.
- Peut être créé / révoqué dynamiquement par un programme.
- Idéal pour des cas où plein de services AWS doivent utiliser la clé brièvement.

Sujet **N3**. À connaître par son nom au N2.

---

## 6. SSE-KMS — chiffrement S3 avec KMS

L'usage le plus courant de KMS : **chiffrer des objets S3 au repos**.

### 6.1 — Les modes de chiffrement S3

| Mode                             | Clé utilisée                             | Cas d'usage                                         |
| -------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| **SSE-S3**                       | Clé gérée par S3 (AES-256, transparent)  | Cas simple, pas de besoin d'audit fin.              |
| **SSE-KMS**                      | Clé KMS (AWS-managed ou CMK)             | Audit fin, compliance, contrôle.                    |
| **SSE-C**                        | Clé fournie par le client à chaque appel | Cas spécifique (vous gérez les clés).               |
| **CSE** (Client-Side Encryption) | Chiffrement côté client avant upload     | Données sensibles, AWS ne voit jamais le plaintext. |

**Recommandation** : **SSE-KMS avec CMK** pour de la prod. SSE-S3 pour des données non sensibles.

### 6.2 — Configurer SSE-KMS sur un bucket

```bash
aws s3api put-bucket-encryption \
  --bucket my-secure-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:eu-west-1:ACCOUNT:key/KEY-ID"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

À partir de là, **tout objet uploadé** sera chiffré automatiquement avec cette CMK.

### 6.3 — Bucket Key — l'optimisation cruciale

Sans **Bucket Key** : KMS est appelé **pour chaque objet** uploadé / lu. À très grand volume (millions d'objets), les coûts KMS explosent.

Avec **Bucket Key activé** (recommandé depuis 2021) : S3 utilise une clé **intermédiaire** (la Bucket Key), elle-même chiffrée par la CMK. KMS n'est appelé que pour la Bucket Key, pas pour chaque objet. **Coûts réduits de 99 %** sur des cas à fort volume.

À **toujours** activer (`BucketKeyEnabled: true`).

### 6.4 — Lecture / écriture

Pour écrire :

```bash
aws s3 cp file.txt s3://my-secure-bucket/file.txt
# Automatiquement chiffré
```

Pour lire :

```bash
aws s3 cp s3://my-secure-bucket/file.txt /tmp/file.txt
# Automatiquement déchiffré (si l'identité a kms:Decrypt + s3:GetObject)
```

L'utilisateur ne voit pas le chiffrement — c'est **transparent**. Tant que les permissions IAM + KMS sont en place.

### 6.5 — Permissions nécessaires

Pour qu'un rôle puisse lire/écrire sur le bucket SSE-KMS :

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-secure-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:eu-west-1:ACCOUNT:key/KEY-ID"
    }
  ]
}
```

`kms:GenerateDataKey` pour les uploads (envelope encryption), `kms:Decrypt` pour les lectures.

**Et** la key policy doit autoriser le rôle (rappel section 5).

---

## 7. AWS Certificate Manager (ACM)

### 7.1 — Définition

**ACM** est le service qui gère les **certificats TLS / SSL** pour AWS. Trois capacités :

- **Émission** : demander un certificat pour `example.com`, `*.example.com`, ou plusieurs noms.
- **Renouvellement** : ACM renouvelle **automatiquement** les certificats publics avant expiration.
- **Déploiement** : attacher un certificat à un service AWS (ALB, NLB, CloudFront, API Gateway, …) en quelques clics.

### 7.2 — Types de certificats

| Type                  | Pour                                      | Tarif                                     |
| --------------------- | ----------------------------------------- | ----------------------------------------- |
| **Public**            | Sites publics (HTTPS Internet).           | **Gratuit**                               |
| **Private** (ACM PCA) | Sites internes, communications intra-VPC. | Payant (~400 $/mois CA + frais par cert). |

Pour 95 % des cas : **public**.

### 7.3 — Cycle de vie d'un certificat public

```md
1. REQUEST :
   Demander un certificat pour example.com.
   ACM génère un CSR et une paire de clés (interne).

2. VALIDATE :
   Prouver qu'on contrôle le domaine.
   - DNS validation (recommandé) : ACM donne un record CNAME à ajouter dans Route 53.
   - Email validation : email envoyé aux contacts WHOIS du domaine.

3. ISSUED :
   Une fois validé, ACM émet le certificat.
   Le certificat est attachable aux services AWS.

4. RENEW :
   ~60 jours avant expiration, ACM tente de renouveler automatiquement.
   Pour public + DNS validation : automatique si le CNAME de validation est toujours là.
   Pour email validation : email envoyé, intervention humaine requise.

5. EXPIRED :
   Si non renouvelé, le certificat expire (1 an typique).
```

### 7.4 — Demander un certificat — CLI

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "www.example.com" "*.example.com" \
  --validation-method DNS \
  --region eu-west-1

# Sortie : ARN du certificat
# arn:aws:acm:eu-west-1:ACCOUNT:certificate/abc-123-def
```

### 7.5 — Récupérer le record de validation

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:eu-west-1:ACCOUNT:certificate/abc-123-def \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
```

Sortie :

```json
[
  {
    "Name": "_abc123.example.com.",
    "Type": "CNAME",
    "Value": "_xyz789.acm-validations.aws."
  }
]
```

Ajouter ce CNAME dans la hosted zone Route 53. ACM valide en ~5-15 min.

**Via Route 53, automatique** : la console ACM propose un bouton "Create records in Route 53" — recommandé.

### 7.6 — Attacher à un service

Pour un ALB (vu en Networking M8) :

```bash
aws elbv2 create-listener \
  --load-balancer-arn ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=arn:aws:acm:eu-west-1:ACCOUNT:certificate/abc-123-def \
  --default-actions Type=forward,TargetGroupArn=TG_ARN
```

Pour CloudFront (vu en Networking M6) : le cert doit être dans **us-east-1**.

Pour API Gateway (vu en Networking M7) : dans la **même région** pour Regional, **us-east-1** pour Edge-optimized.

---

## 8. Renouvellement de certificat (item N2 explicite)

### 8.1 — Renouvellement automatique — les conditions

Pour qu'ACM renouvelle **automatiquement** un certificat public :

1. Le **certificat doit être attaché** à un service AWS (ALB, CloudFront, API Gateway, etc.). ACM ne renouvelle **pas** les certificats orphelins.
2. La **validation DNS** doit toujours fonctionner : le CNAME de validation doit être encore dans la zone DNS.
3. Si validation par email : **non automatique** — un email est envoyé, l'humain doit cliquer.

Quand ces conditions sont réunies, ACM :

- ~60 jours avant expiration, génère un nouveau certificat.
- Valide automatiquement.
- Met à jour les services attachés (transparent pour l'utilisateur final).

### 8.2 — Vérifier le statut de renouvellement

```bash
aws acm describe-certificate \
  --certificate-arn ARN \
  --query 'Certificate.{Status:Status, ExpiresAt:NotAfter, RenewalStatus:RenewalSummary.RenewalStatus}'
```

Sortie possible :

```json
{
  "Status": "ISSUED",
  "ExpiresAt": "2027-05-17T00:00:00Z",
  "RenewalStatus": "SUCCESS"
}
```

Si `RenewalStatus` est `PENDING_VALIDATION` ou `FAILED`, il y a un problème (CNAME supprimé, etc.).

### 8.3 — Renouvellement manuel d'un certificat avec validation email

```bash
aws acm renew-certificate --certificate-arn ARN
# → ACM envoie un email aux contacts WHOIS
# L'humain clique sur le lien dans l'email
# ACM émet le nouveau cert
```

À éviter en production : la validation email crée du toil. Préférer la **validation DNS**.

### 8.4 — Force un nouveau certificat

Pour des cas spéciaux (changer de SAN, rotation forcée), demander un **nouveau** certificat (pas un renouvellement) :

```bash
aws acm request-certificate ...
# (avec les mêmes ou nouveaux domaines)
```

Puis détacher l'ancien des services et attacher le nouveau.

### 8.5 — Bonnes pratiques

| Pratique                                                           | Pourquoi                              |
| ------------------------------------------------------------------ | ------------------------------------- |
| **Validation DNS systématique** (jamais email).                    | Renouvellement automatique.           |
| **Toujours laisser les CNAME de validation** en place.             | Sinon le renouvellement échoue.       |
| **Monitorer** `RenewalStatus` via CloudWatch alarms.               | Détecter les échecs avant expiration. |
| **Tagger** les certificats pour audit.                             | Trouver qui possède quoi.             |
| **Préférer wildcard** (`*.example.com`) si nombreux sous-domaines. | 1 cert au lieu de N.                  |
| **Auditer les certificats inutilisés**.                            | Free tier mais inutile.               |

---

## 9. Pratique — chiffrer un objet S3 + déployer un certificat

L'exercice central du module — les deux moitiés du pratique du glossaire.

### 9.1 — Partie 1 — chiffrer un objet S3 avec KMS

**Étape 1 — Créer une CMK** :

```bash
KEY_ID=$(aws kms create-key \
  --description "S3 encryption key for tp-secure-bucket" \
  --tags TagKey=Name,TagValue=s3-tp-key \
  --query 'KeyMetadata.KeyId' --output text)

# Créer un alias pour la lisibilité
aws kms create-alias \
  --alias-name alias/s3-tp-key \
  --target-key-id $KEY_ID
```

**Étape 2 — Créer un bucket** :

```bash
aws s3 mb s3://my-tp-secure-bucket-$(whoami)-$(date +%s) \
  --region eu-west-1
```

**Étape 3 — Activer SSE-KMS** :

```bash
BUCKET=my-tp-secure-bucket-...
aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration "{
    \"Rules\": [{
      \"ApplyServerSideEncryptionByDefault\": {
        \"SSEAlgorithm\": \"aws:kms\",
        \"KMSMasterKeyID\": \"alias/s3-tp-key\"
      },
      \"BucketKeyEnabled\": true
    }]
  }"
```

**Étape 4 — Uploader un objet, vérifier** :

```bash
echo "secret content" > /tmp/secret.txt
aws s3 cp /tmp/secret.txt s3://$BUCKET/secret.txt

# Vérifier que l'objet est chiffré KMS
aws s3api head-object --bucket $BUCKET --key secret.txt
# → ServerSideEncryption: "aws:kms", SSEKMSKeyId: "..."

# Lire (déchiffrement transparent)
aws s3 cp s3://$BUCKET/secret.txt /tmp/downloaded.txt
cat /tmp/downloaded.txt
# → "secret content"
```

**Étape 5 — Voir l'audit dans CloudTrail** :

Le `GenerateDataKey` (à l'upload) et le `Decrypt` (à la lecture) apparaissent dans CloudTrail, avec :

- `eventName`: `GenerateDataKey` / `Decrypt`.
- `userIdentity`: l'identité qui a fait l'appel.
- `resources`: l'ARN de la clé KMS.
- Le contexte de chiffrement (`encryptionContext`) contient `aws:s3:arn` avec l'ARN de l'objet — on sait **exactement** quel objet a été déchiffré, par qui.

### 9.2 — Partie 2 — Déployer un certificat sur un ALB

**Étape 1 — Demander un certificat** :

```bash
CERT_ARN=$(aws acm request-certificate \
  --domain-name tp.<mondomaine>.fr \
  --validation-method DNS \
  --region eu-west-1 \
  --query 'CertificateArn' --output text)
```

**Étape 2 — Récupérer le record de validation** :

```bash
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region eu-west-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

**Étape 3 — Ajouter le CNAME dans Route 53** :

```bash
# Récupérer le record
RECORD=$(aws acm describe-certificate --certificate-arn $CERT_ARN --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json)
NAME=$(echo $RECORD | jq -r '.Name')
VALUE=$(echo $RECORD | jq -r '.Value')

HOSTED_ZONE_ID=Z123ABC456

cat > validation.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "$NAME",
      "Type": "CNAME",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$VALUE"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://validation.json
```

**Étape 4 — Attendre la validation** :

```bash
aws acm wait certificate-validated --certificate-arn $CERT_ARN
```

**Étape 5 — Attacher le cert à un ALB** :

Si on a un ALB du parcours Networking M8 :

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

**Étape 6 — Créer le record DNS pour `tp.<mondomaine>.fr` pointant vers l'ALB**, et tester :

```bash
curl -I https://tp.<mondomaine>.fr/
# → 200 OK avec certificat valide
```

### 9.3 — Vérifier le renouvellement automatique

```bash
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.{Status:Status, RenewalStatus:RenewalSummary.RenewalStatus, NotAfter:NotAfter}'
```

`RenewalStatus: PENDING_AUTO_RENEWAL` confirme qu'ACM va gérer automatiquement le renouvellement.

---

## 10. Coûts

### 10.1 — KMS

| Item                               | Tarif (eu-west-1)              |
| ---------------------------------- | ------------------------------ |
| Customer-managed Key (CMK)         | **1 $/clé/mois**               |
| API calls (Encrypt, Decrypt, etc.) | 0,03 $/10 000 calls            |
| AWS-managed keys                   | Gratuit (key) + 0,03 $/10k API |
| External Key Store (XKS)           | 1 $/clé/mois + appels          |
| Asymmetric / HMAC keys             | 1 $/clé/mois                   |
| CloudHSM                           | ~1,45 $/h par HSM              |

### 10.2 — Estimer le coût

- **Cas typique** : 5 CMK + 1 M d'API calls/mois → 5 + 3 = **8 $/mois**.
- **Cas haut volume sans Bucket Key** : 1 CMK + 100 M API calls (1 par objet S3) → 1 + 300 = **301 $/mois**.
- **Avec Bucket Key activé** sur S3 : 1 + 0,003 = ~**1 $/mois**. Indispensable !

### 10.3 — ACM

- **Certificats publics** : **gratuits**, sans limite.
- **Certificats privés (PCA)** : ~400 $/mois pour la CA + 0,75 $/cert.

ACM est l'un des très rares services AWS **complètement gratuit** pour son cas d'usage principal.

---

## 11. Anti-patterns récurrents

| Anti-pattern                                                     | Conséquence                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Utiliser une **AWS-managed key** pour la prod sensible.          | Pas de contrôle fin, audit limité, pas de cross-account possible. |
| **Pas activer Bucket Key** sur S3 à fort volume.                 | Facture KMS x100.                                                 |
| Faire **BYOK** sans vraie contrainte de souveraineté.            | Complexité opérationnelle énorme pour aucun bénéfice.             |
| **Key Policy** trop permissive (`Allow * on *` à n'importe qui). | Compromise une clé = compromise toutes les données chiffrées.     |
| Pas configurer la **rotation annuelle**.                         | Clé compromise reste utilisable indéfiniment.                     |
| Utiliser **email validation** ACM.                               | Pas de renouvellement automatique.                                |
| **Supprimer** le CNAME de validation après émission.             | Renouvellement automatique échoue.                                |
| **Cert ACM mal placé** (us-east-1 vs region selon usage).        | Service refuse d'utiliser le cert.                                |
| **CloudHSM** pour un cas qui n'en a pas besoin.                  | 12 000 $/an + complexité.                                         |
| Pas de **monitoring** sur RenewalStatus.                         | Cert expire silencieusement → site cassé.                         |

---

## 12. Exercices pratiques

### Exercice 1 — Créer une CMK et la key policy (≈ 30 min)

**Objectif.** Premier contact KMS.

**Étapes :**

1. Créer une CMK custom.
2. Créer un alias `alias/tp-key`.
3. Lire la key policy par défaut, identifier les statements.
4. Modifier la key policy pour autoriser un rôle spécifique à faire Encrypt/Decrypt.

**Livrable.** Avant/après de la key policy + commentaires.

### Exercice 2 — Chiffrer/déchiffrer un blob avec KMS (≈ 20 min)

**Objectif.** Manipulation directe (rare en pratique, mais pédagogique).

**Étapes :**

```bash
# Chiffrer un texte court
aws kms encrypt \
  --key-id alias/tp-key \
  --plaintext "mon-secret-très-court" \
  --query 'CiphertextBlob' --output text > /tmp/cipher.b64

# Déchiffrer
aws kms decrypt \
  --ciphertext-blob fileb://<(base64 -d < /tmp/cipher.b64) \
  --query 'Plaintext' --output text | base64 -d
# → mon-secret-très-court
```

**Livrable.** Captures montrant le cycle complet.

### Exercice 3 — Activer SSE-KMS sur S3 (≈ 30 min)

**Objectif.** Le cas le plus courant.

**Étapes :** suivre la section 9.1.

**Bonus :** désactiver Bucket Key, uploader 100 fichiers, observer le nombre d'API KMS dans CloudTrail. Réactiver Bucket Key, refaire le même upload, comparer.

**Livrable.** Captures + extrait du nombre d'API calls observé.

### Exercice 4 — Demander un certificat ACM (≈ 30 min)

**Objectif.** Mettre en place un cert.

**Étapes :** suivre la section 9.2 (étapes 1-4). Si pas de domaine personnel : utiliser un sous-domaine d'un domaine appartenant à votre équipe / formateur.

**Livrable.** Statut "ISSUED" + capture des CNAME de validation.

### Exercice 5 — Attacher le cert à un ALB + tester HTTPS (≈ 30 min)

**Objectif.** Compléter la pratique.

**Étapes :** suivre 9.2 (étapes 5-6). Réutiliser l'ALB du parcours Networking M8 si présent.

**Livrable.** Capture du `curl -I https://...` avec certificat valide + le chain TLS.

### Exercice 6 — Permissions KMS + S3 pour un rôle (≈ 30 min)

**Objectif.** Maîtriser les permissions croisées.

**Étapes :**

1. Créer un rôle IAM `tp-s3-read-role` qui doit lire les objets de `my-tp-secure-bucket` (chiffré par `alias/tp-key`).
2. Écrire la policy IAM avec **uniquement** `s3:GetObject` (pas de KMS).
3. Tenter de lire un objet : doit échouer (KMS Decrypt manquant).
4. Ajouter `kms:Decrypt` sur la clé.
5. **Aussi** modifier la key policy pour autoriser le rôle.
6. Re-tenter : doit fonctionner.

**Livrable.** Captures avant/après + commentaire sur la double exigence.

### Mini-défi — Concevoir le chiffrement d'une stack (≈ 30 min, papier)

**Cas.** Application SaaS multi-tenant qui stocke :

- Données utilisateur dans **DynamoDB**.
- Fichiers uploadés dans **S3**.
- Variables d'env Lambda contenant des **clés API** tiers.
- Secrets DB dans **Secrets Manager**.

**Concevoir** :

1. Combien de clés KMS (une par service ? une par tenant ? une globale ?).
2. AWS-managed ou CMK pour chaque ?
3. Key policies / IAM nécessaires.
4. Coût mensuel estimé.

**Livrable.** Schéma + matrice clé × ressource.

---

## 13. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **KMS** et son rôle (chiffrement at-rest géré).
- [ ] Définir **envelope encryption** en 3 étapes.
- [ ] Distinguer **AWS-owned**, **AWS-managed**, **Customer-managed** keys.
- [ ] Citer 3 critères pour choisir une CMK plutôt qu'AWS-managed.
- [ ] Définir **BYOK** et donner sa différence d'avec KMS standard sur 4 axes.
- [ ] Citer 3 cas où BYOK est légitime, et 3 inconvénients.
- [ ] Définir la **Key Policy** et expliquer son caractère **primaire** (vs IAM normal).
- [ ] Décrire la **double évaluation** Key Policy + IAM pour accéder à une CMK.
- [ ] Configurer **SSE-KMS** sur un bucket S3 de mémoire.
- [ ] Expliquer ce qu'est **Bucket Key** et pourquoi l'activer.
- [ ] Définir **ACM** et ses 3 capacités (émission, renouvellement, attachement).
- [ ] Distinguer validation **DNS** et validation **email** (et pourquoi DNS).
- [ ] Décrire **comment ACM renouvelle automatiquement** et ses conditions.
- [ ] Citer la subtilité du certificat ACM pour **CloudFront** (us-east-1) vs **ALB régional** (même région).

### Items du glossaire visés

**N2 atteint** :

- _différences entre utiliser une clé KMS et une clé client (BYOK)_ — section 4.
- _renouveler un certificat via Certificate Manager_ — section 8.

---

## 14. Ressources complémentaires

### Documentation AWS

- [KMS Developer Guide](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html)
- [Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
- [Key Policies](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [Importing key material (BYOK)](https://docs.aws.amazon.com/kms/latest/developerguide/importing-keys.html)
- [S3 — Server-side encryption with KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [Bucket Key](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)
- [ACM User Guide](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)
- [ACM Managed renewal](https://docs.aws.amazon.com/acm/latest/userguide/managed-renewal.html)

### Outils et patterns

- [AWS Encryption SDK](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/introduction.html) — pour chiffrement client-side avec KMS.
- [AWS KMS Hierarchical Keyring](https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/key-providers.html) — patterns avancés.
- [CloudHSM](https://docs.aws.amazon.com/cloudhsm/latest/userguide/introduction.html) — pour FIPS 140-2 Level 3.

### Pour aller plus loin

- **Mini-projet** (M11) — design IAM complet d'une app multi-rôle, intégrant KMS et ACM.
- **Niveau 3** : Grants, key rotation strategies, SSE-KMS deep-dive, BYOK lifecycle, CloudHSM.
- **Niveau 4** : architecture KMS multi-comptes, cross-account encryption, lifecycle ACM en production massive.
