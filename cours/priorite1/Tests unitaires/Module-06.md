# M6 — Coverage

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer les **niveaux de coverage** : **line**, **branch**, **condition**, **path**, **MC/DC** (Modified Condition / Decision Coverage), et savoir lequel correspond à quel niveau d'exigence (CI standard vs avionique / médical).
- **Mesurer le coverage** d'une suite avec les outils de référence : `coverage.py` / `pytest-cov` (Python), `jest --coverage` ou `c8` (JS/TS), JaCoCo (Java), `go test -cover` (Go).
- **Lire et exploiter un rapport** : terminal `term-missing`, HTML interactif, fichier `coverage.xml` Cobertura / lcov pour la CI.
- **Analyser le coverage à la lumière de la pertinence** (item N3 explicite) : croiser **lignes manquantes × criticité du module** pour identifier les zones où le coverage doit s'améliorer en priorité.
- Construire un **plan d'amélioration de coverage** (item N3 explicite — la pratique) : matrice priorisée + estimations + critères de validation.
- Comprendre les **limites du coverage** (coverage ≠ qualité) et savoir où la **mutation testing** apporte un vrai signal complémentaire.
- Configurer le coverage en **CI** : seuil minimal, **delta coverage** sur les PR, exclusions, gate pertinent vs gate dogmatique.

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1-M5.
- Une suite de tests fonctionnelle dans un langage maîtrisé.
- `pytest-cov` ou `coverage.py` (Python) installable ; équivalents JS / Java optionnels.

---

## 1. Pourquoi un module dédié au coverage

### 1.1 — Le piège du chiffre unique

> Un coverage de **87 %** est un **chiffre** — sans contexte, il ne dit **rien** sur la qualité de la suite.

Trois cas extrêmes à 87 % qui n'ont rien à voir :

| Cas                                                                            | Qualité réelle                           |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| 87 % de lignes, mais les 13 % manquants sont **toute la logique de paiement**. | Catastrophique.                          |
| 87 % de lignes, les 13 % manquants sont du défensif jamais atteint.            | Excellent — gain marginal à monter plus. |
| 87 % de lignes, mais **les assertions sont triviales** (`assert True`).        | Faux coverage — la suite ne teste rien.  |

Le coverage est un **signal**, pas un objectif. Ce module enseigne à le **lire**, le **mesurer**, et à **agir** dessus à bon escient.

### 1.2 — L'analogie de la couverture d'assurance

Penser au coverage comme à une **assurance habitation** :

- Un contrat à **100 %** mais qui exclut "incendies, inondations, vols" = inutile.
- Un contrat à **70 %** mais qui couvre exactement vos risques principaux = excellent.
- Le **chiffre seul** n'est pas la prime. Ce sont les **clauses précises** qui importent.

Pour une suite de tests : **quelles lignes** sont couvertes (et avec **quelles assertions**) importe **plus** que le pourcentage.

### 1.3 — Anti-patterns récurrents

| Anti-pattern                                                     | Conséquence                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Coverage **100 %** comme cible absolue.                          | Pousse à écrire des tests sans valeur.                                                 |
| Coverage **non mesuré du tout**.                                 | Aucune visibilité sur les angles morts.                                                |
| **Line coverage seulement** sur du code à branches complexes.    | Toute une branche `else` non testée passe sous le radar.                               |
| Coverage **gate strict** (97 %) sans mesurer la **valeur**.      | Les devs écrivent des tests bidons pour atteindre le seuil.                            |
| **Pas de coverage en CI**.                                       | Régression progressive du coverage sur 6 mois sans alerte.                             |
| Comparer le coverage **absolu** au lieu du **delta** sur une PR. | Les PR sont rejetées parce que le coverage global est mauvais (pas la faute de la PR). |
| **Exclusions** non documentées (`# pragma: no cover`).           | Zones invisibles dans le rapport ; potentiel coverage menteur.                         |

---

## 2. Niveaux de coverage

### 2.1 — Tableau

| Niveau                        | Définition                                                                                                    | Strictesse                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Statement / Line coverage** | % de lignes (ou statements) exécutées au moins une fois.                                                      | Faible                         |
| **Branch coverage**           | % de branches (`if/else`, `?:`, boucles entrées/non entrées) parcourues.                                      | Moyenne                        |
| **Condition coverage**        | % de sous-expressions booléennes évaluées à **True ET à False**.                                              | Forte                          |
| **Path coverage**             | % de chemins distincts dans le graphe de contrôle de la fonction.                                             | Très forte (combinatoire)      |
| **MC/DC**                     | Pour chaque condition d'une décision composée, démontrer qu'elle peut **indépendamment** changer le résultat. | Très forte (avionique DO-178B) |

### 2.2 — Line coverage — exemple

```python
def discount(user, base):
    if user.is_premium:        # ligne 2
        result = base * 0.8    # ligne 3
    else:
        result = base          # ligne 5
    return result              # ligne 6
```

Test :

```python
def test_premium_gets_discount():
    assert discount(User(premium=True), 100) == 80
```

→ Lignes 2, 3, 6 exécutées. Lignes 4 et 5 non. **Line coverage = 4/6 = 67 %.**

### 2.3 — Branch coverage — exemple sur le même code

`if/else` = 2 branches. Le test ci-dessus couvre la branche `then` (ligne 3). La branche `else` (ligne 5) n'est pas couverte.

→ **Branch coverage = 1/2 = 50 %.**

### 2.4 — Condition coverage

```python
def can_access(user, doc):
    if user.is_admin or (user.dept == doc.dept and doc.public):
        return True
    return False
```

La condition est composée. Pour la couvrir **conditionnellement** :

- `is_admin = True` → couvre l'OR à True via `is_admin`.
- `is_admin = False, dept_match = True, public = True` → couvre l'OR à True via le 2ᵉ membre.
- `is_admin = False, dept_match = False` → couvre l'OR à False.
- `is_admin = False, dept_match = True, public = False` → couvre l'OR à False via le `and` à False.

Soit 4 tests minimum pour condition coverage. Avec branch coverage simple, 2 tests suffisent (True et False de l'OR global).

### 2.5 — MC/DC — pour les contextes critiques

**Modified Condition / Decision Coverage** : pour chaque condition booléenne dans une décision, démontrer qu'**elle a un effet** sur le résultat **indépendamment** des autres.

Standard DO-178B level A (avionique critique), IEC 62304 (médical), ISO 26262 (automobile fonctionnelle).

**En dev applicatif standard, MC/DC est rarement nécessaire**. Mention pour comprendre que la "complétude" du coverage est un spectre.

### 2.6 — Path coverage — la limite combinatoire

Une fonction avec **10 décisions binaires** indépendantes a **2^10 = 1024 chemins** possibles.

Path coverage à 100 % = exiger qu'on les teste tous → **impraticable** sur du code réel.

Quand on entend "coverage 100 %", il s'agit presque toujours de **line** ou **branch**, pas **path**.

### 2.7 — Quel niveau viser ?

| Contexte                                     | Niveau cible                          |
| -------------------------------------------- | ------------------------------------- |
| Application web standard (SaaS, e-commerce). | **Branch coverage 70-85 %**.          |
| Library / SDK utilisé par des tiers.         | **Branch 90 %+ + mutation testing**.  |
| Calcul financier, médical.                   | **Branch 95 %+ + condition / MC/DC**. |
| Code de POC / prototype.                     | 0 % (assumé).                         |
| Code de framework généré.                    | Non mesuré (excluding).               |

---

## 3. Mesurer le coverage — outils

### 3.1 — Python — `coverage.py` + `pytest-cov`

```bash
pip install pytest-cov
pytest --cov=myapp --cov-branch --cov-report=term-missing
```

Sortie typique :

```text
Name              Stmts   Miss Branch BrPart  Cover   Missing
-------------------------------------------------------------
myapp/cart.py        45      3     12      2    91%   17, 22-23
myapp/discount.py    18      0      4      0   100%
myapp/utils.py       30      8      0      0    73%   12-19
-------------------------------------------------------------
TOTAL                93     11     16      2    87%
```

| Colonne   | Signification                                                        |
| --------- | -------------------------------------------------------------------- |
| `Stmts`   | Lignes exécutables.                                                  |
| `Miss`    | Lignes non couvertes.                                                |
| `Branch`  | Nombre de branches dans le fichier.                                  |
| `BrPart`  | Branches **partiellement** couvertes (un sens couvert, l'autre non). |
| `Cover`   | % combiné (line + branch si `--cov-branch`).                         |
| `Missing` | Numéros des lignes / branches non couvertes.                         |

### 3.2 — Configuration via `pyproject.toml`

```toml
[tool.coverage.run]
branch = true
source = ["myapp"]
omit = [
  "myapp/migrations/*",
  "myapp/__main__.py",
]

[tool.coverage.report]
fail_under = 80
exclude_lines = [
  "pragma: no cover",
  "raise NotImplementedError",
  "if TYPE_CHECKING:",
  "if __name__ == .__main__.:",
]
show_missing = true
```

| Option          | Effet                                           |
| --------------- | ----------------------------------------------- |
| `branch`        | Active branch coverage.                         |
| `source`        | Limite la mesure aux modules métier.            |
| `omit`          | Exclut explicitement (migrations, entrypoints). |
| `fail_under`    | Plante si le total descend en dessous.          |
| `exclude_lines` | Marqueurs qui font ignorer une ligne.           |

### 3.3 — Rapports HTML

```bash
pytest --cov=myapp --cov-report=html
open htmlcov/index.html
```

Le rapport HTML est **interactif** : on clique sur un fichier, on voit ligne par ligne ce qui est exécuté (vert), non exécuté (rouge), partiellement (jaune branche).

C'est l'outil **#1 pour l'analyse fine** : on lit les zones rouges, on décide si ça mérite un test.

### 3.4 — JavaScript / TypeScript

```bash
# Avec Jest
jest --coverage

# Avec Vitest
vitest --coverage
```

Producteur : `c8` ou `istanbul` derrière la scène. Format de rapport similaire (lcov, HTML).

### 3.5 — Java

JaCoCo intégré au build (Maven, Gradle). Rapport HTML similaire avec instructions / branches / cyclomatic complexity.

### 3.6 — Go

```bash
go test -coverprofile=cover.out ./...
go tool cover -html=cover.out -o cover.html
```

### 3.7 — Multi-langage — Codecov, Coveralls, Sonar

Services SaaS qui collectent les rapports (Cobertura, lcov, JaCoCo XML) et affichent :

- **Trend** dans le temps.
- **Diff coverage** sur chaque PR.
- **Comments** sur le PR avec les lignes nouvellement non couvertes.

**Très utile** quand on veut empêcher la **régression de coverage** PR par PR.

---

## 4. Lire un rapport

### 4.1 — Le tableau terminal — première lecture

Quatre informations à scanner en priorité :

1. **Total** : ordre de grandeur — 70 % ? 90 % ?
2. **Fichiers à 100 %** : OK, on ne s'y arrête pas.
3. **Fichiers en dessous de 50 %** : à examiner d'urgence.
4. **`Missing` lignes** des fichiers critiques : qu'est-ce qui n'est pas couvert ?

### 4.2 — Lire les "Missing" — types d'omissions

Quatre cas typiques pour une ligne non couverte :

#### A — Branche d'erreur jamais atteinte

```python
def parse(data):
    if not data:
        raise ValueError("empty")    # ligne 3 — non testée
    return data.upper()
```

→ Ajouter `test_parse_empty_raises()`.

#### B — Logique de défensive jamais touchée

```python
def process(items):
    if items is None:                # ligne 2 — non testée
        return []                    # ligne 3 — non testée
    ...
```

Question : **est-ce que `items` peut vraiment être `None`** ? Si le contrat dit non, **supprimer le défensif**. Si oui, **ajouter le test**.

C'est un moment de design : le coverage révèle un **doute** sur le contrat.

#### C — Code mort

```python
def calc(x):
    if False:                        # ligne 2
        return 0                     # ligne 3 — jamais exécutée
    return x * 2
```

À **supprimer**.

#### D — Code rarement exécuté en test mais valide en prod

```python
def write_to_log(msg):
    if sys.platform == "win32":      # ligne 2
        ...                          # ligne 3 — non testée sur Linux CI
```

→ Soit ajouter un mock du platform, soit accepter et marquer `# pragma: no cover`.

### 4.3 — Lire le HTML — l'analyse fine

Pour chaque fichier suspect :

1. Ouvrir le rapport HTML.
2. Identifier les blocs **rouges** (non couverts).
3. Pour chaque bloc, classer en A, B, C, D (section 4.2).
4. Pour les jaunes (branches partielles), regarder **dans quel sens** la condition est testée.

### 4.4 — Branch coverage manquante — pièges

Un test qui couvre seulement le `if True` peut afficher **100 % line** mais **50 % branch**.

```python
def f(x):
    if x > 0:
        return "positive"
    return "non-positive"
```

```python
def test_positive():
    assert f(5) == "positive"
```

- **Line coverage** : 3/3 = 100 % (la ligne 4 `return "non-positive"` est l'extrémité non exécutée — souvent comptée comme partielle selon l'outil).
- **Branch coverage** : la branche `if False` n'est pas testée → 50 %.

C'est pourquoi **`--cov-branch` est crucial**. Sans, des trous évidents passent inaperçus.

---

## 5. Analyser le coverage à la lumière de la pertinence (item N3 explicite)

### 5.1 — La matrice "coverage × criticité"

Reprendre la matrice de M5 (complexité, volatilité, criticité). Y croiser le **coverage actuel** :

| Module               | Criticité (M5) | Coverage actuel | Décision                                          |
| -------------------- | -------------- | --------------- | ------------------------------------------------- |
| `pricing.py`         | 5              | 72 %            | **Action P0** : monter à 90 %+ (forte criticité). |
| `models.py` (ORM)    | 3              | 100 %           | **Trop** ? Vérifier que les tests apportent.      |
| `email_templates.py` | 1              | 30 %            | OK, criticité faible.                             |
| `auth.py`            | 5              | 95 %            | OK.                                               |
| `discount_engine.py` | 5              | 65 %            | **Action P0** : critique et sous-testé.           |
| `migrations/`        | 4              | 5 %             | Smoke test + audit migration.                     |
| `admin_dashboard.py` | 2              | 80 %            | Acceptable.                                       |

**Priorité d'amélioration** = `(criticité × 2 + complexité) × (1 - coverage)` — heuristique simple pour trier.

### 5.2 — Heatmap visuelle

Construire un graphique 2D :

```text
              Criticité métier
   ^
   │     ┌─────────┬─────────┬──── ROUGE
   │     │   bb    │   AA    │  Priority 0
   │     ├─────────┼─────────┼────
   │     │   bb    │   AA    │  bb = on a déjà bien couvert
   │     │         │         │  AA = priorité d'action
   │     ├─────────┼─────────┼──── ORANGE
   │     │   --    │   bb    │  Priority 1
   │     │         │         │
   │     └─────────┴─────────┴────
   │     0 %                  100 %
   └─────────────────────────────►  Coverage
```

Visuellement, on identifie en haut-gauche les modules **critiques peu testés** → priorité maximale.

### 5.3 — Identifier les zones à améliorer

Trois axes :

1. **Branches non couvertes** dans les modules critiques.
2. **Tests qui re-décrivent** sans tester (assertions triviales) — coverage menteur.
3. **Edge cases manquants** (M1) sur des fonctions critiques.

### 5.4 — Méthode — quick win discovery

1. Ouvrir le HTML coverage.
2. Trier par fichier de plus petit coverage.
3. Filtrer ceux qui sont **dans le périmètre critique**.
4. Pour les 3 premiers : pour chaque ligne rouge, écrire un test.
5. **Re-mesurer** : combien on a gagné ? Si on est passé de 60 à 80 % en 1 h, excellent ROI.

---

## 6. Mutation testing — le coverage du coverage

### 6.1 — Le principe

> Le **mutation testing** vérifie que les **tests détectent** des modifications **insidieuses** du code. Sans cette détection, le test n'apporte rien — il "couvre" sans "tester".

Mécanisme :

1. L'outil **mute** le code (par exemple change `+` en `-`, `>=` en `>`, `True` en `False`).
2. Pour chaque mutation, **lance les tests**.
3. **Test passe** → mutant **survivant** = le test ne détecte pas le changement → tests faibles.
4. **Test échoue** → mutant **tué** = bon signe.

Le **mutation score** = % de mutants tués. 80-90 % est excellent.

### 6.2 — Outils

| Langage     | Outil                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **Python**  | [`mutmut`](https://mutmut.readthedocs.io/), [`cosmic-ray`](https://cosmic-ray.readthedocs.io/). |
| **JS / TS** | [Stryker](https://stryker-mutator.io/).                                                         |
| **Java**    | [PIT](https://pitest.org/).                                                                     |
| **Go**      | [`go-mutesting`](https://github.com/zimmski/go-mutesting).                                      |
| **.NET**    | Stryker.NET.                                                                                    |

### 6.3 — Exemple — `mutmut` Python

```bash
pip install mutmut
mutmut run --paths-to-mutate=myapp/
```

Sortie type :

```text
- Mutation testing starting -

⢿ Survived: 12  Killed: 88  Suspicious: 0  Skipped: 5  Total: 105

mutmut results :
  total survived: 12 (11.4 %)
  total killed:  88 (83.8 %)
```

Lister les survivants :

```bash
mutmut results
mutmut show 7   # voir le code muté n°7 qui a survécu
```

Inspecter et **améliorer le test** si la mutation est significative.

### 6.4 — Quand l'utiliser

- **Pas en CI standard** : trop lent (mutation = re-runs ×N).
- **Audit périodique** sur le code **critique** (pricing, auth) — par exemple chaque trimestre.
- **Pour estimer la vraie qualité** d'une suite à coverage élevé.

### 6.5 — Mutation vs coverage

| Aspect            | Coverage          | Mutation testing         |
| ----------------- | ----------------- | ------------------------ |
| Vitesse           | Rapide (CI).      | Lent (audit périodique). |
| Signal            | "Code exécuté ?"  | "Tests qui détectent ?"  |
| Cible             | 80-90 % standard. | 70-85 % bon.             |
| Coût opérationnel | Faible.           | Élevé.                   |
| Adéquation CI     | Oui.              | Non, en script séparé.   |

---

## 7. Coverage en CI — gating intelligent

### 7.1 — Le gate "absolute" — souvent mauvais

```yaml
# .github/workflows/test.yml
- run: pytest --cov --cov-fail-under=85
```

Le PR plante si **le total descend** sous 85 %. Problème :

- Le coverage **absolu** dépend de tout le projet, pas de la PR.
- Une PR qui touche du code à faible coverage **non lié** peut être bloquée.
- Encourage à **ne pas toucher** au code "fragile".

### 7.2 — Le gate "delta" — recommandé

Avec [**Codecov**](https://about.codecov.io/) ou [**Coveralls**](https://coveralls.io/) :

```yaml
# codecov.yml
coverage:
  status:
    project:
      default:
        target: auto # ne plante pas si on baisse globalement
        threshold: 1% # tolère -1 % global (réorg)
    patch:
      default:
        target: 80% # le code AJOUTÉ par la PR doit être à 80 %+
```

Lecture :

- **`project`** : tolère une légère baisse globale (refactor qui sort du code testé).
- **`patch`** : exige que **les lignes nouvellement écrites** soient couvertes à 80 %.

C'est le **gate qui marche** : on n'empire pas, et chaque nouveau code est tenu à un standard.

### 7.3 — Comment intégrer

GitHub Actions :

```yaml
- name: Run tests
  run: pytest --cov=myapp --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage.xml
```

Codecov commente automatiquement sur la PR :

```text
Coverage diff for this PR : +0.34 %
Files changed coverage : 91 % (target: 80 %)  ✅
```

### 7.4 — Exclusions sensées

Toutes les zones suivantes peuvent légitimement être exclues :

- **`if TYPE_CHECKING:`** — code de typage non exécuté à l'exécution.
- **`__main__`** — entrypoint de script.
- **`# pragma: no cover`** sur du **défensif inatteignable** (avec commentaire justifiant).
- Migrations Alembic / Django (testées séparément par smoke).
- Code généré (Protobuf, OpenAPI clients).

À l'inverse, **jamais exclure** :

- Du code métier "compliqué à tester" — c'est précisément là qu'il faut investir.
- Des branches d'erreur de prod.

---

## 8. Anti-patterns transverses

| Anti-pattern                                       | Conséquence                                     |
| -------------------------------------------------- | ----------------------------------------------- |
| Cible 100 % comme dogme.                           | Tests bidons, frustration.                      |
| Pas de **branch coverage** activé.                 | Branches `else` non testées passent inaperçues. |
| **Gate absolu** en CI sans delta.                  | PRs rejetées injustement.                       |
| `# pragma: no cover` non justifié.                 | Coverage menteur, audit perdu.                  |
| Pas d'**exclusions** des migrations / boilerplate. | Coverage écrasé par du code peu pertinent.      |
| Lire **uniquement le pourcentage**.                | On rate les zones critiques sous-testées.       |
| Pas de **mutation testing** sur le critique.       | Vrai signal de qualité manquant.                |
| Coverage **mesuré localement** mais pas en CI.     | Régression silencieuse au fil des PR.           |

---

## 9. Construire un plan d'amélioration — méthode

### 9.1 — Étapes

1. **Mesurer le coverage actuel** : line, branch.
2. **Identifier les modules critiques** (avec la matrice M5).
3. **Croiser** : matrice (criticité × coverage actuel).
4. **Lister les zones P0** : criticité 4-5 ET coverage < 80 %.
5. **Pour chaque zone P0** : ouvrir le rapport HTML, identifier les lignes / branches manquantes, écrire les tests qui ciblent.
6. **Re-mesurer** après chaque session.
7. **Documenter** dans un fichier `COVERAGE_PLAN.md`.

### 9.2 — Format de plan

```markdown
# Plan d'amélioration coverage — projet X — date

## État initial : 73 % line / 61 % branch (cible : 85 / 75)

## Priorités P0 (sprint 1)

- `pricing.py` : 65 → 90 % — 12 tests à écrire (4 h estimées).
- `discount_engine.py` : 60 → 85 % — 8 tests (3 h).

## Priorités P1 (sprint 2)

- `auth.py` : 88 → 95 % — 4 tests + 2 edge cases (2 h).
- `payment_gateway.py` : 70 → 85 % — 6 tests d'erreur (3 h).

## P2 (continu)

- Améliorer branch coverage sur les modules à 80-90 % en line.

## Hors scope

- `migrations/` : exclu (smoke test séparé).
- `vendor/` : exclu.

## Suivi

- Coverage tracké en CI via Codecov.
- Gate : patch ≥ 80 %, project tolerance -1 %.
```

### 9.3 — Cadence

| Cadence          | Action                                                  |
| ---------------- | ------------------------------------------------------- |
| Chaque PR        | Coverage diff via Codecov.                              |
| Chaque sprint    | Petite session "uncovered lines" sur 1-2 modules P0/P1. |
| Chaque trimestre | Mutation testing sur le code critique.                  |
| Chaque release   | Snapshot du coverage global pour suivi tendance.        |

---

## 10. Exercices pratiques

### Exercice 1 — Premier audit de coverage (≈ 30 min)

**Objectif.** Maîtriser les outils.

**Étapes :**

1. Sur son projet, installer `pytest-cov`.
2. Lancer `pytest --cov=myapp --cov-branch --cov-report=term-missing`.
3. Noter : line coverage, branch coverage, top 3 fichiers à faible coverage.
4. Générer le rapport HTML, l'ouvrir.

**Livrable.** Capture du tableau + 3 fichiers identifiés.

### Exercice 2 — Classer les lignes non couvertes (≈ 45 min)

**Objectif.** Section 4.2.

Sur le rapport HTML, choisir **1 fichier** à coverage < 80 %. Pour chaque ligne / bloc rouge, classer :

- **A** — branche d'erreur jamais testée.
- **B** — défensif jamais atteint.
- **C** — code mort.
- **D** — branche conditionnelle au contexte.

Décider pour chacune : **écrire un test**, **supprimer le code**, ou **marquer `# pragma: no cover`**.

**Livrable.** Tableau ligne → catégorie → action.

### Exercice 3 — Activer branch coverage et comparer (≈ 30 min)

**Objectif.** Voir l'effet `--cov-branch`.

**Étapes :**

1. Mesurer line coverage seul.
2. Mesurer avec `--cov-branch`.
3. Identifier les fichiers où le **branch coverage est notablement plus bas** que le line.
4. Pour le pire d'entre eux, ouvrir le HTML et identifier la branche `else` manquante.

**Livrable.** Diff line vs branch + 1 branche manquante identifiée.

### Exercice 4 — Coverage en CI avec Codecov (≈ 45 min)

**Objectif.** Gating intelligent.

**Étapes :**

1. Créer un compte Codecov / Coveralls (gratuit pour OSS).
2. Brancher sur le repo.
3. Ajouter le workflow GitHub Actions (section 7.3).
4. Configurer `codecov.yml` avec target `auto` et patch 80 %.
5. Ouvrir une PR de test, vérifier le commentaire automatique.

**Livrable.** Capture du commentaire Codecov sur la PR.

### Exercice 5 — Mutation testing — première session (≈ 60 min)

**Objectif.** Mesurer la qualité au-delà du coverage.

**Étapes :**

1. Installer `mutmut` (ou équivalent dans le langage).
2. Choisir un module **critique** à coverage élevé (90 %+).
3. Lancer la mutation. Noter le **mutation score**.
4. Inspecter 3 survivants. Améliorer 1 test pour tuer un mutant.
5. Re-lancer sur le module et vérifier l'amélioration.

**Livrable.** Mutation score avant/après + 1 test amélioré.

### Mini-défi — Plan d'amélioration complet (≈ 90 min)

**Objectif.** L'item N3 explicite.

Sur un projet réel :

1. Suivre la méthode de la section 9.
2. Produire le fichier `COVERAGE_PLAN.md` (section 9.2).
3. Identifier 2-3 priorités P0 et estimer le coût.

**Livrable.** `COVERAGE_PLAN.md` + 3-5 priorités chiffrées.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **5 niveaux** de coverage (statement, branch, condition, path, MC/DC).
- [ ] Donner un exemple où **line coverage 100 %** mais **branch coverage 50 %**.
- [ ] Mesurer le coverage en Python (`pytest-cov`).
- [ ] Lire un rapport `term-missing` et identifier les fichiers prioritaires.
- [ ] Utiliser le **rapport HTML** pour l'analyse fine.
- [ ] Classer une ligne non couverte en **A / B / C / D**.
- [ ] **Croiser coverage et criticité** pour prioriser.
- [ ] Construire un **plan d'amélioration** par modules.
- [ ] Configurer **Codecov / Coveralls** avec gates `auto` + patch.
- [ ] Distinguer **gate absolu** et **gate delta**.
- [ ] Citer les **exclusions légitimes** (`pragma: no cover`, migrations, generated).
- [ ] Définir le **mutation testing** et son apport vs coverage.

### Items du glossaire visés

**N3 atteint** :

- _analyser lorsque le test coverage doit être amélioré_ — sections 4, 5, 9.

**Préparation N3+** :

- Mutation testing (section 6) : outil avancé.

---

## 12. Ressources complémentaires

### Documentation

- [coverage.py docs](https://coverage.readthedocs.io/) — la référence Python.
- [pytest-cov](https://pytest-cov.readthedocs.io/) — wrapper pytest.
- [Codecov docs](https://docs.codecov.com/).
- [Coveralls docs](https://docs.coveralls.io/).
- [JaCoCo docs](https://www.jacoco.org/jacoco/trunk/doc/) — Java.

### Articles

- [Martin Fowler — Test Coverage](https://martinfowler.com/bliki/TestCoverage.html) — la position classique sur "ne pas viser 100 %".
- [Robert Martin — Coverage](http://blog.cleancoder.com/uncle-bob/2017/05/05/TestDefinitions.html).
- [Brett Slatkin — Why coverage isn't enough](https://medium.com/google/test-coverage-isnt-everything-7e7d3a37ab5d).

### Mutation testing

- [Stryker Mutator](https://stryker-mutator.io/) — JS, .NET, Scala.
- [mutmut](https://mutmut.readthedocs.io/) — Python.
- [PIT](https://pitest.org/) — Java.
- _Mutation Testing for the New Century_ (Offutt et al.) — papier de référence.

### Pour aller plus loin

- **M7 (TDD)** — Red-Green inclut implicitement le coverage du happy path.
- **M8 (Factorisation)** — tests paramétrés augmentent coverage à coût constant.
- **M9 (Golden Master)** — coverage en legacy avant TDD.
