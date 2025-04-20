// 全局变量
let allKlines = []; // 所有K线数据
let backtestResult = {}; // 回测结果数据
let trades = []; // 交易数据
let currentPage = 1; // 当前页码
const klinesPerPage = 300; // 每页显示的K线数量
let chart; // 图表实例
let candleSeries; // K线系列

// 初始化函数
async function init() {
    try {
        // 加载K线数据
        const klinesResponse = await fetch('klines_historical.json');
        allKlines = await klinesResponse.json();
        
        // 加载回测结果数据
        const backtestResponse = await fetch('backtest_result.json');
        backtestResult = await backtestResponse.json();
        trades = backtestResult.trades || [];
        
        // 显示回测统计信息
        displayBacktestStats();
        
        // 初始化图表
        initChart();
        
        // 显示第一页数据
        updatePage();
        
        // 绑定分页按钮事件
        document.getElementById('prev-page').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                updatePage();
            }
        });
        
        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(allKlines.length / klinesPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                updatePage();
            }
        });
    } catch (error) {
        console.error('初始化错误：', error);
        alert('加载数据失败，请查看控制台了解详情。');
    }
}

// 初始化图表
function initChart() {
    const chartContainer = document.getElementById('chart');
    
    // 创建图表实例 - 使用版本3.8.0的API
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        layout: {
            backgroundColor: '#ffffff',
            textColor: '#333333',
        },
        grid: {
            vertLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
            horzLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 1)',
        },
        timeScale: {
            borderColor: 'rgba(197, 203, 206, 1)',
            timeVisible: true,
        },
    });

    // 添加K线系列
    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    });
    
    // 让图表自适应窗口大小
    window.addEventListener('resize', () => {
        chart.applyOptions({
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
        });
    });
}

// 更新页面
function updatePage() {
    // 计算总页数
    const totalPages = Math.ceil(allKlines.length / klinesPerPage);
    
    // 更新页码信息
    document.getElementById('page-info').textContent = `第${currentPage}页 / 共${totalPages}页`;
    
    // 更新分页按钮状态
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;
    
    // 计算当前页的K线数据范围
    const startIndex = (currentPage - 1) * klinesPerPage;
    const endIndex = Math.min(startIndex + klinesPerPage, allKlines.length);
    
    // 获取当前页的K线数据
    const pageKlines = allKlines.slice(startIndex, endIndex);
    
    // 转换K线数据格式
    const formattedKlines = pageKlines.map(kline => {
        // 将毫秒时间戳转换为适合图表库的格式
        const timestamp = Math.floor(kline[0] / 1000); // 转换为秒
        return {
            time: timestamp,
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4])
        };
    });
    
    // 更新图表
    candleSeries.setData(formattedKlines);
    
    // 添加交易标记
    addTradeMarkers(startIndex, endIndex);
    
    // 自动调整可见范围
    chart.timeScale().fitContent();
}

// 添加交易标记
function addTradeMarkers(startIndex, endIndex) {
    // 清除之前的标记
    candleSeries.setMarkers([]);
    
    // 获取当前页显示的K线时间范围
    const startTime = allKlines[startIndex][0];
    const endTime = allKlines[endIndex - 1][0];
    
    // 筛选当前页的交易
    const pageTradeMarkers = trades
        .filter(trade => {
            const tradeTime = new Date(trade.timestamp).getTime();
            return tradeTime >= startTime && tradeTime <= endTime;
        })
        .map(trade => {
            // 转换为秒级时间戳并确保是整数
            const tradeTime = Math.floor(new Date(trade.timestamp).getTime() / 1000);
            return {
                time: tradeTime,
                position: trade.type === '买入' ? 'belowBar' : 'aboveBar',
                color: trade.type === '买入' ? '#2196F3' : '#FF5252',
                shape: 'circle',
                text: trade.type === '买入' ? 'B' : 'S',
                size: 1
            };
        });
    
    // 添加标记
    candleSeries.setMarkers(pageTradeMarkers);
}

// 显示回测统计信息
function displayBacktestStats() {
    const statsContainer = document.getElementById('backtest-stats');
    const stats = `
        <table>
            <tr>
                <td>初始资金:</td>
                <td>${backtestResult.initialCapital} USDT</td>
            </tr>
            <tr>
                <td>最终价值:</td>
                <td>${backtestResult.finalValue.toFixed(2)} USDT</td>
            </tr>
            <tr>
                <td>收益:</td>
                <td>${backtestResult.profit.toFixed(2)} USDT (${backtestResult.profitPercent})</td>
            </tr>
            <tr>
                <td>交易次数:</td>
                <td>${trades.length} 次</td>
            </tr>
        </table>
    `;
    
    statsContainer.innerHTML = stats;
}

// 当页面加载完成时，初始化应用
document.addEventListener('DOMContentLoaded', init); 