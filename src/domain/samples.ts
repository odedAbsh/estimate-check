/** Realistic sample quotes for a roof replacement, used by "Try a sample" and the tests. */
export const SAMPLE_QUOTES: { label: string; text: string; agent: { professionalism: number; clarity: number; responsiveness: number; pressure: boolean } }[] = [
  {
    label: "Summit Roofing",
    agent: { professionalism: 5, clarity: 5, responsiveness: 4, pressure: false },
    text: `Summit Roofing LLC
1420 Cedar Ave, Austin, TX
(512) 555-0142 · office@summitroofing.example · www.summitroofing.example
License #RC-448120 · Licensed and insured · 14 years in business
4.8 stars from 312 reviews
Estimator: Maria Lopez

ESTIMATE – Full roof replacement, 2,100 sq ft
Tear-off of existing shingles (1 layer) ........ $2,400
Replace damaged decking (up to 6 sheets) ....... $900
Synthetic underlayment + ice and water shield .. $1,850
GAF Timberline HDZ shingles (materials) ........ $6,200
New drip edge and step flashing ................ $1,100
Ridge vent ventilation ......................... $650
Permit and final inspection .................... $450
Dumpster, debris haul-off and magnetic cleanup . $700
Total price: $14,250

Payment: 10% deposit, balance on completion
Completion: 3 working days, weather permitting
10-year workmanship warranty · 50-year manufacturer warranty
Valid until 12/31/2026`,
  },
  {
    label: "QuickFix Roofing",
    agent: { professionalism: 3, clarity: 2, responsiveness: 4, pressure: true },
    text: `QuickFix Roofing
Call Dave 512-555-0199
Sales rep: Dave Miller

Roof replacement quote
Shingles and labor ................ $7,900
Underlayment ...................... $1,100
Flashing .......................... $600
Total: $9,600

Exclusions:
Tear-off of old roof (add if needed)
Permit
Decking replacement

50% deposit due at signing. Cash only for this price.
Price good today only.`,
  },
  {
    label: "Rapid Home Services",
    agent: { professionalism: 4, clarity: 4, responsiveness: 3, pressure: false },
    text: `Rapid Home Services Inc
Lic. 77-30412 · 6 years in business · fully insured
4.4 stars, 88 reviews
Prepared by: Kevin Shaw

Proposal: roof replacement
Remove existing roof and dispose .......... $2,900
Decking as needed ......................... $1,200
Underlayment and ice and water shield ..... $2,100
Owens Corning Duration shingles ........... $6,900
Drip edge, flashing, pipe boots ........... $1,300
Ridge vent ................................ $700
Permit .................................... $500
Cleanup ................................... $400
Grand total $16,000

Deposit: 30% down payment
Job takes 1 week
5 year labor warranty, 30 year shingle warranty`,
  },
];
