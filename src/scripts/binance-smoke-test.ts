/*
 本脚本用于本地验证：在币安测试网环境下，项目用到的主要 API 能否正常调用。
 不会提交任何密钥；请通过环境变量传入：
   BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_TESTNET=true
 可选：RUN_ORDER_TEST=true 开启下单与取消（默认关闭）。
*/

import * as dotenv from 'dotenv';
dotenv.config();

import { BinanceService } from '../services/binance-service';

type Step = {
  name: string;
  run: () => Promise<void>;
};

async function main() {
  const apiKey = process.env.BINANCE_API_KEY || '';
  const apiSecret = process.env.BINANCE_API_SECRET || '';
  const testnet = (process.env.BINANCE_TESTNET || 'true') === 'true';
  const runOrderTest = (process.env.RUN_ORDER_TEST || 'false') === 'true';

  if (!apiKey || !apiSecret) {
    console.error('❌ 缺少环境变量 BINANCE_API_KEY / BINANCE_API_SECRET');
    process.exit(1);
  }

  const svc = new BinanceService(apiKey, apiSecret, testnet);
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];

  const steps: Step[] = [
    {
      name: 'syncServerTime',
      run: () => svc.syncServerTime(),
    },
    {
      name: 'getServerTime (public)',
      run: async () => {
        const t = await svc.getServerTime();
        console.log(`  serverTime: ${t}`);
      },
    },
    {
      name: 'getExchangeInformation (public)',
      run: async () => {
        const info = await svc.getExchangeInformation();
        console.log(`  symbols: ${Array.isArray(info?.symbols) ? info.symbols.length : 0}`);
      },
    },
    {
      name: 'getAccountInfo (signed)',
      run: async () => {
        const acc = await svc.getAccountInfo();
        console.log(`  totalWalletBalance: ${acc?.totalWalletBalance}`);
      },
    },
    {
      name: 'getAllPositions (signed)',
      run: async () => {
        const ps = await svc.getAllPositions();
        console.log(`  positions: ${ps?.length ?? 0}`);
      },
    },
    {
      name: 'getOpenOrders (signed)',
      run: async () => {
        const orders = await svc.getOpenOrders();
        console.log(`  openOrders: ${orders?.length ?? 0}`);
      },
    },
    {
      name: 'setMarginType BTC CROSSED (signed, tolerant)',
      run: async () => {
        try {
          await svc.setMarginType('BTC', 'CROSSED');
          console.log('  setMarginType OK');
        } catch (e: any) {
          console.warn(`  setMarginType warning: ${e?.message || e}`);
        }
      },
    },
    {
      name: 'setLeverage BTC 5 (signed, tolerant)',
      run: async () => {
        try {
          await svc.setLeverage('BTC', 5);
          console.log('  setLeverage OK');
        } catch (e: any) {
          console.warn(`  setLeverage warning: ${e?.message || e}`);
        }
      },
    },
    {
      name: 'get24hrTicker BTC (public)',
      run: async () => {
        const t = await svc.get24hrTicker('BTC');
        const last = Array.isArray(t) ? t[0]?.lastPrice : t?.lastPrice;
        console.log(`  lastPrice: ${last ?? 'N/A'}`);
      },
    },
  ];

  if (runOrderTest) {
    steps.push(
      {
        name: 'placeOrder BTC BUY MARKET 0.001 (signed, testnet)',
        run: async () => {
          const res = await svc.placeOrder({
            symbol: 'BTC',
            side: 'BUY',
            type: 'MARKET',
            quantity: '0.001',
            leverage: 5,
          });
          console.log(`  orderId: ${res.orderId}`);
        },
      },
      {
        name: 'cancelAllOrders BTC (signed, testnet)',
        run: async () => {
          await svc.cancelAllOrders('BTC');
          console.log('  cancelAllOrders OK');
        },
      }
    );
  }

  for (const step of steps) {
    try {
      console.log(`\n▶ ${step.name}`);
      await step.run();
      results.push({ name: step.name, ok: true });
      console.log('✅ PASS');
    } catch (err: any) {
      const msg = err?.message || String(err);
      results.push({ name: step.name, ok: false, error: msg });
      console.error(`❌ FAIL: ${msg}`);
    }
  }

  // 清理连接
  try { svc.destroy(); } catch {}

  // 汇总
  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`\n=== Summary ===`);
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.error ? ' - ' + r.error : ''}`));
  console.log(`Total: ${results.length}, Pass: ${okCount}, Fail: ${failCount}`);

  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});


