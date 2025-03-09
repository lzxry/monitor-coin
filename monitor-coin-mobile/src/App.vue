isReached(targetPrice: string, currentPrice: number, lastPrice: number): boolean {
  if (targetPrice === '0') return false;
  const target = parseFloat(targetPrice);
  
  // 检查是否是上穿或下穿
  const isUpwardCross = lastPrice < target && currentPrice >= target;
  const isDownwardCross = lastPrice > target && currentPrice <= target;
  
  return isUpwardCross || isDownwardCross;
}

<template>
  <div class="app-container">
    <!-- 测试按钮移到最上方 -->
    <div class="test-button-container" style="margin: 10px 0; text-align: center;">
      <van-button type="warning" @click="testNotifications">测试通知效果</van-button>
    </div>

    <div class="threshold-prices">
      <div v-for="(price, index) in prices" :key="index" class="threshold-price">
        <span>{{ index + 1 }}</span>
        <span :class="{ 'reached': isReached(price, currentPrice, lastPrice) }">{{ price }}</span>
      </div>
    </div>
    
    <van-cell-group>
      <van-field v-model="savedThresholds.price3" type="digit" label="价格点3" placeholder="请输入预警价格" />
    </van-cell-group>

    <van-cell-group>
      <van-cell title="启用价格波动通知" center>
        <template #right-icon>
          <van-switch v-model="savedThresholds.enableNotification" />
        </template>
      </van-cell>
      
      <!-- 添加测试按钮 -->
      <van-cell>
        <template #title>
          <div style="text-align: center;">
            <van-button type="warning" size="small" @click="testNotifications">测试通知效果</van-button>
          </div>
        </template>
      </van-cell>

      <van-cell title="背景闪烁提醒" center>
        <template #right-icon>
          <van-switch v-model="savedThresholds.enableFlashBackground" />
        </template>
      </van-cell>
    </van-cell-group>

    <van-button class="save-button" type="primary" block @click="saveSettings">保存设置</van-button>
  </div>
</template>

<script setup lang="ts">
// 测试通知效果的方法
const testNotifications = () => {
  // 测试背景闪烁
  if (savedThresholds.value.enableFlashBackground) {
    isFlashing.value = true;
    setTimeout(() => {
      isFlashing.value = false;
    }, 3000);
  }

  // 测试声音提醒
  if (savedThresholds.value.enableSound) {
    playAlertSound();
  }

  // 测试震动提醒
  if (savedThresholds.value.enableVibration) {
    navigator.vibrate?.(1000);
  }

  // 显示测试通知
  Dialog.alert({
    title: '测试通知',
    message: '这是一条测试通知，用于验证通知效果。\n\n已触发：\n- 背景闪烁\n- 声音提醒\n- 震动提醒',
  });
};

const saveSettings = () => {
  localStorage.setItem('thresholds', JSON.stringify(savedThresholds.value));
  showToast('设置已保存');
};
</script> 