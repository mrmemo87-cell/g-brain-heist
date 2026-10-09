// Installation completed; this endpoint is permanently retired. Deploy with verify_jwt=true.
Deno.serve(() => new Response("Gone", { status: 410 }));
