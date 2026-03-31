热映
/**
 * Quantumult X 中国热映电影脚本
 * 数据源：猫眼 H5 (i.maoyan.com)
 * 特点：包含 观众评分(⭐️)、主演阵容、上映状态
 * 适合：查看“现在国内电影院在放什么”，不仅是票房
 */

// 猫眼 H5 热映接口
const url = "https://i.maoyan.com/ajax/movieOnInfoList?token=&optimus_uuid=&optimus_risk_level=71&optimus_code=10";

const request = {
  url: url,
  headers: {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    "Host": "i.maoyan.com",
    "Referer": "https://i.maoyan.com/"
  }
};

$task.fetch(request).then(response => {
  try {
    const body = JSON.parse(response.body);

    // 1. 数据校验
    if (!body || !body.movieList || body.movieList.length === 0) {
      $notify("热映数据获取失败", "", "接口可能由于海外IP受限");
      $done();
      return;
    }

    const list = body.movieList;
    // 截取前 10 名
    const topList = list.slice(0, 10);

    let content = "";

    topList.forEach((movie, index) => {
      // 电影名
      const name = movie.nm;
      
      // 评分处理 (sc = score, 如果是 0 通常表示未出分或点映)
      let score = "";
      if (movie.sc && movie.sc > 0) {
        score = `⭐️ ${movie.sc}`;
      } else if (movie.wish > 0) {
        score = `❤️ ${movie.wish}人想看`;
      } else {
        score = "暂无评分";
      }

      // 格式化主演 (star 字段通常包含 "主演: xxx, xxx")
      // 我们稍微裁剪一下，防止太长
      let star = movie.star || "";
      if (star.length > 15) star = star.substring(0, 15) + "...";
      
      // 上映信息 (showInfo: "今天150家影院放映")
      const showInfo = movie.showInfo || "正在热映";

      // 组装文案
      // 🎬 哪吒之魔童闹海 ⭐️ 9.6
      // 🎭 主演: ...
      content += `🎬 ${name}  ${score}\n`;
      content += `   🎭 ${star}\n`;
      content += `   📅 ${showInfo}\n`;
    });

    $notify("🍿 中国正在热映", "按热度排序 Top 10", content);
    $done();

  } catch (e) {
    console.log("解析错误: " + e);
    $notify("脚本错误", "JSON解析失败", String(e));
    $done();
  }
}, reason => {
  $notify("网络请求失败", "建议配置Host规则", reason.error);
  $done();
});
