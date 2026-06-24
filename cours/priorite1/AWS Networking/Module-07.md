# M7 — API Gateway

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **API Gateway** comme **frontend managé** pour des API (REST, HTTP, WebSocket), distinguer ses trois saveurs et savoir laquelle utiliser quand.
- Distinguer les **trois types d'endpoint** d'API Gateway — **Edge-optimized**, **Regional**, **Private** — et énoncer dans quel cas chacun est pertinent.
- **Lier un nom de domaine personnalisé** à une API Gateway en utilisant un **custom domain name** + **certificat ACM** (région correcte selon le type d'endpoint) + record **ALIAS** Route 53.
- **Lier un VPC** à une API Gateway via un **VPC Link** pour atteindre un ALB / NLB privé, ou via un **endpoint privé** pour rendre l'API accessible uniquement depuis un VPC.
- **Exposer une Lambda** derrière API Gateway : créer l'intégration, configurer le mapping, déployer dans un stage, tester l'endpoint.
- Reconnaître les **patterns canoniques** (API publique → Lambda, API privée VPC, micro-service via VPC Link, WebSocket pour temps réel) et les **anti-patterns** (utiliser API Gateway comme proxy générique, oublier le throttling, mélanger REST et HTTP par méconnaissance).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M6 (régions, VPC, SG, Route 53, CloudFront, certificats ACM).
- Connaissance basique d'AWS Lambda (au moins : créer une fonction, l'invoquer, lire les logs).
- Bases REST / HTTP : verbes, status codes, headers.

---

## 1. Pourquoi API Gateway

### 1.1 — Le rôle

Une **API Gateway** est un **point d'entrée unique** pour des API HTTP / WebSocket. Elle gère, **sans qu'on doive coder cela soi-même** :

- **Routage** : `/users/*` vers Lambda A, `/orders/*` vers Lambda B, `/admin/*` vers un ALB privé.
- **Authentification** : Cognito, JWT, Lambda authorizer, API keys, IAM.
- **Throttling et quotas** : 1000 req/s globaux, 100 req/s par client, plan d'usage.
- **Caching** : cacher les réponses pendant N secondes.
- **Transformation** : modifier les requêtes/réponses (headers, body, status code).
- **Logging et monitoring** : CloudWatch logs + X-Ray traces par requête.
- **CORS** : gestion des en-têtes pour les appels cross-origin.

Sans API Gateway, il faudrait soit coder tout cela dans chaque service, soit installer un reverse proxy custom (Nginx, Kong, Traefik) qu'on opère soi-même.

### 1.2 — Position dans l'architecture

```
Client                                                  Backend
  │                                                        │
  │ HTTPS / WSS                                            │
  ▼                                                        ▼
┌──────────────────────────────────────────┐  ┌──────────────────────┐
│ API Gateway                              │  │ Lambda               │
│ - Routage                                │  │ Containers (Fargate) │
│ - Auth                                   │  │ ALB / NLB privé      │
│ - Throttling                             │  │ Services HTTP externes│
│ - Cache                                  │  │ Autres services AWS  │
│ - Transformation                         │  │ (DynamoDB, S3, …)    │
└──────────────────────────────────────────┘  └──────────────────────┘
```

### 1.3 — API Gateway vs alternatives

| Solution                     | Pour quoi                                                                  | Limites                                                 |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| **API Gateway**              | API publique avec auth, throttling, transformation, plusieurs intégrations | Latence ~10-30 ms, prix peut grimper à très haut trafic |
| **ALB direct**               | Service HTTP simple sur EC2/ECS, sans auth poussée                         | Pas d'auth native, pas de mapping fin, pas de throttle  |
| **Lambda Function URL**      | Lambda seule exposée en HTTPS sans routage                                 | Pas de routage multi-Lambda, pas de stages              |
| **CloudFront + Lambda@Edge** | CDN avec logique simple à l'edge                                           | Pas une vraie API gateway, limites Lambda@Edge          |
| **Custom (Kong, Traefik)**   | Cas très spécifiques (gateways multi-cloud, plugin custom)                 | Tout à opérer soi-même                                  |

**Règle simple :** dès qu'on a une **API publique** avec **plusieurs routes**, des **besoins d'auth** ou de **throttling**, et qu'on est dans AWS, **API Gateway** est le défaut raisonnable.

---

## 2. Les trois saveurs d'API Gateway

AWS propose **trois** types d'API Gateway, avec des cas d'usage et tarifs distincts. À ne pas confondre.

### 2.1 — REST API (la "v1", historique)

**La plus complète, la plus chère, la plus complexe.**

| Caractéristique         | Détail                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| Cas d'usage             | API REST robuste avec auth fine, transformation, validation de schéma. |
| Coût                    | ~3,50 $/million de requêtes + transfert.                               |
| Intégrations            | Lambda, HTTP, AWS services, mock.                                      |
| Caching                 | Oui (au stage, 0,5-237 GB, payant).                                    |
| API keys et usage plans | Oui.                                                                   |
| WAF                     | Oui.                                                                   |
| Endpoint types          | Edge-optimized, Regional, Private.                                     |
| Request validation      | Oui (JSON Schema).                                                     |
| Transformations         | VTL (Velocity Template Language) — puissant mais complexe.             |
| Throttling              | Burst + steady, par stage / route / API key.                           |

C'est l'option **historique** d'AWS, riche mais lourde.

### 2.2 — HTTP API (la "v2", moderne)

**Plus simple, plus rapide, ~70 % moins chère, avec moins de features.**

| Caractéristique        | Détail                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| Cas d'usage            | API simple Lambda ou HTTP backend, avec auth standard (JWT, IAM). |
| Coût                   | ~1,00 $/million de requêtes (vs 3,50 $).                          |
| Intégrations           | Lambda, HTTP, AWS service (subset).                               |
| Caching                | **Non**.                                                          |
| API keys / usage plans | **Non**.                                                          |
| WAF                    | **Non**.                                                          |
| Endpoint types         | Regional uniquement.                                              |
| Request validation     | Limité.                                                           |
| Transformations        | Mapping simple, pas de VTL.                                       |
| Throttling             | Plus simple, par route.                                           |

**Recommandation par défaut** depuis 2020 : utiliser **HTTP API** sauf besoin spécifique de REST API. Pour 80 % des cas, HTTP API suffit, est plus simple, et moins chère.

### 2.3 — WebSocket API

**Pour des connexions bidirectionnelles temps réel.**

| Caractéristique | Détail                                                         |
| --------------- | -------------------------------------------------------------- |
| Cas d'usage     | Chat en temps réel, dashboards live, jeux, notifications push. |
| Coût            | ~1,00 $/million de messages + minutes connectées.              |
| Intégrations    | Lambda, HTTP, AWS service.                                     |
| Particularités  | 3 routes spéciales : `$connect`, `$disconnect`, `$default`.    |

Hors scope du parcours niveau 2, à connaître par son nom.

### 2.4 — Tableau de choix

| Besoin                                     | API à choisir                  |
| ------------------------------------------ | ------------------------------ |
| API simple (CRUD JSON, auth JWT, Lambda)   | **HTTP API**                   |
| API avec cache, API keys, usage plans, WAF | **REST API**                   |
| Application temps réel bidirectionnelle    | **WebSocket API**              |
| API GraphQL                                | **AppSync** (hors API Gateway) |

---

## 3. Les types d'endpoint

Pour les REST API (et historiquement seul ce type), API Gateway propose **trois** types d'endpoint, qui déterminent **où** l'API est exposée.

### 3.1 — Edge-optimized

L'API est exposée via **CloudFront automatiquement intégré**. Les clients du monde entier atteignent le **edge CloudFront le plus proche**, qui forwarde à l'API Gateway.

- **Cas d'usage** : API publique mondiale avec audience géographiquement dispersée.
- **Avantage** : latence client → edge minimisée.
- **Coût** : pas de CloudFront facturé en plus (intégré au prix REST API).

**Limite** : le certificat ACM associé au custom domain doit être dans **us-east-1** (comme pour CloudFront — section 6 ci-dessous).

### 3.2 — Regional

L'API est exposée dans **une région** AWS précise (sans passer par CloudFront). Les clients atteignent directement le endpoint régional.

- **Cas d'usage** : audience principalement dans une région, intégration interne, API qui sera devant un CloudFront déjà existant.
- **Avantage** : latence stable, contrôle sur la région.
- **Coût** : certificat ACM dans **la même région** que l'API.

C'est le **type par défaut** des HTTP API (les HTTP API sont **toujours** regional).

### 3.3 — Private

L'API n'est **accessible que depuis un VPC**, via un **VPC Interface Endpoint** (PrivateLink). Aucune exposition Internet.

- **Cas d'usage** : API interne entre services, API de back-office, sécurité maximale.
- **Avantage** : isolation totale, audit simple, aucune surface Internet.
- **Configuration** : une **resource policy** sur l'API restreint l'accès aux VPC endpoints autorisés.

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:eu-west-1:ACCOUNT:API-ID/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceVpce": "vpce-0abc1234"
        }
      }
    }
  ]
}
```

### 3.4 — Choisir un endpoint type

| Audience / besoin                           | Type d'endpoint                 |
| ------------------------------------------- | ------------------------------- |
| API publique, audience mondiale, REST API.  | Edge-optimized.                 |
| API publique, audience régionale (UE seul). | Regional.                       |
| API derrière un CloudFront déjà configuré.  | Regional (CloudFront en amont). |
| API HTTP (saveur v2).                       | Regional (seul disponible).     |
| API interne entre services AWS.             | Private.                        |
| API d'admin / interne / sensible.           | Private.                        |

---

## 4. Les intégrations backend

API Gateway forwarde les requêtes à une **intégration**. Cinq types principaux.

### 4.1 — Lambda (le plus courant)

API Gateway invoque une Lambda et lui passe la requête. Trois variantes :

- **Lambda proxy integration** (recommandée) : tout le payload de la requête est passé à la Lambda, la Lambda renvoie status + headers + body. Simple, transparent.
- **Lambda non-proxy** : on configure un mapping VTL pour transformer la requête. Plus de contrôle, plus complexe.
- **Lambda async** : invocation asynchrone (pour fire-and-forget).

Pour 95 % des cas : **proxy integration**.

### 4.2 — HTTP backend

API Gateway forwarde vers un endpoint HTTP / HTTPS (un ALB public, un service externe, etc.).

- Cas d'usage : exposer un backend HTTP existant derrière API Gateway pour profiter de l'auth, du throttling, etc.
- Configuration : URL de l'endpoint + méthode + headers.

### 4.3 — AWS service direct

API Gateway peut invoquer **directement** un service AWS sans Lambda intermédiaire. Cas typiques :

- `PUT /items` → directement `dynamodb:PutItem`.
- `POST /messages` → directement `sqs:SendMessage`.
- `GET /file/{id}` → directement `s3:GetObject`.

Avantage : **pas de Lambda à payer ni à maintenir**, latence minimale.
Limite : transformations complexes nécessitent VTL (REST API uniquement).

### 4.4 — Mock

L'intégration renvoie une réponse **hard-codée** sans appeler de backend. Utile pour le développement, les tests, les CORS preflight.

### 4.5 — VPC Link (pour atteindre un endpoint privé)

L'intégration HTTP atteint un **ALB / NLB privé** dans un VPC, via un **VPC Link**. Vu en détail en section 5.

---

## 5. Lier un VPC — VPC Link

C'est **l'un des deux items N2 explicites** du module.

### 5.1 — Le besoin

Une API Gateway est par défaut un service **public**. Si elle doit appeler un service **privé** dans un VPC (par exemple un ALB qui n'est pas exposé sur Internet), elle ne peut pas le joindre directement.

Trois approches possibles :

1. **Exposer l'ALB sur Internet** (mauvaise idée — ouvre l'attaque, contredit l'archi privée).
2. **VPC Link** : un lien dédié, géré par AWS, qui permet à API Gateway d'atteindre un endpoint privé.
3. **Mettre la logique dans une Lambda en VPC** qui appelle l'endpoint privé. Possible mais ajoute une couche.

VPC Link est **la** solution propre.

### 5.2 — Deux générations de VPC Link

| Type                            | Pour quoi | Cible                                               |
| ------------------------------- | --------- | --------------------------------------------------- |
| **VPC Link pour REST API**      | REST API  | NLB **privé** (Network Load Balancer)               |
| **VPC Link pour HTTP API (v2)** | HTTP API  | ALB **privé**, NLB **privé**, AWS Cloud Map service |

Le VPC Link pour HTTP API est plus flexible (ALB privé direct, pas de besoin de NLB intermédiaire).

### 5.3 — Mise en place — étapes

Pour un VPC Link HTTP API vers ALB privé :

```bash
# 1. Créer le VPC Link
VPC_LINK_ID=$(aws apigatewayv2 create-vpc-link \
  --name vpclink-internal-services \
  --subnet-ids subnet-priv-a subnet-priv-b \
  --security-group-ids $SG_VPCLINK \
  --query 'VpcLinkId' --output text)

# Attendre la création (~30 s)
aws apigatewayv2 get-vpc-link --vpc-link-id $VPC_LINK_ID

# 2. Sur l'API HTTP, créer une intégration via le VPC Link
aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type HTTP_PROXY \
  --integration-method ANY \
  --integration-uri arn:aws:elasticloadbalancing:eu-west-1:ACCOUNT:listener/app/my-alb/abc/listener-id \
  --connection-type VPC_LINK \
  --connection-id $VPC_LINK_ID \
  --payload-format-version 1.0

# 3. Créer la route
aws apigatewayv2 create-route \
  --api-id $API_ID \
  --route-key "ANY /internal/{proxy+}" \
  --target integrations/$INTEGRATION_ID
```

### 5.4 — Schéma

```
Internet ──HTTPS──► API Gateway (public) ──VPC Link──► ALB privé ──► EC2/ECS dans VPC privé
                                                       (10.0.10.x)    (10.0.10.y)
```

L'API est publique, mais elle a un **lien privé** vers un ALB qui n'expose **rien** sur Internet. Une demande qui arrive sur l'API est forwardée via le VPC Link, jamais via Internet, vers l'ALB privé.

### 5.5 — Coût VPC Link

- Création : gratuit.
- Heures : **0,01 $/h** par VPC Link (~7,20 $/mois).
- Trafic : pas de surcoût (compté dans le trafic de l'API Gateway).

### 5.6 — API privée vs VPC Link — distinction importante

- **API privée** (endpoint Private) : l'API **elle-même** est exposée uniquement dans un VPC. Personne d'Internet ne peut l'appeler.
- **VPC Link** : l'API est exposée publiquement, mais peut **appeler** des ressources privées dans un VPC.

Les deux sont compatibles : on peut avoir une API privée qui via VPC Link appelle d'autres services privés.

---

## 6. Lier un nom de domaine

C'est **l'autre item N2** du module. Le scénario : exposer une API Gateway sous `api.example.com` au lieu de `abcdef.execute-api.eu-west-1.amazonaws.com`.

### 6.1 — Les étapes

1. **Obtenir un certificat ACM** :
   - Pour une API **Edge-optimized** (REST API) : certificat dans **us-east-1**.
   - Pour une API **Regional** (REST ou HTTP API) : certificat dans la **même région** que l'API.
2. **Créer un Custom Domain Name** dans API Gateway (`api.example.com`) lié au certificat.
3. **Créer un mapping** (API mapping) : ce custom domain pointe vers telle API + tel stage.
4. **Créer le record Route 53 ALIAS** : `api.example.com` → endpoint du custom domain.

### 6.2 — Custom Domain Name — création

Pour une HTTP API regional :

```bash
# 1. Certificat ACM dans la même région
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.example.com \
  --validation-method DNS \
  --region eu-west-1 \
  --query 'CertificateArn' --output text)
# (validation DNS via Route 53, puis attente)

# 2. Créer le custom domain
aws apigatewayv2 create-domain-name \
  --domain-name api.example.com \
  --domain-name-configurations CertificateArn=$CERT_ARN,EndpointType=REGIONAL,SecurityPolicy=TLS_1_2

# 3. Récupérer l'API endpoint à utiliser pour le record ALIAS
DOMAIN_ENDPOINT=$(aws apigatewayv2 get-domain-name \
  --domain-name api.example.com \
  --query 'DomainNameConfigurations[0].ApiGatewayDomainName' --output text)
HOSTED_ZONE_DOMAIN=$(aws apigatewayv2 get-domain-name \
  --domain-name api.example.com \
  --query 'DomainNameConfigurations[0].HostedZoneId' --output text)
```

### 6.3 — API Mapping

```bash
aws apigatewayv2 create-api-mapping \
  --domain-name api.example.com \
  --api-id $API_ID \
  --stage prod \
  --api-mapping-key ""   # racine ; "" = "/"
```

On peut configurer un préfixe (`--api-mapping-key v1`) pour exposer `api.example.com/v1/...`.

### 6.4 — Record Route 53 ALIAS

```bash
HOSTED_ZONE_ID=Z123ABC456  # ID de la hosted zone example.com dans R53

cat > change.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "$HOSTED_ZONE_DOMAIN",
        "DNSName": "$DOMAIN_ENDPOINT",
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

### 6.5 — Vérification

```bash
curl -I https://api.example.com/hello
# → HTTP/2 200, x-amzn-RequestId: ...
```

Une fois en place, les clients n'ont **aucune connaissance** de l'endpoint `execute-api.amazonaws.com` original.

### 6.6 — Variante Edge-optimized

Pour une API Edge-optimized, le certificat doit être dans **us-east-1** :

```bash
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.example.com \
  --validation-method DNS \
  --region us-east-1 \
  --query 'CertificateArn' --output text)

# Custom domain avec EndpointType=EDGE
aws apigateway create-domain-name \
  --domain-name api.example.com \
  --certificate-arn $CERT_ARN \
  --endpoint-configuration types=EDGE \
  --security-policy TLS_1_2
```

Le record Route 53 ALIAS pointera vers un nom CloudFront (`d111111.cloudfront.net` derrière les coulisses).

---

## 7. Exposer une Lambda — pas à pas

L'objectif de cette section : créer une **HTTP API** simple qui expose une Lambda Python sur `/hello`.

### 7.1 — Plan

1. Créer une Lambda Python `hello-lambda` qui renvoie un JSON.
2. Créer une HTTP API `my-api`.
3. Créer l'intégration Lambda proxy.
4. Créer la route `GET /hello`.
5. Déployer dans un stage `prod`.
6. Tester.

### 7.2 — Script

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION=eu-west-1

# 1. Lambda
cat > /tmp/lambda.py <<'PY'
def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": '{"message": "Hello from Lambda via API Gateway"}'
    }
PY
cd /tmp && zip lambda.zip lambda.py && cd -

# Rôle IAM pour la Lambda (basic execution)
ROLE_ARN=$(aws iam create-role \
  --role-name hello-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --query 'Role.Arn' --output text 2>/dev/null || \
  aws iam get-role --role-name hello-lambda-role --query 'Role.Arn' --output text)
aws iam attach-role-policy --role-name hello-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

sleep 10  # propagation IAM

LAMBDA_ARN=$(aws lambda create-function \
  --function-name hello-lambda \
  --runtime python3.12 \
  --role $ROLE_ARN \
  --handler lambda.handler \
  --zip-file fileb:///tmp/lambda.zip \
  --region $REGION \
  --query 'FunctionArn' --output text)

# 2. HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name my-api \
  --protocol-type HTTP \
  --region $REGION \
  --query 'ApiId' --output text)

# 3. Intégration Lambda
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri $LAMBDA_ARN \
  --payload-format-version 2.0 \
  --integration-method POST \
  --region $REGION \
  --query 'IntegrationId' --output text)

# 4. Route
aws apigatewayv2 create-route \
  --api-id $API_ID \
  --route-key "GET /hello" \
  --target integrations/$INTEGRATION_ID \
  --region $REGION

# 5. Permission Lambda — autoriser API Gateway à l'invoquer
aws lambda add-permission \
  --function-name hello-lambda \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$(aws sts get-caller-identity --query Account --output text):$API_ID/*/*/hello" \
  --region $REGION

# 6. Stage et déploiement (HTTP API a un auto-deploy possible)
aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name prod \
  --auto-deploy \
  --region $REGION

# 7. Endpoint
ENDPOINT="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod/hello"
echo "Test : curl $ENDPOINT"
curl $ENDPOINT
# → {"message": "Hello from Lambda via API Gateway"}
```

### 7.3 — Validation

```bash
curl -i $ENDPOINT
# HTTP/2 200
# content-type: application/json
# {"message": "Hello from Lambda via API Gateway"}
```

Le pipeline est complet : un appel HTTP arrive sur API Gateway, est forwardé à la Lambda, qui renvoie une réponse.

### 7.4 — Variantes utiles

- **Plusieurs routes** : créer plus de couples route + intégration. Par exemple `POST /users` → Lambda B.
- **Path parameters** : `GET /users/{id}` — l'ID est passé dans `event["pathParameters"]["id"]`.
- **Auth JWT** : associer un authorizer Cognito ou JWT à la route — la Lambda ne sera invoquée que si le token est valide.

---

## 8. Authentification — survol

API Gateway supporte plusieurs mécanismes d'auth, à connaître par leur nom au niveau 2 :

| Méthode                       | Pour quoi                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| **IAM**                       | Auth par signature AWS (Sigv4). Pour API internes entre services AWS.                   |
| **Cognito user pool**         | Auth par utilisateur (login/password/MFA) géré par Cognito.                             |
| **JWT authorizer** (HTTP API) | Valider un JWT signé par n'importe quel OIDC provider (Auth0, Okta, Keycloak, Cognito). |
| **Lambda authorizer**         | Logique custom : la Lambda inspecte la requête et autorise / refuse.                    |
| **API keys** (REST API)       | Clés simples pour throttle par client, **pas pour la sécurité**.                        |

L'auth est associée à une **route** (HTTP API) ou une **méthode** (REST API). Les requêtes sans token valide sont rejetées **avant** d'atteindre la Lambda.

L'authentification fine (qui peut accéder à quoi) est sujet **niveau 3** du parcours — à connaître par son nom au N2.

---

## 9. Stages, déploiements, throttling

### 9.1 — Stages

Un **stage** est un **environnement déployé** d'une API : `dev`, `staging`, `prod`. Chaque stage a son propre :

- URL : `https://API-ID.execute-api.REGION.amazonaws.com/STAGE/...`
- Throttle settings.
- Variables (clés/valeurs accessibles depuis la Lambda pour différencier environnements).
- Logs CloudWatch.
- Tags.

**Bonne pratique** : un stage = un environnement. Ne pas mélanger.

### 9.2 — Déploiements (REST API)

En REST API, modifier une route ne suffit pas : il faut **déployer** explicitement (`create-deployment`) pour que le stage reflète le changement.

En HTTP API avec `--auto-deploy`, les changements sont immédiats.

### 9.3 — Throttling

Deux niveaux :

- **Account-level throttling** : 10 000 req/s par défaut (relevable). Au-delà, AWS répond 429 (Too Many Requests).
- **Stage-level / route-level throttling** : on peut limiter à 100 req/s pour une route donnée. Bonne pratique pour protéger Lambda de spikes.

```bash
# Throttle une route à 100 req/s steady, 200 burst
aws apigatewayv2 update-stage \
  --api-id $API_ID \
  --stage-name prod \
  --route-settings '{"GET /hello": {"ThrottlingBurstLimit": 200, "ThrottlingRateLimit": 100}}'
```

### 9.4 — Logging et monitoring

- **Access logs** : log de chaque requête (IP, status, latence) vers CloudWatch Logs ou S3.
- **Execution logs** : log détaillé pour debug (REST API only).
- **CloudWatch metrics** : `Count`, `Latency`, `4XXError`, `5XXError` par stage / route.
- **X-Ray traces** : tracer une requête à travers API Gateway → Lambda → DynamoDB, par exemple.

---

## 10. Anti-patterns

| Anti-pattern                                                                             | Pourquoi c'est mauvais                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Utiliser API Gateway comme **proxy générique** pour tout le trafic Internet.             | API Gateway n'est pas un reverse proxy général. Pour du trafic statique, **CloudFront** ; pour du trafic dynamique non-API, **ALB**. |
| Pas de **throttling** sur une API publique.                                              | Une attaque ou un client buggué peut faire exploser les coûts Lambda.                                                                |
| Mélanger **REST API et HTTP API** dans la même app par méconnaissance des différences.   | Confusion équipe, surcoût (REST).                                                                                                    |
| Custom domain : certificat dans la **mauvaise région** (us-east-1 vs region).            | Ne fonctionne pas.                                                                                                                   |
| API publique exposée pour des **usages internes uniquement** (mieux : private endpoint). | Surface d'attaque inutile.                                                                                                           |
| Lambda **synchrone** appelée par API Gateway pour une **tâche longue** (>30 s).          | API Gateway a un timeout de 29 s. Mieux : Step Functions async + WebSocket pour notifier la fin.                                     |
| Pas d'**auth** sur une API publique exposée par erreur.                                  | Compromission immédiate.                                                                                                             |
| `*` en CORS sans réflexion.                                                              | Surface XSS potentielle.                                                                                                             |

---

## 11. Exercices pratiques

### Exercice 1 — Exposer une Lambda (≈ 45 min)

**Objectif.** L'exercice central, vu en section 7.

**Étapes :** suivre le script de la section 7.2.

**Bonus :** ajouter une seconde route `POST /echo` qui reçoit du JSON et le renvoie tel quel.

**Livrable.** Captures des deux `curl` (`GET /hello`, `POST /echo`) + une lecture des logs CloudWatch pour vérifier l'invocation.

### Exercice 2 — Custom domain name (≈ 30 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Sur l'API de l'exercice 1, créer un certificat ACM `api-tp.<mondomaine>.fr` dans la **même région**.
2. Valider via Route 53.
3. Créer un custom domain name (Regional, TLS 1.2).
4. Créer l'API mapping.
5. Créer le record ALIAS Route 53.
6. Tester.

**Livrable.** Capture `curl https://api-tp.<mondomaine>.fr/hello` + capture `dig +short api-tp.<mondomaine>.fr` montrant les IPs régionales.

### Exercice 3 — VPC Link (≈ 60 min)

**Objectif.** L'autre item N2.

**Setup.** Réutiliser le VPC à 2 AZ de M2. Y déployer un **ALB interne** (vu en M4 / approfondi en M8) devant 1-2 EC2 servant un Nginx simple.

**Étapes :**

1. Créer un VPC Link HTTP API associé aux subnets privés.
2. Créer une nouvelle intégration HTTP_PROXY pointant vers l'ALB interne, type connection = VPC_LINK.
3. Créer une route `ANY /internal/{proxy+}` vers cette intégration.
4. Tester via l'endpoint public de l'API → atteint l'ALB privé.

**Livrable.** Schéma + captures montrant que la requête est servie alors que l'ALB n'a aucune IP publique.

### Exercice 4 — Throttling et limites (≈ 30 min)

**Objectif.** Voir l'effet du throttling.

**Étapes :**

1. Sur l'API de l'exercice 1, ajouter un throttle de **2 req/s** sur `GET /hello`.
2. Lancer un script qui fait 10 requêtes en boucle rapide.
3. Observer : certaines reçoivent `200`, d'autres `429 Too Many Requests`.
4. Mesurer combien de `429` sur 10 requêtes.
5. Augmenter le throttle, retester.

**Livrable.** Mémo de 5 lignes avec observations.

### Exercice 5 — Comparer REST API et HTTP API (≈ 30 min)

**Objectif.** Mettre la main sur les différences.

**Étapes :**

1. Recréer la même API simple en **REST API** que celle de l'exercice 1 (HTTP API).
2. Comparer :
   - Temps de création (combien de clics / lignes CLI ?).
   - Latence (`curl -w "%{time_total}"`).
   - Coût estimé à 10M req/mois.
   - Features dispo (API key, cache, …).

**Livrable.** Tableau comparatif de 10 lignes + recommandation par profil de projet.

### Mini-défi — Concevoir une API gateway pour un produit (≈ 30 min)

**Cas.** Application SaaS de gestion de tâches :

- API publique pour les utilisateurs (mobile + web).
- API privée pour les services internes (ETL, admin, monitoring).
- 1000 utilisateurs, 50 req/utilisateur/jour.

**Livrable.** Schéma + tableau :

- Combien d'API Gateway, et de quel type ?
- Quels endpoint types ?
- Quels noms de domaine (publics et internes) ?
- Quelle auth ?
- Quel throttling ?

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **API Gateway** et énoncer les **6 services** qu'elle rend (routage, auth, throttle, cache, transformation, logs).
- [ ] Distinguer **REST API**, **HTTP API**, **WebSocket API** (3 différences principales chacune).
- [ ] Citer les **3 types d'endpoint** et le cas d'usage de chacun (Edge / Regional / Private).
- [ ] Distinguer une **API privée** (endpoint Private) d'un **VPC Link** (deux concepts distincts mais complémentaires).
- [ ] Citer les **5 types d'intégration** (Lambda, HTTP, AWS service, Mock, VPC Link).
- [ ] **Raccorder un nom de domaine** à une API Gateway : 4 étapes, avec la subtilité du certificat ACM par région.
- [ ] **Lier un VPC** via un VPC Link à une API Gateway : étapes et cas d'usage.
- [ ] **Exposer une Lambda** derrière API Gateway de mémoire (intégration Lambda proxy, route, permission, stage).
- [ ] Citer 4 mécanismes d'**authentification** API Gateway.
- [ ] Citer 3 **anti-patterns** API Gateway.

### Items du glossaire visés

**N2 atteint** :

- _lier un nom de domaine ou un VPC à un endpoint API Gateway_ — sections 5 et 6.

---

## 13. Ressources complémentaires

### Documentation AWS

- [API Gateway Developer Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html)
- [Choose between REST API and HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [Endpoint types](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html)
- [Custom domain names](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html)
- [VPC Links](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vpc-links.html)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)

### Patterns et exemples

- [Serverless patterns collection](https://serverlessland.com/patterns) — exemples complets API Gateway + autres services.
- [AWS Solutions Library — API on AWS](https://aws.amazon.com/solutions/case-studies/)

### Pour aller plus loin

- **M8 (Load Balancers)** : ALB / NLB, à savoir distinguer d'API Gateway.
- **Cognito** : gestion d'identités utilisateur, intégrée à API Gateway.
- **AppSync** : GraphQL managé, alternative à API Gateway pour GraphQL.
- **Niveau 3** : authentifications avancées, Lambda authorizers complexes, transformations VTL, Lambda@Edge devant API Gateway.
