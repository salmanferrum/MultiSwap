import "@nomicfoundation/hardhat-toolbox"
import "@openzeppelin/hardhat-upgrades"
import 'solidity-coverage'
import 'hardhat-contract-sizer'
import { HardhatUserConfig } from "hardhat/types"
import dotenv from 'dotenv'
dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  // zksolc: {
  //   version: "1.4.0",
  //   settings: {
  //     isSystem: true,
  //     optimizer: {
  //       enabled: true, // optional. True by default
  //       mode: '3', // optional. 3 by default, z to optimize bytecode size
  //       fallback_to_optimizing_for_size: true, // optional. Try to recompile with optimizer mode "z" if the bytecode is too large
  //     },
  //   },
  // },
  networks: {
    localhost: {
      chainId: 31337,
      // accounts: [process.env.PRIVATE_KEY0!],
      // forking: {
      //   url: "",
      //   blockNumber: 5282922
      // },
    },
    hardhat: {
      chainId: 31337,
      // forking: {
      //   // blockNumber: 5282922
      // },
    },
    polygon: {
      url: process.env.POLYGON_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    binance: {
      url: process.env.BSC_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    optimism: {
      url: process.env.OPTIMISM_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    ethereum: {
      url: process.env.ETHEREUM_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    scroll: {
      url: process.env.SCROLL_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    base: {
      url: process.env.BASE_RPC!,
      accounts: [process.env.PRIVATE_KEY0!]
    },
    // zksync: {
    //   url: "https://mainnet.era.zksync.io",
    //   ethNetwork: "mainnet",
    //   zksync: true,
    //   accounts: [process.env.PRIVATE_KEY0!],
    //   deployPaths: "deploy-zkSync",
    //   verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    // },
    // zkSyncSepoliaTestnet: {
    //   url: "https://sepolia.era.zksync.dev",
    //   ethNetwork: "sepolia",
    //   zksync: true,
    //   accounts: [process.env.PRIVATE_KEY0!],
    //   deployPaths: "deploy-zkSync",
    //   verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
    // },
    // dockerizedNode: {
    //   url: "http://localhost:3050",
    //   ethNetwork: "http://localhost:8545",
    //   zksync: true,
    //   deployPaths: "deploy-zkSync"
    // },
    // inMemoryNode: {
    //   url: "http://127.0.0.1:8011",
    //   ethNetwork: "localhost", // in-memory node doesn't support eth node; removing this line will cause an error
    //   zksync: true,
    //   deployPaths: "deploy-zkSync"
    // },
  },
  etherscan: {
    apiKey: {
      scroll: process.env.SCROLLSCAN_API_KEY!,
      bsc: process.env.BSCSCAN_API_KEY!,
      optimism: process.env.OPTIMISTIC_ETHERSCAN_API_KEY!,
      arbitrumOne: process.env.ARBISCAN_API_KEY!,
      base: process.env.BASESCAN_API_KEY!,
      avalanche: process.env.AVALANCHESCAN_API_KEY!
    },
    customChains: [
      {
        network: "scroll",
        chainId: 534352,
        urls: {
          apiURL: "https://api.scrollscan.com/api",
          browserURL: "https://scrollscan.com"
        }
      },
      {
        network: "zkCustom",
        chainId: 324,
        urls: {
          apiURL: "https://api-era.zksync.network/api",
          browserURL: "https://era.zksync.network/"
        }
      }
    ]
  },
  gasReporter: {
    enabled: true
  },
  ignition: {
    strategyConfig: {
      create2: {
        // To learn more about salts, see the CreateX documentation
        salt: "0x0000000000000000000000000000100000000000000000000000000000000000",
      },
    },
  },
};

export default config
