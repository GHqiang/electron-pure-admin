// 导入 ExcelJS 库
import ExcelJS from 'exceljs';
/**
 * 获取当前日期和时间的格式化字符串
 * 无参数
 * @return {string} 返回格式为 "YYYY-MM-DD HH:MM:SS" 的字符串
 */
function getCurrentFormattedDateTime() {
    const now = new Date();

    // 获取年、月、日、小时、分钟、秒
    const year = now.getFullYear();
    const month = ('0' + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
    const date = ('0' + now.getDate()).slice(-2);
    const hours = ('0' + now.getHours()).slice(-2);
    const minutes = ('0' + now.getMinutes()).slice(-2);
    const seconds = ('0' + now.getSeconds()).slice(-2);

    // 组合成所需格式
    const formattedDateTime = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

    return formattedDateTime;
}

function getFormattedDateTime(sjc) {
    const now = new Date(sjc);

    // 获取年、月、日、小时、分钟、秒
    const year = now.getFullYear();
    const month = ('0' + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
    const date = ('0' + now.getDate()).slice(-2);
    const hours = ('0' + now.getHours()).slice(-2);
    const minutes = ('0' + now.getMinutes()).slice(-2);
    const seconds = ('0' + now.getSeconds()).slice(-2);

    // 组合成所需格式
    const formattedDateTime = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

    return formattedDateTime;
}

// 导出 Excel 文件
async function exportExcel(columns, data) {
    // 准备要导出的数据
    // const data = [
    //     { name: '张三', age: 25, gender: '男' },
    //     { name: '李四', age: 30, gender: '女' },
    //     { name: '王五', age: 2¾, gender: '男' },
    // ];

    // 创建一个新的 Excel 工作簿
    const workbook = new ExcelJS.Workbook();

    // 添加一个工作表并命名
    const worksheet = workbook.addWorksheet('Employee Data');

    // 设置列定义（表头）
    worksheet.columns = columns
    // [
    //     { header: '姓名', key: 'name', width: 20 },
    //     { header: '年龄', key: 'age', width: 10 },
    //     { header: '性别', key: 'gender', width: 10 },
    // ];

    // 将数据添加到工作表
    data.forEach(item => worksheet.addRow(item));

    // 将工作簿写入内存中的 Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 创建 Blob 对象
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // 创建下载链接
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '出票记录.xlsx'; // 设置下载文件名
    document.body.appendChild(link);

    // 触发点击下载
    link.click();

    // 清理资源
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

/**
 * 计算Levenshtein距离
 * @param {string} source 源字符串
 * @param {string} target 目标字符串
 */
function levenshteinDistance(source, target) {
    let sourceLength = source.length;
    let targetLength = target.length;
    if (sourceLength === 0) return targetLength;
    if (targetLength === 0) return sourceLength;

    let matrix = [];

    // 初始化矩阵
    for (let i = 0; i <= sourceLength; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= targetLength; j++) {
        matrix[0][j] = j;
    }

    // 动态规划填充矩阵
    for (let i = 1; i <= sourceLength; i++) {
        for (let j = 1; j <= targetLength; j++) {
            if (source.charAt(i - 1) === target.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替换
                    matrix[i - 1][j] + 1,     // 删除
                    matrix[i][j - 1] + 1       // 插入
                );
            }
        }
    }

    return matrix[sourceLength][targetLength];
}

/**
 * 找出与目标字符串匹配度最高的字符串
 * @param {Array<string>} strings 字符串数组
 * @param {string} target 目标字符串
 */
function findBestMatchByLevenshtein(strings, target) {
    let minDistance = Infinity;
    let bestMatch = null;

    strings.forEach(str => {
        let distance = levenshteinDistance(str, target);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = str;
        }
    });

    return bestMatch;
}

/**
 * 找出与目标字符串匹配度最高的字符串，且匹配度需达到指定阈值
 * @param {Array<string>} strings 字符串数组
 * @param {string} target 目标字符串
 * @param {number} threshold 匹配度阈值，默认为0，表示只要求有匹配结果
 */
function findBestMatchByLevenshteinWithThreshold(strings, target, threshold = 0) {
    let minDistance = Infinity;
    let bestMatch = null;

    strings.forEach(str => {
        let distance = levenshteinDistance(str, target);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = str;
        }
    });

    // 检查最小距离是否在阈值内
    if (minDistance <= threshold) {
        return bestMatch;
    } else {
        // 如果没有达到匹配度要求，返回空字符串或null
        return null; // 或者返回 '' 表示空字符串
    }
}

// 判断time1时间是否在time2之后
function isTimeAfter(time1, time2) {  
    // 将时间字符串分割为小时、分钟和秒  
    const [hours1, minutes1, seconds1] = time1.split(':').map(Number);  
    const [hours2, minutes2, seconds2] = time2.split(':').map(Number);  
  
    // 创建一个表示当天日期的Date对象（用于时间比较）  
    const dateToday = new Date();  
  
    // 设置第一个时间的Date对象为当天的00:00:00  
    dateToday.setHours(0, 0, 0, 0); // 年、月、日、毫秒  
    dateToday.setHours(hours1, minutes1, seconds1); // 设置时间  
  
    // 复制Date对象以设置第二个时间  
    const dateToday2 = new Date(dateToday);  
    dateToday2.setHours(hours2, minutes2, seconds2); // 设置时间  
  
    // 比较两个时间  
    return dateToday.getTime() > dateToday2.getTime();  
}  
export {
    getCurrentFormattedDateTime,
    exportExcel,
    getFormattedDateTime,
    findBestMatchByLevenshtein,
    findBestMatchByLevenshteinWithThreshold,
    isTimeAfter
}