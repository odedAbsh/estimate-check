import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsStep } from "./ResultsStep";
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
    render(<ResultsStep project={project()} onChange={() => {}} />);
    expect(screen.getByText("See who to hire, and who to avoid")).toBeInTheDocument();
    expect(screen.queryByText(/^Hire /)).not.toBeInTheDocument();
  });

  it("disables plans that can't hold the quote count", async () => {
    const user = userEvent.setup();
    render(<ResultsStep project={project(2)} onChange={() => {}} />); // 5 quotes
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.querySelector("input[value=basic]")).toBeDisabled();
    expect(dialog.querySelector("input[value=plus]")).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Pay $39 and unlock" })).toBeEnabled();
  });

  it("saves the chosen plan after the demo checkout", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResultsStep project={project()} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Unlock from/ }));
    await user.click(screen.getByRole("button", { name: /Pay \$39/ }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ plan: "plus" })));
  });
});

describe("sample projects", () => {
  it("say so, and never trigger real lookups", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const p = project();
    p.sample = true;
    p.plan = "plus";
    render(<ResultsStep project={p} onChange={() => {}} />);
    expect(screen.getByText(/This is a sample project/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/api/license"));
    fetchSpy.mockRestore();
  });
});
