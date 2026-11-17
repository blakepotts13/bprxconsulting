/* The browser only assembles data received from authenticated, same-origin routes. */
(() => {
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
  globalThis.FormularyData = { loadDatabase };
})();
