import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import App from "./App";

let rootEl = document.getElementById("app");
if (!rootEl) {
  rootEl = document.createElement("div");
  rootEl.id = "app";
  document.body.appendChild(rootEl);
}

ReactDOM.createRoot(rootEl).render(
  React.createElement(React.StrictMode, null, React.createElement(App))
);
