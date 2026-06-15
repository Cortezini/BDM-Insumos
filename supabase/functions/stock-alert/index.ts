import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record; // O produto APÓS a edição
    const old_record = payload.old_record; // O produto ANTES da edição

    // Ignora se não for uma atualização válida (ex: inserção de produto novo)
    if (!record || !old_record) {
      return new Response("Ignorado: Não é um update", { status: 200 });
    }

    // Regra: Estoque bateu no mínimo agora, e antes estava acima do mínimo?
    const atingiuMinimo = record.current_stock <= record.min_stock;
    const jaTavaAbaixo = old_record.current_stock <= old_record.min_stock;

    if (atingiuMinimo && !jaTavaAbaixo) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Inventário <alertas@bdmgrupo.com>", // Email padrão de teste do Resend
          to: ["matheus@bdmgrupo.com", "financeiro01@bdmgrupo.com"], // COLOQUE AQUI O EMAIL QUE VOCÊ USOU PARA CRIAR A CONTA NO RESEND
          subject: `⚠️ Alerta de Estoque: ${record.name}`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <h2>Aviso de Estoque Mínimo</h2>
              <p>O produto <strong>${record.name}</strong> atingiu o limite de alerta.</p>
              <ul>
                <li><strong>SKU:</strong> ${record.sku || "N/A"}</li>
                <li><strong>Estoque Atual:</strong> <span style="color: red;">${record.current_stock}</span> ${record.unit}</li>
                <li><strong>Estoque Mínimo Exigido:</strong> ${record.min_stock} ${record.unit}</li>
              </ul>
              <p>Acesse o sistema para providenciar a reposição.</p>
            </div>
          `,
        }),
      });

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, reason: "Estoque não cruzou a linha mínima" }),
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
