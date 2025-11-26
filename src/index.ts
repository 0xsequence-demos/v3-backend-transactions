import "dotenv/config";
import { Wallet, State, Signers, Envelope } from "@0xsequence/wallet-core";
import { Config, Context, Payload } from "@0xsequence/wallet-primitives";
import { Relayer } from "@0xsequence/relayer";
import { Address, RpcTransport, Provider } from "ox";

// Helper to ensure env vars are present
const requireEnv = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
};

async function main() {
  // -------------------------------------------------------------------------
  // 1. Configuration
  // -------------------------------------------------------------------------
  const projectAccessKey = requireEnv("PROJECT_ACCESS_KEY");
  const privateKey = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const chainId = parseInt(requireEnv("CHAIN_ID"), 10);
  const targetAddress = requireEnv("TARGET_ADDRESS") as Address.Address;

  const baseNodeUrl = requireEnv("NODE_URL");
  const relayerUrl = requireEnv("RELAYER_URL");
  const explorerUrl = requireEnv("EXPLORER_URL");

  const nodeUrl = baseNodeUrl.endsWith("/")
    ? `${baseNodeUrl}${projectAccessKey}`
    : `${baseNodeUrl}/${projectAccessKey}`;

  console.log("--- Sequence V3 Backend Transaction Example ---");
  console.log(`Chain ID: ${chainId}`);

  // -------------------------------------------------------------------------
  // 2. Setup Signer & Services
  // -------------------------------------------------------------------------
  const signer = new Signers.Pk.Pk(privateKey);
  console.log(`Signer Address (EOA): ${signer.address}`);

  // Services
  const stateProvider = new State.Sequence.Provider(
    "https://keymachine.sequence.app"
  );
  const baseProvider = Provider.from(RpcTransport.fromHttp(nodeUrl));
  const provider = baseProvider as any; // Cast to bypass strict type check
  const relayer = new Relayer.RpcRelayer(
    relayerUrl,
    chainId,
    nodeUrl,
    fetch,
    projectAccessKey
  );

  // -------------------------------------------------------------------------
  // 3. Initialize Wallet
  // -------------------------------------------------------------------------

  const topology: Config.Topology = {
    type: "signer",
    address: signer.address,
    weight: 1n,
  };

  const walletConfig: Config.Config = {
    threshold: 1n,
    checkpoint: 0n,
    topology: topology,
  };

  // Wallet.fromConfiguration handles:
  // 1. Calculating the address
  // 2. Publishing the config (using stateProvider from options)
  // 3. Creating the Wallet instance
  const wallet = await Wallet.fromConfiguration(walletConfig, {
    context: Context.Rc4,
    stateProvider,
  });

  console.log(`Smart Wallet Address: ${wallet.address}`);
  console.log("Wallet configuration synced.");

  // -------------------------------------------------------------------------
  // 4. Construct & Send Transaction
  // -------------------------------------------------------------------------
  const tx: Payload.Call = {
    to: targetAddress,
    value: 0n,
    data: "0x",
    gasLimit: 0n, // Let Relayer estimate
    delegateCall: false,
    onlyFallback: false,
    behaviorOnError: "revert",
  };

  console.log("Preparing transaction...");

  // Prepare & Sign
  const envelope = await wallet.prepareTransaction(provider, [tx]);
  const signature = await signer.sign(
    wallet.address,
    chainId,
    envelope.payload
  );
  const signedEnvelope = Envelope.toSigned(envelope, [
    {
      address: signer.address,
      signature: signature,
    },
  ]);

  console.log("Relaying transaction...");

  // Build & Relay
  const { to, data } = await wallet.buildTransaction(provider, signedEnvelope);
  const { opHash } = await relayer.relay(to, data, chainId);

  console.log(`Transaction Sent! OpHash: ${opHash}`);

  // -------------------------------------------------------------------------
  // 5. Wait for Confirmation
  // -------------------------------------------------------------------------
  console.log("Waiting for confirmation...");
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  while (true) {
    const status = await relayer.status(opHash, chainId);
    if (status.status === "confirmed") {
      console.log(`\n✅ Transaction Confirmed!`);
      console.log(`Tx Hash:  ${status.transactionHash}`);
      console.log(`Explorer: ${explorerUrl}/tx/${status.transactionHash}\n`);
      break;
    } else if (status.status === "failed") {
      console.error("\n❌ Transaction Failed:", status.reason);
      break;
    }
    process.stdout.write(".");
    await wait(1500);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
