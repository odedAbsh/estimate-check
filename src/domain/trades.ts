/**
 * Scope checklists per trade. `share` is a rough share of a typical job's cost,
 * used to estimate what a missing item will cost you later. These are planning
 * heuristics, not price guides, and the UI labels them as estimates.
 */
export interface ScopeItem {
  id: string;
  label: string;
  share: number;
  keywords: string[];
}

export interface Trade {
  id: string;
  label: string;
  licenseUsuallyRequired: boolean;
  typicalWarrantyYears: number;
  scope: ScopeItem[];
}

const permits: ScopeItem = {
  id: "permits",
  label: "Permits and inspections",
  share: 0.03,
  keywords: ["permit", "inspection"],
};
const cleanup: ScopeItem = {
  id: "cleanup",
  label: "Debris removal and cleanup",
  share: 0.03,
  keywords: ["cleanup", "clean-up", "clean up", "debris", "haul", "dumpster", "disposal"],
};
const materials: ScopeItem = {
  id: "materials",
  label: "Materials included",
  share: 0.4,
  keywords: ["material", "supplies"],
};

export const TRADES: Trade[] = [
  {
    id: "roofing",
    label: "Roofing",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 10,
    scope: [
      { id: "tearoff", label: "Tear-off of old roof", share: 0.15, keywords: ["tear-off", "tear off", "tearoff", "remove existing", "strip"] },
      { id: "decking", label: "Damaged decking replacement", share: 0.08, keywords: ["decking", "sheathing", "plywood", "osb"] },
      { id: "underlayment", label: "Underlayment / ice and water shield", share: 0.08, keywords: ["underlayment", "ice and water", "felt", "synthetic"] },
      { id: "flashing", label: "New flashing and drip edge", share: 0.05, keywords: ["flashing", "drip edge"] },
      { id: "ventilation", label: "Ridge vents / ventilation", share: 0.04, keywords: ["vent", "ventilation", "ridge"] },
      materials,
      permits,
      cleanup,
    ],
  },
  {
    id: "hvac",
    label: "HVAC (heating & cooling)",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 10,
    scope: [
      { id: "equipment", label: "Equipment (make, model, efficiency listed)", share: 0.5, keywords: ["seer", "afue", "model", "unit", "furnace", "condenser", "heat pump"] },
      { id: "removal", label: "Removal of old equipment", share: 0.04, keywords: ["remove old", "removal", "haul away", "disposal"] },
      { id: "ductwork", label: "Ductwork inspection / modification", share: 0.12, keywords: ["duct", "plenum"] },
      { id: "thermostat", label: "Thermostat", share: 0.03, keywords: ["thermostat"] },
      { id: "electrical", label: "Electrical / disconnect work", share: 0.05, keywords: ["electrical", "disconnect", "breaker", "whip"] },
      { id: "loadcalc", label: "Load calculation (Manual J)", share: 0.02, keywords: ["manual j", "load calc"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "plumbing",
    label: "Plumbing",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 1,
    scope: [
      { id: "parts", label: "Parts and fixtures specified", share: 0.35, keywords: ["fixture", "valve", "pipe", "pex", "copper", "water heater"] },
      { id: "labor", label: "Labor hours or flat rate stated", share: 0.4, keywords: ["labor", "hour", "flat rate"] },
      { id: "wallrepair", label: "Drywall / wall repair after access", share: 0.08, keywords: ["drywall", "patch", "wall repair"] },
      { id: "testing", label: "Pressure test / leak test", share: 0.02, keywords: ["pressure test", "leak test"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "electrical",
    label: "Electrical",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 1,
    scope: [
      { id: "panel", label: "Panel / breaker work specified", share: 0.3, keywords: ["panel", "breaker", "amp"] },
      { id: "wiring", label: "Wiring and materials", share: 0.3, keywords: ["wire", "wiring", "romex", "conduit"] },
      { id: "patching", label: "Drywall patching", share: 0.06, keywords: ["patch", "drywall"] },
      { id: "utility", label: "Utility coordination", share: 0.03, keywords: ["utility", "power company", "meter"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen remodel",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 1,
    scope: [
      { id: "demo", label: "Demolition", share: 0.05, keywords: ["demo", "demolition"] },
      { id: "cabinets", label: "Cabinets", share: 0.3, keywords: ["cabinet"] },
      { id: "countertops", label: "Countertops", share: 0.12, keywords: ["countertop", "quartz", "granite"] },
      { id: "plumbing", label: "Plumbing", share: 0.08, keywords: ["plumbing", "sink", "faucet"] },
      { id: "electrical", label: "Electrical", share: 0.08, keywords: ["electrical", "outlet", "lighting"] },
      { id: "flooring", label: "Flooring", share: 0.07, keywords: ["floor", "tile"] },
      { id: "appliances", label: "Appliance installation", share: 0.03, keywords: ["appliance"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "bathroom",
    label: "Bathroom remodel",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 1,
    scope: [
      { id: "demo", label: "Demolition", share: 0.06, keywords: ["demo", "demolition"] },
      { id: "waterproofing", label: "Waterproofing membrane", share: 0.05, keywords: ["waterproof", "membrane", "kerdi", "redgard"] },
      { id: "tile", label: "Tile and setting materials", share: 0.2, keywords: ["tile"] },
      { id: "fixtures", label: "Fixtures (toilet, vanity, shower valve)", share: 0.2, keywords: ["toilet", "vanity", "valve", "fixture"] },
      { id: "plumbing", label: "Plumbing rough-in", share: 0.1, keywords: ["plumbing", "rough-in", "rough in"] },
      { id: "ventilation", label: "Exhaust fan", share: 0.02, keywords: ["exhaust", "fan"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "painting",
    label: "Painting",
    licenseUsuallyRequired: false,
    typicalWarrantyYears: 2,
    scope: [
      { id: "prep", label: "Surface prep (scraping, sanding, patching)", share: 0.2, keywords: ["prep", "scrape", "sand", "patch", "caulk"] },
      { id: "primer", label: "Primer", share: 0.08, keywords: ["primer", "prime"] },
      { id: "coats", label: "Number of coats stated", share: 0.1, keywords: ["coat"] },
      { id: "paintbrand", label: "Paint brand / product line stated", share: 0.25, keywords: ["sherwin", "benjamin moore", "behr", "ppg"] },
      { id: "protection", label: "Furniture and floor protection", share: 0.03, keywords: ["protect", "drop cloth", "mask"] },
      cleanup,
    ],
  },
  {
    id: "flooring",
    label: "Flooring",
    licenseUsuallyRequired: false,
    typicalWarrantyYears: 1,
    scope: [
      { id: "removal", label: "Old floor removal", share: 0.08, keywords: ["removal", "remove existing", "tear out"] },
      { id: "subfloor", label: "Subfloor prep / leveling", share: 0.08, keywords: ["subfloor", "level", "self-leveling"] },
      { id: "underlayment", label: "Underlayment", share: 0.05, keywords: ["underlayment", "pad"] },
      { id: "trim", label: "Baseboards / transitions", share: 0.05, keywords: ["baseboard", "trim", "transition", "quarter round"] },
      { id: "furniture", label: "Moving furniture", share: 0.02, keywords: ["furniture"] },
      materials,
      cleanup,
    ],
  },
  {
    id: "solar",
    label: "Solar",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 25,
    scope: [
      { id: "panels", label: "Panel brand and wattage stated", share: 0.3, keywords: ["panel", "watt", "kw"] },
      { id: "inverter", label: "Inverter / microinverters", share: 0.12, keywords: ["inverter", "enphase", "solaredge"] },
      { id: "production", label: "Production estimate (kWh/year)", share: 0.0, keywords: ["kwh", "production"] },
      { id: "interconnect", label: "Utility interconnection", share: 0.04, keywords: ["interconnect", "net meter", "utility"] },
      { id: "roofcheck", label: "Roof inspection / penetrations warranty", share: 0.03, keywords: ["roof", "penetration"] },
      permits,
    ],
  },
  {
    id: "windows",
    label: "Windows & doors",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 10,
    scope: [
      { id: "product", label: "Brand / product line stated", share: 0.5, keywords: ["andersen", "pella", "marvin", "milgard", "series"] },
      { id: "install", label: "Installation type (full-frame vs insert)", share: 0.2, keywords: ["full frame", "full-frame", "insert", "retrofit"] },
      { id: "trim", label: "Interior / exterior trim", share: 0.06, keywords: ["trim", "casing"] },
      { id: "removal", label: "Old unit removal and disposal", share: 0.04, keywords: ["removal", "disposal"] },
      permits,
      cleanup,
    ],
  },
  {
    id: "landscaping",
    label: "Landscaping & hardscape",
    licenseUsuallyRequired: false,
    typicalWarrantyYears: 1,
    scope: [
      { id: "design", label: "Design / plan", share: 0.05, keywords: ["design", "plan"] },
      { id: "grading", label: "Grading and drainage", share: 0.12, keywords: ["grade", "grading", "drain"] },
      { id: "plants", label: "Plants / sod listed", share: 0.2, keywords: ["plant", "sod", "tree", "shrub"] },
      { id: "irrigation", label: "Irrigation", share: 0.12, keywords: ["irrigation", "sprinkler"] },
      materials,
      cleanup,
    ],
  },
  {
    id: "general",
    label: "Other / general contractor",
    licenseUsuallyRequired: true,
    typicalWarrantyYears: 1,
    scope: [
      { id: "labor", label: "Labor", share: 0.4, keywords: ["labor"] },
      materials,
      permits,
      cleanup,
    ],
  },
];

export function getTrade(id: string): Trade {
  return TRADES.find((t) => t.id === id) ?? TRADES[TRADES.length - 1];
}
