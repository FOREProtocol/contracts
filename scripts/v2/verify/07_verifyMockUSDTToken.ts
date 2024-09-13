import hre, { network } from "hardhat";
import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying mock usdt on ${network}...`);

  await hre.run("verify:verify", {
    contract: "contracts/token/MockUSDTToken.sol:MockUSDT",
    address: contractAddresses[network].mockUsdt,
    constructorArguments: [],
  });
  console.log("Mock USDT verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
