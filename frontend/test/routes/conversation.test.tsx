import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

import Conversation, { clientLoader } from "~/routes/_app.chats.$address";
import { MOCK_PROFILES } from "~/lib/mock-data";

const BOB = MOCK_PROFILES[0].address;

function renderApp(initial = `/chats/${BOB}`) {
  const Stub = createRoutesStub([
    {
      path: "/chats/:address",
      Component: Conversation,
      loader: clientLoader as never,
    },
    { path: "/call/:address", Component: () => <div>call view</div> },
  ]);
  return render(<Stub initialEntries={[initial]} />);
}

describe("Conversation", () => {
  it("renders the peer header and seeded message history", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    });

    expect(screen.getByText("hey")).toBeInTheDocument();
    expect(screen.getByText("hi alice")).toBeInTheDocument();
    expect(screen.getByText("how are you?")).toBeInTheDocument();
  });

  it("appends an outgoing message when the user hits Send", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "ping");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("ping")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("submits on Enter without Shift", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "via enter{Enter}");

    expect(await screen.findByText("via enter")).toBeInTheDocument();
  });

  it("disables Send for empty input", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("links call buttons to the call route", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByTitle(/voice call/i)).toBeInTheDocument();
    });
    expect(screen.getByTitle(/voice call/i)).toHaveAttribute(
      "href",
      `/call/${BOB}`,
    );
    expect(screen.getByTitle(/video call/i)).toHaveAttribute(
      "href",
      `/call/${BOB}?video=1`,
    );
  });
});
