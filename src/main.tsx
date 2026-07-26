import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import Projector from "../src/components/Projector";
import Console from "./components/Console";
import "./index.css";

// Global shortcut listener for Ctrl+Shift+I (or Cmd+Shift+I)
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyI") {
    e.preventDefault();
    invoke("open_console_window").catch((err: unknown) => {
      console.error("Failed to open console window:", err);
    });
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/projector" element={<Projector />} />
        <Route path="/console" element={<Console />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);