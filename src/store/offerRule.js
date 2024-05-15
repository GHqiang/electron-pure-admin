import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDataTableStore = defineStore('dataTable', {
    state: () => {
        return {
            items: ref([])
        }
    },
    actions: {
        // 从localStorage中获取数据
        async fetchItemsFromLocalStorage() {
            const data = localStorage.getItem('tableData')
            console.log('localStorage-tableDataRule', data)
            if (data) {
                this.items = JSON.parse(data)
                if (this.items.length) {
                    return
                }
            }
            this.items = [
                {
                    id: 1,
                    ruleName: '1线城市普厅',
                    shadowLineName: 'sfc',
                    status: '1',
                    isOffer: '1',
                    offerType: '1',
                    offerAmount: '40.5',
                    includeCityNames: ['北京市', '上海市', '杭州市'],
                    excludeCityNames: [],
                    includeCinemaNames: [],
                    excludeCinemaNames: [],
                    includeHallNames: [],
                    excludeHallNames: [],
                    includeFilmNames: [],
                    excludeFilmNames: [],
                    weekDay: [],
                    memberDay: '',
                    timeLimit: '',
                    seatNum: '',
                    ruleStartTime: '07:00',
                    ruleEndTime: '18:00'
                },
                {
                    id: 2,
                    ruleName: '2线城市普厅',
                    shadowLineName: 'sfc',
                    status: '1',
                    isOffer: '1',
                    offerType: '1',
                    offerAmount: '37',
                    includeCityNames: [],
                    excludeCityNames: ['北京市', '上海市', '杭州市'],
                    includeCinemaNames: [],
                    excludeCinemaNames: [],
                    includeHallNames: [],
                    excludeHallNames: [],
                    includeFilmNames: [],
                    excludeFilmNames: [],
                    weekDay: ['星期一', '星期二'],
                    memberDay: '',
                    timeLimit: '',
                    seatNum: '1',
                    ruleStartTime: '07:00',
                    ruleEndTime: '18:00'
                },
                {
                    id: 3,
                    ruleName: '特殊厅报价',
                    shadowLineName: 'sfc',
                    status: '1',
                    isOffer: '1',
                    offerType: '2',
                    addAmount: '2',
                    includeCityNames: [],
                    excludeCityNames: [],
                    includeCinemaNames: [],
                    excludeCinemaNames: [],
                    includeHallNames: [
                        'vip',
                        '4D',
                        'IMAX',
                        '巨幕',
                        'Onyx LED',
                        'Atmos',
                        '4DX',
                        'LUXE',
                        'Cinema',
                        'LED',
                        '杜比',
                        '元宇宙'
                    ],
                    excludeHallNames: [],
                    includeFilmNames: [],
                    excludeFilmNames: [],
                    weekDay: [],
                    memberDay: '',
                    timeLimit: '6',
                    seatNum: '2',
                    ruleStartTime: '07:00',
                    ruleEndTime: '18:00'
                },
                {
                    id: 4,
                    ruleName: '会员日报价-普通厅',
                    shadowLineName: 'sfc',
                    status: '1',
                    isOffer: '1',
                    offerType: '3',
                    offerAmount: '20',
                    includeCityNames: [],
                    excludeCityNames: [],
                    includeCinemaNames: [],
                    excludeCinemaNames: [],
                    includeHallNames: [],
                    excludeHallNames: [],
                    includeFilmNames: [],
                    excludeFilmNames: [],
                    weekDay: [],
                    memberDay: '2024-05-12',
                    timeLimit: '',
                    ruleStartTime: '07:00',
                    ruleEndTime: '18:00'
                },
                {
                    id: 5,
                    ruleName: '会员日报价-特殊厅',
                    shadowLineName: 'sfc',
                    status: '1',
                    isOffer: '1',
                    offerType: '3',
                    offerAmount: '30',
                    includeCityNames: [],
                    excludeCityNames: [],
                    includeCinemaNames: [],
                    excludeCinemaNames: [],
                    includeHallNames: ['VIP厅'],
                    excludeHallNames: [],
                    includeFilmNames: [],
                    excludeFilmNames: [],
                    weekDay: [],
                    memberDay: '2024-05-12',
                    timeLimit: '',
                    ruleStartTime: '07:00',
                    ruleEndTime: '18:00'
                },
            ]
        },
        addItem(item) {
            this.items.push(item)
            this.saveToLocalStorage()
        },
        updateItem(index, updatedItem) {
            this.items[index] = updatedItem
            this.saveToLocalStorage()
        },
        deleteItem(index) {
            this.items.splice(index, 1)
            this.saveToLocalStorage()
        },
        batchDeleteItem(ids) {
            let tempArr = this.items.filter((item) => !ids.includes(item.id))
            console.log('tempArr==>', tempArr)
            this.items = tempArr
            this.saveToLocalStorage()
        },
        saveToLocalStorage() {
            localStorage.setItem('tableData', JSON.stringify(this.items))
        }
    },
    getters: {
        // 可以添加getters以方便在组件中使用过滤、排序等逻辑
    }
})
