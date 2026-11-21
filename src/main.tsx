import "./index.css";

const view = new URLSearchParams(window.location.search).get("view");

if (import.meta.env.DEV) {
  const fwd = (m: string) => import("@tauri-apps/api/core").then((c) => c.invoke("js_log", { msg: m }));
  window.addEventListener("error", (e) => void fwd(`error: ${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => void fwd(`rejection: ${String(e.reason?.stack ?? e.reason)}`));
}

if (view === "pet") {
  import("./pet/pet").then((m) => m.startPet());
} else {
  Promise.all([import("react"), import("react-dom/client"), import("./settings/App")]).then(
    ([React, { createRoot }, { App }]) => {
      createRoot(document.getElementById("root")!).render(React.createElement(App));
    },
  );
}
