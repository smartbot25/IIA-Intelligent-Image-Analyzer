/**
 * IIA — Report Module
 * Generates an intelligent summary of all findings
 */

function generateReport(metadata, hashes, ocrText) {
  const findings = [];
  const missing  = [];
  let fieldsFound = 0;

  // ── File info ──
  if (metadata.fileInfo) {
    findings.push(`Archivo: <strong>${metadata.fileInfo.name}</strong> (${metadata.fileInfo.type}, ${metadata.fileInfo.size})`);
  }

  // ── EXIF ──
  if (metadata.exif) {
    const keys = Object.keys(metadata.exif);
    fieldsFound += keys.length;

    const device = metadata.exif['Fabricante'] || metadata.exif['Modelo'];
    const date   = metadata.exif['Fecha de captura'];
    const sw     = metadata.exif['Software'];

    if (device) findings.push(`Dispositivo de captura identificado: <strong>${[metadata.exif['Fabricante'], metadata.exif['Modelo']].filter(Boolean).join(' ')}</strong>`);
    if (date)   findings.push(`Fecha de captura registrada: <strong>${date}</strong>`);
    if (sw)     findings.push(`Software de procesamiento: <strong>${sw}</strong>`);
    if (metadata.exif['ISO']) findings.push(`Parámetros de cámara encontrados (ISO, apertura, exposición)`);
  } else {
    missing.push('Metadatos EXIF (no presentes o eliminados)');
  }

  // ── GPS ──
  if (metadata.gps) {
    fieldsFound += 2;
    findings.push(`Coordenadas GPS detectadas: <strong>${metadata.gps.latitude}, ${metadata.gps.longitude}</strong>`);
    if (metadata.gps.altitude) findings.push(`Altitud registrada: <strong>${metadata.gps.altitude}</strong>`);
  } else {
    missing.push('Datos de geolocalización GPS');
  }

  // ── IPTC ──
  if (metadata.iptc) {
    const keys = Object.keys(metadata.iptc);
    fieldsFound += keys.length;
    findings.push(`Metadatos IPTC encontrados (${keys.length} campos): ${keys.slice(0,3).join(', ')}${keys.length > 3 ? '...' : ''}`);
  } else {
    missing.push('Metadatos IPTC');
  }

  // ── XMP ──
  if (metadata.xmp) {
    const keys = Object.keys(metadata.xmp);
    fieldsFound += keys.length;
    findings.push(`Datos XMP presentes (${keys.length} campos)`);
    if (metadata.xmp['Historial (pasos)']) findings.push(`Historial de edición detectado: <strong>${metadata.xmp['Historial (pasos)']}</strong>`);
  } else {
    missing.push('Metadatos XMP');
  }

  // ── Hashes ──
  if (hashes) {
    findings.push('Huellas digitales generadas: MD5, SHA-1, SHA-256');
    fieldsFound += 3;
  }

  // ── OCR ──
  const ocrTrimmed = (ocrText || '').trim();
  if (ocrTrimmed.length > 10) {
    const wordCount = ocrTrimmed.split(/\s+/).length;
    findings.push(`Texto reconocido en la imagen: <strong>~${wordCount} palabras</strong>`);
    fieldsFound += 1;
  } else {
    missing.push('Texto visible (no detectado o imagen sin texto)');
  }

  // ── Build summary text ──
  let summaryText = '';

  if (findings.length > 0 && missing.length === 0) {
    summaryText = 'Análisis completo. Se encontraron datos en todos los bloques evaluados. La imagen contiene metadatos ricos que pueden ser útiles para verificación, investigación o análisis forense.';
  } else if (findings.length > 0 && missing.length > 0) {
    summaryText = `Análisis parcial. Se encontraron datos en ${findings.length} hallazgos. Algunos bloques no contienen información (posiblemente eliminada o nunca registrada). Esto es común en imágenes exportadas desde redes sociales.`;
  } else {
    summaryText = 'La imagen no contiene metadatos identificables. Puede haberse procesado con herramientas que eliminan esta información, o provenir de una fuente que no la registra.';
  }

  return {
    summary: summaryText,
    findings,
    missing,
    fieldsFound,
    sectionsFound: [
      metadata.exif  ? 'EXIF'  : null,
      metadata.gps   ? 'GPS'   : null,
      metadata.iptc  ? 'IPTC'  : null,
      metadata.xmp   ? 'XMP'   : null,
      hashes         ? 'Hashes': null,
      ocrTrimmed.length > 10 ? 'OCR' : null,
    ].filter(Boolean),
  };
}

export { generateReport };
