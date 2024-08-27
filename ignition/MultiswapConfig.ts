import { ethers } from "hardhat";
import hre from "hardhat";
import { ContractTransaction } from "ethers";
import addresses from "../constants/addresses.json";
import { id } from "ethers";  // Import 'id' directly from 'ethers'

async function main() {
  const currentNetwork = hre.network.name;
  const networkAddresses = addresses.networks[currentNetwork];
  const signer = await hre.ethers.provider.getSigner();

  // Load the deployed contract addresses from the output of your deployment module
  const poolAddress = networkAddresses.deployments.pool;
  const fiberRouterAddress = networkAddresses.deployments.fiberRouter;

  // Get contract instances
  const Pool = await ethers.getContractFactory("Pool");
  const FiberRouter = await ethers.getContractFactory("FiberRouter");

  const pool = Pool.attach(poolAddress);
  const fiberRouter = FiberRouter.attach(fiberRouterAddress);

  // Call setFiberRouter on the deployed Pool contract
  await setFiberRouter(pool, fiberRouterAddress);

  // Stargate-specific setup
  const lzEndpoint = addresses.networks[currentNetwork].stg?.stgEndpoint;
  const stargateUsdcPool = addresses.networks[currentNetwork].stg?.stgUSDCPool;
  const foundry = addresses.networks[currentNetwork].foundry;

  const stgNetworks = Object.keys(addresses.networks).filter(
    (network) => addresses.networks[network].stg !== undefined
  );
  const isStg = stgNetworks.includes(currentNetwork);

  if (isStg) {
    await initializeFiberRouter(fiberRouter, stargateUsdcPool, foundry, lzEndpoint);
  }

  // Set platform fee
  const platformFee = 10000; // Example platform fee 0.1 USDC based on the decimals of the network, set as needed
  await setPlatformFee(fiberRouter, platformFee);

//   // Set platform feeWallet
  const feeWallet = "0x2F169deC5B55420864967f28D545A2898c71b28B"; 
  await setFeeWallet(fiberRouter, feeWallet);

// Allow Stargate for other networks
   await allowStgTargets(fiberRouter);

// Add referral
   await addReferral(fiberRouter, signer);

  console.log("Post-deployment actions completed successfully.");
}

async function setFiberRouter(pool: any, fiberRouterAddress: string) {
    console.log("\n##### Setting FiberRouter on Pool #####");
  
    try {
      const tx = await pool.setFiberRouter(fiberRouterAddress);
      await tx.wait();
      console.log(`setFiberRouter transaction completed: ${tx.hash}`);
    } catch (error) {
      console.error("Failed to set FiberRouter on Pool:", error);
    }
  }
  
async function initializeFiberRouter(fiberRouter: any, stargateUsdcPool: string, foundry: string, lzEndpoint: string) {
    console.log("\n##### Initializing FiberRouter with Stargate config #####");
  
    try {
      const tx = await fiberRouter.initConfig(stargateUsdcPool, foundry, lzEndpoint);
      await tx.wait();
      console.log(`initConfig transaction completed: ${tx.hash}`);
    } catch (error) {
      console.error("Failed to initialize FiberRouter:", error);
    }
  }

async function setPlatformFee(fiberRouter: any, platformFee: number) {
    console.log("\n##### Setting platform fee on FiberRouter #####");
  
    try {
      const tx = await fiberRouter.setPlatformFee(platformFee);
      await tx.wait();
      console.log(`setPlatformFee transaction completed: ${tx.hash}`);
    } catch (error) {
      console.error("Failed to set platform fee:", error);
    }
  }

async function setFeeWallet(fiberRouter: any, feeWallet: string) {
    console.log("\n##### Setting Fee Wallet on FiberRouter #####");
  
    try {
      const tx = await fiberRouter.setFeeWallet(feeWallet);
      await tx.wait();
      console.log(`setFeeWallet transaction completed: ${tx.hash}`);
    } catch (error) {
      console.error("Failed to set FeeWallet:", error);
    }
  }

async function allowStgTargets(fiberRouter: any) {
  const thisNetwork = hre.network.name;

  // Allow stargate for other networks
  console.log("\n##### Allowing stgTargetNetworks to other networks #####");
  let otherNetworksStg = Object.keys(addresses.networks).filter(
    (network) =>
      network !== thisNetwork &&
      network !== "hardhat" &&
      network !== "localhost"
  );

  for (const otherNetwork of otherNetworksStg) {
    const stgNetworks = Object.keys(addresses.networks).filter(
      (otherNetwork) => addresses.networks[otherNetwork].stg !== undefined
    );
    const isStg = stgNetworks.includes(otherNetwork);
    if (isStg) {
      await sendTx(
        fiberRouter.setStgTargetNetwork(
          addresses.networks[otherNetwork].chainId,
          addresses.networks[otherNetwork].stg.stgEndpointID,
          addresses.networks[otherNetwork].deployments.fiberRouter
        ),
        `StargateTargetNetwork for chainId ${otherNetwork} successful`
      );
    }
  }
}
async function addReferral(fiberRouter: any, signer: any) {
    // Referral details
    const referralCode = "valid-referral-code"; // Example referral code
    const referralRecipient = "0x2F169deC5B55420864967f28D545A2898c71b28B"; // Referral recipient address
    const referralShare = 5; // 40% fee share
    const referralDiscount = 5; // 20% discount

    // Generate deterministic public key from the signer's wallet
    const referralCodePublicKey = signer.address.toLowerCase();
    console.log(`Signer's address used as public referral code: ${referralCodePublicKey}`);

    try {
      const tx = await fiberRouter.addReferral(
          referralRecipient,
          referralShare,
          referralDiscount,
          referralCodePublicKey
      );
      await tx.wait();
      console.log(`addReferral transaction completed: ${tx.hash}`);
  } catch (error) {
      console.error("Failed to add referral:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const sendTx = async (txResponse: Promise<ContractTransaction>, successMessage?: string) => {
  const receipt = await (await txResponse).wait();
  await delay(100);
  if (receipt?.status == 1) {
    successMessage ? console.log(successMessage) : null;
  } else {
    console.error("Transaction failed: " + receipt);
  }
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
