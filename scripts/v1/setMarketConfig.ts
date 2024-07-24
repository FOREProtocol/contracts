import hre, { ethers } from "hardhat";
import { HttpNetworkUserConfig } from "hardhat/types";
import { contractAddresses } from "./constants";

// `npx hardhat run scripts/v1/setMarketConfig.ts --network arbitrum`
async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Setting market config on ${network}...`);

  const config = hre.config.networks[network] as HttpNetworkUserConfig;
  const provider = new ethers.providers.JsonRpcProvider(config.url);
  const accounts = config.accounts as { mnemonic: string };
  const owner = ethers.Wallet.fromMnemonic(accounts.mnemonic).connect(provider);

  const protocolConfig = (
    await ethers.getContractFactory("ProtocolConfig", owner)
  ).attach(contractAddresses[network].protocolConfig);

  await protocolConfig.setMarketConfig(
    ethers.utils.parseEther("1000"), // verifier mint price
    ethers.utils.parseEther("1000"), // dispute price
    ethers.utils.parseEther("10"), // creation price
    86400, // report period
    43200, // verification period
    100, // burn fee
    650, // Change foundation fee from 1.5 to 6.5
    50, // market creator fee
    200 // verification fee
  );

  console.log("Successfully updated config");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
