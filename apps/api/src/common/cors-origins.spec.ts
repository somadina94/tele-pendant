import {
  corsAllowedOrigins,
  corsOriginDelegate,
  isCorsOriginAllowed,
} from './cors-origins';

describe('cors-origins (TP-44)', () => {
  const prevFrontend = process.env.FRONTEND_URL;
  const prevExtras = process.env.CORS_EXTRA_ORIGINS;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontend;
    if (prevExtras === undefined) delete process.env.CORS_EXTRA_ORIGINS;
    else process.env.CORS_EXTRA_ORIGINS = prevExtras;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it('allowlists FRONTEND_URL and CORS_EXTRA_ORIGINS without trailing slash', () => {
    expect(
      corsAllowedOrigins({
        FRONTEND_URL: 'https://hmi.example.com/',
        CORS_EXTRA_ORIGINS:
          ' https://staging.example.com ,http://localhost:4060,,  ',
      }),
    ).toEqual([
      'https://hmi.example.com',
      'https://staging.example.com',
      'http://localhost:4060',
    ]);
    expect(corsAllowedOrigins({})).toEqual([]);
    expect(corsAllowedOrigins({ CORS_EXTRA_ORIGINS: '' })).toEqual([]);
  });

  it('reads defaults from process.env when args are omitted', () => {
    process.env.FRONTEND_URL = 'https://hmi.example.com';
    process.env.CORS_EXTRA_ORIGINS = 'https://extra.example.com';
    process.env.NODE_ENV = 'production';
    expect(corsAllowedOrigins()).toEqual([
      'https://hmi.example.com',
      'https://extra.example.com',
    ]);
    expect(isCorsOriginAllowed('https://hmi.example.com')).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example')).toBe(false);
    const cb = jest.fn();
    corsOriginDelegate('https://hmi.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('allows missing Origin and configured frontend', () => {
    const env = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://tele-pendant.jahbyte.com',
    };
    expect(isCorsOriginAllowed(undefined, env)).toBe(true);
    expect(isCorsOriginAllowed('https://tele-pendant.jahbyte.com', env)).toBe(
      true,
    );
    expect(isCorsOriginAllowed('https://tele-pendant.jahbyte.com/', env)).toBe(
      true,
    );
  });

  it('rejects evil origins in production', () => {
    const env = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://tele-pendant.jahbyte.com',
    };
    expect(isCorsOriginAllowed('https://evil.example', env)).toBe(false);
    expect(isCorsOriginAllowed('http://localhost:4060', env)).toBe(false);
  });

  it('allows localhost when NODE_ENV is unset (treated as development)', () => {
    expect(
      isCorsOriginAllowed('http://localhost:4060', {
        FRONTEND_URL: 'https://tele-pendant.jahbyte.com',
      }),
    ).toBe(true);
  });

  it('allows localhost in development only', () => {
    const env = {
      NODE_ENV: 'development',
      FRONTEND_URL: 'https://tele-pendant.jahbyte.com',
    };
    expect(isCorsOriginAllowed('http://localhost:4060', env)).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:5173', env)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example', env)).toBe(false);
    expect(isCorsOriginAllowed('not-a-url', env)).toBe(false);
    expect(isCorsOriginAllowed('ftp://localhost', env)).toBe(false);
  });

  it('delegates for Nest/Socket.IO cors callbacks', () => {
    const env = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://hmi.example.com',
    };
    const allowed = jest.fn();
    corsOriginDelegate('https://hmi.example.com', allowed, env);
    expect(allowed).toHaveBeenCalledWith(null, true);

    const denied = jest.fn();
    corsOriginDelegate('https://evil.example', denied, env);
    expect(denied).toHaveBeenCalledWith(null, false);
  });
});
