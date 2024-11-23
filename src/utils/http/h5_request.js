// 假设这是 TqRt 模块的内容
const TqRt = (function (t, e, r) {
  "use strict";
  t.exports = function (t) {
    return t && t.__esModule
      ? t
      : {
          default: t
        };
  };
  t.exports.__esModule = !0;
  t.exports.default = t.exports;
  return t.exports;
})({}, {});

// 假设这是 RTtl 模块的内容
const RTtlModule = {};
(function (t, e) {
  "use strict";
  "undefined" == typeof window &&
    (window = {
      ctrl: {},
      lib: {}
    }),
    !window.ctrl && (window.ctrl = {}),
    !window.lib && (window.lib = {}),
    (function (t, e) {
      function r() {
        var t = {},
          e = new l(function (e, r) {
            (t.resolve = e), (t.reject = r);
          });
        return (t.promise = e), t;
      }
      function n(t, e) {
        for (var r in e) void 0 === t[r] && (t[r] = e[r]);
        return t;
      }
      function i(t) {
        var e = [];
        for (var r in t) t[r] && e.push(r + "=" + encodeURIComponent(t[r]));
        return e.join("&");
      }
      function o(t) {
        return "[object Object]" == {}.toString.call(t);
      }
      function s(t) {
        var e = new RegExp("(?:^|;\\s*)" + t + "\\=([^;]+)(?:;\\s*|$)").exec(
          document.cookie
        );
        return e ? e[1] : void 0;
      }
      function a(t, e, r) {
        var n = new Date();
        n.setTime(n.getTime() - 864e5);
        (document.cookie =
          t + "=;path=/;domain=." + e + ";expires=" + n.toGMTString()),
          (document.cookie =
            t +
            "=;path=/;domain=." +
            r +
            "." +
            e +
            ";expires=" +
            n.toGMTString());
      }
      function u(t, e) {
        for (var r = t.split("."), n = e.split("."), i = 0; 3 > i; i++) {
          var o = Number(r[i]),
            s = Number(n[i]);
          if (o > s) return 1;
          if (s > o) return -1;
          if (!isNaN(o) && isNaN(s)) return 1;
          if (isNaN(o) && !isNaN(s)) return -1;
        }
        return 0;
      }
      function c(t) {
        (this.id = "" + new Date().getTime() + ++g),
          (this.params = n(t || {}, {
            v: "*",
            data: {},
            type: "get",
            dataType: "jsonp"
          })),
          (this.params.type = this.params.type.toLowerCase()),
          "object" == typeof this.params.data &&
            (this.params.data = JSON.stringify(this.params.data)),
          (this.middlewares = d.slice(0));
      }
      var l = t.Promise,
        f = (
          l || {
            resolve: function () {}
          }
        ).resolve();
      String.prototype.trim ||
        (String.prototype.trim = function () {
          return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
        });
      var h = {
          useJsonpResultType: !1,
          safariGoLogin: !0,
          useAlipayJSBridge: !1
        },
        d = [],
        p = {
          ERROR: -1,
          SUCCESS: 0,
          TOKEN_EXPIRED: 1,
          SESSION_EXPIRED: 2
        };
      (function () {
        var e = t.location.hostname;
        if (!e) {
          var r = t.parent.location.hostname;
          r && ~r.indexOf("zebra.alibaba-inc.com") && (e = r);
        }
        var n = new RegExp(
            "([^.]*?)\\.?((?:" +
              [
                "taobao.net",
                "taobao.com",
                "tmall.com",
                "tmall.hk",
                "alibaba-inc.com"
              ]
                .join(")|(?:")
                .replace(/\./g, "\\.") +
              "))",
            "i"
          ),
          i = e.match(n) || [],
          o = i[2] || "taobao.com",
          s = i[1] || "m";
        "taobao.net" !== o || ("x" !== s && "waptest" !== s && "daily" !== s)
          ? "taobao.net" === o && "demo" === s
            ? (s = "demo")
            : "alibaba-inc.com" === o && "zebra" === s
              ? (s = "zebra")
              : "waptest" !== s && "wapa" !== s && "m" !== s && (s = "m")
          : (s = "waptest");
        var a = "h5api";
        "taobao.net" === o && "waptest" === s && (a = "acs"),
          (h.mainDomain = o),
          (h.subDomain = s),
          (h.prefix = a);
      })(),
        (function () {
          var e = t.navigator.userAgent,
            r = e.match(/WindVane[\/\s]([\d\.\_]+)/);
          r && (h.WindVaneVersion = r[1]);
          var n = e.match(/AliApp\(([^\/]+)\/([\d\.\_]+)\)/i);
          n && ((h.AliAppName = n[1]), (h.AliAppVersion = n[2]));
          var i = e.match(/AMapClient\/([\d\.\_]+)/i);
          i && ((h.AliAppName = "AMAP"), (h.AliAppVersion = i[1]));
        })();
      var m = /[Android|Adr]/.test(t.navigator.userAgent),
        y =
          ("AP" === h.AliAppName && u(h.AliAppVersion, "10.1.2") >= 0) ||
          ("KB" === h.AliAppName && u(h.AliAppVersion, "7.1.62") >= 0) ||
          (m && "AMAP" === h.AliAppName && u(h.AliAppVersion, "1.0.1") >= 0),
        g = 0;
      (c.prototype.use = function (t) {
        if (!t) throw new Error("middleware is undefined");
        return this.middlewares.push(t), this;
      }),
        (c.prototype.__processRequestMethod = function (t) {
          var e = this.params,
            r = this.options;
          "get" === e.type && "jsonp" === e.dataType
            ? (r.getJSONP = !0)
            : "get" === e.type && "originaljsonp" === e.dataType
              ? (r.getOriginalJSONP = !0)
              : "get" === e.type && "json" === e.dataType
                ? (r.getJSON = !0)
                : "post" === e.type && (r.postJSON = !0),
            t();
        }),
        (c.prototype.__processRequestType = function (r) {
          var n = this,
            i = this.params,
            s = this.options;
          if (
            (!0 === h.H5Request && (s.H5Request = !0),
            !0 === h.WindVaneRequest && (s.WindVaneRequest = !0),
            !1 === s.H5Request && !0 === s.WindVaneRequest)
          ) {
            if (!y && (!e.windvane || parseFloat(s.WindVaneVersion) < 5.4))
              throw new Error("WINDVANE_NOT_FOUND::缺少WindVane环境");
            if (y && !t.AlipayJSBridge)
              throw new Error(
                "ALIPAY_NOT_READY::支付宝通道未准备好，支付宝请见 https://lark.alipay.com/mtbsdkdocs/mtopjssdkdocs/pucq6z"
              );
          } else if (!0 === s.H5Request) s.WindVaneRequest = !1;
          else if (void 0 === s.WindVaneRequest && void 0 === s.H5Request) {
            if (
              (e.windvane && parseFloat(s.WindVaneVersion) >= 5.4
                ? (s.WindVaneRequest = !0)
                : (s.H5Request = !0),
              y)
            ) {
              if (
                ((s.WindVaneRequest = s.H5Request = void 0), t.AlipayJSBridge)
              )
                if (o(i.data)) s.WindVaneRequest = !0;
                else
                  try {
                    o(JSON.parse(i.data))
                      ? (s.WindVaneRequest = !0)
                      : (s.H5Request = !0);
                  } catch (t) {
                    s.H5Request = !0;
                  }
              else s.H5Request = !0;
              "AMAP" !== h.AliAppName ||
                i.useNebulaJSbridgeWithAMAP ||
                ((s.WindVaneRequest = s.H5Request = void 0),
                (s.H5Request = !0));
            }
            window.self !== window.top && (s.H5Request = !0);
          }
          var a = t.navigator.userAgent.toLowerCase();
          return (
            a.indexOf("youku") > -1 &&
              s.mainDomain.indexOf("youku.com") < 0 &&
              ((s.WindVaneRequest = !1), (s.H5Request = !0)),
            s.mainDomain.indexOf("youku.com") > -1 &&
              a.indexOf("youku") < 0 &&
              ((s.WindVaneRequest = !1), (s.H5Request = !0)),
            r
              ? r().then(function () {
                  var t = s.retJson.ret;
                  if (
                    (t instanceof Array && (t = t.join(",")),
                    (!0 === s.WindVaneRequest && y && s.retJson.error) ||
                      !t ||
                      t.indexOf("PARAM_PARSE_ERROR") > -1 ||
                      t.indexOf("HY_FAILED") > -1 ||
                      t.indexOf("HY_NO_HANDLER") > -1 ||
                      t.indexOf("HY_CLOSED") > -1 ||
                      t.indexOf("HY_EXCEPTION") > -1 ||
                      t.indexOf("HY_NO_PERMISSION") > -1)
                  ) {
                    if (
                      !y ||
                      !isNaN(s.retJson.error) ||
                      -1 !== s.retJson.error.indexOf("FAIL_SYS_ACCESS_DENIED")
                    )
                      return (
                        y && o(i.data) && (i.data = JSON.stringify(i.data)),
                        (h.H5Request = !0),
                        n.__sequence([
                          n.__processRequestType,
                          n.__processToken,
                          n.__processRequestUrl,
                          n.middlewares,
                          n.__processRequest
                        ])
                      );
                    void 0 === s.retJson.api &&
                      void 0 === s.retJson.v &&
                      ((s.retJson.api = i.api),
                      (s.retJson.v = i.v),
                      (s.retJson.ret = [
                        s.retJson.error + "::" + s.retJson.errorMessage
                      ]),
                      (s.retJson.data = {}));
                  }
                })
              : void 0
          );
        });
      var v = "_m_h5_c",
        b = "_m_h5_tk";
      (c.prototype.__getTokenFromAlipay = function () {
        var e = r(),
          n = this.options,
          i = (t.navigator.userAgent, !!location.protocol.match(/^https?\:$/));
        return (
          !0 === n.useAlipayJSBridge &&
          !i &&
          y &&
          t.AlipayJSBridge &&
          t.AlipayJSBridge.call
            ? t.AlipayJSBridge.call(
                "getMtopToken",
                function (t) {
                  t && t.token && (n.token = t.token), e.resolve();
                },
                function () {
                  e.resolve();
                }
              )
            : e.resolve(),
          e.promise
        );
      }),
        (c.prototype.__getTokenFromCookie = function () {
          var t = this.options;
          return (
            t.CDR && s(v)
              ? (t.token = s(v).split(";")[0])
              : (t.token = t.token || s(b)),
            t.token && (t.token = t.token.split("_")[0]),
            l.resolve()
          );
        }),
        (c.prototype.__waitWKWebViewCookie = function (e) {
          var r = this.options;
          r.waitWKWebViewCookieFn &&
          r.H5Request &&
          t.webkit &&
          t.webkit.messageHandlers
            ? r.waitWKWebViewCookieFn(e)
            : e();
        }),
        (c.prototype.__processToken = function (t) {
          var e = this,
            r = this.options;
          return (
            this.params,
            r.token && delete r.token,
            !0 !== r.WindVaneRequest
              ? f
                  .then(function () {
                    return e.__getTokenFromAlipay();
                  })
                  .then(function () {
                    return e.__getTokenFromCookie();
                  })
                  .then(t)
                  .then(function () {
                    var t = r.retJson,
                      n = t.ret;
                    if (
                      (n instanceof Array && (n = n.join(",")),
                      n.indexOf("TOKEN_EMPTY") > -1 ||
                        ((!0 === r.CDR || !0 === r.syncCookieMode) &&
                          n.indexOf("ILLEGAL_ACCESS") > -1) ||
                        n.indexOf("TOKEN_EXOIRED") > -1)
                    ) {
                      if (
                        ((r.maxRetryTimes = r.maxRetryTimes || 5),
                        (r.failTimes = r.failTimes || 0),
                        r.H5Request && ++r.failTimes < r.maxRetryTimes)
                      ) {
                        var i = [
                          e.__waitWKWebViewCookie,
                          e.__processToken,
                          e.__processRequestUrl,
                          e.middlewares,
                          e.__processRequest
                        ];
                        if (
                          !0 === r.syncCookieMode &&
                          e.constructor.__cookieProcessorId !== e.id
                        )
                          if (e.constructor.__cookieProcessor) {
                            i = [
                              function (t) {
                                var r = function () {
                                  (e.constructor.__cookieProcessor = null),
                                    (e.constructor.__cookieProcessorId = null),
                                    t();
                                };
                                e.constructor.__cookieProcessor
                                  ? e.constructor.__cookieProcessor
                                      .then(r)
                                      .catch(r)
                                  : t();
                              },
                              e.__waitWKWebViewCookie,
                              e.__processToken,
                              e.__processRequestUrl,
                              e.middlewares,
                              e.__processRequest
                            ];
                          } else
                            (e.constructor.__cookieProcessor =
                              e.__requestProcessor),
                              (e.constructor.__cookieProcessorId = e.id);
                        return e.__sequence(i);
                      }
                      r.maxRetryTimes > 0 &&
                        (a(v, r.pageDomain, "*"),
                        a(b, r.mainDomain, r.subDomain),
                        a("_m_h5_tk_enc", r.mainDomain, r.subDomain)),
                        (t.retType = p.TOKEN_EXPIRED);
                    }
                  })
              : void t()
          );
        }),
        (c.prototype.__processRequestUrl = function (e) {
          var r = this.params,
            n = this.options;
          // n.hostSetting = {
          //   "h5lark.yuekeyun.com": {}
          // };
          n.pageDomain = "yuekeyun.com";
          // n.prefix = "h5api";
          console.log("this.params", this.params);
          console.log("this.options", this.options);
          if (n.hostSetting && n.hostSetting[t.location.hostname]) {
            var i = n.hostSetting[t.location.hostname];
            i.prefix && (n.prefix = i.prefix),
              i.subDomain && (n.subDomain = i.subDomain),
              i.mainDomain && (n.mainDomain = i.mainDomain);
          }
          if (!0 === n.H5Request) {
            var o =
              "//" +
              (n.prefix ? n.prefix + "." : "") +
              (n.subDomain ? n.subDomain + "." : "") +
              n.mainDomain +
              // "/svpi/ume-ser/h5/" +
              "/h5/" +
              r.api.toLowerCase() +
              "/" +
              r.v.toLowerCase() +
              "/";
            console.log("o===>", o);
            var s =
                r.appKey || ("waptest" === n.subDomain ? "4272" : "12574478"),
              a = new Date().getTime();
            n.token = "2b6658e6c1e054a8a798429d5b6e95d0"; // 从Cookie里面取_m_h5_tk的下横线前半部分
            console.log("r===>", r);
            let createUStr = n.token + "&" + a + "&" + s + "&" + r.data;
            console.log("createUStr", createUStr);
            var u = (function (t) {
              function e(t, e) {
                return (t << e) | (t >>> (32 - e));
              }
              function r(t, e) {
                var r, n, i, o, s;
                return (
                  (i = 2147483648 & t),
                  (o = 2147483648 & e),
                  (s = (1073741823 & t) + (1073741823 & e)),
                  (r = 1073741824 & t) & (n = 1073741824 & e)
                    ? 2147483648 ^ s ^ i ^ o
                    : r | n
                      ? 1073741824 & s
                        ? 3221225472 ^ s ^ i ^ o
                        : 1073741824 ^ s ^ i ^ o
                      : s ^ i ^ o
                );
              }
              function n(t, n, i, o, s, a, u) {
                return (
                  (t = r(
                    t,
                    r(
                      r(
                        (function (t, e, r) {
                          return (t & e) | (~t & r);
                        })(n, i, o),
                        s
                      ),
                      u
                    )
                  )),
                  r(e(t, a), n)
                );
              }
              function i(t, n, i, o, s, a, u) {
                return (
                  (t = r(
                    t,
                    r(
                      r(
                        (function (t, e, r) {
                          return (t & r) | (e & ~r);
                        })(n, i, o),
                        s
                      ),
                      u
                    )
                  )),
                  r(e(t, a), n)
                );
              }
              function o(t, n, i, o, s, a, u) {
                return (
                  (t = r(
                    t,
                    r(
                      r(
                        (function (t, e, r) {
                          return t ^ e ^ r;
                        })(n, i, o),
                        s
                      ),
                      u
                    )
                  )),
                  r(e(t, a), n)
                );
              }
              function s(t, n, i, o, s, a, u) {
                return (
                  (t = r(
                    t,
                    r(
                      r(
                        (function (t, e, r) {
                          return e ^ (t | ~r);
                        })(n, i, o),
                        s
                      ),
                      u
                    )
                  )),
                  r(e(t, a), n)
                );
              }
              function a(t) {
                var e,
                  r = "",
                  n = "";
                for (e = 0; 3 >= e; e++)
                  r += (n = "0" + ((t >>> (8 * e)) & 255).toString(16)).substr(
                    n.length - 2,
                    2
                  );
                return r;
              }
              var u, c, l, f, h, d, p, m, y, g;
              for (
                g = (function (t) {
                  for (
                    var e,
                      r = t.length,
                      n = r + 8,
                      i = 16 * ((n - (n % 64)) / 64 + 1),
                      o = new Array(i - 1),
                      s = 0,
                      a = 0;
                    r > a;

                  )
                    (s = (a % 4) * 8),
                      (o[(e = (a - (a % 4)) / 4)] =
                        o[e] | (t.charCodeAt(a) << s)),
                      a++;
                  return (
                    (s = (a % 4) * 8),
                    (o[(e = (a - (a % 4)) / 4)] = o[e] | (128 << s)),
                    (o[i - 2] = r << 3),
                    (o[i - 1] = r >>> 29),
                    o
                  );
                })(
                  (t = (function (t) {
                    t = t.replace(/\r\n/g, "\n");
                    for (var e = "", r = 0; r < t.length; r++) {
                      var n = t.charCodeAt(r);
                      128 > n
                        ? (e += String.fromCharCode(n))
                        : n > 127 && 2048 > n
                          ? ((e += String.fromCharCode((n >> 6) | 192)),
                            (e += String.fromCharCode((63 & n) | 128)))
                          : ((e += String.fromCharCode((n >> 12) | 224)),
                            (e += String.fromCharCode(((n >> 6) & 63) | 128)),
                            (e += String.fromCharCode((63 & n) | 128)));
                    }
                    return e;
                  })(t))
                ),
                  d = 1732584193,
                  p = 4023233417,
                  m = 2562383102,
                  y = 271733878,
                  u = 0;
                u < g.length;
                u += 16
              )
                (c = d),
                  (l = p),
                  (f = m),
                  (h = y),
                  (d = n(d, p, m, y, g[u + 0], 7, 3614090360)),
                  (y = n(y, d, p, m, g[u + 1], 12, 3905402710)),
                  (m = n(m, y, d, p, g[u + 2], 17, 606105819)),
                  (p = n(p, m, y, d, g[u + 3], 22, 3250441966)),
                  (d = n(d, p, m, y, g[u + 4], 7, 4118548399)),
                  (y = n(y, d, p, m, g[u + 5], 12, 1200080426)),
                  (m = n(m, y, d, p, g[u + 6], 17, 2821735955)),
                  (p = n(p, m, y, d, g[u + 7], 22, 4249261313)),
                  (d = n(d, p, m, y, g[u + 8], 7, 1770035416)),
                  (y = n(y, d, p, m, g[u + 9], 12, 2336552879)),
                  (m = n(m, y, d, p, g[u + 10], 17, 4294925233)),
                  (p = n(p, m, y, d, g[u + 11], 22, 2304563134)),
                  (d = n(d, p, m, y, g[u + 12], 7, 1804603682)),
                  (y = n(y, d, p, m, g[u + 13], 12, 4254626195)),
                  (m = n(m, y, d, p, g[u + 14], 17, 2792965006)),
                  (d = i(
                    d,
                    (p = n(p, m, y, d, g[u + 15], 22, 1236535329)),
                    m,
                    y,
                    g[u + 1],
                    5,
                    4129170786
                  )),
                  (y = i(y, d, p, m, g[u + 6], 9, 3225465664)),
                  (m = i(m, y, d, p, g[u + 11], 14, 643717713)),
                  (p = i(p, m, y, d, g[u + 0], 20, 3921069994)),
                  (d = i(d, p, m, y, g[u + 5], 5, 3593408605)),
                  (y = i(y, d, p, m, g[u + 10], 9, 38016083)),
                  (m = i(m, y, d, p, g[u + 15], 14, 3634488961)),
                  (p = i(p, m, y, d, g[u + 4], 20, 3889429448)),
                  (d = i(d, p, m, y, g[u + 9], 5, 568446438)),
                  (y = i(y, d, p, m, g[u + 14], 9, 3275163606)),
                  (m = i(m, y, d, p, g[u + 3], 14, 4107603335)),
                  (p = i(p, m, y, d, g[u + 8], 20, 1163531501)),
                  (d = i(d, p, m, y, g[u + 13], 5, 2850285829)),
                  (y = i(y, d, p, m, g[u + 2], 9, 4243563512)),
                  (m = i(m, y, d, p, g[u + 7], 14, 1735328473)),
                  (d = o(
                    d,
                    (p = i(p, m, y, d, g[u + 12], 20, 2368359562)),
                    m,
                    y,
                    g[u + 5],
                    4,
                    4294588738
                  )),
                  (y = o(y, d, p, m, g[u + 8], 11, 2272392833)),
                  (m = o(m, y, d, p, g[u + 11], 16, 1839030562)),
                  (p = o(p, m, y, d, g[u + 14], 23, 4259657740)),
                  (d = o(d, p, m, y, g[u + 1], 4, 2763975236)),
                  (y = o(y, d, p, m, g[u + 4], 11, 1272893353)),
                  (m = o(m, y, d, p, g[u + 7], 16, 4139469664)),
                  (p = o(p, m, y, d, g[u + 10], 23, 3200236656)),
                  (d = o(d, p, m, y, g[u + 13], 4, 681279174)),
                  (y = o(y, d, p, m, g[u + 0], 11, 3936430074)),
                  (m = o(m, y, d, p, g[u + 3], 16, 3572445317)),
                  (p = o(p, m, y, d, g[u + 6], 23, 76029189)),
                  (d = o(d, p, m, y, g[u + 9], 4, 3654602809)),
                  (y = o(y, d, p, m, g[u + 12], 11, 3873151461)),
                  (m = o(m, y, d, p, g[u + 15], 16, 530742520)),
                  (d = s(
                    d,
                    (p = o(p, m, y, d, g[u + 2], 23, 3299628645)),
                    m,
                    y,
                    g[u + 0],
                    6,
                    4096336452
                  )),
                  (y = s(y, d, p, m, g[u + 7], 10, 1126891415)),
                  (m = s(m, y, d, p, g[u + 14], 15, 2878612391)),
                  (p = s(p, m, y, d, g[u + 5], 21, 4237533241)),
                  (d = s(d, p, m, y, g[u + 12], 6, 1700485571)),
                  (y = s(y, d, p, m, g[u + 3], 10, 2399980690)),
                  (m = s(m, y, d, p, g[u + 10], 15, 4293915773)),
                  (p = s(p, m, y, d, g[u + 1], 21, 2240044497)),
                  (d = s(d, p, m, y, g[u + 8], 6, 1873313359)),
                  (y = s(y, d, p, m, g[u + 15], 10, 4264355552)),
                  (m = s(m, y, d, p, g[u + 6], 15, 2734768916)),
                  (p = s(p, m, y, d, g[u + 13], 21, 1309151649)),
                  (d = s(d, p, m, y, g[u + 4], 6, 4149444226)),
                  (y = s(y, d, p, m, g[u + 11], 10, 3174756917)),
                  (m = s(m, y, d, p, g[u + 2], 15, 718787259)),
                  (p = s(p, m, y, d, g[u + 9], 21, 3951481745)),
                  (d = r(d, c)),
                  (p = r(p, l)),
                  (m = r(m, f)),
                  (y = r(y, h));
              return (a(d) + a(p) + a(m) + a(y)).toLowerCase();
            })(createUStr);
            console.log("u===>", u);
            var c = {
                jsv: "2.6.0",
                appKey: s,
                t: a,
                sign: u
              },
              l = {
                data: r.data,
                ua: r.ua
              };
            Object.keys(r).forEach(function (t) {
              void 0 === c[t] &&
                void 0 === l[t] &&
                "headers" !== t &&
                "ext_headers" !== t &&
                "ext_querys" !== t &&
                (c[t] = r[t]);
            }),
              r.ext_querys &&
                Object.keys(r.ext_querys).forEach(function (t) {
                  c[t] = r.ext_querys[t];
                }),
              n.getJSONP
                ? (c.type = "jsonp")
                : n.getOriginalJSONP
                  ? (c.type = "originaljsonp")
                  : (n.getJSON || n.postJSON) && (c.type = "originaljson"),
              void 0 !== r.valueType &&
                ("original" === r.valueType
                  ? n.getJSONP || n.getOriginalJSONP
                    ? (c.type = "originaljsonp")
                    : (n.getJSON || n.postJSON) && (c.type = "originaljson")
                  : "string" === r.valueType &&
                    (n.getJSONP || n.getOriginalJSONP
                      ? (c.type = "jsonp")
                      : (n.getJSON || n.postJSON) && (c.type = "json"))),
              !0 === n.useJsonpResultType &&
                "originaljson" === c.type &&
                delete c.type,
              n.dangerouslySetProtocol &&
                (o = n.dangerouslySetProtocol + ":" + o),
              (n.querystring = c),
              (n.postdata = l),
              (n.path = o);
          }
          e();
        }),
        (c.prototype.__processUnitPrefix = function (t) {
          t();
        });
      var _ = 0;
      (c.prototype.__requestJSONP = function (t) {
        function e(t) {
          if (
            (c && clearTimeout(c),
            l.parentNode && l.parentNode.removeChild(l),
            "TIMEOUT" === t)
          )
            window[u] = function () {
              window[u] = void 0;
              try {
                delete window[u];
              } catch (t) {}
            };
          else {
            window[u] = void 0;
            try {
              delete window[u];
            } catch (t) {}
          }
        }
        var n = r(),
          o = this.params,
          s = this.options,
          a = o.timeout || 2e4,
          u = "mtopjsonp" + (o.jsonpIncPrefix || "") + ++_,
          c = setTimeout(function () {
            t(s.timeoutErrMsg || "TIMEOUT::接口超时"), e("TIMEOUT");
          }, a);
        s.querystring.callback = u;
        var l = document.createElement("script");
        return (
          (l.src = s.path + "?" + i(s.querystring) + "&" + i(s.postdata)),
          (l.async = !0),
          (l.onerror = function () {
            e("ABORT"), t(s.abortErrMsg || "ABORT::接口异常退出");
          }),
          (window[u] = function () {
            (s.results = Array.prototype.slice.call(arguments)),
              e(),
              n.resolve();
          }),
          (function (t) {
            (
              document.getElementsByTagName("head")[0] ||
              document.getElementsByTagName("body")[0] ||
              document.firstElementChild ||
              document
            ).appendChild(t);
          })(l),
          n.promise
        );
      }),
        (c.prototype.__requestJSON = function (e) {
          function n(t) {
            f && clearTimeout(f), "TIMEOUT" === t && c.abort();
          }
          var o = r(),
            a = this.params,
            u = this.options,
            c = new t.XMLHttpRequest(),
            l = a.timeout || 2e4,
            f = setTimeout(function () {
              e(u.timeoutErrMsg || "TIMEOUT::接口超时"), n("TIMEOUT");
            }, l);
          u.CDR && s(v) && (u.querystring.c = decodeURIComponent(s(v))),
            (c.onreadystatechange = function () {
              if (4 == c.readyState) {
                var t,
                  r,
                  i = c.status;
                if ((i >= 200 && 300 > i) || 304 == i) {
                  n(),
                    (t = c.responseText),
                    (r = c.getAllResponseHeaders() || "");
                  try {
                    ((t = /^\s*$/.test(t)
                      ? {}
                      : JSON.parse(t)).responseHeaders = r),
                      (u.results = [t]),
                      o.resolve();
                  } catch (t) {
                    e("PARSE_JSON_ERROR::解析JSON失败");
                  }
                } else n("ABORT"), e(u.abortErrMsg || "ABORT::接口异常退出");
              }
            });
          var h,
            d,
            p = u.path + "?" + i(u.querystring);
          u.getJSON
            ? ((h = "GET"), (p += "&" + i(u.postdata)))
            : u.postJSON && ((h = "POST"), (d = i(u.postdata))),
            c.open(h, p, !0),
            (c.withCredentials = !0),
            c.setRequestHeader("Accept", "application/json"),
            c.setRequestHeader(
              "Content-type",
              "application/x-www-form-urlencoded"
            );
          var m = a.ext_headers || a.headers;
          if (m) for (var y in m) c.setRequestHeader(y, m[y]);
          return c.send(d), o.promise;
        }),
        (c.prototype.__requestWindVane = function (t) {
          function n(t) {
            (s.results = [t]), i.resolve();
          }
          var i = r(),
            o = this.params,
            s = this.options,
            a = o.data,
            u = o.api,
            c = o.v,
            l = s.postJSON ? 1 : 0,
            f =
              s.getJSON || s.postJSON || s.getOriginalJSONP
                ? "originaljson"
                : "";
          void 0 !== o.valueType &&
            ("original" === o.valueType
              ? (f = "originaljson")
              : "string" === o.valueType && (f = "")),
            !0 === s.useJsonpResultType && (f = "");
          var h,
            d,
            p = "https" === location.protocol ? 1 : 0,
            m = o.isSec || 0,
            y = o.sessionOption || "AutoLoginOnly",
            g = o.ecode || 0,
            v = o.ext_headers || {},
            b = o.ext_querys || {};
          (h =
            2 *
            (d =
              void 0 !== o.timer
                ? parseInt(o.timer)
                : void 0 !== o.timeout
                  ? parseInt(o.timeout)
                  : 2e4)),
            !0 === o.needLogin &&
              void 0 === o.sessionOption &&
              (y = "AutoLoginAndManualLogin"),
            void 0 !== o.secType && void 0 === o.isSec && (m = o.secType);
          var _ = {
            api: u,
            v: c,
            post: String(l),
            type: f,
            isHttps: String(p),
            ecode: String(g),
            isSec: String(m),
            param: JSON.parse(a),
            timer: d,
            sessionOption: y,
            ext_headers: v,
            ext_querys: b
          };
          o.ttid && !0 === s.dangerouslySetWVTtid && (_.ttid = o.ttid),
            Object.assign &&
              o.dangerouslySetWindvaneParams &&
              Object.assign(_, o.dangerouslySetWindvaneParams);
          var w = "MtopWVPlugin";
          return (
            "string" == typeof o.customWindVaneClassName &&
              (w = o.customWindVaneClassName),
            e.windvane.call(w, "send", _, n, n, h),
            i.promise
          );
        }),
        (c.prototype.__requestAlipay = function (e) {
          var n = r(),
            i = this.params,
            s = this.options,
            a = {
              apiName: i.api,
              apiVersion: i.v,
              needEcodeSign: "1" === String(i.ecode),
              headers: i.ext_headers || {},
              usePost: !!s.postJSON
            };
          o(i.data) || (i.data = JSON.parse(i.data)),
            (a.data = i.data),
            i.ttid && !0 === s.dangerouslySetWVTtid && (a.ttid = i.ttid),
            (s.getJSON || s.postJSON || s.getOriginalJSONP) &&
              (a.type = "originaljson"),
            void 0 !== i.valueType &&
              ("original" === i.valueType
                ? (a.type = "originaljson")
                : "string" === i.valueType && delete a.type),
            !0 === s.useJsonpResultType && delete a.type,
            Object.assign &&
              i.dangerouslySetAlipayParams &&
              Object.assign(a, i.dangerouslySetAlipayParams);
          var u = "mtop";
          return (
            "string" == typeof i.customAlipayJSBridgeApi &&
              (u = i.customAlipayJSBridgeApi),
            t.AlipayJSBridge.call(u, a, function (t) {
              (s.results = [t]), n.resolve();
            }),
            n.promise
          );
        }),
        (c.prototype.__processRequest = function (t, e) {
          var r = this;
          return f
            .then(function () {
              var t = r.options;
              if (t.H5Request && (t.getJSONP || t.getOriginalJSONP))
                return r.__requestJSONP(e);
              if (t.H5Request && (t.getJSON || t.postJSON))
                return r.__requestJSON(e);
              if (t.WindVaneRequest)
                return y ? r.__requestAlipay(e) : r.__requestWindVane(e);
              throw new Error("UNEXCEPT_REQUEST::错误的请求类型");
            })
            .then(t)
            .then(function () {
              var t = r.options,
                e = (r.params, t.results[0]),
                n = (e && e.ret) || [];
              (e.ret = n), n instanceof Array && (n = n.join(","));
              var i = e.c;
              t.CDR &&
                i &&
                (function (t, e, r) {
                  var n = r || {};
                  document.cookie =
                    t
                      .replace(/[^+#$&^`|]/g, encodeURIComponent)
                      .replace("(", "%28")
                      .replace(")", "%29") +
                    "=" +
                    e.replace(/[^+#$&\/:<-\[\]-}]/g, encodeURIComponent) +
                    (n.domain ? ";domain=" + n.domain : "") +
                    (n.path ? ";path=" + n.path : "") +
                    (n.secure ? ";secure" : "") +
                    (n.httponly ? ";HttpOnly" : "") +
                    (n.sameSite ? ";Samesite=" + n.sameSite : "");
                })(v, i, {
                  domain: t.pageDomain,
                  path: "/",
                  secure: t.secure,
                  sameSite: t.sameSite
                }),
                n.indexOf("SUCCESS") > -1
                  ? (e.retType = p.SUCCESS)
                  : (e.retType = p.ERROR),
                (t.retJson = e);
            });
        }),
        (c.prototype.__sequence = function (t) {
          var e = this,
            n = [],
            i = [];
          t.forEach(function t(o) {
            if (o instanceof Array) o.forEach(t);
            else {
              var s,
                a = r(),
                u = r();
              n.push(function () {
                return (
                  (a = r()),
                  (s = o.call(
                    e,
                    function (t) {
                      return a.resolve(t), u.promise;
                    },
                    function (t) {
                      return a.reject(t), u.promise;
                    }
                  )) &&
                    (s = s.catch(function (t) {
                      a.reject(t);
                    })),
                  a.promise
                );
              }),
                i.push(function (t) {
                  return u.resolve(t), s;
                });
            }
          });
          for (var o, s = f; (o = n.shift()); ) s = s.then(o);
          for (; (o = i.pop()); ) s = s.then(o);
          return s;
        });
      var w = function (t) {
          t();
        },
        M = function (t) {
          t();
        };
      (c.prototype.request = function (r) {
        var i = this;
        if (((this.options = n(r || {}, h)), !l)) {
          var o = "当前浏览器不支持Promise，请在windows对象上挂载Promise对象";
          throw (
            ((e.mtop = {
              ERROR: o
            }),
            new Error(o))
          );
        }
        var s = l
          .resolve([w, M])
          .then(function (t) {
            var e = t[0],
              r = t[1];
            return i.__sequence([
              e,
              i.__processRequestMethod,
              i.__processRequestType,
              i.__processToken,
              i.__processRequestUrl,
              i.middlewares,
              i.__processRequest,
              r
            ]);
          })
          .then(function () {
            var t = i.options.retJson;
            return t.retType !== p.SUCCESS
              ? l.reject(t)
              : i.options.successCallback
                ? void i.options.successCallback(t)
                : l.resolve(t);
          })
          .catch(function (t) {
            var r;
            return (
              t instanceof Error
                ? (console.error(t.stack),
                  (r = {
                    ret: [t.message],
                    stack: [t.stack],
                    retJson: p.ERROR
                  }))
                : (r =
                    "string" == typeof t
                      ? {
                          ret: [t],
                          retJson: p.ERROR
                        }
                      : void 0 !== t
                        ? t
                        : i.options.retJson),
              e.mtop.errorListener &&
                e.mtop.errorListener({
                  api: i.params.api,
                  data: i.params.data,
                  v: i.params.v,
                  retJson: r
                }),
              i.options.failureCallback
                ? void i.options.failureCallback(r)
                : l.reject(r)
            );
          });
        return (
          this.__processRequestType(),
          i.options.H5Request &&
            (i.constructor.__firstProcessor ||
              (i.constructor.__firstProcessor = s),
            (w = function (t) {
              i.constructor.__firstProcessor.then(t).catch(t);
            })),
          (("get" === this.params.type && "json" === this.params.dataType) ||
            "post" === this.params.type) &&
            ((r.pageDomain =
              r.pageDomain ||
              (function (t) {
                try {
                  return ".com" !== t.substring(t.lastIndexOf("."))
                    ? (t.split(".") || []).length <= 3
                      ? t
                      : t.split(".").slice(1).join(".")
                    : t.substring(
                        t.lastIndexOf(".", t.lastIndexOf(".") - 1) + 1
                      );
                } catch (e) {
                  return t.substring(
                    t.lastIndexOf(".", t.lastIndexOf(".") - 1) + 1
                  );
                }
              })(t.location.hostname)),
            r.mainDomain !== r.pageDomain &&
              ((r.maxRetryTimes = 4), (r.CDR = !0))),
          (this.__requestProcessor = s),
          s
        );
      }),
        (e.mtop = function (t) {
          return new c(t);
        }),
        (e.mtop.request = function (t, e, r) {
          console.log("request", t, e);
          var n = {
            H5Request: t.H5Request,
            WindVaneRequest: t.WindVaneRequest,
            LoginRequest: t.LoginRequest,
            AntiCreep: t.AntiCreep,
            AntiFlood: t.AntiFlood,
            successCallback: e,
            failureCallback: r || e
          };
          // let cookieStr = t.headers.H5Cookie
          // delete t.headers.H5Cookie
          // console.log('cookieStr', cookieStr, t)
          // batchSetCookies(cookieStr)
          let req = new c(t);
          console.log("req", req);
          return req.request(n);
        }),
        (e.mtop.H5Request = function (t, e, r) {
          var n = {
            H5Request: !0,
            successCallback: e,
            failureCallback: r || e
          };
          return new c(t).request(n);
        }),
        (e.mtop.middlewares = d),
        (e.mtop.config = h),
        (e.mtop.RESPONSE_TYPE = p),
        (e.mtop.CLASS = c);
    })(window, e),
    (function (t, e) {
      function r(t) {
        return t.preventDefault(), !1;
      }
      function n(e, n) {
        var i = this,
          o = t.dpr || 1,
          s = document.createElement("div"),
          a = document.documentElement.getBoundingClientRect(),
          u = Math.max(a.width, window.innerWidth) / o,
          c = Math.max(a.height, window.innerHeight) / o;
        s.style.cssText = [
          "-webkit-transform:scale(" + o + ") translateZ(0)",
          "-ms-transform:scale(" + o + ") translateZ(0)",
          "transform:scale(" + o + ") translateZ(0)",
          "-webkit-transform-origin:0 0",
          "-ms-transform-origin:0 0",
          "transform-origin:0 0",
          "width:" + u + "px",
          "height:" + c + "px",
          "z-index:2147483647",
          "position:" + (u > 800 ? "fixed" : "absolute"),
          "left:0",
          "top:0px",
          "background:" + (u > 800 ? "rgba(0,0,0,.5)" : "#FFF"),
          "display:none"
        ].join(";");
        var l = document.createElement("div");
        (l.style.cssText = [
          "width:100%",
          "height:52px",
          "background:#EEE",
          "line-height:52px",
          "text-align:left",
          "box-sizing:border-box",
          "padding-left:20px",
          "position:absolute",
          "left:0",
          "top:0",
          "font-size:16px",
          "font-weight:bold",
          "color:#333"
        ].join(";")),
          (l.innerText = e);
        var f = navigator.userAgent.match(
            /.*(iPhone|iPad|Android|ios|SymbianOS|Windows Phone).*/i
          ),
          h = document.createElement("img");
        (h.style.cssText = [
          "display:block",
          "position:absolute",
          "margin-top:15px",
          "right:0",
          "top:0",
          "height:15px",
          "line-height:52px",
          "padding:0 20px",
          "color:#999"
        ].join(";")),
          (h.src =
            "https://gw.alicdn.com/tfs/TB1QZN.CYj1gK0jSZFuXXcrHpXa-200-200.png");
        var d = document.createElement("iframe");
        (d.style.cssText = [
          "width:100%",
          "height:100%",
          "border:0",
          "overflow:hidden"
        ].join(";")),
          f
            ? (l.appendChild(h), s.appendChild(l))
            : ((h.style.cssText = [
                "position:absolute",
                "width:15px",
                "height:15px",
                "top: 50%;",
                "left: 50%;",
                "margin: -153px 0 0 184px;",
                "cursor: pointer",
                "border:0",
                "z-index:1",
                "overflow:hidden"
              ].join(";")),
              s.appendChild(h),
              (d.style.cssText = [
                "position:absolute",
                "top:50%",
                "left:50%",
                "margin: -160px 0 0 -210px;",
                "height:320px",
                "min-width:420px",
                "border:0",
                "background:#FFF",
                "overflow:hidden"
              ].join(";"))),
          s.appendChild(d),
          (s.className = "J_MIDDLEWARE_FRAME_WIDGET"),
          document.body.appendChild(s),
          (d.src = n),
          h.addEventListener(
            "click",
            function () {
              i.hide();
              var t = document.createEvent("HTMLEvents");
              t.initEvent("close", !1, !1), s.dispatchEvent(t);
            },
            !1
          ),
          (this.addEventListener = function () {
            s.addEventListener.apply(s, arguments);
          }),
          (this.removeEventListener = function () {
            s.removeEventListener.apply(s, arguments);
          }),
          (this.show = function () {
            document.addEventListener("touchmove", r, !1),
              (s.style.display = "block"),
              window.scrollTo(0, 0);
          }),
          (this.hide = function () {
            document.removeEventListener("touchmove", r),
              window.scrollTo(0, -a.top),
              s.parentNode && s.parentNode.removeChild(s);
          });
      }
      if (!e || !e.mtop || e.mtop.ERROR) throw new Error("Mtop 初始化失败！");
      var i = t.Promise,
        o = e.mtop.CLASS,
        s = e.mtop.config,
        a = e.mtop.RESPONSE_TYPE;
      e.mtop.middlewares.push(function (t) {
        var r = this,
          n = this.options,
          i = this.params;
        return t().then(function () {
          var t = n.retJson,
            o = t.ret,
            u = navigator.userAgent.toLowerCase(),
            c =
              u.indexOf("safari") > -1 &&
              u.indexOf("chrome") < 0 &&
              u.indexOf("qqbrowser") < 0;
          if (
            (o instanceof Array && (o = o.join(",")),
            (o.indexOf("SESSION_EXPIRED") > -1 ||
              o.indexOf("SID_INVALID") > -1 ||
              o.indexOf("AUTH_REJECT") > -1 ||
              o.indexOf("NEED_LOGIN") > -1) &&
              ((t.retType = a.SESSION_EXPIRED),
              !n.WindVaneRequest &&
                (!0 === s.LoginRequest ||
                  !0 === n.LoginRequest ||
                  !0 === i.needLogin)))
          ) {
            if (!e.login) throw new Error("LOGIN_NOT_FOUND::缺少lib.login");
            if (!0 !== n.safariGoLogin || !c || "taobao.com" === n.pageDomain)
              return e.login
                .goLoginAsync()
                .then(function (t) {
                  return r.__sequence([
                    r.__processToken,
                    r.__processRequestUrl,
                    r.__processUnitPrefix,
                    r.middlewares,
                    r.__processRequest
                  ]);
                })
                .catch(function (t) {
                  throw "CANCEL" === t
                    ? new Error("LOGIN_CANCEL::用户取消登录")
                    : new Error("LOGIN_FAILURE::用户登录失败");
                });
            e.login.goLogin();
          }
        });
      }),
        (e.mtop.loginRequest = function (t, e, r) {
          var n = {
            LoginRequest: !0,
            H5Request: !0,
            successCallback: e,
            failureCallback: r || e
          };
          return new o(t).request(n);
        }),
        (e.mtop.antiFloodRequest = function (t, e, r) {
          var n = {
            AntiFlood: !0,
            successCallback: e,
            failureCallback: r || e
          };
          return new o(t).request(n);
        }),
        e.mtop.middlewares.push(function (t) {
          var e = this.options;
          return (
            this.params,
            !0 !== e.H5Request || (!0 !== s.AntiFlood && !0 !== e.AntiFlood)
              ? void t()
              : t().then(function () {
                  var t = e.retJson,
                    r = t.ret;
                  r instanceof Array && (r = r.join(",")),
                    r.indexOf("FAIL_SYS_USER_VALIDATE") > -1 &&
                      t.data.url &&
                      (e.AntiFloodReferer
                        ? (location.href = t.data.url.replace(
                            /(http_referer=).+/,
                            "$1" + e.AntiFloodReferer
                          ))
                        : (location.href = t.data.url));
                })
          );
        }),
        (e.mtop.antiCreepRequest = function (t, e, r) {
          var n = {
            AntiCreep: !0,
            successCallback: e,
            failureCallback: r || e
          };
          return new o(t).request(n);
        }),
        e.mtop.middlewares.push(function (e) {
          var r = this,
            o = this.options,
            a = this.params;
          return (
            !1 !== o.AntiCreep && (o.AntiCreep = !0),
            (!0 !== a.forceAntiCreep && !0 !== o.H5Request) ||
            (!0 !== s.AntiCreep && !0 !== o.AntiCreep)
              ? void e()
              : e().then(function () {
                  var e = o.retJson,
                    s = e.ret;
                  if (
                    (s instanceof Array && (s = s.join(",")),
                    (s.indexOf("RGV587_ERROR::SM") > -1 ||
                      s.indexOf("ASSIST_FLAG") > -1) &&
                      e.data.url)
                  ) {
                    var u = "_m_h5_smt",
                      c = (function (t) {
                        var e = new RegExp(
                          "(?:^|;\\s*)" + t + "\\=([^;]+)(?:;\\s*|$)"
                        ).exec(document.cookie);
                        return e ? e[1] : void 0;
                      })(u),
                      l = !1;
                    if (!0 === o.saveAntiCreepToken && c)
                      for (var f in (c = JSON.parse(c))) a[f] && (l = !0);
                    if (!0 === o.saveAntiCreepToken && c && !l) {
                      for (var f in c) a[f] = c[f];
                      return r.__sequence([
                        r.__processToken,
                        r.__processRequestUrl,
                        r.__processUnitPrefix,
                        r.middlewares,
                        r.__processRequest
                      ]);
                    }
                    return new i(function (i, s) {
                      function c() {
                        f.removeEventListener("close", c),
                          t.removeEventListener("message", l),
                          s("USER_INPUT_CANCEL::用户取消输入");
                      }
                      function l(e) {
                        var n;
                        try {
                          n = JSON.parse(e.data) || {};
                        } catch (t) {}
                        if (n && "child" === n.type) {
                          var h;
                          f.removeEventListener("close", c),
                            t.removeEventListener("message", l),
                            f.hide();
                          try {
                            for (var d in ("string" ==
                              typeof (h = JSON.parse(
                                decodeURIComponent(n.content)
                              )) && (h = JSON.parse(h)),
                            h))
                              a[d] = h[d];
                            !0 === o.saveAntiCreepToken
                              ? ((document.cookie =
                                  u + "=" + JSON.stringify(h) + ";"),
                                t.location.reload())
                              : r
                                  .__sequence([
                                    r.__processToken,
                                    r.__processRequestUrl,
                                    r.__processUnitPrefix,
                                    r.middlewares,
                                    r.__processRequest
                                  ])
                                  .then(i);
                          } catch (t) {
                            s("USER_INPUT_FAILURE::用户输入失败");
                          }
                        }
                      }
                      var f = new n("", e.data.url);
                      f.addEventListener("close", c, !1),
                        t.addEventListener("message", l, !1),
                        f.show();
                    });
                  }
                })
          );
        });
    })(window, e),
    (t.exports = e.mtop);
  console.log("e.mtop", e.mtop, RTtlModule);
})(window, RTtlModule);
// 假设这是 u2JM 模块的内容
const u2JMModule = {};
(function (e, t, n) {
  "use strict";
  Object.defineProperty(t, "__esModule", {
    value: !0
  });
  t.default = void 0;
  const a = {
    "h5lark.taobao.net": {
      prefix: "acs",
      subDomain: "waptest",
      mainDomain: "taobao.com"
    },
    "h5lark-pre.yuekeyun.com": {
      prefix: "",
      subDomain: "mtop-pre",
      mainDomain: "yuekeyun.com"
    },
    "h5lark.yuekeyun.com": {
      prefix: "",
      subDomain: "mtop",
      mainDomain: "yuekeyun.com"
    }
  };
  // const i = window.location.hostname;
  const i = "h5lark.yuekeyun.com";
  t.default = {
    prefix: a[i] && a[i].prefix,
    subDomain: (a[i] && a[i].subDomain) || "",
    mainDomain: (a[i] && a[i].mainDomain) || ""
  };
})(window, u2JMModule, () => {});

// 假设这是 B8IU 模块的内容
const B8IU = {
  __esModule: true,
  default: {
    logError: (error, options) => {
      console.error("Error logged:", error, options);
    }
  }
};

// 假设这是 rt5S 模块的内容
const rt5SModule = {};
(function (e, t, n) {
  "use strict";
  Object.defineProperty(t, "__esModule", {
    value: !0
  });
  t.awscP = void 0;
  const { use: a } = window.AWSC || {};
  const i = new Promise(e => {
    if (!a) return e("");
    try {
      a("um", (t, n) => {
        "loaded" === t
          ? n.init(
              {
                appName: "lark-cinemaprod",
                serviceLocation: "cn"
              },
              (t, n) => {
                e(("success" === t && n.tn) || "");
              }
            )
          : e("");
      });
    } catch (t) {
      e("");
    }
  });

  const o = new Promise(e => {
    if (!a) return e("");
    try {
      a("uab", (t, n) => {
        if ("loaded" === t) {
          const t = n.getUA();
          e(t || "");
        } else {
          e("");
        }
      });
    } catch (t) {
      e("");
    }
  });

  t.awscP = Promise.all([i, o])
    .then(e => {
      let [t, n] = e;
      return {
        umidToken: t || "",
        ua: n || ""
      };
    })
    .catch(() => ({
      umidToken: "",
      ua: ""
    }));
})(window, rt5SModule, () => {});

// 模拟模块加载器
const moduleLoader = {
  TqRt: () => ({
    __esModule: true,
    default: TqRt
  }),
  RTtl: () => ({
    __esModule: true,
    default: RTtlModule.mtop
  }),
  u2JM: () => ({
    __esModule: true,
    default: u2JMModule.default
  }),
  B8IU: () => ({
    __esModule: true,
    default: B8IU.default
  }),
  rt5S: () => rt5SModule // 直接返回 rt5SModule 对象
};

// 主要模块内容
const h5_request = (function (e, t, n) {
  "use strict";
  var a = n("TqRt").default; // 确保获取的是 default 属性
  Object.defineProperty(t, "__esModule", {
    value: !0
  });
  t.setMtopConfig = t.default = void 0;
  var i = a(n("RTtl")).default; // 确保获取的是 default 属性
  console.log("i", i);
  var o = a(n("u2JM")).default; // 确保获取的是 default 属性
  var s = a(n("B8IU")).default; // 确保获取的是 default 属性
  var l = n("rt5S");
  const c = e => {
    Object.keys(e).forEach(t => {
      i.config[t] = e[t];
    });
  };
  t.setMtopConfig = c;
  c(o);
  t.default = function (e) {
    console.log("e", e);
    let {
      api: t,
      data: n = {},
      headers: a = {},
      ecode: o = 0,
      timeout: c = 2e4,
      dataType: r = "json",
      v: d = "1.0"
    } = e;
    const u = sessionStorage.getItem("access_token");
    for (const e in n)
      "object" == typeof n[e] &&
        n.hasOwnProperty(e) &&
        (n[e] = JSON.stringify(n[e]));
    return l.awscP.then(e => {
      console.log("e1", e);
      let { ua: l = "", umidToken: p = "" } = e;
      // l =
      //   "140#7H2DzWu5zzPMMzo2+bp+4pN8s9zbUU0qWuz6R7h+TEedioAzaGX45tnBzY/eKJSw4F17lp1zzXmcWvvjUQzx0oIoa6h/zzrb22U3lp1xzfsiVXE/tFzx2Dc33FwrEHBP2IwNfm7cORj76opulqQyKgH+F5FHXTHBkWxYmWDphxVKx/Sr6oRzHy99ppVBoP0NDQ/Dq6HBrfTlihrv0up7EuQyi3muiftEVuFez1/MEyLhLEPMZ+OAU9mhZWTpRrVt+33e/gd/4K/x923+agzThS3SR0r+5Lygwva+us8evHXgR54fkqNGjZFykYsV3fo9BeDzzOlkfD603aM3EpLD5VKy67pP8GTZhCCI81mln+gyCFCoMZ50EPz1+TmC9UIrtXb/W1efTP/ZoMtd3owqZTaG9W/YSpBoAckQw5bH+G4mj2nDr5VompeJcz5+znq+OwEa0wMYluSvTWMYmoCWMOSTGPdE+srkAXsil5grGGOG4WQ/w+gpU25zm1HJjr9AOWPpc4KC66Wp1jX/zNex3OUbUWvKT6TnAUPgzip0IsSZqCH86A7V6A5vgrFBL9IIyCmUa3P3SphbdntEGnoGfR8JJP6JTPJrDnGuaSRjfM86pv0tRLb9I6/uRUv67xOYo6wDICFB8TC10z/8CZJ2jUt9hfGtmMScVZhanxWFuMDV931P/gQFBmZfXzA9RG1GdbBbvt6YPq7Qpyjye/pg1nP6ch5cmDeYgJ2m0As5TcY2NWpqHF8063qL9zvWgEYLPyWZ8GZnhq/XDeIVDYnwtgszrgjPWKr9KO4CSCehP2Gesnk/MAqsHIwsh2ztRdUyEBq++Jd+Z+gJAV70hKDrVEYRvsLaYCEuuzviBo4EdX51rmCS46+8qpbdqP4uAcPF8JKPw4Go43Q+GXeV44ko34xtXUR52xz89m4cnzQZq2Okz1jkUVxh6jABSIU3ZZz2Sg7y0j0aqJ0rjqqkvtJxiCo3BLrpjpdJbbx7fp6PF8yvd4pPz8wRJJzkj/uSs0rGO69cQh0yyNazdZfUTb==";
      // p =
      //   "T2gAytseJvBp0cBSEanuHLaygP-gx8f8MG72JhNlgKCGvvJeparhfYpvlTg9JJM00R0=";
      const m = {
        api: t,
        v: d,
        data: n,
        headers: {
          ...a,
          accessToken: u,
          "bx-ua": l,
          "bx-umidtoken": p
        },
        type: "POST",
        ecode: o,
        timeout: c,
        dataType: r,
        t: Math.random()
      };
      return new Promise((e, t) => {
        const n = i.request(m);
        Date.now();
        n.then(t =>
          (function (e, t, n, a) {
            let { ret: i } = e;
            i instanceof Array && (i = i.join(","));
            i.indexOf("SUCCESS") > -1
              ? a({
                  ...e,
                  message: "操作成功",
                  retCode: "SUCCESS",
                  retMsg: "调用成功",
                  code: "SUCCESS"
                })
              : a({
                  ...e,
                  message: e.ret && e.ret[0],
                  retCode: "FAIL",
                  retMsg: e.ret && e.ret[0],
                  code: "FAIL"
                });
          })(t, 0, 0, e)
        ).catch(e => {
          t(e);
          // s.logError(e, {
          //   code: 15
          // });
        });
      });
    });
  };
  return t;
})({}, {}, moduleName => moduleLoader[moduleName]());

// 示例调用
(async () => {
  try {
    const response = await h5_request.default({
      api: "mtop.alipic.lark.own.cinema.getCinemas",
      data: {
        empCode: "",
        leaseCode: "",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "e783ed22b3944c81bbd55bbe66c606a6",
        version: "H5",
        appVersion: "H5_5.0"
      },
      headers: {
        umetoken:
          "cna=YlyXHzyqrzICAQEk9RVF4M27; xlly_s=1; _m_h5_tk=2b6658e6c1e054a8a798429d5b6e95d0_1732372148724; _m_h5_tk_enc=a6a97ba13aa8cac824ae2530d015058a; tfstk=fE1sdqVxkcm1FqzwIqUeAj26BVRfciNPXqTArZhZkCdtlXIhcERNkAlxGGIS7A7VknsfYHXV7i7NASsC2OoVks8AGMA9nO-2bnOfogaU47PPSNADHurzaQr9-fADDSRY0kBwIIEz4WkEJdqwMGzTJmMCJHYj6cKADDQpxUHvMhpxvvLJvIKADKFKJU8JDfh9DXUBoHKvMIh82kTLZ3b_8RQbJjF9YNKIGw1BWdMGWHGxM66BC3hyAjhAOFQeyL5KN--REhJyqMFE1I_plM9PCuG1cZQlHp1jXPSRkGfBsQw4SL6dLTJ1dlhXY18XeIpIkjQBOHj5TQF-AeXd7tCGfqGvS15yh3vQkjv29_JReGg0rwd9kivlgucMXZQlZTR710Y1paOC4elyVRHthxxtGetzRyMmn8N-HK85EAtpBeYnayaI3Z99-etzRyMmndLH-bzQRx7f.; isg=BC0t8_ETNs2ectJwsYN-_xqCPMmnimFcZgUoBG8yaUQz5k2YN9pxLHuw1LwA5nkU"
        // "accept-language": "zh-CN,zh;q=0.9,ar;q=0.8",
        // "cache-control": "no-cache",
        // "gray-lease-code": "BEICHEN",
        // "pragma": "no-cache",
        // "priority": "u=1, i",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-site",
        // "uacipher": ""
      }
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
})();
