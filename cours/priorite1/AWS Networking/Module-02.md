# M2 — VPC

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir ce qu'est un **VPC** (Virtual Private Cloud), ses bornes, sa relation à la **région** et aux **AZ**.
- Définir un **subnet**, calculer sa plage CIDR et le **dimensionner** correctement (réserve AWS de 5 IP par subnet, taille minimale `/28`, maximale `/16`).
- Distinguer un subnet **public** d'un subnet **privé** par la **seule** caractéristique qui les sépare : la **route vers l'Internet Gateway**.
- Définir un **Internet Gateway (IGW)** et une **NAT Gateway**, expliquer leurs rôles complémentaires et leur coût.
- Définir une **table de routage**, lire ses entrées et comprendre comment elle détermine la destination d'un paquet.
- **Créer de bout en bout un VPC** à 2 AZ avec sous-réseaux publics et privés, IGW et NAT Gateway, et **vérifier la connectivité** depuis une instance dans chacun des subnets.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M1 (régions, AZ, IP privée/publique/Elastic).
- Notions de **CIDR** : savoir lire `10.0.0.0/16` comme une plage d'IP, comprendre que `/24` contient 256 IP, `/28` en contient 16, etc. Un rappel synthétique est donné en section 2.1 pour quiconque a besoin de rafraîchir.
- AWS CLI v2 configurée avec un user IAM disposant des permissions `ec2:*` (au minimum CRUD sur VPC, Subnet, RouteTable, InternetGateway, NatGateway, Address).
- Compte AWS avec **quota VPC disponible** (par défaut, 5 VPC par région par compte).

---

## 1. Pourquoi le VPC

### 1.1 — Le besoin

Quand on lance une EC2, RDS ou un cluster ECS sur AWS, il faut bien que ces ressources **vivent quelque part** sur un réseau, avec des règles claires :

- Une **plage d'IP** qu'on contrôle.
- Une **isolation** vis-à-vis des autres clients AWS et même de ses propres autres workloads.
- Un **contrôle** sur ce qui peut entrer et sortir (vers Internet, vers d'autres VPC, vers son data center on-prem, vers d'autres services AWS).

C'est exactement le rôle du **VPC** (Virtual Private Cloud) : un **réseau privé virtuel** entièrement à soi, à l'intérieur d'une région AWS, dans lequel on déploie ses ressources.

### 1.2 — L'analogie de l'immeuble

Si la **région** est un quartier et l'**AZ** un pâté de maisons :

- Un **VPC** est un **immeuble** dont on est propriétaire. On choisit le plan, on attribue les **numéros d'appartement** (plages IP), on décide qui peut entrer et par quelle porte (security groups), on décide si l'ascenseur descend jusqu'à la rue (Internet Gateway) ou s'arrête au sous-sol (subnet privé).
- Un **subnet** est un **étage** de l'immeuble. Chaque étage est dans **un seul** pâté de maisons (AZ). Certains étages ont une fenêtre sur la rue (subnet public), d'autres non (subnet privé).
- Une **NAT Gateway**, c'est le **concierge** : les habitants des étages sans fenêtre peuvent lui confier leur courrier pour l'envoyer dehors, mais personne de l'extérieur ne peut leur écrire directement.
- Une **table de routage**, c'est le **plan d'évacuation** : quand un paquet veut sortir, où va-t-il ? Vers la rue ? Vers le concierge ? Vers un autre étage ?

### 1.3 — Sans VPC, pas d'AWS moderne

Historiquement (jusqu'à 2013), AWS avait un mode "EC2 Classic" où les instances vivaient sur un grand réseau partagé entre tous les clients. Aujourd'hui : **tout est dans un VPC**, point. Quand on lance une EC2 sans préciser de VPC, AWS la place dans le **default VPC** créé automatiquement par compte et par région.

> Le default VPC est pratique pour démarrer, **mais ne convient pas pour la production**. Il a une structure imposée, des subnets publics partout, et ne permet pas de séparer cleanement les workloads.

### 1.4 — Anti-patterns d'entrée

| Anti-pattern                                      | Conséquence                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Utiliser le default VPC en production.            | Pas de subnet privé propre, mélange dev/prod, audit difficile. |
| Mettre tout son SI dans **un seul** subnet `/24`. | 251 IP utilisables → saturation à la première extension.       |
| Faire chevaucher les CIDR de plusieurs VPC.       | Impossibilité future de peering — il faudra tout migrer.       |
| Ne pas documenter le plan d'adressage.            | Conflits à chaque nouveau projet ; cauchemar à 18 mois.        |

La section suivante donne le bagage pour éviter ces pièges.

---

## 2. Anatomie d'un VPC

### 2.1 — Rappel CIDR en 2 minutes

**CIDR** = Classless Inter-Domain Routing. La notation `10.0.0.0/16` signifie :

- IP de base : `10.0.0.0`.
- `/16` : les **16 premiers bits** sont fixés (le **préfixe réseau**). Les 16 bits suivants varient → 2^16 = **65 536 adresses**.

Tableau de référence à garder sous le coude :

| CIDR  | Nombre d'IP | Exemple d'usage VPC                         |
| ----- | ----------- | ------------------------------------------- |
| `/16` | 65 536      | VPC entier d'une grande organisation        |
| `/20` | 4 096       | VPC moyen ; subnet d'une grosse application |
| `/24` | 256         | Subnet standard                             |
| `/26` | 64          | Petit subnet (4 utiles : voir 3.3)          |
| `/28` | 16          | **Minimum** AWS pour un subnet (11 utiles)  |

### 2.2 — Choisir la plage CIDR du VPC

Quand on crée un VPC, on lui attribue une plage CIDR. Trois règles à appliquer :

1. **Utiliser une plage RFC 1918** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). C'est techniquement faisable d'utiliser une plage publique, mais c'est presque toujours une erreur (conflits inévitables).
2. **Choisir une taille suffisante** : `/16` (65k IP) pour un VPC sérieux, `/20` (4k IP) pour un VPC plus modeste. Éviter `/24` au niveau du VPC — on est très vite à l'étroit.
3. **Documenter et coordonner** entre VPC pour éviter les **chevauchements** : si VPC-A est en `10.0.0.0/16` et VPC-B en `10.1.0.0/16`, on pourra les peerer plus tard. S'ils sont tous deux en `10.0.0.0/16`, impossible.

**Convention recommandée chez beaucoup d'organisations :**

```
10.<env>.<region>.0/16
  où env = 0 (prod), 1 (staging), 2 (dev)
  et region = 0 (eu-west-1), 1 (eu-west-3), 2 (us-east-1), ...
```

Ainsi `10.0.0.0/16` = prod en eu-west-1, `10.1.0.0/16` = staging en eu-west-1, etc. Tout est documenté, pas de collision.

### 2.3 — Limites importantes

- **Taille VPC** : entre `/16` (max) et `/28` (min). En pratique, viser `/16` ou `/20`.
- **CIDR secondaires** : un VPC peut avoir jusqu'à **5 plages CIDR** au total (1 primaire + 4 additionnelles), utile pour étendre un VPC saturé sans le recréer.
- **Quota** : 5 VPC par région par compte par défaut (relevable via support).

### 2.4 — Le default VPC

À la création d'un compte, AWS crée automatiquement **un VPC par région** :

- CIDR : `172.31.0.0/16`.
- Un subnet **public** par AZ (CIDR `/20` chacun).
- Internet Gateway attaché.
- Table de routage avec route vers l'IGW.
- DNS public et résolution DNS activés.

**À l'usage :** le default VPC est utile pour les **expérimentations**, mais **toujours créer un VPC custom** pour un workload qu'on a l'intention de garder.

```bash
# Lister les VPC d'une région
aws ec2 describe-vpcs --region eu-west-1 \
  --query 'Vpcs[].{Id:VpcId, CIDR:CidrBlock, IsDefault:IsDefault, State:State}'
```

---

## 3. Le subnet

### 3.1 — Définition

Un **subnet** est une **sous-plage CIDR** du VPC, **rattachée à une seule AZ**, dans laquelle on déploie effectivement les ressources (EC2, RDS, etc.).

Trois invariants à graver :

- Un subnet appartient à **un VPC** (et un seul).
- Un subnet est dans **une AZ** (et une seule).
- Un subnet a un **CIDR** strictement inclus dans celui du VPC, **sans chevauchement** avec les autres subnets du VPC.

### 3.2 — Public vs privé — la **vraie** distinction

C'est **le** point qui dépasse la majorité des débutants AWS, alors qu'il est trivial une fois saisi :

> Un subnet est **public** ou **privé** **uniquement** selon le contenu de sa **table de routage**.
>
> - Si la table de routage du subnet contient une route `0.0.0.0/0 → Internet Gateway`, le subnet est **public**.
> - Sinon, il est **privé**.

Il n'y a **pas** d'attribut "public/privé" sur un subnet AWS. C'est une **propriété émergente** de la route configurée. Cette compréhension élimine 90 % des bugs de débutant ("pourquoi mon instance n'a pas Internet ?").

**Conséquences pratiques :**

- Une instance dans un subnet public peut avoir une **IP publique** auto-assignée ou une EIP, et atteindre Internet directement.
- Une instance dans un subnet privé n'a **jamais** d'IP publique sur son interface. Pour atteindre Internet, elle doit passer par une **NAT Gateway** (sortie uniquement).

### 3.3 — Les 5 IP réservées par AWS

Dans **chaque** subnet, AWS réserve **5 IP** non utilisables :

| IP                           | Usage AWS                                          |
| ---------------------------- | -------------------------------------------------- |
| `.0` (premier de la plage)   | Adresse réseau (standard RFC).                     |
| `.1`                         | Réservée AWS — passerelle implicite du VPC.        |
| `.2`                         | Réservée AWS — résolution DNS (Route 53 Resolver). |
| `.3`                         | Réservée AWS — usage futur.                        |
| `.255` (dernier de la plage) | Adresse de broadcast (standard RFC).               |

Donc pour un subnet `/24` (256 IP) : **251 IP utilisables**, pas 256.

Pour un `/28` (16 IP, taille minimale AWS) : **11 IP utilisables**. Suffisant pour 8-10 instances petites, pas plus.

### 3.4 — Dimensionner un subnet

Quatre règles d'or :

1. **Plus gros est mieux** (au début) : un `/24` (251 IP utiles) est presque toujours plus pertinent qu'un `/27` (27 IP utiles), même si on prévoit "seulement 10 instances". On ne regrette jamais d'avoir pris large ; on regrette **toujours** d'avoir pris trop petit.
2. **Tenir compte de l'élasticité** : un Auto Scaling Group peut faire grossir le nombre d'instances. RDS Multi-AZ crée une instance de standby dans un autre subnet. EKS scale les pods. **Toujours** prévoir 3 à 5× la capacité observée.
3. **Symétrie entre AZ** : si on a 2 AZ, deux subnets de même taille (par exemple `/24` chacun). Pas de raison de favoriser une AZ.
4. **Garder de la marge dans le VPC** : un VPC `/16` (65k IP) découpé en subnets `/20` (4k IP chacun) laisse de la marge pour des subnets futurs. Un `/16` découpé entièrement en 256 subnets `/24` n'a aucune marge de manœuvre.

**Plan d'adressage type pour un VPC `10.0.0.0/16` à 2 AZ :**

| Subnet           | CIDR           | AZ           | Type   | Usage                 |
| ---------------- | -------------- | ------------ | ------ | --------------------- |
| `public-1a`      | `10.0.0.0/24`  | `eu-west-1a` | Public | Load Balancer, NAT GW |
| `public-1b`      | `10.0.1.0/24`  | `eu-west-1b` | Public | Load Balancer         |
| `private-app-1a` | `10.0.10.0/24` | `eu-west-1a` | Privé  | EC2 / ECS app         |
| `private-app-1b` | `10.0.11.0/24` | `eu-west-1b` | Privé  | EC2 / ECS app         |
| `private-db-1a`  | `10.0.20.0/24` | `eu-west-1a` | Privé  | RDS                   |
| `private-db-1b`  | `10.0.21.0/24` | `eu-west-1b` | Privé  | RDS                   |

Six subnets, beaucoup d'espace libre, croissance future possible (10.0.30.x, 10.0.40.x, …).

---

## 4. Internet Gateway

### 4.1 — Définition

Un **Internet Gateway (IGW)** est la **passerelle** entre le VPC et **Internet**. Trois propriétés à retenir :

- **Un IGW par VPC** maximum, et **un VPC par IGW**.
- **Sans IGW, aucune ressource du VPC ne peut atteindre Internet** ni être atteinte depuis Internet.
- **Géré, hautement disponible, gratuit** (on paye le trafic qui passe à travers, mais pas la ressource elle-même).

L'IGW lui-même est un objet logique : on ne le configure pas finement, on le **crée**, on l'**attache** à un VPC, et c'est tout. La vraie configuration se fait dans les **tables de routage** : c'est elles qui décident quels subnets l'utilisent.

### 4.2 — Création et attachement

```bash
# Créer un IGW
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=my-vpc-igw}]'

# Sortie : { "InternetGateway": { "InternetGatewayId": "igw-0abc..." } }

# Attacher au VPC
aws ec2 attach-internet-gateway \
  --internet-gateway-id igw-0abc... \
  --vpc-id vpc-0xyz...
```

À ce stade, l'IGW est **attaché** mais **aucun** subnet ne l'utilise encore. Il faut ajouter une route dans une table de routage (section 6).

### 4.3 — Sans IGW

Un VPC sans IGW est **complètement isolé d'Internet**. Cela peut être :

- **Voulu** : VPC strictement interne pour des workloads sensibles (ETL bancaire, traitement de données réglementées).
- **Subi** : on a oublié d'attacher l'IGW → debug typique du débutant qui se plaint que "rien ne marche".

---

## 5. NAT Gateway

### 5.1 — Le problème à résoudre

Un subnet **privé** n'a pas de route directe vers l'IGW (par définition). Pourtant, ses instances ont besoin de **télécharger des paquets** (mise à jour OS, dépendances logicielles, fetch d'API tiers, sync de configuration). Comment leur permettre de **sortir** vers Internet sans **être joignables depuis** Internet ?

Réponse : la **NAT Gateway**.

### 5.2 — Comment ça marche

Une **NAT Gateway** (Network Address Translation) :

- Se place **dans un subnet public** (donc avec accès à l'IGW).
- A une **Elastic IP** attachée (obligatoire à sa création).
- Reçoit le trafic des subnets privés, **réécrit l'IP source** en sa propre IP publique, et le forward vers Internet.
- Reçoit les réponses, **réécrit l'IP destination** vers l'instance privée d'origine, et la lui retourne.

```
Subnet privé                          Subnet public                    Internet
┌─────────────┐                       ┌───────────────┐                ┌─────────┐
│ EC2 priv    │   1. paquet TCP       │ NAT Gateway   │ 2. paquet TCP  │ api.    │
│ 10.0.10.5   │ ────────────────────→ │ 10.0.0.20     │ ────────────→  │ example │
│             │   src=10.0.10.5       │ EIP 52.49.x   │  src=52.49.x   │ .com    │
│             │   dst=api.ex.com      │               │  dst=api.ex.com│         │
│             │                       │               │                │         │
│             │   4. réponse          │               │ 3. réponse     │         │
│             │ ←──────────────────── │               │ ←──────────── │         │
└─────────────┘   dst=10.0.10.5       └───────────────┘   dst=52.49.x  └─────────┘
```

Conséquences :

- L'instance privée **peut initier** des connexions sortantes.
- L'instance privée **ne peut pas être** la destination d'une connexion initiée depuis Internet.
- Côté Internet, **toute** la flotte de subnets privés apparaît derrière la **même** IP publique (celle de la NAT Gateway).

### 5.3 — NAT Gateway vs NAT instance

Avant 2015, on construisait des **NAT instances** : EC2 dédiées faisant le job manuellement (iptables MASQUERADE Linux). Aujourd'hui, AWS recommande la **NAT Gateway managée** :

| Critère             | NAT Gateway (managée)                       | NAT instance (EC2 manuel)                    |
| ------------------- | ------------------------------------------- | -------------------------------------------- |
| Mise en service     | 1 commande, ~1 minute                       | Provisioning EC2 + config OS + AMI maintenue |
| Maintenance         | Aucune                                      | Patchs OS, monitoring, restarts              |
| Haute disponibilité | Au sein de l'AZ ; 1 par AZ pour HA inter-AZ | Manuel : Auto Scaling Group + scripts custom |
| Débit               | Jusqu'à 100 Gbps                            | Limité par le type d'instance                |
| Coût                | **0,045 $/h** + 0,045 $/GB                  | Coût EC2 + EBS + bande passante              |
| Cas d'usage         | **99 % des cas**                            | Cas exotiques (sortie via VPN custom, etc.)  |

**Recommandation par défaut :** NAT Gateway, sauf raison forte.

### 5.4 — Le coût — vrai sujet

Une NAT Gateway active 24/7 :

- **Heures** : 0,045 $/h × 730h = **~33 $/mois**.
- **Données** : 0,045 $/GB de trafic qui transite.

Pour un workload qui télécharge 100 GB/mois d'updates via NAT : 33 + 4,50 = ~37,50 $/mois.

**Multi-AZ → multiplier par AZ.** Pour une vraie résilience, **une NAT Gateway par AZ** est recommandée (sinon, si l'AZ contenant la NAT GW tombe, les subnets privés des autres AZ perdent Internet). Donc pour 3 AZ : **~100 $/mois** rien que pour les NAT, hors trafic.

**Optimisations courantes :**

- **VPC Endpoints** (vu en N4) pour S3 et DynamoDB : le trafic vers ces services contourne la NAT Gateway → économies importantes.
- En **non-prod**, accepter 1 seule NAT Gateway partagée entre AZ (résilience réduite, coût divisé).
- En **dev**, parfois pas de NAT du tout (les instances de dev sont dans le subnet public avec un SG strict, ou utilisent SSM Session Manager pour les updates).

---

## 6. La table de routage

### 6.1 — Définition

Une **table de routage** (route table) est un ensemble de règles qui dit, pour un paquet sortant d'un subnet, **où il doit aller**.

Une route est un couple **destination CIDR → cible** :

- Destination : `10.0.0.0/16` (le VPC lui-même), `0.0.0.0/0` (tout Internet), ou un CIDR plus spécifique.
- Cible : `local`, IGW, NAT GW, VPC peering, transit gateway, virtual private gateway, etc.

**Règle de matching :** le plus **spécifique** (préfixe le plus long) gagne. `10.1.2.3` match `10.1.2.0/24` plutôt que `10.0.0.0/8`.

### 6.2 — La route `local` — toujours présente

Chaque table de routage d'un VPC contient **automatiquement et obligatoirement** une route :

```
Destination     Cible
10.0.0.0/16     local
```

(en supposant que le VPC est en `10.0.0.0/16`). Cette route dit : "tout paquet à destination du VPC reste **dans** le VPC". On ne peut **ni la modifier ni la supprimer**.

C'est elle qui rend possible la communication interne entre subnets du même VPC, **gratuitement** et **automatiquement** — pas besoin de configurer du routage entre subnets.

### 6.3 — Subnet **public** — route vers IGW

Pour rendre un subnet public, on associe à son subnet une table de routage contenant :

```
Destination     Cible
10.0.0.0/16     local
0.0.0.0/0       igw-0abc1234
```

Lecture : "tout ce qui va vers le VPC reste local ; tout le reste passe par l'Internet Gateway". L'instance peut alors atteindre Internet (et, si elle a une IP publique, être atteinte depuis Internet).

### 6.4 — Subnet **privé** — route vers NAT Gateway

Pour rendre un subnet privé avec **sortie Internet** (cas le plus courant), on lui associe une table de routage contenant :

```
Destination     Cible
10.0.0.0/16     local
0.0.0.0/0       nat-0xyz5678
```

Lecture : "VPC en local ; Internet via la NAT Gateway". L'instance peut **sortir** (téléchargements, appels API) mais n'est **pas joignable** directement.

### 6.5 — Subnet **isolé** — pas de route `0.0.0.0/0`

Cas particulier vu en M4 : un subnet **complètement isolé**, sans Internet ni entrant ni sortant. Sa table de routage contient **uniquement** la route locale :

```
Destination     Cible
10.0.0.0/16     local
```

Cas d'usage : bases de données ultra-sensibles, traitements batch sur données isolées, environnements de conformité stricte.

### 6.6 — Association subnet ↔ table de routage

- Chaque subnet est associé à **exactement une** table de routage.
- Un VPC a une **table de routage principale** (`main`) à laquelle tout subnet non explicitement associé est rattaché par défaut.
- On peut créer des tables de routage **custom** et y associer les subnets explicitement (recommandé en production pour la lisibilité).

```bash
# Voir la table de routage d'un subnet
aws ec2 describe-route-tables \
  --filters "Name=association.subnet-id,Values=subnet-0abc..." \
  --query 'RouteTables[].Routes[].{Dest:DestinationCidrBlock, Target:GatewayId,Nat:NatGatewayId}'
```

---

## 7. Architecture VPC type — schéma complet

Le diagramme à mémoriser pour 80 % des déploiements AWS de production :

```
                              ┌──────────────────────────────────────────────────────┐
                              │ Région : eu-west-1                                   │
                              │                                                      │
                              │   ┌───────────────────────────────────────────────┐  │
                              │   │ VPC : 10.0.0.0/16                             │  │
Internet  ─────►  ┌────────┐  │   │                                               │  │
                  │  IGW   │──┤   │  ┌───── AZ eu-west-1a ─────────────────────┐  │  │
                  └────────┘  │   │  │                                          │ │  │
                              │   │  │  Subnet PUBLIC  10.0.0.0/24              │ │  │
                              │   │  │  RT: 0.0.0.0/0 → IGW                     │ │  │
                              │   │  │  ┌─────────┐  ┌────────────┐             │ │  │
                              │   │  │  │ALB target│  │NAT Gateway │             │ │  │
                              │   │  │  └─────────┘  └─────┬──────┘             │ │  │
                              │   │  │                     │                    │ │  │
                              │   │  │  Subnet PRIVATE 10.0.10.0/24             │ │  │
                              │   │  │  RT: 0.0.0.0/0 → NAT GW                  │ │  │
                              │   │  │  ┌──────────┐  ┌──────────┐              │ │  │
                              │   │  │  │ EC2 app  │  │  ECS task│              │ │  │
                              │   │  │  └──────────┘  └──────────┘              │ │  │
                              │   │  │                                          │ │  │
                              │   │  │  Subnet PRIVATE-DB 10.0.20.0/24          │ │  │
                              │   │  │  RT: 10.0.0.0/16 → local (only)          │ │  │
                              │   │  │  ┌──────────┐                            │ │  │
                              │   │  │  │ RDS master│                           │ │  │
                              │   │  │  └──────────┘                            │ │  │
                              │   │  └──────────────────────────────────────────┘ │  │
                              │   │                                                 │  │
                              │   │  ┌───── AZ eu-west-1b ─────────────────────┐  │  │
                              │   │  │  (subnets miroirs : public 10.0.1.0/24,  │  │  │
                              │   │  │   privé 10.0.11.0/24, db 10.0.21.0/24)   │  │  │
                              │   │  │   incluant NAT Gateway dédiée pour HA    │  │  │
                              │   │  └──────────────────────────────────────────┘ │  │
                              │   │                                                 │  │
                              │   └─────────────────────────────────────────────────┘  │
                              └──────────────────────────────────────────────────────┘
```

**Lecture du schéma :**

- **Public** héberge les **points d'entrée Internet** : ALB, NAT Gateway, bastion SSH éventuel. Les ressources y ont besoin d'un accès Internet bidirectionnel ou de servir de relais.
- **Private** héberge les **workloads applicatifs** (EC2, ECS, EKS nodes) : sortie Internet via NAT pour les updates, **pas** d'entrée Internet directe (l'entrée passe par l'ALB du subnet public).
- **Private-DB** héberge les **données** : aucune route vers Internet, ni entrante ni sortante. Communication uniquement intra-VPC (vers les EC2 du subnet private-app).

Cette structure **3 tiers x 2 AZ = 6 subnets** est le canon AWS pour une application web haute disponibilité. M4 reviendra dessus en détail.

---

## 8. Construire un VPC depuis zéro — guide pratique

L'objectif de cette section est de fournir le **script de référence** qu'on garde sous le coude pour créer un VPC propre. À adapter aux noms/CIDR.

### 8.1 — Plan

Ce qu'on va créer en 12 étapes :

1. Le VPC (CIDR `10.0.0.0/16`).
2. L'Internet Gateway, attaché au VPC.
3. Deux subnets publics (un par AZ).
4. Deux subnets privés (un par AZ).
5. Une Elastic IP pour la NAT Gateway.
6. La NAT Gateway dans le subnet public AZ-a.
7. Une table de routage publique avec route vers IGW.
8. Une table de routage privée avec route vers NAT Gateway.
9. Association des subnets aux tables de routage correspondantes.
10. Activation de l'auto-assignation d'IP publique sur les subnets publics.
11. Test de connectivité depuis une instance dans chaque subnet.
12. Documentation (tags partout).

### 8.2 — Script CLI complet

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION=eu-west-1
AZ_A=eu-west-1a
AZ_B=eu-west-1b
VPC_NAME=my-vpc

# 1. Création du VPC
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --region $REGION \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$VPC_NAME}]" \
  --query 'Vpc.VpcId' --output text)

# Activer DNS dans le VPC
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support

echo "VPC créé : $VPC_ID"

# 2. Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=$VPC_NAME-igw}]" \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
echo "IGW créé et attaché : $IGW_ID"

# 3. Subnets publics
PUBLIC_A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.0.0/24 --availability-zone $AZ_A \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$VPC_NAME-public-a}]" \
  --query 'Subnet.SubnetId' --output text)
PUBLIC_B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone $AZ_B \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$VPC_NAME-public-b}]" \
  --query 'Subnet.SubnetId' --output text)
echo "Subnets publics : $PUBLIC_A, $PUBLIC_B"

# 4. Subnets privés
PRIVATE_A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.10.0/24 --availability-zone $AZ_A \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$VPC_NAME-private-a}]" \
  --query 'Subnet.SubnetId' --output text)
PRIVATE_B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.11.0/24 --availability-zone $AZ_B \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$VPC_NAME-private-b}]" \
  --query 'Subnet.SubnetId' --output text)
echo "Subnets privés : $PRIVATE_A, $PRIVATE_B"

# 5-6. NAT Gateway (dans le public-a)
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
NAT_ID=$(aws ec2 create-nat-gateway \
  --subnet-id $PUBLIC_A --allocation-id $EIP_ALLOC \
  --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=$VPC_NAME-nat-a}]" \
  --query 'NatGateway.NatGatewayId' --output text)
echo "NAT Gateway en cours de création : $NAT_ID (attente : ~1 min)"

aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_ID
echo "NAT Gateway disponible"

# 7. Table de routage publique
RT_PUBLIC=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$VPC_NAME-rt-public}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $RT_PUBLIC --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# 8. Table de routage privée
RT_PRIVATE=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$VPC_NAME-rt-private}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $RT_PRIVATE --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_ID

# 9. Associations
aws ec2 associate-route-table --route-table-id $RT_PUBLIC --subnet-id $PUBLIC_A
aws ec2 associate-route-table --route-table-id $RT_PUBLIC --subnet-id $PUBLIC_B
aws ec2 associate-route-table --route-table-id $RT_PRIVATE --subnet-id $PRIVATE_A
aws ec2 associate-route-table --route-table-id $RT_PRIVATE --subnet-id $PRIVATE_B

# 10. Auto-assignation IP publique sur les subnets publics
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_A --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_B --map-public-ip-on-launch

echo "VPC complet :"
echo "  VPC ID : $VPC_ID"
echo "  Subnets publics : $PUBLIC_A, $PUBLIC_B"
echo "  Subnets privés  : $PRIVATE_A, $PRIVATE_B"
echo "  IGW : $IGW_ID"
echo "  NAT : $NAT_ID"
```

### 8.3 — Validation pas à pas

Après exécution, vérifier :

```bash
# 1. Le VPC existe avec le bon CIDR
aws ec2 describe-vpcs --vpc-ids $VPC_ID \
  --query 'Vpcs[].{Id:VpcId, CIDR:CidrBlock, State:State}'

# 2. Les 4 subnets sont actifs et bien réparties sur 2 AZ
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].{Name:Tags[?Key==`Name`]|[0].Value, CIDR:CidrBlock, AZ:AvailabilityZone, AutoPublicIP:MapPublicIpOnLaunch}'

# 3. Les tables de routage ont les bonnes routes
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[].{Name:Tags[?Key==`Name`]|[0].Value, Routes:Routes[].{Dest:DestinationCidrBlock, IGW:GatewayId, NAT:NatGatewayId}}'

# 4. La NAT Gateway est disponible avec une EIP
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC_ID" \
  --query 'NatGateways[].{Id:NatGatewayId, State:State, EIP:NatGatewayAddresses[0].PublicIp}'
```

### 8.4 — Démontage propre

**Important** : la NAT Gateway et l'EIP sont **facturées tant qu'elles existent**. Penser à détruire en sens inverse en fin de TP :

```bash
# Ordre inverse, dépendances respectées
aws ec2 delete-nat-gateway --nat-gateway-id $NAT_ID
aws ec2 wait nat-gateway-deleted --nat-gateway-ids $NAT_ID

aws ec2 release-address --allocation-id $EIP_ALLOC

# Délier route tables des subnets, puis supprimer
# (les associations sont récupérables via describe-route-tables)
# Supprimer les routes 0.0.0.0/0, puis les route tables custom
# Supprimer les subnets
# Détacher et supprimer l'IGW
# Supprimer le VPC
```

Pour la pratique, il est plus rapide de **passer par Terraform / CloudFormation** dès qu'on dépasse l'exploration. Le script CLI ci-dessus est pédagogique ; en prod, on ne le tape pas à la main.

---

## 9. Exercices pratiques

### Exercice 1 — Créer un VPC public/privé à 2 AZ (≈ 90 min)

**Objectif.** Mettre en pratique la totalité du module.

**Étapes :**

1. Exécuter le script de la section 8.2 dans une région où on n'a pas encore de VPC custom.
2. Vérifier toutes les étapes de validation 8.3.
3. Lancer une instance EC2 t3.micro dans **le subnet public-a** avec :
   - Un Security Group autorisant SSH depuis son IP perso (ou Session Manager activé).
   - Une key pair.
4. Vérifier qu'elle a une IP publique auto-assignée.
5. Lancer une seconde instance EC2 t3.micro dans **le subnet private-a** avec :
   - Un Security Group autorisant tout depuis le SG de l'instance publique.
   - Pas d'IP publique.
6. **Démonter** toutes les ressources à la fin (sinon facturation NAT GW continue).

**Livrable.** Capture des IP des deux instances et confirmation visuelle qu'elles sont dans les bonnes AZ et les bons subnets.

### Exercice 2 — Tester la connectivité (≈ 30 min)

**Suite de l'exercice 1.** Depuis l'instance privée, tester :

1. `ping 8.8.8.8` (Internet via NAT GW) — doit fonctionner.
2. `curl https://api.github.com` — doit fonctionner.
3. Tenter une connexion SSH depuis Internet vers l'instance privée — **doit échouer** (pas d'IP publique, SG fermé).
4. Depuis l'instance publique, `ssh ec2-user@10.0.10.X` vers l'instance privée — doit fonctionner si SG correct.

**Livrable.** Mini-rapport de 5 lignes : ce qui marche, ce qui ne marche pas, pourquoi.

### Exercice 3 — Diagnostic d'un VPC cassé (≈ 30 min)

**Objectif.** Reconnaître les symptômes des mauvais branchements.

**Setup.** Sur le VPC créé en exercice 1, casser **délibérément** une des configs ci-dessous, sans dire laquelle, et faire diagnostiquer par un binôme :

- Supprimer la route `0.0.0.0/0` de la table de routage privée.
- Supprimer la route `0.0.0.0/0` de la table de routage publique.
- Détacher l'IGW du VPC.
- Détacher la NAT Gateway.
- Décocher l'auto-assignation d'IP publique sur le subnet public.

**Livrable.** Une grille "symptôme observé → cause probable → commande de diagnostic → correction" pour chacun des cas.

### Exercice 4 — Plan d'adressage IP (≈ 30 min)

**Objectif.** Penser un plan d'adressage avant d'écrire le moindre Terraform.

**Cas :** une entreprise va avoir 3 environnements (prod, staging, dev), chacun dans 2 régions (`eu-west-1` et `eu-west-3`), chacun avec **public + private-app + private-db**.

**Livrable.** Un tableau d'adressage complet (12 VPC × 6 subnets = 72 lignes) **sans chevauchement**, en justifiant les choix de taille. Pas besoin de déployer — c'est l'exercice de planification qui compte.

### Mini-défi — Comparer les coûts de plusieurs topologies (≈ 30 min)

Comparer le **coût mensuel** (NAT, EIP, trafic, sans EC2) de :

- **Topo A** : 1 VPC, 1 AZ, 1 NAT Gateway.
- **Topo B** : 1 VPC, 2 AZ, 1 NAT Gateway partagée (au coût d'une résilience moindre).
- **Topo C** : 1 VPC, 2 AZ, 2 NAT Gateways (1 par AZ).
- **Topo D** : 1 VPC, 3 AZ, 3 NAT Gateways.

**Livrable.** Tableau de coûts + recommandation par profil de workload (dev / pré-prod / prod / prod critique).

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un **VPC** (en mentionnant région, isolation, plage CIDR).
- [ ] Définir un **subnet** (en mentionnant AZ, CIDR, et IP réservées).
- [ ] Expliquer ce qui fait qu'un subnet est **public ou privé** (réponse : la table de routage).
- [ ] Définir une **Internet Gateway** et son rôle.
- [ ] Définir une **NAT Gateway**, son rôle, et son coût d'ordre de grandeur (~33 $/mois par NAT + trafic).
- [ ] Distinguer **NAT Gateway** et **NAT instance**.
- [ ] Définir une **table de routage**, lire ses entrées, expliquer le matching le plus spécifique.
- [ ] Lister les **5 IP réservées** par AWS dans un subnet et leur rôle.
- [ ] Dimensionner un subnet pour un workload donné en justifiant le choix de CIDR.
- [ ] Construire un **VPC à 2 AZ avec subnets publics et privés** depuis la CLI ou Terraform.
- [ ] Diagnostiquer pourquoi une instance d'un subnet privé ne sort pas sur Internet (5 causes possibles).

### Items du glossaire visés

**N1 atteint** :

- _ressources réseaux principales de VPC : subnet, NAT gateway, table de routage_ — sections 3, 5, 6.

**Préparation N2** (couvert plus en profondeur en M4) :

- _types de sous-réseaux disponibles et bonnes pratiques associées_ — survolé en section 7, approfondi en M4.

---

## 11. Ressources complémentaires

### Documentation AWS

- [VPC User Guide](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [VPC and subnet sizing](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html)
- [NAT Gateway documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- [Route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)

### Outillage

- [AWS VPC Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/) — diagnostiquer pourquoi un paquet ne passe pas.
- [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html) — log toutes les connexions, indispensable pour le debug réseau et la sécurité.

### Infrastructure as Code

- [Terraform AWS VPC module](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest) — référence communautaire, à étudier comme exemple de structure.
- [CloudFormation Quickstart VPC](https://aws.amazon.com/quickstart/architecture/vpc/) — template officiel AWS.

### Pour aller plus loin

- **M3 (Sécurité réseau)** : Security Groups et NACL — comment filtrer le trafic au sein du VPC qu'on vient de créer.
- **M4 (Types de sous-réseaux)** : approfondissement du raisonnement public/privé/isolé selon les workloads.
- **VPC Endpoints** (niveau 4) : éviter les frais de NAT Gateway pour le trafic vers S3, DynamoDB et autres services AWS.
- **VPC Peering et Transit Gateway** (niveau 3-4) : connecter plusieurs VPC entre eux.
