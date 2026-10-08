import { useEffect, useRef, useState } from "react";
import type { Analysis } from "../domain/analysis";
import { askAdvisor } from "../lib/api";
import { localAdvisorAnswer } from "../lib/advisorLocal";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = ["Why this contractor?", "Is the cheapest one risky?", "What should I negotiate?", "What should the contract include?"];

function renderText(t: string) {
  // Minimal formatting: **bold** and line breaks.
  return t.split("\n").map((line, i) => (
    <p key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}
    </p>
  ));
}

export function AdvisorChat({ analysis, context }: { analysis: Analysis; context: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: "nearest" }), [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages;
    setMessages([...history, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    const ai = offline ? null : await askAdvisor(question, context, history);
    if (ai == null) setOffline(true);
    setMessages((m) => [...m, { role: "assistant", content: ai ?? localAdvisorAnswer(question, analysis) }]);
    setBusy(false);
  }

  return (
    <section className="card advisor" aria-labelledby="advisor-title">
      <h2 id="advisor-title">Ask the advisor</h2>
      <p className="muted">
        Talk through the decision. The advisor only works for you and answers from your quotes and checks.
        {offline && " AI isn't connected here, so answers come from your analysis directly."}
      </p>
      <div className="chat-log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble-${m.role}`}>
            <span className="sr-only">{m.role === "user" ? "You said:" : "Advisor:"}</span>
            {renderText(m.content)}
          </div>
        ))}
        {busy && (
          <div className="bubble bubble-assistant" aria-label="Advisor is typing">
            <span className="typing"><span /><span /><span /></span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {messages.length === 0 && (
        <div className="starters">
          {STARTERS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="advisor-input" className="sr-only">Your question</label>
        <input id="advisor-input" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Can I trust the cheapest one?" />
        <button className="btn btn-primary" type="submit" disabled={!input.trim() || busy}>Send</button>
      </form>
    </section>
  );
}
