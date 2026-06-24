# M9 — Modélisation

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Identifier les **dépendances fonctionnelles** dans un domaine métier.
- Appliquer les **trois premières formes normales** (1NF, 2NF, 3NF) sur un schéma.
- Construire un **MCD** (Modèle Conceptuel de Données) à partir de besoins métiers.
- Traduire un MCD en **MLD** (Modèle Logique) puis en **MPD** (Modèle Physique).
- Identifier quand **dénormaliser** sciemment et quand garder la normalisation.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M8 SQL terminés.

---

## 1. Pourquoi modéliser ?

### Le problème — schéma "tout dans une table"

Un débutant qui modélise un blog peut écrire :

```sql
CREATE TABLE posts (
    id, title, content, author_name, author_email, author_bio,
    tags,                     -- "python, sql, postgresql" en chaîne
    created_at
);
```

Quatre pathologies :

1. **Redondance** — chaque post stocke le `author_email`. Si l'auteur change d'email, on met à jour 200 lignes. Risque de divergence (1 post avec l'ancien).
2. **Insertion impossible** — on ne peut pas créer un auteur sans au moins un post.
3. **Suppression destructive** — supprimer le dernier post d'un auteur supprime aussi ses infos.
4. **Modification erratique** — modifier le `author_email` sans clause WHERE = drama.

La **normalisation** corrige ces anomalies en séparant les concepts en tables distinctes.

**Analogie.** Ranger un fichier Excel chaotique en plusieurs onglets reliés. Chaque information une seule fois, à un seul endroit, accessible par référence.

---

## 2. Dépendances fonctionnelles

### Définition

Une **dépendance fonctionnelle** X → Y signifie : "à chaque valeur unique de X correspond une seule valeur de Y".

Exemples :

- `user_id → name` : un id détermine un nom.
- `(order_id, product_id) → quantity` : un couple détermine une quantité (PK composite).
- `isbn → title` : un isbn détermine un titre.

### Pourquoi c'est important

La normalisation **élimine les dépendances "mal placées"** : celles qui mettent une info à un endroit où elle ne devrait pas être.

### Comment les repérer

Pour chaque colonne, se demander : "quelle clé minimale détermine cette valeur ?"

```
Table : orders(id, user_id, user_email, total)

DF observées :
- id → user_id, user_email, total           (PK)
- user_id → user_email                       (chaque user a un seul email)
```

La seconde DF est "mal placée" : `user_email` dépend de `user_id`, pas de `id`. C'est le signe qu'`user_email` ne devrait pas être dans `orders`.

---

## 3. Les trois premières formes normales

### Première forme normale (1NF) — atomicité

> **Chaque colonne contient une seule valeur atomique, pas une liste ni une structure imbriquée.**

**Violation** :

```
posts(id, title, tags)
  1  | "Hello" | "python,sql,postgresql"        ← liste dans une colonne
```

**Correction** :

```
posts(id, title)
post_tags(post_id, tag)
  1, "python"
  1, "sql"
  1, "postgresql"
```

**Analogie.** Un cahier où chaque case ne contient qu'une seule note, pas une liste. Si on doit lister, on ouvre une autre page (une autre table).

Note moderne : PostgreSQL accepte les arrays (`TEXT[]`) et JSON natifs. Pour les cas simples (tags), un `TEXT[]` peut être acceptable. Mais pour interroger (`WHERE 'python' IN tags`), c'est moins efficace qu'une table de jointure.

### Deuxième forme normale (2NF) — dépendance sur la clé entière

> **1NF + chaque colonne non-clé dépend de la clé primaire ENTIÈRE (pas d'une partie).**

S'applique surtout aux **clés composites**.

**Violation** :

```
order_items(order_id, product_id, quantity, product_name)
  PK = (order_id, product_id)

- quantity dépend de (order_id, product_id)     ✓
- product_name dépend de product_id seul         ✗
```

`product_name` est **redondant** dans `order_items` — il dépend seulement de `product_id`.

**Correction** :

```
order_items(order_id, product_id, quantity)
products(id, name)
```

### Troisième forme normale (3NF) — pas de dépendance transitive

> **2NF + aucune colonne non-clé ne dépend d'une autre colonne non-clé.**

**Violation** :

```
employees(id, name, department_id, department_name)

- name, department_id dépendent de id           ✓
- department_name dépend de department_id        ✗ (transitif)
```

`department_name` dépend de `department_id`, qui dépend de `id`. La dépendance est **transitive**. Mettre à jour le nom d'un département obligerait à toucher toutes les lignes employés.

**Correction** :

```
employees(id, name, department_id)
departments(id, name)
```

### Synthèse

| Forme | Critère             | Test                                                 |
| ----- | ------------------- | ---------------------------------------------------- |
| 1NF   | Atomicité           | Aucune liste, aucune structure imbriquée             |
| 2NF   | Dépendance totale   | Aucune colonne ne dépend d'une partie de la PK       |
| 3NF   | Pas de transitivité | Aucune colonne non-clé ne dépend d'une autre non-clé |

### Forme normale de Boyce-Codd (FNBC) et au-delà

Mentionnée pour info, approfondie en M12 :

- **BCNF** : tout déterminant doit être une clé candidate. Renforce 3NF.
- **4NF, 5NF** : règlent les dépendances multivaluées et de jointure. Rarement nécessaires en pratique.

En 2025, la cible standard est **3NF** ou **BCNF**. Au-delà, gain pratique marginal.

---

## 4. Le MCD — Modèle Conceptuel de Données

### Théorie

Le **MCD** décrit le domaine métier en termes d'**entités** et de **relations**, **sans considération technique**. Pas de SGBD, pas de syntaxe SQL — juste les concepts métier.

**Analogie.** Le plan de la maison côté architecte. Il décrit les pièces, leur usage, leurs liens. Il ne dit pas encore quels matériaux ni quelles prises électriques.

### Notation entité-relation

```
┌──────────────┐                     ┌──────────────┐
│  Customer    │ 1, 1         0, n   │  Order        │
├──────────────┤◇──────────────────│  ├──────────────┤
│  id          │      places         │  id           │
│  name        │                     │  total        │
│  email       │                     │  created_at   │
└──────────────┘                     └──────────────┘
```

- **Entités** dans des rectangles.
- **Relations** entre entités, avec un verbe (`places`).
- **Cardinalités** : `(min, max)` de chaque côté.
  - `(1, 1)` : exactement un.
  - `(0, n)` : zéro ou plusieurs.
  - `(1, n)` : au moins un.

### Démarche

1. **Identifier les entités** principales du domaine (Customer, Order, Product...).
2. **Lister les attributs** de chaque entité.
3. **Identifier les relations** entre entités (verbes : commande, contient, écrit...).
4. **Spécifier les cardinalités** (un client peut-il avoir 0 ou 1 commandes minimum ?).
5. **Repérer les attributs de relation** (si la relation porte une info — par exemple `quantity` dans un order_item).

### Exemple — domaine bibliothèque

**Entités** :

- `Book(isbn, title, year)`.
- `Author(id, name, bio)`.
- `Member(id, name, email)`.
- `Loan` (relation entre Book et Member, porte `loan_date`, `return_date`).

**Relations** :

- `Book` _écrit par_ `Author` — un livre peut avoir N auteurs, un auteur peut écrire N livres (N-N).
- `Member` _emprunte_ `Book` (matérialisé par l'entité `Loan`).

---

## 5. Le MLD — Modèle Logique de Données

### Théorie

Le **MLD** traduit le MCD en **tables relationnelles**, sans encore choisir un SGBD spécifique. C'est la passerelle entre conceptuel et physique.

**Analogie.** Le plan technique côté ingénieur. Toutes les pièces deviennent des plans de construction (tables) avec des dimensions précises (types). Les portes et fenêtres deviennent des points de contact (clés étrangères). Pas encore de marque de matériel.

### Règles de traduction MCD → MLD

#### Entité → Table

Chaque entité devient une table. Ses attributs deviennent des colonnes.

```
Customer(id, name, email)
        ↓
TABLE customers (id, name, email, PK = id)
```

#### Relation 1-N

La clé primaire du côté **1** devient une clé étrangère du côté **N**.

```
Customer (1) ────< (N) Order
        ↓
TABLE orders (id, customer_id FK → customers.id, total, ...)
```

#### Relation N-N

Création d'une **table de jointure** avec les deux FK comme PK composite.

```
Book (N) ────── (N) Author
        ↓
TABLE book_authors (book_id FK, author_id FK, PK = (book_id, author_id))
```

#### Relation porteuse d'attributs

L'entité-relation devient une table dédiée.

```
Member (1) ──< Loan >── (N) Book
              [date, return_date]
        ↓
TABLE loans (id, member_id FK, book_id FK, loan_date, return_date)
```

### Exemple bibliothèque — MLD

```
books (isbn PK, title, year)
authors (id PK, name, bio)
book_authors (book_id FK, author_id FK, PK composite)
members (id PK, name, email UNIQUE)
loans (id PK, member_id FK, book_id FK, loan_date, return_date)
```

---

## 6. Le MPD — Modèle Physique de Données

### Théorie

Le **MPD** est le SQL exécutable, spécifique à un SGBD précis. Choix des types, contraintes, index, options de stockage.

**Analogie.** La maison construite. Bois ou béton ? Quelle marque de fenêtres ? Le MPD code les choix techniques effectifs.

### Traduction MLD → MPD

```sql
CREATE TABLE books (
    isbn        VARCHAR(13) PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    year        INTEGER CHECK (year > 0)
);

CREATE TABLE authors (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    bio         TEXT
);

CREATE TABLE book_authors (
    book_id     VARCHAR(13) REFERENCES books(isbn) ON DELETE CASCADE,
    author_id   INTEGER REFERENCES authors(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, author_id)
);

CREATE TABLE members (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE loans (
    id          SERIAL PRIMARY KEY,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    book_id     VARCHAR(13) NOT NULL REFERENCES books(isbn),
    loan_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    return_date DATE,
    CHECK (return_date IS NULL OR return_date >= loan_date)
);

CREATE INDEX idx_loans_member ON loans(member_id);
CREATE INDEX idx_loans_book ON loans(book_id);
```

À ce stade, on a un schéma déployable.

### Choix typiques du MPD

- **Types précis** — `VARCHAR(n)`, `INTEGER`, `DECIMAL(p, s)`.
- **Contraintes** — `NOT NULL`, `UNIQUE`, `CHECK`, FK avec `ON DELETE`.
- **Index** — sur les colonnes filtrées ou jointes fréquemment.
- **Options de stockage** — tablespaces, partitionnement (avancé).

---

## 7. Quand dénormaliser

### Principe

La normalisation est **par défaut**, pour la cohérence et la maintenabilité. Dénormaliser sciemment se fait pour **gagner en performance** sur des accès lecture coûteux — au prix de redondance et de risque de divergence.

### Cas légitimes

- **Cache de calcul** — stocker `orders.total` calculé à partir des `order_items`. Si calculer dynamiquement coûte 50 ms par order, dénormaliser économise sur les listes.
- **Données historiques** — `orders.customer_email_at_purchase` pour figer l'email au moment de la commande, indépendamment des changements futurs.
- **Reporting / OLAP** — un data warehouse a typiquement des schémas en **étoile** (fact table + dimensions dénormalisées), conçus pour les lectures, pas pour les writes.

### Coûts à payer

- **Mise à jour multiple** — modifier la donnée originale ne suffit plus.
- **Triggers ou jobs de sync** pour maintenir la cohérence.
- **Risque de divergence** silencieuse.

### Règle pratique

> _Normalize until it hurts, denormalize until it works._

Démarrer en 3NF. Mesurer les requêtes lentes. Si une vue matérialisée (M8) ne suffit pas, dénormaliser **sélectivement** avec documentation explicite.

---

## 8. Exercices pratiques

### Exercice 1 — Identifier les violations (≈ 25 min)

Pour chaque schéma, identifier les violations 1NF, 2NF, 3NF :

```
1. orders(id, customer_id, customer_name, items)
   où items = "shoes:2, hat:1, gloves:1"

2. order_items(order_id, product_id, qty, product_price)
   PK = (order_id, product_id)

3. employees(id, name, manager_id, manager_name, dept_id, dept_name, dept_location)

4. user_phones(user_id, phone1, phone2, phone3)
```

Proposer une décomposition pour chaque cas.

### Exercice 2 — Dépendances fonctionnelles (≈ 20 min)

Soit la table :

```
courses(course_id, course_name, prof_id, prof_name, prof_office, room)
```

1. Lister toutes les DF observables (`course_id → ?`, `prof_id → ?`, etc.).
2. Identifier la PK.
3. Identifier les DF transitives.
4. Décomposer en 3NF.

### Exercice 3 — MCD à partir d'un énoncé (≈ 35 min)

Énoncé : "Une école veut gérer des **étudiants** (nom, email, niveau), des **cours** (titre, crédits), des **professeurs** (nom, département). Un étudiant suit plusieurs cours, un cours est enseigné par plusieurs profs (un par section). Chaque inscription a une **note finale**."

1. Identifier les entités.
2. Identifier les relations (avec verbes).
3. Définir les cardinalités.
4. Identifier l'éventuel attribut de relation (note finale).
5. Dessiner le MCD en ASCII art.

### Exercice 4 — MCD → MLD → MPD (≈ 45 min)

À partir du MCD de l'exercice 3 :

1. **MLD** : lister les tables, leurs colonnes, leurs PK, leurs FK.
2. **MPD** : écrire le SQL PostgreSQL complet (`CREATE TABLE ...`).
3. Insérer 5 lignes par table cohérentes.
4. Écrire 3 requêtes :
   - Lister les cours d'un étudiant donné.
   - Compter le nombre d'inscriptions par cours.
   - Trouver les étudiants avec moyenne > 14.

### Exercice 5 — Dénormalisation justifiée (≈ 25 min)

Soit une table `orders` qui calcule son `total` via la somme de `order_items`. La requête `SELECT total FROM orders` exécute en réalité une jointure + SUM. Sur 1 million d'orders, c'est lent.

1. Justifier en 3 lignes pourquoi dénormaliser `orders.total` peut faire sens.
2. Proposer une stratégie de **maintenance** :
   - Trigger après INSERT / UPDATE / DELETE sur `order_items`.
   - Ou recalcul périodique (cron).
3. Quel est le risque principal ? Comment l'atténuer ?

---

## 9. Mini-défi de synthèse — modélisation complète (≈ 2 à 3 heures)

Choisir **un domaine métier** et le modéliser de bout en bout.

### Domaines suggérés

1. **Plateforme de streaming musical** : utilisateurs, albums, tracks, artistes, playlists, écoutes.
2. **Site de réservation hôtelière** : hôtels, chambres, types, clients, réservations, tarifs saisonniers.
3. **Gestion de courses cyclistes** : courses, étapes, cyclistes, équipes, résultats par étape.
4. **Plateforme de cours en ligne** : cours, modules, étudiants, instructeurs, inscriptions, progression, certificats.

### Livrables

1. **Énoncé du besoin** (5-10 lignes) précisant les questions auxquelles la base devra répondre.
2. **MCD** : 5 à 8 entités, avec attributs et cardinalités.
3. **MLD** : tables avec PK, FK, contraintes.
4. **MPD** : SQL PostgreSQL complet, jouable, avec :
   - Au moins **2 contraintes CHECK** métier.
   - Au moins **1 relation N-N** matérialisée par table de jointure.
   - Au moins **1 attribut de relation** (info portée par la jointure).
   - **Tous** les `ON DELETE` justifiés.
5. **Données de test** : 5+ lignes par table, cohérentes.
6. **5 requêtes métier** qui répondent à 5 questions de l'énoncé initial.

### Critères de validation

- [ ] Le schéma est en **3NF strict** — pas de redondance, pas de DF transitive.
- [ ] Chaque décision (composition, héritage, redondance) est **justifiée** en commentaire SQL.
- [ ] Les noms suivent les conventions (M3).
- [ ] Les 5 requêtes métier passent sans erreur.

---

## 10. Auto-évaluation

Le module M9 est validé lorsque :

- [ ] L'apprenant définit une **dépendance fonctionnelle** et l'identifie sur un schéma.
- [ ] Il sait dire si une table est en 1NF, 2NF, 3NF (et corriger sinon).
- [ ] Il dessine un MCD à partir d'un énoncé.
- [ ] Il traduit MCD → MLD → MPD sans étape sautée.
- [ ] Il connaît au moins 2 cas où dénormaliser sciemment est légitime.
- [ ] Le mini-défi de modélisation est rendu en 3NF avec 5 requêtes fonctionnelles.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : formes normales (3 premières), modéliser un MCD à partir de besoins métiers et de dépendances fonctionnelles, créer une base à partir d'un MLD/MPD.

---

## 11. Ressources complémentaires

- **C. J. Date** — _Database in Depth: Relational Theory for Practitioners_ (2005). Théorie relationnelle expliquée pour développeurs.
- **E. F. Codd** — _A Relational Model of Data for Large Shared Data Banks_ (1970). Le papier fondateur.
- **Vertabelo** : [vertabelo.com](https://vertabelo.com/). Outil web pour MCD et génération SQL.
- **dbdiagram.io** : [dbdiagram.io](https://dbdiagram.io/). Diagrammes ER en syntaxe textuelle simple.
- **Documentation PostgreSQL** — _Data Modeling_ : guides de mise en pratique.
- **Martin Fowler** — _Patterns of Enterprise Application Architecture_ (2002), partie sur la modélisation.
- **Database Design for Mere Mortals** (Michael J. Hernandez) — manuel de référence accessible aux non-spécialistes.
