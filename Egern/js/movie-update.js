class TMDBTracker {
  constructor(options = {}) {
    this.token = options.TMDB_TOKEN;
    this.upcomingDays = parseInt(options.UPCOMING_DAYS || 7);
    this.shows = JSON.parse(options.SHOWS_JSON || "[]");
    
    this.onUpdate = options.onUpdate || (() => {});
  }

  // 模拟 Egern 的 httpGet 逻辑，兼容类写法
  async fetchTMDB(endpoint) {
    return new Promise(resolve => {
      const url = `https://api.themoviedb.org/3/${endpoint}?language=zh-CN`;
      $httpClient.get({
        url,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" }
      }, (err, resp, body) => {
        if (err || !body) resolve(null);
        else resolve(JSON.parse(body));
      });
    });
  }

  async start() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayUpdated = [];
    const future = [];

    // 并行抓取所有剧集数据
    const tasks = this.shows.map(async (meta) => {
      const show = await this.fetchTMDB(`tv/${meta.id}`);
      if (!show) return;

      const base = {
        name: show.name || meta.name,
        category: meta.category,
        rating: show.vote_average ? show.vote_average.toFixed(1) : "0.0",
        popularity: Math.round(show.popularity || 0)
      };

      // 判断今日更新
      if (show.last_air_date === todayStr && show.last_episode_to_air) {
        const e = show.last_episode_to_air;
        todayUpdated.push({ ...base, s: e.season_number, e: e.episode_number });
      }

      // 判断即将更新
      if (show.next_episode_to_air) {
        const e = show.next_episode_to_air;
        const diff = Math.ceil((new Date(e.air_date) - new Date(todayStr)) / 86400000);
        if (diff > 0 && diff <= this.upcomingDays) {
          future.push({ ...base, s: e.season_number, e: e.episode_number, d: diff, ad: e.air_date });
        }
      }
    });

    await Promise.all(tasks);
    future.sort((a, b) => a.d - b.d);

    // 格式化输出内容
    const content = this.formatContent(todayUpdated, future);
    
    // 最终调用 Egern 的 $done
    $done({
      title: "📺 TMDB 追剧",
      content: content,
      icon: "tv",
      "icon-color": "#ff9500"
    });
  }

  formatContent(todayUpdated, future) {
    let lines = [];
    if (todayUpdated.length) {
      lines.push("🎬 今日已更新");
      todayUpdated.forEach(i => lines.push(`【${i.name}】S${i.s}E${i.e} ⭐${i.rating}`));
      lines.push("");
    }
    if (future.length) {
      lines.push("📅 即将更新");
      future.forEach(i => {
        const t = i.d === 1 ? "明天" : `${i.d}天后`;
        lines.push(`【${i.name}】${t} (S${i.s}E${i.e})`);
      });
    }
    return lines.length ? lines.join("\n") : "近期暂无更新 😴";
  }
}

// 自动执行
const tracker = new TMDBTracker($argument || {}); // $argument 获取 YAML 中的 env_schema
tracker.start();
