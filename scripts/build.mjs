import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const BROWSERS = ["chrome", "firefox", "edge", "safari"];
const args = process.argv.slice(2);
const buildAll = args.includes("--all");
const watch = args.includes("--watch");
const targetBrowser = process.env.TARGET_BROWSER || "chrome";

const targets = buildAll
    ? BROWSERS
    : BROWSERS.includes(targetBrowser)
        ? [targetBrowser]
        : (console.error(`unknown browser: ${targetBrowser}`), process.exit(1));

function esbuildOptions(browser, entryName, entryPath) {
    const outdir = resolve(ROOT, "dist", browser);
    return {
        entryPoints: [resolve(ROOT, entryPath)],
        outfile: resolve(outdir, `${entryName}.js`),
        bundle: true,
        minify: !watch,
        sourcemap: watch ? "inline" : false,
        target: ["es2022"],
        format: "esm",
        platform: "browser",
        define: { "__DEV__": watch ? "true" : "false" },
        logLevel: "info",
    };
}

function copyAssets(browser) {
    const outdir = resolve(ROOT, "dist", browser);
    const browserDir = resolve(ROOT, "browsers", browser);

    mkdirSync(outdir, { recursive: true });

    cpSync(resolve(browserDir, "manifest.json"), resolve(outdir, "manifest.json"));
    cpSync(resolve(ROOT, "src", "popup", "popup.html"), resolve(outdir, "popup.html"));
    cpSync(resolve(ROOT, "src", "popup", "popup.css"), resolve(outdir, "popup.css"));

    // copy extension icons
    const iconSrc = resolve(ROOT, "assets", "icons");
    const iconDst = resolve(outdir, "icons");
    mkdirSync(iconDst, { recursive: true });

    if (existsSync(iconSrc)) {
        for (const file of readdirSync(iconSrc)) {
            cpSync(resolve(iconSrc, file), resolve(iconDst, file));
        }
    }
}

async function buildBrowser(browser) {
    console.log(`building ${browser}...`);
    copyAssets(browser);

    const entries = [
        { name: "content", path: "src/content/index.ts" },
        { name: "background", path: "src/background/index.ts" },
        { name: "popup", path: "src/popup/popup.ts" },
    ];

    for (const entry of entries) {
        const opts = esbuildOptions(browser, entry.name, entry.path);
        if (watch) {
            const ctx = await esbuild.context(opts);
            await ctx.watch();
            console.log(`  watching ${entry.name}`);
        } else {
            await esbuild.build(opts);
        }
    }

    console.log(`${browser} done -> dist/${browser}/`);
}

(async () => {
    try {
        for (const browser of targets) await buildBrowser(browser);
        if (watch) console.log("\nwatching for changes...");
    } catch (err) {
        console.error("build failed:", err);
        process.exit(1);
    }
})();
