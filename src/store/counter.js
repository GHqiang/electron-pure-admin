import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)

  const doubleCount = computed(() => count.value * 2)
  function increment() {
    count.value++
  }
  const token = ref('')
  return { count, token, doubleCount, increment }
})
let userInfo = window.localStorage.getItem('userInfo') || ''
if(userInfo) {
    userInfo = JSON.parse(userInfo)
}
export const userStore = defineStore('user', {
  state: () => ({
    userInfo: userInfo || {
        // "card_count": "0",
        // "card_num": "0",
        // "have_new_coupon": "0",
        // "head_img": "",
        // "mobile": "17638150697", // 13073792313、13073795001
        // "nickname": "17638150697",
        // "no_pay_order": "0",
        // "session_id": "660a45f299c450304cef5b8a1c4c60378bb24b4bc936d",
        // "user_id": "765843",
        // "modified_birthday": "0",
        // "modified_info": "0",
        // "member_center_h5_url": "http://group.leying.com/point/member-center"
    }, // 用户信息
    platToken: '' // 猎人票务平台token
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
  }),
  getters: {
    mobile(state) {
      return state.userInfo.mobile || ''
    },
    // sfc上影token
    token(state) {
      return state.userInfo.session_id || ''
    },
  },
  actions: {
    // 设置用户线信息
    setUserInfo(data) {
      console.warn('设置用户信息userInfo', data)
      window.localStorage.setItem('userInfo', JSON.stringify(data))
      this.userInfo = data
    },
    // 设置猎人票务平台token
    setPlatToken(data) {
      console.warn('设置平台token', data)
      window.localStorage.setItem('platToken', JSON.stringify(data))
      this.platToken = data
    }
  }
})
