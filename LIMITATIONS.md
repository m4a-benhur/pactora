# Pactora: known limitations

Pactora is a hackathon MVP running on the Ethereum Sepolia test network. This document lists what is simulated, simplified or not yet built, so nothing in the demo is mistaken for production behaviour.

## Summary

| Area | Status |
|---|---|
| Escrow, bonds, fees, disputes, ratings | Working on Sepolia |
| Courier tracking | Simulated |
| ZAR on and off-ramps | Simulated |
| Settlement token | Our own test token, not Tether USDT |
| Dispute governance | One admin, no appeals |
| Wallet recovery on a new device | **Not built** |
| Identity verification | Not built |
| Legal and regulatory review | Not done |

---

## 1. Wallets

- **The wallet is tied to the browser.** The recovery phrase is generated in the browser, encrypted with the user's PIN (AES-GCM) and stored only in that browser's local storage. It is never sent to our servers. That is deliberate, because it keeps custody with the user, but it has a consequence: a second device, a different browser, a private window or cleared site data has no wallet.
- **There is no restore feature yet.** On a new device the app offers to create a new wallet. A new wallet has a different address from the one already linked to the account, so it cannot be linked and the user cannot transact from that device. The only way to continue today is to use the original browser.
- **What is still needed:** a "Restore wallet" flow that lets a user enter their existing recovery phrase and a PIN on any device, checks that the derived address matches the address linked to the account, and saves the encrypted phrase in that browser. The "Create wallet" option should also be hidden once an account has a linked wallet.
- **Losing browser data loses the wallet.** Without the recovery phrase, funds in that wallet cannot be recovered. On a test network this only costs test tokens, but production would need a proper recovery design.
- **The PIN is the only protection on the stored phrase.** A short PIN is easy to guess if someone gains access to the browser profile. A production wallet would use a long passphrase, a slow key-derivation function, or passkeys.
- **Users need Sepolia ETH** to pay network fees, and must get it from a public faucet.

## 2. Trust and governance

- **One administrator is also the arbiter.** A single wallet decides disputes. Its key is held on the server. There are no appeals, and decisions are final.
- **Conflict of interest.** Forfeited bonds go to Pactora's treasury, and the same administrator who rules on misconduct controls that treasury. We chose this so that neither side can profit from accusing the other. A production version needs a separate bond pool or independent arbiters, with published ruling criteria.
- **Older payout functions still exist on-chain.** The escrow still contains the earlier refund and release functions, which can send a forfeited bond to the other party. The app no longer calls them, but the arbiter key could. A later redeploy should remove them.
- **Trades on the previous escrow cannot continue.** The escrow was redeployed to change bond handling, so trades started on the old contract are abandoned.

## 3. Delivery

- **Courier tracking is simulated.** The seller presses the steps, and the final step has the arbiter record delivery on-chain. No courier API is connected.
- **Auto-release is disabled.** A buyer must confirm, or a dispute must be ruled. There is no automatic release after the inspection window.
- **In-person handover is trust-based.** The seller marks it done and it never auto-releases.

## 4. Payments and ramps

- **The ZAR on and off-ramps are simulated.** Buying "pays" nothing and mints test tUSDT to the user's wallet. Cashing out produces a receipt but sends no money.
- **No on-chain burn on cash-out.** The user's tUSDT balance does not drop after a withdrawal, so the demo cannot be used to track real balances through a full cycle.
- **Fixed rate and fees.** R20 per tUSDT and a 1.5% fee each way are constants in the code, not live market rates and not editable by the admin.
- **Fictional bank details.** Only the last four digits of an account number are stored. Nothing is verified with a bank.
- **The test token is not Tether USDT.** tUSDT is our own token with a faucet and a minter. USDT0 is on the roadmap only.

## 5. Accounts and identity

- **No identity verification.** There is no phone, ID or address check. Email confirmation is off for the demo, so any address can sign up.
- **Seller tiers are partial.** New, Active and Established are built. Verified (identity) and Restricted are not.
- **Usernames** are unique and case-insensitive, but there is no profanity or impersonation filtering beyond a short reserved-name list.

## 6. Disputes

- **Evidence is not independently verified.** Photos and files are stored and shown to the administrator as uploaded.
- **Rulings are manual.** Every outcome needs an administrator, with a written reason of at least 20 characters.

## 7. Data and operations

- **Event history.** Chain events are recorded when a transaction passes through our sync. The admin backfill button reads the escrow logs to fill gaps, and needs the deployment block number to be set.
- **Admin statistics are approximate.** They are computed in the app from up to 5,000 rows per table, and buyer-bond forfeits are counted but not summed in the totals.
- **Single deployment.** There is one Vercel deployment, one Supabase project and one RPC provider, with no redundancy, monitoring or alerting.

## 8. Security and compliance

- **No external security audit.** The contracts have 52 automated tests, including fuzzing, but have not been independently reviewed.
- **Server-held keys.** The arbiter key and the minter key sit in server environment variables. Production would use a hardware security module or a key-management service.
- **No legal or regulatory review.** Holding customer funds in escrow, issuing a stablecoin-based balance and operating ramps would all need legal and licensing review in South Africa before launch.
- **Testnet only.** Nothing here should hold real value.

---

## Planned fixes, in priority order

1. Wallet restore from the recovery phrase on any device, plus hiding "Create wallet" when one is already linked.
2. Remove the legacy payout functions in a contract redeploy.
3. Independent arbiters, a separate bond pool and an appeals process.
4. A real ZAR payments partner for on and off-ramps, with on-chain burn on cash-out.
5. Courier integrations for delivery attestation and automatic release.
6. Identity and phone verification, with the Verified and Restricted seller tiers.
7. Independent security review and a legal and regulatory assessment.
