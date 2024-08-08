// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { BaseRouter } from "./BaseRouter.sol";
import { IInterchainTokenService } from "./common/its/interfaces/IInterchainTokenService.sol";
import { IInterchainTokenStandard } from "./common/its/interfaces/IInterchainTokenStandard.sol";


/**
 * @title InterchainTokenExecutable
 * @notice Abstract contract that defines an interface for executing arbitrary logic
 * in the context of interchain token operations.
 * @dev This contract should be inherited by contracts that intend to execute custom
 * logic in response to interchain token actions such as transfers. This contract
 * will only be called by the interchain token service.
 */
abstract contract ITSApp is BaseRouter {
    error NotService(address caller);

    address public immutable interchainTokenService;
    bytes32 internal constant EXECUTE_SUCCESS = keccak256('its-execute-success');
    mapping(uint256 => string) private chainIdToName;
    mapping(string => uint256) private chainNameToId;

    /**
     * @notice Creates a new InterchainTokenExecutable contract.
     * @param interchainTokenService_ The address of the interchain token service that will call this contract.
     */
    constructor(address interchainTokenService_) {
        interchainTokenService = interchainTokenService_;
    }

    /**
     * Modifier to restrict function execution to the interchain token service.
     */
    modifier onlyService() {
        if (msg.sender != interchainTokenService) revert NotService(msg.sender);
        _;
    }

    /**
     * @notice Executes logic in the context of an interchain token transfer.
     * @dev Only callable by the interchain token service.
     * @param commandId The unique message id.
     * @param sourceChain The source chain of the token transfer.
     * @param sourceAddress The source address of the token transfer.
     * @param data The data associated with the token transfer.
     * @param tokenId The token ID.
     * @param token The token address.
     * @param amount The amount of tokens being transferred.
     * @return bytes32 Hash indicating success of the execution.
     */
    function executeWithInterchainToken(
        bytes32 commandId,
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata data,
        bytes32 tokenId,
        address token,
        uint256 amount
    ) external virtual onlyService returns (bytes32) {
        _executeWithInterchainToken(sourceChain, sourceAddress, data, token, amount);
        return EXECUTE_SUCCESS;
    }

    function _bridgeWithITS(
        address remoteFoundryToken,
        uint256 targetChainId,
        uint256 amount,
        address recipient
    ) internal {
        IInterchainTokenService(interchainTokenService).callContractWithInterchainToken(
            IInterchainTokenStandard(remoteFoundryToken).interchainTokenId(),
            _getChainName(targetChainId),
            _toBytes(trustedRemoteRouters[targetChainId]),
            amount,
            abi.encode(recipient),
            msg.value
        );
    }

    function _executeWithInterchainToken(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata data,
        address token,
        uint256 amount
    ) internal {
        require(trustedRemoteRouters[_getChainId(sourceChain)] == _toAddress(sourceAddress), "FR: Router not trusted");

        if (data.length == 0x20) { // Simple bridging
            address recipient = abi.decode(data, (address));
            _moveTokens(token, address(this), recipient, amount);
        } else if (data.length > 0x20) { // TODO: Implement finalizeCross + Swap
            (address recipient, bytes memory oneInchCalldata) = abi.decode(data, (address, bytes)); // There's also 4 more: minAmountOut, targetToken, router, routerCalldata
        } else {
            revert("FR: Invalid data length");
        }
    }

    function setChainIdAndNamePairs(uint256[] memory chainIds, string[] memory chainNames) public {
        require(chainIds.length == chainNames.length, "ITSApp: chainIds and chainNames length mismatch");
        for (uint256 i = 0; i < chainIds.length; i++) {
            chainIdToName[chainIds[i]] = chainNames[i];
            chainNameToId[chainNames[i]] = chainIds[i];
        }
    }

    function _getChainId(string memory chainName) internal view returns (uint256) {
        
        uint256 chainId = chainNameToId[chainName];

        require(chainId != 0, "ITSApp: chainId not set");
        return chainId;
    }

    function _getChainName(uint256 chainId) internal view returns (string memory) {
        string memory chainName = chainIdToName[chainId];
        require(bytes(chainName).length != 0, "ITSApp: chainName not set");
        return chainName;
    }

    /**
     * @dev Converts a bytes address to an address type.
     * @param bytesAddress The bytes representation of an address
     * @return addr The converted address
     */
    function _toAddress(bytes memory bytesAddress) internal pure returns (address addr) {
        require(bytesAddress.length == 20, "ITSApp: Invalid address length");

        assembly {
            addr := mload(add(bytesAddress, 20))
        }
    }

    /**
     * @dev Converts an address to bytes.
     * @param addr The address to be converted
     * @return bytesAddress The bytes representation of the address
     */
    function _toBytes(address addr) internal pure returns (bytes memory bytesAddress) {
        bytesAddress = new bytes(20);
        assembly {
            mstore(add(bytesAddress, 20), addr)
            mstore(bytesAddress, 20)
        }
    }
}