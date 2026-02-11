(function (window) {
  (function (t) {
    (t.DOMException = void 0),
      (t.Headers = d),
      (t.Request = _),
      (t.Response = M),
      (t.fetch = j);
    var r =
        ("undefined" != typeof globalThis && globalThis) ||
        ("undefined" != typeof self && self) ||
        (void 0 !== t && t) ||
        {},
      n = "URLSearchParams" in r,
      i = "Symbol" in r && "iterator" in Symbol,
      o =
        "FileReader" in r &&
        "Blob" in r &&
        (function () {
          try {
            return new Blob(), !0;
          } catch (t) {
            return !1;
          }
        })(),
      s = "FormData" in r,
      a = "ArrayBuffer" in r;
    if (a)
      var u = [
          "[object Int8Array]",
          "[object Uint8Array]",
          "[object Uint8ClampedArray]",
          "[object Int16Array]",
          "[object Uint16Array]",
          "[object Int32Array]",
          "[object Uint32Array]",
          "[object Float32Array]",
          "[object Float64Array]"
        ],
        c =
          ArrayBuffer.isView ||
          function (t) {
            return t && u.indexOf(Object.prototype.toString.call(t)) > -1;
          };
    function l(t) {
      if (
        ("string" != typeof t && (t = String(t)),
        /[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(t) || "" === t)
      )
        throw new TypeError(
          'Invalid character in header field name: "' + t + '"'
        );
      return t.toLowerCase();
    }
    function f(t) {
      return "string" != typeof t && (t = String(t)), t;
    }
    function h(t) {
      var e = {
        next: function () {
          var e = t.shift();
          return {
            done: void 0 === e,
            value: e
          };
        }
      };
      return (
        i &&
          (e[Symbol.iterator] = function () {
            return e;
          }),
        e
      );
    }
    function d(t) {
      (this.map = {}),
        t instanceof d
          ? t.forEach(function (t, e) {
              this.append(e, t);
            }, this)
          : Array.isArray(t)
            ? t.forEach(function (t) {
                if (2 != t.length)
                  throw new TypeError(
                    "Headers constructor: expected name/value pair to be length 2, found" +
                      t.length
                  );
                this.append(t[0], t[1]);
              }, this)
            : t &&
              Object.getOwnPropertyNames(t).forEach(function (e) {
                this.append(e, t[e]);
              }, this);
    }
    function p(t) {
      if (!t._noBody)
        return t.bodyUsed
          ? Promise.reject(new TypeError("Already read"))
          : void (t.bodyUsed = !0);
    }
    function m(t) {
      return new Promise(function (e, r) {
        (t.onload = function () {
          e(t.result);
        }),
          (t.onerror = function () {
            r(t.error);
          });
      });
    }
    function y(t) {
      var e = new FileReader(),
        r = m(e);
      return e.readAsArrayBuffer(t), r;
    }
    function g(t) {
      if (t.slice) return t.slice(0);
      var e = new Uint8Array(t.byteLength);
      return e.set(new Uint8Array(t)), e.buffer;
    }
    function v() {
      return (
        (this.bodyUsed = !1),
        (this._initBody = function (t) {
          var e;
          (this.bodyUsed = this.bodyUsed),
            (this._bodyInit = t),
            t
              ? "string" == typeof t
                ? (this._bodyText = t)
                : o && Blob.prototype.isPrototypeOf(t)
                  ? (this._bodyBlob = t)
                  : s && FormData.prototype.isPrototypeOf(t)
                    ? (this._bodyFormData = t)
                    : n && URLSearchParams.prototype.isPrototypeOf(t)
                      ? (this._bodyText = t.toString())
                      : a && o && (e = t) && DataView.prototype.isPrototypeOf(e)
                        ? ((this._bodyArrayBuffer = g(t.buffer)),
                          (this._bodyInit = new Blob([this._bodyArrayBuffer])))
                        : a && (ArrayBuffer.prototype.isPrototypeOf(t) || c(t))
                          ? (this._bodyArrayBuffer = g(t))
                          : (this._bodyText = t =
                              Object.prototype.toString.call(t))
              : ((this._noBody = !0), (this._bodyText = "")),
            this.headers.get("content-type") ||
              ("string" == typeof t
                ? this.headers.set("content-type", "text/plain;charset=UTF-8")
                : this._bodyBlob && this._bodyBlob.type
                  ? this.headers.set("content-type", this._bodyBlob.type)
                  : n &&
                    URLSearchParams.prototype.isPrototypeOf(t) &&
                    this.headers.set(
                      "content-type",
                      "application/x-www-form-urlencoded;charset=UTF-8"
                    ));
        }),
        o &&
          (this.blob = function () {
            var t = p(this);
            if (t) return t;
            if (this._bodyBlob) return Promise.resolve(this._bodyBlob);
            if (this._bodyArrayBuffer)
              return Promise.resolve(new Blob([this._bodyArrayBuffer]));
            if (this._bodyFormData)
              throw new Error("could not read FormData body as blob");
            return Promise.resolve(new Blob([this._bodyText]));
          }),
        (this.arrayBuffer = function () {
          if (this._bodyArrayBuffer) {
            var t = p(this);
            return (
              t ||
              (ArrayBuffer.isView(this._bodyArrayBuffer)
                ? Promise.resolve(
                    this._bodyArrayBuffer.buffer.slice(
                      this._bodyArrayBuffer.byteOffset,
                      this._bodyArrayBuffer.byteOffset +
                        this._bodyArrayBuffer.byteLength
                    )
                  )
                : Promise.resolve(this._bodyArrayBuffer))
            );
          }
          if (o) return this.blob().then(y);
          throw new Error("could not read as ArrayBuffer");
        }),
        (this.text = function () {
          var t,
            e,
            r,
            n,
            i,
            o = p(this);
          if (o) return o;
          if (this._bodyBlob)
            return (
              (t = this._bodyBlob),
              (e = new FileReader()),
              (r = m(e)),
              (n = /charset=([A-Za-z0-9_-]+)/.exec(t.type)),
              (i = n ? n[1] : "utf-8"),
              e.readAsText(t, i),
              r
            );
          if (this._bodyArrayBuffer)
            return Promise.resolve(
              (function (t) {
                for (
                  var e = new Uint8Array(t), r = new Array(e.length), n = 0;
                  n < e.length;
                  n++
                )
                  r[n] = String.fromCharCode(e[n]);
                return r.join("");
              })(this._bodyArrayBuffer)
            );
          if (this._bodyFormData)
            throw new Error("could not read FormData body as text");
          return Promise.resolve(this._bodyText);
        }),
        s &&
          (this.formData = function () {
            return this.text().then(w);
          }),
        (this.json = function () {
          return this.text().then(JSON.parse);
        }),
        this
      );
    }
    (d.prototype.append = function (t, e) {
      (t = l(t)), (e = f(e));
      var r = this.map[t];
      this.map[t] = r ? r + ", " + e : e;
    }),
      (d.prototype.delete = function (t) {
        delete this.map[l(t)];
      }),
      (d.prototype.get = function (t) {
        return (t = l(t)), this.has(t) ? this.map[t] : null;
      }),
      (d.prototype.has = function (t) {
        return this.map.hasOwnProperty(l(t));
      }),
      (d.prototype.set = function (t, e) {
        this.map[l(t)] = f(e);
      }),
      (d.prototype.forEach = function (t, e) {
        for (var r in this.map)
          this.map.hasOwnProperty(r) && t.call(e, this.map[r], r, this);
      }),
      (d.prototype.keys = function () {
        var t = [];
        return (
          this.forEach(function (e, r) {
            t.push(r);
          }),
          h(t)
        );
      }),
      (d.prototype.values = function () {
        var t = [];
        return (
          this.forEach(function (e) {
            t.push(e);
          }),
          h(t)
        );
      }),
      (d.prototype.entries = function () {
        var t = [];
        return (
          this.forEach(function (e, r) {
            t.push([r, e]);
          }),
          h(t)
        );
      }),
      i && (d.prototype[Symbol.iterator] = d.prototype.entries);
    var b = [
      "CONNECT",
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
      "TRACE"
    ];
    function _(t, e) {
      if (!(this instanceof _))
        throw new TypeError(
          'Please use the "new" operator, this DOM object constructor cannot be called as a function.'
        );
      var n,
        i,
        o = (e = e || {}).body;
      if (t instanceof _) {
        if (t.bodyUsed) throw new TypeError("Already read");
        (this.url = t.url),
          (this.credentials = t.credentials),
          e.headers || (this.headers = new d(t.headers)),
          (this.method = t.method),
          (this.mode = t.mode),
          (this.signal = t.signal),
          o || null == t._bodyInit || ((o = t._bodyInit), (t.bodyUsed = !0));
      } else this.url = String(t);
      if (
        ((this.credentials =
          e.credentials || this.credentials || "same-origin"),
        (!e.headers && this.headers) || (this.headers = new d(e.headers)),
        (this.method =
          ((n = e.method || this.method || "GET"),
          (i = n.toUpperCase()),
          b.indexOf(i) > -1 ? i : n)),
        (this.mode = e.mode || this.mode || null),
        (this.signal =
          e.signal ||
          this.signal ||
          (function () {
            if ("AbortController" in r) return new AbortController().signal;
          })()),
        (this.referrer = null),
        "GET" !== this.method ||
          "HEAD" !== this.method ||
          ("no-store" !== e.cache && "no-cache" !== e.cache))
      ) {
        var s = /([?&])_=[^&]*/;
        if (s.test(this.url))
          this.url = this.url.replace(s, "$1_=" + new Date().getTime());
        else {
          this.url +=
            (/\?/.test(this.url) ? "&" : "?") + "_=" + new Date().getTime();
        }
      }
    }
    function w(t) {
      var e = new FormData();
      return (
        t
          .trim()
          .split("&")
          .forEach(function (t) {
            if (t) {
              var r = t.split("="),
                n = r.shift().replace(/\+/g, " "),
                i = r.join("=").replace(/\+/g, " ");
              e.append(decodeURIComponent(n), decodeURIComponent(i));
            }
          }),
        e
      );
    }
    function M(t, e) {
      if (!(this instanceof M))
        throw new TypeError(
          'Please use the "new" operator, this DOM object constructor cannot be called as a function.'
        );
      if (
        (e || (e = {}),
        (this.type = "default"),
        (this.status = void 0 === e.status ? 200 : e.status),
        this.status < 200 || this.status > 599)
      )
        throw new RangeError(
          "Failed to construct 'Response': The status provided (0) is outside the range [200, 599]."
        );
      (this.ok = this.status >= 200 && this.status < 300),
        (this.statusText = void 0 === e.statusText ? "" : "" + e.statusText),
        (this.headers = new d(e.headers)),
        (this.url = e.url || ""),
        this._initBody(t);
    }
    (_.prototype.clone = function () {
      return new _(this, {
        body: this._bodyInit
      });
    }),
      v.call(_.prototype),
      v.call(M.prototype),
      (M.prototype.clone = function () {
        return new M(this._bodyInit, {
          status: this.status,
          statusText: this.statusText,
          headers: new d(this.headers),
          url: this.url
        });
      }),
      (M.error = function () {
        var t = new M(null, {
          status: 200,
          statusText: ""
        });
        return (t.ok = !1), (t.status = 0), (t.type = "error"), t;
      });
    var x = [301, 302, 303, 307, 308];
    M.redirect = function (t, e) {
      if (-1 === x.indexOf(e)) throw new RangeError("Invalid status code");
      return new M(null, {
        status: e,
        headers: {
          location: t
        }
      });
    };
    var k = (t.DOMException = r.DOMException);
    try {
      new k();
    } catch (t) {
      (t.DOMException = k =
        function (t, e) {
          (this.message = t), (this.name = e);
          var r = Error(t);
          this.stack = r.stack;
        }),
        (k.prototype = Object.create(Error.prototype)),
        (k.prototype.constructor = k);
    }
    function j(t, e) {
      return new Promise(function (n, i) {
        var s = new _(t, e);
        if (s.signal && s.signal.aborted)
          return i(new k("Aborted", "AbortError"));
        var u = new XMLHttpRequest();
        function c() {
          u.abort();
        }
        if (
          ((u.onload = function () {
            var t,
              e,
              r = {
                statusText: u.statusText,
                headers:
                  ((t = u.getAllResponseHeaders() || ""),
                  (e = new d()),
                  t
                    .replace(/\r?\n[\t ]+/g, " ")
                    .split("\r")
                    .map(function (t) {
                      return 0 === t.indexOf("\n") ? t.substr(1, t.length) : t;
                    })
                    .forEach(function (t) {
                      var r = t.split(":"),
                        n = r.shift().trim();
                      if (n) {
                        var i = r.join(":").trim();
                        try {
                          e.append(n, i);
                        } catch (t) {
                          console.warn("Response " + t.message);
                        }
                      }
                    }),
                  e)
              };
            0 === s.url.indexOf("file://") && (u.status < 200 || u.status > 599)
              ? (r.status = 200)
              : (r.status = u.status),
              (r.url =
                "responseURL" in u
                  ? u.responseURL
                  : r.headers.get("X-Request-URL"));
            var i = "response" in u ? u.response : u.responseText;
            setTimeout(function () {
              n(new M(i, r));
            }, 0);
          }),
          (u.onerror = function () {
            setTimeout(function () {
              i(new TypeError("Network request failed"));
            }, 0);
          }),
          (u.ontimeout = function () {
            setTimeout(function () {
              i(new TypeError("Network request timed out"));
            }, 0);
          }),
          (u.onabort = function () {
            setTimeout(function () {
              i(new k("Aborted", "AbortError"));
            }, 0);
          }),
          u.open(
            s.method,
            (function (t) {
              try {
                return "" === t && r.location.href ? r.location.href : t;
              } catch (e) {
                return t;
              }
            })(s.url),
            !0
          ),
          "include" === s.credentials
            ? (u.withCredentials = !0)
            : "omit" === s.credentials && (u.withCredentials = !1),
          "responseType" in u &&
            (o
              ? (u.responseType = "blob")
              : a && (u.responseType = "arraybuffer")),
          e &&
            "object" == typeof e.headers &&
            !(
              e.headers instanceof d ||
              (r.Headers && e.headers instanceof r.Headers)
            ))
        ) {
          var h = [];
          Object.getOwnPropertyNames(e.headers).forEach(function (t) {
            h.push(l(t)), u.setRequestHeader(t, f(e.headers[t]));
          }),
            s.headers.forEach(function (t, e) {
              -1 === h.indexOf(e) && u.setRequestHeader(e, t);
            });
        } else
          s.headers.forEach(function (t, e) {
            u.setRequestHeader(e, t);
          });
        s.signal &&
          (s.signal.addEventListener("abort", c),
          (u.onreadystatechange = function () {
            4 === u.readyState && s.signal.removeEventListener("abort", c);
          })),
          u.send(void 0 === s._bodyInit ? null : s._bodyInit);
      });
    }
    (j.polyfill = !0),
      r.fetch ||
        ((r.fetch = j), (r.Headers = d), (r.Request = _), (r.Response = M));
  })(window);
})(window);
