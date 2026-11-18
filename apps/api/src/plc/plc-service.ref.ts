import { forwardRef } from '@nestjs/common';
import { PlcService } from './providers/plc.service';

/** Nest reads this after PlcModule has finished exporting. */
export const plcServiceRef = forwardRef(() => PlcService);
