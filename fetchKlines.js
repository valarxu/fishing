const axios = require('axios');
const fs = require('fs');
const path = require('path');
const HttpsProxyAgent = require('https-proxy-agent');

// Binance API配置
const BINANCE_API = 'https://api.binance.com';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '5m';
const LIMIT = 1000;
const PROXY = 'http://127.0.0.1:4780';

// 代理配置
const axiosInstance = axios.create({
  httpsAgent: new (require('https-proxy-agent').HttpsProxyAgent)(PROXY)
});

async function fetchKlines() {
  try {
    console.log('正在从Binance获取K线数据...');
    
    const response = await axiosInstance.get(`${BINANCE_API}/api/v3/klines`, {
      params: {
        symbol: SYMBOL,
        interval: INTERVAL,
        limit: LIMIT
      }
    });
    
    const klines = response.data;
    
    // 保存数据到当前目录
    const filePath = path.join(__dirname, 'klines.json');
    fs.writeFileSync(filePath, JSON.stringify(klines, null, 2));
    
    console.log(`成功获取${klines.length}条K线数据并保存到${filePath}`);
  } catch (error) {
    console.error('获取K线数据失败:', error.message);
    
    // 详细的错误诊断
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      console.error('代理连接失败，请检查本地代理服务是否运行在127.0.0.1:4780');
    } else if (error.response) {
      console.log(`API响应状态: ${error.response.status}`);
    }
    
    // 增强的重试机制
    console.log('5秒后重试...');
    setTimeout(fetchKlines, 5000);
  }
}

// 执行
fetchKlines();