// The narrow authenticated installation capability was retired after verifying
// both approved files in protected Storage. Never leave an ingestion endpoint active.
Deno.serve(() => new Response('Installation completed; endpoint retired.', {status:410}));
