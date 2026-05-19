import { client, MainnetChain } from "~/lib/client";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { Account } from "thirdweb/wallets";
import p2pContractABI from "./p2p-abi.json";

export const p2pContractAddress = "0xFD904B5F3AAa0d86A008e1622b51e947320e151E";

export const getSigner = async (activeAccount: Account): Promise<ethers.Signer> => {
  const signer = ethers6Adapter.signer.toEthers({ client, chain: MainnetChain, account: activeAccount });
  return signer as unknown as ethers.Signer;
};

export const p2pContractInstance = async (activeAccount: Account) => {
  try {
    if (!activeAccount) {
      console.log("No active account found");
      return;
    }

    const signerEthers = await getSigner(activeAccount);
    return new ethers.Contract(p2pContractAddress, p2pContractABI, signerEthers);
  } catch (error) {
    console.log("Error creating p2p contract instance", error);
  }
};
