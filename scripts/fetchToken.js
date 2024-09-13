const Web3 = require('web3');
const fs = require('fs');
const aggregatorAbi = require("./abi/1inch.json");

const ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";
const CONTRACT_ADDRESS = "0x111111125421ca6dc452d289314280a0f8842a65";
const TOKEN_X_ADDRESS = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9".toLowerCase(); // USDT address
const SECONDS_PER_BLOCK = 12;
const PAST_FIVE_DAYS_IN_BLOCKS = Math.floor((30 * 24 * 60 * 60) / SECONDS_PER_BLOCK);
const BLOCK_CHUNK_SIZE = 20000;

const web3 = new Web3(new Web3.providers.HttpProvider(ARBITRUM_RPC_URL));
const aggregatorContract = new web3.eth.Contract(aggregatorAbi, CONTRACT_ADDRESS);

const swapFunctionSelectors = [
  "0xd2d374e5", "0xc4d652af", "0xa76dfc3b", "0x89af926a", "0x188ac35d", "0x175accdc", "0x0f449d71",
  "0x493189f0", "0xcc713a04", "0x56a75868", "0x9fda64bd", "0xf497df75", "0x07ed2379", "0x83800a8e",
  "0x8770ba91", "0x19367472", "0xe2c95c82", "0xea76dddf", "0xf7a70056"
];

// Fetch events in chunks
async function getEventsInChunks(contract, eventName, fromBlock, toBlock) {
  let events = [];
  while (fromBlock <= toBlock) {
    const endBlock = Math.min(fromBlock + BLOCK_CHUNK_SIZE, toBlock);
    try {
      const contractEvents = await contract.getPastEvents(eventName, {
        fromBlock: fromBlock,
        toBlock: endBlock,
      });
      events = events.concat(contractEvents);
    } catch (error) {
      console.error(`Error fetching ${eventName} events from block ${fromBlock} to ${endBlock}:`, error);
    }
    fromBlock = endBlock + 1;
  }
  return events;
}

// Fetch swap transactions and filter based on TokenX (USDT)
async function getSwapTransactionsForTokenX(fromBlock, toBlock) {
  const latestBlock = await web3.eth.getBlockNumber();
  const matchingTransactions = [];

  for (let block = fromBlock; block <= toBlock; block += BLOCK_CHUNK_SIZE) {
    const endBlock = Math.min(block + BLOCK_CHUNK_SIZE, latestBlock);
    const blockData = await web3.eth.getPastLogs({
      fromBlock: block,
      toBlock: endBlock,
      address: CONTRACT_ADDRESS,
    });

    for (const log of blockData) {
      const transaction = await web3.eth.getTransaction(log.transactionHash);
      const inputData = transaction.input.substring(0, 10);

      if (swapFunctionSelectors.includes(inputData)) {
        const receipt = await web3.eth.getTransactionReceipt(log.transactionHash);

        // Filter transactions that involve TokenX (USDT)
        const tokenXInvolved = receipt.logs.some(log =>
          log.address.toLowerCase() === TOKEN_X_ADDRESS || 
          (log.topics.includes(web3.utils.keccak256('Transfer(address,address,uint256)')) &&
           (log.topics[2] && web3.utils.toChecksumAddress('0x' + log.topics[2].slice(26)).toLowerCase() === TOKEN_X_ADDRESS))
        );

        if (tokenXInvolved) {
          matchingTransactions.push({
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            inputData,
          });
        }
      }
    }
  }

  return matchingTransactions;
}

// Main function to fetch and filter swap-related transactions
async function getEventsForToken() {
  const latestBlock = await web3.eth.getBlockNumber();
  const fromBlock = Math.floor(latestBlock - PAST_FIVE_DAYS_IN_BLOCKS);

  console.log(`Fetching swap-related transactions from block ${fromBlock} to ${latestBlock}`);

  // Fetch all swap-related transactions involving TokenX (USDT)
  const swapEvents = await getSwapTransactionsForTokenX(fromBlock, latestBlock);
  console.log(`Total swap-related transactions found involving token ${TOKEN_X_ADDRESS}: ${swapEvents.length}`);

  const eventsWithDetails = swapEvents.map(event => ({
    eventType: "Swap",
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    functionSelector: event.inputData,
  }));

  fs.writeFileSync("token_swap_transactions.txt", JSON.stringify(eventsWithDetails, null, 2));
  console.log("Filtered swap transactions with token involvement saved to token_x_swap_transactions.txt");
}

getEventsForToken().catch(console.error);
