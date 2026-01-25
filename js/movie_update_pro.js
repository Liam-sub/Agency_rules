/**
 * TMDB 剧集更新 - Surge / Egern 模块面板脚本
 */

// ===== 配置区 =====
const TMDB_API_KEY = "92e05285c9b611b728e963fc7f3bb96b";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MmUwNTI4NWM5YjYxMWI3MjhlOTYzZmM3ZjNiYjk2YiIsIm5iZiI6MTc2ODQwMDcyMi42MTc5OTk4LCJzdWIiOiI2OTY3YTc1MmVhZjg5YzIwMmE4NjY1NDMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.crwmHTGpE_x5azP_O2lx6BaJt74Gk900XcR2A9Fvml4";

const SHOW_UPCOMING_DAYS = 7;

const MONITOR_SHOWS = [
  { id: 222766, name: "豺狼的日子", category: "美剧"},
  { id: 224372, name: "七王国的骑士", category: "美剧"},
  { id: 106379, name: "辐射", category: "美剧" },
  
  { id: 101172, name: "吞噬星空", category: "国漫" },
  { id: 67063, name: "一人之下", category: "国漫" },

  { id: 30984, name: "死神：千年血战", category: "日漫" },
  { id: 249907, name: "判处勇者刑 刑罚勇者9004队服刑记录", category: "日漫" },
  { id: 139060, name: "魔都精兵的奴隶", category: "日漫" },
  { id: 117465, name: "地狱乐", category: "日漫" },
  { id: 209867, name: "葬送的芙莉莲",category: "日漫"},
  { id: 282810, name: "法官李汉英",category: "韩剧"}
];

// ===== 工具函数 =====
function httpGet(url) {
  return new Promise((resolve, reject) => {
    $httpClient.get({
      url,
      headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`,
        Accept: "application/json"
      }
    }, (err, resp, body) => {
      if (err) reject(err);
      else resolve(JSON.parse(body));
    });
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysDiff(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

// ===== 主逻辑 =====
(async () => {
  try {
    const today = todayStr();
    const future = [];

    for (const s of MONITOR_SHOWS) {
      const show = await httpGet(
        `https://api.themoviedb.org/3/tv/${s.id}?api_key=${TMDB_API_KEY}&language=zh-CN`
      );

      if (!show.next_episode_to_air) continue;

      const ep = show.next_episode_to_air;
      const diff = daysDiff(today, ep.air_date);

      if (diff > 0 && diff <= SHOW_UPCOMING_DAYS) {
        future.push({
          name: s.name,
          days: diff,
          rating: show.vote_average?.toFixed(1) || "0.0",
          hot: Math.round(show.popularity || 0)
        });
      }
    }

    future.sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days;
      if (b.hot !== a.hot) return b.hot - a.hot;
      return b.rating - a.rating;
    });

    let content = "";

    if (!future.length) {
      content = "未来 7 天暂无更新";
    } else {
      future.forEach(i => {
        const d = i.days === 1 ? "明天" : `${i.days}天后`;
        content += `• ${i.name} ${d} · ⭐${i.rating} 🔥${i.hot}\n`;
      });
    }

    $done({
      title: "📺 TMDB 剧集更新",
      content: content.trim()
    });

  } catch (e) {
    $done({
      title: "📺 TMDB 剧集更新",
      content: "加载失败"
    });
  }
})();
