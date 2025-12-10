// Minimal test version to debug
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  console.log("Function invoked!");
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Checking env vars...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    const envStatus = {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!serviceKey,
      hasOpenAiKey: !!openAiKey,
      openAiKeyStart: openAiKey ? openAiKey.substring(0, 10) + "..." : "missing",
    };

    console.log("Env status:", JSON.stringify(envStatus));

    return new Response(JSON.stringify({
      message: "Function is working!",
      env: envStatus,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({
      error: "Function error",
      details: String(error),
    }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
});
