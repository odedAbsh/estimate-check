import { useRef, useState } from "react";
import type { Quote, ScopeStatus } from "../domain/types";
import type { Trade } from "../domain/trades";
import { mergeExtracted } from "../domain/extract";
import { extractQuote } from "../lib/api";
import { Dialog } from "./Dialog";
import { NumberField, Segmented, StarRating, TextField } from "./Fields";

interface Props {
  open: boolean;
  initial: Quote;
  trade: Trade;
  isNew: boolean;
  onSave: (q: Quote) => void;
  onClose: () => void;
}

const SCOPE_OPTIONS: { value: ScopeStatus; label: string }[] = [
  { value: "included", label: "Included" },
  { value: "excluded", label: "Not included" },
  { value: "unclear", label: "Not stated" },
];

function countFilled(before: Quote, after: Quote): number {
  let n = 0;
  for (const k of Object.keys(after.contractor) as (keyof Quote["contractor"])[]) {
    if (after.contractor[k] !== before.contractor[k]) n++;
  }
  for (const k of ["total", "timelineDays", "warrantyLaborYears", "warrantyMaterialsYears", "depositPercent", "validUntil", "cashOnly"] as const) {
    if (after[k] !== before[k]) n++;
  }
  if (after.lineItems.length !== before.lineItems.length) n++;
  for (const id of Object.keys(after.scope)) if (after.scope[id] !== before.scope[id] && after.scope[id] !== "unclear") n++;
  return n;
}

export function QuoteEditor({ open, initial, trade, isNew, onSave, onClose }: Props) {
  const [q, setQ] = useState<Quote>(initial);
  const [paste, setPaste] = useState(initial.rawText);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const c = q.contractor;
  const setC = (patch: Partial<Quote["contractor"]>) => setQ((x) => ({ ...x, contractor: { ...x.contractor, ...patch } }));
  const set = (patch: Partial<Quote>) => setQ((x) => ({ ...x, ...patch }));
  const setAgent = (patch: Partial<Quote["agent"]>) => setQ((x) => ({ ...x, agent: { ...x.agent, ...patch } }));
  const nameError = !c.businessName.trim() ? "Add the company name so you can tell quotes apart." : "";

  async function read() {
    if (!file && !paste.trim()) {
      setReadMsg({ kind: "warn", text: "Choose a file or paste the quote text first." });
      return;
    }
    setReading(true);
    setReadMsg(null);
    try {
      const result = await extractQuote(trade, { text: paste, file: file ?? undefined });
      const merged = mergeExtracted(q, { ...result.data, rawText: paste || result.data.rawText });
      const filled = countFilled(q, merged);
      setQ(merged);
      if (result.warning) setReadMsg({ kind: "warn", text: result.warning });
      else if (filled === 0) setReadMsg({ kind: "warn", text: "We couldn't find details we recognize. Fill in the form below; it only takes a minute." });
      else setReadMsg({ kind: "ok", text: `Filled in ${filled} detail${filled === 1 ? "" : "s"}${result.method === "ai" ? " with AI reading" : ""}. Check them below, then save.` });
    } catch (e) {
      setReadMsg({ kind: "warn", text: e instanceof Error ? `${e.message} You can still fill in the form.` : "Couldn't read that document. You can still fill in the form." });
    } finally {
      setReading(false);
    }
  }

  function save() {
    setSubmitted(true);
    if (nameError) {
      document.getElementById("quote-business")?.focus();
      return;
    }
    onSave({ ...q, rawText: paste || q.rawText });
  }

  return (
    <Dialog
      open={open}
      wide
      title={isNew ? "Add a quote" : `Edit ${c.businessName || "quote"}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save quote</button>
        </>
      }
    >
      <section className="reader" aria-labelledby="reader-title">
        <h3 id="reader-title">Fill in from the quote</h3>
        <p className="hint">Upload the PDF or photo, or paste the text from an email. We'll fill in what we can.</p>
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <input
            ref={fileInput}
            id="quote-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p>
              <strong>{file.name}</strong>{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                Remove file
              </button>
            </p>
          ) : (
            <p>
              Drag a PDF or photo here, or{" "}
              <label htmlFor="quote-file" className="link-btn">choose a file</label>
            </p>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="quote-paste">Or paste the quote text</label>
          <textarea id="quote-paste" className="input mono" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} />
        </div>
        <div className="reader-actions">
          <button type="button" className="btn btn-secondary" onClick={read} disabled={reading} aria-busy={reading}>
            {reading ? <span className="spinner" aria-hidden="true" /> : null}
            {reading ? "Reading quote" : "Read quote"}
          </button>
          <p role="status" className={readMsg ? `notice notice-${readMsg.kind}` : "sr-only"}>{readMsg?.text}</p>
        </div>
      </section>

      <section className="form-section" aria-labelledby="sec-company">
        <h3 id="sec-company">The company</h3>
        <div className="row-2">
          <div className="field">
            <label className="label" htmlFor="quote-business">Company name</label>
            <input
              id="quote-business"
              className="input"
              value={c.businessName}
              aria-invalid={Boolean(submitted && nameError)}
              aria-describedby={submitted && nameError ? "quote-business-err" : undefined}
              onChange={(e) => setC({ businessName: e.target.value })}
            />
            {submitted && nameError && <p id="quote-business-err" className="error">{nameError}</p>}
          </div>
          <TextField label="License number" optional value={c.licenseNumber} onChange={(v) => setC({ licenseNumber: v })} hint="Usually printed near the company name. We verify it." />
        </div>
        <div className="row-3">
          <TextField label="Phone" optional type="tel" inputMode="tel" value={c.phone} onChange={(v) => setC({ phone: v })} />
          <TextField label="Email" optional type="email" inputMode="email" value={c.email} onChange={(v) => setC({ email: v })} />
          <TextField label="Website" optional inputMode="url" value={c.website} onChange={(v) => setC({ website: v })} />
        </div>
        <div className="row-3">
          <NumberField label="Years in business" optional value={c.yearsInBusiness} onChange={(v) => setC({ yearsInBusiness: v })} max={150} />
          <NumberField label="Review rating" optional value={c.reviewRating} onChange={(v) => setC({ reviewRating: v })} min={1} max={5} step={0.1} suffix="★" hint="Google, Yelp or Angi average" />
          <NumberField label="Number of reviews" optional value={c.reviewCount} onChange={(v) => setC({ reviewCount: v })} />
        </div>
        <Segmented
          legend="Insured?"
          name="insured"
          value={c.insured}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unknown", label: "Don't know" },
          ]}
          onChange={(v) => setC({ insured: v })}
        />
      </section>

      <section className="form-section" aria-labelledby="sec-price">
        <h3 id="sec-price">Price and terms</h3>
        <div className="row-3">
          <NumberField label="Total price" value={q.total} onChange={(v) => set({ total: v })} prefix="$" hint="The final number you'd pay" />
          <NumberField label="Deposit up front" optional value={q.depositPercent} onChange={(v) => set({ depositPercent: v })} suffix="%" max={100} />
          <NumberField label="Time to complete" optional value={q.timelineDays} onChange={(v) => set({ timelineDays: v })} suffix="days" />
        </div>
        <div className="row-3">
          <NumberField label="Labor warranty" optional value={q.warrantyLaborYears} onChange={(v) => set({ warrantyLaborYears: v })} suffix="years" />
          <NumberField label="Materials warranty" optional value={q.warrantyMaterialsYears} onChange={(v) => set({ warrantyMaterialsYears: v })} suffix="years" />
          <TextField label="Quote valid until" optional type="date" value={q.validUntil} onChange={(v) => set({ validUntil: v })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={q.cashOnly} onChange={(e) => set({ cashOnly: e.target.checked })} />
          They asked for cash only
        </label>
        {q.lineItems.length > 0 && (
          <details className="line-items">
            <summary>{q.lineItems.length} line items found</summary>
            <table>
              <tbody>
                {q.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.description}</td>
                    <td className="num">${li.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="form-section" aria-labelledby="sec-scope">
        <h3 id="sec-scope">What's included</h3>
        <p className="hint">A complete {trade.label.toLowerCase()} quote should cover these. Anything not included will cost you extra later.</p>
        <ul className="scope-list">
          {trade.scope.map((item) => (
            <li key={item.id}>
              <span id={`scope-${item.id}`}>{item.label}</span>
              <Segmented
                compact
                hideLegend
                legend={item.label}
                name={`scope-${item.id}`}
                value={q.scope[item.id] ?? "unclear"}
                options={SCOPE_OPTIONS}
                onChange={(v) => set({ scope: { ...q.scope, [item.id]: v } })}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="form-section" aria-labelledby="sec-rep">
        <h3 id="sec-rep">The person who gave you this quote</h3>
        <p className="hint">Your impression of the rep matters. The person selling the job often tells you how the job will be run.</p>
        <TextField label="Their name" optional value={c.agentName} onChange={(v) => setC({ agentName: v })} />
        <div className="row-3">
          <StarRating label="Professional" value={q.agent.professionalism} onChange={(v) => setAgent({ professionalism: v })} />
          <StarRating label="Explained clearly" value={q.agent.clarity} onChange={(v) => setAgent({ clarity: v })} />
          <StarRating label="Responsive" value={q.agent.responsiveness} onChange={(v) => setAgent({ responsiveness: v })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={q.agent.pressure} onChange={(e) => setAgent({ pressure: e.target.checked })} />
          They pushed me to sign quickly ("price good today only")
        </label>
        <div className="field">
          <label className="label" htmlFor="agent-comment">Notes about them <span className="optional">optional</span></label>
          <textarea id="agent-comment" className="input" rows={2} value={q.agent.comment} onChange={(e) => setAgent({ comment: e.target.value })} />
        </div>
      </section>
    </Dialog>
  );
}
