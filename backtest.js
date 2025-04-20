const fs = require('fs');
const path = require('path');

// 读取K线数据
function loadKlinesData() {
  try {
    const filePath = path.join(__dirname, 'klines_historical.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取K线数据失败:', error.message);
    process.exit(1);
  }
}

// 回测函数
function runBacktest(klines) {
  // 初始化参数
  const initialCapital = 10000; // 初始资金
  const positionSize = 1000; // 每次开仓金额
  const maxPositions = 10; // 最大持仓数量
  const priceChangeThreshold = 0.005; // 0.5%的价格变动阈值
  
  // 交易状态
  let currentPositions = 0; // 当前持仓数量
  let totalInvested = 0; // 总投入资金
  let totalValue = initialCapital; // 总资产价值
  let lastBuyPrice = 0; // 最后一次买入价格
  let referencePrice = 0; // 参考价格，用于计算涨跌幅
  
  // 记录每个仓位的买入价格
  const positionPrices = [];
  
  // 交易记录
  const trades = [];
  
  // 获取第一根K线的收盘价作为初始参考价格
  if (klines.length > 0) {
    referencePrice = parseFloat(klines[0][4]); // 收盘价在第4个位置
    console.log(`初始参考价格: ${referencePrice}`);
  } else {
    console.error('K线数据为空');
    return;
  }
  
  // 遍历每根K线
  for (let i = 1; i < klines.length; i++) {
    const currentKline = klines[i];
    const timestamp = currentKline[0];
    const closePrice = parseFloat(currentKline[4]);
    
    // 检查是否满足开仓条件：收盘价低于标记价格的0.5%且仓位未满
    if (closePrice <= referencePrice * (1 - priceChangeThreshold) && currentPositions < maxPositions) {
      // 直接开仓一次
      const buyPrice = closePrice; // 使用收盘价作为买入价格
      
      // 实际开仓
      currentPositions++;
      totalInvested += positionSize;
      lastBuyPrice = buyPrice;
      
      // 记录这个仓位的买入价格
      positionPrices.push(buyPrice);
      
      // 记录交易
      trades.push({
        type: '买入',
        timestamp: new Date(timestamp).toISOString(),
        price: buyPrice.toFixed(2),
        amount: positionSize,
        positions: currentPositions
      });
      
      console.log(`买入: 价格=${buyPrice.toFixed(2)}, 金额=${positionSize}, 当前持仓=${currentPositions}`);
      
      // 开仓后立即更新参考价格为最后买入价格
      referencePrice = buyPrice;
    }
    
    // 检查是否满足平仓条件：收盘价高于任一仓位买入价格的0.5%且有仓位
    if (currentPositions > 0) {
      // 检查每个仓位是否满足平仓条件
      for (let j = 0; j < positionPrices.length; j++) {
        const positionPrice = positionPrices[j];
        
        // 如果当前收盘价高于该仓位买入价格的0.5%，则平仓
        if (closePrice >= positionPrice * (1 + priceChangeThreshold)) {
          // 使用收盘价作为卖出价格
          const sellPrice = closePrice;
          
          // 实际平仓（平掉这个仓位）
          currentPositions--;
          totalInvested -= positionSize;
          
          // 计算收益
          const profit = positionSize * (sellPrice / positionPrice - 1);
          totalValue += profit;
          
          // 记录交易
          trades.push({
            type: '卖出',
            timestamp: new Date(timestamp).toISOString(),
            price: sellPrice.toFixed(2),
            amount: positionSize,
            positions: currentPositions,
            profit: profit.toFixed(2),
            buyPrice: positionPrice.toFixed(2) // 记录对应的买入价格
          });
          
          console.log(`卖出: 价格=${sellPrice.toFixed(2)}, 买入价=${positionPrice.toFixed(2)}, 金额=${positionSize}, 收益=${profit.toFixed(2)}, 当前持仓=${currentPositions}`);
          
          // 从仓位价格数组中移除这个仓位
          positionPrices.splice(j, 1);
          
          // 由于我们已经移除了一个元素，需要调整索引
          j--;
          
          // 一次只平一个仓位，找到满足条件的第一个仓位后就退出循环
          break;
        }
      }
    }
    
    // 如果没有仓位，更新参考价格为当前收盘价
    if (currentPositions === 0) {
      referencePrice = closePrice;
    }
    // 如果仓位已满，更新参考价格为最后买入价格
    else if (currentPositions === maxPositions) {
      referencePrice = lastBuyPrice;
    }
  }
  
  // 计算最终资产（未平仓的按最后一根K线的收盘价计算）
  if (currentPositions > 0) {
    const lastClosePrice = parseFloat(klines[klines.length - 1][4]);
    let unrealizedProfit = 0;
    
    // 计算每个未平仓仓位的未实现收益
    for (const positionPrice of positionPrices) {
      unrealizedProfit += positionSize * (lastClosePrice / positionPrice - 1);
    }
    
    totalValue += unrealizedProfit;
    
    console.log(`未平仓持仓: ${currentPositions}, 按最新价格计算的未实现收益: ${unrealizedProfit.toFixed(2)}`);
  }
  
  // 返回回测结果
  return {
    initialCapital,
    finalValue: totalValue,
    profit: totalValue - initialCapital,
    profitPercent: ((totalValue / initialCapital - 1) * 100).toFixed(2) + '%',
    trades,
    remainingPositions: currentPositions
  };
}

// 主函数
function main() {
  console.log('开始回测...');
  const klines = loadKlinesData();
  console.log(`加载了 ${klines.length} 条K线数据`);
  
  const result = runBacktest(klines);
  
  console.log('\n回测结果:');
  console.log(`初始资金: ${result.initialCapital} USDT`);
  console.log(`最终资产: ${result.finalValue.toFixed(2)} USDT`);
  console.log(`总收益: ${result.profit.toFixed(2)} USDT (${result.profitPercent})`);
  console.log(`总交易次数: ${result.trades.length}`);
  console.log(`剩余持仓: ${result.remainingPositions}`);
  
  // 保存回测结果到文件
  const resultPath = path.join(__dirname, 'backtest_result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`回测结果已保存到 ${resultPath}`);
}

// 执行主函数
main();