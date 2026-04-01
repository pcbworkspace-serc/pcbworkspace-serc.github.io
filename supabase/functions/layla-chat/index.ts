import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {"Access-Control-Allow-Origin": "*","Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { messages, system } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type": "application/json","x-api-key": apiKey,"anthropic-version": "2023-06-01"},
      body: JSON.stringify({model: "claude-haiku-4-5", max_tokens: 1024, system, messages}),
    });
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: {...corsHeaders, "Content-Type": "application/json"} });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: {...corsHeaders, "Content-Type": "application/json"} });
  }
});
