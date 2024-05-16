export default {
    mounted(el, binding) {
      const throttleTime = binding.value || 2000 // 防抖时间
    //   console.log(throttleTime, 'throttleTime')
  
      const handleClick = (event) => {
        // console.log('event', event, el)
        if (el.nodeName === 'BUTTON' || el.type === 'button') {
          if (!el.disabled) {
            el.disabled = true
            setTimeout(() => {
              el.disabled = false
            }, throttleTime)
          }
        } else {
          el.style.pointerEvents = 'none'
          setTimeout(() => {
            if (el && el.style) {
              el.style.pointerEvents = 'auto'
            }
          }, throttleTime)
        }
      }
  
      const nativeButton = el.querySelector('button, [type="button"]')
      if (nativeButton) {
        nativeButton.addEventListener('click', handleClick, false)
      } else {
        el.addEventListener('click', handleClick, false)
      }
    }
  }