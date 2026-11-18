import { watchVisitor, loginVisitor } from "../logic/visitor-auth";
import { entryState } from "../logic/auth-navigation";
import { consumeLoginFailure } from "../data/login-storage";
import "./site-auth.css";
document.querySelectorAll<HTMLElement>("[data-site-auth]").forEach((root) => {
  const login = root.querySelector<HTMLButtonElement>("[data-login-button]")!,
    writing = root.querySelector<HTMLElement>("[data-author-link]"),
    feedback = root.querySelector<HTMLElement>("[data-login-feedback]")!;
  let failure = consumeLoginFailure();
  const message = (text: string) => {
    if (feedback.textContent === text) return;
    feedback.textContent = text;
    feedback.classList.remove("auth-fade-in");
    void feedback.offsetWidth;
    feedback.classList.add("auth-fade-in");
  };
  watchVisitor((account) => {
    const view = entryState(account.state);
    login.hidden = !view.login;
    login.disabled = account.state === "pending";
    if (writing) writing.hidden = !view.writing;
    message(
      failure && view.login
        ? "登录失败，可以再次尝试"
        : root.closest("[data-comments]") && account.userId
          ? ""
          : view.message,
    );
    if (account.state === "member" || account.state === "author")
      failure = false;
  });
  login.addEventListener("click", async () => {
    login.disabled = true;
    try {
      await loginVisitor(
        location.pathname +
          location.search +
          (root.closest("[data-comments]") ? "#comments" : "#account-entry"),
      );
    } catch {
      message("登录失败，可以再次尝试");
      login.disabled = false;
    }
  });
});
