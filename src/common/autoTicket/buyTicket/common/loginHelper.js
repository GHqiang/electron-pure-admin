/**
 * 登录信息获取与排序工具
 * 统一封装各影院系列登录账号的获取和排序逻辑
 * 
 * 说明：
 * - 影院系列（app_type_code）：如 chenxing_applet、sfc_applet、ume_applet 等
 * - 具体影院（appFlag/app_name）：每个系列下的不同影院
 * - 本工具按 appFlag 过滤登录信息，并提供统一的排序逻辑供各系列类使用
 */

import { getCinemaLoginInfoList } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";

const tokens = platTokens();

/**
 * 获取基础登录列表（按 appFlag 过滤）
 * @param {string} appFlag - 影院标识
 * @returns {Array} 过滤后的登录信息列表
 */
export function getBaseLoginList(appFlag) {
  return getCinemaLoginInfoList().filter(
    item =>
      item.app_name === appFlag &&
      item.mobile &&
      item.session_id &&
      item.member_pwd
  );
}

/**
 * 按 first 字段和当前用户手机号排序
 * @param {Array} list - 登录信息列表
 * @param {string} currentUserPhone - 当前登录用户手机号
 * @returns {Array} 排序后的列表
 */
export function sortLoginByFirstAndCurrentUser(list, currentUserPhone) {
  return list.slice().sort((a, b) => {
    // 优先按 first 字段排序
    if (a.first === "1" && b.first !== "1") return -1;
    if (a.first !== "1" && b.first === "1") return 1;

    // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
    if (a.first === "1" && b.first === "1") {
      if (a.mobile === currentUserPhone) return -1;
      if (b.mobile === currentUserPhone) return 1;
      return 0;
    }

    // 如果 first 都不是 '1'，则按 mobile 字段排序
    if (a.mobile === currentUserPhone) return -1;
    if (b.mobile === currentUserPhone) return 1;

    return 0;
  });
}

/**
 * 按可用卡手机号排序（有可用卡的手机号优先）
 * @param {Array} list - 登录信息列表
 * @param {Array<string>} cardLinkMobile - 有可用卡的手机号列表
 * @returns {Array} 排序后的列表
 */
export function sortLoginByCardPhones(list, cardLinkMobile) {
  if (!cardLinkMobile?.length) return list;
  return list.slice().sort((a, b) => {
    const aIn = cardLinkMobile.includes(a.mobile);
    const bIn = cardLinkMobile.includes(b.mobile);
    if (aIn && !bIn) return -1;
    if (!aIn && bIn) return 1;
    return 0;
  });
}

/**
 * 按券库存关联手机号排序（券库存多的手机号优先）
 * @param {Array} list - 登录信息列表
 * @param {Array<string>} quanMobileList - 按券库存排序后的手机号列表
 * @returns {Array} 排序后的列表
 */
export function sortLoginByQuanPhones(list, quanMobileList) {
  if (!quanMobileList?.length) return list;
  return list.slice().sort((a, b) => {
    const indexA = quanMobileList.indexOf(a.mobile);
    const indexB = quanMobileList.indexOf(b.mobile);
    if (indexA !== -1 && indexB === -1) return -1;
    if (indexA === -1 && indexB !== -1) return 1;
    return 0;
  });
}

/**
 * 组合排序：先按 first/当前用户，再按卡/券排序
 * @param {Object} params
 * @param {string} params.appFlag - 影院标识
 * @param {Array<string>} [params.cardLinkMobile] - 有可用卡的手机号列表
 * @param {Array<string>} [params.quanMobileList] - 按券库存排序后的手机号列表
 * @param {string} [params.currentUserPhone] - 当前登录用户手机号（默认从 platTokens 获取）
 * @returns {Array} 排序后的登录信息列表
 */
export function getSortedLoginList({
  appFlag,
  cardLinkMobile,
  quanMobileList,
  currentUserPhone
}) {
  let list = getBaseLoginList(appFlag);
  const userPhone = currentUserPhone || tokens.userInfo?.phone;

  // 第一层：按 first 和当前用户手机号排序
  list = sortLoginByFirstAndCurrentUser(list, userPhone);

  // 第二层：按卡或券排序
  if (cardLinkMobile?.length) {
    list = sortLoginByCardPhones(list, cardLinkMobile);
  } else if (quanMobileList?.length) {
    list = sortLoginByQuanPhones(list, quanMobileList);
  }

  return list;
}
