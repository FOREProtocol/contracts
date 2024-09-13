import { ethers } from "ethers";

export const incentives = {
  foreToken: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 1000,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
  usdt: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 1000,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
};

export const contractAddresses = {
  arbitrumTestnet: {
    accessManager: "0x664d1e8a89C240e27f511b474e71a6845edC17d8",
    protocol: "0x58718251d687DF51b7cc4c75546eE57a624B9A4f",
    protocolConfig: "0x741eDDD71FC1231D466e5f4d6975a2f3ec40F8D3",
    foreToken: "0x0B34793E6E996aA34031d29f4b62b2e9ad684B4A",
    mockUsdt: "0x7b092Da900Bcaf79F8228966Eb4f345945bf4645",
    tokenRegistry: "0xcD0A51823Cc580E2fb5a55e3aE1A137D28B7CF67",
    factory: "0xb462ef7303dD74722B22f1B5C45A555A7cfb8048",
    marketLib: "0x7E1ba66e731f9e09FD9082ef3eedf8A00f295583",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    router: "0x09Dc07116C24A0EF76420316F0aCb3e227033a1b",
    accountWhitelist: "0x842F6061E158B93aF531903E88da33aAb8b61BB3",
    marketplace: "0x0e3Bb834e8b7ce33A5666cB69e59ead693830669",
    foreVerifiers: "0x7Bd2102a585E03229a4Ddf7D45cA5399E8e23Bb5",
    verifiersNFTHelper: "0x063316a43c53c73b7e096beC6f2DAc12d7900437",
  },
};
