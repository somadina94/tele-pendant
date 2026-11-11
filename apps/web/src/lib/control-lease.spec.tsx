import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderWithProviders } from '../test/render';
import * as api from './api';
import {
  ControlLeaseHeaderControls,
  ControlLeaseProvider,
  mergeControlLease,
  useControlLease,
} from './control-lease';

const realtimeHandlers = vi.hoisted(
  () => ({}) as Record<string, (payload: unknown) => void>,
);
vi.mock('./realtime', () => ({
  getRealtimeSocket: () => ({
    on: (event: string, handler: (payload: unknown) => void) => {
      realtimeHandlers[event] = handler;
    },
    off: vi.fn(),
    emit: vi.fn(),
  }),
}));

const held = {
  held: true,
  holderUserId: 'u1',
  holderDisplayName: 'Operator',
  youHold: true,
  expiresAt: new Date().toISOString(),
};

describe('mergeControlLease', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps previous state when incoming is empty', () => {
    const prev = {
      held: false,
      holderUserId: null,
      holderDisplayName: null,
      youHold: false,
      expiresAt: null,
    };
    expect(mergeControlLease(null, prev)).toBe(prev);
    expect(mergeControlLease(undefined, prev)).toBe(prev);
  });

  it('derives youHold from user id and this tab client id', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1' }));
    sessionStorage.setItem('controlClientId', 'tab-a');
    expect(
      mergeControlLease(
        {
          held: true,
          holderUserId: 'u1',
          holderDisplayName: 'Op',
          holderClientId: 'tab-a',
          youHold: false,
          expiresAt: held.expiresAt,
        },
        null,
      )?.youHold,
    ).toBe(true);
    expect(
      mergeControlLease(
        {
          held: true,
          holderUserId: 'u1',
          holderDisplayName: 'Op',
          holderClientId: 'tab-b',
          youHold: false,
          expiresAt: held.expiresAt,
        },
        null,
      )?.youHold,
    ).toBe(false);
  });

  it('tolerates corrupt user JSON in storage', () => {
    localStorage.setItem('user', '{');
    sessionStorage.setItem('controlClientId', 'tab-a');
    expect(
      mergeControlLease(
        {
          held: true,
          holderUserId: 'u1',
          holderDisplayName: 'Op',
          holderClientId: 'tab-a',
          youHold: false,
          expiresAt: held.expiresAt,
        },
        null,
      )?.youHold,
    ).toBe(false);
  });
});

describe('useControlLease', () => {
  it('requires ControlLeaseProvider', () => {
    function Bad() {
      useControlLease();
      return null;
    }
    expect(() => render(createElement(Bad))).toThrow(/ControlLeaseProvider/);
  });
});

describe('ControlLeaseProvider autoManage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('user', JSON.stringify({ id: 'u1' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes control state when heartbeat fails while holding', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(held as never);
    const post = vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/claim') return held as never;
      if (path === '/safety/control/heartbeat') {
        throw new Error('heartbeat down');
      }
      if (path === '/safety/control/release') return held as never;
      return held as never;
    });

    renderWithProviders(
      <ControlLeaseProvider autoManage>
        <span>lease-child</span>
      </ControlLeaseProvider>,
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/safety/control/claim'),
    );
    const getBefore = vi.mocked(api.apiGet).mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/safety/control/heartbeat'),
    );
    await waitFor(() =>
      expect(vi.mocked(api.apiGet).mock.calls.length).toBeGreaterThan(
        getBefore,
      ),
    );
  });
});

describe('ControlLeaseHeaderControls', () => {
  beforeEach(() => {
    for (const key of Object.keys(realtimeHandlers))
      delete realtimeHandlers[key];
  });

  it('ignores safety events that omit control state', () => {
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    realtimeHandlers['safety.state']?.({ mode: 'normal' });
    expect(screen.getByRole('button', { name: 'Claim control' })).toBeEnabled();
  });

  it('surfaces release failures', async () => {
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/release') throw 'release nope';
      return held as never;
    });
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    await waitFor(() => expect(realtimeHandlers['safety.state']).toBeDefined());
    realtimeHandlers['safety.state']!({
      control: { ...held, youHold: true },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release control' }),
    );
    expect(await screen.findByText('Release failed')).toBeInTheDocument();
  });

  it('surfaces typed claim errors', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('claim blocked'));
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    fireEvent.click(screen.getByRole('button', { name: 'Claim control' }));
    expect(await screen.findByText('claim blocked')).toBeInTheDocument();
  });

  it('surfaces generic claim failures', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('nope');
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    fireEvent.click(screen.getByRole('button', { name: 'Claim control' }));
    expect(
      await screen.findByText('Claim exclusive control before moving'),
    ).toBeInTheDocument();
  });

  it('steals control, then closes the PIN dialog when the lease is acquired', async () => {
    const heldByOther = {
      held: true,
      holderUserId: 'other',
      holderDisplayName: 'Other',
      youHold: false,
      expiresAt: new Date().toISOString(),
    };
    vi.spyOn(api, 'apiGet').mockResolvedValue(heldByOther as never);
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/steal') return held as never;
      return heldByOther as never;
    });
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    await waitFor(() => expect(realtimeHandlers['safety.state']).toBeDefined());
    realtimeHandlers['safety.state']!({ control: heldByOther });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Take control' }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    fireEvent.change(screen.getByLabelText('PIN'), {
      target: { value: '1234' },
    });
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Take control',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Release control' }),
      ).toBeInTheDocument(),
    );
    realtimeHandlers['safety.state']?.({
      control: { ...held, youHold: true },
    });
  });

  it('reports generic steal failures', async () => {
    const heldByOther = {
      held: true,
      holderUserId: 'other',
      holderDisplayName: null,
      youHold: false,
      expiresAt: new Date().toISOString(),
    };
    vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/safety/control/steal') throw 'bad pin';
      return heldByOther as never;
    });
    renderWithProviders(<ControlLeaseHeaderControls />, { autoManage: false });
    await waitFor(() => expect(realtimeHandlers['safety.state']).toBeDefined());
    realtimeHandlers['safety.state']!({ control: heldByOther });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Take control' }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    fireEvent.change(screen.getByLabelText('PIN'), {
      target: { value: '9999' },
    });
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Take control',
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText('PIN does not match').length).toBeGreaterThan(
        0,
      ),
    );
  });
});
