import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { cases, modes } from "./cases.mjs";
for (const scenario of cases)
  for (const mode of modes)
    test(`${scenario.id}--${mode}`, async ({ page }, info) => {
      const errors = [],
        external = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin === "http://127.0.0.1:4175") return route.continue();
        // No request may reach production, analytics, a real identity or a paid service.
        if (u.href === "https://visual.invalid/tone.wav") {
          const wav = Buffer.alloc(44 + 16000);
          wav.write("RIFF");
          wav.writeUInt32LE(wav.length - 8, 4);
          wav.write("WAVEfmt ", 8);
          wav.writeUInt32LE(16, 16);
          wav.writeUInt16LE(1, 20);
          wav.writeUInt16LE(1, 22);
          wav.writeUInt32LE(8000, 24);
          wav.writeUInt32LE(16000, 28);
          wav.writeUInt16LE(2, 32);
          wav.writeUInt16LE(16, 34);
          wav.write("data", 36);
          wav.writeUInt32LE(16000, 40);
          return route.fulfill({ body: wav, contentType: "audio/wav" });
        }
        external.push(u.origin + u.pathname);
        return route.abort();
      });
      await page.clock.setFixedTime(new Date("2026-10-15T09:00:00Z"));
      await page.goto(
        `/e2e/visual/fixture/index.html?case=${scenario.id}&mode=${mode}`,
      );
      if (scenario.view === "shared")
        await expect(
          page.getByRole(scenario.id === "dialog" ? "dialog" : "alert"),
        ).toBeVisible();
      if (scenario.view === "exam") {
        if (scenario.id.endsWith("-error"))
          await expect(
            page.getByRole("heading", { name: "Could not load exam" }),
          ).toBeVisible();
        else if (scenario.id.endsWith("-paused"))
          await expect(
            page.getByRole("heading", { name: "Paused by teacher" }),
          ).toBeVisible();
        else {
          await page
            .getByRole("button", { name: "Resume screener", exact: true })
            .click();
          await expect(
            page.locator(
              scenario.skill === "writing" ? "textarea" : "#reading-questions",
            ),
          ).toBeVisible();
          if (scenario.skill === "reading") {
            await expect(
              page.getByRole("button", {
                name: "Submit screener",
                exact: true,
              }),
            ).toBeDisabled();
            if (
              ["reading-passage-2", "reading-confirm"].includes(scenario.id)
            ) {
              await page
                .getByRole("button", { name: "Open Passage 2", exact: true })
                .click();
              await expect(
                page.getByRole("button", {
                  name: "Submit screener",
                  exact: true,
                }),
              ).toBeEnabled();
            }
            if (scenario.id === "reading-confirm") {
              await page
                .getByRole("button", { name: "Submit screener", exact: true })
                .click();
              await expect(page.getByRole("dialog")).toBeVisible();
              await expect(
                page.getByRole("button", { name: "Cancel", exact: true }),
              ).toBeFocused();
            }
          }
        }
      }
      if (scenario.view === "result") {
        if (scenario.loading)
          await expect(page.getByText("Opening saved evidence…")).toBeVisible();
        else if (scenario.error)
          await expect(page.getByRole("alert")).toBeVisible();
        else {
          await expect(page.locator(".isr-metrics")).toBeVisible();
          const back =
            scenario.role === "teacher"
              ? "Back to IELTS Programme"
              : scenario.role === "school_admin"
                ? "Back to student progress"
                : "My IELTS Journey";
          await expect(
            page.getByRole("link", { name: back }).first(),
          ).toBeVisible();
        }
      }
      if (scenario.view === "programme") {
        if (scenario.loading)
          await expect(
            page.getByText("Opening your programme workspace…"),
          ).toBeVisible();
        else if (scenario.error)
          await expect(page.getByRole("alert")).toBeVisible();
        else {
          await expect(
            page.getByRole("button", { name: "Today", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText("Opening your programme workspace…"),
          ).toHaveCount(0);
          if (scenario.section === "reviews")
            await expect(
              page.getByRole("heading", {
                name: "Assigned work and reviews",
                exact: true,
              }),
            ).toBeVisible();
          if (scenario.section === "team")
            await expect(
              page.getByRole("heading", {
                name: "Course batches",
                exact: true,
              }),
            ).toBeVisible();
        }
      }
      if (scenario.view === "hub") {
        if (scenario.loading)
          await expect(
            page.getByText("Checking your saved screeners…"),
          ).toBeVisible();
        else if (scenario.error)
          await expect(page.getByRole("alert")).toBeVisible();
        else await expect(page.locator(".ij-skill-card")).toHaveCount(4);
      }
      if (scenario.view === "lessons") {
        await expect(page.getByRole("heading", {name:"Lesson library",exact:true})).toBeVisible();
        if(scenario.loading) await expect(page.getByText("Opening your school’s lesson pack…")).toBeVisible();
        else if(scenario.error) await expect(page.getByRole("alert")).toBeVisible();
        else await expect(page.getByRole("heading",{name:"Lesson resources",exact:true})).toBeVisible();
      }
      if (["assigned","journey"].includes(scenario.view)) {
        const loading=scenario.view==="assigned"?"Loading assigned IELTS practice…":"Loading your IELTS journey…";
        if(scenario.loading) await expect(page.getByText(loading)).toBeVisible();
        else if(scenario.error) await expect(page.getByText(/Unable to load|could not|try again/i).first()).toBeVisible();
        else {
          await expect(page.getByText(loading)).toHaveCount(0);
          if(scenario.view === "journey") {
            await expect(page.getByRole("heading",{name:"Build your IELTS starting point.",exact:true})).toBeVisible();
            await expect(page.getByText("School access could not be verified.")).toHaveCount(0);
          } else if(!scenario.empty) {
            await expect(page.getByRole("heading",{name:"Synthetic reading and writing practice",exact:true})).toBeVisible();
          } else await expect(page.getByText(/No school assignment sets right now/)).toBeVisible();
        }
      }
      if(["batches","course-materials","review-queue"].includes(scenario.view)) {
        const loading=scenario.view==="batches"?"Loading batches…":scenario.view==="course-materials"?"Loading released materials and batch members…":"Loading reviewable submissions…";
        if(scenario.loading) await expect(page.getByText(loading)).toBeVisible();
        else if(scenario.error) await expect(page.getByText(/could not load|could not be confirmed|Unable to load the review queue/i).first()).toBeVisible();
        else {
          await expect(page.getByText(loading)).toHaveCount(0);
          if(scenario.view==="batches") await expect(page.getByRole("heading",{name:"Synthetic afternoon batch",exact:true})).toHaveCount(scenario.empty?0:1);
          if(scenario.view==="course-materials") await expect(page.getByRole("option",{name:/R-008/})).toHaveCount(scenario.empty?0:1);
          if(scenario.view==="review-queue") await expect(page.getByText("Synthetic guided writing")).toHaveCount(scenario.empty?0:1);
        }
      }
      const loadedFonts = await page.evaluate(async () => {
        // The actual app font must load; a fallback font is not valid evidence.
        const faces = await Promise.all(
          [400, 500, 600, 700].map((weight) =>
            document.fonts.load(`${weight} 16px "IBM Plex Sans"`, "Aa ЖҚ"),
          ),
        );
        await document.fonts.ready;
        return faces.map(
          (group) =>
            group.length > 0 && group.every((face) => face.status === "loaded"),
        );
      });
      expect(
        loadedFonts,
        "Pinned production typeface and weights loaded",
      ).toEqual([true, true, true, true]);
      expect.soft(errors, "Browser errors").toEqual([]);
      expect.soft(external, "Unexpected external network").toEqual([]);
      expect
        .soft(
          await page.evaluate(() => window.__visualUnexpected),
          "Unconfigured synthetic backend requests",
        )
        .toEqual([]);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const accessibilityPath = info.outputPath("accessibility.json");
      fs.writeFileSync(
        accessibilityPath,
        JSON.stringify(accessibility, null, 2),
      );
      await info.attach("accessibility", {
        path: accessibilityPath,
        contentType: "application/json",
      });
      expect
        .soft(
          accessibility.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => n.target),
          })),
          "WCAG violations",
        )
        .toEqual([]);
      const width = page.viewportSize().width;
      for (const w of [...new Set([width, 320, 390, 1024])]) {
        await page.setViewportSize({
          width: w,
          height: info.project.use.viewport.height,
        });
        // WebKit can acknowledge a viewport resize before the next layout frame.
        // Measure the settled viewport; keep the same overflow threshold.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect
          .soft(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `Page overflow at ${w}px`,
          )
          .toBe(true);
        const overlaps = await page.evaluate(() => {
          const found = [];
          for (const nav of document.querySelectorAll(
            'nav[aria-label="Reading passages"],.sp-tabs,.ix-actions',
          )) {
            const buttons = [...nav.querySelectorAll("button")]
              .map((e) => ({
                text: e.textContent,
                rect: e.getBoundingClientRect(),
              }))
              .filter((x) => x.rect.width && x.rect.height);
            for (let i = 0; i < buttons.length; i++)
              for (let j = i + 1; j < buttons.length; j++) {
                const a = buttons[i].rect,
                  b = buttons[j].rect;
                if (
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
                )
                  found.push([buttons[i].text, buttons[j].text]);
              }
          }
          return found;
        });
        expect.soft(overlaps, `Navigation overlap at ${w}px`).toEqual([]);
      }
      await page.setViewportSize({
        width,
        height: info.project.use.viewport.height,
      });
      await page.mouse.move(0, 0);
      // Fixed dialogs need the actual viewport; a full-page image shrinks the
      // dialog against off-screen questions that are not part of the view.
      const fullPage = !["dialog", "reading-confirm"].includes(scenario.id);
      const candidate = info.outputPath("candidate.png");
      await page.screenshot({
        path: candidate,
        fullPage,
        animations: "disabled",
      });
      await info.attach("candidate", {
        path: candidate,
        contentType: "image/png",
      });
      const snapshot = `${scenario.id}--${mode}.png`;
      if (
        process.env.VISUAL_COMPARE === "1" ||
        fs.existsSync(info.snapshotPath(snapshot))
      ) {
        expect(
          fs.existsSync(info.snapshotPath(snapshot)),
          "Missing approved reference: review candidates; never auto-approve on CI",
        ).toBe(true);
        await expect(page).toHaveScreenshot(snapshot, { fullPage });
      }
    });
