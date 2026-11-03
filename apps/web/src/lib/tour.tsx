import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CircleHelp } from 'lucide-react';
import { tourStepsFor, type TourScreen } from '@tele-pendant/shared';
import { useT } from './i18n';
import { readTourEnabled, writeTourEnabled } from './tour-storage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export { readTourEnabled, writeTourEnabled } from './tour-storage';

interface TourContextValue {
  enabled: boolean;
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
  const [enabled, setEnabledState] = useState(readTourEnabled);
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughScreen, setWalkthroughScreen] = useState<TourScreen | null>(
    null,
  );
  const [stepIndex, setStepIndex] = useState(0);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    writeTourEnabled(value);
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

export function TourToggle() {
  const { enabled, setEnabled } = useTour();
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="tour-toggle"
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-label={t('tour.toggle')}
      />
      <Label htmlFor="tour-toggle" className="text-xs text-muted-foreground">
        {t('tour.toggle')}
      </Label>
    </div>
  );
}

export function PageTourBar({ screen }: { screen: TourScreen }) {
  const { enabled, startWalkthrough } = useTour();
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TourToggle />
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => startWalkthrough(screen)}
        >
          {t('tour.start')}
        </Button>
      ) : null}
      <WalkthroughOverlay screen={screen} />
    </div>
  );
}

export function HelpTip({ id, children }: { id: string; children: ReactNode }) {
  const { enabled, currentStepId } = useTour();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const highlighted = currentStepId === id;

  if (!enabled) return <>{children}</>;

  return (
    <div
      className={cn(
        'relative',
        highlighted && 'rounded-md ring-2 ring-ring ring-offset-2',
      )}
      data-tour-id={id}
    >
      <div>{children}</div>
      <TooltipProvider>
        <Tooltip open={open || highlighted} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -right-2 -top-2 z-10 size-6 rounded-full"
              aria-label={`Help: ${id}`}
              onClick={() => setOpen((v) => !v)}
            >
              <CircleHelp className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {t(id)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function WalkthroughOverlay({ screen }: { screen: TourScreen }) {
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
  const { t } = useT();

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
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card className="pointer-events-auto w-full max-w-md shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {stepLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{t(currentStepId)}</p>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={stepIndex === 0}
          >
            {t('tour.back')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stopWalkthrough}
          >
            {t('tour.done')}
          </Button>
          <Button type="button" size="sm" onClick={nextStep}>
            {last ? t('tour.done') : t('tour.next')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
