import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import Projector from "../src/components/Projector";
import Console from "./components/Console";
import "./index.css";

listen("backend-log", (event) => {
  console.log("BACKEND:", event.payload);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/projector" element={<Projector />} />
        <Route path="/console" element={<Console />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);