import { ethers } from "ethers";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

/**
 * Approves `spender` to spend `tokenAddress` on behalf of the signer.
 * Skips if an unlimited allowance already exists.
 * Always approves MaxUint256 so the user only needs to approve once per token/spender pair.
 */
export async function ensureAllowance(
  signer: ethers.Signer,
  tokenAddress: string,
  spender: string,
): Promise<void> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const owner: string = await signer.getAddress();
  const current: bigint = await token.allowance(owner, spender);
  // Only skip if already MaxUint256 — any lesser amount may be insufficient
  // for contracts that multiply amount × pricePerToken without normalization.
  if (current === ethers.MaxUint256) return;
  const tx = await token.approve(spender, ethers.MaxUint256);
  await tx.wait();
}
