# M6 — CloudFront

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **CloudFront** comme un **CDN** AWS, sa position dans l'architecture (entre les clients et l'origine) et son rôle face à un CDN tiers.
- Expliquer les **pré-requis** pour distribuer du contenu avec CloudFront : une **origine** valide (S3, ALB, custom HTTP), une **distribution**, et optionnellement un **nom de domaine personnalisé** avec **certificat ACM**.
- Énoncer **comment CloudFront optimise la distribution** : maillage de **400+ edge locations**, **cache** au plus près du client, **terminaison TLS** à l'edge, **compression** automatique, **HTTP/2 et HTTP/3**, **connexion persistante AWS backbone** vers l'origine, **shielding** (regional edge cache).
- **Raccorder un nom de domaine** à une distribution : enregistrer un **CNAME alternate domain name**, obtenir un **certificat ACM dans us-east-1**, configurer Route 53 avec un **record ALIAS**.
- Créer une **distribution devant un bucket S3** en respectant les bonnes pratiques (OAC pour bloquer l'accès direct au bucket, HTTPS only, cache adapté).
- Reconnaître les **anti-patterns** (CloudFront devant du contenu jamais cacheable, distribution sans HTTPS, bucket S3 public alors qu'OAC est disponible).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M5 (régions, AZ, VPC, SG, Route 53).
- Bases HTTP/HTTPS : statuts 200/301/304/404, headers `Cache-Control`, `ETag`, `Last-Modified`.
- Connaissance basique de S3 : bucket, objet, ACL/policy.
- AWS CLI v2 et permissions sur CloudFront, S3, ACM, Route 53.

---

## 1. Pourquoi un CDN

### 1.1 — Le problème

Une application servie depuis **une seule région** (par exemple `eu-west-1`) impose à **tous** les utilisateurs de payer la latence Paris ↔ Irlande pour le moindre fichier. Pour un utilisateur en France, c'est ~20 ms. Pour un utilisateur à Tokyo, c'est ~250 ms. Multiplié par 50-100 ressources sur une page web → page lente.

Trois aggravants :

- Les **fichiers statiques** (CSS, JS, images, vidéos, polices) représentent souvent **80 % du volume** d'une page web. Servir tout cela depuis un seul point géographique est inefficace.
- Sans cache, **chaque utilisateur** demande indépendamment **chaque fichier** → coût de bande passante linéaire avec le trafic, charge linéaire sur l'origine.
- Une **panne de l'origine** rend tout le site indisponible.

### 1.2 — Le rôle d'un CDN

Un **CDN** (Content Delivery Network) est un réseau de **serveurs cache** distribués géographiquement, qui se placent **entre les clients et l'origine** :

```
Sans CDN :                                  Avec CDN :

  Client (Tokyo)                              Client (Tokyo)
      │                                           │
      │ 250 ms                                    │ 5 ms
      ▼                                           ▼
  Origine (eu-west-1)                         Edge location CloudFront (Tokyo)
                                                  │
                                                  │ cache miss : 250 ms
                                                  ▼
                                              Origine (eu-west-1)
                                              (90 % des objets sont en cache → 0 ms de moyenne)
```

L'effet :

- **Latence** : les utilisateurs téléchargent depuis l'edge le plus proche (~5-50 ms typique vs 100-300 ms depuis l'origine).
- **Bande passante origine** : divisée par 10-100, l'origine ne sert qu'aux cache miss.
- **Disponibilité** : les utilisateurs ont accès aux objets cachés même si l'origine est down (selon configuration).
- **Coût** : la bande passante depuis CloudFront est **moins chère** que la bande passante directe EC2 / S3 (paradoxalement).

### 1.3 — CloudFront vs autres CDN

CloudFront est le CDN d'AWS. Concurrents principaux : **Cloudflare**, **Akamai**, **Fastly**, **bunny.net**.

| Critère                | CloudFront                                                  | Concurrents (Cloudflare, Fastly, …)                                                      |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Intégration AWS        | Native (OAC vers S3, ALIAS Route 53, ACM)                   | Plus de friction                                                                         |
| Tarification           | Pay-per-use, sans plan fixe                                 | Souvent plan + quotas                                                                    |
| Couverture             | ~400 edge locations dans 90+ pays                           | Variable (Cloudflare ~300, Akamai 4000)                                                  |
| Configuration          | API/CLI/Terraform                                           | Souvent UI plus poussée                                                                  |
| Cas d'usage par défaut | Si tout est AWS et qu'on veut éviter une dépendance externe | Si on veut une UI / des features spécifiques (WAF/anti-DDoS plus mature chez Cloudflare) |

Dans un parcours AWS, par défaut on prend CloudFront.

### 1.4 — L'analogie de l'épicerie de quartier

Une **épicerie de quartier** (edge location) stocke les produits les plus demandés (cache). Quand un client demande un produit :

- Si le produit est en rayon (cache hit) : livraison immédiate.
- Si le produit n'y est pas (cache miss) : l'épicerie commande à l'**entrepôt central** (origine), reçoit le produit, le met en rayon, et le donne au client. Le prochain client aura le produit immédiatement.

Quelques propriétés :

- Plus l'épicerie est **proche** du client, plus la livraison est rapide.
- Plus les produits sont **populaires**, plus le taux de cache hit est élevé.
- Le **réapprovisionnement** depuis l'entrepôt central est rapide grâce à un **réseau privé** dédié (le **backbone AWS**), pas via la route publique.

---

## 2. Anatomie d'une distribution CloudFront

### 2.1 — Vocabulaire

| Terme                                   | Définition                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| **Distribution**                        | L'objet CloudFront qui regroupe configuration, origines, comportements.          |
| **Origin** (origine)                    | La source du contenu : S3 bucket, ALB, EC2 publique, custom HTTP.                |
| **Edge location**                       | Un point de présence (PoP) où CloudFront cache les objets — ~400 dans le monde.  |
| **Regional edge cache** (Origin Shield) | Un cache intermédiaire entre edge et origine, par région.                        |
| **Behavior** (comportement)             | Une règle de routage et de cache, basée sur un path pattern (`/images/*`, `/*`). |
| **Cache policy**                        | Configuration de ce qui détermine la **clé de cache** et le **TTL**.             |
| **Origin request policy**               | Configuration de ce qui est transmis à l'origine en cas de cache miss.           |
| **Alternate domain name (CNAME)**       | Le nom personnalisé sous lequel exposer la distribution.                         |
| **ACM certificate**                     | Certificat TLS pour servir HTTPS sur l'alternate domain name.                    |

### 2.2 — Schéma d'ensemble

```
                                Client
                                  │
                                  │ HTTPS request
                                  ▼
                       ┌─────────────────────┐
                       │ Edge location       │
                       │ (la plus proche)    │
                       └──────────┬──────────┘
                                  │
                       cache hit  │ cache miss
                       (réponse   │ (forward)
                       immédiate) │
                                  ▼
                       ┌─────────────────────┐
                       │ Regional edge cache │  (Origin Shield, optionnel)
                       └──────────┬──────────┘
                                  │ cache miss
                                  ▼
                       ┌─────────────────────┐
                       │ Origin              │  (S3 / ALB / EC2 / custom)
                       └─────────────────────┘
```

Trois niveaux de cache : edge local, regional edge cache, origin shield. La requête remonte jusqu'à l'origine **seulement** si tout est manqué.

### 2.3 — Une distribution = une seule URL CloudFront

Chaque distribution reçoit un nom AWS du type `d111111abcdef8.cloudfront.net`. C'est l'URL canonique. **Sans** alternate domain name configuré, on accède à la distribution via cette URL. **Avec** alternate domain name (et certificat ACM), on accède via `assets.example.com` (par exemple).

### 2.4 — Pré-requis pour distribuer du contenu

C'est précisément l'item N1 du glossaire. Trois choses sont nécessaires :

1. **Une origine valide** : S3 bucket accessible (via OAC ou public), ALB / NLB / EC2 publique accessible par CloudFront, ou un serveur HTTP custom (n'importe où).
2. **Une distribution** créée avec au moins une origine et un comportement par défaut (`Default (*)`).
3. **Optionnel mais standard** : un **nom de domaine personnalisé** + un **certificat ACM dans us-east-1**.

C'est tout. Une fois ces éléments en place, CloudFront se déploie en quelques minutes sur les 400+ edges.

---

## 3. Comment CloudFront optimise la distribution

C'est **l'autre item N1 explicite** du glossaire. Six leviers d'optimisation à connaître.

### 3.1 — Le maillage global d'edge locations

CloudFront opère **400+ Points of Presence** dans 90+ pays. Quand un client résout `d111111.cloudfront.net`, le DNS AWS lui donne l'IP de l'edge **le plus proche** (en latence, via Anycast).

Effet : pour 90 % de la population mondiale, l'edge le plus proche est à **moins de 50 ms**.

### 3.2 — Le cache au plus près du client

Une requête sur un fichier statique populaire (par exemple `style.css`) :

- 1ʳᵉ requête depuis Paris → cache miss → CloudFront va chercher à l'origine → réponse + stockage dans l'edge de Paris.
- 2ᵉ requête depuis Paris (n'importe quel client) → **cache hit immédiat** depuis l'edge de Paris.

Plus le contenu est **stable** et **populaire**, plus le cache est efficace. Pour un site qui sert 1000 fois le même `style.css` à 1000 clients différents, seule **la 1ʳᵉ** atteint l'origine.

### 3.3 — Terminaison TLS à l'edge

Le handshake TLS coûte 1-2 aller-retours réseau. Si l'origine est en Irlande et le client à Tokyo, c'est 500-1000 ms juste pour établir HTTPS.

Avec CloudFront, la connexion TLS est **terminée à l'edge** de Tokyo (proche du client). Puis CloudFront ouvre — ou réutilise — une **connexion persistante** sur le backbone AWS jusqu'à l'origine. Gain : ~300-700 ms par session HTTPS pour des clients lointains.

### 3.4 — Connexions persistantes via le backbone AWS

CloudFront maintient des **connexions HTTP persistantes** (HTTP/1.1 keep-alive, HTTP/2) entre les edges et les origines, **sur le réseau privé AWS** (backbone). Trois bénéfices :

- **Pas de réétablissement TCP** à chaque requête → ~50-200 ms économisés.
- **Backbone AWS** : peering optimal, faible perte de paquets, moins de hops.
- **Mutualisation** : plusieurs requêtes utilisateurs partagent les mêmes connexions origine.

### 3.5 — Compression et HTTP/2-3

CloudFront supporte :

- **Compression automatique** : si le contenu est compressible (CSS, JS, JSON, HTML, …), CloudFront le compresse en gzip / brotli avant de le servir. Réduction typique : 60-80 % du volume.
- **HTTP/2** : multiplexage de plusieurs requêtes sur une seule connexion. Réduit la latence apparente pour des pages avec beaucoup d'assets.
- **HTTP/3 (QUIC)** : transport sur UDP, encore plus rapide sur réseaux mobiles instables. Activable par option.

### 3.6 — Origin Shield (cache régional)

Une couche de cache **entre l'edge local et l'origine**, configurable par région. Utile quand on a beaucoup d'edges qui appellent la même origine : Origin Shield mutualise leurs requêtes en une seule vers l'origine.

Bénéfice : **réduction supplémentaire de la charge origine** d'un facteur 2-10 pour des distributions à très haut trafic. Optionnel, légèrement payant.

### 3.7 — Récapitulatif — pourquoi CloudFront est rapide

| Levier                           | Gain typique                                         |
| -------------------------------- | ---------------------------------------------------- |
| Maillage 400+ edges              | Latence client → edge : -100 à -200 ms               |
| Cache au plus près               | -100 ms par fichier servi en cache hit               |
| Terminaison TLS à l'edge         | -300 à -700 ms par handshake (clients lointains)     |
| Connexions persistantes backbone | -50 à -200 ms                                        |
| Compression                      | -60 à -80 % du volume = chargement plus rapide       |
| HTTP/2-3                         | Multiplexage : -200 à -500 ms sur pages multi-assets |
| Origin Shield                    | Charge origine -50 à -90 %                           |

Pour un site moyen, CloudFront fait gagner **1 à 3 secondes** de temps de chargement perçu.

---

## 4. Les origines

### 4.1 — S3 bucket comme origine

Le cas le plus courant. CloudFront se place **devant** un bucket S3 statique (site web, assets, vidéos, downloads).

Deux variantes :

- **Bucket public + Origin Access "Public"** : tout le monde peut accéder au bucket directement. Déconseillé.
- **Bucket privé + Origin Access Control (OAC)** : seul CloudFront peut accéder au bucket. La bonne pratique.

**OAC** remplace l'ancien **OAI** (Origin Access Identity) depuis 2022. OAC est plus complet (support de KMS, SSE-KMS, etc.) et c'est le **standard recommandé**.

Avec OAC :

- Le bucket n'est **pas public**.
- Une **bucket policy** autorise spécifiquement le service principal `cloudfront.amazonaws.com` à `GetObject` **uniquement** depuis la distribution donnée.
- Les utilisateurs accèdent au contenu **via CloudFront** (HTTPS, edge, cache), **jamais directement** au bucket.

### 4.2 — ALB / EC2 / custom HTTP comme origine

CloudFront peut aussi se mettre devant un **ALB** (ou n'importe quel endpoint HTTP/HTTPS). Cas typiques :

- **API publique** : cacher les réponses fréquentes (catalog, prix publics, etc.) pour réduire la charge de l'API.
- **Site web dynamique** : cacher les ressources statiques et faire passer les routes dynamiques avec un TTL plus court.
- **Vidéo streaming** : CloudFront comme front d'un media server.

L'origine n'a **pas besoin d'être dans AWS**. CloudFront accepte un nom de domaine HTTP/HTTPS quelconque.

**Recommandé** : authentifier la connexion CloudFront → origin pour éviter qu'on bypass CloudFront en attaquant directement l'origine. Méthodes :

- **Custom header secret** : CloudFront ajoute un header (`X-CloudFront-Auth: secret`), l'origine refuse les requêtes sans ce header.
- **SG ALB restreint** : autoriser uniquement les CIDR CloudFront (publiés par AWS).
- **AWS WAF** sur la distribution + ALB derrière.

### 4.3 — Multi-origine

Une distribution peut avoir **plusieurs origines** et router selon le path :

```
Distribution example.com
├── Default behavior (*)            → S3 bucket assets
├── Behavior /api/*                 → ALB backend
└── Behavior /media/*               → S3 bucket media (different bucket)
```

Permet de mettre **toutes les URLs sous un seul domaine** tout en ayant **plusieurs origines** physiques.

---

## 5. Cache, clé de cache, invalidations

### 5.1 — TTL et headers HTTP

Trois headers gouvernent le cache :

- **`Cache-Control: max-age=86400`** : le client (et CloudFront) peuvent cacher pour 86400 secondes (24 h).
- **`Cache-Control: no-cache`** : revalider auprès de l'origine avant de servir.
- **`Cache-Control: no-store`** : ne pas cacher du tout.

CloudFront combine **deux** sources de TTL :

1. Le `Cache-Control` envoyé par l'origine.
2. Les **min/default/max TTL** configurés sur la distribution (cache policy).

Si l'origine n'envoie pas de `Cache-Control`, CloudFront utilise le **default TTL** (par défaut 1 jour).

### 5.2 — Clé de cache — ce qui rend une entrée unique

CloudFront identifie un objet en cache par sa **clé de cache**, composée par défaut de :

- L'URL (sans query string).
- Le path.

Optionnellement, on peut inclure dans la clé :

- Certaines **query strings** spécifiques (ex. `?lang=fr`).
- Certains **headers** (ex. `Accept-Language`).
- Certains **cookies** (rarement).

**Attention** : ajouter des éléments à la clé **fragmente le cache**. Si on inclut `Accept-Language` qui prend 30 valeurs, on a 30 fois plus d'entrées de cache, donc 30 fois plus de cache miss. À utiliser avec parcimonie.

### 5.3 — Invalidation

Quand on déploie une nouvelle version d'un fichier, le cache CloudFront sert **encore l'ancien** jusqu'à expiration du TTL. Trois solutions :

1. **Attendre l'expiration** (si TTL court).
2. **Versionner les fichiers** dans l'URL (`/css/style.v42.css`) → la nouvelle version a une nouvelle URL, pas de problème de cache.
3. **Invalider explicitement** : `aws cloudfront create-invalidation --distribution-id ... --paths "/css/style.css"`. Force le ré-fetch.

**Tarif invalidation** : 1000 paths/mois gratuits, ensuite 0,005 $/path. **À utiliser avec parcimonie** — préférer le versioning des assets.

**Pattern recommandé pour les sites web :**

- Assets versionnés (`/static/[hash]/style.css`) → TTL très long (1 an), pas d'invalidation jamais.
- HTML → TTL court (60 s) ou no-cache, pour qu'un déploiement soit visible rapidement.

---

## 6. Sécurité — HTTPS, OAC, WAF

### 6.1 — HTTPS partout

Trois interactions HTTPS distinctes :

1. **Client → CloudFront** : recommandation forte HTTPS only. Configurable via "Viewer Protocol Policy" (HTTPS only ou Redirect HTTP to HTTPS).
2. **CloudFront → origine** : configurable indépendamment. Bonnes pratiques : HTTPS only quand l'origine le supporte (S3, ALB avec cert ACM).
3. **TLS version** : minimum TLS 1.2 recommandé (TLS 1.0/1.1 dépréciés).

### 6.2 — Origin Access Control (OAC)

Comme vu en 4.1, OAC permet à un bucket S3 de n'être accessible **que** depuis CloudFront. Le pattern minimal :

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST-ID"
        }
      }
    }
  ]
}
```

Lecture : "Le bucket autorise CloudFront, mais **seulement** la distribution DIST-ID, à faire des GetObject."

Cela ferme la voie aux téléchargements directs depuis l'URL S3 (qui contourneraient cache, logs, sécurité CloudFront).

### 6.3 — Signed URLs et Signed Cookies

Pour **restreindre** l'accès à du contenu (vidéos premium, downloads payants), CloudFront supporte :

- **Signed URLs** : URL temporaire, valide pour une période et/ou une IP donnée.
- **Signed Cookies** : cookie HTTP qui autorise l'accès à un ensemble d'URLs sans avoir à signer chacune.

Génération via SDK (PHP, JS, Python). Utile pour SaaS de media, plateformes d'apprentissage en ligne, etc.

### 6.4 — AWS WAF

Une **Web Application Firewall** peut être attachée directement à une distribution CloudFront. Filtre les requêtes selon des règles (IP blocking, géo blocking, SQL injection, XSS, rate limiting).

**Coût** : ~5 $/mois pour le Web ACL + 1 $/règle + 0,60 $/million de requêtes inspectées.

Recommandé pour toute distribution publique sérieuse. Hors scope du module ; à connaître.

### 6.5 — Shield

**AWS Shield Standard** : protection DDoS de base **automatique et gratuite** sur toutes les distributions CloudFront. Protège contre les attaques L3/L4 classiques (SYN flood, UDP reflection, etc.).

**AWS Shield Advanced** : 3000 $/mois + features avancées (DDoS Response Team, protection L7, garanties financières). Pour très gros sites.

---

## 7. Raccordement d'un nom de domaine

C'est **l'item N2** central du module. Le scénario : exposer une distribution sous `assets.example.com` au lieu de `d111111.cloudfront.net`.

### 7.1 — Les quatre étapes

1. **Obtenir un certificat ACM** pour `assets.example.com` (ou un wildcard `*.example.com`). **Doit être dans la région `us-east-1`** quel que soit le pays de la distribution — c'est une contrainte CloudFront.
2. **Ajouter le nom comme "Alternate Domain Name (CNAME)"** dans la configuration de la distribution.
3. **Sélectionner le certificat ACM** dans la distribution.
4. **Créer un record DNS ALIAS** dans Route 53 (ou un CNAME si DNS tiers) pointant `assets.example.com` vers `d111111.cloudfront.net`.

### 7.2 — Obtenir un certificat ACM dans us-east-1

```bash
# Demander un certificat (DNS validation recommandée)
aws acm request-certificate \
  --region us-east-1 \
  --domain-name assets.example.com \
  --validation-method DNS \
  --tags Key=Name,Value=cf-assets-cert

# Récupérer l'ID et le record de validation
aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn arn:aws:acm:us-east-1:...:certificate/abc
```

ACM renvoie un **CNAME de validation** à ajouter dans la hosted zone Route 53. Une fois ajouté, ACM valide le domaine et émet le certificat (~5-15 min).

**Note** : si la hosted zone est dans Route 53, la console ACM propose un bouton **"Create record in Route 53"** qui automatise la validation. Pratique.

**Pourquoi us-east-1 ?** CloudFront étant un service "edge" global, AWS a centralisé ses certificats dans une seule région. Historiquement `us-east-1`. C'est une particularité à connaître.

### 7.3 — Ajouter l'alternate domain name à la distribution

Soit via la console (Edit Distribution → Alternate Domain Names), soit via CLI :

```bash
aws cloudfront get-distribution-config \
  --id DIST-ID > config.json
# Modifier le JSON : ajouter Aliases.Quantity et Items, ajouter ViewerCertificate.ACMCertificateArn
aws cloudfront update-distribution \
  --id DIST-ID \
  --if-match "ETAG_FROM_GET" \
  --distribution-config file://config-modifie.json
```

### 7.4 — Créer le record Route 53

Si la hosted zone est en Route 53 :

```bash
HOSTED_ZONE_ID=Z123ABC456

cat > change.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "assets.example.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "d111111abcdef8.cloudfront.net",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://change.json
```

Notes :

- `HostedZoneId: Z2FDTNDATAQYW2` est l'ID **constant** de CloudFront pour les ALIAS — à mémoriser ou à retrouver dans la doc.
- ALIAS plutôt que CNAME : gratuit, utilisable au sommet du domaine (si on veut `example.com` direct sans `www`).

Si la hosted zone est ailleurs (OVH, Gandi, etc.) : créer un **CNAME** `assets.example.com → d111111.cloudfront.net`. Fonctionne aussi, mais avec les limitations CNAME (pas au sommet du domaine).

### 7.5 — Vérification

```bash
dig +short assets.example.com
# → IPs CloudFront (par exemple 13.32.X.Y, 13.32.X.Z, …)

curl -I https://assets.example.com/style.css
# → HTTP/2 200, x-cache: Hit from cloudfront (après 1ère requête)
```

---

## 8. Pas à pas — CloudFront devant S3 (mini-projet pratique)

L'objectif de cette section : **construire de bout en bout** une distribution CloudFront devant un bucket S3, avec OAC, alternate domain name, et certificat ACM.

### 8.1 — Plan

1. Créer un bucket S3 privé `assets-myproject` en `eu-west-1`.
2. Uploader quelques fichiers de test (`index.html`, `style.css`, une image).
3. Créer un certificat ACM dans `us-east-1` pour `assets.example.com`.
4. Valider le certificat via Route 53.
5. Créer une **Origin Access Control (OAC)** dans CloudFront.
6. Créer la distribution CloudFront avec :
   - Origine : le bucket S3 (via OAC, pas via "S3 website endpoint").
   - Default cache behavior : HTTPS only, compression auto.
   - Alternate domain name : `assets.example.com`.
   - Certificat ACM : celui créé en étape 3.
7. Mettre à jour la **bucket policy** S3 pour autoriser l'OAC.
8. Créer le record Route 53 ALIAS.
9. Tester.

### 8.2 — Script CLI

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION_S3=eu-west-1
REGION_ACM=us-east-1
BUCKET=assets-myproject
DOMAIN=assets.example.com
HOSTED_ZONE_ID=Z123ABC456

# 1. Bucket S3 privé
aws s3 mb s3://$BUCKET --region $REGION_S3
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 2. Quelques fichiers
echo "<h1>Hello CloudFront</h1>" > /tmp/index.html
echo "h1 { color: rebeccapurple; }" > /tmp/style.css
aws s3 cp /tmp/index.html s3://$BUCKET/index.html --content-type text/html
aws s3 cp /tmp/style.css  s3://$BUCKET/style.css  --content-type text/css

# 3. Certificat ACM (DNS validation)
CERT_ARN=$(aws acm request-certificate \
  --region $REGION_ACM \
  --domain-name $DOMAIN \
  --validation-method DNS \
  --query 'CertificateArn' --output text)
echo "Cert ARN : $CERT_ARN"
echo "[Attendre 10 s pour la génération du record de validation]"
sleep 10

# 4. Récupérer le record de validation et l'ajouter à Route 53
VALIDATION_RECORD=$(aws acm describe-certificate \
  --region $REGION_ACM \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json)
# (en pratique, automatiser l'ajout du CNAME — ici manuel pour rester lisible)
echo "Ajouter à Route 53 le CNAME : $VALIDATION_RECORD"
echo "[Attendre la validation ACM — 5 à 15 min]"

aws acm wait certificate-validated --region $REGION_ACM --certificate-arn $CERT_ARN
echo "Certificat validé"

# 5. Origin Access Control
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "oac-assets",
    "Description": "OAC for assets-myproject bucket",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }' --query 'OriginAccessControl.Id' --output text)
echo "OAC créé : $OAC_ID"

# 6. Distribution CloudFront (résumé — pour le détail, utiliser un fichier JSON complet)
# Pour simplifier : créer via console ou CDK. Le JSON complet est volumineux.
# Snippets clés à configurer :
#   Origins[0].DomainName       = "$BUCKET.s3.$REGION_S3.amazonaws.com"
#   Origins[0].OriginAccessControlId = $OAC_ID
#   Origins[0].S3OriginConfig.OriginAccessIdentity = ""  (vide car on utilise OAC)
#   DefaultCacheBehavior.ViewerProtocolPolicy = "redirect-to-https"
#   DefaultCacheBehavior.Compress = true
#   Aliases.Items = [$DOMAIN]
#   ViewerCertificate.ACMCertificateArn = $CERT_ARN
#   ViewerCertificate.SSLSupportMethod = "sni-only"
#   ViewerCertificate.MinimumProtocolVersion = "TLSv1.2_2021"

DIST_ID=...    # à récupérer après création
DIST_DOMAIN=...   # d111111.cloudfront.net

# 7. Bucket policy pour autoriser l'OAC
cat > bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/$DIST_ID"
      }
    }
  }]
}
EOF
aws s3api put-bucket-policy --bucket $BUCKET --policy file://bucket-policy.json

# 8. Record Route 53 ALIAS
cat > r53.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "$DOMAIN",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "$DIST_DOMAIN",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://r53.json

# 9. Tests
echo "[Attendre 5-10 min la propagation CloudFront]"
curl -I https://$DOMAIN/index.html
curl -I https://$DOMAIN/index.html  # 2e fois : x-cache: Hit
```

### 8.3 — Validation visuelle attendue

Premier `curl` :

```
HTTP/2 200
content-type: text/html
x-amz-server-side-encryption: AES256
x-cache: Miss from cloudfront
via: 1.1 d111111.cloudfront.net (CloudFront)
```

Second `curl` (dans la minute suivante) :

```
HTTP/2 200
content-type: text/html
x-cache: Hit from cloudfront
age: 47
```

`x-cache: Hit` confirme que le 2ᵉ appel a été servi depuis l'edge — pas un aller à S3.

Tentative d'accès direct au bucket :

```bash
curl -I https://$BUCKET.s3.$REGION_S3.amazonaws.com/index.html
# → HTTP/1.1 403 Forbidden  (OAC empêche l'accès direct)
```

C'est la preuve que **CloudFront est l'unique chemin** vers le contenu.

---

## 9. Anti-patterns CloudFront

| Anti-pattern                                                                                     | Pourquoi c'est mauvais                                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| CloudFront devant du contenu **jamais cacheable** (réponses utilisateur-spécifiques uniquement). | Pas de cache hit, on paye CloudFront sans gain.                 |
| Distribution **sans HTTPS** (HTTP only).                                                         | Vulnérable, exposé, hors standard.                              |
| Bucket S3 **public** alors que **OAC** est dispo.                                                | Surface d'attaque inutile (les attaquants téléchargent direct). |
| Cache key incluant **plein de headers/cookies**.                                                 | Fragmentation du cache, taux de hit effondré.                   |
| **Invalidation systématique** à chaque déploiement.                                              | Cher à terme, alors qu'asset versioning est gratuit.            |
| **Pas de WAF** sur une distribution publique sérieuse.                                           | Manque une couche de protection bot/DDoS L7.                    |
| Certificat ACM dans `eu-west-1` au lieu de `us-east-1`.                                          | La distribution refuse de l'utiliser.                           |
| **Pas de versioning d'assets**, TTL long.                                                        | Déploiements visibles seulement après expiration du TTL.        |

---

## 10. Exercices pratiques

### Exercice 1 — Distribution CloudFront devant S3 (≈ 60 min)

**Objectif.** Le scénario central, vu en section 8.

**Étapes :**

1. Créer le bucket privé, uploader 3-5 fichiers.
2. Créer la distribution avec OAC (via console pour simplicité, ou suivre le script CLI).
3. Tester l'accès via l'URL CloudFront (`d111111.cloudfront.net`).
4. Vérifier que l'accès direct au bucket est `403`.
5. Mesurer le temps de réponse :
   - Cache miss (premier accès) vs cache hit (second).
   - Compression activée vs désactivée (différence de poids).

**Livrable.** Captures `curl -I` montrant les headers, et un mémo de 5 lignes sur les observations.

### Exercice 2 — Raccordement nom de domaine (≈ 30 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Sur la distribution de l'exercice 1, ajouter `assets.<mondomaine>.fr` comme alternate domain name.
2. Demander un certificat ACM dans `us-east-1`, valider via Route 53.
3. Mettre à jour la distribution avec ce certificat.
4. Créer le record ALIAS Route 53.
5. Tester via le nom personnalisé.

**Livrable.** Capture du `curl -I https://assets.<mondomaine>.fr/...` montrant les headers CloudFront + le bon certificat (`-vI` montre la chaîne TLS).

### Exercice 3 — Mesurer l'optimisation (≈ 30 min)

**Objectif.** Quantifier ce que CloudFront apporte vraiment.

**Setup.** Le bucket de l'exercice 1, avec un fichier de ~5 MB (par exemple, une vidéo MP4 ou une grosse image).

**Étapes :**

1. Mesurer `curl -w` (temps total) pour l'accès direct au bucket S3 depuis chez soi.
2. Mesurer pour l'accès via CloudFront (cache miss puis cache hit).
3. Mesurer en simulant un autre continent (utilisation d'un VPN, par exemple via un VPS à Tokyo).
4. Comparer les trois.

**Livrable.** Tableau de 3 colonnes × 3 lignes (France local / France via VPN US / France via VPN Asie) avec les temps mesurés.

### Exercice 4 — Cache et invalidation (≈ 30 min)

**Objectif.** Comprendre le cycle de cache.

**Étapes :**

1. Servir un fichier `index.html` via CloudFront. Le télécharger 2 fois, observer `x-cache: Hit`.
2. Modifier le fichier dans S3 (`aws s3 cp ...`).
3. Re-télécharger via CloudFront : on obtient **l'ancien** contenu (cache hit toujours).
4. Lancer une invalidation `aws cloudfront create-invalidation --paths "/index.html"`.
5. Re-télécharger : on obtient le **nouveau** contenu.
6. **Bonus** : modifier le `Cache-Control` du fichier S3 à `no-cache` et observer que les modifs futures sont visibles **sans** invalidation.

**Livrable.** Timeline avec étapes et observations.

### Mini-défi — Architecture complète web (≈ 30 min, papier)

**Cas.** Site e-commerce :

- Front Next.js statique (HTML/JS/CSS) buildé en assets versionnés.
- API backend dynamique (POST commandes, GET catalogue).
- Images produits dans un bucket S3 séparé.
- Vidéos de présentation produit (300 MB chacune).

**Concevoir** une architecture CloudFront optimale :

- Combien de distributions CloudFront ? (1 ou plusieurs)
- Quelles origines ?
- Quelles cache policies pour chaque type de contenu ?
- Quelle stratégie de TTL ?
- Quels patterns de path matching ?
- Quel(s) WAF, quel(s) certificat(s) ACM ?

**Livrable.** Schéma + tableau de configuration, 1 page.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un **CDN** et énoncer ses trois bénéfices principaux (latence, bande passante origine, disponibilité).
- [ ] Citer les **trois pré-requis** pour distribuer du contenu avec CloudFront (origine, distribution, optionnellement nom de domaine + cert ACM).
- [ ] Énoncer les **six leviers d'optimisation** de CloudFront (maillage edge, cache, TLS edge, connexions persistantes backbone, compression, HTTP/2-3).
- [ ] Définir une **origine** et lister les types supportés (S3, ALB, EC2, custom HTTP).
- [ ] Distinguer **OAC** et bucket public, expliquer pourquoi OAC est la bonne pratique.
- [ ] Définir une **cache key** et expliquer le risque d'y ajouter trop d'éléments.
- [ ] Expliquer la différence entre **versioning d'assets** et **invalidation**.
- [ ] **Raccorder** un nom de domaine à une distribution : citer les 4 étapes (ACM us-east-1, alternate domain, certificat sur dist, record ALIAS R53).
- [ ] Expliquer pourquoi le certificat ACM doit être en **us-east-1**.
- [ ] Construire une **bucket policy OAC** correcte pour autoriser une distribution donnée.
- [ ] Citer **3 anti-patterns** CloudFront.

### Items du glossaire visés

**N1 atteint** :

- _pré-requis pour distribuer du contenu avec CloudFront_ — sections 2.4 et 8.
- _comment CloudFront optimise la distribution_ — section 3 entière.

**N2 atteint** :

- _raccorder un nom de domaine à une distribution CloudFront_ — section 7 et exercice 2.

---

## 12. Ressources complémentaires

### Documentation AWS

- [CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [Edge Locations](https://aws.amazon.com/cloudfront/features/) — voir la liste à jour.
- [Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Cache and origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/working-with-policies.html)
- [Restrict access to your origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancers.html)
- [Add an alternate domain name](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)

### Tarification

- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) — par région d'edge ; ~0,085 $/GB en EU/US, plus cher en Asie.
- [Free tier](https://aws.amazon.com/cloudfront/pricing/) — 1 To/mois et 10M de requêtes/mois gratuits.

### Outils annexes

- [AWS WAF](https://aws.amazon.com/waf/) — règles applicatives au-dessus de CloudFront.
- [AWS Shield](https://aws.amazon.com/shield/) — protection DDoS.
- [CloudFront Functions](https://aws.amazon.com/blogs/aws/introducing-cloudfront-functions-run-your-code-at-the-edge-with-low-latency-at-any-scale/) — code JS léger à l'edge (URL rewriting, headers, A/B).
- [Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html) — Lambda full-fledged à l'edge.

### Pour aller plus loin

- **M7 (API Gateway)** : alternative à CloudFront pour exposer des API.
- **M8 (Load Balancers)** : ce qu'il y a en aval de CloudFront pour le trafic dynamique.
- **Niveau 3** : origin policies fines, contrôle d'accès aux distributions, signed URLs/cookies, Lambda@Edge.
