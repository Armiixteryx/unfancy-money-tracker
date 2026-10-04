import { MMKV } from "react-native-mmkv";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { credentialNamespace } from "./config";
let storage: Promise<MMKV> | undefined;
function getStorage() {
  if (!storage) storage = (async () => {
    const name = `${credentialNamespace}.key`;
    let key = await SecureStore.getItemAsync(name);
    if (!key) {
      key = [...await Crypto.getRandomBytesAsync(16)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      await SecureStore.setItemAsync(name, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    }
    return new MMKV({ id: credentialNamespace, encryptionKey: key });
  })().catch(error => { storage = undefined; throw error; });
  return storage;
}
export const credentialStorage = {
  async getItem(key: string) { return (await getStorage()).getString(key) ?? null; },
  async setItem(key: string, value: string) { (await getStorage()).set(key, value); },
  async removeItem(key: string) { (await getStorage()).delete(key); },
  async clear() { (await getStorage()).clearAll(); },
};
