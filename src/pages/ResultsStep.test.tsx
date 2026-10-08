import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsStep } from "./ResultsStep";
import { AppContext, type AppContextValue } from "../lib/AppContext";
import { extractFromText, mergeExtracted } from "../domain/extract";
import { emptyQuote, newProject, DEFAULT_PRIORITIES } from "../domain/quote";
import { getTrade } from "../domain/trades";
import { SAMPLE_QUOTES } from "../domain/samples";
import type { Project } from "../domain/types";

function project(extra = 0): Project {
  const p = newProject();
  p.state = "TX";
  p.priorities = { ...DEFAULT_PRIORITIES };
  p.quotes = SAMPLE_QUOTES.map((s) => {
    const q = mergeExtracted(emptyQuote(), extractFromText(s.text, getTrade("roofing")));
    q.agent = { ...s.agent, comment: "" };
    return q;
  });
  for (let i = 0; i < extra; i++) p.quotes.push({ ...p.quotes[0], id: `extra${i}` });
  return p;
}

function ctx(over: Partial<AppContextValue> = {}): AppContextValue {
  return {
    user: { id: "u1", email: "a@example.com" },
    payments: "demo",
    requireAccount: async () => true,
    flushProject: async () => undefined,
    refreshProject: async () => undefined,
    ...over,
  };
}

function renderResults(p: Project, c: AppContextValue = ctx()) {
  return render(
    <AppContext.Provider value={c}>
      <ResultsStep project={p} onChange={() => {}} />
    </AppContext.Provider>,
  );
}

describe("ResultsStep", () => {
  beforeAll(() => {
    // jsdom has no <dialog> methods
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("locks the verdict until a plan is bought", () => {
    renderResults(project());
    expect(screen.getByText("See who to hire, and who to avoid")).toBeInTheDocument();
    expect(screen.queryByText(/^Hire /)).not.toBeInTheDocument();
  });

  it("disables plans that can't hold the quote count", async () => {
    const user = userEvent.setup();
    renderResults(project(2)); // 5 quotes
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.querySelector("input[value=basic]")).toBeDisabled();
    expect(dialog.querySelector("input[value=plus]")).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Pay $39 and unlock" })).toBeEnabled();
  });

  it("asks for an account before showing plans, and stops if they decline", async () => {
    const user = userEvent.setup();
    const requireAccount = vi.fn(async () => false);
    renderResults(project(), ctx({ user: null, requireAccount }));
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    expect(requireAccount).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("buys through the server and refreshes the project's plan", async () => {
    const user = userEvent.setup();
    const refreshProject = vi.fn(async () => undefined);
    const flushProject = vi.fn(async () => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ demo: true, plan: "plus" }), { status: 200 }));
    renderResults(project(), ctx({ refreshProject, flushProject }));
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    await user.click(screen.getByRole("button", { name: /Pay \$39/ }));
    await vi.waitFor(() => expect(refreshProject).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/projects\/.+\/checkout/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ plan: "plus" });
    expect(flushProject).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows the server's reason when checkout fails and leaves the dialog open", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Payments aren't available right now." }), { status: 503 }));
    renderResults(project());
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    await user.click(screen.getByRole("button", { name: /Pay \$39/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payments aren't available right now.");
    fetchSpy.mockRestore();
  });
});

describe("sample projects", () => {
  it("say so, and never trigger real lookups", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const p = project();
    p.sample = true;
    p.plan = "plus";
    renderResults(p);
    expect(screen.getByText(/This is a sample project/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/api/license"));
    fetchSpy.mockRestore();
  });
});
