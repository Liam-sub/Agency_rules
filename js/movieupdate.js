/**
 * Quantumult X - TMDB 剧集更新监控（增强版）
 * 改写重点：优化视觉层级、增强异常容错、细化时间展示
 */

// ========== 配置区 ==========
const CONFIG = {
  API_KEY: "92e05285c9b611b728e963fc7f3bb96b",
  TOKEN: "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MmUwNTI4NWM5YjYxMWI3MjhlOTYzZmM3ZjNiYjk2YiIsIm5iZiI6MTc2ODQwMDcyMi42MTc5OTk4LCJzdWIiOiI2OTY3YTc1MmVhZjg5YzIwMmE4NjY1NDMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.crwmHTGpE_x5azP_O2lx6BaJt74Gk900XcR2A9Fvml4",
  MONITOR_DAYS: 7,
  SHOWS: [
    { id: 222766, name: "豺狼的日子", category: "🇺🇸 美剧"},
    { id: 124364, name: "梦魇绝镇", category: "🇺🇸 美剧" },
    { id: 259537, name: "剑来", category: "🇨🇳 国漫" },
    { id: 30984, name: "死神：千年血战", category: "🇯🇵 日漫" },
    { id: 207332, name: "坂本日常", category: "🇯🇵 日漫" },
    { id: 207468, name: "怪兽8号", category: "🇯🇵 日漫" },
    { id: 126485, name: "超异能族", category: "🇰🇷 韩剧" }
    // ... 可根据需要继续添加
  ]
};

// ================= 工具函数 =================
const API = {
  fetchShow: (id) => {
    return $task.fetch({
      url: `https://api.themoviedb.org/3/tv/${id}?api_key=${CONFIG.API_KEY}&language=zh-CN`,
      headers: { Authorization: `Bearer ${CONFIG.TOKEN}` },
      timeout: 10000
    });
  }
};

const Utils = {
  formatDate: (d) => d.toISOString().split('T')[0],
  getRelativeTime: (targetStr) => {
    const diff = Math.ceil((new Date(targetStr) - new Date(Utils.formatDate(new Date()))) / 86400000);
    if (diff === 0) return "今天";
    if (diff === 1) return "明天";
    if (diff === 2) return "后天";
    return `${diff}天后`;
  },
  getWeekDay: (dateStr) => {
    const weeks = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return weeks[new Date(dateStr).getDay()];
  }
};

// ================= 主逻辑 =================
async function main() {
  const todayStr = Utils.formatDate(new Date());
  const results = { aired: [], upcoming: [] };

  const requests = CONFIG.SHOWS.map(s => API.fetchShow(s.id));
  const responses = await Promise.all(requests);

  responses.forEach((resp, idx) => {
    if (resp.statusCode !== 200) return;
    const data = JSON.parse(resp.body);
    const meta = CONFIG.SHOWS[idx];
    
    const baseInfo = {
      name: data.name || meta.name,
      category: meta.category,
      rating: data.vote_average ? data.vote_average.toFixed(1) : "N/A",
      pop: Math.round(data.popularity)
    };

    // 检查今日已播
    if (data.last_air_date === todayStr && data.last_episode_to_air) {
      results.aired.push({ ...baseInfo, ep: data.last_episode_to_air });
    }

    // 检查未来预告
    if (data.next_episode_to_air) {
      const next = data.next_episode_to_air;
      const diff = Math.ceil((new Date(next.air_date) - new Date(todayStr)) / 86400000);
      if (diff >= 0 && diff <= CONFIG.MONITOR_DAYS) {
        results.upcoming.push({ ...baseInfo, ep: next, diff });
      }
    }
  });

  // 排序：日期升序 > 热度降序
  results.upcoming.sort((a, b) => a.diff - b.diff || b.pop - a.pop);

  render(results);
}

// ================= 渲染函数 =================
function render(data) {
  let content = "";
  let totalToday = data.aired.length;

  // 1. 今日已更新项
  if (data.aired.length > 0) {
    content += "✅ 【今日已更新】\n";
    data.aired.forEach(i => {
      content += `• ${i.name} [S${i.ep.season_number}E${i.ep.episode_number}]\n`;
      content += `  └ ⭐${i.rating}  🔥${i.pop}  📌${i.category}\n`;
    });
    content += "\n";
  }

  // 2. 即将到来项
  if (data.upcoming.length > 0) {
    content += "⏳ 【近期更新预告】\n";
    data.upcoming.forEach(i => {
      const timeTag = Utils.getRelativeTime(i.ep.air_date);
      const weekTag = Utils.getWeekDay(i.ep.air_date);
      content += `• ${i.name} (${timeTag}/${weekTag})\n`;
      content += `  └ S${i.ep.season_number}E${i.ep.episode_number} - ${i.ep.name || '暂无标题'}\n`;
      content += `  └ ⭐${i.rating}  🔥${i.pop}  📌${i.category}\n`;
    });
  }

  if (!content) content = "☕ 暂无剧集更新资讯";

  $notify(
    totalToday ? `📺 剧集管家 (今日+${totalToday})` : "📺 剧集管家",
    `📅 ${new Date().toLocaleDateString('zh-CN')} ${Utils.getWeekDay(new Date())}`,
    content.trim()
  );
  $done();
}

// 执行脚本
main().catch(e => {
  console.log(e);
  $notify("TMDB 脚本错误", "", String(e));
  $done();
});
