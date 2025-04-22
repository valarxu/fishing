const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Binance API配置
const BINANCE_API = 'https://api.binance.com';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '5m';
const LIMIT = 1000; // 每次请求的最大数量
const TOTAL_KLINES = 104000; // 需要获取的总K线数量
const PROXY = 'http://127.0.0.1:4780';

// 默认结束时间：2025年4月1日
const DEFAULT_END_TIME = new Date('2025-04-15T00:00:00Z').getTime();

// 代理配置
const axiosInstance = axios.create({
  httpsAgent: new HttpsProxyAgent(PROXY)
});

// 延时函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllKlines(endTime = DEFAULT_END_TIME) {
  try {
    console.log(`开始获取K线数据，从${new Date(endTime).toISOString()}往前获取${TOTAL_KLINES}根${INTERVAL}K线...`);
    
    let allKlines = [];
    let currentEndTime = endTime;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    
    // 分批获取数据直到达到目标数量
    while (allKlines.length < TOTAL_KLINES) {
      try {
        // 添加随机延迟避免API限制
        await delay(300 + Math.random() * 200);
        
        const batchKlines = await fetchKlinesBatch(currentEndTime);
        
        if (batchKlines.length === 0) {
          console.log('没有更多数据可获取');
          break;
        }
        
        // 将获取的K线添加到总数组中
        allKlines = [...allKlines, ...batchKlines];
        console.log(`已获取${allKlines.length}/${TOTAL_KLINES}根K线数据`);
        
        // 更新下一批请求的结束时间为当前批次的第一个K线的开始时间减1毫秒，避免重复
        currentEndTime = batchKlines[0][0] - 1;
        
        // 重置重试计数器
        retryCount = 0;
      } catch (error) {
        retryCount++;
        console.error(`第${retryCount}次获取失败: ${error.message}`);
        
        if (retryCount >= MAX_RETRIES) {
          console.error('达到最大重试次数，终止获取');
          break;
        }
        
        const waitTime = 2000 * retryCount;
        console.log(`等待${waitTime/1000}秒后重试...`);
        await delay(waitTime);
      }
    }
    
    // 对K线数据按时间升序排序
    allKlines.sort((a, b) => a[0] - b[0]);
    
    // 保存数据到当前目录
    const filePath = path.join(__dirname, 'klines_historical.json');
    fs.writeFileSync(filePath, JSON.stringify(allKlines, null, 2));
    
    console.log(`成功获取${allKlines.length}条K线数据并保存到${filePath}`);
    return allKlines;
  } catch (error) {
    console.error('获取K线历史数据失败:', error.message);
    throw error;
  }
}

async function fetchKlinesBatch(endTime) {
  try {
    const response = await axiosInstance.get(`${BINANCE_API}/api/v3/klines`, {
      params: {
        symbol: SYMBOL,
        interval: INTERVAL,
        limit: LIMIT,
        endTime: endTime
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      console.error('代理连接失败，请检查本地代理服务是否运行在127.0.0.1:4780');
    } else if (error.response) {
      console.log(`API响应状态: ${error.response.status}`);
      if (error.response.data) {
        console.log('API错误信息:', error.response.data);
      }
    }
    
    throw error;
  }
}

// 执行
fetchAllKlines();