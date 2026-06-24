# M2 — Moteur de réconciliation

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est le **virtual DOM** et **pourquoi** React l'utilise.
- Décrire l'**algorithme de diffing** de React (heuristique O(n)).
- Comprendre comment les **`key`** affectent la réconciliation.
- Tracer un rendu via **React DevTools Profiler** et identifier les rendus inutiles.
- Lire et raisonner sur un **arbre de composants** comme React le voit.

## Durée estimée

0,75 jour.

## Pré-requis

- M1 React terminé.

---

## 1. Pourquoi un virtual DOM ?

### Le problème du DOM réel

Le DOM (Document Object Model) est l'API du navigateur pour manipuler la page. Modifier le DOM est **coûteux** :

- Chaque modification déclenche un **recalcul du layout** (positions, tailles).
- Si la modification est visuelle, le navigateur **repeint** la zone affectée.
- Les modifications successives ne sont pas optimisées : 1000 inserts = 1000 recalculs.

Or une app React typique recalcule des UI **à chaque changement d'état**. Si chaque setState devait toucher 50 éléments du DOM, l'app serait lente.

### La solution React

React maintient une **représentation en mémoire** de ce que l'UI devrait être : le **virtual DOM**. À chaque rendu, il :

1. Construit un nouvel **arbre virtuel** à partir du JSX.
2. **Compare** ce nouvel arbre avec le précédent (diffing).
3. Calcule l'**ensemble minimal** de modifications DOM réelles.
4. Applique ces modifications en **un seul batch**.

**Analogie.** Un brouillon que tu écris avant de recopier au propre. Tu ratures, tu rajoutes, tu réécris — sur le brouillon. Quand le brouillon est satisfaisant, tu **recopies** sur le papier final, **une seule fois**, sans repasser sur les zones inchangées.

### Bénéfices

- **Performance** — un batch DOM remplace N updates indépendants.
- **Déclaratif** — on décrit l'UI **comme elle devrait être**, pas les opérations pour y arriver.
- **Cross-platform** — le virtual DOM peut être réconcilié vers le DOM web, vers React Native (vues natives), vers PDF, etc.

### Coût

Le virtual DOM **n'est pas gratuit** :

- À chaque rendu, React reconstruit un arbre JS.
- La comparaison parcourt l'arbre.
- Sur des arbres énormes (>10 000 nœuds), le coût peut dépasser le bénéfice.

C'est pourquoi les hooks de performance (`useMemo`, `useCallback`, voir M3) existent : éviter les reconstructions inutiles.

---

## 2. L'algorithme de diffing

### Le problème théorique

Comparer deux arbres avec un algorithme optimal est en **O(n³)** (n nœuds par arbre). Pour 1000 nœuds, ça ferait un milliard d'opérations. Inutilisable.

### Les deux heuristiques de React

React contourne le problème avec **deux hypothèses simplificatrices** qui ramènent à **O(n)** :

1. **Deux éléments de types différents produisent des arbres différents.** Si la racine change de type (`<div>` → `<span>`), React **jette** tout le sous-arbre et reconstruit. Pas de tentative de "réutilisation intelligente".
2. **Les listes d'enfants sont stables si les `key` le sont.** Pour les listes, React utilise les `key` comme identité — pas la position.

Ces deux règles couvrent **99 %** des cas réels en pratique. Quand elles ne suffisent pas, on en paie le prix (rendu plus coûteux), mais elles permettent à React de rester rapide en moyenne.

### Exemples concrets

#### Changement de type → reconstruction totale

```jsx
// Avant
<div>
  <Counter />
</div>

// Après
<span>
  <Counter />
</span>
```

`Counter` est **démonté puis remonté** — son état interne est perdu. C'est le coût de la règle 1.

#### Même type → diff récursif

```jsx
// Avant
<div className="red" title="hello">Hi</div>

// Après
<div className="blue" title="hello">Hi</div>
```

React garde le `<div>`, met à jour seulement `className`. `title` et le texte sont inchangés.

#### Listes — l'importance des `key`

```jsx
// Avant
<ul>
  <li>A</li>
  <li>B</li>
</ul>

// Après — on insère "Z" en tête
<ul>
  <li>Z</li>
  <li>A</li>
  <li>B</li>
</ul>
```

**Sans `key`** : React compare par position. Il voit `A → Z`, `B → A`, et ajoute `B` à la fin. Trois mutations.

**Avec `key`** (`<li key="a">A</li>` etc.) : React identifie que `a` et `b` existent toujours. Il insère seulement `z` en tête. Une mutation.

### Démontage de composant — perte d'état

```jsx
function App() {
  return showA ? <Counter /> : <Counter />; // 2 lignes identiques visuellement
}
```

Quand `showA` change, est-ce le **même** `Counter` ou un nouveau ? React regarde **la position** dans l'arbre — si elle est identique, c'est le même. Sinon, démontage + remontage = état perdu.

**Cas piégeux** :

```jsx
{
  condition ? <Counter /> : null;
}
{
  !condition ? <Counter /> : null;
}
```

Selon `condition`, le `Counter` apparaît à des positions différentes — donc son état est **perdu** à chaque switch.

Solution : **rendre la structure stable**.

```jsx
<Counter visible={condition} />
```

---

## 3. Le rôle des `key`

### Théorie

Une `key` est l'**identité stable** d'un élément dans une liste. React s'en sert pour suivre quels éléments existent encore, lesquels sont ajoutés, lesquels sont supprimés — indépendamment de leur position.

**Analogie.** Le numéro étudiant. Il suit l'étudiant même s'il change de groupe, de classe, de file d'attente. Sans numéro, on reconnaît par position — et si quelqu'un se glisse devant, on confond tout le monde.

### Règles d'or

1. **Stable** — la `key` ne change pas entre rendus pour la même donnée logique.
2. **Unique parmi les frères** — pas globalement, mais au sein de la même liste.
3. **Pas l'index** — sauf si la liste est **strictement append-only et jamais réordonnée**.

### Anti-pattern — index comme key

```jsx
{
  items.map((item, idx) => (
    <Row key={idx} item={item} /> // ✗ piège si tri / filtre
  ));
}
```

Quand l'utilisateur trie ou filtre la liste, les positions changent mais les `key` (= index) restent **0, 1, 2...**. React croit qu'aucun élément n'a bougé et réutilise les composants à la mauvaise place. L'**état interne** des composants (sélection, input non submitted) suit le **mauvais** item.

### Bon usage — id stable

```jsx
{
  items.map((item) => <Row key={item.id} item={item} />);
}
```

`item.id` suit la donnée. Si l'item se déplace, sa `key` le suit, et son état le suit aussi.

### Cas pratiques de bugs

```jsx
// ✗ bug
function TodoList({ todos }) {
  return todos.map((todo, idx) => (
    <TodoItem key={idx} todo={todo} /> // index = key
  ));
}

// Comportement bizarre :
// - L'utilisateur tape dans l'input de "buy milk"
// - On supprime "wash car" (au-dessus)
// - L'input se vide ? Non, il garde sa valeur — mais elle est maintenant
//   "rattachée" au mauvais todo dans le rendu réutilisé.
```

Solution : `key={todo.id}`.

---

## 4. React DevTools Profiler

### Installation

Extension navigateur **React Developer Tools** (Chrome, Firefox, Edge). Une fois installée, deux onglets apparaissent dans les DevTools : **Components** et **Profiler**.

### Components — l'arbre tel que React le voit

L'onglet _Components_ affiche l'arbre de composants en temps réel. Pour chaque composant :

- Ses **props** actuelles.
- Son **état** (`useState`, `useReducer`).
- Ses **hooks** dans l'ordre d'appel.
- Sa **clé** (`key`) si elle est dans une liste.

Utile pour vérifier que l'état est bien à l'endroit attendu et que les `key` sont stables.

### Profiler — mesurer les rendus

L'onglet _Profiler_ enregistre les rendus pendant une session. À chaque interaction, il indique :

- Quels composants ont **re-rendu**.
- Combien de **temps** chacun a pris.
- **Pourquoi** un composant a re-rendu (props changées, state changé, parent re-rendu, hook changé).

### Identifier les rendus inutiles

Activer **Highlight updates** dans la config du Profiler. Chaque composant qui rend est **encadré en couleur** au moment du rendu.

Anti-symptôme : un sous-arbre clignote alors qu'on n'a rien changé dans sa zone. C'est un **rendu inutile** — soit le parent change, soit une prop change pour rien, soit une référence n'est pas stable.

### Cas typique — fonction inline

```jsx
function Parent() {
  return <Child onClick={() => doSomething()} />;
  //                  ^^^^^^^^^^^^^^^^^^^^^^^ nouvelle fonction à chaque rendu
}
```

Si `Child` est `memo`isé, la prop `onClick` étant **différente** à chaque rendu, `memo` ne sert à rien — `Child` re-rend quand même. Solution : `useCallback` (cf. M3).

---

## 5. Tracer un rendu en pratique

### Procédure

1. Créer un composant simple avec un compteur et une liste enfant.
2. Ouvrir React DevTools → Profiler.
3. Cliquer **Start profiling**.
4. Interagir (incrémenter le compteur).
5. **Stop**.
6. Inspecter le flamegraph : qui a re-rendu, pourquoi, combien de temps.

### Composant volontairement non optimisé

```jsx
function HeavyList({ items }) {
  return (
    <ul>
      {items.map((item, idx) => (
        <ExpensiveRow key={idx} item={item} /> // ✗ key = idx
      ))}
    </ul>
  );
}

function ExpensiveRow({ item }) {
  // Simule un calcul lourd
  const start = performance.now();
  while (performance.now() - start < 5) {
    /* spin */
  }
  return <li>{item.label}</li>;
}

function App() {
  const [count, setCount] = useState(0);
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));

  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>+ ({count})</button>
      <HeavyList items={items} />
    </>
  );
}
```

Trois problèmes à observer :

1. **`items`** est recréé à chaque rendu (nouvel array à chaque appel `App`).
2. **`key={idx}`** au lieu de `item.id`.
3. **`ExpensiveRow`** simule 5 ms par render — 100 lignes × 5 ms = 500 ms par mise à jour.

Le Profiler doit montrer un cycle de rendu de plusieurs centaines de millisecondes à chaque clic.

### Corrections (préfigurent M3)

```jsx
const ExpensiveRow = memo(({ item }) => {
  const start = performance.now();
  while (performance.now() - start < 5) {
    /* spin */
  }
  return <li>{item.label}</li>;
});

function App() {
  const [count, setCount] = useState(0);
  const items = useMemo(
    () =>
      Array.from({ length: 100 }, (_, i) => ({ id: i, label: `Item ${i}` })),
    [],
  );

  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>+ ({count})</button>
      <HeavyList items={items} />
    </>
  );
}

function HeavyList({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <ExpensiveRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
```

Au prochain clic, le Profiler montre **0 ms** sur la liste — seul le bouton re-rend.

---

## 6. Exercices pratiques

### Exercice 1 — Diff sans / avec key (≈ 20 min)

Implémenter une liste de 3 items avec un bouton qui **insère un item en tête** :

1. Version A : `key={idx}`.
2. Version B : `key={item.id}`.

Ajouter un `<input>` dans chaque ligne. Taper dans l'input du 2ᵉ item, puis cliquer sur "insérer en tête". Observer :

- Version A : l'input garde la valeur **à la mauvaise place**.
- Version B : l'input suit son item correctement.

### Exercice 2 — Démontage par changement de type (≈ 20 min)

Soit :

```jsx
function App() {
  const [bold, setBold] = useState(false);
  return bold ? (
    <strong>
      <Counter />
    </strong>
  ) : (
    <em>
      <Counter />
    </em>
  );
}
```

Avec un `Counter` qui utilise `useState(0)`. Vérifier qu'à chaque toggle de `bold`, le compteur **se réinitialise** à 0.

Corriger pour préserver l'état (indice : structure stable + classe / inline style).

### Exercice 3 — Tracer avec Profiler (≈ 30 min)

Sur le composant `HeavyList` de la section 5 :

1. Profiler une interaction → noter le temps total de rendu.
2. Activer Highlight updates → identifier visuellement les rendus inutiles.
3. Appliquer une optimisation parmi : `memo`, stabilisation des `items` via `useMemo`, fix des `key`.
4. Re-profiler. Comparer.

Documenter en commentaire **quelle optimisation a apporté quoi**.

### Exercice 4 — Lire le "Why did this render?" (≈ 25 min)

Activer dans le Profiler l'option **Record why each component rendered**.

Sur une app existante (perso ou pro), faire 5 interactions différentes. Pour chaque rendu signalé, lire la raison :

- Props changed.
- State changed.
- Hook changed.
- Parent rendered.

Identifier au moins **2 rendus** où la raison était **non justifiée** (la prop a changé alors qu'elle aurait dû être stable). Comprendre pourquoi.

### Exercice 5 — Structure stable (≈ 25 min)

Soit :

```jsx
function App() {
  const [logged, setLogged] = useState(false);

  if (logged) {
    return (
      <div>
        <Header />
        <Dashboard />
      </div>
    );
  }
  return (
    <div>
      <Header />
      <LoginForm />
    </div>
  );
}
```

`Header` peut maintenir un état (timer, suggestions). Lors du toggle `logged`, est-il préservé ?

Refactorer pour rendre `Header` **stable** entre les deux branches (indice : `Header` toujours rendu, contenu après changeant).

---

## 7. Mini-défi de synthèse (≈ 1,5 heure)

Construire une **page de liste de tâches avec tri et filtre** :

- 50 todos générés aléatoirement (id, label, priority, done).
- 3 boutons de tri (par priority, par label, par id).
- 1 filtre "show only done".
- Chaque todo a un `<input>` éditable et un bouton "delete".

**Critères de performance** :

- [ ] `key={todo.id}` partout.
- [ ] Aucun rendu inutile lors d'un tri (les composants non affectés ne re-rendent pas — vérifier dans le Profiler).
- [ ] Taper dans l'input d'un todo **ne déclenche pas** le rendu des autres todos.
- [ ] Mesurer le temps total d'un tri avec le Profiler : objectif < 50 ms pour 50 items.

**Mode "comparaison"** : implémenter d'abord une version naïve, mesurer. Puis appliquer 3 optimisations (key, memo, useCallback). Comparer **avant / après** en captures du Profiler.

Cette pratique préfigure M3 sur les hooks de performance.

---

## 8. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant peut expliquer le virtual DOM en deux phrases avec une analogie.
- [ ] Il cite les deux heuristiques du diffing React.
- [ ] Il identifie un anti-pattern `key={idx}` et sait justifier sa correction.
- [ ] Il navigue dans React DevTools (Components et Profiler).
- [ ] Il identifie un rendu inutile et son origine ("Why did this render?").
- [ ] Le mini-défi atteint l'objectif de performance.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : algorithme de hashing et de diffing, réconciliation.

---

## 9. Ressources complémentaires

- **Documentation React** : [react.dev/learn/preserving-and-resetting-state](https://react.dev/learn/preserving-and-resetting-state). Comportement clé de la réconciliation.
- **Documentation React** : [react.dev/learn/render-and-commit](https://react.dev/learn/render-and-commit). Phases render et commit.
- **Documentation React** : [react.dev/reference/react/memo](https://react.dev/reference/react/memo). Pour préparer M3.
- **React DevTools** : [react.dev/learn/react-developer-tools](https://react.dev/learn/react-developer-tools). Installation et usage.
- **Dan Abramov** — _React as a UI Runtime_ : article de fond sur le fonctionnement interne. Plus dense mais excellent.
- **Article historique** : _Reconciliation_ dans les anciennes docs React (`legacy.reactjs.org/docs/reconciliation.html`).
