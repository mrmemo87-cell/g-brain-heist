import fs from "node:fs";
import crypto from "node:crypto";
import { fingerprint } from "./inventory.mjs";
import { audit } from "./policy.mjs";
import { cases, browsers, modes, viewports } from "../../e2e/visual/cases.mjs";
const inventory = JSON.parse(
  fs.readFileSync("e2e/visual/inventory.json", "utf8"),
);
const reviews = JSON.parse(fs.readFileSync("e2e/visual/reviews.json", "utf8"));
const evidence = fs.existsSync(".visual-results/evidence.json")
  ? JSON.parse(fs.readFileSync(".visual-results/evidence.json", "utf8"))
  : null;
const report = audit({
  inventory,
  cases,
  projects: browsers.flatMap((b) => viewports.map((v) => `${b}-${v.name}`)),
  modes,
  hash: fingerprint(),
  evidence,
  reviews,
  baselineHash(project, key) {
    const p = `e2e/visual/baselines/${project}/${key}.png`;
    return fs.existsSync(p)
      ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")
      : null;
  },
});
fs.mkdirSync(".visual-results", { recursive: true });
fs.writeFileSync(
  ".visual-results/coverage.json",
  JSON.stringify(report, null, 2),
);
const escape = (v) => String(v).replaceAll("|", "\\|").replaceAll("\n", " ");
fs.writeFileSync(
  ".visual-results/coverage.md",
  `# IELTS visual verification\n\n**${report.status}**\n\nSource hash: ${report.sourceHash}\n\n${inventory.length} page surfaces; ${cases.length} fixture cases; ${report.failures.length} outstanding checks.\n\n| Page | Required states missing | Role/state gaps | Browser checks | Device review | Status |\n|---|---|---|---|---|---|\n` +
    report.surfaces
      .map(
        (s) =>
          `| ${escape(s.id)} | ${escape(s.missingStates.join(", ") || "None")} | ${escape(s.missingRoles.join(", ") || "None")} | ${s.browserPasses}/${s.expectedBrowserChecks} | ${s.deviceReviewed ? "Recorded" : "Missing/stale"} | ${s.status} |`,
      )
      .join("\n") +
    "\n\nDetailed findings: coverage.json. Screenshot candidates and the browser HTML report are included in this artifact. No screenshot or device approval is inferred from test success.\n",
);
console.log(
  `${report.status}: ${report.failures.length} outstanding checks. See .visual-results/coverage.md.`,
);
if (!process.argv.includes("--report-only") && report.failures.length)
  process.exitCode = 1;
