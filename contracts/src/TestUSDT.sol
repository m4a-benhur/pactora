// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TestUSDT (tUSDT)
/// @notice DEMO ONLY. A USDT-style test token (6 decimals). NOT issued by Tether,
///         has no real value, and must never be presented as real USDT.
contract TestUSDT is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev Max tokens a minter can issue in one call (10,000 tUSDT).
    uint256 public constant MAX_MINT_PER_CALL = 10_000e6;
    /// @dev Max a wallet can self-claim per cooldown (100 tUSDT).
    uint256 public constant FAUCET_AMOUNT = 100e6;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(bytes32 => bool) public usedRef;
    mapping(address => uint256) public lastFaucetClaim;

    event MintedFor(address indexed to, uint256 amount, bytes32 indexed ref);
    event FaucetClaimed(address indexed to, uint256 amount);

    error UnsupportedChain();
    error RefAlreadyUsed();
    error AmountTooLarge();
    error ZeroAmount();
    error FaucetCooldown();

    constructor(address admin) ERC20("Pactora Test USDT", "tUSDT") {
        // Base Sepolia (84532), Ethereum Sepolia (11155111), local Anvil (31337)
        if (
            block.chainid != 84532 &&
            block.chainid != 11155111 &&
            block.chainid != 31337
        ) {
            revert UnsupportedChain();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Server-side issuance (on-ramp simulation). `ref` can only be used once.
    function mintFor(
        address to,
        uint256 amount,
        bytes32 ref
    ) external onlyRole(MINTER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_MINT_PER_CALL) revert AmountTooLarge();
        if (usedRef[ref]) revert RefAlreadyUsed();
        usedRef[ref] = true;
        _mint(to, amount);
        emit MintedFor(to, amount, ref);
    }

    /// @notice Demo faucet: any wallet may claim a small amount once per cooldown.
    function faucetMint() external {
        if (block.timestamp < lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN)
            revert FaucetCooldown();
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }
}
