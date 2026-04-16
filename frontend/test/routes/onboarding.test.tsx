import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

import Onboarding from "~/routes/onboarding";

function renderApp() {
  const Stub = createRoutesStub([
    { path: "/onboarding", Component: Onboarding },
    { path: "/chats", Component: () => <div>chats home</div> },
  ]);
  return render(<Stub initialEntries={["/onboarding"]} />);
}

describe("Onboarding", () => {
  it("renders the four setup steps", () => {
    renderApp();

    expect(screen.getByText("Connect wallet")).toBeInTheDocument();
    expect(screen.getByText("Detect Bee node")).toBeInTheDocument();
    expect(screen.getByText("Postage batch")).toBeInTheDocument();
    expect(screen.getByText("Register profile")).toBeInTheDocument();
  });

  it("walks through the wizard and reveals the display-name input on the last step", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const input = screen.getByPlaceholderText("Display name");
    expect(input).toBeInTheDocument();
    await user.type(input, "alice");
    expect(input).toHaveValue("alice");

    expect(
      screen.getByRole("link", { name: /enter swarmchat/i }),
    ).toHaveAttribute("href", "/chats");
  });

  it("disables Back on the first step", () => {
    renderApp();
    const back = screen.getByRole("button", { name: /back/i });
    expect(back).toBeDisabled();
  });
});
