import "@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ALERT_ROLES = ["admin", "admin_empresa", "gestor"];

type ProductRecord = {
  id?: string;
  company_id?: string | null;
  name?: string | null;
  sku?: string | null;
  unit?: string | null;
  current_stock?: number | string | null;
  min_stock?: number | string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  blocked: boolean | null;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getCompanyAlertRecipients(companyId: string) {
  const admin = getAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, active")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!company?.active) return { companyName: company?.name ?? "Empresa", recipients: [] };

  const { data: memberships, error: membershipsError } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("active", true)
    .in("role", ALERT_ROLES);

  if (membershipsError) throw membershipsError;

  const userIds = Array.from(
    new Set((memberships ?? []).map((membership) => membership.user_id).filter(Boolean)),
  );

  if (!userIds.length) return { companyName: company.name as string, recipients: [] };

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, full_name, blocked")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  const recipients = Array.from(
    new Set(
      ((profiles ?? []) as ProfileRow[])
        .filter((profile) => !profile.blocked)
        .map((profile) => profile.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  );

  return { companyName: company.name as string, recipients };
}

async function sendStockAlertEmail({
  to,
  companyName,
  record,
}: {
  to: string;
  companyName: string;
  record: ProductRecord;
}) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY nao configurada.");

  const productName = escapeHtml(record.name || "Produto sem nome");
  const sku = escapeHtml(record.sku || "N/A");
  const unit = escapeHtml(record.unit || "");
  const currentStock = escapeHtml(record.current_stock);
  const minStock = escapeHtml(record.min_stock);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Inventario <alertas@bdmgrupo.com>",
      to: [to],
      subject: `Alerta de Estoque: ${record.name || "Produto sem nome"}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Aviso de Estoque Minimo</h2>
          <p>Empresa: <strong>${escapeHtml(companyName)}</strong></p>
          <p>O produto <strong>${productName}</strong> atingiu o limite de alerta.</p>
          <ul>
            <li><strong>SKU:</strong> ${sku}</li>
            <li><strong>Estoque Atual:</strong> <span style="color: red;">${currentStock}</span> ${unit}</li>
            <li><strong>Estoque Minimo Exigido:</strong> ${minStock} ${unit}</li>
          </ul>
          <p>Acesse o sistema para providenciar a reposicao.</p>
        </div>
      `,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string" ? body.message : `Falha ao enviar para ${to}.`,
    );
  }

  return body;
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record as ProductRecord | undefined;
    const oldRecord = payload.old_record as ProductRecord | undefined;

    if (!record || !oldRecord) {
      return jsonResponse({ success: true, reason: "Ignorado: nao e um update." });
    }

    const companyId = record.company_id;
    if (!companyId) {
      return jsonResponse({ success: true, reason: "Produto sem empresa vinculada." });
    }

    const minStock = toNumber(record.min_stock);
    const currentStock = toNumber(record.current_stock);
    const oldMinStock = toNumber(oldRecord.min_stock);
    const oldCurrentStock = toNumber(oldRecord.current_stock);

    if (minStock <= 0) {
      return jsonResponse({ success: true, reason: "Estoque minimo zerado, alerta ignorado." });
    }

    const reachedMinimum = currentStock <= minStock;
    const wasAlreadyBelow = oldMinStock > 0 && oldCurrentStock <= oldMinStock;

    if (!reachedMinimum || wasAlreadyBelow) {
      return jsonResponse({
        success: true,
        reason: "Estoque nao cruzou a linha minima.",
      });
    }

    const { companyName, recipients } = await getCompanyAlertRecipients(companyId);
    if (!recipients.length) {
      return jsonResponse({
        success: true,
        reason: "Nenhum gestor ou admin ativo com e-mail encontrado para esta empresa.",
        companyId,
      });
    }

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendStockAlertEmail({
          to: recipient,
          companyName,
          record,
        }),
      ),
    );

    const sent = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - sent;

    return jsonResponse({
      success: failed === 0,
      companyId,
      recipients: recipients.length,
      sent,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return jsonResponse({ error: message }, 500);
  }
});
