# M8 — Load Balancers

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir un **Load Balancer** AWS, son rôle dans l'architecture (répartition de charge, terminaison TLS, intégration multi-AZ) et la différence avec une simple Elastic IP.
- Distinguer les **quatre types** de Load Balancer AWS — **ALB**, **NLB**, **CLB** (classique, déprécié), **GWLB** (Gateway) — et savoir lequel choisir.
- Expliquer en profondeur la **différence entre ALB et NLB** (couche OSI, fonctionnalités, latence, prix, cas d'usage) sur au moins six axes.
- Définir un **target group**, ses types (`instance`, `ip`, `lambda`), ses **health checks**, et son lien avec un listener.
- **Lier un nom de domaine** à un Load Balancer via Route 53 (record ALIAS) et certificat ACM.
- **Construire** un ALB devant 2 instances EC2 dans 2 AZ avec health checks fonctionnels.
- Réaliser le **mini-projet final du parcours Networking** : déployer une application derrière **ALB + CloudFront + Route 53** avec gestion DNS multi-AZ et failover.

## Durée estimée

1 à 2 jours, mini-projet final inclus.

## Pré-requis

- M1-M7 (régions, VPC, SG, Route 53, CloudFront, ACM, API Gateway).
- AWS CLI v2 et permissions IAM sur `ec2:*`, `elasticloadbalancing:*`, `acm:*`, `route53:*`, `cloudfront:*`.
- Le VPC à 2 AZ construit en M2 et utilisé en M3-M4. À recréer si supprimé.
- Notions HTTP : path, method, header, status. Notions TCP : 3-way handshake, port, latence.

---

## 1. Pourquoi un Load Balancer

### 1.1 — Le besoin

Une seule instance EC2 derrière une seule IP, c'est insuffisant pour la production :

- **Indisponibilité** : si l'instance tombe (panne hardware, plantage applicatif, redémarrage), 100 % du trafic est perdu.
- **Capacité limitée** : une seule machine, un seul plafond de débit. Pas de scale horizontal.
- **Maintenance bloquante** : on ne peut pas mettre à jour l'instance sans downtime.
- **TLS coûteux** : chaque instance doit gérer la terminaison TLS, démultiplier les certificats.

Un **Load Balancer** résout ces quatre problèmes en agissant comme **point d'entrée unique** devant un **pool d'instances** (ou de containers, ou de Lambdas). Il :

- **Répartit** les requêtes entre les instances.
- **Détecte les pannes** via des health checks et retire les instances malades.
- **Gère TLS** pour tout le pool en un seul endroit.
- **Scale automatiquement** (les LB AWS sont managés, ils absorbent la charge).

### 1.2 — L'analogie de l'accueil

Imaginer un hôtel avec plusieurs réceptionnistes. Plutôt que de demander aux clients de choisir au hasard une file (ou de tous aller à la même), il y a **un panneau d'orientation** à l'entrée qui dirige chaque client vers le réceptionniste disponible. Si l'un d'eux tombe malade, le panneau le retire de la rotation. Si l'hôtel est très chargé, on peut ajouter des réceptionnistes : il suffit de leur dire de se signaler au panneau.

Un Load Balancer, c'est ce panneau d'orientation pour le trafic réseau.

### 1.3 — Position dans l'architecture

```
                  ┌─────────────────────┐
Client ─────────► │ Load Balancer       │ ◄── Une seule IP / nom DNS public
                  │ (managé, multi-AZ)  │
                  └──────┬───────┬──────┘
                         │       │
                ┌────────▼──┐ ┌──▼────────┐
                │ EC2 - AZ a│ │ EC2 - AZ b│
                └───────────┘ └───────────┘
                (chacune sans IP publique, dans subnet privé)
```

Le Load Balancer est dans **les subnets publics** (au minimum 2 AZ), les instances dans **les subnets privés**. Cette séparation, c'est exactement le schéma 3-tiers vu en M4.

---

## 2. Les quatre types de Load Balancer AWS

### 2.1 — ALB (Application Load Balancer)

| Caractéristique     | Détail                                                            |
| ------------------- | ----------------------------------------------------------------- |
| **Couche OSI**      | 7 (application) — comprend HTTP/HTTPS                             |
| **Cas d'usage**     | Sites web, API REST, microservices HTTP                           |
| **Routage avancé**  | Par path, host, header, method, query, source IP                  |
| **Targets**         | EC2, ECS tasks, Lambda, IP (y compris on-prem via Direct Connect) |
| **TLS termination** | Oui (avec ACM)                                                    |
| **WebSocket**       | Oui                                                               |
| **HTTP/2**          | Oui                                                               |
| **Tarification**    | ~16 $/mois fixe + LCU                                             |

### 2.2 — NLB (Network Load Balancer)

| Caractéristique     | Détail                                                           |
| ------------------- | ---------------------------------------------------------------- |
| **Couche OSI**      | 4 (transport) — TCP/UDP/TLS                                      |
| **Cas d'usage**     | Très haute performance, protocoles non-HTTP, IP source préservée |
| **Routage**         | Basé sur ports uniquement                                        |
| **Targets**         | EC2, ECS tasks, IP                                               |
| **TLS termination** | Oui (TLS listener) ou TCP passthrough                            |
| **Latence**         | < 1 ms typique (vs ~10 ms ALB)                                   |
| **Static IP / EIP** | Oui (1 par AZ) — utile pour whitelisting                         |
| **Tarification**    | ~16 $/mois fixe + NLCU                                           |

### 2.3 — CLB (Classic Load Balancer) — déprécié

L'ancien LB AWS (avant 2016). Mix de L4 et L7, moins performant, moins de features. **Ne plus utiliser** pour des déploiements neufs. À connaître par son nom uniquement.

### 2.4 — GWLB (Gateway Load Balancer)

Pour les **appliances de sécurité** (firewall tiers, IDS/IPS, deep packet inspection). On insère un GWLB entre l'IGW et le VPC pour que tout le trafic passe par un cluster d'appliances.

Cas très spécifique (sécurité avancée). À connaître par son nom au N2, **niveau 3-4** pour la pratique.

### 2.5 — Le bon réflexe

| Cas                                                                       | LB à choisir |
| ------------------------------------------------------------------------- | ------------ |
| API REST, site web, microservice HTTP                                     | **ALB**      |
| Protocole TCP brut (jeu en ligne, MQTT, base de données proxy)            | **NLB**      |
| Besoin extrême de latence (< 1 ms) ou très haut débit (millions de req/s) | **NLB**      |
| Besoin d'IP source préservée                                              | **NLB**      |
| Besoin de WAF, routage path/host, OIDC, Cognito                           | **ALB**      |
| Appliances de sécurité tierce                                             | **GWLB**     |

---

## 3. ALB en détail

### 3.1 — Anatomie

```
Internet
  │
  ▼
┌────────────────────────────────────────┐
│ ALB                                    │
│ ┌──────────────────────────────────┐   │
│ │ Listener :443 (HTTPS)            │   │
│ │  ├── Rule 1 : Host=api.* → TG-api │   │
│ │  ├── Rule 2 : Path=/admin → TG-admin│ │
│ │  └── Default : → TG-web          │   │
│ │ Cert ACM : *.example.com         │   │
│ └──────────────────────────────────┘   │
│ ┌──────────────────────────────────┐   │
│ │ Listener :80 (HTTP)              │   │
│ │  └── Default : redirect to HTTPS │   │
│ └──────────────────────────────────┘   │
└──────────┬──────────────┬──────────────┘
           │              │
      ┌────▼────┐    ┌────▼────┐
      │ TG-web  │    │ TG-api  │     ← Target Groups
      │ - EC2-1 │    │ - Lambda│
      │ - EC2-2 │    │   prod  │
      └─────────┘    └─────────┘
```

Trois objets clés à connaître :

1. **Listener** : un port TCP sur lequel l'ALB écoute (typiquement 80, 443).
2. **Rule** : une condition de routage dans un listener (host, path, header, etc.).
3. **Target Group** : un pool de cibles (instances, IP, Lambda) auxquelles forwarder.

### 3.2 — Listener

Chaque listener est défini par un **port** + **protocole** (HTTP ou HTTPS) + optionnellement un certificat ACM.

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06
```

**Bonnes pratiques :**

- **HTTPS only** en production : un listener HTTPS sur 443 + un listener HTTP sur 80 qui **redirige** vers 443.
- **TLS 1.2 minimum** : utiliser une SSL policy moderne.
- **HTTP/2 activé** par défaut sur HTTPS.

### 3.3 — Rules

Les **rules** dans un listener permettent du routage avancé :

| Condition               | Exemple                                                 |
| ----------------------- | ------------------------------------------------------- |
| **host-header**         | `api.example.com` → TG-api ; `app.example.com` → TG-app |
| **path-pattern**        | `/api/*` → TG-api ; `/admin/*` → TG-admin               |
| **http-header**         | `User-Agent: bot` → TG-bots                             |
| **http-request-method** | `GET` → TG-read ; `POST` → TG-write                     |
| **source-ip**           | `203.0.113.0/24` → TG-partner                           |
| **query-string**        | `?version=v2` → TG-v2                                   |

Une rule peut combiner plusieurs conditions. **Le premier match gagne**, sinon la default action.

### 3.4 — Actions possibles dans une rule

- **forward** : transférer à un target group.
- **forward weighted** : répartir vers plusieurs TG avec poids (canary !).
- **redirect** : vers une autre URL (par exemple HTTP → HTTPS).
- **fixed-response** : renvoyer un status / body fixe (utile pour /robots.txt, /health, etc.).
- **authenticate-oidc** ou **authenticate-cognito** : forcer une auth avant de forwarder.

### 3.5 — TLS termination + intégration ACM

L'ALB **termine TLS** : il déchiffre les requêtes HTTPS et les forwarde **en HTTP (clair)** vers les targets, ou en HTTPS si on veut un re-encrypt.

- **Certificat ACM** : créé dans la **même région** que l'ALB (pas us-east-1 !).
- **Listener HTTPS** : associé au cert. On peut associer **plusieurs certs** via SNI.
- **Re-encrypt vers le target** : optionnel, plus de latence, utile pour HIPAA/PCI.

### 3.6 — Connection Draining (deregistration delay)

Quand on retire une instance du TG, l'ALB **arrête d'y envoyer du nouveau trafic** mais **attend** que les connexions en cours se terminent. Le délai (300 s par défaut) est configurable.

Bonne pratique pour les déploiements blue/green : 30-60 s suffit généralement.

---

## 4. NLB en détail

### 4.1 — Différence fondamentale avec l'ALB

L'NLB opère en **couche 4** : il ne comprend pas HTTP, il route en se basant **uniquement sur le port et l'IP**.

- **Pas de routage par path / host / header** : un port = un target group.
- **Pas de logique applicative** : pas de redirect, pas de fixed-response, pas d'auth.
- **TCP brut ou TLS** : préserve la connexion TCP de bout en bout, ou termine TLS si on veut.

### 4.2 — IP source préservée

C'est **la** raison de prendre un NLB plutôt qu'un ALB dans la moitié des cas :

> Un NLB **préserve l'IP source** du client. L'instance backend voit l'**IP réelle** du client, pas celle du LB.

Avec un ALB, l'instance voit l'IP du LB. Pour récupérer l'IP client, il faut lire le header `X-Forwarded-For` — qui peut être falsifié si on ne fait pas attention.

Avec un NLB, l'IP source est **dans le paquet TCP lui-même**. Impossible à falsifier sans man-in-the-middle.

Cas d'usage : services qui dépendent de l'IP client (rate limiting bas niveau, géolocalisation IP, restrictions réseau).

### 4.3 — Performance

| Métrique         | ALB               | NLB                      |
| ---------------- | ----------------- | ------------------------ |
| Latence ajoutée  | ~10 ms            | < 1 ms                   |
| Débit            | Millions de req/s | Millions de connexions/s |
| TLS handshakes/s | Limité par l'ALB  | Très élevé               |
| Scale auto       | Quelques minutes  | Quasi-instantané         |

Pour des protocoles à très basse latence ou très haut débit (jeux en ligne, trading, IoT massif), NLB.

### 4.4 — Static IP / EIP

Le NLB peut avoir **une IP statique par AZ** (ou une Elastic IP attachable). Utile pour :

- **Whitelisting client** : un partenaire qui exige une liste d'IP fixes.
- **DNS direct** sans Route 53.
- **Connexion VPN/Direct Connect** stable.

L'ALB n'a pas d'IP fixe — uniquement un nom DNS.

### 4.5 — Protocoles supportés

| Protocole   | Cas d'usage                                      |
| ----------- | ------------------------------------------------ |
| **TCP**     | Cas général.                                     |
| **UDP**     | Jeux, VoIP, DNS, IoT MQTT-over-UDP.              |
| **TCP_UDP** | Service utilisant les deux (par exemple syslog). |
| **TLS**     | Terminaison TLS sur NLB (rare, mais possible).   |

---

## 5. ALB vs NLB — synthèse

| Critère                  | ALB                            | NLB                            |
| ------------------------ | ------------------------------ | ------------------------------ |
| **Couche OSI**           | 7 (HTTP)                       | 4 (TCP/UDP)                    |
| **Routage**              | Path, host, header, method, IP | Port uniquement                |
| **Protocoles**           | HTTP, HTTPS, gRPC, WebSocket   | TCP, UDP, TLS                  |
| **IP source préservée**  | Non (via X-Forwarded-For)      | Oui                            |
| **Latence ajoutée**      | ~10 ms                         | < 1 ms                         |
| **Static IP / EIP**      | Non (nom DNS uniquement)       | Oui (1 EIP par AZ)             |
| **Auth Cognito/OIDC**    | Oui                            | Non                            |
| **WAF**                  | Oui (intégré)                  | Non                            |
| **Targets Lambda**       | Oui                            | Non                            |
| **Targets IP (on-prem)** | Oui                            | Oui                            |
| **Scale automatique**    | Oui (minutes)                  | Oui (quasi-instantané)         |
| **Coût base mensuel**    | ~16 $/mois                     | ~16 $/mois                     |
| **Coût par LCU/NLCU**    | LCU                            | NLCU                           |
| **Usage typique**        | Web, API REST, microservices   | Jeux, IoT, TCP brut, IP source |

### 5.1 — Mémo "quel LB choisir"

| Question                                    | Réponse    |
| ------------------------------------------- | ---------- |
| L'application est-elle HTTP/HTTPS ?         | ALB (90 %) |
| Besoin de protocole TCP non-HTTP ou UDP ?   | NLB        |
| Besoin de l'IP source réelle côté backend ? | NLB        |
| Besoin d'une IP fixe pour whitelisting ?    | NLB (EIP)  |
| Latence sub-milliseconde requise ?          | NLB        |
| Besoin de routage par path/host/header ?    | ALB        |
| Besoin d'auth OIDC/Cognito intégrée ?       | ALB        |

Dans une archi web typique : **ALB** devant les workloads HTTP, éventuellement **NLB** devant des services TCP particuliers (RDS proxy custom, jeu temps réel, etc.).

---

## 6. Target groups

### 6.1 — Définition

Un **target group** est un **ensemble de cibles** (targets) auxquelles le LB peut forwarder du trafic, avec :

- Un **type** : `instance` (EC2 par ID), `ip` (par IP), `lambda` (par ARN), `alb` (NLB vers ALB).
- Un **protocole + port** de communication LB → target.
- Une **configuration de health check**.
- Un **algorithme de répartition** (round-robin, least-outstanding-requests).

### 6.2 — Types de target

| Type       | Cas d'usage                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `instance` | EC2 dans le même VPC, par instance ID. Cas standard.                                                     |
| `ip`       | Cibles désignées par IP. Pour ECS tasks (mode awsvpc), on-prem via VPN, instances EC2 dans un VPC peeré. |
| `lambda`   | ALB → Lambda direct (sans API Gateway). Cas limité.                                                      |
| `alb`      | NLB → ALB (composition de LBs).                                                                          |

### 6.3 — Health check d'un target group

Chaque TG a son propre health check. Distinct du health check Route 53 (M5) — au niveau LB, plus granulaire.

| Paramètre               | Valeur typique         | Effet                                          |
| ----------------------- | ---------------------- | ---------------------------------------------- |
| **Protocol**            | HTTP / HTTPS / TCP     | Type de sonde                                  |
| **Path** (HTTP)         | `/health`              | Chemin sondé                                   |
| **Port**                | Traffic port ou custom | Port à sonder                                  |
| **Healthy threshold**   | 2-5                    | Sondes successives OK avant target healthy     |
| **Unhealthy threshold** | 2-5                    | Sondes successives KO avant target unhealthy   |
| **Interval**            | 10-30 s                | Fréquence des sondes                           |
| **Timeout**             | 5-10 s                 | Temps avant qu'une sonde soit considérée ratée |
| **Matcher (HTTP)**      | 200 ou 200-399         | Status code(s) considérés "sains"              |

**À retenir** : avec interval=30 s et unhealthy threshold=2, on détecte une panne en **60 secondes**. Pour du failover rapide : interval=10 s, threshold=2 = 20 s.

### 6.4 — Algorithmes de répartition (ALB)

| Algorithme                     | Comportement                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| **Round-robin** (défaut)       | Une requête par target à tour de rôle.                                               |
| **Least outstanding requests** | Vers le target qui a le moins de requêtes en cours. Utile pour des durées variables. |
| **Sticky sessions** (option)   | Un cookie maintient un client sur le même target.                                    |

### 6.5 — Création — CLI

```bash
# Créer un target group HTTP
TG_ARN=$(aws elbv2 create-target-group \
  --name tg-web-http \
  --protocol HTTP --port 80 \
  --vpc-id $VPC_ID \
  --target-type instance \
  --health-check-protocol HTTP \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --matcher 'HttpCode=200' \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Enregistrer des instances
aws elbv2 register-targets \
  --target-group-arn $TG_ARN \
  --targets Id=i-aaa Id=i-bbb

# Vérifier l'état des targets
aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].{Target:Target.Id, State:TargetHealth.State, Reason:TargetHealth.Reason}'
```

---

## 7. Cross-zone load balancing

### 7.1 — Le concept

Un LB a **un nœud par AZ** où il est déployé. Chaque nœud reçoit ~1/N du trafic via Route 53. Question : un nœud peut-il forwarder à des targets d'**autres** AZ ?

- **Cross-zone activé** : oui. Tous les targets, toutes AZ confondues, reçoivent du trafic uniformément.
- **Cross-zone désactivé** : non. Chaque nœud ne forwarde qu'aux targets de **sa propre AZ**.

### 7.2 — Pourquoi c'est important

Imaginons 2 AZ, AZ-a avec 8 instances et AZ-b avec 2 instances :

- **Cross-zone activé** : les 10 instances reçoivent ~10 % chacune.
- **Cross-zone désactivé** : les 8 instances en AZ-a reçoivent ~6,25 % chacune, les 2 en AZ-b ~25 % chacune. Déséquilibre !

### 7.3 — Configuration et coût

- **ALB** : cross-zone **toujours activé**, gratuit. Pas de choix à faire.
- **NLB** : cross-zone **désactivé par défaut**. Si activé : trafic cross-AZ **facturé** (~0,01 $/GB dans chaque sens).

**Bonne pratique NLB** : activer le cross-zone uniquement si on a un vrai déséquilibre AZ, sinon désactivé évite des frais.

---

## 8. Lier un nom de domaine

C'est **l'un des deux items N2** restants du module.

### 8.1 — Procédure (ALB ou NLB, regional)

Identique au pattern vu en M5 et M7 :

1. **Certificat ACM** dans la même région que le LB.
2. **Listener HTTPS** sur l'ALB avec ce certificat (uniquement pour ALB ; NLB c'est listener TLS).
3. **Record Route 53 ALIAS** pointant vers le LB.

### 8.2 — Script

```bash
# 1. Certificat ACM (même région)
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.example.com \
  --validation-method DNS \
  --region eu-west-1 \
  --query 'CertificateArn' --output text)
# (validation via Route 53, attente)

# 2. Listener HTTPS sur l'ALB
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# 3. Listener HTTP de redirection
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions '{
    "Type": "redirect",
    "RedirectConfig": {
      "Protocol": "HTTPS",
      "Port": "443",
      "StatusCode": "HTTP_301"
    }
  }'

# 4. Récupérer le DNS Name + Hosted Zone ID du LB pour le record ALIAS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)
ALB_HZ=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)

# 5. Record Route 53 ALIAS
cat > r53.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "$ALB_HZ",
        "DNSName": "$ALB_DNS",
        "EvaluateTargetHealth": true
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://r53.json
```

### 8.3 — Vérification

```bash
dig +short api.example.com
# → 2-3 IPs publiques du LB

curl -I https://api.example.com/
# → HTTP/2 200, certif valide, response du backend
```

---

## 9. Construire un ALB devant 2 EC2

### 9.1 — Plan

Sur le VPC à 2 AZ (M2), déployer :

1. 2 instances EC2 dans `private-app-a` et `private-app-b`, servant chacune un `nginx` répondant `200 OK` sur `/health` et `/` (avec leur nom d'hôte dans la réponse pour distinguer).
2. Un Target Group `tg-web-http` avec health check sur `/health`.
3. Un ALB dans les subnets publics `public-a` et `public-b`.
4. Un listener HTTP 80 forwardant vers le TG.
5. Test : `curl ALB_DNS` doit alternativement renvoyer "hostA" et "hostB".

### 9.2 — Script complet

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION=eu-west-1
VPC_ID=vpc-0xxx               # le VPC créé en M2
PUBLIC_A=subnet-0pubA
PUBLIC_B=subnet-0pubB
PRIVATE_A=subnet-0privA
PRIVATE_B=subnet-0privB
AMI=ami-0abcdef1234567890     # AMI Amazon Linux 2 à jour

# 1. SG pour l'ALB (HTTP/HTTPS public)
SG_ALB=$(aws ec2 create-security-group \
  --group-name sg-tp-alb --description "ALB SG" --vpc-id $VPC_ID \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_ALB \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ALB \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# 2. SG pour les EC2 (HTTP depuis l'ALB)
SG_WEB=$(aws ec2 create-security-group \
  --group-name sg-tp-web --description "Web EC2 SG" --vpc-id $VPC_ID \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_WEB \
  --protocol tcp --port 80 --source-group $SG_ALB

# 3. User-data pour Nginx avec hostname dans la réponse
cat > /tmp/userdata.sh <<'SH'
#!/bin/bash
yum -y install nginx
HOSTNAME=$(hostname)
echo "Hello from $HOSTNAME" > /usr/share/nginx/html/index.html
echo "OK" > /usr/share/nginx/html/health
systemctl enable nginx
systemctl start nginx
SH

# 4. Lancer 2 EC2, une par AZ
EC2_A=$(aws ec2 run-instances \
  --image-id $AMI --instance-type t3.micro \
  --subnet-id $PRIVATE_A --security-group-ids $SG_WEB \
  --user-data file:///tmp/userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tp-web-a}]' \
  --query 'Instances[0].InstanceId' --output text)

EC2_B=$(aws ec2 run-instances \
  --image-id $AMI --instance-type t3.micro \
  --subnet-id $PRIVATE_B --security-group-ids $SG_WEB \
  --user-data file:///tmp/userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tp-web-b}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids $EC2_A $EC2_B
sleep 60  # le temps que Nginx démarre

# 5. Target Group
TG_ARN=$(aws elbv2 create-target-group \
  --name tg-tp-web --protocol HTTP --port 80 \
  --vpc-id $VPC_ID --target-type instance \
  --health-check-path /health --health-check-interval-seconds 10 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 2 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

aws elbv2 register-targets --target-group-arn $TG_ARN \
  --targets Id=$EC2_A Id=$EC2_B

# 6. ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name tp-alb --type application --scheme internet-facing \
  --subnets $PUBLIC_A $PUBLIC_B --security-groups $SG_ALB \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

aws elbv2 wait load-balancer-available --load-balancer-arns $ALB_ARN

# 7. Listener HTTP
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# 8. Récupérer le DNS et tester
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB DNS : $ALB_DNS"
sleep 30  # le temps des health checks

for i in {1..10}; do
  curl -s http://$ALB_DNS/
done
```

### 9.3 — Sortie attendue

```
Hello from ip-10-0-10-42.eu-west-1.compute.internal
Hello from ip-10-0-11-7.eu-west-1.compute.internal
Hello from ip-10-0-10-42.eu-west-1.compute.internal
Hello from ip-10-0-11-7.eu-west-1.compute.internal
...
```

Les deux instances alternent grâce au round-robin de l'ALB. Si on arrête une instance, l'ALB la retire du pool en 10-20 s (health check), et toutes les requêtes vont à l'autre.

---

## 10. Mini-projet final du parcours Networking — ALB + CloudFront + Route 53 multi-AZ (≈ 1 à 2 jours)

Ce mini-projet **valide** les 8 modules du parcours AWS Networking et atteint l'objectif **Confirmé 2**.

### 10.1 — Énoncé

Déployer une **application web de démonstration** accessible depuis Internet sous un nom de domaine personnalisé, avec :

- **2 AZ** pour la haute disponibilité.
- Un **ALB** devant 2 instances EC2 (ou un Auto Scaling Group de 2-4 instances).
- Un **CloudFront** devant l'ALB pour le caching, la terminaison TLS edge, et la protection DDoS de base.
- **Route 53** pour gérer le DNS avec un **health check** et un failover possible.
- Tout cela dans un **VPC custom** avec subnets publics/privés bien séparés et SG durcis.

### 10.2 — Architecture cible

```
                        Client
                          │
                          │ HTTPS
                          ▼
                    ┌─────────────┐
                    │ Route 53    │  ALIAS app.example.com → CloudFront
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ CloudFront          │  - Edge cache
                    │ d111111.cf.net      │  - TLS termination
                    │ + cert ACM us-east-1│  - Compression auto
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ ALB (eu-west-1)     │  Listener 443 (cert ACM eu-west-1)
                    │ tp-alb.elb.aws      │  Redirect 80 → 443
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         ┌────────┐   ┌────────┐   ┌────────┐
         │ EC2 A  │   │ EC2 B  │   │ ... (ASG)│
         │ AZ a   │   │ AZ b   │   │          │
         └────────┘   └────────┘   └──────────┘
            subnets privés, SG durcis, NAT GW pour updates OS
```

### 10.3 — Livrable

Un **dépôt Git** contenant :

- Un **script Terraform** ou **CloudFormation** ou **CLI (bash)** complet, idempotent, qui crée tout depuis zéro.
- Un **document technique** (4 à 6 pages) décrivant les choix.
- Un **dashboard** simple (capture CloudWatch) montrant le bon fonctionnement.

### 10.4 — Structure du document

#### Section 1 — Cahier des charges (½ page)

- Cas d'usage retenu (peut être bidon : page de bienvenue, mini-blog, api de météo, etc.).
- Volumétrie estimée (X req/s, Y GB/mois).
- SLA cible (disponibilité, latence).
- Budget mensuel cible.

#### Section 2 — Choix de région et AZ (¼ page)

- Région retenue + justification (basée sur M1, 6 critères).
- 2 ou 3 AZ + justification.

#### Section 3 — Plan d'adressage du VPC (½ page)

- CIDR du VPC.
- Liste des subnets avec leur CIDR, AZ, type (M4).
- Routage : IGW, NAT GW(s).

#### Section 4 — Sécurité réseau (½ page)

- Liste des SG avec leur inbound / outbound (par référence si possible).
- NACL custom si besoin.

#### Section 5 — Application Load Balancer (½ page)

- Schéma : listeners, rules, target groups.
- Health check configuré.
- Certificat ACM.

#### Section 6 — CloudFront (½ page)

- Distribution config : origines, cache policies, alternate domain name.
- Certificat ACM (us-east-1).
- Optimisations activées (HTTPS only, compression, HTTP/2).

#### Section 7 — Route 53 (½ page)

- Hosted zone + records.
- Health check sur l'ALB.
- Stratégie de routing (simple ou failover si plusieurs régions).

#### Section 8 — Coûts (½ page)

- Estimation mensuelle ventilée :
  - ALB : ~16 $ + LCU
  - NAT GW : ~33 $ × N AZ + trafic
  - CloudFront : ~0 $ (free tier 1 TB)
  - Route 53 : ~0,50 $/zone + requêtes
  - EC2 t3.micro × 2 : ~17 $ (à 100 % d'utilisation, sinon moins en spot ou avec savings plan)
  - **Total estimé** ~80-150 $/mois

#### Section 9 — Tests effectués (½ page à 1 page)

- Test fonctionnel : la home page répond bien depuis le domaine custom.
- Test multi-AZ : couper une instance → l'autre prend tout, le client ne voit rien.
- Test cache : second curl montre `x-cache: Hit from cloudfront`.
- Test DNS : `dig` renvoie les IPs CloudFront.
- Test TLS : certificat valide, TLS 1.2+, A+ sur SSL Labs (optionnel mais classe).

#### Section 10 — Limites et évolutions (¼ page)

- 3 limites identifiées + 3 évolutions possibles (par exemple : Auto Scaling Group, WAF, multi-région, observabilité, Cognito, …).

### 10.5 — Critères de validation

Le mini-projet est validé si :

- Une URL `https://app.<mondomaine>.<tld>/` répond avec un message clair pendant la démo.
- L'instance EC2 peut être arrêtée sans interruption visible côté client.
- Le second `curl` montre un cache hit CloudFront.
- Toutes les ressources sont créées par le script (re-créables après destruction).
- Le coût mensuel est chiffré ligne par ligne.

### 10.6 — Modes d'usage

Trois manières d'exploiter ce livrable :

1. **Portfolio** : push GitHub, mettre le PDF en README. Démonstration tangible des 8 modules.
2. **Base d'évolutions** : ajouter Auto Scaling, WAF, multi-région DR — pivot vers le niveau 3.
3. **Comparaison** : refaire la même chose en **CloudFormation** ou **CDK** pour comparer Terraform vs natif AWS.

### 10.7 — Démontage

**Important** : ne pas oublier de détruire à la fin :

- NAT Gateway (~33 $/mois par AZ).
- ALB (~16 $/mois).
- Elastic IP (si non attachées).
- Instances EC2.
- CloudFront distribution (disable puis delete — peut prendre 15 min).

Un `terraform destroy` (ou `cloudformation delete-stack`) fait le ménage proprement si on est passé par l'IaC.

---

## 11. Exercices pratiques

### Exercice 1 — ALB + 2 EC2 (≈ 60 min)

**Objectif.** Le scénario central, vu en section 9.

**Étapes.** Suivre le script de la section 9.2. Vérifier l'alternance des hostnames.

**Bonus :** arrêter une instance (`stop`), attendre 20-30 s, vérifier que toutes les requêtes vont à l'autre. Redémarrer l'instance, vérifier qu'elle revient dans le pool.

**Livrable.** Captures des `curl` (8-10 requêtes) avant et après la coupure d'une instance.

### Exercice 2 — Routage par path (≈ 30 min)

**Objectif.** Voir le routage L7 de l'ALB.

**Étapes :**

1. Sur l'ALB de l'exercice 1, créer un second target group `tg-tp-api` avec une instance servant `/api/...`.
2. Ajouter une rule au listener HTTPS : `Path = /api/*` → forward vers tg-tp-api.
3. Tester : `curl ALB/` doit aller au tg-web ; `curl ALB/api/foo` doit aller au tg-api.

**Livrable.** Captures des deux types de requêtes + screenshot des règles dans la console ALB.

### Exercice 3 — Lier un nom de domaine (≈ 30 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Demander un certificat ACM pour `tp-alb.<mondomaine>.fr` dans `eu-west-1`.
2. Valider via Route 53.
3. Créer un listener HTTPS sur l'ALB avec ce certificat.
4. Créer un listener HTTP qui redirige vers HTTPS.
5. Créer le record ALIAS Route 53.
6. Tester via le nom personnalisé.

**Livrable.** Capture `curl -vI https://tp-alb.<mondomaine>.fr/` montrant le certificat et le statut 200.

### Exercice 4 — ALB vs NLB sur le même backend (≈ 45 min)

**Objectif.** Mesurer la différence concrète.

**Étapes :**

1. Sur les EC2 de l'exercice 1, configurer Nginx pour logger l'IP source dans `access.log`.
2. Tester via l'ALB : l'IP loggée est celle de l'ALB. Vérifier que `X-Forwarded-For` contient l'IP client.
3. Créer un NLB devant le **même** target group (en mode `ip` ou en créant un autre TG type `instance`).
4. Tester via le NLB : l'IP loggée est directement celle du client (pas besoin de X-Forwarded-For).
5. Mesurer la latence des deux : `curl -w "%{time_total}\n" -o /dev/null` sur ALB vs NLB.

**Livrable.** Tableau comparatif : IP source observée, latence, cas où chacun gagne.

### Mini-défi — Schéma d'archi (≈ 30 min, papier)

**Cas.** Plateforme média avec :

- Site web (pages statiques + page de player vidéo).
- API REST de gestion utilisateur.
- Streaming vidéo en mode HLS (chunks .m4s).
- Connexions WebRTC pour de la visio.

**Quels LB / endpoints utiliser ?**

**Livrable.** Schéma proposant un type d'endpoint par flux, avec justification.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un **Load Balancer** AWS et énoncer ses 4 rôles (réparti, détecte, TLS, scale).
- [ ] Citer les **4 types** de LB AWS et leur cas d'usage principal.
- [ ] Distinguer **ALB** et **NLB** sur au moins **6 axes** (couche, routage, IP source, latence, EIP, features).
- [ ] Définir un **Target Group**, ses 3 types principaux (`instance`, `ip`, `lambda`).
- [ ] Définir un **listener** et une **rule** dans un ALB ; donner 3 conditions de routage possibles.
- [ ] Configurer un **health check** de target group (path, interval, thresholds, matcher).
- [ ] Définir le **cross-zone load balancing** et son comportement par défaut sur ALB vs NLB.
- [ ] **Construire un ALB devant 2 EC2** depuis zéro de mémoire (SG, TG, listener, register-targets).
- [ ] **Lier un nom de domaine** à un LB : étapes (cert ACM même région, listener HTTPS, ALIAS R53).
- [ ] Décrire le pattern **CloudFront + ALB + Route 53** et expliquer l'apport de chaque couche.
- [ ] Citer 4 anti-patterns courants.

### Items du glossaire visés

**N2 atteint** :

- _différence entre un ALB et un NLB_ — sections 3, 4, 5.
- _lier un nom de domaine à un Load Balancer_ — section 8.
- _ce qu'est un target group dans un Load Balancer_ — section 6.

À l'issue du mini-projet final, l'apprenant atteint le niveau **Confirmé 2** ciblé par le parcours **AWS Networking**.

**Pour aller plus loin (N3, non couvert)** :

- _4 types de LB en détail (ALB, NLB, CLB, GWLB) — différences fines_.
- _LB cross-zone configuration coût/perf_.
- _stratégies d'optimisation des coûts LB_.
- _VPC Peering, Transit Gateway, Network Hub_.
- _Route 53 Resolver, exposition sous-domaines cross-account_.

---

## 13. Ressources complémentaires

### Documentation AWS

- [ELB User Guide](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html)
- [ALB Documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html)
- [NLB Documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html)
- [Target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [Health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)

### Patterns et exemples

- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html) — patterns de HA.
- [Auto Scaling avec ALB](https://docs.aws.amazon.com/autoscaling/ec2/userguide/integration-elb.html).

### Outils

- [ELB Access Logs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html) — analyse fine du trafic.
- [SSL Labs](https://www.ssllabs.com/ssltest/) — vérifier le grade TLS de son ALB.
- [Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html) — debug réseau bout en bout.

### Synthèse du parcours Networking

Le parcours AWS Networking se referme ici. À ce stade :

- **M1** — région, AZ, IP : où et comment AWS positionne les ressources.
- **M2** — VPC : créer son réseau privé virtuel.
- **M3** — SG et NACL : protéger le trafic.
- **M4** — types de subnets : structurer le réseau pour différents workloads.
- **M5** — Route 53 : exposer un nom de domaine, faire du failover DNS.
- **M6** — CloudFront : distribuer du contenu rapidement et globalement.
- **M7** — API Gateway : exposer des API HTTP/WebSocket avec auth et throttling.
- **M8** (ce module) — Load Balancers : répartir le trafic et orchestrer le multi-AZ.
- **Mini-projet final** — intégration ALB + CloudFront + Route 53 multi-AZ.

L'apprenant est désormais **Confirmé N2** sur AWS Networking — capable de concevoir, déployer et défendre des architectures réseau AWS de production multi-AZ avec une bonne hygiène de sécurité, de coût et de résilience.
