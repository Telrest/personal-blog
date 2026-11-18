import { backendConfigured } from "../../../shared/data/supabase";
import { authorAccount, subscribeAuth } from "../data/supabase-auth";
import { safeReturnPath } from "../logic/auth-navigation";
import { pendingLogin, recordLoginResult } from "../data/login-storage";
import "./site-auth.css";
const base = import.meta.env.BASE_URL;
async function enter() {
  const login = pendingLogin();
  const pending = login.pending;
  const target = safeReturnPath(login.target, location.origin, base);
  const finish = (ok: boolean) => {
    recordLoginResult(ok);
    location.replace(target);
  };
  try {
    if (!backendConfigured) throw Error("Unavailable");
    const query = new URLSearchParams(location.search),
      hash = new URLSearchParams(location.hash.slice(1));
    if (query.has("error") || hash.has("error")) throw Error("OAuth failed");
    const account = await authorAccount();
    if (pending) {
      finish(Boolean(account.user));
      return;
    }
    if (!account.user || !account.owner) {
      location.replace(base);
      return;
    }
    document.getElementById("admin-gate")!.hidden = true;
    document.getElementById("author-workspace")!.hidden = false;
    await import("../../writing/ui/writing");
    subscribeAuth((event) => {
      if (event === "SIGNED_OUT") {
        document.getElementById("author-workspace")!.hidden = true;
        location.replace(base);
      }
    });
  } catch {
    if (pending) finish(false);
    else location.replace(base);
  }
}
void enter();
