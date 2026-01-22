
class GalaxyProTerminal {
    constructor() {
        this.ws = null;
        this.depthWs = null;
        this.marketData = new Map();
        this.currentPair = null;
        this.sortColumn = 'volume';
        this.sortDirection = 'desc';
        this.filter = 'all';
        this.searchQuery = '';
        this.chart = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadNews();
        this.loadSentiment();
        this.startGlobalStatsUpdate();
    }

    setupEventListeners() {
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                const column = e.currentTarget.dataset.sort;
                this.handleSort(column);
            });
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.filter = e.currentTarget.dataset.filter;
                this.renderMarketTable();
            });
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderMarketTable();
        });

        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        document.getElementById('closePanel').addEventListener('click', () => {
            document.getElementById('detailsPanel').classList.remove('active');
            if (this.depthWs) {
                this.depthWs.close();
                this.depthWs = null;
            }
        });

        document.getElementById('refreshNews').addEventListener('click', () => {
            this.loadNews();
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });
    }

    connectWebSocket() {
        const wsUrl = 'wss://stream.binance.com:9443/ws/!ticker@arr';
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.updateConnectionStatus(true);
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.processMarketData(data);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.updateConnectionStatus(false);
                this.attemptReconnect();
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.updateConnectionStatus(false);
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => {
                this.connectWebSocket();
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    processMarketData(data) {
        const usdtPairs = data.filter(ticker => 
            ticker.s.endsWith('USDT') && 
            !ticker.s.includes('UP') && 
            !ticker.s.includes('DOWN') &&
            parseFloat(ticker.q) > 1000000
        ).slice(0, 100);

        usdtPairs.forEach(ticker => {
            this.marketData.set(ticker.s, {
                symbol: ticker.s,
                price: parseFloat(ticker.c),
                change: parseFloat(ticker.P),
                volume: parseFloat(ticker.q),
                high: parseFloat(ticker.h),
                low: parseFloat(ticker.l),
                priceChangeAbs: parseFloat(ticker.p),
                lastUpdate: Date.now()
            });
        });

        this.renderMarketTable();
        this.updateQuickStats();
    }

    handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'desc';
        }

        document.querySelectorAll('.sortable i').forEach(icon => {
            icon.className = 'fas fa-sort';
        });

        const activeIcon = document.querySelector(`[data-sort="${column}"] i`);
        activeIcon.className = this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';

        this.renderMarketTable();
    }

    renderMarketTable() {
        const tbody = document.getElementById('marketTableBody');
        let markets = Array.from(this.marketData.values());

        if (this.searchQuery) {
            markets = markets.filter(m => 
                m.symbol.toLowerCase().includes(this.searchQuery)
            );
        }

        switch(this.filter) {
            case 'gainers':
                markets = markets.filter(m => m.change > 0);
                break;
            case 'losers':
                markets = markets.filter(m => m.change < 0);
                break;
            case 'volume':
                markets = markets.filter(m => m.volume > 50000000);
                break;
        }

        markets.sort((a, b) => {
            let aVal = a[this.sortColumn];
            let bVal = b[this.sortColumn];
            
            if (this.sortColumn === 'symbol') {
                return this.sortDirection === 'asc' 
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }
            
            return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        tbody.innerHTML = markets.slice(0, 100).map(market => `
            <tr class="market-row" data-symbol="${market.symbol}">
                <td class="symbol-cell">
                    <span class="symbol-name">${market.symbol.replace('USDT', '')}</span>
                    <span class="symbol-quote">/USDT</span>
                </td>
                <td class="price-cell">${this.formatPrice(market.price)}</td>
                <td class="change-cell ${market.change >= 0 ? 'positive' : 'negative'}">
                    <span class="change-badge">
                        ${market.change >= 0 ? '+' : ''}${market.change.toFixed(2)}%
                    </span>
                </td>
                <td class="volume-cell">${this.formatVolume(market.volume)}</td>
                <td class="chart-cell">
                    <div class="mini-chart ${market.change >= 0 ? 'positive' : 'negative'}">
                        ${this.generateMiniChart(market.change)}
                    </div>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.market-row').forEach(row => {
            row.addEventListener('click', () => {
                const symbol = row.dataset.symbol;
                this.selectPair(symbol);
            });
        });
    }

    generateMiniChart(change) {
        const isPositive = change >= 0;
        const bars = 7;
        let html = '';
        
        for (let i = 0; i < bars; i++) {
            const height = Math.random() * 100;
            html += `<div class="chart-bar" style="height: ${height}%"></div>`;
        }
        
        return html;
    }

    selectPair(symbol) {
        this.currentPair = symbol;
        const market = this.marketData.get(symbol);
        
        if (!market) return;

        document.getElementById('detailsPanel').classList.add('active');
        document.getElementById('selectedPair').textContent = symbol;
        document.getElementById('currentPrice').textContent = this.formatPrice(market.price);
        document.getElementById('priceChange').textContent = `${market.change >= 0 ? '+' : ''}${market.change.toFixed(2)}%`;
        document.getElementById('priceChange').className = `price-change ${market.change >= 0 ? 'positive' : 'negative'}`;
        document.getElementById('high24h').textContent = this.formatPrice(market.high);
        document.getElementById('low24h').textContent = this.formatPrice(market.low);
        document.getElementById('pairVolume').textContent = this.formatVolume(market.volume);

        this.loadChart(symbol);
        this.connectDepthWebSocket(symbol);
    }

    async loadChart(symbol) {
        try {
            const interval = '15m';
            const limit = 100;
            const response = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
            );
            const klines = await response.json();

            const chartData = {
                labels: klines.map(k => new Date(k[0]).toLocaleTimeString()),
                datasets: [{
                    label: 'Price',
                    data: klines.map(k => parseFloat(k[4])),
                    borderColor: '#00f3ff',
                    backgroundColor: 'rgba(0, 243, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            };

            const ctx = document.getElementById('priceChart');
            
            if (this.chart) {
                this.chart.destroy();
            }

            this.chart = new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#00f3ff',
                            bodyColor: '#ffffff',
                            borderColor: '#00f3ff',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)'
                            },
                            ticks: {
                                color: '#888',
                                maxTicksLimit: 8
                            }
                        },
                        y: {
                            display: true,
                            position: 'right',
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)'
                            },
                            ticks: {
                                color: '#888'
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } catch (error) {
            console.error('Failed to load chart:', error);
        }
    }

    connectDepthWebSocket(symbol) {
        if (this.depthWs) {
            this.depthWs.close();
        }

        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth10`;
        
        this.depthWs = new WebSocket(wsUrl);
        
        this.depthWs.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.renderOrderBook(data);
        };

        this.depthWs.onerror = (error) => {
            console.error('Depth WebSocket error:', error);
        };
    }

    renderOrderBook(data) {
        const asksContainer = document.getElementById('asksRows');
        const bidsContainer = document.getElementById('bidsRows');

        const asks = data.asks.slice(0, 10).reverse();
        const bids = data.bids.slice(0, 10);

        const maxAskVolume = Math.max(...asks.map(a => parseFloat(a[1])));
        const maxBidVolume = Math.max(...bids.map(b => parseFloat(b[1])));

        asksContainer.innerHTML = asks.map(ask => {
            const price = parseFloat(ask[0]);
            const amount = parseFloat(ask[1]);
            const total = price * amount;
            const percentage = (amount / maxAskVolume) * 100;

            return `
                <div class="orderbook-row">
                    <div class="depth-bar ask-bar" style="width: ${percentage}%"></div>
                    <span class="price ask-price">${this.formatPrice(price)}</span>
                    <span class="amount">${amount.toFixed(4)}</span>
                    <span class="total">${total.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        bidsContainer.innerHTML = bids.map(bid => {
            const price = parseFloat(bid[0]);
            const amount = parseFloat(bid[1]);
            const total = price * amount;
            const percentage = (amount / maxBidVolume) * 100;

            return `
                <div class="orderbook-row">
                    <div class="depth-bar bid-bar" style="width: ${percentage}%"></div>
                    <span class="price bid-price">${this.formatPrice(price)}</span>
                    <span class="amount">${amount.toFixed(4)}</span>
                    <span class="total">${total.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        if (asks.length > 0 && bids.length > 0) {
            const spread = parseFloat(asks[0][0]) - parseFloat(bids[0][0]);
            const spreadPercent = (spread / parseFloat(bids[0][0])) * 100;
            document.querySelector('.spread-value').textContent = `${spreadPercent.toFixed(4)}%`;
        }
    }

    async loadNews() {
        const newsContainer = document.getElementById('newsList');
        
        try {
            const response = await fetch('http://localhost:8000/api/news');
            const news = await response.json();

            newsContainer.innerHTML = news.map(item => `
                <div class="news-item">
                    <div class="news-time">${new Date(item.published).toLocaleString()}</div>
                    <div class="news-title">${item.title}</div>
                    <div class="news-description">${item.description}</div>
                    <a href="${item.link}" target="_blank" class="news-link">
                        Read more <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load news:', error);
            newsContainer.innerHTML = '<div class="error-message">Failed to load news. Please try again.</div>';
        }
    }

    async loadSentiment() {
        try {
            const response = await fetch('http://localhost:8000/api/sentiment');
            const data = await response.json();

            const gauge = document.getElementById('sentimentGauge');
            const value = document.getElementById('sentimentValue');
            const label = document.getElementById('sentimentLabel');

            value.textContent = data.value;
            label.textContent = data.classification;

            const rotation = (data.value / 100) * 180 - 90;
            gauge.style.setProperty('--rotation', `${rotation}deg`);

            gauge.className = 'gauge-circle';
            if (data.value < 25) gauge.classList.add('extreme-fear');
            else if (data.value < 45) gauge.classList.add('fear');
            else if (data.value < 55) gauge.classList.add('neutral');
            else if (data.value < 75) gauge.classList.add('greed');
            else gauge.classList.add('extreme-greed');

        } catch (error) {
            console.error('Failed to load sentiment:', error);
        }
    }

    updateQuickStats() {
        const markets = Array.from(this.marketData.values());
        const gainers = markets.filter(m => m.change > 0).length;
        const losers = markets.filter(m => m.change < 0).length;

        document.getElementById('activePairs').textContent = markets.length;
        document.getElementById('gainers').textContent = gainers;
        document.getElementById('losers').textContent = losers;
    }

    startGlobalStatsUpdate() {
        setInterval(async () => {
            try {
                const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                const tickers = await response.json();
                
                const totalVolume = tickers.reduce((sum, t) => sum + parseFloat(t.quoteVolume || 0), 0);
                
                document.getElementById('volume24h').textContent = `$${(totalVolume / 1e9).toFixed(2)}B`;
                document.getElementById('marketCap').textContent = '$2.45T';
                document.getElementById('btcDominance').textContent = '52.3%';
            } catch (error) {
                console.error('Failed to update global stats:', error);
            }
        }, 60000);
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');

        if (connected) {
            dot.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            dot.classList.remove('connected');
            text.textContent = 'Disconnected';
        }
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
        const icon = document.querySelector('#themeToggle i');
        icon.className = document.body.classList.contains('light-theme') 
            ? 'fas fa-sun' 
            : 'fas fa-moon';
    }

    switchView(view) {
        const newsPanel = document.getElementById('newsPanel');
        
        if (view === 'news') {
            newsPanel.classList.add('active');
        } else {
            newsPanel.classList.remove('active');
        }
    }

    formatPrice(price) {
        if (price >= 1) {
            return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (price >= 0.01) {
            return `$${price.toFixed(4)}`;
        } else {
            return `$${price.toFixed(8)}`;
        }
    }

    formatVolume(volume) {
        if (volume >= 1e9) {
            return `$${(volume / 1e9).toFixed(2)}B`;
        } else if (volume >= 1e6) {
            return `$${(volume / 1e6).toFixed(2)}M`;
        } else {
            return `$${(volume / 1e3).toFixed(2)}K`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GalaxyProTerminal();
});
```