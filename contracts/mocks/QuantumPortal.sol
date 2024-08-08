// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "hardhat/console.sol";

contract QuantumPortal {

    uint256 sourceNetwork;
    address sourceMsgSender;
    address sourceBeneficiary;
    address public feeToken;
    address public feeTarget;

    function setFeeToken(address _feeToken) external {
        feeToken = _feeToken;
    }

    function setFeeTarget(address _feeTarget) external {
        feeTarget = _feeTarget;
    }

    function run(
        uint64, // remoteChain, unused in mock
        address remoteContract,
        address beneficiary,
        bytes memory remoteMethodCall
    ) external {
        sourceNetwork = block.chainid;
        sourceMsgSender = msg.sender;
        sourceBeneficiary = beneficiary;

        (bool success, bytes memory returnData) = remoteContract.call(remoteMethodCall);
        if (!success) {
            if (returnData.length > 0) { // Bubble up the revert reason
                assembly {
                    let returnDataSize := mload(returnData)
                    revert(add(32, returnData), returnDataSize)
                }
            } else {
                revert("QP: remote call failed");
            }
        }
    }

    function msgSender() external view returns (
        uint256,
        address,
        address
    ) {
        return (sourceNetwork, sourceMsgSender, sourceBeneficiary);
    }
}
