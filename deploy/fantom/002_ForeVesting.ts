import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { getDeployedContract } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const foreToken: Contract = await getDeployedContract("ForeToken");

    await deploy("ForeVesting", {
        from: deployer,
        args: [foreToken.address],
        log: true,
    });
};
export default func;
func.tags = ["ForeVesting", "ForeToken"];
