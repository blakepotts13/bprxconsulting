/* Read ordinary .xlsx workbooks and patch only the XML parts needed for the audit. */
(() => {
  "use strict";

  const workbookPath = "xl/workbook.xml";
  const relsPath = "xl/_rels/workbook.xml.rels";
  const typesPath = "[Content_Types].xml";
  const spreadsheetNs =
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const officeRelNs =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const worksheetType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
  const maxFileSize = 15 * 1024 * 1024;
  const maxUnpacked = 64 * 1024 * 1024;
  const maxExcelRows = 1048576;
  const maxExcelColumns = 16384;
  const children = (node, localName) =>
    Array.from(node.children).filter((child) => child.localName === localName);
  const first = (node, name) => children(node, name)[0];
  const attr = (node, name) => node.getAttribute(name) || "";
  const xml = (value) => new XMLSerializer().serializeToString(value);
  const text = (value) => String(value ?? "").trim();

  function columnName(column) {
    let label = "";
    while (column > 0) {
      column--;
      label = String.fromCharCode(65 + (column % 26)) + label;
      column = Math.floor(column / 26);
    }
    return label;
  }

  function columnNumber(ref) {
    const letters = /^([A-Z]{1,3})[1-9]\d*$/.exec(ref)?.[1];
    if (!letters)
      throw new Error("This workbook contains an unreadable cell address.");
    return [...letters].reduce(
      (n, char) => n * 26 + char.charCodeAt(0) - 64,
      0,
    );
  }

  function partPath(rel) {
    const path = attr(rel, "Target");
    if (attr(rel, "TargetMode") === "External" || !path || /[?#\\]/.test(path))
      return "";
    const url = new URL(path, "https://workbook.invalid/" + workbookPath);
    return url.origin === "https://workbook.invalid"
      ? decodeURIComponent(url.pathname.slice(1))
      : "";
  }

  function readXml(bytes) {
    if (!bytes)
      throw new Error("The workbook is missing a required Excel file.");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(raw))
      throw new Error("This workbook uses unsupported XML declarations.");
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (doc.getElementsByTagNameNS("*", "parsererror").length)
      throw new Error("An Excel sheet could not be read.");
    return doc;
  }

  function unpack(bytes) {
    if (bytes.byteLength > maxFileSize)
      throw new Error("Choose an .xlsx workbook under 15 MB.");
    let total = 0;
    let count = 0;
    let overLimit = false;
    let invalidEntry = false;
    const names = new Set();
    const parts = fflate.unzipSync(bytes, {
      filter(entry) {
        count++;
        if (
          entry.name.startsWith("/") ||
          entry.name.includes("\\") ||
          entry.name
            .split("/")
            .some((part) => part === ".." || part === "__proto__") ||
          names.has(entry.name)
        )
          invalidEntry = true;
        names.add(entry.name);
        total += entry.originalSize;
        if (count > 2000 || total > maxUnpacked) overLimit = true;
        return !overLimit && !invalidEntry;
      },
    });
    if (invalidEntry)
      throw new Error("This workbook contains unsupported archive entries.");
    if (overLimit)
      throw new Error("This workbook is too large to process in your browser.");
    if (
      Object.keys(parts).some((name) =>
        /vbaProject\.bin$|^_xmlsignatures\//i.test(name),
      )
    ) {
      throw new Error(
        "Choose a standard .xlsx workbook without macros or a digital signature.",
      );
    }
    return Object.assign(Object.create(null), parts);
  }

  function richText(node) {
    if (!node) return "";
    return (
      children(node, "t")
        .map((t) => t.textContent)
        .join("") +
      children(node, "r")
        .map((run) => first(run, "t")?.textContent || "")
        .join("")
    );
  }

  function styleMasks(styles) {
    if (!styles) return [];
    const root = styles.documentElement;
    const formats = new Map(
      children(first(root, "numFmts") || root, "numFmt").map((fmt) => [
        attr(fmt, "numFmtId"),
        attr(fmt, "formatCode"),
      ]),
    );
    const xfs = first(root, "cellXfs");
    return xfs
      ? children(xfs, "xf").map((xf) => {
          const mask = formats.get(attr(xf, "numFmtId")) || "";
          return /^(?:0{11}|0{5}[-\\"]+0{4}[-\\"]+0{2})$/.test(mask)
            ? mask.replace(/[\\"]/g, "")
            : "";
        })
      : [];
  }

  function cellValue(cell, shared, masks) {
    if (!cell) return { value: "", formula: false };
    const type = attr(cell, "t");
    const raw = first(cell, "v")?.textContent || "";
    let value = raw;
    if (type === "s") value = raw ? (shared[Number(raw)] ?? "") : "";
    if (type === "inlineStr") value = richText(first(cell, "is"));
    if (type === "e") value = "";
    if (!type || type === "n") {
      const mask = masks[Number(attr(cell, "s"))];
      const n = Number(raw);
      if (raw && Number.isSafeInteger(n) && n >= 0) {
        value = String(n);
        if (mask && value.length <= 11) {
          value = value.padStart(11, "0");
          if (mask.includes("-"))
            value = value.replace(/^(\d{5})(\d{4})(\d{2})$/, "$1-$2-$3");
        }
      }
    }
    return { value: text(value), formula: Boolean(first(cell, "f")) };
  }

  function openWorkbook(bytes) {
    let parts;
    try {
      parts = unpack(bytes);
    } catch (error) {
      if (/workbook|15 MB/.test(error.message)) throw error;
      throw new Error(
        "Choose a readable .xlsx workbook. Password-protected workbooks and older .xls files cannot be processed.",
      );
    }
    const book = readXml(parts[workbookPath]);
    const rels = readXml(parts[relsPath]);
    const types = readXml(parts[typesPath]);
    if (
      book.documentElement.namespaceURI !== spreadsheetNs ||
      !children(types.documentElement, "Override").some(
        (node) =>
          attr(node, "PartName") === "/" + workbookPath &&
          attr(node, "ContentType") ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      )
    ) {
      throw new Error(
        "Save the file as a standard Excel Workbook (.xlsx) and try again.",
      );
    }
    const relations = children(rels.documentElement, "Relationship");
    const pathFor = (ending) =>
      partPath(
        relations.find((rel) => attr(rel, "Type") === officeRelNs + ending) ||
          rels.documentElement,
      );
    const shared = parts[pathFor("/sharedStrings")]
      ? children(
          readXml(parts[pathFor("/sharedStrings")]).documentElement,
          "si",
        ).map(richText)
      : [];
    const masks = styleMasks(
      parts[pathFor("/styles")] ? readXml(parts[pathFor("/styles")]) : null,
    );
    const sheetsNode = first(book.documentElement, "sheets");
    if (!sheetsNode) throw new Error("No worksheets were found.");
    const sheetNodes = children(sheetsNode, "sheet");
    const sheets = sheetNodes.flatMap((sheet) => {
      const id = sheet.getAttributeNS(officeRelNs, "id");
      const rel = relations.find(
        (candidate) =>
          attr(candidate, "Id") === id &&
          attr(candidate, "Type") === officeRelNs + "/worksheet",
      );
      const path = rel && partPath(rel);
      return path && Object.hasOwn(parts, path)
        ? [
            {
              name: attr(sheet, "name"),
              path,
              hidden: ["hidden", "veryHidden"].includes(attr(sheet, "state")),
            },
          ]
        : [];
    });
    if (!sheets.length) throw new Error("No worksheets were found.");
    return {
      parts,
      book,
      rels,
      types,
      sheetNodes,
      relations,
      sheets,
      shared,
      masks,
    };
  }

  function readSheet(workbook, sheet) {
    const doc = readXml(workbook.parts[sheet.path]);
    const root = doc.documentElement;
    const sheetData = first(root, "sheetData");
    if (!sheetData)
      throw new Error("The selected sheet has no worksheet data.");
    let maxColumn = 0;
    const rows = new Map();
    for (const row of children(sheetData, "row")) {
      const number = Number(attr(row, "r"));
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > maxExcelRows ||
        rows.has(number)
      )
        throw new Error("The selected sheet has an unreadable row number.");
      if (rows.size >= 100000)
        throw new Error("Choose a worksheet with at most 100,000 rows.");
      const cells = new Map();
      for (const cell of children(row, "c")) {
        const column = columnNumber(attr(cell, "r"));
        if (column > maxExcelColumns)
          throw new Error("The selected sheet has an invalid column.");
        maxColumn = Math.max(maxColumn, column);
        cells.set(column, cellValue(cell, workbook.shared, workbook.masks));
      }
      rows.set(number, { node: row, cells });
    }
    return { doc, root, rows, maxColumn, path: sheet.path, name: sheet.name };
  }

  const aliases = {
    ndc: /^(?:(?:billing|package|product|drug|primary|11digit)ndc(?:11|11digit|code|number)?|ndc(?:11|11digit|code|number|10digit)?|nationaldrugcode(?:11digit)?)$/,
    hcpcs:
      /^(?:(?:old|current|existing|submitted|billing|cpt)hcpcs(?:code)?|hcpcs(?:code|billingcode|cpt)?|jcode|jcodes|chargehcpcs|billingcode)$/,
    description:
      /^(?:(?:drug|item|product|medication|formulary|charge|ndc)?description|(?:drug|item|product|medication|generic|brand|formulary)?name|medication|drug)$/,
  };
  const headerKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

  function headerFields(sheet, row) {
    const columns = [...(sheet.rows.get(row)?.cells || [])]
      .filter(([, entry]) => entry.value)
      .map(([index, entry]) => ({
        index,
        label: columnName(index) + " · " + entry.value,
      }));
    const guess = Object.fromEntries(
      Object.entries(aliases).map(([field, regex]) => {
        const choices = [...(sheet.rows.get(row)?.cells || [])].filter(
          ([, entry]) => regex.test(headerKey(entry.value)),
        );
        return [field, choices.length === 1 ? choices[0][0] : 0];
      }),
    );
    return { columns, guess };
  }

  function guessHeader(sheet) {
    // Check early populated rows for an NDC heading, preferring a row with all three fields.
    let best = { row: 1, score: 0 };
    for (const [row] of [...sheet.rows].slice(0, 50)) {
      const { guess } = headerFields(sheet, row);
      const score = guess.ndc
        ? 1 + Number(!!guess.hcpcs) + Number(!!guess.description)
        : 0;
      if (score > best.score) best = { row, score };
      if (score === 3) break;
    }
    return best;
  }

  function normalizeNdc(value) {
    if (/^\d{11}$/.test(value)) return value;
    if (!/^\d+-\d+-\d+$/.test(value)) return "";
    const parts = value.split("-");
    const format = parts.map((part) => part.length).join("-");
    if (!["4-4-2", "5-3-2", "5-4-1", "5-4-2"].includes(format)) return "";
    return parts
      .map((part, index) => part.padStart([5, 4, 2][index], "0"))
      .join("");
  }

  function makeIndex(db) {
    const rows =
      db.exec(
        "SELECT ndc, hcpcs, drug_name, mapping_origin FROM drugs ORDER BY ndc, hcpcs, drug_name",
      )[0]?.values || [];
    const index = new Map();
    for (const [ndc, code, description, origin] of rows) {
      if (!/^\d{11}$/.test(ndc) || !/^[A-Z][0-9]{4}$/.test(code)) continue;
      if (!index.has(ndc)) index.set(ndc, new Map());
      const candidates = index.get(ndc);
      if (!candidates.has(code)) candidates.set(code, {
        description,
        supplemental: origin === "supplemental",
      });
    }
    return index;
  }

  function writeTextCell(doc, row, column, addressRow, value) {
    const cell = doc.createElementNS(spreadsheetNs, "c");
    cell.setAttribute("r", columnName(column) + addressRow);
    cell.setAttribute("t", "inlineStr");
    const inline = doc.createElementNS(spreadsheetNs, "is");
    const t = doc.createElementNS(spreadsheetNs, "t");
    t.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve",
    );
    // Store audit output as literal text, even when a source name begins with "=".
    t.textContent = String(value ?? "").replace(
      /_x[\da-f]{4}_/gi,
      (match) => "_x005F_" + match.slice(1),
    );
    inline.append(t);
    cell.append(inline);
    row.removeAttribute("spans");
    row.append(cell);
  }

  function uniqueName(stem, names, max = Infinity) {
    for (let i = 1; i <= names.size + 1; i++) {
      const suffix = i === 1 ? "" : " (" + i + ")";
      const name = stem.slice(0, max - suffix.length) + suffix;
      if (!names.has(name.toLowerCase())) return name;
    }
  }

  function reviewDocument(reviews, sheetName, period) {
    const doc = document.implementation.createDocument(
      spreadsheetNs,
      "worksheet",
    );
    const root = doc.documentElement;
    const examples = [
      ["HCPCS Review", "CMS reference", period, "Source sheet", sheetName],
      [
        "Review status",
        "NDC",
        "Description",
        "Submitted HCPCS",
        "Current HCPCS (CMS)",
        "Candidate HCPCS",
        "Source row",
      ],
    ];
    if (!reviews.length) examples.push(["No rows need review"]);
    function element(name, attrs = {}) {
      const node = doc.createElementNS(spreadsheetNs, name);
      for (const [key, value] of Object.entries(attrs))
        node.setAttribute(key, String(value));
      return node;
    }
    const views = element("sheetViews");
    const view = element("sheetView", { workbookViewId: 0 });
    view.append(
      element("pane", {
        ySplit: 2,
        topLeftCell: "A3",
        activePane: "bottomLeft",
        state: "frozen",
      }),
    );
    views.append(view);
    const widths = element("cols");
    [30, 20, 48, 20, 22, 28, 13].forEach((width, index) => {
      widths.append(
        element("col", {
          min: index + 1,
          max: index + 1,
          width,
          customWidth: 1,
        }),
      );
    });
    const data = element("sheetData");
    for (const [index, values] of [...examples, ...reviews].entries()) {
      const row = element("row", { r: index + 1 });
      values.forEach((value, col) =>
        writeTextCell(doc, row, col + 1, index + 1, value),
      );
      data.append(row);
    }
    root.append(views, widths, data);
    if (reviews.length)
      root.append(
        element("autoFilter", { ref: "A2:G" + (reviews.length + 2) }),
      );
    return doc;
  }

  function appendReview(workbook, reviewName, review) {
    let file = "xl/worksheets/bprx-audit.xml";
    for (let i = 2; Object.hasOwn(workbook.parts, file); i++)
      file = "xl/worksheets/bprx-audit-" + i + ".xml";
    const usedIds = new Set(workbook.relations.map((node) => attr(node, "Id")));
    let i = 1;
    while (usedIds.has("rId" + i)) i++;
    const relationId = "rId" + i;
    const sheetId =
      Math.max(
        0,
        ...workbook.sheetNodes.map(
          (node) => Number(attr(node, "sheetId")) || 0,
        ),
      ) + 1;
    const book = workbook.book.cloneNode(true);
    const relsDoc = workbook.rels.cloneNode(true);
    const typesDoc = workbook.types.cloneNode(true);
    const sheet = book.createElementNS(spreadsheetNs, "sheet");
    sheet.setAttribute("name", reviewName);
    sheet.setAttribute("sheetId", sheetId);
    sheet.setAttributeNS(officeRelNs, "r:id", relationId);
    first(book.documentElement, "sheets").append(sheet);
    const rels = relsDoc.documentElement;
    const relation = relsDoc.createElementNS(rels.namespaceURI, "Relationship");
    relation.setAttribute("Id", relationId);
    relation.setAttribute("Type", officeRelNs + "/worksheet");
    relation.setAttribute("Target", file.slice(3));
    rels.append(relation);
    const types = typesDoc.documentElement;
    const override = typesDoc.createElementNS(types.namespaceURI, "Override");
    override.setAttribute("PartName", "/" + file);
    override.setAttribute("ContentType", worksheetType);
    types.append(override);
    return {
      file,
      xml: xml(review),
      book: xml(book),
      rels: xml(relsDoc),
      types: xml(typesDoc),
    };
  }

  function comparison(row, fields, index) {
    const ndcCell = row.cells.get(fields.ndc);
    const oldCell = row.cells.get(fields.hcpcs);
    const ndc = ndcCell?.value || "";
    const submitted = oldCell?.value || "";
    let description = row.cells.get(fields.description)?.value || "";
    if (
      !ndc &&
      !description &&
      !submitted &&
      !ndcCell?.formula &&
      !oldCell?.formula
    )
      return null;

    const normal = ndcCell?.formula ? "" : normalizeNdc(ndc);
    const matches = normal ? index.get(normal) : null;
    const entries = matches ? [...matches] : [];
    const hasSupplemental = entries.some(([, match]) => match.supplemental);
    const candidates = entries.map(([code, match]) =>
      hasSupplemental ? `${code} (${match.supplemental ? "supplemental" : "CMS"})` : code,
    );
    const current = !hasSupplemental && candidates.length === 1 ? candidates[0] : "";
    if (!description && matches)
      description = [...new Set(entries.map(([, match]) => match.description))]
        .filter(Boolean).join(" / ");

    let status = "";
    if (ndcCell?.formula) status = "Verify formula-based NDC";
    else if (!ndc) status = "NDC missing";
    else if (!normal)
      status = /^\d{10}$/.test(ndc)
        ? "Ambiguous 10-digit NDC"
        : "Invalid NDC format";
    else if (!candidates.length) status = "No CMS crosswalk listing";
    else if (hasSupplemental) status = "Verify insulin administration and HCPCS";
    else if (candidates.length > 1) status = "Multiple CMS codes";
    else if (oldCell?.formula) status = "Verify formula-based HCPCS";
    else if (!submitted) status = "Submitted HCPCS missing";
    else if (!/^[A-Z0-9][0-9]{4}$/i.test(submitted))
      status = "Check submitted HCPCS format";
    else if (current !== submitted.toUpperCase()) status = "Code differs";
    return { ndc, description, submitted, current, candidates, status };
  }

  function audit(workbook, sheet, fields, index, manifest) {
    const { header, ndc, hcpcs, description } = fields;
    const headerRow = sheet.rows.get(header);
    if (
      !headerRow ||
      !ndc ||
      new Set([ndc, hcpcs, description].filter(Boolean)).size !==
        [ndc, hcpcs, description].filter(Boolean).length
    )
      throw new Error(
        "Choose an NDC column and separate columns for any submitted code and description.",
      );
    const dimension = first(sheet.root, "dimension");
    const ref = attr(dimension || sheet.root, "ref");
    const endRef = ref.split(":").at(-1);
    const dimensionWidth = /^[A-Z]{1,3}[1-9]\d*$/.test(endRef)
      ? columnNumber(endRef)
      : 0;
    const column = Math.max(sheet.maxColumn, dimensionWidth) + 1;
    if (column > maxExcelColumns)
      throw new Error(
        "There is no spare column in this sheet. Remove unused columns and try again.",
      );
    const existingHeaders = new Set(
      [...headerRow.cells.values()].map((entry) => entry.value.toLowerCase()),
    );
    const heading = uniqueName("Current HCPCS (CMS)", existingHeaders);
    const reviewName = uniqueName(
      "HCPCS Review",
      new Set(
        workbook.sheetNodes.map((node) => attr(node, "name").toLowerCase()),
      ),
      31,
    );
    const reviews = [];
    const counts = { total: 0, matched: 0, different: 0, review: 0 };

    let cols = first(sheet.root, "cols");
    if (!cols) {
      cols = sheet.doc.createElementNS(spreadsheetNs, "cols");
      first(sheet.root, "sheetData").before(cols);
    }
    if (
      !children(cols, "col").some(
        (node) =>
          Number(attr(node, "min")) <= column &&
          Number(attr(node, "max")) >= column,
      )
    ) {
      const col = sheet.doc.createElementNS(spreadsheetNs, "col");
      col.setAttribute("min", column);
      col.setAttribute("max", column);
      col.setAttribute("width", "23");
      col.setAttribute("customWidth", "1");
      const nextCol = children(cols, "col").find(
        (node) => Number(attr(node, "min")) > column,
      );
      cols.insertBefore(col, nextCol || null);
    }
    writeTextCell(sheet.doc, headerRow.node, column, header, heading);
    let lastRow = header;
    for (const [number, row] of sheet.rows) {
      if (number <= header) continue;
      const result = comparison(row, fields, index);
      if (!result) continue;
      counts.total++;
      if (result.current)
        writeTextCell(sheet.doc, row.node, column, number, result.current);
      if (!result.status) counts.matched++;
      else {
        if (result.status === "Code differs") counts.different++;
        else counts.review++;
        reviews.push([
          result.status,
          result.ndc,
          result.description,
          result.submitted,
          result.current,
          result.candidates.length > 1 || (!result.current && result.candidates.length)
            ? result.candidates.join(", ")
            : "",
          number,
        ]);
      }
      lastRow = Math.max(lastRow, number);
    }
    if (!counts.total)
      throw new Error(
        "No formulary rows were found below the selected header.",
      );
    if (dimension && endRef) {
      const firstRef = ref.split(":")[0];
      const endRow = Number(endRef.match(/\d+$/)?.[0]) || 0;
      dimension.setAttribute(
        "ref",
        firstRef + ":" + columnName(column) + Math.max(lastRow, endRow),
      );
    }
    const period = [
      manifest.quarter,
      manifest.quarter_start,
      manifest.quarter_end,
    ]
      .filter(Boolean)
      .join(" · ");
    const review = appendReview(
      workbook,
      reviewName,
      reviewDocument(reviews, sheet.name, period),
    );
    const encode = (value) => new TextEncoder().encode(value);
    const output = Object.assign(Object.create(null), workbook.parts, {
      [sheet.path]: encode(xml(sheet.doc)),
      [workbookPath]: encode(review.book),
      [relsPath]: encode(review.rels),
      [typesPath]: encode(review.types),
      [review.file]: encode(review.xml),
    });
    return {
      bytes: fflate.zipSync(output, { level: 3 }),
      counts,
      reviewName,
      heading,
    };
  }

  globalThis.FormularyAudit = {
    maxFileSize,
    openWorkbook,
    readSheet,
    guessHeader,
    headerFields,
    makeIndex,
    audit,
  };
})();
