<template>
  <div class="app-container">
    <el-container>
      <el-main>
        <el-row :gutter="20">
          <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
            <el-card class="price-card">
              <template #header>
                <div class="card-header">
                  <span>BTC/USDT</span>
                  <div class="header-controls">
                    <el-button 
                      type="primary"
                      size="small"
                      @click="manualRefresh"
                      :loading="isRefreshing"
                    >
                      刷新
                    </el-button>
                    <el-popover
                      placement="bottom"
                      :width="200"
                      trigger="click"
                    >
                      <template #reference>
                        <el-button 
                          :type="soundEnabled || flashEnabled || webhookEnabled ? 'primary' : 'info'" 
                          size="small"
                          class="notification-btn"
                        >
                          通知设置
                          <el-badge :is-dot="soundEnabled || flashEnabled || webhookEnabled" />
                        </el-button>
                      </template>
                      <div class="notification-settings">
                        <div class="setting-item">
                          <span>声音提醒</span>
                          <el-switch v-model="soundEnabled" />
                        </div>
                        <div class="setting-item">
                          <span>价格闪烁</span>
                          <el-switch v-model="flashEnabled" />
                        </div>
                        <div class="setting-item">
                          <span>微信通知</span>
                          <el-switch v-model="webhookEnabled" />
                        </div>
                        <div class="webhook-input" v-if="webhookEnabled">
                          <el-input
                            v-model="webhookUrl"
                            placeholder="请输入Webhook地址"
                            size="small"
                          />
                        </div>
                      </div>
                    </el-popover>
                    <el-tag :type="priceChangeColor" class="price-change">
                      {{ priceChange24h }}%
                    </el-tag>
                  </div>
                </div>
              </template>
              <div class="price-content">
                <div class="price-title">
                  <span>实时价格：</span>
                  <h2 :class="{ 'price-flash': isFlashing && flashEnabled }">{{ currentPrice }}</h2>
                </div>
                <div class="threshold-info" v-if="savedThreshold">
                  <el-alert
                    :title="'预警条件: ' + (savedThreshold.type === 'greater' ? '向上' : '向下') + '突破'"
                    :type="isThresholdTriggered ? 'error' : 'success'"
                    show-icon
                    :closable="false"
                  >
                    <template #description>
                      <div class="price-points-progress">
                        <div v-for="(price, index) in [savedThreshold.price1, savedThreshold.price2, savedThreshold.price3]" 
                          :key="index"
                          class="price-point-status"
                          :class="{
                            'reached': isPricePointReached(price)
                          }"
                        >
                          价格点{{ index + 1 }}: {{ price }}
                          <el-tag size="small" :type="isPricePointReached(price) ? 'success' : ''">
                            {{ isPricePointReached(price) ? '已达成' : '未达成' }}
                          </el-tag>
                        </div>
                      </div>
                    </template>
                  </el-alert>
                </div>
                <div class="price-details">
                  <div class="detail-item">
                    <span>24h高：</span>
                    <span>{{ high24h }}</span>
                  </div>
                  <div class="detail-item">
                    <span>24h低：</span>
                    <span>{{ low24h }}</span>
                  </div>
                  <div class="detail-item">
                    <span>24h成交量：</span>
                    <span>{{ volume24h }}</span>
                  </div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
            <el-card class="alert-card">
              <template #header>
                <div class="card-header">
                  <span>价格预警设置</span>
                </div>
              </template>
              <div class="alert-content">
                <el-form :model="alertForm" label-width="120px">
                  <el-form-item label="预警类型">
                    <el-radio-group v-model="alertForm.type">
                      <el-radio label="greater">向上突破</el-radio>
                      <el-radio label="less">向下突破</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item label="价格点1">
                    <el-input-number 
                      v-model="alertForm.price1" 
                      :precision="2" 
                      :step="100"
                      :min="0"
                      style="width: 160px"
                      :controls="false"
                    />
                  </el-form-item>
                  <el-form-item label="价格点2">
                    <el-input-number 
                      v-model="alertForm.price2" 
                      :precision="2" 
                      :step="100"
                      :min="0"
                      style="width: 160px"
                    />
                  </el-form-item>
                  <el-form-item label="价格点3">
                    <el-input-number 
                      v-model="alertForm.price3" 
                      :precision="2" 
                      :step="100"
                      :min="0"
                      style="width: 160px"
                    />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="saveAlertSettings">
                      保存设置
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const currentPrice = ref(0)
const priceChange24h = ref(0)
const high24h = ref(0)
const low24h = ref(0)
const volume24h = ref(0)
const isRefreshing = ref(false)

const alertForm = ref({
  type: 'greater' as 'greater' | 'less',
  price1: 0,
  price2: 0,
  price3: 0
})

const audio = new Audio('/alert.mp3')

const soundEnabled = ref(true)
const flashEnabled = ref(true)
const isFlashing = ref(false)
let flashTimer: number | null = null

const webhookEnabled = ref(false)
const webhookUrl = ref('')

interface AlertSettings {
  type: 'greater' | 'less'
  price1: number
  price2: number
  price3: number
}

const savedThreshold = ref<AlertSettings | null>(null)

const priceChangeColor = computed(() => {
  return priceChange24h.value >= 0 ? 'success' : 'danger'
})

const isThresholdTriggered = computed(() => {
  if (!savedThreshold.value) return false
  
  const prices = [
    savedThreshold.value.price1,
    savedThreshold.value.price2,
    savedThreshold.value.price3
  ]
  
  return prices.every(price => 
    savedThreshold.value?.type === 'greater'
      ? currentPrice.value > price
      : currentPrice.value < price
  )
})

const isPricePointReached = (price: number) => {
  if (!savedThreshold.value) return false
  return savedThreshold.value.type === 'greater'
    ? currentPrice.value > price
    : currentPrice.value < price
}

const fetchBTCData = async () => {
  console.log('开始获取数据:', new Date().toLocaleTimeString())
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
      // 添加时间戳防止缓存
      params: {
        _t: Date.now()
      }
    })
    const data = response.data
    console.log('获取到新价格:', data.lastPrice)
    
    currentPrice.value = parseFloat(data.lastPrice)
    priceChange24h.value = parseFloat(data.priceChangePercent)
    high24h.value = parseFloat(data.highPrice)
    low24h.value = parseFloat(data.lowPrice)
    volume24h.value = parseFloat(data.volume)
    
    // 检查预警条件
    checkAlert()
    
    // 确保下一次更新
    if (!document.hidden) {
      console.log('安排下一次更新')
      scheduleNextUpdate()
    }
  } catch (error) {
    console.error('获取数据失败:', error)
    // 发生错误时也要确保继续更新
    if (!document.hidden) {
      console.log('发生错误，重试更新')
      scheduleNextUpdate()
    }
  }
}

const checkAlert = () => {
  const savedAlert = localStorage.getItem('btcAlert')
  if (!savedAlert) return
  
  try {
    const alertSettings = JSON.parse(savedAlert)
    if (!alertSettings) return
    
    const prices = [
      alertSettings.price1,
      alertSettings.price2,
      alertSettings.price3
    ]
    
    const allReached = prices.every(price => 
      alertSettings.type === 'greater'
        ? currentPrice.value > price
        : currentPrice.value < price
    )

    if (allReached) {
      triggerAlert()
    }
  } catch (error) {
    console.error('Error checking alerts:', error)
  }
}

const triggerAlert = async () => {
  if (soundEnabled.value) {
    audio.play()
  }
  if (flashEnabled.value) {
    startFlashing()
  }
  if (webhookEnabled.value && webhookUrl.value && savedThreshold.value) {
    try {
      const message = `BTC价格预警：当前价格 ${currentPrice.value} USDT\n` +
        `预警类型：${savedThreshold.value.type === 'greater' ? '向上' : '向下'}突破\n` +
        `价格点1：${savedThreshold.value.price1}\n` +
        `价格点2：${savedThreshold.value.price2}\n` +
        `价格点3：${savedThreshold.value.price3}`

      await axios.get(webhookUrl.value, {
        params: {
          message
        }
      })
    } catch (error) {
      console.error('发送微信通知失败:', error)
      ElMessage.error('发送微信通知失败')
    }
  }
}

const startFlashing = () => {
  isFlashing.value = true
  if (flashTimer) {
    clearTimeout(flashTimer)
  }
  flashTimer = window.setTimeout(() => {
    isFlashing.value = false
  }, 3000)
}

const saveAlertSettings = () => {
  console.log('Saving settings:', alertForm.value)
  try {
    // 验证所有价格都已设置
    if (alertForm.value.price1 <= 0 || alertForm.value.price2 <= 0 || alertForm.value.price3 <= 0) {
      ElMessage({
        message: '请设置所有价格点',
        type: 'warning'
      })
      return
    }
    
    localStorage.setItem('btcAlert', JSON.stringify(alertForm.value))
    savedThreshold.value = { ...alertForm.value }
    ElMessage({
      message: '预警设置已保存',
      type: 'success'
    })
  } catch (error) {
    console.error('Save settings error:', error)
    ElMessage({
      message: '保存设置失败',
      type: 'error'
    })
  }
}

let updateTimeout: number | null = null

const scheduleNextUpdate = () => {
  console.log('scheduleNextUpdate 被调用')
  if (updateTimeout) {
    console.log('清除现有的超时器')
    clearTimeout(updateTimeout)
  }
  console.log('设置新的超时器')
  updateTimeout = window.setTimeout(() => {
    console.log('超时器触发，调用 fetchBTCData')
    fetchBTCData()
  }, 1000)
}

const handleVisibilityChange = () => {
  console.log('可见性变化:', document.hidden ? '隐藏' : '可见')
  if (document.hidden) {
    // 页面隐藏时清除更新
    if (updateTimeout) {
      console.log('页面隐藏，清除更新')
      clearTimeout(updateTimeout)
      updateTimeout = null
    }
  } else {
    // 页面可见时立即获取数据并恢复更新
    console.log('页面可见，重新开始更新')
    fetchBTCData()
  }
}

const manualRefresh = async () => {
  console.log('手动刷新被调用')
  try {
    isRefreshing.value = true
    await fetchBTCData()
  } catch (error) {
    console.error('手动刷新失败:', error)
    ElMessage.error('手动刷新失败')
  } finally {
    isRefreshing.value = false
  }
}

onMounted(() => {
  console.log('组件挂载')
  if (Notification.permission !== 'granted') {
    Notification.requestPermission()
  }
  
  // 加载预警设置
  const savedAlert = localStorage.getItem('btcAlert')
  if (savedAlert) {
    try {
      const parsed = JSON.parse(savedAlert) as AlertSettings
      if (parsed && parsed.type && typeof parsed.price1 === 'number' && 
          typeof parsed.price2 === 'number' && typeof parsed.price3 === 'number') {
        alertForm.value = {
          type: parsed.type,
          price1: parsed.price1,
          price2: parsed.price2,
          price3: parsed.price3
        }
        savedThreshold.value = { ...alertForm.value }
      }
    } catch (error) {
      console.error('Error loading saved alert settings:', error)
    }
  }
  
  // 立即获取第一次数据
  console.log('获取首次数据')
  fetchBTCData()
  
  // 添加页面可见性监听
  console.log('添加可见性监听器')
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 加载通知设置
  const savedSettings = localStorage.getItem('btcSettings')
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      soundEnabled.value = settings.sound ?? true
      flashEnabled.value = settings.flash ?? true
      webhookEnabled.value = settings.webhook ?? false
      webhookUrl.value = settings.webhookUrl ?? ''
    } catch (error) {
      console.error('Error loading notification settings:', error)
    }
  }
})

onBeforeUnmount(() => {
  if (updateTimeout) {
    clearTimeout(updateTimeout)
  }
  if (flashTimer) {
    clearTimeout(flashTimer)
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

watch([soundEnabled, flashEnabled, webhookEnabled, webhookUrl], () => {
  localStorage.setItem('btcSettings', JSON.stringify({
    sound: soundEnabled.value,
    flash: flashEnabled.value,
    webhook: webhookEnabled.value,
    webhookUrl: webhookUrl.value
  }))
})

watch(() => alertForm.value.type, (newValue) => {
  console.log('Alert type changed:', newValue)
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 20px;
  max-width: 90%;
  margin: 0 auto;

  @media (max-width: 1920px) {
    max-width: 95%;
  }

  @media (max-width: 1440px) {
    max-width: 90%;
  }

  @media (max-width: 768px) {
    max-width: 100%;
    padding: 10px;
  }

  .el-main {
    padding: 0;
  }

  .el-row {
    margin: 0 !important;
  }

  .price-card, .alert-card {
    margin-bottom: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    background: #fff;
    height: calc(100vh - 40px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;

    @media (max-width: 768px) {
      height: auto;
      min-height: 500px;
    }

    :deep(.el-card__header) {
      padding: 15px 20px;
      border-bottom: 1px solid #e4e7ed;
      flex-shrink: 0;
    }

    :deep(.el-card__body) {
      flex: 1;
      overflow-y: auto;
      padding: 0;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      span {
        font-size: 20px;
        font-weight: 600;
        color: #303133;

        @media (max-width: 768px) {
          font-size: 16px;
        }
      }
    }

    .price-content {
      padding: 20px;
      height: 100%;

      .price-title {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;

        span {
          font-size: 16px;
          color: #606266;
        }

        h2 {
          margin: 0;
          font-size: 48px;
          font-weight: 600;
          color: #303133;
          line-height: 1.2;

          @media (max-width: 1440px) {
            font-size: 40px;
          }

          @media (max-width: 768px) {
            font-size: 28px;
          }

          &.price-flash {
            animation: priceFlash 1s infinite;
          }
        }
      }

      .threshold-info {
        margin: 20px 0;

        :deep(.el-alert) {
          border-radius: 4px;

          .el-alert__title {
            font-size: 14px;
            font-weight: 600;
          }
        }

        .price-points-progress {
          margin-top: 15px;

          .price-point-status {
            padding: 12px;
            margin: 8px 0;
            border-radius: 4px;
            background: #fff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            color: #606266;
            border: 1px solid #dcdfe6;

            @media (max-width: 480px) {
              flex-direction: column;
              gap: 8px;
              text-align: center;
            }

            &.reached {
              background: #f0f9eb;
              border-color: #e1f3d8;
            }
          }
        }
      }

      .price-details {
        background: #f5f7fa;
        border-radius: 4px;
        padding: 15px;

        .detail-item {
          margin: 10px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;

          span {
            &:first-child {
              color: #606266;
            }

            &:last-child {
              color: #303133;
              font-weight: 500;
            }
          }
        }
      }
    }
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 10px;

    .notification-btn {
      font-size: 14px;
      padding: 8px 15px;
    }

    .price-change {
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 4px;
    }
  }

  .notification-settings {
    padding: 15px;

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0;
      font-size: 14px;
    }

    .webhook-input {
      margin-top: 10px;
      
      :deep(.el-input__inner) {
        font-size: 12px;
      }
    }
  }

  :deep(.el-form) {
    padding: 20px;
    height: 100%;

    .el-form-item {
      margin-bottom: 25px;

      &__label {
        font-size: 16px;
        padding-bottom: 10px;
      }
    }

    .el-input-number {
      width: 240px !important;

      @media (max-width: 1440px) {
        width: 200px !important;
      }

      @media (max-width: 768px) {
        width: 160px !important;
      }

      .el-input__inner {
        height: 40px;
        font-size: 16px;
      }
    }

    .el-button--primary {
      height: 40px;
      font-size: 16px;
      padding: 0 30px;
      min-width: 120px;
    }
  }

  .el-col {
    padding: 0 10px !important;
  }
}

@keyframes priceFlash {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}
</style>
