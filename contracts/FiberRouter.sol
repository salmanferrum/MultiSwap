// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BaseRouter } from "./BaseRouter.sol";
import { CCIPApp } from "./CCIPApp.sol";
import { QuantumPortalApp } from "./QuantumPortalApp.sol";


contract FiberRouter is QuantumPortalApp, CCIPApp {

    constructor(
        address pool,
        address payable gasWallet,
        address portal,
        address ccipRouter
    ) QuantumPortalApp(portal) Ownable(msg.sender) CCIPApp(ccipRouter) BaseRouter(pool, gasWallet) {}

    function cross(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType
    ) external override payable {
        require(amountIn > 0, "FR: Amount in must be greater than zero");
        require(recipient != address(0), "FR: Recipient address cannot be zero");

        amountIn = _moveTokens(sourceFoundryToken, msg.sender, address(this), amountIn);

        // Fee logic here

        if (swapType == 0) {
            amountIn = _transferToPool(sourceFoundryToken, address(this), amountIn);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountIn, feeAmount);
        } else if (swapType == 1) {
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountIn, abi.encode(recipient));
        } else {
            revert("FR: Invalid swap type");
        }
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
        address router,
        bytes calldata routerCalldata
    ) external override payable {
        amountIn = _moveTokens(fromToken, msg.sender, address(this), amountIn);

        uint256 amountOut = _swapAndCheckSlippage(
            address(this),
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            router,
            routerCalldata
        );

        if (swapType == 0) {
            amountOut = _transferToPool(sourceFoundryToken, address(this), amountOut);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountOut, feeAmount);
        } else if (swapType == 1) {
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountOut, abi.encode(recipient));
        } else {
            revert("FR: Invalid swap type");
        }
    }
}
