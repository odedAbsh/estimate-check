/**
 * What we know about each state's license data. "live" states are looked up
 * against the state's own published records. Everything else says so plainly
 * and links the user to the official lookup, instead of showing made-up results.
 *
 * Research notes with sources: docs/license-data-sources.md
 */
export type SourceKind = "live" | "bulk-download" | "portal-only" | "no-statewide-license";

export interface LicenseSource {
  state: string;
  agency: string;
  kind: SourceKind;
  lookupUrl: string;
  note: string;
}

export const LICENSE_SOURCES: Record<string, LicenseSource> = {
  OR: {
    state: "OR",
    agency: "Oregon Construction Contractors Board (CCB)",
    kind: "live",
    lookupUrl: "https://www.oregon.gov/ccb/Pages/search.aspx",
    note: "Open data on data.oregon.gov: active licenses with bond and insurance. Complaint and claim history is only on the CCB site.",
  },
  WA: {
    state: "WA",
    agency: "Washington Dept. of Labor & Industries",
    kind: "bulk-download",
    lookupUrl: "https://secure.lni.wa.gov/verify/",
    note: "Open data on data.wa.gov (license, bond, insurance). Not connected yet.",
  },
  FL: {
    state: "FL",
    agency: "Florida DBPR, Construction Industry Licensing Board",
    kind: "bulk-download",
    lookupUrl: "https://www.myfloridalicense.com/wl11.asp",
    note: "Free CSV downloads of licensees and discipline. Not connected yet.",
  },
  CA: {
    state: "CA",
    agency: "Contractors State License Board (CSLB)",
    kind: "portal-only",
    lookupUrl: "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx",
    note: "Data portal exists; terms and access need confirming. Not connected yet.",
  },
  TX: {
    state: "TX",
    agency: "Texas Dept. of Licensing and Regulation (TDLR)",
    kind: "no-statewide-license",
    lookupUrl: "https://www.tdlr.texas.gov/LicenseSearch/",
    note: "Texas has no statewide general contractor or roofing license. TDLR licenses electricians and HVAC; plumbers are licensed by TSBPE.",
  },
};

/** States with no statewide general-contractor license (local licensing or registration only). */
export const NO_STATEWIDE_GC = new Set(
  "CO CT DE ID IL IN IA KS KY ME MO NE NH NJ NY OH OK PA SD TX VT WA WY".split(" "),
);

export function getLicenseSource(state: string): LicenseSource | null {
  return LICENSE_SOURCES[state.toUpperCase()] ?? null;
}

export function hasLiveLicenseData(state: string): boolean {
  return getLicenseSource(state)?.kind === "live";
}

export function boardLookupUrl(state: string): string {
  return getLicenseSource(state)?.lookupUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${state} contractor license lookup`)}`;
}
