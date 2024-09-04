// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeAmount } from "./common/SafeAmount.sol";
import { Pool } from "./Pool.sol";

abstract contract BaseRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public constant NATIVE_CURRENCY = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    Pool public pool;
    address public weth;

    mapping(address => mapping(uint256 => address)) public tokenPaths;  // sourceToken => remoteChainId => remoteToken
    mapping(uint256 => address) public trustedRemoteRouters;            // remoteChainId => remoteFiberRouter
    mapping(bytes32 => bool) private routerAllowList;                   // 0x{4byteFuncSelector}0000000000000000{20byteRouterAddress} => isAllowed

    event InitiateCross(
        address sourceFoundryToken,
        uint256 amountIn,
        address remoteFoundryToken,
        address recipient,
        uint256 targetChainId,
        uint256 gasFee
    );

    event SwapAndInitiateCross(
        address fromToken,
        uint256 amountIn,
        address sourceFoundryToken,
        uint256 amountOut,
        address remoteFoundryToken,
        address recipient,
        uint256 targetChainId,
        uint256 gasFee
    );

    event FinalizeCross(
        address token,
        uint256 amount,
        address recipient,
        uint256 srcChainId
    );

    event FinalizeCrossAndSwap(
        address settledToken,
        uint256 amount,
        address recipient,
        uint256 srcChainId
    );

    event SwapSameNetwork(
        address sourceToken,
        address targetToken,
        uint256 sourceAmount,
        uint256 settledAmount,
        address sourceAddress,
        address targetAddress
    );

    event DstSwapFailureReason(
        bytes reason
    );

    event RouterAndSelectorWhitelisted(address router, bytes4 selector);
    event RouterAndSelectorRemoved(address router, bytes selector);

    constructor(address _pool, address _weth) {
        require(_pool != address(0), "BR: Pool address cannot be zero");
        require(_weth != address(0), "BR: Weth address cannot be zero");
        pool = Pool(_pool);
        weth = _weth;
    }

    //#############################################################
    //###################### ADMIN FUNCTIONS ######################
    //#############################################################
    /**
     * @dev Sets the fund manager contract.
     * @param _pool The fund manager
     */
    function setPool(address _pool) external onlyOwner {
        require(_pool != address(0), "BR: Swap pool address cannot be zero");
        pool = Pool(_pool);
    }

    /**
     * @dev Sets the WETH address.
     * @param _weth The WETH address
     */
    function setWeth(address _weth) external onlyOwner {
        require(_weth != address(0), "BR: Weth address cannot be zero");
        weth = _weth;
    }

    function addTrustedRemotes(
        uint256[] calldata remoteChainIds,
        address[] calldata remoteRouters
    ) external onlyOwner {
        require(remoteChainIds.length == remoteRouters.length, "BR: Array length mismatch");
        for (uint256 i = 0; i < remoteChainIds.length; i++) {
            require(remoteChainIds[i] != 0, "BR: Chain ID cannot be zero");
            require(remoteRouters[i] != address(0), "BR: Remote fiber router address cannot be zero");
            trustedRemoteRouters[remoteChainIds[i]] = remoteRouters[i];
        }
    }

    function removeTrustedRemotes(uint256[] calldata remoteChainIds) external onlyOwner {
        for (uint256 i = 0; i < remoteChainIds.length; i++) {
            delete trustedRemoteRouters[remoteChainIds[i]];
        }
    }

    function addTokenPaths(
        address[] calldata sourceTokens,
        uint256[] calldata remoteChainIds,
        address[] calldata remoteTokens
    ) external onlyOwner {
        require(sourceTokens.length == remoteChainIds.length && sourceTokens.length == remoteTokens.length, "BR: Array length mismatch");
        for (uint256 i = 0; i < sourceTokens.length; i++) {
            require(sourceTokens[i] != address(0), "BR: Chain ID cannot be zero");
            require(remoteTokens[i] != address(0), "BR: Remote token address cannot be zero");
            tokenPaths[sourceTokens[i]][remoteChainIds[i]] = remoteTokens[i];
        }
    }

    function removeTokenPaths(address[] calldata sourceTokens, uint256[] calldata remoteChainIds) external onlyOwner {
        require(sourceTokens.length == remoteChainIds.length, "BR: Array length mismatch");
        for (uint256 i = 0; i < sourceTokens.length; i++) {
            delete tokenPaths[sourceTokens[i]][remoteChainIds[i]];
        }
    }

    /**
     * @notice Whitelists the router and selector combination
     * @param router The router address
     * @param selectors The selectors for the router
     */
    function addRouterAndSelectors(address router, bytes4[] memory selectors) external onlyOwner {
        for (uint256 i = 0; i < selectors.length; i++) {
            routerAllowList[_getKey(router, abi.encodePacked(selectors[i]))] = true;
            emit RouterAndSelectorWhitelisted(router, selectors[i]);
        }
    }

    /**
     * @notice Removes the router and selector combination from the whitelist
     * @param router The router address
     * @param selector The selector for the router
     */
    function removeRouterAndSelector(address router, bytes calldata selector) external onlyOwner {
        routerAllowList[_getKey(router, selector)] = false;
        emit RouterAndSelectorRemoved(router, selector);
    }

    //#############################################################
    //###################### VIEW FUNCTIONS #######################
    //#############################################################
    /**
     * @notice Checks if the router and selector combination is whitelisted
     * @param router The router address
     * @param selector The selector for the router
     */
    function isAllowListed(address router, bytes memory selector) public view returns (bool) {
        return routerAllowList[_getKey(router, selector)];
    }

    //#############################################################
    //#################### INTERNAL FUNCTIONS #####################
    //#############################################################
    function _getKey(address router, bytes memory data) private pure returns (bytes32) {
        bytes32 key; // Takes the shape of 0x{4byteFuncSelector}00..00{20byteRouterAddress}
        assembly {
            key := or(
                and(mload(add(data, 0x20)), 0xffffffff00000000000000000000000000000000000000000000000000000000),
                router
            )
        }
        return key;
    }

    function _getBalance(address token, address account) private view returns (uint256) {
        return token == NATIVE_CURRENCY ? account.balance : IERC20(token).balanceOf(account);
    }

    function _approveExternalContract(address token, address externalContract, uint256 amount) private {
        uint256 currentAllowance = IERC20(token).allowance(address(this), externalContract);
        if (currentAllowance > 0) {
            IERC20(token).safeDecreaseAllowance(externalContract, currentAllowance);
        }
        IERC20(token).safeIncreaseAllowance(externalContract, amount);
    }

    function _moveTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (uint256 ){
        if (from == address(this)) {
            IERC20(token).safeTransfer(to, amount);
        } else {
            amount = SafeAmount.safeTransferFrom(token, from, to, amount);
        }
        return amount;
    }

    function _swap(
        address targetAddress,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address router,
        bytes memory data
    ) internal returns (uint256) {
        require(isAllowListed(router, data), "BR: Router and selector not whitelisted");
        _approveExternalContract(fromToken, router, amountIn);
        uint256 balanceBefore = _getBalance(toToken, targetAddress);
        _makeRouterCall(router, data);
        uint256 amountOut = _getBalance(toToken, targetAddress) - balanceBefore;

        require(amountOut >= minAmountOut, "BR: Slippage check failed");

        return amountOut;
    }

    /**
     * @dev The require statement in the else block should always pass if the router swap is successful, since the
     *      3rd party router should handle slippage. The minAmountOut will be the same in both the dstRouterCalldata
     *      and the value passed in here, as we can't regenerate the calldata. Resort to manual settlement if this fails
     * @param targetAddress Address where the outgoing tokens go to, straight from the 3rd party router
     * @param fromToken from token
     * @param toToken to token
     * @param amountIn amount in
     * @param minAmountOut minimum amount out for slippage check
     * @param router 3rd party swap router
     * @param dstRouterCalldata calldata for the 3rd party token swap
     * @return Address of the settled token
     * @return Amount of the settled token
     */
    function _swapOrSettle(
        address targetAddress,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address router,
        bytes memory dstRouterCalldata
    ) internal returns (address, uint256) {
        require(isAllowListed(router, dstRouterCalldata), "BR: Router and selector not whitelisted");
        _approveExternalContract(fromToken, router, amountIn);
        uint256 balanceBefore = _getBalance(toToken, targetAddress);
        (bool success, bytes memory returnData) = router.call(dstRouterCalldata);
        uint256 amountOut = _getBalance(toToken, targetAddress) - balanceBefore;

        if (!success) { // Settle in foundry token
            require(amountOut == 0, "BR: Amount out should be zero"); // Sanity check. This should always be zero if router swap fails
            IERC20(fromToken).safeTransfer(targetAddress, amountIn);
            emit DstSwapFailureReason(returnData);
            return (fromToken, amountIn);
        } else { // Succesful swap
            require(amountOut >= minAmountOut, "BR: Slippage check failed");

            return (toToken, amountOut);
        }
    }

    function _makeRouterCall(address router, bytes memory data) private {
        (bool success, bytes memory returnData) = router.call(data);
        if (!success) {
            if (returnData.length > 0) { // Bubble up the revert reason
                assembly {
                    let returnDataSize := mload(returnData)
                    revert(add(32, returnData), returnDataSize)
                }
            } else {
                revert("BR: Call to router failed");
            }
        }
    }

    function _getAndCheckRemoteFoundryToken(address token, uint64 targetChainId) internal view returns (address) {
        address remoteFoundryToken = tokenPaths[token][targetChainId];
        require(remoteFoundryToken != address(0), "BR: Token path not found");
        return remoteFoundryToken;
    }
}
