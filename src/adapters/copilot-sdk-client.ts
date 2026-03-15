/**
 * Shared lazy CopilotClient singleton.
 *
 * Both CopilotSDKAdapter (SkillAdapter) and CopilotSDKInference
 * (InferenceAdapter) share a single client to avoid spawning
 * multiple CLI server processes.
 *
 * The SDK is dynamically imported so that users who don't install
 * @github/copilot-sdk pay no cost.
 */

// We store the client as `any` to avoid a hard import dependency
// on @github/copilot-sdk.  The module may not be installed.
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

  clientInstance = new CopilotClient();
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
  try {
    require.resolve('@github/copilot-sdk');
    return true;
  } catch {
    return false;
  }
}
