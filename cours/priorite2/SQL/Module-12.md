# M12 — Vers 2.5 — Approfondissement N3

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Écrire des **requêtes imbriquées** (sous-requêtes scalaires, dans `WHERE`, dans `FROM`).
- Utiliser le mot-clé **`WITH`** (CTE — Common Table Expression) pour structurer les requêtes complexes.
- Créer et choisir des **index** pertinents pour accélérer les requêtes.
- Utiliser **`EXPLAIN` / `EXPLAIN ANALYZE`** pour mesurer une requête avant / après optimisation.
- Avoir une **vue d'ensemble** des triggers et procédures stockées (sans les écrire en détail).
- Utiliser les **fonctions** courantes sur **strings** et **dates**.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M11 SQL terminés.

---

## 1. Requêtes imbriquées (sous-requêtes)

### Théorie

Une **sous-requête** est une requête `SELECT` placée à l'intérieur d'une autre. Elle peut apparaître dans :

- Le **`WHERE`** (filtrer selon le résultat).
- Le **`FROM`** (utilisée comme table virtuelle).
- Le **`SELECT`** (colonne calculée à partir d'une autre requête).

**Analogie.** Une question à plusieurs étapes : "Trouve-moi le client dont la commande est la plus récente." On répond en deux temps : d'abord trouver la commande la plus récente, puis trouver son client.

### Sous-requête dans `WHERE`

```sql
SELECT name, email
FROM users
WHERE id IN (
    SELECT user_id FROM orders WHERE total > 1000
);
```

Le `IN (...)` accepte une liste de valeurs ou le résultat d'une sous-requête. Lecture : _les users dont l'id apparaît dans la liste des user_id de grosses commandes_.

### Sous-requête scalaire dans `SELECT`

```sql
SELECT
    u.name,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS nb_orders
FROM users u;
```

La sous-requête doit renvoyer **une seule valeur** par ligne extérieure. Sinon, erreur.

### Sous-requête dans `FROM`

```sql
SELECT country, AVG(total_per_user) AS avg_revenue_per_user
FROM (
    SELECT u.country, u.id, SUM(o.total) AS total_per_user
    FROM users u
    JOIN orders o ON o.user_id = u.id
    GROUP BY u.country, u.id
) AS user_totals
GROUP BY country;
```

La sous-requête joue le rôle de **table intermédiaire**. Obligatoire : un alias (`AS user_totals`).

### `EXISTS` et `NOT EXISTS`

Plus efficace que `IN` quand on veut juste tester l'existence :

```sql
-- Users qui ont au moins une commande
SELECT name FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id
);

-- Users qui n'ont aucune commande
SELECT name FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id
);
```

`SELECT 1` est conventionnel : ce qu'on sélectionne dans `EXISTS` est ignoré, seule l'existence compte.

### Corrélation

Une sous-requête **corrélée** référence la requête extérieure (ex : `o.user_id = u.id`). Elle est ré-évaluée pour chaque ligne extérieure → potentiellement coûteux. Le moteur optimise souvent, mais à surveiller.

---

## 2. CTE — `WITH`

### Théorie

Une **CTE** (_Common Table Expression_) est une "table temporaire nommée" déclarée en début de requête. Elle améliore la **lisibilité** des requêtes complexes.

```sql
WITH active_users AS (
    SELECT id, name FROM users WHERE is_active = true
),
recent_orders AS (
    SELECT user_id, total FROM orders WHERE created_at > NOW() - INTERVAL '30 days'
)
SELECT u.name, SUM(o.total) AS spent_30d
FROM active_users u
JOIN recent_orders o ON o.user_id = u.id
GROUP BY u.name;
```

**Analogie.** Définir des variables intermédiaires dans une formule longue. Au lieu de `SUM(o.total) WHERE o.created_at > NOW() - 30d JOIN users WHERE is_active`, on définit deux "morceaux" lisibles et on les compose.

### Bénéfices

- **Lisibilité** — la requête se lit de haut en bas.
- **Réutilisation** — une CTE peut être référencée plusieurs fois.
- **Décomposition** — chaque étape est testable séparément.

### CTE récursive

Pour des hiérarchies (arbres, graphes) :

```sql
WITH RECURSIVE subordinates AS (
    -- ancre
    SELECT id, name, manager_id
    FROM employees
    WHERE id = 1

    UNION ALL

    -- récursion
    SELECT e.id, e.name, e.manager_id
    FROM employees e
    JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates;
```

Trouve **tous les descendants** de l'employé 1. Très utile pour les hiérarchies sans limite de profondeur.

---

## 3. Index — intérêt et création

### Théorie

Un **index** est une **structure de données auxiliaire** qui accélère la lecture d'une colonne (ou groupe de colonnes). Sans index, le SGBD doit lire toute la table (**full table scan**). Avec un index, il accède directement aux lignes pertinentes.

**Analogie.** Un index dans un livre. Sans index, tu lis page par page pour trouver "PostgreSQL". Avec, tu vas direct à la page indiquée. Le coût : l'index occupe quelques pages en plus, et il faut le maintenir à jour.

### Type le plus courant — B-tree

L'index par défaut dans tous les SGBD. Excellent pour :

- Égalité (`WHERE email = 'x@y.z'`).
- Plage (`WHERE age BETWEEN 18 AND 65`).
- Tri (`ORDER BY created_at`).
- `LIKE` avec préfixe (`LIKE 'al%'`).

Mauvais pour :

- `LIKE '%abc'` (suffixe — pas de préfixe pour rechercher).
- `LIKE '%abc%'` (contains).
- Fonctions sur la colonne (`WHERE LOWER(email) = ...` — sauf index fonctionnel).

### Créer un index

```sql
CREATE INDEX idx_users_email ON users(email);

CREATE UNIQUE INDEX idx_users_email_unique ON users(email);
-- (équivalent à UNIQUE constraint)

CREATE INDEX idx_orders_user_status ON orders(user_id, status);
-- index composite : utile si on filtre souvent par user_id + status
```

### Indexer automatiquement

Les colonnes suivantes sont **indexées automatiquement** :

- **PRIMARY KEY** — index unique.
- **UNIQUE constraint** — index unique.

Les **clés étrangères** ne le sont **pas** automatiquement (sauf MySQL InnoDB). À indexer **explicitement** pour accélérer les jointures :

```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### Quand indexer

Indexer une colonne :

- Utilisée dans **`WHERE`** fréquemment.
- Utilisée dans une **clause `JOIN`** (FK).
- Utilisée dans **`ORDER BY`** fréquent.
- Avec une **forte cardinalité** (beaucoup de valeurs distinctes).

Ne **pas** indexer :

- Une colonne booléenne avec 2 valeurs.
- Une colonne rarement filtrée.
- Une table de < 1000 lignes (full scan est plus rapide).

### Coût des index

Chaque index :

- **Occupe de la place** sur disque.
- **Ralentit** les `INSERT` / `UPDATE` / `DELETE` (il faut maintenir l'index).

Règle pratique : **indexer ce qui apparaît dans les requêtes lentes**, mesuré au préalable.

### Index composite — ordre des colonnes

```sql
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Utile pour :
WHERE user_id = 42                       -- ✓ utilise l'index
WHERE user_id = 42 AND status = 'paid'   -- ✓ utilise l'index complet
WHERE status = 'paid'                     -- ✗ n'utilise PAS l'index (préfixe manquant)
```

L'ordre compte. La règle : **mettre la colonne la plus sélective en premier**, ou celle utilisée seule fréquemment.

### Autres types d'index

- **GIN** (PostgreSQL) — pour full-text search (`tsvector`), JSON, arrays.
- **GiST** (PostgreSQL) — pour géospatial (PostGIS).
- **Hash** — pour égalité stricte seulement (très rare en pratique).
- **BRIN** (PostgreSQL) — pour énormes tables ordonnées (logs).

Pour 95 % des cas, B-tree suffit.

---

## 4. `EXPLAIN` — mesurer et comprendre

### Théorie

`EXPLAIN` affiche le **plan d'exécution** prévu par le moteur. `EXPLAIN ANALYZE` **exécute** la requête et affiche les temps réels.

```sql
EXPLAIN ANALYZE
SELECT * FROM users WHERE email = 'alice@example.com';
```

Sortie typique :

```
Index Scan using idx_users_email on users  (cost=0.29..8.30 rows=1 width=72)
    (actual time=0.025..0.027 rows=1 loops=1)
    Index Cond: ((email)::text = 'alice@example.com'::text)
Planning Time: 0.123 ms
Execution Time: 0.040 ms
```

Lecture :

- **Index Scan** — l'index a été utilisé.
- **cost** — estimation du coût (basée sur les statistiques).
- **rows=1** — nombre estimé de lignes.
- **actual time** — temps réel.

### Sans index — comparaison

```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE name = 'Alice';
-- Seq Scan on users  (cost=0.00..18.50 rows=1 width=72) (actual time=0.020..0.150 rows=1 loops=1)
-- Filter: ...
-- Execution Time: 0.180 ms
```

**Seq Scan** = scan séquentiel de toute la table. Plus lent à grande échelle.

### Indicateurs à surveiller

- `Seq Scan` sur une grande table → peut-être besoin d'un index.
- `Sort` → ORDER BY non indexé.
- `Hash Join` vs `Nested Loop` → choix du moteur, dépend du volume.
- `Rows estimées vs réelles` très divergentes → statistiques à mettre à jour (`ANALYZE`).

### Mettre à jour les statistiques

```sql
ANALYZE users;       -- met à jour les stats sur cette table
VACUUM ANALYZE;       -- maintenance complète
```

Le planificateur dépend des statistiques. Sans elles, il choisit mal son plan.

### Outils visuels

- **explain.depesz.com** — colle ton plan EXPLAIN, obtient une visualisation.
- **pgMustard** — analyse automatique avec suggestions.
- **EXPLAIN dans pgAdmin / DBeaver** — vue graphique du plan.

---

## 5. Triggers — introduction

### Théorie

Un **trigger** est une procédure **automatiquement** exécutée par le SGBD en réaction à un événement (INSERT, UPDATE, DELETE) sur une table.

**Analogie.** Un système d'alarme. Une porte qui s'ouvre déclenche automatiquement un message. Pareil ici : un `UPDATE` peut déclencher un log d'audit, une mise à jour de cache, une validation supplémentaire.

### Exemple — `updated_at` automatique

```sql
-- Fonction qui met à jour la colonne
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger qui appelle la fonction avant chaque UPDATE
CREATE TRIGGER tg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

Désormais, **chaque `UPDATE` sur `users`** met automatiquement `updated_at` à `NOW()`. Plus besoin de le faire à la main dans chaque requête.

### Cas d'usage

- **Auto-update** de timestamps.
- **Auto-incrémentation** de versions.
- **Audit trail** (qui a modifié quoi quand).
- **Validation** complexe inexprimable en `CHECK`.
- **Sync** entre tables.

### Risques

- **Effet de surprise** — un `UPDATE` simple peut déclencher 5 actions invisibles.
- **Difficile à débugger**.
- **Coût caché** sur la performance.

Recommandation : **utiliser modérément**, pour des cas vraiment transverses (timestamps, audit). Pour la logique métier, préférer le code applicatif.

---

## 6. Procédures stockées — introduction

### Théorie

Une **procédure stockée** est du code SQL (avec extensions procédurales : variables, boucles, conditions) **stocké dans la base** et appelable comme une fonction.

```sql
CREATE OR REPLACE FUNCTION transfer_money(
    sender_id INT,
    receiver_id INT,
    amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    sender_balance NUMERIC;
BEGIN
    SELECT balance INTO sender_balance FROM accounts WHERE id = sender_id FOR UPDATE;
    IF sender_balance < amount THEN
        RETURN FALSE;
    END IF;
    UPDATE accounts SET balance = balance - amount WHERE id = sender_id;
    UPDATE accounts SET balance = balance + amount WHERE id = receiver_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Appel
SELECT transfer_money(1, 2, 100);
```

### Cas d'usage

- **Logique transactionnelle complexe** qui doit s'exécuter en bloc atomique côté DB.
- **Performance** : éviter les round-trips entre app et DB.
- **Réutilisation** entre plusieurs apps qui parlent à la même DB.

### Critiques

- **Couplage** fort à un SGBD spécifique (la syntaxe PL/pgSQL n'est pas portable).
- **Test difficile** (pas d'écosystème comme pytest).
- **Version control** moins fluide.

### Tendance

Les procédures stockées étaient **populaires dans les années 2000-2010** (oracle stack, .NET). En 2025, la majorité de la logique métier vit côté application (Python, Go, Node). Les procédures stockées restent utiles pour des cas spécifiques de **performance** ou de **cohérence**.

### Approfondissement

Sujet riche, approfondi au niveau Senior. Pour cette compétence Confirmé 2.5, savoir **lire** une procédure stockée et **comprendre** quand elle est appropriée suffit.

---

## 7. Fonctions string et date utiles

### Strings

```sql
-- Longueur
SELECT LENGTH('hello');           -- 5

-- Casse
SELECT UPPER('hello'), LOWER('HELLO');

-- Concaténation
SELECT 'hello' || ' ' || 'world';     -- standard SQL
SELECT CONCAT('hello', ' ', 'world');

-- Substring
SELECT SUBSTRING('hello world' FROM 7 FOR 5);   -- 'world'
SELECT LEFT('hello', 3);              -- 'hel'
SELECT RIGHT('hello', 3);             -- 'llo'

-- Trim
SELECT TRIM('  hello  ');             -- 'hello'
SELECT LTRIM('  hello'), RTRIM('hello  ');

-- Remplacement
SELECT REPLACE('hello world', 'world', 'SQL');   -- 'hello SQL'

-- Position
SELECT POSITION('lo' IN 'hello');     -- 4
SELECT STRPOS('hello', 'lo');         -- 4 (PostgreSQL)

-- Padding
SELECT LPAD('42', 5, '0');            -- '00042'
SELECT RPAD('42', 5, '.');             -- '42...'
```

### Dates

```sql
-- Date / time courants
SELECT NOW();                          -- TIMESTAMP avec timezone
SELECT CURRENT_DATE;                   -- DATE
SELECT CURRENT_TIME;                   -- TIME

-- Extraction de parties
SELECT EXTRACT(YEAR FROM NOW());       -- 2026
SELECT EXTRACT(MONTH FROM NOW());      -- 5
SELECT EXTRACT(DOW FROM NOW());        -- jour de la semaine (0=dim)

-- Troncature
SELECT DATE_TRUNC('month', NOW());     -- 2026-05-01 00:00:00
SELECT DATE_TRUNC('day', NOW());

-- Arithmétique
SELECT NOW() - INTERVAL '7 days';
SELECT NOW() + INTERVAL '2 months';
SELECT '2026-05-15'::DATE + 30;        -- ajoute 30 jours

-- Format
SELECT TO_CHAR(NOW(), 'YYYY-MM-DD');   -- '2026-05-15'
SELECT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI');

-- Parsing
SELECT TO_DATE('2026-05-15', 'YYYY-MM-DD');
SELECT TO_TIMESTAMP('15/05/2026 14:30', 'DD/MM/YYYY HH24:MI');
```

### Différences entre SGBD

Ces fonctions varient légèrement :

- `NOW()` (PG, MySQL) vs `GETDATE()` (SQL Server) vs `SYSDATE` (Oracle).
- `EXTRACT` est standard ; `DATE_PART` (PG) est synonyme.
- `TO_CHAR` (PG, Oracle) vs `DATE_FORMAT` (MySQL) vs `FORMAT` (SQL Server).

Consulter la doc du SGBD avant de coder.

---

## 8. Exercices pratiques

### Exercice 1 — Sous-requêtes (≈ 30 min)

1. Trouver tous les users qui ont passé une commande dont le total dépasse leur panier moyen.
2. Pour chaque user, trouver le total de sa dernière commande (sous-requête scalaire dans SELECT).
3. Lister les products qui n'apparaissent dans **aucune** order_item (utiliser `NOT EXISTS`).
4. Liste des 10 users avec le panier moyen le plus élevé (sous-requête dans FROM).

### Exercice 2 — CTE (≈ 30 min)

Réécrire chacune des 4 requêtes de l'exercice 1 en utilisant des CTE (`WITH`). Comparer la lisibilité.

**Bonus** : une CTE récursive qui parcourt une hiérarchie d'employés sur 5 niveaux.

### Exercice 3 — Création d'index (≈ 30 min)

Sur une table `orders` de 100 000 lignes :

1. Exécuter une requête : `SELECT * FROM orders WHERE user_id = 42 AND status = 'paid'`.
2. `EXPLAIN ANALYZE` — noter le temps et le type de scan.
3. Créer un index `CREATE INDEX idx_orders_user_status ON orders(user_id, status)`.
4. Refaire `EXPLAIN ANALYZE` — comparer.
5. Modifier la requête : `WHERE status = 'paid'` seul → l'index est-il utilisé ?
6. Conclure sur l'**ordre** des colonnes dans un index composite.

### Exercice 4 — Trigger updated_at (≈ 25 min)

1. Créer une table `articles(id, title, content, created_at, updated_at)`.
2. Créer un trigger qui met `updated_at = NOW()` à chaque UPDATE.
3. Insérer 3 articles, observer `created_at` et `updated_at`.
4. Faire un `UPDATE` sur un article — vérifier que `updated_at` change.
5. Vérifier que `INSERT` n'affecte pas `updated_at`.

### Exercice 5 — Fonctions string et date (≈ 25 min)

Sur une table users avec `name`, `email`, `created_at` :

1. Lister les users avec leur `email` masqué : `a****@x.y` (4 caractères masqués au milieu).
2. Lister les users dont le compte a **plus de 6 mois**.
3. Compter les inscriptions par **mois calendaire** (utiliser `DATE_TRUNC`).
4. Trouver les users dont le `name` se termine par "son" (insensible à la casse).

---

## 9. Mini-défi de synthèse — optimisation d'une requête lente (≈ 1,5 à 2 heures)

### Setup

Créer une base avec deux tables peuplées :

- `users(id, name, email, country, created_at)` — 50 000 lignes.
- `orders(id, user_id, total, status, created_at)` — 500 000 lignes.

Pas d'index autre que les PK.

### Requête lente cible

```sql
SELECT
    u.country,
    COUNT(DISTINCT u.id) AS unique_customers,
    SUM(o.total) AS revenue
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE o.status = 'paid'
  AND o.created_at >= NOW() - INTERVAL '90 days'
GROUP BY u.country
ORDER BY revenue DESC;
```

### Mission

1. **Mesurer** l'état initial : `EXPLAIN ANALYZE`, noter le temps total et le plan.
2. **Identifier** au moins **3 axes** d'optimisation possibles :
   - Index sur `orders.status`.
   - Index sur `orders.created_at`.
   - Index composite `orders(status, created_at)`.
   - Refactor avec CTE.
   - Vue matérialisée si la requête est répétée.
3. **Appliquer** chaque optimisation **une à une**, mesurer.
4. **Documenter** chaque essai :
   - Temps avant.
   - Optimisation appliquée.
   - Temps après.
   - Gain (%).
5. **Choisir** la meilleure combinaison.
6. **Tester** que les autres requêtes courantes ne sont pas dégradées par les index ajoutés.

### Livrables

- Un fichier `OPTIMIZATION.md` :
  - Plan initial.
  - 3+ tentatives documentées (avec EXPLAIN ANALYZE).
  - Décision finale et justification.
  - Cost-benefit des index (espace disque, ralentissement des writes).

### Critères de validation

- [ ] Gain de **≥ 10×** sur la requête cible (typique : passer de 2 s à < 200 ms).
- [ ] Les index créés sont **justifiés** et nommés correctement.
- [ ] Au moins **une optimisation rejetée** documentée (apprend à mesurer, pas à empiler).
- [ ] La doc est lisible par un développeur qui reprendrait le sujet dans 6 mois.

---

## 10. Auto-évaluation

Le module M12 est validé lorsque :

- [ ] L'apprenant écrit une sous-requête dans `WHERE`, `FROM` et `SELECT`.
- [ ] Il utilise `EXISTS` / `NOT EXISTS` à bon escient.
- [ ] Il écrit une CTE pour clarifier une requête complexe.
- [ ] Il sait écrire une CTE récursive pour une hiérarchie.
- [ ] Il crée des index et choisit l'ordre des colonnes composites.
- [ ] Il interprète un `EXPLAIN ANALYZE` (Seq Scan vs Index Scan, cost, time).
- [ ] Il comprend l'utilité d'un trigger et d'une procédure stockée.
- [ ] Il maîtrise les fonctions string et date courantes.
- [ ] Le mini-défi d'optimisation atteint un gain ≥ 10×.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : requêtes imbriquées, index (intérêt et création), création d'un trigger (introduit), procédure stockée (introduite), fonctions string et date.

---

## 11. Ressources complémentaires

- **Documentation PostgreSQL** — _Indexes_ : [postgresql.org/docs/current/indexes.html](https://www.postgresql.org/docs/current/indexes.html).
- **Documentation PostgreSQL** — _WITH Queries (CTE)_ : [postgresql.org/docs/current/queries-with.html](https://www.postgresql.org/docs/current/queries-with.html).
- **Documentation PostgreSQL** — _EXPLAIN_ : [postgresql.org/docs/current/sql-explain.html](https://www.postgresql.org/docs/current/sql-explain.html).
- **Use The Index, Luke!** : [use-the-index-luke.com](https://use-the-index-luke.com/). LA référence sur les index.
- **PostgreSQL Wiki** — _SlowQueryQuestions_ : checklist standard pour debugger une requête lente.
- **pgMustard** — analyse automatique de plans EXPLAIN.
- **Markus Winand** — _SQL Performance Explained_. Livre court et excellent sur la performance des index.
- **PostgreSQL Tutorial** — sections _Triggers_, _Stored Procedures_, _Date Functions_, _String Functions_.

---

## 12. Conclusion du parcours SQL

Le parcours SQL est complet : **M1 → M12**. Le mini-projet final demandé dans `parcours.md` (modélisation et implémentation d'un schéma métier MCD → MLD → SQL + migrations versionnées) peut maintenant être attaqué en mobilisant l'ensemble des concepts.

Items du glossaire SQL N1 + N2 + partiel N3 = **niveau 2.5 (Confirmé)** atteint. Le niveau Senior (3) est explicitement **ignoré** dans `gogetit.md` pour SQL — on s'arrête là.
