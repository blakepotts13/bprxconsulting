/* The browser only assembles data received from authenticated, same-origin routes. */
(() => {
  const SUPPLEMENTAL_SOURCE = "Supplied J1815 reference, November 19, 2026";
  const FDA_DIRECTORY = "https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory";
  const supplementalSql = "ALTER TABLE drugs ADD COLUMN mapping_origin TEXT NOT NULL DEFAULT 'cms'";
  const addSupplemental = `
    INSERT INTO drugs (ndc, ndc_display, drug_name, description, hcpcs, dosage,
      labeler, package_size, package_qty, units_item, units_ndc, si, source, mapping_origin)
    SELECT ?, ?, ?, 'Injection, insulin, per 5 units', 'J1815', '5 insulin units',
      ?, ?, ?, ?, ?, 'N', ?, 'supplemental'
    WHERE NOT EXISTS(SELECT 1 FROM drugs WHERE ndc=? AND hcpcs='J1815')
  `;
  async function digest(bytes) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function loadDatabase(manifest, fetchData = fetch) {
    if (!Array.isArray(manifest.database_chunks) || !manifest.database_chunks.length || !Number.isSafeInteger(manifest.database_bytes)) throw new Error("Invalid database manifest");
    const pieces = await Promise.all(manifest.database_chunks.map(async (chunk) => {
      if (!/^database-\d{2}\.bin$/.test(chunk.file) || !Number.isSafeInteger(chunk.bytes) || chunk.bytes > 2 * 1024 * 1024) throw new Error("Invalid database chunk");
      const response = await fetchData(chunk.file, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign in with an approved account to load the reference data.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== chunk.bytes || await digest(bytes) !== chunk.sha256) throw new Error("Database download verification failed. Reload to retry.");
      return bytes;
    }));
    if (pieces.reduce((total, piece) => total + piece.byteLength, 0) !== manifest.database_bytes) throw new Error("Incomplete database download");
    const merged = new Uint8Array(manifest.database_bytes);
    let offset = 0;
    for (const piece of pieces) { merged.set(piece, offset); offset += piece.byteLength; }
    if (await digest(merged) !== manifest.database_sha256) throw new Error("Database verification failed. Reload to retry.");
    return merged;
  }
  async function openDatabase(SQL, manifest, fetchData = fetch) {
    const [bytes, packages] = await Promise.all([
      loadDatabase(manifest, fetchData),
      fetchData("j1815-packages.json", { cache: "no-store", credentials: "same-origin" }).then((response) => {
        if (!response.ok) throw new Error("Could not load supplemental mappings. Reload to retry.");
        return response.json();
      }),
    ]);
    if (!Array.isArray(packages)) throw new Error("Invalid supplemental mapping list.");

    const db = new SQL.Database(bytes);
    try {
      db.run(supplementalSql);
      for (const [ndc, name, labeler, volume, quantity, strength, evidence] of packages) {
        if (!/^\d{5}-\d{4}-\d{2}$/.test(ndc) || !name || !labeler)
          throw new Error("Invalid supplemental package.");
        const normalized = ndc.replaceAll("-", "");
        const verified = [volume, quantity, strength].every((value) => Number.isFinite(value) && value > 0);
        const units = verified ? volume * strength / 5 : null;
        const source = verified ? [SUPPLEMENTAL_SOURCE, evidence] : [SUPPLEMENTAL_SOURCE];
        db.run(addSupplemental, [
          normalized, ndc, name, labeler, verified ? `${volume} mL` : null,
          verified ? String(quantity) : null, units, verified ? units * quantity : null,
          JSON.stringify(source), normalized,
        ]);
      }
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  globalThis.FormularyData = { loadDatabase, openDatabase, FDA_DIRECTORY };
})();
