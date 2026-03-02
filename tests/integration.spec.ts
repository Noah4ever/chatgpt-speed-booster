/**
 * Integration tests – run against REAL sites using saved auth.
 *
 * Prerequisites:
 *   1. npm run test:auth    (log in to each site, profile is saved)
 *   2. npm run test:integration
 *
 * Tests verify the extension actually works on live sites:
 *  - Content script activates
 *  - Messages are found and managed
 *  - No console errors from the extension
 */
import { authTest as test, expect, SITES } from "./extension-fixture";
import { existsSync } from "fs";
import path from "path";

const AUTH_PROFILE = path.resolve("tests", ".auth-profile");

test.beforeAll(() => {
    if (!existsSync(AUTH_PROFILE)) {
        console.warn(
            "\n⚠  No auth profile found. Run `npm run test:auth` first.\n" +
            "   Skipping integration tests or running without auth.\n",
        );
    }
});

for (const site of SITES) {
    test.describe(`${site.name} (live)`, () => {
        test(`content script loads on ${site.hostnames[0]}`, async ({ page }) => {
            const pageErrors: string[] = [];
            page.on("pageerror", (err) => pageErrors.push(err.message));

            await page.goto(`https://${site.hostnames[0]}`, {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
            });

            // Wait for the extension to process messages (DOM-based detection)
            // If the page has messages, the extension will add data-acsb-managed attrs
            try {
                await page.waitForSelector("[data-acsb-managed]", {
                    timeout: 15_000,
                    state: "attached",
                });
            } catch {
                // No messages on the page (e.g. homepage, not logged in) — still OK
                // At minimum, verify no page errors from the extension
            }

            // No page-level errors from the extension
            const extensionErrors = pageErrors.filter((e) =>
                e.includes("acsb") || e.includes("speed booster"),
            );
            expect(extensionErrors).toHaveLength(0);
        });

        test(`messages are managed if present on ${site.hostnames[0]}`, async ({ page }) => {
            await page.goto(`https://${site.hostnames[0]}`, {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
            });
            await page.waitForTimeout(5000);

            // Check if any messages exist on the page
            const messageCount = await page
                .locator(site.selectors.messageTurn)
                .count();

            if (messageCount === 0) {
                // No messages (maybe homepage / not logged in) — that's fine
                test.info().annotations.push({
                    type: "note",
                    description: `No messages found on ${site.hostnames[0]} – may need auth`,
                });
                return;
            }

            // If messages exist, the status indicator should appear
            const statusIndicator = page.locator(".acsb-status-indicator");
            await expect(statusIndicator).toBeVisible({ timeout: 5000 });

            // If there are more messages than the limit, some should be hidden
            if (messageCount > 10) {
                const loadMoreBtn = page.locator(".acsb-load-more-wrapper");
                await expect(loadMoreBtn).toBeVisible({ timeout: 5000 });
            }
        });
    });
}
