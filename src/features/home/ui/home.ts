import "./immersive";
import "../../auth/ui/site-auth";
const menuButton = document.querySelector<HTMLButtonElement>(".menu-toggle");
const mobileMenu = document.querySelector<HTMLElement>("#mobile-navigation");
function closeMenu() {
  if (mobileMenu) mobileMenu.hidden = true;
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "打开导航菜单");
}
menuButton?.addEventListener("click", () => {
  if (!mobileMenu) return;
  const open = mobileMenu.hidden;
  mobileMenu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
});
mobileMenu
  ?.querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu && !mobileMenu.hidden) {
    closeMenu();
    menuButton?.focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    event.target instanceof Node &&
    !document.querySelector(".site-header")?.contains(event.target)
  )
    closeMenu();
});
document
  .querySelectorAll<HTMLButtonElement>(".category-tab")
  .forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelectorAll(".category-tab").forEach((tab) => {
        tab.classList.remove("selected");
        tab.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      let visible = 0;
      document
        .querySelectorAll<HTMLElement>("[data-post-category]")
        .forEach((card) => {
          card.hidden =
            button.dataset.category !== "全部" &&
            card.dataset.postCategory !== button.dataset.category;
          if (!card.hidden) visible++;
        });
      const empty = document.querySelector<HTMLElement>(".empty-journal");
      if (empty) empty.hidden = visible > 0;
      const title = document.querySelector("#empty-title");
      const description = document.querySelector("#empty-description");
      if (title)
        title.textContent =
          button.dataset.category === "全部"
            ? "第一篇，还没想好写什么。"
            : `「${button.dataset.category}」还没有文章。`;
      if (description)
        description.textContent = "暂时还没有写什么，可能需要我再经历更多。";
    }),
  );
const header = document.querySelector(".site-header");
const updateHeader = () =>
  header?.classList.toggle("scrolled", window.scrollY > 70);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
const navLinks = document.querySelectorAll<HTMLAnchorElement>(".nav-link");
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        navLinks.forEach((link) => {
          const active = link.hash === `#${entry.target.id}`;
          link.classList.toggle("active", active);
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
  },
  { rootMargin: "-18% 0px -42% 0px", threshold: 0 },
);
document
  .querySelectorAll("main section[id]")
  .forEach((section) => observer.observe(section));
