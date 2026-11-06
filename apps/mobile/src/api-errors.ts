/** Map API errors to operator-facing hints (Expo often hits an older live API). */

export function operatorApiError(
  err: unknown,
  context: 'stop' | 'reset',
  translate: (key: string) => string,
): string {
  const raw =
    err instanceof Error
      ? err.message
      : context === 'reset'
        ? 'Reset failed'
        : 'Activate failed';

  if (/Cannot POST.*\/safety\/reset/i.test(raw)) {
    return (
      'Reset e-stop is not on this server (POST /safety/reset missing). ' +
      'Set MOBILE_API_URL in the repo root .env to your Docker API, e.g. http://YOUR_LAN_IP:3010/api/v1, then restart Expo.'
    );
  }

  if (
    context === 'stop' &&
    /pin does not match|safe_action_pin|requires.*pin/i.test(raw)
  ) {
    return (
      'This server still requires a PIN to press STOP. One-press STOP needs the updated API — ' +
      'use MOBILE_API_URL pointing at local Docker, or deploy the latest api.tele-pendant build.'
    );
  }

  return translate(raw) !== raw ? translate(raw) : raw;
}
