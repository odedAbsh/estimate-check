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

async function buy(page: Page, plan: "Essential" | "Verified" | "Advisor", price: number) {
  await page.getByRole("button", { name: /Unlock from/ }).click();
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
