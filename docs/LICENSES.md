# Third-party licences

The `@tele-pendant/*` packages in this repository are the delivered project. They are private. They are not published under an open-source licence.

The tables below are the direct dependencies declared in the workspace `package.json` files. Versions are the ones resolved in `pnpm-lock.yaml`. After `pnpm install`, each package keeps its own licence text under `node_modules`.

The lockfile also installs their dependencies. Those stay under the licence of each package. The last section names the ones whose licence is not a plain MIT, Apache-2.0, BSD, or ISC grant.

## Production libraries

| Package | Version | Licence |
| --- | --- | --- |
| @babel/core | 7.29.13 | MIT |
| @babel/plugin-transform-react-jsx | 7.29.7 | MIT |
| @babel/runtime | 7.29.13 | MIT |
| @nestjs/common | 11.2.8 | MIT |
| @nestjs/config | 4.0.4 | MIT |
| @nestjs/core | 11.2.8 | MIT |
| @nestjs/jwt | 11.0.2 | MIT |
| @nestjs/passport | 11.0.5 | MIT |
| @nestjs/platform-express | 11.2.8 | MIT |
| @nestjs/platform-socket.io | 11.2.8 | MIT |
| @nestjs/swagger | 11.4.8 | MIT |
| @nestjs/throttler | 6.7.1 | MIT |
| @nestjs/typeorm | 11.0.3 | MIT |
| @nestjs/websockets | 11.2.8 | MIT |
| @radix-ui/react-accordion | 1.3.1 | MIT |
| @radix-ui/react-alert-dialog | 1.2.1 | MIT |
| @radix-ui/react-avatar | 1.3.1 | MIT |
| @radix-ui/react-checkbox | 1.4.1 | MIT |
| @radix-ui/react-collapsible | 1.2.1 | MIT |
| @radix-ui/react-dialog | 1.3.1 | MIT |
| @radix-ui/react-dropdown-menu | 2.2.1 | MIT |
| @radix-ui/react-label | 2.1.17 | MIT |
| @radix-ui/react-popover | 1.3.1 | MIT |
| @radix-ui/react-scroll-area | 1.4.0 | MIT |
| @radix-ui/react-select | 2.4.1 | MIT |
| @radix-ui/react-separator | 1.2.0 | MIT |
| @radix-ui/react-slot | 1.5.0 | MIT |
| @radix-ui/react-switch | 1.4.1 | MIT |
| @radix-ui/react-tabs | 1.2.1 | MIT |
| @radix-ui/react-tooltip | 1.4.1 | MIT |
| @react-native-async-storage/async-storage | 2.2.0 | MIT |
| @react-navigation/bottom-tabs | 7.21.0 | MIT |
| @react-navigation/drawer | 7.14.4 | MIT |
| @react-navigation/native | 7.5.1 | MIT |
| @tanstack/react-query | 5.107.1 | MIT |
| @zxing/browser | 0.2.1 | MIT |
| bcrypt | 6.0.0 | MIT |
| better-sqlite3 | 12.11.1 | MIT |
| class-transformer | 0.5.1 | MIT |
| class-validator | 0.15.1 | MIT |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| cn | 0.5.2 | MIT |
| cookie-parser | 1.4.7 | MIT |
| date-fns | 4.4.0 | MIT |
| expo | 58.0.23 | MIT |
| expo-camera | 58.0.14 | MIT |
| expo-constants | 58.0.15 | MIT |
| expo-haptics | 58.0.7 | MIT |
| expo-secure-store | 58.0.2 | MIT |
| expo-speech-recognition | 58.0.1 | MIT |
| expo-status-bar | 58.0.4 | MIT |
| expo-updates | 58.0.21 | MIT |
| framer-motion | 14.10.1 | MIT |
| helmet | 8.3.0 | MIT |
| joi | 18.3.2 | BSD-3-Clause |
| jpeg-js | 0.4.4 | BSD-3-Clause |
| jsmodbus | 5.0.0 | MIT |
| lucide-react | 1.70.0 | ISC |
| lucide-react-native | 1.70.0 | ISC |
| nativewind | 4.2.7 | MIT |
| node-opcua | 2.187.25 | MIT |
| nodemailer | 10.4.0 | MIT-0 |
| passport | 0.7.0 | MIT |
| passport-jwt | 4.0.1 | MIT |
| pngjs | 7.0.0 | MIT |
| radix-ui | 1.8.1 | MIT |
| react | 19.3.1 (web), 19.3.0 (mobile) | MIT |
| react-day-picker | 10.0.2 | MIT |
| react-dom | 19.3.1 | MIT |
| react-native | 0.88.1 | MIT |
| react-native-css-interop | 0.2.7 | MIT |
| react-native-drawer-layout | 4.2.12 | MIT |
| react-native-gesture-handler | 3.3.0 | MIT |
| react-native-reanimated | 4.7.1 | MIT |
| react-native-safe-area-context | 5.11.1 | MIT |
| react-native-screens | 4.30.1 | MIT |
| react-native-svg | 15.16.0 | MIT |
| react-native-worklets | 0.13.0 | MIT |
| react-router-dom | 7.18.5 | MIT |
| reflect-metadata | 0.2.2 | Apache-2.0 |
| rxjs | 7.8.2 | Apache-2.0 |
| socket.io | 4.8.4 | MIT |
| socket.io-client | 4.8.4 | MIT |
| sonner | 2.0.8 | MIT |
| tailwind-merge | 3.7.0 | MIT |
| tailwindcss | 3.4.19 | MIT |
| typeorm | 0.3.31 | MIT |

The assistant answers from the local manual index. `@cursor/sdk` is not a dependency of this delivery, so a commercial build does not accept the Cursor Terms of Service. If someone installs that package later, its `LICENSE.md` says use is subject to https://cursor.com/terms-of-service. That is not an open-source licence.

## Development tools

| Package | Version | Licence |
| --- | --- | --- |
| @compodoc/compodoc | 2.0.0 | MIT |
| @eslint/eslintrc | 3.3.7 | MIT |
| @eslint/js | 10.0.1 | MIT |
| @nestjs/cli | 11.0.24 | MIT |
| @nestjs/schematics | 11.1.0 | MIT |
| @nestjs/testing | 11.2.8 | MIT |
| @playwright/test | 1.65.0 | Apache-2.0 |
| @tailwindcss/vite | 4.3.5 | MIT |
| @testing-library/jest-dom | 7.0.1 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| @testing-library/user-event | 14.6.8 | MIT |
| @types/bcrypt | 6.0.0 | MIT |
| @types/better-sqlite3 | 9.6.0 | MIT |
| @types/cookie-parser | 1.4.10 | MIT |
| @types/express | 5.0.6 | MIT |
| @types/jest | 30.0.0 | MIT |
| @types/node | 26.6.6 | MIT |
| @types/nodemailer | 8.0.2 | MIT |
| @types/passport-jwt | 4.0.1 | MIT |
| @types/pngjs | 6.0.5 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/supertest | 7.2.1 | MIT |
| @types/ws | 8.18.2 | MIT |
| @vitejs/plugin-react | 6.2.1 | MIT |
| @vitest/coverage-v8 | 5.1.0 | MIT |
| babel-preset-expo | 58.0.24 | MIT |
| eslint | 10.14.0 | MIT |
| eslint-config-prettier | 10.1.8 | MIT |
| eslint-plugin-prettier | 5.5.7 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| eslint-plugin-react-refresh | 0.5.7 | MIT |
| globals | 17.14.0 | MIT |
| httpyac | 6.16.7 | MIT |
| jest | 30.5.2 | MIT |
| jsdom | 31.0.0 | MIT |
| prettier | 3.9.10 | MIT |
| supertest | 7.3.2 | MIT |
| tailwindcss | 4.3.5 | MIT |
| ts-jest | 29.4.15 | MIT |
| ts-node | 10.9.2 | MIT |
| tsconfig-paths | 4.2.0 | MIT |
| tsx | 4.23.15 | MIT |
| turbo | 2.11.10 | MIT |
| tw-animate-css | 1.4.0 | MIT |
| typescript | 6.0.3 | Apache-2.0 |
| typescript-eslint | 8.72.1 | MIT |
| vite | 8.3.6 | MIT |
| vitest | 5.1.0 | MIT |

## Other licences pulled in by those packages

These are not direct dependencies. They are in the lockfile because another package depends on them.

| Package | Version | Licence |
| --- | --- | --- |
| argparse | 3.0.4 | PSF-2.0 |
| caniuse-lite | 1.0.30001820 and 1.0.30001823 | CC-BY-4.0 |
| dequeue | 1.0.5 | BSD-2-Clause (stated in the package LICENSE file, not in package.json) |
| humanize | 0.0.9 | MIT (stated in the package LICENSE file, not in package.json) |
| node-forge | 1.4.2 and 1.4.3 | BSD-3-Clause OR GPL-2.0 |

`node-forge` offers either licence. This delivery uses the BSD-3-Clause option.

`caniuse-lite` is CC-BY-4.0. It carries browser-support data from caniuse.com, used by the web build tools. Attribution: Can I Use (https://caniuse.com). The licence is https://creativecommons.org/licenses/by/4.0/.

`argparse` is under the Python Software Foundation Licence, version 2 (PSF-2.0). The text is the historical PSF licence shipped with that package: https://docs.python.org/3/license.html. It is not the MIT licence.

`callsite` 1.0.0, `pause` 0.0.1, and `precond` 0.2.3 ship no licence field and no LICENSE file. This delivery does not treat them as MIT, BSD, or Apache. No grant text was included with those packages, so their terms are unstated. Do not assume a right to relicense them.

Other transitive packages are MIT, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, or a dual grant of those (for example Apache-2.0 OR MIT).
