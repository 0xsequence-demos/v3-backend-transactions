import "dotenv/config";
import { Wallet, State, Signers, Envelope } from "@0xsequence/wallet-core";
import {
  Config,
  Context,
  Payload,
  Address as SequenceAddress,
} from "@0xsequence/wallet-primitives";
import { Relayer } from "@0xsequence/relayer";
import { Address, Hex, RpcTransport, Provider } from "ox";

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

  // Append access key to node URL for authentication
  const nodeUrl = baseNodeUrl.endsWith("/")
    ? `${baseNodeUrl}${projectAccessKey}`
    : `${baseNodeUrl}/${projectAccessKey}`;

  console.log("--- Sequence V3 Transaction Example ---");
  console.log(`Chain ID: ${chainId}`);

  // -------------------------------------------------------------------------
  // 2. Wallet Setup (Topology)
  // -------------------------------------------------------------------------

  // Initialize the EOA (External Owned Account) signer
  const signer = new Signers.Pk.Pk(privateKey);
  console.log(`Signer Address (EOA): ${signer.address}`);

  // Define the Single-Signer Topology (Weight 1 / Threshold 1)
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

  // Calculate the Counterfactual Address (Address exists before deployment)
  const context = Context.Rc4; // Use Release Candidate 4 (Standard V3 context)
  const walletAddress = SequenceAddress.from(walletConfig, context);
  console.log(`Smart Wallet Address: ${walletAddress}`);
  console.log(`Target Address:       ${targetAddress}`);

  // -------------------------------------------------------------------------
  // 3. Initialize Services
  // -------------------------------------------------------------------------

  // StateProvider: Communicates with Sequence directory/indexer
  const stateProvider = new State.Sequence.Provider(
    "https://keymachine.sequence.app"
  );

  // Provider: Standard JSON-RPC connection
  const baseProvider = Provider.from(RpcTransport.fromHttp(nodeUrl));
  // Note: Casting to 'any' bypasses strict type checks between 'ox' versions
  // but functionality is compatible for the wallet SDK.
  const provider = baseProvider as any;

  // Relayer: Dispatches transactions.
  // IMPORTANT: 'fetch' must be passed explicitly in Node.js environments.
  const relayer = new Relayer.RpcRelayer(
    relayerUrl,
    chainId,
    nodeUrl,
    fetch,
    projectAccessKey
  );

  const wallet = new Wallet(walletAddress, { stateProvider });

  // -------------------------------------------------------------------------
  // 4. Publish Configuration
  // -------------------------------------------------------------------------
  // This ensures the Sequence Indexer knows this address belongs to this configuration.
  try {
    await stateProvider.saveWallet(walletConfig, context);
    console.log("Wallet configuration published to directory.");
  } catch (e) {
    // Ignored safely: frequent occurrence if config is already published
    console.warn(
      "Note: Could not publish config (might already exist). Continuing..."
    );
  }

  // -------------------------------------------------------------------------
  // 5. Construct Transaction
  // -------------------------------------------------------------------------
  const tx: Payload.Call = {
    to: targetAddress,
    value: 0n, // 0 ETH
    data: "0x",
    // Gas Limit 0 tells the Relayer to estimate it automatically
    gasLimit: 0n,
    delegateCall: false,
    onlyFallback: false,
    behaviorOnError: "revert",
  };

  console.log("Preparing transaction...");

  // -------------------------------------------------------------------------
  // 6. Sign & Relay
  // -------------------------------------------------------------------------

  // Prepare: Fetches nonce and creates the "Envelope"
  const envelope = await wallet.prepareTransaction(provider, [tx]);

  // Sign: EOA signs the payload
  const signature = await signer.sign(walletAddress, chainId, envelope.payload);

  // Combine: Add signature to envelope
  const signedEnvelope = Envelope.toSigned(envelope, [
    {
      address: signer.address,
      signature: signature,
    },
  ]);

  console.log("Relaying transaction...");

  // Encode: Convert to EVM calldata
  const { to, data } = await wallet.buildTransaction(provider, signedEnvelope);

  // Send: Dispatch to Relayer
  const { opHash } = await relayer.relay(to, data, chainId);
  console.log(`Transaction Sent! OpHash: ${opHash}`);

  // -------------------------------------------------------------------------
  // 7. Wait for Confirmation
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
