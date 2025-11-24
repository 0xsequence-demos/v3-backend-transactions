# Sequence V3 Backend Transaction Example

This project demonstrates how to control a **Sequence V3 Smart Wallet** using a standard Private Key (EOA) in a Node.js environment. It covers counterfactual address derivation, configuration publishing, and relaying transactions.

## Prerequisites

- Node.js v18+
- A **Project Access Key** from [Sequence Builder](https://sequence.build)

## ⛽ Gas Fees & Sponsorship

This example is configured for **Arbitrum Sepolia** (Testnet).

**You do not need Testnet ETH.** The Sequence Relayer automatically sponsors gas fees on testnets, so you can run this script immediately without funding the Smart Wallet.

## Setup

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Copy the example file and fill in your details.

    ```bash
    cp .env.example .env
    ```

    **Required `.env` variables:**

    - `PROJECT_ACCESS_KEY`: From Sequence Builder.
    - `PRIVATE_KEY`: Your EOA private key (starts with `0x...`).
    - `TARGET_ADDRESS`: Where you want to send the transaction.
    - `CHAIN_ID`: `421614` (Arbitrum Sepolia).
    - `NODE_URL`: `https://nodes.sequence.app/arbitrum-sepolia`
    - `RELAYER_URL`: `https://arbitrum-sepolia-relayer.sequence.app`
    - `EXPLORER_URL`: `https://sepolia.arbiscan.io`

## Usage

Run the script:

```bash
npm run dev
```
