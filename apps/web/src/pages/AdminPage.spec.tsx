import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AdminPage } from './AdminPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const layout = {
  matrix: { rows: 1, cols: 1 },
  cells: [
    {
      id: 'c1',
      row: 0,
      col: 0,
      label: 'Up',
      style: 'default',
      isMotion: true,
      requiresSafeAction: false,
      primaryRegister: {
        id: 'r1',
        name: 'coil.up',
        address: 0,
        kind: 'coil',
      },
      feedbackRegister: {
        id: 'r2',
        name: 'coil.fb',
        address: 1,
        kind: 'coil',
      },
      statusRegister: {
        id: 'r3',
        name: 'coil.st',
        address: 2,
        kind: 'coil',
      },
    },
    {
      id: 'c2',
      row: 0,
      col: 1,
      label: 'Spare',
      style: 'default',
      isMotion: false,
      requiresSafeAction: false,
      primaryRegister: null,
      feedbackRegister: null,
      statusRegister: null,
    },
  ],
  background: null,
  overlays: [],
  registers: [
    { id: 'r1', name: 'coil.up', address: 0, kind: 'coil' },
    { id: 'r2', name: 'coil.fb', address: 1, kind: 'coil' },
    { id: 'r3', name: 'coil.st', address: 2, kind: 'coil' },
  ],
  safety: {
    mode: 'normal',
    deadmanActive: false,
    eStopActive: false,
    watchdogOk: true,
  },
};

function adminGetFallback(path: string) {
  if (path === '/media/codes') return [];
  if (path === '/users') return [];
  return layout;
}

const plcHealthMock = {
  connected: true,
  connectionId: '1',
  label: 'sim',
  host: '127.0.0.1',
  port: 1502,
  lastError: null,
};

function confirmDeleteDialog() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    }),
  );
}

function cancelDeleteDialog() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Cancel',
    }),
  );
}

function confirmPlcEnableDialog() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Use this PLC',
    }),
  );
}

function cancelPlcEnableDialog() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Cancel',
    }),
  );
}

async function saveSimConnection() {
  fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
  try {
    await screen.findByRole('alertdialog', {}, { timeout: 800 });
    confirmPlcEnableDialog();
  } catch {
    /* enabled PLC saves ask for confirmation; disabled saves do not */
  }
  await screen.findByText('Saved.');
}

const SECTION_BY_LABEL: Record<string, string> = {
  'PLC connections': 'plc',
  'Register maps': 'registers',
  'Matrix cells': 'cells',
  'Live labels': 'labels',
  Background: 'background',
  'QR / scan codes': 'codes',
  'Alarm definitions': 'alarms',
  'Safety roles': 'safety',
  Users: 'users',
};

let unmountAdmin: () => void = () => {};

function showAdminSection(section: string) {
  unmountAdmin();
  const view = renderWithProviders(<AdminPage />, {
    route: `/admin?section=${section}`,
  });
  unmountAdmin = view.unmount;
  return view;
}

async function goConfigSection(label: string) {
  showAdminSection(SECTION_BY_LABEL[label] ?? 'plc');
  await waitFor(() => {
    expect(
      screen.queryByRole('status', { name: /HMI config/i }),
    ).not.toBeInTheDocument();
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    unmountAdmin = () => {};
  });
  it('renders connections registers and cells', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/media/codes') {
        return [
          {
            id: 'sc1',
            code: 'TP-OPS',
            label: 'Ops dashboard',
            kind: 'shortcut',
            routeHint: '/ops',
          },
        ];
      }
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 1502,
            enabled: true,
            isSimulator: true,
          },
          {
            id: '2',
            label: 'plant',
            host: '10.0.0.1',
            port: 502,
            unitId: 3,
            enabled: false,
            isSimulator: false,
          },
        ];
      }
      return adminGetFallback(path);
    });
    showAdminSection('plc');
    await waitFor(() =>
      expect(screen.getAllByText(/simulator/).length).toBeGreaterThan(0),
    );
    expect(screen.getByDisplayValue('sim')).toBeInTheDocument();
    await goConfigSection('Register maps');
    expect(screen.getAllByText(/coil\.up/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/coil\.fb/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/coil\.st/).length).toBeGreaterThan(0);
    await goConfigSection('Matrix cells');
    expect(screen.getByDisplayValue('Up')).toBeInTheDocument();
    await goConfigSection('Background');
    expect(screen.getByText('No active background')).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
    await goConfigSection('QR / scan codes');
    await waitFor(() =>
      expect(screen.getByDisplayValue('TP-OPS')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: /Add code/i }),
    ).toBeInTheDocument();
    const delCode = vi.spyOn(api, 'apiDelete').mockResolvedValue({});
    const codeRow = screen.getByDisplayValue('TP-OPS').closest('form')!;
    fireEvent.click(within(codeRow).getByRole('button', { name: 'Delete' }));
    confirmDeleteDialog();
    await waitFor(() =>
      expect(delCode).toHaveBeenCalledWith('/media/codes/sc1'),
    );
  });

  it('shows PLC connection status variants for enabled connections', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let healthCall = 0;
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') {
        healthCall += 1;
        if (healthCall === 1) return null;
        if (healthCall === 2) {
          return {
            ...plcHealthMock,
            connectionId: 'other',
            connected: true,
          };
        }
        if (healthCall === 3) {
          return {
            ...plcHealthMock,
            connected: false,
            lastError: 'timeout',
          };
        }
        if (healthCall === 4) {
          return {
            ...plcHealthMock,
            connected: false,
            lastError: null,
          };
        }
        return plcHealthMock;
      }
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 1502,
            enabled: true,
            isSimulator: true,
          },
        ];
      }
      return adminGetFallback(path);
    });
    await goConfigSection('PLC connections');
    expect(await screen.findByText(/Checking connection/i)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(
      await screen.findByText(/Standby — another PLC is active/i),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(
      await screen.findByText(/Not connected: timeout/i),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(await screen.findByText(/^Not connected$/i)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(await screen.findByText(/^Connected$/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows scan code load errors', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/media/codes') throw new Error('codes offline');
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      return adminGetFallback(path);
    });
    await goConfigSection('QR / scan codes');
    expect(await screen.findByText('codes offline')).toBeInTheDocument();
  });

  it('saves a PLC, a register, and a new connection', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 1502,
            unitId: 1,
            enabled: true,
            isSimulator: true,
          },
        ];
      }
      return adminGetFallback(path);
    });
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    showAdminSection('plc');
    await screen.findByDisplayValue('sim');

    fireEvent.change(screen.getByLabelText('1 label'), {
      target: { value: 'sim' },
    });
    fireEvent.change(screen.getByLabelText('1 host'), {
      target: { value: '10.1.1.1' },
    });
    fireEvent.change(screen.getByLabelText('1 port'), {
      target: { value: '502' },
    });
    fireEvent.change(screen.getByLabelText('1 unit'), {
      target: { value: '2' },
    });
    await saveSimConnection();
    expect(patch).toHaveBeenCalledWith('/plc/connections/1', {
      label: 'sim',
      host: '10.1.1.1',
      port: 502,
      unitId: 2,
      enabled: true,
      protocol: 'modbus-tcp',
    });

    fireEvent.click(screen.getByLabelText('1 use'));
    await saveSimConnection();

    await goConfigSection('Register maps');
    fireEvent.change(screen.getByLabelText('coil.up address'), {
      target: { value: '11' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save coil.up' }));
    await screen.findByText('Saved coil.up.');
    expect(patch).toHaveBeenCalledWith('/hmi/registers/r1', {
      address: 11,
      trended: false,
    });

    fireEvent.change(screen.getByLabelText('new label'), {
      target: { value: 'plant' },
    });
    fireEvent.change(screen.getByLabelText('new host'), {
      target: { value: '10.0.0.5' },
    });
    fireEvent.change(screen.getByLabelText('new port'), {
      target: { value: '502' },
    });
    fireEvent.change(screen.getByLabelText('new unit'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByLabelText('new use'));
    fireEvent.click(screen.getByRole('button', { name: 'Add PLC' }));
    await screen.findByRole('alertdialog');
    cancelPlcEnableDialog();
    expect(post).not.toHaveBeenCalledWith(
      '/plc/connections',
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add PLC' }));
    await screen.findByRole('alertdialog');
    confirmPlcEnableDialog();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/plc/connections', {
        label: 'plant',
        host: '10.0.0.5',
        port: 502,
        unitId: 1,
        enabled: true,
        protocol: 'modbus-tcp',
      }),
    );
  });

  it('shows save failures from the API', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 1502,
            enabled: true,
            isSimulator: true,
          },
        ];
      }
      return adminGetFallback(path);
    });
    vi.spyOn(api, 'apiPatch')
      .mockRejectedValueOnce(new Error('no route'))
      .mockRejectedValueOnce('x');
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('duplicate'));
    showAdminSection('plc');
    await screen.findByDisplayValue('sim');

    fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
    await screen.findByRole('alertdialog');
    confirmPlcEnableDialog();
    await screen.findByText('no route');

    await goConfigSection('Register maps');
    fireEvent.click(screen.getByRole('button', { name: 'Save coil.up' }));
    await screen.findByText('Save failed');

    fireEvent.click(screen.getByRole('button', { name: 'Add PLC' }));
    await screen.findByText('duplicate');
  });

  it('saves cells, labels, and the background', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      return {
        ...layout,
        background: {
          id: 'bg',
          name: 'bay',
          cssBackground: 'red',
          imageUrl: '',
        },
        overlays: [
          {
            id: 'o1',
            label: 'Height',
            xPct: 10,
            yPct: 20,
            format: '{value} mm',
            register: {
              id: 'r1',
              name: 'coil.up',
              address: 0,
              kind: 'coil',
            },
          },
        ],
      };
    });
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    const del = vi
      .spyOn(api, 'apiDelete')
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({});
    showAdminSection('cells');
    await screen.findByDisplayValue('Up');

    fireEvent.change(screen.getByLabelText('c1 row'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('c1 col'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('c1 cell-label'), {
      target: { value: 'Lift' },
    });
    fireEvent.change(screen.getByLabelText('c1 style'), {
      target: { value: 'motion' },
    });
    fireEvent.change(screen.getByLabelText('c1 primary'), {
      target: { value: 'r1' },
    });
    fireEvent.change(screen.getByLabelText('c1 feedback'), {
      target: { value: 'r2' },
    });
    fireEvent.change(screen.getByLabelText('c1 status'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByLabelText('c1 motion'));
    fireEvent.click(screen.getByLabelText('c1 safe'));
    // Motion was on; click toggled it off — turn back on for FEAT-A2 fields.
    fireEvent.click(screen.getByLabelText('c1 motion'));
    expect(screen.getByLabelText('c1 variable-speed')).toBeChecked();
    fireEvent.change(screen.getByLabelText('c1 slow-speed'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('c1 fast-speed'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Up' }));
    await screen.findByText('Saved Lift.');
    expect(patch).toHaveBeenCalledWith(
      '/hmi/cells/c1',
      expect.objectContaining({
        label: 'Lift',
        row: 1,
        col: 2,
        variableSpeed: true,
        slowSpeedPct: 30,
        fastSpeedPct: 100,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Lift' }));
    await screen.findByRole('alertdialog');
    confirmDeleteDialog();
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/cells/c1'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Spare' }));
    await screen.findByRole('alertdialog');
    confirmDeleteDialog();
    await screen.findByText('busy');

    fireEvent.click(screen.getByRole('button', { name: 'Add cell' }));
    await screen.findByText('Saved cell.');

    fireEvent.change(screen.getByLabelText('new-cell cell-label'), {
      target: { value: 'Extra' },
    });
    fireEvent.change(screen.getByLabelText('new-cell row'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('new-cell col'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('new-cell style'), {
      target: { value: 'default' },
    });
    fireEvent.change(screen.getByLabelText('new-cell primary'), {
      target: { value: 'r1' },
    });
    fireEvent.change(screen.getByLabelText('new-cell feedback'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('new-cell status'), {
      target: { value: 'r3' },
    });
    fireEvent.click(screen.getByLabelText('new-cell motion'));
    fireEvent.click(screen.getByLabelText('new-cell safe'));
    fireEvent.click(screen.getByLabelText('new-cell variable-speed'));
    fireEvent.change(screen.getByLabelText('new-cell slow-speed'), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('new-cell fast-speed'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add cell' }));
    await screen.findByText('Saved Extra.');
    expect(post).toHaveBeenCalledWith(
      '/hmi/cells',
      expect.objectContaining({
        label: 'Extra',
        variableSpeed: true,
        slowSpeedPct: 25,
        fastSpeedPct: 90,
      }),
    );

    await goConfigSection('Live labels');
    fireEvent.change(screen.getByLabelText('o1 overlay-label'), {
      target: { value: 'Load' },
    });
    fireEvent.change(screen.getByLabelText('o1 x'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('o1 y'), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('o1 format'), {
      target: { value: '{value} kg' },
    });
    fireEvent.change(screen.getByLabelText('o1 overlay-register'), {
      target: { value: 'r2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Height' }));
    await screen.findByText('Saved Load.');

    fireEvent.click(
      screen.getByRole('button', { name: /Delete (Load|Height)/ }),
    );
    await screen.findByRole('alertdialog');
    confirmDeleteDialog();
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/overlays/o1'));

    fireEvent.click(screen.getByRole('button', { name: 'Add label' }));
    await screen.findByText('Saved label.');

    fireEvent.change(screen.getByLabelText('new-label overlay-label'), {
      target: { value: 'Motor' },
    });
    fireEvent.change(screen.getByLabelText('new-label x'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByLabelText('new-label y'), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText('new-label format'), {
      target: { value: '{value}' },
    });
    fireEvent.change(screen.getByLabelText('new-label overlay-register'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add label' }));
    await screen.findByText('Saved Motor.');

    await goConfigSection('Background');
    fireEvent.change(screen.getByLabelText('background name'), {
      target: { value: 'yard' },
    });
    fireEvent.change(screen.getByLabelText('background css'), {
      target: { value: 'blue' },
    });
    fireEvent.change(screen.getByLabelText('background image'), {
      target: { value: 'https://example.com/bay.png' },
    });
    fireEvent.error(screen.getByRole('img', { name: 'Background preview' }));
    expect(
      await screen.findByText(/did not load as a picture/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save background' }));
    await screen.findByText('Saved background.');
    expect(patch).toHaveBeenCalledWith('/hmi/background', {
      name: 'yard',
      cssBackground: 'blue',
      imageUrl: 'https://example.com/bay.png',
    });

    patch.mockRejectedValueOnce(new Error('overlay'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Height' }));
    await screen.findByText('overlay');

    del.mockRejectedValueOnce('x');
    fireEvent.click(
      screen.getByRole('button', { name: /Delete (Load|Height)/ }),
    );
    await screen.findByRole('alertdialog');
    confirmDeleteDialog();
    await screen.findByText('Save failed');

    patch.mockRejectedValueOnce(new Error('bg'));
    fireEvent.click(screen.getByRole('button', { name: 'Save background' }));
    await screen.findByText('bg');

    patch.mockRejectedValueOnce(new Error('cell'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Up' }));
    await screen.findByText('cell');
  });

  it('renders a picture background and a label with no register', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      if (path === '/safety/roles') return null;
      return {
        ...layout,
        registers: [],
        cells: [
          {
            id: 'blank',
            row: 0,
            col: 0,
            label: '',
            style: 'default',
            isMotion: false,
            requiresSafeAction: false,
            primaryRegister: null,
            feedbackRegister: null,
            statusRegister: null,
          },
        ],
        background: {
          id: 'bg',
          name: 'bay',
          cssBackground: null,
          imageUrl: null,
        },
        overlays: [
          {
            id: 'o9',
            label: '',
            xPct: 1,
            yPct: 2,
            format: '{value}',
            register: null,
          },
        ],
      };
    });
    const del = vi.spyOn(api, 'apiDelete').mockResolvedValue({});
    showAdminSection('cells');
    expect(await screen.findByDisplayValue('bay')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('blank style'), {
      target: { value: 'default' },
    });
    fireEvent.change(screen.getByLabelText('blank cell-label'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete cell' }));
    cancelDeleteDialog();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete cell' }));
    confirmDeleteDialog();
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/cells/blank'));
    await goConfigSection('Live labels');
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }));
    cancelDeleteDialog();
    expect(del).not.toHaveBeenCalledWith('/hmi/overlays/o9');
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }));
    confirmDeleteDialog();
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/overlays/o9'));
  });

  it('requires reset PIN to change a safety register address (TP-48)', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      if (path === '/safety/roles') {
        return {
          eStopRegisterId: 'r1',
          deadmanRegisterId: 'r2',
          heartbeatRegisterId: 'r3',
          safeStateRegisterId: 'r-bound',
        };
      }
      return {
        ...layout,
        registers: [
          ...layout.registers,
          {
            id: 'estop',
            name: 'coil.eStop',
            address: 11,
            kind: 'coil',
            trended: false,
          },
          {
            id: 'r-bound',
            name: 'coil.customSafe',
            address: 7,
            kind: 'coil',
          },
        ],
      };
    });
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    await goConfigSection('Register maps');
    expect(screen.getAllByText('Safety').length).toBeGreaterThanOrEqual(5);
    expect(
      screen.getAllByText(/Changing this address retargets/).length,
    ).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save coil.eStop' }));
    await screen.findByText('Saved coil.eStop.');
    expect(patch).toHaveBeenCalledWith('/hmi/registers/estop', {
      address: 11,
      trended: false,
    });
    patch.mockClear();

    fireEvent.change(screen.getByLabelText('coil.eStop address'), {
      target: { value: '99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save coil.eStop' }));
    expect(
      await screen.findByText(
        'Reset PIN is required to change a safety register address',
      ),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('coil.eStop reset pin'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save coil.eStop' }));
    await screen.findByText('Saved coil.eStop.');
    expect(patch).toHaveBeenCalledWith('/hmi/registers/estop', {
      address: 99,
      trended: false,
      pin: '1234',
    });

    fireEvent.change(screen.getByLabelText('coil.up address'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('coil.up reset pin'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save coil.up' }));
    await screen.findByText('Saved coil.up.');
    expect(patch).toHaveBeenCalledWith(
      '/hmi/registers/r1',
      expect.objectContaining({ address: 42, pin: '1234' }),
    );
  });

  it('saves opc ua, a trend, an alarm, and safety roles', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') {
        return [
          {
            id: '1',
            label: 'sim',
            host: '127.0.0.1',
            port: 4840,
            unitId: 1,
            enabled: true,
            isSimulator: false,
            protocol: 'opcua',
          },
        ];
      }
      if (path === '/alarms/definitions') {
        return [
          {
            id: 'a1',
            name: 'Overload',
            severity: 'warning',
            compareOp: 'gt',
            threshold: 10,
            enabled: true,
            register: { id: 'r1', name: 'coil.up' },
          },
          {
            id: 'a2',
            name: 'Bare',
            severity: '',
            compareOp: 'eq',
            threshold: 1,
            enabled: false,
          },
        ];
      }
      if (path === '/safety/roles') {
        return {
          eStopRegisterId: 'r1',
          deadmanRegisterId: 'r2',
          heartbeatRegisterId: 'r3',
          safeStateRegisterId: 'r1',
        };
      }
      return {
        ...layout,
        registers: [
          ...layout.registers,
          {
            id: 'r4',
            name: 'holding.height',
            address: 4,
            kind: 'holding',
            trended: true,
            nodeId: 'ns=1;s=Height',
          },
        ],
      };
    });
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    const put = vi.spyOn(api, 'apiPut').mockResolvedValue({});
    const del = vi.spyOn(api, 'apiDelete').mockResolvedValue({});
    showAdminSection('plc');
    await screen.findByDisplayValue('sim');
    await goConfigSection('Safety roles');
    fireEvent.click(screen.getByLabelText('allow timed media motion'));
    fireEvent.click(screen.getByLabelText('allow timed media motion'));

    await goConfigSection('PLC connections');
    fireEvent.change(screen.getByLabelText('1 protocol'), {
      target: { value: 'modbus-tcp' },
    });
    fireEvent.change(screen.getByLabelText('1 protocol'), {
      target: { value: 'opcua' },
    });
    await saveSimConnection();

    await goConfigSection('Register maps');
    fireEvent.change(screen.getByLabelText('holding.height node'), {
      target: { value: 'ns=1;s=Moved' },
    });
    fireEvent.click(screen.getByLabelText('holding.height trend'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save holding.height' }),
    );
    await screen.findByText('Saved holding.height.');
    expect(patch).toHaveBeenCalledWith(
      '/hmi/registers/r4',
      expect.objectContaining({ trended: false, nodeId: 'ns=1;s=Moved' }),
    );

    await goConfigSection('Alarm definitions');
    fireEvent.change(screen.getByLabelText('alarm name'), {
      target: { value: 'Hot' },
    });
    fireEvent.change(screen.getByLabelText('alarm register'), {
      target: { value: 'r2' },
    });
    fireEvent.change(screen.getByLabelText('alarm operator'), {
      target: { value: 'lt' },
    });
    fireEvent.change(screen.getByLabelText('alarm threshold'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('alarm severity'), {
      target: { value: 'critical' },
    });
    fireEvent.click(screen.getByLabelText('alarm enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save alarm' }));
    await screen.findByText('Saved alarm.');
    expect(post).toHaveBeenCalledWith(
      '/alarms/definitions',
      expect.objectContaining({
        name: 'Hot',
        registerId: 'r2',
        compareOp: 'lt',
        threshold: 3,
        severity: 'critical',
      }),
    );
    expect(screen.getByLabelText('alarm name')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Overload' }));
    cancelDeleteDialog();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Overload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Overload' }));
    confirmDeleteDialog();
    await screen.findByText('Deleted alarm.');
    expect(del).toHaveBeenCalledWith('/alarms/definitions/a1');
    expect(screen.getByLabelText('alarm name')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Bare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save alarm' }));
    await screen.findByText('Saved alarm.');
    expect(patch).toHaveBeenCalledWith(
      '/alarms/definitions/a2',
      expect.objectContaining({ name: 'Bare' }),
    );
    expect(screen.getByLabelText('alarm name')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Bare' }));
    patch.mockRejectedValueOnce(new Error('alarm'));
    fireEvent.click(screen.getByRole('button', { name: 'Save alarm' }));
    await screen.findByText('alarm');
    del.mockRejectedValueOnce('nope');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bare' }));
    confirmDeleteDialog();
    await screen.findByText('Save failed');

    await goConfigSection('Safety roles');
    fireEvent.change(screen.getByLabelText('E-stop'), {
      target: { value: 'r1' },
    });
    fireEvent.change(screen.getByLabelText('Deadman'), {
      target: { value: 'r2' },
    });
    fireEvent.change(screen.getByLabelText('Heartbeat'), {
      target: { value: 'r3' },
    });
    fireEvent.change(screen.getByLabelText('Safe state'), {
      target: { value: '' },
    });
    put.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save safety roles' }));
    expect(
      await screen.findByText('Reset PIN is required to save safety roles'),
    ).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('safety roles reset pin'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save safety roles' }));
    await screen.findByText('Saved safety roles.');
    expect(put).toHaveBeenCalledWith(
      '/safety/roles',
      expect.objectContaining({ pin: '1234' }),
    );

    fireEvent.change(screen.getByLabelText('safety roles reset pin'), {
      target: { value: '1234' },
    });
    put.mockRejectedValueOnce(new Error('roles'));
    fireEvent.click(screen.getByRole('button', { name: 'Save safety roles' }));
    await screen.findByText('roles');
  });

  it('shows user management for admins', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      if (path === '/users' || path === '/media/codes') return [];
      if (path === '/alarms/definitions') return [];
      if (path === '/safety/roles') {
        return {
          eStopRegisterId: null,
          deadmanRegisterId: null,
          heartbeatRegisterId: null,
          safeStateRegisterId: null,
        };
      }
      return layout;
    });
    renderWithProviders(<AdminPage />, {
      route: '/admin?section=users',
      role: 'admin',
    });
    expect(
      await screen.findByRole('button', { name: /Add user/i }),
    ).toBeInTheDocument();
  });

  it('hides user management for supervisors', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      if (path === '/media/codes' || path === '/users') return [];
      if (path === '/alarms/definitions') return [];
      if (path === '/safety/roles') {
        return {
          eStopRegisterId: null,
          deadmanRegisterId: null,
          heartbeatRegisterId: null,
          safeStateRegisterId: null,
        };
      }
      return layout;
    });
    renderWithProviders(<AdminPage />, {
      route: '/admin?section=users',
      role: 'supervisor',
    });
    await screen.findByText(/These fields are saved in SQLite/);
    expect(screen.queryByText('Add user')).not.toBeInTheDocument();
  });

  it('renders empty sections when layout and plc queries fail', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (
        path === '/plc/connections' ||
        path === '/hmi/layout' ||
        path === '/alarms/definitions' ||
        path === '/safety/roles'
      ) {
        throw new Error('offline');
      }
      return [];
    });
    showAdminSection('plc');
    expect(
      await screen.findByText(/These fields are saved in SQLite/),
    ).toBeInTheDocument();
    expect(screen.getByText('Add a PLC')).toBeInTheDocument();
    await goConfigSection('Background');
    expect(screen.getByText('No active background')).toBeInTheDocument();
  });

  it('edits an alarm that has no register while the plant has none', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      if (path === '/alarms/definitions') {
        return [
          {
            id: 'a9',
            name: 'Lonely',
            register: null,
            compareOp: 'gt',
            threshold: 1,
            severity: '',
            enabled: true,
          },
        ];
      }
      if (path === '/hmi/layout') return { ...layout, registers: [] };
      if (path === '/safety/roles') return { roles: [] };
      return [];
    });
    vi.spyOn(api, 'apiPost').mockResolvedValue({});
    showAdminSection('alarms');
    await screen.findByRole('button', { name: 'Save alarm' });
    fireEvent.click(screen.getByRole('button', { name: 'Save alarm' }));
    expect(await screen.findByText('Saved alarm.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lonely' }));
    expect(screen.getByLabelText('alarm name')).toHaveValue('Lonely');
  });

  it('manages plant screens and uploads a graphic asset', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      if (path === '/plc/health') return plcHealthMock;
      if (path === '/plc/connections') return [];
      return {
        ...layout,
        background: {
          id: 'bg1',
          name: 'demo-crane',
          cssBackground: '',
          imageUrl: '',
        },
        backgrounds: [
          { id: 'bg1', name: 'demo-crane', active: true },
          { id: 'bg2', name: 'yard', active: false },
        ],
      };
    });
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    const upload = vi.spyOn(api, 'apiUpload').mockResolvedValue({
      imageUrl: '/hmi-assets/plant.svg',
    });
    await goConfigSection('Background');
    expect(screen.getByText('demo-crane')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await screen.findByText('Active screen updated.');
    expect(post).toHaveBeenCalledWith('/hmi/backgrounds/bg2/activate');

    fireEvent.change(screen.getByLabelText('new screen name'), {
      target: { value: 'dock' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add screen' }));
    await screen.findByText('Screen created.');
    expect(post).toHaveBeenCalledWith('/hmi/backgrounds', { name: 'dock' });

    const file = new File(['<svg/>'], 'plant.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('background upload'), {
      target: { files: [file] },
    });
    await screen.findByText('Uploaded plant graphic.');
    expect(upload).toHaveBeenCalledWith('/hmi/background/asset', file);

    upload.mockRejectedValueOnce(new Error('too big'));
    fireEvent.change(screen.getByLabelText('background upload'), {
      target: { files: [file] },
    });
    await screen.findByText('too big');

    post.mockRejectedValueOnce(new Error('dup'));
    fireEvent.change(screen.getByLabelText('new screen name'), {
      target: { value: 'yard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add screen' }));
    await screen.findByText('dup');

    post.mockRejectedValueOnce(new Error('busy'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await screen.findByText('busy');

    fireEvent.change(screen.getByLabelText('background upload'), {
      target: { files: [] },
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
