/**
 * A one-page sample contract, built by hand so the demo needs no file to start
 * with. Offsets in the xref table are computed, so the PDF is well-formed and
 * signable.
 */
export function samplePdf(title = "Contrato de prueba") {
  const esc = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  const lines = [
    [72, 760, 20, title],
    [72, 720, 12, "Documento de prueba generado por firmaya-connect-demo."],
    [72, 700, 12, `Fecha: ${new Date().toISOString().slice(0, 10)}`],
    [72, 660, 12, "Las partes aceptan las condiciones de esta prueba de integracion."],
    [72, 640, 12, "Firmado en el ambiente de staging: sin validez legal."],
  ];
  const stream = lines
    .map(([x, y, size, text]) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
