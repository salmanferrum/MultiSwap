// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BaseRouter } from "./BaseRouter.sol";
import { FeeDistributor } from "./FeeDistributor.sol";
import { CCIPApp } from "./CCIPApp.sol";
import { QuantumPortalApp } from "./QuantumPortalApp.sol";


contract FiberRouter is FeeDistributor, QuantumPortalApp, CCIPApp {

    constructor(
        address pool,
        address payable gasWallet,
        address portal,
        address ccipRouter
    ) QuantumPortalApp(portal) Ownable(tx.origin) CCIPApp(ccipRouter) BaseRouter(pool, gasWallet) {}

    //#############################################################
    //###################### USER FUNCTIONS #######################
    //#############################################################
    function cross(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData
    ) external payable {
        _cross(
            sourceFoundryToken,
            amountIn,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            new bytes(0)
        );
    }

    function crossAndSwap(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData,
        bytes memory dstData
    ) external payable {
        _cross(
            sourceFoundryToken,
            amountIn,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            dstData
        );
    }

    function swapAndCross(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData,
        address router,
        bytes calldata srcRouterCalldata
    ) external payable {
        _swapAndCross(
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            router,
            srcRouterCalldata,
            new bytes(0)
        );
    }

    function swapAndCrossAndSwap(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData,
        address router,
        bytes calldata srcRouterCalldata,
        bytes memory dstData
    ) external payable {
        _swapAndCross(
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            router,
            srcRouterCalldata,
            dstData
        );
    }

    //#############################################################
    //################# INTERNAL LOGIC FUNCTIONS ##################
    //#############################################################
    function _cross(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData,
        bytes memory dstData
    ) internal {
        require(amountIn > 0, "FR: Amount in must be greater than zero");
        require(recipient != address(0), "FR: Recipient address cannot be zero");

        amountIn = _moveTokens(sourceFoundryToken, msg.sender, address(this), amountIn);
        amountIn = _distributeFees(sourceFoundryToken, amountIn, refSigData);

        if (swapType == 0) {
            amountIn = _transferToPool(sourceFoundryToken, address(this), amountIn);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountIn, feeAmount, dstData);
        } else if (swapType == 1) {
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountIn, abi.encode(recipient));
        } else {
            revert("FR: Invalid swap type");
        }
    }

    function _swapAndCross(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        ReferralSignature memory refSigData,
        address router,
        bytes calldata srcRouterCalldata,
        bytes memory dstData
    ) internal {
        amountIn = _moveTokens(fromToken, msg.sender, address(this), amountIn);

        uint256 amountOut = _swap(
            address(this),
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            router,
            srcRouterCalldata
        );

        amountOut = _distributeFees(sourceFoundryToken, amountOut, refSigData);

        if (swapType == 0) {
            amountOut = _transferToPool(sourceFoundryToken, address(this), amountOut);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountOut, feeAmount, dstData);
        } else if (swapType == 1) {
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountOut, abi.encode(recipient));
        } else {
            revert("FR: Invalid swap type");
        }
    }
}
