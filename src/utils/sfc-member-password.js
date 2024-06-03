import aes from "./aes";
// y = require("../../../util/aes.js"),
// m = y.enc.Utf8.parse("1de&^*-#gsol&^*-"),
// P = y.enc.Utf8.parse("1rue%#ls;1&8^*-#")
const m = aes.enc.Utf8.parse("1de&^*-#gsol&^*-");
const P = aes.enc.Utf8.parse("1rue%#ls;1&8^*-#");
const encode = cardPass => {
  return aes.encrypt(cardPass, m, P);
};
const decode = cardPass => {
  return aes.decrypt(cardPass, m, P);
};
export { encode, decode };
