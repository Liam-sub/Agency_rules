/************************
 多机场订阅抓取（参数驱动）
************************/

const args = $argument || "";

function arg(k) {
  const m = args.match(new RegExp(`${k}=([^&]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function bytesToGB(b) {
  return (b / 1024 / 1024 / 1024).toFixed(2);
}

function tsToDate(ts) {
  return ts ? new Date(ts * 1000).toLocaleDateString() : "-";
}

// 解析机场列表
let airports = [];
for (let i = 1; i <= 10; i++) {
  const name = arg(`airport${i}_name`);
  const url = arg(`airport${i}_url`);
  if (name && url) {
    airports.push({ name, url });
  }
}

if (airports.length === 0) {
  $done();
}

let results = [];
let finished = 0;

airports.forEach(a => {
  $httpClient.get(a.url, (err, resp) => {
    finished++;

    if (!err && resp && resp.headers) {
      const info =
        resp.headers["subscription-userinfo"] ||
        resp.headers["Subscription-Userinfo"];

      if (info) {
        const data = {};
        info.split(";").forEach(p => {
          const [k, v] = p.trim().split("=");
          data[k] = Number(v);
        });

        const used = data.upload + data.download;
        const total = data.total;

        results.push({
          name: a.name,
          used,
          total,
          percent: ((used / total) * 100).toFixed(1),
          expire: tsToDate(data.expire)
        });
      }
    }

    // 全部结束后写缓存
    if (finished === airports.length) {
      $persistentStore.write(
        JSON.stringify(results),
        "AIRPORT_PANEL_DATA"
      );
      $done();
    }
  });
});