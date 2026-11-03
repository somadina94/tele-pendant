import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

describe('AdminPage', () => {
  it('renders connections registers and cells', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
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
      return layout;
    });
    renderWithProviders(<AdminPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/simulator/).length).toBeGreaterThan(0),
    );
    expect(screen.getByDisplayValue('sim')).toBeInTheDocument();
    expect(screen.getAllByText(/coil\.up/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/coil\.fb/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/coil\.st/).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Up')).toBeInTheDocument();
    expect(screen.getByText('No active background')).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it('saves a PLC, a register, and a new connection', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
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
      return layout;
    });
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    renderWithProviders(<AdminPage />);
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
    fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
    await screen.findByText('Saved and connecting.');
    expect(patch).toHaveBeenCalledWith('/plc/connections/1', {
      label: 'sim',
      host: '10.1.1.1',
      port: 502,
      unitId: 2,
      enabled: true,
      protocol: 'modbus-tcp',
    });

    fireEvent.click(screen.getByLabelText('1 use'));
    fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
    await screen.findByText('Saved.');

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
    fireEvent.click(screen.getByLabelText('new use'));
    fireEvent.click(screen.getByRole('button', { name: 'Add PLC' }));
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
      return layout;
    });
    vi.spyOn(api, 'apiPatch')
      .mockRejectedValueOnce(new Error('no route'))
      .mockRejectedValueOnce('x');
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('duplicate'));
    renderWithProviders(<AdminPage />);
    await screen.findByDisplayValue('sim');

    fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
    await screen.findByText('no route');

    fireEvent.click(screen.getByRole('button', { name: 'Save coil.up' }));
    await screen.findByText('Save failed');

    fireEvent.click(screen.getByRole('button', { name: 'Add PLC' }));
    await screen.findByText('duplicate');
  });

  it('saves cells, labels, and the background', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
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
    renderWithProviders(<AdminPage />);
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Up' }));
    await screen.findByText('Saved Lift.');
    expect(patch).toHaveBeenCalledWith(
      '/hmi/cells/c1',
      expect.objectContaining({ label: 'Lift', row: 1, col: 2 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Lift' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/cells/c1'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Spare' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add cell' }));
    await screen.findByText('Saved Extra.');
    expect(post).toHaveBeenCalledWith(
      '/hmi/cells',
      expect.objectContaining({ label: 'Extra' }),
    );

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

    fireEvent.click(screen.getByRole('button', { name: 'Delete Load' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete Load' }));
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
    renderWithProviders(<AdminPage />);
    expect(await screen.findByDisplayValue('bay')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete cell' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/cells/blank'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/hmi/overlays/o9'));
  });

  it('saves opc ua, a trend, an alarm, and safety roles', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
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
    renderWithProviders(<AdminPage />);
    await screen.findByDisplayValue('sim');

    fireEvent.change(screen.getByLabelText('1 protocol'), {
      target: { value: 'modbus-tcp' },
    });
    fireEvent.change(screen.getByLabelText('1 protocol'), {
      target: { value: 'opcua' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save sim' }));
    await screen.findByText('Saved and connecting.');

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
    expect(post).toHaveBeenCalledWith('/alarms/definitions', {
      name: 'Hot',
      registerId: 'r2',
      compareOp: 'lt',
      threshold: 3,
      severity: 'critical',
      enabled: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Overload' }));
    await screen.findByText('Deleted alarm.');
    expect(del).toHaveBeenCalledWith('/alarms/definitions/a1');

    post.mockRejectedValueOnce(new Error('alarm'));
    fireEvent.click(screen.getByRole('button', { name: 'Save alarm' }));
    await screen.findByText('alarm');
    del.mockRejectedValueOnce('nope');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Overload' }));
    await screen.findByText('Save failed');

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
    fireEvent.click(screen.getByRole('button', { name: 'Save safety roles' }));
    await screen.findByText('Saved safety roles.');
    expect(put).toHaveBeenCalled();

    put.mockRejectedValueOnce(new Error('roles'));
    fireEvent.click(screen.getByRole('button', { name: 'Save safety roles' }));
    await screen.findByText('roles');
  });

  it('renders empty sections when layout and plc queries fail', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
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
    renderWithProviders(<AdminPage />);
    expect(
      await screen.findByText(/These fields are saved in SQLite/),
    ).toBeInTheDocument();
    expect(screen.getByText('Add a PLC')).toBeInTheDocument();
    expect(screen.getByText('No active background')).toBeInTheDocument();
  });
});
