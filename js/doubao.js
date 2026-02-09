/*
Quantumult X - 豆包去水印
支持：
- 图片
- 视频
*/

let body = $response.body;

function findUrl(obj) {
  if (typeof obj !== "object" || obj === null) return null;

  for (let key in obj) {
    const value = obj[key];

    // 常见原图字段
    if (
      typeof value === "string" &&
      (value.includes("origin") ||
        value.includes("raw") ||
        value.includes(".png") ||
        value.includes(".jpg") ||
        value.includes(".mp4"))
    ) {
      return value;
    }

    if (typeof value === "object") {
      const result = findUrl(value);
      if (result) return result;
    }
  }
  return null;
}

try {
  const json = JSON.parse(body);
  const url = findUrl(json);

  if (url) {
    $notify("豆包去水印成功", "点击打开原始资源", url);
  } else {
    $notify("豆包解析失败", "未找到原始地址", "");
  }
} catch (e) {
  $notify("豆包脚本错误", "", String(e));
}

$done({});