## Settlement token
Test USDT (tUSDT), 6 decimals, USDT-style (no permit). NOT real Tether USDT. Contract: TestUSDT.sol (mintFor with unique ref, faucetMint 100/day, chain-gated to testnets). Escrow takes token address in constructor so real/sponsor USDT can be swapped in.

## Tether integration plan
USDT-style settlement (core); WDK ERC-4337 wallet spike end of Phase 1 (decision gate: WDK primary if it works on Base Sepolia, else Wagmi primary); USDT0 roadmap slide only.

## Status
Phase 1, Task 1 done: repo skeleton, Foundry, TestUSDT + tests.

## Next step
Phase 1, Task 2: PactoraEscrow.sol (state machine, bonds, 2% fee, ARBITER resolve) + Foundry tests.

## Contract: PactoraEscrow.sol (written, not yet tested)
Constructor(token, treasury, admin). Roles: DEFAULT_ADMIN (setFeeBps, max 5%), ARBITER (attestDelivery, resolveRefund, resolveForSeller).
Flow: createTrade (seller + seller bond) → fund (buyer principal + buyer bond) → markDispatched → attestDelivery (ARBITER, enables auto-release) or markHandedOver (seller, in-person, never auto-release) → confirmAcceptance | openDispute → resolve.
Fee: feeBps snapshotted per trade, paid to immutable treasury only on completion (normal or resolveForSeller). Refunds/cancellations: no fee.
Trade id: keccak256(abi.encode(dbTradeUuid, sellerWallet)).

## Next step
Phase 1, Task 2b: Foundry tests for PactoraEscrow (happy path R8,000 numbers, refund, dispute paths, access control, double-settlement, fuzz conservation).