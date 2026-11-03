import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, Switch, Text, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tourStepsFor, type TourScreen } from '@tele-pendant/shared';
import { useLocale } from './locale';
import { styles as ui } from './ui';

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

export function TourBar({ screen }: { screen: TourScreen }) {
  const { enabled, setEnabled, startWalkthrough } = useTour();
  const { t } = useLocale();
  return (
    <View style={tourStyles.bar}>
      <View style={tourStyles.toggleRow}>
        <Text style={ui.hint}>{t('tour.toggle')}</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          accessibilityLabel={t('tour.toggle')}
        />
      </View>
      {enabled ? (
        <Pressable style={ui.btn} onPress={() => startWalkthrough(screen)}>
          <Text style={ui.btnText}>{t('tour.start')}</Text>
        </Pressable>
      ) : null}
      <WalkthroughModal screen={screen} />
    </View>
  );
}

export function HelpTip({ id, children }: { id: string; children: ReactNode }) {
  const { enabled, currentStepId } = useTour();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const highlighted = currentStepId === id;

  if (!enabled) return <>{children}</>;

  return (
    <View style={[tourStyles.tip, highlighted ? tourStyles.tipActive : null]}>
      {children}
      <Pressable
        style={tourStyles.chip}
        onPress={() => setOpen(true)}
        accessibilityLabel={`Help: ${id}`}
      >
        <Text style={tourStyles.chipText}>?</Text>
      </Pressable>
      <Modal
        visible={open || highlighted}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={tourStyles.modalBackdrop}
          onPress={() => setOpen(false)}
        >
          <View style={tourStyles.modalCard}>
            <Text style={ui.hint}>{t(id)}</Text>
            <Pressable style={ui.btn} onPress={() => setOpen(false)}>
              <Text style={ui.btnText}>{t('tour.done')}</Text>
            </Pressable>
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
    <Modal visible transparent animationType="fade">
      <View style={tourStyles.walkBackdrop}>
        <View style={tourStyles.walkCard}>
          <Text style={ui.hint}>{stepLabel}</Text>
          <Text style={tourStyles.walkText}>{t(currentStepId)}</Text>
          <View style={tourStyles.walkActions}>
            <Pressable
              onPress={prevStep}
              disabled={stepIndex === 0}
              style={tourStyles.linkBtn}
            >
              <Text style={ui.link}>{t('tour.back')}</Text>
            </Pressable>
            <Pressable onPress={stopWalkthrough} style={tourStyles.linkBtn}>
              <Text style={ui.link}>{t('tour.done')}</Text>
            </Pressable>
            <Pressable style={ui.btn} onPress={nextStep}>
              <Text style={ui.btnText}>
                {last ? t('tour.done') : t('tour.next')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const tourStyles = StyleSheet.create({
  bar: { marginBottom: 12, gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tip: { position: 'relative', marginBottom: 4 },
  tipActive: {
    borderColor: '#3D9CFD',
    borderWidth: 2,
    borderRadius: 8,
    padding: 4,
  },
  chip: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3D9CFD',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  chipText: { color: '#041018', fontWeight: '700', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,10,16,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#161D27',
    borderRadius: 12,
    padding: 16,
    borderColor: '#2A3A4D',
    borderWidth: 1,
    gap: 12,
  },
  walkBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,10,16,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  walkCard: {
    backgroundColor: '#161D27',
    borderRadius: 12,
    padding: 16,
    borderColor: '#2A3A4D',
    borderWidth: 1,
    gap: 10,
  },
  walkText: { color: '#E8EEF4', lineHeight: 20 },
  walkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 4 },
});
