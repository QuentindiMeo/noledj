# M5 — Pertinence des tests unitaires

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Énoncer le **rapport valeur / coût** d'un test unitaire et identifier ses 3 axes : **coût d'écriture**, **coût de maintenance**, **coût d'exécution**, contre **valeur de régression**, **valeur design**, **valeur documentaire**.
- Identifier les **zones de forte valeur** où les tests unitaires sont rentables : logique métier non triviale, fonctions pures, parseurs, algorithmes, chemins critiques.
- Identifier les **zones de faible valeur** où les tests unitaires coûtent plus qu'ils n'apportent : getters/setters triviaux, wrappers fins, prototypes jetables, configurations statiques, présentation pure.
- Construire une **matrice "à tester / à ne pas tester"** (item N3 explicite) selon trois axes — **complexité du code**, **volatilité (fréquence de changement)**, **criticité métier** — et la défendre devant son équipe.
- Distinguer **tester un contrat** vs **tester une implémentation**, et reconnaître les tests qui mélangent les deux à leur perte.
- Auditer un projet existant et produire **sa matrice de pertinence** annotée — c'est la pratique demandée par le glossaire.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M4.
- Avoir un projet à analyser (perso, pro, OSS) — idéalement avec une suite de tests existante et une notion du coverage actuel.
- Concept du **coverage** vu en M1 (approfondi en M6).

---

## 1. Pourquoi un module sur la pertinence

### 1.1 — Au-delà du "il faut tester"

> Beaucoup d'équipes adoptent **un seul mantra** : "tester tout, à 100 % de coverage". Le résultat : des suites de tests **massives, lentes, fragiles**, qui consomment des semaines de maintenance sans empêcher les bugs métier.

L'inverse — "on testera quand on aura le temps" — produit des projets qui craquent au premier refactor.

Le N3 demande de **décider**, pas d'appliquer une règle universelle. Ce module fournit les **critères** et la **matrice** pour le faire.

### 1.2 — Le constat empirique

Plusieurs études et observations convergent vers un même schéma :

- ~20 % du code porte ~80 % des bugs (loi de Pareto).
- Le coverage **augmente** linéairement vers 100 %, mais la **valeur des tests** suit une **courbe en U inversé** : les premiers 50-70 % de coverage couvrent l'essentiel ; les 20-30 % suivants coûtent **disproportionnément** pour des cas marginaux ; les derniers 5 % sont souvent des asserts triviaux ou du défensif inutile.
- Une suite **trop fournie** sur du code peu critique **ralentit la CI** et **résiste au refactor**.

### 1.3 — L'analogie de la check-list aéronautique

Penser à un test comme à un **point de check-list pilote** :

- Un avion a une check-list pré-décollage très précise sur **les choses critiques** (moteurs, contrôle, carburant).
- Il **n'a pas** de check-list sur "la couleur des sièges" — c'est sans conséquence.
- Sur les éléments très **stables** (la position des coordonnées géographiques d'un aéroport), la check-list n'est pas re-créée à chaque fois — on fait confiance.

Une suite de tests fait pareil : tester ce qui peut casser, **proportionnellement aux conséquences**.

### 1.4 — Anti-patterns récurrents

| Anti-pattern                                                          | Conséquence                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Tester systématiquement tous les **getters / setters**.               | Tests qui ne servent à rien, freinent le refactor.             |
| Tester du **code généré** (ORM models de SQLAlchemy, Protobuf).       | On teste la lib, pas son code.                                 |
| Tester **un wrapper d'une lib externe** sans logique propre.          | On teste la lib amont — fragile, doublon.                      |
| Pas de tests sur la logique métier **critique**.                      | Régression silencieuse en prod.                                |
| Coverage 100 % comme but en soi.                                      | Encouragement à écrire des tests sans valeur ; perte de focus. |
| Pas de tests sur **les bugs déjà corrigés** (pas de regression test). | Le bug revient au refactor suivant.                            |
| Tester des **détails d'implémentation** (chemin de méthode interne).  | Tests fragiles, refactor impossible.                           |

---

## 2. Le rapport valeur / coût d'un test

### 2.1 — Les 3 coûts d'un test

| Coût            | Quand on le paye                             |
| --------------- | -------------------------------------------- |
| **Écriture**    | Une fois, à la création.                     |
| **Maintenance** | À **chaque refactor** ou changement de spec. |
| **Exécution**   | À **chaque run** (locale, CI, parallèle).    |

Les **deux derniers sont continus**. Un test "écrit puis oublié" coûte peu ; un test qu'on doit modifier à chaque sprint coûte cher.

### 2.2 — Les 4 valeurs d'un test

| Valeur                       | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Prévention de régression** | Le test échouera si une modification casse un comportement attendu.        |
| **Aide au design**           | Écrire le test révèle des **couplages** ou des **interfaces mal pensées**. |
| **Documentation exécutable** | Le test décrit **comment utiliser** le code, mieux qu'un commentaire.      |
| **Aide au debug**            | Un test isolé qui échoue **pointe la cause** plus vite qu'un bug en prod.  |

### 2.3 — Le ratio — schéma

```text
   Valeur
     ^
     │      ┌──────────────────  Logique métier critique
     │     /
     │    /        ┌─────  Code stable, peu critique
     │   /        /
     │  /       /     ┌──  Boilerplate
     │ /      /     /
     │/_____/____/_________  Trivial / wrappers
     └────────────────────►  Coût
```

Un test pertinent vit dans la **moitié supérieure gauche** : **haute valeur, faible coût**.

### 2.4 — Trois questions à se poser avant d'écrire un test

1. **Que se passe-t-il si ce comportement régresse en silence ?** Si la réponse est "rien de grave", le test apporte peu.
2. **Combien de fois ce code va-t-il changer dans les 12 prochains mois ?** Très souvent → maintenance lourde. Stable → moins gênant.
3. **Le test révèle-t-il un design ou re-décrit-il l'implémentation ?** S'il fait que paraphraser le code (`assert obj.x == 1` après `obj.x = 1`), il n'apporte rien.

---

## 3. Zones de forte valeur

### 3.1 — Logique métier non triviale

> Calculs, règles d'affaires, validations spécifiques au domaine.

Exemples :

- **Pricing** : calcul du prix d'une chambre avec saison + remise + taxes.
- **Validation** : "un IBAN valide" selon les règles de chaque pays.
- **Workflow** : "une commande peut passer de `paid` à `shipped` mais pas à `delivered` directement".
- **Permissions** : "un user peut éditer son propre profil mais pas celui d'un autre, sauf admin".

**Pourquoi c'est rentable** :

- Risque élevé : bug = impact business direct (facture fausse, accès donné à tort).
- Complexité : plusieurs branches, edge cases.
- Stabilité moyenne : les règles métier évoluent, mais leur essence reste.

**Comment** : tests unitaires, beaucoup de cas, TDD souvent adapté.

### 3.2 — Fonctions pures

> Fonctions dont le résultat dépend uniquement des entrées, sans side effect.

Exemples :

- Parseur (texte → AST).
- Formatter (objet → chaîne).
- Algorithme (tri, recherche, hash).
- Calcul mathématique.

**Pourquoi c'est rentable** : facile à tester (pas de mocking), couvre beaucoup d'edge cases, valeur de régression élevée car réutilisé partout.

**Comment** : tests paramétrés (M8), property-based testing pour les algorithmes.

### 3.3 — Bugs déjà corrigés (regression tests)

> Quand on corrige un bug en prod, on **écrit un test qui aurait détecté ce bug** avant de fixer.

**Pourquoi c'est rentable** :

- Le bug s'est manifesté **une fois** — il peut se manifester encore.
- Le test garantit qu'il ne reviendra pas en silence.
- Quasi-gratuit : on connaît déjà la cause, écrire le test prend 5 min.

**Comment** :

```python
def test_regression_issue_142_division_by_zero_in_discount():
    # Bug : appliquer une remise sur un panier vide donnait 0/0 = NaN
    cart = Cart(items=[])
    discount = Discount(rate=0.10)
    with pytest.raises(EmptyCartError):
        cart.apply(discount)
```

Nommer le test avec **l'ID du ticket** rend le lien limpide.

### 3.4 — Chemins critiques

> Le code qui, s'il casse, **arrête la facturation, perd des données, ou casse la confiance utilisateur**.

Exemples :

- Authentification.
- Paiement.
- Persistance des données critiques.
- Calcul de quotas / facturation.

**Pourquoi c'est rentable** : la **perte** d'un bug est énorme, le **coût** d'un test est négligeable en proportion.

**Comment** : tests unitaires denses + tests d'intégration sur le chemin complet.

### 3.5 — Code à longue durée de vie

> Le moteur de calcul d'impôts d'une entreprise comptable vit 15 ans.

**Pourquoi c'est rentable** : un test écrit aujourd'hui est rentabilisé sur 100+ runs CI/an × 15 ans.

À l'inverse, un script de migration one-shot ou un endpoint d'A/B test temporaire : les tests sont moins amortis.

### 3.6 — Tableau récapitulatif — forte valeur

| Type de code            | Couverture cible       | Style de test                      |
| ----------------------- | ---------------------- | ---------------------------------- |
| Pricing / règles métier | 90-100 %               | Unitaires nombreux + edge cases.   |
| Validation domaine      | 95-100 %               | Tests paramétrés.                  |
| Parseur / formatter     | 95-100 %               | Tests paramétrés + property-based. |
| Workflow d'état         | 100 %                  | Tests par transition.              |
| Auth / paiement         | 90-100 % + intégration | Unitaires + E2E.                   |
| Algorithme              | 90-100 % + property    | Tests cas + property-based.        |
| Bug fix                 | 100 % (le test du fix) | Regression test nommé.             |

---

## 4. Zones de faible valeur

### 4.1 — Getters / setters triviaux

```python
class User:
    def __init__(self, name):
        self._name = name

    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, value):
        self._name = value
```

Test :

```python
def test_user_name_set_get():
    u = User("alice")
    u.name = "bob"
    assert u.name == "bob"
```

**Valeur** : ~0. Le test re-décrit l'implémentation, qui n'a aucune logique. Si on enlève le test, **on perd quoi** ? Rien.

Exception : si le setter contient **une validation** (par exemple `len(value) > 0`), alors **la validation** mérite un test, pas le get/set.

### 4.2 — Wrappers fins de bibliothèques

```python
def list_buckets():
    return boto3.client('s3').list_buckets()['Buckets']
```

Tester cela revient à tester **boto3**, pas son propre code. Mocker boto3 → on teste seulement que le mock retourne ce qu'on a configuré.

**Valeur** : ~0 sauf si on a une **transformation** par-dessus.

```python
def list_my_buckets_names():
    response = boto3.client('s3').list_buckets()
    return sorted(b['Name'] for b in response['Buckets'] if 'archive' not in b['Name'])
```

Là, le tri + le filtre **méritent** un test (et ils sont testables sans S3 réel).

### 4.3 — Configurations statiques

```python
class Config:
    TIMEOUT = 30
    RETRIES = 3
    BASE_URL = "https://api.example.com"
```

Test :

```python
def test_config_timeout():
    assert Config.TIMEOUT == 30
```

**Valeur** : ~0. Le test "vérifie" la constante en la dupliquant. Si on change `30` → on change aussi le test pour qu'il passe. Aucune protection.

**Sauf** si la config est **calculée** (lecture d'env vars avec défauts, validation des valeurs) — alors **la logique de calcul** mérite test.

### 4.4 — Prototypes jetables

> Script de migration one-shot, POC pour valider une idée, brouillon de feature qu'on jettera dans 2 jours.

Coût d'écriture pour ~0 valeur de régression (le code disparaîtra).

Exception : un POC qui devient prod et qu'on doit ré-écrire avec tests cette fois.

### 4.5 — Présentation pure

> Templates Jinja, components React purement présentation (rendre un texte).

**Valeur faible** sauf cas particulier :

- Tests **snapshot** pour détecter régressions visuelles.
- Tests **end-to-end** sur les parcours critiques (un Cypress sur le checkout vaut 50 tests unitaires de composants `Button`).

### 4.6 — Code généré

ORM models, classes Protobuf, types TypeScript générés depuis OpenAPI : **tester le code généré** = tester le générateur, doublon.

### 4.7 — Glue / wiring

```python
@app.post("/users")
def create_user(user: UserIn, db: Session = Depends(get_db)):
    return user_service.create(db, user)
```

Le endpoint **wire** la requête vers le service. Le tester unitairement :

- Mock `user_service.create` → on vérifie que FastAPI route — l'a déjà testé.
- Test d'intégration via TestClient → bien plus utile et pas plus cher.

### 4.8 — Tableau récapitulatif — faible valeur

| Type de code                    | Couverture cible                         | Pourquoi                                   |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Getters / setters triviaux      | 0 % unitaire ; couvert via tests métier. | Pas de logique propre.                     |
| Constantes / Config statique    | 0 %.                                     | Re-déclaration inutile.                    |
| Wrapper 1-ligne d'une lib       | 0 % unitaire ; intégration éventuelle.   | Test de la lib, pas du code.               |
| ORM models / code généré        | 0 %.                                     | Tester le générateur.                      |
| Routes / endpoints triviaux     | 0 % unitaire ; intégration TestClient.   | Le framework est déjà testé.               |
| Composants UI présentation pure | Snapshot ou E2E.                         | Le DOM n'est pas le bon niveau d'unitaire. |
| Prototype < 2 semaines de vie   | 0 %.                                     | Pas d'amortissement.                       |

---

## 5. Cas ambigus — décider au cas par cas

### 5.1 — ORM / repository

Un repository qui wrappe SQLAlchemy :

```python
class UserRepo:
    def find_by_email(self, email):
        return self.session.query(User).filter(User.email == email).first()
```

Trois opinions valables :

- **Ne pas tester** : c'est juste un wrapper.
- **Tester avec SQLite in-memory** : test "d'intégration légère" qui vérifie la requête.
- **Tester avec mock de Session** : Pratique de mockists, fragile mais isolant.

**Recommandation** : si le repo a **uniquement** des opérations CRUD triviales, ne pas tester l'unité. Si on commence à empiler des `filter`, `join`, `order_by`, c'est de la **logique de requête** qui mérite un test d'intégration sur SQLite in-memory.

### 5.2 — Boilerplate validators

```python
class UserIn(BaseModel):
    email: EmailStr
    age: int = Field(ge=0, le=150)
```

**Tester Pydantic** ? Non, c'est la lib. **Tester ses contraintes business** ? Oui si elles sont non triviales.

```python
def test_user_in_rejects_invalid_email():
    with pytest.raises(ValidationError):
        UserIn(email="not-an-email", age=30)
```

Ce test rend explicite que **dans notre projet**, on rejette ce cas. Si Pydantic change un jour, on est alerté.

À évaluer : si on a 50 modèles Pydantic, tester chaque contrainte serait excessif. Privilégier les contraintes **non standard** (regex métier, validators custom).

### 5.3 — Wiring / DI

Un container DI qui instancie 30 services :

- Tester chaque instanciation : peu de valeur.
- Test smoke "le container démarre sans exception" : 1 test, beaucoup de couverture.

```python
def test_container_starts():
    container = build_container(env="test")
    assert container is not None
    container.shutdown()
```

Bon ratio coût/valeur.

### 5.4 — Tableau "ambigu"

| Type                         | Décision typique                                                   |
| ---------------------------- | ------------------------------------------------------------------ |
| Repo CRUD trivial            | Pas de test unitaire, intégration light si requêtes non triviales. |
| Repo avec logique de requête | Test sur DB éphémère.                                              |
| Validateur Pydantic standard | Pas de test (la lib le fait).                                      |
| Validator custom             | Test pour la règle métier.                                         |
| DI container                 | Test smoke "démarre".                                              |
| Module de logs / formatter   | Test du format si custom ; non si standard.                        |

---

## 6. Tester un contrat vs une implémentation

### 6.1 — Contrat — la promesse externe

> Tester un **contrat** : "étant donné cette entrée, le résultat est celui-ci".

Test stable au refactor : tant que l'API publique ne change pas, le test passe.

```python
def test_apply_discount_returns_80_for_premium_100():
    assert apply_discount(price=100, user_status="premium") == 80
```

### 6.2 — Implémentation — les rouages internes

> Tester l'**implémentation** : "cette méthode privée a appelé telle autre dans tel ordre".

Test fragile : tout refactor casse.

```python
def test_apply_discount_calls_strategy_lookup_then_apply():
    mock_strategy = Mock()
    apply_discount(price=100, user_status="premium", strategy=mock_strategy)
    mock_strategy.lookup.assert_called_once()
    mock_strategy.apply.assert_called_once()
```

### 6.3 — Quand tester quoi

| Test               | Quand                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Contrat**        | Logique métier, API publiques, fonctions pures. **80 % du temps**.                                                         |
| **Implémentation** | Side effects critiques (envoi mail, appel paiement). Quand le **comportement attendu** est précisément "appeler X avec Y". |

### 6.4 — Signal de problème

Si on doit **modifier 30 tests pour un refactor cosmétique** (renommage, extraction de méthode), c'est qu'on testait l'implémentation. Symptôme classique de mockist mal calibré (M2 6).

---

## 7. La matrice "à tester / à ne pas tester" (item N3 explicite)

### 7.1 — Les 3 axes

| Axe                    | Échelle                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Complexité du code** | 0 = trivial (1 ligne, pas de branche) → 5 = complexe (multi-branches, multi-règles). |
| **Volatilité**         | 0 = stable depuis 2 ans → 5 = change toutes les semaines.                            |
| **Criticité métier**   | 0 = sans impact si bug → 5 = impact immédiat sur revenue / users.                    |

### 7.2 — La matrice — décision

```text
                                Criticité métier
                          0 -------- 3 -------- 5
                  ┌──────┬──────────┬─────────────┐
   Complexité     │  ?   │  TEST    │  TEST DENSE │  5
                  │      │          │              │
   du code        ├──────┼──────────┼─────────────┤
                  │ NON  │  ?       │  TEST        │  3
                  │      │          │              │
                  ├──────┼──────────┼─────────────┤
                  │ NON  │  NON     │  ?           │  0
                  └──────┴──────────┴─────────────┘
```

La **volatilité** module la décision :

- Code **très volatile** dans une zone "TEST" → tests qui résistent au refactor (tester **contrats**).
- Code **stable** dans une zone "?" → mieux vaut tester (rentable sur la durée).

### 7.3 — Règles pratiques

| Profil                               | Décision                                           |
| ------------------------------------ | -------------------------------------------------- |
| Complexité élevée + criticité élevée | **Tests denses** + regression tests à chaque fix.  |
| Complexité élevée + criticité faible | Tests **focalisés** sur les branches.              |
| Complexité faible + criticité élevée | Tests **simples mais existants** (assurance).      |
| Complexité faible + criticité faible | **Pas de test** unitaire (peut-être un smoke E2E). |
| Volatilité haute + criticité haute   | Tests **de contrat** (résistent au refactor).      |
| Volatilité basse + complexité haute  | Tests **denses** une fois pour toutes.             |
| Volatilité haute + complexité basse  | Tests **light** ou aucun.                          |

### 7.4 — Exemple — annotation d'un projet

Pour un projet e-commerce :

| Module                   | Complexité | Volatilité | Criticité | Décision                                     |
| ------------------------ | ---------- | ---------- | --------- | -------------------------------------------- |
| `pricing.py`             | 4          | 3          | 5         | **Tests denses + property-based**.           |
| `models.py` (SQLAlchemy) | 1          | 2          | 3         | Tests d'intégration légers, pas d'unitaire.  |
| `email_templates.py`     | 1          | 5          | 1         | Pas de test unitaire ; snapshot occasionnel. |
| `auth.py`                | 3          | 2          | 5         | **Tests denses + integration**.              |
| `routes/users.py`        | 1          | 3          | 3         | TestClient FastAPI, pas d'unitaire.          |
| `discount_engine.py`     | 5          | 2          | 5         | **Tests très denses, property-based**.       |
| `migrations/` (Alembic)  | 1          | 3          | 4         | Smoke test (la migration applique).          |
| `admin_dashboard.py`     | 2          | 4          | 2         | Smoke + tests sur logique métier seulement.  |

---

## 8. Anti-patterns transverses

| Anti-pattern                                                  | Conséquence                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Coverage 100 % comme but absolu.                              | Pousse à tester ce qui n'apporte rien.                                |
| Tests **rituels** : "il faut tester chaque méthode publique". | Tests sans valeur sur les triviaux.                                   |
| Pas de **regression tests** pour les bugs déjà corrigés.      | Bugs qui reviennent.                                                  |
| Tester **getters/setters** par habitude.                      | Bruit dans la suite.                                                  |
| Tests d'**implémentation** au lieu de contrat.                | Refactor cosmétique casse 20 tests.                                   |
| Pas de **smoke E2E** sur les parcours critiques.              | Bug d'intégration passe.                                              |
| Pas de **revue** de pertinence à chaque sprint.               | Suite gonfle sans tri.                                                |
| Tester **ce qu'on n'arrive pas à mesurer** (UI, vibe).        | Tests fragiles. Préférer des E2E ciblés ou de l'observation manuelle. |

---

## 9. Construire la matrice de pertinence — méthode

### 9.1 — Pour un projet existant

#### Étape 1 — Lister les modules / packages

```bash
# Pour Python
find . -name "*.py" -not -path "./tests/*" | xargs -I{} dirname {} | sort -u
```

Garder le **niveau dossier** ou regrouper par feature. Pas besoin de 1 ligne par fichier.

#### Étape 2 — Évaluer les 3 axes

Pour chaque module, donner une note 0-5 sur :

- **Complexité** — combien de branches, de règles, de calculs.
- **Volatilité** — fréquence de changement sur les 6 derniers mois (`git log`).
- **Criticité** — impact d'un bug en prod (rien / inconfort / perte de données / perte de revenue).

```bash
# Pour estimer la volatilité d'un module
git log --since="6 months ago" --name-only --pretty=format: src/pricing/ | sort -u | wc -l
```

#### Étape 3 — Décider via la matrice

Pour chaque module, appliquer 7.3.

#### Étape 4 — Comparer à l'existant

Pour chaque module, regarder le **coverage actuel**. Identifier :

- Zones **sur-testées** par rapport à la décision (à élaguer).
- Zones **sous-testées** (à enrichir).

#### Étape 5 — Plan d'action

Pour chaque écart, lister :

- Tests à **supprimer** (sur-tests sur du trivial).
- Tests à **ajouter** (sous-tests sur du critique).
- Tests à **refactor** (testent l'implémentation → tester le contrat).

### 9.2 — Pour un projet neuf

Plus simple : appliquer la matrice **dès la conception** de chaque module.

Avant d'écrire la première ligne de code d'une feature, se demander : "ce module va contenir quoi en termes de complexité / criticité ? → niveau de test cible : 90 % ? 50 % ? 0 % ?"

### 9.3 — Cadence — revoir périodiquement

- À chaque **fin de sprint** : revoir 1-2 modules dont la matrice a changé (volatilité accrue, criticité montée).
- À chaque **bug en prod** : ajouter le regression test correspondant.
- À chaque **suite qui dépasse 5 min en CI** : auditer pour élaguer.

---

## 10. Exercices pratiques

### Exercice 1 — Auto-questionnaire de pertinence (≈ 20 min)

**Objectif.** Réflexe individuel.

Pour 5 tests existants dans son projet, se poser pour chacun :

1. Si je supprime ce test, **quel risque** ?
2. Combien de fois ce test a-t-il **changé** dans les 6 derniers mois ?
3. Le test décrit-il un **contrat** ou une **implémentation** ?
4. **Coût** estimé d'écriture + maintenance.
5. **Valeur** estimée (prévention de quel type de bug).

**Livrable.** 5 fiches courtes.

### Exercice 2 — Identifier les tests "rituels" (≈ 30 min)

**Objectif.** Repérer les tests à élaguer.

Sur sa suite, chercher :

- Tests de getters / setters triviaux.
- Tests de constantes.
- Tests de wrappers 1-ligne.
- Tests d'ORM raw.

Lister ceux qui pourraient être **supprimés sans perte**.

**Livrable.** Liste annotée.

### Exercice 3 — Tester contrat vs implémentation — refactor (≈ 45 min)

**Objectif.** Faire la distinction en pratique.

Sur son projet, choisir un test qui :

- Utilise des `mock.assert_called_with(...)` sur des appels internes au module.
- Casserait à un refactor cosmétique.

Le **réécrire en testant le contrat** (state verification, M2). Vérifier qu'il survit désormais à un refactor cosmétique.

**Livrable.** Diff avant / après + une phrase sur le bénéfice.

### Exercice 4 — Construire la matrice du projet (≈ 90 min)

**Objectif.** L'item N3 explicite.

Sur un projet réel :

1. Lister les **8-15 modules principaux**.
2. Noter chacun sur 0-5 pour **complexité, volatilité, criticité**.
3. Appliquer la matrice (section 7).
4. Comparer au **coverage actuel**.
5. Identifier les **3 priorités** d'amélioration.

**Livrable.** Tableau Excel / Markdown + 3 priorités.

### Exercice 5 — Regression test discipline (≈ 30 min)

**Objectif.** Adopter le réflexe.

Lister les **3 derniers bugs** corrigés dans son projet. Pour chacun :

- Y avait-il un test de régression ajouté ?
- Sinon, écrire le test maintenant (sur le code corrigé).
- Vérifier qu'il aurait détecté le bug.

**Livrable.** 3 tests de régression + nom explicite.

### Mini-défi — Argumenter une décision difficile (≈ 30 min, papier)

**Cas.** L'équipe décide qu'il faut "tester chaque méthode du repository". Le coverage actuel est de 78 %, l'objectif est 95 %. Le projet a 50 repositories triviaux.

Rédiger une **note de 1 page** qui :

- Reconnaît l'intention (vouloir plus de tests).
- Argumente pourquoi cette politique est **suboptimale** (coût/valeur).
- Propose une **alternative** : matrice, focus sur logique métier, etc.

**Livrable.** Note 1 page.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Énoncer les **3 coûts** d'un test (écriture, maintenance, exécution).
- [ ] Énoncer les **4 valeurs** d'un test (régression, design, doc, debug).
- [ ] Citer **5 zones de forte valeur** (logique métier, fonctions pures, regression, critique, longue vie).
- [ ] Citer **5 zones de faible valeur** (getters, wrappers, configs, prototypes, présentation).
- [ ] Distinguer **tester un contrat** vs **tester l'implémentation**.
- [ ] Énoncer la **matrice 3-axes** (complexité, volatilité, criticité).
- [ ] Décider pour un module donné selon la matrice.
- [ ] Citer **3 anti-patterns** de pertinence.
- [ ] Décrire le **flux** "regression test après chaque bug en prod".
- [ ] Justifier le **coverage non-100 %** comme cible saine.

### Items du glossaire visés

**N3 atteint** :

- _identifier les situations dans lesquelles des tests unitaires sont pertinents_ — sections 3, 4, 5, 7.

---

## 12. Ressources complémentaires

### Articles

- [Kent Beck — Test Desiderata](https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3) — les qualités d'un bon test.
- [DHH — TDD is dead. Long live testing.](https://dhh.dk/2014/tdd-is-dead-long-live-testing.html) — argument pour modérer le dogme TDD.
- [Kent Beck — Test Coverage](https://tidyfirst.substack.com/p/coverage) — la valeur n'est pas linéaire avec le coverage.
- [Martin Fowler — UnitTest](https://martinfowler.com/bliki/UnitTest.html) — définition et limites.

### Livres

- _Working Effectively with Legacy Code_ (Feathers) — décide quoi tester d'abord en legacy.
- _The Art of Unit Testing_ (Osherove) — chapitres sur la pertinence et la maintenance.
- _Effective Software Testing: A Developer's Guide_ (Aniche) — chapitre "Test what matters".

### Outils

- Pour analyser la volatilité : `git log --pretty=format: --name-only | sort | uniq -c | sort -rn`.
- Pour le coverage : `pytest --cov`, `coverage.py`.
- Pour la criticité : observabilité (logs, traces) — savoir quels modules sont les plus utilisés.

### Pour aller plus loin

- **M6 (Coverage)** — interpréter le coverage à la lumière de la pertinence.
- **M8 (Factorisation)** — réduire le coût des tests qu'on garde.
- **M9 (Golden Master)** — pour le code legacy où la pertinence est ambiguë.
