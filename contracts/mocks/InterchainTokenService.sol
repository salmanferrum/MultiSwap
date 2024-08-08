// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "hardhat/console.sol";

interface IITSApp {
    function executeWithInterchainToken(
        bytes32 commandId,
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata data,
        bytes32 tokenId,
        address token,
        uint256 amount
    ) external;
}

contract InterchainTokenService {
    function callContractWithInterchainToken(
        bytes32 tokenId,
        string calldata destinationChain,
        bytes calldata destinationAddress,
        uint256 amount,
        bytes memory data,
        uint256 gasValue
    ) external payable {
        IITSApp(_toAddress(destinationAddress)).executeWithInterchainToken(
            bytes32(0),
            destinationChain,
            _toBytes(msg.sender),
            data,
            tokenId,
            address(0),
            amount
        );
    }

    function _toAddress(bytes memory bytesAddress) internal pure returns (address addr) {
        require(bytesAddress.length == 20, "ITSApp: Invalid address length");

        assembly {
            addr := mload(add(bytesAddress, 20))
        }
    }

    function _toBytes(address addr) internal pure returns (bytes memory bytesAddress) {
        bytesAddress = new bytes(20);
        assembly {
            mstore(add(bytesAddress, 20), addr)
            mstore(bytesAddress, 20)
        }
    }
}
