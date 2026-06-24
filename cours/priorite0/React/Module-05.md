# M5 — Écosystème React

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Comparer les principaux **frameworks React** (Next.js, Remix, Astro, Vite + React) sur leurs forces et limites.
- Comparer les principaux **state managers** (Context API, Redux, Zustand, Jotai, TanStack Query) et choisir selon le besoin.
- Construire une **matrice comparative** documentée pour un projet donné.
- Défendre un choix d'écosystème devant une équipe.

## Durée estimée

0,5 à 0,75 jour.

## Pré-requis

- M1 à M4 React terminés.

---

## 1. Pourquoi parler d'écosystème ?

React est une **bibliothèque** de rendu, pas un framework complet. Pour construire une vraie application, il faut compléter avec :

- Un **framework** ou un **bundler** (Next.js, Remix, Astro, Vite, Create React App déprécié).
- Un **state management** quand le `useState` local ne suffit plus (Context, Redux, Zustand, TanStack Query).
- Un **router** (souvent intégré au framework, ou react-router séparé).

Le coût d'un mauvais choix se paie pendant **toute la durée de vie** du projet. C'est l'une des décisions où il faut prendre le temps d'évaluer.

**Analogie.** Choisir un framework React = choisir une **plateforme de construction**. Une grue, une nacelle, un échafaudage : tous montent en hauteur, mais ils répondent à des chantiers différents. Mal choisir = perdre du temps à compenser.

---

## 2. Vue d'ensemble des frameworks React

### Les quatre familles

| Famille                        | Exemple          | Caractéristique principale                   |
| ------------------------------ | ---------------- | -------------------------------------------- |
| **Méta-framework full-stack**  | Next.js, Remix   | SSR, routing, API routes, optimisations      |
| **Generator de site statique** | Astro, Gatsby    | Build vers HTML, performance focus           |
| **SPA pure**                   | Vite + React     | Bundler simple, rien d'opiniâtre             |
| **Stack opinionated**          | RedwoodJS, Blitz | Framework avec backend et conventions fortes |

### Au-delà de la mode

Chaque framework a sa **proposition de valeur** propre. La popularité (stars GitHub, hype Twitter) n'est pas un critère technique. Ce qui compte :

- Le **type d'application** qu'on construit (SPA, e-commerce, blog, app interne).
- Les **contraintes de SEO** et de performance.
- Les **compétences** de l'équipe.
- L'**hébergement** prévu (Vercel, AWS, on-premise).

---

## 3. Détail par framework

### Next.js (Vercel)

**Quoi** : méta-framework full-stack avec SSR, SSG, ISR, API routes, image optimization, App Router (Server Components).

**Forces** :

- Écosystème **massif**, documentation abondante.
- **Server Components** : rendu côté serveur, bundle JS minimal côté client.
- Intégration native avec **Vercel** (déploiement zero-config).
- Bon pour SEO grâce au SSR.

**Limites** :

- **Complexité croissante** (App Router vs Pages Router, RSC vs Client Components).
- **Couplage** Vercel-friendly — autres hébergeurs plus délicats à configurer.
- Performance dégradée si **mal utilisé** (mauvais usage des Server vs Client Components).

**Quand le choisir** :

- Site marketing / e-commerce nécessitant SEO.
- Application full-stack avec backend léger en API routes.
- Équipe à l'aise avec les conventions Next.

**Quand l'éviter** :

- Petite SPA sans besoin de SSR.
- Si on veut s'éloigner de Vercel.

### Remix (puis intégré à React Router v7)

**Quoi** : framework full-stack focalisé sur le **web fundamentals** (forms, HTTP, cache). Intégré comme moteur de React Router v7+ depuis 2024-2025.

**Forces** :

- Modèle mental clair : **loader** (fetch) + **action** (mutation) + **component** (rendu).
- Excellente gestion des **formulaires** sans JS.
- Streaming SSR performant.

**Limites** :

- Communauté **plus petite** que Next.
- Évolution récente (passage Remix → React Router v7) — documentation en transition.

**Quand le choisir** :

- App avec beaucoup de **formulaires** et de mutations.
- Équipe valorisant le **progressive enhancement** (marche sans JS).
- Multi-cloud (AWS, Cloudflare, Vercel, etc.).

**Quand l'éviter** :

- SPA stateful sans réelles routes serveur.
- Équipe peu familière avec les web fundamentals.

### Astro

**Quoi** : framework orienté **content sites** (blog, documentation, marketing). Génère du HTML statique avec **islands d'interactivité** React (ou Vue, Svelte, etc.).

**Forces** :

- **HTML par défaut** — JS chargé seulement où nécessaire.
- Performance excellente (lighthouse 100/100 facilement).
- Polyglotte — supporte plusieurs frameworks côte à côte.

**Limites** :

- Pas adapté aux **apps interactives** lourdes (dashboards, SaaS).
- Modèle d'island parfois déroutant pour qui pense "tout React".

**Quand le choisir** :

- Blog, documentation, marketing site.
- Performance critique (Core Web Vitals à viser).
- Contenu **statique-dominant** avec interactivité ponctuelle.

**Quand l'éviter** :

- App SaaS avec écran-après-écran d'interactivité.
- Besoins de SSR temps réel sur tout le site.

### Vite + React

**Quoi** : bundler ultra-rapide qui sert React en SPA classique. Pas de SSR par défaut, pas de conventions.

**Forces** :

- **Démarrage instantané** en dev (HMR < 100 ms).
- **Configuration minimale**.
- Pas d'opinion forte — on assemble librement.

**Limites** :

- Pas de SSR clés en main (mais possible via SSR mode + lib).
- Aucune convention — tout est à structurer soi-même.
- SEO limité (SPA pure).

**Quand le choisir** :

- App interne / dashboard sans SEO.
- Migration de Create React App (déprécié depuis 2024).
- Apprentissage de React sans la complexité d'un méta-framework.

**Quand l'éviter** :

- Site public nécessitant SEO.
- Application complexe full-stack — Next.js plus mûr.

### Tableau de synthèse

| Critère             | Next.js         | Remix (RR v7) | Astro       | Vite        |
| ------------------- | --------------- | ------------- | ----------- | ----------- |
| SSR / SSG           | ✓ + ISR         | ✓ streaming   | ✓ + islands | ✗           |
| API routes          | ✓               | ✓ (actions)   | Limitées    | ✗           |
| SEO                 | ★★★             | ★★★           | ★★★         | ★           |
| Performance content | ★★              | ★★            | ★★★         | ★★          |
| Performance app     | ★★★             | ★★★           | ★★          | ★★★         |
| Complexité          | Moyenne / haute | Moyenne       | Faible      | Très faible |
| Lock-in hébergeur   | Vercel-friendly | Faible        | Faible      | Aucun       |
| Communauté (2025)   | ★★★★            | ★★★           | ★★★         | ★★★★        |

---

## 4. Vue d'ensemble des state managers

### Les quatre catégories

| Catégorie               | Exemple                           | Pour quel besoin                       |
| ----------------------- | --------------------------------- | -------------------------------------- |
| **Local + propagation** | useState + Context                | État partagé entre quelques composants |
| **Global flux**         | Redux, Zustand, Jotai             | État global complexe                   |
| **Server state**        | TanStack Query (React Query), SWR | Données serveur (fetch, cache, sync)   |
| **Reactive observable** | MobX, Valtio                      | Programmation réactive                 |

### Distinction fondamentale — client state vs server state

C'est la révélation des 5 dernières années :

- Le **client state** (UI, formulaires, sélection) est différent du **server state** (données fetched).
- **Redux pour tout** est un anti-pattern moderne — il mélange les deux.
- TanStack Query résout le server state ; le client state se gère avec un store plus léger.

**Règle moderne** : _server state → TanStack Query, client state → Zustand / Context / useState_.

---

## 5. Détail par state manager

### Context API (built-in React)

**Quand** : partager un état entre **quelques composants** dans un sous-arbre.

**Avantages** :

- Zéro dépendance.
- Simple à comprendre.

**Limites** :

- **Toute consommation re-rend** quand le Context change (pas de granular subscription).
- Pas adapté à de l'état **fréquemment mutant** dans un grand arbre.

**À éviter pour** : état global d'app entière, state évolutif.

### Redux + Redux Toolkit

**Quand** : app avec **state global complexe**, **time-travel debugging** crucial, équipe à l'aise avec le pattern flux.

**Avantages** :

- Mature, immense communauté.
- DevTools puissants (action history, replay).
- Pattern reducer prévisible.

**Limites** :

- **Boilerplate** historique (atténué par RTK).
- Surdimensionné pour la plupart des projets.
- Confond souvent client state et server state (à corriger avec RTK Query).

**Quand l'éviter** : nouveau projet petit / moyen — Zustand suffit.

### Zustand

**Quand** : besoin de **state global léger**, API minimale.

**Avantages** :

- API en ~10 lignes pour créer un store.
- Pas de provider / hook conditional — utilisable partout.
- Performance excellente (subscriptions granulaires).

**Limites** :

- Moins de DevTools avancés qu'avec Redux.
- Pas de pattern reducer imposé — discipline à maintenir.

**Quand l'utiliser** : par défaut pour client state global en 2025.

### Jotai

**Quand** : modèle **atomique** — chaque pièce d'état est un atom indépendant, composable.

**Avantages** :

- Approche "bottom-up" — atomes simples, composition via dérivation.
- Subscriptions granulaires automatiques.
- Très adapté aux formulaires complexes ou aux états locaux distribués.

**Limites** :

- Modèle mental moins familier (atomes vs store).
- Communauté plus petite que Zustand.

### TanStack Query (React Query)

**Quand** : **données serveur** — fetch, cache, invalidation, retry, polling, mutations.

**Avantages** :

- Résout 80 % des problèmes "client/serveur" : cache, dédupli, refetch.
- Mutations + invalidation déclaratives.
- DevTools intégrés.

**Limites** :

- Courbe d'apprentissage pour comprendre cache et invalidation.
- Pas un client state manager — il faut un autre outil pour le client state.

**Quand l'utiliser** : **toujours** dès qu'il y a du fetch de données. Aucun bon argument pour ne pas l'utiliser en 2025.

### Tableau de synthèse

| Critère                 | Context | Redux Toolkit      | Zustand | Jotai | TanStack Query |
| ----------------------- | ------- | ------------------ | ------- | ----- | -------------- |
| Server state            | ✗       | ✗ (sauf RTK Query) | ✗       | ✗     | ✓ ★★★          |
| Client state            | ★       | ★★★                | ★★★     | ★★    | ✗              |
| Boilerplate             | ★       | ★★★                | ★       | ★     | ★★             |
| Granularité (re-render) | ★       | ★★                 | ★★★     | ★★★   | ★★★            |
| DevTools                | ★       | ★★★                | ★★      | ★★    | ★★★            |
| Courbe d'apprentissage  | ★       | ★★★                | ★       | ★★    | ★★             |
| Taille bundle           | 0 ko    | ~10 ko             | ~1 ko   | ~3 ko | ~13 ko         |

---

## 6. Méthode de choix

### Questions à se poser avant de décider

**Sur le framework** :

1. Y a-t-il du **SEO** à viser ? Si oui, SPA exclu.
2. Combien de **contenu statique** vs interactif ?
3. Quelle est la **plateforme d'hébergement** souhaitée ?
4. L'équipe a-t-elle déjà un acquis sur un framework ?

**Sur le state manager** :

1. Y a-t-il du **server state** ? Si oui → TanStack Query.
2. Y a-t-il du **client state global** non trivial ? Si oui → Zustand par défaut.
3. Y a-t-il besoin de **time-travel debugging** ? Si oui → Redux.
4. Combien de **composants** partagent l'état ? Si peu (< 5), un Context ou un useState propagé suffit.

### Anti-patterns courants

- **Redux pour tout** — confond client et server state. Migrer vers RTK Query + Zustand.
- **TanStack Query pour le client state** — détourne l'outil.
- **Context partout** — chaque consommateur re-rend, vite ingérable.
- **Multiple state managers superposés** sans raison — Zustand + Jotai + Redux dans le même projet = dette technique.

---

## 7. Exercices pratiques

### Exercice 1 — Identifier le besoin (≈ 20 min)

Pour chaque scénario, recommander framework + state manager :

1. Une **agence** veut un site vitrine de 8 pages, avec un blog et un formulaire de contact.
2. Une **startup** lance un dashboard SaaS pour des admins (auth, table, filtres, charts).
3. Une **équipe e-commerce** monte une boutique en ligne avec checkout et catalogue de 50 000 produits.
4. Une **équipe interne** crée un outil de gestion RH (formulaires nombreux, rapports PDF, pas de SEO).
5. Un **développeur seul** veut publier sa documentation OSS avec exemples interactifs.

Justifier chaque choix en 2-3 lignes.

### Exercice 2 — Matrice comparative frameworks (≈ 30 min)

Construire une matrice **personnalisée** pour un projet hypothétique :

- **Projet** : plateforme de réservation de billets de spectacle.
- **Contraintes** : SEO important (Google, App store), pic de trafic les soirs de mise en vente, équipe de 5 devs React.
- **Critères** : SEO, SSR, performance, taille équipe, hébergement, communauté.

Lignes = frameworks (3+) × colonnes = critères. Notation 0-5. Recommandation finale + justification.

### Exercice 3 — Migrer un Context vers Zustand (≈ 35 min)

Soit un Context qui partage l'utilisateur authentifié dans 30+ composants :

```jsx
const UserContext = createContext(null);

function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}
```

Problème : tout consommateur re-rend dès qu'on touche au user.

Refactorer avec **Zustand** :

```jsx
const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

Comparer les rendus avant / après dans le Profiler.

### Exercice 4 — TanStack Query (≈ 35 min)

Installer `@tanstack/react-query`. Implémenter un composant `<UserProfile id={42}>` qui :

1. Fait un GET sur `/api/users/42`.
2. Cache pendant 5 minutes.
3. Refetch automatique au focus de la fenêtre.
4. Affiche un loader pendant le fetch.
5. Affiche une erreur si fetch échoue.

Puis ajouter un bouton "Update" qui mute le user et **invalide le cache** pour forcer un refetch.

### Exercice 5 — Note de cadrage (≈ 30 min)

Rédiger une **note de cadrage** d'une page pour un nouveau projet :

- Recommandation framework (3 candidats comparés).
- Recommandation state manager (3 candidats comparés).
- 2 risques anticipés + mitigation.

Maximum 600 mots, destinée à un manager non-tech qui valide les choix.

---

## 8. Mini-défi de synthèse — matrice comparative complète (≈ 1,5 à 2 heures)

Choisir **un projet hypothétique réaliste** (au choix) et produire une **matrice comparative complète** :

### Format

| Critère           | Poids (1-5) | Next.js | Remix  | Astro  | Vite   |
| ----------------- | ----------- | ------- | ------ | ------ | ------ |
| SEO               | 5           | 5       | 5      | 5      | 1      |
| Time-to-market    | 3           | 4       | 3      | 4      | 5      |
| Performance       | 4           | 4       | 5      | 5      | 4      |
| Lock-in hébergeur | 2           | 3       | 5      | 5      | 5      |
| Communauté        | 3           | 5       | 4      | 4      | 5      |
| **Total pondéré** |             | **74**  | **70** | **75** | **57** |

### Livrables

1. La matrice **frameworks** (au moins 4 candidats).
2. La matrice **state managers** (au moins 4 candidats).
3. **Justification** de chaque pondération.
4. **Recommandation finale** assumée pour ce projet.
5. Liste de **3 risques** + mitigation.
6. Liste de **3 critères de révision** dans 12 mois (à quels signaux on changerait d'avis).

### Validation

- [ ] Les pondérations reflètent réellement les contraintes projet (pas génériques).
- [ ] Au moins une option "minoritaire" obtient un score honorable — c'est une matrice, pas un sondage de popularité.
- [ ] La recommandation est tranchée, pas indécise.
- [ ] Le document tient sur 2 pages maximum.

---

## 9. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant cite **4 frameworks React** et donne un cas d'usage pour chacun.
- [ ] Il distingue **server state** et **client state** et explique pourquoi.
- [ ] Il connaît **4 state managers** et leur cas d'usage.
- [ ] Il peut construire une matrice comparative pondérée.
- [ ] Il défend un choix d'écosystème devant un sceptique.
- [ ] La matrice du mini-défi est complète et défendable à l'oral.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : comparer la pertinence des frameworks React, conseiller sur le state manager selon le contexte.

---

## 10. Ressources complémentaires

- **Documentation Next.js** : [nextjs.org](https://nextjs.org). En particulier la section App Router et Server Components.
- **Documentation React Router v7** (anciennement Remix) : [reactrouter.com](https://reactrouter.com).
- **Documentation Astro** : [docs.astro.build](https://docs.astro.build).
- **Documentation Vite** : [vitejs.dev](https://vitejs.dev).
- **TanStack Query** : [tanstack.com/query](https://tanstack.com/query). Docs très bien faites.
- **Zustand** : [zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs).
- **Redux Toolkit** : [redux-toolkit.js.org](https://redux-toolkit.js.org).
- **Jotai** : [jotai.org](https://jotai.org).
- **State of JavaScript** : [stateofjs.com](https://stateofjs.com). Sondage annuel sur l'écosystème — utile pour suivre les tendances.
- **Lee Robinson** (Vercel) et **Ryan Florence** (Remix / React Router) — comptes Twitter/X de référence pour suivre l'évolution.
