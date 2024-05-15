/**
 * @description: indexDB测试
 */

// async function main() {
//     // 初始化数据库
//     await idbApi.initializeDatabase();
//     let processingTime = Date.now()

//     // 插入订单记录
//     const orderRecord1 = {
//         orderNumber: 'ORDER1',
//         totalAmount: 100.00,
//         profit: 20.00,
//         processingTime: processingTime,
//     };
//     await idbApi.insertOrUpdateData(orderRecord1);
//     const orderRecord2 = {
//         orderNumber: 'ORDER2',
//         totalAmount: 200.00,
//         profit: 40.00,
//         processingTime: processingTime - 10000,
//     };
//     await idbApi.insertOrUpdateData(orderRecord2);

//     // 查询订单记录
//     const orderNumberFilter = { orderNumber: 'ORDER1' };
//     const foundByOrderNumber = await idbApi.queryOrderRecords(orderNumberFilter);
//     console.log('Found by order number:', foundByOrderNumber);
//     const processingTimeFilter = { processingTime: processingTime - 2000 };
//     const foundByProcessingTime = await idbApi.queryOrderRecords(processingTimeFilter);
//     console.log('Found by processing time:', foundByProcessingTime);
//     // const res1 = await idbApi.queryOrderRecords({
//     //     timeRange: [processingTime-20000, processingTime+1000]
//     // })
//     // console.log('res1:', res1);
//     // 查询全部订单记录
//     const allOrders = await idbApi.getAllOrderRecords();
//     console.log('All orders:', allOrders);

//     // 更新订单记录
//     const updatedOrderRecord = {
//         orderNumber: 'ORDER1',
//         totalAmount: 150.00,
//         profit: 30.00,
//     };
//     await idbApi.updateOrderRecord('ORDER1', updatedOrderRecord);

//     // 查询更新后的订单记录
//     const updatedOrder = await idbApi.queryOrderRecords({ orderNumber: 'ORDER1' });
//     console.log('Updated order:', updatedOrder);

//     // 删除某个时间戳之前的所有订单记录
//     const deleteBeforeTimestamp = processingTime - 1000;
//     console.log('Delete before timestamp:', deleteBeforeTimestamp);
//     await idbApi.deleteOrderRecords({ processingTime: deleteBeforeTimestamp });

//     // 查询删除后剩余的订单记录
//     const remainingOrders = await idbApi.getAllOrderRecords();
//     console.log('Remaining orders:', remainingOrders);

//     // 删除特定订单记录
//     await idbApi.deleteOrderRecords({ orderNumber: 'ORDER1' });

//     // 再次查询剩余订单记录
//       const finalOrders = await idbApi.getAllOrderRecords();
//       console.log('Final orders:', finalOrders);
// }

