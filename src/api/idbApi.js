/**
 * @description: indexDB封装api列表
 */

import { openDB, deleteDB } from 'idb'
// console.log('openDB', openDB)
// 数据库和数据表定义
const DATABASE_NAME = 'orderManagement'
const ORDER_OFFER_STORE_NAME = 'orderOfferRecords'
const ORDER_TICKET_STORE_NAME = 'orderRecords'

/**
 * 初始化数据库
 *
 * 如果数据库不存在，或者版本号低于指定值（本例中为1），则触发升级回调。
 * 在升级回调中，创建名为 'orderRecords' 的数据表，其主键为 'id'，且自增。
 * 为便于查询，为 'orderNumber' 和 'processingTime' 字段创建索引。

 * 返回一个 Promise，解析为已打开的数据库实例。
 */
async function initializeDatabase() {
    return openDB(DATABASE_NAME, 1, {
        upgrade(db) {
            console.log('Upgrading database from version', db.version)
            if (!db.objectStoreNames.contains(ORDER_TICKET_STORE_NAME)) {
                const store = db.createObjectStore(ORDER_TICKET_STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                })

                // 创建 'orderNumber' 索引，非唯一
                store.createIndex('orderNumberIndex', 'orderNumber', { unique: false })

                // 创建 'processingTime' 索引，非唯一
                store.createIndex('processingTimeIndex', 'processingTime', { unique: false })
            }
            if (!db.objectStoreNames.contains(ORDER_OFFER_STORE_NAME)) {
                const store = db.createObjectStore(ORDER_OFFER_STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                })

                // 创建 'orderNumber' 索引，非唯一
                store.createIndex('orderNumberIndex', 'orderNumber', { unique: false })

                // 创建 'processingTime' 索引，非唯一
                store.createIndex('processingTimeIndex', 'processingTime', { unique: false })
            }
        }
    })
}

/**
 * 插入订单记录
 *
 * 接收一个订单记录对象作为参数。
 * 使用事务将该订单记录对象添加到 'orderRecords' 数据表中。
 * 自增的主键 'id' 由 IndexedDB 自动分配。

 * 返回一个 Promise，解析为事务完成。
 */
async function insertOrUpdateData (record, tableType) {
    let tableName = tableType === 1 ? ORDER_OFFER_STORE_NAME : ORDER_TICKET_STORE_NAME
    // 查询是否存在已有记录
    let orderNumber = record.orderNumber
    const existingRecord = await queryOrderRecords({orderNumber}, tableType)
    // console.log('是否已有记录', !!existingRecord?.length)
    const db = await initializeDatabase()
    const tx = db.transaction(tableName, 'readwrite')
    const store = tx.objectStore(tableName)
    
    if (existingRecord?.length) {
        // 已有记录，进行更新
        store.put(record)
        console.log('更新数据:', record)
    } else {
        // 不存在记录，进行插入
        store.add(record)
        console.log('插入数据:', record)
    }

    await tx.complete
    return tx.complete
}

/**
 * 查询订单记录
 *
 * 接收一个过滤对象作为参数，该对象可以包含以下属性：
 *   - orderNumber: {string} - 订单号，用于精确查询单个订单记录
 *   - processingTime: {number} - 时间戳，用于查询该时间戳之前的所有订单记录
 *   - timeRange: {number[]} - 时间戳范围数组，如 [startTime, endTime]，用于查询该时间范围内的所有订单记录

 * 返回一个 Promise，解析为查询结果数组。

 * 如果过滤对象未包含有效属性（即 orderNumber、processingTime 或 timeRange），抛出错误。
 */
async function queryOrderRecords(filter, tableType) {
    let tableName = tableType === 1 ? ORDER_OFFER_STORE_NAME : ORDER_TICKET_STORE_NAME
    const db = await initializeDatabase()
    const tx = db.transaction(tableName, 'readonly')
    const store = tx.objectStore(tableName)

    let index
    let range

    if (filter.orderNumber) {
        index = store.index('orderNumberIndex')
        range = IDBKeyRange.only(filter.orderNumber)
    } else if (filter.processingTime) {
        index = store.index('processingTimeIndex')
        range = IDBKeyRange.upperBound(filter.processingTime, true) // 包含等于边界值的记录
    } else if (
        filter.timeRange &&
        Array.isArray(filter.timeRange) &&
        filter.timeRange.length === 2 &&
        typeof filter.timeRange[0] === 'number' &&
        typeof filter.timeRange[1] === 'number'
    ) {
        index = store.index('processingTimeIndex')
        range = IDBKeyRange.bound(filter.timeRange[0], filter.timeRange[1], false, true) // 不包含边界值
    } else {
        throw new Error(
            'Invalid filter provided. Please specify either orderNumber, processingTime, or timeRange.'
        )
    }
    // console.log('查询index', index, 'range', range)
    let cursor = await index.openCursor(range)
    // console.log('查询cursor', cursor)

    let records = []
    while (cursor) {
        // 处理当前游标指向的数据（如：cursor.value）
        // console.log('cursor', cursor, cursor.value, cursor.continue)
        // 检查游标是否仍有效，如果有效则继续迭代
        if (cursor && cursor.continue) {
            records.push(cursor.value)
            cursor = await cursor.continue()
        } else {
            break // 游标无效或已到达末尾，退出循环
        }
    }
    return records
}

/**
 * 查询全部订单记录
 *
 * 返回一个 Promise，解析为数据表中所有订单记录组成的数组。
 */
async function getAllOrderRecords(tableType) {
    let tableName = tableType === 1 ? ORDER_OFFER_STORE_NAME : ORDER_TICKET_STORE_NAME
    const db = await initializeDatabase()
    const tx = db.transaction(tableName, 'readonly')
    const store = tx.objectStore(tableName)

    return store.getAll()
}

/**
 * 更新订单记录
 *
 * 接收订单号和待更新的订单记录对象作为参数。
 * 方法首先查询订单号对应的原始记录，如果存在，则将待更新的属性合并到原始记录中，并使用 `store.put` 更新记录。
 * 如果原始记录不存在，抛出错误。

 * 返回一个 Promise，解析为事务完成。
 */
async function updateOrderRecord(orderNumber, updatedRecord, tableType) {
    let tableName = tableType === 1 ? ORDER_OFFER_STORE_NAME : ORDER_TICKET_STORE_NAME
    const db = await initializeDatabase()
    const tx = db.transaction(tableName, 'readwrite')
    const store = tx.objectStore(tableName)
    // console.log('updateOrderRecord-orderNumber', orderNumber)
    let index = store.index('orderNumberIndex')
    let range = IDBKeyRange.only(orderNumber)
    // console.log('更新index', index, 'range', range)
    const cursor = await index.openCursor(range)
    // console.log('更新cursor', cursor)
    const records = []
    while (cursor) {
        records.push(cursor.value)
        // console.log('cursor', cursor, cursor.continue)
        break
    }

    // const request = store.get(orderNumber)
    // console.log('request', request)
    // const originalRecord = await request.result
    const originalRecord = records[0]
    console.log('originalRecord', originalRecord)
    if (originalRecord) {
        // Update the existing record with the provided properties
        Object.assign(originalRecord, updatedRecord)
        await store.put(originalRecord)
    } else {
        throw new Error(`Order record with order number ${orderNumber} not found.`)
    }

    return tx.complete
}

/**
 * 删除订单记录
 *
 * 接收一个过滤对象作为参数，该对象可以包含以下属性：
 *   - orderNumber: {string} - 订单号，用于精确删除单个订单记录
 *   - processingTime: {number} - 时间戳，用于删除该时间戳之前的所有订单记录
 *   - timeRange: {number[]} - 时间戳范围数组，如 [startTime, endTime]，用于删除该时间范围内的所有订单记录

 * 示例：
 *   deleteOrderRecords({ orderNumber: 'ORDER123' }); // 删除订单号为 'ORDER123' 的订单记录
 *   deleteOrderRecords({ processingTime: 1638850000000 }); // 删除时间戳小于等于 1638850000000 的所有订单记录
 *   deleteOrderRecords({ timeRange: [1638840000000, 1638860000000] }); // 删除时间戳在 [1638840000000, 1638860000000) 范围内的所有订单记录

 * 返回一个 Promise，解析为事务完成。
 */
async function deleteOrderRecords(filter, tableType) {
    let tableName = tableType === 1 ? ORDER_OFFER_STORE_NAME : ORDER_TICKET_STORE_NAME
    const db = await initializeDatabase()
    const tx = db.transaction(tableName, 'readwrite')
    const store = tx.objectStore(tableName)

    let index
    let range

    if (filter.orderNumber) {
        index = store.index('orderNumberIndex')
        range = IDBKeyRange.only(filter.orderNumber)
    } else if (filter.processingTime) {
        index = store.index('processingTimeIndex')
        range = IDBKeyRange.upperBound(filter.processingTime, false) // 不包含边界值
    } else if (
        filter.timeRange &&
        Array.isArray(filter.timeRange) &&
        filter.timeRange.length === 2 &&
        typeof filter.timeRange[0] === 'number' &&
        typeof filter.timeRange[1] === 'number'
    ) {
        index = store.index('processingTimeIndex')
        range = IDBKeyRange.bound(filter.timeRange[0], filter.timeRange[1], false, false) // 不包含边界值
    } else {
        throw new Error(
            'Invalid filter provided. Please specify either an orderNumber, a processingTime, or a timeRange array.'
        )
    }
    // console.log('删除index', index, 'range', range)
    let cursor = await index.openCursor(range)
    // console.log('删除cursor', cursor)
    while (cursor) {
        // 处理当前游标指向的数据（如：cursor.value）
        // console.log('cursor', cursor, cursor.value, cursor.continue )
        // 检查游标是否仍有效，如果有效则继续迭代
        if (cursor && cursor.continue) {
            store.delete(cursor.primaryKey)
            cursor = await cursor.continue()
        } else {
            break // 游标无效或已到达末尾，退出循环
        }
    }

    // index.openCursor(range).onsuccess = (event) => {
    //     console.log('event', event)
    //     const cursor = event.target.result
    //     console.log('cursor', cursor, cursor.continue)

    //     if (cursor) {
    //         store.delete(cursor.primaryKey)
    //         cursor.continue() // 添加这一行，确保游标能够移动到下一条记录
    //     }
    // }
    return tx.complete
}

// 导出所有公共函数供外部模块使用
export default {
    initializeDatabase, // 初始化数据库
    insertOrUpdateData , // 插入或更新订单记录
    queryOrderRecords, // 查询订单记录
    getAllOrderRecords, // 获取所有订单记录
    updateOrderRecord, // 更新订单记录
    deleteOrderRecords // 删除订单记录
}
