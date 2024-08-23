import { ethers } from "ethers";
import dotenv from 'dotenv'
dotenv.config()

const rpcUrl = process.env.ARBISCAN_API_KEY! // Arbitrum

// Create a provider
const provider = new ethers.JsonRpcProvider(rpcUrl);
const privateKey = process.env.PRIVATE_KEY0!;
const wallet = new ethers.Wallet(privateKey, provider);

// The raw transaction data
const rawTx = {
    to: "0xF3EEA34C9F33d8BA633C938c2ac17cD4B4F25D50", // Address of the receiver or contract
    value: 200000000000000, // Amount to send (for ETH transfers)
    data: "", // Encoded contract call or empty for plain ETH transfer
    gasLimit: 1000000, // Maximum gas to spend
    gasPrice: 20000000, // Gas price in wei
};

console.log("Using wallet address: " + wallet.address);

async function sendTransaction() {
    try {
        console.log("Sending transaction...");
        const txResponse = await wallet.sendTransaction(rawTx);
        console.log("Transaction sent! Hash:", txResponse.hash);

        // Wait for the transaction to be mined
        const receipt = await txResponse.wait();
        console.log("Transaction confirmed in block:", receipt!.blockNumber);
    } catch (error) {
        console.error("Error sending transaction:", error);
    }
}

sendTransaction();
