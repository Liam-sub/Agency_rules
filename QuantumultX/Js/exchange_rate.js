每日汇率

/**
 * Quantumult X 每日汇率
 */
const url = "https://api.frankfurter.app/latest?from=CNY&to=USD,EUR,GBP,JPY,KRW,HKD";

$task.fetch({
  url: url,
  timeout: 10000
}).then(
  resp => {
    try {
      console.log("Response:", resp.body);
      const data = JSON.parse(resp.body);
      const r = data.rates;
      
      // 当 base=CNY 时，rates 中的值表示：1 CNY = X 外币
      // 所以要得到 1 外币 = Y CNY，需要用 1/X
      const usd2cny = (1 / r.USD).toFixed(4);
      const eur2cny = (1 / r.EUR).toFixed(4);
      const gbp2cny = (1 / r.GBP).toFixed(4);
      
      // CNY 到其他货币直接用 rates 的值
      const cny2jpy = r.JPY.toFixed(2);
      const cny2krw = r.KRW.toFixed(2);
      const cny2hkd = r.HKD.toFixed(4);
      
      const msg =
        `💱 ${data.date}\n` +
        `🇺🇸 1 USD = ${usd2cny} 🇨🇳 CNY\n` +
        `🇪🇺 1 EUR = ${eur2cny} 🇨🇳 CNY\n` +
        `🇬🇧 1 GBP = ${gbp2cny} 🇨🇳 CNY\n` +
        `🇨🇳 1 CNY = ${cny2jpy} 🇯🇵 JPY\n` +
        `🇨🇳 1 CNY = ${cny2krw} 🇰🇷 KRW\n` +
        `🇨🇳 1 CNY = ${cny2hkd} 🇭🇰 HKD`;
      
      console.log(msg);
      $notify("💱 今日汇率", "ECB 官方数据", msg);
    } catch (e) {
      console.log("Parse error:", e, resp.body);
      $notify("汇率获取失败", "解析错误", String(e));
    }
    $done();
  },
  err => {
    console.log("Network error:", err);
    $notify("汇率获取失败", "网络异常", String(err));
    $done();
  }
);
