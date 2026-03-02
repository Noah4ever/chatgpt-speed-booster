import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    timeout: 60_000,
    retries: 0,
    workers: 1, // extensions need sequential execution
    reporter: [["list"]],
    projects: [
        {
            name: "build",
            testMatch: "validate-build.spec.ts",
        },
        {
            name: "extension",
            testMatch: "extension.spec.ts",
        },
        {
            name: "integration",
            testMatch: "integration.spec.ts",
        },
    ],
});
