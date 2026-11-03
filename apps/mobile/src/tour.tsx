import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tourStepsFor, type TourScreen } from '@tele-pendant/shared';
import { useLocale } from './locale';
import { Btn, BtnText, Hint, LinkText } from './ui';

const STORAGE_KEY = 'tourEnabled';

interface TourContextValue {
  enabled: boolean;
  ready: boolean;
  setEnabled: (value: boolean) => void;
  walkthroughActive: boolean;
  walkthroughScreen: TourScreen | null;
  stepIndex: number;
  stepIds: string[];
  currentStepId: string | null;
  startWalkthrough: (screen: TourScreen) => void;
  stopWalkthrough: () => void;
  nextStep: () => void;
  prevStep: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughScreen, setWalkthroughScreen] = useState<TourScreen | null>(
    null,
  );
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setEnabledState(value === '1');
      setReady(true);
    });
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    void AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    if (!value) {
      setWalkthroughActive(false);
      setWalkthroughScreen(null);
      setStepIndex(0);
    }
  }, []);

  const stepIds = useMemo(
    () => (walkthroughScreen ? tourStepsFor(walkthroughScreen) : []),
    [walkthroughScreen],
  );

  const startWalkthrough = useCallback(
    (screen: TourScreen) => {
      if (!enabled) return;
      setWalkthroughScreen(screen);
      setStepIndex(0);
      setWalkthroughActive(true);
    },
    [enabled],
  );

  const stopWalkthrough = useCallback(() => {
    setWalkthroughActive(false);
    setWalkthroughScreen(null);
    setStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    if (stepIndex >= stepIds.length - 1) {
      setWalkthroughActive(false);
      setWalkthroughScreen(null);
      setStepIndex(0);
      return;
    }
    setStepIndex((current) => current + 1);
  }, [stepIndex, stepIds.length]);

  const prevStep = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      enabled,
      ready,
      setEnabled,
      walkthroughActive,
      walkthroughScreen,
      stepIndex,
      stepIds,
      currentStepId:
        walkthroughActive && stepIds[stepIndex] ? stepIds[stepIndex] : null,
      startWalkthrough,
      stopWalkthrough,
      nextStep,
      prevStep,
    }),
    [
      enabled,
      ready,
      setEnabled,
      walkthroughActive,
      walkthroughScreen,
      stepIndex,
      stepIds,
      startWalkthrough,
      stopWalkthrough,
      nextStep,
      prevStep,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within TourProvider');
  }
  return ctx;
}

export function TourBar({
  screen,
  compact,
}: {
  screen: TourScreen;
  compact?: boolean;
}) {
  const { enabled, setEnabled, startWalkthrough } = useTour();
  const { t } = useLocale();

  if (compact) {
    return (
      <View className="flex-row items-center gap-2">
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          accessibilityLabel={t('tour.toggle')}
        />
        {enabled ? (
          <Pressable onPress={() => startWalkthrough(screen)}>
            <Text className="text-xs text-primary">{t('tour.start')}</Text>
          </Pressable>
        ) : null}
        <WalkthroughModal screen={screen} />
      </View>
    );
  }

  return (
    <View className="mb-3 gap-2">
      <View className="flex-row items-center justify-between">
        <Hint>{t('tour.toggle')}</Hint>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          accessibilityLabel={t('tour.toggle')}
        />
      </View>
      {enabled ? (
        <Btn onPress={() => startWalkthrough(screen)}>
          <BtnText>{t('tour.start')}</BtnText>
        </Btn>
      ) : null}
      <WalkthroughModal screen={screen} />
    </View>
  );
}

export function HelpTip({ id, children }: { id: string; children: ReactNode }) {
  const {
    enabled,
    currentStepId,
    walkthroughActive,
    nextStep,
    stopWalkthrough,
  } = useTour();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const highlighted = currentStepId === id;

  if (!enabled) return <>{children}</>;

  // During an active walkthrough, only highlight — never stack a second Modal
  // on top of WalkthroughModal (Done would only clear local `open` and stay stuck).
  const showHelpModal = open && !walkthroughActive;

  return (
    <View
      className={`relative mb-1 ${
        highlighted ? 'rounded-lg border-2 border-primary p-1' : ''
      }`}
    >
      {children}
      <Pressable
        className="absolute right-0 top-0 z-10 h-[22px] w-[22px] items-center justify-center rounded-full bg-primary"
        onPress={() => {
          if (walkthroughActive && highlighted) {
            nextStep();
            return;
          }
          setOpen(true);
        }}
        accessibilityLabel={`Help: ${id}`}
      >
        <Text className="text-xs font-bold text-primary-foreground">?</Text>
      </Pressable>
      <Modal
        visible={showHelpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-center bg-black/60 p-6"
          onPress={() => setOpen(false)}
        >
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <Hint>{t(id)}</Hint>
            <Btn
              onPress={() => {
                setOpen(false);
                if (walkthroughActive) stopWalkthrough();
              }}
            >
              <BtnText>{t('tour.done')}</BtnText>
            </Btn>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function WalkthroughModal({ screen }: { screen: TourScreen }) {
  const {
    walkthroughActive,
    walkthroughScreen,
    stepIndex,
    stepIds,
    currentStepId,
    nextStep,
    prevStep,
    stopWalkthrough,
  } = useTour();
  const { t } = useLocale();

  if (
    !walkthroughActive ||
    walkthroughScreen !== screen ||
    !currentStepId ||
    stepIds.length === 0
  ) {
    return null;
  }

  const last = stepIndex >= stepIds.length - 1;
  const stepLabel = t('tour.stepOf')
    .replace('{current}', String(stepIndex + 1))
    .replace('{total}', String(stepIds.length));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={stopWalkthrough}
    >
      <View
        className="flex-1 justify-end bg-black/55 p-4"
        pointerEvents="box-none"
      >
        <View className="gap-2.5 rounded-xl border border-border bg-card p-4">
          <Hint>{stepLabel}</Hint>
          <Text className="leading-5 text-foreground">{t(currentStepId)}</Text>
          <View className="flex-row flex-wrap items-center justify-end gap-3">
            <Pressable
              onPress={prevStep}
              disabled={stepIndex === 0}
              className="px-1 py-2"
            >
              <LinkText>{t('tour.back')}</LinkText>
            </Pressable>
            <Pressable onPress={stopWalkthrough} className="px-1 py-2">
              <LinkText>{t('tour.done')}</LinkText>
            </Pressable>
            <Btn onPress={nextStep}>
              <BtnText>{last ? t('tour.done') : t('tour.next')}</BtnText>
            </Btn>
          </View>
        </View>
      </View>
    </Modal>
  );
}
