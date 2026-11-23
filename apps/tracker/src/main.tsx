import "@blue-orchid/web/styles.css";

import { mount } from "@blue-orchid/web";
import { auth } from "void/client";

const root = document.getElementById("root");

if (root !== null) {
  mount(root, {
    signIn: () => auth.signIn.social({ provider: "discord", callbackURL: window.location.href }),
    signOut: () => auth.signOut().then(() => window.location.reload()),
  });
}
