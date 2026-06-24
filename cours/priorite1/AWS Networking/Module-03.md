# M3 — Sécurité réseau

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir un **Security Group (SG)** — firewall **stateful** attaché à une interface réseau (ENI), avec règles **allow only**.
- Définir une **Network ACL (NACL)** — firewall **stateless** attaché à un **subnet**, avec règles **allow et deny** numérotées.
- Distinguer SG et NACL sur au moins **six axes** (granularité, état, vocabulaire des règles, attachement, ordre d'évaluation, cas d'usage), et savoir lequel utiliser quand.
- Écrire et lire des **règles de trafic** entrant et sortant : source/destination (CIDR, autre SG, prefix list), port, protocole.
- **Durcir** le trafic entrant et sortant d'une instance EC2 selon le principe du **moindre privilège**, sur trois profils types (serveur web, base de données, bastion SSH).
- **Diagnostiquer** un trafic bloqué (ou un trafic non bloqué qu'on voulait bloquer) en suivant une checklist méthodique.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (régions, AZ, IP) et M2 (VPC, subnet, table de routage).
- Bases TCP/UDP : notion de port, distinction client/serveur, comprendre `80 = HTTP`, `443 = HTTPS`, `22 = SSH`, `5432 = PostgreSQL`, etc.
- AWS CLI v2 configurée, permissions IAM sur EC2 (`ec2:AuthorizeSecurityGroup*`, `ec2:CreateNetworkAcl*`, etc.).
- Idéalement, le VPC à 2 AZ construit en M2 sous la main (sinon, le default VPC suffit pour les exercices).

---

## 1. Pourquoi deux couches de filtrage

### 1.1 — Le principe de défense en profondeur

En sécurité, **un seul rempart ne suffit jamais**. La maxime "defense in depth" pose qu'un système doit être protégé par **plusieurs couches indépendantes**, chacune posant une vérification, pour qu'une erreur de configuration ou un contournement d'une couche ne suffise pas à compromettre l'ensemble.

AWS applique ce principe sur le trafic réseau du VPC avec **deux couches** complémentaires :

1. **Security Group (SG)** — protège une **instance** (ou plus précisément, une **interface réseau** attachée à une instance). Au plus près de la ressource.
2. **Network ACL (NACL)** — protège un **subnet** entier. Au niveau du quartier.

Un paquet entrant dans le VPC doit franchir **la NACL du subnet**, puis **le SG de l'instance cible** avant d'atteindre celle-ci. Un paquet sortant : **le SG de l'instance source**, puis la **NACL du subnet** avant de quitter le subnet.

### 1.2 — L'analogie de l'immeuble (suite)

Reprenant l'analogie de M2 :

- La **NACL**, c'est le **vigile à l'entrée du quartier** (subnet). Il a une liste numérotée : "les gens portant ce badge entrent, ceux-là sortent, ces autres-là : refus immédiat". Il ne se souvient pas de qui est entré — chaque mouvement est jugé indépendamment.
- Le **Security Group**, c'est le **digicode à la porte de l'appartement** (instance). Il connaît la liste des invités autorisés. Quand un invité entre, le digicode **se souvient** de lui : quand il ressort, il n'a pas à présenter à nouveau ses papiers.

Deux contrôles différents, deux logiques différentes, **deux protections complémentaires**.

### 1.3 — En pratique : 95 % du temps, seul le SG est touché

Important pour calibrer l'effort :

- **Security Groups** : utilisés intensivement. Modifiés régulièrement à mesure que l'architecture évolue. Granularité fine. C'est **le** levier de sécurité réseau du quotidien.
- **NACLs** : laissées en configuration "tout autorisé par défaut" dans la plupart des déploiements. Utilisées uniquement pour des **blocages explicites large échelle** (par exemple : bloquer une IP malveillante à l'échelle d'un subnet entier).

Conclusion pratique : **maîtriser parfaitement les SG**, **connaître les NACL**, savoir distinguer les deux et choisir la bonne couche pour un besoin donné.

---

## 2. Le Security Group (SG)

### 2.1 — Définition

Un **Security Group** est un **firewall virtuel stateful** qui contrôle le trafic **entrant** (inbound) et **sortant** (outbound) d'une ou plusieurs **interfaces réseau** (ENI), donc des instances qui les portent.

Quatre propriétés à graver :

1. **Stateful** : si une règle autorise la sortie d'un paquet, la **réponse** correspondante est automatiquement autorisée à l'entrée, **sans** règle inverse explicite. C'est l'inverse de "stateless".
2. **Allow only** : un SG n'a **que** des règles "autoriser". On ne peut **pas** créer une règle "bloquer". Le comportement par défaut est "refus" — autorise ce qu'on liste, refuse tout le reste.
3. **Attaché à un ENI** : pas à une instance. Une instance avec 2 ENI peut avoir 2 SG différents. À l'inverse, plusieurs instances partagent souvent **le même** SG.
4. **Évalué dans son ensemble** : pas d'ordre des règles. Si **au moins une** règle autorise un paquet, il passe.

### 2.2 — Structure d'une règle SG

Chaque règle d'un SG contient :

- Un **sens** : inbound (entrée) ou outbound (sortie).
- Un **protocole** : TCP, UDP, ICMP, ou "All".
- Une **plage de ports** : `22`, `80-90`, `1024-65535`, ou "All".
- Une **source** (pour inbound) ou **destination** (pour outbound) :
  - Une **CIDR** : `0.0.0.0/0`, `10.0.0.0/16`, `203.0.113.4/32`.
  - Un autre **Security Group** (référence dynamique — très puissant, voir 2.5).
  - Une **prefix list** AWS (par exemple, "la liste des préfixes S3 dans cette région").

### 2.3 — Le comportement par défaut

À la création d'un SG par AWS :

- **Inbound** : aucune règle (tout entrant est **refusé**).
- **Outbound** : une règle `0.0.0.0/0` (tout sortant est **autorisé**).

Cette asymétrie est intentionnelle : par défaut, une instance peut **sortir** (télécharger des updates, appeler des API) mais **n'est pas joignable** depuis l'extérieur. C'est le bon niveau de sécurité initial pour la plupart des cas.

**Bonne pratique de durcissement** : restreindre **aussi** le trafic sortant, surtout sur les instances sensibles. Voir section 6.

### 2.4 — Le caractère stateful en pratique

Exemple concret : on autorise dans le SG inbound de l'instance "web-1" la règle `TCP 443 from 0.0.0.0/0` (HTTPS depuis Internet). Quand un client se connecte :

1. **Client → web-1** : paquet TCP entrant sur port 443. **Match** la règle inbound → autorisé.
2. **web-1 → client** : paquet TCP sortant sur port éphémère (par exemple 53241). **Sans stateful**, il faudrait une règle outbound autorisant ce port spécifique. **Avec stateful**, AWS reconnaît la réponse à une connexion entrante autorisée → **autorisé automatiquement**.

Conséquence pratique : on n'a **pas besoin** de penser aux **ports éphémères** dans les règles. Le stateful gère ça.

### 2.5 — Le SG comme source — pattern puissant

Au lieu de mettre `10.0.10.0/24` comme source d'une règle, on peut référencer un **autre Security Group**. Concrètement :

> "Le SG `sg-app` autorise le port 5432 entrant depuis le SG `sg-db`."

Cette règle veut dire : **toute** instance portant `sg-db` peut joindre **toute** instance portant `sg-app` sur le port 5432. Quels que soient leur subnet, leur IP, leur nombre. Les nouvelles instances qui montent dans un Auto Scaling Group sont automatiquement couvertes dès qu'on leur attache le bon SG.

C'est **la** bonne manière de structurer les autorisations entre tiers applicatifs. À privilégier systématiquement sur les CIDR.

```
            ┌──────────────────────────────┐
            │ SG: sg-web                   │
            │ Inbound: 443 from 0.0.0.0/0  │
            │          22 from MY_IP/32    │
            └──────────────┬───────────────┘
                           │ (autorise les requêtes vers app)
                           ▼
            ┌──────────────────────────────┐
            │ SG: sg-app                   │
            │ Inbound: 8080 from sg-web    │
            └──────────────┬───────────────┘
                           │ (autorise les requêtes vers DB)
                           ▼
            ┌──────────────────────────────┐
            │ SG: sg-db                    │
            │ Inbound: 5432 from sg-app    │
            └──────────────────────────────┘
```

Trois SG, des règles **par référence** uniquement. Si demain on ajoute 50 instances `app`, les règles n'ont pas besoin d'être modifiées : il suffit de leur attacher `sg-app`. **Élégance maximale.**

### 2.6 — Le default SG

Comme le default VPC, chaque VPC a un **default SG** :

- **Inbound** : une règle qui autorise tout trafic… depuis lui-même. Concrètement, toutes les instances portant ce SG peuvent **se parler entre elles** sans restriction.
- **Outbound** : tout autorisé vers `0.0.0.0/0`.

Le default SG est **commode** pour démarrer, **dangereux** en production. Le réflexe est :

- **Ne jamais utiliser** le default SG en production.
- Créer des SG dédiés et nommés (par rôle : `sg-web`, `sg-app`, `sg-db`, `sg-bastion`, …).

### 2.7 — Commandes CLI essentielles

```bash
# Créer un SG
SG_WEB=$(aws ec2 create-security-group \
  --group-name sg-web --description "Web servers" \
  --vpc-id vpc-0abc... \
  --query 'GroupId' --output text)

# Autoriser HTTPS depuis Internet
aws ec2 authorize-security-group-ingress \
  --group-id $SG_WEB \
  --protocol tcp --port 443 \
  --cidr 0.0.0.0/0

# Autoriser SSH depuis son IP personnelle
MY_IP=$(curl -s https://checkip.amazonaws.com)/32
aws ec2 authorize-security-group-ingress \
  --group-id $SG_WEB --protocol tcp --port 22 --cidr $MY_IP

# Autoriser le SG sg-web à atteindre sg-app sur 8080
aws ec2 authorize-security-group-ingress \
  --group-id $SG_APP \
  --protocol tcp --port 8080 \
  --source-group $SG_WEB
```

---

## 3. La Network ACL (NACL)

### 3.1 — Définition

Une **Network ACL** est un **firewall stateless** attaché à un **subnet entier**. Tout paquet qui entre ou sort du subnet passe par ses règles.

Quatre propriétés à graver :

1. **Stateless** : chaque paquet est évalué **indépendamment**. La réponse à un paquet entrant **n'est pas** autorisée automatiquement — il faut une règle outbound qui couvre les **ports éphémères** (1024-65535 typiquement).
2. **Allow et deny** : contrairement aux SG, on peut écrire des règles "interdire" — utile pour bloquer une IP malveillante.
3. **Attachée à un subnet** : tous les paquets du subnet sont concernés, sans exception.
4. **Évaluée par numéro** : les règles sont **numérotées** (typiquement par pas de 10 ou 100), évaluées **en ordre croissant**, **premier match gagne**.

### 3.2 — Structure d'une règle NACL

```
Rule #   Type           Protocol  Port   Source/Dest    Allow/Deny
100      HTTPS          TCP       443    0.0.0.0/0      ALLOW
110      Ephemeral      TCP       1024-65535  0.0.0.0/0  ALLOW
200      Custom Block   TCP       22     203.0.113.66/32  DENY
*        ALL            ALL       ALL    0.0.0.0/0      DENY     (règle implicite finale)
```

Lecture :

- Une nouvelle connexion HTTPS entrante (port 443) → match règle 100 → autorisée.
- La réponse, vers un port éphémère du client → match règle 110 → autorisée (stateless oblige).
- Une tentative SSH depuis `203.0.113.66` → match règle 200 → refusée.
- Tout autre paquet → match règle implicite finale → refusé.

### 3.3 — Le piège stateless — les ports éphémères

C'est **le** point qui fait trébucher tout le monde sur les NACL :

> Si une NACL inbound autorise le port 443, **il faut aussi** une règle outbound autorisant les **ports éphémères** (typiquement 1024-65535) pour que les réponses puissent **sortir** du subnet vers le client.

Inversement : si une NACL outbound autorise le port 443 (instance qui sort vers le web), **il faut** une règle inbound autorisant les ports éphémères pour que les réponses entrent.

C'est laborieux et source d'erreurs — d'où la pratique majoritaire de **laisser les NACL en mode "tout autorisé"** et de **tout faire au SG**, qui est stateful.

### 3.4 — Le default NACL

Chaque VPC a une **default NACL** auto-créée :

- **Inbound** : `RULE 100 : ALLOW ALL` puis `RULE * : DENY ALL` (implicite).
- **Outbound** : `RULE 100 : ALLOW ALL` puis `RULE * : DENY ALL` (implicite).

Donc : **par défaut, la NACL laisse tout passer**. Tout le filtrage repose alors sur les Security Groups.

À la création d'une NACL **custom**, en revanche :

- **Inbound** : uniquement la règle implicite finale `DENY ALL` → tout bloqué.
- **Outbound** : idem.

Il faut **explicitement ajouter des règles allow**, sinon plus rien ne passe. À ne pas faire en plein workshop production.

### 3.5 — Cas d'usage légitimes des NACL

| Cas d'usage                                                  | Pourquoi NACL plutôt que SG                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Bloquer une IP malveillante au niveau d'un subnet entier.    | NACL a les règles `deny`, SG non.                                            |
| Imposer un blocage de niveau "subnet" pour conformité.       | Auditeur veut voir un contrôle au niveau réseau, pas seulement par instance. |
| Créer un subnet "complètement isolé" avec règles défensives. | Une NACL très restrictive donne une garantie supplémentaire.                 |
| Empêcher l'exfiltration des données via certains ports.      | Combiné aux SG, ajoute une couche.                                           |

### 3.6 — Commandes CLI

```bash
# Créer une NACL
NACL_ID=$(aws ec2 create-network-acl --vpc-id vpc-0abc... \
  --query 'NetworkAcl.NetworkAclId' --output text)

# Ajouter une règle inbound : autoriser HTTPS
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 100 \
  --protocol tcp --port-range From=443,To=443 \
  --cidr-block 0.0.0.0/0 \
  --rule-action allow \
  --ingress

# Ajouter une règle inbound : autoriser les ports éphémères pour les réponses
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 110 \
  --protocol tcp --port-range From=1024,To=65535 \
  --cidr-block 0.0.0.0/0 \
  --rule-action allow \
  --ingress

# Bloquer une IP malveillante
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 50 \
  --protocol -1 \
  --cidr-block 203.0.113.66/32 \
  --rule-action deny \
  --ingress

# Associer la NACL à un subnet
aws ec2 replace-network-acl-association \
  --association-id aclassoc-0xyz... \
  --network-acl-id $NACL_ID
```

---

## 4. SG vs NACL — tableau de différences

| Critère                               | Security Group                             | Network ACL                                   |
| ------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Granularité d'attachement**         | ENI / instance                             | Subnet entier                                 |
| **Stateful ?**                        | Oui — réponses auto-autorisées             | Non — chaque sens explicite                   |
| **Allow / deny ?**                    | Allow uniquement                           | Allow et deny                                 |
| **Ordre des règles**                  | Aucun (toutes évaluées ensemble)           | Numéroté, premier match gagne                 |
| **Comportement par défaut (custom)**  | Inbound deny, outbound allow               | Inbound deny, outbound deny                   |
| **Comportement par défaut (default)** | Allow entre membres du même SG             | Allow all in et out                           |
| **Référence par autre SG ?**          | Oui — pattern central                      | Non (CIDR uniquement)                         |
| **Nombre maximal par ressource**      | 5 SG par ENI                               | 1 NACL par subnet                             |
| **Usage typique**                     | Tout filtrage applicatif normal            | Blocage explicite à large échelle, conformité |
| **Fréquence de modification**         | Constante (au rythme de l'évolution archi) | Rare                                          |

**Synthèse : le bon réflexe.**

> Pour 95 % des règles, **utiliser un Security Group**. Réserver les NACL aux cas où on a vraiment besoin d'un **deny** explicite ou d'un contrôle au niveau du subnet entier pour la conformité.

---

## 5. Construire des règles de trafic

### 5.1 — Anatomie d'une règle bien faite

Une règle SG/NACL répond à **quatre** questions :

1. **Quel trafic** ? (protocole + port)
2. **Dans quel sens** ? (in ou out)
3. **Avec qui** ? (CIDR ou SG)
4. **Pourquoi** ? (à documenter dans la **description** de la règle — feature trop sous-utilisée)

### 5.2 — Trafic entrant (ingress / inbound)

Quelques règles canoniques :

```
# Serveur web public — HTTPS depuis Internet
TCP 443 from 0.0.0.0/0       (description: "HTTPS public traffic")
TCP 80  from 0.0.0.0/0       (description: "HTTP — redirection 443")

# SSH d'admin — strictement depuis l'IP perso
TCP 22 from 203.0.113.4/32   (description: "SSH from ops laptop")

# Backend qui doit recevoir des appels d'un autre SG
TCP 8080 from sg-web         (description: "API calls from web tier")

# Base de données qui doit recevoir des connexions d'un autre SG
TCP 5432 from sg-app         (description: "PostgreSQL from app tier")
```

### 5.3 — Trafic sortant (egress / outbound)

Par défaut, tout est autorisé en sortie sur un SG. Pour **durcir** un serveur sensible, on remplace cette règle générique par des règles ciblées :

```
# Serveur d'application qui doit seulement appeler la DB et un API externe
TCP 5432 to sg-db                     (description: "PostgreSQL out")
TCP 443  to pl-0abcdef (S3 prefix list) (description: "S3 access")
TCP 443  to api.example.com           (description: "Third party API" — nécessite EC2 + DNS resolver)
```

Cette pratique — **explicit egress** — réduit significativement la **surface d'exfiltration** en cas de compromission de l'instance (ransomware, exfil de données, etc.).

### 5.4 — Choix de la source

| Type de source     | Notation           | Quand l'utiliser                                                     |
| ------------------ | ------------------ | -------------------------------------------------------------------- |
| CIDR Internet      | `0.0.0.0/0`        | Service public (web, API publique). Avec parcimonie pour SSH.        |
| CIDR spécifique    | `203.0.113.0/24`   | Plage IP d'un partenaire, d'un bureau, d'un VPN.                     |
| CIDR personnel     | `MY_IP/32`         | Admin solo. Attention si IP dynamique (FAI résidentiel).             |
| Autre SG           | `sg-app`           | **À privilégier** entre tiers applicatifs.                           |
| Prefix list AWS    | `pl-6da54007` (S3) | Accès à un service AWS sans passer par Internet (avec VPC Endpoint). |
| Prefix list custom | `pl-xxx`           | Lister une fois des plages partenaires, les référencer dans N SG.    |

### 5.5 — Ports — bonnes pratiques

| Protocole / Port                        | Quand l'autoriser                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **TCP 22 (SSH)**                        | Strictement depuis IP fixe d'admin **ou** depuis un SG de bastion. Jamais `0.0.0.0/0` en prod sans MFA / SSM. |
| **TCP 3389 (RDP)**                      | Idem SSH — jamais ouvert au monde.                                                                            |
| **TCP 80 (HTTP)**                       | Front public seulement, généralement pour redirection vers 443.                                               |
| **TCP 443 (HTTPS)**                     | Front public.                                                                                                 |
| **TCP 5432, 3306, 27017, …**            | Strictement depuis SG d'app. **Jamais** ouvert à Internet.                                                    |
| **TCP 6379 (Redis), 11211 (Memcached)** | Strictement depuis SG d'app. Aucune authentification par défaut → exposition = compromission.                 |
| **TCP / UDP "All"**                     | **Jamais** sans raison documentée. Trop large, presque toujours une erreur.                                   |
| **ICMP**                                | Optionnel pour ping/traceroute en debug. Pas critique en prod.                                                |

---

## 6. Durcir une instance EC2 — trois profils types

### 6.1 — Principe du moindre privilège

> Une instance n'autorise **que** les flux strictement nécessaires à son rôle, **ni plus ni moins**.

Concrètement :

- Si une instance n'a **pas** vocation à servir Internet, ne pas la mettre dans un subnet public, ne pas autoriser `0.0.0.0/0` en ingress.
- Si une instance n'a **pas** besoin de sortir sur Internet, restreindre l'egress.
- Si deux instances ne sont **pas** censées se parler, ne pas leur donner de SG croisé.

### 6.2 — Profil 1 — Serveur web public (sg-web)

**Inbound :**

```
TCP 443  from 0.0.0.0/0       — HTTPS public
TCP 80   from 0.0.0.0/0       — HTTP, redirection
```

**Outbound :**

```
TCP 8080 to sg-app            — Appels au backend (si web + back séparés)
TCP 443  to pl-S3             — S3 (assets, logs)
TCP 443  to 0.0.0.0/0         — Updates OS, CDN externes (à serrer si possible)
TCP 53   to 0.0.0.0/0         — DNS
UDP 53   to 0.0.0.0/0         — DNS
```

**À éviter :** ne **pas** ouvrir SSH au monde. Soit via bastion, soit via SSM Session Manager.

### 6.3 — Profil 2 — Base de données (sg-db)

**Inbound :**

```
TCP 5432 from sg-app          — PostgreSQL depuis le tier app
```

**Outbound :**

```
TCP 443 to pl-S3              — Backups vers S3 (si activé)
                              — (pas d'egress Internet, pas d'appels externes)
```

**À noter :** la DB **n'a pas** besoin de sortir sur Internet. Si on remplace l'egress par défaut `0.0.0.0/0` par cette liste, on supprime tout risque d'exfiltration depuis la DB.

### 6.4 — Profil 3 — Bastion SSH (sg-bastion)

**Inbound :**

```
TCP 22 from MY_IP/32          — SSH depuis IP admin
TCP 22 from OPS_VPN_CIDR      — SSH depuis VPN d'équipe
```

**Outbound :**

```
TCP 22 to sg-app              — SSH vers les instances app
TCP 22 to sg-web              — SSH vers les instances web
TCP 22 to sg-db               — SSH vers les instances DB (rare, à n'autoriser que sur demande)
```

**À noter :** un bastion est un **point d'entrée unique** dans le réseau. Surveillé, loggé, audité. Idéalement remplacé par **SSM Session Manager** (pas de SSH du tout, pas de port 22 ouvert, accès via IAM + audit CloudTrail) — sujet hors module mais à connaître.

### 6.5 — Schéma d'ensemble

```
                ┌──────────────────────┐
                │ Internet             │
                └─────┬────────────────┘
                      │
                      ▼
           ┌──────────────────┐
           │ sg-web           │ ◄── 443 from 0.0.0.0/0
           │ EC2 web          │ ◄── 22  from sg-bastion
           └────────┬─────────┘
                    │ 8080 (egress)
                    ▼
           ┌──────────────────┐
           │ sg-app           │ ◄── 8080 from sg-web
           │ EC2 app          │ ◄── 22   from sg-bastion
           └────────┬─────────┘
                    │ 5432 (egress)
                    ▼
           ┌──────────────────┐
           │ sg-db            │ ◄── 5432 from sg-app
           │ RDS PostgreSQL   │   (pas de SSH, c'est un service managé)
           └──────────────────┘

           ┌──────────────────┐
           │ sg-bastion       │ ◄── 22 from MY_IP/32
           │ EC2 bastion      │
           └──────────────────┘
```

Six SG (web, app, db, bastion, plus celui de l'ALB et de la NAT Gateway implicite si on les ajoute), tous référencés entre eux par leur ID. Aucun CIDR `0.0.0.0/0` **sauf** pour le SG du tier exposé volontairement.

---

## 7. Diagnostic — quand le trafic ne passe pas (ou passe trop)

### 7.1 — Checklist "trafic bloqué"

Une instance ne répond pas comme attendu. Vérifier dans cet ordre :

1. **L'instance est-elle démarrée et son OS écoute-t-il sur le port ?**
   - `ss -tnlp` ou `netstat -tnlp` sur l'instance — vérifier que le service écoute.
   - Tester en local : `curl localhost:443` sur l'instance.
2. **Le Security Group autorise-t-il le trafic inbound ?**
   - `aws ec2 describe-security-groups --group-ids $SG_ID`.
   - Vérifier protocole, port, source.
3. **La NACL du subnet autorise-t-elle le trafic dans les deux sens ?**
   - Souvent default = tout autorisé, donc rarement le coupable. Mais à vérifier.
4. **Le subnet est-il bien public (route 0.0.0.0/0 → IGW) si on attend du trafic Internet ?**
   - `aws ec2 describe-route-tables` sur le subnet.
5. **L'instance a-t-elle bien une IP publique attachée** (si on essaie d'y accéder depuis Internet) ?
6. **Le firewall OS** (iptables, ufw, Windows Firewall) est-il configuré correctement ? Souvent désactivé sur AWS, mais à vérifier sur AMI custom.
7. **VPC Flow Logs** : activer pour voir si le paquet a atteint l'ENI et s'il a été accepté ou refusé (`ACCEPT` / `REJECT`).
8. **VPC Reachability Analyzer** : outil AWS qui simule un paquet de A à B et indique précisément où il est bloqué.

### 7.2 — Checklist "trafic non bloqué qu'on voulait bloquer"

Cas inverse : on a ajouté une règle de blocage, mais le trafic passe quand même.

1. **Si on a ajouté un `deny` dans un SG** : impossible, SG n'a pas de deny. Le trafic passe par une **autre règle allow** existante.
2. **Si on a ajouté un `deny` dans une NACL** : vérifier le **numéro de règle**. Si une règle `allow` a un numéro **plus petit**, elle gagne (premier match).
3. **L'instance a-t-elle plusieurs SG attachés** ? Le trafic est autorisé si **au moins un** SG l'autorise. Auditer tous les SG attachés à l'ENI.
4. **L'instance est-elle dans plusieurs subnets** (multi-ENI) ? Chaque ENI a son propre couple SG/NACL.

### 7.3 — VPC Flow Logs — l'outil incontournable

```bash
# Activer les Flow Logs sur un VPC, sortie CloudWatch Logs
aws ec2 create-flow-logs \
  --resource-ids vpc-0abc... \
  --resource-type VPC \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /aws/vpc/flowlogs \
  --deliver-logs-permission-arn arn:aws:iam::ACCOUNT:role/flowlogsRole
```

Format typique d'une ligne :

```
version account-id eni-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status
2       111122223333 eni-1a2b3c4d 172.31.16.139 172.31.16.21 20641 22 6 20 4249 1418530010 1418530070 ACCEPT OK
```

Lecture : on voit la **source**, la **destination**, le **port**, le **verdict** (`ACCEPT` ou `REJECT`). Indispensable pour le debug en production.

---

## 8. Exercices pratiques

### Exercice 1 — Durcir le trafic d'une EC2 (≈ 45 min)

**Objectif.** Mettre en pratique le moindre privilège.

**Setup.** Lancer une EC2 t3.micro dans le subnet **public** du VPC créé en M2, avec un SG **vide** (aucune règle inbound, outbound par défaut).

**Étapes :**

1. Vérifier qu'on ne peut **pas** SSH dessus (SG sans règle inbound 22).
2. Ajouter une règle SSH **strictement depuis son IP perso** (`MY_IP/32`).
3. Vérifier qu'on peut SSH.
4. Tenter SSH depuis un autre réseau (téléphone en partage de connexion par exemple) — doit échouer.
5. Sur l'instance, lancer un serveur HTTPS bidon (`python3 -m http.server 443` en root). Tester depuis son navigateur : ça ne marche pas (port 443 fermé en inbound).
6. Ouvrir 443 inbound depuis `0.0.0.0/0`. Tester à nouveau : ça marche.
7. **Bonus** : restreindre l'egress du SG à uniquement 443 vers `0.0.0.0/0`. Constater que `apt update` ne fonctionne plus (HTTP requis pour repos Ubuntu — mais pas HTTPS pour Amazon Linux).

**Livrable.** Capture des règles SG finales + un mini-mémo de 5 lignes : qu'apporte chaque règle, qu'est-ce qu'on peut encore faire, qu'est-ce qu'on ne peut plus.

### Exercice 2 — Référence par SG (≈ 30 min)

**Objectif.** Construire le pattern web → app → db.

**Étapes :**

1. Créer trois SG vides : `sg-tp-web`, `sg-tp-app`, `sg-tp-db`.
2. Configurer :
   - `sg-tp-web` : inbound `443 from 0.0.0.0/0`.
   - `sg-tp-app` : inbound `8080 from sg-tp-web`.
   - `sg-tp-db` : inbound `5432 from sg-tp-app`.
3. Lancer 3 EC2 t3.micro, une avec chaque SG, dans le bon subnet (web en public, app et db en privé).
4. Sur chacune, lancer `nc -lnvp <port>` (web sur 443, app sur 8080, db sur 5432).
5. Depuis web, tenter `nc -zv <ip-app> 8080` → doit fonctionner.
6. Depuis db, tenter `nc -zv <ip-app> 8080` → doit échouer.
7. Depuis app, tenter `nc -zv <ip-db> 5432` → doit fonctionner.

**Livrable.** Tableau résumant les 6 tests (3 directions × 2 ports) et leurs résultats observés.

### Exercice 3 — Bloquer une IP avec NACL (≈ 30 min)

**Objectif.** Voir l'unique cas où une NACL est strictement supérieure à un SG.

**Setup.** Sur le subnet public de M2, vérifier que la NACL est la default (tout autorisé).

**Étapes :**

1. Lancer une EC2 dans ce subnet avec un SG ouvert HTTPS au monde.
2. Tester l'accès HTTPS depuis son IP : OK.
3. Sur la NACL du subnet, ajouter une règle `RULE 90 : DENY from MY_IP/32`.
4. Tester à nouveau l'accès HTTPS depuis son IP : doit échouer.
5. Tester depuis un autre réseau (téléphone) : doit fonctionner.
6. Supprimer la règle 90. Tester : OK de nouveau.

**Livrable.** Mini-rapport : ce que cela démontre sur la complémentarité SG/NACL, et pourquoi on ne pourrait **pas** réaliser ce blocage uniquement avec un SG.

### Exercice 4 — Diagnostic guidé (≈ 30 min)

**Objectif.** S'entraîner à la checklist.

**Setup.** Un binôme casse délibérément **une seule** chose dans un VPC test (par exemple : supprimer la règle 443 d'un SG, ou ajouter une règle deny 443 dans une NACL, ou changer une route). L'autre doit diagnostiquer **sans qu'on lui dise** ce qui a été cassé.

**Livrable.** Liste ordonnée des commandes exécutées pour identifier le problème, et le délai d'identification.

### Mini-défi — Égaliser SG et NACL pour un cas donné (≈ 30 min)

Donner par écrit la **configuration SG ET NACL** pour ce scénario :

> Un subnet privé contient des bases RDS PostgreSQL. Les seules connexions autorisées sont :
>
> - Depuis les EC2 du SG `sg-app` sur 5432.
> - Depuis l'IP `10.0.0.50/32` du serveur de backup, sur 5432.
> - Pas de sortie Internet.
> - Une IP `203.0.113.66` a été identifiée comme malveillante par le SOC : à bloquer au niveau du subnet.

**Livrable.** Liste des règles SG et NACL avec leur numéro, sens, protocole, port, source, action, et description.

---

## 9. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir un **Security Group** et donner ses **quatre propriétés** clés (stateful, allow only, attaché à ENI, évalué dans son ensemble).
- [ ] Définir une **Network ACL** et donner ses **quatre propriétés** clés (stateless, allow et deny, attachée au subnet, numérotée).
- [ ] Citer **six différences** entre SG et NACL.
- [ ] Expliquer le **piège des ports éphémères** dans une NACL stateless.
- [ ] Expliquer le **pattern de référence par SG** et pourquoi il est préférable au CIDR entre tiers applicatifs.
- [ ] Construire un SG depuis zéro pour un **serveur web public**, une **base de données**, un **bastion SSH**.
- [ ] Lister **les ports** qu'on n'ouvre **jamais** au monde (SSH, RDP, ports DB).
- [ ] Diagnostiquer en **6 étapes** pourquoi un trafic est bloqué.
- [ ] Expliquer ce que **VPC Flow Logs** apporte au debug réseau.
- [ ] Donner un cas où une **NACL est strictement nécessaire** (impossible à faire avec SG seul).

### Items du glossaire visés

**N1 atteint** :

- _Security Group et règles de trafic_ — sections 2 et 5.

**N2 atteint** :

- _différence entre ACL réseau et Security Group_ — sections 3 et 4.

---

## 10. Ressources complémentaires

### Documentation AWS

- [Security Groups for your VPC](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html)
- [Network ACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [Compare SG and NACL](https://docs.aws.amazon.com/vpc/latest/userguide/security-vpc.html)
- [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html)
- [VPC Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html)

### Sécurité approfondie

- [AWS Well-Architected — Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) — pour se passer de SSH ouvert.
- [AWS Network Firewall](https://aws.amazon.com/network-firewall/) — couche au-dessus, pour filtrage avancé L3/L4/L7.

### Pour aller plus loin

- **M4 (Types de sous-réseaux)** : approfondit le principe de défense en profondeur appliqué à des architectures multi-tier.
- **AWS Identity (parcours dédié)** : gestion fine de qui peut modifier les SG via IAM.
- **AWS Config Rules** : détecter automatiquement les SG trop permissifs (par exemple, ouverture SSH au monde).
- **GuardDuty** : détection d'anomalies réseau au-dessus des Flow Logs.
