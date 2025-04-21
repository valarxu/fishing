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
  let markPrice = 0; // 标记价格
  let expectedBuyPrice = 0; // 预期开仓价格
  
  // 记录每个仓位的信息：{buyPrice, expectedSellPrice}
  const positions = [];
  
  // 交易记录
  const trades = [];
  
  // 获取第一根K线的收盘价作为初始标记价格
  if (klines.length > 0) {
    markPrice = parseFloat(klines[0][4]); // 收盘价在第4个位置
    // 计算预期开仓价格
    expectedBuyPrice = markPrice * (1 - priceChangeThreshold);
    console.log(`初始标记价格: ${markPrice}, 预期开仓价格: ${expectedBuyPrice}`);
  } else {
    console.error('K线数据为空');
    return;
  }
  
  // 遍历每根K线
  for (let i = 1; i < klines.length; i++) {
    const currentKline = klines[i];
    const timestamp = currentKline[0];
    const closePrice = parseFloat(currentKline[4]);
    
    // 检查是否满足开仓条件：收盘价低于预期开仓价格且仓位未满
    if (closePrice <= expectedBuyPrice && currentPositions < maxPositions) {
      // 实际开仓
      const buyPrice = closePrice; // 使用收盘价作为实际买入价格
      const expectedSellPrice = buyPrice * (1 + priceChangeThreshold); // 计算预期平仓价格
      
      currentPositions++;
      totalInvested += positionSize;
      
      // 记录这个仓位的买入价格和预期平仓价格
      positions.push({
        buyPrice: buyPrice,
        expectedSellPrice: expectedSellPrice
      });
      
      // 记录交易
      trades.push({
        type: '买入',
        timestamp: new Date(timestamp).toISOString(),
        price: buyPrice.toFixed(2),
        amount: positionSize,
        positions: currentPositions,
        expectedSellPrice: expectedSellPrice.toFixed(2)
      });
      
      console.log(`买入: 价格=${buyPrice.toFixed(2)}, 预期平仓价=${expectedSellPrice.toFixed(2)}, 金额=${positionSize}, 当前持仓=${currentPositions}`);
      
      // 开仓后更新标记价格为当前收盘价，并重新计算预期开仓价格
      markPrice = closePrice;
      expectedBuyPrice = markPrice * (1 - priceChangeThreshold);
    }
    
    // 检查是否满足平仓条件：从数组末尾开始检查
    if (currentPositions > 0) {
      // 从后往前检查每个仓位是否满足平仓条件（后进先出）
      for (let j = positions.length - 1; j >= 0; j--) {
        const position = positions[j];
        
        // 如果当前收盘价高于该仓位的预期平仓价格，则平仓
        if (closePrice >= position.expectedSellPrice) {
          // 使用收盘价作为卖出价格
          const sellPrice = closePrice;
          
          // 实际平仓
          currentPositions--;
          totalInvested -= positionSize;
          
          // 计算收益
          const profit = positionSize * (sellPrice / position.buyPrice - 1);
          totalValue += profit;
          
          // 记录交易
          trades.push({
            type: '卖出',
            timestamp: new Date(timestamp).toISOString(),
            price: sellPrice.toFixed(2),
            amount: positionSize,
            positions: currentPositions,
            profit: profit.toFixed(2),
            buyPrice: position.buyPrice.toFixed(2)
          });
          
          console.log(`卖出: 价格=${sellPrice.toFixed(2)}, 买入价=${position.buyPrice.toFixed(2)}, 金额=${positionSize}, 收益=${profit.toFixed(2)}, 当前持仓=${currentPositions}`);
          
          // 从仓位数组中移除这个仓位
          positions.splice(j, 1);
          
          // 一次只平一个仓位，找到满足条件的第一个仓位后就退出循环
          break;
        }
      }
    }
    
    // 如果没有仓位，每次收盘后更新标记价格和预期开仓价格
    if (currentPositions === 0) {
      markPrice = closePrice;
      expectedBuyPrice = markPrice * (1 - priceChangeThreshold);
    }
  }
  
  // 计算最终资产（未平仓的按最后一根K线的收盘价计算）
  if (currentPositions > 0) {
    const lastClosePrice = parseFloat(klines[klines.length - 1][4]);
    let unrealizedProfit = 0;
    
    // 计算每个未平仓仓位的未实现收益
    for (const position of positions) {
      unrealizedProfit += positionSize * (lastClosePrice / position.buyPrice - 1);
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