#!/usr/bin/env node
/**
 * Interactive auth setup – launches a browser with the extension loaded.
 * Log in to each AI chat site, then press Enter to save the auth profile.
 *
 * Usage:
 *   npm run test:auth
 *
 * Credentials from .env are auto-filled where possible (best-effort).
 * If auto-fill fails, log in manually — the profile is saved either way.
 */
import { chromium } from "playwright";
import path from "path";
import readline from "readline/promises";
import { readFileSync, existsSync } from "fs";

const EXTENSION_PATH = path.resolve("dist", "chrome");
const AUTH_DIR = path.resolve("tests", ".auth-profile");
const sites = JSON.parse(readFileSync("sites.config.json", "utf8"));

/* ── simple .env parser (no dependency) ─────────────────────────── */
function loadEnv() {
    const vars = {};
    if (!existsSync(".env")) return vars;
    try {
        for (const line of readFileSync(".env", "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/i);
            if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch { /* ignore */ }
    return vars;
}

/* ── best-effort auto-fill ──────────────────────────────────────── */
async function tryAutoFill(page, email, password) {
    try {
        // Look for email / username fields
        const emailInput = page.locator(
            'input[type="email"], input[name="email"], input[name="username"], input[id*="email"]',
        ).first();
        if (await emailInput.isVisible({ timeout: 3000 })) {
            await emailInput.fill(email);
            console.log("    ✓ Auto-filled email");
        }
    } catch { /* auto-fill failed, user will do it manually */ }

    if (!password) return;
    try {
        const passInput = page.locator('input[type="password"]').first();
        if (await passInput.isVisible({ timeout: 3000 })) {
            await passInput.fill(password);
            console.log("    ✓ Auto-filled password");
        }
    } catch { /* auto-fill failed */ }
}

/* ── main ────────────────────────────────────────────────────────── */
async function main() {
    // Ensure extension is built
    if (!existsSync(EXTENSION_PATH)) {
        console.error("Extension not built. Run: npm run build:chrome");
        process.exit(1);
    }

    const env = loadEnv();

    console.log("╔══════════════════════════════════════╗");
    console.log("║        Auth Setup for Tests          ║");
    console.log("╚══════════════════════════════════════╝");
    console.log();
    console.log("A browser will open with the extension loaded.");
    console.log("Log in to each site, then come back here and press Enter.");
    console.log();

    const context = await chromium.launchPersistentContext(AUTH_DIR, {
        headless: false,
        args: [
            "--no-first-run",
            "--no-default-browser-check",
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });

    // Open a tab for each site (reuse the initial blank page for the first site)
    const initialPages = context.pages();
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const url = `https://${site.hostnames[0]}`;
        const page = (i === 0 && initialPages.length > 0) ? initialPages[0] : await context.newPage();
        console.log(`→ Opening ${site.name}: ${url}`);
        await page.goto(url).catch(() => { });

        // Try auto-fill from .env
        const envKey = site.id.toUpperCase();
        const email = env[`${envKey}_EMAIL`];
        const password = env[`${envKey}_PASSWORD`];
        if (email) {
            console.log(`  Found credentials for ${site.name} in .env`);
            // Listen for page loads (login redirects) and try auto-fill
            const autoFill = async () => {
                await tryAutoFill(page, email, password);
            };
            page.on("load", autoFill);
            await autoFill(); // try immediately too
        } else {
            console.log(`  No credentials for ${site.name} in .env — log in manually`);
        }
    }

    console.log();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("Press Enter after logging into all sites... ");
    rl.close();

    await context.close();
    console.log();
    console.log(`✓ Auth profile saved to ${AUTH_DIR}`);
    console.log("  Run: npm run test:integration");
}

main().catch((err) => {
    console.error("Auth setup failed:", err.message);
    process.exit(1);
});
