import { readFile } from "node:fs/promises";
import path from "node:path";

const spls = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls";
const fda = "https://api.fda.gov/drug/ndc.json";
const rxnav = "https://rxnav.nlm.nih.gov/REST";
const approvedCategories = new Set(["NDA", "ANDA", "NDA AUTHORIZED GENERIC"]);
const injectableRoutes = new Set([
  "INTRAVENOUS",
  "INTRAMUSCULAR",
  "SUBCUTANEOUS",
  "INTRADERMAL",
  "INTRA-ARTICULAR",
  "INTRATHECAL",
  "EPIDURAL",
  "SUBARACHNOID",
  "PARENTERAL",
  "INTRAVITREAL",
  "INTRAVENOUS INFUSION",
  "INFILTRATION",
  "PERINEURAL",
  "INTRA-ARTERIAL",
]);

function billingNdc(value) {
  const parts = String(value || "").split("-");
  const shape = parts.map((part) => part.length).join("-");
  return parts.every((part) => /^\d+$/.test(part)) &&
    ["4-4-2", "5-3-2", "5-4-1"].includes(shape)
    ? parts.map((part, index) => part.padStart([5, 4, 2][index], "0")).join("")
    : "";
}

function labelFormats(ndc) {
  const parts = [ndc.slice(0, 5), ndc.slice(5, 9), ndc.slice(9)];
  return parts.flatMap((part, index) =>
    part.startsWith("0")
      ? [
          parts
            .map((value, i) => (i === index ? value.slice(1) : value))
            .join("-"),
        ]
      : [],
  );
}

function urlFor(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url;
}

async function getJson(url, fetcher, allowMissing = false) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 3600 },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error("Drug data service unavailable");
  return response.json();
}

function words(value) {
  return (
    String(value || "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
}

export function possibleSpecificCodes(drug, descriptors) {
  const names = [
    drug.brand_name,
    drug.generic_name,
    ...(drug.active_ingredients || []).map(({ name }) => name),
  ];
  const compounds = new Set(
    names.map((name) => words(name)[0]).filter((name) => name?.length >= 4),
  );
  const oral = drug.route?.length === 1 && drug.route[0] === "ORAL";
  const injectable = /^INJECTION(?:,|$)/.test(drug.dosage_form || "");
  return descriptors
    .filter(([, description, aliases = []]) => {
      const describesInjection =
        /\b(?:injection|injectable|intravenous|intramuscular)\b/i.test(
          description,
        );
      const describesOral = /\b(?:oral|orally|tablet|capsule)\b/i.test(
        description,
      );
      if (oral && describesInjection && !describesOral) return false;
      if (injectable && describesOral && !describesInjection) return false;
      return [description, ...aliases].some((term) =>
        words(term).some((word) => compounds.has(word)),
      );
    })
    .map(([code, description]) => [code, description]);
}

function fallbackByForm(drug, specificCodes) {
  if (
    !drug ||
    drug.product_type !== "HUMAN PRESCRIPTION DRUG" ||
    !approvedCategories.has(drug.marketing_category)
  ) {
    return {
      reason:
        "The package needs review for prescription status, approval type, or biologic coding.",
    };
  }
  if (specificCodes.length) {
    return {
      reason:
        "Check the possible product-specific HCPCS codes before using an unclassified code.",
    };
  }
  const routes = drug.route || [];
  if (routes.length === 1 && routes[0] === "ORAL") return { hcpcs: "J8499" };
  if (
    /^INJECTION(?:,|$)/.test(drug.dosage_form || "") &&
    routes.length &&
    routes.every((route) => injectableRoutes.has(route))
  ) {
    return { hcpcs: "J3490" };
  }
  return {
    reason:
      "The label does not establish a route and dosage form covered by these fallback rules.",
  };
}

export function assignFallback(drug, classIds, specificCodes) {
  const result = fallbackByForm(drug, specificCodes);
  if (
    result.hcpcs &&
    (!classIds.length || classIds.some((id) => /^(L01|L02|V10)/.test(id)))
  ) {
    return {
      reason:
        "The drug class is unverified or may require oncology or radiopharmaceutical coding.",
    };
  }
  return result;
}

let catalog;
function descriptors(directory) {
  catalog ??= Promise.all(
    ["hcpcs-descriptors.json", "manifest.json"].map((file) =>
      readFile(path.join(directory, file), "utf8").then(JSON.parse),
    ),
  )
    .then(([index, manifest]) =>
      index.quarter === manifest.quarter ? index : null,
    )
    .catch((error) => {
      catalog = undefined;
      throw error;
    });
  return catalog;
}

export async function lookupDailymed(ndc, directory, fetcher = fetch) {
  const variants = labelFormats(ndc);
  if (!variants.length) return { status: "not_found" };
  const [fdaData, ...labelResponses] = await Promise.all([
    getJson(
      urlFor(fda, {
        search: variants
          .map((v) => `packaging.package_ndc:"${v}"`)
          .join(" OR "),
        limit: "10",
      }),
      fetcher,
      true,
    ),
    ...variants.map((v) =>
      getJson(urlFor(spls + ".json", { ndc: v }), fetcher),
    ),
  ]);
  const productMatches = (fdaData?.results || []).filter((product) =>
    product.packaging?.some((entry) => billingNdc(entry.package_ndc) === ndc),
  );
  const knownLabels = new Set(
    productMatches.flatMap((product) => product.openfda?.spl_set_id || []),
  );
  const labels = [
    ...new Map(
      labelResponses
        .flatMap((response) => response.data || [])
        .map((label) => [label.setid, label]),
    ).values(),
  ]
    .filter(({ setid }) => /^[0-9a-f-]{36}$/i.test(setid))
    .sort(
      (a, b) =>
        Number(knownLabels.has(b.setid)) - Number(knownLabels.has(a.setid)),
    );

  // FDA package codes use a segmented 10-digit form. Check the exact package inside the SPL.
  const candidates = await Promise.all(
    labels.slice(0, 4).map(async (label) => {
      const { data } = await getJson(
        `${spls}/${label.setid}/packaging.json`,
        fetcher,
      );
      const product = data?.products?.find((item) =>
        item.packaging?.some(({ ndc: value }) => billingNdc(value) === ndc),
      );
      return (
        product && {
          label,
          product,
          pack: product.packaging.find(
            ({ ndc: value }) => billingNdc(value) === ndc,
          ),
        }
      );
    }),
  );
  const match = candidates.find(Boolean);
  if (!match) return { status: "not_found" };

  const { label, product, pack } = match;
  const fdaMatches = productMatches.filter(
    (entry) =>
      entry.product_ndc === product.product_code &&
      (!entry.openfda?.spl_set_id?.length ||
        entry.openfda.spl_set_id.includes(label.setid)),
  );
  const drug = fdaMatches.length === 1 ? fdaMatches[0] : null;
  const details = {
    ndc,
    packageNdc: pack.ndc,
    name: drug?.brand_name || product.product_name,
    generic: drug?.generic_name || product.product_name_generic,
    routes: drug?.route || [],
    form: drug?.dosage_form || "",
    ingredients: product.active_ingredients || [],
    packaging: pack.package_descriptions || [],
    labelDate: label.published_date || "",
    labelUrl:
      "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=" + label.setid,
  };
  if (!drug)
    return {
      ...details,
      status: "review",
      reason:
        "DailyMed found the package. Its FDA product listing could not be confirmed.",
    };

  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const exactPack = drug.packaging.find(
    (entry) => billingNdc(entry.package_ndc) === ndc,
  );
  if (
    [drug.marketing_end_date, exactPack.marketing_end_date].some(
      (date) => date && date <= today,
    )
  ) {
    return {
      ...details,
      status: "review",
      reason:
        "The FDA listing shows that marketing for this product or package has ended.",
    };
  }

  const index = await descriptors(directory);
  if (!index)
    return {
      ...details,
      status: "review",
      reason:
        "The CMS descriptor file has not been updated for this reference quarter.",
    };
  const { codes, source } = index;
  const specificCodes = possibleSpecificCodes(drug, codes);
  const precheck = fallbackByForm(drug, specificCodes);
  if (!precheck.hcpcs)
    return {
      ...details,
      ...precheck,
      specificCodes,
      hcpcsSource: source,
      status: "review",
    };

  const rx = await getJson(urlFor(rxnav + "/ndcstatus.json", { ndc }), fetcher);
  const rxId = rx.ndcStatus?.rxcui;
  const classResults =
    rx.ndcStatus?.status === "ACTIVE" && /^\d+$/.test(rxId || "")
      ? await getJson(
          urlFor(rxnav + "/rxclass/class/byRxcui.json", {
            rxcui: rxId,
            relaSource: "ATC",
          }),
          fetcher,
        )
      : null;
  const classIds = [
    ...new Set(
      (classResults?.rxclassDrugInfoList?.rxclassDrugInfo || [])
        .map((info) => info.rxclassMinConceptItem?.classId)
        .filter((id) => /^[A-Z][0-9]{2}/.test(id || "")),
    ),
  ];
  const assigned = assignFallback(drug, classIds, specificCodes);
  return {
    ...details,
    ...assigned,
    classIds,
    hcpcsSource: source,
    status: assigned.hcpcs ? "assigned" : "review",
  };
}
