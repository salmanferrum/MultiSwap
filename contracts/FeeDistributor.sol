// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract FeeDistributor is EIP712, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    string public constant NAME = "FEE_DISTRIBUTOR";
    string public constant VERSION = "000.001";
    uint32 constant MINUTE = 60;

    address public feeWallet;
    uint256 public platformFee; // Platform fee as a fixed amount

    mapping(bytes32 => bool) public usedSalt;
    mapping(address => ReferralData) public referrals;
    mapping(address => address) public userReferralCode; // userAddress => referralCode

    bytes32 constant REFERRAL_CODE_TYPEHASH = keccak256(
        "ReferralSignature(bytes32 salt,uint256 expiry)"
    );

    struct ReferralData {
        address referral;
        uint256 referralShare;
        uint256 referralDiscount;
    }

    event FeesDistributed(
        address token,
        address referral,
        uint256 preFeeAmount,
        uint256 totalFee
    );

    constructor() EIP712(NAME, VERSION) {}

    //#############################################################
    //################ ADMIN FUNCTIONS ############################
    //#############################################################

    /**
     * @dev Sets the fee wallet.
     * @param _feeWallet The new fee wallet address.
     */
    function setFeeWallet(address _feeWallet) external onlyOwner {
        require(_feeWallet != address(0), "FD: Bad fee wallet address");
        feeWallet = _feeWallet;
    }

    /**
     * @dev Sets the platform fee.
     * @param _platformFee The new platform fee as a fixed amount.
     */
    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee > 0, "FD: Platform fee must be greater than zero");
        platformFee = _platformFee;
    }

    /**
     * @dev Adds a new referral to the contract.
     * @param referral The address of the referral.
     * @param referralShare The percentage share of the referral (must be between 1 and 100).
     * @param referralDiscount The discount percentage provided by the referral.
     * @param publicReferralCode The address associated with the referral code.
     */
    function addReferral(
        address referral,
        uint256 referralShare,
        uint256 referralDiscount,
        address publicReferralCode
    ) external onlyOwner {
        require(referral != address(0), "FD: Bad referral address");
        require(
            referralShare > 0 && referralShare <= 100,
            "FD: Invalid referral fee"
        ); // Has to be between 1 and 100%
        referrals[publicReferralCode] = ReferralData(
            referral,
            referralShare,
            referralDiscount
        );
    }

    /**
     * @dev Removes an existing referral from the contract.
     * @param publicReferralCode The address associated with the referral code to be removed.
     */
    function removeReferral(address publicReferralCode) external onlyOwner {
        require(
            referrals[publicReferralCode].referral != address(0),
            "FD: Referral does not exist"
        );
        delete referrals[publicReferralCode];
    }
    
    //#############################################################
    //################ INTERNAL LOGIC FUNCTIONS ###################
    //#############################################################

    /**
     * @dev Internal function to distribute fees, considering referral data.
     * @param user The address of the user initiating the transaction.
     * @param token The address of the token in which fees are paid.
     * @param preFeeAmount The amount before fees are deducted.
     * @param refSigData The referral signature data.
     * @return The amount after fees are deducted.
     */
    function _distributeFees(
        address user,
        address token,
        uint256 preFeeAmount,
        bytes memory refSigData
    ) internal returns (uint256) {
        ReferralData memory referralData;

        // Check if the user already has a saved referral code
        if (userReferralCode[user] != address(0)) {
            referralData = referrals[userReferralCode[user]];
        } else if (refSigData.length != 0) {
            // If refSigData is provided, validate and set the referral code
            referralData = _getReferralData(user, refSigData);
        } else {
            // No referral code; use default
            referralData = referrals[address(0)];
        }

        uint256 totalFee = platformFee;
        if (totalFee > 0) {
            if (referralData.referral == address(0)) {
                // No or invalid referral code
                IERC20(token).safeTransfer(feeWallet, totalFee);
            } else {
                // Apply referral discount
                totalFee -= (totalFee * referralData.referralDiscount) / 100;
                uint256 referralShare = (totalFee * referralData.referralShare) / 100;
                uint256 platformShare = totalFee - referralShare;
                IERC20(token).safeTransfer(feeWallet, platformShare);
                IERC20(token).safeTransfer(referralData.referral, referralShare);
            }
        }

        emit FeesDistributed(token, referralData.referral, preFeeAmount, totalFee);
        return preFeeAmount - totalFee;
    }

    /**
     * @dev Internal function to get referral data, ensuring the user's first valid referral code is used.
     * @param user The address of the user.
     * @param refSigData The referral signature data.
     * @return The referral data associated with the user.
     */
    function _getReferralData(address user, bytes memory refSigData)
        private
        returns (ReferralData memory)
    {
        (bytes32 salt, uint256 expiry, bytes memory signature) = abi.decode(
            refSigData,
            (bytes32, uint256, bytes)
        );

        require(block.timestamp < expiry, "FD: Signature timed out");
        require(expiry < block.timestamp + (3 * MINUTE), "FD: Expiry too far");
        require(!usedSalt[salt], "FD: Salt already used");
        usedSalt[salt] = true;

        bytes32 structHash = keccak256(
            abi.encode(REFERRAL_CODE_TYPEHASH, salt, expiry)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address referralCode = ECDSA.recover(digest, signature);

        // Ensure the referral code exists
        require(
            referrals[referralCode].referral != address(0),
            "FD: Invalid referral code"
        );

        // Save the referral code for the user if not already set
        if (userReferralCode[user] == address(0)) {
            userReferralCode[user] = referralCode;
        }

        return referrals[referralCode];
    }
}
