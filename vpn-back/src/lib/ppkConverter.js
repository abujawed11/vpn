import { convertPPK } from "ppk-to-openssh";

/**
 * Detects if the key content is in PPK format
 * @param {string} keyContent - The SSH key content
 * @returns {boolean} - True if it's a PPK file
 */
export function isPPKFormat(keyContent) {
  return keyContent.includes("PuTTY-User-Key-File");
}

/**
 * Converts a PPK key to OpenSSH format using ppk-to-openssh package
 * @param {string} ppkContent - The PPK key content
 * @param {string} passphrase - Optional passphrase for encrypted PPK
 * @returns {Promise<string>} - OpenSSH format private key
 */
export async function convertPPKToOpenSSH(ppkContent, passphrase = "") {
  try {
    const result = await convertPPK(ppkContent, passphrase);
    return result.privateKey;
  } catch (error) {
    throw new Error(`PPK conversion failed: ${error.message}`);
  }
}

/**
 * Processes an SSH key - converts from PPK if needed
 * @param {string} keyContent - The SSH key content (PPK or OpenSSH)
 * @param {string} passphrase - Optional passphrase
 * @returns {Promise<string>} - OpenSSH format private key
 */
export async function processSSHKey(keyContent, passphrase = "") {
  if (isPPKFormat(keyContent)) {
    console.log("PPK format detected, converting to OpenSSH...");
    return await convertPPKToOpenSSH(keyContent, passphrase);
  }

  // Already in OpenSSH format
  return keyContent;
}
