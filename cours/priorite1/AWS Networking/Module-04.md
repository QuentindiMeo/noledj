# M4 — Types de sous-réseaux

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer les **trois types fondamentaux** de subnets — **public**, **privé** (avec sortie via NAT), **isolé** (sans aucune route Internet) — et savoir lequel choisir pour chaque type de ressource.
- Décrire les **subnets spécialisés** récurrents : subnet d'ALB, **DB subnet group** RDS, subnet pour **VPC endpoints**, subnet pour **Lambda VPC**, subnet pour nodes **EKS / ECS**, subnet pour **Transit Gateway attachments**.
- Énoncer les **bonnes pratiques d'exposition** : ce qu'on expose sur Internet, ce qui doit être privé, ce qui doit être isolé, et les anti-patterns récurrents.
- **Concevoir** le plan de subnets d'une **application 3-tiers** (web + app + DB) sur 2 ou 3 AZ, avec dimensionnement justifié et liste des Security Groups associés.
- Reconnaître les **patterns d'architecture** typiques et leurs implications réseau : ALB + EC2 + RDS, Lambda + RDS, ECS Fargate + Aurora, EKS, plateforme SaaS.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (régions, AZ, IP), M2 (VPC, IGW, NAT, route tables), M3 (Security Groups et NACL).
- Connaissance des services AWS principaux : EC2, ALB, RDS, Lambda. Pas besoin d'être expert, juste savoir ce que chacun est.

---

## 1. Pourquoi le sujet est central

### 1.1 — Le placement, première décision de sécurité

Avant les Security Groups, avant les rôles IAM, avant tout le reste : **dans quel subnet** on met une ressource détermine ce qu'elle peut faire et ce qu'on peut lui faire. Trois faits à graver :

- Une **base de données** dans un subnet public est exposée à Internet, même avec un SG fermé. Une erreur de SG plus tard et c'est la fuite de données.
- Un **bastion** dans un subnet privé est inutile (personne ne peut le joindre).
- Une **NAT Gateway** dans un subnet privé ne fait rien (elle a besoin d'un IGW).

Le placement n'est pas un détail d'opérations — c'est un **choix d'architecture** qui détermine ce qui est possible et ce qui est interdit, **avant même** les autres couches de sécurité.

### 1.2 — L'analogie de la sécurité d'un magasin

Dans un magasin physique :

- La **vitrine** est en façade : tout le monde peut la voir, c'est fait pour ça.
- Le **comptoir** et la **caisse** sont à l'intérieur : les clients y vont mais ne franchissent pas le comptoir.
- La **réserve** est au fond, accessible uniquement aux employés.
- Le **coffre-fort** est dans une pièce blindée à part, accessible uniquement avec des procédures spéciales.

Personne ne mettrait la caisse en pleine vitrine ni le coffre-fort dans la zone client. C'est exactement la logique des types de subnets AWS : **on place les choses au bon endroit selon ce qu'elles font et ce qu'elles contiennent**.

### 1.3 — Trois niveaux d'exposition, trois familles de ressources

| Type de subnet | Exposition Internet                           | Pour quoi                                                   |
| -------------- | --------------------------------------------- | ----------------------------------------------------------- |
| **Public**     | Entrée + sortie Internet possibles            | Vitrine : ALB public, NAT Gateway, bastion, edge components |
| **Privé**      | Sortie Internet via NAT, pas d'entrée directe | Compute applicatif : EC2 / ECS / Lambda métier              |
| **Isolé**      | Aucun Internet, ni entrée ni sortie           | Coffre : RDS, ElastiCache, données sensibles                |

Le module détaille chaque famille, puis les **variantes spécialisées**.

---

## 2. Les trois types fondamentaux

### 2.1 — Subnet public

**Définition.** Un subnet est **public** si sa table de routage contient une route `0.0.0.0/0 → Internet Gateway`. C'est la **seule** caractéristique qui le rend public (vu en M2).

**Caractéristiques :**

- Entrée Internet **possible** si l'instance a une IP publique (ou EIP) et que son SG l'autorise.
- Sortie Internet **directe** via l'IGW (pas de NAT Gateway nécessaire).
- Auto-assignation d'IP publique souvent activée (`map-public-ip-on-launch=true`).

**Ce qu'on met dans un subnet public — la liste courte :**

| Ressource                                 | Raison                                           |
| ----------------------------------------- | ------------------------------------------------ |
| **Application Load Balancer**             | Point d'entrée HTTP/HTTPS du trafic public.      |
| **Network Load Balancer** (si public)     | Idem pour TCP/UDP brut.                          |
| **NAT Gateway**                           | Doit avoir accès à l'IGW pour faire son travail. |
| **Bastion SSH** (si encore utilisé)       | Point d'entrée d'admin.                          |
| **Edge appliances** (firewall WAF, proxy) | Doivent voir le trafic Internet.                 |

**Ce qu'on n'y met JAMAIS :**

- **Bases de données** (RDS, ElastiCache, OpenSearch, DynamoDB en VPC) — risque d'exposition directe.
- **EC2 d'application métier** sensible (sauf à devoir y mettre une API publique sans LB, ce qui est rare).
- **Lambdas** (les Lambdas en VPC vont dans des subnets privés — voir 3.4).

**Dimensionnement typique :** plus petit que les subnets privés. Un `/24` (256 IP, 251 utiles) suffit largement pour héberger ALB + NAT GW + quelques bastion / edge. Plus souvent, on met un `/26` (64 IP, 59 utiles).

### 2.2 — Subnet privé (avec sortie Internet via NAT)

**Définition.** Un subnet est **privé** si sa table de routage contient une route `0.0.0.0/0 → NAT Gateway`. Pas d'IGW direct ; la sortie passe par la NAT.

**Caractéristiques :**

- **Pas d'entrée Internet directe** : un attaquant ne peut **pas** se connecter aux ressources depuis Internet.
- **Sortie Internet via NAT** : les ressources peuvent télécharger updates, appeler API tierces, etc.
- **Latence et coût** : un peu plus de latence pour la sortie (passage NAT), facturation du trafic NAT.

**Ce qu'on met dans un subnet privé — l'essentiel du compute applicatif :**

| Ressource                    | Raison                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| **EC2 d'application métier** | Le tier compute. Reçoit du trafic interne (de l'ALB).             |
| **ECS Fargate / EC2 tasks**  | Conteneurs applicatifs.                                           |
| **EKS worker nodes**         | Nodes Kubernetes.                                                 |
| **Lambdas en VPC**           | Quand une Lambda doit accéder à des ressources VPC privées.       |
| **EMR / Glue workers**       | Compute analytique.                                               |
| **Bastion** (alternative)    | Si on tient à le mettre en privé + accès via SSM Session Manager. |

**Dimensionnement typique :** **plus gros** que public, car le tier compute scale. Un `/22` (1 022 IP utiles) pour un cluster EKS de production qui peut faire scale à 500 pods avec leur propre IP. Un `/24` standard sinon.

### 2.3 — Subnet isolé (sans Internet du tout)

**Définition.** Un subnet est **isolé** si sa table de routage ne contient **aucune route Internet** — ni vers IGW ni vers NAT. Seule la route `local` du VPC reste.

**Caractéristiques :**

- **Aucune entrée Internet directe.**
- **Aucune sortie Internet du tout.**
- Communication possible **uniquement** avec les autres subnets du VPC, ou via VPC peering / Transit Gateway / VPC Endpoints (services AWS).

**Ce qu'on met dans un subnet isolé — les données et services managés sensibles :**

| Ressource                                              | Raison                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **RDS / Aurora**                                       | Bases de données : pas besoin d'Internet, doivent être inaccessibles depuis l'extérieur. |
| **ElastiCache**                                        | Cache Redis / Memcached : idem.                                                          |
| **OpenSearch / ElasticSearch**                         | Idem.                                                                                    |
| **MQ (RabbitMQ / ActiveMQ managé)**                    | Idem.                                                                                    |
| **Traitement de données sensibles** (HDS, classifiées) | Pas d'exfiltration possible (pas de sortie).                                             |

**Dimensionnement typique :** **moyen**. Un `/24` est plus que suffisant pour quelques instances RDS et caches. Les services managés (RDS, ElastiCache) ne consomment qu'**une IP par instance** dans le subnet.

### 2.4 — Le tableau récapitulatif

| Caractéristique             | Public                      | Privé (avec NAT)               | Isolé                        |
| --------------------------- | --------------------------- | ------------------------------ | ---------------------------- |
| Route vers IGW              | `0.0.0.0/0 → IGW`           | Non                            | Non                          |
| Route vers NAT              | Non                         | `0.0.0.0/0 → NAT GW`           | Non                          |
| Entrée Internet             | Possible (avec IP publique) | Non                            | Non                          |
| Sortie Internet             | Directe                     | Via NAT                        | Non                          |
| Coût NAT                    | N/A                         | ~33 $/mois + trafic            | N/A                          |
| Cas d'usage type            | ALB, NAT GW, bastion        | EC2 app, Lambda VPC, EKS nodes | RDS, ElastiCache, OpenSearch |
| Dimensionnement             | Petit (/26 à /24)           | Gros (/24 à /22)               | Moyen (/24)                  |
| Risque en cas de mauvais SG | Élevé (exposition Internet) | Modéré (interne VPC)           | Très faible (isolation)      |

---

## 3. Subnets spécialisés — variantes à connaître

### 3.1 — Subnets d'Application Load Balancer

Un **ALB** a besoin d'**au moins deux subnets**, dans **deux AZ différentes**, pour assurer la haute disponibilité. La distinction :

- **ALB public** (`internet-facing`) → subnets **publics** uniquement. L'ALB a une IP publique par AZ.
- **ALB interne** (`internal`) → subnets **privés** (ou isolés s'ils n'ont pas besoin de sortie). L'ALB n'a que des IP privées.

**À retenir :** un ALB **public** n'est jamais dans un subnet privé. Un ALB **interne** n'est jamais dans un subnet public (sauf à exposer involontairement des IP publiques).

### 3.2 — DB Subnet Group (RDS, Aurora, ElastiCache, …)

Un **DB Subnet Group** est une liste de subnets dans laquelle RDS (ou Aurora, ElastiCache) peut placer ses instances. Contraintes :

- **Au moins 2 subnets** dans **2 AZ différentes** (même pour une instance single-AZ — sinon impossible d'activer Multi-AZ plus tard).
- En général : **subnets isolés** dédiés aux DB (pattern `private-db-1a`, `private-db-1b`).
- Les SG de la DB référencent les SG de l'app (pattern vu en M3 : `5432 from sg-app`).

**Anti-pattern courant :** mettre la DB dans le même subnet que les EC2 d'application. Fonctionnel, mais :

- Mélange les rôles → audit difficile.
- Une mauvaise NACL au niveau du subnet impacte les deux.
- Difficile à séparer plus tard.

### 3.3 — Subnets pour VPC Endpoints

Un **VPC Endpoint** permet d'atteindre un service AWS (S3, DynamoDB, Kinesis, …) **sans passer par Internet** ni par la NAT Gateway. Deux types :

- **Gateway Endpoint** (gratuit) : S3 et DynamoDB. Ne nécessite pas de subnet — c'est une route dans la table de routage qui pointe vers un préfixe AWS.
- **Interface Endpoint** (payant, ~0,01 $/h + trafic) : la plupart des autres services (KMS, Secrets Manager, SSM, Kinesis, …). Nécessite **une ENI dans un subnet** — typiquement **un subnet privé par AZ**.

**Bonne pratique pour les Interface Endpoints :** créer un **subnet dédié** par AZ, petit (`/26`), pour héberger toutes les ENI d'endpoints. Cela facilite l'audit, le tagging, et le partage entre VPC via PrivateLink.

**Avantage économique d'un Gateway Endpoint S3 :** un workload qui transfère beaucoup vers S3 via NAT Gateway peut facilement coûter 100-1000 $/mois en frais NAT. Avec un Gateway Endpoint S3 : **0 $** de frais réseau pour ce trafic. ROI immédiat.

### 3.4 — Subnet pour Lambda en VPC

Une Lambda peut être **attachée à un VPC** quand elle a besoin d'accéder à des ressources privées (RDS, ElastiCache, EC2 internes). Contraintes :

- Lambda crée des **ENI** dans les subnets indiqués (1 ENI partagée par plusieurs invocations Lambda concurrent dans des conditions précises).
- Toujours en **subnet privé** (Lambda en subnet public n'a aucun sens — Lambda n'a pas d'IP publique de toute façon).
- **Sortie Internet** : si la Lambda doit appeler une API externe, elle a besoin du **NAT Gateway** du subnet.

**Bonne pratique :** dédier un (ou des) subnet(s) privé(s) aux Lambdas pour faciliter le dimensionnement (les Lambdas peuvent consommer beaucoup d'ENI sous forte charge — typiquement `/24` minimum).

**Note** : depuis 2019, Lambda utilise un pool d'ENI partagées (Hyperplane) — le risque d'épuisement d'IP est moindre, mais la séparation reste une bonne pratique en termes d'audit.

### 3.5 — Subnets pour EKS / ECS

**EKS** (Kubernetes managé) :

- Worker nodes : **subnets privés** (idéalement 3 AZ).
- ALB ingress : **subnets publics** (annotés `kubernetes.io/role/elb`).
- ALB ingress interne : **subnets privés** (annotés `kubernetes.io/role/internal-elb`).
- Avec **VPC CNI** (Amazon CNI), chaque pod consomme une IP du subnet → **dimensionner large** (`/22` ou `/20` recommandé pour une prod sérieuse).

**ECS Fargate** :

- Tasks : **subnets privés** typiquement.
- Une task Fargate prend une IP par tâche dans son subnet.

### 3.6 — Subnets pour Transit Gateway attachments

Un **Transit Gateway** (vu en niveau 3/4) connecte plusieurs VPC. L'attachement TGW au VPC crée des ENI dans des subnets dédiés.

**Bonne pratique :** créer un (ou des) subnet(s) **dédié(s) TGW**, très petits (`/28` suffit, 11 IP utiles, on n'en consomme que 1-2 par AZ).

---

## 4. Bonnes pratiques d'exposition

### 4.1 — Ce qu'on expose sur Internet

**Strict minimum** :

- **Load Balancers publics** (ALB, NLB). Tout le trafic public passe par eux ; on contrôle finement.
- **CloudFront** devant un site / API : ajoute une couche de mitigation DDoS et de cache.
- **API Gateway** : alternative pour exposer une API sans LB, avec gestion fine du throttling et de l'auth.
- **Route 53** : DNS, pas exactement "exposé" mais routage public.

C'est **tout**. Le reste ne touche pas Internet directement.

### 4.2 — Ce qui doit absolument être privé

- **Toutes les bases de données** sans exception.
- **Tous les caches** (Redis, Memcached).
- **Tous les bus de messages internes** (MSK, MQ, sauf si VPC peering vers partenaires).
- **Tous les services métier** sauf si ils sont l'API publique elle-même.
- **Toutes les Lambdas** (techniquement, les Lambdas non-VPC sont exposées via API Gateway ou autres ; les Lambdas en VPC vont en privé).

### 4.3 — Ce qui doit être isolé

- **Bases de données contenant des données personnelles ou sensibles** (RGPD, HDS, données financières).
- **Tout système nécessitant une garantie d'anti-exfiltration** : si le subnet n'a aucune sortie Internet, **rien** ne peut sortir, même si l'instance est compromise.
- **Environnements de conformité stricte** (PCI DSS, certifications spécifiques) où l'audit demande une isolation physique.

### 4.4 — Anti-patterns d'exposition

| Anti-pattern                                           | Risque                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| RDS publique avec SG ouvert pour "faciliter le debug". | Une seconde d'inattention et c'est la fuite de données.                               |
| EC2 publique avec port DB ouvert au monde.             | Crawlers de port scan automatisés trouvent l'instance en quelques minutes.            |
| ALB interne dans un subnet public.                     | L'ALB se voit attribuer une IP publique, exposition involontaire.                     |
| Lambda dans un subnet public.                          | Confusion conceptuelle ; Lambda n'a pas besoin de public, et c'est cher en NAT GW.    |
| NAT Gateway dans un subnet privé.                      | La NAT GW ne fonctionne pas (pas d'accès IGW).                                        |
| Tous les subnets privés (pas d'isolé pour la DB).      | Une compromission de l'app permet à l'attaquant d'**exfiltrer** depuis la DB via NAT. |
| Subnets non répartis sur plusieurs AZ.                 | Pas de haute disponibilité possible (RDS Multi-AZ, ALB cross-AZ, etc. impossibles).   |

---

## 5. Design d'une application 3-tiers — étude de cas

### 5.1 — Le cahier des charges

Conception d'une application 3-tiers en production sur AWS :

- **Tier 1 — Web** : front HTTPS public, served par un Application Load Balancer.
- **Tier 2 — App** : backend Python/FastAPI hébergé en EC2 Auto Scaling Group, recevant le trafic de l'ALB.
- **Tier 3 — Data** : base PostgreSQL RDS Multi-AZ + cache Redis ElastiCache.
- **Contraintes** : RGPD (région UE), résilience à la perte d'1 AZ, audit annuel de sécurité.

### 5.2 — Le schéma cible

```
                     ┌─────────────────────────────────────────────────────────────┐
                     │ Région : eu-west-1                                          │
                     │ VPC : 10.0.0.0/16                                           │
                     │                                                             │
Internet  ───►  IGW  │  ┌──── AZ eu-west-1a ────────────┐  ┌──── AZ eu-west-1b ──┐ │
                  │  │  │                              │  │                      │ │
                  │  │  │ public-a   10.0.0.0/24       │  │ public-b 10.0.1.0/24 │ │
                  └─►│  │ ┌─────────┐ ┌──────────────┐ │  │ ┌─────────┐          │ │
                     │  │ │ALB node │ │ NAT Gateway  │ │  │ │ALB node │          │ │
                     │  │ └─────────┘ └──────┬───────┘ │  │ └─────────┘          │ │
                     │  │                    │         │  │                      │ │
                     │  │ private-app-a      │         │  │ private-app-b        │ │
                     │  │ 10.0.10.0/24       │         │  │ 10.0.11.0/24         │ │
                     │  │ ┌─────────┐ ┌─────▼─────┐    │  │ ┌─────────┐          │ │
                     │  │ │ EC2 app │ │ Lambda    │    │  │ │ EC2 app │          │ │
                     │  │ └────┬────┘ └───────────┘    │  │ └────┬────┘          │ │
                     │  │      │                       │  │      │                │ │
                     │  │ private-db-a               │  │ private-db-b           │ │
                     │  │ 10.0.20.0/24    (ISOLÉ)    │  │ 10.0.21.0/24 (ISOLÉ)   │ │
                     │  │ ┌──────────┐ ┌──────────┐  │  │ ┌──────────┐           │ │
                     │  │ │RDS Master│ │ Redis     │  │  │ │RDS Standby│          │ │
                     │  │ └──────────┘ └──────────┘  │  │ └──────────┘           │ │
                     │  │                              │  │                       │ │
                     │  └──────────────────────────────┘  └───────────────────────┘ │
                     │                                                              │
                     │  + VPC Endpoint S3 (Gateway) — gratuit, route locale         │
                     │  + Interface Endpoints (KMS, Secrets Manager) — petit subnet │
                     │                                                              │
                     └──────────────────────────────────────────────────────────────┘
```

### 5.3 — Plan d'adressage détaillé

VPC : `10.0.0.0/16` (65 536 IP — large marge de manœuvre)

| Subnet          | CIDR            | AZ           | Type   | IP utiles | Contenu                                 |
| --------------- | --------------- | ------------ | ------ | --------- | --------------------------------------- |
| `public-a`      | `10.0.0.0/24`   | `eu-west-1a` | Public | 251       | ALB node, NAT GW                        |
| `public-b`      | `10.0.1.0/24`   | `eu-west-1b` | Public | 251       | ALB node, NAT GW (HA)                   |
| `private-app-a` | `10.0.10.0/24`  | `eu-west-1a` | Privé  | 251       | EC2 app, Lambda                         |
| `private-app-b` | `10.0.11.0/24`  | `eu-west-1b` | Privé  | 251       | EC2 app, Lambda                         |
| `private-db-a`  | `10.0.20.0/24`  | `eu-west-1a` | Isolé  | 251       | RDS Master, Redis                       |
| `private-db-b`  | `10.0.21.0/24`  | `eu-west-1b` | Isolé  | 251       | RDS Standby, Redis HA                   |
| `endpoint-a`    | `10.0.30.0/27`  | `eu-west-1a` | Privé  | 27        | Interface Endpoints (KMS, Secrets, SSM) |
| `endpoint-b`    | `10.0.30.32/27` | `eu-west-1b` | Privé  | 27        | Idem                                    |

Total alloué : ~1 500 IP sur 65 536 disponibles. Marge confortable pour des subnets supplémentaires (autre tier, autre projet, autre AZ).

### 5.4 — Security Groups associés

| SG                       | Inbound                                     | Outbound                                                                          |
| ------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `sg-alb`                 | `443 from 0.0.0.0/0`, `80 from 0.0.0.0/0`   | `8080 to sg-app`                                                                  |
| `sg-app`                 | `8080 from sg-alb`                          | `5432 to sg-db`, `6379 to sg-cache`, `443 to pl-S3`, `443 to 0.0.0.0/0` (via NAT) |
| `sg-db`                  | `5432 from sg-app`                          | (rien — aucune sortie nécessaire)                                                 |
| `sg-cache`               | `6379 from sg-app`                          | (rien)                                                                            |
| `sg-endpoints`           | `443 from sg-app` et `from sg-db` si besoin | (rien)                                                                            |
| `sg-bastion` (optionnel) | `22 from MY_IP/32`                          | `22 to sg-app`                                                                    |

### 5.5 — Variantes selon le contexte

**Variante "petit projet, budget serré"** :

- 1 seule AZ pour les subnets (économie sur NAT GW, RDS standby).
- 1 seul subnet privé "mixte" (app + DB).
- ALB remplacé par EC2 unique avec EIP (perd HA, accepté pour MVP).
- Coût : ~50 % moins cher. Acceptable seulement pour POC ou pré-prod.

**Variante "3 AZ pour haute disponibilité"** :

- Triple chaque subnet (public-a/b/c, private-app-a/b/c, private-db-a/b/c) = 9 subnets pour le cœur.
- 3 NAT GW (une par AZ) — coût +100 $/mois.
- RDS Multi-AZ + read replica en AZ-c — ROI sur disponibilité.

**Variante "sécurité maximale" (banque, santé)** :

- DB en subnet isolé **strict** (pas même de VPC endpoint vers S3 — backup vers un bucket dans le même compte via Lambda dans private-app).
- NACL custom sur le subnet DB qui n'autorise **explicitement** que les CIDR des subnets app.
- VPC Flow Logs activé sur toutes les ENI, exportés vers S3 puis SIEM externe.
- Pas de NAT GW : updates OS via SSM Patch Manager + repository miroir interne.

---

## 6. Patterns d'architecture récurrents — placement par défaut

### 6.1 — ALB + EC2 + RDS (le classique)

| Composant | Type de subnet | Notes                                 |
| --------- | -------------- | ------------------------------------- |
| ALB       | Public         | 2+ AZ                                 |
| EC2 app   | Privé (NAT)    | Auto Scaling Group across 2 AZ        |
| RDS       | Isolé          | DB Subnet Group 2 AZ, Multi-AZ activé |

### 6.2 — Lambda + RDS (serverless API + base)

| Composant   | Type de subnet             | Notes                                                  |
| ----------- | -------------------------- | ------------------------------------------------------ |
| API Gateway | (n'est pas dans un subnet) | Service public managé.                                 |
| Lambda      | Privé (NAT)                | Si appelle des API externes ou télécharge des secrets. |
| RDS         | Isolé                      | Idem cas 6.1.                                          |

**Optimisation typique :** si la Lambda n'appelle aucune API externe et utilise seulement RDS + Secrets Manager via VPC Endpoint, **pas de NAT GW requis** → ~33 $/mois économisés.

### 6.3 — ECS Fargate + Aurora (containers managés)

| Composant         | Type de subnet | Notes                                  |
| ----------------- | -------------- | -------------------------------------- |
| ALB               | Public         | Routage HTTP/HTTPS                     |
| ECS Fargate tasks | Privé (NAT)    | Chaque task prend 1 IP dans son subnet |
| Aurora cluster    | Isolé          | DB Subnet Group, multi-AZ              |

### 6.4 — EKS + RDS + EFS

| Composant             | Type de subnet                         | Notes                                 |
| --------------------- | -------------------------------------- | ------------------------------------- |
| ALB Ingress (public)  | Public — annotation `role/elb`         | Routage externe                       |
| ALB Ingress (interne) | Privé — annotation `role/internal-elb` | Routage interne service-mesh          |
| Worker nodes          | Privé (NAT)                            | Dimensionnement large : `/22` minimum |
| Control plane EKS     | (managé hors VPC client)               | AWS gère                              |
| RDS                   | Isolé                                  | Comme avant                           |
| EFS mount targets     | Privé                                  | 1 mount target par AZ                 |

### 6.5 — Plateforme SaaS multi-tenant

Trois sous-patterns courants :

- **Pool model** : tous les tenants partagent le même tier app et la même DB. Subnets standards (cas 6.1).
- **Silo model** : un cluster par tenant. Soit plusieurs comptes AWS (un par tenant) avec Landing Zone, soit plusieurs VPC dans le même compte.
- **Bridge model** : tier app partagé, DB séparée par tenant. Subnets app partagés, subnets DB groupés par tenant.

Pour le N2 ciblé par ce parcours, retenir surtout le **pool model** (cas 6.1 répliqué) et savoir que les autres existent.

---

## 7. Le cas du Lambda hors VPC vs en VPC — comparaison utile

Beaucoup de débutants AWS s'embrouillent sur Lambda et VPC. Le résumé :

| Aspect                       | Lambda hors VPC                          | Lambda en VPC                                                  |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| **Accès Internet**           | Direct (depuis le pool AWS)              | Via NAT Gateway (si subnet privé avec NAT)                     |
| **Accès aux ressources VPC** | Aucun (RDS, Redis privé non joignables)  | Possible                                                       |
| **Cold start**               | Court (~100 ms)                          | Court aujourd'hui aussi (Hyperplane), historiquement plus long |
| **Coût supplémentaire**      | Aucun                                    | NAT GW si sortie Internet nécessaire                           |
| **Quand l'utiliser ?**       | API publiques sans dépendance VPC privée | Accès à RDS, ElastiCache, EC2 internes                         |

**Règle simple :** Lambda en VPC **uniquement** si elle accède à une ressource privée du VPC. Sinon hors VPC, plus simple et moins cher.

---

## 8. Exercices pratiques

### Exercice 1 — Plan de subnets pour 3-tiers (≈ 45 min)

**Objectif.** Concevoir un plan complet avant de toucher à AWS.

**Cas :** application e-commerce. Front Next.js, API Node.js, PostgreSQL, Redis pour cache de session, files S3 pour images produits. RGPD obligatoire.

**Livrable.**

1. Schéma textuel ou ASCII du VPC : 2 AZ, tous les subnets avec leur CIDR et leur type.
2. Tableau récapitulatif des SG : nom, inbound, outbound (avec sources/destinations).
3. Justification écrite (10 lignes) du choix de **chaque** subnet et de **chaque** SG.
4. Liste des VPC endpoints utiles + estimation de leur ROI vs NAT.

### Exercice 2 — Migrer du default VPC vers une vraie archi (≈ 60 min)

**Objectif.** Réaliser à quel point le default VPC est inadapté en prod.

**Setup.** Un déploiement existe dans le default VPC : 1 EC2 web, 1 EC2 app, 1 RDS, tous dans des subnets publics (default).

**Étapes :**

1. Identifier **trois** problèmes de sécurité de ce setup.
2. Proposer un plan de migration vers le VPC créé en M2 : qui va où, dans quel ordre, avec quel downtime.
3. Écrire un script qui crée les SG cibles et les snapshot RDS / AMI EC2 nécessaires pour la bascule.
4. **Ne pas exécuter** la migration — c'est l'exercice de conception qui compte.

**Livrable.** Document de plan + script.

### Exercice 3 — Optimisation NAT vs VPC Endpoint (≈ 30 min)

**Objectif.** Mesurer concrètement l'apport d'un Gateway Endpoint S3.

**Setup.** Sur le VPC de M2, lancer une EC2 dans le subnet privé qui télécharge en boucle un fichier de 100 MB depuis un bucket S3.

**Étapes :**

1. Mesurer pendant 10 minutes le trafic NAT et le coût implicite (les Flow Logs aident).
2. Créer un VPC Endpoint S3 de type Gateway, l'attacher à la route table privée.
3. Relancer le test 10 minutes.
4. Comparer : trafic NAT, latence, coût.

**Livrable.** Tableau comparatif + recommandation pour des workloads qui transfèrent intensément vers S3.

### Exercice 4 — Cas spécial : isolation totale (≈ 30 min)

**Objectif.** Construire un subnet vraiment isolé.

**Étapes :**

1. Sur le VPC de M2, créer un nouveau subnet `private-isolated-a` dans `eu-west-1a` (CIDR `10.0.30.0/24`).
2. Créer une table de routage **sans** aucune route vers IGW / NAT (juste `local`).
3. Associer le subnet à cette table.
4. Lancer une EC2 dans ce subnet.
5. Vérifier : depuis cette EC2, `ping 8.8.8.8` doit échouer, mais `ping <ip-instance-private-app>` doit fonctionner.
6. Ajouter un VPC Endpoint Gateway S3 dans la table de routage isolée.
7. Vérifier : `aws s3 ls` doit maintenant fonctionner **sans** que le trafic sorte du VPC.

**Livrable.** Captures des tests + une phrase expliquant la subtilité (le Gateway Endpoint n'ajoute pas de route Internet mais ajoute une route spécifique vers S3).

### Mini-défi — Audit d'archi (≈ 30 min)

On vous montre les **règles SG d'une archi** existante (à inventer) :

```
sg-1 inbound: 5432 from 0.0.0.0/0
sg-2 inbound: 22 from 0.0.0.0/0, 443 from 0.0.0.0/0
sg-3 inbound: 80 from sg-2, 8080 from sg-2
sg-4 inbound: 6379 from 0.0.0.0/0
```

**Livrable.** Identifier les **trois ou quatre** problèmes majeurs, proposer la version durcie de chaque SG, justifier.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un subnet **public**, un subnet **privé** (avec NAT), un subnet **isolé** — en termes de **route table**.
- [ ] Donner pour chaque type 3 ressources à y placer typiquement et 1 ressource à **ne jamais** y placer.
- [ ] Énoncer la règle d'or "tout ce qui contient des données doit être en subnet isolé".
- [ ] Expliquer ce qu'est un **DB Subnet Group** et pourquoi il exige 2 AZ.
- [ ] Distinguer **VPC Endpoint Gateway** (S3/DynamoDB, gratuit) et **VPC Endpoint Interface** (autres services, payant + ENI dans subnet).
- [ ] Citer **3 anti-patterns** d'exposition et leur conséquence.
- [ ] Concevoir un **VPC 3-tiers** à 2 AZ avec plan d'adressage et SG associés.
- [ ] Distinguer Lambda **hors VPC** et Lambda **en VPC** et savoir quand utiliser chaque.
- [ ] Choisir le **bon type de subnet** pour : ALB public, EC2 backend, RDS, Lambda, NAT GW, bastion, EKS nodes, VPC Endpoint Interface.
- [ ] Reconnaître les **patterns** ALB+EC2+RDS, Lambda+RDS, ECS Fargate+Aurora, EKS.

### Items du glossaire visés

**N2 atteint** :

- _utilité de l'ensemble des types de sous-réseaux disponibles et bonnes pratiques associées_ — ce module en entier.

Avec M2 (subnet, NAT, route) + M3 (SG, NACL) + M4 (types et patterns), l'apprenant maîtrise désormais l'**ensemble du niveau VPC / réseau interne** ciblé par le parcours.

---

## 10. Ressources complémentaires

### Documentation AWS

- [VPC subnets](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html)
- [VPC Endpoints — Gateway vs Interface](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html)
- [Lambda VPC networking](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
- [EKS — Subnets for cluster](https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html)
- [Well-Architected — Networking](https://docs.aws.amazon.com/wellarchitected/latest/networking-lens/welcome.html)

### Patterns

- [AWS Solutions Library — 3-tier VPC](https://aws.amazon.com/solutions/case-studies/)
- [AWS — Whitepaper VPC Connectivity Options](https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/welcome.html)
- [SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html)

### Outils

- [VPC Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html)
- [AWS Network Manager](https://aws.amazon.com/network-manager/)
- [Terraform module 3-tier VPC](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest)

### Pour aller plus loin

- **M5 (Route 53)** : exposer un nom de domaine vers les ressources du VPC.
- **M6 (CloudFront)** : ajouter du caching et de la mitigation DDoS devant l'ALB.
- **M7 (API Gateway)** et **M8 (Load Balancers)** : approfondissement des points d'entrée.
- **Niveau 3-4** : VPC Peering, Transit Gateway, PrivateLink — interconnexion de VPC.
