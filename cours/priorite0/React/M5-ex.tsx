// ? Soit un Context qui partage l'utilisateur authentifié dans 30+ composants :
// * const UserContext = createContext(null);
// * function UserProvider({ children }) {
// *   const [user, setUser] = useState(null);
// *   return (
// *     <UserContext.Provider value={{ user, setUser }}>
// *       {children}
// *     </UserContext.Provider>
// *   );
// * }
// ! Problème : tout consommateur re-rend dès qu'on touche au user. Refactorer avec Zustand.

import { create } from "zustand";

const useUserStore = create((set) => ({
  user: null,
  setUser: (newUser) => set({ user: newUser }),
}));

function UserProfileZs() {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  return (
    <div>
      <h1>User Profile</h1>
      {user ? (
        <div>
          <p>Name: {user.name}</p>
          <button onClick={() => setUser(null)}>Logout</button>
        </div>
      ) : (
        <button onClick={() => setUser({ name: "John Doe" })}>Login</button>
      )}
    </div>
  );
}

function UserSettingsZs() {
  const user = useUserStore((state) => state.user);

  return (
    <div>
      <h1>User Settings</h1>
      {user ? (
        <p>Settings for {user.name}</p>
      ) : (
        <p>Please log in to see settings.</p>
      )}
    </div>
  );
}

export function AppZs() {
  return (
    <div>
      <UserProfileZs />
      <UserSettingsZs />
    </div>
  );
}

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// ? TanStack Query : Implémenter un composant <UserProfile id={42}>.
// - Fait un GET sur /api/users/42.
// - Cache pendant 5 minutes.
// - Refetch automatique au focus de la fenêtre.
// - Affiche un loader pendant le fetch.
// - Affiche une erreur si fetch échoue.
// - Puis ajouter un bouton "Update" qui mute le user et invalide le cache pour forcer un refetch.

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export function UserProfileTsq({ id = 42 }) {
  const tsqQueryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetch(`/api/users/${id}`).then((res) => res.json()),
    staleTime: 5 * 60 * 1000, // ? 5 minutes
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: (newUserData) =>
      fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserData),
      }).then((res) => res.json()),
    onSuccess: () =>
      tsqQueryClient.invalidateQueries({ queryKey: ["user", id] }),
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h1>User Profile</h1>
      <p>Name: {data.name}</p>
      <button
        onClick={() => mutation.mutate({ name: "Updated Name" })}
        disabled={mutation.isLoading}
      >
        Update
      </button>
    </div>
  );
}

export function AppTsq() {
  const tsqQueryClient = new QueryClient();

  return (
    <QueryClientProvider client={tsqQueryClient}>
      <UserProfileTsq id={42} />
    </QueryClientProvider>
  );
}
