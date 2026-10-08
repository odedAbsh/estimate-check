import type { Contractor } from "../domain/types";
import { boardLookupUrl, getLicenseSource } from "../domain/licenseSources";
import { DemoVerificationProvider, type LicenseResult, type VerificationOptions, type VerificationProvider, type VerificationReport } from "../domain/verification";

const demo = new DemoVerificationProvider();

async function liveLicense(c: Contractor, state: string): Promise<LicenseResult> {
  const board = getLicenseSource(state)?.agency ?? `${state} contractor licensing board`;
  const lookupUrl = boardLookupUrl(state);
  const number = c.licenseNumber.trim();
  if (!number) return { status: "not_provided", number: "", classification: "", expires: null, board, source: "none", lookupUrl };
  try {
    const qs = new URLSearchParams({ state, number, name: c.businessName });
    const res = await fetch(`/api/license?${qs}`);
    const body = (await res.json()) as Partial<LicenseResult>;
    if (res.ok && body.status && body.status !== "unsupported") return { ...(body as LicenseResult), lookupUrl: body.lookupUrl ?? lookupUrl };
    if (body.status === "unsupported" || res.status === 404) {
      return { status: "unsupported", number, classification: "", expires: null, board, source: "none", lookupUrl };
    }
  } catch {
    // fall through
  }
  return { status: "unavailable", number, classification: "", expires: null, board, source: "none", lookupUrl };
}

/**
 * Licenses come from the state's own records where we have them, and are marked
 * "can't verify here yet" where we don't. Business and court records are still
 * sample data until a records vendor is connected.
 */
export const verificationProvider: VerificationProvider = {
  async verify(c: Contractor, opts: VerificationOptions): Promise<VerificationReport> {
    if (opts.sample) return demo.verify(c, opts);
    const report = await demo.verify(c, { ...opts, license: false });
    if (opts.license) report.license = await liveLicense(c, opts.state);
    return report;
  },
};
