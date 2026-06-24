# M3 — Hooks de performance

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser **`useMemo`** et **`useCallback`** avec discernement, et expliquer leurs **inconvénients**.
- Identifier les cas où ces hooks sont **inutiles** voire **contre-productifs**.
- Utiliser **`useRef`** pour conserver une valeur hors du cycle de rendu.
- Utiliser **`useDeferredValue`** pour découpler l'urgence des mises à jour.
- **Mesurer** un gain de performance avant / après mémoïsation, sans s'appuyer sur l'intuition.

## Durée estimée

1 jour.

## Pré-requis

- M1 et M2 React terminés.

---

## 1. Le compromis mémoire / CPU

### Théorie

Mémoïser, c'est échanger de la **mémoire** contre du **CPU** : on stocke un résultat pour éviter de le recalculer. Cela suppose :

1. Que **recalculer** est plus coûteux que **comparer les inputs et accéder à un cache**.
2. Que les inputs restent **stables** assez souvent pour que le cache ait des hits.

Si l'un de ces deux points fait défaut, mémoïser est inutile. Pire, ça peut **ralentir** : on paye le coût de comparaison à chaque rendu sans tirer profit du cache.

**Analogie.** Le post-it. Tu écris le résultat d'un calcul lourd sur un post-it pour le retrouver plus tard. Ça marche si :

- Le calcul est vraiment long (sinon le post-it = perte de temps).
- Tu vas vraiment réutiliser ce résultat (sinon le post-it pollue ton bureau).
- Tu sais reconnaître les conditions où le résultat est encore valable.

### Pourquoi cette section est cruciale

Beaucoup de devs **mettent `useMemo` partout** dès qu'ils entendent "performance". Résultat : code plus complexe, **aucun gain mesuré**, et parfois performance dégradée par la comparaison constante des dépendances.

Le module qui suit pose **quand** et **pourquoi** — pas seulement **comment**.

---

## 2. `useMemo` — mémoïser une valeur

### Syntaxe

```jsx
const expensive = useMemo(() => computeExpensive(a, b), [a, b]);
```

- React appelle la fonction au **premier rendu** et stocke le résultat.
- Au rendu suivant, React compare `[a, b]` au tableau précédent.
- Si **identiques** (référence stricte), il **réutilise** la valeur stockée.
- Si **différents**, il **recalcule** et met à jour le cache.

### Cas légitime — calcul lourd

```jsx
function Dashboard({ items, filter }) {
  const filtered = useMemo(
    () => items.filter((item) => matches(item, filter)),
    [items, filter],
  );

  return <List items={filtered} />;
}
```

Si `filter` ne change pas mais le composant rerend pour une autre raison, on évite de refiltrer 10 000 items.

### Cas légitime — référence stable

```jsx
function Parent() {
  const config = useMemo(() => ({ mode: "dark", retries: 3 }), []);
  return <Child config={config} />;
}
```

Sans `useMemo`, `config` est un **nouvel objet** à chaque rendu. Un `Child` mémoïsé (`memo`) rerendra **quand même** parce que la référence change. `useMemo` stabilise la référence pour permettre la mémoïsation aval.

---

## 3. `useCallback` — mémoïser une fonction

### Syntaxe

```jsx
const handleClick = useCallback(() => doSomething(id), [id]);
```

Équivalent strict à :

```jsx
const handleClick = useMemo(() => () => doSomething(id), [id]);
```

`useCallback(fn, deps)` est juste du sucre pour `useMemo(() => fn, deps)`. Le concept est identique : on stabilise la référence de la fonction.

### Quand c'est utile

```jsx
function Parent({ items }) {
  const handleClick = useCallback((id) => deleteItem(id), []);
  return items.map((item) => (
    <MemoChild key={item.id} item={item} onClick={handleClick} />
  ));
}

const MemoChild = memo(function MemoChild({ item, onClick }) {
  // memo compare les props avec === — onClick doit être stable
  return <li onClick={() => onClick(item.id)}>{item.label}</li>;
});
```

Sans `useCallback`, la prop `onClick` change à chaque rendu de `Parent` → `MemoChild` rerend toujours → `memo` est inutile. Avec `useCallback`, la référence reste stable → `memo` fonctionne.

### Quand c'est inutile

```jsx
function Parent() {
  const handleClick = useCallback(() => console.log("hi"), []);
  return <button onClick={handleClick}>click</button>;
}
```

Un `<button>` HTML natif ne profite pas de `memo`. La stabilité de `handleClick` n'apporte rien. Coût net : zéro gain, complexité supplémentaire.

---

## 4. Quand `useMemo` / `useCallback` sont inutiles voire nuisibles

### Trois cas de mésusage

**Cas 1 — Calcul trivial**

```jsx
const sum = useMemo(() => a + b, [a, b]); // ✗ une addition coûte moins qu'un cache
```

La comparaison des deps **plus** l'accès au cache coûtent plus cher que `a + b`. Mémoïser une addition ralentit le code.

**Cas 2 — Mémoïser un composant sans `memo` aval**

```jsx
function Parent() {
  const onClick = useCallback(...);
  return <NormalChild onClick={onClick} />;   // NormalChild n'est PAS memoisé
}
```

`NormalChild` rerend de toute façon (parce que `Parent` rerend). La stabilité de `onClick` ne profite à personne. Coût net.

**Cas 3 — Deps qui changent toujours**

```jsx
function App() {
  const items = useMemo(() => fetchItems(), [Date.now()]); // ✗ deps toujours différentes
}
```

`Date.now()` change à chaque rendu → cache invalidé → recalcul à chaque fois → coût supplémentaire de comparaison.

### Inconvénients généraux

- **Code plus complexe** — chaque `useMemo`/`useCallback` ajoute du bruit visuel.
- **Comparaison à chaque rendu** — même si le cache hit, on paye le coût de comparer les deps.
- **Faux sentiment de sécurité** — "j'ai useMemo donc c'est rapide" sans mesure.
- **Dépendances exotiques** — oublier une dep (bug de staleness) ou en mettre trop (cache toujours invalidé).
- **Garbage collection** — chaque cache retenu = mémoire occupée plus longtemps.

### React 19 et le compilateur

Le **React Compiler** (introduit avec React 19, encore en RC à la fin 2025) **mémoïse automatiquement** quand c'est pertinent. À terme, `useMemo` et `useCallback` deviendront **rarement nécessaires manuellement**. À surveiller pour les nouveaux projets.

### Heuristique simple

> _Don't reach for `useMemo` until you've measured a problem._

Ordre de réflexion :

1. **Mesurer** d'abord (Profiler — M2).
2. Si lent, **identifier la cause** (rendu inutile ? calcul lourd ?).
3. Mémoïser **uniquement** ce qui résout le problème.
4. **Re-mesurer** après pour confirmer le gain.

---

## 5. `useRef` — état hors du rendu

### Théorie

`useRef` retourne un objet **mutable** dont la propriété `.current` peut être modifiée **sans déclencher de rendu**. C'est l'outil pour "se souvenir" entre rendus sans entrer dans le cycle React.

**Analogie.** Un petit carnet caché dans l'objet, dont React ne suit pas les modifications. On y note ce qu'on veut retrouver plus tard, sans déclencher d'alerte.

### Deux cas d'usage

**Cas 1 — Référence DOM**

```jsx
function AutoFocusInput() {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} />;
}
```

`inputRef.current` pointe vers l'élément DOM après le mount. C'est le seul moyen d'accéder à l'élément réel depuis React.

**Cas 2 — Valeur mutable qui survit aux rendus**

```jsx
function Timer() {
  const intervalRef = useRef(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCount((c) => c + 1);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return <p>{count}</p>;
}
```

Stocker l'`interval id` dans un `useState` aurait déclenché un rendu inutile à la création. `useRef` permet de le conserver silencieusement.

### Différences avec `useState`

| Aspect                             | `useState`                   | `useRef`                       |
| ---------------------------------- | ---------------------------- | ------------------------------ |
| Modification déclenche re-render ? | Oui                          | Non                            |
| Lecture en cours de rendu          | Oui (la valeur est "freeze") | Oui mais déconseillé (mutable) |
| Modification en cours de rendu     | Non (avertissement)          | Possible mais déconseillé      |
| Survit aux rendus                  | Oui                          | Oui                            |

### Pièges

```jsx
// ✗ Mauvais usage
function Bad() {
  const renders = useRef(0);
  renders.current += 1; // ✗ mutation en plein rendu = comportement indéfini
  return <p>{renders.current}</p>;
}
```

Modifier un ref **pendant** le rendu (hors effect) viole les règles. À faire seulement dans `useEffect` ou des handlers.

```jsx
// ✓ Bon usage
useEffect(() => {
  renders.current += 1;
});
```

---

## 6. `useDeferredValue` — prioriser les rendus

### Théorie

`useDeferredValue` permet de **déprioriser** une mise à jour. React rend d'abord l'UI urgente (la frappe utilisateur), puis met à jour la version "lente" en arrière-plan.

**Analogie.** Une file d'attente avec priorité. La caisse rapide (urgence) sert d'abord ; la caisse "produits surgelés" (lent) attend que la première soit libre.

### Cas d'usage typique

```jsx
function Search() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchHeavy(deferredQuery), [deferredQuery]);

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results items={results} />
    </>
  );
}
```

À chaque frappe :

1. `query` se met à jour **immédiatement** → l'input reste réactif.
2. `deferredQuery` se met à jour **en différé** → `searchHeavy` ne ralentit pas la saisie.
3. Pendant le différé, `<Results>` affiche les **anciens résultats** brièvement.

### Quand l'utiliser

- Recherche en temps réel sur un dataset moyen-grand.
- Filtres complexes avec lots de calcul.
- Visualisations graphiques mises à jour à la volée.

### Quand ne pas l'utiliser

- Calculs ultra-rapides (le différé ajoute de la complexité sans bénéfice).
- Liste avec fetch — préférer `useTransition` ou `Suspense` (plus adaptés au server fetch).

### `useTransition` — la variante explicite

Similaire mais l'API place le différé du côté du **déclencheur** :

```jsx
const [isPending, startTransition] = useTransition();

const handleChange = (e) => {
  setQuery(e.target.value);          // urgent
  startTransition(() => {
    setHeavyResult(compute(...));    // déprioritisé
  });
};
```

`isPending` permet d'afficher un loader pendant la transition. À choisir selon le besoin (`useDeferredValue` est passif, `useTransition` est actif).

---

## 7. Méthode de mesure

### Étapes systématiques

1. **Reproduire** le ralentissement de manière fiable (même séquence d'actions, même dataset).
2. **Profiler** la version actuelle (React DevTools Profiler) — noter le temps total et le nombre de rendus.
3. **Identifier** la cause : composant le plus coûteux, dépendance qui change, taille de la liste.
4. **Hypothèse** : "si je mémoïse X, le composant Y ne devrait plus rerender."
5. **Implémenter** la mémoïsation.
6. **Re-profiler** dans les mêmes conditions.
7. **Comparer** : le gain est-il significatif (>10 %) ?
8. **Garder** si oui, **retirer** si non.

### Outils

- **React DevTools Profiler** — flamegraph, raisons de rendu.
- **Lighthouse / Performance tab** — métriques perçues utilisateur (FCP, TTI, INP).
- **`performance.now()`** — pour des mesures fines en JS pur.
- **`why-did-you-render`** — bibliothèque qui logue chaque rendu inutile avec la raison. À retirer après debug, pas en prod.

### Le piège à éviter

**Mesurer en mode dev**. React rend chaque composant **deux fois** en StrictMode pour repérer les effets secondaires. Cela double les temps observés. Toujours mesurer en **production build** (`npm run build` + `npm run preview`).

---

## 8. Exercices pratiques

### Exercice 1 — `useMemo` justifié vs inutile (≈ 25 min)

Soit trois composants. Pour chacun, décider si `useMemo` est utile, et **mesurer** pour confirmer :

```jsx
// Cas A
function Sum({ a, b }) {
  const total = useMemo(() => a + b, [a, b]);
  return <p>{total}</p>;
}

// Cas B
function Filter({ items }) {
  const expensive = useMemo(
    () => items.filter((i) => /complex/.test(i.label) && i.priority > 3),
    [items],
  );
  return <List items={expensive} />;
}

// Cas C
function Date() {
  const now = useMemo(() => new Date().toISOString(), [Math.random()]);
  return <p>{now}</p>;
}
```

Justifier en 2 lignes chaque verdict.

### Exercice 2 — `useCallback` avec `memo` (≈ 30 min)

Implémenter :

```jsx
const Row = memo(function Row({ item, onSelect }) { ... });

function List() {
  const [items, setItems] = useState(makeItems());
  const handleSelect = (id) => console.log(id);
  return items.map(item => <Row key={item.id} item={item} onSelect={handleSelect} />);
}
```

1. Mesurer le nombre de rendus de `Row` quand on rerend `List` par un changement non lié.
2. Ajouter `useCallback` à `handleSelect`.
3. Re-mesurer.

Constater : sans `useCallback`, `memo` ne sert à rien.

### Exercice 3 — `useRef` pour DOM (≈ 20 min)

Implémenter un composant `Modal` avec :

- Un `<dialog>` ou un `<div>` modal.
- À l'ouverture, **focus automatique** sur le premier `<button>` à l'intérieur.

Utiliser `useRef` pour cibler le bouton. Pas de `document.querySelector` direct (anti-pattern React).

### Exercice 4 — `useDeferredValue` (≈ 30 min)

Construire une recherche dans une liste de 10 000 noms (générée aléatoirement).

1. Version naïve : `useState` + filtre à chaque frappe → taper "abc" est saccadé.
2. Ajouter `useDeferredValue` → la frappe redevient fluide.
3. Afficher un `<Spinner>` quand `query !== deferredQuery` pour indiquer le calcul en cours.

### Exercice 5 — Mesure rigoureuse (≈ 35 min)

Sur un projet React existant (perso ou pro), identifier **un composant** lent.

1. Build production : `npm run build` + `npm run preview`.
2. Profiler une interaction problématique → enregistrer le temps total.
3. Appliquer **une** optimisation (au choix : `memo`, `useMemo`, `useCallback`, `useDeferredValue`).
4. Re-profiler dans les mêmes conditions.
5. Comparer. Gain significatif ? Sinon **retirer** l'optimisation.

Documenter la méthode en 1 paragraphe pour réutilisation future.

---

## 9. Mini-défi de synthèse (≈ 2 heures)

Construire un **dashboard analytique** avec :

- **10 000 events** générés (timestamp, user, action, value).
- **3 filtres** combinables : par user, par action, par plage de dates.
- **1 graphique** (chart.js / recharts / svg manuel) qui affiche un résumé des events filtrés.
- **1 input de recherche** texte qui filtre en plus.

### Contraintes de performance

- [ ] Taper dans l'input ne **gèle pas** l'UI (utiliser `useDeferredValue` ou `useTransition`).
- [ ] Le graphique ne re-rend pas si seuls les filtres non liés au graphique changent (mémoïser intelligemment).
- [ ] Les lignes du tableau d'events sont **virtualisées** ou **paginated** — pas 10 000 DOM nodes.
- [ ] Build production. Profile complet en `Performance` du navigateur. Temps total de filtrage **< 200 ms**.

### Validation

Capture du Profiler **avant / après** au moins **deux optimisations** documentées en commentaire (avec mesure du gain).

---

## 10. Auto-évaluation

Le module M3 est validé lorsque :

- [ ] L'apprenant explique le compromis mémoire / CPU de la mémoïsation.
- [ ] Il identifie un `useMemo` utile, un inutile, un nuisible (3 sur 3 dans l'exercice 1).
- [ ] Il sait quand `useCallback` est nécessaire (couplé à `memo` aval).
- [ ] Il maîtrise `useRef` pour DOM et pour valeurs mutables hors render.
- [ ] Il a utilisé `useDeferredValue` au moins une fois en pratique.
- [ ] Il sait **mesurer** un gain en build prod avec React Profiler.
- [ ] Le mini-défi atteint les contraintes de performance.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : `useMemo`/`useCallback` inconvénients, `useMemo`/`useCallback` pertinents, `useRef`, `useDeferredValue` (debouncing).

---

## 11. Ressources complémentaires

- **Documentation React** : [react.dev/reference/react/useMemo](https://react.dev/reference/react/useMemo) — section _Should you add useMemo everywhere?_ à lire absolument.
- **Documentation React** : [react.dev/reference/react/useCallback](https://react.dev/reference/react/useCallback).
- **Documentation React** : [react.dev/reference/react/useRef](https://react.dev/reference/react/useRef).
- **Documentation React** : [react.dev/reference/react/useDeferredValue](https://react.dev/reference/react/useDeferredValue).
- **React Compiler** : [react.dev/learn/react-compiler](https://react.dev/learn/react-compiler) — mémoïsation automatique pour React 19+.
- **Dan Abramov** — _Before You memo()_ : article qui montre que la plupart des `memo` peuvent être évités par restructuration.
- **Kent C. Dodds** — _When to useMemo and useCallback_ : article de référence sur le sujet.
