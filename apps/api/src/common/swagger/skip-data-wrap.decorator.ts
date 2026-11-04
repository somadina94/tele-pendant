import { SetMetadata } from '@nestjs/common';

/** Skip `{ apiVersion, data }` wrapping (e.g. OAuth token responses for Swagger). */
export const SKIP_DATA_WRAP_KEY = 'skipDataWrap';

export const SkipDataWrap = () => SetMetadata(SKIP_DATA_WRAP_KEY, true);
