# M1 — Contexte SQL

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est **SQL** et dans quel contexte il s'utilise.
- Distinguer **base relationnelle (SGBD)** et autres modèles (NoSQL, fichier, mémoire).
- Citer les principaux **dialectes SQL** (PostgreSQL, MySQL, SQLite, SQL Server, Oracle).
- Comprendre la notion de **schéma** : tables, colonnes, lignes, types, contraintes.
- **Décrire le schéma** d'une base existante à partir d'introspection.

## Durée estimée

0,5 jour.

## Pré-requis

- Notions générales de programmation (variables, types, structures de données).
- Connaissance vague qu'une "base de données" stocke des informations persistantes.

---

## 1. Qu'est-ce que SQL ?

### Définition

**SQL** = _Structured Query Language_. C'est un **langage déclaratif** standardisé pour manipuler des **bases de données relationnelles**.

- **Déclaratif** : on décrit **ce qu'on veut** ("donne-moi les utilisateurs créés cette semaine"), pas comment le calculer. Le moteur SQL choisit la stratégie d'exécution.
- **Standardisé** : la norme **ISO/IEC 9075** définit un cœur commun. Chaque éditeur ajoute ses extensions.
- **Relationnel** : les données sont organisées en **tables** liées entre elles par des **références**.

**Analogie.** SQL est aux bases de données ce que **l'anglais est à l'aviation** : la langue commune que tous les pilotes (devs) connaissent pour communiquer avec n'importe quelle tour de contrôle (SGBD). Le dialecte varie un peu d'un aéroport à l'autre, mais la base reste comprise partout.

### Pourquoi SQL existe depuis 50 ans et résiste

- **Modèle mathématique solide** — algèbre relationnelle (E. F. Codd, 1970).
- **Données structurées** — type, contraintes, intégrité.
- **Transactions ACID** — atomicité, cohérence, isolation, durabilité.
- **Optimiseur** — le moteur réécrit la requête pour aller plus vite (joins, index, statistiques).
- **Standard** — peu d'autres technologies bénéficient d'une portabilité aussi large.

Les alternatives NoSQL (MongoDB, DynamoDB, Redis, Elasticsearch) répondent à des cas spécifiques (scaling horizontal extrême, données peu structurées, search). SQL reste **le défaut** pour la plupart des applications métier.

---

## 2. Les principaux SGBD

### Tableau comparatif rapide

| SGBD                | Famille                   | Forces                                                        | Quand l'utiliser                       |
| ------------------- | ------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| **PostgreSQL**      | Open-source, ACID complet | Extensions riches (JSON, géo, full-text), conformité standard | Choix par défaut pour nouveau projet   |
| **MySQL / MariaDB** | Open-source               | Très répandu, simple, rapide en lecture                       | Apps web classiques, écosystème legacy |
| **SQLite**          | Embarqué (fichier)        | Zéro serveur, parfait pour dev/tests/embedded                 | Apps mobiles, prototypes, tests        |
| **SQL Server**      | Microsoft                 | Intégration Windows, BI, MERGE                                | Stack .NET, entreprises Microsoft      |
| **Oracle**          | Commercial                | Performance et features entreprise                            | Grandes entreprises legacy             |

Pour le parcours Confirmé, **PostgreSQL** est le choix par défaut — il est gratuit, complet, et représentatif de la norme. SQLite reste utile pour les exercices locaux (pas de serveur à installer).

### Dialectes — l'attention à porter

Chaque SGBD a son **dialecte** : extensions au standard, mots-clés propriétaires, syntaxes alternatives. Exemples typiques :

- **Limit** : `LIMIT 10` (PostgreSQL, MySQL, SQLite) vs `TOP 10` (SQL Server) vs `FETCH FIRST 10 ROWS ONLY` (standard).
- **Types** : `SERIAL` (PostgreSQL) vs `AUTO_INCREMENT` (MySQL) vs `IDENTITY` (SQL Server).
- **JSON** : `->` et `->>` (PostgreSQL) vs `JSON_VALUE` (MySQL).

Tout ce parcours utilisera la **syntaxe standard** quand possible, en signalant les divergences principales.

---

## 3. Notion de schéma

### Théorie

Un **schéma** est le **plan de la base de données** : la liste des tables, leurs colonnes, leurs types, les contraintes et relations.

**Analogie.** Le **plan d'un immeuble**. Le schéma décrit les pièces (tables), leurs cloisons (relations), les fenêtres et portes (colonnes et clés). Sans plan, impossible de naviguer ; sans plan, impossible de faire évoluer.

### Hiérarchie

```
[Serveur]
   └── [Database]              ← une "base"
         └── [Schema]           ← un namespace
               └── [Table]      ← une entité (Users, Orders)
                     └── [Column] ← un champ typé (id, name, created_at)
                           └── [Row] ← une ligne de données
```

- **Database** — l'unité de plus haut niveau, isolée des autres.
- **Schema** — sous-namespace au sein d'une database (en PostgreSQL : `public`, `auth`, `analytics`). En MySQL, schema = database.
- **Table** — une entité métier.
- **Column** — un attribut typé d'une entité.
- **Row** — une instance.

### Exemple — schéma simple

```
Table: users
  - id            INTEGER PRIMARY KEY
  - email         VARCHAR(255) UNIQUE NOT NULL
  - name          VARCHAR(100) NOT NULL
  - created_at    TIMESTAMP DEFAULT NOW()

Table: orders
  - id            INTEGER PRIMARY KEY
  - user_id       INTEGER REFERENCES users(id)
  - total         DECIMAL(10, 2) NOT NULL
  - status        VARCHAR(20) NOT NULL
  - created_at    TIMESTAMP DEFAULT NOW()
```

Deux tables : `users` et `orders`. La colonne `orders.user_id` **référence** `users.id` — c'est une relation. Une commande sans utilisateur valide est rejetée.

### Types courants

| Catégorie        | Types                                           | Usage                                           |
| ---------------- | ----------------------------------------------- | ----------------------------------------------- |
| **Entiers**      | `INTEGER`, `BIGINT`, `SMALLINT`                 | Compteurs, ids, quantités                       |
| **Décimaux**     | `DECIMAL(precision, scale)`, `NUMERIC`          | Monnaie, prix (jamais `FLOAT` pour de l'argent) |
| **Flottants**    | `REAL`, `DOUBLE PRECISION`, `FLOAT`             | Mesures scientifiques                           |
| **Chaînes**      | `VARCHAR(n)`, `TEXT`, `CHAR(n)`                 | Texte court / long                              |
| **Dates**        | `DATE`, `TIME`, `TIMESTAMP`, `INTERVAL`         | Horodatage, dates                               |
| **Booléens**     | `BOOLEAN`                                       | Vrai / faux                                     |
| **JSON**         | `JSON`, `JSONB` (PostgreSQL)                    | Données semi-structurées                        |
| **Identifiants** | `UUID`, `SERIAL` (PG), `AUTO_INCREMENT` (MySQL) | Clés primaires                                  |

### Contraintes (introduites ici, détaillées en M3)

| Contrainte    | Effet                                               |
| ------------- | --------------------------------------------------- |
| `PRIMARY KEY` | Identifie une ligne de façon unique (auto-indexée). |
| `FOREIGN KEY` | Référence une ligne d'une autre table.              |
| `UNIQUE`      | Toute valeur doit être unique dans la colonne.      |
| `NOT NULL`    | La valeur doit être renseignée.                     |
| `CHECK`       | Une condition à respecter (ex : `age >= 0`).        |
| `DEFAULT`     | Valeur par défaut si non fournie.                   |

---

## 4. Décrire le schéma d'une base existante

### Méthode

Pour comprendre une base qu'on découvre, **on ne demande pas un diagramme à quelqu'un** — on l'extrait soi-même. Cinq étapes :

1. **Lister les tables** disponibles.
2. **Inspecter les colonnes** de chaque table (nom, type, contraintes).
3. **Identifier les clés primaires** et les **clés étrangères**.
4. **Repérer les contraintes** d'unicité et de validation.
5. **Dessiner** mentalement (ou sur papier) le graphe de relations.

### Outils d'introspection

#### PostgreSQL — commandes `psql`

```sql
\dt                       -- liste les tables du schéma courant
\d users                  -- décrit la structure de la table users
\dn                       -- liste les schemas
\d+ users                 -- description détaillée avec contraintes et index
```

#### MySQL

```sql
SHOW TABLES;
SHOW CREATE TABLE users;  -- montre le DDL complet
DESCRIBE users;           -- résumé colonnes
```

#### SQLite

```sql
.tables
.schema users
PRAGMA table_info(users);
```

#### Standard — via information_schema

Cette table système existe dans tous les SGBD standards :

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users';

SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'users';
```

### Outils graphiques

- **DBeaver** — multi-SGBD gratuit, génère des diagrammes ER à partir d'une connexion.
- **pgAdmin** — natif PostgreSQL, navigateur de schéma.
- **MySQL Workbench** — natif MySQL.
- **DataGrip** (JetBrains) — payant, très complet.
- **DB Browser for SQLite** — pour SQLite local.

Pour l'apprentissage, **DBeaver Community** suffit largement.

### Lecture d'un diagramme ER

Un **diagramme entité-relation** représente :

- Les **entités** (tables) en boîtes.
- Les **attributs** (colonnes) dans la boîte.
- Les **relations** entre tables avec leur cardinalité (`1-1`, `1-N`, `N-N`).

```
┌────────────┐         ┌────────────┐
│  users     │ 1 ───── N│  orders   │
├────────────┤          ├────────────┤
│ id (PK)    │          │ id (PK)    │
│ email      │          │ user_id(FK)│
│ name       │          │ total      │
└────────────┘          │ status     │
                        └────────────┘
```

Lecture : un utilisateur peut avoir **N commandes**, une commande appartient à **1 utilisateur**.

---

## 5. Exercices pratiques

### Exercice 1 — Installer un environnement (≈ 20 min)

Au choix :

- **PostgreSQL** local : installer via `brew install postgresql` (macOS), `apt install postgresql` (Linux), ou installer Postgres.app (macOS).
- **SQLite** : déjà disponible sur la plupart des systèmes (`sqlite3 mydb.db`).
- **Docker** : `docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16`.

Se connecter et vérifier que `SELECT 1;` renvoie `1`.

### Exercice 2 — Explorer un schéma fourni (≈ 25 min)

Télécharger une base de données d'exemple :

- **Northwind** (classique : clients, produits, commandes) — disponible pour Postgres / MySQL / SQLite sur GitHub.
- **Chinook** (musique : artistes, albums, tracks, customers) — multi-SGBD.

Une fois la base chargée, **sans outil graphique** :

1. Lister toutes les tables.
2. Pour chaque table principale, lister les colonnes avec type.
3. Identifier les clés primaires.
4. Identifier les clés étrangères (relations).

Dessiner un schéma sommaire en ASCII art.

### Exercice 3 — Différences de dialectes (≈ 20 min)

Soit la requête SQL Server :

```sql
SELECT TOP 10 *
FROM users
WHERE created_at > GETDATE() - 7
ORDER BY id DESC;
```

Traduire la requête en :

1. PostgreSQL (utilise `NOW()` et `LIMIT`).
2. MySQL (proche du standard, `NOW()` et `LIMIT`).
3. Standard ANSI (utilise `CURRENT_TIMESTAMP` et `FETCH FIRST n ROWS ONLY`).

### Exercice 4 — `information_schema` (≈ 25 min)

Sur la base de l'exercice 2, utiliser **uniquement `information_schema`** pour répondre :

1. Combien de tables au total dans le schéma `public` ?
2. Quelle table a le plus de colonnes ?
3. Quelle colonne `varchar` est la plus longue (en termes de `character_maximum_length`) ?
4. Combien de clés étrangères au total dans la base ?

### Exercice 5 — Choisir le type approprié (≈ 20 min)

Pour chaque champ, choisir le type SQL et justifier :

1. Un identifiant unique d'utilisateur.
2. Un mot de passe haché (bcrypt, longueur fixe ~60).
3. Un prix en euros, avec 2 décimales.
4. Une date d'inscription.
5. Un drapeau "actif".
6. Une description longue de produit.
7. Un code postal français.
8. Un score de satisfaction (1 à 5).
9. Des données arbitraires JSON.

---

## 6. Mini-défi de synthèse (≈ 1 heure)

Choisir un **domaine simple** (au choix) et **décrire son schéma en pseudo-SQL** sur papier ou en `.md` :

**Domaines suggérés** :

- Bibliothèque (livres, auteurs, emprunts, lecteurs).
- Blog (utilisateurs, articles, commentaires, tags).
- E-commerce minimal (produits, clients, commandes, lignes).
- Restaurant (menus, plats, réservations, tables).

**Livrables** :

1. **Liste des tables** (3 à 5).
2. Pour chaque table : colonnes, types, contraintes principales.
3. **Schéma ER** en ASCII art (cardinalités).
4. Un commentaire pour chaque colonne qui mérite explication (`isbn — code ISBN à 13 chiffres`, `total — en cents pour éviter les flottants`).

Pas de code SQL exécutable à ce stade — c'est l'objet de M2 et M3. Ici, c'est l'**exercice de modélisation initiale**.

---

## 7. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] L'apprenant explique SQL en deux phrases (déclaratif, standardisé, relationnel) avec une analogie.
- [ ] Il cite 4 SGBD principaux et un cas d'usage pour chacun.
- [ ] Il connaît les principaux types SQL et choisit le bon pour 9 cas sur 9.
- [ ] Il sait introspecter le schéma d'une base existante (`\d` ou `information_schema`).
- [ ] Il lit un diagramme ER et identifie les cardinalités.
- [ ] Le mini-défi de modélisation est rendu sur 3 à 5 tables.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : contexte d'utilisation du SQL, notion de schéma.

---

## 8. Ressources complémentaires

- **Documentation PostgreSQL** : [postgresql.org/docs](https://www.postgresql.org/docs/). Très complète, lecture de référence.
- **SQLite** : [sqlite.org/docs](https://www.sqlite.org/docs.html).
- **W3Schools SQL** : [w3schools.com/sql](https://www.w3schools.com/sql/). Tutoriel rapide pour mémoire de syntaxe.
- **PostgreSQL Tutorial** : [postgresqltutorial.com](https://www.postgresqltutorial.com/). Tutoriel structuré.
- **DBeaver Community** : [dbeaver.io](https://dbeaver.io/). Outil graphique multi-SGBD.
- **Northwind / Chinook databases** : disponibles sur GitHub pour différents SGBD.
- **SQL Murder Mystery** : [mystery.knightlab.com](https://mystery.knightlab.com/). Apprendre SQL en résolvant une enquête — ludique et bien fait.
