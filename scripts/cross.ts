import hre from "hardhat";
import { ethers as ethersV6 } from "ethers"; // Import ethers from ethers package
import addresses from "../constants/addresses.json";
import usdcAbi from "./abi/Usdc.json";
import bridgeTokenAbi from "./abi/BridgeToken.json"

async function main() {
    const currentNetwork = hre.network.name;
    const otherNetwork = "base";
    const signer = await hre.ethers.provider.getSigner();

    // Recipient address
    const recipientAddress = "0x2F169deC5B55420864967f28D545A2898c71b28B"; // Replace with the recipient's address

    // Contract addresses and parameters
    const fiberRouterAddress = addresses.networks[currentNetwork].deployments.fiberRouter;
    const usdcAddress = addresses.networks[currentNetwork].foundry;
    const bridgeFeeTokenAddress = addresses.networks[currentNetwork].bridgeToken;
    const currentNetworkChainID = addresses.networks[currentNetwork].chainId;
    const targetNetworkChainID = addresses.networks[otherNetwork].chainId;
    const targetFiberRouterAddress = addresses.networks[otherNetwork].deployments.fiberRouter;
    const usdc = new ethersV6.Contract(
        usdcAddress,
        usdcAbi,
        signer
    );
    const bridgeFeeToken = new ethersV6.Contract(
        bridgeFeeTokenAddress,
        bridgeTokenAbi,
        signer
    );

    const usdcDecimals = await usdc.decimals();
    const bridgeDecimals = await bridgeFeeToken.decimals();
    const amount = ethersV6.parseUnits("1", usdcDecimals); // Amount to cross
    const frmBridgeFee = ethersV6.parseUnits("1", bridgeDecimals); // Bridge fee
    let swapType = 2;

    // Contract instances
    const FiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);

    // Approve tokens
    await usdc.approve(fiberRouterAddress, amount);

    // Approve bridge fee tokens
    await bridgeFeeToken.approve(fiberRouterAddress, frmBridgeFee);

    // Generate referral signature data
    const refSigData = await getReferralSig(FiberRouter, signer, currentNetworkChainID);
    console.log(refSigData);

    let tx;
    if(swapType == 0) {
        // Execute cross-chain transaction using the generated referral signature
        tx = await FiberRouter.cross(
            usdcAddress,
            amount,
            frmBridgeFee,
            recipientAddress,
            targetNetworkChainID,
            swapType,
            refSigData
        );
   }
   else if(swapType == 2) {
        const destinationEid = addresses.networks[otherNetwork].stg.stgEndpointID;
        const composerAddress = targetFiberRouterAddress;
        const targetAddress = recipientAddress;
        // Convert targetAddress to buffer (remove "0x" prefix)
        const targetAddressBuffer = Buffer.from(targetAddress.slice(2), 'hex');
        // Concatenate buffers to get the encoded data
        const encodedData = Buffer.concat([targetAddressBuffer]);
        // Convert encoded data to hexadecimal string
        const composeMsg = '0x' + encodedData.toString('hex');

        console.log("ComposeMessage for Stargate:", composeMsg);

        const gasFee = await prepareTakeTaxi(FiberRouter, destinationEid, amount, composerAddress, composeMsg);
        let gasValue = BigInt(gasFee);
        const gasFeeWithBuffer = (gasValue * 105n / 100n).toString();
        console.log("gas fee: ", gasFeeWithBuffer);
        // Execute cross-chain transaction using the generated referral signature
        tx = await FiberRouter.cross(
            usdcAddress,
            amount,
            frmBridgeFee,
            recipientAddress,
            targetNetworkChainID,
            swapType,
            refSigData,
            { value: gasFeeWithBuffer }
        );
   }

    console.log("Transaction hash:", tx.hash);
    // Wait for transaction confirmation
    await tx.wait();
    console.log("Transaction confirmed!");
}

// Call prepareTakeTaxi function for estimating gas fee etc
async function prepareTakeTaxi(fiberRouter, dstEid, amount, composer, composeMsg) {
    const result = await fiberRouter.prepareTakeTaxi(dstEid, amount, composer, composeMsg);
    const messagingFee = result[2][0];
    console.log("messagingFee:", messagingFee);
    return messagingFee;
}

// Function to generate referral signature
const getReferralSig = async (FiberRouter: any, signer: any, currentNetworkChainID: any) => {
    const salt = ethersV6.randomBytes(32);
    const expiry = Math.floor(Date.now() / 1000) + 60;

    const domain = {
        name: "FEE_DISTRIBUTOR",
        version: "000.001",
        chainId: currentNetworkChainID, // Adjust this chainId to match your network
        verifyingContract: FiberRouter.address
    };

    const types = {
        ReferralSignature: [
            { name: "salt", type: "bytes32" },
            { name: "expiry", type: "uint256" }
        ],
    };

    const values = {
        salt: ethersV6.hexlify(salt),
        expiry
    };

    // Correctly use `signTypedData` for ethers v6
    const signature = await signer.signTypedData(domain, types, values);
    
    return {
        salt: ethersV6.hexlify(salt),
        expiry,
        signature
    };
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
