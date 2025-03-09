<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { showToast, showDialog } from 'vant'

// 支持的币种列表
const supportedCoins = [
  { symbol: 'BTCUSDT', name: 'BTC', icon: '₿' },
  { symbol: 'ETHUSDT', name: 'ETH', icon: 'Ξ' },
  { symbol: 'BNBUSDT', name: 'BNB', icon: 'BNB' },
  { symbol: 'DOGEUSDT', name: 'DOGE', icon: 'Ð' },
  { symbol: 'XRPUSDT', name: 'XRP', icon: 'XRP' }
]

// 当前选择的币种
const currentCoin = ref(supportedCoins[0])
const showCoinPicker = ref(false)

// WebSocket连接状态和实例
const wsConnected = ref(false)
let ws: WebSocket | null = null

// 价格相关数据
interface PriceData {
  symbol: string
  currentPrice: string
  priceChange: number
  high24h: string
  low24h: string
  volume: string
  quoteVolume: string
  openPrice: string
  priceChangeAmount: string
}

const priceDataMap = ref<Record<string, PriceData>>({})

// 通知设置
const showNotificationSettings = ref(false)
const notificationSettings = ref({
  enabled: false,
  threshold: '1',
  thresholdEnabled: false,    // 添加价格变化阈值开关
  flashEnabled: false,    // 闪烁通知
  soundEnabled: false,    // 声音通知
  webhookEnabled: false,  // Webhook通知
  webhookUrl: ''         // Webhook URL
})
let lastNotificationPrice: Record<string, number> = {}
let flashInterval: number | null = null
let audioInstance: HTMLAudioElement | null = null
const alertAudioUrl = '/alert.mp3'

// 预警设置
const showAlertSettings = ref(false)
const alertPrices = ref({
  price1: '',
  price2: '',
  price3: ''
})
const alertType = ref('cross')
const isAlertSettingsUnlocked = ref(false)
const savedThresholds = ref<Record<string, {
  prices: string[];
  lastPrice: string;
  reachedPrices: string[];  // 修改为数组，记录按顺序触发的价格点
  isAlerting: boolean;
}>>({})

// 触发闪烁效果
const startFlashing = () => {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }
  const priceGroup = document.querySelector('.price-group')
  if (priceGroup) {
    priceGroup.classList.add('flashing')
  }
}

// 停止闪烁
const stopFlashing = () => {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }
  const priceGroup = document.querySelector('.price-group')
  if (priceGroup && priceGroup instanceof HTMLElement) {
    priceGroup.classList.remove('flashing')
    priceGroup.style.backgroundColor = ''
  }
}

// 播放声音
const playAlertSound = () => {
  if (notificationSettings.value.soundEnabled) {
    if (!audioInstance) {
      audioInstance = new Audio(alertAudioUrl)
      audioInstance.loop = true
    }
    audioInstance.play().catch(() => {
      console.error('音频播放失败')
    })
  }
}

// 停止声音
const stopAlertSound = () => {
  if (audioInstance) {
    audioInstance.pause()
    audioInstance.currentTime = 0
  }
}

// 显示警报对话框
const showAlertDialog = (message: string) => {
  showDialog({
    title: '价格预警',
    message,
    confirmButtonText: '知道了',
    showCancelButton: false,
  }).then(() => {
    // 用户点击确认后停止警报
    stopFlashing()
    stopAlertSound()
  })
}

// 发送Webhook通知
const sendWebhookNotification = async (message: string) => {
  if (!notificationSettings.value.webhookEnabled || !notificationSettings.value.webhookUrl) return
  
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
    })
  } catch (error) {
    console.error('Webhook通知发送失败:', error)
  }
}

// 检查价格变化并发送通知
const checkPriceChangeAndNotify = (symbol: string) => {
  if (!notificationSettings.value.enabled || !notificationSettings.value.thresholdEnabled) return
  
  const priceData = priceDataMap.value[symbol]
  if (!priceData) return
  
  const currentPrice = parseFloat(priceData.currentPrice)
  const lastPrice = lastNotificationPrice[symbol]
  
  if (!lastPrice) {
    lastNotificationPrice[symbol] = currentPrice
    return
  }
  
  const changePercent = Math.abs((currentPrice - lastPrice) / lastPrice * 100)
  const threshold = parseFloat(notificationSettings.value.threshold) || 1
  
  if (changePercent >= threshold) {
    const coin = supportedCoins.find(c => c.symbol === symbol)
    if (!coin) return
    
    const direction = currentPrice > lastPrice ? '上涨' : '下跌'
    const message = `${coin.name}价格${direction}${changePercent.toFixed(2)}%\n当前价格: ${currentPrice.toFixed(2)} USDT`
    
    // 触发各种通知
    if (notificationSettings.value.flashEnabled) {
      startFlashing()
    }
    
    if (notificationSettings.value.soundEnabled) {
      playAlertSound()
    }
    
    if (notificationSettings.value.webhookEnabled) {
      sendWebhookNotification(message)
    }
    
    // 显示需要手动关闭的警报对话框
    showDialog({
      title: '价格预警',
      message,
      confirmButtonText: '知道了',
      showCancelButton: false,
      beforeClose: (action) => {
        if (action === 'confirm') {
          stopFlashing()
          stopAlertSound()
        }
        return true
      }
    })
    
    lastNotificationPrice[symbol] = currentPrice
  }
}

// 保存设置到localStorage
const saveSettings = () => {
  try {
    localStorage.setItem('monitorSettings', JSON.stringify({
      notificationSettings: notificationSettings.value,
      savedThresholds: savedThresholds.value,
      currentCoin: currentCoin.value.symbol,
      lastNotificationPrice
    }))
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

// 更新通知设置
const updateNotificationSettings = () => {
  const threshold = parseFloat(notificationSettings.value.threshold) || 1
  notificationSettings.value.threshold = threshold.toString()
  
  if (!notificationSettings.value.enabled) {
    lastNotificationPrice = {}
    stopFlashing()
    stopAlertSound()
  } else {
    // 重置所有币种的最后通知价格
    supportedCoins.forEach(coin => {
      const priceData = priceDataMap.value[coin.symbol]
      if (priceData) {
        lastNotificationPrice[coin.symbol] = parseFloat(priceData.currentPrice)
      }
    })
  }
  
  // 保存设置
  saveSettings()
}

// 连接WebSocket
const connectWebSocket = () => {
  if (ws) {
    ws.close()
  }

  const symbols = supportedCoins.map(coin => coin.symbol.toLowerCase())
  const streams = symbols.map(symbol => `${symbol}@ticker`).join('/')
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`)
  
  ws.onopen = () => {
    wsConnected.value = true
  }
  
  ws.onclose = () => {
    wsConnected.value = false
    // 尝试重连
    setTimeout(connectWebSocket, 3000)
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    const symbol = data.s
    
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
    }
    
    checkAlert(symbol)
    checkPriceChangeAndNotify(symbol)
  }
}

// 检查预警条件
const checkAlert = (symbol: string) => {
  const threshold = savedThresholds.value[symbol]
  if (!threshold) return
  
  const priceData = priceDataMap.value[symbol]
  if (!priceData) return

  const currentPrice = parseFloat(priceData.currentPrice)
  const lastPrice = parseFloat(threshold.lastPrice)
  
  if (isNaN(lastPrice)) {
    threshold.lastPrice = priceData.currentPrice
    return
  }

  // 如果正在报警中，直接返回
  if (threshold.isAlerting) return

  // 获取所有有效的预警价格
  const validPrices = threshold.prices.filter(p => p !== '0')
  if (validPrices.length === 0) return

  // 检查价格点是否按顺序被触发
  validPrices.forEach(priceStr => {
    const price = parseFloat(priceStr)
    if (isNaN(price)) return

    // 检查是否是下一个需要触发的价格点
    const isNextPrice = threshold.reachedPrices.length === validPrices.indexOf(priceStr)

    // 如果是下一个价格点，并且价格穿过了这个点，就记录下来
    if (isNextPrice && ((lastPrice < price && currentPrice >= price) || 
        (lastPrice > price && currentPrice <= price))) {
      threshold.reachedPrices.push(priceStr)
    }
  })

  // 检查是否所有价格点都已经按顺序触发
  if (threshold.reachedPrices.length === validPrices.length) {
    threshold.isAlerting = true
    triggerAlert(symbol, currentPrice, 'all')
  }

  // 更新最后价格
  threshold.lastPrice = priceData.currentPrice
}

// 触发预警
const triggerAlert = (symbol: string, currentPrice: number, type: 'up' | 'down' | 'all') => {
  const coin = supportedCoins.find(c => c.symbol === symbol)
  if (!coin) return

  const threshold = savedThresholds.value[symbol]
  if (!threshold) return

  const message = type === 'all' 
    ? `${coin.name}已按顺序触发所有预警价格点：${threshold.reachedPrices.join(' -> ')}\n当前价格: ${currentPrice.toFixed(2)} USDT`
    : `${coin.name}价格${type === 'up' ? '上涨' : '下跌'}穿过预警点`

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
          savedThresholds.value[symbol].isAlerting = false
          savedThresholds.value[symbol].reachedPrices = []
        }
        // 停止声音提醒
        if (audioInstance) {
          audioInstance.pause()
          audioInstance.currentTime = 0
        }
      }
      return true
    }
  })
  
  // 播放提示音
  if (notificationSettings.value.soundEnabled) {
    playAlertSound()
  }
  
  // 开始闪烁
  if (notificationSettings.value.flashEnabled) {
    startFlashing()
  }
}

// 保存预警设置
const saveAlertSettings = () => {
  const prices = [
    alertPrices.value.price1,
    alertPrices.value.price2,
    alertPrices.value.price3
  ].map(p => p.trim())
   .map(p => p === '' ? '0' : p)
   .map(p => {
     const num = parseFloat(p)
     return isNaN(num) ? '0' : num.toFixed(2)
   })

  if (prices.every(p => p === '0')) {
    return
  }

  const currentPrice = priceDataMap.value[currentCoin.value.symbol]?.currentPrice || '0'
  
  savedThresholds.value[currentCoin.value.symbol] = {
    prices,
    lastPrice: currentPrice,
    reachedPrices: [],  // 初始化为空数组
    isAlerting: false
  }
  
  showAlertSettings.value = false
  
  // 清空输入
  alertPrices.value = {
    price1: '',
    price2: '',
    price3: ''
  }
  
  // 保存设置
  saveSettings()
}

// 清除预警
const clearAlert = (symbol: string) => {
  delete savedThresholds.value[symbol]
  // 保存设置
  saveSettings()
}

// 切换币种
const switchCoin = (coin: typeof supportedCoins[0]) => {
  currentCoin.value = coin
  showCoinPicker.value = false
  // 保存设置
  saveSettings()
}

// 打开预警设置
const openAlertSettings = () => {
  isAlertSettingsUnlocked.value = false // 重置解锁状态
  // 恢复已保存的预警价格到输入框
  const savedAlert = savedThresholds.value[currentCoin.value.symbol]
  if (savedAlert) {
    alertPrices.value = {
      price1: savedAlert.prices[0] === '0' ? '' : savedAlert.prices[0],
      price2: savedAlert.prices[1] === '0' ? '' : savedAlert.prices[1],
      price3: savedAlert.prices[2] === '0' ? '' : savedAlert.prices[2]
    }
  } else {
    // 如果没有保存的预警，清空输入框
    alertPrices.value = {
      price1: '',
      price2: '',
      price3: ''
    }
  }
  showAlertSettings.value = true
}

// 获取排序后的价格列表
const getSortedPrices = (prices: string[]) => {
  return [...prices]
    .filter(p => p !== '0')
    .sort((a, b) => parseFloat(a) - parseFloat(b))
}

// 判断是否为最高价格
const isHighPrice = (price: string, symbol: string) => {
  const currentPrice = parseFloat(priceDataMap.value[symbol]?.currentPrice || '0')
  return parseFloat(price) > currentPrice
}

// 判断是否为最低价格
const isLowPrice = (price: string, symbol: string) => {
  const currentPrice = parseFloat(priceDataMap.value[symbol]?.currentPrice || '0')
  return parseFloat(price) < currentPrice
}

// 判断是否达到预警条件
const isReached = (price: string, symbol: string) => {
  const currentPrice = parseFloat(priceDataMap.value[symbol]?.currentPrice || '0')
  const targetPrice = parseFloat(price)
  return currentPrice >= targetPrice
}

// 生命周期钩子
onMounted(() => {
  // 从localStorage加载设置
  const savedSettings = localStorage.getItem('monitorSettings')
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      // 恢复通知设置
      if (settings.notificationSettings) {
        notificationSettings.value = {
          ...notificationSettings.value,
          ...settings.notificationSettings
        }
      }
      
      // 恢复预警设置
      if (settings.savedThresholds) {
        savedThresholds.value = settings.savedThresholds
      }

      // 恢复当前选择的币种
      if (settings.currentCoin) {
        const savedCoin = supportedCoins.find(c => c.symbol === settings.currentCoin)
        if (savedCoin) {
          currentCoin.value = savedCoin
        }
      }

      // 恢复最后通知价格
      if (settings.lastNotificationPrice) {
        lastNotificationPrice = settings.lastNotificationPrice
      }
    } catch (error) {
      console.error('恢复设置失败:', error)
      localStorage.removeItem('monitorSettings')
    }
  }

  // 连接WebSocket
  connectWebSocket()
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  stopFlashing()
  stopAlertSound()
})

// 测试通知效果
const testNotifications = () => {
  console.log('测试通知开始', {
    flash: notificationSettings.value.flashEnabled,
    sound: notificationSettings.value.soundEnabled
  })

  // 测试背景闪烁
  if (notificationSettings.value.flashEnabled) {
    startFlashing()
  }

  // 测试声音提醒
  if (notificationSettings.value.soundEnabled) {
    playAlertSound()
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
    stopFlashing()
    stopAlertSound()
  })

  // 测试Webhook
  if (notificationSettings.value.webhookEnabled) {
    sendWebhookNotification('这是一条测试通知')
  }
}
</script>

<template>
  <!-- 添加meta标签防止缩放 -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  
  <div class="app">
    <!-- 导航栏 -->
    <van-nav-bar
      :title="currentCoin.name + '/USDT 监控'"
      :right-text="wsConnected ? '已连接' : '未连接'"
      :right-text-color="wsConnected ? '#07c160' : '#ee0a24'"
      fixed
      placeholder
    >
      <template #left>
        <van-button 
          type="primary" 
          size="small"
          plain
          @click="showCoinPicker = true"
        >
          切换币种
        </van-button>
      </template>
    </van-nav-bar>

    <!-- 价格展示卡片 -->
    <div class="content">
      <van-cell-group inset class="price-group">
        <van-cell>
          <template #title>
            <div class="price-title">
              <span class="coin-icon">{{ currentCoin.icon }}</span>
              <span class="current-price" :class="{
                'price-up': (priceDataMap[currentCoin.symbol]?.priceChange || 0) > 0,
                'price-down': (priceDataMap[currentCoin.symbol]?.priceChange || 0) < 0
              }">
                {{ priceDataMap[currentCoin.symbol]?.currentPrice || '--' }}
              </span>
              <van-tag 
                :type="(priceDataMap[currentCoin.symbol]?.priceChange || 0) >= 0 ? 'success' : 'danger'"
                class="price-change"
              >
                {{ (priceDataMap[currentCoin.symbol]?.priceChange || 0) >= 0 ? '+' : '' }}
                {{ priceDataMap[currentCoin.symbol]?.priceChange?.toFixed(2) || '0.00' }}%
              </van-tag>
            </div>
          </template>
          <template #label>
            <div class="price-info">
              <div class="price-row">
                <span>24h高: </span>
                <span class="value price-up">{{ priceDataMap[currentCoin.symbol]?.high24h || '--' }} USDT</span>
              </div>
              <div class="price-row">
                <span>24h低: </span>
                <span class="value price-down">{{ priceDataMap[currentCoin.symbol]?.low24h || '--' }} USDT</span>
              </div>
              <div class="price-row">
                <span>开盘价: </span>
                <span class="value">{{ priceDataMap[currentCoin.symbol]?.openPrice || '--' }} USDT</span>
              </div>
              <div class="price-row">
                <span>涨跌额: </span>
                <span class="value" :class="{
                  'price-up': (priceDataMap[currentCoin.symbol]?.priceChangeAmount || 0) > 0,
                  'price-down': (priceDataMap[currentCoin.symbol]?.priceChangeAmount || 0) < 0
                }">
                  {{ (priceDataMap[currentCoin.symbol]?.priceChangeAmount || 0) >= 0 ? '+' : '' }}{{ priceDataMap[currentCoin.symbol]?.priceChangeAmount || '--' }} USDT
                </span>
              </div>
              <div class="price-row">
                <span>24h成交量: {{ priceDataMap[currentCoin.symbol]?.volume || '--' }} {{ currentCoin.name }}</span>
              </div>
              <div class="price-row">
                <span>24h成交额: {{ priceDataMap[currentCoin.symbol]?.quoteVolume || '--' }} USDT</span>
              </div>
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 预警条件展示 -->
      <van-cell-group 
        v-if="savedThresholds[currentCoin.symbol]" 
        inset 
        title="预警条件"
        class="alert-group"
      >
        <van-cell>
          <template #title>
            <div class="alert-info">
              <div class="alert-header">
                <span>价格穿过以下点位时预警</span>
                <van-tag 
                  :type="savedThresholds[currentCoin.symbol].isAlerting ? 'warning' : 'success'"
                  round
                >
                  {{ savedThresholds[currentCoin.symbol].isAlerting ? '预警中' : '监控中' }}
                </van-tag>
              </div>
              <div class="threshold-prices">
                <span v-for="(priceValue, index) in savedThresholds[currentCoin.symbol].prices" 
                      :key="index"
                      v-if="priceValue !== '0'"
                      class="threshold-price"
                      :class="{
                        'price-reached': isReached(priceValue, currentCoin.symbol),
                        'price-pending': !isReached(priceValue, currentCoin.symbol)
                      }"
                >
                  <span class="price-index">{{ index + 1 }}</span>
                  {{ priceValue }} USDT
                </span>
              </div>
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 其他币种预警列表 -->
      <van-cell-group 
        v-if="Object.keys(savedThresholds).filter(s => s !== currentCoin.symbol).length > 0" 
        inset 
        title="其他币种预警"
        class="alert-group"
      >
        <van-cell v-for="symbol in Object.keys(savedThresholds).filter(s => s !== currentCoin.symbol)" :key="symbol">
          <template #title>
            <div class="alert-info">
              <div class="alert-header">
                <span class="coin-name">
                  {{ supportedCoins.find(c => c.symbol === symbol)?.name || symbol }}:
                </span>
                <span>价格穿过以下点位时预警</span>
                <van-tag 
                  :type="savedThresholds[symbol].isAlerting ? 'warning' : 'success'"
                  round
                  style="margin-left: auto"
                >
                  {{ savedThresholds[symbol].isAlerting ? '预警中' : '监控中' }}
                </van-tag>
              </div>
              <div class="threshold-prices">
                <span v-for="(priceValue, index) in savedThresholds[symbol].prices" 
                      :key="index"
                      v-if="priceValue !== '0'"
                      class="threshold-price"
                      :class="{
                        'price-reached': isReached(priceValue, symbol),
                        'price-pending': !isReached(priceValue, symbol)
                      }"
                >
                  <span class="price-index">{{ index + 1 }}</span>
                  {{ priceValue }} USDT
                </span>
              </div>
            </div>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 底部按钮 -->
    <div class="bottom-buttons">
      <div class="button-row">
        <van-button 
          type="primary" 
          block 
          size="large"
          @click="showNotificationSettings = true"
        >
          通知设置
        </van-button>
        <van-button 
          type="warning" 
          block 
          size="large"
          @click="openAlertSettings"
        >
          预警设置
        </van-button>
      </div>
    </div>

    <!-- 币种选择弹窗 -->
    <van-popup
      v-model:show="showCoinPicker"
      position="bottom"
      round
      closeable
      safe-area-inset-bottom
    >
      <div class="popup-content">
        <div class="popup-header">选择币种</div>
        <van-cell-group>
          <van-cell 
            v-for="coin in supportedCoins" 
            :key="coin.symbol"
            :title="coin.name + '/USDT'"
            clickable
            @click="switchCoin(coin)"
          >
            <template #right-icon>
              <span class="coin-icon">{{ coin.icon }}</span>
            </template>
          </van-cell>
        </van-cell-group>
      </div>
    </van-popup>

    <!-- 通知设置弹窗 -->
    <van-popup
      v-model:show="showNotificationSettings"
      position="bottom"
      round
      closeable
      safe-area-inset-bottom
    >
      <div class="popup-content">
        <div class="popup-header">通知设置</div>
        <van-cell-group>
          <van-cell title="启用价格波动通知" label="关闭后将停止所有通知">
            <template #right-icon>
              <van-switch v-model="notificationSettings.enabled" @change="updateNotificationSettings" />
            </template>
          </van-cell>
          
          <van-cell title="价格变化通知">
            <template #right-icon>
              <van-switch 
                v-model="notificationSettings.thresholdEnabled" 
                :disabled="!notificationSettings.enabled"
                @change="updateNotificationSettings" 
              />
            </template>
          </van-cell>

          <van-field
            v-if="notificationSettings.thresholdEnabled"
            v-model="notificationSettings.threshold"
            type="digit"
            label="价格变化阈值"
            placeholder="请输入价格变化百分比"
            :disabled="!notificationSettings.enabled"
            right-icon="after"
            @blur="updateNotificationSettings"
          >
            <template #right-icon>%</template>
          </van-field>

          <van-cell title="背景闪烁提醒">
            <template #right-icon>
              <van-switch 
                v-model="notificationSettings.flashEnabled" 
                :disabled="!notificationSettings.enabled"
                @change="updateNotificationSettings" 
              />
            </template>
          </van-cell>

          <van-cell title="声音提醒">
            <template #right-icon>
              <van-switch 
                v-model="notificationSettings.soundEnabled" 
                :disabled="!notificationSettings.enabled"
                @change="updateNotificationSettings" 
              />
            </template>
          </van-cell>

          <van-cell title="Webhook通知">
            <template #right-icon>
              <van-switch 
                v-model="notificationSettings.webhookEnabled" 
                :disabled="!notificationSettings.enabled"
                @change="updateNotificationSettings" 
              />
            </template>
          </van-cell>

          <van-field
            v-if="notificationSettings.webhookEnabled"
            v-model="notificationSettings.webhookUrl"
            label="Webhook地址"
            placeholder="请输入接收通知的URL"
            :disabled="!notificationSettings.enabled"
            @blur="updateNotificationSettings"
          />
        </van-cell-group>
      </div>
    </van-popup>

    <!-- 预警设置弹窗 -->
    <van-popup
      v-model:show="showAlertSettings"
      position="bottom"
      round
      closeable
      safe-area-inset-bottom
    >
      <div class="popup-content">
        <div class="popup-header">预警设置 ({{ currentCoin.name }}/USDT)</div>
        <div class="popup-desc">设置价格穿过点，输入0或留空表示忽略该价格点</div>
        <van-cell-group>
          <van-cell title="解锁设置" center>
            <template #right-icon>
              <van-switch v-model="isAlertSettingsUnlocked" />
            </template>
          </van-cell>
          <div class="settings-content" :class="{ 'settings-locked': !isAlertSettingsUnlocked }">
            <van-field
              v-model="alertPrices.price1"
              type="digit"
              label="价格点1"
              placeholder="请输入预警价格"
              right-icon="after"
              :readonly="!isAlertSettingsUnlocked"
            >
              <template #right-icon>USDT</template>
            </van-field>
            <van-field
              v-model="alertPrices.price2"
              type="digit"
              label="价格点2"
              placeholder="请输入预警价格"
              right-icon="after"
              :readonly="!isAlertSettingsUnlocked"
            >
              <template #right-icon>USDT</template>
            </van-field>
            <van-field
              v-model="alertPrices.price3"
              type="digit"
              label="价格点3"
              placeholder="请输入预警价格"
              right-icon="after"
              :readonly="!isAlertSettingsUnlocked"
            >
              <template #right-icon>USDT</template>
            </van-field>
            <div class="popup-buttons">
              <div class="button-group">
                <van-button 
                  v-if="isAlertSettingsUnlocked && savedThresholds[currentCoin.symbol]"
                  type="danger" 
                  class="danger-button"
                  size="large"
                  @click="clearAlert(currentCoin.symbol)"
                >
                  清除预警
                </van-button>
                <van-button 
                  type="primary" 
                  class="save-button"
                  size="large"
                  :disabled="!isAlertSettingsUnlocked"
                  @click="saveAlertSettings"
                >
                  保存设置
                </van-button>
              </div>
            </div>
          </div>
        </van-cell-group>
      </div>
    </van-popup>
  </div>
</template>

<style>
/* 添加闪烁动画 */
@keyframes flash {
  0% { 
    background: #ff0000;
    box-shadow: 0 0 100px #ff0000, 0 0 200px #ff0000;
    transform: scale(1.08) rotate(-2deg);
    border: 4px solid #ff0000;
    filter: brightness(1.5);
  }
  25% {
    transform: scale(1.05) rotate(2deg);
    filter: brightness(1.3);
  }
  50% { 
    background: #ffffff;
    box-shadow: 0 0 80px #ffffff, 0 0 160px #ffffff;
    transform: scale(1) rotate(0deg);
    border: 4px solid #ffffff;
    filter: brightness(1.8);
  }
  75% {
    transform: scale(1.05) rotate(-2deg);
    filter: brightness(1.3);
  }
  100% { 
    background: #ff0000;
    box-shadow: 0 0 100px #ff0000, 0 0 200px #ff0000;
    transform: scale(1.08) rotate(2deg);
    border: 4px solid #ff0000;
    filter: brightness(1.5);
  }
}

.flashing {
  animation: flash 0.3s infinite !important;
  position: relative;
  z-index: 2000 !important;
  filter: contrast(1.5) brightness(1.5);
  backdrop-filter: blur(4px);
}

:root {
  --van-nav-bar-height: 46px;
}

.app {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: calc(env(safe-area-inset-bottom) + 88px);
  transition: background-color 0.3s;
}

.content {
  padding: 12px;
  transition: all 0.3s ease;
  border-radius: 8px;
}

.price-group {
  margin-bottom: 12px;
  background: linear-gradient(135deg, #1989fa0d 0%, #ffffff 100%);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  isolation: isolate;
}

.price-title {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}

.coin-icon {
  font-size: 28px;
  color: #1989fa;
  background: #1989fa0d;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.current-price {
  font-size: 36px;
  font-weight: bold;
  color: #323233;
  flex: 1;
}

.price-change {
  font-size: 16px;
  padding: 8px 12px;
  border-radius: 20px;
}

.price-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  color: #969799;
  font-size: 15px;
  padding: 0 4px;
}

.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.price-row span:first-child {
  color: #666;
}

.price-row .value {
  color: #323233;
  font-weight: 500;
}

.alert-group {
  margin-top: 12px;
}

.alert-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-progress {
  color: #969799;
  font-size: 14px;
}

.coin-name {
  font-weight: 500;
  color: #323233;
}

.threshold-prices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-bottom: 4px;
}

.threshold-price {
  font-weight: bold;
  color: #323233;
  padding: 4px 8px;
  border-radius: 16px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
}

.threshold-price.price-pending {
  background: #f5f5f5;
  color: #999;
  border: 1px solid #e8e8e8;
}

.threshold-price.price-reached {
  background: #fffbe8;
  color: #ed6a0c;
  border: 1px solid #ed6a0c;
}

.price-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 12px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.1);
  margin-right: 2px;
}

.price-reached .price-index {
  background: rgba(237, 106, 12, 0.2);
  color: #ed6a0c;
}

.price-pending .price-index {
  background: rgba(153, 153, 153, 0.2);
  color: #999;
}

.bottom-buttons {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px;
  background: #fff;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.button-row {
  display: flex;
  gap: 12px;
}

.button-row .van-button {
  flex: 1;
}

.popup-content {
  padding-top: 24px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 24px);
}

.popup-header {
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 16px;
}

.popup-buttons {
  padding: 16px;
}

.popup-desc {
  color: #969799;
  font-size: 14px;
  text-align: center;
  margin: -8px 0 16px;
  padding: 0 16px;
}

:deep(.van-field__right-icon) {
  color: #969799;
}

:deep(.van-radio-group) {
  display: flex;
  gap: 16px;
}

:deep(.van-cell) {
  padding: 16px;
}

:deep(.van-tag--success) {
  background: #07c160;
}

:deep(.van-tag--danger) {
  background: #ee0a24;
}

.price-up {
  color: #03a66d !important;
}

.price-down {
  color: #cf304a !important;
}

.custom-toast {
  min-width: 200px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  background: rgba(50, 50, 50, 0.9) !important;
}

.custom-toast .van-toast__icon {
  font-size: 20px;
  margin-bottom: 6px;
}

.settings-content {
  position: relative;
}

.settings-locked {
  position: relative;
  opacity: 0.6;
  pointer-events: none;
}

.settings-locked::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.6);
  z-index: 1;
}

.button-group {
  display: flex;
  gap: 8px;
}

.button-group .danger-button {
  flex: 1;
  max-width: 33.33%;
}

.button-group .save-button {
  flex: 2;
}
</style>
