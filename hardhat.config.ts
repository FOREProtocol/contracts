import * as dotenv from "dotenv";
import { HardhatUserConfig, task } from "hardhat/config";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@typechain/hardhat";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";
import "hardhat-docgen";
import "hardhat-gas-reporter";
import "hardhat-interface-generator";
import "solidity-coverage";
import "hardhat-deploy";
import "@openzeppelin/hardhat-upgrades";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    outputSelection: {
                        "*": {
                            "*": ["storageLayout"],
                        },
                    },
                },
            },
            {
                version: "0.4.25",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    outputSelection: {
                        "*": {
                            "*": ["storageLayout"],
                        },
                    },
                },
            },
        ],
    },
    namedAccounts: {
        deployer: 0,
    },
    networks: {
        hardhat: {
            accounts: {
                mnemonic:
                    process.env.MNEMONIC_TESTNET !== undefined
                        ? process.env.MNEMONIC_TESTNET
                        : "",
            },
            saveDeployments: true,
            deploy: ["deploy/" + process.env.LOCAL_DEPLOY + "/"],
        },
        fantom: {
            url: process.env.FANTOM_URL || "",
            chainId: 250,
            accounts: {
                mnemonic:
                    process.env.MNEMONIC_MAINNET !== undefined
                        ? process.env.MNEMONIC_MAINNET
                        : "",
            },
            verify: {
                etherscan: {
                    apiUrl: "https://api.ftmscan.com",
                    apiKey: process.env.FTMSCAN_API_KEY,
                },
            },
            saveDeployments: true,
            deploy: ["deploy/fantom/"],
        },
        arbitrumTestnet: {
            url: process.env.ARBITRUM_TESTNET_URL || "",
            chainId: 421614,
            accounts: {
                mnemonic:
                    process.env.MNEMONIC_TESTNET !== undefined
                        ? process.env.MNEMONIC_TESTNET
                        : "",
            },
            saveDeployments: true,
            deploy: ["deploy/arbitrum/"],
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
        // gasPrice: 100,
        token: "FTM",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    },
    verify: {
        etherscan: {
            apiKey: process.env.FTMSCAN_API_KEY,
        },
    },
    etherscan: {
        apiKey: {
            fantom: process.env.FTMSCAN_API_KEY,
            ftmTestnet: process.env.FTMSCAN_API_KEY,
            goerli: process.env.ETHERSCAN_API_KEY,
        },
        customChains: [
            {
                network: "ftmTestnet",
                chainId: 4002,
                urls: {
                    apiURL: "https://api-testnet.ftmscan.com/api",
                    browserURL: "https://testnet.ftmscan.com",
                },
            },
            {
                network: "fantom",
                chainId: 250,
                urls: {
                    apiURL: "https://api.ftmscan.com",
                    browserURL: "https://ftmscan.com",
                },
            },
        ],
    },
    docgen: {
        path: "./docs",
        clear: true,
        runOnCompile: false,
    },
};

export default config;
