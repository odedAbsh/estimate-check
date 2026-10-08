# License data by state: what we found

Researched 2026-10-08 from public pages. "Confirmed" means a page or API response I read; "not confirmed" means I could not read a primary source.

## What is connected today

**Oregon (CCB), live.** The CCB publishes the "CCB Active Licenses" dataset on Oregon's open data portal (Socrata, dataset `g77e-6bhs`). Confirmed fields: license number, license type, endorsement, expiry date, original registration date, bond company/amount/expiry, insurance company/amount/expiry, licensee name, responsible managing individual, address, county, phone. It lists *active* licensees only, so "not found" means "no active license with that number". Complaint, claim and discipline history is **not** in this dataset; it is only on the CCB's own lookup site. Code: `server/licenses.ts`.

## Findings that matter for the product

1. **No single source covers the US.** Licensing is split across state boards, counties and cities. Commercial verification APIs cover a handful of states (one provider lists CA, FL, NY, TX, OR) and most need a license *number*, because matching by name is unreliable. Results can take 30 to 60 seconds. Pricing is per lookup (one article estimates $0.50 to $2.00); I could not find a published price list.
2. **23 states have no statewide general contractor license** (CO, CT, DE, ID, IL, IN, IA, KS, KY, ME, MO, NE, NH, NJ, NY, OH, OK, PA, SD, TX, VT, WA, WY; some of these use registration instead). In those states "licensed" often means a local permit or a trade license, and the product has to say that instead of showing a red flag. Statewide trade licensing: electrician about 46 states, plumber 45, HVAC 37, roofing only 26. (Source: a third-party summary, not a state source; verify before relying on the counts.)
3. **Not every state publishes bond and insurance.** Oregon does. California's record includes bond and workers' comp status; most others show only license status.
4. **Disciplinary history is uneven.** Some states publish it as data (Florida), most only on a per-license web page.

## Per-state notes (the ones I checked)

| State | Source | Access | Notes |
|---|---|---|---|
| OR | CCB, data.oregon.gov | Free API (Socrata). **Connected.** | Active licenses, bond, insurance. No complaints in the dataset. |
| WA | Dept. of Labor & Industries, data.wa.gov dataset `m8qx-ubtq` | Free API/CSV/JSON, public-domain license (PDDL). | Bond and insurance datasets exist on the same portal (named in the catalog, not read in detail). Easy next state. |
| FL | DBPR | Free CSV downloads: construction licensees, plus discipline files FY21/22 to FY25/26 and a recovery-fund file. | Excludes null/void, delinquent and inactive records. Update schedule and any use restrictions not stated on the page; read the ReadMe before ingesting. |
| CA | CSLB | Has a "Data Portal" and a master contractor list. The page was down (503) when I tried, so access terms and cost are **not confirmed**. | Largest market and the most useful state; worth a direct call to CSLB. |
| TX | TDLR | A "TDLR - All Licenses" dataset is published on the City of Austin portal (`7358-krk7`), mirroring TDLR's search. | Texas has no state general contractor or roofing license. The dataset covers TDLR trades only; I could not confirm which types. |

States I did not research individually: the rest. Each needs the same check (agency, bulk data or API, fields, terms of use). Many will turn out to be portal-only, which means scraping; read each site's terms and robots.txt before doing that, and prefer a vendor.

## Recommended order

1. Keep OR (done). Add WA next (free, clean, includes bond/insurance).
2. FL next (free CSVs including discipline), then CA (needs a conversation with CSLB).
3. For everything else, show "we can't verify this state yet" with a link to the board, which the app already does.
4. Decide whether to buy a vendor API for the long tail once real usage shows which states matter. Do not scrape portals whose terms forbid it.

## What the app does when it can't verify

It never fills in a made-up result. For a state with no live source it shows "Can't verify in this state yet" with the official lookup link, and does not treat that as a red flag. Sample projects use clearly labeled sample records only, so a made-up license number can never match a real person.
