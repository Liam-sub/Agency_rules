
/**
 * Quantumult X - 今日头条 Top n 新闻
 * 定时获取今日头条热榜前6条新闻
 */

const url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc";

$task.fetch({
  url: url,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.toutiao.com/"
  },
  timeout: 15000
}).then(
  resp => {
    try {
      console.log("Response status:", resp.statusCode);
      
      if (resp.statusCode !== 200) {
        $notify("今日头条新闻", "获取失败", `HTTP ${resp.statusCode}`);
        $done();
        return;
      }
      
      const data = JSON.parse(resp.body);
      console.log("Data:", JSON.stringify(data).substring(0, 200));
      
      if (!data.data || !Array.isArray(data.data)) {
        $notify("今日头条新闻", "解析失败", "数据格式错误");
        $done();
        return;
      }
      
      // 获取前n条新闻
      const topNews = data.data.slice(0, 10);
      
      let msg = "";
      topNews.forEach((item, index) => {
        const title = item.Title || item.title || "无标题";
        const hot = item.HotValue || item.hot_value || "";
        const hotText = hot ? ` 🔥${formatHot(hot)}` : "";
        msg += `${index + 1}. ${title}${hotText}\n`;
      });
      
      // 移除最后一个换行符
      msg = msg.trim();
      
      console.log("News:", msg);
      $notify("📰 今日头条 Top 10", getCurrentTime(), msg);
      
    } catch (e) {
      console.log("Parse error:", e);
      console.log("Response body:", resp.body);
      $notify("今日头条新闻", "解析错误", String(e));
    }
    $done();
  },
  err => {
    console.log("Network error:", err);
    $notify("今日头条新闻", "网络异常", String(err));
    $done();
  }
);

// 格式化热度值
function formatHot(hot) {
  if (hot >= 100000000) {
    return (hot / 100000000).toFixed(1) + "亿";
  } else if (hot >= 10000) {
    return (hot / 10000).toFixed(1) + "万";
  }
  return hot;
}

// 获取当前时间
function getCurrentTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}
