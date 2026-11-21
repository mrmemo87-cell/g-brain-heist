// The one-off installer stored and registered all 102 Speaking practice mock examiner files
// (2026-11-22, verified against the pinned SHA-256 list in manifest.ts, kept as the provenance
// record). The reviewed installer is commit a759b2a0. Never leave an ingestion endpoint active.
Deno.serve(() => new Response('Installation completed; endpoint retired.', { status: 410 }));
