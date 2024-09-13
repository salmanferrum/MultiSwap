const Web3 = require('web3');
import addresses from "../constants/addresses_test.json";

// Set up the RPC URLs for the source and target networks
const sourceNetworkProviderUrl = process.env.ARBITRUM_RPC;  // Source network RPC URL
const targetNetworkProviderUrl = process.env.BASE_RPC;  // Target network RPC URL

const targetNetwork = "base";
const thisNetwork = hre.network.name;
const targetNetworkInfo = addresses.networks[targetNetwork];
const currentNetworkInfo = addresses.networks[thisNetwork];
const sourceWeb3 = new Web3(new Web3.providers.HttpProvider(sourceNetworkProviderUrl));
const targetWeb3 = new Web3(new Web3.providers.HttpProvider(targetNetworkProviderUrl));

// Enter the swapHash for which we need to confirm if the withdrawal is successful
const swapHash = '0xaf1634f8d7ae2072e00928ac8820e4cf0439487ff3d85a2d13a6ea3f675f8565';

async function fetchOFTSentEvent() {
    const receipt = await sourceWeb3.eth.getTransactionReceipt(swapHash);

    if (!receipt || !receipt.logs) {
        console.error('Transaction receipt or logs not found');
        return null;
    }

    const oftsentEventSignature = '0x85496b760a4b7f8d66384b9df21b381f5d1b1e79f229a47aaf4c232edc2fe59a';
    
    // Find the OFTSent event from the logs
    const oftsentLog = receipt.logs.find(log => log.topics[0] === oftsentEventSignature);

    if (!oftsentLog) {
        console.error('OFTSent event not found in the transaction');
        return null;
    }

    // Decode the event data
    const decodedLog = sourceWeb3.eth.abi.decodeLog(
        [
            { type: 'bytes32', name: 'guid', indexed: true },
            { type: 'uint32', name: 'dstEid', indexed: false },
            { type: 'address', name: 'fromAddress', indexed: true },
            { type: 'uint256', name: 'amountSentLD', indexed: false },
            { type: 'uint256', name: 'amountReceivedLD', indexed: false }
        ],
        oftsentLog.data,
        oftsentLog.topics.slice(1) // Remove the event topic
    );

    console.log("For the Stargate Swap hash", swapHash);
    return decodedLog[0];
}

// Function to fetch the OFTReceived event from the target network using guid
async function fetchOFTReceivedEvent(guid) {

    const oftReceivedEventSignature = '0xefed6d3500546b29533b128a29e3a94d70788727f0507505ac12eaf2e578fd9c';

    // Create a filter for the OFTReceived event based on the guid
    const filter = {
        fromBlock: 0,  // Adjust this based on when the transaction is expected
        toBlock: 'latest',
        topics: [
            oftReceivedEventSignature, // Event signature
            guid, // guid (indexed parameter)
            null  // toAddress (indexed parameter)
        ]
    };

    const logs = await targetWeb3.eth.getPastLogs(filter);
    return logs[0].transactionHash;
}

// Main function to track the swap and find both events
async function trackStargateSwapTransaction() {
    try {
        // Fetch OFTSent event from the source network
        const oftsentEventDetails = await fetchOFTSentEvent();

        if (oftsentEventDetails) {
            // Fetch OFTReceived event from the target network using the guid
            const oftReceivedEventDetails = await fetchOFTReceivedEvent(oftsentEventDetails);

            if (oftReceivedEventDetails) {
                console.log("Stargate withdrawal is successful, Withdrawal hash:", oftReceivedEventDetails);
            }
        }
    } catch (error) {
        console.error("Error tracking swap transaction:", error);
    }
}

trackStargateSwapTransaction();
