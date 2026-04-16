import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

import Directory, { clientLoader } from "~/routes/_app.directory";

function renderApp() {
  const Stub = createRoutesStub([
    {
      path: "/directory",
      Component: Directory,
      loader: clientLoader as never,
    },
    {
      path: "/chats/:address",
      Component: () => <div>chat opened</div>,
    },
  ]);
  return render(<Stub initialEntries={["/directory"]} />);
}

describe("Directory", () => {
  it("renders mock profiles", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Dan")).toBeInTheDocument();
    expect(screen.getByText("Eve")).toBeInTheDocument();
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText(/search address, name or ens/i),
      "char",
    );

    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Dan")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText(/search address, name or ens/i),
      "zzznotreal",
    );

    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("flags inactive profiles", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText("Eve")).toBeInTheDocument();
    });
    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });
});
