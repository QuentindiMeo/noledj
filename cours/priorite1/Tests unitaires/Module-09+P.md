# M9 — Golden Master Testing + mini-projet du parcours

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir le **Golden Master Testing** (item N3 explicite) : technique pour **capturer la sortie** d'un système non testé sur un ensemble d'entrées, puis **verrouiller** cette sortie comme référence pour sécuriser un refactor.
- Reconnaître les **cas où le Golden Master est le bon outil** : code legacy sans tests, transformations déterministes (formatters, parsers, calculs), refactor d'un module qui ne peut pas être testé "unité par unité" facilement.
- Conduire les **5 étapes** d'une mise en place Golden Master : identifier l'interface, générer des entrées représentatives, capturer la baseline, verrouiller en test, refactor en confiance.
- Utiliser les **outils** adaptés : [Approval Tests](https://approvaltests.com/), snapshot testing (`syrupy`, `jest --snapshot`), ou capture manuelle.
- Gérer les **cas particuliers** : sorties non déterministes (timestamps, UUIDs), gros volumes, formats binaires.
- Conduire le **mini-projet du parcours** : **refactor TDD d'un module avec stratégie de Golden Master sur la sortie existante** — combiner les techniques de M7 (TDD) et M9 pour reprendre un code hérité.

## Durée estimée

1 jour (hors mini-projet) — **mini-projet 3 à 5 jours**.

## Pré-requis

- M1 à M8.
- Un module **legacy** non testé à refactorer (perso, professionnel, ou exemple fourni).
- `pytest` + `pytest-snapshot` ou `syrupy` (ou framework équivalent).
- `git` pour suivre le refactor.

---

## 1. Pourquoi le Golden Master existe

### 1.1 — Le dilemme du legacy

> Un module legacy de 800 lignes, 0 test, à refactorer. Si on commence par "écrire des tests unitaires", on **se retrouve coincé** : le code n'est pas testable (couplages, dépendances cachées, side effects), et on ne sait même pas exactement **ce qu'il fait** dans tous les cas.

Le Golden Master **inverse l'ordre** :

1. On **capture le comportement actuel** (l'output sur N entrées variées).
2. On **fige** cette capture comme **référence**.
3. On **refactore** en vérifiant à chaque pas que la sortie ne change pas.
4. Une fois le module **bien découpé**, on peut écrire des tests **unitaires classiques**.

### 1.2 — L'analogie de la photo avant rénovation

Avant de rénover une maison, on **prend des photos** de chaque pièce dans son état initial. Pendant les travaux, on peut comparer : "le mur porteur est-il toujours à la même place ?". Si on n'a pas pris la photo, on ne sait plus ce qui était là avant.

Le Golden Master = la **photo** de la sortie du système. Plus précisément : la photo de **N sorties** pour N entrées choisies.

### 1.3 — Différence avec un test unitaire classique

| Aspect                 | Test unitaire classique                     | Golden Master                                                    |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Connaissance préalable | "Je sais ce que le code **devrait** faire." | "Je sais ce que le code **fait** actuellement."                  |
| Granularité            | Unité (fonction, classe).                   | Système entier ou module entier.                                 |
| Assertion              | Précise : `assert result == 80`.            | Comparaison de **gros block de sortie** vs fichier de référence. |
| Ce qu'on vérifie       | Une spécification.                          | La non-régression vs un comportement observé.                    |
| Cycle de vie           | Stable. Test écrit une fois, dure.          | **Temporaire**. Souvent jeté après refactor.                     |

### 1.4 — Origine et culture

- Concept formalisé par **Michael Feathers** dans _Working Effectively with Legacy Code_ (2004).
- "Golden Master" vient des CDs : la première copie maître à partir de laquelle on duplique.
- Évolution moderne : **Approval Tests** (Llewellyn Falco, Emily Bache) — outils dédiés qui simplifient le pattern.

### 1.5 — Anti-patterns à connaître d'emblée

| Anti-pattern                                                            | Conséquence                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Capturer la sortie buggée** comme référence.                          | On fige les bugs ; refactor préserve les bugs.                    |
| Sorties **non déterministes** non normalisées (timestamp, UUID, ordre). | Tests qui flake à chaque run.                                     |
| Verrouiller un Golden Master **temporaire** comme test permanent.       | On accumule des tests illisibles ; on perd l'intention.           |
| Pas d'**inputs représentatifs** (seulement happy path).                 | Couverture insuffisante, refactor casse des branches non testées. |
| Trop d'inputs (10 000 cas).                                             | Test runner lent, diff de sortie illisible.                       |
| Ne pas **dégager** vers du TDD ensuite.                                 | Reste avec une suite "boîte noire" ; sans bénéfice design.        |

---

## 2. Définition et mécanique

### 2.1 — Définition formelle

> **Golden Master Testing** : enregistrer la sortie d'un système pour un ensemble fixé d'entrées (la **baseline**), puis automatiser la comparaison de la sortie courante avec la baseline à chaque modification du code.

Tout changement qui produit une sortie différente **fait échouer** le test, ce qui force à examiner :

- Soit le changement est **involontaire** → bug, on corrige.
- Soit le changement est **intentionnel** → on met à jour la baseline.

### 2.2 — Quand on peut l'utiliser

Trois conditions :

1. La **fonction** ou le **module** est **déterministe** (mêmes entrées → mêmes sorties) ou peut être rendu déterministe (mocks pour le temps, l'aléa).
2. La sortie est **observable** (string, JSON, fichier, structure de données comparable).
3. On peut générer un **ensemble représentatif** d'entrées.

Exemples typiques :

- **Parser** : on capture les AST produits pour N programmes-exemples.
- **Formatter** : on capture les chaînes de sortie pour N entrées.
- **Calculateur** : on capture les résultats pour N combinaisons.
- **Rendering HTML** : on capture le HTML pour N states.
- **Export CSV / JSON** : on capture le contenu pour N datasets.

Exemples où **ça ne marche pas bien** :

- Systèmes à **état persistant** (DB qui mute, sessions).
- **Side effects** complexes (envoi de mail, paiements).
- Sortie **non comparable** (vidéo, bruit).
- Sortie **dépendant du contexte** (heure, machine, locale) sans pouvoir la fixer.

### 2.3 — Mécanique pas-à-pas

```text
   Étape 1. Choisir un ensemble I = {e1, e2, ..., eN} d'entrées représentatives.

   Étape 2. Lancer le système actuel sur I → obtenir O = {o1, o2, ..., oN}.

   Étape 3. Sauvegarder O comme baseline (fichier de référence).

   Étape 4. Écrire un test qui :
              - Lance le système sur I.
              - Compare avec la baseline.
              - Échoue si différent.

   Étape 5. Refactorer le système.
            Le test garantit que la sortie reste identique
            (ou met en évidence les changements).

   Étape 6. Une fois le refactor terminé, écrire des tests unitaires classiques
            sur le code refactoré. Souvent on peut alors jeter le Golden Master.
```

---

## 3. La technique en pratique

### 3.1 — Étape 1 — identifier l'interface

Pour le module legacy, identifier la **fonction "frontale"** qu'on va tester. Plus elle est **gros grain**, mieux c'est :

- Mauvais : tester chaque fonction privée — pas accessible facilement.
- Bon : tester la **fonction publique** qui orchestre tout.
- Encore mieux : tester le **module entier** via un point d'entrée unique.

Exemple : un module `invoice_renderer.py` avec 30 fonctions. Le bon point d'entrée pour Golden Master : la fonction `render_invoice(invoice_dict) -> str` qui retourne le HTML complet.

### 3.2 — Étape 2 — générer des entrées représentatives

Trois sources :

| Source               | Avantage                                                            |
| -------------------- | ------------------------------------------------------------------- |
| **Cas réels** (prod) | Représentatifs de l'usage. Couvre les cas que les users provoquent. |
| **Cas manuels**      | Permet de cibler les edge cases connus.                             |
| **Cas aléatoires**   | Couvre des combinaisons inattendues.                                |

Une bonne baseline contient typiquement **20-100 cas** : assez pour couvrir le domaine, pas tant qu'on ne puisse plus lire les diffs.

### 3.3 — Étape 3 — capturer la baseline

```python
# Première exécution — capture
import json
from pathlib import Path

inputs = load_test_inputs()    # liste de dict
outputs = []

for input_dict in inputs:
    output = render_invoice(input_dict)   # le module legacy actuel
    outputs.append({"input": input_dict, "output": output})

Path("golden_master.json").write_text(json.dumps(outputs, indent=2, sort_keys=True))
```

Le fichier `golden_master.json` est **commité** dans le repo : c'est la photo.

### 3.4 — Étape 4 — verrouiller en test

```python
# tests/test_golden_master.py
import json
from pathlib import Path
from invoice import render_invoice

GOLDEN_PATH = Path(__file__).parent / "golden_master.json"

def test_golden_master_invoice_render():
    golden = json.loads(GOLDEN_PATH.read_text())

    for case in golden:
        actual = render_invoice(case["input"])
        assert actual == case["output"], (
            f"Output differs for input: {case['input']}"
        )
```

Le test passe quand toutes les sorties correspondent. Pour 50 cas, c'est rapide.

### 3.5 — Étape 5 — refactorer

Avec ce filet de sécurité, on peut **maintenant** :

- Extraire des fonctions.
- Renommer.
- Restructurer.
- Supprimer du code mort.

À chaque refactor : `pytest`. Si vert, on continue ; si rouge, on revert ou on examine la divergence.

### 3.6 — Étape 6 — TDD prend le relais

Une fois le module **suffisamment découpé**, écrire des **tests unitaires classiques** sur les nouvelles fonctions extraites :

```python
def test_format_amount_with_currency():
    assert format_amount(100, "EUR") == "100,00 €"

def test_compute_tax_for_fr():
    assert compute_tax(100, country="FR") == 20.0
```

**On peut alors souvent supprimer** le Golden Master : il a rempli sa fonction (sécuriser le refactor), et les tests unitaires offrent une **meilleure** documentation pour la suite.

Le Golden Master est **un échafaudage**, pas un édifice.

---

## 4. Outils

### 4.1 — Approval Tests — l'outil dédié

[Approval Tests](https://approvaltests.com/) (Python, Java, JS, .NET, Ruby, etc.) automatise le pattern :

```python
from approvaltests import verify

def test_render_invoice():
    output = render_invoice(sample_invoice())
    verify(output)
```

À la **première exécution**, `verify` crée un fichier `test_render_invoice.received.txt`. On le **renomme** en `.approved.txt` (ou un outil de "merge" propose un diff).

Aux exécutions suivantes, `verify` compare avec `.approved.txt`. Tout diff fait échouer le test.

**Avantages** :

- Workflow rodé (diff visuel, accept/reject).
- Support de multiples formats (texte, JSON, XML, images).
- Outils intégrés à l'IDE.

### 4.2 — Snapshot testing — variante moderne

Les framework de test modernes (Jest, Vitest, syrupy pour pytest) proposent un **snapshot testing** intégré :

```python
# pytest avec syrupy
def test_render_invoice(snapshot):
    output = render_invoice(sample_invoice())
    assert output == snapshot
```

À la première exécution, le snapshot est créé dans un fichier dédié (par exemple `__snapshots__/test_invoice.ambr`). Aux suivantes, comparaison automatique.

Très répandu côté front (UI components → snapshot du HTML / JSON).

### 4.3 — Capture manuelle

Si on ne veut pas de dépendance, on fait à la main :

```python
GOLDEN = Path(__file__).parent / "fixtures" / "golden_invoice.txt"

def test_golden_invoice():
    actual = render_invoice(sample_invoice())
    if not GOLDEN.exists():
        GOLDEN.write_text(actual)
        pytest.skip("Golden created, re-run to verify")
    expected = GOLDEN.read_text()
    assert actual == expected
```

Simple, sans lib externe. Suffisant pour des projets compacts.

### 4.4 — Choisir

| Situation                                               | Outil                                 |
| ------------------------------------------------------- | ------------------------------------- |
| Projet Python sans contraintes.                         | **syrupy** ou **approvaltests**.      |
| Projet JS / TS (UI).                                    | **Jest / Vitest snapshot**.           |
| Projet Java enterprise.                                 | **ApprovalTests.Java**.               |
| Petit script, dépendances minimales.                    | Capture manuelle.                     |
| Comparaison **fine de JSON** (ignorer certains champs). | **jsondiff** + approvaltests options. |

---

## 5. Cas particuliers — sorties non déterministes

### 5.1 — Timestamps

```text
Generated at: 2026-05-18T14:32:01Z
```

Chaque run, le timestamp change → le test flake.

**Remèdes** :

- **Geler le temps** avec `freezegun` (cf. M4).
- **Masker** dans la sortie avant comparaison : remplacer le timestamp par `<TIMESTAMP>` via regex.

```python
import re

def normalize_output(s):
    s = re.sub(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", "<TIMESTAMP>", s)
    return s

def test_golden():
    actual = normalize_output(render_invoice(invoice))
    expected = normalize_output(GOLDEN.read_text())
    assert actual == expected
```

### 5.2 — UUIDs

```text
Invoice ID: 7f3c9e5a-1b2d-4f6a-8c0e-9d8b1a2e3f4c
```

**Remèdes** :

- Injecter une **fonction de génération de UUID** mockée : `make_uuid = lambda: UUID("...")`.
- Masker : `re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-...", "<UUID>", output)`.

### 5.3 — Ordre non déterministe

Une sortie qui itère sur un `set` peut avoir un ordre différent à chaque run.

**Remèdes** :

- **Trier** la sortie avant comparaison.
- **Forcer un ordre** dans le code (souvent meilleure idée).

### 5.4 — Gros volumes

Une sortie de 50 MB ne se diffe pas à la main.

**Remèdes** :

- **Hasher** le contenu : `assert hash(output) == "abc123..."`. Inconvénient : sans diff lisible en cas d'échec.
- **Découper** en plusieurs Golden Masters par section.
- **Sampling** : ne capturer que des positions clés (début, milieu, fin).

### 5.5 — Sortie binaire

Image, PDF, fichier compressé.

**Remèdes** :

- **Comparaison structurelle** (PIL pour images, lib PDF) au lieu de bytes-à-bytes.
- **Tolérance** : permettre 1-2 % de pixels différents pour des images générées.
- Pour des PDFs : extraire le texte et comparer.

### 5.6 — Tableau récapitulatif

| Source de non-déterminisme          | Remède                               |
| ----------------------------------- | ------------------------------------ |
| Timestamp                           | `freezegun`, ou regex normalize.     |
| UUID                                | Injection, ou regex normalize.       |
| Aléatoire                           | Seed fixe.                           |
| Ordre (set, dict en < 3.7)          | Tri ou ordre forcé.                  |
| Memory address (`<Object 0x7f...>`) | `__repr__` custom, regex normalize.  |
| Gros volume                         | Hash, chunking, sampling.            |
| Format binaire                      | Comparaison structurelle, tolérance. |

---

## 6. Évolution — du Golden Master au TDD

### 6.1 — Phase 1 — caractérisation

Le **Golden Master initial** est un test de **caractérisation** : il décrit "ce que le code fait", pas "ce qu'il devrait faire".

Il est délibérément :

- Tolérant aux bugs présents (on les fige).
- Insensible à l'intention métier.
- Permet de **refactorer sans casser**.

### 6.2 — Phase 2 — découpage

Avec le filet en place, on peut :

- **Extraire** des fonctions.
- **Renommer** pour clarifier.
- **Séparer** les responsabilités.

À chaque petit refactor → vérifier le Golden Master.

### 6.3 — Phase 3 — tests unitaires sur les fragments

Une fois le code découpé en **petites unités testables**, écrire des **tests unitaires classiques** sur chaque :

```python
def test_compute_tax_for_fr():
    assert compute_tax(100, "FR") == 20

def test_compute_tax_for_de():
    assert compute_tax(100, "DE") == 19

def test_format_amount():
    assert format_amount(100, "EUR") == "100,00 €"
```

### 6.4 — Phase 4 — corriger les bugs

À ce stade, les tests unitaires peuvent **diverger** du Golden Master :

- Si le test unitaire **révèle un bug** (le code calcule 20 % de taxe mais en France c'est 20 %, OK) — le Golden Master était correct.
- Si le test unitaire **révèle une intention différente** (le code calcule 19 % mais la spec dit 20 %) — le Golden Master figeait un bug. Corriger le code, **invalider** la baseline.

### 6.5 — Phase 5 — supprimer le Golden Master

Une fois la suite unitaire **dense et fidèle**, le Golden Master devient redondant. On peut le **supprimer** (ou le garder comme test E2E haute couverture).

C'est exactement comme **enlever l'échafaudage** une fois la maison construite.

### 6.6 — Tableau du processus complet

| Phase                     | État du module             | Tests présents                           |
| ------------------------- | -------------------------- | ---------------------------------------- |
| 1. Avant Golden Master    | Legacy, 0 test.            | 0.                                       |
| 2. Golden Master en place | Inchangé.                  | 1 GM.                                    |
| 3. Refactor               | Découpé en petites unités. | GM + quelques tests unitaires.           |
| 4. Tests unitaires denses | Modulaire, testable.       | GM + tests unitaires nombreux.           |
| 5. Cleanup                | Modulaire, testable.       | Tests unitaires (GM supprimé ou en E2E). |

---

## 7. Anti-patterns transverses

| Anti-pattern                                        | Conséquence                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Figer un **bug** comme référence sans le savoir.    | Bug perpétué à travers le refactor.                                                 |
| Pas de **revue** de la baseline avant verrouillage. | Manque l'occasion de détecter les comportements suspects.                           |
| Golden Master **permanent** plutôt que temporaire.  | Maintient une suite "boîte noire" qui ne documente rien.                            |
| Sortie **non normalisée** (timestamps, UUIDs).      | Tests flakey, perte de confiance.                                                   |
| **Trop de cas** dans la baseline (10 000).          | Diffs illisibles, runs lents.                                                       |
| **Pas assez de cas** (5).                           | Couverture insuffisante, refactor casse des branches.                               |
| Confondre **Golden Master** et **Snapshot test**.   | Les concepts sont proches mais snapshots sont souvent UI fronts, GM est plus large. |
| Ne pas **passer en TDD** ensuite.                   | Le module reste opaque même après refactor.                                         |

---

## 8. Mini-projet du parcours

### 8.1 — L'énoncé

> **Refactor TDD d'un module avec stratégie de Golden Master sur la sortie existante.**

Quatre temps :

1. Choisir un **module legacy non testé** (ou simuler un avec du code volontairement complexifié).
2. Mettre en place une **stratégie Golden Master** pour sécuriser ce qui existe.
3. **Refactorer** le module pas à pas, en gardant le GM vert.
4. **Écrire des tests unitaires TDD** sur les fragments découpés, et finir par retirer ou réduire le Golden Master.

### 8.2 — Module legacy proposé

Suggestion d'un **kata célèbre** : **Gilded Rose** (ou alternative : un module de pricing intriqué, un parser CSV à la main, etc.).

**Gilded Rose** : un module de gestion de stock pour une auberge fantasy, avec des règles spécifiques :

- Items normaux : qualité dégrade de 1 par jour.
- Items "Aged Brie" : qualité **augmente** de 1.
- Items "Backstage passes" : qualité augmente différemment selon le nombre de jours avant concert.
- Items "Sulfuras" : qualité figée à 80.
- Code écrit volontairement **mal** (fonction `update_quality` de 30 lignes avec `if` imbriqués).

L'apprenant doit :

- **Comprendre le comportement** existant (lecture, exécution, exemples).
- **Refactorer** sans changer le comportement.
- **Ajouter** une nouvelle catégorie d'item ("Conjured" — qualité dégrade 2× plus vite) avec TDD.

Code source de référence : [Gilded Rose Refactoring Kata](https://github.com/emilybache/GildedRose-Refactoring-Kata).

### 8.3 — Découpage du livrable — par jour

**J1 — Setup et baseline (≈ 1 j)**

- Cloner ou recréer le code legacy.
- Lire et comprendre.
- Générer un **fichier de 50-100 inputs** représentatifs (combinaisons de quality, sellIn, type d'item).
- Capturer la baseline.
- Verrouiller en test.
- Vérifier que `pytest` passe.

**J2 — Refactor (≈ 1-2 j)**

- Décomposer la fonction `update_quality` en fonctions plus petites.
- Extraire chaque règle d'item en méthode ou classe (`AgedBrieStrategy`, `BackstagePassStrategy`, …).
- À chaque pas, **vérifier le Golden Master**.
- Renommer pour clarifier.
- Supprimer le code mort.

**J3 — Tests unitaires (≈ 1 j)**

- Pour chaque stratégie extraite, écrire **3-5 tests unitaires** dans le style TDD :
  - Cas nominal.
  - Edge cases (qualité à 0, à 50, sellIn à 0, négatif).
- Vérifier le coverage.

**J4 — TDD nouvelle catégorie (≈ 1 j)**

- En **TDD strict** (Red / Green / Refactor) :
  - Test pour "Conjured item : qualité dégrade 2× plus vite".
  - Implémentation.
  - Edge cases : qualité ne descend pas en dessous de 0, etc.
- Faire passer **tous** les tests.

**J5 — Cleanup et doc (≈ 1 j, optionnel)**

- Réduire ou supprimer le Golden Master.
- Documenter dans un README la démarche suivie.
- Capturer les **leçons** : ce qui a été facile, difficile, surprenant.

### 8.4 — Critères de validation

Le mini-projet est validé si :

- La fonction `update_quality` originale est **découpée** en plusieurs fonctions / classes lisibles.
- Tous les tests passent (Golden Master + unitaires).
- La nouvelle catégorie "Conjured" est ajoutée par TDD strict (commits Red / Green visibles).
- Le **coverage** atteint 90 %+ sur le code refactoré.
- Le **README** explique le processus en moins d'une page.

### 8.5 — Variantes "stretch"

- **Property-based testing** sur les invariants (qualité ∈ [0,50], sauf Sulfuras = 80).
- **Mutation testing** sur le code refactoré pour valider la suite.
- **Refactor en pair** : faire le même kata à 2 et comparer les designs émergents.

### 8.6 — Démontage

Le mini-projet vit dans un repo séparé. Pas de démontage nécessaire — c'est un livrable de **portfolio**.

---

## 9. Exercices pratiques (en plus du mini-projet)

### Exercice 1 — Golden Master sur un parseur (≈ 60 min)

**Objectif.** Pratiquer la technique.

**Cas.** Soit un parseur "CSV à la main" (déjà fourni ou écrit à dessein avec bugs).

**Étapes :**

1. Générer 20 fichiers CSV variés (vides, avec lignes vides, avec virgules dans les guillemets, …).
2. Capturer la sortie du parseur pour chacun.
3. Verrouiller en test.
4. Refactorer le parseur en plus propre.
5. Vérifier que le GM reste vert.

**Livrable.** Code refactoré + GM + tests unitaires émergents.

### Exercice 2 — Golden Master avec normalisation timestamp (≈ 45 min)

**Objectif.** Gérer le non-déterminisme.

**Cas.** Un module `log_formatter.py` qui produit des lignes :

```text
2026-05-18T14:32:01Z [INFO] Request /api/users took 145ms
```

**Étapes :**

1. Identifier le timestamp comme non déterministe.
2. Écrire une fonction `normalize` qui remplace `<TIMESTAMP>` et `<MS>ms`.
3. Capturer la baseline normalisée.
4. Vérifier que le test passe sur plusieurs runs.

**Livrable.** Code + GM normalisé + 5 lignes de bilan.

### Exercice 3 — Comparer Approval Tests et Snapshot (≈ 60 min)

**Objectif.** Choisir un outil.

**Étapes :**

1. Sur un même module, mettre en place **Approval Tests** (ou approval-tests).
2. Mettre en place **syrupy** ou **pytest-snapshot**.
3. Comparer : workflow, fichiers générés, lisibilité des diffs, integration IDE.

**Livrable.** Note comparative + 1 recommandation.

### Exercice 4 — Inverser le Golden Master (≈ 30 min)

**Objectif.** Mesurer le ROI.

Choisir un module **bien testé unitairement** (par exemple un de ses propres modules). Faire **comme si** il n'était pas testé : capturer un Golden Master par-dessus.

Comparer la qualité de feedback :

- Quand on casse une règle métier interne : lequel donne le meilleur message d'erreur ?
- Quand on renomme une variable : lequel reste stable ?

**Livrable.** Tableau comparatif.

### Exercice 5 — Le mini-projet Gilded Rose — préparation (≈ 60 min)

**Objectif.** Mise en jambe du mini-projet.

**Étapes :**

1. Cloner le repo Gilded Rose.
2. Lire le code original.
3. Identifier les 5 types d'items.
4. Écrire **5 cas test** pour Golden Master.
5. Capturer la baseline.

**Livrable.** Baseline + 5 cas commentés.

### Mini-projet — voir section 8

3 à 5 jours, livrable final du parcours Tests Unitaires.

---

## 10. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **Golden Master Testing** et son objectif.
- [ ] Citer **3 cas d'usage typiques**.
- [ ] Citer **3 cas où Golden Master n'est pas adapté**.
- [ ] Décrire les **6 étapes** du processus complet (du legacy aux tests unitaires).
- [ ] Distinguer **caractérisation** vs **spécification**.
- [ ] Citer **3 outils** (Approval Tests, syrupy, capture manuelle).
- [ ] Gérer **3 sources de non-déterminisme** (timestamp, UUID, ordre).
- [ ] Décrire l'évolution du **Golden Master au TDD** en 5 phases.
- [ ] Reconnaître **3 anti-patterns** (figer un bug, GM permanent, sortie non normalisée).
- [ ] Décrire le **kata Gilded Rose** et le plan de refactor.

### Items du glossaire visés

**N3 atteint** :

- _mettre en place une stratégie de Golden Master Testing en cas de refactoring_ — sections 2 à 7.

---

## 11. Synthèse du parcours Tests Unitaires

Le parcours se referme ici. À ce stade :

- **M1** — Audit des pratiques N2 : auto-diagnostic, vocabulaire, fixtures, edge cases.
- **M2** — Stubs vs Mocks : taxonomie Test Doubles, distinction rigoureuse.
- **M3** — TDD vs BDD : philosophies, langage, complémentarité.
- **M4** — Indépendance des tests : isolation, parallel-safety, cas dégradés.
- **M5** — Pertinence : matrice à tester / à ne pas tester.
- **M6** — Coverage : niveaux, lecture, plan d'amélioration.
- **M7** — TDD en pratique : Red / Green / Refactor, feature de A à Z.
- **M8** — Factorisation : tests paramétrés, builders, mothers.
- **M9** (ce module) — Golden Master + mini-projet final.

L'apprenant est désormais **N3 (Confirmé)** sur les Tests Unitaires — capable de :

- Choisir le bon outil (stub / mock / fake) en fonction du besoin.
- Conduire un cycle TDD strict.
- Auditer et améliorer une suite existante.
- Sécuriser un refactor de legacy.
- Décider quoi tester et quoi ne pas tester.
- Construire des suites maintenables, indépendantes, paramétrées.

Pour viser le **N3,5 / Senior** : approfondir mutation testing, property-based testing, créer ses propres helpers de mocking, conseiller une équipe sur sa stratégie de test, distinguer TDD top-down (London / mockist) et bottom-up (Detroit / classicist) selon le contexte.

---

## 12. Ressources complémentaires

### Livres

- _Working Effectively with Legacy Code_ (Michael Feathers) — la **référence** sur Golden Master et le travail sur le legacy.
- _Refactoring_ (Martin Fowler) — quoi refactorer une fois le filet en place.
- _xUnit Test Patterns_ (Meszaros) — chapitres "Characterization Test", "Test Double".

### Articles

- [Llewellyn Falco — Approval Tests](https://approvaltests.com/) — site officiel.
- [Emily Bache — The Coding Dojo Handbook](https://leanpub.com/codingdojohandbook).
- [Michael Feathers — Characterization Tests](https://www.michaelfeathers.com/) — divers articles.

### Outils

- [Approval Tests](https://approvaltests.com/) (multi-langage).
- [syrupy](https://github.com/tophat/syrupy) — snapshot pytest.
- [pytest-snapshot](https://github.com/joseph-roitman/pytest-snapshot) — alternative.
- [Jest snapshot testing](https://jestjs.io/docs/snapshot-testing).
- [Vitest snapshot](https://vitest.dev/guide/snapshot.html).

### Katas pour pratiquer

- [Gilded Rose Refactoring Kata](https://github.com/emilybache/GildedRose-Refactoring-Kata) — le classique.
- [Trip Service Kata](https://github.com/sandromancuso/trip-service-kata) — Sandro Mancuso.
- [Tennis Refactoring Kata](https://github.com/emilybache/Tennis-Refactoring-Kata) — Emily Bache.
- [Yatzy Refactoring Kata](https://github.com/emilybache/Yatzy-Refactoring-Kata).

### Pour aller plus loin (N3,5+)

- **Mutation testing** (M6 section 6) — pour mesurer la qualité après refactor.
- **Property-based testing** (M8 section 3) — sur les invariants du module refactoré.
- **TDD top-down vs bottom-up** — Sandro Mancuso et Steve Freeman débattent — vidéos YouTube recommandées.
- **Refactoring continu** — Martin Fowler, "Refactoring 2nd edition" — code smells et leurs remèdes.
