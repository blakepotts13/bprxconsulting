(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("audit-form");
  const fileInput = $("audit-file");
  const sheets = $("sheet-select");
  const header = $("header-row");
  const run = $("run-audit");
  const fields = {
    ndc: $("ndc-column"),
    hcpcs: $("hcpcs-column"),
    description: $("description-column"),
  };
  const columnControls = [sheets, header, ...Object.values(fields)];
  let reference;
  let workbook;
  let sheet;
  let fileName = "";
  let downloadUrl;
  let uploadGeneration = 0;

  function error(message = "") {
    $("audit-error").textContent = message;
    $("audit-error").hidden = !message;
  }

  function clearResult() {
    $("audit-results").hidden = true;
    $("audit-download").removeAttribute("href");
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }

  function setFileStatus(message = "") {
    $("file-status").textContent = message;
    $("file-status").hidden = !message;
  }

  function loadFields() {
    const number = Number(header.value);
    const { columns, guess } = FormularyAudit.headerFields(sheet, number);
    const empty = {
      ndc: "Choose the NDC column",
      hcpcs: "No submitted HCPCS column",
      description: "Use CMS description when available",
    };
    for (const [name, select] of Object.entries(fields)) {
      select.replaceChildren(
        new Option(empty[name], ""),
        ...columns.map((col) => new Option(col.label, col.index)),
      );
      select.value = String(guess[name] || "");
    }
    run.disabled = !reference || !columns.length;
  }

  function loadSheet(index, prepared) {
    sheet =
      prepared || FormularyAudit.readSheet(workbook, workbook.sheets[index]);
    header.value = String(FormularyAudit.guessHeader(sheet).row);
    loadFields();
  }

  fileInput.addEventListener("change", async () => {
    const generation = ++uploadGeneration;
    const file = fileInput.files?.[0];
    columnControls.forEach((control) => { control.disabled = false; });
    run.textContent = "Run audit";
    clearResult();
    error();
    workbook = null;
    sheet = null;
    $("audit-fields").hidden = true;
    setFileStatus();
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > FormularyAudit.maxFileSize) {
      error("Choose a standard .xlsx workbook up to 15 MB.");
      return;
    }
    setFileStatus("Reading workbook…");
    try {
      const selectedBytes = new Uint8Array(await file.arrayBuffer());
      if (generation !== uploadGeneration) return;
      workbook = FormularyAudit.openWorkbook(selectedBytes);
      sheets.replaceChildren(
        ...workbook.sheets.map(
          (entry, index) =>
            new Option(entry.name + (entry.hidden ? " (hidden)" : ""), index),
        ),
      );
      const visible = workbook.sheets
        .map((entry, index) => (entry.hidden ? -1 : index))
        .filter((index) => index >= 0);
      let selected = visible[0] ?? 0;
      let prepared;
      for (const index of visible.slice(0, 5)) {
        const candidate = FormularyAudit.readSheet(
          workbook,
          workbook.sheets[index],
        );
        if (!prepared) prepared = candidate;
        if (FormularyAudit.guessHeader(candidate).score > 0) {
          selected = index;
          prepared = candidate;
          break;
        }
      }
      sheets.value = String(selected);
      loadSheet(selected, prepared);
      fileName = file.name.slice(0, -5);
      $("audit-fields").hidden = false;
      setFileStatus(
        "Workbook ready. Confirm the worksheet, header row, and columns below.",
      );
    } catch (failure) {
      error(failure.message || "The Excel workbook could not be opened.");
      setFileStatus();
    }
  });

  sheets.addEventListener("change", () => {
    clearResult();
    error();
    try {
      loadSheet(Number(sheets.value));
    } catch (failure) {
      run.disabled = true;
      error(failure.message || "This worksheet could not be opened.");
    }
  });
  header.addEventListener("change", () => {
    clearResult();
    error();
    if (sheet) loadFields();
  });
  Object.values(fields).forEach((select) =>
    select.addEventListener("change", () => {
      clearResult();
      error();
    }),
  );

  async function lookupMissingPackages(ndcs, generation) {
    const results = new Map();
    for (let offset = 0; offset < ndcs.length && uploadGeneration === generation; offset += 3) {
      const batch = ndcs.slice(offset, offset + 3);
      setFileStatus(`Checking missing NDCs in DailyMed (${offset + 1}–${offset + batch.length} of ${ndcs.length})…`);
      const [found] = await Promise.all([
        Promise.all(batch.map((ndc) => FormularyData.lookupDailymed(ndc))),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      batch.forEach((ndc, i) => results.set(ndc, found[i]));
    }
    return results;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!workbook || !reference || run.disabled) return;
    clearResult();
    error();
    const selection = {
      header: Number(header.value),
      ndc: Number(fields.ndc.value),
      hcpcs: Number(fields.hcpcs.value),
      description: Number(fields.description.value),
    };
    const selected = Number(sheets.value);
    const filename = fileName;
    const generation = uploadGeneration;
    run.disabled = true;
    columnControls.forEach((control) => { control.disabled = true; });
    run.textContent = "Checking formulary…";
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (uploadGeneration !== generation) return;
      const freshSheet = FormularyAudit.readSheet(
        workbook,
        workbook.sheets[selected],
      );
      const missing = FormularyAudit.missingNdcs(freshSheet, selection, reference.index);
      const dailyMed = await lookupMissingPackages(missing, generation);
      if (uploadGeneration !== generation) return;
      const {
        bytes: result,
        counts,
        reviewName,
        heading,
        fallbackHeading,
      } = FormularyAudit.audit(
        workbook,
        freshSheet,
        selection,
        reference.index,
        reference.manifest,
        dailyMed,
      );
      downloadUrl = URL.createObjectURL(
        new Blob([result], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      $("audit-download").href = downloadUrl;
      $("audit-download").download = filename + "-hcpcs-review.xlsx";
      for (const [id, value] of [
        ["audit-total", counts.total],
        ["audit-match", counts.matched],
        ["audit-different", counts.different],
        ["audit-review", counts.review],
      ]) {
        $(id).textContent = new Intl.NumberFormat("en-US").format(value);
      }
      $("audit-result-summary").textContent =
        `The workbook adds “${heading}”${fallbackHeading ? ` and “${fallbackHeading}”` : ""} to ${freshSheet.name} and lists differences and exceptions on “${reviewName}”.`;
      $("audit-results").hidden = false;
      $("audit-download").focus();
    } catch (failure) {
      error(failure.message || "The reviewed workbook could not be created.");
    } finally {
      if (uploadGeneration === generation) {
        setFileStatus();
        run.textContent = "Run audit";
        columnControls.forEach((control) => { control.disabled = false; });
        run.disabled = false;
      }
    }
  });

  async function loadReference() {
    try {
      const [SQL, manifest] = await Promise.all([
        initSqlJs({ locateFile: (file) => "vendor/" + file }),
        fetch("manifest.json", {
          cache: "no-store",
          credentials: "same-origin",
        }).then((response) => {
          if (!response.ok)
            throw new Error(
              "Sign in with an approved account to load the CMS reference.",
            );
          return response.json();
        }),
      ]);
      const db = await FormularyData.openDatabase(SQL, manifest);
      try {
        reference = { index: FormularyAudit.makeIndex(db), manifest };
      } finally {
        db.close();
      }
      $("audit-period").textContent =
        `CMS reference · ${manifest.quarter} (${manifest.quarter_start} to ${manifest.quarter_end})`;
      fileInput.disabled = false;
    } catch (failure) {
      $("audit-period").textContent = "CMS reference unavailable";
      error(failure.message || "Reload the page to try again.");
    }
  }

  loadReference();
})();
