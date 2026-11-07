import { createSign, createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TP-43: Expo Updates expects `expo-signature` structured fields when the
 * client sends `expo-expect-signature`. Sign the raw manifest JSON bytes.
 */
export function signExpoManifestBody(
  body: Buffer | string,
  privateKeyPem: string,
  keyId = 'main',
): string {
  const key = createPrivateKey(privateKeyPem);
  const sign = createSign('RSA-SHA256');
  sign.update(body);
  sign.end();
  const sig = sign.sign(key).toString('base64');
  return `sig="${sig}", keyid="${keyId}", alg="rsa-v1_5-sha256"`;
}

export function loadOtaPrivateKeyPem(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const inline = env.OTA_CODE_SIGNING_PRIVATE_KEY?.trim();
  if (inline) {
    if (inline.includes('BEGIN')) return inline.replace(/\\n/g, '\n');
    if (existsSync(inline)) return readFileSync(inline, 'utf8');
  }
  const configured = env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH?.trim();
  const candidates = [
    configured,
    join(cwd, 'ota', 'private-key.pem'),
    join(cwd, 'apps', 'api', 'ota', 'private-key.pem'),
  ].filter((path): path is string => Boolean(path));
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}

export function clientExpectsExpoSignature(
  expectHeader: string | string[] | undefined,
): boolean {
  if (!expectHeader) return false;
  const value = Array.isArray(expectHeader)
    ? expectHeader.join(',')
    : expectHeader;
  return value.trim().length > 0;
}
