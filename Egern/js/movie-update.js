/**
 * TMDB Tracker for Egern - 全面修复版
 */

class TMDBTracker {
  constructor() {
    // 关键修复：兼容部分 Egern 版本可能通过 $argument 传参
    const env = (typeof $env !== "undefined") ? $env : (typeof $argument !== "undefined" ? $argument : {});
    
    this.token = env.TMDB_TOKEN;
    this.days = parseInt(env.UPCOMING_DAYS || 7);
    this.rawList = env.SHOWS_LIST || "";
    
    // 关键修复：处理北京时间 (UTC+8)
    const now = new Date();
    const offset = 8 * 60 * 60 * 1000; 
    this.todayStr = new Date(now.getTime() + offset).toISOString().slice(0, 10);
  }

  parseShows() {
    if (!this.rawList) return [];
    return this.rawList.split(',').map(item => {
      const parts = item.trim().split(':');
      return { id: parts[0].trim(), category: parts[1] || "剧集" };
    }).filter(i => i.id);
  }

  async fetch(endpoint) {
    return new Promise(resolve => {
      const url = `https://api.themoviedb.org/3/${endpoint}?language=zh-CN`;
      $httpClient.get({
        url,
        headers: { 
          "Authorization": `Bearer ${this.token}`,
          "Accept": "application/json"
        },
        timeout: 10000
      }, (err, resp, body) => {
        if (err || !body || (resp && resp.status !== 200)) {
          console.log(`Fetch Error: ${endpoint} - ${err || 'Status:' + resp.status}`);
          resolve(null);
        } else {
          try { resolve(JSON.parse(body)); } catch(e) { resolve(null); }
        }
      });
    });
  }

  async run() {
    // 1. 检查 Token
    if (!this.token || this.token.length < 50) {
      return this.finish("❌ 请在模块配置中填写正确的 TMDB_TOKEN");
    }

    // 2. 检查列表
    const shows = this.parseShows();
    if (shows.length === 0) {
      return this.finish("⚠️ 剧集列表为空，请检查 SHOWS_LIST 格式");
    }

    const todayUpdated = [];
    const future = [];

    // 3. 执行并发请求
    const tasks = shows.map(async (meta) => {
      const show = await this.fetch(`tv/${meta.id}`);
      if (!show) return;

      const base = {
        name: show.name,
        category: meta.category,
        rating: (show.vote_average || 0).toFixed(1)
      };

      // 检查今日更新
      if (show.last_air_date === this.todayStr) {
        todayUpdated.push(base);
      }

      // 检查即将更新
      if (show.next_episode_to_air) {
        const airDate = show.next_episode_to_air.air_date;
        const diff = Math.ceil((new Date(airDate) - new Date(this.todayStr)) / 86400000);
        if (diff > 0 && diff <= this.days) {
          future.push({ ...base, diff, airDate, ...show.next_episode_to_air });
        }
      }
    });

    await Promise.all(tasks);

    // 4. 渲染输出
    this.render(todayUpdated, future.sort((a, b) => a.diff - b.diff));
  }

  render(today, upcoming) {
    let content = "";
    if (today.length > 0) {
      content += "🎬 今日更新\n" + today.map(i => `【${i.name}】⭐${i.rating}`).join('\n') + "\n\n";
    }
    if (upcoming.length > 0) {
      content += "📅 即将更新\n" + upcoming.map(i => {
        const t = i.diff === 1 ? "明天" : `${i.diff}天后`;
        return `【${i.name}】${t} (S${i.season_number}E${i.episode_number})`;
      }).join('\n');
    }

    this.finish(content || "近期暂无剧集更新 😴");
  }

  finish(content) {
    $done({
      title: "📺 TMDB 追剧助手",
      content: content.trim(),
      icon: "tv.fill",
      "icon-color": "#00BBFF"
    });
  }
}

// 确保执行
new TMDBTracker().run().catch(e => {
  console.log(e);
  $done({ title: "脚本崩溃", content: e.message });
});
