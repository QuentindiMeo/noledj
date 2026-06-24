# M1 — Régions, zones et IP

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir précisément ce qu'est une **région** AWS (au sens géographique, réseau, juridique et tarifaire).
- Définir ce qu'est une **zone de disponibilité** (AZ), expliquer le modèle de panne qu'elle implique, et distinguer **AZ name** et **AZ ID**.
- Distinguer **IP privée**, **IP publique éphémère** et **Elastic IP** (EIP), savoir laquelle utiliser dans quel cas et quel piège tarifaire les EIP cachent.
- **Choisir une région et une (ou plusieurs) AZ** pour un déploiement donné, en justifiant la décision sur cinq à six critères concrets (latence, conformité, coût, services disponibles, résilience).
- Lire les principales commandes AWS CLI relatives aux régions, AZ et adresses IP, et créer une première instance EC2 minimale dans une AZ ciblée.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- Compte AWS opérationnel (sandbox, perso ou pro avec autorisation de créer des ressources).
- **AWS CLI v2** installée et configurée (`aws configure`) avec des credentials valides.
- Notions IP de base : IPv4, masques (`/24`, `/16`), différence IP publique / privée, NAT. Sinon, revoir au préalable les bases TCP/IP — une explication courte en section 4.1 suffit pour démarrer, mais le confort est meilleur avec ces notions déjà en main.
- AWS Identity M1-M3 — recommandé mais pas bloquant (on suppose un user IAM avec permissions EC2 et VPC en lecture/écriture).

---

## 1. Pourquoi commencer par la géo et les IP

### Le réseau, point de départ d'AWS

Une intuition fausse mais répandue : "AWS, c'est d'abord du compute (EC2, Lambda) ; le réseau, on s'en occupe ensuite." En pratique, c'est l'inverse. Avant d'écrire la première ligne de Terraform ou de cliquer sur "Launch Instance", trois choix précèdent tout le reste :

1. **Dans quelle région ?** — détermine la latence, le prix de tout, les services disponibles, le droit applicable.
2. **Dans quelle(s) AZ ?** — détermine la robustesse face aux pannes d'AWS et le coût du trafic interne.
3. **Quelle adresse IP utiliser ?** — détermine la communication entre services, la joignabilité depuis Internet, et le coût "caché" des Elastic IP non rattachées.

Ces trois choix sont **structurants** : revenir dessus en cours de route coûte typiquement plusieurs jours à plusieurs semaines de travail (migration de ressources, changement de DNS, ajustement de réseau, downtime applicatif).

### L'analogie de la livraison

Penser à AWS comme un opérateur logistique mondial :

- La **région**, c'est le **continent** où on installe son centre de tri principal. Le choisir change le prix de l'essence (coût), les délais (latence) et les lois douanières (conformité).
- Les **AZ**, ce sont les **entrepôts** indépendants à l'intérieur de ce continent. Si un entrepôt brûle, les autres continuent à fonctionner — à condition d'avoir réparti ses stocks.
- L'**IP**, c'est l'**adresse postale** d'un camion : interne au continent (privée, gratuite, on ne la voit pas de l'extérieur), affichée publiquement (publique éphémère, peut changer), ou réservée à vie (Elastic IP, payante si on ne s'en sert pas).

Trois choix → trois leviers de coût, de latence, de résilience.

### Anti-pattern récurrent

| Choix par défaut imprudent                           | Conséquence                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| "Je prends `us-east-1`, c'est l'exemple par défaut." | Latence 100+ ms depuis l'Europe, conformité RGPD discutable.       |
| "Je mets tout dans une seule AZ."                    | Une coupure AZ = 100 % d'indisponibilité de l'app.                 |
| "Je laisse l'IP publique auto-assignée."             | À chaque arrêt/redémarrage de l'instance, l'IP change → DNS cassé. |
| "J'ai libéré une EIP… enfin, je l'ai détachée."      | Facturée tant qu'elle n'est ni utilisée ni libérée.                |

La suite de ce module donne les outils pour éviter ces pièges.

---

## 2. La région AWS

### 2.1 — Définition

Une **région** AWS est un **regroupement géographique** de centres de données physiques, identifié par un code unique (`eu-west-1`, `us-east-1`, `ap-northeast-1`, …) et un nom (`Europe (Ireland)`, `US East (N. Virginia)`, `Asia Pacific (Tokyo)`).

Quatre propriétés à retenir :

- **Isolation par défaut.** Les ressources d'une région ne voient pas celles d'une autre région sans configuration explicite (peering, transit gateway, réplication, etc.).
- **Tarification propre à chaque région.** Une EC2 t3.medium coûte 0,0416 $/h en `us-east-1` et 0,0480 $/h en `eu-west-3`. Le pricing AWS varie de **5 à 30 %** selon la région.
- **Catalogue de services variable.** Toutes les régions n'ont pas tous les services. Une région récente (par exemple `eu-south-2` Espagne) peut manquer de services exotiques (par exemple, certains services ML, Redshift Serverless, etc.).
- **Cadre juridique local.** Une région française (`eu-west-3`, Paris) place les données sous droit français + UE. Une région américaine, sous CLOUD Act.

### 2.2 — Lire un code de région

```
eu-west-1
│  │   │
│  │   └─── numéro d'instance dans la zone géo
│  └─────── direction géographique (west / east / north / south / central / northeast / southeast)
└────────── zone géo : eu / us / ap / sa / af / ca / me
```

Quelques régions clés à connaître :

| Code             | Nom                       | Cas d'usage typique                                                                                      |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `eu-west-1`      | Europe (Irlande)          | Ancienne région UE, catalogue très complet, prix moyen, peu de contraintes RGPD strictes.                |
| `eu-west-3`      | Europe (Paris)            | Données françaises sous droit français, prix légèrement supérieur.                                       |
| `eu-central-1`   | Europe (Francfort)        | Données allemandes, prix moyen, latence < 10 ms depuis Paris.                                            |
| `us-east-1`      | US East (N. Virginia)     | Région historique, **la moins chère**, mais la plus surchargée et la plus instable (pannes récurrentes). |
| `us-west-2`      | US West (Oregon)          | Alternative US Pacifique, plus stable que `us-east-1`.                                                   |
| `ap-northeast-1` | Asia Pacific (Tokyo)      | Japon.                                                                                                   |
| `ap-southeast-1` | Asia Pacific (Singapour)  | Sud-est asiatique.                                                                                       |
| `sa-east-1`      | South America (São Paulo) | Amérique du sud.                                                                                         |

Au total, AWS compte ~33 régions publiques en 2026 (hors GovCloud et Chine).

### 2.3 — Ce qui change d'une région à l'autre

Quatre dimensions à examiner avant de choisir :

| Dimension                | Variation observable                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Latence**              | < 5 ms intra-région ; 10-30 ms entre régions du même continent ; 100-300 ms intercontinent.                                                |
| **Tarification**         | ±5 à 30 % selon la ressource. `us-east-1` est presque toujours la moins chère.                                                             |
| **Services disponibles** | Toutes les régions n'ont pas Bedrock, SageMaker Studio, certains types d'instances GPU, etc. À vérifier au cas par cas.                    |
| **Cadre juridique**      | RGPD strict en UE, CLOUD Act US, lois nationales variables. Pour des données personnelles UE, choisir une région UE est quasi obligatoire. |

### 2.4 — Comment choisir une région — les six critères

À pondérer dans l'ordre suivant pour un déploiement neuf :

1. **Où sont les utilisateurs finaux ?** La région doit être géographiquement proche pour minimiser la latence. Pour une app utilisée depuis la France, viser `eu-west-3` (Paris) ou `eu-west-1` (Irlande) ; depuis le Japon, `ap-northeast-1` ; etc.
2. **Quelles contraintes légales s'appliquent aux données ?** RGPD pour des utilisateurs UE → région UE. Données de santé françaises certifiées HDS → région française avec hébergement HDS. Données fédérales US classifiées → GovCloud.
3. **Tous les services nécessaires sont-ils disponibles dans la région envisagée ?** Vérifier sur la [Region Table AWS](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/). Manque-t-il Bedrock ? Athena ? Un type d'instance précis ?
4. **Quel est le différentiel de coût ?** Pour un déploiement à 50 000 $/an, 15 % d'écart = 7 500 $ — significatif. Pour un projet de 500 $/an, négligeable.
5. **Quelle est la maturité / stabilité de la région ?** `us-east-1` concentre les pannes AWS les plus médiatisées. Une région récente peut manquer de redondance.
6. **Y a-t-il un partenaire / une équipe / un autre workload déjà sur place ?** Garder tout dans la même région simplifie le réseau (pas de peering inter-région à monter).

**Heuristique pratique pour un projet en France :** dans 80 % des cas, `eu-west-1` (Irlande) ou `eu-west-3` (Paris) sont les bons choix. Ne pas chercher plus loin sans raison concrète.

### 2.5 — Anti-patterns régionaux

| Anti-pattern                                                             | Pourquoi c'est mauvais                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Tout déployer en `us-east-1` "parce que c'est l'exemple par défaut".     | Latence depuis l'UE, exposition au CLOUD Act, instabilité historique.  |
| Disperser des ressources interdépendantes dans 4 régions différentes.    | Coûts de transfert inter-région, complexité de réseau, complexité IAM. |
| Choisir la région la moins chère sans vérifier les services disponibles. | Découvrir 3 mois plus tard que Bedrock n'est pas là.                   |
| Ne pas documenter le choix de région.                                    | L'équipe suivante refait le débat à zéro tous les 6 mois.              |

---

## 3. La zone de disponibilité (AZ)

### 3.1 — Définition

Une **zone de disponibilité** (Availability Zone, AZ) est un **regroupement d'un ou plusieurs centres de données physiquement séparés** au sein d'une région. Chaque région AWS contient typiquement **3 à 6 AZ**, identifiées par une lettre suffixée au code région :

```
Région : eu-west-1
├── AZ : eu-west-1a
├── AZ : eu-west-1b
└── AZ : eu-west-1c
```

Quatre propriétés clés :

- **Séparation physique** : alimentation électrique, refroidissement, réseau d'opérateur **distincts**. Conçues pour qu'une catastrophe locale (incendie, inondation, coupure ENEDIS) n'affecte qu'**une seule** AZ.
- **Latence intra-AZ très faible** : typiquement < 1 ms.
- **Latence inter-AZ faible** : typiquement 1-3 ms (parfois jusqu'à 5 ms selon la région).
- **Connectivité réseau** entre AZ d'une même région : haute capacité, faible latence, **mais payante** (voir section 3.5).

### 3.2 — AZ name vs AZ ID — la subtilité multi-comptes

À la création d'un compte AWS, AWS **mélange l'affectation** des noms de zone. Pour un compte A, `eu-west-1a` peut désigner le data center physique X ; pour un compte B, `eu-west-1a` peut désigner le data center physique Y. La raison : éviter que tout le monde déploie en priorité dans la "première" AZ et créer un déséquilibre.

Pour identifier la **zone physique** indépendamment du compte, AWS expose l'**AZ ID** :

```bash
aws ec2 describe-availability-zones --region eu-west-1 \
  --query 'AvailabilityZones[].{Name:ZoneName, Id:ZoneId, State:State}'
```

Sortie typique :

```json
[
  { "Name": "eu-west-1a", "Id": "euw1-az1", "State": "available" },
  { "Name": "eu-west-1b", "Id": "euw1-az2", "State": "available" },
  { "Name": "eu-west-1c", "Id": "euw1-az3", "State": "available" }
]
```

L'AZ ID (`euw1-az1`) est **stable et unique** pour tous les comptes ; le ZoneName (`eu-west-1a`) est spécifique au compte.

**Quand cela compte.** Dans 90 % des cas, on ne s'en préoccupe pas. Mais dès qu'on partage des ressources entre comptes (ressources cross-account, RAM share, peering VPC entre comptes), il faut raisonner en AZ ID pour s'assurer que les ressources sont **réellement** dans la même AZ physique.

### 3.3 — Modèle de panne

C'est **le** point à retenir sur les AZ :

> Une AZ peut tomber. Les autres AZ d'une même région sont conçues pour **ne pas tomber en même temps**.

Conséquences architecturales :

- **Un workload critique doit être déployé sur au moins 2 AZ.** Une instance EC2 unique dans une seule AZ → SPOF (single point of failure).
- **Les services managés multi-AZ** (RDS Multi-AZ, ALB, etc.) répliquent automatiquement entre AZ.
- **Un cluster Kubernetes (EKS)** doit avoir ses nodes répartis sur 2-3 AZ.
- **Un Auto Scaling Group** doit être configuré sur ≥ 2 AZ pour profiter de la résilience.

Le 3-AZ est un standard de facto pour les workloads de production AWS — il permet de perdre une AZ sans perte de capacité significative (33 % au lieu de 50 %).

### 3.4 — Latence intra- vs inter-AZ

| Distance               | Latence typique | Cas d'usage                                                      |
| ---------------------- | --------------- | ---------------------------------------------------------------- |
| Intra-AZ               | < 1 ms          | Communication serveur ↔ base de données interne, cache.          |
| Inter-AZ (même région) | 1-3 ms          | Réplication synchrone RDS Multi-AZ, sync entre nodes Kubernetes. |
| Inter-région           | 10-300 ms       | Réplication asynchrone, disaster recovery.                       |

L'écart entre intra-AZ et inter-AZ est généralement négligeable pour 99 % des applications. **Ne pas tordre l'architecture** pour préserver des microsecondes au prix de la résilience. Une réplication inter-AZ à 2 ms est **toujours** préférable à un SPOF intra-AZ à 0,5 ms.

### 3.5 — Le coût du trafic inter-AZ

Point souvent ignoré, parfois douloureux à découvrir sur la facture :

- **Trafic intra-AZ** : **gratuit** (entre EC2 d'une même AZ, via IP privée).
- **Trafic inter-AZ** : **facturé** (typiquement 0,01 $/GB en entrée **et** en sortie — donc 0,02 $/GB pour un aller-retour).
- **Trafic vers Internet** : 0,09 $/GB (variable selon volume et région).

Pour un workload qui échange 10 To/mois entre AZ : 10 000 × 0,02 = **200 $/mois** rien que pour le trafic inter-AZ. À budgétiser explicitement.

**Optimisation classique :** placer les ressources qui communiquent intensément (par exemple un app server et son cache Redis) dans **la même AZ** dans la mesure où la résilience le permet. Mais attention : optimiser le coût en sacrifiant la résilience est presque toujours une fausse bonne idée pour un workload critique.

---

## 4. IP — privée, publique, élastique

### 4.1 — IP privée

Une **IP privée** est une adresse IPv4 dans les plages **RFC 1918** :

- `10.0.0.0/8` (16,7 millions d'IP)
- `172.16.0.0/12` (1 million d'IP)
- `192.168.0.0/16` (65 000 IP)

**Trois propriétés à retenir :**

- **Routable uniquement à l'intérieur d'un VPC** (ou via VPN/Direct Connect/peering). Pas joignable depuis Internet.
- **Gratuite**.
- **Persistante** tant que l'instance vit (et même après stop/start tant que l'instance reste dans le même VPC subnet).

À la création d'une EC2 dans un subnet, AWS attribue **automatiquement** une IP privée prise dans la plage CIDR de ce subnet. Par exemple, pour un subnet `10.0.1.0/24`, on obtiendra `10.0.1.42`.

**Tout** ce qui communique en interne d'un VPC le fait via les IP privées. Une application backend qui parle à sa base RDS le fait via l'IP privée de RDS — jamais via Internet.

### 4.2 — IP publique auto-assignée

À la création d'une EC2 dans un **subnet public** (notion vue en M2), AWS peut attribuer une **IP publique éphémère**. Cette IP :

- Est **publique** (routable depuis Internet).
- Est **éphémère** : elle disparaît à l'arrêt (`stop`) de l'instance, et l'instance redémarrée recevra une **nouvelle** IP publique différente.
- Est **gratuite tant que l'instance est démarrée et l'IP utilisée** (un changement de tarification s'applique depuis fin 2024 : les IPv4 publiques sont facturées 0,005 $/h, soit ~3,6 $/mois, qu'elles soient EIP ou auto-assignées).

**Cas d'usage légitime :** instance jetable (test, tâche batch ponctuelle, instance d'analyse temporaire) qu'on ne souhaite pas conserver entre redémarrages.

**Anti-pattern :** mettre cette IP éphémère dans un DNS, espérer qu'elle reste stable. À chaque redémarrage, l'enregistrement DNS doit être mis à jour — automatisable mais source d'incidents.

### 4.3 — Elastic IP (EIP)

Une **Elastic IP** est une adresse IPv4 publique **réservée à un compte AWS**, **statique** (ne change pas), et qu'on peut **attacher / détacher** d'une instance EC2 (ou d'un NAT Gateway, voire d'autres ressources).

**Trois propriétés clés :**

- **Statique** : une fois allouée, elle reste la même tant qu'on ne la libère pas explicitement.
- **Détachable** : on peut la déplacer d'une instance à une autre en quelques secondes — utile pour un failover applicatif manuel.
- **Tarifée** :
  - **Tarification historique** (avant fin 2024) : une EIP **attachée à une instance démarrée** était gratuite ; **détachée ou attachée à une instance arrêtée**, elle était facturée 0,005 $/h (~3,6 $/mois).
  - **Tarification actuelle** : toutes les IPv4 publiques (EIP, IP auto-assignées) sont **facturées** 0,005 $/h, qu'elles soient utilisées ou non. AWS pousse vers IPv6 (toujours gratuit) et vers la diminution de la consommation d'IPv4.

```bash
# Allouer une Elastic IP
aws ec2 allocate-address --domain vpc

# Sortie typique :
# {
#   "PublicIp": "52.49.123.45",
#   "AllocationId": "eipalloc-0abc1234",
#   "Domain": "vpc"
# }

# Attacher à une instance EC2
aws ec2 associate-address \
  --instance-id i-0123456789abcdef0 \
  --allocation-id eipalloc-0abc1234

# Détacher
aws ec2 disassociate-address --association-id eipassoc-0abc1234

# Libérer (ne plus facturer)
aws ec2 release-address --allocation-id eipalloc-0abc1234
```

**Cas d'usage légitimes :**

- Instance ayant un **DNS public stable** (par exemple : un serveur SSH bastion qu'on connecte par nom).
- Endpoint nécessitant une **whitelist firewall** chez un partenaire (l'IP doit rester stable pour rester autorisée).
- **NAT Gateway**, qui exige une EIP (pas le choix).
- **Failover manuel** : pré-allouer une EIP, l'attacher à l'instance active, la basculer en cas de panne.

**Anti-patterns :**

- Allouer une EIP pour une instance qui ne sera **jamais** atteinte depuis Internet (utiliser uniquement l'IP privée).
- Laisser des EIP traîner après avoir détruit l'instance qui les utilisait (la facture grimpe sans qu'on s'en rende compte → vérification : `aws ec2 describe-addresses` régulièrement).
- Utiliser une EIP là où **un Load Balancer** ou **Route 53 + IP éphémère** serait plus adapté (voir M5 et M8).

### 4.4 — Quand utiliser quoi — la grille

| Besoin                                                       | Type d'IP recommandé                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Communication interne entre EC2 / RDS / Lambda dans le VPC.  | IP privée (auto-assignée).                                   |
| Instance jetable, accessible depuis Internet temporairement. | IP publique éphémère.                                        |
| Endpoint Internet **stable** avec adresse fixe.              | Elastic IP.                                                  |
| NAT Gateway (sortie Internet depuis subnet privé).           | Elastic IP (obligatoire).                                    |
| Service haute dispo accessible depuis Internet.              | Load Balancer (vu en M8) — pas d'EIP directe sur l'instance. |
| Site statique mondialement distribué.                        | CloudFront (vu en M6) devant S3 — pas d'EIP.                 |

### 4.5 — Gotcha tarifaire — les EIP fantômes

Le piège le plus courant : libérer une instance EC2 **sans** libérer son EIP. L'EIP reste allouée au compte, facturée, jusqu'à ce qu'on s'en aperçoive. Pour 5 EIP oubliées pendant 6 mois : ~108 $ jetés.

**Hygiène recommandée :**

```bash
# Lister toutes les EIP du compte et leur état
aws ec2 describe-addresses --query 'Addresses[].{IP:PublicIp, AllocId:AllocationId, Instance:InstanceId, NetworkInterface:NetworkInterfaceId}'
```

Toute EIP avec `Instance: null` ET `NetworkInterface: null` est **détachée** : elle coûte sans rien produire. À libérer ou à attacher.

---

## 5. Le ménage à trois — région × AZ × IP, sur un exemple complet

Pour fixer les idées, schématiser un déploiement minimal :

```
                    ┌──────────────────────────────────────────────┐
                    │ Région : eu-west-1 (Irlande)                 │
                    │                                              │
                    │   ┌──────────────────┐  ┌──────────────────┐ │
                    │   │ AZ : eu-west-1a  │  │ AZ : eu-west-1b  │ │
                    │   │                  │  │                  │ │
                    │   │ ┌─────────────┐  │  │ ┌─────────────┐  │ │
                    │   │ │ EC2 web-1   │  │  │ │ EC2 web-2   │  │ │
                    │   │ │ priv 10.0.1.5│ │  │ │priv 10.0.2.5│  │ │
                    │   │ │ EIP 52.49.x │  │  │ │ EIP 52.49.y │  │ │
                    │   │ └─────────────┘  │  │ └─────────────┘  │ │
                    │   │ ┌─────────────┐  │  │ ┌─────────────┐  │ │
                    │   │ │ RDS Master  │  │  │ │ RDS Standby │  │ │
                    │   │ │priv 10.0.1.10│ │  │ │priv 10.0.2.10│ │ │
                    │   │ └─────────────┘  │  │ └─────────────┘  │ │
                    │   └──────────────────┘  └──────────────────┘ │
                    │                                              │
                    └──────────────────────────────────────────────┘
                                          │
                                          ▼
                                 Internet (utilisateurs)
```

Quatre observations à intégrer :

1. **Région** : `eu-west-1`, choisie pour latence UE et conformité.
2. **2 AZ** : `eu-west-1a` et `eu-west-1b`, pour résister à la perte d'une AZ.
3. **EC2 et RDS** : chacun déployé en double, un par AZ.
4. **IP** : les EC2 ont une IP privée pour communiquer avec RDS (gratuit) et une EIP pour exposer un endpoint Internet stable. Les RDS n'ont **que** des IP privées.

Avec ce schéma, perdre `eu-west-1a` met `web-1` et le master RDS hors ligne, mais `web-2` peut servir le trafic et le standby RDS prend le relais en quelques secondes.

Dans la pratique, on remplacera les EIP directes par un **Load Balancer** (M8) et on routera Route 53 vers le LB (M5). Mais le principe de fond — 2 AZ minimum, IP privées pour les flux internes — reste invariant.

---

## 6. Choisir région et AZ — méthode

### 6.1 — La grille de décision

| Critère                    | Pondération | Question à se poser                                                           |
| -------------------------- | ----------- | ----------------------------------------------------------------------------- |
| **Géographie utilisateur** | Forte       | Où sont mes utilisateurs ? Quelle latence cible ?                             |
| **Conformité légale**      | Bloquante   | RGPD ? HDS ? CLOUD Act acceptable ? Lois sectorielles ?                       |
| **Catalogue de services**  | Forte       | Tous les services nécessaires sont-ils disponibles dans la région envisagée ? |
| **Coût**                   | Moyenne     | Différentiel mensuel acceptable ?                                             |
| **Maturité de la région**  | Moyenne     | Région récente avec moins d'AZ ou région éprouvée ?                           |
| **Cohérence interne**      | Moyenne     | D'autres workloads déjà sur place ? Équipes déjà formées sur une région ?     |

### 6.2 — Combien d'AZ ?

| Profil de workload                                 | AZ recommandées              |
| -------------------------------------------------- | ---------------------------- |
| Lab / dev individuel / POC                         | 1 AZ                         |
| Pré-production partagée                            | 2 AZ                         |
| Production critique                                | 2 AZ minimum, **3 AZ** idéal |
| Production avec contrainte de disponibilité élevée | 3 AZ + multi-région DR       |

Le saut **1 → 2 AZ** est le plus important : il fait passer la disponibilité théorique de 99,9 % à ~99,99 % en supprimant le SPOF d'AZ. Le saut **2 → 3 AZ** apporte de la marge en cas de panne d'une AZ pendant une maintenance.

### 6.3 — Exemples de décision

**Exemple 1 — Startup SaaS B2B française, 1000 clients pros UE.**

- **Région** : `eu-west-3` (Paris) ou `eu-west-1` (Irlande). Préférer `eu-west-3` si les clients exigent "hébergement France", sinon `eu-west-1` (catalogue plus complet, prix légèrement inférieur).
- **AZ** : 2 AZ en prod, 1 AZ en pré-prod.

**Exemple 2 — Pipeline de batch analytique, données mondialement collectées, lecture mensuelle.**

- **Région** : `us-east-1` (la moins chère, peu sensible à la latence pour du batch).
- **AZ** : 1 AZ suffit (workload tolérant à la panne — le job redémarre).

**Exemple 3 — Plateforme bancaire production, clientèle France.**

- **Région** : `eu-west-3` (Paris, droit français).
- **AZ** : 3 AZ obligatoire, RDS Multi-AZ activé, ALB cross-AZ.
- **Plan DR** : second déploiement en `eu-west-1` (Irlande) en stand-by.

**Exemple 4 — Site statique pour conférence, 500 visiteurs/jour pendant 3 jours.**

- **Région** : la moins chère où S3 + CloudFront sont disponibles. CloudFront étant **mondial**, la localisation S3 n'a presque pas d'impact côté utilisateur.
- **AZ** : non pertinent (S3 est multi-AZ par construction).

---

## 7. Outillage CLI essentiel

### 7.1 — Lister régions et AZ

```bash
# Toutes les régions accessibles depuis le compte
aws ec2 describe-regions --query 'Regions[].RegionName' --output table

# Détail des AZ d'une région
aws ec2 describe-availability-zones --region eu-west-1 \
  --query 'AvailabilityZones[].{Name:ZoneName, Id:ZoneId, State:State}' \
  --output table
```

### 7.2 — Voir l'IP d'une instance EC2

```bash
aws ec2 describe-instances \
  --instance-ids i-0123456789abcdef0 \
  --query 'Reservations[].Instances[].{Id:InstanceId, PrivateIP:PrivateIpAddress, PublicIP:PublicIpAddress, AZ:Placement.AvailabilityZone, State:State.Name}'
```

### 7.3 — Lister toutes les EIP du compte

```bash
aws ec2 describe-addresses \
  --query 'Addresses[].{IP:PublicIp, AllocId:AllocationId, Instance:InstanceId}' \
  --output table
```

### 7.4 — Lancer une instance EC2 minimale (sans VPC custom — utilise le default VPC)

```bash
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --count 1 \
  --availability-zone eu-west-1a \
  --query 'Instances[].{Id:InstanceId, AZ:Placement.AvailabilityZone, PrivateIP:PrivateIpAddress}'
```

**Note** : cette commande échoue si on n'a pas configuré de subnet/SG par défaut. Pour M1, le but est de **lire les commandes** ; la pratique réelle de lancement viendra en M2 et M3.

---

## 8. Exercices pratiques

### Exercice 1 — Cartographier ses régions et AZ (≈ 20 min)

**Objectif.** Maîtriser la lecture de l'infrastructure AWS depuis la CLI.

**Étapes :**

1. Lister **toutes les régions** activables sur son compte.
2. Pour la région la plus proche géographiquement (par exemple `eu-west-3`), lister les AZ et leurs **AZ ID**.
3. Comparer avec une autre région (`us-east-1`) : combien d'AZ chacune a-t-elle ?
4. Documenter dans un fichier `regions-azs.md` :
   - Quelle région a le plus d'AZ ? Pourquoi ?
   - Pourquoi `eu-west-1` n'a-t-il que 3 AZ tandis que `us-east-1` en a 6 ?

**Livrable.** Un mémo de 5-10 lignes.

### Exercice 2 — Choisir une région et une AZ pour 3 cas (≈ 30 min)

**Objectif.** Appliquer la grille de la section 6.

Pour chacun des trois cas suivants, écrire **une demi-page** justifiant le choix selon les six critères :

- **Cas A** : application mobile française grand public, données personnelles non sensibles, 100k utilisateurs.
- **Cas B** : pipeline de calcul scientifique, datasets stockés sur S3 US, calculs nocturnes, budget serré.
- **Cas C** : système bancaire avec données clients UE et obligations légales fortes.

**Livrable.** Un fichier `region-choices.md` avec une réponse argumentée par cas.

### Exercice 3 — Manipuler une Elastic IP (≈ 30 min)

**Objectif.** Comprendre concrètement le cycle de vie d'une EIP.

**Étapes :**

1. Allouer une EIP via la CLI (`allocate-address`).
2. Lancer une instance EC2 t3.micro dans le default VPC.
3. Attacher l'EIP à l'instance (`associate-address`).
4. Vérifier via `describe-instances` que l'IP publique correspond bien à l'EIP allouée.
5. Détacher l'EIP, observer que l'instance perd son IP publique stable.
6. **Important** : libérer l'EIP (`release-address`) avant la fin de l'exercice pour éviter la facturation continue.
7. Terminer l'instance.

**Livrable.** Capture des commandes et de leurs sorties, plus une phrase sur le coût qu'aurait représenté l'oubli de la libération sur 30 jours.

### Exercice 4 — Audit des EIP "fantômes" (≈ 15 min)

**Objectif.** Mettre en place le réflexe d'hygiène.

**Étapes :**

1. Sur son compte (ou un compte sandbox), lancer `aws ec2 describe-addresses` dans toutes les régions actives.
2. Identifier les EIP **détachées** (sans `InstanceId` ni `NetworkInterfaceId`).
3. Soit les attacher à quelque chose d'utile, soit les libérer.
4. Écrire un script bash réutilisable qui détecte les EIP fantômes dans **toutes** les régions et calcule leur coût mensuel cumulé.

**Livrable.** Le script + un mini-rapport.

### Mini-défi — Esquisser un déploiement complet (≈ 30 min)

Définir **par écrit** un déploiement multi-AZ pour ce cas :

> Plateforme de cours en ligne européenne. 50 000 utilisateurs actifs. Front web + API + base PostgreSQL. Vidéos hébergées dans S3 et distribuées via CDN. Budget : 3000 $/mois.

Répondre à :

1. Quelle région ? (justifier)
2. Combien d'AZ ? (justifier)
3. Quelle stratégie IP : combien d'EIP, où ? (justifier)
4. Esquisser un schéma type section 5.

Pas de bonne réponse unique : l'exercice valide le raisonnement et la prise en compte des six critères.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on est capable de **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir une **région AWS** (au sens géo, réseau, juridique, tarifaire).
- [ ] Lire un code de région et le décomposer (`eu-west-1` → zone géo, direction, numéro).
- [ ] Lister les **6 critères** de choix d'une région et donner un ordre de priorité.
- [ ] Définir une **zone de disponibilité** et son modèle de panne.
- [ ] Expliquer la différence entre **AZ name** et **AZ ID** et dans quel cas la distinction compte.
- [ ] Donner les ordres de grandeur de **latence** intra-AZ, inter-AZ, inter-région.
- [ ] Expliquer le **coût du trafic inter-AZ** et donner un ordre de grandeur.
- [ ] Définir une **IP privée** (RFC 1918, plages, joignabilité).
- [ ] Distinguer **IP publique éphémère** et **Elastic IP** (3 différences clés).
- [ ] Expliquer le **piège tarifaire** des EIP non attachées.
- [ ] Donner 3 cas d'usage légitimes d'une Elastic IP et 1 anti-pattern.
- [ ] Choisir région + AZ + stratégie IP pour un cas concret de 3 lignes.

### Items du glossaire visés

**N1 atteint** :

- _zone de disponibilité et région dans le contexte AWS_ — sections 2 et 3.
- _Elastic IP_ — section 4.3.

Les autres items N1 (Security Group, ressources VPC, CloudFront) sont couverts par M2, M3 et M6.

---

## 10. Ressources complémentaires

### Documentation AWS

- [Global Infrastructure — Regions and Availability Zones](https://aws.amazon.com/about-aws/global-infrastructure/regions_az/)
- [Region Table (services par région)](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/)
- [Elastic IP documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html)
- [VPC IP addressing](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-ip-addressing.html)
- [Latency between regions — outil officiel](https://www.cloudping.cloud/aws)

### Tarification

- [AWS Pricing Calculator](https://calculator.aws/) — pour estimer le coût d'un déploiement multi-AZ.
- [EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/) — comparer le prix d'un même type d'instance entre régions.
- [Public IPv4 pricing change announcement](https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/) — comprendre la nouvelle tarification IPv4.

### Conformité

- [AWS GDPR Center](https://aws.amazon.com/compliance/gdpr-center/)
- [Where Is My Data?](https://docs.aws.amazon.com/whitepapers/latest/aws-overview/data-location.html) — référence sur la localisation des données.

### Pour aller plus loin

- **M2 (VPC)** — prolongation directe : on construit le VPC qui hébergera les subnets dans chacune des AZ choisies.
- **M5 (Route 53)** — comment exposer un nom de domaine stable sans dépendre d'une EIP, et faire du failover entre AZ.
- **M8 (Load Balancers)** — comment équilibrer le trafic entre EC2 réparties sur plusieurs AZ.
- **AWS Compute M1-M3** — type d'instance EC2 à choisir selon AZ et workload.
