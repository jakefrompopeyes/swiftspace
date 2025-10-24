
import { createRoot } from "react-dom/client";
// Polyfill Buffer for browser per Vite warning (used by Solana libs)
import { Buffer } from "buffer";
// @ts-ignore
if (!window.Buffer) window.Buffer = Buffer;
  import App from "./App.tsx";
  import "./index.css";

  createRoot(document.getElementById("root")!).render(<App />);
  