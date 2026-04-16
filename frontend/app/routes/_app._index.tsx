import { redirect } from "react-router";

import type { Route } from "./+types/_app._index";

export function loader(_: Route.LoaderArgs) {
  return redirect("/chats");
}
