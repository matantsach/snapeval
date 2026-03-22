/**
 * Shared lazy CopilotClient singleton.
 */

// We store the client as `any` to avoid a static import until the module is
// confirmed to export the expected shape at runtime.
let clientInstance: any = null;
let clientStarted = false;

export async function getClient(): Promise<any> {
  if (clientInstance && clientStarted) return clientInstance;

  let sdk: any;
  try {
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

  // Suppress ExperimentalWarning (e.g., SQLite) in the spawned CLI subprocess
  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-warnings'].filter(Boolean).join(' ') };
  clientInstance = new CopilotClient({ logLevel: 'none', env });
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

