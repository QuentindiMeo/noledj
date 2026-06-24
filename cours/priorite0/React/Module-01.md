# M1 — Audit N2 et consolidation

## Objectif

À la fin de ce module, l'apprenant aura :

- Cartographié sa maîtrise des items **N2 du glossaire React** (A / P / N).
- Identifié les zones à consolider **avant** d'attaquer N3 (modules M2 à M6).
- Validé en pratique sa maîtrise via le **refactor d'un composant existant**.
- Produit un **plan de remédiation** priorisé.

## Durée estimée

0,5 jour.

## Pré-requis

- Niveau 1 React maîtrisé : composants, JSX, `useState`, props, function components.
- Avoir un projet React (perso ou pro) sous la main pour les exercices.

---

## 1. Pourquoi un audit ?

Avec un niveau de départ à 2 (N2 acquis), la cible Confirmé 2.5 signifie **N2 complet + partiel N3**. Avant d'attaquer N3, il faut s'assurer qu'aucun item N2 ne reste fragile — sinon les concepts N3 (réconciliation, useMemo pertinent, compound components...) reposeront sur du sable.

**Analogie.** Avant de construire le 3ᵉ étage d'une maison, on vérifie que les deux premiers tiennent. Un audit React, c'est la visite de chantier — on cherche les fissures invisibles, pas à donner une note.

---

## 2. Méthode d'auto-évaluation

Pour chaque item du glossaire, se poser :

1. **Reconnaître** — Suis-je capable d'identifier ce concept dans du code que je lis ?
2. **Expliquer** — Pourrais-je l'expliquer à un collègue sans documentation ?
3. **Appliquer** — Ai-je écrit du code utilisant ce concept dans les 6 derniers mois ?

Échelle :

| Note               | Critère          | Action                                |
| ------------------ | ---------------- | ------------------------------------- |
| **A** — Acquis     | 3 oui sur 3      | Aucune action (revue rapide possible) |
| **P** — Partiel    | 1 ou 2 oui sur 3 | Lecture + exercice ciblé              |
| **N** — Non acquis | 0 oui sur 3      | Module dédié à dérouler               |

**Règle d'honnêteté.** Surévaluer "P" en "A" produit un plan vide qui rate les vrais trous. Un test pratique tranche : si l'on n'arrive pas à coder l'item de tête en 5 minutes, ce n'est pas A.

---

## 3. Questionnaire N2

Pour chaque ligne, indiquer A / P / N.

| #   | Item N2                                                                           | Note |
| --- | --------------------------------------------------------------------------------- | ---- |
| 1   | **Virtual DOM** — concept et avantages                                            | \_\_ |
| 2   | **`props key`** — à quel problème elle répond                                     | \_\_ |
| 3   | **`props children`** — usage et composition                                       | \_\_ |
| 4   | **Cycle de vie** d'un composant (mount, update, unmount)                          | \_\_ |
| 5   | Différence **container vs pure components**                                       | \_\_ |
| 6   | **`useEffect`** pour se synchroniser à un changement externe                      | \_\_ |
| 7   | Utilité de la **fonction callback** retournée par `useEffect`                     | \_\_ |
| 8   | Différence **tableau de dépendances vide** vs **pas de tableau** dans `useEffect` | \_\_ |
| 9   | Reconnaître et résoudre du **props drilling**                                     | \_\_ |
| 10  | **`useMemo`** et **`useCallback`** (usage de base)                                | \_\_ |
| 11  | Mettre en place un **routeur** (react-router ou intégré au framework)             | \_\_ |
| 12  | **Créer ses propres hooks** (custom hooks)                                        | \_\_ |
| 13  | Utilité d'un **framework React** (Next.js, Remix, Astro)                          | \_\_ |
| 14  | **Reducers** et `useReducer`                                                      | \_\_ |
| 15  | Au moins un **state manager** (Context API, Redux, Zustand)                       | \_\_ |
| 16  | Principe du **batch update**                                                      | \_\_ |
| 17  | **Fragment** (`<>`) et différence avec `<div>`                                    | \_\_ |
| 18  | Composant **`<Suspense>`** pour fluidifier l'UI au chargement                     | \_\_ |

---

## 4. Validation pratique — refactor

Pour les items notés A, valider en pratique via un **refactor d'un composant existant**.

### Choix du composant

Prendre un composant **non trivial** (au moins 50 lignes) dans un projet personnel ou pro :

- Avec au moins un `useEffect`.
- Avec props passées à au moins 2 niveaux.
- Si possible avec une liste rendue (pour vérifier `key`).

### Mission

Réécrire ce composant en **explicitant chaque concept maîtrisé**. Au minimum :

- [ ] **`key`** sur toutes les listes itérées, valeur stable et unique (pas l'index si la liste est triée/filtrée).
- [ ] **`useEffect`** avec un tableau de dépendances **explicite** et minimal.
- [ ] Fonction de **cleanup** retournée par `useEffect` quand pertinent (unsubscribe, clearInterval, abort).
- [ ] **Fragments** au lieu de `<div>` superflus.
- [ ] **`<Suspense>`** au moins une fois autour d'un composant lazy ou d'une frontière de chargement.
- [ ] **Custom hook** extrait si la même logique d'effet revient deux fois.
- [ ] Aucun **props drilling** au-delà de 2 niveaux sans justification.

À chaque modification, **commenter en 1 ligne** quel concept est démontré. Cela force l'explicitation.

### Test de calibrage — snippets minimaux

Si l'écriture coince sur un item noté A, le repasser à P. Quatre exemples d'attendus :

#### `key` stable

```jsx
{
  items.map((item) => (
    <Item key={item.id} {...item} /> // ✓ id stable
  ));
}

{
  items.map((item, idx) => (
    <Item key={idx} {...item} /> // ✗ key = idx, problématique sur tri/filtre
  ));
}
```

#### `useEffect` propre

```jsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id); // cleanup
}, [tick]); // dépendance explicite
```

#### Custom hook

```jsx
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(
    () => JSON.parse(localStorage.getItem(key)) ?? initial,
  );
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}
```

#### Fragment

```jsx
function Toolbar() {
  return (
    <>
      <Button>Save</Button>
      <Button>Cancel</Button>
    </>
  );
}
```

---

## 5. Construire le plan de remédiation

Regrouper les items P / N par module destinataire :

| Module                              | Items P/N concernés                                             |
| ----------------------------------- | --------------------------------------------------------------- |
| **M2 — Moteur de réconciliation**   | #1 (virtual DOM), #2 (key)                                      |
| **M3 — Hooks de performance**       | #10 (useMemo/useCallback, base à consolider avant le niveau N3) |
| **M4 — Patterns avancés**           | #5 (container/pure components)                                  |
| **M5 — Écosystème React**           | #13 (frameworks), #15 (state managers)                          |
| **M6 — Bibliothèque de composants** | (Tous les items consolidés sont utilisés)                       |

Les items 6 à 9 (`useEffect`, cleanup, dépendances, props drilling) et 11, 12, 14, 16, 17, 18 sont **transversaux** : ils n'ont pas de module dédié mais doivent être A avant d'enchaîner sur M2-M6.

**Si un item transversal reste P/N** : lecture ciblée + un mini-exercice avant d'attaquer M2.

---

## 6. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] Les **18 items** ont reçu une note (A / P / N).
- [ ] Les items notés **A** ont été vérifiés par un snippet écrit de tête.
- [ ] Le **composant refactoré** intègre les concepts du checklist (section 4).
- [ ] Le plan de remédiation est rempli et un ordre **M2 → M6** est noté.

---

## 7. Score final

Compter le nombre d'items dans chaque catégorie :

- Acquis : \_\_ / 18.

Échelle indicative :

| Total A | Niveau approximatif              |
| ------- | -------------------------------- |
| 0 – 4   | ≈ N1 (≈ 1)                       |
| 5 – 9   | ≈ N1 complet vers N2 (≈ 1,5)     |
| 10 – 14 | ≈ N2 partiel (≈ 2)               |
| 15 – 17 | ≈ N2 complet, vers N3 (≈ 2,5)    |
| 18      | ≈ N3 partiel possible (≈ 3 visé) |

Boussole, pas thermomètre exact. La pondération des items varie.

---

## 8. Ressources complémentaires

- **Documentation React officielle** : [react.dev](https://react.dev). Le tutoriel et la section _Learn_ couvrent tous les N2.
- **Glossaire interne** : `resources/priority0/React.md` — référence des items à auditer.
- **React DevTools** — extension navigateur pour inspecter le virtual DOM et tracer les rendus.
- **Beta docs React** archivées : utiles pour les explications historiques (réconciliation, lifecycle).
- _The Road to React_ (Robin Wieruch) — référence accessible pour révisions ciblées N2.
