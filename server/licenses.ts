import { getLicenseSource, hasLiveLicenseData } from "../src/domain/licenseSources";
import { normalizeName, type CoverageRecord, type LicenseResult } from "../src/domain/verification";

type Fetch = typeof fetch;

const OREGON_URL = "https://data.oregon.gov/resource/g77e-6bhs.json";

interface OregonRow {
  license_number: string;
  license_type?: string;
  lic_exp_date?: string; // MM/DD/YYYY
  bond_company?: string;
  bond_amount?: string;
  bond_exp_date?: string;
  ins_company?: string;
  ins_amount?: string;
  ins_exp_date?: string;
  full_name?: string;
  rmi_name?: string;
  endorsement_text?: string;
}

export function usDateToIso(d: string | undefined): string | null {
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function coverage(company?: string, amount?: string, exp?: string): CoverageRecord | null {
  if (!company) return null;
  return { company, amount: amount ? Number(amount) : null, expires: usDateToIso(exp) };
}

const STOP = new Set(["llc", "inc", "co", "corp", "company", "ltd", "the", "and", "services", "service"]);
function tokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** True when the names share a meaningful word (so "Summit Roofing LLC" matches "SUMMIT ROOFING & EXTERIORS INC"). */
export function namesMatch(quoted: string, ...holders: (string | undefined)[]): boolean | null {
  const q = tokens(quoted);
  if (q.length === 0) return null;
  const known = holders.filter((h): h is string => Boolean(h?.trim()));
  if (known.length === 0) return null;
  return known.some((h) => {
    const t = new Set(tokens(h));
    return q.filter((w) => t.has(w)).length >= Math.min(2, q.length);
  });
}

export async function lookupOregon(rawNumber: string, businessName: string, today: Date, fetchImpl: Fetch): Promise<LicenseResult> {
  const lookupUrl = getLicenseSource("OR")!.lookupUrl;
  const board = "Oregon Construction Contractors Board";
  const number = rawNumber.replace(/\D/g, "");
  const base: LicenseResult = { status: "not_found", number: rawNumber, classification: "", expires: null, board, source: "live", lookupUrl };
  if (number.length < 4 || number.length > 8) return base;

  const url = `${OREGON_URL}?license_number=${encodeURIComponent(number)}&$limit=1`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Oregon open data returned ${res.status}`);
  const rows = (await res.json()) as OregonRow[];
  const row = rows[0];
  // The dataset lists active licensees only, so "not found" means "no active license with this number".
  if (!row) return base;

  const expires = usDateToIso(row.lic_exp_date);
  const expired = expires != null && new Date(expires + "T23:59:59") < today;
  return {
    status: expired ? "expired" : "active",
    number: row.license_number,
    classification: row.endorsement_text || row.license_type || "",
    expires,
    board,
    source: "live",
    holderName: row.full_name,
    nameMatch: namesMatch(businessName, row.full_name, row.rmi_name),
    bond: coverage(row.bond_company, row.bond_amount, row.bond_exp_date),
    insurance: coverage(row.ins_company, row.ins_amount, row.ins_exp_date),
    lookupUrl,
  };
}

/** Returns a live result, or null when this state has no live source connected. */
export async function lookupLicense(
  state: string,
  number: string,
  businessName: string,
  opts: { today?: Date; fetchImpl?: Fetch } = {},
): Promise<LicenseResult | null> {
  const st = state.toUpperCase();
  if (!hasLiveLicenseData(st)) return null;
  const today = opts.today ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (st === "OR") return lookupOregon(number, businessName, today, fetchImpl);
  return null;
}
