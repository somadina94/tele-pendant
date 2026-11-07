import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
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
    <div className="flex items-center gap-1.5 md:gap-2">
      <Switch
        id="tour-toggle"
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-label={t('tour.toggle')}
        className="scale-90 md:scale-100"
      />
      <Label
        htmlFor="tour-toggle"
        className="hidden text-xs text-muted-foreground md:inline"
      >
        {t('tour.toggle')}
      </Label>
    </div>
  );
}

export function PageTourBar({ screen }: { screen: TourScreen }) {
  const { enabled, startWalkthrough } = useTour();
  const { t } = useT();
  return (
    <div className="flex items-center gap-0.5 sm:gap-1.5 md:gap-2">
      <TourToggle />
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-8 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"
          aria-label={t('tour.start')}
          onClick={() => startWalkthrough(screen)}
        >
          <CircleHelp className="size-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{t('tour.start')}</span>
        </Button>
      ) : null}
      <WalkthroughOverlay screen={screen} />
    </div>
  );
}

export function HelpTip({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { enabled, currentStepId } = useTour();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const highlighted = currentStepId === id;

  if (!enabled) {
    return className ? (
      <div className={className}>{children}</div>
    ) : (
      <>{children}</>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-visible',
        className,
        highlighted && 'rounded-md ring-2 ring-ring ring-offset-2',
      )}
      data-tour-id={id}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
        {children}
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip open={highlighted ? false : open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-1 top-1 z-[60] size-5 min-h-5 min-w-5 rounded-full shadow-sm"
              aria-label={`Help: ${id}`}
              onClick={() => setOpen((v) => !v)}
            >
              <CircleHelp className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="z-[80] max-w-xs"
          >
            {t(id)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/** TP-24: place the card above lower-half targets so the matrix stays usable. */
export function placeTourCard(
  target: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  cardWidth: number,
  cardHeight: number,
  viewport: { width: number; height: number } = {
    width: 1280,
    height: 800,
  },
): { top: number; left: number } {
  const gap = 12;
  const margin = 8;
  const preferAbove = target.top > viewport.height * 0.4;
  const spaceAbove = target.top - margin;
  const spaceBelow = viewport.height - target.bottom - margin;
  const canFitAbove = spaceAbove >= cardHeight + gap;
  const canFitBelow = spaceBelow >= cardHeight + gap;
  let placeAbove: boolean;
  if (preferAbove && canFitAbove) placeAbove = true;
  else if (!preferAbove && canFitBelow) placeAbove = false;
  else if (canFitBelow) placeAbove = false;
  else placeAbove = spaceAbove >= spaceBelow;

  const top = placeAbove
    ? Math.max(margin, target.top - cardHeight - gap)
    : Math.min(viewport.height - cardHeight - margin, target.bottom + gap);
  const left = Math.min(
    Math.max(margin, target.left + target.width / 2 - cardWidth / 2),
    viewport.width - cardWidth - margin,
  );
  return { top, left };
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
  const [searchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!walkthroughActive || walkthroughScreen !== screen || !currentStepId) {
      setCoords(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let frame = 0;
    let scrollTimer = 0;

    const measure = (target: HTMLElement) => {
      if (cancelled) return;
      const rect = target.getBoundingClientRect();
      if ((rect.width < 2 || rect.height < 2) && attempts < 40) {
        attempts += 1;
        frame = window.requestAnimationFrame(() => measure(target));
        return;
      }
      const width = Math.min(448, window.innerWidth - 16);
      const height = cardRef.current?.offsetHeight ?? 200;
      setCoords(
        placeTourCard(rect, width, height, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };

    const findAndPlace = () => {
      if (cancelled) return;
      const target = document.querySelector(
        `[data-tour-id="${CSS.escape(currentStepId)}"]`,
      ) as HTMLElement | null;
      if (!target) {
        if (attempts < 40) {
          attempts += 1;
          frame = window.requestAnimationFrame(findAndPlace);
        } else {
          setCoords(null);
        }
        return;
      }
      target.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
      measure(target);
      frame = window.requestAnimationFrame(() => measure(target));
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => measure(target), 180);
    };

    findAndPlace();
    window.addEventListener('resize', findAndPlace);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(scrollTimer);
      window.removeEventListener('resize', findAndPlace);
    };
  }, [
    walkthroughActive,
    walkthroughScreen,
    screen,
    currentStepId,
    stepIndex,
    searchKey,
  ]);

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

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[60] bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <Card
        ref={cardRef}
        className="pointer-events-auto absolute z-[61] w-[min(100%-1rem,28rem)] max-w-md shadow-lg"
        style={
          coords
            ? { top: coords.top, left: coords.left }
            : { bottom: 16, left: '50%', transform: 'translateX(-50%)' }
        }
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {stepLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{t(currentStepId)}</p>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {stepIndex > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={prevStep}>
              {t('tour.back')}
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={stopWalkthrough}>
            {t('tour.done')}
          </Button>
          {last ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={nextStep}
            >
              {t('tour.next')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>,
    document.body,
  );
}
