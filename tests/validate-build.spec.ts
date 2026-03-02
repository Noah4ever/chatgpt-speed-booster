/**
 * Build validation tests – verifies all dist/ outputs are correct.
 *
 * No browser needed. Checks:
 *  - dist/<browser>/ exists with all required files
 *  - manifest.json is valid and has correct fields
 *  - URL patterns from sites.config.json are injected
 *  - Firefox manifest has data_collection_permissions
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import path from "path";

const BROWSERS = ["chrome", "firefox", "edge", "safari"];
const REQUIRED_FILES = ["manifest.json", "content.js", "background.js", "popup.html", "popup.css"];

const sitesConfig = JSON.parse(readFileSync(path.resolve("sites.config.json"), "utf8"));
const allUrlPatterns: string[] = sitesConfig.flatMap(
    (s: { urlPatterns: string[] }) => s.urlPatterns,
);

for (const browser of BROWSERS) {
    test.describe(`${browser} build`, () => {
        const distDir = path.resolve("dist", browser);

        test("dist folder exists", () => {
            expect(existsSync(distDir)).toBe(true);
        });

        for (const file of REQUIRED_FILES) {
            test(`has ${file}`, () => {
                expect(existsSync(path.join(distDir, file))).toBe(true);
            });
        }

        test("manifest.json is valid JSON", () => {
            const raw = readFileSync(path.join(distDir, "manifest.json"), "utf8");
            expect(() => JSON.parse(raw)).not.toThrow();
        });

        test("manifest has correct name", () => {
            const manifest = JSON.parse(
                readFileSync(path.join(distDir, "manifest.json"), "utf8"),
            );
            expect(manifest.name).toBe("AI Chat Speed Booster");
        });

        test("manifest has all URL patterns from sites.config.json", () => {
            const manifest = JSON.parse(
                readFileSync(path.join(distDir, "manifest.json"), "utf8"),
            );

            for (const pattern of allUrlPatterns) {
                expect(manifest.host_permissions).toContain(pattern);
                expect(manifest.content_scripts[0].matches).toContain(pattern);
            }
        });

        test("manifest has required permissions", () => {
            const manifest = JSON.parse(
                readFileSync(path.join(distDir, "manifest.json"), "utf8"),
            );
            expect(manifest.permissions).toContain("storage");
            expect(manifest.permissions).toContain("tabs");
        });

        if (browser === "firefox") {
            test("Firefox manifest has data_collection_permissions", () => {
                const manifest = JSON.parse(
                    readFileSync(path.join(distDir, "manifest.json"), "utf8"),
                );
                const perms =
                    manifest.browser_specific_settings?.gecko?.data_collection_permissions;
                expect(perms).toBeDefined();
                expect(perms.required).toContain("none");
            });

            test("Firefox manifest has gecko id", () => {
                const manifest = JSON.parse(
                    readFileSync(path.join(distDir, "manifest.json"), "utf8"),
                );
                expect(
                    manifest.browser_specific_settings?.gecko?.id,
                ).toBeTruthy();
            });
        }

        test("icons folder has required sizes", () => {
            const iconsDir = path.join(distDir, "icons");
            for (const size of ["icon-16.png", "icon-48.png", "icon-128.png"]) {
                expect(existsSync(path.join(iconsDir, size))).toBe(true);
            }
        });
    });
}
