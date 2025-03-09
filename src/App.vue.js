/// <reference types="../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, onUnmounted } from 'vue';
import { showDialog } from 'vant';
// 支持的币种列表
const supportedCoins = [
    { symbol: 'BTCUSDT', name: 'BTC', icon: '₿' },
    { symbol: 'ETHUSDT', name: 'ETH', icon: 'Ξ' },
    { symbol: 'BNBUSDT', name: 'BNB', icon: 'BNB' },
    { symbol: 'DOGEUSDT', name: 'DOGE', icon: 'Ð' },
    { symbol: 'XRPUSDT', name: 'XRP', icon: 'XRP' }
];
// 当前选择的币种
const currentCoin = ref(supportedCoins[0]);
const showCoinPicker = ref(false);
// WebSocket连接状态和实例
const wsConnected = ref(false);
let ws = null;
const priceDataMap = ref({});
// 通知设置
const showNotificationSettings = ref(false);
const notificationSettings = ref({
    enabled: false,
    threshold: '1',
    thresholdEnabled: false, // 添加价格变化阈值开关
    flashEnabled: false, // 闪烁通知
    soundEnabled: false, // 声音通知
    webhookEnabled: false, // Webhook通知
    webhookUrl: '' // Webhook URL
});
let lastNotificationPrice = {};
let flashInterval = null;
let audioInstance = null;
const alertAudioUrl = '/alert.mp3';
// 预警设置
const showAlertSettings = ref(false);
const alertPrices = ref({
    price1: '',
    price2: '',
    price3: ''
});
const alertType = ref('cross');
const isAlertSettingsUnlocked = ref(false);
const savedThresholds = ref({});
// 触发闪烁效果
const startFlashing = () => {
    if (flashInterval) {
        clearInterval(flashInterval);
        flashInterval = null;
    }
    const priceGroup = document.querySelector('.price-group');
    if (priceGroup) {
        priceGroup.classList.add('flashing');
    }
};
// 停止闪烁
const stopFlashing = () => {
    if (flashInterval) {
        clearInterval(flashInterval);
        flashInterval = null;
    }
    const priceGroup = document.querySelector('.price-group');
    if (priceGroup) {
        priceGroup.classList.remove('flashing');
        priceGroup.style.backgroundColor = '';
    }
};
// 播放声音
const playAlertSound = () => {
    if (notificationSettings.value.soundEnabled) {
        if (!audioInstance) {
            audioInstance = new Audio(alertAudioUrl);
            audioInstance.loop = true;
        }
        audioInstance.play().catch(() => {
            console.error('音频播放失败');
        });
    }
};
// 停止声音
const stopAlertSound = () => {
    if (audioInstance) {
        audioInstance.pause();
        audioInstance.currentTime = 0;
    }
};
// 显示警报对话框
const showAlertDialog = (message) => {
    showDialog({
        title: '价格预警',
        message,
        confirmButtonText: '知道了',
        showCancelButton: false,
    }).then(() => {
        // 用户点击确认后停止警报
        stopFlashing();
        stopAlertSound();
    });
};
// 发送Webhook通知
const sendWebhookNotification = async (message) => {
    if (!notificationSettings.value.webhookEnabled || !notificationSettings.value.webhookUrl)
        return;
    try {
        await fetch(notificationSettings.value.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                timestamp: new Date().toISOString()
            })
        });
    }
    catch (error) {
        console.error('Webhook通知发送失败:', error);
    }
};
// 检查价格变化并发送通知
const checkPriceChangeAndNotify = (symbol) => {
    if (!notificationSettings.value.enabled || !notificationSettings.value.thresholdEnabled)
        return;
    const priceData = priceDataMap.value[symbol];
    if (!priceData)
        return;
    const currentPrice = parseFloat(priceData.currentPrice);
    const lastPrice = lastNotificationPrice[symbol];
    if (!lastPrice) {
        lastNotificationPrice[symbol] = currentPrice;
        return;
    }
    const changePercent = Math.abs((currentPrice - lastPrice) / lastPrice * 100);
    const threshold = parseFloat(notificationSettings.value.threshold) || 1;
    if (changePercent >= threshold) {
        const coin = supportedCoins.find(c => c.symbol === symbol);
        if (!coin)
            return;
        const direction = currentPrice > lastPrice ? '上涨' : '下跌';
        const message = `${coin.name}价格${direction}${changePercent.toFixed(2)}%\n当前价格: ${currentPrice.toFixed(2)} USDT`;
        // 触发各种通知
        if (notificationSettings.value.flashEnabled) {
            startFlashing();
        }
        if (notificationSettings.value.soundEnabled) {
            playAlertSound();
        }
        if (notificationSettings.value.webhookEnabled) {
            sendWebhookNotification(message);
        }
        // 显示需要手动关闭的警报对话框
        showDialog({
            title: '价格预警',
            message,
            confirmButtonText: '知道了',
            showCancelButton: false,
            beforeClose: (action) => {
                if (action === 'confirm') {
                    stopFlashing();
                    stopAlertSound();
                }
                return true;
            }
        });
        lastNotificationPrice[symbol] = currentPrice;
    }
};
// 保存设置到localStorage
const saveSettings = () => {
    try {
        localStorage.setItem('monitorSettings', JSON.stringify({
            notificationSettings: notificationSettings.value,
            savedThresholds: savedThresholds.value,
            currentCoin: currentCoin.value.symbol,
            lastNotificationPrice
        }));
    }
    catch (error) {
        console.error('保存设置失败:', error);
    }
};
// 更新通知设置
const updateNotificationSettings = () => {
    const threshold = parseFloat(notificationSettings.value.threshold) || 1;
    notificationSettings.value.threshold = threshold.toString();
    if (!notificationSettings.value.enabled) {
        lastNotificationPrice = {};
        stopFlashing();
        stopAlertSound();
    }
    else {
        // 重置所有币种的最后通知价格
        supportedCoins.forEach(coin => {
            const priceData = priceDataMap.value[coin.symbol];
            if (priceData) {
                lastNotificationPrice[coin.symbol] = parseFloat(priceData.currentPrice);
            }
        });
    }
    // 保存设置
    saveSettings();
};
// 连接WebSocket
const connectWebSocket = () => {
    if (ws) {
        ws.close();
    }
    const symbols = supportedCoins.map(coin => coin.symbol.toLowerCase());
    const streams = symbols.map(symbol => `${symbol}@ticker`).join('/');
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
    ws.onopen = () => {
        wsConnected.value = true;
    };
    ws.onclose = () => {
        wsConnected.value = false;
        // 尝试重连
        setTimeout(connectWebSocket, 3000);
    };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const symbol = data.s;
        priceDataMap.value[symbol] = {
            symbol,
            currentPrice: parseFloat(data.c).toFixed(2),
            priceChange: parseFloat(data.P),
            high24h: parseFloat(data.h).toFixed(2),
            low24h: parseFloat(data.l).toFixed(2),
            volume: parseFloat(data.v).toFixed(2),
            quoteVolume: parseFloat(data.q).toFixed(2),
            openPrice: parseFloat(data.o).toFixed(2),
            priceChangeAmount: parseFloat(data.p).toFixed(2)
        };
        checkAlert(symbol);
        checkPriceChangeAndNotify(symbol);
    };
};
// 检查预警条件
const checkAlert = (symbol) => {
    const threshold = savedThresholds.value[symbol];
    if (!threshold)
        return;
    const priceData = priceDataMap.value[symbol];
    if (!priceData)
        return;
    const currentPrice = Number(priceData.currentPrice);
    const lastPrice = Number(threshold.lastPrice);
    if (isNaN(lastPrice)) {
        threshold.lastPrice = priceData.currentPrice;
        return;
    }
    // 如果正在报警中，直接返回
    if (threshold.isAlerting)
        return;
    // 获取所有有效的预警价格
    const validPrices = threshold.prices.filter(p => p !== '0');
    if (validPrices.length === 0)
        return;
    // 检查价格点是否按顺序被触发
    validPrices.forEach(priceStr => {
        const price = Number(priceStr);
        if (isNaN(price))
            return;
        // 检查是否是下一个需要触发的价格点
        const isNextPrice = threshold.reachedPrices.length === validPrices.indexOf(priceStr);
        // 如果是下一个价格点，并且价格穿过了这个点，就记录下来
        if (isNextPrice && ((lastPrice < price && currentPrice >= price) ||
            (lastPrice > price && currentPrice <= price))) {
            threshold.reachedPrices.push(priceStr);
        }
    });
    // 检查是否所有价格点都已经按顺序触发
    if (threshold.reachedPrices.length === validPrices.length) {
        threshold.isAlerting = true;
        triggerAlert(symbol, currentPrice, 'all');
    }
    // 更新最后价格
    threshold.lastPrice = priceData.currentPrice;
};
// 触发预警
const triggerAlert = (symbol, currentPrice, type) => {
    const coin = supportedCoins.find(c => c.symbol === symbol);
    if (!coin)
        return;
    const threshold = savedThresholds.value[symbol];
    if (!threshold)
        return;
    const message = type === 'all'
        ? `${coin.name}已按顺序触发所有预警价格点：${threshold.reachedPrices.join(' -> ')}\n当前价格: ${currentPrice.toFixed(2)} USDT`
        : `${coin.name}价格${type === 'up' ? '上涨' : '下跌'}穿过预警点`;
    // 显示需要手动关闭的警报对话框
    showDialog({
        title: '价格预警',
        message,
        confirmButtonText: '知道了',
        showCancelButton: false,
        beforeClose: (action) => {
            if (action === 'confirm') {
                // 用户点击确认后，重置预警状态
                if (savedThresholds.value[symbol]) {
                    savedThresholds.value[symbol].isAlerting = false;
                    savedThresholds.value[symbol].reachedPrices = [];
                }
                // 停止声音提醒
                if (audioInstance) {
                    audioInstance.pause();
                    audioInstance.currentTime = 0;
                }
            }
            return true;
        }
    });
    // 播放提示音
    if (notificationSettings.value.soundEnabled) {
        playAlertSound();
    }
    // 开始闪烁
    if (notificationSettings.value.flashEnabled) {
        startFlashing();
    }
};
// 保存预警设置
const saveAlertSettings = () => {
    const prices = [
        alertPrices.value.price1,
        alertPrices.value.price2,
        alertPrices.value.price3
    ].map(p => p.trim())
        .map(p => p === '' ? '0' : p)
        .map(p => {
        const num = parseFloat(p);
        return isNaN(num) ? '0' : num.toFixed(2);
    });
    if (prices.every(p => p === '0')) {
        return;
    }
    const currentPrice = priceDataMap.value[currentCoin.value.symbol]?.currentPrice || '0';
    savedThresholds.value[currentCoin.value.symbol] = {
        prices,
        lastPrice: currentPrice,
        reachedPrices: [], // 初始化为空数组
        isAlerting: false
    };
    showAlertSettings.value = false;
    // 清空输入
    alertPrices.value = {
        price1: '',
        price2: '',
        price3: ''
    };
    // 保存设置
    saveSettings();
};
// 清除预警
const clearAlert = (symbol) => {
    delete savedThresholds.value[symbol];
    // 保存设置
    saveSettings();
};
// 切换币种
const switchCoin = (coin) => {
    currentCoin.value = coin;
    showCoinPicker.value = false;
    // 保存设置
    saveSettings();
};
// 打开预警设置
const openAlertSettings = () => {
    isAlertSettingsUnlocked.value = false; // 重置解锁状态
    // 恢复已保存的预警价格到输入框
    const savedAlert = savedThresholds.value[currentCoin.value.symbol];
    if (savedAlert) {
        alertPrices.value = {
            price1: savedAlert.prices[0] === '0' ? '' : savedAlert.prices[0],
            price2: savedAlert.prices[1] === '0' ? '' : savedAlert.prices[1],
            price3: savedAlert.prices[2] === '0' ? '' : savedAlert.prices[2]
        };
    }
    else {
        // 如果没有保存的预警，清空输入框
        alertPrices.value = {
            price1: '',
            price2: '',
            price3: ''
        };
    }
    showAlertSettings.value = true;
};
// 获取排序后的价格列表
const getSortedPrices = (prices) => {
    return [...prices]
        .filter(p => p !== '0')
        .sort((a, b) => parseFloat(a) - parseFloat(b));
};
// 判断是否为最高价格
const isHighPrice = (price, symbol) => {
    if (!price || !symbol)
        return false;
    const currentPrice = Number(priceDataMap.value[symbol]?.currentPrice || '0');
    const priceValue = Number(price);
    if (isNaN(currentPrice) || isNaN(priceValue))
        return false;
    return priceValue > currentPrice;
};
// 判断是否为最低价格
const isLowPrice = (price, symbol) => {
    if (!price || !symbol)
        return false;
    const currentPrice = Number(priceDataMap.value[symbol]?.currentPrice || '0');
    const priceValue = Number(price);
    if (isNaN(currentPrice) || isNaN(priceValue))
        return false;
    return priceValue < currentPrice;
};
// 判断是否达到预警条件
const isReached = (price, symbol) => {
    if (!price || !symbol)
        return false;
    const currentPrice = Number(priceDataMap.value[symbol]?.currentPrice || '0');
    const priceValue = Number(price);
    if (isNaN(currentPrice) || isNaN(priceValue))
        return false;
    return currentPrice >= priceValue;
};
// 生命周期钩子
onMounted(() => {
    // 从localStorage加载设置
    const savedSettings = localStorage.getItem('monitorSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            // 恢复通知设置
            if (settings.notificationSettings) {
                notificationSettings.value = {
                    ...notificationSettings.value,
                    ...settings.notificationSettings
                };
            }
            // 恢复预警设置
            if (settings.savedThresholds) {
                savedThresholds.value = settings.savedThresholds;
            }
            // 恢复当前选择的币种
            if (settings.currentCoin) {
                const savedCoin = supportedCoins.find(c => c.symbol === settings.currentCoin);
                if (savedCoin) {
                    currentCoin.value = savedCoin;
                }
            }
            // 恢复最后通知价格
            if (settings.lastNotificationPrice) {
                lastNotificationPrice = settings.lastNotificationPrice;
            }
        }
        catch (error) {
            console.error('恢复设置失败:', error);
            localStorage.removeItem('monitorSettings');
        }
    }
    // 连接WebSocket
    connectWebSocket();
});
onUnmounted(() => {
    if (ws) {
        ws.close();
    }
    stopFlashing();
    stopAlertSound();
});
// 测试通知效果
const testNotifications = () => {
    console.log('测试通知开始', {
        flash: notificationSettings.value.flashEnabled,
        sound: notificationSettings.value.soundEnabled
    });
    // 测试背景闪烁
    if (notificationSettings.value.flashEnabled) {
        startFlashing();
    }
    // 测试声音提醒
    if (notificationSettings.value.soundEnabled) {
        playAlertSound();
    }
    // 显示测试通知
    showDialog({
        title: '测试通知',
        message: '这是一条测试通知\n\n已触发的效果：\n' +
            (notificationSettings.value.flashEnabled ? '- 背景闪烁\n' : '') +
            (notificationSettings.value.soundEnabled ? '- 声音提醒\n' : '') +
            (notificationSettings.value.webhookEnabled ? '- Webhook通知\n' : ''),
        confirmButtonText: '知道了',
        showCancelButton: false
    }).then(() => {
        // 用户点击确认后停止效果
        stopFlashing();
        stopAlertSound();
    });
    // 测试Webhook
    if (notificationSettings.value.webhookEnabled) {
        sendWebhookNotification('这是一条测试通知');
    }
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.meta, __VLS_intrinsicElements.meta)({
    name: "viewport",
    content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app" },
});
const __VLS_0 = {}.VanNavBar;
/** @type {[typeof __VLS_components.VanNavBar, typeof __VLS_components.vanNavBar, typeof __VLS_components.VanNavBar, typeof __VLS_components.vanNavBar, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    title: (__VLS_ctx.currentCoin.name + '/USDT 监控'),
    rightText: (__VLS_ctx.wsConnected ? '已连接' : '未连接'),
    rightTextColor: (__VLS_ctx.wsConnected ? '#07c160' : '#ee0a24'),
    fixed: true,
    placeholder: true,
}));
const __VLS_2 = __VLS_1({
    title: (__VLS_ctx.currentCoin.name + '/USDT 监控'),
    rightText: (__VLS_ctx.wsConnected ? '已连接' : '未连接'),
    rightTextColor: (__VLS_ctx.wsConnected ? '#07c160' : '#ee0a24'),
    fixed: true,
    placeholder: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { left: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_4 = {}.VanButton;
    /** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
        plain: true,
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showCoinPicker = true;
        }
    };
    __VLS_7.slots.default;
    var __VLS_7;
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content" },
});
const __VLS_12 = {}.VanCellGroup;
/** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    inset: true,
    ...{ class: "price-group" },
}));
const __VLS_14 = __VLS_13({
    inset: true,
    ...{ class: "price-group" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_19.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "coin-icon" },
    });
    (__VLS_ctx.currentCoin.icon);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "current-price" },
        ...{ class: ({
                'price-up': (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange || 0) > 0,
                'price-down': (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange || 0) < 0
            }) },
    });
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.currentPrice || '--');
    const __VLS_20 = {}.VanTag;
    /** @type {[typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        type: ((__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange || 0) >= 0 ? 'success' : 'danger'),
        ...{ class: "price-change" },
    }));
    const __VLS_22 = __VLS_21({
        type: ((__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange || 0) >= 0 ? 'success' : 'danger'),
        ...{ class: "price-change" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    ((__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange || 0) >= 0 ? '+' : '');
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChange?.toFixed(2) || '0.00');
    var __VLS_23;
}
{
    const { label: __VLS_thisSlot } = __VLS_19.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-info" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "value price-up" },
    });
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.high24h || '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "value price-down" },
    });
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.low24h || '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "value" },
    });
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.openPrice || '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "value" },
        ...{ class: ({
                'price-up': Number(__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChangeAmount || 0) > 0,
                'price-down': Number(__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChangeAmount || 0) < 0
            }) },
    });
    (Number(__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChangeAmount || 0) >= 0 ? '+' : '');
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.priceChangeAmount || '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.volume || '--');
    (__VLS_ctx.currentCoin.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "price-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.priceDataMap[__VLS_ctx.currentCoin.symbol]?.quoteVolume || '--');
}
var __VLS_19;
var __VLS_15;
if (__VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol]) {
    const __VLS_24 = {}.VanCellGroup;
    /** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        inset: true,
        title: "预警条件",
        ...{ class: "alert-group" },
    }));
    const __VLS_26 = __VLS_25({
        inset: true,
        title: "预警条件",
        ...{ class: "alert-group" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    const __VLS_28 = {}.VanCell;
    /** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
    const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_31.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_32 = {}.VanTag;
        /** @type {[typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            type: (__VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol].isAlerting ? 'warning' : 'success'),
            round: true,
        }));
        const __VLS_34 = __VLS_33({
            type: (__VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol].isAlerting ? 'warning' : 'success'),
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        (__VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol].isAlerting ? '预警中' : '监控中');
        var __VLS_35;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "threshold-prices" },
        });
        for (const [price, index] of __VLS_getVForSourceType((__VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol].prices))) {
            (index);
            if (price !== '0') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "threshold-price" },
                    ...{ class: ({
                            'price-reached': __VLS_ctx.isReached(price, __VLS_ctx.currentCoin.symbol),
                            'price-pending': !__VLS_ctx.isReached(price, __VLS_ctx.currentCoin.symbol)
                        }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "price-index" },
                });
                (index + 1);
                (price);
            }
        }
    }
    var __VLS_31;
    var __VLS_27;
}
if (Object.keys(__VLS_ctx.savedThresholds).filter(s => s !== __VLS_ctx.currentCoin.symbol).length > 0) {
    const __VLS_36 = {}.VanCellGroup;
    /** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        inset: true,
        title: "其他币种预警",
        ...{ class: "alert-group" },
    }));
    const __VLS_38 = __VLS_37({
        inset: true,
        title: "其他币种预警",
        ...{ class: "alert-group" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    for (const [symbol] of __VLS_getVForSourceType((Object.keys(__VLS_ctx.savedThresholds).filter(s => s !== __VLS_ctx.currentCoin.symbol)))) {
        const __VLS_40 = {}.VanCell;
        /** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            key: (symbol),
        }));
        const __VLS_42 = __VLS_41({
            key: (symbol),
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_43.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "alert-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "alert-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "coin-name" },
            });
            (__VLS_ctx.supportedCoins.find(c => c.symbol === symbol)?.name || symbol);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_44 = {}.VanTag;
            /** @type {[typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, typeof __VLS_components.VanTag, typeof __VLS_components.vanTag, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                type: (__VLS_ctx.savedThresholds[symbol].isAlerting ? 'warning' : 'success'),
                round: true,
                ...{ style: {} },
            }));
            const __VLS_46 = __VLS_45({
                type: (__VLS_ctx.savedThresholds[symbol].isAlerting ? 'warning' : 'success'),
                round: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            __VLS_47.slots.default;
            (__VLS_ctx.savedThresholds[symbol].isAlerting ? '预警中' : '监控中');
            var __VLS_47;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "threshold-prices" },
            });
            for (const [price, index] of __VLS_getVForSourceType((__VLS_ctx.savedThresholds[symbol].prices))) {
                (index);
                if (price !== '0') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "threshold-price" },
                        ...{ class: ({
                                'price-reached': __VLS_ctx.isReached(price, symbol),
                                'price-pending': !__VLS_ctx.isReached(price, symbol)
                            }) },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "price-index" },
                    });
                    (index + 1);
                    (price);
                }
            }
        }
        var __VLS_43;
    }
    var __VLS_39;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bottom-buttons" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "button-row" },
});
const __VLS_48 = {}.VanButton;
/** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onClick': {} },
    type: "primary",
    block: true,
    size: "large",
}));
const __VLS_50 = __VLS_49({
    ...{ 'onClick': {} },
    type: "primary",
    block: true,
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onClick: (...[$event]) => {
        __VLS_ctx.showNotificationSettings = true;
    }
};
__VLS_51.slots.default;
var __VLS_51;
const __VLS_56 = {}.VanButton;
/** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onClick': {} },
    type: "warning",
    block: true,
    size: "large",
}));
const __VLS_58 = __VLS_57({
    ...{ 'onClick': {} },
    type: "warning",
    block: true,
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onClick: (__VLS_ctx.openAlertSettings)
};
__VLS_59.slots.default;
var __VLS_59;
const __VLS_64 = {}.VanPopup;
/** @type {[typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    show: (__VLS_ctx.showCoinPicker),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}));
const __VLS_66 = __VLS_65({
    show: (__VLS_ctx.showCoinPicker),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-header" },
});
const __VLS_68 = {}.VanCellGroup;
/** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
for (const [coin] of __VLS_getVForSourceType((__VLS_ctx.supportedCoins))) {
    const __VLS_72 = {}.VanCell;
    /** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onClick': {} },
        key: (coin.symbol),
        title: (coin.name + '/USDT'),
        clickable: true,
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onClick': {} },
        key: (coin.symbol),
        title: (coin.name + '/USDT'),
        clickable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onClick: (...[$event]) => {
            __VLS_ctx.switchCoin(coin);
        }
    };
    __VLS_75.slots.default;
    {
        const { 'right-icon': __VLS_thisSlot } = __VLS_75.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "coin-icon" },
        });
        (coin.icon);
    }
    var __VLS_75;
}
var __VLS_71;
var __VLS_67;
const __VLS_80 = {}.VanPopup;
/** @type {[typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    show: (__VLS_ctx.showNotificationSettings),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}));
const __VLS_82 = __VLS_81({
    show: (__VLS_ctx.showNotificationSettings),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-header" },
});
const __VLS_84 = {}.VanCellGroup;
/** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    title: "启用价格波动通知",
    label: "关闭后将停止所有通知",
}));
const __VLS_90 = __VLS_89({
    title: "启用价格波动通知",
    label: "关闭后将停止所有通知",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_91.slots;
    const __VLS_92 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onChange: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_95;
}
var __VLS_91;
const __VLS_100 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    title: "价格变化通知",
}));
const __VLS_102 = __VLS_101({
    title: "价格变化通知",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_103.slots;
    const __VLS_104 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.thresholdEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_106 = __VLS_105({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.thresholdEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    let __VLS_108;
    let __VLS_109;
    let __VLS_110;
    const __VLS_111 = {
        onChange: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_107;
}
var __VLS_103;
if (__VLS_ctx.notificationSettings.thresholdEnabled) {
    const __VLS_112 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        ...{ 'onBlur': {} },
        modelValue: (__VLS_ctx.notificationSettings.threshold),
        type: "digit",
        label: "价格变化阈值",
        placeholder: "请输入价格变化百分比",
        disabled: (!__VLS_ctx.notificationSettings.enabled),
        rightIcon: "after",
    }));
    const __VLS_114 = __VLS_113({
        ...{ 'onBlur': {} },
        modelValue: (__VLS_ctx.notificationSettings.threshold),
        type: "digit",
        label: "价格变化阈值",
        placeholder: "请输入价格变化百分比",
        disabled: (!__VLS_ctx.notificationSettings.enabled),
        rightIcon: "after",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    let __VLS_116;
    let __VLS_117;
    let __VLS_118;
    const __VLS_119 = {
        onBlur: (__VLS_ctx.updateNotificationSettings)
    };
    __VLS_115.slots.default;
    {
        const { 'right-icon': __VLS_thisSlot } = __VLS_115.slots;
    }
    var __VLS_115;
}
const __VLS_120 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    title: "背景闪烁提醒",
}));
const __VLS_122 = __VLS_121({
    title: "背景闪烁提醒",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_123.slots;
    const __VLS_124 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.flashEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.flashEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onChange: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_127;
}
var __VLS_123;
const __VLS_132 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    title: "声音提醒",
}));
const __VLS_134 = __VLS_133({
    title: "声音提醒",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_135.slots;
    const __VLS_136 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.soundEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_138 = __VLS_137({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.soundEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    let __VLS_140;
    let __VLS_141;
    let __VLS_142;
    const __VLS_143 = {
        onChange: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_139;
}
var __VLS_135;
const __VLS_144 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    title: "Webhook通知",
}));
const __VLS_146 = __VLS_145({
    title: "Webhook通知",
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_147.slots;
    const __VLS_148 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.webhookEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_150 = __VLS_149({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.notificationSettings.webhookEnabled),
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    let __VLS_152;
    let __VLS_153;
    let __VLS_154;
    const __VLS_155 = {
        onChange: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_151;
}
var __VLS_147;
if (__VLS_ctx.notificationSettings.webhookEnabled) {
    const __VLS_156 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        ...{ 'onBlur': {} },
        modelValue: (__VLS_ctx.notificationSettings.webhookUrl),
        label: "Webhook地址",
        placeholder: "请输入接收通知的URL",
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }));
    const __VLS_158 = __VLS_157({
        ...{ 'onBlur': {} },
        modelValue: (__VLS_ctx.notificationSettings.webhookUrl),
        label: "Webhook地址",
        placeholder: "请输入接收通知的URL",
        disabled: (!__VLS_ctx.notificationSettings.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    let __VLS_160;
    let __VLS_161;
    let __VLS_162;
    const __VLS_163 = {
        onBlur: (__VLS_ctx.updateNotificationSettings)
    };
    var __VLS_159;
}
var __VLS_87;
var __VLS_83;
const __VLS_164 = {}.VanPopup;
/** @type {[typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    show: (__VLS_ctx.showAlertSettings),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}));
const __VLS_166 = __VLS_165({
    show: (__VLS_ctx.showAlertSettings),
    position: "bottom",
    round: true,
    closeable: true,
    safeAreaInsetBottom: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-header" },
});
(__VLS_ctx.currentCoin.name);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-desc" },
});
const __VLS_168 = {}.VanCellGroup;
/** @type {[typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, typeof __VLS_components.VanCellGroup, typeof __VLS_components.vanCellGroup, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({}));
const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
const __VLS_172 = {}.VanCell;
/** @type {[typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, typeof __VLS_components.VanCell, typeof __VLS_components.vanCell, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    title: "解锁设置",
    center: true,
}));
const __VLS_174 = __VLS_173({
    title: "解锁设置",
    center: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_175.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_175.slots;
    const __VLS_176 = {}.VanSwitch;
    /** @type {[typeof __VLS_components.VanSwitch, typeof __VLS_components.vanSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        modelValue: (__VLS_ctx.isAlertSettingsUnlocked),
    }));
    const __VLS_178 = __VLS_177({
        modelValue: (__VLS_ctx.isAlertSettingsUnlocked),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
}
var __VLS_175;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "settings-content" },
    ...{ class: ({ 'settings-locked': !__VLS_ctx.isAlertSettingsUnlocked }) },
});
const __VLS_180 = {}.VanField;
/** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    modelValue: (__VLS_ctx.alertPrices.price1),
    type: "digit",
    label: "价格点1",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}));
const __VLS_182 = __VLS_181({
    modelValue: (__VLS_ctx.alertPrices.price1),
    type: "digit",
    label: "价格点1",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
__VLS_183.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_183.slots;
}
var __VLS_183;
const __VLS_184 = {}.VanField;
/** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    modelValue: (__VLS_ctx.alertPrices.price2),
    type: "digit",
    label: "价格点2",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}));
const __VLS_186 = __VLS_185({
    modelValue: (__VLS_ctx.alertPrices.price2),
    type: "digit",
    label: "价格点2",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_187.slots;
}
var __VLS_187;
const __VLS_188 = {}.VanField;
/** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    modelValue: (__VLS_ctx.alertPrices.price3),
    type: "digit",
    label: "价格点3",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}));
const __VLS_190 = __VLS_189({
    modelValue: (__VLS_ctx.alertPrices.price3),
    type: "digit",
    label: "价格点3",
    placeholder: "请输入预警价格",
    rightIcon: "after",
    readonly: (!__VLS_ctx.isAlertSettingsUnlocked),
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
{
    const { 'right-icon': __VLS_thisSlot } = __VLS_191.slots;
}
var __VLS_191;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "popup-buttons" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "button-group" },
});
if (__VLS_ctx.isAlertSettingsUnlocked && __VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol]) {
    const __VLS_192 = {}.VanButton;
    /** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        ...{ 'onClick': {} },
        type: "danger",
        ...{ class: "danger-button" },
        size: "large",
    }));
    const __VLS_194 = __VLS_193({
        ...{ 'onClick': {} },
        type: "danger",
        ...{ class: "danger-button" },
        size: "large",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    let __VLS_196;
    let __VLS_197;
    let __VLS_198;
    const __VLS_199 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.isAlertSettingsUnlocked && __VLS_ctx.savedThresholds[__VLS_ctx.currentCoin.symbol]))
                return;
            __VLS_ctx.clearAlert(__VLS_ctx.currentCoin.symbol);
        }
    };
    __VLS_195.slots.default;
    var __VLS_195;
}
const __VLS_200 = {}.VanButton;
/** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    ...{ 'onClick': {} },
    type: "primary",
    ...{ class: "save-button" },
    size: "large",
    disabled: (!__VLS_ctx.isAlertSettingsUnlocked),
}));
const __VLS_202 = __VLS_201({
    ...{ 'onClick': {} },
    type: "primary",
    ...{ class: "save-button" },
    size: "large",
    disabled: (!__VLS_ctx.isAlertSettingsUnlocked),
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
let __VLS_204;
let __VLS_205;
let __VLS_206;
const __VLS_207 = {
    onClick: (__VLS_ctx.saveAlertSettings)
};
__VLS_203.slots.default;
var __VLS_203;
var __VLS_171;
var __VLS_167;
/** @type {__VLS_StyleScopedClasses['app']} */ ;
/** @type {__VLS_StyleScopedClasses['content']} */ ;
/** @type {__VLS_StyleScopedClasses['price-group']} */ ;
/** @type {__VLS_StyleScopedClasses['price-title']} */ ;
/** @type {__VLS_StyleScopedClasses['coin-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['current-price']} */ ;
/** @type {__VLS_StyleScopedClasses['price-up']} */ ;
/** @type {__VLS_StyleScopedClasses['price-down']} */ ;
/** @type {__VLS_StyleScopedClasses['price-change']} */ ;
/** @type {__VLS_StyleScopedClasses['price-info']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['value']} */ ;
/** @type {__VLS_StyleScopedClasses['price-up']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['value']} */ ;
/** @type {__VLS_StyleScopedClasses['price-down']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['value']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['value']} */ ;
/** @type {__VLS_StyleScopedClasses['price-up']} */ ;
/** @type {__VLS_StyleScopedClasses['price-down']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['price-row']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-group']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-info']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-header']} */ ;
/** @type {__VLS_StyleScopedClasses['threshold-prices']} */ ;
/** @type {__VLS_StyleScopedClasses['threshold-price']} */ ;
/** @type {__VLS_StyleScopedClasses['price-reached']} */ ;
/** @type {__VLS_StyleScopedClasses['price-pending']} */ ;
/** @type {__VLS_StyleScopedClasses['price-index']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-group']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-info']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-header']} */ ;
/** @type {__VLS_StyleScopedClasses['coin-name']} */ ;
/** @type {__VLS_StyleScopedClasses['threshold-prices']} */ ;
/** @type {__VLS_StyleScopedClasses['threshold-price']} */ ;
/** @type {__VLS_StyleScopedClasses['price-reached']} */ ;
/** @type {__VLS_StyleScopedClasses['price-pending']} */ ;
/** @type {__VLS_StyleScopedClasses['price-index']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['button-row']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-content']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-header']} */ ;
/** @type {__VLS_StyleScopedClasses['coin-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-content']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-header']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-content']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-header']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-content']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-locked']} */ ;
/** @type {__VLS_StyleScopedClasses['popup-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['button-group']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-button']} */ ;
/** @type {__VLS_StyleScopedClasses['save-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            supportedCoins: supportedCoins,
            currentCoin: currentCoin,
            showCoinPicker: showCoinPicker,
            wsConnected: wsConnected,
            priceDataMap: priceDataMap,
            showNotificationSettings: showNotificationSettings,
            notificationSettings: notificationSettings,
            showAlertSettings: showAlertSettings,
            alertPrices: alertPrices,
            isAlertSettingsUnlocked: isAlertSettingsUnlocked,
            savedThresholds: savedThresholds,
            updateNotificationSettings: updateNotificationSettings,
            saveAlertSettings: saveAlertSettings,
            clearAlert: clearAlert,
            switchCoin: switchCoin,
            openAlertSettings: openAlertSettings,
            isReached: isReached,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
