/**
 * IIA — Hasher Module
 * Generates MD5 (via SparkMD5), SHA-1, SHA-256 using Web Crypto API
 */

// SparkMD5 is loaded via CDN as window.SparkMD5
async function hashFile(arrayBuffer) {
  const hashes = {};

  // MD5 via SparkMD5
  try {
    const spark = new SparkMD5.ArrayBuffer();
    spark.append(arrayBuffer);
    hashes.md5 = spark.end();
  } catch (e) {
    hashes.md5 = null;
  }

  // SHA-1 via Web Crypto
  try {
    const sha1Buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
    hashes.sha1 = bufferToHex(sha1Buffer);
  } catch (e) {
    hashes.sha1 = null;
  }

  // SHA-256 via Web Crypto
  try {
    const sha256Buffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    hashes.sha256 = bufferToHex(sha256Buffer);
  } catch (e) {
    hashes.sha256 = null;
  }

  return hashes;
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export { hashFile };
