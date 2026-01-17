/**
 * Quantumult X - TMDB 剧集更新监控（终版）
 * 功能：
 * - 今日已更新 / 今日即将更新 / 即将更新（详细）
 * - 评分 ⭐ / 热度 🔥 / 分类
 * - 即将更新按 热度 → 评分 排序
 * - 即将更新分类速览
 */

// ========== 配置区 ==========
const TMDB_API_KEY = "92e05285c9b611b728e963fc7f3bb96b";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MmUwNTI4NWM5YjYxMWI3MjhlOTYzZmM3ZjNiYjk2YiIsIm5iZiI6MTc2ODQwMDcyMi42MTc5OTk4LCJzdWIiOiI2OTY3YTc1MmVhZjg5YzIwMmE4NjY1NDMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.crwmHTGpE_x5azP_O2lx6BaJt74Gk900XcR2A9Fvml4";

const MONITOR_SHOWS = [
  { id: 106379, name: "辐射", category: "美剧" },
  { id: 101172, name: "吞噬星空", category: "国漫" },
  { id: 67063, name: "一人之下", category: "国漫" },
  { id: 249907, name: "判处勇者刑", category: "日漫" },
  { id: 139060, name: "魔都精兵的奴隶", category: "日漫" },
  { id: 30984, name: "死神：千年血战", category: "日漫" },
  { id: 117465, name: "地狱乐", category: "日漫" }
];

const SHOW_UPCOMING_DAYS = 7;
// ========== 配置区结束 ==========

// ================= 工具函数 =================
function getTVShowInfo(id) {
  return $task.fetch({
    url: `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&language=zh-CN`,
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      Accept: "application/json"
    },
    timeout: 15000
  });
}

function normalizeShow(show, meta) {
  return {
    showName: show.name || meta.name,
    category: meta.category || "未分类",
    rating: typeof show.vote_average === "number"
      ? Number(show.vote_average.toFixed(1))
      : 0,
    popularity: Math.round(show.popularity || 0)
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateCN(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getDaysDiff(d1, d2) {
  return Math.ceil((new Date(d2) - new Date(d1)) / 86400000);
}

// ================= 主逻辑 =================
const today = new Date();
const todayStr = formatDate(today);

Promise.all(MONITOR_SHOWS.map(s => getTVShowInfo(s.id)))
  .then(responses => {

    const updates = {
      todayUpdated: [],
      todayUpcoming: [],
      futureUpdates: []
    };

    responses.forEach((resp, index) => {
      try {
        if (resp.statusCode !== 200) return;

        const show = JSON.parse(resp.body);
        const meta = MONITOR_SHOWS[index];
        const base = normalizeShow(show, meta);

        // 今日已更新
        if (show.last_air_date === todayStr && show.last_episode_to_air) {
          const ep = show.last_episode_to_air;
          updates.todayUpdated.push({
            ...base,
            season: ep.season_number,
            episode: ep.episode_number,
            episodeName: ep.name,
            airDate: ep.air_date
          });
        }

        // 今日 / 未来更新
        if (show.next_episode_to_air) {
          const ep = show.next_episode_to_air;
          const daysUntil = getDaysDiff(todayStr, ep.air_date);

          const item = {
            ...base,
            season: ep.season_number,
            episode: ep.episode_number,
            episodeName: ep.name,
            airDate: ep.air_date,
            daysUntil
          };

          if (ep.air_date === todayStr) {
            updates.todayUpcoming.push(item);
          } else if (daysUntil > 0 && daysUntil <= SHOW_UPCOMING_DAYS) {
            updates.futureUpdates.push(item);
          }
        }
      } catch (e) {
        console.log("解析失败:", e);
      }
    });

    // ===== 排序：热度 → 评分 =====
    // ===== 排序：更新日期 → 热度 → 评分 =====
updates.futureUpdates.sort((a, b) => {
  if (a.daysUntil !== b.daysUntil) {
    return a.daysUntil - b.daysUntil;   // 日期近的排前面
  }
  if (b.popularity !== a.popularity) {
    return b.popularity - a.popularity; // 同一天按热度
  }
  return b.rating - a.rating;           // 再按评分
});

    // ===== 分类分组 =====
    const grouped = {};
    updates.futureUpdates.forEach(i => {
      grouped[i.category] = grouped[i.category] || [];
      grouped[i.category].push(i);
    });

    // ================= 通知内容 =================
    let msg = "";
    let total = 0;

    if (updates.todayUpdated.length) {
      msg += "🎬 今日已更新\n";
      updates.todayUpdated.forEach(i => {
        msg += `\n【${i.showName}｜${i.category}】\n`;
        msg += `第${i.season}季 第${i.episode}集\n`;
        msg += `${i.episodeName}\n`;
        msg += `⭐ ${i.rating} ｜ 🔥 ${i.popularity}\n`;
      });
      total += updates.todayUpdated.length;
      msg += "\n";
    }

    if (updates.todayUpcoming.length) {
      msg += "⏰ 今日即将更新\n";
      updates.todayUpcoming.forEach(i => {
        msg += `\n【${i.showName}｜${i.category}】\n`;
        msg += `第${i.season}季 第${i.episode}集\n`;
        msg += `${i.episodeName}\n`;
        msg += `⭐ ${i.rating} ｜ 🔥 ${i.popularity}\n`;
      });
      total += updates.todayUpcoming.length;
      msg += "\n";
    }

    // ===== 即将更新（详细）=====
    if (updates.futureUpdates.length) {
      msg += "📅 即将更新\n";
      updates.futureUpdates.forEach(i => {
        const dayText = i.daysUntil === 1 ? "明天" : `${i.daysUntil}天后`;
        msg += `\n【${i.showName}｜${i.category}】${dayText}\n`;
        msg += `第${i.season}季 第${i.episode}集 - ${formatDateCN(i.airDate)}\n`;
        msg += `${i.episodeName}\n`;
        msg += `⭐ ${i.rating} ｜ 🔥 ${i.popularity}\n`;
      });
      msg += "\n";
    }
/*
    // ===== 分类速览 =====
    if (Object.keys(grouped).length) {
      msg += "🗂️ 分类速览\n";
      Object.keys(grouped).forEach(cat => {
        msg += `\n【${cat}】\n`;
        grouped[cat].forEach(i => {
          const dayText = i.daysUntil === 1 ? "明天" : `${i.daysUntil}天后`;
          msg += `- ${i.showName} ${dayText} · ⭐${i.rating} 🔥${i.popularity}\n`;
        });
      });
    }
*/
    if (!msg) msg = "今日暂无剧集更新 😴";

    $notify(
      total ? `📺 剧集更新（${total}集）` : "📺 剧集更新",
      formatDateCN(todayStr),
      msg.trim()
    );

    $done();
  })
  .catch(err => {
    $notify("TMDB 剧集更新", "请求失败", String(err));
    $done();
  });
