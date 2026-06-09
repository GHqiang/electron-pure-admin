/**
 * 万达 AES 解密工具
 * 直接照搬小程序 packageUtils/lib/UtilsSDKManager.js 的 aesDecrypt 方法：
 *   CryptoJS.AES.decrypt(ciphertext, key, { mode: ECB, padding: Pkcs7 })
 *
 * 用法:
 *   import { wandaAesDecrypt } from '@/utils/wandaAesDecrypt';
 *   const jsonStr = wandaAesDecrypt(hexString);
 *   const data = JSON.parse(jsonStr);
 */

import CryptoJS from "crypto-js";

/** 生产环境 AES 密钥（wasm/wasm.js: prd → "1e49819eeea6f639"） */
const WANDA_AES_KEY = "1e49819eeea6f639";

/**
 * 解密 Wanda 活动/券接口的 hex 密文
 * @param {string} hexStr - 加密的 hex 字符串
 * @param {string} [keyStr] - AES 密钥（默认生产环境密钥）
 * @returns {string|null} 解密后的明文字符串
 */
export function wandaAesDecrypt(hexStr, keyStr = WANDA_AES_KEY) {
  try {
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Hex.parse(hexStr)
    });
    const key = CryptoJS.enc.Utf8.parse(keyStr);
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.warn("[WandaAes] 解密失败:", e.message);
    return null;
  }
}
