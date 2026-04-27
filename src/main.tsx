import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale chunk references after a redeploy.
// When Vite generates new hashed chunks, an old index.js cached in the
// browser may point to a filename that no longer exists, throwing
// "Failed to fetch dynamically imported module". We detect that exact
// error and force a single hard reload to pick up the fresh manifest.
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;
const RELOAD_FLAG = "__chunkReloadAt";

function shouldReload(message: string | undefined) {
  if (!message || !CHUNK_ERROR_RE.test(message)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
    if (Date.now() - last < 10_000) return false; // avoid reload loop
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

window.addEventListener("error", (event) => {
  if (shouldReload(event.message)) {
    window.location.reload();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason ?? "");
  if (shouldReload(msg)) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
