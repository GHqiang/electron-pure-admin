export function md5(e) {
  function t(e, t) {
    return (e << t) | (e >>> (32 - t));
  }

  function n(e, t) {
    var n, r, a, o, i;
    return (
      (a = 2147483648 & e),
      (o = 2147483648 & t),
      (n = 1073741824 & e),
      (r = 1073741824 & t),
      (i = (1073741823 & e) + (1073741823 & t)),
      n & r
        ? 2147483648 ^ i ^ a ^ o
        : n | r
          ? 1073741824 & i
            ? 3221225472 ^ i ^ a ^ o
            : 1073741824 ^ i ^ a ^ o
          : i ^ a ^ o
    );
  }

  function r(e, t, n) {
    return (e & t) | (~e & n);
  }

  function a(e, t, n) {
    return (e & n) | (t & ~n);
  }

  function o(e, t, n) {
    return e ^ t ^ n;
  }

  function i(e, t, n) {
    return t ^ (e | ~n);
  }

  function s(e, a, o, i, s, c, u) {
    return (e = n(e, n(n(r(a, o, i), s), u))), n(t(e, c), a);
  }

  function c(e, r, o, i, s, c, u) {
    return (e = n(e, n(n(a(r, o, i), s), u))), n(t(e, c), r);
  }

  function u(e, r, a, i, s, c, u) {
    return (e = n(e, n(n(o(r, a, i), s), u))), n(t(e, c), r);
  }

  function l(e, r, a, o, s, c, u) {
    return (e = n(e, n(n(i(r, a, o), s), u))), n(t(e, c), r);
  }

  function d(e) {
    var t,
      n = e.length,
      r = n + 8,
      a = (r - (r % 64)) / 64,
      o = 16 * (a + 1),
      i = new Array(o - 1),
      s = 0,
      c = 0;
    while (c < n)
      (t = (c - (c % 4)) / 4),
        (s = (c % 4) * 8),
        (i[t] = i[t] | (e.charCodeAt(c) << s)),
        c++;
    return (
      (t = (c - (c % 4)) / 4),
      (s = (c % 4) * 8),
      (i[t] = i[t] | (128 << s)),
      (i[o - 2] = n << 3),
      (i[o - 1] = n >>> 29),
      i
    );
  }

  function p(e) {
    var t,
      n,
      r = "",
      a = "";
    for (n = 0; n <= 3; n++)
      (t = (e >>> (8 * n)) & 255),
        (a = "0" + t.toString(16)),
        (r += a.substr(a.length - 2, 2));
    return r;
  }

  function f(e) {
    e = e.replace(/\r\n/g, "\n");
    for (var t = "", n = 0; n < e.length; n++) {
      var r = e.charCodeAt(n);
      r < 128
        ? (t += String.fromCharCode(r))
        : r > 127 && r < 2048
          ? ((t += String.fromCharCode((r >> 6) | 192)),
            (t += String.fromCharCode((63 & r) | 128)))
          : ((t += String.fromCharCode((r >> 12) | 224)),
            (t += String.fromCharCode(((r >> 6) & 63) | 128)),
            (t += String.fromCharCode((63 & r) | 128)));
    }
    return t;
  }
  var g,
    m,
    h,
    v,
    _,
    y,
    S,
    A,
    b,
    x = [],
    C = 7,
    E = 12,
    I = 17,
    k = 22,
    P = 5,
    N = 9,
    T = 14,
    w = 20,
    O = 4,
    L = 11,
    j = 16,
    D = 23,
    R = 6,
    M = 10,
    U = 15,
    G = 21;
  for (
    e = f(e),
      x = d(e),
      y = 1732584193,
      S = 4023233417,
      A = 2562383102,
      b = 271733878,
      g = 0;
    g < x.length;
    g += 16
  )
    (m = y),
      (h = S),
      (v = A),
      (_ = b),
      (y = s(y, S, A, b, x[g + 0], C, 3614090360)),
      (b = s(b, y, S, A, x[g + 1], E, 3905402710)),
      (A = s(A, b, y, S, x[g + 2], I, 606105819)),
      (S = s(S, A, b, y, x[g + 3], k, 3250441966)),
      (y = s(y, S, A, b, x[g + 4], C, 4118548399)),
      (b = s(b, y, S, A, x[g + 5], E, 1200080426)),
      (A = s(A, b, y, S, x[g + 6], I, 2821735955)),
      (S = s(S, A, b, y, x[g + 7], k, 4249261313)),
      (y = s(y, S, A, b, x[g + 8], C, 1770035416)),
      (b = s(b, y, S, A, x[g + 9], E, 2336552879)),
      (A = s(A, b, y, S, x[g + 10], I, 4294925233)),
      (S = s(S, A, b, y, x[g + 11], k, 2304563134)),
      (y = s(y, S, A, b, x[g + 12], C, 1804603682)),
      (b = s(b, y, S, A, x[g + 13], E, 4254626195)),
      (A = s(A, b, y, S, x[g + 14], I, 2792965006)),
      (S = s(S, A, b, y, x[g + 15], k, 1236535329)),
      (y = c(y, S, A, b, x[g + 1], P, 4129170786)),
      (b = c(b, y, S, A, x[g + 6], N, 3225465664)),
      (A = c(A, b, y, S, x[g + 11], T, 643717713)),
      (S = c(S, A, b, y, x[g + 0], w, 3921069994)),
      (y = c(y, S, A, b, x[g + 5], P, 3593408605)),
      (b = c(b, y, S, A, x[g + 10], N, 38016083)),
      (A = c(A, b, y, S, x[g + 15], T, 3634488961)),
      (S = c(S, A, b, y, x[g + 4], w, 3889429448)),
      (y = c(y, S, A, b, x[g + 9], P, 568446438)),
      (b = c(b, y, S, A, x[g + 14], N, 3275163606)),
      (A = c(A, b, y, S, x[g + 3], T, 4107603335)),
      (S = c(S, A, b, y, x[g + 8], w, 1163531501)),
      (y = c(y, S, A, b, x[g + 13], P, 2850285829)),
      (b = c(b, y, S, A, x[g + 2], N, 4243563512)),
      (A = c(A, b, y, S, x[g + 7], T, 1735328473)),
      (S = c(S, A, b, y, x[g + 12], w, 2368359562)),
      (y = u(y, S, A, b, x[g + 5], O, 4294588738)),
      (b = u(b, y, S, A, x[g + 8], L, 2272392833)),
      (A = u(A, b, y, S, x[g + 11], j, 1839030562)),
      (S = u(S, A, b, y, x[g + 14], D, 4259657740)),
      (y = u(y, S, A, b, x[g + 1], O, 2763975236)),
      (b = u(b, y, S, A, x[g + 4], L, 1272893353)),
      (A = u(A, b, y, S, x[g + 7], j, 4139469664)),
      (S = u(S, A, b, y, x[g + 10], D, 3200236656)),
      (y = u(y, S, A, b, x[g + 13], O, 681279174)),
      (b = u(b, y, S, A, x[g + 0], L, 3936430074)),
      (A = u(A, b, y, S, x[g + 3], j, 3572445317)),
      (S = u(S, A, b, y, x[g + 6], D, 76029189)),
      (y = u(y, S, A, b, x[g + 9], O, 3654602809)),
      (b = u(b, y, S, A, x[g + 12], L, 3873151461)),
      (A = u(A, b, y, S, x[g + 15], j, 530742520)),
      (S = u(S, A, b, y, x[g + 2], D, 3299628645)),
      (y = l(y, S, A, b, x[g + 0], R, 4096336452)),
      (b = l(b, y, S, A, x[g + 7], M, 1126891415)),
      (A = l(A, b, y, S, x[g + 14], U, 2878612391)),
      (S = l(S, A, b, y, x[g + 5], G, 4237533241)),
      (y = l(y, S, A, b, x[g + 12], R, 1700485571)),
      (b = l(b, y, S, A, x[g + 3], M, 2399980690)),
      (A = l(A, b, y, S, x[g + 10], U, 4293915773)),
      (S = l(S, A, b, y, x[g + 1], G, 2240044497)),
      (y = l(y, S, A, b, x[g + 8], R, 1873313359)),
      (b = l(b, y, S, A, x[g + 15], M, 4264355552)),
      (A = l(A, b, y, S, x[g + 6], U, 2734768916)),
      (S = l(S, A, b, y, x[g + 13], G, 1309151649)),
      (y = l(y, S, A, b, x[g + 4], R, 4149444226)),
      (b = l(b, y, S, A, x[g + 11], M, 3174756917)),
      (A = l(A, b, y, S, x[g + 2], U, 718787259)),
      (S = l(S, A, b, y, x[g + 9], G, 3951481745)),
      (y = n(y, m)),
      (S = n(S, h)),
      (A = n(A, v)),
      (b = n(b, _));
  var B = p(y) + p(S) + p(A) + p(b);
  return B.toLowerCase();
}
