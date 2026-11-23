import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Auth } from "./router.tsx";
import { makeRouter } from "./router.tsx";

export type { Auth } from "./router.tsx";

export const mount = (element: HTMLElement, auth: Auth) => {
  createRoot(element).render(
    <StrictMode>
      <RouterProvider router={makeRouter(auth)} />
    </StrictMode>,
  );
};
