export function audit({
  inventory,
  cases,
  projects,
  modes,
  hash,
  evidence,
  reviews,
  baselineHash,
}) {
  const failures = [],
    surfaces = [];
  const current = evidence?.sourceHash === hash && evidence.status === "passed";
  if (!current)
    failures.push(
      "Passing browser evidence for the exact source version is missing.",
    );
  const hasPass = (key, project) =>
    current &&
    evidence.tests.some(
      (t) =>
        t.case === key &&
        t.project === project &&
        t.status === "passed" &&
        t.expectedStatus === "passed",
    );
  for (const surface of inventory) {
    const fixtures = cases.filter((c) => c.surface === surface.id),
      missing = surface.requiredStates.filter(
        (s) => !fixtures.some((c) => c.state === s),
      );
    const roleGaps = (surface.roles ?? []).flatMap((role) =>
      surface.requiredStates
        .filter(
          (state) =>
            !fixtures.some(
              (c) => (c.role ?? "student") === role && c.state === state,
            ),
        )
        .map((state) => `${role}/${state}`),
    );
    const device = reviews.devices.some(
      (r) =>
        r.surface === surface.id &&
        r.sourceHash === hash &&
        r.device &&
        r.browser &&
        r.reviewer &&
        Number.isFinite(Date.parse(r.reviewedAt)) &&
        r.result === "pass",
    );
    if (missing.length)
      failures.push(
        `${surface.id}: missing fixture states ${missing.join(", ")}`,
      );
    if (roleGaps.length)
      failures.push(
        `${surface.id}: missing role coverage ${roleGaps.join(", ")}`,
      );
    if (!device)
      failures.push(`${surface.id}: real-device review missing/stale`);
    const expected = fixtures.length * projects.length * modes.length;
    const passed = fixtures.reduce(
      (n, c) =>
        n +
        projects.reduce(
          (sum, p) =>
            sum + modes.filter((m) => hasPass(`${c.id}--${m}`, p)).length,
          0,
        ),
      0,
    );
    surfaces.push({
      id: surface.id,
      routes: surface.routes,
      fixtureStates: fixtures.map((c) => c.state),
      missingStates: missing,
      missingRoles: roleGaps,
      browserPasses: passed,
      expectedBrowserChecks: expected,
      deviceReviewed: device,
      status: !fixtures.length
        ? "Unchecked"
        : passed < expected
          ? "Issues found or checks missing"
          : missing.length || roleGaps.length || !device
            ? "Further verification needed"
            : "Awaiting screenshot review",
    });
  }
  for (const c of cases)
    for (const project of projects)
      for (const mode of modes) {
        const key = `${c.id}--${mode}`;
        if (!hasPass(key, project))
          failures.push(`${key}/${project}: passing browser check missing`);
        const review = reviews.screenshots.find(
          (r) =>
            r.case === key &&
            r.project === project &&
            r.sourceHash === hash &&
            r.reviewer &&
            Number.isFinite(Date.parse(r.reviewedAt)) &&
            r.evidenceURL &&
            r.result === "approved",
        );
        const imageHash = baselineHash(project, key);
        if (!review || !imageHash || review.imageSha256 !== imageHash)
          failures.push(
            `${key}/${project}: approved screenshot reference missing/stale`,
          );
      }
  for (const s of surfaces) {
    const keys = cases
      .filter((c) => c.surface === s.id)
      .map((c) => c.id + "--");
    if (
      !failures.some(
        (f) => f.startsWith(s.id + ":") || keys.some((k) => f.startsWith(k)),
      ) &&
      current
    )
      s.status = "Verified for recorded scope";
  }
  return {
    sourceHash: hash,
    status: failures.length
      ? "NOT VISUALLY VERIFIED"
      : "VERIFIED FOR RECORDED SCOPE",
    surfaces,
    fixtureCases: cases.length,
    failures,
  };
}
