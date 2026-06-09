/**
 * IIA — Analyzer Module
 * Extracts EXIF, IPTC, XMP metadata using exifr (CDN)
 * Also extracts basic file info and GPS data
 */

async function analyzeMetadata(file) {
  const result = {
    exif: null,
    iptc: null,
    xmp: null,
    gps: null,
    fileInfo: null,
    error: null,
  };

  // File info (always available)
  result.fileInfo = {
    name: file.name,
    size: formatBytes(file.size),
    sizeRaw: file.size,
    type: file.type || 'Desconocido',
    lastModified: file.lastModified
      ? new Date(file.lastModified).toLocaleString('es-PE')
      : null,
  };

  try {
    // exifr parses all segments together
    const data = await window.exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: false,
      jfif: false,
      ihdr: false,
      mergeOutput: false,
    });

    if (!data) {
      result.error = 'No se encontraron metadatos en esta imagen.';
      return result;
    }

    // ── EXIF / TIFF ──
    const exifRaw = { ...(data.tiff || {}), ...(data.exif || {}) };
    if (Object.keys(exifRaw).length > 0) {
      result.exif = sanitizeObject({
        'Fabricante':         exifRaw.Make,
        'Modelo':             exifRaw.Model,
        'Software':           exifRaw.Software,
        'Fecha de captura':   formatExifDate(exifRaw.DateTimeOriginal || exifRaw.DateTime),
        'Fecha de modificación': formatExifDate(exifRaw.DateTime),
        'Resolución X':       exifRaw.XResolution ? `${exifRaw.XResolution} dpi` : null,
        'Resolución Y':       exifRaw.YResolution ? `${exifRaw.YResolution} dpi` : null,
        'Ancho (px)':         exifRaw.ImageWidth || exifRaw.ExifImageWidth,
        'Alto (px)':          exifRaw.ImageLength || exifRaw.ExifImageHeight,
        'Orientación':        formatOrientation(exifRaw.Orientation),
        'Espacio de color':   formatColorSpace(exifRaw.ColorSpace),
        'Exposición':         exifRaw.ExposureTime ? `${exifRaw.ExposureTime}s` : null,
        'Apertura (f/)':      exifRaw.FNumber ? `f/${exifRaw.FNumber}` : null,
        'ISO':                exifRaw.ISO,
        'Distancia focal':    exifRaw.FocalLength ? `${exifRaw.FocalLength}mm` : null,
        'Flash':              formatFlash(exifRaw.Flash),
        'Balance de blancos': formatWhiteBalance(exifRaw.WhiteBalance),
        'Modo de exposición': exifRaw.ExposureMode,
        'Modo de medición':   exifRaw.MeteringMode,
        'Compresión':         exifRaw.Compression,
        'Subversión EXIF':    exifRaw.ExifVersion ? String.fromCharCode(...exifRaw.ExifVersion) : null,
      });
    }

    // ── GPS ──
    if (data.gps && (data.gps.latitude !== undefined || data.gps.GPSLatitude)) {
      const lat = data.gps.latitude ?? convertDMS(data.gps.GPSLatitude, data.gps.GPSLatitudeRef);
      const lon = data.gps.longitude ?? convertDMS(data.gps.GPSLongitude, data.gps.GPSLongitudeRef);
      if (lat !== null && lon !== null) {
        result.gps = {
          latitude:  lat.toFixed(7),
          longitude: lon.toFixed(7),
          altitude:  data.gps.GPSAltitude ? `${data.gps.GPSAltitude.toFixed(1)}m` : null,
          speed:     data.gps.GPSSpeed ? `${data.gps.GPSSpeed} km/h` : null,
          mapsUrl:   `https://www.google.com/maps?q=${lat.toFixed(7)},${lon.toFixed(7)}`,
        };
      }
    }

    // ── IPTC ──
    if (data.iptc && Object.keys(data.iptc).length > 0) {
      result.iptc = sanitizeObject({
        'Titular':          data.iptc.Headline,
        'Título':           data.iptc.ObjectName,
        'Descripción':      data.iptc.Caption,
        'Palabras clave':   Array.isArray(data.iptc.Keywords)
                              ? data.iptc.Keywords.join(', ')
                              : data.iptc.Keywords,
        'Autor':            data.iptc.By_line || data.iptc.ByLine,
        'Crédito':          data.iptc.Credit,
        'Copyright':        data.iptc.CopyrightNotice,
        'Fuente':           data.iptc.Source,
        'Ciudad':           data.iptc.City,
        'País':             data.iptc.Country_PrimaryLocationName || data.iptc.CountryName,
        'Fecha de creación':data.iptc.DateCreated,
        'Categoría':        data.iptc.Category,
        'Urgencia':         data.iptc.Urgency,
      });
    }

    // ── XMP ──
    if (data.xmp && Object.keys(data.xmp).length > 0) {
      result.xmp = sanitizeObject({
        'Software creador': data.xmp.CreatorTool,
        'Autor (XMP)':      data.xmp.creator || data.xmp.Creator,
        'Descripción (XMP)':data.xmp.description || data.xmp.Description,
        'Título (XMP)':     data.xmp.title || data.xmp.Title,
        'Fecha de creación':data.xmp.CreateDate ? formatExifDate(data.xmp.CreateDate) : null,
        'Fecha de modif.':  data.xmp.ModifyDate  ? formatExifDate(data.xmp.ModifyDate)  : null,
        'Derechos':         data.xmp.Rights || data.xmp.rights,
        'Rating':           data.xmp.Rating,
        'Perfil de color':  data.xmp.ICCProfileName,
        'Historial (pasos)':Array.isArray(data.xmp.History)
                              ? `${data.xmp.History.length} operaciones registradas`
                              : null,
      });
    }

  } catch (err) {
    console.warn('[IIA] Metadata parse error:', err);
    result.error = `Error al parsear metadatos: ${err.message}`;
  }

  return result;
}

// ── Helpers ──

function sanitizeObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '' && v !== 'Unknown') {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatExifDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toLocaleString('es-PE');
  if (typeof val === 'string') {
    // EXIF format: "2023:11:15 14:32:00"
    const cleaned = val.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? val : d.toLocaleString('es-PE');
  }
  return null;
}

function formatOrientation(val) {
  const map = {
    1: 'Normal (0°)',
    3: 'Rotada 180°',
    6: 'Rotada 90° CW',
    8: 'Rotada 90° CCW',
  };
  return val != null ? (map[val] || `Código ${val}`) : null;
}

function formatColorSpace(val) {
  if (val === 1) return 'sRGB';
  if (val === 65535) return 'Uncalibrated';
  return val != null ? String(val) : null;
}

function formatFlash(val) {
  if (val == null) return null;
  return (val & 1) ? 'Disparado' : 'No disparado';
}

function formatWhiteBalance(val) {
  if (val === 0) return 'Automático';
  if (val === 1) return 'Manual';
  return val != null ? String(val) : null;
}

function convertDMS(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return (ref === 'S' || ref === 'W') ? -decimal : decimal;
}

export { analyzeMetadata };
