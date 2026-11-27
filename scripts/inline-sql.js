// Convierte los archivos .sql a .ts que exportan el contenido como string.
// Esto evita los problemas con Asset.fromModule, ?raw imports, y Metro
// assetExts/sourceExts. Los .ts generados se commitean y se importan
// directamente desde db.ts.
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const files = [
  ["src/modules/persistence/schema.sql", "src/modules/persistence/schema.ts"],
  ["src/modules/persistence/schema_phase3.sql", "src/modules/persistence/schema_phase3.ts"]
];

for (const [src, dst] of files) {
  const srcPath = path.join(ROOT, src);
  const dstPath = path.join(ROOT, dst);
  const content = fs.readFileSync(srcPath, "utf8");
  // Escapa backticks y ${ en el contenido SQL para que sea válido dentro de
  // un template literal de TS/JS.
  const escaped = content
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  const ts =
    "// AUTO-GENERADO por scripts/inline-sql.js. NO EDITAR A MANO.\n" +
    "// Re-generar con: node scripts/inline-sql.js\n" +
    "// Origen: " + src + "\n" +
    "export default `" + escaped + "`;\n";
  fs.writeFileSync(dstPath, ts, "utf8");
  console.log("[inline-sql] " + dstPath + " generado (" + content.length + " chars)");
}
