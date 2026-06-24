# M7 — Transactions

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est une **transaction** et l'**ACID**.
- Utiliser **`BEGIN`** / **`COMMIT`** / **`ROLLBACK`** pour des opérations multi-étapes.
- Utiliser des **`SAVEPOINT`** pour des annulations partielles.
- Connaître les **niveaux d'isolation** principaux et leur impact.
- Reconnaître les **deadlocks** et les conflits de concurrence.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M6 SQL terminés.

---

## 1. Pourquoi les transactions ?

### Le problème — virement bancaire

```sql
UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- débit Alice
-- 💥 crash serveur
UPDATE accounts SET balance = balance + 100 WHERE id = 2;   -- crédit Bob
```

Sans transaction, si le crash survient entre les deux UPDATE, **Alice a perdu 100 €** mais Bob ne les a pas reçus. La banque perd 100 € — c'est inacceptable.

### La solution

Une **transaction** regroupe plusieurs opérations en une **unité atomique** : soit **toutes** les opérations réussissent, soit **aucune** n'est appliquée.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

Si le crash survient avant `COMMIT`, le SGBD **annule** les modifications au redémarrage. État final : comme si rien n'avait commencé.

**Analogie.** Une livraison express. Soit tout arrive intact, soit rien n'est livré. Pas de demi-livraison où on perd la moitié des paquets sur la route.

---

## 2. Propriétés ACID

### Théorie

Les SGBD relationnels garantissent **ACID** pour chaque transaction :

- **A**tomicity (atomicité) — tout ou rien. La transaction est indivisible.
- **C**onsistency (cohérence) — la base reste dans un état valide (contraintes respectées) avant et après.
- **I**solation — deux transactions concurrentes ne se voient pas l'une l'autre (selon le niveau d'isolation).
- **D**urability (durabilité) — une fois committé, le résultat survit à un crash matériel.

### Analogie ACID

- **A** = unicité du choix (commande passée OU annulée, jamais "à moitié").
- **C** = les règles du jeu sont toujours respectées (solde ≥ 0).
- **I** = chaque caissier ne voit pas la transaction en cours du voisin (jusqu'à ce qu'il valide).
- **D** = une fois le ticket imprimé, l'achat est définitif même si le système plante.

### Coût

ACID n'est **pas gratuit**. Les SGBD doivent :

- **Logger** chaque opération (Write-Ahead Log) avant de l'appliquer (durabilité).
- **Verrouiller** des ressources pendant l'exécution (isolation).
- **Vérifier** les contraintes après chaque mutation (cohérence).

C'est pourquoi les bases NoSQL (DynamoDB, MongoDB en mode default) sacrifient parfois certaines de ces garanties pour gagner en performance et scaling horizontal.

---

## 3. `BEGIN`, `COMMIT`, `ROLLBACK`

### Syntaxe standard

```sql
BEGIN;                              -- démarre la transaction
UPDATE ...;
INSERT ...;
DELETE ...;
COMMIT;                             -- valide
-- ou
ROLLBACK;                           -- annule tout
```

### Variantes selon SGBD

- **PostgreSQL** : `BEGIN` ou `START TRANSACTION` (synonyme standard).
- **MySQL** : `START TRANSACTION` ou `BEGIN`. Attention : certaines opérations DDL **forcent un commit implicite**.
- **SQL Server** : `BEGIN TRANSACTION` (ou `BEGIN TRAN`).

### Auto-commit par défaut

Par défaut, **chaque requête est sa propre transaction** (auto-commit). Un `UPDATE` est committé immédiatement après son exécution.

Pour grouper plusieurs requêtes, il faut **explicitement** ouvrir une transaction avec `BEGIN`.

Côté client (psycopg, SQLAlchemy, JDBC), on peut désactiver l'auto-commit pour démarrer automatiquement une transaction au premier statement.

### Cas typique — opération multi-tables

```sql
BEGIN;

-- Créer la commande
INSERT INTO orders (user_id, total, status)
VALUES (42, 100.00, 'paid')
RETURNING id;
-- → renvoie order_id = 17

-- Créer les lignes de commande
INSERT INTO order_items (order_id, product_id, quantity)
VALUES (17, 1, 2);
INSERT INTO order_items (order_id, product_id, quantity)
VALUES (17, 5, 1);

-- Décrémenter le stock
UPDATE products SET stock = stock - 2 WHERE id = 1;
UPDATE products SET stock = stock - 1 WHERE id = 5;

-- Tout est cohérent → commit
COMMIT;
```

Si l'un des UPDATE échoue (stock insuffisant via CHECK), un `ROLLBACK` annule **tout** :

```sql
ROLLBACK;
-- L'order n'a jamais été créé, les stocks restent intacts.
```

### Pattern try/catch (côté client)

En Python avec psycopg :

```python
conn = psycopg.connect(...)
try:
    with conn:                  # context manager = BEGIN ... COMMIT/ROLLBACK
        with conn.cursor() as cur:
            cur.execute("INSERT INTO orders ...")
            cur.execute("UPDATE products ...")
    # commit automatique
except Exception as e:
    # rollback automatique si exception levée dans le with
    raise
```

Le `with conn:` gère implicitement le commit / rollback. C'est l'idiome moderne.

---

## 4. `SAVEPOINT` — annulation partielle

### Théorie

Dans une longue transaction, on peut poser des **points de sauvegarde** intermédiaires. Si une opération échoue, on revient au dernier savepoint plutôt qu'au début.

```sql
BEGIN;

INSERT INTO orders ...;

SAVEPOINT before_stock_update;

UPDATE products SET stock = stock - 100 WHERE id = 1;
-- Oh non, stock insuffisant ?

ROLLBACK TO SAVEPOINT before_stock_update;
-- L'order existe encore, le stock est intact, on peut tenter autre chose.

-- Décrémenter de 50 seulement
UPDATE products SET stock = stock - 50 WHERE id = 1;
COMMIT;
```

### Cas d'usage

- **Boucles** où certains éléments peuvent échouer sans annuler le tout.
- **Sous-transactions** logiques dans une grosse opération.
- **Imports** par batch : un batch foireux ne tue pas l'import entier.

### Limitations

Les `SAVEPOINT` consomment de la mémoire et compliquent les locks. À utiliser modérément. Pour la majorité des cas, une transaction simple `BEGIN ... COMMIT` ou `ROLLBACK` suffit.

---

## 5. Niveaux d'isolation

### Le problème

Quand deux transactions tournent **en même temps**, elles peuvent se gêner mutuellement. Quatre **anomalies** classiques :

| Anomalie                | Description                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Dirty read**          | T1 lit une donnée non encore committée par T2. Si T2 rollback, T1 a vu une donnée fantôme.                         |
| **Non-repeatable read** | T1 lit X, T2 modifie X et commit, T1 relit X et obtient une valeur différente.                                     |
| **Phantom read**        | T1 fait un SELECT qui retourne N lignes, T2 insère une ligne matchante, T1 refait le SELECT et obtient N+1 lignes. |
| **Lost update**         | T1 et T2 modifient X simultanément, un des deux updates est perdu.                                                 |

### Les 4 niveaux d'isolation (SQL standard)

| Niveau               | Dirty read | Non-repeat. | Phantom                    | Lost update   |
| -------------------- | ---------- | ----------- | -------------------------- | ------------- |
| **READ UNCOMMITTED** | Possible   | Possible    | Possible                   | Possible      |
| **READ COMMITTED**   | Évité      | Possible    | Possible                   | Possible      |
| **REPEATABLE READ**  | Évité      | Évité       | Possible (sauf PostgreSQL) | Évité dans PG |
| **SERIALIZABLE**     | Évité      | Évité       | Évité                      | Évité         |

Plus le niveau est strict, plus c'est sûr — mais plus **coûteux** en performance et plus de **conflits**.

### Par défaut selon SGBD

| SGBD             | Défaut          |
| ---------------- | --------------- |
| **PostgreSQL**   | READ COMMITTED  |
| **MySQL InnoDB** | REPEATABLE READ |
| **Oracle**       | READ COMMITTED  |
| **SQL Server**   | READ COMMITTED  |

### Changer le niveau

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ou
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

### Heuristique

- **READ COMMITTED** (défaut PG) suffit pour 95 % des apps.
- **SERIALIZABLE** pour les opérations critiques (virements, inventaire) où on veut une **garantie absolue** de sérialisabilité.
- **READ UNCOMMITTED** très rarement (rapports approximatifs sur grosses tables).

### Approfondissement

Sujet riche, abordé en profondeur dans des cours de bases de données universitaires. Pour cette compétence Confirmé, savoir que les niveaux existent et le défaut de son SGBD suffit. Le niveau Senior approfondit.

---

## 6. Verrous et deadlocks

### Verrous (locks)

Pour garantir l'isolation, le SGBD pose des **verrous** sur les lignes ou tables manipulées. Deux types principaux :

- **Verrou partagé (S)** — plusieurs transactions peuvent lire simultanément.
- **Verrou exclusif (X)** — une seule transaction peut écrire ; aucune autre ne peut lire ou écrire.

Une transaction qui veut un verrou exclusif sur une ligne déjà verrouillée **attend**.

### Deadlock

Deux transactions s'attendent **mutuellement** :

```
T1: verrouille ligne A, demande ligne B
T2: verrouille ligne B, demande ligne A
T1 attend T2, T2 attend T1 → blocage infini
```

Le SGBD **détecte** ce deadlock après un timeout et **annule l'une des deux transactions** (en général la plus jeune). Le client reçoit une erreur "deadlock detected" et doit retry.

### Éviter les deadlocks

- **Toujours acquérir les verrous dans le même ordre** dans toutes les transactions.
- **Garder les transactions courtes** (moins de temps = moins de chance de conflit).
- **Retry en cas d'erreur deadlock** : pattern client classique avec exponential backoff.

### `SELECT ... FOR UPDATE`

Pour verrouiller des lignes lues afin de les modifier ensuite (sans laisser une autre transaction les modifier entre-temps) :

```sql
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;     -- pose un verrou X
-- ... lire la valeur, faire un calcul, décider ...
UPDATE accounts SET balance = ... WHERE id = 1;
COMMIT;
```

C'est l'outil pour les sections critiques en concurrence.

---

## 7. Exercices pratiques

### Exercice 1 — Transaction basique (≈ 20 min)

Créer une table `accounts(id, owner, balance)` avec 2 comptes : Alice (100 €) et Bob (50 €).

Implémenter un **virement de 30 € d'Alice à Bob** :

1. Dans une transaction explicite.
2. Vérifier qu'avant `COMMIT`, le solde n'est visible que dans cette transaction.
3. `COMMIT`.
4. Vérifier les soldes finaux.

### Exercice 2 — ROLLBACK simple (≈ 15 min)

1. `BEGIN`.
2. Faire 3 modifications (UPDATE, INSERT, DELETE).
3. Constater les modifications via `SELECT` dans la même session.
4. `ROLLBACK`.
5. Vérifier que **rien n'a changé**.

### Exercice 3 — Atomicité multi-tables (≈ 30 min)

Avec les tables `orders(id, total)` et `order_items(order_id, product_id, qty)` et `products(id, stock)` :

Implémenter la création d'une commande de 2 produits différents :

1. Dans une transaction.
2. Insérer dans `orders`, récupérer l'id avec `RETURNING`.
3. Insérer 2 lignes dans `order_items`.
4. Décrémenter le `stock` de chaque produit.
5. Si l'un des stocks deviendrait négatif → **ROLLBACK** ; sinon → **COMMIT**.

Tester les deux cas (stock suffisant / insuffisant).

### Exercice 4 — SAVEPOINT (≈ 25 min)

Dans une transaction :

1. Insérer 3 lignes dans `users`.
2. Poser un `SAVEPOINT` après chaque insertion.
3. Au milieu, insérer une ligne invalide (qui viole une contrainte).
4. `ROLLBACK TO SAVEPOINT` au dernier valide.
5. Insérer une ligne valide à la place.
6. `COMMIT`.

Vérifier l'état final.

### Exercice 5 — Concurrence et `FOR UPDATE` (≈ 30 min)

Ouvrir **deux sessions** SQL parallèles (deux onglets `psql` ou deux clients).

Session A :

```sql
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- ne pas commit tout de suite
```

Session B :

```sql
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- ← attend la session A
```

1. Constater que la session B est bloquée.
2. Faire un `COMMIT` dans la session A.
3. Constater que la session B reprend.

### Exercice 6 — Niveau d'isolation (≈ 25 min)

En PostgreSQL, ouvrir deux sessions. Tester le comportement par défaut (READ COMMITTED) :

1. Session A : `BEGIN; UPDATE users SET name = 'Test' WHERE id = 1;` (pas de commit).
2. Session B : `BEGIN; SELECT name FROM users WHERE id = 1;` → quelle valeur lue ?
3. Session A : `COMMIT;`.
4. Session B : refaire le `SELECT` → quelle valeur maintenant ?

Recommencer avec `BEGIN ISOLATION LEVEL REPEATABLE READ` et comparer.

---

## 8. Mini-défi de synthèse (≈ 1 heure)

Implémenter un **système de réservation de billets de spectacle** avec contrôle de concurrence.

### Schéma

```sql
CREATE TABLE shows (id, title, total_seats, available_seats);
CREATE TABLE reservations (id, show_id, customer, qty, created_at);
```

### Procédure de réservation atomique

```sql
BEGIN;
-- 1. Lock la show
SELECT available_seats FROM shows WHERE id = ? FOR UPDATE;
-- 2. Vérifier qu'il y a assez de places
-- 3. Si oui : insérer la réservation + décrémenter available_seats
-- 4. Si non : ROLLBACK et signaler
COMMIT;
```

### Test

1. Insérer un spectacle avec 100 places disponibles.
2. Tester 5 réservations consécutives qui passent.
3. Tester une réservation qui demande plus que disponible — vérifier qu'elle est rejetée proprement.
4. **Bonus** : tester avec 2 sessions concurrentes qui tentent de réserver simultanément les dernières places. Avec `FOR UPDATE`, la concurrence doit être gérée sans surventes.

### Validation

- [ ] Toute opération multi-étape est dans une transaction.
- [ ] Aucune survente possible même en concurrence (vérifié avec 2 sessions).
- [ ] `ROLLBACK` clean en cas d'échec (pas de réservation orpheline).
- [ ] `available_seats` reste cohérent avec la somme des réservations.

---

## 9. Auto-évaluation

Le module M7 est validé lorsque :

- [ ] L'apprenant explique ACID et donne une analogie pour chaque lettre.
- [ ] Il écrit un `BEGIN ... COMMIT/ROLLBACK` de tête.
- [ ] Il utilise un `SAVEPOINT` dans une transaction longue.
- [ ] Il connaît les 4 niveaux d'isolation et le défaut de son SGBD.
- [ ] Il comprend ce qu'est un deadlock et comment l'éviter (acquérir verrous dans le même ordre).
- [ ] Il utilise `SELECT ... FOR UPDATE` pour les sections critiques.
- [ ] Le mini-défi de réservation est implémenté et résiste à la concurrence.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : `transaction`, `commit`, `rollback`.

---

## 10. Ressources complémentaires

- **Documentation PostgreSQL** — _Transactions_ : [postgresql.org/docs/current/tutorial-transactions.html](https://www.postgresql.org/docs/current/tutorial-transactions.html).
- **Documentation PostgreSQL** — _Concurrency Control_ : [postgresql.org/docs/current/mvcc.html](https://www.postgresql.org/docs/current/mvcc.html). Détaillé, pour aller plus loin sur l'isolation.
- **Use The Index, Luke!** — _Concurrency Control_ : [use-the-index-luke.com](https://use-the-index-luke.com/). Bonnes pratiques pratiques.
- **Martin Kleppmann** — _Designing Data-Intensive Applications_, chapitre 7 (_Transactions_). Référence du domaine.
- **MySQL** — _InnoDB Locking and Transaction Model_ : [dev.mysql.com/doc/refman/8.0/en/innodb-locking-transaction-model.html](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-transaction-model.html).
- **Jim Gray** — _The Transaction Concept: Virtues and Limitations_ (1981). Le papier fondateur.
