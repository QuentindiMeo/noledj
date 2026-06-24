# M6 — S3 — Concepts et Cycle de Vie

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Approfondir S3 (au-delà du tour d'horizon M1) : modèle d'objet, URL, eventual vs strong consistency, multipart upload, transfer acceleration.
- Énoncer **les principaux cas d'usage de S3** (item N2 explicite) : static website, data lake, backup, distribution media, archive long terme, event-driven processing.
- **Conseiller sur le type de S3** (storage class) à utiliser selon un besoin donné (item N2 explicite) : Standard, Intelligent-Tiering, IA, Glacier — avec justification.
- Expliquer l'**intérêt d'une lifecycle policy** S3 (item N2 explicite) : automatiser les transitions de classes et les expirations pour optimiser le coût sans intervention humaine.
- Expliquer les **avantages et inconvénients du versioning** S3 (item N2 explicite) : récupération de données + protection malveillante vs coûts × N versions et complexité.
- Configurer **un bucket avec lifecycle policy + versioning** activés (item du glossaire pratique).
- Reconnaître les **patterns** (versioning + MFA Delete, Glacier + lifecycle, S3 + CloudFront) et les **anti-patterns** (versioning sans lifecycle, expiration trop courte, bucket public sans réflexion).

## Durée estimée

1 jour.

## Pré-requis

- M1 (S3 vue d'ensemble + classes).
- AWS CLI v2 avec permissions `s3:*`, `s3-control:*`.
- Connaissance des concepts vu en parcours **AWS Networking M6** (CloudFront / OAC) — utile.
- Connaissance des concepts vu en parcours **AWS Identity M10** (KMS, SSE-KMS) — utile.

---

## 1. Rappel — S3 fondamentaux

### 1.1 — Synthèse M1

S3 = **object storage** managé, **multi-AZ**, **régional**, **durabilité 11 9's**, accès **HTTP** via API REST.

Vocabulaire :

- **Bucket** : conteneur global unique par nom (par partition AWS).
- **Object** : key (chemin) + valeur (bytes) + metadata.
- **Storage class** : Standard, IA, Glacier, etc.
- **Region** : où vit le bucket.

### 1.2 — URL d'un objet

```text
s3://my-bucket/path/to/file.json                          (style natif AWS)
https://my-bucket.s3.eu-west-1.amazonaws.com/path/to/file.json   (HTTPS direct)
https://s3.eu-west-1.amazonaws.com/my-bucket/path/to/file.json   (HTTPS legacy)
```

### 1.3 — Consistance

Depuis **2020**, S3 offre la **strong read-after-write consistency** sur **toutes les opérations** :

- PUT/POST → GET cohérent immédiatement.
- DELETE → GET retourne 404 immédiatement.
- LIST → reflète les changements immédiatement.

(Avant 2020, c'était eventual consistency pour les overwrites/deletes. Ne plus s'en soucier sur les nouveaux projets.)

### 1.4 — Multipart Upload

Pour les **gros fichiers** (> 100 MB recommandé, **obligatoire** au-dessus de 5 GB) :

- Découper en **parts** de 5 MB - 5 GB chacune.
- Upload en parallèle.
- Assembler côté S3 via `complete-multipart-upload`.

Avantages : parallélisme, reprise sur erreur, upload de fichiers jusqu'à **5 TB**.

```bash
# CLI gère automatiquement le multipart si > 8 MB par défaut
aws s3 cp big-file.bin s3://my-bucket/
# → segmenté automatiquement
```

### 1.5 — Transfer Acceleration

Option payante qui utilise les **edge locations CloudFront** pour accélérer les uploads/downloads **inter-continents**.

- ~0,04 $/GB en plus (variable selon région).
- Activé par bucket.
- Endpoint dédié : `<bucket>.s3-accelerate.amazonaws.com`.

Utile pour uploads massifs depuis l'autre bout du monde. Sinon, CloudFront en aval suffit.

---

## 2. Cas d'usage S3 (item N2 explicite)

C'est **l'item N2 explicite** : connaître les cas d'usage.

### 2.1 — La liste des cas canoniques

| Cas d'usage                    | Détails                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| **Static website hosting**     | HTML/CSS/JS servi via S3 + CloudFront.                       |
| **Distribution média**         | Images, vidéos, audio, downloads avec CDN.                   |
| **Data lake**                  | Logs, exports BI, ML datasets (Athena/EMR/Glue derrière).    |
| **Backups & snapshots**        | RDS snapshots auto, EBS snapshots, dumps applicatifs.        |
| **Archive long terme**         | Documents légaux (7+ ans), conformité, historique financier. |
| **Big data ingestion staging** | Firehose → S3 → Glue/Athena.                                 |
| **Hosting d'artefacts**        | Builds CI/CD, packages, container images (avec ECR).         |
| **Event-driven processing**    | Upload → événement → Lambda déclenchée.                      |
| **Disaster Recovery**          | Cross-region replication d'objets critiques.                 |
| **Distribution de logiciel**   | Package installable, mises à jour OTA.                       |
| **Data exchange / share**      | Échange avec partenaires, datasets ouverts.                  |

### 2.2 — Static website hosting

Configuration :

- Activer le mode **"Static website hosting"** sur le bucket.
- Définir `index.html` et `error.html`.
- Rendre le bucket public (ou utiliser CloudFront avec OAC, **recommandé**).

```bash
aws s3 website s3://my-static-site --index-document index.html --error-document error.html
```

**Pattern moderne** : ne pas exposer le bucket publiquement. Mettre **CloudFront devant** avec OAC (vu en Networking M6).

### 2.3 — Data lake

Structure typique :

```text
s3://data-lake-prod/
├── raw/        ← données brutes (JSON, CSV)
├── silver/     ← données nettoyées (Parquet partitionné)
├── gold/       ← données agrégées prêtes BI
├── archive/    ← données historiques (Glacier)
└── temp/       ← fichiers temporaires (expirent vite)
```

Couplé à Glue Catalog + Athena = **architecture moderne** (vu en Analytics M3-M6).

### 2.4 — Backups & snapshots

Bucket dédié, versioning activé, lifecycle vers Glacier, Object Lock pour compliance.

### 2.5 — Event-driven

S3 émet des événements vers :

- **Lambda** (pattern le plus courant).
- **SNS topic**.
- **SQS queue**.
- **EventBridge**.

```bash
aws s3api put-bucket-notification-configuration \
  --bucket my-bucket \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:eu-west-1:ACCOUNT:function:on-s3-upload",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "uploads/"}]}}
    }]
  }'
```

Pattern : `upload → S3 → Lambda → traitement → S3 sortie`.

### 2.6 — Cas d'usage non recommandés

| Mauvais cas                      | Mieux                         |
| -------------------------------- | ----------------------------- |
| Stockage de session utilisateur  | Redis (ElastiCache), DynamoDB |
| Filesystem POSIX pour app legacy | EFS                           |
| Base transactionnelle            | RDS, DynamoDB                 |
| Cache à très haute fréquence     | Redis, CloudFront             |
| Streaming temps réel             | Kinesis Data Streams          |

---

## 3. Choisir une classe de stockage (item N2 explicite)

C'est **l'item N2 explicite** : conseiller la bonne classe.

### 3.1 — Récap des classes (cf. M1)

| Classe                                 | Quand l'utiliser                            |
| -------------------------------------- | ------------------------------------------- |
| **S3 Standard**                        | Accès fréquent, latence ms.                 |
| **S3 Intelligent-Tiering**             | Pattern d'accès inconnu / variable.         |
| **S3 Standard-IA** (Infrequent Access) | Accès rare immédiat, ≥ 3 AZ.                |
| **S3 One Zone-IA**                     | Idem mais 1 AZ (moins cher, moins durable). |
| **S3 Express One Zone**                | Très haute perf, < 10 ms, 1 AZ.             |
| **S3 Glacier Instant Retrieval**       | Archive accès immédiat (ms).                |
| **S3 Glacier Flexible Retrieval**      | Archive accès minutes-heures.               |
| **S3 Glacier Deep Archive**            | Ultra-froid, accès 12-48h.                  |

### 3.2 — Méthode de choix

Quatre questions :

1. **À quelle fréquence on accède** ?
2. **Quelle latence d'accès** acceptable ?
3. **Quelle durabilité** exigée (3 AZ vs 1 AZ) ?
4. **Pattern stable** ou **inconnu** ?

```text
À quelle fréquence ?
  ├─ Plusieurs fois/jour → Standard
  ├─ Variable / inconnu → Intelligent-Tiering
  ├─ Rare (≤ 1/mois)
  │   ├─ Latence ms acceptable
  │   │   ├─ Besoin 3 AZ → Standard-IA
  │   │   └─ Acceptable 1 AZ → One Zone-IA
  │   └─ Archive
  │       ├─ Accès immédiat (ms) → Glacier IR
  │       ├─ Accès en minutes-heures → Glacier FR
  │       └─ Accès en 12-48h → Glacier Deep Archive
```

### 3.3 — Cas concrets

| Cas                                                         | Classe                                 |
| ----------------------------------------------------------- | -------------------------------------- |
| Images produits e-commerce (accès quotidien)                | Standard                               |
| Avatars utilisateur (accès fréquent au début, rare ensuite) | **Intelligent-Tiering**                |
| Logs applicatifs (consultés rarement)                       | Standard puis IA après 30j (lifecycle) |
| Backups RDS quotidiens                                      | Standard-IA                            |
| Vidéos d'archive marketing                                  | Glacier IR ou FR                       |
| Audit log légal 7 ans                                       | Glacier Deep Archive                   |
| Cache temporaire (1h)                                       | Standard (avec expiration)             |
| Datasets ML rarement réentraînés                            | Glacier IR                             |

### 3.4 — Intelligent-Tiering — le défaut moderne

Quand on ne sait pas, **Intelligent-Tiering**. AWS bouge les objets entre tiers automatiquement :

- **Frequent Access** (depuis upload).
- **Infrequent Access** (après 30 jours sans accès).
- **Archive Instant** (après 90 jours).
- **Archive Access** / **Deep Archive** (optionnel, configurable).

Coût : storage moins cher + ~0,0025 $/1000 objets/mois de monitoring.

Recommandé pour la plupart des cas où le pattern n'est pas évident.

### 3.5 — Spécifier une classe à l'upload

```bash
aws s3 cp file.txt s3://my-bucket/ --storage-class STANDARD_IA
aws s3 cp file.txt s3://my-bucket/ --storage-class GLACIER_IR
aws s3 cp file.txt s3://my-bucket/ --storage-class INTELLIGENT_TIERING
```

Ou via SDK :

```python
import boto3
s3 = boto3.client('s3')
s3.put_object(
    Bucket='my-bucket',
    Key='file.txt',
    Body=open('file.txt', 'rb'),
    StorageClass='INTELLIGENT_TIERING'
)
```

---

## 4. Lifecycle Policy (item N2 explicite)

C'est **l'item N2 explicite** : expliquer l'intérêt d'une lifecycle policy.

### 4.1 — Définition

> Une **Lifecycle Policy** est un ensemble de **règles** attachées à un bucket qui automatisent :
>
> - Les **transitions** d'objets entre classes de stockage (Standard → IA → Glacier).
> - Les **expirations** d'objets (suppression automatique).

### 4.2 — L'intérêt

| Bénéfice                          | Détail                                           |
| --------------------------------- | ------------------------------------------------ |
| **Optimisation coût automatique** | Vieux objets glissent vers classes moins chères. |
| **Pas d'intervention humaine**    | Aucun cron / script à maintenir.                 |
| **Compliance**                    | Suppression auto après période légale.           |
| **Hygiène**                       | Pas d'objets oubliés qui coûtent.                |
| **Versions multiples gérables**   | Versions non-courantes expirent automatiquement. |

### 4.3 — Structure d'une règle

```json
{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER_IR" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": {
        "Days": 2555
      }
    }
  ]
}
```

Lecture :

- Objets sous `logs/` :
  - À J+30 : transitent en **Standard-IA**.
  - À J+90 : transitent en **Glacier Instant Retrieval**.
  - À J+365 : transitent en **Deep Archive**.
  - À J+2555 (7 ans) : **supprimés**.

### 4.4 — Filtres

Une règle peut filtrer par :

- **`Prefix`** : `logs/`, `users/avatars/`.
- **`Tags`** : objets avec tag `environment=prod`.
- **`ObjectSizeGreaterThan`** / `LessThan` : par taille.
- Combinaison via `And`.

```json
"Filter": {
  "And": {
    "Prefix": "logs/",
    "Tags": [{"Key": "retention", "Value": "long"}],
    "ObjectSizeGreaterThan": 1024
  }
}
```

### 4.5 — Transitions — règles minimales

AWS impose des durées minimales :

- **Standard → IA** : minimum **30 jours**.
- **IA → Glacier** : pas de minimum.
- **Standard → Glacier** : OK directement.

### 4.6 — Expiration des versions non-courantes

Si versioning activé (section 5), une règle peut cibler les **versions non-current** :

```json
{
  "NoncurrentVersionTransitions": [
    { "NoncurrentDays": 30, "StorageClass": "STANDARD_IA" }
  ],
  "NoncurrentVersionExpiration": {
    "NoncurrentDays": 365
  }
}
```

→ Les anciennes versions deviennent IA après 30j et sont supprimées après 1 an.

### 4.7 — Suppression des markers et incomplete multiparts

```json
{
  "Expiration": {
    "ExpiredObjectDeleteMarker": true
  },
  "AbortIncompleteMultipartUpload": {
    "DaysAfterInitiation": 7
  }
}
```

- **DeleteMarker expiration** : nettoie les "tombstones" du versioning quand toutes les versions sont supprimées.
- **AbortIncompleteMultipartUpload** : nettoie les uploads multipart **non finalisés** (coût caché courant).

### 4.8 — Coûts économisés — exemple chiffré

Bucket de **10 TB** de logs, sans lifecycle :

- Standard : 10 240 GB × 0,023 $ = **~235 $/mois**.

Avec lifecycle :

- 0-30j : ~1 TB en Standard → 23 $.
- 30-90j : ~2 TB en IA → 25 $.
- 90-365j : ~5 TB en Glacier IR → 20 $.
- > 365j : ~2 TB en Deep Archive → 2 $.
- **Total : ~70 $/mois** (~70 % d'économie).

Avec lifecycle bien fait, **70-90 % d'économie** sur les bons workloads.

### 4.9 — Configurer une lifecycle policy

```bash
cat > lifecycle.json <<EOF
{
  "Rules": [{
    "ID": "tp-tiering",
    "Status": "Enabled",
    "Filter": {"Prefix": "logs/"},
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 90, "StorageClass": "GLACIER_IR"}
    ],
    "Expiration": {"Days": 365}
  }]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration file://lifecycle.json
```

---

## 5. Versioning (item N2 explicite)

C'est **l'item N2 explicite** : avantages et inconvénients.

### 5.1 — Définition

Quand le **versioning est activé** sur un bucket, **chaque écriture** d'un objet crée une **nouvelle version**. Les versions précédentes ne sont **pas supprimées** : elles sont conservées avec un **Version ID** unique.

```text
PUT my-bucket/file.txt  → version v1 (la "current")
PUT my-bucket/file.txt  → version v2 (la nouvelle current, v1 conservée)
DELETE my-bucket/file.txt → Delete Marker créé (l'objet semble disparu)
                            v1 et v2 toujours dans le bucket
```

### 5.2 — Trois états

| État                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| **Disabled** (défaut) | Comportement classique, pas de versioning.              |
| **Enabled**           | Chaque écriture crée une version.                       |
| **Suspended**         | Plus de nouvelles versions, mais les anciennes restent. |

**Important** : une fois activé, **on ne peut pas revenir à "Disabled"**. On peut seulement "Suspend".

### 5.3 — Configurer

```bash
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled
```

### 5.4 — Avantages du versioning

| Avantage                                          | Détail                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| **Protection contre la suppression accidentelle** | Un `DELETE` ne détruit pas l'objet, crée un marker. |
| **Protection contre l'écrasement involontaire**   | `PUT` sur la même key crée une nouvelle version.    |
| **Récupération de données**                       | Restorer une version précédente en cas d'erreur.    |
| **Audit**                                         | Historique de toutes les écritures.                 |
| **Compliance**                                    | Combiné à Object Lock : immutabilité légale.        |
| **Réplication cross-region**                      | CRR exige versioning activé.                        |

### 5.5 — Inconvénients du versioning

| Inconvénient                                       | Détail                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- |
| **Coût** : chaque version compte au stockage.      | Bucket avec 100 versions d'un fichier = 100× coût.              |
| **Complexité** opérationnelle                      | Lister, restorer, supprimer définitivement : APIs différentes.  |
| **Inertie** d'opérations en masse                  | Supprimer définitivement N versions demande du code.            |
| **Lifecycle obligatoire** pour contrôler les coûts | Sans expiration des versions non-current, croissance illimitée. |
| **Pas réversible** vers Disabled                   | Suspended au mieux.                                             |
| **Gestion plus complexe** pour les apps            | L'app doit gérer les Version IDs explicitement parfois.         |

### 5.6 — Quand activer / ne pas activer

**Activer** :

- **Buckets de production sérieux** (data, config, code).
- **Buckets d'archive** + Object Lock.
- **Buckets répliqués** (CRR obligatoire).
- **Buckets sensibles** (RGPD, compliance).

**Ne pas activer** :

- **Buckets temporaires** (caches courts, exports jetables).
- **Buckets très haut trafic d'écriture** sans besoin de versioning (chaque PUT × N versions = coût explosif).
- **Buckets de logs** déjà append-only et lifecycle vers Glacier.

### 5.7 — Lifecycle + Versioning — la combo gagnante

```json
{
  "Rules": [
    {
      "ID": "manage-versions",
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "STANDARD_IA" },
        { "NoncurrentDays": 90, "StorageClass": "GLACIER_IR" }
      ],
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 365
      }
    }
  ]
}
```

→ Les anciennes versions glissent vers des classes moins chères et expirent après 1 an. Coût maîtrisé.

### 5.8 — Récupérer une version

```bash
# Lister les versions
aws s3api list-object-versions \
  --bucket my-bucket --prefix file.txt

# Télécharger une version précise
aws s3api get-object \
  --bucket my-bucket --key file.txt \
  --version-id <VERSION_ID> /tmp/restored.txt

# Restorer une version comme current (la copier sur elle-même)
aws s3 cp s3://my-bucket/file.txt s3://my-bucket/file.txt \
  --version-id <VERSION_ID>
```

### 5.9 — MFA Delete

Option additionnelle : exiger un **token MFA** pour supprimer une version ou désactiver le versioning.

```bash
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration "Status=Enabled,MFADelete=Enabled" \
  --mfa "arn:aws:iam::ACCOUNT:mfa/admin 123456"
```

Sécurité maximale : ransomware ou compromission ne peut pas vider le bucket.

---

## 6. Pratique — bucket avec lifecycle + versioning (item du glossaire)

L'item de glossaire pratique : créer un bucket complet avec les bonnes pratiques.

### 6.1 — Plan

1. Créer le bucket.
2. Activer le versioning.
3. Activer le chiffrement KMS (rappel M10 Identity).
4. Configurer une lifecycle policy.
5. Uploader des objets et tester.
6. Tester la récupération de version.

### 6.2 — Étape 1 — Créer le bucket

```bash
BUCKET=tp-storage-m6-$(date +%s)
aws s3 mb s3://$BUCKET --region eu-west-1

# Block public access par défaut
aws s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 6.3 — Étape 2 — Activer le versioning

```bash
aws s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled

# Vérifier
aws s3api get-bucket-versioning --bucket $BUCKET
# → {"Status": "Enabled"}
```

### 6.4 — Étape 3 — Chiffrement par défaut

```bash
aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "alias/aws/s3"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

### 6.5 — Étape 4 — Lifecycle policy

```bash
cat > lifecycle.json <<EOF
{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Status": "Enabled",
      "Filter": {"Prefix": "logs/"},
      "Transitions": [
        {"Days": 30, "StorageClass": "STANDARD_IA"},
        {"Days": 90, "StorageClass": "GLACIER_IR"}
      ],
      "Expiration": {"Days": 365}
    },
    {
      "ID": "manage-noncurrent-versions",
      "Status": "Enabled",
      "Filter": {},
      "NoncurrentVersionTransitions": [
        {"NoncurrentDays": 30, "StorageClass": "STANDARD_IA"}
      ],
      "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
    },
    {
      "ID": "cleanup-multipart",
      "Status": "Enabled",
      "Filter": {},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    },
    {
      "ID": "delete-temp",
      "Status": "Enabled",
      "Filter": {"Prefix": "temp/"},
      "Expiration": {"Days": 7}
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET \
  --lifecycle-configuration file://lifecycle.json
```

Vérifier :

```bash
aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET
```

### 6.6 — Étape 5 — Uploader et tester

```bash
# v1
echo "Hello v1" > /tmp/file.txt
aws s3 cp /tmp/file.txt s3://$BUCKET/test/file.txt

# v2 (nouvelle version)
echo "Hello v2 modified" > /tmp/file.txt
aws s3 cp /tmp/file.txt s3://$BUCKET/test/file.txt

# v3
echo "Hello v3 again" > /tmp/file.txt
aws s3 cp /tmp/file.txt s3://$BUCKET/test/file.txt

# Lister les versions
aws s3api list-object-versions \
  --bucket $BUCKET --prefix test/file.txt
```

Sortie attendue :

```json
{
  "Versions": [
    { "Key": "test/file.txt", "VersionId": "v3...", "IsLatest": true },
    { "Key": "test/file.txt", "VersionId": "v2...", "IsLatest": false },
    { "Key": "test/file.txt", "VersionId": "v1...", "IsLatest": false }
  ]
}
```

### 6.7 — Étape 6 — Restaurer une version

```bash
# Récupérer v1 (la première)
V1_ID=$(aws s3api list-object-versions --bucket $BUCKET --prefix test/file.txt \
  --query 'Versions[?IsLatest==`false`] | [-1].VersionId' --output text)

aws s3api get-object \
  --bucket $BUCKET --key test/file.txt \
  --version-id $V1_ID \
  /tmp/restored.txt

cat /tmp/restored.txt
# → "Hello v1"
```

### 6.8 — Étape 7 — Supprimer "logiquement" et restaurer

```bash
# Supprimer (crée un delete marker)
aws s3 rm s3://$BUCKET/test/file.txt

# L'objet semble disparu
aws s3 ls s3://$BUCKET/test/
# → vide

# Mais les versions existent toujours
aws s3api list-object-versions \
  --bucket $BUCKET --prefix test/file.txt
# → Versions + DeleteMarkers

# Restaurer en supprimant le delete marker
DM_ID=$(aws s3api list-object-versions --bucket $BUCKET --prefix test/file.txt \
  --query 'DeleteMarkers[0].VersionId' --output text)

aws s3api delete-object \
  --bucket $BUCKET --key test/file.txt \
  --version-id $DM_ID

# L'objet est de retour
aws s3 ls s3://$BUCKET/test/
```

### 6.9 — Cleanup

```bash
# Supprimer toutes les versions (sinon le bucket reste non-vide)
aws s3api delete-objects --bucket $BUCKET \
  --delete "$(aws s3api list-object-versions --bucket $BUCKET --output=json --query='{Objects: Versions[].{Key:Key,VersionId:VersionId}}')"

aws s3api delete-objects --bucket $BUCKET \
  --delete "$(aws s3api list-object-versions --bucket $BUCKET --output=json --query='{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}')"

aws s3 rb s3://$BUCKET
```

---

## 7. Sécurité S3 — rappel rapide

Couvert plus en détail en **AWS Identity M10** (KMS, SSE-KMS). Récap pour cohérence :

### 7.1 — Block Public Access

À **toujours activer** sur les nouveaux buckets sauf cas explicite (static website hosting sans CloudFront, ce qui devient rare).

### 7.2 — Bucket policies

Resource-based policy. Voir AWS Identity M4.

### 7.3 — IAM policies sur les utilisateurs

Identity-based policy.

### 7.4 — Chiffrement

- **SSE-S3** : clé gérée par S3.
- **SSE-KMS** : clé KMS (recommandé pour prod).
- **SSE-C** : clé fournie par le client.
- **DSSE-KMS** : double chiffrement.

### 7.5 — Object Lock

**Immutabilité légale** : un objet ne peut **pas être supprimé** pendant N jours/années.

- **Governance mode** : peut être bypassé par un admin avec permissions spéciales.
- **Compliance mode** : **personne** ne peut bypass, même root account.

Cas d'usage : conformité légale, archives audit, contrats.

Activable **à la création** du bucket uniquement.

### 7.6 — Access Logs

Logs S3 → S3 (ou CloudTrail Data Events).

```bash
aws s3api put-bucket-logging --bucket my-bucket \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "my-access-logs",
      "TargetPrefix": "logs/"
    }
  }'
```

---

## 8. Anti-patterns

| Anti-pattern                                                         | Conséquence                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| **Bucket public par défaut**.                                        | Fuite massive de données potentielle.                    |
| **Versioning activé sans lifecycle**.                                | Coût qui explose, anciennes versions accumulées.         |
| **Lifecycle Transition à 1 jour** (sous le minimum 30j Standard→IA). | Erreur de configuration.                                 |
| **Pas d'`AbortIncompleteMultipartUpload`** dans lifecycle.           | Multiparts non finalisés s'accumulent (coût silencieux). |
| **Glacier Deep Archive sur des objets accédés régulièrement**.       | Coût de retrieval qui annule les économies.              |
| **Block Public Access désactivé** "pour tester".                     | Fuite garantie tôt ou tard.                              |
| **Static website hosting** sans CloudFront.                          | Bucket exposé, pas de HTTPS custom domain.               |
| **Tous les objets en Standard** sur de gros buckets.                 | Facture 5-10× trop élevée.                               |
| **Pas de tags** sur les objets / buckets.                            | FinOps impossible.                                       |
| **Pas de chiffrement** par défaut.                                   | Conformité à risque.                                     |
| **Stocker des secrets en clair** dans des objets S3.                 | Fuite si bucket compromis. Utiliser Secrets Manager.     |

---

## 9. Exercices pratiques

### Exercice 1 — Bucket complet avec lifecycle + versioning (≈ 60 min)

**Objectif.** L'item du glossaire pratique.

**Étapes :** suivre la section 6.

**Livrable.** Captures de chaque étape + liste des versions à la fin.

### Exercice 2 — Conseiller des classes (≈ 30 min)

Pour chacun, recommander une classe + lifecycle :

1. Sites web statiques pour SaaS, 50 GB.
2. Logs Lambda archivés, 10 GB/jour.
3. Vidéos formation interne, accédées 1× par employé, 500 GB.
4. Datasets ML mensuels, 2 TB chacun.
5. Photos de profil utilisateur, taille variable, accès fréquent au login.

**Livrable.** Tableau avec classe + transitions lifecycle.

### Exercice 3 — Mesurer l'impact lifecycle (≈ 30 min)

**Cas.** Bucket avec 5 TB de logs, sans lifecycle, coûtant ~115 $/mois en Standard.

**Calculer** le coût après mise en place d'une lifecycle :

- 0-30j : 0,5 TB en Standard.
- 30-90j : 1,5 TB en IA.
- 90-365j : 3 TB en Glacier IR.

**Livrable.** Calcul détaillé + économie.

### Exercice 4 — Tester versioning + récupération (≈ 30 min)

**Étapes :**

1. Bucket versionné.
2. Upload 3 versions d'un même fichier.
3. Supprimer le fichier.
4. **Restaurer** la version v1 spécifiquement.
5. Lister tout l'historique.

**Livrable.** Captures + une phrase sur la différence DeleteMarker vs vraie suppression.

### Exercice 5 — Event-driven Lambda (≈ 45 min)

**Objectif.** S3 → Lambda.

**Étapes :**

1. Créer une Lambda Python qui log les objets uploadés.
2. Configurer le bucket pour notifier la Lambda à chaque PUT sous `uploads/`.
3. Uploader 5 fichiers, vérifier que la Lambda est invoquée.

**Livrable.** Code Lambda + capture des logs CloudWatch.

### Mini-défi — Architecture data archivage (≈ 30 min, papier)

**Cas.** Entreprise stocke :

- Logs applicatifs : 100 GB/jour, conservation 30 jours pour debug, 7 ans légal.
- Backups RDS : snapshots automatiques + manuels mensuels.
- Médias marketing : 500 GB, accès irrégulier.
- Documents légaux : 50 GB, conservation 10 ans, immuables.

**Concevoir** :

1. Bucket(s) ?
2. Classes initiales ?
3. Lifecycle policies détaillées.
4. Versioning et Object Lock où ?
5. Estimation coût mensuel total.

**Livrable.** Architecture + budget.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer **6 cas d'usage** S3 typiques.
- [ ] **Conseiller une classe** pour 3 profils donnés.
- [ ] Définir une **lifecycle policy** et son intérêt.
- [ ] Citer **3 actions** possibles dans une lifecycle (Transitions, Expiration, NoncurrentVersionExpiration, AbortIncompleteMultipart).
- [ ] Énoncer la règle **minimum 30j** pour Standard → IA.
- [ ] Définir le **versioning** et ses **3 états**.
- [ ] Citer **3 avantages** et **3 inconvénients** du versioning.
- [ ] Énoncer la règle "**versioning sans lifecycle = coût explosif**".
- [ ] Distinguer **DeleteMarker** et **suppression définitive** d'une version.
- [ ] **Configurer** un bucket complet (versioning + KMS + lifecycle + block public) de mémoire.
- [ ] Citer **3 anti-patterns** S3 courants.

### Items du glossaire visés

**N2 atteint** :

- _cas d'usage d'un S3_ — section 2.
- _conseiller sur le type de S3 à utiliser selon un besoin donné_ — section 3.
- _intérêt d'une lifecycle policy d'un S3_ — section 4.
- _avantages et inconvénients du versioning dans S3_ — section 5.

---

## 11. Ressources complémentaires

### Documentation AWS

- [S3 Developer Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [S3 Storage Classes](https://aws.amazon.com/s3/storage-classes/)
- [Lifecycle Management](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [S3 Pricing](https://aws.amazon.com/s3/pricing/)

### Outils

- [S3 Storage Lens](https://aws.amazon.com/s3/storage-lens/) — analyse d'usage et recommandations.
- [S3 Inventory](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-inventory.html) — listing périodique d'objets.

### Pour aller plus loin

- **M7 (EBS, EFS, S3)** — comparaison détaillée des storages.
- **M8 (Calcul des coûts)** — méthodologie d'estimation.
- **AWS Identity M10** — chiffrement KMS détaillé.
- **AWS Networking M6** — CloudFront devant S3.
- **Niveau 3** : Multi-region replication, S3 Object Tagging, S3 Inventory, S3 Batch Operations.
