# Auto-Refollow 手工平仓支持

## 功能概述

`--auto-refollow` 选项现在支持两种自动重新跟单场景：

1. **盈利目标退出后重新跟单**（现有功能）
   - 当仓位达到设定的盈利目标（`--profit`）时自动平仓
   - 系统重置该币种的订单历史
   - 当 NOF1 再次开仓时，自动跟随

2. **手工平仓后重新跟单**（新功能）
   - 检测用户在币安 App 手工平仓的情况
   - 自动重置该币种的订单历史
   - 当 NOF1 再次开仓时，自动跟随

## 工作原理

### 手工平仓检测机制

系统通过比较两个数据源来检测手工平仓：

1. **NOF1 API 数据**：显示 AI Agent 的持仓状态
2. **币安实际仓位**：通过币安 API 获取真实仓位

**检测逻辑**：
- 如果 NOF1 显示有仓位（`quantity != 0`，`entry_oid` 未变）
- 但币安实际没有该币种的仓位
- 系统判定为手工平仓

### 自动处理流程

当检测到手工平仓时：

1. **记录事件**：在 `order-history.json` 中添加手工平仓记录
   ```json
   {
     "manualCloses": [
       {
         "symbol": "BTC",
         "entryOid": 12345,
         "detectedAt": 1234567890,
         "reason": "Manual closure detected - NOF1 shows position but Binance has none",
         "timestamp": 1234567890
       }
     ]
   }
   ```

2. **重置订单历史**：清除该币种对应的 `processedOrders` 记录
   - 允许系统重新跟随该币种的新仓位
   - 避免因 OID 未变而跳过跟单

3. **等待重新跟单**：在下次轮询时
   - 如果 NOF1 仍持有该仓位（OID 未变），系统会检测为新仓位
   - 如果 NOF1 开了新仓位（OID 改变），系统正常跟随

## 使用方式

### 基本用法

```bash
# 启用 auto-refollow，同时支持盈利退出和手工平仓的重新跟单
npm start -- follow deepseek-chat-v3.1 --auto-refollow

# 结合盈利目标使用
npm start -- follow gpt-5 --profit 30 --auto-refollow
```

### 配置说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--auto-refollow` | 启用自动重新跟单（盈利退出 + 手工平仓） | 关闭 |
| `--profit <percentage>` | 设置盈利目标百分比 | 无 |

### 使用场景

#### 场景 1：只检测手工平仓

```bash
npm start -- follow deepseek-chat-v3.1 --auto-refollow
```

- 不设置盈利目标
- 只检测手工平仓情况
- 手工平仓后自动重置，允许重新跟单

#### 场景 2：盈利目标 + 手工平仓

```bash
npm start -- follow gpt-5 --profit 30 --auto-refollow
```

- 达到 30% 盈利时自动平仓并重置
- 同时检测手工平仓情况
- 两种情况都会自动重新跟单

#### 场景 3：不启用 auto-refollow

```bash
npm start -- follow deepseek-chat-v3.1 --profit 30
```

- 达到盈利目标时平仓
- 但不会重置订单历史
- 不会重新跟单该币种

## 日志示例

### 启动时的日志

```
🤖 Following agent: deepseek-chat-v3.1
🚪 Auto-refollow enabled: will detect manual closures and allow refollowing
```

或者（如果设置了盈利目标）：

```
🤖 Following agent: gpt-5
🎯 Profit target enabled: 30%
🚪 Auto-refollow enabled: will reset order status after profit target exit or manual closure
```

### 检测到手工平仓时的日志

```
🔧 Detected 1 manual closure(s)
🔧 Detected manual closure: BTC (OID: 12345)
   📊 NOF1 shows position: 0.5 @ $50000
   📊 Binance has no position for BTCUSDT
🔧 Handling manual closure for BTC
🔧 Recorded manual close: BTC (OID: 12345) - Manual closure detected - NOF1 shows position but Binance has none
🔄 Auto-refollow enabled: Resetting order status for BTC
🔄 Reset order status for BTC: removed 1 processed order(s)
📝 Note: BTC will be refollowed when NOF1 opens a new position
```

### 重新跟单时的日志

```
📈 NEW POSITION: BTC BUY 0.5 @ 51000 (OID: 12346)
💰 Price Check: Entry $51000 vs Current $51050 - Acceptable
```

## 数据结构

### order-history.json 新增字段

```json
{
  "processedOrders": [...],
  "profitExits": [...],
  "manualCloses": [
    {
      "symbol": "BTC",
      "entryOid": 12345,
      "detectedAt": 1730000000000,
      "reason": "Manual closure detected - NOF1 shows position but Binance has none",
      "timestamp": 1730000000000
    }
  ],
  "lastUpdated": 1730000000000,
  "createdAt": 1729000000000
}
```

## 技术实现

### 新增接口

#### ManualCloseRecord

```typescript
export interface ManualCloseRecord {
  symbol: string;
  entryOid: number;
  detectedAt: number;
  reason: string;
  timestamp: number;
}
```

### 新增方法

#### OrderHistoryManager

- `addManualCloseRecord(record)`: 添加手工平仓记录
- `hasManualCloseRecord(entryOid, symbol)`: 检查是否有手工平仓记录
- `getManualCloseRecords()`: 获取所有手工平仓记录
- `getManualCloseRecordsBySymbol(symbol)`: 获取特定币种的手工平仓记录

#### FollowService

- `detectManualClosure(currentPositions, previousPositions, options)`: 检测手工平仓
- `handleManualClosure(change, agentId, options)`: 处理手工平仓事件

### 检测时机

手工平仓检测在每次轮询时执行：

1. 重建上次仓位状态（从 `order-history.json`）
2. 检测常规仓位变化（OID 变化、新仓位等）
3. **检测手工平仓**（仅在启用 `--auto-refollow` 时）
4. 处理所有检测到的变化

## 注意事项

### 1. 检测延迟

- 手工平仓检测在下一次轮询时触发
- 默认轮询间隔为 30 秒（可通过 `--interval` 调整）
- 建议保持默认间隔，避免过于频繁的 API 调用

### 2. 误检测情况

系统可能在以下情况下误判为手工平仓：

- **网络延迟**：币安 API 响应延迟导致数据不同步
- **API 错误**：临时性的 API 错误
- **系统时差**：NOF1 和币安数据更新时间差

**缓解措施**：
- 系统使用 `try-catch` 捕获 API 错误
- 只在确认币安无仓位时才判定为手工平仓
- 记录详细日志便于追溯

### 3. 与现有功能的兼容性

- ✅ 与盈利目标（`--profit`）完全兼容
- ✅ 与资金分配（`--total-margin`, `--fixed-amount`）完全兼容
- ✅ 与保证金模式（`--margin-type`）完全兼容
- ✅ 不影响现有的仓位跟踪逻辑

### 4. 数据持久化

- 所有手工平仓记录保存在 `order-history.json`
- 程序重启后数据不会丢失
- 可以手动编辑该文件进行调试

## 故障排除

### 问题 1：手工平仓后没有重新跟单

**可能原因**：
- 未启用 `--auto-refollow` 选项
- NOF1 的 OID 没有变化，系统认为是同一个仓位

**解决方案**：
```bash
# 确保启用 auto-refollow
npm start -- follow <agent> --auto-refollow

# 检查日志确认检测到手工平仓
# 应该看到 "🔧 Detected manual closure" 日志
```

### 问题 2：频繁误检测手工平仓

**可能原因**：
- 网络不稳定
- API 响应延迟

**解决方案**：
```bash
# 增加轮询间隔
npm start -- follow <agent> --auto-refollow --interval 60

# 检查网络连接
# 查看是否有 API 错误日志
```

### 问题 3：手工平仓记录过多

**解决方案**：
```bash
# 手动清理 order-history.json 中的 manualCloses 数组
# 或者删除整个文件重新开始

rm data/order-history.json
```

## 最佳实践

1. **始终启用 auto-refollow**
   ```bash
   npm start -- follow <agent> --auto-refollow
   ```

2. **结合盈利目标使用**
   ```bash
   npm start -- follow <agent> --profit 30 --auto-refollow
   ```

3. **定期检查日志**
   - 确认手工平仓检测正常工作
   - 查看是否有误检测

4. **备份 order-history.json**
   - 定期备份历史数据
   - 便于问题排查和数据恢复

5. **监控系统行为**
   - 观察重新跟单是否符合预期
   - 调整轮询间隔和盈利目标

## 总结

`--auto-refollow` 选项现在提供了更完整的自动跟单体验：

- ✅ 自动处理盈利目标退出
- ✅ 自动检测手工平仓
- ✅ 自动重置订单历史
- ✅ 自动重新跟单

这使得系统能够更灵活地应对各种交易场景，无论是程序自动平仓还是用户手工干预，都能保持跟单的连续性。
