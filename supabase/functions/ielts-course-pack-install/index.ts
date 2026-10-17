// Approved immutable ZIPs installed and SHA-256 verified on 2026-10-17.
// The temporary capability and ingestion handler are permanently retired.
Deno.serve(() => new Response('Installation completed; endpoint retired.', {status:410}));
