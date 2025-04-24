const fs = require('fs');
const path = require('path');

// 保存未平仓仓位信息的函数
function saveOpenPositions(openPositions, lastPrice) {
  if (!openPositions || openPositions.length === 0) {
    console.log('没有未平仓的仓位');
    return;
  }
  
  // 计算每个未平仓位的当前状态
  const positionSize = 400; // 和回测中的参数保持一致
  const positionsWithDetails = openPositions.map((position, index) => {
    const unrealizedProfit = positionSize * (lastPrice / position.buyPrice - 1);
    const profitPercent = (lastPrice / position.buyPrice - 1) * 100;
    
    return {
      positionId: index + 1,
      buyPrice: position.buyPrice,
      expectedSellPrice: position.expectedSellPrice,
      currentPrice: lastPrice,
      unrealizedProfit: unrealizedProfit,
      profitPercent: profitPercent.toFixed(2) + '%',
      positionSize: positionSize
    };
  });
  
  // 计算汇总信息
  const totalPositionValue = positionSize * openPositions.length;
  const totalUnrealizedProfit = positionsWithDetails.reduce((sum, pos) => sum + pos.unrealizedProfit, 0);
  const averageBuyPrice = openPositions.reduce((sum, pos) => sum + pos.buyPrice, 0) / openPositions.length;
  
  // 创建完整的未平仓信息对象
  const openPositionsInfo = {
    timestamp: new Date().toISOString(),
    lastPrice: lastPrice,
    totalPositions: openPositions.length,
    totalPositionValue: totalPositionValue,
    totalUnrealizedProfit: totalUnrealizedProfit,
    averageBuyPrice: averageBuyPrice,
    positions: positionsWithDetails
  };
  
  // 保存到文件
  const openPositionsPath = path.join(__dirname, 'open_positions_detailed.json');
  fs.writeFileSync(openPositionsPath, JSON.stringify(openPositionsInfo, null, 2));
  console.log(`详细的未平仓仓位信息已保存到 ${openPositionsPath}`);
  
  return openPositionsInfo;
}

// 如果直接运行此文件，则尝试从回测结果中读取未平仓位信息
if (require.main === module) {
  try {
    // 读取回测结果
    const resultPath = path.join(__dirname, 'backtest_result.json');
    const openPositionsPath = path.join(__dirname, 'open_positions.json');
    
    let openPositions;
    let lastPrice;
    
    // 尝试从open_positions.json读取
    if (fs.existsSync(openPositionsPath)) {
      openPositions = JSON.parse(fs.readFileSync(openPositionsPath, 'utf8'));
      console.log(`从文件读取到 ${openPositions.length} 个未平仓仓位`);
    } 
    // 如果没有，则从回测结果中读取
    else if (fs.existsSync(resultPath)) {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      openPositions = result.openPositions;
      console.log(`从回测结果中读取到 ${openPositions ? openPositions.length : 0} 个未平仓仓位`);
    }
    
    // 读取最后的价格（从K线数据中获取最后一根K线的收盘价）
    const klinesPath = path.join(__dirname, 'klines_historical.json');
    if (fs.existsSync(klinesPath)) {
      const klines = JSON.parse(fs.readFileSync(klinesPath, 'utf8'));
      lastPrice = parseFloat(klines[klines.length - 1][4]); // 最后一根K线的收盘价
      console.log(`最后价格: ${lastPrice}`);
    } else {
      // 如果没有K线数据，使用默认值或从其他来源获取
      console.log('未找到K线数据，使用默认最后价格');
      lastPrice = openPositions && openPositions.length > 0 ? openPositions[0].buyPrice : 0;
    }
    
    if (openPositions && openPositions.length > 0 && lastPrice) {
      saveOpenPositions(openPositions, lastPrice);
    } else {
      console.log('没有足够的数据来保存未平仓仓位信息');
    }
    
  } catch (error) {
    console.error('处理未平仓仓位时出错:', error.message);
  }
}

module.exports = { saveOpenPositions }; 