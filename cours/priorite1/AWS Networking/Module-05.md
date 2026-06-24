# M5 — Route 53

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir ce qu'est **Route 53** et comment il s'inscrit dans la chaîne DNS mondiale (registrar, autoritative, resolver).
- Définir une **hosted zone** (zone hébergée) et expliquer précisément la différence entre une **public hosted zone** (résolution Internet) et une **private hosted zone** (résolution interne au VPC).
- Distinguer les principaux **record types** : `A`, `AAAA`, `CNAME`, **`ALIAS`** (spécifique AWS), `MX`, `TXT`, `NS`, `SOA`.
- Choisir la bonne **routing policy** parmi : **simple**, **weighted**, **latency**, **geolocation**, **failover**, **multivalue**, **geoproximity**.
- Définir et configurer un **health check** Route 53, en comprendre les déclencheurs, et l'associer à un record pour faire du **failover** automatique.
- **Mettre en place** un nom de domaine pointant vers une instance EC2 (ou un ALB) avec **failover automatique** vers une instance de secours en cas de panne.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M4 (régions, AZ, VPC, subnets, SG).
- Bases du DNS : savoir qu'un nom de domaine est résolu en IP, qu'il existe différents types d'enregistrements (A, CNAME, MX). Un rappel synthétique est donné en section 1.
- Un **nom de domaine** dont on contrôle les nameservers (acheté chez Route 53, OVH, Gandi, Namecheap, Cloudflare, …). Pour les exercices, un sous-domaine d'un domaine existant suffit (par exemple `tp.mondomaine.fr`).
- AWS CLI v2 et permissions IAM sur Route 53 (`route53:*`).

---

## 1. DNS 101 — le rappel utile

### 1.1 — Pourquoi le DNS

Les humains tapent des **noms** (`www.example.com`), les machines comprennent des **adresses IP** (`52.49.123.45`). Le **DNS** (Domain Name System) fait la traduction.

Quand un navigateur veut atteindre `api.example.com`, il interroge une chaîne d'acteurs :

```
1. Navigateur ─►─ Resolver (le DNS du FAI ou public, ex. 1.1.1.1 / 8.8.8.8)
2. Resolver  ─►─ Root nameserver (.)             "qui gère .com ?"
3. Resolver  ─►─ TLD nameserver (.com)           "qui gère example.com ?"
4. Resolver  ─►─ Authoritative nameserver        "quelle IP pour api.example.com ?"
                (de example.com — typiquement Route 53)
5. Authoritative ─►─ Resolver                    "52.49.123.45"
6. Resolver  ─►─ Navigateur
```

L'étape 4 est celle qui nous intéresse : **Route 53** est le **serveur autoritaire** (authoritative nameserver) pour les domaines qu'on lui confie. Il **détient la vérité** sur les enregistrements DNS de ces domaines.

### 1.2 — Les rôles distincts qu'on confond souvent

| Rôle                         | Ce qu'il fait                                               | AWS service                                                      |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **Registrar**                | Vend les noms de domaines, gère la propriété auprès du TLD. | Route 53 (Domain Registration) ou n'importe quel autre registrar |
| **Authoritative nameserver** | Répond aux requêtes DNS pour un domaine donné.              | Route 53 (Hosted Zones)                                          |
| **Resolver**                 | Le DNS qu'un client utilise pour faire ses lookups.         | Route 53 Resolver (rare, niveau 3) ou public (1.1.1.1, 8.8.8.8)  |

Ces trois rôles peuvent être chez le **même fournisseur** ou chez des **fournisseurs différents**. Exemple courant : acheter un domaine chez OVH (registrar), mais en héberger les enregistrements chez Route 53 (authoritative).

### 1.3 — TTL — le cache

Chaque enregistrement DNS a un **TTL** (Time To Live), durée en secondes pendant laquelle le resolver peut le **mettre en cache** avant d'aller le revérifier.

- **TTL court** (60-300 s) : changements quasi instantanés mais plus de requêtes.
- **TTL long** (3600 s à 86400 s) : moins de requêtes mais propagation lente d'un changement.

**Bonne pratique :** TTL bas (60 s) pour des records qui peuvent bouger (failover), TTL haut (3600 s) pour des records stables (MX, TXT, NS).

### 1.4 — Pourquoi Route 53 plutôt qu'un autre DNS

- **Intégration native AWS** : record `ALIAS` qui pointe vers un ALB, CloudFront, S3, sans IP fixe à maintenir.
- **Routing policies avancées** : failover, geolocation, latency-based — pas disponibles partout.
- **Health checks** intégrés.
- **SLA 100 %** affiché (le SLA le plus généreux d'AWS — Route 53 est conçu pour ne jamais tomber).
- **Tarif raisonnable** : 0,50 $/hosted zone/mois + 0,40 $/million de requêtes.

---

## 2. La hosted zone

### 2.1 — Définition

Une **hosted zone** (zone hébergée) est l'**ensemble des enregistrements DNS** pour un domaine donné, hébergé par Route 53.

```
Hosted zone : example.com
├── A      api.example.com         → 52.49.123.45
├── A      www.example.com         → 52.49.124.66
├── MX     example.com             → mail.example.com (priorité 10)
├── TXT    example.com             → "v=spf1 include:_spf.google.com ~all"
├── NS     example.com             → 4 nameservers AWS
└── SOA    example.com             → infos d'autorité
```

À la création d'une hosted zone, AWS génère automatiquement :

- Quatre records **NS** (nameservers) avec 4 noms d'hôtes AWS (par exemple `ns-1234.awsdns-12.org`, …).
- Un record **SOA** (Start of Authority) avec les infos d'admin.

Ces deux records ne sont **pas à modifier**. Les NS, en revanche, doivent être **déclarés au registrar** pour que la hosted zone soit effectivement utilisée par le monde.

### 2.2 — Brancher la zone — l'étape qu'on oublie

Si on achète `example.com` chez OVH et qu'on crée une hosted zone Route 53 pour le même domaine, **rien ne se passe** tant qu'on n'a pas modifié les nameservers chez OVH pour qu'ils pointent vers les NS Route 53.

```
Chez le registrar (OVH/Gandi/Namecheap/…) :
  nameservers : ns1.ovh.net, dns.ovh.net  ── à remplacer par ──►  ns-1234.awsdns-12.org
                                                                    ns-5678.awsdns-34.co.uk
                                                                    ns-91011.awsdns-56.com
                                                                    ns-121314.awsdns-78.net
```

Une fois cette modification propagée (10 min à 48 h selon le TLD), Route 53 est effectivement **autoritaire** pour le domaine.

### 2.3 — Public hosted zone

Une **public hosted zone** est résolue **depuis Internet**. C'est le cas par défaut. Tout resolver DNS dans le monde peut interroger ses records.

Cas d'usage : tout site web, API publique, service exposé.

Coût : 0,50 $/mois par hosted zone + requêtes.

### 2.4 — Private hosted zone

Une **private hosted zone** est résolue **uniquement depuis l'intérieur d'un (ou plusieurs) VPC** qu'on lui associe explicitement. Invisible depuis Internet.

```
Hosted zone privée : internal.example.com
├── A    db.internal.example.com    → 10.0.20.10  (IP privée RDS)
├── A    cache.internal.example.com → 10.0.20.20  (IP privée Redis)
└── A    api.internal.example.com   → 10.0.10.50  (IP privée EC2 backend)
```

Cas d'usage :

- **Référencer des ressources internes par nom** au lieu d'IP. Si la RDS bouge, on met à jour le record et plus rien à changer côté code.
- **Séparer prod / staging** : la même hosted zone privée peut résoudre des noms différents selon le VPC qui interroge (si on a plusieurs hosted zones privées sur le même domaine, associées à des VPC différents).
- **Split-horizon DNS** : `example.com` résout `www → 52.49.x` depuis Internet (hosted zone publique), et `www → 10.0.0.x` depuis le VPC interne (hosted zone privée pour le même nom).

**Conditions techniques** :

- Le VPC doit avoir `enableDnsHostnames = true` et `enableDnsSupport = true` (activés par défaut sur les VPC créés via la console, pas toujours via CLI / Terraform — à vérifier).
- Une hosted zone privée peut être associée à **plusieurs VPC** (même cross-region, sous conditions).

Coût : identique à une public hosted zone.

### 2.5 — Public vs private — synthèse

| Critère                  | Public hosted zone                                       | Private hosted zone                               |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------- |
| Visible depuis Internet  | Oui                                                      | Non                                               |
| Résolu depuis un VPC AWS | Oui (via resolver public)                                | Oui (si VPC associé) — **prioritaire**            |
| Cas d'usage              | Site, API, services publics                              | DNS interne pour ressources VPC privées           |
| Records typiques         | `A`, `AAAA`, `MX`, `TXT`, `ALIAS` vers ALB/CloudFront/S3 | `A`, `ALIAS` vers ALB interne, IP privées EC2/RDS |
| Coût                     | 0,50 $/mois + requêtes                                   | Idem                                              |

### 2.6 — Split-horizon DNS — cas concret

> Le domaine `api.example.com` doit résoudre vers l'**ALB public** (`52.49.x.x`) depuis Internet, mais vers l'**ALB interne** (`10.0.0.x`) depuis le VPC pour économiser le trafic Internet et améliorer la latence.

Solution :

1. **Public hosted zone** `example.com` avec record `api` → ALIAS vers ALB public.
2. **Private hosted zone** `example.com` associée au VPC, avec record `api` → ALIAS vers ALB interne.

Quand une instance du VPC fait `dig api.example.com`, le resolver AWS du VPC consulte **d'abord** la private hosted zone (puisqu'elle est associée), trouve le record et renvoie l'IP interne. Quand un client Internet fait le même lookup, il atteint la public hosted zone et obtient l'IP publique.

Pas de configuration spéciale : c'est **automatique** dès qu'on associe la private hosted zone au VPC.

---

## 3. Les types d'enregistrements

### 3.1 — Les types DNS standards

| Type      | Contenu                             | Cas d'usage                                                           |
| --------- | ----------------------------------- | --------------------------------------------------------------------- |
| **A**     | Adresse IPv4 (`52.49.123.45`)       | La majorité des records.                                              |
| **AAAA**  | Adresse IPv6                        | Couverture IPv6.                                                      |
| **CNAME** | Un autre nom de domaine             | Aliaser un sous-domaine vers un autre.                                |
| **MX**    | Serveurs de mail + priorité         | Configuration email.                                                  |
| **TXT**   | Texte libre                         | SPF, DKIM, DMARC, validation de propriété.                            |
| **NS**    | Nameservers du domaine              | Autogéré, pas à modifier.                                             |
| **SOA**   | Infos d'autorité                    | Idem.                                                                 |
| **SRV**   | Service + port + hôte               | Voix sur IP, services exotiques.                                      |
| **PTR**   | Reverse DNS                         | Cas rare, validation mail sortant.                                    |
| **CAA**   | Certificate Authority Authorization | Restreint quelles CA peuvent émettre des certificats pour le domaine. |

### 3.2 — Le record ALIAS — la spécificité AWS

Un **ALIAS** est un type d'enregistrement **propre à Route 53** (n'existe pas dans le DNS standard, c'est une extension AWS) qui permet de pointer un nom vers une **ressource AWS** sans en connaître l'IP.

Cibles supportées :

- **CloudFront distribution** (`d111111.cloudfront.net`)
- **ALB / NLB / GWLB**
- **API Gateway**
- **S3 website endpoint** (`bucket.s3-website-eu-west-1.amazonaws.com`)
- **VPC interface endpoint**
- **Global Accelerator**
- **Elastic Beanstalk environment**
- **Un autre record de la même hosted zone**

**Pourquoi ALIAS plutôt que CNAME ?**

| Critère                                | CNAME                       | ALIAS                                             |
| -------------------------------------- | --------------------------- | ------------------------------------------------- |
| Au sommet du domaine (`example.com`) ? | **Non** (interdit par RFC)  | **Oui** (Route 53 contourne)                      |
| Coût des requêtes                      | Facturées                   | **Gratuites** quand pointe vers une ressource AWS |
| Mise à jour automatique de l'IP        | Non (CNAME résolu, puis IP) | Oui (Route 53 garde l'alignement)                 |
| Health check intégré                   | Non                         | Oui (option "Evaluate Target Health")             |

**Règle d'or :** quand on pointe vers une ressource AWS, **toujours préférer ALIAS à CNAME**. C'est gratuit, plus rapide, et fonctionne au sommet du domaine.

### 3.3 — Exemple complet de hosted zone

```
example.com.    NS    ns-1234.awsdns-12.org, ns-5678.awsdns-34.co.uk, ...
example.com.    SOA   ns-1234.awsdns-12.org admin.example.com (...)
example.com.    A     ALIAS → d-abc123.cloudfront.net           (CloudFront)
www.example.com.   CNAME example.com                            (alias vers root)
api.example.com.   A     ALIAS → my-alb-123456.eu-west-1.elb.amazonaws.com (ALB)
mail.example.com.  A     52.49.10.20                            (serveur mail manuel)
example.com.    MX    10 mail.example.com.
example.com.    TXT   "v=spf1 include:_spf.mail.fr ~all"
example.com.    TXT   "google-site-verification=..."
```

---

## 4. Les routing policies

Route 53 propose **sept** politiques de routage, c'est-à-dire **comment** il choisit la réponse à donner quand plusieurs records existent pour un même nom.

### 4.1 — Simple routing

Le mode par défaut : **un seul record** par nom, **une réponse**. Pas de logique, juste un mapping.

```
api.example.com   A   ALIAS → my-alb
```

Cas d'usage : 95 % des records.

### 4.2 — Weighted routing

**Plusieurs records** pour le même nom, chacun avec un **poids** (entier). Route 53 répartit les réponses **proportionnellement** aux poids.

```
api.example.com   A   ALIAS → my-alb-v1   weight=90
api.example.com   A   ALIAS → my-alb-v2   weight=10
```

90 % des requêtes seront routées vers v1, 10 % vers v2. **Canary release** classique : commencer à 1 %, monter à 10, à 50, à 100 selon les métriques.

**À retenir :**

- Les poids sont **relatifs**, pas en pourcentage : `weight=1 + weight=4` donne 20/80.
- Le routage est **stochastique** (par requête), pas sticky côté client. Combiner avec sticky sessions au niveau ALB si besoin de cohérence.

### 4.3 — Latency-based routing

Plusieurs records, chacun rattaché à une **région AWS**. Route 53 répond avec celui qui a la **latence la plus faible** depuis le resolver du client.

```
api.example.com   A   ALIAS → my-alb-eu-west-1     region=eu-west-1
api.example.com   A   ALIAS → my-alb-us-east-1     region=us-east-1
api.example.com   A   ALIAS → my-alb-ap-northeast-1  region=ap-northeast-1
```

Un client en France sera routé vers `eu-west-1`, un client à Tokyo vers `ap-northeast-1`. Optimisation de latence pour une infra **réellement multi-région**.

**Note :** "latence la plus faible" est mesurée par Route 53 sur des sondes, pas par un test en temps réel à chaque requête. La granularité est suffisante pour un effet visible mais pas parfait.

### 4.4 — Geolocation routing

Routage selon la **localisation géographique** du client (continent, pays, ou subdivision US).

```
example.com   A   ALIAS → eu-server     location=Europe
example.com   A   ALIAS → us-server     location=United States
example.com   A   ALIAS → default       location=Default
```

Cas d'usage :

- **Conformité légale** : les utilisateurs UE doivent atterrir sur des serveurs UE.
- **Personnalisation** : différentes versions linguistiques d'un site.
- **Blocage géographique** : ne pas répondre du tout pour certains pays.

**Différence avec latency-based :** geolocation est **basé sur où est le client** (pays IP), latency-based est **basé sur la latence mesurée**. Geolocation est plus prévisible mais peut être sous-optimal (un client français près de la frontière allemande sera toujours routé vers le serveur "France").

### 4.5 — Failover routing

Deux records pour le même nom : un **primary**, un **secondary**. Route 53 répond avec le primary tant qu'il est **sain**, bascule sur le secondary sinon.

```
api.example.com   A   ALIAS → my-alb-eu-west-1   failover=PRIMARY     health-check=hc-1
api.example.com   A   ALIAS → my-alb-eu-west-3   failover=SECONDARY   health-check=hc-2
```

Le **health check** est central (voir section 5). Sans health check, le failover n'a aucun moyen de savoir quand basculer.

C'est le **pattern le plus courant** pour la haute disponibilité multi-région d'une application web simple.

### 4.6 — Multivalue answer routing

Renvoie **plusieurs IP** (jusqu'à 8) en réponse à une même requête, le client choisit. Optionnellement avec health checks (les IP malsaines ne sont pas renvoyées).

```
api.example.com   A   52.49.10.1   health-check=hc-1
api.example.com   A   52.49.10.2   health-check=hc-2
api.example.com   A   52.49.10.3   health-check=hc-3
```

Une variante "round robin simple" pour des cas où on ne veut pas (ou ne peut pas) mettre un Load Balancer devant. **Bien moins puissant qu'un ALB / NLB** mais utile pour des cas spécifiques (CDN custom, serveurs DNS, …).

### 4.7 — Geoproximity routing

Variante avancée du geolocation où on définit une **zone géographique pour chaque endpoint** et un **biais** (bias) qui élargit ou rétrécit cette zone. Nécessite l'activation de **Route 53 Traffic Flow** (interface plus avancée, payant en supplément).

À connaître mais rarement utilisé en pratique au niveau N2.

---

## 5. Les health checks

### 5.1 — Définition

Un **health check** Route 53 est une sonde qui interroge périodiquement un endpoint et détermine s'il est **sain** ou **défaillant**. Les sondes sont émises depuis ~15 points de présence AWS dans le monde.

Trois types :

1. **HTTP / HTTPS / TCP** : Route 53 envoie une requête vers une IP / nom + port + chemin et attend une réponse (statut HTTP 200-399 par défaut, ou TCP handshake).
2. **CloudWatch alarm** : Route 53 considère l'endpoint sain ou non selon l'état d'une alarme CloudWatch. Utile pour des conditions complexes ("CPU > 80 % depuis 10 min" → unhealthy).
3. **Calculated health check** : combinaison logique d'autres health checks (AND/OR/NOT).

### 5.2 — Paramètres clés

| Paramètre                | Valeur typique                    | Effet                                                 |
| ------------------------ | --------------------------------- | ----------------------------------------------------- |
| **Endpoint** (IP ou nom) | `52.49.10.1` ou `api.example.com` | Cible à sonder.                                       |
| **Port**                 | 443 (HTTPS), 80 (HTTP)            | Port TCP à interroger.                                |
| **Path** (HTTP/HTTPS)    | `/health`                         | Chemin de la requête.                                 |
| **Request interval**     | 10 ou 30 secondes                 | Fréquence des sondes (10 s = "fast" = plus cher).     |
| **Failure threshold**    | 3                                 | Nombre de sondes ratées consécutives avant unhealthy. |
| **String matching**      | optionnel                         | Vérifier qu'une chaîne précise est dans la réponse.   |
| **Latency monitoring**   | optionnel                         | Mesurer la latence en plus du statut.                 |

**À retenir :** avec un interval de 30 s et un failure threshold de 3, la détection d'un endpoint mort prend jusqu'à **90 secondes**. Failover total = 90 s + temps de propagation DNS (TTL).

### 5.3 — Coût

- **Health check standard** (endpoint AWS) : **gratuit**.
- **Health check non-AWS** ou avec options avancées (string matching, latency, HTTPS) : **0,50 $/mois** + 0,75 $/option/mois.
- **CloudWatch alarm based** : **gratuit**.

### 5.4 — Health check + record — l'association

Un health check à lui seul ne fait **rien** côté DNS. Il faut **l'associer** à un record DNS pour qu'il influence les réponses.

```bash
# Créer un health check HTTPS
HC_ID=$(aws route53 create-health-check \
  --caller-reference "$(date +%s)" \
  --health-check-config '{
    "IPAddress": "52.49.10.1",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }' \
  --query 'HealthCheck.Id' --output text)

# L'associer à un record DNS (via change-resource-record-sets, voir section 7)
```

Une fois associé à un record de routing policy **failover**, **weighted**, ou **multivalue**, Route 53 retire automatiquement ce record des réponses quand le health check passe en unhealthy.

### 5.5 — Health check et records ALIAS — la subtilité

Pour un record **ALIAS vers une ressource AWS** (ALB, CloudFront, …), on peut soit :

- **Associer un health check explicite** (comme ci-dessus), soit
- **Activer "Evaluate Target Health"** : Route 53 utilise les health checks de la **target** (les health checks de l'ALB par exemple).

Pour un ALB, **Evaluate Target Health** est souvent suffisant et plus simple : pas de health check à maintenir, l'ALB sait déjà si ses targets sont saines.

---

## 6. Setup pas à pas — domaine → instance avec failover

L'objectif de cette section est de fournir le **script de référence** pour le cas le plus courant : un domaine pointant vers une instance, avec failover sur une seconde instance si la première tombe.

### 6.1 — Prérequis

- Hosted zone créée pour `example.com` (publique).
- 2 instances EC2 démarrées dans 2 AZ différentes, chacune avec une **Elastic IP** publique : `52.49.10.1` et `52.49.10.2`.
- Chaque EC2 expose `/health` sur HTTPS avec un statut 200.

### 6.2 — Création des health checks

```bash
HC_PRIMARY=$(aws route53 create-health-check \
  --caller-reference "primary-$(date +%s)" \
  --health-check-config '{
    "IPAddress": "52.49.10.1",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }' \
  --query 'HealthCheck.Id' --output text)

HC_SECONDARY=$(aws route53 create-health-check \
  --caller-reference "secondary-$(date +%s)" \
  --health-check-config '{
    "IPAddress": "52.49.10.2",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }' \
  --query 'HealthCheck.Id' --output text)

# Nommer les health checks pour la lisibilité console
aws route53 change-tags-for-resource --resource-type healthcheck \
  --resource-id $HC_PRIMARY --add-tags Key=Name,Value=hc-primary
aws route53 change-tags-for-resource --resource-type healthcheck \
  --resource-id $HC_SECONDARY --add-tags Key=Name,Value=hc-secondary
```

### 6.3 — Création des records failover

```bash
HOSTED_ZONE_ID=Z123ABC456DEF  # ID de la hosted zone example.com

cat > change-batch.json <<EOF
{
  "Comment": "Setup failover for app.example.com",
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "app.example.com",
        "Type": "A",
        "SetIdentifier": "primary",
        "Failover": "PRIMARY",
        "TTL": 60,
        "ResourceRecords": [{"Value": "52.49.10.1"}],
        "HealthCheckId": "$HC_PRIMARY"
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "app.example.com",
        "Type": "A",
        "SetIdentifier": "secondary",
        "Failover": "SECONDARY",
        "TTL": 60,
        "ResourceRecords": [{"Value": "52.49.10.2"}],
        "HealthCheckId": "$HC_SECONDARY"
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://change-batch.json
```

### 6.4 — Vérification

```bash
# Lister les records
aws route53 list-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --query "ResourceRecordSets[?Name=='app.example.com.']"

# Tester la résolution depuis n'importe où
dig +short app.example.com
# → 52.49.10.1   (primary, tant qu'il est sain)

# État des health checks
aws route53 get-health-check-status --health-check-id $HC_PRIMARY
aws route53 get-health-check-status --health-check-id $HC_SECONDARY
```

### 6.5 — Test du failover

Pour simuler la panne :

1. Arrêter l'instance primary (ou stopper Nginx, ou couper le port avec `iptables -A INPUT -p tcp --dport 443 -j DROP`).
2. Attendre ~90 secondes (3 sondes ratées à 30 s d'interval).
3. Lancer `aws route53 get-health-check-status --health-check-id $HC_PRIMARY` → status `Failure`.
4. `dig +short app.example.com` → renvoie maintenant `52.49.10.2` (secondary).
5. Réparer le primary. Après ~90 s, le health check repasse en success et le DNS bascule à nouveau.

**Caveat :** la propagation DNS dépend du **TTL** et du cache des resolvers. Avec TTL=60 s, le pire cas est ~60 s de cache + 90 s de détection = ~2,5 min de temps total avant que les clients voient le nouvel IP. Avec TTL=300 s : jusqu'à 7 min. **Pour du failover serré, TTL=60 s** est le standard.

### 6.6 — Variante : avec ALB

Au lieu de pointer vers des EC2 directement, on pointe vers des **ALB**, un par région ou par AZ :

```json
{
  "Action": "CREATE",
  "ResourceRecordSet": {
    "Name": "app.example.com",
    "Type": "A",
    "SetIdentifier": "primary",
    "Failover": "PRIMARY",
    "AliasTarget": {
      "HostedZoneId": "Z32O12XQLNTSW2", // ID hosted zone de l'ALB
      "DNSName": "my-alb-eu-west-1-123456.eu-west-1.elb.amazonaws.com",
      "EvaluateTargetHealth": true
    }
  }
}
```

Avantages :

- **EvaluateTargetHealth: true** : pas de health check Route 53 séparé, l'ALB sait si ses targets sont saines.
- **Pas de TTL** à gérer pour les ALIAS — c'est managé par AWS.
- **Plus rapide** côté propagation.

C'est le **pattern recommandé** en production.

---

## 7. Patterns récurrents

### 7.1 — Apex domain → CloudFront (vu en M6)

```
example.com.       A     ALIAS → d-abc123.cloudfront.net
www.example.com.   CNAME example.com.
```

L'ALIAS au sommet du domaine est rendu possible **uniquement par Route 53** — un DNS standard ne le permettrait pas.

### 7.2 — Sous-domaine → ALB par environnement

```
api.example.com.       A   ALIAS → alb-prod.eu-west-1.elb.amazonaws.com
api.staging.example.com.   A   ALIAS → alb-staging.eu-west-1.elb.amazonaws.com
api.dev.example.com.       A   ALIAS → alb-dev.eu-west-1.elb.amazonaws.com
```

### 7.3 — Multi-région avec failover

```
api.example.com.   A   PRIMARY    ALIAS → alb-eu-west-1.elb.amazonaws.com   (health: ALB eu-west-1)
api.example.com.   A   SECONDARY  ALIAS → alb-us-east-1.elb.amazonaws.com   (health: ALB us-east-1)
```

Si l'ALB primary tombe (au sens "toutes ses targets sont unhealthy"), le DNS bascule sur la région DR.

### 7.4 — Multi-région avec latency

```
api.example.com.   A   LATENCY (region=eu-west-1)   ALIAS → alb-eu-west-1
api.example.com.   A   LATENCY (region=us-east-1)   ALIAS → alb-us-east-1
api.example.com.   A   LATENCY (region=ap-northeast-1) ALIAS → alb-ap-northeast-1
```

Chaque utilisateur atterrit sur la région la plus proche. Pas de notion de "primary" : c'est **actif/actif**, plus complexe mais plus performant.

### 7.5 — Split-horizon (public + privé)

```
Hosted zone publique example.com :
  api.example.com.   A   ALIAS → alb-public.elb.amazonaws.com   (52.49.x.x)

Hosted zone privée example.com (associée au VPC) :
  api.example.com.   A   ALIAS → alb-internal.elb.amazonaws.com  (10.0.0.x)
```

Un service tier interne fait `api.example.com` et obtient l'IP **privée** (pas de sortie Internet, latence minimale). Un client externe fait le même lookup et obtient l'IP publique.

---

## 8. Exercices pratiques

### Exercice 1 — Hosted zone et records de base (≈ 30 min)

**Objectif.** Premiers pas Route 53.

**Étapes :**

1. Créer une hosted zone publique pour un domaine qu'on contrôle (ou un sous-domaine).
2. Mettre à jour les NS chez le registrar (si on contrôle le domaine racine), ou créer la délégation NS chez le parent (si sous-domaine).
3. Ajouter un record A pointant vers une EC2 démarrée pour l'exercice.
4. Vérifier la résolution avec `dig`.
5. Modifier le TTL à 60 s pour les exercices suivants.
6. **Bonus** : ajouter un record TXT avec une string arbitraire, vérifier avec `dig TXT`.

**Livrable.** Captures des `dig` avant et après changement.

### Exercice 2 — ALIAS vers ALB (≈ 30 min)

**Objectif.** Utiliser un ALIAS plutôt qu'un CNAME.

**Setup.** Un ALB existant (créé pour l'exercice ou pour M2/M4).

**Étapes :**

1. Créer un record `app.example.com` ALIAS vers l'ALB.
2. Tenter de créer le même record en CNAME au sommet du domaine (`example.com` CNAME alb…) : doit échouer (RFC interdit).
3. Créer le même au sommet en ALIAS : doit fonctionner.
4. Vérifier avec `dig` et `curl https://example.com/...`.

**Livrable.** Mini-rapport démontrant les deux propriétés (interdit en CNAME apex, autorisé en ALIAS apex).

### Exercice 3 — Failover end-to-end (≈ 60 min)

**Objectif.** L'exercice central — appliquer la section 6.

**Étapes :**

1. Lancer 2 EC2 dans 2 AZ avec Nginx servant `/health` sur HTTPS.
2. Attacher une EIP à chaque.
3. Créer les health checks et records failover (script section 6.2-6.3).
4. Tester la résolution initiale : `dig` doit renvoyer l'IP primary.
5. **Couper** l'instance primary (stop ou block port).
6. Attendre 90 s, vérifier que le health check primary passe en `Failure`.
7. Faire un `dig` : doit renvoyer l'IP secondary.
8. Réparer le primary, attendre 90 s, le DNS doit redevenir primary.

**Livrable.** Timeline avec timestamps :

- T0 : panne primary
- T_x : health check passe en failure
- T_y : DNS bascule
- Mesurer le **temps total de bascule** côté client (et le comparer à la théorie).

### Exercice 4 — Private hosted zone (≈ 30 min)

**Objectif.** Comprendre la résolution interne.

**Étapes :**

1. Créer une private hosted zone `internal.example.com` associée au VPC de M2.
2. Y ajouter un record A `db.internal.example.com` → IP privée d'une EC2 du subnet `private-app-a` (faute de RDS pour le TP).
3. Depuis une EC2 du même VPC, faire `dig db.internal.example.com` → doit renvoyer l'IP privée.
4. Depuis Internet (depuis son poste hors VPC), faire `dig db.internal.example.com` → doit échouer (NXDOMAIN).

**Livrable.** Captures des deux `dig`.

### Mini-défi — Concevoir un setup DNS pour un cas (≈ 30 min)

**Cas :** une plateforme SaaS pour 1000 utilisateurs UE et 200 utilisateurs US. Hébergement principal en `eu-west-1`. Une réplique DR en `us-east-1` (asynchrone, RPO ~5 min).

**Exigences :**

- Les utilisateurs UE vont prioritairement vers `eu-west-1`.
- Les utilisateurs US vont prioritairement vers `us-east-1` (latence).
- En cas de panne d'une région, tous les utilisateurs basculent sur l'autre.
- Une private hosted zone permet aux Lambdas de joindre la DB et le cache par nom.

**Livrable.** Schéma DNS textuel avec :

- Les records `api.example.com` (au moins 2-3, avec leur policy).
- Les health checks associés.
- La hosted zone privée et ses records.
- TTL recommandé pour chaque type de record.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Expliquer les **trois rôles** distincts : registrar, authoritative nameserver, resolver.
- [ ] Définir une **hosted zone** Route 53.
- [ ] Distinguer **public** et **private hosted zone** (3 différences).
- [ ] Expliquer le pattern **split-horizon DNS** (un même nom, deux réponses selon l'origine).
- [ ] Lister les **principaux types de records** (A, AAAA, CNAME, ALIAS, MX, TXT, NS).
- [ ] Expliquer pourquoi un **ALIAS** est préférable à un CNAME quand on pointe vers une ressource AWS (3 raisons).
- [ ] Citer les **7 routing policies** et donner un cas d'usage par policy.
- [ ] Définir un **health check** et donner les paramètres clés (endpoint, interval, failure threshold).
- [ ] Mettre en place un **failover automatique** entre 2 instances avec health checks (savoir le faire de mémoire).
- [ ] Calculer le **temps de bascule** théorique pour un failover (TTL + interval × threshold).
- [ ] Expliquer **EvaluateTargetHealth** sur un ALIAS vers un ALB.

### Items du glossaire visés

**N2 atteint** :

- _définir ce qu'est une hosted zone et la différence entre public et private_ — sections 2.3 et 2.4.
- _mettre en place un health check via route53_ — sections 5 et 6.

**Préparation N2 / M8** :

- _lier un nom de domaine à un Load Balancer_ — section 6.6 (variante ALB), approfondi en M8.

---

## 10. Ressources complémentaires

### Documentation AWS

- [Route 53 Developer Guide](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [Routing policies](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html)
- [Health checks](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover.html)
- [Private hosted zones](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-private.html)
- [ALIAS vs CNAME](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html)

### Outillage

- [Route 53 Resolver](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html) — pour faire le pont DNS entre on-premise et AWS (niveau 3).
- [Route 53 Traffic Flow](https://aws.amazon.com/route53/traffic-flow/) — éditeur visuel pour routing policies complexes.
- [dig / dnstool / nslookup] — outils standards pour débugger DNS.

### Bonnes pratiques

- [AWS Whitepaper — Multi-region patterns](https://docs.aws.amazon.com/whitepapers/latest/aws-multi-region-fundamentals/aws-multi-region-fundamentals.html)
- [Route 53 — DNS Failover](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-configuring.html)

### Pour aller plus loin

- **M6 (CloudFront)** : raccordement d'un nom de domaine à une distribution CDN. Approfondit l'usage des ALIAS.
- **M8 (Load Balancers)** : connection ALB/NLB → Route 53 en pratique.
- **Niveau 3** : Route 53 Resolver, exposition de sous-domaines à d'autres comptes AWS (RAM share), DNSSEC.
