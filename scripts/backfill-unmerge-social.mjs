// =====================================================================
// Desfusão de empresas agregadas indevidamente por domínio de rede social.
//
// PROBLEMA: o Google devolve o perfil do Instagram/Facebook em `websiteUri`
// quando o negócio não tem site próprio. A dedup por domínio tratava isso
// como identidade e fundiu negócios distintos num só registro. Cada fonte
// (company_sources) preserva o payload original do Google, então a desfusão
// é possível sem perda.
//
// SEGURANÇA:
//   - modo RELATÓRIO por padrão; nada muda sem --apply;
//   - a empresa "dona" (a que corresponde ao próprio place ID) é preservada
//     com seu histórico, análises, score e decisões;
//   - cada fonte indevida vira uma empresa NOVA, entrando em pending_analysis;
//   - nada é apagado: as fontes são movidas, não removidas;
//   - idempotente: rodar de novo não altera mais nada;
//   - auditado em unmerge_audit, com rollback.
//
// Uso:
//   node scripts/backfill-unmerge-social.mjs             # relatório
//   node scripts/backfill-unmerge-social.mjs --apply     # aplica
//   node scripts/backfill-unmerge-social.mjs --rollback  # desfaz
// =====================================================================

import fs from "node:fs";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

const SOCIAL = [
  "instagram.com", "facebook.com", "fb.com", "m.facebook.com",
  "linktr.ee", "linktree.com", "wa.me", "api.whatsapp.com",
  "web.whatsapp.com", "whatsapp.com", "tiktok.com", "youtube.com",
  "youtu.be", "twitter.com", "x.com", "linkedin.com", "beacons.ai",
  "bio.link", "bit.ly", "google.com", "sites.google.com",
  "business.site", "negocio.site",
];

const UF_BY_NAME = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA",
  ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO",
  maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO",
  roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE",
  tocantins: "TO",
};

const strip = (v) => (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normUf = (v) => {
  if (!v) return null;
  const raw = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return UF_BY_NAME[strip(raw).toLowerCase().replace(/\s+/g, " ")] ?? raw.toUpperCase().slice(0, 2);
};
const normName = (n) =>
  strip(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const normPhone = (p) => {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55")) return "+" + d;
  return "+55" + d;
};
const domainOf = (url) => {
  if (!url) return null;
  try {
    const u = /^https?:\/\//i.test(url) ? url : "https://" + url;
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
const isSocial = (d) =>
  Boolean(d) && (SOCIAL.includes(d) || SOCIAL.some((s) => d.endsWith("." + s)));

const url = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sql = postgres(url, { prepare: false, max: 3, connect_timeout: 10, onnotice: () => {} });
const q = (t, p = []) => sql.unsafe(t, p);

// Exige que a tabela de auditoria exista com RLS ativo (migration 0010).
async function requireAuditTable(name) {
  const [row] = await q(
    `select c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1`,
    [name],
  );
  if (!row) {
    console.error(
      `✗ Tabela "${name}" não existe. Aplique a migration 0010_backfill_audit.sql antes de rodar este script.`,
    );
    process.exit(1);
  }
  if (!row.rls) {
    console.error(
      `✗ Tabela "${name}" existe mas está SEM row level security. Execute:\n    alter table ${name} enable row level security;`,
    );
    process.exit(1);
  }
}

/** Reconstrói os campos da empresa a partir do payload original do Google. */
function fromPlace(place, fallbackCity, fallbackState) {
  const comp = place.addressComponents ?? [];
  const byType = (type, short) => {
    const m = comp.find((c) => (c.types ?? []).includes(type));
    return short ? (m?.shortText ?? m?.longText ?? null) : (m?.longText ?? m?.shortText ?? null);
  };
  const website = place.websiteUri ?? null;
  const domain = domainOf(website);
  return {
    externalId: place.id ?? null,
    name: place.displayName?.text ?? "(sem nome)",
    primaryCategory: place.primaryTypeDisplayName?.text ?? null,
    phoneRaw: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    phoneE164: normPhone(place.internationalPhoneNumber ?? place.nationalPhoneNumber),
    websiteUrl: website,
    // Rede social nunca vira domínio de identidade.
    normalizedDomain: isSocial(domain) ? null : domain,
    addressLine: place.formattedAddress ?? null,
    city: byType("locality") ?? byType("administrative_area_level_2") ?? fallbackCity,
    state: normUf(byType("administrative_area_level_1", true) ?? fallbackState),
    postalCode: byType("postal_code"),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    reviewsCount: place.userRatingCount ?? null,
    sourceUrl: place.googleMapsUri ?? null,
  };
}

try {
  // Ver nota em backfill-uf.mjs: a tabela vem da migration 0010, com RLS.
  await requireAuditTable("unmerge_audit");

  if (ROLLBACK) {
    const audit = await q("select * from unmerge_audit order by applied_at desc");
    for (const a of audit) {
      await q("update company_sources set company_id=$2, updated_at=now() where id=$1", [
        a.source_id,
        a.from_company,
      ]);
      await q("update company_field_evidence set company_id=$2 where source_id=$1", [
        a.source_id,
        a.from_company,
      ]);
      // Remove a empresa criada pela desfusão, se nada foi anexado a ela.
      await q(
        `delete from companies c where c.id=$1
           and not exists (select 1 from ai_analyses where company_id=c.id)
           and not exists (select 1 from company_decisions where company_id=c.id)
           and not exists (select 1 from messages where company_id=c.id)`,
        [a.to_company],
      );
    }
    await q("delete from unmerge_audit");
    console.log(`✓ ${audit.length} fonte(s) devolvidas à empresa original.`);
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  console.log(
    APPLY
      ? "=== DESFUSÃO — MODO APLICAÇÃO ===\n"
      : "=== DESFUSÃO — RELATÓRIO (nada será alterado) ===\n",
  );

  // (a) fundidas por domínio de rede social;
  // (b) fundidas por domínio próprio compartilhado, mas com TELEFONES
  //     divergentes entre as fontes — filiais de uma rede são negócios
  //     distintos (endereço, telefone e decisor próprios).
  const suspects = await q(
    `select c.id, c.name, c.city, c.state, c.normalized_domain,
            count(s.id)::int as fontes,
            count(distinct s.external_id)::int as place_ids,
            count(distinct nullif(regexp_replace(
              coalesce(s.raw_payload->>'internationalPhoneNumber',''), '\D', '', 'g'
            ), ''))::int as telefones
       from companies c
       join company_sources s on s.company_id = c.id
      where c.deleted_at is null
      group by c.id
     having count(distinct s.external_id) > 1
        and (c.normalized_domain = any($1)
             or count(distinct nullif(regexp_replace(
                  coalesce(s.raw_payload->>'internationalPhoneNumber',''), '\D', '', 'g'
                ), '')) > 1)
      order by 7 desc`,
    [SOCIAL],
  );

  if (suspects.length === 0) {
    console.log("Nenhuma empresa fundida indevidamente. Nada a fazer.");
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  let totalSplit = 0;
  let applied = 0;

  for (const c of suspects) {
    console.log(
      `\n[${c.name}] (${c.city}/${c.state}) domínio=${c.normalized_domain}` +
        `  fontes=${c.fontes} placeIDs=${c.place_ids} telefones=${c.telefones}`,
    );

    const sources = await q(
      `select id, external_id, raw_payload, source_url from company_sources
        where company_id=$1 order by collected_at`,
      [c.id],
    );

    // A fonte "dona" é a que corresponde ao nome atual da empresa.
    const ownName = normName(c.name);
    const companyPhone = (
      await q("select phone_e164 from companies where id=$1", [c.id])
    )[0]?.phone_e164;
    let keeper =
      sources.find((s) => normName(s.raw_payload?.displayName?.text ?? "") === ownName) ??
      (companyPhone
        ? sources.find(
            (s) =>
              normPhone(
                s.raw_payload?.internationalPhoneNumber ??
                  s.raw_payload?.nationalPhoneNumber,
              ) === companyPhone,
          )
        : null) ??
      sources[0];
    console.log(
      `  mantém : ${keeper.raw_payload?.displayName?.text ?? "(sem nome)"} (place ${String(keeper.external_id).slice(0, 20)})`,
    );

    for (const s of sources) {
      if (s.id === keeper.id) continue;
      const place = s.raw_payload ?? {};
      const data = fromPlace(place, c.city, c.state);
      totalSplit++;

      // Já existe empresa com este place ID em outro registro?
      const already = await q(
        `select c2.id, c2.name from companies c2
           join company_sources s2 on s2.company_id=c2.id
          where s2.external_id=$1 and c2.id <> $2 and c2.deleted_at is null limit 1`,
        [s.external_id, c.id],
      );
      if (already.length) {
        console.log(`  já existe separada: ${data.name} -> ${already[0].name}`);
        continue;
      }

      console.log(
        `  separar: ${data.name}  tel=${data.phoneE164 ?? "-"}  ${data.city}/${data.state}`,
      );

      if (!APPLY) continue;

      // Conflito de telefone (índice único): não cria empresa nova, apenas
      // registra — evita quebrar a restrição existente.
      if (data.phoneE164) {
        const dup = await q(
          "select id, name from companies where phone_e164=$1 and deleted_at is null limit 1",
          [data.phoneE164],
        );
        if (dup.length && dup[0].id !== c.id) {
          console.log(`     ! telefone já pertence a "${dup[0].name}" — fonte movida para lá`);
          await q("update company_sources set company_id=$2, updated_at=now() where id=$1", [
            s.id,
            dup[0].id,
          ]);
          await q("update company_field_evidence set company_id=$2 where source_id=$1", [
            s.id,
            dup[0].id,
          ]);
          await q(
            `insert into unmerge_audit (source_id, from_company, to_company, external_id, company_name)
             values ($1,$2,$3,$4,$5)`,
            [s.id, c.id, dup[0].id, s.external_id, data.name],
          );
          applied++;
          continue;
        }
      }

      const created = (
        await q(
          `insert into companies (
             name, normalized_name, primary_category, phone_raw, phone_e164,
             website_url, normalized_domain, address_line, city, state,
             postal_code, country_code, latitude, longitude, rating,
             reviews_count, review_status, pipeline_stage
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'BR',$12,$13,$14,$15,
                     'pending_analysis','new')
           returning id`,
          [
            data.name, normName(data.name), data.primaryCategory, data.phoneRaw,
            data.phoneE164, data.websiteUrl, data.normalizedDomain, data.addressLine,
            data.city, data.state, data.postalCode, data.latitude, data.longitude,
            data.rating, data.reviewsCount,
          ],
        )
      )[0];

      await q("update company_sources set company_id=$2, updated_at=now() where id=$1", [
        s.id,
        created.id,
      ]);
      await q("update company_field_evidence set company_id=$2 where source_id=$1", [
        s.id,
        created.id,
      ]);
      await q(
        `insert into unmerge_audit (source_id, from_company, to_company, external_id, company_name)
         values ($1,$2,$3,$4,$5)`,
        [s.id, c.id, created.id, s.external_id, data.name],
      );
      applied++;
    }

    // O domínio social deixa de identificar a empresa que ficou.
    if (APPLY && isSocial(c.normalized_domain)) {
      // Domínio próprio compartilhado (rede) continua válido na empresa;
      // só o de rede social deixa de identificá-la.
      await q(
        "update companies set normalized_domain=null, updated_at=now() where id=$1",
        [c.id],
      );
    }
  }

  console.log(
    `\nEmpresas fundidas encontradas : ${suspects.length}`,
  );
  console.log(`Registros a separar           : ${totalSplit}`);
  if (APPLY) {
    console.log(`✓ ${applied} empresa(s) restauradas. Auditoria em unmerge_audit.`);
    console.log("  Para desfazer: node scripts/backfill-unmerge-social.mjs --rollback");
  } else {
    console.log("\nNada foi alterado. Para aplicar: --apply");
  }
} catch (e) {
  console.error("FALHA:", e.code || "", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
