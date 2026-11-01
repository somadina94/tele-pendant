import { DataType, OPCUAServer, StatusCodes, Variant } from 'node-opcua';

const port = Number(process.env.OPCUA_PORT ?? 4840);

const coils: Record<string, boolean> = {
  HoistUp: false,
  HoistDown: false,
  TrolleyLeft: false,
  TrolleyRight: false,
  BridgeFwd: false,
  BridgeRev: false,
  Deadman: false,
  EStop: false,
  MotorRunning: false,
  Fault: false,
  CommsOk: true,
};

const numbers: Record<string, number> = {
  HoistHeightMm: 2050,
  LoadKg: 0,
  SpeedPct: 0,
  Heartbeat: 0,
  SafeState: 0,
};

async function main(): Promise<void> {
  const server = new OPCUAServer({
    port,
    resourcePath: '/tele-pendant',
    buildInfo: {
      productName: 'tele-pendant-opcua-sim',
      buildNumber: '1',
      buildDate: new Date(),
    },
  });
  await server.initialize();
  const addressSpace = server.engine.addressSpace;
  if (!addressSpace) throw new Error('OPC UA address space missing');
  const namespace = addressSpace.getOwnNamespace();
  const crane = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'Crane',
  });

  for (const name of Object.keys(coils)) {
    namespace.addVariable({
      componentOf: crane,
      browseName: name,
      nodeId: `s=${name}`,
      dataType: 'Boolean',
      value: {
        get: () =>
          new Variant({ dataType: DataType.Boolean, value: coils[name] }),
        set: (variant: Variant) => {
          coils[name] = Boolean(variant.value);
          return StatusCodes.Good;
        },
      },
    });
  }

  for (const name of Object.keys(numbers)) {
    namespace.addVariable({
      componentOf: crane,
      browseName: name,
      nodeId: `s=${name}`,
      dataType: 'Double',
      value: {
        get: () =>
          new Variant({ dataType: DataType.Double, value: numbers[name] }),
        set: (variant: Variant) => {
          numbers[name] = Number(variant.value) || 0;
          return StatusCodes.Good;
        },
      },
    });
  }

  setInterval(() => {
    if (coils.EStop || !coils.Deadman) return;
    if (coils.HoistUp)
      numbers.HoistHeightMm = Math.min(5000, numbers.HoistHeightMm + 25);
    if (coils.HoistDown)
      numbers.HoistHeightMm = Math.max(0, numbers.HoistHeightMm - 25);
    numbers.LoadKg = coils.HoistUp || coils.HoistDown ? 120 : 0;
  }, 250);

  await server.start();
  console.log(`OPC UA crane sim ${server.getEndpointUrl()}`);
}

void main();
