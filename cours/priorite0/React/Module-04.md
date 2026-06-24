# M4 — Patterns avancés

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Implémenter des **compound components** (Tabs, Accordion, Select complexe).
- Lire et **comprendre du code en class components** pour intervenir sur du legacy.
- Connaître les autres patterns historiques : **render props**, **higher-order components**.
- Choisir le **bon pattern** pour le bon besoin (custom hook vs compound vs render prop vs HOC).

## Durée estimée

1 jour.

## Pré-requis

- M1 à M3 React terminés.

---

## 1. Pourquoi des patterns de composants ?

Au-delà du couple `state` + `render`, certains besoins reviennent :

- **Partager un état** entre plusieurs composants frères sans le faire remonter à un grand-parent.
- **Composer** des éléments visuels qui forment un tout cohérent (un `<Modal>` avec son header, son body, son footer).
- **Réutiliser** du comportement (auth, fetch, throttle) sans dupliquer le code.

Les **patterns avancés** sont les solutions consacrées de la communauté React. La majorité ont été inventés avant les hooks (2019) et restent **lisibles en lecture de code legacy**, même si les hooks les ont rendus moins fréquents.

**Analogie.** Comme en POO : les design patterns sont des recettes connues. En React, ils ont leurs versions adaptées au monde des composants.

---

## 2. Compound components

### Théorie

Un **compound component** est un composant **éclaté en plusieurs sous-composants** qui collaborent via un **état partagé**. L'utilisateur de la lib **assemble** les sous-composants comme il veut — le composant racine fait le travail de coordination.

**Analogie.** Un système hi-fi modulaire : ampli, platine, enceintes. Chaque pièce a sa fonction mais elles s'attendent à fonctionner ensemble. On choisit la disposition (placer les enceintes où on veut), mais les pièces communiquent **par un bus commun**.

### Exemple — `<Tabs>`

```jsx
import { createContext, useContext, useState } from "react";

const TabsContext = createContext(null);

function Tabs({ children, defaultValue }) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

function TabList({ children }) {
  return (
    <div className="tab-list" role="tablist">
      {children}
    </div>
  );
}

function Tab({ value, children }) {
  const { active, setActive } = useContext(TabsContext);
  const isActive = active === value;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={isActive ? "active" : ""}
      onClick={() => setActive(value)}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }) {
  const { active } = useContext(TabsContext);
  if (active !== value) return null;
  return <div role="tabpanel">{children}</div>;
}

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

export default Tabs;
```

### Usage

```jsx
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Tab value="profile">Profile</Tabs.Tab>
    <Tabs.Tab value="settings">Settings</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="profile">My profile content...</Tabs.Panel>
  <Tabs.Panel value="settings">My settings content...</Tabs.Panel>
</Tabs>
```

L'utilisateur **compose** librement, mais les sous-composants partagent silencieusement l'état via le `Context`.

### Bénéfices

- **API expressive** — la JSX raconte directement l'intention.
- **Flexibilité** — on insère ce qu'on veut entre les sous-composants (icône, badge, tooltip).
- **Pas de prop drilling** — l'état circule via le Context interne.

### Pièges

- **Couplage caché** — `Tabs.Tab` doit être dans un `Tabs`. Lever une erreur claire si on l'utilise seul.
- **Convention vs validation** — sans `useContext` qui crash si null, l'usage hors `Tabs` produit des bugs silencieux.

### Implémentations connues

- **Radix UI**, **Headless UI**, **Reach UI** — bibliothèques composables qui exploitent intensément ce pattern.
- **shadcn/ui** — réutilise Radix avec des styles Tailwind.

---

## 3. Render props

### Théorie

Un composant accepte une **fonction enfant** (ou prop spéciale) **qui retourne du JSX**, à laquelle il passe des **données ou des callbacks** à utiliser.

**Analogie.** Un guide touristique qui te montre les lieux. Tu écris toi-même ce que tu veux faire sur place — il fournit le contexte, tu fournis l'action.

### Exemple

```jsx
function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  return (
    <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      {children(pos)}
    </div>
  );
}

function App() {
  return (
    <MouseTracker>
      {(pos) => (
        <p>
          Mouse at ({pos.x}, {pos.y})
        </p>
      )}
    </MouseTracker>
  );
}
```

`MouseTracker` gère le tracking ; `App` décide quoi afficher.

### Évolution

Le pattern est devenu **moins courant** depuis l'arrivée des **custom hooks** (M1). Un `useMousePosition()` produit le même résultat avec moins de cérémonie :

```jsx
function useMousePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return pos;
}

function App() {
  const pos = useMousePosition();
  return (
    <p>
      Mouse at ({pos.x}, {pos.y})
    </p>
  );
}
```

**Verdict** : connaître pour lire le legacy ; préférer les hooks dans les nouveaux projets.

---

## 4. Higher-Order Components (HOC)

### Théorie

Un **HOC** est une **fonction** qui prend un composant et **retourne un nouveau composant** "augmenté".

```jsx
const EnhancedComponent = withSomething(BaseComponent);
```

**Analogie.** Un emballage. On enveloppe un composant pour lui ajouter des super-pouvoirs (auth, logs, état partagé) sans modifier son code.

### Exemple — `withAuth`

```jsx
function withAuth(Component) {
  return function WithAuthComponent(props) {
    const user = useUser();
    if (!user) return <LoginPrompt />;
    return <Component {...props} user={user} />;
  };
}

const Dashboard = withAuth(function Dashboard({ user }) {
  return <h1>Hello {user.name}</h1>;
});
```

### Inconvénients

- **Props mystères** — d'où vient `user` ? Il faut tracer les HOC pour comprendre.
- **Profondeur de wrapping** — `withRouter(withAuth(withTheme(Component)))` produit 4 niveaux d'imbrication dans l'arbre React.
- **Difficile à typer** — les types des props deviennent vite ingérables avec TypeScript.

### Évolution

Là encore, **les hooks remplacent** la majorité des HOC :

```jsx
// HOC
const Page = withAuth(MyComponent);

// Hook équivalent
function MyComponent() {
  const user = useAuth();
  if (!user) return <LoginPrompt />;
  return <h1>Hello {user.name}</h1>;
}
```

Les frameworks legacy (Redux pre-hooks `connect`, react-router < v6 `withRouter`) utilisent encore intensément les HOC. Les nouvelles versions exposent toutes des hooks.

---

## 5. Class components — lecture du legacy

### Pourquoi en parler

Les class components datent d'avant 2019 (hooks). Beaucoup de projets en production ont encore du code en classes. Savoir le **lire** est indispensable pour intervenir sur du legacy. Savoir l'**écrire** est moins nécessaire — un nouveau composant doit être en fonction.

### Anatomie

```jsx
import { Component } from "react";

class Counter extends Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
    this.increment = this.increment.bind(this); // bind nécessaire
  }

  componentDidMount() {
    console.log("mounted");
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.count !== this.state.count) {
      console.log("count changed");
    }
  }

  componentWillUnmount() {
    console.log("unmounted");
  }

  increment() {
    this.setState((prev) => ({ count: prev.count + 1 }));
  }

  render() {
    return (
      <div>
        <p>Count: {this.state.count}</p>
        <button onClick={this.increment}>+</button>
      </div>
    );
  }
}
```

### Équivalents hooks

| Class component                                  | Function component avec hooks                           |
| ------------------------------------------------ | ------------------------------------------------------- |
| `this.state` + `this.setState`                   | `useState`                                              |
| `componentDidMount`                              | `useEffect(() => { ... }, [])`                          |
| `componentDidUpdate`                             | `useEffect(() => { ... }, [deps])`                      |
| `componentWillUnmount`                           | Return function of `useEffect`                          |
| `static getDerivedStateFromProps`                | `useState` + check dans render (rare)                   |
| `shouldComponentUpdate`                          | `React.memo` + comparator                               |
| `getSnapshotBeforeUpdate`                        | Pas d'équivalent direct — `useLayoutEffect` ou `useRef` |
| `componentDidCatch` / `getDerivedStateFromError` | **Reste class only** — error boundaries                 |

### Pièges fréquents à reconnaître

**Le bind oublié** :

```jsx
constructor(props) {
  super(props);
  this.handleClick = this.handleClick.bind(this);  // ✓
}

// Sinon, `this` est undefined dans handleClick
```

Alternative moderne : arrow function de classe :

```jsx
handleClick = () => {
  /* ... */
}; // pas de bind nécessaire
```

**setState asynchrone** :

```jsx
this.setState({ count: this.state.count + 1 });
this.setState({ count: this.state.count + 1 }); // ✗ ne fait qu'un +1 !
```

`setState` batch les mises à jour. Solution : forme fonctionnelle.

```jsx
this.setState((prev) => ({ count: prev.count + 1 }));
this.setState((prev) => ({ count: prev.count + 1 })); // ✓ +2
```

**Comparaison shallow** :

```jsx
this.setState({ items: [...this.state.items, newItem] }); // ✓ nouvelle ref
this.setState({ items: this.state.items.push(newItem) }); // ✗ mutation ; React ne voit rien
```

### Error boundaries — le seul cas où les classes restent obligatoires

```jsx
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logErrorToService(error, info);
  }

  render() {
    if (this.state.hasError) return <h1>Something went wrong.</h1>;
    return this.props.children;
  }
}
```

Aucun hook ne couvre les error boundaries en 2025. Il faut donc **savoir écrire** au moins ce cas.

À noter : `react-error-boundary` est une lib qui enrobe ce pattern et expose un composant utilisable depuis du code en hooks.

---

## 6. Quel pattern pour quel besoin ?

| Besoin                                                   | Pattern recommandé              |
| -------------------------------------------------------- | ------------------------------- |
| Réutiliser une logique d'effet ou de state               | **Custom hook**                 |
| Composer un widget complexe (Tabs, Modal, Select)        | **Compound components**         |
| Donner accès à un état dans des sous-composants distants | **Context** (interne ou exposé) |
| Augmenter un composant tiers                             | **HOC** (sinon hook)            |
| Délégation totale du rendu à l'utilisateur               | **Render props** (sinon hook)   |
| Attraper des erreurs dans un sous-arbre                  | **Class — Error Boundary**      |

### Heuristique simple

1. Le besoin se résout-il par un **custom hook** ? → utiliser un custom hook.
2. Sinon, le besoin est-il un **widget composable** ? → compound components.
3. Sinon, le besoin nécessite-t-il du **wrapping** invisible ? → HOC.
4. Si le legacy l'impose → classes / render props.

---

## 7. Exercices pratiques

### Exercice 1 — Lire et porter un class component (≈ 25 min)

Soit :

```jsx
class Timer extends Component {
  state = { seconds: 0 };

  componentDidMount() {
    this.id = setInterval(() => {
      this.setState((prev) => ({ seconds: prev.seconds + 1 }));
    }, 1000);
  }

  componentWillUnmount() {
    clearInterval(this.id);
  }

  render() {
    return <p>{this.state.seconds}s</p>;
  }
}
```

Réécrire en function component avec hooks. Vérifier comportement identique.

### Exercice 2 — Compound `<Accordion>` (≈ 45 min)

Implémenter :

```jsx
<Accordion>
  <Accordion.Item value="a">
    <Accordion.Header>Section A</Accordion.Header>
    <Accordion.Panel>Content A</Accordion.Panel>
  </Accordion.Item>
  <Accordion.Item value="b">
    <Accordion.Header>Section B</Accordion.Header>
    <Accordion.Panel>Content B</Accordion.Panel>
  </Accordion.Item>
</Accordion>
```

Contraintes :

- Un seul panel ouvert à la fois.
- Le clic sur un header bascule l'état.
- Un `aria-expanded` correct sur chaque header.
- Erreur claire si `Accordion.Item` est utilisé hors `Accordion`.

### Exercice 3 — Custom hook ou render prop ? (≈ 30 min)

Soit un composant `<Toggle>` qui :

- Gère un état `on / off`.
- Expose deux callbacks : `toggle` et `setOn`.
- Doit pouvoir être consommé de deux façons différentes selon l'usage.

Implémenter **deux versions** :

1. `<Toggle>{({ on, toggle }) => <button onClick={toggle}>{on ? "On" : "Off"}</button>}</Toggle>`.
2. `useToggle(): [boolean, () => void]`.

Discuter avantages / inconvénients en commentaire.

### Exercice 4 — Error Boundary (≈ 30 min)

Implémenter `ErrorBoundary` en class component. Utilisation :

```jsx
<ErrorBoundary fallback={<p>Oops</p>}>
  <CrashyComponent />
</ErrorBoundary>
```

Vérifier qu'une exception levée dans `CrashyComponent` est captée et affiche le fallback. Logger l'erreur dans la console.

### Exercice 5 — Refactor HOC → hook (≈ 30 min)

Soit :

```jsx
function withLogger(Component) {
  return function (props) {
    useEffect(() => {
      console.log(`${Component.name} mounted`);
      return () => console.log(`${Component.name} unmounted`);
    }, []);
    return <Component {...props} />;
  };
}

const Page = withLogger(MyPage);
```

Refactorer en custom hook `useMountLogger(name)`. Discuter pourquoi le hook est préférable.

---

## 8. Mini-défi de synthèse (≈ 2 à 3 heures)

Implémenter un **`<Select>` compound component** complet :

```jsx
<Select value={value} onChange={setValue}>
  <Select.Trigger>Choose...</Select.Trigger>
  <Select.Options>
    <Select.Option value="apple">Apple</Select.Option>
    <Select.Option value="banana">Banana</Select.Option>
    <Select.Option value="cherry">Cherry</Select.Option>
  </Select.Options>
</Select>
```

### Spécifications

- **Contrôlé** : `value` + `onChange` passés en props.
- **Ouverture / fermeture** : clic sur Trigger ouvre / ferme la liste.
- **Sélection** : clic sur Option ferme et met à jour `value`.
- **Click extérieur** : ferme la liste si l'utilisateur clique en dehors (`useRef` + event listener global).
- **Clavier** : flèches haut / bas pour naviguer, Enter pour sélectionner, Escape pour fermer.
- **Accessibilité** : roles ARIA (`combobox`, `listbox`, `option`), `aria-selected`.

### Validation

- [ ] La JSX d'usage reste **propre et expressive** (pas de prop drilling).
- [ ] Un test : `Select.Option` utilisé hors `Select` produit une **erreur claire**.
- [ ] Le clavier fonctionne sur 3 fruits (haut, bas, enter, escape).
- [ ] Pas de fuite : démonter le `<Select>` retire le listener global.

**Bonus** :

- Ajouter une **recherche** dans la liste (un input qui filtre les options visibles).
- Ajouter un mode **multi-sélection** sans casser l'API précédente.

---

## 9. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant explique le pattern compound components avec une analogie.
- [ ] Il implémente Tabs ou Accordion sans aide.
- [ ] Il lit un class component et comprend son équivalent hooks (mapping des lifecycle).
- [ ] Il identifie les 4 pièges classiques des class components (bind, setState async, mutation, batching).
- [ ] Il connaît les Error Boundaries et leur API.
- [ ] Il choisit entre custom hook, compound, HOC, render prop selon le besoin.
- [ ] Le `<Select>` du mini-défi passe tous les critères.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : compound components, class components.

---

## 10. Ressources complémentaires

- **Documentation React** : [react.dev/learn/passing-data-deeply-with-context](https://react.dev/learn/passing-data-deeply-with-context). Fondation des compound components.
- **Kent C. Dodds** — _Advanced React Component Patterns_ (cours et articles). Référence canonique sur compound components, render props, control props.
- **Radix UI** : [radix-ui.com](https://www.radix-ui.com). Code lisible de compound components production-ready.
- **Headless UI** : [headlessui.com](https://headlessui.com). Autre référence accessible.
- **Documentation React** — _Migrating from Class Components_ (Beta docs archived).
- **`react-error-boundary`** — bibliothèque qui enrobe `ErrorBoundary` avec une API hook-friendly.
