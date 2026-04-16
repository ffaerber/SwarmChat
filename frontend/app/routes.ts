import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("onboarding", "routes/onboarding.tsx"),
  layout("routes/_app.tsx", [
    index("routes/_app._index.tsx"),
    route("chats", "routes/_app.chats.tsx", [
      route(":address", "routes/_app.chats.$address.tsx"),
    ]),
    route("directory", "routes/_app.directory.tsx"),
    route("settings", "routes/_app.settings.tsx"),
    route("call/:address", "routes/_app.call.$address.tsx"),
  ]),
] satisfies RouteConfig;
