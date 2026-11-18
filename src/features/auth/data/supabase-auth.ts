import type { AuthChangeEvent } from "@supabase/supabase-js";
import { startLogin, clearLogin } from "./login-storage";
import { backend } from "../../../shared/data/supabase";
import { safeReturnPath } from "../logic/auth-navigation";

export async function signIn(
  returnTo = location.pathname + location.search + location.hash,
) {
  const target = safeReturnPath(
    returnTo,
    location.origin,
    import.meta.env.BASE_URL,
  );
  startLogin(target);
  const redirectTo = new URL(
    `${import.meta.env.BASE_URL}admin/`,
    location.origin,
  ).href;
  const { error } = await backend().auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo },
  });
  if (error) {
    clearLogin();
    throw error;
  }
}
export async function authorAccount() {
  const {
    data: { user },
    error,
  } = await backend().auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  if (!user) return { user: null, owner: false };
  const { data: owner, error: permissionError } =
    await backend().rpc("is_blog_owner");
  if (permissionError) throw permissionError;
  return { user, owner: owner === true };
}

export function subscribeAuth(listener: (event: AuthChangeEvent) => void) {
  return backend().auth.onAuthStateChange(listener);
}

export async function signOut() {
  const { error } = await backend().auth.signOut({ scope: "local" });
  if (error) throw error;
}
