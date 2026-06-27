import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un agente autónomo de optimización de marketing digital para negocios locales españoles. Recibes el presupuesto simulado, el canal elegido y datos de ROI proyectados, y debes devolver un análisis estratégico completo en JSON estricto (sin bloques de código, sin markdown exterior).

Modelo matemático de referencia que DEBES usar como base para tus cálculos:

LEADS BASE POR CANAL (mensual, antes de optimización del agente):
- ads_locales: CPL local España ≈ 14-22€. Fórmula leads/mes = inversión / CPL_dinámico, donde CPL_dinámico = 18 - (inversión/1000)*4 (más presupuesto = mejor CPL por economías de escala). Ej: 300€/mes → CPL≈16.8 → ~18 leads/mes.
- campana_resenas: Cada €50 de campaña genera ~4 reseñas verificadas/mes. Cada reseña activa genera 0.35 leads orgánicos/mes sostenidos. leads/mes = (inversión/50)*4*0.35 = inversión*0.028. Efecto compuesto: mes 6 = inversión*0.028*(1+5*0.15), mes 12 = inversión*0.028*(1+11*0.18).
- seo_contenidos: Mes 1-3 → 0 leads. Mes 4-6 → inversión*0.012 leads/mes. Mes 7-12 → inversión*0.025*(mes-6)^0.7 leads/mes. Break-even lento pero curva exponencial sostenida.

OPTIMIZACIÓN DEL AGENTE AUTÓNOMO:
El agente simula cómo redistribuiría el presupuesto para maximizar el ROI total a 12 meses. Reglas:
- Si canal=ads: mantener 70% en ads + derivar 20% a reseñas a partir del mes 4 (sinergias de conversión) + 10% buffer remarketing.
- Si canal=resenas: mantener 85% reseñas + añadir 15% en ads durante meses 1-3 para compensar el lag orgánico inicial.
- Si canal=seo: mantener 60% SEO + 30% ads durante meses 1-5 (compensar dead zone) + 10% reseñas para autoridad de dominio.
El agente calcula el ROI adicional de esta redistribución vs. la estrategia original.

RIESGO:
- ads: riesgo bajo-medio (dependencia de plataforma, CPC variable), score 25-45
- resenas: riesgo bajo (orgánico y sostenido), score 10-30
- seo: riesgo medio (largo plazo, dependencia de algoritmo), score 30-55
Factores adicionales: presupuesto < 150€/mes sube riesgo +15 puntos.

Devuelve EXACTAMENTE este JSON (completa todos los campos):

{
  "leadIncrease": {
    "month3": <número entero, leads adicionales/mes en mes 3>,
    "month6": <número entero, leads adicionales/mes en mes 6>,
    "month12": <número entero, leads adicionales/mes en mes 12>,
    "yearlyTotal": <número entero, suma total leads en 12 meses>,
    "cpl": "<coste por lead promedio anual, ej: 14.50>",
    "vsBaseline": "<% incremento vs negocio sin inversión, ej: +320%>"
  },
  "agentOptimization": {
    "strategy": "<1 frase resumiendo la estrategia del agente>",
    "budgetSplit": [
      { "channel": "<nombre canal>", "pct": <número 0-100>, "euros": <inversión mensual en €>, "reason": "<razón táctica en 1 frase>" },
      <2-3 filas según el canal>
    ],
    "optimizedLeads12": <leads/mes en mes 12 con estrategia del agente>,
    "optimizedROI": <retorno adicional en € a 12 meses vs estrategia original>,
    "deltaVsOriginal": "<+X% leads vs estrategia sin optimizar>"
  },
  "risk": {
    "level": "<bajo|medio|alto>",
    "score": <0-100>,
    "factors": ["<factor específico 1>", "<factor específico 2>", "<factor específico 3>"],
    "mitigation": "<recomendación concreta para mitigar el riesgo principal en 1-2 frases>"
  },
  "projectedROI": {
    "month6": <retorno acumulado € mes 6>,
    "month12": <retorno acumulado € mes 12>,
    "multiplier": "<ej: 2.4x>",
    "breakeven": "<ej: Mes 7 o No alcanzado en 12 meses>",
    "annualNetProfit": <beneficio neto anual = retorno12 - inversión_anual>
  },
  "verdict": {
    "recommendation": "<ejecutar|revisar|no_ejecutar>",
    "title": "<título del veredicto en 5-7 palabras>",
    "reasoning": "<razonamiento estratégico en 2-3 frases explicando el veredicto>",
    "confidence": <0-100, nivel de confianza del veredicto>,
    "urgency": "<inmediata|moderada|baja>"
  },
  "keyInsights": [
    "<insight estratégico clave 1 — específico y accionable>",
    "<insight 2>",
    "<insight 3>"
  ]
}

Reglas críticas:
- Todos los cálculos DEBEN ser coherentes con el modelo matemático dado.
- "annualNetProfit" = projectedROI.month12 - (investment * 12)
- "optimizedROI" es el retorno ADICIONAL que genera la redistribución del agente vs NO redistribuir.
- El veredicto "ejecutar" requiere: multiplier >= 1.4x Y risk.score < 60 Y breakeven <= mes 9.
- El veredicto "no_ejecutar" solo si: multiplier < 1.0x O risk.score > 75.
- De lo contrario, "revisar".
- Responde en español. Los campos numéricos son siempre números (sin € ni % en campos numéricos).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { investment, canal, roiMonth6, roiMonth12 } = await req.json();

    if (!investment || !canal) {
      return new Response(JSON.stringify({ error: "investment y canal son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canalNames: Record<string, string> = {
      ads: "Ads Locales",
      reviews: "Campaña de Reseñas",
      seo: "SEO de Contenidos",
    };

    const userMessage = `Analiza esta campaña de marketing local:

**Presupuesto mensual simulado:** ${investment}€/mes
**Canal seleccionado:** ${canalNames[canal] ?? canal}
**Inversión anual total:** ${investment * 12}€
**ROI proyectado mes 6 (modelo estático):** ${roiMonth6}€
**ROI proyectado mes 12 (modelo estático):** ${roiMonth12}€

Aplica el modelo matemático del sistema, simula la optimización del agente autónomo y devuelve el JSON de análisis completo.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openAIRes.ok) {
      const errText = await openAIRes.text();
      throw new Error(`OpenAI error ${openAIRes.status}: ${errText}`);
    }

    const data = await openAIRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";

    let result: Record<string, unknown> = {};
    try { result = JSON.parse(raw); } catch { result = {}; }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
