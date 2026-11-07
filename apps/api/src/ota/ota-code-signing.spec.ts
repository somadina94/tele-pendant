import {
  createPrivateKey,
  createPublicKey,
  createVerify,
  generateKeyPairSync,
} from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clientExpectsExpoSignature,
  loadOtaPrivateKeyPem,
  signExpoManifestBody,
} from './ota-code-signing';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('ota-code-signing (TP-43)', () => {
  it('signs manifest bytes that verify with the matching public key', () => {
    const body = Buffer.from('{"runtimeVersion":"0.0.1"}');
    const header = signExpoManifestBody(body, privateKey);
    expect(header).toMatch(/^sig="/);
    expect(header).toContain('keyid="main"');
    expect(header).toContain('alg="rsa-v1_5-sha256"');

    const sig = header.match(/sig="([^"]+)"/)?.[1];
    expect(sig).toBeTruthy();
    const verify = createVerify('RSA-SHA256');
    verify.update(body);
    verify.end();
    expect(
      verify.verify(createPublicKey(publicKey), Buffer.from(sig!, 'base64')),
    ).toBe(true);
    expect(() => createPrivateKey(privateKey)).not.toThrow();
  });

  it('loads private key from env PEM, path, or ota/private-key.pem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tp-ota-'));
    const keyPath = join(dir, 'key.pem');
    writeFileSync(keyPath, privateKey);

    expect(
      loadOtaPrivateKeyPem({ OTA_CODE_SIGNING_PRIVATE_KEY: privateKey }, dir),
    ).toContain('BEGIN');
    expect(
      loadOtaPrivateKeyPem(
        {
          OTA_CODE_SIGNING_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
        },
        dir,
      ),
    ).toContain('BEGIN PRIVATE KEY');
    expect(
      loadOtaPrivateKeyPem(
        { OTA_CODE_SIGNING_PRIVATE_KEY: keyPath },
        '/nonexistent',
      ),
    ).toContain('BEGIN');
    expect(
      loadOtaPrivateKeyPem(
        { OTA_CODE_SIGNING_PRIVATE_KEY: join(dir, 'missing.pem') },
        dir,
      ),
    ).toBeNull();
    expect(
      loadOtaPrivateKeyPem(
        { OTA_CODE_SIGNING_PRIVATE_KEY_PATH: keyPath },
        '/nonexistent',
      ),
    ).toContain('BEGIN');

    const otaDir = join(dir, 'ota');
    mkdirSync(otaDir, { recursive: true });
    writeFileSync(join(otaDir, 'private-key.pem'), privateKey);
    expect(loadOtaPrivateKeyPem({}, dir)).toContain('BEGIN');
    expect(loadOtaPrivateKeyPem({}, join(dir, 'missing'))).toBeNull();

    const prev = process.env.OTA_CODE_SIGNING_PRIVATE_KEY;
    const prevPath = process.env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH;
    const prevCwd = process.cwd();
    try {
      delete process.env.OTA_CODE_SIGNING_PRIVATE_KEY;
      delete process.env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH;
      process.chdir(dir);
      expect(loadOtaPrivateKeyPem()).toContain('BEGIN');
    } finally {
      process.chdir(prevCwd);
      if (prev === undefined) delete process.env.OTA_CODE_SIGNING_PRIVATE_KEY;
      else process.env.OTA_CODE_SIGNING_PRIVATE_KEY = prev;
      if (prevPath === undefined)
        delete process.env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH;
      else process.env.OTA_CODE_SIGNING_PRIVATE_KEY_PATH = prevPath;
    }
  });

  it('detects expo-expect-signature headers', () => {
    expect(clientExpectsExpoSignature(undefined)).toBe(false);
    expect(clientExpectsExpoSignature('')).toBe(false);
    expect(clientExpectsExpoSignature('sig, keyid="main"')).toBe(true);
    expect(clientExpectsExpoSignature(['sig'])).toBe(true);
  });
});
