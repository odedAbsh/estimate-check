import { extractFromText, type ExtractedQuote } from "../domain/extract";
import type { Trade } from "../domain/trades";
import { fileToBase64, pdfToText } from "./pdf";

export type ExtractResult = { data: ExtractedQuote; method: "ai" | "local"; warning?: string };

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON (e.g. static hosting with no API): treat as unavailable
  }
  return { status: res.status, body: json as T };
}

function aiUnavailable(status: number) {
  return status === 503 || status === 404 || status === 405 || status === 0;
}

/** Read a quote from pasted text or a file. Tries the AI reader first, then falls back to the built-in one. */
export async function extractQuote(trade: Trade, input: { text?: string; file?: File }): Promise<ExtractResult> {
  const { text, file } = input;
  try {
    const payload: Record<string, unknown> = { tradeId: trade.id };
    if (text?.trim()) payload.text = text;
    if (file) payload.file = { data: await fileToBase64(file), mediaType: file.type || "application/pdf" };
    const r = await postJson<ExtractedQuote & { error?: string }>("/api/extract", payload);
    if (r.status === 200 && r.body) return { data: { ...r.body, rawText: text ?? "" }, method: "ai" };
    if (!aiUnavailable(r.status) && r.status !== 502 && r.status !== 429 && r.status !== 500) {
      throw new Error(r.body?.error ?? "Couldn't read that document.");
    }
  } catch (e) {
    if (e instanceof Error && !/fetch|network|Failed/i.test(e.message)) throw e;
  }

  // Local fallback
  if (file && file.type === "application/pdf") {
    const pdfText = await pdfToText(file);
    if (!pdfText.trim()) {
      return { data: {}, method: "local", warning: "This PDF is a scanned image, so it has no text to read. Fill in the form, or type the key numbers." };
    }
    return { data: { ...extractFromText(pdfText, trade), source: "pdf" }, method: "local" };
  }
  if (file) {
    return { data: {}, method: "local", warning: "Reading photos needs AI reading, which isn't switched on here. Paste the text or fill in the form instead." };
  }
  return { data: { ...extractFromText(text ?? "", trade), source: "text" }, method: "local" };
}

export async function askAdvisor(question: string, context: string, history: { role: "user" | "assistant"; content: string }[]): Promise<string | null> {
  try {
    const r = await postJson<{ answer?: string; error?: string }>("/api/advisor", { question, context, history });
    if (r.status === 200 && r.body?.answer) return r.body.answer;
    return null;
  } catch {
    return null;
  }
}
