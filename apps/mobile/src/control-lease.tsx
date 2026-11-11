import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiGet, apiPost } from './api';
import { getControlClientId, peekControlClientId } from './control-client-id';
import { useLocale } from './locale';
import type { ControlLease } from './types';
import { getStoredUser } from './user-session';

function mergeControl(
  incoming: ControlLease | null | undefined,
  prev: ControlLease | null,
  localUserId: string | null,
  clientId: string | null,
): ControlLease | null {
  if (!incoming) return prev;
  const derived = Boolean(
    localUserId &&
    clientId &&
    incoming.holderUserId &&
    incoming.holderClientId &&
    localUserId === incoming.holderUserId &&
    clientId === incoming.holderClientId,
  );
  return {
    ...incoming,
    youHold: Boolean(incoming.youHold || derived),
  };
}

type ControlLeaseContextValue = {
  control: ControlLease | null;
  youHold: boolean;
  controlHeldByOther: boolean;
  controlLampLabel: string;
  applyControl: (next: ControlLease | null | undefined) => void;
  claim: () => Promise<void>;
  release: () => Promise<void>;
  steal: (pin: string) => Promise<void>;
  busy: boolean;
};

const ControlLeaseContext = createContext<ControlLeaseContextValue | null>(
  null,
);

export function ControlLeaseProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const [control, setControl] = useState<ControlLease | null>(null);
  const [busy, setBusy] = useState(false);
  const controlRef = useRef<ControlLease | null>(null);
  const localUserIdRef = useRef<string | null>(null);
  const clientIdRef = useRef<string | null>(null);

  const applyControl = useCallback((next: ControlLease | null | undefined) => {
    setControl((prev) =>
      mergeControl(
        next,
        prev,
        localUserIdRef.current,
        clientIdRef.current ?? peekControlClientId(),
      ),
    );
  }, []);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getStoredUser(), getControlClientId()]).then(
      ([user, clientId]) => {
        if (cancelled) return;
        localUserIdRef.current = user?.id?.trim() || null;
        clientIdRef.current = clientId;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: ControlLease) => {
      if (!cancelled) applyControl(next);
    };
    const refresh = async () => {
      try {
        apply(await apiGet<ControlLease>('/safety/control', token));
      } catch {
        // ignore
      }
    };
    void (async () => {
      await getControlClientId();
      try {
        apply(
          await apiPost<ControlLease>(
            '/safety/control/claim',
            undefined,
            token,
          ),
        );
      } catch {
        await refresh();
      }
    })();
    const id = setInterval(() => {
      if (controlRef.current?.youHold) {
        void apiPost<ControlLease>(
          '/safety/control/heartbeat',
          undefined,
          token,
        )
          .then(apply)
          .catch(() => void refresh());
      } else {
        void refresh();
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
      void apiPost('/safety/control/release', undefined, token).catch(
        () => undefined,
      );
    };
  }, [token, applyControl]);

  const claim = useCallback(async () => {
    setBusy(true);
    try {
      applyControl(
        await apiPost<ControlLease>('/safety/control/claim', undefined, token),
      );
    } catch {
      try {
        applyControl(await apiGet<ControlLease>('/safety/control', token));
      } catch {
        // ignore
      }
      throw new Error(t('err.control'));
    } finally {
      setBusy(false);
    }
  }, [applyControl, t, token]);

  const release = useCallback(async () => {
    setBusy(true);
    try {
      applyControl(
        await apiPost<ControlLease>(
          '/safety/control/release',
          undefined,
          token,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [applyControl, token]);

  const steal = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        applyControl(
          await apiPost<ControlLease>('/safety/control/steal', { pin }, token),
        );
      } finally {
        setBusy(false);
      }
    },
    [applyControl, token],
  );

  const youHold = Boolean(control?.youHold);
  const controlHeldByOther = Boolean(control?.held && !youHold);
  const controlLampLabel = youHold
    ? t('controlYou')
    : controlHeldByOther
      ? `${t('controlHeldBy')} ${control?.holderDisplayName || control?.holderUserId}`
      : t('controlFree');

  const value = useMemo(
    () => ({
      control,
      youHold,
      controlHeldByOther,
      controlLampLabel,
      applyControl,
      claim,
      release,
      steal,
      busy,
    }),
    [
      control,
      youHold,
      controlHeldByOther,
      controlLampLabel,
      applyControl,
      claim,
      release,
      steal,
      busy,
    ],
  );

  return (
    <ControlLeaseContext.Provider value={value}>
      {children}
    </ControlLeaseContext.Provider>
  );
}

export function useControlLease(): ControlLeaseContextValue {
  const ctx = useContext(ControlLeaseContext);
  if (!ctx) {
    throw new Error('useControlLease requires ControlLeaseProvider');
  }
  return ctx;
}

export function ControlLeaseHeaderControls({ dark }: { dark: boolean }) {
  const { t } = useLocale();
  const {
    youHold,
    controlHeldByOther,
    controlLampLabel,
    claim,
    release,
    steal,
    busy,
  } = useControlLease();
  const [stealOpen, setStealOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pilotPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (youHold && stealOpen) {
      setStealOpen(false);
      setPin('');
    }
  }, [youHold, stealOpen]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pilotPulse, {
          toValue: 1.55,
          duration: 575,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pilotPulse, {
          toValue: 1,
          duration: 575,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pilotPulse]);

  const onClaim = async () => {
    setError(null);
    try {
      await claim();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.control'));
    }
  };

  const onRelease = async () => {
    setError(null);
    try {
      await release();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    }
  };

  const onSteal = async () => {
    setError(null);
    try {
      await steal(pin);
      setStealOpen(false);
      setPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN does not match');
    }
  };

  const btnBase = {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center' as const,
    opacity: busy ? 0.6 : 1,
  };

  return (
    <View className="mr-1 flex-row items-center gap-1.5">
      <View
        accessibilityRole="text"
        accessibilityLabel={controlLampLabel}
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1f2937',
          borderWidth: 1,
          borderColor: '#9ca3af',
        }}
      >
        <Animated.View
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            backgroundColor: youHold ? '#22c55e' : '#f59e0b',
            shadowColor: youHold ? '#4ade80' : '#fbbf24',
            shadowOpacity: 1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
            opacity: pilotPulse.interpolate({
              inputRange: [1, 1.55],
              outputRange: [0.85, 1],
            }),
            transform: [
              {
                scale: pilotPulse.interpolate({
                  inputRange: [1, 1.55],
                  outputRange: [1, 1.12],
                }),
              },
            ],
          }}
        />
      </View>
      {youHold ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onRelease()}
          style={{
            ...btnBase,
            backgroundColor: 'rgba(16,185,129,0.15)',
            borderWidth: 1,
            borderColor: 'rgba(16,185,129,0.45)',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: dark ? '#A7F3D0' : '#065F46',
            }}
          >
            {t('releaseControl')}
          </Text>
        </Pressable>
      ) : controlHeldByOther ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setError(null);
            setStealOpen(true);
          }}
          style={{
            ...btnBase,
            backgroundColor: 'rgba(245,158,11,0.15)',
            borderWidth: 1,
            borderColor: 'rgba(245,158,11,0.5)',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: dark ? '#FDE68A' : '#92400E',
            }}
          >
            {t('stealControl')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onClaim()}
          style={{
            ...btnBase,
            backgroundColor: '#0284C7',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>
            {t('claimControl')}
          </Text>
        </Pressable>
      )}

      <Modal
        visible={stealOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStealOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              borderRadius: 12,
              padding: 16,
              backgroundColor: dark ? '#161D27' : '#FFFFFF',
              gap: 10,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: dark ? '#E8EEF4' : '#0F1419',
              }}
            >
              {t('stealControl')}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: dark ? '#8B9AAB' : '#5C6B7A',
              }}
            >
              {t('stealControlHint')}
            </Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="PIN"
              placeholderTextColor={dark ? '#8B9AAB' : '#5C6B7A'}
              style={{
                borderWidth: 1,
                borderColor: dark ? '#2A3A4D' : '#C5D0DC',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: dark ? '#E8EEF4' : '#0F1419',
              }}
            />
            {error ? (
              <Text style={{ color: '#EF4444', fontSize: 12 }}>{error}</Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                justifyContent: 'flex-end',
              }}
            >
              <Pressable
                onPress={() => setStealOpen(false)}
                style={{ paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <Text style={{ color: dark ? '#8B9AAB' : '#5C6B7A' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                disabled={busy || !pin.trim()}
                onPress={() => void onSteal()}
                style={{
                  ...btnBase,
                  backgroundColor: '#0284C7',
                }}
              >
                <Text
                  style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}
                >
                  {t('stealControl')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
