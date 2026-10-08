import { test, expect, type Page } from "@playwright/test";

async function startWithSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare my quotes" }).click();
  await page.getByLabel("State").selectOption("TX");
  await page.getByRole("button", { name: "Continue to quotes" }).click();
  await page.getByRole("button", { name: "Try with sample quotes" }).click();
  await expect(page.getByRole("heading", { name: "Summit Roofing LLC" })).toBeVisible();
}

async function toResults(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Compare my quotes" }).last().click();
  await expect(page.getByRole("heading", { name: "Roof replacement (sample)" })).toBeVisible();
}

let counter = 0;
const uniqueEmail = () => `user${Date.now()}${counter++}${Math.floor(Math.random() * 1e6)}@example.com`;
const PASSWORD = "correct horse battery";

async function signUp(page: Page, email = uniqueEmail()) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  return email;
}

async function buy(page: Page, plan: "Essential" | "Verified" | "Advisor", price: number) {
  await page.getByRole("button", { name: /Unlock from/ }).click();
  if (await page.getByRole("heading", { name: "Create your account" }).isVisible()) await signUp(page);
  await page.getByRole("dialog").getByText(plan, { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Pay \\$${price}`) }).click();
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("free preview shows the comparison but locks the verdict", async ({ page }) => {
  await startWithSamples(page);
  await toResults(page);
  await expect(page.getByRole("heading", { name: "See who to hire, and who to avoid" })).toBeVisible();
  await expect(page.getByText(/^Hire /)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Side-by-side comparison" })).toBeVisible();
  await expect(page.getByText("37% below the other quotes")).toBeVisible();
  await noHorizontalScroll(page);
});

test("Verified runs license and lawsuit checks and recommends the safe contractor", async ({ page }) => {
  await startWithSamples(page);
  await toResults(page);
  await buy(page, "Verified", 39);
  await expect(page.getByRole("heading", { name: "Hire Summit Roofing LLC." })).toBeVisible();
  await expect(page.getByText("Not recommended").first()).toBeVisible();
  await expect(page.getByText(/License expired/).first()).toBeVisible();
  await expect(page.getByText(/Defective workmanship/).first()).toBeVisible();
  await expect(page.getByText(/sample records/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Want to talk it through?" })).toBeVisible();
  await noHorizontalScroll(page);
});

test("Essential does not pretend to check licenses", async ({ page }) => {
  await startWithSamples(page);
  await toResults(page);
  await buy(page, "Essential", 29);
  await expect(page.getByText("Not included in Essential").first()).toBeVisible();
  await expect(page.getByText("License not verified on this plan").first()).toBeVisible();
});

test("Advisor plan has a chat that works without an AI key", async ({ page }) => {
  await startWithSamples(page);
  await toResults(page);
  await buy(page, "Advisor", 49);
  await page.getByRole("button", { name: "Is the cheapest one risky?" }).click();
  await expect(page.locator(".bubble-assistant").first()).toContainText("QuickFix Roofing");
  await page.getByLabel("Your question").fill("What should I negotiate?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".bubble-assistant").last()).toContainText(/deposit/i);
});

test("adding a quote by pasting text, with validation messages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare my quotes" }).click();
  await page.getByRole("button", { name: "Continue to quotes" }).click();
  await expect(page.getByText(/Pick the state/)).toBeVisible();
  await page.getByLabel("State").selectOption("CA");
  await page.getByLabel("ZIP code").fill("9021");
  await page.getByLabel("ZIP code").blur();
  await expect(page.getByText("Enter a 5-digit ZIP code")).toBeVisible();
  await page.getByLabel("ZIP code").fill("90210");
  await page.getByRole("button", { name: "Continue to quotes" }).click();

  await page.getByRole("button", { name: "Add a quote" }).click();
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText(/Add the company name/)).toBeVisible();
  await page
    .getByLabel("Or paste the quote text")
    .fill("Blue Sky Roofing\nLicense #B-123456\nTear-off .... $3,000\nTotal: $12,500\n20% deposit\nCompletion: 4 days");
  await page.getByRole("button", { name: "Read quote" }).click();
  await expect(page.getByRole("status")).toContainText(/Filled in/);
  await expect(page.getByLabel("Company name")).toHaveValue("Blue Sky Roofing");
  await expect(page.getByLabel("Total price")).toHaveValue("12500");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByRole("heading", { name: "Blue Sky Roofing" })).toBeVisible();
  await expect(page.getByText("$12,500").first()).toBeVisible();
});

test("progress survives a reload; removing a quote needs confirmation", async ({ page }) => {
  await startWithSamples(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "QuickFix Roofing" })).toBeVisible();
  await page.getByRole("button", { name: "Remove QuickFix Roofing" }).click();
  await expect(page.getByRole("heading", { name: /Remove QuickFix Roofing/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "QuickFix Roofing" })).toBeVisible();
  await page.getByRole("button", { name: "Remove QuickFix Roofing" }).click();
  await page.getByRole("button", { name: "Remove quote" }).click();
  await expect(page.getByRole("heading", { name: "QuickFix Roofing" })).toHaveCount(0);
});

test("a photo without AI reading gets a helpful message, not an error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare my quotes" }).click();
  await page.getByLabel("State").selectOption("TX");
  await page.getByRole("button", { name: "Continue to quotes" }).click();
  await page.getByRole("button", { name: "Add a quote" }).click();
  await page.locator("#quote-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Read quote" }).click();
  await expect(page.getByRole("status")).toContainText(/Reading photos needs AI reading/);
});

async function oneRealQuote(page: Page, state: string, name: string, license: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare my quotes" }).click();
  await page.getByLabel("State").selectOption(state);
  await page.getByRole("button", { name: "Continue to quotes" }).click();
  await page.getByRole("button", { name: "Add a quote" }).click();
  await page.getByLabel("Company name").fill(name);
  await page.getByLabel("License number").fill(license);
  await page.getByLabel("Total price").fill("12000");
  await page.getByRole("button", { name: "Save quote" }).click();
  await toResultsReal(page);
}

async function toResultsReal(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Compare my quotes" }).last().click();
}

test("Oregon: shows the official record and catches a license held by someone else", async ({ page }) => {
  await page.route("**/api/license*", (route) =>
    route.fulfill({
      json: {
        status: "active", number: "100215", classification: "Residential General Contractor", expires: "2028-02-06",
        board: "Oregon Construction Contractors Board", source: "live", holderName: "BRUCE HUIE", nameMatch: false,
        bond: { company: "WESTERN SURETY COMPANY", amount: 25000, expires: "2028-02-06" },
        insurance: { company: "SCOTTSDALE INSURANCE CO", amount: 1000000, expires: "2027-08-25" },
        lookupUrl: "https://www.oregon.gov/ccb/Pages/search.aspx",
      },
    }),
  );
  await oneRealQuote(page, "OR", "QuickFix Roofing", "100215");
  await buy(page, "Verified", 39);
  await expect(page.getByText("License belongs to a different name").first()).toBeVisible();
  await expect(page.getByText("registered to BRUCE HUIE")).toBeVisible();
  await expect(page.getByText(/Official record, Oregon Construction Contractors Board/)).toBeVisible();
  await expect(page.getByText(/WESTERN SURETY COMPANY/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Check it yourself/ }).first()).toHaveAttribute("href", /oregon\.gov/);
});

test("a state we can't verify says so and links the official lookup instead of faking a result", async ({ page }) => {
  await page.route("**/api/license*", (route) => route.fulfill({ json: { status: "unsupported" } }));
  await oneRealQuote(page, "CA", "Blue Sky Roofing", "1234567");
  await buy(page, "Verified", 39);
  await expect(page.getByText("We can't verify licenses in this state yet").first()).toBeVisible();
  await expect(page.getByText("Can't verify in this state yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /Check it yourself/ }).first()).toHaveAttribute("href", /cslb\.ca\.gov/);
});

test("unlocking asks you to create an account first, and keeps your quotes", async ({ page }) => {
  await startWithSamples(page);
  await toResults(page);
  await page.getByRole("button", { name: /Unlock from/ }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  // Declining leaves you where you were.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Roof replacement (sample)" })).toBeVisible();
  await page.getByRole("button", { name: /Unlock from/ }).click();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText(/valid email/);
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText(/at least 10/);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Unlock your recommendation" })).toBeVisible();
});

test("a paid project follows you to another browser after you sign in", async ({ page, browser }) => {
  await startWithSamples(page);
  await toResults(page);
  await page.getByRole("button", { name: /Unlock from/ }).click();
  const email = await signUp(page);
  await page.getByRole("dialog").getByText("Verified", { exact: true }).click();
  await page.getByRole("button", { name: /Pay \$39/ }).click();
  await expect(page.getByRole("heading", { name: "Hire Summit Roofing LLC." })).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get("/api/projects")).json()).projects ?? []).length).toBe(1);

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto("/");
  await page2.getByRole("button", { name: "Sign in" }).click();
  await page2.getByRole("button", { name: "I already have an account" }).click();
  await page2.getByLabel("Email").fill(email);
  await page2.getByLabel("Password").fill("wrong password!!");
  await page2.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page2.getByRole("alert")).toContainText(/don't match/);
  await page2.getByLabel("Password").fill(PASSWORD);
  await page2.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
  await page2.getByRole("link", { name: /Roof replacement \(sample\)/ }).click();
  await expect(page2.getByRole("heading", { name: "Hire Summit Roofing LLC." })).toBeVisible();
  await other.close();
});

test("signing out clears this browser", async ({ page }) => {
  await startWithSamples(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await signUp(page);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: /Roof replacement/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("estimate-check:projects:v1"))).toBe("[]");
});

test("returning from Stripe confirms the payment and unlocks the comparison", async ({ page }) => {
  let paid = false;
  await startWithSamples(page);
  await toResults(page);
  const id = page.url().match(/#\/p\/([\w-]+)\//)![1];
  await page.route("**/api/config", (r) => r.fulfill({ json: { payments: "stripe" } }));
  await page.route(`**/api/projects/${id}/checkout`, (r) => r.fulfill({ json: { url: `${new URL(page.url()).origin}/#/p/${id}/results?session_id=cs_test_123` } }));
  await page.route("**/api/billing/confirm", (r) => {
    paid = true;
    return r.fulfill({ json: { paid: true, projectId: id, plan: "plus" } });
  });
  await page.route(`**/api/projects/${id}`, async (r) => {
    if (r.request().method() === "GET" && paid) {
      const real = await r.fetch();
      const body = await real.json();
      return r.fulfill({ json: { project: { ...body.project, plan: "plus" } } });
    }
    return r.fallback();
  });
  await page.reload(); // pick up the mocked payments mode
  await page.getByRole("button", { name: /Unlock from/ }).click();
  await signUp(page);
  await expect(page.getByText("You'll pay securely on Stripe")).toBeVisible();
  await page.getByRole("button", { name: /Pay \$39/ }).click();
  await expect(page.getByText("Payment received. Your comparison is unlocked.")).toBeVisible();
});
