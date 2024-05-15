/**
 * @description: node+koa本地服务器api列表
 */

import axios from '@/utils/axios'

// 签名
const postTest = (params) => axios.post('/opi/signin', params)

// get请求测试
const getTest = (params) => axios.get('/opi/hello/zq', {params})

export default {
    postTest,
    getTest
}