# ForeProtocol Contracts

**A DECENTRALIZED, PEER-TO-PEER PREDICTIONS PROTOCOL.**

---

# Getting started

#### 1. Installation:

```
npm i
```

#### 2. Configuration

Create `.env` file based on `.env.example` . Enter your testnet and mainnet mnemonic phrases(12 words), api keys for verification and wallet addresses for roles.

#### 3. Compile and Tests

```
npm run compile
```

```
npm run test
```

4. Generate Documentation

```
npm run docgen
```

Documentation files will appear in the `/docs` folder, open `index.html` in a browser to read it. In folder you also find 'contracts.json' file with all networks deployments artifacts.

#### 5. Local migrations/local deployment

Run local node and deploy contracts for selected(env.LOCAL_DEPLOY) chain :

```
npm run node
```

#### 6. Testnet/production deployment

Make sure that first account (id[0]) for selected mnemonic has a native currency on selected network. Use a faucets for a testnets.

Testnet deployment (fantom testnet, using env.MNEMONIC_MAINNET)

```
npm run testnet
```

Production deployment (fantom, using env.MNEMONIC_MAINNET)

```
npm run mainnet
```

Custom network (please set hardcat.config.ts first)

```
npx hardhat deploy --network <network_name>
```

Deployment info will store on deployments folder

#### 7. Scripts

Distribute test tokens: 

Fulfill receivers list in `scripts/distributeTestTokens.ts` and run: 

```
npx hardhat run --network <network_name> scripts/distributeTestTokens.ts
```

Initialize vesting:
Create `/scripts/data/vesting.csv` based on vesting.csv.example and run: 

```
npx hardhat run --network <network_name> scripts/initiateVesting.ts

```

#### 8. Verification

Make sure that you have deployments artifacts for selected network in `deployments` folder. To verify run: 
```
npx hardhat run --network <network_name> scripts/verify.ts

```

Market contract verification (not working on ftmTestnet). 
Add base market contract address to `scripts/verify.ts` and run

```
npx hardhat run --network <network_name> scripts/verifyMarketContract.ts

```