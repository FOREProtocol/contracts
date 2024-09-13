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
  accessManager: "0xba96900De32A0ed9298533226B40545663713998",
  feeReceiver: "0x3ec4366667aeB997DE9CF4054C55fFD74D53988A",
  foreFoundationMultiSign: "0x3ec4366667aeB997DE9CF4054C55fFD74D53988A",
  foreAccessManager: "0x2B2f78c5BF6D9C12Ee1225D5F374aa91204580c3",
  protocol: "0x4936de275CFdCf84F4130441305a1027ebb1AC43",
  foreToken: "0xe9e2889d515Fd4bF764Ea927Af13Aaf974Cde21E",
  usdt: "0x665EC67D3dc1B525404e63cfa35fC28A3cbeb210",
  tokenRegistry: "0x6D0b0c50B07E22d8c394e73B1BBf79dB23dB0C65",
  factory: "0xD10c43a685DE24b8783716933D485e7f1Bea3315",
  marketLib: "0xfd46fcda0a1c862f14b311716a6a6140ec9adbf2",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  router: "0xAcFECdD87114CA6E2a85E80944012D5c6dcA9A45",
  accountWhitelist: "0x81d869c6380B51ea23bB8189590fA3D247237aA9",
};
