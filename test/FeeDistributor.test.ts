import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { AbiCoder, Contract, id, randomBytes, Wallet, ZeroAddress } from "ethers";
import hre from "hardhat";
import MultiswapModule from "../ignition/modules/Test";


const chainId = 31337
const million = 1000000n

describe("FiberRouter", () => {
    const platformFee = 100n
    let fiberRouterSrc,
        fiberRouterDst,
        interchainTokenService,
        poolSrc,
        poolDst,
        quantumPortal,
        swapRouter,
        usdcSrc,
        usdcDst,
        frm,
        wethSrc,
        wethDst,
        signer,
        recipient,
        portalFeeRecipient,
        multiswapFeeRecipient,
        referralRecipient,
        ccipConfig

    async function deploymentFixture() {
        [signer, recipient, portalFeeRecipient, multiswapFeeRecipient, referralRecipient] = await hre.ethers.getSigners()

        quantumPortal = await hre.ethers.deployContract("QuantumPortal")
        swapRouter = await hre.ethers.deployContract("SwapRouter")
        interchainTokenService = await hre.ethers.deployContract("InterchainTokenService")
        usdcSrc = await hre.ethers.deployContract("Token")
        usdcDst = await hre.ethers.deployContract("Token")
        frm = await hre.ethers.deployContract("Token")
        wethSrc = await hre.ethers.deployContract("Token")
        wethDst = await hre.ethers.deployContract("Token")

        const localSimulatorFactory = await hre.ethers.getContractFactory("CCIPLocalSimulator");
        const localSimulator = await localSimulatorFactory.deploy();

        const config: {
            chainSelector_: bigint;
            sourceRouter_: string;
            destinationRouter_: string;
            wrappedNative_: string;
            linkToken_: string;
            ccipBnM_: string;
            ccipLnM_: string;
        } = await localSimulator.configuration();

        ccipConfig = config

        let { fiberRouter, pool } = await hre.ignition.deploy(MultiswapModule, {
            parameters: {
                MultiSwap: {
                    quantumPortal: await quantumPortal.getAddress(),
                    interchainTokenService: await interchainTokenService.getAddress(),
                    ccipRouter: config.sourceRouter_
                }
            }
        })

        await fiberRouter.setChainIdAndCcipChainSelectorPairs([chainId], [config.chainSelector_])

        fiberRouterSrc = fiberRouter
        poolSrc = pool;

        ({ fiberRouter, pool } = await hre.ignition.deploy(MultiswapModule, {
            parameters: {
                MultiSwap: {
                    quantumPortal: await quantumPortal.getAddress(),
                    ccipRouter: config.destinationRouter_
                }
            }
        }))

        await fiberRouter.setChainIdAndCcipChainSelectorPairs([chainId], [config.chainSelector_])
        fiberRouterDst = fiberRouter
        poolDst = pool
    }

    beforeEach("should deploy and config MultiSwap", async () => {
        await loadFixture(deploymentFixture)

        expect(await fiberRouterSrc.pool()).to.equal(await poolSrc.getAddress())
        expect(await fiberRouterDst.pool()).to.equal(await poolDst.getAddress())
        expect(await poolSrc.fiberRouter()).to.equal(await fiberRouterSrc.getAddress())
        expect(await poolDst.fiberRouter()).to.equal(await fiberRouterDst.getAddress())

        // Add token paths
        await fiberRouterSrc.addTokenPaths([usdcSrc], [chainId], [usdcDst])
        await fiberRouterDst.addTokenPaths([usdcDst], [chainId], [usdcSrc])
        await fiberRouterSrc.addTokenPaths([ccipConfig.ccipBnM_], [chainId], [ccipConfig.ccipBnM_])
        await fiberRouterDst.addTokenPaths([ccipConfig.ccipBnM_], [chainId], [ccipConfig.ccipBnM_])

        expect(await fiberRouterSrc.tokenPaths(usdcSrc, chainId)).to.equal(await usdcDst.getAddress())
        expect(await fiberRouterDst.tokenPaths(usdcDst, chainId)).to.equal(await usdcSrc.getAddress())

        // Add trusted remotes
        await fiberRouterSrc.addTrustedRemotes([chainId], [fiberRouterDst])
        await fiberRouterDst.addTrustedRemotes([chainId], [fiberRouterSrc])
        expect(await fiberRouterSrc.trustedRemoteRouters(chainId)).to.equal(await fiberRouterDst.getAddress())

        // Whitelist router and selectors
        await fiberRouterSrc.addRouterAndSelectors(swapRouter, [swapRouter.interface.getFunction("swapExactTokensForTokens").selector])
        await fiberRouterDst.addRouterAndSelectors(swapRouter, [
            swapRouter.interface.getFunction("swapExactTokensForTokens").selector,
            swapRouter.interface.getFunction("failingSwapExactTokensForTokens").selector
        ])

        // Mint tokens
        await usdcSrc.mint(swapRouter, million)
        await usdcSrc.mint(signer, million)
        await wethSrc.mint(signer, million)
        await frm.mint(signer, million ** 4n)
        await wethDst.mint(swapRouter, million)

        // Add liquidity to pools
        await usdcSrc.mint(signer, million)
        await usdcSrc.approve(poolSrc, million)
        await poolSrc.addLiquidity(usdcSrc, million)

        await usdcDst.mint(signer, million)
        await usdcDst.approve(poolDst, million)
        await poolDst.addLiquidity(usdcDst, million)

        // Set fee token on portal
        await frm.approve(fiberRouterSrc, million ** 4n)
        await quantumPortal.setFeeToken(frm)
        await quantumPortal.setFeeTarget(portalFeeRecipient)

        // Set multiswap platform fee
        await fiberRouterSrc.setFeeWallet(multiswapFeeRecipient)
        await fiberRouterSrc.setPlatformFee(platformFee)
    })

    describe("Quantum Portal", () => {
        it("Should distribute full platform fee to fee wallet if no referral signature data is passed", async () => {
            const amount = 100000n
            const frmBridgeFee = 1234n

            await usdcSrc.approve(fiberRouterSrc, amount)
            
            const refSigData = "0x"
            
            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient, multiswapFeeRecipient, referralRecipient],
                [-amount, 0, amount-platformFee, 0, 0, platformFee, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterDst, poolSrc, poolDst, recipient, multiswapFeeRecipient],
                [0, 0, 0, -amount+platformFee, amount-platformFee, 0]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient, multiswapFeeRecipient, referralRecipient],
                [-frmBridgeFee, frmBridgeFee, 0, 0]
            )
        })

        it("Should distribute full platform fee to fee wallet if invalid referral code used", async () => {
            const amount = 100000n
            const frmBridgeFee = 1234n

            await usdcSrc.approve(fiberRouterSrc, amount)

            const refSigData = await getDummyReferralSig("invalid-referral-code", fiberRouterSrc)
            
            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient, multiswapFeeRecipient],
                [-amount, 0, amount-platformFee, 0, 0, platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterDst, poolSrc, poolDst, recipient, multiswapFeeRecipient],
                [0, 0, 0, -amount+platformFee, amount-platformFee, 0]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient, multiswapFeeRecipient],
                [-frmBridgeFee, frmBridgeFee, 0]
            )
        })

        it("Should correctly distribute fees with valid referral code", async () => {
            const amount = 100000n
            const frmBridgeFee = 1234n

            await usdcSrc.approve(fiberRouterSrc, amount)

            const referralCode = "valid-referral-code"
            
            // Add referral data
            const fakeWallet = new Wallet(id(referralCode))
            const referralCodePublicKey = fakeWallet.address.toLowerCase()
            const referralDiscount = 20n // 20% discount
            const referralShare = 40n // 40% fee share
            await fiberRouterSrc.addReferral(
                referralRecipient,
                referralShare,
                referralDiscount,
                referralCodePublicKey
            )

            const refSigData = await getDummyReferralSig(referralCode, fiberRouterSrc)
            
            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData
            )

            const revisedTotalFee = platformFee - (platformFee * referralDiscount / 100n)
            const referralFee = revisedTotalFee * referralShare / 100n
            const revisedPlatformFee = revisedTotalFee - referralFee

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient, multiswapFeeRecipient, referralRecipient],
                [-amount, 0, amount-revisedTotalFee, 0, 0, revisedPlatformFee, referralFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterDst, poolSrc, poolDst, recipient, multiswapFeeRecipient],
                [0, 0, 0, -amount+revisedTotalFee, amount-revisedTotalFee, 0]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient, multiswapFeeRecipient, referralRecipient],
                [-frmBridgeFee, frmBridgeFee, 0, 0]
            )
        })
    })
})

const getDummyReferralSig = async (referralCode:string, fiberRouterSrc:Contract) => {
    const salt = "0x" + Buffer.from(randomBytes(32)).toString("hex")
    const expiry = Math.floor(Date.now() / 1000) + 180
    const fakeWallet = new Wallet(id(referralCode))
    
    const domain = {
        name: "FEE_DISTRIBUTOR",
        version: "000.001",
        chainId,
        verifyingContract: fiberRouterSrc.target as string
    };

    const types = {
        ReferralSignature: [
            { name: "salt", type: "bytes32" },
            { name: "expiry", type: "uint256" }
        ],
    };

    const values = {
        salt,
        expiry
    };

    const signature = await fakeWallet.signTypedData(domain, types, values);
    
    const abiCoder = new AbiCoder()
    return abiCoder.encode(["bytes32", "uint256", "bytes"], [salt, expiry, signature])
}
