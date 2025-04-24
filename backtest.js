const fs = require('fs');
const path = require('path');
const { saveOpenPositions } = require('./save_open_positions');

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
function runBacktest(klines, startIndex = 0, initialCapital = 2000, previousTrades = [], previousStats = null) {
  // 初始化参数
  const positionSize = 400; // 每次开仓金额
  const maxPositions = 50; // 最大持仓数量
  const priceChangeThreshold = 0.01; // 1%的价格变动阈值
  const stopLossThreshold = 0.9; // 止损阈值，价格低于均价的90%时止损
  const tradeFeeRate = 0.0005; // 交易手续费率，0.05%

  // 交易状态
  let currentPositions = 0; // 当前持仓数量
  let totalInvested = 0; // 总投入资金
  let totalValue = initialCapital; // 总资产价值
  let markPrice = 0; // 标记价格
  let expectedBuyPrice = 0; // 预期开仓价格

  // 收益统计
  let totalProfitFromSell = previousStats ? previousStats.totalProfitFromSell : 0; // 平仓总收益
  let totalLossFromStopLoss = previousStats ? previousStats.totalLossFromStopLoss : 0; // 止损总亏损
  let totalFeesPaid = previousStats ? previousStats.totalFeesPaid : 0; // 已支付的总手续费

  // 记录每个仓位的信息：{buyPrice, expectedSellPrice}
  const positions = [];

  // 交易记录
  const trades = [...previousTrades];

  // 止损信息
  let stopLossTrigger = false;
  let stopLossIndex = 0;
  let stopLossAmount = 0;

  // 获取起始K线的收盘价作为初始标记价格
  if (klines.length > startIndex) {
    markPrice = parseFloat(klines[startIndex][4]); // 收盘价在第4个位置
    // 计算预期开仓价格
    expectedBuyPrice = markPrice * (1 - priceChangeThreshold);
    console.log(`初始标记价格: ${markPrice}, 预期开仓价格: ${expectedBuyPrice}`);
  } else {
    console.error('K线数据为空或起始索引超出范围');
    return;
  }

  // 遍历每根K线
  for (let i = startIndex + 1; i < klines.length; i++) {
    const currentKline = klines[i];
    const timestamp = currentKline[0];
    const closePrice = parseFloat(currentKline[4]);

    // 检查是否满足开仓条件：收盘价低于预期开仓价格且仓位未满
    if (closePrice <= expectedBuyPrice && currentPositions < maxPositions) {
      // 实际开仓
      const buyPrice = closePrice; // 使用收盘价作为实际买入价格
      const expectedSellPrice = buyPrice * (1 + priceChangeThreshold); // 计算预期平仓价格

      // 计算买入手续费
      const buyFee = positionSize * tradeFeeRate;
      totalFeesPaid += buyFee;
      totalValue -= buyFee; // 从总资产中扣除手续费

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
        fee: buyFee.toFixed(2),
        positions: currentPositions,
        expectedSellPrice: expectedSellPrice.toFixed(2)
      });

      console.log(`买入: 价格=${buyPrice.toFixed(2)}, 预期平仓价=${expectedSellPrice.toFixed(2)}, 金额=${positionSize}, 手续费=${buyFee.toFixed(2)}, 当前持仓=${currentPositions}`);

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

          // 计算卖出手续费
          const sellFee = positionSize * tradeFeeRate;
          totalFeesPaid += sellFee;

          // 实际平仓
          currentPositions--;
          totalInvested -= positionSize;

          // 计算收益（扣除手续费）
          const profit = positionSize * (sellPrice / position.buyPrice - 1) - sellFee;
          totalValue += profit;

          // 累计平仓收益
          totalProfitFromSell += profit;

          // 记录交易
          trades.push({
            type: '卖出',
            timestamp: new Date(timestamp).toISOString(),
            price: sellPrice.toFixed(2),
            amount: positionSize,
            fee: sellFee.toFixed(2),
            positions: currentPositions,
            profit: profit.toFixed(2),
            buyPrice: position.buyPrice.toFixed(2)
          });

          console.log(`卖出: 价格=${sellPrice.toFixed(2)}, 买入价=${position.buyPrice.toFixed(2)}, 金额=${positionSize}, 手续费=${sellFee.toFixed(2)}, 收益=${profit.toFixed(2)}, 当前持仓=${currentPositions}`);

          // 从仓位数组中移除这个仓位
          positions.splice(j, 1);

          // 更新标记价格和预期开仓价格
          markPrice = closePrice;
          expectedBuyPrice = markPrice * (1 - priceChangeThreshold);

          // 一次只平一个仓位，找到满足条件的第一个仓位后就退出循环
          break;
        }
      }

      // 检查止损条件：当持仓达到最大持仓时
      if (currentPositions === maxPositions) {
        // 计算均价
        let totalBuyPrice = 0;
        positions.forEach(position => {
          totalBuyPrice += position.buyPrice;
        });
        const averagePrice = totalBuyPrice / positions.length;

        // 检查收盘价是否低于均价的止损阈值
        if (closePrice < averagePrice * stopLossThreshold) {
          console.log(`触发止损: 均价=${averagePrice.toFixed(2)}, 当前价格=${closePrice.toFixed(2)}, 低于均价的${(stopLossThreshold * 100).toFixed(0)}%`);

          // 计算止损金额和手续费
          let totalLoss = 0;
          let stopLossFees = 0;

          positions.forEach(position => {
            // 每个仓位的卖出手续费
            const positionSellFee = positionSize * tradeFeeRate;
            stopLossFees += positionSellFee;

            // 计算每个仓位的亏损（包括手续费）
            const loss = positionSize * (closePrice / position.buyPrice - 1) - positionSellFee;
            totalLoss += loss;
          });

          // 更新总资产价值和总手续费
          totalValue += totalLoss;
          totalFeesPaid += stopLossFees;
          stopLossAmount = totalLoss;

          // 累计止损亏损（负值）
          totalLossFromStopLoss += totalLoss;

          // 记录止损交易
          trades.push({
            type: '止损',
            timestamp: new Date(timestamp).toISOString(),
            price: closePrice.toFixed(2),
            positions: currentPositions,
            fee: stopLossFees.toFixed(2),
            averagePrice: averagePrice.toFixed(2),
            loss: totalLoss.toFixed(2)
          });

          console.log(`止损完成: 持仓数量=${currentPositions}, 止损金额=${totalLoss.toFixed(2)}, 手续费=${stopLossFees.toFixed(2)}, 当前总资产=${totalValue.toFixed(2)}`);

          // 标记止损触发
          stopLossTrigger = true;
          stopLossIndex = i + 1; // 从下一根K线开始重新回测

          break; // 退出K线循环
        }
      }
    }

    // 只有当仓位是0，且收盘价大于标记价格时，才更新标记价格和预期开仓价格
    if (currentPositions === 0 && closePrice > markPrice) {
      markPrice = closePrice;
      expectedBuyPrice = markPrice * (1 - priceChangeThreshold);
    }
  }

  // 如果触发了止损，从止损点继续回测
  if (stopLossTrigger && stopLossIndex < klines.length) {
    console.log(`从K线索引 ${stopLossIndex} 重新开始回测`);

    // 传递收益统计数据
    const stats = {
      totalProfitFromSell,
      totalLossFromStopLoss,
      totalFeesPaid
    };

    return runBacktest(klines, stopLossIndex, totalValue, trades, stats);
  }

  // 计算最终资产（未平仓的按最后一根K线的收盘价计算）
  if (currentPositions > 0) {
    const lastClosePrice = parseFloat(klines[klines.length - 1][4]);
    let unrealizedProfit = 0;

    // 计算每个未平仓仓位的未实现收益（不计算手续费，因为尚未卖出）
    for (const position of positions) {
      unrealizedProfit += positionSize * (lastClosePrice / position.buyPrice - 1);
    }

    totalValue += unrealizedProfit;

    console.log(`未平仓持仓: ${currentPositions}, 按最新价格计算的未实现收益: ${unrealizedProfit.toFixed(2)}`);
  }

  // 返回回测结果
  return {
    initialCapital: initialCapital, // 始终显示最初的初始资金
    finalValue: totalValue,
    profit: totalValue - initialCapital, // 与最初的初始资金比较
    profitPercent: ((totalValue / initialCapital - 1) * 100).toFixed(2) + '%',
    trades,
    remainingPositions: currentPositions,
    openPositions: positions, // 添加未平仓的仓位数组
    stopLossTimes: trades.filter(t => t.type === '止损').length,
    totalProfitFromSell,
    totalLossFromStopLoss,
    totalFeesPaid
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
  console.log(`平仓总收益: ${result.totalProfitFromSell.toFixed(2)} USDT`);
  console.log(`止损总亏损: ${result.totalLossFromStopLoss.toFixed(2)} USDT`);
  console.log(`总手续费支出: ${result.totalFeesPaid.toFixed(2)} USDT`);
  console.log(`总交易次数: ${result.trades.length}`);
  console.log(`止损次数: ${result.stopLossTimes}`);
  console.log(`剩余持仓: ${result.remainingPositions}`);

  // 保存回测结果到文件
  const resultPath = path.join(__dirname, 'backtest_result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`回测结果已保存到 ${resultPath}`);
  
  // 如果有未平仓仓位，保存到单独的文件
  if (result.openPositions && result.openPositions.length > 0) {
    const openPositionsPath = path.join(__dirname, 'open_positions.json');
    fs.writeFileSync(openPositionsPath, JSON.stringify(result.openPositions, null, 2));
    console.log(`未平仓仓位已保存到 ${openPositionsPath}`);
    
    // 获取最后一根K线的收盘价
    const lastPrice = parseFloat(klines[klines.length - 1][4]);
    
    // 调用saveOpenPositions保存详细的未平仓信息
    saveOpenPositions(result.openPositions, lastPrice);
  }
}

// 执行主函数
main();