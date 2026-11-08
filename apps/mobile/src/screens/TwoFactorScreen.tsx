import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { apiPost } from '../api';
import { getStoredUser, persistUser, type StoredUser } from '../user-session';
import { useLocale } from '../locale';
import { Btn, BtnText, Field, showErrorFrom, Hint, Title } from '../ui';

export function TwoFactorScreen({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredUser().then((user) => {
      if (!cancelled) setEnabled(user?.twoFactorEnabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function beginEnable() {
    setBusy(true);
    try {
      const data = await apiPost<{
        requiresTwoFactor: true;
        challengeId: string;
      }>('/auth/two-factor/enable', undefined, token);
      setChallengeId(data.challengeId);
      setCode('');
    } catch (err) {
      showErrorFrom(err, t('loginFailed'), t('twoFactor'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (!challengeId) return;
    setBusy(true);
    try {
      const data = await apiPost<{
        twoFactorEnabled: boolean;
        user: StoredUser;
      }>('/auth/two-factor/confirm', { challengeId, code: code.trim() }, token);
      setEnabled(true);
      await persistUser(data.user);
      setChallengeId(null);
      setCode('');
      onClose();
    } catch (err) {
      showErrorFrom(err, t('loginFailed'), t('twoFactor'));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const data = await apiPost<{
        twoFactorEnabled: boolean;
        user: StoredUser;
      }>('/auth/two-factor/disable', undefined, token);
      setEnabled(false);
      await persistUser(data.user);
      onClose();
    } catch (err) {
      showErrorFrom(err, t('loginFailed'), t('twoFactor'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-background px-4 pt-4">
      <Title>{t('twoFactor')}</Title>
      <Hint>{t('twoFactorLede')}</Hint>
      <Hint>{enabled ? t('twoFactorOn') : t('twoFactorOff')}</Hint>
      {enabled ? (
        <Btn disabled={busy} onPress={() => void disable()}>
          <BtnText>{t('twoFactorDisable')}</BtnText>
        </Btn>
      ) : challengeId ? (
        <>
          <Field
            label={t('otpCode')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Btn disabled={busy} onPress={() => void confirmEnable()}>
            <BtnText>{t('twoFactorConfirm')}</BtnText>
          </Btn>
        </>
      ) : (
        <Btn disabled={busy} onPress={() => void beginEnable()}>
          <BtnText>{t('twoFactorEnable')}</BtnText>
        </Btn>
      )}
    </View>
  );
}
