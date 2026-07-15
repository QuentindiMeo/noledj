# M6 — Bibliothèque de composants

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Concevoir l'**architecture** d'une bibliothèque de composants (structure, build, packaging).
- Documenter une bibliothèque avec **Storybook** (stories, controls, MDX).
- **Profiler** les composants d'une bibliothèque et identifier les moins performants.
- Appliquer des **stratégies d'optimisation** ciblées et mesurer leur impact.
- Préparer une bibliothèque pour la **publication** (npm, monorepo, build types).

## Durée estimée

1 à 1,5 jour.

## Pré-requis

- M1 à M5 React terminés.

---

## 1. Pourquoi une bibliothèque de composants ?

### Le problème sans bibliothèque

Sur un projet qui grossit, le même composant `<Button>` est réécrit à 5 endroits avec 5 variantes incohérentes. Chaque équipe peint sa propre version, le design diverge, les bugs se multiplient.

### Le bénéfice

Une bibliothèque interne :

- **Uniformise** l'apparence et le comportement.
- **Capitalise** sur les bonnes pratiques (accessibilité, tests, perf).
- **Accélère** le développement de nouvelles features (assembler vs réinventer).
- **Sépare** les responsabilités : l'équipe Design System maintient la lib, les équipes produit la consomment.

**Analogie.** Un catalogue IKEA en composants. Chaque pièce est livrée seule, documentée, **montrable avant achat**. Les équipes assemblent leur app à partir du catalogue commun, plutôt que de fabriquer chacune leur propre table.

### Quand investir

- **Au moins 3 produits** réutilisant les mêmes éléments.
- **Au moins 5 composants** identifiables comme communs (button, input, modal, card, table).
- **Engagement long terme** — une lib mal maintenue est pire qu'aucune.

Pour un projet seul, un dossier `components/` partagé suffit. La lib externe (npm package) devient pertinente à partir d'une équipe plurielle.

---

## 2. Architecture d'une bibliothèque

### Structure recommandée

```tree
my-ui-lib/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── index.ts                # point d'entrée — réexporte tout
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.css
│   │   │   ├── Button.test.tsx
│   │   │   ├── Button.stories.tsx
│   │   │   └── index.ts
│   │   ├── Input/
│   │   └── Modal/
│   ├── hooks/
│   │   └── useClickOutside.ts
│   ├── tokens/
│   │   ├── colors.ts
│   │   └── spacing.ts
│   └── theme/
│       └── ThemeProvider.tsx
└── .storybook/
    ├── main.ts
    └── preview.ts
```

### Principes

- **Un composant = un dossier** — code, tests, styles, stories ensemble.
- **Index.ts** propre à chaque composant pour les imports sans extension.
- **Pas de logique métier** dans la bibliothèque — uniquement de la présentation.
- **Tokens** (couleurs, espacements, typographies) centralisés et exposés.
- **Types** TypeScript exportés pour permettre l'inférence côté consommateur.

### Outil de build

Pour une lib React moderne, **Vite + tsup** ou **Vite library mode** sont les options recommandées :

- Sortie en **ESM + CJS** pour la compatibilité.
- Génération des **`.d.ts`** pour TypeScript.
- **Tree-shakable** (`"sideEffects": false` dans package.json).

```ts
// vite.config.ts
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom"], // ne pas bundler React
    },
  },
  plugins: [dts({ insertTypesEntry: true })],
});
```

### Externals — ne JAMAIS bundler React

Une lib React **doit** marquer `react` et `react-dom` en `peerDependencies`, pas en dépendances. Sinon, l'app finale embarquera 2 versions de React → bugs garantis.

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

---

## 3. Storybook — fondamentaux

### Théorie

**Storybook** est un environnement de **développement isolé** pour composants. Chaque composant est présenté seul, dans plusieurs états (variantes), avec sa documentation.

**Analogie.** La vitrine d'un musée. Chaque œuvre est exposée seule, avec sa fiche descriptive, plusieurs angles de vue. Le visiteur explore sans contexte parasite.

### Installation

```bash
npx storybook@latest init
```

Cela installe Storybook, configure `.storybook/`, et génère quelques stories d'exemple.

### Une story = un état

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Click me",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Click me",
  },
};

export const Disabled: Story = {
  args: {
    variant: "primary",
    disabled: true,
    children: "Can't click",
  },
};
```

### Controls — manipulation interactive

Storybook génère automatiquement des **controls** pour chaque prop typée. L'utilisateur ajuste les props en live et observe le rendu.

```tsx
const meta: Meta<typeof Button> = {
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "danger"],
    },
    size: {
      control: { type: "range", min: 1, max: 5 },
    },
  },
};
```

### Lancer

```bash
npm run storybook
```

Ouvre une UI sur `http://localhost:6006`. Chaque composant et chaque story est navigable.

---

## 4. Documenter les composants

### Auto-documentation

Storybook lit les **types TypeScript** et les **commentaires JSDoc** pour générer la documentation :

```tsx
interface ButtonProps {
  /**
   * Variant visuel du bouton.
   * @default "primary"
   */
  variant?: "primary" | "secondary" | "danger";

  /** Désactiver l'interaction. */
  disabled?: boolean;

  /** Contenu interne du bouton. */
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  disabled,
  children,
}: ButtonProps) {
  return (
    <button className={`btn-${variant}`} disabled={disabled}>
      {children}
    </button>
  );
}
```

Storybook affiche automatiquement le tableau des props avec types, defaults, descriptions.

### MDX — documentation riche

Pour aller plus loin, **MDX** combine Markdown et JSX dans Storybook :

```mdx
# Button

Le composant Button est la primitive d'action de l'interface.

## Usage

<Story of={ButtonStories.Primary} />

## Bonnes pratiques

- Utiliser **Primary** pour l'action principale d'une page.
- Maximum **un Primary visible** simultanément par section.
- **Disabled** seulement quand l'action est temporairement indisponible.

## Accessibilité

- Toujours fournir un `aria-label` si le bouton n'a pas de texte.
- Focus visible : ne pas masquer l'outline.
```

### Tester l'accessibilité

L'addon **`@storybook/addon-a11y`** intègre **axe-core** dans Storybook. Chaque story est analysée automatiquement pour les violations d'accessibilité (contraste, labels, ARIA).

À installer **par défaut** sur toute bibliothèque sérieuse.

---

## 5. Identifier les composants peu performants

### Méthode

Une bibliothèque mature compte 30 à 100 composants. Les profiler **tous** est impraticable. La bonne approche : **commencer par les usages** dans une vraie app.

**Étapes** :

1. Lancer l'app qui consomme la bibliothèque en **mode production** (`npm run build` + `npm run preview`).
2. Activer **React DevTools Profiler**.
3. Effectuer les **interactions critiques** (scénarios métier les plus fréquents).
4. Inspecter le flamegraph : quels composants prennent le plus de temps ?
5. Inspecter "Why did this render?" : lesquels re-rendent inutilement ?
6. Lister les coupables et les noter par fréquence d'apparition + coût.

### Indicateurs à surveiller

- **Temps de rendu individuel** > 5 ms.
- **Nombre de rendus** par interaction > 5 fois.
- **Pourcentage** du temps total passé dans un composant > 20 %.

### Le cas typique — listes

Une `<Table>` ou un `<DataGrid>` est presque toujours le coupable. Causes habituelles :

- Pas de **virtualisation** (toutes les lignes en DOM).
- Pas de **mémoïsation** des lignes.
- **Callbacks non stables** sur chaque ligne (cf. M3).
- **Recalcul** des données triées/filtrées à chaque rendu.

### Cas secondaire — composants "container"

Modal, Drawer, Tooltip : leur ouverture déclenche souvent un rendu de tout le parent. À vérifier au Profiler.

---

## 6. Stratégies d'optimisation

### Liste ordonnée des leviers

À tester dans cet ordre, du moins invasif au plus complexe :

1. **Stabiliser les références** — `useMemo` sur les data, `useCallback` sur les callbacks, `key` corrects (M2, M3).
2. **`memo`** sur les composants de feuille les plus coûteux.
3. **`useDeferredValue`** ou **`useTransition`** sur les mises à jour non urgentes.
4. **Virtualisation** pour les listes longues (`react-window`, `react-virtual`).
5. **Code splitting** — `React.lazy` + `Suspense` pour les sous-arbres lourds.
6. **Server Components** (si Next.js / Remix) — déplacer le calcul côté serveur.

### Mesurer après chaque levier

Pas de "j'optimise puis je passe au suivant" — chaque optimisation est **testée** au Profiler, comparée avant / après, et **conservée seulement si bénéfique**.

C'est la rigueur du M3 appliquée à l'échelle bibliothèque.

### Anti-patterns à éviter

- **Tout mémoïser par précaution** — voir M3.
- **`memo` sans comparator** sur des props complexes — perd son sens.
- **Virtualiser** une liste de 20 items — overhead pour rien.
- **Lazy-loader** des composants critiques au-dessus du fold — l'utilisateur attend.

---

## 7. Publication et distribution

### Options de distribution

| Option                                                 | Quand                                           |
| ------------------------------------------------------ | ----------------------------------------------- |
| **Monorepo interne** (npm workspaces, pnpm, Turborepo) | Plusieurs apps internes au même groupe          |
| **Registre npm privé** (Verdaccio, GitHub Packages)    | Bibliothèque d'entreprise non publique          |
| **npm public**                                         | Bibliothèque open-source                        |
| **Snippet inline** (copy-paste comme shadcn/ui)        | Lib très opiniâtre, utilisateur veut customiser |

### Étapes minimales pour publier

1. **package.json** propre — `name`, `version`, `main`, `module`, `types`, `exports`, `peerDependencies`, `sideEffects: false`.
2. **Build** — `npm run build` génère `dist/`.
3. **Types** — vérifier que `.d.ts` est présent et complet.
4. **Tests** — au moins 80 % de coverage sur les composants critiques.
5. **Storybook publié** — sur Chromatic, Vercel, ou en static hosting.
6. **Changelog** — `changesets` automatise les versions et le changelog.
7. **`npm publish`** — public ou privé.

### Versioning — SemVer obligatoire

- **Patch** (1.2.X) — bugfix.
- **Minor** (1.X.0) — nouvelle feature, compatibilité ascendante.
- **Major** (X.0.0) — breaking change. Documenter en changelog avec migration guide.

Sur une lib distribuée, breaking changer une API publique sans MAJOR = casser ses utilisateurs.

---

## 8. Exercices pratiques

### Exercice 1 — Installer Storybook (≈ 20 min)

Sur un projet React (Vite ou Next), exécuter `npx storybook@latest init`. Lancer `npm run storybook` et explorer les stories d'exemple générées.

Créer une story manuelle pour un composant existant du projet.

### Exercice 2 — Stories d'un Button (≈ 35 min)

Implémenter un `<Button>` avec :

- Variantes : primary, secondary, danger.
- Tailles : small, medium, large.
- États : default, hover, focus, disabled, loading.

Créer **au moins 6 stories** couvrant les combinaisons importantes. Activer les `argTypes` pour permettre la manipulation interactive.

### Exercice 3 — Documentation MDX (≈ 30 min)

Pour le Button de l'exercice 2, écrire un fichier MDX :

- Description courte du composant.
- Au moins 3 bonnes pratiques.
- Section accessibilité (focus visible, aria-label si pas de texte).
- 2 stories embarquées dans le markdown.

### Exercice 4 — Identifier le composant lent (≈ 35 min)

Sur un projet avec une bibliothèque interne (perso ou pro), exécuter le profilage section 5.

Identifier le composant le plus coûteux en termes de :

- Temps de rendu individuel.
- Nombre de rendus par interaction.

Documenter en 1 page : composant, métrique observée, cause supposée, optimisation envisagée.

### Exercice 5 — Optimisation guidée par mesure (≈ 45 min)

Sur le composant identifié à l'exercice 4 :

1. **Avant** — capture du Profiler, temps total mesuré.
2. Appliquer **une** optimisation parmi les leviers section 6.
3. **Après** — capture du Profiler.
4. Calculer le gain en pourcentage.
5. Si le gain est < 10 %, **annuler** l'optimisation et essayer un autre levier.

Documenter le processus pour réutilisation future.

---

## 9. Mini-projet de synthèse — mini-bibliothèque + Storybook + benchmark (≈ 3 à 5 jours)

C'est le **mini-projet final** annoncé dans le parcours React. Il rassemble M1 à M6.

### Spécifications

**Mini-bibliothèque** : au moins **8 composants** parmi :

- `Button` (3 variants, 3 sizes, loading state).
- `Input` (text, password, search, avec icon).
- `Select` (compound — cf. POO M4 / mini-défi).
- `Modal` (avec focus trap et close on Escape).
- `Tabs` (compound).
- `Card` (avec header, body, footer composables).
- `Tooltip` (positionnable, avec délai).
- `Toast` (système de notification stackable).

### Storybook complet

- **Toutes** les stories couvertes (au moins 3 par composant).
- Documentation **MDX** pour les composants non triviaux (compound).
- Addon **a11y** activé.
- Build static publié (Vercel, Chromatic ou local).

### Profilage et benchmark

Pour **3 composants** parmi les 8, mener un cycle complet :

1. Implémenter une version **naïve** (sans optimisations).
2. **Profiler** une interaction représentative.
3. Appliquer **au moins 2 optimisations** (M3) avec mesure.
4. Documenter dans un fichier `BENCHMARK.md` :
   - Temps avant / temps après.
   - Optimisation appliquée.
   - Gain (%).
   - Trade-offs (complexité ajoutée, cas où l'optim ne sert pas).

### Critères de validation

- [ ] **8 composants** présents, fonctionnels, accessibles.
- [ ] **Storybook** lancé sans erreur, addon a11y signale moins de 5 violations.
- [ ] **TypeScript strict** sans erreur.
- [ ] **`react` et `react-dom` en `peerDependencies`**, jamais bundlés.
- [ ] **Build** produit un wheel ESM + CJS + .d.ts.
- [ ] **BENCHMARK.md** documenté pour 3 composants avec captures Profiler.
- [ ] Un consommateur (mini-app de démo) **installe et utilise** la lib comme si elle venait de npm.

### Bonus

- Publier sur **TestPyPI / npm registry privé**.
- Intégrer **changesets** pour versionner automatiquement.
- **Tests** Vitest avec coverage ≥ 80 %.

---

## 10. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant peut décrire l'architecture d'une lib de composants (dossiers, build, externals).
- [ ] Il sait installer Storybook et créer une story basique en < 10 minutes.
- [ ] Il connaît la différence entre `dependencies` et `peerDependencies`.
- [ ] Il sait identifier les composants peu performants via Profiler.
- [ ] Il a réalisé au moins **un cycle complet** mesure → optim → re-mesure.
- [ ] Le mini-projet de synthèse passe tous les critères de validation.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : créer ses propres bibliothèques de composants, documentation Storybook, déterminer quels composants sont les moins performants.

---

## 11. Ressources complémentaires

- **Documentation Storybook** : [storybook.js.org](https://storybook.js.org). Tutoriels et best practices.
- **Documentation Vite Library Mode** : [vitejs.dev/guide/build.html#library-mode](https://vitejs.dev/guide/build.html#library-mode).
- **Changesets** : [github.com/changesets/changesets](https://github.com/changesets/changesets). Versioning monorepo.
- **shadcn/ui** : [ui.shadcn.com](https://ui.shadcn.com). Approche atypique (copy-paste plutôt que npm package) à étudier.
- **Radix UI** : [radix-ui.com](https://www.radix-ui.com). Lib de référence pour l'accessibilité et compound components.
- **Brad Frost** — _Atomic Design_. Méthode pour structurer une bibliothèque (atoms, molecules, organisms).
- **Material UI**, **Chakra UI**, **Mantine** — bibliothèques matures à étudier en code source pour comprendre leur architecture.
- **Chromatic** — service de visual regression testing intégré à Storybook.
