import { createSwarmKvStore, fixedPostage } from "@truth-market/swarm-kv";

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

if (!window.ethereum) {
  throw new Error("No injected Ethereum wallet found.");
}

const [account] = (await window.ethereum.request({
  method: "eth_requestAccounts"
})) as string[];

const signer = {
  address: account,
  async signMessage(message: string): Promise<string> {
    return window.ethereum!.request({
      method: "personal_sign",
      params: [message, account]
    }) as Promise<string>;
  }
};

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage("<your-postage-batch-id>"),
  namespace: "example.private-kv:v1",
  owner: account,
  signer,
  encryptionKey: "replace-with-stable-user-key-material"
});

await store.put("settings", { theme: "dark", notifications: true });
await store.put("bookmark:swarm", "https://docs.ethswarm.org/");

console.log(await store.list());
console.log(await store.getJson("settings"));
console.log("save this index reference", store.indexReference);
