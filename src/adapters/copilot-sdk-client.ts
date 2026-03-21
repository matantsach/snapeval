/**
 * Shared lazy CopilotClient singleton.
 *
 * The SDK is dynamically imported so that users who don't install
 * @github/copilot-sdk pay no cost.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// We store the client as `any` to avoid a hard import dependency
// on @github/copilot-sdk.  The module may not be installed.
let clientInstance: any = null;
let clientStarted = false;

export async function getClient(): Promise<any> {
  if (clientInstance && clientStarted) return clientInstance;

  let sdk: any;
  try {
    // @ts-ignore — module may not be installed (optional peer dep)
    sdk = await import('@github/copilot-sdk');
  } catch {
    throw new Error(
      'CopilotSDK adapter requires @github/copilot-sdk. Install it with: npm install @github/copilot-sdk'
    );
  }

  const CopilotClient = sdk.CopilotClient ?? sdk.default?.CopilotClient;
  if (!CopilotClient) {
    throw new Error(
      'Could not find CopilotClient export in @github/copilot-sdk. The package may have changed its API.'
    );
  }

  clientInstance = new CopilotClient({ logLevel: 'none' });
  await clientInstance.start();
  clientStarted = true;
  return clientInstance;
}

export async function stopClient(): Promise<void> {
  if (clientInstance && clientStarted) {
    await clientInstance.stop();
    clientStarted = false;
    clientInstance = null;
  }
}

export function isSDKInstalled(): boolean {
  // Walk up from cwd looking for node_modules/@github/copilot-sdk.
  // This avoids createRequire/import issues across ESM/CJS contexts.
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, 'node_modules', '@github', 'copilot-sdk', 'package.json');
    if (fs.existsSync(candidate)) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}
