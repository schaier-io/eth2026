import { createSwarmKvStore, fixedPostage } from "@truth-market/swarm-kv";

const beeApiUrl = process.env.SWARM_KV_BEE_API_URL ?? "http://localhost:1633";
const postageBatchId = process.env.SWARM_POSTAGE_BATCH_ID;

if (!postageBatchId) {
  throw new Error("Set SWARM_POSTAGE_BATCH_ID to a Bee postage batch id.");
}

const store = createSwarmKvStore({
  beeApiUrl,
  gatewayUrl: beeApiUrl,
  postage: fixedPostage(postageBatchId),
  namespace: "example.public-kv:v1",
  privateByDefault: false
});

const profile = await store.put("profile:name", "Ada Lovelace");
await store.put("settings", { theme: "dark", compact: true });
await store.put("avatar", new Uint8Array([1, 2, 3, 4]));

console.log("latest index", profile.indexReference);
console.log("name", await store.getString("profile:name"));
console.log("settings", await store.getJson("settings"));
console.log("avatar bytes", await store.getBytes("avatar"));
console.log("keys", await store.list());

for await (const entry of store.entries()) {
  console.log(entry.key, entry.contentType, entry.reference, entry.verification.verified);
}

await store.delete("avatar");
console.log("after delete", await store.list());
