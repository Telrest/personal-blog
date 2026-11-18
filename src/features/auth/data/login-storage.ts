const returnKey = "blog-login-return";
const pendingKey = "blog-login-pending";
const resultKey = "blog-login-result";

export function startLogin(target: string) {
  sessionStorage.setItem(returnKey, target);
  sessionStorage.setItem(pendingKey, "1");
}

export function clearLogin() {
  sessionStorage.removeItem(pendingKey);
  sessionStorage.removeItem(returnKey);
}

export function pendingLogin() {
  try {
    return {
      pending: sessionStorage.getItem(pendingKey) === "1",
      target: sessionStorage.getItem(returnKey),
    };
  } catch {
    return { pending: false, target: null };
  }
}

export function recordLoginResult(ok: boolean) {
  try {
    clearLogin();
    sessionStorage.setItem(resultKey, ok ? "success" : "error");
  } catch {}
}

export function consumeLoginFailure() {
  try {
    const failed = sessionStorage.getItem(resultKey) === "error";
    sessionStorage.removeItem(resultKey);
    return failed;
  } catch {
    return false;
  }
}
