// worker.js
// console.log("self", self);
self.onmessage = function (event) {
  const { delay, callbackId } = event.data;
  // console.log("callbackId", callbackId);
  // 使用 setTimeout 来实现延时
  let timer = setTimeout(() => {
    self.postMessage({ callbackId });
    clearTimeout(timer);
    timer = null;
  }, delay);
};
